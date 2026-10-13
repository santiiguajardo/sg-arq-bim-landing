// Diseño de elementos de acero (viga, correa, columna simple y compuesta, tensor) con el método elástico de la cátedra.
// Cada función recibe datos en kg, m y cm (ver steel.js), elige el perfil más liviano de la tabla que verifica y devuelve los resultados.
import * as S from './steel.js';
import { designFooting } from './footing.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const E = S.E_STEEL;

// Sobrecarga de cubierta (CIRSOC 101-1982, art. 4.1.7.1): kg/m2 en proyección horizontal según la inclinación.
// light: cubiertas livianas (CIRSOC 303, hasta 0,5 kN/m2 de peso total); si no, otro tipo de cubierta.
export function roofLiveLoad(alphaDeg, light = true) {
  const a = Number(alphaDeg);
  const rows = light
    ? [[10, 30], [15, 22], [20, 15], [30, 12], [Infinity, 10]]            // 3° ≤ α ≤ 10° → 0,30 kN/m2 …
    : [[3, 100], [10, 45], [15, 33], [20, 23], [30, 18], [Infinity, 15]];  // α ≤ 3° → 1,00 kN/m2 …
  for (const [lim, v] of rows) if (a <= lim + 1e-9) return v;
  return rows[rows.length - 1][1];
}

const gradeOf = (k) => S.GRADES[k] || S.GRADES['F-22'];
const candidatesFor = (types, mult = 1) => S.profileList(types).sort((a, b) => a.G * mult - b.G * mult);

// ---------------------------------------------------------------- viga (continua, simple o con voladizos)
// inp: { spans, cantL, cantR, width, g, p, line, points: [{span, x, P, kind}], pattern: 'all' | 'alt', types, name, double, grade, fRatio }
export function designBeam(inp) {
  const grade = gradeOf(inp.grade);
  const mult = inp.double ? 2 : 1;
  const ns = inp.spans.length;
  const width = Number(inp.width) || 0;
  const qD0 = inp.qDirect ? Number(inp.qDirect.D) || 0 : (Number(inp.g) || 0) * width + (Number(inp.line) || 0);
  const qL0 = inp.qDirect ? Number(inp.qDirect.L) || 0 : (Number(inp.p) || 0) * width;
  const fRatio = Number(inp.fRatio) || 300;
  const points = inp.points || [];
  const res = { grade, mult, qD0, qL0, fRatio };
  const evalProfile = (profile) => {
    const Gp = profile.G * mult;
    const qDv = qD0 + Gp;
    const qTot = inp.spans.map(() => qDv + qL0);
    const total = S.analyzeBeam({ spans: inp.spans, cantL: inp.cantL, cantR: inp.cantR, q: qTot, qCantL: qDv + qL0, qCantR: qDv + qL0, points });
    let Mabs = Math.max(Math.abs(total.Mmax), Math.abs(total.Mmin));
    let Vmax = total.Vmax;
    let Rmax = total.reactions.map((r) => r);
    let env = null;
    if (inp.pattern === 'alt' && qL0 > 0) {
      env = S.envelopeBeam({ spans: inp.spans, cantL: inp.cantL, cantR: inp.cantR, qD: inp.spans.map(() => qDv), qL: inp.spans.map(() => qL0),
        qDCantL: qDv, qLCantL: qL0, qDCantR: qDv, qLCantR: qL0, points: points.map((p) => ({ ...p, kind: p.kind === 'L' ? 'L' : 'D' })) });
      Mabs = Math.max(Math.abs(Math.min(...env.Mmin)), Math.max(...env.Mmax), Mabs);
      Vmax = Math.max(Vmax, ...env.Vmax.map(Math.abs), ...env.Vmin.map(Math.abs));
      Rmax = env.Rmax;
    }
    const EI = E * profile.Ix * mult / 1e4;                       // kg·m2
    const y = total.deflect(EI);
    // flecha máxima por tramo y en voladizos (cm), comparada con L / fRatio
    let worst = { ratio: 0, f: 0, fAllow: 1, where: '' };
    const sx = total.supportsX;
    const regions = [];
    if (inp.cantL > 0) regions.push({ x0: 0, x1: sx[0], L: inp.cantL, label: 'voladizo izquierdo' });
    inp.spans.forEach((L, i) => regions.push({ x0: sx[i], x1: sx[i + 1], L, label: `tramo ${i + 1}` }));
    if (inp.cantR > 0) regions.push({ x0: sx[ns], x1: total.total, L: inp.cantR, label: 'voladizo derecho' });
    regions.forEach((rg) => {
      let f = 0;
      total.xs.forEach((xx, k) => { if (xx >= rg.x0 - 1e-9 && xx <= rg.x1 + 1e-9) f = Math.max(f, Math.abs(y[k]) * 100); });
      const fa = rg.L * 100 / fRatio;
      if (f / fa >= worst.ratio) worst = { ratio: f / fa, f, fAllow: fa, where: rg.label, L: rg.L };
    });
    const chk = S.checkBending({ profile, grade, Mmax: Mabs, Qmax: Vmax, fmax: worst.f, fAllow: worst.fAllow, multiplier: mult });
    // flecha por la sobrecarga sola (Tabla L.3-1 del CIRSOC 301): se verifica si se informa fLiveRatio (L / fLiveRatio)
    if (Number(inp.fLiveRatio) > 0 && qL0 + points.some((q) => q.kind === 'L') > 0) {
      const live = S.analyzeBeam({ spans: inp.spans, cantL: inp.cantL, cantR: inp.cantR, q: inp.spans.map(() => qL0), qCantL: qL0, qCantR: qL0, points: points.filter((q) => q.kind === 'L') });
      const yl = live.deflect(EI);
      let fl = 0;
      let Lref = inp.spans[0];
      regions.forEach((rg) => {
        let f = 0;
        live.xs.forEach((xx, k) => { if (xx >= rg.x0 - 1e-9 && xx <= rg.x1 + 1e-9) f = Math.max(f, Math.abs(yl[k]) * 100); });
        if (f / (rg.L * 100 / inp.fLiveRatio) >= fl / (Lref * 100 / inp.fLiveRatio)) { fl = f; Lref = rg.L; }
      });
      chk.fLive = fl;
      chk.fLiveAllow = Lref * 100 / Number(inp.fLiveRatio);
      chk.fLiveOk = fl <= chk.fLiveAllow + 1e-9;
      chk.ok = chk.ok && chk.fLiveOk;
      chk.util = Math.max(chk.util, fl / chk.fLiveAllow);
    }
    return { profile, Gp, qD: qDv, total, env, Mabs, Vmax, Rmax, y, worst, chk, EI };
  };
  const cands = candidatesFor(inp.types, mult);
  const wanted = inp.name ? S.profileByName(inp.name) : null;
  let chosen = null;
  const tried = [];
  if (wanted) {
    chosen = evalProfile(wanted);
  } else {
    for (const pf of cands) {
      const r = evalProfile(pf);
      tried.push({ name: pf.n, util: r.chk.util, ok: r.chk.ok });
      if (r.chk.ok) { chosen = r; break; }
    }
    if (!chosen && cands.length) chosen = evalProfile(cands[cands.length - 1]);
  }
  if (!chosen) return { ...res, ok: false, reason: 'No hay perfiles del tipo elegido en la tabla.' };
  // predimensionado: módulo resistente necesario con la carga sin el peso propio del perfil + una estimación de 20 kg/m (apunte)
  const base = S.analyzeBeam({ spans: inp.spans, cantL: inp.cantL, cantR: inp.cantR, q: inp.spans.map(() => qD0 + 20 + qL0), qCantL: qD0 + 20 + qL0, qCantR: qD0 + 20 + qL0, points });
  const sAllow = grade.sadm;
  const WnecTotal = Math.max(Math.abs(base.Mmax), Math.abs(base.Mmin)) * 100 / sAllow;
  return { ...res, ...chosen, ok: chosen.chk.ok, tried, Wnec: WnecTotal, WnecEach: WnecTotal / mult, candidates: cands.slice(0, 400) };
}

// ---------------------------------------------------------------- correa en flexión oblicua
// inp: { L, alpha, s, gSurf (kg/m2 sobre la superficie), pHor (kg/m2, proyección horizontal), svSurf (succión, kg/m2 sobre la superficie), types,
//        name, grade, fRatio, pointLoad (kg) }
export function designPurlin(inp) {
  const grade = gradeOf(inp.grade);
  const a = inp.alpha * Math.PI / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const s = Number(inp.s);
  const L = Number(inp.L);
  const gH = (Number(inp.gSurf) || 0) / ca * s;                  // kg/m, en proyección horizontal (vertical)
  const pH = (Number(inp.pHor) || 0) * s;
  const sv = (Number(inp.svSurf) || 0) * s / ca;                 // kg/m perpendicular a la cubierta (hacia arriba)
  const Pc = Number(inp.pointLoad) || 0;
  const res = { gH, pH, sv, alpha: inp.alpha, L, s, grade };
  const states = (Gp) => {
    const gv = gH + Gp;
    return [
      { id: 1, label: 'Estado 1: permanentes + sobrecarga', qn: (gv + pH) * ca, qt: (gv + pH) * sa },
      { id: 2, label: 'Estado 2: permanentes − succión del viento', qn: gv * ca - sv, qt: gv * sa },
    ];
  };
  const evalProfile = (profile) => {
    const out = states(profile.G).map((st) => {
      const M = st.qn * L * L / 8;
      const Mt = st.qt * L * L / 8;
      const Q = Math.abs(st.qn) * L / 2;
      const chk = checkPurlinForces({ profile, grade, Mx: Math.abs(M), My: Math.abs(Mt), Q, qn: Math.abs(st.qn), qt: st.qt, L, fRatio: Number(inp.fRatio) || 200 });
      return { ...st, M, Mt, Q, chk };
    });
    // carga concentrada (apunte: 100 kg en el centro de la luz) con las cargas permanentes
    let conc = null;
    if (Pc > 0) {
      const gv = gH + profile.G;
      const Mx = ((gv * ca) * L * L / 8) + Pc * ca * L / 4;
      const My = ((gv * sa) * L * L / 8) + Pc * sa * L / 4;
      const sigma = Mx * 100 / profile.Wx + My * 100 / profile.Wy;
      conc = { Mx, My, sigma, sigmaAllow: S.sigmaAllow(profile, grade), ok: sigma <= S.sigmaAllow(profile, grade) + 1e-9 };
    }
    const ok = out.every((o) => o.chk.ok) && (!conc || conc.ok);
    return { profile, states: out, conc, ok, util: Math.max(...out.map((o) => o.chk.util), conc ? conc.sigma / conc.sigmaAllow : 0) };
  };
  const cands = candidatesFor(inp.types);
  let chosen = null;
  if (inp.name && S.profileByName(inp.name)) chosen = evalProfile(S.profileByName(inp.name));
  else {
    for (const pf of cands) { const r = evalProfile(pf); if (r.ok) { chosen = r; break; } }
    if (!chosen && cands.length) chosen = evalProfile(cands[cands.length - 1]);
  }
  if (!chosen) return { ...res, ok: false, reason: 'No hay perfiles del tipo elegido en la tabla.' };
  // predimensionado: Wx necesario con la relación K = Wx / Wy supuesta (apunte: K = 3, 4 o 5): Wx = (Mx + K My) / σ
  const st1 = states(8)[0];
  const Mxn = st1.qn * L * L / 8;            // kg·m
  const Myn = st1.qt * L * L / 8;
  const K = Number(inp.K) || 4;
  const Wnec = (Mxn + K * Myn) * 100 / S.SIGMA_FORMED;
  return { ...res, ...chosen, Wnec, K, candidates: cands };
}

function checkPurlinForces({ profile, grade, Mx, My, Q, qn, qt, L, fRatio }) {
  const sA = S.sigmaAllow(profile, grade);
  const sigma = Mx * 100 / profile.Wx + My * 100 / profile.Wy;
  const tau = S.shearStress(profile, Q);
  const tA = S.tauAllow(profile, grade);
  const Lcm = L * 100;
  const fy = 5 * (qn / 100) * Lcm ** 4 / (384 * E * profile.Ix);
  const fx = 5 * (Math.abs(qt) / 100) * Lcm ** 4 / (384 * E * profile.Iy);
  const f = Math.hypot(fx, fy);
  const fA = Lcm / fRatio;
  return { sigma, sigmaAllow: sA, sigmaOk: sigma <= sA + 1e-9, tau, tauAllow: tA, tauOk: tau <= tA + 1e-9, fx, fy, f, fAllow: fA, fOk: f <= fA + 1e-9,
    ok: sigma <= sA + 1e-9 && tau <= tA + 1e-9 && f <= fA + 1e-9, util: Math.max(sigma / sA, tau / tA, f / fA) };
}

// ---------------------------------------------------------------- columna simple
// inp: { N (kg), H (m), support, types, name, grade, omegaTable, M (kg·m) }
export function designColumn(inp) {
  const grade = gradeOf(inp.grade);
  const sup = S.SUPPORTS_BUCKLING[inp.support] || S.SUPPORTS_BUCKLING['art-art'];
  const Lp = sup.k * Number(inp.H) * 100;
  const N = Number(inp.N);
  const M = Number(inp.M) || 0;
  const res = { Lp, k: sup.k, grade, N, supportLabel: sup.label };
  const cands = candidatesFor(inp.types);
  const evalProfile = (profile) => {
    const withSelf = N + profile.G * Number(inp.H);                    // el peso propio de la columna se suma a la carga
    const chk = S.checkColumn({ profile, grade, N: withSelf, Lp, M, omegaTable: inp.omegaTable });
    return { profile, N: withSelf, chk };
  };
  let chosen = null;
  if (inp.name && S.profileByName(inp.name)) chosen = evalProfile(S.profileByName(inp.name));
  else {
    for (const pf of cands) { const r = evalProfile(pf); if (r.chk.ok) { chosen = r; break; } }
    if (!chosen && cands.length) chosen = evalProfile(cands[cands.length - 1]);
  }
  if (!chosen) return { ...res, ok: false, reason: 'No hay perfiles del tipo elegido en la tabla.' };
  // método del apunte, por tanteos: se adopta σ = σadm / 2 y ω = 1 para estimar el área
  const A0 = N / (grade.sadm / 2);
  return { ...res, ...chosen, ok: chosen.chk.ok, A0, candidates: cands };
}

// ---------------------------------------------------------------- columna compuesta con presillas (2 UPN o 2 IPN)
// inp: { N, H, support, type: 'UPN' | 'IPN', sep (cm), name, grade, omegaTable, plateThickness (cm), nSpaces (0 = automático) }
export function designBattened(inp) {
  const grade = gradeOf(inp.grade);
  const sup = S.SUPPORTS_BUCKLING[inp.support] || S.SUPPORTS_BUCKLING['art-art'];
  const H = Number(inp.H) * 100;
  const Lp = sup.k * H;
  const N = Number(inp.N);
  const res = { Lp, k: sup.k, grade, N, H, supportLabel: sup.label };
  const pt = Number(inp.plateThickness) || 0.64;
  const eOf = (p) => (inp.type === 'UPN' ? Number(inp.sep) + 2 * p.ey : Number(inp.sep));
  const evalProfile = (profile) => {
    const e = eOf(profile);
    const Nt = N + 2 * profile.G * Number(inp.H);
    let n = Number(inp.nSpaces) || Math.max(2, Math.ceil(H / (50 * profile.iy)));
    let best = null;
    for (let k = 0; k < 40; k++) {
      const s = H / n;
      const chk = S.checkBattenedColumn({ profile, grade, N: Nt, Lp, e, s, omegaTable: inp.omegaTable, plateThickness: pt });
      best = { chk, s, n, e };
      if (chk.ok || Number(inp.nSpaces)) break;
      n += 1;
    }
    return { profile, N: Nt, ...best };
  };
  const cands = candidatesFor([inp.type]);
  let chosen = null;
  if (inp.name && S.profileByName(inp.name)) chosen = evalProfile(S.profileByName(inp.name));
  else {
    for (const pf of cands) { const r = evalProfile(pf); if (r.chk.ok) { chosen = r; break; } }
    if (!chosen && cands.length) chosen = evalProfile(cands[cands.length - 1]);
  }
  if (!chosen) return { ...res, ok: false, reason: 'No hay perfiles del tipo elegido en la tabla.' };
  return { ...res, ...chosen, ok: chosen.chk.ok, candidates: cands };
}

// ---------------------------------------------------------------- tensor
export const BAR_DIAMETERS = [6, 8, 10, 12, 16, 20, 25];     // Tabla 10 del apunte (barras de acero)
export function designTie(inp) {
  const grade = gradeOf(inp.grade);
  const T = Number(inp.T);
  const L = Number(inp.L);
  const res = { grade, T, L, Anec: T / grade.sadm };
  let cands;
  if (inp.kind === 'barra') {
    cands = BAR_DIAMETERS.map((d) => ({ t: 'BARRA', n: `Barra ø${d} mm`, A: Math.PI * (d / 10) ** 2 / 4, G: Math.PI * (d / 10) ** 2 / 4 * 0.785, D: d }));
  } else cands = S.profileList(['CAÑO']).sort((a, b) => a.A - b.A);
  let chosen = null;
  if (inp.name) chosen = cands.find((c) => c.n === inp.name) || null;
  if (!chosen) chosen = cands.find((c) => c.A >= res.Anec - 1e-9) || cands[cands.length - 1];
  const chk = S.checkTie({ profile: chosen, grade, T, L });
  // anclaje (apunte): el peso del macizo de hormigón debe ser al menos 1,5 T; para una base de 1 m × 1 m y 2200 kg/m3
  const Pbase = 1.5 * T;
  const hBase = Pbase / (2200 * 1 * 1);
  return { ...res, profile: chosen, chk, ok: chk.ok, Pbase, hBase, candidates: cands };
}

// ---------------------------------------------------------------- entrepiso metálico (edificio): correas, vigas continuas, columnas y bases
// inp: { xSpans, cantXL, cantXR, ySpans, cantYB, cantYF, sCorr, g, p, edgeLoad, corrTypes, beamTypes, beamDouble, colTypes, H, support,
//        grade, omegaTable, pattern, unify, existingX: [índices de ejes en x], existingY: [índices de líneas], fc, sigmaSoil (kg/cm2), Df (m), gammaSoil }
export function designFloor(inp) {
  const grade = gradeOf(inp.grade);
  const nx = inp.xSpans.length;
  const ny = inp.ySpans.length;
  const Xtot = inp.xSpans.reduce((a, b) => a + b, 0) + (inp.cantXL || 0) + (inp.cantXR || 0);
  const Ytot = inp.ySpans.reduce((a, b) => a + b, 0) + (inp.cantYB || 0) + (inp.cantYF || 0);
  const warnings = [];
  const sC = Number(inp.sCorr) || 0.6;
  // 1) correa (continua sobre las líneas de vigas, con sus voladizos): D y L por separado
  const corr = designBeam({ spans: inp.ySpans, cantL: inp.cantYB || 0, cantR: inp.cantYF || 0, width: sC, g: inp.g, p: inp.p, types: inp.corrTypes || ['C'], grade: inp.grade, fRatio: inp.fRatio || 300, fLiveRatio: inp.fLiveRatio || 0, pattern: inp.pattern });
  // reacciones de la correa en cada línea (por m de viga) con el peso propio de la correa
  const Gc = corr.profile.G;
  const corrReac = (qq) => S.analyzeBeam({ spans: inp.ySpans, cantL: inp.cantYB || 0, cantR: inp.cantYF || 0, q: inp.ySpans.map(() => qq), qCantL: qq, qCantR: qq }).reactions;
  const rD = corrReac((inp.g || 0) * sC + Gc);
  const rL = corrReac((inp.p || 0) * sC);
  const lineD = rD.map((r, j) => r / sC + ((j === 0 || j === ny) ? Number(inp.edgeLoad) || 0 : 0));
  const lineL = rL.map((r) => r / sC);
  // 2) vigas principales: una por línea, con el mismo perfil si unify
  const beamIn = (j, name) => ({ spans: inp.xSpans, cantL: inp.cantXL || 0, cantR: inp.cantXR || 0, qDirect: { D: lineD[j], L: lineL[j] }, types: inp.beamTypes || ['UPN'],
    double: inp.beamDouble, name, grade: inp.grade, fRatio: inp.fRatio || 300, fLiveRatio: inp.fLiveRatio || 0, pattern: inp.pattern });
  let lines = lineD.map((_, j) => designBeam(beamIn(j, null)));
  if (inp.unify !== false) {
    const heavy = lines.reduce((a, b) => (b.profile.G * b.mult >= a.profile.G * a.mult ? b : a));
    lines = lineD.map((_, j) => designBeam(beamIn(j, heavy.profile.n)));
  }
  // reacciones D y L de cada línea con el perfil adoptado (todas las cargas)
  const lineReac = lines.map((ln, j) => {
    const Gp = ln.profile.G * ln.mult;
    const only = (qq) => S.analyzeBeam({ spans: inp.xSpans, cantL: inp.cantXL || 0, cantR: inp.cantXR || 0, q: inp.xSpans.map(() => qq), qCantL: qq, qCantR: qq }).reactions;
    return { RD: only(lineD[j] + Gp), RL: only(lineL[j]) };
  });
  // 3) apoyos: columnas propias o descarga sobre la estructura existente. Los apoyos de una línea son los ejes 0…nx (los voladizos no tienen apoyo).
  const exX = new Set(inp.existingX || []);
  const exY = new Set(inp.existingY || []);
  const nodes = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const existing = exX.has(i) || exY.has(j);
      const RD = lineReac[j].RD[i] || 0;
      const RL = lineReac[j].RL[i] || 0;
      nodes.push({ i, j, existing, RD, RL, N: RD + RL });
    }
  }
  const own = nodes.filter((n) => !n.existing && n.N > 0);
  let colSel = null;
  const colIn = (N, name) => ({ N, H: inp.H, support: inp.support, types: inp.colTypes || ['CAÑO'], name, grade: inp.grade, omegaTable: inp.omegaTable });
  own.forEach((n) => { n.col = designColumn(colIn(n.N, null)); });
  if (inp.unify !== false && own.length) {
    const heavy = own.reduce((a, b) => (b.col.profile.G >= a.col.profile.G ? b : a));
    colSel = heavy.col.profile.n;
    own.forEach((n) => { n.col = designColumn(colIn(n.N, colSel)); });
  }
  // 4) bases de hormigón armado (CIRSOC 201) para cada columna propia
  const KG = 9.80665;
  own.forEach((n) => {
    const pf = n.col.profile;
    const hc = pf.t === 'CAÑO' ? pf.D : pf.h;
    const bc = pf.t === 'CAÑO' ? pf.D : (pf.b || pf.h);
    try {
      n.footing = designFooting({ PD: n.RD * KG, PL: n.RL * KG, bc: Math.max(bc, 100), hc: Math.max(hc, 100), fc: Number(inp.fc) || 25, fy: 420,
        sigma: (Number(inp.sigmaSoil) || 2) * 0.0980665, gammaSoil: Number(inp.gammaSoil) || 17, Df: (Number(inp.Df) || 1.5) * 1000, ratio: 1 });
    } catch (e) { n.footing = { ok: false, reason: 'No se pudo calcular la base.' }; }
  });
  // 5) cómputo de acero
  const nCorr = Math.floor(Xtot / sC + 1e-9) + 1;
  const kgCorr = nCorr * Ytot * Gc;
  const kgBeams = lines.reduce((s, ln) => s + Xtot * ln.profile.G * ln.mult, 0);
  const kgCols = own.reduce((s, n) => s + inp.H * n.col.profile.G, 0);
  const area = Xtot * Ytot;
  const kgTot = kgCorr + kgBeams + kgCols;
  const existingLoads = nodes.filter((n) => n.existing);
  if (!own.length && existingLoads.length) warnings.push('Todos los apoyos descargan sobre la estructura existente: no hay columnas ni bases propias.');
  const ok = corr.ok && lines.every((l) => l.ok) && own.every((n) => n.col.ok && (!n.footing || n.footing.ok));
  return { ok, grade, Xtot, Ytot, area, corr, nCorr, Gc, lines, lineD, lineL, nodes, own, existingLoads, colSel,
    quantities: { kgCorr, kgBeams, kgCols, kgTot, kgPerM2: kgTot / area }, warnings };
}

export { nf };
