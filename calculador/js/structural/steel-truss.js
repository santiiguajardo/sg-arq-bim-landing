// Cerchas y cabriadas de acero (estructuras planas de barras articuladas, cargas en los nudos). Método de los nudos resuelto con la matriz de
// rigidez de la armadura (EA constante: en una cercha isostática los esfuerzos no dependen de EA). Dimensionado con el método elástico y el
// coeficiente ω de la cátedra (apuntes "Cerchas metálicas" 1ª y 2ª parte, "Cabriada nave industrial con viento", "Vigas reticuladas").
// Unidades: m para la geometría, kg para las fuerzas, cm y kg/cm² para las secciones. Tracción positiva.
import * as S from './steel.js';
import { deflectionCheck, DEFLECTION_LIMITS } from './steel-joints.js';

// ---------------------------------------------------------------- solución estática
export function solveTruss({ nodes, bars, supports, loads }) {
  const n = nodes.length;
  const nd = 2 * n;
  const K = Array.from({ length: nd }, () => new Float64Array(nd));
  const geo = bars.map((b) => {
    const A = nodes[b.a];
    const B = nodes[b.b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-9)) throw new Error('Hay una barra de longitud cero.');
    return { c: dx / L, s: dy / L, L };
  });
  bars.forEach((b, k) => {
    const { c, s, L } = geo[k];
    const idx = [2 * b.a, 2 * b.a + 1, 2 * b.b, 2 * b.b + 1];
    const m = [[c * c, c * s, -c * c, -c * s], [c * s, s * s, -c * s, -s * s], [-c * c, -c * s, c * c, c * s], [-c * s, -s * s, c * s, s * s]];
    const ea = bars[k].EA || 1;                                    // rigidez axial real (kg) si se la informa; con EA = 1 los esfuerzos de una cercha isostática no cambian
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[idx[i]][idx[j]] += ea * m[i][j] / L;
  });
  const fixed = new Set();
  supports.forEach((sp) => { if (sp.ux) fixed.add(2 * sp.node); if (sp.uy) fixed.add(2 * sp.node + 1); });
  const F = new Float64Array(nd);
  loads.forEach((l) => { F[2 * l.node] += l.fx || 0; F[2 * l.node + 1] += l.fy || 0; });
  const free = [];
  for (let i = 0; i < nd; i++) if (!fixed.has(i)) free.push(i);
  const m = free.length;
  const A = free.map((i) => free.map((j) => K[i][j]));
  const b = free.map((i) => F[i]);
  // eliminación gaussiana con pivoteo parcial
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) throw new Error('La cercha es un mecanismo (inestable): revisá las barras y los apoyos.');
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
    for (let r = c + 1; r < m; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let sum = b[r];
    for (let k = r + 1; k < m; k++) sum -= A[r][k] * x[k];
    x[r] = sum / A[r][r];
  }
  const u = new Float64Array(nd);
  free.forEach((d, i) => { u[d] = x[i]; });
  const N = bars.map((bb, k) => {
    const { c, s, L } = geo[k];
    return (bb.EA || 1) * ((u[2 * bb.b] - u[2 * bb.a]) * c + (u[2 * bb.b + 1] - u[2 * bb.a + 1]) * s) / L;
  });
  const reactions = [];
  supports.forEach((sp) => {
    let rx = 0;
    let ry = 0;
    if (sp.ux) { for (let j = 0; j < nd; j++) rx += K[2 * sp.node][j] * u[j]; rx -= F[2 * sp.node]; }
    if (sp.uy) { for (let j = 0; j < nd; j++) ry += K[2 * sp.node + 1][j] * u[j]; ry -= F[2 * sp.node + 1]; }
    reactions.push({ node: sp.node, rx, ry });
  });
  const restraints = supports.reduce((a, sp) => a + (sp.ux ? 1 : 0) + (sp.uy ? 1 : 0), 0);
  return { N, reactions, u: Array.from(u), lengths: geo.map((g) => g.L), isostatic: bars.length + restraints === nd, degree: bars.length + restraints - nd };
}

// ---------------------------------------------------------------- generadores de geometría
export const FAMILIES = { CS: 'Cordón superior', CI: 'Cordón inferior', M: 'Montantes', D: 'Diagonales' };
const addBar = (bars, a, b, fam) => bars.push({ a, b, fam });
const pin = (node) => ({ node, ux: true, uy: true });
const roller = (node) => ({ node, ux: false, uy: true });

// Cabriada a dos aguas con cordón inferior horizontal: n paneles por faldón (apuntes "Cerchas metálicas" y "Cabriada nave industrial").
// Los nudos superiores intermedios están sobre cada panel; el cordón superior arranca en el apoyo. diag: 'up' (las diagonales suben hacia el
// centro, como en el ejemplo de la nave) o 'down' (bajan hacia el centro).
export function gableTruss({ L, f, n, diag = 'up' }) {
  const N2 = 2 * n;
  const a = L / N2;
  const nodes = [];
  for (let i = 0; i <= N2; i++) nodes.push({ x: i * a, y: 0, chord: 'B' });          // 0 … 2n
  const T = {};
  for (let i = 1; i < N2; i++) {
    const x = i * a;
    nodes.push({ x, y: f * (1 - Math.abs(x - L / 2) / (L / 2)), chord: 'T' });
    T[i] = nodes.length - 1;
  }
  const topOf = (i) => (i === 0 ? 0 : i === N2 ? N2 : T[i]);
  const bars = [];
  for (let i = 0; i < N2; i++) addBar(bars, i, i + 1, 'CI');
  for (let i = 0; i < N2; i++) addBar(bars, topOf(i), topOf(i + 1), 'CS');
  for (let i = 1; i < N2; i++) addBar(bars, i, T[i], 'M');
  for (let i = 1; i < n; i++) {
    if (diag === 'up') { addBar(bars, i, T[i + 1], 'D'); addBar(bars, N2 - i, T[N2 - i - 1], 'D'); }
    else { addBar(bars, T[i], i + 1, 'D'); addBar(bars, T[N2 - i], N2 - i - 1, 'D'); }
  }
  return { nodes, bars, supports: [pin(0), roller(N2)], loadNodes: Array.from({ length: N2 + 1 }, (_, i) => topOf(i)), L, alpha: Math.atan(f / (L / 2)), kind: 'gable' };
}

// Cercha o viga reticulada de cordones paralelos. kind: 'pratt' | 'howe' (con montantes, n paneles) o 'warren' (sin montantes, n tramos de
// cordón inferior y los nudos superiores en el centro de cada tramo). El cordón cargado puede ser el superior o el inferior.
export function parallelTruss({ L, h, n, kind = 'pratt', loadChord = 'top' }) {
  const nodes = [];
  const bars = [];
  if (kind === 'warren') {
    const s = L / n;
    for (let i = 0; i <= n; i++) nodes.push({ x: i * s, y: 0, chord: 'B' });
    for (let i = 0; i < n; i++) nodes.push({ x: (i + 0.5) * s, y: h, chord: 'T' });
    for (let i = 0; i < n; i++) addBar(bars, i, i + 1, 'CI');
    for (let i = 0; i < n - 1; i++) addBar(bars, n + 1 + i, n + 2 + i, 'CS');
    for (let i = 0; i < n; i++) { addBar(bars, i, n + 1 + i, 'D'); addBar(bars, n + 1 + i, i + 1, 'D'); }
    const top = Array.from({ length: n }, (_, i) => n + 1 + i);
    const loadNodes = loadChord === 'top' ? top : Array.from({ length: n + 1 }, (_, i) => i);
    return { nodes, bars, supports: [pin(0), roller(n)], loadNodes, L, alpha: Math.atan(h / (s / 2)), kind: 'parallel' };
  }
  const a = L / n;
  for (let i = 0; i <= n; i++) nodes.push({ x: i * a, y: 0, chord: 'B' });       // 0 … n
  for (let i = 0; i <= n; i++) nodes.push({ x: i * a, y: h, chord: 'T' });       // n+1 … 2n+1
  const top = (i) => n + 1 + i;
  for (let i = 0; i < n; i++) addBar(bars, i, i + 1, 'CI');
  for (let i = 0; i < n; i++) addBar(bars, top(i), top(i + 1), 'CS');
  for (let i = 0; i <= n; i++) addBar(bars, i, top(i), 'M');
  for (let i = 0; i < n; i++) {
    const left = (i + 1) <= n / 2 + 1e-9;                         // el panel está en la mitad izquierda
    const towardsCenterDown = kind === 'pratt';                    // Pratt: diagonales que bajan hacia el centro (traccionadas con cargas gravitatorias)
    if (left === towardsCenterDown) addBar(bars, top(i), i + 1, 'D');
    else addBar(bars, i, top(i + 1), 'D');
  }
  const loadNodes = loadChord === 'top' ? Array.from({ length: n + 1 }, (_, i) => top(i)) : Array.from({ length: n + 1 }, (_, i) => i);
  return { nodes, bars, supports: [pin(0), roller(n)], loadNodes, L, alpha: Math.atan(h / (L / n)), kind: 'parallel' };
}

// Ancho de influencia horizontal de cada nudo cargado (de 0 a L, repartiendo por la mitad entre nudos vecinos).
export function tributaries(geom) {
  const idx = geom.loadNodes;
  const xs = idx.map((k) => geom.nodes[k].x);
  return idx.map((k, i) => {
    const u = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
    const v = i === xs.length - 1 ? geom.L : (xs[i] + xs[i + 1]) / 2;
    return { node: k, x: xs[i], u, v, w: v - u };
  });
}

// ---------------------------------------------------------------- estados de carga
// Cabriada de cubierta: g (kg/m² sobre la superficie inclinada), self (peso propio estimado de la cabriada, kg/m² en planta), p (sobrecarga,
// kg/m² en proyección horizontal), w (succión, kg/m² perpendicular a la cubierta), S (separación entre cabriadas, m).
export function roofStates(geom, { S: sep, gSurf, self, p, w, windMode = 'vertical' }) {
  const ca = Math.cos(geom.alpha);
  const sa = Math.sin(geom.alpha);
  const half = geom.L / 2;
  const tr = tributaries(geom);
  const e1 = [];
  const e2 = [];
  tr.forEach((t) => {
    const D = ((gSurf || 0) / ca + (self || 0)) * t.w * sep;
    const Lv = (p || 0) * t.w * sep;
    e1.push({ node: t.node, fx: 0, fy: -(D + Lv) });
    let fx = 0;
    let fy = -D;
    if ((w || 0) > 0) {
      if (windMode === 'full' && sa > 1e-9) {
        const wl = Math.max(0, Math.min(t.v, half) - t.u);
        const wr = Math.max(0, t.v - Math.max(t.u, half));
        const wH = w * sep / ca;                               // fuerza perpendicular por m de proyección horizontal
        fy += wH * ca * (wl + wr);
        fx += wH * sa * (wr - wl);                              // succión: hacia afuera de cada faldón
      } else fy += w * t.w * sep;
    }
    e2.push({ node: t.node, fx, fy });
  });
  return [
    { id: 'E1', label: 'Estado 1: permanentes + sobrecarga', loads: e1 },
    ...((w || 0) > 0 ? [{ id: 'E2', label: windMode === 'full' ? 'Estado 2: permanentes − succión del viento' : 'Estado 2: permanentes − viento (componente vertical)', loads: e2 }] : []),
  ];
}

// Cercha o viga reticulada con carga distribuida por metro de luz: qD (permanente), qL (sobrecarga), qW (succión hacia arriba, opcional).
export function lineStates(geom, { qD, qL, qW = 0, self = 0 }) {
  const tr = tributaries(geom);
  const e1 = tr.map((t) => ({ node: t.node, fx: 0, fy: -((qD + self + qL) * t.w) }));
  const out = [{ id: 'E1', label: 'Estado 1: permanentes + sobrecarga', loads: e1 }];
  if (qW > 0) out.push({ id: 'E2', label: 'Estado 2: permanentes − viento', loads: tr.map((t) => ({ node: t.node, fx: 0, fy: -((qD + self) * t.w) + qW * t.w })) });
  return out;
}

// ---------------------------------------------------------------- secciones de barra
export const BAR_SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32];       // diámetros de barra redonda (mm)
const barProfiles = () => BAR_SIZES.map((d) => {
  const A = Math.PI * (d / 10) ** 2 / 4;
  const i = d / 40;                                                              // radio de giro de un círculo: d / 4
  return { t: 'BARRA', n: `Barra ø${d} mm`, A, G: A * 0.785, ix: i, iy: i, Ix: Math.PI * (d / 10) ** 4 / 64, Iy: Math.PI * (d / 10) ** 4 / 64, imin: i, i1: i };
});
export const SECTION_TYPES = {
  L: { label: 'Un ángulo', mult: 1, list: () => S.profileList(['L']) },
  '2L': { label: 'Dos ángulos con presillas', mult: 2, list: () => S.profileList(['L']), battened: 'L' },
  '2UPN': { label: 'Dos UPN con presillas', mult: 2, list: () => S.profileList(['UPN']), battened: 'UPN' },
  '2IPN': { label: 'Dos IPN con presillas', mult: 2, list: () => S.profileList(['IPN']), battened: 'IPN' },
  CAÑO: { label: 'Caño circular', mult: 1, list: () => S.profileList(['CAÑO']) },
  BARRA: { label: 'Barra redonda', mult: 1, list: barProfiles },
  UPN: { label: 'Un UPN', mult: 1, list: () => S.profileList(['UPN']) },
  IPN: { label: 'Un IPN', mult: 1, list: () => S.profileList(['IPN']) },
  TC: { label: 'Tubo cuadrado', mult: 1, list: () => S.profileList(['TC']) },
  TR: { label: 'Tubo rectangular', mult: 1, list: () => S.profileList(['TR']) },
};

// e: distancia entre los ejes de los dos perfiles de una sección compuesta (cm)
const spacingOf = (kind, profile, sep) => (kind === 'L' ? sep + 2 * profile.ex : kind === 'UPN' ? sep + 2 * profile.ey : sep);

// Verifica un perfil para todas las barras de una familia. bars: [{ T, C, Lp }] (T tracción máxima, C compresión máxima en kg; Lp en cm).
function checkSection(def, profile, bars, ctx) {
  const { grade, omegaTable, sep, plateThickness } = ctx;
  const sA = S.sigmaAllow(profile, grade);
  const per = [];
  let ok = true;
  const mult = def.mult;
  bars.forEach((b) => {
    const out = { sigmaT: b.T / (profile.A * mult), sigmaTOk: b.T / (profile.A * mult) <= sA + 1e-9, comp: null };
    if (b.C > 0) {
      if (def.battened) {
        const e = spacingOf(def.battened, profile, sep);
        const i1 = profile.i1 ?? profile.iy;
        const nSp = Math.max(2, Math.ceil(b.Lp / (50 * i1)));
        const c = S.checkBattenedColumn({ profile, grade, N: b.C, Lp: b.Lp, e, s: b.Lp / nSp, omegaTable, plateThickness });
        out.comp = { ...c, nSp, e, ok: Boolean(c.ok) };
      } else {
        const c = S.checkColumn({ profile, grade, N: b.C, Lp: b.Lp, omegaTable });
        out.comp = { ...c, ok: Boolean(c.ok) };
      }
    }
    out.ok = out.sigmaTOk && (!out.comp || out.comp.ok);
    if (!out.ok) ok = false;
    per.push(out);
  });
  return { ok, per };
}

// Elige para cada familia el perfil más liviano (por peso por metro de la sección completa) que verifica todas sus barras.
function sizeFamily(fam, famBars, def, opts) {
  const mult = def.mult;
  const all = def.list().sort((a, b) => a.G * mult - b.G * mult);
  const ctx = { grade: opts.grade, omegaTable: opts.omegaTable, sep: opts.sep, plateThickness: opts.plateThickness };
  const bars = famBars.map((b) => ({ T: b.T, C: b.C, Lp: b.len * 100 * (opts.lpFactor?.[fam] ?? 1) }));
  let chosen = null;
  const wanted = opts.names?.[fam] ? all.find((p) => p.n === opts.names[fam]) : null;
  if (wanted) chosen = { profile: wanted, ...checkSection(def, wanted, bars, ctx) };
  else {
    for (let i = 0; i < all.length; i++) {
      const r = checkSection(def, all[i], bars, ctx);
      if (r.ok) {
        // bump: perfiles más pesados que el mínimo que verifica (para cumplir la flecha)
        const j2 = Math.min(all.length - 1, i + (Number(opts.bump?.[fam]) || 0));
        chosen = { profile: all[j2], ...(j2 === i ? r : checkSection(def, all[j2], bars, ctx)) };
        break;
      }
    }
    if (!chosen && all.length) chosen = { profile: all[all.length - 1], ...checkSection(def, all[all.length - 1], bars, ctx) };
  }
  return { chosen, candidates: all };
}

// ---------------------------------------------------------------- dimensionado de la cercha
// geom: de gableTruss / parallelTruss o armada a mano; states: de roofStates / lineStates.
// opts: { grade, omegaTable, sections: { CS: '2L', CI: '2L', M: 'L', D: 'L' }, names: { fam: nombre de perfil }, sep (cm entre ángulos o espesor de chapa), plateThickness, lpFactor }
export function analyzeTruss(geom, states) {
  const results = states.map((st) => {
    // st.N: esfuerzos ya calculados (por ejemplo, con la cabriada y las columnas resueltas juntas)
    const r = st.N ? { N: st.N, reactions: st.reactions || [], isostatic: true, degree: 0, lengths: geom.bars.map((b) => Math.hypot(geom.nodes[b.b].x - geom.nodes[b.a].x, geom.nodes[b.b].y - geom.nodes[b.a].y)) }
      : solveTruss({ nodes: geom.nodes, bars: geom.bars, supports: geom.supports, loads: st.loads });
    return { ...st, N: r.N, reactions: r.reactions, isostatic: r.isostatic, degree: r.degree, lengths: r.lengths };
  });
  const lengths = results[0].lengths;
  const bars = geom.bars.map((b, i) => {
    const Ns = results.map((r) => r.N[i]);
    const T = Math.max(0, ...Ns);
    const C = Math.max(0, ...Ns.map((v) => -v));
    return { i, a: b.a, b: b.b, fam: b.fam, len: lengths[i], Ns, T, C, govT: T > 0 ? results[Ns.indexOf(T)].id : null, govC: C > 0 ? results[Ns.indexOf(-C)].id : null };
  });
  return { states: results, bars };
}

export function designTruss(geom, states, opts) {
  const grade = S.GRADES[opts.grade] || S.GRADES['F-22'];
  const { states: results, bars } = analyzeTruss(geom, states);
  const sections = { CS: '2L', CI: '2L', M: 'L', D: 'L', ...(opts.sections || {}) };
  const fams = {};
  const fo = { grade, omegaTable: opts.omegaTable || 'grade', sep: Number(opts.sep) || 0.5, plateThickness: Number(opts.plateThickness) || 0.64, lpFactor: opts.lpFactor, names: opts.names };
  const buildFam = (fam, names) => {
    const fb = bars.filter((b) => b.fam === fam);
    if (!fb.length) return;
    const def = SECTION_TYPES[sections[fam]] || SECTION_TYPES.L;
    const { chosen, candidates } = sizeFamily(fam, fb, def, names ? { ...fo, names: { ...fo.names, ...names } } : fo);
    const Tmax = Math.max(...fb.map((b) => b.T));
    const Cmax = Math.max(...fb.map((b) => b.C));
    const worstC = fb.reduce((a, b) => (b.C > a.C ? b : a), fb[0]);
    fams[fam] = {
      fam, label: FAMILIES[fam], type: sections[fam], def, bars: fb, profile: chosen ? chosen.profile : null, per: chosen ? chosen.per : [], ok: Boolean(chosen && chosen.ok), candidates,
      Tmax, Cmax, worstC,
      // predimensionado del apunte: área con σ = σadm / 2 y ω = 1 en compresión; N / σadm en tracción
      Apre: Math.max(Cmax / (grade.sadm / 2), Tmax / grade.sadm),
      length: fb.reduce((a, b) => a + b.len, 0),
      weight: chosen ? fb.reduce((a, b) => a + b.len * chosen.profile.G * def.mult, 0) : 0,
    };
  };
  Object.keys(FAMILIES).forEach((fam) => buildFam(fam));
  // cordones iguales (práctica del apunte: el cordón inferior igual al superior): se adopta el perfil más pesado de los dos
  if (opts.sameChords && fams.CS && fams.CI && sections.CS === sections.CI && fams.CS.profile && fams.CI.profile) {
    const pick = fams.CS.profile.G >= fams.CI.profile.G ? fams.CS.profile : fams.CI.profile;
    buildFam('CS', { CS: pick.n });
    buildFam('CI', { CI: pick.n });
  }
  const weight = Object.values(fams).reduce((a, f) => a + f.weight, 0);
  const ok = Object.values(fams).every((f) => f.ok);
  return { grade, states: results, bars, families: fams, weight, ok, sections };
}

// Cabriada de cubierta con ajuste del peso propio (opcional): se repite hasta que el peso calculado coincide con el supuesto. Si no verifica la flecha
// (Tabla L.3-1 del CIRSOC 301, por defecto edificio industrial con cubierta rígida) se pasa a perfiles más pesados en los cordones.
function iterateSelf(p, buildStates, area, geom) {
  let self = Number(p.self) || 0;
  let res = null;
  let states = null;
  const iterations = p.autoSelf ? 8 : 1;
  for (let k = 0; k < iterations; k++) {
    states = buildStates(self);
    res = designTruss(geom, states, p);
    const real = res.weight / area;
    res.selfUsed = self;
    res.selfReal = real;
    if (!p.autoSelf || Math.abs(real - self) <= 0.02 * Math.max(real, 1) || real < self && k > 0 && Math.abs(real - self) < 0.5) break;
    self = real;
  }
  return { res, states, self };
}

function withDeflection(p, geom, area, buildStates, buildD, defaultLim) {
  const lim = DEFLECTION_LIMITS[p.deflLimit] || DEFLECTION_LIMITS[defaultLim];
  let out = null;
  let defl = null;
  const maxBump = p.deflAuto === false ? 0 : 30;
  for (let bump = 0; bump <= maxBump; bump++) {
    const pb = { ...p, bump: { CS: bump, CI: bump, D: Math.floor(bump / 3), M: Math.floor(bump / 3) } };
    out = iterateSelf(pb, buildStates, area, geom);
    defl = trussDeflection(geom, out.res, out.states[0].loads, buildD(out.self).loads, lim);
    if (defl.check.ok) { defl.bump = bump; break; }
    defl.bump = bump;
  }
  return { ...out.res, defl, deflLimit: lim };
}

export function designRoofTruss(p) {
  const geom = gableTruss({ L: p.L, f: p.f, n: p.n, diag: p.diag });
  const sp = (self, extra = {}) => roofStates(geom, { S: p.S, gSurf: p.gSurf, self, p: p.p, w: p.w, windMode: p.windMode, ...extra });
  const r = withDeflection(p, geom, p.L * p.S, (self) => sp(self), (self) => sp(self, { p: 0, w: 0 })[0], 'industrialRigid');
  return { ...r, geom, kind: 'roof', area: p.L * p.S };
}

export function designLineTruss(p) {
  const geom = parallelTruss({ L: p.L, h: p.h, n: p.n, kind: p.kind, loadChord: p.loadChord });
  const ls = (self, extra = {}) => lineStates(geom, { qD: p.qD, qL: p.qL, qW: p.qW, self, ...extra });
  const r = withDeflection(p, geom, p.L, (self) => ls(self), (self) => ls(self, { qL: 0, qW: 0 })[0], 'course');
  return { ...r, geom, kind: 'line', area: p.L };
}

// Cercha armada nudo por nudo. input: { nodes: [{x, y}], bars: [{a, b, fam}], supports: [{node, type: 'pin' | 'roller'}], loads: [{node, D, L, W}] } (kg)
export function designCustomTruss(p) {
  const geom = { nodes: p.nodes, bars: p.bars, supports: p.supports.map((s) => (s.type === 'roller' ? roller(s.node) : pin(s.node))), loadNodes: p.loads.map((l) => l.node), L: Math.max(...p.nodes.map((n) => n.x)) - Math.min(...p.nodes.map((n) => n.x)), alpha: 0, kind: 'custom' };
  const mk = () => {
    const e1 = p.loads.map((l) => ({ node: l.node, fx: 0, fy: -((l.D || 0) + (l.L || 0)) }));
    const st = [{ id: 'E1', label: 'Estado 1: permanentes + sobrecarga', loads: e1 }];
    if (p.loads.some((l) => (l.W || 0) > 0)) st.push({ id: 'E2', label: 'Estado 2: permanentes − viento', loads: p.loads.map((l) => ({ node: l.node, fx: 0, fy: -(l.D || 0) + (l.W || 0) })) });
    return st;
  };
  const dOnly = () => ({ id: 'D', loads: p.loads.map((l) => ({ node: l.node, fx: 0, fy: -(l.D || 0) })) });
  const r = withDeflection({ ...p, autoSelf: false }, geom, 1, () => mk(), () => dOnly(), 'course');
  return { ...r, geom, kind: 'custom', area: 0 };
}

// ---------------------------------------------------------------- flecha de la cercha (trabajo de las barras con su rigidez real) y comparación con el límite
// geom: geometría; res: resultado de designTruss (con las secciones adoptadas); statesE1 / statesD: estados con cargas (E1 = permanentes + sobrecarga, D = permanentes)
export function trussDeflection(geom, res, loadsE1, loadsD, lim) {
  const bars = geom.bars.map((b) => {
    const f = res.families[b.fam];
    const A = f && f.profile ? f.profile.A * f.def.mult : 10;
    return { ...b, EA: S.E_STEEL * A };                         // kg (E en kg/cm², A en cm²): con cargas en kg y largos en m los desplazamientos salen en m·(1e-2)… ver factor
  });
  // E = kg/cm², A = cm² → EA en kg; los largos están en m: el desplazamiento resulta en m (kg·m / kg)
  const a = solveTruss({ nodes: geom.nodes, bars, supports: geom.supports, loads: loadsE1 });
  const d = solveTruss({ nodes: geom.nodes, bars, supports: geom.supports, loads: loadsD });
  let kMax = 0;
  let fT = 0;
  geom.nodes.forEach((n, i) => { const v = -a.u[2 * i + 1]; if (v > fT) { fT = v; kMax = i; } });
  const fD = -d.u[2 * kMax + 1];
  const L = geom.L;
  const out = { node: kMax, fTotal: fT, fLive: Math.max(0, fT - fD), L };
  out.check = deflectionCheck({ fTotal: out.fTotal, fLive: out.fLive, L, lim });
  return out;
}
