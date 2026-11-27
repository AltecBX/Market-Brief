/* Intraday engine v2: instrument specific models for the daily high and low, the close vs now and remaining moves.
   Compares historical frequency, time and position benchmarks, nearest neighbours, L2 logistic regression,
   gradient boosted trees and a random forest on chronologically separated sessions, with session block bootstrap
   confidence intervals, calibration, regime splits and economic value. Also tests whether models trained on cash
   bars transfer to the perpetual futures the page sees live. Writes data/research/intraday2.json and models.json. */
const fs = require('fs'), path = require('path'), CORE = require('../src/core.js'), ML = require('./ml.js');
const D = path.join(__dirname, '..', 'data');
const SYMS = (process.env.SYMS || 'SPY,QQQ,SMH,NVDA,MU,AMD,SNDK').split(','), REF = { SPY: 'SMH', QQQ: 'SMH', SMH: 'SPY', NVDA: 'SMH', MU: 'SMH', AMD: 'SMH', SNDK: 'SMH' };
const PERP = { SPY: 'xyz:SP500', QQQ: 'xyz:XYZ100', SMH: 'xyz:SMH', NVDA: 'xyz:NVDA', MU: 'xyz:MU', AMD: 'xyz:AMD', SNDK: 'xyz:SNDK' };
const WIN = { early: { res: 5, full: 78, ks: [1, 2, 3, 6] }, late: { res: 30, full: 13, ks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } };
const OUTS = ['highDone', 'lowDone', 'closeAbove'];
const SPECS = { tod: [{ m: 'tod' }], pos: [{ m: 'pos', a: 10 }], cond: [{ m: 'cond', a: 5 }, { m: 'cond', a: 20 }], knn: [{ m: 'knn', k: 20 }, { m: 'knn', k: 50 }],
  logit: [{ m: 'logit', lambda: 1 }, { m: 'logit', lambda: 10 }, { m: 'logit', lambda: 100 }], gbt: [{ m: 'gbt', depth: 2, n: 80, lr: 0.05 }, { m: 'gbt', depth: 3, n: 60, lr: 0.1 }],
  rf: [{ m: 'rf', depth: 4, n: 60, mtry: 5 }, { m: 'rf', depth: 6, n: 60, mtry: 5 }] };
const FAMN = { tod: 'Time of day frequency', pos: 'Time and price position frequency', cond: 'Historical conditional frequency', knn: 'Nearest neighbours', logit: 'Regularized logistic regression', gbt: 'Gradient boosted trees', rf: 'Random forest' };
const BENCH = ['tod', 'pos'];
const ONAME = { highDone: 'Daily high already set', lowDone: 'Daily low already set', closeAbove: 'Closes above the current price' };

function readJ(p) { return JSON.parse(fs.readFileSync(p)) }
function daily(sym) { const j = readJ(path.join(D, 'hist', sym + '.json')); return j.rows }
function hm2min(hm) { return Math.floor(hm / 100) * 60 + hm % 100 }
function dow(d) { const s = String(d); return (new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))).getUTCDay() + 6) % 7 }
function ymd(s) { return +s.replace(/-/g, '') }

function context() {
  const earn = readJ(path.join(D, 'hist', 'earnings.json')).dates, E = {}; Object.keys(earn).forEach(s => { E[s] = earn[s].map(x => [ymd(x[0]), x[1]]) });
  return { vix: daily('VIX'), rsp: daily('RSP'), spy: daily('SPY'), E };
}
function dayCtx(sym, dly, C, d) { return CORE.iDayCtx(dly, C.vix, C.rsp, C.spy, C.E[sym] || [], d) }
function sessions(sym, res, full) {
  const p = path.join(D, 'intraday', sym + res + '.json'); if (!fs.existsSync(p)) return [];
  const by = {}; readJ(p).rows.forEach(r => (by[r[0]] = by[r[0]] || []).push([r[1], r[2], r[3], r[4], r[5], r[6]]));
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(d => ({ d, b: by[d].sort((x, y) => x[0] - y[0]) })).filter(s => s.b.length === full && s.b[0][0] === 930);
}
function build(sym, w, C) {
  const W = WIN[w], dly = daily(sym), S = sessions(sym, W.res, W.full), R = {}; sessions(REF[sym], W.res, W.full).forEach(s => { R[s.d] = s.b });
  const out = [];
  S.forEach((s, i) => {
    const SS = CORE.iSession({ bars: s.b, ref: R[s.d] || null, res: W.res, d: s.d, dly, vix: C.vix, rsp: C.rsp, spy: C.spy, earn: C.E[sym] || [], prior: S.slice(0, i).filter(q => q.d < s.d).map(q => q.b), src: 'cash' }); if (!SS) return;
    W.ks.forEach(k => { const o = CORE.iout(SS, k); if (!o) return; out.push({ d: s.d, k, x: CORE.ifeat(SS, k), o, vix: SS.vix, gap: (s.b[0][1] / SS.prev - 1) * 100 }) });
  });
  return out;
}

function brier(p, y) { let s = 0; p.forEach((v, i) => { s += (v - y[i]) * (v - y[i]) }); return s / p.length }
function logloss(p, y) { let s = 0; p.forEach((v, i) => { const q = Math.min(1 - 1e-4, Math.max(1e-4, v)); s -= y[i] ? Math.log(q) : Math.log(1 - q) }); return s / p.length }
function ece(p, y) { const B = []; for (let i = 0; i < 10; i++) B.push([0, 0, 0]); p.forEach((v, i) => { const b = B[Math.min(9, Math.floor(v * 10))]; b[0] += v; b[1] += y[i]; b[2]++ }); let e = 0; B.forEach(b => { if (b[2]) e += Math.abs(b[0] - b[1]) / p.length }); return e }
function reliability(p, y) { const B = []; for (let i = 0; i < 5; i++) B.push([0, 0, 0]); p.forEach((v, i) => { const b = B[Math.min(4, Math.floor(v * 5))]; b[0] += v; b[1] += y[i]; b[2]++ }); return B.filter(b => b[2] >= 10).map(b => [+(b[0] / b[2]).toFixed(3), +(b[1] / b[2]).toFixed(3), b[2]]) }

/* Walk forward over a block of sessions: refit on every session before each 10 session block */
function walk(rows, dates, from, to, spec, oname) {
  const pred = [];
  for (let a = from; a < to; a += 10) {
    const b = Math.min(to, a + 10), cut = dates[a], end = dates[b - 1];
    const tr = rows.filter(r => r.d < cut), te = rows.filter(r => r.d >= cut && r.d <= end);
    if (tr.length < 50 || !te.length) continue;
    const M = ML.fit(spec, tr.map(r => r.x), tr.map(r => r.o[oname]));
    te.forEach(r => pred.push([r, CORE.mlPredict(M, r.x)]));
  }
  return pred;
}
function econ(oname, P, thr) {
  const byK = {}; P.forEach(z => { const r = z[0], a = byK[r.k] || (byK[r.k] = [0, 0, 0, 0]); a[0] += r.o.remUp; a[1] += r.o.remDn; a[2]++ });
  const mk = k => ({ up: byK[k][0] / byK[k][2], dn: byK[k][1] / byK[k][2] });
  if (oname === 'highDone') return z => z[1] >= thr ? mk(z[0].k).up - z[0].o.remUp : null;
  if (oname === 'lowDone') return z => z[1] >= thr ? z[0].o.remDn - mk(z[0].k).dn : null;
  return z => z[1] >= 0.6 ? z[0].o.retClose - 0.02 : z[1] <= 0.4 ? -z[0].o.retClose - 0.02 : null;
}
function evaluate(P, Pb, oname, vixMed) {
  const y = P.map(z => z[0].o[oname]), p = P.map(z => z[1]), bt = Pb.tod.map(z => z[1]), bp = Pb.pos.map(z => z[1]);
  const groups = {}; P.forEach((z, i) => { (groups[z[0].d] = groups[z[0].d] || []).push(i) });
  const bss = idx => { const yy = idx.map(i => y[i]); return 1 - brier(idx.map(i => p[i]), yy) / brier(idx.map(i => bt[i]), yy) };
  const vsBest = idx => { const yy = idx.map(i => y[i]), bm = brier(idx.map(i => p[i]), yy); return Math.min(brier(idx.map(i => bt[i]), yy), brier(idx.map(i => bp[i]), yy)) - bm };
  const all = P.map((_, i) => i), ef = econ(oname, P, 0.65), ev = idx => { const v = idx.map(i => ef(P[i])).filter(CORE.isNum); return v.length >= 10 ? CORE.mean(v) : null };
  const reg = f => { const idx = all.filter(f); return idx.length >= 40 ? +bss(idx).toFixed(3) : null };
  const flagged = all.map(i => ef(P[i])).filter(CORE.isNum).length, flagSessions = new Set(all.filter(i => CORE.isNum(ef(P[i]))).map(i => P[i][0].d)).size;
  return { n: P.length, sessions: Object.keys(groups).length, brier: +brier(p, y).toFixed(4), logloss: +logloss(p, y).toFixed(4), ece: +ece(p, y).toFixed(3), rel: reliability(p, y),
    bss: +bss(all).toFixed(3), bssCI: CORE.blockBoot(groups, bss, 400).map(v => v == null ? null : +v.toFixed(3)), vsBench: +vsBest(all).toFixed(4), vsBenchCI: CORE.blockBoot(groups, vsBest, 400, 9).map(v => v == null ? null : +v.toFixed(4)),
    regimes: { vixHigh: reg(i => P[i][0].vix > vixMed), vixLow: reg(i => P[i][0].vix <= vixMed), gapUp: reg(i => P[i][0].gap > 0), gapDown: reg(i => P[i][0].gap <= 0) },
    econ: ev(all) == null ? null : +ev(all).toFixed(3), econCI: ev(all) == null ? [null, null] : CORE.blockBoot(groups, ev, 400, 5).map(v => v == null ? null : +v.toFixed(3)), flagged, flagSessions };
}
const MINVAL = { highDone: 0.10, lowDone: 0.10, closeAbove: 0.05 };
function verdict(e, oname) {
  const rg = [e.regimes.vixHigh, e.regimes.vixLow].filter(v => v != null), stat = e.vsBenchCI[0] != null && e.vsBenchCI[0] > 0 && e.ece <= 0.05 && rg.length > 0 && rg.every(v => v > 0);
  const econOk = e.econCI[0] != null && e.econCI[0] > 0;
  const meaningful = e.econ != null && e.econ >= MINVAL[oname] && e.flagged >= 30 && (e.flagSessions || 0) >= 15;
  return { stat, econOk, meaningful, oneRegime: rg.length < 2, promoted: stat && econOk && meaningful };
}
const key = s => JSON.stringify(s);

async function hlPost(b) { const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(r.status); return r.json() }
const fmtET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function et(ms) { const p = {}; fmtET.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value }); return { d: +(p.year + p.month + p.day), hm: (+p.hour % 24) * 100 + +p.minute } }
const PCACHE = {};
async function perpSessions(coin, res) {
  const key = coin + res; if (PCACHE[key]) return PCACHE[key];
  const end = Date.now(), k = await hlPost({ type: 'candleSnapshot', req: { coin, interval: res + 'm', startTime: end - (res === 5 ? 18 : 110) * 864e5, endTime: end } }), by = {}, close16 = {};
  k.forEach(c => { const t = et(+c.t); if (t.hm >= 930 && t.hm < 1600) (by[t.d] = by[t.d] || []).push([t.hm, +c.o, +c.h, +c.l, +c.c, +c.v]); if (t.hm === (res === 5 ? 1555 : 1530)) close16[t.d] = +c.c });
  Object.keys(by).forEach(d => by[d].sort((a, b) => a[0] - b[0]));
  return (PCACHE[key] = { by, close16 });
}
/* Do models trained on cash bars give the same answers from perp bars? Tested separately for every window, outcome and model,
   scored on the cash outcome (the one that matters). Training uses only cash sessions before the first synchronized session. */
async function transfer(sym, w, rows, C, specs) {
  const W = WIN[w], out = {};
  try {
    const P = await perpSessions(PERP[sym], W.res), R = await perpSessions(PERP[REF[sym]], W.res), dly = daily(sym), cash = {}; sessions(sym, W.res, W.full).forEach(s => { cash[s.d] = s });
    const ds = Object.keys(P.by).map(Number).filter(d => P.by[d].length === W.full && cash[d]).sort((a, b) => a - b);
    const byD = {}; rows.forEach(r => { (byD[r.d] = byD[r.d] || {})[r.k] = r });
    const perpRows = []; ds.forEach(d => { const pr = Object.keys(P.close16).map(Number).filter(x => x < d).sort((a, b) => a - b).pop(); if (!pr) return;
      const SS = CORE.iSession({ bars: P.by[d], ref: R.by[d] && R.by[d].length === W.full ? R.by[d] : null, res: W.res, d, dly, vix: C.vix, rsp: C.rsp, spy: C.spy, earn: C.E[sym] || [], src: 'perp', perpPrev: P.close16[pr] }); if (!SS) return;
      W.ks.forEach(k => { const c = byD[d] && byD[d][k]; if (c) perpRows.push({ d, k, c, x: CORE.ifeat(SS, k), po: CORE.iout(SS, k) }) }) });
    const nSes = new Set(perpRows.map(r => r.d)).size;
    for (const o of OUTS) { out[o] = {};
      for (const f of Object.keys(specs[o])) {
        if (nSes < 20) { out[o][f] = { sessions: nSes, ok: false, why: 'fewer than 20 synchronized sessions' }; continue }
        const tr = rows.filter(r => r.d < ds[0]); if (tr.length < 300) { out[o][f] = { sessions: nSes, ok: false, why: 'not enough cash history before the perp window' }; continue }
        const M = ML.fit(specs[o][f], tr.map(r => r.x), tr.map(r => r.o[o])), pc = [], pp = [], yy = [], ag = [], groups = {};
        perpRows.forEach(r => { (groups[r.d] = groups[r.d] || []).push(pc.length); pc.push(CORE.mlPredict(M, r.c.x)); pp.push(CORE.mlPredict(M, r.x)); yy.push(r.c.o[o]); ag.push(r.po && r.po[o] === r.c.o[o] ? 1 : 0) });
        const diff = idx => brier(idx.map(i => pp[i]), idx.map(i => yy[i])) - brier(idx.map(i => pc[i]), idx.map(i => yy[i])), all = pc.map((_, i) => i), ci = CORE.blockBoot(groups, diff, 400, 3), md = CORE.mean(pc.map((v, i) => Math.abs(v - pp[i])));
        out[o][f] = { sessions: nSes, n: pc.length, from: ds[0], to: ds[ds.length - 1], brierCash: +brier(pc, yy).toFixed(4), brierPerp: +brier(pp, yy).toFixed(4), diff: +diff(all).toFixed(4), diffCI: ci.map(v => v == null ? null : +v.toFixed(4)), meanAbsProbDiff: +md.toFixed(3), outcomeAgreement: +CORE.mean(ag).toFixed(3), ok: ci[1] != null && ci[1] < 0.01 && md < 0.07 };
      } }
  } catch (e) { OUTS.forEach(o => { out[o] = { error: 'perp candles unavailable: ' + e.message } }) }
  return out;
}

async function run(log) {
  const C = context(), res = { asof: new Date().toISOString(), note: '', inst: {} }, models = { asof: res.asof, feat: CORE.IFEAT, inst: {} };
  const frozenP = path.join(D, 'research', 'frozen.json'), frozen = fs.existsSync(frozenP) ? readJ(frozenP) : { note: 'Configurations frozen for prospective testing. A configuration is never changed in place; a change starts a new prospective clock.', models: {} };
  const today = +new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (const sym of SYMS) {
    const I = res.inst[sym] = { windows: {} }; models.inst[sym] = {};
    for (const w of ['early', 'late']) {
      const rows = build(sym, w, C); if (!rows.length) continue;
      const dates = [...new Set(rows.map(r => r.d))].sort((a, b) => a - b), n = dates.length, i60 = Math.floor(n * 0.6), i80 = Math.floor(n * 0.8);
      const vixMed = CORE.median(rows.filter(r => r.d < dates[i80]).map(r => r.vix).filter(CORE.isNum));
      const Wo = I.windows[w] = { sessions: n, from: dates[0], to: dates[n - 1], trainEnd: dates[i60 - 1], valid: [dates[i60], dates[i80 - 1]], test: [dates[i80], dates[n - 1]], checkpoints: WIN[w].ks.map(k => k * WIN[w].res), outcomes: {} };
      const M = models.inst[sym][w] = { res: WIN[w].res, ks: WIN[w].ks, outcomes: {} };
      const SPECW = {};
      for (const o of OUTS) {
        const fams = {}, val = {}; SPECW[o] = val;
        for (const f of Object.keys(SPECS)) {
          let best = null; for (const s of SPECS[f]) { const P = SPECS[f].length > 1 ? walk(rows, dates, i60, i80, s, o) : null; const ll = P ? logloss(P.map(z => z[1]), P.map(z => z[0].o[o])) : 0; log && log('intraday', { sym, window: w, outcome: o, model: s, stage: 'validation', logloss: P ? +ll.toFixed(4) : null, sessions: [dates[i60], dates[i80 - 1]] }); if (!best || ll < best.ll) best = { s, ll } }
          val[f] = best.s;
        }
        const test = {}; for (const f of Object.keys(val)) test[f] = walk(rows, dates, i80, n, val[f], o);
        const E = {}; for (const f of Object.keys(test)) { if (!test[f].length) continue; E[f] = evaluate(test[f], test, o, vixMed); Object.assign(E[f], verdict(E[f], o), { spec: val[f], name: FAMN[f] }); log && log('intraday', { sym, window: w, outcome: o, model: val[f], stage: 'test', sessions: [dates[i80], dates[n - 1]], result: { brier: E[f].brier, bss: E[f].bss, ece: E[f].ece, econ: E[f].econ } }) }
        const prom = Object.keys(E).filter(f => BENCH.indexOf(f) < 0 && E[f].promoted).sort((a, b) => E[a].brier - E[b].brier)[0];
        const disp = prom || 'pos';
        /* per checkpoint skill of the displayed model on the test sessions */
        const perK = {}; WIN[w].ks.forEach(k => { const idx = test[disp].map((z, i) => i).filter(i => test[disp][i][0].k === k); if (idx.length < 10) return; const yy = idx.map(i => test[disp][i][0].o[o]); perK[k * WIN[w].res] = { n: idx.length, rate: +CORE.mean(yy).toFixed(3), bss: +(1 - brier(idx.map(i => test[disp][i][1]), yy) / brier(idx.map(i => test.tod[i][1]), yy)).toFixed(3) } });
        Wo.outcomes[o] = { name: ONAME[o], models: E, display: disp, promoted: !!prom, perK };
        /* frozen configuration and its prospective record (sessions after the freeze date only) */
        const fk = sym + '|' + w + '|' + o; let fz = frozen.models[fk];
        if (!fz || key(fz.spec) !== key(val[prom || 'pos'])) { if (fz) (frozen.history = frozen.history || []).push(Object.assign({ key: fk, replaced: today }, fz)); fz = frozen.models[fk] = { spec: val[prom || 'pos'], frozenAt: dates[n - 1], promoted: !!prom } }
        const pi = dates.findIndex(d => d > fz.frozenAt);
        if (pi > 0) { const PP = walk(rows, dates, pi, n, fz.spec, o), PT = walk(rows, dates, pi, n, { m: 'tod' }, o); Wo.outcomes[o].prospective = PP.length ? { sessions: new Set(PP.map(z => z[0].d)).size, brier: +brier(PP.map(z => z[1]), PP.map(z => z[0].o[o])).toFixed(4), bss: +(1 - brier(PP.map(z => z[1]), PP.map(z => z[0].o[o])) / brier(PT.map(z => z[1]), PT.map(z => z[0].o[o]))).toFixed(3) } : { sessions: 0 } }
        else Wo.outcomes[o].prospective = { sessions: 0, since: fz.frozenAt };
        Wo.outcomes[o].frozen = fz;
        const fit = ML.fit(val[disp], rows.map(r => r.x), rows.map(r => r.o[o]));
        M.outcomes[o] = { model: fit, family: disp, promoted: !!prom };
      }
      /* remaining move percentiles: fit before the test block, check coverage on it, then refit on everything for the page */
      const trq = rows.filter(r => r.d < dates[i80]), teq = rows.filter(r => r.d >= dates[i80]), Q0 = ML.fitQ(trq.map(r => r.x), trq.map(r => r.o.remUp), trq.map(r => r.o.remDn));
      let inU = 0, inD = 0, nq = 0; teq.forEach(r => { const e = CORE.qLookup(Q0, r.x); if (!e) return; nq++; if (r.o.remUp >= e.up[0] && r.o.remUp <= e.up[2]) inU++; if (r.o.remDn >= e.dn[0] && r.o.remDn <= e.dn[2]) inD++ });
      Wo.ranges = { n: nq, coverUp: nq ? +(inU / nq).toFixed(3) : null, coverDn: nq ? +(inD / nq).toFixed(3) : null, target: 0.8 };
      M.q = ML.fitQ(rows.map(r => r.x), rows.map(r => r.o.remUp), rows.map(r => r.o.remDn));
      I.transfer = I.transfer || {}; I.transfer[w] = await transfer(sym, w, rows, C, SPECW); log && log('transfer', { sym, window: w, stage: 'test', result: Object.keys(I.transfer[w]).map(o => o + ':' + Object.keys(I.transfer[w][o]).filter(f => I.transfer[w][o][f].ok).join('+')).join(' ') })
    }
  }
  res.note = 'Sessions are split in time order: the first 60% train, the next 20% choose each model\'s settings, the last 20% are scored once, refitting every 10 sessions on earlier data only. Confidence ranges resample whole sessions, because predictions from the same day are correlated. A model is promoted only if it beats both the time of day and the time and position benchmarks with a range above zero, is calibrated (error under 5 points), helps in both high and low VIX sessions, and adds economic value. Otherwise the page shows the historical frequency and says no model beat it.';
  fs.writeFileSync(path.join(D, 'research', 'intraday2.json'), JSON.stringify(res));
  fs.writeFileSync(path.join(D, 'research', 'models.json'), JSON.stringify(models));
  fs.writeFileSync(frozenP, JSON.stringify(frozen));
  return res;
}
module.exports = { run, build, context, dayCtx, sessions, WIN, SYMS, REF, PERP, OUTS, ONAME };
if (require.main === module) run((k, e) => {}).then(r => { for (const s of Object.keys(r.inst)) for (const w of Object.keys(r.inst[s].windows)) { const W = r.inst[s].windows[w]; console.log(s, w, W.sessions, Object.keys(W.outcomes).map(o => o + ':' + W.outcomes[o].display + (W.outcomes[o].promoted ? '*' : '') + ' ' + Object.keys(W.outcomes[o].models).map(f => f + '=' + W.outcomes[o].models[f].bss).join(',')).join(' | ')) } });
