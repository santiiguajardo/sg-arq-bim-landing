// Estructuras de acero (método elástico de la cátedra de Estructuras III): viga, correa, columna, tensor y edificio (entrepiso).
// Unidades: kg, kg·m, kg/cm² y cm (como en los apuntes). Ver js/structural/steel.js y steel-design.js.
import * as S from '../structural/steel.js';
import * as D from '../structural/steel-design.js';
import { setCalcField } from '../state.js';
import { escapeHtml, showToast } from '../utils.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';
import { steelBeamFigure, steelColumnFigure, floorPlanFigure } from './structural-draw.js';
import * as J from '../structural/steel-joints.js';
import { axisEditor, gridSketch, previewSketch } from './structural-spans.js';
import { deflSelect, jointsPanel, jointsMemo, jointsBeam, jointsPurlin, jointsColumn, jointsFloor, jointsTie } from './structural-joints.js';

const ART = {
  method: 'Método elástico: σ ≤ σadm = fluencia / 1,6 (apunte "Teoría acero", CIRSOC 301)',
  omega: 'Método ω de pandeo (apunte "Compresión con pandeo"; tablas de coeficientes de pandeo)',
  shear: 'Tensión de corte por flexión (Colignon): τ = Q S / (J t) ≤ τadm',
  defl: 'Flecha admisible L/300 (apunte), correas de techo L/200',
  oblique: 'Flexión simple oblicua (apunte "Correas"): σ = Mx/Wx + My/Wy ≤ σadm',
  roof: 'CIRSOC 101-1982, art. 4.1.7.1 (sobrecarga de cubierta)',
  battened: 'Columnas compuestas con presillas (TP 5): λi = √(λy² + (m/2) λ1²), Q = ω N / 80',
  tie: 'Tensores: A ≥ T / σadm y ΔL = T L / (E A) (apunte)',
};
const GRADE_OPTS = Object.entries(S.GRADES).map(([k, g]) => [k, g.label]);
const OMEGA_OPTS = [['grade', 'Tabla ω del acero elegido (más conservadora)'], ['St37', 'Tabla 3 del apunte (acero St 37), como en los ejemplos de la cátedra']];
const BEAM_TYPES = [['IPN', 'Doble T normal (IPN)'], ['UPN', 'Perfil U normal (UPN)'], ['IPE', 'Doble T IPE'], ['HEB', 'Doble T ala ancha (HEB)'], ['TR', 'Tubo rectangular'], ['TC', 'Tubo cuadrado']];
const SUP_OPTS = Object.entries(S.SUPPORTS_BUCKLING).map(([k, v]) => [k, `${v.label} (Lp = ${v.k} H)`]);
const kgm = (v) => `${fmt(v, 0)} kg·m`;

function materialsCard(calc, extra = '') {
  const m = calc.materials;
  return `<div class="card"><h3 style="margin-top:0;">Acero</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('materials.grade', 'Calidad del acero', m.grade, GRADE_OPTS, `σadm = ${fmt(S.GRADES[m.grade].sadm, 0)} kg/cm² (fluencia / 1,6) · τadm = ${fmt(S.GRADES[m.grade].tadm, 0)} kg/cm²`)}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', m.omegaTable, OMEGA_OPTS, 'Solo cuenta en piezas comprimidas.')}
    </div>
    ${extra}
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${ART.method}. Los perfiles de chapa plegada (PGC) se verifican con σ = ${S.SIGMA_FORMED} kg/cm² (apunte, para no verificar pandeo lateral ni abolladura). Los perfiles salen de las tablas del apunte.</p></div>`;
}

function profileSelect(calc, res, types, label = 'Perfil') {
  const cur = calc.section.name || 'auto';
  const names = (res && res.candidates ? res.candidates : S.profileList(types)).slice(0, 200).map((p) => p.n);
  const opts = [['auto', 'Automático: el más liviano que verifica'], ...names.map((n) => [n, n])];
  return selField('section.name', label, cur, opts);
}

const checkRows = (list) => list.map(([ok, label, text]) => ({ ok, label, text }));

function pill(ok) { return ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>'; }

// ================================================================= VIGA
const limOf = (d, def) => { const l = J.DEFLECTION_LIMITS[d.deflLimit]; return l ? { total: l.total, live: l.live } : { total: Number(d.fRatio) || def, live: 0 }; };
function beamInput(calc) {
  const d = calc.design;
  const s = calc.section;
  return {
    spans: d.spans.map(Number), cantL: Number(d.cantL) || 0, cantR: Number(d.cantR) || 0, width: Number(d.width), g: Number(d.g) || 0, p: Number(d.p) || 0, line: Number(d.line) || 0,
    points: (d.points || []).map((q) => ({ span: Number(q.span), x: Number(q.x), P: Number(q.P), kind: q.kind || 'D' })),
    pattern: d.pattern === 'alt' ? 'alt' : 'all', types: [s.type], double: s.double === 'yes', name: s.name && s.name !== 'auto' ? s.name : null,
    grade: calc.materials.grade, fRatio: limOf(d, 300).total, fLiveRatio: limOf(d, 300).live,
  };
}

export const steelBeamModule = {
  label: 'Viga de acero',
  defaults() {
    return {
      design: { spans: [5, 6], cantL: 0, cantR: 0, width: 1.9, g: 70, p: 250, line: 0, points: [], pattern: 'all', fRatio: 300 },
      section: { type: 'UPN', double: 'no', name: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade' },
      verification: {},
    };
  },
  input(calc) { return beamInput(calc); },
  run(calc) {
    const input = beamInput(calc);
    if (!input.spans.length || input.spans.some((v) => !(v > 0)) || !(input.width > 0)) return { error: 'Cargá las luces y el ancho de influencia con valores mayores que cero.' };
    try { return { res: { ...D.designBeam(input), steel: true }, input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },
  wire(root, calc) {
    root.querySelector('[data-add-point]')?.addEventListener('click', () => {
      const f = root.querySelector('#pointForm');
      const d = calc.design;
      const span = Number(f.ptSpan.value);
      const x = Number(f.ptX.value);
      const P = Number(f.ptP.value);
      if (!(P > 0) || !(x >= 0)) { showToast('Revisá la posición y la carga.'); return; }
      setCalcField(calc.id, 'design.points', [...(d.points || []), { span, x, P, kind: f.ptKind.value }]);
    });
    root.querySelectorAll('[data-del-point]').forEach((b) => b.addEventListener('click', () => {
      setCalcField(calc.id, 'design.points', (calc.design.points || []).filter((_, i) => i !== Number(b.dataset.delPoint)));
    }));
  },
  step1(calc) {
    const d = calc.design;
    const ns = d.spans.length;
    const spanOpts = [...(Number(d.cantL) > 0 ? [[-1, 'Voladizo izquierdo']] : []), ...d.spans.map((_, i) => [i, `Tramo ${i + 1}`]), ...(Number(d.cantR) > 0 ? [[ns, 'Voladizo derecho']] : [])];
    const pts = (d.points || []).map((q, i) => `<div class="task-item" style="gap:10px; flex-wrap:wrap;"><span class="task-title">${q.span === -1 ? 'Voladizo izq.' : q.span >= ns ? 'Voladizo der.' : `Tramo ${q.span + 1}`}, a ${fmt(q.x, 2)} m</span><span class="text-muted" style="font-size:12.5px;">${fmt(q.P, 0)} kg (${q.kind === 'L' ? 'sobrecarga' : 'permanente'})</span><button class="btn btn-sm btn-danger" data-del-point="${i}" style="margin-left:auto;">Quitar</button></div>`).join('');
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Esquema estructural</h3>
          ${axisEditor({ path: 'design.spans', spans: d.spans, title: 'Luces de la viga entre apoyos', kind: 'num', hint: ns === 1 ? 'Un tramo: viga simplemente apoyada. Agregá tramos para una viga continua.' : `${ns} tramos: viga continua sobre ${ns + 1} apoyos.`, cant: { left: { path: 'design.cantL', value: d.cantL, label: 'Voladizo izq.' }, right: { path: 'design.cantR', value: d.cantR, label: 'Voladizo der.' } } })}
          <p class="text-muted" style="font-size:12px; margin:0;">Análisis elástico exacto de la viga continua (la cátedra usa métodos aproximados: los resultados difieren pocos por ciento).</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Cargas</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.width', 'Ancho de influencia', d.width, { unit: 'm', hint: 'Franja de piso o cubierta que carga sobre la viga.' })}
            ${numField('design.g', 'Carga permanente g', d.g, { unit: 'kg/m²', hint: 'Piso, correas, cielorraso, instalaciones (sin el peso de la viga).' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.p', 'Sobrecarga p', d.p, { unit: 'kg/m²', hint: 'CIRSOC 101. Ej.: oficinas 250 kg/m² (TP 4).' })}
            ${numField('design.line', 'Carga lineal permanente extra', d.line, { unit: 'kg/m', hint: 'Muros, barandas.' })}
          </div>
          ${selField('design.pattern', 'Sobrecarga en los tramos', d.pattern === 'alt' ? 'alt' : 'all', [['all', 'En todos los tramos (como en la cátedra)'], ['alt', 'Alternada: envolvente de momentos y cortes']])}
          <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Carga total por metro = (g + p) × ancho + extra + peso propio del perfil.</p>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3 style="margin-top:0;">Cargas puntuales <span class="text-muted" style="font-weight:400; font-size:12.5px;">(opcional)</span></h3>
        ${pts || '<p class="text-muted" style="font-size:12.5px;">Sin cargas puntuales.</p>'}
        <form id="pointForm" onsubmit="return false;" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:10px;">
          <div class="field" style="margin:0;"><label>Ubicación</label><select name="ptSpan">${spanOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
          <div class="field" style="margin:0;"><label>Distancia desde el inicio (m)</label><input name="ptX" type="number" min="0" step="any" value="0" style="width:110px;" /></div>
          <div class="field" style="margin:0;"><label>Carga (kg)</label><input name="ptP" type="number" min="0" step="any" value="300" style="width:100px;" /></div>
          <div class="field" style="margin:0;"><label>Tipo</label><select name="ptKind"><option value="D">Permanente</option><option value="L">Sobrecarga</option></select></div>
          <button type="button" class="btn btn-sm btn-primary" data-add-point>Agregar</button>
        </form>
      </div>`;
  },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    const type = calc.section.type;
    const cands = res && res.candidates ? res.candidates.filter((p) => p.Wx * res.mult >= res.Wnec - 1e-9).slice(0, 8) : [];
    return `
      <div class="grid grid-2" style="align-items:start;">
        ${materialsCard(calc)}
        <div class="card">
          <h3 style="margin-top:0;">Perfil</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('section.type', 'Tipo de perfil', type, BEAM_TYPES)}
            ${selField('section.double', 'Cantidad', calc.section.double === 'yes' ? 'yes' : 'no', [['no', 'Un perfil'], ['yes', 'Dos perfiles iguales (2 ×)']])}
          </div>
          ${res ? `<table class="data-table"><tbody>
            <tr><td>Momento máximo estimado (con peso propio supuesto 20 kg/m)</td><td style="text-align:right;">${kgm(Math.abs(res.Wnec) * res.grade.sadm / 100)}</td></tr>
            <tr><td><b>Módulo resistente necesario</b> Wx = M / σadm${res.mult === 2 ? ' (para los dos perfiles)' : ''}</td><td style="text-align:right;"><b>${fmt(res.Wnec, 1)} cm³</b></td></tr>
            ${res.mult === 2 ? `<tr><td>Por cada perfil</td><td style="text-align:right;">${fmt(res.WnecEach, 1)} cm³</td></tr>` : ''}
          </tbody></table>
          <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Primeros perfiles de la tabla con Wx suficiente: ${cands.map((p) => `<b>${escapeHtml(p.n)}</b> (${fmt(p.Wx, 0)} cm³)`).join(', ') || '—'}. En el paso 3 se elige el más liviano que verifica tensiones, corte y flecha.</p>` : '<p class="text-muted">Completá el paso 1.</p>'}
        </div>
      </div>`;
  },
  step3(calc, out) {
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('section.type', 'Tipo de perfil', calc.section.type, BEAM_TYPES)}
        ${selField('section.double', 'Cantidad', calc.section.double === 'yes' ? 'yes' : 'no', [['no', 'Un perfil'], ['yes', 'Dos perfiles (2 ×)']])}
      </div>
      ${profileSelect(calc, out.res, [calc.section.type])}
      ${deflSelect('design.deflLimit', calc.design.deflLimit || 'course')}
      ${selField('materials.grade', 'Calidad del acero', calc.materials.grade, GRADE_OPTS)}
    </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${beamResults(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return beamMemoria(calc, out); },
};

function beamFigureData(res, input, names, title) {
  const d = res.total;
  const qs = [];
  if (input.cantL > 0) qs.push(res.qD + res.qL0);
  input.spans.forEach(() => qs.push(res.qD + res.qL0));
  if (input.cantR > 0) qs.push(res.qD + res.qL0);
  const pts = (input.points || []).map((q) => {
    let base = input.cantL;
    if (q.span === -1) base = 0; else if (q.span >= input.spans.length) base = input.cantL + input.spans.reduce((a, b) => a + b, 0); else for (let i = 0; i < q.span; i++) base += input.spans[i];
    return { x: base + q.x, P: q.P };
  });
  return { spans: input.spans, cantL: input.cantL, cantR: input.cantR, qs, points: pts, xs: d.xs, V: d.V, M: d.M, y: res.y, supportsX: d.supportsX, reactions: d.reactions, total: d.total,
    f: res.worst.f, fAllow: res.worst.fAllow, fRatio: res.fRatio, names, title };
}

function beamResults(calc, out) {
  const { res, input } = out;
  if (!res.profile) return failCard(res.reason);
  const c = res.chk;
  const names = res.total.supportsX.map((_, i) => `Apoyo ${i + 1}`);
  const fig = steelBeamFigure(beamFigureData(res, input, names, `${res.profile.n}${res.mult === 2 ? ' (2 ×)' : ''}: esquema de cálculo (cargas de servicio)`), 'screen');
  const checks = checkRows([
    [c.sigmaOk, 'Tensión normal', `σ = M / W = ${fmt(c.sigma, 0)} kg/cm² ≤ ${fmt(c.sigmaAllow, 0)} kg/cm²`],
    [c.tauOk, 'Tensión de corte', `τ = ${fmt(c.tau, 0)} kg/cm² ≤ ${fmt(c.tauAllow, 0)} kg/cm²`],
    [c.fOk, 'Flecha', `f = ${fmt(c.f, 2)} cm ≤ L/${res.fRatio} = ${fmt(c.fAllow, 2)} cm (${res.worst.where})`],
    ...(c.fLive !== undefined ? [[c.fLiveOk, 'Flecha por sobrecarga', `f = ${fmt(c.fLive, 2)} cm ≤ ${fmt(c.fLiveAllow, 2)} cm (L/${input.fLiveRatio})`]] : []),
  ]);
  const p = res.profile;
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Perfil adoptado ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td><b>${escapeHtml(p.n)}</b>${res.mult === 2 ? ' × 2' : ''}</td><td style="text-align:right;">${fmt(p.G * res.mult, 1)} kg/m</td></tr>
        <tr><td>Wx · Jx${res.mult === 2 ? ' (de los dos perfiles)' : ''}</td><td style="text-align:right;">${fmt(p.Wx * res.mult, 1)} cm³ · ${fmt(p.Ix * res.mult, 0)} cm⁴</td></tr>
        <tr><td>Carga total (g + p) × ancho + extra + peso propio</td><td style="text-align:right;">${fmt(res.qD + res.qL0, 0)} kg/m</td></tr>
        <tr><td>Momento máximo · corte máximo</td><td style="text-align:right;">${kgm(res.Mabs)} · ${fmt(res.Vmax, 0)} kg</td></tr>
        <tr><td>Reacciones de los apoyos${calc.design.pattern === 'alt' ? ' (máximas, con sobrecarga alternada)' : ''}</td><td style="text-align:right;">${res.Rmax.map((r) => fmt(r, 0)).join(' · ')} kg</td></tr>
      </tbody></table>
    </div>
    <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${fig}
      ${res.env ? `<p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">Los diagramas corresponden a la sobrecarga en todos los tramos; con la sobrecarga alternada se adopta Mmáx = ${fmt(res.Mabs, 0)} kg·m y Vmáx = ${fmt(res.Vmax, 0)} kg (envolvente).</p>` : ''}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">${ART.method}. Mmáx define Wx necesario, Vmáx la tensión de corte (${ART.shear}) y la flecha se compara con L/${res.fRatio}. El pandeo lateral de la viga se supone impedido por el piso o las correas.</p></div>
    ${checksCard({ ok: res.ok, checks })}
    ${jointsPanel(calc, jointsBeam(res, calc))}`;
}

function beamMemoria(calc, out) {
  const { res, input } = out;
  if (!res.profile) return null;
  const c = res.chk;
  const names = res.total.supportsX.map((_, i) => `Apoyo ${i + 1}`);
  const fig = steelBeamFigure(beamFigureData(res, input, names, `${res.profile.n}${res.mult === 2 ? ' (2 ×)' : ''}: esquema de cálculo`), 'print');
  return {
    title: calc.name,
    sub: `Viga de acero · ${input.spans.map((l) => fmt(l, 2)).join(' + ')} m${input.cantL ? ` · voladizo izq. ${fmt(input.cantL, 2)} m` : ''}${input.cantR ? ` · voladizo der. ${fmt(input.cantR, 2)} m` : ''}`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', `${res.grade.label}; σadm = ${fmt(res.grade.sadm, 0)} kg/cm²`, ART.method)}${memoRow('Ancho de influencia', `${fmt(input.width, 2)} m`)}
        ${memoRow('Cargas g · p', `${fmt(input.g, 0)} · ${fmt(input.p, 0)} kg/m²`, 'CIRSOC 101')}${memoRow('Carga lineal extra', `${fmt(input.line, 0)} kg/m`)}
        ${memoRow('Carga total por metro', `${fmt(res.qD + res.qL0, 0)} kg/m (con peso propio ${fmt(res.Gp, 1)} kg/m)`)}
        ${memoRow('Sobrecarga', input.pattern === 'alt' ? 'alternada (envolvente)' : 'en todos los tramos')}</table>
      <h2>2. Esquema y solicitaciones</h2>
      ${fig}
      <table>${memoRow('Momento máximo', kgm(res.Mabs))}${memoRow('Corte máximo', `${fmt(res.Vmax, 0)} kg`)}${memoRow('Reacciones', `${res.Rmax.map((r) => fmt(r, 0)).join(' · ')} kg`)}</table>
      <h2>3. Perfil y verificaciones</h2>
      <table>${memoRow('Perfil adoptado', `${escapeHtml(res.profile.n)}${res.mult === 2 ? ' × 2' : ''}: Wx = ${fmt(res.profile.Wx * res.mult, 1)} cm³, Jx = ${fmt(res.profile.Ix * res.mult, 0)} cm⁴`, 'Tablas de perfiles del apunte')}
        ${memoRow('σ = M / W', `${fmt(c.sigma, 0)} ≤ ${fmt(c.sigmaAllow, 0)} kg/cm²`, ART.method)}${memoRow('τ', `${fmt(c.tau, 0)} ≤ ${fmt(c.tauAllow, 0)} kg/cm²`, ART.shear)}
        ${memoRow(`Flecha (${res.worst.where})`, `${fmt(c.f, 2)} ≤ ${fmt(c.fAllow, 2)} cm (L/${res.fRatio})`, ART.defl)}
        ${c.fLive !== undefined ? memoRow('Flecha por sobrecarga', `${fmt(c.fLive, 2)} ≤ ${fmt(c.fLiveAllow, 2)} cm (L/${input.fLiveRatio})`, 'CIRSOC 301/2017, Tabla L.3-1') : ''}
        ${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>4. Uniones</h2>
      ${jointsMemo(jointsBeam(res, calc))}`,
  };
}

// ================================================================= CORREA (flexión oblicua)
function purlinInput(calc) {
  const d = calc.design;
  const s = calc.section;
  const auto = d.pAuto !== 'no';
  return {
    L: Number(d.L), alpha: Number(d.alpha), s: Number(d.s), gSurf: Number(d.gSurf) || 0,
    pHor: auto ? D.roofLiveLoad(Number(d.alpha), d.roofKind !== 'other') : Number(d.pHor) || 0, svSurf: Number(d.sv) || 0,
    types: [s.type], name: s.name && s.name !== 'auto' ? s.name : null, grade: calc.materials.grade, fRatio: limOf(d, 200).total, pointLoad: Number(d.point) || 0, K: Number(d.K) || 4,
  };
}

export const steelPurlinModule = {
  label: 'Correa de acero (flexión oblicua)',
  defaults() {
    return {
      design: { L: 5, alpha: 18.8, s: 1.06, gSurf: 6, pAuto: 'yes', roofKind: 'light', pHor: 23, sv: 37, point: 100, fRatio: 200, K: 4 },
      section: { type: 'C', name: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade' },
      verification: {},
    };
  },
  input(calc) { return purlinInput(calc); },
  run(calc) {
    const input = purlinInput(calc);
    if (![input.L, input.alpha, input.s].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá la luz, la inclinación y el ancho de influencia con valores mayores que cero.' };
    try { return { res: { ...D.designPurlin(input), steel: true }, input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },
  step1(calc) {
    const d = calc.design;
    const auto = d.pAuto !== 'no';
    const pAuto = D.roofLiveLoad(Number(d.alpha), d.roofKind !== 'other');
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Geometría</h3>
          ${previewSketch('purlin', d)}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.L', 'Luz de la correa (entre cabriadas o apoyos)', d.L, { unit: 'm' })}
            ${numField('design.alpha', 'Inclinación de la cubierta α', d.alpha, { unit: '°', hint: 'tg α = flecha / semiluz de la cabriada.' })}
          </div>
          ${numField('design.s', 'Ancho de influencia en proyección horizontal', d.s, { unit: 'm', hint: 'Separación entre correas medida en planta.' })}
          <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Correa simplemente apoyada con carga uniforme. Sin tensores de correa (tirantillas): toda la flexión según el eje débil la toma el perfil.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Cargas</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.gSurf', 'Cubierta y accesorios (sin la correa)', d.gSurf, { unit: 'kg/m²', hint: 'Sobre la superficie inclinada; se pasa a proyección horizontal con 1/cos α.' })}
            ${numField('design.sv', 'Succión del viento', d.sv, { unit: 'kg/m²', hint: 'Dato (CIRSOC 102), perpendicular a la cubierta. Ej.: 37 kg/m² del apunte.' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.pAuto', 'Sobrecarga', auto ? 'yes' : 'no', [['yes', 'Según CIRSOC 101-1982 (por inclinación)'], ['no', 'La ingreso yo']])}
            ${auto ? selField('design.roofKind', 'Tipo de cubierta', d.roofKind === 'other' ? 'other' : 'light', [['light', 'Liviana (CIRSOC 303, hasta 50 kg/m² de peso)'], ['other', 'Otro tipo de cubierta']], `p = ${fmt(pAuto, 0)} kg/m² en proyección horizontal (${ART.roof}).`)
              : numField('design.pHor', 'Sobrecarga p', d.pHor, { unit: 'kg/m²', hint: 'En proyección horizontal.' })}
          </div>
          ${numField('design.point', 'Carga concentrada en el centro', d.point, { unit: 'kg', hint: 'Apunte: 100 kg. 0 = no verificar.' })}
        </div>
      </div>`;
  },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    return `
      <div class="grid grid-2" style="align-items:start;">
        ${materialsCard(calc)}
        <div class="card">
          <h3 style="margin-top:0;">Perfil</h3>
          ${selField('section.type', 'Tipo de perfil', calc.section.type, [['C', 'Costanera C de chapa plegada (PGC)'], ...BEAM_TYPES])}
          ${numField('design.K', 'Relación Wx / Wy supuesta (K)', calc.design.K, { hint: 'Apunte: K = 3, 4 o 5.' })}
          ${res ? `<p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">Wx necesario ≈ (Mx + K·My) / σ = <b>${fmt(res.Wnec, 1)} cm³</b>. En el paso 3 se elige el perfil más liviano que verifica σ, τ, flecha y la carga concentrada.</p>` : ''}
        </div>
      </div>`;
  },
  step3(calc, out) {
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${selField('section.type', 'Tipo de perfil', calc.section.type, [['C', 'Costanera C de chapa plegada (PGC)'], ...BEAM_TYPES])}
      ${profileSelect(calc, out.res, [calc.section.type])}
      ${deflSelect('design.deflLimit', calc.design.deflLimit || 'courseRoof', 'Para la correa se usa la flecha total (con sobrecarga y peso propio); CIRSOC 301/2017, Tabla L.3-1.')}
    </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${purlinResults(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return purlinMemoria(calc, out); },
};

function purlinFigure(res, pal) {
  const st = res.states[0];
  const a = S.analyzeBeam({ spans: [res.L], q: [st.qn] });
  const y = a.deflect(S.E_STEEL * res.profile.Ix / 1e4);
  return steelBeamFigure({ spans: [res.L], cantL: 0, cantR: 0, qs: [st.qn], points: [], xs: a.xs, V: a.V, M: a.M, y, supportsX: a.supportsX, reactions: a.reactions, total: a.total,
    f: st.chk.fy, fAllow: st.chk.fAllow, fRatio: Math.round(res.L * 100 / st.chk.fAllow), names: ['Apoyo', 'Apoyo'],
    title: `Estado 1 (g + p), componente perpendicular a la cubierta: qy = (g + p) cos α = ${fmt(st.qn, 1)} kg/m (Mx); según la pendiente qx = ${fmt(st.qt, 1)} kg/m (My = ${fmt(st.Mt, 0)} kg·m)` }, pal);
}

function purlinResults(calc, out) {
  const { res } = out;
  if (!res.profile) return failCard(res.reason);
  const p = res.profile;
  const stRows = res.states.map((s) => `<tr><td>${escapeHtml(s.label)}</td><td style="text-align:right;">${fmt(s.M, 0)} / ${fmt(s.Mt, 0)} kg·m</td><td style="text-align:right;">σ ${fmt(s.chk.sigma, 0)} · f ${fmt(s.chk.f, 2)} cm</td><td>${pill(s.chk.ok)}</td></tr>`).join('');
  const s1 = res.states[0].chk;
  const checks = checkRows([
    [res.states.every((s) => s.chk.sigmaOk), 'Tensión normal (flexión oblicua)', `σ = Mx/Wx + My/Wy = ${fmt(Math.max(...res.states.map((s) => s.chk.sigma)), 0)} ≤ ${fmt(s1.sigmaAllow, 0)} kg/cm² (${ART.oblique})`],
    [res.states.every((s) => s.chk.tauOk), 'Corte (alma)', `τ = Q / (h t) = ${fmt(Math.max(...res.states.map((s) => s.chk.tau)), 0)} ≤ ${fmt(s1.tauAllow, 0)} kg/cm²`],
    [res.states.every((s) => s.chk.fOk), 'Flecha', `f = ${fmt(Math.max(...res.states.map((s) => s.chk.f)), 2)} cm ≤ L/${out.input.fRatio} = ${fmt(s1.fAllow, 2)} cm`],
    ...(res.conc ? [[res.conc.ok, `Carga concentrada de ${fmt(out.input.pointLoad, 0)} kg`, `σ = ${fmt(res.conc.sigma, 0)} ≤ ${fmt(res.conc.sigmaAllow, 0)} kg/cm²`]] : []),
  ]);
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Perfil adoptado ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td><b>${escapeHtml(p.n)}</b></td><td style="text-align:right;">${fmt(p.G, 2)} kg/m</td></tr>
        <tr><td>Wx · Wy · Jx · Jy</td><td style="text-align:right;">${fmt(p.Wx, 2)} · ${fmt(p.Wy, 2)} cm³ · ${fmt(p.Ix, 1)} · ${fmt(p.Iy, 1)} cm⁴</td></tr>
        <tr><td>Cargas por metro (proyección horizontal): g · p · succión normal</td><td style="text-align:right;">${fmt(res.gH + p.G, 1)} · ${fmt(res.pH, 1)} · ${fmt(res.sv, 1)} kg/m</td></tr>
      </tbody></table>
      <table class="data-table" style="margin-top:10px;"><thead><tr><th>Estado</th><th style="text-align:right;">Mx / My</th><th style="text-align:right;">Resultado</th><th></th></tr></thead><tbody>${stRows}</tbody></table>
    </div>
    <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${purlinFigure(res, 'screen')}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">La carga vertical se descompone en una componente perpendicular a la cubierta (Mx) y otra según su pendiente (My). Mx y My definen σ = Mx/Wx + My/Wy.</p></div>
    ${checksCard({ ok: res.ok, checks })}
    ${jointsPanel(calc, jointsPurlin(res, calc))}`;
}

function purlinMemoria(calc, out) {
  const { res, input } = out;
  if (!res.profile) return null;
  const s = res.states;
  return {
    title: calc.name,
    sub: `Correa de acero · luz ${fmt(input.L, 2)} m · α = ${fmt(input.alpha, 1)}°`,
    html: `
      <h2>1. Datos y cargas</h2>
      <table>${memoRow('Acero', `${res.grade.label}`)}${memoRow('Luz · ancho de influencia', `${fmt(input.L, 2)} m · ${fmt(input.s, 2)} m`)}${memoRow('Inclinación', `${fmt(input.alpha, 1)}°`)}
        ${memoRow('Sobrecarga', `${fmt(input.pHor, 0)} kg/m² (proyección horizontal)`, ART.roof)}${memoRow('Succión del viento', `${fmt(input.svSurf, 0)} kg/m²`, 'CIRSOC 102')}
        ${memoRow('Cargas por metro', `g = ${fmt(res.gH + res.profile.G, 1)} · p = ${fmt(res.pH, 1)} · succión = ${fmt(res.sv, 1)} kg/m`)}</table>
      <h2>2. Esquema y solicitaciones</h2>
      ${purlinFigure(res, 'print')}
      <table>${s.map((e) => memoRow(e.label, `Mx = ${fmt(e.M, 0)}, My = ${fmt(e.Mt, 0)} kg·m; Q = ${fmt(e.Q, 0)} kg`)).join('')}</table>
      <h2>3. Perfil y verificaciones</h2>
      <table>${memoRow('Perfil', `${escapeHtml(res.profile.n)}: Wx = ${fmt(res.profile.Wx, 2)}, Wy = ${fmt(res.profile.Wy, 2)} cm³`, 'Tabla 9 del apunte (PGC)')}
        ${s.map((e) => memoRow(`σ y flecha, ${e.label.toLowerCase()}`, `σ = ${fmt(e.chk.sigma, 0)} ≤ ${fmt(e.chk.sigmaAllow, 0)} kg/cm²; f = ${fmt(e.chk.f, 2)} ≤ ${fmt(e.chk.fAllow, 2)} cm`, ART.oblique)).join('')}
        ${res.conc ? memoRow(`Carga concentrada de ${fmt(input.pointLoad, 0)} kg`, `σ = ${fmt(res.conc.sigma, 0)} ≤ ${fmt(res.conc.sigmaAllow, 0)} kg/cm²`) : ''}
        ${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>4. Uniones</h2>
      ${jointsMemo(jointsPurlin(res, calc))}`,
  };
}

// ================================================================= COLUMNA (simple o compuesta con presillas)
function columnInput(calc) {
  const d = calc.design;
  const s = calc.section;
  return { kind: d.kind === 'battened' ? 'battened' : 'simple', N: Number(d.N), H: Number(d.H), support: d.support, M: Number(d.M) || 0, sep: Number(d.sep), plateThickness: Number(d.plate) || 0.64,
    type: d.kind === 'battened' ? s.btype : s.type, types: [s.type], name: s.name && s.name !== 'auto' ? s.name : null, grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, nSpaces: Number(d.nSpaces) || 0 };
}

export const steelColumnModule = {
  label: 'Columna de acero',
  defaults() {
    return {
      design: { kind: 'simple', N: 4300, H: 3.5, support: 'emp-art', M: 0, sep: 15, plate: 0.64, nSpaces: 0 },
      section: { type: 'CAÑO', btype: 'UPN', name: 'auto' },
      materials: { grade: 'F-22', omegaTable: 'grade' },
      verification: {},
    };
  },
  input(calc) { return columnInput(calc); },
  run(calc) {
    const input = columnInput(calc);
    if (![input.N, input.H].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá la carga y la altura con valores mayores que cero.' };
    try {
      const res = input.kind === 'battened' ? D.designBattened(input) : D.designColumn(input);
      return { res: { ...res, steel: true }, input };
    } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },
  step1(calc) {
    const d = calc.design;
    const comp = d.kind === 'battened';
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Columna y sustentación</h3>
          ${previewSketch('column', d)}
          ${selField('design.kind', 'Tipo de columna', comp ? 'battened' : 'simple', [['simple', 'Simple (un perfil o caño)'], ['battened', 'Compuesta: dos perfiles unidos con presillas']])}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.N', 'Carga axial N', d.N, { unit: 'kg', hint: 'De servicio (la mayor reacción de las vigas). Se suma el peso propio de la columna.' })}
            ${numField('design.H', 'Altura H', d.H, { unit: 'm' })}
          </div>
          ${selField('design.support', 'Sustentación', d.support, SUP_OPTS, 'Longitud de pandeo del apunte.')}
          ${comp ? '' : numField('design.M', 'Momento flector (opcional)', d.M, { unit: 'kg·m', hint: 'Flexo-compresión: σ = ωN/A + 0,9 M/W y σ = N/A + M/W.' })}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Esquema</h3>
          <p class="text-muted" style="font-size:12.5px; margin:0;">${comp ? 'Dos perfiles iguales (UPN o IPN) separados y unidos con presillas (chapas) cada s cm. El eje material es el de cada perfil; el eje inmaterial pasa entre ellos y se verifica con la esbeltez ideal λi.' : 'Pieza comprimida con pandeo: σ = ω N / A ≤ σadm, con λ = Lp / i del eje más débil. Los perfiles se prueban de menor a mayor peso (método por tanteos del apunte: σ = σadm/2, ω = 1 para estimar el área).'}</p>
        </div>
      </div>`;
  },
  step2(calc) {
    const out = this.run(calc);
    const res = out.res;
    const comp = calc.design.kind === 'battened';
    return `
      <div class="grid grid-2" style="align-items:start;">
        ${materialsCard(calc)}
        <div class="card">
          <h3 style="margin-top:0;">Sección</h3>
          ${comp ? `<div class="field-row" style="flex-wrap:wrap;">${selField('section.btype', 'Perfiles', calc.section.btype, [['UPN', '2 × UPN'], ['IPN', '2 × IPN']])}
            ${numField('design.sep', calc.section.btype === 'UPN' ? 'Separación entre almas (sep)' : 'Distancia entre ejes de los perfiles (e)', calc.design.sep, { unit: 'cm', hint: calc.section.btype === 'UPN' ? 'e = sep + 2 ey (TP 5).' : 'Como en el ejemplo de la cátedra.' })}</div>
            ${numField('design.plate', 'Espesor de las presillas', calc.design.plate, { unit: 'cm', hint: '1/4" = 0,64 cm.' })}`
    : selField('section.type', 'Tipo de perfil', calc.section.type, [['CAÑO', 'Caño circular'], ...BEAM_TYPES, ['C', 'Costanera C (PGC)']])}
          ${res && res.A0 ? `<p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">Por tanteos: con σ = σadm/2 = ${fmt(res.grade.sadm / 2, 0)} kg/cm² y ω = 1, el área necesaria ≈ <b>${fmt(res.A0, 1)} cm²</b>; se corrige con ω según la esbeltez.</p>` : ''}
        </div>
      </div>`;
  },
  step3(calc, out) {
    const comp = calc.design.kind === 'battened';
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${comp ? selField('section.btype', 'Perfiles', calc.section.btype, [['UPN', '2 × UPN'], ['IPN', '2 × IPN']]) : selField('section.type', 'Tipo de perfil', calc.section.type, [['CAÑO', 'Caño circular'], ...BEAM_TYPES, ['C', 'Costanera C (PGC)']])}
      ${profileSelect(calc, out.res, [comp ? calc.section.btype : calc.section.type])}
      ${comp ? numField('design.nSpaces', 'Cantidad de espacios entre presillas (0 = automática)', calc.design.nSpaces, { hint: 'Se necesita λ1 = s / i1 ≤ 50.' }) : ''}
      ${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
    </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${out.input.kind === 'battened' ? battenedResults(calc, out) : columnResults(calc, out)}</div></div>`;
  },
  memoria(calc, out) { return out.input.kind === 'battened' ? battenedMemoria(calc, out) : columnMemoria(calc, out); },
};

function columnFig(res, input, pal) {
  const c = res.chk;
  return steelColumnFigure({ H: input.H, Lp: res.Lp, support: input.support, N: res.N, k: res.k, lambda: c.lambda, omega: c.omega || 0, sigma: c.sigma || 0, sigmaAllow: c.sigmaAllow, section: res.profile.n, batten: null }, pal);
}

function columnResults(calc, out) {
  const { res, input } = out;
  if (!res.profile) return failCard(res.reason);
  const c = res.chk;
  const p = res.profile;
  const checks = checkRows([
    [c.ok, 'Compresión con pandeo', c.omega === null ? c.reason : `σ = ω N / A = ${fmt(c.omega, 2)} × ${fmt(res.N, 0)} / ${fmt(p.A, 2)} = ${fmt(c.sigma, 0)} ≤ ${fmt(c.sigmaAllow, 0)} kg/cm² (λ = ${fmt(c.lambda, 1)})`],
    ...(c.sigma1 !== undefined ? [[c.sigma1 <= c.sigmaAllow, 'Flexo-compresión (1)', `σ = N/A + M/W = ${fmt(c.sigma1, 0)} kg/cm²`], [c.sigma2 <= c.sigmaAllow, 'Flexo-compresión (2)', `σ = ωN/A + 0,9 M/W = ${fmt(c.sigma2, 0)} kg/cm²`]] : []),
  ]);
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Perfil adoptado ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td><b>${escapeHtml(p.n)}</b></td><td style="text-align:right;">${fmt(p.G, 2)} kg/m</td></tr>
        <tr><td>A · imín</td><td style="text-align:right;">${fmt(p.A, 2)} cm² · ${fmt(c.imin, 2)} cm</td></tr>
        <tr><td>Longitud de pandeo Lp (${escapeHtml(res.supportLabel)})</td><td style="text-align:right;">${fmt(res.Lp, 0)} cm</td></tr>
        <tr><td>Carga con el peso propio de la columna</td><td style="text-align:right;">${fmt(res.N, 0)} kg</td></tr>
      </tbody></table>
      ${c.imin < 1.5 ? '<p class="text-muted" style="font-size:12px; margin:8px 0 0;">Radio de giro chico: la experiencia del apunte aconseja, por ejemplo, caños de 3" como mínimo en columnas; revisá si conviene un perfil mayor.</p>' : ''}
    </div>
    <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${columnFig(res, input, 'screen')}</div>
    ${checksCard({ ok: res.ok, checks })}
    ${jointsPanel(calc, jointsColumn(res, calc, false))}`;
}

function columnMemoria(calc, out) {
  const { res, input } = out;
  if (!res.profile) return null;
  const c = res.chk;
  return {
    title: calc.name,
    sub: `Columna de acero · H = ${fmt(input.H, 2)} m · ${escapeHtml(res.profile.n)}`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label)}${memoRow('Carga N (con peso propio)', `${fmt(res.N, 0)} kg`)}${memoRow('Sustentación', `${escapeHtml(res.supportLabel)}; Lp = ${fmt(res.k, 1)} H = ${fmt(res.Lp, 0)} cm`, ART.omega)}
        ${input.M ? memoRow('Momento flector', kgm(input.M)) : ''}</table>
      <h2>2. Esquema</h2>${columnFig(res, input, 'print')}
      <h2>3. Verificación</h2>
      <table>${memoRow('Perfil', `${escapeHtml(res.profile.n)}: A = ${fmt(res.profile.A, 2)} cm², imín = ${fmt(c.imin, 2)} cm`, 'Tablas de perfiles del apunte')}
        ${memoRow('Esbeltez λ = Lp / imín', fmt(c.lambda, 1))}${memoRow('Coeficiente ω', c.omega === null ? '—' : fmt(c.omega, 2), ART.omega)}
        ${memoRow('σ = ω N / A', `${fmt(c.sigma, 0)} ≤ ${fmt(c.sigmaAllow, 0)} kg/cm²`)}${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>4. Uniones</h2>
      ${jointsMemo(jointsColumn(res, calc, false))}`,
  };
}

function battenedFig(res, input, pal) {
  const c = res.chk;
  return steelColumnFigure({ H: input.H, Lp: res.Lp, support: input.support, N: res.N, k: res.k, lambda: c.lamI || 0, omega: c.omI || 0, sigma: Math.max(c.sigX || 0, c.sigI || 0, c.sig1 || 0), sigmaAllow: c.sigAllow || res.grade.sadm, section: `2 × ${res.profile.n}`, batten: { n: res.n, s: res.s, e: res.e } }, pal);
}

function battenedResults(calc, out) {
  const { res, input } = out;
  if (!res.profile) return failCard(res.reason);
  const c = res.chk;
  if (c.reason) return failCard(c.reason);
  const p = res.profile;
  const checks = checkRows([
    [c.sigX <= c.sigAllow, 'Eje material x–x', `λx = ${fmt(c.lamX, 1)}, ωx = ${fmt(c.omX, 2)}: σ = ${fmt(c.sigX, 0)} ≤ ${fmt(c.sigAllow, 0)} kg/cm²`],
    [c.lam1Ok, 'Esbeltez local entre presillas', `λ1 = s / i1 = ${fmt(res.s, 1)} / ${fmt(p.iy, 2)} = ${fmt(c.lam1, 1)} ≤ 50`],
    [c.sigI <= c.sigAllow, 'Eje inmaterial y–y (esbeltez ideal)', `λy = ${fmt(c.lamY, 1)}, λi = ${fmt(c.lamI, 1)}, ωi = ${fmt(c.omI, 2)}: σ = ${fmt(c.sigI, 0)} ≤ ${fmt(c.sigAllow, 0)} kg/cm²`],
    [c.sig1 <= c.sigAllow, 'Pandeo local de cada perfil', `ω1 = ${fmt(c.om1, 2)}: σ = ${fmt(c.sig1, 0)} ≤ ${fmt(c.sigAllow, 0)} kg/cm²`],
  ]);
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Columna compuesta ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td><b>2 × ${escapeHtml(p.n)}</b></td><td style="text-align:right;">${fmt(2 * p.G, 1)} kg/m</td></tr>
        <tr><td>Distancia entre ejes e · presillas (${res.n} espacios)</td><td style="text-align:right;">${fmt(res.e, 1)} cm · s = ${fmt(res.s, 1)} cm</td></tr>
        <tr><td>Jy · iy de la sección compuesta</td><td style="text-align:right;">${fmt(c.Jy, 0)} cm⁴ · ${fmt(c.iy, 2)} cm</td></tr>
        <tr><td>Corte ideal Q = ω N / 80 · fuerza en cada presilla T</td><td style="text-align:right;">${fmt(c.Q, 0)} kg · ${fmt(c.Tp, 0)} kg</td></tr>
        <tr><td><b>Presilla</b> (e = ${fmt(c.plateThickness, 2)} cm)</td><td style="text-align:right;"><b>h = ${fmt(c.hP, 0)} cm</b> · σ = ${fmt(c.sigP, 0)} · τ = ${fmt(c.tauP, 0)} kg/cm²</td></tr>
      </tbody></table>
    </div>
    <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${battenedFig(res, input, 'screen')}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">${ART.battened}. Si no verifica: perfil mayor, mayor separación entre los perfiles o presillas más cercanas.</p></div>
    ${checksCard({ ok: res.ok, checks })}
    ${jointsPanel(calc, jointsColumn(res, calc, true))}`;
}

function battenedMemoria(calc, out) {
  const { res, input } = out;
  if (!res.profile || res.chk.reason) return null;
  const c = res.chk;
  return {
    title: calc.name,
    sub: `Columna compuesta de acero · 2 × ${escapeHtml(res.profile.n)} · H = ${fmt(input.H, 2)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label)}${memoRow('Carga N (con peso propio)', `${fmt(res.N, 0)} kg`)}${memoRow('Sustentación', `${escapeHtml(res.supportLabel)}; Lp = ${fmt(res.Lp, 0)} cm`)}
        ${memoRow('Distancia entre ejes e', `${fmt(res.e, 1)} cm`)}${memoRow('Presillas', `${res.n} espacios de s = ${fmt(res.s, 1)} cm`)}</table>
      <h2>2. Esquema</h2>${battenedFig(res, input, 'print')}
      <h2>3. Verificaciones</h2>
      <table>${memoRow('Eje x–x: λx · ωx · σ', `${fmt(c.lamX, 1)} · ${fmt(c.omX, 2)} · ${fmt(c.sigX, 0)} kg/cm²`, ART.omega)}
        ${memoRow('Eje y–y: Jy · iy · λy', `${fmt(c.Jy, 0)} cm⁴ · ${fmt(c.iy, 2)} cm · ${fmt(c.lamY, 1)}`, 'Steiner')}
        ${memoRow('λ1 = s / i1 (≤ 50)', fmt(c.lam1, 1))}${memoRow('λi · ωi · σ', `${fmt(c.lamI, 1)} · ${fmt(c.omI, 2)} · ${fmt(c.sigI, 0)} kg/cm²`, ART.battened)}
        ${memoRow('Presillas', `Q = ${fmt(c.Q, 0)} kg; T = ${fmt(c.Tp, 0)} kg; M = ${fmt(c.Mp, 0)} kg·cm; h = ${fmt(c.hP, 0)} cm × ${fmt(c.plateThickness, 2)} cm`)}
        ${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>4. Uniones</h2>
      ${jointsMemo(jointsColumn(res, calc, true))}`,
  };
}

// ================================================================= TENSOR
export const steelTieModule = {
  label: 'Tensor de acero',
  defaults() {
    return { design: { T: 6000, L: 2, kind: 'caño' }, section: { name: 'auto' }, materials: { grade: 'F-22', omegaTable: 'grade' }, verification: {} };
  },
  input(calc) { return { T: Number(calc.design.T), L: Number(calc.design.L), kind: calc.design.kind, name: calc.section.name && calc.section.name !== 'auto' ? calc.section.name : null, grade: calc.materials.grade }; },
  run(calc) {
    const input = this.input(calc);
    if (![input.T, input.L].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá la tracción y la longitud con valores mayores que cero.' };
    return { res: { ...D.designTie(input), steel: true }, input };
  },
  step1(calc) {
    const d = calc.design;
    return `<div class="grid grid-2" style="align-items:start;"><div class="card"><h3 style="margin-top:0;">Tensor</h3>${previewSketch('tie', d)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.T', 'Tracción T', d.T, { unit: 'kg' })}${numField('design.L', 'Longitud L', d.L, { unit: 'm' })}</div>
      ${selField('design.kind', 'Material del tensor', d.kind, [['caño', 'Caño circular'], ['barra', 'Barra de acero (redondo)']])}
      <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">${ART.tie}. Si el tensor se ancla a una base de hormigón, el peso del macizo debe ser al menos 1,5 T (apunte).</p></div></div>`;
  },
  step2(calc) {
    const out = this.run(calc);
    return `<div class="grid grid-2" style="align-items:start;">${materialsCard(calc)}<div class="card"><h3 style="margin-top:0;">Área necesaria</h3>
      ${out.res ? `<table class="data-table"><tbody><tr><td>Anec = T / σadm</td><td style="text-align:right;"><b>${fmt(out.res.Anec, 2)} cm²</b></td></tr></tbody></table>` : ''}</div></div>`;
  },
  step3(calc, out) {
    if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
    const res = out.res;
    const c = res.chk;
    const checks = checkRows([[c.ok, 'Tensión de tracción', `σ = T / A = ${fmt(res.T, 0)} / ${fmt(res.profile.A, 2)} = ${fmt(c.sigma, 0)} ≤ ${fmt(c.sigmaAllow, 0)} kg/cm²`]]);
    const opts = [['auto', 'Automático: la menor sección que verifica'], ...res.candidates.map((p) => [p.n, p.n])];
    return `<div class="grid grid-2" style="align-items:start;"><div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>${selField('section.name', 'Sección', calc.section.name || 'auto', opts)}</div>
      <div><div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Tensor adoptado ${pill(res.ok)}</h3><table class="data-table"><tbody>
        <tr><td><b>${escapeHtml(res.profile.n)}</b></td><td style="text-align:right;">A = ${fmt(res.profile.A, 2)} cm²</td></tr>
        <tr><td>Alargamiento ΔL = T L / (E A)</td><td style="text-align:right;">${fmt(c.dL * 10, 1)} mm</td></tr>
        <tr><td>Peso mínimo del macizo de anclaje (1,5 T) · altura de una base de 1 × 1 m (2200 kg/m³)</td><td style="text-align:right;">${fmt(res.Pbase, 0)} kg · ${fmt(res.hBase, 2)} m</td></tr></tbody></table></div>${checksCard({ ok: res.ok, checks })}${jointsPanel(calc, jointsTie(res, calc))}</div></div>`;
  },
  memoria(calc, out) {
    const res = out.res;
    if (!res || !res.profile) return null;
    const c = res.chk;
    return { title: calc.name, sub: `Tensor de acero · T = ${fmt(res.T, 0)} kg · L = ${fmt(res.L, 2)} m`, html: `
      <h2>1. Datos y verificación</h2><table>${memoRow('Acero', res.grade.label)}${memoRow('Tracción T', `${fmt(res.T, 0)} kg`)}${memoRow('Área necesaria', `${fmt(res.Anec, 2)} cm²`, ART.tie)}
      ${memoRow('Sección adoptada', `${escapeHtml(res.profile.n)}: A = ${fmt(res.profile.A, 2)} cm²`)}${memoRow('σ', `${fmt(c.sigma, 0)} ≤ ${fmt(c.sigmaAllow, 0)} kg/cm²`)}
      ${memoRow('Alargamiento', `${fmt(c.dL * 10, 1)} mm`)}${memoRow('Anclaje', `peso del macizo ≥ ${fmt(res.Pbase, 0)} kg (1,5 T)`)}${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>
      <h2>2. Uniones</h2>
      ${jointsMemo(jointsTie(res, calc))}` };
  },
};

// ================================================================= EDIFICIO DE ACERO: entrepiso independiente
const letter = (j) => String.fromCharCode(65 + j);
const colName = (i, j) => `${letter(j)}${i + 1}`;
const floorCache = new Map();
let ftab = 'resumen';
let fline = 0;
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const parseIdx = (text, letters) => String(text).split(/[\s;,]+/).filter(Boolean).map((t) => (letters ? t.toUpperCase().charCodeAt(0) - 65 : Number(t) - 1)).filter((v) => Number.isInteger(v) && v >= 0);

function floorInput(calc) {
  const d = calc.design;
  const s = calc.section;
  return {
    xSpans: d.xSpans.map(Number), ySpans: d.ySpans.map(Number), cantXL: Number(d.cantXL) || 0, cantXR: Number(d.cantXR) || 0, cantYB: Number(d.cantYB) || 0, cantYF: Number(d.cantYF) || 0,
    sCorr: Number(d.sCorr), g: Number(d.g) || 0, p: Number(d.p) || 0, edgeLoad: Number(d.edgeLoad) || 0, H: Number(d.H), support: d.support,
    corrTypes: [s.corrType], beamTypes: [s.beamType], beamDouble: s.beamDouble === 'yes', colTypes: [s.colType],
    grade: calc.materials.grade, omegaTable: calc.materials.omegaTable, pattern: d.pattern === 'alt' ? 'alt' : 'all', unify: d.unify !== 'no', fRatio: limOf(d, 300).total, fLiveRatio: limOf(d, 300).live,
    existingX: d.existingX || [], existingY: d.existingY || [],
    fc: Number(calc.materials.fc) || 20, sigmaSoil: Number(calc.foundation.sigma), Df: Number(calc.foundation.Df), gammaSoil: Number(calc.foundation.gamma),
  };
}

export const steelFloorModule = {
  label: 'Edificio de acero (entrepiso independiente)',
  defaults() {
    return {
      design: { xSpans: [5, 6], ySpans: [3.8], cantXL: 0, cantXR: 0, cantYB: 0, cantYF: 0, sCorr: 0.61, g: 55, p: 250, edgeLoad: 0, H: 3.5, support: 'emp-art', pattern: 'all', unify: 'yes', existingX: [], existingY: [] },
      section: { corrType: 'C', beamType: 'UPN', beamDouble: 'no', colType: 'CAÑO' },
      materials: { grade: 'F-22', omegaTable: 'grade', fc: 20 },
      foundation: { sigma: 2, Df: 1.5, gamma: 17 },
    };
  },
  input(calc) { return floorInput(calc); },
  run(calc) {
    const input = floorInput(calc);
    if (!input.xSpans.length || !input.ySpans.length || [...input.xSpans, ...input.ySpans, input.sCorr, input.H].some((v) => !(v > 0))) return { error: 'Completá las luces, la separación de correas y la altura con valores mayores que cero.' };
    const key = JSON.stringify(input);
    if (!floorCache.has(key)) {
      if (floorCache.size > 6) floorCache.delete(floorCache.keys().next().value);
      try { floorCache.set(key, { ...D.designFloor(input), steel: true }); } catch (e) { floorCache.set(key, { error: true }); }
    }
    const res = floorCache.get(key);
    if (res.error) return { error: 'No se pudo calcular con estos datos.' };
    return { res, input };
  },
  wire(root, calc) {
    const P = calc.floorPrefix || 'design.';
    const SP = calc.floorSecPrefix || 'section.';
    const emb = Boolean(calc.floorPrefix);
    root.querySelector('#exX')?.addEventListener('change', (e) => setCalcField(calc.id, P + 'existingX', parseIdx(e.target.value, false).filter((i) => i <= calc.design.xSpans.length)));
    root.querySelector('#exY')?.addEventListener('change', (e) => setCalcField(calc.id, P + 'existingY', parseIdx(e.target.value, true).filter((j) => j <= calc.design.ySpans.length)));
    root.querySelectorAll('[data-ftab]').forEach((b) => b.addEventListener('click', () => { ftab = b.dataset.ftab; rerender(); }));
    root.querySelector('#fLine')?.addEventListener('change', (e) => { fline = Number(e.target.value); rerender(); });
  },
  step1(calc) {
    const P = calc.floorPrefix || 'design.';
    const SP = calc.floorSecPrefix || 'section.';
    const emb = Boolean(calc.floorPrefix);
    const d = calc.design;
    const nx = d.xSpans.length;
    const ny = d.ySpans.length;
    const exX = (d.existingX || []).map((i) => i + 1).join(', ');
    const exY = (d.existingY || []).map(letter).join(', ');
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Esquema estructural del entrepiso</h3>
          ${axisEditor({ path: P + 'xSpans', spans: d.xSpans, title: 'Vigas principales (eje X): luz entre ejes de columnas', kind: 'num', sketch: false, hint: `Los ejes 1 a ${nx + 1} llevan las columnas; cada casillero es la luz del tramo entre dos ejes.`, cant: { left: { path: P + 'cantXL', value: d.cantXL, label: `Voladizo eje 1` }, right: { path: P + 'cantXR', value: d.cantXR, label: `Voladizo eje ${nx + 1}` } } })}
          ${axisEditor({ path: P + 'ySpans', spans: d.ySpans, title: 'Correas (eje Y): luz entre líneas de vigas', kind: 'letter', sketch: false, hint: `Las líneas de vigas son ${Array.from({ length: ny + 1 }, (_, i) => letter(i)).join(', ')}; las correas apoyan sobre ellas y son continuas.`, cant: { left: { path: P + 'cantYB', value: d.cantYB, label: 'Voladizo línea A' }, right: { path: P + 'cantYF', value: d.cantYF, label: `Voladizo línea ${letter(ny)}` } } })}
          <div class="axed-sketch" style="border:0; padding:0 0 10px;">${gridSketch({ xs: d.xSpans.map(Number), ys: d.ySpans.map(Number), cantXL: Number(d.cantXL) || 0, cantXR: Number(d.cantXR) || 0, cantYB: Number(d.cantYB) || 0, cantYF: Number(d.cantYF) || 0 })}</div>
          ${numField(P + 'sCorr', 'Separación entre correas', d.sCorr, { unit: 'm', hint: 'Entre ejes. TP 4 de la cátedra: 61 cm.' })}
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Cargas y columnas</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField(P + 'g', 'Carga permanente g', d.g, { unit: 'kg/m²', hint: 'Piso, contrapiso, cielorraso, instalaciones (sin las correas ni las vigas, que se suman).' })}
            ${numField(P + 'p', 'Sobrecarga p', d.p, { unit: 'kg/m²', hint: 'CIRSOC 101. TP 4: 250 kg/m².' })}
          </div>
          ${numField(P + 'edgeLoad', 'Carga lineal permanente en las vigas de borde', d.edgeLoad, { unit: 'kg/m', hint: 'Muros o parapetos sobre las líneas A y ' + letter(ny) + '.' })}
          ${deflSelect(P + 'deflLimit', d.deflLimit || 'course')}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField(P + 'H', 'Altura de las columnas', d.H, { unit: 'm' })}
            ${selField(P + 'support', 'Sustentación de las columnas', d.support, SUP_OPTS)}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3 style="margin-top:0;">Apoyos sobre la estructura existente <span class="text-muted" style="font-weight:400; font-size:12.5px;">(opcional)</span></h3>
        <p class="text-muted" style="font-size:12.5px; margin:-6px 0 10px;">El entrepiso es independiente y puede descargar sobre el resto de la estructura. Los apoyos sobre los ejes o líneas que indiques no llevan columna ni base propias: se informa la carga que le transmiten (permanente y sobrecarga) para verificar esa estructura.</p>
        <div class="field-row" style="flex-wrap:wrap;">
          <div class="field"><label>Ejes X que apoyan en la estructura existente <span class="text-muted">(1 a ${nx + 1}, separados por coma)</span></label><input id="exX" value="${exX}" placeholder="Ej.: 1" /></div>
          <div class="field"><label>Líneas Y que apoyan en la estructura existente <span class="text-muted">(A a ${letter(ny)})</span></label><input id="exY" value="${exY}" placeholder="Ej.: A" /></div>
        </div>
      </div>`;
  },
  step2(calc) {
    const P = calc.floorPrefix || 'design.';
    const SP = calc.floorSecPrefix || 'section.';
    const emb = Boolean(calc.floorPrefix);
    const out = this.run(calc);
    const res = out.res;
    const s = calc.section;
    const fam = [['C', 'Costanera C (PGC)'], ...BEAM_TYPES];
    return `
      <div class="grid grid-2" style="align-items:start;">
        ${emb ? '' : materialsCard(calc)}
        <div class="card">
          <h3 style="margin-top:0;">Familias de perfiles</h3>
          ${selField(SP + 'corrType', 'Correas', s.corrType, fam)}
          <div class="field-row" style="flex-wrap:wrap;">${selField(SP + 'beamType', 'Vigas principales', s.beamType, BEAM_TYPES)}${selField(SP + 'beamDouble', 'Cantidad', s.beamDouble === 'yes' ? 'yes' : 'no', [['no', 'Un perfil'], ['yes', 'Dos perfiles (2 ×)']])}</div>
          ${selField(SP + 'colType', 'Columnas', s.colType, [['CAÑO', 'Caño circular'], ...BEAM_TYPES])}
          ${res ? `<table class="data-table" style="margin-top:8px;"><tbody>
            <tr><td>Correa: Wx necesario</td><td style="text-align:right;">${fmt(res.corr.Wnec, 1)} cm³</td></tr>
            ${res.lines.map((l, j) => `<tr><td>Viga línea ${letter(j)}: Wx necesario</td><td style="text-align:right;">${fmt(l.Wnec, 1)} cm³ (carga ${fmt(res.lineD[j] + res.lineL[j], 0)} kg/m)</td></tr>`).join('')}
            ${res.own.length ? `<tr><td>Columna más cargada: área estimada (σ = σadm/2, ω = 1)</td><td style="text-align:right;">${fmt(Math.max(...res.own.map((n) => n.col.A0 || 0)), 1)} cm²</td></tr>` : ''}
          </tbody></table>` : ''}
        </div>
      </div>`;
  },
  step3(calc, out) { return floorStep3(calc, out, floorInputsCard(calc)); },
  memoria(calc, out) { return floorMemoria(calc, out); },
};

function floorStep3(calc, out, inputs) {
  if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
  return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${floorResults(calc, out)}</div></div>`;
}

// Entrepiso dentro de otro cálculo (la nave): el cálculo "virtual" lee el diseño y los perfiles del entrepiso del cálculo que lo contiene y
// escribe en sus mismos campos (floorPrefix / floorSecPrefix); el acero, el hormigón y el suelo son los del cálculo de la nave.
export function floorVirtual(calc) {
  const d = calc.design;
  return { id: calc.id, name: calc.name, element: 'sfloor', design: d.mezz, section: d.mezzSec, materials: calc.materials, foundation: calc.foundation, floorPrefix: 'design.mezz.', floorSecPrefix: 'design.mezzSec.' };
}

function floorInputsCard(calc) {
  const P = calc.floorPrefix || 'design.';
  const emb = Boolean(calc.floorPrefix);
  return `<div class="card"><h3 style="margin-top:0;">${emb ? 'Entrepiso: datos de dimensionado' : 'Datos de dimensionado'}</h3>
      ${selField(P + 'unify', 'Perfiles', calc.design.unify === 'no' ? 'no' : 'yes', [['yes', 'Unificados (el más exigente para todas las vigas y columnas)'], ['no', 'Cada elemento con su perfil mínimo']])}
      ${selField(P + 'pattern', 'Sobrecarga en los tramos', calc.design.pattern === 'alt' ? 'alt' : 'all', [['all', 'En todos los tramos (como en la cátedra)'], ['alt', 'Alternada: envolvente']])}
      ${emb ? '<p class="text-muted" style="font-size:12px; margin:0;">El acero, el coeficiente de pandeo, el hormigón de las bases y el suelo son los de la nave (pasos 2 y 3).</p>' : `${selField('materials.omegaTable', 'Coeficiente de pandeo ω', calc.materials.omegaTable, OMEGA_OPTS)}
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.fc', "Hormigón de las bases (f'c)", calc.materials.fc, [20, 25, 30].map((c) => [c, `H-${c}`]))}
        ${numField('foundation.sigma', 'Tensión admisible del suelo', calc.foundation.sigma, { unit: 'kg/cm²' })}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${numField('foundation.Df', 'Profundidad de fundación', calc.foundation.Df, { unit: 'm' })}
        ${numField('foundation.gamma', 'Peso del suelo', calc.foundation.gamma, { unit: 'kN/m³' })}
      </div>
      <p class="text-muted" style="font-size:12px; margin:0;">Las bases se calculan con CIRSOC 201 (hormigón armado), con las reacciones de servicio de cada columna.</p>`}</div>`;
}

const FLOOR_TABS = [['resumen', 'Resumen'], ['planta', 'Planta'], ['correa', 'Correas'], ['vigas', 'Vigas'], ['cols', 'Columnas y bases'], ['uniones', 'Uniones'], ['exist', 'Estructura existente']];
export const floorTabsFor = (calc) => FLOOR_TABS.filter(([k]) => !(calc.floorPrefix && k === 'uniones'));      // las uniones del entrepiso incrustado no se calculan aparte

function floorPlanData(res, input, pal) {
  const cum = (arr) => arr.reduce((a, v) => [...a, a[a.length - 1] + v], [0]);
  return floorPlanFigure({
    xs: cum(input.xSpans), ys: cum(input.ySpans), cantXL: input.cantXL, cantXR: input.cantXR, cantYB: input.cantYB, cantYF: input.cantYF, sCorr: input.sCorr,
    nodes: res.nodes.filter((n) => n.existing || n.N > 0).map((n) => ({ i: n.i, j: n.j, existing: n.existing, label: colName(n.i, n.j) })),
    beamLabels: res.lines.map((l) => `${l.profile.n}${l.mult === 2 ? ' ×2' : ''}`), corrLabel: `Correas ${res.corr.profile.n}`,
    title: 'Planta del entrepiso (vigas paralelas a X, correas paralelas a Y)',
  }, pal);
}

function lineFig(res, input, kind, j, pal) {
  const isCorr = kind === 'corr';
  const r = isCorr ? res.corr : res.lines[j];
  const inp = isCorr ? { spans: input.ySpans, cantL: input.cantYB, cantR: input.cantYF, points: [] } : { spans: input.xSpans, cantL: input.cantXL, cantR: input.cantXR, points: [] };
  const names = isCorr ? r.total.supportsX.map((_, i) => `Línea ${letter(i)}`) : r.total.supportsX.map((_, i) => colName(i, j));
  const title = isCorr ? `Correa ${r.profile.n}: esquema de cálculo (por correa, cargas de servicio)` : `Viga línea ${letter(j)} ${r.profile.n}${r.mult === 2 ? ' (2 ×)' : ''}: esquema de cálculo`;
  return steelBeamFigure(beamFigureData(r, inp, names, title), pal);
}

function beamRow(label, r) {
  const c = r.chk;
  return `<tr><td>${label}</td><td><b>${escapeHtml(r.profile.n)}${r.mult === 2 ? ' × 2' : ''}</b></td><td style="text-align:right;">${fmt(r.Mabs, 0)}</td><td style="text-align:right;">${fmt(c.sigma, 0)} / ${fmt(c.sigmaAllow, 0)}</td><td style="text-align:right;">${fmt(c.tau, 0)} / ${fmt(c.tauAllow, 0)}</td><td style="text-align:right;">${fmt(c.f, 2)} / ${fmt(c.fAllow, 2)}</td><td>${pill(r.ok)}</td></tr>`;
}
const BEAM_HEAD = '<thead><tr><th></th><th>Perfil</th><th style="text-align:right;">M máx. (kg·m)</th><th style="text-align:right;">σ / adm. (kg/cm²)</th><th style="text-align:right;">τ / adm.</th><th style="text-align:right;">f / adm. (cm)</th><th></th></tr></thead>';

function footingText(f) {
  if (!f) return '—';
  if (!f.ok) return f.reason || 'No verifica';
  return `${fmt(f.B / 10, 0)} × ${fmt(f.L / 10, 0)} × ${fmt(f.h / 10, 0)} cm`;
}
function footingBars(f) {
  return f && f.ok ? `${f.layL.n} ø${f.db} y ${f.layB.n + f.outsideBars} ø${f.db}` : '—';
}

export function floorResults(calc, out) {
  const { res, input } = out;
  if (ftab === 'uniones' && calc.floorPrefix) ftab = 'resumen';
  const tabs = `<div class="tabs" style="margin-bottom:12px; flex-wrap:wrap;">${floorTabsFor(calc).map(([k, l]) => `<button class="tab ${ftab === k ? 'active' : ''}" data-ftab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  const q = res.quantities;
  if (ftab === 'resumen') {
    const foot = res.own.filter((n) => n.footing && n.footing.ok);
    const conc = foot.reduce((a, n) => a + n.footing.concrete, 0);
    const steelF = foot.reduce((a, n) => a + n.footing.steelKg, 0);
    body = `<div class="card"><h3 style="margin-top:0;">Entrepiso de ${fmt(res.Xtot, 2)} × ${fmt(res.Ytot, 2)} m ${pill(res.ok)}</h3>
      <table class="data-table"><tbody>
        <tr><td>Correas (${res.nCorr} unidades cada ${fmt(input.sCorr * 100, 0)} cm)</td><td style="text-align:right;"><b>${escapeHtml(res.corr.profile.n)}</b> · ${fmt(res.Gc, 1)} kg/m</td></tr>
        <tr><td>Vigas principales (${res.lines.length} líneas)</td><td style="text-align:right;"><b>${[...new Set(res.lines.map((l) => `${l.profile.n}${l.mult === 2 ? ' × 2' : ''}`))].map(escapeHtml).join(' · ')}</b></td></tr>
        <tr><td>Columnas propias (${res.own.length})</td><td style="text-align:right;"><b>${res.own.length ? [...new Set(res.own.map((n) => n.col.profile.n))].map(escapeHtml).join(' · ') : '—'}</b></td></tr>
        <tr><td>Apoyos sobre la estructura existente</td><td style="text-align:right;">${res.existingLoads.length}</td></tr>
        <tr><td>Acero estructural: correas · vigas · columnas</td><td style="text-align:right;">${fmt(q.kgCorr, 0)} · ${fmt(q.kgBeams, 0)} · ${fmt(q.kgCols, 0)} kg</td></tr>
        <tr><td><b>Total de acero</b></td><td style="text-align:right;"><b>${fmt(q.kgTot, 0)} kg (${fmt(q.kgPerM2, 1)} kg/m²)</b></td></tr>
        ${foot.length ? `<tr><td>Bases de hormigón armado (${foot.length})</td><td style="text-align:right;">${fmt(conc, 2)} m³ · ${fmt(steelF, 0)} kg de hierro</td></tr>` : ''}
      </tbody></table>
      ${res.warnings.map((w) => `<p class="text-muted" style="font-size:12.5px; margin:8px 0 0;">${escapeHtml(w)}</p>`).join('')}
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Cargas de servicio y método elástico (σ ≤ σadm). Las correas son continuas sobre las vigas; las vigas descargan en las columnas; las bases salen de las reacciones. Con perfiles unificados se adopta el más exigente de cada familia.</p></div>`;
  } else if (ftab === 'planta') {
    body = `<div class="card"><h3 style="margin-top:0;">Planta</h3>${floorPlanData(res, input, 'screen')}</div>`;
  } else if (ftab === 'correa') {
    body = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Correa ${pill(res.corr.ok)}</h3><div class="table-wrap"><table class="data-table">${BEAM_HEAD}<tbody>${beamRow('Correa', res.corr)}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Se calcula una correa con ancho de influencia ${fmt(input.sCorr * 100, 0)} cm: carga por metro = (g + p) × ${fmt(input.sCorr, 2)} + peso propio.</p></div>
      <div class="card"><h3 style="margin-top:0;">Esquema de cálculo</h3>${lineFig(res, input, 'corr', 0, 'screen')}</div>`;
  } else if (ftab === 'vigas') {
    if (fline >= res.lines.length) fline = 0;
    body = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Vigas principales</h3><div class="table-wrap"><table class="data-table">${BEAM_HEAD}<tbody>${res.lines.map((l, j) => beamRow(`Línea ${letter(j)}`, l)).join('')}</tbody></table></div>
      <table class="data-table" style="margin-top:10px;"><thead><tr><th></th><th style="text-align:right;">Carga D (kg/m)</th><th style="text-align:right;">Carga L (kg/m)</th><th style="text-align:right;">Reacciones (kg)</th></tr></thead><tbody>${res.lines.map((l, j) => `<tr><td>Línea ${letter(j)}</td><td style="text-align:right;">${fmt(res.lineD[j], 0)}</td><td style="text-align:right;">${fmt(res.lineL[j], 0)}</td><td style="text-align:right;">${l.Rmax.map((r) => fmt(r, 0)).join(' · ')}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;"><h3 style="margin:0;">Esquema de cálculo</h3>
        <select id="fLine">${res.lines.map((_, j) => `<option value="${j}" ${j === fline ? 'selected' : ''}>Línea ${letter(j)}</option>`).join('')}</select></div>${lineFig(res, input, 'beam', fline, 'screen')}</div>`;
  } else if (ftab === 'cols') {
    const big = res.own.length ? res.own.reduce((a, b) => (b.N > a.N ? b : a)) : null;
    body = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Columnas y bases</h3>${res.own.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Eje</th><th style="text-align:right;">N servicio (kg)</th><th>Columna</th><th style="text-align:right;">σ / adm.</th><th>Base</th><th>Armadura</th></tr></thead><tbody>
      ${res.own.map((n) => `<tr><td>${colName(n.i, n.j)}</td><td style="text-align:right;">${fmt(n.N, 0)}</td><td><b>${escapeHtml(n.col.profile.n)}</b> ${pill(n.col.ok)}</td><td style="text-align:right;">${n.col.chk.sigma ? `${fmt(n.col.chk.sigma, 0)} / ${fmt(n.col.chk.sigmaAllow, 0)}` : '—'}</td><td>${footingText(n.footing)}</td><td>${footingBars(n.footing)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="text-muted">No hay columnas propias: todos los apoyos descargan sobre la estructura existente.</p>'}</div>
      ${big ? `<div class="card"><h3 style="margin-top:0;">Columna más cargada (${colName(big.i, big.j)})</h3>${columnFig(big.col, { H: input.H, support: input.support }, 'screen')}</div>` : ''}`;
  } else if (ftab === 'uniones') {
    body = jointsPanel(calc, jointsFloor(res, calc));
  } else {
    body = `<div class="card"><h3 style="margin-top:0;">Descarga sobre la estructura existente</h3>${res.existingLoads.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Apoyo</th><th style="text-align:right;">Permanente (kg)</th><th style="text-align:right;">Sobrecarga (kg)</th><th style="text-align:right;">Total (kg)</th></tr></thead><tbody>
      ${res.existingLoads.filter((n) => n.N > 0).map((n) => `<tr><td>${colName(n.i, n.j)}</td><td style="text-align:right;">${fmt(n.RD, 0)}</td><td style="text-align:right;">${fmt(n.RL, 0)}</td><td style="text-align:right;"><b>${fmt(n.N, 0)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Reacciones de servicio (incluyen el peso propio de correas y vigas). Son las cargas que deberá resistir la estructura existente en esos puntos: verificá sus elementos con estos valores.</p>`
      : '<p class="text-muted">Ningún apoyo descarga sobre la estructura existente. Indicá los ejes o líneas en el paso 1 si el entrepiso se apoya en algo ya construido.</p>'}</div>`;
  }
  return tabs + body;
}

export function floorMemoria(calc, out) {
  const { res, input } = out;
  if (!res || !res.corr || !res.corr.profile) return null;
  const q = res.quantities;
  const beamTable = (rows) => `<table>${rows.map(([lab, r]) => memoRow(lab, `${escapeHtml(r.profile.n)}${r.mult === 2 ? ' × 2' : ''}: M = ${fmt(r.Mabs, 0)} kg·m; σ = ${fmt(r.chk.sigma, 0)} ≤ ${fmt(r.chk.sigmaAllow, 0)}; τ = ${fmt(r.chk.tau, 0)} ≤ ${fmt(r.chk.tauAllow, 0)} kg/cm²; f = ${fmt(r.chk.f, 2)} ≤ ${fmt(r.chk.fAllow, 2)} cm — ${r.ok ? 'verifica' : 'no verifica'}`)).join('')}</table>`;
  const big = res.own.length ? res.own.reduce((a, b) => (b.N > a.N ? b : a)) : null;
  const worstLine = res.lines.reduce((a, b) => (b.chk.util > a.chk.util ? b : a));
  const wj = res.lines.indexOf(worstLine);
  return {
    title: calc.name,
    sub: `Edificio de acero · entrepiso ${fmt(res.Xtot, 2)} × ${fmt(res.Ytot, 2)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Acero', res.grade.label, ART.method)}${memoRow('Vigas principales (eje X)', `tramos ${input.xSpans.map((l) => fmt(l, 2)).join(' + ')} m${input.cantXL ? `; voladizo izq. ${fmt(input.cantXL, 2)} m` : ''}${input.cantXR ? `; voladizo der. ${fmt(input.cantXR, 2)} m` : ''}`)}
        ${memoRow('Correas (eje Y)', `tramos ${input.ySpans.map((l) => fmt(l, 2)).join(' + ')} m${input.cantYB ? `; voladizo ${fmt(input.cantYB, 2)} m` : ''}${input.cantYF ? `; voladizo ${fmt(input.cantYF, 2)} m` : ''}, cada ${fmt(input.sCorr * 100, 0)} cm`)}
        ${memoRow('Cargas g · p', `${fmt(input.g, 0)} · ${fmt(input.p, 0)} kg/m²`, 'CIRSOC 101')}${input.edgeLoad ? memoRow('Carga lineal en vigas de borde', `${fmt(input.edgeLoad, 0)} kg/m`) : ''}
        ${memoRow('Columnas', `H = ${fmt(input.H, 2)} m; ${S.SUPPORTS_BUCKLING[input.support].label}`, ART.omega)}${memoRow('Sobrecarga', input.pattern === 'alt' ? 'alternada (envolvente)' : 'en todos los tramos')}</table>
      <h2>2. Planta</h2>
      ${floorPlanData(res, input, 'print')}
      <h2>3. Correas</h2>
      ${beamTable([['Correa', res.corr]])}
      ${lineFig(res, input, 'corr', 0, 'print')}
      <h2>4. Vigas principales</h2>
      <table>${res.lines.map((l, j) => memoRow(`Línea ${letter(j)}`, `carga D = ${fmt(res.lineD[j], 0)}, L = ${fmt(res.lineL[j], 0)} kg/m; reacciones ${l.Rmax.map((r) => fmt(r, 0)).join(' · ')} kg`)).join('')}</table>
      ${beamTable(res.lines.map((l, j) => [`Línea ${letter(j)}`, l]))}
      ${lineFig(res, input, 'beam', wj, 'print')}
      <h2>5. Columnas y bases</h2>
      ${res.own.length ? `<table>${res.own.map((n) => memoRow(`Eje ${colName(n.i, n.j)}: N = ${fmt(n.N, 0)} kg`, `${escapeHtml(n.col.profile.n)} (λ = ${fmt(n.col.chk.lambda, 1)}, ω = ${n.col.chk.omega === null ? '—' : fmt(n.col.chk.omega, 2)}, σ = ${fmt(n.col.chk.sigma || 0, 0)} ≤ ${fmt(n.col.chk.sigmaAllow, 0)} kg/cm²) · base ${footingText(n.footing)}${n.footing && n.footing.ok ? `, ${footingBars(n.footing)}` : ''}`)).join('')}</table>
      ${columnFig(big.col, { H: input.H, support: input.support }, 'print')}` : '<p>No hay columnas propias: todos los apoyos descargan sobre la estructura existente.</p>'}
      ${res.existingLoads.length ? `<h2>6. Descarga sobre la estructura existente</h2><table>${res.existingLoads.filter((n) => n.N > 0).map((n) => memoRow(`Apoyo ${colName(n.i, n.j)}`, `D = ${fmt(n.RD, 0)} kg; L = ${fmt(n.RL, 0)} kg; total ${fmt(n.N, 0)} kg`)).join('')}</table>` : ''}
      ${calc.floorPrefix ? '' : `<h2>Uniones</h2>
      ${jointsMemo(jointsFloor(res, calc))}`}
      <h2>${res.existingLoads.length ? '7' : '6'}. Cómputo y resultado</h2>
      <table>${memoRow('Acero: correas · vigas · columnas', `${fmt(q.kgCorr, 0)} · ${fmt(q.kgBeams, 0)} · ${fmt(q.kgCols, 0)} kg`)}${memoRow('Total', `${fmt(q.kgTot, 0)} kg (${fmt(q.kgPerM2, 1)} kg/m²)`)}${memoRow('Resultado', res.ok ? 'verifica' : 'no verifica')}</table>`,
  };
}
