/* ---------- Historical probability engine ----------
   Events are defined with data up to and including the event day close (or open for gaps). Outcomes use only later sessions.
   Thresholds are chosen by the user, never fitted. Overlapping events are thinned by a minimum gap in sessions.
   In sample = first 70% of events by date, out of sample = last 30%. Fewer than 10 events: no probabilities. */
var HIST = {}, HPEND = {};
function loadHist(syms) {
  return Promise.all(syms.map(function (s) {
    if (HIST[s]) return HIST[s]; if (HPEND[s]) return HPEND[s];
    return HPEND[s] = fetch('data/hist/' + s + '.json', { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error(s); return r.json() }).then(function (j) {
      var F = j.fields, o = { sym: s, src: j.src, asof: j.asof, breaks: j.breaks || null, d: [], o: null, h: null, l: null, c: [], ix: {} }, hasO = F.length === 5;
      if (hasO) { o.o = []; o.h = []; o.l = [] }
      j.rows.forEach(function (r, i) { o.d.push(r[0]); o.ix[r[0]] = i; if (hasO) { o.o.push(r[1]); o.h.push(r[2]); o.l.push(r[3]); o.c.push(r[4]) } else o.c.push(r[1]) });
      HIST[s] = o; return o;
    });
  }));
}
function dstr(d) { var s = String(d); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) }
function dlab(d) { var s = String(d); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+s.slice(4, 6)] + ' ' + (+s.slice(6)) + ' ' + s.slice(0, 4) }
var STUDIES = CORE.STUDIES;
var HS = { id: 'spxdown', P: {}, from: 0, to: 9999, gap: 5, pick: 'NVDA10', open: null }, HR = null;
var TRIED = (function () { var t = LS('mb_tried_all'); return t && t.k ? t : { k: [] } })(), LEDGER_N = 0;
function noteTried(key) { if (TRIED.k.indexOf(key) < 0) { TRIED.k.push(key); if (TRIED.k.length > 2000) TRIED.k.shift(); LS('mb_tried_all', TRIED) } }
function pTxt(p, mult) { if (p == null) return 'n/a'; var a = Math.min(1, p * mult); return (p < 0.001 ? '<0.001' : p.toFixed(3)) + (a < 0.05 ? ' <b class="up">holds after adjustment</b>' : p < 0.05 ? ' <span class="am">not after adjustment</span>' : '') }
function cell(sm, pct) { if (!sm || sm.n < 10) return '<span class="k">' + (sm ? sm.n : 0) + ' events, too few</span>'; return sg(sm.s.mean) + ' <span class="k">(' + sg(sm.s.lo, 1) + ' to ' + sg(sm.s.hi, 1) + ') n ' + sm.n + '</span>' }
function renderStudy(R) {
  var st = R.st, h = '', mult = Math.max(1, TRIED.k.length + LEDGER_N) * 6, tname = R.T === 'SPX' ? 'S&P 500' : R.T === 'NDX' ? 'Nasdaq 100' : R.T.replace(/10$/, '');
  var raw = R.all.length, cl = R.all.filter(function (x) { return !x.cluster && !x.open }).length;
  h += '<div class="r"><b>' + raw + ' raw events, ' + cl + ' after the ' + HS.gap + ' session cluster rule</b><div class="k">Outcomes on ' + esc(tname) + ', ' + esc(R.src) + ', ' + dlab(R.start) + ' to ' + dlab(R.asof) + '. Each horizon counts only events whose holding windows do not overlap, so n shrinks as the horizon grows. Entry: ' + (st.entry === 'open' ? 'event day open' : st.entry === 'next' ? 'next session close' : 'event day close') + '; the all days column uses the same entry and exit rule over the same dates.</div></div>';
  h += '<div class="r hrow head"><span>Horizon</span><b>Events: mean (95% range)</b><b>All days</b></div>';
  [0].concat(CORE.HZ).forEach(function (k) {
    if (!R.sets[k]) return; var sm = CORE.summarize(R, k), b = R.base[k];
    h += '<div class="r hrow"><span>' + (k === 0 ? 'Same day, open to close' : k + ' session' + (k > 1 ? 's' : '')) + (sm.n >= 10 ? '<div class="k">up ' + (sm.up / sm.n * 100).toFixed(0) + '% vs ' + (b.up * 100).toFixed(0) + '%. Mean vs all days p ' + pTxt(sm.pMean, mult) + '</div>' : '') + '</span><span>' + cell(sm) + '</span><span>' + (b && b.n ? sg(b.mean) + '<div class="k">' + (b.up * 100).toFixed(0) + '% up</div>' : 'n/a') + '</span></div>';
  });
  var tr1 = CORE.summarize(R, 5, 'train'), te1 = CORE.summarize(R, 5, 'test');
  h += '<div class="r"><b>Untouched test period</b><div class="k">Dates from ' + dlab(R.cut) + ' were held out. 5 session mean: research period ' + (tr1.n ? sg(tr1.s.mean) + ' (n ' + tr1.n + ')' : 'n/a') + ', test period ' + (te1.n ? sg(te1.s.mean) + ' (n ' + te1.n + ')' : 'n/a') + ' vs all days ' + sg(R.base[5].mean) + '. ' + (te1.n < 10 ? 'Too few test events to judge.' : (tr1.excess > 0) === (te1.excess > 0) ? 'Same direction in both periods.' : 'The test period went the other way, so the pattern did not hold.') + '</div></div>';
  [1, 5].forEach(function (k) { var w = CORE.walkForward(R, k, 10); h += '<div class="r"><b>Walk forward, ' + k + ' session' + (k > 1 ? 's' : '') + '</b><div class="k">' + (w.n >= 10 ? 'Using only earlier events to pick a side each time: right ' + w.hits + ' of ' + w.n + ' (' + (w.hits / w.n * 100).toFixed(0) + '%, range ' + (w.ci[0] * 100).toFixed(0) + ' to ' + (w.ci[1] * 100).toFixed(0) + '%), average result vs all days ' + sg(w.avg) + '. Around 50% means no usable edge.' : 'Not enough events to walk forward.') + '</div></div>' });
  var p20 = (R.sets[20] || []).filter(function (x) { return CORE.isNum(x.mfe) });
  if (p20.length >= 10) {
    h += '<div class="r hrow"><span>Within 20 sessions <span class="k">non overlapping, n ' + p20.length + '</span></span><span>best ' + sg(CORE.median(p20.map(function (x) { return x.mfe }))) + ', worst ' + sg(CORE.median(p20.map(function (x) { return x.mae }))) + '<div class="k">medians</div></span><span></span></div>';
    var rt = p20.filter(function (x) { return x.retest }).length, nl = p20.filter(function (x) { return x.newlow }).length, w1 = CORE.wilson(rt, p20.length), w2 = CORE.wilson(nl, p20.length);
    h += '<div class="r hrow"><span>Back to the event ' + (R.hasHL ? 'low' : 'close') + ', and below it</span><span>' + (rt / p20.length * 100).toFixed(0) + '% <span class="k">(' + (w1[0] * 100).toFixed(0) + ' to ' + (w1[1] * 100).toFixed(0) + ')</span>, ' + (nl / p20.length * 100).toFixed(0) + '% <span class="k">(' + (w2[0] * 100).toFixed(0) + ' to ' + (w2[1] * 100).toFixed(0) + ')</span></span><span></span></div>';
    var rc = p20.filter(function (x) { return x.rec !== undefined && !x.recOpen }), got = rc.filter(function (x) { return x.rec != null }); if (rc.length >= 10) h += '<div class="r hrow"><span>Back to the prior close within 60</span><span>' + (got.length / rc.length * 100).toFixed(0) + '%, median ' + (got.length ? CORE.median(got.map(function (x) { return x.rec })) : 'n/a') + ' sessions</span><span></span></div>';
    var g0 = p20.filter(function (x) { return x.fill0 !== undefined }); if (g0.length >= 10) h += '<div class="r hrow"><span>Gap filled same day, within 5</span><span>' + (g0.filter(function (x) { return x.fill0 }).length / g0.length * 100).toFixed(0) + '%, ' + (g0.filter(function (x) { return x.fill5 }).length / g0.length * 100).toFixed(0) + '%</span><span></span></div>';
  }
  h += '<div class="r k">Multiple testing: ' + LEDGER_N + ' configurations in the permanent research ledger plus ' + TRIED.k.length + ' settings tried on this device, times 6 horizons. "Holds after adjustment" means p stays under 0.05 after multiplying by that count (Bonferroni). The count never resets.</div>';
  if (st.corr) h += corrBlock(R);
  $('hres').innerHTML = h;
  var L = '';
  R.all.slice().reverse().slice(0, 120).forEach(function (x) { var open = HS.open === x.d; L += '<div class="r hev' + (x.cluster ? ' mut' : '') + '" data-d="' + x.d + '"><span>' + dlab(x.d) + (x.cluster ? ' <span class="k">in a cluster</span>' : '') + '<div class="k">' + esc(x.e.lab || sg(x.e.v)) + '</div></span><span class="num">' + (CORE.isNum(x.r[1]) ? sg(x.r[1]) : 'n/a') + '</span><span class="num">' + (CORE.isNum(x.r[5]) ? sg(x.r[5]) : 'n/a') + '</span><span class="num">' + (CORE.isNum(x.r[20]) ? sg(x.r[20]) : 'n/a') + '</span>' + (open ? '<div class="hdet">' + evDetail(R, x) + '</div>' : '') + '</div>' });
  $('hlist').innerHTML = '<div class="r hev head"><span>Date, newest first</span><b>1 day</b><b>5 day</b><b>20 day</b></div>' + (L || '<div class="r mut">No events with these settings.</div>');
}
function corrBlock(R) {
  var N = HIST.N225, X = HIST.NDX, a = [], nxt = [];
  for (var i = 1; i < N.d.length; i++) { var j = X.ix[N.d[i]]; if (j == null || j + 1 >= X.c.length) continue; a.push(N.c[i] / N.c[i - 1] - 1); nxt.push(X.c[j + 1] / X.c[j] - 1) }
  var c = CORE.pearson(a, nxt);
  return '<div class="r"><b>Correlation, ' + a.length + ' days</b><div class="k">Nikkei session vs the Nasdaq 100 from that US close to the next: ' + (c == null ? 'n/a' : c.toFixed(3)) + '. Near 0 means the completed Tokyo session tells little about the Nasdaq after the US close. Hourly perp research with exact timing is in "Asia to US chips" below.</div></div>';
}
function evDetail(R, x) {
  var T = HIST[R.T], a = []; for (var j = Math.max(0, x.ti - 5); j <= Math.min(T.c.length - 1, x.ei + 20); j++) a.push(T.c[j]);
  return spark(a, (x.r[20] || 0) >= 0).replace('class="spark"', 'class="spark" style="width:100%;height:44px" preserveAspectRatio="none"') + '<div class="k">5 sessions before to 20 after the entry. Best within 20 ' + (CORE.isNum(x.mfe) ? sg(x.mfe) : 'n/a') + ', worst ' + (CORE.isNum(x.mae) ? sg(x.mae) : 'n/a') + (x.rec != null && x.rec !== undefined ? ', back to the prior close in ' + x.rec + (x.rec === 1 ? ' session' : ' sessions') : '') + '.</div>';
}
function histUI() {
  var st = STUDIES.filter(function (s) { return s.id === HS.id })[0];
  $('hstudies').innerHTML = STUDIES.map(function (s) { return '<button class="chipb' + (s.id === HS.id ? ' on' : '') + '" data-s="' + s.id + '">' + esc(s.name) + '</button>' }).join('');
  var h = '<div class="k" style="margin-bottom:6px">' + esc(st.desc) + '</div>';
  st.p.forEach(function (p) { var v = HS.P[p[0]] != null ? HS.P[p[0]] : p[2]; HS.P[p[0]] = v; h += '<label class="hp"><span>' + esc(p[1]) + '</span><input type="number" inputmode="decimal" data-p="' + p[0] + '" value="' + v + '" step="' + p[4] + '"><span class="k">' + esc(p[3]) + '</span></label>' });
  if (st.pick) { if (st.pick.indexOf(HS.pick) < 0) HS.pick = st.pick[0]; h += '<label class="hp"><span>Stock or ETF</span><select id="hpick">' + st.pick.map(function (s) { return '<option value="' + s + '"' + (s === HS.pick ? ' selected' : '') + '>' + s.replace(/10$/, '') + '</option>' }).join('') + '</select><span></span></label>' }
  h += '<label class="hp"><span>From year</span><input type="number" inputmode="numeric" data-o="from" value="' + (HS.from || '') + '" placeholder="all"><span></span></label><label class="hp"><span>To year</span><input type="number" inputmode="numeric" data-o="to" value="' + (HS.to < 9999 ? HS.to : '') + '" placeholder="now"><span></span></label><label class="hp"><span>Cluster rule: sessions between signals</span><input type="number" inputmode="numeric" data-o="gap" value="' + HS.gap + '"><span></span></label>';
  $('hparams').innerHTML = h; runHist(); renderResearch();
}
function runHist() {
  var st = STUDIES.filter(function (s) { return s.id === HS.id })[0], need = st.tgt === 'pick' ? [HS.pick] : st.data;
  $('hres').innerHTML = '<div class="r mut">Loading history</div>';
  loadHist(need).then(function () { var P = {}; st.p.forEach(function (p) { P[p[0]] = +HS.P[p[0]] }); noteTried(st.id + JSON.stringify(P) + HS.pick + HS.from + HS.to + HS.gap); HR = CORE.runStudy(st, P, { from: +HS.from || 0, to: +HS.to || 9999, gap: Math.max(1, +HS.gap || 1), pick: HS.pick }, HIST); renderStudy(HR) }).catch(function (e) { $('hres').innerHTML = '<div class="r mut">History files could not be loaded.</div>' });
}
$('hstudies').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (!b) return; HS.id = b.dataset.s; HS.P = {}; HS.open = null; histUI() });
$('hparams').addEventListener('change', function (e) { var t = e.target; if (t.dataset.p) HS.P[t.dataset.p] = t.value; if (t.dataset.o) HS[t.dataset.o] = t.dataset.o === 'to' ? (+t.value || 9999) : t.value; if (t.id === 'hpick') HS.pick = t.value; HS.open = null; runHist() });
$('hlist').addEventListener('click', function (e) { var r = e.target.closest('[data-d]'); if (!r || !HR) return; HS.open = HS.open === +r.dataset.d ? null : +r.dataset.d; renderStudy(HR) });
function openStudy(id, P) { HS.id = id; HS.P = P || {}; HS.from = 0; HS.to = 9999; HS.gap = 5; HS.open = null; showTab('hist') }

/* Research computed on the close by tools/research.js */
var RES = {};
function loadRes(n) { return RES[n] ? Promise.resolve(RES[n]) : fetch('data/research/' + n + '.json', { cache: 'default' }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (j) { RES[n] = j; return j }) }
function renderResearch() {
  loadRes('semis').then(function (m) {
    var h = '<div class="r k">' + esc(m.note) + ' ' + m.days + ' days from ' + dlab(m.from) + ' to ' + dlab(m.to) + ', ' + m.dropped + ' Asian holiday days dropped. Computed ' + esc(m.asof.slice(0, 10)) + '.</div><div class="r hrow head"><span>Asia, then US</span><b>Coefficient, adjusted p</b><b>Out of sample</b></div>';
    m.tests.forEach(function (t) { var gain = t.oosGain; h += '<div class="r hrow"><span>' + esc(t.asia) + ' then ' + esc(t.target) + ' <span class="k">n ' + t.n + '</span></span><span>' + t.beta.toFixed(2) + ', ' + (t.pAdj < 0.05 ? '<b>' + t.pAdj.toFixed(2) + '</b>' : t.pAdj.toFixed(2)) + '</span><span class="' + (gain > 0 ? 'up' : 'dn') + '">' + (gain == null ? 'n/a' : (gain > 0 ? '+' : '−') + Math.abs(gain * 100).toFixed(1) + '%') + '</span></div>' });
    var any = m.tests.filter(function (t) { return t.oosGain > 0 && t.pAdj < 0.05 });
    h += '<div class="r"><b>' + (any.length ? any.length + ' pair' + (any.length > 1 ? 's' : '') + ' added value both in and out of sample.' : 'No Asian chip name improved the US forecast out of sample.') + '</b><div class="k">Out of sample above 0 means lower forecast error than using the prior US session and the overnight S&P perp alone.' + (m.tests.some(function (t) { return t.pAdj < 0.05 && !(t.oosGain > 0) }) ? ' A pair that looks significant in the full sample but loses out of sample is likely fitting noise.' : '') + '</div></div>';
    $('rsemis').innerHTML = h;
  }).catch(function () { $('rsemis').innerHTML = '<div class="r mut">Not computed yet.</div>' });
  loadRes('seasonality').then(function (s) {
    var sel = HS.seas || 0, c = s.conds[sel], h = '<div class="chips" style="margin:8px 0 4px">' + s.conds.map(function (x, i) { return '<button class="chipb' + (i === sel ? ' on' : '') + '" data-seas="' + i + '">' + esc(x.name) + ' (' + x.n + ')</button>' }).join('') + '</div>';
    var mx = Math.max.apply(0, c.high.concat(c.low).filter(CORE.isNum)) || 1;
    h += '<div class="r hrow head"><span>Bar, ET</span><b>Day high / low set here</b><b>Avg bar return</b></div>' + s.slots.map(function (sl, i) { var b = c.bar[i]; return '<div class="r hrow"><span>' + sl.replace(/(\d+)(\d\d)$/, '$1:$2') + '</span><span><i class="sbar" style="width:' + (c.high[i] / mx * 45) + '%;background:var(--gfill)"></i><i class="sbar" style="width:' + (c.low[i] / mx * 45) + '%;background:var(--rfill)"></i> <span class="k">' + c.high[i].toFixed(0) + ' / ' + c.low[i].toFixed(0) + '%</span></span><span>' + (CORE.isNum(b.mean) ? sg(b.mean, 3) : 'n/a') + '</span></div>' }).join('');
    h += '<div class="r k">' + c.n + ' days. Low set in the first hour ' + (c.lowFirstHour || 0).toFixed(0) + '% of days, high in the last hour ' + (c.highLastHour || 0).toFixed(0) + '%. ' + esc(s.note) + ' ' + dlab(s.from) + ' to ' + dlab(s.to) + '.</div>';
    $('rseas').innerHTML = h;
  }).catch(function () { $('rseas').innerHTML = '<div class="r mut">Not computed yet.</div>' });
  renderFingerprint(); renderRegistry(); renderRecovery(); renderOptions(); renderResearch2();
}
$('rseas').addEventListener('click', function (e) { var b = e.target.closest('[data-seas]'); if (b) { HS.seas = +b.dataset.seas; renderResearch() } });
function renderFingerprint() {
  Promise.all([loadHist(['SPX', 'VIX', 'NDX', 'US10Y', 'RSP10', 'SPY10', 'SMH10', 'QQQ10']), loadRes('fingerprint')]).then(function (x) {
    var V = x[1], F = CORE.features(HIST), S = HIST.SPX, t = F.length - 1, keys = CORE.FEAT.map(function (f) { return f[0] }), nb = CORE.neighbors(F, t, keys, 15, 20, 60), cur = F[t], h = '';
    h += '<div class="r"><b>' + (V.promoted ? 'Promoted: the tuned model beat its baselines on untouched data.' : 'Not promoted: no version beat simply calling the market up on untouched data.') + '</b><div class="k">' + esc(V.note) + ' ' + V.gridSize + ' settings were tried, all kept in the research ledger.</div></div>';
    h += '<div class="r hrow head"><span>Model, same ' + V.testDates + ' test dates</span><b>Right, 95% range</b><b>Long or flat</b></div>';
    V.test.slice(0, 6).forEach(function (m) { h += '<div class="r hrow"><span>' + esc(m.name) + '<div class="k">error ' + m.mae.toFixed(2) + ' vs ' + m.maeBase.toFixed(2) + ' baseline</div></span><span>' + (m.rate * 100).toFixed(0) + '% <span class="k">(' + (m.ci[0] * 100).toFixed(0) + ' to ' + (m.ci[1] * 100).toFixed(0) + ')</span></span><span>' + sg(m.longFlat) + '</span></div>' });
    var u = V.test[0]; h += '<div class="r hrow"><span>Baselines</span><span>always up ' + (u.upRate * 100).toFixed(0) + '%</span><span>' + sg(u.buyHold) + ' hold</span></div>';
    h += '<div class="r k">Today on ' + dlab(cur.d) + ': ' + CORE.FEAT.filter(function (f) { return CORE.isNum(cur[f[0]]) }).map(function (f) { return esc(f[1]) + ' ' + cur[f[0]].toFixed(1) + f[2] }).join(', ') + '. Closest past dates are below as context only.</div>';
    h += '<div class="r hev head"><span>Closest matches</span><b>5 day</b><b>20 day</b><b>60 day</b></div>';
    nb.forEach(function (m) { var f2 = F[m[1]], why = CORE.FEAT.filter(function (q) { return CORE.isNum(f2[q[0]]) && CORE.isNum(cur[q[0]]) }).sort(function (a, b) { return Math.abs(f2['z' + a[0]] - cur['z' + a[0]]) - Math.abs(f2['z' + b[0]] - cur['z' + b[0]]) }).slice(0, 3).map(function (q) { return esc(q[1]) + ' ' + f2[q[0]].toFixed(1) + q[2] }).join(', ');
      var r = function (k) { var v = CORE.fwdRet(S, f2.i, k); return CORE.isNum(v) ? sg(v) : 'n/a' }; h += '<div class="r hev"><span>' + dlab(f2.d) + '<div class="k">closest on ' + why + '</div></span><span class="num">' + r(5) + '</span><span class="num">' + r(20) + '</span><span class="num">' + r(60) + '</span></div>' });
    $('rfp').innerHTML = h;
  }).catch(function () { $('rfp').innerHTML = '<div class="r mut">Not available.</div>' });
}

/* Automatic matches: today's conditions checked against the presets, shown on the Brief */
function autoHist() {
  Promise.all([loadHist(['SPX', 'VIX', 'SPY']), loadRes('registry').catch(function () { return null })]).then(function (z) {
    var VAL = {}; ((z[1] && z[1].signals) || []).forEach(function (s) { if (s.id && s.cls === 'Validated') VAL[s.id] = 1 });
    var S = HIST.SPX, V = HIST.VIX, Y = HIST.SPY, cand = [], n = S.c.length - 1;
    var dc = (S.c[n] / S.c[n - 1] - 1) * 100; if (dc <= -1.5) cand.push(['spxdown', { x: Math.floor(-dc * 2) / 2 }, 'S&P closed ' + sg(dc) + ' on ' + dlab(S.d[n])]);
    var k = 0; while (k < 15 && S.c[n - k] < S.c[n - k - 1]) k++; if (k >= 3) cand.push(['streak', { n: k }, k + ' lower S&P closes in a row']);
    var m = Y.c.length - 1, pc = Y.c[m - 1], dd = (Y.l[m] / pc - 1) * 100, rec = (Y.c[m] - Y.l[m]) / (pc - Y.l[m]) * 100; if (dd <= -1.5 && rec >= 60) cand.push(['recover', { x: Math.floor(-dd * 2) / 2, y: Math.floor(rec / 10) * 10 }, 'SPY fell ' + sg(dd) + ' intraday on ' + dlab(Y.d[m]) + ' and recovered ' + rec.toFixed(0) + '%']);
    var v = V.c[V.c.length - 1], vp = V.c[V.c.length - 2], vh = V.h[V.h.length - 1]; if ((vh / vp - 1) * 100 >= 20 && (v / vp - 1) * 100 <= 5) cand.push(['vixrev', { x: Math.floor((vh / vp - 1) * 20) * 5, y: 5 }, 'VIX spiked ' + sg((vh / vp - 1) * 100, 0) + ' intraday and closed ' + sg((v / vp - 1) * 100, 0)]);
    if (v >= 25) cand.push(['vixlevel', { L: Math.floor(v), cross: 0 }, 'VIX closed at ' + v.toFixed(2)]);
    var live = px('xyz:SP500'); if (live && fresh('xyz:SP500') && session(Date.now()).st !== 'open') { var g = (live / B.base.spx - 1) * 100; if (Math.abs(g) >= 1) cand.push(['gap', { x: Math.floor(Math.abs(g) * 4) / 4, dir: g > 0 ? 1 : 0 }, 'S&P perp ' + sg(g) + ' vs the last close, a possible ' + (g > 0 ? 'gap up' : 'gap down')]) }
    cand = cand.filter(function (c) { return VAL[c[0]] }); /* the Brief shows only validated studies; the rest stay in History */
    if (!cand.length) { $('autoSec').style.display = 'none'; return }
    var h = '';
    var go = function (i) {
      if (i >= Math.min(cand.length, 3)) { $('autohist').innerHTML = h; $('autoSec').style.display = ''; return }
      var c = cand[i], st = STUDIES.filter(function (s) { return s.id === c[0] })[0];
      loadHist(st.data).then(function () {
        var P = {}; st.p.forEach(function (p) { P[p[0]] = c[1][p[0]] != null ? c[1][p[0]] : p[2] }); var R = CORE.runStudy(st, P, { gap: 5 }, HIST), s1 = CORE.summarize(R, 1), s20 = CORE.summarize(R, 20), w = CORE.walkForward(R, 5, 10);
        var line = s1.n < 10 ? 'Only ' + s1.n + ' comparable events, too few to estimate.' : 'Next session up ' + (s1.up / s1.n * 100).toFixed(0) + '% vs ' + (R.base[1].up * 100).toFixed(0) + '% on all days (n ' + s1.n + '). 20 sessions: ' + (s20.n >= 10 ? sg(s20.s.mean) + ' vs ' + sg(R.base[20].mean) + ' (n ' + s20.n + ')' : 'too few') + '. ' + (w.n >= 10 ? 'Walk forward ' + (w.hits / w.n * 100).toFixed(0) + '% right.' : '');
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


