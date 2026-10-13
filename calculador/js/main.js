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
}));

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
