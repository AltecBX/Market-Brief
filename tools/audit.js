/* Data audit (node): missing sessions against the NYSE calendar, candle completeness, timestamps, half days, daily vs intraday
   agreement and possible corporate actions. Writes data/research/audit.json. Run: node tools/audit.js */
const fs = require('fs'), path = require('path'), C = require('../src/core.js');
const D = path.join(__dirname, '..', 'data'), SYMS = ['SPY', 'QQQ', 'SMH', 'NVDA', 'MU', 'AMD', 'SNDK'];
const rd = p => JSON.parse(fs.readFileSync(p));
function expected(a, b) { const out = []; for (let d = a; d <= b; d = C.ymdAdd(d, 1)) if (C.isTradingDay(d)) out.push(d); return out }
function auditIntraday(sym, res) {
  const p = path.join(D, 'intraday', sym + res + '.json'); if (!fs.existsSync(p)) return null;
  const rows = rd(p).rows, by = {}, issues = []; rows.forEach(r => (by[r[0]] = by[r[0]] || []).push(r));
  const days = Object.keys(by).map(Number).sort((a, b) => a - b), full = res === 5 ? 78 : 13, half = res === 5 ? 42 : 7, step = res;
  const dly = {}; try { rd(path.join(D, 'hist', sym + '.json')).rows.forEach(r => { dly[r[0]] = r }) } catch (e) { }
  let partial = 0, mism = 0, bad = 0; const partialDays = [], mismDays = [];
  days.forEach(d => {
    const b = by[d].sort((x, y) => x[1] - y[1]), n = b.length, want = C.isHalfDay(d) ? half : full;
    if (!C.isTradingDay(d)) issues.push(d + ' is not a trading day');
    if (n !== want) { partial++; partialDays.push([d, n, want]) }
    b.forEach((r, i) => { const m = Math.floor(r[1] / 100) * 60 + r[1] % 100; if (m !== 570 + i * step && n === want) bad++ });
    const dr = dly[d]; if (dr && n === want) { const c = b[n - 1][5], o = b[0][2]; if (Math.abs(c / dr[4] - 1) > 0.003 || Math.abs(o / dr[1] - 1) > 0.003) { mism++; mismDays.push([d, +(c / dr[4] - 1).toFixed(4), +(o / dr[1] - 1).toFixed(4)]) } }
  });
  const exp = expected(days[0], days[days.length - 1]), missing = exp.filter(d => !by[d]);
  const gaps = []; let s = null, prev = null; missing.forEach(d => { if (s == null) { s = d; prev = d; return } if (expected(prev, d).length === 2) prev = d; else { gaps.push([s, prev]); s = d; prev = d } }); if (s != null) gaps.push([s, prev]);
  /* possible corporate actions: open to prior close moves over 25% inside the bars */
  /* overnight moves over 25% between consecutive trading days; checked against the daily bars to tell a real move from a corporate action or bad print */
  const jumps = []; for (let i = 1; i < days.length; i++) { if (expected(days[i - 1], days[i]).length !== 2) continue; const a = by[days[i - 1]], b = by[days[i]]; const pc = a[a.length - 1][5], o = b[0][2]; if (Math.abs(o / pc - 1) > 0.25) { const d0 = dly[days[i - 1]], d1 = dly[days[i]]; jumps.push([days[i], +(o / pc - 1).toFixed(3), d0 && d1 && Math.abs((d1[1] / d0[4]) / (o / pc) - 1) < 0.01 ? 'same in daily bars' : 'not confirmed by daily bars']) } }
  return { sym, res, from: days[0], to: days[days.length - 1], sessions: days.length, expected: exp.length, missing: missing.length, gaps, partial, partialDays: partialDays.slice(-10), misalignedBars: bad, dailyMismatch: mism, mismatchDays: mismDays.slice(0, 10), jumps, issues: issues.slice(0, 10) };
}
function auditDaily(sym) {
  const p = path.join(D, 'hist', sym + '.json'); if (!fs.existsSync(p)) return null; const j = rd(p), rows = j.rows, have = {}; rows.forEach(r => { have[r[0]] = 1 });
  const a = Math.max(rows[0][0], 20150101), exp = expected(a, rows[rows.length - 1][0]), missing = exp.filter(d => !have[d]), extra = rows.filter(r => r[0] >= 20150101 && !C.isTradingDay(r[0])).map(r => r[0]);
  return { sym, from: rows[0][0], to: rows[rows.length - 1][0], rows: rows.length, missing: missing.length, missingDays: missing.slice(-15), nonTradingRows: extra.slice(0, 10), breaks: j.breaks || [] };
}
const out = { asof: new Date().toISOString(), note: 'Missing sessions are counted against the NYSE calendar (holidays and 1pm closes included). Intraday history on the current feed reaches back 1 year and each request returns at most 2,500 bars ending at fixed anchors (today, 5 days, 2 weeks, 1 month, 3 months, year to date, 1 year), so 5 minute gaps between those windows cannot be recovered with the tools available.', intraday: [], daily: [] };
SYMS.forEach(s => [5, 30].forEach(r => { const a = auditIntraday(s, r); if (a) out.intraday.push(a) }));
SYMS.concat(['RSP', 'IWM', 'VIX', 'SPX']).forEach(s => { const a = auditDaily(s); if (a) out.daily.push(a) });
fs.writeFileSync(path.join(D, 'research', 'audit.json'), JSON.stringify(out));
if (require.main === module) {
  out.intraday.forEach(a => console.log(a.sym + a.res, a.sessions + '/' + a.expected, 'missing', a.missing, 'gaps', JSON.stringify(a.gaps.slice(0, 6)), 'partial', JSON.stringify(a.partialDays), 'misaligned', a.misalignedBars, 'daily mismatch', a.dailyMismatch, JSON.stringify(a.mismatchDays.slice(0, 3)), 'jumps', JSON.stringify(a.jumps)));
  out.daily.forEach(a => console.log('daily', a.sym, a.rows, 'missing', a.missing, JSON.stringify(a.missingDays.slice(-6)), 'nontrading', JSON.stringify(a.nonTradingRows)));
}
module.exports = { auditIntraday, auditDaily };
