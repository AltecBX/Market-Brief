/* Prospective record (node). Run at the end of every close run by tools/research.js.
   1. Every model version (instrument, time window, outcome, model family, frozen settings) is registered once in
      data/prospective/versions.json with the time it was registered. Entries are never edited or removed.
   2. For each full trading session that started after a version was registered, the version is fit on sessions before that day only
      and its prediction is recorded at 9:35, 9:40, 9:45, 10am and every 30 minutes to 3:30pm from the bars up to each time.
      Predictions are written once to data/prospective/intraday/YYYYMMDD.json and never rewritten. They are computed at the close run,
      but nothing from the session after each checkpoint can reach them: the settings were registered before the open, the fit uses
      earlier sessions only, and the features read only bars up to the checkpoint (tested in tests/core.test.js).
   3. Weekly versions record the rest of week estimate at each day's close in the same file.
   4. data/research/prospective.json scores every version on sessions whose outcome is known. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), CORE = require('../src/core.js'), ML = require('./ml.js'), I2 = require('./intraday2.js');
const D = path.join(__dirname, '..', 'data'), PD = path.join(D, 'prospective'), VF = path.join(PD, 'versions.json');
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const SPECS = { tod: { m: 'tod' }, pos: { m: 'pos', a: 10 } };
const rd = p => JSON.parse(fs.readFileSync(p));
function nowISO() { return new Date().toISOString() }
function etDate(iso) { return CORE.etParts(Date.parse(iso)) }

function register() {
  const V = fs.existsSync(VF) ? rd(VF) : { note: 'Model versions registered for prospective testing. Append only: an entry is never edited or removed. A version is eligible for sessions that open after its registration time.', versions: [] };
  const have = new Set(V.versions.map(v => v.id)), I = rd(path.join(D, 'research', 'intraday2.json')), WK = rd(path.join(D, 'research', 'weekly.json')), ts = nowISO(); let added = 0;
  Object.keys(I.inst).forEach(sym => Object.keys(I.inst[sym].windows).forEach(w => Object.keys(I.inst[sym].windows[w].outcomes).forEach(o => {
    const E = I.inst[sym].windows[w].outcomes[o].models;
    Object.keys(E).forEach(f => { const spec = E[f].spec || SPECS[f]; if (!spec) return; const id = sha(['intraday', sym, w, o, f, JSON.stringify(spec)].join('|')); if (have.has(id)) return; have.add(id); added++;
      V.versions.push({ id, kind: 'intraday', sym, window: w, outcome: o, family: f, spec, registered: ts, promotedAtRegistration: !!E[f].promoted }) });
  })));
  Object.keys(WK.inst).forEach(sym => { const X = WK.inst[sym]; if (X.error) return; Object.keys(X.outcomes).forEach(o => ['day', 'daypos', 'logit'].forEach(f => { const id = sha(['weekly', sym, o, f].join('|')); if (have.has(id)) return; have.add(id); added++;
    V.versions.push({ id, kind: 'weekly', sym, outcome: o, family: f, spec: { m: f }, registered: ts }) })) });
  if (added) { fs.mkdirSync(PD, { recursive: true }); fs.writeFileSync(VF, JSON.stringify(V)) }
  return { V, added };
}
/* first session a version may predict: the first trading day whose 9:30am open is after the registration time */
function eligibleFrom(iso) { const e = etDate(iso); return e.hm < 930 && CORE.isTradingDay(e.d) ? e.d : (function () { let d = CORE.ymdAdd(e.d, 1); while (!CORE.isTradingDay(d)) d = CORE.ymdAdd(d, 1); return d })() }

function recordIntraday(V) {
  const C = I2.context(), dir = path.join(PD, 'intraday'); fs.mkdirSync(dir, { recursive: true });
  const vs = V.versions.filter(v => v.kind === 'intraday'), first = Math.min(...vs.map(v => eligibleFrom(v.registered))), byKey = {};
  vs.forEach(v => { (byKey[v.sym + '|' + v.window] = byKey[v.sym + '|' + v.window] || []).push(v) });
  const written = [];
  const rowsCache = {}; const rowsOf = (sym, w) => rowsCache[sym + w] || (rowsCache[sym + w] = I2.build(sym, w, C));
  /* candidate days: full sessions with cash bars on or after the first eligible day */
  const days = new Set(); Object.keys(byKey).forEach(k => { const [sym, w] = k.split('|'); rowsOf(sym, w).forEach(r => { if (r.d >= first) days.add(r.d) }) });
  [...days].sort((a, b) => a - b).forEach(d => {
    const f = path.join(dir, d + '.json'); if (fs.existsSync(f)) return; /* written once, never again */
    const rec = { date: d, recordedAt: nowISO(), method: 'Fit on sessions before this date only; features from bars up to each checkpoint; settings registered before the open.', x: {}, p: {} };
    Object.keys(byKey).forEach(k => { const [sym, w] = k.split('|'), rows = rowsOf(sym, w), today = rows.filter(r => r.d === d), past = rows.filter(r => r.d < d); if (!today.length) return;
      rec.x[k] = {}; today.forEach(r => { rec.x[k][r.k] = r.x.map(v => +v.toFixed(5)) });
      byKey[k].forEach(v => { if (eligibleFrom(v.registered) > d) return; const M = ML.fit(v.spec, past.map(r => r.x), past.map(r => r.o[v.outcome])); rec.p[v.id] = {}; today.forEach(r => { rec.p[v.id][r.k] = +CORE.mlPredict(M, r.x).toFixed(4) }) }) });
    if (Object.keys(rec.p).length) { fs.writeFileSync(f, JSON.stringify(rec)); written.push(d) }
  });
  return written;
}
function recordWeekly(V) {
  const dir = path.join(PD, 'weekly'); fs.mkdirSync(dir, { recursive: true }); const vs = V.versions.filter(v => v.kind === 'weekly'); if (!vs.length) return [];
  const VIX = {}; rd(path.join(D, 'hist', 'VIX.json')).rows.forEach(r => { VIX[r[0]] = r[4] }); const written = [];
  const syms = [...new Set(vs.map(v => v.sym))], first = Math.min(...vs.map(v => eligibleFrom(v.registered)));
  const data = {}; syms.forEach(s => { const rows = rd(path.join(D, 'hist', s + '.json')).rows; data[s] = { rows, Wk: CORE.weeksOf(rows) } });
  const days = new Set(); syms.forEach(s => data[s].rows.forEach(r => { if (r[0] >= first) days.add(r[0]) }));
  [...days].sort((a, b) => a - b).forEach(d => {
    const f = path.join(dir, d + '.json'); if (fs.existsSync(f)) return;
    const rec = { date: d, recordedAt: nowISO(), method: 'State at this day\'s close; models fit on finished weeks before this week only.', p: {}, state: {} };
    syms.forEach(s => { const { rows, Wk } = data[s], k = rows.findIndex(r => r[0] === d); if (k < 0) return; const wi = Wk.findIndex(W => W.some(r => r[0] === d)), w = Wk[wi], j = w.findIndex(r => r[0] === d);
      if (CORE.weekComplete(w.slice(0, j + 1), d)) return; /* last trading day of the week: nothing left to predict */
      const cx = CORE.wctx(Wk, wi, rows, k, VIX), st = CORE.wstate(w, j, cx); rec.state[s] = { x: st.x.map(v => +v.toFixed(5)), c: st.c, o: st.o, hi: st.hi, lo: st.lo };
      const train = []; for (let q = 20; q < wi; q++) { const W = Wk[q]; if (!CORE.weekComplete(W, rows[rows.length - 1][0])) continue; W.forEach((r, jj) => { if (jj >= W.length - 1) return; const kk = rows.findIndex(z => z[0] === r[0]), s2 = CORE.wstate(W, jj, CORE.wctx(Wk, q, rows, kk, VIX)); train.push({ x: s2.x, W, jj, s2 }) }) }
      vs.filter(v => v.sym === s && eligibleFrom(v.registered) <= d).forEach(v => { const ys = train.map(t => wOutcome(t.W, t.jj, t.s2, v.outcome)), ok = train.filter((_, i) => ys[i] != null); if (ok.length < 100) return;
        const M = wfit(v.family, ok.map(t => t.x), ys.filter(y => y != null)); rec.p[v.id] = +CORE.wpred(M, st.x).toFixed(4) }) });
    if (Object.keys(rec.p).length) { fs.writeFileSync(f, JSON.stringify(rec)); written.push(d) }
  });
  return written;
}
function wOutcome(W, j, s, o) {
  let ha = -1e18, la = 1e18; for (let i = j + 1; i < W.length; i++) { ha = Math.max(ha, W[i][2]); la = Math.min(la, W[i][3]) } const fc = W[W.length - 1][4];
  if (o === 'highSet') return ha <= s.hi ? 1 : 0; if (o === 'lowSet') return la >= s.lo ? 1 : 0; if (o === 'revisitOpen') return s.c > s.o ? (la <= s.o ? 1 : 0) : (ha >= s.o ? 1 : 0);
  if (o === 'finishAbove') return fc > s.c ? 1 : 0; if (o === 'recover') return s.c < s.o ? (fc >= s.o ? 1 : 0) : null; return null;
}
function wfit(kind, X, y) {
  if (kind === 'day' || kind === 'daypos') { const M = { type: kind === 'day' ? 'wday' : 'wdaypos', p: {}, base: CORE.mean(y) }, c = {}; X.forEach((x, i) => { const k = kind === 'day' ? Math.round(x[3] * 4) : Math.round(x[3] * 4) + '|' + Math.min(2, Math.floor(x[1] * 3)); (c[k] = c[k] || []).push(y[i]) }); Object.keys(c).forEach(k => { M.p[k] = (CORE.mean(c[k]) * c[k].length + M.base * (kind === 'day' ? 5 : 10)) / (c[k].length + (kind === 'day' ? 5 : 10)) }); return M }
  return ML.fitLogit(X, y, 10);
}

/* score every version on predictions whose outcome is now known */
function evaluate(V) {
  const C = I2.context(), out = { asof: nowISO(), note: 'Scores only predictions recorded after each version was registered. Skill compares each version with the time of day version on the same instrument, window, outcome and checkpoints.', versions: {} };
  const dir = path.join(PD, 'intraday'), files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [], rowsCache = {}, outc = {};
  const rowsOf = (sym, w) => rowsCache[sym + w] || (rowsCache[sym + w] = I2.build(sym, w, C));
  files.forEach(fn => { const rec = rd(path.join(dir, fn)); Object.keys(rec.p).forEach(id => { const v = V.versions.find(z => z.id === id); if (!v) return; const rows = rowsOf(v.sym, v.window).filter(r => r.d === rec.date);
    Object.keys(rec.p[id]).forEach(k => { const r = rows.find(z => z.k === +k); if (!r) return; (outc[id] = outc[id] || []).push([rec.date, +k, rec.p[id][k], r.o[v.outcome]]) }) }) });
  V.versions.filter(v => v.kind === 'intraday').forEach(v => { const a = outc[v.id] || [], tod = V.versions.find(z => z.kind === 'intraday' && z.sym === v.sym && z.window === v.window && z.outcome === v.outcome && z.family === 'tod'), b = tod ? outc[tod.id] || [] : [];
    const key = x => x[0] + '|' + x[1], bm = {}; b.forEach(x => { bm[key(x)] = x[2] }); const pair = a.filter(x => bm[key(x)] != null);
    const br = (p, y) => CORE.mean(p.map((q, i) => (q - y[i]) ** 2)), sessions = new Set(a.map(x => x[0])).size;
    out.versions[v.id] = { sessions, n: a.length, brier: a.length ? +br(a.map(x => x[2]), a.map(x => x[3])).toFixed(4) : null, bss: pair.length ? +(1 - br(pair.map(x => x[2]), pair.map(x => x[3])) / br(pair.map(x => bm[key(x)]), pair.map(x => x[3]))).toFixed(3) : null } });
  /* weekly: outcome known once the week has finished */
  const wdir = path.join(PD, 'weekly'), wf = fs.existsSync(wdir) ? fs.readdirSync(wdir).sort() : [], H = {}, wres = {};
  wf.forEach(fn => { const rec = rd(path.join(wdir, fn)); Object.keys(rec.p).forEach(id => { const v = V.versions.find(z => z.id === id); if (!v) return; const rows = H[v.sym] || (H[v.sym] = rd(path.join(D, 'hist', v.sym + '.json')).rows), Wk = CORE.weeksOf(rows), W = Wk.find(w => w.some(r => r[0] === rec.date));
    if (!W || !CORE.weekComplete(W, rows[rows.length - 1][0])) return; const j = W.findIndex(r => r[0] === rec.date), s = rec.state[v.sym], y = wOutcome(W, j, { hi: s.hi, lo: s.lo, c: s.c, o: s.o }, v.outcome); if (y == null) return; (wres[id] = wres[id] || []).push([rec.p[id], y]) }) });
  V.versions.filter(v => v.kind === 'weekly').forEach(v => { const a = wres[v.id] || []; out.versions[v.id] = { n: a.length, brier: a.length ? +CORE.mean(a.map(x => (x[0] - x[1]) ** 2)).toFixed(4) : null } });
  fs.writeFileSync(path.join(D, 'research', 'prospective.json'), JSON.stringify(out));
  return out;
}
function run() { const r = register(), wi = recordIntraday(r.V), ww = recordWeekly(r.V), ev = evaluate(r.V); return { added: r.added, versions: r.V.versions.length, intradayDays: wi, weeklyDays: ww, scored: Object.values(ev.versions).filter(x => x.n).length } }
module.exports = { run, register, eligibleFrom };
if (require.main === module) console.log(JSON.stringify(run()));
