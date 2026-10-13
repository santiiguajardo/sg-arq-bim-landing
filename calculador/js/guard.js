// Protecciones de la página pública del calculador (GitHub Pages no permite cabeceras HTTP):
// 1) no se deja embeber dentro de otro sitio (clickjacking) y 2) fuerza HTTPS.
(function () {
  try {
    if (window.top !== window.self && /^https?:$/.test(location.protocol)) {
      try { window.top.location.href = location.href; } catch (e) { document.documentElement.style.display = 'none'; }
    }
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    }
  } catch (e) { /* sin acceso: la política de contenido sigue protegiendo la página */ }
})();
