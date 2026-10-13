// Base unificada (combinada) de dos columnas, CIRSOC 201-2005 Cap. 15: se usa cuando dos zapatas aisladas quedan demasiado cerca (distancia libre
// menor que 60 cm) y se unifican en una sola base rectangular. Unidades internas: N, mm, MPa (como footing.js).
//
// Método (apuntes "Base unificada" de la cátedra, resueltos con CIRSOC 201 en lugar de la tensión admisible del hormigón):
//  1. La resultante de las cargas de servicio debe coincidir con el baricentro de la base (presión uniforme): xR = P2 ℓ / (P1 + P2) desde el eje
//     de la columna 1. Con la columna 1 en el límite de la propiedad la longitud queda fijada: a = 2 (xR + u), u = distancia del borde al eje.
//  2. Área con las cargas sin mayorar: A = (P1 + P2 + peso) / σ; ancho b = A / a.
//  3. Dirección longitudinal: la base trabaja como una viga "T invertida" de alma bo = ancho de la columna + 10 cm y ala b: en el tramo entre columnas
//     la tracción está arriba (ala comprimida abajo) y en los apoyos y voladizos abajo (alma comprimida arriba). Las solicitaciones salen de las
//     cargas mayoradas con la presión del suelo (lineal si la resultante mayorada no coincide con el baricentro).
//  4. Dirección transversal: las alas de la base son voladizos de 1 m de ancho empotrados en el alma, con la presión del suelo.
import { CIRSOC201 as N } from './norms.js';
import { barArea, flexureDesign, asMinSlab, beamBarOptions, shearDesign, floorTo, ceilTo, coverFor } from './rc.js';
import { FOOTING_COVER, designFooting } from './footing.js';
import { punchingStress } from './footing-ecc.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const MIN_CLEAR_BETWEEN_FOOTINGS = 600;      // mm: distancia libre mínima entre zapatas aisladas (criterio de la cátedra)

// Control de la distancia libre entre las dos zapatas aisladas que se unificarían.
export function isolatedSeparation(inp) {
  const sizes = [[inp.PD1, inp.PL1, inp.hc1, inp.bc1], [inp.PD2, inp.PL2, inp.hc2, inp.bc2]].map(([PD, PL, hc, bc]) => {
    try {
      const r = designFooting({ PD, PL, bc, hc, fc: inp.fc, fy: 420, sigma: inp.sigma, gammaSoil: inp.gammaSoil, Df: inp.Df, ratio: 1 });
      return r.ok ? r.L : null;
    } catch (e) { return null; }
  });
  if (!sizes[0] || !sizes[1]) return { sizes, clear: null, needUnify: null };
  const clear = inp.ell - sizes[0] / 2 - sizes[1] / 2;
  return { sizes, clear, needUnify: clear < MIN_CLEAR_BETWEEN_FOOTINGS };
}

// inp: { PD1, PL1, PD2, PL2 (N), hc1, bc1, hc2, bc2 (mm; hc en el sentido de la unión, bc transversal), ell (mm entre ejes), limit (bool: la columna 1 junto al
//        límite), ax1 (mm, de la cara de la columna 1 al límite), bFixed (mm, 0 = automático), fc, fy, sigma (MPa), gammaSoil (kN/m3), Df (mm), placement }
export function designFootingCombined(inp) {
  const { PD1, PL1, PD2, PL2, hc1, bc1, hc2, bc2, ell, fc, sigma, gammaSoil, Df } = inp;
  const fy = inp.fy || 420;
  const P1 = PD1 + PL1;
  const P2 = PD2 + PL2;
  const Ps = P1 + P2;
  const Pu1 = 1.2 * PD1 + 1.6 * PL1;
  const Pu2 = 1.2 * PD2 + 1.6 * PL2;
  const Pu = Pu1 + Pu2;
  const res = { Ps, Pu, Pu1, Pu2, checks: [] };
  if (!(Ps > 0) || !(sigma > 0) || !(ell > 0)) return { ...res, ok: false, reason: 'Ingresá las cargas, la distancia entre columnas y la tensión del suelo.' };
  const xR = P2 * ell / Ps;                                          // resultante de servicio, desde el eje de la columna 1
  const limit = Boolean(inp.limit);
  const u0 = limit ? Math.max(0, Number(inp.ax1) || 0) + hc1 / 2 : 0;
  let aFixed = 0;
  if (limit) {
    aFixed = 2 * (xR + u0);
    const v = aFixed - u0 - ell;
    if (v < hc2 / 2) return { ...res, ok: false, reason: 'Con la columna 1 junto al límite la resultante cae tan cerca de la columna 1 que la base no llega a cubrir la columna 2: hace falta una base excéntrica con viga de equilibrio.' };
  }
  const aMin = limit ? aFixed : 2 * Math.max(xR + hc1 / 2, ell - xR + hc2 / 2);
  const sqrtFc = Math.min(Math.sqrt(fc), N.maxSqrtFcShear);
  const bwBase = Math.max(bc1, bc2) + 100;                            // alma bo = columna + 10 cm
  const why = new Set();
  const hStart = Math.max(400, ceilTo(ell / 5, 50));            // criterio constructivo: franja rígida, h ≥ ℓ / 5
  for (const minS of [100, 50]) {
  for (let h = hStart; h <= 2000; h += 50) {
    const wF = N.gammaRC * h / 1e6;
    const wS = gammaSoil * Math.max(0, Df - h) / 1e6;
    if (sigma - wF - wS <= 0) return { ...res, ok: false, reason: 'La tensión admisible no alcanza ni para el peso de la base y del suelo: revisá la profundidad o el suelo.' };
    const Areq = Ps / (sigma - wF - wS);
    const cands = [];
    const aList = limit ? [aFixed] : Array.from({ length: 61 }, (_, i) => ceilTo(aMin, 50) + i * 50);
    for (const aa of aList) {
      const b = inp.bFixed > 0 ? inp.bFixed : Math.max(ceilTo(Areq / aa, 50), bwBase + 200);
      if (b * aa < Areq - 1e-6) continue;
      if (Math.max(aa, b) / Math.min(aa, b) > 8) continue;
      cands.push({ a: aa, b });
    }
    cands.sort((p, q) => p.a * p.b - q.a * q.b);
    let tested = 0;
    for (const cd of cands) {
      if (tested++ >= 12) break;
      const r = checkComb({ ...inp, fy, h, a: cd.a, b: cd.b, xR, limit, u0, Ps, P1, P2, Pu, Pu1, Pu2, wF, wS, sqrtFc, bwBase, minS });
      if (r && r.ok) return { ...res, ...r };
      if (r && r.why) why.add(r.why);
    }
  }
  }
  const w = [...why];
  let reason = 'No se encontró una base unificada que verifique hasta 2,00 m de altura: revisá la tensión admisible o las cargas.';
  if (w.includes('punzonado')) reason = 'No verifica el punzonado de las columnas hasta 2,00 m de altura: usá columnas más grandes o mejorá el suelo.';
  else if (w.includes('corte')) reason = 'El corte de la franja longitudinal supera el máximo admisible: aumentá el ancho del alma o la altura.';
  return { ...res, ok: false, reason, why: w };
}

function checkComb(c) {
  const { PD1, PD2, hc1, bc1, hc2, bc2, ell, h, a, b, xR, limit, u0, Ps, Pu, Pu1, Pu2, fc, fy, sigma, wF, wS, sqrtFc, bwBase, minS } = c;
  const u = limit ? u0 : a / 2 - xR;                                  // borde izquierdo → eje de la columna 1
  const v = a - u - ell;                                              // eje de la columna 2 → borde derecho
  if (u < hc1 / 2 - 1e-6 || v < hc2 / 2 - 1e-6) return { why: 'geometria' };
  const x1 = u;
  const x2 = u + ell;
  const A = a * b;
  // presión mayorada: lineal si la resultante mayorada no coincide con el baricentro
  const xRu = x1 + Pu2 * ell / Pu;
  const eu = xRu - a / 2;
  const qAvg = Pu / A;
  const qAt = (x) => qAvg * (1 + 12 * eu * (x - a / 2) / (a * a));     // N/mm² (presión sobre el suelo, hacia arriba)
  if (Math.min(qAt(0), qAt(a)) < -1e-9) return { why: 'suelo' };
  // diagramas de la franja (ancho b): w(x) = qu(x) b, columnas hacia abajo
  const n = 400;
  const xs = Array.from({ length: n + 1 }, (_, i) => i * a / n);
  const wAt = (x) => qAt(x) * b;
  // fórmulas cerradas con las cargas puntuales exactas (V y M desde el borde izquierdo; M > 0 = tracción abajo)
  const Vx = (x) => qAvg * b * (x + 6 * eu * (x * x - a * x) / (a * a)) - (x >= x1 ? Pu1 : 0) - (x >= x2 ? Pu2 : 0);
  const Mx = (x) => {
    const w0 = qAvg * b;
    const k = 12 * eu / (a * a);
    const up = w0 * x * x / 2 + w0 * k * (x ** 3 / 6 - a * x * x / 4);
    return up - (x >= x1 ? Pu1 * (x - x1) : 0) - (x >= x2 ? Pu2 * (x - x2) : 0);
  };
  const Vf = xs.map(Vx);
  const Mf = xs.map(Mx);
  const MposMax = Math.max(0, ...Mf);                                   // tracción abajo (apoyos y voladizos)
  const MnegMax = Math.max(0, -Math.min(...Mf));                       // tracción arriba (tramo)
  // sección: alma bw y espesor de la placa hs; ala comprimida en el tramo bf
  const cover = FOOTING_COVER;
  const placement = 'outdoor';
  const qMaxP = Math.max(qAt(0), qAt(a));
  let lastWhy = null;
  for (let bw = bwBase; bw <= bwBase + 200; bw += 100) {
    if (bw > b) break;
    const cant = (b - bw) / 2;
    // placa (voladizo de 1 m de ancho)
    let slab = null;
    for (let hs = 300; hs <= h; hs += 50) {
      const Mus = qMaxP * cant * cant / 2 * 1000;                     // N·mm por metro de ancho
      for (const db of [10, 12, 16]) {
        const d = hs - cover - db / 2;
        if (d < 150) continue;
        const fl = flexureDesign({ Mu: Mus, b: 1000, d, fc, fy });
        if (!fl.ok) continue;
        const As = Math.max(fl.As, asMinSlab({ b: 1000, h: hs }));
        const sMaxAbs = Math.min(2.5 * hs, 25 * db, 300);
        const s = floorTo(Math.min(barArea(db) * 1000 / As, sMaxAbs), 10);
        if (s < 100) continue;
        const Vus = qMaxP * Math.max(0, cant - d) * 1000;
        if (Vus > N.phiShear * sqrtFc / 6 * 1000 * d) continue;
        slab = { hs, db, s, As, Mu: Mus, Vu: Vus, d, AsCalc: fl.As };
        break;
      }
      if (slab) break;
    }
    if (!slab) { lastWhy = 'placa'; continue; }
    const hs = slab.hs;
    const bf = Math.min(b, bw + 16 * hs, ell / 4 + bw);              // art. 8.10.2 (ala a cada lado ≤ 8 hf) y ≤ 1/4 de la luz
    const topOpts = beamBarOptions({ Mu: MnegMax, b: bw, h, fc, fy, dStirrup: 10, dagg: 19, placement, exposure: 'A1A2', tee: MnegMax > 0 ? { bf, hf: hs } : null, asMinB: bw });
    const botOpts = beamBarOptions({ Mu: MposMax, b: bw, h, fc, fy, dStirrup: 10, dagg: 19, placement, exposure: 'A1A2', asMinB: bw });
    const top = topOpts.options[0];
    const bot = botOpts.options[0];
    if (!top || !bot) { lastWhy = 'armadura'; continue; }
    // corte de la franja a d de la cara de cada columna
    const dSh = Math.min(top.d, bot.d);
    const critical = [];
    [[x1, hc1], [x2, hc2]].forEach(([xc, hc]) => { [xc - hc / 2 - dSh, xc + hc / 2 + dSh].forEach((x) => { if (x > 0 && x < a) critical.push(Math.abs(Vx(x))); }); });
    // junto a las caras de los extremos libres sin columna cercana el corte es el de los voladizos
    const VuB = Math.max(...critical, 0);
    let sh = null;
    let dSt = 10;
    let legs = 2;
    for (const [dd, ll] of [[10, 2], [10, 4], [12, 4]]) {
      const t = shearDesign({ Vu: VuB, b: bw, d: dSh, h, fc, fyt: 420, dStirrup: dd, legs: ll });
      if (t.ok && (!t.stirrups || t.s >= minS)) { sh = t; dSt = dd; legs = ll; break; }
      if (t.ok && !sh) { sh = null; }
    }
    if (!sh) { lastWhy = 'corte'; continue; }
    // punzonado de cada columna con la profundidad total de la franja
    const dP = dSh;
    let punchOk = true;
    const punch = [];
    for (const [xc, hc, bc, Pui] of [[x1, hc1, bc1, Pu1], [x2, hc2, bc2, Pu2]]) {
      const geom = punchingStress({ L: a, B: b, xc, yc: b / 2, hc, bc, d: dP, Vu: 0, Mx: 0, My: 0 });
      const { cx1, cx2, cy1, cy2 } = geom.rect;
      const inside = ((cx2 - cx1) * (cy2 - cy1)) * qAt(xc);
      const ps = punchingStress({ L: a, B: b, xc, yc: b / 2, hc, bc, d: dP, Vu: Pui - inside, Mx: 0, My: 0 });
      const betaC = Math.max(bc, hc) / Math.min(bc, hc);
      const alphaS = ps.sides >= 4 ? 40 : ps.sides === 3 ? 30 : 20;
      const vc = Math.min((1 + 2 / betaC) * sqrtFc / 6, (alphaS * dP / ps.bo + 2) * sqrtFc / 12, sqrtFc / 3);
      const phiVc = N.phiShear * vc;
      punch.push({ x: xc, vmax: ps.vmax, phiVc, sides: ps.sides, bo: ps.bo, alphaS });
      if (ps.vmax > phiVc) punchOk = false;
    }
    if (!punchOk) { lastWhy = 'punzonado'; continue; }
    // presión de servicio (uniforme, con la resultante en el baricentro)
    const w = wF + wS;
    const qmax = (Ps + w * A) / A;
    const kgBars = ((top.n * a) + (bot.n * a)) * barArea(top.db) * 7850 / 1e9 + (a / (sh.stirrups ? sh.s : 300)) * (legs / 2) * (2 * (bw + h) * barArea(dSt)) * 7850 / 1e9
      + ((1000 / slab.s) * (b / 1000) * a * barArea(slab.db) * 7850 / 1e9) + ((b / 200) * a * barArea(8) * 7850 / 1e9);
    const checks = [
      { id: 'soil', label: 'Tensión sobre el suelo', ok: qmax <= sigma + 1e-9, text: `${nf(qmax * 1000, 0)} kPa ≤ ${nf(sigma * 1000, 0)} kPa (admisible); resultante de servicio en el baricentro` },
      { id: 'flexTop', label: 'Flexión en el tramo (tracción arriba)', ok: true, text: `Mu = ${nf(MnegMax / 1e6, 0)} kN·m, ${top.n} ø${top.db}${top.layers === 2 ? ' (2 capas)' : ''} (As = ${nf(top.As, 0)} mm²), sección T invertida: alma ${nf(bw / 10, 0)} cm, ala ${nf(bf / 10, 0)} cm × ${nf(hs / 10, 0)} cm` },
      { id: 'flexBot', label: 'Flexión en columnas y voladizos (tracción abajo)', ok: true, text: `Mu = ${nf(MposMax / 1e6, 0)} kN·m, ${bot.n} ø${bot.db}${bot.layers === 2 ? ' (2 capas)' : ''} (As = ${nf(bot.As, 0)} mm²), sección rectangular de ancho ${nf(bw / 10, 0)} cm` },
      { id: 'shear', label: 'Corte de la franja', ok: sh.ok, text: `Vu = ${nf(VuB / 1000, 0)} kN a d de las caras de las columnas; ${sh.stirrups ? `estribos ø${dSt} c/${nf(sh.s / 10, 0)} cm (${legs} ramas)` : 'sin estribos por cálculo (mínimos)'}` },
      { id: 'slab', label: 'Placa (voladizos transversales)', ok: true, text: `vuelo ${nf(cant / 10, 0)} cm, Mu = ${nf(slab.Mu / 1e6, 1)} kN·m/m, ø${slab.db} c/${nf(slab.s / 10, 0)} cm; espesor ${nf(hs / 10, 0)} cm` },
      { id: 'punch', label: 'Punzonado de las columnas', ok: true, text: punch.map((p, i) => `col. ${i + 1}: vu = ${nf(p.vmax, 2)} ≤ φvc = ${nf(p.phiVc, 2)} MPa (${p.sides} lados)`).join('; ') },
    ];
    return {
      ok: true, a, b, h, hs, bw, bf, dSt, legs, u, v, x1, x2, xR, xRu, eu, cant, qmax, qu: qAvg, qL: qAt(0), qR: qAt(a), MposMax, MnegMax, VuB, top, bot, shear: sh, slab, punch,
      xs, V: Vf, M: Mf, checks, concrete: (a * b * hs + a * bw * (h - hs)) / 1e9, steelKg: kgBars, wSelf: wF * A, wSoil: wS * A, limit, cover,
    };
  }
  return lastWhy ? { why: lastWhy } : null;
}
