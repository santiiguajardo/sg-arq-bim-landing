// Condiciones de diseño de los elementos de grandes luces, tomadas de los resúmenes de la cátedra de Estructuras IV
// (tracción, compresión, cáscaras, plegados, estereoestructuras y vigas de gran inercia). Son recomendaciones de
// diseño, no verificaciones del reglamento: se muestran aparte y no cambian el resultado del cálculo.
import { escapeHtml } from '../utils.js';

const n = (v) => Number(v);
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
const inRange = (v, lo, hi) => v >= lo - 1e-9 && v <= hi + 1e-9;
const row = (ok, name, text) => ({ ok, name, text });

function tensRows(d) {
  const L = n(d.L); const f = n(d.f); const a = n(d.a); const rows = [];
  const kind = d.kind;
  const ratio = L > 0 ? f / L : NaN;
  if (kind === 'jawerth') {
    const layout = d.layout || (d.cover === 'a' || d.cover === 'b' ? 'plana' : 'espacial');
    if (layout === 'plana') {
      const cover = d.cover === 'b' ? 'b' : 'a';
      rows.push(row(true, 'Luz de cálculo', `${fmt(L)} m. En la cercha plana la guía admite hasta 120 m con pendolones traccionados (cubierta colgada del cable inferior) y hasta 30 m con pendolones comprimidos (sobre el cable superior).`));
      rows[0].ok = cover === 'b' ? L <= 120 : L <= 30;
      rows[0].text = `${fmt(L)} m · máxima ${cover === 'b' ? '120 m (pendolones traccionados)' : '30 m (pendolones comprimidos)'}.`;
      const b = n(d.b);
      rows.push(row(inRange(b, 1.5, 2), 'Separación entre pendolones b', `${fmt(b, 2)} m · entre 1,5 y 2 m.`));
    } else if (layout === 'radial') {
      rows.push(row(inRange(L, 45, 80), 'Diámetro de la planta', `${fmt(L)} m · entre 45 y 80 m; por su complejidad constructiva conviene para grandes luces.`));
    } else {
      rows.push(row(L < 50, 'Luz de cálculo', `${fmt(L)} m · cercha espacial hasta 50 m.`));
    }
    if (layout !== 'radial') rows.push(row(a <= 5, 'Separación entre cerchas a', `${fmt(a, 2)} m · 5 m como máximo por la flexión de la correa.`));
    rows.push(row(inRange(ratio, 0.095, 0.105), 'Flecha f / L', `${fmt(ratio * 100)} % · las guías usan el 10 % de la luz.`));
  } else if (kind === 'heavy') {
    const w = n(d.W); const pp = n(d.Pp);
    rows.push(row(L < 50, 'Luz de cálculo', `${fmt(L)} m · estructura de simple curvatura hasta 50 m.`));
    rows.push(row(a <= 2.5, 'Separación entre cerchas a', `${fmt(a, 2)} m · 2,5 m como máximo.`));
    rows.push(row(inRange(ratio, 0.095, 0.105), 'Flecha f / L', `${fmt(ratio * 100)} % · luz / 10.`));
    if (w > 0) rows.push(row(pp >= 2.5 * w, 'Peso propio contra viento', `${fmt(pp / w, 2)} veces el viento · la tracción pesada se estabiliza por peso propio, entre 2,5 y 3 veces la carga de viento (qpp > 3·qw en la guía de cubierta pesada).`));
  } else if (kind === 'ph') {
    rows.push(row(inRange(L, 20, 50), 'Luz de la parábola (diagonal)', `${fmt(L)} m · entre 20 y 50 m.`));
    rows.push(row(inRange(ratio, 0.095, 0.105), 'Flecha f / L', `${fmt(ratio * 100)} % · las guías usan el 10 % de la luz.`));
    rows.push(row(Math.abs(a - 1) < 1e-9, 'Distancia entre cables a', `${fmt(a, 2)} m · la guía adopta 1 m.`));
  } else if (kind === 'hr') {
    const c = n(d.c); const m = n(d.nMer);
    rows.push(row(inRange(c, 5, 10), 'Distancia focal c', `${fmt(c, 2)} m · entre 5 y 10 m (la guía adopta 6 m).`));
    rows.push(row(m > 0 && m % 4 === 0, 'Cantidad de meridianos', `${fmt(m, 0)} · conviene un múltiplo de 4 por el sistema de apoyos. Plantas de 15 a 45 m de diámetro.`));
  }
  return rows;
}

function compRows(d) {
  const L = n(d.L); const f = n(d.f); const ratio = L > 0 ? f / L : NaN;
  const rows = [
    row(inRange(ratio, 0.25, 0.35), 'Flecha f / L', `${fmt(ratio * 100)} % · entre 25 y 35 % de la luz.`),
    row(L < 50, 'Luz', `${fmt(L)} m · menos de 50 m (la cerámica armada llega hasta unos 40 m).`),
  ];
  const beta = n(d.betaPandeo);
  if (Number.isFinite(beta)) rows.push(row(inRange(beta, 3, 5), 'Coeficiente de seguridad al pandeo', `${fmt(beta, 1)} · la guía usa de 3 a 5 sobre la carga crítica.`));
  return rows;
}

function foldedRows(d) {
  const L = n(d.L); const H = n(d.H); const rows = [];
  rows.push(row(L <= 30, 'Luz', `${fmt(L)} m · luz máxima ideal 30 m; se puede llegar a 50 m.`));
  if (H > 2) rows.push(row(false, 'Altura del plegado', `${fmt(H, 2)} m · con más de 2 m conviene colocar un solo plegado entre columnas, de pliegue más ancho.`));
  else rows.push(row(true, 'Altura del plegado', `${fmt(H, 2)} m · hasta 2 m puede repetirse la onda.`));
  const ratio = L > 0 ? H / L : NaN;
  rows.push(row(inRange(ratio, 0.07, 0.13), 'Altura / luz', `${fmt(ratio * 100)} % · la guía parte de H = luz / 10.`));
  return rows;
}

function spaceRows(d) {
  const sp = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s;,]+/)).map(n).filter((x) => x > 0);
  const xs = sp(d.xSpans); const ys = sp(d.ySpans); const Lm = n(d.Lm);
  const rows = [];
  const all = [...xs, ...ys];
  if (all.length) rows.push(row(Math.max(...all) <= 30, 'Luz entre apoyos', `Mayor luz ${fmt(Math.max(...all))} m · máxima ideal 30 m.`));
  if (all.length && Lm > 0) {
    const bad = all.filter((s) => Math.abs(s / Lm - Math.round(s / Lm)) > 0.01);
    rows.push(row(!bad.length, 'Módulos enteros', bad.length ? `Las luces ${bad.map((s) => fmt(s, 2)).join(', ')} m no son múltiplo de Lm = ${fmt(Lm, 2)} m: los módulos deben quedar enteros.` : `Todas las luces son múltiplo de Lm = ${fmt(Lm, 2)} m.`));
  }
  if (xs.length && ys.length) {
    const tx = xs.reduce((a, b) => a + b, 0); const ty = ys.reduce((a, b) => a + b, 0);
    const r = Math.max(tx, ty) / Math.min(tx, ty);
    rows.push(row(r <= 1.5, 'Forma de la planta', `${fmt(tx)} × ${fmt(ty)} m (relación ${fmt(r, 2)}) · las estereoestructuras cubren preferentemente plantas cuadradas.`));
  }
  return rows;
}

function vierRows(d) {
  const L = n(d.L); const H = n(d.H);
  return [row(H <= L / 10 && H >= L / 14, 'Altura de la viga', `H = ${fmt(H, 2)} m · entre L/14 = ${fmt(L / 14, 2)} m y L/10 = ${fmt(L / 10, 2)} m.`)];
}

function postRows(d) {
  const L = n(d.L); const h = n(d.h) / 100;
  return [row(h <= L / 15 && h >= L / 20, 'Altura de la viga', `h = ${fmt(h, 2)} m · entre L/20 = ${fmt(L / 20, 2)} m y L/15 = ${fmt(L / 15, 2)} m.`)];
}

function domeRows(d) {
  return [row(inRange(n(d.L), 20, 60), 'Diámetro a cubrir', `${fmt(n(d.L))} m · entre 20 y 60 m.`)];
}

const BY_ELEMENT = { stens: tensRows, scomp: compRows, splegado: foldedRows, sestereo: spaceRows, svier: vierRows, spost: postRows, sdome: domeRows };

export function designRanges(calc) {
  const fn = BY_ELEMENT[calc.element];
  if (!fn || !calc.design) return '';
  let rows = [];
  try { rows = fn(calc.design).filter((r) => r && r.name); } catch { return ''; }
  if (!rows.length) return '';
  const bad = rows.filter((r) => r.ok === false).length;
  return `<div class="card" style="margin-top:16px;">
    <h3 style="margin-top:0;">Condiciones de diseño de la cátedra <span class="text-muted" style="font-weight:400; font-size:12.5px;">(Estructuras IV)</span></h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Condición</th><th>Valor y rango recomendado</th><th>Estado</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${escapeHtml(r.text)}</td><td>${r.ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${bad ? `${bad} condición${bad > 1 ? 'es' : ''} fuera del rango recomendado: no invalida el cálculo, pero la forma se aparta de lo que la cátedra considera buen diseño.` : 'El diseño está dentro de los rangos recomendados.'} Son criterios de diseño de los resúmenes de la cursada, no exigencias del reglamento.</p>
  </div>`;
}
