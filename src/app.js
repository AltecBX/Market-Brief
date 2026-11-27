'use strict';
/* Market Brief. Live data: Hyperliquid (perps, websocket plus REST), Unusual Whales (news, with a token kept on the device).
   Scheduled data: brief.json. Every number on screen has a source, a time and a comparison basis. */
var DEF = {{BRIEF}};
var B = DEF, BRIEF_V = '';
var $ = function (i) { return document.getElementById(i) };
function LS(k, v) { try { if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null } localStorage.setItem(k, JSON.stringify(v)) } catch (e) { return null } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
function lite(s) { return esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>') }
function isNum(x) { return typeof x === 'number' && isFinite(x) }
function f(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function dp(v) { v = Math.abs(+v); return v >= 1000 ? 1 : v >= 10 ? 2 : v >= 1 ? 3 : 4 }
function sg(v, d) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 2 : d) + '%' }
function pts(v, d) { var k = Math.pow(10, d == null ? 0 : d), r = Math.round(v * k) / k; return (r >= 0 ? '+' : '−') + f(Math.abs(r), d == null ? 0 : d) }
function chgHtml(v, cls) { if (!isNum(v)) return '<span class="chg ' + (cls || '') + '">n/a</span>'; return '<span class="chg ' + (cls || '') + ' ' + (v >= 0 ? 'u' : 'd') + '">' + sg(v) + '</span>' }
function ago(ms) { var s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + 's'; var m = Math.round(s / 60); if (m < 60) return m + 'm'; var h = Math.floor(m / 60); if (h < 48) return h + 'h ' + (m % 60) + 'm'; return Math.round(h / 24) + 'd' }

/* ---------- Eastern time and the US market calendar ---------- */
var ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
function et(ms) { var o = {}; ETF.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value }); return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: o.weekday, key: o.year + '-' + o.month + '-' + o.day } }
function etOff(ms) { var p = et(ms); return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000) }
function etMs(y, m, d, h, mi) { var g = Date.UTC(y, m - 1, d, h, mi); var t = g - etOff(g) * 60000; return g - etOff(t) * 60000 }
function tET(ms, withDay) { var s = new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', ''); if (withDay) { var p = et(ms), n = et(Date.now()); if (p.key !== n.key) s = p.wd + ' ' + s } return s }
/* NYSE full closures and 1pm early closes. Check against the NYSE calendar each December. */
var HOL = { '2026-01-01': 'New Year', '2026-01-19': 'MLK Day', '2026-02-16': 'Presidents Day', '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day', '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas',
  '2027-01-01': 'New Year', '2027-01-18': 'MLK Day', '2027-02-15': 'Presidents Day', '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth', '2027-07-05': 'Independence Day', '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving', '2027-12-24': 'Christmas' };
var HALF = { '2026-11-27': 1, '2026-12-24': 1, '2027-11-26': 1 };
function isTradingDay(p) { return p.wd !== 'Sat' && p.wd !== 'Sun' && !HOL[p.key] }
function session(ms) {
  var p = et(ms), mins = p.h * 60 + p.mi, half = !!HALF[p.key], close = half ? 13 * 60 : 16 * 60;
  if (p.wd === 'Sat' || p.wd === 'Sun') return { st: 'closed', txt: 'US stocks closed, weekend' };
  if (HOL[p.key]) return { st: 'closed', txt: 'US stocks closed, ' + HOL[p.key] };
  var hd = half ? ', half day, closes 1:00pm' : '';
  if (mins < 240) return { st: 'closed', txt: 'US stocks closed, premarket at 4:00am' + hd };
  if (mins < 570) return { st: 'pre', txt: 'Premarket, opens 9:30am' + hd };
  if (mins < close) return { st: 'open', txt: 'US stocks open' + (half ? ', half day, closes 1:00pm' : ', closes 4:00pm') };
  if (mins < (half ? 17 * 60 : 20 * 60)) return { st: 'post', txt: 'After hours' };
  return { st: 'closed', txt: 'US stocks closed' };
}
function lastOpenMs(ms) { for (var i = 0; i < 10; i++) { var p = et(ms - i * 864e5); if (!isTradingDay(p)) continue; var t = etMs(p.y, p.m, p.d, 9, 30); if (t <= ms) return t } return null }
function last6pmMs(ms) { for (var i = 0; i < 8; i++) { var p = et(ms - i * 864e5); if (p.wd === 'Fri' || p.wd === 'Sat') continue; var t = etMs(p.y, p.m, p.d, 18, 0); if (t <= ms) return t } return null }

/* ---------- Instruments, verified against provider metadata ---------- */
var INS = [['xyz:SP500', 'S&P 500', 'idx'], ['xyz:XYZ100', 'Nasdaq 100', 'idx'], ['xyz:JP225', 'Nikkei 225', 'idx'], ['xyz:KR200', 'Kospi 200', 'idx'],
  ['xyz:NVDA', 'Nvidia', 'semi'], ['xyz:AMD', 'AMD', 'semi'], ['xyz:MU', 'Micron', 'semi'], ['xyz:SNDK', 'SanDisk', 'semi'], ['xyz:WDC', 'Western Digital', 'semi'], ['xyz:STX', 'Seagate', 'semi'], ['xyz:AVGO', 'Broadcom', 'semi'], ['xyz:TSM', 'TSMC', 'semi'], ['xyz:ASML', 'ASML', 'semi'], ['xyz:LRCX', 'Lam Research', 'semi'], ['xyz:AMAT', 'Applied Materials', 'semi'], ['xyz:SMH', 'Semis ETF', 'semi'], ['xyz:SKHX', 'SK Hynix', 'semi'], ['xyz:SMSN', 'Samsung', 'semi'], ['xyz:KIOXIA', 'Kioxia', 'semi'],
  ['xyz:ORCL', 'Oracle', 'mega'], ['xyz:AAPL', 'Apple', 'mega'], ['xyz:MSFT', 'Microsoft', 'mega'], ['xyz:GOOGL', 'Alphabet', 'mega'], ['xyz:AMZN', 'Amazon', 'mega'], ['xyz:META', 'Meta', 'mega'], ['xyz:TSLA', 'Tesla', 'mega'],
  ['xyz:GOLD', 'Gold', 'macro'], ['xyz:SILVER', 'Silver', 'macro'], ['xyz:BRENTOIL', 'Brent oil', 'macro'], ['xyz:CL', 'WTI oil', 'macro'], ['xyz:COPPER', 'Copper', 'macro'], ['xyz:JPY', 'USD/JPY', 'macro'], ['xyz:EUR', 'EUR/USD', 'macro'],
  ['BTC', 'Bitcoin', 'cry'], ['ETH', 'Ether', 'cry'], ['SOL', 'Solana', 'cry']];
var NOT_ON_PROVIDER = ['KLAC', 'SOXX'];
var INSN = {}; INS.forEach(function (r) { INSN[r[0]] = r });
var KEY = ['xyz:SP500', 'xyz:XYZ100', 'xyz:JP225', 'xyz:KR200', 'xyz:NVDA', 'xyz:MU', 'xyz:SMH', 'xyz:GOLD', 'xyz:BRENTOIL', 'BTC'];
var BREADTH = 'TSLA NVDA HOOD INTC PLTR COIN META AAPL MSFT ORCL GOOGL AMZN AMD MU SNDK MSTR CRCL NFLX COST LLY TSM RIVN BABA CRWV GME HIMS DKNG LITE BX MRVL RKLB ZM EBAY ARM ASML DELL IBM AVGO NOW NBIS WDC NOK BE QCOM AMAT GEV IREN NET CRWD RDDT AAOI MRNA CVX LRCX UMC GLW TTWO ICE PANW SMCI RBLX SNOW STX'.split(' ').map(function (s) { return 'xyz:' + s });
var GROUPS = { Semis: 'NVDA AMD MU SNDK AVGO TSM ASML LRCX AMAT QCOM MRVL ARM WDC INTC', Megacap: 'AAPL MSFT GOOGL AMZN META NVDA TSLA', Software: 'ORCL NOW CRWD NET PANW', Crypto: 'COIN MSTR HOOD CRCL IREN', Energy: 'CVX GEV BE' };
var WANT = {}; INS.forEach(function (r) { WANT[r[0]] = 1 }); BREADTH.forEach(function (c) { WANT[c] = 1 });
var Q = {}, LISTED = {}, FEED = {}, LASTOK = 0, CACHED = false;
(function () { var c = LS('mb_q'); if (c && c.q && Date.now() - c.t < 7 * 864e5) { Q = c.q; LASTOK = 0; CACHED = c.t; for (var k in Q) Q[k].cached = true } })();
function saveQ() { var o = {}; for (var k in Q) { var q = Q[k]; o[k] = { mid: q.mid, mark: q.mark, oracle: q.oracle, ref24: q.ref24, fund: q.fund, oi: q.oi, vol: q.vol, imp: q.imp, ts: q.ts } } LS('mb_q', { t: Date.now(), q: o }) }
function post(b) { return fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }) }
var FRESH = 45e3;
function fresh(id) { var q = Q[id]; return !!(q && !q.cached && q.ts && Date.now() - q.ts < FRESH) }
function px(id) { var q = Q[id]; return q && isNum(q.mid) ? q.mid : null }

function pullRest() {
  if (document.hidden) return;
  var t0 = Date.now(), parts = [['xyz', { type: 'metaAndAssetCtxs', dex: 'xyz' }], ['crypto', { type: 'metaAndAssetCtxs' }]];
  Promise.allSettled(parts.map(function (p) { return post(p[1]) })).then(function (res) {
    var ok = 0;
    res.forEach(function (r, i) {
      var name = parts[i][0];
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) { FEED[name] = { ok: false, t: t0, err: String(r.reason || 'bad response') }; return }
      var x = r.value; ok++;
      x[0].universe.forEach(function (u, j) {
        if (!WANT[u.name]) return;
        var c = x[1][j];
        if (u.isDelisted) { LISTED[u.name] = 'delisted'; delete Q[u.name]; return }
        if (!c || !c.markPx) { LISTED[u.name] = 'noprice'; return }
        LISTED[u.name] = 'ok';
        var q = Q[u.name] || (Q[u.name] = {});
        q.mark = +c.markPx; q.oracle = +c.oraclePx; q.ref24 = +c.prevDayPx; q.fund = +c.funding; q.oi = +c.openInterest; q.vol = +c.dayNtlVlm; q.imp = c.impactPxs ? c.impactPxs.map(Number) : null; q.cached = false;
        if (!q.wsTs || t0 - q.wsTs > 20e3) { q.mid = +(c.midPx || c.markPx); q.ts = t0; q.src = 'REST' }
      });
      FEED[name] = { ok: true, t: t0 };
    });
    if (ok) { LASTOK = Date.now(); CACHED = false; saveQ() }
    INS.concat(BREADTH.map(function (c) { return [c] })).forEach(function (r) { if (!LISTED[r[0]] && FEED.xyz && FEED.xyz.ok && FEED.crypto && FEED.crypto.ok) LISTED[r[0]] = 'missing' });
    render(); if (ok) ensureBases();
  }).catch(function () { render() });
}
var WS = null, WSOK = false, wsTry = 0, wsHideT = null;
function wsOpen() {
  if (WS || document.hidden || !window.WebSocket) return;
  try { WS = new WebSocket('wss://api.hyperliquid.xyz/ws') } catch (e) { WS = null; return }
  WS.onopen = function () { wsTry = 0; WSOK = true; WS.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids', dex: 'xyz' } })); WS.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } })) };
  WS.onmessage = function (e) { var j; try { j = JSON.parse(e.data) } catch (x) { return } if (!j || j.channel !== 'allMids' || !j.data || !j.data.mids) return; var m = j.data.mids, t = Date.now(), n = 0;
    for (var k in m) { if (!WANT[k] || LISTED[k] === 'delisted') continue; var v = +m[k]; if (!isFinite(v) || v <= 0) continue; var q = Q[k] || (Q[k] = {}); q.mid = v; q.ts = t; q.wsTs = t; q.src = 'stream'; q.cached = false; n++ }
    if (n) { LASTOK = t; CACHED = false; soon() } };
  WS.onclose = function () { WS = null; WSOK = false; if (!document.hidden) { wsTry = Math.min(wsTry + 1, 6); setTimeout(wsOpen, 1000 * Math.pow(2, wsTry)) } };
  WS.onerror = function () { try { WS.close() } catch (e) { } };
}
var rT = 0, rPend = false;
function soon() { if (rPend) return; rPend = true; setTimeout(function () { rPend = false; render() }, Math.max(0, 900 - (Date.now() - rT))) }

/* ---------- Comparison bases. One basis at a time, always labeled, never substituted ---------- */
var BASIS = LS('mb_basis') || 'perp', CAND = LS('mb_cand') || {}, PEND = {};
function baseDay() { try { return et(new Date(B.base.ts).getTime()).wd } catch (e) { return '' } }
function basisDefs() {
  var d = baseDay(), al = (B.anchor && B.anchor.label) || 'Anchor';
  return [['perp', 'Perp at ' + d + ' close', 'vs the perp price at the ' + d + ' cash close'], ['close', d + ' cash close', 'vs the ' + d + ' cash close, stocks and indexes only'], ['anchor', al, (al + ', from the last scheduled update').toLowerCase()], ['o930', '9:30 open', 'vs the perp at the last 9:30am cash open'], ['o18', '6pm open', 'vs the perp at the last 6pm ET futures open'], ['h1', 'This hour', 'vs the perp at the top of this hour'], ['ref24', '24h', 'vs the provider price 24 hours ago']];
}
function basisDef(k) { return basisDefs().filter(function (b) { return b[0] === k })[0] || basisDefs()[0] }
function basisTime(k) { var n = Date.now(); if (k === 'o930') return lastOpenMs(n); if (k === 'o18') return last6pmMs(n); if (k === 'h1') return n - n % 36e5; if (k === 'perp') return B.base && B.base.ts ? new Date(B.base.ts).getTime() : null; if (k === 'anchor') return B.anchor && B.anchor.ts ? new Date(B.anchor.ts).getTime() : null; return null }
function basePx(k, id) {
  var v = null;
  if (k === 'close') v = (B.base.closes || {})[id];
  else if (k === 'perp') v = (B.base.perp || {})[id];
  else if (k === 'anchor') v = (B.anchor.prices || {})[id];
  else if (k === 'ref24') v = Q[id] && Q[id].ref24;
  if (isNum(v) && v > 0) return v;
  if (k === 'close' || k === 'ref24') return null;
  var T = basisTime(k); if (!T) return null; var c = CAND[T]; return c && isNum(c[id]) ? c[id] : null;
}
function chgOf(id, k) { var p = px(id), b = basePx(k || BASIS, id); return isNum(p) && isNum(b) ? (p / b - 1) * 100 : null }
function ensureBases() {
  var need = [BASIS, 'perp'];
  need.forEach(function (k) {
    var T = basisTime(k); if (!T || k === 'close' || k === 'ref24') return;
    var ids = (k === BASIS ? visibleIds() : []).concat(k === 'perp' ? BREADTH.concat(KEY) : []);
    ids = ids.filter(function (id, i) { return ids.indexOf(id) === i && LISTED[id] === 'ok' && !isNum(basePx(k, id)) && !PEND[T + id] });
    ids.slice(0, 40).forEach(function (id, i) {
      PEND[T + id] = 1;
      setTimeout(function () {
        var t5 = T - T % 3e5;
        post({ type: 'candleSnapshot', req: { coin: id, interval: '5m', startTime: t5, endTime: t5 + 3e5 } }).then(function (cs) {
          var hit = (cs || []).filter(function (c) { return +c.t === t5 })[0];
          if (hit) { (CAND[T] = CAND[T] || {})[id] = +hit.o; pruneCand(); soon() } else delete PEND[T + id];
        }).catch(function () { setTimeout(function () { delete PEND[T + id] }, 30e3) });
      }, i * 120);
    });
  });
}
function pruneCand() { var ks = Object.keys(CAND).sort(); while (ks.length > 8) delete CAND[ks.shift()]; LS('mb_cand', CAND) }

/* ---------- Rendering helpers ---------- */
var hist = {}, grp = 'key', openRow = null, chartCoin = 'xyz:SP500';
function visibleIds() { return INS.filter(function (r) { return grp === 'all' || r[2] === grp || (grp === 'key' && KEY.indexOf(r[0]) >= 0) }).map(function (r) { return r[0] }) }
function spark(a, up) { if (!a || a.length < 3) return '<svg class="spark"></svg>'; var mn = Math.min.apply(0, a), mx = Math.max.apply(0, a), r = mx - mn || 1; var p = a.map(function (v, i) { return (i / (a.length - 1) * 54 + 1).toFixed(1) + ',' + (22 - (v - mn) / r * 20).toFixed(1) }).join(' '); return '<svg class="spark" viewBox="0 0 56 24"><polyline fill="none" stroke="' + (up ? 'var(--gfill)' : 'var(--rfill)') + '" stroke-width="1.5" stroke-linejoin="round" points="' + p + '"/></svg>' }
function money(v) { if (!isNum(v)) return 'n/a'; var a = Math.abs(v); return '$' + (a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)) }
function freshTxt(id) { var q = Q[id]; if (!q || !q.ts) return 'no data'; if (q.cached) return 'cached ' + tET(q.ts, true); var a = Date.now() - q.ts; return a < FRESH ? (q.src === 'stream' ? 'live' : 'live ' + ago(a)) : 'stale ' + ago(a) }

function render() {
  rT = Date.now();
  try { renderStatus() } catch (e) { }
  try { renderStrip() } catch (e) { }
  try { renderBoard() } catch (e) { }
  try { var s = px('xyz:SP500'); if (s) { setSPX(s); renderOpt(s); renderLevels(s); if (!SIMTOUCH) simSet(s) } } catch (e) { }
  try { renderRegime() } catch (e) { }
  try { renderSince() } catch (e) { }
}
function renderStatus() {
  var el = $('status'), t = $('stxt'), a = LASTOK ? Date.now() - LASTOK : null;
  if (!navigator.onLine) { el.className = 'st bad'; t.textContent = 'Offline' + (LASTOK ? ', last ' + tET(LASTOK) : '') }
  else if (a != null && a < FRESH) { el.className = 'st on'; t.textContent = (WSOK ? 'Live' : 'Live ' + tET(LASTOK)) }
  else if (a != null) { el.className = 'st warn'; t.textContent = 'Stale since ' + tET(LASTOK) }
  else if (CACHED) { el.className = 'st warn'; t.textContent = 'Cached ' + tET(CACHED, true) }
  else { el.className = 'st'; t.textContent = 'Loading' }
  $('sess').textContent = session(Date.now()).txt;
}
function lastCloseMs(ms) { for (var i = 0; i < 10; i++) { var p = et(ms - i * 864e5); if (!isTradingDay(p)) continue; var t = etMs(p.y, p.m, p.d, HALF[p.key] ? 13 : 16, 0); if (t <= ms) return t } return null }
/* Freshness: 'session' means the data must come from the latest completed cash session. A number means hours. */
function freshness(ts, rule) {
  var t = ts ? new Date(ts).getTime() : NaN; if (!isFinite(t)) return { ok: false, txt: 'time unknown' };
  if (rule === 'session') { var lc = lastCloseMs(Date.now()); return { ok: !lc || t >= lc - 45 * 60e3, txt: tET(t, true) } }
  return { ok: Date.now() - t <= rule * 36e5, txt: tET(t, true) };
}
function freshTag(ts, rule, label) { var fr = freshness(ts, rule); return fr.ok ? esc(label || fr.txt) : '<span class="am">Stale: ' + esc(label || fr.txt) + ', a newer session has closed</span>' }
function vixClose() { try { return B.opt.vix.idx.filter(function (x) { return x[0] === 'VIX' })[0][2] } catch (e) { return null } }
function renderStrip() {
  var T = [['S&P 500', 'xyz:SP500'], ['Nasdaq 100', 'xyz:XYZ100'], ['Semis ETF', 'xyz:SMH'], ['VIX', 'VIX'], ['Gold', 'xyz:GOLD'], ['Brent', 'xyz:BRENTOIL'], ['USD/JPY', 'xyz:JPY'], ['Bitcoin', 'BTC']], h = '';
  T.forEach(function (t) {
    if (t[1] === 'VIX') { var v = vixClose(); h += '<div class="tile" data-go="opts"><div class="l">VIX index</div><div class="v">' + (v ? f(v, 2) : 'n/a') + '</div><span class="chg sm">' + esc((B.opt.vix && B.opt.vix.asof) || B.opt.asof || 'close') + '</span></div>'; return }
    var p = px(t[1]), c = chgOf(t[1]);
    h += '<div class="tile' + (fresh(t[1]) ? '' : ' stale') + '" data-go="board"><div class="l">' + t[0] + '</div><div class="v">' + (p ? f(p, t[1] === 'xyz:JPY' ? 2 : dp(p)) : 'n/a') + '</div>' + chgHtml(c, 'sm') + '</div>';
  });
  $('strip').innerHTML = h; $('stripbasis').textContent = 'Perps ' + basisDef(BASIS)[2];
}
function renderBoard() {
  var h = '';
  visibleIds().forEach(function (id) {
    var r = INSN[id], st = LISTED[id];
    if (st === 'delisted' || st === 'missing') { h += '<div class="r"><div><div class="n">' + esc(r[1]) + '</div><div class="t">' + esc(id.replace('xyz:', '')) + ' · ' + (st === 'delisted' ? 'delisted at provider' : 'not listed at provider') + '</div></div><span></span><div class="rr"><span class="chg">n/a</span></div></div>'; return }
    var q = Q[id]; if (!q || !isNum(q.mid)) { h += '<div class="r"><div><div class="n">' + esc(r[1]) + '</div><div class="t">loading</div></div><span></span><div class="rr"></div></div>'; return }
    var hh = hist[id] = hist[id] || []; if (!q.cached && hh[hh.length - 1] !== q.mid) { hh.push(q.mid); if (hh.length > 90) hh.shift() }
    var c = chgOf(id), fr = fresh(id), kind = r[2] === 'cry' ? 'crypto perp' : r[2] === 'idx' ? 'index perp' : r[2] === 'macro' ? 'perp' : 'stock perp';
    h += '<div class="r' + (fr ? '' : ' stale') + '" data-c="' + id + '"><div><div class="n">' + esc(r[1]) + '</div><div class="t' + (fr ? '' : ' old') + '">' + esc(id.replace('xyz:', '')) + ' · ' + kind + ' · ' + freshTxt(id) + '</div></div>' + spark(hh.length > 2 ? hh : null, isNum(c) ? c >= 0 : true) + '<div class="rr"><div class="p">' + f(q.mid, dp(q.mid)) + '</div>' + chgHtml(c) + '</div>';
    if (openRow === id) {
      var basis = q.mark && q.oracle ? (q.mark / q.oracle - 1) * 100 : null, sp = q.imp && q.imp[0] && q.imp[1] ? (q.imp[1] - q.imp[0]) / q.mid * 1e4 : null, bp = basePx(BASIS, id);
      h += '<div class="det"><span>Mid <b>' + f(q.mid, dp(q.mid)) + '</b></span><span>Mark <b>' + (q.mark ? f(q.mark, dp(q.mark)) : 'n/a') + '</b></span><span>Oracle <b>' + (q.oracle ? f(q.oracle, dp(q.oracle)) : 'n/a') + '</b></span><span>Mark vs oracle <b>' + (isNum(basis) ? sg(basis, 3) : 'n/a') + '</b></span>' +
        '<span>Funding per hour <b>' + (isNum(q.fund) ? (q.fund * 100).toFixed(4) + '%' : 'n/a') + '</b></span><span>Funding a year <b>' + (isNum(q.fund) ? (q.fund * 24 * 365 * 100).toFixed(1) + '%' : 'n/a') + '</b></span><span>Open interest <b>' + (isNum(q.oi) && q.mark ? money(q.oi * q.mark) : 'n/a') + '</b></span><span>24h volume <b>' + money(q.vol) + '</b></span>' +
        '<span>Impact spread <b>' + (isNum(sp) ? sp.toFixed(1) + ' bps' : 'n/a') + '</b></span><span>Basis price <b>' + (isNum(bp) ? f(bp, dp(bp)) : 'n/a') + '</b></span><span>Source <b>' + (q.src === 'stream' ? 'stream' : 'REST') + '</b></span><span>Updated <b>' + (q.ts ? tET(q.ts, true) : 'n/a') + '</b></span></div>';
    }
    h += '</div>';
  });
  $('tb').innerHTML = h;
  var bd = basisDef(BASIS), miss = visibleIds().filter(function (id) { return LISTED[id] === 'ok' && !isNum(chgOf(id)) }).length;
  $('boardnote').innerHTML = 'Change is ' + esc(bd[2]) + '.' + (miss ? ' ' + miss + ' rows show n/a because that basis has no price for them.' : '') + ' Prices are Hyperliquid perps, the feed Liquid uses, not cash prices. Not on the provider: ' + NOT_ON_PROVIDER.join(', ') + '. Tap a row for funding, open interest and spread.';
  var b = breadth('perp'); $('breadth').textContent = b.n ? 'Perp sample: ' + b.up + ' of ' + b.n + ' up' : '';
}
function setSPX(v) {
  var BS = B.base.spx, c = (v / BS - 1) * 100, e = $('spxchg');
  $('spx').textContent = f(v, 1); e.textContent = sg(c); e.className = 'chg ' + (c >= 0 ? 'u' : 'd');
  $('spxpts').textContent = pts(v - BS, 1) + ' pts vs ' + B.base.label.toLowerCase() + ' ' + f(BS, 2) + ' · ' + freshTxt('xyz:SP500');
  var L = B.ladder.marks, LV = L.map(function (m) { return m[0] }).concat([v]), lo = Math.min.apply(0, LV), hi = Math.max.apply(0, LV), pd = (hi - lo) * .1 || 10; lo -= pd; hi += pd;
  var P = function (x) { return Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)) };
  var h = '<div class="rail"></div>'; L.forEach(function (l) { h += '<div class="tk" style="left:' + P(l[0]) + '%"></div><div class="tl' + (l[2] ? ' u' : '') + '" style="left:' + P(l[0]) + '%">' + esc(l[1]) + '</div>' });
  $('lad').innerHTML = h + '<div class="dot" style="left:' + P(v) + '%"></div>';
  var z = $('zone'), zn = zoneOf(v);
  z.style.background = zn === 'Bull' ? 'var(--gtint)' : zn === 'Range' ? 'var(--otint)' : 'var(--rtint)';
  z.innerHTML = '<b class="' + (zn === 'Bull' ? 'up' : zn === 'Range' ? 'am' : 'dn') + '">' + zn + ' zone.</b> ' + esc(zn === 'Bull' ? B.ladder.bullText : zn === 'Range' ? B.ladder.rangeText : B.ladder.riskText);
}
function zoneOf(v) { return v > B.ladder.bull ? 'Bull' : v >= B.ladder.floor ? 'Range' : 'Risk' }

/* ---------- Breadth and regime, from measurable perp data only ---------- */
function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
function breadth(k) {
  var ch = [];
  BREADTH.forEach(function (id) { if (LISTED[id] !== 'ok' || !fresh(id) || !Q[id] || !(Q[id].vol > 0)) return; var c = chgOf(id, k); if (isNum(c)) ch.push([id, c]) });
  var vals = ch.map(function (x) { return x[1] }), g = {};
  for (var gn in GROUPS) { var ids = GROUPS[gn].split(' ').map(function (s) { return 'xyz:' + s }); var gv = ch.filter(function (x) { return ids.indexOf(x[0]) >= 0 }).map(function (x) { return x[1] }); if (gv.length >= 3) g[gn] = median(gv) }
  return { n: vals.length, up: vals.filter(function (v) { return v > 0 }).length, pct: vals.length ? vals.filter(function (v) { return v > 0 }).length / vals.length * 100 : null, med: median(vals), groups: g };
}
var REG = null, REGH = LS('mb_regh') || [];
function regime() {
  var k = 'perp', c = function (id) { return fresh(id) ? chgOf(id, k) : null };
  var spx = c('xyz:SP500'), ndx = c('xyz:XYZ100'), smh = c('xyz:SMH'), gold = c('xyz:GOLD'), oil = c('xyz:BRENTOIL'), jpy = c('xyz:JPY'), btc = c('BTC'), br = breadth(k);
  var ev = [], miss = ['NYSE advance and decline counts', 'volume', 'live VIX', 'Treasury yields', 'short interest'];
  if (!isNum(spx)) return { label: 'Unconfirmed', tone: '', why: 'No fresh S&P perp price yet.', ev: [], miss: miss, score: null };
  var bl = basisDef(k)[1].toLowerCase();
  ev.push(['S&P 500 perp', sg(spx), bl]);
  if (isNum(ndx)) ev.push(['Nasdaq 100 perp', sg(ndx), bl]);
  if (br.n) ev.push(['Perp sample up', br.up + ' of ' + br.n + ' (' + br.pct.toFixed(0) + '%)', bl + ', ' + br.n + ' stock perps, not exchange breadth']);
  if (isNum(br.med)) ev.push(['Perp sample median', sg(br.med), bl]);
  var gs = Object.keys(br.groups).map(function (n) { return [n, br.groups[n]] }).sort(function (a, b) { return b[1] - a[1] });
  gs.forEach(function (g) { ev.push([g[0] + ' median', sg(g[1]), bl]) });
  if (isNum(smh) && isNum(ndx)) ev.push(['Semis ETF vs Nasdaq 100', sg(smh - ndx), 'relative, ' + bl]);
  if (isNum(gold)) ev.push(['Gold', sg(gold), bl]);
  if (isNum(oil)) ev.push(['Brent', sg(oil), bl]);
  if (isNum(jpy)) ev.push(['USD/JPY', sg(jpy), bl + ', down means a stronger yen']);
  if (isNum(btc)) ev.push(['Bitcoin', sg(btc), bl]);
  var em = B.opt && B.opt.em && B.opt.em[0] ? B.opt.em[0][1] : null, real = isNum(em) ? Math.abs(spx) / em * 100 : null;
  if (isNum(real)) ev.push(['Move vs first implied move', real.toFixed(0) + '% used', 'implied ' + em.toFixed(2) + '% from ' + B.opt.asof]);
  var spread = gs.length >= 3 ? gs[0][1] - gs[gs.length - 1][1] : 0, mega = br.groups.Megacap, label = 'Mixed', tone = 'a', conf = br.n >= 30;
  var P = br.pct, M = br.med;
  if (!conf) label = spx >= 0 ? 'Index up, breadth unmeasured' : 'Index down, breadth unmeasured';
  else if (spx <= -2 && P < 15) { label = 'Capitulation risk'; tone = 'r' }
  else if (spx <= -0.5 && P < 40 && ((isNum(gold) && gold > 0) || (isNum(jpy) && jpy < 0))) { label = 'Risk off'; tone = 'r' }
  else if (spx >= 0.3 && P >= 65 && isNum(M) && M >= 0.5 * spx) { label = 'Broad rally in the perp sample'; tone = 'g' }
  else if (spx >= 0.3 && (P < 50 || (isNum(mega) && isNum(M) && mega - M > 1))) { label = 'Narrow rally in the perp sample'; tone = 'a' }
  else if (spx >= 0.5 && isNum(B.base.prevChg) && B.base.prevChg <= -1) { label = 'Relief rally'; tone = 'g' }
  else if (spx >= 0.5 && P >= 55) { label = 'Risk on'; tone = 'g' }
  else if (Math.abs(spx) < 0.4 && spread > 1.5) { label = 'Sector rotation'; tone = 'b' }
  else if (spx <= -0.3 && P < 45) { label = 'Broad selling in the perp sample'; tone = 'r' }
  else if (Math.abs(spx) < 0.3) { label = 'Consolidation'; tone = 'b' }
  else conf = false;
  var tags = [];
  if (isNum(real) && real > 100) tags.push(['Volatility expansion', 'r', 'the move is past the implied move']);
  if (isNum(smh) && isNum(ndx) && Math.abs(smh - ndx) >= 1) tags.push([smh > ndx ? 'Semis leading' : 'Semis lagging', smh > ndx ? 'g' : 'r', '']);
  var score = spx * 0.6 + (isNum(P) ? (P - 50) / 25 : 0) + (isNum(ndx) ? ndx * 0.2 : 0);
  return { label: label, tone: tone, conf: conf, ev: ev, tags: tags, miss: miss, score: score, spx: spx };
}
function renderRegime() {
  var r = REG = regime(), now = Date.now();
  if (isNum(r.score)) { var last = REGH[REGH.length - 1]; if (!last || now - last.t > 5 * 60e3) { REGH.push({ t: now, l: r.label, s: r.score }); if (REGH.length > 300) REGH.shift(); LS('mb_regh', REGH) } }
  var ref = null; for (var i = REGH.length - 1; i >= 0; i--) { if (now - REGH[i].t >= 15 * 60e3) { ref = REGH[i]; break } }
  var trend = '';
  if (ref && isNum(r.score)) { var d = r.score - ref.s; trend = (d > 0.15 ? '<span class="pill g">Improving</span>' : d < -0.15 ? '<span class="pill r">Deteriorating</span>' : '<span class="pill">Steady</span>') + '<span class="k">vs ' + tET(ref.t, true) + (ref.l !== r.label ? ', was ' + esc(ref.l) : '') + '</span>' }
  $('regime').innerHTML = '<span class="pill ' + (r.tone || '') + '">' + esc(r.label) + (r.conf || r.label === 'Unconfirmed' ? '' : ', unconfirmed') + '</span>' + (r.tags || []).map(function (t) { return '<span class="pill ' + t[1] + '">' + esc(t[0]) + '</span>' }).join('') + trend;
  $('regev').innerHTML = (r.ev || []).map(function (e) { return '<div class="r"><span>' + esc(e[0]) + ' <span class="k">' + esc(e[2]) + '</span></span><b class="num">' + esc(e[1]) + '</b></div>' }).join('') || '<div class="r mut">' + esc(r.why || 'Waiting for data') + '</div>';
  $('regnot').textContent = 'Rules are fixed and shown here so the label can be checked. Breadth here is a sample of up to ' + BREADTH.length + ' US listed stocks that trade as perps. It is not exchange breadth and does not represent the whole market. Not measured yet: ' + r.miss.join(', ') + '.';
  $('regasof').textContent = LASTOK ? tET(LASTOK) : '';
}

/* ---------- What changed since the last visit ---------- */
var VPREV = LS('mb_visit'), VSHOWN = false;
function gammaFlip() { var l = (B.opt.levels || []).filter(function (x) { return /gamma flip/i.test(x[0]) })[0]; return l ? l[1] : null }
function snapNow() {
  var p = {}; KEY.concat(['xyz:SMH']).forEach(function (id) { if (fresh(id)) p[id] = px(id) });
  return { t: Date.now(), px: p, brief: B.updated, bl: B.updatedLabel, head: B.headline, picks: (B.picks || []).map(function (x) { return String(x[3]).slice(0, 80) }), reg: REG && REG.label, zone: p['xyz:SP500'] ? zoneOf(p['xyz:SP500']) : null, vix: vixClose(), levels: (B.opt.levels || []).map(function (l) { return [l[0], l[1]] }), bull: B.ladder.bull, floor: B.ladder.floor, em: B.opt.em && B.opt.em[0] ? B.opt.em[0][1] : null, wire: WIRE.items.length ? WIRE.items[0].ts : null };
}
function saveVisit() { if (!LASTOK || Date.now() - LASTOK > FRESH) return; LS('mb_visit', snapNow()) }
function renderSince() {
  var P = VPREV, sec = $('sinceSec');
  if (!P || !P.t || Date.now() - P.t < 120e3 || !px('xyz:SP500') || !fresh('xyz:SP500')) { sec.style.display = 'none'; return }
  sec.style.display = ''; var h = '', items = 0;
  h += '<div class="r full k">Last visit ' + tET(P.t, true) + ', ' + ago(Date.now() - P.t) + ' ago. Showing only what changed.</div>';
  var rows = '';
  [['xyz:SP500', 'S&P 500'], ['xyz:XYZ100', 'Nasdaq 100'], ['xyz:SMH', 'Semis ETF'], ['xyz:GOLD', 'Gold'], ['xyz:BRENTOIL', 'Brent'], ['BTC', 'Bitcoin']].forEach(function (x) {
    var a = P.px && P.px[x[0]], b = px(x[0]); if (!isNum(a) || !isNum(b) || !fresh(x[0])) return; var c = (b / a - 1) * 100; if (Math.abs(c) < 0.15) return;
    rows += '<div class="r"><span>' + x[1] + ' <span class="from">' + f(a, dp(a)) + ' → ' + f(b, dp(b)) + '</span></span>' + chgHtml(c, 'sm') + '</div>'; items++;
  });
  h += rows;
  var a = P.px && P.px['xyz:SP500'], b = px('xyz:SP500');
  if (isNum(a)) {
    var lv = (B.ladder.marks || []).map(function (m) { return [m[1], m[0]] }).concat((B.opt.levels || []).map(function (l) { return [l[0], l[1]] }));
    var e0 = B.opt.em && B.opt.em[0]; if (e0) { var m = B.opt.base * e0[1] / 100; lv.push(['Upper implied move', B.opt.base + m], ['Lower implied move', B.opt.base - m]) }
    lv.forEach(function (l) { if ((a - l[1]) * (b - l[1]) < 0) { h += '<div class="r full">S&amp;P perp crossed ' + (b > a ? 'above' : 'below') + ' <b>' + esc(l[0]) + (/\d/.test(l[0]) ? '' : ' ' + f(l[1], 0)) + '</b></div>'; items++ } });
  }
  var zn = zoneOf(b); if (P.zone && P.zone !== zn) { h += '<div class="r full">Zone changed: ' + esc(P.zone) + ' → <b>' + zn + '</b></div>'; items++ }
  if (P.reg && REG && P.reg !== REG.label) { h += '<div class="r full">Regime: ' + esc(P.reg) + ' → <b>' + esc(REG.label) + '</b></div>'; items++ }
  if (P.brief && P.brief !== B.updated) {
    var np = (B.picks || []).filter(function (x) { return (P.picks || []).indexOf(String(x[3]).slice(0, 80)) < 0 });
    h += '<div class="r full">New brief ' + esc(B.updatedLabel) + (P.head !== B.headline ? ': <b>' + esc(B.headline) + '</b>' : '') + (np.length ? '<div class="k">' + np.length + ' new picks. ' + np.slice(0, 2).map(function (x) { return esc(x[0]) + ' ' + lite(x[3]) }).join(' · ') + '</div>' : '') + '</div>'; items++;
    if (isNum(P.bull) && (P.bull !== B.ladder.bull || P.floor !== B.ladder.floor)) { h += '<div class="r full">Outlook levels: trigger ' + f(P.bull, 0) + ' → <b>' + f(B.ladder.bull, 0) + '</b>, floor ' + f(P.floor, 0) + ' → <b>' + f(B.ladder.floor, 0) + '</b></div>'; items++ }
    (B.opt.levels || []).forEach(function (l) { var o = (P.levels || []).filter(function (x) { return x[0] === l[0] })[0]; if (o && Math.abs(o[1] - l[1]) >= 1) { h += '<div class="r full">' + esc(l[0]) + ' ' + f(o[1], 0) + ' → <b>' + f(l[1], 0) + '</b></div>'; items++ } });
    var vx = vixClose(); if (isNum(P.vix) && isNum(vx) && P.vix !== vx) { h += '<div class="r full">VIX close ' + f(P.vix, 2) + ' → <b>' + f(vx, 2) + '</b></div>'; items++ }
    var e = B.opt.em && B.opt.em[0] ? B.opt.em[0][1] : null; if (isNum(P.em) && isNum(e) && Math.abs(P.em - e) > 0.01) { h += '<div class="r full">Nearest implied move ' + P.em.toFixed(2) + '% → <b>' + e.toFixed(2) + '%</b></div>'; items++ }
  }
  var nw = WIRE.items.filter(function (n) { return n.ts > P.t });
  if (nw.length) { h += '<div class="r full">' + nw.length + ' new market moving headline' + (nw.length > 1 ? 's' : '') + '<div class="k">' + nw.slice(0, 3).map(function (n) { return fmtT(n.ts) + ' ' + esc(n.h) }).join('<br>') + '</div></div>'; items++ }
  else if (!getKey()) h += '<div class="r full k">Headlines since then need the live wire. Connect it in News.</div>';
  if (!items) h += '<div class="r full">Nothing material changed.</div>';
  if (MODE !== 'deep') { var parts = h.split('<div class="r'); if (parts.length > 9) h = parts.slice(0, 9).join('<div class="r') + '<div class="r full k">' + (parts.length - 9) + ' more in Deep.</div>' }
  $('since').innerHTML = h;
}

/* ---------- Brief content ---------- */
function applyBrief(nb) {
  if (!nb || !nb.updated || !nb.base || !nb.opt) return; B = nb; BRIEF_V = nb.updated;
  $('hl').textContent = B.headline || ''; $('kick2').textContent = B.kicker || ''; $('lede').textContent = B.lede || '';
  var t3 = B.top3 && B.top3.length ? B.top3 : (B.drivers || []).slice(0, 3).map(function (d) { return [d[1], d[2]] });
  $('top3').innerHTML = t3.map(function (t, i) { return '<div class="r"><b class="n">' + (i + 1) + '</b><span><b>' + lite(t[0]) + '.</b> ' + lite(t[1]) + '</span></div>' }).join('');
  $('top3asof').textContent = B.updatedLabel || '';
  var dl = B.top3 && B.top3.length ? (B.drivers || []) : (B.drivers || []).slice(3);
  $('drvtitle').textContent = B.top3 && B.top3.length ? 'What is driving it' : 'Also driving it';
  $('drivers').innerHTML = dl.map(function (d) { return '<div class="r"><h4 class="' + (d[0] === 'g' ? 'up' : d[0] === 'r' ? 'dn' : 'am') + '">' + esc(d[1]) + '</h4><p>' + lite(d[2]) + '</p></div>' }).join('');
  var rk = (B.risks || []).map(function (r) { return '<div class="r"><span>' + esc(r[0]) + '</span><span>' + lite(r[1]) + '</span></div>' }).join('');
  $('risks').innerHTML = rk + (B.calendar || []).map(function (c) { return '<div class="r"><span>' + esc(c[0]) + '</span><span>' + lite(c[1]) + '</span></div>' }).join('');
  $('caltitle').textContent = (B.calTitle || '').replace(/^calendar\s*·?\s*/i, '');
  var sc = B.scenarios && B.scenarios.length ? B.scenarios : [
    { n: 'Bullish', cond: 'S&P holds above ' + f(B.ladder.bull, 0), text: B.ladder.bullText, inval: 'Back below ' + f(B.ladder.bull, 0) },
    { n: 'Neutral', cond: 'Between ' + f(B.ladder.floor, 0) + ' and ' + f(B.ladder.bull, 0), text: B.ladder.rangeText },
    { n: 'Bearish', cond: 'Below ' + f(B.ladder.floor, 0), text: B.ladder.riskText, inval: 'Back above ' + f(B.ladder.floor, 0) }];
  $('scen').innerHTML = sc.map(function (s) { var c = s.n === 'Bullish' ? 'up' : s.n === 'Bearish' ? 'dn' : 'am'; return '<div class="r"><h4 class="' + c + '">' + esc(s.n) + '</h4><dl>' + (s.cond ? '<dt>Needs</dt><dd>' + lite(s.cond) + '</dd>' : '') + (s.confirm ? '<dt>Confirms</dt><dd>' + lite(s.confirm) + '</dd>' : '') + (s.text ? '<dt>Read</dt><dd>' + lite(s.text) + '</dd>' : '') + (s.risk ? '<dt>Risks</dt><dd>' + lite(s.risk) + '</dd>' : '') + (s.inval ? '<dt>Invalid if</dt><dd>' + lite(s.inval) + '</dd>' : '') + '</dl></div>' }).join('');
  var e0 = B.opt.em && B.opt.em[0];
  $('optrisk').innerHTML = e0 ? 'Options risk: the nearest SPX implied move is ±' + e0[1].toFixed(2) + '% (±' + f(B.opt.base * e0[1] / 100, 0) + ' pts, ' + esc(e0[2]) + ', ' + esc(B.opt.asof) + '). Short premium inside that range carries full gap risk past it. Use defined risk or size so the maximum loss is acceptable, and plan exits before expiry when gamma is highest.' : '';
  $('means').innerHTML = (B.means || []).map(function (m) { return '<div style="margin:4px 0">' + lite(m) + '</div>' }).join('');
  $('plantitle').textContent = (B.planTitle || 'Game plan');
  $('impnote').textContent = B.impNote || '';
  $('impsub').textContent = 'S&P 500 PERP VS ' + String(B.base.label).toUpperCase();
  $('chtitle').textContent = (B.chart && B.chart.title) || 'Overnight path';
  $('optasof').innerHTML = 'From ' + freshTag(B.opt.asofTs, 'session', B.opt.asof || '');
  $('recaptab').textContent = B.recapLabel || 'Recap';
  $('picksasof').textContent = B.updatedLabel || '';
  $('footupd').innerHTML = 'Brief ' + esc(B.updatedLabel || '') + (B.next ? ', next ' + esc(B.next) : '') + '. Live prices: Hyperliquid perps. News: Unusual Whales. Options: Unusual Whales, ' + esc(B.opt.asof || '') + '. ' + esc(B.base.closesSrc || '');
  var hl = [['Brief', B.updated, 6], ['Cash closes', B.base.ts, 'session'], ['Options', B.opt.asofTs, 'session'], ['VIX curve', B.opt.vix && B.opt.vix.asofTs, 'session']];
  if (B.semis) hl.push(['Chip notes', B.semis.asofTs, 72]); if (B.priced) hl.push(['Priced in', B.priced.asofTs, 24]);
  var bad = hl.filter(function (x) { return !freshness(x[1], x[2]).ok });
  $('health').innerHTML = hl.map(function (x) { var fr = freshness(x[1], x[2]); return '<span class="pill ' + (fr.ok ? '' : 'a') + '">' + esc(x[0]) + ' ' + esc(fr.txt) + (fr.ok ? '' : ', stale') + '</span>' }).join('');
  $('healthSec').style.display = bad.length || MODE === 'deep' ? '' : 'none';
  if (B.sources && B.sources.length) $('srcbox').innerHTML = B.sources.map(function (s) { return /^https:\/\//.test(s[1]) ? '<a href="' + esc(s[1]) + '" rel="noopener noreferrer" target="_blank">' + esc(s[0]) + '</a>' : esc(s[0]) }).join(' · ');
  NEWS = B.picks || []; feed(WIRE.cat || 'all'); basisChips(); renderVix(); render(); loadChart(); ensureBases();
}
function pullBrief() {
  if (document.hidden) return;
  fetch('brief.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (nb) { if (nb.updated !== BRIEF_V) applyBrief(nb) }).catch(function () { });
  fetch('recap.html?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.text() }).then(function (h) { if (h && h.length > 200) { $('recapbox').innerHTML = ''; $('recapbox').appendChild(clean(h)); sectors() } }).catch(function () { });
}
/* recap.html and archived HTML are inert: no scripts, no handlers, only https links */
function clean(html) {
  var d = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html'), root = d.body.firstChild;
  root.querySelectorAll('script,iframe,object,embed,link,meta,form,input,button,textarea,base,style').forEach(function (n) { n.remove() });
  root.querySelectorAll('*').forEach(function (n) { [].slice.call(n.attributes).forEach(function (a) { var nm = a.name.toLowerCase(), v = a.value; if (nm.indexOf('on') === 0 || ((nm === 'href' || nm === 'src' || nm === 'xlink:href') && !/^https:\/\//i.test(v) && v.charAt(0) !== '#') || (nm === 'style' && /url\(|expression/i.test(v))) n.removeAttribute(a.name) }); if (n.tagName === 'A') { n.setAttribute('rel', 'noopener noreferrer'); n.setAttribute('target', '_blank') } });
  var frag = document.createDocumentFragment(); while (root.firstChild) frag.appendChild(root.firstChild); return frag;
}
function sectors() { var el = $('sectors'); if (!el) return; var a = null, raw = el.getAttribute('data-sectors'); if (raw) { try { a = JSON.parse(raw) } catch (e) { } } if (!a) a = [["Materials", 2.07], ["Real Estate", 0.92], ["Comm Services", 0.89], ["Industrials", 0.83], ["Energy", 0.74], ["Financials", 0.71], ["Utilities", 0.48], ["Staples", 0.46], ["Discretionary", -0.20], ["Health Care", -0.56], ["Technology", -0.83]]; var m = Math.max.apply(0, a.map(function (r) { return Math.abs(r[1]) })) * 1.05 || 1; el.innerHTML = a.map(function (r) { var v = +r[1], w = Math.abs(v) / m * 50, p = v >= 0; return '<div class="hb"><span>' + esc(r[0]) + '</span><span class="t"><i style="' + (p ? 'left:50%;width:' + w + '%;background:var(--gfill)' : 'right:50%;width:' + w + '%;background:var(--rfill)') + '"></i></span><span class="p ' + (p ? 'up' : 'dn') + '">' + sg(v) + '</span></div>' }).join('') }

/* ---------- Options ---------- */
function renderOpt(spx) {
  var O = B.opt, b = O.base, h = '';
  (O.em || []).forEach(function (e) {
    var m = b * e[1] / 100, lo = b - m, hi = b + m, dl = lo - m * .6, dh = hi + m * .6, P = function (x) { return Math.max(0, Math.min(100, (x - dl) / (dh - dl) * 100)) };
    var used = spx ? (spx - b) / m * 100 : null;
    h += '<div class="r"><div class="h"><b>' + esc(e[0]) + '</b><span class="num"><b>±' + f(m, 0) + ' pts</b> <span class="mut">±' + (+e[1]).toFixed(2) + '% · ' + esc(e[2]) + ' · ' + esc(e[3] || 'SPX') + '</span></span></div>' +
      '<div class="bar2"><div class="rail"></div><div class="rng" style="left:' + P(lo) + '%;width:' + (P(hi) - P(lo)) + '%"></div><div class="ctr" style="left:' + P(b) + '%"></div>' + (spx ? '<div class="ld" style="left:' + P(spx) + '%"></div>' : '') + '</div>' +
      '<div class="ends"><span>' + f(lo, 0) + '</span><span>' + (isNum(used) ? Math.abs(used).toFixed(0) + '% of the ' + (used >= 0 ? 'up' : 'down') + ' move used · ' + f(hi - spx, 0) + ' pts to top, ' + f(spx - lo, 0) + ' to bottom' : '') + '</span><span>' + f(hi, 0) + '</span></div></div>';
  });
  if (O.emSpy && O.emSpy.length) h += '<div class="r"><b>SPY options, for comparison</b><div class="k">' + O.emSpy.map(function (e) { var m = O.spyBase * e[1] / 100; return esc(e[2]) + ' ±' + (+e[1]).toFixed(2) + '%, ' + f(O.spyBase - m, 2) + ' to ' + f(O.spyBase + m, 2) }).join('<br>') + '</div></div>';
  $('emrows').innerHTML = h;
  $('emnote').textContent = (O.emSrc || 'Implied moves from options pricing.') + ' Live position uses the S&P perp as a proxy for SPX. Expected moves are about a one standard deviation range, not a guaranteed range.';
  var near = null, d = 1e9, mx = 0; (O.gex || []).forEach(function (g) { mx = Math.max(mx, g[1] - g[2]); if (spx && Math.abs(g[0] - spx) < d) { d = Math.abs(g[0] - spx); near = g[0] } });
  $('gxrows').innerHTML = (O.gex || []).map(function (g) { var tag = (O.levels || []).filter(function (l) { var best = O.gex.reduce(function (a, x) { return Math.abs(x[0] - l[1]) < Math.abs(a[0] - l[1]) ? x : a }); return best[0] === g[0] && Math.abs(l[1] - g[0]) < 15 }).map(function (l) { return l[0] }).join(', '); return '<div class="gx' + (g[0] === near ? ' near' : '') + '"><span class="num"><b>' + f(g[0], 0) + '</b></span><span class="gb"><i style="width:' + (g[1] / mx * 100) + '%;background:var(--gfill)"></i><i style="width:' + (-g[2] / mx * 100) + '%;background:var(--rfill)"></i></span><span class="lb">' + esc(tag) + '</span></div>' }).join('');
  $('lvchips').innerHTML = (O.levels || []).map(function (l) { return '<span class="pill ' + ({ r: 'r', g: 'g', a: 'a' }[l[2]] || 'b') + '">' + esc(l[0]) + ' ' + f(l[1], 0) + '</span>' }).join('');
}
function allLevels() {
  var O = B.opt, L = [];
  (B.ladder.marks || []).forEach(function (m) { L.push([m[1], m[0], 'Brief']) });
  (O.levels || []).forEach(function (l) { L.push([l[0], l[1], 'Options, ' + O.asof]) });
  (O.em || []).slice(0, 2).forEach(function (e) { var m = O.base * e[1] / 100; L.push([e[0] + ' high', O.base + m, 'Implied move']); L.push([e[0] + ' low', O.base - m, 'Implied move']) });
  L.push([B.base.label, B.base.spx, 'Cash close']);
  if (OVN.hi) { L.push(['Overnight high', OVN.hi, 'Perp since ' + baseDay() + ' close']); L.push(['Overnight low', OVN.lo, 'Perp since ' + baseDay() + ' close']) }
  if (OVN.vwap) L.push(['Perp VWAP', OVN.vwap, 'Since ' + baseDay() + ' close']);
  if (OR.hi) { L.push(['Opening range high', OR.hi, '9:30 to 10:00 perp']); L.push(['Opening range low', OR.lo, '9:30 to 10:00 perp']) }
  var seen = {}; return L.filter(function (l) { var k = l[0] + Math.round(l[1]); if (seen[k] || !isNum(l[1])) return false; seen[k] = 1; return true }).sort(function (a, b) { return b[1] - a[1] });
}
function renderLevels(spx) {
  var L = allLevels(), h = '', placed = false;
  if (MODE !== 'deep') { var ab = L.filter(function (l) { return l[1] >= spx }).slice(-4), be = L.filter(function (l) { return l[1] < spx }).slice(0, 4); L = ab.concat(be) }
  L.forEach(function (l) { if (!placed && l[1] < spx) { h += '<div class="r now"><span>Live S&amp;P perp</span><span class="num">' + f(spx, 1) + '</span><span class="num"></span></div>'; placed = true } var dd = l[1] - spx; h += '<div class="r"><span>' + esc(l[0]) + ' <span class="k">' + esc(l[2]) + '</span></span><span class="num">' + f(l[1], 0) + '</span><span class="num ' + (dd >= 0 ? 'up' : 'dn') + '">' + pts(dd) + ' · ' + Math.abs(dd / spx * 100).toFixed(1) + '%</span></div>' });
  if (!placed) h += '<div class="r now"><span>Live S&amp;P perp</span><span class="num">' + f(spx, 1) + '</span><span></span></div>';
  $('levels').innerHTML = h; $('lvlasof').textContent = freshTxt('xyz:SP500');
}
var SIMTOUCH = false;
function simSet(v) { var r = $('simr'), b = B.opt.base; r.min = Math.round(b * 0.95); r.max = Math.round(b * 1.05); r.step = 1; r.value = Math.round(v); $('simlo').textContent = f(r.min, 0); $('simhi').textContent = f(r.max, 0); simOut(+r.value) }
function simOut(v) {
  var L = allLevels(), O = B.opt, live = px('xyz:SP500');
  $('simval').textContent = 'SPX ' + f(v, 0) + (live ? ', ' + pts(v - live) + ' from live' : '');
  var above = L.filter(function (l) { return l[1] > v }).slice(-3).reverse(), below = L.filter(function (l) { return l[1] <= v }).slice(0, 3);
  var em = (O.em || []).map(function (e) { var m = O.base * e[1] / 100, u = (v - O.base) / m * 100; return esc(e[0]) + ': ' + (Math.abs(u) > 100 ? '<b class="dn">outside</b>, ' : '') + Math.abs(u).toFixed(0) + '% of the ' + (u >= 0 ? 'up' : 'down') + ' move' }).join('<br>');
  var g = (O.gex || []).reduce(function (a, x) { return !a || Math.abs(x[0] - v) < Math.abs(a[0] - v) ? x : a }, null);
  $('simout').innerHTML = '<div class="k">Zone: <b class="' + (zoneOf(v) === 'Bull' ? 'up' : zoneOf(v) === 'Range' ? 'am' : 'dn') + '">' + zoneOf(v) + '</b>' + (gammaFlip() ? ' · ' + (v >= gammaFlip() ? 'above' : 'below') + ' the gamma flip ' + f(gammaFlip(), 0) : '') + (g ? ' · nearest big strike ' + f(g[0], 0) : '') + '</div>' +
    '<div class="k" style="margin-top:4px">' + em + '</div><div style="margin-top:6px;font-size:13px">' + above.map(function (l) { return '▲ ' + esc(l[0]) + ' ' + f(l[1], 0) + ' <span class="mut">' + pts(l[1] - v) + '</span>' }).join('<br>') + (above.length && below.length ? '<br>' : '') + below.map(function (l) { return '▼ ' + esc(l[0]) + ' ' + f(l[1], 0) + ' <span class="mut">' + pts(l[1] - v) + '</span>' }).join('<br>') + '</div>';
}
function renderVix() {
  var V = B.opt.vix, s = $('vixc'); if (!V || !V.idx) return; var W = s.clientWidth || 340, H = s.clientHeight || 180, pl = 26, pr = 10, pt = 16, pb = 24, all = V.idx.concat(V.fut || []), vs = all.map(function (a) { return +a[2] });
  var mn = Math.floor(Math.min.apply(0, vs) - 1), mx = Math.ceil(Math.max.apply(0, vs) + 1), X = function (dd) { return pl + dd / 210 * (W - pl - pr) }, Y = function (v) { return pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb) };
  var g = '', step = (mx - mn) > 8 ? 4 : 2; for (var v = mn; v <= mx; v += step) g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--sep)"/><text x="' + (pl - 5) + '" y="' + (Y(v) + 4) + '" font-size="10" text-anchor="end" fill="var(--ink2)">' + v + '</text>';
  var ln = function (a, c) { return '<path d="' + a.map(function (p, i) { return (i ? 'L' : 'M') + X(p[1]).toFixed(1) + ',' + Y(p[2]).toFixed(1) }).join('') + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' };
  g += ln(V.idx, 'var(--rfill)') + (V.fut ? ln(V.fut, 'var(--bfill)') : '');
  V.idx.forEach(function (a) { g += '<circle cx="' + X(a[1]) + '" cy="' + Y(a[2]) + '" r="3.5" fill="var(--rfill)"/><text x="' + X(a[1]) + '" y="' + (Y(a[2]) - 8) + '" font-size="10" font-weight="600" text-anchor="middle" fill="var(--ink)">' + esc(a[0]) + ' ' + a[2] + '</text>' });
  (V.fut || []).forEach(function (a) { g += '<circle cx="' + X(a[1]) + '" cy="' + Y(a[2]) + '" r="3" fill="var(--bfill)"/><text x="' + X(a[1]) + '" y="' + (H - 7) + '" font-size="10" text-anchor="middle" fill="var(--ink2)">' + esc(a[0]) + '</text>' });
  s.innerHTML = g;
  var i9 = V.idx[0][2], i30 = V.idx[1][2], i3m = V.idx[2][2], tags = '', note = '';
  var idxInv = i9 > i30 && i30 > i3m, idxNorm = i9 < i30 && i30 < i3m;
  tags += '<span class="pill ' + (idxInv ? 'r' : idxNorm ? 'g' : 'a') + '">Index curve ' + (idxInv ? 'inverted' : idxNorm ? 'upward' : 'mixed') + '</span>';
  if (V.fut && V.fut.length > 1) { var f1 = V.fut[0][2], f2 = V.fut[1][2]; tags += '<span class="pill ' + (f1 > f2 ? 'r' : 'g') + '">Futures ' + (f1 > f2 ? 'backwardation' : 'contango') + '</span>'; tags += '<span class="pill ' + (i30 > f1 ? 'r' : 'g') + '">Spot ' + (i30 > f1 ? 'above' : 'below') + ' front future</span>'; note = 'Futures: ' + esc(V.fut[0][0]) + ' ' + f1 + ' vs ' + esc(V.fut[1][0]) + ' ' + f2 + ' (' + (f1 > f2 ? 'front above second is backwardation' : 'front below second is contango') + '). ' }
  $('vixtags').innerHTML = tags;
  $('vixnote').innerHTML = '<span class="dn">Red</span> is the VIX index term structure (9 day, 30 day, 3 month): VIX/VIX3M ' + (i30 / i3m).toFixed(2) + '. <span class="bl">Blue</span> is VIX futures settlements, a separate market. ' + note + 'These are ' + esc(V.asof || B.opt.asof) + ' readings. A live VIX is not available on this page.';
  $('vixasof').innerHTML = freshTag(V.asofTs || B.opt.asofTs, 'session', V.asof || B.opt.asof || '');
}

/* ---------- Overnight chart and session levels ---------- */
var OVN = {}, OR = {};
function drawChart(pts) {
  var s = $('ovn'), W = s.clientWidth || 340, H = s.clientHeight || 190, pl = 6, pr = 50, pt = 14, pb = 22, v = pts.map(function (p) { return p[1] }), base = (B.base.perp || {})[chartCoin] || (B.base.closes || {})[chartCoin], vv = v.concat(base ? [base] : []), mn = Math.min.apply(0, vv), mx = Math.max.apply(0, vv), pad = (mx - mn) * .12 || 1; mn -= pad; mx += pad;
  var X = function (i) { return pl + i / (pts.length - 1) * (W - pl - pr) }, Y = function (y) { return pt + (1 - (y - mn) / (mx - mn)) * (H - pt - pb) }, lv = v[v.length - 1], up = base ? lv >= base : lv >= v[0], col = up ? 'var(--gfill)' : 'var(--rfill)';
  var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[1]).toFixed(1) }).join('');
  var g = '<defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (up ? '#30d158' : '#ff453a') + '" stop-opacity=".22"/><stop offset="1" stop-color="' + (up ? '#30d158' : '#ff453a') + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + 'L' + X(pts.length - 1) + ',' + (H - pb) + 'L' + X(0) + ',' + (H - pb) + 'Z" fill="url(#gf)"/>';
  if (base) g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(base) + '" y2="' + Y(base) + '" stroke="var(--ink3)" stroke-dasharray="3 4"/><text x="' + (W - pr + 5) + '" y="' + (Y(base) + 4) + '" font-size="10" fill="var(--ink2)">' + f(base, base > 1000 ? 0 : 2) + '</text>';
  var ai = -1, bd = 1e15; if (B.chart && B.chart.marker) { var mt = new Date(B.chart.marker[0]).getTime(); pts.forEach(function (p, i) { var dd = Math.abs(p[2] - mt); if (dd < bd) { bd = dd; ai = i } }) }
  if (ai > 0 && bd < 7200e3) g += '<line x1="' + X(ai) + '" x2="' + X(ai) + '" y1="' + pt + '" y2="' + (H - pb) + '" stroke="var(--bfill)" stroke-dasharray="2 3"/><text x="' + (X(ai) - 4) + '" y="' + (pt + 1) + '" text-anchor="end" font-size="10" fill="var(--blue)">' + esc(B.chart.marker[1]) + '</text>';
  g += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/><circle cx="' + X(pts.length - 1) + '" cy="' + Y(lv) + '" r="4" fill="' + col + '"/><text x="' + (W - pr + 5) + '" y="' + (Y(lv) + 4) + '" font-size="11" font-weight="700" fill="var(--ink)">' + f(lv, lv > 1000 ? 0 : 2) + '</text>';
  g += '<text x="' + pl + '" y="' + (H - 5) + '" font-size="10" fill="var(--ink2)">' + esc((B.chart && B.chart.startLabel) || '') + '</text><text x="' + (W - pr) + '" y="' + (H - 5) + '" font-size="10" fill="var(--ink2)" text-anchor="end">' + tET(pts[pts.length - 1][2]) + '</text>';
  s.innerHTML = g; s._pts = pts;
}
function loadChart() {
  var st = B.base && B.base.ts ? new Date(B.base.ts).getTime() : (B.chart ? new Date(B.chart.start).getTime() : Date.now() - 864e5);
  post({ type: 'candleSnapshot', req: { coin: chartCoin, interval: '1h', startTime: st, endTime: Date.now() } }).then(function (k) {
    if (!k || !k.length) throw 0; drawChart(k.map(function (c) { return [0, +c.c, +c.t + 36e5 > Date.now() ? Date.now() : +c.t + 36e5] }));
    if (chartCoin === 'xyz:SP500') { var hi = -1e9, lo = 1e9, pv = 0, vv = 0; k.forEach(function (c) { hi = Math.max(hi, +c.h); lo = Math.min(lo, +c.l); var tp = (+c.h + +c.l + +c.c) / 3; pv += tp * +c.v; vv += +c.v }); OVN = { hi: hi, lo: lo, vwap: vv ? pv / vv : null }; soon() }
  }).catch(function () { $('ovn').innerHTML = '<text x="50%" y="50%" text-anchor="middle" font-size="12" fill="var(--ink2)">Chart loads when online</text>' });
  var o = lastOpenMs(Date.now()); if (o && Date.now() > o + 30 * 60e3 && Date.now() < o + 8 * 36e5) post({ type: 'candleSnapshot', req: { coin: 'xyz:SP500', interval: '5m', startTime: o, endTime: o + 30 * 60e3 - 1 } }).then(function (k) { if (k && k.length >= 5) { OR = { hi: Math.max.apply(0, k.map(function (c) { return +c.h })), lo: Math.min.apply(0, k.map(function (c) { return +c.l })) }; soon() } }).catch(function () { }); else OR = {};
}

/* ---------- News wire ---------- */
var NEWS = [], WIRE = { items: [], cat: 'all', imp: LS('mb_imp') || {}, back: 0, next: 0 };
var RULES = {
  noise: /(zacks|motley fool|stocks? to buy|should you buy|is it time to|top \d+ |best \d+|dividend|penny|shareholder alert|class action|investor alert|law firm|investigation on behalf|rosen|pomerantz|hagens|levi & korsinsky|reminds investors|price target raised to|price target lowered to|reiterates|maintains|initiates coverage|webinar|to present at|conference call|announces date|declares quarterly|etf flows? into|options activity|unusual options|short interest)/i,
  macro: /(\bfed\b|fomc|powell|rate (hike|cut)|hikes rates|cuts rates|\bcpi\b|\bppi\b|\bpce\b|inflation|payrolls|jobs report|jobless claims|unemployment|\bgdp\b|retail sales|ism |treasury|yields?\b|bond market|tariff|section 301|section 232|export (control|curb|ban)|sanction|trade (deal|war|truce)|shutdown|debt ceiling|recession|ecb|boj|bank of japan|pboc|bank of korea|bank of england)/i,
  geo: /(opec|crude|oil|brent|\bwti\b|hormuz|iran|israel|saudi|houthi|ukraine|russia|china|taiwan|missile|attack|strike on|drone|war\b|ceasefire)/i,
  mkt: /(s&p|nasdaq|dow\b|futures|wall street|stocks? (fall|rise|slide|jump|rally|tumble|surge)|selloff|sell-off|rally|\bvix\b|volatility|circuit breaker|halted)/i,
  big: /(plunge|surge|soar|tumble|crash|record|halt|ban|suspend|resign|ousted|probe|subpoena|guidance|outlook|cuts forecast|raises forecast|misses|beats|warns|downgrade|bankrupt|default)/i,
  chips: /(nvidia|\bnvda\b|amd|micron|broadcom|tsmc|semiconductor|chip|\bai\b|artificial intelligence|openai|anthropic|data center|hyperscaler|sk hynix|samsung|asml|dram|nand|\bhbm\b|kioxia|western digital|seagate|sandisk)/i,
  earn: /(earnings|quarterly results|revenue|eps|guidance|beats estimates|misses estimates)/i,
  asia: /(nikkei|kospi|hang seng|shanghai|taiex|asia|japan|korea|china stocks)/i,
  srcGood: /(reuters|bloomberg|wsj|wall street journal|cnbc|associated press|\bap\b|financial times|dow jones|marketwatch|deltaone|first squawk|walter bloomberg)/i
};
var MEGA = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'ORCL', 'AMD', 'MU', 'TSM', 'NFLX', 'LLY', 'JPM', 'PLTR', 'SPY', 'QQQ', 'SPX', 'SNDK', 'WDC', 'STX', 'ASML', 'LRCX', 'AMAT', 'KLAC'];
var PERP = { SPY: 'xyz:SP500', SPX: 'xyz:SP500', QQQ: 'xyz:XYZ100', NVDA: 'xyz:NVDA', AAPL: 'xyz:AAPL', MSFT: 'xyz:MSFT', AMZN: 'xyz:AMZN', GOOGL: 'xyz:GOOGL', GOOG: 'xyz:GOOGL', META: 'xyz:META', TSLA: 'xyz:TSLA', AVGO: 'xyz:AVGO', ORCL: 'xyz:ORCL', AMD: 'xyz:AMD', MU: 'xyz:MU', TSM: 'xyz:TSM', NFLX: 'xyz:NFLX', LLY: 'xyz:LLY', PLTR: 'xyz:PLTR', INTC: 'xyz:INTC', COIN: 'xyz:COIN', SNDK: 'xyz:SNDK', LRCX: 'xyz:LRCX', AMAT: 'xyz:AMAT', DELL: 'xyz:DELL', HOOD: 'xyz:HOOD', MSTR: 'xyz:MSTR', CRWV: 'xyz:CRWV', ARM: 'xyz:ARM', QCOM: 'xyz:QCOM', MRVL: 'xyz:MRVL', WDC: 'xyz:WDC', ASML: 'xyz:ASML', SMH: 'xyz:SMH', BTC: 'BTC' };
function scoreNews(n) { var h = n.h, s = 0; if (RULES.noise.test(h)) return -9; if (/(cointelegraph|coindesk|decrypt|the block|bitcoinist|cryptoslate)/i.test(n.src) && !/(bitcoin|btc|ether).{0,40}(falls|drops|plunge|surge|jumps|record|below|above|\$\d)/i.test(h)) return -9; if (n.major) s += 3; if (RULES.macro.test(h)) s += 3; if (RULES.geo.test(h)) s += 2; if (RULES.mkt.test(h)) s += 2; if (RULES.big.test(h)) s += 1; if (RULES.chips.test(h)) s += 1; var mt = n.t.filter(function (x) { return MEGA.indexOf(x) >= 0 }); if (mt.length) s += 2; if (n.t.length > 4) s -= 1; if (RULES.srcGood.test(n.src)) s += 1; return s }
function catOf(h) { if (/(\bfed\b|fomc|powell|cpi|ppi|pce|inflation|payrolls|jobs|claims|gdp|retail sales|ism |treasury|yield)/i.test(h)) return 'FED'; if (/(opec|crude|oil|brent|wti|hormuz|iran|israel|saudi|houthi|ukraine|russia|missile|attack|drone|war\b)/i.test(h)) return 'OIL'; if (RULES.chips.test(h)) return 'AI'; if (RULES.earn.test(h)) return 'EARN'; if (RULES.asia.test(h)) return 'ASIA'; if (RULES.mkt.test(h)) return 'FUT'; return 'MACRO' }
function perpFor(n) { for (var i = 0; i < n.t.length; i++) { if (PERP[n.t[i]]) return [PERP[n.t[i]], n.t[i]] } var h = n.h; if (/(brent|crude|oil|opec|hormuz)/i.test(h)) return ['xyz:BRENTOIL', 'Brent']; if (/gold/i.test(h)) return ['xyz:GOLD', 'Gold']; if (/nasdaq/i.test(h)) return ['xyz:XYZ100', 'NDX']; if (/bitcoin/i.test(h)) return ['BTC', 'BTC']; return ['xyz:SP500', 'S&P'] }
function words(h) { return h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3 }) }
function similar(a, b) { var A = words(a), B2 = words(b); if (!A.length || !B2.length) return false; var hit = A.filter(function (w) { return B2.indexOf(w) >= 0 }).length; return hit / Math.min(A.length, B2.length) > 0.6 }
function normNews(r) {
  var raw = String(r.headline || r.title || r.text || ''), m = raw.match(/https:\/\/[^\s)]+/i), url = String(r.url || r.link || r.source_url || r.article_url || (m ? m[0] : ''));
  var h = raw.replace(/\s*(https?:\/\/|www\.)\S*/gi, '').replace(/\s*[a-z0-9.-]+\.(com|gov|org|net|sa|co)(\.[a-z]{2})?\/\S*/gi, '').replace(/\s*(–|—|-)\s*(BBG|FT|TSL|WSJ|RTRS)\s*$/i, '').trim();
  var ts = r.created_at || r.published_at || r.timestamp || r.date || r.time, t = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts).getTime();
  var tk = r.tickers || r.symbols || r.ticker || []; if (typeof tk === 'string') tk = tk.split(/[ ,]+/); if (!Array.isArray(tk)) tk = [];
  tk = tk.map(function (x) { return String(x && x.symbol || x).toUpperCase().replace(/^\$/, '') }).filter(Boolean);
  return { h: h, t: tk, src: String(r.source || r.publisher || ''), major: !!(r.is_major || r.major), ts: t, url: /^https:\/\//i.test(url) ? url : '', dup: 0, dsrc: [] };
}
function getKey() { try { return localStorage.getItem('uw_key') || '' } catch (e) { return '' } }
function setWire(on, txt) { $('wstat').className = 'st' + (on ? ' on' : ''); $('wtxt').textContent = txt }
function pullWire(force) {
  var k = getKey(); if (!k) { setWire(false, 'Live wire off'); return }
  if (document.hidden && !force) return; if (Date.now() < WIRE.next) return;
  fetch('https://api.unusualwhales.com/api/news/headlines?limit=100', { headers: { Authorization: 'Bearer ' + k, Accept: 'application/json' } }).then(function (r) {
    if (r.status === 401 || r.status === 403) throw 'Token not accepted. Check it under Connect news.'; if (r.status === 402) throw 'Your Unusual Whales plan does not include the news API.';
    if (r.status === 429) { WIRE.back = Math.min((WIRE.back || 60) * 2, 600); WIRE.next = Date.now() + WIRE.back * 1000; throw 'Rate limited, retrying in ' + Math.round(WIRE.back / 60) + ' min.' }
    if (!r.ok) throw 'News feed error ' + r.status; WIRE.back = 0; return r.json()
  }).then(function (j) {
    var arr = (j && (j.data || j.headlines || j)) || []; if (!Array.isArray(arr)) arr = []; var cut = Date.now() - 24 * 36e5, kept = [];
    arr.map(normNews).filter(function (n) { return n.h && n.ts && n.ts > cut && n.ts < Date.now() + 120e3 }).sort(function (a, b) { return a.ts - b.ts }).forEach(function (n) {
      n.s = scoreNews(n); var same = kept.filter(function (x) { return similar(x.h, n.h) })[0];
      if (same) { same.dup++; if (n.src && same.dsrc.indexOf(n.src) < 0) same.dsrc.push(n.src); if (!same.url && n.url) same.url = n.url; same.s = Math.max(same.s, n.s); return }
      n.c = catOf(n.h); kept.push(n);
    });
    WIRE.items = kept.filter(function (n) { return n.s >= 4 }).sort(function (a, b) { return b.ts - a.ts }).slice(0, 15);
    setWire(true, 'Live wire ' + tET(Date.now()) + ', ' + WIRE.items.length + ' of ' + arr.length + ' kept'); drawWire(); impacts(); soon();
  }).catch(function (e) { setWire(false, typeof e === 'string' ? e : 'News feed unreachable'); var m = $('keymsg'); if (m && typeof e === 'string') m.textContent = e });
}
function fmtT(ts) { return tET(ts, true) }
function ichip(lbl, v) { return isNum(v) ? '<span class="ich ' + (v >= 0 ? 'u' : 'd') + '">' + lbl + ' ' + sg(v) + '</span>' : '' }
function drawWire() {
  var h = '', c = WIRE.cat, bk = '', seen = VPREV && VPREV.t;
  WIRE.items.forEach(function (n) {
    if (c !== 'all' && n.c !== c) return; var key = n.ts + '|' + n.h.slice(0, 30), im = WIRE.imp[key], fresh2 = Date.now() - n.ts < 20 * 60e3, isNew = seen && n.ts > seen;
    var chips = '';
    if (im) { chips += ichip('Before', im.pre); [5, 15, 30, 60].forEach(function (w) { if (im.w && isNum(im.w[w])) chips += ichip(w + 'm', im.w[w]) }); if (im.rel != null) chips += ichip('vs S&P ' + im.relw + 'm', im.rel); chips = '<div>' + '<span class="wsrc">' + esc(im.lbl) + ' perp: </span>' + chips + '</div>' }
    h += '<div class="r' + (fresh2 ? ' fresh' : '') + '"><span class="tm">' + fmtT(n.ts) + '</span><span>' + (isNew ? '<span class="cat new">NEW</span>' : '') + '<span class="cat">' + n.c + '</span>' + (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.h) + '</a>' : esc(n.h)) + chips +
      '<div class="wsrc">' + esc(n.src || 'source not given') + (n.dup ? ' · repeated by ' + n.dup + (n.dsrc.length ? ' (' + esc(n.dsrc.slice(0, 3).join(', ')) + ')' : '') : '') + (n.t.length ? ' · ' + esc(n.t.slice(0, 4).join(' ')) : '') + (n.major ? ' · major' : '') + '</div></span></div>';
    if (fresh2 && n.s >= 7 && !bk) bk = '<div class="bk"><b class="dn">Breaking.</b> ' + esc(n.h) + ' <span class="wsrc">' + fmtT(n.ts) + '</span></div>';
  });
  $('wire').innerHTML = h || '<div class="r"><span></span><span class="mut">No market moving headlines in this filter right now.</span></div>'; $('breaking').innerHTML = bk;
}
/* Reaction windows: base is the close of the last completed 1m candle before the headline.
   A window is shown only once it has fully completed. "Before" is the 15 minutes ahead of the headline. */
function impacts() {
  var now = Date.now();
  WIRE.items.slice(0, 10).forEach(function (n, idx) {
    var key = n.ts + '|' + n.h.slice(0, 30), done = WIRE.imp[key]; if (done && done.final) return; if (now - n.ts < 2 * 60e3 || now - n.ts > 6 * 36e5 && !done) return;
    var p = perpFor(n), t0 = n.ts - n.ts % 60e3, st = t0 - 16 * 60e3, en = Math.min(now, t0 + 61 * 60e3);
    setTimeout(function () {
      var want = [post({ type: 'candleSnapshot', req: { coin: p[0], interval: '1m', startTime: st, endTime: en } })];
      if (p[0] !== 'xyz:SP500') want.push(post({ type: 'candleSnapshot', req: { coin: 'xyz:SP500', interval: '1m', startTime: st, endTime: en } }));
      Promise.all(want).then(function (rs) {
        var calc = function (k) { return CORE.impactCalc(k, n.ts, Date.now()) };
        var a = calc(rs[0]); if (!a) return; var res = { lbl: p[1], pre: a.pre, w: a.w, final: isNum(a.w[60]) };
        if (rs[1]) { var s = calc(rs[1]); if (s) { var lw = [60, 30, 15, 5].filter(function (w) { return isNum(a.w[w]) && isNum(s.w[w]) })[0]; if (lw) { res.rel = a.w[lw] - s.w[lw]; res.relw = lw } } }
        WIRE.imp[key] = res; var ks = Object.keys(WIRE.imp); if (ks.length > 60) ks.sort().slice(0, ks.length - 60).forEach(function (x) { delete WIRE.imp[x] }); LS('mb_imp', WIRE.imp); drawWire();
      }).catch(function () { });
    }, idx * 400);
  });
}
function feed(n) { var h = '', seen = VPREV && VPREV.picks || []; NEWS.forEach(function (x) { if (n !== 'all' && x[1] !== n) return; var isNew = VPREV && seen.indexOf(String(x[3]).slice(0, 80)) < 0 && VPREV.brief !== B.updated; h += '<div class="r"><span class="tm">' + esc(x[0]) + '</span><span>' + (isNew ? '<span class="cat new">NEW</span>' : '') + '<span class="cat">' + esc(x[1]) + '</span><span class="' + (x[2] === 'up' ? 'up' : x[2] === 'dn' ? 'dn' : '') + '">' + (x[2] === 'up' ? '▲ ' : x[2] === 'dn' ? '▼ ' : '') + '</span>' + lite(x[3]) + '</span></div>' }); $('feed').innerHTML = h || '<div class="r"><span></span><span class="mut">Nothing in this filter.</span></div>' }

/* ---------- Memory ---------- */
var MEM = null;
function loadMem() {
  if (MEM) return drawMem();
  fetch('archive/index.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (a) { MEM = Array.isArray(a) ? a.slice().reverse() : []; drawMem() }).catch(function () { $('memlist').innerHTML = '<div class="r mut">Archive not available yet.</div>' });
}
function drawMem() {
  var q = ($('memq').value || '').toLowerCase(), h = '';
  (MEM || []).filter(function (e) { return !q || (e.headline + ' ' + e.label + ' ' + e.date).toLowerCase().indexOf(q) >= 0 }).slice(0, 80).forEach(function (e) { h += '<div class="r" data-f="' + esc(e.file) + '" data-k="' + esc(e.kind) + '"><b>' + esc(e.label || e.date) + '</b> <span class="mut">' + esc(e.kind === 'recap' ? 'recap' : 'brief') + '</span><span class="k">' + esc(e.headline) + '</span></div>' });
  $('memlist').innerHTML = h || '<div class="r mut">No match.</div>';
}
function openMem(file, kind) {
  if (!/^\d{4}-\d{2}-\d{2}\/[\w.]+$/.test(file)) return;
  fetch('archive/' + file, { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return kind === 'recap' ? r.text() : r.json() }).then(function (d) {
    var v = $('memview'); v.innerHTML = '';
    if (kind === 'recap') { var w = document.createElement('div'); w.className = 'recap'; w.appendChild(clean(d)); v.appendChild(w); return }
    var em = (d.opt && d.opt.em || []).map(function (e) { return esc(e[0]) + ' ±' + (+e[1]).toFixed(2) + '%' }).join(', ');
    v.innerHTML = '<div class="sh"><h2>As published ' + esc(d.updatedLabel) + '</h2><span>Read only</span></div><div class="grp"><div class="r"><b>' + esc(d.headline) + '</b><div class="k">' + esc(d.lede) + '</div></div>' +
      '<div class="r k">Base ' + esc(d.base && d.base.label) + ' ' + (d.base ? f(d.base.spx, 2) : '') + ' · trigger ' + (d.ladder ? f(d.ladder.bull, 0) : '') + ' · floor ' + (d.ladder ? f(d.ladder.floor, 0) : '') + (em ? ' · implied ' + em : '') + '</div>' +
      (d.drivers || []).map(function (x) { return '<div class="r"><b>' + esc(x[1]) + '.</b> ' + lite(x[2]) + '</div>' }).join('') +
      (d.ladder ? '<div class="r k"><b>What it expected.</b> Above ' + f(d.ladder.bull, 0) + ': ' + esc(d.ladder.bullText) + ' Below ' + f(d.ladder.floor, 0) + ': ' + esc(d.ladder.riskText) + '</div>' : '') +
      (d.picks || []).slice(0, 8).map(function (x) { return '<div class="r k">' + esc(x[0]) + ' ' + lite(x[3]) + '</div>' }).join('') + '</div>';
  }).catch(function () { $('memview').innerHTML = '<div class="note">Could not load that entry.</div>' });
}

/* ---------- Controls ---------- */
function basisChips() { $('basis').innerHTML = basisDefs().map(function (b) { return '<button class="chipb' + (b[0] === BASIS ? ' on' : '') + '" data-b="' + b[0] + '">' + esc(b[1]) + '</button>' }).join('') }
$('basis').addEventListener('click', function (e) { var b = e.target.closest('[data-b]'); if (!b) return; BASIS = b.dataset.b; LS('mb_basis', BASIS); basisChips(); ensureBases(); render() });
$('filt').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (!b) return; [].forEach.call($('filt').children, function (x) { x.classList.toggle('on', x === b) }); grp = b.dataset.g; ensureBases(); renderBoard() });
$('tb').addEventListener('click', function (e) { var r = e.target.closest('[data-c]'); if (!r) return; openRow = openRow === r.dataset.c ? null : r.dataset.c; renderBoard() });
$('chsw').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; [].forEach.call($('chsw').children, function (x) { x.classList.toggle('on', x === b) }); chartCoin = b.dataset.c; loadChart() });
$('nfilt').addEventListener('click', function (e) { var b = e.target.closest('[data-n]'); if (!b) return; [].forEach.call($('nfilt').children, function (x) { x.classList.toggle('on', x === b) }); WIRE.cat = b.dataset.n; feed(WIRE.cat); drawWire() });
function showTab(p) { [].forEach.call($('tabs').children, function (x) { x.classList.toggle('on', x.dataset.p === p) }); document.querySelectorAll('.panel').forEach(function (x) { x.classList.toggle('on', x.id === 'p-' + p) }); if (p === 'mem') loadMem(); if (p === 'board') { var s = $('ovn'); if (s._pts) drawChart(s._pts) } if (p === 'opts') { renderVix(); vixHist() } if (p === 'hist') histUI(); window.scrollTo(0, 0) }
$('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) showTab(b.dataset.p) });
$('strip').addEventListener('click', function (e) { var t = e.target.closest('[data-go]'); if (t) showTab(t.dataset.go) });
var MODE = LS('mb_mode') || '2';
function setMode(m) { MODE = m; LS('mb_mode', m); document.documentElement.className = 'm' + m; [].forEach.call($('mode').children, function (x) { x.classList.toggle('on', x.dataset.m === m) }); var s = px('xyz:SP500'); if (s) renderLevels(s); $('lvlnote').textContent = m === 'deep' ? 'All levels.' : 'Nearest 4 above and below. Deep shows all.' }
$('mode').addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m) });
$('markread').onclick = function () { VPREV = snapNow(); LS('mb_visit', VPREV); renderSince(); drawWire(); feed(WIRE.cat) };
$('simr').addEventListener('input', function () { SIMTOUCH = true; simOut(+this.value) });
$('simlive').onclick = function () { SIMTOUCH = false; var s = px('xyz:SP500'); if (s) simSet(s) };
$('memq').addEventListener('input', drawMem);
$('memlist').addEventListener('click', function (e) { var r = e.target.closest('[data-f]'); if (r) openMem(r.dataset.f, r.dataset.k) });
$('keybtn').onclick = function () { var p = $('keypanel'); p.style.display = p.style.display === 'none' ? 'block' : 'none' };
$('keysave').onclick = function () { var v = $('keyin').value.trim(), m = $('keymsg'); if (!/^[0-9a-f-]{30,}$/i.test(v)) { m.textContent = 'That does not look like an Unusual Whales token. It is a long code with dashes.'; return } try { localStorage.setItem('uw_key', v); m.textContent = 'Saved on this device. Loading...'; $('keyin').value = ''; WIRE.next = 0; pullWire(true); setTimeout(function () { $('keypanel').style.display = 'none' }, 1500) } catch (e) { m.textContent = 'This browser blocked saving. Turn off Private Browsing and try again.' } };
$('keydel').onclick = function () { try { localStorage.removeItem('uw_key') } catch (e) { } WIRE.items = []; $('wire').innerHTML = '<div class="r"><span></span><span class="mut">Token removed from this device.</span></div>'; setWire(false, 'Live wire off'); $('keymsg').textContent = 'Removed.' };
var TH_ICO = { auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="var(--blue)" stroke="none"/>', light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' };
function setTheme(m) { var h = document.documentElement; if (m === 'auto') h.removeAttribute('data-theme'); else h.setAttribute('data-theme', m); try { m === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', m) } catch (e) { } $('thico').innerHTML = TH_ICO[m]; var nm = { auto: 'Auto', light: 'Light', dark: 'Dark' }[m]; $('thbtn').setAttribute('aria-label', 'Appearance: ' + nm); $('thbtn').title = 'Appearance: ' + nm; var c1 = $('tc1'), c2 = $('tc2'); if (m === 'auto') { c1.content = '#f2f2f7'; c1.media = '(prefers-color-scheme: light)'; c2.content = '#000000'; c2.media = '(prefers-color-scheme: dark)' } else { var col = m === 'dark' ? '#000000' : '#f2f2f7'; c1.content = col; c2.content = col; c1.media = 'all'; c2.media = 'all' } var s = $('ovn'); if (s && s._pts) drawChart(s._pts) }
var THEME = (function () { try { return localStorage.getItem('theme') || 'auto' } catch (e) { return 'auto' } })();
$('thbtn').onclick = function () { THEME = { auto: 'light', light: 'dark', dark: 'auto' }[THEME]; setTheme(THEME) };
function refreshAll() { pullRest(); pullBrief(); WIRE.next = 0; pullWire(true); loadChart(); wsOpen() }
$('refresh').onclick = function () { var b = this; b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); refreshAll() };
var HIDDEN_AT = 0;
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { HIDDEN_AT = Date.now(); saveVisit(); clearTimeout(wsHideT); wsHideT = setTimeout(function () { if (document.hidden && WS) { try { WS.close() } catch (e) { } } }, 30e3) }
  else { clearTimeout(wsHideT); if (HIDDEN_AT && Date.now() - HIDDEN_AT > 10 * 60e3) VPREV = LS('mb_visit'); refreshAll() }
});
window.addEventListener('pagehide', saveVisit);
window.addEventListener('online', refreshAll);
if (window.ResizeObserver) { var ro = new ResizeObserver(function () { var s = $('ovn'); if (s._pts) drawChart(s._pts); renderVix() }); ro.observe($('ovn')); ro.observe($('vixc')) }

