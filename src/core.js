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
    HZ.concat(st.entry === 'open' ? [0] : []).forEach(function (k) { var a = []; for (var i2 = 1; i2 < T.c.length; i2++) { var d2 = T.d[i2]; if (d2 < bfrom || d2 > to) continue; if (base !== T && base.ix[d2] == null) continue; var e2 = entryIdx(st, i2); if (e2 >= T.c.length) continue; var v = fwd(st, T, e2, k); if (isNum(v)) a.push(v) } bl[k] = stats(a) });
    /* Untouched test period: the last 25% of the target's dates in range are held out and reported separately */
    var span = T.d.filter(function (d3) { return d3 >= bfrom && d3 <= to }), cut = span.length ? span[Math.floor(span.length * 0.75)] : 0;
    return { st: st, T: Tsym, all: ev, sets: sets, base: bl, cut: cut, hasHL: !!T.h, src: T.src, asof: T.asof, start: Math.max(bfrom, T.d[0]) };
  }
  function summarize(R, k, part) {
    var a = (R.sets[k] || []).filter(function (x) { return part === 'train' ? x.d < R.cut : part === 'test' ? x.d >= R.cut : true }).map(function (x) { return x.r[k] });
    var b = R.base[k], s = stats(a), up = a.filter(function (v) { return v > 0 }).length;
    return { n: a.length, s: s, up: up, pUp: b && b.n ? pProp(up, a.length, b.up) : null, pMean: b && b.n ? pMean(a, b.mean) : null, excess: s.n ? s.mean - (b ? b.mean : 0) : null };
  }
  /* Walk forward: for each event in time order, use only earlier events to decide long or short (sign of their mean excess), then score the event. */
  function walkForward(R, k, minPrior) {
    var a = R.sets[k] || [], b = R.base[k] ? R.base[k].mean : 0, done = [], hits = 0, n = 0, pnl = [];
    a.forEach(function (x) { if (done.length >= (minPrior || 10)) { var m = mean(done) || 0, ex = x.r[k] - b; if (m !== 0) { n++; if ((m > 0) === (ex > 0)) hits++; pnl.push(m > 0 ? ex : -ex) } } done.push(x.r[k] - b) });
    return { n: n, hits: hits, avg: pnl.length ? mean(pnl) : null, ci: n ? wilson(hits, n) : [NaN, NaN] };
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
      (d.opt && d.opt.em || []).forEach(function (e) { if (!e[4]) return; var k2 = e[4] + '|' + e[3] + '|' + (d.opt.asof || ''); em[k2] = em[k2] || { exp: e[4], pct: e[1], base: d.opt.base, label: e[0], n: 0 }; em[k2].n++ });
    });
    var dir = { n: 0, hit: 0, revisions: 0, pend: 0, up: 0, rows: [] };
    Object.keys(tg).forEach(function (k) { var L = tg[k].sort(function (a, b) { return a.u - b.u }), last = L[L.length - 1].f, j = S.ix[+k.replace(/-/g, '')]; dir.revisions += L.length - 1; if (j == null) { dir.pend++; return } var up = S.c[j] > last.ref; dir.n++; if ((last.dir === 'up') === up) dir.hit++; if (up) dir.up++; dir.rows.push({ date: k, dir: last.dir, ref: last.ref, close: S.c[j], hit: (last.dir === 'up') === up, regime: last.regime || null, versions: L.length }) });
    var cov = { n: 0, hit: 0, pend: 0, dup: 0 };
    Object.keys(em).forEach(function (k) { var e = em[k], j = S.ix[+String(e.exp).replace(/-/g, '')]; cov.dup += e.n - 1; if (j == null) { cov.pend++; return } var r = emRange(e.base, e.pct); cov.n++; if (S.c[j] >= r.lo && S.c[j] <= r.hi) cov.hit++ });
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

  return { isNum: isNum, median: median, mean: mean, sd: sd, stats: stats, wilson: wilson, pMean: pMean, pProp: pProp, pearson: pearson, ncdf: ncdf, HZ: HZ, runStudy: runStudy, summarize: summarize, walkForward: walkForward, completed: completed, pivots: pivots, vwap: vwap, swing: swing, structure: structure, classify: classify, exhaustion: exhaustion, emRange: emRange, emUsed: emUsed, impactCalc: impactCalc, scoreForecasts: scoreForecasts, FEAT: FEAT, features: features, neighbors: neighbors, fwdRet: fwdRet };
})();
if (typeof module !== 'undefined') module.exports = CORE;
