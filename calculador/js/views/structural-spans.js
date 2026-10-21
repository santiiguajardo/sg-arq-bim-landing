// Editor de luces del calculador estructural: en lugar de una lista escrita a mano ("5, 6"), cada tramo es un casillero entre dos ejes,
// con botones para agregar o quitar tramos, un atajo para tramos iguales, los voladizos en los extremos y un dibujo que se actualiza solo.
import { setCalcField } from '../state.js';
import { showToast } from '../utils.js';
import { fmt } from './structural-ui.js';

const letter = (j) => String.fromCharCode(65 + j);
const axisName = (kind, i) => (kind === 'letter' ? letter(i) : String(i + 1));
const n2 = (v) => Number(v) || 0;
const sum = (a) => a.reduce((x, y) => x + y, 0);

let pendingFocus = null;

// ---------------------------------------------------------------- dibujo de una línea de apoyos con tramos y voladizos
export function axisSketch({ spans, cantL = 0, cantR = 0, kind = 'num', unit = 'm', fix = [] }) {
  const W = 560;
  const H = 96;
  const pad = 34;
  const tot = Math.max(cantL + sum(spans) + cantR, 1e-6);
  const k = (W - 2 * pad) / tot;
  const y0 = 52;
  const X = (m) => pad + (m + cantL) * k;
  let xs = [0];
  spans.forEach((l) => xs.push(xs[xs.length - 1] + l));
  let s = '';
  // viga
  s += `<line x1="${X(-cantL)}" y1="${y0}" x2="${X(xs[xs.length - 1] + cantR)}" y2="${y0}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>`;
  // voladizos (línea punteada por encima para distinguirlos)
  if (cantL > 0) s += `<text x="${(X(-cantL) + X(0)) / 2}" y="${y0 - 14}" text-anchor="middle" font-size="11" fill="var(--warn)">${fmt(cantL, 2)} ${unit}</text><line x1="${X(-cantL)}" y1="${y0 - 8}" x2="${X(0)}" y2="${y0 - 8}" stroke="var(--warn)" stroke-width="1.2"/>`;
  if (cantR > 0) s += `<text x="${(X(xs[xs.length - 1]) + X(xs[xs.length - 1] + cantR)) / 2}" y="${y0 - 14}" text-anchor="middle" font-size="11" fill="var(--warn)">${fmt(cantR, 2)} ${unit}</text><line x1="${X(xs[xs.length - 1])}" y1="${y0 - 8}" x2="${X(xs[xs.length - 1] + cantR)}" y2="${y0 - 8}" stroke="var(--warn)" stroke-width="1.2"/>`;
  // cotas de los tramos
  spans.forEach((l, i) => {
    const a = X(xs[i]);
    const b = X(xs[i + 1]);
    s += `<line x1="${a}" y1="${y0 - 22}" x2="${b}" y2="${y0 - 22}" stroke="var(--accent)" stroke-width="1.2"/><line x1="${a}" y1="${y0 - 26}" x2="${a}" y2="${y0 - 18}" stroke="var(--accent)"/><line x1="${b}" y1="${y0 - 26}" x2="${b}" y2="${y0 - 18}" stroke="var(--accent)"/>`;
    s += `<text x="${(a + b) / 2}" y="${y0 - 28}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">${fmt(l, 2)} ${unit}</text>`;
  });
  // apoyos
  xs.forEach((m, i) => {
    const x = X(m);
    s += fix[i] ? `<rect x="${x - 5}" y="${y0 + 1}" width="10" height="19" fill="var(--line)" stroke="var(--ink)" stroke-width="1.6"/>`
      : `<path d="M ${x} ${y0 + 3} l -9 15 h 18 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.6"/>`;
    s += `<circle cx="${x}" cy="${y0 + 32}" r="9" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="${x}" y="${y0 + 36}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)">${axisName(kind, i)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:640px; height:auto; display:block;" role="img" aria-label="Esquema de los tramos">${s}</svg>`;
}

// ---------------------------------------------------------------- dibujo en planta de la grilla de ejes
export function gridSketch({ xs, ys, cantXL = 0, cantXR = 0, cantYB = 0, cantYF = 0, xKind = 'num', yKind = 'letter' }) {
  const W = 560;
  const totX = sum(xs) + cantXL + cantXR;
  const totY = sum(ys) + cantYB + cantYF;
  const k = Math.min(430 / Math.max(totX, 1e-6), 230 / Math.max(totY, 1e-6));
  const ox = 70 + cantXL * k;
  const oy = 44 + cantYB * k;
  const H = oy + (sum(ys) + cantYF) * k + 28;
  const cx = [0]; xs.forEach((l) => cx.push(cx[cx.length - 1] + l));
  const cy = [0]; ys.forEach((l) => cy.push(cy[cy.length - 1] + l));
  const X = (m) => ox + m * k;
  const Y = (m) => oy + m * k;
  let s = `<rect x="${X(-cantXL)}" y="${Y(-cantYB)}" width="${totX * k}" height="${totY * k}" fill="var(--accent)" fill-opacity="0.06" stroke="var(--line)"/>`;
  s += `<rect x="${X(0)}" y="${Y(0)}" width="${sum(xs) * k}" height="${sum(ys) * k}" fill="none" stroke="var(--ink-soft)" stroke-width="1" stroke-dasharray="${cantXL + cantXR + cantYB + cantYF > 0 ? '4 3' : '0'}"/>`;
  cx.forEach((m) => { s += `<line x1="${X(m)}" y1="${Y(-cantYB)}" x2="${X(m)}" y2="${Y(cy[cy.length - 1] + cantYF)}" stroke="var(--ink-soft)" stroke-width="0.9" stroke-dasharray="2 3"/>`; });
  cy.forEach((m) => { s += `<line x1="${X(-cantXL)}" y1="${Y(m)}" x2="${X(cx[cx.length - 1] + cantXR)}" y2="${Y(m)}" stroke="var(--ink-soft)" stroke-width="0.9" stroke-dasharray="2 3"/>`; });
  cx.forEach((mx, i) => {
    s += `<circle cx="${X(mx)}" cy="${Y(-cantYB) - 18}" r="9" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="${X(mx)}" y="${Y(-cantYB) - 14}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)">${axisName(xKind, i)}</text>`;
    cy.forEach((my) => { s += `<rect x="${X(mx) - 4}" y="${Y(my) - 4}" width="8" height="8" fill="var(--ink)"/>`; });
  });
  cy.forEach((my, j) => {
    s += `<circle cx="${X(-cantXL) - 18}" cy="${Y(my)}" r="9" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="${X(-cantXL) - 18}" y="${Y(my) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)">${axisName(yKind, j)}</text>`;
  });
  xs.forEach((l, i) => { s += `<text x="${(X(cx[i]) + X(cx[i + 1])) / 2}" y="${Y(-cantYB) - 4}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--accent-ink)" paint-order="stroke" stroke="var(--panel)" stroke-width="3">${fmt(l, 2)}</text>`; });
  ys.forEach((l, j) => { s += `<text x="${X(-cantXL) - 4}" y="${(Y(cy[j]) + Y(cy[j + 1])) / 2 + 4}" text-anchor="end" font-size="11" font-weight="600" fill="var(--accent-ink)" paint-order="stroke" stroke="var(--panel)" stroke-width="3">${fmt(l, 2)}</text>`; });
  s += `<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--ink-soft)">Planta, medidas en m · cuadrados negros: columnas</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:640px; height:auto; display:block;" role="img" aria-label="Planta de la grilla de ejes">${s}</svg>`;
}

// ---------------------------------------------------------------- editor
// path: ruta de la lista de luces en el cálculo (p. ej. 'design.xSpans'); cant: { left: { path, value, label }, right: { path, value, label } } (opcional);
// kind: 'num' (ejes 1, 2, 3) o 'letter' (ejes A, B, C); sketch: false para no dibujar la línea (cuando la planta ya la muestra).
export function axisEditor({ path, spans, title, hint = '', kind = 'num', cant = null, sketch = true, unit = 'm' }) {
  const list = spans.map(Number);
  const cl = cant && cant.left ? n2(cant.left.value) : 0;
  const cr = cant && cant.right ? n2(cant.right.value) : 0;
  const nodes = [];
  const badge = (i) => `<span class="axed-axis" title="Eje ${axisName(kind, i)}">${axisName(kind, i)}</span>`;
  list.forEach((l, i) => {
    nodes.push(badge(i));
    nodes.push(`<span class="axed-cell"><span class="axed-span"><input type="number" min="0" step="any" inputmode="decimal" data-span="${i}" value="${l}" aria-label="Tramo ${i + 1}, entre los ejes ${axisName(kind, i)} y ${axisName(kind, i + 1)}, en metros" /><span class="axed-unit">${unit}</span></span>${list.length > 1 ? `<button type="button" class="axed-x" data-del-span="${i}" aria-label="Quitar el tramo ${i + 1}">quitar</button>` : ''}</span>`);
  });
  nodes.push(badge(list.length));
  const cantBox = (c) => `<label class="axed-cant"><span>${c.label || 'Voladizo'}</span><span class="axed-span axed-span-cant"><input type="number" min="0" step="any" inputmode="decimal" data-cant="${c.path}" value="${n2(c.value)}" aria-label="${c.label || 'Voladizo'} en metros" /><span class="axed-unit">${unit}</span></span></label>`;
  return `<div class="axed" data-axed data-path="${path}" data-kind="${kind}">
    <div class="axed-head"><b>${title}</b><span class="axed-total">Total ${fmt(sum(list) + cl + cr, 2)} ${unit} · ${list.length} tramo${list.length === 1 ? '' : 's'}</span></div>
    ${hint ? `<p class="text-muted axed-hint">${hint}</p>` : ''}
    <div class="axed-row">
      <div class="axed-chain">${nodes.join('')}</div>
    </div>
    <div class="axed-tools">
      <button type="button" class="btn btn-sm" data-add-span>+ Agregar tramo</button>
      <span class="axed-eq"><span class="text-muted">o repartir en</span>
        <input type="number" min="1" max="30" step="1" data-eq-n value="${list.length}" aria-label="Cantidad de tramos iguales" />
        <span class="text-muted">tramos de</span>
        <input type="number" min="0" step="any" data-eq-l value="${list[0] ?? ''}" aria-label="Luz de cada tramo igual, en metros" />
        <span class="text-muted">${unit}</span>
        <button type="button" class="btn btn-sm" data-eq-apply>Aplicar</button></span>
    </div>
    ${cant ? `<div class="axed-cants"><span class="text-muted">Voladizos más allá de los ejes extremos (0 = sin voladizo):</span>${cant.left ? cantBox(cant.left) : ''}${cant.right ? cantBox(cant.right) : ''}</div>` : ''}
    ${sketch ? `<div class="axed-sketch">${axisSketch({ spans: list, cantL: cl, cantR: cr, kind, unit })}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- eventos (se llama una vez por pantalla, después de dibujarla)
export function wireAxisEditors(root, calc) {
  root.querySelectorAll('[data-axed]').forEach((box) => {
    const path = box.dataset.path;
    const inputs = [...box.querySelectorAll('input[data-span]')];
    const values = () => inputs.map((el) => Number(String(el.value).replace(',', '.')));
    const commit = (arr, focusIdx) => {
      if (!arr.length || arr.some((v) => !Number.isFinite(v) || !(v > 0))) { showToast('Cada tramo tiene que tener una luz mayor que cero.'); return false; }
      setCalcField(calc.id, 'chosen', null);
      pendingFocus = focusIdx === null || focusIdx === undefined ? null : { path, idx: focusIdx };      // se aplica en el redibujado que provoca la línea siguiente
      setCalcField(calc.id, path, arr);
      return true;
    };
    inputs.forEach((el, i) => {
      el.addEventListener('focus', () => el.select());
      el.addEventListener('change', () => { const ok = commit(values(), pendingFocus && pendingFocus.path === path ? pendingFocus.idx : null); if (!ok) el.value = el.defaultValue; });
      el.addEventListener('keydown', (e) => {
        const tab = e.key === 'Tab' && !e.shiftKey && i < inputs.length - 1;
        if (e.key !== 'Enter' && !tab) return;
        e.preventDefault();
        const target = tab ? i + 1 : i;
        if (el.value !== el.defaultValue) { pendingFocus = { path, idx: target }; el.blur(); } else if (tab) inputs[target].focus();
      });
    });
    box.querySelectorAll('[data-del-span]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.delSpan);
      const arr = values();
      arr.splice(i, 1);
      commit(arr, Math.min(i, arr.length - 1));
    }));
    box.querySelector('[data-add-span]')?.addEventListener('click', () => {
      const arr = values();
      if (arr.length >= 30) { showToast('Hasta 30 tramos.'); return; }
      arr.push(arr[arr.length - 1] > 0 ? arr[arr.length - 1] : 5);
      commit(arr, arr.length - 1);
    });
    box.querySelector('[data-eq-apply]')?.addEventListener('click', () => {
      const n = Math.round(Number(box.querySelector('[data-eq-n]').value));
      const l = Number(String(box.querySelector('[data-eq-l]').value).replace(',', '.'));
      if (!(n >= 1 && n <= 30) || !(l > 0)) { showToast('Indicá cuántos tramos y la luz de cada uno.'); return; }
      commit(Array(n).fill(l), null);
    });
    box.querySelectorAll('input[data-cant]').forEach((el) => {
      el.addEventListener('focus', () => el.select());
      el.addEventListener('change', () => {
        const v = Number(String(el.value).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) { showToast('El voladizo no puede ser negativo.'); el.value = el.defaultValue; return; }
        setCalcField(calc.id, 'chosen', null);
        setCalcField(calc.id, el.dataset.cant, v);
      });
    });
    if (pendingFocus && pendingFocus.path === path) {
      const target = inputs[Math.max(0, Math.min(pendingFocus.idx, inputs.length - 1))];
      pendingFocus = null;
      target?.focus();
    }
  });
}

// ---------------------------------------------------------------- vista previa de la geometría con sus cotas (naves, cabriadas, cerchas)
const num = (v, def = 0) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);
const INK = 'var(--ink)';
const ACC = 'var(--accent)';
const ACCI = 'var(--accent-ink)';
// cota horizontal (x1 → x2 a la altura y) o vertical (x fijo, y1 → y2); el texto va al costado
function dimH(x1, x2, y, label) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ACC}" stroke-width="1.2"/><line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${ACC}"/><line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${ACC}"/><text x="${(x1 + x2) / 2}" y="${y + 15}" text-anchor="middle" font-size="12" font-weight="600" fill="${ACCI}">${label}</text>`;
}
function dimV(x, y1, y2, label, side = -1) {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${ACC}" stroke-width="1.2"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="${ACC}"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="${ACC}"/><text x="${x + side * 8}" y="${(y1 + y2) / 2 + 4}" text-anchor="${side < 0 ? 'end' : 'start'}" font-size="12" font-weight="600" fill="${ACCI}">${label}</text>`;
}
const tri = (x, y) => `<path d="M ${x} ${y} l -8 13 h 16 z" fill="var(--panel)" stroke="${INK}" stroke-width="1.5"/>`;
const bar = (x1, y1, x2, y2, w = 3) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// kind: 'portal' | 'cab' | 'arch' | 'gable' | 'parallel'; d: datos del diseño del cálculo
export function previewSketch(kind, d, extra = null) {
  const W = 560;
  const Hh = 230;
  let body = '';
  const A = num(kind === 'gable' || kind === 'parallel' ? d.L : d.A, 10);
  if (kind === 'portal' || kind === 'cab' || kind === 'arch') {
    const H = Number(d.H) >= 0 ? Number(d.H) : 4;
    const f = kind === 'portal' ? (A / 2) * Math.tan(num(d.theta, 10) * Math.PI / 180) : num(d.f, 2);
    const k = Math.min(380 / A, 135 / Math.max(H + f, 0.5));
    const ox = 90;
    const oy = 176;
    const X = (m) => ox + m * k;
    const Y = (m) => oy - m * k;
    if (kind === 'arch') {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const x = A * i / 40; pts.push(`${X(x)},${Y(H + 4 * f * x * (A - x) / (A * A))}`); }
      body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${INK}" stroke-width="3"/>`;
      if (H > 0) body += bar(X(0), Y(0), X(0), Y(H)) + bar(X(A), Y(0), X(A), Y(H));
    } else {
      body += bar(X(0), Y(0), X(0), Y(H)) + bar(X(A), Y(0), X(A), Y(H)) + bar(X(0), Y(H), X(A / 2), Y(H + f)) + bar(X(A / 2), Y(H + f), X(A), Y(H));
      if (kind === 'cab') body += bar(X(0), Y(H), X(A), Y(H), 1.6);
      if (kind === 'portal' && d.type === 'triarticulado') body += `<circle cx="${X(A / 2)}" cy="${Y(H + f)}" r="4.5" fill="var(--panel)" stroke="${INK}" stroke-width="1.5"/>`;
    }
    body += tri(X(0), Y(0)) + tri(X(A), Y(0));
    body += dimH(X(0), X(A), oy + 22, `A = ${fmt(A, 2)} m`);
    if (H > 0) body += dimV(X(0) - 18, Y(0), Y(H), `H = ${fmt(H, 2)} m`);
    body += `<line x1="${X(A / 2) + 14}" y1="${Y(H)}" x2="${X(A / 2) + 14}" y2="${Y(H + f)}" stroke="${ACC}" stroke-width="1.2"/><line x1="${X(A / 2) + 10}" y1="${Y(H)}" x2="${X(A / 2) + 18}" y2="${Y(H)}" stroke="${ACC}"/><line x1="${X(A / 2) + 10}" y1="${Y(H + f)}" x2="${X(A / 2) + 18}" y2="${Y(H + f)}" stroke="${ACC}"/><text x="${X(A / 2) + 24}" y="${Y(H + f) + 4}" font-size="12" font-weight="600" fill="${ACCI}">f = ${fmt(f, 2)} m</text>`;
    if (kind === 'portal') body += `<text x="${X(A * 0.1)}" y="${Y(H) + 22}" font-size="12" fill="${ACCI}">θ = ${fmt(num(d.theta, 10), 0)}°</text>`;
    body += `<text x="${W - 8}" y="16" text-anchor="end" font-size="11" fill="var(--ink-soft)">Elevación del pórtico · el largo B y la separación S no se ven (van en profundidad)</text>`;
  } else if (kind === 'gable') {
    const f = num(d.f, 2);
    const n = Math.max(2, Math.min(12, Math.round(num(d.n, 4))));
    const k = Math.min(400 / A, 130 / f);
    const ox = 80; const oy = 168;
    const X = (m) => ox + m * k; const Y = (m) => oy - m * k;
    const top = (x) => (x <= A / 2 ? f * x / (A / 2) : f * (A - x) / (A / 2));
    body += bar(X(0), Y(0), X(A), Y(0), 2.4) + bar(X(0), Y(0), X(A / 2), Y(f)) + bar(X(A / 2), Y(f), X(A), Y(0));
    for (let i = 1; i < 2 * n; i++) { const x = A * i / (2 * n); body += bar(X(x), Y(0), X(x), Y(top(x)), 1.1); }
    body += tri(X(0), Y(0)) + tri(X(A), Y(0)) + dimH(X(0), X(A), oy + 22, `Luz = ${fmt(A, 2)} m`) + dimV(X(A / 2) + 12, Y(0), Y(f), `f = ${fmt(f, 2)} m`, 1);
    body += `<text x="${W - 8}" y="16" text-anchor="end" font-size="11" fill="var(--ink-soft)">${2 * n} paneles (${n} por faldón)</text>`;
  } else if (kind === 'parallel') {
    const h = num(d.h, 1);
    const n = Math.max(2, Math.min(40, Math.round(num(d.n, 6))));
    const k = Math.min(420 / A, 120 / h);
    const ox = 70; const oy = 164;
    const X = (m) => ox + m * k; const Y = (m) => oy - m * k;
    body += bar(X(0), Y(0), X(A), Y(0), 2.6) + bar(X(0), Y(h), X(A), Y(h), 2.6) + bar(X(0), Y(0), X(0), Y(h), 1.4) + bar(X(A), Y(0), X(A), Y(h), 1.4);
    for (let i = 0; i < n; i++) { const x1 = A * i / n; const x2 = A * (i + 1) / n; body += bar(X(x1), Y(i % 2 ? h : 0), X(x2), Y(i % 2 ? 0 : h), 1.1); }
    body += tri(X(0), Y(0)) + tri(X(A), Y(0)) + dimH(X(0), X(A), oy + 22, `Luz = ${fmt(A, 2)} m`) + dimV(X(0) - 14, Y(0), Y(h), `h = ${fmt(h, 2)} m`);
  }
  else if (kind === 'custom') {
    const g = extra;
    if (!g || !g.nodes || !g.nodes.length) return '';
    const xs = g.nodes.map((n) => n.x); const ys = g.nodes.map((n) => n.y);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const k = Math.min(420 / Math.max(x1 - x0, 0.1), 150 / Math.max(y1 - y0, 0.1));
    const ox = 70; const oy = 175;
    const X = (m) => ox + (m - x0) * k; const Y = (m) => oy - (m - y0) * k;
    (g.bars || []).forEach((b) => { const p = g.nodes[b.a]; const q = g.nodes[b.b]; if (p && q) body += bar(X(p.x), Y(p.y), X(q.x), Y(q.y), 1.8); });
    g.nodes.forEach((n, i) => { body += `<circle cx="${X(n.x)}" cy="${Y(n.y)}" r="3.5" fill="var(--panel)" stroke="${INK}" stroke-width="1.2"/><text x="${X(n.x) + 5}" y="${Y(n.y) - 6}" font-size="10.5" font-weight="600" fill="${ACCI}">${i + 1}</text>`; });
    body += dimH(X(x0), X(x1), oy + 26, `${fmt(x1 - x0, 2)} m`);
    body += `<text x="${W / 2}" y="${Hh - 6}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">Los números son los nudos, como se usan en las listas de barras y cargas</text>`;
  } else if (kind === 'tie') {
    const T = Number(d.T) || 0;
    const L = num(d.L, 2);
    const x0 = 100; const x1 = 460; const y = 110;
    body += bar(x0, y, x1, y, 4);
    body += `<rect x="${x0 - 10}" y="${y - 16}" width="10" height="32" fill="var(--panel)" stroke="${INK}" stroke-width="1.6"/><rect x="${x1}" y="${y - 16}" width="10" height="32" fill="var(--panel)" stroke="${INK}" stroke-width="1.6"/>`;
    body += `<line x1="${x0 - 14}" y1="${y}" x2="${x0 - 62}" y2="${y}" stroke="var(--warn)" stroke-width="2.4"/><path d="M ${x0 - 14} ${y} l 10 -6 v 12 z" fill="var(--warn)" transform="rotate(180 ${x0 - 14} ${y})"/>`;
    body += `<line x1="${x1 + 14}" y1="${y}" x2="${x1 + 62}" y2="${y}" stroke="var(--warn)" stroke-width="2.4"/><path d="M ${x1 + 14} ${y} l 10 -6 v 12 z" fill="var(--warn)" transform="rotate(180 ${x1 + 14} ${y})"/>`;
    body += `<text x="${x0 - 38}" y="${y - 12}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--warn)">T</text><text x="${x1 + 38}" y="${y - 12}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--warn)">T</text>`;
    body += dimH(x0, x1, y + 44, `L = ${fmt(L, 2)} m`);
    body += `<text x="${(x0 + x1) / 2}" y="${y - 26}" text-anchor="middle" font-size="12" fill="${ACCI}">T = ${fmt(T, 0)} kg (tracción de servicio)</text>`;
  } else if (kind === 'purlin') {
    const L = num(d.L, 5);
    const al = num(d.alpha, 15);
    // vista lateral
    const x0 = 36; const x1 = 270; const y = 100;
    body += bar(x0, y, x1, y, 4) + tri(x0, y + 2) + tri(x1, y + 2) + dimH(x0, x1, y + 40, `L = ${fmt(L, 2)} m`);
    body += `<text x="${(x0 + x1) / 2}" y="${y - 34}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">Vista lateral: la correa apoya en las cabriadas</text>`;
    // corte
    const cx = 410; const cy = 150; const len = 120;
    const r = al * Math.PI / 180;
    const ex = cx + len * Math.cos(r); const ey = cy - len * Math.sin(r);
    body += bar(cx - len * Math.cos(r), cy + len * Math.sin(r), ex, ey, 3);
    body += `<rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" fill="var(--panel)" stroke="${INK}" stroke-width="1.8" transform="rotate(${-al} ${cx} ${cy})"/>`;
    body += `<line x1="${cx}" y1="${cy - 80}" x2="${cx}" y2="${cy - 14}" stroke="var(--warn)" stroke-width="2.2"/><path d="M ${cx} ${cy - 12} l -5 -10 h 10 z" fill="var(--warn)"/><text x="${cx + 8}" y="${cy - 62}" font-size="12" font-weight="600" fill="var(--warn)">carga vertical</text>`;
    body += `<line x1="${cx - len * Math.cos(r)}" y1="${cy + len * Math.sin(r)}" x2="${ex}" y2="${cy + len * Math.sin(r)}" stroke="${ACC}" stroke-dasharray="3 3"/><text x="${ex - 28}" y="${cy + len * Math.sin(r) - 4}" font-size="12" font-weight="600" fill="${ACCI}">α = ${fmt(al, 1)}°</text>`;
    body += `<text x="${cx}" y="${Hh - 6}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">Corte: cubierta inclinada, la correa flexiona en dos ejes</text>`;
  } else if (kind === 'column' || kind === 'lattice') {
    const H = num(d.H, 3);
    const sup = d.support || 'art-art';
    const baseFixed = sup !== 'art-art';
    const topFixed = sup === 'emp-emp';
    const topFree = sup === 'emp-libre';
    const yT = 40; const yB = 190; const xc = 230; const w = kind === 'lattice' ? 56 : (d.kind === 'battened' ? 44 : 0);
    const hatch = (x, y) => `<rect x="${x - 26}" y="${y}" width="52" height="9" fill="var(--line)" stroke="${INK}" stroke-width="1.4"/>`;
    if (kind === 'lattice') {
      body += bar(xc - w / 2, yT, xc - w / 2, yB, 3.2) + bar(xc + w / 2, yT, xc + w / 2, yB, 3.2);
      const n = 7;
      for (let i = 0; i < n; i++) { const ya = yT + (yB - yT) * i / n; const yb = yT + (yB - yT) * (i + 1) / n; body += bar(i % 2 ? xc + w / 2 : xc - w / 2, ya, i % 2 ? xc - w / 2 : xc + w / 2, yb, 1.3); }
      body += `<text x="${xc + w / 2 + 14}" y="${(yT + yB) / 2}" font-size="11.5" fill="var(--ink-soft)">${Number(d.kind) === 4 ? '4 cordones (se ve una cara)' : '2 cordones con diagonales'}</text>`;
    } else if (d.kind === 'battened') {
      body += bar(xc - w / 2, yT, xc - w / 2, yB, 3.2) + bar(xc + w / 2, yT, xc + w / 2, yB, 3.2);
      for (let i = 0; i <= 6; i++) { const y = yT + (yB - yT) * i / 6; body += bar(xc - w / 2, y, xc + w / 2, y, 2.2); }
      body += `<text x="${xc + w / 2 + 14}" y="${(yT + yB) / 2}" font-size="11.5" fill="var(--ink-soft)">dos perfiles con presillas</text>`;
    } else body += bar(xc, yT, xc, yB, 4.2);
    // base
    if (baseFixed) body += hatch(xc, yB + 2); else body += tri(xc, yB + 2);
    // cabeza
    if (topFixed) body += `<rect x="${xc - 26}" y="${yT - 11}" width="52" height="9" fill="var(--line)" stroke="${INK}" stroke-width="1.4"/>`;
    else if (!topFree) body += `<path d="M ${xc} ${yT - 2} l -8 -13 h 16 z" fill="var(--panel)" stroke="${INK}" stroke-width="1.5"/>`;
    body += `<line x1="${xc}" y1="${yT - 30}" x2="${xc}" y2="${yT - 16}" stroke="var(--warn)" stroke-width="2.2"/><path d="M ${xc} ${yT - 14} l -5 -9 h 10 z" fill="var(--warn)" transform="rotate(0)"/>`;
    body += `<text x="${xc + 12}" y="${yT - 22}" font-size="12" font-weight="600" fill="var(--warn)">N = ${fmt(Number(d.N) || 0, 0)} kg</text>`;
    body += dimV(xc - 90, yT, yB, `H = ${fmt(H, 2)} m`);
  }
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:560px; height:auto; display:block; margin:6px 0 12px;" role="img" aria-label="Esquema con las cotas">${body}</svg>`;
}
