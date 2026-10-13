// Losa maciza armada en dos direcciones, apoyada en vigas rígidas en sus cuatro bordes (CIRSOC 201-2005, Cap. 13).
// El art. 13.5.1 admite cualquier procedimiento que satisfaga equilibrio y compatibilidad: se resuelve la placa elástica
// delgada (Kirchhoff) con diferencias finitas, con cada borde apoyado ('S') o empotrado ('C', continuidad con otro paño).
// Unidades de la placa: m y kN (momentos en kN·m por metro de ancho para una carga unitaria de 1 kN/m2).
// Las armaduras se dimensionan con rc.js (N, mm, MPa).
import { CIRSOC201 as N } from './norms.js';
import * as rc from './rc.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ---------------------------------------------------------------- placa de Kirchhoff
// a: luz en x, b: luz en y. edges: { x0, x1, y0, y1 } con 'S' o 'C'. q = 1 kN/m2, D = 1.
// Devuelve w (para D = 1), mx y my en todos los nodos (i = 0..nx, j = 0..ny).
export function solvePlate({ a, b, edges, nu = 0.2, div = 24 }) {
  const short = Math.min(a, b);
  const nx = Math.max(4, Math.round(div * a / short));
  const ny = Math.max(4, Math.round(div * b / short));
  const hx = a / nx;
  const hy = b / ny;
  // incógnitas: nodos interiores; se numera con el lado corto como índice rápido para achicar el ancho de banda
  const mx_ = nx - 1;
  const my_ = ny - 1;
  const alongX = nx >= ny;                      // lado largo = x -> índice = i * my_ + j
  const inner = alongX ? my_ : mx_;
  const idx = (i, j) => (alongX ? (i - 1) * my_ + (j - 1) : (j - 1) * mx_ + (i - 1));
  const n = mx_ * my_;
  const p = 2 * inner + 2;                      // semiancho de banda (el patrón llega a ±2 nodos)
  const W = 2 * p + 1;
  const A = Array.from({ length: n }, () => new Float64Array(W));
  const rhs = new Float64Array(n).fill(1);
  const cxx = 1 / hx ** 4;
  const cyy = 1 / hy ** 4;
  const cxy = 2 / (hx * hx * hy * hy);
  const add = (r, i, j, v) => {
    if (i < 1 || i > nx - 1 || j < 1 || j > ny - 1) return;      // nodo de borde: w = 0
    A[r][idx(i, j) - r + p] += v;
  };
  // w fuera del dominio (i = -1, nx + 1, j = -1, ny + 1): simetría (empotrado) o antisimetría (apoyado) respecto del borde
  const ghost = (edge) => (edge === 'C' ? 1 : -1);
  for (let j = 1; j < ny; j++) {
    for (let i = 1; i < nx; i++) {
      const r = idx(i, j);
      const put = (ii, jj, v) => {
        let sgn = 1;
        if (ii === -1) { sgn = ghost(edges.x0); ii = 1; }
        else if (ii === nx + 1) { sgn = ghost(edges.x1); ii = nx - 1; }
        if (jj === -1) { sgn *= ghost(edges.y0); jj = 1; }
        else if (jj === ny + 1) { sgn *= ghost(edges.y1); jj = ny - 1; }
        add(r, ii, jj, sgn * v);
      };
      put(i, j, 6 * cxx + 6 * cyy + 2 * cxy * 2);
      put(i - 1, j, -4 * cxx - 2 * cxy); put(i + 1, j, -4 * cxx - 2 * cxy);
      put(i, j - 1, -4 * cyy - 2 * cxy); put(i, j + 1, -4 * cyy - 2 * cxy);
      put(i - 2, j, cxx); put(i + 2, j, cxx);
      put(i, j - 2, cyy); put(i, j + 2, cyy);
      put(i - 1, j - 1, cxy); put(i + 1, j - 1, cxy); put(i - 1, j + 1, cxy); put(i + 1, j + 1, cxy);
    }
  }
  // eliminación de Gauss en banda (la matriz es simétrica definida positiva: no hace falta pivotear)
  for (let k = 0; k < n; k++) {
    const piv = A[k][p];
    const last = Math.min(n - 1, k + p);
    for (let r = k + 1; r <= last; r++) {
      const f = A[r][k - r + p] / piv;
      if (f === 0) continue;
      for (let c = k; c <= Math.min(n - 1, k + p); c++) A[r][c - r + p] -= f * A[k][c - k + p];
      rhs[r] -= f * rhs[k];
    }
  }
  const sol = new Float64Array(n);
  for (let k = n - 1; k >= 0; k--) {
    let s = rhs[k];
    for (let c = k + 1; c <= Math.min(n - 1, k + p); c++) s -= A[k][c - k + p] * sol[c];
    sol[k] = s / A[k][p];
  }
  const w = (i, j) => {
    if (i < 0) return ghost(edges.x0) * w(-i, j);
    if (i > nx) return ghost(edges.x1) * w(2 * nx - i, j);
    if (j < 0) return ghost(edges.y0) * w(i, -j);
    if (j > ny) return ghost(edges.y1) * w(i, 2 * ny - j);
    if (i === 0 || i === nx || j === 0 || j === ny) return 0;
    return sol[idx(i, j)];
  };
  // momentos (D = 1): mx = -(wxx + nu wyy), my = -(wyy + nu wxx); en un borde empotrado la curvatura normal sale de la misma simetría del esquema (2 w1 / h^2)
  const mxF = [];
  const myF = [];
  const wF = [];
  for (let j = 0; j <= ny; j++) {
    mxF.push(new Float64Array(nx + 1));
    myF.push(new Float64Array(nx + 1));
    wF.push(new Float64Array(nx + 1));
    for (let i = 0; i <= nx; i++) {
      wF[j][i] = w(i, j);
      const onX = i === 0 || i === nx;
      const onY = j === 0 || j === ny;
      let wxx = (w(i - 1, j) - 2 * w(i, j) + w(i + 1, j)) / (hx * hx);
      let wyy = (w(i, j - 1) - 2 * w(i, j) + w(i, j + 1)) / (hy * hy);
      if (onX) {
        const edge = i === 0 ? edges.x0 : edges.x1;
        const i1 = i === 0 ? 1 : nx - 1;
        wxx = edge === 'C' ? 2 * w(i1, j) / (hx * hx) : 0;
        wyy = onY ? 0 : (w(i, j - 1) - 2 * w(i, j) + w(i, j + 1)) / (hy * hy);
      }
      if (onY) {
        const edge = j === 0 ? edges.y0 : edges.y1;
        const j1 = j === 0 ? 1 : ny - 1;
        wyy = edge === 'C' ? 2 * w(i, j1) / (hy * hy) : 0;
        if (!onX) wxx = (w(i - 1, j) - 2 * w(i, j) + w(i + 1, j)) / (hx * hx);
      }
      mxF[j][i] = -(wxx + nu * wyy);
      myF[j][i] = -(wyy + nu * wxx);
    }
  }
  return { nx, ny, hx, hy, a, b, w: wF, mx: mxF, my: myF, nu, edges };
}

// ---------------------------------------------------------------- momentos de diseño por franjas
// Franja central: mitad del ancho; franjas laterales: un cuarto a cada lado (promedio del momento en cada franja).
function mean(arr, from, to) {
  let s = 0;
  let c = 0;
  for (let k = from; k <= to; k++) { s += arr[k]; c++; }
  return c ? s / c : 0;
}
const clampRange = (n, f0, f1) => [Math.max(0, Math.round(n * f0)), Math.min(n, Math.round(n * f1))];

// Para la carga unitaria: momentos positivos máximos de cada dirección (franja central y laterales) y negativos
// en cada borde empotrado (tramo central y extremos de la longitud del borde). Positivos y negativos con su signo (kN·m/m).
export function stripMoments(pl) {
  const { nx, ny, mx, my, edges } = pl;
  const out = { pos: {}, neg: {} };
  // mx (armadura paralela a x): en cada línea x = cte se promedia sobre y
  let bestMid = { v: -Infinity, i: 0 };
  let bestSide = { v: -Infinity };
  const [m0, m1] = clampRange(ny, 0.25, 0.75);
  for (let i = 1; i < nx; i++) {
    const col = mx.map((row) => row[i]);
    const mid = mean(col, m0, m1);
    const side = Math.max(mean(col, 0, m0), mean(col, m1, ny));
    if (mid > bestMid.v) bestMid = { v: mid, i };
    if (side > bestSide.v) bestSide = { v: side };
  }
  out.pos.x = { mid: Math.max(0, bestMid.v), side: Math.max(0, bestSide.v), at: bestMid.i / nx };
  bestMid = { v: -Infinity, j: 0 };
  bestSide = { v: -Infinity };
  const [n0, n1] = clampRange(nx, 0.25, 0.75);
  for (let j = 1; j < ny; j++) {
    const row = my[j];
    const mid = mean(row, n0, n1);
    const side = Math.max(mean(row, 0, n0), mean(row, n1, nx));
    if (mid > bestMid.v) bestMid = { v: mid, j };
    if (side > bestSide.v) bestSide = { v: side };
  }
  out.pos.y = { mid: Math.max(0, bestMid.v), side: Math.max(0, bestSide.v), at: bestMid.j / ny };
  // bordes empotrados: momento negativo (tracción arriba) = -m en el borde
  const edgeProfile = {
    x0: mx.map((row) => row[0]), x1: mx.map((row) => row[nx]),
    y0: Array.from(my[0]), y1: Array.from(my[ny]),
  };
  Object.entries(edges).forEach(([k, kind]) => {
    if (kind !== 'C') return;
    const prof = edgeProfile[k];
    const len = prof.length - 1;
    const [c0, c1] = clampRange(len, 0.25, 0.75);
    out.neg[k] = { mid: Math.max(0, -mean(prof, c0, c1)), ends: Math.max(0, -Math.min(mean(prof, 0, c0), mean(prof, c1, len))), peak: Math.max(0, -Math.min(...prof)) };
    out.neg[k].ends = Math.max(0, Math.max(-mean(prof, 0, c0), -mean(prof, c1, len)));
  });
  return out;
}

export function maxDeflectionUnit(pl) {
  let m = 0;
  pl.w.forEach((row) => row.forEach((v) => { m = Math.max(m, Math.abs(v)); }));
  return m;      // para q = 1 y D = 1: w = m * q / D (con D en kN·m, q en kN/m2, w en m)
}

// ---------------------------------------------------------------- diseño completo
// input: { lx, ly (m, entre ejes de vigas), edges { x0, x1, y0, y1 }, D0, Lv (kN/m2, sin peso propio), h (mm), fc, placement,
//          exposure, limitKey, xi, nu, diameter ('auto' o mm) }
export function designSlab2(input) {
  const { lx, ly, edges, D0, Lv, h, fc, placement, exposure, limitKey, xi } = input;
  const nu = Number(input.nu) || 0.2;
  const fy = 420;
  const self = rc.selfWeightSlab(h);
  const D = D0 + self;
  const cb = rc.combos(D, Lv);
  const res = { self, D, combos: cb, nu, checks: [], lx, ly, edges };
  const pl = solvePlate({ a: lx, b: ly, edges, nu });
  res.plate = pl;
  const unit = stripMoments(pl);
  const wu = cb.wu;
  const short = Math.min(lx, ly);
  const long = Math.max(lx, ly);
  const dirShort = lx <= ly ? 'x' : 'y';
  res.ratio = long / short;
  if (res.ratio > 2) {
    return { ...res, ok: false, reason: `La relación entre luces es ${nf(res.ratio, 2)}: con más de 2 la losa trabaja prácticamente en una dirección (art. 13.6.1.2). Usá "Losa en una dirección".` };
  }

  const pref = Number(input.diameter) || 0;
  const strips = [];
  const pick = (name, Mu, role) => {
    const so = rc.slabBarOptions({ Mu: Mu * wu * 1e6, h, fc, placement, exposure, sCap: 2 * h });
    let chosen = so.options.find((o) => pref && o.db === pref) || so.options[0] || null;
    const rec = { name, role, Mu: Mu * wu, chosen, options: so.options, asMin: so.asMin, failures: so.failures };
    strips.push(rec);
    return rec;
  };
  // positivos: la armadura paralela a la luz corta va abajo (primera capa); la de la luz larga, encima de aquélla
  const posX = { mid: pick('Inferior dir. X — franja central', unit.pos.x.mid, 'pos-x-mid'), side: pick('Inferior dir. X — franjas laterales', unit.pos.x.side, 'pos-x-side') };
  const posY = { mid: pick('Inferior dir. Y — franja central', unit.pos.y.mid, 'pos-y-mid'), side: pick('Inferior dir. Y — franjas laterales', unit.pos.y.side, 'pos-y-side') };
  const names = { x0: 'borde X = 0', x1: 'borde X = lx', y0: 'borde Y = 0', y1: 'borde Y = ly' };
  const neg = {};
  Object.entries(unit.neg).forEach(([k, v]) => {
    neg[k] = { mid: pick(`Superior en ${names[k]} — tramo central`, v.mid, `neg-${k}-mid`), ends: pick(`Superior en ${names[k]} — extremos`, v.ends, `neg-${k}-ends`) };
  });
  res.strips = strips;
  res.pos = { x: posX, y: posY };
  res.neg = neg;
  res.unit = unit;

  // armadura de esquina (art. 13.3.6): bordes exteriores (apoyados) que concurren en una esquina
  res.corners = [];
  const cornerDefs = [['x0', 'y0', 'esquina (0, 0)'], ['x1', 'y0', 'esquina (lx, 0)'], ['x0', 'y1', 'esquina (0, ly)'], ['x1', 'y1', 'esquina (lx, ly)']];
  const mPosMax = Math.max(unit.pos.x.mid, unit.pos.y.mid);
  cornerDefs.forEach(([e1, e2, label]) => {
    if (edges[e1] === 'S' && edges[e2] === 'S') {
      const so = rc.slabBarOptions({ Mu: mPosMax * wu * 1e6, h, fc, placement, exposure, sCap: 2 * h });
      res.corners.push({ label, Mu: mPosMax * wu, chosen: so.options.find((o) => pref && o.db === pref) || so.options[0] || null, length: long / 5 * 1000 });
    }
  });

  // corte: viga de un metro de ancho a d de la cara del apoyo, con la reacción del paño por áreas de influencia
  const shortOpposite = dirShort === 'x' ? [edges.x0, edges.x1] : [edges.y0, edges.y1];
  const propped = shortOpposite.includes('C') && shortOpposite.includes('S');
  const kShear = propped ? 5 / 8 : 1 / 2;                      // tramo apoyado-empotrado: reacción 5/8 w l (estática)
  const mid = [posX.mid.chosen, posY.mid.chosen].filter(Boolean);
  const dMin = mid.length ? Math.min(...mid.map((c) => c.d)) : h - 30;
  const Vu = wu * short * kShear;
  const phiVc = N.phiShear * Math.min(Math.sqrt(fc), N.maxSqrtFcShear) / 6 * 1000 * dMin / 1000;      // kN/m
  const VuAtD = Vu - wu * dMin / 1000;
  res.shear = { Vu, VuAtD, phiVc, ok: VuAtD <= phiVc, kShear };

  // flechas: placa elástica con rigidez Ec Ie / (1 - ν²), con Ie de la franja central de la luz corta (art. 9.5.2.3)
  const shortStrip = dirShort === 'x' ? posX.mid.chosen : posY.mid.chosen;
  const uMax = maxDeflectionUnit(pl);
  const Mshort = (dirShort === 'x' ? unit.pos.x.mid : unit.pos.y.mid);       // kN·m/m por kN/m2
  const Ec = N.Ec(fc);
  const deltaFor = (w) => {
    if (!shortStrip) return { d: 0, Ie: 0, Ig: 1 };
    const eff = rc.effectiveInertia({ Ma: Mshort * w * 1e6, b: 1000, h, d: shortStrip.d, As: shortStrip.As, fc });
    const Dp = Ec * eff.Ie / (1 - nu * nu) / 1e9;            // kN·m (N·mm2/mm = N·mm -> kN·m con 1e9)
    return { d: uMax * w / Dp * 1000, ...eff };               // mm
  };
  const dD = deltaFor(D);
  const dDL = deltaFor(D + Lv);
  const instL = dDL.d - dD.d;
  const longD = xi * dD.d;
  const lim = N.deflectionLimits[limitKey];
  const Lmm = short * 1000;
  const value = lim.uses === 'L' ? instL : longD + instL;
  res.deflection = { instD: dD.d, instL, longD, Ie: dDL.Ie, Ig: dDL.Ig, Icr: dDL.Icr, Mcr: dDL.Mcr, lambda: xi };
  res.deflectionCheck = { limit: Lmm / lim.ratio, ratio: lim.ratio, value, ok: value <= Lmm / lim.ratio, uses: lim.uses, label: lim.label };
  // espesor de referencia: límite inferior de las ecuaciones (9-12) y (9-13) del art. 9.5.3.3 (vigas rígidas en los cuatro lados)
  const beta = long / short;
  res.hRef = Math.max(90, short * 1000 * (0.8 + fy / 1400) / (36 + 9 * beta));

  const missing = strips.filter((s) => !s.chosen);
  res.checks = [
    { id: 'flex', label: 'Flexión', ok: !missing.length, text: missing.length ? `Sin armadura que verifique en: ${missing.map((m) => m.name).join('; ')}. Aumentá el espesor.` : `todas las franjas con φMn ≥ Mu (máx. Mu = ${nf(Math.max(...strips.map((s) => s.Mu)), 2)} kN·m/m)` },
    { id: 'eps', label: 'Deformación de tracción', ok: strips.every((s) => !s.chosen || s.chosen.strength.epsT >= N.epsMinFlexure), text: 'εt ≥ 0,004 en todas las franjas (art. 10.3.5)' },
    { id: 'min', label: 'Armadura mínima y separación', ok: strips.every((s) => !s.chosen || (s.chosen.As >= s.asMin - 1e-6 && s.chosen.s <= 2 * h)), text: `As ≥ ${nf(strips[0].asMin, 0)} mm²/m (art. 7.12 y 13.3.1) y separación ≤ 2 h = ${nf(2 * h, 0)} mm (art. 13.3.2)` },
    { id: 'shear', label: 'Corte', ok: res.shear.ok, text: `Vu a d = ${nf(VuAtD, 1)} kN/m ≤ φVc = ${nf(phiVc, 1)} kN/m` },
    { id: 'defl', label: 'Flecha', ok: res.deflectionCheck.ok, text: `${nf(value, 1)} mm ≤ ${nf(Lmm / lim.ratio, 1)} mm (l/${lim.ratio}, luz menor)` },
  ];
  res.ok = res.checks.every((c) => c.ok);
  return res;
}

// Cantidades orientativas (hormigón en m3, acero en kg) de una losa en dos direcciones.
export function slab2Quantities(res, h) {
  if (!res.strips) return null;
  const { lx, ly } = res;
  const KG = 7850;
  const area = lx * ly;
  const barKg = (c, len, width) => (c ? c.As * 1e-6 * width * len * KG : 0);      // As (mm2/m) * ancho (m) * largo (m)
  let kg = 0;
  const p = res.pos;
  kg += barKg(p.x.mid.chosen, lx, ly / 2) + barKg(p.x.side.chosen, lx, ly / 2);
  kg += barKg(p.y.mid.chosen, ly, lx / 2) + barKg(p.y.side.chosen, ly, lx / 2);
  Object.entries(res.neg).forEach(([k, v]) => {
    const edgeLen = k.startsWith('x') ? ly : lx;
    const ext = 0.3 * (k.startsWith('x') ? lx : ly);       // la armadura superior se extiende aprox. 0,3 de la luz
    kg += barKg(v.mid.chosen, ext, edgeLen / 2) + barKg(v.ends.chosen, ext, edgeLen / 2);
  });
  res.corners.forEach((c) => { if (c.chosen) kg += 2 * barKg(c.chosen, c.length / 1000, c.length / 1000); });
  return { concrete: area * h / 1000, steel: kg, area };
}
