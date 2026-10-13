// Grandes luces: cáscaras de hormigón armado (módulo de paraboloide hiperbólico y cúpula de generatriz circular). Motor en js/structural/shells.js.
// FUENTE: guías 3.1 y 3.2 de Cáscaras del Taller de Estructuras E4 (FAUD-UNMdP, curso 2024).
import * as Sh from '../structural/shells.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';

const kg = (v) => fmt(v, 0);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
export const SHELL_NOTE = 'Predimensionado según las guías 3.1 (paraboloide hiperbólico) y 3.2 (cúpulas) de Cáscaras del Taller de Estructuras E4 (FAUD-UNMdP, 2024): teoría de membrana con carga uniforme y simétrica, franjas de 1 m de ancho, tensiones admisibles de la cátedra. No se verifican las perturbaciones de borde, el punzonado de la columna central, el pandeo de las columnas, el viento con su coeficiente real, la distribución asimétrica de cargas ni el comportamiento del hormigón fisurado. Herramienta de apoyo para el predimensionado.';
const BAR_D = [6, 8, 10, 12];
const EDGE_D = [10, 12, 16, 20, 25];

// ---------------------------------------------------------------- figuras
function phPlan(d) {
  const a = Math.max(num(d.a, 5), 0.5); const b = Math.max(num(d.b, 7.5), 0.5);
  const W = 560; const k = Math.min(400 / (2 * b), 210 / (2 * a));
  const x0 = 80; const y0 = 44;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  const tx = (x, y, t, anchor = 'middle', col = 'var(--accent-ink)') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="12" font-weight="700" fill="${col}">${t}</text>`;
  let s = `<rect x="${X(0)}" y="${Y(0)}" width="${2 * b * k}" height="${2 * a * k}" fill="var(--accent)" fill-opacity="0.07" stroke="var(--ink)" stroke-width="2.4"/>`;
  s += `<line x1="${X(b)}" y1="${Y(0)}" x2="${X(b)}" y2="${Y(2 * a)}" stroke="var(--warn)" stroke-width="2.6"/><line x1="${X(0)}" y1="${Y(a)}" x2="${X(2 * b)}" y2="${Y(a)}" stroke="var(--warn)" stroke-width="2.6"/>`;
  s += `<rect x="${X(b) - 6}" y="${Y(a) - 6}" width="12" height="12" fill="var(--ink)"/>`;
  s += tx(X(b / 2), Y(0) - 8, 'V2') + tx(X(1.5 * b), Y(0) - 8, 'V2') + tx(X(b / 2), Y(2 * a) + 16, 'V2') + tx(X(1.5 * b), Y(2 * a) + 16, 'V2');
  s += tx(X(0) - 8, Y(a / 2) + 4, 'V1', 'end') + tx(X(0) - 8, Y(1.5 * a) + 4, 'V1', 'end') + tx(X(2 * b) + 8, Y(a / 2) + 4, 'V1', 'start') + tx(X(2 * b) + 8, Y(1.5 * a) + 4, 'V1', 'start');
  s += tx(X(b) + 8, Y(a / 2) + 4, 'V3', 'start', 'var(--warn)') + tx(X(b) + 8, Y(1.5 * a) + 4, 'V3', 'start', 'var(--warn)') + tx(X(b / 2), Y(a) - 6, 'V4', 'middle', 'var(--warn)') + tx(X(1.5 * b), Y(a) - 6, 'V4', 'middle', 'var(--warn)');
  s += `<text x="${X(b)}" y="${Y(2 * a) + 34}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">módulo de ${fmt(2 * b, 2)} × ${fmt(2 * a, 2)} m: cuatro sectores de PH y una columna central (cuadrado negro)</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(2 * a) + 46)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Planta del módulo de paraboloide hiperbólico">${s}</svg>`;
}

function phSection(r) {
  const W = 560; const L = r.L; const f = r.f;
  const k = Math.min(420 / L, 70 / f);
  const x0 = 70; const y0 = 40;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  const par = (up) => Array.from({ length: 41 }, (_, i) => { const x = L * i / 40; const t = 4 * f * x * (L - x) / (L * L); return `${X(x)},${up ? Y(f - t) : Y(t)}`; }).join(' ');
  let s = `<polyline points="${par(false)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/><polyline points="${par(true)}" fill="none" stroke="var(--warn)" stroke-width="2.4"/>`;
  s += `<line x1="${X(0)}" y1="${Y(f) + 22}" x2="${X(L)}" y2="${Y(f) + 22}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${Y(f) + 38}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m (2 × ${fmt(r.lo, 2)} × √2)</text>`;
  s += `<text x="${X(L) + 8}" y="${Y(f / 2) + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">f = ${fmt(f, 2)} m</text>`;
  s += `<text x="${X(L / 2)}" y="${Y(0) - 8}" text-anchor="middle" font-size="11.5" fill="var(--warn)">parábola traccionada (curvatura hacia arriba) · en azul la comprimida</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(f) + 50)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Parábolas generatrices del paraboloide">${s}</svg>`;
}

function domeSection(d, r) {
  const L = Math.max(num(d.L, 25), 1); const f = Math.max(num(d.f, 7), 0.3);
  const R = r ? r.R : (L * L + 4 * f * f) / (8 * f);
  const W = 560; const k = Math.min(400 / L, 130 / f);
  const x0 = 80; const y0 = 30; const yB = y0 + f * k;
  const X = (m) => x0 + (m + L / 2) * k; const Y = (m) => yB - m * k;                // m: altura sobre el arranque
  const cx = 0; const cy = f - R;                                                    // centro de la generatriz
  const phi0 = Math.acos((R - f) / R);
  const pts = Array.from({ length: 61 }, (_, i) => { const t = -phi0 + 2 * phi0 * i / 60; return `${X(cx + R * Math.sin(t))},${Y(cy + R * Math.cos(t))}`; }).join(' ');
  let s = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="3"/>`;
  s += `<line x1="${X(-L / 2) - 16}" y1="${yB}" x2="${X(L / 2) + 16}" y2="${yB}" stroke="var(--ink)" stroke-width="2"/>`;
  s += `<line x1="${X(L / 2)}" y1="${yB}" x2="${X(0)}" y2="${Y(cy)}" stroke="var(--ink-soft)" stroke-dasharray="4 3"/><line x1="${X(0)}" y1="${Y(f)}" x2="${X(0)}" y2="${Y(cy)}" stroke="var(--ink-soft)" stroke-dasharray="4 3"/>`;
  s += `<text x="${X(L / 4) + 4}" y="${(yB + Y(cy)) / 2 + 4}" font-size="11.5" fill="var(--ink-soft)">R = ${fmt(R, 2)} m</text>`;
  const xr = X(L / 2) + 26;
  s += `<line x1="${xr}" y1="${Y(f)}" x2="${xr}" y2="${yB}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(f)}" x2="${xr + 4}" y2="${Y(f)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${yB}" x2="${xr + 4}" y2="${yB}" stroke="var(--accent)"/><text x="${xr + 8}" y="${(Y(f) + yB) / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">f = ${fmt(f, 2)} m</text>`;
  s += `<line x1="${X(-L / 2)}" y1="${yB + 24}" x2="${X(L / 2)}" y2="${yB + 24}" stroke="var(--accent)"/><text x="${X(0)}" y="${yB + 40}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">diámetro L = ${fmt(L, 2)} m${r ? ` · ángulo de borde φ = ${fmt(r.phi0, 1)}°` : ''}</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(yB + 52)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Corte de la cúpula">${s}</svg>`;
}

// Esfuerzos de meridianos y paralelos según la altura y desde la clave (compresión a la izquierda de la línea cero)
function domeDiagram(r) {
  const rows = r.rows; const W = 560; const Hh = 230;
  const vals = rows.flatMap((x) => [x.Nm, x.Np]);
  const lo = Math.min(...vals, 0); const hi = Math.max(...vals, 0);
  const x0 = 80; const w = 400; const kx = w / Math.max(hi - lo, 1);
  const X = (v) => x0 + (v - lo) * kx;
  const y0 = 30; const ky = 150 / Math.max(rows[rows.length - 1].y, 1);
  const Y = (y) => y0 + y * ky;
  let s = `<line x1="${X(0)}" y1="${y0 - 6}" x2="${X(0)}" y2="${Y(rows[rows.length - 1].y) + 6}" stroke="var(--ink-soft)" stroke-dasharray="4 3"/>`;
  s += `<polyline points="${rows.map((x) => `${X(x.Nm)},${Y(x.y)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.4"/><polyline points="${rows.map((x) => `${X(x.Np)},${Y(x.y)}`).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2.4"/>`;
  const last = rows[rows.length - 1];
  s += `<text x="${X(last.Nm)}" y="${Y(last.y) + 18}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--accent-ink)">Nm = ${fmt(last.Nm, 0)}</text><text x="${X(last.Np)}" y="${Y(last.y) + 32}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--warn)">Np = ${fmt(last.Np, 0)}</text>`;
  s += `<text x="${X(rows[0].Nm)}" y="${y0 - 12}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">clave: ${fmt(rows[0].Nm, 0)}</text>`;
  s += `<text x="${x0}" y="${Hh - 8}" font-size="11" fill="var(--ink-soft)">kg por metro de ancho · altura y desde la clave hacia abajo · azul meridianos Nm, naranja paralelos Np · a la derecha de la línea cero, tracción</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Esfuerzos de meridianos y paralelos">${s}</svg>`;
}

// ================================================================= PARABOLOIDE HIPERBÓLICO
const phDefaults = () => ({ kind: 'ph', a: 5, b: 7.5, h: 2.25, e: 6, nx: 3, ny: 3, gamma: 2400, aisl: 20, sc: 60, vInc: 20, qAdopt: 250, sigmaC: 50, tau: 15, sigmaS: 1200, rhoMin: 0.5, barD: 6, sigmaB: 60, edgeD: 12, eEdge: 10, eCol: 18, colSide: 30, desague: 200 });

function phCompute(calc) {
  const d = calc.design;
  const p = { a: num(d.a), b: num(d.b), h: num(d.h), e: num(d.e), gamma: num(d.gamma, 2400), aisl: num(d.aisl), sc: num(d.sc), vInc: num(d.vInc), qAdopt: num(d.qAdopt), sigmaC: num(d.sigmaC, 50), tau: num(d.tau, 15), sigmaS: num(d.sigmaS, 1200), rhoMin: num(d.rhoMin, 0.5) / 100, barD: num(d.barD, 6), sigmaB: num(d.sigmaB, 60), edgeD: num(d.edgeD, 12), eEdge: num(d.eEdge, 10), eCol: num(d.eCol, 18), colSide: num(d.colSide, 30), desague: num(d.desague, 200), nx: num(d.nx, 1), ny: num(d.ny, 1) };
  if (![p.a, p.b, p.h, p.e].every((v) => v > 0)) return { error: 'Completá los semilados del módulo, el desnivel y el espesor de la cáscara con valores mayores que cero.' };
  return { kind: 'ph', input: p, res: Sh.designShellPH(p) };
}

function phStep1(calc) {
  const d = calc.design; const out = phCompute(calc); const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Cáscara de paraboloide hiperbólico (módulo de cuatro sectores)</h3>${phPlan(d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.a', 'Semilado menor del módulo a', d.a, { unit: 'm', hint: 'La guía: módulo de 15 × 10 m (a = 5, b = 7,5).' })}${numField('design.b', 'Semilado mayor b', d.b, { unit: 'm' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.h', 'Desnivel entre la columna y los bordes', d.h, { unit: 'm', hint: 'La guía: 2,25 m.' })}${numField('design.e', 'Espesor de la cáscara', d.e, { unit: 'cm', hint: 'Guía: 6 cm.' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.nx', 'Módulos en un sentido', d.nx, { step: 1 })}${numField('design.ny', 'Módulos en el otro', d.ny, { step: 1 })}</div>
      <p class="text-muted" style="font-size:12px; margin:0;">${r ? `Superficie cubierta: ${fmt(r.plan.total, 0)} m² con ${r.plan.modules} módulos (y ${r.plan.modules} columnas). ` : ''}Los módulos son repetitivos para amortizar el encofrado.</p></div>
    <div class="card"><h3 style="margin-top:0;">Cargas</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.gamma', 'Peso del hormigón', d.gamma, { unit: 'kg/m³' })}${numField('design.aisl', 'Aislaciones e instalaciones', d.aisl, { unit: 'kg/m²', hint: 'Guía: 20.' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.sc', 'Sobrecarga accidental', d.sc, { unit: 'kg/m²', hint: 'Guía: 60.' })}${numField('design.vInc', 'Incremento por viento', d.vInc, { unit: 'kg/m²', hint: 'Hipótesis de la guía: 20 (por su poca pendiente suele trabajar a succión).' })}</div>
      ${numField('design.qAdopt', 'Carga de diseño adoptada (0 = la suma)', d.qAdopt, { unit: 'kg/m²', hint: r ? `La suma da ${kg(r.qSum)} kg/m²; la guía la redondea a 250.` : '' })}
      <h4 style="margin:10px 0 4px; font-size:13px;">Generatriz</h4>${r ? phSection(r) : ''}</div></div>
    <div class="note" style="margin-top:16px;">${SHELL_NOTE}</div>`;
}

function phStep2(calc) {
  const out = phCompute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Análisis de cargas</h3><table class="data-table"><tbody>
      <tr><td>Peso propio = γ e</td><td style="text-align:right;">${kg(r.Pp)} kg/m²</td></tr>
      <tr><td>Aislaciones + sobrecarga + viento</td><td style="text-align:right;">${kg(num(calc.design.aisl) + num(calc.design.sc) + num(calc.design.vInc))} kg/m²</td></tr>
      <tr><td>Suma · carga de diseño q</td><td style="text-align:right;"><b>${kg(r.qSum)} · ${kg(r.q)} kg/m²</b></td></tr></tbody></table></div>
    <div class="card"><h3 style="margin-top:0;">Esfuerzos principales (franja de 1 m)</h3><table class="data-table"><tbody>
      <tr><td>Luz de la parábola generatriz L = 2 a √2</td><td style="text-align:right;">${fmt(r.L, 2)} m</td></tr>
      <tr><td>Flecha f = desnivel × a / b (triángulos proporcionales)</td><td style="text-align:right;">${fmt(r.f, 2)} m (${fmt(r.ratio * 100, 1)} % de L)</td></tr>
      <tr><td>Cada familia de parábolas toma q / 2</td><td style="text-align:right;">${kg(r.q / 2)} kg/m</td></tr>
      <tr><td>H = (q / 2) L² / 8 f (R ≈ H)</td><td style="text-align:right;"><b>${kg(r.H)} kg/m</b></td></tr>
      <tr><td>Fuerza en el sentido de las rectas H √2 / √2 m</td><td style="text-align:right;">${kg(r.H)} kg/m</td></tr></tbody></table></div></div>`;
}

function phStep3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaC', 'Compresión admisible del hormigón', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: 50 (homogeneizado).' })}${numField('design.tau', 'Tangencial admisible', d.tau, { unit: 'kg/cm²', hint: 'Guía: 15.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaS', 'Acero en tracción', d.sigmaS, { unit: 'kg/cm²', hint: 'Guía: 1200.' })}${numField('design.rhoMin', 'Cuantía mínima de la cáscara', d.rhoMin, { unit: '%', hint: 'Guía: 0,5.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${selField('design.barD', 'Barras de la malla', d.barD, BAR_D.map((x) => [x, `Ø${x} mm`]))}${selField('design.edgeD', 'Barras de las vigas de borde', d.edgeD, EDGE_D.map((x) => [x, `Ø${x} mm`]))}</div>
    <h4 style="margin:10px 0 4px; font-size:13px;">Vigas de borde internas y columna</h4>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaB', 'Compresión de las vigas y la columna', d.sigmaB, { unit: 'kg/cm²', hint: 'Guía: 60 (H13, AB42, coeficiente 2,5).' })}${numField('design.colSide', 'Lado de la columna cuadrada', d.colSide, { unit: 'cm', hint: 'Guía: 30 × 30 con 8 Ø12.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.eEdge', 'Espesor en el borde exterior', d.eEdge, { unit: 'cm', hint: 'Guía: 10.' })}${numField('design.eCol', 'Espesor cerca de la columna', d.eCol, { unit: 'cm', hint: 'Guía: 18.' })}</div>
    ${numField('design.desague', 'Desagüe pluvial dentro de la columna', d.desague, { unit: 'cm²', hint: 'Guía: 200.' })}</div>`;
  const forces = `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Bordes y columna</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Viga</th><th style="text-align:right;">Largo (m)</th><th style="text-align:right;">Fuerza (kg)</th><th style="text-align:right;">Sección (cm²)</th><th style="text-align:right;">Armadura</th></tr></thead><tbody>
    <tr><td>V1 (externa, tracción)</td><td style="text-align:right;">${fmt(r.V1.len, 2)}</td><td style="text-align:right;">${kg(r.V1.F)}</td><td style="text-align:right;">Fe ${fmt(r.V1.Fe, 2)}</td><td style="text-align:right;">${r.V1.n} Ø${d.edgeD}</td></tr>
    <tr><td>V2 (externa, tracción)</td><td style="text-align:right;">${fmt(r.V2.len, 2)}</td><td style="text-align:right;">${kg(r.V2.F)}</td><td style="text-align:right;">Fe ${fmt(r.V2.Fe, 2)}</td><td style="text-align:right;">${r.V2.n} Ø${d.edgeD}</td></tr>
    <tr><td>V3 (interna, compresión)</td><td style="text-align:right;">${fmt(r.V3.len, 2)}</td><td style="text-align:right;">${kg(r.V3.F)}</td><td style="text-align:right;">Fb ${fmt(r.V3.FbMin, 0)} a ${fmt(r.V3.FbMax, 0)}</td><td style="text-align:right;">${r.V3.n} Ø${d.edgeD}</td></tr>
    <tr><td>V4 (interna, compresión)</td><td style="text-align:right;">${fmt(r.V4.len, 2)}</td><td style="text-align:right;">${kg(r.V4.F)}</td><td style="text-align:right;">Fb ${fmt(r.V4.FbMin, 0)} a ${fmt(r.V4.FbMax, 0)}</td><td style="text-align:right;">${r.V4.n} Ø${d.edgeD}</td></tr></tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${r.advice.map(escapeHtml).join(' ')}</p></div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}${forces}</div></div>`;
}

function phMemoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design;
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Cáscara de paraboloide hiperbólico de hormigón armado, módulo de cuatro sectores', 'Guía de predimensionado E4 · 3.1')}${memoRow('Módulo', `${fmt(2 * r.b, 2)} × ${fmt(2 * r.a, 2)} m · desnivel ${fmt(r.h, 2)} m · espesor ${fmt(r.e, 0)} cm`)}${memoRow('Planta', `${r.plan.nx} × ${r.plan.ny} módulos = ${fmt(r.plan.total, 0)} m²`)}${memoRow('Carga de diseño', `peso propio ${kg(r.Pp)} + aislaciones ${kg(num(d.aisl))} + sobrecarga ${kg(num(d.sc))} + viento ${kg(num(d.vInc))} = ${kg(r.qSum)} → q = ${kg(r.q)} kg/m²`)}</table>
    ${phPlan(d)}<h2>2. Esfuerzos principales</h2><table>${memoRow('Parábola generatriz', `L = ${fmt(r.L, 2)} m · f = ${fmt(r.f, 2)} m (${fmt(r.ratio * 100, 1)} %)`)}${memoRow('H = (q / 2) L² / 8 f', `${kg(r.H)} kg por metro de ancho`)}${memoRow('σ = H / (e 100) · δ', `${fmt(r.sigC, 2)} · ${fmt(r.tau, 2)} kg/cm²`)}</table>${phSection(r)}
    <h2>3. Bordes y columna</h2><table>${memoRow('V1 · V2', `${kg(r.V1.F)} kg · ${kg(r.V2.F)} kg`)}${memoRow('V3 · V4', `${kg(r.V3.F)} kg · ${kg(r.V4.F)} kg`)}${memoRow('Columna central', `N = ${kg(r.col.N)} kg · ${fmt(r.col.side, 0)} × ${fmt(r.col.side, 0)} cm`)}</table>
    <h2>4. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>5. Resultado</h2><table>${memoRow('Cáscara', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(r.advice[0])}</p><p class="mem-foot">${escapeHtml(SHELL_NOTE)}</p>`;
  return { title: calc.name, sub: `Cáscara de paraboloide hiperbólico · ${r.plan.modules} módulos de ${fmt(2 * r.b, 1)} × ${fmt(2 * r.a, 1)} m`, html };
}

export const shellPHModule = {
  label: 'Cáscara de paraboloide hiperbólico',
  defaults() { return { design: phDefaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return phCompute(calc); },
  step1: phStep1, step2: phStep2, step3: phStep3, memoria: phMemoria,
};

// ================================================================= CÚPULA
const domeDefaults = () => ({ kind: 'dome', L: 25, f: 7, e: 6, gamma: 2400, aisl: 40, sc: 60, vInc: 20, qAdopt: 0, sigmaC: 50, sigmaS: 1200, rhoMin: 0.5, barD: 6, Eb: 240000, eta: 5, eEdge: 25, transition: 155, nCol: 20, beamSelf: 430, bBeam: 0.25, lBeam: 0, hBeam: 0, ringD: 16, sigmaB: 60, colD: 25 });

function domeCompute(calc) {
  const d = calc.design;
  const p = { L: num(d.L), f: num(d.f), e: num(d.e), gamma: num(d.gamma, 2400), aisl: num(d.aisl), sc: num(d.sc), vInc: num(d.vInc), qAdopt: num(d.qAdopt), sigmaC: num(d.sigmaC, 50), sigmaS: num(d.sigmaS, 1200), rhoMin: num(d.rhoMin, 0.5) / 100, barD: num(d.barD, 6), Eb: num(d.Eb, 240000), eta: num(d.eta, 5), eEdge: num(d.eEdge, 25), transition: num(d.transition, 155), nCol: num(d.nCol, 20), beamSelf: num(d.beamSelf, 430), bBeam: num(d.bBeam, 0.25), lBeam: num(d.lBeam), hBeam: num(d.hBeam), ringD: num(d.ringD, 16), sigmaB: num(d.sigmaB, 60), colD: num(d.colD, 25) };
  if (![p.L, p.f, p.e].every((v) => v > 0)) return { error: 'Completá el diámetro, la altura de la cúpula y el espesor con valores mayores que cero.' };
  if (p.f >= p.L / 2 + 1e-9) return { error: 'La altura de la cúpula no puede superar el radio de su planta (una semiesfera: f = L / 2).' };
  if (!(p.nCol >= 3)) return { error: 'Hacen falta al menos 3 columnas de apoyo.' };
  return { kind: 'dome', input: p, res: Sh.designDome(p) };
}

function domeStep1(calc) {
  const d = calc.design; const out = domeCompute(calc); const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Cúpula de generatriz circular</h3>${domeSection(d, r)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.L', 'Diámetro de la planta L', d.L, { unit: 'm', hint: 'Guía: 25 m.' })}${numField('design.f', 'Altura máxima f', d.f, { unit: 'm', hint: 'Guía: 7 m. Con f = L / 2 es una semiesfera.' })}</div>
      ${numField('design.e', 'Espesor de la cáscara', d.e, { unit: 'cm', hint: 'Guía: 6 cm.' })}
      <p class="text-muted" style="font-size:12px; margin:0;">${r ? `Radio de la generatriz R = (L² + 4 f²) / 8 f = ${fmt(r.R, 2)} m; ángulo de borde φ = ${fmt(r.phi0, 1)}° (cos φ = ${fmt(r.cos0, 2)}).` : ''}</p></div>
    <div class="card"><h3 style="margin-top:0;">Cargas</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.gamma', 'Peso del hormigón', d.gamma, { unit: 'kg/m³' })}${numField('design.aisl', 'Aislaciones e instalaciones', d.aisl, { unit: 'kg/m²', hint: 'Guía: 40.' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.sc', 'Sobrecarga accidental', d.sc, { unit: 'kg/m²', hint: 'Guía: 60.' })}${numField('design.vInc', 'Incremento por viento', d.vInc, { unit: 'kg/m²', hint: 'Hipótesis de la guía: 20.' })}</div>
      ${numField('design.qAdopt', 'Carga de diseño adoptada (0 = la suma)', d.qAdopt, { unit: 'kg/m²', hint: r ? `La suma da ${kg(r.qSum)} kg/m² (la guía: 264).` : '' })}
      <p class="text-muted" style="font-size:12px; margin:0;">Distribución uniforme y simétrica de la carga por metro cuadrado de cubierta.</p></div></div>
    <div class="note" style="margin-top:16px;">${SHELL_NOTE}</div>`;
}

function domeStep2(calc) {
  const out = domeCompute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  const rows = r.rows.map((x, i) => `<tr><td>${i + 1}</td><td style="text-align:right;">${fmt(x.y, 2)}</td><td style="text-align:right;">${fmt(x.cosPhi, 2)}</td><td style="text-align:right;">${fmt(x.phi, 2)}°</td><td style="text-align:right;">${fmt(x.Nm, 2)}</td><td style="text-align:right;${x.Np > 0 ? 'color:var(--warn); font-weight:600;' : ''}">${fmt(x.Np, 2)}</td></tr>`).join('');
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Esfuerzos principales (franjas de 1 m)</h3><table class="data-table"><tbody>
      <tr><td>Carga de diseño q (peso propio ${kg(r.Pp)} + aislaciones + sobrecarga + viento)</td><td style="text-align:right;"><b>${kg(r.q)} kg/m²</b></td></tr>
      <tr><td>R = (L² + 4 f²) / 8 f · cos φ0 = (R − f) / R</td><td style="text-align:right;">${fmt(r.R, 2)} m · ${fmt(r.cos0, 2)}</td></tr>
      <tr><td>Nm = −q R / (1 + cos φ): mínimo en la clave · máximo en el borde</td><td style="text-align:right;">${fmt(r.rows[0].Nm, 0)} · <b>${fmt(r.NmMax, 0)} kg/m</b></td></tr>
      <tr><td>Np = q R (−cos φ + 1 / (1 + cos φ)): en la clave · máximo en el borde</td><td style="text-align:right;">${fmt(r.rows[0].Np, 0)} · <b>${fmt(r.NpMax, 0)} kg/m</b></td></tr>
      <tr><td>Paralelo neutro (Np = 0): cos φ = (√5 − 1) / 2</td><td style="text-align:right;">φ = ${fmt(r.phiNeutral, 1)}°</td></tr></tbody></table>
      <h4 style="margin:10px 0 4px; font-size:13px;">Diagrama</h4>${domeDiagram(r)}</div>
    <div class="card"><h3 style="margin-top:0;">Valores intermedios (y cada metro desde la clave)</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Pos.</th><th style="text-align:right;">y (m)</th><th style="text-align:right;">cos φ</th><th style="text-align:right;">φ</th><th style="text-align:right;">Nm (kg/m)</th><th style="text-align:right;">Np (kg/m)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Con φ = 90° (semiesfera) el máximo en el meridiano es Nm = −q R y en el paralelo Np = q R.</p></div></div>`;
}

function domeStep3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design; const s = r.support;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaC', 'Compresión admisible del hormigón', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: 50.' })}${numField('design.sigmaS', 'Acero en tracción', d.sigmaS, { unit: 'kg/cm²', hint: 'Guía: 1200.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.rhoMin', 'Cuantía mínima para cúpulas', d.rhoMin, { unit: '%', hint: 'Guía: 0,5.' })}${selField('design.barD', 'Barras de la malla', d.barD, BAR_D.map((x) => [x, `Ø${x} mm`]))}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.Eb', 'Módulo del hormigón Eb', d.Eb, { unit: 'kg/cm²', hint: 'Guía: 240000.' })}${numField('design.eta', 'Coeficiente de seguridad al pandeo η', d.eta, { hint: 'La guía lo indica entre 4 y 5 y usa 5.' })}</div>
    <h4 style="margin:10px 0 4px; font-size:13px;">Apoyo: viga, anillo y columnas</h4>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.eEdge', 'Espesor máximo en el apoyo', d.eEdge, { unit: 'cm', hint: 'Guía: 25 cm, con pasaje gradual a 6 cm en 155 cm.' })}${numField('design.nCol', 'Cantidad de columnas', d.nCol, { step: 1, hint: 'Guía: 20.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.beamSelf', 'Peso propio de la viga y el engrosamiento', d.beamSelf, { unit: 'kg/m', hint: 'Guía: 430.' })}${numField('design.bBeam', 'Ancho de la viga', d.bBeam, { unit: 'm', hint: 'Guía: 0,25.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.lBeam', 'Luz de la viga (0 = 2 π Rp / columnas)', d.lBeam, { unit: 'm', hint: `Calculada: ${fmt(s.lBeam, 2)} m (la guía toma 4 m).` })}${numField('design.hBeam', 'Altura de la viga (0 = la necesaria)', d.hBeam, { unit: 'cm', hint: `Necesaria: ${fmt(Math.max(s.hNec, s.hMin), 1)} cm.` })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${selField('design.ringD', 'Barras del anillo', d.ringD, EDGE_D.map((x) => [x, `Ø${x} mm`]))}${numField('design.sigmaB', 'Compresión de la columna', d.sigmaB, { unit: 'kg/cm²', hint: 'Guía: 60 (H13, AB42, coeficiente 2,5).' })}</div>
    ${numField('design.colD', 'Diámetro de la columna circular', d.colD, { unit: 'cm', hint: 'Guía: 25 cm con 4 Ø12.' })}</div>`;
  const sup = `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Apoyo de la cáscara</h3><table class="data-table"><tbody>
    <tr><td>Esfuerzo del meridiano en el borde Nm</td><td style="text-align:right;">${kg(s.Nm)} kg/m</td></tr>
    <tr><td>NmH = Nm cos φ0 · NmV = Nm sen φ0</td><td style="text-align:right;">${fmt(s.NmH, 1)} · <b>${fmt(s.NmV, 1)} kg/m</b></td></tr>
    <tr><td>Anillo: T = NmH Rp (Rp = ${fmt(s.Rp, 2)} m)</td><td style="text-align:right;"><b>${kg(s.T)} kg</b> → ${s.nRing} Ø${d.ringD}</td></tr>
    <tr><td>Viga: carga · M = q l² / 10 · sección</td><td style="text-align:right;">${kg(s.wBeam)} kg/m · ${fmt(s.M, 2)} tm · ${fmt(s.b * 100, 0)} × ${fmt(s.hAdopt, 0)} cm</td></tr>
    <tr><td>Columna: N = q l · Fb</td><td style="text-align:right;">${kg(s.col.N)} kg · ${fmt(s.col.Fb, 0)} cm²</td></tr></tbody></table>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los apoyos deben diseñarse con cuidado para evitar las perturbaciones de borde: la viga recibe la cáscara con una junta constructiva que permite su libre deformación y se desarrolla el pasaje de ${fmt(s.eEdge, 0)} cm a ${fmt(num(d.e), 0)} cm en ${fmt(s.transition, 0)} cm. Esfuerzos de torsión y corte en vigas y momentos de torsión en las columnas quedan para el cálculo definitivo.</p></div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}${sup}</div></div>`;
}

function domeMemoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design; const s = r.support;
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Cúpula de generatriz circular de hormigón armado', 'Guía de predimensionado E4 · 3.2')}${memoRow('Diámetro · altura · espesor', `L = ${fmt(r.L, 2)} m · f = ${fmt(r.f, 2)} m · e = ${fmt(r.e, 0)} cm`)}${memoRow('Generatriz', `R = ${fmt(r.R, 2)} m · φ0 = ${fmt(r.phi0, 1)}° (cos φ0 = ${fmt(r.cos0, 2)})`)}${memoRow('Carga de diseño', `peso propio ${kg(r.Pp)} + aislaciones ${kg(num(d.aisl))} + sobrecarga ${kg(num(d.sc))} + viento ${kg(num(d.vInc))} = ${kg(r.qSum)} → q = ${kg(r.q)} kg/m²`)}</table>
    ${domeSection(d, r)}<h2>2. Esfuerzos principales (franjas de 1 m)</h2><table>${r.rows.map((x, i) => memoRow(`Posición ${i + 1} · y = ${fmt(x.y, 2)} m · φ = ${fmt(x.phi, 2)}°`, `Nm = ${fmt(x.Nm, 2)} · Np = ${fmt(x.Np, 2)} kg/m`)).join('')}${memoRow('Paralelo neutro', `φ = ${fmt(r.phiNeutral, 1)}°`)}</table>${domeDiagram(r)}
    <h2>3. Apoyo</h2><table>${memoRow('NmH · NmV', `${fmt(s.NmH, 1)} · ${fmt(s.NmV, 1)} kg/m`)}${memoRow('Anillo', `T = NmH Rp = ${kg(s.T)} kg → ${s.nRing} Ø${d.ringD}`)}${memoRow('Viga de apoyo', `${fmt(s.b * 100, 0)} × ${fmt(s.hAdopt, 0)} cm · M = ${fmt(s.M, 2)} tm · Fe = ${fmt(s.FeBeam, 2)} cm²`)}${memoRow('Columnas', `${fmt(s.nCol, 0)} de ø ${fmt(s.col.Dadopt, 0)} cm · N = ${kg(s.col.N)} kg`)}</table>
    <h2>4. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>5. Resultado</h2><table>${memoRow('Cúpula', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(SHELL_NOTE)}</p>`;
  return { title: calc.name, sub: `Cúpula · L = ${fmt(r.L, 1)} m, f = ${fmt(r.f, 1)} m`, html };
}

export const domeModule = {
  label: 'Cúpula de hormigón armado',
  defaults() { return { design: domeDefaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return domeCompute(calc); },
  step1: domeStep1, step2: domeStep2, step3: domeStep3, memoria: domeMemoria,
};
