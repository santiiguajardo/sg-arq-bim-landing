// Estado del calculador estructural público (versión gratuita de la landing).
// Reemplaza a js/state.js del panel: no hay servidor, ni cuentas, ni sincronización. Los cálculos de cada visitante
// quedan solo en su navegador (localStorage) y nunca se envían a ningún lado.
const KEY = 'sgCalcPublico_v1';
const subs = new Set();

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && Array.isArray(p.calcs)) return { calcs: p.calcs, projects: [] };
  } catch (e) { /* sin almacenamiento o datos viejos: se empieza vacío */ }
  return { calcs: [], projects: [] };
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ calcs: state.calcs })); } catch (e) { /* modo privado o sin espacio: sigue funcionando sin guardar */ }
  subs.forEach((fn) => fn());
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const getState = () => state;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

export function addCalc(calc) {
  const id = uid();
  const now = new Date().toISOString();
  state.calcs.push({ id, ...calc, createdAt: now, updatedAt: now });
  save();
  return id;
}

// Cambia un campo anidado ("design.L", "section.b", "chosen"…) y guarda.
export function setCalcField(id, path, value) {
  const c = state.calcs.find((x) => x.id === id);
  if (!c) return;
  const keys = path.split('.');
  let o = c;
  for (const k of keys.slice(0, -1)) o = o[k] = o[k] || {};
  o[keys[keys.length - 1]] = value;
  c.updatedAt = new Date().toISOString();
  save();
}

export function duplicateCalc(id) {
  const c = state.calcs.find((x) => x.id === id);
  if (!c) return null;
  const copy = structuredClone(c);
  copy.name = `${c.name} (copia)`;
  delete copy.id;
  return addCalc(copy);
}

export function deleteCalc(id) {
  state.calcs = state.calcs.filter((x) => x.id !== id);
  save();
}
