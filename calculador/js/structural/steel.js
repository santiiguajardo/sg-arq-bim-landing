// Estructuras de acero por el método elástico (tensiones admisibles) con el coeficiente de pandeo ω, tal como se enseña en el material de la
// cátedra (Estructuras III: apuntes "Teoría acero", ejemplos del Ing. Monteros y TP 4, 5 y 7).
// Unidades de este archivo: fuerzas en kg, longitudes de cálculo estático en m, secciones en cm, tensiones en kg/cm², momentos en kg·m
// (se pasan a kg·cm para dimensionar). Es una herramienta de apoyo y no reemplaza la verificación de un profesional matriculado.
import { OMEGA, PROFILES as BASE_PROFILES } from './steel-data.js';
import { ANGLES } from './steel-angles.js';
import { TUBES } from './steel-tubes.js';
import { solveFrame } from './frame.js';

export const E_STEEL = 2100000;            // kg/cm2 (apunte, "Teoría acero")
export const G_STEEL = 810000;             // kg/cm2
export const GAMMA_STEEL = 7850;           // kg/m3

// Tensión admisible = fluencia / 1,6 (apunte). La tensión de corte admisible y las tablas ω salen de TABLAS_DE_COEFICIENTES_DE_PANDEO.pdf.
export const GRADES = {
  'F-22': { label: 'Acero F-22 (fluencia 2200 kg/cm²)', fy: 2200, sadm: 1375, tadm: 884, omega: 'F-22' },
  'F-24': { label: 'Acero F-24 (fluencia 2400 kg/cm²)', fy: 2400, sadm: 1500, tadm: 965, omega: 'F-24' },
  'F-20': { label: 'Acero F-20 (fluencia 2000 kg/cm²)', fy: 2000, sadm: 1250, tadm: 804, omega: 'F-20' },
};
// Perfiles de chapa doblada (PGC): el apunte adopta una tensión de diseño reducida que evita verificar pandeo lateral y abolladura.
export const SIGMA_FORMED = 900;           // kg/cm2 (apunte, correas de chapa plegada, F-22)

export const OMEGA_TABLES = {
  grade: 'Tabla ω del acero elegido (F-20, F-22 o F-24)',
  St37: 'Tabla 3 del apunte (acero St 37), como en los ejemplos del Ing. Monteros',
};

// ---------------------------------------------------------------- perfiles
// Perfiles ángulo de alas iguales (IRAM-IAS U 500-558, CIRSOC 301-EL): Ix = Iy, imin = iv (eje principal de menor inercia) y ex = distancia al baricentro.
const ANGLE_PROFILES = ANGLES.map((a) => ({ t: 'L', n: a.n, h: a.b, b: a.b, tw: a.t, tf: a.t, A: a.A, G: a.G, Ix: a.Ix, Iy: a.Ix, Wx: a.Sx, Wy: a.Sx, ix: a.ix, iy: a.ix, imin: a.iv, i1: a.iv, ex: a.ex }));
// Tubos de acero de sección cuadrada (TC) y rectangular (TR) (IRAM-IAS U 500-218 / U 500-2592, CIRSOC 301-EL): h = H (eje x-x) y b = B en mm.
const TUBE_PROFILES = TUBES.map((t) => ({ t: t.t, n: t.n, h: t.H, b: t.B, tw: t.e, tf: t.e, e: t.e, A: t.A, G: t.G, Ix: t.Ix, Iy: t.Iy, Wx: t.Wx, Wy: t.Wy, ix: t.ix, iy: t.iy }));
const PROFILES = [...BASE_PROFILES, ...ANGLE_PROFILES, ...TUBE_PROFILES];
export const PROFILE_TYPES = {
  L: 'Ángulo de alas iguales', TC: 'Tubo de sección cuadrada', TR: 'Tubo de sección rectangular',
  IPN: 'Doble T normal (IPN)', UPN: 'Perfil U normal (UPN)', IPE: 'Doble T IPE', HEB: 'Doble T ala ancha (HEB)',
  C: 'Costanera C de chapa plegada (PGC)', 'CAÑO': 'Caño circular hueco',
};
export const profilesOf = (type) => PROFILES.filter((p) => p.t === type).sort((a, b) => a.G - b.G);
export const profileByName = (name) => PROFILES.find((p) => p.n === name) || null;
export const profileList = (types) => PROFILES.filter((p) => types.includes(p.t)).sort((a, b) => a.G - b.G);

// ω por esbeltez (el apunte aclara que no hace falta interpolar: se usa el entero más cercano). λ < 20: se toma el valor de 20.
export function omegaOf(lambda, tableKey = 'F-22') {
  const tab = OMEGA[tableKey] || OMEGA['F-22'];
  if (!(lambda >= 0)) return null;
  const l = Math.max(20, Math.round(lambda));
  if (l > 249) return null;
  return tab[l - 20];
}

// Coeficiente de longitud de pandeo (apunte, "Longitud de pandeo").
export const SUPPORTS_BUCKLING = {
  'art-art': { label: 'Articulada en ambos extremos', k: 1 },
  'emp-art': { label: 'Empotrada en la base y articulada arriba', k: 0.7 },
  'emp-emp': { label: 'Empotrada en ambos extremos', k: 0.5 },
  'emp-libre': { label: 'Empotrada en la base y libre arriba', k: 2 },
};

// ---------------------------------------------------------------- viga continua (cargas de servicio)
// spans: [L (m)], cantL / cantR: longitud de los voladizos (m, 0 = sin voladizo), q: [kg/m] por tramo, qCantL / qCantR: kg/m,
// points: [{ span: índice de tramo (-1 = voladizo izquierdo, n = voladizo derecho), x: distancia desde el inicio del tramo (m), P: kg }].
// Devuelve reacciones por apoyo, diagramas de corte y momento (momento positivo = tracciona abajo) y la flecha por doble integración.
export function analyzeBeam({ spans, cantL = 0, cantR = 0, q, qCantL = 0, qCantR = 0, points = [], EI = 1 }) {
  const ns = spans.length;
  // nudos de apoyo y de cargas puntuales
  const segs = [];       // {x0, x1, q, tag}
  const addSeg = (x0, x1, qv, tag) => { if (x1 - x0 > 1e-9) segs.push({ x0, x1, q: qv, tag }); };
  const supportsX = [];
  let x = 0;
  const pts = points.map((p) => {
    let base = 0;
    if (p.span === -1) base = 0; else {
      base = cantL;
      for (let i = 0; i < p.span && i < ns; i++) base += spans[i];
      if (p.span >= ns) base = cantL + spans.reduce((a, b) => a + b, 0);
    }
    return { x: base + p.x, P: p.P };
  });
  x = 0;
  const breakpoints = new Set([0]);
  if (cantL > 0) { addSeg(0, cantL, qCantL, { c: 'L' }); x = cantL; }
  supportsX.push(x);
  breakpoints.add(x);
  spans.forEach((L, i) => { addSeg(x, x + L, q[i], { s: i }); x += L; supportsX.push(x); breakpoints.add(x); });
  if (cantR > 0) { addSeg(x, x + cantR, qCantR, { c: 'R' }); x += cantR; breakpoints.add(x); }
  const total = x;
  pts.forEach((p) => breakpoints.add(Math.min(total, Math.max(0, p.x))));
  const xs = [...breakpoints].sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);
  const nodes = xs.map((xx) => ({ x: xx, y: 0 }));
  const members = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const seg = segs.find((s) => mid >= s.x0 && mid <= s.x1);
    members.push({ i, j: i + 1, E: 1e6, A: 1, I: 1e-2, w: () => (seg ? seg.q : 0) });
  }
  const supNodes = supportsX.map((sx) => xs.findIndex((v) => Math.abs(v - sx) < 1e-9));
  const supports = supNodes.map((nd, k) => ({ node: nd, ux: k === 0, uy: true }));
  const nodalLoads = pts.map((p) => ({ node: xs.findIndex((v) => Math.abs(v - Math.min(total, Math.max(0, p.x))) < 1e-9), fx: 0, fy: -p.P, mz: 0 }));
  const res = solveFrame({ nodes, members, supports, nodalLoads });
  // diagramas a lo largo de toda la viga (muestras por tramo de cálculo)
  const NS = 20;
  const xsAll = [];
  const Vs = [];
  const Ms = [];
  members.forEach((m, k) => {
    const smp = res.members[k].sample(NS);
    smp.forEach((p, idx) => {
      if (k > 0 && idx === 0) return;
      xsAll.push(xs[k] + p.x);
      Vs.push(p.V);
      Ms.push(p.M);
    });
  });
  // reacciones verticales hacia arriba (positivas) en cada apoyo
  const R = res.reactions.map((r) => r.fy);
  // flecha por doble integración de M / EI, con flecha nula en los apoyos
  // (se integra w'' = M / EI con w hacia arriba y se devuelve la flecha hacia abajo y = -w)
  const deflect = (EIv) => {
    const n = xsAll.length;
    const y = new Array(n).fill(0);
    const sIdx = supportsX.map((sx) => xsAll.findIndex((v) => Math.abs(v - sx) < 1e-6));
    const slopeAt = {};
    // tramos entre apoyos consecutivos
    for (let k = 0; k + 1 < sIdx.length; k++) {
      const a = sIdx[k];
      const b = sIdx[k + 1];
      // integrar con pendiente inicial 0 y corregir con una recta
      const th = [0];
      const yy = [0];
      for (let i = a + 1; i <= b; i++) {
        const dx = xsAll[i] - xsAll[i - 1];
        const mAvg = (Ms[i] + Ms[i - 1]) / 2;
        th.push(th[th.length - 1] + mAvg / EIv * dx);
        yy.push(yy[yy.length - 1] + (th[th.length - 2] + th[th.length - 1]) / 2 * dx);
      }
      const Lb = xsAll[b] - xsAll[a];
      const th0 = -yy[yy.length - 1] / Lb;
      for (let i = a; i <= b; i++) y[i] = yy[i - a] + th0 * (xsAll[i] - xsAll[a]);
      slopeAt[a] = th0;
      slopeAt[b] = th[th.length - 1] + th0;
    }
    // voladizos: parten de la pendiente del apoyo adyacente
    if (cantR > 0) {
      const a = sIdx[sIdx.length - 1];
      let th = slopeAt[a] ?? 0;
      let yv = 0;
      for (let i = a + 1; i < n; i++) {
        const dx = xsAll[i] - xsAll[i - 1];
        const mAvg = (Ms[i] + Ms[i - 1]) / 2;
        const th1 = th + mAvg / EIv * dx;
        yv += (th + th1) / 2 * dx;
        th = th1;
        y[i] = yv;
      }
    }
    if (cantL > 0) {
      const a = sIdx[0];
      let th = slopeAt[a] ?? 0;
      let yv = 0;
      for (let i = a - 1; i >= 0; i--) {
        const dx = xsAll[i + 1] - xsAll[i];
        const mAvg = (Ms[i] + Ms[i + 1]) / 2;
        const th1 = th - mAvg / EIv * dx;
        yv += (th + th1) / 2 * (-dx);
        th = th1;
        y[i] = yv;
      }
    }
    return y.map((v) => -v);
  };
  return { xs: xsAll, V: Vs, M: Ms, reactions: R, supportsX, total, cantL, cantR, spans, deflect, Mmax: Math.max(...Ms), Mmin: Math.min(...Ms), Vmax: Math.max(...Vs.map(Math.abs)) };
}

// Envolvente con sobrecarga alternada (cada tramo cargado o no) sobre el estado de cargas permanentes: devuelve el mayor momento
// positivo y negativo, el mayor corte y las reacciones máximas de cada apoyo, con cargas de servicio.
export function envelopeBeam({ spans, cantL, cantR, qD, qL, qDCantL = 0, qLCantL = 0, qDCantR = 0, qLCantR = 0, points = [] }) {
  const ns = spans.length;
  // todos los casos usan la misma lista de puntos (con carga nula los que no actúan) para compartir la grilla de muestras
  const withP = (keep) => points.map((p, k) => ({ ...p, P: keep(p, k) ? p.P : 0 }));
  const zeroQ = qL.map(() => 0);
  const base = analyzeBeam({ spans, cantL, cantR, q: qD, qCantL: qDCantL, qCantR: qDCantR, points: withP((p) => p.kind !== 'L') });
  const cases = [];
  for (let i = 0; i < ns; i++) cases.push(analyzeBeam({ spans, cantL, cantR, q: qL.map((v, k) => (k === i ? v : 0)), points: withP(() => false) }));
  if (cantL > 0) cases.push(analyzeBeam({ spans, cantL, cantR, q: zeroQ, qCantL: qLCantL, points: withP(() => false) }));
  if (cantR > 0) cases.push(analyzeBeam({ spans, cantL, cantR, q: zeroQ, qCantR: qLCantR, points: withP(() => false) }));
  points.forEach((p, k) => { if (p.kind === 'L') cases.push(analyzeBeam({ spans, cantL, cantR, q: zeroQ, points: withP((_, j) => j === k) })); });
  const n = base.xs.length;
  const Mmax = new Array(n).fill(0);
  const Mmin = new Array(n).fill(0);
  const Vmax = new Array(n).fill(0);
  const Vmin = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    let mp = base.M[k];
    let mn = base.M[k];
    let vp = base.V[k];
    let vn = base.V[k];
    cases.forEach((c) => { mp += Math.max(0, c.M[k]); mn += Math.min(0, c.M[k]); vp += Math.max(0, c.V[k]); vn += Math.min(0, c.V[k]); });
    Mmax[k] = mp; Mmin[k] = mn; Vmax[k] = vp; Vmin[k] = vn;
  }
  const nsup = base.reactions.length;
  const Rmax = base.reactions.map((r, i) => r + cases.reduce((s, c) => s + Math.max(0, c.reactions[i]), 0));
  return { xs: base.xs, Mmax, Mmin, Vmax, Vmin, Rmax, supportsX: base.supportsX, total: base.total, base, nsup };
}

// ---------------------------------------------------------------- verificaciones
// Tensión de corte máxima de la sección: Colignon (Q·S / J·t) en perfiles laminados; en perfiles de chapa plegada Q / (h·t) (apunte).
export function shearStress(profile, Q) {
  const p = profile;
  if (p.t === 'C') return Q / ((p.h / 10) * (p.e / 10));                // h·t del alma
  if (p.t === 'CAÑO') return 2 * Q / p.A;                                   // tubo de pared delgada: τmáx ≈ 2 Q / A
  if (p.t === 'TC' || p.t === 'TR') {                                       // tubo de sección cerrada: Colignon con dos almas
    const e = p.e / 10;
    const H = p.h / 10;
    const B = p.b / 10;
    const Sx = B * e * (H - e) / 2 + e * (H / 2 - e) ** 2;
    return Q * Sx / (p.Ix * 2 * e);
  }
  const tw = p.tw / 10;
  const h = p.h / 10;
  const tf = (p.tf || 0) / 10;
  const b = p.b / 10;
  const S = p.t === 'UPN' || p.t === 'IPN' || p.t === 'IPE' || p.t === 'HEB'
    ? b * tf * (h - tf) / 2 + tw * (h / 2 - tf) ** 2 / 2          // momento estático de media sección (ala + media alma)
    : 0;
  return Q * S / (p.Ix * tw);
}

export function sigmaAllow(profile, grade) {
  return profile.t === 'C' ? SIGMA_FORMED : grade.sadm;
}
export function tauAllow(profile, grade) {
  return profile.t === 'C' ? SIGMA_FORMED : grade.tadm;
}

// Flexión simple de una viga con el perfil dado. M en kg·m, Q en kg, flecha en cm.
export function checkBending({ profile, grade, Mmax, Qmax, fmax, fAllow, multiplier = 1 }) {
  const Wx = profile.Wx * multiplier;
  const sigma = Mmax * 100 / Wx;
  const tau = shearStress(multiplier === 2 ? { ...profile, Ix: profile.Ix * 2 } : profile, Qmax / (multiplier === 2 ? 2 : 1));
  const sA = sigmaAllow(profile, grade);
  const tA = tauAllow(profile, grade);
  return {
    sigma, sigmaAllow: sA, sigmaOk: sigma <= sA + 1e-9,
    tau, tauAllow: tA, tauOk: tau <= tA + 1e-9,
    f: fmax, fAllow, fOk: fmax <= fAllow + 1e-9,
    ok: sigma <= sA + 1e-9 && tau <= tA + 1e-9 && fmax <= fAllow + 1e-9,
    util: Math.max(sigma / sA, tau / tA, fmax / fAllow),
  };
}

// ---------------------------------------------------------------- correa en flexión oblicua (techos inclinados, apunte "Correas")
// Solicitaciones de una correa simplemente apoyada de luz L (m) con carga q (kg/m, vertical y por unidad de superficie ya multiplicada por el
// ancho de influencia): la carga se descompone según los ejes del perfil: qy = q cos α (flexión en x) y qx = q sen α (flexión en y).
export function purlinActions({ q, L, alphaDeg }) {
  const a = alphaDeg * Math.PI / 180;
  const M = q * L * L / 8;                       // kg·m
  return { M, Mx: M * Math.cos(a), My: M * Math.sin(a), Q: q * Math.cos(a) * L / 2, qx: q * Math.sin(a), qy: q * Math.cos(a) };
}

export function checkPurlin({ profile, grade, Mx, My, Q, qx, qy, L, fAllowRatio = 200 }) {
  const sA = sigmaAllow(profile, grade);
  const sigma = Math.abs(Mx) * 100 / profile.Wx + Math.abs(My) * 100 / profile.Wy;
  const tau = Q / ((profile.h / 10) * (profile.e / 10));
  const Lcm = L * 100;
  const fx = 5 * (qx / 100) * Lcm ** 4 / (384 * E_STEEL * profile.Iy);
  const fy = 5 * (qy / 100) * Lcm ** 4 / (384 * E_STEEL * profile.Ix);
  const f = Math.hypot(fx, fy);
  const fA = Lcm / fAllowRatio;
  return { sigma, sigmaAllow: sA, sigmaOk: sigma <= sA + 1e-9, tau, tauAllow: sA, tauOk: tau <= sA + 1e-9, fx, fy, f, fAllow: fA, fOk: f <= fA + 1e-9,
    ok: sigma <= sA + 1e-9 && tau <= sA + 1e-9 && f <= fA + 1e-9, util: Math.max(sigma / sA, tau / sA, f / fA) };
}

// ---------------------------------------------------------------- columna simple a compresión (con flexión opcional)
// N kg, Lp cm, M kg·m (flexo-compresión: σ = ω N/A + 0,9 M/W y σ = N/A + M/W, apunte "Flexión compuesta")
export function checkColumn({ profile, grade, N, Lp, M = 0, omegaTable = 'grade', multiplier = 1 }) {
  const A = profile.A * multiplier;
  const imin = profile.imin ?? Math.min(profile.ix, profile.iy);
  const lambda = Lp / imin;
  const table = omegaTable === 'St37' ? 'St37' : grade.omega;
  const omega = omegaOf(lambda, table);
  if (omega === null) return { ok: false, lambda, imin, omega: null, reason: 'La esbeltez supera la de la tabla (λ ≥ 250): elegí un perfil con mayor radio de giro.' };
  const sA = sigmaAllow(profile, grade);
  const sigmaC = omega * N / A;
  const out = { lambda, imin, omega, sigma: sigmaC, sigmaAllow: sA, A };
  if (Math.abs(M) > 1e-9) {
    const Wx = profile.Wx * multiplier;
    const s1 = N / A + M * 100 / Wx;
    const s2 = omega * N / A + 0.9 * M * 100 / Wx;
    out.sigma1 = s1; out.sigma2 = s2;
    out.ok = s1 <= sA + 1e-9 && s2 <= sA + 1e-9;
    out.util = Math.max(s1, s2) / sA;
  } else {
    out.ok = sigmaC <= sA + 1e-9;
    out.util = sigmaC / sA;
  }
  return out;
}

// ---------------------------------------------------------------- columna compuesta por dos perfiles unidos con presillas (TP 5)
// type: 'UPN' | 'IPN' (el eje material x-x es el de cada perfil; el inmaterial y-y pasa entre ellos)
// e: distancia entre los ejes (baricentros) de los dos perfiles (cm); s: separación de las presillas (cm); Lp: longitud de pandeo (cm).
export function checkBattenedColumn({ profile, grade, N, Lp, e, s, omegaTable = 'grade', plateThickness = 0.64 }) {
  const m = 2;
  const F1 = profile.A;
  const F = m * F1;
  const table = omegaTable === 'St37' ? 'St37' : grade.omega;
  const sA = grade.sadm;
  // eje material
  const ix = profile.ix;
  const lamX = Lp / ix;
  const omX = omegaOf(lamX, table);
  // eje inmaterial: Steiner sobre los dos perfiles
  const Jy = 2 * (profile.Iy + F1 * (e / 2) ** 2);
  const iy = Math.sqrt(Jy / F);
  const lamY = Lp / iy;
  // esbeltez local entre presillas (radio de giro mínimo de un perfil: el del eje 1-1)
  const i1 = profile.i1 ?? profile.iy;
  const lam1 = s / i1;
  const lamI = Math.sqrt(lamY ** 2 + (m / 2) * lam1 ** 2);
  const omI = omegaOf(lamI, table);
  const om1 = omegaOf(lam1, table);
  if (omX === null || omI === null || om1 === null) return { ok: false, reason: 'La esbeltez supera la de la tabla: elegí perfiles más grandes o menos esbeltez.' };
  const sigX = omX * N / F;
  const sigI = omI * N / F;
  const sig1 = om1 * N / F;
  // presillas: corte ideal Q = ω N / 80; T = Q s / e (total) y la mitad en cada presilla; M = T/2 e/2
  const Q = omI * N / 80;
  const Ttot = Q * s / e;
  const Tp = Ttot / 2;
  const Mp = Tp * e / 2;
  const Wnec = Mp / sA;
  const hMin = Math.sqrt(6 * Wnec / plateThickness);
  const hP = Math.ceil(hMin);
  const Wp = plateThickness * hP * hP / 6;
  const tauP = 1.5 * Tp / (plateThickness * hP);
  const sigP = Mp / Wp;
  const ok = sigX <= sA + 1e-9 && sigI <= sA + 1e-9 && sig1 <= sA + 1e-9 && lam1 <= 50 + 1e-9;
  return { ok, lamX, omX, sigX, Jy, iy, lamY, lam1, lamI, omI, om1, sigI, sig1, sigAllow: sA, Q, Ttot, Tp, Mp, hP, tauP, sigP, plateThickness, F,
    lam1Ok: lam1 <= 50 + 1e-9, util: Math.max(sigX, sigI, sig1) / sA };
}

// ---------------------------------------------------------------- tensor (barra traccionada)
export function checkTie({ profile, grade, T, L }) {
  const A = profile.A;
  const sigma = T / A;
  const dL = T * (L * 100) / (E_STEEL * A);
  return { sigma, sigmaAllow: grade.sadm, ok: sigma <= grade.sadm + 1e-9, dL, util: sigma / grade.sadm, A };
}
