// Esquemas gráficos del calculador estructural: esquema de cargas, reacciones, diagramas de corte y de momento, con los valores
// que después se toman para verificar y adoptar la sección. Todas las funciones devuelven SVG como texto y reciben una paleta:
// 'screen' usa las variables de color de la app y 'print' colores fijos (la memoria se imprime fuera de la app).

const FONT = 'font-family="system-ui, Segoe UI, Arial, sans-serif"';
export const PAL = {
  screen: { ink: 'var(--ink)', soft: 'var(--ink-soft)', line: 'var(--line)', accent: 'var(--accent)', warm: 'var(--warn, #c77700)', bad: 'var(--bad)', fill: 'var(--line-soft)' },
  print: { ink: '#111111', soft: '#555555', line: '#c4c8cf', accent: '#1d4ed8', warm: '#b45309', bad: '#b91c1c', fill: '#eceff3' },
};
// Unidad de fuerza que trae un título de diagrama, por ejemplo "Corte V (kN)": los números de ese diagrama se marcan con data-fu para que el selector
// de unidades de fuerza (structural-units.js) los convierta junto con el título.
export const fuOf = (title) => { const m = /\((kN(?:·m\/m|·m|\/m²|\/m)?|kg(?:·m|\/m²|\/m)?)[,)]/.exec(title || ''); return m ? m[1] : ''; };
export const withFu = (t, unit) => (unit ? t.replace('<text ', `<text data-fu="${unit}" `) : t);
export const nf = (n, dec = 1) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const f1 = (v) => Number(v).toFixed(1);

export function svgWrap(w, h, inner, label, maxW = 600) {
  return `<svg viewBox="0 0 ${w} ${h}" ${FONT} style="width:100%; max-width:${maxW}px; display:block; margin:6px 0;" role="img" aria-label="${label}">${inner}</svg>`;
}

export const text = (x, y, t, { size = 11.5, fill, anchor = 'start', weight = 400, rotate = null } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${rotate ? ` transform="rotate(${rotate} ${f1(x)} ${f1(y)})"` : ''}>${t}</text>`;

// flecha de (x1,y1) a (x2,y2)
export function arrow(x1, y1, x2, y2, color, w = 1.6, head = 6) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx1 = x2 - head * Math.cos(a - 0.45);
  const hy1 = y2 - head * Math.sin(a - 0.45);
  const hx2 = x2 - head * Math.cos(a + 0.45);
  const hy2 = y2 - head * Math.sin(a + 0.45);
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${color}" stroke-width="${w}"/><polygon points="${f1(x2)},${f1(y2)} ${f1(hx1)},${f1(hy1)} ${f1(hx2)},${f1(hy2)}" fill="${color}"/>`;
}

// línea de cota horizontal
export function dimH(x1, x2, y, label, p) {
  return `<line x1="${f1(x1)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="${p.soft}" stroke-width="1"/>
    <line x1="${f1(x1)}" y1="${f1(y - 4)}" x2="${f1(x1)}" y2="${f1(y + 4)}" stroke="${p.soft}"/><line x1="${f1(x2)}" y1="${f1(y - 4)}" x2="${f1(x2)}" y2="${f1(y + 4)}" stroke="${p.soft}"/>
    ${text((x1 + x2) / 2, y - 4, label, { fill: p.soft, anchor: 'middle', size: 10.5 })}`;
}

// Diagrama sobre una línea base. pts: [[x (px), valor]]; sign +1 dibuja los positivos hacia abajo (lado traccionado), -1 hacia arriba.
// maxAbs fija la escala (px por unidad = h / maxAbs). Devuelve el SVG y la función de ordenada.
export function diagram({ x0, x1, y, h, pts, maxAbs, down = true, color, p, title, labels = [], zeroLabel = null }) {
  const k = h / (maxAbs || 1);
  const sgn = down ? 1 : -1;
  const Y = (v) => y + sgn * v * k;
  const poly = pts.map(([x, v]) => `${f1(x)},${f1(Y(v))}`).join(' ');
  const area = `${f1(pts[0][0])},${f1(y)} ${poly} ${f1(pts[pts.length - 1][0])},${f1(y)}`;
  let s = `${text(x0 - 4, y - h - 22, title, { fill: p.ink, size: 11.5, weight: 600 })}
    <line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${p.soft}" stroke-width="1"/>
    <polygon points="${area}" fill="${color}" fill-opacity="0.16"/><polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2"/>`;
  labels.forEach((l) => {
    const yy = Y(l.v);
    const above = l.pos === 'up' || (l.pos !== 'down' && (down ? l.v < 0 : l.v > 0));
    s += `<circle cx="${f1(l.x)}" cy="${f1(yy)}" r="2.8" fill="${color}"/>${withFu(text(l.x + (l.dx || 0), yy + (above ? -6 : 13), l.text, { fill: p.ink, anchor: l.anchor || 'middle', size: 10.5, weight: 600 }), /\d [a-zA-Z]/.test(String(l.text)) ? '' : fuOf(title))}`;
  });
  if (zeroLabel) s += text(x1 + 4, y + 3, zeroLabel, { fill: p.soft, size: 9.5 });
  return s;
}

// ---------------------------------------------------------------- viga y losa en una dirección
// kind: 'simple' | 'cantilever'; L en m; cargas en kN/m (o kN/m² por metro de ancho de losa); Mu en kN·m; Vu en kN; dMm = altura útil (mm)
export function beamFigure({ kind, L, wD, wL, wu, Mu, Vu, dMm = 0, loadUnit = 'kN/m', mUnit = 'kN·m', vUnit = 'kN', pal = 'screen', note = '' }) {
  const p = PAL[pal];
  const W = 560;
  const x0 = 76;
  const x1 = 480;
  const span = x1 - x0;
  const cant = kind === 'cantilever';
  let s = '';
  // --- esquema de cargas y reacciones
  const yMem = 100;
  s += text(8, 16, `Esquema: D = ${nf(wD, 2)} · L = ${nf(wL, 2)} → wu = 1,2 D + 1,6 L = ${nf(wu, 2)} ${loadUnit}`, { fill: p.ink, size: 12, weight: 600 });
  s += `<rect x="${x0}" y="36" width="${span}" height="20" fill="${p.accent}" fill-opacity="0.18"/>`;
  for (let i = 0; i <= 12; i++) s += arrow(x0 + 4 + i * (span - 8) / 12, 36, x0 + 4 + i * (span - 8) / 12, yMem - 4, p.accent, 1.2, 5);
  s += `<rect x="${x0}" y="${yMem - 4}" width="${span}" height="8" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  if (cant) {
    s += `<rect x="${x0 - 14}" y="${yMem - 30}" width="14" height="64" fill="${p.soft}" fill-opacity="0.45" stroke="${p.ink}"/>`;
    s += arrow(x0 + 16, yMem + 44, x0 + 16, yMem + 6, p.bad, 2, 7) + text(x0 + 24, yMem + 34, `R = Vu = ${nf(Vu, 1)} ${vUnit}`, { fill: p.bad, size: 11.5, weight: 600 });
    s += `<path d="M ${x0 - 24} ${yMem + 30} A 15 15 0 1 0 ${x0 - 24} ${yMem - 10}" fill="none" stroke="${p.bad}" stroke-width="2"/>` + text(x0 - 6, yMem + 58, `M = ${nf(Mu, 1)} ${mUnit}`, { fill: p.bad, size: 11.5, weight: 600, anchor: 'start' });
  } else {
    s += `<polygon points="${x0},${yMem + 4} ${x0 - 9},${yMem + 20} ${x0 + 9},${yMem + 20}" fill="none" stroke="${p.ink}" stroke-width="1.6"/>`;
    s += `<polygon points="${x1},${yMem + 4} ${x1 - 9},${yMem + 18} ${x1 + 9},${yMem + 18}" fill="none" stroke="${p.ink}" stroke-width="1.6"/><line x1="${x1 - 11}" y1="${yMem + 22}" x2="${x1 + 11}" y2="${yMem + 22}" stroke="${p.ink}" stroke-width="1.6"/>`;
    s += arrow(x0, yMem + 60, x0, yMem + 26, p.bad, 2, 7) + text(x0, yMem + 74, `R = ${nf(Vu, 1)} ${vUnit}`, { fill: p.bad, size: 11.5, weight: 600, anchor: 'middle' });
    s += arrow(x1, yMem + 60, x1, yMem + 28, p.bad, 2, 7) + text(x1, yMem + 74, `R = ${nf(Vu, 1)} ${vUnit}`, { fill: p.bad, size: 11.5, weight: 600, anchor: 'middle' });
  }
  s += dimH(x0, x1, yMem + 94, `L = ${nf(L, 2)} m`, p);
  // --- corte
  const yV = 282;
  const hV = 38;
  const nP = 40;
  const vf = cant ? (t) => Vu * (1 - t) : (t) => Vu * (1 - 2 * t);
  const vpts = Array.from({ length: nP + 1 }, (_, i) => [x0 + i / nP * span, vf(i / nP)]);
  const vlabels = [{ x: x0, v: vf(0), text: `${nf(vf(0), 1)} ${vUnit}`, pos: 'up', anchor: 'start' }];
  if (!cant) vlabels.push({ x: x1, v: vf(1), text: `−${nf(Vu, 1)} ${vUnit}`, pos: 'down', anchor: 'end' });
  s += diagram({ x0, x1, y: yV, h: hV, pts: vpts, maxAbs: Vu, down: false, color: p.accent, p, title: 'Corte V: se adopta Vu (en el apoyo) para estribos y verificación', labels: vlabels });
  if (dMm > 0) {
    const tD = dMm / 1000 / L;
    const xd = x0 + tD * span;
    const vd = vf(tD);
    s += `<line x1="${f1(xd)}" y1="${yV - hV - 2}" x2="${f1(xd)}" y2="${yV + 6}" stroke="${p.bad}" stroke-dasharray="3 2"/>` + text(xd + 5, yV + 18, `Vu a d = ${nf(vd, 1)} ${vUnit}`, { fill: p.bad, size: 11 });
  }
  // --- momento (se dibuja del lado traccionado)
  const yM = 418;
  const hM = 44;
  const mf = cant ? (t) => -Mu * (1 - t) ** 2 : (t) => 4 * Mu * t * (1 - t);
  const mpts = Array.from({ length: nP + 1 }, (_, i) => [x0 + i / nP * span, mf(i / nP)]);
  const mlabels = cant
    ? [{ x: x0, v: -Mu, text: `Mu = ${nf(Mu, 1)} ${mUnit}`, pos: 'up', anchor: 'start' }]
    : [{ x: x0 + span / 2, v: Mu, text: `Mu = ${nf(Mu, 1)} ${mUnit}`, pos: 'down', anchor: 'middle' }];
  s += diagram({ x0, x1, y: yM, h: hM, pts: mpts, maxAbs: Mu, down: true, color: p.warm, p, title: `Momento M, del lado traccionado (${cant ? 'arriba' : 'abajo'}): se adopta Mu para la armadura`, labels: mlabels });
  s += text(8, 492, note || 'Mu define la armadura de flexión; Vu, la verificación del corte y los estribos.', { fill: p.soft, size: 10.5 });
  return svgWrap(W, 500, s, 'Esquema de cargas, reacciones y diagramas de corte y de momento', 640);
}

// ---------------------------------------------------------------- losa en dos direcciones
// res: resultado de designSlab2 (con res.plate), wu en kN/m²
export function slab2Figures(res, pal = 'screen') {
  const p = PAL[pal];
  const { lx, ly, edges } = res;
  const wu = res.combos.wu;
  const ls = Math.min(lx, ly);
  const peak = wu * ls / 2;                                       // kN/m en el eje de la franja de influencia
  const totals = { long: wu * ls * (2 * Math.max(lx, ly) - ls) / 4, short: wu * ls * ls / 4 };
  // ---- planta con áreas de influencia y reacciones
  const W = 560;
  const H = 350;
  const k = Math.min(260 / lx, 170 / ly);
  const w = lx * k;
  const h = ly * k;
  const ox = (W - w) / 2;
  const oy = 78;
  const scaleQ = 34 / peak;
  let s = text(8, 18, `Planta del paño: reacciones sobre las vigas (áreas de influencia a 45°)`, { fill: p.ink, size: 12, weight: 600 });
  s += `<rect x="${f1(ox)}" y="${f1(oy)}" width="${f1(w)}" height="${f1(h)}" fill="${p.accent}" fill-opacity="0.06"/>`;
  // áreas de influencia: diagonales a 45° desde cada esquina y cresta en la dirección larga
  const half = ls / 2 * k;
  const corners = [[ox, oy], [ox + w, oy], [ox, oy + h], [ox + w, oy + h]];
  const sx = [1, -1, 1, -1];
  const sy = [1, 1, -1, -1];
  corners.forEach(([cx, cy], i) => {
    s += `<line x1="${f1(cx)}" y1="${f1(cy)}" x2="${f1(cx + sx[i] * half)}" y2="${f1(cy + sy[i] * half)}" stroke="${p.soft}" stroke-dasharray="4 3"/>`;
  });
  if (lx >= ly) s += `<line x1="${f1(ox + half)}" y1="${f1(oy + h / 2)}" x2="${f1(ox + w - half)}" y2="${f1(oy + h / 2)}" stroke="${p.soft}" stroke-dasharray="4 3"/>`;
  else s += `<line x1="${f1(ox + w / 2)}" y1="${f1(oy + half)}" x2="${f1(ox + w / 2)}" y2="${f1(oy + h - half)}" stroke="${p.soft}" stroke-dasharray="4 3"/>`;
  // bordes (empotrado: trazo grueso; apoyado: trazo normal)
  const edgeLine = (kind, x1, y1, x2, y2) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${p.ink}" stroke-width="${kind === 'C' ? 4 : 2}"/>`;
  s += edgeLine(edges.y1, ox, oy, ox + w, oy) + edgeLine(edges.y0, ox, oy + h, ox + w, oy + h) + edgeLine(edges.x0, ox, oy, ox, oy + h) + edgeLine(edges.x1, ox + w, oy, ox + w, oy + h);
  // reacciones: trapecio en el lado largo, triángulo en el corto (hacia afuera)
  const poly = (pts) => `<polygon points="${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}" fill="${p.bad}" fill-opacity="0.22" stroke="${p.bad}" stroke-width="1.2"/>`;
  const q = peak * scaleQ;
  const longX = lx >= ly;
  const hx = half;
  // lados paralelos a x (arriba y abajo)
  const horiz = (yEdge, dir) => (longX
    ? poly([[ox, yEdge], [ox + hx, yEdge + dir * q], [ox + w - hx, yEdge + dir * q], [ox + w, yEdge]])
    : poly([[ox, yEdge], [ox + w / 2, yEdge + dir * q], [ox + w, yEdge]]));
  const vert = (xEdge, dir) => (longX
    ? poly([[xEdge, oy], [xEdge + dir * q, oy + h / 2], [xEdge, oy + h]])
    : poly([[xEdge, oy], [xEdge + dir * q, oy + hx], [xEdge + dir * q, oy + h - hx], [xEdge, oy + h]]));
  s += horiz(oy, -1) + horiz(oy + h, 1) + vert(ox, -1) + vert(ox + w, 1);
  const tot = (longEdge) => (longEdge ? totals.long : totals.short);
  const label = (xx, yy, longEdge, anchor) => text(xx, yy, `${nf(peak, 1)} kN/m · R = ${nf(tot(longEdge), 1)} kN`, { fill: p.bad, size: 10, anchor, weight: 600 });
  s += label(ox + w / 2, oy - q - 6, longX, 'middle') + label(ox + w / 2, oy + h + q + 14, longX, 'middle');
  s += label(ox - q - 6, oy + h / 2, !longX, 'end') + label(ox + w + q + 6, oy + h / 2, !longX, 'start');
  s += text(ox + w / 2, oy + h / 2 - 6, `wu = ${nf(wu, 2)} kN/m²`, { fill: p.accent, anchor: 'middle', size: 11.5, weight: 600 }) + text(ox + w / 2, oy + h / 2 + 10, `${nf(lx, 2)} × ${nf(ly, 2)} m`, { fill: p.soft, anchor: 'middle', size: 10.5 });
  s += text(8, H - 22, `Σ reacciones = wu·lx·ly = ${nf(wu * lx * ly, 1)} kN (equilibrio vertical del paño)`, { fill: p.soft, size: 10.5 }) + text(8, H - 6, 'Trazo grueso: borde empotrado · fino: apoyado · punteado: límite de las áreas de influencia', { fill: p.soft, size: 10.5 });
  const plan = svgWrap(W, H, s, 'Planta de la losa con las reacciones sobre las vigas', 640);

  // ---- momentos en las dos direcciones (promedio de la franja central) y corte
  const pl = res.plate;
  const nxp = pl.nx;
  const nyp = pl.ny;
  const midY = (arr, i) => {
    const j0 = Math.round(nyp * 0.25);
    const j1 = Math.round(nyp * 0.75);
    let t = 0;
    for (let j = j0; j <= j1; j++) t += arr[j][i];
    return t / (j1 - j0 + 1);
  };
  const midX = (arr, j) => {
    const i0 = Math.round(nxp * 0.25);
    const i1 = Math.round(nxp * 0.75);
    let t = 0;
    for (let i = i0; i <= i1; i++) t += arr[j][i];
    return t / (i1 - i0 + 1);
  };
  const x0 = 70;
  const x1 = 500;
  const spanPx = x1 - x0;
  const mxpts = Array.from({ length: nxp + 1 }, (_, i) => [x0 + i / nxp * spanPx, midY(pl.mx, i) * wu]);
  const mypts = Array.from({ length: nyp + 1 }, (_, j) => [x0 + j / nyp * spanPx, midX(pl.my, j) * wu]);
  const ext = (pts) => ({ max: Math.max(...pts.map((q2) => q2[1])), min: Math.min(...pts.map((q2) => q2[1])) });
  const ex = ext(mxpts);
  const ey = ext(mypts);
  const scaleM = Math.max(Math.abs(ex.max), Math.abs(ex.min), Math.abs(ey.max), Math.abs(ey.min), 1e-6);
  const lab = (pts, e) => {
    const out = [];
    const imax = pts.findIndex((q2) => q2[1] === e.max);
    out.push({ x: pts[imax][0], v: e.max, text: `${nf(e.max, 2)} kN·m/m`, pos: 'down' });
    if (e.min < -0.05) { const imin = pts.findIndex((q2) => q2[1] === e.min); out.push({ x: pts[imin][0], v: e.min, text: `${nf(e.min, 2)} kN·m/m`, pos: 'up', anchor: imin === 0 ? 'start' : 'end' }); }
    return out;
  };
  let m = '';
  m += diagram({ x0, x1, y: 92, h: 46, pts: mxpts, maxAbs: scaleM, down: true, color: p.warm, p, title: `Mx a lo largo de x (promedio de la franja central; tracción abajo)`, labels: lab(mxpts, ex) });
  m += diagram({ x0, x1, y: 252, h: 46, pts: mypts, maxAbs: scaleM, down: true, color: p.accent, p, title: `My a lo largo de y (promedio de la franja central)`, labels: lab(mypts, ey) });
  // corte en la dirección de la luz corta
  const shortX = lx <= ly;
  const kS = res.shear.kShear;
  const sh = ls;
  const propped = kS === 0.625;
  const shortEdges = shortX ? [edges.x0, edges.x1] : [edges.y0, edges.y1];
  const fixedFirst = shortEdges[0] === 'C';
  const k0 = propped ? (fixedFirst ? 5 / 8 : 3 / 8) : 0.5;
  const V0 = wu * sh * k0;
  const V1 = -wu * sh * (1 - k0);
  const vpts = [[x0, V0], [x1, V1]];
  m += diagram({ x0, x1, y: 416, h: 40, pts: vpts, maxAbs: Math.max(Math.abs(V0), Math.abs(V1)), down: false, color: p.bad, p, title: `Corte en la luz corta (dirección ${shortX ? 'x' : 'y'}): se adopta Vu en el borde`,
    labels: [{ x: x0, v: V0, text: `${nf(Math.abs(V0), 1)} kN/m`, pos: 'up', anchor: 'start' }, { x: x1, v: V1, text: `−${nf(Math.abs(V1), 1)} kN/m`, pos: 'down', anchor: 'end' }] });
  const dPx = (res.shear.Vu - res.shear.VuAtD) / (wu || 1);       // m
  void dPx;
  m += text(8, 486, `Mu⁺ / Mu⁻ → armadura de cada franja. Vu a d = ${nf(res.shear.VuAtD, 1)} kN/m ≤ φVc = ${nf(res.shear.phiVc, 1)} kN/m.`, { fill: p.soft, size: 10.5 });
  const moments = svgWrap(560, 496, m, 'Diagramas de momento en las dos direcciones y de corte', 640);
  return { plan, moments };
}

// ---------------------------------------------------------------- columna
// d: { lu (m), Pu (kN), M1, M2, Mc (kN·m), axis: 'x'|'y', slender }
export function columnFigure({ lu, Pu, M1, M2, Mc, axis, slender, pal = 'screen' }) {
  const p = PAL[pal];
  const W = 600;
  const H = 300;
  const yTop = 50;
  const yBot = 250;
  const hh = yBot - yTop;
  let s = text(20, 16, `Columna: carga axial y momentos extremos en ${axis === 'x' ? 'x' : 'y'} (combinación mayorada)`, { fill: p.ink, size: 11, weight: 600 });
  const cx = 90;
  s += `<rect x="${cx - 9}" y="${yTop}" width="18" height="${hh}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  s += `<line x1="${cx - 28}" y1="${yTop}" x2="${cx + 28}" y2="${yTop}" stroke="${p.ink}" stroke-width="3"/><line x1="${cx - 28}" y1="${yBot}" x2="${cx + 28}" y2="${yBot}" stroke="${p.ink}" stroke-width="3"/>`;
  s += arrow(cx, yTop - 30, cx, yTop - 2, p.bad, 2.2, 8) + text(cx + 14, yTop - 14, `Pu = ${nf(Pu, 0)} kN`, { fill: p.bad, size: 10.5, weight: 600 });
  s += `<path d="M ${cx - 22} ${yTop + 26} A 14 14 0 1 1 ${cx - 22} ${yTop + 2}" fill="none" stroke="${p.warm}" stroke-width="2"/>` + text(cx - 36, yTop + 46, `M2 = ${nf(M2, 1)}`, { fill: p.warm, size: 10, anchor: 'end', weight: 600 });
  s += `<path d="M ${cx + 22} ${yBot - 2} A 14 14 0 1 0 ${cx + 22} ${yBot - 26}" fill="none" stroke="${p.warm}" stroke-width="2"/>` + text(cx + 38, yBot - 12, `M1 = ${nf(M1, 1)} kN·m`, { fill: p.warm, size: 10, weight: 600 });
  s += `<line x1="${cx + 40}" y1="${yTop}" x2="${cx + 40}" y2="${yBot}" stroke="${p.soft}"/>` + text(cx + 46, (yTop + yBot) / 2, `ℓu = ${nf(lu, 2)} m`, { fill: p.soft, size: 10.5 });
  // diagrama N
  const nx0 = 250;
  const nw = 70;
  s += text(nx0 - 10, yTop - 12, 'Axial N', { fill: p.ink, size: 11, weight: 600 });
  s += `<line x1="${nx0}" y1="${yTop}" x2="${nx0}" y2="${yBot}" stroke="${p.soft}"/><polygon points="${nx0},${yTop} ${nx0 + nw},${yTop} ${nx0 + nw},${yBot} ${nx0},${yBot}" fill="${p.bad}" fill-opacity="0.16" stroke="${p.bad}" stroke-width="2"/>`;
  s += text(nx0 + nw / 2, (yTop + yBot) / 2, `${nf(Pu, 0)} kN`, { fill: p.ink, size: 10.5, weight: 600, anchor: 'middle' }) + text(nx0 + nw / 2, yBot + 16, 'compresión', { fill: p.soft, size: 9.5, anchor: 'middle' });
  // diagrama M: primer orden lineal M1 -> M2 y valor de diseño Mc
  const mx0 = 400;
  const mw = 120;
  const mmax = Math.max(Math.abs(M1), Math.abs(M2), Math.abs(Mc), 1e-6);
  const X = (v) => mx0 + v / mmax * mw;
  s += text(mx0 - 10, yTop - 12, `Momento M${axis}`, { fill: p.ink, size: 11, weight: 600 });
  s += `<line x1="${mx0}" y1="${yTop}" x2="${mx0}" y2="${yBot}" stroke="${p.soft}"/><polygon points="${mx0},${yTop} ${f1(X(M2))},${yTop} ${f1(X(M1))},${yBot} ${mx0},${yBot}" fill="${p.warm}" fill-opacity="0.16" stroke="${p.warm}" stroke-width="2"/>`;
  s += text(X(M2) + 4, yTop + 4, `M2 = ${nf(M2, 1)}`, { fill: p.ink, size: 10, weight: 600 }) + text(X(M1) + 4, yBot + 4, `M1 = ${nf(M1, 1)}`, { fill: p.ink, size: 10, weight: 600 });
  if (slender || Math.abs(Mc - Math.abs(M2)) > 0.05) {
    const yM = (yTop + yBot) / 2;
    s += `<line x1="${mx0}" y1="${yM}" x2="${f1(X(Mc))}" y2="${yM}" stroke="${p.bad}" stroke-width="2.4"/><circle cx="${f1(X(Mc))}" cy="${yM}" r="3.4" fill="${p.bad}"/>` + text(X(Mc) + 6, yM + 4, 'Mc', { fill: p.bad, size: 10.5, weight: 600 });
  }
  s += text(mx0, yBot + 36, `Mc = ${nf(Mc, 1)} kN·m (momento de diseño${slender ? ', con efectos de esbeltez' : ''})`, { fill: p.bad, size: 10.5, weight: 600 });
  s += text(20, H - 8, 'Pu y Mc son los valores que se comparan con el diagrama de interacción para elegir la sección y la armadura.', { fill: p.soft, size: 10 });
  return svgWrap(W, H, s, 'Esquema de la columna con carga axial y momentos', 640);
}

// ---------------------------------------------------------------- base (zapata)
// fp: { L, B, h, hc, bc, xc, yc, ax, ay, qx(x)/qy(y) (N/mm2 mayoradas, promedio sobre el otro eje), Pu, dR (N), d (mm), MuX, MuY, VuX, VuY,
//       x2, y2 (caras interiores), partial, type, ps: { rect, bo, sides } }
function footingSection({ dir, fp, p, yTop, label }) {
  const isX = dir === 'x';
  const len = isX ? fp.L : fp.B;
  const wid = isX ? fp.B : fp.L;
  const c0 = isX ? fp.xc : fp.yc;
  const cw = isX ? fp.hc : fp.bc;
  const q = isX ? fp.qx : fp.qy;
  const x0 = 76;
  const x1 = 500;
  const k = (x1 - x0) / len;
  const X = (v) => x0 + v * k;
  const hPx = Math.max(16, Math.min(34, fp.h * k));
  let s = text(8, yTop + 6, label, { fill: p.ink, size: 12, weight: 600 });
  const yF = yTop + 80;
  s += `<rect x="${f1(x0)}" y="${f1(yF)}" width="${f1(x1 - x0)}" height="${f1(hPx)}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  s += `<rect x="${f1(X(c0 - cw / 2))}" y="${f1(yF - 30)}" width="${f1(cw * k)}" height="30" fill="${p.ink}" fill-opacity="0.8"/>`;
  s += arrow(X(c0), yF - 56, X(c0), yF - 32, p.bad, 2.2, 7) + text(X(c0) + 10, yF - 40, `Pu = ${nf(fp.Pu / 1000, 0)} kN`, { fill: p.bad, size: 11.5, weight: 600 });
  if (fp.dR && isX) s += arrow(X(fp.x2 + 40), yF - 34, X(fp.x2 + 40), yF - 2, p.warm, 2, 7) + text(X(fp.x2 + 50), yF - 12, `ΔR (viga) = ${nf(fp.dR / 1000, 0)} kN`, { fill: p.warm, size: 11, weight: 600 });
  // presión del suelo (hacia arriba sobre la base)
  const qs = Array.from({ length: 41 }, (_, i) => q(len * i / 40));
  const qmaxV = Math.max(...qs, 1e-9);
  const hq = 30;
  const yq = yF + hPx;
  const pts = qs.map((v, i) => `${f1(X(len * i / 40))},${f1(yq + hq - v / qmaxV * hq)}`);
  s += `<polygon points="${f1(x0)},${f1(yq + hq)} ${pts.join(' ')} ${f1(x1)},${f1(yq + hq)}" fill="${p.accent}" fill-opacity="0.2" stroke="${p.accent}" stroke-width="1.6"/>`;
  for (let i = 1; i < 12; i++) { const xx = len * i / 12; const v = q(xx); if (v > qmaxV * 0.05) s += arrow(X(xx), yq + hq, X(xx), yq + hq - v / qmaxV * hq + 2, p.accent, 0.9, 4); }
  s += text(x0, yq + hq + 16, `Presión del suelo (mayorada)${fp.partial && isX ? ', contacto parcial' : ''}: máx. ${nf(qmaxV * 1000, 0)} kPa · mín. ${nf(Math.min(...qs) * 1000, 0)} kPa`, { fill: p.accent, size: 11, weight: 600 });
  // secciones críticas: caras de la columna (momento) y a d de la cara (corte)
  const f1c = c0 - cw / 2;
  const f2c = c0 + cw / 2;
  [f1c, f2c].forEach((xx) => { if (xx > 0 && xx < len) s += `<line x1="${f1(X(xx))}" y1="${f1(yF - 4)}" x2="${f1(X(xx))}" y2="${f1(yq + hq + 2)}" stroke="${p.warm}" stroke-dasharray="4 3"/>`; });
  [f1c - fp.d, f2c + fp.d].forEach((xx) => { if (xx > 0 && xx < len) s += `<line x1="${f1(X(xx))}" y1="${f1(yF + 4)}" x2="${f1(X(xx))}" y2="${f1(yq + hq)}" stroke="${p.bad}" stroke-dasharray="1 3"/>`; });
  // V(x) y M(x) con el modelo de diseño del art. 15.4: voladizos que salen de las caras de la columna, cargados por la presión del suelo.
  // Entre las caras (bajo la columna) se interpola con una recta.
  const n = 240;
  const dx = len / n;
  const qv = Array.from({ length: n + 1 }, (_, i) => q(i * dx) * wid);                 // N/mm
  const Fl = [0];
  const Ml = [0];
  for (let i = 0; i < n; i++) {
    Fl.push(Fl[i] + (qv[i] + qv[i + 1]) / 2 * dx);
    Ml.push(Ml[i] + Fl[i] * dx + (2 * qv[i] + qv[i + 1]) / 6 * dx * dx);
  }
  const Fr = new Array(n + 1).fill(0);
  const Mr = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    Fr[i] = Fr[i + 1] + (qv[i] + qv[i + 1]) / 2 * dx;
    Mr[i] = Mr[i + 1] + Fr[i + 1] * dx + (2 * qv[i + 1] + qv[i]) / 6 * dx * dx;
  }
  const idx = (xx) => Math.max(0, Math.min(n, Math.round(xx / dx)));
  const iL = idx(f1c);
  const iR = idx(f2c);
  const Vs = [];
  const Ms = [];
  for (let i = 0; i <= iL; i++) { Vs.push([X(i * dx), Fl[i]]); Ms.push([X(i * dx), Ml[i]]); }
  for (let i = iR; i <= n; i++) { Vs.push([X(i * dx), -Fr[i]]); Ms.push([X(i * dx), Mr[i]]); }
  const vmax = Math.max(...Vs.map((t) => Math.abs(t[1])), 1);
  const mmax = Math.max(...Ms.map((t) => Math.abs(t[1])), 1);
  const yV = yq + hq + 92;
  const xd2 = f2c + fp.d;
  const vAt = -Fr[idx(xd2)];
  const vlabels = xd2 < len ? [{ x: X(xd2), v: vAt, text: `Vu = ${nf(Math.abs(vAt) / 1000, 0)} kN (a d)`, pos: 'down' }] : [];
  const xd1 = f1c - fp.d;
  if (xd1 > 0) vlabels.push({ x: X(xd1), v: Fl[idx(xd1)], text: `Vu = ${nf(Fl[idx(xd1)] / 1000, 0)} kN (a d)`, pos: 'up' });
  s += diagram({ x0, x1, y: yV, h: 32, pts: Vs, maxAbs: vmax, down: false, color: p.bad, p, title: 'Corte V: voladizos desde la cara de la columna; se verifica a d de la cara', labels: vlabels });
  const yM = yV + 120;
  const mlabels = [{ x: X(f2c), v: Mr[iR], text: `Mu = ${nf(Mr[iR] / 1e6, 1)} kN·m`, pos: 'down' }];
  if (Ml[iL] > 0.25 * Mr[iR] && Math.abs(Ml[iL] - Mr[iR]) > 0.05 * Mr[iR]) mlabels.push({ x: X(f1c), v: Ml[iL], text: `${nf(Ml[iL] / 1e6, 1)} kN·m`, pos: 'down' });
  s += diagram({ x0, x1, y: yM, h: 32, pts: Ms, maxAbs: mmax, down: true, color: p.warm, p, title: 'Momento M (tracción abajo): se adopta Mu en la cara de la columna', labels: mlabels });
  s += text(x0, yM + 66, 'líneas de trazos: caras de la columna (momento) · punteadas: a d de la cara (corte)', { fill: p.soft, size: 10.5 });
  return s;
}

export function footingFigures(fp, pal = 'screen') {
  const p = PAL[pal];
  const secX = svgWrap(560, 456, footingSection({ dir: 'x', fp, p, yTop: 14, label: fp.type ? 'Sección según x (perpendicular al límite): presión del suelo, corte y momento' : (!fp.type && fp.L === fp.B && fp.hc === fp.bc ? 'Sección (iguales en L y B): presión del suelo, corte y momento' : 'Sección según L: presión del suelo, corte y momento') }), 'Sección de la base según x', 640);
  const square = !fp.type && fp.L === fp.B && fp.hc === fp.bc;     // base cuadrada con columna cuadrada: las dos direcciones son iguales
  const secY = square ? '' : svgWrap(560, 456, footingSection({ dir: 'y', fp, p, yTop: 14, label: fp.type ? 'Sección según y (paralela al límite): presión del suelo, corte y momento' : 'Sección según B: presión del suelo, corte y momento' }), 'Sección de la base según y', 640);
  // planta: perímetro de punzonado
  const W = 600;
  const H = 300;
  const k = Math.min(380 / fp.L, 210 / fp.B);
  const w = fp.L * k;
  const h = fp.B * k;
  const ox = 90;
  const oy = 40;
  let s = text(ox - 4, 18, 'Planta: perímetro crítico de punzonado (a d/2 de la cara) y secciones de corte (a d)', { fill: p.ink, size: 11, weight: 600 });
  s += `<rect x="${ox}" y="${oy}" width="${f1(w)}" height="${f1(h)}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  if (fp.type) {
    s += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${f1(oy + h + 6)}" stroke="${p.bad}" stroke-width="3"/>`;
    if (fp.type === 'corner') s += `<line x1="${ox - 6}" y1="${oy}" x2="${f1(ox + w + 6)}" y2="${oy}" stroke="${p.bad}" stroke-width="3"/>`;
    s += text(ox - 8, oy + h + 16, 'límite', { fill: p.bad, size: 10, anchor: 'end' });
  }
  const r = fp.ps && fp.ps.rect;
  if (r) s += `<rect x="${f1(ox + r.cx1 * k)}" y="${f1(oy + r.cy1 * k)}" width="${f1((r.cx2 - r.cx1) * k)}" height="${f1((r.cy2 - r.cy1) * k)}" fill="none" stroke="${p.warm}" stroke-width="2" stroke-dasharray="6 3"/>`;
  s += `<rect x="${f1(ox + (fp.xc - fp.hc / 2) * k)}" y="${f1(oy + (fp.yc - fp.bc / 2) * k)}" width="${f1(fp.hc * k)}" height="${f1(fp.bc * k)}" fill="${p.ink}" fill-opacity="0.85"/>`;
  s += `<circle cx="${f1(ox + w / 2)}" cy="${f1(oy + h / 2)}" r="3.5" fill="none" stroke="${p.bad}" stroke-width="1.5"/>`;
  s += dimH(ox, ox + w, oy + h + 24, `L = ${nf(fp.L / 10, 0)} cm`, p);
  s += text(ox + w + 12, oy + h / 2, `B = ${nf(fp.B / 10, 0)} cm`, { fill: p.soft, size: 10.5 });
  if (fp.ps) s += text(ox + w + 12, oy + 20, `bo = ${nf(fp.ps.bo, 0)} mm`, { fill: p.warm, size: 10.5, weight: 600 }) + text(ox + w + 12, oy + 36, `${fp.ps.sides} lados`, { fill: p.warm, size: 10 });
  s += text(ox + w + 12, oy + 56, '● baricentro de la base', { fill: p.bad, size: 10 });
  const plan = svgWrap(W, H, s, 'Planta de la base con el perímetro de punzonado', 640);
  return { secX, secY, plan };
}

// ---------------------------------------------------------------- edificio: línea de vigas continua y bajada de cargas
// curves: salida de lineCurves; design: [{posM, posX, negL, negR, vL, vR}] por tramo (valores que se adoptan); supports: nombres de los apoyos
export function lineFigure({ curves, design, supports, title, pal = 'screen' }) {
  const p = PAL[pal];
  const W = 560;
  const x0 = 50;
  const x1 = 520;
  const Ltot = curves.spans.reduce((a, b2) => a + b2.L, 0);
  const k = (x1 - x0) / Ltot;
  const xs = [0];
  curves.spans.forEach((sp) => xs.push(xs[xs.length - 1] + sp.L));
  const X = (m) => x0 + m * k;
  let s = text(8, 16, title, { fill: p.ink, size: 12, weight: 600 });
  // esquema: cargas D y L por tramo, viga, apoyos con la reacción mayorada
  const yMem = 100;
  curves.spans.forEach((sp, i) => {
    s += `<rect x="${f1(X(xs[i]))}" y="38" width="${f1(sp.L * k)}" height="18" fill="${p.accent}" fill-opacity="0.18"/>`;
    const na = Math.max(3, Math.round(sp.L * k / 32));
    for (let a = 0; a <= na; a++) s += arrow(X(xs[i]) + 3 + a * (sp.L * k - 6) / na, 38, X(xs[i]) + 3 + a * (sp.L * k - 6) / na, yMem - 4, p.accent, 1.1, 4);
    s += text(X(xs[i] + sp.L / 2), 32, `D = ${nf(sp.wD, 1)} · L = ${nf(sp.wL, 1)} kN/m`, { fill: p.ink, size: 10.5, anchor: 'middle', weight: 600 });
  });
  s += `<rect x="${f1(x0)}" y="${yMem - 4}" width="${f1(x1 - x0)}" height="8" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  xs.forEach((m, i) => {
    s += `<polygon points="${f1(X(m))},${yMem + 4} ${f1(X(m) - 8)},${yMem + 18} ${f1(X(m) + 8)},${yMem + 18}" fill="none" stroke="${p.ink}" stroke-width="1.5"/>`;
    s += arrow(X(m), yMem + 58, X(m), yMem + 22, p.bad, 1.8, 6) + text(X(m), yMem + 70, `Ru = ${nf(curves.reactions[i], 0)} kN`, { fill: p.bad, size: 10.5, anchor: 'middle', weight: 600 });
    s += text(X(m), yMem + 84, supports[i] || '', { fill: p.soft, size: 10, anchor: 'middle' });
  });
  s += dimH(x0, x1, yMem + 112, `Σ L = ${nf(Ltot, 2)} m`, p);
  // envolventes
  const vAll = curves.spans.flatMap((sp) => sp.pts.flatMap((q) => [Math.abs(q.vMax), Math.abs(q.vMin)]));
  const mAll = curves.spans.flatMap((sp) => sp.pts.flatMap((q) => [Math.abs(q.mMax), Math.abs(q.mMin)]));
  const vscale = Math.max(...vAll, 1e-6);
  const mscale = Math.max(...mAll, 1e-6);
  const build = (f) => curves.spans.flatMap((sp, i) => sp.pts.map((q) => [X(xs[i] + q.x), f(q)]));
  const env = (key1, key2, y, h, scale, down, color, title, labels) => {
    const a = build((q) => q[key1]);
    const b2 = build((q) => q[key2]);
    const k2 = h / scale;
    const sg = down ? 1 : -1;
    const poly1 = a.map(([x, v]) => `${f1(x)},${f1(y + sg * v * k2)}`).join(' ');
    const poly2 = b2.map(([x, v]) => `${f1(x)},${f1(y + sg * v * k2)}`).reverse().join(' ');
    let o = text(8, y - h - 22, title, { fill: p.ink, size: 11.5, weight: 600 });
    o += `<line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${p.soft}"/>`;
    o += `<polygon points="${poly1} ${poly2}" fill="${color}" fill-opacity="0.16"/><polyline points="${poly1}" fill="none" stroke="${color}" stroke-width="2"/><polyline points="${b2.map(([x, v]) => `${f1(x)},${f1(y + sg * v * k2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
    labels.forEach((l) => { o += `<circle cx="${f1(l.x)}" cy="${f1(y + sg * l.v * k2)}" r="2.6" fill="${color}"/>` + withFu(text(l.x, y + sg * l.v * k2 + (l.up ? -6 : 13), l.text, { fill: p.ink, size: 10.5, anchor: 'middle', weight: 600 }), fuOf(title)); });
    return o;
  };
  const vLabels = [];
  const mLabels = [];
  curves.spans.forEach((sp, i) => {
    const d = design[i];
    vLabels.push({ x: X(xs[i]) + 2, v: d.vL, text: `${nf(d.vL, 0)}`, up: true });
    vLabels.push({ x: X(xs[i + 1]) - 2, v: -d.vR, text: `${nf(d.vR, 0)}`, up: false });
    mLabels.push({ x: X(xs[i] + d.posX), v: d.posM, text: `${nf(d.posM, 1)}`, up: false });
    if (d.negL > 0.05 * mscale) mLabels.push({ x: X(xs[i]) + (i ? 0 : 6), v: -d.negL, text: `${nf(d.negL, 1)}`, up: true });
    if (i === curves.spans.length - 1 && d.negR > 0.05 * mscale) mLabels.push({ x: X(xs[i + 1]) - 6, v: -d.negR, text: `${nf(d.negR, 1)}`, up: true });
    if (i < curves.spans.length - 1 && design[i + 1].negL > 0.05 * mscale) { /* el negativo del apoyo interior se rotula con el tramo siguiente */ }
  });
  s += env('vMax', 'vMin', 282, 36, vscale, false, p.accent, 'Corte V mayorado (envolvente, kN): se adopta Vu en cada apoyo', vLabels);
  s += env('mMax', 'mMin', 420, 44, mscale, true, p.warm, 'Momento M mayorado (envolvente, kN·m; tracción abajo): se adoptan Mu⁺ en tramo y Mu⁻ en apoyos', mLabels);
  s += text(8, 488, 'Cargas sobre la viga: reacciones de las losas, peso propio y muros.', { fill: p.soft, size: 10.5 }) + text(8, 502, 'Mu y Vu definen la armadura y los estribos de cada tramo.', { fill: p.soft, size: 10.5 });
  return svgWrap(W, 512, s, 'Viga continua con cargas, reacciones y envolventes de corte y momento', 640);
}

// levels: [{ m, Pu (kN, en la base del entrepiso), PuTop (kN, arriba), section, bars }] de arriba hacia abajo
export function columnStackFigure({ name, levels, base, pal = 'screen' }) {
  const p = PAL[pal];
  const W = 560;
  const rowH = 54;
  const x0 = 120;
  const maxP = Math.max(...levels.map((l) => l.Pu), 1);
  const H = 40 + rowH * levels.length + 84;
  let s = text(8, 16, `Bajada de cargas y secciones de la columna ${name}`, { fill: p.ink, size: 12, weight: 600 });
  levels.forEach((l, i) => {
    const y = 34 + i * rowH;
    const w = l.Pu / maxP * 260;
    s += `<rect x="${x0}" y="${y}" width="${f1(w)}" height="${rowH - 14}" fill="${p.accent}" fill-opacity="0.18" stroke="${p.accent}" stroke-width="1.4"/>`;
    s += text(x0 - 8, y + 18, `Entrepiso ${l.m}`, { fill: p.ink, size: 11.5, anchor: 'end', weight: 600 }) + text(x0 - 8, y + 32, `h = ${nf(l.h, 2)} m`, { fill: p.soft, size: 10, anchor: 'end' });
    s += text(x0 + w + 8, y + 18, `Pu = ${nf(l.Pu, 0)} kN`, { fill: p.bad, size: 11.5, weight: 600 }) + text(x0 + w + 8, y + 32, `${l.section} cm${l.bars ? ` · ${l.bars}` : ''}`, { fill: p.ink, size: 10.5 });
    s += `<line x1="${x0 - 4}" y1="${y + rowH - 8}" x2="${x0 + 300}" y2="${y + rowH - 8}" stroke="${p.line}" stroke-dasharray="3 3"/>`;
  });
  const yb = 34 + levels.length * rowH;
  if (base) s += `<rect x="${x0}" y="${yb}" width="260" height="20" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>` + text(x0 + 130, yb + 14, `Base ${base}`, { fill: p.ink, size: 11, anchor: 'middle', weight: 600 });
  s += text(8, H - 22, 'El ancho de la barra es proporcional a la carga acumulada.', { fill: p.soft, size: 10.5 }) + text(8, H - 6, 'Las columnas crecen hacia la fundación porque soportan los pisos de arriba.', { fill: p.soft, size: 10.5 });
  return svgWrap(W, H, s, 'Bajada de cargas por entrepiso y secciones de la columna', 640);
}

// ---------------------------------------------------------------- acero: viga continua (kg, kg·m) con cargas, reacciones, V, M y flecha
// d: { spans, cantL, cantR, qs: [kg/m por tramo (incluye voladizos en orden: voladizo izq., tramos, voladizo der.)], points: [{x (m desde el inicio), P}],
//      xs, V, M, y (m, hacia abajo), supportsX, reactions (kg), total (m), Mmax, Mmin, Vmax, f (cm) , fAllow (cm), names: [nombres de apoyos], title }
export function steelBeamFigure(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const x0 = 70;
  const x1 = 500;
  const k = (x1 - x0) / d.total;
  const X = (m) => x0 + m * k;
  let s = text(8, 16, d.title, { fill: p.ink, size: 12, weight: 600 });
  const yMem = 110;
  // bloques de carga por tramo
  let xm = 0;
  const parts = [];
  if (d.cantL > 0) parts.push({ L: d.cantL, q: d.qs[0], cant: true });
  d.spans.forEach((L, i) => parts.push({ L, q: d.qs[(d.cantL > 0 ? 1 : 0) + i], cant: false }));
  if (d.cantR > 0) parts.push({ L: d.cantR, q: d.qs[d.qs.length - 1], cant: true });
  parts.forEach((pt) => {
    s += `<rect x="${f1(X(xm))}" y="44" width="${f1(pt.L * k)}" height="18" fill="${p.accent}" fill-opacity="0.18"/>`;
    const na = Math.max(3, Math.round(pt.L * k / 30));
    for (let a = 0; a <= na; a++) s += arrow(X(xm) + 3 + a * (pt.L * k - 6) / na, 44, X(xm) + 3 + a * (pt.L * k - 6) / na, yMem - 4, p.accent, 1.1, 4);
    s += text(X(xm + pt.L / 2), 38, `q = ${nf(pt.q, 0)} kg/m`, { fill: p.ink, size: 10.5, anchor: 'middle', weight: 600 });
    xm += pt.L;
  });
  (d.points || []).forEach((pt) => { s += arrow(X(pt.x), 40, X(pt.x), yMem - 4, p.warm, 2.2, 7) + text(X(pt.x) + 5, 54, `${nf(pt.P, 0)} kg`, { fill: p.warm, size: 10.5, weight: 600 }); });
  s += `<rect x="${f1(x0)}" y="${yMem - 4}" width="${f1(x1 - x0)}" height="8" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  d.supportsX.forEach((m, i) => {
    s += `<polygon points="${f1(X(m))},${yMem + 4} ${f1(X(m) - 8)},${yMem + 18} ${f1(X(m) + 8)},${yMem + 18}" fill="none" stroke="${p.ink}" stroke-width="1.5"/>`;
    s += arrow(X(m), yMem + 60, X(m), yMem + 22, p.bad, 1.8, 6) + text(X(m), yMem + 73, `${nf(d.reactions[i], 0)} kg`, { fill: p.bad, size: 10.5, anchor: 'middle', weight: 600 });
    if (d.names && d.names[i]) s += text(X(m), yMem + 86, d.names[i], { fill: p.soft, size: 10, anchor: 'middle' });
  });
  s += dimH(x0, x1, yMem + 102, `L total = ${nf(d.total, 2)} m`, p);
  const pts = (arr) => d.xs.map((xx, i) => [X(xx), arr[i]]);
  const vmax = Math.max(...d.V.map(Math.abs), 1);
  const mmax = Math.max(...d.M.map(Math.abs), 1);
  const iVmax = d.V.reduce((b, v, i) => (Math.abs(v) > Math.abs(d.V[b]) ? i : b), 0);
  const iMmax = d.M.reduce((b, v, i) => (v > d.M[b] ? i : b), 0);
  const iMmin = d.M.reduce((b, v, i) => (v < d.M[b] ? i : b), 0);
  s += diagram({ x0, x1, y: 290, h: 36, pts: pts(d.V), maxAbs: vmax, down: false, color: p.accent, p, title: 'Corte V (kg): se adopta Vmáx para la tensión de corte',
    labels: [{ x: X(d.xs[iVmax]), v: d.V[iVmax], text: `Vmáx = ${nf(Math.abs(d.V[iVmax]), 0)} kg`, pos: d.V[iVmax] >= 0 ? 'up' : 'down' }] });
  const mlabels = [];
  if (d.M[iMmax] > 0.02 * mmax) mlabels.push({ x: X(d.xs[iMmax]), v: d.M[iMmax], text: `M⁺ = ${nf(d.M[iMmax], 0)} kg·m`, pos: 'down' });
  if (d.M[iMmin] < -0.02 * mmax) mlabels.push({ x: X(d.xs[iMmin]), v: d.M[iMmin], text: `M⁻ = ${nf(Math.abs(d.M[iMmin]), 0)} kg·m`, pos: 'up' });
  s += diagram({ x0, x1, y: 430, h: 40, pts: pts(d.M), maxAbs: mmax, down: true, color: p.warm, p, title: 'Momento M (kg·m, tracción abajo): se adopta Mmáx para el módulo resistente', labels: mlabels });
  if (d.y) {
    const ymax = Math.max(...d.y.map(Math.abs), 1e-9);
    s += diagram({ x0, x1, y: 540, h: 26, pts: pts(d.y), maxAbs: ymax, down: true, color: p.soft, p, title: `Flecha (se verifica f ≤ L/${d.fRatio || 300})`,
      labels: [{ x: X(d.xs[d.y.reduce((b, v, i) => (Math.abs(v) > Math.abs(d.y[b]) ? i : b), 0)]), v: d.y.reduce((b, v) => (Math.abs(v) > Math.abs(b) ? v : b), 0), text: `f = ${nf(d.f, 2)} cm (adm. ${nf(d.fAllow, 2)} cm)`, pos: 'down' }] });
  }
  return svgWrap(W, d.y ? 600 : 500, s, 'Viga con cargas, reacciones, corte, momento y flecha', 640);
}

// ---------------------------------------------------------------- acero: planta del entrepiso
// d: { xs: [posiciones de ejes (m)], ys: [posiciones de líneas (m)], cantXL, cantXR, cantYB, cantYF, sCorr, nodes: [{i, j, existing, label}], beamLabels: [texto por línea], corrLabel, pal }
export function floorPlanFigure(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const totX = d.xs[d.xs.length - 1] + d.cantXL + d.cantXR;
  const totY = d.ys[d.ys.length - 1] + d.cantYB + d.cantYF;
  const k = Math.min(400 / totX, 240 / totY);
  const ox = 80 + d.cantXL * k;
  const oy = 56 + d.cantYB * k;
  const X = (m) => ox + m * k;
  const Y = (m) => oy + m * k;
  let s = text(8, 18, d.title || 'Planta del entrepiso', { fill: p.ink, size: 12, weight: 600 });
  s += `<rect x="${f1(X(-d.cantXL))}" y="${f1(Y(-d.cantYB))}" width="${f1(totX * k)}" height="${f1(totY * k)}" fill="${p.accent}" fill-opacity="0.06" stroke="${p.line}"/>`;
  // correas (paralelas a y)
  const nC = Math.floor(totX / d.sCorr + 1e-9);
  for (let c = 0; c <= nC; c++) {
    const xx = -d.cantXL + c * d.sCorr;
    s += `<line x1="${f1(X(xx))}" y1="${f1(Y(-d.cantYB))}" x2="${f1(X(xx))}" y2="${f1(Y(d.ys[d.ys.length - 1] + d.cantYF))}" stroke="${p.soft}" stroke-width="0.8" stroke-opacity="0.7"/>`;
  }
  // vigas principales (paralelas a x)
  d.ys.forEach((yy, j) => {
    s += `<line x1="${f1(X(-d.cantXL))}" y1="${f1(Y(yy))}" x2="${f1(X(d.xs[d.xs.length - 1] + d.cantXR))}" y2="${f1(Y(yy))}" stroke="${p.ink}" stroke-width="3"/>`;
    if (d.beamLabels && d.beamLabels[j]) s += text(X(d.xs[d.xs.length - 1] + d.cantXR) + 8, Y(yy) + 4, d.beamLabels[j], { fill: p.ink, size: 10.5, weight: 600 });
  });
  // apoyos
  d.nodes.forEach((n) => {
    const cx = X(d.xs[n.i]);
    const cy = Y(d.ys[n.j]);
    if (n.existing) s += `<rect x="${f1(cx - 7)}" y="${f1(cy - 7)}" width="14" height="14" fill="none" stroke="${p.bad}" stroke-width="2" stroke-dasharray="3 2"/><line x1="${f1(cx - 7)}" y1="${f1(cy - 7)}" x2="${f1(cx + 7)}" y2="${f1(cy + 7)}" stroke="${p.bad}"/>`;
    else s += `<rect x="${f1(cx - 6)}" y="${f1(cy - 6)}" width="12" height="12" fill="${p.ink}"/>`;
    if (n.label) s += text(cx + 9, cy - 9, n.label, { fill: p.ink, size: 9.5 });
  });
  s += dimH(X(0), X(d.xs[d.xs.length - 1]), oy + totY * k - d.cantYB * k + 22, `vigas continuas: ${nf(d.xs[d.xs.length - 1], 2)} m`, p);
  s += text(8, 36, `${d.corrLabel || ''} cada ${nf(d.sCorr * 100, 0)} cm (líneas finas) · vigas (líneas gruesas) · ■ columna · ⊠ apoyo en estructura existente`, { fill: p.soft, size: 10 });
  return svgWrap(W, Math.max(240, oy + totY * k - d.cantYB * k + 50), s, 'Planta del entrepiso', 640);
}

// ---------------------------------------------------------------- acero: columna (esquema de pandeo) y columna compuesta con presillas
// d: { H (m), Lp (cm), support, N (kg), k, lambda, omega, sigma, sigmaAllow, section (texto), batten: { n, s (cm), e (cm), h (cm) } | null }
export function steelColumnFigure(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const H = 330;
  const top = 50;
  const bot = 270;
  const hh = bot - top;
  const cx = 130;
  let s = text(8, 16, `Columna ${d.section}: carga N, longitud de pandeo y verificación con ω`, { fill: p.ink, size: 12, weight: 600 });
  // sustentación
  const fixedBase = d.support !== 'art-art';
  const fixedTop = d.support === 'emp-emp';
  const freeTop = d.support === 'emp-libre';
  const batten = d.batten;
  if (batten) {
    const gap = 26;
    s += `<line x1="${cx - gap}" y1="${top}" x2="${cx - gap}" y2="${bot}" stroke="${p.ink}" stroke-width="3"/><line x1="${cx + gap}" y1="${top}" x2="${cx + gap}" y2="${bot}" stroke="${p.ink}" stroke-width="3"/>`;
    for (let i = 0; i <= batten.n; i++) {
      const yy = top + hh * i / batten.n;
      s += `<line x1="${cx - gap}" y1="${f1(yy)}" x2="${cx + gap}" y2="${f1(yy)}" stroke="${p.warm}" stroke-width="3"/>`;
    }
    s += text(cx + gap + 8, top + hh / batten.n / 2 + 4, `s = ${nf(batten.s, 0)} cm`, { fill: p.warm, size: 10.5, weight: 600 });
    s += text(cx, bot + 36, `e = ${nf(batten.e, 1)} cm entre ejes`, { fill: p.soft, size: 10.5, anchor: 'middle' });
  } else s += `<rect x="${cx - 7}" y="${top}" width="14" height="${hh}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.8"/>`;
  const sup = (yy, fixed) => (fixed
    ? `<line x1="${cx - 36}" y1="${yy}" x2="${cx + 36}" y2="${yy}" stroke="${p.ink}" stroke-width="3"/>${Array.from({ length: 7 }, (_, i) => `<line x1="${cx - 34 + i * 11}" y1="${yy + (yy > top ? 1 : -1)}" x2="${cx - 40 + i * 11}" y2="${yy + (yy > top ? 9 : -9)}" stroke="${p.soft}"/>`).join('')}`
    : `<polygon points="${cx},${yy} ${cx - 10},${yy + (yy > top ? 14 : -14)} ${cx + 10},${yy + (yy > top ? 14 : -14)}" fill="none" stroke="${p.ink}" stroke-width="1.6"/>`);
  s += sup(bot, fixedBase);
  if (!freeTop) s += sup(top, fixedTop);
  s += arrow(cx, top - 28, cx, top - 3, p.bad, 2.4, 8) + text(cx + 12, top - 12, `N = ${nf(d.N, 0)} kg`, { fill: p.bad, size: 11.5, weight: 600 });
  s += `<line x1="${cx + 70}" y1="${top}" x2="${cx + 70}" y2="${bot}" stroke="${p.soft}"/>` + text(cx + 78, (top + bot) / 2 - 6, `H = ${nf(d.H, 2)} m`, { fill: p.soft, size: 11 });
  s += text(cx + 78, (top + bot) / 2 + 10, `Lp = ${nf(d.k, 1)} H = ${nf(d.Lp / 100, 2)} m`, { fill: p.ink, size: 11, weight: 600 });
  // resultados
  const rx = 330;
  const row = (i, a, b, bold = false) => text(rx, 70 + i * 22, a, { fill: p.soft, size: 11 }) + text(rx + 205, 70 + i * 22, b, { fill: p.ink, size: 11.5, weight: bold ? 700 : 600, anchor: 'end' });
  s += row(0, 'Esbeltez λ = Lp / i', nf(d.lambda, 1)) + row(1, 'Coeficiente ω (tabla)', nf(d.omega, 2)) + row(2, 'σ = ω N / A', `${nf(d.sigma, 0)} kg/cm²`, true) + row(3, 'σ admisible', `${nf(d.sigmaAllow, 0)} kg/cm²`);
  s += `<rect x="${rx}" y="168" width="${f1(205 * Math.min(1, d.sigma / d.sigmaAllow))}" height="10" fill="${d.sigma <= d.sigmaAllow ? p.accent : p.bad}" fill-opacity="0.7"/><rect x="${rx}" y="168" width="205" height="10" fill="none" stroke="${p.soft}"/>`;
  s += text(rx, 196, `aprovechamiento ${nf(d.sigma / d.sigmaAllow * 100, 0)} %`, { fill: p.soft, size: 10.5 });
  s += text(8, H - 10, 'N y Lp definen σ = ω N / A: se adopta el perfil más liviano de la tabla que verifica.', { fill: p.soft, size: 10.5 });
  return svgWrap(W, H, s, 'Esquema de la columna con carga y longitud de pandeo', 640);
}

// ---------------------------------------------------------------- acero: cercha o cabriada con esfuerzos en las barras
// d: { title, nodes: [{x, y}], bars: [{a, b, N (kg, tracción +), fam}], supports: [{node, ux, uy}], loads: [{node, fx, fy}], reactions: [{node, rx, ry}], hint }
export function trussFigure(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const xs = d.nodes.map((n) => n.x);
  const ys = d.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const spanY = Math.max(maxY - minY, 1e-6);
  const k = Math.min(440 / spanX, 260 / spanY);
  const ox = 60;
  const top = 100;
  const X = (x) => ox + (x - minX) * k;
  const Y = (y) => top + (maxY - y) * k;
  const H = top + spanY * k + 116;
  let s = text(8, 16, d.title, { fill: p.ink, size: 12, weight: 600 });
  if (d.hint) s += text(8, 31, d.hint, { fill: p.soft, size: 10 });
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (minY + maxY) / 2;
  // barras
  d.bars.forEach((b) => {
    const A = d.nodes[b.a];
    const B = d.nodes[b.b];
    const col = Math.abs(b.N) < 0.5 ? p.soft : b.N > 0 ? p.accent : p.bad;
    s += `<line x1="${f1(X(A.x))}" y1="${f1(Y(A.y))}" x2="${f1(X(B.x))}" y2="${f1(Y(B.y))}" stroke="${col}" stroke-width="${Math.abs(b.N) < 0.5 ? 1 : 2.4}"${Math.abs(b.N) < 0.5 ? ' stroke-dasharray="3 3"' : ''}/>`;
  });
  // valores sobre las barras (solo si hay lugar)
  d.bars.forEach((b) => {
    const A = d.nodes[b.a];
    const B = d.nodes[b.b];
    const lpx = Math.hypot(X(B.x) - X(A.x), Y(B.y) - Y(A.y));
    if (lpx < 30 || Math.abs(b.N) < 0.5) return;
    const mx = (X(A.x) + X(B.x)) / 2;
    const my = (Y(A.y) + Y(B.y)) / 2;
    let nx = -(Y(B.y) - Y(A.y));
    let ny = X(B.x) - X(A.x);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const away = (mx - X(cx)) * nx + (my - Y(cy)) * ny;          // el rótulo va hacia afuera del centro de la figura
    const sg = away >= 0 ? 1 : -1;
    const tx = mx + sg * nx * 9;
    const ty = my + sg * ny * 9 + 3;
    s += text(tx, ty, `${b.N > 0 ? '+' : '−'}${nf(Math.abs(b.N), 0)}`, { fill: b.N > 0 ? p.accent : p.bad, size: 9.5, anchor: 'middle', weight: 600 });
  });
  // nudos
  const showNum = d.nodes.length <= 30;
  d.nodes.forEach((n, i) => {
    s += `<circle cx="${f1(X(n.x))}" cy="${f1(Y(n.y))}" r="2.6" fill="${p.ink}"/>`;
    if (showNum) s += text(X(n.x) + (n.y >= cy ? -5 : -5), Y(n.y) + (n.y >= cy ? -7 : 14), String(i + 1), { fill: p.soft, size: 8.5, anchor: 'middle' });
  });
  // cargas
  const maxF = Math.max(1, ...d.loads.map((l) => Math.hypot(l.fx || 0, l.fy || 0)));
  d.loads.forEach((l) => {
    const n = d.nodes[l.node];
    const px = X(n.x);
    const py = Y(n.y);
    const fy = l.fy || 0;
    const fx = l.fx || 0;
    if (Math.abs(fy) > 0.5) {
      const len = 16 + 22 * Math.abs(fy) / maxF;
      if (fy < 0) s += arrow(px, py - len - 4, px, py - 4, p.warm, 1.8, 6) + text(px + 3, py - len - 6, nf(Math.abs(fy), 0), { fill: p.warm, size: 9, anchor: 'middle', weight: 600 });
      else s += arrow(px, py + len + 4, px, py + 4, p.warm, 1.8, 6) + text(px, py + len + 14, nf(fy, 0), { fill: p.warm, size: 9, anchor: 'middle', weight: 600 });
    }
    if (Math.abs(fx) > 0.5) {
      const len = 14 + 16 * Math.abs(fx) / maxF;
      const dir = fx > 0 ? 1 : -1;
      s += arrow(px - dir * len, py, px - dir * 4, py, p.warm, 1.6, 5);
    }
  });
  // apoyos y reacciones
  d.supports.forEach((sp, i) => {
    const n = d.nodes[sp.node];
    const px = X(n.x);
    const py = Y(n.y);
    s += `<polygon points="${f1(px)},${f1(py + 3)} ${f1(px - 8)},${f1(py + 17)} ${f1(px + 8)},${f1(py + 17)}" fill="none" stroke="${p.ink}" stroke-width="1.5"/>`;
    if (!sp.ux) s += `<line x1="${f1(px - 11)}" y1="${f1(py + 21)}" x2="${f1(px + 11)}" y2="${f1(py + 21)}" stroke="${p.ink}" stroke-width="1.5"/>`;
    const r = d.reactions && d.reactions[i];
    if (r) {
      const up = r.ry >= 0;
      s += arrow(px, up ? py + 62 : py + 24, px, up ? py + 25 : py + 62, p.bad, 1.8, 6) + text(px, py + 75, `${up ? '' : '−'}${nf(Math.abs(r.ry), 0)} kg`, { fill: p.bad, size: 9.5, anchor: 'middle', weight: 600 });
      if (sp.ux && Math.abs(r.rx) > 0.5) s += text(px, py + 87, `H = ${nf(r.rx, 0)} kg`, { fill: p.bad, size: 9.5, anchor: 'middle', weight: 600 });
    }
  });
  s += text(8, H - 8, 'Azul: barra traccionada (+) · rojo: comprimida (−) · valores en kg · naranja: cargas en los nudos · rojo con flecha: reacciones', { fill: p.soft, size: 9.5 });
  return svgWrap(W, H, s, 'Cercha con los esfuerzos en las barras', 640);
}

// ---------------------------------------------------------------- acero: pórtico de nave (cargas por barra y diagramas M, V, N)
// d: { title, nodes: [{x, y}], members: [{i, j}], dist: [{fx, fy}] (kg/m por barra, fuerza global), nodal: [{node, fx, fy}], pts: [[{x, y, M, V, N}]],
//      hinge: nudo con articulación o null, support: 'pinned' | 'fixed' }
function portalBase(d, p, W, topPad, boxH) {
  const xs = d.nodes.map((n) => n.x);
  const ys = d.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  const maxY = Math.max(...ys);
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const k = Math.min((W - 200) / spanX, (boxH - 40) / spanY);
  const ox = 100;
  const X = (x) => ox + (x - minX) * k;
  const Y = (y, top) => top + (maxY - y) * k;
  return { k, X, Y, h: spanY * k, spanX };
}
const portalOutline = (d, p, B, top) => {
  let s = '';
  d.members.forEach((m) => {
    const a = d.nodes[m.i];
    const b = d.nodes[m.j];
    s += `<line x1="${f1(B.X(a.x))}" y1="${f1(B.Y(a.y, top))}" x2="${f1(B.X(b.x))}" y2="${f1(B.Y(b.y, top))}" stroke="${p.ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  });
  [0, d.nodes.length - 1].forEach((i) => {
    const n = d.nodes[i];
    const px = B.X(n.x);
    const py = B.Y(n.y, top);
    s += d.support === 'fixed'
      ? `<line x1="${f1(px - 11)}" y1="${f1(py + 2)}" x2="${f1(px + 11)}" y2="${f1(py + 2)}" stroke="${p.ink}" stroke-width="3"/>`
      : `<polygon points="${f1(px)},${f1(py + 2)} ${f1(px - 8)},${f1(py + 15)} ${f1(px + 8)},${f1(py + 15)}" fill="none" stroke="${p.ink}" stroke-width="1.5"/>`;
  });
  if (d.hinge !== null && d.hinge !== undefined) { const n = d.nodes[d.hinge]; s += `<circle cx="${f1(B.X(n.x))}" cy="${f1(B.Y(n.y, top))}" r="3.6" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.4"/>`; }
  return s;
};

export function portalLoads(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const top = 70;
  const H = 300;
  const B = portalBase(d, p, W, top, H - 60);
  let s = text(8, 16, d.title, { fill: p.ink, size: 12, weight: 600 });
  s += portalOutline(d, p, B, top);
  const maxQ = Math.max(1, ...d.dist.map((q) => Math.hypot(q.fx, q.fy)));
  d.members.forEach((m, k) => {
    const q = d.dist[k];
    const mag = Math.hypot(q.fx, q.fy);
    if (mag < 0.5) return;
    const a = d.nodes[m.i];
    const b = d.nodes[m.j];
    const len = 14 + 24 * mag / maxQ;
    const ux = q.fx / mag;
    const uy = q.fy / mag;
    // la carga empuja (la flecha llega a la barra) o tira (la flecha sale de la barra) según el lado de la barra hacia el que apunta respecto del centro del pórtico
    const cxm = (Math.min(...d.nodes.map((n) => n.x)) + Math.max(...d.nodes.map((n) => n.x))) / 2;
    const cym = (Math.min(...d.nodes.map((n) => n.y)) + Math.max(...d.nodes.map((n) => n.y))) / 2;
    const mxw = (a.x + b.x) / 2;
    const myw = (a.y + b.y) / 2;
    const Lm = Math.hypot(b.x - a.x, b.y - a.y);
    let nxo = -(b.y - a.y) / Lm;
    let nyo = (b.x - a.x) / Lm;
    if ((mxw - cxm) * nxo + (myw - cym) * nyo < 0) { nxo = -nxo; nyo = -nyo; }
    const pulling = ux * nxo + uy * nyo > 0;
    for (let t = d.members.length > 8 ? 0.5 : 0.12; t <= 0.9; t += 0.19) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const px = B.X(x);
      const py = B.Y(y, top);
      s += pulling ? arrow(px, py, px + ux * len, py - uy * len, p.warm, 1.4, 5) : arrow(px - ux * len, py + uy * len, px, py, p.warm, 1.4, 5);
    }
    const mx = B.X((a.x + b.x) / 2);
    const my = B.Y((a.y + b.y) / 2, top);
    const sgn = pulling ? 1 : -1;
    if (d.members.length > 8 && k % 6 !== 3) return;
    s += text(mx + sgn * ux * (len + 6) + (ux * sgn > 0.3 ? 14 : ux * sgn < -0.3 ? -14 : 0), my - sgn * uy * (len + 6) + (uy * sgn < -0.3 ? 10 : -4), `${nf(mag, 0)} kg/m`, { fill: p.warm, size: 10, anchor: 'middle', weight: 600 });
  });
  (d.nodal || []).forEach((l) => {
    const n = d.nodes[l.node];
    const px = B.X(n.x);
    const py = B.Y(n.y, top);
    if (Math.abs(l.fy) > 0.5) s += arrow(px, py - 34, px, py - 4, p.accent, 2, 6) + text(px + 5, py - 36, `${nf(Math.abs(l.fy), 0)} kg`, { fill: p.accent, size: 10, weight: 600 });
  });
  s += text(8, H - 8, 'Cargas por metro de barra (fuerza por metro de longitud de la barra, ya multiplicadas por la separación entre pórticos); azul: pesos de paredes y columna', { fill: p.soft, size: 9.5 });
  return svgWrap(W, H, s, 'Cargas sobre el pórtico', 640);
}

export function portalDiagrams(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const panelH = 250;
  let out = '';
  const panels = [['M', 'Momento flector M (kg·m, dibujado del lado traccionado)', p.warm, 1], ['V', 'Esfuerzo de corte V (kg)', p.accent, 1], ['N', 'Esfuerzo axial N (kg): tracción (+), compresión (−)', p.soft, 1]];
  panels.forEach(([key, title, color], pi) => {
    let s = pi === 0 ? text(8, 16, d.title, { fill: p.ink, size: 12, weight: 600 }) : '';
    const top = 62;
    const B = portalBase(d, p, W, top, panelH - 40);
    s += text(8, top - 24, title, { fill: p.ink, size: 11, weight: 600 });
    s += portalOutline(d, p, B, top);
    const maxAbs = Math.max(1, ...d.pts.flat().map((q) => Math.abs(q[key])));
    const amp = 38 / maxAbs;
    d.members.forEach((m, k) => {
      const a = d.nodes[m.i];
      const b = d.nodes[m.j];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const c = (b.x - a.x) / L;
      const sn = (b.y - a.y) / L;
      const nx = -sn;
      const ny = c;                                  // eje local y (a 90° antihorario)
      const sg = key === 'M' ? -1 : 1;
      const poly = d.pts[k].map((q) => [B.X(q.x) + sg * nx * q[key] * amp, B.Y(q.y, top) - sg * ny * q[key] * amp]);
      const base = d.pts[k].map((q) => [B.X(q.x), B.Y(q.y, top)]);
      s += `<polygon points="${[...base, ...poly.slice().reverse()].map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" fill="${color}" fill-opacity="0.18" stroke="none"/>`;
      s += `<polyline points="${poly.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
      // valor máximo de la barra
      let im = 0;
      d.pts[k].forEach((q, i) => { if (Math.abs(q[key]) > Math.abs(d.pts[k][im][key])) im = i; });
      const v = d.pts[k][im][key];
      const memMax = Math.max(...d.pts[k].map((q) => Math.abs(q[key])));
      if (Math.abs(v) > 0.04 * maxAbs && (d.members.length <= 8 || memMax >= 0.999 * maxAbs)) {
        const [lx, ly] = poly[im];
        const side = (lx - (B.X(a.x) + B.X(b.x)) / 2) >= 0 ? 6 : -6;
        s += `<circle cx="${f1(lx)}" cy="${f1(ly)}" r="2.4" fill="${color}"/>` + withFu(text(lx + side + (side > 0 ? 2 : -2), ly + 4, `${v < 0 ? '−' : ''}${nf(Math.abs(v), 0)}`, { fill: p.ink, size: 10, anchor: side > 0 ? 'start' : 'end', weight: 600 }), fuOf(title));
      }
    });
      out += svgWrap(W, panelH + 20, s, title, 640);
  });
  return out;
}

// ---------------------------------------------------------------- acero: columna reticulada (elevación y sección)
// d: { H (m), e, e2 (cm), m (2 | 4), alpha (°), pitch (cm), N (kg), Lp (cm), k, support, chordName, diagName, lamI, om, sigma, sigAllow }
export function latticeColumnFigure(d, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const top = 56;
  const bot = 320;
  const hh = bot - top;
  const Hc = d.H * 100;
  const ky = hh / Hc;
  const eMax = Math.max(d.e, d.e2 || 0);
  const kx = Math.max(ky, 56 / eMax);
  const wpx = d.e * kx;
  const cx = 130;
  let s = text(8, 16, `Columna reticulada: ${d.chordName} (×${d.m}) con diagonales ${d.diagName}`, { fill: p.ink, size: 12, weight: 600 });
  if (kx > ky + 1e-9) s += text(8, 32, 'El ancho está ampliado para que se vea; las diagonales no están a escala de ángulo.', { fill: p.soft, size: 9.5 });
  const xl = cx - wpx / 2;
  const xr = cx + wpx / 2;
  const a = d.e / Math.tan(d.alpha * Math.PI / 180);          // alto de media diagonal (cm)
  s += `<line x1="${f1(xl)}" y1="${top}" x2="${f1(xl)}" y2="${bot}" stroke="${p.ink}" stroke-width="3"/><line x1="${f1(xr)}" y1="${top}" x2="${f1(xr)}" y2="${bot}" stroke="${p.ink}" stroke-width="3"/>`;
  let left = true;
  for (let y = 0; y < Hc - 1e-6; y += a) {
    const y2 = Math.min(Hc, y + a);
    const ya = bot - y * ky;
    const yb = bot - y2 * ky;
    const fullStep = (y2 - y) / a;
    const xe = left ? xl : xr;
    const xo = left ? xr : xl;
    s += `<line x1="${f1(xe)}" y1="${f1(ya)}" x2="${f1(xe + (xo - xe) * fullStep)}" y2="${f1(yb)}" stroke="${p.accent}" stroke-width="1.6"/>`;
    left = !left;
  }
  // apoyos
  const fixedBase = d.support !== 'art-art';
  const fixedTop = d.support === 'emp-emp';
  const freeTop = d.support === 'emp-libre';
  const sup = (yy, fixed, up) => (fixed
    ? `<line x1="${f1(cx - 46)}" y1="${yy}" x2="${f1(cx + 46)}" y2="${yy}" stroke="${p.ink}" stroke-width="3"/>`
    : `<polygon points="${cx},${yy} ${cx - 10},${yy + (up ? -14 : 14)} ${cx + 10},${yy + (up ? -14 : 14)}" fill="none" stroke="${p.ink}" stroke-width="1.6"/>`);
  s += sup(bot, fixedBase, false);
  if (!freeTop) s += sup(top, fixedTop, true);
  s += arrow(cx, top - 24, cx, top - 3, p.bad, 2.4, 8) + text(cx + 12, top - 10, `N = ${nf(d.N, 0)} kg`, { fill: p.bad, size: 11.5, weight: 600 });
  s += `<line x1="${f1(cx + wpx / 2 + 40)}" y1="${top}" x2="${f1(cx + wpx / 2 + 40)}" y2="${bot}" stroke="${p.soft}"/>` + text(cx + wpx / 2 + 48, (top + bot) / 2 - 8, `H = ${nf(d.H, 2)} m`, { fill: p.soft, size: 11 });
  s += text(cx + wpx / 2 + 48, (top + bot) / 2 + 8, `Lp = ${nf(d.k, 1)} H = ${nf(d.Lp / 100, 2)} m`, { fill: p.ink, size: 11, weight: 600 });
  s += text(cx, bot + 34, `e = ${nf(d.e, 0)} cm · nudos cada ${nf(d.pitch, 0)} cm · α = ${nf(d.alpha, 0)}°`, { fill: p.soft, size: 10.5, anchor: 'middle' });
  // sección y resultados
  const sx = 400;
  const sy = 110;
  const sw = d.m === 4 ? 70 * (d.e / eMax) : 70;
  const sh = d.m === 4 ? 70 * ((d.e2 || d.e) / eMax) : 0;
  s += text(sx, 76, 'Sección', { fill: p.ink, size: 11, weight: 600 });
  if (d.m === 2) {
    s += `<line x1="${sx}" y1="${sy}" x2="${sx + sw}" y2="${sy}" stroke="${p.accent}" stroke-width="1.4" stroke-dasharray="4 3"/><circle cx="${sx}" cy="${sy}" r="6" fill="${p.ink}"/><circle cx="${sx + sw}" cy="${sy}" r="6" fill="${p.ink}"/>`;
    s += text(sx + sw / 2, sy - 12, `e = ${nf(d.e, 0)} cm`, { fill: p.soft, size: 10, anchor: 'middle' });
  } else {
    s += `<rect x="${sx}" y="${sy - sh / 2}" width="${sw}" height="${sh}" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    [[sx, sy - sh / 2], [sx + sw, sy - sh / 2], [sx, sy + sh / 2], [sx + sw, sy + sh / 2]].forEach(([x, y]) => { s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="6" fill="${p.ink}"/>`; });
    s += text(sx + sw / 2, sy - sh / 2 - 12, `${nf(d.e, 0)} × ${nf(d.e2 || d.e, 0)} cm`, { fill: p.soft, size: 10, anchor: 'middle' });
  }
  const rx = 330;
  const row = (i, aa, b, bold = false) => text(rx, 214 + i * 20, aa, { fill: p.soft, size: 10.5 }) + text(rx + 215, 214 + i * 20, b, { fill: p.ink, size: 11, weight: bold ? 700 : 600, anchor: 'end' });
  s += row(0, 'λ ideal (con corte de la celosía)', nf(d.lamI, 1)) + row(1, 'Coeficiente ω', nf(d.om, 2)) + row(2, 'σ = ω N / A', `${nf(d.sigma, 0)} kg/cm²`, true) + row(3, 'σ admisible', `${nf(d.sigAllow, 0)} kg/cm²`);
  s += `<rect x="${rx}" y="298" width="${f1(215 * Math.min(1, d.sigma / d.sigAllow))}" height="9" fill="${d.sigma <= d.sigAllow ? p.accent : p.bad}" fill-opacity="0.7"/><rect x="${rx}" y="298" width="215" height="9" fill="none" stroke="${p.soft}"/>`;
  return svgWrap(W, bot + 50, s, 'Esquema de la columna reticulada', 640);
}

// ---------------------------------------------------------------- base unificada (mm, N): cargas y presión del suelo, corte y momento de la franja, y planta
// fp: { a, b, x1, x2, hc1, hc2, bc1, bc2, bw, Pu1, Pu2, qL, qR (N/mm²), xs, V, M, limit }
export function combinedFootingFigures(fp, pal = 'screen') {
  const p = PAL[pal];
  const W = 560;
  const x0 = 60;
  const x1p = 500;
  const k = (x1p - x0) / fp.a;
  const X = (x) => x0 + x * k;
  const kN = (n) => n / 1000;
  // --- esquema de cargas
  let s = text(8, 16, `Franja longitudinal: a = ${nf(fp.a / 1000, 2)} m, b = ${nf(fp.b / 1000, 2)} m. Cargas mayoradas y presión del suelo`, { fill: p.ink, size: 12, weight: 600 });
  const yBeam = 120;
  [[fp.x1, fp.Pu1, fp.hc1], [fp.x2, fp.Pu2, fp.hc2]].forEach(([x, P, hc]) => {
    s += `<rect x="${f1(X(x - hc / 2))}" y="${yBeam - 34}" width="${f1(hc * k)}" height="34" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.4"/>`;
    s += arrow(X(x), 38, X(x), yBeam - 36, p.bad, 2.2, 7) + text(X(x), 32, `Pu = ${nf(kN(P), 0)} kN`, { fill: p.bad, size: 11, anchor: 'middle', weight: 600 });
  });
  s += `<rect x="${x0}" y="${yBeam}" width="${f1(x1p - x0)}" height="12" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  const qmax = Math.max(fp.qL, fp.qR, 1e-9);
  const qh = (q) => 6 + 26 * q / qmax;
  s += `<polygon points="${f1(x0)},${yBeam + 12 + qh(fp.qL)} ${f1(x1p)},${yBeam + 12 + qh(fp.qR)} ${f1(x1p)},${yBeam + 12} ${f1(x0)},${yBeam + 12}" fill="${p.accent}" fill-opacity="0.2" stroke="none"/>`;
  for (let i = 0; i <= 14; i++) {
    const x = x0 + 4 + i * (x1p - x0 - 8) / 14;
    const t = (x - x0) / (x1p - x0);
    const qq = fp.qL + (fp.qR - fp.qL) * t;
    s += arrow(x, yBeam + 12 + qh(qq), x, yBeam + 13, p.accent, 1.1, 4);
  }
  s += text(x0, yBeam + 12 + qh(fp.qL) + 14, `qu = ${nf(fp.qL * 1000, 0)} kPa`, { fill: p.accent, size: 10.5, weight: 600 });
  if (Math.abs(fp.qR - fp.qL) > 0.01 * qmax) s += text(x1p, yBeam + 12 + qh(fp.qR) + 14, `${nf(fp.qR * 1000, 0)} kPa`, { fill: p.accent, size: 10.5, weight: 600, anchor: 'end' });
  s += dimH(X(fp.x1), X(fp.x2), yBeam + 74, `ℓ = ${nf((fp.x2 - fp.x1) / 1000, 2)} m entre ejes`, p);
  if (fp.limit) s += `<line x1="${x0 - 3}" y1="40" x2="${x0 - 3}" y2="${yBeam + 14}" stroke="${p.bad}" stroke-width="3"/>` + text(x0 - 6, 52, 'límite', { fill: p.bad, size: 10, anchor: 'end' });
  const pts = (arr) => fp.xs.map((x, i) => [X(x), arr[i]]);
  const vmax = Math.max(...fp.V.map(Math.abs), 1);
  const mmax = Math.max(...fp.M.map(Math.abs), 1);
  const iV = fp.V.reduce((b, v, i) => (Math.abs(v) > Math.abs(fp.V[b]) ? i : b), 0);
  const iMp = fp.M.reduce((b, v, i) => (v > fp.M[b] ? i : b), 0);
  const iMn = fp.M.reduce((b, v, i) => (v < fp.M[b] ? i : b), 0);
  s += diagram({ x0, x1: x1p, y: 290, h: 38, pts: pts(fp.V), maxAbs: vmax, down: false, color: p.accent, p, title: 'Corte V (kN): se verifica a d de las caras de las columnas',
    labels: [{ x: X(fp.xs[iV]), v: fp.V[iV], text: `Vmáx = ${nf(Math.abs(kN(fp.V[iV])), 0)} kN`, pos: fp.V[iV] >= 0 ? 'up' : 'down' }] });
  const ml = [];
  if (fp.M[iMn] < -0.02 * mmax) ml.push({ x: X(fp.xs[iMn]), v: fp.M[iMn], text: `M⁻ = ${nf(Math.abs(kN(fp.M[iMn]) / 1000), 0)} kN·m (tracción arriba)`, pos: 'up' });
  if (fp.M[iMp] > 0.02 * mmax) ml.push({ x: X(fp.xs[iMp]), v: fp.M[iMp], text: `M⁺ = ${nf(kN(fp.M[iMp]) / 1000, 0)} kN·m (tracción abajo)`, pos: 'down' });
  s += diagram({ x0, x1: x1p, y: 430, h: 44, pts: pts(fp.M), maxAbs: mmax, down: true, color: p.warm, p, title: 'Momento M (kN·m), del lado traccionado: tramo arriba, columnas y voladizos abajo', labels: ml });
  const elev = svgWrap(W, 500, s, 'Base unificada: cargas, presión del suelo, corte y momento', 640);
  // --- planta
  const sc = Math.min(430 / fp.a, 150 / fp.b);
  const pw = fp.a * sc;
  const ph = fp.b * sc;
  const ox = 40;
  const oy = 36;
  let t = text(8, 16, 'Planta de la base unificada', { fill: p.ink, size: 12, weight: 600 });
  t += `<rect x="${ox}" y="${oy}" width="${f1(pw)}" height="${f1(ph)}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  t += `<rect x="${ox}" y="${f1(oy + ph / 2 - fp.bw * sc / 2)}" width="${f1(pw)}" height="${f1(fp.bw * sc)}" fill="none" stroke="${p.accent}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
  [[fp.x1, fp.hc1, fp.bc1], [fp.x2, fp.hc2, fp.bc2]].forEach(([x, hc, bc]) => { t += `<rect x="${f1(ox + (x - hc / 2) * sc)}" y="${f1(oy + ph / 2 - bc * sc / 2)}" width="${f1(hc * sc)}" height="${f1(bc * sc)}" fill="${p.ink}" fill-opacity="0.85"/>`; });
  t += `<circle cx="${f1(ox + pw / 2)}" cy="${f1(oy + ph / 2)}" r="3.5" fill="none" stroke="${p.bad}" stroke-width="1.5"/>`;
  if (fp.limit) t += `<line x1="${ox}" y1="${oy - 4}" x2="${ox}" y2="${oy + ph + 4}" stroke="${p.bad}" stroke-width="3"/>`;
  t += dimH(ox, ox + pw, oy + ph + 22, `a = ${nf(fp.a / 1000, 2)} m`, p);
  t += text(ox + pw + 10, oy + ph / 2 + 4, `b = ${nf(fp.b / 1000, 2)} m`, { fill: p.soft, size: 10.5 });
  t += text(ox, oy + ph + 50, `alma bo = ${nf(fp.bw / 10, 0)} cm (columna + 10 cm) · placa de ${nf(fp.hs / 10, 0)} cm · ○ baricentro = resultante de servicio`, { fill: p.soft, size: 10 });
  const plan = svgWrap(W, oy + ph + 66, t, 'Planta de la base unificada', 640);
  return { elev, plan };
}
