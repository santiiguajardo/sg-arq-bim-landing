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

export const PREDIM_AVISO = 'Predimensionado aproximado: este cálculo es una estimación orientativa y no tiene validez como cálculo estructural validado ni firmado. No reemplaza el proyecto, la verificación ni la firma de un profesional matriculado.';

export function disclaimer() {
  return `<div class="note">
    <b>Predimensionado aproximado.</b> Los resultados son una estimación orientativa, según el método elástico para el acero, CIRSOC 201-2005 (hormigón) y CIRSOC 101-2005 (cargas).
    <b>No valen como archivo de cálculo estructural validado ni firmado</b>: no reemplazan el proyecto, la verificación y la firma de un profesional matriculado.
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
const MEM_FONT = "'Archivo', 'Helvetica Neue', Arial, sans-serif";
const MEM_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;1,300&display=swap';
// Hojas A4 con la marca (igual que los presupuestos): banda grafito con el isotipo blanco, linea azul, titulos con barrita azul.
const MEM_CSS = `
  .mem-sheet { width: 210mm; height: 296mm; background: #fff; color: #14161c; position: relative; box-sizing: border-box; overflow: hidden; font: 11.5px/1.45 ${MEM_FONT}; }
  .mem-sheet * { box-sizing: border-box; }
  .mem-band { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding: 0 15mm; background: #14161c; color: #fff; border-bottom: 1.1mm solid #2f6fed; }
  .mem-sheet.first .mem-band { height: 31mm; }
  .mem-sheet:not(.first) .mem-band { height: 15mm; }
  .mem-brand { display: flex; align-items: center; gap: 3.5mm; min-width: 0; }
  .mem-brand img { display: block; width: auto; object-fit: contain; }
  .mem-sheet.first .mem-brand img { height: 15mm; max-width: 40mm; }
  .mem-sheet:not(.first) .mem-brand img { height: 8mm; max-width: 24mm; }
  .mem-brand img.mem-chip { background: #fff; border-radius: 1.2mm; padding: 1mm 1.6mm; }
  .mem-name b { display: block; font-size: 13.5px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; text-transform: uppercase; }
  .mem-name span { display: block; margin-top: 1px; font-size: 9px; color: #9aa0ac; }
  .mem-sheet:not(.first) .mem-name b { font-size: 10.5px; }
  .mem-sheet:not(.first) .mem-name span { display: none; }
  .mem-doc { text-align: right; min-width: 0; }
  .mem-doc b { display: block; font-size: 23px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
  .mem-doc i { display: block; margin-top: 1.5mm; font-size: 10.5px; font-weight: 300; font-style: italic; color: #7fa8ff; max-width: 95mm; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mem-sheet:not(.first) .mem-doc b { font-size: 11px; font-weight: 700; letter-spacing: 0; }
  .mem-sheet:not(.first) .mem-doc i { display: none; }
  .mem-body { position: absolute; left: 15mm; right: 15mm; bottom: 19mm; overflow: hidden; }
  .mem-sheet.first .mem-body { top: 38mm; }
  .mem-sheet:not(.first) .mem-body { top: 22mm; }
  .mem-pgfoot { position: absolute; left: 15mm; right: 15mm; bottom: 8mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 8.3px; line-height: 1.35; color: #6b7080; border-top: 1px solid #d9dce3; padding-top: 2mm; }
  .mem-pgfoot span:last-child { white-space: nowrap; }
  .mem-pgfoot b { color: #14161c; font-weight: 700; }
  .mem-body h1 { font-size: 19px; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 3px; }
  .mem-body h2 { position: relative; font-size: 12.5px; font-weight: 800; letter-spacing: -0.01em; margin: 17px 0 6px; padding: 3.4mm 0 3px; border: 0; border-bottom: 1px solid #14161c; }
  .mem-body h2::before { content: ''; position: absolute; left: 0; top: 0; width: 7mm; height: 1mm; background: #2f6fed; }
  .mem-body h2:first-child { margin-top: 0; }
  .mem-body table { width: 100%; border-collapse: collapse; }
  .mem-body th { text-align: left; padding: 3px 0 4px; border-bottom: 1px solid #14161c; font-size: 8.3px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #6b7080; }
  .mem-body td { padding: 4px 0; border-bottom: 1px solid #e4e6eb; vertical-align: top; overflow-wrap: anywhere; }
  .mem-body td:first-child { width: 52%; padding-right: 12px; }
  .mem-body table.mem-cols td:first-child { width: auto; }
  .mem-body table.mem-cols td, .mem-body table.mem-cols th { padding-right: 6px; }
  .mem-body table.mem-cols td.n, .mem-body table.mem-cols th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mem-body tr.mem-total td { border-top: 1px solid #14161c; border-bottom: 0; font-weight: 800; }
  .mem-body tr.mem-total td.n:last-child { color: #2f6fed; }
  .mem-body .mem-sub { color: #6b7080; margin: 0 0 6px; font-size: 10.5px; letter-spacing: .02em; }
  .mem-body .mem-art { color: #6b7080; font-size: 9.5px; }
  .mem-body .mem-ok { color: #15803d; font-weight: 700; }
  .mem-body .mem-bad { color: #b91c1c; font-weight: 700; }
  .mem-body svg { max-width: 100%; height: auto; display: block; margin: 4px 0 8px; }
  .mem-body svg text { paint-order: stroke fill; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
  .mem-body svg text[fill="#fff"], .mem-body svg text[fill="white"] { stroke: none; }
  .mem-body .mem-foot { margin-top: 16px; font-size: 10px; color: #6b7080; }
  .mem-body .mem-aviso { margin: 8px 0 14px; padding: 3mm 4mm; background: #fff8ea; border: 1px solid #e0a03a; border-left: 2.2mm solid #e0a03a; border-radius: 1.2mm; font-size: 10.5px; line-height: 1.45; color: #4a3a12; }
  .mem-body .mem-foot { color: #4b5060; }
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


function ensureMemStyles() {
  if (document.getElementById('memStyles')) return;
  if (!document.getElementById('memFonts')) {
    const lk = document.createElement('link');
    lk.id = 'memFonts'; lk.rel = 'stylesheet'; lk.href = MEM_FONTS_HREF;
    document.head.appendChild(lk);
  }
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

const printDocument = (title, sheetsHtml) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${MEM_FONTS_HREF}"><style>${MEM_CSS}${MEM_PRINT_CSS}</style></head><body>${sheetsHtml}</body></html>`;

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
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${MEM_FONTS_HREF}"><style>${MEM_CSS}${MEM_PRINT_CSS}</style></head><body>${sheetsHtml}</body></html>`);
  w.document.close();
  w.addEventListener('afterprint', cleanup);
  document.title = title;     // el navegador propone este nombre al guardar el PDF
  setTimeout(() => {
    try { w.focus(); w.print(); } catch (e) { cleanup(); window.print(); return; }
    setTimeout(() => { if (frame.isConnected) cleanup(); }, 60000);   // por si el navegador no avisa al terminar
  }, 250);
}

// Memoria de cálculo a pantalla completa, en hojas A4, imprimible.
export async function openMemoriaDoc({ title, sub, html, disclaimer: scopeNote = null, towerUnits = false, extraHtml = '' }) {
  const disclaimer = PREDIM_AVISO;
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
  // Logo blanco sobre la banda grafito; si la cuenta solo tiene el negro, va dentro de una pastilla blanca.
  let logo = await loadLogoData('blanco');
  let chip = false;
  if (!logo) { logo = await loadLogoData('negro'); chip = Boolean(logo); }
  if (!overlay.isConnected) return;
  const holder = overlay.querySelector('.mem-sheets');
  const date = new Date().toLocaleDateString('es-AR');
  const brandName = (document.querySelector('.brand-text strong, .brand-name')?.textContent || 'SG ARQ BIM').trim();
  const brandSub = (document.querySelector('.brand-text span')?.textContent || 'Estructuras · memoria de cálculo').trim();
  const makeSheet = () => {
    const s = document.createElement('section');
    const first = holder.children.length === 0;
    s.className = first ? 'mem-sheet first' : 'mem-sheet';
    s.innerHTML = `<div class="mem-band"><div class="mem-brand">${logo ? `<img src="${logo}" alt="" class="${chip ? 'mem-chip' : ''}" />` : ''}<div class="mem-name"><b>${escapeHtml(brandName)}</b><span>${escapeHtml(brandSub)}</span></div></div>
      <div class="mem-doc"><b>${first ? 'Memoria de cálculo' : escapeHtml(title)}</b><i>${escapeHtml(title)}</i></div></div>
      <div class="mem-body"></div><div class="mem-pgfoot"><span>${escapeHtml(disclaimer)}</span><span class="mem-pg"></span></div>`;
    holder.appendChild(s);          // tiene que estar en el documento para medir
    return s;
  };
  holder.innerHTML = '';
  // verde para lo que verifica y rojo para lo que no (los renglones de verificación empiezan con ✓ o ✗; el resultado final dice "verifica" o "no verifica")
  const tinted = String(html)
    .replace(/<td>✓ /g, '<td class="mem-ok">✓ ').replace(/<td>✗ /g, '<td class="mem-bad">✗ ')
    .replace(/(<td[^>]*)>verifica<\/td>/g, '$1 class="mem-ok">✓ verifica</td>').replace(/(<td[^>]*)>no verifica<\/td>/g, '$1 class="mem-bad">✗ no verifica</td>');
  const aviso = `<div class="mem-aviso"><b>Predimensionado aproximado.</b> Esta memoria es una estimación orientativa: <b>no tiene validez como cálculo estructural validado ni firmado</b> y no puede presentarse como tal. No reemplaza el proyecto, la verificación ni la firma de un profesional matriculado.</div>`;
  const scope = scopeNote ? `<h2>Alcance y limitaciones</h2><p class="mem-foot">${escapeHtml(scopeNote)}</p>` : '';
  const content = `<h1>${escapeHtml(title)}</h1><p class="mem-sub">${escapeHtml(sub)} · ${date}</p>${aviso}${tidyHtml(convertHtmlUnits(tinted + extraHtml, { tower: towerUnits }))}${scope}`;
  const pages = paginate(content, makeSheet);
  pages.forEach((p, i) => { p.querySelector('.mem-pg').innerHTML = `<b>${escapeHtml(brandName)}</b> · Página ${i + 1} de ${pages.length}`; });
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
