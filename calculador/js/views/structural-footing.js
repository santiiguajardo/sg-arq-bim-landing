import { CIRSOC201 as N } from '../structural/norms.js';
import { designFooting, SOIL_UNIT_WEIGHTS, FOOTING_COVER } from '../structural/footing.js';
import { designFootingEcc, footingProfileFns, punchingStress } from '../structural/footing-ecc.js';
import { designFootingCombined, isolatedSeparation, MIN_CLEAR_BETWEEN_FOOTINGS } from '../structural/footing-comb.js';
import { footingFigures, combinedFootingFigures } from './structural-draw.js';
import { escapeHtml } from '../utils.js';
import { fmt, numField, selField, checksCard, failCard, memoRow } from './structural-ui.js';

const KGCM2_TO_MPA = 0.0980665;
const ART = {
  area: 'CIRSOC 201 art. 15.2.2 (área con cargas sin mayorar y tensión admisible del suelo)',
  areaEcc: 'CIRSOC 201 art. 15.2.2 (el área sale de las fuerzas y momentos sin mayorar transmitidos al suelo)',
  flexure: 'CIRSOC 201 art. 15.4.2.a) (sección crítica en la cara de la columna) y 10.2',
  dist: 'CIRSOC 201 art. 15.4.3 y 15.4.4, ec. (15-1)',
  shear: 'CIRSOC 201 art. 15.5, 11.12.1.1 y 11.3.1.1',
  punch: 'CIRSOC 201 art. 11.12.1.2 y 11.12.2.1, ec. (11-33) a (11-35)',
  punchEcc: 'CIRSOC 201 art. 11.12.1.2, 11.12.2.1 (αs = 30 borde, 20 esquina) y 11.12.6 (transferencia de momento por excentricidad de corte, γv de la ec. 13-1)',
  dev: 'CIRSOC 201 art. 12.2.1 y 12.2.2',
  depth: 'CIRSOC 201 art. 15.7',
  bearing: 'CIRSOC 201 art. 10.17.1 y 15.8.1.1',
  dowels: 'CIRSOC 201 art. 15.8.2.1',
  cover: 'CIRSOC 201 art. 7.7.1, Tabla 7.7.1 (a)',
  soilW: 'CIRSOC 101-2005, Tabla 3.2',
};
const TYPE_NAME = { isolated: 'Base aislada', edge: 'Base excéntrica (de medianera)', corner: 'Base doblemente excéntrica (de esquina)', combined: 'Base unificada (dos columnas)' };
const typeOf = (calc) => (['edge', 'corner', 'combined'].includes(calc.design.footType) ? calc.design.footType : 'isolated');

export const footingModule = {
  label: 'Base de hormigón armado',

  defaults(variant) {
    const common = { sigma: 2, soilId: 'arcilla-humeda', gamma: 17.3, Df: 1.5, ratio: 1, ax: 0, ay: 0, strap: true, ell: 500, ellY: 400, bs: 30, bsY: 30 };
    let design;
    if (variant === 'edge') design = { ...common, footType: 'edge', PD: 300, PL: 120, hc: 40, bc: 30 };
    else if (variant === 'corner') design = { ...common, footType: 'corner', PD: 200, PL: 80, hc: 40, bc: 40 };
    else if (variant === 'combined') design = { ...common, footType: 'combined', PD1: 450, PL1: 200, hc1: 40, bc1: 40, PD2: 600, PL2: 250, hc2: 40, bc2: 40, ell: 250, limit: 'no', ax1: 0, bFixed: 0 };
    else design = { ...common, footType: 'isolated', PD: 600, PL: 250, hc: 30, bc: 30 };
    return { design, section: {}, materials: { fc: 25 }, verification: {} };
  },

  input(calc) {
    const d = calc.design;
    const type = typeOf(calc);
    if (type === 'combined') {
      return { type: 'combined', PD1: d.PD1 * 1000, PL1: d.PL1 * 1000, PD2: d.PD2 * 1000, PL2: d.PL2 * 1000, hc1: d.hc1 * 10, bc1: d.bc1 * 10, hc2: d.hc2 * 10, bc2: d.bc2 * 10, ell: d.ell * 10,
        limit: d.limit === 'yes', ax1: (Number(d.ax1) || 0) * 10, bFixed: (Number(d.bFixed) || 0) * 10, fc: Number(calc.materials.fc), fy: 420, sigma: d.sigma * KGCM2_TO_MPA, gammaSoil: Number(d.gamma), Df: d.Df * 1000, placement: 'outdoor' };
    }
    const base = {
      PD: d.PD * 1000, PL: d.PL * 1000, bc: d.bc * 10, hc: d.hc * 10, fc: Number(calc.materials.fc), fy: 420,
      sigma: d.sigma * KGCM2_TO_MPA, gammaSoil: Number(d.gamma), Df: d.Df * 1000, ratio: Number(d.ratio),
    };
    if (type === 'isolated') return base;
    return {
      ...base, type, ax: (Number(d.ax) || 0) * 10, ay: (Number(d.ay) || 0) * 10,
      strap: type === 'corner' ? true : d.strap !== false && d.strap !== 'no', ell: (Number(d.ell) || 0) * 10, ellY: (Number(d.ellY) || 0) * 10,
      bs: (Number(d.bs) || 0) * 10, bsY: (Number(d.bsY) || 0) * 10, placement: 'outdoor',
    };
  },

  run(calc) {
    const input = this.input(calc);
    if (input.type === 'combined') {
      if (![input.PD1 + input.PL1, input.PD2 + input.PL2, input.hc1, input.bc1, input.hc2, input.bc2, input.ell, input.fc, input.sigma].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá las cargas, las columnas, la distancia entre ejes y la tensión del suelo con valores mayores que cero.' };
      try { return { res: { ...designFootingCombined(input), sep: isolatedSeparation(input) }, input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
    }
    if (![input.PD + input.PL, input.bc, input.hc, input.fc, input.sigma].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Completá las cargas, la columna y la tensión del suelo con valores mayores que cero.' };
    try { return { res: input.type ? designFootingEcc(input) : designFooting(input), input }; } catch (e) { return { error: 'No se pudo calcular con estos datos.' }; }
  },

  step1(calc) {
    const d = calc.design;
    const type = typeOf(calc);
    const soilOpts = [...SOIL_UNIT_WEIGHTS.map((s) => [s.id, `${s.label} — ${fmt(s.value, 1)} kN/m³`]), ['custom', 'Otro valor (lo ingreso yo)']];
    const typeSel = selField('design.footType', 'Tipo de base', type, Object.entries(TYPE_NAME));
    const loads = `
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.PD', 'Carga axial permanente D', d.PD, { unit: 'kN', hint: 'De servicio, con el peso propio de la columna.' })}
            ${numField('design.PL', 'Carga axial de sobrecarga L', d.PL, { unit: 'kN', hint: 'De servicio.' })}
          </div>`;
    let colCard;
    if (type === 'combined') {
      const col = (n) => `<div class="field-row" style="flex-wrap:wrap;">
            ${numField(`design.PD${n}`, `Columna ${n}: permanente D`, d[`PD${n}`], { unit: 'kN', hint: n === 1 ? 'De servicio, con el peso propio de la columna.' : '' })}${numField(`design.PL${n}`, `Columna ${n}: sobrecarga L`, d[`PL${n}`], { unit: 'kN' })}
            ${numField(`design.hc${n}`, `Columna ${n}: lado en el sentido de la unión`, d[`hc${n}`], { unit: 'cm' })}${numField(`design.bc${n}`, `Columna ${n}: lado transversal`, d[`bc${n}`], { unit: 'cm' })}
          </div>`;
      colCard = `<div class="card">
          <h3 style="margin-top:0;">Columnas que se unifican</h3>
          ${typeSel}${col(1)}${col(2)}
          ${numField('design.ell', 'Distancia entre ejes de las columnas ℓ', d.ell, { unit: 'cm' })}
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.limit', 'Columna 1', d.limit === 'yes' ? 'yes' : 'no', [['no', 'Con espacio a ambos lados (voladizos libres)'], ['yes', 'Junto al límite de la propiedad']])}
            ${d.limit === 'yes' ? numField('design.ax1', 'Distancia de la cara de la columna 1 al límite', d.ax1, { unit: 'cm', hint: '0 = al ras.' }) : ''}
          </div>
          ${numField('design.bFixed', 'Ancho de la base b (0 = automático)', d.bFixed, { unit: 'cm', hint: 'Se puede fijar para que los voladizos de la placa no pasen de 1 m (apunte).' })}
          <p class="text-muted" style="font-size:12px; margin:4px 0 0;">Se usa cuando la distancia libre entre las dos zapatas aisladas es menor que ${MIN_CLEAR_BETWEEN_FOOTINGS / 10} cm. La resultante de las cargas coincide con el baricentro de la base.</p>
        </div>`;
    } else if (type === 'isolated') {
      colCard = `<div class="card">
          <h3 style="margin-top:0;">Carga y columna</h3>
          ${typeSel}${loads}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.bc', 'Columna: lado en el sentido B', d.bc, { unit: 'cm' })}
            ${numField('design.hc', 'Columna: lado en el sentido L', d.hc, { unit: 'cm' })}
          </div>
          <p class="text-muted" style="font-size:12px; margin:4px 0 0;">Base centrada con carga axial. Los momentos de columna no se transmiten a esta base.</p>
        </div>`;
    } else {
      const corner = type === 'corner';
      colCard = `<div class="card">
          <h3 style="margin-top:0;">Carga, columna y límite</h3>
          ${typeSel}${loads}
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.hc', 'Columna: lado perpendicular al límite (x)', d.hc, { unit: 'cm' })}
            ${numField('design.bc', 'Columna: lado paralelo al límite (y)', d.bc, { unit: 'cm' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.ax', corner ? 'Distancia de la cara al límite en x' : 'Distancia de la cara de la columna al límite', d.ax, { unit: 'cm', hint: '0 = la columna está al ras del límite.' })}
            ${corner ? numField('design.ay', 'Distancia de la cara al límite en y', d.ay, { unit: 'cm', hint: '0 = al ras.' }) : ''}
          </div>
          ${corner ? '' : selField('design.strap', 'Cómo se equilibra la excentricidad', d.strap === false || d.strap === 'no' ? 'no' : 'yes', [['yes', 'Con viga de equilibrio (presión uniforme)'], ['no', 'Sin viga: el suelo equilibra el momento']])}
          ${(corner || !(d.strap === false || d.strap === 'no')) ? `<div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.ell', corner ? 'Distancia entre ejes de columnas (viga en x)' : 'Distancia al eje de la columna vecina', d.ell, { unit: 'cm', hint: 'Entre el eje de esta columna y el de la columna a la que se une la viga.' })}
            ${numField('design.bs', corner ? 'Ancho de la viga en x' : 'Ancho de la viga de equilibrio', d.bs, { unit: 'cm' })}
          </div>` : ''}
          ${corner ? `<div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.ellY', 'Distancia entre ejes de columnas (viga en y)', d.ellY, { unit: 'cm' })}
            ${numField('design.bsY', 'Ancho de la viga en y', d.bsY, { unit: 'cm' })}
          </div>` : ''}
          ${eccSketch(d, type)}
        </div>`;
    }
    return `
      <div class="grid grid-2" style="align-items:start;">
        ${colCard}
        <div class="card">
          <h3 style="margin-top:0;">Suelo</h3>
          <div class="field-row" style="flex-wrap:wrap;">
            ${numField('design.sigma', 'Tensión admisible del suelo', d.sigma, { unit: 'kg/cm²', hint: 'Del estudio de suelos. 1 kg/cm² = 98 kPa.' })}
            ${numField('design.Df', 'Profundidad de fundación Df', d.Df, { unit: 'm', hint: 'Desde el nivel del terreno hasta la base de la zapata.' })}
          </div>
          <div class="field-row" style="flex-wrap:wrap;">
            ${selField('design.soilId', 'Suelo sobre la zapata', d.soilId, soilOpts, ART.soilW)}
            ${numField('design.gamma', 'Peso unitario del suelo', d.gamma, { unit: 'kN/m³' })}
          </div>
          ${type === 'isolated' ? selField('design.ratio', 'Forma de la base', d.ratio, [[1, 'Cuadrada (L = B)'], [1.25, 'Rectangular L = 1,25 B'], [1.5, 'Rectangular L = 1,5 B'], [2, 'Rectangular L = 2 B']]) : '<p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">Las dimensiones en planta se buscan solas (hasta una relación 4:1) buscando la menor área que verifica.</p>'}
        </div>
      </div>`;
  },

  step2(calc) {
    const type = typeOf(calc);
    const input = this.input(calc);
    const h = 400;
    const Ps = type === 'combined' ? input.PD1 + input.PL1 + input.PD2 + input.PL2 : input.PD + input.PL;
    const qNet = input.sigma - (N.gammaRC * h / 1e6 + input.gammaSoil * Math.max(0, input.Df - h) / 1e6);
    const Areq = qNet > 0 ? Ps / qNet : NaN;
    const method = type === 'isolated' ? '' : type === 'combined' ? combMethod() : `<div class="card" style="margin-top:16px;">
      <h3 style="margin-top:0;">Cómo se calcula ${type === 'edge' ? 'la base de medianera' : 'la base de esquina'}</h3>
      <ul class="text-muted" style="font-size:12.5px; margin:0; padding-left:18px; line-height:1.55;">
        <li>La columna está más cerca del límite que el baricentro de la base: la excentricidad e genera un momento P·e. ${ART.areaEcc}.</li>
        ${type === 'edge' ? `<li><b>Sin viga</b>: el suelo equilibra el momento con una presión lineal (trapecio) y, si la resultante cae fuera del tercio central, con contacto parcial (triángulo). Con cargas medianas resulta una base muy alargada a lo largo del límite.</li>` : ''}
        <li><b>Con viga de equilibrio</b>: la viga une la base con la columna vecina y toma el momento. La reacción del suelo es R = P·ℓ/(ℓ − e), con ℓ la distancia entre ejes de columnas, y la presión queda uniforme. La viga se dimensiona con Mu = Pu·e y Vu = Pu. La columna vecina se alivia en R − P.${type === 'corner' ? ' La base de esquina siempre lleva dos vigas (una por dirección): sin ellas la resultante no puede quedar dentro del núcleo central. Las reacciones de las dos vigas se superponen (aproximación habitual).' : ''}</li>
        <li>Flexión en las caras de la columna (art. 15.4.2.a) con la presión mayorada de la carga de la columna; corte como viga a d de la cara; punzonado con perímetro abierto sobre los bordes libres (αs = ${type === 'edge' ? '30' : '20'}) y, sin viga, con transferencia de momento por excentricidad de corte (art. 11.12.6). Con viga el momento lo toma la viga y se verifica el corte del perímetro.</li>
        <li>El anclaje de las barras hacia el límite se verifica en el tramo bajo la columna (art. 15.6.2): si no alcanza, se usan barras de menor diámetro o hace falta una columna más ancha.</li>
      </ul></div>`;
    return `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <h3 style="margin-top:0;">Material</h3>
          ${selField('materials.fc', "Hormigón (f'c)", calc.materials.fc, N.concreteClasses.map((c) => [c, `H-${c} (${c} MPa)`]))}
          <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">Acero ADN 420. Recubrimiento ${FOOTING_COVER} mm sobre hormigón de limpieza (${ART.cover}).</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0;">Área necesaria</h3>
          <table class="data-table"><tbody>
            <tr><td>Carga de servicio D + L</td><td style="text-align:right;">${fmt(Ps / 1000, 0)} kN</td></tr>
            <tr><td>Tensión admisible</td><td style="text-align:right;">${fmt(input.sigma * 1000, 0)} kPa</td></tr>
            <tr><td>Tensión neta (descontando peso de base y suelo, h supuesta ${fmt(h / 10, 0)} cm)</td><td style="text-align:right;">${qNet > 0 ? `${fmt(qNet * 1000, 0)} kPa` : '—'}</td></tr>
            <tr><td><b>Área mínima</b> con carga centrada (${ART.area})</td><td style="text-align:right;"><b>${Number.isFinite(Areq) ? `${fmt(Areq, 2)} m²` : '—'}</b></td></tr>
            <tr><td>Altura mínima sobre la armadura inferior (${ART.depth})</td><td style="text-align:right;">150 mm</td></tr>
          </tbody></table>
          <p class="text-muted" style="font-size:12px; margin:10px 0 0;">${type === 'isolated' ? 'En el paso 3 se elige la menor altura que verifica flexión, corte, punzonado y anclaje.' : type === 'combined' ? 'Es el área de las dos columnas juntas; en el paso 3 se busca la planta (a × b) con la resultante en el baricentro y la altura de la franja.' : 'Con excentricidad hace falta más área que ésta. En el paso 3 se busca la menor planta y altura que verifican.'}</p>
        </div>
      </div>${method}`;
  },

  step3(calc, out) {
    const inputs = `<div class="card"><h3 style="margin-top:0;">Datos de dimensionado</h3>
      ${selField('materials.fc', "Hormigón (f'c)", calc.materials.fc, N.concreteClasses.map((c) => [c, `H-${c}`]))}
      <p class="text-muted" style="font-size:12.5px; margin:6px 0 0;">Los demás datos están en los pasos 1 y 2.</p></div>`;
    if (out.error) return `<div class="grid grid-2" style="align-items:start;">${inputs}<div class="card"><div class="empty-state">${out.error}</div></div></div>`;
    return `<div class="grid grid-2" style="align-items:start;">${inputs}<div>${out.input.type === 'combined' ? resultsComb(calc, out) : out.input.type ? this.resultsEcc(calc, out) : this.results(calc, out)}</div></div>`;
  },

  results(calc, out) {
    const { res, input } = out;
    if (!res.ok) return failCard(res.reason);
    const b = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Base calculada</h3>
      <table class="data-table"><tbody>
        <tr><td><b>Dimensiones</b> B × L × h</td><td style="text-align:right;"><b>${fmt(res.B / 10, 0)} × ${fmt(res.L / 10, 0)} × ${fmt(res.h / 10, 0)} cm</b></td></tr>
        <tr><td>Carga de servicio · Pu = 1,2 D + 1,6 L</td><td style="text-align:right;">${fmt(res.Ps / 1000, 0)} kN · ${fmt(res.Pu / 1000, 0)} kN</td></tr>
        <tr><td>Tensión neta mayorada qu</td><td style="text-align:right;">${fmt(res.qu * 1000, 0)} kPa</td></tr>
        <tr><td>Armadura paralela a L (${ART.flexure})</td><td style="text-align:right;"><b>${res.layL.n} ø${res.db}</b> (c/${fmt(res.layL.s / 10, 1)} cm) en el ancho B</td></tr>
        <tr><td>Armadura paralela a B (${ART.dist})</td><td style="text-align:right;"><b>${res.layB.n} ø${res.db}</b> en la faja central de ancho B${res.outsideBars ? ` + <b>${res.outsideBars} ø${res.db}</b> fuera de ella` : ''}</td></tr>
        <tr><td>Hormigón · acero aproximado</td><td style="text-align:right;">${fmt(res.concrete, 2)} m³ · ${fmt(res.steelKg, 0)} kg</td></tr>
        <tr><td>Armadura de espera mínima en la columna (${ART.dowels})</td><td style="text-align:right;">${fmt(res.dowels / 100, 1)} cm²</td></tr>
      </tbody></table>
      ${footingSVG(res, input)}
    </div>`;
    return `${figCard(res, input, 'screen')}${b}${checksCard(res)}`;
  },

  resultsEcc(calc, out) {
    const { res, input } = out;
    if (!res.ok) return failCard(res.reason);
    const warns = [];
    if (res.partial) warns.push('Contacto parcial con el suelo: la resultante cae fuera del tercio central y parte de la base no trabaja.');
    if (!res.strapMode && Math.max(res.L, res.B) / Math.min(res.L, res.B) >= 3) warns.push('Sin viga de equilibrio la planta resulta muy alargada: conviene una viga.');
    const dR = res.strapMode ? (res.kStrap - 1) * res.Ps : 0;
    const qAvg = res.Pq / (res.L * res.B);
    const qU = res.partial ? { max: 2 * res.Pq / (res.B * 3 * Math.min(res.xc, res.L - res.xc)), min: 0 } : { max: qAvg * (1 + 6 * res.eAbs / res.L), min: Math.max(0, qAvg * (1 - 6 * res.eAbs / res.L)) };
    const b = `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">${TYPE_NAME[res.type]} calculada</h3>
      <table class="data-table"><tbody>
        <tr><td><b>Dimensiones</b> L (⊥ al límite) × B (∥ al límite) × h</td><td style="text-align:right;"><b>${fmt(res.L / 10, 0)} × ${fmt(res.B / 10, 0)} × ${fmt(res.h / 10, 0)} cm</b></td></tr>
        <tr><td>Carga de servicio · Pu = 1,2 D + 1,6 L</td><td style="text-align:right;">${fmt(res.Ps / 1000, 0)} kN · ${fmt(res.Pu / 1000, 0)} kN</td></tr>
        <tr><td>${res.type === 'corner' ? 'Excentricidades (x, y)' : 'Excentricidad'}</td><td style="text-align:right;">${fmt(res.eAbs / 10, 0)} cm${res.type === 'corner' ? ` · ${fmt(res.eyAbs / 10, 0)} cm` : ''}</td></tr>
        ${res.strapMode ? `<tr><td>Reacción del suelo R = P (1 + Σ e/(ℓ − e)) · alivio de la columna vecina</td><td style="text-align:right;">${fmt(res.Ps * res.kStrap / 1000, 0)} kN · ${fmt(dR / 1000, 0)} kN</td></tr>` : ''}
        <tr><td>Presión mayorada de cálculo en la base${res.strapMode ? ' (uniforme)' : ' (máx. / mín.)'}</td><td style="text-align:right;">${res.strapMode ? `${fmt(res.Pq / (res.L * res.B) * 1000, 0)} kPa` : `${fmt(qU.max * 1000, 0)} / ${fmt(qU.min * 1000, 0)} kPa`}</td></tr>
        <tr><td>Armadura paralela a x (${ART.flexure})</td><td style="text-align:right;"><b>${barsTxt(res, 'x')}</b></td></tr>
        <tr><td>Armadura paralela a y (${ART.dist})</td><td style="text-align:right;"><b>${barsTxt(res, 'y')}</b></td></tr>
        <tr><td>Hormigón · acero aproximado (sin vigas)</td><td style="text-align:right;">${fmt(res.concrete, 2)} m³ · ${fmt(res.steelKg, 0)} kg</td></tr>
        <tr><td>Armadura de espera mínima en la columna (${ART.dowels})</td><td style="text-align:right;">${fmt(res.dowels / 100, 1)} cm²</td></tr>
      </tbody></table>
      ${warns.map((w) => `<p style="margin:8px 0 0;"><span class="tag tag-media">Atención</span> <span class="text-muted" style="font-size:12.5px;">${escapeHtml(w)}</span></p>`).join('')}
      ${footingEccSVG(res, input)}
    </div>`;
    const straps = (res.straps || []).map((s) => `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Viga de equilibrio${res.type === 'corner' ? ` en ${s.dir}` : ''}</h3>
      ${s.ok ? `<table class="data-table"><tbody>
        <tr><td>Sección b × h</td><td style="text-align:right;"><b>${fmt(s.b / 10, 0)} × ${fmt(s.h / 10, 0)} cm</b></td></tr>
        <tr><td>Mu = Pu·e (tracción arriba, junto a la base) · Vu = Pu</td><td style="text-align:right;">${fmt(s.Mu / 1e6, 0)} kN·m · ${fmt(s.Vu / 1000, 0)} kN</td></tr>
        <tr><td>Armadura superior</td><td style="text-align:right;"><b>${s.bars.n} ø${s.bars.db}</b>${s.bars.layers === 2 ? ' (2 capas)' : ''} (As = ${fmt(s.bars.As, 0)} mm²)</td></tr>
        <tr><td>Estribos</td><td style="text-align:right;">${s.shear.stirrups ? `ø${s.dStirrup} c/${fmt(s.shear.s / 10, 0)} cm` : 'mínimos'}</td></tr>
      </tbody></table>
      <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">El momento decrece linealmente hasta cero en la columna vecina y el corte pasa de Pu a R − P. Armadura inferior mínima y estribos a lo largo de la viga; peso propio no considerado. Dimensionada con las fórmulas de la viga (art. 10 y 11) con recubrimiento en contacto con el suelo.</p>` : `<p><span class="tag tag-alta">No verifica</span> ${escapeHtml(s.reason || '')}</p>`}
    </div>`).join('');
    return `${figCard(res, input, 'screen')}${b}${straps}${checksCard(res)}`;
  },

  memoria(calc, out) {
    const { res, input } = out;
    if (!res.ok) return null;
    if (input.type === 'combined') return memoriaComb(calc, out);
    if (input.type) return memoriaEcc(calc, out);
    return {
      title: calc.name,
      sub: `Base aislada · ${fmt(res.B / 10, 0)} × ${fmt(res.L / 10, 0)} × ${fmt(res.h / 10, 0)} cm`,
      html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Cargas D / L (servicio)', `${fmt(input.PD / 1000, 0)} / ${fmt(input.PL / 1000, 0)} kN`)}${memoRow('Columna', `${fmt(input.bc / 10, 0)} × ${fmt(input.hc / 10, 0)} cm`)}
        ${memoRow('Tensión admisible', `${fmt(calc.design.sigma, 2)} kg/cm² (${fmt(input.sigma * 1000, 0)} kPa)`)}${memoRow('Profundidad / peso del suelo', `${fmt(calc.design.Df, 2)} m / ${fmt(input.gammaSoil, 1)} kN/m³`, ART.soilW)}
        ${memoRow('Hormigón / acero', `H-${input.fc} / ADN 420`)}</table>
      ${figHtml(res, input, 'print')}
      <h2>2. Dimensiones</h2>
      <table>${memoRow('B × L × h', `${fmt(res.B / 10, 0)} × ${fmt(res.L / 10, 0)} × ${fmt(res.h / 10, 0)} cm`, ART.area)}${memoRow('Peso de la base · del suelo', `${fmt(res.wSelf / 1000, 1)} kN · ${fmt(res.wSoil / 1000, 1)} kN`)}${memoRow('qu = Pu / (B L)', `${fmt(res.qu * 1000, 0)} kPa`)}</table>
      <h2>3. Flexión</h2>
      <table>${memoRow('Mu dirección L (cara de la columna)', `${fmt(res.MuL / 1e6, 1)} kN·m`, ART.flexure)}${memoRow('Mu dirección B', `${fmt(res.MuB / 1e6, 1)} kN·m`)}
        ${memoRow('Armadura paralela a L', `${res.layL.n} ø${res.db} (As = ${fmt(res.AsL, 0)} mm²)`)}${memoRow('Armadura paralela a B', `${res.layB.n} ø${res.db} en faja central (γs = ${fmt(res.gammaS, 3)})${res.outsideBars ? ` + ${res.outsideBars} ø${res.db} fuera` : ''}`, ART.dist)}</table>
      <h2>4. Corte y punzonado</h2>
      <table>${memoRow('Corte como viga: Vu / φVc', `${fmt(Math.max(res.VuL, res.VuB) / 1000, 0)} / ${fmt(Math.min(res.phiVcL, res.phiVcB) / 1000, 0)} kN`, ART.shear)}
        ${memoRow('Punzonado: Vu / φVc (bo = ' + fmt(res.bo, 0) + ' mm)', `${fmt(res.VuP / 1000, 0)} / ${fmt(res.phiVcP / 1000, 0)} kN`, ART.punch)}</table>
      <h2>5. Anclaje y apoyo</h2>
      <table>${memoRow('Longitud de anclaje ℓd / disponible', `${fmt(Math.max(res.ldL, res.ldB), 0)} / ${fmt(Math.min(res.availL, res.availB), 0)} mm`, ART.dev)}${memoRow('Aplastamiento φPnb', `${fmt(res.bearing / 1000, 0)} kN`, ART.bearing)}</table>
      <h2>6. Verificaciones</h2>
      <table>${res.checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, k.text)).join('')}</table>`,
    };
  },
};

// Datos para los esquemas de la base (mm, N): presión mayorada, caras de la columna, d de corte y perímetro de punzonado.
function footingFp(res, input) {
  if (input.type) {
    const pr = footingProfileFns(res);
    return { L: res.L, B: res.B, h: res.h, hc: input.hc, bc: input.bc, xc: res.xc, yc: res.yc, qx: pr.qx, qy: pr.qy, partial: pr.partial, Pu: res.Pu,
      dR: res.strapMode ? res.Pq - res.Pu : 0, d: res.h - FOOTING_COVER - 1.5 * res.db, MuX: res.MuX, MuY: res.MuY, VuX: res.VuX, VuY: res.VuY,
      x2: res.xc + input.hc / 2, type: res.type, ps: res.ps };
  }
  const xc = res.L / 2;
  const yc = res.B / 2;
  const ps = punchingStress({ L: res.L, B: res.B, xc, yc, hc: input.hc, bc: input.bc, d: res.dB, Vu: 0, Mx: 0, My: 0 });
  return { L: res.L, B: res.B, h: res.h, hc: input.hc, bc: input.bc, xc, yc, qx: () => res.qu, qy: () => res.qu, Pu: res.Pu, d: res.dB,
    MuX: res.MuL, MuY: res.MuB, VuX: res.VuL, VuY: res.VuB, x2: xc + input.hc / 2, ps };
}
function figHtml(res, input, pal) {
  const f = footingFigures(footingFp(res, input), pal);
  return f.secX + f.secY + f.plan;
}
function figCard(res, input, pal) {
  const f = footingFigures(footingFp(res, input), pal);
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${f.secX}${f.secY}${f.plan}
    <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">La presión del suelo (mayorada, sin el peso de la base) carga la base hacia arriba y la columna hacia abajo. Se adopta Mu en la cara de la columna para dimensionar la armadura (art. 15.4.2), Vu a d de la cara para el corte como viga y el perímetro a d/2 para el punzonado.</p></div>`;
}

// Texto de las barras de una dirección de la base excéntrica (la larga se reparte en todo el ancho; la corta, en la faja central + resto).
function barsTxt(res, dir) {
  const lay = dir === 'x' ? res.layX : res.layY;
  const long = dir === 'x' ? res.longIsX : !res.longIsX;
  if (long) return `${lay.n} ø${res.db} (c/${fmt(lay.s / 10, 1)} cm) en todo el ancho`;
  return `${lay.n} ø${res.db} en la faja central de ancho ${fmt(Math.min(res.L, res.B) / 10, 0)} cm${res.outsideBars ? ` + ${res.outsideBars} ø${res.db} fuera de ella` : ''}`;
}

function memoriaEcc(calc, out) {
  const { res, input } = out;
  const straps = (res.straps || []).map((s) => memoRow(`Viga de equilibrio${res.type === 'corner' ? ` en ${s.dir}` : ''}`, s.ok ? `${fmt(s.b / 10, 0)} × ${fmt(s.h / 10, 0)} cm · ${s.bars.n} ø${s.bars.db} arriba · estribos ${s.shear.stirrups ? `ø${s.dStirrup} c/${fmt(s.shear.s / 10, 0)} cm` : 'mínimos'}` : 'no verifica', 'Mu = Pu e, Vu = Pu (arts. 10 y 11)')).join('');
  return {
    title: calc.name,
    sub: `${TYPE_NAME[res.type]} · ${fmt(res.L / 10, 0)} × ${fmt(res.B / 10, 0)} × ${fmt(res.h / 10, 0)} cm`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Cargas D / L (servicio)', `${fmt(input.PD / 1000, 0)} / ${fmt(input.PL / 1000, 0)} kN`)}${memoRow('Columna (⊥ × ∥ al límite)', `${fmt(input.hc / 10, 0)} × ${fmt(input.bc / 10, 0)} cm`)}
        ${memoRow('Distancia de la cara al límite', `${fmt(input.ax / 10, 0)} cm${res.type === 'corner' ? ` · ${fmt(input.ay / 10, 0)} cm` : ''}`)}
        ${memoRow('Tensión admisible', `${fmt(calc.design.sigma, 2)} kg/cm² (${fmt(input.sigma * 1000, 0)} kPa)`)}${memoRow('Profundidad / peso del suelo', `${fmt(calc.design.Df, 2)} m / ${fmt(input.gammaSoil, 1)} kN/m³`, ART.soilW)}
        ${memoRow('Hormigón / acero', `H-${input.fc} / ADN 420`)}</table>
      ${figHtml(res, input, 'print')}
      <h2>2. Excentricidad y presión del suelo</h2>
      <table>${memoRow('L × B × h', `${fmt(res.L / 10, 0)} × ${fmt(res.B / 10, 0)} × ${fmt(res.h / 10, 0)} cm`, ART.areaEcc)}
        ${memoRow('Excentricidad', `${fmt(res.eAbs / 10, 0)} cm${res.type === 'corner' ? ` · ${fmt(res.eyAbs / 10, 0)} cm` : ''}`)}
        ${res.strapMode ? memoRow('Solución de la excentricidad', 'viga(s) de equilibrio: R = P (1 + Σ e/(ℓ − e)), presión uniforme') : memoRow('Solución de la excentricidad', 'el suelo equilibra el momento P·e (presión lineal)')}
        ${memoRow('Presión de servicio máx. / mín.', `${fmt(res.qmax * 1000, 0)} / ${fmt(Math.max(0, res.qmin) * 1000, 0)} kPa`)}${straps}</table>
      <h2>3. Flexión</h2>
      <table>${memoRow('Mu paralelo a x (cara de la columna)', `${fmt(res.MuX / 1e6, 1)} kN·m`, ART.flexure)}${memoRow('Mu paralelo a y', `${fmt(res.MuY / 1e6, 1)} kN·m`)}
        ${memoRow('Armadura paralela a x', barsTxt(res, 'x'))}${memoRow('Armadura paralela a y', barsTxt(res, 'y'), ART.dist)}</table>
      <h2>4. Corte y punzonado</h2>
      <table>${memoRow('Corte como viga: Vu / φVc', `${fmt(Math.max(res.VuX, res.VuY) / 1000, 0)} / ${fmt(Math.min(res.phiVcX, res.phiVcY) / 1000, 0)} kN`, ART.shear)}
        ${memoRow(`Punzonado (${res.ps.sides} lados, bo = ${fmt(res.ps.bo, 0)} mm): vu / φvc`, `${fmt(res.ps.vmax, 2)} / ${fmt(res.phiVcP, 2)} MPa`, ART.punchEcc)}</table>
      <h2>5. Anclaje y apoyo</h2>
      <table>${memoRow('Anclaje: ℓ necesaria', `${fmt(Math.max(res.ldX, res.ldY), 0)} mm${res.hooks ? ' (con gancho a 90°)' : ''}`, ART.dev)}${memoRow('Aplastamiento φPnb', `${fmt(res.bearing / 1000, 0)} kN`, ART.bearing)}</table>
      <h2>6. Verificaciones</h2>
      <table>${res.checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, k.text)).join('')}</table>`,
  };
}

// ---------------------------------------------------------------- gráficos
function eccSketch(d, type) {
  const W = 300;
  const H = 150;
  const corner = type === 'corner';
  const strap = corner || !(d.strap === false || d.strap === 'no');
  const fx = 70;
  const fy = corner ? 40 : 34;
  const fw = 80;
  const fh = corner ? 70 : 90;
  const colW = 18;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:340px; margin-top:8px;" role="img" aria-label="Croquis de la base respecto del límite">
    <line x1="${fx - 6}" y1="10" x2="${fx - 6}" y2="${H - 6}" stroke="var(--bad)" stroke-width="2.5"/>
    ${corner ? `<line x1="${fx - 6}" y1="${fy - 6}" x2="${W - 10}" y2="${fy - 6}" stroke="var(--bad)" stroke-width="2.5"/>` : ''}
    <text x="${fx - 10}" y="${H - 10}" text-anchor="end" font-size="10" fill="var(--bad)">límite</text>
    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>
    <rect x="${fx + 2}" y="${corner ? fy + 2 : fy + fh / 2 - colW / 2}" width="${colW}" height="${colW}" fill="var(--ink)"/>
    <circle cx="${fx + fw / 2}" cy="${fy + fh / 2}" r="3" fill="var(--accent)"/>
    <text x="${fx + fw / 2}" y="${fy + fh + 14}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">● baricentro de la base</text>
    ${strap ? `<rect x="${fx + fw}" y="${corner ? fy + 2 : fy + fh / 2 - 5}" width="${W - fx - fw - 90}" height="10" fill="none" stroke="var(--ink-soft)" stroke-dasharray="4 2"/><text x="${fx + fw + 2}" y="${(corner ? fy + 2 : fy + fh / 2 - 5) - 4}" font-size="9.5" fill="var(--ink-soft)">viga de equilibrio</text>` : ''}
    ${strap && corner ? `<rect x="${fx + 2}" y="${fy + fh}" width="10" height="26" fill="none" stroke="var(--ink-soft)" stroke-dasharray="4 2"/>` : ''}
  </svg>`;
}

function footingEccSVG(res, input) {
  const maxDim = Math.max(res.L, res.B);
  const s = 200 / maxDim;
  const W = res.L * s;
  const H = res.B * s;
  const ox = 30;
  const oy = 12;
  const cw = input.hc * s;
  const ch = input.bc * s;
  const cov = FOOTING_COVER * s;
  const xc = res.xc * s;
  const yc = res.yc * s;
  const nX = Math.min(res.layX.n, 40);
  const nY = Math.min(res.layY.n, 40);
  const linesX = Array.from({ length: nX }, (_, i) => oy + cov + i * (H - 2 * cov) / Math.max(1, nX - 1));
  const linesY = Array.from({ length: nY }, (_, i) => ox + cov + i * (W - 2 * cov) / Math.max(1, nY - 1));
  const cornerLine = input.type === 'corner' ? `<line x1="${ox}" y1="${oy}" x2="${ox + W}" y2="${oy}" stroke="var(--bad)" stroke-width="3"/>` : '';
  return `<svg viewBox="0 0 ${W + 150} ${H + 40}" style="width:100%; max-width:420px; margin-top:12px;" role="img" aria-label="Planta de la base con la columna, el límite y la armadura">
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>
    ${linesX.map((y) => `<line x1="${ox + cov}" y1="${y}" x2="${ox + W - cov}" y2="${y}" stroke="var(--accent)" stroke-width="1"/>`).join('')}
    ${linesY.map((x) => `<line x1="${x}" y1="${oy + cov}" x2="${x}" y2="${oy + H - cov}" stroke="var(--ink-soft)" stroke-width="1"/>`).join('')}
    <rect x="${ox + xc - cw / 2}" y="${oy + yc - ch / 2}" width="${cw}" height="${ch}" fill="var(--ink)" fill-opacity="0.85"/>
    <circle cx="${ox + W / 2}" cy="${oy + H / 2}" r="3.5" fill="none" stroke="var(--bad)" stroke-width="1.5"/>
    <line x1="${ox}" y1="${oy - 2}" x2="${ox}" y2="${oy + H + 2}" stroke="var(--bad)" stroke-width="3"/>${cornerLine}
    <text x="${ox + W / 2}" y="${oy + H + 15}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">L = ${fmt(res.L / 10, 0)} cm (⊥ al límite)</text>
    <text x="${ox + W + 8}" y="${oy + H / 2}" font-size="10.5" fill="var(--ink-soft)">B = ${fmt(res.B / 10, 0)} cm</text>
    <text x="${ox + W + 8}" y="${oy + 14}" font-size="10" fill="var(--accent)">barras ∥ x</text>
    <text x="${ox + W + 8}" y="${oy + 27}" font-size="10" fill="var(--ink-soft)">barras ∥ y</text>
    <text x="${ox + W + 8}" y="${oy + 42}" font-size="10" fill="var(--bad)">○ baricentro · ■ columna</text></svg>`;
}

function footingSVG(res, input) {
  const maxDim = Math.max(res.B, res.L);
  const s = 200 / maxDim;
  const W = res.L * s;
  const H = res.B * s;
  const ox = 14;
  const oy = 12;
  const cw = input.hc * s;
  const ch = input.bc * s;
  const cov = FOOTING_COVER * s;
  const nL = Math.min(res.layL.n, 40);
  const nB = Math.min(res.layB.n, 40);
  const linesL = Array.from({ length: nL }, (_, i) => oy + cov + i * (H - 2 * cov) / Math.max(1, nL - 1));
  const linesB = Array.from({ length: nB }, (_, i) => ox + W / 2 - H / 2 + cov + i * (H - 2 * cov) / Math.max(1, nB - 1));
  return `<svg viewBox="0 0 ${W + 120} ${H + 36}" style="width:100%; max-width:380px; margin-top:12px;" role="img" aria-label="Planta de la base con la armadura">
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="var(--line-soft)" stroke="var(--ink)" stroke-width="1.5"/>
    ${linesL.map((y) => `<line x1="${ox + cov}" y1="${y}" x2="${ox + W - cov}" y2="${y}" stroke="var(--accent)" stroke-width="1"/>`).join('')}
    ${linesB.map((x) => `<line x1="${x}" y1="${oy + cov}" x2="${x}" y2="${oy + H - cov}" stroke="var(--ink-soft)" stroke-width="1"/>`).join('')}
    <rect x="${ox + (W - cw) / 2}" y="${oy + (H - ch) / 2}" width="${cw}" height="${ch}" fill="var(--ink)" fill-opacity="0.85"/>
    <text x="${ox + W / 2}" y="${oy + H + 15}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">L = ${fmt(res.L / 10, 0)} cm</text>
    <text x="${ox + W + 8}" y="${oy + H / 2}" font-size="10.5" fill="var(--ink-soft)">B = ${fmt(res.B / 10, 0)} cm</text>
    <text x="${ox + W + 8}" y="${oy + 14}" font-size="10" fill="var(--accent)">barras ∥ L</text>
    <text x="${ox + W + 8}" y="${oy + 27}" font-size="10" fill="var(--ink-soft)">barras ∥ B</text></svg>`;
}

// ---------------------------------------------------------------- base unificada
function combMethod() {
  return `<div class="card" style="margin-top:16px;">
    <h3 style="margin-top:0;">Cómo se calcula la base unificada</h3>
    <ul class="text-muted" style="font-size:12.5px; margin:0; padding-left:18px; line-height:1.55;">
      <li>Cuando la distancia libre entre dos zapatas aisladas es menor que ${MIN_CLEAR_BETWEEN_FOOTINGS / 10} cm (los bulbos de presiones se superponen) se unifican en una base rectangular. Su baricentro coincide con la resultante de las cargas de servicio, xR = P₂ ℓ / (P₁ + P₂), para que la presión del suelo sea uniforme. ${ART.area}.</li>
      <li>Con la columna 1 junto al límite la longitud queda fijada, a = 2 (xR + u); si no, se adopta la menor que cubre las dos columnas con voladizos libres. El ancho b sale del área necesaria.</li>
      <li><b>Dirección longitudinal</b>: la base trabaja como una viga T invertida de alma bo = ancho de columna + 10 cm. En el tramo entre columnas la tracción está arriba y el ala (la base) comprime abajo; en las columnas y los voladizos la tracción está abajo. Se calcula con las cargas mayoradas y la presión del suelo (art. 9.2 y 15). Altura de la franja h ≥ ℓ/5 (criterio constructivo, "por rigidez").</li>
      <li><b>Dirección transversal</b>: las alas son voladizos de 1 m de ancho empotrados en el alma, cargados por la presión del suelo. Se verifica también el corte de la franja a d de las caras (art. 15.5 y 11.3) y el punzonado de cada columna.</li>
    </ul></div>`;
}

function combFp(res, input) {
  return { a: res.a, b: res.b, x1: res.x1, x2: res.x2, hc1: input.hc1, hc2: input.hc2, bc1: input.bc1, bc2: input.bc2, bw: res.bw, hs: res.hs, Pu1: res.Pu1, Pu2: res.Pu2, qL: res.qL, qR: res.qR, xs: res.xs, V: res.V, M: res.M, limit: res.limit };
}

function sepCard(res) {
  const sep = res.sep;
  if (!sep || sep.clear == null) return '';
  const cl = fmt(sep.clear / 10, 0);
  return `<p style="margin:0 0 10px;"><span class="tag ${sep.needUnify ? 'tag-media' : 'tag-baja'}">${sep.needUnify ? 'Conviene unificar' : 'Podrían ser aisladas'}</span> <span class="text-muted" style="font-size:12.5px;">Como zapatas aisladas serían de ${fmt(sep.sizes[0] / 10, 0)} y ${fmt(sep.sizes[1] / 10, 0)} cm de lado: la distancia libre entre ellas sería de ${cl} cm ${sep.needUnify ? `(menor que ${MIN_CLEAR_BETWEEN_FOOTINGS / 10} cm)` : `(mayor o igual que ${MIN_CLEAR_BETWEEN_FOOTINGS / 10} cm: no hace falta unificar)`}.</span></p>`;
}

function resultsComb(calc, out) {
  const { res, input } = out;
  if (!res.ok) return `${failCard(res.reason)}${res.sep ? `<div class="card" style="margin-top:16px;">${sepCard(res)}</div>` : ''}`;
  const f = combinedFootingFigures(combFp(res, input), 'screen');
  const bars = (o) => `${o.n} ø${o.db}${o.layers === 2 ? ' (2 capas)' : ''}`;
  return `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Esquema de cálculo</h3>${f.elev}${f.plan}
      <p class="text-muted" style="font-size:11.5px; margin:6px 0 0;">Mu⁻ (tramo) define la armadura superior de la franja y Mu⁺ (columnas y voladizos), la inferior; Vu a d de las caras de las columnas, los estribos. La presión del suelo mayorada se aplica sobre todo el ancho b.</p></div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Base unificada calculada</h3>
      ${sepCard(res)}
      <table class="data-table"><tbody>
        <tr><td><b>Dimensiones</b> a × b × h (placa de ${fmt(res.hs / 10, 0)} cm)</td><td style="text-align:right;"><b>${fmt(res.a / 10, 0)} × ${fmt(res.b / 10, 0)} × ${fmt(res.h / 10, 0)} cm</b></td></tr>
        <tr><td>Alma bo · ala efectiva bf (art. 8.10)</td><td style="text-align:right;">${fmt(res.bw / 10, 0)} cm · ${fmt(res.bf / 10, 0)} cm</td></tr>
        <tr><td>Voladizos de la base: a la izquierda de la columna 1 · a la derecha de la 2 (ejes)</td><td style="text-align:right;">${fmt(res.u / 10, 0)} cm · ${fmt(res.v / 10, 0)} cm</td></tr>
        <tr><td>Resultante de servicio desde el eje de la columna 1 (en el baricentro)</td><td style="text-align:right;">${fmt(res.xR / 10, 0)} cm</td></tr>
        <tr><td>Armadura superior (tramo): Mu = ${fmt(res.MnegMax / 1e6, 0)} kN·m</td><td style="text-align:right;"><b>${bars(res.top)}</b></td></tr>
        <tr><td>Armadura inferior (columnas y voladizos): Mu = ${fmt(res.MposMax / 1e6, 0)} kN·m</td><td style="text-align:right;"><b>${bars(res.bot)}</b></td></tr>
        <tr><td>Estribos (Vu = ${fmt(res.VuB / 1000, 0)} kN)</td><td style="text-align:right;"><b>${res.shear.stirrups ? `ø${res.dSt} c/${fmt(res.shear.s / 10, 0)} cm (${res.legs} ramas)` : 'mínimos'}</b></td></tr>
        <tr><td>Placa transversal (voladizo de ${fmt(res.cant / 10, 0)} cm)</td><td style="text-align:right;"><b>ø${res.slab.db} c/${fmt(res.slab.s / 10, 0)} cm</b> (en el ancho de la base)</td></tr>
        <tr><td>Armadura longitudinal de repartición en la placa</td><td style="text-align:right;">ø8 c/20 cm (mínima)</td></tr>
        <tr><td>Hormigón · acero aproximado</td><td style="text-align:right;">${fmt(res.concrete, 2)} m³ · ${fmt(res.steelKg, 0)} kg</td></tr>
      </tbody></table>
      <p class="text-muted" style="font-size:11.5px; margin:8px 0 0;">Las barras de la franja se prolongan en toda la longitud; no se verifica su anclaje en los extremos (usar ganchos). Armadura de espera de las columnas: ver la base aislada (art. 15.8.2.1).</p>
    </div>${checksCard(res)}`;
}

function memoriaComb(calc, out) {
  const { res, input } = out;
  const f = combinedFootingFigures(combFp(res, input), 'print');
  const sep = res.sep && res.sep.clear != null ? memoRow('Distancia libre entre zapatas aisladas', `${fmt(res.sep.clear / 10, 0)} cm (zapatas de ${fmt(res.sep.sizes[0] / 10, 0)} y ${fmt(res.sep.sizes[1] / 10, 0)} cm) → ${res.sep.needUnify ? `menor que ${MIN_CLEAR_BETWEEN_FOOTINGS / 10} cm: se unifican` : 'no hace falta unificar'}`, 'Criterio de la cátedra (Estructuras III)') : '';
  const bars = (o) => `${o.n} ø${o.db}${o.layers === 2 ? ' (2 capas)' : ''} (As = ${fmt(o.As, 0)} mm²)`;
  return {
    title: calc.name,
    sub: `Base unificada · ${fmt(res.a / 10, 0)} × ${fmt(res.b / 10, 0)} × ${fmt(res.h / 10, 0)} cm`,
    html: `
      <h2>1. Datos</h2>
      <table>${memoRow('Columna 1: D / L · sección', `${fmt(input.PD1 / 1000, 0)} / ${fmt(input.PL1 / 1000, 0)} kN · ${fmt(input.hc1 / 10, 0)} × ${fmt(input.bc1 / 10, 0)} cm`)}${memoRow('Columna 2: D / L · sección', `${fmt(input.PD2 / 1000, 0)} / ${fmt(input.PL2 / 1000, 0)} kN · ${fmt(input.hc2 / 10, 0)} × ${fmt(input.bc2 / 10, 0)} cm`)}
        ${memoRow('Distancia entre ejes', `${fmt(input.ell / 10, 0)} cm${input.limit ? `; columna 1 junto al límite (cara a ${fmt(input.ax1 / 10, 0)} cm)` : ''}`)}${sep}
        ${memoRow('Tensión admisible', `${fmt(calc.design.sigma, 2)} kg/cm² (${fmt(input.sigma * 1000, 0)} kPa)`)}${memoRow('Profundidad / peso del suelo', `${fmt(calc.design.Df, 2)} m / ${fmt(input.gammaSoil, 1)} kN/m³`, ART.soilW)}
        ${memoRow('Hormigón / acero', `H-${input.fc} / ADN 420`)}</table>
      <h2>2. Dimensiones</h2>
      <table>${memoRow('Resultante de servicio', `xR = P₂ ℓ / (P₁ + P₂) = ${fmt(res.xR / 10, 0)} cm desde el eje de la columna 1`, ART.area)}${memoRow('a × b × h (placa)', `${fmt(res.a / 10, 0)} × ${fmt(res.b / 10, 0)} × ${fmt(res.h / 10, 0)} cm (${fmt(res.hs / 10, 0)} cm)`)}
        ${memoRow('Voladizos (ejes)', `${fmt(res.u / 10, 0)} cm y ${fmt(res.v / 10, 0)} cm`)}${memoRow('Alma bo · ala bf', `${fmt(res.bw / 10, 0)} cm · ${fmt(res.bf / 10, 0)} cm`, 'CIRSOC 201 art. 8.10')}
        ${memoRow('Presión de servicio', `${fmt(res.qmax * 1000, 0)} kPa ≤ ${fmt(input.sigma * 1000, 0)} kPa`)}${memoRow('Presión mayorada qu (promedio)', `${fmt(res.qu * 1000, 0)} kPa`)}</table>
      ${f.elev}${f.plan}
      <h2>3. Franja longitudinal</h2>
      <table>${memoRow('Mu tramo (tracción arriba)', `${fmt(res.MnegMax / 1e6, 0)} kN·m`, 'Sección T invertida')}${memoRow('Armadura superior', bars(res.top))}
        ${memoRow('Mu columnas y voladizos (tracción abajo)', `${fmt(res.MposMax / 1e6, 0)} kN·m`, 'Sección rectangular de ancho bo')}${memoRow('Armadura inferior', bars(res.bot))}
        ${memoRow('Corte: Vu a d de las caras', `${fmt(res.VuB / 1000, 0)} kN`, ART.shear)}${memoRow('Estribos', res.shear.stirrups ? `ø${res.dSt} c/${fmt(res.shear.s / 10, 0)} cm (${res.legs} ramas)` : 'mínimos')}</table>
      <h2>4. Placa transversal y punzonado</h2>
      <table>${memoRow('Voladizo de la placa', `${fmt(res.cant / 10, 0)} cm; Mu = ${fmt(res.slab.Mu / 1e6, 1)} kN·m/m`)}${memoRow('Armadura transversal', `ø${res.slab.db} c/${fmt(res.slab.s / 10, 0)} cm (As = ${fmt(res.slab.As, 0)} mm²/m)`, ART.dist)}
        ${res.punch.map((q, i) => memoRow(`Punzonado columna ${i + 1} (${q.sides} lados, bo = ${fmt(q.bo, 0)} mm)`, `vu = ${fmt(q.vmax, 2)} ≤ φvc = ${fmt(q.phiVc, 2)} MPa`, ART.punch)).join('')}</table>
      <h2>5. Verificaciones</h2>
      <table>${res.checks.map((k) => memoRow(`${k.ok ? '✓' : '✗'} ${k.label}`, k.text)).join('')}</table>`,
  };
}
