// Calculador estructural público de SG ARQ BIM: la misma pantalla de cálculo del panel, sin servidor ni cuentas.
import { getState, subscribe, addCalc } from './state.js';
import { renderStructural, makeCalc } from './views/structural.js';

const content = document.getElementById('content');
content.dataset.view = 'structural';

function render() {
  const raw = (location.hash || '#structural').slice(1);
  const params = new URLSearchParams(raw.split('?')[1] || '');
  const quick = document.getElementById('quickStart');
  if (quick) quick.hidden = Boolean(params.get('id'));
  content.innerHTML = '';
  renderStructural(content, getState(), params);
}

window.addEventListener('hashchange', render);
subscribe(render);

// Arranque rápido: crea un cálculo con los datos de ejemplo de la guía y lo abre.
document.querySelectorAll('[data-quick]').forEach((btn) => btn.addEventListener('click', () => {
  const [element, variant] = btn.dataset.quick.split(':');
  const id = addCalc(makeCalc({ name: btn.dataset.name || btn.textContent.trim(), element, variant: variant || '', projectId: null }));
  location.hash = `structural?id=${id}`;
  // la portada es alta: lleva la pantalla de cálculo a la vista (respeta "reducir movimiento")
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => content.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }), 80);
}));

// Tema claro / oscuro: la elección se recuerda en este navegador (no forma parte del historial de cálculos).
const THEME_KEY = 'sgCalcTema';
const themeBtn = document.getElementById('themeBtn');
function paintTheme() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  themeBtn.setAttribute('aria-pressed', String(light));
  themeBtn.setAttribute('aria-label', light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
}
if (themeBtn) {
  paintTheme();
  themeBtn.addEventListener('click', () => {
    const light = document.documentElement.getAttribute('data-theme') !== 'light';
    if (light) document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    try { if (light) localStorage.setItem(THEME_KEY, 'light'); else localStorage.removeItem(THEME_KEY); } catch (e) { /* sin almacenamiento: vale solo para esta visita */ }
    paintTheme();
  });
}

// Datos de contacto y del video: los escribe la publicación en config.json (si no está, la página funciona igual).
fetch('config.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((cfg) => {
  if (!cfg) return;
  const set = (sel, href) => document.querySelectorAll(sel).forEach((a) => { if (href) { a.href = href; a.hidden = false; } });
  set('[data-cfg-video]', cfg.videoUrl);
  set('[data-cfg-instagram]', cfg.instagram);
  set('[data-cfg-whatsapp]', cfg.whatsapp);
  set('[data-cfg-email]', cfg.email ? `mailto:${cfg.email}` : '');
}).catch(() => {});

render();
