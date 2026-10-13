// Edificio en torre de hormigón armado con tabiques contraviento.
// FUENTE: guía de predimensionado 7 "Edificio en torre" del Taller de Estructuras E4 (curso 2024; carpeta e4), con el viento del reglamento CIRSOC 102 (2005, procedimiento analítico).
// Método de la cátedra: el edificio trabaja como una ménsula empotrada en el suelo. Viento sobre la cara mayor B (SPRFV): qz = 0,613 Kzt Kd V² I Kz, presión a barlovento + succión a sotavento (la presión
// interna se compensa), p = qz G Cp − qh G Cp' con Cp = 0,8 y Cp' = Cp de sotavento (L / B); fuerza por piso Wi = p B (altura tributaria). Esfuerzos Q y M de la ménsula por piso y volcamiento M equil / M volc ≥ 1,5,
// tensión del terreno σ = −G / F ± M / W, flecha en cabeza f = qv h⁴ / (8 E J) con qv = (qmáx + qmín) / 2 y f ≤ h / 500. Los tabiques paralelos al viento toman el momento en proporción a su inercia
// (traslación pura si el centro de rigidez coincide con la recta de acción del viento; con excentricidad se suma la rotación: Wji = Wi Jj / ΣJ ± Wi e Jj aj / Σ Jj aj²).
// Cada tabiche se predimensiona a flexocompresión en la planta baja (σ = −N / F ± M / W); si hay tracción se arma con As = T / σe y siempre se respeta la cuantía mínima de 0,8 % (CIRSOC 201: mín. Ø8 c/20 vertical y Ø6 c/25 horizontal, Fe horizontal = 1/5 Fe vertical).
// Los tabiques en U se separan en alma (paralela al viento: flexocompresión) y alas (perpendiculares: forman un par de brazo z = lw + e). Unidades: t, m y t/m² en el cálculo; tensiones en kg/cm² al comparar.
import * as W from './wind.js';
import { barArea } from './big-beams.js';

// Parámetros de la Tabla 4 del CIRSOC 102 (exposición A, B, C, D): α y zg. Con ellos Kz = 2,01 (z / zg)^(2/α), constante por debajo de 5 m (caso 2: sistema principal resistente al viento).
// Se contrastaron con la Tabla 5 transcripta en wind.js (por ejemplo B a 10 m: 0,72; C: 1,00; D: 1,18).
export const EXPOSURE_PARAMS = { A: { alpha: 5, zg: 457 }, B: { alpha: 7, zg: 366 }, C: { alpha: 9.5, zg: 274 }, D: { alpha: 11.5, zg: 213 } };
export const EXPOSURES = { A: 'A: centro de grandes ciudades (el de la guía)', B: 'B: áreas urbanas y suburbanas', C: 'C: terreno abierto', D: 'D: costa plana sin obstrucciones' };
export function kzOf(z, exposure = 'A') {
  const { alpha, zg } = EXPOSURE_PARAMS[exposure] || EXPOSURE_PARAMS.A;
  return 2.01 * (Math.max(z, 5) / zg) ** (2 / alpha);
}
const KG_T = 1 / 10000;                                                  // N/m² → t/m² con 1 kg = 10 N, como en los apuntes (736 N/m² = 0,0736 t/m²)

// Cantidad de pisos y cotas: P. Baja a 0,00 (sin viento: es el nivel del terreno), pisos a hPB + k hTipo y azotea en la cota total
export function levelsOf({ nTipo, hTipo, hPB }) {
  const lv = [{ name: 'P. Baja', z: 0 }];
  for (let k = 0; k < nTipo; k++) lv.push({ name: `${k + 1}º`, z: hPB + k * hTipo });
  lv.push({ name: 'Azotea', z: hPB + nTipo * hTipo });
  return lv;
}

// Reparto de una carga unitaria en planta con rototraslación: parte de la carga que toma el tabique j (paralelo al viento)
export function torsionShare({ J, sumJ, sumJa2, e, a }) { return J / sumJ + e * J * a / sumJa2; }

// Propiedades de un tabique. kind 'rect': e (espesor), lw (largo, en la dirección del viento). kind 'U': e, lw (alma), lf (alas, perpendiculares al viento).
export function wallProps(w, hTot, gammaC = 2.4) {
  const e = Number(w.e); const lw = Number(w.lw);
  if (w.kind === 'U') {
    const lf = Number(w.lf);
    const d1 = (lw + e) / 2;
    const Jw = e * lw ** 3 / 12;
    const Jf = 2 * (lf * e ** 3 / 12 + lf * e * d1 * d1);
    const Jo = e * lf ** 3 / 12;                                       // inercia de cada ala respecto de su propio eje (para la rotación)
    const area = lw * e + 2 * lf * e;
    const xOuter = (lw * e * (e / 2) + 2 * lf * e * (lf / 2)) / area;    // baricentro medido desde la cara exterior del alma
    return { kind: 'U', e, lw, lf, d1, z: lw + e, Jw, Jf, J: Jw + Jf, Jo, Fw: lw * e, Ff: lf * e, area, xOuter, W_w: Jw / (lw / 2), Ppw: lw * e * hTot * gammaC, Ppf: lf * e * hTot * gammaC };
  }
  const J = e * lw ** 3 / 12;
  return { kind: 'rect', e, lw, J, area: e * lw, F: e * lw, W: J / (lw / 2), Pp: e * lw * hTot * gammaC };
}

// p: { B, L, nTipo, hTipo, hPB, nSub, hSub, B1, L1, V, exposure, Kd, I, Kzt, G, closed, gcpi, qpp0, qpp1, fc (kg/cm²: σbk), E, tauAdm, sigmaS, sigmaBadm (0 = automática), gammaSeg, sigmaT (kg/cm²),
//      flechaRatio, walls: [...], barD, barDh }
export function designTower(p) {
  const B = Number(p.B); const L = Number(p.L);
  const nTipo = Math.round(Number(p.nTipo)); const hTipo = Number(p.hTipo); const hPB = Number(p.hPB);
  const lv = levelsOf({ nTipo, hTipo, hPB });
  const h = lv[lv.length - 1].z;
  const nSub = Math.round(Number(p.nSub)) || 0; const hSub = Number(p.hSub) || 0;
  const G = Number(p.G); const Kd = Number(p.Kd); const Kzt = Number(p.Kzt); const I = Number(p.I); const V = Number(p.V);
  const exposure = p.exposure || 'A';
  const gcpi = Number(p.gcpi) >= 0 ? Number(p.gcpi) : 0.18;
  const base = 0.613 * Kzt * Kd * V * V * I;                                // N/m² antes de Kz
  const qh = base * kzOf(h, exposure);
  const LB = L / B;
  const CpW = 0.8; const CpL = W.wallCp.leeward(LB);                         // negativo: succión a sotavento
  const wind = lv.map((l) => {
    const kz = kzOf(l.z, exposure);
    const qz = base * kz;
    const pw = qz * G * CpW + qh * gcpi;                                     // barlovento: qz G Cp − qh Gcpi con Gcpi = −0,18
    const pl = qh * G * CpL + qh * gcpi;                                     // sotavento: qh G Cp − qh Gcpi (negativo: succión)
    const pt = pw - pl;                                                      // acción conjunta: la presión interna se equilibra
    return { ...l, Kz: kz, qz, pw, pl, pt, pTm2: pt * KG_T };
  });
  // fuerzas por piso: altura tributaria = media altura hacia arriba + media hacia abajo (el nivel del terreno no recibe viento)
  wind.forEach((l, i) => {
    const up = i < wind.length - 1 ? (wind[i + 1].z - l.z) / 2 : 0;
    const dn = i > 0 ? (l.z - wind[i - 1].z) / 2 : 0;
    l.trib = i === 0 ? 0 : up + dn;
    l.W = l.pTm2 * B * l.trib;
  });
  const top = wind.length - 1;
  wind.forEach((l, i) => {
    let Q = 0; let M = 0;
    for (let j = i + 1; j <= top; j++) { Q += wind[j].W; M += wind[j].W * (wind[j].z - l.z); }
    l.Q = Q; l.M = M;
  });
  const Q0 = wind[0].Q; const M0 = wind[0].M;
  const Mbase = M0 + Q0 * hSub * nSub;                                       // al pie de los subsuelos
  // ---- período, frecuencia y esbeltez
  const T = 0.08 * h / Math.sqrt(L) * Math.sqrt(h / (L + h));
  const freq = 1 / T;
  const slender = h / L;
  // ---- pesos
  const B1 = Number(p.B1); const L1 = Number(p.L1);
  const q0 = Number(p.qpp0); const q1 = Number(p.qpp1);
  const nLos = nTipo + 2;                                                    // azotea + pisos tipo + planta baja
  const G0 = q0 * B * L * nLos + q0 * B1 * L1 * nSub;
  const G1 = q1 * B * L * nLos + q1 * B1 * L1 * nSub;
  // ---- volcamiento y suelo
  const Mequil = G0 * L1 / 2;
  const volc = Mequil / Mbase;
  const e0 = Mbase / G0;
  const F = B1 * L1; const Wf = B1 * L1 * L1 / 6;
  const sMax = G1 / F + Mbase / Wf; const sMin = G1 / F - Mbase / Wf;
  const sigmaT = Number(p.sigmaT) || 2.5;
  const qvMax = wind.length > 1 ? wind[top].pTm2 * B : 0;
  const qvMin = wind.length > 1 ? wind[1].pTm2 * B : 0;
  const qv = (qvMax + qvMin) / 2;
  const Wtot = Q0;
  const res = { B, L, h, hSub, nSub, nTipo, hTipo, hPB, exposure, V, Kd, Kzt, I, G, qh, LB, CpW, CpL, gcpi, wind, Q0, M0, Mbase, T, freq, slender, G0, G1, nLos, Mequil, volc, e0, F, Wf, B1, L1, sMax, sMin, sigmaT, qvMax, qvMin, qv, checks: [], notes: [] };
  // ---- flecha en cabeza
  const E = Number(p.E) * 10;                                                // kg/cm² → t/m²
  const walls = (p.walls || []).map((w, i) => ({ ...w, idx: i, ...wallProps(w, h) }));
  const sumJ = walls.reduce((a, w) => a + w.J, 0);
  const f = qv * h ** 4 / (8 * E * sumJ);
  const fAdm = h / (Number(p.flechaRatio) || 500);
  res.walls = walls; res.sumJ = sumJ; res.defl = { f, fAdm, E, qv };
  // ---- reparto en planta
  const xr = walls.reduce((a, w) => a + w.J * Number(w.x), 0) / sumJ;        // centro de rigidez a lo largo de B
  const eRot = xr - B / 2;
  let sumJa2 = 0;
  walls.forEach((w) => { w.a = xr - Number(w.x); sumJa2 += w.J * w.a ** 2; if (w.kind === 'U') sumJa2 += 2 * w.Jo * w.d1 ** 2; });
  res.xr = xr; res.eRot = eRot; res.sumJa2 = sumJa2;
  walls.forEach((w) => { w.share = w.J / sumJ + (Math.abs(eRot) > 0.005 && sumJa2 > 0 ? eRot * w.J * w.a / sumJa2 : 0); });
  // ---- tabiques a flexocompresión en el nivel 0,00
  const nOver = nTipo + 1;                                                   // losas por encima del nivel 0,00 (azotea + pisos tipo)
  const fc = Number(p.fc); const sigmaS = Number(p.sigmaS) || 2400;
  const gSeg = Number(p.gammaSeg) || 2.5;
  const rhoMin = 0.008;
  const sBadm = Number(p.sigmaBadm) > 0 ? Number(p.sigmaBadm) : (fc + rhoMin * 4200) / gSeg;   // (σbk + ρ σek) / γ: criterio de la guía de columnas (γ = 2,5)
  const tauAdm = Number(p.tauAdm) || 24;
  res.sBadm = sBadm; res.tauAdm = tauAdm; res.sigmaS = sigmaS; res.rhoMin = rhoMin;
  const dist = (As, l, d) => {                                               // armadura por capa: As total en dos capas, Ø d mm a la separación que da la cuantía
    const perLayerM = As / 2 / l;                                            // cm²/m
    const sp = Math.floor(barArea(d) / perLayerM * 100 * 2) / 2;             // cm, múltiplo de 0,5 hacia abajo
    return { perLayerM, s: Math.min(sp, 20), n: Math.round(l * 100 / Math.min(sp, 20)) };
  };
  const barD = Number(p.barD) || 12; const barDh = Number(p.barDh) || 6;
  res.barD = barD; res.barDh = barDh;
  const rows = [];
  const flexo = (name, F_, Wm, Mt, Pp, a, l, e) => {                          // l: largo (m); e: espesor (m); F_: área (m²); Wm: módulo (m³)
    const N0 = Pp + q0 * a * nOver; const N1 = Pp + q1 * a * nOver;
    const sd = -N0 / F_; const sc = -N1 / F_; const sf = Mt / Wm;
    const d = { name, F: F_, W: Wm, M: Mt, Pp, a, N0, N1, sd: [sd + sf, sd - sf], sc: [sc + sf, sc - sf] };   // [tracción o menor compresión, mayor compresión] en t/m²
    d.sigTen = Math.max(0, d.sd[0], d.sc[0]);                                // t/m²
    d.sigComp = -Math.min(d.sd[1], d.sc[1]);                                 // t/m² (positiva)
    if (d.sigTen > 1e-9) {
      const worst = d.sd[0] >= d.sc[0] ? d.sd : d.sc;
      const x = l * worst[0] / (worst[0] - worst[1]);                       // m, por triángulos semejantes
      d.x = x;
      d.T = (worst[0] / 10) * (e * 100) * (x * 100) / 2 / 1000;               // t = σ (kg/cm²) b (cm) x (cm) / 2 / 1000
      d.AsT = d.T * 1000 / sigmaS;
    } else { d.x = 0; d.T = 0; d.AsT = 0; }
    const Ab = e * 100 * l * 100;                                            // cm²
    d.AsMin = rhoMin * Ab; d.As = Math.max(d.AsT, d.AsMin);
    d.vert = dist(d.As, l, barD);
    d.hor = { perM: d.vert.perLayerM / 5 };                                  // Fe horizontal = 1/5 Fe vertical (por metro y por capa)
    d.hor.s = Math.min(25, Math.floor(barArea(barDh) / d.hor.perM * 100 * 2) / 2);
    d.sBcomp = d.sigComp / 10;                                               // kg/cm²
    return d;
  };
  walls.forEach((w) => {
    const Mw = M0 * w.share;
    if (w.kind === 'rect') {
      const a = Number(w.infl) || 0;
      w.fx = flexo(w.name, w.F, w.W, Mw, w.Pp, a, w.lw, w.e);
      w.fx.Mwall = Mw;
      // dintel de la abertura (si la hay)
      const hd = Number(w.hd) || 0;
      if (hd > 0) {
        const Qj = Q0 * w.share; const S = w.e * w.lw ** 2 / 8;
        const ti = Qj * S / w.J; const Tt = ti * hTipo;
        w.dintel = { hd, Qj, S, ti, T: Tt, tau: Tt * 1000 / (hd * 100 * w.e * 100), tauAdm };
      }
    } else {
      const Mu = Mw; const MwWeb = Mu * w.Jw / w.J; const MwFl = Mu - MwWeb;
      w.fxWeb = flexo(`${w.name} alma`, w.Fw, w.W_w, MwWeb, w.Ppw, Number(w.inflWeb) || 0, w.lw, w.e);
      w.fxWeb.Mwall = MwWeb;
      const par = MwFl / w.z;                                                // t: fuerza del par de las alas
      const Nf = par + w.Ppf + q1 * (Number(w.inflFl) || 0) * nOver;
      w.flange = { M: MwFl, z: w.z, par, Pp: w.Ppf, a: Number(w.inflFl) || 0, N: Nf, sigma: Nf * 1000 / (w.Ff * 10000), F: w.Ff, As: Math.max(rhoMin * w.Ff * 10000, 0) };
      w.flange.vert = dist(w.flange.As, w.lf, barD);
    }
  });
  res.stateLabels = ['Sin sobrecarga', 'Con sobrecarga'];
  // ---- verificaciones
  const f1 = (v, n = 0) => Number(v).toFixed(n);
  res.checks.push({ ok: volc >= 1.5 - 1e-9, label: 'Volcamiento', text: `M equil / M volc = G L1 / 2 / M = ${f1(G0)} t × ${f1(L1 / 2, 1)} m / ${f1(Mbase)} tm = ${f1(volc, 2)} ≥ 1,5 (G sin sobrecarga)` });
  res.checks.push({ ok: e0 <= L1 / 6 + 1e-9, label: 'Resultante en el núcleo central de la base', text: `e = M / N = ${f1(Mbase)} / ${f1(G0)} = ${f1(e0, 2)} m ≤ L1 / 6 = ${f1(L1 / 6, 2)} m` });
  res.checks.push({ ok: sMax / 10 <= sigmaT + 1e-9, label: 'Tensión del terreno (platea de fundación)', text: `σ = −G / F ± M / W = −${f1(G1 / F, 2)} ± ${f1(Mbase / Wf, 2)} t/m² → ${f1(-sMax, 2)} / ${f1(-sMin, 2)} t/m² (σmáx = ${f1(sMax / 10, 2)} kg/cm²) ≤ ${f1(sigmaT, 2)} kg/cm²` });
  res.checks.push({ ok: f <= fAdm + 1e-9, label: 'Flecha en cabeza', text: `f = qv h⁴ / (8 E J) = ${f1(qv, 2)} t/m × ${f1(h, 0)}⁴ / (8 × ${f1(E, 0)} t/m² × ${f1(sumJ, 2)} m⁴) = ${f1(f, 3)} m ≤ h / ${Number(p.flechaRatio) || 500} = ${f1(fAdm, 3)} m (la guía usa h = 70 m: 0,077 m)` });
  walls.forEach((w) => {
    const fxs = w.kind === 'rect' ? [w.fx] : [w.fxWeb];
    fxs.forEach((fx) => {
      res.checks.push({ ok: fx.sBcomp <= sBadm + 1e-9, label: `Tabique ${fx.name}: compresión`, text: `σ = −N / F ± M / W = ${f1(fx.sigComp, 0)} t/m² = ${f1(fx.sBcomp, 1)} kg/cm² ≤ ${f1(sBadm, 0)} kg/cm²${fx.sigTen > 0 ? `; tracción máx. ${f1(fx.sigTen / 10, 2)} kg/cm² (sin sobrecarga): As calc. = ${f1(fx.AsT, 2)} cm² < mínima` : ''}` });
    });
    if (w.kind === 'U') res.checks.push({ ok: w.flange.sigma / 10 <= sBadm + 1e-9 && w.flange.sigma > 0, label: `Tabique ${w.name}: ala comprimida`, text: `N = par + losas + peso = ${f1(w.flange.par, 0)} + ${f1(q1 * w.flange.a * nOver, 0)} + ${f1(w.flange.Pp, 0)} = ${f1(w.flange.N, 0)} t; σ = ${f1(w.flange.sigma, 1)} ≤ ${f1(sBadm, 0)} kg/cm²` });
    if (w.dintel) res.checks.push({ ok: w.dintel.tau <= tauAdm + 1e-9, label: `Tabique ${w.name}: dintel al corte`, text: `τ = T / (hd e) = ${f1(w.dintel.T, 2)} t / (${f1(w.dintel.hd * 100, 0)} × ${f1(w.e * 100, 0)} cm) = ${f1(w.dintel.tau, 2)} ≤ ${tauAdm} kg/cm² (Qj = ${f1(w.dintel.Qj, 1)} t, ti = Q S / J = ${f1(w.dintel.ti, 2)} t/m)` });
  });
  if (slender > 5) res.notes.push(`Esbeltez λ = h / L = ${f1(slender, 1)}: entre 5 y 10 los efectos laterales son más complejos y pueden aparecer problemas de volcamiento; con λ ≥ 10 la materialización se hace muy difícil.`);
  else if (slender > 3) res.notes.push(`Esbeltez λ = h / L = ${f1(slender, 1)} (> 3): se toman en cuenta las cargas de viento; los problemas de volcamiento no suelen ser de gran relevancia.`);
  if (freq < 1) res.notes.push(`Período T = ${f1(T, 2)} s, frecuencia ${f1(freq, 2)} Hz < 1 Hz: el edificio es flexible y correspondería amplificar el viento con el factor Gf (CIRSOC 102, 5.8.2). Como la guía, se sigue con G = ${G} (edificio rígido).`);
  if (Math.abs(eRot) > 0.005) res.notes.push(`El centro de rigidez de los tabiques (x = ${f1(xr, 2)} m) no coincide con la recta de acción del viento (B / 2 = ${f1(B / 2, 2)} m): excentricidad e = ${f1(eRot, 2)} m. Se suma la rotación al reparto por traslación.`);
  res.notes.push('Se verifica la dirección más crítica (viento sobre la cara mayor). Falta repetir el cálculo con el viento sobre la cara menor (intercambiando B y L y la orientación de los tabiques) y la flecha en ese sentido.');
  res.ok = res.checks.every((c) => c.ok);
  res.G = G0;
  return res;
}
