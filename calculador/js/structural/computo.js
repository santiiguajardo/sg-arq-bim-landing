// Cómputo de materiales de las estructuras: planilla por perfil, resumen por función, hormigón y armaduras.
// Cada elemento tiene un "armador" que, con los datos del cálculo y su resultado, devuelve las piezas (perfil, cantidad, longitud);
// acá se suman pesos, se agrupan por perfil y por función y se arma la tabla que va a la memoria (mismo PDF con la marca).
// Los pesos salen de la longitud de cada pieza por el peso por metro del perfil (tablas de la app); no se suponen desperdicios.

export const BAR_LEN = 12;                       // largo comercial de las barras y los caños (m)

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const f2 = (v) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f1 = (v) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });

// Pieza de acero: n piezas de largo len (m) con peso kgm (kg/m). `kg` se puede dar directo cuando el motor ya calculó el peso.
export function steel(fn, desc, perfil, n, len, kgm, kg = null) {
  const total = n * len;
  return { fn, desc, perfil, n, len, total, kgm, kg: kg != null ? kg : total * kgm };
}

// Resultado de un armador: { title, rows:[steel…], area:{cubierta, planta}, concrete:[{desc, n, vol, kgSteel}], notes:[] }
export function summarize(c) {
  const rows = c.rows.filter((r) => r && r.n > 0 && (r.kg > 0 || r.total > 0));
  const byProfile = new Map();
  rows.forEach((r) => {
    const k = r.perfil;
    const cur = byProfile.get(k) || { perfil: k, n: 0, total: 0, kg: 0, fns: new Set(), kgm: r.kgm };
    cur.n += r.n; cur.total += r.total; cur.kg += r.kg; cur.fns.add(r.fn);
    byProfile.set(k, cur);
  });
  const byFn = new Map();
  rows.forEach((r) => {
    const cur = byFn.get(r.fn) || { fn: r.fn, n: 0, total: 0, kg: 0 };
    cur.n += r.n; cur.total += r.total; cur.kg += r.kg;
    byFn.set(r.fn, cur);
  });
  const kgSteel = rows.reduce((s, r) => s + r.kg, 0);
  const conc = c.concrete || [];
  return {
    ...c, rows, kgSteel,
    profiles: [...byProfile.values()].sort((a, b) => b.kg - a.kg),
    functions: [...byFn.values()].sort((a, b) => b.kg - a.kg),
    vol: conc.reduce((s, x) => s + x.vol * (x.n || 1), 0),
    kgBars: conc.reduce((s, x) => s + (x.kgSteel || 0) * (x.n || 1), 0),
  };
}

const th = (t, n = false) => `<th${n ? ' class="n"' : ''}>${t}</th>`;
const td = (t, n = false) => `<td${n ? ' class="n"' : ''}>${t}</td>`;

// HTML de la sección para la memoria (las tablas se parten por fila entre hojas).
export function computoHtml(raw) {
  const c = summarize(raw);
  if (!c.rows.length && !(c.concrete || []).length) return '';
  let h = `<h2>Cómputo de materiales</h2>`;
  h += `<p class="mem-sub">${c.title || ''} Longitudes y pesos de cada pieza según los perfiles calculados; no incluyen desperdicio de corte, uniones, soldaduras ni bulones (se definen en el detalle de cada unión).</p>`;
  if (c.rows.length) {
    h += `<table class="mem-cols mem-mass"><tr>${th('Función')}${th('Descripción')}${th('Perfil')}${th('Cant.', true)}${th('Largo (m)', true)}${th('Total (m)', true)}${th('kg/m', true)}${th('Peso (kg)', true)}</tr>`;
    c.rows.forEach((r) => { h += `<tr>${td(r.fn)}${td(r.desc)}${td(r.perfil)}${td(f0(r.n), true)}${td(f2(r.len), true)}${td(f1(r.total), true)}${td(r.kgm ? f2(r.kgm) : '—', true)}${td(f0(r.kg), true)}</tr>`; });
    h += `<tr class="mem-total">${td(c.kgSteel > 0 ? 'Total acero' : 'Total')}${td('')}${td('')}${td('', true)}${td('', true)}${td(f1(c.rows.reduce((s, r) => s + r.total, 0)), true)}${td('', true)}${td(c.kgSteel > 0 ? f0(c.kgSteel) + ' kg' : 'según catálogo', true)}</tr></table>`;
    h += `<h2>Planilla por perfil</h2><table class="mem-cols mem-mass"><tr>${th('Perfil')}${th('Se usa en')}${th('Piezas', true)}${th('Total (m)', true)}${th(`Barras de ${BAR_LEN} m`, true)}${th('Peso (kg)', true)}</tr>`;
    c.profiles.forEach((p) => { h += `<tr>${td(p.perfil)}${td([...p.fns].join(', '))}${td(f0(p.n), true)}${td(f1(p.total), true)}${td(String(Math.ceil(p.total / BAR_LEN - 1e-9)), true)}${td(f0(p.kg), true)}</tr>`; });
    h += `<tr class="mem-total">${td('Total')}${td('')}${td('', true)}${td('', true)}${td('', true)}${td(c.kgSteel > 0 ? f0(c.kgSteel) + ' kg' : 'según catálogo', true)}</tr></table>`;
    h += `<h2>Resumen por función</h2><table class="mem-cols mem-mass"><tr>${th('Función')}${th('Piezas', true)}${th('Total (m)', true)}${th('Peso (kg)', true)}${th('%', true)}</tr>`;
    c.functions.forEach((x) => { h += `<tr>${td(x.fn)}${td(f0(x.n), true)}${td(f1(x.total), true)}${td(f0(x.kg), true)}${td(c.kgSteel > 0 ? f1(100 * x.kg / c.kgSteel) : '—', true)}</tr>`; });
    h += `<tr class="mem-total">${td('Total')}${td('', true)}${td('', true)}${td(c.kgSteel > 0 ? f0(c.kgSteel) + ' kg' : 'según catálogo', true)}${td('100', true)}</tr></table>`;
  }
  if ((c.concrete || []).length) {
    h += `<h2>Hormigón y armaduras</h2><table class="mem-cols mem-mass"><tr>${th('Elemento')}${th('Cant.', true)}${th('Hormigón c/u (m³)', true)}${th('Hormigón total (m³)', true)}${th('Acero c/u (kg)', true)}${th('Acero total (kg)', true)}</tr>`;
    c.concrete.forEach((x) => { const n = x.n || 1; h += `<tr>${td(x.desc)}${td(f0(n), true)}${td(f2(x.vol), true)}${td(f2(x.vol * n), true)}${td(f1(x.kgSteel || 0), true)}${td(f0((x.kgSteel || 0) * n), true)}</tr>`; });
    h += `<tr class="mem-total">${td('Total')}${td('', true)}${td('', true)}${td(f2(c.vol) + ' m³', true)}${td('', true)}${td(f0(c.kgBars) + ' kg', true)}</tr></table>`;
  }
  const inc = [];
  if (c.area && c.area.planta > 0 && c.kgSteel > 0) inc.push(['Superficie en planta', `${f1(c.area.planta)} m²`], ['Incidencia del acero', `${f2(c.kgSteel / c.area.planta)} kg/m² en planta`]);
  if (c.area && c.area.cubierta > 0) inc.push(['Superficie de cubierta (chapa)', `${f1(c.area.cubierta)} m²`]);
  if (inc.length) {
    h += `<h2>Superficies e incidencias</h2><table>${inc.map(([a, b]) => `<tr><td>${a}</td><td style="text-align:right;">${b}</td></tr>`).join('')}</table>`;
  }
  if ((c.notes || []).length) h += `<p class="mem-foot">${c.notes.join(' ')}</p>`;
  return h;
}

// ---------------------------------------------------------------- armadores por elemento

// Nave industrial de acero (pórtico): columnas, dintel, correas y bases de todos los pórticos de la nave.
function naveComputo(calc, res) {
  const d = calc.design;
  const A = num(d.A), B = num(d.B), S = num(d.S), H = num(d.H);
  if (!(A > 0 && B > 0 && S > 0)) return null;
  const N = Math.max(2, Math.floor(B / S + 1e-9) + 1);           // pórticos (uno en cada extremo)
  const rows = [];
  rows.push(steel('Columnas', 'Columnas de los pórticos', res.col.n, 2 * N, H, res.col.G));
  if (res.beam && res.beam.kind === 'truss') {
    const ch = res.beam.chord; const dg = res.beam.diag;
    rows.push(steel('Dintel', `Dintel reticulado (cordones ${ch.n}, diagonales ${dg.n}): peso calculado por pórtico`, `${ch.n} + ${dg.n}`, N, 2 * res.beamLen, 0, res.weights.beam));
  } else if (res.beam && res.beam.profile) {
    rows.push(steel('Dintel', 'Dintel de alma llena (dos faldones por pórtico)', res.beam.profile.n, 2 * N, res.beamLen, res.beam.profile.G));
  }
  if (res.purlin && res.purlin.profile) {
    const sp = num(res.purlin.s, 1.5);
    const lines = Math.ceil(res.beamLen / sp - 1e-9) + 1;                // líneas de correas por faldón
    rows.push(steel('Correas', `Correas de cubierta (${lines} líneas por faldón, apoyadas entre pórticos)`, res.purlin.profile.n, 2 * lines * Math.ceil(B / S - 1e-9), S, res.purlin.profile.G));
  }
  const concrete = [];
  (res.bases || []).forEach((b, i) => {
    if (b && b.footing && b.footing.concrete != null) concrete.push({ desc: `Base ${i === 0 ? 'izquierda' : 'derecha'} (${f2(b.footing.L / 1000)} × ${f2(b.footing.B / 1000)} × ${f2(b.footing.h / 1000)} m)`, n: N, vol: num(b.footing.concrete), kgSteel: num(b.footing.steelKg) });
  });
  return {
    title: `Nave de ${f1(A)} × ${f1(B)} m con ${N} pórticos cada ${f2(S)} m.`,
    rows, concrete,
    area: { planta: A * B, cubierta: 2 * res.beamLen * B },
    notes: ['Las correas de pared, los cerramientos laterales, los arriostramientos y las uniones no están incluidos.'],
  };
}

// ---- piezas comunes
const uniq = (a) => [...new Set(a.filter(Boolean))];
const basesConcrete = (bases, N) => (bases || []).filter((b) => b && b.footing && b.footing.concrete != null).map((b, i) => ({
  desc: `Base ${i === 0 ? 'izquierda' : 'derecha'} (${f2(b.footing.L / 1000)} × ${f2(b.footing.B / 1000)} × ${f2(b.footing.h / 1000)} m)`,
  n: N, vol: num(b.footing.concrete), kgSteel: num(b.footing.steelKg),
}));
const framesOf = (d) => Math.max(2, Math.floor(num(d.B) / Math.max(num(d.S), 0.01) + 1e-9) + 1);
// cerchas y cabriadas: una fila por familia (cordón superior e inferior, montantes, diagonales); `count` = cantidad de cerchas iguales
function trussRows(families, count = 1) {
  const rows = [];
  ['CS', 'CI', 'M', 'D'].forEach((k) => {
    const F = families && families[k];
    if (!F || !F.bars || !F.bars.length || !F.profile) return;
    const mult = num(F.def && F.def.mult, 1);
    const totalLen = F.bars.reduce((s, b) => s + num(b.len), 0);
    const perfil = mult > 1 ? `${F.profile.n} × ${mult}` : F.profile.n;
    rows.push(steel(F.label, `${F.label}${F.def && F.def.label ? ' (' + F.def.label.toLowerCase() + ')' : ''}`, perfil, F.bars.length * count, totalLen / F.bars.length, num(F.profile.G) * mult, num(F.weight) * count));
  });
  return rows;
}
const purlinRow = (res, linesLabel, nLines, B, S) => (res.purlin && res.purlin.profile
  ? [steel('Correas', `Correas de cubierta (${linesLabel}, apoyadas entre pórticos)`, res.purlin.profile.n, nLines * Math.ceil(B / S - 1e-9), S, res.purlin.profile.G)]
  : []);

// Nave con cabriada sobre columnas
function cabComputo(calc, res) {
  const d = calc.design; const A = num(d.A), B = num(d.B), S = num(d.S), H = num(d.H), f = num(d.f);
  if (!(A > 0 && B > 0 && S > 0)) return null;
  const N = framesOf(d);
  const slope = Math.hypot(A / 2, f);
  const lines = Math.ceil(slope / num(res.purlin && res.purlin.s, 1.5) - 1e-9) + 1;
  return {
    title: `Nave de ${f1(A)} × ${f1(B)} m con ${N} cabriadas cada ${f2(S)} m.`,
    rows: [steel('Columnas', 'Columnas de los pórticos', res.col.n, 2 * N, H, res.col.G), ...trussRows(res.truss && res.truss.families, N), ...purlinRow(res, `${lines} líneas por faldón`, 2 * lines, B, S)],
    concrete: basesConcrete(res.bases, N),
    area: { planta: A * B, cubierta: 2 * slope * B },
    notes: ['Las presillas y chapas de nudo, las correas de pared, los cerramientos, los arriostramientos y las uniones no están incluidos.'],
  };
}

// Nave con arco parabólico
function archComputo(calc, res) {
  const d = calc.design; const A = num(d.A), B = num(d.B), S = num(d.S), H = num(d.H);
  if (!(A > 0 && B > 0 && S > 0)) return null;
  const N = framesOf(d);
  const rows = [steel('Columnas', 'Columnas de los arcos', res.col.n, 2 * N, H, res.col.G)];
  if (res.arch && res.arch.kind === 'truss') {
    rows.push(steel('Arco', `Arco reticulado (cordones ${res.arch.chord.n}, diagonales ${res.arch.diag.n}): peso calculado por arco`, `${res.arch.chord.n} + ${res.arch.diag.n}`, N, res.arcLen, 0, num(res.weights.arch) * N));
  } else if (res.arch && res.arch.profile) {
    rows.push(steel('Arco', 'Arco parabólico de alma llena', res.arch.profile.n, N, res.arcLen, res.arch.profile.G));
  }
  const lines = Math.ceil(res.arcLen / num(res.purlin && res.purlin.s, 1.5) - 1e-9) + 1;
  rows.push(...purlinRow(res, `${lines} líneas sobre el arco`, lines, B, S));
  return {
    title: `Nave de ${f1(A)} × ${f1(B)} m con ${N} arcos cada ${f2(S)} m.`,
    rows, concrete: basesConcrete(res.bases, N),
    area: { planta: A * B, cubierta: res.arcLen * B },
    notes: ['Las correas de pared, los cerramientos, los arriostramientos y las uniones no están incluidos.'],
  };
}

// Cercha o cabriada libre (una sola)
function trussComputo(calc, res) {
  const rows = trussRows(res.families, 1);
  if (!rows.length) return null;
  return { title: 'Una cercha (multiplicar por la cantidad de cerchas iguales).', rows, area: null, notes: ['Las presillas, chapas de nudo, apoyos y uniones no están incluidos.'] };
}

// Viga de acero (continua o simple)
function beamComputo(calc, res) {
  const d = calc.design;
  const spans = (Array.isArray(d.spans) ? d.spans : [d.spans]).map(num);
  const L = spans.reduce((s, v) => s + v, 0) + num(d.cantL) + num(d.cantR);
  if (!(L > 0) || !res.profile) return null;
  const mult = num(res.mult, 1);
  return { title: `Viga de ${f2(L)} m en total (${spans.length} tramo${spans.length === 1 ? '' : 's'}).`, rows: [steel('Viga', 'Viga de acero', mult > 1 ? `${res.profile.n} × ${mult}` : res.profile.n, 1, L, num(res.profile.G) * mult)], notes: ['Apoyos, rigidizadores y uniones no están incluidos.'] };
}

function purlinComputo(calc, res) {
  const L = num(calc.design.L);
  if (!(L > 0) || !res.profile) return null;
  return { title: `Una correa de ${f2(L)} m.`, rows: [steel('Correa', 'Correa de acero', res.profile.n, 1, L, res.profile.G)], notes: ['Ganchos, tensores y uniones no están incluidos.'] };
}

function columnComputo(calc, res) {
  const H = num(calc.design.H);
  if (!(H > 0) || !res.profile) return null;
  const batt = calc.design.kind === 'battened';
  return { title: `Una columna de ${f2(H)} m.`, rows: [steel('Columna', batt ? 'Columna compuesta (dos perfiles unidos con presillas)' : 'Columna simple', batt ? `${res.profile.n} × 2` : res.profile.n, 1, H, num(res.profile.G) * (batt ? 2 : 1))], notes: [batt ? 'Las presillas (chapas) y las uniones no están incluidas.' : 'Placa base y uniones no incluidas.'] };
}

function tieComputo(calc, res) {
  const L = num(calc.design.L);
  if (!(L > 0) || !res.profile) return null;
  return { title: `Un tensor de ${f2(L)} m.`, rows: [steel('Tensor', 'Tensor de acero', res.profile.n, 1, L, res.profile.G)], notes: ['Anclajes y tensores de ajuste no incluidos.'] };
}

// Entrepiso de acero independiente (el motor ya calcula las cantidades)
function floorComputo(calc, res) {
  const q = res.quantities;
  if (!q) return null;
  const rows = [];
  if (res.corr && res.corr.profile && res.nCorr) rows.push(steel('Correas', 'Correas del entrepiso', res.corr.profile.n, res.nCorr, num(q.kgCorr) / (res.nCorr * num(res.corr.profile.G, 1)), num(res.corr.profile.G), num(q.kgCorr)));
  const lp = uniq((res.lines || []).map((l) => l.profile && l.profile.n));
  if (lp.length) { const g = num(res.lines[0].profile.G, 1); rows.push(steel('Vigas', 'Vigas del entrepiso', lp.join(' / '), res.lines.length, num(q.kgBeams) / (res.lines.length * g), g, num(q.kgBeams))); }
  const cols = (res.nodes || []).filter((n) => !n.existing);
  if (cols.length && res.colSel) rows.push(steel('Columnas', 'Columnas del entrepiso', res.colSel, cols.length, num(calc.design.H, 3), num(cols[0].col && cols[0].col.profile && cols[0].col.profile.G), num(q.kgCols)));
  return { title: `Entrepiso de ${f1(res.Xtot)} × ${f1(res.Ytot)} m.`, rows, area: { planta: num(res.area) }, notes: ['Bases, apoyos y uniones no están incluidos.'] };
}

// Columna reticulada
function latticeComputo(calc, res) {
  const H = num(calc.design.H);
  if (!(H > 0) || !res.chordProfile) return null;
  const nCh = num(calc.design.kind, 2);
  return {
    title: `Una columna reticulada de ${f2(H)} m con ${nCh} cordones.`,
    rows: [
      steel('Cordones', 'Cordones de la columna', res.chordProfile.n, nCh, H, num(res.chordProfile.G)),
      steel('Diagonales', 'Diagonales en zigzag', res.diag.n, num(res.diagCount), num(res.ld) / 100, num(res.diag.G), num(res.wDiag)),
    ],
    notes: ['Chapas de nudo, placa base y uniones no incluidas.'],
  };
}

// Cables de gran luz (solo longitud: el peso por metro lo da el catálogo del fabricante)
const parabolaLen = (L, f) => L * (1 + (8 / 3) * (f / L) * (f / L));
function cableRow(desc, c, n, len) { return { fn: 'Cables', desc, perfil: `ø ${f0(c.d)} mm`, n, len, total: n * len, kgm: 0, kg: 0 }; }
function tensComputo(calc, res) {
  const d = calc.design;
  if (!res.cableSel || !res.cableSel.cable || !['jawerth', 'heavy'].includes(d.kind)) return null;
  const L = num(d.L), f = num(d.f);
  const c = res.cableSel.cable;
  return { title: 'Cable portante de la estructura traccionada.', rows: [cableRow(`Cable ø ${f0(c.d)} mm (carga de rotura ${f0(c.F)} kg), longitud por parábola`, c, num(res.cableSel.n, 1), parabolaLen(L, f))], notes: ['El peso de los cables se toma del catálogo del fabricante (no se calcula acá). Tensores, anclajes, telas y columnas no incluidos.'] };
}

// Viga postesada: hormigón de la sección y cables
function postComputo(calc, res) {
  const L = num(calc.design.L);
  if (!(L > 0) || !res.A) return null;
  const rows = res.cable ? [cableRow(`Cables de postesado ø ${f0(res.cable.d)} mm, longitud por parábola`, res.cable, num(res.cable.n, 1), parabolaLen(L, num(res.fCable, 0)))] : [];
  return { title: `Viga postesada de ${f2(L)} m.`, rows, concrete: [{ desc: `Viga de hormigón (sección ${f0(res.A)} cm²)`, n: 1, vol: (res.A / 10000) * L, kgSteel: 0 }], notes: ['El peso de los cables y de las armaduras pasivas se toma del catálogo; vainas, anclajes y armadura pasiva no incluidos.'] };
}

// Cúpula de hormigón: casquete esférico (hormigón y malla de armadura)
function domeComputo(calc, res) {
  const d = calc.design;
  const area = 2 * Math.PI * num(res.R) * num(d.f);
  if (!(area > 0)) return null;
  const db = num(res.barD || d.barD);
  const sp = num(res.spacing, 20) / 100;
  const kgm = 0.00617 * db * db;
  return { title: `Cúpula de ${f1(d.L)} m de diámetro y ${f1(d.f)} m de altura.`, rows: [], concrete: [{ desc: `Casquete esférico (${f1(area)} m², espesor ${f0(d.e)} cm), malla Ø${f0(db)} c/${f0(sp * 100)} cm en dos direcciones`, n: 1, vol: area * num(d.e) / 100, kgSteel: area * (2 / sp) * kgm }], area: { cubierta: area }, notes: ['Vigas de apoyo, columnas y refuerzos de borde no están incluidos.'] };
}

// ---- armaduras: kg por metro de una barra lisa/nervurada de d mm
const kgBar = (d) => 0.00617 * d * d;

// Viga Vierendeel (acero: cordones de dos perfiles U y montantes de la misma sección; hormigón: cordones y montantes rectangulares)
function vierComputo(calc, res) {
  const L = num(res.L), H = num(res.H), a = num(res.a, 1);
  if (!(L > 0 && H > 0)) return null;
  const nMont = Math.max(1, Math.round(L / a)) + 1;
  if (res.mat === 'steel' && res.profile) {
    const u = res.profile;
    return {
      title: `Viga Vierendeel de ${f2(L)} m con ${nMont} montantes.`,
      rows: [steel('Cordones', 'Cordones superior e inferior (cada uno con dos perfiles U)', u.n, 4, L, num(u.G)), steel('Montantes', 'Montantes (dos perfiles U cada uno, con la sección del cordón)', u.n, 2 * nMont, Math.max(0.1, H - num(u.h) / 1000), num(u.G))],
      notes: ['Chapas de nudo, apoyos y uniones no están incluidos.'],
    };
  }
  const m1 = num(res.m1) / 100, m2 = num(res.m2) / 100, hc = num(res.hc, res.m2) / 100;
  if (!(m1 > 0 && m2 > 0)) return null;
  const volCh = 2 * m1 * hc * L;
  const volMont = nMont * m1 * m2 * Math.max(0.1, H - hc);
  return {
    title: `Viga Vierendeel de hormigón armado de ${f2(L)} m con ${nMont} montantes.`,
    rows: [],
    concrete: [
      { desc: `Cordones superior e inferior (${f0(res.m1)} × ${f0(res.hc || res.m2)} cm)`, n: 1, vol: volCh, kgSteel: num(res.nBars) * kgBar(num(res.barD)) * L },
      { desc: `Montantes (${f0(res.m1)} × ${f0(res.m2)} cm)`, n: 1, vol: volMont, kgSteel: 0 },
    ],
    notes: [`La armadura incluida es la del cordón inferior (${f0(res.nBars)} Ø${f0(res.barD)}); estribos y armadura de montantes y del cordón superior no están incluidos.`],
  };
}

// Losa plegada: módulos, vigas tímpano y armadura del valle
function foldedComputo(calc, res) {
  const L = num(res.L), nMod = Math.max(1, num(res.nMod, 1));
  if (!(L > 0) || !(res.wave > 0)) return null;
  const valleys = Math.max(1, nMod - 1);
  const kgValle = valleys * num(res.nBars) * kgBar(num(res.barD)) * L;
  const concrete = [{ desc: `Módulos de plegado (onda desarrollada ${f2(res.wave)} m, espesor ${f0(res.d * 100)} cm, luz ${f2(L)} m)`, n: nMod, vol: res.wave * res.d * L, kgSteel: kgValle / nMod }];
  const t = res.timp;
  if (t) concrete.push({ desc: `Vigas tímpano (${f2(t.b)} × ${f2(t.h)} × ${f2(t.l)} m)`, n: 2, vol: t.b * t.h * t.l, kgSteel: num(t.nBars) * kgBar(16) * t.l });
  return { title: `Plegado de ${nMod} módulos de ${f2(L)} m.`, rows: [], concrete, notes: [`Armadura del valle: ${f0(res.nBars)} Ø${f0(res.barD)} en cada encuentro entre módulos. Columnas, estribos y armadura de repartición no están incluidos.`] };
}

// Estereoestructura plana: barras de las dos capas, diagonales y columnas (cantidades por módulos de la retícula)
function spaceComputo(calc, res) {
  if (!res.chord || !res.chord.tube || !res.diag || !res.diag.tube || !(res.Lm > 0)) return null;
  const sum = (a) => a.reduce((s, v) => s + num(v), 0);
  const Xt = num(res.xcL) + sum(res.xs || []) + num(res.xcR);
  const Yt = num(res.ycL) + sum(res.ys || []) + num(res.ycR);
  const nx = Math.max(1, Math.round(Xt / res.Lm)), ny = Math.max(1, Math.round(Yt / res.Lm));
  const name = (t) => `ø ${t.de} × ${t.s} mm`;
  const top = nx * (ny + 1) + ny * (nx + 1);
  const bot = Math.max(0, ny * (nx - 1) + nx * (ny - 1));
  const rows = [
    steel('Capa superior', 'Barras de la capa superior', name(res.chord.tube), top, res.Lm, num(res.chord.tube.G)),
    steel('Capa inferior', 'Barras de la capa inferior (retícula desplazada medio módulo)', name(res.chord.tube), bot, res.Lm, num(res.chord.tube.G)),
    steel('Diagonales', 'Diagonales (cuatro por módulo)', name(res.diag.tube), 4 * nx * ny, res.Ld, num(res.diag.tube.G)),
  ];
  if (res.col && res.col.tube) rows.push(steel('Columnas', 'Columnas bajo la placa', name(res.col.tube), (num(res.xs.length) + 1) * (num(res.ys.length) + 1), num(calc.design.colH, 3), num(res.col.tube.G)));
  return {
    title: `Placa de ${f1(Xt)} × ${f1(Yt)} m con módulo de ${f2(res.Lm)} m y altura ${f2(res.H)} m (${nx} × ${ny} módulos).`,
    rows, area: { planta: Xt * Yt },
    notes: ['Cantidades estimadas por módulos de la retícula (retícula cuadrada sobre cuadrada). Nudos, bulones, vigas de apoyo, placas base y cubierta no están incluidos.'],
  };
}

// Cáscara de paraboloide hiperbólico: hormigón sobre la proyección en planta y malla de armadura
function phComputo(calc, res) {
  const area = num(res.plan && res.plan.total);
  const e = num(res.e || calc.design.e) / 100;
  if (!(area > 0 && e > 0)) return null;
  const db = num(res.barD || calc.design.barD, 6), sp = num(res.spacing, 15) / 100;
  return {
    title: `${f0(res.plan.modules)} módulos de cáscara (${f0(area)} m² en planta).`,
    rows: [],
    concrete: [{ desc: `Cáscaras de espesor ${f0(e * 100)} cm, malla Ø${f0(db)} c/${f0(sp * 100)} cm en dos direcciones`, n: 1, vol: area * e, kgSteel: area * (2 / sp) * kgBar(db) }],
    area: { planta: area },
    notes: ['El volumen se calcula sobre la proyección en planta: la superficie alabeada real es algo mayor. Bordes, columnas centrales y refuerzos no están incluidos.'],
  };
}

// Columna de hormigón armado: hormigón, barras longitudinales y estribos
function rcColumnComputo(calc, res) {
  const ch = res.chosen; const b = num(calc.section && calc.section.b), h = num(calc.section && calc.section.h), lu = num(calc.design.lu);
  if (!ch || !(b > 0 && h > 0 && lu > 0)) return null;
  const cover = num(ch.cover) / 10;
  const nEst = Math.ceil(lu * 1000 / Math.max(num(ch.tieSpacing, 150), 50)) + 1;
  const lEst = (2 * ((b - 2 * cover) + (h - 2 * cover)) + 20) / 100;
  const kg = num(ch.n) * kgBar(num(ch.db)) * lu + nEst * lEst * kgBar(num(ch.dbe, 6));
  return { title: `Una columna de ${f0(b)} × ${f0(h)} cm y ${f2(lu)} m.`, rows: [], concrete: [{ desc: `Columna (${f0(b)} × ${f0(h)} cm), ${f0(ch.n)} Ø${f0(ch.db)} y estribos Ø${f0(ch.dbe)} cada ${f0(num(ch.tieSpacing))} mm`, n: 1, vol: b * h / 10000 * lu, kgSteel: kg }], notes: ['Empalmes, anclajes y esperas no están incluidos.'] };
}

// Base de hormigón armado (el motor ya calcula hormigón y acero)
function footingComputo(calc, res) {
  if (res.concrete == null) return null;
  return { title: `Una base de ${f2(num(res.L) / 1000)} × ${f2(num(res.B) / 1000)} × ${f2(num(res.h) / 1000)} m.`, rows: [], concrete: [{ desc: 'Base (hormigón y armadura de flexión)', n: 1, vol: num(res.concrete), kgSteel: num(res.steelKg) }], notes: ['Armadura de columna (esperas) y vigas de equilibrio no están incluidas.'] };
}

const BUILDERS = { snave: naveComputo, snavecab: cabComputo, snavearch: archComputo, struss: trussComputo, sbeam: beamComputo, spurlin: purlinComputo, scolumn: columnComputo, stie: tieComputo, sfloor: floorComputo, slat: latticeComputo, stens: tensComputo, spost: postComputo, sdome: domeComputo, svier: vierComputo, splegado: foldedComputo, sestereo: spaceComputo, sph: phComputo, column: rcColumnComputo, footing: footingComputo };

// Devuelve el HTML del cómputo para la memoria, o '' si el elemento todavía no tiene armador o el cálculo no tiene solución.
export function computoSection(calc, out) {
  const b = BUILDERS[calc.element];
  if (!b) return '';
  const res = out && (out.res || out);
  if (!res || out.error) return '';
  try {
    const c = b(calc, res);
    return c ? computoHtml(c) : '';
  } catch (e) { return ''; }
}

export const hasComputo = (element) => Boolean(BUILDERS[element]);
export function registerComputo(element, builder) { BUILDERS[element] = builder; }
