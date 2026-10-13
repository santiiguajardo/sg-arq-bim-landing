// Estructuras de grandes luces de compresión dominante: cubierta cilíndrica de onda parabólica (cerámica armada u otro material), arco de tres articulaciones A, B y la clave C.
// FUENTE: guía de predimensionado 2.1 "Compresión dominante" del Taller de Estructuras E4 (curso 2024; carpeta e4). Método de la cátedra: la generatriz es una parábola de
// parámetro p = (L/2)² / 2 f (y = x² / 2p desde la clave); la onda se carga por metro de directriz (peso propio = peso específico × volumen de 1 m de onda); la acción del viento se simplifica
// con cargas verticales (barlovento + W, sotavento − W) repartidas en tramos de 3 m medidos en planta. En lugar del método gráfico de cambio de polo se resuelve el mismo arco de tres articulaciones
// por equilibrio: V_A = Σ P (L − u) / L, H = (V_A L/2 − Σ_izq P (L/2 − u)) / f; la línea de presiones se compara con el eje de la onda (excentricidad e = M / R).
// Verificaciones de la guía: e ≤ h / 6 (núcleo central), compresión σ = R / F ≤ σadm, pandeo J necesario = Pk Lp² / (π² E) con Pk = 2 R y Lp la longitud del semiarco, flexocompresión
// σ = −R / F ± R e / W con W = J / (H / 2). Unidades: kg, m, cm donde se indica.

const rad = (d) => d * Math.PI / 180;
void rad;

// ---------------------------------------------------------------- geometría del eje
export function parabolaParam(L, f) { return (L / 2) ** 2 / (2 * f); }
// ordenada del eje bajo la clave a la abscisa u (desde el apoyo izquierdo)
export const depthBelowCrown = (u, L, f) => ((u - L / 2) ** 2) / (2 * parabolaParam(L, f));

// ---------------------------------------------------------------- sección de la onda (corte perpendicular a la curva)
// Perfil: planos horizontales de ancho b (superior e inferior de cada onda) unidos por dos planos inclinados de proyección horizontal b' y altura H − d, espesor d. Ancho de onda B = 2 (b + b').
export function ondaProps({ b, bp, H, d, gamma, Jover = 0 }) {
  const hw = H - d;
  const c = Math.hypot(bp, hw);                                        // longitud de cada plano inclinado
  const desarrollo = 2 * b + 2 * c;
  const F = d * desarrollo;                                            // m² (= m³ por metro de onda)
  const Jalas = 2 * b * d * ((H - d) / 2) ** 2 + 2 * b * d ** 3 / 12;  // dos alas de ancho b a ± (H − d) / 2 del baricentro
  const sin2 = (hw / c) ** 2;
  const cos2 = (bp / c) ** 2;
  const Jalma = 2 * (d * c ** 3 / 12 * sin2 + c * d ** 3 / 12 * cos2);  // dos planos inclinados de longitud c
  const Jcalc = Jalas + Jalma;
  const J = Number(Jover) > 0 ? Number(Jover) : Jcalc;                  // m⁴
  return { b, bp, H, d, c, B: 2 * (b + bp), desarrollo, F, Jalas, Jalma, Jcalc, J, Jover: Number(Jover) > 0, W: J / (H / 2), pesoM: gamma * F };
}

// ---------------------------------------------------------------- arco de tres articulaciones con cargas verticales repartidas por tramo
// loads: [{ u1, u2 (m, desde el apoyo izquierdo), P (kg, repartida en planta de forma uniforme entre u1 y u2) }]; las reacciones se obtienen con la resultante de cada tramo en su punto medio
// (como en el método gráfico de la guía) y los esfuerzos de cada sección con la parte de cada tramo que queda de un lado de ella.
export function threeHinged({ L, f, loads }) {
  const mid = (l) => (l.u1 + l.u2) / 2;
  const SP = loads.reduce((a, l) => a + l.P, 0);
  const VA = loads.reduce((a, l) => a + l.P * (L - mid(l)), 0) / L;
  const VB = SP - VA;
  // parte de un tramo que queda a la izquierda (o a la derecha) de la abscisa u: fuerza y posición de su resultante
  const leftPart = (l, u) => { const e = Math.min(Math.max(u, l.u1), l.u2); const fr = (e - l.u1) / (l.u2 - l.u1); return { P: l.P * fr, x: (l.u1 + e) / 2 }; };
  const rightPart = (l, u) => { const s = Math.min(Math.max(u, l.u1), l.u2); const fr = (l.u2 - s) / (l.u2 - l.u1); return { P: l.P * fr, x: (s + l.u2) / 2 }; };
  const momLeft = (u) => loads.reduce((a, l) => { const q = leftPart(l, u); return a + q.P * (u - q.x); }, 0);
  const momRight = (u) => loads.reduce((a, l) => { const q = rightPart(l, u); return a + q.P * (q.x - u); }, 0);
  const H = (VA * L / 2 - momLeft(L / 2)) / f;
  const at = (u, za) => {
    if (u <= L / 2) {
      const V = VA - loads.reduce((a, l) => a + leftPart(l, u).P, 0);
      return { M: VA * u - H * za - momLeft(u), V, N: Math.hypot(H, V) };
    }
    const V = VB - loads.reduce((a, l) => a + rightPart(l, u).P, 0);
    return { M: VB * (L - u) - H * za - momRight(u), V, N: Math.hypot(H, V) };
  };
  // línea de presiones: altura sobre el nivel de los apoyos
  const thrust = (u) => (u <= L / 2 ? (VA * u - momLeft(u)) / H : (VB * (L - u) - momRight(u)) / H);
  return { VA, VB, H, RA: Math.hypot(H, VA), RB: Math.hypot(H, VB), SP, at, thrust };
}

// ---------------------------------------------------------------- diseño completo
// p: { L, f, dxT (m, ancho en planta de cada tramo de carga), onda: { b, bp, H, d, Jover }, gamma (kg/m³), pw (kg/m², presión de viento a barlovento; el sotavento es la succión del mismo valor),
//      sigmaAdm (kg/cm²), E (kg/cm²), betaPandeo, reforzada: { b, bp, H, d, Jover } | null, windSide: 'left' | 'right', nSections }
export function designCylinderShell(p) {
  const L = Number(p.L); const f = Number(p.f);
  const dxT = Math.min(Number(p.dxT) || 3, L / 2);
  const gamma = Number(p.gamma) || 1800;
  const on = ondaProps({ ...p.onda, gamma });
  const pp = parabolaParam(L, f);
  const yAxis = (u) => depthBelowCrown(u, L, f);
  const zAxis = (u) => f - yAxis(u);                                    // altura del eje sobre el nivel de los apoyos
  // longitud de arco entre dos abscisas (integración numérica del eje)
  const arc = (u1, u2) => {
    const n = 200; let s = 0;
    for (let i = 0; i < n; i++) { const a = u1 + (u2 - u1) * i / n; const b = u1 + (u2 - u1) * (i + 1) / n; s += Math.hypot(b - a, yAxis(b) - yAxis(a)); }
    return s;
  };
  // tramos de carga en planta (desde el apoyo izquierdo)
  const tramos = [];
  for (let u = 0; u < L - 1e-9; u += dxT) {
    const u2 = Math.min(u + dxT, L);
    const len = arc(u, u2);
    tramos.push({ i: tramos.length + 1, u1: u, u2, uc: (u + u2) / 2, len, Pp: len * on.pesoM });
  }
  const windSign = p.windSide === 'right' ? -1 : 1;
  const wLine = Number(p.pw) * on.desarrollo;                           // kg por metro de arco
  tramos.forEach((t) => { t.W = wLine * t.len * (t.uc < L / 2 ? windSign : -windSign); t.PpW = t.Pp + t.W; });
  const stateOf = (key) => {
    const sol = threeHinged({ L, f, loads: tramos.map((t) => ({ u1: t.u1, u2: t.u2, P: t[key] })) });
    const nS = Number(p.nSections) || Math.round(L / 1.5);
    const sections = [];
    for (let k = 0; k <= nS; k++) {
      const u = L * k / nS;
      const s = sol.at(u, zAxis(u));
      sections.push({ u, y: yAxis(u), M: s.M, N: s.N, V: s.V, e: s.N > 0 ? s.M / s.N : 0 });
    }
    const emax = sections.reduce((a, s) => (Math.abs(s.e) > Math.abs(a.e) ? s : a), sections[0]);
    return { ...sol, sections, emax };
  };
  const sPp = stateOf('Pp');
  const sPW = stateOf('PpW');
  const Ra = Math.max(sPp.RA, sPp.RB, sPW.RA, sPW.RB);
  const sigmaAdm = Number(p.sigmaAdm) || 10;
  const E = Number(p.E) || 100000;
  const out = { L, f, p: pp, dxT, gamma, on, tramos, wLine, sPp, sPW, Ra, sigmaAdm, E, ok: true, checks: [] };
  const Lp = tramos.filter((t) => t.uc < L / 2).reduce((a, t) => a + t.len, 0) * 100;           // semiarco (cm)
  out.Lp = Lp;
  const F = on.F * 1e4;                                                                      // cm²
  // núcleo central: e ≤ h / 6 con h la altura de la onda
  const kern = on.H / 6;
  out.kern = kern;
  out.kernPp = Math.abs(sPp.emax.e) <= kern + 1e-9;
  out.kernPW = Math.abs(sPW.emax.e) <= kern + 1e-9;
  // compresión máxima
  out.sigmaC = Ra / F;
  out.sigmaOk = out.sigmaC <= sigmaAdm + 1e-9;
  // pandeo
  const betaP = Number(p.betaPandeo) || 2;
  out.Pk = Ra * betaP;
  out.Jnec = out.Pk * Lp * Lp / (Math.PI ** 2 * E);                                          // cm⁴
  out.Jadop = on.J * 1e8;
  out.bucklingOk = out.Jnec <= out.Jadop + 1e-9;
  // altura de onda necesaria para que la línea de presiones de Pp + viento entre en el núcleo (e ≤ H / 6)
  out.Hnec = 6 * Math.abs(sPW.emax.e);
  // flexocompresión en la sección de mayor excentricidad con la onda reforzada (o la propia si no hay)
  const onR = p.reforzada ? ondaProps({ ...p.reforzada, gamma }) : on;
  out.onR = onR;
  out.hasRef = Boolean(p.reforzada);
  const sec = sPW.emax;
  const FR = onR.F * 1e4;
  const WR = onR.W * 1e6;                                                                    // cm³ (W = J / (H/2), J en m⁴ → cm⁴ = 1e8; H/2 en cm)
  const WRcm = onR.J * 1e8 / (onR.H * 100 / 2);
  void WR;
  const e = Math.abs(sec.e) * 100;                                                           // cm
  const sA = -sec.N / FR - sec.N * e / WRcm;
  const sB = -sec.N / FR + sec.N * e / WRcm;
  out.flex = { R: sec.N, e, F: FR, W: WRcm, sA, sB, u: sec.u, kern: onR.H / 6, kernOk: Math.abs(sec.e) <= onR.H / 6 + 1e-9, allCompressed: Math.max(sA, sB) <= 1e-9, ok: Math.min(sA, sB) >= -sigmaAdm - 1e-9 && Math.max(sA, sB) <= 1e-9 };
  out.checks = [
    { ok: out.kernPp, label: 'Excentricidad con el peso propio', text: `e máx = ${(Math.abs(sPp.emax.e) * 100).toFixed(1)} cm ${out.kernPp ? '≤' : '>'} h/6 = ${(kern * 100).toFixed(1)} cm (compresión baricéntrica del peso propio)` },
    { ok: out.kernPW || (out.hasRef && out.flex.ok), label: 'Excentricidad con peso propio y viento', text: `e máx = ${(Math.abs(sPW.emax.e) * 100).toFixed(1)} cm ${out.kernPW ? '≤' : '>'} h/6 = ${(kern * 100).toFixed(1)} cm${out.kernPW ? '' : out.hasRef && out.flex.ok ? ': sale del núcleo central de la onda inicial; se resuelve reforzando la onda en esa zona (flexocompresión abajo)' : `: no verifica la compresión dominante; hace falta h ≥ 6 e = ${(out.Hnec * 100).toFixed(0)} cm o reforzar/rediseñar la onda`}` },
    { ok: out.sigmaOk, label: 'Compresión máxima', text: `Ra = ${Ra.toFixed(0)} kg: σ = Ra / F = ${out.sigmaC.toFixed(2)} ${out.sigmaOk ? '≤' : '>'} ${sigmaAdm} kg/cm²` },
    { ok: out.bucklingOk, label: 'Pandeo', text: `Jx nec = Pk Lp² / (π² E) = ${out.Jnec.toFixed(0)} cm⁴ ${out.bucklingOk ? '≤' : '>'} ${out.Jadop.toFixed(0)} cm⁴ (Pk = ${out.Pk.toFixed(0)} kg, Lp = ${Lp.toFixed(0)} cm)` },
    { ok: out.flex.ok, label: `Flexocompresión${out.hasRef ? ' con la onda reforzada' : ''} en x = ${sec.u.toFixed(1)} m`, text: `σ = −R/F ∓ R e/W = ${sA.toFixed(2)} / ${sB.toFixed(2)} kg/cm² (R = ${sec.N.toFixed(0)} kg, e = ${e.toFixed(1)} cm, F = ${FR.toFixed(0)} cm², W = ${WRcm.toFixed(0)} cm³)${out.flex.allCompressed ? ': toda la sección comprimida' : ': hay tracción'} (h/6 = ${(onR.H / 6 * 100).toFixed(1)} cm)` },
  ];
  out.ok = out.checks.every((c) => c.ok);
  // apoyos: la reacción del estado más desfavorable
  const worst = sPW.RA >= sPW.RB ? { side: 'A', V: sPW.VA, H: sPW.H, R: sPW.RA } : { side: 'B', V: sPW.VB, H: sPW.H, R: sPW.RB };
  out.support = worst;
  return out;
}

// puntos de la línea de presiones y del eje para dibujar
export function thrustCurve(res, state, n = 120) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const u = res.L * k / n; pts.push({ u, zt: state.thrust(u), za: res.f - depthBelowCrown(u, res.L, res.f) }); }
  return pts;
}
