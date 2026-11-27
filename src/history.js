/* ---------- Historical probability engine ----------
   Events are defined with data up to and including the event day close (or open for gaps). Outcomes use only later sessions.
   Thresholds are chosen by the user, never fitted. Overlapping events are thinned by a minimum gap in sessions.
   In sample = first 70% of events by date, out of sample = last 30%. Fewer than 10 events: no probabilities. */
var HIST = {}, HPEND = {};
function loadHist(syms) {
  return Promise.all(syms.map(function (s) {
    if (HIST[s]) return HIST[s]; if (HPEND[s]) return HPEND[s];
    return HPEND[s] = fetch('data/hist/' + s + '.json', { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error(s); return r.json() }).then(function (j) {
      var F = j.fields, o = { sym: s, src: j.src, asof: j.asof, d: [], o: null, h: null, l: null, c: [], ix: {} }, hasO = F.length === 5;
      if (hasO) { o.o = []; o.h = []; o.l = [] }
      j.rows.forEach(function (r, i) { o.d.push(r[0]); o.ix[r[0]] = i; if (hasO) { o.o.push(r[1]); o.h.push(r[2]); o.l.push(r[3]); o.c.push(r[4]) } else o.c.push(r[1]) });
      HIST[s] = o; return o;
    });
  }));
}
function dstr(d) { var s = String(d); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) }
function dlab(d) { var s = String(d); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+s.slice(4, 6)] + ' ' + (+s.slice(6)) + ' ' + s.slice(0, 4) }
var STUDIES = [
  { id: 'spxdown', name: 'S&P down day', data: ['SPX'], tgt: 'SPX', p: [['x', 'S&P closes down at least', 3, '%', 0.5]], desc: 'S&P 500 close to close decline, Cboe closes since 1975.',
    ev: function (S, i, P) { var c = S.SPX.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'streak', name: 'S&P losing streak', data: ['SPX'], tgt: 'SPX', p: [['n', 'Down closes in a row', 4, '', 1]], desc: 'The day a streak of lower S&P closes reaches the length you set.',
    ev: function (S, i, P) { var c = S.SPX.c, n = P.n; if (i < n + 1) return null; for (var k = 0; k < n; k++) if (!(c[i - k] < c[i - k - 1])) return null; if (c[i - n] < c[i - n - 1]) return null; return { v: (c[i] / c[i - n] - 1) * 100, ref: c[i - n] } } },
  { id: 'ndxdown', name: 'Nasdaq 100 down day', data: ['NDX'], tgt: 'NDX', p: [['x', 'Nasdaq 100 closes down at least', 4, '%', 0.5]], desc: 'Nasdaq 100 close to close decline, FRED closes since 1986.',
    ev: function (S, i, P) { var c = S.NDX.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'vixlevel', name: 'VIX above a level', data: ['VIX', 'SPX'], tgt: 'SPX', p: [['L', 'VIX closes at or above', 30, '', 1], ['cross', 'Only the first close above (1 = yes)', 1, '', 1]], desc: 'VIX close since 1990. Outcomes are the S&P 500.',
    ev: function (S, i, P) { var v = S.VIX.c; if (i < 1 || v[i] < P.L || (P.cross && v[i - 1] >= P.L)) return null; return { v: v[i], lab: 'VIX ' + v[i].toFixed(2) } } },
  { id: 'vixspike', name: 'VIX one day spike', data: ['VIX', 'SPX'], tgt: 'SPX', p: [['x', 'VIX closes up at least', 25, '%', 5]], desc: 'VIX close to close jump since 1990. Outcomes are the S&P 500.',
    ev: function (S, i, P) { var v = S.VIX.c; return i > 0 && (v[i] / v[i - 1] - 1) * 100 >= P.x ? { v: (v[i] / v[i - 1] - 1) * 100, lab: 'VIX ' + sg((v[i] / v[i - 1] - 1) * 100, 0) } : null } },
  { id: 'vixrev', name: 'VIX spike then reversal', data: ['VIX', 'SPX'], tgt: 'SPX', from: 1992, p: [['x', 'VIX intraday high above prior close by', 20, '%', 5], ['y', 'VIX closes no more than this above prior close', 5, '%', 1]], desc: 'Fear spikes intraday and fades by the close. VIX highs and lows since 1992. Outcomes are the S&P 500.',
    ev: function (S, i, P) { var V = S.VIX; if (i < 1 || !V.h) return null; var pc = V.c[i - 1]; if ((V.h[i] / pc - 1) * 100 >= P.x && (V.c[i] / pc - 1) * 100 <= P.y) return { v: (V.h[i] / pc - 1) * 100, lab: 'VIX high ' + sg((V.h[i] / pc - 1) * 100, 0) + ', close ' + sg((V.c[i] / pc - 1) * 100, 0) }; return null } },
  { id: 'recover', name: 'Intraday drop recovered', data: ['SPY'], tgt: 'SPY', p: [['x', 'SPY low below prior close by at least', 2, '%', 0.5], ['y', 'Share of the drop recovered by the close', 70, '%', 5]], desc: 'SPY daily bars, about 2 years from Unusual Whales. Small sample by design.',
    ev: function (S, i, P) { var T = S.SPY; if (i < 1) return null; var pc = T.c[i - 1], dd = (T.l[i] / pc - 1) * 100; if (dd > -P.x) return null; var rec = (T.c[i] - T.l[i]) / (pc - T.l[i]) * 100; return rec >= P.y ? { v: dd, lab: 'low ' + sg(dd) + ', ' + rec.toFixed(0) + '% recovered', ref: pc } : null } },
  { id: 'qqqhigh', name: 'Nasdaq drop, close near high', data: ['QQQ'], tgt: 'QQQ', p: [['x', 'QQQ low below prior close by at least', 3, '%', 0.5], ['y', 'Close in the top part of the range', 25, '%', 5]], desc: 'QQQ daily bars, about 2 years.',
    ev: function (S, i, P) { var T = S.QQQ; if (i < 1) return null; var pc = T.c[i - 1], dd = (T.l[i] / pc - 1) * 100, rg = T.h[i] - T.l[i]; if (dd > -P.x || !rg) return null; return (T.h[i] - T.c[i]) / rg * 100 <= P.y ? { v: dd, lab: 'low ' + sg(dd) + ', close ' + sg((T.c[i] / pc - 1) * 100), ref: pc } : null } },
  { id: 'stock', name: 'Big stock drop', data: ['NVDA', 'MU', 'SNDK', 'SMH'], tgt: 'pick', p: [['x', 'Closes down at least', 8, '%', 1]], pick: ['NVDA', 'MU', 'SNDK', 'SMH'], desc: 'Daily bars, about 2 years from Unusual Whales.',
    ev: function (S, i, P, T) { var c = T.c; return i > 0 && (c[i] / c[i - 1] - 1) * 100 <= -P.x ? { v: (c[i] / c[i - 1] - 1) * 100, ref: c[i - 1] } : null } },
  { id: 'gap', name: 'SPY opening gap', data: ['SPY'], tgt: 'SPY', entry: 'open', p: [['x', 'Gap size at least', 1, '%', 0.25], ['dir', 'Direction (1 = up, 0 = down)', 0, '', 1]], desc: 'SPY open vs prior close, about 2 years. Returns are measured from the open, the moment the gap is known.',
    ev: function (S, i, P) { var T = S.SPY; if (i < 1) return null; var g = (T.o[i] / T.c[i - 1] - 1) * 100; return (P.dir ? g >= P.x : g <= -P.x) ? { v: g, ref: T.c[i - 1], gap: 1 } : null } },
  { id: 'asia', name: 'Nikkei move, then US', data: ['N225', 'NDX', 'USDJPY'], tgt: 'NDX', entry: 'prev', corr: 1, p: [['x', 'Nikkei session move at least', 1.5, '%', 0.5], ['dir', 'Direction (1 = up, 0 = down)', 1, '', 1], ['ctrl', 'Prior US session move no bigger than (0 = off)', 0.5, '%', 0.25], ['fx', 'Measure Nikkei in dollars (1 = yes)', 0, '', 1]],
    desc: 'Tokyo closes at 1:00am ET, before the US session of the same date. The 1 session result is that US session, measured from the prior US close, so part of it happened before Tokyo closed. Nikkei from FRED since 1986, Nasdaq 100 from FRED. Dollar conversion uses the FRED noon New York yen rate, an approximation. A correlation is not a prediction.',
    ev: function (S, i, P) { var N = S.N225, d = N.d[i], X = S.NDX, j = X.ix[d]; if (i < 1 || j == null || j < 2) return null; var r = (N.c[i] / N.c[i - 1] - 1) * 100; if (P.fx) { var F = S.USDJPY, a = F.ix[d], b = F.ix[N.d[i - 1]]; if (a == null || b == null) return null; r = ((1 + r / 100) * F.c[b] / F.c[a] - 1) * 100 } var u = (X.c[j - 1] / X.c[j - 2] - 1) * 100; if (P.ctrl > 0 && Math.abs(u) > P.ctrl) return null; return (P.dir ? r >= P.x : r <= -P.x) ? { v: r, lab: 'Nikkei ' + sg(r) + (P.fx ? ' in dollars' : '') + ', prior US day ' + sg(u) } : null } },
  { id: 'asiasmh', name: 'Nikkei move, then US semis', data: ['N225', 'SMH', 'QQQ'], tgt: 'SMH', entry: 'open', p: [['x', 'Nikkei session move at least', 1.5, '%', 0.5], ['dir', 'Direction (1 = up, 0 = down)', 1, '', 1]],
    desc: 'Same date: Tokyo closes before the US open, so the SMH open to close result is information that was available. About 2 years of SMH bars. A correlation is not a prediction.',
    ev: function (S, i, P) { var N = S.N225, d = N.d[i]; if (i < 1 || S.SMH.ix[d] == null) return null; var r = (N.c[i] / N.c[i - 1] - 1) * 100; return (P.dir ? r >= P.x : r <= -P.x) ? { v: r, lab: 'Nikkei ' + sg(r) } : null } },
  { id: 'breadth', name: 'Breadth up, index down', data: ['SPY', 'RSP'], tgt: 'SPY', p: [['x', 'SPY closes down at least', 0.5, '%', 0.25], ['y', 'Equal weight RSP beats SPY by at least', 0.3, '%', 0.1]], desc: 'Equal weight vs cap weight, about 2 years. A breadth proxy, not exchange breadth.',
    ev: function (S, i, P) { var A = S.SPY, R = S.RSP, d = A.d[i], j = R.ix[d]; if (i < 1 || j == null || j < 1) return null; var a = (A.c[i] / A.c[i - 1] - 1) * 100, r = (R.c[j] / R.c[j - 1] - 1) * 100; return a <= -P.x && r - a >= P.y ? { v: a, lab: 'SPY ' + sg(a) + ', RSP ' + sg(r) } : null } }
];
var HS = { id: 'spxdown', P: {}, from: 0, to: 9999, gap: 10, pick: 'NVDA', open: null };
function tcrit(df) { var t = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09]; return df < 1 ? NaN : df <= 20 ? t[df - 1] : df <= 30 ? 2.05 : df <= 60 ? 2.0 : 1.96 }
function stats(a) { var n = a.length; if (!n) return { n: 0 }; var m = a.reduce(function (s, x) { return s + x }, 0) / n, sd = n > 1 ? Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m) }, 0) / (n - 1)) : 0, h = n > 1 ? tcrit(n - 1) * sd / Math.sqrt(n) : NaN; return { n: n, mean: m, med: median(a), lo: m - h, hi: m + h, up: a.filter(function (x) { return x > 0 }).length / n } }
function wilson(k, n) { if (!n) return [NaN, NaN]; var z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - w) / d, (c + w) / d] }
var HZ = [1, 2, 3, 5, 10, 20];
function runStudy(st, P, opt) {
  var S = {}; st.data.forEach(function (s) { S[s] = HIST[s] });
  var Tsym = st.tgt === 'pick' ? opt.pick : st.tgt, T = HIST[Tsym], base = st.tgt === 'pick' ? T : HIST[st.data[0]];
  var from = Math.max(opt.from || 0, st.from || 0) * 10000, to = (opt.to || 9999) * 10000 + 9999, ev = [], last = -1e9;
  for (var i = 1; i < base.d.length; i++) {
    var d = base.d[i]; if (d < from || d > to) continue;
    var e = st.ev(S, i, P, T); if (!e) continue;
    var ti = T.ix[d]; if (ti == null) continue;
    var raw = { d: d, ti: ti, e: e };
    if (ti - last < opt.gap) { ev.push(raw); raw.skip = true; continue } last = ti; ev.push(raw);
  }
  var hasHL = !!T.h, entry = function (ti) { return st.entry === 'open' ? T.o[ti] : st.entry === 'prev' ? T.c[ti - 1] : T.c[ti] };
  ev.forEach(function (x) {
    var ti0 = x.ti, e0 = entry(ti0), ti = st.entry === 'prev' ? ti0 - 1 : ti0, out = { r: {} };
    HZ.forEach(function (k) { var j = ti + k; if (j < T.c.length) out.r[k] = (T.c[j] / e0 - 1) * 100 });
    if (st.entry === 'open') out.r[0] = (T.c[ti0] / e0 - 1) * 100;
    var j0 = ti + 1, j1 = Math.min(T.c.length - 1, ti + 20);
    if (j1 >= ti + 20) {
      var hi = -1e18, lo = 1e18; for (var j = j0; j <= j1; j++) { hi = Math.max(hi, hasHL ? T.h[j] : T.c[j]); lo = Math.min(lo, hasHL ? T.l[j] : T.c[j]) }
      out.mfe = (hi / e0 - 1) * 100; out.mae = (lo / e0 - 1) * 100;
      var evLow = hasHL ? T.l[ti] : T.c[ti]; out.retest = lo <= evLow * 1.005; out.newlow = lo < evLow;
    }
    var ref = x.e.ref || (ti > 0 ? T.c[ti - 1] : null); if (ref && st.tgt !== 'SPX' && x.e.ref == null) ref = T.c[ti - 1];
    if (ref) { out.rec = null; for (var j2 = ti + 1; j2 <= Math.min(T.c.length - 1, ti + 60); j2++) { if (T.c[j2] >= ref) { out.rec = j2 - ti; break } } out.recOpen = ti + 60 > T.c.length - 1 && out.rec == null }
    if (x.e.gap && hasHL) { var pc = T.c[ti - 1], up = T.o[ti] > pc; out.fill0 = up ? T.l[ti] <= pc : T.h[ti] >= pc; if (ti + 4 < T.c.length) { var f5 = false; for (var j3 = ti; j3 <= ti + 4; j3++) if (up ? T.l[j3] <= pc : T.h[j3] >= pc) f5 = true; out.fill5 = f5 } }
    x.out = out;
  });
  var use = ev.filter(function (x) { return !x.skip });
  var bfrom = Math.max(from, base.d[1], (st.from || 0) * 10000); var bl = { r: {} }; HZ.forEach(function (k) { var a = []; for (var i2 = 1; i2 + k < T.c.length; i2++) { if (T.d[i2] < bfrom || T.d[i2] > to) continue; a.push((T.c[i2 + k] / T.c[i2] - 1) * 100) } bl.r[k] = stats(a) });
  return { st: st, T: Tsym, all: ev, use: use, base: bl, hasHL: hasHL, src: T.src, asof: T.asof, start: Math.max(bfrom, T.d[0]) };
}
function pctTxt(k, n) { if (n < 10) return 'n/a'; var w = wilson(k, n); return (k / n * 100).toFixed(0) + '% <span class="k">(' + (w[0] * 100).toFixed(0) + ' to ' + (w[1] * 100).toFixed(0) + ')</span>' }
function mTxt(s) { if (!s || s.n < 10) return 'n/a'; return sg(s.mean) + ' <span class="k">(' + (isNum(s.lo) ? sg(s.lo, 1) + ' to ' + sg(s.hi, 1) : 'n/a') + ')</span>' }
function renderStudy(R) {
  var u = R.use, n = u.length, h = '', st = R.st, tname = R.T === 'SPX' ? 'S&P 500' : R.T === 'NDX' ? 'Nasdaq 100' : R.T;
  h += '<div class="r"><b>' + n + ' independent events</b> <span class="k">(' + R.all.length + ' raw, at least ' + HS.gap + ' sessions apart). Outcomes on ' + esc(tname) + ', ' + esc(R.src) + ' from ' + dlab(R.start) + ' to ' + dlab(R.asof) + '.</span>' + (n < 10 ? '<div class="dn" style="margin-top:4px">Too few events to estimate probabilities. Dates are listed below for inspection.</div>' : n < 30 ? '<div class="am" style="margin-top:4px">Small sample. Treat every number as rough.</div>' : '') + '</div>';
  if (n >= 10) {
    var r1 = u.map(function (x) { return x.out.r[1] }).filter(isNum), up1 = r1.filter(function (x) { return x > 0 }).length;
    h += '<div class="r hrow head"><span></span><b>Events</b><b>All days</b></div>';
    h += '<div class="r hrow"><span>' + (st.entry === 'prev' ? 'Same date US session up' : st.entry === 'open' ? 'Up by the next close, from the open' : 'Next session up') + '</span><span>' + pctTxt(up1, r1.length) + '</span><span>' + (R.base.r[1].up * 100).toFixed(0) + '%</span></div>';
    if (st.entry === 'open') { var r0 = u.map(function (x) { return x.out.r[0] }).filter(isNum); h += '<div class="r hrow"><span>Same day, open to close</span><span>' + mTxt(stats(r0)) + '</span><span></span></div>' }
    HZ.forEach(function (k) { var a = u.map(function (x) { return x.out.r[k] }).filter(isNum), s = stats(a); h += '<div class="r hrow"><span>' + k + ' session' + (k > 1 ? 's' : '') + (st.entry === 'prev' ? ' from the prior US close' : st.entry === 'open' ? ' from the open' : '') + ' mean <span class="k">median, n</span></span><span>' + mTxt(s) + '<div class="k">' + (s.n ? sg(s.med) + ', ' + s.n : '') + '</div></span><span>' + sg(R.base.r[k].mean) + '<div class="k">' + sg(R.base.r[k].med) + '</div></span></div>' });
    var w = u.filter(function (x) { return isNum(x.out.mfe) });
    if (w.length >= 10) {
      h += '<div class="r hrow"><span>Best gain within 20 <span class="k">median</span></span><span>' + sg(median(w.map(function (x) { return x.out.mfe }))) + '</span><span></span></div>';
      h += '<div class="r hrow"><span>Worst drop within 20 <span class="k">median</span></span><span>' + sg(median(w.map(function (x) { return x.out.mae }))) + '</span><span></span></div>';
      h += '<div class="r hrow"><span>Retests the event ' + (R.hasHL ? 'low' : 'close') + ' within 20</span><span>' + pctTxt(w.filter(function (x) { return x.out.retest }).length, w.length) + '</span><span></span></div>';
      h += '<div class="r hrow"><span>Closes or trades below it within 20' + (R.hasHL ? '' : ' <span class="k">closes only</span>') + '</span><span>' + pctTxt(w.filter(function (x) { return x.out.newlow }).length, w.length) + '</span><span></span></div>';
    }
    var rc = u.filter(function (x) { return x.out.rec !== undefined && !x.out.recOpen });
    if (rc.length >= 10) { var got = rc.filter(function (x) { return x.out.rec != null }); h += '<div class="r hrow"><span>Back to the prior close within 60</span><span>' + pctTxt(got.length, rc.length) + '<div class="k">median ' + (got.length ? median(got.map(function (x) { return x.out.rec })) + ' sessions' : 'n/a') + '</div></span><span></span></div>' }
    var g0 = u.filter(function (x) { return x.out.fill0 !== undefined }); if (g0.length >= 10) { h += '<div class="r hrow"><span>Gap fills the same day</span><span>' + pctTxt(g0.filter(function (x) { return x.out.fill0 }).length, g0.length) + '</span><span></span></div>'; var g5 = u.filter(function (x) { return x.out.fill5 !== undefined }); h += '<div class="r hrow"><span>Gap fills within 5 sessions</span><span>' + pctTxt(g5.filter(function (x) { return x.out.fill5 }).length, g5.length) + '</span><span></span></div>' }
    var b20 = u.filter(function (x) { return isNum(x.out.r[20]) }).sort(function (a, b) { return a.out.r[20] - b.out.r[20] });
    if (b20.length) h += '<div class="r hrow"><span>Best and worst 20 session result</span><span>' + sg(b20[b20.length - 1].out.r[20]) + ' <span class="k">' + dlab(b20[b20.length - 1].d) + '</span><br>' + sg(b20[0].out.r[20]) + ' <span class="k">' + dlab(b20[0].d) + '</span></span><span></span></div>';
    var cut = Math.floor(n * 0.7), A = u.slice(0, cut), Bo = u.slice(cut), part = function (a) { var r = a.map(function (x) { return x.out.r[1] }).filter(isNum), f = a.map(function (x) { return x.out.r[5] }).filter(isNum), t = a.map(function (x) { return x.out.r[20] }).filter(isNum); return 'n ' + a.length + ', up next ' + (r.length ? (r.filter(function (x) { return x > 0 }).length / r.length * 100).toFixed(0) + '%' : 'n/a') + ', 5 day mean ' + (f.length ? sg(stats(f).mean) : 'n/a') + ', 20 day mean ' + (t.length ? sg(stats(t).mean) : 'n/a') };
    if (A.length && Bo.length) h += '<div class="r"><b>Stability check</b><div class="k">Earlier 70% of events (' + dlab(A[0].d) + ' to ' + dlab(A[A.length - 1].d) + '): ' + part(A) + '<br>Later 30% (' + dlab(Bo[0].d) + ' to ' + dlab(Bo[Bo.length - 1].d) + '): ' + part(Bo) + '<br>Thresholds are set by you, not fitted to results. If the two halves disagree, the pattern is not stable.</div></div>';
  }
  if (st.corr) h += corrBlock(R);
  $('hres').innerHTML = h;
  var L = '';
  R.all.slice().reverse().slice(0, 120).forEach(function (x) { var o = x.out, open = HS.open === x.d; L += '<div class="r hev' + (x.skip ? ' mut' : '') + '" data-d="' + x.d + '"><span>' + dlab(x.d) + (x.skip ? ' <span class="k">overlaps</span>' : '') + '<div class="k">' + esc(x.e.lab || sg(x.e.v)) + '</div></span><span class="num">' + (isNum(o.r[1]) ? sg(o.r[1]) : 'n/a') + '</span><span class="num">' + (isNum(o.r[5]) ? sg(o.r[5]) : 'n/a') + '</span><span class="num">' + (isNum(o.r[20]) ? sg(o.r[20]) : 'n/a') + '</span>' + (open ? '<div class="hdet">' + evDetail(R, x) + '</div>' : '') + '</div>' });
  $('hlist').innerHTML = '<div class="r hev head"><span>Date, newest first</span><b>1 day</b><b>5 day</b><b>20 day</b></div>' + (L || '<div class="r mut">No events with these settings.</div>');
}
function pearson(a, b) { var n = a.length; if (n < 30) return null; var ma = 0, mb = 0; for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i] } ma /= n; mb /= n; var sab = 0, sa = 0, sb = 0; for (i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) * (a[i] - ma); sb += (b[i] - mb) * (b[i] - mb) } return sab / Math.sqrt(sa * sb) }
function corrBlock(R) {
  var N = HIST.N225, X = HIST.NDX, from = (+HS.from || 0) * 10000, to = (+HS.to || 9999) * 10000 + 9999, a = [], same = [], prev = [], ah = [], bh = [];
  for (var i = 1; i < N.d.length; i++) { var d = N.d[i]; if (d < from || d > to) continue; var j = X.ix[d]; if (j == null || j < 2) continue; var r = N.c[i] / N.c[i - 1] - 1; a.push(r); same.push(X.c[j] / X.c[j - 1] - 1); prev.push(X.c[j - 1] / X.c[j - 2] - 1) }
  var n = a.length, cut = Math.floor(n * 0.7), c1 = pearson(a, same), c2 = pearson(a, prev), c3 = pearson(a.slice(0, cut), same.slice(0, cut)), c4 = pearson(a.slice(cut), same.slice(cut));
  var fx = function (v) { return v == null ? 'n/a' : v.toFixed(2) };
  return '<div class="r"><b>Correlation on ' + n + ' shared days</b><div class="k">Nikkei session vs the prior US session: ' + fx(c2) + ' (Asia often follows the US). Nikkei session vs the same date US session: ' + fx(c1) + ', earlier 70% ' + fx(c3) + ', later 30% ' + fx(c4) + '. Close to 0 means little relationship. Even a stable correlation does not prove the next move.</div></div>';
}
function evDetail(R, x) {
  var T = HIST[R.T], ti = x.ti, a = [], e0 = R.st.entry === 'open' ? T.o[ti] : T.c[ti]; for (var j = Math.max(0, ti - 5); j <= Math.min(T.c.length - 1, ti + 20); j++) a.push(T.c[j]);
  var o = x.out; return spark(a, (o.r[20] || 0) >= 0).replace('class="spark"', 'class="spark" style="width:100%;height:44px" preserveAspectRatio="none"') + '<div class="k">Entry ' + f(e0, 2) + ' (' + (R.st.entry === 'open' ? 'open' : 'close') + ' of the event day). 5 sessions before to 20 after. Best within 20 ' + (isNum(o.mfe) ? sg(o.mfe) : 'n/a') + ', worst ' + (isNum(o.mae) ? sg(o.mae) : 'n/a') + (o.rec != null && o.rec !== undefined ? ', back to the prior close in ' + o.rec + (o.rec === 1 ? ' session' : ' sessions') : '') + '.</div>';
}
var HR = null;
function histUI() {
  var st = STUDIES.filter(function (s) { return s.id === HS.id })[0];
  $('hstudies').innerHTML = STUDIES.map(function (s) { return '<button class="chipb' + (s.id === HS.id ? ' on' : '') + '" data-s="' + s.id + '">' + esc(s.name) + '</button>' }).join('');
  var h = '<div class="k" style="margin-bottom:6px">' + esc(st.desc) + '</div>';
  st.p.forEach(function (p) { var v = HS.P[p[0]] != null ? HS.P[p[0]] : p[2]; HS.P[p[0]] = v; h += '<label class="hp"><span>' + esc(p[1]) + '</span><input type="number" inputmode="decimal" data-p="' + p[0] + '" value="' + v + '" step="' + p[4] + '"><span class="k">' + esc(p[3]) + '</span></label>' });
  if (st.pick) h += '<label class="hp"><span>Stock</span><select id="hpick">' + st.pick.map(function (s) { return '<option' + (s === HS.pick ? ' selected' : '') + '>' + s + '</option>' }).join('') + '</select><span></span></label>';
  h += '<label class="hp"><span>From year</span><input type="number" inputmode="numeric" data-o="from" value="' + (HS.from || '') + '" placeholder="all"><span></span></label><label class="hp"><span>To year</span><input type="number" inputmode="numeric" data-o="to" value="' + (HS.to < 9999 ? HS.to : '') + '" placeholder="now"><span></span></label><label class="hp"><span>Minimum sessions between events</span><input type="number" inputmode="numeric" data-o="gap" value="' + HS.gap + '"><span></span></label>';
  $('hparams').innerHTML = h; runHist();
}
function runHist() {
  var st = STUDIES.filter(function (s) { return s.id === HS.id })[0], need = st.tgt === 'pick' ? [HS.pick] : st.data;
  $('hres').innerHTML = '<div class="r mut">Loading history</div>';
  loadHist(need).then(function () { var P = {}; st.p.forEach(function (p) { P[p[0]] = +HS.P[p[0]] }); HR = runStudy(st, P, { from: +HS.from || 0, to: +HS.to || 9999, gap: Math.max(1, +HS.gap || 1), pick: HS.pick }); renderStudy(HR) }).catch(function () { $('hres').innerHTML = '<div class="r mut">History files could not be loaded.</div>' });
}
$('hstudies').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (!b) return; HS.id = b.dataset.s; HS.P = {}; HS.open = null; histUI() });
$('hparams').addEventListener('change', function (e) { var t = e.target; if (t.dataset.p) HS.P[t.dataset.p] = t.value; if (t.dataset.o) HS[t.dataset.o] = t.dataset.o === 'to' ? (+t.value || 9999) : t.value; if (t.id === 'hpick') HS.pick = t.value; HS.open = null; runHist() });
$('hlist').addEventListener('click', function (e) { var r = e.target.closest('[data-d]'); if (!r || !HR) return; HS.open = HS.open === +r.dataset.d ? null : +r.dataset.d; renderStudy(HR) });
function openStudy(id, P) { HS.id = id; HS.P = P || {}; HS.from = 0; HS.to = 9999; HS.gap = 10; HS.open = null; showTab('hist') }

/* Automatic matches: today's conditions checked against the presets, shown on the Brief */
function autoHist() {
  loadHist(['SPX', 'VIX', 'SPY']).then(function () {
    var S = HIST.SPX, V = HIST.VIX, Y = HIST.SPY, cand = [], n = S.c.length - 1;
    var dc = (S.c[n] / S.c[n - 1] - 1) * 100; if (dc <= -1.5) cand.push(['spxdown', { x: Math.floor(-dc * 2) / 2 }, 'S&P closed ' + sg(dc) + ' on ' + dlab(S.d[n])]);
    var k = 0; while (k < 15 && S.c[n - k] < S.c[n - k - 1]) k++; if (k >= 3) cand.push(['streak', { n: k }, k + ' lower S&P closes in a row']);
    var m = Y.c.length - 1, pc = Y.c[m - 1], dd = (Y.l[m] / pc - 1) * 100, rec = (Y.c[m] - Y.l[m]) / (pc - Y.l[m]) * 100; if (dd <= -1.5 && rec >= 60) cand.push(['recover', { x: Math.floor(-dd * 2) / 2, y: Math.floor(rec / 10) * 10 }, 'SPY fell ' + sg(dd) + ' intraday on ' + dlab(Y.d[m]) + ' and recovered ' + rec.toFixed(0) + '%']);
    var v = V.c[V.c.length - 1], vp = V.c[V.c.length - 2], vh = V.h[V.h.length - 1]; if ((vh / vp - 1) * 100 >= 20 && (v / vp - 1) * 100 <= 5) cand.push(['vixrev', { x: Math.floor((vh / vp - 1) * 20) * 5, y: 5 }, 'VIX spiked ' + sg((vh / vp - 1) * 100, 0) + ' intraday and closed ' + sg((v / vp - 1) * 100, 0)]);
    if (v >= 25) cand.push(['vixlevel', { L: Math.floor(v), cross: 0 }, 'VIX closed at ' + v.toFixed(2)]);
    var live = px('xyz:SP500'); if (live && fresh('xyz:SP500') && session(Date.now()).st !== 'open') { var g = (live / B.base.spx - 1) * 100; if (Math.abs(g) >= 1) cand.push(['gap', { x: Math.floor(Math.abs(g) * 4) / 4, dir: g > 0 ? 1 : 0 }, 'S&P perp ' + sg(g) + ' vs the last close, a possible ' + (g > 0 ? 'gap up' : 'gap down')]) }
    if (!cand.length) { $('autoSec').style.display = 'none'; return }
    var h = '';
    var go = function (i) {
      if (i >= Math.min(cand.length, 3)) { $('autohist').innerHTML = h; $('autoSec').style.display = ''; return }
      var c = cand[i], st = STUDIES.filter(function (s) { return s.id === c[0] })[0];
      loadHist(st.data).then(function () {
        var P = {}; st.p.forEach(function (p) { P[p[0]] = c[1][p[0]] != null ? c[1][p[0]] : p[2] }); var R = runStudy(st, P, { gap: 10, pick: 'NVDA' }), u = R.use, r1 = u.map(function (x) { return x.out.r[1] }).filter(isNum), r20 = u.map(function (x) { return x.out.r[20] }).filter(isNum);
        var line = u.length < 10 ? 'Only ' + u.length + ' comparable events, too few to estimate.' : 'Next session up ' + pctTxt(r1.filter(function (x) { return x > 0 }).length, r1.length) + ', 20 session mean ' + mTxt(stats(r20)) + ' vs ' + sg(R.base.r[20].mean) + ' on all days. n ' + u.length + '.';
        h += '<div class="r hauto" data-s="' + c[0] + '" data-p=\'' + esc(JSON.stringify(P)) + '\'><b>' + esc(c[2]) + '.</b> <span class="k">' + esc(st.name) + ', ' + esc(R.src) + '.</span><div>' + line + '</div></div>';
        go(i + 1);
      }).catch(function () { go(i + 1) });
    };
    go(0);
  }).catch(function () { });
}
$('autohist').addEventListener('click', function (e) { var r = e.target.closest('[data-s]'); if (r) { var P = {}; try { P = JSON.parse(r.dataset.p) } catch (x) { } openStudy(r.dataset.s, P) } });

/* VIX context from history */
function vixHist() {
  loadHist(['VIX', 'VIX9D', 'VIX3M', 'VVIX', 'SPX']).then(function () {
    var V = HIST.VIX, n = V.c.length - 1, v = V.c[n], all = V.c.filter(function (x, i) { return V.d[i] >= 19920101 }), y1 = V.c.slice(-252);
    var pr = function (a) { return a.filter(function (x) { return x <= v }).length / a.length * 100 };
    var h = [['VIX close', f(v, 2) + ' on ' + dlab(V.d[n])], ['Day range', f(V.l[n], 2) + ' to ' + f(V.h[n], 2)], ['Close vs day high', sg((v / V.h[n] - 1) * 100)], ['Percentile since 1992', pr(all).toFixed(0) + '%'], ['Percentile, last year', pr(y1).toFixed(0) + '%'], ['20 day average', f(V.c.slice(-20).reduce(function (s, x) { return s + x }, 0) / 20, 2)]];
    var V9 = HIST.VIX9D, V3 = HIST.VIX3M, VV = HIST.VVIX; if (V9) h.push(['VIX9D', f(V9.c[V9.c.length - 1], 2)]); if (V3) h.push(['VIX3M', f(V3.c[V3.c.length - 1], 2)]); if (VV) h.push(['VVIX', f(VV.c[VV.c.length - 1], 2)]);
    var SP = HIST.SPX, sc = SP.c, rv = function (k) { var a = []; for (var i = sc.length - k; i < sc.length; i++) a.push(Math.log(sc[i] / sc[i - 1])); var m = a.reduce(function (s, x) { return s + x }, 0) / a.length; return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m) }, 0) / (a.length - 1) * 252) * 100 };
    var am = 0; for (var i = sc.length - 20; i < sc.length; i++) am += Math.abs(sc[i] / sc[i - 1] - 1) * 100; am /= 20;
    h.push(['S&P realized vol, 10 and 20 days', rv(10).toFixed(1) + '% / ' + rv(20).toFixed(1) + '%'], ['VIX minus 20 day realized', (v - rv(20) >= 0 ? '+' : '−') + Math.abs(v - rv(20)).toFixed(1) + ' pts'], ['Implied daily move from VIX', '±' + (v / Math.sqrt(252)).toFixed(2) + '%'], ['Average daily move, last 20', '±' + am.toFixed(2) + '%']);
    var d5 = v - V.c[n - 5]; h.push(['Change over 5 sessions', (d5 >= 0 ? '+' : '−') + Math.abs(d5).toFixed(2) + ' pts']);
    $('vixhist').innerHTML = h.map(function (x) { return '<div class="r"><span>' + esc(x[0]) + '</span><b class="num">' + esc(x[1]) + '</b></div>' }).join('') + '<div class="r k">Fear reading: ' + (v >= 30 ? 'high' : v >= 20 ? 'elevated' : 'low') + ', ' + (d5 > 2 ? 'rising over the last week' : d5 < -2 ? 'falling over the last week' : 'about flat over the last week') + (v < V.h[n] * 0.9 ? ', and it closed well off its intraday high' : '') + '. Options are ' + (v > rv(20) ? 'pricing more movement than the S&P has recently delivered' : 'pricing less movement than the S&P has recently delivered') + '. Cboe daily closes; not live.</div>';
  }).catch(function () { $('vixhist').innerHTML = '<div class="r mut">VIX history unavailable.</div>' });
}

