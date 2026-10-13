// Bases aisladas (zapatas) de hormigón armado bajo carga axial centrada, según CIRSOC 201-2005, Cap. 15 y 11.12.
// Unidades internas: N, mm, MPa. Las tensiones del suelo se manejan en MPa (1 kg/cm2 = 0,0980665 MPa).
import { CIRSOC201 as N } from './norms.js';
import { barArea, flexureDesign, asMinSlab, floorTo, ceilTo } from './rc.js';

const nf = (x, dec = 1) => Number(x).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Criterio constructivo (no es un requisito del reglamento): no se ofrecen barras de base separadas menos de 10 cm.
const FOOTING_MIN_PRACTICAL_SPACING = 100;
export const FOOTING_COVER = 50;            // mm, Tabla 7.7.1 (a): hormigón sobre la capa de hormigón de limpieza
export const SOIL_UNIT_WEIGHTS = [          // CIRSOC 101-2005, Tabla 3.2, suelo no sumergido (kN/m3)
  { id: 'arcilla-seca', label: 'Arcilla, seca', value: 9.9 },
  { id: 'arcilla-humeda', label: 'Arcilla, húmeda', value: 17.3 },
  { id: 'arcilla-grava', label: 'Arcilla y grava, seca', value: 15.7 },
  { id: 'arena-suelta', label: 'Arena y grava, seca, suelta', value: 15.7 },
  { id: 'arena-densa', label: 'Arena y grava, seca, densa', value: 17.3 },
  { id: 'arena-humeda', label: 'Arena y grava, húmeda', value: 18.9 },
  { id: 'limo-poco', label: 'Limo, húmedo y poco compacto', value: 12.3 },
  { id: 'limo-compacto', label: 'Limo, húmedo y compacto', value: 15.1 },
  { id: 'limo-muy', label: 'Limo, muy húmedo', value: 17 },
];

// Longitud de anclaje de barras conformadas traccionadas (art. 12.2.1 y 12.2.2), con ψt = ψe = λ = 1 (barras
// inferiores de zapata, sin recubrimiento epoxi, hormigón de peso normal).
export function developmentLength({ db, fy, fc, clearSpacing, cover }) {
  const good = clearSpacing >= 2 * db && cover >= db;
  const k = db <= 16 ? (good ? 12 / 25 : 18 / 25) : (good ? 3 / 5 : 9 / 10);
  return Math.max(300, k * fy / Math.sqrt(fc) * db);
}

export function barLayout({ AsReq, width, db, sMaxAbs, cover = FOOTING_COVER }) {
  const Ab = barArea(db);
  const n0 = Math.max(2, Math.ceil(AsReq / Ab));
  for (let n = n0; n < 400; n++) {
    const s = (width - 2 * cover - db) / (n - 1);
    if (s <= sMaxAbs) return s >= FOOTING_MIN_PRACTICAL_SPACING ? { n, s: floorTo(s, 5), As: n * Ab, Ab } : null;
  }
  return null;
}

// input: { PD, PL (N, de servicio), bc, hc (mm), fc, fy, sigma (MPa), gammaSoil (kN/m3), Df (mm), ratio (L/B >= 1) }
export function designFooting(input) {
  const { PD, PL, bc, hc, fc, fy, sigma, gammaSoil, Df } = input;
  const ratio = Math.max(1, Number(input.ratio) || 1);
  const Ps = PD + PL;
  const Pu = 1.2 * PD + 1.6 * PL;
  const res = { Ps, Pu, checks: [] };
  if (!(Ps > 0) || !(sigma > 0)) return { ...res, ok: false, reason: 'Ingresá la carga y la tensión admisible del suelo.' };

  for (let h = 300; h <= 2000; h += 50) {
    const wFooting = N.gammaRC * h / 1e6;                       // N/mm2 (kN/m2 * 1e-3)
    const wSoil = gammaSoil * Math.max(0, Df - h) / 1e6;
    const qNet = sigma - (wFooting + wSoil);                     // MPa
    if (qNet <= 0) return { ...res, ok: false, reason: 'La tensión admisible no alcanza ni para el peso de la base y del suelo: revisá la profundidad o el suelo.' };
    const Areq = Ps / qNet;
    const L0 = ceilTo(Math.sqrt(Areq * ratio), 50);
    const B0 = ratio === 1 ? L0 : ceilTo(Areq / L0, 50);
    // Si la planta que da la tensión del suelo no alcanza (por ejemplo para el anclaje), se agranda de a 5 cm.
    for (let grow = 0; grow <= 10; grow++) {
    const L = L0 + 50 * grow;
    const B = B0 + 50 * grow;
    if (B < bc + 100 || L < hc + 100) continue;
    const qu = Pu / (B * L);
    const lL = (L - hc) / 2;
    const lB = (B - bc) / 2;
    for (const db of [10, 12, 16, 20, 25]) {
      const dL = h - FOOTING_COVER - db / 2;                     // barras paralelas a L (capa inferior)
      const dB = h - FOOTING_COVER - 1.5 * db;                   // barras paralelas a B (sobre las anteriores)
      if (dL < 150) continue;                                     // art. 15.7
      const dSh = dB;                                             // altura útil para corte y punzonado (la menor)
      // flexión en la cara de la columna (art. 15.4.2.a)
      const MuL = qu * B * lL ** 2 / 2;
      const MuB = qu * L * lB ** 2 / 2;
      const fL = flexureDesign({ Mu: MuL, b: B, d: dL, fc, fy });
      const fB = flexureDesign({ Mu: MuB, b: L, d: dB, fc, fy });
      if (!fL.ok || !fB.ok) continue;
      const asMinL = asMinSlab({ b: B, h });                      // art. 10.5.4 y 7.12.2.1
      const asMinB = asMinSlab({ b: L, h });
      const AsL = Math.max(fL.As, asMinL);
      const AsB = Math.max(fB.As, asMinB);
      const sMaxAbs = Math.min(2.5 * h, 25 * db, 300);            // art. 7.6.5 (art. 10.5.4)
      const layL = barLayout({ AsReq: AsL, width: B, db, sMaxAbs });
      const beta = L / B;
      const gammaS = 2 / (beta + 1);                              // ec. (15-1)
      const layBc = barLayout({ AsReq: gammaS * AsB, width: B, db, sMaxAbs });   // faja central de ancho B
      if (!layL || !layBc) continue;
      const outsideBars = Math.max(0, Math.ceil((1 - gammaS) * AsB / barArea(db)));
      // corte como viga a d de la cara (art. 11.12.1.1 y 11.1.3.1)
      const sqrtFc = Math.min(Math.sqrt(fc), N.maxSqrtFcShear);
      const VuL = qu * B * (lL - dSh);
      const VuB = qu * L * (lB - dSh);
      const phiVcL = N.phiShear * sqrtFc / 6 * B * dSh;
      const phiVcB = N.phiShear * sqrtFc / 6 * L * dSh;
      // punzonado a d/2 de la cara (art. 11.12.1.2 y 11.12.2.1)
      const bo = 2 * (bc + dSh) + 2 * (hc + dSh);
      const VuP = Pu - qu * (bc + dSh) * (hc + dSh);
      const betaC = Math.max(bc, hc) / Math.min(bc, hc);
      const vcA = (1 + 2 / betaC) * sqrtFc / 6;
      const vcB2 = (40 * dSh / bo + 2) * sqrtFc / 12;
      const vcC = sqrtFc / 3;
      const phiVcP = N.phiShear * Math.min(vcA, vcB2, vcC) * bo * dSh;
      // anclaje (art. 12.2)
      const clearL = layL.s - db;
      const ldStraightL = developmentLength({ db, fy, fc, clearSpacing: clearL, cover: FOOTING_COVER });
      const ldStraightB = developmentLength({ db, fy, fc, clearSpacing: layBc.s - db, cover: FOOTING_COVER });
      const availL = lL - FOOTING_COVER;
      const availB = lB - FOOTING_COVER;
      // Si la barra recta no entra, se usa gancho a 90° (art. 12.5.1 y 12.5.2): ℓdh = 0,24 fy / √f'c · db ≥ 8 db y 150 mm.
      const ldh = Math.max(0.24 * fy / Math.sqrt(fc) * db, 8 * db, 150);
      const hookFits = (h - FOOTING_COVER - db) >= 12 * db;
      const useHook = ldStraightL > availL || ldStraightB > availB;
      const ldL = useHook ? ldh : ldStraightL;
      const ldB = useHook ? ldh : ldStraightB;
      // aplastamiento en la base de la columna (art. 10.17.1, φ = 0,65)
      const ratioA = Math.min(B / bc, L / hc) ** 2;
      const bearing = N.phiCompression * 0.85 * fc * bc * hc * Math.min(2, Math.sqrt(ratioA));
      const checks = [
        { id: 'soil', label: 'Tensión sobre el suelo', ok: (Ps + (wFooting + wSoil) * B * L) / (B * L) <= sigma + 1e-9, text: `${nf((Ps + (wFooting + wSoil) * B * L) / (B * L) * 1000, 0)} kPa ≤ ${nf(sigma * 1000, 0)} kPa (admisible)` },
        { id: 'flexL', label: 'Flexión (dirección L)', ok: true, text: `Mu = ${nf(MuL / 1e6, 1)} kN·m, As = ${nf(AsL, 0)} mm²` },
        { id: 'flexB', label: 'Flexión (dirección B)', ok: true, text: `Mu = ${nf(MuB / 1e6, 1)} kN·m, As = ${nf(AsB, 0)} mm²` },
        { id: 'shear', label: 'Corte como viga', ok: VuL <= phiVcL && VuB <= phiVcB, text: `Vu ${nf(Math.max(VuL, VuB) / 1000, 0)} kN ≤ φVc ${nf(Math.min(phiVcL, phiVcB) / 1000, 0)} kN` },
        { id: 'punch', label: 'Punzonado', ok: VuP <= phiVcP, text: `Vu = ${nf(VuP / 1000, 0)} kN ≤ φVc = ${nf(phiVcP / 1000, 0)} kN` },
        { id: 'dev', label: 'Anclaje de las barras', ok: ldL <= availL && ldB <= availB && (!useHook || hookFits), text: `${useHook ? 'con gancho a 90°: ℓdh' : 'barra recta: ℓd'} = ${nf(Math.max(ldL, ldB), 0)} mm ≤ disponible ${nf(Math.min(availL, availB), 0)} mm` },
        { id: 'bear', label: 'Aplastamiento', ok: Pu <= bearing, text: `Pu = ${nf(Pu / 1000, 0)} kN ≤ φPnb = ${nf(bearing / 1000, 0)} kN` },
      ];
      if (checks.every((c) => c.ok)) {
        const steelKg = ((layL.n * (L - 2 * FOOTING_COVER)) + (layBc.n * (B - 2 * FOOTING_COVER)) + (outsideBars * (B - 2 * FOOTING_COVER))) * barArea(db) * 7850 / 1e9;
        return {
          ...res, ok: true, B, L, h, db, qu, qNet, dL, dB, gammaS,
          layL, layB: layBc, outsideBars, hooks: useHook, AsL, AsB, MuL, MuB, VuL, VuB, VuP, phiVcP, phiVcL, phiVcB, bo, ldL, ldB, availL, availB, bearing,
          concrete: B * L * h / 1e9, steelKg, dowels: 0.005 * bc * hc, checks,
          wSelf: wFooting * B * L, wSoil: wSoil * B * L,
        };
      }
    }
    }
  }
  return { ...res, ok: false, reason: 'No se encontró una base que verifique hasta 2,00 m de altura: revisá la tensión admisible o las cargas.' };
}

export { floorTo, ceilTo };
