// Offline research, run on the close: node tools/research.js
// Writes data/research/fingerprint.json, seasonality.json and semis.json. Uses src/core.js so the page and the research share one set of formulas.
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const D = path.join(__dirname, '..', 'data');
function load(sym) { const j = JSON.parse(fs.readFileSync(path.join(D, 'hist', sym + '.json'))); const o = { d: [], c: [], ix: {}, src: j.src, asof: j.asof, breaks: j.breaks }; const F = j.fields; if (F.length === 5) { o.o = []; o.h = []; o.l = [] } j.rows.forEach((r, i) => { o.d.push(r[0]); o.ix[r[0]] = i; if (F.length === 5) { o.o.push(r[1]); o.h.push(r[2]); o.l.push(r[3]); o.c.push(r[4]) } else o.c.push(r[1]) }); return o }
function save(name, obj) { fs.mkdirSync(path.join(D, 'research'), { recursive: true }); fs.writeFileSync(path.join(D, 'research', name), JSON.stringify(obj)); console.log('wrote', name) }
const now = new Date().toISOString();

/* Permanent experiment ledger: every configuration ever tested, including failures. Multiple testing uses its full size. */
const LEDGER = path.join(D, 'research', 'ledger.json');
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER)) : { note: 'Every research configuration tested, kept permanently, including failed ones. The count sets the multiple testing adjustment.', entries: [] };
function logExp(kind, config, result) { const id = kind + ':' + JSON.stringify(config); const e = ledger.entries.find(x => x.id === id); const row = { id, kind, config, first: e ? e.first : now.slice(0, 10), last: now.slice(0, 10), runs: e ? e.runs + 1 : 1, result }; if (e) Object.assign(e, row); else ledger.entries.push(row) }

/* 1. Fingerprint: tune on 2005 to 2015 only, then test the chosen setting once on 2016 onward. Every model is scored on the same test dates. */
function fingerprint() {
  const H = { SPX: load('SPX'), VIX: load('VIX'), NDX: load('NDX'), US10Y: load('US10Y'), RSP10: load('RSP10'), SPY10: load('SPY10'), SMH10: load('SMH10'), QQQ10: load('QQQ10') };
  const F = C.features(H), S = H.SPX, HOR = 20, all = C.FEAT.map(x => x[0]);
  const SETS = { all, price: ['dd', 'r5', 'r20', 'rv', 'ma'], macro: ['vix', 'dvix', 'y20', 'tech'], core: ['dd', 'r20', 'vix', 'rv'] };
  const vb = v => v < 15 ? 0 : v < 20 ? 1 : v < 30 ? 2 : 3;
  function nbr(ti, cfg) { const t = F[ti], keys = SETS[cfg.set], c = [];
    for (let i = 0; i < ti - HOR; i++) { const f = F[i]; if (cfg.regime && vb(f.vix) !== vb(t.vix)) continue; let s = 0, m = 0;
      for (const k of keys) { let a = t['z' + k], b = f['z' + k]; if (!C.isNum(a) || !C.isNum(b)) continue; if (cfg.scale === 'cdf') { a = C.ncdf(a); b = C.ncdf(b) } s += cfg.dist === 'l1' ? Math.abs(a - b) : (a - b) ** 2; m++ }
      if (m >= Math.max(1, keys.length - 2)) c.push([cfg.dist === 'l1' ? s / m : Math.sqrt(s / m), i]) }
    c.sort((a, b) => a[0] - b[0]); const pick = []; for (const x of c) { if (pick.length >= cfg.k) break; if (pick.every(p => Math.abs(F[p[1]].i - F[x[1]].i) >= 20)) pick.push(x) } return pick }
  const dates = (lo, hi) => { const out = []; let last = -1e9; for (let t = 0; t < F.length; t++) { if (F[t].d < lo || F[t].d >= hi || F[t].i - last < HOR) continue; if (C.fwdRet(S, F[t].i, HOR) == null) continue; last = F[t].i; out.push(t) } return out };
  const trainD = dates(20050101, 20151201), testD = dates(20160201, 99999999);  /* two months of embargo between them */
  function evalCfg(cfg, D) { const pred = [], real = [], bh = []; for (const t of D) { const nb = nbr(t, cfg); if (nb.length < 5) return null; pred.push(C.mean(nb.map(x => C.fwdRet(S, F[x[1]].i, HOR)))); real.push(C.fwdRet(S, F[t].i, HOR)) } return { pred, real } }
  function score(pr, D) { const n = pr.real.length, hit = pr.pred.filter((p, i) => (p > 0) === (pr.real[i] > 0)).length, up = pr.real.filter(x => x > 0).length;
    const strat = pr.pred.map((p, i) => p > 0 ? pr.real[i] : 0), mae = C.mean(pr.pred.map((p, i) => Math.abs(p - pr.real[i])));
    const exp = []; for (const t of D) { const past = []; for (let j = 0; j < t - HOR; j += 5) { const v = C.fwdRet(S, F[j].i, HOR); if (v != null) past.push(v) } exp.push(C.mean(past)) }
    const maeBase = C.mean(exp.map((p, i) => Math.abs(p - pr.real[i])));
    return { n, hit, rate: hit / n, ci: C.wilson(hit, n), upRate: up / n, ic: C.pearson(pr.pred, pr.real), mae, maeBase, longFlat: C.mean(strat), buyHold: C.mean(pr.real), inMarket: pr.pred.filter(p => p > 0).length / n } }
  const grid = []; for (const set of Object.keys(SETS)) for (const scale of ['z', 'cdf']) for (const dist of ['l2', 'l1']) for (const k of [10, 20, 40]) for (const regime of [0, 1]) grid.push({ set, scale, dist, k, regime });
  const tr = grid.map(cfg => { const pr = evalCfg(cfg, trainD); const sc = pr ? score(pr, trainD) : null; logExp('fingerprint', cfg, sc ? { train: { n: sc.n, rate: sc.rate, ic: sc.ic } } : { train: null }); return { cfg, sc } }).filter(x => x.sc);
  tr.sort((a, b) => (b.sc.rate - b.sc.upRate) - (a.sc.rate - a.sc.upRate) || (b.sc.ic || 0) - (a.sc.ic || 0));
  const best = tr[0], defaultCfg = { set: 'all', scale: 'z', dist: 'l2', k: 20, regime: 0 };
  const models = [['Tuned on 2005 to 2015', best.cfg], ['Default, all conditions', defaultCfg]].concat(C.FEAT.map(x => [x[1] + ' only', { set: 'one', one: x[0], scale: 'z', dist: 'l2', k: 20, regime: 0 }]));
  SETS.one = null; const res = models.map(([name, cfg]) => { if (cfg.set === 'one') SETS.one = [cfg.one]; const pr = evalCfg(cfg, testD); return { name, cfg, pr } }).filter(x => x.pr);
  const test = res.map(x => Object.assign({ name: x.name, cfg: x.cfg }, score(x.pr, testD)));
  const T0 = test[0], promoted = T0.ci[0] > T0.upRate && T0.mae < T0.maeBase && T0.longFlat > T0.buyHold;
  logExp('fingerprint-test', best.cfg, { test: { n: T0.n, rate: T0.rate, ic: T0.ic } });
  save('fingerprint.json', { asof: now, dataAsof: S.asof, horizon: HOR, gridSize: grid.length, trainDates: trainD.length, testDates: testD.length, best: best.cfg, bestTrain: best.sc, test, promoted,
    note: 'Settings were tuned only on 2005 to 2015 and tested once on 2016 onward, with a 2 month gap. Every model is scored on the same ' + testD.length + ' test dates, 20 sessions apart, so outcomes never overlap. Matched baselines: calling up every time, and the average 20 day return known at each date. A model is promoted only if its hit rate range clears calling up, its error beats the baseline and long or flat beats buy and hold.' });
  return { promoted, T0 };
}

/* 2. Intraday timing from SPY 30 minute bars */
function seasonality() {
  const j = JSON.parse(fs.readFileSync(path.join(D, 'intraday', 'SPY30.json'))), V = load('VIX'), days = {};
  j.rows.forEach(r => { (days[r[0]] = days[r[0]] || []).push(r) });
  const ds = Object.keys(days).map(Number).sort(), slots = ['930', '1000', '1030', '1100', '1130', '1200', '1230', '1300', '1330', '1400', '1430', '1500', '1530'];
  const rows = []; let prevClose = null;
  ds.forEach(d => { const b = days[d].sort((a, c) => a[1] - c[1]); if (b.length !== 13) { prevClose = b.length ? b[b.length - 1][5] : prevClose; return } const o = b[0][2], c = b[12][5]; let hi = 0, lo = 0; b.forEach((x, i) => { if (x[3] > b[hi][3]) hi = i; if (x[4] < b[lo][4]) lo = i });
    const vi = V.ix[d]; let vprev = null; if (vi != null && vi > 0) vprev = V.c[vi - 1];
    rows.push({ d, o, c, hi, lo, gap: prevClose ? (o / prevClose - 1) * 100 : null, vprev, rng: (c - b[lo][4]) / ((b[hi][3] - b[lo][4]) || 1), ret: b.map(x => (x[5] / x[2] - 1) * 100) }); prevClose = c });
  const conds = [['All days', () => true], ['Up days', r => r.c > r.o], ['Down days', r => r.c < r.o], ['Gap down 0.5% or more', r => r.gap != null && r.gap <= -0.5], ['Gap up 0.5% or more', r => r.gap != null && r.gap >= 0.5], ['VIX 25 or higher the day before', r => r.vprev != null && r.vprev >= 25], ['Low after the first hour, close in the top 30% of the range', r => r.lo >= 2 && r.rng >= 0.7]];
  const out = conds.map(([name, fn]) => { const s = rows.filter(fn), n = s.length; const hist = k => slots.map((_, i) => n ? s.filter(r => r[k] === i).length / n * 100 : null);
    return { name, n, high: hist('hi'), low: hist('lo'), lowFirstHour: n ? s.filter(r => r.lo <= 1).length / n * 100 : null, highLastHour: n ? s.filter(r => r.hi >= 11).length / n * 100 : null,
      bar: slots.map((_, i) => { const a = s.map(r => r.ret[i]); const st = C.stats(a); return { mean: st.mean, lo: st.lo, hi: st.hi } }) } });
  save('seasonality.json', { asof: now, from: ds[0], to: ds[ds.length - 1], days: rows.length, slots, conds: out, note: 'SPY regular session 30 minute bars from Unusual Whales. Half days are skipped. Times are bar start, ET. About 9 months of data, so treat it as a description, not a rule.' });
}

/* 3. Asia to US chips: does the completed Asian session add anything after the prior US session and the overnight S&P perp? */
async function post(b) { const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(r.status); return r.json() }
function etMs(d, h) { const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; for (const off of [4, 5]) { const t = Date.UTC(y, m - 1, dd, h + off, 0); const s = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' }); if (+s % 24 === h) return t } return null }
function ols(X, y) { const k = X[0].length, n = X.length, A = Array.from({ length: k }, () => Array(k + 1).fill(0)); for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b]; A[a][k] += X[i][a] * y[i] }
  const M = A.map(r => r.slice()); for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null; for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let q = c; q <= k; q++) M[r][q] -= f * M[c][q] } }
  const beta = M.map((r, i) => r[k] / r[i]); const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0)); const s2 = res.reduce((s, x) => s + x * x, 0) / (n - k);
  const I = A.map((r, i) => r.slice(0, k).concat(Array.from({ length: k }, (_, j) => i === j ? 1 : 0))); for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(I[r][c]) > Math.abs(I[p][c])) p = r; [I[c], I[p]] = [I[p], I[c]]; const dv = I[c][c]; for (let q = 0; q < 2 * k; q++) I[c][q] /= dv; for (let r = 0; r < k; r++) if (r !== c) { const f = I[r][c]; for (let q = 0; q < 2 * k; q++) I[r][q] -= f * I[c][q] } }
  return { beta, se: beta.map((_, i) => Math.sqrt(s2 * I[i][k + i])) } }
async function semis() {
  const asia = ['xyz:SKHX', 'xyz:SMSN', 'xyz:KIOXIA', 'xyz:TSM'], tg = ['xyz:MU', 'xyz:SNDK', 'xyz:NVDA', 'xyz:SMH'], all = asia.concat(tg, ['xyz:SP500']), K = {}, end = Date.now();
  for (const c of all) { const k = await post({ type: 'candleSnapshot', req: { coin: c, interval: '1h', startTime: end - 400 * 864e5, endTime: end } }); K[c] = {}; k.forEach(x => { K[c][+x.t] = x }) }
  const us = load('SPY10'), first = Math.min(...Object.keys(K['xyz:SP500']).map(Number)), half = { 20261127: 13, 20261224: 13, 20251128: 13, 20251224: 13 };
  const px = (c, t) => K[c][t] ? +K[c][t].o : null;
  const days = us.d.filter(d => etMs(d, 9) > first + 2 * 864e5);
  const rows = [];
  for (let i = 2; i < days.length; i++) {
    const d = days[i], p1 = days[i - 1], p2 = days[i - 2], cPrev = etMs(p1, half[p1] || 16), cPrev2 = etMs(p2, half[p2] || 16), cNow = etMs(d, half[d] || 16);
    const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100, asiaDone = Date.UTC(y, m - 1, dd, 7, 0);
    if (!cPrev || !cNow || asiaDone <= cPrev || asiaDone >= cNow) continue;
    const r = { d };
    for (const c of all) { const a = px(c, cPrev2), b = px(c, cPrev), e = px(c, asiaDone), f = px(c, cNow); if (a == null || b == null || e == null || f == null) continue; r[c] = { prevUS: (b / a - 1) * 100, night: (e / b - 1) * 100, day: (f / e - 1) * 100 } }
    if (!r['xyz:SP500']) continue;
    let volAsia = 0; for (let t = asiaDone - 7 * 36e5; t < asiaDone; t += 36e5) volAsia += K['xyz:SKHX'][t] ? +K['xyz:SKHX'][t].v : 0; r.volAsia = volAsia; rows.push(r);
  }
  const medV = C.median(rows.map(r => r.volAsia)); const useAll = rows.filter(r => r.volAsia >= 0.3 * medV);
  const tests = [], nTests = asia.length * tg.length;
  for (const a of asia) for (const t of tg) {
    const use = useAll.filter(r => r[a] && r[t]);
    const y = use.map(r => r[t].day), X0 = use.map(r => [1, r[t].prevUS, r['xyz:SP500'].night]), X1 = use.map(r => [1, r[t].prevUS, r['xyz:SP500'].night, r[a].night]);
    const f1 = ols(X1, y); if (!f1) continue; const b = f1.beta[3], se = f1.se[3], z = b / se, p = 2 * (1 - C.ncdf(Math.abs(z)));
    let e0 = 0, e1 = 0, hit0 = 0, hit1 = 0, n = 0;
    for (let i = 60; i < use.length; i++) { const m0 = ols(X0.slice(0, i), y.slice(0, i)), m1 = ols(X1.slice(0, i), y.slice(0, i)); if (!m0 || !m1) continue; const p0 = X0[i].reduce((s, x, j) => s + x * m0.beta[j], 0), p1 = X1[i].reduce((s, x, j) => s + x * m1.beta[j], 0); e0 += (y[i] - p0) ** 2; e1 += (y[i] - p1) ** 2; if ((p0 > 0) === (y[i] > 0)) hit0++; if ((p1 > 0) === (y[i] > 0)) hit1++; n++ }
    tests.push({ asia: a.replace('xyz:', ''), target: t.replace('xyz:', ''), n: use.length, beta: b, se, p, pAdj: Math.min(1, p * nTests), oosN: n, oosGain: n ? 1 - e1 / e0 : null, hit0: n ? hit0 / n : null, hit1: n ? hit1 / n : null });
  }
  save('semis.json', { asof: now, from: useAll.length ? useAll[0].d : null, to: useAll.length ? useAll[useAll.length - 1].d : null, days: useAll.length, dropped: rows.length - useAll.length, tests,
    note: 'Perp prices on Hyperliquid. Asian move: prior US close to 07:00 UTC, after Seoul, Tokyo and Taipei have closed. Outcome: 07:00 UTC to the US close, so it starts after the Asian information is known. Controls: the stock\'s prior US session and the S&P perp over the same night. Days with under 30% of normal Asian trading volume are treated as Asian holidays and dropped. The gain is out of sample (walk forward after 60 days): above 0 means the Asian move reduced forecast error. p values are adjusted for the 16 pairs tested. SOXX has no perp on the provider. About 7 months of data.' });
}

/* 4. Conditional intraday engine, walk forward: each day is predicted from earlier days only */
function loadDays(sym) { const p = path.join(D, 'intraday', sym + '30.json'); if (!fs.existsSync(p)) return null; const j = JSON.parse(fs.readFileSync(p)), by = {}; j.rows.forEach(r => (by[r[0]] = by[r[0]] || []).push([r[1], r[2], r[3], r[4], r[5], r[6]])); return by }
function intraday() {
  const S = loadDays('SPY'), M = loadDays('SMH'), keys = Object.keys(S).map(Number).sort(), days = [];
  let prev = null; const rngs = [];
  for (const d of keys) { const b = S[d].sort((a, c) => a[0] - c[0]); if (b.length !== 13) { prev = b[b.length - 1][4]; continue } const m = M && M[d] && M[d].length === 13 ? M[d].sort((a, c) => a[0] - c[0]) : null;
    const atr = rngs.length >= 10 ? C.mean(rngs.slice(-20)) : null; days.push({ d, prev, b, semi: m, atr }); rngs.push(Math.max(...b.map(x => x[2])) - Math.min(...b.map(x => x[3]))); prev = b[12][4] }
  const out = {}; C.OUT.forEach(k => out[k] = []); const upE = [], dnE = [];
  for (let i = 60; i < days.length; i++) for (const t of [0, 1, 3, 5, 7, 9]) {
    const hist = days.slice(0, i).map(D2 => { const s = C.dayState(D2, t, D2.atr); return { s, o: C.dayOutcome(D2, s) } });
    const s = C.dayState(days[i], t, days[i].atr), o = C.dayOutcome(days[i], s), p = C.intradayPredict(hist, s, 30);
    C.OUT.forEach(k => { if (!p[k] || o[k] == null) return; const v = hist.map(h => h.o[k]).filter(x => x === true || x === false); const base = v.length ? v.filter(Boolean).length / v.length : 0.5; out[k].push([p[k].p, o[k], base]) });
    if (p.up.n) { upE.push(Math.abs(p.up.mean - o.up)); dnE.push(Math.abs(p.down.mean - o.down)) }
  }
  const skill = {}; C.OUT.forEach(k => { const h = Math.floor(out[k].length / 2); skill[k] = { n: out[k].length, skill: C.brierSkill(out[k]), first: C.brierSkill(out[k].slice(0, h)), second: C.brierSkill(out[k].slice(h)) }; logExp('intraday', { outcome: k, k: 30, bars: [0, 1, 3, 5, 7, 9] }, skill[k]) });
  save('intraday.json', { asof: now, days: days.length, from: days[0].d, to: days[days.length - 1].d, tested: days.length - 60, skill, upMAE: C.mean(upE), downMAE: C.mean(dnE),
    note: 'SPY 30 minute bars, regular session, about one year. Each test day is predicted from earlier days only, using the state at the end of a bar: opening gap, move since the open, position in the day\'s range, range so far vs the average daily range, and semis vs SPY. Breadth has no intraday history here, so it is not used. Skill compares the Brier score with the base rate known at the time: above 0 is better than the base rate, 0 or below is no better.' });
  return skill;
}

/* 5. Options strategies from saved chain snapshots whose expiry has passed */
function options() {
  const dir = path.join(D, 'chains', 'SPY'); const snaps = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(path.join(dir, f)))) : []; const S = load('SPY10'), V = load('VIX'), res = [];
  snaps.forEach(sn => { const j = S.ix[+sn.expiry.replace(/-/g, '')]; if (j == null) return; const vi = V.ix[+sn.session.replace(/-/g, '')]; C.optionStrategies(sn, S.c[j], 0.0065).forEach(o => res.push(Object.assign({ session: sn.session, expiry: sn.expiry, vix: vi != null ? V.c[vi] : null }, o))) });
  const by = {}; res.forEach(r => (by[r.name] = by[r.name] || []).push(r));
  const summary = Object.keys(by).map(n => { const a = by[n], rets = a.map(x => x.ret).filter(C.isNum); let eq = 0, peak = 0, dd = 0; rets.forEach(r => { eq += r; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak) }); return { name: n, n: a.length, win: a.filter(x => x.pnl > 0).length, avgRet: C.mean(rets), worst: Math.min(...rets), maxDD: dd, assigned: a.filter(x => x.assigned).length, avgSpread: C.mean(a.map(x => x.spread)) } });
  save('options.json', { asof: now, snapshots: snaps.length, pending: snaps.filter(s => S.ix[+s.expiry.replace(/-/g, '')] == null).length, trades: res, summary,
    note: 'Built only from real end of session SPY chains saved by the close run (bid, ask, delta). Sells fill at the bid and buys at the ask, plus $0.65 a contract. Held to expiry and settled on the SPY close, so early assignment and intraday management are not modeled. Bulk historical chains are not available on the current subscriptions, so this sample grows one snapshot per session from Nov 25 2026.' });
}

/* 6. Signal reliability registry */
function registry(fpRes, intra) {
  const H = {}; ['SPX', 'VIX', 'NDX', 'SPY', 'QQQ', 'N225', 'SMH', 'SPY10', 'RSP10', 'NVDA10'].forEach(s => { try { H[s] = load(s) } catch (e) { } });
  const total = ledger.entries.length + C.STUDIES.length, out = [];
  C.STUDIES.forEach(st => {
    const need = st.tgt === 'pick' ? ['NVDA10'] : st.data; if (need.some(s => !H[s])) { out.push({ name: st.name, cls: 'Data unavailable' }); return }
    const P = {}; st.p.forEach(p => P[p[0]] = p[2]); const R = C.runStudy(st, P, { gap: 5, pick: 'NVDA10' }, H);
    const tr = C.summarize(R, 5, 'train'), te = C.summarize(R, 5, 'test'), wf = C.walkForward(R, 5, 10), pAdj = tr.pMean == null ? 1 : Math.min(1, tr.pMean * total);
    let cls; if (tr.n + te.n < 30 || te.n < 10) cls = 'Insufficient evidence'; else if (pAdj < 0.05 && te.excess != null && (te.excess > 0) === (tr.excess > 0) && te.pMean != null && te.pMean < 0.1 && wf.n >= 20 && wf.ci[0] > 0.5) cls = 'Validated'; else if (tr.pMean != null && tr.pMean < 0.05 && (te.excess > 0) === (tr.excess > 0)) cls = 'Promising but unconfirmed'; else cls = 'Failed validation';
    logExp('study', { id: st.id, P, horizon: 5 }, { cls, trainN: tr.n, testN: te.n });
    out.push({ name: st.name, id: st.id, cls, horizon: 5, train: { n: tr.n, excess: tr.excess, p: tr.pMean, pAdj }, test: { n: te.n, excess: te.excess, p: te.pMean }, wf: { n: wf.n, hits: wf.hits, lo: wf.ci[0], hi: wf.ci[1], avg: wf.avg }, data: R.src + ', ' + R.start + ' to ' + R.asof });
  });
  out.push({ name: 'Market fingerprint', cls: fpRes.promoted ? 'Validated' : 'Failed validation', test: { n: fpRes.T0.n, rate: fpRes.T0.rate, upRate: fpRes.T0.upRate } });
  const sm = JSON.parse(fs.readFileSync(path.join(D, 'research', 'semis.json'))); sm.tests.forEach(t => { const cls = t.n < 60 ? 'Insufficient evidence' : t.pAdj < 0.05 && t.oosGain > 0 ? 'Validated' : t.pAdj < 0.05 ? 'Failed validation' : t.oosGain > 0 ? 'Promising but unconfirmed' : 'Failed validation'; out.push({ name: t.asia + ' perp then ' + t.target, cls, test: { n: t.oosN, gain: t.oosGain }, train: { pAdj: t.pAdj } }) });
  out.push({ name: 'Asian chip stocks, local cash markets (KRX, TSE, TWSE)', cls: 'Data unavailable', why: 'No official local cash data feed is reachable from this project; only Hyperliquid perps (24 hour proxies) and the TSM ADR are available.' });
  const INAME = { highDone: 'Daily high already set', lowDone: 'Daily low already set', newHigh: 'New high later', newLow: 'New low later', openBack: 'Reclaims the open', vwapBack: 'Reclaims VWAP', closeUp: 'Closes above the prior close', rec25: 'Recovers 25% of the decline', rec50: 'Recovers 50%', rec75: 'Recovers 75%', rec100: 'Recovers 100%' };
  Object.keys(intra).forEach(k => { const s = intra[k]; out.push({ name: 'Intraday: ' + INAME[k], key: k, cls: s.n < 200 ? 'Insufficient evidence' : s.skill > 0.05 && s.first > 0.05 && s.second > 0.05 ? 'Validated' : s.skill > 0.05 ? 'Promising but unconfirmed' : 'Failed validation', test: { n: s.n, skill: s.skill, first: s.first, second: s.second } }) });
  const op = JSON.parse(fs.readFileSync(path.join(D, 'research', 'options.json'))); out.push({ name: 'Option strategies (CSP, covered call, spreads)', cls: op.trades.length < 30 ? 'Insufficient evidence' : 'Promising but unconfirmed', why: op.trades.length + ' settled trades from ' + op.snapshots + ' saved chains' });
  save('registry.json', { asof: now, tests: total, rules: 'Intraday outcomes are validated when walk forward skill beats the base rate by more than 0.05 in both halves of the test period. Validated: research period significant after adjusting for every test in the ledger, the untouched period agrees (p under 0.10), and walk forward is right more than half the time with its 95% range above 50%. Promising: significant before adjustment and the test period agrees in direction. Insufficient: under 30 events or under 10 in the test period. Failed: anything else.', signals: out });
}

(async () => { const fpRes = fingerprint(); seasonality(); try { await semis() } catch (e) { console.log('semis skipped:', e.message) } const intra = intraday(); options(); registry(fpRes, intra); fs.writeFileSync(LEDGER, JSON.stringify(ledger)); console.log('ledger', ledger.entries.length, 'configurations') })();
