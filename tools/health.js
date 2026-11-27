/* System health (node), run by every scheduled update and by the close run research:
     node tools/health.js           writes data/research/health.json and prints the issues with the action to take
   Detects: missed scheduled updates, a stale brief, missing recaps, stale or incomplete data and research outputs, gaps in the
   prospective record, and integrations reported down. It recovers what it can by itself (recomputes recap facts and the data
   audit); the rest is listed with the action the next scheduled run must take, and the page shows anything unresolved. */
const fs = require('fs'), path = require('path'), C = require('../src/core.js');
const R = path.join(__dirname, '..'), D = path.join(R, 'data'), rd = p => JSON.parse(fs.readFileSync(p));
const SLOTS = [712, 912, 1312, 1512, 1612, 2012], CUTOVER = Date.parse('2026-11-27T09:12:00-05:00');
function etMs(d, hm) { const s = String(d), iso = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + 'T' + String(Math.floor(hm / 100)).padStart(2, '0') + ':' + String(hm % 100).padStart(2, '0') + ':00';
  for (const off of ['-05:00', '-04:00']) { const t = Date.parse(iso + off); const e = C.etParts(t); if (e.d === d && e.hm === hm) return t } return Date.parse(iso + '-05:00') }
function lastSession(now) { const e = C.etParts(now); let d = e.d; const close = C.isHalfDay(d) ? 1315 : 1615; if (!C.isTradingDay(d) || e.hm < close) d = C.ymdAdd(d, -1); while (!C.isTradingDay(d)) d = C.ymdAdd(d, -1); return d }
function tdBetween(a, b) { let n = 0; for (let d = C.ymdAdd(a, 1); d <= b; d = C.ymdAdd(d, 1)) if (C.isTradingDay(d)) n++; return n }
function run(now) {
  now = now || Date.now(); const issues = [], items = [], ls = lastSession(now);
  const add = (area, name, ok, detail, action) => { items.push({ area, name, ok, detail: detail || '' }); if (!ok) issues.push({ area, name, detail: detail || '', action: action || '' }) };
  /* scheduled updates: every weekday slot since the cutover should have an archived brief within an hour */
  let idx = []; try { idx = rd(path.join(R, 'archive', 'index.json')) } catch (e) { }
  const briefs = idx.filter(e => e.kind === 'brief').map(e => etMs(+e.date.replace(/-/g, ''), +e.time));
  const missed = []; for (let k = 0; k < 8; k++) { const d = C.ymdAdd(C.etParts(now).d, -k), w = C.ymdDow(d); if (w > 4) continue;
    SLOTS.forEach(s => { const t = etMs(d, s); if (t < CUTOVER || t + 75 * 60e3 > now) return; if (!briefs.some(b => b >= t - 5 * 60e3 && b <= t + 60 * 60e3)) missed.push(d + ' ' + s) }) }
  add('updates', 'Scheduled updates', !missed.length, missed.length ? missed.length + ' missed: ' + missed.slice(0, 4).map(x => { const [d, s] = x.split(' '); return String(d).slice(4, 6) + '/' + String(d).slice(6) + ' ' + (Math.floor(s / 100) % 12 || 12) + ':' + String(s % 100).padStart(2, '0') + (s < 1200 ? 'am' : 'pm') }).join(', ') : 'every slot published',
    'Nothing to backfill for a missed brief; the next run publishes a current one. If several are missed in a row, check the scheduled task in Claude.');
  let B = null; try { B = rd(path.join(R, 'brief.json')) } catch (e) { }
  const bt = B ? Date.parse(B.updated) : 0, ageH = (now - bt) / 36e5;
  add('updates', 'Brief freshness', !!B && ageH < 6.5, B ? 'published ' + B.updatedLabel + ', ' + ageH.toFixed(1) + ' hours ago' : 'brief.json unreadable', 'The next scheduled run rewrites it.');
  (B && B.gaps || []).forEach(g => add('integrations', 'Brief section ' + g[0], false, g[1], 'Fill it in the next run if the source is reachable.'));
  if (B && /unusual whales/i.test(JSON.stringify(B.gaps || []))) add('integrations', 'Unusual Whales tools', false, 'reported unavailable by the last run', 'Check the connector in Claude.');
  /* recaps: every completed session since the first archived recap */
  let RS = null; try { RS = require('./recapstats.js').run() } catch (e) { }
  add('archive', 'Daily recaps', !!RS && !RS.missing.length, RS ? (RS.missing.length ? 'missing for ' + RS.missing.join(', ') : Object.keys(RS.sessions).length + ' sessions archived') : 'recap facts failed', 'Publish a late recap for each missing session with tools/recap.py install --late.');
  let RJ = null; try { RJ = rd(path.join(R, 'recap.json')) } catch (e) { }
  add('archive', 'Recap tab', !!RJ && +RJ.session.replace(/-/g, '') >= ls, RJ ? RJ.label + ' (' + RJ.session + ')' : 'recap.json missing', 'The Close or Evening run installs the recap for ' + ls + '.');
  /* data freshness */
  const fresh = (name, last, lag, action) => add('data', name, !!last && tdBetween(last, ls) <= lag, last ? 'through ' + last : 'missing', action);
  ['SPX', 'VIX', 'SPY', 'QQQ', 'SMH', 'NVDA', 'MU', 'AMD', 'SNDK', 'RSP', 'IWM'].forEach(s => { let last = null; try { const j = rd(path.join(D, 'hist', s + '.json')); last = j.rows[j.rows.length - 1][0] } catch (e) { } fresh('Daily ' + s, last, 1, 'Close run: tools/history.py cboe and uw with a larger limit to fill the gap.') });
  ['SPY', 'QQQ', 'SMH', 'NVDA', 'MU', 'AMD', 'SNDK'].forEach(s => [5, 30].forEach(r => { let last = null; try { const j = rd(path.join(D, 'intraday', s + r + '.json')); last = j.rows[j.rows.length - 1][0] } catch (e) { } fresh(r + ' minute ' + s, last, 1, 'Close run: get_ticker_candles_by_range 5m with interval 2w (or 1m) end 0d, then tools/history.py intraday.') }));
  const cd = path.join(D, 'chains'); (fs.existsSync(cd) ? fs.readdirSync(cd) : []).forEach(t => { const f = fs.readdirSync(path.join(cd, t)).sort().pop(); fresh('Option chain ' + t, f ? +f.slice(0, 10).replace(/-/g, '') : null, 1, 'Close run: save chain snapshots (UPDATE.md step 5).') });
  /* research outputs and the prospective record */
  ['registry', 'intraday2', 'weekly', 'fingerprint', 'options', 'prospective', 'recaps'].forEach(n => { let a = null; try { a = rd(path.join(D, 'research', n + '.json')).asof } catch (e) { }
    const d = a ? C.etParts(Date.parse(a)).d : null; add('research', 'Research ' + n, !!d && tdBetween(d, ls) <= 1, d ? 'computed ' + d : 'missing', 'Close run: node tools/research.js.') });
  const pd = path.join(D, 'prospective', 'intraday'), pf = fs.existsSync(pd) ? fs.readdirSync(pd).map(f => +f.slice(0, 8)) : [], expect = [];
  for (let d = 20261130; d <= ls; d = C.ymdAdd(d, 1)) if (C.isTradingDay(d) && !C.isHalfDay(d)) expect.push(d);
  const pmiss = expect.filter(d => pf.indexOf(d) < 0); add('research', 'Prospective record', !pmiss.length, pmiss.length ? 'no predictions recorded for ' + pmiss.join(', ') : (pf.length ? pf.length + ' sessions recorded' : 'first full session is Nov 30 2026'), 'Close run: node tools/research.js records any missing eligible sessions.');
  const out = { asof: new Date(now).toISOString(), lastSession: ls, ok: !issues.length, issues, items };
  fs.writeFileSync(path.join(D, 'research', 'health.json'), JSON.stringify(out));
  return out;
}
module.exports = { run, lastSession };
if (require.main === module) { const r = run(); console.log(r.ok ? 'Health OK' : r.issues.length + ' issues:'); r.issues.forEach(i => console.log(' ', i.area, '|', i.name, '|', i.detail, '| action:', i.action)) }
