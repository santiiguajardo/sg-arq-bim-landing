// Cerchas y cabriadas de acero: pantallas del calculador (cabriada de cubierta a dos aguas, cercha o viga reticulada de cordones paralelos y
// cercha armada nudo por nudo). Motor en js/structural/steel-truss.js; método de la cátedra (Estructuras III): método de los nudos, estados
// de carga 1 (permanentes + sobrecarga) y 2 (permanentes − viento) y dimensionado de cada familia de barras con el método ω.
import { previewSketch } from './structural-spans.js';
import * as S from '../structural/steel.js';
import * as T from '../structural/steel-truss.js';
import { roofLiveLoad } from '../structural/steel-design.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';
import { trussFigure } from './structural-draw.js';
import { deflSelect, deflCardHtml, deflMemo, jointsPanel, jointsTruss, jointsMemo } from './structural-joints.js';

const ART = {
  nodes: 'Método de los nudos (apunte "Cerchas metálicas"): barras articuladas, cargas en los nudos, B = 2N − 3',
  states: 'Estado 1: permanentes + sobrecarga · Estado 2: permanentes − viento (apunte "Cerchas metálicas")',
  roof: 'CIRSOC 101-1982, art. 4.1.7.1 (sobrecarga de cubierta)',
  omega: 'Método ω de pandeo (apunte "Compresión con pandeo")',
  battened: 'Barras compuestas con presillas: λi = √(λy² + (m/2) λ1²), λ1 = s / i1 ≤ 50 (TP 5, apunte "Cabriada nave industrial")',
  tension: 'Tracción simple: σ = N / A ≤ σadm',
  light: 'Viga reticulada (apunte "Vigas reticuladas"): h ≥ L/20, diagonales entre 45° y 70° (ideal 60°)',
};
const FAM_KEYS = Object.keys(T.FAMILIES);
const GRADE_OPTS = Object.entries(S.GRADES).map(([k, g]) => [k, g.label]);
const OMEGA_OPTS = [['grade', 'Tabla ω del acero elegido (más conservadora)'], ['St37', 'Tabla 3 del apunte (acero St 37), como en los ejemplos de la cátedra']];
const SECTION_OPTS = Object.entries(T.SECTION_TYPES).map(([k, v]) => [k, v.label]);
const KINDS = [['pratt', 'Pratt (diagonales que bajan hacia el centro)'], ['howe', 'Howe (diagonales que suben hacia el centro)'], ['warren', 'Warren (sin montantes)']];
const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
export const barName = (b) => `${b.a + 1}–${b.b + 1}`;
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

let ttab = 'resumen';
let tstate = 0;
const cache = new Map();

const DEFAULT_CUSTOM = {
  nodesText: '0 0\n2 0\n4 0\n1 1.5\n3 1.5',
  barsText: '1 2 CI\n2 3 CI\n4 5 CS\n1 4 D\n4 2 D\n2 5 D\n5 3 D',
  supportsText: '1 fijo\n3 movil',
  loadsText: '4 500 800 0\n5 500 800 0',
};

function defaultsFor(variant) {
  const base = {
    kind: variant === 'parallel' ? 'pratt' : variant === 'custom' ? 'custom' : 'gable',
    // cabriada a dos aguas
    L: 10, f: 1.8, n: 3, diag: 'down', S: 5, gSurf: 30, self: 10, autoSelf: 'yes', pAuto: 'yes', roofKind: 'other', p: 23, w: 57, windMode: 'vertical',
    // cordones paralelos
    h: 1.2, loadChord: 'top', qD: 300, qL: 500, qW: 0, planes: 1,
    // secciones
    sep: 0.5, plate: 0.64, lpD: 1, sameChords: 'no',
    ...DEFAULT_CUSTOM,
  };
  if (variant === 'parallel') Object.assign(base, { L: 12, n: 6, self: 20 });
  return base;
}

// ---------------------------------------------------------------- datos -> motor
function paramsOf(calc) {
  const d = calc.design;
  const sec = calc.section;
  const common = {
    grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, sep: Number(d.sep) || 0.5, plateThickness: Number(d.plate) || 0.64,
    sections: { CS: sec.CS, CI: sec.CI, M: sec.M, D: sec.D }, names: Object.fromEntries(FAM_KEYS.filter((k) => sec[`name${k}`] && sec[`name${k}`] !== 'auto').map((k) => [k, sec[`name${k}`]])),
    lpFactor: { D: Number(d.lpD) || 1, M: Number(d.lpD) || 1 }, sameChords: d.sameChords === 'yes',
    deflLimit: d.deflLimit || (d.kind === 'gable' ? 'industrialRigid' : 'course'),
  };
  if (d.kind === 'gable') {
    const alpha = Math.atan(Number(d.f) / (Number(d.L) / 2)) * 180 / Math.PI;
    return { ...common, L: Number(d.L), f: Number(d.f), n: Math.round(Number(d.n)), diag: d.diag, S: Number(d.S), gSurf: Number(d.gSurf), self: Number(d.self), autoSelf: d.autoSelf === 'yes',
      p: d.pAuto === 'no' ? Number(d.p) : roofLiveLoad(alpha, d.roofKind === 'light'), w: Number(d.w) || 0, windMode: d.windMode, alpha };
  }
  if (d.kind === 'custom') return { ...common, custom: true };
  const planes = Math.max(1, Math.round(Number(d.planes)) || 1);
  return { ...common, kind: d.kind, L: Number(d.L), h: Number(d.h), n: Math.round(Number(d.n)), loadChord: d.loadChord, qD: Number(d.qD) / planes, qL: Number(d.qL) / planes, qW: (Number(d.qW) || 0) / planes,
    self: Number(d.self) / planes, autoSelf: d.autoSelf === 'yes' };
}

function parseCustom(d) {
  const nums = (t) => t.trim().split(/[\s;]+/).filter(Boolean).map((v) => Number(v.replace(',', '.')));
  const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const nodes = lines(d.nodesText).map((l) => { const [x, y] = nums(l); return { x, y }; });
  if (nodes.length < 3 || nodes.some((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y))) return { error: 'Cargá al menos 3 nudos, uno por línea: "x y" en metros.' };
  const bars = [];
  for (const l of lines(d.barsText)) {
    const t = l.split(/[\s;]+/);
    const a = Number(t[0]) - 1;
    const b = Number(t[1]) - 1;
    const fam = (t[2] || 'D').toUpperCase();
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < nodes.length && b < nodes.length && a !== b) || !T.FAMILIES[fam]) return { error: `Barra mal escrita: "${l}". Formato: "nudo nudo familia" con familia CS, CI, M o D.` };
    bars.push({ a, b, fam });
  }
  if (bars.length < 3) return { error: 'Cargá al menos 3 barras.' };
  const supports = [];
  for (const l of lines(d.supportsText)) {
    const t = l.split(/[\s;]+/);
    const node = Number(t[0]) - 1;
    if (!(Number.isInteger(node) && node >= 0 && node < nodes.length)) return { error: `Apoyo mal escrito: "${l}". Formato: "nudo fijo" o "nudo movil".` };
    supports.push({ node, type: /^m/i.test(t[1] || '') ? 'roller' : 'pin' });
  }
  if (supports.length < 2) return { error: 'Hacen falta dos apoyos (uno fijo y uno móvil).' };
  const loads = [];
  for (const l of lines(d.loadsText)) {
    const t = nums(l);
    const node = t[0] - 1;
    if (!(Number.isInteger(node) && node >= 0 && node < nodes.length) || t.slice(1).some((v) => !Number.isFinite(v))) return { error: `Carga mal escrita: "${l}". Formato: "nudo permanente sobrecarga viento" en kg.` };
    loads.push({ node, D: t[1] || 0, L: t[2] || 0, W: t[3] || 0 });
  }
  if (!loads.length) return { error: 'Cargá al menos una carga en un nudo.' };
  return { nodes, bars, supports, loads };
}

function compute(calc) {
  const d = calc.design;
  const p = paramsOf(calc);
  let key;
  try { key = JSON.stringify([p, d.kind === 'custom' ? [d.nodesText, d.barsText, d.supportsText, d.loadsText] : 0]); } catch (e) { return { error: 'Datos inválidos.' }; }
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    if (d.kind === 'gable') {
      if (![p.L, p.f, p.S].every((v) => v > 0) || !(p.n >= 2) || p.n > 12) return { error: 'Completá la luz, la flecha y la separación con valores mayores que cero; paneles por faldón de 2 a 12.' };
      out = { res: T.designRoofTruss(p), input: p };
    } else if (d.kind === 'custom') {
      const c = parseCustom(d);
      if (c.error) return { error: c.error };
      out = { res: T.designCustomTruss({ ...p, ...c }), input: p };
    } else {
      if (![p.L, p.h].every((v) => v > 0) || !(p.n >= 2) || p.n > 40) return { error: 'Completá la luz y la altura con valores mayores que cero; paneles de 2 a 40.' };
      out = { res: T.designLineTruss(p), input: p };
    }
    out.res.truss = true;
  } catch (e) {
    out = { error: e.message && /mecanismo|longitud cero/.test(e.message) ? e.message : 'No se pudo calcular con estos datos.' };
  }
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

// utilización de una barra (la mayor entre tracción y compresión)
export function barUtil(fam, k) {
  const r = fam.per[k];
  if (!r) return 0;
  const sA = S.sigmaAllow(fam.profile, S.GRADES[fam.gradeKey] || { sadm: 1375, tadm: 884 });
  let u = r.sigmaT / sA;
  if (r.comp) {
    const c = r.comp;
    if (c.sigX !== undefined) u = Math.max(u, c.sigX / c.sigAllow, (c.sigI || 0) / c.sigAllow, (c.sig1 || 0) / c.sigAllow);
    else if (c.sigma !== undefined) u = Math.max(u, c.sigma / c.sigmaAllow);
    else u = Math.max(u, 9);
  }
  return u;
}

function figureOf(res, i, pal) {
  const st = res.states[i];
  return trussFigure({
    title: `${st.label}`, nodes: res.geom.nodes, bars: res.bars.map((b) => ({ a: b.a, b: b.b, N: b.Ns[i], fam: b.fam })), supports: res.geom.supports, loads: st.loads, reactions: st.reactions,
    hint: 'Esfuerzos axiles por el método de los nudos (cargas de servicio)',
  }, pal);
}

export const famWorst = (f) => {
  let wi = 0;
  let wu = -1;
  f.bars.forEach((b, k) => { const u = barUtil(f, k); if (u > wu) { wu = u; wi = k; } });
  return { idx: wi, util: wu };
};

// ---------------------------------------------------------------- módulo
export const trussModule = {
  label: 'Cercha o cabriada de acero',
  defaults(variant) {
    return {
      design: defaultsFor(variant),
      section: { CS: '2L', CI: '2L', M: 'L', D: 'L', nameCS: 'auto', nameCI: 'auto', nameM: 'auto', nameD: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade' },
      verification: {},
    };
  },
  input(calc) { return paramsOf(calc); },
  run(calc) { return compute(calc); },
  wire(root) {
    root.querySelectorAll('[data-ttab]').forEach((b) => b.addEventListener('click', () => { ttab = b.dataset.ttab; rerender(); }));
    root.querySelector('#tState')?.addEventListener('change', (e) => { tstate = Number(e.target.value); rerender(); });
  },
  step1(calc) {
    const d = calc.design;
    const k = d.kind;
    let geomFacts = '';
    let geomG = null;
    try {
      const out = compute(calc);
      if (out.res) {
        const g = out.res.geom;
        geomG = g;
        geomFacts = `<p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">${g.nodes.length} nudos y ${g.bars.length} barras: B = 2N − 3 = ${2 * g.nodes.length - 3} → ${g.bars.length === 2 * g.nodes.length - 3 ? 'isostática y estable' : g.bars.length > 2 * g.nodes.length - 3 ? 'hiperestática' : 'hipostática (mecanismo)'}.${k === 'gable' ? ` Pendiente α = ${fmt(g.alpha * 180 / Math.PI, 1)}° (tg α = ${fmt(Number(d.f) / (Number(d.L) / 2), 3)}); lados del cordón superior ${fmt(g.L / (2 * d.n) / Math.cos(g.alpha), 2)} m.` : ''}</p>`;
      }
    } catch (e) { /* se muestra en el paso 3 */ }
    const kindBlock = k === 'gable' ? '' : k === 'custom' ? '' : selField('design.kind', 'Tipo de cercha', k, KINDS);
    if (k === 'custom') {
      return `
        <div class="grid grid-2" style="align-items:start;">
          <div class="card">
            <h3 style="margin-top:0;">Geometría</h3>
            ${previewSketch('custom', d, geomG)}
            <div class="field"><label>Nudos <span class="text-muted">(uno por línea: x y, en metros; se numeran desde 1)</span></label><textarea data-f="design.nodesText" rows="7" style="width:100%; font-family:monospace;">${escapeHtml(d.nodesText)}</textarea></div>
            <div class="field"><label>Barras <span class="text-muted">(nudo nudo familia: CS cordón superior, CI cordón inferior, M montante, D diagonal)</span></label><textarea data-f="design.barsText" rows="8" style="width:100%; font-family:monospace;">${escapeHtml(d.barsText)}</textarea></div>
            ${geomFacts}
          </div>
          <div class="card">
            <h3 style="margin-top:0;">Apoyos y cargas</h3>
            <div class="field"><label>Apoyos <span class="text-muted">(nudo fijo o nudo movil)</span></label><textarea data-f="design.supportsText" rows="3" style="width:100%; font-family:monospace;">${escapeHtml(d.supportsText)}</textarea></div>
            <div class="field"><label>Cargas en los nudos <span class="text-muted">(nudo permanente sobrecarga viento, en kg; el viento es hacia arriba)</span></label><textarea data-f="design.loadsText" rows="6" style="width:100%; font-family:monospace;">${escapeHtml(d.loadsText)}</textarea></div>
            <p class="text-muted" style="font-size:12px; margin:0;">Las barras se consideran articuladas en los nudos y los ejes de las barras deben concurrir a un mismo punto (apunte). Los pesos propios se suman a mano en las cargas.</p>
          </div>
        </div>`;
    }
    if (k === 'gable') {
      const alpha = Math.atan(Number(d.f) / (Number(d.L) / 2)) * 180 / Math.PI;
      const pAuto = roofLiveLoad(alpha, d.roofKind === 'light');
      return `
        <div class="grid grid-2" style="align-items:start;">
          <div class="card">
            <h3 style="margin-top:0;">Geometría de la cabriada</h3>
            ${previewSketch('gable', d)}
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.L', 'Luz', d.L, { unit: 'm' })}${numField('design.f', 'Flecha (altura al centro)', d.f, { unit: 'm', hint: 'tg α = f / (L/2). Cubiertas: α entre 20° y 30° (apunte).' })}
            </div>
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.n', 'Paneles por faldón', d.n, { step: 1, hint: 'Entre 2 y 12. Los correas apoyan en los nudos del cordón superior.' })}
              ${selField('design.diag', 'Diagonales', d.diag, [['down', 'Bajan hacia el centro (como en el ejemplo de la nave)'], ['up', 'Suben hacia el centro']])}
            </div>
            ${numField('design.S', 'Separación entre cabriadas', d.S, { unit: 'm', hint: 'Ancho de cubierta que descarga sobre cada cabriada.' })}
            ${geomFacts}
          </div>
          <div class="card">
            <h3 style="margin-top:0;">Cargas</h3>
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.gSurf', 'Cubierta, correas y accesorios', d.gSurf, { unit: 'kg/m²', hint: 'Sobre la superficie inclinada; se pasa a proyección horizontal con 1/cos α.' })}
              ${numField('design.self', 'Peso propio de la cabriada (estimado)', d.self, { unit: 'kg/m²', hint: 'En planta. Con el ajuste automático se reemplaza por el calculado.' })}
            </div>
            <div class="field-row" style="flex-wrap:wrap;">
              ${selField('design.pAuto', 'Sobrecarga', d.pAuto === 'no' ? 'no' : 'yes', [['yes', 'Según CIRSOC 101-1982 (por inclinación)'], ['no', 'La ingreso yo']])}
              ${d.pAuto === 'no' ? numField('design.p', 'Sobrecarga p', d.p, { unit: 'kg/m²', hint: 'En proyección horizontal.' })
    : selField('design.roofKind', 'Tipo de cubierta', d.roofKind === 'light' ? 'light' : 'other', [['other', 'Otro tipo de cubierta'], ['light', 'Liviana (hasta 50 kg/m² de peso)']], `p = ${fmt(pAuto, 0)} kg/m² en proyección horizontal (${ART.roof}).`)}
            </div>
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.w', 'Succión del viento', d.w, { unit: 'kg/m²', hint: 'Dato (CIRSOC 102), perpendicular a la cubierta. 0 = sin estado de viento. La presión se desprecia con esta pendiente (apunte).' })}
              ${selField('design.windMode', 'Viento', d.windMode, [['vertical', 'Solo la componente vertical (simplificación de la cátedra)'], ['full', 'Componente vertical y horizontal']])}
            </div>
            ${selField('design.autoSelf', 'Peso propio', d.autoSelf === 'no' ? 'no' : 'yes', [['yes', 'Ajustar automáticamente al peso calculado de la cabriada'], ['no', 'Usar el estimado (como en la cátedra)']])}
          </div>
        </div>`;
    }
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Geometría</h3>
          ${previewSketch('parallel', d)}
          ${kindBlock}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.L', 'Luz', d.L, { unit: 'm' })}${numField('design.h', 'Altura entre ejes de cordones', d.h, { unit: 'm', hint: 'h ≥ L/20 (apunte "Vigas reticuladas").' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.n', k === 'warren' ? 'Tramos del cordón inferior' : 'Paneles', d.n, { step: 1, hint: 'Entre 2 y 40.' })}
            ${selField('design.loadChord', 'Cordón cargado', d.loadChord === 'bottom' ? 'bottom' : 'top', [['top', 'Superior (cubierta o piso arriba)'], ['bottom', 'Inferior (carga colgada)']])}
          </div>
          ${selField('design.planes', 'Planos de reticulado', Number(d.planes) === 2 ? 2 : 1, [[1, 'Un plano (cercha plana)'], [2, 'Dos planos: viga reticulada de sección rectangular (cada plano toma la mitad)']])}
          ${geomFacts}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Cargas (por metro de luz, de toda la viga)</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.qD', 'Permanente (sin la estructura)', d.qD, { unit: 'kg/m' })}${numField('design.qL', 'Sobrecarga', d.qL, { unit: 'kg/m' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.qW', 'Succión del viento (hacia arriba)', d.qW, { unit: 'kg/m', hint: '0 = sin estado de viento.' })}
            ${numField('design.self', 'Peso propio estimado', d.self, { unit: 'kg/m' })}
          </div>
          ${selField('design.autoSelf', 'Peso propio', d.autoSelf === 'no' ? 'no' : 'yes', [['yes', 'Ajustar automáticamente al peso calculado'], ['no', 'Usar el estimado']])}
          <p class="text-muted" style="font-size:12px; margin:0;">${ART.light}.</p>
        </div>
      </div>`;
  },
  step2(calc) {
    const out = compute(calc);
    const res = out.res;
    const s = calc.section;
    const famRows = FAM_KEYS.map((f) => `<div class="field-row" style="flex-wrap:wrap; align-items:flex-end;">${selField(`section.${f}`, T.FAMILIES[f], s[f], SECTION_OPTS)}</div>`).join('');
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Acero</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.grade', 'Calidad del acero', calc.materials.grade, GRADE_OPTS, `σadm = ${fmt(S.GRADES[calc.materials.grade].sadm, 0)} kg/cm²`)}
            ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
          </div>
          <h4 style="margin:10px 0 6px; font-size:13px;">Sección de cada familia de barras</h4>
          ${famRows}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.sep', 'Separación entre los dos perfiles (ángulos) o espesor de la chapa nodal (UPN)', calc.design.sep, { unit: 'cm', hint: 'Ángulos: 0,5 cm (apunte). UPN: espesor de la chapa que los une.' })}
            ${numField('design.plate', 'Espesor de las presillas', calc.design.plate, { unit: 'cm', hint: '1/4" = 0,64 cm.' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.lpD', 'Longitud de pandeo de diagonales y montantes', calc.design.lpD, { unit: '× longitud', hint: '1 = articuladas. 0,75 si son barras continuas, como permite el apunte de vigas reticuladas.' })}
            ${selField('design.sameChords', 'Cordones', calc.design.sameChords === 'yes' ? 'yes' : 'no', [['no', 'Cada cordón con su perfil mínimo'], ['yes', 'Cordón inferior igual al superior']])}
            ${deflSelect('design.deflLimit', calc.design.deflLimit || (calc.design.kind === 'gable' ? 'industrialRigid' : 'course'))}
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Predimensionado</h3>
          ${res ? `<table class="data-table"><thead><tr><th>Familia</th><th style="text-align:right;">Tracción máx.</th><th style="text-align:right;">Compresión máx.</th><th style="text-align:right;">Área estimada</th></tr></thead><tbody>
            ${Object.values(res.families).map((f) => `<tr><td>${f.label}</td><td style="text-align:right;">${kg(f.Tmax)} kg</td><td style="text-align:right;">${kg(f.Cmax)} kg</td><td style="text-align:right;">${fmt(f.Apre, 1)} cm²</td></tr>`).join('')}</tbody></table>
            <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Área estimada: compresión con σ = σadm/2 y ω = 1, o tracción con σadm (apunte). El esfuerzo de cada familia es el mayor de sus barras en los dos estados de carga; en el paso 3 se elige el perfil más liviano que verifica todas las barras de la familia, con la longitud de pandeo de cada una.</p>`
    : `<div class="empty-state">${out.error || 'Completá el paso 1.'}</div>`}
        </div>
      </div>`;
  },
  step3(calc, out) {
    const s = calc.section;
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${FAM_KEYS.map((f) => {
    const fam = out.res && out.res.families[f];
    const names = fam ? fam.candidates.slice(0, 120).map((p) => p.n) : [];
    return `<div class="field-row" style="flex-wrap:wrap;">${selField(`section.${f}`, T.FAMILIES[f], s[f], SECTION_OPTS)}${selField(`section.name${f}`, 'Perfil', s[`name${f}`] || 'auto', [['auto', 'Automático: el más liviano'], ...names.map((n) => [n, n])])}</div>`;
  }).join('')}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
      ${selField('design.sameChords', 'Cordones', calc.design.sameChords === 'yes' ? 'yes' : 'no', [['no', 'Cada cordón con su perfil mínimo'], ['yes', 'Cordón inferior igual al superior']])}
    </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${results(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return memoria(calc, out); },
};

const TABS = [['resumen', 'Resumen'], ['esq', 'Esquemas'], ['barras', 'Barras'], ['fam', 'Familias'], ['uniones', 'Uniones']];

export function annotate(res, grade) {
  Object.values(res.families).forEach((f) => { f.gradeKey = grade; });
}

function results(calc, out) {
  const { res } = out;
  annotate(res, calc.materials.grade);
  const tabs = `<div class="tabs" style="margin-bottom:12px; flex-wrap:wrap;">${TABS.map(([k, l]) => `<button class="tab ${ttab === k ? 'active' : ''}" data-ttab="${k}">${l}</button>`).join('')}</div>`;
  const fams = Object.values(res.families);
  let body = '';
  if (ttab === 'resumen') {
    const g = res.geom;
    body = `<div class="card"><h3 style="margin-top:0;">${calc.design.kind === 'gable' ? 'Cabriada' : 'Cercha'} de ${fmt(g.L, 2)} m ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        ${fams.map((f) => `<tr><td>${f.label} (${f.bars.length} barras)</td><td style="text-align:right;"><b>${f.profile ? `${f.def.mult === 2 ? '2 × ' : ''}${escapeHtml(f.profile.n)}` : '—'}</b> ${pill(f.ok)}</td></tr>`).join('')}
        <tr><td>Peso de las barras</td><td style="text-align:right;"><b>${fmt(res.weight, 0)} kg</b>${res.area ? ` (${fmt(res.weight / res.area, 1)} ${calc.design.kind === 'gable' ? 'kg/m² en planta' : 'kg/m'})` : ''}</td></tr>
        ${res.selfUsed !== undefined ? `<tr><td>Peso propio supuesto en las cargas</td><td style="text-align:right;">${fmt(res.selfUsed, 1)} ${calc.design.kind === 'gable' ? 'kg/m²' : 'kg/m'}${Math.abs(res.selfReal - res.selfUsed) > 0.1 * Math.max(res.selfReal, 1) ? ' <span class="tag tag-media">distinto del calculado</span>' : ''}</td></tr>` : ''}
        <tr><td>Reacciones (estado 1)</td><td style="text-align:right;">${res.states[0].reactions.map((r) => kg(r.ry)).join(' · ')} kg</td></tr>
      </tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${ART.nodes}. ${ART.states}. El peso no incluye chapas nodales, presillas ni uniones.</p></div>${deflCardHtml(res.defl, 'truss', res.defl && res.defl.bump)}`;
  } else if (ttab === 'esq') {
    if (tstate >= res.states.length) tstate = 0;
    body = `<div class="card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;"><h3 style="margin:0;">Esfuerzos en las barras</h3>
      <select id="tState">${res.states.map((st, i) => `<option value="${i}" ${i === tstate ? 'selected' : ''}>${st.id}</option>`).join('')}</select></div>${figureOf(res, tstate, 'screen')}</div>`;
  } else if (ttab === 'barras') {
    body = `<div class="card"><h3 style="margin-top:0;">Barras</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Barra</th><th>Familia</th><th style="text-align:right;">Long. (m)</th>${res.states.map((st) => `<th style="text-align:right;">${st.id} (kg)</th>`).join('')}<th style="text-align:right;">Uso</th></tr></thead><tbody>
      ${res.bars.map((b) => {
    const f = res.families[b.fam];
    const k = f.bars.indexOf(b);
    const u = f.profile ? barUtil(f, k) : 0;
    return `<tr><td>${barName(b)}</td><td>${b.fam}</td><td style="text-align:right;">${fmt(b.len, 2)}</td>${b.Ns.map((v) => `<td style="text-align:right; color:${Math.abs(v) < 0.5 ? 'inherit' : v > 0 ? 'var(--accent)' : 'var(--bad)'};">${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${kg(Math.abs(v))}</td>`).join('')}<td style="text-align:right;">${fmt(u * 100, 0)} %</td></tr>`;
  }).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">+ tracción, − compresión. Uso = tensión de trabajo / admisible con el perfil adoptado de la familia.</p></div>`;
  } else if (ttab === 'uniones') {
    body = jointsPanel(calc, jointsTruss(res, calc));
  } else {
    body = fams.map((f) => famCard(f, calc)).join('');
  }
  return tabs + body;
}

export function famCard(f, calc) {
  if (!f.profile) return '';
  const w = famWorst(f);
  const wb = f.bars[w.idx];
  const r = f.per[w.idx];
  const checks = [];
  const T0 = f.Tmax;
  if (T0 > 0) {
    const kT = f.bars.reduce((a, b, k) => (f.per[k].sigmaT > f.per[a].sigmaT ? k : a), 0);
    checks.push({ ok: f.per.every((x) => x.sigmaTOk), label: 'Tracción', text: `σ = N / A = ${kg(f.bars[kT].T)} / ${fmt(f.profile.A * f.def.mult, 2)} = ${kg(f.per[kT].sigmaT)} ≤ ${kg(S.sigmaAllow(f.profile, S.GRADES[calc.materials.grade]))} kg/cm² (barra ${barName(f.bars[kT])})` });
  }
  if (f.Cmax > 0) {
    const kC = f.bars.indexOf(f.worstC);
    const rc = f.per[kC] && f.per[kC].comp;
    if (rc) {
      if (rc.sigX !== undefined && !rc.reason) {
        checks.push({ ok: rc.sigX <= rc.sigAllow, label: 'Eje material x–x', text: `λx = ${fmt(rc.lamX, 0)}, ωx = ${fmt(rc.omX, 2)}: σ = ${kg(rc.sigX)} ≤ ${kg(rc.sigAllow)} kg/cm² (barra ${barName(f.worstC)}, N = ${kg(f.Cmax)} kg)` });
        checks.push({ ok: rc.lam1Ok, label: 'Esbeltez local', text: `${rc.nSp} espacios, s = ${fmt(f.worstC.len * 100 / rc.nSp, 1)} cm: λ1 = ${fmt(rc.lam1, 1)} ≤ 50` });
        checks.push({ ok: rc.sigI <= rc.sigAllow && rc.sig1 <= rc.sigAllow, label: 'Eje inmaterial (λi)', text: `λy = ${fmt(rc.lamY, 1)}, λi = ${fmt(rc.lamI, 1)}, ωi = ${fmt(rc.omI, 2)}: σ = ${kg(rc.sigI)} ≤ ${kg(rc.sigAllow)} kg/cm² · local ω1 = ${fmt(rc.om1, 2)}: σ = ${kg(rc.sig1)}` });
        checks.push({ ok: true, label: 'Presillas', text: `Q = ωN/80 = ${kg(rc.Q)} kg; en cada presilla T = ${kg(rc.Tp)} kg; altura mínima ${fmt(rc.hP, 0)} cm × ${fmt(rc.plateThickness, 2)} cm; e = ${fmt(rc.e, 1)} cm` });
      } else if (rc.sigma !== undefined) {
        checks.push({ ok: rc.ok, label: 'Compresión con pandeo', text: `λ = ${fmt(rc.lambda, 0)}, ω = ${fmt(rc.omega, 2)}: σ = ω N / A = ${kg(rc.sigma)} ≤ ${kg(rc.sigmaAllow)} kg/cm² (barra ${barName(f.worstC)}, N = ${kg(f.Cmax)} kg, Lp = ${fmt(f.worstC.len * 100 * (calc.design.lpD && f.fam !== 'CS' && f.fam !== 'CI' ? Number(calc.design.lpD) : 1), 0)} cm)` });
      } else checks.push({ ok: false, label: 'Compresión con pandeo', text: rc.reason || 'La esbeltez supera la de la tabla: elegí un perfil mayor.' });
    }
  }
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">${f.label}: ${f.def.mult === 2 ? '2 × ' : ''}${escapeHtml(f.profile.n)} ${pill(f.ok)}</h3>
    <p class="text-muted" style="font-size:12.5px; margin:0 0 6px;">${f.bars.length} barras, ${fmt(f.length, 1)} m en total · ${fmt(f.weight, 1)} kg · esfuerzo máximo: tracción ${kg(f.Tmax)} kg, compresión ${kg(f.Cmax)} kg · más exigida: barra ${barName(wb)} (${fmt(w.util * 100, 0)} %)${r && r.comp && r.comp.reason ? '' : ''}</p>
    ${checks.map((k) => `<div style="display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:${k.ok ? 'var(--good)' : 'var(--bad)'}; font-weight:800;">${k.ok ? '✓' : '✗'}</span><span style="min-width:130px; font-weight:600;">${k.label}</span><span class="text-muted">${escapeHtml(k.text)}</span></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- memoria
function memoria(calc, out) {
  const { res, input } = out;
  if (!res || !res.families) return null;
  annotate(res, calc.materials.grade);
  const d = calc.design;
  const g = res.geom;
  const fams = Object.values(res.families);
  const dataRows = d.kind === 'gable'
    ? `${memoRow('Luz · flecha · paneles por faldón', `${fmt(input.L, 2)} m · ${fmt(input.f, 2)} m · ${input.n}`, ART.nodes)}${memoRow('Inclinación', `${fmt(input.alpha, 1)}°`)}${memoRow('Separación entre cabriadas', `${fmt(input.S, 2)} m`)}
       ${memoRow('Cubierta y accesorios', `${fmt(input.gSurf, 1)} kg/m² (sobre la superficie)`)}${memoRow('Peso propio de la cabriada', `${fmt(res.selfUsed, 1)} kg/m² en planta (calculado: ${fmt(res.selfReal, 1)})`)}
       ${memoRow('Sobrecarga', `${fmt(input.p, 0)} kg/m² en proyección horizontal`, ART.roof)}${memoRow('Succión del viento', input.w ? `${fmt(input.w, 0)} kg/m² (${input.windMode === 'full' ? 'vertical y horizontal' : 'componente vertical'})` : 'sin estado de viento', 'CIRSOC 102')}`
    : d.kind === 'custom' ? `${memoRow('Nudos · barras', `${g.nodes.length} · ${g.bars.length}`, ART.nodes)}`
      : `${memoRow('Tipo · luz · altura', `${KINDS.find((k) => k[0] === d.kind)[1].split(' (')[0]} · ${fmt(input.L, 2)} m · ${fmt(input.h, 2)} m`, ART.light)}${memoRow('Paneles · planos', `${input.n} · ${d.planes}`)}
         ${memoRow('Cargas por metro (de toda la viga)', `permanente ${fmt(d.qD, 0)}, sobrecarga ${fmt(d.qL, 0)}${Number(d.qW) ? `, succión ${fmt(d.qW, 0)}` : ''} kg/m`)}${memoRow('Peso propio', `${fmt(res.selfUsed * Number(d.planes || 1), 1)} kg/m (calculado: ${fmt(res.selfReal * Number(d.planes || 1), 1)})`)}`;
  const forceRows = res.bars.map((b) => `<tr><td>Barra ${barName(b)} (${b.fam}, ${fmt(b.len, 2)} m)</td><td style="text-align:right;">${b.Ns.map((v, i) => `${res.states[i].id}: ${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${kg(Math.abs(v))}`).join(' · ')} kg</td></tr>`).join('');
  const famRows = fams.map((f) => {
    const w = famWorst(f);
    const kC = f.bars.indexOf(f.worstC);
    const rc = f.per[kC] && f.per[kC].comp;
    let txt = `T máx ${kg(f.Tmax)} kg; C máx ${kg(f.Cmax)} kg`;
    if (rc && rc.sigX !== undefined && !rc.reason) txt += `. x–x: λ = ${fmt(rc.lamX, 0)}, ω = ${fmt(rc.omX, 2)}, σ = ${kg(rc.sigX)}; local λ1 = ${fmt(rc.lam1, 1)} (${rc.nSp} espacios); y–y: λi = ${fmt(rc.lamI, 1)}, ω = ${fmt(rc.omI, 2)}, σ = ${kg(rc.sigI)} kg/cm²`;
    else if (rc && rc.sigma !== undefined) txt += `. λ = ${fmt(rc.lambda, 0)}, ω = ${fmt(rc.omega, 2)}, σ = ${kg(rc.sigma)} ≤ ${kg(rc.sigmaAllow)} kg/cm²`;
    return memoRow(`${f.label}: ${f.def.mult === 2 ? '2 × ' : ''}${escapeHtml(f.profile ? f.profile.n : '—')}`, `${txt}. Más exigida ${barName(f.bars[w.idx])}: ${fmt(w.util * 100, 0)} % — ${f.ok ? 'verifica' : 'no verifica'}`, f.def.battened ? ART.battened : f.Cmax > 0 ? ART.omega : ART.tension);
  }).join('');
  return {
    title: calc.name,
    sub: `${d.kind === 'gable' ? 'Cabriada de acero' : 'Cercha de acero'} · luz ${fmt(g.L, 2)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, 'Método elástico: σ ≤ σadm = fluencia / 1,6')}${memoRow('Coeficiente ω', calc.materials.omegaTable === 'St37' ? 'Tabla 3 del apunte (St 37)' : `Tabla del ${res.grade.omega}`)}${dataRows}
        ${memoRow('Estados de carga', res.states.map((s) => s.label).join(' · '), ART.states)}</table>
      <h2>2. Esfuerzos en las barras</h2>
      ${res.states.map((_, i) => figureOf(res, i, 'print')).join('')}
      <table>${forceRows}</table>
      <h2>3. Dimensionado por familias</h2>
      <table>${famRows}</table>
      <h2>4. Flechas</h2>
      ${deflMemo(res.defl, 'truss', res.defl && res.defl.bump)}
      <h2>5. Uniones</h2>
      ${jointsMemo(jointsTruss(res, calc))}
      <h2>6. Cómputo y resultado</h2>
      <table>${memoRow('Peso de las barras', `${fmt(res.weight, 0)} kg${res.area ? ` (${fmt(res.weight / res.area, 1)} ${d.kind === 'gable' ? 'kg/m² en planta' : 'kg/m'})` : ''}`, 'Sin chapas nodales, presillas ni uniones')}${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>`,
  };
}
