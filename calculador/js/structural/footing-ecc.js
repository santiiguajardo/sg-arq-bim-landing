// Bases excéntricas (de medianera: un borde en el límite del terreno) y doblemente excéntricas (de esquina: dos bordes en
// límites), según CIRSOC 201-2005, Cap. 15 y 11.12. Unidades internas: N, mm, MPa.
//
// Sistema de ejes: el límite de la propiedad está en x = 0 (y en y = 0 para la de esquina). La base ocupa [0, L] × [0, B]; la
// columna (hc en x, bc en y) está a la distancia ax (y ay) del límite. La excentricidad es la distancia entre el eje de la
// columna y el baricentro de la base.
//
// Dos formas de resolver la excentricidad:
//  - sin viga: el suelo equilibra el momento P·e con una presión lineal (art. 15.2.2: el área sale de las cargas y momentos sin
//    mayorar). Presión trapezoidal; triangular (despegue parcial) solo en la de medianera.
//  - con viga de equilibrio: una viga une la base con la columna vecina y toma el momento; la base queda con presión
//    uniforme bajo la reacción R = P ℓ / (ℓ − e) (estática de la viga, tomando momentos respecto del eje de la columna
//    vecina) y la viga se dimensiona con Mu = Pu e y Vu = Pu. La de esquina (doblemente excéntrica) no tiene solución sin
//    vigas: con la columna en el vértice la resultante no puede quedar dentro del núcleo central; se usan dos vigas, una por
//    dirección, y las reacciones se superponen (aproximación habitual: cada viga equilibra la excentricidad de su dirección).
import { CIRSOC201 as N } from './norms.js';
import { barArea, flexureDesign, asMinSlab, beamBarOptions, shearDesign, floorTo, ceilTo } from './rc.js';
import { developmentLength, barLayout, FOOTING_COVER } from './footing.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// integral por Simpson de f en [a, b]
function integ(f, a, b, n = 120) {
  if (!(b > a)) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}

// Presión mayorada (por carga P aplicada en el eje de la columna) promediada sobre el otro eje: perfil en x.
// Trapecio si queda en compresión; triángulo (contacto parcial) si la resultante cae fuera del tercio central.
function pressureProfile({ P, B, L, xc }) {
  const eX = xc - L / 2;                       // + hacia x creciente
  if (xc >= L / 3 && xc <= 2 * L / 3) return { f: (x) => P / (B * L) * (1 + 12 * eX * (x - L / 2) / (L * L)), partial: false, lc: L };
  if (xc < L / 3) {                             // triángulo con vértice en x = 3 xc, qmax en x = 0
    const lc = 3 * xc;
    const qmax = 2 * P / (B * lc);
    return { f: (x) => (x < lc ? qmax * (1 - x / lc) : 0), partial: true, lc, qmax };
  }
  const lc = 3 * (L - xc);
  const qmax = 2 * P / (B * lc);
  return { f: (x) => (x > L - lc ? qmax * (1 - (L - x) / lc) : 0), partial: true, lc, qmax };
}

// Perfiles de presión mayorada (N/mm2, promedio sobre el otro eje) de una base ya calculada, para dibujarlos.
export function footingProfileFns(res) {
  const A = res.L * res.B;
  const prof = res.strapMode ? { f: () => res.Pq / A, partial: false } : pressureProfile({ P: res.Pq, B: res.B, L: res.L, xc: res.xc });
  return { qx: prof.f, qy: () => res.Pq / A, partial: Boolean(prof.partial) };
}

// Propiedades de la sección crítica de punzonado (lados de ancho d, recortados por los bordes de la base) y tensión máxima de
// corte por Vu y por los momentos no balanceados transmitidos por excentricidad de corte (art. 11.12.6).
export function punchingStress({ L, B, xc, yc, hc, bc, d, Vu, Mx, My }) {
  const x1 = xc - hc / 2 - d / 2;
  const x2 = xc + hc / 2 + d / 2;
  const y1 = yc - bc / 2 - d / 2;
  const y2 = yc + bc / 2 + d / 2;
  const cx1 = Math.max(0, x1);
  const cx2 = Math.min(L, x2);
  const cy1 = Math.max(0, y1);
  const cy2 = Math.min(B, y2);
  const segs = [];                              // lados que quedan dentro de la base (los que caen sobre un borde libre no existen)
  if (x1 > 0) segs.push({ dir: 'y', at: x1, len: cy2 - cy1, mid: (cy1 + cy2) / 2 });
  if (x2 < L) segs.push({ dir: 'y', at: x2, len: cy2 - cy1, mid: (cy1 + cy2) / 2 });
  if (y1 > 0) segs.push({ dir: 'x', at: y1, len: cx2 - cx1, mid: (cx1 + cx2) / 2 });
  if (y2 < B) segs.push({ dir: 'x', at: y2, len: cx2 - cx1, mid: (cx1 + cx2) / 2 });
  const bo = segs.reduce((s, g) => s + g.len, 0);
  const Ac = bo * d;
  const xbar = segs.reduce((s, g) => s + g.len * (g.dir === 'y' ? g.at : g.mid), 0) / bo;
  const ybar = segs.reduce((s, g) => s + g.len * (g.dir === 'y' ? g.mid : g.at), 0) / bo;
  let Jx = 0;      // ∫ (x - xbar)² dA
  let Jy = 0;      // ∫ (y - ybar)² dA
  let Jxy = 0;
  segs.forEach((g) => {
    const xm = g.dir === 'y' ? g.at : g.mid;
    const ym = g.dir === 'y' ? g.mid : g.at;
    if (g.dir === 'y') {
      Jx += g.len * d ** 3 / 12 + g.len * d * (xm - xbar) ** 2;
      Jy += d * g.len ** 3 / 12 + g.len * d * (ym - ybar) ** 2;
    } else {
      Jx += d * g.len ** 3 / 12 + g.len * d * (xm - xbar) ** 2;
      Jy += g.len * d ** 3 / 12 + g.len * d * (ym - ybar) ** 2;
    }
    Jxy += g.len * d * (xm - xbar) * (ym - ybar);
  });
  // γv de cada componente (13-1, 11-39): b1 = lado de la sección crítica en la dirección del brazo del momento, b2 = el otro
  const bx = cx2 - cx1;
  const by = cy2 - cy1;
  const gv = (b1, b2) => 1 - 1 / (1 + 2 / 3 * Math.sqrt(b1 / b2));
  const gvx = gv(bx, by);                       // momento con brazo en x
  const gvy = gv(by, bx);                       // momento con brazo en y
  // tensión lineal: v = Vu/Ac + bX (x - xbar) + bY (y - ybar), con ∫ v (x - xbar) dA = γ My y ∫ v (y - ybar) dA = γ Mx
  const rx = gvx * My;
  const ry = gvy * Mx;
  const det = Jx * Jy - Jxy * Jxy;
  const bX = det > 0 ? (rx * Jy - ry * Jxy) / det : 0;
  const bY = det > 0 ? (ry * Jx - rx * Jxy) / det : 0;
  let vmax = -Infinity;
  segs.forEach((g) => {
    const ends = g.dir === 'y' ? [[g.at, g.mid - g.len / 2], [g.at, g.mid + g.len / 2]] : [[g.mid - g.len / 2, g.at], [g.mid + g.len / 2, g.at]];
    ends.forEach(([x, y]) => { vmax = Math.max(vmax, Vu / Ac + bX * (x - xbar) + bY * (y - ybar)); });
  });
  return { bo, Ac, xbar, ybar, Jx, Jy, Jxy, gvx, gvy, vmax, sides: segs.length, rect: { cx1, cx2, cy1, cy2 } };
}

// input: { type: 'edge' | 'corner', PD, PL (N), bc, hc (mm), ax, ay (mm), fc, fy, sigma (MPa), gammaSoil (kN/m3), Df (mm),
//          strap: boolean (la de esquina siempre lleva), ell (mm, entre ejes, viga en x), ellY (viga en y), bs, bsY (mm), placement }
export function designFootingEcc(input) {
  const { type, PD, PL, bc, hc, fc, fy, sigma, gammaSoil, Df } = input;
  const corner = type === 'corner';
  const ax = Math.max(0, Number(input.ax) || 0);
  const ay = corner ? Math.max(0, Number(input.ay) || 0) : 0;
  const ell = Number(input.ell) || 0;
  const ellY = Number(input.ellY) || 0;
  const strap = corner || Boolean(input.strap);
  if (strap && !(ell > 0)) return { type, checks: [], ok: false, reason: 'Ingresá la distancia entre el eje de la columna y el de la columna vecina a la que se une la viga de equilibrio.' };
  if (corner && !(ellY > 0)) return { type, checks: [], ok: false, reason: 'La base de esquina lleva dos vigas de equilibrio: ingresá también la distancia en la otra dirección.' };
  const Ps = PD + PL;
  const Pu = 1.2 * PD + 1.6 * PL;
  const res = { type, Ps, Pu, checks: [], strapMode: strap };
  if (!(Ps > 0) || !(sigma > 0)) return { ...res, ok: false, reason: 'Ingresá la carga y la tensión admisible del suelo.' };
  const sqrtFc = Math.min(Math.sqrt(fc), N.maxSqrtFcShear);
  const xc = ax + hc / 2;
  const failReasons = new Set();

  for (let h = 300; h <= 2000; h += 50) {
    const wF = N.gammaRC * h / 1e6;
    const wS = gammaSoil * Math.max(0, Df - h) / 1e6;
    const w = wF + wS;
    if (sigma - w <= 0) return { ...res, ok: false, reason: 'La tensión admisible no alcanza ni para el peso de la base y del suelo: revisá la profundidad o el suelo.' };
    // candidatos (L, B): para cada L, el menor B que cumple la tensión del suelo
    const cands = [];
    for (let L = ceilTo(ax + hc + 100, 50); L <= 6000; L += 50) {
      const ex = L / 2 - xc;                                    // excentricidad en x (hacia el interior)
      const eAbs = Math.max(0, ex);
      if (strap && ell - eAbs < 0.4 * ell) continue;
      for (let B = ceilTo(bc + 100 + (corner ? ay : 0), 50); B <= 8000; B += 50) {
        if (Math.max(L, B) / Math.min(L, B) > 4) continue;       // criterio constructivo: plantas no más alargadas que 4:1
        const yc = corner ? ay + bc / 2 : B / 2;
        const ey = corner ? B / 2 - yc : 0;
        const eyAbs = Math.max(0, ey);
        if (corner && ellY - eyAbs < 0.4 * ellY) continue;
        const A = B * L;
        let qmax;
        let ok = true;
        if (strap) {
          const Rs = Ps * (1 + eAbs / (ell - eAbs) + (corner ? eyAbs / (ellY - eyAbs) : 0));
          qmax = (Rs + w * A) / A;
        } else {
          const Rv = Ps + w * A;
          const eRx = Ps * Math.max(0, ex) / Rv;
          const eRy = Ps * Math.max(0, ey) / Rv;
          if (!corner) {
            qmax = eRx <= L / 6 ? Rv / A * (1 + 6 * eRx / L) : (eRx < L / 2 ? 2 * Rv / (3 * B * (L / 2 - eRx)) : Infinity);
          } else if (eRx / L + eRy / B <= 1 / 6) qmax = Rv / A * (1 + 6 * eRx / L + 6 * eRy / B);
          else ok = false;                                       // fuera del núcleo central: no se admite despegue en dos direcciones
        }
        if (ok && qmax <= sigma + 1e-9) { cands.push({ L, B, qmax, ex, ey }); break; }
      }
    }
    if (!cands.length) { failReasons.add('suelo'); continue; }
    cands.sort((a, b) => a.L * a.B - b.L * b.B);
    let tested = 0;
    for (const cand of cands) {
      if (tested++ >= 10) break;
      for (const [dl, dbb] of [[0, 0], [50, 0], [0, 50], [100, 0], [0, 100], [50, 50], [100, 100]]) {
        const L = cand.L + dl;
        const B = cand.B + dbb;
        const r = checkEcc({ ...input, L, B, h, ax, ay, xc, corner, strap, ell, ellY, Ps, Pu, w, wF, wS, sqrtFc });
        if (r && r.ok) return { ...res, ...r };
        if (r && r.why) failReasons.add(r.why);
      }
    }
  }
  const why = [...failReasons];
  let reason = 'No se encontró una base que verifique hasta 2,00 m de altura: revisá la tensión admisible, las cargas o la posición de la columna.';
  if (why.includes('anclaje') && !why.includes('punzonado')) reason = 'El anclaje de las barras hacia el límite del terreno no alcanza con el ancho de la columna (las barras tienen que anclarse en el tramo bajo la columna): usá una columna más ancha en ese sentido, barras de menor diámetro, o una viga de equilibrio.';
  else if (why.includes('suelo')) reason = strap ? 'Con las distancias a las columnas vecinas y la tensión del suelo no se encuentra una planta de hasta 4:1: probá con una columna más ancha, una distancia mayor a la columna vecina o un suelo mejor.' : 'Sin viga de equilibrio la excentricidad no entra en una planta razonable (hasta 4:1) con esta tensión del suelo: usá viga de equilibrio.';
  else if (why.includes('punzonado')) reason = 'No verifica el punzonado con la transferencia de momento hasta 2,00 m de altura: conviene una viga de equilibrio, una columna más grande o mejorar el suelo.';
  return { ...res, ok: false, reason };
}

// Integral doble por regla del punto medio (exacta para presiones lineales; suficiente para el perfil triangular).
function integ2(fn, x1, x2, y1, y2, n = 32) {
  if (!(x2 > x1) || !(y2 > y1)) return { R: 0, mx: 0, my: 0 };
  const dx = (x2 - x1) / n;
  const dy = (y2 - y1) / n;
  let R = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    const x = x1 + (i + 0.5) * dx;
    for (let j = 0; j < n; j++) {
      const y = y1 + (j + 0.5) * dy;
      const q = fn(x, y) * dx * dy;
      R += q; mx += q * x; my += q * y;
    }
  }
  return { R, mx, my };
}

export function checkEcc(c) {
  const { L, B, h, ax, ay, xc, corner, strap, ell, ellY, Ps, Pu, w, fc, fy, bc, hc, sigma, sqrtFc } = c;
  const yc = corner ? ay + bc / 2 : B / 2;
  const x2 = ax + hc;                                           // cara interior de la columna (x)
  const y2 = ay + bc;                                           // cara interior (y), solo en la de esquina
  const eX = xc - L / 2;                                         // < 0 si la columna está del lado del límite
  const eY = corner ? yc - B / 2 : 0;
  const A = B * L;
  const eAbs = Math.max(0, L / 2 - xc);
  // presión mayorada en el plano de la base: solo por la carga de la columna (el peso de la base y del suelo no flexiona la base)
  const eyAbs = corner ? Math.max(0, B / 2 - yc) : 0;
  const kStrap = strap ? 1 + eAbs / (ell - eAbs) + (corner ? eyAbs / (ellY - eyAbs) : 0) : 1;     // R / P con viga(s) de equilibrio
  const Pq = Pu * kStrap;                                        // con viga de equilibrio la base recibe la reacción R > Pu
  const prof = strap ? { f: () => Pq / A, partial: false } : pressureProfile({ P: Pq, B, L, xc });
  const qAt = strap ? (() => Pq / A) : corner
    ? (x, y) => Pq / A * (1 + 12 * eX * (x - L / 2) / (L * L) + 12 * eY * (y - B / 2) / (B * B))
    : (x) => prof.f(x);
  if (corner && !strap) {
    const corners = [[0, 0], [L, 0], [0, B], [L, B]].map(([x, y]) => qAt(x, y));
    if (Math.min(...corners) < -1e-9) return { why: 'suelo' };
  }
  const qy = (y) => (corner && !strap ? Pq / A * (1 + 12 * eY * (y - B / 2) / (B * B)) : Pq / A);   // perfil en y (promedio sobre x)
  // momentos en las caras de la columna (art. 15.4.2.a) por las fuerzas de un lado del plano
  const MxI = B * integ((x) => prof.f(x) * (x - x2), x2, L);
  const MxB = ax > 0 ? B * integ((x) => prof.f(x) * (ax - x), 0, ax) : 0;
  const MuX = Math.max(MxI, MxB);                                // armadura paralela a x
  const yOver = corner ? ay : (B - bc) / 2;                      // vuelo del lado del límite en y
  const yOverIn = corner ? B - y2 : (B - bc) / 2;                // vuelo del lado interior en y
  const MyI = yOverIn > 0 ? L * integ((y) => qy(y) * (y - (B - yOverIn)), B - yOverIn, B) : 0;
  const MyB = yOver > 0 ? L * integ((y) => qy(y) * (yOver - y), 0, yOver) : 0;
  const MuY = Math.max(MyI, MyB);

  let devFail = false;
  for (const db of [10, 12, 16, 20, 25]) {
    const dX = h - FOOTING_COVER - db / 2;                       // barras paralelas a x (capa inferior)
    const dY = h - FOOTING_COVER - 1.5 * db;                     // barras paralelas a y (encima)
    if (dX < 150) continue;                                       // art. 15.7
    const dSh = dY;
    const fX = flexureDesign({ Mu: MuX, b: B, d: dX, fc, fy });
    const fY = flexureDesign({ Mu: MuY, b: L, d: dY, fc, fy });
    if (!fX.ok || !fY.ok) { if (c.debug) c.debug.push(`db${db}: flexion ${fX.ok} ${fY.ok} ${fX.reason || fY.reason || ''}`); continue; }
    const AsX = Math.max(fX.As, asMinSlab({ b: B, h }));
    const AsY = Math.max(fY.As, asMinSlab({ b: L, h }));
    const sMaxAbs = Math.min(2.5 * h, 25 * db, 300);
    const longIsX = L >= B;
    const beta = Math.max(L, B) / Math.min(L, B);
    const gammaS = 2 / (beta + 1);                                // ec. (15-1)
    const Ab = barArea(db);
    // la dirección larga se reparte en todo el ancho; en la corta, γs de la armadura va en la faja central de ancho igual al lado menor
    const layX = longIsX ? barLayout({ AsReq: AsX, width: B, db, sMaxAbs }) : barLayout({ AsReq: gammaS * AsX, width: L, db, sMaxAbs });
    const layY = longIsX ? barLayout({ AsReq: gammaS * AsY, width: B, db, sMaxAbs }) : barLayout({ AsReq: AsY, width: L, db, sMaxAbs });
    if (!layX || !layY) { if (c.debug) c.debug.push(`db${db}: layout X ${Boolean(layX)} Y ${Boolean(layY)} AsX ${AsX.toFixed(0)} AsY ${AsY.toFixed(0)}`); continue; }
    const outsideBars = Math.max(0, Math.ceil((1 - gammaS) * (longIsX ? AsY : AsX) / Ab));
    // corte como viga a d de la cara (art. 11.12.1.1)
    const phiVcX = N.phiShear * sqrtFc / 6 * B * dSh;
    const phiVcY = N.phiShear * sqrtFc / 6 * L * dSh;
    const VuX = Math.max(B * integ(prof.f, x2 + dSh, L), ax > dSh ? B * integ(prof.f, 0, ax - dSh) : 0);
    const VuY = Math.max(yOverIn > dSh ? L * integ(qy, B - yOverIn + dSh, B) : 0, yOver > dSh ? L * integ(qy, 0, yOver - dSh) : 0);
    // punzonado a d/2 (art. 11.12.1.2) con transferencia de momento por excentricidad de corte (art. 11.12.6)
    const geom = punchingStress({ L, B, xc, yc, hc, bc, d: dSh, Vu: 0, Mx: 0, My: 0 });
    const { cx1, cx2, cy1, cy2 } = geom.rect;
    // con viga de equilibrio el exceso de reacción lo toma la viga: del lado de la seguridad se descuenta solo la presión que sale de Pu
    const qIn = strap ? (() => Pu / A) : qAt;
    const inn = integ2(qIn, cx1, cx2, cy1, cy2);
    const VuP = Pu - inn.R;
    const xR = inn.R > 0 ? inn.mx / inn.R : (cx1 + cx2) / 2;
    const yR = inn.R > 0 ? inn.my / inn.R : (cy1 + cy2) / 2;
    const Mxp = Pu * (yc - geom.ybar) - inn.R * (yR - geom.ybar);       // momento con brazo en y
    const Myp = Pu * (xc - geom.xbar) - inn.R * (xR - geom.xbar);       // momento con brazo en x
    const ps = punchingStress({ L, B, xc, yc, hc, bc, d: dSh, Vu: VuP, Mx: strap ? 0 : Mxp, My: strap ? 0 : Myp });
    const betaC = Math.max(bc, hc) / Math.min(bc, hc);
    const alphaS = corner ? 20 : 30;                              // ec. (11-34): 40 interior, 30 borde, 20 esquina
    const vc = Math.min((1 + 2 / betaC) * sqrtFc / 6, (alphaS * dSh / ps.bo + 2) * sqrtFc / 12, sqrtFc / 3);
    const phiVc = N.phiShear * vc;
    if (ps.vmax > phiVc) return { why: 'punzonado' };            // con barras más gruesas d baja: no mejora
    // anclaje (art. 15.6): a cada lado de la sección crítica
    const ldX = developmentLength({ db, fy, fc, clearSpacing: layX.s - db, cover: FOOTING_COVER });
    const ldY = developmentLength({ db, fy, fc, clearSpacing: layY.s - db, cover: FOOTING_COVER });
    const ldh = Math.max(0.24 * fy / Math.sqrt(fc) * db, 8 * db, 150);
    const availX = Math.min(L - x2, x2) - FOOTING_COVER;           // hacia el interior y hacia el límite (bajo la columna)
    const availY = (corner ? Math.min(B - y2, y2) : (B - bc) / 2) - FOOTING_COVER;
    const useHook = ldX > availX || ldY > availY;
    const needX = useHook ? ldh : ldX;
    const needY = useHook ? ldh : ldY;
    const hookFits = (h - FOOTING_COVER - db) >= 12 * db;
    const devOk = needX <= availX && needY <= availY && (!useHook || hookFits);
    // aplastamiento (art. 10.17.1): el área de apoyo es la mayor semejante a la de la columna contenida en la base
    const sx = Math.min(2 * xc / hc, 2 * (L - xc) / hc);
    const sy = Math.min(2 * yc / bc, 2 * (B - yc) / bc);
    const bearing = N.phiCompression * 0.85 * fc * bc * hc * Math.min(2, Math.max(1, Math.min(sx, sy)));
    const checks = [
      { id: 'flexX', label: 'Flexión (barras ∥ x)', ok: true, text: `Mu = ${nf(MuX / 1e6, 1)} kN·m, As = ${nf(AsX, 0)} mm²` },
      { id: 'flexY', label: 'Flexión (barras ∥ y)', ok: true, text: `Mu = ${nf(MuY / 1e6, 1)} kN·m, As = ${nf(AsY, 0)} mm²` },
      { id: 'shear', label: 'Corte como viga', ok: VuX <= phiVcX && VuY <= phiVcY, text: `en x: Vu ${nf(VuX / 1000, 0)} kN ≤ φVc ${nf(phiVcX / 1000, 0)} kN; en y: Vu ${nf(VuY / 1000, 0)} kN ≤ φVc ${nf(phiVcY / 1000, 0)} kN` },
      { id: 'punch', label: `Punzonado${strap ? '' : ' con momento'}`, ok: true, text: `vu máx = ${nf(ps.vmax, 2)} MPa ≤ φvc = ${nf(phiVc, 2)} MPa (αs = ${alphaS}, bo = ${nf(ps.bo, 0)} mm, ${ps.sides} lados)` },
      { id: 'dev', label: 'Anclaje de las barras', ok: devOk, text: `${useHook ? 'con gancho a 90°: ℓdh' : 'barra recta: ℓd'} = ${nf(Math.max(needX, needY), 0)} mm ≤ disponible ${nf(Math.min(availX, availY), 0)} mm` },
      { id: 'bear', label: 'Aplastamiento', ok: Pu <= bearing, text: `Pu = ${nf(Pu / 1000, 0)} kN ≤ φPnb = ${nf(bearing / 1000, 0)} kN` },
    ];
    if (c.debug) c.debug.push(`db${db}: ${checks.map((k) => (k.ok ? '+' : '-') + k.id).join(' ')} | ${checks.filter((k) => !k.ok).map((k) => k.text).join(' | ')}`);
    if (!checks.every((k) => k.ok)) { if (!devOk) devFail = true; continue; }
    // presión de servicio (con el peso de la base y del suelo, centrado)
    const Rv = Ps * kStrap + w * A;
    let qmax;
    let qmin;
    if (strap) { qmax = Rv / A; qmin = qmax; } else {
      const eRx = Ps * eAbs / (Ps + w * A);
      const eRy = corner ? Ps * Math.max(0, B / 2 - yc) / (Ps + w * A) : 0;
      if (!corner) {
        qmax = eRx <= L / 6 ? Rv / A * (1 + 6 * eRx / L) : 2 * Rv / (3 * B * (L / 2 - eRx));
        qmin = eRx <= L / 6 ? Rv / A * (1 - 6 * eRx / L) : 0;
      } else {
        qmax = Rv / A * (1 + 6 * eRx / L + 6 * eRy / B);
        qmin = Rv / A * (1 - 6 * eRx / L - 6 * eRy / B);
      }
    }
    checks.unshift({ id: 'soil', label: 'Tensión sobre el suelo', ok: qmax <= sigma + 1e-9, text: `qmáx = ${nf(qmax * 1000, 0)} kPa ≤ ${nf(sigma * 1000, 0)} kPa (admisible); qmín = ${nf(Math.max(0, qmin) * 1000, 0)} kPa${prof.partial ? ' — contacto parcial (triangular)' : ''}` });
    let strapRes = null;
    const straps = [];
    if (strap) {
      const sx = designStrap({ Pu, e: eAbs, ell, bs: c.bs || Math.max(bc, 250), fc, placement: c.placement || 'outdoor' });
      straps.push({ dir: 'x', ...sx });
      checks.push({ id: 'strapx', label: corner ? 'Viga de equilibrio en x' : 'Viga de equilibrio', ok: sx.ok, text: sx.ok ? `${sx.b / 10} × ${sx.h / 10} cm, Mu = ${nf(sx.Mu / 1e6, 1)} kN·m, Vu = ${nf(sx.Vu / 1000, 0)} kN` : sx.reason });
      if (corner) {
        const sy = designStrap({ Pu, e: eyAbs, ell: ellY, bs: c.bsY || Math.max(hc, 250), fc, placement: c.placement || 'outdoor' });
        straps.push({ dir: 'y', ...sy });
        checks.push({ id: 'strapy', label: 'Viga de equilibrio en y', ok: sy.ok, text: sy.ok ? `${sy.b / 10} × ${sy.h / 10} cm, Mu = ${nf(sy.Mu / 1e6, 1)} kN·m, Vu = ${nf(sy.Vu / 1000, 0)} kN` : sy.reason });
      }
      strapRes = straps[0];
    }
    if (!checks.every((k) => k.ok)) continue;
    const kg = ((layX.n * (L - 2 * FOOTING_COVER)) + (layY.n * (B - 2 * FOOTING_COVER)) + (outsideBars * ((longIsX ? B : L) - 2 * FOOTING_COVER))) * Ab * 7850 / 1e9;
    return {
      ok: true, L, B, h, db, xc, yc, ex: Math.abs(eX), ey: Math.abs(eY), qmax, qmin, partial: prof.partial, Pq,
      MuX, MuY, AsX, AsY, VuX, VuY, phiVcX, phiVcY, ps, phiVcP: phiVc, alphaS, vc,
      layX, layY, outsideBars, longIsX, gammaS, hooks: useHook, ldX: needX, ldY: needY, bearing,
      concrete: A * h / 1e9, steelKg: kg, checks, strapRes, straps, kStrap, eyAbs, eAbs, dowels: 0.005 * bc * hc, wSelf: c.wF * A, wSoil: c.wS * A,
    };
  }
  return devFail ? { why: 'anclaje' } : null;
}

// Viga de equilibrio: Mu = Pu e (tracción arriba, en el eje de la reacción de la base) y Vu = Pu junto a la base.
function designStrap({ Pu, e, ell, bs, fc, placement }) {
  const Mu = Pu * e;
  const Vu = Pu;
  const dSt = 10;
  let fallback = null;
  for (let h = 400; h <= 1500; h += 50) {
    for (const b of [bs, bs + 50, bs + 100]) {
      const bo = beamBarOptions({ Mu, b, h, fc, fy: 420, dStirrup: dSt, dagg: 19, placement, exposure: 'A1A2' });
      const c = bo.options[0];
      if (!c) continue;
      const sh = shearDesign({ Vu, b, d: c.d, h, fc, fyt: 420, dStirrup: dSt });
      if (!sh.ok) continue;
      const res = { ok: true, b, h, Mu, Vu, bars: c, shear: sh, ell, e, dStirrup: dSt, dR: Pu * e / (ell - e) };
      if (!sh.stirrups || sh.s >= 100) return res;       // se prefieren estribos separados 10 cm o más (criterio constructivo)
      if (!fallback) fallback = res;
    }
  }
  if (fallback) return fallback;
  return { ok: false, Mu, Vu, reason: 'No se encontró una viga de equilibrio que verifique hasta 1,50 m de altura.' };
}
