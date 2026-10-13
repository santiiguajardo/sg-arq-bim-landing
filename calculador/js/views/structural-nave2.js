// Naves de acero con cabriada apoyada sobre columnas y con arco parabólico (sobre columnas o desde el terreno). Motor: js/structural/steel-nave2.js.
import * as S from '../structural/steel.js';
import * as N2 from '../structural/steel-nave2.js';
import * as T from '../structural/steel-truss.js';
import * as W from '../structural/wind.js';
import { roofLiveLoad } from '../structural/steel-design.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';
import { trussFigure, portalLoads, portalDiagrams } from './structural-draw.js';
import { previewSketch } from './structural-spans.js';
import { famCard, annotate, barName } from './structural-truss.js';
import { deflSelect, deflCardHtml, deflMemo, jointsPanel, jointsCab, jointsArch, jointsMemo } from './structural-joints.js';

const GRADE_OPTS = Object.entries(S.GRADES).map(([k, g]) => [k, g.label]);
const OMEGA_OPTS = [['grade', 'Tabla ω del acero elegido (más conservadora)'], ['St37', 'Tabla 3 del apunte (acero St 37), como en los ejemplos de la cátedra']];
const FAM_OPTS = [['IPE', 'Doble T IPE'], ['IPN', 'Doble T normal (IPN)'], ['HEB', 'Doble T ala ancha (HEB)'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']];
const SECTION_OPTS = Object.entries(T.SECTION_TYPES).map(([k, v]) => [k, v.label]);
const CHORD_OPTS = [['UPN', 'Perfil U (UPN)'], ['IPN', 'Doble T normal (IPN)']];
const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const ART = {
  method: 'Método elástico: σ ≤ σadm = fluencia / 1,6 (apunte "Teoría acero")',
  wind: 'CIRSOC 102 (2005): p = q (G Cp − GCpi), q = 0,613 Kz Kzt Kd V² I',
  roof: 'CIRSOC 101-1982, art. 4.1.7.1 (sobrecarga de cubierta)',
  flexo: 'Flexo-compresión: σ = N/A + M/W y σ = ωN/A + 0,9 M/W; flexo-tracción: σ = M/W + N/A (apunte)',
  arch: 'Cubiertas abovedadas: CIRSOC 102 Tabla 8 (cuarto a barlovento, mitad central, cuarto a sotavento)',
};
let ntab = 'resumen';
let nstate = 0;
const cache = new Map();

function commonDefaults() {
  return {
    A: 15, B: 30, H: 5.75, S: 5, gCover: 6, gCeil: 6, gPurlin: 10, self: 10, autoSelf: 'yes', gWall: 32, pAuto: 'yes', roofKind: 'light', p: 30,
    windOn: 'yes', V: 51, exposure: 'B', caso: 1, enclosure: 'partial', Kzt: 1, Kd: 0.85, Ie: 1, xFrame: 0, windMix: 'yes',
    kx: 2, sGirt: 1.5, sPurlin: 1.5, lpDiag: 1,
  };
}

function commonParams(calc) {
  const d = calc.design;
  const s = calc.section;
  return {
    A: Number(d.A), B: Number(d.B), H: Number(d.H), S: Number(d.S), gSurf: (Number(d.gCover) || 0) + (Number(d.gCeil) || 0) + (Number(d.gPurlin) || 0), gCover: (Number(d.gCover) || 0) + (Number(d.gCeil) || 0),
    self: Number(d.self), autoSelf: d.autoSelf !== 'no', gWall: Number(d.gWall), pAuto: d.pAuto, roofKind: d.roofKind, p: Number(d.p),
    windOn: d.windOn !== 'no', V: Number(d.V), exposure: d.exposure, caso: Number(d.caso), enclosure: d.enclosure, Kzt: Number(d.Kzt), Kd: Number(d.Kd), Ie: Number(d.Ie), xFrame: Number(d.xFrame), windMix: d.windMix !== 'no',
    kx: Number(d.kx), sGirt: Number(d.sGirt), sPurlin: Number(d.sPurlin), lpDiag: Number(d.lpDiag), base: d.base, deflLimit: d.deflLimit || 'industrialRigid',
    grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, colTypes: [s.colType], colName: s.colName && s.colName !== 'auto' ? s.colName : null,
    purlinType: s.purlinType, purlinName: s.purlinName && s.purlinName !== 'auto' ? s.purlinName : null,
    fc: Number(calc.materials.fc), sigmaSoil: Number(calc.foundation.sigma), Df: Number(calc.foundation.Df), gammaSoil: Number(calc.foundation.gamma),
  };
}

function geometryCard(calc, arch) {
  const d = calc.design;
  const f = Number(d.f);
  const theta = Math.atan(f / (Number(d.A) / 2)) * 180 / Math.PI;
  return `<div class="card">
    <h3 style="margin-top:0;">${arch ? 'Nave con arco parabólico' : 'Nave con cabriada sobre columnas'}</h3>
    ${previewSketch(arch ? 'arch' : 'cab', d)}
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.A', 'Luz (ancho del frente) A', d.A, { unit: 'm' })}${numField('design.B', 'Largo de la nave B', d.B, { unit: 'm' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.H', arch ? 'Altura de las columnas (0 = el arco arranca del terreno)' : 'Altura de las columnas', d.H, { unit: 'm' })}
      ${numField('design.f', arch ? 'Flecha del arco f' : 'Flecha de la cabriada f', d.f, { unit: 'm', hint: arch ? `f/A = ${fmt(f / Number(d.A), 2)}; inclinación en el arranque ${fmt(Math.atan(4 * f / Number(d.A)) * 180 / Math.PI, 0)}°.` : `Pendiente α = ${fmt(theta, 1)}°.` })}
    </div>
    ${numField('design.S', 'Separación entre pórticos', d.S, { unit: 'm', hint: 'Ancho de influencia y luz de las correas.' })}
    ${arch ? `<div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.hingeCrown', 'Clave', d.hingeCrown === 'no' ? 'no' : 'yes', [['yes', 'Articulada (arco de tres articulaciones)'], ['no', 'Continua (rígida)']])}
      ${selField('design.joint', 'Unión del arco con las columnas', d.joint === 'pinned' ? 'pinned' : 'rigid', [['rigid', 'Rígida'], ['pinned', 'Articulada']])}
    </div>
    ${selField('design.base', 'Bases', d.base === 'fixed' ? 'fixed' : 'pinned', [['pinned', 'Articuladas'], ['fixed', 'Empotradas']], 'Con la clave y la unión articuladas hacen falta bases empotradas (si no, es un mecanismo).')}` : `
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.n', 'Paneles por faldón', d.n, { step: 1, hint: 'Entre 2 y 12.' })}
      ${selField('design.diag', 'Diagonales', d.diag, [['down', 'Bajan hacia el centro'], ['up', 'Suben hacia el centro']])}
    </div>
    <p class="text-muted" style="font-size:12px; margin:6px 0 0;">La cabriada se apoya articulada sobre las columnas, que se empotran en la base (si no, el conjunto sería un mecanismo): las columnas toman el viento horizontal y quedan unidas por la cabriada.</p>`}
  </div>`;
}

function loadsCard(calc, arch) {
  const d = calc.design;
  const f = Number(d.f);
  const theta = arch ? Math.atan(4 * f / Number(d.A)) * 180 / Math.PI : Math.atan(f / (Number(d.A) / 2)) * 180 / Math.PI;
  const pAuto = roofLiveLoad(theta, d.roofKind === 'light');
  return `<div class="card">
    <h3 style="margin-top:0;">Cargas</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.gCover', 'Cubierta (chapa)', d.gCover, { unit: 'kg/m²', hint: 'Sobre la superficie.' })}${numField('design.gCeil', 'Cielorraso', d.gCeil, { unit: 'kg/m²' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.gPurlin', 'Correas y accesorios (estimado)', d.gPurlin, { unit: 'kg/m²' })}${numField('design.self', arch ? 'Peso propio del arco (estimado)' : 'Peso propio de la cabriada (estimado)', d.self, { unit: 'kg/m²', hint: 'En planta.' })}
    </div>
    ${selField('design.autoSelf', 'Peso propio', d.autoSelf === 'no' ? 'no' : 'yes', [['yes', 'Ajustar automáticamente al calculado'], ['no', 'Usar el estimado']])}
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.pAuto', 'Sobrecarga', d.pAuto === 'no' ? 'no' : 'yes', [['yes', 'Según CIRSOC 101-1982 (por pendiente)'], ['no', 'La ingreso yo']])}
      ${d.pAuto === 'no' ? numField('design.p', 'Sobrecarga p', d.p, { unit: 'kg/m²', hint: 'En proyección horizontal.' }) : selField('design.roofKind', 'Tipo de cubierta', d.roofKind === 'other' ? 'other' : 'light', [['light', 'Liviana'], ['other', 'Otro tipo']], `p = ${fmt(pAuto, 0)} kg/m² (${ART.roof}${arch ? ', con la inclinación del arranque' : ''}).`)}
    </div>
    ${numField('design.gWall', 'Peso de las paredes laterales', d.gWall, { unit: 'kg/m²', hint: 'Carga vertical en cada columna = peso × altura × separación.' })}
  </div>`;
}

function windCard(calc) {
  const d = calc.design;
  return `<div class="card" style="margin-top:16px;">
    <h3 style="margin-top:0;">Viento <span class="text-muted" style="font-weight:400; font-size:12.5px;">(${ART.wind})</span></h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.windOn', 'Acción del viento', d.windOn === 'no' ? 'no' : 'yes', [['yes', 'Calcular con CIRSOC 102'], ['no', 'No considerar viento']])}
      ${numField('design.V', 'Velocidad básica V', d.V, { unit: 'm/s', hint: 'Mar del Plata: 51 m/s (apunte).' })}${selField('design.exposure', 'Exposición', d.exposure, Object.entries(W.EXPOSURES))}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.enclosure', 'Cerramiento', d.enclosure, Object.entries(W.ENCLOSURES).map(([k, v]) => [k, v[0]]))}
      ${selField('design.caso', 'Caso de Kz', Number(d.caso) === 2 ? 2 : 1, [[1, 'Caso 1 (el del apunte)'], [2, 'Caso 2']])}${numField('design.Kd', 'Kd', d.Kd)}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.Kzt', 'Kzt', d.Kzt)}${numField('design.Ie', 'Factor de importancia I', d.Ie)}${numField('design.xFrame', 'Distancia del pórtico al frente', d.xFrame, { unit: 'm', hint: 'Viento sobre el frente; 0 = el más cargado.' })}
    </div>
    ${selField('design.windMix', 'Estados de viento lateral', d.windMix === 'no' ? 'no' : 'yes', [['yes', 'Los de CIRSOC 102 y además el del apunte (valor más desfavorable de cada zona)'], ['no', 'Solo los de CIRSOC 102']])}
  </div>`;
}

function materialsCard(calc, extra = '') {
  return `<div class="card"><h3 style="margin-top:0;">Acero</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('materials.grade', 'Calidad del acero', calc.materials.grade, GRADE_OPTS, `σadm = ${fmt(S.GRADES[calc.materials.grade].sadm, 0)} kg/cm²`)}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
    </div>${extra}</div>`;
}

const tabsHtml = (list) => `<div class="tabs" style="margin-bottom:12px; flex-wrap:wrap;">${list.map(([k, l]) => `<button class="tab ${ntab === k ? 'active' : ''}" data-ntab="${k}">${l}</button>`).join('')}</div>`;

function baseTable(res) {
  return `<div class="card"><h3 style="margin-top:0;">Bases de hormigón armado</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Base</th><th style="text-align:right;">Vertical (kg)</th><th style="text-align:right;">Momento (kg·m)</th><th style="text-align:right;">Horizontal (kg)</th><th style="text-align:right;">Levantamiento (kg)</th><th>Dimensiones</th></tr></thead><tbody>
    ${res.bases.map((b) => `<tr><td>${b.idx === 0 ? 'Izquierda' : 'Derecha'}</td><td style="text-align:right;">${kg(b.Nmax)}</td><td style="text-align:right;">${kg(b.Mmax)}</td><td style="text-align:right;">${kg(b.H)}</td><td style="text-align:right;">${kg(b.uplift)}${b.uplift > 0 && !b.upliftOk ? ' (no verifica 1,5 T)' : ''}</td><td>${b.footing.ok ? `${fmt(b.footing.B / 10, 0)} × ${fmt(b.footing.L / 10, 0)} × ${fmt(b.footing.h / 10, 0)} cm` : escapeHtml(b.footing.reason || '—')}${b.partial ? ' (contacto parcial)' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Base cuadrada de lado ≥ ${fmt(Math.max(...res.bases.map((b) => b.c)), 2)} m: con el momento se verifica la presión máxima del suelo (contacto parcial si e > c/6) y se dimensiona con CIRSOC 201 aplicando esa presión máxima a toda la planta (del lado seguro). <b>El vuelco no está verificado.</b> La fuerza horizontal (rozamiento o tensor) y el anclaje de la columna se verifican en la pestaña Uniones.</p></div>`;
}

function purlinCard(res, input) {
  const pu = res.purlin;
  if (!pu.profile) return '<div class="card"><p>No hay perfil de correa que verifique.</p></div>';
  return `<div class="card"><h3 style="margin-top:0;">Correa ${escapeHtml(pu.profile.n)} ${pill(pu.ok)}</h3><table class="data-table"><tbody>
    <tr><td>Luz · separación</td><td style="text-align:right;">${fmt(input.S, 2)} m · ${fmt(input.sPurlin, 2)} m</td></tr>
    <tr><td>Cargas por metro: permanente · sobrecarga · succión máxima</td><td style="text-align:right;">${fmt(pu.gH + pu.profile.G, 1)} · ${fmt(pu.pH, 1)} · ${fmt(pu.sv, 1)} kg/m</td></tr>
    ${pu.states.map((s2) => `<tr><td>${escapeHtml(s2.label)}</td><td style="text-align:right;">σ ${kg(s2.chk.sigma)} / ${kg(s2.chk.sigmaAllow)} · f ${fmt(s2.chk.f, 2)} / ${fmt(s2.chk.fAllow, 2)} cm</td></tr>`).join('')}</tbody></table>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Flexión oblicua con la succión máxima de los estados de viento (${fmt(res.suction, 0)} kg/m²); método del apunte "Correas a flexión oblicua".</p></div>`;
}

const fmtP = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 1)}`;

function windHeader(wd) {
  return `<p class="text-muted" style="font-size:12.5px; margin:0 0 8px;">Kz = ${fmt(wd.Kz, 2)} (altura de referencia ${fmt(wd.hq, 2)} m, exposición ${wd.exposure}, caso ${wd.caso}), Kzt = ${fmt(wd.Kzt, 2)}, Kd = ${fmt(wd.Kd, 2)}, V = ${fmt(wd.V, 0)} m/s, I = ${fmt(wd.I, 2)} → <b>q = ${fmt(wd.q, 1)} kg/m²</b>; G = ${fmt(wd.G, 2)}; GCpi = ±${fmt(wd.gcpi, 2)}. Signo: + presión hacia la superficie, − succión.</p>`;
}

function cabWindTable(wd) {
  if (!wd) return '<div class="card"><p class="text-muted">No se consideró la acción del viento.</p></div>';
  return `<div class="card"><h3 style="margin-top:0;">Presiones del viento (kg/m²)</h3>${windHeader(wd)}
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Viento sobre el lateral</th><th style="text-align:right;">Pared barlovento</th><th style="text-align:right;">Faldón barlovento</th><th style="text-align:right;">Faldón sotavento</th><th style="text-align:right;">Pared sotavento</th></tr></thead><tbody>
    ${wd.lateral.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}${c.roofOption === 'pos' ? ', presión en el faldón' : ''}</td><td style="text-align:right;">${fmtP(c.wallWindward.p)} <span class="text-muted">(${fmt(c.wallWindward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.roofWindward.p)} <span class="text-muted">(${fmt(c.roofWindward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.roofLeeward.p)} <span class="text-muted">(${fmt(c.roofLeeward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.wallLeeward.p)} <span class="text-muted">(${fmt(c.wallLeeward.cp, 2)})</span></td></tr>`).join('')}</tbody></table></div>
    <div class="table-wrap" style="margin-top:10px;"><table class="data-table"><thead><tr><th>Viento sobre el frente</th><th style="text-align:right;">Cubierta</th><th style="text-align:right;">Paredes laterales</th></tr></thead><tbody>
    ${wd.frontal.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}</td><td style="text-align:right;">${fmtP(c.roof.p)} <span class="text-muted">(${fmt(c.roof.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.side.p)} <span class="text-muted">(${fmt(c.side.cp, 2)})</span></td></tr>`).join('')}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Entre paréntesis, Cp (Figura 3). Una sola presión dinámica qh para todas las superficies (simplificación del apunte).</p></div>`;
}

function archWindTable(wd) {
  if (!wd) return '<div class="card"><p class="text-muted">No se consideró la acción del viento.</p></div>';
  return `<div class="card"><h3 style="margin-top:0;">Presiones del viento (kg/m²)</h3>${windHeader(wd)}
    <p class="text-muted" style="font-size:12.5px; margin:0 0 8px;">Cubierta en arco: f/A = ${fmt(wd.r, 3)}, ${wd.elevated ? 'sobre columnas' : 'desde el terreno'} (${ART.arch}).</p>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Viento sobre el lateral</th><th style="text-align:right;">Pared barlovento</th><th style="text-align:right;">Cuarto barlovento</th><th style="text-align:right;">Mitad central</th><th style="text-align:right;">Cuarto sotavento</th><th style="text-align:right;">Pared sotavento</th></tr></thead><tbody>
    ${wd.lateral.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}${c.alt ? ', valor alternativo' : ''}</td><td style="text-align:right;">${wd.elevated ? fmtP(c.wallWindward.p) : '—'}</td><td style="text-align:right;">${fmtP(c.quarterWindward.p)} <span class="text-muted">(${fmt(c.quarterWindward.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.center.p)} <span class="text-muted">(${fmt(c.center.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.quarterLeeward.p)} <span class="text-muted">(${fmt(c.quarterLeeward.cp, 2)})</span></td><td style="text-align:right;">${wd.elevated ? fmtP(c.wallLeeward.p) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <div class="table-wrap" style="margin-top:10px;"><table class="data-table"><thead><tr><th>Viento sobre el frente</th><th style="text-align:right;">Cubierta</th><th style="text-align:right;">Paredes laterales</th></tr></thead><tbody>
    ${wd.frontal.map((c) => `<tr><td>GCpi ${c.gcpi > 0 ? '+' : c.gcpi < 0 ? '−' : '0'}</td><td style="text-align:right;">${fmtP(c.roof.p)} <span class="text-muted">(${fmt(c.roof.cp, 2)})</span></td><td style="text-align:right;">${fmtP(c.side.p)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

// ================================================================= cabriada sobre columnas
function cabParams(calc) {
  const d = calc.design;
  const s = calc.section;
  return { ...commonParams(calc), f: Number(d.f), n: Math.round(Number(d.n)), diag: d.diag, sections: { CS: s.CS, CI: s.CI, M: s.M, D: s.D },
    names: Object.fromEntries(['CS', 'CI', 'M', 'D'].filter((k) => s[`name${k}`] && s[`name${k}`] !== 'auto').map((k) => [k, s[`name${k}`]])), sep: Number(d.sep) || 0.5, plateThickness: Number(d.plate) || 0.64,
    lpFactor: { D: Number(d.lpD) || 1, M: Number(d.lpD) || 1 }, sameChords: d.sameChords === 'yes' };
}

function compute(calc, kind) {
  const p = kind === 'cab' ? cabParams(calc) : archParams(calc);
  const key = `${kind}|${JSON.stringify(p)}`;
  if (cache.has(key)) return cache.get(key);
  let out;
  if (![p.A, p.f, p.S].every((v) => v > 0) || !(kind === 'arch' ? p.H >= 0 : p.H > 0) || (p.windOn && !(p.V > 0 && p.B > 0)) || (kind === 'cab' && !(p.n >= 2 && p.n <= 12))) out = { error: 'Completá la luz, la flecha, la altura de las columnas, la separación y el viento con valores válidos (paneles por faldón de 2 a 12).' };
  else {
    try {
      const res = kind === 'cab' ? N2.designNaveCab(p) : N2.designNaveArch(p);
      out = { res: { ...res, nave2: true }, input: p };
    } catch (e) { out = { error: /mecanismo|singular|inestable/i.test(String(e.message)) ? 'La estructura es inestable con estos vínculos: con la unión del arco articulada y la clave articulada, o la cabriada articulada sobre las columnas, hacen falta bases empotradas.' : 'No se pudo calcular con estos datos.' }; }
  }
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

function cabFigs(res, i, pal) {
  const st = res.states[i];
  const topL = res.tI(0);
  const gt = res.geom;
  const bars = gt.bars.map((b, k) => ({ a: res.tI(b.a), b: res.tI(b.b), N: st.N[k], fam: b.fam }));
  bars.push({ a: 0, b: topL, N: st.colPts[0][0].N, fam: 'COL' }, { a: 1, b: res.nodes.length ? res.tI(gt.nodes.filter((n) => n.chord === 'B').length - 1) : 1, N: st.colPts[1][0].N, fam: 'COL' });
  const truss = trussFigure({ title: st.label, nodes: res.nodes, bars, supports: [{ node: 0, ux: true, uy: true }, { node: 1, ux: true, uy: true }], loads: st.nodal, reactions: st.reactions.map((r) => ({ node: r.node, rx: r.fx, ry: r.fy })),
    hint: 'Esfuerzos axiles de las barras y de las columnas (el momento de las columnas, abajo)' }, pal);
  const H = res.nodes[topL].y;
  const A = res.nodes[1].x;
  const diag = portalDiagrams({ title: `${st.label}: columnas`, nodes: [{ x: 0, y: 0 }, { x: 0, y: H }, { x: A, y: H }, { x: A, y: 0 }], members: [{ i: 0, j: 1 }, { i: 3, j: 2 }], pts: st.colPts, hinge: null, support: res.baseKind }, pal);
  return { truss, diag };
}

export const naveCabModule = {
  label: 'Nave con cabriada apoyada sobre columnas',
  defaults() {
    return {
      design: { ...commonDefaults(), H: 5, f: 1.8, A: 12, B: 30, n: 3, diag: 'down', base: 'fixed', sep: 0.5, plate: 0.64, lpD: 1, sameChords: 'no' },
      section: { colType: 'IPE', colName: 'auto', CS: '2L', CI: '2L', M: 'L', D: 'L', nameCS: 'auto', nameCI: 'auto', nameM: 'auto', nameD: 'auto', purlinType: 'C', purlinName: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade', fc: 20 }, foundation: { sigma: 2, Df: 1.5, gamma: 17 }, verification: {},
    };
  },
  input(calc) { return cabParams(calc); },
  run(calc) { return compute(calc, 'cab'); },
  wire(root) {
    root.querySelectorAll('[data-ntab]').forEach((b) => b.addEventListener('click', () => { ntab = b.dataset.ntab; rerender(); }));
    root.querySelector('#nState')?.addEventListener('change', (e) => { nstate = Number(e.target.value); rerender(); });
  },
  step1(calc) { return `<div class="grid grid-2" style="align-items:start;">${geometryCard(calc, false)}${loadsCard(calc, false)}</div>${windCard(calc)}`; },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    const s = calc.section;
    return `<div class="grid grid-2" style="align-items:start;">
      ${materialsCard(calc, `
        <div class="field-row" style="flex-wrap:wrap;">${selField('section.colType', 'Columnas', s.colType, FAM_OPTS)}</div>
        ${['CS', 'CI', 'M', 'D'].map((f) => selField(`section.${f}`, T.FAMILIES[f], s[f], SECTION_OPTS)).join('')}
        <div class="field-row" style="flex-wrap:wrap;">${numField('design.sep', 'Separación entre ángulos / chapa nodal', calc.design.sep, { unit: 'cm' })}${numField('design.plate', 'Espesor de las presillas', calc.design.plate, { unit: 'cm' })}</div>
        <div class="field-row" style="flex-wrap:wrap;">${numField('design.lpD', 'Longitud de pandeo de diagonales y montantes', calc.design.lpD, { unit: '× longitud' })}
        ${selField('design.sameChords', 'Cordones', calc.design.sameChords === 'yes' ? 'yes' : 'no', [['no', 'Cada cordón con su perfil mínimo'], ['yes', 'Cordón inferior igual al superior']])}</div>
        <h4 style="margin:10px 0 6px; font-size:13px;">Longitudes de pandeo de las columnas</h4>
        <div class="field-row" style="flex-wrap:wrap;">${selField('design.kx', 'En el plano', Number(calc.design.kx), [[2, 'Lp = 2 H (columna empotrada en la base y libre arriba)'], [1, 'Lp = H'], [0.7, 'Lp = 0,7 H']])}${numField('design.sGirt', 'Arriostramiento fuera del plano', calc.design.sGirt, { unit: 'm' })}</div>
        ${numField('design.sPurlin', 'Separación de correas de cubierta', calc.design.sPurlin, { unit: 'm' })}
        ${deflSelect('design.deflLimit', calc.design.deflLimit || 'industrialRigid')}`)}
      <div class="card"><h3 style="margin-top:0;">Predimensionado</h3>${res ? `<table class="data-table"><tbody>
        <tr><td>Pendiente de la cubierta α</td><td style="text-align:right;">${fmt(res.theta, 1)}°</td></tr>
        <tr><td>Carga vertical de paredes por columna</td><td style="text-align:right;">${kg(res.base.Np)} kg</td></tr>
        ${res.wind ? `<tr><td>Presión dinámica q</td><td style="text-align:right;">${fmt(res.wind.q, 1)} kg/m²</td></tr>` : ''}
        <tr><td>Momento máximo en la base de las columnas (envolvente)</td><td style="text-align:right;">${kg(Math.max(...res.env.map((e) => e.Mmax)))} kg·m</td></tr>
        ${Object.values(res.truss.families).map((f) => `<tr><td>${f.label}: esfuerzo máx. (T · C)</td><td style="text-align:right;">${kg(f.Tmax)} · ${kg(f.Cmax)} kg</td></tr>`).join('')}</tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Las columnas y las barras de la cabriada se resuelven juntas por rigidez, con las secciones adoptadas (se repite hasta que no cambian).</p>` : `<div class="empty-state">${out.error || 'Completá el paso 1.'}</div>`}</div></div>`;
  },
  step3(calc, out) {
    const s = calc.section;
    const res = out.res;
    const colNames = S.profileList([s.colType]).map((p) => p.n);
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${selField('section.colName', 'Columnas', s.colName || 'auto', [['auto', 'Automático'], ...colNames.map((n) => [n, n])])}
      ${['CS', 'CI', 'M', 'D'].map((f) => { const fam = res && res.truss.families[f]; return `<div class="field-row" style="flex-wrap:wrap;">${selField(`section.${f}`, T.FAMILIES[f], s[f], SECTION_OPTS)}${selField(`section.name${f}`, 'Perfil', s[`name${f}`] || 'auto', [['auto', 'Automático'], ...(fam ? fam.candidates.slice(0, 100).map((p) => [p.n, p.n]) : [])])}</div>`; }).join('')}
      ${selField('section.purlinType', 'Correas: tipo de perfil', s.purlinType, [['C', 'Costanera C (PGC)'], ['UPN', 'UPN'], ['IPN', 'IPN'], ['IPE', 'IPE'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']])}
      ${selField('section.purlinName', 'Correas', s.purlinName || 'auto', [['auto', 'Automático'], ...(res ? res.purlin.candidates.slice(0, 80).map((p) => [p.n, p.n]) : [])])}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
      <div class="field-row" style="flex-wrap:wrap;">${selField('materials.fc', "Hormigón de las bases (f'c)", calc.materials.fc, [20, 25, 30].map((c) => [c, `H-${c}`]))}${numField('foundation.sigma', 'Tensión admisible del suelo', calc.foundation.sigma, { unit: 'kg/cm²' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('foundation.Df', 'Profundidad de fundación', calc.foundation.Df, { unit: 'm' })}${numField('foundation.gamma', 'Peso del suelo', calc.foundation.gamma, { unit: 'kN/m³' })}</div></div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${cabResults(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return cabMemoria(calc, out); },
};

const CAB_TABS = [['resumen', 'Resumen'], ['viento', 'Viento'], ['diag', 'Esfuerzos'], ['cab', 'Cabriada'], ['col', 'Columnas'], ['correas', 'Correas'], ['bases', 'Bases'], ['uniones', 'Uniones']];

function colCard(res, calc) {
  const c = res.colCheck.c;
  const items = [
    { ok: c.sigma <= c.sigmaAllow, label: c.N >= 0 ? 'Flexo-tracción' : 'Flexo-compresión', text: `σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m, N = ${c.N >= 0 ? '+' : '−'}${kg(Math.abs(c.N))} kg${c.omega ? `, λ = ${fmt(c.lambda, 0)}, ω = ${fmt(c.omega, 2)}` : ''})` },
    { ok: c.tau <= c.tauAllow, label: 'Corte', text: `τ = ${kg(c.tau)} ≤ ${kg(c.tauAllow)} kg/cm² (V = ${kg(Math.abs(c.V))} kg)` },
  ];
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Columnas: ${escapeHtml(res.col.n)} ${pill(c.ok)}</h3>
    <p class="text-muted" style="font-size:12.5px; margin:0 0 6px;">A = ${fmt(res.col.A, 1)} cm², Wx = ${fmt(res.col.Wx, 0)} cm³ · estado más exigido: ${escapeHtml(res.states[res.colCheck.state].id)} · envolvente: M = ${kg(Math.max(...res.env.map((e) => e.Mmax)))} kg·m, N compresión ${kg(Math.max(...res.env.map((e) => e.Nc)))} kg</p>
    ${items.map((k) => `<div style="display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:${k.ok ? 'var(--good)' : 'var(--bad)'}; font-weight:800;">${k.ok ? '✓' : '✗'}</span><span style="min-width:120px; font-weight:600;">${k.label}</span><span class="text-muted">${escapeHtml(k.text)}</span></div>`).join('')}</div>`;
}

function cabResults(calc, out) {
  const { res, input } = out;
  res.baseKind = calc.design.base;
  annotate(res.truss, calc.materials.grade);
  const w = res.weights;
  let body = '';
  const fams = Object.values(res.truss.families);
  if (ntab === 'resumen') {
    body = `<div class="card"><h3 style="margin-top:0;">Nave de ${fmt(input.A, 1)} × ${fmt(input.B, 1)} m con cabriada sobre columnas ${pill(res.ok && res.defl.ok && res.purlin.ok)}</h3><table class="data-table"><tbody>
      <tr><td>Columnas (2), empotradas en la base</td><td style="text-align:right;"><b>${escapeHtml(res.col.n)}</b> ${pill(res.colCheck.c.ok)}</td></tr>
      ${fams.map((f) => `<tr><td>Cabriada: ${f.label.toLowerCase()} (${f.bars.length})</td><td style="text-align:right;"><b>${f.def.mult === 2 ? '2 × ' : ''}${escapeHtml(f.profile.n)}</b> ${pill(f.ok)}</td></tr>`).join('')}
      <tr><td>Correas de cubierta</td><td style="text-align:right;"><b>${escapeHtml(res.purlin.profile ? res.purlin.profile.n : '—')}</b> ${pill(res.purlin.ok)}</td></tr>
      <tr><td>Acero por pórtico: columnas · cabriada</td><td style="text-align:right;">${kg(w.cols)} · ${kg(w.truss)} kg (${kg(w.total)} kg)</td></tr>
      <tr><td>Peso propio supuesto · calculado de la cabriada</td><td style="text-align:right;">${fmt(res.weights.selfAssumed, 1)} · ${fmt(w.selfReal, 1)} kg/m² en planta${res.selfAdjusted ? ' (ajustado)' : ''}</td></tr>
      <tr><td>Reacciones máximas por base: vertical · momento · horizontal</td><td style="text-align:right;">${kg(Math.max(...res.bases.map((b) => b.Nmax)))} · ${kg(Math.max(...res.bases.map((b) => b.Mmax)))} kg·m · ${kg(Math.max(...res.bases.map((b) => b.H)))} kg</td></tr>
      <tr><td>Estados analizados</td><td style="text-align:right;">${res.states.length} (${res.iterations} iteraciones de rigidez)</td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${ART.method}. La cabriada (barras articuladas) y las columnas (empotradas en la base) se resuelven juntas por rigidez. No se verifican chapas nodales a compresión ni arriostramientos.</p></div>${deflCardHtml(res.defl, 'cab', res.bumps ? res.bumps.truss + res.bumps.col : 0)}`;
  } else if (ntab === 'viento') body = cabWindTable(res.wind);
  else if (ntab === 'diag') {
    if (nstate >= res.states.length) nstate = 0;
    const f = cabFigs(res, nstate, 'screen');
    body = `<div class="card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;"><h3 style="margin:0;">Estado de carga</h3><select id="nState" style="max-width:100%;">${res.states.map((s2, i) => `<option value="${i}" ${i === nstate ? 'selected' : ''}>${escapeHtml(s2.label.length > 70 ? s2.label.slice(0, 68) + '…' : s2.label)}</option>`).join('')}</select></div>${f.truss}${f.diag}</div>`;
  } else if (ntab === 'cab') body = fams.map((f) => famCard(f, calc)).join('');
  else if (ntab === 'col') body = colCard(res, calc);
  else if (ntab === 'correas') body = purlinCard(res, input);
  else if (ntab === 'uniones') body = jointsPanel(calc, jointsCab(res, calc));
  else if (ntab === 'uniones') body = jointsPanel(calc, jointsArch(res, calc));
  else body = baseTable(res);
  return tabsHtml(CAB_TABS) + body;
}

function cabMemoria(calc, out) {
  const { res, input } = out;
  if (!res || !res.col) return null;
  res.baseKind = calc.design.base;
  annotate(res.truss, calc.materials.grade);
  const wd = res.wind;
  const f0 = cabFigs(res, 0, 'print');
  const sI = res.colCheck.state;
  const fC = sI === 0 ? null : cabFigs(res, sI, 'print');
  const c = res.colCheck.c;
  const fams = Object.values(res.truss.families);
  const wTxt = wd ? wd.lateral.map((q) => memoRow(`Lateral, GCpi ${q.gcpi > 0 ? '+' : q.gcpi < 0 ? '−' : '0'}`, `pared barlovento ${fmtP(q.wallWindward.p)}; faldón barlovento ${fmtP(q.roofWindward.p)}; faldón sotavento ${fmtP(q.roofLeeward.p)}; pared sotavento ${fmtP(q.wallLeeward.p)} kg/m²`)).join('') + wd.frontal.map((q) => memoRow(`Frente, GCpi ${q.gcpi > 0 ? '+' : q.gcpi < 0 ? '−' : '0'}`, `cubierta ${fmtP(q.roof.p)}; paredes laterales ${fmtP(q.side.p)} kg/m²`)).join('') : '';
  const pu = res.purlin;
  return {
    title: calc.name,
    sub: `Nave industrial de acero · cabriada sobre columnas · ${fmt(input.A, 1)} × ${fmt(input.B, 1)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, ART.method)}${memoRow('Luz · largo · altura de columnas · flecha', `${fmt(input.A, 2)} · ${fmt(input.B, 2)} · ${fmt(input.H, 2)} · ${fmt(input.f, 2)} m (α = ${fmt(res.theta, 1)}°)`)}
        ${memoRow('Separación entre pórticos', `${fmt(input.S, 2)} m`)}${memoRow('Sustentación', `cabriada articulada sobre columnas ${calc.design.base === 'pinned' ? 'articuladas' : 'empotradas'} en la base`)}
        ${memoRow('Cargas', `cubierta + cielorraso + correas = ${fmt(input.gSurf, 0)} kg/m² (superficie); peso propio ${fmt(res.weights.selfAssumed, 1)} kg/m²; sobrecarga ${fmt(res.base.p, 0)} kg/m²; paredes ${kg(res.base.Np)} kg por columna`, ART.roof)}</table>
      ${wd ? `<h2>2. Acción del viento</h2><table>${memoRow('Presión dinámica', `q = ${fmt(wd.q, 1)} kg/m² (V = ${fmt(wd.V, 0)} m/s, Kz = ${fmt(wd.Kz, 2)}, Kd = ${fmt(wd.Kd, 2)}, GCpi = ±${fmt(wd.gcpi, 2)})`, ART.wind)}${wTxt}</table>` : ''}
      <h2>3. Esfuerzos</h2>
      <table>${res.states.map((s2) => memoRow(s2.id, escapeHtml(s2.label))).join('')}</table>
      ${f0.truss}${f0.diag}${fC ? `${fC.truss}${fC.diag}` : ''}
      <h2>4. Cabriada</h2>
      <table>${fams.map((fm) => memoRow(`${fm.label}: ${fm.def.mult === 2 ? '2 × ' : ''}${escapeHtml(fm.profile.n)}`, `T máx ${kg(fm.Tmax)} kg; C máx ${kg(fm.Cmax)} kg — ${fm.ok ? 'verifica' : 'no verifica'}`, 'Método ω; presillas: λi, λ1 ≤ 50, Q = ωN/80')).join('')}</table>
      <h2>5. Columnas</h2>
      <table>${memoRow(`${escapeHtml(res.col.n)}`, `A = ${fmt(res.col.A, 1)} cm², Wx = ${fmt(res.col.Wx, 0)} cm³; Lp = ${fmt(input.kx, 1)} H en el plano, ${fmt(input.sGirt, 2)} m fuera del plano`, ART.flexo)}
        ${memoRow('Solicitación más exigente', `M = ${kg(Math.abs(c.M))} kg·m; N = ${c.N >= 0 ? '+' : '−'}${kg(Math.abs(c.N))} kg; V = ${kg(Math.abs(c.V))} kg → σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)}; τ = ${kg(c.tau)} kg/cm²`)}${memoRow('Resultado', c.ok ? 'verifica' : 'no verifica')}</table>
      <h2>6. Correas y bases</h2>
      <table>${pu.profile ? memoRow('Correa', `${escapeHtml(pu.profile.n)}: luz ${fmt(input.S, 2)} m, cada ${fmt(input.sPurlin, 2)} m — ${pu.ok ? 'verifica' : 'no verifica'}`, 'Apunte "Correas a flexión oblicua"') : ''}
        ${res.bases.map((b) => memoRow(`Base ${b.idx === 0 ? 'izquierda' : 'derecha'}`, `N = ${kg(b.Nmax)} kg; M = ${kg(b.Mmax)} kg·m; H = ${kg(b.H)} kg; ${b.footing.ok ? `${fmt(b.footing.B / 10, 0)} × ${fmt(b.footing.L / 10, 0)} × ${fmt(b.footing.h / 10, 0)} cm` : escapeHtml(b.footing.reason || '—')}`, 'CIRSOC 201; presión máxima del suelo con momento')).join('')}
        ${memoRow('No verificado', 'vuelco de las bases, armadura suplementaria y del pedestal de los anclajes, bloque de corte de las chapas de nudo, arriostramientos')}</table>
      <h2>7. Flechas</h2>${deflMemo(res.defl, 'cab', res.bumps ? res.bumps.truss + res.bumps.col : 0)}
      <h2>8. Uniones</h2>${jointsMemo(jointsCab(res, calc))}
      <h2>9. Resultado</h2><table>${memoRow('Estructura', res.ok && res.defl.ok ? 'verifica' : 'no verifica')}${memoRow('Peso por pórtico', `${kg(res.weights.total)} kg`)}</table>`,
  };
}

// ================================================================= arco parabólico
function archParams(calc) {
  const d = calc.design;
  const s = calc.section;
  return { ...commonParams(calc), f: Number(d.f), hingeCrown: d.hingeCrown !== 'no', joint: d.joint === 'pinned' ? 'pinned' : 'rigid', rafter: d.rafter, archTypes: [s.archType], chordTypes: [s.chordType], archName: s.archName && s.archName !== 'auto' ? s.archName : null,
    hTruss: Number(d.hTruss), alphaDiag: Number(d.alphaDiag), planes: Number(d.planes), kArc: Number(d.kArc) };
}

function archFigs(res, i, pal) {
  const st = res.states[i];
  const common = { nodes: res.geom.nodes, members: res.geom.members, hinge: res.geom.hingeCrown ? res.geom.crownNode : null, support: res.baseKind };
  return { loads: portalLoads({ ...common, title: st.label, dist: st.dist, nodal: st.nodal }, pal), diag: portalDiagrams({ ...common, title: `${st.label}: solicitaciones`, pts: st.pts }, pal) };
}

export const naveArchModule = {
  label: 'Nave con arco parabólico',
  defaults() {
    return {
      design: { ...commonDefaults(), A: 20, B: 40, H: 5, f: 4, hingeCrown: 'yes', joint: 'rigid', base: 'pinned', rafter: 'solid', hTruss: 0.7, alphaDiag: 60, planes: 2, kArc: 0.5, windMix: 'yes' },
      section: { colType: 'IPE', archType: 'IPE', chordType: 'UPN', colName: 'auto', archName: 'auto', purlinType: 'C', purlinName: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade', fc: 20 }, foundation: { sigma: 2, Df: 1.5, gamma: 17 }, verification: {},
    };
  },
  input(calc) { return archParams(calc); },
  run(calc) { return compute(calc, 'arch'); },
  wire(root) { naveCabModule.wire(root); },
  step1(calc) { return `<div class="grid grid-2" style="align-items:start;">${geometryCard(calc, true)}${loadsCard(calc, true)}</div>${windCard(calc)}`; },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    const s = calc.section;
    const d = calc.design;
    return `<div class="grid grid-2" style="align-items:start;">
      ${materialsCard(calc, `
        <div class="field-row" style="flex-wrap:wrap;">${Number(d.H) > 0 ? selField('section.colType', 'Columnas', s.colType, FAM_OPTS) : ''}${d.rafter === 'truss' ? selField('section.chordType', 'Cordones del arco', s.chordType, CHORD_OPTS) : selField('section.archType', 'Arco', s.archType, FAM_OPTS)}</div>
        ${selField('design.rafter', 'Arco', d.rafter, [['solid', 'De alma llena'], ['truss', 'Reticulado (dos cordones y diagonales)']])}
        ${d.rafter === 'truss' ? `<div class="field-row" style="flex-wrap:wrap;">${numField('design.hTruss', 'Altura entre cordones h', d.hTruss, { unit: 'm' })}${numField('design.alphaDiag', 'Ángulo de las diagonales', d.alphaDiag, { unit: '°' })}</div>` : ''}
        <h4 style="margin:10px 0 6px; font-size:13px;">Longitudes de pandeo</h4>
        <div class="field-row" style="flex-wrap:wrap;">${numField('design.kArc', 'Arco en el plano: Lp = k × longitud del arco', d.kArc, { hint: 'Criterio del proyectista (no figura en los apuntes): 0,5 es habitual en arcos de tres articulaciones; 1 es conservador.' })}${numField('design.sPurlin', 'Separación de correas (arriostra el arco)', d.sPurlin, { unit: 'm' })}</div>
        ${deflSelect('design.deflLimit', d.deflLimit || 'industrialRigid')}
        ${Number(d.H) > 0 ? `<div class="field-row" style="flex-wrap:wrap;">${selField('design.kx', 'Columna en el plano', Number(d.kx), [[2, 'Lp = 2 H'], [1, 'Lp = H'], [0.7, 'Lp = 0,7 H']])}${numField('design.sGirt', 'Arriostramiento de columna fuera del plano', d.sGirt, { unit: 'm' })}</div>` : ''}`)}
      <div class="card"><h3 style="margin-top:0;">Predimensionado</h3>${res ? `<table class="data-table"><tbody>
        <tr><td>Relación flecha / luz r</td><td style="text-align:right;">${fmt(res.geom.f / res.geom.A, 3)}</td></tr>
        <tr><td>Longitud del arco</td><td style="text-align:right;">${fmt(res.arcLen, 2)} m</td></tr>
        <tr><td>Empuje horizontal en las bases (envolvente)</td><td style="text-align:right;">${kg(res.thrust)} kg</td></tr>
        <tr><td>Empuje aproximado de carga uniforme q L² / (8 (f + H)) con q = ${kg((res.base.gSurf + res.base.self + res.base.p) * res.base.S)} kg/m</td><td style="text-align:right;">${kg((res.base.gSurf + res.base.self + res.base.p) * res.base.S * res.geom.A ** 2 / (8 * (res.geom.f + res.geom.H)))} kg</td></tr></tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">El arco parabólico con carga uniforme sobre la proyección horizontal trabaja casi a compresión pura (momentos nulos con tres articulaciones); el viento lo flexiona. Se analiza como pórtico plano de ${res.geom.n} tramos rectos sobre la parábola con la rigidez de los perfiles adoptados.</p>` : `<div class="empty-state">${out.error || 'Completá el paso 1.'}</div>`}</div></div>`;
  },
  step3(calc, out) {
    const s = calc.section;
    const res = out.res;
    const hasCols = Number(calc.design.H) > 0;
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${hasCols ? selField('section.colName', 'Columnas', s.colName || 'auto', [['auto', 'Automático'], ...S.profileList([s.colType]).map((p) => [p.n, p.n])]) : ''}
      ${calc.design.rafter === 'truss' ? '' : selField('section.archName', 'Arco', s.archName || 'auto', [['auto', 'Automático'], ...S.profileList([s.archType]).map((p) => [p.n, p.n])])}
      ${selField('section.purlinType', 'Correas: tipo de perfil', s.purlinType, [['C', 'Costanera C (PGC)'], ['UPN', 'UPN'], ['IPN', 'IPN'], ['IPE', 'IPE'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']])}
      ${selField('section.purlinName', 'Correas', s.purlinName || 'auto', [['auto', 'Automático'], ...(res ? res.purlin.candidates.slice(0, 80).map((p) => [p.n, p.n]) : [])])}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
      <div class="field-row" style="flex-wrap:wrap;">${selField('materials.fc', "Hormigón de las bases (f'c)", calc.materials.fc, [20, 25, 30].map((c) => [c, `H-${c}`]))}${numField('foundation.sigma', 'Tensión admisible del suelo', calc.foundation.sigma, { unit: 'kg/cm²' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('foundation.Df', 'Profundidad de fundación', calc.foundation.Df, { unit: 'm' })}${numField('foundation.gamma', 'Peso del suelo', calc.foundation.gamma, { unit: 'kN/m³' })}</div></div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${archResults(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return archMemoria(calc, out); },
};

const ARCH_TABS = [['resumen', 'Resumen'], ['viento', 'Viento'], ['diag', 'Cargas y diagramas'], ['dim', 'Dimensionado'], ['correas', 'Correas'], ['bases', 'Bases'], ['uniones', 'Uniones']];

function archChecks(res) {
  const out = [];
  const mk = (c, label) => ({ ok: c.ok, title: label, items: [
    { ok: c.sigma <= c.sigmaAllow, label: c.N >= 0 ? 'Flexo-tracción' : 'Flexo-compresión', text: `σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m, N = ${c.N >= 0 ? '+' : '−'}${kg(Math.abs(c.N))} kg${c.omega ? `, λ = ${fmt(c.lambda, 0)}, ω = ${fmt(c.omega, 2)}` : ''})` },
    ...(c.tau !== undefined ? [{ ok: c.tau <= c.tauAllow, label: 'Corte', text: `τ = ${kg(c.tau)} ≤ ${kg(c.tauAllow)} kg/cm² (V = ${kg(Math.abs(c.V))} kg)` }] : []),
  ] });
  if (res.colCheck) out.push(mk(res.colCheck.c, `Columnas: ${res.col.n}`));
  const c = res.archCheck.c;
  if (res.isTruss) {
    out.push({ ok: c.ok, title: `Arco reticulado: 2 × ${res.arch.chord.n} y diagonales ${res.arch.diag.n}`, items: [
      { ok: c.sigma <= c.sigmaAllow, label: 'Flexión (Steiner)', text: `σ = ${kg(c.sigma)} ≤ ${kg(c.sigmaAllow)} kg/cm² (M = ${kg(Math.abs(c.M))} kg·m)` },
      { ok: c.sigC <= c.sigmaAllow, label: 'Cordón comprimido', text: `C = ${kg(c.Cc)} kg: σ = ${kg(c.sigC)} ≤ ${kg(c.sigmaAllow)} kg/cm²` },
      { ok: c.sigD <= c.sigmaAllow, label: 'Diagonales', text: `D = ${kg(c.D)} kg: σ = ${kg(c.sigD)} ≤ ${kg(c.sigmaAllow)} kg/cm²` }] });
  } else out.push(mk(c, `Arco: ${res.arch.profile.n}`));
  return out;
}

function archResults(calc, out) {
  const { res, input } = out;
  res.baseKind = calc.design.base;
  const w = res.weights;
  let body = '';
  if (ntab === 'resumen') {
    body = `<div class="card"><h3 style="margin-top:0;">Nave de ${fmt(input.A, 1)} × ${fmt(input.B, 1)} m con arco parabólico ${pill(res.ok && res.defl.ok && res.purlin.ok)}</h3><table class="data-table"><tbody>
      ${res.col ? `<tr><td>Columnas (2)</td><td style="text-align:right;"><b>${escapeHtml(res.col.n)}</b> ${pill(res.colCheck.c.ok)}</td></tr>` : ''}
      <tr><td>Arco ${res.isTruss ? 'reticulado' : 'de alma llena'} (${fmt(res.arcLen, 1)} m)</td><td style="text-align:right;"><b>${res.isTruss ? `2 × ${escapeHtml(res.arch.chord.n)} + ${escapeHtml(res.arch.diag.n)} (h = ${fmt(res.arch.h * 100, 0)} cm)` : escapeHtml(res.arch.profile.n)}</b> ${pill(res.archCheck.c.ok)}</td></tr>
      <tr><td>Correas de cubierta</td><td style="text-align:right;"><b>${escapeHtml(res.purlin.profile ? res.purlin.profile.n : '—')}</b> ${pill(res.purlin.ok)}</td></tr>
      <tr><td>Acero por pórtico: columnas · arco</td><td style="text-align:right;">${kg(w.cols)} · ${kg(w.arch)} kg (${kg(w.total)} kg)</td></tr>
      <tr><td>Peso propio supuesto · calculado del arco</td><td style="text-align:right;">${fmt(w.selfAssumed, 1)} · ${fmt(w.selfReal, 1)} kg/m² en planta${res.selfAdjusted ? ' (ajustado)' : ''}</td></tr>
      <tr><td>Empuje horizontal máximo en las bases</td><td style="text-align:right;">${kg(res.thrust)} kg</td></tr>
      <tr><td>Estados analizados</td><td style="text-align:right;">${res.states.length}</td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${ART.method}. Arco de ${res.geom.n} tramos rectos sobre la parábola, ${calc.design.hingeCrown === 'no' ? 'con clave continua' : 'con clave articulada'}. La cubierta se pesa por m² de superficie y la sobrecarga por m² de proyección horizontal. El pandeo fuera del plano se supone controlado por las correas; el pandeo en el plano usa Lp = ${fmt(input.kArc, 2)} × la longitud del arco (criterio del proyectista). No se verifican arriostramientos.</p></div>${deflCardHtml(res.defl, 'arch', res.bumps ? res.bumps.arch + res.bumps.col : 0)}`;
  } else if (ntab === 'viento') body = archWindTable(res.wind);
  else if (ntab === 'diag') {
    if (nstate >= res.states.length) nstate = 0;
    const f = archFigs(res, nstate, 'screen');
    const st = res.states[nstate];
    body = `<div class="card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;"><h3 style="margin:0;">Estado de carga</h3><select id="nState" style="max-width:100%;">${res.states.map((s2, i) => `<option value="${i}" ${i === nstate ? 'selected' : ''}>${escapeHtml(s2.label.length > 70 ? s2.label.slice(0, 68) + '…' : s2.label)}</option>`).join('')}</select></div>${f.loads}${f.diag}
      <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Reacciones: izquierda H = ${kg(st.reactions[0].fx)}, V = ${kg(st.reactions[0].fy)} kg · derecha H = ${kg(st.reactions[1].fx)}, V = ${kg(st.reactions[1].fy)} kg.</p></div>`;
  } else if (ntab === 'dim') {
    body = archChecks(res).map((blk) => `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">${escapeHtml(blk.title)} ${pill(blk.ok)}</h3>${blk.items.map((k) => `<div style="display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:${k.ok ? 'var(--good)' : 'var(--bad)'}; font-weight:800;">${k.ok ? '✓' : '✗'}</span><span style="min-width:120px; font-weight:600;">${k.label}</span><span class="text-muted">${escapeHtml(k.text)}</span></div>`).join('')}</div>`).join('');
  } else if (ntab === 'correas') body = purlinCard(res, input);
  else body = baseTable(res);
  return tabsHtml(ARCH_TABS) + body;
}

function archMemoria(calc, out) {
  const { res, input } = out;
  if (!res || !res.arch) return null;
  res.baseKind = calc.design.base;
  const wd = res.wind;
  const gI = res.archCheck.state;
  const f0 = archFigs(res, 0, 'print');
  const fG = gI === 0 ? null : archFigs(res, gI, 'print');
  const blocks = archChecks(res);
  const pu = res.purlin;
  const wTxt = wd ? wd.lateral.map((q) => memoRow(`Lateral, GCpi ${q.gcpi > 0 ? '+' : q.gcpi < 0 ? '−' : '0'}${q.alt ? ' (valor alternativo)' : ''}`, `pared barlovento ${fmtP(q.wallWindward.p)}; cuarto barlovento ${fmtP(q.quarterWindward.p)}; mitad central ${fmtP(q.center.p)}; cuarto sotavento ${fmtP(q.quarterLeeward.p)}; pared sotavento ${fmtP(q.wallLeeward.p)} kg/m²`, 'Tabla 8')).join('') + wd.frontal.map((q) => memoRow(`Frente, GCpi ${q.gcpi > 0 ? '+' : q.gcpi < 0 ? '−' : '0'}`, `cubierta ${fmtP(q.roof.p)}; paredes laterales ${fmtP(q.side.p)} kg/m²`)).join('') : '';
  return {
    title: calc.name,
    sub: `Nave industrial de acero · arco parabólico · ${fmt(input.A, 1)} × ${fmt(input.B, 1)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, ART.method)}${memoRow('Luz · largo · columnas · flecha', `${fmt(input.A, 2)} · ${fmt(input.B, 2)} · ${fmt(input.H, 2)} · ${fmt(input.f, 2)} m (f/A = ${fmt(input.f / input.A, 3)})`)}
        ${memoRow('Arco', `parábola de ${res.geom.n} tramos rectos; clave ${calc.design.hingeCrown === 'no' ? 'continua' : 'articulada'}; unión con columnas ${calc.design.joint === 'pinned' ? 'articulada' : 'rígida'}; bases ${calc.design.base === 'fixed' ? 'empotradas' : 'articuladas'}`)}
        ${memoRow('Separación entre pórticos', `${fmt(input.S, 2)} m`)}${memoRow('Cargas', `cubierta + cielorraso + correas = ${fmt(input.gSurf, 0)} kg/m² (superficie); peso propio ${fmt(res.base.self, 1)} kg/m²; sobrecarga ${fmt(res.base.p, 0)} kg/m²`, ART.roof)}</table>
      ${wd ? `<h2>2. Acción del viento</h2><table>${memoRow('Presión dinámica', `q = ${fmt(wd.q, 1)} kg/m² (V = ${fmt(wd.V, 0)} m/s, Kz = ${fmt(wd.Kz, 2)}, GCpi = ±${fmt(wd.gcpi, 2)})`, ART.wind)}${memoRow('Cubierta abovedada', `f/A = ${fmt(wd.r, 3)}, ${wd.elevated ? 'sobre columnas' : 'desde el terreno'}`, ART.arch)}${wTxt}</table>` : ''}
      <h2>3. Estados de carga y solicitaciones</h2>
      <table>${res.states.map((s2) => memoRow(s2.id, `${escapeHtml(s2.label)}; reacciones H ${kg(s2.reactions[0].fx)} / ${kg(s2.reactions[1].fx)}, V ${kg(s2.reactions[0].fy)} / ${kg(s2.reactions[1].fy)} kg`)).join('')}</table>
      ${f0.loads}${f0.diag}${fG ? `${fG.loads}${fG.diag}` : ''}
      <h2>4. Dimensionado</h2>
      <table>${blocks.map((blk) => `${memoRow(escapeHtml(blk.title), blk.ok ? 'verifica' : 'no verifica', ART.flexo)}${blk.items.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('')}`).join('')}
        ${memoRow('Pandeo del arco en el plano', `Lp = ${fmt(input.kArc, 2)} × ${fmt(res.arcLen, 2)} m = ${fmt(res.LpxArch / 100, 2)} m (criterio del proyectista); fuera del plano, a la separación de correas (${fmt(input.sPurlin, 2)} m)`)}</table>
      <h2>5. Correas y bases</h2>
      <table>${pu.profile ? memoRow('Correa', `${escapeHtml(pu.profile.n)}: luz ${fmt(input.S, 2)} m — ${pu.ok ? 'verifica' : 'no verifica'}`, 'Apunte "Correas a flexión oblicua"') : ''}
        ${res.bases.map((b) => memoRow(`Base ${b.idx === 0 ? 'izquierda' : 'derecha'}`, `N = ${kg(b.Nmax)} kg; M = ${kg(b.Mmax)} kg·m; H = ${kg(b.H)} kg; ${b.footing.ok ? `${fmt(b.footing.B / 10, 0)} × ${fmt(b.footing.L / 10, 0)} × ${fmt(b.footing.h / 10, 0)} cm` : escapeHtml(b.footing.reason || '—')}`, 'CIRSOC 201')).join('')}
        ${memoRow('No verificado', 'armadura suplementaria y del pedestal de los anclajes, bloque de corte de las chapas de nudo, arriostramientos')}</table>
      <h2>6. Flechas</h2>${deflMemo(res.defl, 'arch', res.bumps ? res.bumps.arch + res.bumps.col : 0)}
      <h2>7. Uniones</h2>${jointsMemo(jointsArch(res, calc))}
      <h2>8. Resultado</h2><table>${memoRow('Estructura', res.ok && res.defl.ok ? 'verifica' : 'no verifica')}${memoRow('Peso por pórtico', `${kg(res.weights.total)} kg`)}</table>`,
  };
}
