/* Weekly intelligence and covered call research from daily bars (node). Writes data/research/weekly.json.
   Weekly: Monday open to Friday close, per stock. At the close of each day of the week it measures what had happened so far
   and what happened in the rest of the week. Models are scored walk forward on later weeks only, with week level bootstrap.
   Covered calls: the parts that need only the underlying are computed; anything that needs option prices says so. */
const fs = require('fs'), path = require('path'), CORE = require('../src/core.js'), ML = require('./ml.js');
const D = path.join(__dirname, '..', 'data');
const SYMS = ['SPY', 'QQQ', 'SMH', 'NVDA', 'MU', 'AMD', 'SNDK'];
const OUT = { highSet: 'Weekly high already set', lowSet: 'Weekly low already set', revisitOpen: 'Revisits the Monday open', finishAbove: 'Friday close above the current price', recover: 'Recovers the weekly decline by Friday' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
function readJ(p) { return JSON.parse(fs.readFileSync(p)) }
const dow = d => CORE.ymdDow(d), wkey = CORE.wkey, weeks = CORE.weeksOf, WFEAT = CORE.WFEAT, wstate = CORE.wstate;
function wout(W, j, s) {
  if (j >= W.length - 1) return null; let ha = -1e18, la = 1e18; for (let i = j + 1; i < W.length; i++) { ha = Math.max(ha, W[i][2]); la = Math.min(la, W[i][3]) }
  const fc = W[W.length - 1][4];
  return { highSet: ha <= s.hi ? 1 : 0, lowSet: la >= s.lo ? 1 : 0, revisitOpen: s.c > s.o ? (la <= s.o ? 1 : 0) : (ha >= s.o ? 1 : 0), finishAbove: fc > s.c ? 1 : 0, recover: s.c < s.o ? (fc >= s.o ? 1 : 0) : null,
    remUp: Math.max(0, (ha / s.c - 1) * 100), remDn: Math.min(0, (la / s.c - 1) * 100), toFri: (fc / s.c - 1) * 100 };
}
function wfit(kind, X, y) {
  if (kind === 'day') { const M = { type: 'wday', p: {}, base: CORE.mean(y) }; const c = {}; X.forEach((x, i) => { const k = Math.round(x[3] * 4); (c[k] = c[k] || []).push(y[i]) }); Object.keys(c).forEach(k => { M.p[k] = (CORE.mean(c[k]) * c[k].length + M.base * 5) / (c[k].length + 5) }); return M }
  if (kind === 'daypos') { const M = { type: 'wdaypos', p: {}, base: CORE.mean(y) }, c = {}; X.forEach((x, i) => { const k = Math.round(x[3] * 4) + '|' + Math.min(2, Math.floor(x[1] * 3)); (c[k] = c[k] || []).push(y[i]) }); Object.keys(c).forEach(k => { M.p[k] = (CORE.mean(c[k]) * c[k].length + M.base * 10) / (c[k].length + 10) }); return M }
  return ML.fitLogit(X, y, 10);
}
const wpred = CORE.wpred;
function brier(p, y) { let s = 0; p.forEach((v, i) => { s += (v - y[i]) ** 2 }); return s / p.length }

function analyze(sym, V) {
  const rows = readJ(path.join(D, 'hist', sym + '.json')).rows, W = weeks(rows), V_ = {}; V.forEach(r => { V_[r[0]] = r[4] });
  const items = [], dayHi = [0, 0, 0, 0, 0], dayLo = [0, 0, 0, 0, 0], lastD = rows[rows.length - 1][0]; let full = 0, wr = [], skippedOpen = 0, skippedGap = 0, shortW = 0;
  W.forEach((w, wi) => {
    const rng = (Math.max(...w.map(r => r[2])) - Math.min(...w.map(r => r[3]))) / w[0][1] * 100; wr.push(rng);
    if (wi < 20) return;
    /* only weeks the NYSE calendar says are finished and that have every expected trading day; the current week and weeks with missing data are skipped */
    if (!CORE.weekComplete(w, lastD)) { if (wi === W.length - 1) skippedOpen++; else skippedGap++; return }
    if (w.length < 3) return;
    full++; let hi = 0, lo = 0; w.forEach((r, i) => { if (r[2] > w[hi][2]) hi = i; if (r[3] < w[lo][3]) lo = i }); dayHi[CORE.ymdDow(w[hi][0])]++; dayLo[CORE.ymdDow(w[lo][0])]++; if (w.length < 5) shortW++;
    const all = rows.map(r => r[0]);
    w.forEach((r, j) => { const k = all.indexOf(r[0]), ctx = CORE.wctx(W, wi, rows, k, V_), s = wstate(w, j, ctx), o = wout(w, j, s); if (o) items.push({ wk: wi, d: r[0], j, x: s.x, o, vix: ctx.vix }) });
  });
  const wks = [...new Set(items.map(i => i.wk))].sort((a, b) => a - b), cut = wks[Math.floor(wks.length * 0.6)], res = { sym, weeks: wks.length, fullWeeks: full,  from: items[0].d, to: items[items.length - 1].d,
    highDay: dayHi.map(v => +(v / full).toFixed(3)), lowDay: dayLo.map(v => +(v / full).toFixed(3)), completeWeeks: full, shortWeeks: shortW, skippedOpen, skippedGap, outcomes: {} };
  const TEST = {};
  for (const o of Object.keys(OUT)) {
    const P = { day: [], daypos: [], logit: [] }, ys = [], grp = {};
    for (let a = wks.indexOf(cut); a < wks.length; a += 8) {
      const blk = wks.slice(a, a + 8), tr = items.filter(i => i.wk < blk[0] && i.o[o] != null), te = items.filter(i => blk.indexOf(i.wk) >= 0 && i.o[o] != null); if (tr.length < 100 || !te.length) continue;
      const Ms = {}; Object.keys(P).forEach(k => { Ms[k] = wfit(k, tr.map(i => i.x), tr.map(i => i.o[o])) });
      te.forEach(i => { (grp[i.wk] = grp[i.wk] || []).push(ys.length); (TEST[o] = TEST[o] || []).push({ day: Math.round(i.x[3] * 4), o: i.o }); ys.push(i.o[o]); Object.keys(P).forEach(k => P[k].push(wpred(Ms[k], i.x))) });
    }
    const sc = {}; Object.keys(P).forEach(k => { sc[k] = { brier: +brier(P[k], ys).toFixed(4) } });
    /* benchmarks: day of week, and day of week with position in the week's range (the weekly analog of the intraday time and position benchmark) */
    const bb = idx => Math.min(brier(idx.map(i => P.day[i]), idx.map(i => ys[i])), brier(idx.map(i => P.daypos[i]), idx.map(i => ys[i])));
    const gain = k => idx => (k === 'daypos' ? brier(idx.map(i => P.day[i]), idx.map(i => ys[i])) : bb(idx)) - brier(idx.map(i => P[k][i]), idx.map(i => ys[i]));
    ['daypos', 'logit'].forEach(k => { sc[k].vsBench = +gain(k)(ys.map((_, i) => i)).toFixed(4); sc[k].ci = CORE.blockBoot(grp, gain(k), 400).map(v => v == null ? null : +v.toFixed(4)) });
    sc.logit.beats = sc.logit.ci[0] != null && sc.logit.ci[0] > 0;
    /* economic value of acting on the model: sell calls when the weekly high is likely in (less upside left), buy when the low is likely in
       (shallower further downside), or trade to the Friday close; measured against the average at the same day of the week, after 0.02% cost */
    const rows2 = Object.keys(grp).flatMap(g => grp[g]).sort((a, b) => a - b), meta = TEST[o] || [], byDay = {}; meta.forEach(m => { const a = byDay[m.day] || (byDay[m.day] = [0, 0, 0]); a[0] += m.o.remUp; a[1] += m.o.remDn; a[2]++ });
    const ev = idx => { const v = idx.map(i => { const m = meta[i], p = P.logit[i]; if (!m) return null; const b = byDay[m.day]; if (o === 'highSet') return p >= 0.7 ? b[0] / b[2] - m.o.remUp : null; if (o === 'lowSet') return p >= 0.7 ? m.o.remDn - b[1] / b[2] : null; if (o === 'finishAbove' || o === 'recover') return p >= 0.6 ? m.o.toFri - 0.02 : (o === 'finishAbove' && p <= 0.4 ? -m.o.toFri - 0.02 : null); return null }).filter(CORE.isNum); return v.length >= 10 ? CORE.mean(v) : null };
    const e0 = ev(rows2), flagged = rows2.filter(i => ev([i]) != null || false).length;
    sc.logit.econ = e0 == null ? null : +e0.toFixed(3); sc.logit.econCI = e0 == null ? [null, null] : CORE.blockBoot(grp, ev, 400, 17).map(v => v == null ? null : +v.toFixed(3));
    sc.logit.econApplies = o !== 'revisitOpen';
    sc.logit.promoted = sc.logit.beats && sc.logit.econApplies && sc.logit.econCI[0] != null && sc.logit.econCI[0] > 0 && e0 >= 0.15;
    const best = sc.logit.beats ? 'logit' : 'daypos';
    const allI = items.filter(i => i.o[o] != null);
    res.outcomes[o] = { name: OUT[o], n: ys.length, weeksTested: Object.keys(grp).length, rate: +CORE.mean(ys).toFixed(3), models: sc, display: best, beatsBench: sc.logit.beats, promoted: !!sc.logit.promoted, model: wfit(best, allI.map(i => i.x), allI.map(i => i.o[o])) };
  }
  /* remaining weekly move percentiles by day and position */
  const qt = (v, p) => { v = v.slice().sort((a, b) => a - b); return +v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(2) }, Q = {};
  items.forEach(i => { const k = Math.round(i.x[3] * 4) + '|' + Math.min(2, Math.floor(i.x[1] * 3)); (Q[k] = Q[k] || []).push(i.o) });
  res.ranges = {}; Object.keys(Q).forEach(k => { const a = Q[k]; if (a.length >= 15) res.ranges[k] = { n: a.length, up: [qt(a.map(z => z.remUp), 0.1), qt(a.map(z => z.remUp), 0.5), qt(a.map(z => z.remUp), 0.9)], dn: [qt(a.map(z => z.remDn), 0.1), qt(a.map(z => z.remDn), 0.5), qt(a.map(z => z.remDn), 0.9)] } });
  res.watr = +CORE.mean(wr.slice(-20)).toFixed(3);
  return res;
}

/* Covered call research on the underlying only: sell Friday at the close, expire the next Friday close.
   Strike distances are in % above the entry close, because delta needs historical implied volatility we do not have. */
function coveredCalls(sym, V) {
  const f10 = path.join(D, 'hist', sym + '10.json'), src = fs.existsSync(f10) ? sym + '10' : sym, j = readJ(path.join(D, 'hist', src + '.json')), rows = j.rows.map(r => [r[0], r[r.length - 1]]), brk = j.breaks || [];
  const Vc = {}; V.forEach(r => { Vc[r[0]] = r[4] });
  const fri = []; for (let i = 1; i < rows.length; i++) { const a = wkey(rows[i - 1][0]), b = wkey(rows[i][0]); if (a !== b) fri.push(i - 1) }
  const X = [1, 2, 3, 5, 8], T = []; let prevRet = null;
  for (let q = 1; q < fri.length; q++) { const e = fri[q - 1], x = fri[q]; if (brk.some(b => b > rows[e][0] && b <= rows[x][0])) { prevRet = null; continue } const r = (rows[x][1] / rows[e][1] - 1) * 100; if (prevRet != null) T.push({ d: rows[e][0], ret: r, prev: prevRet, vix: Vc[rows[e][0]] }); prevRet = r }
  const abs = T.map(t => Math.abs(t.prev)).sort((a, b) => a - b), big = abs[Math.floor(abs.length * 0.8)], vx = T.map(t => t.vix).filter(CORE.isNum).sort((a, b) => a - b), v1 = vx[Math.floor(vx.length / 3)], v2 = vx[Math.floor(vx.length * 2 / 3)];
  const grp = (f) => { const a = T.filter(f); return X.map(x => { const k = a.filter(t => t.ret > x).length; return { x, n: a.length, p: a.length ? +(k / a.length).toFixed(3) : null, ci: a.length ? CORE.wilson(k, a.length).map(v => +v.toFixed(3)) : null } }) };
  return { sym, src: j.src, weeks: T.length, from: T.length ? T[0].d : null, rallyCut: +big.toFixed(2), vixCuts: [v1, v2],
    all: grp(() => true), afterRally: grp(t => t.prev >= big), afterDrop: grp(t => t.prev <= -big), vixLow: grp(t => t.vix < v1), vixMid: grp(t => t.vix >= v1 && t.vix < v2), vixHigh: grp(t => t.vix >= v2),
    upside: { med: +CORE.median(T.map(t => Math.max(0, t.ret))).toFixed(2), p90: +T.map(t => Math.max(0, t.ret)).sort((a, b) => a - b)[Math.floor(T.length * 0.9)].toFixed(2) } };
}

function run(log) {
  const V = readJ(path.join(D, 'hist', 'VIX.json')).rows, out = { asof: new Date().toISOString(), feat: WFEAT, days: DAYS, inst: {}, cc: {}, ccNeeds: [] };
  SYMS.forEach(s => { try { out.inst[s] = analyze(s, V); Object.keys(out.inst[s].outcomes).forEach(o => log && log('weekly', { sym: s, outcome: o }, out.inst[s].outcomes[o].models)) } catch (e) { out.inst[s] = { error: e.message } } try { out.cc[s] = coveredCalls(s, V) } catch (e) { out.cc[s] = { error: e.message } } });
  const snaps = {}; const cd = path.join(D, 'chains'); if (fs.existsSync(cd)) fs.readdirSync(cd).forEach(t => { snaps[t] = fs.readdirSync(path.join(cd, t)).length });
  out.ccNeeds = [['Typical premium changes through the session', 'needs intraday option quotes; none are available on the current feeds'], ['Expected upside versus premium collected', 'upside is measured below; premium needs historical bids'], ['Optimal expiration', 'needs historical option prices across expiries'], ['Performance by delta', 'needs historical implied volatility and quotes'], ['Comparison with systematic covered call benchmarks', 'needs historical option prices']];
  out.snapshots = snaps;
  out.note = 'Weekly models are scored on later weeks only, refitting every 8 weeks on earlier weeks, with ranges from resampling whole weeks. Covered call figures use the underlying only: the chance the stock finishes the week above a strike set a given % above the entry close, which is what assignment depends on. Delta, premium and expiry choice need historical option quotes, which this project does not have yet; end of session chains are being saved so these can be measured later.';
  fs.writeFileSync(path.join(D, 'research', 'weekly.json'), JSON.stringify(out));
  return out;
}
module.exports = { run, WFEAT, wstate, OUT };
if (require.main === module) { const r = run(); Object.keys(r.inst).forEach(s => { const I = r.inst[s]; if (I.error) return console.log(s, I.error); console.log(s, I.weeks, 'weeks; high day', I.highDay.join(' '), '| low day', I.lowDay.join(' ')); Object.keys(I.outcomes).forEach(o => { const q = I.outcomes[o]; console.log('  ', o, q.n, q.rate, q.display, JSON.stringify(q.models)) }) }); Object.keys(r.cc).forEach(s => console.log('cc', s, r.cc[s].weeks, JSON.stringify(r.cc[s].all.map(z => z.p)), 'afterRally', JSON.stringify(r.cc[s].afterRally.map(z => z.p)))) }
