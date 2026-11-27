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


/* ---------- Leakage and inflation tests ---------- */
/* 1. walk forward benchmark must not see the future: make the second half of history rise sharply; early predictions must not change */
const lk = []; p = 100; for (let i = 0; i < 1200; i++) { p *= (i % 40 === 20) ? 0.97 : (i < 600 ? 1.0002 : 1.004); lk.push(p) }
const lkA = C.runStudy(st, {}, { gap: 1 }, { X: series(lk) }), lk2 = lk.slice(0, 600); const lkB = C.runStudy(st, {}, { gap: 1 }, { X: series(lk2) });
const wA = C.walkForward(lkA, 5, 3), wB = C.walkForward(lkB, 5, 3);
ok(wB.n > 0 && wA.n > wB.n, 'walk forward ran on both samples');
/* the first wB.n predictions in A must equal those of B, since later data must not influence them */
function wfSeq(R, k, minPrior) { const a = R.sets[k], L = R.base[k].list; let li = 0, bs = 0, bn = 0; const done = [], seq = []; a.forEach(x => { while (li < L.length && L[li][0] + k <= x.ei) { bs += L[li][1]; bn++; li++ } const bench = bn ? bs / bn : 0, known = done.filter(q => q.e + k <= x.ei); if (known.length >= minPrior && bn >= 20) seq.push(C.mean(known.map(q => q.ex)) > 0); done.push({ e: x.ei, ex: x.r[k] - bench }) }); return seq }
const sA = wfSeq(lkA, 5, 3), sB = wfSeq(lkB, 5, 3); ok(sB.every((v, i) => v === sA[i]), 'early walk forward decisions do not change when future data is added');
/* 2. purge and embargo: no training window reaches the cut, no test entry starts inside the embargo */
[1, 5, 20].forEach(k => { (lkA.sets[k] || []).forEach(x => { const tr = x.ei + k <= lkA.cutIdx, te = x.ei >= lkA.cutIdx + k; ok(!(tr && te), 'event is in at most one part'); if (tr) ok(x.ei + k <= lkA.cutIdx, 'training window ends before the cut') }) });
const smT = C.summarize(lkA, 20, 'train'), smE = C.summarize(lkA, 20, 'test'), allN = lkA.sets[20].length; ok(smT.n + smE.n < allN, 'purge and embargo remove events near the split (' + smT.n + ' + ' + smE.n + ' of ' + allN + ')');
ok(smE.base && smE.base.n > 0 && smE.base.n < lkA.base[20].n, 'test baseline uses only test period days');
/* 3. overlapping samples: counting every daily signal would inflate n */
const ovl = []; p = 100; for (let i = 0; i < 400; i++) { p *= i % 2 ? 0.97 : 1.035; ovl.push(p) }
const Ro2 = C.runStudy(st, {}, { gap: 1 }, { X: series(ovl) }); ok(Ro2.all.length > 150 && Ro2.sets[20].length <= Math.ceil(400 / 20), 'a signal every other day yields at most one 20 session observation per 20 sessions');
/* 4. inflated forecast accuracy: the same call repeated 10 times scores once */
const rep = []; for (let q = 0; q < 10; q++) rep.push({ updated: day2 + 'T1' + q % 10 + ':00:00Z', forecast: { dir: 'up', date: day2, ref: 101 } });
const scR = C.scoreForecasts(rep, SP, closeAt); ok(scR.dir.n === 1 && scR.dir.revisions === 9, 'ten copies of one call count once');
/* 5. correlated implied move windows: overlapping expiries are not independent */
const emDocs = [{ updated: day2 + 'T12:00:00Z', opt: { asof: 'A', asofTs: day2 + 'T21:15:00Z', base: 100, em: [['wk', 2, 'n', 'SPXW', day3], ['mo', 4, 'n', 'SPX', day3]] } }];
const scE = C.scoreForecasts(emDocs, SP, closeAt); ok(scE.cov.n === 2 && scE.cov.eff === 1, 'two windows over the same dates count as one effective outcome');
/* 6. a forecast issued after its session closed is not scored */
const late = C.scoreForecasts([{ updated: day2 + 'T23:00:00Z', forecast: { dir: 'up', date: day2, ref: 101 } }], SP, closeAt); ok(late.dir.n === 0, 'a call made after the close is ignored');
/* 7. intraday state never reads later bars */
const bars = []; for (let q = 0; q < 13; q++) bars.push([q, 100 + q, 101 + q, 99 + q, 100.5 + q, 1000]);
const Dd = { prev: 99, b: bars, semi: null }, s3 = C.dayState(Dd, 3, 5), bars2 = bars.map((b, q) => q > 3 ? [b[0], 1, 999, 0.5, 2, 9] : b), s3b = C.dayState({ prev: 99, b: bars2, semi: null }, 3, 5);
ok(JSON.stringify(s3) === JSON.stringify(s3b), 'changing later bars does not change the state at bar 3');
const oc = C.dayOutcome(Dd, s3); ok(oc.highDone === false && oc.newHigh === true, 'outcome uses later bars only');
/* 8. intraday prediction uses only the supplied history */
const histI = []; for (let q = 0; q < 40; q++) { const s0 = { gap: q % 5, ret: q % 3, pos: 0.5, rng: 1, semi: 0 }; histI.push({ s: s0, o: { closeUp: q % 2 === 0, highDone: true, lowDone: true, newHigh: false, newLow: false, openBack: null, vwapBack: null, rec25: null, rec50: null, rec75: null, rec100: null, up: 0.1, down: -0.1 } }) }
const pr1 = C.intradayPredict(histI, { gap: 1, ret: 1, pos: 0.5, rng: 1, semi: 0 }, 30); ok(pr1.closeUp && pr1.closeUp.n === 30, 'uses 30 neighbours from the given history');
/* 9. option strategy pricing: sells at bid, buys at ask */
const snap = { underlying: 100, rows: [['P', 95, 1.0, 1.2, -0.20, 0.2, 10], ['P', 90, 0.4, 0.5, -0.10, 0.2, 10], ['C', 105, 0.9, 1.1, 0.20, 0.2, 10], ['C', 100, 2.9, 3.1, 0.50, 0.2, 10], ['C', 103, 1.4, 1.6, 0.30, 0.2, 10]] };
const os1 = C.optionStrategies(snap, 92, 0); const csp = os1.find(o => /Cash secured/.test(o.name)), pcs = os1.find(o => /credit spread/.test(o.name));
near(csp.pnl, 1.0 - 3, 1e-9, 'cash secured put fills at the bid and pays the intrinsic value'); near(pcs.pnl, (1.0 - 0.5) - (3 - 0), 1e-9, 'credit spread buys the wing at the ask'); ok(csp.assigned === true, 'assignment flagged when expiring in the money');
/* 10. recovery engine respects corporate action breaks */
const rc = series(cl.map((v, q) => v)); rc.breaks = [rc.d[26]]; rc.sym = 'T'; const RR = C.recovery([rc], 2.5, { days: 1 }); ok(RR.ev.every(e => e.d !== rc.d[26]), 'no decline is counted on a corporate action date');

console.log(fails ? fails + ' of ' + n + ' failed' : 'all ' + n + ' passed'); process.exit(fails ? 1 : 0);
