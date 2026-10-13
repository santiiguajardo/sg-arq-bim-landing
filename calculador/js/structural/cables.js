// Estructuras de grandes luces traccionadas (cables y telas): cercha Jawerth, cubierta pesada, paraboloide hiperbólico e hiperboloide de revolución.
// FUENTE: guías de predimensionado del Taller de Estructuras E4 (FAUD-UNMdP, curso 2024; carpeta e4/traccion): 1.1 Cercha Jawerth, 1.2 Cubierta pesada, 1.3 Hiperboloide de revolución,
// 1.4 Paraboloide hiperbólico y 1.5 Anexo de tablas (cables 6x19 y 6x24x7, telas, caños DIN 2448, ω de F-22 y F-24). Método de la cátedra: en cada cable portante
// con flecha del orden del 10 % de la luz la catenaria se resuelve como parábola, H = q L² / 8 f, V = q L / 2, R = √(H² + V²) (kg, m); tensión previa Tp ≥ la mayor fuerza que
// tiende a comprimir los cables × β1 (1,5 a 2); la carga de rotura del cable es el máximo esfuerzo × β2 (2) y se busca en la tabla de cables; apoyos descompuestos en tensor y columna.
// Todos los valores salen de las guías o de sus tablas; los datos de cargas, geometría y coeficientes los ingresa el usuario. Unidades: kg, m, cm donde se indica.
import * as S from './steel.js';
import { CABLE_TABLE_1, CABLE_TABLE_2, CABLE_STRENGTHS, GUIDE_CABLE, TELAS, TUBES_G } from './cables-data.js';

const rad = (d) => d * Math.PI / 180;
export { TELAS, TUBES_G, CABLE_STRENGTHS };

// ---------------------------------------------------------------- catálogos de cables
export const CABLE_CATALOGS = [
  ['guide', 'Valores citados en las guías: 6×19 con alma textil, 180 kg/mm²'],
  ...CABLE_STRENGTHS.map((s) => [`t1:${s}`, `Tabla 1 del anexo: 6×19×1 con alma textil, ${s} kg/mm²`]),
  ...CABLE_STRENGTHS.map((s) => [`t2:${s}`, `Tabla 2 del anexo: 6×24×7 con almas textiles, ${s} kg/mm²`]),
];

// Celdas de las tablas que no siguen la ley de sus vecinos (errores del catálogo escaneado): la carga de rotura de un cable crece con el cuadrado del diámetro y con la resistencia del alambre.
// Se marca una celda si rompe la monotonía por diámetro o por resistencia, o si F/d² se aparta más de 12 % de la mediana de su columna.
export function suspectCells(table) {
  const bad = new Set();
  const n = CABLE_STRENGTHS.length;
  const t = table === 2 ? CABLE_TABLE_2 : CABLE_TABLE_1;
  for (let c = 0; c < n; c++) {
    const ks = t.map((r) => r.F[c] / (r.d * r.d)).sort((a, b) => a - b);
    const med = ks[Math.floor(ks.length / 2)];
    t.forEach((r, i) => {
      const k = r.F[c] / (r.d * r.d);
      if (Math.abs(k / med - 1) > 0.12) bad.add(`${r.d}@${CABLE_STRENGTHS[c]}`);
      if (i > 0 && r.F[c] < t[i - 1].F[c]) { bad.add(`${r.d}@${CABLE_STRENGTHS[c]}`); }
      if (c > 0 && r.F[c] < r.F[c - 1]) bad.add(`${r.d}@${CABLE_STRENGTHS[c]}`);
    });
  }
  return bad;
}
const SUSPECT = { 1: suspectCells(1), 2: suspectCells(2) };

export function cablesOf(catalogId) {
  if (catalogId === 'guide') return GUIDE_CABLE.map((c) => ({ d: c.d, F: c.F, w: null, suspect: false }));
  const [tab, str] = String(catalogId).split(':');
  const t = tab === 't2' ? CABLE_TABLE_2 : CABLE_TABLE_1;
  const col = CABLE_STRENGTHS.indexOf(Number(str));
  if (col < 0) return [];
  const key = tab === 't2' ? 2 : 1;
  return t.map((r) => ({ d: r.d, F: r.F[col], w: r.w, suspect: SUSPECT[key].has(`${r.d}@${str}`) }));
}

// Primer cable del catálogo (por diámetro creciente) cuya carga de rotura alcanza Frot (kg) repartida en n cables iguales
export function selectCable(catalogId, Frot, n = 1) {
  const need = Frot / Math.max(1, n);
  const list = cablesOf(catalogId).sort((a, b) => a.d - b.d);
  const c = list.find((x) => x.F >= need) || null;
  return { cable: c, need, n, catalogId, ok: Boolean(c), warn: c ? c.suspect : false };
}

// ---------------------------------------------------------------- cable parabólico
// shape 'uniform': carga q (kg/m) repartida en toda la luz, H = q L² / 8 f, V = q L / 2.
// shape 'triangular' (cercha Jawerth radial: la faja de cubierta se ensancha hacia el borde): q es el valor máximo en los apoyos y cero en el centro,
// H = q L² / 24 f, V = q L / 4 (guía 1.1, anexo 2). La pendiente en el apoyo sale de V / H.
export function parabola({ q, L, f, shape = 'uniform' }) {
  const tri = shape === 'triangular';
  const H = tri ? q * L * L / (24 * f) : q * L * L / (8 * f);
  const V = tri ? q * L / 4 : q * L / 2;
  return { H, V, R: Math.hypot(H, V), slopeDeg: Math.atan2(V, H) * 180 / Math.PI };
}

// Descomposición plana de la reacción de un cable en un tensor inclinado (ángulo β con la horizontal, hacia abajo y afuera) y una columna vertical:
// el tensor equilibra la componente horizontal, la columna toma la vertical del cable más la del tensor. R tangente al cable en el apoyo (pendiente θ).
export function planarSupport({ R, thetaDeg, betaDeg }) {
  const H = R * Math.cos(rad(thetaDeg));
  const V = R * Math.sin(rad(thetaDeg));
  const T = H / Math.cos(rad(betaDeg));
  const C = V + T * Math.sin(rad(betaDeg));
  return { H, V, T, C, thetaDeg, betaDeg };
}

// ---------------------------------------------------------------- cercha Jawerth y paraboloide hiperbólico: dos familias de cables de curvatura contraria con tensión previa
// p: { L, f, a (m, área de influencia de cada cable; en la radial, ancho de la faja en el borde), Pp (kg/m²), W (kg/m², succión de viento en valor positivo), beta1, beta2, TpAdopt (0 = automática), catalog, nCables, shape ('uniform' | 'triangular') }
export function designCableNet(p) {
  const L = Number(p.L); const f = Number(p.f); const a = Number(p.a);
  const Qpp = Number(p.Pp) * a;
  const Qw = Number(p.W) * a;
  const shape = p.shape === 'triangular' ? 'triangular' : 'uniform';
  const pp = parabola({ q: Qpp / 2, L, f, shape });              // cada familia toma la mitad de la carga
  const w = parabola({ q: Qw / 2, L, f, shape });
  const res = { shape, L, f, a, lambda: f / L, Qpp, Qw, Rpp: pp.R, Hpp: pp.H, Vpp: pp.V, Rw: w.R, Hw: w.H, Vw: w.V, slopeDeg: pp.slopeDeg };
  // estados con Tp = 0 (para hallar la tensión previa mínima): la mayor fuerza de compresión
  const e1b = -pp.R;                                                // Rb = Tp − Rpp (estado 1)
  const e2a = pp.R - w.R;                                           // Ra = Tp + Rpp − Rw (estado 2)
  res.initial = { e1a: pp.R, e1b, e2a, e2b: -pp.R + w.R };
  res.Tp0 = Math.max(0, -e1b, -e2a);
  res.beta1 = Number(p.beta1) || 2;
  res.TpAuto = res.Tp0 * res.beta1;
  res.Tp = Number(p.TpAdopt) > 0 ? Number(p.TpAdopt) : res.TpAuto;
  res.TpOk = res.Tp >= res.Tp0 - 1e-9;
  const Tp = res.Tp;
  res.states = [
    { id: 'E0', label: 'Estado 0: tensión previa', Ra: Tp, Rb: Tp },
    { id: 'E1', label: 'Estado 1: tensión previa + peso propio', Ra: Tp + pp.R, Rb: Tp - pp.R },
    { id: 'E2', label: 'Estado 2: tensión previa + peso propio − viento', Ra: Tp + pp.R - w.R, Rb: Tp - pp.R + w.R },
  ];
  res.Ra = Math.max(...res.states.map((s) => s.Ra));
  res.Rb = Math.max(...res.states.map((s) => s.Rb));
  res.Rmax = Math.max(res.Ra, res.Rb);
  res.Rmin = Math.min(...res.states.flatMap((s) => [s.Ra, s.Rb]));
  res.noCompression = res.Rmin >= -1e-9;
  res.beta2 = Number(p.beta2) || 2;
  res.Rrot = res.Rmax * res.beta2;
  res.cableSel = selectCable(p.catalog, res.Rrot, Number(p.nCables) || 1);
  // resultante en el borde recto (los cables llegan a 90° entre sí): Rc = √(Ra² + Rb²) en cada estado
  res.Rc = res.states.map((s) => ({ id: s.id, Rc: Math.hypot(s.Ra, s.Rb) }));
  res.ok = res.noCompression && res.TpOk && res.cableSel.ok;
  return res;
}

// Carga equivalente de los pendolones (o de la tela) por metro de cable. Cilíndrica: qe = 2 R / (L √(1 / 16 λ² + 1)); radial (carga triangular): qe = 4 R / (L √(1 / 36 λ² + 1)), con λ = f / L.
export function pendantLoad({ R, L, lambda, shape = 'uniform' }) {
  return shape === 'triangular' ? 4 * R / (L * Math.sqrt(1 / (36 * lambda * lambda) + 1)) : 2 * R / (L * Math.sqrt(1 / (16 * lambda * lambda) + 1));
}

// R que se usa en la carga equivalente según dónde esté la cubierta: 'tela' o 'pend' (cubierta sobre ambas familias, cercha espacial): la reacción máxima;
// 'a' (cubierta sobre el cable a): R = Tp − Rpp + Rw; 'b' (cubierta tomada al cable b): R = Tp + Rpp (el viento no se considera: destracciona los pendolones).
export function pendantR(net, cover) {
  if (cover === 'a') return net.Tp - net.Rpp + net.Rw;
  if (cover === 'b') return net.Tp + net.Rpp;
  return net.Rmax;
}

// Descomposición de qe en la dirección que toma la tela (o el pendolón inclinado) entre un cable superior y uno inferior desfasados medio módulo:
// la separación horizontal entre ellos es a / 2 y la vertical varía de hA − hB en los apoyos a sc en la clave. Por cada metro de cable la tela toma qe (en dos paños):
// T = qe / (2 sen φ) con tg φ = separación vertical / (a / 2). La guía obtiene gráficamente 16,25 kg cada 50 mm en el apoyo y 73,80 en la clave.
export function slantForce({ q, rise, run }) {
  const phi = Math.atan2(Math.abs(rise), run);
  return { phi: phi * 180 / Math.PI, T: Math.sin(phi) > 1e-9 ? q / (2 * Math.sin(phi)) : Infinity };
}

// Cercha Jawerth completa. layout: 'espacial' (cables a y b desfasados medio módulo), 'plana' (coplanares) o 'radial' (planta circular);
// cover: 'tela' (tela estructural: cerramiento y pendolón a la vez), 'pend' (pendolones inclinados de cable, solo desfasadas), 'a' o 'b' (pendolones verticales, solo plana o radial).
// p: datos de designCableNet más { layout, cover, b (separación entre pendolones, m), hA, hB (alturas de las columnas, m), sc (separación vertical entre cables en la clave, m, cercha espacial),
//    es (separación vertical entre los cables en el apoyo, m, cercha plana), betaA, betaB (ángulos de los tensores, °), sigmaSteel, k, omegaTable }
export function designJawerth(p) {
  const layout = ['espacial', 'plana', 'radial'].includes(p.layout) ? p.layout : 'espacial';
  const shape = layout === 'radial' ? 'triangular' : 'uniform';
  const net = designCableNet({ ...p, shape });
  const valid = layout === 'espacial' ? ['tela', 'pend'] : layout === 'plana' ? ['a', 'b'] : ['tela', 'pend', 'a', 'b'];
  const cover = valid.includes(p.cover) ? p.cover : valid[0];
  const spatial = cover === 'tela' || cover === 'pend';
  const R = pendantR(net, cover);
  const qe = pendantLoad({ R, L: net.L, lambda: net.lambda, shape });
  const sigma = Number(p.sigmaSteel) || 1400; const table = p.omegaTable || 'F-22';
  const pend = { layout, cover, spatial, R, qe, shape };
  const hA = Number(p.hA); const hB = Number(p.hB);
  if (spatial) {
    const run = net.a / 2;
    const riseS = Math.abs(hA - hB); const riseC = Number(p.sc);
    pend.run = run; pend.riseS = riseS; pend.riseC = riseC;
    if (cover === 'tela') {
      pend.qer = qe * net.beta2 / 20;                                   // carga de rotura cada 50 mm (kg/50 mm) sin descomponer
      const s1 = slantForce({ q: pend.qer, rise: riseS, run });
      const s2 = slantForce({ q: pend.qer, rise: riseC, run });
      Object.assign(pend, { phiS: s1.phi, phiC: s2.phi, qer1: s1.T, qer2: s2.T, qerMax: Math.max(s1.T, s2.T) });
      pend.telas = telasFor(pend.qerMax);
      pend.ok = Number.isFinite(pend.qerMax) && pend.telas.some((t) => t.ok);
    } else {
      const b = Number(p.b);
      const F = qe * b;
      const s1 = slantForce({ q: F, rise: riseS, run });
      const s2 = slantForce({ q: F, rise: riseC, run });
      Object.assign(pend, { b, F, phiS: s1.phi, phiC: s2.phi, TS: s1.T, TC: s2.T, Tpend: Math.max(s1.T, s2.T) });
      pend.Trot = pend.Tpend * net.beta2;
      pend.cableSel = Number.isFinite(pend.Trot) ? selectCable(p.catalog, pend.Trot, 1) : { cable: null, ok: false, need: Infinity, n: 1 };
      pend.ok = pend.cableSel.ok;
    }
  } else {
    // pendolones verticales: los cables a (superior, cóncavo hacia arriba) y b (inferior, arqueado) están en el mismo plano vertical con una separación
    // es en los apoyos; la separación g(x) = es − 8 f x (L − x) / L² cambia de signo cuando los cables se cruzan (pendolones comprimidos entre los cruces)
    const n = Math.max(2, Math.round(net.L / Math.max(Number(p.b), 0.05)));
    const bReal = net.L / n;
    const es = Number(p.es);
    const F = qe * bReal;
    const rows = [];
    for (let i = 1; i < n; i++) {
      const x = i * bReal;
      const g = es - 8 * net.f * x * (net.L - x) / (net.L * net.L);
      rows.push({ i, x, g, len: Math.abs(g), kind: g >= 0 ? 'T' : 'C' });
    }
    const comp = rows.filter((r) => r.kind === 'C');
    const u = es < 2 * net.f ? (1 - Math.sqrt(1 - es / (2 * net.f))) / 2 : null;
    Object.assign(pend, { b: bReal, n, es, F, rows, nT: rows.length - comp.length, nC: comp.length, xCross: u === null ? null : [u * net.L, net.L - u * net.L] });
    pend.Trot = F * net.beta2;
    pend.cableSel = selectCable(p.catalog, pend.Trot, 1);
    pend.ok = pend.cableSel.ok || rows.every((r) => r.kind === 'C');
    if (comp.length) {
      const lmax = Math.max(...comp.map((r) => r.len));
      pend.lmax = lmax;
      const pk = pickTubeG({ N: F, h: lmax, k: 1, sigmaAdm: sigma, omegaTable: table });
      pend.tube = pk ? pk.tube : null; pend.chk = pk ? pk.chk : null;
      pend.ok = pend.ok && Boolean(pk);
    }
    pend.maxT = rows.filter((r) => r.kind === 'T').reduce((a, r) => Math.max(a, r.len), 0);
  }
  return { layout, cover, shape, net, pend };
}

// Telas que alcanzan una carga de rotura (kg cada 50 mm) en las dos direcciones (se usa la menor resistencia: del lado seguro)
export function telasFor(qrot) {
  return TELAS.map((t) => ({ ...t, min: Math.min(t.A, t.B), ok: Math.min(t.A, t.B) >= qrot })).sort((x, y) => x.g - y.g);
}

// ---------------------------------------------------------------- cubierta pesada: un cable por faja, el peso propio mantiene traccionado el cable (Pp ≥ 2,5 a 3 veces la succión)
export function designHeavyRoof(p) {
  const L = Number(p.L); const f = Number(p.f); const a = Number(p.a);
  const Qpp = Number(p.Pp) * a;
  const Qw = Number(p.W) * a;
  const pp = parabola({ q: Qpp, L, f });
  const w = parabola({ q: Qw, L, f });
  const res = { L, f, a, lambda: f / L, Qpp, Qw, Rpp: pp.R, Hpp: pp.H, Vpp: pp.V, Rw: w.R, Hw: w.H, Vw: w.V, slopeDeg: pp.slopeDeg };
  res.ratio = Number(p.W) > 0 ? Number(p.Pp) / Number(p.W) : Infinity;
  res.ratioMin = Number(p.ratioMin) || 2.5;
  res.ratioOk = res.ratio >= res.ratioMin - 1e-9;
  res.states = [
    { id: 'E1', label: 'Estado 1: peso propio', R: pp.R },
    { id: 'E2', label: 'Estado 2: peso propio − viento', R: pp.R - w.R },
  ];
  res.Rmax = pp.R;
  res.noCompression = res.states.every((s) => s.R >= -1e-9);
  res.beta2 = Number(p.beta2) || 2;
  res.Rrot = res.Rmax * res.beta2;
  res.cableSel = selectCable(p.catalog, res.Rrot, Number(p.nCables) || 1);
  res.ok = res.noCompression && res.ratioOk && res.cableSel.ok;
  return res;
}

// Columna de hormigón armado predimensionada con la regla de la guía: Fb = N / σ (σ = 60 kg/cm² para H13, AB42, coeficiente 2,5 y cuantía 1 %), Fe = cuantía × Fb
export function concreteColumnGuide({ N, sigma = 60, rho = 0.01 }) {
  const Fb = N / sigma;
  return { Fb, Fe: Fb * rho, sigma, rho };
}

// ---------------------------------------------------------------- columnas y puntales tubulares: verificación al pandeo con las tablas ω del anexo (F-22 o F-24)
export function tubeProps(D, e) {              // cm
  const d = D - 2 * e;
  const A = Math.PI / 4 * (D * D - d * d);
  const I = Math.PI / 64 * (D ** 4 - d ** 4);
  return { de: D * 10, s: e * 10, A, I, i: Math.sqrt(I / A), G: A * 0.785 };
}
export function checkTubeColumn({ N, h, k = 1, tube, sigmaAdm = 1400, omegaTable = 'F-22' }) {
  const Sk = k * h * 100;
  const lambda = Sk / tube.i;
  const omega = S.omegaOf(lambda, omegaTable);
  if (omega === null) return { ok: false, lambda, omega: null, sigma: Infinity, Sk, sigmaAdm };
  const sigma = omega * N / tube.A;
  return { ok: sigma <= sigmaAdm + 1e-9, lambda, omega, sigma, Sk, sigmaAdm, Fnec: N / sigmaAdm };
}
// Busca en la Tabla G (DIN 2448) el caño más liviano que verifica; null si ninguno alcanza (entonces se ingresa un tubo propio)
export function pickTubeG({ N, h, k = 1, sigmaAdm = 1400, omegaTable = 'F-22' }) {
  const list = [...TUBES_G].sort((x, y) => x.G - y.G);
  for (const t of list) {
    const c = checkTubeColumn({ N, h, k, tube: t, sigmaAdm, omegaTable });
    if (c.ok) return { tube: t, chk: c };
  }
  return null;
}
export const tubeGByArea = (Fnec) => [...TUBES_G].sort((x, y) => x.A - y.A).find((t) => t.A >= Fnec) || null;

// ---------------------------------------------------------------- borde recto del paraboloide hiperbólico: viga reticulada con columnas cada s metros
// Rc (kg): resultante de los dos cables en cada nudo del borde (uno cada a metros); la viga se carga con las fuerzas Rc normales a ella
export function edgeBeam({ Rc, a, s, h = 0.3, sigmaAdm = 1200 }) {
  const n = Math.max(1, Math.round(s / a));                       // tramos de cable por vano de viga
  const loads = [];
  for (let i = 1; i < n; i++) loads.push(i * a);                  // fuerzas intermedias (las de los extremos van directo a la columna)
  const RA = loads.reduce((acc, x) => acc + Rc * (s - x) / s, 0);
  let Mmax = 0;
  for (let x = 0; x <= s + 1e-9; x += s / 200) {
    let M = RA * x;
    loads.forEach((xi) => { if (x > xi) M -= Rc * (x - xi); });
    Mmax = Math.max(Mmax, M);
  }
  const C = Mmax / h;                                             // kg·m / m
  const Fnec = C / sigmaAdm;
  return { n, loads, RA, M: Mmax, C, Fnec, tube: tubeGByArea(Fnec), colN: n * Rc, h, sigmaAdm };
}

// ---------------------------------------------------------------- paraboloide hiperbólico completo (cables cada a metros) y variante con membrana (franjas de 5 cm)
export function designHypar(p) {
  const net = designCableNet(p);
  const out = { net };
  out.edge = edgeBeam({ Rc: Math.max(...net.Rc.map((r) => r.Rc)), a: Number(p.a), s: Number(p.sCol) || 3, h: Number(p.hEdge) || 0.3, sigmaAdm: Number(p.sigmaEdge) || 1200 });
  if (p.membrane) {
    // franjas de 5 cm de tela (a = 0,05 m): las fuerzas salen directamente en kg cada 50 mm; la tensión previa de la franja se calcula sola
    const strip = designCableNet({ ...p, a: 0.05, TpAdopt: 0, catalog: 'guide' });
    out.strip = strip;
    out.stripRrot = strip.Rmax * strip.beta2;                      // kg cada 50 mm
    out.stripRc = Math.max(...strip.Rc.map((r) => r.Rc));          // resultante de las dos franjas a 90° en el borde (kg cada 50 mm)
    out.telas = telasFor(out.stripRrot);
  }
  return out;
}

// Cable de borde colector (variante con membrana): parábola de luz Lb y flecha fb cargada con q (kg/m) = qe(kg cada 5 cm) × 20
export function edgeCable({ qe5, Lb, fb, beta2 = 2, catalog, nCables = 2 }) {
  const q = qe5 * 20;
  const par = parabola({ q, L: Lb, f: fb });
  return { q, ...par, Rrot: par.R * beta2, cableSel: selectCable(catalog, par.R * beta2, nCables) };
}

// ---------------------------------------------------------------- hiperboloide de revolución (tensión previa, meridianos y paralelos)
// p: { c, x0, dx, nNodes, xAxis, nMer, Pp (kg/m²), W (kg/m²), areas (m² por nudo, opcional), beta1, beta2, catalog, sigmaSteel }
export function designHyperboloid(p) {
  const c = Number(p.c); const x0 = Number(p.x0); const dx = Number(p.dx); const n = Math.round(Number(p.nNodes));
  const nMer = Math.round(Number(p.nMer));
  const nodes = [];
  for (let i = 0; i < n; i++) { const x = x0 + i * dx; nodes.push({ i: i + 1, x, y: c * c / x, r: x - Number(p.xAxis) }); }
  const segs = [];
  for (let j = 0; j < n - 1; j++) {
    const dr = nodes[j + 1].r - nodes[j].r;
    const dy = nodes[j].y - nodes[j + 1].y;
    segs.push({ j: j + 1, theta: Math.atan2(dy, dr), len: Math.hypot(dr, dy) });
  }
  nodes.forEach((nd, i) => {
    nd.per = 2 * Math.PI * nd.r;
    nd.a = nd.per / nMer;
    const b = i === 0 ? segs[0].len / 2 : i === n - 1 ? segs[n - 2].len / 2 : (segs[i - 1].len + segs[i].len) / 2;
    nd.b = b;
    nd.Acalc = nd.a * b;
    nd.A = Array.isArray(p.areas) && Number(p.areas[i]) > 0 ? Number(p.areas[i]) : nd.Acalc;
    nd.Pp = Number(p.Pp) * nd.A;
    nd.Wv = Number(p.W) * nd.A;                                      // viento hacia arriba (succión)
  });
  // fuerzas en meridianos y paralelos para una carga vertical por nudo (kg, + hacia abajo): m_j = −(Σ cargas hasta j)/sen θ_j (compresión < 0)
  const state = (loads) => {
    let cum = 0;
    const m = []; const h = [];
    segs.forEach((sg, k) => { cum += loads[k]; const mj = -cum / Math.sin(sg.theta); m.push(mj); h.push(mj * Math.cos(sg.theta)); });
    const H = [];                                                    // fuerza radial en cada nudo que equilibran los paralelos
    for (let k = 0; k < n - 1; k++) H.push(k === 0 ? h[0] : h[k] - h[k - 1]);
    return { m, h, H, Hsupport: h[n - 2] };
  };
  const To = Number(p.To) || 1000;
  const Sp = state(nodes.map((nd) => nd.Pp));
  const Sw = state(nodes.map((nd) => -nd.Wv));
  const St = state(nodes.map((nd, k) => (k === 0 ? -To : 0)));      // tensión previa teórica: componente vertical constante To en cada meridiano
  const K = [];
  Sp.m.forEach((v, k) => K.push({ kind: 'm', k: k + 1, K: Math.abs(v) / Math.abs(St.m[k]) }));
  Sp.H.forEach((v, k) => K.push({ kind: 'H', k: k + 1, K: Math.abs(v) / Math.abs(St.H[k]) }));
  const Kmax = Math.max(...K.map((x) => x.K));
  const beta1 = Number(p.beta1) || 1.5;
  const TpAuto = To * Kmax * beta1;
  const Tp = Number(p.TpAdopt) > 0 ? Number(p.TpAdopt) : TpAuto;
  const sc = Tp / To;
  const members = [];
  segs.forEach((sg, k) => {
    const t = St.m[k] * sc;
    members.push({ kind: 'm', k: k + 1, Pp: Sp.m[k], V: Sw.m[k], PpV: Sp.m[k] + Sw.m[k], To: St.m[k], Tp: t, TpPp: t + Sp.m[k], TpPpV: t + Sp.m[k] + Sw.m[k], a: nodes[k + 1].a });
  });
  for (let k = 0; k < n - 1; k++) {
    const t = St.H[k] * sc;
    members.push({ kind: 'H', k: k + 1, Pp: Sp.H[k], V: Sw.H[k], PpV: Sp.H[k] + Sw.H[k], To: St.H[k], Tp: t, TpPp: t + Sp.H[k], TpPpV: t + Sp.H[k] + Sw.H[k] });
  }
  const tH = St.h[n - 2] * sc + Sp.h[n - 2] + Sw.h[n - 2];
  const parallels = [];
  for (let k = 0; k < n - 1; k++) {
    const H = members.find((x) => x.kind === 'H' && x.k === k + 1).TpPpV;
    parallels.push({ k: k + 1, H, r: nodes[k].r, a: nodes[k].a, P: H * nodes[k].r / nodes[k].a });
  }
  parallels.push({ k: n, H: tH, r: nodes[n - 1].r, a: nodes[n - 1].a, P: tH * nodes[n - 1].r / nodes[n - 1].a, support: true });
  const mMax = Math.max(...members.filter((x) => x.kind === 'm').map((x) => Math.abs(x.TpPpV)));
  const PMax = Math.max(...parallels.filter((x) => !x.support).map((x) => Math.abs(x.P)));
  const beta2 = Number(p.beta2) || 2;
  const cableM = selectCable(p.catalog, Math.max(mMax, PMax) * beta2, 1);
  // tela cada 50 mm: meridianos F / a (a del nudo inferior de la franja) y paralelos P / b; el valor se divide por 20
  const telaRows = [];
  members.filter((x) => x.kind === 'm').forEach((mm) => telaRows.push({ id: `m${mm.k}-${mm.k + 1}`, F: Math.abs(mm.TpPpV), len: mm.a, tela: Math.abs(mm.TpPpV) / mm.a / 20 }));
  parallels.filter((x) => !x.support).forEach((pp) => telaRows.push({ id: `Paralelo ${pp.k}`, F: Math.abs(pp.P), len: nodes[pp.k - 1].b, tela: Math.abs(pp.P) / nodes[pp.k - 1].b / 20 }));
  const telaMax = Math.max(...telaRows.map((x) => x.tela));
  // apoyo inferior: la vertical neta sobre el nudo del apoyo y el anillo comprimido
  const sumPp = nodes.reduce((acc, nd) => acc + nd.Pp, 0);
  const sumW = nodes.reduce((acc, nd) => acc + nd.Wv, 0);
  const upliftSupport = Tp + sumW - sumPp;
  const sig = Number(p.sigmaSteel) || 1400;
  const support = { upliftSupport, FeUplift: Math.max(0, upliftSupport) / sig, ring: parallels[parallels.length - 1].P, FeRing: Math.abs(parallels[parallels.length - 1].P) / sig, sigma: sig };
  return { nodes, segs, To, Sp, Sw, St, K, Kmax, beta1, TpAuto, Tp, members, parallels, mMax, PMax, beta2, cableM, telaRows, telaMax, telas: telasFor(telaMax * beta2), support, sumPp, sumW, ok: cableM.ok };
}
