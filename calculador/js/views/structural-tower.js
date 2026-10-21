// Hormigón armado: edificio en torre con tabiques contraviento. Motor en js/structural/tower.js.
// FUENTE: guía 7 "Edificio en torre" del Taller de Estructuras E4 (curso 2024) y CIRSOC 102-2005 (viento).
import * as T from '../structural/tower.js';
import { setCalcField } from '../state.js';
import { escapeHtml, showToast } from '../utils.js';
import { fmt, numField, selField, checksCard, memoRow } from './structural-ui.js';

const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const tn = (v, n = 1) => fmt(v, n);
export const TOWER_NOTE = 'Predimensionado según la guía 7 "Edificio en torre" del Taller de Estructuras E4 (2024) con el viento del CIRSOC 102-2005 (procedimiento analítico, sistema principal resistente al viento): el edificio trabaja como una ménsula empotrada; los tabiques de hormigón paralelos al viento toman el momento en proporción a su inercia y se predimensionan a flexocompresión en la planta baja con tensiones admisibles; se verifican volcamiento, tensión del terreno bajo la platea y flecha en cabeza. Solo se calcula la dirección más crítica (viento sobre la cara mayor): hay que repetirlo con el viento sobre la cara menor. No se verifican las losas, los pórticos perimetrales, el efecto dinámico (Gf si la frecuencia es menor que 1 Hz), la torsión de planta fuera del caso simple ni la interacción con el suelo. Herramienta de apoyo para el predimensionado.';

const rectWall = (name, x, y) => ({ kind: 'rect', name, e: 0.2, lw: 4.5, x, y, infl: 10.5, hd: 0.9 });
const uWall = (name, x) => ({ kind: 'U', name, e: 0.2, lw: 3.6, lf: 5, x, y: 8, inflWeb: 17.2, inflFl: 30.4 });
const defaults = () => ({ kind: 'tower', B: 20, L: 16, nTipo: 20, hTipo: 3, hPB: 4, nSub: 2, hSub: 3, B1: 24, L1: 20, V: 48, exposure: 'A', Kd: 0.85, I: 1, Kzt: 1, G: 0.85, gcpi: 0.18, qpp0: 0.7, qpp1: 0.9, fc: 300, E: 340000, tauAdm: 24, sigmaS: 2400, sigmaBadm: 0, gammaSeg: 2.5, sigmaT: 1.9, flechaRatio: 500, barD: 12, barDh: 6,
  walls: [rectWall('T1', 0, 2.25), rectWall('T2', 20, 2.25), rectWall('T3', 0, 13.75), rectWall('T4', 20, 13.75), uWall('T5', 5.86), uWall('T6', 14.14)] });

function compute(calc) {
  const d = calc.design;
  const walls = (d.walls || []).map((w) => ({ ...w }));
  if (!walls.length) return { error: 'Agregá al menos un tabique contraviento.' };
  const need = ['B', 'L', 'nTipo', 'hTipo', 'hPB', 'V', 'B1', 'L1', 'qpp0', 'qpp1', 'fc', 'E'];
  if (need.some((k) => !(num(d[k]) > 0))) return { error: 'Completá las dimensiones del edificio, la velocidad del viento, las cargas, el hormigón y la platea con valores mayores que cero.' };
  const bad = walls.find((w) => !(num(w.e) > 0) || !(num(w.lw) > 0) || (w.kind === 'U' && !(num(w.lf) > 0)));
  if (bad) return { error: `Revisá las dimensiones del tabique ${bad.name}: espesor y largos mayores que cero.` };
  const p = { ...d, walls };
  return { kind: 'tower', input: p, res: T.designTower(p) };
}

// ---------------------------------------------------------------- figuras
function wallRects(w, B) {
  const e = num(w.e, 0.2); const lw = num(w.lw); const x = num(w.x); const y = num(w.y);
  if (w.kind === 'U') {
    const lf = num(w.lf); const xo = T.wallProps({ ...w, kind: 'U' }, 1).xOuter;
    const left = x < B / 2;
    const xl = left ? x - xo : x + xo - lf;
    const webX = left ? xl : xl + lf - e;
    return [{ x: webX, y: y - lw / 2, w: e, h: lw }, { x: xl, y: y - lw / 2 - e, w: lf, h: e }, { x: xl, y: y + lw / 2, w: lf, h: e }];
  }
  return [{ x: x - e / 2, y: y - lw / 2, w: e, h: lw }];
}

function planFigure(d, r) {
  const B = num(d.B, 20); const L = num(d.L, 16);
  const W = 560; const k = Math.min(400 / B, 230 / L);
  const x0 = 70; const y0 = 40;
  const X = (m) => x0 + m * k; const Y = (m) => y0 + m * k;
  let s = `<rect x="${X(0)}" y="${Y(0)}" width="${B * k}" height="${L * k}" fill="var(--accent)" fill-opacity="0.05" stroke="var(--ink-soft)" stroke-dasharray="5 3"/>`;
  (d.walls || []).forEach((w) => {
    wallRects(w, B).forEach((q) => { s += `<rect x="${X(q.x)}" y="${Y(q.y)}" width="${Math.max(q.w * k, 2)}" height="${Math.max(q.h * k, 2)}" fill="var(--ink)"/>`; });
    const lab = w.kind === 'U' ? { x: X(num(w.x)), y: Y(num(w.y)) + 4 } : { x: X(num(w.x)) + (num(w.x) < B / 2 ? 14 : -14), y: Y(num(w.y)) + 4 };
    s += `<text x="${lab.x}" y="${lab.y}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent-ink)">${escapeHtml(w.name)}</text>`;
  });
  s += `<line x1="${X(0)}" y1="${Y(0) - 16}" x2="${X(B)}" y2="${Y(0) - 16}" stroke="var(--accent)"/><line x1="${X(0)}" y1="${Y(0) - 20}" x2="${X(0)}" y2="${Y(0) - 12}" stroke="var(--accent)"/><line x1="${X(B)}" y1="${Y(0) - 20}" x2="${X(B)}" y2="${Y(0) - 12}" stroke="var(--accent)"/><text x="${X(B / 2)}" y="${Y(0) - 22}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">B = ${fmt(B, 1)} m (cara mayor, perpendicular al viento)</text>`;
  s += `<line x1="${X(0) - 16}" y1="${Y(0)}" x2="${X(0) - 16}" y2="${Y(L)}" stroke="var(--accent)"/><line x1="${X(0) - 20}" y1="${Y(0)}" x2="${X(0) - 12}" y2="${Y(0)}" stroke="var(--accent)"/><line x1="${X(0) - 20}" y1="${Y(L)}" x2="${X(0) - 12}" y2="${Y(L)}" stroke="var(--accent)"/><text x="${X(0) - 22}" y="${(Y(0) + Y(L)) / 2 + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 1)} m</text>`;
  const ya = Y(L) + 30;
  for (const fx of [0.25, 0.5, 0.75]) s += `<line x1="${X(B * fx)}" y1="${ya}" x2="${X(B * fx)}" y2="${Y(L) + 6}" stroke="var(--warn)" stroke-width="2"/><path d="M ${X(B * fx)} ${Y(L) + 4} l -4 8 h 8 z" fill="var(--warn)"/>`;
  s += `<text x="${X(B / 2)}" y="${ya + 14}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--warn)">viento W</text>`;
  if (r && Math.abs(r.eRot) > 0.005) {
    s += `<line x1="${X(r.xr)}" y1="${Y(0) - 2}" x2="${X(r.xr)}" y2="${Y(L) + 2}" stroke="var(--bad)" stroke-dasharray="4 3"/><text x="${X(r.xr) + 4}" y="${Y(L) - 6}" font-size="11" fill="var(--bad)">centro de rigidez (e = ${fmt(r.eRot, 2)} m)</text>`;
  }
  s += `<text x="${X(B)}" y="${Y(L) + 56}" text-anchor="end" font-size="11" fill="var(--ink-soft)">Planta, medidas en m · tabiques en negro</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(L) + 66)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Planta de la torre con los tabiques">${s}</svg>`;
}

function elevationFigure(d, r) {
  const nT = Math.max(1, Math.round(num(d.nTipo, 20))); const hT = num(d.hTipo, 3); const hPB = num(d.hPB, 4);
  const nS = Math.round(num(d.nSub, 0)); const hS = num(d.hSub, 3);
  const h = hPB + nT * hT;
  const W = 560; const k = Math.min(300 / (h + nS * hS), 4);
  const gx = 170; const bw = 70; const yTop = 26;
  const Y = (z) => yTop + (h - z) * k;
  let s = `<rect x="${gx}" y="${Y(h)}" width="${bw}" height="${h * k}" fill="var(--accent-soft)" stroke="var(--ink)" stroke-width="1.4"/>`;
  for (let i = 0; i <= nT; i++) { const z = hPB + i * hT; s += `<line x1="${gx}" y1="${Y(z)}" x2="${gx + bw}" y2="${Y(z)}" stroke="var(--ink-soft)" stroke-width="0.6"/>`; }
  if (nS > 0) s += `<rect x="${gx - 8}" y="${Y(0)}" width="${bw + 16}" height="${nS * hS * k}" fill="var(--line)" fill-opacity="0.5" stroke="var(--ink)" stroke-dasharray="4 3"/>`;
  s += `<line x1="${gx - 60}" y1="${Y(0)}" x2="${gx + bw + 60}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="2.2"/><text x="${gx + bw + 62}" y="${Y(0) + 4}" font-size="11" fill="var(--ink-soft)">0,00</text>`;
  // diagrama de viento (a la izquierda)
  const lv = r ? r.wind : null;
  const pmax = lv ? Math.max(...lv.map((l) => l.pTm2)) : 0.12;
  const sc = 80 / Math.max(pmax, 1e-6);
  if (lv) {
    const pts = lv.filter((l) => l.z > 0).map((l) => `${gx - 6 - l.pTm2 * sc},${Y(l.z)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--warn)" stroke-width="1.6"/>`;
    lv.filter((l) => l.z > 0).forEach((l, i) => { if (i % 3 === 0 || l.z === h) s += `<line x1="${gx - 6 - l.pTm2 * sc}" y1="${Y(l.z)}" x2="${gx - 6}" y2="${Y(l.z)}" stroke="var(--warn)" stroke-width="0.9"/><path d="M ${gx - 6} ${Y(l.z)} l -6 -3.5 v 7 z" fill="var(--warn)"/>`; });
    const top = lv[lv.length - 1]; const bot = lv[1];
    s += `<text x="${gx - 8 - top.pTm2 * sc}" y="${Y(top.z) - 6}" text-anchor="end" font-size="11" font-weight="600" fill="var(--warn)">p = ${fmt(top.pTm2, 4)} t/m² (z = ${fmt(top.z, 0)} m)</text>`;
    s += `<text x="${gx - 8 - bot.pTm2 * sc}" y="${Y(bot.z) + 14}" text-anchor="end" font-size="11" font-weight="600" fill="var(--warn)">${fmt(bot.pTm2, 4)} t/m² (z = ${fmt(bot.z, 0)} m)</text>`;
  } else s += `<text x="${gx - 8}" y="${Y(h) + 10}" text-anchor="end" font-size="11" fill="var(--warn)">viento</text>`;
  const xr = gx + bw + 22;
  s += `<line x1="${xr}" y1="${Y(h)}" x2="${xr}" y2="${Y(0)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(h)}" x2="${xr + 4}" y2="${Y(h)}" stroke="var(--accent)"/><line x1="${xr - 4}" y1="${Y(0)}" x2="${xr + 4}" y2="${Y(0)}" stroke="var(--accent)"/><text x="${xr + 8}" y="${(Y(h) + Y(0)) / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">h = ${fmt(h, 0)} m</text>`;
  s += `<text x="${xr + 8}" y="${Y(h) + 16}" font-size="11" fill="var(--ink-soft)">${nT} plantas tipo de ${fmt(hT, 1)} m</text><text x="${xr + 8}" y="${Y(hPB / 2) + 4}" font-size="11" fill="var(--ink-soft)">P. Baja ${fmt(hPB, 1)} m</text>`;
  if (nS > 0) s += `<text x="${xr + 8}" y="${Y(-nS * hS / 2) + 4}" font-size="11" fill="var(--ink-soft)">${nS} subsuelo${nS > 1 ? 's' : ''} de ${fmt(hS, 1)} m</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(Y(-nS * hS) + 30)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Elevación de la torre y diagrama de viento">${s}</svg>`;
}

// ---------------------------------------------------------------- tablas
function windTable(r, d) {
  const top = r.wind.length - 1;
  const q0 = num(d.qpp0); const q1 = num(d.qpp1);
  const lines = r.wind.map((l, i) => {
    const slabs = top - i + 1;
    return `<tr><td>${l.name}</td><td style="text-align:right;">${fmt(l.z, 0)}</td><td style="text-align:right;">${fmt(l.Kz, 3)}</td><td style="text-align:right;">${fmt(l.qz, 1)}</td><td style="text-align:right;">${fmt(l.pt, 1)}</td><td style="text-align:right;">${fmt(l.pTm2, 4)}</td><td style="text-align:right;">${fmt(l.W, 2)}</td><td style="text-align:right;">${fmt(l.Q, 1)}</td><td style="text-align:right;">${fmt(l.M, 0)}</td><td style="text-align:right;">${fmt(q0 * r.B * r.L * slabs, 0)}</td><td style="text-align:right;">${fmt(q1 * r.B * r.L * slabs, 0)}</td></tr>`;
  });
  for (let s = 1; s <= r.nSub; s++) {
    const z = -s * r.hSub;
    lines.push(`<tr><td>${s}º subsuelo</td><td style="text-align:right;">${fmt(z, 0)}</td><td style="text-align:right;">—</td><td style="text-align:right;">—</td><td style="text-align:right;">—</td><td style="text-align:right;">—</td><td style="text-align:right;">0,00</td><td style="text-align:right;">${fmt(r.Q0, 1)}</td><td style="text-align:right;">${fmt(r.M0 + r.Q0 * r.hSub * s, 0)}</td><td style="text-align:right;">${fmt(q0 * (r.B * r.L * (top + 1) + r.B1 * r.L1 * s), 0)}</td><td style="text-align:right;">${fmt(q1 * (r.B * r.L * (top + 1) + r.B1 * r.L1 * s), 0)}</td></tr>`);
  }
  return `<div class="table-wrap" style="max-height:420px; overflow:auto;"><table class="data-table"><thead><tr><th>Nivel</th><th style="text-align:right;">z (m)</th><th style="text-align:right;">Kz</th><th style="text-align:right;">qz (N/m²)</th><th style="text-align:right;">p conjunta (N/m²)</th><th style="text-align:right;">p (t/m²)</th><th style="text-align:right;">W (t)</th><th style="text-align:right;">Q (t)</th><th style="text-align:right;">M (tm)</th><th style="text-align:right;">N sin sobrec. (t)</th><th style="text-align:right;">N con sobrec. (t)</th></tr></thead><tbody>${lines.join('')}</tbody></table></div>`;
}

const wallPieces = (w) => (w.kind === 'rect' ? [{ fx: w.fx, name: w.name }] : [{ fx: w.fxWeb, name: `${w.name} alma` }]);

function wallTable(r) {
  const rows = [];
  r.walls.forEach((w) => {
    wallPieces(w).forEach(({ fx, name }) => {
      rows.push(`<tr><td>${escapeHtml(name)}<br><span class="text-muted" style="font-size:11.5px;">M = ${tn(fx.M, 1)} tm · W = ${tn(fx.W, 3)} m³</span></td><td style="text-align:right;">${tn(fx.N0, 0)} / ${tn(fx.N1, 0)}</td>
        <td style="text-align:right;">${fx.sd[0] > 0 ? '+' : ''}${tn(fx.sd[0], 0)} / ${tn(fx.sd[1], 0)}</td><td style="text-align:right;">${fx.sc[0] > 0 ? '+' : ''}${tn(fx.sc[0], 0)} / <b>${tn(fx.sc[1], 0)}</b></td>
        <td style="text-align:right;">${tn(fx.As, 1)} cm² → Ø${r.barD} c/${tn(fx.vert.s, 1)} (${fx.vert.n} por capa) · Ø${r.barDh} c/${tn(fx.hor.s, 1)}${fx.AsT > 0 ? `<br><span class="text-muted" style="font-size:11.5px;">tracción: x = ${tn(fx.x, 2)} m, T = ${tn(fx.T, 1)} t, As = ${tn(fx.AsT, 2)} cm²</span>` : ''}</td></tr>`);
    });
    if (w.kind === 'U') rows.push(`<tr><td>${escapeHtml(w.name)} ala comprimida<br><span class="text-muted" style="font-size:11.5px;">par M / z = ${tn(w.flange.M, 0)} / ${tn(w.flange.z, 2)}</span></td><td style="text-align:right;">${tn(w.flange.N, 0)} t</td><td style="text-align:right;">—</td><td style="text-align:right;"><b>${tn(w.flange.sigma * 10, 0)}</b> t/m²</td><td style="text-align:right;">${tn(w.flange.As, 1)} cm² → Ø${r.barD} c/${tn(w.flange.vert.s, 1)} (${w.flange.vert.n} por capa)</td></tr>`);
  });
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tabique (nivel 0,00)</th><th style="text-align:right;">N sin / con sobrec. (t)</th><th style="text-align:right;">σ sin sobrec. (t/m²)</th><th style="text-align:right;">σ con sobrec. (t/m²)</th><th>Armadura (dos capas)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------- pasos
function wallsEditor(d) {
  const inp = (i, k, v, step = 'any') => `<input type="number" step="${step}" min="0" data-f="design.walls.${i}.${k}" data-num value="${v ?? ''}" style="width:72px;" />`;
  const rows = (d.walls || []).map((w, i) => `<tr><td><input data-f="design.walls.${i}.name" value="${escapeHtml(w.name)}" style="width:64px;" /></td><td>${w.kind === 'U' ? 'En U' : 'Recto'}</td>
    <td>${inp(i, 'e', w.e)}</td><td>${inp(i, 'lw', w.lw)}</td><td>${w.kind === 'U' ? inp(i, 'lf', w.lf) : '—'}</td><td>${inp(i, 'x', w.x)}</td><td>${inp(i, 'y', w.y)}</td>
    <td>${w.kind === 'U' ? inp(i, 'inflWeb', w.inflWeb) : inp(i, 'infl', w.infl)}</td><td>${w.kind === 'U' ? inp(i, 'inflFl', w.inflFl) : '—'}</td><td>${w.kind === 'U' ? '—' : inp(i, 'hd', w.hd)}</td>
    <td><button type="button" class="btn btn-sm btn-danger" data-del-wall="${i}" aria-label="Quitar el tabique ${escapeHtml(w.name)}">quitar</button></td></tr>`).join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tabique</th><th>Tipo</th><th>Espesor e (m)</th><th>Largo (alma) (m)</th><th>Alas (m)</th><th>x (m)</th><th>y (m)</th><th>Área de influencia (alma o tabique) (m²)</th><th>Área de influencia de cada ala (m²)</th><th>Dintel (m)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;"><button type="button" class="btn btn-sm" data-add-wall="rect">+ Tabique recto</button><button type="button" class="btn btn-sm" data-add-wall="U">+ Tabique en U</button></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los tabiques son paralelos al viento. x: posición a lo largo de B desde el borde izquierdo (en los tabiques en U, la del baricentro); y: posición a lo largo de L desde el borde superior (solo para el dibujo). El área de influencia es la zona de losa que descarga sobre cada pieza (en la guía: 10,5 m² por tabique recto; 17,2 m² el alma y 30,4 m² cada ala del tabique en U). Dintel: altura del dintel sobre una abertura de la fachada (0 = sin abertura).</p>`;
}

function step1(calc) {
  const d = calc.design; const out = compute(calc); const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Torre de hormigón armado con tabiques contraviento</h3>${elevationFigure(d, r)}
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.B', 'Cara mayor B (perpendicular al viento)', d.B, { unit: 'm' })}${numField('design.L', 'Cara menor L (paralela al viento)', d.L, { unit: 'm' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.nTipo', 'Plantas tipo', d.nTipo, { step: 1 })}${numField('design.hTipo', 'Altura de planta tipo', d.hTipo, { unit: 'm' })}${numField('design.hPB', 'Altura de planta baja', d.hPB, { unit: 'm' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.nSub', 'Subsuelos', d.nSub, { step: 1 })}${numField('design.hSub', 'Altura de cada subsuelo', d.hSub, { unit: 'm', hint: 'La guía rotula −4 y −8 m pero calcula el momento con 3 m por subsuelo.' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.B1', 'Platea: ancho B1 (perpendicular al viento)', d.B1, { unit: 'm' })}${numField('design.L1', 'Platea: largo L1 (paralelo al viento)', d.L1, { unit: 'm' })}</div>
      <p class="text-muted" style="font-size:12px; margin:0;">${r ? `Esbeltez λ = h / lado menor = ${fmt(r.slender, 2)} (torre si > 3) · altura total h = ${fmt(r.h, 0)} m.` : ''}</p></div>
    <div class="card"><h3 style="margin-top:0;">Planta y tabiques</h3>${planFigure(d, r)}</div>
    <div class="card" style="grid-column:1 / -1;"><h3 style="margin-top:0;">Tabiques contraviento</h3>${wallsEditor(d)}</div>
    <div class="card"><h3 style="margin-top:0;">Viento (CIRSOC 102-2005)</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.V', 'Velocidad básica V', d.V, { unit: 'm/s', hint: 'Neuquén: 48 m/s (Fig. 1 del reglamento).' })}${selField('design.exposure', 'Categoría de exposición', d.exposure, Object.entries(T.EXPOSURES), 'Sistema principal resistente (caso 2). La guía usa A.')}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.Kd', 'Direccionalidad Kd', d.Kd, { hint: 'Edificios: 0,85.' })}${numField('design.I', 'Importancia I', d.I, { hint: 'Categoría II: 1,00.' })}${numField('design.Kzt', 'Topografía Kzt', d.Kzt, { hint: 'Planicie: 1.' })}</div>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.G', 'Factor de ráfaga G', d.G, { hint: 'Edificio rígido: 0,85.' })}${numField('design.gcpi', 'GCpi (edificio cerrado)', d.gcpi, { hint: '±0,18; en la acción conjunta se compensa.' })}</div></div>
    <div class="card"><h3 style="margin-top:0;">Cargas verticales</h3>
      <div class="field-row" style="flex-wrap:wrap;">${numField('design.qpp0', 'Peso de cada losa, sin sobrecarga', d.qpp0, { unit: 't/m²', hint: 'Guía: 0,7.' })}${numField('design.qpp1', 'Peso de cada losa, con sobrecarga', d.qpp1, { unit: 't/m²', hint: 'Guía: 0,9.' })}</div>
      <p class="text-muted" style="font-size:12px; margin:0;">Incluye losas, contrapisos, tabiquería, columnas, vigas y sobrecarga de uso (en la guía, por piso). Se aplica a las ${num(d.nTipo) + 2} losas (azotea, plantas y planta baja) y a los subsuelos.</p></div></div>
    <div class="note" style="margin-top:16px;">${TOWER_NOTE}</div>`;
}

// Verificación gráfica al volcamiento: la resultante de G y W debe caer en el tercio medio de la base (núcleo central) para que no haya tracción en la junta base-suelo
function resultantFigure(r) {
  const L1 = r.L1; const W = 560; const k = 400 / L1; const x0 = 80; const yb = 96;
  const X = (m) => x0 + m * k;
  const xe = X(L1 / 2 + (r.e0 || 0));                                          // la resultante se corre hacia sotavento (e = M / N)
  const inCore = Math.abs(r.e0) <= L1 / 6 + 1e-9;
  const col = inCore ? 'var(--good, #2e8b57)' : 'var(--bad)';
  let s = `<rect x="${X(L1 / 3)}" y="${yb}" width="${L1 / 3 * k}" height="16" fill="var(--accent)" fill-opacity="0.18"/><rect x="${X(0)}" y="${yb}" width="${L1 * k}" height="16" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
  s += `<line x1="${X(L1 / 3)}" y1="${yb - 4}" x2="${X(L1 / 3)}" y2="${yb + 20}" stroke="var(--ink)"/><line x1="${X(2 * L1 / 3)}" y1="${yb - 4}" x2="${X(2 * L1 / 3)}" y2="${yb + 20}" stroke="var(--ink)"/>`;
  s += `<text x="${X(L1 / 6)}" y="${yb + 34}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">L1 / 3</text><text x="${X(L1 / 2)}" y="${yb + 34}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--accent-ink)">núcleo central (L1 / 3)</text><text x="${X(5 * L1 / 6)}" y="${yb + 34}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">L1 / 3</text>`;
  s += `<line x1="${xe}" y1="${yb - 60}" x2="${xe}" y2="${yb}" stroke="${col}" stroke-width="2.4"/><path d="M ${xe} ${yb} l -5 -9 h 10 z" fill="${col}"/><text x="${xe}" y="${yb - 66}" text-anchor="middle" font-size="12" font-weight="700" fill="${col}">R (e = ${fmt(r.e0, 2)} m)</text>`;
  s += `<line x1="${X(L1 / 2)}" y1="${yb - 24}" x2="${X(L1 / 2)}" y2="${yb}" stroke="var(--ink-soft)" stroke-dasharray="3 3"/><text x="${X(L1 / 2) - 6}" y="${yb - 28}" text-anchor="end" font-size="11" fill="var(--ink-soft)">G (centro de la base)</text>`;
  s += `<text x="${X(0)}" y="${yb + 56}" font-size="11.5" font-weight="600" fill="${col}">${inCore ? 'La resultante cae dentro del núcleo central: no hay tracción entre la base y el suelo.' : 'La resultante cae fuera del núcleo central: aparecen tracciones en la junta base-suelo; ensanchá la base.'}</text>`;
  return `<svg viewBox="0 0 ${W} ${yb + 66}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Resultante de G y W respecto del núcleo central de la base">${s}</svg>`;
}

// Cómo trabajan los tabiques en planta (traslación o rototraslación) y qué dice la cátedra de cada disposición
function behaviorCard(r) {
  const b = r.behavior;
  return `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Comportamiento de los tabiques en planta</h3>
    <table class="data-table"><tbody>
      <tr><td>Movimiento del edificio</td><td style="text-align:right;"><b>${escapeHtml(b.mode)}</b></td></tr>
      <tr><td>Tabiques paralelos al viento · perpendiculares</td><td style="text-align:right;">${b.nPar} · ${b.nPer}</td></tr>
      <tr><td>Σ de los momentos de los tabiques · momento del viento Mw</td><td style="text-align:right;">${fmt(b.sumMj, 0)} · ${fmt(b.M0, 0)} tm</td></tr></tbody></table>
    <p style="font-size:12.5px; margin:8px 0 0;">${escapeHtml(b.modeText)}</p>
    <p class="text-muted" style="font-size:12px; margin:6px 0 0;">${escapeHtml(b.text)} La suma de los momentos de los tabiques debe ser igual al momento del viento.</p></div>`;
}

// Sistemas estructurales según la cantidad de pisos (resumen de la cátedra)
function systemsCard(r) {
  return `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Sistemas estructurales según la altura <span class="text-muted" style="font-weight:400; font-size:12.5px;">(${r.floors} pisos sobre el nivel 0,00)</span></h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Sistema</th><th style="text-align:right;">Hasta</th><th>Cómo trabaja</th><th>Para este edificio</th></tr></thead><tbody>
    ${r.systems.map((q) => `<tr><td><b>${escapeHtml(q.name)}</b>${q.id === 'tabiques' ? ' <span class="tag tag-media">el que se calcula acá</span>' : ''}</td><td style="text-align:right;">${q.max} pisos</td><td>${escapeHtml(q.text)}</td><td>${q.ok ? '<span class="tag tag-freelance">alcanza</span>' : '<span class="tag tag-alta">no alcanza</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los tabiques de hormigón trabajan a flexocompresión como una gran ménsula empotrada en el suelo. Con λ entre 5 y 10 se debe considerar estructura contraviento; con λ &gt; 10 hacen falta estudios especiales. Una torre con basamento (podio) necesita una junta constructiva entre ambos, porque tienen distinta rigidez.</p></div>`;
}

function step2(calc) {
  const out = compute(calc); const d = calc.design;
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res;
  return `<div class="grid grid-2" style="align-items:start;">
    <div class="card"><h3 style="margin-top:0;">Viento sobre la cara mayor</h3><table class="data-table"><tbody>
      <tr><td>Presión dinámica a la altura total qh = 0,613 Kzt Kd V² I Kz(h)</td><td style="text-align:right;"><b>${fmt(r.qh, 1)} N/m²</b></td></tr>
      <tr><td>Cp barlovento · Cp sotavento (L / B = ${fmt(r.LB, 2)})</td><td style="text-align:right;">${fmt(r.CpW, 1)} · ${fmt(r.CpL, 1)}</td></tr>
      <tr><td>Período T = 0,08 h / √L · √(h / (L + h)) · frecuencia</td><td style="text-align:right;">${fmt(r.T, 2)} s · ${fmt(r.freq, 2)} Hz</td></tr>
      <tr><td>Esbeltez h / lado menor (torre si &gt; 3)</td><td style="text-align:right;">${fmt(r.slender, 2)}</td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">p = qz G Cp − qh GCpi a barlovento y qh G Cp − qh GCpi a sotavento; la acción conjunta suma presión y succión (la presión interna se anula). 1 kg = 10 N, como en los apuntes.</p></div>
    <div class="card"><h3 style="margin-top:0;">Esfuerzos en la base</h3><table class="data-table"><tbody>
      <tr><td>Corte en el nivel 0,00 · momento en el nivel 0,00</td><td style="text-align:right;"><b>${fmt(r.Q0, 1)} t · ${fmt(r.M0, 0)} tm</b></td></tr>
      <tr><td>Momento al pie de la platea (${r.nSub} subsuelo${r.nSub === 1 ? '' : 's'} de ${fmt(r.hSub, 1)} m)</td><td style="text-align:right;"><b>${fmt(r.Mbase, 0)} tm</b></td></tr>
      <tr><td>Peso del edificio sin · con sobrecarga (${r.nLos} losas)</td><td style="text-align:right;"><b>${fmt(r.G0, 0)} t · ${fmt(r.G1, 0)} t</b></td></tr>
      <tr><td>Inercia total de los tabiques en la planta ΣJ</td><td style="text-align:right;">${fmt(r.sumJ, 2)} m⁴</td></tr></tbody></table></div>
    <div class="card" style="grid-column:1 / -1;"><h3 style="margin-top:0;">Planilla de características por nivel</h3>${windTable(r, d)}
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">El corte y el momento de cada nivel son los de las cargas de viento que están por encima. La fuerza de cada piso es la presión por el ancho B y por la altura tributaria (media planta hacia arriba y hacia abajo); el nivel del terreno no recibe viento.</p></div></div>`;
}

function step3(calc, out) {
  if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
  const r = out.res; const d = calc.design;
  const data = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.fc', 'Hormigón: σbk (H-30 = 300)', d.fc, { unit: 'kg/cm²' })}${numField('design.E', 'Módulo de elasticidad', d.E, { unit: 'kg/cm²', hint: 'Guía (H-30): 340000.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaBadm', 'Compresión admisible del hormigón (0 = automática)', d.sigmaBadm, { unit: 'kg/cm²', hint: `Automática: (σbk + 0,8 % × 4200) / ${fmt(num(d.gammaSeg, 2.5), 1)} = ${fmt(r.sBadm, 1)} (criterio de las guías de columnas; la de tabiques solo dice que verifica para H-30).` })}${numField('design.gammaSeg', 'Coeficiente de seguridad', d.gammaSeg, { hint: 'Guías de columnas: 2,5.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.tauAdm', 'Corte admisible', d.tauAdm, { unit: 'kg/cm²', hint: 'Guía (H-30): 24.' })}${numField('design.sigmaS', 'Acero (AB-42)', d.sigmaS, { unit: 'kg/cm²', hint: 'Guía: 2400.' })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${numField('design.sigmaT', 'Tensión admisible del terreno', d.sigmaT, { unit: 'kg/cm²', hint: 'Guía: 1,9 (sale del estudio de suelo).' })}${numField('design.flechaRatio', 'Flecha admisible h /', d.flechaRatio, { step: 1 })}</div>
    <div class="field-row" style="flex-wrap:wrap;">${selField('design.barD', 'Barras verticales', d.barD, [8, 10, 12, 16, 20].map((x) => [x, `Ø${x} mm`]), 'Mínimo Ø8 c/20 (CIRSOC 201).')}${selField('design.barDh', 'Barras horizontales', d.barDh, [6, 8, 10].map((x) => [x, `Ø${x} mm`]), 'Fe horizontal = 1/5 Fe vertical, mínimo Ø6 c/25.')}</div></div>`;
  const notes = r.notes.map((n) => `<div class="note" style="margin-top:12px;">${escapeHtml(n)}</div>`).join('') + systemsCard(r);
  const soil = `<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Verificación gráfica al volcamiento</h3>${resultantFigure(r)}<table class="data-table"><tbody>
    <tr><td>Resultante e = M / N (núcleo central L1 / 6)</td><td style="text-align:right;">${fmt(r.e0, 2)} m (${fmt(r.L1 / 6, 2)} m)</td></tr>
    <tr><td>Tensión del terreno σ máx · σ mín</td><td style="text-align:right;">${fmt(r.sMax, 2)} · ${fmt(r.sMin, 2)} t/m²</td></tr>
    <tr><td>Flecha en cabeza f · admisible</td><td style="text-align:right;">${fmt(r.defl.f * 100, 1)} · ${fmt(r.defl.fAdm * 100, 1)} cm</td></tr></tbody></table></div>`;
  return `<div class="grid grid-2" style="align-items:start;"><div>${data}${notes}</div><div>${checksCard({ ok: r.ok, checks: r.checks })}${soil}${behaviorCard(r)}</div>
    <div class="card" style="grid-column:1 / -1;"><h3 style="margin-top:0;">Flexocompresión de los tabiques en el nivel 0,00</h3>${wallTable(r)}
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">σ = −N / F ± M / W (negativa = compresión). M es la parte del momento flector total que toma cada pieza, proporcional a su inercia (en el tabique en U, el alma y las alas por separado). Las alas forman un par de brazo z = largo del alma + espesor. Los esfuerzos del viento son reversibles: la armadura se reparte en forma simétrica. La armadura mínima es el 0,8 % de la sección (la guía, con x = 78 cm, obtiene T = 10,7 t; por semejanza de triángulos con las tensiones de la planilla da x = ${fmt(r.walls[0]?.fx?.x ?? 0, 2)} m).</p></div></div>`;
}

function memoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const r = out.res; const d = calc.design;
  const top = r.wind.length - 1;
  const lvlRows = r.wind.map((l, i) => memoRow(`${l.name} (z = ${fmt(l.z, 0)} m)`, `Kz = ${fmt(l.Kz, 3)} · qz = ${fmt(l.qz, 1)} N/m² · p = ${fmt(l.pTm2, 4)} t/m² · W = ${fmt(l.W, 2)} t · Q = ${fmt(l.Q, 1)} t · M = ${fmt(l.M, 0)} tm · N = ${fmt(num(d.qpp0) * r.B * r.L * (top - i + 1), 0)} / ${fmt(num(d.qpp1) * r.B * r.L * (top - i + 1), 0)} t`)).join('');
  const wallRows = r.walls.map((w) => {
    const a = wallPieces(w).map(({ fx, name }) => memoRow(`${escapeHtml(name)} (nivel 0,00)`, `M = ${tn(fx.M, 1)} tm, W = ${tn(fx.W, 3)} m³ · N = ${tn(fx.N0, 0)} / ${tn(fx.N1, 0)} t · σ sin sobrec. ${tn(fx.sd[0], 0)} / ${tn(fx.sd[1], 0)} t/m², con sobrec. ${tn(fx.sc[0], 0)} / ${tn(fx.sc[1], 0)} t/m² · armadura ${tn(fx.As, 1)} cm²: Ø${r.barD} c/${tn(fx.vert.s, 1)} (${fx.vert.n} por capa), Ø${r.barDh} c/${tn(fx.hor.s, 1)}${fx.AsT > 0 ? ` · tracción x = ${tn(fx.x, 2)} m, T = ${tn(fx.T, 1)} t, As = ${tn(fx.AsT, 2)} cm²` : ''}`)).join('');
    const f = w.kind === 'U' ? memoRow(`${escapeHtml(w.name)} ala comprimida`, `par = ${tn(w.flange.M, 0)} / ${tn(w.flange.z, 2)} = ${tn(w.flange.par, 0)} t · N = ${tn(w.flange.N, 0)} t · σ = ${tn(w.flange.sigma, 1)} kg/cm² · armadura ${tn(w.flange.As, 1)} cm²: Ø${r.barD} c/${tn(w.flange.vert.s, 1)} (${w.flange.vert.n} por capa)`) : '';
    return a + f;
  }).join('');
  const html = `<h2>1. Diseño</h2><table>${memoRow('Tipo', 'Edificio en torre de hormigón armado con tabiques contraviento', 'Guía de predimensionado E4 · 7')}
      ${memoRow('Edificio', `B = ${fmt(d.B, 1)} m · L = ${fmt(d.L, 1)} m · h = ${fmt(r.h, 0)} m (planta baja ${fmt(d.hPB, 1)} m + ${fmt(d.nTipo, 0)} plantas de ${fmt(d.hTipo, 1)} m) · ${r.nSub} subsuelos`)}
      ${memoRow('Platea', `${fmt(d.B1, 1)} × ${fmt(d.L1, 1)} m`)}${memoRow('Hormigón · acero', `σbk = ${fmt(d.fc, 0)} kg/cm² · E = ${fmt(d.E, 0)} kg/cm² · σe = ${fmt(d.sigmaS, 0)} kg/cm²`)}</table>
    ${elevationFigure(d, r)}${planFigure(d, r)}
    <h2>2. Viento (CIRSOC 102-2005)</h2><table>${memoRow('Parámetros', `V = ${fmt(d.V, 0)} m/s · exposición ${escapeHtml(d.exposure)} · Kd = ${d.Kd} · I = ${d.I} · Kzt = ${d.Kzt} · G = ${d.G} · Cp = ${fmt(r.CpW, 1)} / ${fmt(r.CpL, 1)} · GCpi = ±${fmt(r.gcpi, 2)}`)}${memoRow('qh (altura total)', `${fmt(r.qh, 1)} N/m²`)}${memoRow('Período · frecuencia · esbeltez', `T = ${fmt(r.T, 2)} s · ${fmt(r.freq, 2)} Hz · h / lado menor = ${fmt(r.slender, 2)}`)}</table>
    <h2>3. Planilla de características por nivel</h2><table>${lvlRows}</table>
    <h2>4. Estabilidad y fundación</h2>${resultantFigure(r)}<table>${memoRow('Resultante del viento · momento al pie de la platea', `Q = ${fmt(r.Q0, 1)} t · M = ${fmt(r.Mbase, 0)} tm`)}${memoRow('Peso sin · con sobrecarga', `${fmt(r.G0, 0)} t · ${fmt(r.G1, 0)} t`)}${memoRow('Tensión del terreno', `${fmt(r.sMax, 2)} / ${fmt(r.sMin, 2)} t/m² (σ máx = ${fmt(r.sMax / 10, 2)} kg/cm²)`)}${memoRow('Flecha en cabeza', `${fmt(r.defl.f * 100, 1)} cm (admisible ${fmt(r.defl.fAdm * 100, 1)} cm)`)}</table>
    <h2>5. Tabiques contraviento</h2><table>${memoRow('Inercias', `ΣJ = ${fmt(r.sumJ, 2)} m⁴ · centro de rigidez x = ${fmt(r.xr, 2)} m (e = ${fmt(r.eRot, 2)} m)`)}${memoRow('Comportamiento en planta', `${r.behavior.mode}: ${escapeHtml(r.behavior.text)} Σ Mj = ${fmt(r.behavior.sumMj, 0)} tm = Mw = ${fmt(r.behavior.M0, 0)} tm.`)}${wallRows}</table>
    <h2>6. Verificaciones</h2><table>${r.checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>
    ${r.notes.map((n) => `<p class="mem-foot">${escapeHtml(n)}</p>`).join('')}
    <h2>7. Resultado</h2><table>${memoRow('Torre', r.ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(TOWER_NOTE)}</p>`;
  return { title: calc.name, sub: `Torre con tabiques · h = ${fmt(r.h, 0)} m`, html };
}

export const towerModule = {
  label: 'Edificio en torre de hormigón armado (tabiques)',
  defaults() { return { design: defaults(), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} }; },
  input(calc) { return calc.design; },
  run(calc) { return compute(calc); },
  wire(root, calc) {
    root.querySelectorAll('[data-add-wall]').forEach((b) => b.addEventListener('click', () => {
      const ws = [...(calc.design.walls || [])];
      const u = b.dataset.addWall === 'U';
      const n = ws.filter((w) => (w.kind === 'U') === u).length + 1;
      ws.push(u ? { ...uWall(`TU${n}`, num(calc.design.B, 20) / 2), y: num(calc.design.L, 16) / 2 } : { ...rectWall(`TR${n}`, num(calc.design.B, 20) / 2, num(calc.design.L, 16) / 2) });
      setCalcField(calc.id, 'chosen', null);
      setCalcField(calc.id, 'design.walls', ws);
    }));
    root.querySelectorAll('[data-del-wall]').forEach((b) => b.addEventListener('click', () => {
      const ws = (calc.design.walls || []).filter((_, i) => i !== Number(b.dataset.delWall));
      if (!ws.length) { showToast('Tiene que quedar al menos un tabique.'); return; }
      setCalcField(calc.id, 'chosen', null);
      setCalcField(calc.id, 'design.walls', ws);
    }));
  },
  step1, step2, step3, memoria,
};
