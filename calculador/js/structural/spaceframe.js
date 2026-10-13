// Estereoestructura plana (retícula espacial de caños) para cubrir grandes luces.
// FUENTE: guía de predimensionado 5 "Estereoestructuras" del Taller de Estructuras E4 (curso 2024; carpeta e4).
// Método de la cátedra: la estereoestructura se asimila a una placa isótropa (a) apoyada sobre vigas y columnas o (b) apoyada directamente sobre columnas (como un entrepiso sin vigas).
// Cada franja del ancho de un módulo se resuelve como viga continua con los coeficientes de la Tabla 1 (Ca de apoyo, Ct de tramo, voladizo Ca = 2) y carga qm = 0,65 q Lm (qx = qy = 0,65 q si ly / lx ≥ 0,80);
// con placa sobre columnas los momentos se multiplican por 1,4 (apoyo) y 1,2 (tramo). Barras superiores e inferiores: C = T = M / H, caños de la Tabla G (DIN 2448), pandeo con ω (Sk = 0,7 L).
// Diagonales: Q' = Q Ld / (4 H). Flecha: α M Lt² / (E Jp) con α = 5/48 y Jp = 2 (J + A ((H − Φ) / 2)²), admisible Lt / 500. Columnas por el área de influencia y Estado 3 (peso propio + viento a presión).
// Unidades: m para las luces, kg/m² para las cargas; tensiones en kg/cm² y secciones en cm (como la guía).
import { TUBES_G } from './cables-data.js';
import * as S from './steel.js';
import * as W from './wind.js';

// Tabla 1 (coeficientes de empotramiento) según la cantidad de tramos: Ca en los apoyos intermedios, Ct en cada tramo
export const STRIP_COEF = {
  1: { sup: [], tr: [10] },
  2: { sup: [8], tr: [12, 12] },
  3: { sup: [9, 9], tr: [12, 18, 12] },
  4: { sup: [9, 10, 9], tr: [12, 18, 18, 12] },
};
export const MAX_SPANS = 4;

// Viga continua por franja: devuelve cada momento (kg·m) y las reacciones simples; f: factores de mayoración de apoyo y tramo (1 y 1, o 1,4 y 1,2 con placa sobre columnas)
export function stripMoments({ spans, cantL = 0, cantR = 0, qm, fSup = 1, fTr = 1 }) {
  const n = spans.length;
  const c = STRIP_COEF[n];
  if (!c) return { error: `La guía da coeficientes para 1 a ${MAX_SPANS} tramos continuos.` };
  const items = [];
  if (cantL > 0) items.push({ kind: 'cant', label: 'Voladizo izquierdo', L: cantL, coef: 2, M: fSup * qm * cantL ** 2 / 2, R: qm * cantL });
  spans.forEach((L, i) => {
    if (i > 0) items.push({ kind: 'sup', label: `Apoyo ${i + 1}`, L: Math.max(spans[i - 1], L), coef: c.sup[i - 1], M: fSup * qm * Math.max(spans[i - 1], L) ** 2 / c.sup[i - 1], R: 0 });
    items.push({ kind: 'tr', label: `Tramo ${i + 1}`, L, coef: c.tr[i], M: fTr * qm * L ** 2 / c.tr[i], R: qm * L / 2 });
  });
  if (cantR > 0) items.push({ kind: 'cant', label: 'Voladizo derecho', L: cantR, coef: 2, M: fSup * qm * cantR ** 2 / 2, R: qm * cantR });
  const max = (f) => items.filter(f).reduce((a, b) => Math.max(a, b.M), 0);
  return { items, Msup: max((x) => x.kind === 'sup' || x.kind === 'cant'), Mtr: max((x) => x.kind === 'tr'), Mmax: max(() => true), Rmax: items.reduce((a, b) => Math.max(a, b.R), 0) };
}

// Pandeo de un caño de la Tabla G: λ = Sk / i, ω de la tabla del acero y σ = ω C / Fe
export function tubeBuckling(tube, C, Sk, table = 'F-22') {
  const lambda = Sk / tube.i;
  const omega = S.omegaOf(lambda, table);
  return { lambda, omega, Sk, sigma: omega === null ? Infinity : omega * C / tube.A };
}

// El caño más liviano de la Tabla G que cubre la sección necesaria (T / σadm) y, si compite al pandeo, verifica ω C / Fe ≤ σadm con una esbeltez λ ≤ lambdaMax
// (criterio de proyecto: la guía no la fija, pero sus caños de diagonales quedan en λ ≈ 140; CIRSOC 301 admite hasta 200 en barras comprimidas). extra(tubo) permite exigir otras condiciones.
export function pickTube({ C, Sk, sigma = 1400, table = 'F-22', compress = true, minA = 0, lambdaMax = 150, extra = null }) {
  const Fnec = C / sigma;
  for (const t of [...TUBES_G].sort((x, y) => x.G - y.G || x.A - y.A)) {
    if (t.A < Fnec - 1e-9 || t.A < minA - 1e-9) continue;
    const b = compress ? tubeBuckling(t, C, Sk, table) : { lambda: Sk / t.i, omega: 1, Sk, sigma: C / t.A };
    if (b.sigma > sigma + 1e-9 || (compress && b.lambda > lambdaMax + 1e-9)) continue;
    if (extra && !extra(t, b)) continue;
    return { tube: t, Fnec, ...b };
  }
  return { tube: null, Fnec };
}

const tubeName = (t) => (t ? `ø ${t.de} × ${t.s} mm` : '—');
export { tubeName };

// Viento sobre la cubierta con la simplificación de la guía: Cp = ±0,8 en toda la superficie y GCpi = ±0,18; p = qh (G Cp + GCpi) en kg/m², redondeado al kg/m²
export function windOnRoof({ V, exposure = 'B', z = 7.5, Kzt = 1, Kd = 0.85, I = 1, G = 0.85, Cp = 0.8, GCpi = 0.18 }) {
  const Kz = W.kzOf(z, exposure, 2);
  const q = W.dynamicPressure({ V, Kz, Kzt, Kd, I });
  return { Kz, q, p: Math.round(q * (G * Cp + GCpi)) };
}

const ZONE_WIDTHS = (spans, cL, cR) => spans.length + 1 > 0 ? Array.from({ length: spans.length + 1 }, (_, j) => (j > 0 ? spans[j - 1] / 2 : cL) + (j < spans.length ? spans[j] / 2 : cR)) : [];

// p: ver el módulo de la vista (todos los campos tienen valores por defecto del ejemplo de la guía)
export function designSpaceFrame(p) {
  const xs = p.xSpans.map(Number); const ys = p.ySpans.map(Number);
  const xcL = Number(p.xCantL) || 0; const xcR = Number(p.xCantR) || 0; const ycL = Number(p.yCantL) || 0; const ycR = Number(p.yCantR) || 0;
  if (xs.length > MAX_SPANS || ys.length > MAX_SPANS) return { error: `La guía da coeficientes para 1 a ${MAX_SPANS} tramos continuos en cada dirección.` };
  const sigma = Number(p.sigma) || 1400; const E = Number(p.E) || 2100000; const table = p.omegaTable || 'F-22';
  const Lt = Math.max(...xs, ...ys); const Lv = Math.max(xcL, xcR, ycL, ycR);
  const Hmin = Math.max(Lt / 18, Lv / 9); const LmMin = Math.SQRT2 * Hmin;
  const Lm = Number(p.Lm);
  const H = Number(p.H) > 0 ? Number(p.H) : Lm / Math.SQRT2;
  const Ld = Math.sqrt(H * H + Lm * Lm / 2);
  const Hc = H * 100; const Lmc = Lm * 100; const Ldc = Ld * 100;
  // cargas y estados
  const wnd = Number(p.windManual) > 0 ? { p: Number(p.windManual), manual: true } : windOnRoof({ V: Number(p.V), exposure: p.exposure, z: Number(p.zWind), Kzt: Number(p.Kzt), Kd: Number(p.Kd), I: Number(p.I), G: Number(p.G) });
  const pp = Number(p.pp); const sc = Number(p.sc); const pw = wnd.p;
  const states = [{ id: 'E1', label: 'Peso propio', q: pp }, { id: 'E2', label: 'Peso propio + sobrecarga', q: pp + sc }, { id: 'E3', label: 'Peso propio + viento (presión)', q: pp + pw }, { id: 'E4', label: 'Peso propio − viento (succión)', q: pp - pw }];
  const qDes = Math.max(pp + sc, pp + pw);
  const qm = 0.65 * qDes * Lm;
  const ratio = Math.min(Math.max(...xs), Math.max(...ys)) / Math.max(Math.max(...xs), Math.max(...ys));
  const cols = p.hyp === 'columns';
  const fs = cols ? { fSup: 1.4, fTr: 1.2 } : { fSup: 1, fTr: 1 };
  const stripX = stripMoments({ spans: xs, cantL: xcL, cantR: xcR, qm, ...fs });
  const stripY = stripMoments({ spans: ys, cantL: ycL, cantR: ycR, qm, ...fs });
  const Mplate = Math.max(stripX.Mmax, stripY.Mmax);                           // kg·m
  const MtrPlate = Math.max(stripX.Mtr, stripY.Mtr);
  const Qplate = Math.max(stripX.Rmax, stripY.Rmax);
  const res = { hyp: cols ? 'columns' : 'beams', xs, ys, xcL, xcR, ycL, ycR, Lt, Lv, Hmin, LmMin, Lm, H, Ld, wind: wnd, states, qDes, qm, ratio, stripX, stripY, Mplate, MtrPlate, Qplate, sigma, E, table, checks: [], advice: [] };
  const SkC = 0.7 * Lmc; const SkD = 0.7 * Ldc;
  const lambdaMax = Number(p.lambdaMax) || 150;
  const qcIn = Number(p.qc) || 0; const flechaRatio = Number(p.flechaRatio) || 500;
  const MtrTube = (MtrPlate / H);
  const plateOk = (t, b) => {                                                   // la misma barra cumple la flexocompresión entre nudos y la flecha de la placa
    if (qcIn > 0 && b.omega * MtrTube / t.A + qcIn * Lmc ** 2 / 8 / t.W > sigma + 1e-9) return false;
    const Jp = 2 * (t.I + t.A * ((Hc - t.de / 10) / 2) ** 2);
    return 5 / 48 * (MtrPlate * 100) * (Lt * 100) ** 2 / (E * Jp) <= Lt * 100 / flechaRatio + 1e-9;
  };
  // barras superiores e inferiores de la placa
  const Cplate = Mplate / H;
  const chord = pickTube({ C: Cplate, Sk: SkC, sigma, table, lambdaMax, extra: plateOk });
  res.chord = { M: Mplate, C: Cplate, ...chord };
  // diagonales de la placa (hipótesis de vigas) o de las franjas
  const Qp = Qplate * Ld / (4 * H);
  res.diag = { Q: Qplate, Qp, ...pickTube({ C: Qp, Sk: SkD, sigma, table, lambdaMax }) };
  // flexocompresión del tubo entre nudos (si la cubierta apoya directamente sobre los tubos)
  const qc = qcIn;
  if (qc > 0 && chord.tube) {
    const Cm = MtrPlate / H;
    const Mt = qc * Lmc ** 2 / 8;
    const bk = tubeBuckling(chord.tube, Cm, SkC, table);
    res.flex = { qc, M: Mt, C: Cm, comp: bk.omega * Cm / chord.tube.A, compNoOmega: Cm / chord.tube.A, bend: Mt / chord.tube.W, sigma: bk.omega * Cm / chord.tube.A + Mt / chord.tube.W, omega: bk.omega, lambda: bk.lambda };
  }
  // flecha de la placa
  if (chord.tube) {
    const t = chord.tube;
    const Jp = 2 * (t.I + t.A * ((Hc - t.de / 10) / 2) ** 2);
    const Ltc = Lt * 100;
    const fl = 5 / 48 * (MtrPlate * 100) * Ltc ** 2 / (E * Jp);
    res.defl = { alpha: 5 / 48, M: MtrPlate * 100, L: Ltc, Jp, f: fl, fAdm: Ltc / flechaRatio };
  }
  // áreas de influencia de las columnas
  const wX = ZONE_WIDTHS(xs, xcL, xcR); const wY = ZONE_WIDTHS(ys, ycL, ycR);
  const Acol = Math.max(...wX) * Math.max(...wY);
  res.Acol = Acol;
  if (!cols) {
    // vigas de apoyo: cada línea de columnas recibe el ancho de influencia que le toca
    const lines = (dir) => {
      const spans = dir === 'x' ? xs : ys; const cL = dir === 'x' ? xcL : ycL; const cR = dir === 'x' ? xcR : ycR; const widths = dir === 'x' ? wY : wX;
      return widths.map((w, j) => ({ j, w, qb: qDes * w, ...stripMoments({ spans, cantL: cL, cantR: cR, qm: qDes * w }) }));
    };
    const lx = lines('x'); const ly = lines('y');
    const dirMax = (ls, k) => Math.max(...ls.map((l) => l[k]));
    const MsupX = dirMax(lx, 'Msup'); const MsupY = dirMax(ly, 'Msup');
    const MtrB = Math.max(dirMax(lx, 'Mtr'), dirMax(ly, 'Mtr'));
    const MsupRule = MsupX > 0 && MsupY > 0 ? Math.min(MsupX, MsupY) : Math.max(MsupX, MsupY);
    const Mdes = Math.max(MsupRule, MtrB);
    const Rb = Math.max(dirMax(lx, 'Rmax'), dirMax(ly, 'Rmax'));
    const Cb = Mdes / H;
    const bchord = pickTube({ C: Cb, Sk: SkC, sigma, table, lambdaMax });
    const Qb = Rb * Ld / (4 * H);
    res.beams = { lines: { x: lx, y: ly }, MsupX, MsupY, MsupRule, Mtr: MtrB, Mdes, R: Rb, C: Cb, chord: bchord, Qp: Qb, diag: pickTube({ C: Qb, Sk: SkD, sigma, table, lambdaMax }) };
  } else {
    // capitel sobre la columna más cargada y diagonales de la estereoestructura que reciben Q / 4 en cada nudo
    const Qc = qDes * Acol;
    const Qcp = Qc * Ld / (4 * H);
    const Qq = Qc / 4;
    const Qqp = Qq * Ld / (4 * H);
    res.capitel = { Q: Qc, Qp: Qcp, ...pickTube({ C: Qcp, Sk: SkD, sigma, table, lambdaMax }) };
    res.capDiag = { Q: Qq, Qp: Qqp, ...pickTube({ C: Qqp, Sk: SkD, sigma, table, lambdaMax }) };
  }
  // columnas (Estado 3, y Estado 4 para la fundación)
  const N3 = Acol * qDes; const N4 = Acol * (pp - pw);
  const h = Number(p.colH) * 100;
  const refTube = res.beams ? res.beams.chord.tube : chord.tube;
  let colTube = null; let colB = null;
  if (p.colSame !== false && refTube) { const b = tubeBuckling(refTube, N3, h, table); if (refTube.A >= N3 / sigma - 1e-9 && b.sigma <= sigma + 1e-9) { colTube = refTube; colB = b; } }
  let colSame = Boolean(colTube);
  if (!colTube) { const pk = pickTube({ C: N3, Sk: h, sigma, table, lambdaMax: 200 }); colTube = pk.tube; colB = pk; colSame = false; }
  res.col = { N3, N4, A: Acol, h, tube: colTube, same: colSame, Fnec: N3 / sigma, ...(colB || {}) };
  // base de hormigón armado (Estado 4: la columna tiene una solicitación ascendente)
  const sigS = Number(p.soilSigma) || 2.5;
  const S0 = N3 / sigS;
  const a = Math.ceil(Math.sqrt(S0) / 5) * 5;                                   // cm, múltiplo de 5
  const c = Number(p.plateC) || 20; const b = Number(p.baseThick) || 20;
  const d = Math.max(0, (a - c) / 2);
  const Vb = (a * a * b + d / 3 * (a * a + c * c + a * c)) / 1e6;               // m³ (zapata con tronco de pirámide a 45°)
  res.base = { S: S0, a, c, b, d, V: Vb, weight: Vb * 2400, uplift: Math.max(0, -N4), anchored: Boolean(p.anchored) };

  // ---- verificaciones
  const f0 = (v, n = 0) => Number(v).toFixed(n);
  res.checks.push({ ok: ratio >= 0.8 - 1e-9, label: 'Hipótesis de la guía: relación de luces', text: `ly / lx = ${f0(ratio, 2)} ≥ 0,80 (qx = qy = 0,65 q). Si no se cumple hay que repartir la carga con tablas de losas cruzadas (Loser), que la guía no incluye.` });
  const t1 = chord.tube;
  res.checks.push(t1 ? { ok: true, label: cols ? 'Barras de la placa sobre columnas' : 'Barras superiores e inferiores de la placa', text: `M máx = ${f0(Mplate)} kg·m → C = T = M / H = ${f0(Cplate)} kg; Fe nec = ${f0(chord.Fnec, 2)} cm² → ${tubeName(t1)} (Fe = ${f0(t1.A, 2)} cm²); pandeo: λ = ${f0(chord.lambda, 1)}, ω = ${chord.omega}, σ = ω C / Fe = ${f0(chord.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Barras de la placa', text: `No hay caño en la Tabla G que cubra Fe = ${f0(chord.Fnec, 2)} cm² y verifique el pandeo con σadm = ${sigma} kg/cm²: aumentar la altura o achicar la luz del módulo.` });
  const t2 = res.diag.tube;
  res.checks.push(t2 ? { ok: true, label: 'Diagonales de la placa', text: `Q = ${f0(Qplate)} kg → Q' = Q Ld / (4 H) = ${f0(Qp)} kg; ${tubeName(t2)} (Fe = ${f0(t2.A, 2)} cm²); λ = ${f0(res.diag.lambda, 1)}, ω = ${res.diag.omega}, σ = ${f0(res.diag.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Diagonales de la placa', text: `Ningún caño de la Tabla G verifica Q' = ${f0(Qp)} kg al pandeo.` });
  if (res.flex) res.checks.push({ ok: res.flex.sigma <= sigma + 1e-9, label: 'Flexocompresión del tubo entre nudos', text: `ω C / Fe + M / W = ${f0(res.flex.comp)} + ${f0(res.flex.bend)} = ${f0(res.flex.sigma)} ≤ ${sigma} kg/cm² (M = qc Lm² / 8 = ${f0(res.flex.M)} kg·cm con qc = ${res.flex.qc} kg/cm; la tabla de la guía suma C / Fe sin ω)` });
  if (res.defl) res.checks.push({ ok: res.defl.f <= res.defl.fAdm + 1e-9, label: 'Flecha de la placa', text: `f = α M Lt² / (E Jp) = ${f0(res.defl.f, 2)} cm ≤ Lt / ${Number(p.flechaRatio) || 500} = ${f0(res.defl.fAdm, 1)} cm (Jp = ${f0(res.defl.Jp)} cm⁴, M = ${f0(res.defl.M)} kg·cm)` });
  if (res.beams) {
    const bb = res.beams;
    res.checks.push(bb.chord.tube ? { ok: true, label: 'Barras de las vigas de apoyo', text: `M = ${f0(bb.Mdes)} kg·m (apoyo común: el menor entre las dos direcciones, ${f0(bb.MsupX)} y ${f0(bb.MsupY)}) → C = T = ${f0(bb.C)} kg; ${tubeName(bb.chord.tube)} (Fe = ${f0(bb.chord.tube.A, 2)} cm²); ω = ${bb.chord.omega}, σ = ${f0(bb.chord.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Barras de las vigas de apoyo', text: `Ningún caño de la Tabla G cubre C = ${f0(bb.C)} kg con pandeo.` });
    res.checks.push(bb.diag.tube ? { ok: true, label: 'Diagonales de las vigas de apoyo', text: `Q = ${f0(bb.R)} kg → Q' = ${f0(bb.Qp)} kg; ${tubeName(bb.diag.tube)} (Fe = ${f0(bb.diag.tube.A, 2)} cm²); ω = ${bb.diag.omega}, σ = ${f0(bb.diag.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Diagonales de las vigas de apoyo', text: `Ningún caño de la Tabla G verifica Q' = ${f0(bb.Qp)} kg.` });
  } else {
    res.checks.push(res.capitel.tube ? { ok: true, label: 'Capitel sobre la columna', text: `Q = q A = ${f0(qDes)} × ${f0(Acol)} = ${f0(res.capitel.Q)} kg → Q' = ${f0(res.capitel.Qp)} kg por diagonal; ${tubeName(res.capitel.tube)} (Fe = ${f0(res.capitel.tube.A, 2)} cm²); ω = ${res.capitel.omega}, σ = ${f0(res.capitel.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Capitel sobre la columna', text: `Ningún caño de la Tabla G verifica Q' = ${f0(Qcp)} kg.` });
    res.checks.push(res.capDiag.tube ? { ok: true, label: 'Diagonales de la estereoestructura sobre el capitel', text: `Q / 4 = ${f0(res.capDiag.Q)} kg en cada nudo → Q' = ${f0(res.capDiag.Qp)} kg; ${tubeName(res.capDiag.tube)} (Fe = ${f0(res.capDiag.tube.A, 2)} cm²); ω = ${res.capDiag.omega}, σ = ${f0(res.capDiag.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Diagonales sobre el capitel', text: `Ningún caño de la Tabla G verifica Q' = ${f0(res.capDiag.Qp)} kg.` });
  }
  res.checks.push(res.col.tube && res.col.sigma <= sigma + 1e-9 ? { ok: true, label: 'Columna (Estado 3)', text: `N = q A = ${f0(qDes)} × ${f0(Acol)} = ${f0(N3)} kg; Fe nec = ${f0(N3 / sigma, 2)} cm² → ${tubeName(res.col.tube)} (Fe = ${f0(res.col.tube.A, 2)} cm²)${res.col.same ? ', igual a las barras de las vigas como adopta la guía' : ''}; h = ${f0(h)} cm (Sk = h): λ = ${f0(res.col.lambda, 1)}, ω = ${res.col.omega}, σ = ${f0(res.col.sigma)} ≤ ${sigma} kg/cm²` } : { ok: false, label: 'Columna (Estado 3)', text: `Ningún caño de la Tabla G verifica N = ${f0(N3)} kg al pandeo con h = ${f0(h)} cm.` });
  const bs = res.base;
  res.checks.push({ ok: bs.anchored || bs.weight >= bs.uplift - 1e-9, label: 'Estado 4: succión sobre la base', text: bs.uplift <= 0 ? 'La columna no tiene solicitación ascendente.' : bs.anchored ? `La columna tiene una solicitación ascendente de ${f0(bs.uplift)} kg: se proyecta un apoyo que absorbe tracción (base vinculada a otros elementos o con contrapeso).` : `La columna tiene una solicitación ascendente de ${f0(bs.uplift)} kg y el peso muerto de la base (${f0(bs.a)} × ${f0(bs.a)} cm, ${f0(bs.weight)} kg) no la equilibra: hay que diseñar un apoyo vinculado a otros elementos que incrementen su peso o una base que absorba esfuerzos de tracción (se tilda en el paso 3).` });
  if (Lm < LmMin - 1e-9) res.advice.push(`El módulo Lm = ${f0(Lm, 2)} m es menor que √2 H mín = ${f0(LmMin, 2)} m (H ≥ luz / 18 = ${f0(Lt / 18, 2)} m y H ≥ voladizo / 9 = ${f0(Lv / 9, 2)} m).`);
  if (H < Hmin - 1e-9) res.advice.push(`La altura H = ${f0(H, 2)} m es menor que la mínima ${f0(Hmin, 2)} m (luz del tramo / 18 y voladizo / 9).`);
  if (Lm < 1.5 * H - 1e-9 || Lm > 2.5 * H + 1e-9) res.advice.push(`La relación Lm / H = ${f0(Lm / H, 2)} está fuera del rango 1,5 a 2,5 de la guía (con Lm = √2 H, como adopta el ejemplo, da 1,41).`);
  res.ok = res.checks.every((c) => c.ok);
  return res;
}
