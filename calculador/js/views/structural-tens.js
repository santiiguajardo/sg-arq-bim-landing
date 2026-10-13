// Estructuras de grandes luces traccionadas: cercha Jawerth, cubierta pesada, paraboloide hiperbólico e hiperboloide de revolución.
// Motor en js/structural/cables.js. FUENTE: guías 1.1 a 1.5 de Tracción del Taller de Estructuras E4 (curso 2024).
import * as C from '../structural/cables.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';

const kg = (v) => fmt(v, 0);
const pill = (ok) => (ok ? '<span class="tag tag-freelance">Verifica</span>' : '<span class="tag tag-alta">No verifica</span>');
const KINDS = { jawerth: 'Cercha Jawerth (guía 1.1)', heavy: 'Cubierta pesada (guía 1.2)', ph: 'Paraboloide hiperbólico (guía 1.4)', hr: 'Hiperboloide de revolución (guía 1.3)' };
export const TENS_NOTE = 'Predimensionado según las guías de Tracción del Taller de Estructuras E4 (2024): la catenaria se resuelve como parábola (flecha del orden del 10 % de la luz), la tensión previa evita la compresión de los cables y la carga de rotura se busca en las tablas de cables. El coeficiente de forma del viento de estas formas no está tabulado: es un valor hipotético que debe verificarse en el cálculo definitivo, y las guías piden tablas de cables del fabricante. Herramienta de apoyo para el predimensionado.';
const CATALOGS = C.CABLE_CATALOGS;
const LAYOUTS = { espacial: 'Cilíndrica espacial: cables superior e inferior desfasados medio módulo', plana: 'Cilíndrica plana (coplanar): los dos cables en el mismo plano vertical', radial: 'Radial: planta circular, con la carga triangular de cada faja' };
const COVERS = { tela: 'Tela estructural (cerramiento y pendolón a la vez)', pend: 'Pendolones inclinados de cable (cubierta aparte)', a: 'Sobre el cable superior: pendolones verticales', b: 'Colgada del cable inferior: pendolones verticales' };
const coversOf = (layout) => (layout === 'espacial' ? ['tela', 'pend'] : layout === 'plana' ? ['a', 'b'] : ['tela', 'pend', 'a', 'b']);
// Un cálculo viejo no tiene el tipo de cercha: se deduce de la cubierta (tela = espacial; a o b = plana)
const jawLayout = (d) => d.layout || (d.cover === 'a' || d.cover === 'b' ? 'plana' : 'espacial');
const jawCover = (d) => { const l = jawLayout(d); const v = coversOf(l); return v.includes(d.cover) ? d.cover : v[0]; };

// ---------------------------------------------------------------- datos
function defaultsFor(kind, variant = '') {
  const base = { kind, L: 30, f: 3, a: 5, Pp: 20, W: 60, beta1: 2, beta2: 2, TpAdopt: 0, catalog: 'guide', nCables: 1,
    windV: 45, windKd: 0.85, windKzt: 1, windI: 1, windKz: 0.94, windG: 0.85, windCp: -0.5, windGCpi: -0.18 };
  if (kind === 'jawerth') {
    const layout = /radial/.test(variant) ? 'radial' : /plana/.test(variant) ? 'plana' : 'espacial';
    const cover = layout === 'plana' ? (/-b$/.test(variant) ? 'b' : 'a') : /pend/.test(variant) ? 'pend' : 'tela';
    return { ...base, layout, cover, b: layout === 'plana' ? 2 : 2.5, sc: 0.5, es: 4, betaA: 60, betaB: 60, hA: 10, hB: 4, k: 1, sigmaSteel: 1400, tubeAD: 40.64, tubeAe: 0.79, tubeBD: 0, tubeBe: 0 };
  }
  if (kind === 'heavy') return { ...base, a: 2.5, Pp: 200, beta1: 0, nCables: 2, ratioMin: 2.5, betaT: 60, sigmaC: 60, rho: 1, windCp: -0.8 };
  if (kind === 'ph') return { ...base, a: 1, TpAdopt: 1650, sCol: 3, hEdge: 0.3, sigmaEdge: 1200, membrane: 'yes', Lb: 20, fb: 2, windCp: -0.76 };
  return { ...base, c: 6, x0: 4, dx: 1.2, nNodes: 6, xAxis: 2.5, nMer: 16, Pp: 20, W: 60, beta1: 1.5, TpAdopt: 0, areasText: '', To: 1000, sigmaSteel: 1400, windKz: 0.68, windCp: -0.76 };
}
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

function windSuggestion(d) {
  const qh = 0.613 * num(d.windV) ** 2 * num(d.windKd) * num(d.windKzt) * num(d.windI) * num(d.windKz);        // N/m²
  const p = qh * (num(d.windG) * num(d.windCp) - num(d.windGCpi));
  return { qh, pN: p, pKg: p / 10 };
}

function compute(calc) {
  const d = calc.design;
  const kind = d.kind;
  const p = { L: num(d.L), f: num(d.f), a: num(d.a), Pp: num(d.Pp), W: num(d.W), beta1: num(d.beta1), beta2: num(d.beta2, 2), TpAdopt: num(d.TpAdopt), catalog: d.catalog || 'guide', nCables: num(d.nCables, 1) };
  if (kind === 'hr') {
    const areas = String(d.areasText || '').split(/[\s;]+/).join(',').split(',').map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
    const q = { c: num(d.c), x0: num(d.x0), dx: num(d.dx), nNodes: num(d.nNodes), xAxis: num(d.xAxis), nMer: num(d.nMer), Pp: p.Pp, W: p.W, beta1: num(d.beta1, 1.5), beta2: p.beta2, TpAdopt: p.TpAdopt, To: num(d.To, 1000), catalog: p.catalog, sigmaSteel: num(d.sigmaSteel, 1400), areas: areas.length ? areas : null };
    if (![q.c, q.dx, q.nMer, q.Pp].every((v) => v > 0) || !(q.nNodes >= 3) || !(q.x0 > q.xAxis)) return { error: 'Completá la hipérbola (c, x inicial, paso, nudos), el eje de giro (menor que x inicial), los meridianos y el peso propio con valores válidos.' };
    return { kind, input: q, res: C.designHyperboloid(q) };
  }
  if (![p.L, p.f, p.a, p.Pp].every((v) => v > 0) || !(p.W >= 0)) return { error: 'Completá la luz, la flecha, el área de influencia y el peso propio con valores mayores que cero.' };
  if (p.f / p.L < 0.05 || p.f / p.L > 0.35) return { error: 'La flecha tiene que estar entre el 5 % y el 35 % de la luz (las guías usan el 10 %).' };
  if (kind === 'heavy') {
    const res = C.designHeavyRoof({ ...p, ratioMin: num(d.ratioMin, 2.5) });
    const sup = C.planarSupport({ R: res.Rmax, thetaDeg: res.slopeDeg, betaDeg: num(d.betaT, 60) });
    const tensor = C.selectCable(p.catalog, sup.T * res.beta2, 1);
    const col = C.concreteColumnGuide({ N: sup.C, sigma: num(d.sigmaC, 60), rho: num(d.rho, 1) / 100 });
    return { kind, input: p, res, sup, tensor, col };
  }
  if (kind === 'ph') {
    const hy = C.designHypar({ ...p, beta1: p.beta1 || 2, sCol: num(d.sCol, 3), hEdge: num(d.hEdge, 0.3), sigmaEdge: num(d.sigmaEdge, 1200), membrane: d.membrane !== 'no' });
    let edgeCable = null;
    if (hy.strip) edgeCable = C.edgeCable({ qe5: hy.stripRc, Lb: num(d.Lb, 20), fb: num(d.fb, 2), beta2: p.beta2, catalog: p.catalog, nCables: 2 });
    return { kind, input: p, res: hy, net: hy.net, edgeCable };
  }
  // jawerth
  const layout = jawLayout(d); const cover = jawCover(d);
  const jp = { ...p, layout, cover, b: num(d.b, 2), hA: num(d.hA, 10), hB: num(d.hB, 4), sc: d.sc === undefined ? 0.5 : num(d.sc), es: d.es === undefined ? 4 : num(d.es), sigmaSteel: num(d.sigmaSteel, 1400) };
  if (cover !== 'tela' && !(jp.b > 0)) return { error: 'Completá la separación entre pendolones b con un valor mayor que cero.' };
  if (cover === 'tela' || cover === 'pend') {
    if (!(jp.sc > 0)) return { error: 'La separación entre los cables en la clave tiene que ser mayor que cero: con los cables al mismo nivel la tela daría esfuerzos infinitos.' };
    if (!(Math.abs(jp.hA - jp.hB) > 0)) return { error: 'Las columnas de los cables superior e inferior no pueden tener la misma altura (la tela necesita una pendiente en los apoyos).' };
  }
  const jr = C.designJawerth(jp);
  const net = jr.net; const pend = jr.pend;
  const supA = C.planarSupport({ R: net.Ra, thetaDeg: net.slopeDeg, betaDeg: num(d.betaA, 60) });
  const supB = C.planarSupport({ R: net.Rb, thetaDeg: net.slopeDeg, betaDeg: num(d.betaB, 60) });
  const tenA = C.selectCable(p.catalog, supA.T * net.beta2, 1);
  const tenB = C.selectCable(p.catalog, supB.T * net.beta2, 1);
  const colOf = (N, h, D, e) => {
    const kc = num(d.k, 1);
    const sig = num(d.sigmaSteel, 1400);
    if (num(D) > 0 && num(e) > 0) {
      const tube = C.tubeProps(num(D), num(e));
      return { N, h, manual: true, tube, chk: C.checkTubeColumn({ N, h, k: kc, tube, sigmaAdm: sig }), D: num(D), e: num(e) };
    }
    const pick = C.pickTubeG({ N, h, k: kc, sigmaAdm: sig });
    return pick ? { N, h, manual: false, tube: pick.tube, chk: pick.chk } : { N, h, manual: false, tube: null, chk: null };
  };
  // cercha plana o con la cubierta sobre/colgada: los dos cables se anclan en la misma columna (N = C1 + C2); espacial: cada cable en su columna
  const single = !pend.spatial;
  const colA = colOf(single ? supA.C + supB.C : supA.C, num(d.hA, 10), d.tubeAD, d.tubeAe);
  const colB = single ? null : colOf(supB.C, num(d.hB, 4), d.tubeBD, d.tubeBe);
  return { kind, input: jp, res: net, net, jaw: jr, layout, cover, pend, supA, supB, tenA, tenB, colA, colB, single };
}

// ---------------------------------------------------------------- figuras
function netFigure(L, f, title, { two = true } = {}) {
  const W = 560; const H = 200;
  const k = Math.min(440 / L, 70 / f);
  const x0 = 60; const yTop = 60;
  const X = (x) => x0 + x * k;
  const pts = (up) => Array.from({ length: 41 }, (_, i) => { const x = L * i / 40; const s = 4 * f * x * (L - x) / (L * L); return `${X(x)},${up ? yTop + f * k - s * k : yTop + s * k}`; }).join(' ');
  let s = `<polyline points="${pts(false)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;
  if (two) s += `<polyline points="${pts(true)}" fill="none" stroke="var(--warn)" stroke-width="2.4"/>`;
  s += `<line x1="${X(0)}" y1="${yTop + f * k + 26}" x2="${X(L)}" y2="${yTop + f * k + 26}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${yTop + f * k + 42}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">L = ${fmt(L, 2)} m</text>`;
  s += `<text x="${X(L) + 6}" y="${yTop + f * k / 2 + 4}" font-size="12" font-weight="600" fill="var(--accent-ink)">f = ${fmt(f, 2)} m</text>`;
  s += `<text x="8" y="16" font-size="12" font-weight="600" fill="var(--ink)">${escapeHtml(title)}</text>`;
  if (two) s += `<text x="${X(L / 2)}" y="${yTop - 6}" text-anchor="middle" font-size="11" fill="var(--warn)">cable de curvatura contraria</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="${escapeHtml(title)}">${s}</svg>`;
}

// Corte longitudinal de la cercha Jawerth según su tipo: plana (pendolones verticales de cable o de caño, comprimidos donde los cables se cruzan),
// espacial (tela o pendolones inclinados entre cables desfasados) y radial (un diámetro, con la carga triangular).
function jawFigure(d, pend = null) {
  const layout = jawLayout(d); const cover = jawCover(d);
  const L = num(d.L, 30); const f = num(d.f, 3);
  const W = 560; const k = Math.min(430 / L, 66 / Math.max(f, 0.5));
  const x0 = 60; const yTop = 38;
  const X = (x) => x0 + x * k;
  const sag = (x) => 4 * f * x * (L - x) / (L * L);
  const off = layout === 'plana' ? num(d.es, 4) : num(d.sc, 0.5) + 2 * f;           // separación vertical de los cables en los apoyos (en la cercha espacial se dibuja la de la clave = sc)
  const yA = (x) => yTop + sag(x) * k;                                               // cable superior: cóncavo hacia arriba (cuelga)
  const yB = (x) => yTop + off * k - sag(x) * k;                                      // cable inferior: arqueado
  const pts = (fn) => Array.from({ length: 61 }, (_, i) => { const x = L * i / 60; return `${X(x)},${fn(x)}`; }).join(' ');
  let s = '';
  if (cover === 'tela') s += `<polygon points="${pts(yA)} ${Array.from({ length: 61 }, (_, i) => { const x = L * (60 - i) / 60; return `${X(x)},${yB(x)}`; }).join(' ')}" fill="var(--accent)" fill-opacity="0.12" stroke="none"/>`;
  if (pend && pend.rows) {
    pend.rows.forEach((r) => { const x = r.x; s += `<line x1="${X(x)}" y1="${yA(x)}" x2="${X(x)}" y2="${yB(x)}" stroke="${r.kind === 'C' ? 'var(--bad)' : 'var(--ink-soft)'}" stroke-width="${r.kind === 'C' ? 2.2 : 1}"/>`; });
  } else if (cover === 'a' || cover === 'b') {
    const n = Math.max(2, Math.round(L / Math.max(num(d.b, 2), 0.2)));
    for (let i = 1; i < n; i++) { const x = L * i / n; s += `<line x1="${X(x)}" y1="${yA(x)}" x2="${X(x)}" y2="${yB(x)}" stroke="var(--ink-soft)" stroke-width="1"/>`; }
  } else if (cover === 'pend') {
    const n = Math.max(2, Math.round(L / Math.max(num(d.b, 2.5), 0.2)));
    for (let i = 0; i < n; i++) { const x1 = L * i / n; const x2 = L * (i + 0.5) / n; s += `<line x1="${X(x1)}" y1="${yA(x1)}" x2="${X(x2)}" y2="${yB(x2)}" stroke="var(--ink-soft)" stroke-width="1"/>`; }
  }
  s += `<polyline points="${pts(yA)}" fill="none" stroke="var(--accent)" stroke-width="2.6"/><polyline points="${pts(yB)}" fill="none" stroke="var(--warn)" stroke-width="2.6"/>`;
  s += `<text x="${X(L * 0.18)}" y="${yA(L * 0.18) - 8}" font-size="11.5" font-weight="600" fill="var(--accent-ink)">cable a (superior)</text><text x="${X(L * 0.62)}" y="${yB(L * 0.62) + 18}" font-size="11.5" font-weight="600" fill="var(--warn)">cable b (inferior)</text>`;
  const yBase = yTop + (off + 0.2) * k + 24;
  s += `<line x1="${X(0)}" y1="${yBase}" x2="${X(L)}" y2="${yBase}" stroke="var(--accent)"/><text x="${X(L / 2)}" y="${yBase + 16}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">${layout === 'radial' ? 'diámetro ' : ''}L = ${fmt(L, 2)} m · f = ${fmt(f, 2)} m</text>`;
  if (layout === 'plana' && pend && pend.xCross) s += `<text x="${X(L / 2)}" y="${yTop - 12}" text-anchor="middle" font-size="11.5" fill="var(--bad)">pendolones comprimidos (en rojo) entre x = ${fmt(pend.xCross[0], 1)} y ${fmt(pend.xCross[1], 1)} m</text>`;
  else if (cover === 'tela') s += `<text x="${X(L / 2)}" y="${yTop - 12}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">tela entre las dos familias de cables (separación en la clave sc = ${fmt(num(d.sc, 0.5), 2)} m)</text>`;
  return `<svg viewBox="0 0 ${W} ${Math.round(yBase + 30)}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Corte de la cercha Jawerth">${s}</svg>`;
}

// Planta: la cercha espacial alterna un cable superior y uno inferior cada a metros con la tela entre ellos; la radial reparte los cables como rayos de una rueda
function jawPlan(d) {
  const layout = jawLayout(d);
  if (layout === 'plana') return '';
  const W = 560;
  let s = '';
  if (layout === 'radial') {
    const cx = 150; const cy = 92; const r = 78; const n = 16;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
    for (let i = 0; i < n; i++) { const t = Math.PI * i / n; s += `<line x1="${cx - r * Math.cos(t)}" y1="${cy - r * Math.sin(t)}" x2="${cx + r * Math.cos(t)}" y2="${cy + r * Math.sin(t)}" stroke="${i % 2 ? 'var(--warn)' : 'var(--accent)'}" stroke-width="1"/>`; }
    const t0 = Math.PI * 0 / n; const t1 = Math.PI / n;
    s += `<polygon points="${cx},${cy} ${cx + r * Math.cos(t0)},${cy - r * Math.sin(t0)} ${cx + r * Math.cos(t1)},${cy - r * Math.sin(t1)}" fill="var(--accent)" fill-opacity="0.35" stroke="none"/>`;
    s += `<text x="${cx + r + 12}" y="${cy - 8}" font-size="11.5" font-weight="600" fill="var(--accent-ink)">a = ${fmt(num(d.a, 5), 2)} m (ancho de la faja en el borde)</text><text x="${cx + r + 12}" y="${cy + 10}" font-size="11.5" fill="var(--ink-soft)">la carga de cada cable crece del centro al borde</text><text x="${cx}" y="${cy + r + 18}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent-ink)">planta circular, diámetro L = ${fmt(num(d.L, 30), 2)} m</text>`;
    return `<svg viewBox="0 0 ${W} ${cy + r + 30}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Planta de la cercha radial">${s}</svg>`;
  }
  const a = num(d.a, 5); const L = num(d.L, 30);
  const n = 7; const k = Math.min(430 / ((n - 1) * a), 100 / L * 3);
  const x0 = 60; const y0 = 20; const H = 100;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * a * k;
    if (i < n - 1) s += `<rect x="${x}" y="${y0}" width="${a * k}" height="${H}" fill="var(--accent)" fill-opacity="${i % 2 ? 0.07 : 0.16}" stroke="none"/>`;
    s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + H}" stroke="${i % 2 ? 'var(--warn)' : 'var(--accent)'}" stroke-width="2.2"/>`;
  }
  s += `<text x="${x0 + a * k / 2}" y="${y0 + H + 16}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--accent-ink)">a = ${fmt(a, 2)} m</text><text x="${x0 + 3.5 * a * k}" y="${y0 + H + 16}" text-anchor="middle" font-size="11.5" fill="var(--ink-soft)">planta: cable superior (azul) y cable inferior (naranja) alternados, con la tela entre ellos</text>`;
  return `<svg viewBox="0 0 ${W} ${y0 + H + 28}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Planta de la cercha espacial">${s}</svg>`;
}

function hyperFigure(res) {
  const W = 560; const H = 260;
  const nodes = res.nodes;
  const rMax = Math.max(...nodes.map((n) => n.r)); const yMax = Math.max(...nodes.map((n) => n.y));
  const k = Math.min(380 / rMax, 170 / yMax);
  const X = (r) => 60 + r * k; const Y = (y) => 30 + (yMax - y) * k + 10;
  let s = `<line x1="60" y1="20" x2="60" y2="${Y(0) + 30}" stroke="var(--ink-soft)" stroke-dasharray="4 3"/><text x="66" y="28" font-size="11" fill="var(--ink-soft)">eje de giro</text>`;
  s += `<polyline points="${nodes.map((n) => `${X(n.r)},${Y(n.y)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;
  nodes.forEach((n) => { s += `<circle cx="${X(n.r)}" cy="${Y(n.y)}" r="4" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><text x="${X(n.r) + 7}" y="${Y(n.y) - 7}" font-size="11" font-weight="600" fill="var(--accent-ink)">${n.i}</text>`; });
  s += `<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--ink-soft)">Meridiano (hipérbola Y = c² / X) · r y y en m</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:560px; height:auto; display:block;" role="img" aria-label="Meridiano del hiperboloide">${s}</svg>`;
}

// ---------------------------------------------------------------- pantallas
function windCard(d) {
  const w = windSuggestion(d);
  return `<div class="card"><h3 style="margin-top:0;">Viento sobre la cubierta (ayuda de cálculo)</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.windV', 'Velocidad básica V', d.windV, { unit: 'm/s', hint: 'CIRSOC 102-2005 (Buenos Aires: 45 m/s en las guías).' })}${numField('design.windKz', 'Kz', d.windKz, { hint: 'Exposición y altura.' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.windKd', 'Kd', d.windKd)}${numField('design.windKzt', 'Kzt', d.windKzt)}${numField('design.windI', 'I', d.windI)}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.windG', 'G', d.windG)}${numField('design.windCp', 'Cp', d.windCp, { min: -5, hint: 'Hipotético: estas formas no están tabuladas.' })}${numField('design.windGCpi', 'GCpi', d.windGCpi, { min: -5 })}
    </div>
    <p class="text-muted" style="font-size:12.5px; margin:0;">qh = 0,613 V² Kd Kzt I Kz = <b>${fmt(w.qh, 0)} N/m²</b>; p = qh (G Cp − GCpi) = <b>${fmt(w.pN, 0)} N/m² ≈ ${fmt(w.pKg, 1)} kg/m²</b> (1 kg = 10 N). La succión que se carga arriba es el valor absoluto de esta presión (las guías adoptan 60 kg/m²).</p></div>`;
}

function geometryCard(calc) {
  const d = calc.design;
  const heavy = d.kind === 'heavy';
  const ph = d.kind === 'ph';
  const jaw = d.kind === 'jawerth';
  const layout = jaw ? jawLayout(d) : '';
  const radial = layout === 'radial';
  const head = jaw
    ? `${selField('design.layout', 'Tipo de cercha Jawerth', layout, Object.entries(LAYOUTS), 'Según cómo se ubican los cables entre sí cambian los pendolones, la cubierta y los apoyos.')}${jawFigure(d)}${jawPlan(d)}`
    : netFigure(num(d.L, 30), num(d.f, 3), `${heavy ? 'Cable portante' : 'Dos familias de cables'}, flecha ${fmt(num(d.f) / num(d.L, 1) * 100, 0)} % de la luz`, { two: !heavy });
  return `<div class="card"><h3 style="margin-top:0;">${KINDS[d.kind]}</h3>
    ${head}
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.L', radial ? 'Diámetro de la cubierta L' : 'Luz de los cables L', d.L, { unit: 'm' })}${numField('design.f', 'Flecha f', d.f, { unit: 'm', hint: `f / L = ${fmt(num(d.f) / num(d.L, 1), 3)} (las guías usan 0,10).` })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.a', radial ? 'Ancho de la faja de cubierta en el borde a' : 'Distancia entre cables (área de influencia) a', d.a, { unit: 'm', hint: radial ? 'Perímetro / cantidad de cables en el borde: la carga de cada cable es triangular, máxima en el borde y nula en el centro.' : jaw ? (layout === 'espacial' ? 'Un cable superior y uno inferior alternados: la separación entre uno y el siguiente es a.' : 'Ancho de cubierta que descarga sobre cada cercha.') : ph ? 'Cables cada metro en cada sentido.' : 'Cada cable toma una faja de ancho a.' })}
      ${numField('design.Pp', heavy ? 'Peso propio de la cubierta (con sobrecarga accidental)' : 'Peso propio de la membrana', d.Pp, { unit: 'kg/m²', hint: heavy ? 'Debe ser al menos 2,5 a 3 veces la succión del viento.' : 'Membrana muy liviana: 20 kg/m².' })}
    </div>
    ${numField('design.W', 'Succión del viento W', d.W, { unit: 'kg/m²', hint: 'En valor positivo (actúa hacia arriba). Ver la ayuda de cálculo.' })}
  </div>`;
}

function hyperGeometryCard(calc) {
  const d = calc.design;
  return `<div class="card"><h3 style="margin-top:0;">${KINDS.hr}</h3>
    <p class="text-muted" style="font-size:12.5px; margin:0 0 8px;">Hipérbola equilátera Y = c² / X (c entre 5 y 10, X ≥ 4); los nudos se ubican cada Δx y el hiperboloide se obtiene girándola a r = X − (posición del eje).</p>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.c', 'Distancia focal c', d.c)}${numField('design.x0', 'X del primer nudo', d.x0)}${numField('design.dx', 'Paso Δx entre nudos', d.dx, { unit: 'm' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.nNodes', 'Cantidad de nudos (paralelos)', d.nNodes, { step: 1 })}${numField('design.xAxis', 'Posición del eje de giro', d.xAxis, { unit: 'm', hint: 'r del primer nudo = X − este valor.' })}${numField('design.nMer', 'Cantidad de meridianos', d.nMer, { step: 1 })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.Pp', 'Peso propio de la membrana', d.Pp, { unit: 'kg/m²' })}${numField('design.W', 'Succión del viento W', d.W, { unit: 'kg/m²' })}
    </div>
    <div class="field"><label>Áreas de influencia de los nudos <span class="text-muted">(m², opcional: uno por nudo)</span></label><input data-f="design.areasText" value="${escapeHtml(d.areasText || '')}" placeholder="vacío = se calculan a partir de la geometría" />
      <span class="text-muted" style="font-size:11.5px;">La guía las mide del dibujo; con la geometría el programa las calcula (a = perímetro / meridianos por la longitud de influencia sobre el meridiano).</span></div>
  </div>`;
}

function coefCard(calc, withBeta1 = true) {
  const d = calc.design;
  const heavy = d.kind === 'heavy';
  return `<div class="card"><h3 style="margin-top:0;">Coeficientes y cables</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${withBeta1 ? numField('design.beta1', 'β1: tensión previa sobre la mínima', d.beta1, { hint: 'De 1,5 a 2 (guías).' }) : ''}
      ${numField('design.beta2', 'β2: carga de rotura sobre la máxima', d.beta2, { hint: 'Las guías usan 2.' })}
    </div>
    ${withBeta1 ? numField('design.TpAdopt', 'Tensión previa adoptada Tp (kg)', d.TpAdopt, { hint: 'Vacío o 0 = la calculada (mínima × β1). Las guías redondean (p. ej. 1650 kg).' }) : ''}
    ${selField('design.catalog', 'Tabla de cables', d.catalog || 'guide', CATALOGS, 'Los valores de las guías vienen de una tabla que no se adjuntó; las Tablas 1 y 2 del anexo son las del catálogo HIERROMAT.')}
    ${heavy ? numField('design.nCables', 'Cantidad de cables por faja', d.nCables, { step: 1, hint: 'La guía usa 2 cables de 19 mm en lugar de uno de 26 mm para apoyar las losetas.' }) : ''}
  </div>`;
}

function extraCard(calc) {
  const d = calc.design;
  if (d.kind === 'jawerth') {
    const layout = jawLayout(d); const cover = jawCover(d);
    const spatial = cover === 'tela' || cover === 'pend';
    const hints = { tela: 'La tela va de los cables superiores a los inferiores desfasados, por eso toma el esfuerzo de los pendolones. Se elige en la tabla de telas con la carga de rotura cada 50 mm.', pend: 'Los pendolones de cable unen en diagonal un cable superior con el inferior vecino; la cubierta es otro sistema (paneles, correas).', a: 'Los cables están en el mismo plano. La cubierta apoya sobre el cable superior y los pendolones la sostienen: para su carga se toma R = Tp − Rpp + Rw.', b: 'Los cables están en el mismo plano. La cubierta cuelga del cable inferior: R = Tp + Rpp (el viento descarga los pendolones y no se considera).' };
    return `<div class="card"><h3 style="margin-top:0;">Pendolones y cubierta</h3>
    ${selField('design.cover', 'Sistema de unión entre las dos familias', cover, coversOf(layout).map((c) => [c, COVERS[c]]), hints[cover])}
    ${cover === 'tela' ? '' : numField('design.b', cover === 'pend' ? 'Separación entre pendolones inclinados b' : 'Separación entre pendolones b', d.b, { unit: 'm', hint: 'Esfuerzo de cada pendolón = qe · b.' })}
    ${spatial ? numField('design.sc', 'Separación vertical entre los cables en la clave', d.sc === undefined ? 0.5 : d.sc, { unit: 'm', hint: 'En el centro la tela (o el pendolón inclinado) queda casi horizontal y su esfuerzo crece sin límite si los cables están al mismo nivel: la guía separa 0,50 m.' }) : numField('design.es', 'Separación vertical entre los dos cables en el apoyo', d.es === undefined ? 4 : d.es, { unit: 'm', hint: 'Si es menor que 2 f los cables se cruzan y los pendolones del tramo central trabajan comprimidos: se dimensionan como caños con pandeo.' })}
    <h3 style="margin:14px 0 6px;">Apoyos y columnas</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.betaA', 'Ángulo del tensor del cable superior con la horizontal', d.betaA, { unit: '°', hint: 'La guía lo dibuja a 60°.' })}${numField('design.betaB', 'Ángulo del tensor del cable inferior', d.betaB, { unit: '°' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.hA', spatial ? 'Altura de la columna del cable superior' : 'Altura de la columna (los dos cables se anclan en ella)', d.hA, { unit: 'm' })}${spatial ? numField('design.hB', 'Altura de la columna del cable inferior', d.hB, { unit: 'm', hint: 'La diferencia con la columna superior es la separación vertical de los cables en el apoyo.' }) : ''}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.tubeAD', spatial ? 'Tubo propio columna superior: diámetro' : 'Tubo propio de la columna: diámetro', d.tubeAD, { unit: 'cm', hint: '0 = el caño más liviano de la Tabla G (DIN 2448).' })}${numField('design.tubeAe', 'espesor de pared', d.tubeAe, { unit: 'cm' })}
    </div>
    ${spatial ? `<div class="field-row" style="flex-wrap:wrap;">${numField('design.tubeBD', 'Tubo propio columna inferior: diámetro', d.tubeBD, { unit: 'cm' })}${numField('design.tubeBe', 'espesor de pared', d.tubeBe, { unit: 'cm' })}</div>` : ''}
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.k', 'Coeficiente de longitud de pandeo k', d.k, { hint: '1 = articulada en los dos extremos (guía).' })}${numField('design.sigmaSteel', 'Tensión admisible del acero', d.sigmaSteel, { unit: 'kg/cm²', hint: 'Guía: 1400 (F-22 / F-24).' })}
    </div>
    <p class="text-muted" style="font-size:12px; margin:0;">${spatial ? 'En la cercha espacial el cable superior se ancla en una columna y el inferior en otra: las cargas no se suman. El apoyo del cable inferior de la guía es espacial (tensores T2, T2′, T2″ en dos planos, descomposición gráfica); aquí ambos cables se descomponen en un plano con el ángulo indicado.' : 'En la cercha coplanar ambos cables se anclan sobre la misma columna, que se predimensiona con N = C1 + C2. Para la cubierta hace falta un sistema con la inercia necesaria para cubrir la luz entre cerchas; las correas pueden apoyar sobre el cable a o colgar del b.'}</p></div>`;
  }
  if (d.kind === 'heavy') return `<div class="card"><h3 style="margin-top:0;">Apoyos y columnas</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.ratioMin', 'Relación mínima peso propio / succión', d.ratioMin, { hint: 'Guía: 2,5 a 3.' })}${numField('design.betaT', 'Ángulo del tensor de apoyo con la horizontal', d.betaT, { unit: '°' })}
    </div>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.sigmaC', 'Tensión de predimensionado del hormigón de la columna', d.sigmaC, { unit: 'kg/cm²', hint: 'Guía: H13, AB42, coeficiente 2,5 → N / 60.' })}${numField('design.rho', 'Cuantía de armadura', d.rho, { unit: '%' })}
    </div></div>`;
  if (d.kind === 'ph') return `<div class="card"><h3 style="margin-top:0;">Borde y membrana</h3>
    <div class="field-row" style="flex-wrap:wrap;">
      ${numField('design.sCol', 'Separación de las columnas del borde', d.sCol, { unit: 'm' })}${numField('design.hEdge', 'Altura entre ejes de la viga de borde', d.hEdge, { unit: 'm' })}
    </div>
    ${numField('design.sigmaEdge', 'Tensión admisible de los tubos del borde', d.sigmaEdge, { unit: 'kg/cm²', hint: 'Guía: 1200.' })}
    ${selField('design.membrane', 'Variante con membrana estructural', d.membrane === 'no' ? 'no' : 'yes', [['yes', 'Sí: franjas de 5 cm de tela y cable de borde colector'], ['no', 'No']])}
    ${d.membrane === 'no' ? '' : `<div class="field-row" style="flex-wrap:wrap;">${numField('design.Lb', 'Luz del cable de borde', d.Lb, { unit: 'm' })}${numField('design.fb', 'Flecha del cable de borde', d.fb, { unit: 'm' })}</div>`}
  </div>`;
  return '';
}

export const tensModule = {
  label: 'Estructura de grandes luces traccionada',
  defaults(variant) {
    const kind = /^jawerth/.test(variant || '') ? 'jawerth' : KINDS[variant] ? variant : 'jawerth';
    return { design: defaultsFor(kind, variant || ''), materials: { grade: 'F-22', omegaTable: 'F-22' }, section: {}, verification: {} };
  },
  input(calc) { return calc.design; },
  run(calc) { return compute(calc); },
  step1(calc) {
    const d = calc.design;
    if (d.kind === 'hr') return `<div class="grid grid-2" style="align-items:start;">${hyperGeometryCard(calc)}${windCard(d)}</div><div class="note" style="margin-top:16px;">${TENS_NOTE}</div>`;
    return `<div class="grid grid-2" style="align-items:start;">${geometryCard(calc)}${windCard(d)}</div><div class="note" style="margin-top:16px;">${TENS_NOTE}</div>`;
  },
  step2(calc) {
    const out = compute(calc);
    const d = calc.design;
    const r = out.res && d.kind !== 'hr' ? (out.res.net || out.res) : out.res;
    let side = `<div class="empty-state">${out.error || 'Completá el diseño.'}</div>`;
    if (!out.error && d.kind !== 'hr') {
      side = d.kind === 'heavy'
        ? `<table class="data-table"><tbody>
            <tr><td>Carga por cable: peso propio Qpp = Pp a</td><td style="text-align:right;">${fmt(r.Qpp, 0)} kg/m</td></tr>
            <tr><td>Carga por cable: viento Qw = W a</td><td style="text-align:right;">${fmt(r.Qw, 0)} kg/m</td></tr>
            <tr><td>Hpp = Qpp L² / 8 f · Vpp = Qpp L / 2</td><td style="text-align:right;">${kg(r.Hpp)} · ${kg(r.Vpp)} kg</td></tr>
            <tr><td>Rpp = √(Hpp² + Vpp²)</td><td style="text-align:right;"><b>${kg(r.Rpp)} kg</b></td></tr>
            <tr><td>Rw = √(Hw² + Vw²)</td><td style="text-align:right;">${kg(r.Rw)} kg</td></tr>
            <tr><td>Relación peso propio / succión</td><td style="text-align:right;">${fmt(r.ratio, 2)} ${r.ratioOk ? '✓' : '✗'}</td></tr></tbody></table>`
        : `<table class="data-table"><tbody>
            <tr><td>${r.shape === 'triangular' ? 'Carga máxima por cable (en el borde)' : 'Carga por cable'}: Qpp = Pp a · Qw = W a</td><td style="text-align:right;">${fmt(r.Qpp, 0)} · ${fmt(r.Qw, 0)} kg/m</td></tr>
            <tr><td>${r.shape === 'triangular' ? 'Cada familia toma Q / 2 (carga triangular): Hpp = (Qpp/2) L² / 24 f · Vpp = (Qpp/2) L / 4' : 'Cada familia toma q / 2: Hpp = (Qpp/2) L² / 8 f · Vpp = (Qpp/2) L / 2'}</td><td style="text-align:right;">${kg(r.Hpp)} · ${kg(r.Vpp)} kg</td></tr>
            <tr><td>Rpp</td><td style="text-align:right;"><b>${fmt(r.Rpp, 2)} kg</b></td></tr>
            <tr><td>Rw</td><td style="text-align:right;"><b>${fmt(r.Rw, 2)} kg</b></td></tr>
            <tr><td>Tensión previa mínima (la mayor fuerza que comprime)</td><td style="text-align:right;">${fmt(r.Tp0, 2)} kg</td></tr>
            <tr><td>Tp = mínima × β1</td><td style="text-align:right;"><b>${fmt(r.TpAuto, 2)} kg</b></td></tr></tbody></table>`;
    } else if (!out.error) {
      side = `<table class="data-table"><tbody>
        <tr><td>Nudos y meridianos</td><td style="text-align:right;">${r.nodes.length} nudos · ${r.members.filter((m) => m.kind === 'm').length} tramos</td></tr>
        <tr><td>Relación máxima K = |Pp| / To</td><td style="text-align:right;">${fmt(r.Kmax, 3)}</td></tr>
        <tr><td>Tp = To K β1</td><td style="text-align:right;"><b>${fmt(r.TpAuto, 0)} kg</b></td></tr></tbody></table>`;
    }
    return `<div class="grid grid-2" style="align-items:start;">${coefCard(calc, d.kind !== 'heavy')}<div class="card"><h3 style="margin-top:0;">Esfuerzos y tensión previa</h3>${side}</div></div>
      <div style="margin-top:16px;">${extraCard(calc)}</div>`;
  },
  step3(calc, out) {
    if (out.error) return `<div class="card"><div class="empty-state">${out.error}</div></div>`;
    return resultsHtml(calc, out);
  },
  memoria(calc, out) { return memoria(calc, out); },
};

// ---------------------------------------------------------------- resultados
const cableTxt = (sel) => (sel.cable ? `ø ${fmt(sel.cable.d, sel.cable.d % 1 ? 1 : 0)} mm (carga de rotura ${kg(sel.cable.F)} kg)${sel.n > 1 ? ` × ${sel.n} cables` : ''}${sel.cable.suspect ? ' — valor de la tabla dudoso' : ''}` : 'ninguno de la tabla alcanza: usar más cables o otra tabla');
const colTxt = (c) => (c.tube
  ? `${c.manual ? `tubo propio ø ${fmt(c.D, 2)} cm × ${fmt(c.e, 2)} cm` : `caño ø ${fmt(c.tube.de / 10, 2)} cm × ${fmt(c.tube.s, 1)} mm`}: A = ${fmt(c.tube.A, 2)} cm², i = ${fmt(c.tube.i, 2)} cm, λ = ${fmt(c.chk.lambda, 1)}, ω = ${c.chk.omega === null ? '—' : fmt(c.chk.omega, 2)}, σ = ${kg(c.chk.sigma)} ≤ ${kg(c.chk.sigmaAdm)} kg/cm²`
  : 'ningún caño de la Tabla G alcanza: ingresar un tubo propio (diámetro y espesor)');

function statesTable(net) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Estado</th><th style="text-align:right;">Cable superior Ra (kg)</th><th style="text-align:right;">Cable inferior Rb (kg)</th></tr></thead><tbody>
    <tr><td colspan="3" class="text-muted" style="font-size:12px;">Con tensión previa nula (para hallar la mínima)</td></tr>
    <tr><td>Estado 1: Tp + Pp</td><td style="text-align:right;">${fmt(net.initial.e1a, 2)}</td><td style="text-align:right;${net.initial.e1b < 0 ? 'color:var(--bad);' : ''}">${fmt(net.initial.e1b, 2)}</td></tr>
    <tr><td>Estado 2: Tp + Pp − V</td><td style="text-align:right;${net.initial.e2a < 0 ? 'color:var(--bad);' : ''}">${fmt(net.initial.e2a, 2)}</td><td style="text-align:right;">${fmt(net.initial.e2b, 2)}</td></tr>
    <tr><td colspan="3" class="text-muted" style="font-size:12px;">Con la tensión previa definitiva Tp = ${fmt(net.Tp, 2)} kg</td></tr>
    ${net.states.map((s) => `<tr><td>${escapeHtml(s.label)}</td><td style="text-align:right;">${fmt(s.Ra, 2)}</td><td style="text-align:right;">${fmt(s.Rb, 2)}</td></tr>`).join('')}</tbody></table></div>`;
}

function checksOf(out) {
  const c = [];
  const { kind, res } = out;
  if (kind === 'hr') {
    c.push({ ok: res.cableM.ok, label: 'Cables de meridianos y paralelos', text: `máximo ${kg(Math.max(res.mMax, res.PMax))} kg × β2 = ${kg(Math.max(res.mMax, res.PMax) * res.beta2)} kg → ${cableTxt(res.cableM)}` });
    c.push({ ok: res.telas.some((t) => t.ok), label: 'Tela (si reemplaza a los cables)', text: `máximo ${fmt(res.telaMax, 1)} kg cada 50 mm × β2 = ${fmt(res.telaMax * res.beta2, 1)}: ${res.telas.filter((t) => t.ok).length} de ${res.telas.length} telas de la tabla alcanzan` });
    c.push({ ok: true, label: 'Apoyo inferior', text: `vertical ascendente ${kg(res.support.upliftSupport)} kg por meridiano (Fe = ${fmt(res.support.FeUplift, 2)} cm²); anillo comprimido P = ${kg(Math.abs(res.support.ring))} kg → Fe = ${fmt(res.support.FeRing, 2)} cm² con ${kg(res.support.sigma)} kg/cm²` });
    return c;
  }
  if (kind === 'heavy') {
    c.push({ ok: res.ratioOk, label: 'Peso propio / succión', text: `${fmt(res.ratio, 2)} ${res.ratioOk ? '≥' : '<'} ${fmt(res.ratioMin, 2)}: ${res.ratioOk ? 'el peso propio mantiene traccionado el cable' : 'la succión puede descargar el cable: aumentar el peso propio'}` });
    c.push({ ok: res.noCompression, label: 'Cable siempre traccionado', text: `R mínima = ${kg(Math.min(...res.states.map((s) => s.R)))} kg` });
    c.push({ ok: res.cableSel.ok, label: 'Cable portante', text: `Rmax = ${kg(res.Rmax)} kg × β2 = ${kg(res.Rrot)} kg → ${cableTxt(res.cableSel)}` });
    c.push({ ok: out.tensor.ok, label: 'Tensor de apoyo', text: `T = ${kg(out.sup.T)} kg × β2 = ${kg(out.sup.T * res.beta2)} kg → ${cableTxt(out.tensor)}` });
    return c;
  }
  const net = res.net || res;
  c.push({ ok: net.noCompression, label: 'Cables siempre traccionados', text: `R mínima = ${fmt(net.Rmin, 2)} kg con Tp = ${fmt(net.Tp, 2)} kg` });
  c.push({ ok: net.TpOk, label: 'Tensión previa', text: `Tp = ${fmt(net.Tp, 2)} ${net.TpOk ? '≥' : '<'} mínima ${fmt(net.Tp0, 2)} kg` });
  c.push({ ok: net.cableSel.ok, label: 'Cables portantes', text: `Rmax = ${fmt(net.Rmax, 2)} kg × β2 = ${fmt(net.Rrot, 2)} kg → ${cableTxt(net.cableSel)}` });
  if (kind === 'ph') {
    c.push({ ok: Boolean(res.edge.tube), label: 'Viga de borde', text: `M = ${kg(res.edge.M)} kg·m, C = T = ${kg(res.edge.C)} kg, Fnec = ${fmt(res.edge.Fnec, 2)} cm² → ${res.edge.tube ? `caño ø ${fmt(res.edge.tube.de / 10, 2)} cm × ${fmt(res.edge.tube.s, 1)} mm (A = ${fmt(res.edge.tube.A, 2)} cm²)` : 'ningún caño de la tabla alcanza'}` });
    if (res.strip) c.push({ ok: res.telas.some((t) => t.ok), label: 'Variante con membrana', text: `esfuerzo máximo de la franja de tela de 5 cm ${fmt(res.strip.Rmax, 2)} kg (Tp = ${fmt(res.strip.Tp, 1)} kg); ×β2 = ${fmt(res.stripRrot, 2)} kg cada 50 mm: ${res.telas.filter((t) => t.ok).length} de ${res.telas.length} telas de la tabla alcanzan` });
    if (out.edgeCable) c.push({ ok: out.edgeCable.cableSel.ok, label: 'Cable de borde colector', text: `R = ${kg(out.edgeCable.R)} kg × β2 = ${kg(out.edgeCable.Rrot)} kg → ${cableTxt(out.edgeCable.cableSel)}` });
    return c;
  }
  // jawerth
  const pd = out.pend;
  if (pd.cover === 'tela') c.push({ ok: pd.ok, label: 'Tela entre cables', text: `qe = ${fmt(pd.qe, 1)} kg/m (R = ${kg(pd.R)} kg) → carga de rotura qer = qe × β2 / 20 = ${fmt(pd.qer, 1)} kg cada 50 mm; descompuesta en la dirección de la tela: ${fmt(pd.qer1, 2)} en el apoyo (φ = ${fmt(pd.phiS, 1)}°) y ${fmt(pd.qer2, 2)} en la clave (φ = ${fmt(pd.phiC, 1)}°): ${pd.telas.filter((t) => t.ok).length} de ${pd.telas.length} telas de la tabla alcanzan` });
  else if (pd.cover === 'pend') c.push({ ok: pd.ok, label: 'Pendolones inclinados', text: `qe = ${fmt(pd.qe, 1)} kg/m, b = ${fmt(pd.b, 2)} m → ${fmt(pd.F, 0)} kg por pendolón; en su dirección ${fmt(pd.TS, 0)} kg en el apoyo (φ = ${fmt(pd.phiS, 1)}°) y ${fmt(pd.TC, 0)} kg en la clave (φ = ${fmt(pd.phiC, 1)}°) × β2 = ${fmt(pd.Trot, 0)} kg → ${cableTxt(pd.cableSel)}` });
  else {
    c.push({ ok: pd.cableSel.ok || pd.nT === 0, label: 'Pendolones traccionados (cable)', text: `qe = ${fmt(pd.qe, 1)} kg/m (R = ${kg(pd.R)} kg), b = ${fmt(pd.b, 2)} m → T = qe b = ${fmt(pd.F, 0)} kg × β2 = ${fmt(pd.Trot, 0)} kg → ${pd.nT ? cableTxt(pd.cableSel) : 'no hay pendolones traccionados'}` });
    if (pd.nC) c.push({ ok: Boolean(pd.tube && pd.chk && pd.chk.ok), label: 'Pendolones comprimidos (caño)', text: `${pd.nC} pendolones entre x = ${fmt(pd.xCross[0], 1)} y ${fmt(pd.xCross[1], 1)} m, el más largo de ${fmt(pd.lmax, 2)} m: N = qe b ω = ${fmt(pd.F, 0)} × ω → ${pd.tube ? `caño ø ${fmt(pd.tube.de / 10, 2)} cm × ${fmt(pd.tube.s, 1)} mm (A = ${fmt(pd.tube.A, 2)} cm², i = ${fmt(pd.tube.i, 2)} cm), λ = ${fmt(pd.chk.lambda, 1)}, ω = ${pd.chk.omega === null ? '—' : fmt(pd.chk.omega, 2)}, σ = ${kg(pd.chk.sigma)} ≤ ${kg(pd.chk.sigmaAdm)} kg/cm²` : 'ningún caño de la Tabla G verifica el pandeo: usar un perfil propio'}` });
  }
  c.push({ ok: out.tenA.ok, label: 'Tensor del cable superior', text: `R = ${kg(net.Ra)} kg → T = ${kg(out.supA.T)} kg × β2 = ${kg(out.supA.T * net.beta2)} kg → ${cableTxt(out.tenA)}` });
  c.push({ ok: out.tenB.ok, label: 'Tensor del cable inferior', text: `T = ${kg(out.supB.T)} kg × β2 = ${kg(out.supB.T * net.beta2)} kg → ${cableTxt(out.tenB)}` });
  if (out.single) c.push({ ok: Boolean(out.colA.tube && out.colA.chk.ok), label: 'Columna (los dos cables en la misma)', text: `N = C1 + C2 = ${kg(out.supA.C)} + ${kg(out.supB.C)} = ${kg(out.colA.N)} kg, h = ${fmt(out.colA.h, 1)} m: ${colTxt(out.colA)}` });
  else {
    c.push({ ok: Boolean(out.colA.tube && out.colA.chk.ok), label: 'Columna del cable superior', text: `N = ${kg(out.colA.N)} kg, h = ${fmt(out.colA.h, 1)} m: ${colTxt(out.colA)}` });
    c.push({ ok: Boolean(out.colB.tube && out.colB.chk.ok), label: 'Columna del cable inferior', text: `N = ${kg(out.colB.N)} kg, h = ${fmt(out.colB.h, 1)} m: ${colTxt(out.colB)}` });
  }
  return c;
}

function hyperTables(res) {
  const rows = res.members.filter((m) => m.kind === 'm').map((m) => `<tr><td>m${m.k}-${m.k + 1}</td><td style="text-align:right;">${kg(m.Pp)}</td><td style="text-align:right;">${kg(m.V)}</td><td style="text-align:right;">${kg(m.To)}</td><td style="text-align:right;">${fmt(Math.abs(m.Pp) / Math.abs(m.To), 2)}</td><td style="text-align:right;">${kg(m.Tp)}</td><td style="text-align:right;">${kg(m.TpPp)}</td><td style="text-align:right;"><b>${kg(m.TpPpV)}</b></td></tr>`).join('');
  const rowsH = res.members.filter((m) => m.kind === 'H').map((m) => `<tr><td>H${m.k}</td><td style="text-align:right;">${kg(m.Pp)}</td><td style="text-align:right;">${kg(m.V)}</td><td style="text-align:right;">${kg(m.To)}</td><td style="text-align:right;">${fmt(Math.abs(m.Pp) / Math.abs(m.To), 2)}</td><td style="text-align:right;">${kg(m.Tp)}</td><td style="text-align:right;">${kg(m.TpPp)}</td><td style="text-align:right;"><b>${kg(m.TpPpV)}</b></td></tr>`).join('');
  const nodes = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nudo</th><th style="text-align:right;">X</th><th style="text-align:right;">Y (m)</th><th style="text-align:right;">r (m)</th><th style="text-align:right;">a (m)</th><th style="text-align:right;">b (m)</th><th style="text-align:right;">A (m²)</th><th style="text-align:right;">Pp (kg)</th><th style="text-align:right;">V (kg)</th></tr></thead><tbody>
    ${res.nodes.map((n) => `<tr><td>${n.i}</td><td style="text-align:right;">${fmt(n.x, 2)}</td><td style="text-align:right;">${fmt(n.y, 2)}</td><td style="text-align:right;">${fmt(n.r, 2)}</td><td style="text-align:right;">${fmt(n.a, 2)}</td><td style="text-align:right;">${fmt(n.b, 2)}</td><td style="text-align:right;">${fmt(n.A, 2)}</td><td style="text-align:right;">${fmt(n.Pp, 0)}</td><td style="text-align:right;">${fmt(-n.Wv, 0)}</td></tr>`).join('')}</tbody></table></div>`;
  const forces = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Posición</th><th style="text-align:right;">Pp</th><th style="text-align:right;">V</th><th style="text-align:right;">To (=${res.To})</th><th style="text-align:right;">K = Pp/To</th><th style="text-align:right;">Tp</th><th style="text-align:right;">Tp + Pp</th><th style="text-align:right;">Tp + Pp + V</th></tr></thead><tbody>${rows}${rowsH}</tbody></table></div>`;
  const par = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Paralelo</th><th style="text-align:right;">H (kg)</th><th style="text-align:right;">r (m)</th><th style="text-align:right;">a (m)</th><th style="text-align:right;">P = H r / a (kg)</th></tr></thead><tbody>${res.parallels.map((p) => `<tr><td>${p.support ? 'Apoyo' : p.k}</td><td style="text-align:right;">${kg(p.H)}</td><td style="text-align:right;">${fmt(p.r, 2)}</td><td style="text-align:right;">${fmt(p.a, 2)}</td><td style="text-align:right;"><b>${kg(p.P)}</b></td></tr>`).join('')}</tbody></table></div>`;
  return { nodes, forces, par };
}

// Pendolones o tela de la cercha Jawerth según el sistema elegido
function pendantCard(out) {
  const pd = out.pend;
  const head = `<tr><td>Reacción que usa la carga equivalente (${pd.cover === 'a' ? 'Tp − Rpp + Rw' : pd.cover === 'b' ? 'Tp + Rpp' : 'la máxima'})</td><td style="text-align:right;">R = <b>${kg(pd.R)} kg</b></td></tr>
    <tr><td>Carga equivalente qe = ${pd.shape === 'triangular' ? '4 R / (L √(1 / 36 λ² + 1))' : '2 R / (L √(1 / 16 λ² + 1))'}</td><td style="text-align:right;"><b>${fmt(pd.qe, 1)} kg/m</b></td></tr>`;
  if (pd.cover === 'tela') {
    return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Tela estructural (cerramiento y pendolón) ${pill(pd.ok)}</h3><table class="data-table"><tbody>${head}
      <tr><td>Carga de rotura cada 50 mm: qer = qe × β2 / 20</td><td style="text-align:right;">${fmt(pd.qer, 2)} kg/50 mm</td></tr>
      <tr><td>En el apoyo: la tela sube ${fmt(pd.riseS, 2)} m cada ${fmt(pd.run, 2)} m (φ = ${fmt(pd.phiS, 1)}°) → qer / (2 sen φ)</td><td style="text-align:right;"><b>${fmt(pd.qer1, 2)} kg/50 mm</b></td></tr>
      <tr><td>En la clave: separación ${fmt(pd.riseC, 2)} m (φ = ${fmt(pd.phiC, 1)}°)</td><td style="text-align:right;"><b>${fmt(pd.qer2, 2)} kg/50 mm</b></td></tr></tbody></table>
      <h4 style="margin:10px 0 4px; font-size:13px;">Telas de la tabla que alcanzan ${fmt(pd.qerMax, 1)} kg/50 mm</h4>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Tela</th><th style="text-align:right;">Resistencia (kg/50 mm)</th><th></th></tr></thead><tbody>${pd.telas.map((t) => `<tr><td>${escapeHtml(t.n || t.name || '')}${t.g ? ` · ${fmt(t.g, 2)} kg/m²` : ''}</td><td style="text-align:right;">${fmt(t.min, 0)}</td><td style="text-align:right;">${t.ok ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">La guía obtiene gráficamente 16,25 en el apoyo y 73,80 en la clave (con 0,50 m de separación); la descomposición se hace con la geometría: separación horizontal entre cables a / 2, vertical entre las columnas en el apoyo y la indicada en la clave. En el centro, con los cables al mismo nivel, el esfuerzo de la tela sería infinito: por eso se los separa.</p></div>`;
  }
  if (pd.cover === 'pend') {
    return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Pendolones inclinados ${pill(pd.ok)}</h3><table class="data-table"><tbody>${head}
      <tr><td>Separación entre pendolones b · carga de cada uno qe b</td><td style="text-align:right;">${fmt(pd.b, 2)} m · <b>${fmt(pd.F, 0)} kg</b></td></tr>
      <tr><td>En su dirección, en el apoyo (φ = ${fmt(pd.phiS, 1)}°) · en la clave (φ = ${fmt(pd.phiC, 1)}°)</td><td style="text-align:right;">${fmt(pd.TS, 0)} · <b>${fmt(pd.TC, 0)} kg</b></td></tr>
      <tr><td>Carga de rotura × β2</td><td style="text-align:right;">${kg(pd.Trot)} kg → ${cableTxt(pd.cableSel)}</td></tr></tbody></table>
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">La guía no da la descomposición para pendolones inclinados de cable: se usa la misma que para la tela (dos pendolones por cable, a / 2 de separación horizontal).</p></div>`;
  }
  const rows = pd.rows.map((r) => `<tr><td style="text-align:right;">${fmt(r.x, 2)}</td><td style="text-align:right;">${fmt(r.len, 2)}</td><td>${r.kind === 'T' ? 'tracción (cable)' : '<span style="color:var(--bad); font-weight:600;">compresión (caño)</span>'}</td><td style="text-align:right;">${r.kind === 'T' ? fmt(pd.F, 0) : `${fmt(pd.F, 0)} × ω`}</td></tr>`).join('');
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Pendolones verticales ${pill(pd.ok)}</h3><table class="data-table"><tbody>${head}
    <tr><td>Separación entre pendolones b (${pd.n} tramos) · carga de cada uno T = qe b</td><td style="text-align:right;">${fmt(pd.b, 2)} m · <b>${fmt(pd.F, 0)} kg</b></td></tr>
    <tr><td>Separación vertical de los cables en el apoyo es = ${fmt(pd.es, 2)} m</td><td style="text-align:right;">${pd.xCross ? `se cruzan en x = ${fmt(pd.xCross[0], 1)} y ${fmt(pd.xCross[1], 1)} m` : 'no se cruzan'}</td></tr>
    <tr><td>Pendolones traccionados: carga de rotura × β2${pd.nT ? ` (${pd.nT} unidades)` : ''}</td><td style="text-align:right;">${pd.nT ? `${kg(pd.Trot)} kg → ${cableTxt(pd.cableSel)}` : '—'}</td></tr>
    ${pd.nC ? `<tr><td>Pendolones comprimidos (${pd.nC}, el más largo de ${fmt(pd.lmax, 2)} m): N = qe b ω, λ = luz de pandeo / i mín</td><td style="text-align:right;">${pd.tube ? `<b>ø ${fmt(pd.tube.de / 10, 2)} cm × ${fmt(pd.tube.s, 1)} mm</b>, λ = ${fmt(pd.chk.lambda, 0)}, ω = ${pd.chk.omega === null ? '—' : fmt(pd.chk.omega, 2)}, σ = ${kg(pd.chk.sigma)} kg/cm²` : 'ninguno de la Tabla G verifica'}</td></tr>` : ''}</tbody></table>
    <h4 style="margin:10px 0 4px; font-size:13px;">Pendolones a lo largo de la luz</h4>
    <div class="table-wrap" style="max-height:220px; overflow:auto;"><table class="data-table"><thead><tr><th style="text-align:right;">x (m)</th><th style="text-align:right;">Largo (m)</th><th>Trabaja a</th><th style="text-align:right;">Esfuerzo (kg)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${pd.cover === 'a' ? 'Cubierta sobre el cable a: R = Tp − Rpp + Rw (el viento tracciona los pendolones).' : 'Cubierta colgada del cable b: R = Tp + Rpp (el viento destracciona los pendolones y no se considera).'} Los pendolones comprimidos pueden ser caños o perfiles. La cubierta necesita un sistema con inercia para cubrir la luz entre cerchas; las correas pueden apoyar en el cable a o colgar del b.</p></div>`;
}

function resultsHtml(calc, out) {
  const { kind, res } = out;
  const checks = checksOf(out);
  const ok = checks.every((x) => x.ok);
  if (kind === 'hr') {
    const t = hyperTables(res);
    return `<div class="grid grid-2" style="align-items:start;"><div>
      <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Geometría ${pill(true)}</h3>${hyperFigure(res)}${t.nodes}</div>
      <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Tensión previa</h3><table class="data-table"><tbody>
        <tr><td>To (tensión previa teórica, componente vertical)</td><td style="text-align:right;">${kg(res.To)} kg</td></tr>
        <tr><td>K máxima = |Pp| / To</td><td style="text-align:right;">${fmt(res.Kmax, 3)}</td></tr>
        <tr><td>Tp = To × K × β1 (β1 = ${fmt(res.beta1, 1)})</td><td style="text-align:right;"><b>${fmt(res.TpAuto, 0)} kg</b></td></tr>
        <tr><td>Tp adoptada</td><td style="text-align:right;"><b>${fmt(res.Tp, 0)} kg</b></td></tr></tbody></table></div>
      ${checksCard({ ok, checks })}</div>
      <div><div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Meridianos (tramos) y esfuerzos radiales H en los nudos</h3>${t.forces}</div>
      <div class="card"><h3 style="margin-top:0;">Paralelos</h3>${t.par}<p class="text-muted" style="font-size:12px; margin:8px 0 0;">Máximo en meridianos ${kg(res.mMax)} kg; en paralelos ${kg(res.PMax)} kg.</p></div></div></div>`;
  }
  const net = res.net || res;
  let left = '';
  if (kind === 'heavy') {
    left = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Estados de carga ${pill(res.noCompression)}</h3><table class="data-table"><tbody>
      ${res.states.map((s) => `<tr><td>${escapeHtml(s.label)}</td><td style="text-align:right;"><b>${fmt(s.R, 2)} kg</b></td></tr>`).join('')}
      <tr><td>Máximo: Rpp (estado 1), carga de rotura ×β2</td><td style="text-align:right;">${kg(res.Rmax)} → ${kg(res.Rrot)} kg</td></tr></tbody></table></div>
      <div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Apoyo</h3><table class="data-table"><tbody>
        <tr><td>Reacción del cable en el apoyo (pendiente ${fmt(res.slopeDeg, 1)}°): H · V</td><td style="text-align:right;">${kg(out.sup.H)} · ${kg(out.sup.V)} kg</td></tr>
        <tr><td>Tensor a ${fmt(out.sup.betaDeg, 0)}°: T = H / cos β</td><td style="text-align:right;"><b>${kg(out.sup.T)} kg</b></td></tr>
        <tr><td>Columna: C = V + T sen β</td><td style="text-align:right;"><b>${kg(out.sup.C)} kg</b></td></tr>
        <tr><td>Columna de hormigón: Fb = N / ${fmt(out.col.sigma, 0)} · Fe = ${fmt(out.col.rho * 100, 1)} % Fb</td><td style="text-align:right;">${fmt(out.col.Fb, 0)} cm² · ${fmt(out.col.Fe, 2)} cm²</td></tr></tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Predimensionado: debe verificarse el pandeo de la columna.</p></div>`;
  } else {
    left = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Estados de carga ${pill(net.noCompression && net.TpOk)}</h3>${statesTable(net)}
      <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Reacciones por cable: Rpp = ${fmt(net.Rpp, 2)} kg (H ${fmt(net.Hpp, 2)}, V ${fmt(net.Vpp, 2)}) y Rw = ${fmt(net.Rw, 2)} kg (H ${fmt(net.Hw, 2)}, V ${fmt(net.Vw, 2)}). Tp mínima = ${fmt(net.Tp0, 2)} kg; Tp con β1 = ${fmt(net.TpAuto, 2)} kg.</p></div>`;
    if (kind === 'jawerth') {
      left += pendantCard(out);
      left += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Apoyos</h3><table class="data-table"><tbody>
        <tr><td>Cable superior: R = ${kg(net.Ra)} kg (pendiente ${fmt(net.slopeDeg, 1)}°) → tensor a ${fmt(out.supA.betaDeg, 0)}°</td><td style="text-align:right;">T = <b>${kg(out.supA.T)}</b> · C = <b>${kg(out.supA.C)}</b> kg</td></tr>
        <tr><td>Cable inferior: R = ${kg(net.Rb)} kg → tensor a ${fmt(out.supB.betaDeg, 0)}°</td><td style="text-align:right;">T = <b>${kg(out.supB.T)}</b> · C = <b>${kg(out.supB.C)}</b> kg</td></tr></tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">${out.single ? 'Los dos cables se anclan en la misma columna: N = C1 + C2.' : 'El apoyo del cable inferior de la guía es espacial (tensores en el plano de las columnas y en el plano del cable, descomposición gráfica): acá se descompone en un solo plano, por lo que los valores del cable inferior son una cota del lado seguro y no coinciden con los de la guía.'}</p></div>`;
    }
    if (kind === 'ph') {
      left += `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Borde recto</h3><table class="data-table"><tbody>
        ${res.net.Rc.map((r) => `<tr><td>Resultante de los dos cables a 90° en ${r.id}: Rc = √(Ra² + Rb²)</td><td style="text-align:right;">${fmt(r.Rc, 0)} kg</td></tr>`).join('')}
        <tr><td>Viga de borde (columnas cada ${fmt(res.edge.n * num(calc.design.a, 1), 1)} m, cargas Rc cada ${fmt(num(calc.design.a, 1), 2)} m): momento máximo</td><td style="text-align:right;">${kg(res.edge.M)} kg·m</td></tr>
        <tr><td>Cordones: C = T = M / h (h = ${fmt(res.edge.h, 2)} m) · Fnec = C / ${kg(res.edge.sigmaAdm)}</td><td style="text-align:right;">${kg(res.edge.C)} kg · ${fmt(res.edge.Fnec, 2)} cm²</td></tr>
        <tr><td>Carga de cada columna del borde (n Rc)</td><td style="text-align:right;">${kg(res.edge.colN)} kg</td></tr></tbody></table>
        <p class="text-muted" style="font-size:12px; margin:8px 0 0;">Los cuatro diseños de apoyo de la guía (columna sola, dos tensores, tensor y puntal…) se descomponen gráficamente en el espacio con la geometría del dibujo: no se calculan aquí.</p></div>`;
    }
  }
  const right = `${checksCard({ ok, checks })}<div class="card" style="margin-top:16px;"><h3 style="margin-top:0;">Esquema</h3>${kind === 'jawerth' ? jawFigure(calc.design, out.pend) + jawPlan(calc.design) : netFigure(res.L ?? net.L, res.f ?? net.f, kind === 'heavy' ? 'Cable portante' : 'Cables de curvatura contraria', { two: kind !== 'heavy' })}</div>`;
  const susp = (() => { const sels = []; if (net.cableSel && net.cableSel.cable && net.cableSel.cable.suspect) sels.push(net.cableSel); return sels.length; })();
  return `<div class="grid grid-2" style="align-items:start;"><div>${left}</div><div>${right}${susp ? `<div class="note" style="margin-top:16px;">El cable elegido está en una celda de la tabla que no sigue la ley de sus vecinos (error del catálogo escaneado): verificarlo con la tabla del fabricante.</div>` : ''}</div></div>`;
}

function memoPendants(out) {
  const pd = out.pend;
  const rows = [memoRow('Reacción para la carga equivalente · qe', `R = ${fmt(pd.R, 0)} kg · qe = ${fmt(pd.qe, 1)} kg/m (${pd.shape === 'triangular' ? '4 R / (L √(1 / 36 λ² + 1))' : '2 R / (L √(1 / 16 λ² + 1))'})`)];
  if (pd.cover === 'tela') rows.push(memoRow('Tela: carga de rotura cada 50 mm', `qer = ${fmt(pd.qer, 2)} → apoyo ${fmt(pd.qer1, 2)} (φ = ${fmt(pd.phiS, 1)}°), clave ${fmt(pd.qer2, 2)} (φ = ${fmt(pd.phiC, 1)}°) kg/50 mm`));
  else if (pd.cover === 'pend') rows.push(memoRow('Pendolones inclinados', `b = ${fmt(pd.b, 2)} m · ${fmt(pd.F, 0)} kg · apoyo ${fmt(pd.TS, 0)} kg · clave ${fmt(pd.TC, 0)} kg`));
  else rows.push(memoRow('Pendolones verticales', `${pd.n} tramos de ${fmt(pd.b, 2)} m · ${fmt(pd.F, 0)} kg cada uno · ${pd.nT} traccionados, ${pd.nC} comprimidos`));
  return `<table>${rows.join('')}</table>`;
}

function memoria(calc, out) {
  if (!out || out.error || !out.res) return null;
  const { kind, res } = out;
  const checks = checksOf(out);
  const ok = checks.every((x) => x.ok);
  const d = calc.design;
  let body = '';
  const ART = 'Guía de predimensionado E4 · Tracción';
  const w = windSuggestion(d);
  const head = `<h2>1. Diseño</h2><table>${memoRow('Tipo', KINDS[kind], ART)}${kind === 'hr' ? `${memoRow('Hipérbola Y = c² / X', `c = ${fmt(d.c, 1)}; X desde ${fmt(d.x0, 2)} cada ${fmt(d.dx, 2)} m, ${d.nNodes} nudos`)}${memoRow('Hiperboloide', `eje de giro en X = ${fmt(d.xAxis, 2)}; ${d.nMer} meridianos`)}`
    : `${kind === 'jawerth' ? memoRow('Tipo de cercha · cubierta', `${LAYOUTS[out.layout]} · ${COVERS[out.cover]}`) : ''}${memoRow(out.layout === 'radial' ? 'Diámetro · flecha' : 'Luz · flecha', `L = ${fmt(d.L, 2)} m · f = ${fmt(d.f, 2)} m (f/L = ${fmt(d.f / d.L, 3)})`)}${memoRow(out.layout === 'radial' ? 'Ancho de la faja en el borde' : 'Distancia entre cables', `${fmt(d.a, 2)} m`)}`}
    ${memoRow('Peso propio · succión del viento', `${fmt(d.Pp, 0)} · ${fmt(d.W, 0)} kg/m²`)}${memoRow('Viento (CIRSOC 102-2005)', `qh = ${fmt(w.qh, 0)} N/m², p = qh (G Cp − GCpi) = ${fmt(w.pKg, 1)} kg/m² con Cp hipotético`)}</table>`;
  if (kind === 'hr') {
    const t = hyperTables(res);
    body = `<h2>2. Geometría y cargas por nudo</h2>${hyperFigure(res)}${t.nodes}
      <h2>3. Tensión previa</h2><table>${memoRow('To (teórica)', `${kg(res.To)} kg`)}${memoRow('K máxima = |Pp| / To', fmt(res.Kmax, 3))}${memoRow('Tp = To K β1', `${fmt(res.TpAuto, 0)} kg (β1 = ${fmt(res.beta1, 1)})`)}${memoRow('Tp adoptada', `${fmt(res.Tp, 0)} kg`)}</table>
      <h2>4. Esfuerzos en meridianos y paralelos</h2>${t.forces}${t.par}
      <h2>5. Cables, tela y apoyos</h2><table>${checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>`;
  } else {
    const net = res.net || res;
    body = `<h2>2. Esfuerzos de los cables</h2><table>${kind === 'heavy'
      ? `${memoRow('Qpp = Pp a · Qw = W a', `${fmt(res.Qpp, 0)} · ${fmt(res.Qw, 0)} kg/m`)}${memoRow('Hpp · Vpp · Rpp', `${fmt(res.Hpp, 2)} · ${fmt(res.Vpp, 2)} · ${fmt(res.Rpp, 2)} kg`, 'H = q L² / 8 f; V = q L / 2')}${memoRow('Rw', `${fmt(res.Rw, 2)} kg`)}`
      : `${memoRow('Qpp = Pp a · Qw = W a', `${fmt(net.Qpp, 0)} · ${fmt(net.Qw, 0)} kg/m (cada familia toma la mitad)`)}${memoRow('Rpp · Rw', `${fmt(net.Rpp, 2)} · ${fmt(net.Rw, 2)} kg`, 'H = (q/2) L² / 8 f; V = (q/2) L / 2')}${memoRow('Tensión previa mínima', `${fmt(net.Tp0, 2)} kg`)}${memoRow('Tp adoptada', `${fmt(net.Tp, 2)} kg`)}`}</table>
      ${kind === 'heavy' ? `<table>${res.states.map((s) => memoRow(escapeHtml(s.label), `${fmt(s.R, 2)} kg`)).join('')}</table>` : statesTable(net)}
      ${kind === 'jawerth' ? jawFigure(d, out.pend) + jawPlan(d) + memoPendants(out) : netFigure(net.L ?? res.L, net.f ?? res.f, kind === 'heavy' ? 'Cable portante' : 'Cables de curvatura contraria', { two: kind !== 'heavy' })}
      <h2>3. Cables, apoyos y verificaciones</h2><table>${checks.map((c) => memoRow(`${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)}`, escapeHtml(c.text))).join('')}</table>`;
  }
  return { title: calc.name, sub: `${KINDS[kind]} · ${kind === 'hr' ? `${d.nNodes} nudos` : `L = ${fmt(d.L, 1)} m, f = ${fmt(d.f, 1)} m`}`, html: `${head}${body}<h2>${kind === 'hr' ? '6' : '4'}. Resultado</h2><table>${memoRow('Estructura', ok ? 'verifica' : 'no verifica')}</table><p class="mem-foot">${escapeHtml(TENS_NOTE)}</p>` };
}
