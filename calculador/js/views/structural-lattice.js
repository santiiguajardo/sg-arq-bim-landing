// Columna reticulada de acero (dos cordones con diagonales en zigzag, o cuatro cordones con diagonales en las cuatro caras).
// Motor en js/structural/steel-lattice.js. El método de la cátedra (TP 5) cubre las presillas; la rigidez al corte de la celosía se deduce (Engesser).
import { previewSketch } from './structural-spans.js';
import * as S from '../structural/steel.js';
import * as L from '../structural/steel-lattice.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';
import { latticeColumnFigure } from './structural-draw.js';
import { jointsPanel, jointsLattice, jointsMemo } from './structural-joints.js';

const GRADE_OPTS = Object.entries(S.GRADES).map(([k, g]) => [k, g.label]);
const OMEGA_OPTS = [['grade', 'Tabla ω del acero elegido (más conservadora)'], ['St37', 'Tabla 3 del apunte (acero St 37), como en los ejemplos de la cátedra']];
const SUP_OPTS = Object.entries(S.SUPPORTS_BUCKLING).map(([k, v]) => [k, `${v.label} (Lp = ${v.k} H)`]);
const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
const ART = {
  composite: 'Columna compuesta (TP 5, apunte "Compresión con pandeo"): λ ideal, λ1 = s / i1 ≤ 50, Q = ω N / 80',
  shear: 'Rigidez al corte de las diagonales (Engesser): λi² = λy² + π² A / (n Ad sen²α cos α), deducida; no figura en los apuntes',
};
const NOTE = 'El apunte de la cátedra desarrolla la columna compuesta con presillas. Para la celosía se mantiene la estructura de verificación (esbeltez ideal, esbeltez local ≤ 50, corte ideal Q = ωN/80) y se agrega el efecto de la deformación por corte de las diagonales con el criterio de Engesser (1/Pcr = 1/PE + 1/S, S = n E Ad sen²α cos α, α con el eje de la columna). Esa parte no está transcripta de un reglamento: verificala con el CIRSOC 301 antes de usarla en obra.';

function paramsOf(calc) {
  const d = calc.design;
  const s = calc.section;
  return {
    N: Number(d.N), H: Number(d.H), support: d.support, kind: Number(d.kind) === 4 ? 4 : 2, chordType: s.chordType, e: Number(d.e), e2: Number(d.e2), alpha: Number(d.alpha), diagType: s.diagType, lpD: Number(d.lpD),
    grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, chordName: s.chordName && s.chordName !== 'auto' ? s.chordName : null, diagName: s.diagName && s.diagName !== 'auto' ? s.diagName : null,
  };
}

export const latticeModule = {
  label: 'Columna reticulada de acero',
  defaults(variant) {
    const four = variant === '4';
    return {
      design: { kind: four ? 4 : 2, N: four ? 30000 : 60000, H: 5, support: 'art-art', e: 30, e2: 30, alpha: 60, lpD: 1 },
      section: { chordType: four ? 'L' : 'UPN', diagType: 'L', chordName: 'auto', diagName: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade' },
      verification: {},
    };
  },
  input(calc) { return paramsOf(calc); },
  run(calc) {
    const input = paramsOf(calc);
    if (![input.N, input.H, input.e].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá la carga, la altura y la distancia entre cordones con valores mayores que cero.' };
    try { return { res: { ...L.designLatticeColumn(input), steel: true, lattice: true }, input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },
  step1(calc) {
    const d = calc.design;
    const four = Number(d.kind) === 4;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Columna y sustentación</h3>
          ${previewSketch('lattice', d)}
          ${selField('design.kind', 'Sección', four ? 4 : 2, [[2, 'Dos cordones con diagonales en un plano'], [4, 'Cuatro cordones con diagonales en las cuatro caras']])}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.N', 'Carga axial N', d.N, { unit: 'kg', hint: 'De servicio; se suma el peso propio de la columna.' })}${numField('design.H', 'Altura H', d.H, { unit: 'm' })}
          </div>
          ${selField('design.support', 'Sustentación', d.support, SUP_OPTS, 'Longitud de pandeo del apunte.')}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Celosía</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.e', four ? 'Distancia entre cordones en X (entre ejes)' : 'Distancia entre ejes de cordones e', d.e, { unit: 'cm' })}
            ${four ? numField('design.e2', 'Distancia entre cordones en Y', d.e2, { unit: 'cm' }) : ''}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.alpha', 'Ángulo de las diagonales con el eje de la columna', d.alpha, { unit: '°', hint: 'Usual: entre 40° y 70° (ideal 60°, apunte "Vigas reticuladas").' })}
            ${numField('design.lpD', 'Longitud de pandeo de las diagonales', d.lpD, { unit: '× longitud', hint: '1 = articuladas; 0,75 si son continuas.' })}
          </div>
          <p class="text-muted" style="font-size:12px; margin:0;">Diagonales en zigzag (una por cada medio paso); los nudos de un mismo cordón quedan a 2 e cotg α. ${four ? 'Con cuatro cordones el corte de cada dirección lo toman dos caras.' : ''}</p>
        </div>
      </div>
      <div class="note" style="margin-top:16px;">${NOTE}</div>`;
  },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    const s = calc.section;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Acero y secciones</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.grade', 'Calidad del acero', calc.materials.grade, GRADE_OPTS, `σadm = ${fmt(S.GRADES[calc.materials.grade].sadm, 0)} kg/cm²`)}
            ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('section.chordType', 'Cordones', s.chordType, Object.entries(L.CHORD_TYPES))}
            ${selField('section.diagType', 'Diagonales', s.diagType, Object.entries(L.DIAG_TYPES))}
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Predimensionado</h3>
          ${res ? `<table class="data-table"><tbody>
            <tr><td>Longitud de pandeo Lp (${escapeHtml(res.sup.label)})</td><td style="text-align:right;">${fmt(res.Lp, 0)} cm</td></tr>
            <tr><td>Área total estimada (σ = σadm/2, ω = 1)</td><td style="text-align:right;"><b>${fmt(res.Apre, 1)} cm²</b>${res.m === 2 ? ` (≈ ${fmt(res.Apre / 2, 1)} cm² por cordón)` : ` (≈ ${fmt(res.Apre / 4, 1)} cm² por cordón)`}</td></tr>
            <tr><td>Paso de la celosía (nudos de un mismo cordón) · diagonales por cara</td><td style="text-align:right;">${fmt(res.pitch, 0)} cm · ${res.nSp * 2}</td></tr>
            <tr><td>Largo de cada diagonal</td><td style="text-align:right;">${fmt(res.ld, 0)} cm</td></tr>
          </tbody></table>
          <p class="text-muted" style="font-size:12px; margin:8px 0 0;">En el paso 3 se elige el cordón más liviano que verifica y, para él, la diagonal más liviana que verifica.</p>` : `<div class="empty-state">${out.error || 'Completá el paso 1.'}</div>`}
        </div>
      </div>`;
  },
  step3(calc, out) {
    const s = calc.section;
    const res = out.res;
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      <div class="field-row" style="flex-wrap:wrap;">${selField('section.chordType', 'Cordones', s.chordType, Object.entries(L.CHORD_TYPES))}${selField('section.chordName', 'Perfil', s.chordName || 'auto', [['auto', 'Automático: el más liviano'], ...(res ? res.chordsList.map((p) => [p.n, p.n]) : [])])}</div>
      <div class="field-row" style="flex-wrap:wrap;">${selField('section.diagType', 'Diagonales', s.diagType, Object.entries(L.DIAG_TYPES))}${selField('section.diagName', 'Perfil', s.diagName || 'auto', [['auto', 'Automático: el más liviano'], ...(res ? res.diagsList.map((p) => [p.n, p.n]) : [])])}</div>
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
      <p class="text-muted" style="font-size:12px; margin:0;">${NOTE}</p></div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${results(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return memoria(calc, out); },
};

function figOf(res, input, pal) {
  return latticeColumnFigure({ H: input.H, e: res.e, e2: res.e2, m: res.m, alpha: res.alpha, pitch: res.pitch, N: res.Nt, Lp: res.Lp, k: res.sup.k, support: input.support,
    chordName: res.chordProfile.n, diagName: res.diag.n, lamI: Math.max(res.lamIx, res.lamIy), om: res.om, sigma: res.sigma, sigAllow: res.sigAllow }, pal);
}

function checksOf(res) {
  if (res.reason) return [{ ok: false, label: 'Esbeltez', text: res.reason }];
  const c = [];
  if (res.m === 2) c.push({ ok: res.omX * res.Nt / res.A <= res.sigAllow, label: 'Eje material x–x', text: `λx = ${fmt(res.lamX, 1)}, ωx = ${fmt(res.omX, 2)}: σ = ${kg(res.omX * res.Nt / res.A)} ≤ ${kg(res.sigAllow)} kg/cm²` });
  else c.push({ ok: res.omX * res.Nt / res.A <= res.sigAllow, label: 'Eje x–x (con corte)', text: `λx = ${fmt(res.lamX, 1)}, λd = ${fmt(res.lamD, 1)}, λi = ${fmt(res.lamIx, 1)}, ω = ${fmt(res.omX, 2)}: σ = ${kg(res.omX * res.Nt / res.A)} ≤ ${kg(res.sigAllow)} kg/cm²` });
  c.push({ ok: res.omY * res.Nt / res.A <= res.sigAllow, label: 'Eje inmaterial y–y', text: `λy = ${fmt(res.lamY, 1)}, λd = ${fmt(res.lamD, 1)} (corte de la celosía), λi = ${fmt(res.lamIy, 1)}, ω = ${fmt(res.omY, 2)}: σ = ${kg(res.omY * res.Nt / res.A)} ≤ ${kg(res.sigAllow)} kg/cm²` });
  c.push({ ok: res.lam1Ok && res.sig1 <= res.sigAllow, label: 'Cordón entre nudos', text: `s = ${fmt(res.pitch, 0)} cm: λ1 = s / i1 = ${fmt(res.lam1, 1)} ≤ 50; ω1 = ${fmt(res.om1, 2)}: σ = ${kg(res.sig1)} ≤ ${kg(res.sigAllow)} kg/cm²` });
  c.push({ ok: res.sigD <= res.sigDAllow, label: 'Diagonales', text: `Q = ωN/80 = ${kg(res.Q)} kg → D = Q / (n sen α) = ${kg(res.D)} kg; λ = ${fmt(res.lamDg, 0)}, ω = ${res.omD === null ? '—' : fmt(res.omD, 2)}: σ = ${kg(res.sigD)} ≤ ${kg(res.sigDAllow)} kg/cm²${res.lamDg > 200 ? ' (esbeltez mayor que 200)' : ''}` });
  return c;
}

function results(calc, out) {
  const { res, input } = out;
  if (!res.chordProfile || res.reason) return failCard(res.reason || 'No se encontró una solución.');
  const checks = checksOf(res);
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Columna reticulada ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td>Cordones (${res.m})</td><td style="text-align:right;"><b>${escapeHtml(res.chordProfile.n)}</b> · ${fmt(res.chordProfile.G, 2)} kg/m</td></tr>
        <tr><td>Diagonales (${res.diagCount} de ${fmt(res.ld, 0)} cm)</td><td style="text-align:right;"><b>${escapeHtml(res.diag.n)}</b></td></tr>
        <tr><td>Carga con el peso propio de los cordones</td><td style="text-align:right;">${kg(res.Nt)} kg</td></tr>
        <tr><td>Peso de la columna: cordones · diagonales</td><td style="text-align:right;">${kg(res.wChords)} · ${kg(res.wDiag)} kg (${fmt(res.weight / input.H, 1)} kg/m)</td></tr>
      </tbody></table>
      ${res.warnings.map((w) => `<p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">${escapeHtml(w)}</p>`).join('')}
    </div>
    <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${figOf(res, input, 'screen')}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">${ART.composite}. ${ART.shear}.</p></div>
    ${checksCard({ ok: res.ok, checks })}
    ${jointsPanel(calc, jointsLattice(res, calc))}`;
}

function memoria(calc, out) {
  const { res, input } = out;
  if (!res.chordProfile || res.reason) return null;
  const checks = checksOf(res);
  return {
    title: calc.name,
    sub: `Columna reticulada de acero · ${res.m} cordones · H = ${fmt(input.H, 2)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, 'Método elástico: σ ≤ σadm = fluencia / 1,6')}${memoRow('Carga N', `${kg(res.N0)} kg (con el peso de los cordones: ${kg(res.Nt)} kg)`)}
        ${memoRow('Sustentación', `${escapeHtml(res.sup.label)}; Lp = ${fmt(res.sup.k, 1)} H = ${fmt(res.Lp, 0)} cm`, 'Apunte "Longitud de pandeo"')}
        ${memoRow('Celosía', `${res.m === 2 ? `e = ${fmt(res.e, 0)} cm` : `${fmt(res.e, 0)} × ${fmt(res.e2, 0)} cm`}; diagonales en zigzag a α = ${fmt(res.alpha, 0)}° con el eje; paso ${fmt(res.pitch, 0)} cm`)}
        ${memoRow('Coeficiente ω', input.omegaTable === 'St37' ? 'Tabla 3 del apunte (St 37)' : `Tabla del ${res.grade.omega}`)}</table>
      <h2>2. Esquema</h2>
      ${figOf(res, input, 'print')}
      <h2>3. Verificaciones</h2>
      <table>${memoRow('Cordones', `${res.m} × ${escapeHtml(res.chordProfile.n)}: A total = ${fmt(res.A, 1)} cm²; ix = ${fmt(res.ixSect, 2)} cm, iy = ${fmt(res.iySect, 2)} cm`, ART.composite)}${memoRow('Efecto del corte de la celosía', `λd = ${fmt(res.lamD, 1)}`, ART.shear)}
        ${checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('')}
        ${memoRow('Diagonales', `${escapeHtml(res.diag.n)}`)}${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>4. Uniones</h2>
      ${jointsMemo(jointsLattice(res, calc))}
      <h2>5. Cómputo</h2>
      <table>${memoRow('Peso', `cordones ${kg(res.wChords)} kg + diagonales ${kg(res.wDiag)} kg = ${kg(res.weight)} kg (${fmt(res.weight / input.H, 1)} kg/m)`, 'Sin chapas de unión, placas de base ni soldaduras')}
        ${memoRow('Nota', 'La rigidez al corte de la celosía se dedujo con el criterio de Engesser y no figura en los apuntes: verificar con el CIRSOC 301.')}</table>`,
  };
}
