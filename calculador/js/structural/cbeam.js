// Viga (o franja de losa de 1 m) continua de hormigón armado: varios tramos, voladizos en los extremos y cada apoyo simple o empotrado.
// Análisis elástico de rigidez constante con la sobrecarga alternada tramo por tramo (continuous.js), armadura por tramo y por apoyo
// (rc.js) y verificación del corte y de la altura mínima de la Tabla 9.5.a). Unidades: m y kN (cargas, esfuerzos); mm para la sección.
import { analyzeStrip } from './continuous.js';
import * as rc from './rc.js';
import { CIRSOC201 as N } from './norms.js';

const TINY = 0.01;                                   // kN·m: momento mínimo con el que se calcula una sección (queda la armadura mínima)

// ¿Qué tipo de tramo es para la Tabla 9.5.a)? Un extremo es continuo si sigue otro elemento o si está empotrado.
export function endsOf(i, nSpans, cantL, cantR, fixed) {
  const left = i > 0 || cantL > 0 || Boolean(fixed[i]);
  const right = i < nSpans - 1 || cantR > 0 || Boolean(fixed[i + 1]);
  return { left, right, kind: left && right ? 'both' : left || right ? 'one' : 'simple' };
}
const RATIO = {
  beam: { simple: 16, one: 18.5, both: 21, cantilever: 8 },
  slab: { simple: 20, one: 24, both: 28, cantilever: 10 },
};

// altura (mm) mínima de la Tabla 9.5.a) que exige alguno de los tramos o voladizos
export function minHeight({ element, spans, cantL, cantR, fixed, fy }) {
  const r = RATIO[element];
  const fyF = N.minThicknessFyFactor(fy);
  let hMin = 0;
  let by = '';
  const take = (L, ratio, what) => { const v = L * 1000 / ratio * fyF; if (v > hMin) { hMin = v; by = what; } };
  spans.forEach((L, i) => { const e = endsOf(i, spans.length, cantL, cantR, fixed); take(L, r[e.kind], `tramo ${i + 1} (${e.kind === 'both' ? 'ambos extremos continuos' : e.kind === 'one' ? 'un extremo continuo' : 'simplemente apoyado'}, l/${r[e.kind]})`); });
  if (cantL > 0) take(cantL, r.cantilever, `voladizo izquierdo (l/${r.cantilever})`);
  if (cantR > 0) take(cantR, r.cantilever, `voladizo derecho (l/${r.cantilever})`);
  return { hMin, by };
}

// Cargas y análisis para una sección dada. input: { element, spans, cantL, cantR, fixed, D0, Lv, b?, h }
export function analyzeContinuous(input) {
  const { element, spans, cantL = 0, cantR = 0, D0, Lv, h } = input;
  const fixed = input.fixed || [];
  const self = element === 'slab' ? rc.selfWeightSlab(h) : rc.selfWeightBeam(input.b, h);
  const D = D0 + self;
  const mk = (L) => ({ L, wD: D, wL: Lv });
  const an = analyzeStrip({
    spans: spans.map(mk),
    cantLeft: cantL > 0 ? mk(cantL) : null,
    cantRight: cantR > 0 ? mk(cantR) : null,
    fixed,
  });
  return { self, D, an, wu: rc.combos(D, Lv) };
}

// armadura de una sección: la primera opción (la de menor exceso)
const pickBeam = (Mu, inp) => {
  const o = rc.beamBarOptions({ Mu: Math.max(Mu, TINY) * 1e6, b: inp.b, h: inp.h, fc: inp.fc, fy: inp.fy, dStirrup: inp.dStirrup, dagg: inp.dagg, placement: inp.placement, exposure: inp.exposure });
  return { chosen: o.options[0] || null, failures: o.failures, Mu };
};
const pickSlab = (Mu, inp) => {
  const o = rc.slabBarOptions({ Mu: Math.max(Mu, TINY) * 1e6, h: inp.h, fc: inp.fc, placement: inp.placement, exposure: inp.exposure });
  return { chosen: o.options[0] || null, failures: o.failures, Mu, asMin: o.asMin };
};

/**
 * Dimensiona la viga o la franja continua. Devuelve:
 *  { ok, reason?, self, D, combos, an, members: [{ type: 'span'|'cantL'|'cantR', L, ... }], supports: [{ q, fixed, negM, bars, Ru }], hReq, checks }
 * members está en orden de izquierda a derecha, con voladizos incluidos.
 */
export function designContinuous(input) {
  const { element, spans, cantL = 0, cantR = 0 } = input;
  const fixed = input.fixed || [];
  const slab = element === 'slab';
  const a = analyzeContinuous(input);
  const { an } = a;
  const pick = slab ? pickSlab : pickBeam;
  const maxM = Math.max(1e-6, ...an.spans.flatMap((s) => [s.posM, s.negLeft, s.negRight]), ...an.supports.map((s) => s.negM));
  const res = { element, self: a.self, D: a.D, combos: a.wu, an, input, checks: [], members: [], supports: [] };
  const failures = [];
  const dOf = (...cs) => {
    const ds = cs.filter(Boolean).map((c) => c.d);
    return ds.length ? Math.min(...ds) : input.h - 60;
  };

  // ----- apoyos: armadura superior
  const nS = spans.length;
  an.supports.forEach((sp, q) => {
    const need = sp.negM >= 0.05 * maxM;
    const pk = need ? pick(sp.negM, input) : null;
    if (need && !pk.chosen) failures.push(`apoyo ${q + 1}: ${pk.failures[0]?.flexure?.reason ? 'la sección no resiste el momento negativo' : 'las barras no entran en el ancho'}`);
    res.supports.push({ q, fixed: Boolean(fixed[q]), negM: sp.negM, bars: pk ? pk.chosen : null, Ru: sp.Ru, RD: sp.RD, RL: sp.RL, needed: need });
  });

  // ----- tramos y voladizos
  const curves = an.curves;
  const memberDefs = [];
  if (cantL > 0) memberDefs.push({ type: 'cantL', L: cantL });
  spans.forEach((L, i) => memberDefs.push({ type: 'span', L, idx: i }));
  if (cantR > 0) memberDefs.push({ type: 'cantR', L: cantR });
  const supOffset = cantL > 0 ? 1 : 0;           // los tramos empiezan en el apoyo 0; el voladizo izquierdo cuelga de él
  memberDefs.forEach((m, mi) => {
    const cv = curves[mi];
    const pts = cv.pts;
    const sgn = (q) => (Math.abs(q.vMax) >= Math.abs(q.vMin) ? q.vMax : q.vMin);         // corte de la envolvente con su signo
    const vA = sgn(pts[0]);
    const vB = sgn(pts[pts.length - 1]);
    const rec = { ...m, pts, vA, vB };
    if (m.type === 'span') {
      const sr = an.spans[m.idx];
      const pk = pick(sr.posM, input);
      rec.posM = sr.posM;
      rec.posX = sr.posX;
      rec.pos = pk.chosen;
      if (!pk.chosen) failures.push(`tramo ${m.idx + 1}: ${pk.failures[0]?.flexure?.reason ? 'la sección no resiste el momento positivo' : 'las barras no entran en el ancho'}`);
      rec.supL = m.idx;
      rec.supR = m.idx + 1;
      rec.ends = endsOf(m.idx, nS, cantL, cantR, fixed);
    } else {
      rec.sup = m.type === 'cantL' ? 0 : nS;
    }
    res.members.push(rec);
  });
  void supOffset;

  // ----- corte por miembro: d de la armadura de sus extremos
  res.members.forEach((m) => {
    const supBars = m.type === 'span' ? [res.supports[m.supL].bars, res.supports[m.supR].bars] : [res.supports[m.sup].bars];
    const d = dOf(m.pos, ...supBars);
    m.d = d;
    const vMax = Math.max(Math.abs(m.vA), Math.abs(m.vB));
    if (slab) {
      const phiVc = N.phiShear * Math.min(Math.sqrt(input.fc), N.maxSqrtFcShear) / 6 * 1000 * d / 1000;    // kN/m
      m.shear = { phiVc, Vu: vMax, ok: vMax <= phiVc };
    } else {
      m.shear = rc.shearDesign({ Vu: vMax * 1000, b: input.b, d, h: input.h, fc: input.fc, fyt: input.fyt, dStirrup: input.dStirrup });
    }
    m.shearAt = slab ? null : (V) => rc.shearDesign({ Vu: V * 1000, b: input.b, d, h: input.h, fc: input.fc, fyt: input.fyt, dStirrup: input.dStirrup });
  });

  // ----- verificaciones
  const mh = minHeight({ element, spans, cantL, cantR, fixed, fy: slab ? 420 : input.fy });
  res.hReq = mh.hMin;
  res.hReqBy = mh.by;
  const nf = (x, d = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const flexOk = failures.length === 0;
  res.checks.push({ id: 'flex', label: 'Flexión y armadura', ok: flexOk, text: flexOk ? 'todas las secciones verifican con la armadura adoptada' : failures.join('; ') });
  const shearBad = res.members.filter((m) => !m.shear.ok);
  res.checks.push({ id: 'shear', label: slab ? 'Corte (sin estribos)' : 'Corte', ok: shearBad.length === 0,
    text: shearBad.length === 0 ? (slab ? 'Vu ≤ φVc en todos los tramos' : 'estribos adoptados en todos los tramos') : shearBad.map((m) => (slab ? `φVc = ${nf(m.shear.phiVc, 1)} kN/m < Vu = ${nf(m.shear.Vu, 1)} kN/m` : m.shear.reason)).join('; ') });
  const hOk = input.h >= mh.hMin - 1e-9;
  res.checks.push({ id: 'hmin', label: 'Altura mínima (Tabla 9.5.a)', ok: hOk,
    text: hOk ? `h = ${nf(input.h, 0)} mm ≥ ${nf(mh.hMin, 0)} mm: rige ${mh.by}. No hace falta calcular las flechas.` : `h = ${nf(input.h, 0)} mm < ${nf(mh.hMin, 0)} mm (rige ${mh.by}): habría que verificar las flechas por cálculo (art. 9.5.2.2 a 9.5.2.4), que este módulo no hace para elementos continuos. Aumentá h.` });
  res.ok = res.checks.every((c) => c.ok);
  res.failures = failures;
  return res;
}
