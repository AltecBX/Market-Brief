// Run: node tests/core.test.js   Regression tests for statistics, history studies, reversal and exhaustion, expected moves, news reactions, forecast scoring and the fingerprint.
const C = require('../src/core.js');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m) } };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= (e || 1e-9), m + ' (got ' + a + ', want ' + b + ')');
function series(closes, start, extra) { const o = { d: [], c: closes.slice(), ix: {}, src: 'test', asof: 0 }; let d = new Date(Date.UTC(2000, 0, 3)); closes.forEach((_, i) => { while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 864e5); const k = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); o.d.push(k); o.ix[k] = i; d = new Date(d.getTime() + 864e5) }); o.asof = o.d[o.d.length - 1]; return Object.assign(o, extra || {}) }

/* statistics */
near(C.median([3, 1, 2]), 2, 0, 'median odd'); near(C.median([4, 1, 2, 3]), 2.5, 0, 'median even');
near(C.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001, 'sample sd');
const w = C.wilson(50, 100); ok(w[0] > 0.40 && w[0] < 0.41 && w[1] > 0.59 && w[1] < 0.60, 'wilson 50 of 100');
near(C.ncdf(0), 0.5, 1e-6, 'normal cdf at 0'); near(C.ncdf(1.96), 0.975, 1e-3, 'normal cdf at 1.96');
ok(C.pProp(50, 100, 0.5) > 0.9, 'p value for no difference is high'); ok(C.pProp(80, 100, 0.5) < 0.001, 'p value for a big difference is tiny');
near(C.pearson([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]), 1, 1e-9, 'pearson perfect');

/* history study: a 3% drop every 50 sessions on a flat drift series */
const cl = []; let p = 100; for (let i = 0; i < 600; i++) { p *= (i % 50 === 25) ? 0.97 : 1.001; cl.push(p) }
const S = series(cl);
const st = { id: 't', data: ['X'], tgt: 'X', p: [], ev: (H, i) => { const c = H.X.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -2.5 ? { v: 1 } : null } };
const R = C.runStudy(st, {}, { gap: 1 }, { X: S });
ok(R.all.length === 12, 'finds every drop (' + R.all.length + ')');
near(R.all[0].r[1], 0.1, 1e-6, 'event 1 session return uses the close to close after entry');
ok(R.sets[20].length === R.sets[1].length, 'events 50 sessions apart never overlap at 20 sessions');
/* overlapping events: drop every 3 sessions */
const cl2 = []; p = 100; for (let i = 0; i < 300; i++) { p *= (i % 3 === 0) ? 0.97 : 1.02; cl2.push(p) }
const R2 = C.runStudy(st, {}, { gap: 1 }, { X: series(cl2) });
ok(R2.sets[1].length > R2.sets[5].length && R2.sets[5].length > R2.sets[20].length, 'longer horizons keep fewer, non overlapping events');
const ent = R2.sets[20].map(x => x.ei); ok(ent.every((e, i) => i === 0 || e - ent[i - 1] >= 20), 'no two 20 session windows overlap');
ok(R2.sets[5].map(x => x.ei).every((e, i, a) => i === 0 || e - a[i - 1] >= 5), 'no two 5 session windows overlap');
/* entry next: returns start at the next close, and the baseline uses the same rule */
const stN = Object.assign({}, st, { entry: 'next' }), R3 = C.runStudy(stN, {}, { gap: 1 }, { X: S }), e0 = R3.all[0];
near(e0.r[1], (S.c[e0.ti + 2] / S.c[e0.ti + 1] - 1) * 100, 1e-9, 'next close entry');
near(R3.base[1].mean, R.base[1].mean, 0.02, 'baseline uses the same one session window length');
/* breaks: no window crosses a corporate action */
const Sb = series(cl, 0, {}); Sb.breaks = [Sb.d[30]];
const Rb = C.runStudy(st, {}, { gap: 1 }, { X: Sb }); const first = Rb.all.find(x => x.ti === 25);
ok(first && first.r[1] != null && first.r[5] == null && first.r[20] == null, 'windows crossing a break are dropped');
/* open entry */
const So = series(cl); So.o = So.c.map((c, i) => i ? So.c[i - 1] * 1.01 : c); So.h = So.c.map((c, i) => Math.max(c, So.o[i]) * 1.001); So.l = So.c.map((c, i) => Math.min(c, So.o[i]) * 0.999);
const stO = Object.assign({}, st, { entry: 'open' }), Ro = C.runStudy(stO, {}, { gap: 1 }, { X: So }), xo = Ro.all[0];
near(xo.r[0], (So.c[xo.ti] / So.o[xo.ti] - 1) * 100, 1e-9, 'open entry same day return'); near(xo.r[1], (So.c[xo.ti + 1] / So.o[xo.ti] - 1) * 100, 1e-9, 'open entry 1 session return');
/* walk forward uses only earlier events */
const wf = C.walkForward(R2, 1, 10); ok(wf.n === R2.sets[1].length - 10, 'walk forward starts after 10 prior events');
/* hold out */
ok(R.cut > R.start, 'test period cut lies inside the data');

/* reversal: completed candles, ordering, structure */
const t0 = Date.UTC(2026, 10, 30, 14, 30), mk = (arr) => arr.map((x, i) => ({ t: t0 + i * 3e5, o: x[0], h: x[1], l: x[2], c: x[3], v: x[4] || 100 }));
const comp = C.completed(mk([[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]]), t0 + 2 * 3e5 + 1000, 3e5); ok(comp.length === 2, 'the forming candle is excluded');
const same = mk([[100, 100.2, 99.8, 100], [100, 100.5, 99.9, 100], [100, 101, 97, 99]]), sw = C.swing(same, 1); ok(sw.pk < sw.tr && sw.peak === 100.5, 'the trough candle\'s own high is never used as the peak');
const only = mk([[100, 101, 97, 99], [99, 99.5, 98, 99], [99, 99.6, 98.5, 99]]); ok(C.swing(only, 1).ambiguous === true, 'a low in the first candle has no earlier peak, so it is ambiguous');
const path = []; let v = 100; for (let i = 0; i < 18; i++) { const o = v; v *= 0.998; path.push([o, o * 1.0005, v * 0.9995, v, 200]) } const low = v;
const recov = [[v, v * 1.003, v * 0.9996, v * 1.002], [v * 1.002, v * 1.004, v * 1.0005, v * 1.003], [v * 1.003, v * 1.004, v * 1.001, v * 1.0035], [v * 1.0035, v * 1.006, v * 1.0025, v * 1.0055], [v * 1.0055, v * 1.008, v * 1.004, v * 1.0075], [v * 1.0075, v * 1.008, v * 1.003, v * 1.004], [v * 1.004, v * 1.007, v * 1.0035, v * 1.0065], [v * 1.0075, v * 1.01, v * 1.006, v * 1.0095], [v * 1.0095, v * 1.012, v * 1.008, v * 1.011], [v * 1.011, v * 1.014, v * 1.0095, v * 1.013], [v * 1.013, v * 1.02, v * 1.012, v * 1.019], [v * 1.019, v * 1.026, v * 1.018, v * 1.025], [v * 1.025, v * 1.03, v * 1.024, v * 1.029]].map(x => x.concat([120]));
const K = mk(path.concat(recov)), s = C.swing(K, 1), stc = C.structure(K, s);
ok(s.pk < s.tr && Math.abs(s.ext - low * 0.9995) < 1e-6, 'trough found after the peak');
ok(stc.higherLows >= 1, 'higher low detected'); ok(stc.structureBreak === true || stc.lastLowerHigh === null, 'structure break checked');
const cls = C.classify(s, stc, { semiRec: 0.8, breadthPct: 70, mins: 60, groupSpread: 0 }); ok(/Partial|sustainable|Broad|without/.test(cls.label), 'classification returns a label: ' + cls.label);
const cls2 = C.classify({ dir: 1, rec: 0.1 }, { higherLows: 0 }, { mins: 5 }); ok(cls2.label === 'No reversal yet, near the low', 'near the low is not called a reversal');
/* exhaustion: slowing decline with long lower wicks */
const ex = []; v = 100; for (let i = 0; i < 14; i++) { const o = v, step = i < 8 ? 0.996 : 0.9995; v *= step; ex.push([o, o * 1.0003, i >= 10 ? v * 0.996 : v * 0.9995, i >= 10 ? v * 1.001 : v, i >= 10 ? 60 : 200]) }
const KE = mk(ex), sE = C.swing(KE, 1), exs = C.exhaustion(KE, sE, []); ok(exs.some(x => /Momentum slowing/.test(x)), 'momentum slowing detected'); ok(exs.some(x => /closed well off their lows/.test(x)), 'lower wicks detected');

/* expected move */
const r = C.emRange(7182.78, 1.1731); near(r.m, 84.26, 0.01, 'expected move points'); near(r.hi, 7267.04, 0.01, 'upper bound'); near(r.lo, 7098.52, 0.01, 'lower bound');
const u = C.emUsed(7182.78, 1.1731, 7311.6); ok(u.used > 152 && u.used < 153, 'share of the move used'); ok(u.toTop < 0, 'past the top shows negative room');

/* news reaction windows */
const ts = Date.UTC(2026, 10, 27, 15, 0, 20), m0 = ts - ts % 60e3, cands = []; for (let k = -20; k <= 70; k++) cands.push({ t: m0 + k * 60e3, o: 100 + k * 0.01, c: 100 + (k + 1) * 0.01 });
const ic = C.impactCalc(cands, ts, m0 + 31 * 60e3);
near(ic.base, 100, 1e-9, 'base is the close of the last full minute before the headline');
ok(ic.w[5] != null && ic.w[30] != null && ic.w[60] == null, 'unfinished windows are not reported');
near(ic.w[5], (100.05 / 100 - 1) * 100, 1e-9, '5 minute window uses the close at minute 5');

/* forecast scoring: revisions do not inflate the sample */
const SP = series([100, 101, 99, 102]); const iso = k => String(k).slice(0, 4) + '-' + String(k).slice(4, 6) + '-' + String(k).slice(6);
const day2 = iso(SP.d[2]), day3 = iso(SP.d[3]), closeAt = s2 => Date.parse(s2 + 'T21:00:00Z');
const docs = [{ updated: day2 + 'T12:00:00Z', forecast: { dir: 'up', date: day2, ref: 101 } }, { updated: day2 + 'T15:00:00Z', forecast: { dir: 'down', date: day2, ref: 101 } }, { updated: day2 + 'T22:00:00Z', forecast: { dir: 'up', date: day2, ref: 101 } }, { updated: day3 + 'T12:00:00Z', forecast: { dir: 'up', date: day3, ref: 99 } },
  { updated: day2 + 'T12:00:00Z', opt: { asof: 'X', base: 100, em: [['a', 2, 'n', 'SPX', day3]] } }, { updated: day2 + 'T15:00:00Z', opt: { asof: 'X', base: 100, em: [['a', 2, 'n', 'SPX', day3]] } }];
const sc = C.scoreForecasts(docs, SP, closeAt);
ok(sc.dir.n === 2, 'two sessions scored, not four (' + sc.dir.n + ')'); ok(sc.dir.revisions === 1, 'one revision counted'); ok(sc.dir.hit === 2, 'the last call before the close is the one scored');
ok(sc.cov.n === 1 && sc.cov.dup === 1, 'repeat copies of one option expiry collapse to one');

/* fingerprint: no lookahead */
const big = []; p = 1000; for (let i = 0; i < 900; i++) { p *= 1 + Math.sin(i / 17) * 0.004; big.push(p) }
const H = { SPX: series(big), VIX: series(big.map((x, i) => 15 + 5 * Math.sin(i / 30))), NDX: series(big.map(x => x * 2)), US10Y: series(big.map((x, i) => 3 + Math.sin(i / 50))) };
const F = C.features(H); ok(F.length > 500, 'features computed');
const F2 = C.features({ SPX: series(big.slice(0, 700)), VIX: series(H.VIX.c.slice(0, 700)), NDX: series(H.NDX.c.slice(0, 700)), US10Y: series(H.US10Y.c.slice(0, 700)) });
const k = 300; near(F2[k].zdd, F[k].zdd, 1e-9, 'scaling at a date does not change when later data is added');
const nb = C.neighbors(F, F.length - 1, ['dd', 'vix'], 10, 20, 20); ok(nb.every(x => x[1] < F.length - 1 - 20), 'matches exclude the last 20 sessions');
ok(nb.every((x, i) => nb.every((y, j) => i === j || Math.abs(F[x[1]].i - F[y[1]].i) >= 20)), 'matches are at least 20 sessions apart');

console.log(fails ? fails + ' of ' + n + ' failed' : 'all ' + n + ' passed'); process.exit(fails ? 1 : 0);
