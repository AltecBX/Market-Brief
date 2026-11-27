/* ---------- Personalization, saved on this device only ---------- */
KEY = LS('mb_pins') || KEY;
var TOPICS = LS('mb_topics') || [], TOPRE = null, HIDE = LS('mb_hide') || [];
function topicRe() { TOPRE = TOPICS.length ? new RegExp('(' + TOPICS.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('|') + ')', 'i') : null }
topicRe();
var _scoreNews = scoreNews;
scoreNews = function (n) { var s = _scoreNews(n); if (s > -9 && TOPRE && TOPRE.test(n.h)) { s += 3; n.pin = 1 } return s };
var SECS = [['secRev', 'Reversal watch'], ['sinceSec', 'Since your last visit'], ['autoSec', 'Comparable history'], ['secTop3', 'What matters most'], ['secRead', 'Readings'], ['secDrv', 'What is driving it'], ['secRisk', 'Risks and catalysts'], ['secCal7', 'Next 7 trading days'], ['secPriced', 'What is priced in'], ['secScen', 'Scenarios'], ['secLvl', 'Levels']];
function applyHide() { SECS.forEach(function (s) { var el = $(s[0]); if (el) el.classList.toggle('uhide', HIDE.indexOf(s[0]) >= 0) }) }
function renderCustom() {
  var h = '<div class="k">Pinned instruments (the Board\'s first filter and the change list)</div><div class="pills" id="cpins">' + INS.map(function (r) { return '<button class="chipb' + (KEY.indexOf(r[0]) >= 0 ? ' on' : '') + '" data-pin="' + r[0] + '">' + esc(r[1]) + '</button>' }).join('') + '</div>';
  h += '<div class="k" style="margin-top:10px">Topics to prioritize in the live wire, separated by commas</div><input class="search" id="ctop" value="' + esc(TOPICS.join(', ')) + '" placeholder="for example HBM, Korea, export controls">';
  h += '<div class="k" style="margin-top:10px">Sections on the Brief</div><div class="pills" id="csec">' + SECS.map(function (s) { return '<button class="chipb' + (HIDE.indexOf(s[0]) < 0 ? ' on' : '') + '" data-sec="' + s[0] + '">' + esc(s[1]) + '</button>' }).join('') + '</div>';
  h += '<div class="k" style="margin-top:10px">The default comparison basis is whatever you last picked on the Board. Major market developments always show, whatever is hidden.</div>';
  $('custom').innerHTML = h;
}
$('custom').addEventListener('click', function (e) {
  var p = e.target.closest('[data-pin]'), s = e.target.closest('[data-sec]');
  if (p) { var id = p.dataset.pin, i = KEY.indexOf(id); if (i >= 0) { if (KEY.length > 1) KEY.splice(i, 1) } else KEY.push(id); LS('mb_pins', KEY); renderCustom(); ensureBases(); render() }
  if (s) { var k = s.dataset.sec, j = HIDE.indexOf(k); if (j >= 0) HIDE.splice(j, 1); else HIDE.push(k); LS('mb_hide', HIDE); applyHide(); renderCustom() }
});
$('custom').addEventListener('change', function (e) { if (e.target.id === 'ctop') { TOPICS = e.target.value.split(',').map(function (x) { return x.trim() }).filter(Boolean).slice(0, 20); LS('mb_topics', TOPICS); topicRe(); WIRE.next = 0; pullWire(true) } });
$('tb').addEventListener('click', function (e) { var b = e.target.closest('[data-pinrow]'); if (!b) return; e.stopPropagation(); var id = b.dataset.pinrow, i = KEY.indexOf(id); if (i >= 0) { if (KEY.length > 1) KEY.splice(i, 1) } else KEY.push(id); LS('mb_pins', KEY); renderBoard() }, true);

/* ---------- Next 7 trading days: computed market events plus the scheduled list ---------- */
function ymdKey(p) { return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') }
function thirdFri(y, m) { var d = new Date(Date.UTC(y, m - 1, 1)), wd = d.getUTCDay(), first = 1 + ((5 - wd + 7) % 7); return first + 14 }
function vixExp(y, m) { var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1, tf = Date.UTC(ny, nm - 1, thirdFri(ny, nm)) - 30 * 864e5, d = new Date(tf); var k = ymdKey({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }); return HOL[k] ? null : k }
function cal7() {
  var out = [], days = [], t = Date.now(), seen = 0;
  for (var i = 0; i < 14 && seen < 7; i++) { var p = et(t + i * 864e5); if (p.wd === 'Sat' || p.wd === 'Sun') continue; var k = ymdKey(p); days.push([k, p]); if (!HOL[k]) seen++ }
  days.forEach(function (x) {
    var k = x[0], p = x[1], lab = p.wd + ' ' + ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m] + ' ' + p.d;
    if (HOL[k]) { out.push([k, lab, 'All day', 'US stock market closed, ' + HOL[k], 3, 'Calendar']); return }
    if (HALF[k]) out.push([k, lab, '1:00pm', 'Half day, stocks close at 1:00pm, bonds 2:00pm', 3, 'Calendar']);
    if (p.wd === 'Fri') { var tf = thirdFri(p.y, p.m) === p.d; out.push([k, lab, 'Close', tf ? ([3, 6, 9, 12].indexOf(p.m) >= 0 ? 'Quarterly options expiration' : 'Monthly options expiration') : 'Weekly options expiration', tf ? 3 : 1, 'Computed']) }
    if (vixExp(p.y, p.m) === k || vixExp(p.m === 1 ? p.y - 1 : p.y, p.m === 1 ? 12 : p.m - 1) === k) out.push([k, lab, '9:30am', 'VIX options and futures expiration', 2, 'Computed']);
    var nx = et(t + (days.indexOf(x) + 1) * 864e5); if (nx.m !== p.m && !HOL[k]) out.push([k, lab, 'Close', 'Last trading day of the month', 1, 'Computed']);
  });
  (B.events7 || []).forEach(function (e) { var p = new Date(e[0] + 'T12:00:00Z'), lab = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.getUTCDay()] + ' ' + ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.getUTCMonth() + 1] + ' ' + p.getUTCDate(); out.push([e[0], lab, e[1], e[2], e[3] || 1, 'Brief', e[4] || '', e[5], e[6], e[7]]) });
  var pinT = KEY.map(function (id) { return id.replace('xyz:', '') });
  out.forEach(function (e) { var txt = String(e[3]); e.rank = e[4] * 10 + (/(semi|chip|nvidia|micron|memory|dram|nand|hbm|tsmc|broadcom|amd|export|ai\b|hyperscaler)/i.test(txt + ' ' + (e[6] || '')) ? 5 : 0) + (pinT.some(function (s) { return new RegExp('\\b' + s + '\\b', 'i').test(txt) }) ? 3 : 0) + (/(fed|fomc|cpi|pce|payrolls|jobs report)/i.test(txt) ? 4 : 0) });
  return out.filter(function (e) { return e[0] >= ymdKey(et(t)) });
}
function renderCal7() {
  var ev = cal7(), lim = MODE === 'deep' ? 40 : 6, byRank = ev.slice().sort(function (a, b) { return b.rank - a.rank || (a[0] < b[0] ? -1 : 1) }).slice(0, lim).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 });
  $('cal7').innerHTML = byRank.map(function (e) { var nums = (e[7] != null || e[8] != null || e[9] != null) ? '<div class="k">' + (e[9] != null && e[9] !== '' ? 'Actual ' + esc(e[9]) + ' · ' : '') + 'Forecast ' + esc(e[7] == null ? 'n/a' : e[7]) + ' · Prior ' + esc(e[8] == null ? 'n/a' : e[8]) + '</div>' : ''; return '<div class="r"><span>' + esc(e[1]) + '<div class="k">' + esc(e[2]) + '</div></span><span>' + (e[4] >= 3 ? '<b>' : '') + lite(e[3]) + (e[4] >= 3 ? '</b>' : '') + (e[6] ? ' <span class="cat">' + esc(e[6]) + '</span>' : '') + nums + '</span></div>' }).join('') || '<div class="r mut">Nothing scheduled.</div>';
  $('cal7note').textContent = (MODE === 'deep' ? 'All events.' : 'Top 6 by importance, with chips, the Fed and your pinned names ranked higher.') + ' Holidays, half days and expirations are computed; data releases, Fed events, auctions and earnings come from the brief' + (B.events7 ? ' (' + B.updatedLabel + ').' : ', which has none yet.');
}

/* ---------- What is priced in ---------- */
function renderPriced() {
  var P = B.priced, el = $('priced'); if (!P) { $('secPriced').style.display = 'none'; return } $('secPriced').style.display = '';
  var kind = function (k) { return k === 'conf' ? '<span class="cat" style="color:var(--green)">CONFIRMED</span>' : k === 'spec' ? '<span class="cat" style="color:var(--orange)">SPECULATION</span>' : '<span class="cat">EXPECTED</span>' };
  var h = '';
  (P.fed || []).forEach(function (r) { h += '<div class="r"><span>' + esc(r[0]) + '</span><span>' + kind(r[2]) + lite(r[1]) + '</span></div>' });
  (P.data || []).forEach(function (r) { h += '<div class="r"><span>' + esc(r[1]) + '</span><span><b>' + esc(r[0]) + '</b> ' + (r[4] != null && r[4] !== '' ? kind('conf') + 'Actual ' + esc(r[4]) + ' vs forecast ' + esc(r[2]) + (r[5] ? '. ' + lite(r[5]) : '') : kind('exp') + 'Forecast ' + esc(r[2]) + ', prior ' + esc(r[3])) + '</span></div>' });
  (P.earn || []).forEach(function (r) { h += '<div class="r"><span>' + esc(r[1]) + '</span><span><b>' + esc(r[0]) + '</b> ' + kind('exp') + 'options imply ±' + (+r[2]).toFixed(1) + '% on earnings' + (r[3] ? '. ' + lite(r[3]) : '') + '</span></div>' });
  (P.other || []).forEach(function (r) { h += '<div class="r"><span>' + esc(r[0]) + '</span><span>' + kind(r[2]) + lite(r[1]) + '</span></div>' });
  var e = B.opt.em && B.opt.em[0]; if (e) h += '<div class="r"><span>SPX</span><span>' + kind('exp') + 'Options imply ±' + e[1].toFixed(2) + '% to ' + esc(e[2]) + ' (' + esc(B.opt.asof) + ')</span></div>';
  el.innerHTML = h; $('pricedasof').textContent = P.asof || B.updatedLabel || '';
}

/* ---------- Ask: search the brief, the wire and the archive ---------- */
var SYN = { nvidia: 'nvda', nvda: 'nvidia', korea: 'kospi|korean|hynix|samsung', kospi: 'korea', japan: 'nikkei|tokyo', fed: 'fomc|powell|rate', rates: 'fed|yield|treasury', yields: 'treasury|yield|10 year', yield: 'treasury|yields', memory: 'dram|nand|hbm|micron|hynix|sandisk|kioxia', chips: 'semis|semiconductor|nvidia|smh', semis: 'chips|semiconductor|smh', oil: 'brent|wti|crude|hormuz', options: 'implied|gamma|expected move|vix', fell: 'down|drop|lower|selloff|fall', fall: 'down|drop|lower', reverse: 'reversal|turned|bounce|recovered', reversed: 'reversal|turned|bounce|recovered', risks: 'risk', sectors: 'sector', priced: 'expect|implied|odds', week: 'week|mon|tue|wed|thu|fri' };
var STOP = /^(why|did|does|is|are|the|a|an|what|whats|today|is|it|to|of|in|on|for|do|be|with|market|markets|happening|going|expected|since|this|that|and|was|has|have|how|my)$/;
function corpus() {
  var C = [], bl = 'Brief ' + (B.updatedLabel || '');
  (B.qa || []).forEach(function (q) { C.push([q[0] + ' ' + q[1], '<b>' + esc(q[0]) + '</b> ' + lite(q[1]), bl, q[2] || '', 3]) });
  (B.top3 || []).forEach(function (t) { C.push([t[0] + ' ' + t[1], '<b>' + esc(t[0]) + '.</b> ' + lite(t[1]), bl, '', 2]) });
  (B.drivers || []).forEach(function (d) { C.push([d[1] + ' ' + d[2], '<b>' + esc(d[1]) + '.</b> ' + lite(d[2]), bl, '', 2]) });
  (B.risks || []).concat(B.calendar || []).forEach(function (r) { C.push([r[0] + ' ' + r[1], esc(r[0]) + ': ' + lite(r[1]), bl + ' calendar', '', 1]) });
  (B.picks || []).forEach(function (p) { C.push([p[1] + ' ' + p[3], esc(p[0]) + ' ' + lite(p[3]), bl + ' picks', '', 1]) });
  (B.stories || []).forEach(function (s) { C.push([s.h + ' ' + s.what + ' ' + s.why + ' ' + s.assets, '<b>' + esc(s.h) + '.</b> ' + lite(s.what) + ' ' + lite(s.why), bl + ' stories', s.src || '', 2]) });
  (B.means || []).forEach(function (m) { C.push([m, lite(m), bl + ' game plan', '', 1]) });
  (B.scenarios || []).forEach(function (s) { C.push([s.n + ' ' + s.cond + ' ' + s.confirm + ' ' + s.risk, '<b>' + esc(s.n) + '.</b> ' + lite(s.cond) + '. Invalid if ' + lite(s.inval), bl + ' scenarios', '', 1]) });
  WIRE.items.forEach(function (n) { C.push([n.h + ' ' + n.t.join(' '), esc(n.h), 'Wire ' + fmtT(n.ts) + (n.src ? ', ' + n.src : ''), n.url, 1]) });
  if (REG) C.push(['regime market rally risk breadth ' + REG.label, 'Regime now: <b>' + esc(REG.label) + '</b>. ' + REG.ev.slice(0, 4).map(function (e) { return esc(e[0]) + ' ' + esc(e[1]) }).join(', '), 'Live perps ' + tET(LASTOK || Date.now()), '', 1]);
  return C;
}
function ask(q) {
  var terms = q.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').split(/\s+/).filter(function (w) { return w && !STOP.test(w) }), out = $('askout');
  if (!terms.length) { out.innerHTML = ''; return }
  var pats = terms.map(function (w) { return new RegExp('\\b(' + w.replace(/s$/, '') + (SYN[w] ? '|' + SYN[w] : '') + ')', 'i') });
  var hits = corpus().map(function (c) { var s = 0; pats.forEach(function (p) { if (p.test(c[0])) s += 1 }); return [s * 10 + c[4], c] }).filter(function (x) { return x[0] >= 10 }).sort(function (a, b) { return b[0] - a[0] }).slice(0, 5);
  out.innerHTML = hits.length ? hits.map(function (x) { var c = x[1]; return '<div class="r"><div>' + c[1] + '</div><div class="k">' + esc(c[2]) + (c[3] && /^https:\/\//.test(c[3]) ? ' · <a href="' + esc(c[3]) + '" target="_blank" rel="noopener noreferrer">source</a>' : '') + '</div></div>' }).join('') : '<div class="r mut">Not covered in the current brief or live wire. The answer will only show here once a source covers it.</div>';
}
$('askin').addEventListener('input', function () { ask(this.value) });
$('askchips').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) { $('askin').value = b.dataset.q; ask(b.dataset.q) } });

/* ---------- Internals and cross asset checks ---------- */
function lastRet(S, back) { var n = S.c.length - 1 - (back || 0); return (S.c[n] / S.c[n - 1] - 1) * 100 }
function renderInternals() {
  var b = breadth('perp'), h = '';
  if (b.n) h += '<div class="r"><span>Stock perps up <span class="k">vs ' + basisDef('perp')[1].toLowerCase() + ', live</span></span><b class="num">' + b.up + ' of ' + b.n + ' (' + b.pct.toFixed(0) + '%)</b></div><div class="r"><span>Median stock perp vs S&amp;P perp</span><b class="num">' + (isNum(b.med) && isNum(chgOf('xyz:SP500', 'perp')) ? sg(b.med - chgOf('xyz:SP500', 'perp')) : 'n/a') + '</b></div>';
  (B.internals || []).forEach(function (r) { h += '<div class="r"><span>' + esc(r[0]) + ' <span class="k">' + esc(r[2] || B.updatedLabel) + '</span></span><b class="num">' + esc(r[1]) + '</b></div>' });
  loadHist(['SPY', 'RSP', 'IWM', 'QQQ', 'SMH']).then(function () {
    var S = HIST, pairs = [['Equal weight minus S&P (RSP vs SPY)', 'RSP', 'SPY'], ['Small caps minus S&P (IWM vs SPY)', 'IWM', 'SPY'], ['Semis minus Nasdaq (SMH vs QQQ)', 'SMH', 'QQQ']], x = '', last = S.SPY.d[S.SPY.d.length - 1];
    pairs.forEach(function (p) {
      var A = S[p[1]], Bq = S[p[2]], sp = [], n = Math.min(A.c.length, Bq.c.length);
      for (var i = 1; i < A.d.length; i++) { var j = Bq.ix[A.d[i]], j0 = Bq.ix[A.d[i - 1]]; if (j == null || j0 == null) continue; sp.push((A.c[i] / A.c[i - 1] - Bq.c[j] / Bq.c[j0]) * 100) }
      var v = sp[sp.length - 1], yr = sp.slice(-252), pct = yr.filter(function (z) { return z <= v }).length / yr.length * 100, r20 = sp.slice(-20).reduce(function (s, z) { return s + z }, 0);
      x += '<div class="r"><span>' + esc(p[0]) + ' <span class="k">' + dlab(last) + ', ' + pct.toFixed(0) + ' percentile of the last year, 20 sessions ' + sg(r20) + '</span></span><b class="num ' + (v >= 0 ? 'up' : 'dn') + '">' + sg(v) + '</b></div>';
    });
    var verdict = '';
    var spx = chgOf('xyz:SP500', 'perp');
    if (b.n >= 30 && isNum(spx)) verdict = spx > 0 && b.pct < 50 ? 'Weaker underneath than the index: the S&P perp is up but most stock perps are not.' : spx < 0 && b.pct > 55 ? 'Healthier underneath than the index: most stock perps are up while the S&P perp is down.' : b.pct >= 65 && spx > 0 ? 'Participation is broad, consistent with the index move.' : b.pct <= 35 && spx < 0 ? 'Selling is broad, consistent with the index move.' : 'Underneath roughly matches the index.';
    $('internals').innerHTML = h + x + (verdict ? '<div class="r full"><b>' + verdict + '</b><div class="k">Perp breadth uses ' + b.n + ' US listed stocks that trade as live perps, not the whole exchange; ETF spreads are last session closes. Exchange advance and decline counts appear here when the brief includes them.</div></div>' : '');
  }).catch(function () { $('internals').innerHTML = h });
}
function renderCross() {
  var c = function (id) { return fresh(id) ? chgOf(id, 'perp') : null }, s = c('xyz:SP500'), nd = c('xyz:XYZ100'), smh = c('xyz:SMH'), oil = c('xyz:BRENTOIL'), gold = c('xyz:GOLD'), jpy = c('xyz:JPY'), btc = c('BTC'), out = [];
  var add = function (name, a, b, div, why) { out.push('<div class="r"><span>' + esc(name) + '<div class="k">' + why + '</div></span><span class="pill ' + (div ? 'a' : 'g') + '">' + (div ? 'Divergence' : 'Confirms') + '</span></div>') };
  if (isNum(s) && isNum(smh) && Math.abs(smh - s) > 1) add('Semis vs S&P ' + sg(smh) + ' / ' + sg(s), 0, 0, (smh > 0) !== (s > 0), smh > s ? 'Chips are leading the move.' : 'Chips are lagging the move.');
  if (isNum(s) && isNum(oil) && Math.abs(oil) > 1) add('Brent vs S&P ' + sg(oil) + ' / ' + sg(s), 0, 0, oil > 0 && s < 0, oil > 0 && s < 0 ? 'Rising oil with falling stocks can point to inflation or supply worries.' : 'Oil and stocks moving the same way, often a growth read.');
  if (isNum(s) && isNum(gold) && Math.abs(gold) > 0.7) add('Gold vs S&P ' + sg(gold) + ' / ' + sg(s), 0, 0, gold > 0 && s > 0, gold > 0 && s > 0 ? 'Both up: risk appetite alongside hedging demand.' : gold > 0 ? 'Gold up while stocks fall fits a defensive move.' : 'Gold down.');
  if (isNum(s) && isNum(jpy) && Math.abs(jpy) > 0.4) add('USD/JPY vs S&P ' + sg(jpy) + ' / ' + sg(s), 0, 0, jpy < 0 && s > 0, jpy < 0 ? 'A stronger yen has often come with risk off moves.' : 'A weaker yen has often come with risk on moves.');
  if (isNum(nd) && isNum(btc) && Math.abs(btc - nd) > 2) add('Bitcoin vs Nasdaq 100 ' + sg(btc) + ' / ' + sg(nd), 0, 0, (btc > 0) !== (nd > 0), 'Bitcoin often trades with tech risk appetite.');
  loadHist(['SPX', 'VIX', 'NDX', 'US10Y']).then(function () {
    var S = HIST, sx = lastRet(S.SPX), vx = lastRet(S.VIX), nq = lastRet(S.NDX), y = S.US10Y, yd = (y.c[y.c.length - 1] - y.c[y.c.length - 2]) * 100;
    if (sx > 0 && vx > 0) add('Last session: S&P and VIX both up ' + sg(sx) + ' / ' + sg(vx, 1), 0, 0, true, 'Stocks rose while fear rose. Hedging demand into the rally.');
    else add('Last session: S&P ' + sg(sx) + ', VIX ' + sg(vx, 1), 0, 0, false, 'The usual inverse relationship held.');
    if (Math.abs(yd) >= 3) add('Last available: 10 year yield ' + (yd >= 0 ? '+' : '−') + Math.abs(yd).toFixed(0) + ' bps, Nasdaq 100 ' + sg(nq), 0, 0, yd > 0 && nq > 0, yd > 0 && nq > 0 ? 'Tech rose despite higher yields.' : yd > 0 ? 'Higher yields with tech lower, a familiar pressure.' : 'Lower yields.');
    $('cross').innerHTML = out.join('') + '<div class="r k">Live rows use perps vs ' + basisDef('perp')[1].toLowerCase() + '. Last session rows use Cboe and FRED closes (yield ' + dlab(y.d[y.d.length - 1]) + '). These are possible readings, not rules.</div>';
  }).catch(function () { $('cross').innerHTML = out.join('') });
}

/* ---------- Forecast accountability ---------- */
var SC = null;
function parseExp(note, upd) { var m = String(note).match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})/); if (!m) return null; var mo = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[1]) / 3 + 1, y = +String(upd).slice(0, 4), um = +String(upd).slice(5, 7); if (mo < um - 6) y++; return y * 10000 + mo * 100 + +m[2] }
function scorecard() {
  if (!MEM) return;
  var briefs = MEM.filter(function (e) { return e.kind === 'brief' }).slice(0, 120);
  Promise.all([loadHist(['SPX'])].concat(briefs.map(function (e) { return fetch('archive/' + e.file, { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null }).catch(function () { return null }) }))).then(function (res) {
    var S = HIST.SPX, docs = res.slice(1).filter(Boolean), em = { done: 0, hit: 0, pend: 0, byH: {} }, dir = { done: 0, hit: 0, pend: 0, base: 0 }, lv = { done: 0, held: 0, pend: 0 };
    docs.forEach(function (d) {
      (d.opt && d.opt.em || []).forEach(function (e, i) { var x = e[4] ? +String(e[4]).replace(/-/g, '') : parseExp(e[2], d.updated); if (!x) return; var j = S.ix[x], b = d.opt.base, m = b * e[1] / 100, k = (e[0] || '') + ''; em.byH[k] = em.byH[k] || { done: 0, hit: 0 }; if (j == null) { if (x > S.asof) em.pend++; return } em.done++; em.byH[k].done++; if (S.c[j] >= b - m && S.c[j] <= b + m) { em.hit++; em.byH[k].hit++ } });
      var F = d.forecast; if (F && F.dir && F.date && isNum(F.ref)) { var fd = +String(F.date).replace(/-/g, ''), j2 = S.ix[fd]; if (j2 == null) { if (fd > S.asof) dir.pend++ } else { dir.done++; var up = S.c[j2] > F.ref; if ((F.dir === 'up') === up) dir.hit++; if (up) dir.base++ } }
    });
    var zone = { Bull: 0, Range: 0, Risk: 0, n: 0 }, br = { n: 0, x: 0 }, rg = {};
    docs.forEach(function (d) { if (!d.ladder || !d.updated) return; var u = new Date(d.updated).getTime(), nx = null, pv = null;
      for (var i = 0; i < S.d.length; i++) { var s = String(S.d[i]), ct = etMs(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6), HALF[dstr(S.d[i])] ? 13 : 16, 0); if (ct > u) { nx = i; break } pv = i }
      if (nx == null || pv == null) return; var c = S.c[nx], p = S.c[pv]; zone.n++; zone[c > d.ladder.bull ? 'Bull' : c >= d.ladder.floor ? 'Range' : 'Risk']++;
      (d.opt && d.opt.levels || []).forEach(function (l) { br.n++; if ((p - l[1]) * (c - l[1]) < 0) br.x++ });
      if (d.forecast && d.forecast.regime && d.forecast.dir) { var k = d.forecast.regime, j2 = S.ix[+String(d.forecast.date).replace(/-/g, '')]; if (j2 != null) { rg[k] = rg[k] || [0, 0]; rg[k][0]++; if ((d.forecast.dir === 'up') === (S.c[j2] > d.forecast.ref)) rg[k][1]++ } } });
    var hz = Object.keys(em.byH).filter(function (k) { return em.byH[k].done }).map(function (k) { return esc(k) + ' ' + em.byH[k].hit + ' of ' + em.byH[k].done }).join(', ');
    var h = '<div class="r"><b>Expected move coverage</b><div class="k">' + (em.done ? em.hit + ' of ' + em.done + ' SPX closes landed inside the implied move (' + (em.hit / em.done * 100).toFixed(0) + '%). About 68% is what a one standard deviation move implies. ' : 'No implied move has reached its expiry yet. ') + (em.pend ? em.pend + ' waiting for their expiry.' : '') + '</div></div>';
    h += '<div class="r"><b>Directional calls</b><div class="k">' + (dir.done ? dir.hit + ' of ' + dir.done + ' correct (' + (dir.hit / dir.done * 100).toFixed(0) + '%). Baseline of always calling up: ' + (dir.base / dir.done * 100).toFixed(0) + '%. ' : 'None scored yet. Briefs record a forecast from now on; earlier briefs had none. ') + (dir.pend ? dir.pend + ' pending.' : '') + '</div></div>';
    if (hz) h += '<div class="r k">By horizon: ' + hz + '</div>';
    h += '<div class="r"><b>Scenario outcomes</b><div class="k">' + (zone.n ? 'Next S&P close after each brief landed in the bull zone ' + zone.Bull + ', range ' + zone.Range + ', risk ' + zone.Risk + ' times (' + zone.n + ' briefs). Option levels crossed by that close: ' + br.x + ' of ' + br.n + '.' : 'No brief has reached its next close yet.') + '</div></div>';
    var rk = Object.keys(rg); if (rk.length) h += '<div class="r"><b>Directional calls by regime</b><div class="k">' + rk.map(function (k) { return esc(k) + ' ' + rg[k][1] + ' of ' + rg[k][0] }).join(', ') + '</div></div>';
    h += '<div class="r k">Scores read the archive exactly as published and Cboe S&P closes. Nothing is rescored after the fact. Fewer than 20 scored forecasts says little.</div>';
    $('score').innerHTML = h;
  });
}

/* ---------- Hooks into existing renders ---------- */
var _render = render;
render = function () { _render(); try { renderCross() } catch (e) { } };
var _applyBrief = applyBrief;
applyBrief = function (nb) { _applyBrief(nb); try { renderCal7(); renderPriced(); applyHide(); renderCustom(); var q = $('askin'); if (q && q.value) ask(q.value) } catch (e) { } };
var _renderBoard = renderBoard;
renderBoard = function () { _renderBoard(); if (openRow) { var r = document.querySelector('#tb .det'); if (r && !r.querySelector('[data-pinrow]')) r.insertAdjacentHTML('beforeend', '<span><button class="btn" data-pinrow="' + openRow + '" style="min-height:26px;padding:2px 10px;font-size:12px">' + (KEY.indexOf(openRow) >= 0 ? 'Unpin' : 'Pin') + '</button></span>') } };
var _showTab = showTab;
showTab = function (p) { _showTab(p); if (p === 'board') { renderInternals(); renderCross() } if (p === 'mem') { var t = setInterval(function () { if (MEM) { clearInterval(t); scorecard() } }, 300); setTimeout(function () { clearInterval(t) }, 8000) } };
var _setMode = setMode;
setMode = function (m) { _setMode(m); try { renderCal7() } catch (e) { } };

/* ---------- Semiconductor center ---------- */
var SEMIG = [['Chip designers', 'NVDA AMD AVGO QCOM MRVL ARM'], ['Memory and storage, US', 'MU SNDK WDC'], ['Equipment', 'ASML LRCX AMAT'], ['Foundry', 'TSM UMC INTC'], ['Memory, Asia', 'SKHX SMSN KIOXIA']];
function grpMed(ids, k) { var v = ids.split(' ').map(function (s) { return fresh('xyz:' + s) ? chgOf('xyz:' + s, k) : null }).filter(isNum); return v.length ? median(v) : null }
function renderSemis() {
  var k = 'perp', nd = fresh('xyz:XYZ100') ? chgOf('xyz:XYZ100', k) : null, smh = fresh('xyz:SMH') ? chgOf('xyz:SMH', k) : null, h = '';
  h += '<div class="r hrow head"><span>Group, median perp</span><b>Move</b><b>vs NDX</b></div>';
  SEMIG.forEach(function (g) { var m = grpMed(g[1], k); h += '<div class="r hrow"><span>' + esc(g[0]) + ' <span class="k">' + esc(g[1].split(' ').join(', ')) + '</span></span><span class="' + (isNum(m) ? m >= 0 ? 'up' : 'dn' : '') + '">' + (isNum(m) ? sg(m) : 'n/a') + '</span><span>' + (isNum(m) && isNum(nd) ? sg(m - nd) : 'n/a') + '</span></div>' });
  h += '<div class="r hrow"><span>Semis ETF (SMH)</span><span class="' + (isNum(smh) ? smh >= 0 ? 'up' : 'dn' : '') + '">' + (isNum(smh) ? sg(smh) : 'n/a') + '</span><span>' + (isNum(smh) && isNum(nd) ? sg(smh - nd) : 'n/a') + '</span></div>';
  var am = grpMed(SEMIG[4][1], k), um = grpMed(SEMIG[1][1], k), jp = fresh('xyz:JP225') ? chgOf('xyz:JP225', 'ref24') : null, kr = fresh('xyz:KR200') ? chgOf('xyz:KR200', 'ref24') : null;
  var read = '';
  if (isNum(am) && isNum(um)) read += 'Asia memory perps ' + sg(am) + ' vs US memory perps ' + sg(um) + ' since the ' + baseDay() + ' US close. ';
  if (isNum(jp)) read += 'Nikkei perp ' + sg(jp) + (isNum(kr) ? ', Kospi 200 perp ' + sg(kr) : '') + ' over 24h. ';
  h += '<div class="r full"><b>Asia read for the next US session</b><div class="k">' + (read || 'Waiting for live Asia prices. ') + 'Asia often follows the prior US session, so a big Asian move is partly a reaction, not new information. ' + (isNum(jp) && Math.abs(jp) >= 1 ? '<a href="#" id="semistudy" data-x="' + Math.floor(Math.abs(jp) * 2) / 2 + '" data-dir="' + (jp > 0 ? 1 : 0) + '">See how US semis did after similar Nikkei moves</a>.' : 'The History tab tests Nikkei moves against the next US session and semis.') + '</div></div>';
  var S = B.semis;
  if (S) { (S.memory || []).forEach(function (r) { h += '<div class="r full"><b>' + esc(r[0]) + '</b> ' + lite(r[1]) + (r[2] && /^https:\/\//.test(r[2]) ? ' <a class="k" href="' + esc(r[2]) + '" target="_blank" rel="noopener noreferrer">source</a>' : '') + '</div>' }); (S.notes || []).forEach(function (r) { h += '<div class="r full"><span class="cat">' + esc(r[0]) + '</span>' + lite(r[1]) + (r[2] && /^https:\/\//.test(r[2]) ? ' <a class="k" href="' + esc(r[2]) + '" target="_blank" rel="noopener noreferrer">source</a>' : '') + '</div>' }) }
  else h += '<div class="r full k">Memory pricing (DRAM, NAND, HBM), supply and demand, export rules, AI and hyperscaler spending, earnings and estimate changes appear here once a scheduled brief includes them, each with its source.</div>';
  $('semis').innerHTML = h; $('semisasof').textContent = 'Perps vs ' + basisDef(k)[1].toLowerCase() + (S && S.asof ? ', notes ' + S.asof : '');
}
$('semis').addEventListener('click', function (e) { var a = e.target.closest('#semistudy'); if (!a) return; e.preventDefault(); openStudy('asiasmh', { x: +a.dataset.x, dir: +a.dataset.dir }) });
var _showTab2 = showTab;
showTab = function (p) { _showTab2(p); if (p === 'board') renderSemis() };

/* ---------- Options extras from the scheduled brief: skew, 0DTE, IV change ---------- */
function renderOptExtra() {
  var O = B.opt, h = '';
  if (O.skew && O.skew.rows) { h += '<div class="r hrow head"><span>Skew, ' + esc(O.skew.asof || O.asof) + '</span><b>25d put / ATM / 25d call IV</b><b>Put minus call</b></div>'; O.skew.rows.forEach(function (r) { h += '<div class="r hrow"><span>' + esc(r[0]) + '</span><span>' + r[1].toFixed(1) + ' / ' + r[2].toFixed(1) + ' / ' + r[3].toFixed(1) + '%</span><span>' + (r[1] - r[3] >= 0 ? '+' : '−') + Math.abs(r[1] - r[3]).toFixed(1) + '</span></div>' }) }
  if (O.ivchg) O.ivchg.forEach(function (r) { h += '<div class="r hrow"><span>' + esc(r[0]) + ' IV</span><span>' + r[1].toFixed(1) + '%</span><span>' + (r[1] - r[2] >= 0 ? '+' : '−') + Math.abs(r[1] - r[2]).toFixed(1) + ' pts</span></div>' });
  if (O.zero && O.zero.rows) { var mx = 0; O.zero.rows.forEach(function (g) { mx = Math.max(mx, g[1] - g[2]) }); h += '<div class="r full"><b>0DTE positioning</b> <span class="k">' + esc(O.zero.expiry || '') + ', ' + esc(O.zero.asof || '') + '. ' + esc(O.zero.note || '') + '</span></div>' + O.zero.rows.map(function (g) { return '<div class="gx"><span class="num"><b>' + f(g[0], 0) + '</b></span><span class="gb"><i style="width:' + (g[1] / mx * 100) + '%;background:var(--gfill)"></i><i style="width:' + (-g[2] / mx * 100) + '%;background:var(--rfill)"></i></span><span class="lb"></span></div>' }).join('') }
  $('optx').innerHTML = h; $('secOptx').style.display = h ? '' : 'none';
}
var _applyBrief2 = applyBrief;
applyBrief = function (nb) { _applyBrief2(nb); try { renderOptExtra() } catch (e) { } };

/* ---------- Reversal watch: measured from live perp candles ---------- */
var REV = null, PS = {};
function loadRev() {
  if (document.hidden) return;
  var bt = B.base && B.base.ts ? new Date(B.base.ts).getTime() : Date.now() - 864e5, coins = ['xyz:SP500', 'xyz:XYZ100', 'xyz:SMH'];
  Promise.all(coins.map(function (c) { return post({ type: 'candleSnapshot', req: { coin: c, interval: '5m', startTime: bt - 8 * 36e5, endTime: Date.now() } }) })).then(function (rs) { REV = analyzeRev(rs, bt); renderRev(); soon() }).catch(function () { });
}
function vwapOf(K) { var pv = 0, vv = 0; K.forEach(function (c) { var tp = (+c.h + +c.l + +c.c) / 3; pv += tp * +c.v; vv += +c.v }); return vv ? pv / vv : null }
function swing(K, dir) {
  /* dir 1: drop then recovery (peak before trough). dir -1: rally then fade */
  var best = null;
  K.forEach(function (c, i) { var x = dir > 0 ? +c.l : +c.h; if (!best || (dir > 0 ? x < best.x : x > best.x)) best = { x: x, i: i } });
  if (!best) return null; var pk = null;
  for (var j = 0; j <= best.i; j++) { var y = dir > 0 ? +K[j].h : +K[j].l; if (!pk || (dir > 0 ? y > pk.x : y < pk.x)) pk = { x: y, i: j } }
  var last = +K[K.length - 1].c, move = (best.x / pk.x - 1) * 100, rec = (last - best.x) / (pk.x - best.x);
  return { dir: dir, peak: pk.x, pt: +K[pk.i].t, ext: best.x, et: +K[best.i].t, last: last, move: move, rec: rec };
}
function analyzeRev(rs, bt) {
  var now = Date.now(), ss = session(now).st, o = lastOpenMs(now), from = (ss === 'open' || ss === 'post') && o > bt ? o : bt;
  var cut = function (k) { return (k || []).filter(function (c) { return +c.t >= from && +c.t + 3e5 <= now + 3e5 }) };
  var K = cut(rs[0]), N = cut(rs[1]), M = cut(rs[2]); if (K.length < 12) return null;
  var bo = (rs[0] || []).filter(function (c) { return +c.t >= bt - 6.5 * 36e5 && +c.t < bt });
  if (bo.length >= 20) { PS = { hi: Math.max.apply(0, bo.map(function (c) { return +c.h })), lo: Math.min.apply(0, bo.map(function (c) { return +c.l })) } }
  var em = B.opt && B.opt.em && B.opt.em[0] ? B.opt.em[0][1] : 1, need = Math.max(0.8, em * 0.5);
  var d = swing(K, 1), u = swing(K, -1), s = Math.abs(d.move) >= Math.abs(u.move) ? d : u;
  var res = { from: from, win: from === bt ? 'since the ' + baseDay() + ' close' : 'since the 9:30am open', s: s, need: need };
  if (Math.abs(s.move) < need) { res.label = null; return res }
  if (s.rec < 0.15 && s.dir < 0) { res.label = null; return res }
  var vw = vwapOf(K), ev = [], down = s.dir > 0;
  ev.push([down ? 'Decline from the high' : 'Rally from the low', sg(s.move) + ', ' + f(s.peak, 0) + ' to ' + f(s.ext, 0)]);
  ev.push([down ? 'Low at' : 'High at', tET(s.et, true) + ', ' + ago(now - s.et) + ' ago']);
  ev.push(['Share of the move retraced', (s.rec * 100).toFixed(0) + '%']);
  if (vw) ev.push(['Perp VWAP ' + res.win, f(vw, 0) + (down ? (s.last > vw ? ', reclaimed' : ', still below') : (s.last < vw ? ', lost' : ', still above'))]);
  var semi = null; if (M.length >= 12) { var sm = swing(M, s.dir); semi = sm.rec; ev.push(['Semis ETF retraced', (sm.rec * 100).toFixed(0) + '% of its ' + sg(sm.move) + ' move']) }
  if (N.length >= 12) { var nn = swing(N, s.dir); ev.push(['Nasdaq 100 retraced', (nn.rec * 100).toFixed(0) + '% of its ' + sg(nn.move) + ' move']) }
  var orr = null; if (from !== bt && K.length >= 6) { var ok = K.slice(0, 6), oh = Math.max.apply(0, ok.map(function (c) { return +c.h })), ol = Math.min.apply(0, ok.map(function (c) { return +c.l })); orr = down ? (s.ext < ol && s.last > ol) : (s.ext > oh && s.last < oh); ev.push(['Opening range', f(ol, 0) + ' to ' + f(oh, 0) + (orr ? (down ? ', broke below then reclaimed' : ', broke above then lost') : '')]) }
  var fl = []; (B.opt.levels || []).concat([['Prior session low', PS.lo], ['Prior session high', PS.hi], ['Bull trigger', B.ladder.bull], ['Range floor', B.ladder.floor]]).forEach(function (l) { if (!isNum(l[1])) return; if (down && s.ext < l[1] && s.last > l[1]) fl.push(l[0] + ' ' + f(l[1], 0)); if (!down && s.ext > l[1] && s.last < l[1]) fl.push(l[0] + ' ' + f(l[1], 0)) });
  if (fl.length) ev.push([down ? 'Failed breakdown below' : 'Failed breakout above', fl.slice(0, 3).join(', ')]);
  var br = breadth('perp'); if (br.n) ev.push(['Stock perps up now', br.pct.toFixed(0) + '% of ' + br.n]);
  var gf = gammaFlip(); if (gf && ((s.ext - gf) * (s.last - gf) < 0)) ev.push(['Crossed the gamma flip ' + f(gf, 0), 'dealer hedging effects may change on either side; an estimate from open interest']);
  var mins = (now - s.et) / 60e3, gs = Object.keys(br.groups || {}).map(function (k) { return br.groups[k] }), spread = gs.length >= 3 ? Math.max.apply(0, gs) - Math.min.apply(0, gs) : 0, l;
  if (s.rec < 0.15) l = 'No reversal yet, near the low';
  else if (s.rec < 0.382) l = down ? 'Temporary bounce so far' : 'Pullback so far';
  else if (s.rec < 0.618) l = 'Partial ' + (down ? 'recovery' : 'fade');
  else if (down && vw && s.last > vw && (semi == null || semi >= 0.5) && br.pct >= 60 && mins >= 30) l = 'Potential sustainable reversal';
  else if (!down && vw && s.last < vw && br.pct <= 40 && mins >= 30) l = 'Potential sustainable reversal lower';
  else if (br.n && (down ? br.pct >= 60 : br.pct <= 40)) l = down ? 'Broad recovery' : 'Broad fade';
  else if (spread > 1.5) l = 'Sector rotation';
  else l = down ? 'Narrow recovery' : 'Narrow fade';
  res.label = l; res.ev = ev; res.mins = mins; return res;
}
function renderRev() {
  var sec = $('secRev'); if (!REV || !REV.label) { sec.style.display = 'none'; return } sec.style.display = '';
  var r = REV, down = r.s.dir > 0, tone = /sustainable reversal$|Broad recovery/.test(r.label) ? 'g' : /lower|Broad fade/.test(r.label) ? 'r' : 'a';
  $('revasof').textContent = 'S&P perp, ' + r.win;
  $('rev').innerHTML = '<div class="r full"><span class="pill ' + tone + '">' + esc(r.label) + '</span> <span class="k">' + (down ? 'Turn began at the low, ' : 'Turn began at the high, ') + tET(r.s.et, true) + '. ' + (r.s.rec * 100).toFixed(0) + '% of the ' + sg(r.s.move) + ' move retraced.</span></div>' + r.ev.map(function (e) { return '<div class="r xd"><span>' + esc(e[0]) + '</span><b class="num">' + esc(e[1]) + '</b></div>' }).join('') + '<div class="r full k">Rules: under 38% retraced is a bounce, 38 to 62% partial, over 62% with the VWAP reclaimed, semis at least half back, 60% of stock perps up and 30 minutes held is a potential sustainable reversal. Volume, VIX and yields are not live here, and nothing here shows who was buying or why. Deep mode lists the evidence.</div>';
}
var _allLevels = allLevels;
allLevels = function () { var L = _allLevels(); if (PS.hi) { L.push(['Prior session high', PS.hi, 'Perp, ' + baseDay() + ' cash hours']); L.push(['Prior session low', PS.lo, 'Perp, ' + baseDay() + ' cash hours']); L.sort(function (a, b) { return b[1] - a[1] }) } return L };

/* ---------- Story impact from the brief ---------- */
function renderStories() {
  var S = B.stories || [], el = $('stories'); $('secStories').style.display = S.length ? '' : 'none'; if (!S.length) return;
  el.innerHTML = S.map(function (s) { var c = s.impl === 'bull' ? 'up' : s.impl === 'bear' ? 'dn' : 'am'; return '<div class="r"><div><span class="cat">' + esc(s.known === 'known' ? 'ALREADY KNOWN' : 'NEW') + '</span><b>' + esc(s.h) + '</b> <span class="k">' + esc(s.t) + '</span></div><dl class="sdl"><dt>What</dt><dd>' + lite(s.what) + '</dd><dt>Why it matters</dt><dd>' + lite(s.why) + '</dd><dt>Assets</dt><dd>' + esc(s.assets) + '</dd><dt>Read</dt><dd class="' + c + '">' + lite(s.read || (s.impl === 'bull' ? 'Bullish' : s.impl === 'bear' ? 'Bearish' : 'Mixed')) + '</dd><dt>Reaction</dt><dd>' + lite(s.reacted) + '</dd><dt>Confirms</dt><dd>' + lite(s.confirm) + '</dd><dt>Invalid if</dt><dd>' + lite(s.invalid) + '</dd></dl>' + (s.src && /^https:\/\//.test(s.src) ? '<a class="k" href="' + esc(s.src) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '') + '</div>' }).join('');
}

/* ---------- Memory: compare two archived briefs ---------- */
var CMP = [];
function memSummary(d) { var e0 = d.opt && d.opt.em && d.opt.em[0], vx = null; try { vx = d.opt.vix.idx.filter(function (x) { return x[0] === 'VIX' })[0][2] } catch (e) { } return [['Published', d.updatedLabel], ['Headline', d.headline], ['Base', (d.base && d.base.label) + ' ' + (d.base ? f(d.base.spx, 2) : '')], ['Bull trigger', d.ladder ? f(d.ladder.bull, 0) : 'n/a'], ['Range floor', d.ladder ? f(d.ladder.floor, 0) : 'n/a'], ['Nearest implied move', e0 ? '±' + (+e0[1]).toFixed(2) + '%' : 'n/a'], ['VIX close', vx ? f(vx, 2) : 'n/a'], ['Gamma flip', (function () { var g = (d.opt && d.opt.levels || []).filter(function (x) { return /gamma flip/i.test(x[0]) })[0]; return g ? f(g[1], 0) : 'n/a' })()], ['Forecast', d.forecast ? d.forecast.dir + ' vs ' + f(d.forecast.ref, 0) + ' for ' + d.forecast.date + (d.forecast.regime ? ', regime ' + d.forecast.regime : '') : 'none recorded']] }
function drawCmp() {
  var v = $('memcmp'); if (CMP.length < 2) { v.innerHTML = CMP.length ? '<div class="note">Pick one more brief to compare.</div>' : ''; return }
  Promise.all(CMP.map(function (fl) { return fetch('archive/' + fl, { cache: 'force-cache' }).then(function (r) { return r.json() }) })).then(function (ds) { var a = memSummary(ds[0]), b = memSummary(ds[1]); v.innerHTML = '<div class="sh"><h2>Compare</h2><span><button class="btn" id="cmpclear" style="min-height:24px;padding:2px 9px;font-size:12px">Clear</button></span></div><div class="grp hist">' + a.map(function (r, i) { return '<div class="r hrow"><span class="k">' + esc(r[0]) + '</span><span style="text-align:left">' + esc(r[1]) + '</span><span style="text-align:left">' + esc(b[i][1]) + '</span></div>' }).join('') + '</div>'; $('cmpclear').onclick = function () { CMP = []; drawMem(); drawCmp() } }).catch(function () { v.innerHTML = '<div class="note">Could not load those briefs.</div>' });
}
var _drawMem = drawMem;
drawMem = function () { _drawMem(); [].forEach.call(document.querySelectorAll('#memlist .r[data-f]'), function (r) { if (r.dataset.k !== 'brief') return; r.insertAdjacentHTML('beforeend', '<button class="chipb' + (CMP.indexOf(r.dataset.f) >= 0 ? ' on' : '') + '" data-cmp="' + esc(r.dataset.f) + '" style="min-height:24px;padding:2px 9px;font-size:12px;margin-top:4px">Compare</button>') }) };
$('memlist').addEventListener('click', function (e) { var b = e.target.closest('[data-cmp]'); if (!b) return; e.stopPropagation(); var f2 = b.dataset.cmp, i = CMP.indexOf(f2); if (i >= 0) CMP.splice(i, 1); else { CMP.push(f2); if (CMP.length > 2) CMP.shift() } drawMem(); drawCmp() }, true);

var _applyBrief3 = applyBrief;
applyBrief = function (nb) { _applyBrief3(nb); try { renderStories(); loadRev() } catch (e) { } };
setInterval(function () { loadRev() }, 60e3);
