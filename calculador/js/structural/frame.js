// Solver de pórticos planos por el método de rigidez (barras de Euler-Bernoulli, 3 grados de libertad por nudo).
// Unidades: m, kN, kPa (E en kN/m2). Convención global: x a la derecha, y hacia arriba, giro positivo antihorario.
// Convención de esfuerzos locales de barra (ejes: x del nudo i al j, y a 90° antihorario): fuerzas y momentos que el
// resto de la estructura ejerce sobre cada extremo. Momento flector de diseño: positivo = tracciona la cara inferior (local -y).

const GAUSS = [
  [-0.9061798459386640, 0.2369268850561891],
  [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889],
  [0.5384693101056831, 0.4786286704993665],
  [0.9061798459386640, 0.2369268850561891],
];

function memberGeom(nodes, m) {
  const a = nodes[m.i];
  const b = nodes[m.j];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  return { L, c: dx / L, s: dy / L };
}

// Matriz de rigidez local 6x6 (u1,v1,th1,u2,v2,th2).
function localStiffness(E, A, I, L) {
  const EA = E * A / L;
  const k1 = 12 * E * I / L ** 3;
  const k2 = 6 * E * I / L ** 2;
  const k3 = 4 * E * I / L;
  const k4 = 2 * E * I / L;
  return [
    [EA, 0, 0, -EA, 0, 0],
    [0, k1, k2, 0, -k1, k2],
    [0, k2, k3, 0, -k2, k4],
    [-EA, 0, 0, EA, 0, 0],
    [0, -k1, -k2, 0, k1, -k2],
    [0, k2, k4, 0, -k2, k3],
  ];
}

// Carga repartida de una barra: w(s) en kN/m, positiva hacia abajo (gravedad), s en [0, L]. Devuelve las
// componentes locales (axial p, transversal q) y las fuerzas de empotramiento equivalentes.
function equivalentLoads(m, geom) {
  const { L, c, s } = geom;
  const out = [0, 0, 0, 0, 0, 0];
  if (!m.w && !m.local) return { fe: out, p: () => 0, q: () => 0 };
  // m.local: cargas repartidas dadas directamente en ejes locales { p(x), q(x) } (por ejemplo, viento normal a la barra)
  const p = m.local ? (x) => m.local.p(x) : (x) => -m.w(x) * s;      // componente según el eje local x
  const q = m.local ? (x) => m.local.q(x) : (x) => -m.w(x) * c;      // componente según el eje local y
  for (const [g, wt] of GAUSS) {
    const xi = (g + 1) / 2;
    const x = xi * L;
    const f = wt * L / 2;
    const N1 = 1 - 3 * xi ** 2 + 2 * xi ** 3;
    const N2 = L * (xi - 2 * xi ** 2 + xi ** 3);
    const N3 = 3 * xi ** 2 - 2 * xi ** 3;
    const N4 = L * (-(xi ** 2) + xi ** 3);
    out[0] += p(x) * (1 - xi) * f;
    out[3] += p(x) * xi * f;
    out[1] += q(x) * N1 * f;
    out[2] += q(x) * N2 * f;
    out[4] += q(x) * N3 * f;
    out[5] += q(x) * N4 * f;
  }
  return { fe: out, p, q };
}

function transform(c, s) {
  // global -> local para un vector de 6 (dos nudos)
  return (v) => [
    c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2],
    c * v[3] + s * v[4], -s * v[3] + c * v[4], v[5],
  ];
}
function transformBack(c, s) {
  return (v) => [
    c * v[0] - s * v[1], s * v[0] + c * v[1], v[2],
    c * v[3] - s * v[4], s * v[3] + c * v[4], v[5],
  ];
}

function solveLinear(K, F) {
  const n = F.length;
  const A = K.map((row, i) => [...row, F[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-12) throw new Error('La estructura es inestable o está mal vinculada.');
    [A[i], A[piv]] = [A[piv], A[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      if (f === 0) continue;
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let c = i + 1; c < n; c++) sum -= A[i][c] * x[c];
    x[i] = sum / A[i][i];
  }
  return x;
}

// nodes: [{x, y}]; members: [{i, j, E, A, I, w?: (s)=>kN/m}]; supports: [{node, ux, uy, rz}] (true = impedido);
// nodalLoads: [{node, fx, fy, mz}] (kN, kN·m).
export function solveFrame({ nodes, members, supports, nodalLoads = [] }) {
  const n = nodes.length;
  const ndof = 3 * n;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const F = new Array(ndof).fill(0);
  const prepared = members.map((m) => {
    const geom = memberGeom(nodes, m);
    let kl = localStiffness(m.E, m.A, m.I, geom.L);
    const { fe, p, q } = equivalentLoads(m, geom);
    // articulaciones en los extremos (m.releaseI / m.releaseJ): condensación del giro del extremo
    [m.releaseI ? 2 : -1, m.releaseJ ? 5 : -1].filter((r) => r >= 0).forEach((r) => {
      const krr = kl[r][r];
      const col = kl.map((row) => row[r]);
      kl = kl.map((row, i) => row.map((v, j) => v - col[i] * kl[r][j] / krr));
      const fr = fe[r];
      for (let i = 0; i < 6; i++) fe[i] -= col[i] * fr / krr;
    });
    const toLocal = transform(geom.c, geom.s);
    const toGlobal = transformBack(geom.c, geom.s);
    const dofs = [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2];
    // k_global = T^T k_local T, construido columna a columna
    const kg = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let col = 0; col < 6; col++) {
      const e = new Array(6).fill(0);
      e[col] = 1;
      const kcol = kl.map((row) => row.reduce((acc, v, k) => acc + v * toLocal(e)[k], 0));
      const g = toGlobal(kcol);
      for (let r = 0; r < 6; r++) kg[r][col] = g[r];
    }
    const feg = toGlobal(fe);
    for (let r = 0; r < 6; r++) {
      F[dofs[r]] += feg[r];
      for (let c = 0; c < 6; c++) K[dofs[r]][dofs[c]] += kg[r][c];
    }
    return { m, geom, kl, fe, p, q, toLocal, dofs };
  });
  for (const nl of nodalLoads) {
    F[3 * nl.node] += nl.fx || 0;
    F[3 * nl.node + 1] += nl.fy || 0;
    F[3 * nl.node + 2] += nl.mz || 0;
  }
  const fixed = new Set();
  for (const s of supports) {
    if (s.ux) fixed.add(3 * s.node);
    if (s.uy) fixed.add(3 * s.node + 1);
    if (s.rz) fixed.add(3 * s.node + 2);
  }
  const free = [...Array(ndof).keys()].filter((d) => !fixed.has(d));
  const Kff = free.map((r) => free.map((c) => K[r][c]));
  const Ff = free.map((r) => F[r]);
  const uf = free.length ? solveLinear(Kff, Ff) : [];
  const u = new Array(ndof).fill(0);
  free.forEach((d, k) => { u[d] = uf[k]; });

  const reactions = new Array(ndof).fill(0);
  for (let r = 0; r < ndof; r++) {
    let sum = -F[r];
    for (let c = 0; c < ndof; c++) sum += K[r][c] * u[c];
    reactions[r] = sum;   // fuerza que el apoyo ejerce sobre la estructura, cambiada de signo: ver más abajo
  }
  const supportReactions = supports.map((s) => ({
    node: s.node,
    fx: s.ux ? reactions[3 * s.node] : 0,
    fy: s.uy ? reactions[3 * s.node + 1] : 0,
    mz: s.rz ? reactions[3 * s.node + 2] : 0,
  }));

  const results = prepared.map((pm) => {
    const ug = pm.dofs.map((d) => u[d]);
    const ul = pm.toLocal(ug);
    const f = pm.kl.map((row, r) => row.reduce((acc, v, c) => acc + v * ul[c], 0) - pm.fe[r]);
    const [N1, V1, M1, N2, V2, M2] = f;
    const { L } = pm.geom;
    const sample = (nPts = 24) => Array.from({ length: nPts + 1 }, (_, k) => {
      const x = k / nPts * L;
      let vInt = 0;
      let mInt = 0;
      for (const [g, wt] of GAUSS) {
        const t = (g + 1) / 2 * x;
        const fw = wt * x / 2;
        const qq = pm.q(t);
        vInt += qq * fw;
        mInt += qq * (x - t) * fw;
      }
      return { x, V: V1 + vInt, M: -M1 + V1 * x + mInt, N: -N1 };
    });
    return { N1, V1, M1, N2, V2, M2, L, sample, geom: pm.geom };
  });
  return { u, reactions: supportReactions, members: results };
}
