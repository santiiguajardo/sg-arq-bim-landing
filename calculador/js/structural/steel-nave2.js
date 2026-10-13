// Naves de acero con (a) cabriada apoyada sobre columnas y (b) arco parabólico sobre columnas (o que arranca del terreno). El análisis es el de un pórtico
// plano por rigidez (frame.js): en la cabriada las barras son articuladas (se resuelven junto con las columnas, que toman el viento); el arco se discretiza en
// tramos rectos sobre la parábola. Método elástico de la cátedra (σ ≤ σadm, ω) y viento CIRSOC 102 (wind.js). Unidades: kg, m; secciones en cm.
import * as S from './steel.js';
import { solveFrame } from './frame.js';
import { naveWind, archWind } from './wind.js';
import { gableTruss, tributaries, designTruss, FAMILIES } from './steel-truss.js';
import { solidCheck, trussCheck, trussRafter, worstOver, rad } from './steel-portal.js';
import { roofLiveLoad, designPurlin } from './steel-design.js';
import { designFooting } from './footing.js';
import { deflectionCheck, DEFLECTION_LIMITS, DRIFT_LIMIT_INDUSTRIAL } from './steel-joints.js';

const E_M2 = S.E_STEEL * 1e4;
const KG = 9.80665;
const press = (p, S0, n) => ({ fx: -p * S0 * n[0], fy: -p * S0 * n[1] });            // fuerza por metro de longitud para la presión p (kg/m², + hacia la superficie)

// bases de las columnas: carga vertical máxima y momento; la presión máxima del suelo se aplica (del lado seguro) a toda la planta
function designBases(p, res, perBase) {
  const out = [];
  perBase.forEach((b, idx) => {
    const pf = res.col;
    const N = b.Nmax;
    const M = b.Mmax;                                         // kg·m
    const sigma = (Number(p.sigmaSoil) || 2);                 // kg/cm²
    const Df = Number(p.Df) || 1.5;
    const gs = (Number(p.gammaSoil) || 17) * 1000 / KG;       // kg/m³
    // lado c de una base cuadrada con el peso de la base (0,4 m) y del suelo: presión máxima σmax ≤ σ; con e > c/6 contacto parcial (triángulo)
    let c = 0.6;
    let qmax = 0;
    let e = 0;
    for (; c < 12; c += 0.05) {
      const Nt = N + c * c * (0.4 * 2400 + Math.max(0, Df - 0.4) * gs);
      e = M / Nt;
      qmax = e <= c / 6 ? Nt * (1 + 6 * e / c) / (c * c) : (e < c / 2 ? 2 * Nt / (3 * c * (c / 2 - e)) : Infinity);
      if (qmax <= sigma * 1e4) break;
    }
    const plate = Math.min(Math.max(pf.h, pf.b || pf.h, 150), 400);
    let footing;
    try {
      const Peq = Math.max(N, qmax * c * c - c * c * (0.4 * 2400 + Math.max(0, Df - 0.4) * gs));      // carga centrada equivalente: la presión máxima aplicada a toda la planta (del lado seguro)
      const RL = Math.min(Peq, res.base.p * p.S * p.A / 2);
      footing = designFooting({ PD: Math.max(0, Peq - RL) * KG, PL: RL * KG, bc: plate, hc: plate, fc: Number(p.fc) || 20, fy: 420, sigma: sigma * 0.0980665, gammaSoil: Number(p.gammaSoil) || 17, Df: Df * 1000, ratio: 1 });
    } catch (e2) { footing = { ok: false, reason: 'No se pudo calcular la base.' }; }
    const weight = footing.ok ? (footing.wSelf + footing.wSoil) / KG : 0;
    out.push({ idx, Nmax: N, Mmax: M, e, uplift: -b.Nmin, H: b.Hmax, c, qmax, partial: e > c / 6, footing, weight, upliftOk: b.Nmin >= 0 || weight >= 1.5 * -b.Nmin });
  });
  return out;
}

function baseEnv(states, nodeIdx) {
  return nodeIdx.map((n, k) => {
    let Nmax = 0; let Nmin = 0; let Hmax = 0; let Mmax = 0;
    states.forEach((st) => { const r = st.reactions.find((q) => q.node === n); if (!r) return; Nmax = Math.max(Nmax, r.fy); Nmin = Math.min(Nmin, r.fy); Hmax = Math.max(Hmax, Math.abs(r.fx)); Mmax = Math.max(Mmax, Math.abs(r.mz || 0)); });
    return { Nmax, Nmin, Hmax, Mmax };
  });
}

function purlinOf(p, res, theta) {
  let suction = 0;
  const w = res.wind;
  if (w) {
    w.lateral.forEach((c) => { Object.entries(c).forEach(([k, v]) => { if (v && typeof v === 'object' && 'p' in v && /roof|quarter|center/i.test(k)) suction = Math.max(suction, -v.p); }); });
    w.frontal.forEach((c) => { if (c.roof) suction = Math.max(suction, -c.roof.p); });
  }
  return { purlin: designPurlin({ L: p.S, alpha: theta, s: Number(p.sPurlin) || 1.5, gSurf: Number(p.gCover) || 0, pHor: res.base.p, svSurf: suction, types: [p.purlinType || 'C'], name: p.purlinName || null, grade: p.grade, fRatio: 200, pointLoad: 100, K: 4 }), suction };
}

// ================================================================= cabriada sobre columnas
// p: { A, B, H, f, n, diag, S, gSurf, gCover, self, autoSelf, gWall, p, pAuto, roofKind, windOn, V, ..., kx, sGirt, sPurlin, grade, omegaTable, colTypes, colName,
//      sections: { CS, CI, M, D }, names, sep, plateThickness, lpFactor, sameChords, base: 'fixed' | 'pinned' }
function runCab(p, self) {
  const grade = S.GRADES[p.grade] || S.GRADES['F-22'];
  const gt = gableTruss({ L: p.A, f: p.f, n: p.n, diag: p.diag });
  const alpha = gt.alpha;
  const theta = alpha * 180 / Math.PI;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const H = p.H;
  const nT = gt.nodes.length;
  const nodes = [{ x: 0, y: 0 }, { x: p.A, y: 0 }, ...gt.nodes.map((n) => ({ x: n.x, y: n.y + H }))];
  const tI = (i) => 2 + i;
  const topL = tI(0);
  const topR = tI(2 * p.n);
  const wind = p.windOn ? naveWind({ A: p.A, B: p.B, H, theta, V: p.V, exposure: p.exposure, caso: Number(p.caso) || 1, Kzt: Number(p.Kzt) || 1, Kd: Number(p.Kd) || 0.85, I: Number(p.Ie) || 1, enclosure: p.enclosure, xFrame: Number(p.xFrame) || 0 }) : null;
  const pRoof = p.pAuto === 'no' ? Number(p.p) : roofLiveLoad(theta, p.roofKind === 'light');
  const base = { S: p.S, p: pRoof, Np: (Number(p.gWall) || 0) * H * p.S, wind };
  const tr = tributaries(gt);
  const half = p.A / 2;
  const roofNodal = (fn) => tr.map((t) => ({ node: tI(t.node), ...fn(t) }));
  // estados
  const states = [];
  const gravityNodal = (withLive) => roofNodal((t) => ({ fx: 0, fy: -(((p.gSurf || 0) / ca + self) * t.w * p.S + (withLive ? pRoof * t.w * p.S : 0)) }));
  const wallNodal = (colSelf) => [{ node: topL, fx: 0, fy: -(base.Np + colSelf) }, { node: topR, fx: 0, fy: -(base.Np + colSelf) }];
  const addState = (id, label, nodal, colQ) => states.push({ id, label, nodal, colQ, wind: id !== 'E1' });
  addState('E1', 'Estado 1: permanentes + sobrecarga', gravityNodal(true), [0, 0]);
  if (wind) {
    const mk = (pwL, prL, prR, pwR) => ({ nodal: roofNodal((t) => {
      const wl = Math.max(0, Math.min(t.v, half) - t.u);
      const wr = Math.max(0, t.v - Math.max(t.u, half));
      const a = press(prL, p.S * wl / ca, [-sa, ca]);
      const b = press(prR, p.S * wr / ca, [sa, ca]);
      return { fx: a.fx + b.fx, fy: a.fy + b.fy };
    }), colQ: [press(pwL, p.S, [-1, 0]).fx, press(pwR, p.S, [1, 0]).fx] });
    const addWind = (id, label, pw, rw, rl, pl, fromRight) => {
      const m = fromRight ? mk(pl, rl, rw, pw) : mk(pw, rw, rl, pl);
      const g = gravityNodal(false);
      addState(id, label, g.map((q, i) => ({ node: q.node, fx: q.fx + m.nodal[i].fx, fy: q.fy + m.nodal[i].fy })), m.colQ);
    };
    wind.lateral.forEach((c) => {
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      const ro = c.roofOption === 'pos' ? ', presión en el faldón' : '';
      addWind(`V${states.length}`, `Viento lateral (izq.), GCpi ${gi}${ro}`, c.wallWindward.p, c.roofWindward.p, c.roofLeeward.p, c.wallLeeward.p, false);
      addWind(`V${states.length}`, `Viento lateral (der.), GCpi ${gi}${ro}`, c.wallWindward.p, c.roofWindward.p, c.roofLeeward.p, c.wallLeeward.p, true);
    });
    if (p.windMix !== false && wind.lateral.length > 1) {
      const mx = (key, sign) => Math.max(...wind.lateral.map((c) => sign * c[key].p)) * sign;
      const pw = mx('wallWindward', 1); const rw = mx('roofWindward', -1); const rl = mx('roofLeeward', -1); const pl = mx('wallLeeward', -1);
      addWind(`V${states.length}`, 'Viento lateral (izq.), más desfavorable por superficie (apunte)', pw, rw, rl, pl, false);
      addWind(`V${states.length}`, 'Viento lateral (der.), más desfavorable por superficie (apunte)', pw, rw, rl, pl, true);
    }
    wind.frontal.forEach((c) => {
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      const m = mk(c.side.p, c.roof.p, c.roof.p, c.side.p);
      const g = gravityNodal(false);
      addState(`V${states.length}`, `Viento sobre el frente, GCpi ${gi}`, g.map((q, i) => ({ node: q.node, fx: q.fx + m.nodal[i].fx, fy: q.fy + m.nodal[i].fy })), [press(c.side.p, p.S, [-1, 0]).fx, press(c.side.p, p.S, [1, 0]).fx]);
    });
  }
  return { grade, gt, nodes, tI, topL, topR, states, wallNodal, base, wind, alpha, theta, pRoof };
}

function solveCab(ctx, p, col, areas) {
  if (p.base === 'pinned') throw new Error('mecanismo inestable');
  const { gt, nodes, tI, topL, topR, states, wallNodal } = ctx;
  const nT = gt.nodes.length;
  const Acol = col.A / 1e4;
  const Icol = col.Ix / 1e8;
  const members = [{ i: 0, j: topL, E: E_M2, A: Acol, I: Icol }, { i: 1, j: topR, E: E_M2, A: Acol, I: Icol }];
  gt.bars.forEach((b, k) => members.push({ i: tI(b.a), j: tI(b.b), E: E_M2, A: areas[k] / 1e4, I: 1e-9, releaseI: true, releaseJ: true }));
  const fixed = p.base === 'pinned' ? { ux: true, uy: true, rz: false } : { ux: true, uy: true, rz: true };
  const supports = [{ node: 0, ...fixed }, { node: 1, ...fixed }];
  for (let i = 0; i < nT; i++) if (tI(i) !== topL && tI(i) !== topR) supports.push({ node: tI(i), ux: false, uy: false, rz: true });
  const colSelf = col.G * p.H;
  return states.map((st) => {
    const ms = members.map((m, k) => (k < 2 ? { ...m, local: { p: () => 0, q: () => st.colQ[k] } } : m));
    // la carga de viento sobre la columna actúa en x global: en la columna (eje local x hacia arriba) es la componente transversal: q = -fx·s + fy·c con c = 0, s = 1 → q = -fx
    ms[0] = { ...ms[0], local: { p: () => 0, q: () => -st.colQ[0] } };
    ms[1] = { ...ms[1], local: { p: () => 0, q: () => -st.colQ[1] } };
    const r = solveFrame({ nodes, members: ms, supports, nodalLoads: [...st.nodal, ...wallNodal(colSelf)] });
    const N = gt.bars.map((b, k) => r.members[2 + k].sample(2)[0].N);
    const colPts = [0, 1].map((k) => r.members[k].sample(24).map((q) => ({ x: nodes[k].x, y: nodes[k].y + (nodes[k === 0 ? topL : topR].y - nodes[k].y) * q.x / r.members[k].L, s: q.x, M: q.M, V: q.V, N: q.N })));
    return { ...st, N, colPts, u: r.u, reactions: r.reactions.filter((q) => q.node === 0 || q.node === 1), lengths: gt.bars.map((b) => Math.hypot(gt.nodes[b.b].x - gt.nodes[b.a].x, gt.nodes[b.b].y - gt.nodes[b.a].y)) };
  });
}

export function designNaveCab(p0) {
  let kt = 0;
  let kc = 0;
  let out = null;
  const max = p0.deflAuto === false ? 0 : 25;
  for (let k = 0; k <= max; k++) {
    out = designNaveCabSelf({ ...p0, bump: { truss: kt, col: kc } });
    out.bumps = { truss: kt, col: kc };
    if (out.defl.ok) break;
    if (!out.defl.vert.ok) kt += 1;
    if (!out.defl.driftOk) kc += 1;
  }
  return out;
}

function designNaveCabSelf(p0) {
  let p = p0;
  let out = null;
  const iters = p0.autoSelf ? 5 : 1;
  for (let k = 0; k < iters; k++) {
    out = designNaveCabOnce(p);
    if (!p0.autoSelf) break;
    const real = out.weights.selfReal;
    if (Math.abs(real - p.self) <= 0.05 * Math.max(real, 1)) break;
    p = { ...p, self: real };
  }
  out.selfAdjusted = Boolean(p0.autoSelf);
  return out;
}

function designNaveCabOnce(p) {
  const ctx = runCab(p, Number(p.self) || 0);
  const { grade, gt } = ctx;
  const colList = S.profileList(p.colTypes).sort((a, b) => a.G - b.G);
  let col = p.colName ? S.profileByName(p.colName) : colList[Math.floor(colList.length / 3)];
  let areas = gt.bars.map(() => 10);
  let tres = null;
  let solved = null;
  const LpxCol = (Number(p.kx) || 2) * p.H * 100;
  const LpyCol = (Number(p.sGirt) || 1.5) * 100;
  let iterations = 0;
  for (let it = 0; it < 8; it++) {
    iterations = it + 1;
    solved = solveCab(ctx, p, col, areas);
    const kb = Number(p.bump?.truss) || 0;
    const tOpts = { grade: p.grade, omegaTable: p.omegaTable, sections: p.sections, names: p.names, sep: p.sep, plateThickness: p.plateThickness, lpFactor: p.lpFactor, sameChords: p.sameChords, bump: { CS: kb, CI: kb, D: Math.floor(kb / 3), M: Math.floor(kb / 3) } };
    tres = designTruss(gt, solved.map((st) => ({ id: st.id, label: st.label, loads: [], N: st.N, reactions: [] })), tOpts);
    // columna
    const colCheck = (pf) => worstOver(undefined, solved.map((st) => ({ pts: st.colPts })), (pt) => solidCheck(pf, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable: p.omegaTable }));
    let nc = p.colName ? S.profileByName(p.colName) : null;
    if (!nc) { const ix = colList.findIndex((pf) => colCheck(pf).c.ok); nc = colList[Math.min(colList.length - 1, ix < 0 ? colList.length - 1 : ix + (Number(p.bump?.col) || 0))]; }
    const newAreas = gt.bars.map((b, k) => { const f = tres.families[b.fam]; return f && f.profile ? f.profile.A * f.def.mult : areas[k]; });
    const same = nc.n === col.n && newAreas.every((a, k) => Math.abs(a - areas[k]) < 1e-9);
    col = nc;
    areas = newAreas;
    if (same) break;
  }
  solved = solveCab(ctx, p, col, areas);
  const colW = worstOver(undefined, solved.map((st) => ({ pts: st.colPts })), (pt) => solidCheck(col, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable: p.omegaTable }));
  const env = [0, 1].map((k) => { let Mmax = 0; let Vmax = 0; let Nc = 0; solved.forEach((st) => st.colPts[k].forEach((q) => { Mmax = Math.max(Mmax, Math.abs(q.M)); Vmax = Math.max(Vmax, Math.abs(q.V)); Nc = Math.max(Nc, -q.N); })); return { Mmax, Vmax, Nc }; });
  const weightTruss = tres.weight;
  const weights = { cols: 2 * col.G * p.H, truss: weightTruss, total: 2 * col.G * p.H + weightTruss, selfReal: weightTruss / (p.A * p.S), selfAssumed: Number(p.self) || 0 };
  const res = { kind: 'cab', ok: tres.ok && colW.c.ok, grade, geom: gt, nodes: ctx.nodes, tI: ctx.tI, states: solved, truss: tres, col, colCheck: colW, env, wind: ctx.wind, base: ctx.base, weights, iterations, theta: ctx.theta, alpha: ctx.alpha };
  // flechas: cabriada (nudo central del cordón inferior respecto de los apoyos) y desplazamiento lateral de las columnas por viento
  const ctx0 = runCab({ ...p, windOn: false, pAuto: 'no', p: 0 }, Number(p.self) || 0);
  const dSol = solveCab(ctx0, p, col, areas)[0];
  const sag = (st) => -(st.u[3 * ctx0.tI(p.n) + 1] - (st.u[3 * ctx0.topL + 1] + st.u[3 * ctx0.topR + 1]) / 2);
  const lim = DEFLECTION_LIMITS[p.deflLimit] || DEFLECTION_LIMITS.industrialRigid;
  const fT = sag(solved[0]);
  const vert = deflectionCheck({ fTotal: fT, fLive: Math.max(0, fT - sag(dSol)), L: p.A, lim });
  let drift = 0;
  solved.forEach((st) => { if (st.wind) drift = Math.max(drift, Math.abs(st.u[3 * ctx0.topL]), Math.abs(st.u[3 * ctx0.topR])); });
  const driftLim = p.H / DRIFT_LIMIT_INDUSTRIAL;
  res.defl = { vert, drift, driftLim, driftOk: drift <= driftLim + 1e-12, ok: vert.ok && drift <= driftLim + 1e-12 };
  const pu = purlinOf(p, res, ctx.theta);
  const baseEnvs = baseEnv(solved, [0, 1]);
  const bases = designBases(p, res, baseEnvs);
  return { ...res, ...pu, bases };
}

// ================================================================= arco parabólico
export function archGeometry({ A, H, f, nSeg, hingeCrown, joint, base }) {
  const n = nSeg;
  const xs = Array.from({ length: n + 1 }, (_, i) => i * A / n);
  const ys = xs.map((x) => H + 4 * f * x * (A - x) / (A * A));
  const nodes = [];
  const cols = H > 0;
  if (cols) nodes.push({ x: 0, y: 0 });
  xs.forEach((x, i) => nodes.push({ x, y: ys[i] }));
  if (cols) nodes.push({ x: A, y: 0 });
  const off = cols ? 1 : 0;
  const members = [];
  if (cols) members.push({ i: 0, j: 1, kind: 'col' });
  for (let i = 0; i < n; i++) members.push({ i: off + i, j: off + i + 1, kind: 'arch' });
  if (cols) members.push({ i: off + n, j: nodes.length - 1, kind: 'col' });
  return { A, H, f, n, nodes, members, cols, off, hingeCrown, joint, base, crownNode: off + n / 2 };
}

function archStates(g, o) {
  const { A, f, n, H } = g;
  const ct = (k) => { const m = g.members[k]; const a = g.nodes[m.i]; const b = g.nodes[m.j]; const L = Math.hypot(b.x - a.x, b.y - a.y); return { c: (b.x - a.x) / L, s: (b.y - a.y) / L, L, xm: (a.x + b.x) / 2 }; };
  const dirs = g.members.map((m, k) => ct(k));
  const states = [];
  const nodalWalls = g.cols ? [{ node: g.off, fx: 0, fy: -(o.Np + o.colSelf) }, { node: g.off + n, fx: 0, fy: -(o.Np + o.colSelf) }] : [];
  // cubierta y accesorios: kg/m² de superficie (por metro de arco); peso propio del arco y sobrecarga: por m² de proyección horizontal (× cos φ por metro de arco)
  const gravity = (withLive) => g.members.map((m, k) => (m.kind === 'arch' ? { fx: 0, fy: -((o.gSurf || 0) * o.S + (o.self + (withLive ? o.p : 0)) * o.S * dirs[k].c) } : { fx: 0, fy: 0 }));
  states.push({ id: 'E1', label: 'Estado 1: permanentes + sobrecarga', dist: gravity(true), nodal: nodalWalls });
  const wind = o.wind;
  if (wind) {
    const outN = (k) => {
      const d = dirs[k];
      const m = g.members[k];
      if (m.kind === 'col') return k === 0 ? [-1, 0] : [1, 0];
      return d.xm < A / 2 ? [-d.s, d.c] : [-d.s, d.c];                  // normal hacia arriba: (-s, c) con c > 0
    };
    const zoneCp = (c, k, fromRight) => {
      const m = g.members[k];
      if (m.kind === 'col') return null;
      const x = fromRight ? A - dirs[k].xm : dirs[k].xm;
      return x < A / 4 ? c.quarterWindward.p : x > 3 * A / 4 ? c.quarterLeeward.p : c.center.p;
    };
    const lat = (c, fromRight, gi, label) => {
      const gg = gravity(false);
      const dist = g.members.map((m, k) => {
        let pv;
        if (m.kind === 'col') { const left = k === 0; const wwall = fromRight ? !left : left; pv = wwall ? c.wallWindward.p : c.wallLeeward.p; }
        else pv = zoneCp(c, k, fromRight);
        const f2 = press(pv, o.S, outN(k));
        return { fx: gg[k].fx + f2.fx, fy: gg[k].fy + f2.fy };
      });
      states.push({ id: `V${states.length}`, label, dist, nodal: nodalWalls, wind: true });
    };
    wind.lateral.forEach((c) => {
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      const alt = c.alt ? ', valor alternativo' : '';
      lat(c, false, gi, `Viento lateral (izq.), GCpi ${gi}${alt}`);
      lat(c, true, gi, `Viento lateral (der.), GCpi ${gi}${alt}`);
    });
    if (o.windMix !== false && wind.lateral.length > 1) {
      const mx = (fn, sign) => Math.max(...wind.lateral.map((c) => sign * fn(c))) * sign;
      const c = { wallWindward: { p: mx((q) => q.wallWindward.p, 1) }, wallLeeward: { p: mx((q) => q.wallLeeward.p, -1) }, quarterWindward: { p: mx((q) => q.quarterWindward.p, -1) }, center: { p: mx((q) => q.center.p, -1) }, quarterLeeward: { p: mx((q) => q.quarterLeeward.p, -1) } };
      lat(c, false, '', 'Viento lateral (izq.), más desfavorable por zona (apunte)');
      lat(c, true, '', 'Viento lateral (der.), más desfavorable por zona (apunte)');
    }
    wind.frontal.forEach((c) => {
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      const gg = gravity(false);
      const dist = g.members.map((m, k) => { const f2 = press(m.kind === 'col' ? c.side.p : c.roof.p, o.S, outN(k)); return { fx: gg[k].fx + f2.fx, fy: gg[k].fy + f2.fy }; });
      states.push({ id: `V${states.length}`, label: `Viento sobre el frente, GCpi ${gi}`, dist, nodal: nodalWalls, wind: true });
    });
  }
  return { states, dirs };
}

function analyzeArch(g, states, dirs, sec, opts) {
  if (g.cols && opts.joint === 'pinned' && opts.hingeCrown && opts.base !== 'fixed') throw new Error('mecanismo inestable');
  const mk = (kind) => (kind === 'col' ? sec.col : sec.arch);
  const members = g.members.map((m) => { const s = mk(m.kind); return { i: m.i, j: m.j, E: E_M2, A: (s.kind === 'truss' ? s.A : s.profile.A) / 1e4, I: (s.kind === 'truss' ? s.J : s.profile.Ix) / 1e8 }; });
  const firstArch = g.off;
  const lastArch = g.off + g.n - 1;
  if (opts.hingeCrown) members[g.off + g.n / 2].releaseI = true;                        // articulación en la clave (el miembro que arranca en la clave)
  if (opts.joint === 'pinned' && g.cols) { members[firstArch].releaseI = true; members[lastArch].releaseJ = true; }
  const fix = opts.base === 'fixed' ? { ux: true, uy: true, rz: true } : { ux: true, uy: true, rz: false };
  const supports = g.cols ? [{ node: 0, ...fix }, { node: g.nodes.length - 1, ...fix }] : [{ node: g.off, ...fix }, { node: g.off + g.n, ...fix }];
  return states.map((st) => {
    const ms = members.map((m, k) => { const d = dirs[k]; const f2 = st.dist[k]; return { ...m, local: { p: () => f2.fx * d.c + f2.fy * d.s, q: () => -f2.fx * d.s + f2.fy * d.c } }; });
    const r = solveFrame({ nodes: g.nodes, members: ms, supports, nodalLoads: st.nodal });
    const pts = r.members.map((m, k) => { const a = g.nodes[g.members[k].i]; const b = g.nodes[g.members[k].j]; return m.sample(6).map((q) => ({ x: a.x + (b.x - a.x) * q.x / m.L, y: a.y + (b.y - a.y) * q.x / m.L, s: q.x, M: q.M, V: q.V, N: q.N })); });
    return { ...st, reactions: r.reactions, pts, u: r.u, lengths: r.members.map((m) => m.L) };
  });
}

export function designNaveArch(p0) {
  let kb = 0;
  let kc = 0;
  let out = null;
  const max = p0.deflAuto === false ? 0 : 25;
  for (let k = 0; k <= max; k++) {
    out = designNaveArchSelf({ ...p0, bump: { arch: kb, col: kc } });
    out.bumps = { arch: kb, col: kc };
    if (out.defl.ok) break;
    if (!out.defl.vert.ok) kb += 1;
    if (!out.defl.driftOk) kc += 1;
  }
  return out;
}

function designNaveArchSelf(p0) {
  let p = p0;
  let out = null;
  const iters = p0.autoSelf ? 5 : 1;
  for (let k = 0; k < iters; k++) {
    out = designArchOnce(p);
    if (!p0.autoSelf) break;
    const real = out.weights.selfReal;
    if (Math.abs(real - p.self) <= 0.05 * Math.max(real, 1)) break;
    p = { ...p, self: real };
  }
  out.selfAdjusted = Boolean(p0.autoSelf);
  return out;
}

function designArchOnce(p) {
  const grade = S.GRADES[p.grade] || S.GRADES['F-22'];
  const g = archGeometry({ A: p.A, H: p.H, f: p.f, nSeg: 24, hingeCrown: p.hingeCrown, joint: p.joint, base: p.base });
  const wind = p.windOn ? archWind({ A: p.A, B: p.B, H: p.H, f: p.f, V: p.V, exposure: p.exposure, caso: Number(p.caso) || 1, Kzt: Number(p.Kzt) || 1, Kd: Number(p.Kd) || 0.85, I: Number(p.Ie) || 1, enclosure: p.enclosure, xFrame: Number(p.xFrame) || 0 }) : null;
  // pendiente media de la cubierta para la sobrecarga: la del arranque
  const thetaStart = Math.atan(4 * p.f / p.A) * 180 / Math.PI;
  const pRoof = p.pAuto === 'no' ? Number(p.p) : roofLiveLoad(thetaStart, p.roofKind === 'light');
  const base = { S: p.S, gSurf: Number(p.gSurf) || 0, self: Number(p.self) || 0, p: pRoof, Np: (Number(p.gWall) || 0) * p.H * p.S, wind };
  const colList = S.profileList(p.colTypes).sort((a, b) => a.G - b.G);
  const archList = S.profileList(p.archTypes).sort((a, b) => a.G - b.G);
  const chordList = S.profileList(p.chordTypes || ['UPN']).sort((a, b) => a.G - b.G);
  const diagList = S.profileList(['L']).sort((a, b) => a.G - b.G);
  const isTruss = p.rafter === 'truss';
  const hT = Number(p.hTruss) || p.A / 30;
  const mkTruss = (ch, dg) => ({ kind: 'truss', ...trussRafter({ chord: ch, diag: dg, h: hT, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 }), profile: ch });
  let col = p.colName ? S.profileByName(p.colName) : colList[Math.floor(colList.length / 3)];
  let arch = isTruss ? mkTruss(chordList[Math.floor(chordList.length / 3)], diagList[3] || diagList[0]) : (p.archName ? S.profileByName(p.archName) : archList[Math.floor(archList.length / 3)]);
  const arcLen = g.members.filter((m) => m.kind === 'arch').reduce((s0, m) => s0 + Math.hypot(g.nodes[m.j].x - g.nodes[m.i].x, g.nodes[m.j].y - g.nodes[m.i].y), 0);
  const LpxArch = (Number(p.kArc) || 0.5) * arcLen * 100;
  const LpyArch = (Number(p.sPurlin) || 1.5) * 100;
  const LpxCol = (Number(p.kx) || 2) * Math.max(p.H, 0.01) * 100;
  const LpyCol = (Number(p.sGirt) || 1.5) * 100;
  const omegaTable = p.omegaTable;
  const archKey = (b) => (isTruss ? `${b.chord.n}|${b.diag.n}` : b.n);
  let res = null;
  let dirs = null;
  const sections = (c, a) => ({ col: { kind: 'solid', profile: c }, arch: isTruss ? a : { kind: 'solid', profile: a } });
  for (let it = 0; it < 10; it++) {
    const st0 = archStates(g, { ...base, colSelf: col.G * p.H });
    dirs = st0.dirs;
    res = analyzeArch(g, st0.states, dirs, sections(col, arch), p);
    const isCol = (k) => g.members[k].kind === 'col';
    let nc = col;
    if (g.cols) {
      nc = p.colName ? S.profileByName(p.colName) : null;
      if (!nc) { const ix = colList.findIndex((pf) => worstOver(isCol, res, (pt) => solidCheck(pf, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable })).c.ok); nc = colList[Math.min(colList.length - 1, ix < 0 ? colList.length - 1 : ix + (Number(p.bump?.col) || 0))]; }
    }
    let na;
    const isArc = (k) => g.members[k].kind === 'arch';
    if (isTruss) {
      let found = null;
      for (const ch of chordList) {
        for (const dg of diagList) {
          const r = trussRafter({ chord: ch, diag: dg, h: hT, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 });
          if (worstOver(isArc, res, (pt) => trussCheck(r, grade, pt, { omegaTable, lpDiag: Number(p.lpDiag) || 1 })).c.ok) { found = { kind: 'truss', ...r, profile: ch }; break; }
        }
        if (found) break;
      }
      if (found && Number(p.bump?.arch)) { const ci = chordList.findIndex((c) => c.n === found.chord.n); const ch2 = chordList[Math.min(chordList.length - 1, ci + Number(p.bump.arch))]; found = { kind: 'truss', ...trussRafter({ chord: ch2, diag: found.diag, h: hT, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 }), profile: ch2 }; }
      na = found || mkTruss(chordList[chordList.length - 1], diagList[diagList.length - 1]);
    } else {
      na = p.archName ? S.profileByName(p.archName) : null;
      if (!na) { const ix = archList.findIndex((pf) => worstOver(isArc, res, (pt) => solidCheck(pf, grade, pt, { Lpx: LpxArch, Lpy: LpyArch, omegaTable })).c.ok); na = archList[Math.min(archList.length - 1, ix < 0 ? archList.length - 1 : ix + (Number(p.bump?.arch) || 0))]; }
    }
    const same = nc.n === col.n && archKey(na) === archKey(arch);
    col = nc; arch = na;
    if (same) break;
  }
  const st1 = archStates(g, { ...base, colSelf: col.G * p.H });
  dirs = st1.dirs;
  res = analyzeArch(g, st1.states, dirs, sections(col, arch), p);
  const isCol = (k) => g.members[k].kind === 'col';
  const isArc = (k) => g.members[k].kind === 'arch';
  const colW = g.cols ? worstOver(isCol, res, (pt) => solidCheck(col, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable })) : null;
  const archW = isTruss ? worstOver(isArc, res, (pt) => trussCheck(arch, grade, pt, { omegaTable, lpDiag: Number(p.lpDiag) || 1 }))
    : worstOver(isArc, res, (pt) => solidCheck(arch, grade, pt, { Lpx: LpxArch, Lpy: LpyArch, omegaTable }));
  const env = (sel) => { let Mmax = 0; let Vmax = 0; let Nt = 0; let Nc = 0; res.forEach((st) => st.pts.forEach((pts, k) => { if (!sel(k)) return; pts.forEach((q) => { Mmax = Math.max(Mmax, Math.abs(q.M)); Vmax = Math.max(Vmax, Math.abs(q.V)); Nt = Math.max(Nt, q.N); Nc = Math.max(Nc, -q.N); }); })); return { Mmax, Vmax, Nt, Nc }; };
  const weights = { cols: g.cols ? 2 * col.G * p.H : 0, arch: arcLen * arch.G, total: (g.cols ? 2 * col.G * p.H : 0) + arcLen * arch.G, selfReal: arcLen * arch.G / (p.A * p.S), selfAssumed: base.self };
  const crown = g.off + g.n / 2;
  const stD = archStates(g, { ...base, p: 0, wind: null, colSelf: col.G * p.H });
  const dRes = analyzeArch(g, stD.states.slice(0, 1), stD.dirs, sections(col, arch), p)[0];
  const sagA = (st) => -(st.u[3 * crown + 1] - (st.u[3 * g.off + 1] + st.u[3 * (g.off + g.n) + 1]) / 2);
  const limA = DEFLECTION_LIMITS[p.deflLimit] || DEFLECTION_LIMITS.industrialRigid;
  const fTa = sagA(res[0]);
  const vertA = deflectionCheck({ fTotal: fTa, fLive: Math.max(0, fTa - sagA(dRes)), L: p.A, lim: limA });
  let driftA = 0;
  if (g.cols) res.forEach((st) => { if (st.wind) driftA = Math.max(driftA, Math.abs(st.u[3 * g.off]), Math.abs(st.u[3 * (g.off + g.n)])); });
  const driftLimA = g.cols ? p.H / DRIFT_LIMIT_INDUSTRIAL : Infinity;
  const defl = { vert: vertA, drift: driftA, driftLim: driftLimA, driftOk: driftA <= driftLimA + 1e-12, ok: vertA.ok && driftA <= driftLimA + 1e-12 };
  const out = { kind: 'arch', defl, ok: archW.c.ok && (!colW || colW.c.ok), grade, geom: g, states: res, dirs, col: g.cols ? col : null, arch: isTruss ? arch : { kind: 'solid', profile: arch }, isTruss, colCheck: colW, archCheck: archW, envCol: env(isCol), envArch: env(isArc), wind, base, weights, arcLen, thetaStart, LpxArch, LpxCol };
  const theta = thetaStart;
  const pu = purlinOf(p, { ...out }, theta);
  // bases (si hay columnas) o arranques del arco
  const nodesBase = g.cols ? [0, g.nodes.length - 1] : [g.off, g.off + g.n];
  const be = baseEnv(res, nodesBase);
  const bases = designBases(p, { ...out, col: g.cols ? col : (isTruss ? arch.chord : arch) }, be);
  const thrust = Math.max(...res.map((st) => Math.abs(st.reactions[0].fx)));
  return { ...out, ...pu, bases, thrust, sections: { col: g.cols ? col : null } };
}
