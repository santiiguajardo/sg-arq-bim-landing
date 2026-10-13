import { CIRSOC201 as N } from '../structural/norms.js';
import * as col from '../structural/column.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';
import { columnFigure } from './structural-draw.js';

const ART = {
  axial: 'CIRSOC 201 art. 10.3.6.2, ec. (10-2)',
  rho: 'CIRSOC 201 art. 10.9.1 y 10.9.2',
  slender: 'CIRSOC 201 art. 10.11.2, 10.12.2 (ec. 10-7) y 10.12.3 (ec. 10-8 a 10-14)',
  biaxial: 'CIRSOC 201, Comentario C 10.3 (método de las cargas recíprocas) y art. 10.11.6',
  ties: 'CIRSOC 201 art. 7.10.5, Tabla 7.10.5.1',
  spacing: 'CIRSOC 201 art. 7.6.3',
  cover: 'CIRSOC 201 art. 7.7.1, Tabla 7.7.1',
  combos: 'CIRSOC 201 art. 9.2.1, ec. (9-2)',
};

export const columnModule = {
  label: 'Columna de hormigón armado',

  defaults() {
    return {
      design: { lu: 3, PD: 400, PL: 150, M2x: 0, rx: 1, M2y: 0, ry: 1 },
      section: { b: 30, h: 30 },
      materials: { fc: 25, rebar: 'ADN420', stirrup: 'ADN420', dStirrup: 8, placement: 'interior', exposure: 'A1A2', dagg: 19 },
      verification: { limitKey: 'floorNoDamage', xi: 2 },
      predim: { rho: 2 },
    };
  },

  input(calc) {
    const d = calc.design;
    const Pu = (1.2 * d.PD + 1.6 * d.PL) * 1000;
    const kn = 1e6;
    return {
      b: calc.section.b * 10, h: calc.section.h * 10, fc: Number(calc.materials.fc), fy: 420,
      Pu, sustained: 1.2 * d.PD * 1000,
      M2x: d.M2x * kn, M1x: d.rx * d.M2x * kn, M2y: d.M2y * kn, M1y: d.ry * d.M2y * kn,
      lu: d.lu * 1000, placement: calc.materials.placement, exposure: calc.materials.exposure, dagg: Number(calc.materials.dagg),
      bars: calc.chosen,
    };
  },

  run(calc) {
    const input = this.input(calc);
    if (![input.b, input.h, input.fc, input.lu, input.Pu].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá las medidas, la altura y la carga con valores mayores que cero.' };
    try { return { res: col.designColumn(input), input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },

  step1(calc) {
    const d = calc.design;
    const Pu = 1.2 * d.PD + 1.6 * d.PL;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Geometría y carga axial</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.lu', 'Altura libre de la columna', d.lu, { unit: 'm', hint: 'Distancia libre entre losas o vigas que la arriostran (art. 10.11.3.1).' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.PD', 'Carga axial permanente D', d.PD, { unit: 'kN', hint: 'De servicio, incluido el peso propio de la columna.' })}
            ${numField('design.PL', 'Carga axial de sobrecarga L', d.PL, { unit: 'kN', hint: 'De servicio.' })}
          </div>
          <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">Pu = 1,2 D + 1,6 L = <b>${fmt(Pu, 0)} kN</b> (${ART.combos}).</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Momentos de primer orden (mayorados)</h3>
          <p class="text-muted" style="font-size:12.5px; margin:-6px 0 10px;">Si la columna es de un pórtico, cargá el momento mayor M2 en cada dirección y la relación M1/M2 (positiva si se curva en curvatura simple; negativa en doble curvatura). Dejá 0 si solo hay carga axial.</p>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.M2x', 'M2 en el plano de h (alrededor de x)', d.M2x, { unit: 'kN·m' })}
            ${numField('design.rx', 'M1 / M2', d.rx, { min: -1, step: 0.1 })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.M2y', 'M2 en el plano de b (alrededor de y)', d.M2y, { unit: 'kN·m' })}
            ${numField('design.ry', 'M1 / M2', d.ry, { min: -1, step: 0.1 })}
          </div>
          <p class="text-muted" style="font-size:12px; margin:6px 0 0;">Se supone pórtico indesplazable (arriostrado, k = 1, art. 10.12.1). Con momentos en ambas direcciones se verifica flexión biaxial.</p>
        </div>
      </div>`;
  },

  step2(calc) {
    const d = calc.design;
    const fc = Number(calc.materials.fc);
    const Pu = (1.2 * d.PD + 1.6 * d.PL) * 1000;
    const rho = (Number(calc.predim?.rho) || 2) / 100;
    const k = 0.80 * N.phiCompression * (0.85 * fc * (1 - rho) + rho * 420);
    const Ag = Pu / k;
    const side = Math.ceil(Math.sqrt(Ag) / 50) * 50;
    const rMin = d.lu * 1000 / (0.3 * 22);
    const cur = calc.section;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Materiales y sección</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('materials.fc', "Hormigón (f'c)", fc, N.concreteClasses.map((c) => [c, `H-${c} (${c} MPa)`]))}
            ${numField('predim.rho', 'Cuantía supuesta para predimensionar', calc.predim?.rho ?? 2, { unit: '%', min: 1, step: 0.5, hint: 'Criterio de predimensionado; la norma exige entre 1 % y 8 % (art. 10.9.1).' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('section.b', 'Lado b', cur.b, { unit: 'cm' })}
            ${numField('section.h', 'Lado h', cur.h, { unit: 'cm' })}
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Sección mínima por carga axial</h3>
          <table class="data-table"><tbody>
            <tr><td>Pu</td><td style="text-align:right;">${fmt(Pu / 1000, 0)} kN</td></tr>
            <tr><td>φPn,máx = 0,80 φ [0,85 f'c (Ag − Ast) + fy Ast] (${ART.axial})<br><span class="text-muted" style="font-size:11.5px;">con ρ = ${fmt(rho * 100, 1)} % y φ = ${N.phiCompression}</span></td><td style="text-align:right;">${fmt(k, 2)} MPa × Ag</td></tr>
            <tr><td>Área necesaria Ag</td><td style="text-align:right;">${fmt(Ag / 100, 0)} cm²</td></tr>
            <tr><td><b>Lado sugerido</b> (sección cuadrada, redondeado a 5 cm)</td><td style="text-align:right;"><b>${fmt(side / 10, 0)} cm</b></td></tr>
            <tr><td>Lado mínimo para ignorar la esbeltez (kℓu/r ≤ 22)<br><span class="text-muted" style="font-size:11.5px;">caso más desfavorable, M1/M2 = 1 (ec. 10-7, r = 0,30 h)</span></td><td style="text-align:right;">${fmt(rMin / 10, 0)} cm</td></tr>
          </tbody></table>
          <p class="text-muted" style="font-size:12px; margin:10px 0 0;">No incluye los momentos: el paso 3 verifica la flexocompresión completa. La norma no fija una dimensión mínima de columna (salvo por resistencia al fuego, art. 7.7.7).</p>
        </div>
      </div>`;
  },

  step3(calc, out) {
    const m = calc.materials;
    const inputs = `
      <div class="card">
        <h3 style="margin-top:0;">Datos de dimensionado</h3>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('materials.fc', "Hormigón (f'c)", m.fc, N.concreteClasses.map((c) => [c, `H-${c}`]))}
          <div class="field"><label>Barras</label><input value="ADN 420" disabled /></div>
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${numField('section.b', 'b', calc.section.b, { unit: 'cm' })}
          ${numField('section.h', 'h', calc.section.h, { unit: 'cm' })}
        </div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${selField('materials.placement', 'Ubicación', m.placement, Object.entries(N.placement).map(([k, x]) => [k, x.label]), ART.cover)}
          ${selField('materials.exposure', 'Clase de exposición', m.exposure, Object.entries(N.exposure).map(([k, x]) => [k, x.label]))}
        </div>
        ${numField('materials.dagg', 'Tamaño máx. del agregado', m.dagg, { unit: 'mm', hint: 'Define la separación libre mínima entre barras (art. 7.6.3).' })}
      </div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${this.results(calc, out)}</div></div>`;
  },

  results(calc, out) {
    const { res, input } = out;
    const sx = res.slender.x;
    const sy = res.slender.y;
    const head = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Solicitaciones y esbeltez</h3>
      <table class="data-table"><tbody>
        <tr><td>Pu (${ART.combos})</td><td style="text-align:right;"><b>${fmt(res.Pu / 1000, 0)} kN</b></td></tr>
        <tr><td>βd = 1,2 D / Pu</td><td style="text-align:right;">${fmt(res.betad, 2)}</td></tr>
        <tr><td>kℓu/r en x · límite (${ART.slender})</td><td style="text-align:right;">${fmt(sx.ratio, 1)} · ${fmt(sx.limit, 1)}${sx.slender ? ' → amplifica' : ''}</td></tr>
        <tr><td>kℓu/r en y · límite</td><td style="text-align:right;">${fmt(sy.ratio, 1)} · ${fmt(sy.limit, 1)}${sy.slender ? ' → amplifica' : ''}</td></tr>
        ${res.Mcx !== undefined ? `<tr><td>Momento de diseño Mc en x</td><td style="text-align:right;">${fmt(res.Mcx / 1e6, 1)} kN·m${sx.slender ? ` (δns = ${fmt(sx.delta, 2)})` : ''}</td></tr>
        <tr><td>Momento de diseño Mc en y</td><td style="text-align:right;">${fmt(res.Mcy / 1e6, 1)} kN·m${sy.slender ? ` (δns = ${fmt(sy.delta, 2)})` : ''}</td></tr>` : ''}
      </tbody></table>
    </div>`;
    const figs = columnFigures(res, input, 'screen');
    const fig = figs ? `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${figs}</div>` : '';
    if (!res.chosen) return `${fig}${head}${failCard(res.reason)}`;
    const c = res.chosen;
    const opts = res.options.slice(0, 8).map((o) => {
      const sel = c.db === o.db && c.nb === o.nb && c.nh === o.nh;
      return `<label class="chk-row" style="padding:5px 0;"><input type="radio" name="bars" data-chosen value="${o.db}:${o.nb}:${o.nh}" ${sel ? 'checked' : ''} />
        <span><b>${o.n} ø${o.db}</b> (${o.nb} × ${o.nh}) — ρ = ${fmt(o.rho * 100, 2)} % · aprovechamiento ${fmt(o.util * 100, 0)} %</span></label>`;
    }).join('');
    const body = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Armadura</h3>
      <h4 style="margin:0 0 6px; font-size:13px;">Elegí la armadura longitudinal</h4>${opts}
      <table class="data-table" style="margin-top:10px;"><tbody>
        <tr><td>Recubrimiento a los estribos (${ART.cover})</td><td style="text-align:right;">${c.cover} mm</td></tr>
        <tr><td><b>Estribos cerrados</b> (${ART.ties})</td><td style="text-align:right;"><b>ø${c.dbe} c/${fmt(c.tieSpacing / 10, 1)} cm</b></td></tr>
        <tr><td>Separación libre entre barras · mínima (${ART.spacing})</td><td style="text-align:right;">${fmt(c.clear, 0)} mm · ${fmt(c.minClear, 0)} mm</td></tr>
      </tbody></table>
      ${res.unsupported ? '<p class="text-muted" style="font-size:12px; margin:8px 0 0;">Hay barras intermedias a más de 15 dbe de una barra soportada: agregá ganchos suplementarios a 135° (art. 7.10.5.3).</p>' : ''}
      ${columnSectionSVG({ b: input.b, h: input.h, bars: c.bars, db: c.db, cover: c.cover, dbe: c.dbe })}
      ${interactionSVG(res, c)}
    </div>`;
    return `${fig}${head}${body}${checksCard(res)}`;
  },

  memoria(calc, out) {
    const { res, input } = out;
    const c = res.chosen;
    const sx = res.slender.x;
    const sy = res.slender.y;
    return {
      title: calc.name,
      sub: `Columna de hormigón armado · ${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm · altura libre ${fmt(input.lu / 1000, 2)} m`,
      html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Hormigón', `H-${input.fc}`)}${memoRow('Acero', 'ADN 420, fy = 420 MPa')}${memoRow('Sección', `${fmt(input.b / 10, 0)} × ${fmt(input.h / 10, 0)} cm`)}
        ${memoRow('Carga permanente D', `${fmt(calc.design.PD, 0)} kN`)}${memoRow('Sobrecarga L', `${fmt(calc.design.PL, 0)} kN`)}</table>
      <h2>2. Solicitaciones</h2>
      <table>${memoRow('Pu = 1,2 D + 1,6 L', `${fmt(res.Pu / 1000, 0)} kN`, ART.combos)}${memoRow('M1 / M2 en x', `${fmt(input.M1x / 1e6, 1)} / ${fmt(input.M2x / 1e6, 1)} kN·m`)}${memoRow('M1 / M2 en y', `${fmt(input.M1y / 1e6, 1)} / ${fmt(input.M2y / 1e6, 1)} kN·m`)}</table>
      ${columnFigures(res, input, 'print')}
      <h2>3. Esbeltez</h2>
      <table>${memoRow('r = 0,30 h', `${fmt(sx.r, 0)} mm (x) · ${fmt(sy.r, 0)} mm (y)`, 'CIRSOC 201 art. 10.11.2')}
        ${memoRow('kℓu/r · límite 34 − 12 M1/M2 ≤ 40', `${fmt(sx.ratio, 1)} · ${fmt(sx.limit, 1)} (x) — ${fmt(sy.ratio, 1)} · ${fmt(sy.limit, 1)} (y)`, ART.slender)}
        ${memoRow('Momentos de diseño Mc', `${fmt(res.Mcx / 1e6, 1)} kN·m (x) · ${fmt(res.Mcy / 1e6, 1)} kN·m (y)`, sx.slender || sy.slender ? 'δns = Cm / (1 − Pu / 0,75 Pc); EI = 0,4 Ec Ig / (1 + βd)' : 'Efectos de esbeltez despreciables')}</table>
      <h2>4. Armadura</h2>
      <table>${memoRow('Armadura longitudinal', `${c.n} ø${c.db} (ρ = ${fmt(c.rho * 100, 2)} %)`, ART.rho)}${memoRow('φPn,máx', `${fmt(c.dx.phiPnMax / 1000, 0)} kN`, ART.axial)}
        ${memoRow('Flexocompresión', `${c.biaxial ? 'biaxial (cargas recíprocas)' : 'uniaxial'}: aprovechamiento ${fmt(c.util * 100, 0)} %`, ART.biaxial)}
        ${memoRow('Estribos', `ø${c.dbe} c/${fmt(c.tieSpacing / 10, 1)} cm`, `s ≤ 12 db, 48 dbe, lado menor — ${ART.ties}`)}${memoRow('Recubrimiento', `${c.cover} mm`, ART.cover)}</table>
      <h2>5. Verificaciones</h2>
      <table>${res.checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, k.text)).join('')}</table>`,
    };
  },
};

function columnFigures(res, input, pal) {
  if (!res.slender || res.Pu === undefined) return '';
  const one = (axis) => {
    const M1 = (axis === 'x' ? input.M1x : input.M1y) / 1e6;
    const M2 = (axis === 'x' ? input.M2x : input.M2y) / 1e6;
    const Mc = (axis === 'x' ? res.Mcx : res.Mcy) / 1e6;
    if (Math.abs(M2) < 1e-9 && Math.abs(Mc) < 1e-9 && axis === 'y') return '';
    return columnFigure({ lu: input.lu / 1000, Pu: res.Pu / 1000, M1, M2, Mc, axis, slender: res.slender[axis].slender, pal });
  };
  return one('x') + one('y');
}

function columnSectionSVG({ b, h, bars, db, cover, dbe }) {
  const scale = Math.min(150 / b, 150 / h);
  const W = b * scale;
  const H = h * scale;
  const ox = 10;
  const oy = 10;
  const c = cover * scale;
  const st = dbe * scale;
  return `<svg viewBox="0 0 ${W + 170} ${H + 24}" style="width:100%; max-width:340px; margin-top:12px;" role="img" aria-label="Sección de la columna con la armadura">
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>
    <rect x="${ox + c + st / 2}" y="${oy + c + st / 2}" width="${W - 2 * c - st}" height="${H - 2 * c - st}" fill="none" stroke="var(--ink-soft)" stroke-width="${Math.max(1, st)}"/>
    ${bars.map((q) => `<circle cx="${ox + q.x * scale}" cy="${oy + q.y * scale}" r="${Math.max(2.5, db * scale / 2)}" fill="var(--ink)"/>`).join('')}
    <text x="${ox + W + 14}" y="${oy + 16}" font-size="11" fill="var(--ink)">${bars.length} ø${db}</text>
    <text x="${ox + W + 14}" y="${oy + 32}" font-size="10.5" fill="var(--ink-soft)">estribo ø${dbe}</text>
    <text x="${ox + W / 2}" y="${oy + H + 15}" font-size="10.5" fill="var(--ink-soft)" text-anchor="middle">${fmt(b / 10, 0)} × ${fmt(h / 10, 0)} cm</text></svg>`;
}

function interactionSVG(res, c) {
  const W = 420;
  const H = 260;
  const m = { l: 46, r: 12, t: 12, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const curve = (diag) => diag.design.filter((p) => p.phiP >= 0).map((p) => [p.phiM / 1e6, p.phiP / 1000]);
  const cx = curve(c.dx);
  const cy = curve(c.dy);
  const maxM = Math.max(...cx.map((p) => p[0]), ...cy.map((p) => p[0]), res.Mcx / 1e6, res.Mcy / 1e6, 1) * 1.08;
  const maxP = Math.max(c.dx.phiPnMax / 1000, res.Pu / 1000) * 1.08;
  const X = (v) => m.l + v / maxM * iw;
  const Y = (v) => m.t + ih - v / maxP * ih;
  const path = (pts) => pts.map((p) => `${fmt2(X(p[0]))},${fmt2(Y(p[1]))}`).join(' ');
  const ticks = (max, n) => Array.from({ length: n + 1 }, (_, i) => max / n * i);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:460px; margin-top:12px;" role="img" aria-label="Diagrama de interacción de diseño con las solicitaciones">
    ${ticks(maxP, 4).map((v) => `<line x1="${m.l}" y1="${Y(v)}" x2="${W - m.r}" y2="${Y(v)}" stroke="var(--line)" stroke-width="0.7"/><text x="${m.l - 5}" y="${Y(v) + 3}" font-size="9.5" text-anchor="end" fill="var(--ink-soft)">${Math.round(v)}</text>`).join('')}
    ${ticks(maxM, 4).map((v) => `<text x="${X(v)}" y="${H - m.b + 14}" font-size="9.5" text-anchor="middle" fill="var(--ink-soft)">${Math.round(v)}</text>`).join('')}
    <line x1="${m.l}" y1="${m.t + ih}" x2="${W - m.r}" y2="${m.t + ih}" stroke="var(--ink-soft)"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="var(--ink-soft)"/>
    <polyline points="${path(cx)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <polyline points="${path(cy)}" fill="none" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <circle cx="${X(res.Mcx / 1e6)}" cy="${Y(res.Pu / 1000)}" r="4.5" fill="var(--bad)"/>
    ${res.Mcy > 1e-6 ? `<circle cx="${X(res.Mcy / 1e6)}" cy="${Y(res.Pu / 1000)}" r="4.5" fill="none" stroke="var(--bad)" stroke-width="2"/>` : ''}
    <text x="${(m.l + W - m.r) / 2}" y="${H - 4}" font-size="10.5" text-anchor="middle" fill="var(--ink-soft)">φMn (kN·m)</text>
    <text x="11" y="${m.t + ih / 2}" font-size="10.5" fill="var(--ink-soft)" transform="rotate(-90 11 ${m.t + ih / 2})" text-anchor="middle">φPn (kN)</text>
    <text x="${W - m.r - 4}" y="${m.t + 12}" font-size="10" text-anchor="end" fill="var(--accent)">flexión en x</text>
    <text x="${W - m.r - 4}" y="${m.t + 25}" font-size="10" text-anchor="end" fill="var(--ink-soft)">flexión en y (rayas)</text></svg>`;
}
const fmt2 = (v) => Number(v).toFixed(1);
