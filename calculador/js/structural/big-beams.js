// Vigas de gran inercia: viga Vierendeel (hormigón armado o acero) y viga postesada de hormigón.
// FUENTE: guías de predimensionado 6.1 "Vigas de gran inercia - Vierendeel" y 6.2 "Vigas de gran inercia - Postesadas" del Taller de Estructuras E4 (curso 2024; carpeta e4).
// Método de la cátedra (viga simplemente apoyada de luz L, carga q en kg/m): M = q L² / 8, Q = q L / 2; los cordones trabajan con C = T = M / Z, Z = 0,9 H (brazo de palanca).
// Vierendeel: montantes por corte (hormigón: m2 ≥ Q / (m1 τadm); acero: Q / Fe ≤ 1100 kg/cm²), cordón comprimido C / (m1 m2) ≤ σadm con λ = 0,7 a / m1 (a = distancia entre nudos) y ω de la tabla,
// armadura (hormigón) Fe = T / σs o perfil (acero) Fe = T / σadm, flecha f = 5 q L⁴ / (384 E J) ≤ L / 500 con J = 2 [J propio del cordón + A z1²].
// Postesada: componente horizontal Ph = q L² / (8 f) (f = flecha del cable), ancho por compresión b = Ph / (σadm h), inercia por pandeo Jnec = Pk Lp² / (π² E) con Pk = 2 Ph y Lp = L,
// sección hueca, cables por carga de rotura Pk, flecha con el J de la sección. Unidades de entrada: kg, m (luz y alturas del esquema) y cm (secciones); las tensiones en kg/cm².
import * as S from './steel.js';

const barArea = (d) => Math.PI * (d / 10) ** 2 / 4;              // cm² por barra de d mm
export const REBAR_DIAMETERS = [12, 16, 20, 25, 32, 40];
export { barArea };

// ω de pandeo: la guía toma ω = 1 por debajo de λ = 20 (arranque de las tablas) y las tablas del anexo para el acero (F-22 o F-24)
export function omegaSteel(lambda, table = 'F-22') { return lambda < 20 ? 1 : S.omegaOf(lambda, table); }

export function loadsTotal(l) {
  const parts = [Number(l.floorD) || 0, Number(l.floorL) || 0, Number(l.roofD) || 0, Number(l.roofL) || 0, Number(l.self) || 0];
  return parts.reduce((a, b) => a + b, 0);
}

function chordForces({ q, L, H }) {
  const M = q * L * L / 8;
  const Q = q * L / 2;
  const Z = 0.9 * H;
  return { M, Q, Z, C: M / Z, T: M / Z };
}

// p: { mat: 'rc' | 'steel', L (m), H (m), a (m), loads: { floorD, floorL, roofD, roofL, self }, flechaRatio (500),
//      rc: { m1, m2 (0 = automático), hc (cm, 0 = m2), sigmaC, tau, sigmaS, E, omega, barD (mm) },
//      steel: { sigma, tau, E, upn (nombre | null), grade: 'F-22' | 'F-24' } }
export function designVierendeel(p) {
  const L = Number(p.L); const H = Number(p.H); const a = Number(p.a);
  const q = loadsTotal(p.loads);
  const f = chordForces({ q, L, H });
  const res = { mat: p.mat, L, H, a, q, ...f, checks: [] };
  const Lc = L * 100; const flechaRatio = Number(p.flechaRatio) || 500;
  const deflection = (J, E) => 5 * (q / 100) * Lc ** 4 / (384 * E * J);
  if (p.mat === 'rc') {
    const r = p.rc;
    const m1 = Number(r.m1);
    const m2req = f.Q / (m1 * Number(r.tau));
    const m2 = Number(r.m2) > 0 ? Number(r.m2) : Math.ceil(m2req / 5) * 5;
    const area = m1 * m2;
    const lambda = 0.7 * a * 100 / m1;
    const omega = Number(r.omega) > 0 ? Number(r.omega) : 1;
    const sigC = omega * f.C / area;
    const Fe = f.T / Number(r.sigmaS);
    const bar = barArea(Number(r.barD));
    const nBars = Math.ceil(Fe / bar - 1e-9);
    const hc = Number(r.hc) > 0 ? Number(r.hc) : m2;                           // altura del cordón en el plano de la viga
    const z1 = (H * 100 - hc) / 2;
    const Jchord = m1 * hc ** 3 / 12 + m1 * hc * z1 * z1;
    const J = 2 * Jchord;
    const fl = deflection(J, Number(r.E));
    Object.assign(res, { m1, m2, m2req, ratio: m2 / m1, area, lambda, omega, sigC, Fe, nBars, barD: Number(r.barD), AsAdopt: nBars * bar, hc, z1, J, f: fl, fAllow: Lc / flechaRatio, sigmaC: Number(r.sigmaC), tau: Number(r.tau), sigmaS: Number(r.sigmaS), E: Number(r.E) });
    res.checks = [
      { ok: m2 >= m2req - 1e-9, label: 'Montantes al corte', text: `m2 = ${m2.toFixed(0)} cm ≥ Q / (m1 τadm) = ${f.Q.toFixed(0)} / (${m1} × ${r.tau}) = ${m2req.toFixed(1)} cm` },
      { ok: true, label: 'Relación m2 / m1', text: `${res.ratio.toFixed(2)}${res.ratio >= 2 - 1e-9 && res.ratio <= 2.5 + 1e-9 ? '' : ' (fuera del rango de 2 a 2,5 que sugiere la guía; el ejemplo de la guía, 90 / 35, también)'}`, advisory: true },
      { ok: sigC <= Number(r.sigmaC) + 1e-9, label: 'Cordón superior comprimido', text: `ω C / (m1 m2) = ${omega} × ${f.C.toFixed(0)} / (${m1} × ${m2}) = ${sigC.toFixed(2)} ≤ ${r.sigmaC} kg/cm² (λ = 0,7 a / m1 = ${lambda.toFixed(1)})` },
      { ok: nBars * bar >= Fe - 1e-9, label: 'Armadura del cordón inferior', text: `Fe = T / σs = ${f.T.toFixed(0)} / ${r.sigmaS} = ${Fe.toFixed(2)} cm² → ${nBars} Ø${r.barD} (${(nBars * bar).toFixed(2)} cm²)` },
      { ok: fl <= Lc / flechaRatio + 1e-9, label: 'Flecha', text: `f = 5 q L⁴ / (384 E J) = ${fl.toFixed(2)} cm ≤ L / ${flechaRatio} = ${(Lc / flechaRatio).toFixed(1)} cm (J = ${J.toExponential(3)} cm⁴)` },
    ];
  } else {
    const r = p.steel;
    const sig = Number(r.sigma); const tau = Number(r.tau); const E = Number(r.E);
    const FeNec = f.T / sig;
    const list = S.profilesOf('UPN');
    const evalU = (u) => {
      const Fe = 2 * u.A;                                                      // cada cordón: dos perfiles U
      const m1 = 2 * u.b / 10;                                                 // lado menor del cordón (dos perfiles) en cm
      const lambda = 0.7 * a * 100 / m1;
      const omega = omegaSteel(lambda, r.grade || 'F-22');
      const z1 = (H * 100 - u.h / 10) / 2;
      const Jchord = 2 * u.Ix + 2 * u.A * z1 * z1;
      const J = 2 * Jchord;
      const fl = deflection(J, E);
      const tCh = f.T / Fe; const cCh = omega === null ? Infinity : omega * f.C / Fe; const sh = f.Q / Fe;
      const ok = tCh <= sig + 1e-9 && cCh <= sig + 1e-9 && sh <= tau + 1e-9 && fl <= Lc / flechaRatio + 1e-9;
      return { u, Fe, m1, lambda, omega, z1, J, f: fl, tCh, cCh, sh, ok };
    };
    let ch = r.upn ? evalU(S.profileByName(r.upn)) : null;
    if (!ch) { for (const u of list) { const e = evalU(u); ch = e; if (e.ok) break; } }
    Object.assign(res, { FeNec, ...ch, sigma: sig, tau, E, fAllow: Lc / flechaRatio, profile: ch.u });
    res.checks = [
      { ok: ch.tCh <= sig + 1e-9, label: 'Cordón inferior a tracción', text: `T / Fe = ${f.T.toFixed(0)} / ${ch.Fe.toFixed(1)} = ${ch.tCh.toFixed(0)} ≤ ${sig} kg/cm² (Fe necesaria ${FeNec.toFixed(2)} cm²; 2 ${ch.u.n})` },
      { ok: ch.sh <= tau + 1e-9, label: 'Montantes al corte', text: `Qmax / Fe = ${f.Q.toFixed(0)} / ${ch.Fe.toFixed(1)} = ${ch.sh.toFixed(0)} ≤ ${tau} kg/cm² (con la sección del cordón, como la guía)` },
      { ok: ch.cCh <= sig + 1e-9, label: 'Cordón superior al pandeo', text: `ω C / Fe = ${ch.omega === null ? '—' : ch.omega} × ${f.C.toFixed(0)} / ${ch.Fe.toFixed(1)} = ${ch.cCh.toFixed(0)} ≤ ${sig} kg/cm² (λ = 0,7 a / m1 = ${ch.lambda.toFixed(1)}, m1 = 2 b = ${ch.m1.toFixed(1)} cm)` },
      { ok: ch.f <= Lc / flechaRatio + 1e-9, label: 'Flecha', text: `f = 5 q L⁴ / (384 E J) = ${ch.f.toFixed(2)} cm ≤ L / ${flechaRatio} = ${(Lc / flechaRatio).toFixed(1)} cm (J = ${ch.J.toExponential(3)} cm⁴, dos cordones de dos perfiles)` },
    ];
  }
  res.ok = res.checks.filter((c) => !c.advisory).every((c) => c.ok);
  return res;
}

// ---------------------------------------------------------------- viga postesada
// p: { L (m), f (m, flecha del cable), loads, h (cm, altura de la viga), sigmaC (kg/cm²), E (kg/cm²), sect: { b1, h1, b2, h2 } (cm, sección hueca), cable: { catalog, d (mm) | 0 }, flechaRatio }
export function designPostTensioned(p, helpers) {
  const L = Number(p.L); const fCable = Number(p.f);
  const q = loadsTotal(p.loads);
  const Ph = q * L * L / (8 * fCable);
  const sigmaC = Number(p.sigmaC); const h = Number(p.h); const E = Number(p.E);
  const Fb = Ph / sigmaC;
  const bNec = Fb / h;
  const Lp = L * 100;
  const Pk = Ph * 2;
  const Jnec = Pk * Lp * Lp / (Math.PI ** 2 * E);
  const { b1, h1, b2, h2 } = p.sect;
  const A = b1 * h1 - b2 * h2;
  const Jyy = h1 * b1 ** 3 / 12 - h2 * b2 ** 3 / 12;
  const Jxx = b1 * h1 ** 3 / 12 - b2 * h2 ** 3 / 12;
  const flechaRatio = Number(p.flechaRatio) || 500;
  const fl = 5 * (q / 100) * Lp ** 4 / (384 * E * Jxx);
  const res = { L, fCable, q, Ph, sigmaC, h, E, Fb, bNec, Pk, Lp, Jnec, A, Jyy, Jxx, f: fl, fAllow: Lp / flechaRatio, sect: p.sect, sigmaPh: Ph / A, checks: [] };
  // cables: Pk como carga de rotura total
  if (helpers && helpers.cablesOf) {
    const list = helpers.cablesOf(p.cable.catalog).sort((x, y) => x.d - y.d);
    res.alternatives = list.filter((c) => c.d >= 12).map((c) => ({ d: c.d, F: c.F, n: Math.ceil(Pk / c.F - 1e-9), suspect: c.suspect }));
    const chosen = Number(p.cable.d) > 0 ? list.find((c) => Math.abs(c.d - Number(p.cable.d)) < 1e-6) : null;
    res.cable = chosen ? { d: chosen.d, F: chosen.F, n: Math.ceil(Pk / chosen.F - 1e-9), suspect: chosen.suspect } : null;
  }
  res.checks = [
    { ok: b1 >= bNec - 1e-9, label: 'Ancho por compresión', text: `b nec = Ph / (σadm h) = ${Ph.toFixed(0)} / (${sigmaC} × ${h}) = ${bNec.toFixed(2)} cm ≤ ancho total ${b1} cm` },
    { ok: res.sigmaPh <= sigmaC + 1e-9, label: 'Compresión sobre la sección hueca', text: `Ph / A = ${Ph.toFixed(0)} / ${A.toFixed(0)} cm² = ${res.sigmaPh.toFixed(1)} ≤ ${sigmaC} kg/cm² (verificación agregada: la guía solo calcula el ancho necesario)`, extra: true },
    { ok: Jnec <= Jyy + 1e-9, label: 'Pandeo', text: `Jnec = Pk Lp² / (π² E) = ${Jnec.toFixed(0)} cm⁴ ≤ Jy-y = ${Jyy.toFixed(0)} cm⁴ (Pk = 2 Ph = ${Pk.toFixed(0)} kg, Lp = ${Lp.toFixed(0)} cm)` },
    { ok: fl <= Lp / flechaRatio + 1e-9, label: 'Flecha', text: `f = 5 q L⁴ / (384 E J) = ${fl.toFixed(2)} cm ≤ L / ${flechaRatio} = ${(Lp / flechaRatio).toFixed(1)} cm (Jx-x = ${Jxx.toFixed(0)} cm⁴; sin descontar la componente vertical de los cables)` },
  ];
  if (res.cable) res.checks.push({ ok: true, label: 'Cables de postesado', text: `Pk como carga de rotura ${Pk.toFixed(0)} kg → ${res.cable.n} cables ø ${res.cable.d} mm de ${res.cable.F} kg cada uno${res.cable.suspect ? ' (celda dudosa de la tabla)' : ''}` });
  res.ok = res.checks.every((c) => c.ok);
  return res;
}
