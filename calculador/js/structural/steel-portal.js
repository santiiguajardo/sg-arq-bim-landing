// Pórticos de naves industriales de acero (viga quebrada o triarticulado, dintel de alma llena o reticulado) con el método elástico de la cátedra
// (Estructuras III: "Nave industrial, resolución de pórtico de viga quebrada", "Pórtico triarticulado" y "Vigas reticuladas").
// El análisis es el de un pórtico plano por rigidez (frame.js) con las rigideces de las secciones adoptadas, en lugar de las fórmulas aproximadas
// de hiperestáticos con promedio de momentos de los apuntes. Unidades: kg, m (esfuerzos en kg y kg·m), secciones en cm y kg/cm².
import * as S from './steel.js';
import { solveFrame } from './frame.js';
import { naveWind } from './wind.js';
import { roofLiveLoad, designPurlin } from './steel-design.js';
import { designFooting } from './footing.js';
import { deflectionCheck, DEFLECTION_LIMITS, DRIFT_LIMIT_INDUSTRIAL } from './steel-joints.js';

const E_M2 = S.E_STEEL * 1e4;                       // kg/m²
export const rad = (d) => d * Math.PI / 180;

// ---------------------------------------------------------------- geometría
export function portalGeometry({ A, H, theta }) {
  const f = (A / 2) * Math.tan(rad(theta));
  const nodes = [{ x: 0, y: 0 }, { x: 0, y: H }, { x: A / 2, y: H + f }, { x: A, y: H }, { x: A, y: 0 }];
  const members = [{ i: 0, j: 1, kind: 'col' }, { i: 1, j: 2, kind: 'beam' }, { i: 2, j: 3, kind: 'beam' }, { i: 3, j: 4, kind: 'col' }];
  return { A, H, theta, f, nodes, members };
}

// ---------------------------------------------------------------- estados de carga
// Cargas repartidas como fuerza global por metro de barra (fx, fy) en cada barra; cargas nodales en los nudos de alero.
function memberDirs(g) {
  const c = Math.cos(rad(g.theta));
  const s = Math.sin(rad(g.theta));
  return [
    { c: 0, s: 1, out: [-1, 0] },          // columna izquierda
    { c, s, out: [-s, c] },                // faldón izquierdo
    { c, s: -s, out: [s, c] },             // faldón derecho (de la cumbrera al alero)
    { c: 0, s: -1, out: [1, 0] },          // columna derecha
  ];
}
const press = (p, S0, out) => ({ fx: -p * S0 * out[0], fy: -p * S0 * out[1] });     // presión p (kg/m², + hacia la superficie) sobre un ancho S0

export function portalStates(g, o) {
  const dirs = memberDirs(g);
  const ct = Math.cos(rad(g.theta));
  const Sp = o.S;
  const states = [];
  const gPlan = (o.gSurf / ct + o.self) * Sp;                  // kg por m horizontal de cubierta
  const NpNode = o.Np + o.colSelf;                             // peso de paredes y de la columna en cada alero
  const gravity = () => dirs.map((d, k) => (k === 1 || k === 2 ? { fx: 0, fy: -gPlan * ct } : { fx: 0, fy: 0 }));
  const nodal = [{ node: 1, fx: 0, fy: -NpNode }, { node: 3, fx: 0, fy: -NpNode }];
  // Estado 1: permanentes + sobrecarga
  states.push({ id: 'E1', label: 'Estado 1: permanentes + sobrecarga', dist: dirs.map((d, k) => (k === 1 || k === 2 ? { fx: 0, fy: -(gPlan + o.p * Sp) * ct } : { fx: 0, fy: 0 })), nodal });
  if (o.wind) {
    const w = o.wind;
    const mirror = (arr) => [arr[3], arr[2], arr[1], arr[0]];
    w.lateral.forEach((c) => {
      const left = [press(c.wallWindward.p, Sp, dirs[0].out), press(c.roofWindward.p, Sp, dirs[1].out), press(c.roofLeeward.p, Sp, dirs[2].out), press(c.wallLeeward.p, Sp, dirs[3].out)];
      const right = [press(c.wallLeeward.p, Sp, dirs[0].out), press(c.roofLeeward.p, Sp, dirs[1].out), press(c.roofWindward.p, Sp, dirs[2].out), press(c.wallWindward.p, Sp, dirs[3].out)];
      const gg = gravity();
      const add = (a, b) => a.map((v, k) => ({ fx: v.fx + b[k].fx, fy: v.fy + b[k].fy }));
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      const ro = c.roofOption === 'pos' ? ', presión en el faldón' : '';
      states.push({ id: `V${states.length}`, label: `Viento lateral (desde la izquierda), GCpi ${gi}${ro}`, dist: add(gg, left), nodal, wind: true });
      states.push({ id: `V${states.length}`, label: `Viento lateral (desde la derecha), GCpi ${gi}${ro}`, dist: add(gg, right), nodal, wind: true });
    });
    if (o.windMix && w.lateral.length > 1) {
      // estado del apunte: en cada superficie se toma el valor más desfavorable de los casos de GCpi (conservador: no ocurren a la vez)
      const mx = (key, sign) => Math.max(...w.lateral.map((c) => sign * c[key].p)) * sign;
      const c = { wallWindward: { p: mx('wallWindward', 1) }, roofWindward: { p: mx('roofWindward', -1) }, roofLeeward: { p: mx('roofLeeward', -1) }, wallLeeward: { p: mx('wallLeeward', -1) } };
      const left = [press(c.wallWindward.p, Sp, dirs[0].out), press(c.roofWindward.p, Sp, dirs[1].out), press(c.roofLeeward.p, Sp, dirs[2].out), press(c.wallLeeward.p, Sp, dirs[3].out)];
      const right = [press(c.wallLeeward.p, Sp, dirs[0].out), press(c.roofLeeward.p, Sp, dirs[1].out), press(c.roofWindward.p, Sp, dirs[2].out), press(c.wallWindward.p, Sp, dirs[3].out)];
      const gg = gravity();
      const add2 = (x, y) => x.map((v, k) => ({ fx: v.fx + y[k].fx, fy: v.fy + y[k].fy }));
      states.push({ id: `V${states.length}`, label: 'Viento lateral (izquierda), más desfavorable por superficie (apunte)', dist: add2(gg, left), nodal, wind: true });
      states.push({ id: `V${states.length}`, label: 'Viento lateral (derecha), más desfavorable por superficie (apunte)', dist: add2(gg, right), nodal, wind: true });
    }
    w.frontal.forEach((c) => {
      const f = [press(c.side.p, Sp, dirs[0].out), press(c.roof.p, Sp, dirs[1].out), press(c.roof.p, Sp, dirs[2].out), press(c.side.p, Sp, dirs[3].out)];
      const gg = gravity();
      const gi = c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0';
      states.push({ id: `V${states.length}`, label: `Viento sobre el frente, GCpi ${gi}`, dist: gg.map((v, k) => ({ fx: v.fx + f[k].fx, fy: v.fy + f[k].fy })), nodal, wind: true });
    });
  }
  return states;
}

// ---------------------------------------------------------------- dintel reticulado (apunte "Vigas reticuladas" y pórtico triarticulado)
// chord: perfil de cada cordón (2 cordones separados h); diag: ángulo simple; alpha: ángulo de las diagonales con el cordón
export function trussRafter({ chord, diag, h, alphaDeg = 60, planes = 2 }) {
  const a = rad(alphaDeg);
  const d = h / 2;
  const A = 2 * chord.A;
  const J = 2 * ((chord.Iy ?? chord.Ix) + chord.A * (d * 100) ** 2);          // cm⁴ (Steiner, h en m → cm)
  const s = 2 * h / Math.tan(a);                                               // separación de nudos de un mismo cordón
  const ds = h / Math.sin(a);
  const wDiag = planes * (2 / s) * ds * diag.G;
  return { chord, diag, h, alpha: alphaDeg, planes, A, J, s, ds, G: 2 * chord.G + wDiag };
}

// ---------------------------------------------------------------- verificaciones de barra
const sigmaOf = (profile, grade) => S.sigmaAllow(profile, grade);

// Barra de alma llena con flexión y esfuerzo axial. M en kg·m, N en kg (tracción +), V en kg. Lpx / Lpy: longitudes de pandeo (cm) en el plano y fuera de él.
export function solidCheck(profile, grade, { M, N, V }, { Lpx, Lpy, omegaTable }) {
  const sA = sigmaOf(profile, grade);
  const tA = S.tauAllow(profile, grade);
  const Wx = profile.Wx;
  const sig = Math.abs(M) * 100 / Wx;
  let ok = true;
  let sigma;
  let omega = null;
  let lambda = 0;
  if (N >= 0) sigma = sig + N / profile.A;
  else {
    const Nc = -N;
    lambda = Math.max(Lpx / profile.ix, Lpy / profile.iy);
    omega = S.omegaOf(lambda, omegaTable === 'St37' ? 'St37' : grade.omega);
    if (omega === null) { ok = false; sigma = Infinity; } else sigma = Math.max(Nc / profile.A + sig, omega * Nc / profile.A + 0.9 * sig);
  }
  const tau = S.shearStress(profile, Math.abs(V));
  const util = Math.max(sigma / sA, tau / tA);
  return { ok: ok && sigma <= sA + 1e-9 && tau <= tA + 1e-9, sigma, sigmaAllow: sA, tau, tauAllow: tA, omega, lambda, util, N, M, V };
}

// Dintel reticulado: σ = M y / J + N / A (como en el apunte), pandeo del cordón comprimido y diagonal con el corte máximo
export function trussCheck(r, grade, { M, N, V }, { omegaTable, lpDiag }) {
  const sA = sigmaOf(r.chord, grade);
  const d = r.h / 2 * 100;
  const sigma = Math.abs(M) * 100 * d / r.J + (N >= 0 ? N : 0) / r.A;
  const Cc = Math.abs(M) / r.h + (N < 0 ? -N / 2 : 0);                          // fuerza en el cordón comprimido (kg)
  const lamC = (r.s * 100) / (r.chord.imin ?? Math.min(r.chord.ix, r.chord.iy));
  const omC = S.omegaOf(lamC, omegaTable === 'St37' ? 'St37' : grade.omega);
  const sigC = omC === null ? Infinity : omC * Cc / r.chord.A;
  const D = Math.abs(V) / (r.planes * Math.sin(rad(r.alpha)));
  const lamD = (r.ds * 100 * lpDiag) / (r.diag.imin ?? Math.min(r.diag.ix, r.diag.iy));
  const omD = S.omegaOf(lamD, omegaTable === 'St37' ? 'St37' : grade.omega);
  const sigD = omD === null ? Infinity : omD * D / r.diag.A;
  const util = Math.max(sigma / sA, sigC / sA, sigD / sA);
  return { ok: sigma <= sA + 1e-9 && sigC <= sA + 1e-9 && sigD <= sA + 1e-9, sigma, sigmaAllow: sA, sigC, omC, lamC, Cc, D, sigD, omD, lamD, util, N, M, V };
}

// ---------------------------------------------------------------- análisis y dimensionado
function analyze(g, states, sec, opts) {
  const mem = (kind) => (kind === 'col' ? sec.col : sec.beam);
  const members = g.members.map((m, k) => {
    const sct = mem(m.kind);
    const A = (sct.kind === 'truss' ? sct.A : sct.profile.A) / 1e4;
    const I = (sct.kind === 'truss' ? sct.J : sct.profile.Ix) / 1e8;
    return { i: m.i, j: m.j, E: E_M2, A, I };
  });
  if (opts.type === 'triarticulado') members[2].releaseI = true;                 // articulación en la cumbrera
  const sup = opts.base === 'fixed' ? { ux: true, uy: true, rz: true } : { ux: true, uy: true, rz: false };
  const supports = [{ node: 0, ...sup }, { node: 4, ...sup }];
  const dirs = memberDirs(g);
  return states.map((st) => {
    const ms = members.map((m, k) => {
      const d = dirs[k];
      const f = st.dist[k];
      const p = f.fx * d.c + f.fy * d.s;
      const q = -f.fx * d.s + f.fy * d.c;
      return { ...m, local: { p: () => p, q: () => q } };
    });
    const r = solveFrame({ nodes: g.nodes, members: ms, supports, nodalLoads: st.nodal });
    const pts = r.members.map((m, k) => {
      const a = g.nodes[g.members[k].i];
      const b = g.nodes[g.members[k].j];
      return m.sample(24).map((q) => ({ x: a.x + (b.x - a.x) * q.x / m.L, y: a.y + (b.y - a.y) * q.x / m.L, s: q.x, M: q.M, V: q.V, N: q.N }));
    });
    return { ...st, reactions: r.reactions, pts, u: r.u, lengths: r.members.map((m) => m.L) };
  });
}

export function worstOver(kinds, results, check) {
  let worst = null;
  results.forEach((st, si) => {
    st.pts.forEach((pts, k) => {
      if (kinds !== undefined && !kinds(k)) return;
      pts.forEach((p) => {
        const c = check(p, k);
        if (!worst || c.util > worst.c.util) worst = { c, state: si, member: k, point: p };
      });
    });
  });
  return worst;
}

function designPortalCore(p) {
  const grade = S.GRADES[p.grade] || S.GRADES['F-22'];
  const g = portalGeometry({ A: p.A, H: p.H, theta: p.theta });
  const omegaTable = p.omegaTable;
  const colList = S.profileList(p.colTypes).sort((a, b) => a.G - b.G);
  const beamList = S.profileList(p.beamTypes).sort((a, b) => a.G - b.G);
  const chordList = S.profileList(p.chordTypes || ['UPN']).sort((a, b) => a.G - b.G);
  const diagList = S.profileList(['L']).sort((a, b) => a.G - b.G);
  const isTruss = p.rafter === 'truss';
  const hTruss = Number(p.hTruss) || p.A / 30;
  const mkTruss = (chord, diag) => ({ kind: 'truss', ...trussRafter({ chord, diag, h: hTruss, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 }), profile: chord });
  let col = p.colName ? S.profileByName(p.colName) : colList[Math.floor(colList.length / 3)];
  let beam = isTruss ? mkTruss(chordList[Math.floor(chordList.length / 3)], diagList[3] || diagList[0]) : (p.beamName ? S.profileByName(p.beamName) : beamList[Math.floor(beamList.length / 3)]);
  const wind = p.windOn ? naveWind({ A: p.A, B: p.B, H: p.H, theta: p.theta, V: p.V, exposure: p.exposure, caso: Number(p.caso) || 1, Kzt: Number(p.Kzt) || 1, Kd: Number(p.Kd) || 0.85, I: Number(p.Ie) || 1, enclosure: p.enclosure, xFrame: Number(p.xFrame) || 0 }) : null;
  const pRoof = p.pAuto === 'no' ? Number(p.p) : roofLiveLoad(p.theta, p.roofKind === 'light');
  const base = { S: p.S, gSurf: Number(p.gSurf) || 0, self: Number(p.self) || 0, p: pRoof, Np: (Number(p.gWall) || 0) * p.H * p.S, wind, windMix: p.windMix !== false };
  const beamLen = g.A / 2 / Math.cos(rad(p.theta));
  const lpDiag = Number(p.lpDiag) || 1;
  let res = null;
  const beamKey = (b) => (isTruss ? `${b.chord.n}|${b.diag.n}` : b.n);
  let iterations = 0;
  for (let it = 0; it < 10; it++) {
    iterations = it + 1;
    const colSelf = col.G * p.H;
    const states = portalStates(g, { ...base, colSelf });
    const sec = { col: { kind: 'solid', profile: col }, beam: isTruss ? beam : { kind: 'solid', profile: beam } };
    res = analyze(g, states, sec, { type: p.type, base: p.base });
    // columnas
    const LpxCol = (Number(p.kx) || 2) * p.H * 100;
    const LpyCol = (Number(p.sGirt) || 1.5) * 100;
    const colCheck = (profile) => worstOver((k) => k === 0 || k === 3, res, (pt) => solidCheck(profile, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable }));
    let nc = p.colName ? S.profileByName(p.colName) : null;
    if (!nc) { const ix = colList.findIndex((pf) => colCheck(pf).c.ok); nc = colList[Math.min(colList.length - 1, ix < 0 ? colList.length - 1 : ix + (Number(p.bump?.col) || 0))]; }
    // dintel
    let nb;
    if (isTruss) {
      const beamCk = (r) => worstOver((k) => k === 1 || k === 2, res, (pt) => trussCheck(r, grade, pt, { omegaTable, lpDiag }));
      let found = null;
      for (const ch of chordList) {
        for (const dg of diagList) {
          const r = trussRafter({ chord: ch, diag: dg, h: hTruss, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 });
          if (beamCk(r).c.ok) { found = { kind: 'truss', ...r, profile: ch }; break; }
        }
        if (found) break;
      }
      if (found && Number(p.bump?.beam)) {
        const ci = chordList.findIndex((c) => c.n === found.chord.n);
        const ch2 = chordList[Math.min(chordList.length - 1, ci + Number(p.bump.beam))];
        found = { kind: 'truss', ...trussRafter({ chord: ch2, diag: found.diag, h: hTruss, alphaDeg: Number(p.alphaDiag) || 60, planes: Number(p.planes) || 2 }), profile: ch2 };
      }
      nb = found || mkTruss(chordList[chordList.length - 1], diagList[diagList.length - 1]);
    } else {
      const LpyB = (Number(p.sPurlin) || 1.5) * 100;
      const beamCk = (profile) => worstOver((k) => k === 1 || k === 2, res, (pt) => solidCheck(profile, grade, pt, { Lpx: beamLen * 100, Lpy: LpyB, omegaTable }));
      nb = p.beamName ? S.profileByName(p.beamName) : null;
      if (!nb) { const ix = beamList.findIndex((pf) => beamCk(pf).c.ok); nb = beamList[Math.min(beamList.length - 1, ix < 0 ? beamList.length - 1 : ix + (Number(p.bump?.beam) || 0))]; }
    }
    const same = nc.n === col.n && beamKey(nb) === beamKey(beam);
    col = nc;
    beam = nb;
    if (same) break;
  }
  // análisis final con las secciones adoptadas
  const colSelf = col.G * p.H;
  const states = portalStates(g, { ...base, colSelf });
  const sec = { col: { kind: 'solid', profile: col }, beam: isTruss ? beam : { kind: 'solid', profile: beam } };
  res = analyze(g, states, sec, { type: p.type, base: p.base });
  const LpxCol = (Number(p.kx) || 2) * p.H * 100;
  const LpyCol = (Number(p.sGirt) || 1.5) * 100;
  const colW = worstOver((k) => k === 0 || k === 3, res, (pt) => solidCheck(col, grade, pt, { Lpx: LpxCol, Lpy: LpyCol, omegaTable }));
  const beamW = isTruss
    ? worstOver((k) => k === 1 || k === 2, res, (pt) => trussCheck(beam, grade, pt, { omegaTable, lpDiag }))
    : worstOver((k) => k === 1 || k === 2, res, (pt) => solidCheck(beam, grade, pt, { Lpx: beamLen * 100, Lpy: (Number(p.sPurlin) || 1.5) * 100, omegaTable }));
  // envolventes (valores extremos de cada barra en todos los estados)
  const env = g.members.map((m, k) => {
    let Mmax = 0; let Vmax = 0; let Nt = 0; let Nc = 0;
    res.forEach((st) => st.pts[k].forEach((q) => { Mmax = Math.max(Mmax, Math.abs(q.M)); Vmax = Math.max(Vmax, Math.abs(q.V)); Nt = Math.max(Nt, q.N); Nc = Math.max(Nc, -q.N); }));
    return { Mmax, Vmax, Nt, Nc };
  });
  const reactions = res.map((st) => st.reactions);
  const weightCols = 2 * col.G * p.H;
  const weightBeam = 2 * beamLen * (isTruss ? beam.G : beam.G);
  const gravOk = true;
  const selfReal = (weightBeam) / (p.A * p.S);
  // flechas: dintel (cumbrera respecto de la recta entre aleros) con E1 y con las permanentes solas; desplazamiento lateral de los aleros por viento
  const dRes = analyze(g, portalStates(g, { ...base, colSelf, p: 0, wind: null }).slice(0, 1), sec, { type: p.type, base: p.base })[0];
  const sagOf = (r) => -(r.u[3 * 2 + 1] - (r.u[3 * 1 + 1] + r.u[3 * 3 + 1]) / 2);
  const fTotal = sagOf(res[0]);
  const fLive = Math.max(0, fTotal - sagOf(dRes));
  const lim = DEFLECTION_LIMITS[p.deflLimit] || DEFLECTION_LIMITS.industrialRigid;
  const vert = deflectionCheck({ fTotal, fLive, L: g.A, lim });
  let drift = 0;
  res.forEach((st) => { if (st.wind) drift = Math.max(drift, Math.abs(st.u[3 * 1]), Math.abs(st.u[3 * 3])); });
  const driftLim = p.H / DRIFT_LIMIT_INDUSTRIAL;
  const defl = { vert, drift, driftLim, driftOk: drift <= driftLim + 1e-12, ok: vert.ok && drift <= driftLim + 1e-12 };
  return {
    ok: colW.c.ok && beamW.c.ok, grade, geom: g, defl, states: res, col, beam: isTruss ? beam : { kind: 'solid', profile: beam }, isTruss, colCheck: colW, beamCheck: beamW, env, wind, base,
    weights: { cols: weightCols, beam: weightBeam, total: weightCols + weightBeam, selfReal, selfAssumed: base.self }, beamLen, hTruss, lpDiag, iterations, reactions, gravOk,
  };
}

// ---------------------------------------------------------------- nave completa: pórtico + correas + bases
export function designNave(p0) {
  let p = p0;
  let portal = designPortal(p);
  if (p0.autoSelf) {
    for (let k = 0; k < 5; k++) {
      const real = portal.weights.selfReal;
      if (Math.abs(real - p.self) <= 0.05 * Math.max(real, 1)) break;
      p = { ...p, self: real };
      portal = designPortal(p);
    }
    portal.selfAdjusted = true;
  }
  const theta = p.theta;
  // correas: luz = separación entre pórticos; succión máxima normal a la cubierta (de los estados de viento)
  let suction = 0;
  if (portal.wind) {
    portal.wind.lateral.forEach((c) => { suction = Math.max(suction, -c.roofWindward.p, -c.roofLeeward.p); });
    portal.wind.frontal.forEach((c) => { suction = Math.max(suction, -c.roof.p); });
  }
  const purlin = designPurlin({ L: p.S, alpha: theta, s: Number(p.sPurlin) || 1.5, gSurf: (Number(p.gCover) || 0), pHor: portal.base.p, svSurf: suction, types: [p.purlinType || 'C'], name: p.purlinName || null, grade: p.grade, fRatio: 200, pointLoad: 100, K: 4 });
  // bases: carga máxima de compresión de cada columna; levantamiento por viento
  const KG = 9.80665;
  const bases = [0, 1].map((idx) => {
    let Nmax = 0; let Nmin = 0; let Hmax = 0;
    portal.states.forEach((st) => { const r = st.reactions[idx]; Nmax = Math.max(Nmax, r.fy); Nmin = Math.min(Nmin, r.fy); Hmax = Math.max(Hmax, Math.abs(r.fx)); });
    const pf = portal.col;
    // el apoyo sobre el hormigón es la placa base: se supone cuadrada, del tamaño de la columna y hasta 40 cm
    const plate = Math.min(Math.max(pf.h, pf.b || pf.h, 150), 400);
    const hc = plate;
    const bc = plate;
    // permanente y sobrecarga por separado: E1 da la carga de servicio total; la permanente se toma del estado con solo permanentes (aprox.: viento sin succión neta)
    let footing;
    try {
      const RL = Math.min(Nmax, (portal.base.p * p.S * p.A / 2));
      footing = designFooting({ PD: Math.max(0, Nmax - RL) * KG, PL: RL * KG, bc: Math.max(bc, 100), hc: Math.max(hc, 100), fc: Number(p.fc) || 20, fy: 420, sigma: (Number(p.sigmaSoil) || 2) * 0.0980665, gammaSoil: Number(p.gammaSoil) || 17, Df: (Number(p.Df) || 1.5) * 1000, ratio: 1 });
    } catch (e) { footing = { ok: false, reason: 'No se pudo calcular la base.' }; }
    const uplift = -Nmin;
    const weight = footing.ok ? (footing.wSelf + footing.wSoil) / KG : 0;             // kg
    let upliftSide = 0;
    if (uplift > 0 && footing.ok && weight < 1.5 * uplift) {
      const hm = footing.h / 1000;
      const perM2 = hm * 2400 + Math.max(0, (Number(p.Df) || 1.5) - hm) * ((Number(p.gammaSoil) || 17) * 1000 / KG);
      upliftSide = Math.ceil(Math.sqrt(1.5 * uplift / perM2) / 0.05) * 0.05;
    }
    return { idx, Nmax, uplift, H: Hmax, footing, upliftWeight: uplift * 1.5, upliftOk: uplift <= 0 || weight >= 1.5 * uplift, weight, upliftSide };
  });
  return { ...portal, purlin, suction, bases, kind: 'nave' };
}

// Con la verificación de flechas: si el dintel o las columnas no verifican, se pasa a perfiles más pesados (de uno en uno) hasta cumplir los límites de la Tabla L.3-1.
export function designPortal(p) {
  let kb = 0;
  let kc = 0;
  let res = null;
  const max = p.deflAuto === false ? 0 : 40;
  for (let k = 0; k <= max; k++) {
    res = designPortalCore({ ...p, bump: { beam: kb, col: kc } });
    res.bumps = { beam: kb, col: kc };
    if (res.defl.ok) break;
    if (!res.defl.vert.ok) kb += 1;
    if (!res.defl.driftOk) kc += 1;
  }
  return res;
}
