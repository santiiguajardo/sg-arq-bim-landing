// Losa maciza armada en dos direcciones (elemento separado): paño apoyado en vigas, con cada borde apoyado o empotrado.
import { CIRSOC201 as N, LIVE_LOADS } from '../structural/norms.js';
import { designSlab2, slab2Quantities } from '../structural/plate.js';
import { escapeHtml } from '../utils.js';
import { setCalcField } from '../state.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';
import { slab2Figures } from './structural-draw.js';
import { slab2ArmadoFigure } from './structural-armado.js';

const ART = {
  method: 'CIRSOC 201 art. 13.5.1 (cualquier método que cumpla equilibrio y compatibilidad)',
  strips: 'CIRSOC 201 art. 13.5.2 y 13.6.4 (franjas central y laterales)',
  minSteel: 'CIRSOC 201 art. 13.3.1 y 7.12.2.1',
  spacing: 'CIRSOC 201 art. 13.3.2',
  corner: 'CIRSOC 201 art. 13.3.6',
  shear: 'CIRSOC 201 art. 11.12.1.1 y 11.3.1.1',
  hRef: 'CIRSOC 201 art. 9.5.3.3, ec. (9-13)',
};
const EDGE_OPTS = [['S', 'Apoyado en viga (sin continuidad)'], ['C', 'Empotrado (continúa con otro paño)']];
const EDGE_NAMES = { x0: 'Borde izquierdo (x = 0)', x1: 'Borde derecho (x = lx)', y0: 'Borde inferior (y = 0)', y1: 'Borde superior (y = ly)' };

function inputOf(calc) {
  const d = calc.design;
  const m = calc.materials;
  return {
    lx: Number(d.lx), ly: Number(d.ly), edges: { ...d.edges }, D0: Number(d.perm) || 0, Lv: Number(d.live) || 0,
    h: Number(calc.section.h) * 10, fc: Number(m.fc), placement: m.placement, exposure: m.exposure,
    limitKey: calc.verification.limitKey, xi: Number(calc.verification.xi), nu: Number(d.nu) || 0.2, diameter: calc.section.diameter || 'auto',
  };
}

function edgeFix(kind) { return kind === 'C' ? 'C' : 'S'; }

export const slab2Module = {
  label: 'Losa maciza armada en dos direcciones',

  defaults() {
    return {
      design: { lx: 4.5, ly: 5.5, edges: { x0: 'S', x1: 'S', y0: 'S', y1: 'S' }, perm: 1.5, liveId: 'viv', live: 2, nu: 0.2 },
      section: { h: 14, diameter: 'auto' },
      materials: { fc: 25, rebar: 'ADN420', placement: 'interior', exposure: 'A1A2', dagg: 19 },
      verification: { limitKey: 'floorNoDamage', xi: 2.0 },
    };
  },

  run(calc) {
    const input = inputOf(calc);
    if (![input.lx, input.ly, input.h, input.fc].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá las luces y el espesor con valores mayores que cero.' };
    try { return { res: designSlab2(input), input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },

  step1(calc) {
    const d = calc.design;
    const liveOpts = [...LIVE_LOADS.map((l) => [l.id, `${l.label} — ${fmt(l.value, 1)} kN/m²`]), ['custom', 'Otro valor (lo ingreso yo)']];
    const ratio = Math.max(d.lx, d.ly) / Math.min(d.lx, d.ly);
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Esquema estructural</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.lx', 'Luz en X (lx)', d.lx, { unit: 'm', hint: 'Entre ejes de vigas.' })}
            ${numField('design.ly', 'Luz en Y (ly)', d.ly, { unit: 'm', hint: 'Entre ejes de vigas.' })}
          </div>
          ${ratio > 2 ? '<p><span class="tag tag-alta">Relación de luces mayor que 2</span> <span class="text-muted" style="font-size:12.5px;">trabaja casi en una dirección (art. 13.6.1.2): usá "Losa en una dirección".</span></p>' : ''}
          ${['x0', 'x1', 'y0', 'y1'].map((k) => selField(`design.edges.${k}`, EDGE_NAMES[k], edgeFix(d.edges[k]), EDGE_OPTS)).join('')}
          <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Las vigas de borde se suponen rígidas (no deforman). "Empotrado" idealiza la continuidad total con un paño vecino de rigidez parecida; es una simplificación: si el paño vecino es mucho más chico o más flexible, revisá los resultados.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Planta del paño</h3>
          ${planSVG(d)}
          <h3 style="margin:14px 0 8px;">Cargas (sin peso propio de la losa)</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.perm', 'Otras cargas permanentes', d.perm, { unit: 'kN/m²', hint: 'Contrapiso, solado, cielorraso, tabiques repartidos: CIRSOC 101, Tablas 3.1 y 3.2.' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.liveId', 'Destino (sobrecarga)', d.liveId, liveOpts, 'CIRSOC 101, Tabla 4.1.')}
            ${numField('design.live', 'Sobrecarga de uso', d.live, { unit: 'kN/m²' })}
          </div>
        </div>
      </div>`;
  },

  step2(calc) {
    const m = calc.materials;
    const out = this.run(calc);
    const hRef = out.res && out.res.hRef ? Math.ceil(out.res.hRef / 10) : null;
    const cur = Number(calc.section.h);
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Materiales y espesor</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c} (${c} MPa)`]))}
            <div class="field"><label>Barras</label><input value="ADN 420" disabled /></div>
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('section.h', 'Espesor h', calc.section.h, { unit: 'cm' })}
          </div>
          <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">Espesor actual: ${fmt(cur, 0)} cm.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Espesor de referencia</h3>
          ${hRef ? `<table class="data-table"><tbody>
            <tr><td>Límite inferior de las ecuaciones (9-12) y (9-13)<br><span class="text-muted" style="font-size:11.5px;">${ART.hRef} · ln (0,8 + fy/1400) / (36 + 9 β), no menor que 90 mm. Vale para vigas muy rígidas en los cuatro bordes; con vigas flexibles hace falta más.</span></td><td style="text-align:right;"><b>${fmt(out.res.hRef / 10, 1)} cm</b></td></tr>
            <tr><td><b>Espesor sugerido</b> (redondeado a 1 cm)</td><td style="text-align:right;"><b>${hRef} cm</b></td></tr>
          </tbody></table>
          <div style="margin-top:10px;"><button class="btn btn-primary btn-sm" data-use-h="${hRef}" ${Math.abs(cur - hRef) < 1e-9 ? 'disabled' : ''}>Usar ${hRef} cm</button></div>` : '<div class="empty-state">Completá las luces en el paso 1.</div>'}
          <p class="text-muted" style="font-size:12px; margin:10px 0 0;">En el paso 3 se verifican igual flexión, corte y flecha por cálculo.</p>
        </div>
      </div>`;
  },

  step3(calc, out) {
    const m = calc.materials;
    const v = calc.verification;
    const diaOpts = [['auto', 'Automático (menor exceso de armadura)'], ...[6, 8, 10, 12, 16].map((x) => [x, `ø${x} mm`])];
    const inputs = `<div class="card">
      <h3 style="margin-top:0;">Datos de dimensionado</h3>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c}`]))}
        ${numField('section.h', 'Espesor h', calc.section.h, { unit: 'cm' })}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('section.diameter', 'Diámetro de las barras', calc.section.diameter || 'auto', diaOpts)}
        ${numField('design.nu', 'Coeficiente de Poisson', calc.design.nu, { step: '0.05', hint: 'Hormigón: 0,2 es un valor corriente (hipótesis, no es un dato del reglamento).' })}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('materials.placement', 'Ubicación', m.placement, Object.entries(N.placement).map(([k, x]) => [k, x.label]), 'CIRSOC 201 art. 7.7.1')}
        ${selField('materials.exposure', 'Clase de exposición', m.exposure, Object.entries(N.exposure).map(([k, x]) => [k, x.label]))}
      </div>
      <div class="field-row" style="flex-wrap:wrap;">
        ${selField('verification.limitKey', 'Límite de flecha (Tabla 9.5.b)', v.limitKey, Object.entries(N.deflectionLimits).map(([k, x]) => [k, `${x.label} — l/${x.ratio}`]))}
        ${selField('verification.xi', 'Duración de la carga permanente', v.xi, N.timeFactor.map((t) => [t.xi, `${t.label} (ξ = ${t.xi})`]), 'Art. 9.5.2.5.')}
      </div>
    </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${resultsHTML(calc, out)}</div></div>`;
  },

  memoria(calc, out) {
    return memoria(calc, out);
  },
};

// ---------------------------------------------------------------- gráficos
function planSVG(d) {
  const W = 300;
  const H = 210;
  const k = Math.min(200 / d.lx, 130 / d.ly);
  const w = d.lx * k;
  const h = d.ly * k;
  const x0 = (W - w) / 2;
  const y0 = 38;
  const edge = (kind, x1, y1, x2, y2, nx, ny) => {
    if (kind === 'C') {
      const hatch = Array.from({ length: 9 }, (_, i) => {
        const t = (i + 0.5) / 9;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        return `<line x1="${px}" y1="${py}" x2="${px + nx * 9 - ny * 5}" y2="${py + ny * 9 + nx * 5}" stroke="var(--ink-soft)" stroke-width="1"/>`;
      }).join('');
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="4"/>${hatch}`;
    }
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 3"/>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:340px;" role="img" aria-label="Planta del paño de losa con sus bordes">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="var(--accent)" fill-opacity="0.08"/>
    ${edge(d.edges.y1, x0, y0, x0 + w, y0, 0, -1)}${edge(d.edges.y0, x0, y0 + h, x0 + w, y0 + h, 0, 1)}
    ${edge(d.edges.x0, x0, y0, x0, y0 + h, -1, 0)}${edge(d.edges.x1, x0 + w, y0, x0 + w, y0 + h, 1, 0)}
    <text x="${W / 2}" y="${y0 - 14}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">lx = ${fmt(d.lx, 2)} m</text>
    <text x="${x0 - 14}" y="${y0 + h / 2}" text-anchor="middle" font-size="11" fill="var(--ink-soft)" transform="rotate(-90 ${x0 - 14} ${y0 + h / 2})">ly = ${fmt(d.ly, 2)} m</text>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">trazo grueso con rayado = empotrado · punteado = apoyado</text></svg>`;
}

// Mapa de momentos (kN·m/m) de la placa para la carga mayorada: positivo (tracción abajo) en azul, negativo en cálido.
function fieldSVG(pl, field, wu, title) {
  const rows = pl[field];
  const vals = rows.flatMap((r) => Array.from(r)).map((v) => v * wu);
  const vmax = Math.max(...vals.map(Math.abs), 1e-9);
  const W = 260;
  const cw = W / pl.nx;
  const ch = Math.min(cw * (pl.hy / pl.hx), 8);
  const H = ch * pl.ny + 24;
  let cells = '';
  for (let j = 0; j < pl.ny; j++) {
    for (let i = 0; i < pl.nx; i++) {
      const v = (rows[j][i] + rows[j + 1][i] + rows[j][i + 1] + rows[j + 1][i + 1]) / 4 * wu;
      const t = Math.min(1, Math.abs(v) / vmax);
      const color = v >= 0 ? `rgba(36, 99, 235, ${0.12 + 0.78 * t})` : `rgba(217, 119, 6, ${0.12 + 0.78 * t})`;
      cells += `<rect x="${i * cw}" y="${22 + (pl.ny - 1 - j) * ch}" width="${cw + 0.4}" height="${ch + 0.4}" fill="${color}"/>`;
    }
  }
  const pos = Math.max(...vals);
  const neg = Math.min(...vals);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px;" role="img" aria-label="${title}">
    <text x="0" y="12" font-size="11" fill="var(--ink)">${title}</text>${cells}
    <rect x="0" y="22" width="${W}" height="${ch * pl.ny}" fill="none" stroke="var(--ink-soft)"/>
    <text x="${W}" y="12" text-anchor="end" font-size="10" fill="var(--ink-soft)">+${fmt(pos, 1)} / ${fmt(neg, 1)} kN·m/m</text></svg>`;
}

// ---------------------------------------------------------------- resultados
const barTxt = (c) => (c ? `ø${c.db} c/${fmt(c.s / 10, 0)} cm` : '—');

function resultsHTML(calc, out) {
  const { res, input } = out;
  if (res.reason && !res.strips) return `<div class="card"><span class="tag tag-alta">No verifica</span><p style="margin:10px 0 0;">${escapeHtml(res.reason)}</p></div>`;
  const wu = res.combos.wu;
  const stripRows = res.strips.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td style="text-align:right;">${fmt(s.Mu, 2)}</td><td>${s.chosen ? `<b>${barTxt(s.chosen)}</b>` : '<span class="tag tag-alta">No verifica</span>'}</td><td style="text-align:right;">${s.chosen ? fmt(s.chosen.As, 0) : '—'}</td></tr>`).join('');
  const cornerRows = res.corners.map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${barTxt(c.chosen)} arriba y abajo</td><td style="text-align:right;">${fmt(c.length / 10, 0)} cm</td></tr>`).join('');
  const q = slab2Quantities(res, input.h);
  const dfl = res.deflection;
  const dc = res.deflectionCheck;
  const figs = slab2Figures(res, 'screen');
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Esquema de cálculo</h3>
      ${figs.plan}${figs.moments}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">Reacciones sobre las vigas por áreas de influencia a 45° (CIRSOC 201 art. 13.6.8): son las cargas con que se calculan las vigas de borde. Los momentos por metro de ancho (promedio de la franja central) son los valores con que se adopta la armadura; el corte en el borde, con el que se verifica el espesor.</p>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Cargas y momentos</h3>
      <table class="data-table"><tbody>
        <tr><td>Peso propio</td><td style="text-align:right;">${fmt(res.self, 2)} kN/m²</td></tr>
        <tr><td>Carga permanente total D · sobrecarga L</td><td style="text-align:right;">${fmt(res.D, 2)} · ${fmt(input.Lv, 2)} kN/m²</td></tr>
        <tr><td>wu = ${res.combos.governing}</td><td style="text-align:right;"><b>${fmt(wu, 2)} kN/m²</b></td></tr>
        <tr><td>Relación de luces</td><td style="text-align:right;">${fmt(res.ratio, 2)}</td></tr>
      </tbody></table>
      <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">${ART.method}: placa elástica delgada (Kirchhoff), con ν = ${fmt(res.nu, 2)}, resuelta por diferencias finitas (${res.plate.nx} × ${res.plate.ny} divisiones). Contrastada con los valores clásicos de Timoshenko para placas cuadradas y rectangulares apoyadas o empotradas.</p>
      <div class="grid grid-2" style="margin-top:10px; gap:10px;">${fieldSVG(res.plate, 'mx', wu, 'Mx (kN·m/m)')}${fieldSVG(res.plate, 'my', wu, 'My (kN·m/m)')}</div>
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">Azul: tracción abajo (positivo). Naranja: tracción arriba (negativo, en bordes empotrados).</p>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Armado: dónde va el hierro</h3>
      ${slab2ArmadoFigure(res, 'screen')}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Armadura por franjas</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Franja</th><th style="text-align:right;">Mu (kN·m/m)</th><th>Armadura</th><th style="text-align:right;">As (mm²/m)</th></tr></thead><tbody>${stripRows}</tbody></table></div>
      <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">${ART.strips}: la franja central es la mitad del ancho y cada franja lateral un cuarto; cada una se arma con el momento promedio de su ancho, con la armadura mínima (${ART.minSteel}) y separación máxima 2 h (${ART.spacing}). La armadura inferior de la luz corta va en la capa más baja.</p>
      ${res.corners.length ? `<h4 style="margin:14px 0 6px; font-size:13px;">Armadura de esquina (${ART.corner})</h4>
        <table class="data-table"><thead><tr><th>Esquina</th><th>Armadura</th><th style="text-align:right;">Desde la esquina</th></tr></thead><tbody>${cornerRows}</tbody></table>
        <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">Para el máximo momento positivo del paño, en una faja que abarca 1/5 de la luz mayor desde la esquina: arriba paralela a la diagonal y abajo perpendicular a ella, o en dos capas paralelas a los lados. Se exige si la losa apoya en vigas con αf &gt; 1 (vigas rígidas).</p>` : ''}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Corte y flecha</h3>
      <table class="data-table"><tbody>
        <tr><td>Reacción en el borde (${res.shear.kShear === 0.625 ? '5/8 wu l: luz corta apoyada-empotrada' : '1/2 wu l: áreas de influencia'}) · Vu a d de la cara</td><td style="text-align:right;">${fmt(res.shear.Vu, 1)} · ${fmt(res.shear.VuAtD, 1)} kN/m</td></tr>
        <tr><td>φVc (${ART.shear})</td><td style="text-align:right;">${fmt(res.shear.phiVc, 1)} kN/m</td></tr>
        <tr><td>Inercia efectiva Ie / Ig (franja central, luz corta)</td><td style="text-align:right;">${fmt(dfl.Ie / dfl.Ig, 2)}</td></tr>
        <tr><td>Flecha instantánea por D · por L</td><td style="text-align:right;">${fmt(dfl.instD, 1)} · ${fmt(dfl.instL, 1)} mm</td></tr>
        <tr><td>Flecha diferida por D (λ = ${fmt(dfl.lambda, 1)})</td><td style="text-align:right;">${fmt(dfl.longD, 1)} mm</td></tr>
        <tr><td><b>${dc.uses === 'L' ? 'Flecha por L' : 'Flecha diferida por D + instantánea por L'}</b><br><span class="text-muted" style="font-size:11.5px;">Límite: ${escapeHtml(dc.label)} (l/${dc.ratio}, con l = luz menor)</span></td><td style="text-align:right;"><b>${fmt(dc.value, 1)} mm</b> / ${fmt(dc.limit, 1)} mm</td></tr>
      </tbody></table>
      ${q ? `<p style="font-size:13px; margin:10px 0 0;">Cómputo orientativo: <b>${fmt(q.concrete, 2)} m³</b> de hormigón y <b>${fmt(q.steel, 0)} kg</b> de hierro (${fmt(q.steel / q.area, 1)} kg/m², sin empalmes ni ganchos).</p>` : ''}
    </div>
    ${checksCard(res)}`;
}

// ---------------------------------------------------------------- memoria
function memoria(calc, out) {
  const { res, input } = out;
  if (!res || !res.strips) return null;
  const rows = res.strips.map((s) => memoRow(escapeHtml(s.name), `Mu ${fmt(s.Mu, 2)} kN·m/m → ${barTxt(s.chosen)}${s.chosen ? ` (${fmt(s.chosen.As, 0)} mm²/m)` : ''}`)).join('');
  const q = slab2Quantities(res, input.h);
  const figs = slab2Figures(res, 'print');
  return {
    title: calc.name,
    sub: `Losa maciza armada en dos direcciones · ${fmt(input.lx, 2)} × ${fmt(input.ly, 2)} m · h = ${fmt(input.h / 10, 0)} cm`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Hormigón', `H-${input.fc} (f'c = ${input.fc} MPa)`)}${memoRow('Acero', 'ADN 420, fy = 420 MPa')}${memoRow('Espesor', `${fmt(input.h / 10, 0)} cm`)}
        ${['x0', 'x1', 'y0', 'y1'].map((k) => memoRow(EDGE_NAMES[k], input.edges[k] === 'C' ? 'empotrado' : 'apoyado')).join('')}
        ${memoRow('Carga permanente sin peso propio', `${fmt(input.D0, 2)} kN/m²`, 'CIRSOC 101, Tablas 3.1 y 3.2')}${memoRow('Sobrecarga', `${fmt(input.Lv, 2)} kN/m²`, 'CIRSOC 101, Tabla 4.1')}</table>
      <h2>2. Cargas y método</h2>
      <table>${memoRow('Peso propio', `${fmt(res.self, 2)} kN/m²`, 'γ hormigón armado = 25 kN/m³')}${memoRow(`wu = ${res.combos.governing}`, `${fmt(res.combos.wu, 2)} kN/m²`, 'CIRSOC 201 art. 9.2.1')}
        ${memoRow('Método de análisis', `Placa elástica de Kirchhoff, ν = ${fmt(res.nu, 2)}, diferencias finitas ${res.plate.nx} × ${res.plate.ny}`, ART.method)}
        ${memoRow('Relación de luces', fmt(res.ratio, 2), 'CIRSOC 201 art. 13.6.1.2')}</table>
      ${figs.plan}${figs.moments}
      <h2>3. Armadura por franjas</h2>
      <table>${rows}</table>
      ${slab2ArmadoFigure(res, 'print')}
      ${res.corners.length ? `<h2>4. Armadura de esquina</h2><table>${res.corners.map((c) => memoRow(escapeHtml(c.label), `${barTxt(c.chosen)} arriba y abajo, hasta ${fmt(c.length / 10, 0)} cm desde la esquina`, ART.corner)).join('')}</table>` : ''}
      <h2>${res.corners.length ? '5' : '4'}. Corte y flecha</h2>
      <table>${memoRow('Vu a d de la cara', `${fmt(res.shear.VuAtD, 1)} kN/m`, ART.shear)}${memoRow('φVc', `${fmt(res.shear.phiVc, 1)} kN/m`)}
        ${memoRow('Flecha instantánea por D · por L', `${fmt(res.deflection.instD, 1)} · ${fmt(res.deflection.instL, 1)} mm`, 'CIRSOC 201 art. 9.5.2 (Ie, ec. 9-8)')}
        ${memoRow(`Verificación: ${res.deflectionCheck.label}`, `${fmt(res.deflectionCheck.value, 1)} ≤ ${fmt(res.deflectionCheck.limit, 1)} mm (l/${res.deflectionCheck.ratio})`, 'Tabla 9.5.b)')}</table>
      <h2>${res.corners.length ? '6' : '5'}. Verificaciones</h2>
      <table>${res.checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, escapeHtml(k.text))).join('')}</table>
      ${q ? `<h2>${res.corners.length ? '7' : '6'}. Cómputo orientativo</h2><table>${memoRow('Hormigón', `${fmt(q.concrete, 2)} m³`)}${memoRow('Hierro (estimado)', `${fmt(q.steel, 0)} kg · ${fmt(q.steel / q.area, 1)} kg/m²`)}</table>` : ''}`,
  };
}

export { failCard };
