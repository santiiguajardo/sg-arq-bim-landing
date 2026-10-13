// Uniones y flechas de las estructuras de acero: tarjetas de pantalla y filas de memoria, y armado de las uniones de cada tipo de cálculo
// (motor en js/structural/steel-joints.js; fuente: Proyecto de Reglamento CIRSOC 301/2017, Cap. J y L). Las uniones se verifican por resistencia (LRFD) con las
// fuerzas de servicio del cálculo elástico mayoradas por un coeficiente medio (por defecto 1,5).
import * as S from '../structural/steel.js';
import * as J from '../structural/steel-joints.js';
import { escapeHtml } from '../utils.js';
import { fmt, selField, numField, memoRow } from './structural-ui.js';

export const SOURCE_NOTE = 'Uniones verificadas con el Proyecto de Reglamento CIRSOC 301/2017 (INTI), Cap. J, por resistencia (LRFD) con las fuerzas de servicio del cálculo elástico mayoradas por el coeficiente indicado. Los apuntes de la cátedra no desarrollan uniones: el proyectista debe revisar cada detalle (excentricidades, chapas de nudo a compresión, soldaduras en obra). Los anclajes se verifican con el Apéndice D del CIRSOC 201.';

export const DEFL_OPTS = Object.entries(J.DEFLECTION_LIMITS).map(([k, v]) => [k, v.label]);
export const deflSelect = (path, value, hint = 'CIRSOC 301/2017, Tabla L.3-1 (la flecha por sobrecarga es la de la sobrecarga sola).') => selField(path, 'Límite de flecha', value, DEFL_OPTS, hint);

// ---------------------------------------------------------------- tarjetas
export function jointSettingsCard(calc, withMu = false) {
  const j = J.jointOpts(calc);
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Datos de las uniones</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${selField('joints.mode', 'Tipo de unión', j.mode, [['weld', 'Soldada (filetes)'], ['bolt', 'Abulonada']])}
      ${j.mode === 'weld' ? selField('joints.electrode', 'Electrodo', j.electrode, Object.entries(J.ELECTRODES).map(([k, v]) => [k, v.label]), 'FEXX de la clasificación AWS A5.1.') : selField('joints.boltType', 'Bulones', j.boltType, Object.entries(J.BOLT_TYPES).map(([k, v]) => [k, v.label]))}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${j.mode === 'bolt' ? selField('joints.boltD', 'Diámetro de los bulones', j.boltD, J.BOLT_DIAMETERS.map((d) => [d, `ø${d} mm`])) : ''}
      ${numField('joints.Fu', 'Tensión de rotura del acero de las chapas Fu', j.Fu, { unit: 'MPa', hint: 'Dato de la norma o del certificado (por defecto 340 MPa, del lado seguro).' })}
      ${numField('joints.gamma', 'Coeficiente de mayoración de las cargas de servicio', j.gamma, { hint: 'Valor medio (1,2 D + 1,6 L ≈ 1,4 a 1,6).' })}
    </div>
    ${withMu ? `<div class="field-row" style="flex-wrap:wrap;">${numField('joints.mu', 'Coeficiente de rozamiento base-suelo μ', Number(calc.joints && calc.joints.mu) || '', { hint: 'Dato del estudio de suelos (no se supone un valor). Vacío: el tensor se calcula para toda la horizontal.' })}</div>` : ''}</div>`;
}

export function jointCard(r) {
  const rows = (r.rows || []).map((x) => `<tr><td>${escapeHtml(x.k)}</td><td style="text-align:right;">${escapeHtml(x.v)}</td></tr>`).join('');
  const checks = (r.checks || []).map((k) => `<div class="vf-row ${k.ok ? 'vf-ok' : 'vf-bad'}"><span class="vf-mark">${k.ok ? '✓' : '✗'}</span><span class="vf-label">${escapeHtml(k.label)}</span><span class="vf-text">${escapeHtml(k.text)}</span></div>`).join('');
  const bad = r.ok === false;
  return `<div class="card vf-card ${bad ? 'vf-bad' : 'vf-ok'}" style="margin-bottom:12px;"><h4 style="margin:0 0 6px; font-size:13.5px;">${escapeHtml(r.label)} ${bad ? '<span class="tag tag-alta">No verifica</span>' : (r.checks && r.checks.length ? '<span class="tag tag-freelance">Verifica</span>' : '')}</h4>
    ${r.Pu ? `<p class="text-muted" style="font-size:12px; margin:0 0 6px;">Fuerza de servicio ${fmt(r.P, 0)} kg → mayorada ${fmt(r.Pu / 1000, 1)} kN</p>` : ''}
    <table class="data-table"><tbody>${rows}</tbody></table>${checks}
    ${(r.notes || []).map((n) => `<p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">${escapeHtml(n)}</p>`).join('')}</div>`;
}

export function jointsPanel(calc, list) {
  return `${jointSettingsCard(calc, list.some((x) => x.sliding))}${list.length ? list.map(jointCard).join('') : '<div class="card"><p class="text-muted">No hay uniones para calcular con estos datos.</p></div>'}
    <p class="text-muted" style="font-size:12px;">${SOURCE_NOTE}</p>`;
}

export function jointsMemo(list) {
  if (!list.length) return '';
  const body = list.map((r) => {
    const rows = (r.rows || []).map((x) => memoRow(escapeHtml(x.k), escapeHtml(x.v))).join('');
    const checks = (r.checks || []).map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${escapeHtml(k.label)}`, escapeHtml(k.text))).join('');
    return `${memoRow(`<b>${escapeHtml(r.label)}</b>`, r.ok === false ? 'no verifica' : '')}${r.Pu ? memoRow('Fuerza de servicio → mayorada', `${fmt(r.P, 0)} kg → ${fmt(r.Pu / 1000, 1)} kN`) : ''}${rows}${checks}`;
  }).join('');
  return `<table>${body}</table><p class="mem-foot">${escapeHtml(SOURCE_NOTE)}</p>`;
}

// flechas
const cm = (m) => `${fmt(m * 100, 2)} cm`;
export function deflRows(d, kind) {
  if (!d) return [];
  const rows = [];
  if (d.check) {                                  // cercha (truss): { fTotal, fLive, check }
    rows.push({ k: `Flecha total / límite (L / ${d.check.lim.total || '—'})`, v: `${cm(d.fTotal)} / ${cm(d.check.limTotal)}`, ok: d.check.okT });
    if (d.check.lim.live) rows.push({ k: `Flecha por sobrecarga / límite (L / ${d.check.lim.live})`, v: `${cm(d.fLive)} / ${cm(d.check.limLive)}`, ok: d.check.okL });
    return rows;
  }
  const v = d.vert;
  rows.push({ k: `Flecha del ${kind === 'arch' ? 'arco' : 'dintel'} (total) / límite (L / ${v.lim.total})`, v: `${cm(v.fTotal)} / ${cm(v.limTotal)}`, ok: v.okT });
  if (v.lim.live) rows.push({ k: `Flecha por sobrecarga / límite (L / ${v.lim.live})`, v: `${cm(v.fLive)} / ${cm(v.limLive)}`, ok: v.okL });
  if (Number.isFinite(d.driftLim)) rows.push({ k: 'Desplazamiento lateral de las columnas por viento / límite (H / 150)', v: `${cm(d.drift)} / ${cm(d.driftLim)}`, ok: d.driftOk });
  return rows;
}
export function deflCardHtml(d, kind, bumps) {
  const rows = deflRows(d, kind);
  if (!rows.length) return '';
  const ok = rows.every((r) => r.ok);
  return `<div class="card vf-card ${ok ? 'vf-ok' : 'vf-bad'}" style="margin-bottom:16px;"><h3 style="margin-top:0;">Flechas ${ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>'}</h3>
    <table class="data-table"><tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.k)}</td><td style="text-align:right; font-weight:700; color:${r.ok ? 'var(--good)' : 'var(--bad)'};">${r.ok ? '✓' : '✗'} ${escapeHtml(r.v)}</td></tr>`).join('')}</tbody></table>
    ${bumps ? `<p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los perfiles se aumentaron ${bumps} paso(s) respecto del mínimo por resistencia para cumplir las flechas.</p>` : ''}
    <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">Con cargas de servicio y la rigidez de los perfiles adoptados (análisis elástico, sin efectos de segundo orden ni deformación de las uniones). Límites: CIRSOC 301/2017, Tabla L.3-1.</p></div>`;
}
export function deflMemo(d, kind, bumps) {
  const rows = deflRows(d, kind);
  if (!rows.length) return '';
  return `<table>${rows.map((r) => memoRow(`${r.ok ? '✓' : '✗'} ${escapeHtml(r.k)}`, escapeHtml(r.v), 'CIRSOC 301/2017, Tabla L.3-1')).join('')}${bumps ? memoRow('Aumento de perfiles por flecha', `${bumps} paso(s)`) : ''}</table>`;
}

// ---------------------------------------------------------------- armado de las uniones de cada cálculo
const grade = (calc) => S.GRADES[calc.materials.grade] || S.GRADES['F-22'];
const sizeOf = (pf) => {
  if (!pf) return { d: 200, bf: 200 };
  if (pf.t === 'CAÑO') return { d: pf.D, bf: pf.D };
  return { d: pf.h, bf: pf.b || pf.h };
};
const tOf = (pf) => (pf ? (pf.tw || pf.e || 8) : 8);

// deslizamiento de las bases por la reacción horizontal (rozamiento con el suelo o tensor); bases: [{ H, weight, uplift }] en kg
function slidingCards(calc, bases, names) {
  const mu = Number(calc.joints && calc.joints.mu) || 0;
  return bases.map((b, i) => J.designBaseSliding({ H: b.H, weight: b.weight || 0, uplift: b.uplift || 0, mu, label: `Fuerza horizontal en la base, ${names[i]}` }));
}

const plateCache = new Map();
function basePlates(calc, entries) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  const fc = Number(calc.materials.fc) || 20;
  return entries.map((e) => {
    const sz = sizeOf(e.profile);
    const key = JSON.stringify([sz, e.N, e.M, e.H, e.uplift, fc, j, fy, e.footing && e.footing.ok ? [e.footing.B, e.footing.L, e.footing.h] : null, e.label]);
    if (!plateCache.has(key)) {
      if (plateCache.size > 60) plateCache.clear();
      plateCache.set(key, J.designBasePlate({ col: sz, N: e.N, M: e.M || 0, H: e.H || 0, uplift: e.uplift || 0, fc, j, fy, label: e.label, footing: e.footing || null }));
    }
    return plateCache.get(key);
  });
}
export function jointsTruss(res, calc) {
  const j = J.jointOpts(calc);
  return J.designTrussJoints(res, j, grade(calc));
}

// esfuerzos máximos (en valor absoluto) de servicio en el punto ptIdx de un miembro (-1 = último punto): { N, V }
function endForces(res, memberIdx, ptIdx) {
  let N = 0; let V = 0;
  res.states.forEach((st) => { const arr = st.pts[memberIdx]; const p = arr[ptIdx < 0 ? arr.length + ptIdx : ptIdx]; N = Math.max(N, Math.abs(p.N)); V = Math.max(V, Math.abs(p.V)); });
  return { N, V };
}

// Dintel o arco reticulado: se verifican las uniones de los cordones y las diagonales con los esfuerzos de barra del punto más exigido (cordón: M / h; diagonal: V / (planos · sen α)).
// Los cordones se tratan como si cada fuerza entrara por una chapa de nudo soldada o abulonada; las diagonales se calculan en tracción (esfuerzo alternado: del lado seguro).
function latticeBarJoints(r, c, calc, what) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  return [
    J.designBarJoint({ profile: r.chord, mult: 1, P: Math.max(c.Cc || 0, 1), kind: 'T', j, fy, label: `Cordones del ${what} reticulado a la chapa de nudo (esfuerzo M / h = ${fmt(c.Cc || 0, 0)} kg)` }),
    J.designBarJoint({ profile: r.diag, mult: 1, P: Math.max(c.D || 0, 1), kind: 'T', j, fy, label: `Diagonales del ${what} reticulado (esfuerzo V / (planos sen α) = ${fmt(c.D || 0, 0)} kg)` }),
  ];
}

function envAt(res, memberIdx, ptIdx) {
  let best = null;
  res.states.forEach((st) => { const p = st.pts[memberIdx][ptIdx]; if (!best || Math.abs(p.M) > Math.abs(best.M)) best = p; });
  return best;
}

export function jointsPortal(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(res.grade);
  const list = [];
  const g = res.geom;
  const beamPf = res.isTruss ? null : res.beam.profile;
  if (beamPf) {
    const knee = envAt(res, 1, 0);
    const ce = endForces(res, 0, -1);
    list.push(J.designWeldedMomentJoint({ M: knee.M, N: knee.N, V: knee.V, profile: beamPf, j, fy, label: 'Unión viga-columna (alero), soldada', col: res.col, Vcol: ce.V, Ncol: ce.N }));
    const ridge = envAt(res, 1, 24);
    if (res.type === 'triarticulado') list.push(J.designPinJoint({ N: Math.abs(ridge.N), V: Math.abs(ridge.V), j: { ...j, mode: 'bolt' }, tMin: Math.min(tOf(beamPf), 10), fy, label: 'Articulación de la cumbrera (bulones al corte)' }));
    else list.push(J.designWeldedMomentJoint({ M: ridge.M, N: ridge.N, V: ridge.V, profile: beamPf, j, fy, label: 'Unión de cumbrera, soldada' }));
  } else {
    list.push(...latticeBarJoints(res.beam, res.beamCheck.c, calc, 'dintel'));
  }
  const mz = (idx) => { let m = 0; res.states.forEach((st) => { const r = st.reactions[idx]; if (r) m = Math.max(m, Math.abs(r.mz || 0)); }); return m; };
  list.push(...basePlates(calc, [0, 1].map((i) => ({ profile: res.col, N: res.bases ? res.bases[i].Nmax : Math.max(...res.states.map((st) => st.reactions[i].fy)), M: mz(i), H: res.bases ? res.bases[i].H : 0, uplift: res.bases ? res.bases[i].uplift : 0, footing: res.bases ? res.bases[i].footing : null, label: `Placa base y anclajes, columna ${i === 0 ? 'izquierda' : 'derecha'}` }))));
  if (res.bases) list.push(...slidingCards(calc, res.bases, ['columna izquierda', 'columna derecha']));
  return list;
}

export function jointsCab(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(res.grade);
  const list = jointsTruss(res.truss, calc);
  // unión de la cabriada con la columna: la resultante que la cabriada le transmite al extremo de la columna
  let N = 0; let V = 0;
  res.states.forEach((st) => st.colPts.forEach((pts) => { const p = pts[pts.length - 1]; N = Math.max(N, Math.abs(p.N)); V = Math.max(V, Math.abs(p.V)); }));
  list.push(J.designPinJoint({ N, V, j: { ...j, mode: 'bolt' }, tMin: 10, fy, label: 'Apoyo articulado de la cabriada sobre la columna (bulones al corte)' }));
  const mzOf = (i) => { let m = 0; res.states.forEach((st) => { const r = st.reactions[i]; if (r) m = Math.max(m, Math.abs(r.mz || 0)); }); return m; };
  list.push(...basePlates(calc, [0, 1].map((i) => ({ profile: res.col, N: res.bases[i].Nmax, M: mzOf(i), H: res.bases[i].H, uplift: res.bases[i].uplift, footing: res.bases[i].footing, label: `Placa base y anclajes, columna ${i === 0 ? 'izquierda' : 'derecha'}` }))));
  list.push(...slidingCards(calc, res.bases, ['columna izquierda', 'columna derecha']));
  void fy;
  return list;
}

export function jointsArch(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(res.grade);
  const list = [];
  const g = res.geom;
  const archPf = res.isTruss ? null : res.arch.profile;
  if (archPf) {
    if (calc.design.hingeCrown !== 'no') {
      let N = 0; let V = 0;
      const mi = g.off + g.n / 2;
      res.states.forEach((st) => { const p = st.pts[mi][0]; N = Math.max(N, Math.abs(p.N)); V = Math.max(V, Math.abs(p.V)); });
      list.push(J.designPinJoint({ N, V, j: { ...j, mode: 'bolt' }, tMin: Math.min(tOf(archPf), 10), fy, label: 'Articulación de la clave (bulones al corte)' }));
    }
    if (g.cols && calc.design.joint !== 'pinned') {
      const p0 = envAt(res, g.off, 0);
      const ce = g.off > 0 ? endForces(res, g.off - 1, -1) : { N: 0, V: 0 };
      list.push(J.designWeldedMomentJoint({ M: p0.M, N: p0.N, V: p0.V, profile: archPf, j, fy, label: 'Unión arco-columna, soldada', col: res.col, Vcol: ce.V, Ncol: ce.N }));
    }
  } else list.push(...latticeBarJoints(res.arch, res.archCheck.c, calc, 'arco'));
  const basePf = g.cols ? res.col : (res.isTruss ? res.arch.chord : res.arch.profile);
  const mzOf = (i) => { let m = 0; res.states.forEach((st) => { const r = st.reactions[i]; if (r) m = Math.max(m, Math.abs(r.mz || 0)); }); return m; };
  list.push(...basePlates(calc, [0, 1].map((i) => ({ profile: basePf, N: res.bases[i].Nmax, M: mzOf(i), H: res.bases[i].H, uplift: res.bases[i].uplift, footing: res.bases[i].footing, label: `Placa base y anclajes, ${g.cols ? 'columna' : 'arranque'} ${i === 0 ? 'izquierdo' : 'derecho'}` }))));
  list.push(...slidingCards(calc, res.bases, [g.cols ? 'columna izquierda' : 'arranque izquierdo', g.cols ? 'columna derecha' : 'arranque derecho']));
  return list;
}

export function jointsFloor(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  const list = [];
  const Rc = Math.max(...res.corr.Rmax);
  list.push(J.designShearJoint({ R: Rc, j, tMin: Math.min(tOf(res.corr.profile), 6), fy, label: 'Apoyo de las correas sobre las vigas' }));
  const Rb = Math.max(...res.lines.map((l) => Math.max(...l.Rmax)));
  const pfB = res.lines[0].profile;
  list.push(J.designShearJoint({ R: Rb, j, tMin: Math.min(tOf(pfB), 10), fy, label: 'Apoyo de las vigas sobre las columnas' }));
  if (res.own.length && res.colSel !== null) {
    const big = res.own.reduce((a, b) => (b.N > a.N ? b : a));
    list.push(...basePlates(calc, [{ profile: big.col.profile, N: big.N, footing: big.footing, label: `Placa base y anclajes de la columna más cargada` }]));
  }
  return list;
}

export function jointsBeam(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  const R = Math.max(...res.Rmax);
  return [J.designShearJoint({ R, j, tMin: Math.min(tOf(res.profile), 10), fy, label: 'Apoyo de la viga (reacción máxima)' })];
}

export function jointsPurlin(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  const Q = Math.max(...res.states.map((s) => s.Q));
  return [J.designShearJoint({ R: Q, j, tMin: Math.min(tOf(res.profile), 6), fy, label: 'Apoyo de la correa' })];
}

export function jointsColumn(res, calc, battened) {
  const j = J.jointOpts(calc);
  const list = [];
  if (battened && res.chk && res.chk.Tp) list.push(J.designBattenWeld({ Tp: res.chk.Tp, Mp: res.chk.Mp, hP: res.chk.hP, j, label: 'Presillas' }));
  const pf = battened ? { ...res.profile, h: res.profile.h, b: res.e * 10 + (res.profile.b || res.profile.h) } : res.profile;
  list.push(...basePlates(calc, [{ profile: pf, N: res.N, label: 'Placa base y anclajes' }]));
  return list;
}

export function jointsLattice(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(res.grade);
  const list = [];
  if (res.diag && res.diag.t === 'L') list.push(J.designBarJoint({ profile: res.diag, mult: 1, P: res.D, kind: 'C', j, fy, label: 'Diagonales a los cordones (esfuerzo D = Q / (n sen α))' }));
  else list.push({ label: 'Diagonales', rows: [{ k: 'Unión', v: 'barras o caños: soldadura de filete sobre el cordón; no se calcula automáticamente' }], checks: [], notes: [], ok: true });
  const chordW = res.m === 2 ? res.e * 10 + (res.chordProfile.b || res.chordProfile.h) : Math.max(res.e, res.e2) * 10 + (res.chordProfile.b || res.chordProfile.h);
  const bfW = res.m === 2 ? (res.chordProfile.h || 100) : Math.min(res.e, res.e2) * 10 + (res.chordProfile.b || res.chordProfile.h);
  list.push(...basePlates(calc, [{ profile: { t: 'X', h: chordW, b: bfW, tw: 8 }, N: res.Nt, label: 'Placa base y anclajes (dimensiones de la columna completa)' }]));
  return list;
}

export function jointsTie(res, calc) {
  const j = J.jointOpts(calc);
  const fy = J.fyMPa(grade(calc));
  return [J.designTieJoint({ profile: res.profile, T: res.T, kind: res.profile.t === 'BARRA' ? 'barra' : 'caño', j, fy, label: 'Extremos del tensor' })];
}
