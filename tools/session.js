/* Which scheduled row is this, by the NYSE calendar? Prints JSON: {now, date, row, recap, session, close, halfDay, holiday}.
   Run: node tools/session.js [ISO time]   (defaults to now)
   Rows: 7 Morning, 9 Pre open, 13 Midday (Close on 1pm half days), 15 Afternoon, 16 Close (Evening on half days), 20 Evening.
   recap is true only on the run that follows the actual close of a completed session (about 12 minutes after it). */
const C = require('../src/core.js');
const t = process.argv[2] ? Date.parse(process.argv[2]) : Date.now(), e = C.etParts(t), d = e.d, hr = Math.floor(e.hm / 100);
const trading = C.isTradingDay(d), half = trading && C.isHalfDay(d), closeHm = half ? 1300 : 1600;
let row = hr < 9 ? 'Morning' : hr < 12 ? 'Pre open' : hr < 15 ? 'Midday' : hr < 16 ? 'Afternoon' : hr < 20 ? 'Close' : 'Evening';
let recap = false;
if (trading && half) { if (hr === 13) row = 'Close'; else if (hr >= 15 && hr < 20) row = 'Evening'; }
if (trading && (row === 'Close' || row === 'Evening') && e.hm >= closeHm + 10) recap = true; /* the Evening run catches up if the Close run did not publish */
if (!trading && (row === 'Close')) row = 'Evening';
const fmt = x => String(x).slice(0, 4) + '-' + String(x).slice(4, 6) + '-' + String(x).slice(6, 8);
console.log(JSON.stringify({ now: new Date(t).toISOString(), date: fmt(d), row, recap, session: recap ? fmt(d) : null, close: trading ? (half ? '1:00pm' : '4:00pm') : null, halfDay: half, holiday: !trading && C.ymdDow(d) <= 4 }));
