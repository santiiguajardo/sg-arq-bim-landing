// Anclaje de las columnas de acero en la base de hormigón: bulones con tuerca y arandela hormigonados in situ, verificados con el Apéndice D del Reglamento CIRSOC 201-2005.
// FUENTE: CIRSOC 201-2005, Apéndice D (anclajes en hormigón), combinaciones del artículo 9.2:
//   - Acero en tracción Nsa = n Ase futa (D-3); en corte Vsa = n 0,6 Ase futa (D-20), con 0,80 si hay mortero de nivelación (D.6.1.3); futa ≤ mín(1,9 fya; 875 MPa).
//   - Desprendimiento del hormigón por tracción Ncbg = (ANc/ANco) ψec ψed ψc Nb (D-4, D-5), ANco = 9 hef² (D-6), Nb = kc √f'c hef^1,5 con kc = 10 (D-7),
//     ψed = 1 si ca,mín ≥ 1,5 hef y 0,7 + 0,3 ca,mín / (1,5 hef) si no (D-10, D-11).
//   - Arrancamiento Npn = ψc,P Np, Np = 8 Abrg f'c (D-15). Descascaramiento lateral Nsb = 13,3 ca1 √Abrg √f'c si ca1 < 0,4 hef (D-17).
//   - Desprendimiento por corte Vcbg = (AVc/AVco) ψec ψed ψc Vb (D-22), AVco = 4,5 ca1² (D-23), Vb = 0,6 (le/do)^0,2 √do √f'c ca1^1,5 (D-24), le = mín(hef; 8 do);
//     ψed,V = 1 si ca2 ≥ 1,5 ca1 y 0,7 + 0,3 ca2 / (1,5 ca1) si no (D-27, D-28). Arrancamiento por corte Vcpg = kcp Ncbg, kcp = 2 si hef ≥ 65 mm (D-30).
//   - Interacción (D.7): si Vua ≤ 0,2 φVn o Nua ≤ 0,2 φNn alcanza con la otra verificación; si no, Nua/φNn + Vua/φVn ≤ 1,2 (D-31).
//   - Factores φ (D.4.4, combinaciones del 9.2): acero dúctil 0,75 en tracción y 0,65 en corte; hormigón (Condición B, sin armadura suplementaria) 0,70.
//   - Separación y distancia al borde mínimas de 6 do en anclajes sometidos a torque (D.8.1, D.8.2).
// Decisiones del programa (no son del reglamento): se supone hormigón fisurado (ψc = 1,0, del lado seguro), tuerca con arandela de diámetro 2 do (Abrg = π (4 do² − do²) / 4),
// bulones ISO 4.6 (fub = 400 MPa, fya = 240 MPa) con área efectiva de rosca Ase = π (do − 0,9382 p)² / 4 (rosca ISO gruesa), y que el corte lo toma solo la fila de anclajes más cercana al borde
// en la dirección del corte (agujeros holgados en la placa). El empotramiento no puede ser menor que 8 do (y 150 mm) ni pasar de h − 100 mm del espesor de la base.
// Unidades: N, mm, MPa.

export const ANCHOR_STEEL = { futa: 400, fya: 240 };
const PITCH = { 12: 1.75, 16: 2, 20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5 };
const PHI = { steelT: 0.75, steelV: 0.65, conc: 0.70 };

export const ase = (d) => Math.PI * (d - 0.9382 * (PITCH[d] || 3)) ** 2 / 4;
export const abrg = (d) => Math.PI * ((2 * d) ** 2 - d * d) / 4;

const fmtN = (x, n = 1) => (Number.isFinite(x) ? x.toLocaleString('es-AR', { minimumFractionDigits: n, maximumFractionDigits: n }) : '—');

// Área proyectada de la superficie de falla de un grupo de anclajes en la superficie libre (D.5.2.1): rectángulo que envuelve al grupo ampliado 1,5 hef, recortado por los bordes de la base.
function projectedArea(pts, hef, half) {
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs); const xmax = Math.max(...xs); const ymin = Math.min(...ys); const ymax = Math.max(...ys);
  const ext = (edge) => Math.max(0, Math.min(1.5 * hef, edge));
  const w = (xmax - xmin) + ext(xmin + half) + ext(half - xmax);
  const l = (ymax - ymin) + ext(ymin + half) + ext(half - ymax);
  const caMin = Math.min(xmin + half, half - xmax, ymin + half, half - ymax);
  return { A: w * l, caMin };
}

// Resistencia nominal al desprendimiento del hormigón de un grupo traccionado (D-5)
function breakout(pts, hef, fc, half) {
  const n = pts.length;
  const Anco = 9 * hef * hef;
  const { A, caMin } = projectedArea(pts, hef, half);
  const Nb = 10 * Math.sqrt(fc) * hef ** 1.5;
  const psiEd = caMin >= 1.5 * hef ? 1 : 0.7 + 0.3 * caMin / (1.5 * hef);
  return { Ncbg: Math.min(A, n * Anco) / Anco * psiEd * Nb, Nb, caMin, ratio: Math.min(A, n * Anco) / Anco, psiEd };
}

// plate: { Np, Bp }, d (mm), nT (anclajes traccionados: 0, 2 o 4), T (N total), Hu (N), fc (MPa), footing: { B, L, h } (mm) o null
export function evalAnchorage({ Np, Bp, d, nT, T, Hu, fc, footing, hef }) {
  const ax = Np / 2 - 50;
  const ay = Bp / 2 - 50;
  const half = footing ? Math.min(footing.B, footing.L) / 2 : 1e9;
  const AseV = ase(d);
  const Ab = abrg(d);
  const futa = Math.min(ANCHOR_STEEL.futa, 1.9 * ANCHOR_STEEL.fya, 875);
  const res = { hef, d, nT, checks: [], rows: [] };
  const tens = nT === 4 ? [{ x: ax, y: ay }, { x: ax, y: -ay }, { x: -ax, y: ay }, { x: -ax, y: -ay }] : nT === 2 ? [{ x: ax, y: ay }, { x: ax, y: -ay }] : [];
  const front = [{ x: ax, y: ay }, { x: ax, y: -ay }];          // fila más cercana al borde en la dirección del corte
  // --- tracción
  let phiNn = Infinity;
  if (nT > 0) {
    const Nsa = nT * AseV * futa;
    const bo = breakout(tens, hef, fc, half);
    const Npn = 8 * Ab * fc;
    const ca1 = bo.caMin;
    const sRow = 2 * ay;                                          // separación de los dos anclajes de una fila (D-18)
    const Nsb = ca1 < 0.4 * hef ? 13.3 * ca1 * Math.sqrt(Ab) * Math.sqrt(fc) * Math.min(2, 1 + sRow / (6 * ca1)) : Infinity;
    const modes = [
      ['acero (D-3)', PHI.steelT * Nsa],
      ['desprendimiento del hormigón (D-5)', PHI.conc * bo.Ncbg],
      ['arrancamiento (D-14, D-15)', PHI.conc * nT * Npn],
      ...(Number.isFinite(Nsb) ? [['descascaramiento lateral (D-17)', PHI.conc * Nsb]] : []),
    ];
    const gov = modes.reduce((a, b) => (b[1] < a[1] ? b : a));
    phiNn = gov[1];
    res.tension = { modes, gov, Nua: T, phiNn, bo, Nsa, Npn };
    res.checks.push({ ok: T <= phiNn, label: 'Anclajes a tracción (Apéndice D)', text: `Nua = ${fmtN(T / 1000)} kN ≤ φNn = ${fmtN(phiNn / 1000)} kN (gobierna ${gov[0]}; ${modes.map((m) => `${m[0].split(' (')[0]} ${fmtN(m[1] / 1000, 0)}`).join(', ')} kN)` });
  }
  // --- corte (fila delantera)
  let phiVn = Infinity;
  if (Hu > 0) {
    const nF = front.length;
    const VsaMort = 0.8;
    const Vsa = nF * 0.6 * AseV * futa * VsaMort;
    const ca1 = half - ax;
    const ca2 = half - ay;
    const le = Math.min(hef, 8 * d);
    const Vb = 0.6 * (le / d) ** 0.2 * Math.sqrt(d) * Math.sqrt(fc) * Math.max(ca1, 0) ** 1.5;
    const AVco = 4.5 * ca1 * ca1;
    const ha = footing ? footing.h : 1e9;
    const dep = Math.min(1.5 * ca1, ha);
    const wid = 2 * ay + 2 * Math.min(1.5 * ca1, ca2);
    const AVc = Math.min(wid * dep, nF * AVco);
    const psiEdV = ca2 >= 1.5 * ca1 ? 1 : 0.7 + 0.3 * ca2 / (1.5 * ca1);
    const Vcbg = !footing ? Infinity : ca1 > 0 ? AVc / AVco * psiEdV * Vb : 0;      // sin datos de la base no se verifica el desprendimiento por corte
    const bo = breakout(front, hef, fc, half);
    const Vcpg = (hef >= 65 ? 2 : 1) * bo.Ncbg;
    const modes = [
      ['acero (D-20, con mortero 0,80)', PHI.steelV * Vsa],
      ...(Number.isFinite(Vcbg) ? [['desprendimiento por corte (D-22)', PHI.conc * Vcbg]] : []),
      ['arrancamiento por corte (D-30)', PHI.conc * Vcpg],
    ];
    const gov = modes.reduce((a, b) => (b[1] < a[1] ? b : a));
    phiVn = gov[1];
    res.shear = { modes, gov, Vua: Hu, phiVn, ca1, ca2 };
    res.checks.push({ ok: Hu <= phiVn, label: 'Anclajes al corte (Apéndice D)', text: `Vua = ${fmtN(Hu / 1000)} kN ≤ φVn = ${fmtN(phiVn / 1000)} kN (gobierna ${gov[0]}; ${modes.map((m) => `${m[0].split(' (')[0]} ${fmtN(m[1] / 1000, 0)}`).join(', ')} kN)` });
  }
  // --- interacción
  if (nT > 0 && Hu > 0 && Number.isFinite(phiNn) && Number.isFinite(phiVn)) {
    let ok; let txt;
    if (Hu <= 0.2 * phiVn) { ok = T <= phiNn; txt = `Vua ≤ 0,2 φVn: alcanza la verificación a tracción`; }
    else if (T <= 0.2 * phiNn) { ok = Hu <= phiVn; txt = `Nua ≤ 0,2 φNn: alcanza la verificación al corte`; }
    else { const q = T / phiNn + Hu / phiVn; ok = q <= 1.2; txt = `Nua/φNn + Vua/φVn = ${fmtN(q, 2)} ≤ 1,2 (D-31)`; }
    res.checks.push({ ok, label: 'Interacción tracción y corte', text: txt });
  }
  // --- separaciones y distancias al borde (D.8)
  const smin = Math.min(2 * ax, 2 * ay);
  const edge = footing ? half - ax : Infinity;
  res.checks.push({ ok: smin >= 6 * d, label: 'Separación entre anclajes', text: `${fmtN(smin, 0)} mm ≥ 6 do = ${6 * d} mm (anclajes con torque, D.8.1)` });
  if (footing) res.checks.push({ ok: edge >= 6 * d, label: 'Distancia al borde de la base', text: `${fmtN(edge, 0)} mm ≥ 6 do = ${6 * d} mm (D.8.2)` });
  res.ok = res.checks.every((c) => c.ok);
  return res;
}

// Busca el diámetro, la cantidad de anclajes traccionados y el empotramiento que verifican; devuelve la mejor solución (o la última intentada si ninguna verifica).
export function designAnchorage({ Np, Bp, d0 = 16, T, Hu, fc, footing, extra = null }) {
  const diam = [16, 20, 22, 24, 27, 30].filter((x) => x >= d0);
  const nTs = T > 0 ? [2, 4] : [0];
  const hMax = footing ? footing.h - 100 : 1000;
  let last = null;
  let minSol = null;
  for (const nT of nTs) {
    for (const d of diam) {
      const hef0 = Math.max(150, Math.ceil(8 * d / 25) * 25);
      for (let hef = hef0; hef <= 1000; hef += 25) {
        if (extra && !extra(d, nT)) break;                          // la condición solo depende del diámetro y de la cantidad de anclajes traccionados
        const r = evalAnchorage({ Np, Bp, d, nT, T, Hu, fc, footing, hef });
        last = r;
        if (!r.ok) continue;
        if (hef <= hMax) return { ...r, hMax, fits: true, hReq: hef + 100 };
        if (!minSol || hef < minSol.hef) minSol = r;
        break;
      }
    }
  }
  if (minSol) return { ...minSol, hMax, fits: false, hReq: minSol.hef + 100 };
  // sin solución: se muestra la situación con el mayor diámetro, todos los anclajes traccionados (si hay tracción) y el máximo empotramiento que admite la base
  const r = evalAnchorage({ Np, Bp, d: diam[diam.length - 1], nT: nTs[nTs.length - 1], T, Hu, fc, footing, hef: Math.max(150, Math.min(hMax, 1000)) });
  return { ...(r || last), hMax, fits: false, hReq: null };
}

export const anchorageNotes = ['Anclaje con bulones ISO 4.6 con tuerca y arandela de diámetro 2 do en el extremo; hormigón fisurado (ψc = 1,0); el corte lo toma la fila de anclajes más cercana al borde. No se verifican la armadura suplementaria ni el pedestal.'];
