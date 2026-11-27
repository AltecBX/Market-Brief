/* Core calculations. No page or network code here, so the same functions run in the page and in tests/core.test.js. */
var CORE = (function () {
  function isNum(x) { return typeof x === 'number' && isFinite(x) }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x }, 0) / a.length : null }
  function sd(a) { if (a.length < 2) return null; var m = mean(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m) }, 0) / (a.length - 1)) }
  function tcrit(df) { var t = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09]; return df < 1 ? NaN : df <= 20 ? t[df - 1] : df <= 30 ? 2.05 : df <= 60 ? 2.0 : 1.96 }
  function ncdf(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p }
  function stats(a) { var n = a.length; if (!n) return { n: 0 }; var m = mean(a), s = sd(a) || 0, h = n > 1 ? tcrit(n - 1) * s / Math.sqrt(n) : NaN; return { n: n, mean: m, med: median(a), sd: s, lo: m - h, hi: m + h, up: a.filter(function (x) { return x > 0 }).length / n } }
  function wilson(k, n) { if (!n) return [NaN, NaN]; var z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - w) / d, (c + w) / d] }
  function pMean(a, mu) { var n = a.length, s = sd(a); if (n < 3 || !s) return null; return 2 * (1 - ncdf(Math.abs((mean(a) - mu) / (s / Math.sqrt(n))))) }
  function pProp(k, n, p0) { if (n < 3 || !(p0 > 0 && p0 < 1)) return null; return 2 * (1 - ncdf(Math.abs((k - n * p0) / Math.sqrt(n * p0 * (1 - p0))))) }
  function pearson(a, b) { var n = a.length; if (n < 10) return null; var ma = mean(a), mb = mean(b), sab = 0, sa = 0, sb = 0; for (var i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) * (a[i] - ma); sb += (b[i] - mb) * (b[i] - mb) } return sa && sb ? sab / Math.sqrt(sa * sb) : null }

  function sg(v, d) { return (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(d == null ? 2 : d) + '%' }
var STUDIES = [
  { id: 'spxdown', name: 'S&P down day', data: ['SPX'], tgt: 'SPX', p: [['x', 'S&P closes down at least', 3, '%', 0.5]], desc: 'S&P 500 close to close decline. Cboe closes since 1975. Entry at the event close.',
    ev: function (S, i, P) { var c = S.SPX.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'streak', name: 'S&P losing streak', data: ['SPX'], tgt: 'SPX', p: [['n', 'Down closes in a row', 4, '', 1]], desc: 'The day a streak of lower S&P closes reaches the length set. Entry at that close.',
    ev: function (S, i, P) { var c = S.SPX.c, n = P.n; if (i < n + 1) return null; for (var k = 0; k < n; k++) if (!(c[i - k] < c[i - k - 1])) return null; if (c[i - n] < c[i - n - 1]) return null; return { v: (c[i] / c[i - n] - 1) * 100, ref: c[i - n] } } },
  { id: 'ndxdown', name: 'Nasdaq 100 down day', data: ['NDX'], tgt: 'NDX', p: [['x', 'Nasdaq 100 closes down at least', 4, '%', 0.5]], desc: 'Nasdaq 100 close to close decline. FRED closes since 1986.',
    ev: function (S, i, P) { var c = S.NDX.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'vixlevel', name: 'VIX above a level', data: ['VIX', 'SPX'], tgt: 'SPX', entry: 'next', p: [['L', 'VIX closes at or above', 30, '', 1], ['cross', 'Only the first close above (1 = yes)', 1, '', 1]], desc: 'The VIX closes at 4:15pm, after the S&P close, so entry is the next S&P close to avoid using information early. VIX since 1990.',
    ev: function (S, i, P) { var v = S.VIX.c; if (i < 1 || v[i] < P.L || (P.cross && v[i - 1] >= P.L)) return null; return { v: v[i], lab: 'VIX ' + v[i].toFixed(2) } } },
  { id: 'vixspike', name: 'VIX one day spike', data: ['VIX', 'SPX'], tgt: 'SPX', entry: 'next', p: [['x', 'VIX closes up at least', 25, '%', 5]], desc: 'VIX close to close jump. Entry is the next S&P close.',
    ev: function (S, i, P) { var v = S.VIX.c; return i > 0 && (v[i] / v[i - 1] - 1) * 100 >= P.x ? { v: (v[i] / v[i - 1] - 1) * 100, lab: 'VIX ' + sg((v[i] / v[i - 1] - 1) * 100, 0) } : null } },
  { id: 'vixrev', name: 'VIX spike then reversal', data: ['VIX', 'SPX'], tgt: 'SPX', entry: 'next', from: 1992, p: [['x', 'VIX intraday high above prior close by', 20, '%', 5], ['y', 'VIX closes no more than this above prior close', 5, '%', 1]], desc: 'Fear spikes intraday and fades by the close. VIX highs and lows since 1992. Entry is the next S&P close.',
    ev: function (S, i, P) { var V = S.VIX; if (i < 1 || !V.h) return null; var pc = V.c[i - 1]; if ((V.h[i] / pc - 1) * 100 >= P.x && (V.c[i] / pc - 1) * 100 <= P.y) return { v: (V.h[i] / pc - 1) * 100, lab: 'VIX high ' + sg((V.h[i] / pc - 1) * 100, 0) + ', close ' + sg((V.c[i] / pc - 1) * 100, 0) }; return null } },
  { id: 'recover', name: 'Intraday drop recovered', data: ['SPY'], tgt: 'SPY', p: [['x', 'SPY low below prior close by at least', 2, '%', 0.5], ['y', 'Share of the drop recovered by the close', 70, '%', 5]], desc: 'SPY daily highs and lows, about 2 years. Intraday data is only this long, so samples are small.',
    ev: function (S, i, P) { var T = S.SPY; if (i < 1) return null; var pc = T.c[i - 1], dd = (T.l[i] / pc - 1) * 100; if (dd > -P.x) return null; var rec = (T.c[i] - T.l[i]) / (pc - T.l[i]) * 100; return rec >= P.y ? { v: dd, lab: 'low ' + sg(dd) + ', ' + rec.toFixed(0) + '% recovered', ref: pc } : null } },
  { id: 'qqqhigh', name: 'Nasdaq drop, close near high', data: ['QQQ'], tgt: 'QQQ', p: [['x', 'QQQ low below prior close by at least', 3, '%', 0.5], ['y', 'Close in the top part of the range', 25, '%', 5]], desc: 'QQQ daily highs and lows, about 2 years.',
    ev: function (S, i, P) { var T = S.QQQ; if (i < 1) return null; var pc = T.c[i - 1], dd = (T.l[i] / pc - 1) * 100, rg = T.h[i] - T.l[i]; if (dd > -P.x || !rg) return null; return (T.h[i] - T.c[i]) / rg * 100 <= P.y ? { v: dd, lab: 'low ' + sg(dd) + ', close ' + sg((T.c[i] / pc - 1) * 100), ref: pc } : null } },
  { id: 'stock', name: 'Big chip stock drop', data: [], tgt: 'pick', pick: ['NVDA10', 'MU10', 'AMD10', 'WDC10', 'SMH10', 'SOXX10'], p: [['x', 'Closes down at least', 8, '%', 1]], desc: '10 years of split adjusted daily closes from Unusual Whales. Corporate actions (the SanDisk spin off from WDC, a bad SOXX stretch in 2022) are excluded.',
    ev: function (S, i, P, T) { var c = T.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'gap', name: 'SPY opening gap', data: ['SPY'], tgt: 'SPY', entry: 'open', p: [['x', 'Gap size at least', 1, '%', 0.25], ['dir', 'Direction (1 = up, 0 = down)', 0, '', 1]], desc: 'SPY open vs prior close, about 2 years. Entry at the open, when the gap is known.',
    ev: function (S, i, P) { var T = S.SPY; if (i < 1) return null; var g = (T.o[i] / T.c[i - 1] - 1) * 100; return (P.dir ? g >= P.x : g <= -P.x) ? { v: g, ref: T.c[i - 1], gap: 1 } : null } },
  { id: 'breadth', name: 'Equal weight up, S&P down', data: ['SPY10', 'RSP10'], tgt: 'SPY10', p: [['x', 'SPY closes down at least', 0.5, '%', 0.25], ['y', 'RSP beats SPY by at least', 0.3, '%', 0.1]], desc: 'Equal weight (RSP) vs cap weight (SPY), 10 years of closes. A breadth proxy, not exchange breadth.',
    ev: function (S, i, P) { var A = S.SPY10, R = S.RSP10, d = A.d[i], j = R.ix[d]; if (i < 1 || j == null || j < 1) return null; var a = (A.c[i] / A.c[i - 1] - 1) * 100, r = (R.c[j] / R.c[j - 1] - 1) * 100; return a <= -P.x && r - a >= P.y ? { v: a, lab: 'SPY ' + sg(a) + ', RSP ' + sg(r) } : null } },
  { id: 'asia', name: 'Nikkei move, then Nasdaq', data: ['N225', 'NDX'], tgt: 'NDX', p: [['x', 'Nikkei session move at least', 1.5, '%', 0.5], ['dir', 'Direction (1 = up, 0 = down)', 1, '', 1], ['ctrl', 'Prior US session move no bigger than (0 = off)', 0.5, '%', 0.25]], corr: 1,
    desc: 'Tokyo closes before the US session of the same date. Daily closes only exist for the Nasdaq 100, so entry is that date\'s US close, after the information is known; the same day reaction is not measurable here without lookahead. The dollar conversion was removed because the only yen rate available is published after Tokyo closes.',
    ev: function (S, i, P) { var N = S.N225, d = N.d[i], X = S.NDX, j = X.ix[d]; if (i < 1 || j == null || j < 2) return null; var r = (N.c[i] / N.c[i - 1] - 1) * 100, u = (X.c[j - 1] / X.c[j - 2] - 1) * 100; if (P.ctrl > 0 && Math.abs(u) > P.ctrl) return null; return (P.dir ? r >= P.x : r <= -P.x) ? { v: r, lab: 'Nikkei ' + sg(r) + ', prior US day ' + sg(u) } : null } },
  { id: 'asiasmh', name: 'Nikkei move, then US semis', data: ['N225', 'SMH'], tgt: 'SMH', entry: 'open', p: [['x', 'Nikkei session move at least', 1.5, '%', 0.5], ['dir', 'Direction (1 = up, 0 = down)', 1, '', 1]], desc: 'Entry at the SMH open of the same date, which comes after Tokyo has closed. About 2 years of SMH bars.',
    ev: function (S, i, P) { var N = S.N225, d = N.d[i]; if (i < 1 || S.SMH.ix[d] == null) return null; var r = (N.c[i] / N.c[i - 1] - 1) * 100; return (P.dir ? r >= P.x : r <= -P.x) ? { v: r, lab: 'Nikkei ' + sg(r) } : null } }
];
  /* Series: {d:[YYYYMMDD], c:[], o?, h?, l?, ix:{d:i}, breaks?:[YYYYMMDD]} */
  function crossesBreak(T, i0, i1) { if (!T.breaks) return false; for (var b = 0; b < T.breaks.length; b++) { var x = T.breaks[b]; if (T.d[i0] < x && T.d[i1] >= x) return true } return false }
  var HZ = [1, 2, 3, 5, 10, 20];
  /* Entry rules, identical for events and for the all days baseline:
     close: buy the event day close.  open: buy the event day open.  next: buy the close one session after the event (for signals known only after the close, like the VIX close at 4:15pm).
     Exit is the close k sessions after the entry session. */
  function entryIdx(st, ti) { return st.entry === 'next' ? ti + 1 : ti }
  function entryPx(st, T, ei) { return st.entry === 'open' ? T.o[ei] : T.c[ei] }
  function fwd(st, T, ei, k) { var j = ei + k; if (j >= T.c.length || crossesBreak(T, ei, j)) return null; if (st.entry === 'open' && k === 0) return (T.c[ei] / T.o[ei] - 1) * 100; return (T.c[j] / entryPx(st, T, ei) - 1) * 100 }
  function runStudy(st, P, opt, H) {
    var Tsym = st.tgt === 'pick' ? opt.pick : st.tgt, T = H[Tsym], base = st.tgt === 'pick' ? T : H[st.data[0]], S = {};
    st.data.forEach(function (s) { S[s] = H[s] }); if (st.tgt === 'pick') S[Tsym] = T;
    var from = Math.max(opt.from || 0, st.from || 0) * 10000, to = (opt.to || 9999) * 10000 + 9999, gap = Math.max(1, opt.gap || 1), ev = [];
    for (var i = 1; i < base.d.length; i++) {
      var d = base.d[i]; if (d < from || d > to) continue;
      var e = st.ev(S, i, P, T); if (!e) continue;
      var ti = T.ix[d]; if (ti == null) continue; var ei = entryIdx(st, ti); if (ei >= T.c.length) { ev.push({ d: d, ti: ti, ei: ei, e: e, r: {}, open: true }); continue }
      if (ti > 0 && crossesBreak(T, ti - 1, ti)) continue;
      var r = {}; HZ.forEach(function (k) { r[k] = fwd(st, T, ei, k) }); if (st.entry === 'open') r[0] = fwd(st, T, ei, 0);
      var x = { d: d, ti: ti, ei: ei, e: e, r: r };
      var j1 = ei + 20; if (j1 < T.c.length && !crossesBreak(T, ei, j1)) { var hi = -1e18, lo = 1e18; for (var j = ei + 1; j <= j1; j++) { hi = Math.max(hi, T.h ? T.h[j] : T.c[j]); lo = Math.min(lo, T.l ? T.l[j] : T.c[j]) } var p0 = entryPx(st, T, ei), evLow = T.l ? T.l[ti] : T.c[ti]; x.mfe = (hi / p0 - 1) * 100; x.mae = (lo / p0 - 1) * 100; x.retest = lo <= evLow * 1.005; x.newlow = lo < evLow }
      var ref = e.ref != null ? e.ref : (ti > 0 ? T.c[ti - 1] : null); if (ref) { x.rec = null; var lim = Math.min(T.c.length - 1, ei + 60); for (var j2 = ei + 1; j2 <= lim; j2++) { if (T.c[j2] >= ref) { x.rec = j2 - ei; break } } x.recOpen = ei + 60 > T.c.length - 1 && x.rec == null }
      if (e.gap && T.h) { var pc = T.c[ti - 1], up = T.o[ti] > pc; x.fill0 = up ? T.l[ti] <= pc : T.h[ti] >= pc; if (ti + 4 < T.c.length) { var f5 = false; for (var j3 = ti; j3 <= ti + 4; j3++) if (up ? T.l[j3] <= pc : T.h[j3] >= pc) f5 = true; x.fill5 = f5 } }
      ev.push(x);
    }
    /* Clusters: the user's minimum gap thins repeated signals. Then, per horizon, only events whose holding windows do not overlap are counted, so no day's return is used twice. */
    var lastC = -1e9; ev.forEach(function (x) { if (x.open) return; if (x.ti - lastC < gap) x.cluster = true; else lastC = x.ti });
    var sets = {}; HZ.concat(st.entry === 'open' ? [0] : []).forEach(function (k) { var last = -1e9, a = []; ev.forEach(function (x) { if (x.cluster || x.open || !isNum(x.r[k])) return; if (x.ei - last < Math.max(k, 1)) return; last = x.ei; a.push(x) }); sets[k] = a });
    /* Baseline: every eligible day in the same window and data span, same entry and exit rule */
    var bfrom = Math.max(from, base.d[1], T.d[1]), bl = {};
    HZ.concat(st.entry === 'open' ? [0] : []).forEach(function (k) { var a = [], L = []; for (var i2 = 1; i2 < T.c.length; i2++) { var d2 = T.d[i2]; if (d2 < bfrom || d2 > to) continue; if (base !== T && base.ix[d2] == null) continue; var e2 = entryIdx(st, i2); if (e2 >= T.c.length) continue; var v = fwd(st, T, e2, k); if (isNum(v)) { a.push(v); L.push([e2, v]) } } bl[k] = stats(a); bl[k].list = L });
    /* Untouched test period: the last 25% of the target's dates in range are held out and reported separately */
    var span = T.d.filter(function (d3) { return d3 >= bfrom && d3 <= to }), cut = span.length ? span[Math.floor(span.length * 0.75)] : 0, cutIdx = T.ix[cut] != null ? T.ix[cut] : T.c.length;
    return { st: st, T: Tsym, all: ev, sets: sets, base: bl, cut: cut, cutIdx: cutIdx, hasHL: !!T.h, src: T.src, asof: T.asof, start: Math.max(bfrom, T.d[0]) };
  }
  /* Train: outcome window must end before the cut (purged). Test: entries start k sessions after the cut (embargo), so no window straddles the split.
     Each part is compared with all days from the same part, using the same purge and embargo. */
  function inPart(R, k, ei, part) { if (part === 'train') return ei + Math.max(k, 1) <= R.cutIdx; if (part === 'test') return ei >= R.cutIdx + Math.max(k, 1); return true }
  function summarize(R, k, part) {
    var a = (R.sets[k] || []).filter(function (x) { return inPart(R, k, x.ei, part) }).map(function (x) { return x.r[k] });
    var bl = R.base[k], bv = part && bl && bl.list ? bl.list.filter(function (p) { return inPart(R, k, p[0], part) }).map(function (p) { return p[1] }) : null, b = bv ? stats(bv) : bl;
    var s = stats(a), up = a.filter(function (v) { return v > 0 }).length;
    return { n: a.length, s: s, up: up, base: b, pUp: b && b.n ? pProp(up, a.length, b.up) : null, pMean: b && b.n ? pMean(a, b.mean) : null, excess: s.n && b && b.n ? s.mean - b.mean : null };
  }
  /* Walk forward: at each event, the side is chosen from earlier events only, and the benchmark is the average of all days whose outcome was already known at that entry (expanding, no future data). */
  function walkForward(R, k, minPrior) {
    var a = R.sets[k] || [], L = (R.base[k] && R.base[k].list) || [], li = 0, bs = 0, bn = 0, done = [], hits = 0, n = 0, pnl = [];
    a.forEach(function (x) {
      while (li < L.length && L[li][0] + k <= x.ei) { bs += L[li][1]; bn++; li++ }
      var bench = bn ? bs / bn : 0, known = done.filter(function (p) { return p.e + k <= x.ei });
      if (known.length >= (minPrior || 10) && bn >= 20) { var m = mean(known.map(function (p) { return p.ex })), ex = x.r[k] - bench; if (m !== 0) { n++; if ((m > 0) === (ex > 0)) hits++; pnl.push(m > 0 ? ex : -ex) } }
      done.push({ e: x.ei, ex: x.r[k] - bench });
    });
    return { n: n, hits: hits, avg: pnl.length ? mean(pnl) : null, sdv: pnl.length > 1 ? sd(pnl) : null, ci: n ? wilson(hits, n) : [NaN, NaN] };
  }
  /* ---------- Intraday structure: completed candles only ---------- */
  function completed(K, now, ms) { return K.filter(function (c) { return +c.t + ms <= now }) }
  function pivots(K, kind) { var p = []; for (var i = 1; i < K.length - 1; i++) { if (kind === 'low' ? (+K[i].l < +K[i - 1].l && +K[i].l <= +K[i + 1].l) : (+K[i].h > +K[i - 1].h && +K[i].h >= +K[i + 1].h)) p.push(i) } return p }
  function vwap(K) { var pv = 0, vv = 0; K.forEach(function (c) { var tp = (+c.h + +c.l + +c.c) / 3; pv += tp * +c.v; vv += +c.v }); return vv ? pv / vv : null }
  /* Down swing then recovery when dir = 1. Peak must be in an earlier candle than the trough: a high and low inside one candle have unknown order. */
  function swing(K, dir) {
    if (K.length < 3) return null; var tr = 0;
    for (var i = 1; i < K.length; i++) if (dir > 0 ? +K[i].l < +K[tr].l : +K[i].h > +K[tr].h) tr = i;
    if (tr === 0) return { ambiguous: true };
    var pk = 0; for (var j = 1; j < tr; j++) if (dir > 0 ? +K[j].h > +K[pk].h : +K[j].l < +K[pk].l) pk = j;
    var peak = dir > 0 ? +K[pk].h : +K[pk].l, ext = dir > 0 ? +K[tr].l : +K[tr].h, last = +K[K.length - 1].c;
    return { dir: dir, pk: pk, tr: tr, peak: peak, ext: ext, last: last, move: (ext / peak - 1) * 100, rec: (last - ext) / (peak - ext), pt: +K[pk].t, et: +K[tr].t };
  }
  function structure(K, s) {
    var after = K.slice(s.tr), before = K.slice(s.pk, s.tr + 1), down = s.dir > 0, out = {};
    var pl = pivots(after, down ? 'low' : 'high').map(function (i) { return down ? +after[i].l : +after[i].h });
    out.higherLows = 0; for (var i = 1; i < pl.length; i++) if (down ? pl[i] > pl[i - 1] : pl[i] < pl[i - 1]) out.higherLows++;
    if (pl.length && (down ? pl[0] > s.ext : pl[0] < s.ext)) out.higherLows++;
    var ph = pivots(before, down ? 'high' : 'low'); var lh = ph.length ? (down ? +before[ph[ph.length - 1]].h : +before[ph[ph.length - 1]].l) : null;
    out.lastLowerHigh = lh; out.structureBreak = lh != null && after.some(function (c) { return down ? +c.c > lh : +c.c < lh });
    var vw = vwap(K); out.vwap = vw; var run = 0, best = 0; after.forEach(function (c) { if (vw && (down ? +c.c > vw : +c.c < vw)) { run++; best = Math.max(best, run) } else run = 0 });
    out.vwapHeld = best >= 2; out.vwapNow = vw ? (down ? s.last > vw : s.last < vw) : null;
    var dv = before.filter(function (c) { return down ? +c.c < +c.o : +c.c > +c.o }).map(function (c) { return +c.v }), uv = after.filter(function (c) { return down ? +c.c > +c.o : +c.c < +c.o }).map(function (c) { return +c.v });
    out.volRatio = dv.length && uv.length ? mean(uv) / mean(dv) : null;
    return out;
  }
  function classify(s, st, ctx) {
    var down = s.dir > 0, conf = 0, why = [];
    if (st.higherLows >= 1) { conf++; why.push(down ? 'higher low' : 'lower high') }
    if (st.structureBreak) { conf++; why.push(down ? 'closed above the last lower high' : 'closed below the last higher low') }
    if (st.vwapHeld && st.vwapNow) { conf++; why.push('VWAP reclaimed and held 2 candles') }
    if (ctx.semiRec != null && ctx.semiRec >= 0.5) { conf++; why.push('semis at least half back') }
    if (ctx.breadthPct != null && (down ? ctx.breadthPct >= 60 : ctx.breadthPct <= 40)) { conf++; why.push('perp sample breadth agrees') }
    var l;
    if (s.rec < 0.15) l = down ? 'No reversal yet, near the low' : 'No reversal yet, near the high';
    else if (s.rec < 0.382) l = down ? 'Temporary bounce so far' : 'Pullback so far';
    else if (s.rec < 0.618) l = down ? 'Partial recovery' : 'Partial fade';
    else if (conf >= 4 && ctx.mins >= 30) l = down ? 'Potential sustainable reversal' : 'Potential sustainable reversal lower';
    else if (conf >= 3) l = down ? 'Broad recovery' : 'Broad fade';
    else if (ctx.groupSpread > 1.5) l = 'Sector rotation';
    else l = down ? 'Recovery without confirmation' : 'Fade without confirmation';
    return { label: l, conf: conf, why: why };
  }
  /* Exhaustion: signs that a decline is losing force before any reversal is confirmed. Each sign is measured, none proves a turn. */
  function exhaustion(K, s, peers) {
    var down = s.dir > 0, out = [], n = K.length; if (n < 12) return out;
    var last6 = K.slice(-6), prev6 = K.slice(-12, -6), sl = function (a) { return (+a[a.length - 1].c - +a[0].o) / +a[0].o * 100 };
    if (Math.abs(sl(last6)) < 0.5 * Math.abs(sl(prev6)) && (down ? sl(prev6) < 0 : sl(prev6) > 0)) out.push('Momentum slowing: the last 30 minutes moved under half as much as the 30 before');
    var pl = pivots(K, down ? 'low' : 'high'); if (pl.length >= 2) { var a = pl[pl.length - 2], b = pl[pl.length - 1], newer = down ? +K[b].l < +K[a].l : +K[b].h > +K[a].h; if (newer && +K[b].v < +K[a].v) out.push('The latest ' + (down ? 'low' : 'high') + ' came on lower volume than the one before') }
    var tails = K.slice(-4).filter(function (c) { var r = +c.h - +c.l; return r > 0 && (down ? (+c.c - +c.l) / r >= 0.6 : (+c.h - +c.c) / r >= 0.6) }).length; if (tails >= 2) out.push(tails + ' of the last 4 candles closed well off their ' + (down ? 'lows' : 'highs'));
    var rng = function (a) { return mean(a.map(function (c) { return +c.h - +c.l })) }, dec = K.slice(s.pk, s.tr + 1); if (dec.length >= 4 && rng(K.slice(-4)) < 0.6 * rng(dec)) out.push('Candle ranges have narrowed to under 60% of the decline\'s average');
    (peers || []).forEach(function (p) { if (!p.K || p.K.length < 12) return; var ps = swing(p.K, s.dir); if (!ps || ps.ambiguous) return; var t1 = +K[s.tr].t, i1 = p.K.findIndex(function (c) { return +c.t === t1 }); if (i1 < 0) return; var before = p.K.slice(0, i1).reduce(function (m, c) { return down ? Math.min(m, +c.l) : Math.max(m, +c.h) }, down ? 1e18 : -1e18); if (down ? +p.K[i1].l > before : +p.K[i1].h < before) out.push(p.name + ' did not make a new ' + (down ? 'low' : 'high') + ' with the S&P') });
    if (n - 1 - s.tr >= 4) out.push('No new ' + (down ? 'low' : 'high') + ' for ' + (n - 1 - s.tr) * 5 + ' minutes');
    return out;
  }

  /* ---------- Options and news ---------- */
  function emRange(base, pct) { var m = base * pct / 100; return { m: m, lo: base - m, hi: base + m } }
  function emUsed(base, pct, px) { var r = emRange(base, pct); return { used: (px - base) / r.m * 100, toTop: r.hi - px, toBottom: px - r.lo } }
  /* Reaction to a headline at ts: base is the close of the last completed 1m candle before the headline minute. Windows count only once complete. */
  function impactCalc(cands, ts, now) {
    var t0 = ts - ts % 60e3, by = {}; (cands || []).forEach(function (c) { by[+c.t] = c }); var b0 = by[t0 - 60e3]; if (!b0) return null;
    var base = +b0.c, pre0 = by[t0 - 15 * 60e3], o = { base: base, pre: pre0 ? (base / +pre0.o - 1) * 100 : null, w: {} };
    [5, 15, 30, 60].forEach(function (w) { var c = by[t0 + (w - 1) * 60e3]; if (c && t0 + w * 60e3 <= now - 5e3) o.w[w] = (+c.c / base - 1) * 100 }); return o;
  }

  /* ---------- Forecast scoring: one prediction per target. Later briefs about the same target are revisions. ---------- */
  function scoreForecasts(docs, S, etClose) {
    var tg = {}, em = {};
    docs.forEach(function (d) {
      var u = new Date(d.updated).getTime();
      if (d.forecast && d.forecast.dir && d.forecast.date && isNum(d.forecast.ref)) { var key = d.forecast.date; var tclose = etClose(d.forecast.date); if (u < tclose) { tg[key] = tg[key] || []; tg[key].push({ u: u, f: d.forecast }) } }
      (d.opt && d.opt.em || []).forEach(function (e) { if (!e[4]) return; var k2 = e[3] + '|' + e[4] + '|' + (d.opt.asof || ''); var st0 = d.opt.asofTs ? +String(d.opt.asofTs).slice(0, 10).replace(/-/g, '') : +String(d.updated).slice(0, 10).replace(/-/g, ''); em[k2] = em[k2] || { exp: e[4], pct: e[1], base: d.opt.base, label: e[0], und: e[3], start: st0, n: 0 }; em[k2].n++ });
    });
    var dir = { n: 0, hit: 0, revisions: 0, pend: 0, up: 0, rows: [] };
    Object.keys(tg).forEach(function (k) { var L = tg[k].sort(function (a, b) { return a.u - b.u }), last = L[L.length - 1].f, j = S.ix[+k.replace(/-/g, '')]; dir.revisions += L.length - 1; if (j == null) { dir.pend++; return } var up = S.c[j] > last.ref; dir.n++; if ((last.dir === 'up') === up) dir.hit++; if (up) dir.up++; dir.rows.push({ date: k, dir: last.dir, ref: last.ref, close: S.c[j], hit: (last.dir === 'up') === up, regime: last.regime || null, versions: L.length }) });
    /* Implied moves: one outcome per (underlying, expiry). Copies from later briefs are revisions. Windows that overlap in time are correlated, so the
       effective sample counts only expiries whose windows do not overlap. */
    var cov = { n: 0, hit: 0, pend: 0, dup: 0, eff: 0, effHit: 0, byH: {}, rows: [] }, seen = {};
    Object.keys(em).forEach(function (k) { var e = em[k], key = e.und + '|' + e.exp; if (seen[key]) { cov.dup += e.n; return } seen[key] = 1; cov.dup += e.n - 1; var j = S.ix[+String(e.exp).replace(/-/g, '')]; if (j == null) { cov.pend++; return } var r = emRange(e.base, e.pct), hit = S.c[j] >= r.lo && S.c[j] <= r.hi; cov.n++; if (hit) cov.hit++; var hk = e.label; cov.byH[hk] = cov.byH[hk] || [0, 0]; cov.byH[hk][0]++; if (hit) cov.byH[hk][1]++; cov.rows.push({ start: e.start, exp: +String(e.exp).replace(/-/g, ''), hit: hit, und: e.und }) });
    cov.rows.sort(function (a, b) { return a.exp - b.exp }); var lastEnd = 0; cov.rows.forEach(function (r) { if (r.start >= lastEnd) { cov.eff++; if (r.hit) cov.effHit++; lastEnd = r.exp } });
    return { dir: dir, cov: cov };
  }

  /* ---------- Market fingerprint: features use data up to each date only ---------- */
  var FEAT = [['dd', 'Drawdown from 1 year high', '%'], ['r5', 'S&P 5 day return', '%'], ['r20', 'S&P 20 day return', '%'], ['vix', 'VIX close', ''], ['dvix', 'VIX 5 day change', ' pts'], ['tech', 'Nasdaq 100 vs S&P, 20 days', '%'], ['y20', '10 year yield, 20 day change', ' bps'], ['rv', 'S&P realized vol, 20 days', '%'], ['ma', 'S&P vs 200 day average', '%'], ['brd', 'Equal weight vs S&P, 20 days', '%'], ['semi', 'Semis vs Nasdaq 100, 20 days', '%']];
  function features(H) {
    var S = H.SPX, V = H.VIX, N = H.NDX, Y = H.US10Y, out = [];
    for (var i = 252; i < S.c.length; i++) {
      var d = S.d[i], vi = V.ix[d], ni = N ? N.ix[d] : null, yi = Y ? Y.ix[d] : null; if (vi == null || vi < 5) continue;
      var hi = 0; for (var j = i - 251; j <= i; j++) hi = Math.max(hi, S.c[j]);
      var lr = []; for (j = i - 19; j <= i; j++) lr.push(Math.log(S.c[j] / S.c[j - 1]));
      var ma = 0; for (j = i - 199; j <= i; j++) ma += S.c[j]; ma /= 200;
      var f = { d: d, i: i, dd: (S.c[i] / hi - 1) * 100, r5: (S.c[i] / S.c[i - 5] - 1) * 100, r20: (S.c[i] / S.c[i - 20] - 1) * 100, vix: V.c[vi], dvix: V.c[vi] - V.c[vi - 5], rv: sd(lr) * Math.sqrt(252) * 100, ma: (S.c[i] / ma - 1) * 100 };
      f.tech = ni != null && ni >= 20 ? ((N.c[ni] / N.c[ni - 20]) - (S.c[i] / S.c[i - 20])) * 100 : null;
      var rel = function (A, Bs) { if (!A || !Bs) return null; var a = A.ix[d], b = Bs.ix[d]; if (a == null || b == null || a < 20 || b < 20) return null; return ((A.c[a] / A.c[a - 20]) - (Bs.c[b] / Bs.c[b - 20])) * 100 };
      f.brd = rel(H.RSP10, H.SPY10); f.semi = rel(H.SMH10, H.QQQ10);
      if (yi != null) { var yb = null; for (var k = yi - 20; k >= yi - 26 && k >= 0; k--) { if (Y.d[k] <= S.d[i - 20]) { yb = Y.c[k]; break } } f.y20 = yb != null ? (Y.c[yi] - yb) * 100 : null } else f.y20 = null;
      out.push(f);
    }
    /* expanding mean and sd, so each date is scaled with information known then */
    var acc = {}; FEAT.forEach(function (x) { acc[x[0]] = { n: 0, s: 0, q: 0 } });
    out.forEach(function (f) { FEAT.forEach(function (x) { var k = x[0], v = f[k], a = acc[k]; if (isNum(v)) { a.n++; a.s += v; a.q += v * v } var m = a.n ? a.s / a.n : 0, s = a.n > 30 ? Math.sqrt(Math.max(1e-9, a.q / a.n - m * m)) : null; f['z' + k] = isNum(v) && s ? (v - m) / s : null }) });
    return out;
  }
  function neighbors(F, ti, keys, K, sep, horizon) {
    var t = F[ti], c = [];
    for (var i = 0; i < ti - horizon; i++) { var f = F[i], s = 0, m = 0; keys.forEach(function (k) { var a = t['z' + k], b = f['z' + k]; if (isNum(a) && isNum(b)) { s += (a - b) * (a - b); m++ } }); if (m >= Math.max(1, keys.length - 2)) c.push([Math.sqrt(s / m), i]) }
    c.sort(function (a, b) { return a[0] - b[0] }); var pick = [];
    for (var j = 0; j < c.length && pick.length < K; j++) { var ok = true; for (var q = 0; q < pick.length; q++) if (Math.abs(F[pick[q][1]].i - F[c[j][1]].i) < sep) { ok = false; break } if (ok) pick.push(c[j]) }
    return pick;
  }
  function fwdRet(S, i, k) { return i + k < S.c.length ? (S.c[i + k] / S.c[i] - 1) * 100 : null }


  /* ---------- Conditional intraday engine ----------
     Day objects: {d, prev (prior close), b: [[hm, o, h, l, c, v], ...13 bars], semi: same for SMH or null}.
     State after bar t uses bars 0..t only. Outcomes use bars after t. */
  function dayState(D, t, atr) {
    var b = D.b.slice(0, t + 1), o = b[0][1], c = b[t][4], hi = -1e18, lo = 1e18, pv = 0, vv = 0;
    b.forEach(function (x) { hi = Math.max(hi, x[2]); lo = Math.min(lo, x[3]); var tp = (x[2] + x[3] + x[4]) / 3; pv += tp * x[5]; vv += x[5] });
    var s = { t: t, o: o, c: c, hi: hi, lo: lo, vwap: vv ? pv / vv : c, gap: D.prev ? (o / D.prev - 1) * 100 : 0, ret: (c / o - 1) * 100, pos: hi > lo ? (c - lo) / (hi - lo) : 0.5, rng: atr ? (hi - lo) / atr : null };
    if (D.semi && D.semi.length > t) s.semi = (D.semi[t][4] / D.semi[0][1] - 1) * 100 - s.ret; else s.semi = null;
    return s;
  }
  function dayOutcome(D, s) {
    var rest = D.b.slice(s.t + 1), close = D.b[D.b.length - 1][4], laterHi = -1e18, laterLo = 1e18, vwapBack = false, pv = 0, vv = 0;
    D.b.slice(0, s.t + 1).forEach(function (x) { var tp = (x[2] + x[3] + x[4]) / 3; pv += tp * x[5]; vv += x[5] });
    rest.forEach(function (x) { laterHi = Math.max(laterHi, x[2]); laterLo = Math.min(laterLo, x[3]); var tp = (x[2] + x[3] + x[4]) / 3; pv += tp * x[5]; vv += x[5]; if (vv && x[4] > pv / vv) vwapBack = true });
    var none = !rest.length, dec = s.hi - s.lo;
    return { highDone: none || laterHi <= s.hi, lowDone: none || laterLo >= s.lo, newHigh: !none && laterHi > s.hi, newLow: !none && laterLo < s.lo, openBack: s.c < s.o ? (!none && laterHi >= s.o) : null, vwapBack: s.c < s.vwap ? vwapBack : null, closeUp: D.prev ? close > D.prev : null, up: none ? 0 : (laterHi / s.c - 1) * 100, down: none ? 0 : (laterLo / s.c - 1) * 100,
      rec25: dec > 0 && s.c < s.hi ? (!none && (laterHi - s.lo) / dec >= 0.25) : null, rec50: dec > 0 && s.c < s.hi ? (!none && (laterHi - s.lo) / dec >= 0.5) : null, rec75: dec > 0 && s.c < s.hi ? (!none && (laterHi - s.lo) / dec >= 0.75) : null, rec100: dec > 0 && s.c < s.hi ? (!none && laterHi >= s.hi) : null };
  }
  var IKEYS = ['gap', 'ret', 'pos', 'rng', 'semi'], OUT = ['highDone', 'lowDone', 'newHigh', 'newLow', 'openBack', 'vwapBack', 'closeUp', 'rec25', 'rec50', 'rec75', 'rec100'];
  function intradayPredict(hist, s, K) {
    /* hist: [{s, o}] from earlier days at the same bar. Features are scaled with those earlier days only. */
    var sc = {}; IKEYS.forEach(function (k) { var v = hist.map(function (h) { return h.s[k] }).filter(isNum); sc[k] = v.length > 10 ? [mean(v), sd(v) || 1] : null });
    var dist = hist.map(function (h) { var q = 0, m = 0; IKEYS.forEach(function (k) { if (!sc[k] || !isNum(s[k]) || !isNum(h.s[k])) return; var z = (s[k] - h.s[k]) / sc[k][1]; q += z * z; m++ }); return [m ? Math.sqrt(q / m) : 1e9, h] }).sort(function (a, b) { return a[0] - b[0] }).slice(0, K || 30);
    var p = {}; OUT.forEach(function (k) { var v = dist.map(function (x) { return x[1].o[k] }).filter(function (x) { return x === true || x === false }); p[k] = v.length >= 10 ? { p: v.filter(Boolean).length / v.length, n: v.length } : null });
    p.up = stats(dist.map(function (x) { return x[1].o.up })); p.down = stats(dist.map(function (x) { return x[1].o.down })); p.n = dist.length; return p;
  }
  function brierSkill(preds) { /* preds: [[p, outcome, baseP]] */ var b = 0, b0 = 0; preds.forEach(function (x) { b += (x[0] - (x[1] ? 1 : 0)) * (x[0] - (x[1] ? 1 : 0)); b0 += (x[2] - (x[1] ? 1 : 0)) * (x[2] - (x[1] ? 1 : 0)) }); return preds.length && b0 ? 1 - b / b0 : null }

  /* ---------- Recovery after extreme declines, pooled across tickers, one cluster per ticker ---------- */
  function recovery(list, X, opt) {
    var ev = [], win = (opt && opt.days) || 1;
    list.forEach(function (T) { var last = -1e9; for (var i = win; i < T.c.length; i++) { var r = (T.c[i] / T.c[i - win] - 1) * 100; if (r > -X || i - last < 20 || crossesBreak(T, i - win, i)) continue; last = i; var ref = T.c[i - win], x = { sym: T.sym, d: T.d[i], drop: r, rec: {}, t: null };
      [20, 60, 120].forEach(function (h) { var j1 = i + h; if (j1 >= T.c.length || crossesBreak(T, i, j1)) { x.rec[h] = null; return } var got = false; for (var j = i + 1; j <= j1; j++) if (T.c[j] >= ref) { got = true; if (x.t == null) x.t = j - i; break } x.rec[h] = got });
      var j2 = Math.min(T.c.length - 1, i + 60); if (i + 60 < T.c.length && !crossesBreak(T, i, i + 60)) { var mn = 1e18, mx = -1e18; for (var j3 = i + 1; j3 <= j2; j3++) { mn = Math.min(mn, T.c[j3]); mx = Math.max(mx, T.c[j3]) } x.mae = (mn / T.c[i] - 1) * 100; x.mfe = (mx / T.c[i] - 1) * 100 }
      if (i + 20 < T.c.length) { var f = false; for (var j4 = i + 1; j4 <= i + 20; j4++) if ((T.c[j4] / T.c[i] - 1) * 100 <= -X / 2) f = true; x.more = f }
      ev.push(x) } });
    var pr = function (h) { var v = ev.filter(function (x) { return x.rec[h] === true || x.rec[h] === false }); return { n: v.length, k: v.filter(function (x) { return x.rec[h] }).length } };
    var m = ev.filter(function (x) { return isNum(x.mae) }), mo = ev.filter(function (x) { return x.more === true || x.more === false });
    return { ev: ev, r20: pr(20), r60: pr(60), r120: pr(120), tmed: median(ev.filter(function (x) { return x.t != null }).map(function (x) { return x.t })), mae: median(m.map(function (x) { return x.mae })), mfe: median(m.map(function (x) { return x.mfe })), more: { n: mo.length, k: mo.filter(function (x) { return x.more }).length } };
  }

  /* ---------- Options strategies held to expiry from saved chain snapshots ----------
     Sells fill at the bid, buys at the ask, plus a commission per contract. Settlement uses the underlying close on expiry. */
  function pickDelta(rows, type, target) { var c = rows.filter(function (r) { return r[0] === type }); if (!c.length) return null; return c.reduce(function (a, r) { return Math.abs(Math.abs(r[4]) - target) < Math.abs(Math.abs(a[4]) - target) ? r : a }) }
  function optionStrategies(snap, closeAtExpiry, fee) {
    fee = fee == null ? 0.0065 : fee; var R = snap.rows, S = snap.underlying, E = closeAtExpiry, out = [];
    var put = function (k) { return Math.max(0, k - E) }, call = function (k) { return Math.max(0, E - k) };
    var p20 = pickDelta(R, 'P', 0.20), p10 = pickDelta(R, 'P', 0.10), c20 = pickDelta(R, 'C', 0.20), c30 = pickDelta(R, 'C', 0.30), c50 = pickDelta(R, 'C', 0.50);
    if (p20) out.push({ name: 'Cash secured put, 0.20 delta', credit: p20[2], pnl: p20[2] - put(p20[1]) - fee, maxLoss: p20[1] - p20[2], capital: p20[1], assigned: E < p20[1], spread: p20[3] - p20[2] });
    if (c20) out.push({ name: 'Covered call, 0.20 delta', credit: c20[2], pnl: (Math.min(E, c20[1]) - S) + c20[2] - fee, maxLoss: S - c20[2], capital: S, assigned: E > c20[1], spread: c20[3] - c20[2] });
    if (p20 && p10 && p10[1] < p20[1]) { var cr = p20[2] - p10[3]; out.push({ name: 'Put credit spread, 0.20 / 0.10', credit: cr, pnl: cr - (put(p20[1]) - put(p10[1])) - 2 * fee, maxLoss: (p20[1] - p10[1]) - cr, capital: (p20[1] - p10[1]) - cr, assigned: E < p20[1], spread: (p20[3] - p20[2]) + (p10[3] - p10[2]) }) }
    if (c50 && c30 && c30[1] > c50[1]) { var db = c50[3] - c30[2]; out.push({ name: 'Call debit spread, 0.50 / 0.30', credit: -db, pnl: (call(c50[1]) - call(c30[1])) - db - 2 * fee, maxLoss: db, capital: db, assigned: false, spread: (c50[3] - c50[2]) + (c30[3] - c30[2]) }) }
    out.forEach(function (o) { o.ret = o.capital > 0 ? o.pnl / o.capital * 100 : null }); return out;
  }


  /* ---------- Intraday engine v2: features, outcomes, model prediction (shared by research and page) ---------- */
  var OUT2 = ['highDone', 'lowDone', 'closeAbove'];
  var IFEAT = ['gap', 'ret', 'prev', 'rng', 'pos', 'dh', 'dl', 'vwap', 'rvol', 'orr', 'orpos', 'vix', 'rs', 'brd', 'earn', 'mon', 'fri', 'tod', 'atr'];
  var INAMES = { gap: 'Opening gap', ret: 'Move from the open', prev: 'Previous session move', rng: 'Range so far', pos: 'Position in the range', dh: 'Distance below the high', dl: 'Distance above the low', vwap: 'VWAP distance', rvol: 'Relative volume', orr: 'Opening range', orpos: 'Position vs opening range', vix: 'VIX', rs: 'Semis relative strength', brd: 'Breadth (equal weight vs S&P)', earn: 'Earnings reaction', mon: 'Monday', fri: 'Friday', tod: 'Time of day', atr: 'Daily volatility' };
  /* S: {b: [[hm,o,h,l,c,v]...] completed regular session bars, res: minutes per bar, prev: prior close, prevRet: prior session %,
        atr: average daily range % (prior 20 sessions), cumv: average cumulative volume by bar index or null, ref: reference bars or null,
        vix: prior VIX close, brd: prior day equal weight minus cap weight %, earn: 0/1, dow: 0 Monday .. 4 Friday }
     k: number of completed bars at the decision time. Only bars 0..k-1 are read. */
  function ifeat(S, k) {
    var b = S.b, a = S.atr || 1, o = b[0][1], px = b[k - 1][4], hi = -1e18, lo = 1e18, pv = 0, vv = 0, cv = 0, orN = Math.max(1, Math.min(k, Math.round(30 / S.res))), oh = -1e18, ol = 1e18;
    for (var i = 0; i < k; i++) { var r = b[i]; if (r[2] > hi) hi = r[2]; if (r[3] < lo) lo = r[3]; var tp = (r[2] + r[3] + r[4]) / 3; pv += tp * r[5]; vv += r[5]; cv += r[5]; if (i < orN) { if (r[2] > oh) oh = r[2]; if (r[3] < ol) ol = r[3] } }
    var vw = vv > 0 ? pv / vv : px, rf = S.ref && S.ref.length >= k ? S.ref : null, base = S.cumv && S.cumv[k - 1] > 0 ? S.cumv[k - 1] : 0;
    var f = {
      gap: (o / S.prev - 1) * 100 / a, ret: (px / o - 1) * 100 / a, prev: (S.prevRet || 0) / a, rng: (hi - lo) / o * 100 / a,
      pos: hi > lo ? (px - lo) / (hi - lo) : 0.5, dh: (hi - px) / o * 100 / a, dl: (px - lo) / o * 100 / a, vwap: (px / vw - 1) * 100 / a,
      rvol: base && cv > 0 ? Math.log(cv / base) : 0, orr: (oh - ol) / o * 100 / a, orpos: oh > ol ? (px - ol) / (oh - ol) : 0.5,
      vix: isNum(S.vix) ? (S.vix - 18) / 8 : 0, rs: rf ? ((px / o) - (rf[k - 1][4] / rf[0][1])) * 100 / a : 0, brd: S.brd || 0, earn: S.earn ? 1 : 0,
      mon: S.dow === 0 ? 1 : 0, fri: S.dow === 4 ? 1 : 0, tod: k * S.res / 390, atr: Math.log(a)
    };
    return IFEAT.map(function (q) { var v = f[q]; return isFinite(v) ? v : 0 });
  }
  function iout(S, k) {
    var b = S.b, px = b[k - 1][4], hi = -1e18, lo = 1e18, ha = -1e18, la = 1e18;
    for (var i = 0; i < b.length; i++) { var r = b[i]; if (i < k) { if (r[2] > hi) hi = r[2]; if (r[3] < lo) lo = r[3] } else { if (r[2] > ha) ha = r[2]; if (r[3] < la) la = r[3] } }
    var cl = b[b.length - 1][4];
    if (k >= b.length) return null;
    return { highDone: ha <= hi ? 1 : 0, lowDone: la >= lo ? 1 : 0, closeAbove: cl > px ? 1 : 0, remUp: Math.max(0, (ha / px - 1) * 100), remDn: Math.min(0, (la / px - 1) * 100), retClose: (cl / px - 1) * 100 };
  }
  function sigm(z) { return z > 30 ? 1 : z < -30 ? 0 : 1 / (1 + Math.exp(-z)) }
  function binIdx(v, n) { return Math.max(0, Math.min(n - 1, Math.floor(v * n))) }
  function freqKey(M, x) {
    var t = Math.round(x[IFEAT.indexOf('tod')] * 1000), p = binIdx(x[IFEAT.indexOf('pos')], 5);
    if (M.kind === 'tod') return [String(t)];
    if (M.kind === 'pos') return [t + '|' + p, String(t)];
    var g = x[IFEAT.indexOf('gap')] >= 0 ? 1 : 0, r = x[IFEAT.indexOf('rng')], rb = r < M.cut[0] ? 0 : r < M.cut[1] ? 1 : 2;
    return [t + '|' + p + '|' + g + '|' + rb, t + '|' + p, String(t)];
  }
  function treeVal(T, x) { var i = 0; while (T[i].length === 4) i = x[T[i][0]] <= T[i][1] ? T[i][2] : T[i][3]; return T[i][0] }
  /* M: a fitted model as exported by tools/ml.js. Returns a probability. */
  function mlPredict(M, x) {
    if (M.type === 'freq') { var ks = freqKey(M, x); for (var i = 0; i < ks.length; i++) if (M.p[ks[i]] != null) return M.p[ks[i]]; return M.base }
    if (M.type === 'logit') { var z = M.b; for (var j = 0; j < M.w.length; j++) z += M.w[j] * (x[j] - M.mu[j]) / M.sd[j]; return sigm(z) }
    if (M.type === 'gbt') { var s = M.f0; M.trees.forEach(function (T) { s += M.lr * treeVal(T, x) }); return sigm(s) }
    if (M.type === 'rf') { var a = 0; M.trees.forEach(function (T) { a += treeVal(T, x) }); return a / M.trees.length }
    if (M.type === 'knn') {
      var d = M.X.map(function (r, n) { var s2 = 0; for (var q = 0; q < r.length; q++) { var u = (x[M.cols[q]] - M.mu[q]) / M.sd[q] - r[q]; s2 += u * u } return [s2, n] }).sort(function (A, B) { return A[0] - B[0] }).slice(0, M.k);
      return (d.reduce(function (t, z) { return t + M.y[z[1]] }, 0) + 1) / (d.length + 2);
    }
    return null;
  }
  /* Remaining move percentiles from a conditional table with backoff: returns {up: [p10,p50,p90], dn: [...], n} */
  function qLookup(Q, x) { var ks = freqKey({ kind: 'cond', cut: Q.cut }, x); for (var i = 0; i < ks.length; i++) { var e = Q.t[ks[i]]; if (e && e.n >= Q.minN) return e } return null }
  function blockBoot(groups, stat, B, seed) {
    var keys = Object.keys(groups), out = [], s = seed || 7, rnd = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 };
    for (var b = 0; b < (B || 500); b++) { var pick = []; for (var i = 0; i < keys.length; i++) pick = pick.concat(groups[keys[Math.floor(rnd() * keys.length)]]); var v = stat(pick); if (isNum(v)) out.push(v) }
    out.sort(function (a, c) { return a - c }); if (out.length < 20) return [null, null];
    return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
  }
  /* Kaplan Meier: items [{t: time or null, done: bool, obs: sessions observed}] -> S(h) for each h */
  function kaplanMeier(items, hs) {
    var ev = items.map(function (e) { return e.done ? { t: e.t, d: 1 } : { t: e.obs, d: 0 } }).sort(function (a, b) { return a.t - b.t || b.d - a.d });
    var S = 1, n = ev.length, i = 0, curve = [[0, 1]];
    while (i < ev.length) { var t = ev[i].t, d = 0, c = 0; while (i < ev.length && ev[i].t === t) { if (ev[i].d) d++; else c++; i++ } if (d) { S *= (1 - d / n); curve.push([t, S]) } n -= d + c }
    var at = function (h) { var v = 1; curve.forEach(function (p) { if (p[0] <= h) v = p[1] }); return v };
    var med = null; for (var q = 0; q < curve.length; q++) if (curve[q][1] <= 0.5) { med = curve[q][0]; break }
    var r = { med: med, curve: curve }; (hs || []).forEach(function (h) { r[h] = at(h) }); return r;
  }


  /* Recovery engine v2. list: [{sym, d, c, breaks, low: {date: intraday low} optional}]. A decline of X% over `days` sessions must be complete
     at the entry close before anything after it is measured. Events in the same stock are separated by at least the horizon being measured,
     events in different stocks within 7 calendar days form one market cluster, and ranges resample whole clusters. Probabilities use
     Kaplan Meier so events that have not had time to recover yet count as censored rather than as failures. */
  function recovery2(list, X, opt) {
    opt = opt || {}; var days = opt.days || 1, H = [20, 60, 120], ev = [];
    list.forEach(function (S) {
      var c = S.c, last = -1e9;
      for (var i = days; i < c.length; i++) {
        if (crossesBreak(S, i - days, i) || i - last < 20) continue;
        var dr = (c[i] / c[i - days] - 1) * 100; if (dr > -X) continue; last = i;
        var ref = c[i - days], t = null; for (var j = i + 1; j < c.length; j++) { if (crossesBreak(S, i, j)) break; if (c[j] >= ref) { t = j - i; break } }
        var obs = c.length - 1 - i, mae = null, mfe = null, maeLow = null, more = null;
        if (obs >= 1) { var w = c.slice(i + 1, Math.min(c.length, i + 61)); mae = (Math.min.apply(0, w) / c[i] - 1) * 100; mfe = (Math.max.apply(0, w) / c[i] - 1) * 100;
          if (S.low) { var lw = []; for (var q = i + 1; q < Math.min(c.length, i + 61); q++) if (S.low[S.d[q]] != null) lw.push(S.low[S.d[q]]); if (lw.length === w.length) maeLow = (Math.min.apply(0, lw) / c[i] - 1) * 100 } }
        if (obs >= 20) { more = false; for (var m = i + 1; m <= i + 20; m++) if (c[m] <= c[i] * (1 - X / 200)) { more = true; break } }
        ev.push({ sym: S.sym, i: i, d: S.d[i], drop: dr, t: t, done: t != null, obs: obs, mae: mae, mfe: mfe, maeLow: maeLow, more: more, day: Date.UTC(Math.floor(S.d[i] / 1e4), Math.floor(S.d[i] / 100) % 100 - 1, S.d[i] % 100) / 864e5 });
      }
    });
    ev.sort(function (a, b) { return a.day - b.day }); var cl = 0, lastDay = -1e9; ev.forEach(function (e) { if (e.day - lastDay > 7) cl++; e.cluster = cl; lastDay = e.day });
    var out = { ev: ev, clusters: cl, rec: {} };
    H.forEach(function (h) {
      var sub = [], lastBy = {}; ev.forEach(function (e) { var lb = lastBy[e.sym]; if (lb != null && e.i - lb < h) return; lastBy[e.sym] = e.i; sub.push(e) });
      var km = function (a) { var r = kaplanMeier(a.map(function (e) { return { t: e.t, done: e.done && e.t <= e.obs, obs: e.obs } }), [h]); return 1 - r[h] };
      var g = {}; sub.forEach(function (e) { (g[e.cluster] = g[e.cluster] || []).push(e) });
      var ci = blockBoot(g, function (a) { return a.length >= 5 ? km(a) : null }, 400, 13);
      out.rec[h] = { n: sub.length, clusters: Object.keys(g).length, censored: sub.filter(function (e) { return !e.done && e.obs < h }).length, p: sub.length ? km(sub) : null, ci: ci };
    });
    var all = kaplanMeier(ev.map(function (e) { return { t: e.t, done: e.done, obs: e.obs } }), []); out.tmed = all.med; out.curve = all.curve;
    var s20 = [], lb2 = {}; ev.forEach(function (e) { var lb = lb2[e.sym]; if (lb != null && e.i - lb < 20) return; lb2[e.sym] = e.i; s20.push(e) });
    var mo = s20.filter(function (e) { return e.more != null }); out.more = { n: mo.length, k: mo.filter(function (e) { return e.more }).length };
    var w60 = ev.filter(function (e) { return isNum(e.mae) && e.obs >= 60 }); out.mae = median(w60.map(function (e) { return e.mae })); out.mfe = median(w60.map(function (e) { return e.mfe }));
    var wl = w60.filter(function (e) { return isNum(e.maeLow) }); out.maeLow = wl.length >= 5 ? median(wl.map(function (e) { return e.maeLow })) : null; out.maeLowN = wl.length; out.maeCloseSameN = wl.length >= 5 ? median(wl.map(function (e) { return e.mae })) : null;
    return out;
  }


  /* Pre open context for a session dated d, built only from daily rows dated before d. Shared by research and the page.
     dly, vix, rsp, spy: rows [d, o, h, l, c]; earn: [[yyyymmdd, 'pre' or 'post'], ...] */
  function lastBefore(rows, d) { var lo = 0, hi = rows.length; while (lo < hi) { var m = (lo + hi) >> 1; if (rows[m][0] < d) lo = m + 1; else hi = m } return lo - 1 }
  function ymdDow(d) { return (new Date(Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100)).getUTCDay() + 6) % 7 }
  function iDayCtx(dly, vix, rsp, spy, earn, d) {
    var i = lastBefore(dly, d); if (i < 21) return null;
    var a = 0; for (var j = i - 19; j <= i; j++) a += (dly[j][2] - dly[j][3]) / dly[j][4] * 100; a /= 20;
    var vi = lastBefore(vix, d), ri = lastBefore(rsp, d), si = lastBefore(spy, d), brd = 0;
    if (ri > 0 && si > 0 && rsp[ri][0] === spy[si][0]) brd = ((rsp[ri][4] / rsp[ri - 1][4]) - (spy[si][4] / spy[si - 1][4])) * 100;
    var ses = dly.map(function (r) { return r[0] }), earnF = 0, after = function (x) { for (var q = 0; q < ses.length; q++) if (ses[q] > x) return ses[q]; return 0 };
    (earn || []).forEach(function (e) { var r0 = e[1] === 'pre' ? e[0] : (after(e[0]) || (e[0] < d ? d : 0)); if (!r0) return; var r1 = after(r0) || (r0 < d ? d : 0); if (d === r0 || d === r1) earnF = 1 });
    return { prev: dly[i][4], prevRet: (dly[i][4] / dly[i - 1][4] - 1) * 100, atr: a, vix: vi >= 0 ? vix[vi][4] : null, brd: brd, earn: earnF, dow: ymdDow(d) };
  }
  /* average cumulative volume by bar index over up to 20 earlier sessions (each an array of bars) */
  function iCumv(prior, nbar) {
    var p = prior.slice(-20); if (p.length < 5) return null; var out = [];
    for (var k = 0; k < nbar; k++) { var s = 0; p.forEach(function (b) { var c = 0; for (var j = 0; j <= k && j < b.length; j++) c += b[j][5]; s += c }); out.push(s / p.length) }
    return out;
  }


  /* ---------- Weekly engine helpers (shared by research and page) ---------- */
  var WFEAT = ['wret', 'pos', 'rng', 'day', 'prevw', 'vix', 'r5'];
  function wkey(d) { return Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100) - ymdDow(d) * 864e5 }
  function weeksOf(rows) { var by = {}, ks = []; rows.forEach(function (r) { var k = wkey(r[0]); if (!by[k]) { by[k] = []; ks.push(k) } by[k].push(r) }); return ks.sort(function (a, b) { return a - b }).map(function (k) { return by[k] }) }
  /* state at the close of day j of week W (rows [d,o,h,l,c]); ctx: {watr, prevw, vix, r5} */
  function wstate(W, j, ctx) {
    var o = W[0][1], c = W[j][4], hi = -1e18, lo = 1e18; for (var i = 0; i <= j; i++) { hi = Math.max(hi, W[i][2]); lo = Math.min(lo, W[i][3]) }
    var a = ctx.watr || 1;
    return { x: [(c / o - 1) * 100 / a, hi > lo ? (c - lo) / (hi - lo) : 0.5, (hi - lo) / o * 100 / a, ymdDow(W[j][0]) / 4, (ctx.prevw || 0) / a, isNum(ctx.vix) ? (ctx.vix - 18) / 8 : 0, (ctx.r5 || 0) / a], hi: hi, lo: lo, c: c, o: o };
  }
  /* context for week wi known at the close of row index k of the daily rows */
  function wctx(Wk, wi, rows, k, vixMap) {
    var rg = []; for (var q = Math.max(0, wi - 20); q < wi; q++) { var w = Wk[q], h = -1e18, l = 1e18; w.forEach(function (r) { h = Math.max(h, r[2]); l = Math.min(l, r[3]) }); rg.push((h - l) / w[0][1] * 100) }
    var pw = Wk[wi - 1]; return { watr: rg.length ? mean(rg) : null, prevw: pw ? (pw[pw.length - 1][4] / pw[0][1] - 1) * 100 : 0, vix: vixMap ? vixMap[rows[k][0]] : null, r5: k >= 5 ? (rows[k][4] / rows[k - 5][4] - 1) * 100 : 0 };
  }
  function wpred(M, x) {
    if (M.type === 'wday') { var v = M.p[Math.round(x[3] * 4)]; return v == null ? M.base : v }
    if (M.type === 'wdaypos') { var v2 = M.p[Math.round(x[3] * 4) + '|' + Math.min(2, Math.floor(x[1] * 3))]; return v2 == null ? M.base : v2 }
    return mlPredict(M, x);
  }


  /* ---------- Live bar plumbing shared by the page and the tests ---------- */
  var ETFMT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
  function etParts(ms) { var p = {}; ETFMT.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value }); return { d: +(p.year + p.month + p.day), hm: (+p.hour % 24) * 100 + +p.minute } }
  /* six 5 minute bars -> one 30 minute bar, in order; an unfinished group is dropped */
  function to30(b5) { var out = []; for (var i = 0; i + 6 <= b5.length; i += 6) { var g = b5.slice(i, i + 6), h = -1e18, l = 1e18, v = 0; g.forEach(function (x) { h = Math.max(h, x[2]); l = Math.min(l, x[3]); v += x[5] }); out.push([g[0][0], g[0][1], h, l, g[5][4], v]) } return out }
  /* Unusual Whales REST candles -> completed regular session bars for the ET date of nowMs: [hm, o, h, l, c, v] */
  function uwBars(j, nowMs) {
    var today = etParts(nowMs).d, out = [];
    ((j && j.data) || []).forEach(function (c) { if ((c.market_time || 'r') !== 'r') return; var t = Date.parse(c.start_time), e = Date.parse(c.end_time); if (!isFinite(t) || !(e <= nowMs)) return; var q = etParts(t); if (q.d !== today || q.hm < 930 || q.hm >= 1600) return; out.push([q.hm, +c.open, +c.high, +c.low, +c.close, +(c.volume || 0)]) });
    out.sort(function (a, b) { return a[0] - b[0] }); var seen = {}; return out.filter(function (b) { if (seen[b[0]]) return false; seen[b[0]] = 1; return true });
  }


  /* ---------- NYSE calendar 2015 to 2027: full closures and 1pm closes (used to tell complete weeks and sessions from missing data) ---------- */
  var NYSE_HOL = ('20150101 20150119 20150216 20150403 20150525 20150703 20150907 20151126 20151225 20160101 20160118 20160215 20160325 20160530 20160704 20160905 20161124 20161226 ' +
    '20170102 20170116 20170220 20170414 20170529 20170704 20170904 20171123 20171225 20180101 20180115 20180219 20180330 20180528 20180704 20180903 20181122 20181205 20181225 ' +
    '20190101 20190121 20190218 20190419 20190527 20190704 20190902 20191128 20191225 20200101 20200120 20200217 20200410 20200525 20200703 20200907 20201126 20201225 ' +
    '20210101 20210118 20210215 20210402 20210531 20210705 20210906 20211125 20211224 20220117 20220221 20220415 20220530 20220620 20220704 20220905 20221124 20221226 ' +
    '20230102 20230116 20230220 20230407 20230529 20230619 20230704 20230904 20231123 20231225 20240101 20240115 20240219 20240329 20240527 20240619 20240704 20240902 20241128 20241225 ' +
    '20250101 20250109 20250120 20250217 20250418 20250526 20250619 20250704 20250901 20251127 20251225 20260101 20260119 20260216 20260403 20260525 20260619 20260703 20260907 20261126 20261225 ' +
    '20270101 20270118 20270215 20270326 20270531 20270618 20270705 20270906 20271125 20271224').split(' ').map(Number);
  var NYSE_HALF = '20151127 20151224 20161125 20170703 20171124 20180703 20181123 20181224 20190703 20191129 20191224 20201127 20201224 20211126 20221125 20230703 20231124 20240703 20241129 20241224 20250703 20251128 20251224 20261127 20261224 20271126'.split(' ').map(Number);
  var HSET = {}, HALFSET = {}; NYSE_HOL.forEach(function (d) { HSET[d] = 1 }); NYSE_HALF.forEach(function (d) { HALFSET[d] = 1 });
  function ymdAdd(d, n) { var t = Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100) + n * 864e5, x = new Date(t); return x.getUTCFullYear() * 1e4 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate() }
  function isTradingDay(d) { var w = ymdDow(d); return w >= 0 && w <= 4 && !HSET[d] }
  function isHalfDay(d) { return !!HALFSET[d] }
  /* expected trading days of the Monday to Friday week containing d */
  function weekDays(d) { var m = ymdAdd(d, -ymdDow(d)), out = []; for (var i = 0; i < 5; i++) { var x = ymdAdd(m, i); if (isTradingDay(x)) out.push(x) } return out }
  /* a week is complete only when every expected trading day is present and the last one has closed (asOf is the last date with data) */
  function weekComplete(W, asOf) { var exp = weekDays(W[0][0]), have = W.map(function (r) { return r[0] }); return exp.length > 0 && exp.every(function (x) { return have.indexOf(x) >= 0 }) && asOf >= exp[exp.length - 1] }
  function calendarCovered(d) { return d >= 20150101 && d <= 20271231 }


  /* One definition of an intraday session for training, validation, the perp transfer test and the live page.
     o: {bars, ref, res, d, dly, vix, rsp, spy, earn, prior, src, perpPrev}
     bars and ref are completed regular session bars [hm,o,h,l,c,v] of the same resolution. For src 'perp' the previous close is the perp
     price at the prior 4pm cash close (perpPrev) and relative volume is not used, exactly as in the transfer test. */
  function iSession(o) {
    var cx = iDayCtx(o.dly, o.vix, o.rsp, o.spy, o.earn || [], o.d); if (!cx) return null;
    var perp = o.src === 'perp'; if (perp && !(o.perpPrev > 0)) return null;
    var full = o.res === 5 ? 78 : 13;
    return { b: o.bars, res: o.res, prev: perp ? o.perpPrev : cx.prev, prevRet: cx.prevRet, atr: cx.atr, vix: cx.vix, brd: cx.brd, earn: cx.earn, dow: cx.dow,
      cumv: perp ? null : iCumv((o.prior || []).filter(function (b) { return b.length === full }), full), ref: o.ref && o.ref.length ? o.ref : null, src: o.src || 'cash', ctx: cx };
  }


  /* ---------- Material developments: a headline matters when the measured reaction is large for that asset ---------- */
  var MSCALE = { SPY: 0.15, SPX: 0.15, QQQ: 0.18, NDX: 0.18, Brent: 0.35, Gold: 0.2, BTC: 0.6 };
  /* s: headline score, move: % move in the reaction window (15 minutes preferred), lbl: asset label. */
  function materiality(s, move, lbl) {
    if (!isNum(move)) return { z: null, material: false };
    var z = Math.abs(move) / (MSCALE[lbl] || 0.5);
    return { z: z, material: (s >= 6 && z >= 2) || z >= 3 };
  }

  return { materiality: materiality, iSession: iSession, isTradingDay: isTradingDay, isHalfDay: isHalfDay, weekDays: weekDays, weekComplete: weekComplete, ymdAdd: ymdAdd, calendarCovered: calendarCovered, etParts: etParts, to30: to30, uwBars: uwBars, OUT2: OUT2, WFEAT: WFEAT, wkey: wkey, weeksOf: weeksOf, wstate: wstate, wctx: wctx, wpred: wpred, iDayCtx: iDayCtx, iCumv: iCumv, ymdDow: ymdDow, recovery2: recovery2, IFEAT: IFEAT, INAMES: INAMES, ifeat: ifeat, iout: iout, mlPredict: mlPredict, qLookup: qLookup, freqKey: freqKey, blockBoot: blockBoot, kaplanMeier: kaplanMeier, sigm: sigm, dayState: dayState, dayOutcome: dayOutcome, IKEYS: IKEYS, OUT: OUT, intradayPredict: intradayPredict, brierSkill: brierSkill, recovery: recovery, optionStrategies: optionStrategies, pickDelta: pickDelta, STUDIES: STUDIES, sg: sg, isNum: isNum, median: median, mean: mean, sd: sd, stats: stats, wilson: wilson, pMean: pMean, pProp: pProp, pearson: pearson, ncdf: ncdf, HZ: HZ, runStudy: runStudy, summarize: summarize, walkForward: walkForward, completed: completed, pivots: pivots, vwap: vwap, swing: swing, structure: structure, classify: classify, exhaustion: exhaustion, emRange: emRange, emUsed: emUsed, impactCalc: impactCalc, scoreForecasts: scoreForecasts, FEAT: FEAT, features: features, neighbors: neighbors, fwdRet: fwdRet };
})();
if (typeof module !== 'undefined') module.exports = CORE;
