import { CIRSOC201 as N, LIVE_LOADS } from '../structural/norms.js';
import { designBuilding, colExists, lineCurves, panelOn, nodeOn, hasVoids } from '../structural/building.js';
import { lineFigure, columnStackFigure } from './structural-draw.js';
import { armadoFigure, slabLevelArmadoFigure } from './structural-armado.js';
import * as rc from '../structural/rc.js';
import { axisEditor, gridSketch } from './structural-spans.js';
import { SOIL_UNIT_WEIGHTS } from '../structural/footing.js';
import { setCalcField } from '../state.js';
import { escapeHtml, showToast } from '../utils.js';
import { fmt, numField, selField, memoRow } from './structural-ui.js';

const letter = (j) => String.fromCharCode(65 + j);
const colName = (i, j) => `${letter(j)}${i + 1}`;
const ART = {
  loads: 'CIRSOC 101-2005, Tablas 3.1, 3.2 y 4.1',
  combos: 'CIRSOC 201 art. 9.2.1',
  levelAnalysis: 'CIRSOC 201 art. 8.9.1 y 8.9.2',
  slabs: 'CIRSOC 201 art. 13.5.1, 13.6.1.2, 9.5.3.3 (ec. 9-12 y 9-13) y Tabla 9.5.a)',
};

let tab = 'resumen';
let planLevel = 1;
let schLevel = 1;
let schLine = 'x:0';
let schCol = '0,0';
const cache = new Map();

// ---------------------------------------------------------------- datos
function parseList(text) {
  return String(text).split(/[\s;]+/).join(',').split(',').map((v) => Number(v.replace(',', '.'))).filter((v) => Number.isFinite(v) && v > 0);
}

function inputOf(calc) {
  const d = calc.design;
  return {
    xSpans: d.xSpans.map(Number), ySpans: d.ySpans.map(Number),
    levels: d.levels.map((l) => ({ h: Number(l.h), live: Number(l.live), perm: Number(l.perm), cantLive: Number(d.cantLive) })),
    cant: { left: Number(d.cant.left) || 0, right: Number(d.cant.right) || 0, front: Number(d.cant.front) || 0, back: Number(d.cant.back) || 0 },
    wall: Number(d.wall) || 0,
    apeos: (d.apeos || []).map((a) => ({ i: a.i, j: a.j, level: a.level, dir: a.dir })),
    beamB: Number(calc.section.beamB), beamHmin: Number(calc.section.beamHmin), beamHmax: Number(calc.section.beamHmax) || 0,
    slabHmin: Number(calc.section.slabHmin) || 0,
    colMin: Number(calc.section.colMin), colMax: Number(calc.section.colMax) || 0,
    colShape: calc.section.colShape || 'square', colOrient: calc.section.colOrient || 'x',     // los cálculos viejos no tenían forma: cuadradas
    fc: Number(calc.materials.fc), placement: calc.materials.placement, exposure: calc.materials.exposure,
    dagg: Number(calc.materials.dagg), dStirrup: Number(calc.materials.dStirrup), rhoMax: Number(calc.materials.rhoMax),
    soil: { sigma: Number(calc.foundation.sigma), Df: Number(calc.foundation.Df), gamma: Number(calc.foundation.gamma) },
    mask: maskOf(calc),
  };
}

// ---------------------------------------------------------------- tipología de la planta (paños con y sin losa)
const TYPOS = [['rect', 'Rectangular'], ['L', 'En L'], ['U', 'En U'], ['T', 'En T'], ['cruz', 'En cruz'], ['H', 'En H'], ['patio', 'Con patio central'], ['escalera', 'Escalonada'], ['custom', 'Libre (la dibujo yo)']];
// Cada forma se define sobre coordenadas normalizadas (u, v) del centro de cada paño (0 a 1); "orientación" gira esas coordenadas de a 90°
const TYPO_VOID = {
  L: (u, v) => u > 0.49 && v > 0.49,
  U: (u, v) => u > 0.34 && u < 0.66 && v > 0.49,
  T: (u, v) => (u < 0.34 || u > 0.66) && v < 0.67,
  cruz: (u, v) => (u < 0.34 || u > 0.66) && (v < 0.34 || v > 0.66),
  H: (u, v) => u > 0.34 && u < 0.66 && (v < 0.34 || v > 0.66),
  patio: (u, v) => u > 0.34 && u < 0.66 && v > 0.34 && v < 0.66,
  escalera: (u, v) => u + v > 1.25,
};
function presetMask(typo, rot, nx, ny) {
  const isVoid = TYPO_VOID[typo];
  return Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (__, j) => {
    if (!isVoid) return true;
    const cx = (i + 0.5) / nx;
    const cy = (j + 0.5) / ny;
    const [u, v] = [[cx, cy], [cy, 1 - cx], [1 - cx, 1 - cy], [1 - cy, cx]][((rot % 4) + 4) % 4];
    return !isVoid(u, v);
  }));
}
// mask[i][j] = true si el paño (columna i, fila j; la fila A es j = 0) lleva losa
function maskOf(calc) {
  const d = calc.design;
  const nx = d.xSpans.length;
  const ny = d.ySpans.length;
  if (d.typo === 'custom' && Array.isArray(d.mask)) return Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (__, j) => !(d.mask[j] && d.mask[j][i] === '0')));
  return presetMask(d.typo || 'rect', Number(d.rot) || 0, nx, ny);
}
const maskRows = (m, nx, ny) => Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (__, i) => (m[i][j] ? '1' : '0')).join(''));

// Dibujo de la planta con los paños: tocar un paño le saca o le pone losa
function maskSketch(calc, m) {
  const d = calc.design;
  const xs = d.xSpans.map(Number);
  const ys = d.ySpans.map(Number);
  const cum = (a) => a.reduce((o, v) => { o.push(o[o.length - 1] + v); return o; }, [0]);
  const cx = cum(xs);
  const cy = cum(ys);
  const W = 560;
  const pad = 36;
  const k = Math.min((W - 2 * pad) / cx[cx.length - 1], 260 / cy[cy.length - 1]);
  const H = cy[cy.length - 1] * k + 2 * pad;
  const X = (v) => pad + v * k;
  const Y = (v) => pad + (cy[cy.length - 1] - v) * k;
  const on = (i, j) => i >= 0 && j >= 0 && i < xs.length && j < ys.length && m[i][j];
  let s = '';
  xs.forEach((lx, i) => ys.forEach((ly, j) => {
    const act = m[i][j];
    s += `<rect data-cell="${i},${j}" x="${X(cx[i])}" y="${Y(cy[j + 1])}" width="${lx * k}" height="${ly * k}" fill="${act ? 'var(--accent)' : 'var(--panel)'}" fill-opacity="${act ? 0.26 : 1}" stroke="${act ? 'var(--accent)' : 'var(--line)'}" stroke-width="${act ? 1.2 : 1}" ${act ? '' : 'stroke-dasharray="4 3"'} style="cursor:pointer;"><title>${act ? 'Con losa: tocá para sacársela' : 'Sin losa: tocá para ponérsela'}</title></rect>`;
    s += `<text x="${X(cx[i]) + lx * k / 2}" y="${Y(cy[j]) - ly * k / 2 + 4}" font-size="10.5" text-anchor="middle" pointer-events="none" fill="${act ? 'var(--accent-ink)' : 'var(--ink-soft)'}">${act ? `${fmt(lx, 2)} × ${fmt(ly, 2)}` : 'vacío'}</text>`;
  }));
  for (let i = 0; i <= xs.length; i++) {
    for (let j = 0; j <= ys.length; j++) {
      if (on(i - 1, j - 1) || on(i, j - 1) || on(i - 1, j) || on(i, j)) s += `<rect x="${X(cx[i]) - 4}" y="${Y(cy[j]) - 4}" width="8" height="8" fill="var(--ink)" pointer-events="none"/>`;
    }
  }
  cx.forEach((v, i) => { s += `<text x="${X(v)}" y="${Y(0) + 20}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)" pointer-events="none">${i + 1}</text>`; });
  cy.forEach((v, j) => { s += `<text x="${X(0) - 16}" y="${Y(v) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)" pointer-events="none">${letter(j)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:600px; height:auto; display:block; margin:8px 0;" role="img" aria-label="Planta con los paños que llevan losa">${s}</svg>`;
}

function typologyCard(calc) {
  const d = calc.design;
  const typo = d.typo || 'rect';
  const m = maskOf(calc);
  const nx = d.xSpans.length;
  const ny = d.ySpans.length;
  const noVoid = m.every((col) => col.every(Boolean));
  return `<div class="card" style="margin-top:16px;">
    <h3 style="margin-top:0;">Forma de la planta <span class="text-muted" style="font-weight:400; font-size:12.5px;">(tipología)</span></h3>
    <p class="text-muted" style="font-size:12.5px; margin:-6px 0 8px;">Elegí una forma y se arma sola sobre la grilla de arriba (con más vanos salen formas más finas: por ejemplo, una L de 4 × 4 vanos con un sector de 2 × 2 vacío). Después tocá cualquier paño del dibujo para sacarle o ponerle losa y armar la planta que necesites. Hay vigas solo donde hay losa a algún lado; las columnas nacen solo en los nudos que tocan una losa.</p>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.typo', 'Tipología', typo, TYPOS)}
      ${typo === 'rect' || typo === 'custom' ? '' : selField('design.rot', 'Orientación', String(Number(d.rot) || 0), [['0', 'Como se ve (huecos arriba o a la derecha)'], ['1', 'Girada 90°'], ['2', 'Girada 180°'], ['3', 'Girada 270°']])}
    </div>
    ${maskSketch(calc, m)}
    <p class="text-muted" style="font-size:12px; margin:0;">${noVoid ? 'Todos los paños llevan losa.' : `${m.flat().filter(Boolean).length} de ${nx * ny} paños con losa.`} Azul: con losa. Punteado: vacío (patio, hueco o fuera del edificio). Cuadrados negros: columnas.${nx < 3 && ny < 3 && !noVoid ? '' : ''}</p>
  </div>`;
}

// El cálculo del edificio puede tardar unos segundos: se guarda el resultado por entrada.
function cached(calc) {
  const key = JSON.stringify(inputOf(calc));
  return cache.get(key) || null;
}
function compute(calc) {
  const input = inputOf(calc);
  const key = JSON.stringify(input);
  if (!cache.has(key)) {
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    try { cache.set(key, designBuilding(input)); } catch (e) { cache.set(key, { ok: false, errors: ['No se pudo calcular con estos datos.'] }); }
  }
  return cache.get(key);
}
function rerender() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

const levelDefaults = (live, perm, h) => ({ h, live, perm, liveId: 'viv' });

// ---------------------------------------------------------------- módulo
export const buildingModule = {
  label: 'Edificio completo de hormigón armado',

  defaults() {
    return {
      design: {
        xSpans: [4.5, 4.5], ySpans: [4.5, 4.5],
        levels: [levelDefaults(2, 1.5, 3), levelDefaults(2, 1.5, 3), levelDefaults(1, 1.5, 3)],
        cant: { left: 0, right: 0, front: 0, back: 0 }, cantLive: 3, wall: 0, apeos: [],
      },
      section: { beamB: 20, beamHmin: 30, beamHmax: 60, slabHmin: 10, colShape: 'rect', colOrient: 'x', colMin: 20, colMax: 60 },
      materials: { fc: 25, placement: 'interior', exposure: 'A1A2', dagg: 19, dStirrup: 8, rhoMax: 4 },
      foundation: { sigma: 2, soilId: 'arcilla-humeda', gamma: 17.3, Df: 1.5 },
    };
  },

  // Para la lista y el botón de memoria: usa el resultado guardado, sin recalcular.
  run(calc) {
    const res = cached(calc);
    if (!res) return { pending: true };
    if (res.errors) return { error: res.errors.join(' ') };
    return { res, input: inputOf(calc) };
  },

  wire(root, calc) {
    const setLevels = (nl) => {
      setCalcField(calc.id, 'design.levels', nl);
      setCalcField(calc.id, 'design.apeos', (calc.design.apeos || []).filter((a) => a.level < nl.length));
    };
    root.querySelector('#nLevels')?.addEventListener('change', (e) => {
      const n = Math.max(1, Math.min(12, Math.round(Number(e.target.value)) || 1));
      const cur = calc.design.levels;
      if (n === cur.length) { e.target.value = n; return; }
      const nl = cur.slice(0, n);
      while (nl.length < n) nl.push({ ...nl[nl.length - 1] });
      setLevels(nl);
    });
    root.querySelector('#hAll')?.addEventListener('change', (e) => {
      const h = Number(e.target.value);
      if (!(h > 0)) return;
      setLevels(calc.design.levels.map((l) => ({ ...l, h })));
    });
    root.querySelector('#liveAll')?.addEventListener('change', (e) => {
      const preset = LIVE_LOADS.find((l) => l.id === e.target.value);
      if (!preset) return;
      setLevels(calc.design.levels.map((l) => ({ ...l, liveId: preset.id, live: preset.value })));
    });
    root.querySelector('[data-add-apeo]')?.addEventListener('click', () => {
      const f = root.querySelector('#apeoForm');
      const i = Number(f.apI.value) - 1;
      const j = f.apJ.value.toUpperCase().charCodeAt(0) - 65;
      const level = Number(f.apLevel.value);
      const dir = f.apDir.value;
      const d = calc.design;
      if (!(i >= 0 && i <= d.xSpans.length && j >= 0 && j <= d.ySpans.length && level >= 1 && level < d.levels.length)) { showToast('Revisá el eje, la letra y el nivel del apeo.'); return; }
      setCalcField(calc.id, 'design.apeos', [...(d.apeos || []).filter((a) => !(a.i === i && a.j === j)), { i, j, level, dir }]);
    });
    root.querySelectorAll('[data-del-apeo]').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.delApeo);
      setCalcField(calc.id, 'design.apeos', (calc.design.apeos || []).filter((_, idx) => idx !== k));
    }));
    root.querySelectorAll('[data-btab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.btab; rerender(); }));
    root.querySelector('#planLevelSel')?.addEventListener('change', (e) => { planLevel = Number(e.target.value); rerender(); });
    root.querySelector('#schLevel')?.addEventListener('change', (e) => { schLevel = Number(e.target.value); rerender(); });
    root.querySelector('#schLine')?.addEventListener('change', (e) => { schLine = e.target.value; rerender(); });
    root.querySelector('#schCol')?.addEventListener('change', (e) => { schCol = e.target.value; rerender(); });
    root.querySelectorAll('[data-cell]').forEach((el) => el.addEventListener('click', () => {
      const [i, j] = el.dataset.cell.split(',').map(Number);
      const m = maskOf(calc);
      m[i][j] = !m[i][j];
      if (!m.some((col) => col.some(Boolean))) { showToast('La planta necesita al menos un paño con losa.'); return; }
      setCalcField(calc.id, 'design.mask', maskRows(m, calc.design.xSpans.length, calc.design.ySpans.length));
      setCalcField(calc.id, 'design.typo', 'custom');
    }));
  },

  step1(calc) {
    const d = calc.design;
    const nx = d.xSpans.length;
    const ny = d.ySpans.length;
    const liveOpts = [...LIVE_LOADS.map((l) => [l.id, `${l.label} — ${fmt(l.value, 1)} kN/m²`]), ['custom', 'Otro valor']];
    const rows = d.levels.map((l, k) => `<tr>
      <td><b>Nivel ${k + 1}</b>${k === d.levels.length - 1 ? ' <span class="text-muted">(cubierta)</span>' : ''}</td>
      <td><input type="number" step="any" min="0" data-f="design.levels.${k}.h" data-num value="${l.h}" style="width:70px;" /></td>
      <td><select data-f="design.levels.${k}.liveId" style="max-width:240px;">${liveOpts.map(([v, t]) => `<option value="${v}" ${l.liveId === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></td>
      <td><input type="number" step="any" min="0" data-f="design.levels.${k}.live" data-num value="${l.live}" style="width:70px;" /></td>
      <td><input type="number" step="any" min="0" data-f="design.levels.${k}.perm" data-num value="${l.perm}" style="width:70px;" /></td></tr>`).join('');
    const apeoRows = (d.apeos || []).map((a, k) => `<div class="task-item" style="gap:10px; flex-wrap:wrap;">
      <span class="task-title">Columna ${colName(a.i, a.j)}</span><span class="text-muted" style="font-size:12.5px;">nace sobre la viga del nivel ${a.level}, en dirección ${a.dir === 'x' ? 'X' : 'Y'}</span>
      <button class="btn btn-sm btn-danger" data-del-apeo="${k}" style="margin-left:auto;">Quitar</button></div>`).join('');
    return `
      <div class="card">
        <h3 style="margin-top:0;">Pisos y sobrecarga</h3>
        <div class="field-row" style="flex-wrap:wrap; align-items:flex-end;">
          <div class="field"><label>Cantidad de niveles <span class="text-muted">(1 a 12)</span></label><input id="nLevels" type="number" min="1" max="12" step="1" value="${d.levels.length}" style="width:90px;" /></div>
          <div class="field"><label>Altura de entrepiso <span class="text-muted">(m, todos los niveles)</span></label><input id="hAll" type="number" min="0" step="any" value="${d.levels[0].h}" style="width:90px;" /></div>
          <div class="field"><label>Sobrecarga de uso <span class="text-muted">(todos los niveles)</span></label>
            <select id="liveAll"><option value="">— elegir destino —</option>${LIVE_LOADS.map((l) => `<option value="${l.id}">${escapeHtml(`${l.label} — ${fmt(l.value, 1)} kN/m²`)}</option>`).join('')}</select></div>
        </div>
        <p class="text-muted" style="font-size:12px; margin:0 0 8px;">Elegí un destino y se aplica a todos; después ajustá la cubierta o los niveles distintos en la tabla. Altura = distancia entre el nivel anterior (o la fundación) y este. Cargas permanentes sin el peso de losa y vigas (contrapiso, solado, cielorraso…): CIRSOC 101, Tablas 3.1 y 3.2.</p>
        <div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Altura (m)</th><th>Destino</th><th>L (kN/m²)</th><th>D extra (kN/m²)</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
      <div class="grid grid-2" style="align-items:start; margin-top:16px;">
        <div class="card">
          <h3 style="margin-top:0;">Esquema estructural: grilla de columnas</h3>
          ${axisEditor({ path: 'design.xSpans', spans: d.xSpans, title: 'Luces entre ejes en X', kind: 'num', sketch: false, hint: `${nx} vano${nx === 1 ? '' : 's'}: ejes 1 a ${nx + 1}. Cada casillero es la luz entre dos ejes de columnas.`, cant: { left: { path: 'design.cant.left', value: d.cant.left, label: 'Voladizo eje 1' }, right: { path: 'design.cant.right', value: d.cant.right, label: `Voladizo eje ${nx + 1}` } } })}
          ${axisEditor({ path: 'design.ySpans', spans: d.ySpans, title: 'Luces entre ejes en Y', kind: 'letter', sketch: false, hint: `${ny} vano${ny === 1 ? '' : 's'}: ejes A a ${letter(ny)}.`, cant: { left: { path: 'design.cant.front', value: d.cant.front, label: 'Voladizo eje A' }, right: { path: 'design.cant.back', value: d.cant.back, label: `Voladizo eje ${letter(ny)}` } } })}
          <div class="axed-sketch" style="border:0; padding:0 0 4px;">${gridSketch({ xs: d.xSpans.map(Number), ys: d.ySpans.map(Number), cantXL: Number(d.cant.left) || 0, cantXR: Number(d.cant.right) || 0, cantYB: Number(d.cant.front) || 0, cantYF: Number(d.cant.back) || 0 })}</div>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Voladizos y cerramientos</h3>
          <p class="text-muted" style="font-size:12px; margin:0 0 10px;">Los voladizos de losa más allá de los ejes extremos se cargan junto a las luces, en la grilla de columnas.</p>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.cantLive', 'Sobrecarga en voladizos', d.cantLive, { unit: 'kN/m²', hint: 'Balcones, CIRSOC 101 Tabla 4.1 (3 kN/m² en casas de 1 y 2 familias hasta 10 m²).' })}
            ${numField('design.wall', 'Carga lineal de cerramientos en el perímetro', d.wall, { unit: 'kN/m', hint: 'Muros sobre las vigas de borde, por nivel.' })}
          </div>
        </div>
      </div>
      ${typologyCard(calc)}
      <div class="card" style="margin-top:16px;">
        <h3 style="margin-top:0;">Apeos <span class="text-muted" style="font-weight:400; font-size:12.5px;">(columnas que no bajan a la fundación)</span></h3>
        <p class="text-muted" style="font-size:12.5px; margin:-6px 0 10px;">La columna del eje elegido nace sobre una viga del nivel indicado: debajo de ese nivel no hay columna en ese eje. La viga que la recibe se calcula con esa carga puntual.</p>
        ${apeoRows || '<p class="text-muted" style="font-size:12.5px;">Sin apeos.</p>'}
        <form id="apeoForm" onsubmit="return false;" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:10px;">
          <div class="field" style="margin:0;"><label>Eje X (1…${nx + 1})</label><input name="apI" type="number" min="1" max="${nx + 1}" value="2" style="width:80px;" /></div>
          <div class="field" style="margin:0;"><label>Eje Y (A…${letter(ny)})</label><input name="apJ" maxlength="1" value="B" style="width:80px;" /></div>
          <div class="field" style="margin:0;"><label>Nace sobre el nivel</label><input name="apLevel" type="number" min="1" max="${Math.max(1, d.levels.length - 1)}" value="1" style="width:90px;" /></div>
          <div class="field" style="margin:0;"><label>Viga que la recibe</label><select name="apDir"><option value="x">En dirección X</option><option value="y">En dirección Y</option></select></div>
          <button type="button" class="btn btn-sm btn-primary" data-add-apeo>Agregar apeo</button>
        </form>
      </div>`;
  },

  step2(calc) {
    const m = calc.materials;
    const s = calc.section;
    const f = calc.foundation;
    const shape = s.colShape || 'square';
    const soilOpts = [...SOIL_UNIT_WEIGHTS.map((x) => [x.id, `${x.label} — ${fmt(x.value, 1)} kN/m³`]), ['custom', 'Otro valor']];
    const colFields = shape === 'rect'
      ? `<div class="field-row" style="flex-wrap:wrap;">
          ${numField('section.colMin', 'Lado fijo (A)', s.colMin, { unit: 'cm', hint: 'Arriba la columna es A × A y el otro lado crece hacia la base según la carga.' })}
          ${numField('section.colMax', 'Lado variable máximo (B)', s.colMax || 0, { unit: 'cm', hint: 'Si necesita más, te lo avisa y muestra la sección necesaria. 0 = sin límite.' })}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('section.colOrient', 'Lado largo de la columna', s.colOrient || 'x', [['x', 'En dirección X'], ['y', 'En dirección Y']], 'Se dibuja así en la planta.')}
        </div>`
      : `<div class="field-row" style="flex-wrap:wrap;">
          ${numField('section.colMin', 'Lado mínimo (arriba)', s.colMin, { unit: 'cm', hint: 'Los dos lados crecen juntos hacia la base según la carga.' })}
          ${numField('section.colMax', 'Lado máximo', s.colMax || 0, { unit: 'cm', hint: 'Si necesita más, te lo avisa. 0 = sin límite.' })}
        </div>`;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Secciones: lo que querés usar</h3>
          <h4 style="margin:0 0 6px; font-size:13px;">Columnas</h4>
          ${selField('section.colShape', 'Forma', shape, [['rect', 'Rectangular (un lado fijo)'], ['square', 'Cuadrada']])}
          ${colFields}
          <h4 style="margin:12px 0 6px; font-size:13px;">Vigas</h4>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('section.beamB', 'Ancho de vigas (fijo)', s.beamB, { unit: 'cm', hint: 'Solo lo agranda si no entra la armadura.' })}
            ${numField('section.beamHmin', 'Altura mínima', s.beamHmin, { unit: 'cm', hint: 'Criterio constructivo (el reglamento da la mínima por Tabla 9.5.a).' })}
            ${numField('section.beamHmax', 'Altura máxima', s.beamHmax || 0, { unit: 'cm', hint: 'Si necesita más, te lo avisa. 0 = sin límite.' })}
          </div>
          <h4 style="margin:12px 0 6px; font-size:13px;">Losas</h4>
          ${numField('section.slabHmin', 'Espesor mínimo', s.slabHmin || 0, { unit: 'cm', hint: 'El cálculo lo sube si hace falta (ec. 9-12/9-13 y flexión).' })}
          <p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">Las columnas se achican hacia la cubierta (soportan menos pisos) y se agrandan hacia las bases; nunca una columna de abajo es más chica que la de arriba.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Materiales y suelo</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c} (${c} MPa)`]))}
            ${selField('materials.dStirrup', 'Estribos de vigas', m.dStirrup, [6, 8, 10].map((x) => [x, `ø${x} mm`]))}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('materials.rhoMax', 'Cuantía máxima de columnas', m.rhoMax, { unit: '%', hint: 'Criterio constructivo; el art. 10.9.1 admite hasta 8 %.' })}
            ${numField('materials.dagg', 'Tamaño máx. del agregado', m.dagg, { unit: 'mm' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.placement', 'Ubicación', m.placement, Object.entries(N.placement).map(([k, x]) => [k, x.label]))}
            ${selField('materials.exposure', 'Clase de exposición', m.exposure, Object.entries(N.exposure).map(([k, x]) => [k, x.label]))}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('foundation.sigma', 'Tensión admisible del suelo', f.sigma, { unit: 'kg/cm²', hint: 'Del estudio de suelos.' })}
            ${numField('foundation.Df', 'Profundidad Df', f.Df, { unit: 'm' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('foundation.soilId', 'Suelo sobre la zapata', f.soilId, soilOpts, 'CIRSOC 101, Tabla 3.2')}
            ${numField('foundation.gamma', 'Peso unitario del suelo', f.gamma, { unit: 'kN/m³' })}
          </div>
          <p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">En el paso 3 se dimensiona cada elemento partiendo de estas secciones y se agranda lo necesario hasta que todo verifique: losas por espesor mínimo (ec. 9-12/9-13), vigas por Tabla 9.5.a) y flexión/corte, columnas por resistencia.</p>
        </div>
      </div>`;
  },

  step3(calc) {
    const res = cached(calc);
    if (!res) {
      setTimeout(() => { compute(calc); rerender(); }, 30);
      return '<div class="card"><div class="empty-state"><div class="pt-spinner" style="margin:0 auto 10px;"></div>Calculando el edificio completo… puede tardar unos segundos.</div></div>';
    }
    if (res.errors) return `<div class="card"><div class="empty-state">${res.errors.map(escapeHtml).join('<br>')}</div></div>`;
    return buildingResults(calc, res);
  },

  memoria(calc, out) {
    const res = out.res;
    if (!res) return null;
    return buildingMemoria(calc, res);
  },
};

// ---------------------------------------------------------------- resultados
const tabs = [['resumen', 'Resumen'], ['planta', 'Planta'], ['esquemas', 'Esquemas'], ['losas', 'Losas'], ['vigas', 'Vigas'], ['columnas', 'Columnas'], ['bases', 'Bases']];

function buildingResults(calc, res) {
  const head = `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-btab="${k}">${l}</button>`).join('')}</div>
    <span class="tag ${res.ok ? 'tag-freelance' : 'tag-alta'}">${res.ok ? 'Verifican todos los elementos' : 'Hay elementos que no verifican'}</span></div>`;
  const body = { resumen: resumenTab, planta: plantaTab, esquemas: esquemasTab, losas: losasTab, vigas: vigasTab, columnas: columnasTab, bases: basesTab }[tab](calc, res);
  return head + body;
}

const cm = (m) => Math.round(m * 100);
const secTxt = (c) => `${cm(Math.min(c.cx, c.cy))} × ${cm(Math.max(c.cx, c.cy))}`;
const excTag = (list) => (list && list.length ? ` <span class="tag tag-media" title="Necesita más que lo indicado en el paso 2: ${escapeHtml(list.join(', '))}">supera lo indicado</span>` : '');

// "20 × 20 (×4) · 25 × 20 (×6)": medidas distintas con la cantidad de elementos, de menor a mayor.
function groups(items) {
  const map = new Map();
  items.forEach((t) => map.set(t, (map.get(t) || 0) + 1));
  const area = (t) => t.split(/[^\d]+/).filter(Boolean).map(Number).reduce((a, b) => a * b, 1);
  return [...map.entries()].sort((a, b) => area(a[0]) - area(b[0])).map(([t, n]) => `<span style="white-space:nowrap;">${t} <span class="text-muted">(×${n})</span></span>`).join(' · ') || '—';
}

function resumenTab(calc, res) {
  const { G, quantities: q, inp, des } = res;
  const per = (a, b) => (b > 0 ? fmt(a / b, 0) : '—');
  const top = Array.from({ length: G.n }, (_, idx) => G.n - idx);
  const dimRows = top.map((k) => `<tr><td><b>${k}</b>${k === G.n ? ' <span class="text-muted">cubierta</span>' : ''}</td>
    <td style="text-align:right;">${fmt(inp.levels[k - 1].live, 1)}</td>
    <td>${cm(res.sizes.slabH[k])}</td>
    <td>${groups([...des.beams[k].x, ...des.beams[k].y].map((b) => `${cm(b.b)} × ${cm(b.h)}`))}</td>
    <td>${groups(des.columns[k].map(secTxt))}</td></tr>`).join('');
  const footTxt = groups(des.footings.filter((f) => f.res.ok).map((f) => `${fmt(f.res.B / 10, 0)} × ${fmt(f.res.L / 10, 0)} × ${fmt(f.res.h / 10, 0)}`));
  const warn = res.warnings.length ? `<div class="note" style="margin-bottom:16px;">${res.warnings.map(escapeHtml).join('<br>')}</div>` : '';
  const lvRows = top.map((k) => {
    const l = q.levels[k];
    return `<tr><td><b>${k}</b></td><td style="text-align:right;">${fmt(l.slabVol, 1)}</td><td style="text-align:right;">${fmt(l.beamVol, 1)}</td><td style="text-align:right;">${fmt(l.colVol, 1)}</td><td style="text-align:right;"><b>${fmt(l.slabVol + l.beamVol + l.colVol, 1)}</b></td>
      <td style="text-align:right;">${fmt(l.slabKg, 0)}</td><td style="text-align:right;">${fmt(l.beamKg, 0)}</td><td style="text-align:right;">${fmt(l.colKg, 0)}</td><td style="text-align:right;"><b>${fmt(l.slabKg + l.beamKg + l.colKg, 0)}</b></td></tr>`;
  }).join('');
  return `${warn}
  <div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Dimensiones por nivel <span class="text-muted" style="font-weight:400; font-size:12.5px;">(cm)</span></h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Nivel</th><th style="text-align:right;">L (kN/m²)</th><th>Losa (e)</th><th>Vigas (b × h)</th><th>Columnas (A × B)</th></tr></thead><tbody>
      ${dimRows}
      <tr><td><b>Base</b></td><td></td><td></td><td></td><td>${footTxt} <span class="text-muted">(B × L × h)</span></td></tr>
      </tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Las columnas de la fila de cada nivel son las que llegan a ese nivel desde abajo: se achican hacia la cubierta porque soportan menos pisos y crecen hacia la base. En columnas rectangulares, A es el lado menor y B el mayor (${inp.colShape === 'rect' ? `el lado largo está en dirección ${inp.colOrient.toUpperCase()}` : 'cuadradas'}). Los números entre paréntesis son la cantidad de elementos con esa medida.</p></div>
    <div class="card"><h3 style="margin-top:0;">Hormigón y hierro</h3>
      <table class="data-table"><thead><tr><th></th><th style="text-align:right;">Hormigón (m³)</th><th style="text-align:right;">Hierro (kg)</th><th style="text-align:right;">kg/m³</th></tr></thead><tbody>
      ${[['Losas', 'slabs'], ['Vigas', 'beams'], ['Columnas', 'columns'], ['Bases', 'footings']].map(([l, k]) => `<tr><td>${l}</td><td style="text-align:right;">${fmt(q.concrete[k], 1)}</td><td style="text-align:right;">${fmt(q.steel[k], 0)}</td><td style="text-align:right;">${per(q.steel[k], q.concrete[k])}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td style="text-align:right;"><b>${fmt(q.concrete.total, 1)}</b></td><td style="text-align:right;"><b>${fmt(q.steel.total, 0)}</b></td><td style="text-align:right;"><b>${per(q.steel.total, q.concrete.total)}</b></td></tr>
      </tbody></table>
      <p style="font-size:13px; margin:10px 0 0;">Superficie construida ${fmt(q.area, 0)} m² → <b>${fmt(q.concrete.total / q.area, 2)} m³/m²</b> de hormigón y <b>${fmt(q.steel.total / q.area, 0)} kg/m²</b> de hierro.</p>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Estimación por longitudes de barra, sin empalmes, ganchos, desperdicio ni armadura de repartición. Para decidir entre secciones, comparalas cambiando el paso 2.</p></div>
  </div>
  <div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Por nivel</h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th rowspan="2">Nivel</th><th colspan="4" style="text-align:center;">Hormigón (m³)</th><th colspan="4" style="text-align:center;">Hierro (kg)</th></tr>
      <tr><th style="text-align:right;">Losa</th><th style="text-align:right;">Vigas</th><th style="text-align:right;">Col.</th><th style="text-align:right;">Total</th><th style="text-align:right;">Losa</th><th style="text-align:right;">Vigas</th><th style="text-align:right;">Col.</th><th style="text-align:right;">Total</th></tr></thead><tbody>
      ${lvRows}
      <tr><td><b>Bases</b></td><td colspan="3"></td><td style="text-align:right;"><b>${fmt(q.concrete.footings, 1)}</b></td><td colspan="3"></td><td style="text-align:right;"><b>${fmt(q.steel.footings, 0)}</b></td></tr>
      <tr><td><b>Total</b></td><td colspan="3"></td><td style="text-align:right;"><b>${fmt(q.concrete.total, 1)}</b></td><td colspan="3"></td><td style="text-align:right;"><b>${fmt(q.steel.total, 0)}</b></td></tr>
      </tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Las columnas del nivel N son las del entrepiso que llega a ese nivel.</p></div>
  <div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Hipótesis del cálculo</h3>
    <ul class="text-muted" style="font-size:12.5px; margin:0; padding-left:18px; line-height:1.55;">
      <li><b>Solo cargas gravitatorias</b> (peso propio, permanentes y sobrecarga; ${ART.combos}). Viento y sismo no están incluidos. Se supone pórtico indesplazable (arriostrado).</li>
      ${hasVoids(inp) ? '<li><b>Planta con paños vacíos</b> (tipología en L, U, T, con patio…): hay vigas solo donde algún paño vecino tiene losa; las vigas y las franjas de losa se parten en tramos continuos, y las columnas nacen solo en los nudos que tocan una losa.</li>' : ''}
      <li><b>Losas</b> por franjas continuas (${ART.slabs}): los paños con relación de luces mayor que 2 trabajan en una dirección; los demás reparten la carga por igualdad de flechas (Rankine-Grashof). No se calculan los refuerzos de esquina (art. 13.3.6) ni la torsión de las vigas de borde bajo voladizos.</li>
      <li><b>Vigas y columnas</b> por nivel (${ART.levelAnalysis}): sobrecarga solo en el nivel analizado, extremos lejanos de columnas empotrados (articulados en la base) y envolvente de sobrecarga por tramos independientes. Rigideces con la sección bruta (art. 8.6.1).</li>
      <li><b>Bases</b> aisladas con carga axial centrada: los momentos de columna no se transmiten a la fundación (bases excéntricas y medianeras: próximamente).</li>
      <li>Flechas de vigas y losas: se respeta el espesor mínimo de la Tabla 9.5.a) o las ecuaciones (9-12/9-13). Si una viga soporta tabiques dañables por flechas, verificala aparte con el módulo Viga.</li>
      <li>Los lados mínimos de columna, el ancho y la altura de vigas son criterios de proyecto tuyos: el cálculo verifica resistencia, no exigencias de sismo ni de detalle constructivo.</li>
      <li>Dimensionado automático: ${res.iterations} ${res.iterations === 1 ? 'iteración' : 'iteraciones'}.</li>
    </ul></div>`;
}

// ---------------------------------------------------------------- esquemas
// Nombre de una viga: eje y, si la línea se parte en varios tramos continuos, entre qué ejes va
function beamName(b, dir, G) {
  const full = b.ns === (dir === 'x' ? G.nx : G.ny);
  const eje = dir === 'x' ? `Eje ${letter(b.line)}` : `Eje ${b.line + 1}`;
  if (full) return eje;
  const ax = (q) => (dir === 'x' ? String(q + 1) : letter(q));
  return `${eje} (de ${ax(b.start)} a ${ax(b.start + b.ns)})`;
}

// r = índice de la viga (racha de tramos) en la lista del nivel
function lineSol(res, k, dir, r) {
  const { des, an } = res;
  const sols = dir === 'x' ? an.levels[k].solX : an.levels[k].solY;
  return { sol: sols[r], rec: des.beams[k][dir][r] };
}

function lineFig(res, k, dir, r, pal) {
  const { G } = res;
  const { sol, rec } = lineSol(res, k, dir, r);
  const curves = lineCurves(sol);
  const supports = Array.from({ length: sol.ns + 1 }, (_, q) => (dir === 'x' ? colName(rec.start + q, rec.line) : colName(rec.line, rec.start + q)));
  return lineFigure({ curves, design: rec.spans, supports, pal, title: `Nivel ${k} · viga ${beamName(rec, dir, G)} (dirección ${dir.toUpperCase()}) · ${fmt(rec.b * 100, 0)} × ${fmt(rec.h * 100, 0)} cm` });
}

// Armado de una viga continua de un nivel: elevación con las barras y los estribos de cada tramo, y diagramas de las envolventes
function lineArmadoFig(res, k, dir, r, pal) {
  const { inp, G } = res;
  const { sol, rec } = lineSol(res, k, dir, r);
  const curves = lineCurves(sol);
  const bmm = rec.b * 1000;
  const hmm = rec.h * 1000;
  const dSt = Number(inp.dStirrup) || 8;
  const spans = rec.spans.map((sp, i) => {
    const used = [sp.pos, sp.negLbars, sp.negRbars].filter(Boolean).map((o) => o.d);
    const d = Math.min(...(used.length ? used : [hmm - 60]), hmm - 60);
    return {
      L: sp.L, wu: 1.2 * curves.spans[i].wD + 1.6 * curves.spans[i].wL, d, vL: sp.vL, vR: sp.vR,
      pos: sp.pos, negL: sp.negLbars, negR: sp.negRbars,
      shearAt: (V) => rc.shearDesign({ Vu: V * 1000, b: bmm, d, h: hmm, fc: inp.fc, fyt: 420, dStirrup: dSt }),
    };
  });
  const names = Array.from({ length: sol.ns + 1 }, (_, q) => (dir === 'x' ? colName(rec.start + q, rec.line) : colName(rec.line, rec.start + q)));
  return armadoFigure({
    pal, kind: 'continuous', title: `Nivel ${k} · viga ${beamName(rec, dir, G)} (dirección ${dir.toUpperCase()}) · ${fmt(rec.b * 100, 0)} × ${fmt(rec.h * 100, 0)} cm`,
    spans, names, dSt, curves: curves.spans.map((c) => ({ pts: c.pts })), reactions: curves.reactions,
  });
}

function slabArmadoFig(res, k, pal) {
  const { G, des } = res;
  const sl = des.slabs[k];
  return slabLevelArmadoFigure({ level: k, hCm: sl.h * 100, X: G.X, Y: G.Y, panels: sl.panels, supportsX: sl.supportsX, supportsY: sl.supportsY, letter, on: (i, j) => panelOn(res.inp, i, j), pal });
}

function colStackFig(res, i, j, pal) {
  const { G, des, inp } = res;
  const levels = [];
  for (let m = G.n; m >= 1; m--) {
    const c = des.columns[m].find((x) => x.i === i && x.j === j);
    if (!c) continue;
    const ch = c.res.chosen;
    levels.push({ m, h: inp.levels[m - 1].h, Pu: c.PuTop, section: secTxt(c).replace(/ /g, ''), bars: ch ? `${ch.n}ø${ch.db}` : '' });
  }
  if (!levels.length) return '';
  const f = des.footings.find((x) => x.i === i && x.j === j);
  return columnStackFigure({ name: colName(i, j), levels, base: f && f.res.ok ? `${fmt(f.res.B / 10, 0)}×${fmt(f.res.L / 10, 0)}×${fmt(f.res.h / 10, 0)} cm` : '', pal });
}

function esquemasTab(calc, res) {
  const { G, des, inp } = res;
  const k = Math.min(Math.max(1, schLevel), G.n);
  const lineOpts = [];
  des.beams[k].x.forEach((b, r) => lineOpts.push([`x:${r}`, `${beamName(b, 'x', G)} (dirección X)`]));
  des.beams[k].y.forEach((b, r) => lineOpts.push([`y:${r}`, `${beamName(b, 'y', G)} (dirección Y)`]));
  const [dirRaw, lineStr] = schLine.split(':');
  const dir = dirRaw === 'y' && des.beams[k].y.length ? 'y' : 'x';
  const line = Math.min(Number(lineStr) || 0, des.beams[k][dir].length - 1);
  const colOpts = [];
  for (let i = 0; i <= G.nx; i++) for (let j = 0; j <= G.ny; j++) if (colExists(inp, 1, i, j)) colOpts.push([`${i},${j}`, colName(i, j)]);
  const [ci, cj] = schCol.split(',').map(Number);
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>`;
  return `<div class="card" style="margin-bottom:16px;"><div class="card-title-row"><h3>Viga continua: armado, corte y momento</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">${sel('schLevel', Array.from({ length: G.n }, (_, x) => [x + 1, `Nivel ${x + 1}`]), k)}${sel('schLine', lineOpts, `${dir}:${line}`)}</div></div>
      ${lineArmadoFig(res, k, dir, line, 'screen')}
      <details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12.5px;">Ver el esquema de cargas con las envolventes completas</summary>${lineFig(res, k, dir, line, 'screen')}</details>
      <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Son los esfuerzos mayorados (1,2 D + 1,6 L, con la sobrecarga alternada por tramos) con los que se dimensiona cada viga; las reacciones Ru son las cargas que llegan a las columnas.</p></div>
    <div class="card"><div class="card-title-row"><h3>Columna: bajada de cargas</h3>${sel('schCol', colOpts, `${ci},${cj}`)}</div>
      ${colStackFig(res, ci, cj, 'screen') || '<p class="text-muted">Esa columna no existe en ese eje.</p>'}</div>`;
}

function plantaTab(calc, res) {
  const { G, inp, sizes, des } = res;
  const k = Math.min(Math.max(1, planLevel), G.n);
  const opts = Array.from({ length: G.n }, (_, i) => `<option value="${i + 1}" ${i + 1 === k ? 'selected' : ''}>Nivel ${i + 1}</option>`).join('');
  return `<div class="card"><div class="card-title-row"><h3>Planta del nivel ${k}</h3><select id="planLevelSel">${opts}</select></div>${planSVG(inp, G, sizes, des, k)}
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Columnas: nombre y medida en cm (dimensión en X × dimensión en Y). Vigas: ancho × altura. El tono marca la losa y los voladizos. Las columnas con apeo se señalan con un rombo en el nivel donde nacen.</p></div>`;
}

function planSVG(inp, G, sizes, des, k) {
  const X = G.X;
  const Y = G.Y;
  const cl = inp.cant.left;
  const cr = inp.cant.right;
  const cf = inp.cant.front;
  const cb = inp.cant.back;
  const totW = X[X.length - 1] + cl + cr;
  const totH = Y[Y.length - 1] + cf + cb;
  const sc = Math.min(520 / totW, 380 / totH);
  const ox = 36 + cl * sc;
  const oy = 20 + cb * sc;
  const px = (x) => ox + x * sc;
  const py = (y) => oy + (Y[Y.length - 1] - y) * sc;   // el eje A abajo
  const W = totW * sc + 140;
  const H = totH * sc + 56;
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:640px;" role="img" aria-label="Planta estructural del nivel ${k}">`;
  if (!hasVoids(inp)) s += `<rect x="${px(-cl)}" y="${py(Y[Y.length - 1] + cb)}" width="${totW * sc}" height="${totH * sc}" fill="var(--accent)" fill-opacity="0.07" stroke="var(--line)"/>`;
  else X.slice(0, -1).forEach((x, i) => Y.slice(0, -1).forEach((y, j) => { if (panelOn(inp, i, j)) s += `<rect x="${px(x)}" y="${py(Y[j + 1])}" width="${(X[i + 1] - x) * sc}" height="${(Y[j + 1] - y) * sc}" fill="var(--accent)" fill-opacity="0.07" stroke="var(--line)"/>`; }));
  // vigas (cada racha de tramos continuos)
  des.beams[k].x.forEach((b) => {
    const y = Y[b.line];
    s += `<line x1="${px(X[b.start])}" y1="${py(y)}" x2="${px(X[b.start + b.ns])}" y2="${py(y)}" stroke="var(--ink-soft)" stroke-width="${Math.max(2, b.b * sc * 0.9)}" ${b.transfer ? 'stroke-opacity="1"' : 'stroke-opacity="0.55"'}/>`;
    s += `<text x="${px(X[b.start + b.ns]) + 6}" y="${py(y) + 14}" font-size="9.5" fill="var(--ink-soft)">${letter(b.line)} · ${fmt(b.b * 100, 0)}×${fmt(b.h * 100, 0)}</text>`;
  });
  des.beams[k].y.forEach((b) => {
    const x = X[b.line];
    s += `<line x1="${px(x)}" y1="${py(Y[b.start])}" x2="${px(x)}" y2="${py(Y[b.start + b.ns])}" stroke="var(--ink-soft)" stroke-width="${Math.max(2, b.b * sc * 0.9)}" stroke-opacity="${b.transfer ? 1 : 0.55}"/>`;
    s += `<text x="${px(x)}" y="${py(Y[b.start]) + 18}" font-size="9.5" text-anchor="middle" fill="var(--ink-soft)">${b.line + 1}</text><text x="${px(x)}" y="${py(Y[b.start]) + 29}" font-size="9" text-anchor="middle" fill="var(--ink-soft)">${fmt(b.b * 100, 0)}×${fmt(b.h * 100, 0)}</text>`;
  });
  // columnas
  for (let i = 0; i <= G.nx; i++) {
    for (let j = 0; j <= G.ny; j++) {
      if (!nodeOn(inp, i, j)) continue;
      const c = sizes.col[k][i][j];
      const exists = colExists(inp, k, i, j);
      const ap = (inp.apeos || []).find((a) => a.i === i && a.j === j && a.level === k);
      const w = Math.max(7, c.cx * sc);
      const h = Math.max(7, c.cy * sc);
      if (exists) {
        s += `<rect x="${px(X[i]) - w / 2}" y="${py(Y[j]) - h / 2}" width="${w}" height="${h}" fill="var(--ink)"/>`;
        s += `<text x="${px(X[i]) + w / 2 + 3}" y="${py(Y[j]) - h / 2 - 2}" font-size="8.5" fill="var(--ink)">${colName(i, j)} ${cm(c.cx)}×${cm(c.cy)}</text>`;
      } else {
        s += `<rect x="${px(X[i]) - 5}" y="${py(Y[j]) - 5}" width="10" height="10" fill="none" stroke="var(--bad)" stroke-dasharray="2 2"/>`;
      }
      if (ap) s += `<polygon points="${px(X[i])},${py(Y[j]) - 11} ${px(X[i]) + 9},${py(Y[j])} ${px(X[i]) },${py(Y[j]) + 11} ${px(X[i]) - 9},${py(Y[j])}" fill="none" stroke="var(--bad)" stroke-width="1.5"/>`;
    }
  }
  s += '</svg>';
  return s;
}

const barTxt = (b) => (b ? `ø${b.db} c/${fmt(b.s / 10, 0)}` : '—');

function losasTab(calc, res) {
  const { G, des, inp } = res;
  return Array.from({ length: G.n }, (_, idx) => {
    const k = G.n - idx;
    const sl = des.slabs[k];
    const rows = sl.panels.map((p) => `<tr><td>${p.i + 1}-${letter(p.j)}</td><td>${fmt(p.lx, 2)} × ${fmt(p.ly, 2)} m</td><td>${p.twoWay ? 'dos direcciones' : 'una dirección'}</td>
      <td style="text-align:right;">${fmt(p.Mx, 1)}</td><td>${barTxt(p.bx)}</td><td style="text-align:right;">${fmt(p.My, 1)}</td><td>${barTxt(p.by)}</td><td style="text-align:right;">${fmt(p.Vmax, 1)}</td></tr>`).join('');
    const sup = (arr, name) => arr.filter((s) => s.bar || s.M > 0).map((s) => `<tr><td>${name} ${name === 'Eje' ? s.line + 1 : letter(s.line)}</td><td style="text-align:right;">${fmt(s.M, 1)}</td><td>${barTxt(s.bar)}</td></tr>`).join('');
    return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Nivel ${k} — losa de ${fmt(sl.h * 100, 0)} cm <span class="text-muted" style="font-weight:400; font-size:12.5px;">Fe ≈ ${fmt(sl.kg || 0, 0)} kg (${fmt((sl.kg || 0) / (res.quantities.area / G.n), 1)} kg/m²)</span> ${sl.fail ? '<span class="tag tag-alta">No verifica</span>' : ''}</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Paño</th><th>Luces</th><th>Trabajo</th><th style="text-align:right;">Mx⁺ (kN·m/m)</th><th>Arm. inferior X</th><th style="text-align:right;">My⁺ (kN·m/m)</th><th>Arm. inferior Y</th><th style="text-align:right;">Vu máx (kN/m)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="grid grid-2" style="margin-top:10px;"><div class="table-wrap"><table class="data-table"><thead><tr><th>Apoyos (franjas en X)</th><th style="text-align:right;">M⁻ (kN·m/m)</th><th>Arm. superior</th></tr></thead><tbody>${sup(sl.supportsX, 'Eje')}</tbody></table></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Apoyos (franjas en Y)</th><th style="text-align:right;">M⁻ (kN·m/m)</th><th>Arm. superior</th></tr></thead><tbody>${sup(sl.supportsY, 'Eje')}</tbody></table></div></div>
      ${(inp.cant.left + inp.cant.right + inp.cant.front + inp.cant.back) > 0 ? '<p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los momentos negativos de los apoyos de borde incluyen el voladizo.</p>' : ''}
      <details style="margin-top:10px;" open><summary style="cursor:pointer; font-size:12.5px;">Planta de armado: dónde va el hierro</summary>${slabArmadoFig(res, k, 'screen')}</details></div>`;
  }).join('');
}

function bars(o) { return o ? `${o.n}ø${o.db}${o.layers === 2 ? ' (2 capas)' : ''}` : '—'; }

function vigasTab(calc, res) {
  const { G, des, inp } = res;
  void inp;
  return Array.from({ length: G.n }, (_, idx) => {
    const k = G.n - idx;
    const rows = ['x', 'y'].flatMap((dir) => des.beams[k][dir].map((b) => b.spans.map((s, si) => `<tr>
      ${si === 0 ? `<td rowspan="${b.spans.length}"><b>${beamName(b, dir, G)}</b> (${dir === 'x' ? 'dir. X' : 'dir. Y'})<br>${fmt(b.b * 100, 0)} × ${fmt(b.h * 100, 0)} cm${b.transfer ? '<br><span class="tag tag-media">viga de apeo</span>' : ''}${excTag(b.exceeds)}<br><span class="text-muted" style="font-size:12px;">Fe ≈ ${fmt(b.kg || 0, 0)} kg · ${fmt(b.vol || 0, 2)} m³</span>${b.fail ? '<br><span class="tag tag-alta">No verifica</span>' : ''}</td>` : ''}
      <td>${si + 1} (${fmt(s.L, 2)} m)</td><td style="text-align:right;">${fmt(s.posM, 1)}</td><td>${bars(s.pos)}</td>
      <td style="text-align:right;">${fmt(s.negL, 1)} / ${fmt(s.negR, 1)}</td><td>${bars(s.negLbars)} / ${bars(s.negRbars)}</td>
      <td style="text-align:right;">${fmt(s.Vu, 0)}</td><td>${s.shear && s.shear.stirrups ? `ø${calc.materials.dStirrup} c/${fmt(s.shear.s / 10, 0)}` : (s.shear && s.shear.ok ? 'mínimos' : '✗')}</td></tr>`).join(''))).join('');
    return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Nivel ${k}</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Viga</th><th>Tramo</th><th style="text-align:right;">Mu⁺ (kN·m)</th><th>Armadura inferior</th><th style="text-align:right;">Mu⁻ izq. / der.</th><th>Armadura superior en apoyos</th><th style="text-align:right;">Vu (kN)</th><th>Estribos</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('') + '<p class="text-muted" style="font-size:12px;">Las armaduras superiores de apoyo se extienden aproximadamente 0,3 de la luz de cada tramo adyacente (a verificar en el despiece).</p>';
}

// Cuadro de columnas: una fila por columna, un renglón por entrepiso de arriba hacia abajo y la base al final.
function cuadroColumnas(res) {
  const { G, des, inp } = res;
  const stories = Array.from({ length: G.n }, (_, idx) => G.n - idx);
  const rows = [];
  for (let i = 0; i <= G.nx; i++) {
    for (let j = 0; j <= G.ny; j++) {
      const cells = stories.map((m) => {
        const c = des.columns[m].find((x) => x.i === i && x.j === j);
        if (!c) return '<td class="text-muted">—</td>';
        const ch = c.res.chosen;
        return `<td style="white-space:nowrap;"><b>${secTxt(c)}</b>${c.ok ? '' : ' <span class="tag tag-alta">No verifica</span>'}${excTag(c.exceeds)}<br><span class="text-muted" style="font-size:12px;">${ch ? `${ch.n}ø${ch.db} · ø${ch.dbe} c/${fmt(ch.tieSpacing / 10, 0)}` : '—'}${c.kg ? ` · ${fmt(c.kg, 0)} kg` : ''}</span></td>`;
      }).join('');
      const f = des.footings.find((x) => x.i === i && x.j === j);
      const fc = f ? (f.res.ok ? `<td style="white-space:nowrap;"><b>${fmt(f.res.B / 10, 0)} × ${fmt(f.res.L / 10, 0)} × ${fmt(f.res.h / 10, 0)}</b><br><span class="text-muted" style="font-size:12px;">${f.res.layL.n}ø${f.res.db} / ${f.res.layB.n}ø${f.res.db} · ${fmt(f.res.steelKg, 0)} kg</span></td>` : '<td><span class="tag tag-alta">No verifica</span></td>') : '<td class="text-muted">—</td>';
      rows.push(`<tr><td><b>${colName(i, j)}</b></td>${cells}${fc}</tr>`);
    }
  }
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Cuadro de columnas <span class="text-muted" style="font-weight:400; font-size:12.5px;">(cm, hierro por entrepiso)</span></h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Columna</th>${stories.map((m) => `<th>Entrepiso ${m}</th>`).join('')}<th>Base (B × L × h)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Cada casilla: sección A × B en cm (A lado menor, B lado mayor${inp.colShape === 'rect' ? `; el lado largo está en dirección ${inp.colOrient.toUpperCase()}` : ''}), barras longitudinales, estribos y kg de hierro del entrepiso. "—" = no hay columna (apeo).</p></div>`;
}

function columnasTab(calc, res) {
  const { G, des } = res;
  return cuadroColumnas(res) + Array.from({ length: G.n }, (_, idx) => {
    const m = G.n - idx;
    const rows = des.columns[m].map((c) => {
      const ch = c.res.chosen;
      return `<tr><td><b>${colName(c.i, c.j)}</b></td><td>${secTxt(c)}${excTag(c.exceeds)}</td><td style="text-align:right;">${fmt(c.lu, 2)}</td>
        <td style="text-align:right;">${fmt(c.PuTop, 0)}</td><td>${ch ? `${ch.n} ø${ch.db} (${fmt(ch.rho * 100, 1)} %)` : '—'}</td><td>${ch ? `ø${ch.dbe} c/${fmt(ch.tieSpacing / 10, 1)}` : '—'}</td>
        <td style="text-align:right;">${fmt(c.kg || 0, 0)}</td>
        <td style="text-align:right;">${ch ? `${fmt(ch.util * 100, 0)} %` : '—'}</td><td>${c.ok ? '' : '<span class="tag tag-alta">No verifica</span>'}${ch && ch.biaxial ? ' biaxial' : ''}</td></tr>`;
    }).join('');
    return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Entrepiso ${m} <span class="text-muted" style="font-weight:400; font-size:12.5px;">(columnas que llegan al nivel ${m})</span></h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Columna</th><th>Sección A × B (cm)</th><th style="text-align:right;">ℓu (m)</th><th style="text-align:right;">Pu (kN)</th><th>Armadura</th><th>Estribos</th><th style="text-align:right;">Fe (kg)</th><th style="text-align:right;">Aprov.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');
}

function basesTab(calc, res) {
  const { des } = res;
  const rows = des.footings.map((f) => {
    const r = f.res;
    return `<tr><td><b>${colName(f.i, f.j)}</b></td><td style="text-align:right;">${fmt(f.PD, 0)} / ${fmt(f.PL, 0)}</td>
      <td>${r.ok ? `${fmt(r.B / 10, 0)} × ${fmt(r.L / 10, 0)} × ${fmt(r.h / 10, 0)} cm` : '<span class="tag tag-alta">No verifica</span>'}</td>
      <td>${r.ok ? `${r.layL.n} ø${r.db} // L · ${r.layB.n}${r.outsideBars ? `+${r.outsideBars}` : ''} ø${r.db} // B` : escapeHtml(r.reason || '')}</td><td>${r.ok ? (r.hooks ? 'con gancho a 90°' : 'barra recta') : ''}</td>
      <td style="text-align:right;">${r.ok ? `${fmt(r.concrete, 2)} m³ · ${fmt(r.steelKg, 0)} kg` : ''}</td></tr>`;
  }).join('');
  return `<div class="card"><h3 style="margin-top:0;">Bases aisladas</h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Columna</th><th style="text-align:right;">D / L (kN)</th><th>B × L × h</th><th>Armadura</th><th>Anclaje</th><th style="text-align:right;">Cómputo</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Carga axial centrada, con el peso de la columna incluido. Cada base verifica tensión del suelo, flexión, corte, punzonado, anclaje y aplastamiento (Cap. 15, 11.12, 12.2).</p></div>`;
}

// ---------------------------------------------------------------- memoria
function buildingMemoria(calc, res) {
  const { G, sizes, inp, des, quantities: q } = res;
  const d = calc.design;
  const levelRows = d.levels.map((l, k) => memoRow(`Nivel ${k + 1}: altura ${fmt(l.h, 2)} m`, `L = ${fmt(l.live, 1)} kN/m² · D extra = ${fmt(l.perm, 1)} kN/m² · losa ${fmt(sizes.slabH[k + 1] * 100, 0)} cm`)).join('');
  const colRows = [];
  for (let m = 1; m <= G.n; m++) des.columns[m].forEach((c) => {
    const ch = c.res.chosen;
    colRows.push(memoRow(`Columna ${colName(c.i, c.j)} — entrepiso ${m}: ${secTxt(c)} cm`, ch ? `${ch.n} ø${ch.db}, estribos ø${ch.dbe} c/${fmt(ch.tieSpacing / 10, 1)} · Pu ${fmt(c.PuTop, 0)} kN · Fe ${fmt(c.kg || 0, 0)} kg` : '—'));
  });
  const beamRows = [];
  for (let k = G.n; k >= 1; k--) ['x', 'y'].forEach((dir) => des.beams[k][dir].forEach((b) => {
    beamRows.push(memoRow(`Nivel ${k}, viga eje ${dir === 'x' ? letter(b.line) : b.line + 1} (${dir.toUpperCase()}): ${fmt(b.b * 100, 0)} × ${fmt(b.h * 100, 0)} cm`,
      b.spans.map((s) => `${bars(s.pos)} / ${bars(s.negLbars)}-${bars(s.negRbars)}`).join(' · ')));
  }));
  const footRows = des.footings.map((f) => memoRow(`Base ${colName(f.i, f.j)}: D ${fmt(f.PD, 0)} kN, L ${fmt(f.PL, 0)} kN`, f.res.ok ? `${fmt(f.res.B / 10, 0)} × ${fmt(f.res.L / 10, 0)} × ${fmt(f.res.h / 10, 0)} cm, ${f.res.layL.n} ø${f.res.db} / ${f.res.layB.n} ø${f.res.db}` : 'no verifica'));
  // esquemas: la viga más solicitada de cada nivel y la columna más cargada
  const schemes = [];
  for (let k = G.n; k >= 1; k--) {
    let best = null;
    ['x', 'y'].forEach((dr) => des.beams[k][dr].forEach((b, r) => { const m = Math.max(...b.spans.map((s) => s.posM)); if (!best || m > best.m) best = { m, dir: dr, line: r }; }));
    if (best) schemes.push(lineFig(res, k, best.dir, best.line, 'print'), lineArmadoFig(res, k, best.dir, best.line, 'print'));
  }
  let topFoot = null;
  des.footings.forEach((f) => { if (!topFoot || f.PD + f.PL > topFoot.PD + topFoot.PL) topFoot = f; });
  const stack = topFoot ? colStackFig(res, topFoot.i, topFoot.j, 'print') : '';
  return {
    title: calc.name,
    sub: `Edificio de ${G.n} niveles · ${G.nx} × ${G.ny} vanos · ${fmt(inp.xSpans.reduce((a, b) => a + b, 0), 1)} × ${fmt(inp.ySpans.reduce((a, b) => a + b, 0), 1)} m`,
    html: `
    <h2>1. Hipótesis</h2>
    <table>${memoRow('Acciones', 'Solo gravitatorias; pórtico indesplazable', ART.combos)}${memoRow('Losas', 'Franjas continuas; una dirección si la relación de luces > 2; Rankine-Grashof en las demás', ART.slabs)}
      ${memoRow('Vigas y columnas', 'Subpórtico por nivel, extremos lejanos empotrados (articulado en la base), envolvente de sobrecarga', ART.levelAnalysis)}${memoRow('Bases', 'Aisladas, carga axial centrada', 'CIRSOC 201 Cap. 15')}
      ${memoRow('Hormigón / acero', `H-${inp.fc} / ADN 420`)}${memoRow('Suelo', `${fmt(calc.foundation.sigma, 2)} kg/cm², Df = ${fmt(calc.foundation.Df, 2)} m`)}${memoRow('Cargas', 'Pesos unitarios y sobrecargas', ART.loads)}</table>
    <h2>2. Niveles y losas</h2><table>${levelRows}</table>${Array.from({ length: G.n }, (_, i) => slabArmadoFig(res, G.n - i, 'print')).join('')}
    <h2>3. Vigas</h2><table>${beamRows.join('')}</table>
    <h2>Esquemas de cálculo</h2><p class="mem-sub">Viga más solicitada de cada nivel (cargas, reacciones, envolventes de corte y momento mayorados) y bajada de cargas de la columna más cargada.</p>${schemes.join('')}${stack}
    <h2>4. Columnas</h2><table>${colRows.join('')}</table>
    <h2>5. Bases</h2><table>${footRows}</table>
    <h2>6. Cómputo orientativo</h2>
    <table>${[['Losas', 'slabs'], ['Vigas', 'beams'], ['Columnas', 'columns'], ['Bases', 'footings']].map(([l, k]) => memoRow(l, `${fmt(q.concrete[k], 1)} m³ · ${fmt(q.steel[k], 0)} kg`)).join('')}${memoRow('Total', `${fmt(q.concrete.total, 1)} m³ · ${fmt(q.steel.total, 0)} kg`)}${memoRow('Por m² construido', `${fmt(q.concrete.total / q.area, 2)} m³/m² · ${fmt(q.steel.total / q.area, 0)} kg/m²`)}</table>
    <p class="mem-foot">Los detalles de cada elemento (momentos, cortes y verificaciones) están en las pestañas del módulo. Esta memoria resume el resultado; el despiece, los empalmes y los refuerzos de esquina y de borde deben completarse en el proyecto ejecutivo.</p>`,
  };
}
