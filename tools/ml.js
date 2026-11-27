/* Model fitting for the research engines (node only). Prediction lives in src/core.js (mlPredict) so the page uses identical math.
   Every fit uses only the rows it is given; callers are responsible for chronological separation. */
var CORE = require('../src/core.js');

function rng(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } }
function colStats(X) {
  var m = X[0].length, mu = [], sd = [];
  for (var j = 0; j < m; j++) { var a = 0; X.forEach(function (r) { a += r[j] }); a /= X.length; var v = 0; X.forEach(function (r) { v += (r[j] - a) * (r[j] - a) }); mu.push(a); sd.push(Math.sqrt(v / X.length) || 1) }
  return { mu: mu, sd: sd };
}

/* Historical conditional frequency tables with shrinkage toward the parent cell */
function fitFreq(X, y, kind, a) {
  a = a == null ? 10 : a; var ri = CORE.IFEAT.indexOf('rng'), rs = X.map(function (r) { return r[ri] }).sort(function (p, q) { return p - q });
  var cut = [rs[Math.floor(rs.length / 3)], rs[Math.floor(rs.length * 2 / 3)]], M = { type: 'freq', kind: kind, cut: cut, p: {}, base: CORE.mean(y) };
  var cnt = {}; X.forEach(function (x, i) { CORE.freqKey(M, x).forEach(function (k) { var c = cnt[k] || (cnt[k] = [0, 0]); c[0] += y[i]; c[1]++ }) });
  var keys = Object.keys(cnt).sort(function (p, q) { return p.split('|').length - q.split('|').length });
  keys.forEach(function (k) { var parts = k.split('|'), par = parts.length > 1 ? M.p[parts.slice(0, parts.length === 4 ? 2 : parts.length - 1).join('|')] : M.base; if (par == null) par = M.base; var c = cnt[k]; M.p[k] = (c[0] + a * par) / (c[1] + a) });
  Object.keys(M.p).forEach(function (k) { M.p[k] = Math.round(M.p[k] * 1e4) / 1e4 });
  return M;
}

/* L2 regularized logistic regression by Newton steps */
function solve(A, b) {
  var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]) });
  for (var i = 0; i < n; i++) { var p = i; for (var r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; var t = M[i]; M[i] = M[p]; M[p] = t; var d = M[i][i] || 1e-12;
    for (var r2 = 0; r2 < n; r2++) if (r2 !== i) { var f = M[r2][i] / d; for (var c = i; c <= n; c++) M[r2][c] -= f * M[i][c] } }
  return M.map(function (r, i) { return r[n] / (r[i] || 1e-12) });
}
function fitLogit(X, y, lambda) {
  var st = colStats(X), m = X[0].length, Z = X.map(function (r) { return r.map(function (v, j) { return (v - st.mu[j]) / st.sd[j] }) }), w = new Array(m + 1).fill(0);
  for (var it = 0; it < 25; it++) {
    var g = new Array(m + 1).fill(0), H = []; for (var a = 0; a <= m; a++) H.push(new Array(m + 1).fill(0));
    Z.forEach(function (z, i) { var s = w[m]; for (var j = 0; j < m; j++) s += w[j] * z[j]; var p = CORE.sigm(s), e = p - y[i], v = Math.max(p * (1 - p), 1e-6), zz = z.concat([1]);
      for (var j2 = 0; j2 <= m; j2++) { g[j2] += e * zz[j2]; for (var k = j2; k <= m; k++) H[j2][k] += v * zz[j2] * zz[k] } });
    for (var j3 = 0; j3 <= m; j3++) { for (var k2 = 0; k2 < j3; k2++) H[j3][k2] = H[k2][j3]; if (j3 < m) { g[j3] += lambda * w[j3]; H[j3][j3] += lambda } }
    var step = solve(H, g), mx = 0; for (var q = 0; q <= m; q++) { w[q] -= step[q]; mx = Math.max(mx, Math.abs(step[q])) } if (mx < 1e-6) break;
  }
  return { type: 'logit', lambda: lambda, mu: st.mu.map(r4), sd: st.sd.map(r4), w: w.slice(0, m).map(r4), b: r4(w[m]) };
}
function r4(v) { return Math.round(v * 1e4) / 1e4 }

/* Histogram trees shared by boosting and the random forest */
function edges(X, nb) {
  return X[0].map(function (_, j) { var v = X.map(function (r) { return r[j] }).sort(function (a, b) { return a - b }), e = []; for (var q = 1; q < nb; q++) { var x = v[Math.floor(v.length * q / nb)]; if (!e.length || x > e[e.length - 1]) e.push(x) } return e });
}
function binOf(E, v) { var lo = 0, hi = E.length; while (lo < hi) { var m = (lo + hi) >> 1; if (v <= E[m]) hi = m; else lo = m + 1 } return lo }
function buildTree(Bx, idx, E, opt, leafFn, gainFn, feats, rnd) {
  var nodes = [];
  function grow(ids, d) {
    var me = nodes.length; nodes.push(null);
    if (d >= opt.depth || ids.length < 2 * opt.minLeaf) { nodes[me] = [leafFn(ids)]; return me }
    var fs = feats; if (opt.mtry && opt.mtry < feats.length) { fs = feats.slice(); for (var i = fs.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = fs[i]; fs[i] = fs[j]; fs[j] = t } fs = fs.slice(0, opt.mtry) }
    var best = null;
    fs.forEach(function (f) { var nb = E[f].length + 1, A = []; for (var b = 0; b < nb; b++) A.push([0, 0, 0]); ids.forEach(function (i) { var c = A[Bx[i][f]]; var s = opt.stat(i); c[0] += s[0]; c[1] += s[1]; c[2]++ });
      var tot = A.reduce(function (t, c) { return [t[0] + c[0], t[1] + c[1], t[2] + c[2]] }, [0, 0, 0]), L = [0, 0, 0];
      for (var b2 = 0; b2 < nb - 1; b2++) { L = [L[0] + A[b2][0], L[1] + A[b2][1], L[2] + A[b2][2]]; var R = [tot[0] - L[0], tot[1] - L[1], tot[2] - L[2]]; if (L[2] < opt.minLeaf || R[2] < opt.minLeaf) continue; var gn = gainFn(L, R, tot); if (!best || gn > best.g) best = { g: gn, f: f, b: b2 } } });
    if (!best || best.g <= 1e-9) { nodes[me] = [leafFn(ids)]; return me }
    var li = ids.filter(function (i) { return Bx[i][best.f] <= best.b }), ri = ids.filter(function (i) { return Bx[i][best.f] > best.b });
    var l = grow(li, d + 1), r = grow(ri, d + 1); nodes[me] = [best.f, E[best.f][best.b], l, r]; return me;
  }
  grow(idx, 0); return nodes;
}
function fitGBT(X, y, opt) {
  var E = edges(X, 32), Bx = X.map(function (r) { return r.map(function (v, j) { return binOf(E[j], v) }) }), n = X.length, p0 = Math.min(0.99, Math.max(0.01, CORE.mean(y))), f0 = Math.log(p0 / (1 - p0)), F = new Array(n).fill(f0), feats = X[0].map(function (_, j) { return j }), trees = [], all = F.map(function (_, i) { return i });
  for (var t = 0; t < opt.n; t++) {
    var G = F.map(function (f, i) { return CORE.sigm(f) - y[i] }), Hs = F.map(function (f) { var p = CORE.sigm(f); return Math.max(p * (1 - p), 1e-6) });
    var o = { depth: opt.depth, minLeaf: opt.minLeaf || 20, stat: function (i) { return [G[i], Hs[i]] } };
    var T = buildTree(Bx, all, E, o, function (ids) { var g = 0, h = 0; ids.forEach(function (i) { g += G[i]; h += Hs[i] }); return r4(-g / (h + 1)) },
      function (L, R, A) { return L[0] * L[0] / (L[1] + 1) + R[0] * R[0] / (R[1] + 1) - A[0] * A[0] / (A[1] + 1) }, feats);
    trees.push(T); for (var i = 0; i < n; i++) F[i] += opt.lr * treeLeaf(T, X[i]);
  }
  return { type: 'gbt', f0: r4(f0), lr: opt.lr, depth: opt.depth, trees: trees };
}
function treeLeaf(T, x) { var i = 0; while (T[i].length === 4) i = x[T[i][0]] <= T[i][1] ? T[i][2] : T[i][3]; return T[i][0] }
function fitRF(X, y, opt) {
  var E = edges(X, 32), Bx = X.map(function (r) { return r.map(function (v, j) { return binOf(E[j], v) }) }), n = X.length, feats = X[0].map(function (_, j) { return j }), rnd = rng(opt.seed || 11), trees = [];
  for (var t = 0; t < opt.n; t++) {
    var ids = []; for (var i = 0; i < n; i++) ids.push(Math.floor(rnd() * n));
    var o = { depth: opt.depth, minLeaf: opt.minLeaf || 15, mtry: opt.mtry, stat: function (i) { return [y[i], 0] } };
    trees.push(buildTree(Bx, ids, E, o, function (q) { var s = 0; q.forEach(function (i) { s += y[i] }); return r4((s + 1) / (q.length + 2)) },
      function (L, R, A) { var gi = function (c) { var p = c[0] / c[2]; return c[2] * p * (1 - p) }; return gi(A) - gi(L) - gi(R) }, feats, rnd));
  }
  return { type: 'rf', depth: opt.depth, mtry: opt.mtry, trees: trees };
}
function fitKNN(X, y, k, cols) {
  cols = cols || X[0].map(function (_, j) { return j });
  var sub = X.map(function (r) { return cols.map(function (j) { return r[j] }) }), st = colStats(sub);
  return { type: 'knn', k: k, cols: cols, mu: st.mu.map(r4), sd: st.sd.map(r4), X: sub.map(function (r) { return r.map(function (v, j) { return Math.round((v - st.mu[j]) / st.sd[j] * 100) / 100 }) }), y: y.slice() };
}
/* Percentile table of remaining moves with the same keys as the conditional frequency model */
function fitQ(X, up, dn, minN) {
  var ri = CORE.IFEAT.indexOf('rng'), rs = X.map(function (r) { return r[ri] }).sort(function (p, q) { return p - q }), Q = { cut: [rs[Math.floor(rs.length / 3)], rs[Math.floor(rs.length * 2 / 3)]], t: {}, minN: minN || 25 }, acc = {};
  X.forEach(function (x, i) { CORE.freqKey({ kind: 'cond', cut: Q.cut }, x).forEach(function (k) { var a = acc[k] || (acc[k] = [[], []]); a[0].push(up[i]); a[1].push(dn[i]) }) });
  var qt = function (v, p) { v = v.slice().sort(function (a, b) { return a - b }); return Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))] * 1000) / 1000 };
  Object.keys(acc).forEach(function (k) { var a = acc[k]; if (a[0].length >= 10) Q.t[k] = { n: a[0].length, up: [qt(a[0], 0.1), qt(a[0], 0.5), qt(a[0], 0.9)], dn: [qt(a[1], 0.1), qt(a[1], 0.5), qt(a[1], 0.9)] } });
  return Q;
}
function fit(spec, X, y) {
  if (spec.m === 'tod' || spec.m === 'pos' || spec.m === 'cond') return fitFreq(X, y, spec.m, spec.a);
  if (spec.m === 'logit') return fitLogit(X, y, spec.lambda);
  if (spec.m === 'gbt') return fitGBT(X, y, spec);
  if (spec.m === 'rf') return fitRF(X, y, spec);
  if (spec.m === 'knn') return fitKNN(X, y, spec.k);
  throw new Error('unknown model ' + spec.m);
}
module.exports = { fit: fit, fitFreq: fitFreq, fitLogit: fitLogit, fitGBT: fitGBT, fitRF: fitRF, fitKNN: fitKNN, fitQ: fitQ, colStats: colStats };
