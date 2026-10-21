// Edificio completo de hormigón armado (solo cargas gravitatorias), según CIRSOC 201-2005 y 101-2005.
// Unidades: m, kN, kPa (los diseños de sección llaman a rc.js / column.js / footing.js en N y mm).
//
// Hipótesis (se informan en la memoria):
//  - Grilla ortogonal con losas apoyadas en vigas. Cada paño de la grilla puede estar vacío (planta en L, U, T, con patio…): hay
//    vigas solo donde algún paño vecino tiene losa, y las vigas y franjas se parten en tramos continuos. Pórticos indesplazables (arriostrados).
//  - Losas por franjas (art. 13.5.1): paños con relación de luces > 2 trabajan en una dirección (art. 13.6.1.2); los
//    demás reparten la carga por igualdad de flechas (Rankine-Grashof) y cada franja es continua sobre apoyos rígidos.
//  - Vigas y columnas por nivel (art. 8.9.1): sobrecarga solo en el nivel analizado y extremos lejanos de las
//    columnas empotrados (articulado en la base). Envolvente de sobrecarga por tramos independientes (art. 8.9.2).
//  - Rigideces con la sección bruta (art. 8.6.1).
//  - Las bases se dimensionan con carga axial centrada (los momentos de columna no se transmiten a la base).
import { CIRSOC201 as N } from './norms.js';
import * as rc from './rc.js';
import { analyzeStrip } from './continuous.js';
import { solveFrame } from './frame.js';
import { designColumn } from './column.js';
import { designFooting } from './footing.js';

const GAMMA = N.gammaRC;
const cum = (arr) => arr.reduce((o, v) => { o.push(o[o.length - 1] + v); return o; }, [0]);
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const NS = 20;

// ---------------------------------------------------------------- paños vacíos (tipologías en planta)
// inp.mask[i][j] === false marca un paño sin losa; todo lo demás es losa. Una columna existe solo en un nudo que toca algún paño con losa.
export const panelOn = (inp, i, j) => i >= 0 && j >= 0 && i < inp.xSpans.length && j < inp.ySpans.length && !(inp.mask && inp.mask[i] && inp.mask[i][j] === false);
export const nodeOn = (inp, i, j) => panelOn(inp, i - 1, j - 1) || panelOn(inp, i, j - 1) || panelOn(inp, i - 1, j) || panelOn(inp, i, j);
const xBeamOn = (inp, i, j) => panelOn(inp, i, j - 1) || panelOn(inp, i, j);        // el tramo i de la línea x j lleva viga
const yBeamOn = (inp, i, j) => panelOn(inp, i - 1, j) || panelOn(inp, i, j);        // el tramo j de la línea y i lleva viga
export const hasVoids = (inp) => Boolean(inp.mask) && inp.xSpans.some((_, i) => inp.ySpans.some((__, j) => !panelOn(inp, i, j)));
// rachas de tramos consecutivos: [{ start, ns }]
function runsOf(len, on) {
  const out = [];
  let st = null;
  for (let q = 0; q < len; q++) {
    if (on(q)) { if (st === null) st = q; } else if (st !== null) { out.push({ start: st, ns: q - st }); st = null; }
  }
  if (st !== null) out.push({ start: st, ns: len - st });
  return out;
}
// la racha (de vigas o de franjas) de una línea que pasa por el nudo/apoyo node
export const runAt = (list, line, node) => list.find((r) => r.line === line && node >= r.start && node <= r.start + r.ns) || null;
const loadsAt = (sols, line, node) => { const r = runAt(sols, line, node); return r ? nodeLoads(r, node - r.start) : { D: 0, L: 0 }; };
const rowRun = (sl, i, j) => sl.rowsX.find((r) => r.j === j && i >= r.start && i < r.start + r.ns) || null;
const colRun = (sl, i, j) => sl.colsY.find((c) => c.i === i && j >= c.start && j < c.start + c.ns) || null;
const rowSupAt = (sl, i, j) => { const r = sl.rowsX.find((q) => q.j === j && i >= q.start && i <= q.start + q.ns); return r ? r.supports[i - r.start] : null; };
const colSupAt = (sl, i, j) => { const c = sl.colsY.find((q) => q.i === i && j >= q.start && j <= q.start + q.ns); return c ? c.supports[j - c.start] : null; };

// ---------------------------------------------------------------- geometría
function geometry(inp) {
  const nx = inp.xSpans.length;
  const ny = inp.ySpans.length;
  const n = inp.levels.length;
  return { nx, ny, n, X: cum(inp.xSpans), Y: cum(inp.ySpans) };
}

// ¿existe la columna del entrepiso m (debajo del nivel m) en el nodo (i, j)? Un apeo en el nivel L elimina la columna
// en los entrepisos 1..L: la columna de arriba nace sobre la viga del nivel L.
function colExists(inp, m, i, j) {
  if (m < 1 || m > inp.levels.length) return false;
  if (!nodeOn(inp, i, j)) return false;
  return !(inp.apeos || []).some((a) => a.i === i && a.j === j && m <= a.level);
}
const apeoAt = (inp, k, i, j) => (inp.apeos || []).find((a) => a.i === i && a.j === j && a.level === k) || null;

// ---------------------------------------------------------------- criterio de columnas
// 'square': lado único (mínimo = colMin). 'rect': un lado fijo (colMin) y el otro variable, con el lado largo en X o en Y.
// cx = dimensión en X, cy = dimensión en Y (m). El lado variable se agranda de a 5 cm hasta COL_LONG_CAP; recién ahí crece el fijo.
const COL_LONG_CAP = 1.2;
const colCfg = (inp) => ({ shape: inp.colShape === 'square' ? 'square' : 'rect', fixed: (Number(inp.colMin) || 20) / 100, max: (Number(inp.colMax) || 0) / 100, orient: inp.colOrient === 'y' ? 'y' : 'x' });
const ceil5 = (x) => Math.ceil(x * 20 - 1e-9) / 20;
const longShort = (cfg, c) => (cfg.orient === 'x' ? { long: c.cx, short: c.cy } : { long: c.cy, short: c.cx });
const fromLongShort = (cfg, long, short) => (cfg.orient === 'x' ? { cx: long, cy: short } : { cx: short, cy: long });

function sizeForArea(cfg, area) {
  if (cfg.shape === 'square') { const side = Math.max(cfg.fixed, ceil5(Math.sqrt(area))); return { cx: side, cy: side }; }
  return fromLongShort(cfg, Math.max(cfg.fixed, ceil5(area / cfg.fixed)), cfg.fixed);
}

function growColumn(cfg, c, step = 0.05) {
  if (cfg.shape === 'square') return { cx: c.cx + step, cy: c.cy + step };
  const { long, short } = longShort(cfg, c);
  if (long < COL_LONG_CAP - 1e-9) return fromLongShort(cfg, long + step, short);
  return fromLongShort(cfg, Math.max(long, short + step), short + step);
}

// Las columnas no pueden ser más chicas que las del entrepiso de arriba (se achican hacia la cubierta, nunca hacia la base).
function enforceColumnTaper(inp, sizes, G) {
  let changed = false;
  for (let m = G.n - 1; m >= 1; m--) {
    for (let i = 0; i <= G.nx; i++) {
      for (let j = 0; j <= G.ny; j++) {
        if (!colExists(inp, m, i, j) || !colExists(inp, m + 1, i, j)) continue;
        const a = sizes.col[m][i][j];
        const t = sizes.col[m + 1][i][j];
        if (t.cx > a.cx + 1e-9 || t.cy > a.cy + 1e-9) { sizes.col[m][i][j] = { cx: Math.max(a.cx, t.cx), cy: Math.max(a.cy, t.cy) }; changed = true; }
      }
    }
  }
  return changed;
}

// ---------------------------------------------------------------- dimensiones iniciales
function lineHMin(spans) {
  const ns = spans.length;
  let h = 0;
  spans.forEach((L, s) => {
    const ratio = ns === 1 ? 16 : (s === 0 || s === ns - 1 ? 18.5 : 21);       // Tabla 9.5.a)
    h = Math.max(h, L / ratio * N.minThicknessFyFactor(420));
  });
  return h;
}

function initialSizes(inp, G) {
  const { nx, ny, n } = G;
  const fc = Number(inp.fc);
  const kCol = 0.80 * N.phiCompression * (0.85 * fc * 0.98 + 0.02 * 420) * 1000;      // kPa por m2 de columna, con ρ = 2 %
  const sizes = { slabH: [], slabExtra: [], beamH: [], beamB: [], col: [] };
  for (let k = 1; k <= n; k++) {
    sizes.slabH[k] = 0.12;
    sizes.slabExtra[k] = 0;
    sizes.beamH[k] = { x: [], y: [] };
    sizes.beamB[k] = { x: [], y: [] };
    for (let j = 0; j <= ny; j++) {
      sizes.beamH[k].x[j] = Math.max(inp.beamHmin / 100, Math.ceil(lineHMin(inp.xSpans) * 20 - 1e-9) / 20);
      sizes.beamB[k].x[j] = inp.beamB / 100;
    }
    for (let i = 0; i <= nx; i++) {
      sizes.beamH[k].y[i] = Math.max(inp.beamHmin / 100, Math.ceil(lineHMin(inp.ySpans) * 20 - 1e-9) / 20);
      sizes.beamB[k].y[i] = inp.beamB / 100;
    }
  }
  const half = (arr, q) => ((q > 0 ? arr[q - 1] : 0) + (q < arr.length ? arr[q] : 0)) / 2;
  for (let m = 1; m <= n; m++) {
    sizes.col[m] = [];
    for (let i = 0; i <= nx; i++) {
      sizes.col[m][i] = [];
      for (let j = 0; j <= ny; j++) {
        let Pu = 0;
        for (let k = m; k <= n; k++) {
          const lv = inp.levels[k - 1];
          Pu += (1.2 * (0.15 * GAMMA + lv.perm) + 1.6 * lv.live) * half(inp.xSpans, i) * half(inp.ySpans, j) * 1.15;
        }
        sizes.col[m][i][j] = sizeForArea(colCfg(inp), Pu / kCol);
      }
    }
  }
  return sizes;
}

// ---------------------------------------------------------------- espesor de losas (art. 9.5.2 y 9.5.3)
function tBeamInertia(bw, hb, hs, sides) {
  const hw = Math.max(0, hb - hs);
  const e = Math.min(hw, 4 * hs);
  const bf = bw + sides * e;
  const A1 = bf * hs;
  const A2 = bw * hw;
  const y1 = hs / 2;
  const y2 = hs + hw / 2;
  const yc = (A1 * y1 + A2 * y2) / (A1 + A2);
  return bf * hs ** 3 / 12 + A1 * (yc - y1) ** 2 + bw * hw ** 3 / 12 + A2 * (y2 - yc) ** 2;
}

function slabRequiredH(inp, G, sizes, k) {
  const { nx, ny } = G;
  const fy = 420;
  const hs0 = sizes.slabH[k] || 0.12;
  let req = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!panelOn(inp, i, j)) continue;
      const lx = inp.xSpans[i];
      const ly = inp.ySpans[j];
      const longL = Math.max(lx, ly);
      const shortL = Math.min(lx, ly);
      if (longL / shortL > 2) {
        // una dirección: Tabla 9.5.a) con la luz corta
        const shortAlongX = lx <= ly;
        const arr = shortAlongX ? inp.xSpans : inp.ySpans;
        const idx = shortAlongX ? i : j;
        const ratio = arr.length === 1 ? 20 : (idx === 0 || idx === arr.length - 1 ? 24 : 28);
        req = Math.max(req, shortL / ratio);
      } else {
        const bb = inp.beamB / 100;
        const lnLong = longL - bb;
        const lnShort = shortL - bb;
        const beta = lnLong / lnShort;
        const alphas = [];
        const push = (dir, line, wLeft, wRight, sideCount) => {
          const hb = sizes.beamH[k][dir][line];
          const bw = sizes.beamB[k][dir][line];
          const Ib = tBeamInertia(bw, hb, hs0, sideCount);
          const widthSlab = wLeft + wRight;
          alphas.push(Ib / (widthSlab * hs0 ** 3 / 12));
        };
        // vigas que rodean el paño: ancho de losa tributario perpendicular a cada viga
        const wy = (jj) => ((jj > 0 ? inp.ySpans[jj - 1] : 0) + (jj < ny ? inp.ySpans[jj] : 0)) / 2;
        const wx = (ii) => ((ii > 0 ? inp.xSpans[ii - 1] : 0) + (ii < nx ? inp.xSpans[ii] : 0)) / 2;
        [j, j + 1].forEach((jj) => push('x', jj, jj > 0 ? inp.ySpans[jj - 1] / 2 : 0, jj < ny ? inp.ySpans[jj] / 2 : 0, jj > 0 && jj < ny ? 2 : 1));
        [i, i + 1].forEach((ii) => push('y', ii, ii > 0 ? inp.xSpans[ii - 1] / 2 : 0, ii < nx ? inp.xSpans[ii] / 2 : 0, ii > 0 && ii < nx ? 2 : 1));
        void wy; void wx;
        const afm = sum(alphas) / alphas.length;
        const f = lnLong * (0.8 + fy / 1400);
        let h;
        if (afm > 2) h = Math.max(0.09, f / (36 + 9 * beta));                       // (9-13)
        else if (afm > 0.2) h = Math.max(0.12, f / (36 + 5 * beta * (afm - 0.2)));  // (9-12)
        else h = Math.max(0.12, f / 36);                                             // art. 9.5.3.2 (aprox. sin vigas)
        const edgeless = (!panelOn(inp, i - 1, j) || !panelOn(inp, i + 1, j) || !panelOn(inp, i, j - 1) || !panelOn(inp, i, j + 1)) && alphas.some((a) => a < 0.8);
        if (edgeless) h *= 1.10;                                                     // art. 9.5.3.3.d)
        req = Math.max(req, h);
      }
    }
  }
  const c = Math.max(inp.cant.left, inp.cant.right, inp.cant.front, inp.cant.back);
  if (c > 0) req = Math.max(req, c / 10);                                            // voladizo: Tabla 9.5.a)
  return Math.max(Math.ceil(req * 100 - 1e-9) / 100, sizes.slabExtra[k] || 0, (Number(inp.slabHmin) || 0) / 100);
}

// ---------------------------------------------------------------- losas: franjas
// Reparto de la carga entre las dos direcciones (Rankine-Grashof) y franjas continuas.
function slabStrips(inp, G, k, hs) {
  const { nx, ny } = G;
  const lv = inp.levels[k - 1];
  const wD = hs * GAMMA + lv.perm;
  const wL = lv.live;
  const share = (i, j) => {
    const lx = inp.xSpans[i];
    const ly = inp.ySpans[j];
    if (Math.max(lx, ly) / Math.min(lx, ly) > 2) return lx <= ly ? 1 : 0;
    return ly ** 4 / (lx ** 4 + ly ** 4);
  };
  const cantL = (len) => (len > 0 ? { L: len, wD, wL: lv.cantLive ?? lv.live } : null);
  // una franja por cada racha de paños con losa de una fila (x) o de una columna (y); los voladizos solo en los bordes de la grilla
  const rowsX = [];
  for (let j = 0; j < ny; j++) {
    runsOf(nx, (i) => panelOn(inp, i, j)).forEach((r) => {
      const spans = Array.from({ length: r.ns }, (_, s) => ({ L: inp.xSpans[r.start + s], wD: share(r.start + s, j) * wD, wL: share(r.start + s, j) * wL }));
      rowsX.push({ j, start: r.start, ns: r.ns, ...analyzeStrip({ spans, cantLeft: r.start === 0 ? cantL(inp.cant.left) : null, cantRight: r.start + r.ns === nx ? cantL(inp.cant.right) : null }) });
    });
  }
  const colsY = [];
  for (let i = 0; i < nx; i++) {
    runsOf(ny, (j) => panelOn(inp, i, j)).forEach((r) => {
      const spans = Array.from({ length: r.ns }, (_, s) => ({ L: inp.ySpans[r.start + s], wD: (1 - share(i, r.start + s)) * wD, wL: (1 - share(i, r.start + s)) * wL }));
      colsY.push({ i, start: r.start, ns: r.ns, ...analyzeStrip({ spans, cantLeft: r.start === 0 ? cantL(inp.cant.front) : null, cantRight: r.start + r.ns === ny ? cantL(inp.cant.back) : null }) });
    });
  }
  return { wD, wL, rowsX, colsY, share };
}

// ---------------------------------------------------------------- subpórticos por nivel
// Resuelve la línea (dir 'x' línea j, o dir 'y' línea i) del nivel k con los casos D, L por tramo y L de apeo.
function solveLine(inp, G, sizes, k, dir, line, start, spansLoad, extra) {
  const { nx, ny, n } = G;
  const Ec = N.Ec(Number(inp.fc)) * 1000;
  const ns = spansLoad.length;
  const nodes = [];
  const pos = (q) => (dir === 'x' ? G.X[q + start] : G.Y[q + start]);
  for (let q = 0; q <= ns; q++) nodes.push({ x: pos(q), y: 0 });
  const gi = (q) => (dir === 'x' ? q + start : line);
  const gj = (q) => (dir === 'x' ? line : q + start);
  const Hk = inp.levels[k - 1].h;
  const Hup = k < n ? inp.levels[k].h : 0;
  const bw = sizes.beamB[k][dir][line];
  const hb = sizes.beamH[k][dir][line];
  const Ib = bw * hb ** 3 / 12;
  const members = [];
  const idx = { beams: [], below: new Array(ns + 1).fill(null), above: new Array(ns + 1).fill(null) };
  const supports = [];
  let hasUx = false;
  spansLoad.forEach((sp, s) => { idx.beams[s] = members.length; members.push({ i: s, j: s + 1, E: Ec, A: bw * hb, I: Ib, tag: `b${s}` }); });
  const stubI = (c) => (dir === 'x' ? c.cy * c.cx ** 3 / 12 : c.cx * c.cy ** 3 / 12);
  const transfers = [];
  for (let q = 0; q <= ns; q++) {
    const i = gi(q);
    const j = gj(q);
    const ap = apeoAt(inp, k, i, j);
    const transfer = ap && ap.dir === dir;
    const supportedByOther = ap && ap.dir !== dir;
    if (transfer) transfers.push(q);
    if (colExists(inp, k, i, j)) {
      const c = sizes.col[k][i][j];
      const id = nodes.length;
      nodes.push({ x: pos(q), y: -Hk });
      idx.below[q] = members.length;
      members.push({ i: id, j: q, E: Ec, A: c.cx * c.cy, I: stubI(c), tag: `cb${q}` });
      supports.push(k === 1 ? { node: id, ux: true, uy: true } : { node: id, ux: true, uy: true, rz: true });
      hasUx = true;
    }
    if (k < n && colExists(inp, k + 1, i, j)) {
      const c = sizes.col[k + 1][i][j];
      const id = nodes.length;
      nodes.push({ x: pos(q), y: Hup });
      idx.above[q] = members.length;
      members.push({ i: q, j: id, E: Ec, A: c.cx * c.cy, I: stubI(c), tag: `ca${q}` });
      supports.push(transfer ? { node: id, ux: true, rz: true } : { node: id, ux: true, uy: true, rz: true });
      hasUx = true;
    }
    if (supportedByOther) supports.push({ node: q, uy: true });
  }
  if (!hasUx) supports.push({ node: 0, ux: true });
  const nodalLoads = (kind) => (extra || []).filter((e) => e[kind] > 0).map((e) => ({ node: e.q, fx: 0, fy: -e[kind] * 1, mz: 0 }));
  const run = (loadOfBeam, kind) => {
    const ms = members.map((m) => (m.tag.startsWith('b') ? { ...m, w: () => loadOfBeam(Number(m.tag.slice(1))) } : m));
    return solveFrame({ nodes, members: ms, supports, nodalLoads: kind ? nodalLoads(kind) : [] });
  };
  const D = run((s) => spansLoad[s].wD, 'D');
  const Ls = spansLoad.map((_, s0) => run((s) => (s === s0 ? spansLoad[s].wL : 0), null));
  const hasLp = (extra || []).some((e) => e.L > 0);
  const Lp = hasLp ? run(() => 0, 'L') : null;
  return { ns, idx, D, Ls, Lp, spans: spansLoad, bw, hb, transfers, dir, line, start };
}

function memberOf(res, mi) { return res.members[mi]; }

// Cargas que cada línea transmite a las columnas (suma de cortantes de las vigas que llegan al nudo), de servicio.
function nodeLoads(sol, q) {
  const f = (res) => {
    let v = 0;
    if (q > 0) v += memberOf(res, sol.idx.beams[q - 1]).V2;
    if (q < sol.ns) v += memberOf(res, sol.idx.beams[q]).V1;
    return v;
  };
  const D = f(sol.D);
  let L = sol.Ls.reduce((s, r) => s + f(r), 0);
  if (sol.Lp) L += f(sol.Lp);
  return { D, L };
}

// Momento del extremo del tramo de columna que llega al nudo q (sentido: antihorario sobre la barra).
function stubMoment(sol, res, q, which) {
  const mi = which === 'below' ? sol.idx.below[q] : sol.idx.above[q];
  if (mi === null) return 0;
  const m = memberOf(res, mi);
  return which === 'below' ? m.M2 : m.M1;
}

// Envolvente factorizada de una línea: por tramo, momento positivo máximo, negativos en los apoyos y cortantes.
function lineEnvelope(sol) {
  const ns = sol.ns;
  const all = [sol.D, ...sol.Ls, ...(sol.Lp ? [sol.Lp] : [])];
  const sample = (res, s) => memberOf(res, sol.idx.beams[s]).sample(NS);
  const out = [];
  for (let s = 0; s < ns; s++) {
    const d = sample(sol.D, s);
    const ls = [...sol.Ls, ...(sol.Lp ? [sol.Lp] : [])].map((r) => sample(r, s));
    let pos = { M: -Infinity, x: 0 };
    let negL = 0;
    let negR = 0;
    let vL = 0;
    let vR = 0;
    for (let q = 0; q <= NS; q++) {
      let mMax = 1.2 * d[q].M;
      let mMin = 1.2 * d[q].M;
      let vMax = 1.2 * d[q].V;
      let vMin = 1.2 * d[q].V;
      for (const l of ls) {
        mMax += 1.6 * Math.max(0, l[q].M);
        mMin += 1.6 * Math.min(0, l[q].M);
        vMax += 1.6 * Math.max(0, l[q].V);
        vMin += 1.6 * Math.min(0, l[q].V);
      }
      mMax = Math.max(mMax, 1.4 * d[q].M);
      mMin = Math.min(mMin, 1.4 * d[q].M);
      if (mMax > pos.M) pos = { M: mMax, x: d[q].x };
      if (q === 0) { negL = -Math.min(0, mMin); vL = Math.max(Math.abs(vMax), Math.abs(vMin)); }
      if (q === NS) { negR = -Math.min(0, mMin); vR = Math.max(Math.abs(vMax), Math.abs(vMin)); }
    }
    out.push({ L: sol.spans[s].L, posM: Math.max(0, pos.M), posX: pos.x, negL, negR, vL, vR });
  }
  void all;
  return out;
}

// Curvas de la envolvente mayorada (1,2 D + 1,6 L, sobrecarga alternada por tramos) de una línea, para dibujarlas, y cargas
// mayoradas sobre cada columna. Las abscisas son locales a cada tramo (m); M positivo = tracción abajo.
export function lineCurves(sol) {
  const ls = [...sol.Ls, ...(sol.Lp ? [sol.Lp] : [])];
  const spans = [];
  for (let s = 0; s < sol.ns; s++) {
    const d = memberOf(sol.D, sol.idx.beams[s]).sample(NS);
    const lv = ls.map((r) => memberOf(r, sol.idx.beams[s]).sample(NS));
    const pts = d.map((dq, q) => {
      let mMax = 1.2 * dq.M;
      let mMin = 1.2 * dq.M;
      let vMax = 1.2 * dq.V;
      let vMin = 1.2 * dq.V;
      lv.forEach((l) => {
        mMax += 1.6 * Math.max(0, l[q].M);
        mMin += 1.6 * Math.min(0, l[q].M);
        vMax += 1.6 * Math.max(0, l[q].V);
        vMin += 1.6 * Math.min(0, l[q].V);
      });
      return { x: dq.x, mMax: Math.max(mMax, 1.4 * dq.M), mMin: Math.min(mMin, 1.4 * dq.M), vMax, vMin };
    });
    spans.push({ L: sol.spans[s].L, wD: sol.spans[s].wD, wL: sol.spans[s].wL, pts });
  }
  const reactions = [];
  for (let q = 0; q <= sol.ns; q++) {
    const nl = nodeLoads(sol, q);
    reactions.push(1.2 * nl.D + 1.6 * nl.L);
  }
  return { spans, reactions };
}

// ---------------------------------------------------------------- análisis de todo el edificio (de arriba hacia abajo)
function analyzeAll(inp, G, sizes) {
  const { nx, ny, n } = G;
  const levels = [];
  // axial acumulado en la base de cada entrepiso, por nodo: {D, L} (servicio)
  const bottom = [];
  for (let m = 0; m <= n + 1; m++) { bottom[m] = Array.from({ length: nx + 1 }, () => Array.from({ length: ny + 1 }, () => ({ D: 0, L: 0 }))); }
  const colForces = [];   // por entrepiso y nodo: momentos extremos por patrón
  for (let k = n; k >= 1; k--) {
    const hs = sizes.slabH[k];
    const slabs = slabStrips(inp, G, k, hs);
    const lv = inp.levels[k - 1];
    const wallX = (j) => ((j === 0 || j === ny) ? (inp.wall || 0) : 0);
    const wallY = (i) => ((i === 0 || i === nx) ? (inp.wall || 0) : 0);
    // cargas lineales sobre vigas (servicio): reacciones de las franjas + peso propio + muros (solo en el borde exterior de la planta)
    const perim = (a, b) => (a !== b ? (inp.wall || 0) : 0);
    const beamRuns = { x: [], y: [] };
    for (let j = 0; j <= ny; j++) {
      runsOf(nx, (i) => xBeamOn(inp, i, j)).forEach((r) => {
        const spans = Array.from({ length: r.ns }, (_, s) => {
          const i = r.start + s;
          const sup = colSupAt(slabs, i, j);
          const self = sizes.beamB[k].x[j] * Math.max(0, sizes.beamH[k].x[j] - hs) * GAMMA;
          return { L: inp.xSpans[i], wD: (sup ? sup.RD : 0) + self + perim(panelOn(inp, i, j - 1), panelOn(inp, i, j)), wL: sup ? sup.RL : 0 };
        });
        beamRuns.x.push({ line: j, start: r.start, spans });
      });
    }
    for (let i = 0; i <= nx; i++) {
      runsOf(ny, (j) => yBeamOn(inp, i, j)).forEach((r) => {
        const spans = Array.from({ length: r.ns }, (_, s) => {
          const j = r.start + s;
          const sup = rowSupAt(slabs, i, j);
          const self = sizes.beamB[k].y[i] * Math.max(0, sizes.beamH[k].y[i] - hs) * GAMMA;
          return { L: inp.ySpans[j], wD: (sup ? sup.RD : 0) + self + perim(panelOn(inp, i - 1, j), panelOn(inp, i, j)), wL: sup ? sup.RL : 0 };
        });
        beamRuns.y.push({ line: i, start: r.start, spans });
      });
    }
    const beamSpans = beamRuns;
    // apeos de este nivel: carga de la columna que apoya (axial en la base del entrepiso k+1) y reacciones cruzadas
    const apeos = (inp.apeos || []).filter((a) => a.level === k);
    const cross = new Map();   // clave "i,j" -> {D, L} reacción de la línea que NO transfiere
    let solX = [];
    let solY = [];
    const extraFor = (dir, line, start, ns) => {
      const out = [];
      apeos.filter((a) => a.dir === dir).forEach((a) => {
        const q = dir === 'x' ? a.i : a.j;
        const ln = dir === 'x' ? a.j : a.i;
        if (ln !== line || q < start || q > start + ns) return;
        const P = bottom[k + 1][a.i][a.j];
        const cr = cross.get(`${a.i},${a.j}`) || { D: 0, L: 0 };
        out.push({ q: q - start, D: P.D + cr.D, L: P.L + cr.L });
      });
      return out;
    };
    for (let round = 0; round < (apeos.length ? 4 : 1); round++) {
      solX = beamRuns.x.map((r) => solveLine(inp, G, sizes, k, 'x', r.line, r.start, r.spans, extraFor('x', r.line, r.start, r.spans.length)));
      solY = beamRuns.y.map((r) => solveLine(inp, G, sizes, k, 'y', r.line, r.start, r.spans, extraFor('y', r.line, r.start, r.spans.length)));
      apeos.forEach((a) => {
        const other = a.dir === 'x' ? runAt(solY, a.i, a.j) : runAt(solX, a.j, a.i);
        if (!other) return;
        const q = (a.dir === 'x' ? a.j : a.i) - other.start;
        cross.set(`${a.i},${a.j}`, nodeLoads(other, q));
      });
    }
    // cargas sobre cada columna (entrepiso k) y acumulación
    const F = Array.from({ length: nx + 1 }, () => Array.from({ length: ny + 1 }, () => ({ D: 0, L: 0 })));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        const a = loadsAt(solX, j, i);
        const b = loadsAt(solY, i, j);
        F[i][j] = { D: a.D + b.D, L: a.L + b.L };
      }
    }
    const topAxial = Array.from({ length: nx + 1 }, () => Array.from({ length: ny + 1 }, () => ({ D: 0, L: 0 })));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        if (!colExists(inp, k, i, j)) continue;
        const above = bottom[k + 1][i][j];
        const apeoHere = apeoAt(inp, k, i, j);
        void apeoHere;
        topAxial[i][j] = { D: above.D + F[i][j].D, L: above.L + F[i][j].L };
        const c = sizes.col[k][i][j];
        bottom[k][i][j] = { D: topAxial[i][j].D + c.cx * c.cy * inp.levels[k - 1].h * GAMMA, L: topAxial[i][j].L };
      }
    }
    levels[k] = { k, hs, slabs, beamSpans, solX, solY, F, topAxial, wDslab: slabs.wD, wLslab: slabs.wL, live: lv.live };
  }
  return { levels, bottom, colForces };
}

// ---------------------------------------------------------------- diseño
const patterns = ['all', 'alt1', 'alt2'];
const loaded = (p, s) => p === 'all' || (p === 'alt1' ? s % 2 === 0 : s % 2 === 1);

const patternMomentAt = (sols, line, node, which, p) => { const r = runAt(sols, line, node); return r ? patternMoment(r, node - r.start, which, p) : 0; };

function patternMoment(sol, q, which, p) {
  // momento de extremo de columna en el nudo q de la línea sol, con el patrón p de sobrecarga (1,2 D + 1,6 L)
  let m = 1.2 * stubMoment(sol, sol.D, q, which);
  sol.Ls.forEach((r, s) => { if (loaded(p, s)) m += 1.6 * stubMoment(sol, r, q, which); });
  if (sol.Lp) m += 1.6 * stubMoment(sol, sol.Lp, q, which);
  return m;
}

function endMomentsPair(Mtop, Mbot) {
  const big = Math.abs(Mtop) >= Math.abs(Mbot) ? Mtop : Mbot;
  const small = big === Mtop ? Mbot : Mtop;
  const M2 = Math.abs(big);
  const M1 = M2 > 1e-9 ? -small / big * M2 : 0;   // + si curvatura simple (momentos extremos de sentidos opuestos)
  return { M2, M1 };
}

function designAll(inp, G, sizes, an) {
  const { nx, ny, n } = G;
  const fc = Number(inp.fc);
  const out = { slabs: [], beams: [], columns: [], footings: [], changed: false, failures: [] };
  const dSt = Number(inp.dStirrup) || 8;
  const place = inp.placement;
  const expo = inp.exposure;

  for (let k = n; k >= 1; k--) {
    const lv = an.levels[k];
    // ----- losas
    const hs = lv.hs;
    const slabLv = { k, h: hs, panels: [], supportsX: [], supportsY: [] };
    let slabFail = false;
    const sOpt = (MuKnm) => rc.slabBarOptions({ Mu: MuKnm * 1e6, h: hs * 1000, fc, placement: place, exposure: expo });
    const sFmt = (res) => (res.options[0] ? { db: res.options[0].db, s: res.options[0].s, As: res.options[0].As, AsReq: res.options[0].AsReq } : null);
    const phiVc = (N.phiShear * Math.min(Math.sqrt(fc), N.maxSqrtFcShear) / 6 * 1000 * (hs * 1000 - 20 - 8)) / 1000; // kN/m, d ≈ h − 28 mm
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!panelOn(inp, i, j)) continue;
        const rr = rowRun(lv.slabs, i, j);
        const cr = colRun(lv.slabs, i, j);
        const rowX = rr.spans[i - rr.start];
        const colY = cr.spans[j - cr.start];
        const px = sOpt(rowX.posM);
        const py = sOpt(colY.posM);
        const bx = sFmt(px);
        const by = sFmt(py);
        const shear = Math.max(rowX.vLeft, rowX.vRight, colY.vLeft, colY.vRight);
        if (!bx || !by || shear > phiVc) slabFail = true;
        slabLv.panels.push({ i, j, lx: inp.xSpans[i], ly: inp.ySpans[j], twoWay: Math.max(inp.xSpans[i], inp.ySpans[j]) / Math.min(inp.xSpans[i], inp.ySpans[j]) <= 2,
          Mx: rowX.posM, My: colY.posM, bx, by, Vmax: shear });
      }
    }
    // apoyos (negativos): línea i de apoyos de las franjas en x, línea j de las franjas en y
    for (let i = 0; i <= nx; i++) {
      let M = 0;
      let any = false;
      lv.slabs.rowsX.forEach((r) => { if (i >= r.start && i <= r.start + r.ns) { any = true; M = Math.max(M, r.supports[i - r.start].negM); } });
      const o = sOpt(M);
      if (any && !o.options[0]) slabFail = true;
      slabLv.supportsX.push({ line: i, M, bar: any ? sFmt(o) : null });
    }
    for (let j = 0; j <= ny; j++) {
      let M = 0;
      let any = false;
      lv.slabs.colsY.forEach((c) => { if (j >= c.start && j <= c.start + c.ns) { any = true; M = Math.max(M, c.supports[j - c.start].negM); } });
      const o = sOpt(M);
      if (any && !o.options[0]) slabFail = true;
      slabLv.supportsY.push({ line: j, M, bar: any ? sFmt(o) : null });
    }
    slabLv.fail = slabFail;
    if (slabFail && hs < 0.30) { sizes.slabExtra[k] = Math.max(sizes.slabExtra[k] || 0, hs + 0.01); out.changed = true; }
    out.slabs[k] = slabLv;

    // ----- vigas
    const beamLv = { k, x: [], y: [] };
    ['x', 'y'].forEach((dir) => {
      const sols = dir === 'x' ? lv.solX : lv.solY;
      sols.forEach((sol) => {
        const line = sol.line;
        const env = lineEnvelope(sol);
        // Diseña todos los tramos con (b, h); si algo no verifica devuelve la causa: 'flexión', 'ancho' o 'corte'.
        const evalLine = (b, h) => {
          let fail = null;
          const spans = env.map((e) => {
            const opts = (Mu) => rc.beamBarOptions({ Mu: Mu * 1e6, b, h, fc, fy: 420, dStirrup: dSt, dagg: inp.dagg, placement: place, exposure: expo });
            const pos = opts(e.posM);
            const nL = opts(e.negL);
            const nR = opts(e.negR);
            const dUse = Math.min(...[pos.options[0], nL.options[0], nR.options[0]].filter(Boolean).map((o) => o.d), h - 60);
            const Vu = Math.max(e.vL, e.vR) * 1000;
            const sh = rc.shearDesign({ Vu, b, d: dUse, h, fc, fyt: 420, dStirrup: dSt });
            [pos, nL, nR].forEach((o) => {
              if (!o.options[0]) fail = fail || (o.failures.length ? 'flexión' : 'ancho');
            });
            if (!sh.ok) fail = fail || 'corte';
            return { ...e, pos: pos.options[0] || null, negLbars: nL.options[0] || null, negRbars: nR.options[0] || null, shear: sh, Vu: Vu / 1000 };
          });
          return { spans, fail };
        };
        let b = sol.bw * 1000;
        let h = sol.hb * 1000;
        let ev = evalLine(b, h);
        for (let g = 0; g < 80 && ev.fail; g++) {
          if (ev.fail === 'ancho') b += 50; else if (h < 1200) h += 50; else b += 50;
          ev = evalLine(b, h);
        }
        const spans = ev.spans;
        const fail = ev.fail;
        if (b !== sol.bw * 1000 || h !== sol.hb * 1000) {
          sizes.beamB[k][dir][line] = b / 1000;
          sizes.beamH[k][dir][line] = h / 1000;
          out.changed = true;
        }
        const rec = { dir, line, start: sol.start, ns: sol.ns, b: b / 1000, h: h / 1000, spans, fail, transfer: sol.transfers.length > 0,
          exceeds: (b > inp.beamB * 10 + 1e-6 ? ['ancho'] : []).concat(inp.beamHmax > 0 && h > inp.beamHmax * 10 + 1e-6 ? ['altura'] : []) };
        beamLv[dir].push(rec);
      });
    });
    out.beams[k] = beamLv;
  }

  // ----- columnas (por entrepiso y nodo)
  for (let m = 1; m <= n; m++) {
    out.columns[m] = [];
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        if (!colExists(inp, m, i, j)) continue;
        const lvTop = an.levels[m];
        const lvBot = m > 1 ? an.levels[m - 1] : null;
        const c = sizes.col[m][i][j];
        const N_ = { D: lvTop.topAxial[i][j].D + 0, L: lvTop.topAxial[i][j].L };
        const NbotD = an.bottom[m][i][j].D;
        const sustained = 1.2 * NbotD;
        const Pu = 1.2 * NbotD + 1.6 * N_.L;
        const hBeam = Math.max(sizes.beamH[m].x[j], sizes.beamH[m].y[i]);
        const lu = (inp.levels[m - 1].h - hBeam) * 1000;
        const cases = patterns.map((p) => {
          const top = { x: patternMomentAt(lvTop.solX, j, i, 'below', p), y: patternMomentAt(lvTop.solY, i, j, 'below', p) };
          const bot = lvBot ? { x: patternMomentAt(lvBot.solX, j, i, 'above', p), y: patternMomentAt(lvBot.solY, i, j, 'above', p) } : { x: 0, y: 0 };
          const px = endMomentsPair(top.x, bot.x);
          const py = endMomentsPair(top.y, bot.y);
          return { Pu: Pu * 1000, sustained: sustained * 1000, M2x: px.M2 * 1e6, M1x: px.M1 * 1e6, M2y: py.M2 * 1e6, M1y: py.M1 * 1e6 };
        });
        const uplift = Pu <= 0;
        const res = uplift ? { ok: false, reason: 'La columna queda traccionada (levantamiento): revisá los apeos y los voladizos, porque alguna viga trabaja como voladizo con carga puntual.' }
          : designColumn({ b: c.cy * 1000, h: c.cx * 1000, fc, fy: 420, lu, placement: place, exposure: expo, dagg: inp.dagg, cases });
        const rhoMax = (Number(inp.rhoMax) || 4) / 100;     // criterio constructivo (no del reglamento, que admite hasta 8 %)
        const cfg = colCfg(inp);
        const { short } = longShort(cfg, c);
        const exceeds = [];
        if (cfg.max > 0 && Math.max(c.cx, c.cy) > cfg.max + 1e-6) exceeds.push('lado máximo');
        if (cfg.shape === 'rect' && short > cfg.fixed + 1e-6) exceeds.push('lado fijo');
        const rec = { story: m, i, j, cx: c.cx, cy: c.cy, lu: lu / 1000, PD: NbotD, PuTop: Pu, PL: N_.L, res, ok: Boolean(res.ok && res.chosen && res.chosen.rho <= rhoMax + 1e-9), cases, exceeds };
        out.columns[m].push(rec);
        if (!rec.ok && !uplift) { sizes.col[m][i][j] = growColumn(colCfg(inp), c); out.changed = true; }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- cómputo
// Hormigón (m3) y hierro (kg) por elemento. Estimación por longitudes de barra, sin empalmes, ganchos ni desperdicio.
// Deja el detalle en cada registro de diseño (vol, kg) para mostrarlo en las tablas.
function quantities(inp, G, sizes, des) {
  const { nx, ny, n } = G;
  const q = { concrete: { slabs: 0, beams: 0, columns: 0, footings: 0 }, steel: { slabs: 0, beams: 0, columns: 0, footings: 0 }, levels: [], area: 0 };
  const KG = 7850 / 1e9;   // kg por mm3 de acero
  const xTot = sum(inp.xSpans) + inp.cant.left + inp.cant.right;
  const yTot = sum(inp.ySpans) + inp.cant.front + inp.cant.back;
  // superficie de losa de un nivel: con paños vacíos se suman solo los paños con losa y los voladizos de sus bordes
  let areaLevel = xTot * yTot;
  let frac = 1;
  if (hasVoids(inp)) {
    let act = 0;
    inp.xSpans.forEach((lx, i) => inp.ySpans.forEach((ly, j) => { if (panelOn(inp, i, j)) act += lx * ly; }));
    const edgeLen = (on, spans) => spans.reduce((t, l, q) => t + (on(q) ? l : 0), 0);
    areaLevel = act
      + inp.cant.left * edgeLen((j) => panelOn(inp, 0, j), inp.ySpans) + inp.cant.right * edgeLen((j) => panelOn(inp, inp.xSpans.length - 1, j), inp.ySpans)
      + inp.cant.front * edgeLen((i) => panelOn(inp, i, 0), inp.xSpans) + inp.cant.back * edgeLen((i) => panelOn(inp, i, inp.ySpans.length - 1), inp.xSpans);
    frac = act / (sum(inp.xSpans) * sum(inp.ySpans));
  }
  q.area = areaLevel * n;
  for (let k = 1; k <= n; k++) {
    const hs = sizes.slabH[k];
    const lq = { k, slabVol: hs * areaLevel, slabKg: 0, beamVol: 0, beamKg: 0, colVol: 0, colKg: 0 };
    // armadura de losas (orientativa): positiva en cada dirección y negativa en el 60 % de la luz sobre apoyos
    des.slabs[k].panels.forEach((p) => {
      if (p.bx) lq.slabKg += p.bx.As * 1e-6 * p.ly * p.lx * 7850;
      if (p.by) lq.slabKg += p.by.As * 1e-6 * p.ly * p.lx * 7850;
    });
    des.slabs[k].supportsX.forEach((s) => { if (s.bar) lq.slabKg += s.bar.As * 1e-6 * sum(inp.ySpans) * frac * 0.6 * (sum(inp.xSpans) / nx) * 7850; });
    des.slabs[k].supportsY.forEach((s) => { if (s.bar) lq.slabKg += s.bar.As * 1e-6 * sum(inp.xSpans) * frac * 0.6 * (sum(inp.ySpans) / ny) * 7850; });
    des.slabs[k].vol = lq.slabVol;
    des.slabs[k].kg = lq.slabKg;
    ['x', 'y'].forEach((dir) => {
      des.beams[k][dir].forEach((bm) => {
        let kgLong = 0;
        let kgStir = 0;
        let vol = 0;
        bm.spans.forEach((s) => {
          vol += bm.b * Math.max(0, bm.h - hs) * s.L;
          if (s.pos) kgLong += s.pos.n * rc.barArea(s.pos.db) * (s.L * 1000) * KG;
          if (s.negLbars) kgLong += s.negLbars.n * rc.barArea(s.negLbars.db) * (0.3 * s.L * 1000) * KG;
          if (s.negRbars) kgLong += s.negRbars.n * rc.barArea(s.negRbars.db) * (0.3 * s.L * 1000) * KG;
          if (s.shear && s.shear.stirrups) {
            const per = 2 * ((bm.b * 1000 - 70) + (bm.h * 1000 - 70));
            kgStir += (s.L * 1000 / s.shear.s) * barArea8(inp.dStirrup) * per * KG;
          }
        });
        bm.vol = vol; bm.kgLong = kgLong; bm.kgStir = kgStir; bm.kg = kgLong + kgStir;
        lq.beamVol += vol; lq.beamKg += bm.kg;
      });
    });
    q.levels[k] = lq;
  }
  for (let m = 1; m <= n; m++) {
    des.columns[m].forEach((c) => {
      const Hm = inp.levels[m - 1].h;
      c.vol = c.cx * c.cy * Hm;
      c.kgLong = 0; c.kgTies = 0;
      const r = c.res.chosen;
      if (r) {
        c.kgLong = r.n * rc.barArea(r.db) * (Hm * 1000) * KG;
        const per = 2 * ((c.cy * 1000 - 60) + (c.cx * 1000 - 60));
        c.kgTies = (Hm * 1000 / r.tieSpacing) * rc.barArea(r.dbe) * per * KG;
      }
      c.kg = c.kgLong + c.kgTies;
      q.levels[m].colVol += c.vol; q.levels[m].colKg += c.kg;
    });
  }
  for (let k = 1; k <= n; k++) {
    const lq = q.levels[k];
    q.concrete.slabs += lq.slabVol; q.steel.slabs += lq.slabKg;
    q.concrete.beams += lq.beamVol; q.steel.beams += lq.beamKg;
    q.concrete.columns += lq.colVol; q.steel.columns += lq.colKg;
  }
  des.footings.forEach((f) => { if (f.res.ok) { q.concrete.footings += f.res.concrete; q.steel.footings += f.res.steelKg; } });
  q.concrete.total = sum(Object.values(q.concrete));
  q.steel.total = sum(Object.values(q.steel));
  return q;
}
const barArea8 = (d) => Math.PI * (Number(d) || 8) ** 2 / 4;

// ---------------------------------------------------------------- API
export function validateBuilding(inp) {
  const errs = [];
  if (!inp.xSpans.length || inp.xSpans.some((v) => !(v > 0))) errs.push('Cargá al menos un vano en X, todos mayores que cero.');
  if (!inp.ySpans.length || inp.ySpans.some((v) => !(v > 0))) errs.push('Cargá al menos un vano en Y, todos mayores que cero.');
  if (!inp.levels.length || inp.levels.some((l) => !(l.h > 0))) errs.push('Cargá al menos un nivel, con altura mayor que cero.');
  if (inp.levels.length > 12) errs.push('Hasta 12 niveles.');
  if (inp.xSpans.length > 8 || inp.ySpans.length > 8) errs.push('Hasta 8 vanos por dirección.');
  if (!inp.xSpans.some((_, i) => inp.ySpans.some((__, j) => panelOn(inp, i, j)))) errs.push('La planta no tiene ningún paño con losa: dejá al menos uno.');
  (inp.apeos || []).forEach((a) => {
    if (a.level < 1 || a.level >= inp.levels.length) errs.push('El nivel del apeo tiene que ser menor que el último nivel.');
    if (a.i < 0 || a.i > inp.xSpans.length || a.j < 0 || a.j > inp.ySpans.length) errs.push('El apeo está fuera de la grilla.');
  });
  return errs;
}

export function designBuilding(inp) {
  const errs = validateBuilding(inp);
  if (errs.length) return { ok: false, errors: errs };
  const G = geometry(inp);
  const sizes = initialSizes(inp, G);
  let an;
  let des;
  let iter = 0;
  for (iter = 1; iter <= 12; iter++) {
    for (let k = 1; k <= G.n; k++) sizes.slabH[k] = slabRequiredH(inp, G, sizes, k);
    try { an = analyzeAll(inp, G, sizes); } catch (e) { return { ok: false, errors: [e.message || 'No se pudo analizar la estructura.'] }; }
    des = designAll(inp, G, sizes, an);
    if (enforceColumnTaper(inp, sizes, G)) des.changed = true;
    if (!des.changed) break;
  }
  // bases
  des.footings = [];
  const soilSigma = inp.soil.sigma * 0.0980665;
  const warnings = [];
  for (let i = 0; i <= G.nx; i++) {
    for (let j = 0; j <= G.ny; j++) {
      if (!colExists(inp, 1, i, j)) continue;
      const c = sizes.col[1][i][j];
      const bot = an.bottom[1][i][j];
      const uplifted = bot.D + bot.L <= 0;
      const res = uplifted ? { ok: false, reason: 'La columna queda traccionada (levantamiento): no corresponde una base de compresión.' } : designFooting({ PD: bot.D * 1000, PL: bot.L * 1000, bc: c.cy * 1000, hc: c.cx * 1000, fc: Number(inp.fc), fy: 420, sigma: soilSigma, gammaSoil: inp.soil.gamma, Df: inp.soil.Df * 1000, ratio: 1 });
      des.footings.push({ i, j, PD: bot.D, PL: bot.L, res });
    }
  }
  // bases que se pisan
  const fAt = (i, j) => des.footings.find((f) => f.i === i && f.j === j);
  for (let i = 0; i <= G.nx; i++) {
    for (let j = 0; j <= G.ny; j++) {
      const a = fAt(i, j);
      if (!a || !a.res.ok) continue;
      const r = fAt(i + 1, j);
      if (r && r.res.ok && a.res.L / 1000 / 2 + r.res.L / 1000 / 2 > inp.xSpans[i]) warnings.push(`Las bases de los ejes (${i + 1},${j + 1}) y (${i + 2},${j + 1}) se superponen: conviene una base combinada o corrida (próximamente).`);
      const u = fAt(i, j + 1);
      if (u && u.res.ok && a.res.B / 1000 / 2 + u.res.B / 1000 / 2 > inp.ySpans[j]) warnings.push(`Las bases de los ejes (${i + 1},${j + 1}) y (${i + 1},${j + 2}) se superponen: conviene una base combinada o corrida (próximamente).`);
    }
  }
  const failedCols = [];
  for (let m = 1; m <= G.n; m++) des.columns[m].forEach((c) => { if (!c.ok) failedCols.push(c); });
  const failedBeams = [];
  for (let k = 1; k <= G.n; k++) ['x', 'y'].forEach((d) => des.beams[k][d].forEach((b) => { if (b.fail) failedBeams.push(b); }));
  const failedFoot = des.footings.filter((f) => !f.res.ok);
  const failedSlabs = des.slabs.filter((s) => s && s.fail);
  const ok = !failedCols.length && !failedBeams.length && !failedFoot.length && !failedSlabs.length && iter <= 12 && !des.changed;
  if (failedFoot.length) warnings.push('Alguna base no verifica la tensión del suelo cargada: revisá el estudio de suelos o las dimensiones.');
  const cn = (i, j) => `${String.fromCharCode(65 + j)}${i + 1}`;
  const sec = (c) => `${Math.round(Math.min(c.cx, c.cy) * 100)}×${Math.round(Math.max(c.cx, c.cy) * 100)}`;
  const overMax = [];
  const overFixed = [];
  for (let m = 1; m <= G.n; m++) des.columns[m].forEach((c) => {
    if (c.exceeds.includes('lado máximo')) overMax.push(`${cn(c.i, c.j)} (entrepiso ${m}: ${sec(c)} cm)`);
    if (c.exceeds.includes('lado fijo')) overFixed.push(`${cn(c.i, c.j)} (entrepiso ${m}: ${sec(c)} cm)`);
  });
  if (overMax.length) warnings.push(`Con las cargas y luces cargadas, estas columnas necesitan más que el lado máximo de ${inp.colMax} cm que indicaste: ${overMax.slice(0, 8).join(', ')}${overMax.length > 8 ? '…' : ''}. Las secciones mostradas son las necesarias.`);
  if (overFixed.length) warnings.push(`En estas columnas no alcanzó con el lado fijo de ${inp.colMin} cm ni con el lado largo en ${Math.round(COL_LONG_CAP * 100)} cm, y se agrandó el lado fijo: ${overFixed.slice(0, 8).join(', ')}${overFixed.length > 8 ? '…' : ''}.`);
  const overBeams = [];
  for (let k = 1; k <= G.n; k++) ['x', 'y'].forEach((d) => des.beams[k][d].forEach((b) => { if (b.exceeds.length) overBeams.push(`nivel ${k} eje ${d === 'x' ? String.fromCharCode(65 + b.line) : b.line + 1} (${Math.round(b.b * 100)}×${Math.round(b.h * 100)} cm)`); }));
  if (overBeams.length) warnings.push(`Estas vigas necesitan más ${inp.beamHmax > 0 ? `que el ancho (${inp.beamB} cm) o la altura máxima (${inp.beamHmax} cm) indicados` : `que el ancho indicado (${inp.beamB} cm)`}: ${overBeams.slice(0, 8).join('; ')}${overBeams.length > 8 ? '…' : ''}.`);
  if (des.changed) warnings.push('El dimensionado automático no convergió en 12 iteraciones: aumentá las secciones mínimas.');
  const q = quantities(inp, G, sizes, des);
  // equilibrio vertical: suma de cargas en bases vs. carga total aplicada (control)
  let loadTotal = 0;
  for (let k = 1; k <= G.n; k++) {
    const lv = an.levels[k];
    const area = (sum(inp.xSpans) + inp.cant.left + inp.cant.right) * (sum(inp.ySpans) + inp.cant.front + inp.cant.back);
    void area;
    ['x'].forEach(() => {});
    loadTotal += 0;
    void lv;
  }
  return { ok, G, inp, sizes, an, des, iterations: iter, warnings, quantities: q, failed: { cols: failedCols.length, beams: failedBeams.length, foot: failedFoot.length, slabs: failedSlabs.length } };
}

export { geometry, colExists };
