// Dibujo de armado del calculador estructural: la viga (o la franja de losa) en elevación con los hierros donde van —barras inferiores
// por tramo, barras superiores sobre los apoyos, estribos con su separación en cada zona—, el esquema de cálculo y los diagramas de
// momento y de corte alineados debajo. Es un esquema de principio: las longitudes de anclaje y de empalme se verifican en el despiece
// (CIRSOC 201, cap. 12). Devuelve SVG como texto; usa las mismas paletas que structural-draw.js ('screen' y 'print').
import { PAL, svgWrap, text, arrow, dimH, diagram, nf, f1, fuOf, withFu } from './structural-draw.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;
const barArea = (d) => Math.PI * d * d / 4;

export const barText = (o) => {
  if (!o) return '—';
  if (o.txt) return o.txt;
  return `${o.n} ø${o.db}${o.layers === 2 ? ' (2 capas)' : ''}`;
};

// ---------------------------------------------------------------- estribos
// Zonas de estribos de un tramo: cerca de cada apoyo la separación que pide el corte de ese extremo, y en el centro la máxima
// admisible (d/2 y 400 mm, art. 11.5.5.1). shearAt(V en kN) devuelve el resultado de rc.shearDesign para ese corte.
// vL y vR: corte (kN, con signo) en el extremo izquierdo y en el derecho; se interpola linealmente (carga repartida). Devuelve [{ a, b (m desde el apoyo izquierdo), s (mm) }].
export function stirrupZones({ L, vL, vR, shearAt, dMm }) {
  const sMid = Math.max(50, floorTo(Math.min(dMm / 2, 400), 10));
  const need = (V) => {
    const r = shearAt(Math.abs(V));
    if (!r || !r.ok) return null;
    return r.stirrups ? Math.min(r.s, sMid) : sMid;
  };
  const sL = need(vL);
  const sR = need(vR);
  if (sL === null || sR === null) return [];
  const N = 80;
  const Vat = (x) => vL + (vR - vL) * x / L;
  // hasta dónde llega la zona densa desde cada extremo: donde la separación necesaria alcanza la del centro
  const reach = (fromRight) => {
    for (let i = 0; i <= N; i++) {
      const x = L / 2 * i / N;
      const V = fromRight ? Vat(L - x) : Vat(x);
      const s = need(V);
      if (s !== null && s >= sMid) return x;
    }
    return L / 2;
  };
  const aL = sL < sMid ? reach(false) : 0;
  const aR = sR < sMid ? reach(true) : 0;
  if (aL + aR >= L - 1e-6) return [{ a: 0, b: L, s: Math.min(sL, sR) }];
  const z = [];
  if (aL > 0) z.push({ a: 0, b: aL, s: sL });
  z.push({ a: aL, b: L - aR, s: sMid });
  if (aR > 0) z.push({ a: L - aR, b: L, s: sR });
  return z;
}

// ---------------------------------------------------------------- viga o franja en elevación (tramos, voladizos y apoyos simples o empotrados)
/**
 * @param {object} o
 *  title, pal, slab (true = franja de losa de 1 m: sin estribos, barras con separación), dSt (mm), unit { w, m, v }
 *  members: de izquierda a derecha [{ type: 'span'|'cantL'|'cantR', L (m), wu (kN/m), d (mm), vA, vB (kN, corte con signo en el extremo
 *           izquierdo y en el derecho), pos (barras inferiores del tramo), shearAt (V en kN → rc.shearDesign) }]
 *  supports: [{ at (índice de borde entre miembros, 0 = extremo izquierdo), fixed (empotrado), name, top (barras superiores), Ru }]
 *  curves: por miembro [{ pts: [{ x (m), mMax, mMin, vMax, vMin }] }] (tracción abajo), dist: armadura de repartición de la losa
 *  barras: { n, db, layers } (viga) o { txt, db } (losa)
 */
export function armadoMembersFigure(o) {
  const p = PAL[o.pal || 'screen'];
  const slab = Boolean(o.slab);
  const mem = o.members;
  const sups = o.supports;
  const nM = mem.length;
  const unit = o.unit || { w: 'kN/m', m: 'kN·m', v: 'kN' };
  const W = 600;
  const x0 = 70;
  const x1 = 552;
  const Ltot = sum(mem.map((q) => q.L));
  const k = (x1 - x0) / Ltot;                          // px por metro
  const pxMm = k / 1000;
  const bounds = [0];
  mem.forEach((q) => bounds.push(bounds[bounds.length - 1] + q.L));
  const X = (m) => x0 + m * k;
  const colW = 18;
  const yTop = 80;
  const hh = 46;
  const yBot = yTop + hh;
  const legend = [];
  let num = 0;
  const fixedTxt = (t) => t.replace('<text ', '<text data-fixed="1" ');
  const circ = (cx, cy, n) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="6.6" fill="${p.fill}" stroke="${p.warm}" stroke-width="1.3"/>${fixedTxt(text(cx, cy + 3.4, n, { fill: p.warm, size: 9.5, anchor: 'middle', weight: 700 }))}`;
  let s = text(8, 16, o.title, { fill: p.ink, size: 12, weight: 600 });
  const guides = sups.map((sp) => X(bounds[sp.at]));
  const supAt = (b) => sups.find((sp) => sp.at === b);

  // ---- cargas
  const yLoad = 44;
  mem.forEach((q, i) => {
    const a = X(bounds[i]);
    const wpx = q.L * k;
    s += `<rect x="${f1(a)}" y="${yLoad}" width="${f1(wpx)}" height="10" fill="${p.accent}" fill-opacity="0.18"/>`;
    const na = Math.max(3, Math.round(wpx / 26));
    for (let t = 0; t <= na; t++) s += arrow(a + 3 + t * (wpx - 6) / na, yLoad, a + 3 + t * (wpx - 6) / na, yTop - 3, p.accent, 1.1, 4);
    if (q.wu !== undefined && i === 0 || (q.wu !== undefined && mem[i - 1] && Math.abs(mem[i - 1].wu - q.wu) > 1e-6)) s += text(a + wpx / 2, yLoad - 4, `wu = ${nf(q.wu, 2)} ${unit.w}`, { fill: p.ink, size: 10.5, anchor: 'middle', weight: 600 });
  });

  // ---- hormigón y columnas
  const left = X(0) - (supAt(0) ? colW / 2 : 0);
  const right = X(Ltot) + (supAt(nM) ? colW / 2 : 0);
  s += `<rect x="${f1(left)}" y="${yTop}" width="${f1(right - left)}" height="${hh}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.6"/>`;
  sups.forEach((sp) => {
    const cx = X(bounds[sp.at]);
    const hc = slab ? 20 : 34;
    s += `<rect x="${f1(cx - colW / 2)}" y="${yBot}" width="${colW}" height="${hc}" fill="${p.fill}" stroke="${p.ink}" stroke-width="1.3"/>`;
    if (sp.fixed) {                                                    // empotrado: base fija con rayado
      s += `<line x1="${f1(cx - colW / 2 - 4)}" y1="${yBot + hc}" x2="${f1(cx + colW / 2 + 4)}" y2="${yBot + hc}" stroke="${p.ink}" stroke-width="2.4"/>`;
      for (let t = 0; t < 4; t++) s += `<line x1="${f1(cx - colW / 2 - 2 + t * 7)}" y1="${yBot + hc}" x2="${f1(cx - colW / 2 - 8 + t * 7)}" y2="${yBot + hc + 6}" stroke="${p.ink}" stroke-opacity="0.6"/>`;
    }
    s += text(cx, yBot + hc + 14 + (sp.fixed ? 6 : 0), sp.name || '', { fill: p.soft, size: 10.5, anchor: 'middle', weight: 600 });
  });

  // ---- estribos (solo vigas)
  const zonesOf = mem.map((q) => (slab || !q.shearAt ? [] : stirrupZones({ L: q.L, vL: q.vA, vR: q.vB, shearAt: q.shearAt, dMm: q.d })));
  let thinned = false;
  if (!slab) {
    mem.forEach((q, i) => {
      const zs = zonesOf[i];
      if (!zs.length) return;
      const sAt = (x) => (zs.find((z) => x >= z.a - 1e-9 && x <= z.b + 1e-9) || zs[zs.length - 1]).s;
      let x = 0.05;
      while (x <= q.L - 0.05 + 1e-9) {
        const sm = sAt(x);
        const step = Math.max(1, Math.ceil(2.4 / (sm * pxMm)));
        if (step > 1) thinned = true;
        const px = X(bounds[i] + x);
        s += `<line x1="${f1(px)}" y1="${yTop + 4}" x2="${f1(px)}" y2="${yBot - 4}" stroke="${p.accent}" stroke-width="1"/>`;
        x += step * sm / 1000;
      }
    });
  }

  // ---- barras
  const yb = yBot - 7;
  const yt = yTop + 7;
  const layerOff = (y) => (y > yTop + hh / 2 ? -5 : 5);
  const bar = (xa, xb, y, layers) => {
    let r = `<line x1="${f1(xa)}" y1="${f1(y)}" x2="${f1(xb)}" y2="${f1(y)}" stroke="${p.warm}" stroke-width="2.6" stroke-linecap="round"/>`;
    if (layers === 2) r += `<line x1="${f1(xa)}" y1="${f1(y + layerOff(y))}" x2="${f1(xb)}" y2="${f1(y + layerOff(y))}" stroke="${p.warm}" stroke-width="2.6" stroke-linecap="round"/>`;
    return r;
  };
  if (!slab) {
    s += `<line x1="${f1(left + 3)}" y1="${f1(yt)}" x2="${f1(right - 3)}" y2="${f1(yt)}" stroke="${p.warm}" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.8"/>`;
    legend.push({ n: 'M', t: 'Montaje arriba: 2 barras corridas (porta-estribos)', d: 'constructiva, el diámetro se define en obra: no se calcula' });
  }
  const spanNo = (i) => mem.slice(0, i + 1).filter((q) => q.type === 'span').length;
  const nSpans = mem.filter((q) => q.type === 'span').length;
  mem.forEach((q, i) => {
    if (q.type !== 'span' || !q.pos) return;
    const a = X(bounds[i]) + 3;
    const b2 = X(bounds[i + 1]) - 3;
    s += bar(a, b2, yb, q.pos.layers);
    num += 1;
    s += circ((a + b2) / 2, yb - 12 + (q.pos.layers === 2 ? -4 : 0), num);
    legend.push({ n: num, t: `Inferior${nSpans > 1 ? ` tramo ${spanNo(i)}` : ''}: ${barText(q.pos)}${slab ? ' por metro' : ''}`, d: `${nf(q.L, 2)} m de eje a eje de apoyos, anclada en ambos` });
  });
  // alcance de la barra superior hacia el miembro i: punto de momento nulo + el mayor entre d y 12 db (art. 12.10.3); sin envolvente, 0,3 L
  const cutDist = (i, side) => {
    const cv = o.curves && o.curves[i];
    if (!cv) return null;
    const arr = side === 'L' ? cv.pts : cv.pts.slice().reverse();
    const x00 = arr[0].x;
    for (let t = 1; t < arr.length; t++) {
      if (arr[t].mMin >= -1e-6) {
        const a = arr[t - 1];
        const b2 = arr[t];
        const f = a.mMin === b2.mMin ? 0 : (0 - a.mMin) / (b2.mMin - a.mMin);
        return Math.abs(a.x + f * (b2.x - a.x) - x00);
      }
    }
    return null;
  };
  const reachInto = (i, side, bars) => {
    const q = mem[i];
    if (!q) return 0;
    if (q.type !== 'span') return q.L;                               // el voladizo lleva la barra superior en toda su longitud
    const cd = cutDist(i, side);
    const ext = Math.max(q.d || 0, 12 * (bars.db || 0)) / 1000;
    return Math.min(cd === null ? 0.3 * q.L : cd + ext, q.L * 0.95);
  };
  sups.forEach((sp) => {
    const bars = sp.top;
    if (!bars) return;
    const cx = X(bounds[sp.at]);
    const hasL = sp.at > 0;
    const hasR = sp.at < nM;
    const rl = hasL ? reachInto(sp.at - 1, 'R', bars) : 0;
    const rr = hasR ? reachInto(sp.at, 'L', bars) : 0;
    const lcant = hasL && mem[sp.at - 1].type !== 'span';
    const rcant = hasR && mem[sp.at].type !== 'span';
    const xa = hasL ? cx - rl * k + (lcant ? 4 : 0) : cx - 6;
    const xb = hasR ? cx + rr * k - (rcant ? 4 : 0) : cx + 6;
    const nm = sp.name || String(sups.indexOf(sp) + 1);
    let d2 = '';
    let len = rl + rr;
    let path;
    if (!hasL || !hasR) {                                              // apoyo de extremo: la barra se ancla con gancho
      const dir = hasR ? 1 : -1;
      const xe = cx - dir * 6;
      const xfar = hasR ? xb : xa;
      path = `<path d="M ${f1(xe)} ${f1(yt + 22)} L ${f1(xe)} ${f1(yt)} L ${f1(xfar)} ${f1(yt)}" fill="none" stroke="${p.warm}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      len = hasR ? rr : rl;
      d2 = `≈ ${nf(len + 0.1, 2)} m hacia el tramo, con gancho en el apoyo extremo`;
    } else {
      path = bar(xa, xb, yt, bars.layers);
      d2 = `≈ ${nf(rl + rr, 2)} m (${nf(rl, 2)} m a la izquierda y ${nf(rr, 2)} m a la derecha del eje)`;
      if (lcant || rcant) d2 += `; el voladizo la lleva en toda su longitud`;
    }
    if (bars.layers === 2 && (!hasL || !hasR)) path += `<line x1="${f1(cx - (hasR ? 6 : -6))}" y1="${f1(yt + 5)}" x2="${f1(hasR ? xb : xa)}" y2="${f1(yt + 5)}" stroke="${p.warm}" stroke-width="2.6" stroke-linecap="round"/>`;
    s += path;
    num += 1;
    s += circ((Math.min(xa, cx) + Math.max(xb, cx)) / 2, yt + 12 + (bars.layers === 2 ? 4 : 0), num);
    legend.push({ n: num, t: `Superior apoyo ${nm}: ${barText(bars)}${slab ? ' por metro' : ''}`, d: d2 });
  });
  // repartición (losa): puntos sobre las barras principales
  if (slab && o.dist && o.dist.s) {
    const step = Math.max(o.dist.s * pxMm, 5);
    for (let x = left + 8; x < right - 6; x += step) s += `<circle cx="${f1(x)}" cy="${f1(yb - 5)}" r="2.1" fill="${p.accent}"/>`;
    num += 1;
    const lx = X(Ltot / 2);
    s += `<circle cx="${f1(lx + 22)}" cy="${f1(yb - 14)}" r="6.6" fill="${p.fill}" stroke="${p.accent}" stroke-width="1.3"/>${fixedTxt(text(lx + 22, yb - 10.6, num, { fill: p.accent, size: 9.5, anchor: 'middle', weight: 700 }))}`;
    legend.push({ n: num, t: `Repartición (contracción y temperatura): ${o.dist.txt}`, d: 'perpendicular a la principal, encima de ella (art. 7.12.2)' });
  }

  // ---- zonas de estribos (cota debajo de la viga)
  if (!slab) {
    mem.forEach((q, i) => {
      const zs = zonesOf[i];
      zs.forEach((z) => {
        const lAtSup = z.a === 0 && supAt(i) && !(q.type === 'cantL');
        const rAtSup = z.b === q.L && supAt(i + 1) && !(q.type === 'cantR');
        const a = X(bounds[i] + z.a) + (lAtSup ? colW / 2 + 1 : 2);
        const b2 = X(bounds[i] + z.b) - (rAtSup ? colW / 2 + 1 : 2);
        if (b2 - a < 6) return;
        const y = yBot + 11;
        s += `<line x1="${f1(a)}" y1="${y}" x2="${f1(b2)}" y2="${y}" stroke="${p.accent}" stroke-width="1"/><line x1="${f1(a)}" y1="${y - 3}" x2="${f1(a)}" y2="${y + 3}" stroke="${p.accent}"/><line x1="${f1(b2)}" y1="${y - 3}" x2="${f1(b2)}" y2="${y + 3}" stroke="${p.accent}"/>`;
        const lab = b2 - a >= 62 ? `E ø${o.dSt} c/${nf(z.s / 10, 0)}` : `c/${nf(z.s / 10, 0)}`;
        s += text((a + b2) / 2, y + 13, lab, { fill: p.accent, size: 10, anchor: 'middle', weight: 600 });
      });
      if (zs.length) {
        const nm = q.type === 'span' ? `tramo ${spanNo(i)}` : q.type === 'cantL' ? 'voladizo izquierdo' : 'voladizo derecho';
        legend.push({ n: 'E', t: `Estribos ${nm}: ${zs.map((z) => `ø${o.dSt} c/${nf(z.s / 10, 0)} cm${zs.length > 1 ? ` (${nf(z.a, 2)} a ${nf(z.b, 2)} m)` : ''}`).join(' · ')}`, d: 'el primer estribo a 5 cm del apoyo; separación según el corte de cada zona' });
      }
    });
  }
  // cotas
  const yDim = yBot + (slab ? 60 : 70);
  mem.forEach((q, i) => { s += dimH(X(bounds[i]), X(bounds[i + 1]), yDim, `${q.type === 'span' ? '' : 'voladizo '}${nf(q.L, 2)} m`, p); });

  // ---- esquema de cálculo
  const yI = yDim + 54;
  s += text(8, yI - 22, 'Esquema de cálculo', { fill: p.ink, size: 11.5, weight: 600 });
  mem.forEach((q, i) => {
    const a = X(bounds[i]);
    const wpx = q.L * k;
    const na = Math.max(3, Math.round(wpx / 26));
    for (let t = 0; t <= na; t++) s += arrow(a + 1 + t * (wpx - 2) / na, yI - 18, a + 1 + t * (wpx - 2) / na, yI - 3, p.accent, 1, 3.6);
    s += `<line x1="${f1(a)}" y1="${yI - 18}" x2="${f1(a + wpx)}" y2="${yI - 18}" stroke="${p.accent}" stroke-width="1.2"/>`;
  });
  s += `<line x1="${f1(X(0))}" y1="${yI}" x2="${f1(X(Ltot))}" y2="${yI}" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>`;
  sups.forEach((sp) => {
    const cx = X(bounds[sp.at]);
    if (sp.fixed) {
      s += `<rect x="${f1(cx - 4)}" y="${yI - 14}" width="8" height="28" fill="${p.soft}" fill-opacity="0.45" stroke="${p.ink}"/>`;
    } else {
      s += `<polygon points="${f1(cx)},${yI + 2} ${f1(cx - 8)},${yI + 16} ${f1(cx + 8)},${yI + 16}" fill="none" stroke="${p.ink}" stroke-width="1.5"/><line x1="${f1(cx - 11)}" y1="${yI + 19}" x2="${f1(cx + 11)}" y2="${yI + 19}" stroke="${p.ink}" stroke-width="1.5"/>`;
    }
    if (sp.Ru !== undefined) s += text(cx, yI + 34, `R = ${nf(sp.Ru, 1)} ${unit.v}`, { fill: p.bad, size: 10, anchor: 'middle', weight: 600 });
  });

  // ---- diagramas de momento y de corte
  const curves = o.curves;
  let yEnd = yI + 50;
  if (curves) {
    const mAll = curves.flatMap((c) => c.pts.flatMap((q) => [Math.abs(q.mMax), Math.abs(q.mMin)]));
    const vAll = curves.flatMap((c) => c.pts.flatMap((q) => [Math.abs(q.vMax), Math.abs(q.vMin)]));
    const mScale = Math.max(...mAll, 1e-6);
    const vScale = Math.max(...vAll, 1e-6);
    const build = (f) => curves.flatMap((c, i) => c.pts.map((q) => [X(bounds[i] + q.x), f(q)]));
    const extent = (key1, key2, h2, scale, down) => {
      const vals = [...build((q) => q[key1]), ...build((q) => q[key2])].map((q) => q[1]);
      const kk = h2 / scale;
      return { up: (down ? Math.max(0, -Math.min(...vals)) : Math.max(0, Math.max(...vals))) * kk, dn: (down ? Math.max(0, Math.max(...vals)) : Math.max(0, -Math.min(...vals))) * kk };
    };
    const env = (key1, key2, y, h2, scale, down, color, title, labels, upExt) => {
      const a = build((q) => q[key1]);
      const b2 = build((q) => q[key2]);
      const kk = h2 / scale;
      const sg = down ? 1 : -1;
      const poly1 = a.map(([x, v]) => `${f1(x)},${f1(y + sg * v * kk)}`).join(' ');
      const poly2 = b2.map(([x, v]) => `${f1(x)},${f1(y + sg * v * kk)}`).reverse().join(' ');
      let out = text(8, y - upExt - 16, title, { fill: p.ink, size: 11.5, weight: 600 });
      out += `<line x1="${f1(X(0))}" y1="${f1(y)}" x2="${f1(X(Ltot))}" y2="${f1(y)}" stroke="${p.soft}"/>`;
      out += `<polygon points="${poly1} ${poly2}" fill="${color}" fill-opacity="0.16"/><polyline points="${poly1}" fill="none" stroke="${color}" stroke-width="2"/>`;
      if (key1 !== key2) out += `<polyline points="${b2.map(([x, v]) => `${f1(x)},${f1(y + sg * v * kk)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
      labels.forEach((l) => { out += `<circle cx="${f1(l.x)}" cy="${f1(y + sg * l.v * kk)}" r="2.6" fill="${color}"/>` + withFu(text(l.x + (l.dx || 0), y + sg * l.v * kk + (l.up ? -6 : 13), l.text, { fill: p.ink, size: 10.5, anchor: l.anchor || 'middle', weight: 600 }), fuOf(title)); });
      return out;
    };
    const mLabels = [];
    const vLabels = [];
    curves.forEach((c, i) => {
      const pts = c.pts;
      let iMax = 0;
      pts.forEach((q, t) => { if (q.mMax > pts[iMax].mMax) iMax = t; });
      if (mem[i].type === 'span' && pts[iMax].mMax > 0.05 * mScale) mLabels.push({ x: X(bounds[i] + pts[iMax].x), v: pts[iMax].mMax, text: nf(pts[iMax].mMax, 1), up: false });
      vLabels.push({ x: X(bounds[i]) + 3, v: pts[0].vMax, text: nf(pts[0].vMax, 0), up: true, anchor: 'start' });
      vLabels.push({ x: X(bounds[i + 1]) - 3, v: pts[pts.length - 1].vMin, text: nf(pts[pts.length - 1].vMin, 0), up: false, anchor: 'end' });
    });
    sups.forEach((sp, si) => {
      const lm = sp.at > 0 ? curves[sp.at - 1].pts[curves[sp.at - 1].pts.length - 1].mMin : 0;
      const rm = sp.at < nM ? curves[sp.at].pts[0].mMin : 0;
      const m = Math.min(lm, rm);
      if (m < -0.05 * mScale) mLabels.push({ x: X(bounds[sp.at]) + (sp.at === 0 ? 8 : sp.at === nM ? -8 : 0), v: m, text: nf(m, 1), up: true, anchor: sp.at === 0 ? 'start' : sp.at === nM ? 'end' : 'middle' });
      void si;
    });
    const eM = extent('mMax', 'mMin', 40, mScale, true);
    const yM = yEnd + 24 + eM.up + 8;
    s += env('mMax', 'mMin', yM, 40, mScale, true, p.warm, `Momento flector (${unit.m}): tracción del lado de las barras`, mLabels, eM.up);
    const eV = extent('vMax', 'vMin', 34, vScale, false);
    const yV = yM + eM.dn + 18 + 24 + eV.up + 8;
    s += env('vMax', 'vMin', yV, 34, vScale, false, p.accent, `Corte (${unit.v})`, vLabels, eV.up);
    yEnd = yV + eV.dn + 30;
    curves.forEach((c, i) => {
      [cutDist(i, 'L'), cutDist(i, 'R')].forEach((cd, t) => {
        if (cd === null || cd <= 0.02 || mem[i].type !== 'span') return;
        guides.push(t === 0 ? X(bounds[i] + cd) : X(bounds[i + 1] - cd));
      });
    });
  }
  const topG = yBot + 34;
  const guideSvg = guides.map((gx) => `<line x1="${f1(gx)}" y1="${topG}" x2="${f1(gx)}" y2="${yEnd - 16}" stroke="${p.soft}" stroke-width="0.9" stroke-dasharray="2 4" stroke-opacity="0.8"/>`).join('');

  // ---- leyenda
  let ly = yEnd;
  s += text(8, ly, 'Referencias', { fill: p.ink, size: 11.5, weight: 600 });
  ly += 6;
  legend.forEach((it) => {
    ly += 17;
    const isE = it.n === 'E';
    const isM = it.n === 'M';
    s += `<circle cx="16" cy="${ly - 4}" r="6.6" fill="${p.fill}" stroke="${isE ? p.accent : p.warm}" stroke-width="1.3" stroke-dasharray="${isM ? '2 2' : 'none'}"/>${fixedTxt(text(16, ly - 0.6, it.n, { fill: isE ? p.accent : p.warm, size: 9.5, anchor: 'middle', weight: 700 }))}`;
    s += text(30, ly, it.t, { fill: p.ink, size: 10.5 }) + text(30, ly + 12, it.d, { fill: p.soft, size: 9.5 });
    ly += 12;
  });
  ly += 20;
  const notes = [
    slab ? 'Franja de 1 m de ancho. La altura de la losa está exagerada en el dibujo.' : 'La altura de la viga está exagerada en el dibujo. Los estribos se dibujan con la separación de cada zona.',
    'Esquema de principio: las longitudes de anclaje, empalmes y ganchos se verifican en el despiece (CIRSOC 201, cap. 12).',
    'Las barras superiores llegan hasta el punto de momento nulo más d ó 12 db (art. 12.10.3); parte de las inferiores debe entrar en los apoyos (art. 12.11.1).',
  ];
  if (sups.some((sp) => sp.fixed)) notes.push('Apoyo empotrado: base fija con rayado. Su armadura superior y la de los extremos se anclan en el elemento que lo empotra.');
  if (thinned) notes.push('Dibujo simplificado: no se trazan todos los estribos por la escala; la separación vale la indicada.');
  const wrap = (t, n) => { const out = []; let cur = ''; t.split(' ').forEach((w) => { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); return out; };
  notes.forEach((t) => wrap(t, 112).forEach((line) => { s += text(8, ly, line, { fill: p.soft, size: 10 }); ly += 13; }));
  return svgWrap(W, ly + 4, guideSvg + s, 'Armado: elevación con barras y estribos, esquema de cálculo y diagramas de momento y de corte', 680);
}

// Versión de un tramo simple, un voladizo o una viga continua de tramos sobre apoyos simples (la forma que usaban las pantallas anteriores)
// o: spans [{ L, wu, pos, negL, negR, d, vL, vR, shearAt }], kind ('continuous' | 'cantilever'), names, curves, reactions
export function armadoFigure(o) {
  const cant = o.kind === 'cantilever';
  const spans = o.spans;
  if (cant) {
    const q = spans[0];
    return armadoMembersFigure({ ...o, members: [{ type: 'cantR', L: q.L, wu: q.wu, d: q.d, vA: q.vL, vB: q.vR, shearAt: q.shearAt }], supports: [{ at: 0, fixed: true, name: (o.names && o.names[0]) || '', top: q.negL }] });
  }
  const members = spans.map((q) => ({ type: 'span', L: q.L, wu: q.wu, d: q.d, vA: q.vL, vB: -q.vR, pos: q.pos, shearAt: q.shearAt }));      // vL y vR llegan como módulos: el corte cambia de signo en el tramo
  const supports = Array.from({ length: spans.length + 1 }, (_, i) => {
    const cand = [i > 0 && spans[i - 1].negR, i < spans.length && spans[i].negL].filter(Boolean);
    const top = cand.sort((u, v) => (v.n || 1) * (v.db || 0) ** 2 - (u.n || 1) * (u.db || 0) ** 2)[0] || null;
    return { at: i, fixed: false, name: (o.names && o.names[i]) || '', top, Ru: o.reactions ? o.reactions[i] : undefined };
  });
  return armadoMembersFigure({ ...o, members, supports });
}

// ---------------------------------------------------------------- curvas analíticas de un tramo simple o un voladizo
export function simpleCurves({ L, wu, cantilever = false, n = 24 }) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = L * i / n;
    const M = cantilever ? -wu * (L - x) ** 2 / 2 : wu * x * (L - x) / 2;
    const V = cantilever ? wu * (L - x) : wu * (L / 2 - x);
    pts.push({ x, mMax: M, mMin: M, vMax: V, vMin: V });
  }
  return { pts };
}

// armadura de repartición mínima de una losa (art. 7.12.2): ADN 420, As ≥ cuantía mínima · b · h, s ≤ mín (3 h, 300 mm)
export function distributionBars({ asMin, sMax }) {
  const steps = [100, 125, 150, 175, 200, 250, 300];
  for (const db of [6, 8, 10]) {
    const sCalc = barArea(db) * 1000 / asMin;
    const cand = steps.filter((st) => st <= sCalc + 1e-9 && st <= sMax + 1e-9).pop();
    if (cand) return { db, s: cand, txt: `ø${db} c/${nf(cand / 10, cand % 10 ? 1 : 0)} cm` };
  }
  return null;
}

// ---------------------------------------------------------------- losa en dos direcciones: planta de armado
// res: resultado de designSlab2. Barras inferiores de cada dirección (franja central y franjas laterales), barras superiores sobre los
// bordes empotrados con su alcance, y refuerzos de esquina. Se dibujan con la separación real (hasta un mínimo de 3 px entre barras).
export function slab2ArmadoFigure(res, pal = 'screen') {
  const p = PAL[pal];
  const { lx, ly, edges } = res;
  const pl = res.plate;
  const W = 600;
  const k = Math.min(380 / lx, 250 / ly);
  const w = lx * k;
  const h = ly * k;
  const ox = (W - w) / 2;
  const oy = 56;
  const X = (m) => ox + m * k;
  const Y = (m) => oy + h - m * k;                                  // y hacia arriba, como en el esquema de la losa
  let s = text(8, 16, `Planta de armado · ${nf(lx, 2)} × ${nf(ly, 2)} m`, { fill: p.ink, size: 12, weight: 600 });
  s += `<rect x="${f1(ox)}" y="${f1(oy)}" width="${f1(w)}" height="${f1(h)}" fill="${p.fill}" fill-opacity="0.5" stroke="none"/>`;
  const legend = [];
  const fixedTxt = (t) => t.replace('<text ', '<text data-fixed="1" ');
  const tag = (cx, cy, n, col) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="7" fill="${p.fill}" stroke="${col}" stroke-width="1.4"/>${fixedTxt(text(cx, cy + 3.6, n, { fill: col, size: 10, anchor: 'middle', weight: 700 }))}`;
  const barTxt2 = (c) => (c ? `ø${c.db} c/${nf(c.s / 10, c.s % 10 ? 1 : 0)} cm` : 'no verifica');
  // ---- inferiores: X (horizontales, naranja) e Y (verticales, azul)
  const sketch = (dir, a0, a1, c, color) => {
    if (!c) return '';
    const step = Math.max(c.s / 1000 * k, 3);
    let o = '';
    if (dir === 'x') {
      for (let yy = a0 * k + step / 2; yy < a1 * k - 0.5; yy += step) o += `<line x1="${f1(ox + 3)}" y1="${f1(oy + h - yy)}" x2="${f1(ox + w - 3)}" y2="${f1(oy + h - yy)}" stroke="${color}" stroke-width="0.7" stroke-opacity="0.85"/>`;
    } else {
      for (let xx = a0 * k + step / 2; xx < a1 * k - 0.5; xx += step) o += `<line x1="${f1(ox + xx)}" y1="${f1(oy + 3)}" x2="${f1(ox + xx)}" y2="${f1(oy + h - 3)}" stroke="${color}" stroke-width="0.8"/>`;
    }
    return o;
  };
  const ym0 = ly * 0.25;
  const ym1 = ly * 0.75;
  const xm0 = lx * 0.25;
  const xm1 = lx * 0.75;
  s += sketch('y', 0, xm0, res.pos.y.side.chosen, p.accent) + sketch('y', xm0, xm1, res.pos.y.mid.chosen, p.accent) + sketch('y', xm1, lx, res.pos.y.side.chosen, p.accent);
  s += sketch('x', 0, ym0, res.pos.x.side.chosen, p.warm) + sketch('x', ym0, ym1, res.pos.x.mid.chosen, p.warm) + sketch('x', ym1, ly, res.pos.x.side.chosen, p.warm);
  // límites de las franjas
  [ym0, ym1].forEach((yy) => { s += `<line x1="${f1(ox - 6)}" y1="${f1(Y(yy))}" x2="${f1(ox + w + 6)}" y2="${f1(Y(yy))}" stroke="${p.soft}" stroke-width="0.8" stroke-dasharray="3 3"/>`; });
  [xm0, xm1].forEach((xx) => { s += `<line x1="${f1(X(xx))}" y1="${f1(oy - 6)}" x2="${f1(X(xx))}" y2="${f1(oy + h + 6)}" stroke="${p.soft}" stroke-width="0.8" stroke-dasharray="3 3"/>`; });
  let n = 0;
  const add = (col, t, d, cx, cy) => { n += 1; s += tag(cx, cy, n, col); legend.push({ n, col, t, d }); };
  add(p.warm, `Inferior X, franja central: ${barTxt2(res.pos.x.mid.chosen)}`, 'barras paralelas a x, mitad central del ancho (art. 13.6.4)', X(lx / 2), Y(ly / 2) - 14);
  add(p.warm, `Inferior X, franjas laterales: ${barTxt2(res.pos.x.side.chosen)}`, 'un cuarto del ancho a cada lado', X(lx * 0.12), Y(ly * 0.125));
  add(p.accent, `Inferior Y, franja central: ${barTxt2(res.pos.y.mid.chosen)}`, 'barras paralelas a y, mitad central del ancho', X(lx / 2) + 20, Y(ly / 2) + 8);
  add(p.accent, `Inferior Y, franjas laterales: ${barTxt2(res.pos.y.side.chosen)}`, 'un cuarto del ancho a cada lado', X(lx * 0.125) + 18, Y(ly * 0.5));

  // ---- superiores sobre los bordes empotrados: alcance = punto de momento nulo (de la placa) + el mayor entre d y 12 db
  const avgCol = (arr, i, j0, j1) => { let t = 0; for (let j = j0; j <= j1; j++) t += arr[j][i]; return t / (j1 - j0 + 1); };
  const avgRow = (arr, j, i0, i1) => { let t = 0; for (let i = i0; i <= i1; i++) t += arr[j][i]; return t / (i1 - i0 + 1); };
  const cut = (vals, total) => {
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] >= 0) { const a = vals[i - 1]; const b = vals[i]; const f = a === b ? 0 : (0 - a) / (b - a); return (i - 1 + f) / (vals.length - 1) * total; }
    }
    return total / 2;
  };
  const valsX = Array.from({ length: pl.nx + 1 }, (_, i) => avgCol(pl.mx, i, Math.round(pl.ny * 0.25), Math.round(pl.ny * 0.75)));
  const valsY = Array.from({ length: pl.ny + 1 }, (_, j) => avgRow(pl.my, j, Math.round(pl.nx * 0.25), Math.round(pl.nx * 0.75)));
  const topBars = (edge) => {
    const c = res.neg[edge];
    if (edges[edge] !== 'C' || !c) return;
    const horizontal = edge === 'x0' || edge === 'x1';              // el borde es vertical y las barras corren en x
    const total = horizontal ? lx : ly;
    const vals = horizontal ? valsX : valsY;
    const fromEnd = edge === 'x1' || edge === 'y1';
    const cd = cut(fromEnd ? vals.slice().reverse() : vals, total);
    const mk = (ch) => (ch ? Math.min(cd + Math.max(ch.d || 0, 12 * ch.db) / 1000, total / 2) : 0);
    const rMid = mk(c.mid.chosen);
    const rEnd = mk(c.ends.chosen);
    const side = horizontal ? ly : lx;
    const draw = (ch, r, a0, a1) => {
      if (!ch || r <= 0) return '';
      const step = Math.max(ch.s / 1000 * k, 3.5);
      let o = '';
      for (let t = a0 * k + step / 2; t < a1 * k - 0.5; t += step) {
        if (horizontal) {
          const yy = oy + h - t;
          const xa = edge === 'x0' ? ox : ox + w;
          const xb = edge === 'x0' ? ox + r * k : ox + w - r * k;
          o += `<line x1="${f1(xa)}" y1="${f1(yy)}" x2="${f1(xb)}" y2="${f1(yy)}" stroke="${p.ink}" stroke-width="1.7" stroke-dasharray="6 2"/>`;
        } else {
          const xx = ox + t;
          const ya = edge === 'y0' ? oy + h : oy;
          const yb2 = edge === 'y0' ? oy + h - r * k : oy + r * k;
          o += `<line x1="${f1(xx)}" y1="${f1(ya)}" x2="${f1(xx)}" y2="${f1(yb2)}" stroke="${p.ink}" stroke-width="1.7" stroke-dasharray="6 2"/>`;
        }
      }
      return o;
    };
    s += draw(c.ends.chosen, rEnd, 0, side * 0.25) + draw(c.mid.chosen, rMid, side * 0.25, side * 0.75) + draw(c.ends.chosen, rEnd, side * 0.75, side);
    const nm = { x0: 'izquierdo', x1: 'derecho', y0: 'inferior', y1: 'superior' }[edge];
    const lab = horizontal
      ? { cx: edge === 'x0' ? X(rMid) + 12 : X(lx - rMid) - 12, cy: Y(ly * 0.5) + 30 }
      : { cx: X(lx * 0.5) + 30, cy: edge === 'y0' ? Y(rMid) - 12 : Y(ly - rMid) + 12 };
    add(p.ink, `Superior borde ${nm}: ${barTxt2(c.mid.chosen)} en el centro y ${barTxt2(c.ends.chosen)} en los extremos`, `llegan ≈ ${nf(rMid, 2)} m hacia el paño: punto de momento nulo + d ó 12 db (art. 12.10.3)`, lab.cx, lab.cy);
  };
  ['x0', 'x1', 'y0', 'y1'].forEach(topBars);
  // ---- esquinas apoyadas: barras en la diagonal y perpendiculares a ella
  (res.corners || []).forEach((cn) => {
    if (!cn.chosen) return;
    const cx = /\(lx/.test(cn.label) ? lx : 0;
    const cy = /, ly\)/.test(cn.label) ? ly : 0;
    const dx = cx === 0 ? 1 : -1;
    const dy = cy === 0 ? 1 : -1;
    const x0c = X(cx);
    const y0c = Y(cy);
    const L2 = cn.length / 1000 * k * 0.7;
    const mx = x0c + dx * L2 * 0.5;
    const my = y0c - dy * L2 * 0.5;
    s += `<line x1="${f1(x0c)}" y1="${f1(y0c)}" x2="${f1(x0c + dx * L2)}" y2="${f1(y0c - dy * L2)}" stroke="${p.bad}" stroke-width="2.2" stroke-linecap="round"/>`;
    s += `<line x1="${f1(mx + 8)}" y1="${f1(my + 8 * dx * dy)}" x2="${f1(mx - 8)}" y2="${f1(my - 8 * dx * dy)}" stroke="${p.bad}" stroke-width="2.2" stroke-linecap="round"/>`;
  });
  if ((res.corners || []).length) {
    n += 1;
    const c0 = res.corners[0];
    s += tag(ox + w - 6, oy - 18, n, p.bad);
    legend.push({ n, col: p.bad, t: `Esquinas apoyadas (${res.corners.length}): ${barTxt2(c0.chosen)} arriba y abajo`, d: `hasta ${nf(c0.length / 10, 0)} cm desde la esquina (art. 13.3.6)` });
  }
  // bordes (trazo grueso = empotrado)
  const edgeLine = (kind, x1, y1, x2, y2) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${p.ink}" stroke-width="${kind === 'C' ? 5 : 2}"/>`;
  s += edgeLine(edges.y1, ox, oy, ox + w, oy) + edgeLine(edges.y0, ox, oy + h, ox + w, oy + h) + edgeLine(edges.x0, ox, oy, ox, oy + h) + edgeLine(edges.x1, ox + w, oy, ox + w, oy + h);
  s += dimH(ox, ox + w, oy + h + 22, `lx = ${nf(lx, 2)} m`, p);
  s += text(ox - 10, oy + h / 2, `ly = ${nf(ly, 2)} m`, { fill: p.soft, size: 10.5, anchor: 'middle', rotate: -90 });
  // leyenda
  let yL = oy + h + 50;
  s += text(8, yL, 'Referencias', { fill: p.ink, size: 11.5, weight: 600 });
  legend.forEach((it) => {
    yL += 17;
    s += `<circle cx="16" cy="${yL - 4}" r="6.6" fill="${p.fill}" stroke="${it.col}" stroke-width="1.3"/>${fixedTxt(text(16, yL - 0.6, it.n, { fill: it.col, size: 9.5, anchor: 'middle', weight: 700 }))}`;
    s += text(30, yL, it.t, { fill: p.ink, size: 10.5 }) + text(30, yL + 12, it.d, { fill: p.soft, size: 9.5 });
    yL += 12;
  });
  yL += 20;
  ['Naranja: barras inferiores paralelas a x. Azul: inferiores paralelas a y (la de la luz corta va en la capa más baja). Trazo grueso del borde: empotrado.',
    'Esquema de principio: las longitudes de anclaje, empalmes y ganchos se verifican en el despiece (CIRSOC 201, cap. 12).'].forEach((t) => { s += text(8, yL, t, { fill: p.soft, size: 10 }); yL += 13; });
  return svgWrap(W, yL + 4, s, 'Planta de armado de la losa en dos direcciones', 680);
}

// ---------------------------------------------------------------- losas de un nivel del edificio: planta de armado
// X, Y: abscisas acumuladas de los ejes (m); panels: [{ i, j, bx, by }] con bx = barras paralelas a x, by = paralelas a y ({ db, s });
// supportsX[i] / supportsY[j]: { M (kN·m/m), bar } de las barras superiores sobre el eje i (paralelas a x) o j (paralelas a y).
// Cada paño muestra dos barras tipo de cada dirección y su rótulo; las barras superiores se dibujan a cada lado del eje.
export function slabLevelArmadoFigure({ level, hCm, X, Y, panels, supportsX, supportsY, letter, pal = 'screen' }) {
  const p = PAL[pal];
  const W = 600;
  const Lx = X[X.length - 1];
  const Ly = Y[Y.length - 1];
  const k = Math.min(430 / Lx, 300 / Ly);
  const ox = Math.max(40, (W - Lx * k) / 2 - 36);
  const oy = 52;
  const px = (x) => ox + x * k;
  const py = (y) => oy + (Ly - y) * k;
  const tx = (b) => (b ? `ø${b.db} c/${nf(b.s / 10, b.s % 10 ? 1 : 0)}` : '—');
  const fx = (t) => t.replace('<text ', '<text data-fixed="1" ');       // los rótulos van en su lugar: no los mueve el acomodador de etiquetas
  let s = text(8, 16, `Nivel ${level} · planta de armado de la losa${hCm ? ` · e = ${nf(hCm, 0)} cm` : ''}`, { fill: p.ink, size: 12, weight: 600 });
  s += `<rect x="${f1(px(0))}" y="${f1(py(Ly))}" width="${f1(Lx * k)}" height="${f1(Ly * k)}" fill="${p.fill}" fill-opacity="0.45" stroke="${p.line}"/>`;
  // ejes
  X.forEach((x, i) => { s += `<line x1="${f1(px(x))}" y1="${f1(py(Ly) - 4)}" x2="${f1(px(x))}" y2="${f1(py(0) + 6)}" stroke="${p.soft}" stroke-width="0.8" stroke-dasharray="4 3"/>${text(px(x), py(0) + 18, String(i + 1), { fill: p.soft, size: 10, anchor: 'middle', weight: 600 })}`; });
  Y.forEach((y, j) => { s += `<line x1="${f1(px(0) - 6)}" y1="${f1(py(y))}" x2="${f1(px(Lx) + 4)}" y2="${f1(py(y))}" stroke="${p.soft}" stroke-width="0.8" stroke-dasharray="4 3"/>${text(px(0) - 12, py(y) + 3.5, letter(j), { fill: p.soft, size: 10, anchor: 'middle', weight: 600 })}`; });
  // inferiores por paño
  panels.forEach((q) => {
    const xa = px(X[q.i]);
    const xb = px(X[q.i + 1]);
    const ya = py(Y[q.j + 1]);
    const yb = py(Y[q.j]);
    const wpx = xb - xa;
    const hpx = yb - ya;
    [0.28, 0.72].forEach((f) => {
      s += `<line x1="${f1(xa + 5)}" y1="${f1(ya + hpx * f)}" x2="${f1(xb - 5)}" y2="${f1(ya + hpx * f)}" stroke="${p.warm}" stroke-width="1.6" stroke-linecap="round"/>`;
      s += `<line x1="${f1(xa + wpx * f)}" y1="${f1(ya + 5)}" x2="${f1(xa + wpx * f)}" y2="${f1(yb - 5)}" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round"/>`;
    });
    const cx = (xa + xb) / 2;
    const cy = (ya + yb) / 2;
    s += `<rect x="${f1(cx - 31)}" y="${f1(cy - 15)}" width="62" height="30" rx="4" fill="${p.fill}" fill-opacity="0.92"/>`;
    s += fx(text(cx, cy - 3, `→ ${tx(q.bx)}`, { fill: p.warm, size: 10, anchor: 'middle', weight: 700 })) + fx(text(cx, cy + 10, `↑ ${tx(q.by)}`, { fill: p.accent, size: 10, anchor: 'middle', weight: 700 }));
  });
  // superiores sobre los ejes: ≈ 0,3 de la luz de cada paño adyacente (aproximación declarada en la app)
  const dash = `stroke="${p.ink}" stroke-width="2" stroke-dasharray="7 2" stroke-linecap="round"`;
  supportsX.forEach((sp, i) => {
    if (!sp.bar || !(sp.M > 0.05)) return;
    const wl = i > 0 ? (X[i] - X[i - 1]) * 0.3 : 0;
    const wr = i < X.length - 1 ? (X[i + 1] - X[i]) * 0.3 : 0;
    const hook = (i === 0 || i === X.length - 1);
    for (let j = 0; j < Y.length - 1; j++) {
      [0.28, 0.72].forEach((f) => {
        const yy = py(Y[j + 1]) + (py(Y[j]) - py(Y[j + 1])) * f - 5;
        s += `<line x1="${f1(px(X[i]) - wl * k)}" y1="${f1(yy)}" x2="${f1(px(X[i]) + wr * k)}" y2="${f1(yy)}" ${dash}/>`;
      });
    }
    s += text(px(X[i]), oy - 16, tx(sp.bar), { fill: p.ink, size: 9.5, anchor: 'middle', weight: 700 });
    void hook;
  });
  supportsY.forEach((sp, j) => {
    if (!sp.bar || !(sp.M > 0.05)) return;
    const wd = j > 0 ? (Y[j] - Y[j - 1]) * 0.3 : 0;
    const wu = j < Y.length - 1 ? (Y[j + 1] - Y[j]) * 0.3 : 0;
    for (let i = 0; i < X.length - 1; i++) {
      [0.28, 0.72].forEach((f) => {
        const xx = px(X[i]) + (px(X[i + 1]) - px(X[i])) * f + 5;
        s += `<line x1="${f1(xx)}" y1="${f1(py(Y[j]) + wd * k)}" x2="${f1(xx)}" y2="${f1(py(Y[j]) - wu * k)}" ${dash}/>`;
      });
    }
    s += text(px(Lx) + 8, py(Y[j]) + 3.5, tx(sp.bar), { fill: p.ink, size: 9.5, anchor: 'start', weight: 700 });
  });
  let yL = py(0) + 40;
  s += text(8, yL, 'Referencias', { fill: p.ink, size: 11.5, weight: 600 });
  [[p.warm, '→ barras inferiores paralelas a x (se dibujan dos de cada paño; la separación vale la del rótulo)'],
    [p.accent, '↑ barras inferiores paralelas a y (la de la luz corta va en la capa más baja)'],
    [p.ink, 'Trazo cortado: barras superiores sobre los apoyos, ≈ 0,3 de la luz a cada lado (rótulo arriba y a la derecha)'],
  ].forEach(([col, t]) => { yL += 15; s += `<line x1="8" y1="${yL - 4}" x2="24" y2="${yL - 4}" stroke="${col}" stroke-width="2" ${col === p.ink ? 'stroke-dasharray="5 2"' : ''}/>${text(30, yL, t, { fill: p.ink, size: 10 })}`; });
  yL += 20;
  ['Los voladizos, los refuerzos de borde y de esquina no se dibujan. Las longitudes de anclaje y de empalme se verifican en el despiece (CIRSOC 201, cap. 12).'].forEach((t) => { s += text(8, yL, t, { fill: p.soft, size: 10 }); yL += 13; });
  return svgWrap(W, yL + 4, s, `Planta de armado de las losas del nivel ${level}`, 680);
}
