// Unidad de fuerza de los resultados del calculador estructural: kN, kg (kilogramo-fuerza) o t (tonelada-fuerza).
// Cada módulo escribe sus números en su unidad de siempre (el hormigón en kN, el acero en kg); acá se convierten al mostrarlos, sin tocar
// lo que está guardado: los textos "número + unidad" (esquemas, tablas, verificaciones), las tablas que traen la unidad en el encabezado
// ("Mu (kN·m)") y los campos numéricos de carga (se muestran convertidos y se guardan en la unidad original).
// Las tensiones (kg/cm², MPa) y las cantidades de material (kg de acero o de hierro) no se convierten.
// La torre calcula en toneladas (t, tm, t/m, t/m²): con `{ tower: true }` esas unidades también se convierten.

const KEY = 'sgForceUnit';
const G = 9.80665;                                  // 1 kgf = 9.80665 N
export const FORCE_UNITS = [['kN', 'kN', 'kilonewton (SI)'], ['kg', 'kg', 'kilogramo-fuerza'], ['t', 't', 'tonelada-fuerza (1000 kg)']];
const TO_KN = { kN: 1, kg: G / 1000, t: G };         // cuánto valen en kN una unidad de cada una

export function getForceUnit() {
  try { const u = localStorage.getItem(KEY); return TO_KN[u] ? u : 'kN'; } catch (e) { return 'kN'; }
}
export function setForceUnit(u) {
  try { localStorage.setItem(KEY, TO_KN[u] ? u : 'kN'); } catch (e) { /* sin almacenamiento: queda la de siempre */ }
}

const SUF = '(?:·m/m|·m|/m²|/m)?';
const NUM = '[−-]?(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?)';
let TOWER = false;                                  // la torre trae sus números en toneladas: se activa mientras se convierte su pantalla
const T_UNITS = 'tm|t/m²|t/m|t';
const unitAlt = () => `kN${SUF}|kg${SUF}${TOWER ? `|${T_UNITS}` : ''}`;
const textRe = () => new RegExp(`(${NUM})(\\s*)(${unitAlt()})(?![\\w²³·/áéíóúñÁÉÍÓÚÑ])`, 'g');
const MASS_RE = /hierro|acero|\bFe\b|cómputo|computo|kg\/m² construid|bulon|bulón|tornill/i;       // cantidades de material: no son fuerzas

const famOf = (unit) => (unit.startsWith('kN') ? 'kN' : unit.startsWith('kg') ? 'kg' : 't');
const sufOf = (unit) => (/^(kN|kg)/.test(unit) ? unit.replace(/^(kN|kg)/, '') : unit.slice(1).replace(/^m$/, '·m'));
const fmtNum = (v, dec) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function parseEs(str) { return Number(str.replace('−', '-').replace(/\./g, '').replace(',', '.')); }

// convierte el texto de un número (formato es-AR) de la familia fam a la unidad elegida, cuidando las cifras significativas
function convertText(numStr, fam, target) {
  const v = parseEs(numStr);
  if (!Number.isFinite(v)) return numStr;
  const out = v * TO_KN[fam] / TO_KN[target];
  if (out === 0) return numStr;
  const sig0 = numStr.replace(/[−-]/, '').replace(/[.,]/g, '').replace(/^0+/, '').length || 1;
  const sig = Math.min(4, Math.max(3, sig0));
  const dec = Math.min(3, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(out)))));
  return fmtNum(out, dec);
}

const convertUnit = (unit, target) => `${target}${sufOf(unit)}`;

function convertString(text, target, skipMass) {
  return text.replace(textRe(), (m, num, sp, unit) => {
    const fam = famOf(unit);
    if (fam === target) return m;
    if (fam === 'kg' && skipMass) return m;
    return `${convertText(num, fam, target)}${sp}${convertUnit(unit, target)}`;
  });
}

const isMassBlock = (node) => {
  const el = node.nodeType === 1 ? node : node.parentElement;
  const blk = el && el.closest ? el.closest('tr, li, p, .vf-row, .card h3') : null;
  return Boolean(blk && MASS_RE.test(blk.textContent));
};

// ---------------------------------------------------------------- tablas con la unidad en el encabezado
const headRe = () => new RegExp(`\\((kN(?:·m/m|·m|/m²|/m)?|kg(?:·m|/m²|/m)?${TOWER ? '|tm|t/m²|t/m|t' : ''})\\)`);
const ONLY_NUM = /^[\s\d.,·/−\-–+]*\d[\s\d.,·/−\-–+]*$/;

function convertTables(root, target) {
  root.querySelectorAll('table').forEach((tb) => {
    const rows = [...tb.rows];
    if (!rows.length) return;
    // grilla de celdas con rowspan y colspan resueltos
    const grid = rows.map(() => []);
    rows.forEach((tr, r) => {
      let c = 0;
      [...tr.cells].forEach((cell) => {
        while (grid[r][c]) c += 1;
        const rs = Math.max(1, Number(cell.getAttribute('rowspan')) || 1);
        const cs = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { if (grid[r + i]) grid[r + i][c + j] = i === 0 && j === 0 ? cell : { ghost: true }; }
        c += cs;
      });
    });
    const headRow = rows.findIndex((tr) => [...tr.cells].every((x) => x.tagName === 'TH') && tr.cells.length > 1);
    if (headRow < 0) return;
    const cols = {};
    grid[headRow].forEach((cell, ci) => {
      if (!cell || cell.ghost) return;
      const m = headRe().exec(cell.textContent);
      if (!m || MASS_RE.test(cell.textContent)) return;
      const fam = famOf(m[1]);
      if (fam === target) return;
      cols[ci] = { fam, unit: m[1] };
    });
    Object.entries(cols).forEach(([ci, { fam, unit }]) => {
      const head = grid[headRow][ci];
      const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) n.nodeValue = n.nodeValue.replace(headRe(), `(${convertUnit(unit, target)})`);
      for (let r = headRow + 1; r < rows.length; r++) {
        const cell = grid[r][ci];
        if (!cell || cell.ghost || !cell.textContent.trim() || cell.tagName === 'TH') continue;
        if (!ONLY_NUM.test(cell.textContent)) continue;
        const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = tw.nextNode())) t.nodeValue = t.nodeValue.replace(new RegExp(NUM, 'g'), (num) => convertText(num, fam, target));
      }
    });
  });
}

// ---------------------------------------------------------------- campos numéricos con unidad
const inputUnit = () => (TOWER ? /^(kN|kg|t)(\/m²|\/m|·m)?$/ : /^(kN|kg)(\/m²|\/m|·m)?$/);

function convertInputs(root, target) {
  root.querySelectorAll('input[data-unit]').forEach((el) => {
    const unit = el.dataset.unit;
    const m = inputUnit().exec(unit);
    if (!m || famOf(unit) === target) return;
    const k = TO_KN[famOf(unit)] / TO_KN[target];                  // valor mostrado = valor guardado × k
    const v = Number(el.value);
    if (el.value !== '' && Number.isFinite(v)) el.value = String(Number((v * k).toPrecision(5)));
    el.dataset.fk = String(k);
    const lab = el.closest('.field') && el.closest('.field').querySelector('label span');
    if (lab) lab.textContent = lab.textContent.replace(unit, convertUnit(unit, target));
  });
}

// ---------------------------------------------------------------- aplicar
function convertMarked(root, target) {
  root.querySelectorAll('[data-fu]').forEach((el) => {
    const unit = el.dataset.fu;
    const fam = famOf(unit);
    if (fam === target) return;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = tw.nextNode())) t.nodeValue = t.nodeValue.replace(new RegExp(NUM, 'g'), (num) => convertText(num, fam, target));
    el.removeAttribute('data-fu');
  });
}

function convertTexts(root, target) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement ? n.parentElement.tagName : '') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach((t) => {
    const v = t.nodeValue;
    if (!(TOWER ? /k[Ng]|t/ : /k[Ng]/).test(v)) return;
    // número en un elemento y unidad en el texto que sigue: <b>12,5</b> kN/m
    const lead = new RegExp(`^(\\s*)(kN(?:·m/m|·m|/m²|/m)?|kg(?:·m|/m²|/m)?${TOWER ? '|tm|t/m²|t/m|t' : ''})(?![\\w²³·/áéíóúñÁÉÍÓÚÑ])`).exec(v);
    const prev = t.previousSibling;
    if (lead && prev && prev.nodeType === 1 && /^[\s]*[−-]?[\d.,]+[\s]*$/.test(prev.textContent)) {
      const fam = famOf(lead[2]);
      if (fam !== target && !(fam === 'kg' && isMassBlock(t))) {
        const pt = prev.firstChild && prev.firstChild.nodeType === 3 ? prev.firstChild : null;
        if (pt) { pt.nodeValue = pt.nodeValue.replace(new RegExp(NUM), (num) => convertText(num, fam, target)); t.nodeValue = v.replace(lead[2], convertUnit(lead[2], target)); return; }
      }
    }
    let out = convertString(v, target, isMassBlock(t));
    // unidad sola entre paréntesis, p. ej. el título de un diagrama: "Corte (kN)"
    out = out.replace(new RegExp(`\\((kN(?:·m/m|·m|/m²|/m)?|kg(?:·m|/m²|/m)?${TOWER ? '|tm|t/m²|t/m|t' : ''})(?=[,)])`, 'g'), (m, u) => (famOf(u) === target || (famOf(u) === 'kg' && isMassBlock(t)) ? m : `(${convertUnit(u, target)}`));
    if (out !== v) t.nodeValue = out;
  });
}

export function applyForceUnits(root, { tower = false } = {}) {
  const target = getForceUnit();
  TOWER = tower;
  try {
    convertTables(root, target);
    convertMarked(root, target);
    convertTexts(root, target);
    convertInputs(root, target);
  } finally { TOWER = false; }
}

// para la memoria de cálculo, que se arma como texto HTML
export function convertHtmlUnits(html, opts) {
  const host = document.createElement('div');
  host.innerHTML = html;
  applyForceUnits(host, opts);
  return host.innerHTML;
}

// ---------------------------------------------------------------- botón para elegir la unidad
export function unitToggleHtml() {
  const cur = getForceUnit();
  return `<div class="unit-seg" role="group" aria-label="Unidad de fuerza" title="Unidad de fuerza en los resultados y en las cargas">
    <span class="text-muted" style="font-size:12px;">Fuerzas en</span>
    ${FORCE_UNITS.map(([k, l, t]) => `<button type="button" data-funit="${k}" class="${cur === k ? 'on' : ''}" title="${t}" aria-pressed="${cur === k ? 'true' : 'false'}">${l}</button>`).join('')}
  </div>
  <style>
    .unit-seg { display:inline-flex; align-items:center; gap:6px; }
    .unit-seg button { min-width:38px; padding:6px 10px; border:1px solid var(--line); border-radius:8px; background:transparent; color:inherit; font:inherit; font-size:12.5px; cursor:pointer; }
    .unit-seg button.on { background:var(--accent, #2f6fed); border-color:transparent; color:#fff; font-weight:700; }
  </style>`;
}

export function wireUnitToggle(root, rerender) {
  root.querySelectorAll('[data-funit]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.funit === getForceUnit()) return;
    setForceUnit(b.dataset.funit);
    rerender();
  }));
}
