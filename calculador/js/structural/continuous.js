// Franjas continuas sobre apoyos rígidos (losas apoyadas en vigas) con voladizos opcionales en los extremos.
// Unidades: m, kN. Análisis elástico (art. 8.3.1) y envolvente de sobrecarga por superposición: cada tramo (y cada
// voladizo) se carga o no de forma independiente, lo que incluye y supera las disposiciones del art. 8.9.2.
import { solveFrame } from './frame.js';

const E = 25e6;
const A = 1;
const I = 1e-3;   // EI constante: en una franja de rigidez uniforme no cambia ni momentos ni reacciones

// spans: [{L, wD, wL}]; cantLeft / cantRight: {L, wD, wL} | null. Cargas en kN/m (por metro de ancho de franja).
export function analyzeStrip({ spans, cantLeft = null, cantRight = null }) {
  const nodes = [];
  const members = [];
  const supports = [];
  const memberOf = { spans: [], left: null, right: null };
  let x = 0;
  let cl = null;
  if (cantLeft && cantLeft.L > 0) { nodes.push({ x: -cantLeft.L, y: 0 }); cl = 0; }
  const supportNode = [];
  nodes.push({ x, y: 0 });
  supportNode.push(nodes.length - 1);
  for (const sp of spans) {
    x += sp.L;
    nodes.push({ x, y: 0 });
    supportNode.push(nodes.length - 1);
  }
  let cr = null;
  if (cantRight && cantRight.L > 0) { nodes.push({ x: x + cantRight.L, y: 0 }); cr = nodes.length - 1; }

  const srcs = [];   // fuentes de sobrecarga independientes
  const addMember = (i, j, tag) => { members.push({ i, j, E, A, I, tag }); return members.length - 1; };
  if (cl !== null) { memberOf.left = addMember(0, supportNode[0], 'cl'); srcs.push({ type: 'cantL' }); }
  spans.forEach((sp, k) => { memberOf.spans.push(addMember(supportNode[k], supportNode[k + 1], `s${k}`)); srcs.push({ type: 'span', k }); });
  if (cr !== null) { memberOf.right = addMember(supportNode[spans.length], cr, 'cr'); srcs.push({ type: 'cantR' }); }
  supportNode.forEach((nid, q) => supports.push({ node: nid, ux: q === 0, uy: true }));

  const loadOf = (tag, kind) => {
    if (tag === 'cl') return cantLeft[kind];
    if (tag === 'cr') return cantRight[kind];
    return spans[Number(tag.slice(1))][kind];
  };
  const solveCase = (selector) => {
    const ms = members.map((m) => ({ ...m, w: () => selector(m.tag) }));
    return solveFrame({ nodes, members: ms, supports });
  };
  const caseD = solveCase((tag) => loadOf(tag, 'wD'));
  const caseL = srcs.map((src) => {
    const tag = src.type === 'cantL' ? 'cl' : src.type === 'cantR' ? 'cr' : `s${src.k}`;
    return solveCase((t) => (t === tag ? loadOf(t, 'wL') : 0));
  });

  const NS = 20;
  const sampleOf = (res, mi) => res.members[mi].sample(NS);
  const sampleD = members.map((_, mi) => sampleOf(caseD, mi));
  const sampleL = caseL.map((res) => members.map((_, mi) => sampleOf(res, mi)));

  // Esfuerzos mayorados (1,2 D + 1,6 L, art. 9.2.1) máximos y mínimos en cada sección, con y sin cada fuente de L.
  const envelopeMember = (mi) => {
    const out = [];
    for (let k = 0; k <= NS; k++) {
      const d = sampleD[mi][k];
      let mMax = 1.2 * d.M;
      let mMin = 1.2 * d.M;
      let vMax = 1.2 * d.V;
      let vMin = 1.2 * d.V;
      for (const sl of sampleL) {
        const l = sl[mi][k];
        mMax += 1.6 * Math.max(0, l.M);
        mMin += 1.6 * Math.min(0, l.M);
        vMax += 1.6 * Math.max(0, l.V);
        vMin += 1.6 * Math.min(0, l.V);
      }
      out.push({ x: d.x, mMax: Math.max(mMax, 1.4 * d.M), mMin: Math.min(mMin, 1.4 * d.M), vMax, vMin, MD: d.M });
    }
    return out;
  };
  const env = members.map((_, mi) => envelopeMember(mi));

  const spanResults = spans.map((sp, k) => {
    const e = env[memberOf.spans[k]];
    let pos = { M: -Infinity, x: 0 };
    e.forEach((p) => { if (p.mMax > pos.M) pos = { M: p.mMax, x: p.x }; });
    return {
      L: sp.L,
      posM: Math.max(0, pos.M), posX: pos.x,
      negLeft: -Math.min(0, e[0].mMin), negRight: -Math.min(0, e[NS].mMin),
      vLeft: Math.max(Math.abs(e[0].vMax), Math.abs(e[0].vMin)),
      vRight: Math.max(Math.abs(e[NS].vMax), Math.abs(e[NS].vMin)),
    };
  });
  // momento negativo en cada apoyo: el mayor entre los dos lados (en un nudo continuo coinciden)
  const supportResults = supportNode.map((nid, q) => {
    const vals = [];
    if (q === 0 && memberOf.left !== null) vals.push(-Math.min(0, env[memberOf.left][NS].mMin));
    if (q > 0) vals.push(-Math.min(0, env[memberOf.spans[q - 1]][NS].mMin));
    if (q < spans.length) vals.push(-Math.min(0, env[memberOf.spans[q]][0].mMin));
    if (q === spans.length && memberOf.right !== null) vals.push(-Math.min(0, env[memberOf.right][0].mMin));
    const RD = caseD.reactions[q].fy;
    const RL = caseL.reduce((s, c) => s + c.reactions[q].fy, 0);
    return { negM: Math.max(0, ...vals), RD, RL };
  });
  return { spans: spanResults, supports: supportResults };
}
