// Grandes luces: estereoestructura plana (retícula espacial de caños). Motor en js/structural/spaceframe.js.
// FUENTE: guía 5 "Estereoestructuras" del Taller de Estructuras E4 (curso 2024).
import * as P from '../structural/spaceframe.js';
import * as W from '../structural/wind.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';
import { axisEditor, gridSketch } from './structural-spans.js';

const kg = (v) => fmt(v, 0);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const nums = (a) => (Array.isArray(a) ? a.map(Number) : []);
export const SPACE_NOTE = 'Predimensionado según la guía 5 "Estereoestructuras" del Taller de Estructuras E4 (2024): la retícula se asimila a una placa isótropa apoyada sobre vigas y columnas o sobre columnas, con franjas continuas (coeficientes de la Tabla 1, hasta 4 tramos), barras superiores e inferiores con C = T = M / H, diagonales con Q Ld / (4 H), pandeo con las tablas ω de la cátedra y caños de la Tabla G (DIN 2448). El caño se elige como el más liviano que verifica (esbeltez máxima 150 en las barras comprimidas), por lo que puede salir menor que el que adopta la guía. No se verifican los nudos, el pandeo de conjunto ni el montaje. Herramienta de apoyo para el predimensionado.';

const defaults = () => ({ kind: 'space', hyp: 'beams', xSpans: [25, 25], xCantL: 5, xCantR: 2.5, ySpans: [20, 20], yCantL: 2.5, yCantR: 2.5, Lm: 2.5, H: 0, pp: 20, sc: 30, windManual: 0, V: 45, exposure: 'B', zWind: 7.5, Kzt: 1, Kd: 0.85, I: 1, G: 0.85,
  sigma: 1400, E: 2100000, omegaTable: 'F-22', flechaRatio: 500, lambdaMax: 150, qc: 0.375, colH: 3.5, colSame: 'yes', soilSigma: 2.5, plateC: 20, baseThick: 20, anchored: 'no' });

function compute(calc) {
  const d = calc.design;
  const p = { ...d, xSpans: nums(d.xSpans), ySpans: nums(d.ySpans), Lm: num(d.Lm), H: num(d.H), colSame: d.colSame !== 'no', anchored: d.anchored === 'yes' };
  if (!p.xSpans.length || !p.ySpans.length || [...p.xSpans, ...p.ySpans].some((v) => !(v > 0))) return { error: 'Cargá las luces entre columnas en las dos direcciones con valores mayores que cero.' };
  if (!(p.Lm > 0)) return { error: 'Completá la longitud del módulo Lm.' };
  if (!(num(d.pp) >= 0) || !(num(d.V) > 0)) return { error: 'Completá el peso propio y la velocidad básica del viento.' };
  const res = P.designSpaceFrame(p);
  if (res.error) return { error: res.error };
  return { kind: 'space', input: p, res };
}

// ---------------------------------------------------------------- figuras
function moduleFigure(r, d) {
  const Lm = num(d.Lm, 2.5); const H = r ? r.H : Lm / Math.SQRT2;
  const W_ = 560; const n = 4;
  const k = Math.min(420 / (n * Lm), 90 / Math.max(H, 0.3));
  const x0 = 60; const y0 = 44;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  let s = '';
  for (let i = 0; i <= n; i++) s += `<circle cx="${X(i * Lm)}" cy="${Y(0)}" r="3.4" fill="var(--ink)"/>`;
  for (let i = 0; i < n; i++) s += `<circle cx="${X((i + 0.5) * Lm)}" cy="${Y(H)}" r="3.4" fill="var(--ink)"/>`;
  s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(n * Lm)}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="3"/><line x1="${X(0.5 * Lm)}" y1="${Y(H)}" x2="${X((n - 0.5) * Lm)}" y2="${Y(H)}" stroke="var(--ink)" stroke-width="3"/>`;
  for (let i = 0; i < n; i++) s += `<line x1="${X(i * Lm)}" y1="${Y(0)}" x2="${X((i + 0.5) * Lm)}" y2="${Y(H)}" stroke="var(--accent)" stroke-width="1.6"/><line x1="${X((i + 0.5) * Lm)}" y1="${Y(H)}" x2="${X((i + 1) * Lm)}" y2="${Y(0)}" stroke="var(--accent)" stroke-width="1.6"/>`;
  const xr = X(n * Lm) + 16;
  s += `<line x1="${xr}" y1="${Y(0)}" x2="${xr}" y2="${Y(H)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(0)}" x2="${xr + 4}" y2="${Y(0)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(H)}" x2="${xr + 4}" y2="${Y(H)}" stroke="var(--accent)"/><text x="${xr + 8}" y="${(Y(0) + Y(H)) / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">H = ${fmt(H, 2)} m</text>`;
  s += `<line x1="${X(0)}" y1="${Y(0) - 14}" x2="${X(Lm)}" y2="${Y(0) - 14}" stroke="var(--accent)"/><text x="${X(Lm / 2)}" y="${Y(0) - 20}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">Lm = ${fmt(Lm, 2)} m</text>`;
  s += `<text x="${X(n * Lm / 2)}" y="${Y(H) + 26}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">corte de la retícula: malla superior en negro, diagonales en color${r ? ` (Ld = ${fmt(r.Ld, 2)} m)` : ''}</text>`;
  return `<svg viewBox="0 0 ${W_} ${Math.round(Y(H) + 42)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Módulo de la estereoestructura">${s}</svg>`;
}

const planFigure = (d) => gridSketch({ xs: nums(d.xSpans), ys: nums(d.ySpans), cantXL: num(d.xCantL), cantXR: num(d.xCantR), cantYB: num(d.yCantL), cantYF: num(d.yCantR) });

// ---------------------------------------------------------------- tablas
const stripTable = (title, st, qm, kind) => `<h4 style="margin:10px 0 4px; font-size:13px;">${title}</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>Posición</th><th style="text-align:right;">L (m)</th><th style="text-align:right;">Coef.</th><th style="text-align:right;">M (kg·m)</th><th style="text-align:right;">R (kg)</th></tr></thead><tbody>${st.items.map((it) => `<tr><td>${it.label}</td><td style="text-align:right;">${fmt(it.L, 2)}</td><td style="text-align:right;">${it.kind === 'tr' ? 'Ct' : 'Ca'} ${it.coef}</td><td style="text-align:right;"><b>${kg(it.M)}</b></td><td style="text-align:right;">${it.R ? kg(it.R) : '—'}</td></tr>`).join('')}</tbody></table></div>`;

const tubeRow = (name, c, tube, extra = '') => `<tr><td>${name}${extra ? `<br><span class="text-muted" style="font-size:11.5px;">${extra}</span>` : ''}</td><td style="text-align:right;">${tube ? `ø ${tube.de} × ${tube.s} mm` : '—'}</td><td style="text-align:right;">${tube ? fmt(tube.A, 2) : '—'}</td><td style="text-align:right;">${c && Number.isFinite(c.sigma) ? `${fmt(c.lambda, 0)} · ${c.omega} · ${kg(c.sigma)}` : '—'}</td></tr>`;

function tubesTable(r) {
  const rows = [tubeRow('Barras de la placa', r.chord, r.chord.tube, `C = T = ${kg(r.chord.C)} kg`), tubeRow('Diagonales de la placa', r.diag, r.diag.tube, `Q′ = ${kg(r.diag.Qp)} kg`)];
  if (r.beams) rows.push(tubeRow('Barras de las vigas', r.beams.chord, r.beams.chord.tube, `C = T = ${kg(r.beams.C)} kg`), tubeRow('Diagonales de las vigas', r.beams.diag, r.beams.diag.tube, `Q′ = ${kg(r.beams.Qp)} kg`));
  else rows.push(tubeRow('Capitel (4 diagonales)', r.capitel, r.capitel.tube, `Q′ = ${kg(r.capitel.Qp)} kg`), tubeRow('Diagonales sobre el capitel', r.capDiag, r.capDiag.tube, `Q′ = ${kg(r.capDiag.Qp)} kg`));
  rows.push(tubeRow('Columna', r.col, r.col.tube, `N = ${kg(r.col.N3)} kg · h = ${kg(r.col.h)} cm`));
  return `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Caños adoptados (Tabla G, DIN 2448)</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Elemento</th><th style="text-align:right;">Caño</th><th style="text-align:right;">Fe (cm²)</th><th style="text-align:right;">λ · ω · σ (kg/cm²)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------- pasos
function step1(calc) {
  const d = calc.design; const out = compute(calc); const r = out.res;
  const nx = nums(d.xSpans).length; const ny = nums(d.ySpans).length;
  const Lt = Math.max(...nums(d.xSpans), ...nums(d.ySpans)); const Lv = Math.max(num(d.xCantL), num(d.xCantR), num(d.yCantL), num(d.yCantR));
  const Hmin = Math.max(Lt / 18, Lv / 9);
  const modular = `<table class="data-table"><tbody>
    <tr><td>Luz del tramo mayor Lt · voladizo mayor Lv</td><td style="text-align:right;">${fmt(Lt, 2)} m · ${fmt(Lv, 2)} m</td></tr>
    <tr><td>H ≥ Lt / 18 y H ≥ Lv / 9 → H mínimo</td><td style="text-align:right;"><b>${fmt(Hmin, 2)} m</b></td></tr>
    <tr><td>Con Lm = √2 H, Lm mínimo</td><td style="text-align:right;"><b>${fmt(Math.SQRT2 * Hmin, 2)} m</b></td></tr>
    <tr><td>Con Lm adoptado (${fmt(num(d.Lm), 2)} m), H = Lm / √2 y longitud de la diagonal</td><td style="text-align:right;">${fmt(r ? r.H : num(d.Lm) / Math.SQRT2, 2)} m · ${fmt(r ? r.Ld : num(d.Lm), 2)} m</td></tr></tbody></table>`;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Estereoestructura plana</h3>
      ${selField('design.hyp', 'Cómo se asimila la placa', d.hyp, [['beams', 'Placa isótropa apoyada sobre vigas y columnas (vigas diferenciadas)'], ['columns', 'Placa isótropa apoyada sobre columnas (como un entrepiso sin vigas)']], 'Con vigas, la placa y las vigas se dimensionan por separado; sobre columnas, los momentos se incrementan 1,4 en el apoyo y 1,2 en el tramo y se agrega el capitel.')}
      ${axisEditor({ path: 'design.xSpans', spans: d.xSpans, title: 'Luces entre columnas en X', kind: 'num', sketch: false, hint: `${nx} tramo${nx === 1 ? '' : 's'} (la guía da coeficientes para 1 a 4 tramos continuos).`, cant: { left: { path: 'design.xCantL', value: d.xCantL, label: 'Voladizo eje 1' }, right: { path: 'design.xCantR', value: d.xCantR, label: `Voladizo eje ${nx + 1}` } } })}
      ${axisEditor({ path: 'design.ySpans', spans: d.ySpans, title: 'Luces entre columnas en Y', kind: 'letter', sketch: false, hint: `${ny} tramo${ny === 1 ? '' : 's'}: ejes A a ${String.fromCharCode(65 + ny)}.`, cant: { left: { path: 'design.yCantL', value: d.yCantL, label: 'Voladizo eje A' }, right: { path: 'design.yCantR', value: d.yCantR, label: `Voladizo eje ${String.fromCharCode(65 + ny)}` } } })}
      <div class="axed-sketch" style="border:0; padding:0 0 10px;">${planFigure(d)}</div></div>
    <div class="card"><h3 style="margin-top:0;">Módulo estructural (ajuste modular)</h3>${moduleFigure(r, d)}${modular}
      <div class="field-row" style="flex-wrap:wrap; margin-top:8px;">${numField('design.Lm', 'Longitud del módulo Lm', d.Lm, { unit: 'm', hint: 'La guía adopta 2,5 m (redondeando 1,97).' })}${numField('design.H', 'Altura H (0 = Lm / √2)', d.H, { unit: 'm' })}</div>
      ${r ? `<p class="text-muted" style="font-size:12px; margin:0;">${r.advice.map(escapeHtml).join(' ') || 'El módulo cumple las relaciones de la guía.'}</p>` : ''}</div>
    <div class="card"><h3 style="margin-top:0;">Cargas</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.pp', 'Peso propio (caños y cubierta liviana)', d.pp, { unit: 'kg/m²', hint: 'Guía: 20.' })}${numField('design.sc', 'Sobrecarga accidental', d.sc, { unit: 'kg/m²', hint: 'Guía: 30.' })}</div>
      <h4 style="margin:10px 0 4px; font-size:13px;">Viento (CIRSOC 102-2005, simplificado como la guía)</h4>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.V', 'Velocidad básica V', d.V, { unit: 'm/s', hint: 'Buenos Aires: 45 m/s.' })}${selField('design.exposure', 'Categoría de exposición', d.exposure, Object.entries(W.EXPOSURES))}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.zWind', 'Altura media de la cubierta', d.zWind, { unit: 'm', hint: 'Para Kz (caso 2: sistema principal).' })}${numField('design.windManual', 'Viento de diseño manual (0 = calculado)', d.windManual, { unit: 'kg/m²' })}</div>
      <p class="text-muted" style="font-size:12px; margin:0;">${r ? `Kz = ${r.wind.Kz ? fmt(r.wind.Kz, 2) : '—'}; qh = ${r.wind.q ? fmt(r.wind.q, 1) : '—'} kg/m²; p = qh (G Cp + GCpi) con Cp = ±0,8 y GCpi = ±0,18 = <b>${kg(r.wind.p)} kg/m²</b>${r.wind.manual ? ' (manual)' : ''}. La guía obtiene 60 kg/m².` : ''}</p></div></div>
    <div class="note" style="margin-top:16px;">${SPACE_NOTE}</div>`;
}

function step2(calc) {
  const out = compute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  const states = `<table class="data-table"><tbody>${r.states.map((s) => `<tr><td>${s.id} · ${s.label}</td><td style="text-align:right;">${s.q >= 0 ? '' : '−'}${kg(Math.abs(s.q))} kg/m²</td></tr>`).join('')}
    <tr><td>Estado de diseño (el mayor entre E2 y E3) · qm = 0,65 q Lm</td><td style="text-align:right;"><b>${kg(r.qDes)} kg/m² · ${kg(r.qm)} kg/m</b></td></tr></tbody></table>`;
  const beams = r.beams ? `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Vigas de apoyo (líneas de columnas)</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Línea</th><th style="text-align:right;">Ancho (m)</th><th style="text-align:right;">qm (kg/m)</th><th style="text-align:right;">M apoyo</th><th style="text-align:right;">M tramo</th><th style="text-align:right;">R (kg)</th></tr></thead><tbody>
    ${['x', 'y'].map((dir) => r.beams.lines[dir].map((l) => `<tr><td>${dir === 'x' ? `Vigas en X, eje ${String.fromCharCode(65 + l.j)}` : `Vigas en Y, eje ${l.j + 1}`}</td><td style="text-align:right;">${fmt(l.w, 2)}</td><td style="text-align:right;">${kg(l.qb)}</td><td style="text-align:right;">${kg(l.Msup)}</td><td style="text-align:right;">${kg(l.Mtr)}</td><td style="text-align:right;">${kg(l.Rmax)}</td></tr>`).join('')).join('')}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Se diseñan todas las vigas con los esfuerzos de las más cargadas. Momento de apoyo común: el menor entre las dos direcciones (${kg(r.beams.MsupX)} y ${kg(r.beams.MsupY)} kg·m) por la superposición de las áreas de influencia, como indica la guía → <b>${kg(r.beams.Mdes)} kg·m</b>.</p></div>` : '';
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Estados de carga</h3>${states}</div>
    <div class="card"><h3 style="margin-top:0;">Momentos y reacciones de la placa${r.hyp === 'columns' ? ' (× 1,4 apoyo, × 1,2 tramo)' : ''}</h3>${stripTable('Sentido X', r.stripX)}${stripTable('Sentido Y', r.stripY)}</div></div>${beams}`;
}

function step3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigma', 'Tensión admisible del acero', d.sigma, { unit: 'kg/cm²', hint: 'F-22 / F-24: 1400.' })}${selField('design.omegaTable', 'Tabla ω', d.omegaTable, [['F-22', 'F-22'], ['F-24', 'F-24']])}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.E', 'Módulo de elasticidad E', d.E, { unit: 'kg/cm²' })}${numField('design.flechaRatio', 'Flecha admisible Lt /', d.flechaRatio, { step: 1 })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.lambdaMax', 'Esbeltez máxima de las barras comprimidas', d.lambdaMax, { step: 1, hint: 'Criterio de proyecto (CIRSOC 301 admite 200).' })}${numField('design.qc', 'Carga de la cubierta sobre el tubo qc', d.qc, { unit: 'kg/cm', hint: '0 = la cubierta no apoya directo sobre los tubos (sin flexocompresión). Guía: 0,375.' })}</div>
    <h4 style="margin:10px 0 4px; font-size:13px;">Columnas y fundación</h4>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.colH', 'Altura de las columnas', d.colH, { unit: 'm' })}${selField('design.colSame', 'Tubo de la columna', d.colSame, [['yes', 'Igual al de las vigas (como la guía) si verifica'], ['no', 'El más liviano que verifica']])}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.soilSigma', 'Tensión admisible del terreno', d.soilSigma, { unit: 'kg/cm²', hint: 'Guía: 2,5.' })}${numField('design.plateC', 'Lado de la columna con su placa', d.plateC, { unit: 'cm' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.baseThick', 'Espesor del borde de la base', d.baseThick, { unit: 'cm' })}${selField('design.anchored', 'Succión (Estado 4)', d.anchored, [['no', 'Solo el peso de la base'], ['yes', 'Se diseña un apoyo que absorbe tracción']])}</div></div>`;
  const base = `<div class="card" style="margin-top:16px;"><table class="data-table"><tbody>
    <tr><td>Base: superficie S = N / σs · lado a</td><td style="text-align:right;">${kg(r.base.S)} cm² · ${kg(r.base.a)} cm</td></tr>
    <tr><td>Peso de la base (tronco de pirámide a 45°)</td><td style="text-align:right;">${kg(r.base.weight)} kg</td></tr>
    <tr><td>Estado 4: solicitación ascendente de la columna</td><td style="text-align:right;">${kg(r.base.uplift)} kg</td></tr></tbody></table></div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}${tubesTable(r)}${base}</div></div>`;
}

function memoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design;
  const strip = (st) => `<table>${st.items.map((it) => memoRow(escapeHtml(it.label), `L = ${fmt(it.L, 2)} m · ${it.kind === 'tr' ? 'Ct' : 'Ca'} ${it.coef} · M = ${kg(it.M)} kg·m${it.R ? ` · R = ${kg(it.R)} kg` : ''}`)).join('')}</table>`;
  const tr = (name, c, t) => memoRow(name, t ? `ø ${t.de} × ${t.s} mm · Fe = ${fmt(t.A, 2)} cm² · λ = ${fmt(c.lambda, 0)}, ω = ${c.omega}, σ = ${kg(c.sigma)} kg/cm²` : 'sin caño en la Tabla G');
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', `Estereoestructura plana, placa ${r.hyp === 'columns' ? 'apoyada sobre columnas' : 'apoyada sobre vigas y columnas'}`, 'Guía de predimensionado E4 · 5')}
      ${memoRow('Luces en X', `${r.xs.map((l) => fmt(l, 2)).join(' + ')} m, voladizos ${fmt(r.xcL, 2)} y ${fmt(r.xcR, 2)} m`)}${memoRow('Luces en Y', `${r.ys.map((l) => fmt(l, 2)).join(' + ')} m, voladizos ${fmt(r.ycL, 2)} y ${fmt(r.ycR, 2)} m`)}
      ${memoRow('Módulo', `Lm = ${fmt(r.Lm, 2)} m · H = ${fmt(r.H, 2)} m · Ld = ${fmt(r.Ld, 2)} m (H mín. ${fmt(r.Hmin, 2)} m)`)}</table>
    ${planFigure(d)}${moduleFigure(r, d)}
    <h2>2. Cargas</h2><table>${r.states.map((s) => memoRow(`${s.id} · ${s.label}`, `${fmt(s.q, 0)} kg/m²`)).join('')}${memoRow('Viento de diseño', `${kg(r.wind.p)} kg/m² (CIRSOC 102, V = ${fmt(d.V, 0)} m/s)`)}${memoRow('Estado de diseño · qm = 0,65 q Lm', `${kg(r.qDes)} kg/m² · ${kg(r.qm)} kg/m`)}</table>
    <h2>3. Momentos y reacciones de la placa</h2><h3 style="font-size:12px; margin:6px 0 2px;">Sentido X</h3>${strip(r.stripX)}<h3 style="font-size:12px; margin:6px 0 2px;">Sentido Y</h3>${strip(r.stripY)}
    <h2>4. Caños adoptados</h2><table>${tr('Barras de la placa', r.chord, r.chord.tube)}${tr('Diagonales de la placa', r.diag, r.diag.tube)}${r.beams ? tr('Barras de las vigas', r.beams.chord, r.beams.chord.tube) + tr('Diagonales de las vigas', r.beams.diag, r.beams.diag.tube) : tr('Capitel', r.capitel, r.capitel.tube) + tr('Diagonales sobre el capitel', r.capDiag, r.capDiag.tube)}${tr('Columna', r.col, r.col.tube)}</table>
    <h2>5. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>6. Resultado</h2><table>${memoRow('Estereoestructura', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(SPACE_NOTE)}</p>`;
  return { title: calc.name, sub: `Estereoestructura plana · ${fmt(r.xs.reduce((a, b) => a + b, 0) + r.xcL + r.xcR, 1)} × ${fmt(r.ys.reduce((a, b) => a + b, 0) + r.ycL + r.ycR, 1)} m`, html };
}

export const spaceModule = {
  label: 'Estereoestructura plana',
  defaults() { return { design: defaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return compute(calc); },
  step1, step2, step3, memoria,
};
