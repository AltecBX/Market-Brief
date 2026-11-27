/* ---------- Personalization, saved on this device only ---------- */
KEY = LS('mb_pins') || KEY;
var TOPICS = LS('mb_topics') || [], TOPRE = null, HIDE = LS('mb_hide') || [];
function topicRe() { TOPRE = TOPICS.length ? new RegExp('(' + TOPICS.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('|') + ')', 'i') : null }
topicRe();
var _scoreNews = scoreNews;
scoreNews = function (n) { var s = _scoreNews(n); if (s > -9 && TOPRE && TOPRE.test(n.h)) { s += 3; n.pin = 1 } return s };
var SECS = [['secOutlook', 'Outlook'], ['secRev', 'Reversal watch'], ['sinceSec', 'Since your last visit'], ['autoSec', 'Comparable history'], ['secTop3', 'What matters most'], ['secRead', 'Readings'], ['secDrv', 'What is driving it'], ['secRisk', 'Risks and catalysts'], ['secCal7', 'Next 7 trading days'], ['secPriced', 'What is priced in'], ['secScen', 'Scenarios'], ['secLvl', 'Levels']];
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
  var ev = cal7(), lim = MODE === 'deep' ? 40 : 3, byRank = ev.slice().sort(function (a, b) { return b.rank - a.rank || (a[0] < b[0] ? -1 : 1) }).slice(0, lim).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 });
  $('cal7').innerHTML = byRank.map(function (e) { var nums = (e[7] != null || e[8] != null || e[9] != null) ? '<div class="k">' + (e[9] != null && e[9] !== '' ? 'Actual ' + esc(e[9]) + ' · ' : '') + 'Forecast ' + esc(e[7] == null ? 'n/a' : e[7]) + ' · Prior ' + esc(e[8] == null ? 'n/a' : e[8]) + '</div>' : ''; return '<div class="r"><span>' + esc(e[1]) + '<div class="k">' + esc(e[2]) + '</div></span><span>' + (e[4] >= 3 ? '<b>' : '') + lite(e[3]) + (e[4] >= 3 ? '</b>' : '') + (e[6] ? ' <span class="cat">' + esc(e[6]) + '</span>' : '') + nums + '</span></div>' }).join('') || '<div class="r mut">Nothing scheduled.</div>';
  $('cal7note').textContent = (MODE === 'deep' ? 'All events.' : 'Top 3 by importance; Deep shows all.') + ' Holidays, half days and expirations are computed; data releases, Fed events, auctions and earnings come from the brief' + (B.events7 ? ' (' + B.updatedLabel + ').' : ', which has none yet.');
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
  if (b.n) h += '<div class="r"><span>Perp sample: stock perps up <span class="k">' + b.n + ' US listed stocks, not exchange breadth, vs ' + basisDef('perp')[1].toLowerCase() + ', live</span></span><b class="num">' + b.up + ' of ' + b.n + ' (' + b.pct.toFixed(0) + '%)</b></div><div class="r"><span>Perp sample median vs S&amp;P perp</span><b class="num">' + (isNum(b.med) && isNum(chgOf('xyz:SP500', 'perp')) ? sg(b.med - chgOf('xyz:SP500', 'perp')) : 'n/a') + '</b></div>';
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
    if (b.n >= 30 && isNum(spx)) verdict = (spx > 0 && b.pct < 50 ? 'In the perp sample, fewer than half of stocks are up while the S&P perp is up.' : spx < 0 && b.pct > 55 ? 'In the perp sample, most stocks are up while the S&P perp is down.' : b.pct >= 65 && spx > 0 ? 'In the perp sample, participation is broad.' : b.pct <= 35 && spx < 0 ? 'In the perp sample, selling is broad.' : 'The perp sample roughly matches the index.') + (B.internals && B.internals.length ? '' : ' Exchange breadth is not in this brief, so the whole market is not measured here.');
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
function etCloseMs(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10); return etMs(y, m, d, HALF[iso] ? 13 : 16, 0) }
function scorecard() {
  if (!MEM) return;
  var briefs = MEM.filter(function (e) { return e.kind === 'brief' }).slice(0, 200);
  Promise.all([loadHist(['SPX'])].concat(briefs.map(function (e) { return fetch('archive/' + e.file, { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null }).catch(function () { return null }) }))).then(function (res) {
    var S = HIST.SPX, docs = res.slice(1).filter(Boolean), sc = CORE.scoreForecasts(docs, S, etCloseMs), dir = sc.dir, cov = sc.cov, h = '';
    h += '<div class="r"><b>Directional calls</b><div class="k">' + (dir.n ? dir.hit + ' of ' + dir.n + ' sessions called right (' + (dir.hit / dir.n * 100).toFixed(0) + '%, range ' + (CORE.wilson(dir.hit, dir.n)[0] * 100).toFixed(0) + ' to ' + (CORE.wilson(dir.hit, dir.n)[1] * 100).toFixed(0) + '%). Calling up every time: ' + (dir.up / dir.n * 100).toFixed(0) + '%. ' : 'No session scored yet. Briefs record one call per session from now on. ') + (dir.revisions ? dir.revisions + ' later briefs revised a call for the same session; only the last call made before that session closed is scored, so revisions do not inflate the count. ' : '') + (dir.pend ? dir.pend + ' sessions pending.' : '') + '</div></div>';
    var byR = {}; dir.rows.forEach(function (r) { if (!r.regime) return; byR[r.regime] = byR[r.regime] || [0, 0]; byR[r.regime][0]++; if (r.hit) byR[r.regime][1]++ });
    if (Object.keys(byR).length) h += '<div class="r k">By regime: ' + Object.keys(byR).map(function (k) { return esc(k) + ' ' + byR[k][1] + ' of ' + byR[k][0] }).join(', ') + '</div>';
    h += '<div class="r"><b>Implied move coverage</b><div class="k">' + (cov.n ? cov.hit + ' of ' + cov.n + ' expiries closed inside the implied move (' + (cov.hit / cov.n * 100).toFixed(0) + '%); about 68% is what a one standard deviation move implies. Windows that overlap share the same market moves, so the effective sample is ' + cov.eff + ' (' + cov.effHit + ' inside' + (cov.eff ? ', range ' + (CORE.wilson(cov.effHit, cov.eff)[0] * 100).toFixed(0) + ' to ' + (CORE.wilson(cov.effHit, cov.eff)[1] * 100).toFixed(0) + '%' : '') + '). By horizon: ' + Object.keys(cov.byH).map(function (k) { return esc(k) + ' ' + cov.byH[k][1] + ' of ' + cov.byH[k][0] }).join(', ') + '. ' : 'No expiry has passed yet. ') + (cov.dup ? cov.dup + ' repeat copies from later briefs were collapsed into one outcome per expiry. ' : '') + (cov.pend ? cov.pend + ' expiries pending.' : '') + '</div></div>';
    h += '<div class="r k">Scores read the archive exactly as published and Cboe S&P closes. Fewer than 20 scored sessions says little.</div>';
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

/* ---------- Reversal watch and exhaustion, from completed 5 minute perp candles ---------- */
var REV = null, PS = {};
function loadRev() {
  if (document.hidden) return;
  var bt = B.base && B.base.ts ? new Date(B.base.ts).getTime() : Date.now() - 864e5, coins = ['xyz:SP500', 'xyz:XYZ100', 'xyz:SMH'];
  Promise.all(coins.map(function (c) { return post({ type: 'candleSnapshot', req: { coin: c, interval: '5m', startTime: bt - 8 * 36e5, endTime: Date.now() } }) })).then(function (rs) { REV = analyzeRev(rs, bt, Date.now()); renderRev(); soon() }).catch(function () { });
}
function analyzeRev(rs, bt, now) {
  var ss = session(now).st, o = lastOpenMs(now), from = (ss === 'open' || ss === 'post') && o > bt ? o : bt;
  var all0 = (rs[0] || []).filter(function (c) { return +c.t >= from }), prov = all0.filter(function (c) { return +c.t + 3e5 > now })[0];
  var cut = function (k) { return CORE.completed((k || []).filter(function (c) { return +c.t >= from }), now, 3e5) };
  var K = cut(rs[0]), N = cut(rs[1]), M = cut(rs[2]); if (K.length < 12) return null;
  var bo = CORE.completed((rs[0] || []).filter(function (c) { return +c.t >= bt - 6.5 * 36e5 && +c.t < bt }), now, 3e5);
  if (bo.length >= 20) PS = { hi: Math.max.apply(0, bo.map(function (c) { return +c.h })), lo: Math.min.apply(0, bo.map(function (c) { return +c.l })) };
  var em = B.opt && B.opt.em && B.opt.em[0] ? B.opt.em[0][1] : 1, need = Math.max(0.8, em * 0.5);
  var d = CORE.swing(K, 1), u = CORE.swing(K, -1); if (!d || !u) return null;
  var cands = [d, u].filter(function (s) { return !s.ambiguous }); if (!cands.length) return { ambiguous: true };
  var s = cands.sort(function (a, b) { return Math.abs(b.move) - Math.abs(a.move) })[0];
  var res = { from: from, win: from === bt ? 'since the ' + baseDay() + ' close' : 'since the 9:30am open', s: s, need: need, prov: prov, n: K.length };
  if (Math.abs(s.move) < need || (s.rec < 0.15 && s.dir < 0)) { res.label = null; return res }
  var st = CORE.structure(K, s), br = breadth('perp'), gs = Object.keys(br.groups || {}).map(function (k) { return br.groups[k] });
  var semi = null; if (M.length >= 12) { var sm = CORE.swing(M, s.dir); if (sm && !sm.ambiguous) semi = sm }
  var nd = null; if (N.length >= 12) { var nn = CORE.swing(N, s.dir); if (nn && !nn.ambiguous) nd = nn }
  var cl = CORE.classify(s, st, { semiRec: semi ? semi.rec : null, breadthPct: br.n >= 30 ? br.pct : null, mins: (now - s.et) / 60e3, groupSpread: gs.length >= 3 ? Math.max.apply(0, gs) - Math.min.apply(0, gs) : 0 });
  var down = s.dir > 0, ev = [];
  ev.push([down ? 'Decline from the high' : 'Rally from the low', sg(s.move) + ', ' + f(s.peak, 0) + ' to ' + f(s.ext, 0)]);
  ev.push([down ? 'Low in the candle at' : 'High in the candle at', tET(s.et, true) + ', ' + ago(now - s.et) + ' ago']);
  ev.push(['Share of the move retraced', (s.rec * 100).toFixed(0) + '%']);
  ev.push([down ? 'Higher lows since' : 'Lower highs since', String(st.higherLows)]);
  if (st.lastLowerHigh != null) ev.push([down ? 'Last lower high' : 'Last higher low', f(st.lastLowerHigh, 0) + (st.structureBreak ? ', broken' : ', not broken')]);
  if (st.vwap) ev.push(['Perp VWAP ' + res.win, f(st.vwap, 0) + (st.vwapHeld && st.vwapNow ? ', reclaimed and held' : st.vwapNow ? ', above but not yet held 2 candles' : ', not reclaimed')]);
  if (st.volRatio != null) ev.push(['Volume, recovery vs decline candles', (st.volRatio * 100).toFixed(0) + '%, perp volume']);
  if (semi) ev.push(['Semis ETF retraced', (semi.rec * 100).toFixed(0) + '% of ' + sg(semi.move)]);
  if (nd) ev.push(['Nasdaq 100 retraced', (nd.rec * 100).toFixed(0) + '% of ' + sg(nd.move)]);
  var fl = []; (B.opt.levels || []).concat([['Prior session low', PS.lo], ['Prior session high', PS.hi], ['Bull trigger', B.ladder.bull], ['Range floor', B.ladder.floor]]).forEach(function (l) { if (!isNum(l[1])) return; if (down && s.ext < l[1] && s.last > l[1]) fl.push(l[0] + ' ' + f(l[1], 0)); if (!down && s.ext > l[1] && s.last < l[1]) fl.push(l[0] + ' ' + f(l[1], 0)) });
  if (fl.length) ev.push([down ? 'Failed breakdown below' : 'Failed breakout above', fl.slice(0, 3).join(', ')]);
  if (br.n) ev.push(['Perp sample up now', br.pct.toFixed(0) + '% of ' + br.n + ' stock perps, not exchange breadth']);
  res.label = cl.label; res.conf = cl.conf; res.why = cl.why; res.ev = ev; res.mins = (now - s.et) / 60e3;
  res.exh = s.rec < 0.382 ? CORE.exhaustion(K, s, [{ name: 'Semis ETF', K: M }, { name: 'Nasdaq 100', K: N }]) : [];
  return res;
}
function renderRev() {
  var sec = $('secRev'); if (!REV || !REV.label) { sec.style.display = 'none'; return } sec.style.display = '';
  var r = REV, down = r.s.dir > 0, tone = /sustainable reversal$|Broad recovery/.test(r.label) ? 'g' : /lower|Broad fade/.test(r.label) ? 'r' : 'a';
  $('revasof').textContent = 'S&P perp, ' + r.win + ', ' + r.n + ' completed candles';
  var h = '<div class="r full"><span class="pill ' + tone + '">' + esc(r.label) + '</span> <span class="k">' + (r.s.rec * 100).toFixed(0) + '% of the ' + sg(r.s.move) + ' move retraced since the ' + (down ? 'low' : 'high') + ' at ' + tET(r.s.et, true) + '. Confirmation ' + r.conf + ' of 5' + (r.why.length ? ': ' + esc(r.why.join(', ')) : '') + '.</span></div>';
  if (r.exh && r.exh.length) h += '<div class="r full"><b>Exhaustion signs, ' + r.exh.length + ' of 6</b><div class="k">' + r.exh.map(esc).join('. ') + '. These suggest the ' + (down ? 'selling' : 'buying') + ' is losing force; none of them is a reversal by itself.</div></div>';
  h += r.ev.map(function (e) { return '<div class="r xd"><span>' + esc(e[0]) + '</span><b class="num">' + esc(e[1]) + '</b></div>' }).join('');
  if (r.prov) h += '<div class="r xd k">Current candle (' + tET(+r.prov.t) + ') is still forming and is not used above.</div>';
  h += '<div class="r full k xd">Rules: retraced under 38% is a bounce, 38 to 62% partial. Above 62%, 4 of 5 confirmations (higher low, structure break, VWAP held, semis half back, perp sample breadth) and 30 minutes held is a potential sustainable reversal. The order of a high and low inside one candle is unknown, so a peak and trough in the same candle are not counted. Nothing here shows who was buying or why.</div>';
  $('rev').innerHTML = h;
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

/* ---------- Outlook: the active scenario, the nearest levels and what invalidates it ---------- */
function renderOutlook() {
  var s = px('xyz:SP500'); if (!s) return; var zn = zoneOf(s), name = zn === 'Bull' ? 'Bullish' : zn === 'Range' ? 'Neutral' : 'Bearish';
  var sc = (B.scenarios || []).filter(function (x) { return x.n === name })[0] || { n: name, cond: zn === 'Bull' ? 'Holds above ' + f(B.ladder.bull, 0) : zn === 'Range' ? 'Between ' + f(B.ladder.floor, 0) + ' and ' + f(B.ladder.bull, 0) : 'Below ' + f(B.ladder.floor, 0), inval: zn === 'Bull' ? 'Back below ' + f(B.ladder.bull, 0) : zn === 'Risk' ? 'Back above ' + f(B.ladder.floor, 0) : 'A close outside ' + f(B.ladder.floor, 0) + ' to ' + f(B.ladder.bull, 0), text: zn === 'Bull' ? B.ladder.bullText : zn === 'Range' ? B.ladder.rangeText : B.ladder.riskText };
  var L = allLevels(), up = L.filter(function (l) { return l[1] > s }).slice(-2).reverse(), dn = L.filter(function (l) { return l[1] < s }).slice(0, 2), e0 = B.opt.em && B.opt.em[0], h = '';
  h += '<div class="r full"><span class="pill ' + (zn === 'Bull' ? 'g' : zn === 'Range' ? 'a' : 'r') + '">' + name + ' scenario active</span> <span class="k">S&amp;P perp ' + f(s, 0) + ', ' + freshTxt('xyz:SP500') + '</span><div style="margin-top:4px">' + lite(sc.text || sc.cond) + '</div></div>';
  h += '<div class="r"><span>Next above</span><b class="num">' + up.map(function (l) { return esc(l[0]) + (/\d/.test(l[0]) ? '' : ' ' + f(l[1], 0)) + ' (' + pts(l[1] - s) + ')' }).join(', ') + '</b></div><div class="r"><span>Next below</span><b class="num">' + dn.map(function (l) { return esc(l[0]) + (/\d/.test(l[0]) ? '' : ' ' + f(l[1], 0)) + ' (' + pts(l[1] - s) + ')' }).join(', ') + '</b></div>';
  if (e0) { var u = CORE.emUsed(B.opt.base, e0[1], s); h += '<div class="r"><span>Priced in to ' + esc(e0[2]) + '</span><b class="num">±' + e0[1].toFixed(2) + '%, ' + Math.abs(u.used).toFixed(0) + '% of the ' + (u.used >= 0 ? 'up' : 'down') + ' move used</b></div>' }
  if (sc.confirm) h += '<div class="r"><span>Confirms</span><span>' + lite(sc.confirm) + '</span></div>';
  h += '<div class="r full"><b class="dn">Invalid if</b> ' + lite(sc.inval || 'not set in this brief') + (sc.risk ? '<div class="k">Risk: ' + lite(sc.risk) + '</div>' : '') + '</div>';
  $('outlook').innerHTML = h; $('outasof').textContent = 'Levels from ' + (B.updatedLabel || '');
}
var _render2 = render;
render = function () { _render2(); try { renderOutlook() } catch (e) { } };

/* ---------- Is the brief's analysis still valid? Checked against the S&P perp at publication time ---------- */
var PUB = null;
function loadPub() {
  if (!B.updated) return; var t = new Date(B.updated).getTime(), t5 = t - t % 3e5; if (PUB && PUB.t === t5) return;
  post({ type: 'candleSnapshot', req: { coin: 'xyz:SP500', interval: '5m', startTime: t5, endTime: t5 + 3e5 } }).then(function (k) { var c = (k || []).filter(function (z) { return +z.t === t5 })[0]; if (c) { PUB = { t: t5, px: +c.o }; renderInval() } }).catch(function () { });
}
function invalItems() {
  var s = px('xyz:SP500'), items = []; if (!PUB || !s || !fresh('xyz:SP500')) return items;
  var z0 = zoneOf(PUB.px), z1 = zoneOf(s), e0 = B.opt.em && B.opt.em[0], mv = (s / PUB.px - 1) * 100;
  if (z0 !== z1) items.push('The brief was written in the <b>' + z0 + '</b> zone (S&amp;P perp ' + f(PUB.px, 0) + '); it is now in the <b>' + z1 + '</b> zone (' + f(s, 0) + '). Its scenario no longer applies.');
  var name = z0 === 'Bull' ? 'Bullish' : z0 === 'Range' ? 'Neutral' : 'Bearish', sc = (B.scenarios || []).filter(function (q) { return q.n === name })[0];
  if (sc && sc.inval) { var m = String(sc.inval).match(/([\d,]{4,})/); if (m) { var L = +m[1].replace(/,/g, ''); if ((PUB.px - L) * (s - L) < 0) items.push('Crossed the brief\'s invalidation level ' + f(L, 0) + ': "' + esc(sc.inval) + '".') } }
  if (e0) { var daily = e0[1]; if (Math.abs(mv) >= daily * 0.75) items.push('The S&amp;P perp moved ' + sg(mv) + ' since the brief, ' + (Math.abs(mv) / daily * 100).toFixed(0) + '% of the nearest implied move, so its levels may be stale.') }
  var gf = gammaFlip(); if (gf && (PUB.px - gf) * (s - gf) < 0) items.push('Crossed the gamma flip ' + f(gf, 0) + ' since the brief (estimate from open interest).');
  if (REV && REV.label && /sustainable/.test(REV.label)) items.push('A ' + esc(REV.label.toLowerCase()) + ' is forming, see Reversal watch.');
  return items;
}
function renderInval() { renderDecision() }

/* ---------- Decision: six questions, validated evidence only ---------- */
var DEC = { t: 0, w: null, i: null, reg: null };
function scenarioNow(s) {
  var zn = zoneOf(s), name = zn === 'Bull' ? 'Bullish' : zn === 'Range' ? 'Neutral' : 'Bearish';
  return (B.scenarios || []).filter(function (x) { return x.n === name })[0] || { n: name, inval: zn === 'Bull' ? 'Back below ' + f(B.ladder.bull, 0) : zn === 'Risk' ? 'Back above ' + f(B.ladder.floor, 0) : 'A close outside ' + f(B.ladder.floor, 0) + ' to ' + f(B.ladder.bull, 0) };
}
function loadDecision() {
  if (Date.now() - DEC.t < 120e3) return; DEC.t = Date.now();
  loadRes('registry').then(function (R) { DEC.reg = R; var ws = ['SPY', 'QQQ', 'SMH', 'NVDA'];
    return Promise.all(ws.map(function (s) { return weeklyState(s).catch(function () { return null }) })).then(function (W) { DEC.w = W.filter(Boolean); renderDecision() });
  }).catch(function () { });
  liveSession('SPY').catch(function () { return null }).then(function (live) { var sl = live ? curSlot(live) : null; if (!sl) { DEC.i = null; return } return intraState('SPY', sl, live).then(function (S) { DEC.i = S && !S.wait ? S : null; renderDecision() }) }).catch(function () { });
}
/* material developments: brief stories marked material, and live headlines whose measured reaction was large for that asset */
function materialItems() {
  var out = [];
  (B.stories || []).forEach(function (s) { if (s.material) out.push({ ts: 0, t: s.t, h: s.h, txt: s.changes || s.why || '', src: s.src, impl: s.impl, brief: true }) });
  (WIRE.items || []).forEach(function (n) { var key = n.ts + '|' + n.h.slice(0, 30), im = WIRE.imp[key]; if (!im || !im.w) return; var mv = isNum(im.w[15]) ? im.w[15] : im.w[5], w = isNum(im.w[15]) ? 15 : 5, m = CORE.materiality(n.s, mv, im.lbl); if (!m.material) return;
    out.push({ ts: n.ts, t: fmtT(n.ts), h: n.h, txt: esc(im.lbl) + ' ' + sg(mv) + ' in ' + w + ' minutes, ' + m.z.toFixed(1) + ' times a typical move', src: n.url, mv: mv, lbl: im.lbl, z: m.z }) });
  return out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0) }).slice(0, 3);
}
function renderDecision() {
  var el = $('dec'); if (!el) return; var s = px('xyz:SP500') || null;
  var D = B.daily || null, GP = {}; (B.gaps || []).forEach(function (g) { GP[g[0]] = g[1] });
  var inv = invalItems(), mats = materialItems(), h = '', missing = [], row = function (q, a, note) { if (a.indexOf('\u0001') === 0) { missing.push(q.toLowerCase() + (a.length > 1 ? ' (' + a.slice(1) + ')' : '')); return } h += '<div class="r full"><span class="k">' + q + (note ? ' <span class="mut">' + note + '</span>' : '') + '</span><div>' + a + '</div></div>' };
  var miss = function (k) { return '\u0001' + (GP[k] ? esc(GP[k]) : '') }, der = 'derived';
  /* material moves against the brief's call also invalidate it */
  var fdir = B.forecast && B.forecast.dir; mats.forEach(function (m) { if (fdir && m.z >= 2 && /SPY|SPX|QQQ|NDX/.test(m.lbl || '') && ((fdir === 'up' && m.mv < 0) || (fdir === 'down' && m.mv > 0))) inv.push('Material headline moved ' + esc(m.lbl) + ' ' + sg(m.mv) + ' against the brief\'s ' + fdir + ' call: "' + esc(m.h) + '".') });
  row('What happened', D && D.happened ? lite(D.happened) : lite(B.lede || B.headline || ''), D && D.happened ? '' : der);
  row('What caused it', D && D.cause ? lite(D.cause) + (D.causeSrc ? ' <a href="' + esc(D.causeSrc) + '" target="_blank" rel="noopener noreferrer">source</a>' : '') : (B.top3 && B.top3[0] ? '<b>' + lite(B.top3[0][0]) + '.</b> ' + lite(B.top3[0][1]) : miss('daily')), D && D.cause ? '' : (B.top3 ? 'top development, no sourced cause stated' : ''));
  var chg = s ? 'S&amp;P perp ' + f(s, 0) + ', ' + sg((s / B.base.spx - 1) * 100) + ' vs the last close' + (PUB ? ', ' + sg((s / PUB.px - 1) * 100) + ' since this brief' : '') + '.' : 'Live prices unavailable right now.';
  row('Since the previous briefing', (inv.length ? '<b class="dn">' + inv[0] + '</b> ' : '') + (D && D.since ? lite(D.since) + ' ' : '') + '<span class="k">' + chg + '</span>');
  if (mats.length) row('Material developments', mats.map(function (m) { return '<b>' + esc(m.t) + '</b> ' + (m.src ? '<a href="' + esc(m.src) + '" target="_blank" rel="noopener noreferrer">' + esc(m.h) + '</a>' : esc(m.h)) + (m.txt ? ' <span class="k">' + (m.brief ? lite(m.txt) : m.txt) + '</span>' : '') }).join('<br>'));
  var ex = D && D.expected && D.expected.length ? D.expected : ((B.priced && B.priced.data) || []).filter(function (r) { return r[4] }).map(function (r) { return [r[0], r[2], r[4], ''] });
  row('Expected vs actual', ex.length ? ex.slice(0, 4).map(function (r) { return esc(r[0]) + ': expected ' + esc(r[1]) + ', actual <b>' + esc(r[2]) + '</b>' }).join('<br>') : (D ? 'Nothing released since the previous brief.' : miss('daily')), D && D.expected && D.expected.length ? '' : (ex.length ? der : ''));
  var af = D && D.affected && D.affected.length ? D.affected.map(function (r) { return '<span class="' + (r[1] === 'up' ? 'up' : r[1] === 'down' ? 'dn' : '') + '">' + esc(r[0]) + '</span> ' + lite(r[2]) }) : (B.stories || []).slice(0, 3).map(function (x) { return esc(x.assets) + ': ' + lite(x.h) });
  row('Stocks and sectors affected', af.length ? af.join('<br>') : miss('daily'), D && D.affected ? '' : (af.length ? der : ''));
  var pr = D && D.priced ? lite(D.priced) : '', e0 = B.opt.em && B.opt.em[0]; if (!pr && e0) pr = 'Options price ±' + e0[1].toFixed(2) + '% to ' + esc(e0[2]) + '.';
  row('Already priced in', pr || miss('priced'), D && D.priced ? '' : (pr ? der : ''));
  var cat = D && D.catalysts && D.catalysts.length ? D.catalysts.map(function (c) { return '<b>' + esc(c[0]) + '</b> ' + lite(c[1]) + (c[2] ? ' <span class="k">' + lite(c[2]) + '</span>' : '') }) : (B.events7 || []).filter(function (e) { return e[3] >= 3 }).slice(0, 3).map(function (e) { return '<b>' + esc(e[0].slice(5) + ' ' + e[1]) + '</b> ' + esc(e[2]) });
  row('Next catalysts', cat.length ? cat.slice(0, 3).join('<br>') : miss('events7'), D && D.catalysts ? '' : (cat.length ? der : ''));
  var sc = s ? scenarioNow(s) : {}; row('What would invalidate the outlook', D && D.invalid ? lite(D.invalid) : (sc.inval ? lite(sc.inval) : miss('daily')), D && D.invalid ? '' : (sc.inval ? der : ''));
  /* research: only promoted signals */
  var nx = [], ev = [];
  (DEC.w || []).forEach(function (W) { if (W.fri) return; var cn = I2PERP[W.sym], pb = B.base && B.base.perp && B.base.perp[cn], lv = cn && px(cn) && fresh(cn) && pb ? W.s.c * px(cn) / pb : null; Object.keys(W.out).forEach(function (o) { var q = W.out[o]; if (!q.validated || Math.abs(q.p - 0.5) < 0.15) return; if (lv && ((o === 'highSet' && lv > W.s.hi) || (o === 'lowSet' && lv < W.s.lo))) return; nx.push(W.sym + ' this week: ' + q.name.toLowerCase() + ', ' + pc(q.p)); var g = (DEC.reg && DEC.reg.signals || []).filter(function (x) { return x.name === W.sym + ' weekly: ' + q.name })[0]; if (g) ev.push(esc(g.name) + ': ' + esc(g.oos) + ', ' + esc(g.ci)) }) });
  if (DEC.i) CORE.OUT2.forEach(function (o) { var q = DEC.i.out[o]; if (q.promoted && !q.blocked) nx.push('SPY today: ' + DEC.i.W.outcomes[o].name.toLowerCase() + ' ' + pc(q.p)) });
  row('Research signals', nx.length ? nx.slice(0, 3).join('<br>') + (ev.length ? '<div class="k">' + ev.slice(0, 2).join('<br>') + '</div>' : '') : 'None qualifies today. A signal shows here only after it beats its benchmark out of sample and makes money after costs; History has the full record.');
  var dn = [];
  if (s && DEC.i && DEC.i.q && DEC.i.src !== 'perp') dn.push('Rest of today: 1 in 10 similar sessions fell another ' + Math.abs(DEC.i.q.dn[0]).toFixed(2) + '% or more (S&amp;P ' + f(s * (1 + DEC.i.q.dn[0] / 100), 0) + ')');
  var ws = (DEC.w || []).filter(function (W) { return W.sym === 'SPY' && !W.fri && W.rng })[0]; if (ws) dn.push('Rest of this week: 1 in 10 similar weeks fell another ' + Math.abs(ws.rng.dn[0]).toFixed(2) + '% or more');
  if (e0) dn.push('Options price ±' + e0[1].toFixed(2) + '% to ' + esc(e0[2]));
  row('Realistic downside', dn.length ? dn.join('<br>') : 'n/a');
  if (missing.length) h += '<div class="r full k">Not in this update: ' + missing.join(', ') + '.</div>';
  if (inv.length > 1) h += inv.slice(1).map(function (x) { return '<div class="r full k">' + x + '</div>' }).join('');
  if (D && D.asofTs) h += '<div class="r full k">Briefing as of ' + esc(tET(new Date(D.asofTs).getTime(), true)) + '.</div>';
  el.innerHTML = h; $('secDec').style.display = '';
  loadDecision();
}
var _applyBrief4 = applyBrief;
applyBrief = function (nb) { _applyBrief4(nb); PUB = null; try { loadPub() } catch (e) { } };
var _render3 = render;
render = function () { _render3(); try { renderInval() } catch (e) { } };
