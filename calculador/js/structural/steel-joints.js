// Uniones de estructuras de acero: soldaduras de filete, bulones, chapas de nudo, placas base con bulones de anclaje y uniones soldadas viga-columna.
// FUENTE: Proyecto de Reglamento CIRSOC 301/2017 (INTI), Cap. J, Cap. L, método de estados límites (LRFD). Los apuntes de la cátedra (e3) no desarrollan uniones.
//   - Soldaduras de filete (J.2.2, Tabla J.2-5): φ = 0,60, Fnw = 0,60 FEXX, área efectiva = 0,707 · lado · longitud. Lado mínimo Tabla J.2-4
//     (3, 5, 6, 8 mm según el espesor de la parte más gruesa); lado máximo J.2.2(b); longitud mínima 4 veces el lado; β de la ec. (J.2-1).
//   - Bulones (J.3, Tabla J.3-2): φ = 0,75; Fnt y Fnv de la tabla; separación mínima 3 d (J.3.3); distancia al borde de la Tabla J.3-4;
//     aplastamiento Rn = 1,2 Lc t Fu ≤ 2,4 d t Fu (J.3.10, ec. J.3-6a); tracción y corte combinados F'nt = 1,3 Fnt − (Fnt / φ Fnv) fv ≤ Fnt (ec. J.3-3).
//   - Rotura de la sección neta (J.4.1): φ = 0,75, Rn = Fu Ae; fluencia φ = 0,90, Rn = Fy Ag.
//   - Soldadura a tope de penetración completa: φ = 0,90 Fy (Tabla J.2-5).
//   - Aplastamiento del hormigón (CIRSOC 201 art. 10.17.1): φ = 0,65, 0,85 f'c A1 √(A2/A1) ≤ 1,7 f'c A1. Espesor de placa base: método de Fisher y Kloiber (AISC DG1),
//     tp = l √(2 Pu / (0,9 Fy B N)). Chapa de nudo: ancho de Whitmore a 30°.
//   - El método de las uniones es de resistencia: las fuerzas de servicio del cálculo elástico (σ ≤ σadm) se mayoran con un coeficiente medio (1,5 por defecto).
// Valores que NO salen del reglamento y son datos del usuario: Fu del acero de las chapas (340 MPa por defecto, del lado seguro) y FEXX del electrodo (clasificación AWS A5.1:
// E60 = 414 MPa y E70 = 482 MPa). Unidades: N, mm, MPa (las funciones de entrada reciben kg y cm de la app).
import * as S from './steel.js';
import { designAnchorage, anchorageNotes } from './steel-anchors.js';

const KG = 9.80665;
export const PHI = { weld: 0.6, bolt: 0.75, yield: 0.9, rupture: 0.75, cjp: 0.9, concrete: 0.65 };
export const ELECTRODES = { E60: { label: 'E-60XX (FEXX = 414 MPa)', FEXX: 414 }, E70: { label: 'E-70XX (FEXX = 482 MPa)', FEXX: 482 } };
export const BOLT_TYPES = {
  A307: { label: 'A307 / ISO 4.6 (común)', Fnt: 260, Fnv: 140, threaded: true },
  A325N: { label: 'A325 / ISO 8.8, rosca incluida en el plano de corte', Fnt: 620, Fnv: 330, threaded: true },
  A325X: { label: 'A325 / ISO 8.8, rosca excluida del plano de corte', Fnt: 620, Fnv: 415, threaded: false },
  A490N: { label: 'A490 / ISO 10.9, rosca incluida', Fnt: 778, Fnv: 414, threaded: true },
  A490X: { label: 'A490 / ISO 10.9, rosca excluida', Fnt: 778, Fnv: 517, threaded: false },
};
export const BOLT_DIAMETERS = [12, 16, 20, 22, 24, 27, 30];
const WELD_SIZES = [3, 4, 5, 6, 8, 10, 12, 16];
const PLATE_T = [6, 8, 10, 12, 16, 20, 25, 32];
const BASE_PLATE_T = [10, 12, 16, 20, 25, 32, 40, 50];                           // espesores comerciales de la placa base
// Tabla J.3-4: distancia mínima del centro del agujero al borde de perfiles y chapas laminados (mm)
const EDGE_ROLLED = { 6: 10, 7: 11, 8: 12, 10: 14, 12: 16, 14: 18, 16: 22, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38 };
export const edgeMin = (d) => EDGE_ROLLED[d] ?? 1.25 * d;
const holeDia = (d) => (d <= 22 ? d + 2 : d <= 24 ? d + 2 : d + 3);          // agujero normal (Tabla J.3-3: d + 2 hasta 24 mm, d + 3 mayores)
export const boltArea = (d) => Math.PI * d * d / 4;                          // mm²
export const JOINT_DEFAULTS = { mode: 'weld', electrode: 'E70', boltType: 'A325X', boltD: 20, Fu: 340, gamma: 1.5 };

export function jointOpts(calc) {
  const j = { ...JOINT_DEFAULTS, ...(calc.joints || {}) };
  j.Fu = Number(j.Fu) || JOINT_DEFAULTS.Fu;
  j.gamma = Number(j.gamma) || JOINT_DEFAULTS.gamma;
  j.boltD = Number(j.boltD) || JOINT_DEFAULTS.boltD;
  return j;
}
export const fyMPa = (grade) => (grade.fy || 2200) * 0.0980665;
export const toN = (kgf, gamma) => kgf * KG * gamma;                          // kg de servicio → N mayorados

// ---------------------------------------------------------------- rotura de bloque de corte (J.4.3, ec. J.4-5)
// φ Rn = φ (0,60 Fu Anv + Ubs Fu Ant) ≤ φ (0,60 Fy Agv + Ubs Fu Ant), φ = 0,75; áreas en mm², tensiones en MPa; Ubs = 1,0 con tensión uniforme (una fila de bulones) y 0,5 si no es uniforme.
export function blockShear({ Agv, Anv, Ant, Fy, Fu, Ubs = 1 }) {
  const a = 0.6 * Fu * Anv + Ubs * Fu * Ant;
  const b = 0.6 * Fy * Agv + Ubs * Fu * Ant;
  return PHI.rupture * Math.min(a, b);
}
// Bloque de una fila de n bulones: corte a lo largo de la fila (distancia al extremo e1 y separación s) y tracción hasta el borde libre (distancia lt entre el eje de bulones y el borde)
export function rowBlockShear({ n, d, s, e1, lt, t, Fy, Fu }) {
  const dh = holeDia(d);
  const Lv = e1 + (n - 1) * s;
  const Agv = Lv * t;
  const Anv = (Lv - (n - 0.5) * dh) * t;
  const Ant = Math.max(0, lt - dh / 2) * t;
  return { R: blockShear({ Agv, Anv, Ant, Fy, Fu }), Agv, Anv, Ant, Lv };
}

// ---------------------------------------------------------------- soldaduras de filete
export const weldMinSize = (tThick) => (tThick <= 6 ? 3 : tThick <= 13 ? 5 : tThick <= 19 ? 6 : 8);         // Tabla J.2-4 (tThick en mm: espesor de la parte más gruesa)
export const weldMaxSize = (tThin) => (tThin < 6 ? tThin : tThin - 2);                                       // J.2.2(b) en bordes de material
export const weldPerMm = (w, FEXX) => PHI.weld * 0.6 * FEXX * 0.707 * w;                                     // resistencia de diseño por mm de longitud (N/mm)
export const weldBeta = (L, w) => (L <= 100 * w ? 1 : L <= 300 * w ? Math.min(1, 1.2 - 0.002 * L / w) : 180 * w / L);   // ec. (J.2-1) (cociente Le / L)

// Elige el lado del filete y la longitud para transmitir una fuerza P (N) con un cordón: el lado más chico ≥ mínimo con el que la longitud no pasa de maxLen.
function weldFor(P, tThick, tThin, FEXX, maxLen) {
  const wmin = weldMinSize(tThick);
  const wmax = Math.max(wmin, weldMaxSize(tThin));
  const sizes = WELD_SIZES.filter((w) => w >= wmin && w <= wmax);
  const list = sizes.length ? sizes : [wmin];
  let best = null;
  for (const w of list) {
    const need = P / weldPerMm(w, FEXX);
    const L = Math.max(Math.ceil(need / 10) * 10, 4 * w);
    best = { w, L, need };
    if (L <= maxLen) break;
  }
  best.beta = weldBeta(best.L, best.w);
  return best;
}

// ---------------------------------------------------------------- unión de una barra de cercha a la chapa de nudo
// bar: { profile, mult (1 | 2 ángulos), P (kg de servicio, esfuerzo gobernante), kind: 'T' | 'C' }; j: opciones de uniones; fy (MPa)
export function designBarJoint({ profile, mult, P, kind, j, fy, label }) {
  const Pu = toN(P, j.gamma);
  const out = { label, P, Pu, kind, mode: j.mode, rows: [], checks: [], ok: true, notes: [] };
  const isAngle = profile.t === 'L';
  const t = isAngle ? profile.tw : (profile.e || profile.tw || 8);
  const b = isAngle ? profile.b : (profile.b || profile.h || 40);
  const per = Pu / (isAngle ? mult : 1);                                       // fuerza por perfil
  // chapa de nudo: espesor por fluencia en la sección de Whitmore
  const gusset = (L) => {
    const lw = b + 2 * L * Math.tan(Math.PI / 6);
    for (const tg of PLATE_T) {
      if (tg < Math.max(6, t)) continue;
      if (PHI.yield * fy * tg * lw >= Pu) return { t: tg, lw };
    }
    return { t: PLATE_T[PLATE_T.length - 1], lw, fail: true };
  };
  if (!isAngle) {
    // otros perfiles (U, doble T, tubos, barras): solo la longitud total de cordón necesaria
    const FEXX = ELECTRODES[j.electrode].FEXX;
    const tThick = Math.max(t, 6);
    const wsz = weldMinSize(tThick);
    const L = Pu / weldPerMm(wsz, FEXX);
    out.rows.push({ k: 'Soldadura de filete (perfil sin detalle automático)', v: `lado ${wsz} mm: longitud total necesaria ≈ ${Math.ceil(L / 10) * 10} mm repartida en el contorno de la barra` });
    out.notes.push('Para este tipo de perfil la app informa la longitud total de cordón necesaria; el detalle (cordones en alas, alma o contorno del tubo) queda a cargo del proyectista.');
    out.gusset = gusset(L / 2);
    return out;
  }
  const ex = profile.ex * 10;                                                   // cm → mm
  if (j.mode === 'weld') {
    const FEXX = ELECTRODES[j.electrode].FEXX;
    const gs = { t: 8 };                                                        // se prueba con la chapa de 8 mm y se corrige después
    const Ftoe = per * ex / b;
    const Fheel = per - Ftoe;
    const thick = Math.max(t, gs.t);
    const wToe = weldFor(Ftoe, thick, t, FEXX, 4 * b);
    // se usa el mismo lado en los dos cordones del perfil
    const w = wToe.w;
    const cap = weldPerMm(w, FEXX);
    const Lt = Math.max(Math.ceil(Ftoe / cap / 10) * 10, 4 * w);
    const Lh = Math.max(Math.ceil(Fheel / cap / 10) * 10, 4 * w);
    const gg = gusset(Math.max(Lt, Lh));
    const wFinal = weldFor(Fheel, Math.max(t, gg.t), t, FEXX, 4 * b);
    const w2 = Math.max(w, wFinal.w);
    const cap2 = weldPerMm(w2, FEXX);
    const Lt2 = Math.max(Math.ceil(Ftoe / cap2 / 10) * 10, 4 * w2);
    const Lh2 = Math.max(Math.ceil(Fheel / cap2 / 10) * 10, 4 * w2);
    out.rows.push({ k: `Soldadura de filete (${j.electrode}), por ${isAngle && mult === 2 ? 'cada ángulo' : 'ángulo'}`, v: `lado ${w2} mm; cordón del canto del ala (de la punta) ${Lt2} mm y del lado del talón ${Lh2} mm` });
    out.rows.push({ k: 'Fuerza en cada cordón (excentricidad del baricentro ex = ' + fmtN(ex, 1) + ' mm)', v: `punta ${fmtN(Ftoe / 1000, 1)} kN · talón ${fmtN(Fheel / 1000, 1)} kN (φRn = ${fmtN(cap2, 2)} N/mm)` });
    out.weld = { w: w2, Lt: Lt2, Lh: Lh2, FEXX };
    out.checks.push({ ok: Lt2 <= 100 * w2 && Lh2 <= 100 * w2, label: 'Longitud efectiva (β = 1)', text: `L ≤ 100 w = ${100 * w2} mm (ec. J.2-1)` });
    out.gusset = gusset(Math.max(Lt2, Lh2));
  } else {
    const bt = BOLT_TYPES[j.boltType];
    const d = j.boltD;
    const Ab = boltArea(d);
    const tg = 8;
    const tmin = Math.min(t, tg);
    const edge = Math.max(edgeMin(d), 1.5 * d);
    const Lc = edge - holeDia(d) / 2;
    const bearing = PHI.bolt * Math.min(1.2 * Lc * tmin * j.Fu, 2.4 * d * tmin * j.Fu);
    const shear = PHI.bolt * bt.Fnv * Ab;                                       // un plano de corte (el ángulo apoya sobre la chapa)
    const Rb = Math.min(shear, bearing);
    let n = Math.max(2, Math.ceil(per / Rb));
    // la fila de bulones va en el eje del ala (g = b / 2): distancia al borde libre (canto del ala) = b / 2
    const lt = b / 2;
    const s3 = 3 * d;
    // rotura de la sección neta del ángulo (tracción): U = 0,80 con 4 o más bulones en línea, 0,60 con 2 o 3 (factor de rezago de cortante) y rotura de bloque de corte (J.4.3)
    let ok = true;
    let netTxt = '';
    let bsTxt = '';
    let okBs = true;
    if (kind === 'T') {
      for (; n <= 10; n++) {
        const An = profile.A * 100 - holeDia(d) * t;
        const U = n >= 4 ? 0.8 : 0.6;
        const Rnet = PHI.rupture * j.Fu * U * An;
        const bs = rowBlockShear({ n, d, s: s3, e1: edge, lt, t, Fy: fy, Fu: j.Fu });
        ok = Rnet >= per;
        okBs = bs.R >= per;
        netTxt = `rotura de la sección neta: φ Fu U An = ${fmtN(Rnet / 1000, 1)} kN ≥ ${fmtN(per / 1000, 1)} kN (U = ${U})`;
        bsTxt = `φ Rn = ${fmtN(bs.R / 1000, 1)} kN ≥ ${fmtN(per / 1000, 1)} kN (Agv = ${fmtN(bs.Agv, 0)}, Anv = ${fmtN(bs.Anv, 0)}, Ant = ${fmtN(bs.Ant, 0)} mm²; Ubs = 1)`;
        if (ok && okBs) break;
      }
      if (!(ok && okBs)) { n = 10; netTxt += ' — el ángulo es chico para abulonar este esfuerzo: usar soldadura o un perfil mayor'; }
      out.checks.push({ ok, label: 'Sección neta del ángulo', text: netTxt });
      out.checks.push({ ok: okBs, label: 'Bloque de corte del ángulo (J.4.3)', text: bsTxt });
      const dFit = [...BOLT_DIAMETERS].reverse().find((x) => lt >= Math.max(edgeMin(x), 1.5 * x));
      out.checks.push({ ok: lt >= edge, label: 'Bulón dentro del ala', text: `distancia del eje de bulones al canto del ala b/2 = ${fmtN(lt, 0)} mm ≥ ${fmtN(edge, 0)} mm (Tabla J.3-4)${lt >= edge ? '' : dFit ? ` — con este ángulo entra como máximo un bulón ø${dFit} mm` : ' — el ala es muy chica para abulonar'}` });
    }
    out.rows.push({ k: `Bulones ${j.boltType.replace('N', '').replace('X', '')} ø${d} mm por ángulo (una fila)`, v: `${n} bulones · φRn por bulón = ${fmtN(Rb / 1000, 1)} kN (corte ${fmtN(shear / 1000, 1)}, aplastamiento ${fmtN(bearing / 1000, 1)})` });
    out.rows.push({ k: 'Separación entre bulones ≥ 3 d · distancia al borde ≥', v: `${3 * d} mm · ${fmtN(edge, 0)} mm (Tabla J.3-4)` });
    out.bolts = { n, d, Rb, spacing: 3 * d, edge };
    out.notes.push('Bloque de corte verificado en el ángulo (fila de bulones en el eje del ala). El de la chapa de nudo depende de la disposición de los bulones de cada barra y de los bordes de la chapa y no se calcula.');
    out.gusset = gusset((n - 1) * 3 * d + edge);
  }
  out.rows.push({ k: 'Chapa de nudo (ancho de Whitmore a 30°)', v: `espesor ${out.gusset.t} mm por fluencia (ancho efectivo ${fmtN(out.gusset.lw, 0)} mm)${out.gusset.fail ? ' — NO alcanza con 32 mm' : ''}` });
  out.ok = out.checks.every((c) => c.ok) && !out.gusset.fail;
  return out;
}

// Esfuerzo gobernante de cada familia de barras de una cercha (tracción o compresión, el mayor) y uniones correspondientes.
export function designTrussJoints(truss, j, grade) {
  const fy = fyMPa(grade);
  const out = [];
  Object.values(truss.families).forEach((f) => {
    if (!f.profile) return;
    const kind = f.Tmax >= f.Cmax ? 'T' : 'C';
    const P = Math.max(f.Tmax, f.Cmax);
    if (!(P > 0)) return;
    const worst = kind === 'T' ? f.bars.reduce((a, b) => (b.T > a.T ? b : a), f.bars[0]) : f.worstC;
    const r = designBarJoint({ profile: f.profile, mult: f.def.mult, P, kind, j, fy, label: `${f.label} (barra ${worst.a + 1}–${worst.b + 1}, ${kind === 'T' ? 'tracción' : 'compresión'})` });
    out.push(r);
  });
  return out;
}

// ---------------------------------------------------------------- unión de corte simple (apoyo de una correa o viga): reacción R (kg de servicio)
export function designShearJoint({ R, j, tMin, label, fy = 235, plateLike = true }) {
  const Ru = toN(R, j.gamma);
  const out = { label, P: R, Pu: Ru, rows: [], checks: [], notes: [], ok: true };
  if (j.mode === 'weld') {
    const FEXX = ELECTRODES[j.electrode].FEXX;
    const w = weldMinSize(tMin);
    const cap = weldPerMm(w, FEXX);
    const L = Math.max(Math.ceil(Ru / cap / 10) * 10, 4 * w);
    out.rows.push({ k: `Soldadura de filete (${j.electrode}) del alma o ángulo de unión`, v: `lado ${w} mm, longitud total ${L} mm (repartida en ambos lados)` });
    out.weld = { w, L };
  } else {
    const bt = BOLT_TYPES[j.boltType];
    const d = j.boltD;
    const Ab = boltArea(d);
    const edge = Math.max(edgeMin(d), 1.5 * d);
    const Lc = edge - holeDia(d) / 2;
    const bearing = PHI.bolt * Math.min(1.2 * Lc * tMin * j.Fu, 2.4 * d * tMin * j.Fu);
    const shear = PHI.bolt * bt.Fnv * Ab;
    const Rb = Math.min(shear, bearing);
    let n = Math.max(2, Math.ceil(Ru / Rb));
    // rotura de bloque de corte (J.4.3) de la chapa o el alma que recibe los bulones: fila vertical de n bulones y tracción hasta el borde libre (distancia mínima al borde)
    let bs = null;
    for (; n <= 10; n++) {
      bs = rowBlockShear({ n, d, s: 3 * d, e1: edge, lt: edge, t: tMin, Fy: fy, Fu: j.Fu });
      if (bs.R >= Ru) break;
    }
    const okBs = bs.R >= Ru;
    if (!okBs) n = 10;
    out.rows.push({ k: `Bulones ${j.boltType.replace('N', '').replace('X', '')} ø${d} mm (un plano de corte)`, v: `${n} bulones · φRn = ${fmtN(Rb / 1000, 1)} kN cada uno · separación ≥ ${3 * d} mm` });
    out.checks.push({ ok: okBs, label: 'Bloque de corte (J.4.3)', text: `φ Rn = ${fmtN(bs.R / 1000, 1)} kN ≥ ${fmtN(Ru / 1000, 1)} kN (chapa o alma de ${fmtN(tMin, 0)} mm; Agv = ${fmtN(bs.Agv, 0)}, Anv = ${fmtN(bs.Anv, 0)}, Ant = ${fmtN(bs.Ant, 0)} mm²; Ubs = 1, borde libre a ${fmtN(edge, 0)} mm)` });
    out.bolts = { n, d };
  }
  out.notes.push('No se verifican el momento de excentricidad del grupo ni los rebajes de las vigas.');
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

// ---------------------------------------------------------------- unión soldada rígida viga-columna (o de cumbrera): alas con soldadura de penetración completa y alma con filete
// M (kg·m), N (kg, + tracción), V (kg) de servicio; profile de la viga.
export function designWeldedMomentJoint({ M, N, V, profile, j, fy, label, col = null, Vcol = 0, Ncol = 0 }) {
  const Mu = toN(Math.abs(M) * 1000, j.gamma);              // N·mm
  const Nu = toN(N, j.gamma);
  const Vu = toN(Math.abs(V), j.gamma);
  const out = { label, rows: [], checks: [], notes: [], ok: true, M, N, V };
  const h = profile.h;
  const tf = profile.tf || profile.tw || profile.e || 8;
  const bf = profile.b || h;
  const tw = profile.tw || profile.e || 6;
  const Af = bf * tf;
  const arm = h - tf;
  const Tf = Mu / arm + Math.max(0, Nu) / 2;                                 // fuerza en el ala traccionada (el axil se reparte entre las dos alas)
  const Cf = Mu / arm + Math.max(0, -Nu) / 2;
  const Fmax = Math.max(Tf, Cf);
  const capF = PHI.cjp * fy * Af;
  out.rows.push({ k: 'Alas: soldadura de penetración completa (φ = 0,90 Fy)', v: `fuerza en el ala ${fmtN(Fmax / 1000, 0)} kN ≤ φ Fy Af = ${fmtN(capF / 1000, 0)} kN` });
  out.checks.push({ ok: Fmax <= capF, label: 'Alas soldadas', text: `${fmtN(Fmax / 1000, 0)} ≤ ${fmtN(capF / 1000, 0)} kN` });
  const FEXX = ELECTRODES[j.electrode].FEXX;
  const Lw = 2 * Math.max(0, h - 2 * tf);
  const w = weldMinSize(Math.max(tw, 6));
  const wmax = Math.max(w, weldMaxSize(tw));
  let ws = w;
  for (const cand of WELD_SIZES.filter((x) => x >= w && x <= wmax)) { ws = cand; if (Vu <= weldPerMm(cand, FEXX) * Lw) break; }
  const capW = weldPerMm(ws, FEXX) * Lw;
  out.rows.push({ k: `Alma: filete en ambos lados (${j.electrode})`, v: `lado ${ws} mm, longitud ${fmtN(Lw, 0)} mm: φRn = ${fmtN(capW / 1000, 0)} kN ≥ Vu = ${fmtN(Vu / 1000, 0)} kN` });
  out.checks.push({ ok: Vu <= capW, label: 'Alma soldada', text: `${fmtN(Vu / 1000, 0)} ≤ ${fmtN(capW / 1000, 0)} kN` });
  if (col) columnForces({ out, col, beam: { h, bf, tf }, Tf, Cf, Vcol: toN(Math.abs(Vcol), j.gamma), Ncol: toN(Ncol, j.gamma), fy });
  else out.notes.push('No se verifican el alma y las alas del miembro al que se une (rigidizadores, zona de panel).');
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

// ---------------------------------------------------------------- alas y almas de la columna con las fuerzas concentradas de las alas de la viga (J.10)
// J.10.1 flexión local del ala traccionada (φ 0,90; Rn = 6,25 tf² Fy), J.10.2 fluencia local del alma (φ 1,00; Rn = (2,5 k + N) Fyw tw cerca del extremo), J.10.3 pandeo localizado del alma (φ 0,75;
// ecs. J.10-5a y 5b), J.10.6 fluencia por corte del alma del panel nodal (φ 0,90; Rn = 0,60 Fy dc tw, con 1,4 − Pu/Py si Pu > 0,40 Py; sin considerar la deformación del panel en el análisis de estabilidad)
// y J.10.8 (rigidizadores: ancho ≥ bf/3 − tw/2, espesor ≥ tf/2 y b/t ≤ 0,56 √(E/Fy)). Las secciones de J.10 son para perfiles doble T: con otros perfiles no se aplican.
// Datos propios: la columna termina en el nudo (distancia al extremo ≤ d), así que se usan las expresiones de extremo y la reducción al 50 % de J.10.1; k = tf (sin radio de acuerdo: del lado seguro);
// N = espesor del ala de la viga; la fuerza de corte del panel es la de la cupla de la viga menos el corte de la columna.
const E_STEEL = 200000;                                                      // MPa (CIRSOC 301)
function columnForces({ out, col, beam, Tf, Cf, Vcol, Ncol, fy }) {
  if (!['IPN', 'IPE', 'HEB'].includes(col.t)) {
    out.notes.push('La verificación de alas y almas de la columna (J.10) se hace solo para columnas doble T (IPN, IPE, HEB).');
    return;
  }
  const dc = col.h; const bc = col.b; const tfc = col.tf; const twc = col.tw;
  const k = tfc;
  const N = beam.tf;
  const hw = dc - 2 * tfc;
  const stiff = [];
  // J.10.1 flexión local del ala (solo si el ancho de carga ≥ 0,15 bc)
  if (beam.bf >= 0.15 * bc) {
    const R = PHI.yield * 6.25 * tfc * tfc * fy * 0.5;
    out.rows.push({ k: 'Columna: flexión local del ala traccionada (J.10.1, al 50 % por estar en el extremo)', v: `φ Rn = ${fmtN(R / 1000, 0)} kN ${R >= Tf ? '≥' : '<'} Tf = ${fmtN(Tf / 1000, 0)} kN` });
    if (R < Tf) stiff.push('flexión local del ala');
  }
  // J.10.2 fluencia local del alma (tracción y compresión)
  const R2 = 1.0 * (2.5 * k + N) * fy * twc;
  out.rows.push({ k: 'Columna: fluencia local del alma (J.10.2, cerca del extremo)', v: `φ Rn = ${fmtN(R2 / 1000, 0)} kN ${R2 >= Math.max(Tf, Cf) ? '≥' : '<'} ${fmtN(Math.max(Tf, Cf) / 1000, 0)} kN` });
  if (R2 < Math.max(Tf, Cf)) stiff.push('fluencia local del alma');
  // J.10.3 pandeo localizado del alma (compresión)
  const Nd = N / dc;
  const fac = Nd <= 0.2 ? 1 + 3 * Nd * (twc / tfc) ** 1.5 : 1 + (4 * Nd - 0.2) * (twc / tfc) ** 1.5;
  const R3 = 0.75 * 0.4 * twc * twc * fac * Math.sqrt(E_STEEL * fy * tfc / twc);
  out.rows.push({ k: 'Columna: pandeo localizado del alma comprimida (J.10.3, ec. J.10-5)', v: `φ Rn = ${fmtN(R3 / 1000, 0)} kN ${R3 >= Cf ? '≥' : '<'} Cf = ${fmtN(Cf / 1000, 0)} kN` });
  if (R3 < Cf) stiff.push('pandeo localizado del alma');
  // J.10.6 corte en el panel nodal
  const Py = fy * col.A * 100;                                                // cm² → mm²
  const Rv0 = 0.6 * fy * dc * twc;
  const Rv = PHI.yield * Rv0 * (Ncol <= 0.4 * Py ? 1 : 1.4 - Ncol / Py);
  const Vp = Math.max(0, Math.max(Tf, Cf) - Vcol);
  out.rows.push({ k: 'Columna: corte del panel nodal (J.10.6, ec. J.10-9 y J.10-10)', v: `φ Rn = ${fmtN(Rv / 1000, 0)} kN ${Rv >= Vp ? '≥' : '<'} Vp = ${fmtN(Vp / 1000, 0)} kN (cupla de la viga − corte de la columna)` });
  // rigidizadores de fuerza (J.10.8)
  if (stiff.length) {
    const bsMin = Math.ceil((beam.bf / 3 - twc / 2) / 5) * 5;
    const tsMin = Math.max(beam.tf / 2, bsMin / (0.56 * Math.sqrt(E_STEEL / fy)));
    const ts = [6, 8, 10, 12, 16, 20, 25].find((x) => x >= tsMin) || 25;
    const fits = bsMin <= (bc - twc) / 2;
    out.rows.push({ k: `Rigidizadores transversales de la columna (a la altura de las alas de la viga; por ${stiff.join(', ')})`, v: `par de rigidizadores de ${bsMin} × ${ts} mm (J.10.8: ancho ≥ bf/3 − tw/2, espesor ≥ tf/2 y b/t ≤ 0,56 √(E/Fy))${fits ? '' : ' — no entran entre las alas de la columna'}` });
    out.checks.push({ ok: fits, label: 'Rigidizadores en la columna', text: fits ? 'necesarios y dimensionados por J.10.8; su soldadura al ala y al alma debe transmitir la fuerza que toman' : 'el ancho necesario no entra entre las alas: usar una columna mayor' });
  } else out.checks.push({ ok: true, label: 'Alas y alma de la columna (J.10.1 a J.10.3)', text: 'verifican sin rigidizadores' });
  if (Rv < Vp) {
    const tReq = Vp / (PHI.yield * 0.6 * fy * dc * (Ncol <= 0.4 * Py ? 1 : 1.4 - Ncol / Py));
    const tAdd = Math.max(0, tReq - twc);
    const tp = [4, 5, 6, 8, 10, 12, 16, 20, 25].find((x) => x >= tAdd) || null;
    out.rows.push({ k: 'Panel nodal: chapa de refuerzo en el alma (J.10.6, dimensionada con el Capítulo G)', v: tp ? `espesor total de alma necesario ${fmtN(tReq, 1)} mm: agregar una chapa de ${tp} mm (o rigidizadores diagonales)` : 'el refuerzo necesario es excesivo: usar una columna mayor' });
    out.checks.push({ ok: Boolean(tp), label: 'Corte del panel nodal', text: tp ? 'verifica con chapa de refuerzo' : 'no verifica ni con chapa de refuerzo razonable' });
  } else out.checks.push({ ok: true, label: 'Corte del panel nodal (J.10.6)', text: `${fmtN(Vp / 1000, 0)} ≤ ${fmtN(Rv / 1000, 0)} kN` });
  out.notes.push('Alas y almas de la columna según J.10 con k = tf (sin radio de acuerdo), N = espesor del ala de la viga y la columna terminando en el nudo. La soldadura de rigidizadores y chapas de refuerzo, y el pandeo lateral del alma (J.10.4) no se calculan.');
}

// ---------------------------------------------------------------- articulación (cumbrera o unión articulada): grupo de bulones por corte con la resultante
export function designPinJoint({ N, V, j, tMin, label, fy }) {
  const R = Math.hypot(N, V);
  const r = designShearJoint({ R, j, tMin, label, fy });
  r.rows.unshift({ k: 'Resultante en la articulación (axil y corte de servicio)', v: `${fmtN(R, 0)} kg (N = ${fmtN(N, 0)}, V = ${fmtN(V, 0)})` });
  return r;
}

// ---------------------------------------------------------------- placa base y bulones de anclaje
// col: { d (mm, alto en el plano), bf (mm) }; Pu0 en kg de servicio (compresión +), M en kg·m, H en kg, uplift en kg; fc en MPa; B2: ancho de la base de hormigón (mm) o 0
export function designBasePlate({ col, N, M = 0, H = 0, uplift = 0, fc, j, fy, label, footing = null }) {
  const Pu = toN(Math.max(N, 0), j.gamma);
  const Mu = toN(Math.abs(M) * 1000, j.gamma);               // N·mm
  const Hu = toN(Math.abs(H), j.gamma);
  const Tuplift = toN(Math.max(uplift, 0), j.gamma);
  const out = { label, rows: [], checks: [], notes: [], ok: true };
  const { d, bf } = col;
  const qAllow = PHI.concrete * 0.85 * fc;                   // MPa, sin el aumento por área mayor de la base (del lado seguro)
  const e = Pu > 0 ? Mu / Pu : (Mu > 0 ? Infinity : 0);
  const bt = BOLT_TYPES.A307;
  const round10 = (x) => Math.ceil(x / 10) * 10;
  let best = null;
  const foot = footing && footing.ok ? { B: footing.B, L: footing.L, h: footing.h } : null;
  const maxPlate = foot ? Math.min(foot.B, foot.L) - 300 : Infinity;          // la placa tiene que dejar al menos 150 mm de hormigón hasta el borde de la base
  let overflow = false;
  for (let grow = 0; grow <= 60; grow++) {
    const Np = round10(Math.max(d + 100, 200) + 50 * grow);
    const Bp = round10(Math.max(bf + 100, 200) + 50 * grow);
    if (Np > maxPlate || Bp > maxPlate) { overflow = !best; break; }
    const f = Np / 2 - 50;                                   // distancia del centro de la placa a la fila de bulones (a 50 mm del borde)
    let T = Tuplift;
    let qmax;
    let mode;
    let feasible = true;
    if (e <= Np / 6) { qmax = Pu / (Bp * Np) * (1 + 6 * e / Np); mode = e < 1e-9 ? 'centrada' : 'excentricidad pequeña (presión trapecial)'; }
    else {
      mode = 'excentricidad grande (bulones traccionados)';
      const qB = qAllow * Bp;
      const disc = (f + Np / 2) ** 2 - 2 * Pu * (e + f) / qB;
      if (disc < 0) feasible = false;
      else { const Y = (f + Np / 2) - Math.sqrt(disc); T = Math.max(Tuplift, qB * Y - Pu); qmax = qAllow; if (Y > Np) feasible = false; }
    }
    if (!feasible || qmax > qAllow + 1e-9) continue;
    // espesor de la placa por flexión del voladizo (Fisher y Kloiber)
    const m = (Np - 0.95 * d) / 2;
    const n = (Bp - 0.8 * bf) / 2;
    const l = Math.max(m, n, 0);
    const qdes = Math.max(qmax, 1e-9);
    const tcalc = l * Math.sqrt(2 * qdes / (0.9 * fy));
    const tp = BASE_PLATE_T.find((x) => x >= tcalc) || BASE_PLATE_T[BASE_PLATE_T.length - 1];
    // bulones de anclaje (ISO 4.6 / A307): 4, con 2 o 4 traccionados; el corte lo toma la fila más cercana al borde. Tienen que verificar el CIRSOC 301 (Tabla J.3-6) y el Apéndice D del CIRSOC 201
    const ok301 = (dd, nT) => {
      const Ab = boltArea(dd);
      const fv = Hu / (2 * Ab);
      const FntP = Math.min(338 - 2.5 * fv, bt.Fnt);
      return fv <= PHI.bolt * bt.Fnv && (!nT || T / (nT * Ab) <= PHI.bolt * FntP);
    };
    const anc = designAnchorage({ Np, Bp, T, Hu, fc, footing: foot, extra: ok301 });
    const Abf = boltArea(anc.d);
    const fvF = Hu / (2 * Abf);
    const FntPF = Math.min(338 - 2.5 * fvF, bt.Fnt);
    const ftF = anc.nT ? T / (anc.nT * Abf) : 0;
    const chosen = { d: anc.d, nT: anc.nT, fv: fvF, ft: ftF, FvAllow: PHI.bolt * bt.Fnv, FntP: FntPF, okV: fvF <= PHI.bolt * bt.Fnv, okT: ftF <= PHI.bolt * FntPF, Ab: Abf };
    const cand = { Np, Bp, tp, tcalc, l, qmax, mode, T, chosen, anc };
    const score = (c) => (c.anc.fits ? 0 : c.anc.hReq ? c.anc.hReq : 1e6);
    if (!best || score(cand) < score(best)) best = cand;
    if (anc.fits) break;
    if (tcalc > tp) break;                                    // una placa mayor tiene más voladizo y necesita más espesor
  }
  if (!best) {
    out.rows.push({ k: 'Placa base', v: overflow ? `La placa necesaria no entra en la base de hormigón (${foot.B} × ${foot.L} mm).` : 'No se encontró una placa que verifique el aplastamiento del hormigón con estas cargas.' });
    out.checks.push({ ok: false, label: overflow ? 'Placa dentro de la base' : 'Aplastamiento del hormigón', text: overflow ? 'agrandar la base de hormigón (o usar un pedestal) para alojar la placa y los anclajes' : 'la presión supera φ 0,85 f\'c aun con placas grandes' });
    out.ok = false;
    return out;
  }
  const { Np, Bp, tp, l, qmax, mode, T, anc, chosen } = best;
  out.rows.push({ k: 'Placa base (N × B × t)', v: `${Np} × ${Bp} × ${tp} mm` });
  out.rows.push({ k: `Presión sobre el hormigón (${mode})`, v: `${fmtN(qmax, 2)} MPa ≤ φ 0,85 f'c = ${fmtN(qAllow, 2)} MPa (art. 10.17.1 con A2 = A1, del lado seguro)` });
  out.rows.push({ k: 'Espesor por flexión de la placa: tp = l √(2 q / 0,9 Fy)', v: `l = ${fmtN(l, 0)} mm → t ≥ ${fmtN(Math.min(best.tcalc, 99), 1)} mm` });
  out.rows.push({ k: 'Bulones de anclaje (ISO 4.6 / A307) con tuerca y arandela de 2 d: cantidad, diámetro y empotramiento', v: `4 ø${chosen.d} mm, hef = ${anc.hef} mm (${chosen.nT ? `${chosen.nT} traccionados: T = ${fmtN(T / 1000, 1)} kN; ` : ''}corte H = ${fmtN(Hu / 1000, 1)} kN)` });
  out.checks.push({ ok: best.tcalc <= tp + 1e-9, label: 'Espesor de la placa', text: `t = ${tp} mm ${best.tcalc <= tp + 1e-9 ? '≥' : '<'} t necesario = ${fmtN(best.tcalc, 1)} mm${best.tcalc <= tp + 1e-9 ? '' : ' — agrandar la columna, usar rigidizadores o una placa de mayor espesor'}` });
  out.checks.push({ ok: qmax <= qAllow + 1e-9, label: 'Aplastamiento del hormigón', text: `${fmtN(qmax, 2)} ≤ ${fmtN(qAllow, 2)} MPa` });
  out.checks.push({ ok: chosen.okV, label: 'Anclajes al corte (CIRSOC 301)', text: `fv = ${fmtN(chosen.fv, 1)} ≤ φ Fnv = ${fmtN(chosen.FvAllow, 1)} MPa (la fila más cercana al borde toma todo el corte; el rozamiento de la placa no se considera)` });
  if (chosen.nT) out.checks.push({ ok: chosen.okT, label: 'Anclajes a tracción con corte (CIRSOC 301)', text: `ft = ${fmtN(chosen.ft, 1)} ≤ φ F'nt = ${fmtN(PHI.bolt * chosen.FntP, 1)} MPa (F'nt = 338 − 2,5 fv ≤ 260, Tabla J.3-6)` });
  anc.checks.forEach((c) => out.checks.push(c));
  if (!anc.fits) {
    // alternativa: pedestal de hormigón sobre la base (los anclajes se calculan en el pedestal, con sus bordes y su altura sumada al espesor de la base)
    let ped = null;
    if (foot) {
      const Bmax = Math.min(foot.B, foot.L) - 100;
      for (let Bpd = Math.ceil((Math.max(Np, Bp) + 300) / 100) * 100; Bpd <= Bmax && !ped; Bpd += 100) {
        for (let hp = 200; hp <= 1000 && !ped; hp += 100) {
          const a2 = designAnchorage({ Np, Bp, T, Hu, fc, footing: { B: Bpd, L: Bpd, h: foot.h + hp }, extra: (dd, nT) => dd === anc.d && nT === anc.nT });
          if (a2.fits) ped = { B: Bpd, h: hp, a2 };
        }
      }
    }
    const base = foot ? (anc.hReq ? `el anclaje necesita hef = ${anc.hef} mm y la base de ${foot.h} mm de espesor admite como máximo h − 100 = ${anc.hMax} mm: usar una base de al menos ${anc.hReq} mm de espesor` : 'no se encontró un anclaje que verifique con esta base: aumentar el espesor o el tamaño de la base') : 'no se encontró un anclaje que verifique';
    out.checks.push({ ok: false, label: 'Empotramiento disponible', text: `${base}${ped ? `, o un pedestal de ${ped.B} × ${ped.B} × ${ped.h} mm sobre la base (con ø${anc.d} mm y hef = ${ped.a2.hef} mm)` : ''}` });
    if (ped) out.notes.push('El pedestal propuesto se dimensionó solo para los anclajes (distancias a los bordes y empotramiento); su armadura y su verificación como elemento de hormigón armado no se calculan.');
  }
  out.rows.push({ k: foot ? `Base de hormigón (${foot.B} × ${foot.L} × ${foot.h} mm)` : 'Base de hormigón', v: foot ? `distancia del anclaje al borde ${fmtN(Math.min(foot.B, foot.L) / 2 - (Np / 2 - 50), 0)} mm` : 'sin datos de la base: se supone hormigón suficientemente grande (distancias a los bordes ≥ 1,5 hef); verificar con la base real' });
  anchorageNotes.forEach((n) => out.notes.push(n));
  out.notes.push('No se verifican la armadura suplementaria ni la verificación del pedestal; la fuerza horizontal debe resistirse además por rozamiento o empuje del suelo (en pórticos, por tensor o viga de fundación).');
  out.base = { Np, Bp, tp, bolts: chosen };
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

// ---------------------------------------------------------------- soldadura de las presillas de una columna compuesta (TP 5)
// Tp: fuerza en cada presilla (kg), Mp: momento en la presilla (kg·cm), hP: altura de la presilla (cm), e: espesor (cm)
export function designBattenWeld({ Tp, Mp, hP, j, label }) {
  const T = toN(Tp, j.gamma);
  const Mmm = Mp * KG * 10 * j.gamma;                         // kg·cm → N·mm (1 kg·cm = 98,0665 N·mm)
  const h = hP * 10;                                         // mm
  const FEXX = ELECTRODES[j.electrode].FEXX;
  const out = { label, rows: [], checks: [], notes: [], ok: true };
  const w0 = weldMinSize(6);
  let chosen = null;
  for (const w of WELD_SIZES.filter((x) => x >= w0)) {
    // dos cordones verticales de longitud h (uno a cada lado de la presilla): corte T / (2 h) y flexión M / (h² / 3)
    const fvv = T / (2 * h);
    const fbb = Mmm / (h * h / 3);
    const f = Math.hypot(fvv, fbb);
    const cap = weldPerMm(w, FEXX);
    chosen = { w, f, cap };
    if (f <= cap) break;
  }
  out.rows.push({ k: `Soldadura de filete (${j.electrode}) de cada presilla a cada perfil`, v: `lado ${chosen.w} mm, dos cordones de ${fmtN(h, 0)} mm: fuerza resultante ${fmtN(chosen.f, 1)} N/mm ≤ φRn = ${fmtN(chosen.cap, 1)} N/mm` });
  out.checks.push({ ok: chosen.f <= chosen.cap, label: 'Soldadura de presillas', text: `${fmtN(chosen.f, 1)} ≤ ${fmtN(chosen.cap, 1)} N/mm` });
  out.notes.push('Corte T y momento M = T e / 2 en cada presilla (TP 5); la soldadura se calcula como dos líneas verticales (resultante vectorial por mm de cordón).');
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

// ---------------------------------------------------------------- fuerza horizontal en las bases: rozamiento con el suelo o tensor entre bases
// H: reacción horizontal de servicio de una base (kg); weight: peso de la base y del suelo sobre ella (kg); uplift: levantamiento por viento (kg); mu: coeficiente de rozamiento base-suelo
// (DATO DEL ESTUDIO DE SUELOS: el programa no lo supone). Rozamiento resistente = μ (peso − levantamiento), sin empuje pasivo y sin la carga gravitatoria de la columna (del lado seguro).
// El coeficiente de seguridad al deslizamiento 1,5 es un criterio habitual del proyectista (no figura en los reglamentos CIRSOC 101/201 ni en los apuntes).
// Tensor: barra roscada ISO 4.6 con φ Fnt Ab, φ = 0,75, Fnt = 260 MPa (Tabla J.3-2), con T mayorada = 1,5 × el empuje que no toma el rozamiento.
const TIE_RODS = [12, 16, 20, 22, 24, 27, 30, 36, 42, 48];
export function designBaseSliding({ H, weight = 0, uplift = 0, mu = 0, label }) {
  const out = { label, rows: [], checks: [], notes: [], ok: true, sliding: true };
  const Hn = Math.abs(H) * KG;                                                   // N de servicio
  const Wn = Math.max(0, weight - uplift) * KG;
  out.rows.push({ k: 'Reacción horizontal de servicio H', v: `${fmtN(Hn / 1000, 1)} kN (${fmtN(Math.abs(H), 0)} kg)` });
  let Tserv = Hn;
  if (mu > 0) {
    const Fr = mu * Wn;
    const fs = Hn > 0 ? Fr / Hn : Infinity;
    out.rows.push({ k: `Rozamiento base-suelo μ = ${fmtN(mu, 2)} (dato del estudio de suelos): μ (peso de la base y del suelo − levantamiento)`, v: `${fmtN(Fr / 1000, 1)} kN (peso ${fmtN(weight, 0)} kg, levantamiento ${fmtN(uplift, 0)} kg)` });
    out.checks.push({ ok: fs >= 1.5, label: 'Deslizamiento de la base', text: `coeficiente de seguridad ${fmtN(Math.min(fs, 99), 2)} ${fs >= 1.5 ? '≥' : '<'} 1,5 (criterio habitual, sin empuje pasivo)` });
    Tserv = Math.max(0, 1.5 * Hn - Fr);
    if (fs >= 1.5) { out.notes.push('El rozamiento resiste la horizontal sin tensor.'); return out; }
    out.rows.push({ k: 'Horizontal que debe tomar un tensor (1,5 H − rozamiento)', v: `${fmtN(Tserv / 1000, 1)} kN` });
  } else {
    out.rows.push({ k: 'Rozamiento base-suelo', v: 'sin coeficiente μ cargado: ingresar el dato del estudio de suelos para verificar el deslizamiento' });
    out.notes.push('Sin μ se dimensiona el tensor para la horizontal completa (1,5 H).');
    Tserv = 1.5 * Hn;
  }
  const Tu = Tserv;                                                              // la mayoración 1,5 ya está incluida
  const need = Tu / (PHI.bolt * BOLT_TYPES.A307.Fnt);
  const dRod = TIE_RODS.find((d) => boltArea(d) >= need);
  out.rows.push({ k: 'Tensor entre las bases (barra roscada ISO 4.6, φ Fnt Ab): área necesaria', v: `${fmtN(need, 0)} mm² → ${dRod ? `barra ø${dRod} mm (φRn = ${fmtN(PHI.bolt * BOLT_TYPES.A307.Fnt * boltArea(dRod) / 1000, 1)} kN)` : 'más de ø48 mm: usar varios tensores o un perfil'}` });
  out.checks.push({ ok: Boolean(dRod), label: 'Tensor de las bases', text: dRod ? 'verifica; se anclan sus extremos a las placas base o a una viga de fundación' : 'no hay barra roscada de ese tamaño en la tabla' });
  out.notes.push('El tensor puede ser también una viga de fundación o el empuje pasivo del suelo (no calculados). El anclaje del tensor al hormigón no se verifica.');
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

// ---------------------------------------------------------------- extremos de un tensor: barra roscada con tuercas o caño soldado a una chapa
// T en kg de servicio; kind 'barra' o 'caño'; profile del tensor adoptado
export function designTieJoint({ profile, T, kind, j, fy, label }) {
  const Tu = toN(T, j.gamma);
  const out = { label, P: T, Pu: Tu, rows: [], checks: [], notes: [], ok: true };
  if (kind === 'barra') {
    const d = profile.D;
    const Ab = boltArea(d);
    const R = PHI.bolt * BOLT_TYPES.A307.Fnt * Ab;
    out.rows.push({ k: `Extremo roscado de la barra ø${d} mm (ISO 4.6, φ Fnt Ab con Fnt = 260 MPa)`, v: `φRn = ${fmtN(R / 1000, 1)} kN ${R >= Tu ? '≥' : '<'} Tu = ${fmtN(Tu / 1000, 1)} kN` });
    out.checks.push({ ok: R >= Tu, label: 'Rosca de la barra', text: R >= Tu ? 'verifica' : 'no verifica: usar un diámetro mayor en los extremos (recalcado) o varias barras' });
    out.ok = out.checks.every((c) => c.ok);
    out.notes.push('Se verifica la rosca de la barra; la chapa de apoyo y su unión al nudo no se calculan.');
    return out;
  }
  const r = designBarJoint({ profile: { ...profile, t: 'CAÑO', b: profile.D || profile.b }, mult: 1, P: T, kind: 'T', j: { ...j, mode: 'weld' }, fy, label });
  r.notes.push('Tensor de caño: soldadura al contorno de una chapa ranurada; la distribución de los cordones en el contorno queda a cargo del proyectista.');
  return r;
}

function fmtN(x, d = 1) { return Number(x).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
export { fmtN };

// ---------------------------------------------------------------- flechas (CIRSOC 301/2017, Tabla L.3-1)
export const DEFLECTION_LIMITS = {
  industrialRigid: { label: 'Edificio industrial, cubierta rígida: L/200 total y L/240 por sobrecarga', total: 200, live: 240 },
  industrialFlexible: { label: 'Edificio industrial, cubierta flexible: L/150 total y L/180 por sobrecarga', total: 150, live: 180 },
  roof: { label: 'Techos en general: L/200 total y L/250 por sobrecarga', total: 200, live: 250 },
  roofPeople: { label: 'Techos con carga frecuente de personas: L/250 y L/300', total: 250, live: 300 },
  floor: { label: 'Pisos en general: L/250 total y L/300 por sobrecarga', total: 250, live: 300 },
  floorSensitive: { label: 'Barras con revestimientos susceptibles de fisuración: L/300 y L/350', total: 300, live: 350 },
  course: { label: 'Apunte de la cátedra: L/300', total: 300, live: 0 },
  courseRoof: { label: 'Apunte de la cátedra: correas de techo L/200', total: 200, live: 0 },
};
export const DRIFT_LIMIT_INDUSTRIAL = 150;                // desplazamiento de columnas por viento: H/150 (edificios industriales)
export function deflectionCheck({ fTotal, fLive, L, lim }) {
  const L1 = lim.total ? L / lim.total : Infinity;
  const L2 = lim.live ? L / lim.live : Infinity;
  const okT = fTotal <= L1 + 1e-12;
  const okL = fLive <= L2 + 1e-12;
  return { fTotal, fLive, limTotal: L1, limLive: L2, ratioTotal: lim.total ? fTotal / L1 : 0, ratioLive: lim.live ? fLive / L2 : 0, ok: okT && okL, okT, okL, lim };
}
