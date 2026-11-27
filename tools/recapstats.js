/* What happened after each archived recap, and whether its outlook held. Writes data/research/recaps.json (derived data;
   the archived recaps themselves are never touched). Run: node tools/recapstats.js
   Forward moves: closes 1, 3, 5, 10, 20 and 60 trading sessions after the recap's session, from data/hist daily bars.
   Day facts for search: S&P and stock moves, intraday reversal, VIX spike, earnings and economic event tags.
   Outlook: levels and call from the recap's #next data-outlook attribute; for recaps published before that attribute existed,
   levels quoted from the original text are kept in data/research/recap_outlooks.json and labeled as quoted. */
const fs = require('fs'), path = require('path'), C = require('../src/core.js');
const R = path.join(__dirname, '..'), D = path.join(R, 'data');
const SYMS = ['SPY', 'QQQ', 'NVDA', 'MU', 'SNDK', 'SMH'], H = [1, 3, 5, 10, 20, 60];
const rd = p => JSON.parse(fs.readFileSync(p));
function rows(s) { try { return rd(path.join(D, 'hist', s + '.json')).rows } catch (e) { return [] } }
function outlookOf(file) {
  const html = fs.readFileSync(path.join(R, 'archive', file), 'utf8'), m = html.match(/id="next"[^>]*data-outlook='([^']+)'/) || html.match(/data-outlook='([^']+)'[^>]*id="next"/);
  if (m) { try { return Object.assign(JSON.parse(m[1]), { source: 'stated in the recap' }) } catch (e) { } }
  try { const q = rd(path.join(D, 'research', 'recap_outlooks.json'))[file]; if (q) return Object.assign({}, q, { source: 'levels quoted from the original recap text' }) } catch (e) { }
  return null;
}
function zone(px, o) { return px > o.bull ? 'Bull' : px < o.bear ? 'Bear' : 'Base' }
function run() {
  const idx = rd(path.join(R, 'archive', 'index.json')).filter(e => e.kind === 'recap'), byDate = {};
  idx.forEach(e => { byDate[e.date] = byDate[e.date] || []; byDate[e.date].push(e) });
  const data = {}; SYMS.concat(['VIX', 'SPX']).forEach(s => { data[s] = rows(s) });
  const earn = (() => { try { return rd(path.join(D, 'hist', 'earnings.json')).dates } catch (e) { return {} } })();
  const out = { asof: new Date().toISOString(), horizons: H, syms: SYMS.concat(['VIX']), note: 'Computed later from daily closes. Not part of the original recaps, which are never edited.', sessions: {} };
  Object.keys(byDate).sort().forEach(date => {
    const d = +date.replace(/-/g, ''), ent = byDate[date], orig = ent[0], S = { date, file: orig.file, versions: ent.map(e => e.file), day: {}, fwd: {}, tags: [] };
    SYMS.concat(['VIX']).forEach(s => { const r = data[s], i = r.findIndex(x => x[0] === d); if (i < 1) return; const c = r[i][4];
      S.day[s] = { close: c, chg: +((c / r[i - 1][4] - 1) * 100).toFixed(2), open: r[i][1], high: r[i][2], low: r[i][3] };
      S.fwd[s] = {}; H.forEach(k => { const j = i + k; S.fwd[s][k] = j < r.length ? (s === 'VIX' ? +(r[j][4] - c).toFixed(2) : +((r[j][4] / c - 1) * 100).toFixed(2)) : null }) });
    /* search facts */
    const spy = S.day.SPY, tags = new Set(orig.tags || []);
    if (spy) { const a = Math.abs(spy.chg); if (a >= 1) tags.add('S&P move 1%+'); if (a >= 2) tags.add('S&P move 2%+'); if (a >= 3) tags.add('S&P move 3%+');
      const rng = spy.high - spy.low, dn = (spy.open - spy.low) / spy.open * 100, up = (spy.high - spy.open) / spy.open * 100;
      if (rng > 0 && ((dn >= 1 && (spy.close - spy.low) / rng >= 0.6) || (up >= 1 && (spy.high - spy.close) / rng >= 0.6))) { tags.add('Intraday reversal'); S.reversal = true } }
    S.extreme = SYMS.filter(s => S.day[s] && Math.abs(S.day[s].chg) >= (['SPY', 'QQQ', 'SMH'].indexOf(s) >= 0 ? 3 : 7)).map(s => s + ' ' + (S.day[s].chg > 0 ? '+' : '') + S.day[s].chg + '%');
    if (S.extreme.length) tags.add('Extreme stock move');
    const v = S.day.VIX; if (v && (v.chg >= 15 || v.close >= 30)) tags.add('Volatility spike');
    Object.keys(earn).forEach(tk => earn[tk].forEach(e => { const r0 = +e[0].replace(/-/g, ''); const react = e[1] === 'pre' ? r0 : (data.SPY.find(x => x[0] > r0) || [0])[0]; if (react === d) tags.add(tk + ' earnings') }));
    if ([...tags].some(t => /earnings/i.test(t))) tags.add('Earnings');
    if ([...tags].some(t => /^(Fed|CPI|Jobs|Inflation|GDP|PCE|Policy|Tariffs)$/i.test(t))) tags.add('Economic event');
    S.tags = [...tags];
    /* outlook accountability */
    const o = outlookOf(orig.file), spx = data.SPX, i = spx.findIndex(x => x[0] === d);
    if (o && o.bull && o.bear && i >= 0) {
      const res = { source: o.source, levels: { bull: o.bull, base: o.base || null, bear: o.bear }, call: o.call || null, checks: [] };
      [1, 5].forEach(k => { if (i + k >= spx.length) { res.checks.push({ k, pending: true }); return } const w = spx.slice(i + 1, i + k + 1).map(x => x[x.length - 1]), last = w[w.length - 1];
        res.checks.push({ k, close: last, zone: zone(last, o), bullHit: Math.max(...w) > o.bull, bearHit: Math.min(...w) < o.bear, callRight: o.call ? o.call === zone(last, o) : null }) });
      S.outlook = res;
    } else S.outlook = { source: o ? o.source : 'no levels or call in the original recap', pending: !o };
    out.sessions[date] = S;
  });
  /* archive protection: every completed session since the first recap needs a recap */
  const first = Object.keys(byDate).sort()[0], last = C.etParts(Date.now());
  const missing = []; if (first) { let x = +first.replace(/-/g, ''); const lim = last.hm >= 1615 || !C.isTradingDay(last.d) ? last.d : C.ymdAdd(last.d, -1);
    while (x <= lim) { if (C.isTradingDay(x)) { const k = String(x).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); if (!byDate[k] && !(x === last.d && last.hm < (C.isHalfDay(x) ? 1330 : 1630))) missing.push(k) } x = C.ymdAdd(x, 1) } }
  out.missing = missing;
  fs.writeFileSync(path.join(D, 'research', 'recaps.json'), JSON.stringify(out));
  return out;
}
module.exports = { run };
if (require.main === module) { const r = run(); console.log(Object.keys(r.sessions).length, 'recaps, missing', JSON.stringify(r.missing)); Object.values(r.sessions).forEach(s => console.log(s.date, s.tags.join(', '), JSON.stringify(s.outlook))) }
