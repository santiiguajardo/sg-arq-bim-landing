// Valores iniciales de un cálculo nuevo. Son solo un punto de partida editable (no son valores normativos).
export function newCalc({ name, element, projectId }) {
  const common = {
    name: name || 'Cálculo nuevo',
    projectId: projectId || null,
    material: 'ha',
    element,
    step: 1,
    materials: { fc: 25, rebar: 'ADN420', stirrup: 'ADN420', dStirrup: 8, placement: 'interior', exposure: 'A1A2', dagg: 19 },
    verification: { limitKey: 'floorNoDamage', xi: 2.0 },
    chosen: null,
  };
  if (element === 'slab') {
    return { ...common, design: { L: 4, kind: 'simple', perm: 0, liveId: 'viv', live: 2 }, section: { h: 15 } };
  }
  return { ...common, design: { L: 5, kind: 'simple', tribW: 3, slabH: 12, perm: 0, wall: 0, liveId: 'viv', live: 2, beamType: 'conv', flangeMode: 'yes', flangePos: 'T' }, section: { b: 20, h: 40 } };
}
