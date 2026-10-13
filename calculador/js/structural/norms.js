// Datos normativos del calculador estructural. Cada valor indica el artículo del que sale; todos se verificaron
// contra el texto oficial de CIRSOC 201-2005 y CIRSOC 101-2005 (INTI-CIRSOC). Si un dato no está acá es porque
// todavía no se verificó: no se completa de memoria.

export const CIRSOC201 = {
  name: 'CIRSOC 201-2005',
  // Clases de hormigón: H-nn, con nn = resistencia característica f'c en MPa (Cap. 1, definición de "Clase de hormigón").
  concreteClasses: [20, 25, 30, 35, 40],
  Es: 200000,                                  // MPa, art. 8.5.2 (8-3)
  Ec: (fc) => 4700 * Math.sqrt(fc),            // MPa, art. 8.5.1 (8-1), hormigón de densidad normal
  epsCu: 0.003,                                // art. 10.2.3
  epsTensionControlled: 0.005,                 // art. 10.3.4
  epsMinFlexure: 0.004,                        // art. 10.3.5
  epsCompressionControlled: (fy) => (fy === 420 ? 0.002 : fy / 200000), // art. 9.3.2.2 / 10.3.3
  phiFlexure: 0.90, phiCompression: 0.65, phiShear: 0.75,                 // art. 9.3.2.1, 9.3.2.2.b, 9.3.2.3
  beta1: (fc) => (fc <= 30 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 30) / 7)), // art. 10.2.7.3
  maxSqrtFcShear: 8.3,                         // MPa, art. 11.1.2
  gammaRC: 25,                                 // kN/m3, hormigón armado — CIRSOC 101-2005, Tabla 3.1 (pesos unitarios)
  // Acero (CIRSOC 201, Tabla 6.x): diámetros nominales comerciales en mm.
  rebar: {
    ADN420: { label: 'ADN 420 (nervurado)', fy: 420, diameters: [6, 8, 10, 12, 16, 20, 25, 32, 40] },
    AL220: { label: 'AL 220 (liso)', fy: 220, diameters: [6, 8, 10, 12, 16, 20, 25] },
  },
  // Recubrimiento mínimo (art. 7.7.1, Tabla 7.7.1, exposición A1 y A2) y su aumento por clase de exposición (nota de la tabla).
  exposure: {
    A1A2: { label: 'Clase A1 / A2 (normal)', factor: 1 },
    A3Q1C1: { label: 'Clase A3 / Q1 / C1', factor: 1.3 },
    severe: { label: 'Clase CL / M1-M3 / C2 / Q2-Q3', factor: 1.5 },
  },
  // Condición (b) o (c) de la Tabla 7.7.1.
  placement: {
    interior: { label: 'Interior, no expuesto al aire libre ni al suelo (c)' },
    outdoor: { label: 'Expuesto al aire libre o en contacto con el suelo (b)' },
  },
  // Tabla 9.5.a): altura mínima para no verificar flechas, vigas / losas macizas armadas en una dirección (l en mm).
  minThicknessRatio: {
    beam: { simple: 16, cantilever: 8 },       // l/16, l/8 (también l/18,5 y l/21 para tramos continuos)
    slab: { simple: 20, cantilever: 10 },      // l/20, l/10 (también l/24 y l/28)
  },
  minThicknessFyFactor: (fy) => (fy === 420 ? 1 : 0.4 + fy / 700), // Tabla 9.5.a), nota b): fy distinto de 420 MPa
  // Tabla 9.5.b): flechas máximas admisibles (l en mm).
  deflectionLimits: {
    roofNoDamage: { label: 'Cubierta plana sin elementos dañables', ratio: 180, uses: 'L' },
    floorNoDamage: { label: 'Entrepiso sin elementos dañables', ratio: 360, uses: 'L' },
    damageable: { label: 'Soporta elementos no estructurales dañables (tabiques)', ratio: 480, uses: 'D+L' },
    nonDamageable: { label: 'Soporta elementos no estructurales no dañables', ratio: 240, uses: 'D+L' },
  },
  // Art. 9.5.2.5: factor de tiempo xi para flechas diferidas.
  timeFactor: [
    { label: '5 años o más', xi: 2.0 },
    { label: '12 meses', xi: 1.4 },
    { label: '6 meses', xi: 1.2 },
    { label: '3 meses', xi: 1.0 },
    { label: '1 mes', xi: 0.7 },
  ],
  slabMinRatio: 0.0018,                        // art. 7.12.2.1, Tabla 7.12.2.1 (a): ADN 420
};

// CIRSOC 101-2005, Tabla 4.1: sobrecargas mínimas uniformemente distribuidas (kN/m2). Solo destinos cuya fila se
// verificó sin ambigüedad en la tabla oficial; para cualquier otro destino se ingresa el valor a mano.
export const LIVE_LOADS = [
  { id: 'viv', label: 'Vivienda 1 y 2 familias: todas las áreas excepto balcones', value: 2 },
  { id: 'dpto', label: 'Departamentos, hoteles y multifamiliares: habitaciones privadas y corredores', value: 2 },
  { id: 'oficina', label: 'Oficinas: oficinas', value: 2.5 },
  { id: 'oficina-cor', label: 'Oficinas: corredores en pisos superiores', value: 4 },
  { id: 'aula', label: 'Escuelas: aulas', value: 3 },
  { id: 'balcon-viv', label: 'Balcones: casas de 1 y 2 familias, hasta 10 m2', value: 3 },
  { id: 'balcon', label: 'Balcones: viviendas en general', value: 5 },
  { id: 'azotea-priv', label: 'Azoteas accesibles privadamente', value: 3 },
  { id: 'garaje', label: 'Garajes (automóviles solamente)', value: 2.5 },
];

export const ARTICLES = {
  combos: 'CIRSOC 201 art. 9.2.1, ec. (9-1) y (9-2)',
  phi: 'CIRSOC 201 art. 9.3.2',
  block: 'CIRSOC 201 art. 10.2.7 (bloque rectangular de tensiones, 0,85 f\'c)',
  eps: 'CIRSOC 201 art. 10.3.4 y 10.3.5',
  asMin: 'CIRSOC 201 art. 10.5.1, ec. (10-3) y 10.5.3',
  asMinSlab: 'CIRSOC 201 art. 10.5.4 y 7.12.2.1',
  cover: 'CIRSOC 201 art. 7.7.1, Tabla 7.7.1',
  spacingBeam: 'CIRSOC 201 art. 7.6.1',
  spacingSlab: 'CIRSOC 201 art. 7.6.5',
  shearVc: 'CIRSOC 201 art. 11.3.1.1, ec. (11-3)',
  shearVs: 'CIRSOC 201 art. 11.5.7.2, ec. (11-15) y 11.5.7.9',
  shearSpacing: 'CIRSOC 201 art. 11.5.5.1 y 11.5.5.3',
  shearMin: 'CIRSOC 201 art. 11.5.6.1 y 11.5.6.3, ec. (11-13)',
  hMin: 'CIRSOC 201 art. 9.5.2.1, Tabla 9.5.a)',
  deflection: 'CIRSOC 201 art. 9.5.2.2 a 9.5.2.6 (ec. 9-8, 9-9, 9-10, 9-11) y Tabla 9.5.b)',
  loads: 'CIRSOC 101-2005, Tabla 4.1 (sobrecargas) y Tabla 3.1 (pesos unitarios)',
};
