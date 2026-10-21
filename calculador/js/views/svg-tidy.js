// Acomoda los esquemas del calculador estructural una vez dibujados: ningún texto queda cortado por el borde del dibujo, ninguno pisa a otro
// y los números se corren un poco para no quedar encima de las barras, los apoyos o las cotas.
// Las figuras se arman como texto SVG en cada módulo; acá se mide el resultado en pantalla (hace falta que estén en el documento) y se corrigen
// las posiciones moviendo cada etiqueta lo mínimo posible. Se usa en las pantallas del cálculo y en la memoria (las hojas A4 y el PDF).
const STROKED = 'line,polyline,path,polygon,circle,ellipse,rect';
const CELL = 14;                       // tamaño de la grilla de búsqueda, en px de pantalla

const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
const overlap = (a, b, pad = 0.5) => !(a.r - pad <= b.l + pad || b.r - pad <= a.l + pad || a.b - pad <= b.t + pad || b.b - pad <= a.t + pad);

// puntos de muestra sobre los trazos y los bordes de las figuras chicas rellenas (apoyos, nudos, flechas): son los obstáculos para las etiquetas
function obstaclePoints(svg) {
  const pts = new Map();
  const add = (x, y) => { const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; (pts.get(k) || pts.set(k, []).get(k)).push([x, y]); };
  svg.querySelectorAll(STROKED).forEach((g) => {
    if (g.closest('defs,clipPath,mask')) return;
    const stroke = g.getAttribute('stroke') || getComputedStyle(g).stroke;
    const fill = g.getAttribute('fill') || getComputedStyle(g).fill;
    const hasStroke = stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)';
    const r = g.getBoundingClientRect();
    const small = r.width < 46 && r.height < 46;
    const filledSmall = small && fill && fill !== 'none' && !/transparent/.test(fill);
    if (!hasStroke && !filledSmall) return;
    let len = 0;
    try { len = g.getTotalLength(); } catch (e) { len = 0; }
    const ctm = g.getScreenCTM();
    if (!ctm) return;
    if (len > 0 && hasStroke) {
      const px = len * Math.abs(ctm.a || 1);
      const n = Math.min(500, Math.max(4, Math.ceil(px / 3)));
      for (let k = 0; k <= n; k++) { const p = g.getPointAtLength(len * k / n); add(ctm.a * p.x + ctm.c * p.y + ctm.e, ctm.b * p.x + ctm.d * p.y + ctm.f); }
    }
    if (filledSmall) { for (let x = r.left; x <= r.right; x += 3) for (let y = r.top; y <= r.bottom; y += 3) add(x, y); }
  });
  return pts;
}

function hitsIn(pts, rc, shrink = -2) {
  let n = 0;
  const l = rc.l + shrink; const r = rc.r - shrink; const t = rc.t + 2.5; const b = rc.b - 2.5;     // el borde superior e inferior del texto es aire de la fuente
  if (r <= l || b <= t) return 0;
  for (let cx = Math.floor(l / CELL); cx <= Math.floor(r / CELL); cx++) {
    for (let cy = Math.floor(t / CELL); cy <= Math.floor(b / CELL); cy++) {
      const cell = pts.get(`${cx},${cy}`);
      if (!cell) continue;
      for (const [x, y] of cell) if (x > l && x < r && y > t && y < b) n += 1;
    }
  }
  return n;
}

// mueve un texto dx, dy (px de pantalla) agregando una traslación en el espacio de su contenedor
function nudge(el, dx, dy) {
  const parent = el.parentNode;
  const m = parent && parent.getScreenCTM ? parent.getScreenCTM() : null;
  if (!m) return false;
  const inv = m.inverse();
  const ldx = inv.a * dx + inv.c * dy;
  const ldy = inv.b * dx + inv.d * dy;
  const old = el.getAttribute('transform') || '';
  el.setAttribute('transform', `translate(${ldx.toFixed(2)} ${ldy.toFixed(2)}) ${old}`.trim());
  return true;
}

// agrandar el cuadro del dibujo hasta que entren los trazos que se salen, sin achicar demasiado el resto (como mucho un 22 %)
function growViewBox(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;
  let bb;
  try { bb = svg.getBBox(); } catch (e) { return; }
  const pad = 5;
  const x0 = Math.min(vb.x, bb.x - pad); const y0 = Math.min(vb.y, bb.y - pad);
  const x1 = Math.max(vb.x + vb.width, bb.x + bb.width + pad); const y1 = Math.max(vb.y + vb.height, bb.y + bb.height + pad);
  if (x0 >= vb.x && y0 >= vb.y && x1 <= vb.x + vb.width && y1 <= vb.y + vb.height) return;
  const maxW = vb.width * 1.22; const maxH = vb.height * 1.22;
  const w = Math.min(x1 - x0, maxW); const h = Math.min(y1 - y0, maxH);
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
}

// los textos largos que no entran en el ancho del dibujo se achican; los demás se meten dentro del cuadro corriéndolos
function containTexts(svg) {
  const sr = svg.getBoundingClientRect();
  if (!sr.width) return;
  svg.querySelectorAll('text').forEach((t) => {
    if (!t.textContent.trim() || t.hasAttribute('data-fixed')) return;       // data-fixed: el número va dentro de su círculo, no se mueve
    let r = rectOf(t);
    if (r.r - r.l > sr.width - 4) {
      const fs = parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) || 12;
      const k = Math.max(0.7, (sr.width - 6) / (r.r - r.l));
      t.setAttribute('font-size', String((fs * k).toFixed(2)));
      r = rectOf(t);
    }
    let dx = 0; let dy = 0;
    if (r.l < sr.left + 2) dx = sr.left + 2 - r.l; else if (r.r > sr.right - 2) dx = sr.right - 2 - r.r;
    if (r.t < sr.top + 1) dy = sr.top + 1 - r.t; else if (r.b > sr.bottom - 1) dy = sr.bottom - 1 - r.b;
    if (dx || dy) nudge(t, dx, dy);
  });
}

const OFFSETS = (() => {
  const o = [];
  for (const r of [3, 6, 9, 12, 16, 20, 26, 32, 40]) {
    for (const [ux, uy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]) o.push([ux * r * (ux && uy ? 0.8 : 1), uy * r * (ux && uy ? 0.8 : 1), r]);
  }
  return o;
})();

function declutter(svg) {
  const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim());
  if (!texts.length) return;
  const sr = svg.getBoundingClientRect();
  const pts = obstaclePoints(svg);
  const rects = texts.map((t) => ({ t, r: rectOf(t) }));
  const inside = (rc) => rc.l >= sr.left + 1 && rc.r <= sr.right - 1 && rc.t >= sr.top && rc.b <= sr.bottom;
  const cost = (self, rc) => {
    let c = hitsIn(pts, rc) * 20;
    for (const o of rects) { if (o === self || !overlap(rc, o.r)) continue; c += 400; }
    if (!inside(rc)) c += 300;
    return c;
  };
  for (const item of rects) {
    if (item.t.hasAttribute('data-fixed')) continue;
    const base = cost(item, item.r);
    if (base === 0) continue;
    let best = { c: base, dx: 0, dy: 0 };
    for (const [dx, dy, r] of OFFSETS) {
      const rc = { l: item.r.l + dx, r: item.r.r + dx, t: item.r.t + dy, b: item.r.b + dy };
      const c = cost(item, rc) + r * 1.6;
      if (c < best.c - 0.01) best = { c, dx, dy };
      if (c < 1.6 * r + 0.01) break;                                   // sin choques: se queda con el primer lugar libre más cercano
    }
    if (best.dx || best.dy) {
      if (nudge(item.t, best.dx, best.dy)) item.r = rectOf(item.t);
    }
  }
}

export function tidySvg(svg) {
  if (svg.dataset.tidy) return;
  svg.dataset.tidy = '1';
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;                                   // oculto: no se puede medir
  containTexts(svg);
  growViewBox(svg);
  declutter(svg);
}

export function tidySvgs(root) {
  root.querySelectorAll('svg').forEach((s) => { try { tidySvg(s); } catch (e) { /* un dibujo raro no tiene que romper la pantalla */ } });
}

// Para la memoria: se arma el HTML, se mide en un contenedor fuera de pantalla con el ancho de la hoja y se devuelve ya acomodado.
export function tidyHtml(html, widthPx = 680) {
  const host = document.createElement('div');
  host.style.cssText = `position:absolute; left:-10000px; top:0; width:${widthPx}px; visibility:hidden; font:12px/1.45 system-ui, "Segoe UI", Arial, sans-serif;`;
  host.innerHTML = `<style>.tidy-host svg{max-width:100%;height:auto;display:block}</style><div class="tidy-host">${html}</div>`;
  document.body.appendChild(host);
  try {
    tidySvgs(host);
    const inner = host.querySelector('.tidy-host');
    inner.querySelectorAll('svg').forEach((s) => s.removeAttribute('data-tidy'));
    return inner.innerHTML;
  } finally { host.remove(); }
}
