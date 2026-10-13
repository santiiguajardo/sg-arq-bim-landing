// Losa plegada de hormigón armado (cubierta de gran luz que trabaja en una dirección sobre tímpanos).
// FUENTE: guía de predimensionado 4 "Plegados" del Taller de Estructuras E4 (FAUD-UNMdP, curso 2024; carpeta e4).
// Método de la cátedra: el plegado se asimila a una viga simplemente apoyada de luz L cuya sección es el perfil equivalente de un módulo de onda (dos alas de ancho b y espesor d, más un alma
// equivalente de ancho bo = 2 d / sen α). Esfuerzos M = q L² / 8 y Q = q L / 2; el par interno es C = T = M / Z con Z = H − d; compresión σ = C / (b d), armadura Fe = T / σe,
// corte τ = Q / (bo Z), flecha f = 5 q L⁴ / (384 E J) ≤ L / 500 con J = 2 (b d³/12 + b d ((H − d)/2)²) + bo (H − 2 d)³ / 12.
// Apoyos: viga tímpano (carga = reacción de los módulos que apoyan + peso propio; M = q l² / 10; h = 8 √(M / b), Fe = 0,5 M / h con M en tm, b y h en m) y columnas (Fb = N / 80, Fe = 1 % de Fb, mínimo 20 × 20 con 4 Ø12).
// Unidades de entrada: m para la geometría del módulo, kg/m² para las cargas; resultados en kg, m y cm (como la guía).
import { barArea } from './big-beams.js';

const RAD = 180 / Math.PI;

// p: { L (m), nMod, B (m, ancho del módulo), b (m, ancho del ala superior e inferior), H (m), d (m, espesor),
//      gamma (kg/m³), sc (kg/m², sobrecarga en planta), sigmaC, tau, sigmaS (kg/cm²), E (kg/cm²), flechaRatio, barD (mm),
//      timp: { l (m), b (m), h (m), n (módulos que apoyan, 0 = l / B) }, nCol, sigmaCol (kg/cm²), rhoCol }
export function designFolded(p) {
  const L = Number(p.L); const B = Number(p.B); const b = Number(p.b); const H = Number(p.H); const d = Number(p.d);
  const gamma = Number(p.gamma) || 2400;
  const bp = (B - 2 * b) / 2;                                                  // proyección horizontal de cada plano inclinado (B = 2 b + 2 b')
  const alpha = Math.atan((H - d) / bp);
  const sinA = Math.sin(alpha);
  const incl = (H - d) / sinA;                                                 // longitud de cada plano inclinado
  const wave = 2 * b + 2 * incl;                                               // longitud desarrollada de la onda
  const Pp = gamma * wave * d;                                                 // kg por metro de luz
  const sob = Number(p.sc) * B;
  const q = Pp + sob;
  const M = q * L * L / 8;                                                     // kg·m
  const Q = q * L / 2;                                                         // kg
  const bo = 2 * d / sinA;
  const Z = H - d;
  const C = M / Z;
  const sigC = C / (b * 100 * d * 100);
  const Fe = C / Number(p.sigmaS);                                             // cm² en el valle entre dos módulos
  const bar = barArea(Number(p.barD));
  const nBars = Math.ceil(Fe / bar - 1e-9);
  const tau = Q / (bo * 100 * Z * 100);
  const cm = (v) => v * 100;
  const Jflange = cm(b) * cm(d) ** 3 / 12 + cm(b) * cm(d) * (cm(H - d) / 2) ** 2;
  const Jweb = cm(bo) * cm(H - 2 * d) ** 3 / 12;
  const J = 2 * Jflange + Jweb;                                                // cm⁴
  const flechaRatio = Number(p.flechaRatio) || 500;
  const f = 5 * (q / 100) * cm(L) ** 4 / (384 * Number(p.E) * J);
  const fAllow = cm(L) / flechaRatio;
  const res = { L, nMod: Number(p.nMod), B, b, bp, H, d, alpha: alpha * RAD, incl, wave, Pp, sob, q, M, Q, bo, Z, C, sigC, Fe, bar, nBars, barD: Number(p.barD), AsAdopt: nBars * bar, tau, J, Jflange, Jweb, f, fAllow, flechaRatio,
    sigmaC: Number(p.sigmaC), tauAdm: Number(p.tau), sigmaS: Number(p.sigmaS), E: Number(p.E), checks: [] };

  // viga tímpano
  const t = p.timp;
  const nT = Number(t.n) > 0 ? Number(t.n) : Math.max(1, Math.round(Number(t.l) / B));
  const PpT = Number(t.b) * Number(t.h) * gamma;
  const qT = Q * nT / Number(t.l) + PpT;                                       // kg/m
  const MT = qT * Number(t.l) ** 2 / 10 / 1000;                                // tm
  const hNec = 8 * Math.sqrt(MT / Number(t.b));                                // cm
  const FeT = 0.5 * MT / Number(t.h);                                          // cm²
  res.timp = { l: Number(t.l), b: Number(t.b), h: Number(t.h), n: nT, Ppo: PpT, q: qT, M: MT, hNec, Fe: FeT, nBars: Math.ceil(FeT / barArea(16) - 1e-9), hAdopt: Number(t.h) * 100 };

  // columnas
  const nCol = Number(p.nCol) || 1;
  const N = q * L * res.nMod / nCol;
  const sigCol = Number(p.sigmaCol) || 80;
  const Fb = N / sigCol;
  const rho = Number(p.rhoCol) || 0.01;
  res.col = { nCol, N, sigma: sigCol, Fb, side: Math.sqrt(Fb), Fe: Fb * rho, rho, sideAdopt: Math.max(20, Math.ceil(Math.sqrt(Fb))) };

  res.checks = [
    { ok: sigC <= res.sigmaC + 1e-9, label: 'Compresión del hormigón (cordón superior)', text: `σ = C / (b d) = ${C.toFixed(0)} / (${(b * 100).toFixed(0)} × ${(d * 100).toFixed(0)}) = ${sigC.toFixed(2)} ≤ ${res.sigmaC} kg/cm² (C = T = M / Z = ${M.toFixed(0)} / ${Z.toFixed(2)})` },
    { ok: true, label: 'Armadura del valle', text: `Fe = T / σe = ${C.toFixed(0)} / ${res.sigmaS} = ${Fe.toFixed(2)} cm² entre dos módulos próximos → ${nBars} Ø${res.barD} (${(nBars * bar).toFixed(2)} cm²)`, info: true },
    { ok: tau <= res.tauAdm + 1e-9, label: 'Tensiones tangenciales', text: `τ = Q / (bo Z) = ${Q.toFixed(0)} / (${(bo * 100).toFixed(1)} × ${(Z * 100).toFixed(0)}) = ${tau.toFixed(2)} ≤ ${res.tauAdm} kg/cm² (la guía admite de 10 a 15)` },
    { ok: f <= fAllow + 1e-9, label: 'Flecha del plegado', text: `f = 5 q L⁴ / (384 E J) = ${f.toFixed(2)} cm ≤ L / ${flechaRatio} = ${fAllow.toFixed(1)} cm (J = ${J.toExponential(3)} cm⁴)` },
    { ok: res.timp.hAdopt >= hNec - 1e-9, label: 'Viga tímpano', text: `h = ${res.timp.hAdopt.toFixed(0)} cm ≥ 8 √(M / b) = 8 √(${MT.toFixed(2)} / ${res.timp.b}) = ${hNec.toFixed(1)} cm; Fe = 0,5 M / h = ${FeT.toFixed(2)} cm²` },
    { ok: res.col.sideAdopt ** 2 >= Fb - 1e-9, label: 'Columnas', text: `N = q L n / Ncol = ${N.toFixed(0)} kg; Fb = N / ${sigCol} = ${Fb.toFixed(0)} cm² (lado mínimo ${Math.sqrt(Fb).toFixed(1)} cm) → columna mínima ${res.col.sideAdopt} × ${res.col.sideAdopt} cm con 4 Ø12 (Fe = ${(Fb * rho).toFixed(2)} cm²)` },
  ];
  const angleOk = alpha * RAD >= 45 - 1e-9 && alpha * RAD <= 61;
  res.advice = [
    angleOk ? null : `El ángulo α = ${(alpha * RAD).toFixed(1)}° queda fuera del entorno de 45° a 60° en el que la hipótesis de viga equivalente se aproxima bien (las aristas sufren deformaciones despreciables solo en ese rango).`,
    H < L / 10 - 1e-9 ? `La altura de la onda (${H.toFixed(2)} m) es menor que el 10 % de la luz (${(L / 10).toFixed(2)} m), que es el valor inicial que propone la guía.` : null,
  ].filter(Boolean);
  res.ok = res.checks.every((c) => c.ok);
  return res;
}
