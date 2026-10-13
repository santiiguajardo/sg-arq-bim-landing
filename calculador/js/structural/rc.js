// Motor de cálculo de elementos de hormigón armado según CIRSOC 201-2005 (y CIRSOC 101-2005 para cargas).
// Funciones puras: unidades internas N, mm, MPa (los momentos en N·mm). La vista convierte a kN, m y cm.
// Alcance actual: vigas y losas macizas armadas en una dirección, simplemente apoyadas o en voladizo, con carga
// uniformemente distribuida y armadura simple (sin armadura de compresión).
import { CIRSOC201 as N } from './norms.js';

// Criterio constructivo (no es un requisito del reglamento): no se ofrecen armaduras de losa separadas menos de 10 cm.
export const SLAB_MIN_PRACTICAL_SPACING = 100;

export const barArea = (d) => Math.PI * d * d / 4;
const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const round = (x, step) => Math.round(x / step) * step;
const ceilTo = (x, step) => Math.ceil(x / step - 1e-9) * step;
const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;

// ---------------- estática (carga uniforme w en kN/m, luz L en m) ----------------
export const SUPPORTS = {
  simple: { label: 'Simplemente apoyada' },
  cantilever: { label: 'En voladizo' },
};

export function actions(kind, L, w) {
  if (kind === 'cantilever') return { M: w * L * L / 2, V: w * L, mSign: 'negativo (tracción arriba)', deflCoef: 1 / 8 };
  return { M: w * L * L / 8, V: w * L / 2, mSign: 'positivo (tracción abajo)', deflCoef: 5 / 384 };
}

// ---------------- cargas ----------------
export function selfWeightBeam(b, h) { return b * h / 1e6 * N.gammaRC; }          // kN/m
export function selfWeightSlab(h) { return h / 1000 * N.gammaRC; }                // kN/m2

// art. 9.2.1: para cargas gravitatorias, (9-1) U = 1,4 D y (9-2) U = 1,2 D + 1,6 L
export function combos(D, L) {
  const u1 = 1.4 * D;
  const u2 = 1.2 * D + 1.6 * L;
  return { u1, u2, wu: Math.max(u1, u2), governing: u2 >= u1 ? '1,2 D + 1,6 L (9-2)' : '1,4 D (9-1)' };
}

// ---------------- recubrimiento (art. 7.7.1, Tabla 7.7.1) ----------------
// Devuelve el recubrimiento mínimo a la armadura más exterior (estribo en vigas, barra en losas), en mm.
export function coverFor({ element, placement, exposure, dMain, dStirrup }) {
  const f = N.exposure[exposure]?.factor ?? 1;
  let c;
  if (placement === 'outdoor') {
    c = (element === 'beam' ? dStirrup : dMain) > 16 ? 35 : 30;
  } else if (element === 'slab') {
    c = dMain > 32 ? 30 : 20;
  } else {
    c = 20; // vigas, estribos abiertos o cerrados (la armadura principal queda con recubrimiento >= 20 y >= db)
  }
  return Math.ceil(c * f);
}

// ---------------- flexión (art. 10.2 y 10.3) ----------------
export function phiFromStrain(epsT, fy) {
  const epsCl = N.epsCompressionControlled(fy);
  if (epsT >= N.epsTensionControlled) return N.phiFlexure;
  if (epsT <= epsCl) return N.phiCompression;
  return N.phiCompression + (N.phiFlexure - N.phiCompression) * (epsT - epsCl) / (N.epsTensionControlled - epsCl);
}

// Estado de una sección con armadura As dada: momento resistente de diseño y deformación neta de tracción.
// d: altura útil al baricentro de la armadura traccionada; dt: altura de la capa más traccionada (si hay dos capas,
// la deformación εt se mide en la capa extrema, art. 10.3.4).
export function sectionStrength({ As, b, d, fc, fy, dt }) {
  const beta1 = N.beta1(fc);
  const a = As * fy / (0.85 * fc * b);
  const c = a / beta1;
  const epsT = c > 0 ? N.epsCu * ((dt ?? d) - c) / c : Infinity;
  const phi = phiFromStrain(epsT, fy);
  const Mn = As * fy * (d - a / 2);
  return { a, c, epsT, phi, Mn, phiMn: phi * Mn };
}

// As necesaria para Mu (N·mm). Itera porque phi depende de la deformación. Si la sección no alcanza (o epsT < 0,004,
// art. 10.3.5) devuelve ok = false: haría falta más altura/ancho o armadura de compresión (no implementada).
export function flexureDesign({ Mu, b, d, fc, fy }) {
  if (Mu <= 0) return { ok: true, As: 0, ...sectionStrength({ As: 1e-6, b, d, fc, fy }) };
  const k = fy * fy / (1.7 * fc * b);
  let phi = N.phiFlexure;
  let As = 0;
  for (let i = 0; i < 60; i++) {
    const Mn = Mu / phi;
    const disc = fy * fy * d * d - 4 * k * Mn;
    if (disc < 0) return { ok: false, reason: 'La sección es insuficiente para este momento: aumentá la altura o el ancho.' };
    As = (fy * d - Math.sqrt(disc)) / (2 * k);
    const s = sectionStrength({ As, b, d, fc, fy });
    if (Math.abs(s.phi - phi) < 1e-6) break;
    phi = s.phi;
  }
  const s = sectionStrength({ As, b, d, fc, fy });
  if (s.epsT < N.epsMinFlexure) {
    return { ok: false, As, ...s, reason: `La deformación de tracción (${nf(s.epsT, 4)}) es menor que 0,004 (art. 10.3.5): aumentá la altura.` };
  }
  return { ok: true, As, ...s };
}

// ---------------- vigas T y L (art. 8.10) ----------------
// Ancho efectivo del ala (mm). 'T': losa a ambos lados (art. 8.10.2): ancho total <= l/4 y, a cada lado del alma,
// <= 8 hf y <= 1/2 de la distancia libre a la viga vecina. 'L': losa de un solo lado (art. 8.10.3): sobresaliente
// <= 6 hf, <= 1/12 de la luz y <= 1/2 de la distancia libre a la viga vecina.
export function flangeWidth({ pos, bw, hf, L, sw }) {
  if (pos === 'L') return bw + Math.max(0, Math.min(6 * hf, L / 12, sw / 2));
  const side = Math.max(0, Math.min(8 * hf, sw / 2));
  return Math.min(bw + 2 * side, Math.max(bw, L / 4));
}

// Resistencia de una sección con ala comprimida de ancho bf y espesor hf (bloque rectangular de 0,85 f'c, art. 10.2.7).
// Si el bloque cabe en el ala (a <= hf) se comporta como rectangular de ancho bf.
export function sectionStrengthT({ As, bw, bf, hf, d, fc, fy, dt }) {
  const beta1 = N.beta1(fc);
  const aRect = As * fy / (0.85 * fc * bf);
  if (aRect <= hf || bf <= bw) return { ...sectionStrength({ As, b: bf, d, fc, fy, dt }), tee: false };
  const a = (As * fy - 0.85 * fc * (bf - bw) * hf) / (0.85 * fc * bw);
  const c = a / beta1;
  const epsT = c > 0 ? N.epsCu * ((dt ?? d) - c) / c : Infinity;
  const phi = phiFromStrain(epsT, fy);
  const Mn = 0.85 * fc * (bf - bw) * hf * (d - hf / 2) + 0.85 * fc * bw * a * (d - a / 2);
  return { a, c, epsT, phi, Mn, phiMn: phi * Mn, tee: true };
}

export function flexureDesignT({ Mu, bw, bf, hf, d, fc, fy }) {
  if (Mu <= 0) return { ok: true, As: 0, ...sectionStrengthT({ As: 1e-6, bw, bf, hf, d, fc, fy }) };
  const rect = flexureDesign({ Mu, b: bf, d, fc, fy });
  if (rect.ok && rect.a <= hf) return { ...rect, tee: false };
  if (bf <= bw) return rect;
  let phi = N.phiFlexure;
  let As = 0;
  for (let i = 0; i < 60; i++) {
    const MnW = Mu / phi - 0.85 * fc * (bf - bw) * hf * (d - hf / 2);
    if (MnW <= 0) return rect;
    const disc = d * d - 2 * MnW / (0.85 * fc * bw);
    if (disc < 0) return { ok: false, reason: 'La sección es insuficiente para este momento: aumentá la altura o el ancho.' };
    const a = d - Math.sqrt(disc);
    As = 0.85 * fc * ((bf - bw) * hf + bw * a) / fy;
    const st = sectionStrengthT({ As, bw, bf, hf, d, fc, fy });
    if (Math.abs(st.phi - phi) < 1e-6) break;
    phi = st.phi;
  }
  const st = sectionStrengthT({ As, bw, bf, hf, d, fc, fy });
  if (st.epsT < N.epsMinFlexure) return { ok: false, As, ...st, reason: `La deformación de tracción (${nf(st.epsT, 4)}) es menor que 0,004 (art. 10.3.5): aumentá la altura.` };
  return { ok: true, As, ...st };
}

// Armadura mínima de vigas (art. 10.5.1, ec. 10-3) y excepción del art. 10.5.3 (1/3 más que la calculada).
export function asMinBeam({ b, d, fc, fy }) {
  return Math.max(Math.sqrt(fc) / (4 * fy), 1.4 / fy) * b * d;
}
export function asRequiredBeam(AsCalc, asMin) {
  return AsCalc >= asMin ? AsCalc : Math.min(asMin, AsCalc * 4 / 3);
}
// Armadura mínima de losas (art. 10.5.4 y 7.12.2.1 (a)), sobre la sección bruta.
export function asMinSlab({ b, h }) { return N.slabMinRatio * b * h; }

// Predimensionado por flexión: altura útil mínima para que la sección quede controlada por tracción (epsT >= 0,005).
export function dMinFlexure({ Mu, b, fc, fy }) {
  const beta1 = N.beta1(fc);
  const cOverD = N.epsCu / (N.epsCu + N.epsTensionControlled);
  const rho = 0.85 * fc * beta1 * cOverD / fy;
  const Rn = rho * fy * (1 - rho * fy / (1.7 * fc));
  return Math.sqrt(Mu / (N.phiFlexure * Rn * b));
}

// ---------------- disposición de barras ----------------
export function minClearSpacingBeam(db, dagg) { return Math.max(db, 25, 1.33 * dagg); } // art. 7.6.1

// ---------------- corte (art. 11) ----------------
export function shearDesign({ Vu, b, d, h, fc, fyt, dStirrup, legs = 2 }) {
  const sqrtFc = Math.min(Math.sqrt(fc), N.maxSqrtFcShear);
  const Vc = sqrtFc / 6 * b * d;
  const phi = N.phiShear;
  const out = { Vc, phiVc: phi * Vc, Vu };
  const Vsmax = 2 / 3 * sqrtFc * b * d;
  const Av = legs * barArea(dStirrup);
  out.Av = Av;
  out.Vsmax = Vsmax;
  out.minRequired = Vu > 0.5 * phi * Vc && h > 250; // art. 11.5.6.1 (excepciones: losas, y vigas con h <= 250 mm)
  if (Vu <= phi * Vc && !out.minRequired) {
    return { ...out, ok: true, stirrups: false, note: 'Alcanza con el corte que resiste el hormigón: no se requiere armadura de corte por cálculo.' };
  }
  const VsReq = Math.max(0, Vu / phi - Vc);
  out.VsReq = VsReq;
  if (VsReq > Vsmax) return { ...out, ok: false, reason: 'El corte supera el máximo admisible (Vs > 2/3 √f\'c bw d, art. 11.5.7.9): aumentá la sección.' };
  const sReq = VsReq > 0 ? Av * fyt * d / VsReq : Infinity;
  let sMax = Math.min(d / 2, 400);                         // art. 11.5.5.1
  if (VsReq > sqrtFc / 3 * b * d) sMax /= 2;               // art. 11.5.5.3
  const AvOverSMin = Math.max(sqrtFc / 16 * b / fyt, 0.33 * b / fyt); // ec. (11-13)
  const sAvMin = Av / AvOverSMin;
  const s = floorTo(Math.min(sReq, sMax, sAvMin), 10);
  out.sReq = sReq; out.sMax = sMax; out.sAvMin = sAvMin;
  if (s < 50) return { ...out, ok: false, reason: 'La separación de estribos resultante es menor que 50 mm: usá un diámetro mayor o aumentá la sección.' };
  const Vs = Av * fyt * d / s;
  return {
    ...out, ok: true, stirrups: true, s, Vs, phiVn: phi * (Vc + Vs),
    governs: s === floorTo(sReq, 10) ? 'resistencia' : (s === floorTo(sMax, 10) ? 'separación máxima' : 'armadura mínima'),
  };
}

// ---------------- flechas (art. 9.5.2) ----------------
export function crackedInertia({ As, b, d, fc }) {
  const n = N.Es / N.Ec(fc);
  const kd = (-n * As + Math.sqrt((n * As) ** 2 + 2 * b * n * As * d)) / b;
  return b * kd ** 3 / 3 + n * As * (d - kd) ** 2;
}

// Sección con ala: bw, h, bf, hf; flangeTop = ala en la cara superior. Da la inercia bruta y la posición del baricentro
// (desde la cara superior). La inercia fisurada incluye el ala solo si está del lado comprimido.
export function teeProps({ bw, h, bf, hf, flangeTop }) {
  const A1 = bf * hf;
  const A2 = bw * Math.max(0, h - hf);
  const yFlange = flangeTop ? hf / 2 : h - hf / 2;
  const yWeb = flangeTop ? hf + (h - hf) / 2 : (h - hf) / 2;
  const yc = (A1 * yFlange + A2 * yWeb) / (A1 + A2);
  const Ig = bf * hf ** 3 / 12 + A1 * (yFlange - yc) ** 2 + bw * (h - hf) ** 3 / 12 + A2 * (yWeb - yc) ** 2;
  return { yc, Ig };
}
export function crackedInertiaTee({ As, bw, bf, hf, d, fc, flangeComp }) {
  const n = N.Es / N.Ec(fc);
  if (!flangeComp || bf <= bw) return crackedInertia({ As, b: bw, d, fc });
  let kd = (-n * As + Math.sqrt((n * As) ** 2 + 2 * bf * n * As * d)) / bf;
  if (kd <= hf) return bf * kd ** 3 / 3 + n * As * (d - kd) ** 2;
  const qa = bw / 2;
  const qb = (bf - bw) * hf + n * As;
  const qc = -(bf - bw) * hf * hf / 2 - n * As * d;
  kd = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  return bf * kd ** 3 / 3 - (bf - bw) * (kd - hf) ** 3 / 3 + n * As * (d - kd) ** 2;
}

// Inercia efectiva (9-8), con Mcr (9-9) y fr = 0,625 √f'c (9-10).
export function effectiveInertia({ Ma, b, h, d, As, fc, sec = null }) {
  let Ig = b * h ** 3 / 12;
  let yt = h / 2;
  let Icr;
  if (sec) {
    const tp = teeProps({ bw: b, h, bf: sec.bf, hf: sec.hf, flangeTop: sec.flangeTop });
    Ig = tp.Ig;
    yt = sec.tensionBottom ? h - tp.yc : tp.yc;
    Icr = crackedInertiaTee({ As, bw: b, bf: sec.bf, hf: sec.hf, d, fc, flangeComp: sec.flangeComp });
  } else Icr = crackedInertia({ As, b, d, fc });
  const fr = 0.625 * Math.sqrt(fc);
  const Mcr = fr * Ig / yt;
  if (Ma <= Mcr) return { Ie: Ig, Ig, Icr, Mcr };
  const r = (Mcr / Ma) ** 3;
  return { Ie: Math.min(Ig, r * Ig + (1 - r) * Icr), Ig, Icr, Mcr };
}

// Flechas: instantánea por D, por D+L, por L (resta), y diferida (9-11) con ρ' = 0.
export function deflections({ kind, L, wD, wL, b, h, d, As, fc, xi, sec = null }) {
  const Ec = N.Ec(fc);
  const Lmm = L * 1000;
  const coef = actions(kind, L, 1).deflCoef;
  const moment = (w) => actions(kind, L, w).M * 1e6;                 // N·mm
  const delta = (w) => {
    const eff = effectiveInertia({ Ma: moment(w), b, h, d, As, fc, sec });
    return { d: coef * (w) * Lmm ** 4 / (Ec * eff.Ie), ...eff };      // w en kN/m = N/mm
  };
  const D = delta(wD);
  const DL = delta(wD + wL);
  const deltaL = DL.d - D.d;
  const lambda = xi;                                                 // ρ' = 0 (sin armadura de compresión)
  const longTermD = lambda * D.d;
  return { instD: D.d, instDL: DL.d, instL: deltaL, lambda, longD: longTermD, afterPartitions: longTermD + deltaL, Ie: DL.Ie, Ig: DL.Ig, Icr: DL.Icr, Mcr: DL.Mcr };
}

// ---------------- predimensionado ----------------
export function minThickness({ element, kind, L, fy }) {
  const ratio = N.minThicknessRatio[element][kind];
  return L * 1000 / ratio * N.minThicknessFyFactor(fy);
}

// ---------------- armado de una sección de viga o de losa para un momento dado ----------------
// Opciones de barras (una capa) para Mu (N·mm) en una viga de ancho b y altura h. Ordenadas por menor exceso de armadura.
export function beamBarOptions({ Mu, b, h, fc, fy, dStirrup, dagg, placement, exposure, tee = null, asMinB = null }) {
  const candidates = [];
  for (const db of beamBarDiameters(fy)) {
    const cover = coverFor({ element: 'beam', placement, exposure, dMain: db, dStirrup });
    const d = h - cover - dStirrup - db / 2;
    if (d <= 0) continue;
    const fl = tee ? flexureDesignT({ Mu, bw: b, bf: tee.bf, hf: tee.hf, d, fc, fy }) : flexureDesign({ Mu, b, d, fc, fy });
    if (!fl.ok) { candidates.push({ db, cover, d, flexure: fl, valid: false }); continue; }
    const asMin = asMinBeam({ b: asMinB ?? b, d, fc, fy });
    const AsReq = asRequiredBeam(fl.As, asMin);
    const smin = minClearSpacingBeam(db, dagg);
    let found = false;
    for (let n = 2; n <= 10; n++) {
      const As = n * barArea(db);
      if (As < AsReq) continue;
      const need = 2 * (cover + dStirrup) + n * db + (n - 1) * smin;
      if (need > b) break;
      const st = tee ? sectionStrengthT({ As, bw: b, bf: tee.bf, hf: tee.hf, d, fc, fy }) : sectionStrength({ As, b, d, fc, fy });
      candidates.push({ db, n, layers: 1, As, cover, d, asMin, AsReq, AsCalc: fl.As, smin, bNeeded: need, strength: st, valid: st.phiMn >= Mu && st.epsT >= N.epsMinFlexure, excess: As / AsReq - 1 });
      found = true;
      break;
    }
    if (found) continue;
    // Dos capas (art. 7.6.2: separación libre entre capas ≥ 25 mm): la altura útil se mide al baricentro de las barras.
    const dt = d;
    for (let n = 4; n <= 20; n++) {
      const n1 = Math.ceil(n / 2);
      const n2 = n - n1;
      const need = 2 * (cover + dStirrup) + n1 * db + (n1 - 1) * smin;
      if (need > b) break;
      const dc = dt - n2 * (db + Math.max(25, db)) / n;
      const As = n * barArea(db);
      const asMin2 = asMinBeam({ b: asMinB ?? b, d: dc, fc, fy });
      const st = tee ? sectionStrengthT({ As, bw: b, bf: tee.bf, hf: tee.hf, d: dc, dt, fc, fy }) : sectionStrength({ As, b, d: dc, dt, fc, fy });
      if (As < asMin2 || st.phiMn < Mu || st.epsT < N.epsMinFlexure) continue;
      candidates.push({ db, n, n1, n2, layers: 2, As, cover, d: dc, dt, asMin: asMin2, AsReq: As, AsCalc: fl.As, smin, bNeeded: need, strength: st, valid: true, excess: As / Math.max(fl.As, 1) - 1 });
      break;
    }
  }
  return {
    options: candidates.filter((c) => c.valid).sort((x, y) => (x.layers || 1) - (y.layers || 1) || x.excess - y.excess || x.n - y.n),
    failures: candidates.filter((c) => !c.valid && c.flexure && !c.flexure.ok),
  };
}

// Opciones de armadura (ADN 420) para Mu (N·mm por metro de ancho) en una losa de espesor h.
export function slabBarOptions({ Mu, h, fc, placement, exposure, sCap = Infinity }) {
  const fy = 420;
  const b = 1000;
  const asMin = asMinSlab({ b, h });
  const options = [];
  for (const db of N.rebar.ADN420.diameters.filter((x) => x <= 16)) {
    const cover = coverFor({ element: 'slab', placement, exposure, dMain: db, dStirrup: 0 });
    const d = h - cover - db / 2;
    if (d <= 0) continue;
    const fl = flexureDesign({ Mu, b, d, fc, fy });
    if (!fl.ok) { options.push({ db, d, cover, valid: false, flexure: fl }); continue; }
    const AsReq = Math.max(fl.As, asMin);
    const sMax = Math.min(2.5 * h, 25 * db, 300, sCap);                      // art. 7.6.5 (y 13.3.2: 2 h en losas en dos direcciones)
    const sMaxTemp = Math.min(3 * h, 300);                                      // art. 7.12.2.2
    for (let s = floorTo(sMax, 10); s >= SLAB_MIN_PRACTICAL_SPACING; s -= 10) {
      const As = barArea(db) * b / s;
      if (As < AsReq) continue;
      if (s - db < 25) continue;
      const st = sectionStrength({ As, b, d, fc, fy });
      options.push({ db, s, As, cover, d, AsReq, AsCalc: fl.As, asMin, sMax, sMaxTemp, strength: st, valid: st.phiMn >= Mu && st.epsT >= N.epsMinFlexure, excess: As / AsReq - 1 });
      break;
    }
  }
  return {
    options: options.filter((o) => o.valid).sort((x, y) => x.excess - y.excess),
    failures: options.filter((o) => !o.valid && o.flexure && !o.flexure.ok),
    asMin,
  };
}

// ---------------- viga completa ----------------
// input: { L, kind, D0 (kN/m sin peso propio), Lv (kN/m), b, h, fc, fy, fyt, dStirrup, placement, exposure, dagg,
//          bars: { db, n } | null, limitKey, xi }
export function designBeam(input) {
  const { L, kind, D0, Lv, b, h, fc, fy, fyt, dStirrup, placement, exposure, dagg, limitKey, xi } = input;
  // Viga con losa (art. 8.10): 'conv' = losa arriba, 'inv' = losa abajo (viga invertida). El ala colabora solo si queda del
  // lado comprimido: simple (traccion abajo) + convencional, o voladizo (traccion arriba) + invertida.
  const fl0 = input.flange || null;
  const section = input.section === 'inv' ? 'inv' : 'conv';
  const simple = kind !== 'cantilever';
  const flangeComp = Boolean(fl0) && ((section === 'conv') === simple);
  const tee = flangeComp ? { bf: fl0.bf, hf: fl0.hf } : null;
  const asMinB = fl0 && !flangeComp ? Math.min(2 * b, fl0.bf) : null;                 // art. 10.5.2 (ala traccionada)
  const sec = fl0 ? { bf: fl0.bf, hf: fl0.hf, flangeTop: section === 'conv', tensionBottom: simple, flangeComp } : null;
  const self = fl0 ? b * Math.max(0, h - fl0.hf) / 1e6 * N.gammaRC : selfWeightBeam(b, h);     // el espesor de la losa ya esta en D0
  const D = D0 + self;
  const cb = combos(D, Lv);
  const act = actions(kind, L, cb.wu);
  const Mu = act.M * 1e6;
  const Vu = act.V * 1000;
  const res = { self, D, combos: cb, Mu: act.M, Vu: act.V, mSign: act.mSign, checks: [], section, flange: fl0 ? { ...fl0, comp: flangeComp, asMinB } : null };

  const bo = beamBarOptions({ Mu, b, h, fc, fy, dStirrup, dagg, placement, exposure, tee, asMinB });
  res.options = bo.options;
  res.failures = bo.failures;

  let chosen = null;
  if (input.bars) chosen = res.options.find((o) => o.db === input.bars.db && o.n === input.bars.n) || null;
  if (!chosen) chosen = res.options[0] || null;
  res.chosen = chosen;
  if (!chosen) {
    res.ok = false;
    res.reason = res.failures[0]?.flexure?.reason || 'No hay una combinación de barras que entre en el ancho de la viga: aumentá b o h.';
    return res;
  }

  res.shear = shearDesign({ Vu, b, d: chosen.d, h, fc, fyt, dStirrup });
  res.deflection = deflections({ kind, L, wD: D, wL: Lv, b, h, d: chosen.d, As: chosen.As, fc, xi, sec });
  const lim = N.deflectionLimits[limitKey];
  const Lmm = L * 1000;
  const value = lim.uses === 'L' ? res.deflection.instL : res.deflection.afterPartitions;
  res.deflectionCheck = { limit: Lmm / lim.ratio, ratio: lim.ratio, value, ok: value <= Lmm / lim.ratio, uses: lim.uses, label: lim.label };
  const hMin = minThickness({ element: 'beam', kind, L, fy });
  res.hMin = hMin;
  res.checks = [
    { id: 'flex', label: 'Flexión', ok: chosen.strength.phiMn >= Mu, text: `φMn = ${nf((chosen.strength.phiMn / 1e6), 1)} kN·m ≥ Mu = ${nf(act.M, 1)} kN·m` },
    { id: 'eps', label: 'Deformación de tracción', ok: chosen.strength.epsT >= N.epsMinFlexure, text: `εt = ${nf(chosen.strength.epsT, 4)} ≥ 0,004` },
    { id: 'min', label: 'Armadura mínima', ok: chosen.As >= chosen.AsReq - 1e-6, text: `As = ${nf(chosen.As, 0)} mm² ≥ ${nf(chosen.AsReq, 0)} mm²` },
    { id: 'fit', label: 'Entra en el ancho', ok: chosen.bNeeded <= b, text: `b necesario ${nf(chosen.bNeeded, 0)} mm ≤ b = ${b} mm` },
    { id: 'shear', label: 'Corte', ok: res.shear.ok, text: res.shear.ok ? (res.shear.stirrups ? `estribos ø${dStirrup} c/${res.shear.s} mm` : 'sin armadura de corte por cálculo') : res.shear.reason },
    { id: 'defl', label: 'Flecha', ok: res.deflectionCheck.ok, text: `${nf(value, 1)} mm ≤ ${nf((Lmm / lim.ratio), 1)} mm (l/${lim.ratio})` },
  ];
  if (fl0) {
    res.checks.unshift({ id: 'flange', label: 'Ala de la losa', ok: true,
      text: `bf = ${nf(fl0.bf, 0)} mm, hf = ${nf(fl0.hf, 0)} mm (art. 8.10.${fl0.pos === 'L' ? '3' : '2'}); ${flangeComp ? 'queda comprimida y colabora' : 'queda traccionada: la sección flexiona como rectangular de ancho bw'}${res.chosen && res.chosen.strength && res.chosen.strength.tee ? ' (bloque comprimido en el alma: sección T)' : ''}` });
  }
  res.ok = res.checks.every((c) => c.ok);
  return res;
}

export function beamBarDiameters(fy) {
  return (fy === 220 ? N.rebar.AL220 : N.rebar.ADN420).diameters.filter((d) => d >= 10);
}

// ---------------- losa maciza armada en una dirección (franja de 1 m) ----------------
// input: { L, kind, D0 (kN/m2 sin peso propio), Lv (kN/m2), h, fc, placement, exposure, bars: { db, s } | null, limitKey, xi }
// La armadura es ADN 420 (la cuantía mínima de la Tabla 7.12.2.1 se verificó para ese acero).
export function designSlab(input) {
  const { L, kind, D0, Lv, h, fc, placement, exposure, limitKey, xi } = input;
  const fy = 420;
  const b = 1000;
  const self = selfWeightSlab(h);
  const D = D0 + self;
  const cb = combos(D, Lv);
  const act = actions(kind, L, cb.wu);
  const Mu = act.M * 1e6;
  const Vu = act.V * 1000;
  const res = { self, D, combos: cb, Mu: act.M, Vu: act.V, mSign: act.mSign };
  const so = slabBarOptions({ Mu, h, fc, placement, exposure });
  const asMin = so.asMin;
  res.options = so.options;
  res.failures = so.failures;
  let chosen = null;
  if (input.bars) chosen = res.options.find((o) => o.db === input.bars.db && o.s === input.bars.s) || null;
  if (!chosen) chosen = res.options[0] || null;
  res.chosen = chosen;
  if (!chosen) {
    res.ok = false;
    res.reason = res.failures[0]?.flexure?.reason || 'No hay una combinación de barras que verifique: aumentá el espesor.';
    return res;
  }
  const sqrtFc = Math.min(Math.sqrt(fc), N.maxSqrtFcShear);
  const phiVc = N.phiShear * sqrtFc / 6 * b * chosen.d;
  res.shear = { phiVc, Vu, ok: Vu <= phiVc };
  res.deflection = deflections({ kind, L, wD: D, wL: Lv, b, h, d: chosen.d, As: chosen.As, fc, xi });
  const lim = N.deflectionLimits[limitKey];
  const Lmm = L * 1000;
  const value = lim.uses === 'L' ? res.deflection.instL : res.deflection.afterPartitions;
  res.deflectionCheck = { limit: Lmm / lim.ratio, ratio: lim.ratio, value, ok: value <= Lmm / lim.ratio, uses: lim.uses, label: lim.label };
  res.hMin = minThickness({ element: 'slab', kind, L, fy });
  res.checks = [
    { id: 'flex', label: 'Flexión', ok: chosen.strength.phiMn >= Mu, text: `φMn = ${nf((chosen.strength.phiMn / 1e6), 2)} kN·m/m ≥ Mu = ${nf(act.M, 2)} kN·m/m` },
    { id: 'eps', label: 'Deformación de tracción', ok: chosen.strength.epsT >= N.epsMinFlexure, text: `εt = ${nf(chosen.strength.epsT, 4)} ≥ 0,004` },
    { id: 'min', label: 'Armadura mínima', ok: chosen.As >= asMin - 1e-6, text: `As = ${nf(chosen.As, 0)} mm²/m ≥ ${nf(asMin, 0)} mm²/m` },
    { id: 'shear', label: 'Corte (sin estribos)', ok: res.shear.ok, text: `φVc = ${nf((phiVc / 1000), 1)} kN/m ≥ Vu = ${nf(act.V, 1)} kN/m` },
    { id: 'defl', label: 'Flecha', ok: res.deflectionCheck.ok, text: `${nf(value, 1)} mm ≤ ${nf((Lmm / lim.ratio), 1)} mm (l/${lim.ratio})` },
  ];
  res.ok = res.checks.every((c) => c.ok);
  return res;
}

export { round, ceilTo, floorTo };
