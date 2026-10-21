import { designRanges } from './structural-rangos.js';
import { addCalc, setCalcField, duplicateCalc, deleteCalc } from '../state.js';
import { escapeHtml, formatDateShort, openModal, closeModal, showToast, confirmAction } from '../utils.js';
import { CIRSOC201 as N, LIVE_LOADS, ARTICLES } from '../structural/norms.js';
import * as rc from '../structural/rc.js';
import { newCalc } from '../structural/defaults.js';
import { fmt, numField, selField, disclaimer, openMemoriaDoc, checksCard } from './structural-ui.js';
import { columnModule } from './structural-column.js';
import { footingModule } from './structural-footing.js';
import { SOIL_UNIT_WEIGHTS } from '../structural/footing.js';
import { buildingModule } from './structural-building.js';
import { slab2Module } from './structural-slab2.js';
import { beamFigure } from './structural-draw.js';
import { armadoFigure, armadoMembersFigure, simpleCurves, distributionBars } from './structural-armado.js';
import { trussModule } from './structural-truss.js';
import { portalModule } from './structural-portal.js';
import { latticeModule } from './structural-lattice.js';
import { naveCabModule, naveArchModule } from './structural-nave2.js';
import { wireAxisEditors, axisEditor, axisSketch } from './structural-spans.js';
import { applyForceUnits, unitToggleHtml, wireUnitToggle } from './structural-units.js';
import { designContinuous, analyzeContinuous, minHeight } from '../structural/cbeam.js';
import { tidySvgs } from './svg-tidy.js';
import { tensModule, TENS_NOTE } from './structural-tens.js';
import { compModule, COMP_NOTE } from './structural-comp.js';
import { vierModule, postModule, BIG_NOTE } from './structural-big.js';
import { foldedModule, FOLD_NOTE } from './structural-folded.js';
import { spaceModule, SPACE_NOTE } from './structural-space.js';
import { towerModule, TOWER_NOTE } from './structural-tower.js';
import { shellPHModule, domeModule, SHELL_NOTE } from './structural-shells.js';
import { steelBeamModule, steelPurlinModule, steelColumnModule, steelTieModule, steelFloorModule } from './structural-steel.js';

// Módulos por tipo de elemento (viga y losa viven en este archivo).
const MODULES = { column: columnModule, footing: footingModule, building: buildingModule, slab2: slab2Module,
  sfloor: steelFloorModule, sbeam: steelBeamModule, spurlin: steelPurlinModule, scolumn: steelColumnModule, stie: steelTieModule, struss: trussModule, snave: portalModule, slat: latticeModule, snavecab: naveCabModule, snavearch: naveArchModule, stens: tensModule, scomp: compModule, svier: vierModule, spost: postModule, splegado: foldedModule, sestereo: spaceModule, sph: shellPHModule, sdome: domeModule, tower: towerModule };
const STEEL = new Set(['sfloor', 'sbeam', 'spurlin', 'scolumn', 'stie', 'struss', 'snave', 'slat', 'snavecab', 'snavearch']);
// Grandes luces: no es una familia de material (cables y telas de acero, cáscaras de hormigón o cerámica, vigas Vierendeel, postesado…), tiene su propia categoría.
const GL = new Set(['stens', 'scomp', 'svier', 'spost', 'splegado', 'sestereo', 'sph', 'sdome']);
const GL_NOTES = { stens: TENS_NOTE, scomp: COMP_NOTE, svier: BIG_NOTE, spost: BIG_NOTE, splegado: FOLD_NOTE, sestereo: SPACE_NOTE, sph: SHELL_NOTE, sdome: SHELL_NOTE };
const STEEL_NOTE = 'Cálculo por el método elástico (tensiones admisibles) con el material de la cátedra de Estructuras III y CIRSOC 101 para las cargas; bases con CIRSOC 201-2005. Herramienta de apoyo: debe ser revisada y firmada por un profesional matriculado antes de usarse en obra.';

const ELEMENTS = {
  building: { label: 'Edificio completo de hormigón armado' },
  tower: { label: 'Edificio en torre de hormigón armado (tabiques contraviento)' },
  slab: { label: 'Losa maciza armada en una dirección' },
  slab2: { label: 'Losa maciza armada en dos direcciones' },
  beam: { label: 'Viga de hormigón armado' },
  column: { label: 'Columna de hormigón armado' },
  footing: { label: 'Base de hormigón armado' },
  sfloor: { label: 'Entrepiso de acero independiente' },
  sbeam: { label: 'Viga de acero' },
  spurlin: { label: 'Correa de acero (flexión oblicua)' },
  scolumn: { label: 'Columna de acero' },
  stie: { label: 'Tensor de acero' },
  struss: { label: 'Cercha o cabriada de acero' },
  snave: { label: 'Nave industrial de acero (pórtico)' },
  slat: { label: 'Columna reticulada de acero' },
  snavecab: { label: 'Nave de acero: cabriada sobre columnas' },
  snavearch: { label: 'Nave de acero: arco parabólico' },
  stens: { label: 'Estructura de grandes luces traccionada (cables y telas)' },
  scomp: { label: 'Estructura de grandes luces de compresión dominante (cubierta cilíndrica)' },
  svier: { label: 'Viga de gran inercia: Vierendeel' },
  spost: { label: 'Viga de gran inercia: postesada' },
  splegado: { label: 'Plegado de hormigón armado' },
  sestereo: { label: 'Estereoestructura plana (retícula de caños)' },
  sph: { label: 'Cáscara de paraboloide hiperbólico' },
  sdome: { label: 'Cúpula de hormigón armado' },
};
const SOON = ['Base corrida', 'Platea de fundación'];
// Lo que se puede elegir al calcular un elemento separado: 'elemento' o 'elemento:variante'.
const CHOICES = [
  ['slab', 'Losa en una dirección'],
  ['slab2', 'Losa en dos direcciones'],
  ['beam:conv', 'Viga convencional (losa arriba)'],
  ['beam:inv', 'Viga invertida (losa abajo)'],
  ['column', 'Columna'],
  ['footing:isolated', 'Base aislada (carga centrada)'],
  ['footing:edge', 'Base excéntrica (de medianera)'],
  ['footing:corner', 'Base doblemente excéntrica (de esquina)'],
  ['footing:combined', 'Base unificada (dos columnas muy próximas)'],
];
const CHOICES_STEEL = [
  ['sbeam', 'Viga de acero (simple, continua o con voladizos)'],
  ['sfloor', 'Entrepiso de acero independiente (correas, vigas, columnas y bases)'],
  ['spurlin', 'Correa en flexión oblicua (techo inclinado)'],
  ['scolumn:simple', 'Columna simple (perfil o caño)'],
  ['scolumn:battened', 'Columna compuesta con presillas'],
  ['snavecab', 'Nave industrial: cabriada apoyada sobre columnas (con viento CIRSOC 102)'],
  ['snavearch', 'Nave industrial: arco parabólico (con viento CIRSOC 102)'],
  ['slat:2', 'Columna reticulada de dos cordones'],
  ['slat:4', 'Columna reticulada de cuatro cordones'],
  ['stie', 'Tensor'],
  ['struss:gable', 'Cabriada de cubierta a dos aguas'],
  ['struss:parallel', 'Cercha o viga reticulada de cordones paralelos'],
  ['struss:custom', 'Cercha armada nudo por nudo'],
  ['snave:quebrada', 'Nave industrial: pórtico de viga quebrada (con viento CIRSOC 102)'],
  ['snave:triarticulado', 'Nave industrial: pórtico triarticulado (con viento CIRSOC 102)'],
];
const CHOICES_GL = [
  ['stens:jawerth', 'Tracción: cercha Jawerth espacial con tela estructural (la tela es cerramiento y pendolón)'],
  ['stens:jawerth-pend', 'Tracción: cercha Jawerth espacial con pendolones inclinados de cable'],
  ['stens:jawerth-plana-a', 'Tracción: cercha Jawerth plana con pendolones verticales (cable y caño), cubierta sobre el cable superior'],
  ['stens:jawerth-plana-b', 'Tracción: cercha Jawerth plana con pendolones verticales (cable y caño), cubierta colgada del cable inferior'],
  ['stens:jawerth-radial', 'Tracción: cercha Jawerth radial (planta circular), con tela o pendolones'],
  ['stens:heavy', 'Tracción: cubierta pesada (cables con losetas)'],
  ['stens:ph', 'Tracción: paraboloide hiperbólico'],
  ['stens:hr', 'Tracción: hiperboloide de revolución'],
  ['svier:rc', 'Vigas de gran inercia: Vierendeel de hormigón armado'],
  ['svier:steel', 'Vigas de gran inercia: Vierendeel de acero'],
  ['spost:beam', 'Vigas de gran inercia: viga postesada de hormigón'],
  ['scomp:shell', 'Compresión dominante: cubierta cilíndrica de onda parabólica (cerámica armada)'],
  ['splegado:rc', 'Plegados: losa plegada de hormigón armado'],
  ['sestereo:beams', 'Estereoestructura plana: placa sobre vigas y columnas'],
  ['sestereo:columns', 'Estereoestructura plana: placa sobre columnas (con capitel)'],
  ['sph:ph', 'Cáscaras: paraboloide hiperbólico de hormigón armado (módulo de cuatro sectores)'],
  ['sdome:dome', 'Cáscaras: cúpula de generatriz circular de hormigón armado'],
];
const STEPS = [
  { n: 1, label: 'Diseño' },
  { n: 2, label: 'Predimensionado' },
  { n: 3, label: 'Dimensionado' },
];


// ---------------- datos del cálculo -> entradas del motor ----------------
function loadsOf(calc) {
  const d = calc.design;
  if (calc.element === 'slab') return { D0: Number(d.perm) || 0, Lv: Number(d.live) || 0 };
  const w = Number(d.tribW) || 0;
  return {
    D0: w * ((Number(d.slabH) || 0) / 100 * N.gammaRC + (Number(d.perm) || 0)) + (Number(d.wall) || 0),
    Lv: w * (Number(d.live) || 0),
  };
}

function engineInput(calc) {
  const m = calc.materials;
  const { D0, Lv } = loadsOf(calc);
  const base = {
    L: Number(calc.design.L), kind: calc.design.kind, D0, Lv, fc: Number(m.fc),
    placement: m.placement, exposure: m.exposure, limitKey: calc.verification.limitKey, xi: Number(calc.verification.xi),
  };
  if (calc.element === 'slab') {
    return { ...base, h: Number(calc.section.h) * 10, bars: calc.chosen };
  }
  const b = Number(calc.section.b) * 10;
  return {
    ...base, b, h: Number(calc.section.h) * 10,
    fy: N.rebar[m.rebar].fy, fyt: N.rebar[m.stirrup].fy, dStirrup: Number(m.dStirrup), dagg: Number(m.dagg), bars: calc.chosen,
    section: calc.design.beamType === 'inv' ? 'inv' : 'conv', flange: flangeOf(calc, b),
  };
}

// Ala de la losa (art. 8.10): la distancia libre al alma vecina sale del ancho de influencia, con separaciones iguales a ambos lados.
// Los cálculos viejos (sin la opción) siguen siendo rectangulares.
function flangeOf(calc, b) {
  const d = calc.design;
  const tribW = Number(d.tribW) || 0;
  const hf = (Number(d.slabH) || 0) * 10;
  if (d.flangeMode !== 'yes' || !(tribW > 0) || !(hf > 0) || !(b > 0)) return null;
  const pos = d.flangePos === 'L' ? 'L' : 'T';
  const sw = (pos === 'L' ? 2 * tribW : tribW) * 1000 - b;
  const bf = rc.flangeWidth({ pos, bw: b, hf, L: Number(d.L) * 1000, sw });
  return { bf, hf, pos, sw };
}

// ---------------- viga o losa continua: varios tramos, voladizos y apoyos simples o empotrados ----------------
const isCont = (calc) => (calc.element === 'beam' || calc.element === 'slab') && calc.design.kind === 'continuous';
const LETTER = (i) => String.fromCharCode(65 + i);

function contGeom(calc) {
  const d = calc.design;
  const L0 = Number(d.L) > 0 ? Number(d.L) : 5;
  const spans = (Array.isArray(d.spans) && d.spans.length ? d.spans : [L0, L0]).map(Number);
  const fixed = Array.from({ length: spans.length + 1 }, (_, i) => Boolean(d.fix) && d.fix[i] === 'E');
  return { spans, cantL: Number(d.cantL) || 0, cantR: Number(d.cantR) || 0, fixed };
}

function contInput(calc) {
  const g = contGeom(calc);
  const beam = calc.element === 'beam';
  const m = calc.materials;
  const { D0, Lv } = loadsOf(calc);
  const input = { element: calc.element, ...g, D0, Lv, fc: Number(m.fc), placement: m.placement, exposure: m.exposure, h: Number(calc.section.h) * 10 };
  if (beam) Object.assign(input, { b: Number(calc.section.b) * 10, fy: N.rebar[m.rebar].fy, fyt: N.rebar[m.stirrup].fy, dStirrup: Number(m.dStirrup), dagg: Number(m.dagg) });
  return input;
}

function runCont(calc) {
  const input = contInput(calc);
  const beam = calc.element === 'beam';
  if (!(input.spans.every((v) => Number.isFinite(v) && v > 0) && input.h > 0 && input.fc > 0 && (!beam || input.b > 0))) return { error: 'Completá las luces y las medidas con valores mayores que cero.' };
  try { return { res: designContinuous(input), input, cont: true }; } catch (e) { return { error: 'No se pudo calcular con estos datos: revisá que la viga esté bien vinculada.' }; }
}

function contSummary(c) {
  const g = contGeom(c);
  return `continua: ${g.cantL > 0 ? `voladizo ${fmt(g.cantL, 1)} + ` : ''}${g.spans.map((l) => fmt(l, 1)).join(' + ')}${g.cantR > 0 ? ` + voladizo ${fmt(g.cantR, 1)}` : ''} m${g.fixed.some(Boolean) ? ', con empotramientos' : ''}`;
}

function predimCont(calc) {
  const m = calc.materials;
  const beam = calc.element === 'beam';
  const g = contGeom(calc);
  const fy = beam ? N.rebar[m.rebar].fy : 420;
  const fc = Number(m.fc);
  const { D0, Lv } = loadsOf(calc);
  const b = beam ? Number(calc.section.b) * 10 : 1000;
  if (!g.spans.every((v) => v > 0) || !(b > 0)) return null;
  const mh = minHeight({ element: calc.element, ...g, fy });
  const assumedDb = beam ? 16 : 10;
  const dSt = beam ? Number(m.dStirrup) : 0;
  const cover = rc.coverFor({ element: calc.element, placement: m.placement, exposure: m.exposure, dMain: assumedDb, dStirrup: dSt });
  let h = mh.hMin;
  let dMin = 0;
  let M = 0;
  for (let i = 0; i < 6; i++) {
    const a = analyzeContinuous({ element: calc.element, ...g, D0, Lv, b, h });
    M = Math.max(...a.an.spans.map((x) => x.posM), ...a.an.supports.map((x) => x.negM));
    dMin = rc.dMinFlexure({ Mu: M * 1e6, b, fc, fy });
    h = Math.max(mh.hMin, dMin + cover + dSt + assumedDb / 2);
  }
  return { hMin: mh.hMin, hMinBy: mh.by, hFlex: dMin + cover + dSt + assumedDb / 2, dMin, cover, assumedDb, wu: 0, M, recommended: rc.ceilTo(h, beam ? 50 : 10), b };
}

function runDesign(calc) {
  if (MODULES[calc.element]) return MODULES[calc.element].run(calc);
  if (isCont(calc)) return runCont(calc);
  const input = engineInput(calc);
  const valid = [input.L, input.h, input.fc].every((v) => Number.isFinite(v) && v > 0) && (calc.element === 'slab' || input.b > 0);
  if (!valid) return { error: 'Completá la luz y las medidas con valores mayores que cero.' };
  try {
    return { res: calc.element === 'slab' ? rc.designSlab(input) : rc.designBeam(input), input };
  } catch (e) {
    return { error: 'No se pudo calcular con estos datos.' };
  }
}

// Predimensionado: altura mínima por tabla (flechas) y altura mínima por flexión (sección controlada por tracción).
function predim(calc) {
  if (isCont(calc)) return predimCont(calc);
  const m = calc.materials;
  const fy = N.rebar[m.rebar].fy;
  const fc = Number(m.fc);
  const { D0, Lv } = loadsOf(calc);
  const L = Number(calc.design.L);
  const kind = calc.design.kind;
  const beam = calc.element === 'beam';
  const b = beam ? Number(calc.section.b) * 10 : 1000;
  if (!(L > 0) || !(b > 0)) return null;
  const fl = beam ? flangeOf(calc, b) : null;
  const simple = kind !== 'cantilever';
  const flangeComp = Boolean(fl) && ((calc.design.beamType !== 'inv') === simple);
  const cOverD = N.epsCu / (N.epsCu + N.epsTensionControlled);
  // con ala comprimida se usa su ancho si el bloque cabe en ella (a <= hf); si no, solo el alma (del lado de la seguridad)
  const dMinOf = (Mu, hh) => {
    if (flangeComp) {
      const dT = rc.dMinFlexure({ Mu, b: fl.bf, fc, fy });
      if (N.beta1(fc) * cOverD * dT <= fl.hf) return dT;
    }
    return rc.dMinFlexure({ Mu, b, fc, fy });
  };
  const hMin = rc.minThickness({ element: calc.element, kind, L, fy });
  const assumedDb = beam ? 16 : 10;
  const dSt = beam ? Number(m.dStirrup) : 0;
  const cover = rc.coverFor({ element: calc.element, placement: m.placement, exposure: m.exposure, dMain: assumedDb, dStirrup: dSt });
  let h = hMin;
  let dMin = 0;
  let wu = 0;
  let M = 0;
  for (let i = 0; i < 6; i++) {
    const self = beam ? (fl ? b * Math.max(0, h - fl.hf) / 1e6 * N.gammaRC : rc.selfWeightBeam(b, h)) : rc.selfWeightSlab(h);
    wu = rc.combos(D0 + self, Lv).wu;
    M = rc.actions(kind, L, wu).M;
    dMin = dMinOf(M * 1e6, h);
    h = Math.max(hMin, dMin + cover + dSt + assumedDb / 2);
  }
  const step = beam ? 50 : 10;
  return { hMin, hFlex: dMin + cover + dSt + assumedDb / 2, dMin, cover, assumedDb, wu, M, recommended: rc.ceilTo(h, step), b };
}

// ---------------- vista ----------------
export function renderStructural(root, state, params) {
  const id = params.get('id');
  const calc = id ? state.calcs.find((c) => c.id === id) : null;
  if (calc) renderCalc(root, state, calc, Number(params.get('step')) || calc.step || 1);
  else renderList(root, state);
}


function renderList(root, state) {
  const calcs = [...state.calcs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h1>Cálculo estructural</h1>
        <p>Creá un cálculo y recorré tres etapas: diseño, predimensionado y dimensionado.</p>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">${unitToggleHtml()}<button class="btn btn-primary" id="newCalcBtn">+ Nuevo cálculo</button></div>
    </div>
    ${disclaimer()}
    ${calcs.length ? `<div class="task-list">${calcs.map((c) => calcRow(c, state)).join('')}</div>`
      : '<div class="card"><div class="empty-state">Todavía no hay cálculos. Tocá “Nuevo cálculo” para empezar con una viga o una losa.</div></div>'}
    <div class="card" style="margin-top:16px;">
      <h3 style="margin-top:0;">Próximamente</h3>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">${SOON.map((s) => `<span class="tag tag-baja">${s}</span>`).join('')}</div>
      <p class="text-muted" style="font-size:12.5px; margin:10px 0 0;">Cada tipo se agrega después de verificar sus fórmulas contra el reglamento correspondiente.</p>
    </div>`;

  root.querySelector('#newCalcBtn').addEventListener('click', () => openNewModal(state));
  wireUnitToggle(root, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { location.hash = `structural?id=${el.dataset.open}`; }));
  root.querySelectorAll('[data-dup]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    duplicateCalc(el.dataset.dup);
    showToast('Cálculo duplicado');
  }));
  root.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const c = state.calcs.find((x) => x.id === el.dataset.del);
    confirmAction(`¿Eliminar el cálculo <strong>${escapeHtml(c.name)}</strong>?`, () => { deleteCalc(c.id); showToast('Cálculo eliminado'); }, { title: 'Eliminar cálculo' });
  }));
}

function canMemo(calc, out) {
  if (!out.res) return false;
  if (out.cont) return Boolean(out.res.members);
  if (STEEL.has(calc.element) || GL.has(calc.element)) return Boolean(out.res.profile || out.res.corr || out.res.families || out.res.col || out.res.chordProfile || out.res.arch || (out.res.nave2 && out.res.truss) || out.res.net || out.res.Rmax !== undefined || out.res.cableM || out.res.tramos || out.res.checks);
  return MODULES[calc.element] ? Boolean(out.res.chosen || out.res.ok || out.res.G || out.res.strips) : Boolean(out.res.chosen);
}

const FOOTING_NAMES = { isolated: 'Base aislada', edge: 'Base excéntrica', corner: 'Base doblemente excéntrica', combined: 'Base unificada' };

function summaryOf(c) {
  if (c.element === 'sfloor') return `${fmt(c.design.xSpans.reduce((a, b) => a + b, 0), 1)} × ${fmt(c.design.ySpans.reduce((a, b) => a + b, 0), 1)} m, ${c.design.xSpans.length} × ${c.design.ySpans.length} tramos`;
  if (c.element === 'sbeam') return `${c.design.spans.map((l) => fmt(l, 1)).join(' + ')} m, ${c.section.type}`;
  if (c.element === 'spurlin') return `luz ${fmt(c.design.L, 2)} m, α = ${fmt(c.design.alpha, 1)}°`;
  if (c.element === 'scolumn') return `${c.design.kind === 'battened' ? 'compuesta con presillas' : 'simple'}, N = ${fmt(c.design.N, 0)} kg, H = ${fmt(c.design.H, 1)} m`;
  if (c.element === 'snavecab') return `cabriada sobre columnas, ${fmt(c.design.A, 1)} × ${fmt(c.design.B, 1)} m, f = ${fmt(c.design.f, 1)} m`;
  if (c.element === 'snavearch') return `arco parabólico, ${fmt(c.design.A, 1)} × ${fmt(c.design.B, 1)} m, f = ${fmt(c.design.f, 1)} m`;
  if (c.element === 'slat') return `${Number(c.design.kind) === 4 ? '4' : '2'} cordones, N = ${fmt(c.design.N, 0)} kg, H = ${fmt(c.design.H, 1)} m`;
  if (c.element === 'snave') return `${c.design.type === 'triarticulado' ? 'triarticulado' : 'viga quebrada'}, ${fmt(c.design.A, 1)} × ${fmt(c.design.B, 1)} m, θ = ${fmt(c.design.theta, 0)}°${c.design.mezzOn === 'yes' ? ' · con entrepiso' : ''}`;
  if (c.element === 'struss') return `${c.design.kind === 'gable' ? `cabriada, luz ${fmt(c.design.L, 1)} m, flecha ${fmt(c.design.f, 1)} m` : c.design.kind === 'custom' ? 'armada nudo por nudo' : `${c.design.kind}, luz ${fmt(c.design.L, 1)} m, h = ${fmt(c.design.h, 2)} m`}`;
  if (c.element === 'svier') return `${c.design.kind === 'steel' ? 'de acero' : 'de hormigón armado'}, luz ${fmt(c.design.L, 1)} m, altura ${fmt(c.design.H, 1)} m`;
  if (c.element === 'spost') return `luz ${fmt(c.design.L, 1)} m, flecha del cable ${fmt(c.design.f, 2)} m`;
  if (c.element === 'sph') return `módulo de ${fmt(2 * c.design.b, 1)} × ${fmt(2 * c.design.a, 1)} m, ${c.design.nx * c.design.ny} módulos, espesor ${fmt(c.design.e, 0)} cm`;
  if (c.element === 'sdome') return `diámetro ${fmt(c.design.L, 1)} m, altura ${fmt(c.design.f, 1)} m, espesor ${fmt(c.design.e, 0)} cm`;
  if (c.element === 'splegado') return `${fmt(c.design.nMod, 0)} módulos de ${fmt(c.design.B, 1)} m, luz ${fmt(c.design.L, 1)} m, H = ${fmt(c.design.H, 2)} m`;
  if (c.element === 'sestereo') return `${c.design.hyp === 'columns' ? 'placa sobre columnas' : 'placa sobre vigas'}, ${c.design.xSpans.map((l) => fmt(l, 1)).join(' + ')} × ${c.design.ySpans.map((l) => fmt(l, 1)).join(' + ')} m, Lm = ${fmt(c.design.Lm, 1)} m`;
  if (c.element === 'tower') return `h = ${fmt(c.design.hPB + c.design.nTipo * c.design.hTipo, 0)} m, ${c.design.B} × ${c.design.L} m, ${c.design.walls.length} tabiques`;
  if (c.element === 'scomp') return `cubierta cilíndrica, luz ${fmt(c.design.L, 1)} m, flecha ${fmt(c.design.f, 1)} m`;
  if (c.element === 'stens') return `${c.design.kind === 'hr' ? `hiperboloide, ${c.design.nNodes} nudos` : `${c.design.kind === 'jawerth' ? `cercha Jawerth ${c.design.layout === 'radial' ? 'radial' : c.design.layout === 'plana' || c.design.cover === 'a' || c.design.cover === 'b' ? 'plana' : 'espacial'}` : c.design.kind === 'heavy' ? 'cubierta pesada' : 'paraboloide hiperbólico'}, luz ${fmt(c.design.L, 1)} m, flecha ${fmt(c.design.f, 1)} m`}`;
  if (c.element === 'stie') return `T = ${fmt(c.design.T, 0)} kg, L = ${fmt(c.design.L, 1)} m`;
  if (c.element === 'building') return `${c.design.levels.length} niveles, ${c.design.xSpans.length} × ${c.design.ySpans.length} vanos${c.design.typo && c.design.typo !== 'rect' ? `, planta ${({ L: 'en L', U: 'en U', T: 'en T', cruz: 'en cruz', H: 'en H', patio: 'con patio', escalera: 'escalonada', custom: 'libre' })[c.design.typo] || ''}` : ''}`;
  if (c.element === 'column') return `${fmt(c.section.b, 0)} × ${fmt(c.section.h, 0)} cm, ${fmt(c.design.PD + c.design.PL, 0)} kN`;
  if (c.element === 'footing' && c.design.footType === 'combined') return `Base unificada, ${fmt(c.design.PD1 + c.design.PL1 + c.design.PD2 + c.design.PL2, 0)} kN, ℓ = ${fmt(c.design.ell, 0)} cm, suelo ${fmt(c.design.sigma, 1)} kg/cm²`;
  if (c.element === 'footing') return `${FOOTING_NAMES[c.design.footType] || 'Base aislada'}, ${fmt(c.design.PD + c.design.PL, 0)} kN, suelo ${fmt(c.design.sigma, 1)} kg/cm²`;
  if (c.element === 'slab2') return `${fmt(c.design.lx, 2)} × ${fmt(c.design.ly, 2)} m`;
  if (isCont(c)) return contSummary(c);
  if (c.element === 'beam') return `${c.design.beamType === 'inv' ? 'invertida' : 'convencional'}, luz ${fmt(c.design.L, 2)} m`;
  return `luz ${fmt(c.design.L, 2)} m`;
}

export function makeCalc({ name, element, projectId, variant }) {
  let calc;
  if (MODULES[element]) calc = { name: name || 'Cálculo nuevo', projectId: projectId || null, material: element === 'tower' ? 'torre' : GL.has(element) ? 'gl' : STEEL.has(element) ? 'ac' : 'ha', element, step: 1, chosen: null, ...MODULES[element].defaults(variant) };
  else calc = newCalc({ name, element, projectId });
  if (variant && calc.design) {
    if (element === 'beam') calc.design.beamType = variant;
    if (element === 'footing') calc.design.footType = variant;
    if (element === 'scolumn') calc.design.kind = variant;
  }
  return calc;
}

function calcRow(c, state) {
  const out = runDesign(c);
  const status = out.pending ? '<span class="tag tag-baja">Sin calcular</span>' : out.res ? (out.res.ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>') : '<span class="tag tag-baja">Incompleto</span>';
  const proj = c.projectId ? state.projects.find((p) => p.id === c.projectId) : null;
  return `
    <div class="task-item" style="flex-wrap:wrap; gap:10px; cursor:pointer;" data-open="${c.id}">
      <div style="flex:1; min-width:220px;">
        <div class="task-title">${escapeHtml(c.name)}</div>
        <div class="text-muted" style="font-size:12px;">${ELEMENTS[c.element]?.label || c.element} · ${summaryOf(c)} · etapa ${c.step || 1} de 3${proj ? ` · ${escapeHtml(proj.name)}` : ''} · ${formatDateShort(c.updatedAt.slice(0, 10))}</div>
      </div>
      ${status}
      <button class="btn btn-sm" data-dup="${c.id}">Duplicar</button>
      <button class="btn btn-sm btn-danger" data-del="${c.id}">Eliminar</button>
    </div>`;
}

function openNewModal(state) {
  const elOpts = CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  const elOptsSteel = CHOICES_STEEL.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  const elOptsGL = CHOICES_GL.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  openModal(`
    <h2>Nuevo cálculo</h2>
    <form id="newCalcForm">
      <div class="field"><label>Nombre</label><input name="name" required maxlength="80" placeholder="Ej.: Edificio Alem 1200" /></div>
      <div class="field"><label>Material</label>
        <select name="material"><option value="ha">Hormigón armado</option><option value="ac">Estructura metálica (acero)</option><option value="gl">Grandes luces</option><option value="torre">Edificio en torre</option></select>
      </div>
      <div class="field"><label>¿Qué querés calcular?</label>
        <div style="display:grid; gap:8px;" data-modes>
          <label class="chk-row" style="border:1px solid var(--line); border-radius:10px; padding:10px 12px; align-items:flex-start;"><input type="radio" name="mode" value="building" checked />
            <span style="min-width:0; flex:1;"><b>Edificio completo</b><br><span class="text-muted" style="font-size:12.5px;" data-bdesc>Losas, vigas, columnas y bases a partir de los niveles, las luces entre apoyos, los apeos y los voladizos.</span></span></label>
          <label class="chk-row" style="border:1px solid var(--line); border-radius:10px; padding:10px 12px; align-items:flex-start;"><input type="radio" name="mode" value="element" />
            <span style="min-width:0; flex:1;"><b>Elemento separado</b><br><span class="text-muted" style="font-size:12.5px;">Una losa (en una o dos direcciones), una viga (convencional o invertida), una columna o una base (aislada, excéntrica, doblemente excéntrica o unificada), con sus propias cargas.</span>
            <select name="element" style="margin-top:6px; width:100%; max-width:100%;">${elOpts}</select><select name="elementSteel" style="margin-top:6px; width:100%; max-width:100%; display:none;">${elOptsSteel}</select></span></label>
        </div>
        <div data-towerbox style="display:none; border:1px solid var(--line); border-radius:10px; padding:10px 12px;">
          <b>Edificio en torre (tabiques contraviento)</b><br><span class="text-muted" style="font-size:12.5px;">Torre alta de hormigón armado cuyos tabiques toman el viento: viento CIRSOC 102 por piso, esfuerzos de la ménsula, volcamiento, tensión del terreno bajo la platea, flecha en cabeza y flexocompresión de cada tabique con su armadura y su dintel.</span>
        </div>
        <div data-glbox style="display:none; border:1px solid var(--line); border-radius:10px; padding:10px 12px;">
          <b>Estructura de grandes luces</b><br><span class="text-muted" style="font-size:12.5px;">Cubiertas y estructuras que cubren luces grandes con sistemas especiales (cables y telas, cubiertas cilíndricas de compresión dominante, vigas Vierendeel y postesadas, losas plegadas, estereoestructuras y cáscaras de hormigón: paraboloide hiperbólico y cúpulas): el material depende del sistema.</span>
          <select name="elementGL" style="margin-top:6px; width:100%; max-width:100%;">${elOptsGL}</select>
        </div>
      </div>
      <div class="field"><label>Proyecto <span class="text-muted">(opcional)</span></label>
        <select name="projectId"><option value="">Sin proyecto</option>${state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="newCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Crear y empezar</button>
      </div>
    </form>
  `, (backdrop) => {
    backdrop.querySelector('#newCancel').addEventListener('click', closeModal);
    const mat = backdrop.querySelector('[name=material]');
    const syncMat = () => {
      const gl = mat.value === 'gl';
      const steel = mat.value === 'ac';
      const torre = mat.value === 'torre';
      backdrop.querySelector('[data-modes]').style.display = gl || torre ? 'none' : 'grid';
      backdrop.querySelector('[data-glbox]').style.display = gl ? '' : 'none';
      backdrop.querySelector('[data-towerbox]').style.display = torre ? '' : 'none';
      backdrop.querySelector('[name=element]').style.display = steel || gl ? 'none' : '';
      if (steel || gl) { const first = backdrop.querySelector('[name=mode][value=building]'); if (first) first.checked = true; }
      backdrop.querySelector('[name=elementSteel]').style.display = steel ? '' : 'none';
      backdrop.querySelector('[data-bdesc]').textContent = steel ? 'Una nave industrial de acero: pórtico, correas, viento (CIRSOC 102) y bases. Dentro de la nave podés agregar un entrepiso, si lo necesitás.' : 'Losas, vigas, columnas y bases a partir de los niveles, las luces entre apoyos, los apeos y los voladizos.';
    };
    mat.addEventListener('change', syncMat);
    backdrop.querySelector('#newCalcForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const steel = f.material.value === 'ac';
      const gl = f.material.value === 'gl';
      const torre = f.material.value === 'torre';
      const [element, variant] = torre ? ['tower', ''] : gl ? f.elementGL.value.split(':') : f.mode.value === 'building' ? (steel ? ['snave', 'quebrada'] : ['building', '']) : (steel ? f.elementSteel.value : f.element.value).split(':');
      const id = addCalc(makeCalc({ name: f.name.value.trim(), element, variant, projectId: f.projectId.value }));
      closeModal();
      location.hash = `structural?id=${id}`;
    });
  });
}

// ---------------- campos ----------------

// ---------------- pantalla de un cálculo ----------------
function renderCalc(root, state, calc, step) {
  const out = runDesign(calc);
  const proj = calc.projectId ? state.projects.find((p) => p.id === calc.projectId) : null;
  root.innerHTML = `
    <div class="view-header">
      <div>
        <a href="#structural" class="text-muted" style="font-size:12.5px;">← Todos los cálculos</a>
        <h1 style="margin-top:4px;">${escapeHtml(calc.name)}</h1>
        <p>${ELEMENTS[calc.element].label}${proj ? ` · ${escapeHtml(proj.name)}` : ''}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${unitToggleHtml()}
        <button class="btn" id="renameBtn">Renombrar</button>
        <button class="btn" id="memoriaBtn" ${canMemo(calc, out) ? '' : 'disabled'}>Memoria de cálculo</button>
      </div>
    </div>
    <div class="tabs" id="stepTabs" style="margin-bottom:16px;">
      ${STEPS.map((s) => `<button class="tab ${s.n === step ? 'active' : ''}" data-step="${s.n}">${s.n}. ${s.label}</button>`).join('')}
    </div>
    <div id="stepBody"></div>
    <div style="display:flex; justify-content:space-between; margin-top:16px;">
      ${step > 1 ? `<button class="btn" data-step="${step - 1}">← ${STEPS[step - 2].label}</button>` : '<span></span>'}
      ${step < 3 ? `<button class="btn btn-primary" data-step="${step + 1}">${STEPS[step].label} →</button>` : '<span></span>'}
    </div>`;

  const body = root.querySelector('#stepBody');
  const mod = MODULES[calc.element];
  if (step === 1) body.innerHTML = mod ? mod.step1(calc) : stepDesign(calc);
  else if (step === 2) body.innerHTML = mod ? mod.step2(calc) : stepPredim(calc);
  else body.innerHTML = mod ? mod.step3(calc, out) : stepDim(calc, out);
  if (step === 3 && GL.has(calc.element)) body.insertAdjacentHTML('beforeend', designRanges(calc));
  applyForceUnits(body);
  tidySvgs(body);
  wireUnitToggle(root, () => window.dispatchEvent(new HashChangeEvent('hashchange')));

  root.querySelectorAll('[data-step]').forEach((el) => el.addEventListener('click', () => {
    const n = Number(el.dataset.step);
    if (n > (calc.step || 1)) setCalcField(calc.id, 'step', n);
    location.hash = `structural?id=${calc.id}&step=${n}`;
  }));

  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
    let v = el.value;
    if (el.hasAttribute('data-num')) {
      v = Number(v);
      if (!Number.isFinite(v)) return;
      if (el.dataset.fk && Number(el.dataset.fk) > 0) v /= Number(el.dataset.fk);        // el campo se muestra en otra unidad de fuerza: se guarda en la original
    }
    if (el.hasAttribute('data-list')) {
      v = String(v).split(/[\s;]+/).join(',').split(',').map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
      if (!v.length) { showToast('Cargá al menos una luz mayor que cero.'); return; }
    }
    const path = el.dataset.f;
    if (/liveId$/.test(path)) {
      const preset = LIVE_LOADS.find((l) => l.id === v);
      setCalcField(calc.id, path, v);
      if (preset) setCalcField(calc.id, path.replace(/liveId$/, 'live'), preset.value);
      return;
    }
    if (/^(design|section|materials)\./.test(path)) setCalcField(calc.id, 'chosen', null);
    if (path === 'design.kind' && v === 'continuous' && !(Array.isArray(calc.design.spans) && calc.design.spans.length)) {
      const L0 = Number(calc.design.L) > 0 ? Number(calc.design.L) : 5;
      setCalcField(calc.id, 'design.spans', [L0, L0]); setCalcField(calc.id, 'design.cantL', 0); setCalcField(calc.id, 'design.cantR', 0); setCalcField(calc.id, 'design.fix', ['S', 'S', 'S']);
    }
    if (path === 'design.mezzOn' && v === 'yes' && !calc.design.mezz) {
      const fd = steelFloorModule.defaults();
      setCalcField(calc.id, 'design.mezz', fd.design); setCalcField(calc.id, 'design.mezzSec', fd.section);
    }
    if (path === 'design.soilId') {
      const soil = SOIL_UNIT_WEIGHTS.find((x) => x.id === v);
      setCalcField(calc.id, path, v);
      if (soil) setCalcField(calc.id, 'design.gamma', soil.value);
      return;
    }
    setCalcField(calc.id, path, v);
  }));

  root.querySelectorAll('[data-chosen]').forEach((el) => el.addEventListener('change', () => {
    const [a, b, c3] = el.value.split(':').map(Number);
    const chosen = calc.element === 'slab' ? { db: a, s: b } : calc.element === 'column' ? { db: a, nb: b, nh: c3 } : { db: a, n: b };
    setCalcField(calc.id, 'chosen', chosen);
  }));
  root.querySelector('[data-use-h]')?.addEventListener('click', (e) => {
    setCalcField(calc.id, 'chosen', null);
    setCalcField(calc.id, 'section.h', Number(e.currentTarget.dataset.useH));
    showToast('Altura actualizada');
  });
  mod?.wire?.(root, calc);
  wireAxisEditors(root, calc);
  root.querySelector('#renameBtn').addEventListener('click', () => {
    openModal(`<h2>Renombrar cálculo</h2><form id="rnForm"><div class="field"><input name="name" required maxlength="80" value="${escapeHtml(calc.name)}" /></div>
      <div class="modal-actions"><button type="button" class="btn" id="rnCancel">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div></form>`, (bd) => {
      bd.querySelector('#rnCancel').addEventListener('click', closeModal);
      bd.querySelector('#rnForm').addEventListener('submit', (e) => { e.preventDefault(); setCalcField(calc.id, 'name', e.target.name.value.trim()); closeModal(); });
    });
  });
  root.querySelector('#memoriaBtn').addEventListener('click', () => {
    if (!canMemo(calc, out)) return;
    if (mod) { const doc = mod.memoria(calc, out); if (doc) openMemoriaDoc(GL.has(calc.element) ? { ...doc, disclaimer: GL_NOTES[calc.element] } : calc.element === 'tower' ? { ...doc, disclaimer: TOWER_NOTE } : STEEL.has(calc.element) ? { ...doc, disclaimer: STEEL_NOTE } : doc); else showToast('Todavía no hay una solución para la memoria.'); }
    else openMemoria(calc, out);
  });
}

// ---------------- paso 1: diseño ----------------
function stepDesign(calc) {
  const d = calc.design;
  const beam = calc.element === 'beam';
  const loads = loadsOf(calc);
  const supports = [...Object.entries(rc.SUPPORTS).map(([k, v]) => [k, v.label]), ['continuous', 'Continua: varios tramos, voladizos y empotramientos']];
  const cont = isCont(calc);
  const liveOpts = [...LIVE_LOADS.map((l) => [l.id, `${l.label} — ${fmt(l.value, 1)} kN/m²`]), ['custom', 'Otro valor (lo ingreso yo)']];
  return `
    <div class="grid grid-2" style="align-items:start;">
      <div class="card">
        <h3 style="margin-top:0;">Esquema estructural</h3>
        <div class="field-row" style="flex-wrap:wrap;">
          ${cont ? '' : numField('design.L', 'Luz de cálculo', d.L, { unit: 'm', hint: 'Luz libre + altura del elemento, sin superar la distancia entre ejes de apoyos (art. 8.7.1).' })}
          ${selField('design.kind', 'Vinculación', d.kind, supports, cont ? '' : 'Para varios tramos, voladizos o empotramientos elegí “Continua”.')}
        </div>
        ${cont ? contScheme(calc) : `${schemeSVG(d.kind)}${beam ? beamTypeBlock(calc) : ''}`}
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Cargas (sin peso propio del elemento)</h3>
        ${beam ? `
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.tribW', 'Ancho de influencia de la losa', d.tribW, { unit: 'm' })}
            ${numField('design.slabH', 'Espesor de la losa apoyada', d.slabH, { unit: 'cm', hint: `Peso propio = espesor × ${N.gammaRC} kN/m³ (CIRSOC 101, Tabla 3.1).` })}
          </div>` : ''}
        <div class="field-row" style="flex-wrap:wrap;">
          ${numField('design.perm', 'Otras cargas permanentes', d.perm, { unit: 'kN/m²', hint: 'Contrapiso, solado, cielorraso, instalaciones: sumalos según CIRSOC 101, Tablas 3.1 y 3.2.' })}
          ${beam ? numField('design.wall', 'Tabiques o cargas lineales sobre la viga', d.wall, { unit: 'kN/m' }) : ''}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('design.liveId', 'Destino (sobrecarga)', d.liveId, liveOpts, 'CIRSOC 101, Tabla 4.1.')}
          ${numField('design.live', 'Sobrecarga de uso', d.live, { unit: 'kN/m²' })}
        </div>
        <div class="text-muted" style="font-size:12.5px; border-top:1px solid var(--line); padding-top:10px;">
          Carga permanente: <b>${fmt(loads.D0, 2)}</b> kN${beam ? '/m' : '/m²'} · Sobrecarga: <b>${fmt(loads.Lv, 2)}</b> kN${beam ? '/m' : '/m²'} <span>(más el peso propio, que se suma al elegir la sección)</span>
        </div>
      </div>
    </div>`;
}

// Esquema de la viga o franja continua: luces entre apoyos, voladizos en los extremos y tipo de cada apoyo (simple o empotrado)
function contScheme(calc) {
  const g = contGeom(calc);
  const n = g.spans.length;
  const beam = calc.element === 'beam';
  return `${axisEditor({ path: 'design.spans', spans: g.spans, title: 'Luces entre apoyos', kind: 'letter', sketch: false,
    hint: `${n} tramo${n === 1 ? '' : 's'} sobre ${n + 1} apoyos (A a ${LETTER(n)}). Cada casillero es la luz entre dos ejes de apoyo (art. 8.7.1).`,
    cant: { left: { path: 'design.cantL', value: g.cantL, label: `Voladizo del apoyo A` }, right: { path: 'design.cantR', value: g.cantR, label: `Voladizo del apoyo ${LETTER(n)}` } } })}
    <h4 style="margin:12px 0 6px; font-size:13px;">Cómo está vinculado cada apoyo</h4>
    <div class="field-row" style="flex-wrap:wrap;">${g.fixed.map((f, i) => selField(`design.fix.${i}`, `Apoyo ${LETTER(i)}`, f ? 'E' : 'S', [['S', 'Apoyo simple'], ['E', 'Empotrado']])).join('')}</div>
    <div class="axed-sketch">${axisSketch({ spans: g.spans, cantL: g.cantL, cantR: g.cantR, kind: 'letter', fix: g.fixed })}</div>
    <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Empotrado = el giro del apoyo está impedido (por ejemplo, la viga continúa con una columna rígida o un muro); el cuadrado oscuro del dibujo lo marca. Los apoyos de un voladizo son los de sus ejes extremos.
      ${beam ? 'La viga se calcula como sección rectangular de ancho b (sin colaboración del ala de la losa).' : 'La losa se calcula por franjas de 1 m de ancho.'}</p>`;
}

// Tipo de viga respecto de la losa (art. 8.10): convencional (losa arriba, sección T o L) o invertida (losa abajo).
function beamTypeBlock(calc) {
  const d = calc.design;
  const yes = d.flangeMode === 'yes';
  const inv = d.beamType === 'inv';
  const b = Number(calc.section.b) * 10;
  const fl = flangeOf(calc, b);
  const simple = d.kind !== 'cantilever';
  const comp = Boolean(fl) && ((!inv) === simple);
  return `<div style="border-top:1px solid var(--line); margin-top:12px; padding-top:12px;">
    <h4 style="margin:0 0 6px; font-size:13px;">Viga y losa</h4>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.beamType', 'Tipo de viga', inv ? 'inv' : 'conv', [['conv', 'Convencional (losa arriba)'], ['inv', 'Invertida (losa abajo)']])}
      ${selField('design.flangeMode', 'La losa colabora como ala', yes ? 'yes' : 'no', [['yes', 'Sí (art. 8.10)'], ['no', 'No: sección rectangular']])}
    </div>
    ${yes ? `<div class="field-row" style="flex-wrap:wrap;">
      ${selField('design.flangePos', 'Posición de la viga', d.flangePos === 'L' ? 'L' : 'T', [['T', 'Interior: losa a ambos lados (sección T)'], ['L', 'De borde: losa de un solo lado (sección L)']])}
    </div>` : ''}
    ${beamTypeSVG(inv, yes ? (d.flangePos === 'L' ? 'L' : 'T') : null, comp)}
    <p class="text-muted" style="font-size:12px; margin:6px 0 0;">${yes
      ? (fl ? `Ancho efectivo del ala bf = <b>${fmt(fl.bf / 10, 0)} cm</b> (espesor ${fmt(fl.hf / 10, 0)} cm; distancia libre al alma vecina ${fmt(fl.sw / 10, 0)} cm, con separaciones iguales). ${comp ? 'Con este tipo de viga y esta vinculación el ala queda comprimida y colabora.' : 'Con este tipo de viga y esta vinculación la losa queda del lado traccionado: la viga flexiona como rectangular de ancho b.'}`
        : 'Cargá el ancho de influencia y el espesor de la losa para calcular el ala.')
      : 'Se calcula como sección rectangular de ancho b.'}
      En la viga invertida la losa trabaja a tracción con momento positivo y colabora a compresión con momento negativo (por ejemplo, un voladizo).</p>
  </div>`;
}

function beamTypeSVG(inv, pos, comp) {
  const web = { x: 64, w: 28 };
  const flangeY = inv ? 62 : 14;
  const webY = inv ? 14 : 30;
  const flange = pos
    ? `<rect x="${pos === 'L' ? web.x : 20}" y="${flangeY}" width="${pos === 'L' ? 80 : 120}" height="16" fill="${comp ? 'var(--accent)' : 'var(--line-soft)'}" fill-opacity="${comp ? 0.35 : 1}" stroke="var(--ink)" stroke-width="1.5"/>`
    : '';
  const tag = pos ? `<text x="150" y="${flangeY + 12}" font-size="10.5" fill="var(--ink-soft)">${comp ? 'ala comprimida' : 'ala traccionada'}</text>` : '';
  return `<svg viewBox="0 0 280 96" style="width:100%; max-width:300px; margin-top:8px;" role="img" aria-label="Sección de la viga con la losa ${inv ? 'abajo' : 'arriba'}">
    <rect x="${web.x}" y="${webY}" width="${web.w}" height="${inv ? 64 : 62}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>${flange}${tag}
    <text x="150" y="${inv ? 30 : 76}" font-size="10.5" fill="var(--ink-soft)">${inv ? 'viga invertida' : 'viga convencional'}</text></svg>`;
}

function schemeSVG(kind) {
  const w = 300;
  const body = kind === 'cantilever'
    ? `<rect x="30" y="50" width="12" height="46" fill="var(--ink-soft)"/><rect x="42" y="64" width="218" height="14" fill="none" stroke="var(--ink)" stroke-width="2"/>
       ${Array.from({ length: 11 }, (_, i) => `<line x1="${50 + i * 20}" y1="28" x2="${50 + i * 20}" y2="60" stroke="var(--accent)" stroke-width="1.5"/>`).join('')}<line x1="48" y1="28" x2="252" y2="28" stroke="var(--accent)" stroke-width="1.5"/>`
    : `<rect x="40" y="64" width="220" height="14" fill="none" stroke="var(--ink)" stroke-width="2"/>
       <polygon points="40,78 30,96 50,96" fill="none" stroke="var(--ink)" stroke-width="2"/><polygon points="260,78 250,96 270,96" fill="none" stroke="var(--ink)" stroke-width="2"/><line x1="244" y1="98" x2="276" y2="98" stroke="var(--ink)" stroke-width="2"/>
       ${Array.from({ length: 11 }, (_, i) => `<line x1="${50 + i * 20}" y1="28" x2="${50 + i * 20}" y2="60" stroke="var(--accent)" stroke-width="1.5"/>`).join('')}<line x1="50" y1="28" x2="250" y2="28" stroke="var(--accent)" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 ${w} 112" style="width:100%; max-width:340px; margin-top:6px;" role="img" aria-label="Esquema de la viga con carga uniforme">${body}
    <text x="${w / 2}" y="16" text-anchor="middle" font-size="11" fill="var(--ink-soft)">carga uniformemente distribuida</text></svg>`;
}

// ---------------- paso 2: predimensionado ----------------
function stepPredim(calc) {
  const beam = calc.element === 'beam';
  const p = predim(calc);
  if (!p) return '<div class="card"><div class="empty-state">Completá la luz en el paso 1.</div></div>';
  const cur = Number(calc.section.h);
  const rec = p.recommended / 10;
  const sectionFields = beam
    ? `${numField('section.b', 'Ancho de la viga b', calc.section.b, { unit: 'cm', hint: 'A criterio del proyectista (la norma no fija un ancho).' })}${numField('section.h', 'Altura h', calc.section.h, { unit: 'cm' })}`
    : numField('section.h', 'Espesor h', calc.section.h, { unit: 'cm' });
  const m = calc.materials;
  return `
    <div class="grid grid-2" style="align-items:start;">
      <div class="card">
        <h3 style="margin-top:0;">Materiales y sección</h3>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c} (${c} MPa)`]))}
          ${beam ? selField('materials.rebar', 'Acero de las barras', m.rebar, Object.entries(N.rebar).map(([k, v]) => [k, v.label])) : ''}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">${sectionFields}</div>
        <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">${beam ? `Sección actual: ${fmt(calc.section.b, 0)} × ${fmt(cur, 0)} cm.` : `Espesor actual: ${fmt(cur, 0)} cm.`}</p>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Alturas mínimas</h3>
        <table class="data-table"><tbody>
          <tr><td>Por deformaciones, Tabla 9.5.a)<br><span class="text-muted" style="font-size:11.5px;">${ARTICLES.hMin} · ${p.hMinBy ? `rige el ${escapeHtml(p.hMinBy)}` : `luz / ${N.minThicknessRatio[calc.element][calc.design.kind]}`}${calc.materials.rebar === 'AL220' && beam ? ' × (0,4 + fy/700)' : ''}</span></td><td style="text-align:right;"><b>${fmt(p.hMin / 10, 1)} cm</b></td></tr>
          <tr><td>Por flexión (sección controlada por tracción, εt ≥ 0,005)<br><span class="text-muted" style="font-size:11.5px;">Mu estimado ${fmt(p.M, 1)} kN·m${beam ? '' : '/m'} · d mín ${fmt(p.dMin / 10, 1)} cm · supone barras ø${p.assumedDb} y recubrimiento ${p.cover} mm</span></td><td style="text-align:right;"><b>${fmt(p.hFlex / 10, 1)} cm</b></td></tr>
          <tr><td><b>Altura sugerida</b> (la mayor, redondeada a ${beam ? '5' : '1'} cm)</td><td style="text-align:right;"><b>${fmt(rec, 0)} cm</b></td></tr>
        </tbody></table>
        <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-use-h="${rec}" ${Math.abs(cur - rec) < 1e-9 ? 'disabled' : ''}>Usar ${fmt(rec, 0)} cm</button>
          ${cur < p.hMin / 10 - 1e-9 ? `<span class="tag tag-media">La altura actual es menor que la de la Tabla 9.5.a): hay que verificar la flecha por cálculo (paso 3).</span>` : '<span class="tag tag-freelance">No exige verificar flechas por tabla</span>'}
        </div>
        <p class="text-muted" style="font-size:12px; margin:10px 0 0;">La Tabla 9.5.a) se aplica a elementos que no soportan tabiques u otros elementos dañables por grandes flechas (art. 9.5.2.1). En el paso 3 la flecha se verifica igual por cálculo.</p>
      </div>
    </div>`;
}

// ---------------- paso 3: dimensionado ----------------
function stepDim(calc, out) {
  const beam = calc.element === 'beam';
  const m = calc.materials;
  const v = calc.verification;
  const inputs = `
    <div class="card">
      <h3 style="margin-top:0;">Datos de dimensionado</h3>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c}`]))}
        ${beam ? selField('materials.rebar', 'Barras', m.rebar, Object.entries(N.rebar).map(([k, x]) => [k, x.label])) : '<div class="field"><label>Barras</label><input value="ADN 420" disabled /></div>'}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${beam ? numField('section.b', 'b', calc.section.b, { unit: 'cm' }) : ''}
        ${numField('section.h', beam ? 'h' : 'Espesor h', calc.section.h, { unit: 'cm' })}
      </div>
      ${beam ? `<div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.stirrup', 'Estribos', m.stirrup, Object.entries(N.rebar).map(([k, x]) => [k, x.label]))}
        ${selField('materials.dStirrup', 'Diámetro de estribo', m.dStirrup, [6, 8, 10, 12].map((x) => [x, `ø${x} mm`]))}
        ${numField('materials.dagg', 'Tamaño máx. del agregado', m.dagg, { unit: 'mm', hint: 'Define la separación libre mínima (art. 7.6.1).' })}
      </div>` : ''}
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.placement', 'Ubicación', m.placement, Object.entries(N.placement).map(([k, x]) => [k, x.label]), ARTICLES.cover)}
        ${selField('materials.exposure', 'Clase de exposición', m.exposure, Object.entries(N.exposure).map(([k, x]) => [k, x.label]))}
      </div>
      ${isCont(calc) ? '<p class="text-muted" style="font-size:12px; margin:0;">Las flechas de una viga o losa continua se verifican con la altura mínima de la Tabla 9.5.a) (art. 9.5.2.1).</p>' : `<div class="field-row" style="flex-wrap:wrap;">
        ${selField('verification.limitKey', 'Límite de flecha (Tabla 9.5.b)', v.limitKey, Object.entries(N.deflectionLimits).map(([k, x]) => [k, `${x.label} — l/${x.ratio}`]))}
        ${selField('verification.xi', 'Duración de la carga permanente', v.xi, N.timeFactor.map((t) => [t.xi, `${t.label} (ξ = ${t.xi})`]), 'Art. 9.5.2.5.')}
      </div>`}
    </div>`;
  if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
  return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${resultsHTML(calc, out)}</div></div>`;
}

function resultsHTML(calc, out) {
  if (out.cont) return contResultsHTML(calc, out);
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const u = beam ? 'kN/m' : 'kN/m²';
  let h = `<div class="card" style="margin-bottom:16px;">
    <h3 style="margin-top:0;">Cargas y solicitaciones</h3>
    <table class="data-table"><tbody>
      <tr><td>Peso propio</td><td style="text-align:right;">${fmt(res.self, 2)} ${u}</td></tr>
      <tr><td>Carga permanente total D</td><td style="text-align:right;">${fmt(res.D, 2)} ${u}</td></tr>
      <tr><td>Sobrecarga L</td><td style="text-align:right;">${fmt(input.Lv, 2)} ${u}</td></tr>
      <tr><td>wu = ${res.combos.governing}</td><td style="text-align:right;"><b>${fmt(res.combos.wu, 2)} ${u}</b></td></tr>
      <tr><td>Mu (${res.mSign})</td><td style="text-align:right;"><b>${fmt(res.Mu, 2)} kN·m${beam ? '' : '/m'}</b></td></tr>
      <tr><td>Vu</td><td style="text-align:right;"><b>${fmt(res.Vu, 2)} kN${beam ? '' : '/m'}</b></td></tr>
    </tbody></table>
    <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">${ARTICLES.combos}. El corte se toma en el eje del apoyo (del lado de la seguridad; art. 11.1.3.1 permite reducirlo a d de la cara).</p>
  </div>`;
  h += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${figureOf(calc, out, 'screen')}</div>`;

  if (!res.chosen) {
    return `${h}<div class="card"><span class="tag tag-alta">No verifica</span><p style="margin:10px 0 0;">${escapeHtml(res.reason || 'No se encontró una armadura que verifique.')}</p></div>`;
  }
  const c = res.chosen;
  const optRows = res.options.slice(0, 8).map((o) => {
    const val = beam ? `${o.db}:${o.n}` : `${o.db}:${o.s}`;
    const label = beam ? `${o.n} ø${o.db}${o.layers === 2 ? ' (2 capas)' : ''}` : `ø${o.db} c/${o.s / 10} cm`;
    const sel = beam ? (c.db === o.db && c.n === o.n) : (c.db === o.db && c.s === o.s);
    return `<label class="chk-row" style="padding:5px 0;"><input type="radio" name="bars" data-chosen value="${val}" ${sel ? 'checked' : ''} />
      <span><b>${label}</b> — As = ${fmt(o.As, 0)} mm²${beam ? '' : '/m'} (necesaria ${fmt(o.AsReq, 0)}) · φMn = ${fmt(o.strength.phiMn / 1e6, 1)} kN·m</span></label>`;
  }).join('');

  h += `<div class="card" style="margin-bottom:16px;">
    <h3 style="margin-top:0;">Flexión y armadura</h3>
    <table class="data-table"><tbody>
      ${res.flange ? `<tr><td>Sección (art. 8.10)</td><td style="text-align:right;">${res.section === 'inv' ? 'Invertida' : 'Convencional'}, ${res.flange.comp ? 'ala comprimida' : 'ala traccionada'}${c.strength.tee ? ' · bloque en el alma (T)' : ''}</td></tr>
      <tr><td>Ancho efectivo del ala bf · espesor hf</td><td style="text-align:right;">${fmt(res.flange.bf, 0)} mm · ${fmt(res.flange.hf, 0)} mm</td></tr>` : ''}
      <tr><td>Recubrimiento mínimo (${ARTICLES.cover})</td><td style="text-align:right;">${c.cover} mm</td></tr>
      <tr><td>Altura útil d</td><td style="text-align:right;">${fmt(c.d, 1)} mm</td></tr>
      <tr><td>As por cálculo</td><td style="text-align:right;">${fmt(c.AsCalc, 0)} mm²${beam ? '' : '/m'}</td></tr>
      <tr><td>As mínima (${beam ? ARTICLES.asMin : ARTICLES.asMinSlab})</td><td style="text-align:right;">${fmt(c.asMin, 0)} mm²${beam ? '' : '/m'}</td></tr>
      <tr><td>Deformación de tracción εt · φ</td><td style="text-align:right;">${fmt(c.strength.epsT, 4)} · ${fmt(c.strength.phi, 2)}</td></tr>
    </tbody></table>
    <h4 style="margin:14px 0 2px; font-size:13px;">Elegí la armadura</h4>${beam ? '' : '<p class="text-muted" style="font-size:11.5px; margin:0 0 6px;">Se muestran separaciones de 10 cm o más (criterio constructivo); el reglamento exige además s ≤ 2,5 h, 25 db y 300 mm (art. 7.6.5).</p>'}${optRows}
    ${beam ? sectionSVG({ b: input.b, h: input.h, cover: c.cover, dSt: input.dStirrup, db: c.db, n: c.n, n1: c.n1, n2: c.n2, layers: c.layers, top: input.kind === 'cantilever', flange: res.flange, flangeTop: res.section !== 'inv' }) : ''}
  </div>`;

  if (beam) {
    const s = res.shear;
    h += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Corte</h3>
      <table class="data-table"><tbody>
        <tr><td>φVc (${ARTICLES.shearVc})</td><td style="text-align:right;">${fmt(s.phiVc / 1000, 1)} kN</td></tr>
        <tr><td>Vu</td><td style="text-align:right;">${fmt(s.Vu / 1000, 1)} kN</td></tr>
        ${s.stirrups ? `<tr><td>Vs necesario</td><td style="text-align:right;">${fmt(s.VsReq / 1000, 1)} kN</td></tr>
        <tr><td>Separación máxima (${ARTICLES.shearSpacing})</td><td style="text-align:right;">${fmt(s.sMax, 0)} mm</td></tr>
        <tr><td>Separación por armadura mínima (${ARTICLES.shearMin})</td><td style="text-align:right;">${fmt(s.sAvMin, 0)} mm</td></tr>
        <tr><td><b>Estribos adoptados</b> (rige ${s.governs})</td><td style="text-align:right;"><b>ø${input.dStirrup} c/${fmt(s.s / 10, 0)} cm</b></td></tr>` : `<tr><td colspan="2" class="text-muted">${escapeHtml(s.note || s.reason || '')}</td></tr>`}
      </tbody></table>
      ${s.ok ? '' : `<p style="margin:8px 0 0;"><span class="tag tag-alta">No verifica</span> ${escapeHtml(s.reason)}</p>`}
    </div>`;
  }

  h += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Armado: dónde va el hierro</h3>${armadoOf(calc, out, 'screen')}</div>`;

  const dfl = res.deflection;
  const dc = res.deflectionCheck;
  h += `<div class="card" style="margin-bottom:16px;">
    <h3 style="margin-top:0;">Flechas</h3>
    <table class="data-table"><tbody>
      <tr><td>Inercia efectiva Ie / Ig (${ARTICLES.deflection})</td><td style="text-align:right;">${fmt(dfl.Ie / dfl.Ig, 2)}</td></tr>
      <tr><td>Flecha instantánea por D</td><td style="text-align:right;">${fmt(dfl.instD, 1)} mm</td></tr>
      <tr><td>Flecha instantánea por L</td><td style="text-align:right;">${fmt(dfl.instL, 1)} mm</td></tr>
      <tr><td>Flecha diferida por D (λ = ${fmt(dfl.lambda, 1)})</td><td style="text-align:right;">${fmt(dfl.longD, 1)} mm</td></tr>
      <tr><td><b>${dc.uses === 'L' ? 'Flecha por L' : 'Flecha diferida por D + instantánea por L'}</b><br><span class="text-muted" style="font-size:11.5px;">Límite: ${escapeHtml(dc.label)} (l/${dc.ratio})</span></td><td style="text-align:right;"><b>${fmt(dc.value, 1)} mm</b> / ${fmt(dc.limit, 1)} mm</td></tr>
    </tbody></table>
  </div>`;

  h += checksCard(res);
  return h;
}

// ---------------- gráficos
// Esquema de cargas, reacciones y diagramas de corte y momento con los valores que se adoptan para verificar.
function figureOf(calc, out, pal) {
  const { res, input } = out;
  const beam = calc.element === 'beam';
  return beamFigure({
    kind: input.kind, L: input.L, wD: res.D, wL: input.Lv, wu: res.combos.wu, Mu: res.Mu, Vu: res.Vu,
    dMm: res.chosen ? res.chosen.d : 0, loadUnit: beam ? 'kN/m' : 'kN/m² (franja de 1 m)', mUnit: beam ? 'kN·m' : 'kN·m/m', vUnit: beam ? 'kN' : 'kN/m', pal,
    note: beam ? 'Mu define la armadura longitudinal (flexión); Vu, la verificación del corte y la separación de estribos.' : 'Mu define la armadura principal de la losa; Vu se compara con φVc (la losa no lleva estribos).',
  });
}

// ---------------- viga o losa continua: resultados, figura y memoria ----------------
const barsOf = (beam, c) => (!c ? null : beam ? { n: c.n, db: c.db, layers: c.layers, n1: c.n1, n2: c.n2 } : { txt: `ø${c.db} c/${fmt(c.s / 10, c.s % 10 ? 1 : 0)} cm`, db: c.db, s: c.s });

function contFigure(calc, out, pal) {
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const off = input.cantL > 0 ? 1 : 0;
  const members = res.members.map((m) => ({ type: m.type, L: m.L, wu: res.combos.wu, d: m.d, vA: m.vA, vB: m.vB, pos: m.type === 'span' ? barsOf(beam, m.pos) : null, shearAt: m.shearAt }));
  const supports = res.supports.map((sp, q) => ({ at: off + q, fixed: sp.fixed, name: LETTER(q), top: barsOf(beam, sp.bars), Ru: sp.Ru }));
  const anyBars = res.members.find((m) => m.pos) || null;
  const nS = input.spans.length;
  return armadoMembersFigure({
    pal, slab: !beam, dSt: input.dStirrup, members, supports, curves: res.members.map((m) => ({ pts: m.pts })),
    title: `${beam ? `Viga ${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm` : `Losa de ${fmt(input.h / 10, 0)} cm (franja de 1 m)`} continua · ${nS} tramo${nS === 1 ? '' : 's'}${input.cantL > 0 || input.cantR > 0 ? ' con voladizo' : ''}`,
    unit: beam ? { w: 'kN/m', m: 'kN·m', v: 'kN' } : { w: 'kN/m²', m: 'kN·m/m', v: 'kN/m' },
    dist: !beam && anyBars && anyBars.pos ? distributionBars({ asMin: anyBars.pos.asMin, sMax: anyBars.pos.sMaxTemp }) : null,
  });
}

function contTables(calc, out) {
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const u = beam ? { m: 'kN·m', v: 'kN' } : { m: 'kN·m/m', v: 'kN/m' };
  const bt = (c) => (c ? (beam ? `${c.n} ø${c.db}${c.layers === 2 ? ' (2 capas)' : ''}` : `ø${c.db} c/${fmt(c.s / 10, c.s % 10 ? 1 : 0)} cm`) : '—');
  const shearTxt = (m) => (beam ? (m.shear.stirrups ? `ø${input.dStirrup} c/${fmt(m.shear.s / 10, 0)} cm` : (m.shear.ok ? 'mínimos / ninguno' : '✗')) : (m.shear.ok ? `φVc = ${fmt(m.shear.phiVc, 1)} ≥ Vu` : '✗'));
  const supName = (q) => `${LETTER(q)}${res.supports[q].fixed ? ' (empotrado)' : ''}`;
  let spanNo = 0;
  const memRows = res.members.map((m) => {
    const lab = m.type === 'span' ? `Tramo ${++spanNo} (${LETTER(m.supL)}–${LETTER(m.supR)})` : (m.type === 'cantL' ? `Voladizo izquierdo (${LETTER(0)})` : `Voladizo derecho (${LETTER(input.spans.length)})`);
    return `<tr><td>${lab}</td><td style="text-align:right;">${fmt(m.L, 2)} m</td><td style="text-align:right;">${m.type === 'span' ? fmt(m.posM, 1) : '—'}</td><td>${m.type === 'span' ? bt(m.pos) : '—'}</td><td style="text-align:right;">${fmt(Math.max(Math.abs(m.vA), Math.abs(m.vB)), 1)}</td><td>${shearTxt(m)}</td></tr>`;
  }).join('');
  const supRows = res.supports.map((sp, q) => `<tr><td>${supName(q)}</td><td style="text-align:right;">${fmt(sp.negM, 1)}</td><td>${sp.bars ? bt(sp.bars) : '<span class="text-muted">no hace falta (solo montaje)</span>'}</td><td style="text-align:right;">${fmt(sp.Ru, 1)}</td></tr>`).join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Miembro</th><th style="text-align:right;">Luz</th><th style="text-align:right;">Mu⁺ (${u.m})</th><th>Armadura inferior</th><th style="text-align:right;">Vu (${u.v})</th><th>${beam ? 'Estribos' : 'Corte'}</th></tr></thead><tbody>${memRows}</tbody></table></div>
    <div class="table-wrap" style="margin-top:10px;"><table class="data-table"><thead><tr><th>Apoyo</th><th style="text-align:right;">Mu⁻ (${u.m})</th><th>Armadura superior</th><th style="text-align:right;">Ru (${u.v})</th></tr></thead><tbody>${supRows}</tbody></table></div>`;
}

function contResultsHTML(calc, out) {
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const u = beam ? 'kN/m' : 'kN/m²';
  let h = `<div class="card" style="margin-bottom:16px;">
    <h3 style="margin-top:0;">Cargas y análisis</h3>
    <table class="data-table"><tbody>
      <tr><td>Peso propio</td><td style="text-align:right;">${fmt(res.self, 2)} ${u}</td></tr>
      <tr><td>Carga permanente total D</td><td style="text-align:right;">${fmt(res.D, 2)} ${u}</td></tr>
      <tr><td>Sobrecarga L</td><td style="text-align:right;">${fmt(input.Lv, 2)} ${u}</td></tr>
      <tr><td>wu = ${res.combos.governing}</td><td style="text-align:right;"><b>${fmt(res.combos.wu, 2)} ${u}</b></td></tr>
    </tbody></table>
    <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">${ARTICLES.combos}. Análisis elástico de rigidez constante (art. 8.3.1) con la sobrecarga alternada tramo por tramo y por voladizo: los momentos y cortes son las envolventes. Las reacciones Ru son las cargas mayoradas que llegan a cada apoyo.</p>
  </div>`;
  h += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Armado: dónde va el hierro</h3>${contFigure(calc, out, 'screen')}</div>`;
  h += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Armadura por tramo y por apoyo</h3>${contTables(calc, out)}
    <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">Se adopta en cada sección la armadura de menor exceso que verifica la flexión, la armadura mínima y εt ≥ 0,004 (art. 10.5 y 10.3.4)${beam ? ' y entra en el ancho de la viga' : `; separación máxima 2,5 h, 25 db y 300 mm (art. 7.6.5)`}. ${beam ? 'Los estribos de cada tramo se adoptan con el corte mayor de sus apoyos; el dibujo los separa más en el centro.' : 'La losa no lleva estribos: Vu se compara con φVc.'}</p></div>`;
  h += checksCard(res);
  return h;
}

function openMemoriaCont(calc, out) {
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const u = beam ? 'kN/m' : 'kN/m²';
  const row = (a, b2, art = '') => `<tr><td>${a}${art ? `<br><span class="mem-art">${art}</span>` : ''}</td><td style="text-align:right; white-space:nowrap;">${b2}</td></tr>`;
  const g = { spans: input.spans, cantL: input.cantL, cantR: input.cantR };
  const nS = input.spans.length;
  const apoyos = res.supports.map((sp, q) => `${LETTER(q)}: ${sp.fixed ? 'empotrado' : 'apoyo simple'}`).join(' · ');
  openMemoriaDoc({
    title: calc.name,
    sub: `${beam ? 'Viga' : 'Losa en una dirección'} continua de hormigón armado · ${nS} tramo${nS === 1 ? '' : 's'}${g.cantL > 0 || g.cantR > 0 ? ' con voladizo' : ''}`,
    html: `
      <h2>1. Datos</h2>
      <table>${row('Hormigón', `H-${input.fc} (f'c = ${input.fc} MPa)`)}${row('Acero de barras', beam ? `${N.rebar[calc.materials.rebar].label}, fy = ${input.fy} MPa` : 'ADN 420, fy = 420 MPa')}
        ${beam ? row('Sección', `${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm (rectangular)`) : row('Espesor', `${fmt(input.h / 10, 0)} cm (franja de 1 m)`)}
        ${row('Luces', `${g.cantL > 0 ? `voladizo ${fmt(g.cantL, 2)} m + ` : ''}${g.spans.map((l) => fmt(l, 2)).join(' m + ')} m${g.cantR > 0 ? ` + voladizo ${fmt(g.cantR, 2)} m` : ''}`, 'CIRSOC 201 art. 8.7.1')}
        ${row('Apoyos', apoyos)}
        ${row('Carga permanente sin peso propio', `${fmt(input.D0, 2)} ${u}`, ARTICLES.loads)}${row('Sobrecarga', `${fmt(input.Lv, 2)} ${u}`, 'CIRSOC 101, Tabla 4.1')}</table>
      <h2>2. Cargas y análisis</h2>
      <table>${row('Peso propio', `${fmt(res.self, 2)} ${u}`, `γ hormigón armado = ${N.gammaRC} kN/m³`)}${row('D total', fmt(res.D, 2))}${row(`wu = ${res.combos.governing}`, fmt(res.combos.wu, 2), ARTICLES.combos)}
        ${row('Método', 'Análisis elástico de rigidez constante, sobrecarga alternada por tramos y voladizos (envolvente)', 'CIRSOC 201 art. 8.3.1 y 8.9.2')}</table>
      <h2>3. Armado y esfuerzos</h2>
      ${contTables(calc, out).replace(/class="table-wrap"/g, '')}
      ${contFigure(calc, out, 'print')}
      <h2>4. Verificaciones</h2>
      <table>${res.checks.map((k) => row(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('')}</table>
      <p class="mem-sub">Alcance: sección rectangular; armadura simple; no se calcula la flecha (se verifica la altura mínima de la Tabla 9.5.a)); las longitudes de anclaje y empalme se verifican en el despiece.</p>`,
  });
}

// Armado en elevación (vigas y franja de losa en una dirección): barras, estribos, esquema de cálculo y diagramas.
function armadoOf(calc, out, pal) {
  const { res, input } = out;
  const c = res.chosen;
  if (!c) return '';
  const beam = calc.element === 'beam';
  const cant = input.kind === 'cantilever';
  const wu = res.combos.wu;
  const bars = beam ? { n: c.n, db: c.db, layers: c.layers, n1: c.n1, n2: c.n2 } : { txt: `ø${c.db} c/${fmt(c.s / 10, c.s % 10 ? 1 : 0)} cm`, db: c.db, s: c.s };
  const span = { L: input.L, wu, d: c.d, vL: res.Vu, vR: cant ? 0 : res.Vu, pos: cant ? null : bars, negL: cant ? bars : null, negR: null };
  if (beam) span.shearAt = (V) => rc.shearDesign({ Vu: V * 1000, b: input.b, d: c.d, h: input.h, fc: input.fc, fyt: input.fyt, dStirrup: input.dStirrup });
  const sec = beam ? `${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm` : `espesor ${fmt(input.h / 10, 0)} cm`;
  return armadoFigure({
    pal, kind: cant ? 'cantilever' : 'continuous', slab: !beam,
    title: `${beam ? 'Viga' : 'Losa'} ${cant ? 'en voladizo' : 'simplemente apoyada'} · ${sec} · luz ${fmt(input.L, 2)} m`,
    spans: [span], names: cant ? [] : ['A', 'B'], dSt: input.dStirrup,
    curves: [simpleCurves({ L: input.L, wu, cantilever: cant })],
    reactions: cant ? null : [res.Vu, res.Vu],
    unit: beam ? { w: 'kN/m', m: 'kN·m', v: 'kN' } : { w: 'kN/m²', m: 'kN·m/m', v: 'kN/m' },
    dist: beam ? null : distributionBars({ asMin: c.asMin, sMax: c.sMaxTemp }),
  });
}

function sectionSVG({ b, h, cover, dSt, db, n, n1, n2, layers, top, flange = null, flangeTop = true }) {
  const wide = flange ? Math.max(b, flange.bf) : b;
  const hf0 = flange ? flange.hf : 0;
  const scale = Math.min(190 / wide, 210 / (h + (flange && !flangeTop ? 0 : 0)));
  const W = b * scale;
  const H = h * scale;
  const ox = 20 + (flange ? (wide - b) / 2 * scale : 0);
  const oy = 10;
  const flangeSvg = flange ? `<rect x="${20}" y="${flangeTop ? oy : oy + H - hf0 * scale}" width="${flange.bf * scale}" height="${hf0 * scale}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>
    <text x="${20 + flange.bf * scale / 2}" y="${flangeTop ? oy - 1 : oy + H + 23}" font-size="10" text-anchor="middle" fill="var(--ink-soft)">bf = ${fmt(flange.bf / 10, 0)} cm</text>` : '';
  const c = cover * scale;
  const st = dSt * scale;
  const r = db * scale / 2;
  const inner = (cover + dSt + db / 2) * scale;
  const barY = top ? oy + inner : oy + H - inner;
  const row = (cnt) => (cnt === 1 ? [ox + W / 2] : Array.from({ length: cnt }, (_, i) => ox + inner + i * (W - 2 * inner) / (cnt - 1)));
  const first = layers === 2 ? n1 : n;
  const xs = row(first);
  const gap = (db + Math.max(25, db)) * scale;
  const barY2 = top ? barY + gap : barY - gap;
  const xs2 = layers === 2 && n2 > 0 ? row(n2) : [];
  return `<svg viewBox="0 0 ${20 + wide * scale + 160} ${H + 36}" style="width:100%; max-width:420px; margin-top:12px;" role="img" aria-label="Sección transversal con la armadura elegida">
    ${flangeSvg}
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="${flange ? 'none' : 'var(--line-soft)'}" stroke="var(--ink)" stroke-width="1.5"/>
    <rect x="${ox + c + st / 2}" y="${oy + c + st / 2}" width="${W - 2 * c - st}" height="${H - 2 * c - st}" fill="none" stroke="var(--ink-soft)" stroke-width="${Math.max(1, st)}"/>
    ${xs.map((x) => `<circle cx="${x}" cy="${barY}" r="${Math.max(2, r)}" fill="var(--ink)"/>`).join('')}
    ${xs2.map((x) => `<circle cx="${x}" cy="${barY2}" r="${Math.max(2, r)}" fill="var(--ink)"/>`).join('')}
    <text x="${20 + wide * scale + 14}" y="${oy + 14}" font-size="11" fill="var(--ink)">${n} ø${db}${layers === 2 ? ' (2 capas)' : ''}</text>
    <text x="${20 + wide * scale + 14}" y="${oy + 30}" font-size="10.5" fill="var(--ink-soft)">${top ? 'arriba (voladizo)' : 'abajo'}</text>
    <text x="${ox + W / 2}" y="${oy + H + (flange && !flangeTop ? 34 : 15)}" font-size="10.5" fill="var(--ink-soft)" text-anchor="middle">b = ${fmt(b / 10, 0)} cm</text>
    <text x="${20 + wide * scale + 14}" y="${oy + H / 2 + 28}" font-size="10.5" fill="var(--ink-soft)">h = ${fmt(h / 10, 0)} cm</text></svg>`;
}

// ---------------- memoria de cálculo ----------------
function openMemoria(calc, out) {
  if (out.cont) { openMemoriaCont(calc, out); return; }
  const { res, input } = out;
  const beam = calc.element === 'beam';
  const c = res.chosen;
  const row = (a, b2, art = '') => `<tr><td>${a}${art ? `<br><span class="mem-art">${art}</span>` : ''}</td><td style="text-align:right; white-space:nowrap;">${b2}</td></tr>`;
  openMemoriaDoc({
    title: calc.name,
    sub: `${ELEMENTS[calc.element].label} · ${rc.SUPPORTS[input.kind].label.toLowerCase()} · luz ${fmt(input.L, 2)} m`,
    html: `
      <h2>1. Datos</h2>
      <table>${row("Hormigón", `H-${input.fc} (f'c = ${input.fc} MPa)`)}${row('Acero de barras', beam ? `${N.rebar[calc.materials.rebar].label}, fy = ${input.fy} MPa` : 'ADN 420, fy = 420 MPa')}
        ${beam ? row('Sección', `${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm${res.flange ? ` · viga ${res.section === 'inv' ? 'invertida' : 'convencional'}` : ''}`) : row('Espesor', `${fmt(input.h / 10, 0)} cm (franja de 1 m)`)}
        ${res.flange ? row('Ala de la losa', `bf = ${fmt(res.flange.bf, 0)} mm, hf = ${fmt(res.flange.hf, 0)} mm — ${res.flange.comp ? 'comprimida, colabora' : 'traccionada, no colabora'}`, `CIRSOC 201 art. 8.10.${res.flange.pos === 'L' ? '3' : '2'}${res.flange.asMinB ? '; As,mín con 2 bw o bf (art. 10.5.2)' : ''}`) : ''}
        ${row('Carga permanente sin peso propio', `${fmt(input.D0, 2)} ${beam ? 'kN/m' : 'kN/m²'}`, ARTICLES.loads)}${row('Sobrecarga', `${fmt(input.Lv, 2)} ${beam ? 'kN/m' : 'kN/m²'}`, 'CIRSOC 101, Tabla 4.1')}</table>
      <h2>2. Cargas y solicitaciones</h2>
      <table>${row('Peso propio', `${fmt(res.self, 2)} ${beam ? 'kN/m' : 'kN/m²'}`, `γ hormigón armado = ${N.gammaRC} kN/m³`)}${row('D total', fmt(res.D, 2))}
        ${row(`wu = ${res.combos.governing}`, fmt(res.combos.wu, 2), ARTICLES.combos)}${row('Mu', `${fmt(res.Mu, 2)} kN·m${beam ? '' : '/m'}`, res.mSign)}${row('Vu', `${fmt(res.Vu, 2)} kN${beam ? '' : '/m'}`)}</table>
      ${figureOf(calc, out, 'print')}
      <h2>3. Flexión</h2>
      <table>${row('Recubrimiento', `${c.cover} mm`, ARTICLES.cover)}${row('Altura útil d', `${fmt(c.d, 1)} mm`)}${row('As por cálculo (φ variable según εt)', `${fmt(c.AsCalc, 0)} mm²`, `${ARTICLES.block}; ${ARTICLES.phi}`)}
        ${row('As mínima', `${fmt(c.asMin, 0)} mm²`, beam ? ARTICLES.asMin : ARTICLES.asMinSlab)}${row('Armadura adoptada', beam ? `${c.n} ø${c.db}` : `ø${c.db} c/${c.s / 10} cm`)}${row('As adoptada', `${fmt(c.As, 0)} mm²`)}
        ${row('φMn', `${fmt(c.strength.phiMn / 1e6, 2)} kN·m`, `εt = ${fmt(c.strength.epsT, 4)}, φ = ${fmt(c.strength.phi, 2)} (${ARTICLES.eps})`)}
        ${beam ? row('Separación libre mínima entre barras', `${fmt(c.smin, 1)} mm`, ARTICLES.spacingBeam) : row('Separación máxima de la armadura principal', `${fmt(c.sMax, 0)} mm`, ARTICLES.spacingSlab)}</table>
      <h2>4. Corte</h2>
      <table>${row('φVc', `${fmt(res.shear.phiVc / 1000, 1)} kN${beam ? '' : '/m'}`, `Vc = (√f'c / 6) bw d — ${ARTICLES.shearVc}`)}${row('Vu', `${fmt(res.Vu, 1)} kN${beam ? '' : '/m'}`)}
        ${beam && res.shear.stirrups ? row('Estribos', `ø${input.dStirrup} c/${fmt(res.shear.s / 10, 0)} cm`, `${ARTICLES.shearVs}; ${ARTICLES.shearSpacing}; ${ARTICLES.shearMin}`) : row('Armadura de corte', beam ? 'no requerida por cálculo' : 'no requerida (losa sin estribos)')}</table>
      <h2>5. Armado</h2>
      ${armadoOf(calc, out, 'print')}
      <h2>6. Flechas</h2>
      <table>${row('Ec = 4700 √f\'c', `${fmt(N.Ec(input.fc), 0)} MPa`, 'CIRSOC 201 art. 8.5.1')}${row('Ie / Ig', fmt(res.deflection.Ie / res.deflection.Ig, 2), ARTICLES.deflection)}
        ${row('Flecha instantánea por L', `${fmt(res.deflection.instL, 1)} mm`)}${row('Flecha diferida por D (λ = ξ, ρ\' = 0)', `${fmt(res.deflection.longD, 1)} mm`, 'ec. (9-11)')}
        ${row(`Verificación: ${res.deflectionCheck.label}`, `${fmt(res.deflectionCheck.value, 1)} ≤ ${fmt(res.deflectionCheck.limit, 1)} mm (l/${res.deflectionCheck.ratio})`, 'Tabla 9.5.b)')}</table>
      <h2>7. Verificaciones</h2>
      <table>${res.checks.map((k) => row(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('')}</table>`,
  });
}
