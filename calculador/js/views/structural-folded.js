// Grandes luces: losa plegada de hormigón armado. Motor en js/structural/folded.js.
// FUENTE: guía 4 "Plegados" del Taller de Estructuras E4 (FAUD-UNMdP, curso 2024).
import * as F from '../structural/folded.js';
import { REBAR_DIAMETERS } from '../structural/big-beams.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';

const kg = (v) => fmt(v, 0);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
export const FOLD_NOTE = 'Predimensionado según la guía 4 "Plegados" del Taller de Estructuras E4 (FAUD-UNMdP, 2024): el plegado se asimila a una viga simplemente apoyada con la sección de un módulo de onda (alas de hormigón comprimido y traccionado más un alma equivalente), con tensiones admisibles de la cátedra. La viga tímpano y las columnas se predimensionan con las reglas rápidas de la guía (sin la tabla de coeficientes ke y kx, que no se adjuntó: se usa h = 8 √(M / b) y Fe = 0,5 M / h). No se verifican el pandeo de las columnas, las aristas del plegado, el pandeo local de las chapas ni la fisuración. Herramienta de apoyo para el predimensionado.';

// ---------------------------------------------------------------- figuras
function waveFigure(d) {
  const B = Math.max(num(d.B, 3), 0.5); const b = Math.min(num(d.b, 0.65), B / 2 - 0.01); const H = Math.max(num(d.H, 1.6), 0.2); const t = num(d.d, 0.1);
  const bp = (B - 2 * b) / 2;
  const W = 560; const n = 3;
  const k = Math.min(430 / (n * B), 110 / H);
  const x0 = 60; const y0 = 56;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  const pts = [];
  for (let i = 0; i < n; i++) { const o = i * B; pts.push([o, 0], [o + b / 2, 0], [o + b / 2 + bp, H], [o + b / 2 + bp + b, H], [o + b / 2 + 2 * bp + b, 0]); }
  pts.push([n * B, 0]);
  let s = `<polyline points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="${Math.max(3, t * k)}" stroke-linejoin="miter"/>`;
  s += `<line x1="${X(0)}" y1="${Y(0) - 18}" x2="${X(B)}" y2="${Y(0) - 18}" stroke="var(--accent)"/><line x1="${X(0)}" y1="${Y(0) - 22}" x2="${X(0)}" y2="${Y(0) - 14}" stroke="var(--accent)"/><line x1="${X(B)}" y1="${Y(0) - 22}" x2="${X(B)}" y2="${Y(0) - 14}" stroke="var(--accent)"/>`;
  s += `<text x="${X(B / 2)}" y="${Y(0) - 25}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">módulo B = ${fmt(B, 2)} m</text>`;
  const xr = X(n * B) + 16;
  s += `<line x1="${xr}" y1="${Y(0)}" x2="${xr}" y2="${Y(H)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(0)}" x2="${xr + 4}" y2="${Y(0)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(H)}" x2="${xr + 4}" y2="${Y(H)}" stroke="var(--accent)"/><text x="${xr + 8}" y="${(Y(0) + Y(H)) / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">H = ${fmt(H, 2)} m</text>`;
  s += `<text x="${X(b / 2 + bp + b / 2)}" y="${Y(H) + 18}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">b = ${fmt(b, 2)} m (alas) · b′ = ${fmt(bp, 2)} m (proyección del plano inclinado) · d = ${fmt(t * 100, 0)} cm</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(H) + 34)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Sección transversal del plegado">${s}</svg>`;
}

function elevationFigure(d) {
  const L = Math.max(num(d.L, 16), 1); const H = Math.max(num(d.H, 1.6), 0.2); const th = num(d.th, d.H);
  const W = 560; const k = Math.min(420 / L, 70 / Math.max(H, th));
  const x0 = 70; const y0 = 50;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  let s = `<rect x="${X(0)}" y="${Y(0)}" width="${L * k}" height="${H * k}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/>`;
  const nm = Math.max(1, Math.round(num(d.nMod, 10)));
  s += `<text x="${X(L / 2)}" y="${Y(H / 2) + 4}" text-anchor="middle" font-size="12" fill="var(--ink)">vista del plegado (${nm} módulos de ${fmt(num(d.B, 3), 2)} m = ${fmt(nm * num(d.B, 3), 1)} m de ancho)</text>`;
  s += `<path d="M ${X(0)} ${Y(H) + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><path d="M ${X(L)} ${Y(H) + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<line x1="${X(0)}" y1="${Y(H) + 34}" x2="${X(L)}" y2="${Y(H) + 34}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${Y(H) + 50}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m (luz entre tímpanos)</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(H) + 62)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Vista del plegado">${s}</svg>`;
}

function equivFigure(r) {
  const W = 300; const Hh = 210;
  const k = Math.min(150 / (r.H * 100), 190 / (r.b * 100));
  const bw = r.b * 100 * k; const hh = r.H * 100 * k; const dd = Math.max(r.d * 100 * k, 4); const bo = Math.max(r.bo * 100 * k, 4);
  const ox = 60; const oy = 14;
  let s = `<rect x="${ox}" y="${oy}" width="${bw}" height="${dd}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/><rect x="${ox}" y="${oy + hh - dd}" width="${bw}" height="${dd}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/><rect x="${ox + (bw - bo) / 2}" y="${oy + dd}" width="${bo}" height="${hh - 2 * dd}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/>`;
  s += `<text x="${ox + bw + 8}" y="${oy + hh / 2 + 4}" font-size="11.5" font-weight="600" fill="var(--accent-ink)">H = ${fmt(r.H * 100, 0)} cm</text>`;
  s += `<text x="${ox + bw / 2}" y="${oy + hh + 16}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--accent-ink)">b = ${fmt(r.b * 100, 0)} cm · bo = ${fmt(r.bo * 100, 1)} cm · d = ${fmt(r.d * 100, 0)} cm</text>`;
  s += `<text x="${ox + bw / 2}" y="${oy + hh + 32}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">Z = H − d = ${fmt(r.Z * 100, 0)} cm</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:300px; height:auto; display:block;" role="img" aria-label="Perfil equivalente">${s}</svg>`;
}

// ---------------------------------------------------------------- cálculo
const defaults = () => ({ kind: 'folded', L: 16, nMod: 10, B: 3, b: 0.65, H: 1.6, d: 0.1, gamma: 2400, sc: 100, sigmaC: 80, tau: 10, sigmaS: 2400, E: 210000, flechaRatio: 500, barD: 16, tl: 6, tb: 0.25, th: 1.6, tn: 0, nCol: 12, sigmaCol: 80, rhoCol: 0.01 });

function compute(calc) {
  const d = calc.design;
  const p = { L: num(d.L), nMod: num(d.nMod), B: num(d.B), b: num(d.b), H: num(d.H), d: num(d.d), gamma: num(d.gamma, 2400), sc: num(d.sc), sigmaC: num(d.sigmaC, 80), tau: num(d.tau, 10), sigmaS: num(d.sigmaS, 2400), E: num(d.E, 210000), flechaRatio: num(d.flechaRatio, 500), barD: num(d.barD, 16),
    timp: { l: num(d.tl), b: num(d.tb), h: num(d.th) || num(d.H), n: num(d.tn) }, nCol: num(d.nCol, 1), sigmaCol: num(d.sigmaCol, 80), rhoCol: num(d.rhoCol, 0.01) };
  if (![p.L, p.nMod, p.B, p.b, p.H, p.d].every((v) => v > 0)) return { error: 'Completá la luz, la cantidad y el ancho de los módulos, el ancho de las alas, la altura y el espesor con valores mayores que cero.' };
  if (p.b * 2 >= p.B) return { error: 'El ancho de las alas b tiene que ser menor que la mitad del módulo B (B = 2 b + 2 b′).' };
  if (p.d * 2 >= p.H) return { error: 'El espesor d es demasiado grande para la altura de la onda.' };
  if (!(p.timp.l > 0) || !(p.timp.b > 0) || !(p.timp.h > 0)) return { error: 'Completá la luz, el ancho y la altura de la viga tímpano.' };
  return { kind: 'folded', input: p, res: F.designFolded(p) };
}

function step1(calc) {
  const d = calc.design;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Losa plegada de hormigón armado</h3>${elevationFigure(d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.L', 'Luz libre entre tímpanos L', d.L, { unit: 'm' })}${numField('design.nMod', 'Cantidad de módulos', d.nMod, { step: 1, hint: 'Un número entero de módulos cubre el ancho de la planta.' })}</div>
      <h4 style="margin:10px 0 4px; font-size:13px;">Módulo de onda</h4>${waveFigure(d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.B', 'Ancho del módulo B', d.B, { unit: 'm', hint: 'B = 2 b + 2 b′' })}${numField('design.H', 'Altura de la onda H', d.H, { unit: 'm', hint: `Punto de partida: 10 % de la luz = ${fmt(num(d.L) / 10, 2)} m.` })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.b', 'Ancho de las alas b', d.b, { unit: 'm' })}${numField('design.d', 'Espesor del hormigón d', d.d, { unit: 'm' })}</div></div>
    <div class="card"><h3 style="margin-top:0;">Cargas y apoyos</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.gamma', 'Peso del hormigón', d.gamma, { unit: 'kg/m³' })}${numField('design.sc', 'Sobrecarga en planta', d.sc, { unit: 'kg/m²', hint: 'La guía usa 300 kg por metro de onda = 100 kg/m² × 3 m. El viento se desprecia: tiende a descargar.' })}</div>
      <h4 style="margin:10px 0 4px; font-size:13px;">Viga tímpano de apoyo</h4>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.tl', 'Luz del tramo del tímpano', d.tl, { unit: 'm' })}${numField('design.tb', 'Ancho del tímpano', d.tb, { unit: 'm' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.th', 'Altura del tímpano', d.th, { unit: 'm', hint: 'Normalmente igual a la altura de la onda.' })}${numField('design.tn', 'Módulos que apoyan en el tramo', d.tn, { step: 1, hint: '0 = luz del tramo / B.' })}</div>
      ${numField('design.nCol', 'Cantidad de columnas que sostienen el plegado', d.nCol, { step: 1 })}</div></div>
    <div class="note" style="margin-top:16px;">${FOLD_NOTE}</div>`;
}

function step2(calc) {
  const out = compute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Geometría y análisis de cargas</h3><table class="data-table"><tbody>
      <tr><td>Proyección del plano inclinado b′ = (B − 2 b) / 2</td><td style="text-align:right;">${fmt(r.bp, 2)} m</td></tr>
      <tr><td>Ángulo α = arctg ((H − d) / b′)</td><td style="text-align:right;"><b>${fmt(r.alpha, 2)}°</b></td></tr>
      <tr><td>Longitud de onda = 2 b + 2 (H − d) / sen α</td><td style="text-align:right;">${fmt(r.wave, 2)} m</td></tr>
      <tr><td>Peso propio por metro de onda</td><td style="text-align:right;">${kg(r.Pp)} kg/m</td></tr>
      <tr><td>Sobrecarga por metro de onda</td><td style="text-align:right;">${kg(r.sob)} kg/m</td></tr>
      <tr><td>Carga total q</td><td style="text-align:right;"><b>${kg(r.q)} kg/m</b></td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${r.advice.map(escapeHtml).join(' ') || `El ángulo está en el entorno de 45° a 60° en el que la asimilación a una viga se aproxima bien.`}</p></div>
    <div class="card"><h3 style="margin-top:0;">Esfuerzos principales (viga simplemente apoyada)</h3>${equivFigure(r)}<table class="data-table"><tbody>
      <tr><td>Mmax = q L² / 8</td><td style="text-align:right;"><b>${kg(r.M)} kg·m</b></td></tr>
      <tr><td>Qmax = q L / 2</td><td style="text-align:right;"><b>${kg(r.Q)} kg</b></td></tr>
      <tr><td>Alma equivalente bo = 2 d / sen α</td><td style="text-align:right;">${fmt(r.bo * 100, 1)} cm</td></tr>
      <tr><td>C = T = M / Z, Z = H − d = ${fmt(r.Z, 2)} m</td><td style="text-align:right;"><b>${kg(r.C)} kg</b></td></tr></tbody></table></div></div>`;
}

function step3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaC', 'Tensión de compresión admisible', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: 80 (H-17 homogeneizado).' })}${numField('design.tau', 'Tensión de corte admisible', d.tau, { unit: 'kg/cm²', hint: 'La guía admite de 10 a 15.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaS', 'Tensión del acero (AB-42)', d.sigmaS, { unit: 'kg/cm²', hint: 'Guía: 2400.' })}${selField('design.barD', 'Diámetro de las barras del valle', d.barD, REBAR_DIAMETERS.map((x) => [x, `Ø${x} mm`]))}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.E', 'Módulo de elasticidad', d.E, { unit: 'kg/cm²', hint: 'Guía: 210000.' })}${numField('design.flechaRatio', 'Flecha admisible L /', d.flechaRatio, { step: 1 })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaCol', 'Tensión para las columnas (Fb = N / σ)', d.sigmaCol, { unit: 'kg/cm²', hint: 'Guía: 80 (H-17, coeficiente 2,5, cuantía 1 %).' })}${numField('design.rhoCol', 'Cuantía de las columnas', d.rhoCol, { hint: 'Guía: 0,01.' })}</div></div>`;
  const extra = `<div class="card" style="margin-top:16px;"><table class="data-table"><tbody>
    <tr><td>Viga tímpano: carga q = R n / l + peso propio (${r.timp.n} módulos)</td><td style="text-align:right;">${kg(r.timp.q)} kg/m</td></tr>
    <tr><td>M = q l² / 10</td><td style="text-align:right;">${fmt(r.timp.M, 2)} tm</td></tr>
    <tr><td>Armadura Fe = 0,5 M / h</td><td style="text-align:right;">${fmt(r.timp.Fe, 2)} cm²</td></tr>
    <tr><td>Columna: N · lado mínimo</td><td style="text-align:right;">${kg(r.col.N)} kg · ${fmt(r.col.side, 1)} cm</td></tr></tbody></table></div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}${extra}</div></div>`;
}

function memoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design;
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Losa plegada de hormigón armado', 'Guía de predimensionado E4 · 4')}${memoRow('Luz · módulos', `L = ${fmt(d.L, 2)} m · ${fmt(d.nMod, 0)} módulos de ${fmt(d.B, 2)} m`)}
      ${memoRow('Módulo', `H = ${fmt(d.H, 2)} m · b = ${fmt(d.b, 2)} m · b′ = ${fmt(r.bp, 2)} m · d = ${fmt(num(d.d) * 100, 0)} cm · α = ${fmt(r.alpha, 2)}°`)}
      ${memoRow('Cargas por metro de onda', `peso propio ${kg(r.Pp)} + sobrecarga ${kg(r.sob)} = ${kg(r.q)} kg/m`)}</table>
    ${elevationFigure(d)}${waveFigure(d)}<h2>2. Esfuerzos principales</h2><table>${memoRow('Mmax = q L² / 8', `${kg(r.M)} kg·m`)}${memoRow('Qmax = q L / 2', `${kg(r.Q)} kg`)}${memoRow('bo = 2 d / sen α · Z = H − d', `${fmt(r.bo * 100, 1)} cm · ${fmt(r.Z, 2)} m`)}${memoRow('C = T = M / Z', `${kg(r.C)} kg`)}${memoRow('J del perfil equivalente', `${r.J.toExponential(3)} cm⁴`)}</table>
    ${equivFigure(r)}<h2>3. Apoyos</h2><table>${memoRow('Viga tímpano', `q = ${kg(r.timp.q)} kg/m · M = ${fmt(r.timp.M, 2)} tm · ${fmt(r.timp.b * 100, 0)} × ${fmt(r.timp.h * 100, 0)} cm · Fe = ${fmt(r.timp.Fe, 2)} cm²`)}${memoRow('Columnas', `N = ${kg(r.col.N)} kg · Fb = ${fmt(r.col.Fb, 0)} cm² · ${r.col.sideAdopt} × ${r.col.sideAdopt} cm con 4 Ø12`)}</table>
    <h2>4. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>5. Resultado</h2><table>${memoRow('Plegado', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(FOLD_NOTE)}</p>`;
  return { title: calc.name, sub: `Losa plegada · L = ${fmt(d.L, 1)} m`, html };
}

export const foldedModule = {
  label: 'Plegado de hormigón armado',
  defaults() { return { design: defaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return compute(calc); },
  step1, step2, step3, memoria,
};
