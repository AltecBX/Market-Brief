/* ---------- Start ---------- */
setTheme(THEME); setMode(MODE); sectors(); applyBrief(DEF); BRIEF_V = '';
pullRest(); wsOpen(); pullBrief(); pullWire(); setTimeout(autoHist, 2500);
setInterval(pullRest, 15e3); setInterval(function () { pullWire() }, 60e3); setInterval(pullBrief, 5 * 60e3); setInterval(function () { if (!document.hidden) loadChart() }, 5 * 60e3);
setInterval(function () { if (!document.hidden) { renderStatus(); if (!WSOK && !WS) wsOpen() } }, 1e3);
setInterval(function () { if (!document.hidden) render() }, 5e3);
setInterval(function () { if (!document.hidden) saveVisit() }, 60e3);
