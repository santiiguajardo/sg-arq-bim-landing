// Acción del viento sobre naves y galpones según el Reglamento CIRSOC 102 (2005), con la simplificación que usa el apunte de la cátedra
// (Estructuras III, "Viento nave industrial"): una sola presión dinámica qh para todas las superficies, p = q (G Cp − GCpi), en kg/m²
// (1 kg = 10 N, como en los apuntes). Las tablas se transcribieron de las Figuras y Tablas del reglamento (Tabla 5, Tabla 7, Figura 3).
// Signo de p: positivo = presión hacia la superficie, negativo = succión (se aleja de ella).

// Tabla 5: coeficientes de exposición para la presión dinámica, Kz. Altura z en m (la primera fila vale de 0 a 5 m).
const Z = [5, 6, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 135, 150];
const KZ = {
  A1: [0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.68, 0.72, 0.76, 0.80, 0.83, 0.86, 0.89, 0.98, 1.05, 1.12, 1.18, 1.23, 1.29],
  A2: [0.33, 0.36, 0.39, 0.44, 0.48, 0.51, 0.55, 0.57, 0.60, 0.63, 0.68, 0.72, 0.76, 0.80, 0.83, 0.86, 0.89, 0.98, 1.05, 1.12, 1.18, 1.23, 1.29],
  B1: [0.72, 0.72, 0.72, 0.72, 0.77, 0.81, 0.84, 0.88, 0.91, 0.93, 0.98, 1.03, 1.07, 1.10, 1.14, 1.17, 1.20, 1.28, 1.35, 1.41, 1.46, 1.51, 1.56],
  B2: [0.59, 0.62, 0.66, 0.72, 0.77, 0.81, 0.84, 0.88, 0.91, 0.93, 0.98, 1.03, 1.07, 1.10, 1.14, 1.17, 1.20, 1.28, 1.35, 1.41, 1.46, 1.51, 1.56],
  C: [0.87, 0.90, 0.94, 1.00, 1.05, 1.09, 1.13, 1.16, 1.19, 1.21, 1.26, 1.30, 1.34, 1.37, 1.40, 1.43, 1.46, 1.53, 1.59, 1.64, 1.69, 1.73, 1.77],
  D: [1.05, 1.08, 1.12, 1.18, 1.23, 1.27, 1.30, 1.33, 1.36, 1.38, 1.43, 1.47, 1.50, 1.53, 1.56, 1.59, 1.61, 1.68, 1.73, 1.78, 1.82, 1.86, 1.89],
};
export const EXPOSURES = { A: 'A: centros de grandes ciudades', B: 'B: suburbios, terrenos con obstáculos (el de los ejemplos)', C: 'C: terreno abierto, pocos obstáculos', D: 'D: terreno plano sin obstáculos' };
export const ENCLOSURES = { partial: ['Parcialmente cerrado (GCpi = ±0,55)', 0.55], closed: ['Cerrado (GCpi = ±0,18)', 0.18], open: ['Abierto (GCpi = 0)', 0] };           // Tabla 7

const lerp = (x, x0, x1, y0, y1) => (x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0));
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(x, xs[i - 1], xs[i], ys[i - 1], ys[i]);
  return ys[ys.length - 1];
}

export function kzOf(z, exposure = 'B', caso = 1) {
  const key = exposure === 'A' || exposure === 'B' ? `${exposure}${caso === 2 ? 2 : 1}` : exposure;
  return interp(Z, KZ[key] || KZ.B1, z);
}

// Presión dinámica: qz = 0,613 Kz Kzt Kd V² I (N/m²), art. 5.12; aquí en kg/m².
export function dynamicPressure({ V, Kz, Kzt = 1, Kd = 0.85, I = 1 }) {
  return 0.613 * Kz * Kzt * Kd * V * V * I / 10;
}

// ---------------------------------------------------------------- coeficientes de presión externa, Cp (Figura 3, edificios cerrados o parcialmente cerrados)
// Paredes
export const wallCp = {
  windward: 0.8,
  leeward: (LB) => interp([1, 2, 4], [-0.5, -0.3, -0.2], LB),
  side: -0.7,
};
// Cubiertas, barlovento con el viento normal a la cumbrera y θ ≥ 10°: dos series (succión y presión), 0 donde la tabla no da valor
const TH = [10, 15, 20, 25, 30, 35, 45, 60];
const HL = [0.25, 0.5, 1.0];
const WIND_NEG = [[-0.7, -0.5, -0.3, -0.2, -0.2, 0, 0, 0], [-0.9, -0.7, -0.4, -0.3, -0.2, -0.2, 0, 0], [-1.3, -1.0, -0.7, -0.5, -0.3, -0.2, 0, 0]];
const WIND_POS = [[0, 0, 0.2, 0.3, 0.3, 0.4, 0.4, 0.6], [0, 0, 0.2, 0.2, 0.3, 0.3, 0.4, 0.6], [0, 0, 0, 0, 0.2, 0.2, 0.3, 0.6]];
const LEE = { th: [10, 15, 20], rows: [[-0.3, -0.5, -0.6], [-0.5, -0.5, -0.6], [-0.7, -0.6, -0.6]] };
const bilinear = (table, theta, hL) => {
  const cols = table.map((row) => interp(TH, row, theta));
  return interp(HL, cols, hL);
};

// Viento paralelo a la cumbrera (o normal con θ < 10°): Cp según la distancia horizontal desde el borde a barlovento
export function roofZoneCp(x, h, hL) {
  const z = [[0, 0.5], [0.5, 1], [1, 2], [2, Infinity]];                        // en múltiplos de h
  const low = [-0.9, -0.9, -0.5, -0.3];                                        // h/L ≤ 0,5
  const high = [-1.3, -0.7, -0.7, -0.7];                                       // h/L ≥ 1,0
  const k = z.findIndex(([a, b]) => x >= a * h && x < b * h);
  const i = k < 0 ? 3 : k;
  if (hL <= 0.5) return low[i];
  if (hL >= 1) return high[i];
  return lerp(hL, 0.5, 1, low[i], high[i]);
}

// Cubierta a dos aguas con viento normal a la cumbrera. h/L = altura (de alero si θ ≤ 10°, media si no) sobre la dimensión paralela al viento.
export function roofCp({ theta, hL, x = 0, h = 1 }) {
  if (theta < 10) {                                                            // la tabla manda usar la franja por distancia (como paralelo a la cumbrera)
    const c = roofZoneCp(x, h, hL);
    return { windward: { neg: c, pos: 0 }, leeward: roofZoneCp(x + 1e-6 + 2 * h, h, hL), zones: true };
  }
  const hl = Math.min(Math.max(hL, 0.25), 1);
  return {
    windward: { neg: bilinear(WIND_NEG, theta, hl), pos: theta > 60 ? 0.01 * theta : bilinear(WIND_POS, theta, hl) },
    leeward: interp(HL, LEE.rows.map((r) => interp(LEE.th, r, theta)), hl),
    zones: false,
  };
}

// ---------------------------------------------------------------- nave: presiones de diseño sobre el pórtico transversal
// A: ancho del frente (luz del pórtico), B: largo, H: altura de aleros, theta (°): pendiente de la cubierta.
export function naveWind({ A, B, H, theta, V, exposure = 'B', caso = 1, Kzt = 1, Kd = 0.85, I = 1, G = 0.85, enclosure = 'partial', xFrame = 0 }) {
  const f = (A / 2) * Math.tan(theta * Math.PI / 180);
  const hMean = theta <= 10 ? H : H + f / 2;                                   // altura de referencia de la cubierta (art. de la Figura 3)
  const hq = H + f / 2;                                                        // altura media de la cubierta para qh
  const Kz = kzOf(hq, exposure, caso);
  const q = dynamicPressure({ V, Kz, Kzt, Kd, I });
  const gcpi = ENCLOSURES[enclosure][1];
  const base = { A, B, H, theta, f, hq, hMean, V, exposure, caso, Kz, Kzt, Kd, I, G, q, gcpi, enclosure };
  const P = (cp, gi) => q * (G * cp - gi);
  const signs = gcpi > 0 ? [gcpi, -gcpi] : [0];
  // viento sobre el lateral: normal a la cumbrera, L (paralela al viento) = A, B (normal) = B
  const LB = A / B;
  const roof = roofCp({ theta, hL: hMean / A, x: 0, h: hMean });
  const lateral = signs.map((gi) => {
    const roofOpts = [{ id: 'neg', cp: roof.windward.neg }];
    if (!roof.zones && roof.windward.pos > 1e-9) roofOpts.push({ id: 'pos', cp: roof.windward.pos });
    return roofOpts.map((ro) => ({
      id: `L${gi >= 0 ? '+' : '−'}${ro.id}`, gcpi: gi, roofOption: ro.id,
      wallWindward: { cp: wallCp.windward, p: P(wallCp.windward, gi) },
      roofWindward: { cp: ro.cp, p: P(ro.cp, gi) },
      roofLeeward: { cp: roof.leeward, p: P(roof.leeward, gi) },
      wallLeeward: { cp: wallCp.leeward(LB), p: P(wallCp.leeward(LB), gi) },
    }));
  }).flat();
  // viento sobre el frente: paralelo a la cumbrera, L = B, B = A. El pórtico se carga con la succión de la cubierta según su distancia al frente
  const hLf = hMean / B;
  const cpRoofF = roofZoneCp(xFrame, hMean, hLf);
  const frontal = signs.map((gi) => ({
    id: `F${gi >= 0 ? '+' : '−'}`, gcpi: gi,
    roof: { cp: cpRoofF, p: P(cpRoofF, gi) }, side: { cp: wallCp.side, p: P(wallCp.side, gi) },
    wallFront: { cp: wallCp.windward, p: P(wallCp.windward, gi) }, wallBack: { cp: wallCp.leeward(B / A), p: P(wallCp.leeward(B / A), gi) },
  }));
  return { ...base, lateral, frontal, roofCpInfo: roof };
}

// ---------------------------------------------------------------- cubiertas abovedadas (Tabla 8): arco parabólico
// r = flecha / luz. elevated: la cubierta arranca sobre una estructura elevada (columnas) o a nivel del terreno. Para 0,2 ≤ r < 0,3 en el cuarto a
// barlovento también debe usarse el valor alternativo 6 r − 2,1 (devuelve las dos opciones).
export function archRoofCp(r, elevated = true) {
  const center = -0.7 - r;
  const lee = -0.5;
  let ww;
  if (!elevated) ww = [1.4 * r];
  else if (r < 0.2) ww = [-0.9];
  else if (r < 0.3) ww = [1.5 * r - 0.3, 6 * r - 2.1];
  else ww = [2.75 * r - 0.7];
  return { windward: ww, center, leeward: lee };
}

// Viento sobre una nave con cubierta en arco parabólico (arco de luz A y flecha f sobre columnas de altura H). Viento transversal (normal al eje de la bóveda):
// cuarto a barlovento, mitad central y cuarto a sotavento (Tabla 8) y paredes con Cp de la Figura 3. Viento paralelo al eje: Cp por distancia al borde.
export function archWind({ A, B, H, f, V, exposure = 'B', caso = 1, Kzt = 1, Kd = 0.85, I = 1, G = 0.85, enclosure = 'partial', xFrame = 0 }) {
  const hq = H + 2 * f / 3;                                                    // altura media de la cubierta (media de la parábola)
  const Kz = kzOf(hq, exposure, caso);
  const q = dynamicPressure({ V, Kz, Kzt, Kd, I });
  const gcpi = ENCLOSURES[enclosure][1];
  const P = (cp, gi) => q * (G * cp - gi);
  const signs = gcpi > 0 ? [gcpi, -gcpi] : [0];
  const r = f / A;
  const elevated = H > 0;
  const cp = archRoofCp(r, elevated);
  const LB = A / B;
  const lateral = [];
  signs.forEach((gi) => {
    cp.windward.forEach((cw, k) => {
      lateral.push({ id: `L${gi >= 0 ? '+' : '−'}${k ? 'alt' : ''}`, gcpi: gi, alt: k > 0,
        wallWindward: { cp: wallCp.windward, p: P(wallCp.windward, gi) }, quarterWindward: { cp: cw, p: P(cw, gi) }, center: { cp: cp.center, p: P(cp.center, gi) },
        quarterLeeward: { cp: cp.leeward, p: P(cp.leeward, gi) }, wallLeeward: { cp: wallCp.leeward(LB), p: P(wallCp.leeward(LB), gi) } });
    });
  });
  const hL = hq / B;
  const cpF = roofZoneCp(xFrame, hq, hL);
  const frontal = signs.map((gi) => ({ id: `F${gi >= 0 ? '+' : '−'}`, gcpi: gi, roof: { cp: cpF, p: P(cpF, gi) }, side: { cp: wallCp.side, p: P(wallCp.side, gi) } }));
  return { A, B, H, f, r, elevated, hq, Kz, Kzt, Kd, I, V, exposure, caso, G, q, gcpi, enclosure, lateral, frontal, archCp: cp };
}
