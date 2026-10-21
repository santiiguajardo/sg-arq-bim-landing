// Nave industrial de acero: pórtico de viga quebrada o triarticulado (dintel de alma llena o reticulado), viento según CIRSOC 102 (2005),
// correas y bases. Motor en js/structural/steel-portal.js y wind.js; método elástico de la cátedra (Estructuras III).
import * as S from '../structural/steel.js';
import { previewSketch } from './structural-spans.js';
import * as P from '../structural/steel-portal.js';
import * as W from '../structural/wind.js';
import { roofLiveLoad } from '../structural/steel-design.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';
import { portalLoads, portalDiagrams } from './structural-draw.js';
import { deflSelect, deflCardHtml, deflMemo, jointsPanel, jointsPortal, jointsMemo } from './structural-joints.js';
import { steelFloorModule, floorVirtual, floorResults, floorMemoria } from './structural-steel.js';

const ART = {
  method: 'Método elástico: σ ≤ σadm = fluencia / 1,6 (apunte "Teoría acero")',
  wind: 'CIRSOC 102 (2005): p = q (G Cp − GCpi), q = 0,613 Kz Kzt Kd V² I; Cp de la Figura 3, Kz de la Tabla 5, GCpi de la Tabla 7',
  roof: 'CIRSOC 101-1982, art. 4.1.7.1 (sobrecarga de cubierta)',
  flexo: 'Flexo-compresión: σ = N/A + M/W y σ = ωN/A + 0,9 M/W; flexo-tracción: σ = M/W + N/A (apunte)',
  truss: 'Dintel reticulado (apunte "Vigas reticuladas" y pórtico triarticulado): cordones C = T = M/h, σ = M y/J + N/A, diagonales D = Q/(n sen α)',
};
const GRADE_OPTS = Object.entries(S.GRADES).map(([k, g]) => [k, g.label]);
const OMEGA_OPTS = [['grade', 'Tabla ω del acero elegido (más conservadora)'], ['St37', 'Tabla 3 del apunte (acero St 37), como en los ejemplos de la cátedra']];
const FAM_OPTS = [['IPE', 'Doble T IPE'], ['IPN', 'Doble T normal (IPN)'], ['HEB', 'Doble T ala ancha (HEB)'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']];
const CHORD_OPTS = [['UPN', 'Perfil U (UPN)'], ['IPN', 'Doble T normal (IPN)']];
const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
let ptab = 'resumen';
let pstate = 0;
const cache = new Map();

function defaultsFor(variant) {
  return {
    type: variant === 'triarticulado' ? 'triarticulado' : 'quebrada', rafter: 'solid', base: 'pinned',
    A: 15, B: 30, H: 5.75, theta: 10, S: 5,
    gCover: 6, gCeil: 6, gPurlin: 10, self: 10, gWall: 32, pAuto: 'yes', roofKind: 'light', p: 30,
    autoSelf: 'yes', windOn: 'yes', V: 51, exposure: 'B', caso: 1, enclosure: 'partial', Kzt: 1, Kd: 0.85, Ie: 1, xFrame: 0, windMix: 'yes',
    kx: 2, sGirt: 1.5, sPurlin: 1.5, lpDiag: 1, hTruss: 0.5, alphaDiag: 60, planes: 2,
  };
}

function paramsOf(calc) {
  const d = calc.design;
  const s = calc.section;
  return {
    type: d.type, rafter: d.rafter, base: d.base, A: Number(d.A), B: Number(d.B), H: Number(d.H), theta: Number(d.theta), S: Number(d.S),
    gSurf: (Number(d.gCover) || 0) + (Number(d.gCeil) || 0) + (Number(d.gPurlin) || 0), gCover: (Number(d.gCover) || 0) + (Number(d.gCeil) || 0), self: Number(d.self), autoSelf: d.autoSelf !== 'no', gWall: Number(d.gWall),
    pAuto: d.pAuto, roofKind: d.roofKind, p: Number(d.p),
    deflLimit: d.deflLimit || 'industrialRigid',
    windOn: d.windOn !== 'no', V: Number(d.V), exposure: d.exposure, caso: Number(d.caso), enclosure: d.enclosure, Kzt: Number(d.Kzt), Kd: Number(d.Kd), Ie: Number(d.Ie), xFrame: Number(d.xFrame), windMix: d.windMix !== 'no',
    kx: Number(d.kx), sGirt: Number(d.sGirt), sPurlin: Number(d.sPurlin), lpDiag: Number(d.lpDiag), hTruss: Number(d.hTruss), alphaDiag: Number(d.alphaDiag), planes: Number(d.planes),
    grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, colTypes: [s.colType], beamTypes: [s.beamType], chordTypes: [s.chordType],
    colName: s.colName && s.colName !== 'auto' ? s.colName : null, beamName: s.beamName && s.beamName !== 'auto' ? s.beamName : null,
    purlinType: s.purlinType, purlinName: s.purlinName && s.purlinName !== 'auto' ? s.purlinName : null,
    fc: Number(calc.materials.fc), sigmaSoil: Number(calc.foundation.sigma), Df: Number(calc.foundation.Df), gammaSoil: Number(calc.foundation.gamma),
  };
}

function compute(calc) {
  const p = paramsOf(calc);
  const key = JSON.stringify(p);
  if (cache.has(key)) return cache.get(key);
  let out;
  if (![p.A, p.H, p.S].every((v) => v > 0) || !(p.theta >= 0 && p.theta <= 45) || (p.windOn && !(p.V > 0 && p.B > 0))) out = { error: 'Completá el ancho, la altura, la separación de pórticos, el largo y la velocidad del viento con valores mayores que cero (pendiente entre 0° y 45°).' };
  else {
    try { out = { res: { ...P.designNave(p), nave: true }, input: p }; } catch (e) { out = { error: 'No se pudo calcular con estos datos.' }; }
  }
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

const stateShort = (st, i) => `${st.id}${st.wind ? '' : ''}`;
function figs(res, i, pal) {
  const st = res.states[i];
  res.baseKind = res.baseKind || 'pinned';
  const common = { nodes: res.geom.nodes, members: res.geom.members, hinge: res.type === 'triarticulado' ? 2 : null, support: res.baseKind };
  return {
    loads: portalLoads({ ...common, title: st.label, dist: st.dist, nodal: st.nodal }, pal),
    diag: portalDiagrams({ ...common, title: `${st.label}: solicitaciones`, pts: st.pts }, pal),
  };
}

export const portalModule = {
  label: 'Nave industrial de acero (pórtico)',
  defaults(variant) {
    return {
      design: defaultsFor(variant),
      section: { colType: 'IPE', beamType: 'IPE', chordType: 'UPN', colName: 'auto', beamName: 'auto', purlinType: 'C', purlinName: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade', fc: 20 },
      foundation: { sigma: 2, Df: 1.5, gamma: 17 },
      verification: {},
    };
  },
  input(calc) { return paramsOf(calc); },
  run(calc) { return compute(calc); },
  wire(root, calc) {
    if (mezzOf(calc)) steelFloorModule.wire(root, mezzOf(calc));
    root.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { ptab = b.dataset.ptab; rerender(); }));
    root.querySelector('#pState')?.addEventListener('change', (e) => { pstate = Number(e.target.value); rerender(); });
  },
  step1(calc) {
    const d = calc.design;
    const f = (Number(d.A) / 2) * Math.tan(Number(d.theta) * Math.PI / 180);
    const pAuto = roofLiveLoad(Number(d.theta), d.roofKind === 'light');
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Nave y pórtico</h3>
          ${previewSketch('portal', d)}
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.type', 'Tipo de pórtico', d.type, [['quebrada', 'De viga quebrada (nudos rígidos, bases articuladas)'], ['triarticulado', 'Triarticulado (articulación en la cumbrera)']])}
            ${selField('design.base', 'Bases', d.base, [['pinned', 'Articuladas (apoyo fijo)'], ['fixed', 'Empotradas']])}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.A', 'Ancho del frente (luz del pórtico) A', d.A, { unit: 'm' })}${numField('design.B', 'Largo de la nave B', d.B, { unit: 'm' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.H', 'Altura de las paredes (aleros)', d.H, { unit: 'm' })}${numField('design.theta', 'Pendiente de la cubierta θ', d.theta, { unit: '°', hint: `Altura de cumbrera ${fmt(Number(d.H) + f, 2)} m.` })}
          </div>
          ${numField('design.S', 'Separación entre pórticos', d.S, { unit: 'm', hint: 'Ancho de influencia de cada pórtico y luz de las correas.' })}
          ${selField('design.rafter', 'Dintel', d.rafter, [['solid', 'De alma llena (perfil laminado)'], ['truss', 'Reticulado']])}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Cargas</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.gCover', 'Cubierta (chapa)', d.gCover, { unit: 'kg/m²', hint: 'Sobre la superficie inclinada.' })}${numField('design.gCeil', 'Cielorraso', d.gCeil, { unit: 'kg/m²' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.gPurlin', 'Correas y accesorios (estimado)', d.gPurlin, { unit: 'kg/m²' })}${numField('design.self', 'Peso propio del pórtico (estimado)', d.self, { unit: 'kg/m²', hint: 'En planta (solo el dintel; las columnas se suman aparte).' })}
          </div>
          ${selField('design.autoSelf', 'Peso propio del dintel', d.autoSelf === 'no' ? 'no' : 'yes', [['yes', 'Ajustar automáticamente al peso calculado'], ['no', 'Usar el estimado (como en la cátedra)']])}
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.pAuto', 'Sobrecarga de cubierta', d.pAuto === 'no' ? 'no' : 'yes', [['yes', 'Según CIRSOC 101-1982 (por pendiente)'], ['no', 'La ingreso yo']])}
            ${d.pAuto === 'no' ? numField('design.p', 'Sobrecarga p', d.p, { unit: 'kg/m²', hint: 'En proyección horizontal.' })
    : selField('design.roofKind', 'Tipo de cubierta', d.roofKind === 'other' ? 'other' : 'light', [['light', 'Liviana'], ['other', 'Otro tipo']], `p = ${fmt(pAuto, 0)} kg/m² (${ART.roof}).`)}
          </div>
          ${numField('design.gWall', 'Peso de las paredes laterales', d.gWall, { unit: 'kg/m²', hint: 'Carga vertical sobre cada columna = peso × altura × separación entre pórticos (apunte: 32 kg/m²).' })}
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3 style="margin-top:0;">Viento <span class="text-muted" style="font-weight:400; font-size:12.5px;">(${ART.wind})</span></h3>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('design.windOn', 'Acción del viento', d.windOn === 'no' ? 'no' : 'yes', [['yes', 'Calcular con CIRSOC 102'], ['no', 'No considerar viento']])}
          ${numField('design.V', 'Velocidad básica V', d.V, { unit: 'm/s', hint: 'Mar del Plata: 51 m/s (apunte). Consultá el mapa del reglamento para tu zona.' })}
          ${selField('design.exposure', 'Exposición', d.exposure, Object.entries(W.EXPOSURES))}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('design.enclosure', 'Cerramiento', d.enclosure, Object.entries(W.ENCLOSURES).map(([k, v]) => [k, v[0]]))}
          ${selField('design.caso', 'Caso de Kz (Tabla 5)', Number(d.caso) === 2 ? 2 : 1, [[1, 'Caso 1 (el del apunte)'], [2, 'Caso 2']])}
          ${numField('design.Kd', 'Kd', d.Kd, { hint: '0,85 para edificios (Tabla 6).' })}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${numField('design.Kzt', 'Kzt (topografía)', d.Kzt, { hint: '1 en zona plana.' })}${numField('design.Ie', 'Factor de importancia I', d.Ie, { hint: 'Categoría II: 1.' })}
          ${numField('design.xFrame', 'Distancia del pórtico al frente (viento sobre el frente)', d.xFrame, { unit: 'm', hint: '0 = pórtico del extremo (el más cargado).' })}
        </div>
        ${selField('design.windMix', 'Estados de viento lateral', d.windMix === 'no' ? 'no' : 'yes', [['yes', 'Los de CIRSOC 102 (GCpi + y −) y además el estado del apunte (valor más desfavorable de cada superficie)'], ['no', 'Solo los de CIRSOC 102']])}
      </div>${mezzStep1(calc)}`;
  },
  step2(calc) {
    const out = compute(calc);
    const res = out.res;
    const d = calc.design;
    const s = calc.section;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Acero y perfiles</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.grade', 'Calidad del acero', calc.materials.grade, GRADE_OPTS, `σadm = ${fmt(S.GRADES[calc.materials.grade].sadm, 0)} kg/cm²`)}
            ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('section.colType', 'Columnas', s.colType, FAM_OPTS)}
            ${d.rafter === 'truss' ? selField('section.chordType', 'Cordones del dintel (uno por cordón)', s.chordType, CHORD_OPTS) : selField('section.beamType', 'Dintel', s.beamType, FAM_OPTS)}
          </div>
          <h4 style="margin:10px 0 6px; font-size:13px;">Longitudes de pandeo</h4>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.kx', 'Columna en el plano del pórtico', Number(d.kx), [[2, 'Pórtico desplazable: Lp = 2 H (conservador)'], [1, 'Lp = H'], [0.7, 'Lp = 0,7 H (empotrada-articulada)']], 'Las columnas se verifican también fuera del plano.')}
            ${numField('design.sGirt', 'Arriostramiento de la columna fuera del plano', d.sGirt, { unit: 'm', hint: 'Separación de correas de pared.' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.sPurlin', 'Separación de correas de cubierta', d.sPurlin, { unit: 'm', hint: 'Arriostra el dintel fuera del plano y es el ancho de influencia de cada correa.' })}
            ${deflSelect('design.deflLimit', d.deflLimit || 'industrialRigid')}
          </div>
          ${d.rafter === 'truss' ? `<h4 style="margin:10px 0 6px; font-size:13px;">Dintel reticulado</h4>
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.hTruss', 'Altura entre cordones h', d.hTruss, { unit: 'm', hint: `Apunte: L/30 = ${fmt(Number(d.A) / 30, 2)} m.` })}${numField('design.alphaDiag', 'Ángulo de las diagonales', d.alphaDiag, { unit: '°', hint: 'Entre 45° y 70°, ideal 60°.' })}
            </div>
            <div class="field-row" style="flex-wrap:wrap;">
              ${numField('design.planes', 'Planos de diagonales', d.planes, { step: 1, hint: '2 en sección rectangular (como en el apunte).' })}${numField('design.lpDiag', 'Longitud de pandeo de diagonales', d.lpDiag, { unit: '× longitud', hint: '1, o 0,75 si son continuas.' })}
            </div>` : ''}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Predimensionado</h3>
          ${res ? `<table class="data-table"><tbody>
            <tr><td>Cargas de estado 1 sobre el pórtico (g + p) × S</td><td style="text-align:right;">${fmt((res.base.gSurf / Math.cos(Number(d.theta) * Math.PI / 180) + res.base.self + res.base.p) * res.base.S, 0)} kg/m (en planta)</td></tr>
            <tr><td>Carga vertical de paredes en cada columna</td><td style="text-align:right;">${kg(res.base.Np)} kg</td></tr>
            ${res.wind ? `<tr><td>Presión dinámica q (V = ${fmt(res.wind.V, 0)} m/s, Kz = ${fmt(res.wind.Kz, 2)})</td><td style="text-align:right;">${fmt(res.wind.q, 1)} kg/m²</td></tr>` : ''}
            <tr><td>Altura de cumbrera · longitud de cada faldón</td><td style="text-align:right;">${fmt(res.geom.H + res.geom.f, 2)} m · ${fmt(res.beamLen, 2)} m</td></tr>
            <tr><td>Momento máximo estimado (envolvente de los estados)</td><td style="text-align:right;">${kg(Math.max(...res.env.map((e) => e.Mmax)))} kg·m</td></tr>
            <tr><td>Wx necesario (solo flexión)</td><td style="text-align:right;">${fmt(Math.max(...res.env.map((e) => e.Mmax)) * 100 / res.grade.sadm, 0)} cm³</td></tr>
          </tbody></table>
          <p class="text-muted" style="font-size:12px; margin:8px 0 0;">El análisis se hace con la rigidez de los perfiles adoptados (se repite hasta que los perfiles no cambian), no con las fórmulas aproximadas de hiperestáticos del apunte. En el paso 3 se elige el perfil más liviano que verifica.</p>` : `<div class="empty-state">${out.error || 'Completá el paso 1.'}</div>`}
        </div>
      </div>${mezzStep2(calc)}`;
  },
  step3(calc, out) {
    const s = calc.section;
    const res = out.res;
    const colNames = S.profileList([s.colType]).map((p) => p.n);
    const beamNames = S.profileList([s.beamType]).map((p) => p.n);
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${selField('section.colName', 'Columnas', s.colName || 'auto', [['auto', 'Automático: la más liviana que verifica'], ...colNames.map((n) => [n, n])])}
      ${calc.design.rafter === 'truss' ? '' : selField('section.beamName', 'Dintel', s.beamName || 'auto', [['auto', 'Automático: el más liviano que verifica'], ...beamNames.map((n) => [n, n])])}
      ${selField('section.purlinType', 'Correas: tipo de perfil', s.purlinType, [['C', 'Costanera C (PGC)'], ['UPN', 'UPN'], ['IPN', 'IPN'], ['IPE', 'IPE'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']])}
      ${selField('section.purlinName', 'Correas', s.purlinName || 'auto', [['auto', 'Automático: la más liviana que verifica'], ...(res ? res.purlin.candidates.slice(0, 80).map((p) => [p.n, p.n]) : [])])}
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.fc', "Hormigón de las bases (f'c)", calc.materials.fc, [20, 25, 30].map((c) => [c, `H-${c}`]))}
        ${numField('foundation.sigma', 'Tensión admisible del suelo', calc.foundation.sigma, { unit: 'kg/cm²' })}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${numField('foundation.Df', 'Profundidad de fundación', calc.foundation.Df, { unit: 'm' })}${numField('foundation.gamma', 'Peso del suelo', calc.foundation.gamma, { unit: 'kN/m³' })}
      </div>
    </div>`;
    const left = `<div>${inputs}${mezzInputs(calc)}</div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${left}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${left}<div>${results(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return memoria(calc, out); },
};

const TABS = [['resumen', 'Resumen'], ['viento', 'Viento'], ['diag', 'Cargas y diagramas'], ['dim', 'Pórtico'], ['correas', 'Correas'], ['bases', 'Bases'], ['uniones', 'Uniones']];

// ---------------------------------------------------------------- entrepiso dentro de la nave (opcional)
function mezzOf(calc) {
  return calc && calc.design && calc.design.mezzOn === 'yes' && calc.design.mezz ? floorVirtual(calc) : null;
}

function mezzStep1(calc) {
  const on = Boolean(mezzOf(calc));
  return `<div class="card" style="margin-top:16px;">
      <h3 style="margin-top:0;">Entrepiso dentro de la nave <span class="text-muted" style="font-weight:400; font-size:12.5px;">(opcional)</span></h3>
      <p class="text-muted" style="font-size:12.5px; margin:-6px 0 10px;">Un entrepiso (altillo) de acero adentro de la nave, con sus propias correas, vigas, columnas y bases. Es independiente del pórtico de la nave. Si la nave no lleva entrepiso, dejalo en “No”.</p>
      ${selField('design.mezzOn', '¿La nave lleva un entrepiso?', on ? 'yes' : 'no', [['no', 'No: solo la nave'], ['yes', 'Sí: agregar un entrepiso']])}
    </div>${on ? `<div style="margin-top:16px;">${steelFloorModule.step1(mezzOf(calc))}</div>` : ''}`;
}

function mezzStep2(calc) {
  const mz = mezzOf(calc);
  return mz ? `<div style="margin-top:16px;"><h3 style="margin:0 0 10px;">Entrepiso: perfiles</h3>${steelFloorModule.step2(mz)}</div>` : '';
}

function mezzInputs(calc) {
  const mz = mezzOf(calc);
  if (!mz) return '';
  const html = steelFloorModule.step3(mz, { error: 'x' });
  const m = /^<div class="grid grid-2" style="align-items:start;">(<div class="card">[\s\S]*?<\/div>)<div class="card"><div class="empty-state">x<\/div><\/div><\/div>$/.exec(html);
  return m ? `<div style="margin-top:16px;">${m[1]}</div>` : '';
}

function mezzBody(calc) {
  const mz = mezzOf(calc);
  if (!mz) return '<div class="card"><div class="empty-state">La nave no lleva entrepiso: activalo en el paso 1.</div></div>';
  const out = steelFloorModule.run(mz);
  if (out.error) return `<div class="card"><div class="empty-state">${escapeHtml(out.error)}</div></div>`;
  return floorResults(mz, out);
}

function mezzSummary(calc) {
  const mz = mezzOf(calc);
  if (!mz) return '';
  const out = steelFloorModule.run(mz);
  if (!out.res) return '';
  const q = out.res.quantities;
  return `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Entrepiso ${pill(out.res.ok)}</h3>
    <table class="data-table"><tbody>
      <tr><td>Superficie</td><td style="text-align:right;">${fmt(out.res.Xtot, 2)} × ${fmt(out.res.Ytot, 2)} m</td></tr>
      <tr><td>Correas · vigas · columnas</td><td style="text-align:right;"><b>${escapeHtml(out.res.corr.profile.n)}</b> · ${[...new Set(out.res.lines.map((l) => `${l.profile.n}${l.mult === 2 ? ' × 2' : ''}`))].map(escapeHtml).join(' / ')} · ${out.res.own.length ? [...new Set(out.res.own.map((n) => n.col.profile.n))].map(escapeHtml).join(' / ') : '—'}</td></tr>
      <tr><td>Acero estructural del entrepiso</td><td style="text-align:right;"><b>${fmt(q.kgTot, 0)} kg (${fmt(q.kgPerM2, 1)} kg/m²)</b></td></tr>
    </tbody></table>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">El detalle está en la pestaña “Entrepiso”.</p></div>`;
}

function tabsOf(calc) {
  return mezzOf(calc) ? [...TABS.slice(0, 6), ['entrepiso', 'Entrepiso'], TABS[6]] : TABS;
}

function memberLine(res, c, label) {
  const k = c.c;
  const st = res.states[c.state];
  return { k, st, label };
}

function colChecks(res, calc) {
  const c = res.colCheck.c;
  const pf = res.col;
  const items = [
    { ok: c.sigma <= c.sigmaAllow, label: 'Flexo-compresión', text: `σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m, N = ${c.N >= 0 ? '+' : '−'}${kg(Math.abs(c.N))} kg${c.omega ? `, λ = ${fmt(c.lambda, 0)}, ω = ${fmt(c.omega, 2)}` : ''})` },
    { ok: c.tau <= c.tauAllow, label: 'Corte', text: `τ = ${kg(c.tau)} ≤ ${kg(c.tauAllow)} kg/cm² (V = ${kg(Math.abs(c.V))} kg)` },
  ];
  return { ok: res.colCheck.c.ok, checks: items, pf };
}

function beamChecks(res) {
  const c = res.beamCheck.c;
  if (res.isTruss) {
    const b = res.beam;
    return { ok: c.ok, checks: [
      { ok: c.sigma <= c.sigmaAllow, label: 'Flexión (Steiner)', text: `σ = M y / J + N / A = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m; J = ${kg(b.J)} cm⁴)` },
      { ok: c.sigC <= c.sigmaAllow, label: 'Cordón comprimido', text: `C = ${kg(c.Cc)} kg, s = ${fmt(b.s * 100, 0)} cm, λ = ${fmt(c.lamC, 0)}, ω = ${c.omC === null ? '—' : fmt(c.omC, 2)}: σ = ${kg(c.sigC)} ≤ ${kg(c.sigmaAllow)} kg/cm²` },
      { ok: c.sigD <= c.sigmaAllow, label: 'Diagonales', text: `D = Q / (n sen α) = ${kg(c.D)} kg, λ = ${fmt(c.lamD, 0)}, ω = ${c.omD === null ? '—' : fmt(c.omD, 2)}: σ = ${kg(c.sigD)} ≤ ${kg(c.sigmaAllow)} kg/cm²` },
    ] };
  }
  return { ok: c.ok, checks: [
    { ok: c.sigma <= c.sigmaAllow, label: c.N >= 0 ? 'Flexo-tracción' : 'Flexo-compresión', text: `σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m, N = ${c.N >= 0 ? '+' : '−'}${kg(Math.abs(c.N))} kg${c.omega ? `, λ = ${fmt(c.lambda, 0)}, ω = ${fmt(c.omega, 2)}` : ''})` },
    { ok: c.tau <= c.tauAllow, label: 'Corte', text: `τ = ${kg(c.tau)} ≤ ${kg(c.tauAllow)} kg/cm² (V = ${kg(Math.abs(c.V))} kg)` },
  ] };
}

function results(calc, out) {
  const { res } = out;
  if (ptab === 'entrepiso' && !mezzOf(calc)) ptab = 'resumen';
  res.baseKind = calc.design.base;
  res.type = calc.design.type;
  const tabs = `<div class="tabs" style="margin-bottom:12px; flex-wrap:wrap;">${tabsOf(calc).map(([k, l]) => `<button class="tab ${ptab === k ? 'active' : ''}" data-ptab="${k}">${l}</button>`).join('')}</div>`;
  const w = res.weights;
  let body = '';
  if (ptab === 'resumen') {
    const upl = res.bases.some((b) => !b.upliftOk);
    body = `<div class="card"><h3 style="margin-top:0;">Nave de ${fmt(res.geom.A, 1)} × ${fmt(out.input.B, 1)} m, pórtico ${res.type === 'triarticulado' ? 'triarticulado' : 'de viga quebrada'} ${pill(res.ok && res.defl.ok && res.purlin.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td>Columnas (2)</td><td style="text-align:right;"><b>${escapeHtml(res.col.n)}</b> ${pill(res.colCheck.c.ok)}</td></tr>
        <tr><td>Dintel ${res.isTruss ? 'reticulado' : 'de alma llena'} (${fmt(res.beamLen * 2, 1)} m)</td><td style="text-align:right;"><b>${res.isTruss ? `2 × ${escapeHtml(res.beam.chord.n)} + ${escapeHtml(res.beam.diag.n)} (h = ${fmt(res.beam.h * 100, 0)} cm)` : escapeHtml(res.beam.profile.n)}</b> ${pill(res.beamCheck.c.ok)}</td></tr>
        <tr><td>Correas de cubierta (luz ${fmt(out.input.S, 1)} m)</td><td style="text-align:right;"><b>${escapeHtml(res.purlin.profile ? res.purlin.profile.n : '—')}</b> ${pill(res.purlin.ok)}</td></tr>
        <tr><td>Bases (2)</td><td style="text-align:right;"><b>${res.bases[0].footing.ok ? `${fmt(res.bases[0].footing.B / 10, 0)} × ${fmt(res.bases[0].footing.L / 10, 0)} × ${fmt(res.bases[0].footing.h / 10, 0)} cm` : '—'}</b>${upl ? ' <span class="tag tag-media">con levantamiento por viento</span>' : ''}</td></tr>
        <tr><td>Acero del pórtico: columnas · dintel</td><td style="text-align:right;">${kg(w.cols)} · ${kg(w.beam)} kg (${fmt(w.total, 0)} kg por pórtico)</td></tr>
        <tr><td>Peso propio supuesto · calculado del dintel</td><td style="text-align:right;">${fmt(w.selfAssumed, 1)} · ${fmt(w.selfReal, 1)} kg/m² en planta ${w.selfReal > w.selfAssumed * 1.15 ? '<span class="tag tag-media">mayor que el supuesto</span>' : ''}</td></tr>
        <tr><td>Reacciones máximas por base: vertical · levantamiento · horizontal</td><td style="text-align:right;">${kg(Math.max(...res.bases.map((b) => b.Nmax)))} · ${kg(Math.max(...res.bases.map((b) => b.uplift)))} · ${kg(Math.max(...res.bases.map((b) => b.H)))} kg</td></tr>
        <tr><td>Estados de carga analizados</td><td style="text-align:right;">${res.states.length} (${res.iterations} iteraciones de rigidez)</td></tr>
      </tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${ART.method}. Cargas de servicio sin mayorar. Se analiza un pórtico plano con las rigideces de los perfiles adoptados. No se verifican el pandeo lateral-torsional (se supone el ala comprimida arriostrada por correas) ni los arriostramientos longitudinales.</p></div>${deflCardHtml(res.defl, 'portal', res.bumps ? res.bumps.beam + res.bumps.col : 0)}`;
  } else if (ptab === 'viento') {
    const wd = res.wind;
    if (!wd) body = '<div class="card"><p class="text-muted">No se consideró la acción del viento.</p></div>';
    else {
      const fmtP = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 1)}`;
      body = `<div class="card"><h3 style="margin-top:0;">Presiones del viento (kg/m²)</h3>
        <p class="text-muted" style="font-size:12.5px; margin:0 0 8px;">Kz = ${fmt(wd.Kz, 2)} (altura de referencia ${fmt(wd.hq, 2)} m, exposición ${wd.exposure}, caso ${wd.caso}), Kzt = ${fmt(wd.Kzt, 2)}, Kd = ${fmt(wd.Kd, 2)}, V = ${fmt(wd.V, 0)} m/s, I = ${fmt(wd.I, 2)} → <b>q = ${fmt(wd.q, 1)} kg/m²</b>; G = ${fmt(wd.G, 2)}; GCpi = ±${fmt(wd.gcpi, 2)}. Signo: + presión hacia la superficie, − succión.</p>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Viento sobre el lateral (normal a la cumbrera)</th><th style="text-align:right;">Pared barlovento</th><th style="text-align:right;">Faldón barlovento</th><th style="text-align:right;">Faldón sotavento</th><th style="text-align:right;">Pared sotavento</th></tr></thead><tbody>
        ${wd.lateral.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}${c.roofOption === 'pos' ? ', presión en el faldón' : ''}</td><td style="text-align:right;">${fmtP(c.wallWindward.p)} <span class="text-muted">(Cp ${fmt(c.wallWindward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.roofWindward.p)} <span class="text-muted">(${fmt(c.roofWindward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.roofLeeward.p)} <span class="text-muted">(${fmt(c.roofLeeward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.wallLeeward.p)} <span class="text-muted">(${fmt(c.wallLeeward.cp, 2)})</span></td></tr>`).join('')}</tbody></table></div>
        <div class="table-wrap" style="margin-top:10px;"><table class="data-table"><thead><tr><th>Viento sobre el frente (paralelo a la cumbrera)</th><th style="text-align:right;">Cubierta</th><th style="text-align:right;">Paredes laterales</th><th style="text-align:right;">Pared del frente</th></tr></thead><tbody>
        ${wd.frontal.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}</td><td style="text-align:right;">${fmtP(c.roof.p)} <span class="text-muted">(Cp ${fmt(c.roof.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.side.p)} <span class="text-muted">(${fmt(c.side.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.wallFront.p)} <span class="text-muted">(${fmt(c.wallFront.cp, 2)})</span></td></tr>`).join('')}</tbody></table></div>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">p = q (G Cp − GCpi), con una sola presión dinámica qh para todas las superficies (simplificación del apunte; la pared a barlovento usa qh, del lado seguro). Para h/L se usa la altura de alero si θ ≤ 10° y la altura media si no. Cp con interpolación lineal de la Figura 3. Las presiones locales para correas y revestimientos no se calculan.</p></div>`;
    }
  } else if (ptab === 'diag') {
    if (pstate >= res.states.length) pstate = 0;
    const f = figs(res, pstate, 'screen');
    const st = res.states[pstate];
    body = `<div class="card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;"><h3 style="margin:0;">Estado de carga</h3>
      <select id="pState" style="max-width:100%;">${res.states.map((s2, i) => `<option value="${i}" ${i === pstate ? 'selected' : ''}>${escapeHtml(s2.label.length > 70 ? s2.label.slice(0, 68) + '…' : s2.label)}</option>`).join('')}</select></div>
      ${f.loads}${f.diag}
      <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Reacciones: izquierda H = ${kg(st.reactions[0].fx)}, V = ${kg(st.reactions[0].fy)} kg · derecha H = ${kg(st.reactions[1].fx)}, V = ${kg(st.reactions[1].fy)} kg.${res.type === 'triarticulado' ? ' Momento nulo en la articulación de la cumbrera.' : ''}</p></div>`;
  } else if (ptab === 'dim') {
    const cc = colChecks(res, calc);
    const bc = beamChecks(res);
    body = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Columnas: ${escapeHtml(res.col.n)} ${pill(cc.ok)}</h3>
      <p class="text-muted" style="font-size:12.5px; margin:0 0 6px;">A = ${fmt(res.col.A, 1)} cm², Wx = ${fmt(res.col.Wx, 0)} cm³, ix = ${fmt(res.col.ix, 2)} cm, iy = ${fmt(res.col.iy, 2)} cm · sección más exigida en el estado ${escapeHtml(res.states[res.colCheck.state].id)} · envolvente: M = ${kg(Math.max(res.env[0].Mmax, res.env[3].Mmax))} kg·m, N compresión ${kg(Math.max(res.env[0].Nc, res.env[3].Nc))} kg</p>
      ${cc.checks.map((k) => `<div style="display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:${k.ok ? 'var(--good)' : 'var(--bad)'}; font-weight:800;">${k.ok ? '✓' : '✗'}</span><span style="min-width:120px; font-weight:600;">${k.label}</span><span class="text-muted">${escapeHtml(k.text)}</span></div>`).join('')}</div>
      <div class="card"><h3 style="margin-top:0;">Dintel: ${res.isTruss ? `2 × ${escapeHtml(res.beam.chord.n)} y diagonales ${escapeHtml(res.beam.diag.n)}` : escapeHtml(res.beam.profile.n)} ${pill(bc.ok)}</h3>
      <p class="text-muted" style="font-size:12.5px; margin:0 0 6px;">${res.isTruss ? `Altura h = ${fmt(res.beam.h * 100, 0)} cm, α = ${fmt(res.beam.alpha, 0)}°, nudos cada ${fmt(res.beam.s * 100, 0)} cm; ${ART.truss}.` : `A = ${fmt(res.beam.profile.A, 1)} cm², Wx = ${fmt(res.beam.profile.Wx, 0)} cm³; ${ART.flexo}.`} Sección más exigida en el estado ${escapeHtml(res.states[res.beamCheck.state].id)}.</p>
      ${bc.checks.map((k) => `<div style="display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:${k.ok ? 'var(--good)' : 'var(--bad)'}; font-weight:800;">${k.ok ? '✓' : '✗'}</span><span style="min-width:120px; font-weight:600;">${k.label}</span><span class="text-muted">${escapeHtml(k.text)}</span></div>`).join('')}</div>`;
  } else if (ptab === 'correas') {
    const pu = res.purlin;
    body = !pu.profile ? '<div class="card"><p>No hay perfil que verifique.</p></div>' : `<div class="card"><h3 style="margin-top:0;">Correa ${escapeHtml(pu.profile.n)} ${pill(pu.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td>Luz · separación · inclinación</td><td style="text-align:right;">${fmt(out.input.S, 2)} m · ${fmt(out.input.sPurlin, 2)} m · ${fmt(out.input.theta, 1)}°</td></tr>
        <tr><td>Cargas por metro: permanente · sobrecarga · succión máxima del viento</td><td style="text-align:right;">${fmt(pu.gH + pu.profile.G, 1)} · ${fmt(pu.pH, 1)} · ${fmt(pu.sv, 1)} kg/m</td></tr>
        ${pu.states.map((s2) => `<tr><td>${escapeHtml(s2.label)}</td><td style="text-align:right;">σ ${kg(s2.chk.sigma)} / ${kg(s2.chk.sigmaAllow)} kg/cm² · f ${fmt(s2.chk.f, 2)} / ${fmt(s2.chk.fAllow, 2)} cm</td></tr>`).join('')}
        ${pu.conc ? `<tr><td>Carga concentrada de 100 kg</td><td style="text-align:right;">σ ${kg(pu.conc.sigma)} / ${kg(pu.conc.sigmaAllow)} kg/cm²</td></tr>` : ''}
      </tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Flexión oblicua con la succión máxima normal a la cubierta de los estados de viento (${fmt(res.suction, 0)} kg/m²) y la sobrecarga de ${fmt(res.base.p, 0)} kg/m²; método del apunte "Correas a flexión oblicua" (σ = 900 kg/cm² en chapa plegada).</p></div>`;
  } else if (ptab === 'entrepiso') {
    body = mezzBody(calc);
  } else if (ptab === 'uniones') {
    body = jointsPanel(calc, jointsPortal(res, calc));
  } else {
    body = `<div class="card"><h3 style="margin-top:0;">Bases de hormigón armado</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Base</th><th style="text-align:right;">Vertical (kg)</th><th style="text-align:right;">Levantamiento (kg)</th><th style="text-align:right;">Horizontal (kg)</th><th>Dimensiones</th><th>Anclaje</th></tr></thead><tbody>
      ${res.bases.map((b) => `<tr><td>${b.idx === 0 ? 'Izquierda' : 'Derecha'}</td><td style="text-align:right;">${kg(b.Nmax)}</td><td style="text-align:right;">${kg(b.uplift)}</td><td style="text-align:right;">${kg(b.H)}</td><td>${b.footing.ok ? `${fmt(b.footing.B / 10, 0)} × ${fmt(b.footing.L / 10, 0)} × ${fmt(b.footing.h / 10, 0)} cm` : escapeHtml(b.footing.reason || '—')}</td><td>${b.uplift <= 0 ? '—' : b.upliftOk ? 'verifica' : `no verifica: peso ${kg(b.weight)} < 1,5 T = ${kg(b.upliftWeight)} kg${b.upliftSide ? `; hace falta una base de ${fmt(b.upliftSide * 100, 0)} × ${fmt(b.upliftSide * 100, 0)} cm o un bloque de anclaje` : ''}`}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Base centrada para la carga vertical máxima (CIRSOC 201, con la parte permanente y la sobrecarga de cubierta). Levantamiento: el peso de la base más el suelo sobre ella debe ser al menos 1,5 T (criterio del apunte para anclajes). La fuerza horizontal de las bases (rozamiento o tensor) y el anclaje de la columna (placa y bulones) se verifican en la pestaña Uniones.</p></div>`;
  }
  if (ptab === 'resumen') body += mezzSummary(calc);
  return tabs + body;
}

// ---------------------------------------------------------------- memoria
// La memoria de la nave más, si lleva entrepiso, la memoria del entrepiso a continuación
function memoria(calc, out) {
  const doc = memoriaNave(calc, out);
  const mz = mezzOf(calc);
  if (!doc || !mz) return doc;
  const fo = steelFloorModule.run(mz);
  const fd = fo.res ? floorMemoria(mz, fo) : null;
  if (!fd) return doc;
  const inner = fd.html.replace(/<h2>(\d+\. )?/g, '<h2>Entrepiso: ');
  return { ...doc, sub: `${doc.sub} · con entrepiso de ${fmt(fo.res.Xtot, 2)} × ${fmt(fo.res.Ytot, 2)} m`, html: `${doc.html}<h2>ENTREPISO DENTRO DE LA NAVE</h2>${inner}` };
}

function memoriaNave(calc, out) {
  const { res, input } = out;
  if (!res || !res.col) return null;
  res.baseKind = calc.design.base;
  res.type = calc.design.type;
  const d = calc.design;
  const wd = res.wind;
  const fmtP = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 1)}`;
  const gov = (idx) => idx;
  const sIdx = res.colCheck.state;
  const bIdx = res.beamCheck.state;
  const cc = colChecks(res, calc);
  const bc = beamChecks(res);
  const f0 = figs(res, 0, 'print');
  const fCol = sIdx === 0 ? null : figs(res, sIdx, 'print');
  const fBeam = bIdx === sIdx || bIdx === 0 ? null : figs(res, bIdx, 'print');
  const rows = (items) => items.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('');
  const pu = res.purlin;
  return {
    title: calc.name,
    sub: `Nave industrial de acero · pórtico ${res.type === 'triarticulado' ? 'triarticulado' : 'de viga quebrada'} · ${fmt(res.geom.A, 1)} × ${fmt(input.B, 1)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, ART.method)}${memoRow('Coeficiente ω', calc.materials.omegaTable === 'St37' ? 'Tabla 3 del apunte (St 37)' : `Tabla del ${res.grade.omega}`)}
        ${memoRow('Frente A · largo B · altura de aleros · pendiente', `${fmt(input.A, 2)} m · ${fmt(input.B, 2)} m · ${fmt(input.H, 2)} m · ${fmt(input.theta, 1)}°`)}${memoRow('Separación entre pórticos', `${fmt(input.S, 2)} m`)}
        ${memoRow('Pórtico', `${res.type === 'triarticulado' ? 'triarticulado' : 'de viga quebrada'}, bases ${d.base === 'fixed' ? 'empotradas' : 'articuladas'}, dintel ${res.isTruss ? 'reticulado' : 'de alma llena'}`)}
        ${memoRow('Cargas permanentes', `cubierta + cielorraso + correas = ${fmt(input.gSurf, 0)} kg/m² (superficie) + peso propio del dintel ${fmt(res.base.self, 1)} kg/m² (planta)${res.selfAdjusted ? ', ajustado al calculado' : ''}`, 'Apunte "Nave industrial"')}
        ${memoRow('Sobrecarga de cubierta', `${fmt(res.base.p, 0)} kg/m² en proyección horizontal`, ART.roof)}${memoRow('Paredes laterales', `${fmt(input.gWall, 0)} kg/m² → ${kg(res.base.Np)} kg por columna`)}</table>
      ${wd ? `<h2>2. Acción del viento</h2>
      <table>${memoRow('Datos', `V = ${fmt(wd.V, 0)} m/s; exposición ${wd.exposure} (caso ${wd.caso}); Kz = ${fmt(wd.Kz, 2)} a ${fmt(wd.hq, 2)} m; Kzt = ${fmt(wd.Kzt, 2)}; Kd = ${fmt(wd.Kd, 2)}; I = ${fmt(wd.I, 2)}`, ART.wind)}
        ${memoRow('Presión dinámica', `q = 0,613 Kz Kzt Kd V² I = ${fmt(wd.q, 1)} kg/m² (1 kg = 10 N)`)}${memoRow('G · GCpi', `${fmt(wd.G, 2)} · ±${fmt(wd.gcpi, 2)}`)}
        ${wd.lateral.map((c) => memoRow(`Lateral, GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}${c.roofOption === 'pos' ? ' (presión en el faldón)' : ''}`, `pared barlovento ${fmtP(c.wallWindward.p)}; faldón barlovento ${fmtP(c.roofWindward.p)}; faldón sotavento ${fmtP(c.roofLeeward.p)}; pared sotavento ${fmtP(c.wallLeeward.p)} kg/m²`, 'Cp: Figura 3')).join('')}
        ${wd.frontal.map((c) => memoRow(`Frente, GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}`, `cubierta ${fmtP(c.roof.p)}; paredes laterales ${fmtP(c.side.p)} kg/m²`)).join('')}</table>` : ''}
      <h2>3. Estados de carga y solicitaciones</h2>
      <table>${res.states.map((s2, i) => memoRow(`${s2.id}`, `${escapeHtml(s2.label)}; reacciones H ${kg(s2.reactions[0].fx)} / ${kg(s2.reactions[1].fx)}, V ${kg(s2.reactions[0].fy)} / ${kg(s2.reactions[1].fy)} kg`)).join('')}</table>
      ${f0.loads}${f0.diag}
      ${fCol ? `${fCol.loads}${fCol.diag}` : ''}${fBeam ? `${fBeam.loads}${fBeam.diag}` : ''}
      <table>${res.env.map((e, k) => memoRow(['Columna izquierda', 'Faldón izquierdo', 'Faldón derecho', 'Columna derecha'][k], `M máx ${kg(e.Mmax)} kg·m; V máx ${kg(e.Vmax)} kg; N tracción ${kg(e.Nt)} kg, compresión ${kg(e.Nc)} kg`)).join('')}</table>
      <h2>4. Dimensionado del pórtico</h2>
      <table>${memoRow('Columnas', `${escapeHtml(res.col.n)}: A = ${fmt(res.col.A, 1)} cm², Wx = ${fmt(res.col.Wx, 0)} cm³; Lp = ${fmt(input.kx, 1)} H en el plano, ${fmt(input.sGirt, 2)} m fuera del plano`, ART.flexo)}${rows(cc.checks)}
        ${memoRow('Dintel', res.isTruss ? `2 × ${escapeHtml(res.beam.chord.n)}, diagonales ${escapeHtml(res.beam.diag.n)}, h = ${fmt(res.beam.h * 100, 0)} cm, α = ${fmt(res.beam.alpha, 0)}°` : `${escapeHtml(res.beam.profile.n)}: A = ${fmt(res.beam.profile.A, 1)} cm², Wx = ${fmt(res.beam.profile.Wx, 0)} cm³`, res.isTruss ? ART.truss : ART.flexo)}${rows(bc.checks)}
        ${memoRow('Peso del pórtico', `${kg(res.weights.total)} kg (peso propio calculado del dintel ${fmt(res.weights.selfReal, 1)} kg/m² en planta, supuesto ${fmt(res.weights.selfAssumed, 1)})`)}</table>
      <h2>5. Correas de cubierta</h2>
      <table>${pu.profile ? `${memoRow('Correa', `${escapeHtml(pu.profile.n)}: luz ${fmt(input.S, 2)} m, cada ${fmt(input.sPurlin, 2)} m`, 'Apunte "Correas a flexión oblicua"')}
        ${pu.states.map((s2) => memoRow(escapeHtml(s2.label), `σ = ${kg(s2.chk.sigma)} ≤ ${kg(s2.chk.sigmaAllow)} kg/cm²; f = ${fmt(s2.chk.f, 2)} ≤ ${fmt(s2.chk.fAllow, 2)} cm`)).join('')}
        ${pu.conc ? memoRow('Carga concentrada de 100 kg', `σ = ${kg(pu.conc.sigma)} ≤ ${kg(pu.conc.sigmaAllow)} kg/cm²`) : ''}` : memoRow('Correa', 'sin solución')}</table>
      <h2>6. Bases</h2>
      <table>${res.bases.map((b) => memoRow(`Base ${b.idx === 0 ? 'izquierda' : 'derecha'}`, `N = ${kg(b.Nmax)} kg; levantamiento ${kg(b.uplift)} kg; H = ${kg(b.H)} kg; ${b.footing.ok ? `${fmt(b.footing.B / 10, 0)} × ${fmt(b.footing.L / 10, 0)} × ${fmt(b.footing.h / 10, 0)} cm` : escapeHtml(b.footing.reason || '—')}${b.uplift > 0 ? (b.upliftOk ? '; anclaje verifica' : `; anclaje no verifica (peso ${kg(b.weight)} < 1,5 T = ${kg(b.upliftWeight)} kg)`) : ''}`, 'CIRSOC 201; anclaje: peso ≥ 1,5 T (apunte)')).join('')}</table>
      <h2>7. Flechas</h2>
      ${deflMemo(res.defl, 'portal', res.bumps ? res.bumps.beam + res.bumps.col : 0)}
      <h2>8. Uniones</h2>
      ${jointsMemo(jointsPortal(res, calc))}
      <h2>9. Resultado</h2>
      <table>${memoRow('Pórtico', res.ok && res.defl.ok ? 'verifica' : 'no verifica')}${memoRow('Correas', pu.ok ? 'verifica' : 'no verifica')}${memoRow('No verificado', 'pandeo lateral-torsional, armadura suplementaria y del pedestal de los anclajes, bloque de corte de las chapas de nudo, arriostramientos y viento sobre correas y revestimientos')}</table>`,
  };
}
