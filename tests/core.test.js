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

/* ---------- v2 engines: intraday, weekly, recovery, models, live data ---------- */
{
  const mk = (n, f) => { const b = []; let p = 100; for (let q = 0; q < n; q++) { const o = p; p = f(q, p); const mm = 570 + q * 5; b.push([Math.floor(mm / 60) * 100 + mm % 60, o, Math.max(o, p) + 0.1, Math.min(o, p) - 0.1, p, 1000 + q]) } return b };
  const B5 = mk(78, (q, p) => p * (1 + (q < 20 ? 0.001 : -0.0005)));
  const S = { b: B5, res: 5, prev: 99, prevRet: 0.5, atr: 1.2, vix: 20, brd: 0.1, earn: 0, dow: 1, cumv: B5.map((_, k) => (k + 1) * 900), ref: B5 };
  const x6 = C.ifeat(S, 6), B5b = B5.map((b, q) => q >= 6 ? [b[0], 1, 1e6, 0.001, 5, 1e9] : b), x6b = C.ifeat(Object.assign({}, S, { b: B5b, ref: B5b }), 6);
  ok(JSON.stringify(x6) === JSON.stringify(x6b), 'intraday features at 10am ignore every later bar');
  ok(x6.length === C.IFEAT.length && x6.every(Number.isFinite), 'every intraday feature is a finite number');
  ok(C.iout(S, 78) === null, 'no outcome when the session has no bars left (incomplete or finished)');
  const o6 = C.iout(S, 6); ok(o6.highDone === 0 && o6.remUp > 0, 'a rising session after 10am has not set its high');
  /* 5 minute bars aggregated to 30 minutes give the same late session features as native 30 minute bars */
  const B30 = C.to30(B5); ok(B30.length === 13 && B30[0][0] === 930 && B30[1][0] === 1000, 'six 5 minute bars make each 30 minute bar, stamped at its start');
  near(B30[1][2], Math.max(...B5.slice(6, 12).map(b => b[2])), 1e-12, '30 minute high is the max of its 5 minute highs');
  ok(C.to30(B5.slice(0, 11)).length === 1, 'an unfinished 30 minute bucket is not used');
  const S30 = Object.assign({}, S, { b: B30, res: 30, ref: B30, cumv: null }), S30b = Object.assign({}, S30, { b: C.to30(B5b), ref: C.to30(B5b) });
  ok(JSON.stringify(C.ifeat(S30, 1)) === JSON.stringify(C.ifeat(S30b, 1)), 'the 10am feature from aggregated bars ignores every 5 minute bar after 10am');
  /* live cash bars: ET alignment, forming candle excluded, premarket and other days excluded, across a DST change */
  const now = Date.parse('2026-11-30T15:07:00Z'); /* 10:07am ET, standard time */
  const J = { data: [
    { start_time: '2026-11-30T15:05:00Z', end_time: '2026-11-30T15:10:00Z', open: '1', high: '1', low: '1', close: '1', volume: 1, market_time: 'r' },
    { start_time: '2026-11-30T15:00:00Z', end_time: '2026-11-30T15:05:00Z', open: '2', high: '3', low: '1', close: '2.5', volume: 9, market_time: 'r' },
    { start_time: '2026-11-30T14:30:00Z', end_time: '2026-11-30T14:35:00Z', open: '2', high: '2', low: '2', close: '2', volume: 5, market_time: 'r' },
    { start_time: '2026-11-30T14:25:00Z', end_time: '2026-11-30T14:30:00Z', open: '9', high: '9', low: '9', close: '9', volume: 5, market_time: 'pr' },
    { start_time: '2026-11-27T17:55:00Z', end_time: '2026-11-27T18:00:00Z', open: '9', high: '9', low: '9', close: '9', volume: 5, market_time: 'r' } ] };
  const U = C.uwBars(J, now); ok(U.length === 2 && U[0][0] === 930 && U[1][0] === 1000 && U[1][4] === 2.5, 'cash bars align to ET, drop the forming candle, premarket and other days');
  ok(C.etParts(Date.parse('2026-07-01T13:30:00Z')).hm === 930 && C.etParts(Date.parse('2026-12-01T14:30:00Z')).hm === 930, 'the 9:30 open maps correctly in summer and winter time');
  /* pre open context never reads the session itself or later rows; earnings reaction days */
  const dly = []; for (let q = 0; q < 40; q++) { const d = 20261001 + q; dly.push([d, 100, 101, 99, 100 + q * 0.1]) }
  const vixR = dly.map(r => [r[0], 20, 20, 20, 20]), d0 = dly[30][0];
  const c1 = C.iDayCtx(dly, vixR, dly, dly, [], d0), dly2 = dly.map((r, q) => q >= 30 ? [r[0], 1, 999, 0.1, 500] : r), c2 = C.iDayCtx(dly2, vixR, dly2, dly2, [], d0);
  ok(JSON.stringify(c1) === JSON.stringify(c2), 'pre open context ignores the session and later days');
  near(c1.prev, dly[29][4], 1e-12, 'previous close is the last row before the session');
  ok(C.iDayCtx(dly, vixR, dly, dly, [[dly[29][0], 'post']], d0).earn === 1 && C.iDayCtx(dly, vixR, dly, dly, [[dly[29][0], 'post']], dly[31][0]).earn === 1 && C.iDayCtx(dly, vixR, dly, dly, [[dly[29][0], 'post']], dly[32][0]).earn === 0, 'after close earnings mark the next two sessions only');
  ok(C.iDayCtx(dly, vixR, dly, dly, [[dly[30][0], 'pre']], d0).earn === 1, 'before open earnings mark the same session');
  ok(C.iCumv([[[930, 1, 1, 1, 1, 10], [935, 1, 1, 1, 1, 20]]], 2) === null, 'relative volume needs at least 5 earlier sessions');
}
{
  /* models: each family recovers a simple signal and predicts through the shared code path */
  const ML = require('../tools/ml.js'); let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 };
  const X = [], y = []; for (let q = 0; q < 1500; q++) { const x = C.IFEAT.map(() => r() * 2 - 1); x[C.IFEAT.indexOf('tod')] = [0.077, 0.154][q % 2]; x[C.IFEAT.indexOf('pos')] = r(); X.push(x); y.push(r() < 1 / (1 + Math.exp(-3 * x[0])) ? 1 : 0) }
  const tr = [X.slice(0, 1000), y.slice(0, 1000)], te = [X.slice(1000), y.slice(1000)], br = M => { let b = 0; te[0].forEach((x, i) => { b += (C.mlPredict(M, x) - te[1][i]) ** 2 }); return b / te[0].length };
  const base = br(ML.fit({ m: 'tod' }, tr[0], tr[1]));
  [{ m: 'logit', lambda: 1 }, { m: 'gbt', depth: 2, n: 40, lr: 0.1 }, { m: 'rf', depth: 4, n: 30, mtry: 6 }, { m: 'knn', k: 40 }].forEach(sp => { const M = ML.fit(sp, tr[0], tr[1]), b = br(M); ok(b < base - 0.02, sp.m + ' beats the time of day base rate on a real signal (' + b.toFixed(3) + ' vs ' + base.toFixed(3) + ')'); ok(te[0].every(x => { const p = C.mlPredict(M, x); return p >= 0 && p <= 1 }), sp.m + ' outputs probabilities') });
  const L = ML.fitLogit(tr[0], tr[1], 1); ok(L.w[0] > 1 && Math.abs(L.w[5]) < 0.5, 'logistic regression finds the true coefficient and not a noise one');
  /* block bootstrap resamples whole groups: one huge group cannot be split */
  const G = { a: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], b: [10], c: [11] }, vals = Array.from({ length: 12 }, (_, i) => i < 10 ? 1 : 0), ci = C.blockBoot(G, idx => C.mean(idx.map(i => vals[i])), 300);
  ok(ci[0] <= 0.5 && ci[1] === 1, 'session bootstrap keeps correlated observations together (wide range)');
}
{
  /* weekly: state uses only the days so far; context uses only earlier weeks */
  const rows = []; let p = 100, d = new Date(Date.UTC(2026, 0, 5)); for (let q = 0; q < 150; q++) { while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 864e5); const o = p; p = p * (1 + (q % 7 - 3) * 0.004); rows.push([+(d.toISOString().slice(0, 10).replace(/-/g, '')), o, Math.max(o, p) * 1.003, Math.min(o, p) * 0.997, p]); d = new Date(d.getTime() + 864e5) }
  const Wk = C.weeksOf(rows), wi = 25, w = Wk[wi], k = rows.findIndex(r => r[0] === w[1][0]);
  ok(Wk.every(W => W.every(r => C.wkey(r[0]) === C.wkey(W[0][0]))) && Wk[1][0][0] > Wk[0][Wk[0].length - 1][0], 'weeks group Monday to Friday in order');
  const cx = C.wctx(Wk, wi, rows, k, null), s1 = C.wstate(w, 1, cx), w2 = w.map((r, j) => j > 1 ? [r[0], 1, 999, 0.1, 500] : r), s2 = C.wstate(w2, 1, cx);
  ok(JSON.stringify(s1.x) === JSON.stringify(s2.x), 'weekly state on Tuesday ignores Wednesday to Friday');
  const Wk2 = Wk.map((W, q) => q >= wi ? W.map(r => [r[0], 1, 999, 0.1, 500]) : W); ok(C.wctx(Wk2, wi, rows, k, null).watr === cx.watr, 'weekly context uses earlier weeks only');
}
{
  /* recovery v2: thinning per horizon, censoring, clustering, corporate actions, decline before measurement */
  const mkS = (sym, c, br) => ({ sym, d: c.map((_, i) => 20200101 + i), c, breaks: br || [] });
  const c = []; for (let i = 0; i < 400; i++) c.push(100); [50, 80, 300].forEach(i => { c[i] = 85; for (let j = i + 1; j < i + 30 && j < 400; j++) c[j] = 85 + (j - i) * 0.6 });
  const R = C.recovery2([mkS('A', c)], 10, { days: 1 });
  ok(R.ev.length === 3, 'three separate declines found');
  ok(R.rec[60].n === 2 && R.rec[20].n === 3, 'events closer than the horizon in one stock count once at that horizon');
  ok(R.ev.every(e => e.t == null || e.t > 0), 'recovery is measured only after the decline day');
  const c2 = c.slice(0, 310); const R2 = C.recovery2([mkS('A', c2)], 10, { days: 1 }); ok(R2.rec[20].censored === 1, 'a decline without enough later data is censored, not a failure');
  const RB = C.recovery2([mkS('A', c, [20200101 + 50])], 10, { days: 1 }); ok(RB.ev.every(e => e.d !== 20200101 + 50), 'no decline is counted across a corporate action');
  const RC = C.recovery2([mkS('A', c), mkS('B', c)], 10, { days: 1 }); ok(RC.ev.length === 6 && RC.clusters === 3, 'the same selloff in two stocks is one market episode');
  const KM = C.kaplanMeier([{ t: 5, done: true }, { t: null, done: false, obs: 3 }, { t: 10, done: true }], [6]); near(KM[6], 0.5, 1e-9, 'Kaplan Meier drops only at recoveries and removes censored events from the risk set');
}

/* ---------- operational phase: parity, calendar, promotion, prospective timing, materiality ---------- */
{
  const I2 = require('../tools/intraday2.js'), fs = require('fs'), Cx = I2.context();
  const rows5 = I2.build('SPY', 'early', Cx), rows30 = I2.build('SPY', 'late', Cx);
  const S5 = I2.sessions('SPY', 5, 78), R5 = {}; I2.sessions('SMH', 5, 78).forEach(s => { R5[s.d] = s.b });
  const S30 = I2.sessions('SPY', 30, 13), dly = JSON.parse(fs.readFileSync('data/hist/SPY.json')).rows, earn = Cx.E.SPY || [];
  const day = S5[S5.length - 3].d, i5 = S5.findIndex(s => s.d === day);
  /* the page builds a live session the same way: same core function, same inputs */
  const live = C.iSession({ bars: S5[i5].b.slice(0, 6), ref: R5[day].slice(0, 6), res: 5, d: day, dly, vix: Cx.vix, rsp: Cx.rsp, spy: Cx.spy, earn, prior: S5.slice(0, i5).map(s => s.b), src: 'cash' });
  [1, 2, 3, 6].forEach(k => { const r = rows5.find(z => z.d === day && z.k === k); ok(r && JSON.stringify(C.ifeat(live, k)) === JSON.stringify(r.x), 'live 5 minute features match training at checkpoint ' + k) });
  const i30 = S30.findIndex(s => s.d === day), R30 = {}; I2.sessions('SMH', 30, 13).forEach(s => { R30[s.d] = s.b });
  const live30 = C.iSession({ bars: C.to30(S5[i5].b), ref: C.to30(R5[day]), res: 30, d: day, dly, vix: Cx.vix, rsp: Cx.rsp, spy: Cx.spy, earn, prior: S30.slice(0, i30).map(s => s.b), src: 'cash' });
  [1, 4, 8, 12].forEach(k => { const r = rows30.find(z => z.d === day && z.k === k), a = C.ifeat(live30, k); ok(r && a.every((v, q) => Math.abs(v - r.x[q]) < 1e-9), 'live 5 to 30 minute bars match the 30 minute training features at bar ' + k) });
  const pz = C.iSession({ bars: S5[i5].b, ref: null, res: 5, d: day, dly, vix: Cx.vix, rsp: Cx.rsp, spy: Cx.spy, earn, prior: S5.slice(0, i5).map(s => s.b), src: 'perp', perpPrev: 7000 });
  ok(pz.prev === 7000 && pz.cumv === null, 'perp sessions use the perp 4pm price as previous close and no relative volume');
  ok(C.iSession({ bars: S5[i5].b, res: 5, d: day, dly, vix: Cx.vix, rsp: Cx.rsp, spy: Cx.spy, src: 'perp' }) === null, 'a perp session without its 4pm reference is refused');
}
{
  ok(!C.isTradingDay(20261126) && C.isTradingDay(20261127) && C.isHalfDay(20261127) && !C.isTradingDay(20250109), 'NYSE calendar knows Thanksgiving, the half day after it and the 2025 day of mourning');
  ok(JSON.stringify(C.weekDays(20251126)) === JSON.stringify([20251124, 20251125, 20251126, 20251128]), 'a holiday week has four expected trading days');
  const wk = [[20251124, 1, 1, 1, 1], [20251125, 1, 1, 1, 1], [20251126, 1, 1, 1, 1]];
  ok(!C.weekComplete(wk, 20251126), 'a week is unfinished until its last trading day has closed');
  ok(C.weekComplete(wk.concat([[20251128, 1, 1, 1, 1]]), 20251128), 'the holiday week is finished after the Friday half day');
  ok(!C.weekComplete([[20251124, 1, 1, 1, 1], [20251126, 1, 1, 1, 1], [20251128, 1, 1, 1, 1]], 20251201), 'a week with a missing trading day is not treated as complete');
}
{
  const I2 = require('../tools/intraday2.js'), base = { vsBenchCI: [0.001, 0.01], ece: 0.02, regimes: { vixHigh: 0.1, vixLow: 0.05 }, econ: 0.3, econCI: [0.05, 0.5], flagged: 80, flagSessions: 30 };
  ok(I2.verdict(base, 'highDone').promoted, 'promoted with better accuracy and meaningful value whose range is above zero');
  ok(!I2.verdict(Object.assign({}, base, { econCI: [-0.1, 0.6] }), 'highDone').promoted, 'positive value is not enough when its range includes zero');
  ok(!I2.verdict(Object.assign({}, base, { econ: 0.04, econCI: [0.01, 0.07] }), 'highDone').promoted, 'value too small to matter is not promoted');
  ok(!I2.verdict(Object.assign({}, base, { vsBenchCI: [-0.002, 0.01] }), 'highDone').promoted, 'value without a statistically supported accuracy gain is not promoted');
  ok(!I2.verdict(Object.assign({}, base, { flagged: 12 }), 'highDone').promoted, 'too few signals are not promoted');
}
{
  const P = require('../tools/prospective.js');
  ok(P.eligibleFrom('2026-11-30T12:08:00Z') === 20261130, 'registered before the open: eligible the same session');
  ok(P.eligibleFrom('2026-11-30T15:00:00Z') === 20261201, 'registered after the open: eligible from the next session');
  ok(P.eligibleFrom('2026-11-25T22:00:00Z') === 20261127, 'registered on the evening before Thanksgiving: eligible Friday');
  ok(P.eligibleFrom('2026-11-27T22:00:00Z') === 20261130, 'registered Friday evening: eligible Monday');
}
{
  ok(!C.materiality(5, 0.2, 'SPY').material && C.materiality(6, 0.31, 'SPY').material && C.materiality(2, 0.5, 'SPY').material, 'materiality needs a large move for the asset, or a very large one');
  ok(!C.materiality(9, null, 'SPY').material, 'no measured reaction, not material');
}

console.log(fails ? fails + ' of ' + n + ' failed' : 'all ' + n + ' passed'); process.exit(fails ? 1 : 0);
