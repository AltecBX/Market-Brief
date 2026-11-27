/* ---------- Research engines v2 on the page: intraday high and low, weekly, covered calls, recovery, registry, options, decision ---------- */
var R2 = { sym: 'SPY', bar: null, out: 'highDone', wsym: 'NVDA', csym: 'NVDA' }, RAW = {};
var I2SYMS = ['SPY', 'QQQ', 'SMH', 'NVDA', 'MU', 'AMD', 'SNDK'], I2REF = { SPY: 'SMH', QQQ: 'SMH', SMH: 'SPY', NVDA: 'SMH', MU: 'SMH', AMD: 'SMH', SNDK: 'SMH' }, I2PERP = { SPY: 'xyz:SP500', QQQ: 'xyz:XYZ100', SMH: 'xyz:SMH', NVDA: 'xyz:NVDA', MU: 'xyz:MU', AMD: 'xyz:AMD', SNDK: 'xyz:SNDK' };
var I2SLOTS = [[5, 'early', 1, '9:35'], [10, 'early', 2, '9:40'], [15, 'early', 3, '9:45'], [30, 'early', 6, '10:00'], [60, 'late', 2, '10:30'], [90, 'late', 3, '11:00'], [120, 'late', 4, '11:30'], [150, 'late', 5, '12:00'], [180, 'late', 6, '12:30'], [210, 'late', 7, '1:00'], [240, 'late', 8, '1:30'], [270, 'late', 9, '2:00'], [300, 'late', 10, '2:30'], [330, 'late', 11, '3:00'], [360, 'late', 12, '3:30']];
function rawJ(p) { return RAW[p] ? Promise.resolve(RAW[p]) : fetch(p, { cache: 'default' }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (j) { RAW[p] = j; return j }) }
function hrows(s) { return rawJ('data/hist/' + s + '.json').then(function (j) { return j.rows }) }
function ymdOf(s) { return +String(s).replace(/-/g, '') }
function etp(ms) { return CORE.etParts(ms) }
function nm(v) { return (v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(2) }
function pc(v) { return CORE.isNum(v) ? Math.round(v * 100) + '%' : 'n/a' }
function chips(list, cur, attr) { return '<div class="chips" style="margin:6px 0">' + list.map(function (x) { var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return '<button class="chipb' + (String(v) === String(cur) ? ' on' : '') + '" data-' + attr + '="' + esc(v) + '">' + esc(l) + '</button>' }).join('') + '</div>' }
function groupBars(rows) { var by = {}; rows.forEach(function (r) { (by[r[0]] = by[r[0]] || []).push([r[1], r[2], r[3], r[4], r[5], r[6]]) }); Object.keys(by).forEach(function (d) { by[d].sort(function (a, b) { return a[0] - b[0] }) }); return by }
var to30 = CORE.to30;

/* ---- live bars: cash 5 minute bars with the data key, otherwise perp candles ---- */
function cashBars(sym) {
  var k = getKey(); if (!k) return Promise.reject('nokey');
  return fetch('https://api.unusualwhales.com/api/stock/' + sym + '/ohlc/5m?timeframe=1D&limit=200', { headers: { Authorization: 'Bearer ' + k, Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (j) {
    return CORE.uwBars(j, Date.now());
  });
}
function perpBars(sym) {
  var o = lastOpenMs(Date.now()); if (!o) return Promise.resolve([]);
  return post({ type: 'candleSnapshot', req: { coin: I2PERP[sym], interval: '5m', startTime: o, endTime: Date.now() } }).then(function (k) { return CORE.completed(k || [], Date.now(), 3e5).map(function (c) { var q = etp(+c.t); return [q.hm, +c.o, +c.h, +c.l, +c.c, +c.v] }).filter(function (b) { return b[0] >= 930 && b[0] < 1600 }) });
}
/* perp price at the last 4pm cash close: the close of the 3:55pm 5 minute candle, the same reference the transfer test used */
function perpPrevClose(sym) {
  var lc = lastCloseMs(Date.now() - 6 * 36e5); return post({ type: 'candleSnapshot', req: { coin: I2PERP[sym], interval: '5m', startTime: lc - 6e5, endTime: lc + 6e4 } }).then(function (k) { var c = (k || []).filter(function (z) { return +z.t === lc - 3e5 })[0]; return c ? +c.c : null });
}
function prevTradingDay(d) { var x = CORE.ymdAdd(d, -1); while (!CORE.isTradingDay(x)) x = CORE.ymdAdd(x, -1); return x }
function liveSession(sym) {
  var st = session(Date.now()).st; if (st !== 'open') return Promise.resolve(null);
  var src = getKey() ? 'cash' : 'perp', get = src === 'cash' ? cashBars : perpBars;
  return Promise.all([get(sym), get(I2REF[sym]), src === 'perp' ? perpPrevClose(sym) : null]).then(function (x) { return x[0].length ? { src: src, b: x[0], ref: x[1], perpPrev: x[2] } : null }).catch(function () { return src === 'cash' ? Promise.all([perpBars(sym), perpBars(I2REF[sym]), perpPrevClose(sym)]).then(function (x) { return x[0].length ? { src: 'perp', b: x[0], ref: x[1], perpPrev: x[2], keyFailed: true } : null }) : null });
}

/* ---- the intraday state and model outputs for one instrument at one checkpoint ---- */
function intraState(sym, slot, live) {
  var res = slot[1] === 'early' ? 5 : 30, ref = I2REF[sym];
  return Promise.all([rawJ('data/intraday/' + sym + res + '.json'), rawJ('data/intraday/' + ref + res + '.json'), hrows(sym), hrows('VIX'), hrows('RSP'), hrows('SPY'), rawJ('data/hist/earnings.json'), rawJ('data/research/models.json'), loadRes('intraday2')]).then(function (x) {
    var by = groupBars(x[0].rows), rb = groupBars(x[1].rows), days = Object.keys(by).map(Number).sort(), full = res === 5 ? 78 : 13, d, bars, refb, src;
    if (live) { d = etp(Date.now()).d; bars = res === 5 ? live.b : to30(live.b); refb = live.ref && live.ref.length ? (res === 5 ? live.ref : to30(live.ref)) : null; src = live.src }
    else { var ok = days.filter(function (q) { return by[q].length === full }); d = ok[ok.length - 1]; bars = by[d]; refb = rb[d] || null; src = 'replay' }
    var k = slot[2]; if (!bars || bars.length < k) return { wait: true, src: src, d: d, have: bars ? bars.length : 0, need: k };
    var earn = (x[6].dates[sym] || []).map(function (e) { return [ymdOf(e[0]), e[1]] }), lastHist = x[2][x[2].length - 1][0];
    if (live && lastHist < prevTradingDay(d)) return { stale: true, lastHist: lastHist, src: src, d: d };
    var prior = days.filter(function (q) { return q < d }).map(function (q) { return by[q] });
    var S = CORE.iSession({ bars: bars, ref: refb, res: res, d: d, dly: x[2], vix: x[3], rsp: x[4], spy: x[5], earn: earn, prior: prior, src: src === 'perp' ? 'perp' : 'cash', perpPrev: live && live.perpPrev }); if (!S) return { noref: true, src: src, d: d };
    var cx = S.ctx;
    var xv = CORE.ifeat(S, k), M = x[7].inst[sym][slot[1]], V = x[8].inst[sym], W = V.windows[slot[1]], o = {};
    CORE.OUT2.forEach(function (n) { var m = M.outcomes[n], tr = V.transfer && V.transfer[slot[1]] && V.transfer[slot[1]][n] && V.transfer[slot[1]][n][m.family], blocked = src === 'perp' && !(tr && tr.ok); o[n] = { p: blocked ? null : CORE.mlPredict(m.model, xv), fam: m.family, promoted: m.promoted, blocked: blocked, tr: tr } });
    return { sym: sym, d: d, k: k, slot: slot, src: src, x: xv, out: o, q: CORE.qLookup(M.q, xv), px: bars[k - 1][4], open: bars[0][1], prev: cx.prev, W: W, transfer: V.transfer, earn: cx.earn, ranges: W.ranges, keyFailed: live && live.keyFailed };
  });
}
function curSlot(live) {
  if (!live) return I2SLOTS[R2.bar == null ? 3 : R2.bar];
  var n = live.b.length, mins = n * 5, best = null; I2SLOTS.forEach(function (s) { if (s[0] <= mins && (s[1] === 'early' ? n >= s[2] : n >= s[2] * 6)) best = s }); return best;
}
function renderI2() {
  var el = $('rintra'); if (!el) return;
  liveSession(R2.sym).catch(function () { return null }).then(function (live) {
    var slot = curSlot(live); if (!slot) { el.innerHTML = '<div class="r k">Waiting for the first completed 5 minute bar.</div>'; return }
    return intraState(R2.sym, slot, live).then(function (S) {
      var h = chips(I2SYMS, R2.sym, 'i2sym');
      if (!live) h += chips(I2SLOTS.map(function (s, i) { return [i, s[3]] }), R2.bar == null ? 3 : R2.bar, 'i2bar');
      if (!S || S.noref) { el.innerHTML = h + '<div class="r mut">' + (S && S.src === 'perp' ? 'The perp reference price at the last close is unavailable, so no live estimate.' : 'Not enough history for this session.') + '</div>'; return }
      if (S.stale) { el.innerHTML = h + '<div class="r k">Live estimates paused: daily history ends ' + dlab(S.lastHist) + ', so the previous close and volatility the models need are out of date. The close run refreshes it.</div>'; return }
      if (S.wait) { el.innerHTML = h + '<div class="r k">Waiting for more completed bars.</div>'; return }
      var srcTxt = S.src === 'cash' ? 'Live cash 5 minute bars (data key on this device).' : S.src === 'perp' ? 'Live perp bars as a stand in for ' + R2.sym + (S.keyFailed ? ' (the saved data key was refused, check it in Customize)' : ' (save a data key for cash bars)') + '. Each estimate below is shown only where the perp passed its own transfer test for this time window, outcome and model.' : 'Market closed: replaying ' + dlab(S.d) + '.';
      h += '<div class="r k">' + srcTxt + ' At ' + S.slot[3] + ': gap ' + sg((S.open / S.prev - 1) * 100) + ', from the open ' + sg((S.px / S.open - 1) * 100) + ', at ' + Math.round(S.x[CORE.IFEAT.indexOf('pos')] * 100) + '% of the range so far' + (S.earn ? ', earnings reaction day' : '') + '. Only bars up to that time are used.</div>';
      h += '<div class="r hrow head"><span>Outcome</span><b>Chance</b><b>Source</b></div>';
      CORE.OUT2.forEach(function (n) { var q = S.out[n], E = S.W.outcomes[n]; h += '<div class="r hrow"><span>' + esc(E.name) + '</span><span class="num">' + (q.blocked ? 'n/a' : pc(q.p)) + '</span><span class="k">' + (q.blocked ? 'perp not validated here' + (q.tr && q.tr.why ? ': ' + esc(q.tr.why) : '') : q.promoted ? esc(E.models[q.fam].name) + ', validated' : 'historical frequency; no model beat it') + '</span></div>' });
      if (S.q && S.src !== 'perp') h += '<div class="r hrow"><span>Further room, rest of the session <span class="k">10th, 50th, 90th percentile, ' + S.q.n + ' past cases</span></span><span class="num">up ' + S.q.up.map(nm).join(' / ') + '%</span><span class="num">down ' + S.q.dn.map(nm).join(' / ') + '%</span></div>';
      if (S.q && S.ranges && S.ranges.n && S.src !== 'perp') h += '<div class="r k">The 10th to 90th ranges held ' + pc(S.ranges.coverUp) + ' (up) and ' + pc(S.ranges.coverDn) + ' (down) of the time on untouched sessions; 80% is the target.</div>';
      h += i2table(S.W);
      el.innerHTML = h;
    });
  }).catch(function () { el.innerHTML = '<div class="r mut">Intraday research unavailable.</div>' });
}
function i2table(W) {
  var o = R2.out, E = W.outcomes[o], h = chips(CORE.OUT2.map(function (n) { return [n, W.outcomes[n].name] }), o, 'i2out');
  h += '<div class="r k">Model comparison on ' + E.models.pos.sessions + ' untouched sessions (' + dlab(W.test[0]) + ' to ' + dlab(W.test[1]) + '), checkpoints ' + W.checkpoints.map(function (m) { return I2SLOTS.filter(function (s) { return s[0] === m })[0] ? I2SLOTS.filter(function (s) { return s[0] === m })[0][3] : m + 'm' }).join(', ') + '. Skill is versus the time of day frequency.</div>';
  h += '<div class="r hrow head"><span>Model</span><b>Skill, calibration</b><b>vs best benchmark, value</b></div>';
  Object.keys(E.models).forEach(function (f) { var m = E.models[f], tag = f === 'tod' || f === 'pos' ? 'benchmark' : m.promoted ? 'promoted' : m.stat ? 'accurate, not useful' : 'not promoted';
    h += '<div class="r hrow"><span>' + esc(m.name) + '<div class="k">' + tag + '</div></span><span class="num">' + m.bss.toFixed(2) + ' <span class="k">err ' + m.ece.toFixed(2) + '</span></span><span class="num">' + (f === 'tod' || f === 'pos' ? '' : (m.vsBenchCI[0] == null ? 'n/a' : m.vsBenchCI[0].toFixed(3) + ' to ' + m.vsBenchCI[1].toFixed(3))) + '<div class="k">' + (CORE.isNum(m.econ) ? 'value ' + m.econ.toFixed(2) + (m.econOk ? ', range above 0' : '') : m.flagged + ' signals') + '</div></span></div>' });
  h += '<div class="r k">Value: ' + (o === 'highDone' ? 'how much less upside was left when the model said the high was in (60% or more), in % of price, vs the average at that time' : o === 'lowDone' ? 'how much shallower the remaining downside was when the model said the low was in' : 'average result of trading to the close when the chance was 60% or more (long) or 40% or less (short), after costs') + '. Prospective record since the configuration was frozen: ' + (E.prospective && E.prospective.sessions ? E.prospective.sessions + ' sessions, skill ' + E.prospective.bss : 'none yet') + '.</div>';
  return h;
}

/* ---- weekly ---- */
function weeklyState(sym) {
  return Promise.all([hrows(sym), hrows('VIX'), loadRes('weekly')]).then(function (x) {
    var rows = x[0], Wk = CORE.weeksOf(rows), wi = Wk.length - 1, w = Wk[wi], j = w.length - 1, k = rows.length - 1, vm = {}; x[1].forEach(function (r) { vm[r[0]] = r[4] });
    var I = x[2].inst[sym]; if (!I || I.error) return null;
    var cx = CORE.wctx(Wk, wi, rows, k, vm), s = CORE.wstate(w, j, cx), out = {};
    Object.keys(I.outcomes).forEach(function (o) { var q = I.outcomes[o]; if (o === 'recover' && s.c >= s.o) return; out[o] = { p: CORE.wpred(q.model, s.x), name: q.name, validated: !!q.promoted, beats: q.beatsBench, fam: q.display } });
    var rk = Math.round(s.x[3] * 4) + '|' + Math.min(2, Math.floor(s.x[1] * 3));
    return { sym: sym, d: rows[k][0], day: j, last: ymdOf(rows[k][0]), s: s, out: out, rng: I.ranges[rk], I: I, fri: CORE.weekComplete(w, rows[k][0]) };
  });
}
function renderWeekly() {
  var el = $('rweek'); if (!el) return;
  weeklyState(R2.wsym).then(function (S) {
    var h = chips(I2SYMS, R2.wsym, 'wsym'); if (!S) { el.innerHTML = h + '<div class="r mut">Not available.</div>'; return }
    var I = S.I, days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    h += '<div class="r k">As of the ' + dlab(S.d) + ' close' + (S.fri ? ', the last trading day of the week, so this week is finished' : '') + ': week so far ' + sg((S.s.c / S.s.o - 1) * 100) + ' from the Monday open ' + f(S.s.o, 2) + ', at ' + Math.round(S.s.x[1] * 100) + '% of the week\'s range. ' + I.weeks + ' weeks of history from ' + dlab(I.from) + '.</div>';
    if (!S.fri) { h += '<div class="r hrow head"><span>Rest of the week</span><b>Chance</b><b>Source</b></div>';
      Object.keys(S.out).forEach(function (o) { var q = S.out[o]; h += '<div class="r hrow"><span>' + esc(q.name) + '</span><span class="num">' + pc(q.p) + '</span><span class="k">' + (q.validated ? 'model, validated' : q.beats ? 'frequency; the model was more accurate but not economically useful' : 'day and position frequency') + '</span></div>' });
      if (S.rng) h += '<div class="r hrow"><span>Further room this week <span class="k">10th, 50th, 90th percentile, ' + S.rng.n + ' cases</span></span><span class="num">up ' + S.rng.up.map(nm).join(' / ') + '%</span><span class="num">down ' + S.rng.dn.map(nm).join(' / ') + '%</span></div>' }
    h += '<div class="r hrow head"><span>Day that set the weekly</span><b>High</b><b>Low</b></div>';
    days.forEach(function (dn, i) { h += '<div class="r hrow"><span>' + dn + '</span><span class="num">' + pc(I.highDay[i]) + '</span><span class="num">' + pc(I.lowDay[i]) + '</span></div>' });
    h += '<div class="r k">' + esc(RES.weekly.note.split('. Covered call')[0]) + '. The day table uses only finished weeks with every trading day present (' + (I.completeWeeks || I.fullWeeks) + ', including ' + (I.shortWeeks || 0) + ' holiday weeks); the current week is never counted as finished.</div>';
    el.innerHTML = h;
  }).catch(function () { el.innerHTML = '<div class="r mut">Weekly research unavailable.</div>' });
}
/* ---- covered calls ---- */
function renderCC() {
  var el = $('rcc'); if (!el) return;
  loadRes('weekly').then(function (WK) {
    var c = WK.cc[R2.csym], h = chips(I2SYMS, R2.csym, 'csym'); if (!c || c.error) { el.innerHTML = h + '<div class="r mut">Not available.</div>'; return }
    h += '<div class="r k">Sell at the Friday close, expire the next Friday close. Chance the stock finishes above a strike set this far above the entry close, ' + c.weeks + ' weeks from ' + dlab(c.from) + '. Ranges are 95%.</div>';
    h += '<div class="r hrow head"><span>Strike above entry</span><b>All weeks</b><b>After a big up week</b></div>';
    c.all.forEach(function (z, i) { var a = c.afterRally[i]; h += '<div class="r hrow"><span>+' + z.x + '%</span><span class="num">' + pc(z.p) + ' <span class="k">' + pc(z.ci[0]) + ' to ' + pc(z.ci[1]) + '</span></span><span class="num">' + pc(a.p) + ' <span class="k">n ' + a.n + '</span></span></div>' });
    h += '<div class="r hrow head"><span>By VIX at entry</span><b>Low / mid</b><b>High</b></div>';
    c.all.forEach(function (z, i) { h += '<div class="r hrow"><span>+' + z.x + '%</span><span class="num">' + pc(c.vixLow[i].p) + ' / ' + pc(c.vixMid[i].p) + '</span><span class="num">' + pc(c.vixHigh[i].p) + '</span></div>' });
    h += '<div class="r k">A big up week means the prior week rose ' + c.rallyCut + '% or more (top fifth of moves). VIX splits at ' + c.vixCuts.map(function (v) { return v.toFixed(1) }).join(' and ') + '. Weekly upside: median ' + c.upside.med + '%, 90th percentile ' + c.upside.p90 + '%.</div>';
    h += '<div class="r"><b>Not measurable yet</b><div class="k">' + WK.ccNeeds.map(function (n) { return esc(n[0]) + ': ' + esc(n[1]) }).join('. ') + '. Saved chains so far: ' + Object.keys(WK.snapshots).map(function (t) { return t + ' ' + WK.snapshots[t] }).join(', ') + '.</div></div>';
    h += '<div class="r k">The chance the stock is near its daily high right now is in Intraday high and low above.</div>';
    el.innerHTML = h;
  }).catch(function () { el.innerHTML = '<div class="r mut">Not available.</div>' });
}

/* ---- recovery v2 ---- */
var RECS = { x: 10, days: 1, syms: ['NVDA', 'MU', 'AMD', 'WDC', 'SMH', 'SOXX'] };
function renderRecovery() {
  var el = $('rrec'), all = ['NVDA', 'MU', 'AMD', 'WDC', 'SMH', 'SOXX'];
  Promise.all(all.map(function (s) { return Promise.all([hrows(s + '10'), hrows(s).catch(function () { return null })]) })).then(function (x) {
    var L = RECS.syms.map(function (s) { var r = x[all.indexOf(s)], j = RAW['data/hist/' + s + '10.json'], o = { sym: s, d: r[0].map(function (q) { return q[0] }), c: r[0].map(function (q) { return q[q.length - 1] }), breaks: j.breaks || [] }; if (r[1]) { o.low = {}; r[1].forEach(function (q) { o.low[q[0]] = q[3] }) } return o });
    var R = CORE.recovery2(L, RECS.x, { days: RECS.days }), h = '<div class="chips" style="margin:8px 0 4px">' + all.map(function (s) { return '<button class="chipb' + (RECS.syms.indexOf(s) >= 0 ? ' on' : '') + '" data-rsym="' + s + '">' + s + '</button>' }).join('') + '</div>';
    h += '<label class="hp"><span>Decline of at least</span><input type="number" inputmode="decimal" id="recx" value="' + RECS.x + '" step="1"><span class="k">%</span></label><label class="hp"><span>Over this many sessions</span><input type="number" inputmode="numeric" id="recd" value="' + RECS.days + '"><span></span></label>';
    h += '<div class="r hrow"><span>' + R.ev.length + ' declines, ' + R.clusters + ' separate market episodes</span><span></span><span></span></div>';
    h += '<div class="r hrow head"><span>Back to the pre decline close</span><b>Chance, 95% range</b><b>Events</b></div>';
    [20, 60, 120].forEach(function (k) { var q = R.rec[k]; h += '<div class="r hrow"><span>within ' + k + ' sessions</span><span class="num">' + (q.p == null || q.n < 10 ? 'too few' : pc(q.p) + ' <span class="k">' + pc(q.ci[0]) + ' to ' + pc(q.ci[1]) + '</span>') + '</span><span class="num">' + q.n + ' <span class="k">' + q.clusters + ' episodes' + (q.censored ? ', ' + q.censored + ' still open' : '') + '</span></span></div>' });
    h += '<div class="r hrow"><span>Median sessions to recover <span class="k">survival estimate, open events included</span></span><span class="num">' + (R.tmed == null ? 'over half not back yet' : R.tmed) + '</span><span></span></div>';
    h += '<div class="r hrow"><span>Median worst point within 60 sessions</span><span class="num">' + (CORE.isNum(R.mae) ? sg(R.mae) + ' close' : 'n/a') + '</span><span class="num">' + (CORE.isNum(R.maeLow) ? sg(R.maeLow) + ' intraday <span class="k">vs ' + sg(R.maeCloseSameN) + ' close, same ' + R.maeLowN + '</span>' : '<span class="k">intraday lows only for the last 4 years</span>') + '</span></div>';
    h += '<div class="r hrow"><span>Fell another ' + (RECS.x / 2) + '% within 20 sessions</span><span class="num">' + (R.more.n >= 10 ? pc(R.more.k / R.more.n) + ' <span class="k">n ' + R.more.n + '</span>' : 'too few') + '</span><span></span></div>';
    h += '<div class="r k">Entry is the close of the decline day, so the decline is complete before anything is measured. Each stock counts at most once per horizon window (once per 20, 60 or 120 sessions), declines in different stocks within 7 days count as one episode, and the ranges resample whole episodes. Events too recent to have reached a horizon are treated as unfinished, not as failures. 10 years of split adjusted closes; corporate actions excluded.</div>';
    h += R.ev.slice().sort(function (a, b) { return b.d - a.d }).slice(0, 25).map(function (e) { return '<div class="r hev"><span>' + dlab(e.d) + ' ' + esc(e.sym) + '<div class="k">' + sg(e.drop) + '</div></span><span class="num">' + (e.done ? e.t + 'd' : 'open') + '</span><span class="num">' + (CORE.isNum(e.mae) ? sg(e.mae) : 'n/a') + '</span><span class="num">' + (CORE.isNum(e.maeLow) ? sg(e.maeLow) : '') + '</span></div>' }).join('');
    el.innerHTML = h;
  }).catch(function () { el.innerHTML = '<div class="r mut">History unavailable.</div>' });
}

/* ---- fingerprint for options ---- */
function renderFpRisk() {
  var el = $('rfprisk'); if (!el) return;
  loadRes('fingerprint').then(function (F) {
    var R = F.risk; if (!R) { el.innerHTML = ''; return } var h = '<div class="r hrow head"><span>Next 20 sessions</span><b>Error, model</b><b>Best benchmark</b></div>';
    Object.keys(R.targets).forEach(function (k) { var t = R.targets[k]; h += '<div class="r hrow"><span>' + esc(t.name) + '<div class="k">' + (t.ok ? 'beat the benchmarks' : 'did not beat the benchmarks') + '</div></span><span class="num">' + t.model + '</span><span class="num">' + Math.min(t.meanBench, t.vixBench) + ' <span class="k">' + (t.vixBench <= t.meanBench ? 'VIX based' : 'average') + '</span></span></div>' });
    h += '<div class="r k">' + esc(R.note) + ' ' + R.testDates + ' test windows.</div>';
    el.innerHTML = h;
  }).catch(function () { el.innerHTML = '' });
}

/* ---- registry ---- */
function renderRegistry() {
  loadRes('registry').then(function (R) {
    LEDGER_N = R.distinct || R.tests || 0; var order = ['Validated', 'Promising but unconfirmed', 'Insufficient evidence', 'Failed validation', 'Data unavailable'], tone = { 'Validated': 'g', 'Promising but unconfirmed': 'b', 'Insufficient evidence': '', 'Failed validation': 'r', 'Data unavailable': 'a' }, sel = HS.reg || 'Validated', cnt = {}, h = '';
    R.signals.forEach(function (s) { cnt[s.cls] = (cnt[s.cls] || 0) + 1 });
    h += '<div class="chips" style="margin:8px 0 4px">' + order.map(function (c) { return '<button class="chipb' + (c === sel ? ' on' : '') + '" data-reg="' + esc(c) + '">' + esc(c) + ' (' + (cnt[c] || 0) + ')</button>' }).join('') + '</div>';
    var F = [['instrument', 'Instrument'], ['horizon', 'Horizon'], ['sessions', 'Independent sessions'], ['n', 'Sample'], ['bench', 'Benchmark'], ['oos', 'Out of sample'], ['ci', 'Range'], ['calib', 'Calibration'], ['regime', 'Regimes'], ['fresh', 'Data as of'], ['validated', 'Last validated']];
    R.signals.filter(function (s) { return s.cls === sel }).forEach(function (s) {
      var ec = /useful|beat holding$/i.test(s.econ) && !/Not/.test(s.econ) ? 'g' : /Not economically|did not/.test(s.econ) ? 'r' : '';
      h += '<details class="r"><summary><span class="pill ' + tone[s.cls] + '">' + esc(s.cls) + '</span> <span class="pill ' + ec + '">' + esc(s.econ || 'Not tested') + '</span> <b>' + esc(s.name) + '</b></summary><div class="k">' + F.filter(function (q) { return s[q[0]] != null && s[q[0]] !== '' }).map(function (q) { var v = s[q[0]]; if (/^\d{8}$/.test(String(v))) v = dlab(v); return esc(q[1]) + ': ' + esc(String(v)) }).join('. ') + (s.why ? '. ' + esc(s.why) : '') + (s.prospective && s.prospective.sessions ? '. Prospective: ' + s.prospective.sessions + ' sessions, skill ' + s.prospective.bss : '') + '</div></details>' });
    h += '<div class="r k">' + esc(R.rules) + ' Ledger: ' + (R.distinct || 0) + ' distinct configurations, append only. Last run ' + esc(R.asof.slice(0, 10)) + '.</div>';
    $('rreg').innerHTML = h;
  }).catch(function () { $('rreg').innerHTML = '<div class="r mut">Registry not computed yet.</div>' });
}

/* ---- options research ---- */
function renderOptions() {
  loadRes('options').then(function (O) {
    var h = '<div class="r"><b>' + (O.trades.length ? O.trades.length + ' settled trades' : 'No settled trades yet') + '</b><div class="k">' + O.snapshots + ' saved chain snapshots (' + (O.tickers || []).join(', ') + '), ' + O.pending + ' waiting for expiry. ' + esc(O.note) + '</div></div>';
    O.summary.forEach(function (s) { h += '<div class="r hrow"><span>' + esc(s.ticker + ' ' + s.name) + ' <span class="k">' + s.portfolio + ' of ' + s.n + ' in the portfolio</span></span><span class="num">' + (CORE.isNum(s.avgRet) ? sg(s.avgRet) + ' avg' : 'n/a') + '<div class="k">P&amp;L $' + Math.round(s.totalPnl) + ', drawdown $' + Math.round(s.maxDD) + '</div></span><span class="k">capital $' + (s.avgCapital ? Math.round(s.avgCapital) : 'n/a') + ', assigned ' + s.assigned + (s.earlyRisk ? ', early risk ' + s.earlyRisk : '') + '</span></div>' });
    if (O.trades.length < O.minTrades) h += '<div class="r k">Not validated: fewer than ' + O.minTrades + ' settled trades.</div>';
    $('ropt').innerHTML = h;
  }).catch(function () { $('ropt').innerHTML = '<div class="r mut">Not computed yet.</div>' });
}

/* ---- wiring ---- */
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-i2sym],[data-i2bar],[data-i2out],[data-wsym],[data-csym],[data-reg],[data-rsym]'); if (!b) return;
  if (b.dataset.i2sym) { R2.sym = b.dataset.i2sym; renderI2() } else if (b.dataset.i2bar != null) { R2.bar = +b.dataset.i2bar; renderI2() } else if (b.dataset.i2out) { R2.out = b.dataset.i2out; renderI2() }
  else if (b.dataset.wsym) { R2.wsym = b.dataset.wsym; renderWeekly() } else if (b.dataset.csym) { R2.csym = b.dataset.csym; renderCC() } else if (b.dataset.reg) { HS.reg = b.dataset.reg; renderRegistry() }
  else if (b.dataset.rsym) { var s = b.dataset.rsym, i = RECS.syms.indexOf(s); if (i >= 0) { if (RECS.syms.length > 1) RECS.syms.splice(i, 1) } else RECS.syms.push(s); renderRecovery() }
});
document.addEventListener('change', function (e) { if (e.target.id === 'recx') { RECS.x = Math.max(1, +e.target.value || 10); renderRecovery() } if (e.target.id === 'recd') { RECS.days = Math.max(1, Math.min(20, +e.target.value || 1)); renderRecovery() } });
function renderIntra() { renderI2() }
function renderResearch2() { renderHealth(); renderI2(); renderWeekly(); renderCC(); renderFpRisk() }
setInterval(function () { if (session(Date.now()).st === 'open' && $('p-hist').classList.contains('on')) renderI2() }, 5 * 60e3);

/* progressive disclosure: research sections start folded except the first two; the choice is remembered on the device */
(function () {
  var open = LS('mb_hopen') || { 'Signal reliability': 1, 'Intraday high and low': 1 };
  [].forEach.call(document.querySelectorAll('#p-hist .sec'), function (s) { var h = s.querySelector('.sh h2'); if (!h) return; var k = h.textContent; s.classList.add('fold'); if (!open[k]) s.classList.add('closed');
    s.querySelector('.sh').addEventListener('click', function (e) { if (e.target.closest('button,input,a')) return; s.classList.toggle('closed'); if (s.classList.contains('closed')) delete open[k]; else open[k] = 1; LS('mb_hopen', open) }) });
})();
function renderHealth() {
  var el = $('rhealth'); if (!el) return;
  loadRes('health').then(function (H) { var bad = H.items.filter(function (i) { return !i.ok });
    el.innerHTML = '<div class="r full k">' + (bad.length ? '<b class="dn">Behind:</b> ' + bad.map(function (i) { return esc(i.name) + (i.last ? ' (through ' + dlab(i.last) + ')' : ' (' + esc(i.note || 'missing') + ')') }).join(', ') + '. ' : '') + 'Research data checked ' + esc(H.asof.slice(0, 10)) + ' against the last session ' + dlab(H.lastSession) + '; ' + (H.items.length - bad.length) + ' of ' + H.items.length + ' inputs current.</div>' })
    .catch(function () { el.innerHTML = '<div class="r full mut">Data health not computed yet.</div>' });
}
