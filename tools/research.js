// Offline research, run on the close: node tools/research.js
// Writes data/research/fingerprint.json, seasonality.json and semis.json. Uses src/core.js so the page and the research share one set of formulas.
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const D = path.join(__dirname, '..', 'data');
function load(sym) { const j = JSON.parse(fs.readFileSync(path.join(D, 'hist', sym + '.json'))); const o = { d: [], c: [], ix: {}, src: j.src, asof: j.asof, breaks: j.breaks }; const F = j.fields; if (F.length === 5) { o.o = []; o.h = []; o.l = [] } j.rows.forEach((r, i) => { o.d.push(r[0]); o.ix[r[0]] = i; if (F.length === 5) { o.o.push(r[1]); o.h.push(r[2]); o.l.push(r[3]); o.c.push(r[4]) } else o.c.push(r[1]) }); return o }
function save(name, obj) { fs.mkdirSync(path.join(D, 'research'), { recursive: true }); fs.writeFileSync(path.join(D, 'research', name), JSON.stringify(obj)); console.log('wrote', name) }
const now = new Date().toISOString();

/* 1. Fingerprint validation: walk forward, one test date every 20 sessions so outcome windows never overlap */
function fingerprint() {
  const H = { SPX: load('SPX'), VIX: load('VIX'), NDX: load('NDX'), US10Y: load('US10Y'), RSP10: load('RSP10'), SPY10: load('SPY10'), SMH10: load('SMH10'), QQQ10: load('QQQ10') };
  const F = C.features(H), S = H.SPX, K = 20, HOR = 20, keys = C.FEAT.map(x => x[0]);
  const models = [['All conditions', keys]].concat(C.FEAT.map(x => [x[1] + ' only', [x[0]]]));
  const res = models.map(m => ({ name: m[0], keys: m[1], pred: [], real: [] })), base = { pred: [], real: [] };
  let last = -1e9;
  for (let t = 0; t < F.length; t++) {
    if (F[t].d < 20050101 || F[t].i - last < HOR) continue; const real = C.fwdRet(S, F[t].i, HOR); if (real == null) continue; last = F[t].i;
    res.forEach(r => { const nb = C.neighbors(F, t, r.keys, K, 20, HOR); if (nb.length < 10) return; const p = C.mean(nb.map(x => C.fwdRet(S, F[x[1]].i, HOR))); r.pred.push(p); r.real.push(real) });
    const past = []; for (let j = 0; j < t - HOR; j += 5) { const v = C.fwdRet(S, F[j].i, HOR); if (v != null) past.push(v) } base.pred.push(C.mean(past)); base.real.push(real);
  }
  const score = r => { const n = r.pred.length, hit = r.pred.filter((p, i) => (p > 0) === (r.real[i] > 0)).length; return { n, hit, rate: n ? hit / n : null, ci: C.wilson(hit, n), ic: C.pearson(r.pred, r.real) } };
  const out = { asof: now, dataAsof: S.asof, horizon: HOR, k: K, from: 20050101, models: res.map(r => Object.assign({ name: r.name }, score(r))), baseline: score(base), alwaysUp: (() => { const n = base.real.length, h = base.real.filter(x => x > 0).length; return { n, hit: h, rate: h / n } })(),
    note: 'Each test date uses only features known that day and matches whose 20 session outcome had finished by then. Test dates are 20 sessions apart, so no outcome is counted twice. 10 single feature models were also tested, so treat a small edge as likely noise.' };
  save('fingerprint.json', out);
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

(async () => { fingerprint(); seasonality(); try { await semis() } catch (e) { console.log('semis skipped:', e.message) } })();
