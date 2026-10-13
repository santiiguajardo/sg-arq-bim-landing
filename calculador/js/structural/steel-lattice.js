// Columnas reticuladas de acero: dos cordones unidos por diagonales (en zigzag) en un plano, o cuatro cordones con diagonales en las cuatro caras.
// NOTA SOBRE EL MÉTODO: el material de la cátedra (TP 5, apunte "Compresión con pandeo") desarrolla la columna compuesta con PRESILLAS (esbeltez
// ideal λi = √(λy² + (m/2) λ1²), λ1 = s/i1 ≤ 50, corte ideal Q = ω N / 80). Para la columna con CELOSÍA se usa la misma estructura de verificación,
// pero la influencia de la deformación por corte de las diagonales NO está en los apuntes: se deduce con el criterio de Engesser (pandeo con
// flexibilidad al corte): 1/Pcr = 1/PE + 1/S, de modo que λi² = λy² + π² E A / S, con la rigidez al corte de las diagonales
// S = n E Ad sen²α cos α (α = ángulo de la diagonal con el eje de la columna, n = planos de diagonales que toman el corte).
// No se transcribió de un reglamento: conviene contrastarlo con el CIRSOC 301 antes de usarlo en obra.
// Unidades: kg, cm (longitudes de las secciones y de pandeo), kg/cm².
import * as S from './steel.js';

const rad = (d) => d * Math.PI / 180;
export const CHORD_TYPES = { L: 'Ángulos', UPN: 'Perfiles U (UPN)', IPN: 'Doble T normal (IPN)', 'CAÑO': 'Caños circulares', TC: 'Tubos cuadrados' };
export const DIAG_TYPES = { L: 'Ángulo', BARRA: 'Barra redonda', 'CAÑO': 'Caño circular' };
const BAR_SIZES = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32];
const diagList = (type) => (type === 'BARRA'
  ? BAR_SIZES.map((d) => { const A = Math.PI * (d / 10) ** 2 / 4; const i = d / 40; return { t: 'BARRA', n: `Barra ø${d} mm`, A, G: A * 0.785, ix: i, iy: i, imin: i }; })
  : S.profileList([type]));

// p: { N (kg), H (m), support, kind: 2 | 4, chordType, e (cm, distancia entre ejes de cordones), e2 (cm, solo 4 cordones), alpha (°), diagType, lpD (factor de la longitud de pandeo de las diagonales),
//      grade, omegaTable, chordName, diagName }
export function designLatticeColumn(p) {
  const grade = S.GRADES[p.grade] || S.GRADES['F-22'];
  const sup = S.SUPPORTS_BUCKLING[p.support] || S.SUPPORTS_BUCKLING['art-art'];
  const m = p.kind === 4 ? 4 : 2;
  const nPl = m === 4 ? 2 : 1;                                   // planos de diagonales que toman el corte en cada dirección
  const e = Number(p.e);
  const e2 = m === 4 ? (Number(p.e2) || e) : 0;
  const alpha = Number(p.alpha);
  const sa = Math.sin(rad(alpha));
  const ca = Math.cos(rad(alpha));
  const Lp = sup.k * Number(p.H) * 100;
  const table = p.omegaTable === 'St37' ? 'St37' : grade.omega;
  const lpD = Number(p.lpD) || 1;
  const eMax = Math.max(e, e2);
  const pitch = 2 * eMax * ca / sa;                              // distancia entre nudos de un mismo cordón (diagonales en zigzag): 2 e cotg α
  const nSp = Math.max(1, Math.ceil(Number(p.H) * 100 / pitch));
  const res = { grade, sup, m, nPl, e, e2, alpha, Lp, pitch, table, N0: Number(p.N), warnings: [] };
  if (!(e > 0) || !(alpha > 0 && alpha < 90)) return { ...res, ok: false, reason: 'Completá la distancia entre cordones y el ángulo de las diagonales.' };
  if (alpha < 40 || alpha > 70) res.warnings.push('El ángulo de las diagonales con el eje está fuera del rango usual (40° a 70°).');
  const chords = S.profileList([p.chordType]).sort((a, b) => a.G - b.G);
  const diags = diagList(p.diagType || 'L').sort((a, b) => a.G - b.G);
  const evalChord = (pc) => {
    const A1 = pc.A;
    const A = m * A1;
    const Nt = Number(p.N) + (m * pc.G) * Number(p.H);                      // peso propio de los cordones
    const i1 = pc.i1 ?? pc.imin ?? Math.min(pc.ix, pc.iy);
    // ejes: x–x (material, solo con 2 cordones) y los inmateriales con la flexibilidad al corte de las diagonales
    const Iown = pc.Iy ?? pc.Ix;
    const ixSect = Math.sqrt(m === 2 ? pc.Ix / pc.A : (m * (pc.Ix + A1 * (e2 / 2) ** 2)) / A);
    const iySect = Math.sqrt((m * (Iown + A1 * (e / 2) ** 2)) / A);
    const lamX = Lp / ixSect;
    const lamY = Lp / iySect;
    // el diagonal se elige después: la rigidez al corte depende de su área. Se prueba cada diagonal de menor a mayor peso.
    const tryDiag = (pd) => {
      const Ad = pd.A;
      const lamD2 = Math.PI ** 2 * A / (nPl * Ad * sa * sa * ca);
      const lamIy = Math.sqrt(lamY ** 2 + lamD2);
      const lamIx = m === 4 ? Math.sqrt(lamX ** 2 + lamD2) : lamX;
      const lam1 = pitch / i1;
      const omX = S.omegaOf(lamIx, table);
      const omY = S.omegaOf(lamIy, table);
      const om1 = S.omegaOf(lam1, table);
      if (omX === null || omY === null || om1 === null) return { ok: false, reason: 'La esbeltez supera la de la tabla (λ ≥ 250).', pd };
      const sA = S.sigmaAllow(pc, grade);
      const om = Math.max(omX, omY);
      const sigma = om * Nt / A;
      const sig1 = om1 * Nt / A;
      const Q = om * Nt / 80;                                                // corte ideal (TP 5)
      const D = Q / (nPl * sa);                                              // esfuerzo en la diagonal
      const ldMax = eMax / sa;
      const lamDg = (ldMax * lpD) / (pd.imin ?? Math.min(pd.ix, pd.iy));
      const omD = S.omegaOf(lamDg, table);
      const sigD = omD === null ? Infinity : omD * D / Ad;
      const lam1Ok = lam1 <= 50 + 1e-9;
      const ok = sigma <= sA + 1e-9 && sig1 <= sA + 1e-9 && sigD <= S.sigmaAllow(pd, grade) + 1e-9 && lam1Ok;
      return { ok, pd, lamX, lamY, lamD: Math.sqrt(lamD2), lamIx, lamIy, omX, omY, om, lam1, om1, sigma, sig1, sigAllow: sA, Q, D, lamDg, omD, sigD, sigDAllow: S.sigmaAllow(pd, grade), lam1Ok, ixSect, iySect, A, Nt, Ad };
    };
    const wanted = p.diagName ? diags.find((d) => d.n === p.diagName) : null;
    let chosen = null;
    if (wanted) chosen = tryDiag(wanted);
    else {
      for (const pd of diags) { const r = tryDiag(pd); if (r.ok) { chosen = r; break; } }
      if (!chosen) chosen = tryDiag(diags[diags.length - 1]);
    }
    return { pc, ...chosen };
  };
  let out = null;
  const wantedC = p.chordName ? chords.find((c) => c.n === p.chordName) : null;
  if (wantedC) out = evalChord(wantedC);
  else {
    for (const pc of chords) { const r = evalChord(pc); if (r.ok) { out = r; break; } }
    if (!out) out = evalChord(chords[chords.length - 1]);
  }
  // peso por metro y cómputo
  const pd = out.pd;
  const ld = eMax / sa;                                                       // largo de cada diagonal (cm)
  const faces = m === 4 ? 4 : 1;                                           // caras con diagonales
  const diagCount = faces * nSp * 2;                                         // en zigzag hay dos diagonales por cada paso
  const wChords = m * out.pc.G * Number(p.H);
  const wDiag = diagCount * (ld / 100) * pd.G;
  return { ...res, ...out, chordProfile: out.pc, diag: pd, nSp, ld, diagCount, weight: wChords + wDiag, wChords, wDiag, Apre: Number(p.N) / (grade.sadm / 2), chordsList: chords, diagsList: diags };
}
