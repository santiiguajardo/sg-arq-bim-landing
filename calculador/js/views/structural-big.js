// Grandes luces: vigas de gran inercia (Vierendeel de hormigón armado o de acero, y viga postesada de hormigón). Motor en js/structural/big-beams.js.
// FUENTE: guías 6.1 y 6.2 del Taller de Estructuras E4 (curso 2024).
import * as B from '../structural/big-beams.js';
import * as C from '../structural/cables.js';
import * as S from '../structural/steel.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';

const kg = (v) => fmt(v, 0);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
export const BIG_NOTE = 'Predimensionado según las guías 6.1 (Vierendeel) y 6.2 (postesadas) del Taller de Estructuras E4 (2024): viga simplemente apoyada, cordones con C = T = M / (0,9 H), montantes al corte, pandeo del cordón comprimido, armadura o perfil del cordón traccionado y flecha con la inercia de los cordones (L/500). No se verifican los momentos locales de los cordones y los montantes entre nudos (flexión Vierendeel), los nudos, la fisuración ni las pérdidas de postesado. Herramienta de apoyo para el predimensionado.';

const LOAD_FIELDS = (d, selfHint) => `<div class="field-row" style="flex-wrap:wrap;">${numField('design.floorD', 'Entrepiso: permanentes', d.floorD, { unit: 'kg/m' })}${numField('design.floorL', 'Entrepiso: accidentales', d.floorL, { unit: 'kg/m' })}</div>
  <div class="field-row" style="flex-wrap:wrap;">${numField('design.roofD', 'Cubierta: permanentes', d.roofD, { unit: 'kg/m' })}${numField('design.roofL', 'Cubierta: accidentales', d.roofL, { unit: 'kg/m' })}</div>
  ${numField('design.self', 'Peso propio de la viga', d.self, { unit: 'kg/m', hint: selfHint })}
  <p class="text-muted" style="font-size:12px; margin:0;">Cargas por metro de viga (ya con el ancho de influencia): total q = <b>${kg(B.loadsTotal(d))} kg/m</b>.</p>`;

// ---------------------------------------------------------------- figuras
function vierFigure(d) {
  const L = num(d.L, 30); const H = num(d.H, 4); const a = Math.max(num(d.a, 4), 0.5);
  const W = 560; const Hh = 190;
  const k = Math.min(400 / L, 80 / H);
  const x0 = 100; const yT = 40; const yB = yT + H * k;
  const X = (m) => x0 + m * k;
  const n = Math.max(1, Math.round(L / a));
  let s = `<rect x="${X(0)}" y="${yT}" width="${L * k}" height="${H * k}" fill="none" stroke="var(--ink)" stroke-width="1.2"/>`;
  s += `<line x1="${X(0)}" y1="${yT}" x2="${X(L)}" y2="${yT}" stroke="var(--ink)" stroke-width="5"/><line x1="${X(0)}" y1="${yB}" x2="${X(L)}" y2="${yB}" stroke="var(--ink)" stroke-width="5"/>`;
  for (let i = 0; i <= n; i++) { const x = X(Math.min(L, i * L / n)); s += `<line x1="${x}" y1="${yT}" x2="${x}" y2="${yB}" stroke="var(--ink)" stroke-width="3"/>`; }
  s += `<path d="M ${X(0)} ${yB + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><path d="M ${X(L)} ${yB + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<line x1="${X(0)}" y1="${yB + 30}" x2="${X(L)}" y2="${yB + 30}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${yB + 45}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m</text>`;
  s += `<line x1="${X(0) - 14}" y1="${yT}" x2="${X(0) - 14}" y2="${yB}" stroke="var(--accent)"/><text x="${X(0) - 18}" y="${(yT + yB) / 2 + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--accent-ink)">H = ${fmt(H, 2)} m</text>`;
  s += `<text x="${X(0.5 * a)}" y="${yT - 8}" font-size="11" fill="var(--ink-soft)">a = ${fmt(a, 2)} m entre nudos (${n} tramos)</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Viga Vierendeel">${s}</svg>`;
}

function postFigure(d) {
  const L = num(d.L, 30); const f = num(d.f, 0.85); const h = num(d.h, 200) / 100;
  const W = 560; const Hh = 190;
  const k = Math.min(440 / L, 70 / Math.max(h, f * 3));
  const x0 = 50; const yT = 40;
  const X = (m) => x0 + m * k;
  let s = `<rect x="${X(0)}" y="${yT}" width="${L * k}" height="${h * k}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/>`;
  const yEnd = yT + h * k / 2 - f * k / 2;
  const drape = Array.from({ length: 41 }, (_, i) => { const x = L * i / 40; return `${X(x)},${yEnd + f * k * 4 * x * (L - x) / (L * L)}`; }).join(' ');
  s += `<polyline points="${drape}" fill="none" stroke="var(--warn)" stroke-width="2.4"/>`;
  s += `<path d="M ${X(0)} ${yT + h * k + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><path d="M ${X(L)} ${yT + h * k + 4} l -8 13 h 16 z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<line x1="${X(0)}" y1="${yT + h * k + 30}" x2="${X(L)}" y2="${yT + h * k + 30}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${yT + h * k + 45}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m</text>`;
  s += `<text x="${X(L / 2)}" y="${yT - 8}" text-anchor="middle" font-size="11.5" fill="var(--warn)">cable de postesado, flecha f = ${fmt(f, 2)} m (H del cable = q L² / 8 f)</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Viga postesada">${s}</svg>`;
}

function hollowFigure(sect) {
  const { b1, h1, b2, h2 } = sect;
  const W = 280; const H = 170;
  const k = Math.min(140 / h1, 190 / b1);
  const ox = 70; const oy = 8;
  const w = b1 * k; const hh = h1 * k;
  const w2 = b2 * k; const h2k = h2 * k;
  let s = `<rect x="${ox}" y="${oy}" width="${w}" height="${hh}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<rect x="${ox + (w - w2) / 2}" y="${oy + (hh - h2k) / 2}" width="${w2}" height="${h2k}" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<text x="${ox + w + 8}" y="${oy + hh / 2}" font-size="11.5" font-weight="600" fill="var(--accent-ink)">h1 = ${fmt(h1, 0)}</text><text x="${ox + w / 2}" y="${oy + hh + 14}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--accent-ink)">b1 = ${fmt(b1, 0)} cm · hueco ${fmt(b2, 0)} × ${fmt(h2, 0)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H + 20}" style="width:100%; max-width:280px; height:auto; display:block;" role="img" aria-label="Sección hueca">${s}</svg>`;
}

// ================================================================= VIERENDEEL
const UPN_OPTS = [['auto', 'Automático: el más liviano que verifica'], ...S.profilesOf('UPN').map((u) => [u.n, `${u.n} (A = ${fmt(u.A, 1)} cm²)`])];

function vierDefaults(kind) {
  const base = { kind, L: 30, H: 4, a: 4, floorD: 1400, floorL: 1000, roofD: 600, roofL: 200, flechaRatio: 500 };
  if (kind === 'steel') return { ...base, self: 150, sigma: 1400, tau: 1100, E: 2100000, upn: 'UPN 240', grade: 'F-22' };
  return { ...base, self: 750, m1: 35, m2: 90, hc: 0, sigmaC: 150, tau: 20, sigmaS: 2400, E: 390000, omega: 1, barD: 32 };
}

function vierCompute(calc) {
  const d = calc.design;
  const p = { mat: d.kind === 'steel' ? 'steel' : 'rc', L: num(d.L), H: num(d.H), a: num(d.a), flechaRatio: num(d.flechaRatio, 500),
    loads: { floorD: d.floorD, floorL: d.floorL, roofD: d.roofD, roofL: d.roofL, self: d.self } };
  if (![p.L, p.H, p.a].every((v) => v > 0)) return { error: 'Completá la luz, la altura y la distancia entre nudos con valores mayores que cero.' };
  if (p.a > p.L) return { error: 'La distancia entre nudos no puede ser mayor que la luz.' };
  if (!(B.loadsTotal(p.loads) > 0)) return { error: 'Cargá las cargas por metro de viga.' };
  if (p.mat === 'rc') {
    p.rc = { m1: num(d.m1), m2: num(d.m2), hc: num(d.hc), sigmaC: num(d.sigmaC, 150), tau: num(d.tau, 20), sigmaS: num(d.sigmaS, 2400), E: num(d.E, 390000), omega: num(d.omega, 1), barD: num(d.barD, 32) };
    if (!(p.rc.m1 > 0)) return { error: 'Completá el lado m1 de los montantes y del cordón.' };
    if (p.rc.hc >= p.H * 100) return { error: 'La altura del cordón es mayor que la de la viga.' };
  } else p.steel = { sigma: num(d.sigma, 1400), tau: num(d.tau, 1100), E: num(d.E, 2100000), upn: d.upn && d.upn !== 'auto' ? d.upn : null, grade: d.grade || 'F-22' };
  return { kind: p.mat, input: p, res: B.designVierendeel(p) };
}

function vierStep1(calc) {
  const d = calc.design;
  const steel = d.kind === 'steel';
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Viga Vierendeel de ${steel ? 'acero' : 'hormigón armado'}</h3>${vierFigure(d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.L', 'Luz libre L', d.L, { unit: 'm' })}${numField('design.H', 'Altura de la viga H', d.H, { unit: 'm', hint: 'Entre bordes exteriores de los cordones. Brazo de palanca Z = 0,9 H.' })}</div>
      ${numField('design.a', 'Distancia entre nudos (entre montantes) a', d.a, { unit: 'm', hint: 'Longitud de pandeo del cordón superior = 0,7 a.' })}</div>
    <div class="card"><h3 style="margin-top:0;">Cargas</h3>${LOAD_FIELDS(d, steel ? 'Guía: 150 kg/m para la viga de acero.' : 'Guía: 750 kg/m para la viga de hormigón.')}</div></div>
    <div class="note" style="margin-top:16px;">${BIG_NOTE}</div>`;
}

function vierStep2(calc) {
  const out = vierCompute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  const steel = r.mat === 'steel';
  return `<div class="grid grid-2" style="align-items:start;"><div class="card"><h3 style="margin-top:0;">Esfuerzos principales (viga simplemente apoyada)</h3><table class="data-table"><tbody>
    <tr><td>Carga total q</td><td style="text-align:right;">${kg(r.q)} kg/m</td></tr>
    <tr><td>Mmax = q L² / 8</td><td style="text-align:right;"><b>${kg(r.M)} kg·m</b></td></tr>
    <tr><td>Qmax = q L / 2</td><td style="text-align:right;"><b>${kg(r.Q)} kg</b></td></tr>
    <tr><td>Brazo de palanca Z = 0,9 H</td><td style="text-align:right;">${fmt(r.Z, 2)} m</td></tr>
    <tr><td>C = T = M / Z</td><td style="text-align:right;"><b>${kg(r.C)} kg</b></td></tr></tbody></table></div>
    <div class="card"><h3 style="margin-top:0;">Predimensionado</h3><table class="data-table"><tbody>
    ${steel ? `<tr><td>Sección necesaria del cordón traccionado Fe = T / ${num(calc.design.sigma, 1400)}</td><td style="text-align:right;"><b>${fmt(r.FeNec, 2)} cm²</b></td></tr>
      <tr><td>Perfil adoptado (2 perfiles U por cordón)</td><td style="text-align:right;">${escapeHtml(r.profile.n)}: 2 × ${fmt(r.profile.A, 1)} = ${fmt(r.Fe, 1)} cm²</td></tr>`
      : `<tr><td>m2 mínimo = Qmax / (m1 τadm), m1 = ${fmt(r.m1, 0)} cm</td><td style="text-align:right;"><b>${fmt(r.m2req, 1)} cm</b></td></tr>
      <tr><td>m2 adoptado (de 2 a 2,5 veces m1)</td><td style="text-align:right;">${fmt(r.m2, 0)} cm (${fmt(r.ratio, 2)} m1)</td></tr>
      <tr><td>Armadura del cordón inferior Fe = T / ${num(calc.design.sigmaS, 2400)}</td><td style="text-align:right;"><b>${fmt(r.Fe, 2)} cm²</b> → ${r.nBars} Ø${r.barD}</td></tr>`}
    </tbody></table></div></div>`;
}

function vierData(calc) {
  const d = calc.design;
  if (d.kind === 'steel') return `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    ${selField('design.upn', 'Perfil de los cordones (dos U por cordón)', d.upn || 'auto', UPN_OPTS)}
    ${selField('design.grade', 'Tabla ω del acero', d.grade || 'F-22', [['F-22', 'F-22'], ['F-24', 'F-24']])}
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigma', 'Tensión admisible', d.sigma, { unit: 'kg/cm²', hint: 'Guía: 1400.' })}${numField('design.tau', 'Tensión de corte admisible', d.tau, { unit: 'kg/cm²', hint: 'Guía: 1100.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.E', 'Módulo de elasticidad E', d.E, { unit: 'kg/cm²' })}${numField('design.flechaRatio', 'Flecha admisible L /', d.flechaRatio, { step: 1 })}</div></div>`;
  return `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.m1', 'm1 (montantes y cordón)', d.m1, { unit: 'cm' })}${numField('design.m2', 'm2 (0 = el mínimo, de a 5 cm)', d.m2, { unit: 'cm', hint: 'La guía adopta 90 cm.' })}</div>
    ${numField('design.hc', 'Altura del cordón en el plano de la viga (para la inercia)', d.hc, { unit: 'cm', hint: '0 = m2.' })}
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaC', 'Tensión de compresión admisible', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: 150.' })}${numField('design.tau', 'Tensión de corte admisible (montantes)', d.tau, { unit: 'kg/cm²', hint: 'Guía: 20 (H-47).' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaS', 'Tensión del acero de las barras', d.sigmaS, { unit: 'kg/cm²', hint: 'Guía: 2400.' })}${selField('design.barD', 'Diámetro de las barras', d.barD, B.REBAR_DIAMETERS.map((x) => [x, `Ø${x} mm`]))}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.E', 'Módulo de elasticidad del hormigón', d.E, { unit: 'kg/cm²', hint: 'Guía: 390000 (H-47).' })}${numField('design.omega', 'Coeficiente de pandeo ω', d.omega, { hint: 'Tabla de hormigón armado de la guía (λ = 8 → 1): no se adjuntó, se ingresa.' })}</div>
    ${numField('design.flechaRatio', 'Flecha admisible L /', d.flechaRatio, { step: 1 })}</div>`;
}

function vierStep3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  const checks = r.checks.map((c) => ({ ...c }));
  const ok = r.ok;
  const note = r.mat === 'steel'
    ? `Con J = 2 [2 J<sub>U</sub> + 2 A z1²] (dos cordones de dos perfiles) la flecha da ${fmt(r.f, 2)} cm. La guía deja la inercia en la mitad (2 997 302 cm⁴: no incluye el factor 2 de su propia fórmula) y obtiene 5,61 cm.`
    : `La guía obtiene J = 1,637·10⁸ cm⁴ con un z1 que no detalla; acá z1 = (H − altura del cordón) / 2 = ${fmt(r.z1, 0)} cm, J = ${r.J.toExponential(3)} cm⁴.`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${vierData(calc)}</div><div>${checksCard({ ok, checks })}<p class="text-muted" style="font-size:12px; margin:8px 0 0;">${note}</p></div></div>`;
}

function vierMemoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design; const steel = r.mat === 'steel';
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', `Viga Vierendeel de ${steel ? 'acero' : 'hormigón armado'}`, 'Guía de predimensionado E4 · 6.1')}${memoRow('Luz · altura · nudos', `L = ${fmt(d.L, 2)} m · H = ${fmt(d.H, 2)} m · a = ${fmt(d.a, 2)} m`)}
      ${memoRow('Cargas por metro', `entrepiso ${kg(d.floorD)} + ${kg(d.floorL)}; cubierta ${kg(d.roofD)} + ${kg(d.roofL)}; peso propio ${kg(d.self)}`)}${memoRow('Carga total q', `${kg(r.q)} kg/m`)}</table>
    ${vierFigure(d)}<h2>2. Esfuerzos principales</h2><table>${memoRow('Mmax = q L² / 8', `${kg(r.M)} kg·m`)}${memoRow('Qmax = q L / 2', `${kg(r.Q)} kg`)}${memoRow('C = T = M / (0,9 H)', `${kg(r.C)} kg`)}</table>
    <h2>3. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>4. Resultado</h2><table>${memoRow('Viga', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(BIG_NOTE)}</p>`;
  return { title: calc.name, sub: `Viga Vierendeel de ${steel ? 'acero' : 'hormigón armado'} · L = ${fmt(d.L, 1)} m`, html };
}

export const vierModule = {
  label: 'Viga de gran inercia: Vierendeel',
  defaults(variant) { return { design: vierDefaults(variant === 'steel' ? 'steel' : 'rc'), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return vierCompute(calc); },
  step1: vierStep1, step2: vierStep2, step3: vierStep3, memoria: vierMemoria,
};

// ================================================================= POSTESADA
function postDefaults() {
  return { kind: 'post', L: 30, f: 0.85, floorD: 1400, floorL: 1000, roofD: 600, roofL: 200, self: 3000, h: 200, sigmaC: 150, E: 390000, b1: 70, h1: 200, b2: 40, h2: 170, catalog: 't1:190', cableD: 36, flechaRatio: 500 };
}

function postCompute(calc) {
  const d = calc.design;
  const p = { L: num(d.L), f: num(d.f), h: num(d.h), sigmaC: num(d.sigmaC, 150), E: num(d.E, 390000), flechaRatio: num(d.flechaRatio, 500),
    loads: { floorD: d.floorD, floorL: d.floorL, roofD: d.roofD, roofL: d.roofL, self: d.self },
    sect: { b1: num(d.b1), h1: num(d.h1), b2: num(d.b2), h2: num(d.h2) }, cable: { catalog: d.catalog || 't1:190', d: num(d.cableD) } };
  if (![p.L, p.f, p.h, p.sect.b1, p.sect.h1].every((v) => v > 0)) return { error: 'Completá la luz, la flecha del cable, la altura y las dimensiones de la sección con valores mayores que cero.' };
  if (!(B.loadsTotal(p.loads) > 0)) return { error: 'Cargá las cargas por metro de viga.' };
  if (p.sect.b2 >= p.sect.b1 || p.sect.h2 >= p.sect.h1 || p.sect.b2 < 0 || p.sect.h2 < 0) return { error: 'El hueco tiene que ser menor que la sección total.' };
  return { kind: 'post', input: p, res: B.designPostTensioned(p, { cablesOf: C.cablesOf }) };
}

function postStep1(calc) {
  const d = calc.design;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Viga postesada de hormigón</h3>${postFigure(d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.L', 'Luz libre L', d.L, { unit: 'm' })}${numField('design.f', 'Flecha del cable f', d.f, { unit: 'm', hint: 'Ph = q L² / 8 f (la guía usa 0,85 m).' })}</div>
      ${numField('design.h', 'Altura de la viga h', d.h, { unit: 'cm' })}</div>
    <div class="card"><h3 style="margin-top:0;">Cargas</h3>${LOAD_FIELDS(d, 'Guía: 3000 kg/m para la viga postesada.')}</div></div>
    <div class="note" style="margin-top:16px;">${BIG_NOTE}</div>`;
}

function postStep2(calc) {
  const out = postCompute(calc);
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;"><div class="card"><h3 style="margin-top:0;">Esfuerzos principales</h3><table class="data-table"><tbody>
    <tr><td>Carga total q</td><td style="text-align:right;">${kg(r.q)} kg/m</td></tr>
    <tr><td>Esfuerzo horizontal P = Ph = q L² / 8 f</td><td style="text-align:right;"><b>${kg(r.Ph)} kg</b></td></tr>
    <tr><td>Sección necesaria por compresión Fb = Ph / σadm</td><td style="text-align:right;">${kg(r.Fb)} cm²</td></tr>
    <tr><td>Ancho necesario b = Fb / h</td><td style="text-align:right;"><b>${fmt(r.bNec, 2)} cm</b></td></tr>
    <tr><td>Pk = 2 Ph · inercia necesaria por pandeo Jnec = Pk Lp² / (π² E)</td><td style="text-align:right;">${kg(r.Pk)} kg · <b>${kg(r.Jnec)} cm⁴</b></td></tr></tbody></table></div>
    <div class="card"><h3 style="margin-top:0;">Cables según el diámetro</h3>
      ${r.alternatives ? `<div class="table-wrap" style="max-height:260px; overflow:auto;"><table class="data-table"><thead><tr><th style="text-align:right;">ø (mm)</th><th style="text-align:right;">Rotura (kg)</th><th style="text-align:right;">Cables</th></tr></thead><tbody>${r.alternatives.map((a) => `<tr><td style="text-align:right;">${fmt(a.d, a.d % 1 ? 1 : 0)}</td><td style="text-align:right;">${kg(a.F)}</td><td style="text-align:right;"><b>${a.n}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Cantidad de cables = Pk / carga de rotura de cada uno (Pk = 2 Ph como carga de rotura). Se elige en el paso 3.</p></div></div>`;
}

function postStep3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaC', 'Tensión de compresión admisible', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: 150.' })}${numField('design.E', 'Módulo de elasticidad', d.E, { unit: 'kg/cm²', hint: 'Guía: 390000 (H-47).' })}</div>
    <h4 style="margin:6px 0; font-size:13px;">Sección hueca</h4>${hollowFigure(r.sect)}
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.b1', 'Ancho total b1', d.b1, { unit: 'cm' })}${numField('design.h1', 'Altura total h1', d.h1, { unit: 'cm' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.b2', 'Ancho del hueco b2', d.b2, { unit: 'cm' })}${numField('design.h2', 'Altura del hueco h2', d.h2, { unit: 'cm' })}</div>
    ${selField('design.catalog', 'Tabla de cables', d.catalog || 't1:190', C.CABLE_CATALOGS, 'La guía usa 97 980 kg para el ø 36 mm: es el valor de la Tabla 1 del anexo a 190 kg/mm² (la guía dice 180).')}
    ${numField('design.cableD', 'Diámetro de los cables', d.cableD, { unit: 'mm' })}
    ${numField('design.flechaRatio', 'Flecha admisible L /', d.flechaRatio, { step: 1 })}</div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}
    <div class="card" style="margin-top:16px;"><table class="data-table"><tbody>
      <tr><td>Área de la sección hueca</td><td style="text-align:right;">${kg(r.A)} cm²</td></tr><tr><td>J y-y (pandeo) · J x-x (flecha)</td><td style="text-align:right;">${kg(r.Jyy)} · ${kg(r.Jxx)} cm⁴</td></tr></tbody></table></div></div></div>`;
}

function postMemoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design;
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Viga postesada de hormigón con sección hueca', 'Guía de predimensionado E4 · 6.2')}${memoRow('Luz · flecha del cable · altura', `L = ${fmt(d.L, 2)} m · f = ${fmt(d.f, 2)} m · h = ${fmt(d.h, 0)} cm`)}
      ${memoRow('Cargas por metro', `entrepiso ${kg(d.floorD)} + ${kg(d.floorL)}; cubierta ${kg(d.roofD)} + ${kg(d.roofL)}; peso propio ${kg(d.self)}`)}${memoRow('Carga total q', `${kg(r.q)} kg/m`)}</table>
    ${postFigure(d)}<h2>2. Esfuerzos principales</h2><table>${memoRow('Ph = q L² / 8 f', `${kg(r.Ph)} kg`)}${memoRow('Ancho necesario b = Ph / (σadm h)', `${fmt(r.bNec, 2)} cm`)}${memoRow('Pk = 2 Ph · Jnec = Pk Lp² / (π² E)', `${kg(r.Pk)} kg · ${kg(r.Jnec)} cm⁴`)}</table>
    <h2>3. Sección hueca</h2>${hollowFigure(r.sect)}<table>${memoRow('A · Jy-y · Jx-x', `${kg(r.A)} cm² · ${kg(r.Jyy)} · ${kg(r.Jxx)} cm⁴`)}</table>
    <h2>4. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    <h2>5. Resultado</h2><table>${memoRow('Viga', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(BIG_NOTE)}</p>`;
  return { title: calc.name, sub: `Viga postesada · L = ${fmt(d.L, 1)} m`, html };
}

export const postModule = {
  label: 'Viga de gran inercia: postesada',
  defaults() { return { design: postDefaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return postCompute(calc); },
  step1: postStep1, step2: postStep2, step3: postStep3, memoria: postMemoria,
};
