// Cáscaras de hormigón armado: módulo de paraboloide hiperbólico (cuatro sectores con una columna central) y cúpula de generatriz circular.
// FUENTE: guías de predimensionado 3.1 "Cáscaras - Paraboloide hiperbólico" y 3.2 "Cáscaras - Cúpulas" del Taller de Estructuras E4 (curso 2024; carpeta e4/cascaras).
// Método de la cátedra (membrana, franjas de 1 m de ancho):
// - PH equilátero: la cáscara se divide en parábolas comprimidas y traccionadas de igual luz y flecha que toman q / 2 cada una, H = (q / 2) L² / 8 f (R ≈ H con f / L ≈ 10 %),
//   σ = H / (e 100) ≤ σadm, armadura por cuantía mínima o por tracción Fe = H / σe, corte δ = H / (e 100). Las vigas de borde reciben H por metro (externas) o 2 H por metro (internas, comprimidas).
// - Cúpula de generatriz circular y carga uniforme q por metro cuadrado: Nm = −q R / (1 + cos φ), Np = q R (−cos φ + 1 / (1 + cos φ)), R = (L² + 4 f²) / (8 f), cos φ0 = (R − f) / R.
//   Pandeo: η σmax ≤ σcrít = 0,6 Eb e / R. Apoyo: Nm se descompone en NmH = Nm cos φ0 y NmV = Nm sen φ0; el anillo inferior se arma para la tracción NmH Rp y la viga recibe NmV.
// Unidades: m para las luces, cm para espesores y secciones, kg y kg/m² para las cargas; tensiones en kg/cm².
import { barArea } from './big-beams.js';

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const spacingFor = (Fe, d) => Math.floor(barArea(d) / Fe * 100 * 2) / 2;       // cm entre barras (múltiplo de 0,5 hacia abajo) para Fe cm²/m con barras de d mm

// p: { a (m, semilado menor del módulo), b (m, semilado mayor), h (m, desnivel entre el centro y los puntos medios de los bordes), e (cm), gamma (kg/m³), aisl, sc, vInc (kg/m²), qAdopt (0 = suma),
//      sigmaC, tau, sigmaS (kg/cm²), rhoMin, barD (mm de la malla), sigmaB (kg/cm² de las vigas y la columna), edgeD (mm de las vigas de borde), eEdge, eCol (cm de espesor en el borde y en la columna),
//      colSide (cm, lado de la columna cuadrada), desague (cm²), nx, ny (módulos en planta) }
export function designShellPH(p) {
  const a = Number(p.a); const b = Number(p.b); const h = Number(p.h); const e = Number(p.e);
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  const Pp = Number(p.gamma) * e / 100;
  const qSum = Pp + Number(p.aisl) + Number(p.sc) + Number(p.vInc);
  const q = Number(p.qAdopt) > 0 ? Number(p.qAdopt) : qSum;
  const L = 2 * lo * Math.SQRT2;                                                // luz de la parábola generatriz: la diagonal del cuadrado de lado lo
  const f = h * lo / hi;                                                        // flecha por triángulos proporcionales
  const H = (q / 2) * L * L / (8 * f);                                          // kg por metro de ancho
  const sigC = H / (e * 100); const tau = H / (e * 100);
  const FeMin = Number(p.rhoMin) * e * 100; const FeT = H / Number(p.sigmaS);
  const Fe = Math.max(FeMin, FeT);
  const spacing = spacingFor(Fe, Number(p.barD));
  const FeAdopt = barArea(Number(p.barD)) / spacing * 100;
  const res = { a, b, h, e, lo, hi, Pp, qSum, q, L, f, ratio: f / L, H, sigC, tau, FeMin, FeT, Fe, spacing, FeAdopt, barD: Number(p.barD), sigmaC: Number(p.sigmaC), tauAdm: Number(p.tau), sigmaS: Number(p.sigmaS), checks: [], advice: [] };
  // vigas de borde externas: la fuerza libre H por metro se anula entre los dos lados con tensores incluidos en el borde engrosado
  const edgeBar = barArea(Number(p.edgeD));
  const ext = (len) => { const F = H * len; const Fe_ = F / Number(p.sigmaS); return { len, F, Fe: Fe_, n: Math.ceil(Fe_ / edgeBar - 1e-9) }; };
  res.V1 = ext(a); res.V2 = ext(b);
  // vigas de borde internas: reciben 2 H por metro, comprimidas, de sección variable
  const sigB = Number(p.sigmaB);
  const inn = (horiz) => {
    const len = Math.hypot(horiz, h); const F = 2 * H * len;
    const FbMin = 2 * H / sigB; const FbMax = F / sigB;
    return { horiz, len, F, FbMin, FbMax, wMin: FbMin / Number(p.eEdge), wMax: FbMax / Number(p.eCol), Fe: 0.01 * FbMax, n: Math.ceil(0.01 * FbMax / edgeBar - 1e-9), Fv: F * h / len, Fh: F * horiz / len };
  };
  res.V3 = inn(a); res.V4 = inn(b);
  const N = 2 * res.V3.Fv + 2 * res.V4.Fv;                                      // las componentes horizontales se anulan de a pares
  const Fb = N / sigB; const desague = Number(p.desague) || 0;
  const side = Number(p.colSide);
  res.col = { N, Fb, Fe: Fb / 100, desague, area: Fb + desague, side, areaAdopt: side * side };
  const nx = Math.max(1, Math.round(Number(p.nx) || 1)); const ny = Math.max(1, Math.round(Number(p.ny) || 1));
  res.plan = { nx, ny, total: nx * ny * 4 * a * b, modules: nx * ny };
  const f1 = (v, n = 0) => Number(v).toFixed(n);
  res.checks = [
    { ok: res.ratio >= 0.07 - 1e-9 && res.ratio <= 0.15 + 1e-9, label: 'Relación flecha / luz de la parábola', text: `f / L = ${f1(f, 2)} / ${f1(L, 2)} = ${f1(res.ratio * 100, 1)} % (hipótesis de la guía: entre 7 % y 15 %); L = 2 × ${f1(lo, 2)} × √2, f = ${f1(h, 2)} × ${f1(lo, 2)} / ${f1(hi, 2)}` },
    { ok: sigC <= res.sigmaC + 1e-9, label: 'Parábolas comprimidas', text: `H = (q / 2) L² / 8 f = ${f1(q / 2)} × ${f1(L * L, 0)} / (8 × ${f1(f, 2)}) = ${f1(H)} kg/m; σ = H / (e 100) = ${f1(sigC, 2)} ≤ ${res.sigmaC} kg/cm²` },
    { ok: true, label: 'Armadura de la cáscara (malla en los dos sentidos)', text: `por cuantía mínima ${f1(Number(p.rhoMin) * 100, 1)} %: ${f1(FeMin, 2)} cm²/m; por tracción H / σe = ${f1(FeT, 2)} cm²/m → Ø${p.barD} c/${f1(spacing, 1)} cm (${f1(FeAdopt, 2)} cm²/m)`, info: true },
    { ok: tau <= res.tauAdm + 1e-9, label: 'Esfuerzos tangenciales en las generatrices rectas', text: `δ = H / (e 100) = ${f1(tau, 2)} ≤ ${res.tauAdm} kg/cm²` },
    { ok: true, label: 'Vigas de borde externas V1 y V2 (tensores incluidos en el borde engrosado)', text: `V1: H × ${f1(a, 2)} m = ${f1(res.V1.F)} kg → ${f1(res.V1.Fe, 2)} cm² → ${res.V1.n} Ø${p.edgeD}; V2: H × ${f1(b, 2)} m = ${f1(res.V2.F)} kg → ${f1(res.V2.Fe, 2)} cm² → ${res.V2.n} Ø${p.edgeD} (máximo en el centro: disminuye hacia los extremos)`, info: true },
    { ok: true, label: 'Vigas de borde internas V3 y V4 (comprimidas, sección variable)', text: `V3: ${f1(res.V3.len, 2)} m, F = 2 H l = ${f1(res.V3.F)} kg, Fb de ${f1(res.V3.FbMin, 1)} a ${f1(res.V3.FbMax, 1)} cm² (ancho ${f1(res.V3.wMin, 0)} a ${f1(res.V3.wMax, 0)} cm con ${p.eEdge} y ${p.eCol} cm de espesor), ${res.V3.n} Ø${p.edgeD}; V4: ${f1(res.V4.len, 2)} m, F = ${f1(res.V4.F)} kg, Fb de ${f1(res.V4.FbMin, 1)} a ${f1(res.V4.FbMax, 1)} cm² (ancho ${f1(res.V4.wMin, 0)} a ${f1(res.V4.wMax, 0)} cm), ${res.V4.n} Ø${p.edgeD}`, info: true },
    { ok: res.col.areaAdopt >= res.col.area - 1e-9, label: 'Columna central', text: `N = 2 V3v + 2 V4v = ${f1(2 * res.V3.Fv)} + ${f1(2 * res.V4.Fv)} = ${f1(N)} kg; Fb = N / ${sigB} = ${f1(Fb)} cm² + desagüe ${f1(desague)} cm² = ${f1(res.col.area)} cm² ≤ ${f1(side, 0)} × ${f1(side, 0)} = ${f1(res.col.areaAdopt)} cm² (Fe = 1 % de Fb = ${f1(Fb / 100, 2)} cm²)` },
  ];
  res.advice = ['Con una sola columna central hay que verificar el punzonado y engrosar la cáscara cerca de la columna; el pandeo de la columna con su condición de empotrada; las vigas de borde deben diseñarse con cuidado para evitar las perturbaciones de borde en la cáscara.'];
  res.ok = res.checks.every((c) => c.ok);
  return res;
}

// Esfuerzos de la cúpula de generatriz circular a una altura y de la clave (cos φ = (R − y) / R)
export function domeForces({ q, R, y }) {
  const cosPhi = (R - y) / R;
  return { y, cosPhi, phi: deg(Math.acos(cosPhi)), Nm: -q * R / (1 + cosPhi), Np: q * R * (-cosPhi + 1 / (1 + cosPhi)) };
}

// p: { L (m, diámetro), f (m, altura máxima), e (cm), gamma, aisl, sc, vInc, qAdopt (0 = suma), sigmaC, sigmaS, rhoMin, barD, Eb (kg/cm²), eta (coeficiente de seguridad al pandeo),
//      eEdge (cm, espesor máximo en el apoyo), transition (cm), nCol, beamSelf (kg/m, peso propio de la viga), bBeam (m), lBeam (m, 0 = 2 π Rp / n), hBeam (cm, 0 = el necesario redondeado a 5),
//      ringD (mm), sigmaB (kg/cm² de columnas), colD (cm de la columna circular) }
export function designDome(p) {
  const L = Number(p.L); const f = Number(p.f); const e = Number(p.e);
  const Pp = Number(p.gamma) * e / 100;
  const qSum = Pp + Number(p.aisl) + Number(p.sc) + Number(p.vInc);
  const q = Number(p.qAdopt) > 0 ? Number(p.qAdopt) : qSum;
  const R = (L * L + 4 * f * f) / (8 * f);
  const cos0 = (R - f) / R; const phi0 = deg(Math.acos(cos0)); const sin0 = Math.sin(rad(phi0));
  const rows = [];
  for (let y = 0; y <= f + 1e-9; y += 1) rows.push(domeForces({ q, R, y }));
  if (f - rows[rows.length - 1].y > 1e-6) rows.push(domeForces({ q, R, y: f }));
  const at0 = rows[0]; const edge = rows[rows.length - 1];
  const NmMax = Math.min(...rows.map((r) => r.Nm)); const NpMin = Math.min(...rows.map((r) => r.Np)); const NpMax = Math.max(...rows.map((r) => r.Np));
  const cosNeutral = (Math.sqrt(5) - 1) / 2;                                    // Np = 0 ⇒ cos²φ + cos φ − 1 = 0
  const phiNeutral = deg(Math.acos(cosNeutral));
  const sigM = -NmMax / (e * 100);
  const FeMin = Number(p.rhoMin) * e * 100;
  const spacing = spacingFor(FeMin, Number(p.barD)); const FeAdopt = barArea(Number(p.barD)) / spacing * 100;
  const sigP = -NpMin / (e * 100);
  const NpTen = Math.max(0, NpMax);
  const sigTen = NpTen / FeAdopt;
  const eta = Number(p.eta) || 5;
  const sigCrit = 0.6 * Number(p.Eb) * (e / 100) / R;
  const res = { L, f, e, Pp, qSum, q, R, cos0, phi0, rows, at0, edge, NmMax, NpMin, NpMax, phiNeutral, cosNeutral, sigM, sigP, FeMin, spacing, FeAdopt, NpTen, sigTen, eta, sigCrit, barD: Number(p.barD), sigmaC: Number(p.sigmaC), sigmaS: Number(p.sigmaS), Eb: Number(p.Eb), checks: [] };
  // apoyo
  const Nm = -NmMax;
  const NmH = Nm * cos0; const NmV = Nm * sin0;
  const Rp = L / 2;
  const nCol = Math.max(1, Math.round(Number(p.nCol)));
  const lBeam = Number(p.lBeam) > 0 ? Number(p.lBeam) : 2 * Math.PI * Rp / nCol;
  const wBeam = NmV + Number(p.beamSelf);
  const M = wBeam * lBeam * lBeam / 10 / 1000;                                  // tm, con la continuidad de las vigas
  const bB = Number(p.bBeam);
  const hNec = 8 * Math.sqrt(M / bB);
  const hAdopt = Number(p.hBeam) > 0 ? Number(p.hBeam) : Math.ceil(Math.max(hNec, lBeam * 100 / 10) / 5) * 5;
  const FeBeam = 0.5 * M / (hAdopt / 100);
  const T = NmH * Rp;                                                           // tracción del anillo: componente horizontal por el radio
  const ringBar = barArea(Number(p.ringD));
  const Nc = wBeam * lBeam; const Fb = Nc / Number(p.sigmaB);
  res.support = { Nm, NmH, NmV, Rp, nCol, lBeam, wBeam, M, b: bB, hNec, hMin: lBeam * 100 / 10, hAdopt, FeBeam, T, FeRing: T / Number(p.sigmaS), nRing: Math.ceil(T / Number(p.sigmaS) / ringBar - 1e-9), TguiaV: NmV * Rp, eEdge: Number(p.eEdge), transition: Number(p.transition),
    col: { N: Nc, Fb, Fe: Fb / 100, D: Math.sqrt(4 * Fb / Math.PI), Dadopt: Number(p.colD), areaAdopt: Math.PI * Number(p.colD) ** 2 / 4 } };
  const f1 = (v, n = 0) => Number(v).toFixed(n);
  res.checks = [
    { ok: sigM <= res.sigmaC + 1e-9, label: 'Meridianos comprimidos', text: `Nm máx = ${f1(NmMax)} kg/m (φ = ${f1(phi0, 1)}°); σ = Nm / (e 100) = ${f1(sigM, 2)} ≤ ${res.sigmaC} kg/cm²` },
    { ok: sigP <= res.sigmaC + 1e-9, label: 'Paralelos comprimidos', text: `Np máx = ${f1(NpMin)} kg/m en la clave; σ = ${f1(sigP, 2)} ≤ ${res.sigmaC} kg/cm²` },
    { ok: true, label: 'Armadura (meridianos y paralelos)', text: `cuantía mínima ${f1(Number(p.rhoMin) * 100, 1)} %: ${f1(FeMin, 2)} cm²/m → Ø${p.barD} c/${f1(spacing, 1)} cm (${f1(FeAdopt, 2)} cm²/m) en los dos sentidos`, info: true },
    { ok: sigTen <= res.sigmaS + 1e-9, label: 'Paralelos traccionados', text: NpTen > 0 ? `Np máx = ${f1(NpTen)} kg/m (el paralelo neutro está en φ = ${f1(phiNeutral, 1)}°); σ = Np / Fe = ${f1(NpTen)} / ${f1(FeAdopt, 2)} = ${f1(sigTen, 1)} ≤ ${res.sigmaS} kg/cm²` : `No hay paralelos traccionados (φ de borde ${f1(phi0, 1)}° < ${f1(phiNeutral, 1)}°, el paralelo neutro)` },
    { ok: eta * sigM <= sigCrit + 1e-9, label: 'Pandeo', text: `η σ = ${f1(eta, 1)} × ${f1(sigM, 2)} = ${f1(eta * sigM, 2)} ≤ σcrít = 0,6 Eb e / R = 0,6 × ${f1(res.Eb)} × ${f1(e / 100, 2)} / ${f1(R, 2)} = ${f1(sigCrit, 1)} kg/cm²` },
    { ok: hAdopt >= hNec - 1e-9 && hAdopt >= lBeam * 10 - 1e-9, label: 'Viga de apoyo (junta constructiva)', text: `carga = NmV + peso propio = ${f1(NmV)} + ${f1(Number(p.beamSelf))} = ${f1(wBeam)} kg/m; l = ${f1(lBeam, 2)} m (${nCol} columnas); M = q l² / 10 = ${f1(M, 2)} tm; h = 8 √(M / b) = ${f1(hNec, 1)} cm y h ≥ l / 10 = ${f1(lBeam * 10, 1)} cm → ${f1(bB * 100, 0)} × ${f1(hAdopt, 0)} cm; Fe = 0,5 M / h = ${f1(FeBeam, 2)} cm²` },
    { ok: true, label: 'Anillo de borde (tracción del apoyo)', text: `T = NmH Rp = ${f1(NmH, 1)} × ${f1(Rp, 1)} = ${f1(T)} kg → Fe = T / ${res.sigmaS} = ${f1(T / res.sigmaS, 2)} cm² → ${res.support.nRing} Ø${p.ringD}. La guía usa NmV (${f1(NmV, 2)}) en lugar de NmH: T = ${f1(res.support.TguiaV)} kg, Fe = ${f1(res.support.TguiaV / res.sigmaS, 2)} cm²`, info: true },
    { ok: res.support.col.areaAdopt >= Fb - 1e-9, label: 'Columnas de apoyo', text: `N = q l = ${f1(Nc)} kg; Fb = N / ${p.sigmaB} = ${f1(Fb)} cm² → ø ${f1(res.support.col.D, 1)} cm mínimo; adoptada ø ${f1(res.support.col.Dadopt, 0)} cm (${f1(res.support.col.areaAdopt)} cm²), Fe = 1 % de Fb = ${f1(Fb / 100, 2)} cm²` },
  ];
  res.ok = res.checks.every((c) => c.ok);
  return res;
}
