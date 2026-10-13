// Columnas rectangulares de hormigón armado con estribos cerrados, según CIRSOC 201-2005.
// Unidades internas: N, mm, MPa (momentos en N·mm). Pórticos indesplazables (arriostrados), carga axial de compresión.
import { CIRSOC201 as N } from './norms.js';
import { barArea, phiFromStrain, coverFor, minClearSpacingBeam } from './rc.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ---------- armadura: barras en el perímetro ----------
// nb = barras en cada cara de ancho b (con las de esquina), nh = barras en cada cara de alto h.
export function perimeterBars({ b, h, inset, nb, nh }) {
  const bars = [];
  const xs = (n) => (n === 1 ? [b / 2] : Array.from({ length: n }, (_, i) => inset + i * (b - 2 * inset) / (n - 1)));
  const ys = (n) => (n === 1 ? [h / 2] : Array.from({ length: n }, (_, i) => inset + i * (h - 2 * inset) / (n - 1)));
  for (const x of xs(nb)) { bars.push({ x, y: inset }); bars.push({ x, y: h - inset }); }
  for (const y of ys(nh).slice(1, -1)) { bars.push({ x: inset, y }); bars.push({ x: b - inset, y }); }
  return bars;
}

// ---------- diagrama de interacción (flexión uniaxial + compresión) ----------
// Plano de flexión con profundidad hh (dirección de la flexión) y ancho bb. coord = 'y' (flexión alrededor de x, la
// cara comprimida es la superior y las distancias se miden según h) o 'x'.
function barsForAxis(bars, axis, b, h) {
  // Devuelve las barras como {d, A} con d = distancia a la cara comprimida, y las dimensiones (bb, hh) del plano.
  if (axis === 'x') return { bb: b, hh: h, list: bars.map((q) => ({ d: q.y, A: q.A })) };
  return { bb: h, hh: b, list: bars.map((q) => ({ d: q.x, A: q.A })) };
}

export function interactionDiagram({ bb, hh, list, fc, fy }) {
  const beta1 = N.beta1(fc);
  const Ast = list.reduce((s, q) => s + q.A, 0);
  const Ag = bb * hh;
  const P0 = 0.85 * fc * (Ag - Ast) + fy * Ast;
  const phiPnMax = 0.80 * N.phiCompression * P0;
  const dMax = Math.max(...list.map((q) => q.d));
  const pts = [];
  for (let k = 0; k <= 160; k++) {
    const c = hh * 0.02 * Math.exp(k / 160 * Math.log(60 / 0.02));   // 0,02 h … 60 h
    const a = Math.min(beta1 * c, hh);
    let P = 0.85 * fc * a * bb;
    let M = P * (hh / 2 - a / 2);
    for (const q of list) {
      const eps = N.epsCu * (c - q.d) / c;
      const fs = Math.max(-fy, Math.min(fy, N.Es * eps));
      const F = q.A * (fs - (q.d < a ? 0.85 * fc : 0));
      P += F;
      M += F * (hh / 2 - q.d);
    }
    const epsT = N.epsCu * (dMax - c) / c;
    const phi = phiFromStrain(epsT, fy);
    pts.push({ c, P, M: Math.abs(M), epsT, phi, phiP: phi * P, phiM: phi * Math.abs(M) });
  }
  // curva de diseño truncada en φPn,max
  const design = pts.map((p) => ({ ...p, phiP: Math.min(p.phiP, phiPnMax) })).sort((u, v) => v.phiP - u.phiP || u.phiM - v.phiM);
  return { pts, design, P0, phiPnMax, Ast, Ag, phiP0: N.phiCompression * P0 };
}

// φMn disponible para una carga axial Pu (curva de diseño). Devuelve null si Pu supera φPn,max.
export function momentCapacityAt(diag, Pu) {
  if (Pu > diag.phiPnMax + 1e-6) return null;
  const d = diag.design;
  let best = 0;
  for (let i = 0; i < d.length - 1; i++) {
    const p1 = d[i];
    const p2 = d[i + 1];
    const hi = Math.max(p1.phiP, p2.phiP);
    const lo = Math.min(p1.phiP, p2.phiP);
    if (Pu <= hi + 1e-9 && Pu >= lo - 1e-9) {
      const t = hi === lo ? 0 : (Pu - lo) / (hi - lo);
      const lowP = p1.phiP <= p2.phiP ? p1 : p2;
      const highP = p1.phiP <= p2.phiP ? p2 : p1;
      best = Math.max(best, lowP.phiM + t * (highP.phiM - lowP.phiM));
    }
  }
  return best;
}

// Carga axial de diseño φPn para una excentricidad e dada (recta M = P·e sobre la curva de diseño).
export function axialCapacityAtEccentricity(diag, e) {
  const d = diag.design;
  let found = diag.phiPnMax;
  // La recta M = e·P parte del origen: buscamos el cruce con la curva (φM, φP) de mayor φP hacia abajo.
  for (let i = 0; i < d.length - 1; i++) {
    const g1 = d[i].phiM - e * d[i].phiP;
    const g2 = d[i + 1].phiM - e * d[i + 1].phiP;
    if (g1 <= 0 && g2 >= 0) {
      const t = g2 === g1 ? 0 : -g1 / (g2 - g1);
      found = d[i].phiP + t * (d[i + 1].phiP - d[i].phiP);
      break;
    }
  }
  return Math.min(found, diag.phiPnMax);
}

// ---------- esbeltez (art. 10.10 a 10.12, pórticos indesplazables) ----------
// hh: dimensión de la sección en el plano de flexión; bo: la otra dimensión.
export function slendernessAxis({ hh, bo, lu, k = 1, M1, M2, Pu, fc, betad }) {
  const r = 0.30 * hh;                                   // art. 10.11.2
  const ratio = k * lu / r;
  const m = Math.abs(M2) > 1e-9 ? M1 / M2 : 1;           // + curvatura simple, - doble curvatura
  const limit = Math.min(34 - 12 * m, 40);               // ec. (10-7)
  const out = { r, ratio, limit, M1, M2, m };
  if (ratio > 100) return { ...out, ok: false, slender: true, reason: `Esbeltez kℓu/r = ${nf(ratio, 0)} mayor que 100: hay que hacer un análisis de segundo orden (art. 10.11.5).` };
  if (ratio <= limit) return { ...out, ok: true, slender: false, Mc: Math.abs(M2), delta: 1 };
  const M2min = Pu * (15 + 0.03 * hh);                   // ec. (10-14)
  const Ig = bo * hh ** 3 / 12;
  const EI = 0.4 * N.Ec(fc) * Ig / (1 + betad);          // ec. (10-12)
  const Pc = Math.PI ** 2 * EI / (k * lu) ** 2;          // ec. (10-10)
  const useMin = M2min > Math.abs(M2);
  const M2d = Math.max(Math.abs(M2), M2min);
  const Cm = useMin ? 1 : Math.max(0.4, 0.6 + 0.4 * m);  // ec. (10-13) / art. 10.12.3.2
  if (Pu >= 0.75 * Pc) return { ...out, ok: false, slender: true, Pc, reason: 'La columna es demasiado esbelta para esta carga (Pu ≥ 0,75 Pc): aumentá la sección.' };
  const delta = Math.max(1, Cm / (1 - Pu / (0.75 * Pc))); // ec. (10-9)
  return { ...out, ok: true, slender: true, Pc, EI, M2min, Cm, delta, M2d, Mc: delta * M2d };
}

// ---------- detalles constructivos ----------
export function tieDiameterMin(db) {                     // Tabla 7.10.5.1
  if (db <= 16) return 6;
  if (db <= 25) return 8;
  if (db <= 32) return 10;
  return 12;
}

export function columnCover({ placement, exposure, db, dbe }) {
  // Tabla 7.7.1: estribos 20 mm (interior) o 30/35 mm (a la intemperie); la armadura principal db (mín. 20, máx. 40).
  const base = coverFor({ element: 'beam', placement, exposure, dMain: db, dStirrup: dbe });
  const f = N.exposure[exposure]?.factor ?? 1;
  const mainCover = Math.ceil(Math.min(Math.max(db, 20), 40) * f);
  return Math.max(base, mainCover - dbe);
}

// ---------- diseño de la columna ----------
// input: { b, h (mm), fc, fy, lu (mm), placement, exposure, dagg, bars: {db, nb, nh} | null, dbe?,
//          cases: [{ Pu (N), sustained (N), M1x, M2x, M1y, M2y (N·mm, mayorados) }] }
// Para una sola combinación se pueden pasar Pu, sustained, M1x… directamente en input. Se verifican todas las
// combinaciones con la misma armadura: la que gobierna es la de mayor aprovechamiento.
export function designColumn(input) {
  const { b, h, fc, fy, lu, placement, exposure, dagg } = input;
  const cases = input.cases && input.cases.length ? input.cases
    : [{ Pu: input.Pu, sustained: input.sustained, M1x: input.M1x, M2x: input.M2x, M1y: input.M1y, M2y: input.M2y }];
  const Ag = b * h;
  const res = { checks: [], nCases: cases.length };

  const proc = cases.map((cs) => {
    const betad = cs.Pu > 0 ? Math.min(1, Math.max(0, cs.sustained / cs.Pu)) : 0;
    const sx = slendernessAxis({ hh: h, bo: b, lu, M1: cs.M1x, M2: cs.M2x, Pu: cs.Pu, fc, betad });
    const sy = slendernessAxis({ hh: b, bo: h, lu, M1: cs.M1y, M2: cs.M2y, Pu: cs.Pu, fc, betad });
    return { Pu: cs.Pu, betad, sx, sy, Mcx: sx.Mc, Mcy: sy.Mc };
  });
  const bad = proc.find((c) => !c.sx.ok || !c.sy.ok);
  if (bad) { res.ok = false; res.reason = (!bad.sx.ok ? bad.sx : bad.sy).reason; return res; }

  const candidates = [];
  const PuMax = Math.max(...proc.map((c) => c.Pu));
  for (const db of [12, 16, 20, 25, 32]) {
    const dbe = Math.max(tieDiameterMin(db), Number(input.dbe) || 0);
    const cover = columnCover({ placement, exposure, db, dbe });
    const inset = cover + dbe + db / 2;
    for (let nb = 2; nb <= 6; nb++) {
      for (let nh = 2; nh <= 6; nh++) {
        const n = 2 * nb + 2 * nh - 4;
        const Ab = barArea(db);
        const Ast = n * Ab;
        const rho = Ast / Ag;
        if (rho < 0.01 - 1e-9 || rho > 0.08 + 1e-9) continue;                         // art. 10.9.1
        const sB = nb > 1 ? (b - 2 * inset) / (nb - 1) : Infinity;
        const sH = nh > 1 ? (h - 2 * inset) / (nh - 1) : Infinity;
        const clear = Math.min(sB, sH) - db;
        const minClear = Math.max(1.5 * db, 40, 1.33 * dagg);                          // art. 7.6.3
        if (clear < minClear) continue;
        if (b - 2 * inset < 0 || h - 2 * inset < 0) continue;
        const bars = perimeterBars({ b, h, inset, nb, nh }).map((q) => ({ ...q, A: Ab }));
        const dx = interactionDiagram({ ...barsForAxis(bars, 'x', b, h), fc, fy });
        const dy = interactionDiagram({ ...barsForAxis(bars, 'y', b, h), fc, fy });
        if (PuMax > dx.phiPnMax + 1e-6) continue;
        let worst = null;
        for (const cs of proc) {
          let util;
          let biaxial = false;
          const capX = momentCapacityAt(dx, cs.Pu);
          const capY = momentCapacityAt(dy, cs.Pu);
          if (cs.Mcx <= 1e-6 && cs.Mcy <= 1e-6) {
            util = cs.Pu / dx.phiPnMax;
          } else if (cs.Mcx > 1e-6 && cs.Mcy > 1e-6 && cs.Pu > 0) {
            biaxial = true;
            const pnx = axialCapacityAtEccentricity(dx, cs.Mcx / cs.Pu);
            const pny = axialCapacityAtEccentricity(dy, cs.Mcy / cs.Pu);
            const pni = 1 / (1 / pnx + 1 / pny - 1 / dx.phiP0);                        // cargas recíprocas (C 10.3)
            util = cs.Pu / Math.min(pni, dx.phiPnMax);
          } else if (cs.Mcx >= cs.Mcy) {
            util = capX > 0 ? cs.Mcx / capX : Infinity;
          } else {
            util = capY > 0 ? cs.Mcy / capY : Infinity;
          }
          if (!worst || util > worst.util) worst = { util, biaxial, cs };
        }
        const valid = worst.util <= 1 + 1e-9;
        candidates.push({ db, nb, nh, n, Ast, rho, dbe, cover, inset, clear, minClear, util: worst.util, biaxial: worst.biaxial, gov: worst.cs, valid, dx, dy, bars,
          tieSpacing: Math.floor(Math.min(12 * db, 48 * dbe, Math.min(b, h)) / 5) * 5 });
      }
    }
  }
  res.options = candidates.filter((c) => c.valid).sort((u, v) => u.Ast - v.Ast || u.n - v.n || Math.abs(u.nb - u.nh) - Math.abs(v.nb - v.nh) || u.db - v.db);
  let chosen = null;
  if (input.bars) chosen = res.options.find((o) => o.db === input.bars.db && o.nb === input.bars.nb && o.nh === input.bars.nh) || null;
  if (!chosen) chosen = res.options[0] || null;
  res.chosen = chosen;
  if (!chosen) {
    res.ok = false;
    res.reason = PuMax > 0.8 * N.phiCompression * (0.85 * fc * 0.92 * Ag + fy * 0.08 * Ag) ? 'La carga axial supera lo que resiste la sección con 8 % de armadura: aumentá la sección o el hormigón.'
      : 'Ninguna armadura con 1 % a 8 % de cuantía alcanza para estas solicitaciones: aumentá la sección o el hormigón.';
    return res;
  }
  const c = chosen;
  const g = c.gov;
  const governing = proc.find((q) => q.Pu === g.Pu && q.Mcx === g.Mcx && q.Mcy === g.Mcy) || proc[0];
  res.Pu = g.Pu;
  res.betad = governing.betad;
  res.slender = { x: governing.sx, y: governing.sy };
  res.Mcx = governing.Mcx;
  res.Mcy = governing.Mcy;
  // barras sin soporte lateral: distancia a la barra soportada más cercana (art. 7.10.5.3)
  const spanMax = Math.max(c.nb > 2 ? (b - 2 * c.inset) / (c.nb - 1) : 0, c.nh > 2 ? (h - 2 * c.inset) / (c.nh - 1) : 0);
  res.unsupported = spanMax - c.db > 15 * c.dbe;
  const anySlender = proc.some((q) => q.sx.slender || q.sy.slender);
  res.checks = [
    { id: 'axial', label: 'Carga axial máxima', ok: PuMax <= c.dx.phiPnMax, text: `Pu = ${nf(PuMax / 1000, 0)} kN ≤ φPn,máx = ${nf(c.dx.phiPnMax / 1000, 0)} kN` },
    { id: 'pm', label: 'Flexocompresión', ok: c.util <= 1 + 1e-9, text: `${c.biaxial ? 'flexión biaxial (cargas recíprocas)' : 'flexión uniaxial'}: aprovechamiento ${nf(c.util * 100, 0)} %${cases.length > 1 ? ` (combinación más desfavorable de ${cases.length})` : ''}` },
    { id: 'rho', label: 'Cuantía longitudinal', ok: c.rho >= 0.01 && c.rho <= 0.08, text: `ρ = ${nf(c.rho * 100, 2)} % (entre 1 % y 8 %)` },
    { id: 'sep', label: 'Separación entre barras', ok: c.clear >= c.minClear, text: `libre ${nf(c.clear, 0)} mm ≥ ${nf(c.minClear, 0)} mm` },
    { id: 'esb', label: 'Esbeltez', ok: true, text: `kℓu/r = ${nf(governing.sx.ratio, 0)} (x) / ${nf(governing.sy.ratio, 0)} (y)${anySlender ? '; momentos amplificados' : '; se pueden ignorar los efectos de esbeltez'}` },
  ];
  res.ok = res.checks.every((k) => k.ok);
  return res;
}

export { barArea, minClearSpacingBeam };
