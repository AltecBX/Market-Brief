// Offline research, run on the close: node tools/research.js
// Writes data/research/fingerprint.json, seasonality.json and semis.json. Uses src/core.js so the page and the research share one set of formulas.
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const D = path.join(__dirname, '..', 'data');
function load(sym) { const j = JSON.parse(fs.readFileSync(path.join(D, 'hist', sym + '.json'))); const o = { d: [], c: [], ix: {}, src: j.src, asof: j.asof, breaks: j.breaks }; const F = j.fields; if (F.length === 5) { o.o = []; o.h = []; o.l = [] } j.rows.forEach((r, i) => { o.d.push(r[0]); o.ix[r[0]] = i; if (F.length === 5) { o.o.push(r[1]); o.h.push(r[2]); o.l.push(r[3]); o.c.push(r[4]) } else o.c.push(r[1]) }); return o }
function save(name, obj) { fs.mkdirSync(path.join(D, 'research'), { recursive: true }); fs.writeFileSync(path.join(D, 'research', name), JSON.stringify(obj)); console.log('wrote', name) }
const now = new Date().toISOString();

/* Append only experiment ledger. Each run writes one new immutable file under data/research/ledger/ that records the code and data
   versions; ledger.json is only an index. Earlier files are never rewritten. An identical experiment (same kind, configuration, stage,
   data and code) is not written twice. Multiple testing uses the number of distinct configurations ever tested. */
const crypto = require('crypto');
const LDIR = path.join(D, 'research', 'ledger'), LEDGER = path.join(D, 'research', 'ledger.json');
function walkFiles(dir) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir).sort().flatMap(f => { const p = path.join(dir, f); return fs.statSync(p).isDirectory() ? walkFiles(p) : [p] }) }
function hashFiles(list) { const h = crypto.createHash('sha1'); list.forEach(f => { h.update(path.basename(f)); h.update(fs.readFileSync(f)) }); return h.digest('hex').slice(0, 12) }
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const CODEV = hashFiles(['src/core.js', 'tools/ml.js', 'tools/research.js', 'tools/intraday2.js', 'tools/weekly.js'].map(f => path.join(__dirname, '..', f)));
const DATAV = hashFiles(walkFiles(path.join(D, 'hist')).concat(walkFiles(path.join(D, 'intraday')), walkFiles(path.join(D, 'chains'))));
let LIDX = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER)) : null;
if (!LIDX || !LIDX.runs) {
  const old = LIDX; LIDX = { note: 'Index of the append only research ledger. Every run adds one file under data/research/ledger/ and never edits an earlier one. Each entry keeps its configuration, the stage (training, validation or test), the dates used and the result as first recorded, with the code and data versions of that run.', runs: [], seen: [], unique: [] };
  if (old && old.entries && old.entries.length) { fs.mkdirSync(LDIR, { recursive: true }); const f = '20261127T000000Z-legacy.json'; fs.writeFileSync(path.join(LDIR, f), JSON.stringify({ run: 'legacy', note: 'Entries recorded before the ledger became append only, kept exactly as they were.', entries: old.entries }));
    LIDX.runs.push({ file: f, ts: '2026-11-27T00:00:00Z', code: 'legacy', data: 'legacy', n: old.entries.length }); old.entries.forEach(e => LIDX.unique.push(sha(e.kind + ':' + JSON.stringify(e.config)))) }
}
const SEEN = new Set(LIDX.seen), UNIQ = new Set(LIDX.unique), RUN = [];
function logExp(kind, config, result, stage, dates) {
  const id = kind + ':' + JSON.stringify(config); UNIQ.add(sha(id)); const h = sha(id + '|' + (stage || '') + '|' + DATAV + '|' + CODEV); if (SEEN.has(h)) return; SEEN.add(h);
  RUN.push({ kind, config, stage: stage || null, dates: dates || null, result: result == null ? null : result });
}
function saveLedger() {
  if (RUN.length) { const ts = now.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 16); const f = ts + '.json', p = path.join(LDIR, f); fs.mkdirSync(LDIR, { recursive: true }); if (fs.existsSync(p)) throw new Error('ledger file already exists: ' + f);
    fs.writeFileSync(p, JSON.stringify({ run: ts, ts: now, code: CODEV, data: DATAV, entries: RUN })); LIDX.runs.push({ file: f, ts: now, code: CODEV, data: DATAV, n: RUN.length }) }
  LIDX.seen = [...SEEN]; LIDX.unique = [...UNIQ]; LIDX.total = LIDX.runs.reduce((a, r) => a + r.n, 0); LIDX.distinct = UNIQ.size; LIDX.code = CODEV; LIDX.data = DATAV;
  fs.writeFileSync(LEDGER, JSON.stringify(LIDX));
}

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

/* 1b. Fingerprint for options: does the same similarity search forecast volatility, range, drawdown and expected move breaches
   better than simple benchmarks? Tuned on 2005 to 2015, scored once on 2016 onward (that period was already looked at for direction,
   not for these targets). Benchmarks: the expanding average, and a VIX based forecast fit on earlier dates only. */
function fingerprintRisk() {
  const H = { SPX: load('SPX'), VIX: load('VIX'), NDX: load('NDX'), US10Y: load('US10Y'), RSP10: load('RSP10'), SPY10: load('SPY10'), SMH10: load('SMH10'), QQQ10: load('QQQ10') };
  const F = C.features(H), S = H.SPX, HOR = 20, all = C.FEAT.map(x => x[0]), V = H.VIX;
  const SETS = { all, price: ['dd', 'r5', 'r20', 'rv', 'ma'], macro: ['vix', 'dvix', 'y20', 'tech'], core: ['dd', 'r20', 'vix', 'rv'] };
  const T = F.map(f => { const i = f.i, c = S.c; if (i + HOR >= c.length) return null; const w = c.slice(i, i + HOR + 1), lr = []; for (let j = 1; j < w.length; j++) lr.push(Math.log(w[j] / w[j - 1]));
    const mx = Math.max(...w.slice(1)), mn = Math.min(...w.slice(1)), end = (w[HOR] / w[0] - 1) * 100, up = (mx / w[0] - 1) * 100, dn = (mn / w[0] - 1) * 100, vi = V.ix[S.d[i]], em = vi != null ? V.c[vi] / Math.sqrt(252 / HOR) : null;
    return { rv: C.sd(lr) * Math.sqrt(252) * 100, up, dn, range: (Math.max(mx, w[0]) - Math.min(mn, w[0])) / w[0] * 100, dd5: dn <= -5 ? 1 : 0, breach: em != null ? (Math.abs(end) > em ? 1 : 0) : null, rev: (up >= 3 && end < 0) || (dn <= -3 && end > 0) ? 1 : 0, vix: vi != null ? V.c[vi] : null } });
  const TG = { rv: ['Realized volatility, next 20 sessions', 'num'], dn: ['Maximum downside', 'num'], up: ['Maximum upside', 'num'], range: ['Trading range', 'num'], dd5: ['Chance of a 5% drawdown', 'bin'], breach: ['Expected move breach (VIX implied)', 'bin'], rev: ['Large reversal (3% one way, finishes the other side)', 'bin'] };
  const dates = (lo, hi) => { const out = []; let last = -1e9; for (let t = 0; t < F.length; t++) { if (F[t].d < lo || F[t].d >= hi || F[t].i - last < HOR || !T[t]) continue; last = F[t].i; out.push(t) } return out };
  const trainD = dates(20050101, 20151201), testD = dates(20160201, 99999999), cache = {};
  function nbr(ti, cfg) { const k = ti + '|' + cfg.set + '|' + cfg.k; if (cache[k]) return cache[k]; const t = F[ti], keys = SETS[cfg.set], c = [];
    for (let i = 0; i < ti - HOR; i++) { const f = F[i]; let s = 0, m = 0; for (const q of keys) { const a = t['z' + q], b = f['z' + q]; if (!C.isNum(a) || !C.isNum(b)) continue; s += (a - b) ** 2; m++ } if (m >= Math.max(1, keys.length - 2)) c.push([Math.sqrt(s / m), i]) }
    c.sort((a, b) => a[0] - b[0]); const pick = []; for (const x of c) { if (pick.length >= cfg.k) break; if (pick.every(p => Math.abs(F[p[1]].i - F[x[1]].i) >= HOR)) pick.push(x) } return (cache[k] = pick) }
  const bench = (ti, key, kind) => { const past = []; for (let j = 0; j < ti - HOR; j += 3) if (T[j] && C.isNum(T[j][key]) && C.isNum(T[j].vix)) past.push([T[j].vix, T[j][key]]); const v = T[ti].vix, mean = C.mean(past.map(p => p[1]));
    if (kind === 'bin') { const vb = x => x < 15 ? 0 : x < 20 ? 1 : x < 30 ? 2 : 3, s = past.filter(p => vb(p[0]) === vb(v)); return [mean, s.length >= 20 ? (C.mean(s.map(p => p[1])) * s.length + mean * 5) / (s.length + 5) : mean] }
    const mx = C.mean(past.map(p => p[0])), my = mean; let sxy = 0, sxx = 0; past.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2 }); return [mean, my + (sxx ? sxy / sxx : 0) * (v - mx)] };
  const grid = []; Object.keys(SETS).forEach(set => [20, 40].forEach(k => grid.push({ set, k })));
  const out = {};
  for (const key of Object.keys(TG)) {
    const kind = TG[key][1], loss = (p, y) => kind === 'bin' ? (p - y) ** 2 : Math.abs(p - y);
    const evalD = (cfg, D) => D.filter(t => T[t][key] != null).map(t => { const nb = nbr(t, cfg).filter(x => T[x[1]] && T[x[1]][key] != null); const p = nb.length ? C.mean(nb.map(x => T[x[1]][key])) : null; const b = bench(t, key, kind); return { t, y: T[t][key], p, b0: b[0], b1: b[1] } }).filter(r => r.p != null);
    const tr = grid.map(cfg => { const r = evalD(cfg, trainD), l = C.mean(r.map(z => loss(z.p, z.y))); logExp('fingerprint-risk', { target: key, cfg }, { trainLoss: l, n: r.length }, 'train', [20050101, 20151201]); return { cfg, l } }).sort((a, b) => a.l - b.l);
    const best = tr[0].cfg, R = evalD(best, testD), g = {}; R.forEach((r, i) => { g[i] = [i] });
    const L = f => C.mean(R.map(f)), lm = L(z => loss(z.p, z.y)), l0 = L(z => loss(z.b0, z.y)), l1 = L(z => loss(z.b1, z.y)), bb = l1 <= l0 ? 'b1' : 'b0';
    const gain = idx => C.mean(idx.map(i => loss(R[i][bb], R[i].y) - loss(R[i].p, R[i].y))), ci = C.blockBoot(g, gain, 600, 21);
    const res = { name: TG[key][0], kind, cfg: best, n: R.length, model: +lm.toFixed(4), meanBench: +l0.toFixed(4), vixBench: +l1.toFixed(4), gain: +gain(R.map((_, i) => i)).toFixed(4), ci: ci.map(v => v == null ? null : +v.toFixed(4)),
      skill: +(1 - lm / Math.min(l0, l1)).toFixed(3), ok: ci[0] != null && ci[0] > 0, ic: kind === 'num' ? +C.pearson(R.map(z => z.p), R.map(z => z.y)).toFixed(3) : null };
    if (kind === 'bin') res.rate = +C.mean(R.map(z => z.y)).toFixed(3);
    logExp('fingerprint-risk-test', { target: key, cfg: best }, res, 'test', [20160201, S.asof]);
    out[key] = res;
  }
  /* today's risk forecast from the frozen settings */
  const last = F.length - 1, today = {}; Object.keys(out).forEach(key => { const nb = nbr(last, out[key].cfg).filter(x => T[x[1]] && T[x[1]][key] != null); today[key] = nb.length ? +C.mean(nb.map(x => T[x[1]][key])).toFixed(3) : null });
  return { horizon: HOR, trainDates: trainD.length, testDates: testD.length, targets: out, today, asofDate: F[last].d,
    note: 'Each target was tuned on 2005 to 2015 (4 condition sets by 20 or 40 matches) and scored once on non overlapping 20 session windows from 2016. The 2016 onward period had already been inspected for the direction forecast, so it is not pristine for these targets; a prospective record starts now. Loss is absolute error for amounts and squared error for chances. A target counts as useful only if the error improvement over the better benchmark has a 95% range above zero.' };
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

/* 5. Options strategies from saved chain snapshots whose expiry has passed */
function options() {
  /* Real end of session chains only. Each strategy is run as a portfolio: one position at a time per underlying (a new one opens only
     after the previous expired), sells fill at the bid, buys at the ask, $0.65 a contract. Capital in use, equity drawdown and
     early assignment risk around SPY's quarterly ex dividend dates are tracked. */
  const cd = path.join(D, 'chains'), V = load('VIX'), res = [], pend = [], tick = fs.existsSync(cd) ? fs.readdirSync(cd) : [];
  let snaps = 0;
  tick.forEach(tk => { const dir = path.join(cd, tk), S = (() => { try { return load(tk + '10') } catch (e) { try { return load(tk) } catch (e2) { return null } } })(); fs.readdirSync(dir).sort().forEach(f => { snaps++; const sn = JSON.parse(fs.readFileSync(path.join(dir, f))); const j = S ? S.ix[+sn.expiry.replace(/-/g, '')] : null; if (j == null) { pend.push(sn.ticker + ' ' + sn.expiry); return } const vi = V.ix[+sn.session.replace(/-/g, '')];
    const exd = []; if (tk === 'SPY') { /* SPY goes ex dividend on the third Friday of March, June, September and December */ const y0 = +sn.session.slice(0, 4); [y0, y0 + 1].forEach(y => [3, 6, 9, 12].forEach(m => { const d1 = new Date(Date.UTC(y, m - 1, 1)), fr = (5 - d1.getUTCDay() + 7) % 7 + 1 + 14; exd.push(+(y + String(m).padStart(2, '0') + String(fr).padStart(2, '0'))) })) }
    C.optionStrategies(sn, S.c[j], 0.0065).forEach(o => { const s0 = +sn.session.replace(/-/g, ''), e0 = +sn.expiry.replace(/-/g, ''), x = exd.find(d => d > s0 && d <= e0); let early = false; if (x && /Covered call/.test(o.name)) { const pi = S.d.findIndex(d => d >= x) - 1; const k = (C.pickDelta(sn.rows, 'C', 0.20) || [])[1]; if (pi >= 0 && k && S.c[pi] > k) early = true }
      res.push(Object.assign({ ticker: tk, session: sn.session, expiry: sn.expiry, vix: vi != null ? V.c[vi] : null, exDiv: x || null, earlyRisk: early }, o)) }) }) });
  const by = {}; res.forEach(r => (by[r.ticker + '|' + r.name] = by[r.ticker + '|' + r.name] || []).push(r));
  const summary = Object.keys(by).map(k => { const a = by[k].sort((p, q) => p.session < q.session ? -1 : 1), port = []; let busy = ''; a.forEach(t => { if (t.session >= busy) { port.push(t); busy = t.expiry } });
    let eq = 0, peak = 0, dd = 0, cap = 0, days = 0; port.forEach(t => { eq += t.pnl * 100; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); const dte = (Date.parse(t.expiry) - Date.parse(t.session)) / 864e5; cap += t.capital * 100 * dte; days += dte });
    const rets = port.map(x => x.ret).filter(C.isNum);
    return { ticker: k.split('|')[0], name: k.split('|')[1], n: a.length, portfolio: port.length, win: port.filter(x => x.pnl > 0).length, avgRet: rets.length ? C.mean(rets) : null, worst: rets.length ? Math.min(...rets) : null, totalPnl: eq, maxDD: dd, avgCapital: days ? cap / days : null, assigned: port.filter(x => x.assigned).length, earlyRisk: port.filter(x => x.earlyRisk).length, avgSpread: C.mean(a.map(x => x.spread)) } });
  save('options.json', { asof: now, snapshots: snaps, tickers: tick, pending: pend.length, trades: res, summary, minTrades: 30,
    note: 'Built only from real end of session chains saved by the close run (bid, ask, delta, implied volatility, open interest). Each strategy runs as a portfolio with one position at a time per stock, so trades never overlap; profit, drawdown and average capital in use are in dollars per contract. Sells fill at the bid, buys at the ask, plus $0.65 a contract. Held to expiry and settled on the closing price; early assignment is flagged when a short call is in the money the day before a SPY ex dividend date. Nothing is called validated before 30 settled trades.' });
}

/* 6. Signal reliability registry. Every signal lists its instrument, horizon, independent sample, benchmark, out of sample result,
   range, calibration, regime sensitivity, economic usefulness, validation date and data freshness. Statistical class and economic
   class are separate: a statistically reliable estimate is not a profitable strategy by itself. */
let PROS = null;
function registry(fpRes, risk, I2, WK, REC) {
  const H = {}; ['SPX', 'VIX', 'NDX', 'SPY', 'QQQ', 'N225', 'SMH', 'SPY10', 'RSP10', 'NVDA10'].forEach(s => { try { H[s] = load(s) } catch (e) { } });
  const total = UNIQ.size + C.STUDIES.length, out = [], fresh = sym => { try { return load(sym).asof } catch (e) { return null } }, day = now.slice(0, 10);
  const add = o => out.push(Object.assign({ validated: day, econ: 'Not tested' }, o));
  C.STUDIES.forEach(st => {
    const need = st.tgt === 'pick' ? ['NVDA10'] : st.data; if (need.some(s => !H[s])) { add({ name: st.name, cls: 'Data unavailable' }); return }
    const P = {}; st.p.forEach(p => P[p[0]] = p[2]); const R = C.runStudy(st, P, { gap: 5, pick: 'NVDA10' }, H);
    const tr = C.summarize(R, 5, 'train'), te = C.summarize(R, 5, 'test'), wf = C.walkForward(R, 5, 10), pAdj = tr.pMean == null ? 1 : Math.min(1, tr.pMean * total);
    let cls; if (tr.n + te.n < 30 || te.n < 10) cls = 'Insufficient evidence'; else if (pAdj < 0.05 && te.excess != null && (te.excess > 0) === (tr.excess > 0) && te.pMean != null && te.pMean < 0.1 && wf.n >= 20 && wf.ci[0] > 0.5) cls = 'Validated'; else if (tr.pMean != null && tr.pMean < 0.05 && (te.excess > 0) === (tr.excess > 0)) cls = 'Promising but unconfirmed'; else cls = 'Failed validation';
    logExp('study', { id: st.id, P, horizon: 5 }, { cls, trainN: tr.n, testN: te.n }, 'registry');
    add({ name: st.name, id: st.id, cls, instrument: st.tgt === 'pick' ? 'NVDA, MU, AMD, WDC, SMH, SOXX (chosen in History)' : st.data.join(', '), horizon: '5 sessions', sessions: tr.n + te.n, n: tr.n + te.n, bench: 'Same entry on every day of the same period', oos: te.excess == null ? null : 'excess ' + C.sg(te.excess) + ' over ' + te.n + ' untouched events', ci: wf.n ? 'walk forward right ' + Math.round(wf.ci[0] * 100) + ' to ' + Math.round(wf.ci[1] * 100) + '%' : null, calib: 'not a probability', regime: null, econ: 'Not tested as a strategy', fresh: R.asof, train: { n: tr.n, excess: tr.excess, pAdj }, test: { n: te.n, excess: te.excess } });
  });
  const T0 = fpRes.T0; add({ name: 'Market fingerprint, 20 day direction', cls: fpRes.promoted ? 'Validated' : 'Failed validation', instrument: 'S&P 500', horizon: '20 sessions', sessions: T0.n, n: T0.n, bench: 'Calling up every time ' + Math.round(T0.upRate * 100) + '%', oos: 'right ' + Math.round(T0.rate * 100) + '%', ci: Math.round(T0.ci[0] * 100) + ' to ' + Math.round(T0.ci[1] * 100) + '%', calib: 'not a probability', econ: T0.longFlat > T0.buyHold ? 'Long or flat beat holding' : 'Long or flat did not beat holding', fresh: fresh('SPX') });
  Object.keys(risk.targets).forEach(k => { const r = risk.targets[k]; add({ name: 'Fingerprint: ' + r.name, cls: r.ok ? 'Promising but unconfirmed' : 'Failed validation', why: r.ok ? 'Beat both benchmarks on 2016 onward, a period already inspected for direction, so it needs the prospective record to be validated.' : null, instrument: 'S&P 500', horizon: '20 sessions', sessions: r.n, n: r.n, bench: 'better of expanding average and VIX based, error ' + Math.min(r.meanBench, r.vixBench), oos: 'error ' + r.model + ', skill ' + r.skill, ci: 'improvement ' + r.ci.join(' to '), calib: r.kind === 'bin' ? 'squared error scored' : 'n/a', econ: 'Not tested as a strategy', fresh: fresh('SPX') }) });
  const sm = JSON.parse(fs.readFileSync(path.join(D, 'research', 'semis.json')));
  sm.tests.forEach(t => { const cls = t.n < 60 ? 'Insufficient evidence' : t.pAdj < 0.05 && t.oosGain > 0 ? 'Validated' : t.pAdj < 0.05 ? 'Failed validation' : t.oosGain > 0 ? 'Promising but unconfirmed' : 'Failed validation'; add({ name: t.asia + ' perp to ' + t.target + ', next US session', cls, instrument: t.target, horizon: 'next US session', sessions: t.n, n: t.n, bench: 'no Asia information', oos: 'out of sample gain ' + (C.isNum(t.oosGain) ? (t.oosGain * 100).toFixed(1) + '%' : 'n/a'), ci: 'adjusted p ' + (C.isNum(t.pAdj) ? t.pAdj.toFixed(2) : 'n/a'), calib: 'n/a', econ: 'Not tested as a strategy', fresh: sm.asof ? sm.asof.slice(0, 10) : null }) });
  add({ name: 'Asian chip stocks, local cash markets (KRX, TSE, TWSE)', cls: 'Data unavailable', why: 'No official local cash data feed is reachable from this project; only Hyperliquid perps (24 hour proxies) and the TSM ADR are available.' });
  Object.keys(I2.inst).forEach(sym => { const I = I2.inst[sym]; Object.keys(I.windows).forEach(w => { const W = I.windows[w]; Object.keys(W.outcomes).forEach(o => { const q = W.outcomes[o], ms = q.models, best = Object.keys(ms).filter(f => f !== 'tod' && f !== 'pos').sort((a, b) => ms[a].brier - ms[b].brier)[0], m = ms[best], pb = ms.pos;
    const cls = m.stat ? 'Validated' : m.vsBenchCI[0] != null && m.vsBench > 0 ? 'Promising but unconfirmed' : m.sessions < 30 ? 'Insufficient evidence' : 'Failed validation';
    const pv = PROS && PROS.vid[[sym, w, o, best].join('|')], pr = pv && PROS.res.versions[pv];
    add({ name: sym + ' intraday: ' + q.name + ' (' + (w === 'early' ? '9:35 to 10am' : '10am to 3:30pm') + ')', cls, model: m.name, instrument: sym, horizon: 'rest of the session', sessions: m.sessions, n: m.n, bench: 'time and position frequency, skill ' + pb.bss, oos: m.name + ' skill ' + m.bss + ' vs time of day', ci: 'vs best benchmark ' + m.vsBenchCI.join(' to '), calib: 'calibration error ' + m.ece, regime: 'VIX high ' + m.regimes.vixHigh + ', low ' + m.regimes.vixLow + (m.oneRegime ? ' (one regime only in the test)' : ''), econ: m.econOk && m.meaningful ? 'Economically useful' : C.isNum(m.econ) ? 'Not economically useful' : 'Too few signals', econVal: m.econ, promoted: !!q.promoted, fresh: W.to, prospective: pr ? { sessions: pr.sessions || 0, n: pr.n, bss: pr.bss, version: pv } : { sessions: 0, version: pv }, note: 'Benchmark frequency itself: skill ' + pb.bss + ' vs time of day, calibration error ' + pb.ece }) }) }) });
  Object.keys(WK.inst).forEach(sym => { const I = WK.inst[sym]; if (I.error) return; Object.keys(I.outcomes).forEach(o => { const q = I.outcomes[o], m = q.models.logit;
    add({ name: sym + ' weekly: ' + q.name, cls: q.beatsBench ? 'Validated' : q.n < 100 ? 'Insufficient evidence' : 'Failed validation', model: 'Regularized logistic regression', instrument: sym, horizon: 'rest of the week', sessions: q.weeksTested, n: q.n, bench: 'better of day of week and day with position, error ' + Math.min(q.models.day.brier, q.models.daypos.brier), oos: 'error ' + m.brier, ci: 'improvement ' + m.ci.join(' to '), calib: 'squared error scored', econ: !m.econApplies ? 'Not applicable' : m.econ == null ? 'Too few signals' : m.econCI[0] > 0 && m.econ >= 0.15 ? 'Economically useful' : 'Not economically useful', econVal: m.econ, promoted: !!q.promoted, fresh: I.to }) }) });
  const r = REC.rec; add({ name: 'Chip stock recovery after a 10% one day drop', cls: r[60].clusters >= 20 ? 'Promising but unconfirmed' : 'Insufficient evidence', why: 'A descriptive base rate, not a timing signal; events in the same selloff are correlated, so the ranges resample whole market clusters.', instrument: 'NVDA, MU, AMD, WDC, SMH, SOXX', horizon: '20, 60, 120 sessions', sessions: r[60].clusters, n: r[60].n, bench: 'none', oos: 'back in 60 sessions ' + Math.round(r[60].p * 100) + '%', ci: Math.round(r[60].ci[0] * 100) + ' to ' + Math.round(r[60].ci[1] * 100) + '%', calib: 'n/a', econ: 'Not tested as a strategy', fresh: REC.asof });
  const op = JSON.parse(fs.readFileSync(path.join(D, 'research', 'options.json'))); add({ name: 'Option strategies (CSP, covered call, spreads)', cls: op.trades.length < 30 ? 'Insufficient evidence' : 'Promising but unconfirmed', why: op.trades.length + ' settled trades from ' + op.snapshots + ' saved chains', instrument: (op.tickers || []).join(', '), horizon: 'to expiry', n: op.trades.length, econ: op.trades.length < 30 ? 'Not enough settled trades' : 'See option research', fresh: now.slice(0, 10) });
  save('registry.json', { asof: now, tests: total, distinct: UNIQ.size, code: CODEV, data: DATAV, rules: 'Statistical class: Validated means beating the benchmark out of sample with a 95% range above zero (intraday models must also be calibrated, hold in each VIX regime seen, and add economic value). Promising means it beat the benchmark but failed one condition, or was tested only on data already inspected. Economic class is separate and is measured with costs. Multiple testing uses ' + total + ' distinct configurations in the ledger.', signals: out });
}

function recoveryDefault() {
  const L = ['NVDA', 'MU', 'AMD', 'WDC', 'SMH', 'SOXX'].map(s => { const o = load(s + '10'); o.sym = s; try { const k = load(s); o.low = {}; k.d.forEach((d, i) => { o.low[d] = k.l[i] }) } catch (e) { } return o });
  const R = C.recovery2(L, 10, { days: 1 }), out = { asof: L[0].asof, x: 10, days: 1, events: R.ev.length, clusters: R.clusters, rec: R.rec, tmed: R.tmed, mae: R.mae, maeLow: R.maeLow, maeLowN: R.maeLowN };
  logExp('recovery', { x: 10, days: 1, syms: L.map(s => s.sym) }, { events: out.events, clusters: out.clusters, rec60: R.rec[60].p }, 'descriptive'); return out;
}
(async () => {
  const fpRes = fingerprint(), risk = fingerprintRisk(); const fp = JSON.parse(fs.readFileSync(path.join(D, 'research', 'fingerprint.json'))); fp.risk = risk; save('fingerprint.json', fp);
  seasonality(); try { await semis() } catch (e) { console.log('semis skipped:', e.message) }
  const I2 = await require('./intraday2.js').run((k, e) => logExp(k, { sym: e.sym, window: e.window, outcome: e.outcome, model: e.model }, e.result || (e.logloss != null ? { logloss: e.logloss } : null), e.stage, e.sessions));
  const WK = require('./weekly.js').run((k, cfg, res) => logExp(k, cfg, res, 'test'));
  const REC = recoveryDefault(); options();
  const PR = require('./prospective.js').run(); const V = JSON.parse(fs.readFileSync(path.join(D, 'prospective', 'versions.json'))), vid = {}; V.versions.forEach(v => { if (v.kind === 'intraday') vid[[v.sym, v.window, v.outcome, v.family].join('|')] = v.id });
  PROS = { vid, res: JSON.parse(fs.readFileSync(path.join(D, 'research', 'prospective.json'))) }; logExp('prospective', { versions: PR.versions }, PR, 'record');
  registry(fpRes, risk, I2, WK, REC); saveLedger(); require('./health.js').run();
  const old = path.join(D, 'research', 'intraday.json'); if (fs.existsSync(old)) fs.unlinkSync(old);
  console.log('ledger', LIDX.total, 'entries,', LIDX.distinct, 'distinct configurations, code', CODEV, 'data', DATAV);
})();
