// Grandes luces de compresión dominante: cubierta cilíndrica de onda parabólica (cerámica armada u otro material). Motor en js/structural/compression.js.
// FUENTE: guía de predimensionado 2.1 "Compresión dominante" del Taller de Estructuras E4 (curso 2024).
import * as K from '../structural/compression.js';
import * as C from '../structural/cables.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';

const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
export const COMP_NOTE = 'Predimensionado según la guía 2.1 de Compresión dominante del Taller de Estructuras E4 (2024): arco de tres articulaciones (apoyos A y B y clave C), línea de presiones del peso propio y del viento comparada con el eje de la onda, núcleo central (e ≤ h/6), compresión, pandeo y flexocompresión. La guía lo resuelve con el método gráfico de cambio de polo; acá se resuelve el mismo arco por equilibrio y los números difieren unos pocos por ciento. El viento se simplifica con cargas verticales y el material (cerámica armada: 1800 kg/m³, 10 kg/cm², E = 100000 kg/cm²) son datos de la guía. Herramienta de apoyo para el predimensionado.';
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

function defaultsFor() {
  return {
    kind: 'shell', L: 30, f: 7.5, dxT: 3,
    b: 0.5, bp: 0.5, H: 1.0, d: 0.12, Jover: 0,
    gamma: 1800, sigmaAdm: 10, E: 100000, betaPandeo: 2,
    pw: 20, windSide: 'left',
    ref: 'yes', rb: 0.4, rbp: 0.6, rH: 1.45, rd: 0.10, rJover: 0,
    tensor: 'yes', catalog: 'guide',
    windV: 45, windKd: 0.85, windKzt: 1, windI: 1, windKz: 0.39, windG: 0.85, windCp: 0.36, windGCpi: 0.18,
  };
}

function windSuggestion(d) {
  const qh = 0.613 * num(d.windV) ** 2 * num(d.windKd) * num(d.windKzt) * num(d.windI) * num(d.windKz);        // N/m²
  const p = qh * (num(d.windG) * Math.abs(num(d.windCp)) + Math.abs(num(d.windGCpi)));                         // guía: mismo valor a barlovento (presión) y a sotavento (succión)
  return { qh, pN: p, pKg: p / 10 };
}

function paramsOf(calc) {
  const d = calc.design;
  return { L: num(d.L), f: num(d.f), dxT: num(d.dxT, 3), gamma: num(d.gamma, 1800), pw: num(d.pw), sigmaAdm: num(d.sigmaAdm, 10), E: num(d.E, 100000), betaPandeo: num(d.betaPandeo, 2), windSide: d.windSide === 'right' ? 'right' : 'left',
    onda: { b: num(d.b), bp: num(d.bp), H: num(d.H), d: num(d.d), Jover: num(d.Jover) },
    reforzada: d.ref === 'yes' ? { b: num(d.rb), bp: num(d.rbp), H: num(d.rH), d: num(d.rd), Jover: num(d.rJover) } : null };
}

function compute(calc) {
  const p = paramsOf(calc);
  const o = p.onda;
  if (![p.L, p.f, p.gamma, o.b, o.bp, o.H, o.d].every((v) => v > 0)) return { error: 'Completá la luz, la flecha, el peso específico y las medidas de la onda con valores mayores que cero.' };
  const fl = p.f / p.L;
  if (fl < 0.1 || fl > 0.5) return { error: 'La flecha tiene que estar entre el 10 % y el 50 % de la luz (la guía recomienda entre el 25 % y el 35 %).' };
  if (o.d >= o.H) return { error: 'El espesor de la onda tiene que ser menor que su altura.' };
  if (p.reforzada && ![p.reforzada.b, p.reforzada.bp, p.reforzada.H, p.reforzada.d].every((v) => v > 0)) return { error: 'Completá las medidas de la onda reforzada o desactivala.' };
  const res = K.designCylinderShell(p);
  let tensor = null;
  if (calc.design.tensor !== 'no') tensor = C.selectCable(calc.design.catalog || 'guide', res.support.H * 2, 1);
  return { kind: 'shell', input: p, res, tensor };
}

// ---------------------------------------------------------------- figuras
function elevationFigure(res) {
  const L = res.L; const f = res.f;
  const W = 560; const H = 230;
  const k = Math.min(440 / L, 120 / f);
  const x0 = 60; const yb = 175;
  const X = (u) => x0 + u * k;
  const Y = (z) => yb - z * k;
  const axis = Array.from({ length: 61 }, (_, i) => { const u = L * i / 60; return `${X(u)},${Y(f - K.depthBelowCrown(u, L, f))}`; }).join(' ');
  let s = `<polyline points="${axis}" fill="none" stroke="var(--ink)" stroke-width="3"/>`;
  res.tramos.forEach((t) => { s += `<line x1="${X(t.u1)}" y1="${Y(f - K.depthBelowCrown(t.u1, L, f))}" x2="${X(t.u1)}" y2="${Y(f - K.depthBelowCrown(t.u1, L, f)) - 18}" stroke="var(--accent)" stroke-width="1"/>`; });
  [['A', 0], ['B', L]].forEach(([n, u]) => { s += `<path d="M ${X(u)} ${yb + 2} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><text x="${X(u)}" y="${yb + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent-ink)">${n}</text>`; });
  s += `<circle cx="${X(L / 2)}" cy="${Y(f)}" r="4.5" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><text x="${X(L / 2)}" y="${Y(f) - 10}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent-ink)">C</text>`;
  s += `<line x1="${X(0)}" y1="${yb + 40}" x2="${X(L)}" y2="${yb + 40}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${yb + 54}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m</text>`;
  s += `<line x1="${X(L / 2)}" y1="${Y(f) + 6}" x2="${X(L / 2)}" y2="${Y(0)}" stroke="var(--accent)" stroke-dasharray="3 3"/><text x="${X(L / 2) + 6}" y="${(Y(0) + Y(f)) / 2 + 20}" font-size="12" font-weight="600" fill="var(--accent-ink)">f = ${fmt(f, 2)} m</text>`;
  s += `<text x="8" y="16" font-size="11" fill="var(--ink-soft)">Eje parabólico de la onda, tramos de ${fmt(res.dxT, 1)} m en planta (p = ${fmt(res.p, 2)})</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Elevación del arco">${s}</svg>`;
}

function ondaFigure(on, title = 'Corte de la onda') {
  const W = 560; const Hh = 150;
  const B = on.B; const k = Math.min(420 / (2 * B), 90 / on.H);
  const x0 = 40; const yt = 30;
  const X = (m) => x0 + m * k; const Y = (m) => yt + m * k;
  // dos ondas: plano superior b/2 | inclinado b' | inferior b | inclinado b' | superior b/2 (se repite)
  const pts = [];
  let x = 0;
  const addTop = (w) => { pts.push([x, 0]); x += w; pts.push([x, 0]); };
  const addBot = (w) => { pts.push([x, on.H]); x += w; pts.push([x, on.H]); };
  const slopeDown = () => { pts.push([x, 0]); x += on.bp; pts.push([x, on.H]); };
  const slopeUp = () => { pts.push([x, on.H]); x += on.bp; pts.push([x, 0]); };
  for (let i = 0; i < 2; i++) { addTop(on.b / 2); slopeDown(); addBot(on.b); slopeUp(); addTop(on.b / 2); }
  const d = pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
  let s = `<polyline points="${d}" fill="none" stroke="var(--ink)" stroke-width="${Math.min(7, Math.max(2.5, on.d * k * 0.35))}" stroke-linejoin="miter"/>`;
  s += `<line x1="${X(2 * B) + 14}" y1="${Y(0)}" x2="${X(2 * B) + 14}" y2="${Y(on.H)}" stroke="var(--accent)"/><text x="${X(2 * B) + 20}" y="${(Y(0) + Y(on.H)) / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">H = ${fmt(on.H, 2)} m</text>`;
  s += `<line x1="${X(0)}" y1="${Y(on.H) + 16}" x2="${X(B)}" y2="${Y(on.H) + 16}" stroke="var(--accent)"/><text x="${X(B / 2)}" y="${Y(on.H) + 31}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">B = ${fmt(B, 2)} m (b = ${fmt(on.b, 2)}, b′ = ${fmt(on.bp, 2)}, d = ${fmt(on.d, 2)})</text>`;
  s += `<text x="8" y="16" font-size="11" fill="var(--ink-soft)">${escapeHtml(title)}</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="${escapeHtml(title)}">${s}</svg>`;
}

function eccentricityChart(res) {
  const W = 560; const H = 210;
  const L = res.L;
  const vals = [...res.sPp.sections, ...res.sPW.sections].map((s) => Math.abs(s.e) * 100);
  const emax = Math.max(res.kern * 100 * 1.4, ...vals) * 1.1;
  const x0 = 50; const x1 = 540; const yc = 105; const kx = (x1 - x0) / L; const ky = 80 / emax;
  const X = (u) => x0 + u * kx; const Y = (e) => yc - e * ky;
  let s = `<rect x="${x0}" y="${Y(res.kern * 100)}" width="${x1 - x0}" height="${2 * res.kern * 100 * ky}" fill="var(--good-soft)" stroke="none"/>`;
  s += `<line x1="${x0}" y1="${yc}" x2="${x1}" y2="${yc}" stroke="var(--ink-soft)"/>`;
  const line = (state, color) => `<polyline points="${state.sections.map((q) => `${X(q.u)},${Y(q.e * 100)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
  s += line(res.sPp, 'var(--accent)') + line(res.sPW, 'var(--warn)');
  s += `<text x="${x1}" y="${Y(res.kern * 100) - 4}" text-anchor="end" font-size="11" fill="var(--good)">núcleo central ±h/6 = ±${fmt(res.kern * 100, 1)} cm</text>`;
  s += `<text x="${x0}" y="${H - 28}" font-size="11.5" fill="var(--accent-ink)">— peso propio</text><text x="${x0 + 110}" y="${H - 28}" font-size="11.5" fill="var(--warn)">— peso propio + viento (barlovento a la izquierda)</text>`;
  s += `<text x="${x0}" y="${H - 8}" font-size="11" fill="var(--ink-soft)">Excentricidad e de la línea de presiones respecto del eje (cm), a lo largo de la luz (m)</text>`;
  [0, L / 2, L].forEach((u) => { s += `<text x="${X(u)}" y="${yc + 14}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">${fmt(u, 1)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Excentricidades">${s}</svg>`;
}

// ---------------------------------------------------------------- pantallas
function windCard(d) {
  const w = windSuggestion(d);
  return `<div class="card"><h3 style="margin-top:0;">Viento (ayuda de cálculo)</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.windV', 'Velocidad básica V', d.windV, { unit: 'm/s', hint: 'CIRSOC 102-2005.' })}${numField('design.windKz', 'Kz', d.windKz, { hint: 'Guía: 0,39 (exposición A).' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.windKd', 'Kd', d.windKd)}${numField('design.windKzt', 'Kzt', d.windKzt)}${numField('design.windI', 'I', d.windI)}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.windG', 'G', d.windG)}${numField('design.windCp', 'Cp (valor medio)', d.windCp, { hint: 'Guía: ± 0,36 en barlovento y sotavento.' })}${numField('design.windGCpi', 'GCpi', d.windGCpi, { hint: 'Guía: ± 0,18.' })}</div>
    <p class="text-muted" style="font-size:12.5px; margin:0;">qh = 0,613 V² Kd Kzt I Kz = <b>${fmt(w.qh, 0)} N/m²</b>; p = qh (G Cp ± GCpi) = <b>${fmt(w.pN, 0)} N/m² ≈ ${fmt(w.pKg, 1)} kg/m²</b> (1 kg = 10 N): presión a barlovento y succión de igual valor a sotavento (la guía adopta 20 kg/m²).</p></div>`;
}

function onda(res) { return res.on; }

function step1(calc) {
  const d = calc.design;
  const out = compute(calc);
  const on = out.res ? onda(out.res) : null;
  const fig = out.res ? elevationFigure(out.res) : '';
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Cubierta cilíndrica de onda parabólica</h3>${fig}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.L', 'Luz libre L', d.L, { unit: 'm' })}${numField('design.f', 'Flecha f', d.f, { unit: 'm', hint: `f / L = ${fmt(num(d.f) / num(d.L, 1), 2)}. Recomendado: 25 a 35 % (limita las componentes horizontales).` })}</div>
      ${numField('design.dxT', 'Ancho en planta de cada tramo de carga', d.dxT, { unit: 'm', hint: 'La guía divide la curva en tramos de 3 m.' })}
      <p class="text-muted" style="font-size:12.5px; margin:0;">Parámetro de la parábola p = (L/2)² / 2f = <b>${fmt(num(d.L) ** 2 / 4 / (2 * num(d.f, 1)), 2)}</b>; y = x² / 2p medido desde la clave. Se supone un sistema biarticulado (cambio de tecnología en el apoyo) y una articulación en la clave por la deformación del viento.</p></div>
    <div class="card"><h3 style="margin-top:0;">Onda y material</h3>
      ${on ? ondaFigure(on) : ''}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.b', 'b (planos horizontales)', d.b, { unit: 'm' })}${numField('design.bp', "b′ (proyección de los planos inclinados)", d.bp, { unit: 'm' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.H', 'Altura de la onda H', d.H, { unit: 'm' })}${numField('design.d', 'Espesor d', d.d, { unit: 'm', hint: 'Cerámica armada: ladrillo de máquina, mortero y armadura Φ6 en las juntas.' })}</div>
      ${on ? `<table class="data-table"><tbody>
        <tr><td>Ancho de onda B = 2 (b + b′)</td><td style="text-align:right;">${fmt(on.B, 2)} m</td></tr>
        <tr><td>Plano inclinado c = √(b′² + (H − d)²)</td><td style="text-align:right;">${fmt(on.c, 3)} m</td></tr>
        <tr><td>Desarrollo de la onda 2b + 2c · volumen por metro (× d)</td><td style="text-align:right;">${fmt(on.desarrollo, 2)} m · ${fmt(on.F, 3)} m³</td></tr>
        <tr><td>Peso por metro de onda (γ × volumen)</td><td style="text-align:right;"><b>${fmt(on.pesoM, 0)} kg/m</b></td></tr>
        <tr><td>Inercia J: alas ${fmt(on.Jalas, 4)} + alma ${fmt(on.Jalma, 4)} (la guía da 0,0234 + 0,0101)</td><td style="text-align:right;">${fmt(on.Jcalc, 4)} m⁴</td></tr></tbody></table>` : ''}
      <div class="field-row" style="flex-wrap:wrap; margin-top:10px;">${numField('design.gamma', 'Peso específico del material', d.gamma, { unit: 'kg/m³', hint: 'Mampostería: 1800 (guía).' })}${numField('design.Jover', 'Inercia propia J (opcional)', d.Jover, { unit: 'm⁴', hint: '0 = la calculada con la geometría.' })}</div>
    </div></div>
    <div class="grid grid-2" style="align-items:start; margin-top:16px;">
      <div class="card"><h3 style="margin-top:0;">Viento sobre la cubierta</h3>
        ${numField('design.pw', 'Presión a barlovento (y succión a sotavento)', d.pw, { unit: 'kg/m²', hint: 'Guía: 20 kg/m². Se multiplica por el desarrollo de la onda (≈ 3 m): 60 kg por metro de curva.' })}
        ${selField('design.windSide', 'Barlovento', d.windSide === 'right' ? 'right' : 'left', [['left', 'Del lado del apoyo A (izquierda)'], ['right', 'Del lado del apoyo B (derecha)']])}</div>
      ${windCard(d)}</div>
    <div class="note" style="margin-top:16px;">${COMP_NOTE}</div>`;
}

function step2(calc) {
  const out = compute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  const rows = r.tramos.map((t) => `<tr><td>${t.i}</td><td style="text-align:right;">${fmt(t.u1, 1)} a ${fmt(t.u2, 1)}</td><td style="text-align:right;">${fmt(t.len, 2)}</td><td style="text-align:right;">${kg(t.Pp)}</td><td style="text-align:right;">${t.W > 0 ? '+' : ''}${kg(t.W)}</td><td style="text-align:right;"><b>${kg(t.PpW)}</b></td></tr>`).join('');
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Cargas por tramo</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Tramo</th><th style="text-align:right;">x (m)</th><th style="text-align:right;">Largo (m)</th><th style="text-align:right;">Pp (kg)</th><th style="text-align:right;">Viento (kg)</th><th style="text-align:right;">Pp + V (kg)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Peso propio = largo del tramo × ${fmt(r.on.pesoM, 0)} kg/m; viento = presión × desarrollo (${fmt(r.on.desarrollo, 2)} m) × largo, hacia abajo a barlovento y hacia arriba a sotavento (simplificación de la guía).</p></div>
    <div class="card"><h3 style="margin-top:0;">Reacciones y predimensionado</h3><table class="data-table"><tbody>
      <tr><td>Peso propio: V = ${kg(r.sPp.VA)} kg, H = ${kg(r.sPp.H)} kg</td><td style="text-align:right;">Ra = Rb = <b>${kg(r.sPp.RA)} kg</b></td></tr>
      <tr><td>Peso propio y viento: V<sub>A</sub> = ${kg(r.sPW.VA)}, V<sub>B</sub> = ${kg(r.sPW.VB)}, H = ${kg(r.sPW.H)} kg</td><td style="text-align:right;">Ra = <b>${kg(r.sPW.RA)}</b>, Rb = ${kg(r.sPW.RB)} kg</td></tr>
      <tr><td>Compresión máxima Ra · tensión σ = Ra / F</td><td style="text-align:right;">${kg(r.Ra)} kg · ${fmt(r.sigmaC, 2)} kg/cm²</td></tr>
      <tr><td>Inercia necesaria por pandeo: Pk = 2 Ra, Lp = semiarco (${kg(r.Lp)} cm)</td><td style="text-align:right;">${kg(r.Jnec)} cm⁴</td></tr>
      <tr><td>Excentricidad máxima con el peso propio · núcleo central h/6</td><td style="text-align:right;">${fmt(Math.abs(r.sPp.emax.e) * 100, 1)} cm · ${fmt(r.kern * 100, 1)} cm</td></tr>
      <tr><td>Excentricidad máxima con viento (en x = ${fmt(r.sPW.emax.u, 1)} m)</td><td style="text-align:right;"><b>${fmt(Math.abs(r.sPW.emax.e) * 100, 1)} cm</b></td></tr>
      <tr><td>Altura de onda para que e ≤ h/6 (h ≥ 6 e)</td><td style="text-align:right;">${fmt(r.Hnec * 100, 0)} cm</td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Si la excentricidad con el viento sale del núcleo central, la guía refuerza la onda solo cerca de la zona de máxima excentricidad (o rediseña toda la sección): se verifica en el paso 3.</p></div></div>`;
}

function dataCard(calc) {
  const d = calc.design;
  const yes = d.ref === 'yes';
  return `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaAdm', 'Tensión admisible del material', d.sigmaAdm, { unit: 'kg/cm²', hint: 'Cerámica armada: 10 (guía).' })}${numField('design.E', 'Módulo de elasticidad E', d.E, { unit: 'kg/cm²', hint: 'Guía: 100000.' })}</div>
    ${numField('design.betaPandeo', 'Coeficiente de seguridad al pandeo', d.betaPandeo, { hint: 'Pk = coeficiente × Ra (guía: 2).' })}
    ${selField('design.ref', 'Onda reforzada en la zona de mayor excentricidad', yes ? 'yes' : 'no', [['yes', 'Sí: otra altura y espesor en esa zona'], ['no', 'No: se verifica con la onda inicial']], 'La guía aumenta la altura y reduce el espesor del ladrillo: peso similar con más inercia.')}
    ${yes ? `<div class="field-row" style="flex-wrap:wrap;">${numField('design.rb', 'b', d.rb, { unit: 'm' })}${numField('design.rbp', "b′", d.rbp, { unit: 'm' })}${numField('design.rH', 'H', d.rH, { unit: 'm' })}${numField('design.rd', 'd', d.rd, { unit: 'm' })}</div>
      ${numField('design.rJover', 'Inercia propia J de la onda reforzada (opcional)', d.rJover, { unit: 'm⁴', hint: '0 = calculada. La guía da J = 0,0721 m⁴.' })}` : ''}
    ${selField('design.tensor', 'Tensor para la componente horizontal', d.tensor === 'no' ? 'no' : 'yes', [['yes', 'Sí: cable'], ['no', 'No (la absorbe un contrafuerte)']])}
    ${d.tensor === 'no' ? '' : selField('design.catalog', 'Tabla de cables', d.catalog || 'guide', C.CABLE_CATALOGS)}</div>`;
}

function resultsHtml(calc, out) {
  const r = out.res;
  const checks = r.checks;
  const ok = r.ok;
  const stateRows = `<tr><td>Peso propio</td><td style="text-align:right;">${kg(r.sPp.VA)}</td><td style="text-align:right;">${kg(r.sPp.VB)}</td><td style="text-align:right;">${kg(r.sPp.H)}</td><td style="text-align:right;">${kg(r.sPp.RA)}</td><td style="text-align:right;">${kg(r.sPp.RB)}</td></tr>
    <tr><td>Peso propio + viento</td><td style="text-align:right;">${kg(r.sPW.VA)}</td><td style="text-align:right;">${kg(r.sPW.VB)}</td><td style="text-align:right;">${kg(r.sPW.H)}</td><td style="text-align:right;"><b>${kg(r.sPW.RA)}</b></td><td style="text-align:right;">${kg(r.sPW.RB)}</td></tr>`;
  const sec = r.sPp.sections.map((s, i) => { const w = r.sPW.sections[i]; return `<tr><td style="text-align:right;">${fmt(s.u, 1)}</td><td style="text-align:right;">${fmt(s.y, 2)}</td><td style="text-align:right;">${fmt(s.e * 100, 1)}</td><td style="text-align:right;">${kg(s.N)}</td><td style="text-align:right;${Math.abs(w.e) > r.kern ? 'color:var(--bad);' : ''}">${fmt(w.e * 100, 1)}</td><td style="text-align:right;">${kg(w.N)}</td></tr>`; }).join('');
  const sup = r.support;
  const tens = out.tensor
    ? `<tr><td>Tensor de la componente horizontal: T = H × β2 (2) = ${kg(sup.H * 2)} kg</td><td style="text-align:right;">${out.tensor.cable ? `cable ø ${fmt(out.tensor.cable.d, out.tensor.cable.d % 1 ? 1 : 0)} mm (rotura ${kg(out.tensor.cable.F)} kg)` : 'ninguno de la tabla alcanza'}</td></tr>` : '';
  const checksAll = [...checks];
  if (out.tensor) checksAll.push({ ok: out.tensor.ok, label: 'Tensor de apoyo', text: `H = ${kg(sup.H)} kg × 2 = ${kg(sup.H * 2)} kg → ${out.tensor.cable ? `ø ${fmt(out.tensor.cable.d, out.tensor.cable.d % 1 ? 1 : 0)} mm (${kg(out.tensor.cable.F)} kg)` : 'ninguno alcanza'}` });
  const allOk = checksAll.every((c) => c.ok);
  return `<div class="grid grid-2" style="align-items:start;"><div>
      ${dataCard(calc)}
      <div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Reacciones</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Estado</th><th style="text-align:right;">V<sub>A</sub></th><th style="text-align:right;">V<sub>B</sub></th><th style="text-align:right;">H</th><th style="text-align:right;">Ra</th><th style="text-align:right;">Rb</th></tr></thead><tbody>${stateRows}</tbody></table></div>
        <table class="data-table" style="margin-top:8px;"><tbody><tr><td>Apoyo ${sup.side} (el más cargado): componente vertical · horizontal</td><td style="text-align:right;">${kg(sup.V)} · ${kg(sup.H)} kg</td></tr>${tens}</tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">El contrafuerte de hormigón sobre pilotes o bases centradas y el tensor tomando la horizontal (guía, apoyos): se dimensionan aparte.</p></div></div>
    <div>${checksCard({ ok: allOk, checks: checksAll })}
      <div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Excentricidad de la línea de presiones</h3>${eccentricityChart(r)}
        <div class="table-wrap" style="margin-top:8px;"><table class="data-table"><thead><tr><th style="text-align:right;">x (m)</th><th style="text-align:right;">y (m)</th><th style="text-align:right;">e Pp (cm)</th><th style="text-align:right;">R Pp (kg)</th><th style="text-align:right;">e Pp+V (cm)</th><th style="text-align:right;">R Pp+V (kg)</th></tr></thead><tbody>${sec}</tbody></table></div>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">x desde el apoyo A; y = profundidad del eje bajo la clave. La guía mide a escala la excentricidad de 24 cm a 9 m del apoyo; acá se calcula con las cargas repartidas en cada tramo.</p></div>
      ${ondaFigureCard(r)}</div></div>`;
}

function ondaFigureCard(r) {
  return `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Onda</h3>${ondaFigure(r.on, 'Onda inicial')}${r.hasRef ? ondaFigure(r.onR, 'Onda reforzada (zona de mayor excentricidad)') : ''}</div>`;
}

export const compModule = {
  label: 'Estructura de grandes luces de compresión dominante',
  defaults() { return { design: defaultsFor(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return compute(calc); },
  step1(calc) { return step1(calc); },
  step2(calc) { return step2(calc); },
  step3(calc, out) {
    if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
    return resultsHtml(calc, out);
  },
  memoria(calc, out) { return memoria(calc, out); },
};

function memoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res;
  const d = calc.design;
  const w = windSuggestion(d);
  const checks = [...r.checks];
  if (out.tensor) checks.push({ ok: out.tensor.ok, label: 'Tensor de apoyo', text: `H = ${kg(r.support.H)} kg × 2 → ${out.tensor.cable ? `cable ø ${fmt(out.tensor.cable.d, out.tensor.cable.d % 1 ? 1 : 0)} mm (rotura ${kg(out.tensor.cable.F)} kg)` : 'ninguno de la tabla alcanza'}` });
  const ok = checks.every((c) => c.ok);
  const ART = 'Guía de predimensionado E4 · Compresión dominante';
  const tr = r.tramos.map((t) => memoRow(`Tramo ${t.i}: x = ${fmt(t.u1, 1)} a ${fmt(t.u2, 1)} m, largo ${fmt(t.len, 2)} m`, `Pp = ${kg(t.Pp)} · V = ${t.W > 0 ? '+' : ''}${kg(t.W)} · Pp + V = ${kg(t.PpW)} kg`)).join('');
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Cubierta cilíndrica de onda parabólica, arco de tres articulaciones', ART)}${memoRow('Luz · flecha', `L = ${fmt(d.L, 2)} m · f = ${fmt(d.f, 2)} m (f/L = ${fmt(d.f / d.L, 2)}); p = ${fmt(r.p, 2)}`)}
      ${memoRow('Onda', `b = ${fmt(d.b, 2)}, b′ = ${fmt(d.bp, 2)}, H = ${fmt(d.H, 2)}, d = ${fmt(d.d, 2)} m; B = ${fmt(r.on.B, 2)} m, desarrollo ${fmt(r.on.desarrollo, 2)} m, volumen ${fmt(r.on.F, 3)} m³/m`)}
      ${memoRow('Peso propio por metro de onda', `${fmt(r.gamma, 0)} kg/m³ × ${fmt(r.on.F, 3)} m³ = ${fmt(r.on.pesoM, 0)} kg/m`)}${memoRow('Inercia de la onda', `J = ${fmt(r.on.J, 4)} m⁴ (alas ${fmt(r.on.Jalas, 4)} + alma ${fmt(r.on.Jalma, 4)})`)}
      ${memoRow('Viento (CIRSOC 102-2005)', `qh = ${fmt(w.qh, 0)} N/m²; p = ${fmt(d.pw, 1)} kg/m² a barlovento y sotavento (guía 20 kg/m²; con los datos cargados ≈ ${fmt(w.pKg, 1)} kg/m²)`)}</table>
    ${elevationFigure(r)}
    <h2>2. Cargas por tramo</h2><table>${tr}</table>
    <h2>3. Reacciones y línea de presiones</h2><table>${memoRow('Peso propio', `V = ${kg(r.sPp.VA)}, H = ${kg(r.sPp.H)}, Ra = Rb = ${kg(r.sPp.RA)} kg`, 'H = (V L/2 − Σ P (L/2 − x)) / f')}${memoRow('Peso propio + viento', `V<sub>A</sub> = ${kg(r.sPW.VA)}, V<sub>B</sub> = ${kg(r.sPW.VB)}, H = ${kg(r.sPW.H)}; Ra = ${kg(r.sPW.RA)}, Rb = ${kg(r.sPW.RB)} kg`)}
      ${memoRow('Excentricidad máxima (peso propio · con viento)', `${fmt(Math.abs(r.sPp.emax.e) * 100, 1)} cm · ${fmt(Math.abs(r.sPW.emax.e) * 100, 1)} cm (h/6 = ${fmt(r.kern * 100, 1)} cm)`)}</table>
    ${eccentricityChart(r)}
    <h2>4. Verificaciones</h2><table>${checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    ${ondaFigure(r.on, 'Onda inicial')}${r.hasRef ? ondaFigure(r.onR, 'Onda reforzada') : ''}
    <h2>5. Resultado</h2><table>${memoRow('Estructura', ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(COMP_NOTE)}</p>`;
  return { title: calc.name, sub: `Compresión dominante · L = ${fmt(d.L, 1)} m, f = ${fmt(d.f, 1)} m`, html };
}
