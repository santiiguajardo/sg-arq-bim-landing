export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function formatDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekISO(iso) {
  const d = new Date((iso || todayPlus(0)) + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function isDateInRange(iso, startIso, endIso) {
  return iso >= startIso && iso <= endIso;
}

export function lastNDaysRange(n) {
  const end = todayPlus(0);
  const start = todayPlus(-(n - 1));
  return { start, end };
}

export function sumWhere(arr, startIso, endIso, key) {
  return arr
    .filter((m) => isDateInRange(m.date, startIso, endIso))
    .reduce((acc, m) => acc + (Number(m.values?.[key]) || 0), 0);
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function money(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function openModal(innerHtml, onMount) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'activeModal';
  backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop);
}

export function closeModal() {
  const existing = document.getElementById('activeModal');
  if (existing) existing.remove();
}

// Reemplaza al confirm() nativo del navegador: en este entorno los diálogos nativos
// (confirm/alert) quedan suprimidos y confirm() devuelve false sin preguntar nada,
// haciendo que botones de "Eliminar" parezcan no hacer nada. Este modal cumple la
// misma función sin depender de diálogos nativos.
export function confirmAction(message, onConfirm, { title = 'Confirmar', confirmLabel = 'Eliminar', danger = true } = {}) {
  openModal(`
    <h2>${escapeHtml(title)}</h2>
    <p>${message}</p>
    <div class="modal-actions">
      <button type="button" class="btn" id="cancelConfirmBtn">Cancelar</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmActionBtn">${escapeHtml(confirmLabel)}</button>
    </div>
  `, (backdrop) => {
    backdrop.querySelector('#cancelConfirmBtn').addEventListener('click', closeModal);
    backdrop.querySelector('#confirmActionBtn').addEventListener('click', () => {
      onConfirm();
      closeModal();
    });
  });
}

// Las obras guardan fotos y videos en la misma lista (`images`); un video se reconoce por la
// extensión. Su miniatura es un JPG con el mismo nombre y ".poster" antes de la extensión.
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
export function isVideoPath(src) {
  return typeof src === 'string' && VIDEO_RE.test(src);
}
export function videoPosterPath(src) {
  return String(src).replace(/\.[a-z0-9]+$/i, '.poster.jpg');
}

// Saca un cuadro del video como JPG (data URL) para usarlo de miniatura/portada.
export function captureVideoPoster(file, maxW = 1000) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const fail = (msg) => { URL.revokeObjectURL(url); reject(new Error(msg)); };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onerror = () => fail('Este navegador no puede leer ese video (¿está en H.265/HEVC?). Exportalo como MP4 H.264.');
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked = () => {
      const scale = Math.min(1, maxW / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    video.src = url;
  });
}

// Achica y comprime una imagen antes de subirla al servidor -- así una foto de
// celular de 5-8 MB no tarda en subir ni infla el disco sin necesidad.
export function resizeImageFile(file, maxW = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Generador de ZIP minimalista (metodo "store", sin compresion) sin dependencias
// externas -- alcanza para agrupar varias imagenes/videos en una sola descarga
// que Windows abre como carpeta comprimida normal.
let crc32Table = null;
function crc32(bytes) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32Table[n] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

export async function createZip(entries) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1F);
  const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0xF) << 5) | (now.getDate() & 0x1F);

  const fileParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, 20, 0, 0, 0, 0, 0,
      ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), 0, 0,
    ]);
    fileParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0,
      ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), 0, 0, 0, 0, 0, 0, 0, 0, ...u32(0), ...u32(offset),
    ]);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0,
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralStart), 0, 0,
  ]);

  return new Blob([...fileParts, ...centralParts, eocd], { type: 'application/zip' });
}

export function downloadBlobUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadCanvas(canvas, filename, type = 'image/png', quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      downloadBlobUrl(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve();
    }, type, quality);
  });
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar ' + src));
    img.src = src;
  });
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Simple SVG line chart for one or more series over a list of date labels.
// series: [{ label, color, points: [{x: iso, y: number|null}] }]
export function svgLineChart({ dates, series, height = 160, width = 560 }) {
  const pad = { top: 14, right: 14, bottom: 24, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const allValues = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v !== null && v !== undefined);
  const maxV = Math.max(1, ...allValues);
  const minV = Math.min(0, ...allValues);
  const n = dates.length;
  const xFor = (i) => pad.left + (n <= 1 ? 0 : (innerW * i) / (n - 1));
  const yFor = (v) => pad.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const gridLines = [0, 0.5, 1].map((f) => {
    const y = pad.top + innerH * f;
    const val = Math.round(maxV - (maxV - minV) * f);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--line, #e4e6ea)" stroke-width="1" />
      <text x="${pad.left - 8}" y="${y + 3}" font-size="9" text-anchor="end" fill="#8a8f99">${val}</text>`;
  }).join('');

  const xLabels = dates.map((d, i) => {
    if (n > 10 && i % Math.ceil(n / 6) !== 0) return '';
    return `<text x="${xFor(i)}" y="${height - 6}" font-size="9" text-anchor="middle" fill="#8a8f99">${formatDateShort(d)}</text>`;
  }).join('');

  const paths = series.map((s) => {
    const pts = s.points.filter((p) => p.y !== null && p.y !== undefined);
    if (pts.length === 0) return '';
    const d = s.points.map((p, i) => {
      if (p.y === null || p.y === undefined) return null;
      return `${xFor(i)},${yFor(p.y)}`;
    }).filter(Boolean).join(' ');
    const line = `<polyline points="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
    const dots = s.points.map((p, i) => {
      if (p.y === null || p.y === undefined) return '';
      return `<circle cx="${xFor(i)}" cy="${yFor(p.y)}" r="2.5" fill="${s.color}" />`;
    }).join('');
    return line + dots;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">
    ${gridLines}
    ${paths}
    ${xLabels}
  </svg>`;
}

export function svgBarChart({ dates, values, color = 'var(--accent)', height = 140, width = 560, tooltips = false }) {
  const pad = { top: 10, right: 10, bottom: 22, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxV = Math.max(1, ...values);
  const n = values.length;
  const gap = 4;
  const barW = n > 0 ? Math.max(2, innerW / n - gap) : 0;

  const bars = values.map((v, i) => {
    const h = (v / maxV) * innerH;
    const x = pad.left + (innerW / n) * i + gap / 2;
    const y = pad.top + innerH - h;
    const label = `${formatDateShort(dates[i])}: ${v}`;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, v > 0 ? 2 : 0)}" rx="3" fill="${color}">${tooltips ? '' : `<title>${escapeHtml(label)}</title>`}</rect>`;
  }).join('');

  // Con tooltips propios: una franja transparente por columna (ocupa todo el alto, así
  // se puede pasar el mouse aunque la barra sea baja o el día tenga 0 visitas).
  const hits = tooltips ? values.map((v, i) => {
    const x = pad.left + (innerW / n) * i;
    const day = new Date(dates[i] + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<rect class="bar-hit" x="${x}" y="${pad.top}" width="${innerW / n}" height="${innerH}" fill="transparent" style="cursor:pointer;" data-tip="${escapeHtml(day)}|${v}"></rect>`;
  }).join('') : '';

  const xLabels = dates.map((d, i) => {
    if (n > 10 && i % Math.ceil(n / 6) !== 0) return '';
    const x = pad.left + (innerW / n) * i + (innerW / n) / 2;
    return `<text x="${x}" y="${height - 6}" font-size="9" text-anchor="middle" fill="#8a8f99">${formatDateShort(d)}</text>`;
  }).join('');

  const baseline = `<line x1="${pad.left}" y1="${pad.top + innerH}" x2="${pad.left + innerW}" y2="${pad.top + innerH}" stroke="#e4e6eb" stroke-width="1" />`;
  const maxLabel = `<text x="${pad.left}" y="${pad.top + 8}" font-size="9" fill="#8a8f99">${maxV}</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">
    ${maxLabel}
    ${baseline}
    ${bars}
    ${xLabels}
    ${hits}
  </svg>`;
}
