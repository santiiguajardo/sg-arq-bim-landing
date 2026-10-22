// Piezas de interfaz compartidas por los módulos del calculador estructural.
import { escapeHtml, showToast } from '../utils.js';
import { logoUrl } from '../auth.js';
import { downloadMemoriaPdf } from '../api.js';
import { tidyHtml } from './svg-tidy.js';
import { convertHtmlUnits } from './structural-units.js';

export const fmt = (n, dec = 1) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function numField(path, label, value, { step = 'any', min = 0, hint = '', unit = '' } = {}) {
  return `<div class="field"><label>${label}${unit ? ` <span class="text-muted">(${unit})</span>` : ''}</label>
    <input type="number" step="${step}" min="${min}" data-f="${path}" data-num ${unit ? `data-unit="${unit}"` : ''} value="${value ?? ''}" />${hint ? `<span class="text-muted" style="font-size:11.5px;">${hint}</span>` : ''}</div>`;
}

export function selField(path, label, value, options, hint = '') {
  return `<div class="field"><label>${label}</label><select data-f="${path}">${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>${hint ? `<span class="text-muted" style="font-size:11.5px;">${hint}</span>` : ''}</div>`;
}

export function disclaimer() {
  return `<div class="note">
    Herramienta de predimensionado y verificación según <b>CIRSOC 201-2005</b> (hormigón) y <b>CIRSOC 101-2005</b> (cargas).
    Cada fórmula cita su artículo y se verificó contra el texto oficial del INTI-CIRSOC. Las estructuras de acero se calculan con el método elástico
    (tensiones admisibles) del material de la cátedra de Estructuras III. No reemplaza el cálculo, la verificación
    y la firma de un profesional matriculado: los resultados deben ser revisados antes de usarlos en obra.
  </div>`;
}

export function checksCard(res, title = 'Verificaciones') {
  const okTag = res.ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>';
  return `<div class="card vf-card ${res.ok ? 'vf-ok' : 'vf-bad'}"><h3 style="margin-top:0;">${title} ${okTag}</h3>
    ${res.checks.map((k) => `<div class="vf-row ${k.ok ? 'vf-ok' : 'vf-bad'}"><span class="vf-mark">${k.ok ? '✓' : '✗'}</span><span class="vf-label">${k.label}</span><span class="vf-text">${escapeHtml(k.text)}</span></div>`).join('')}
  </div>`;
}

export function failCard(reason) {
  return `<div class="card vf-card vf-bad"><span class="tag tag-alta">No verifica</span><p style="margin:10px 0 0; color:var(--bad); font-weight:600;">${escapeHtml(reason || 'No se encontró una solución.')}</p></div>`;
}

// Fila de una tabla de resultados: etiqueta (con la cita del artículo debajo) y valor.
export const memoRow = (a, b, art = '') => `<tr><td>${a}${art ? `<br><span class="mem-art">${art}</span>` : ''}</td><td style="text-align:right;">${b}</td></tr>`;

// ---------------------------------------------------------------- memoria de cálculo en hojas A4
// La memoria se arma en hojas de 210 × 297 mm (membrete con el logo negro, pie con número de página) y se imprime
// desde un iframe con esas mismas hojas: lo que se ve en pantalla es lo que sale en el PDF.
const MEM_FONT = 'system-ui, "Segoe UI", Arial, sans-serif';
const MEM_CSS = `
  .mem-sheet { width: 210mm; height: 296mm; background: #fff; color: #111; position: relative; box-sizing: border-box; overflow: hidden; font: 12px/1.45 ${MEM_FONT}; }
  .mem-sheet * { box-sizing: border-box; }
  .mem-head { position: absolute; left: 15mm; right: 15mm; top: 11mm; height: 15mm; display: flex; align-items: center; justify-content: space-between; gap: 8mm; border-bottom: 1px solid #111; padding-bottom: 2mm; }
  .mem-head img { max-height: 12mm; max-width: 55mm; object-fit: contain; display: block; }
  .mem-head .mem-ht { font-size: 10px; color: #555; text-align: right; line-height: 1.3; }
  .mem-body { position: absolute; left: 15mm; right: 15mm; top: 30mm; bottom: 20mm; overflow: hidden; }
  .mem-pgfoot { position: absolute; left: 15mm; right: 15mm; bottom: 8mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 8.5px; line-height: 1.35; color: #666; border-top: 1px solid #ccc; padding-top: 2mm; }
  .mem-pgfoot span:last-child { white-space: nowrap; }
  .mem-body h1 { font-size: 20px; margin: 0 0 4px; }
  .mem-body h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1.5px solid #111; text-transform: uppercase; letter-spacing: .04em; }
  .mem-body h2:first-child { margin-top: 0; }
  .mem-body table { width: 100%; border-collapse: collapse; }
  .mem-body td { padding: 4px 0; border-bottom: 1px solid #ddd; vertical-align: top; overflow-wrap: anywhere; }
  .mem-body td:first-child { width: 52%; padding-right: 12px; }
  .mem-body .mem-sub { color: #555; margin: 0 0 6px; }
  .mem-body .mem-art { color: #666; font-size: 10px; }
  .mem-body .mem-ok { color: #15803d; font-weight: 700; }
  .mem-body .mem-bad { color: #b91c1c; font-weight: 700; }
  .mem-body svg { max-width: 100%; height: auto; display: block; margin: 4px 0 8px; }
  .mem-body svg text { paint-order: stroke fill; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
  .mem-body svg text[fill="#fff"], .mem-body svg text[fill="white"] { stroke: none; }
  .mem-body .mem-foot { margin-top: 16px; font-size: 10.5px; color: #555; }
`;
const MEM_SHEET_CSS = `
  .mem-sheets { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 4px 0 30px; }
  .mem-sheets .mem-sheet { box-shadow: 0 1px 6px rgba(0,0,0,.25); flex: none; }
`;
const MEM_PRINT_CSS = `
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mem-sheet { break-after: page; page-break-after: always; }
  .mem-sheet:last-child { break-after: auto; page-break-after: auto; }
`;
const MEM_DISCLAIMER = 'Cálculo con CIRSOC 201-2005 y CIRSOC 101-2005. Herramienta de apoyo: debe ser revisada y firmada por un profesional matriculado antes de usarse en obra.';

function ensureMemStyles() {
  if (document.getElementById('memStyles')) return;
  const st = document.createElement('style');
  st.id = 'memStyles';
  st.textContent = MEM_CSS + MEM_SHEET_CSS;
  document.head.appendChild(st);
}

// Logo negro de la cuenta como data URL (para que viaje dentro de la hoja impresa). Sin logo cargado devuelve null.
async function loadLogoData(color = 'negro') {
  try {
    const res = await fetch(logoUrl(color), { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

// Reparte el contenido en hojas: cada bloque se agrega mientras entre; las tablas se cortan por fila y un título
// nunca queda solo al pie de una hoja.
function paginate(html, makeSheet) {
  const src = document.createElement('div');
  src.innerHTML = html;
  const units = [];
  [...src.children].forEach((el) => {
    if (el.tagName === 'TABLE') {
      const shell = el.cloneNode(false);
      el.querySelectorAll('tr').forEach((tr) => units.push({ kind: 'row', shell, node: tr.cloneNode(true) }));
    } else units.push({ kind: 'block', node: el.cloneNode(true), keep: el.tagName === 'H2' || el.tagName === 'H1' });
  });
  const pages = [];
  let page = null;
  let body = null;
  let table = null;
  const newPage = () => { page = makeSheet(); body = page.querySelector('.mem-body'); table = null; pages.push(page); };
  const overflows = () => body.scrollHeight > body.clientHeight + 1;
  const place = (u) => {            // devuelve los nodos agregados para poder deshacer
    if (u.kind === 'row') {
      let created = null;
      if (!table || table.__shell !== u.shell) {
        table = u.shell.cloneNode(false);
        table.__shell = u.shell;
        table.appendChild(document.createElement('tbody'));
        body.appendChild(table);
        created = table;
      }
      const row = u.node.cloneNode(true);
      table.firstChild.appendChild(row);
      return { row, created };
    }
    const n = u.node.cloneNode(true);
    body.appendChild(n);
    table = null;
    return { block: n };
  };
  const undo = (placed) => {
    if (placed.row) { placed.row.remove(); if (placed.created) { placed.created.remove(); table = null; } }
    if (placed.block) placed.block.remove();
  };
  newPage();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const group = u.keep && units[i + 1] ? [u, units[i + 1]] : [u];
    const placedAll = group.map((g) => place(g));
    if (overflows() && body.children.length > group.length) {
      placedAll.reverse().forEach(undo);
      newPage();
      group.forEach((g) => place(g));
    }
    if (group.length === 2) i += 1;
  }
  return pages;
}

const printDocument = (title, sheetsHtml) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${MEM_CSS}${MEM_PRINT_CSS}</style></head><body>${sheetsHtml}</body></html>`;

function printMemoria(title, sheetsHtml) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w) { frame.remove(); window.print(); return; }
  const oldTitle = document.title;
  const cleanup = () => { document.title = oldTitle; frame.remove(); };
  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${MEM_CSS}${MEM_PRINT_CSS}</style></head><body>${sheetsHtml}</body></html>`);
  w.document.close();
  w.addEventListener('afterprint', cleanup);
  document.title = title;     // el navegador propone este nombre al guardar el PDF
  setTimeout(() => {
    try { w.focus(); w.print(); } catch (e) { cleanup(); window.print(); return; }
    setTimeout(() => { if (frame.isConnected) cleanup(); }, 60000);   // por si el navegador no avisa al terminar
  }, 250);
}

// Memoria de cálculo a pantalla completa, en hojas A4, imprimible.
export async function openMemoriaDoc({ title, sub, html, disclaimer = MEM_DISCLAIMER, towerUnits = false }) {
  ensureMemStyles();
  const overlay = document.createElement('div');
  overlay.className = 'memoria-overlay';
  overlay.innerHTML = `
    <div class="memoria-bar">
      <strong>Memoria de cálculo</strong>
      <span style="display:flex; align-items:center; gap:12px;"><span class="text-muted" style="font-size:12px;">Esc para cerrar</span><button class="btn btn-primary" data-print disabled>Descargar PDF</button></span>
    </div>
    <div class="mem-sheets"><p class="text-muted">Preparando las hojas…</p></div>`;
  document.body.appendChild(overlay);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
  document.addEventListener('keydown', onKey);
  const logo = await loadLogoData('negro');
  if (!overlay.isConnected) return;
  const holder = overlay.querySelector('.mem-sheets');
  const date = new Date().toLocaleDateString('es-AR');
  const headText = `<div class="mem-ht"><b>Memoria de cálculo</b><br>${escapeHtml(title)}</div>`;
  const makeSheet = () => {
    const s = document.createElement('section');
    s.className = 'mem-sheet';
    s.innerHTML = `<div class="mem-head">${logo ? `<img src="${logo}" alt="Logo" />` : '<span></span>'}${headText}</div><div class="mem-body"></div><div class="mem-pgfoot"><span>${escapeHtml(disclaimer)}</span><span class="mem-pg"></span></div>`;
    holder.appendChild(s);          // tiene que estar en el documento para medir
    return s;
  };
  holder.innerHTML = '';
  // verde para lo que verifica y rojo para lo que no (los renglones de verificación empiezan con ✓ o ✗; el resultado final dice "verifica" o "no verifica")
  const tinted = String(html)
    .replace(/<td>✓ /g, '<td class="mem-ok">✓ ').replace(/<td>✗ /g, '<td class="mem-bad">✗ ')
    .replace(/(<td[^>]*)>verifica<\/td>/g, '$1 class="mem-ok">✓ verifica</td>').replace(/(<td[^>]*)>no verifica<\/td>/g, '$1 class="mem-bad">✗ no verifica</td>');
  const content = `<h1>${escapeHtml(title)}</h1><p class="mem-sub">${escapeHtml(sub)} · ${date}</p>${tidyHtml(convertHtmlUnits(tinted, { tower: towerUnits }))}`;
  const pages = paginate(content, makeSheet);
  pages.forEach((p, i) => { p.querySelector('.mem-pg').textContent = `Página ${i + 1} de ${pages.length}`; });
  // en pantallas angostas se achican las hojas para que entre el ancho completo
  const fit = () => { const k = Math.min(1, (overlay.clientWidth - 24) / 794); holder.style.zoom = k < 1 ? String(k) : ''; };
  fit();
  window.addEventListener('resize', fit);
  const btn = overlay.querySelector('[data-print]');
  btn.disabled = false;
  btn.addEventListener('click', async () => {
    const sheets = [...holder.querySelectorAll('.mem-sheet')].map((x) => x.outerHTML).join('');
    btn.disabled = true;
    btn.textContent = 'Generando PDF…';
    try {
      await downloadMemoriaPdf({ html: printDocument(title, sheets), title });
      showToast('PDF descargado');
      close();
    } catch (e) {
      // sin servidor de PDF (falta Playwright o el servidor no se reinició): se abre la impresión del navegador
      showToast(e && e.code === 'print' ? 'Elegí "Guardar como PDF" como destino en la ventana de impresión.' : `${e.message}. Se abre la impresión para guardarlo como PDF.`);
      btn.disabled = false;
      btn.textContent = 'Descargar PDF';
      printMemoria(title, sheets);
    }
  });
}
