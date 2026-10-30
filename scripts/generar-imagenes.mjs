// 🖼️ Genera las imágenes y páginas para compartir (se corre con: node scripts/generar-imagenes.mjs)
//  · iconos/icono-192.png, iconos/icono-512.png, iconos/icono-maskable-512.png (para instalar el juego como app)
//  · og.png (1200×630: la imagen que se ve cuando compartes el link del juego)
//  · logros/<id>.png y logros/<id>.html (una por logro: el link para compartir un logro, con su propia imagen)
// Todo se dibuja con números (sin programas ni librerías): un "lienzo" de píxeles, figuras simples y una letra de píxeles.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ACHIEVEMENTS } from '../src/logic.js';
import { OFICIAL } from '../src/red.js';

const RAIZ = new URL('..', import.meta.url).pathname;

// ---------- Un lienzo de píxeles (RGBA) ----------
function lienzo(w, h) {
  const px = new Uint8Array(w * h * 4);
  const pon = (x, y, [r, g, b, a = 255]) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4, k = a / 255;
    px[i] = px[i] * (1 - k) + r * k; px[i + 1] = px[i + 1] * (1 - k) + g * k; px[i + 2] = px[i + 2] * (1 - k) + b * k; px[i + 3] = Math.max(px[i + 3], a);
  };
  const L = {
    w, h, px, pon,
    rect(x, y, ww, hh, c) { for (let j = Math.max(0, y | 0); j < Math.min(h, y + hh); j++) for (let i = Math.max(0, x | 0); i < Math.min(w, x + ww); i++) pon(i, j, c); },
    // un rectángulo con las puntas redondeadas
    redondo(x, y, ww, hh, r, c) { for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) { const dx = Math.max(x + r - i, 0, i - (x + ww - r - 1)), dy = Math.max(y + r - j, 0, j - (y + hh - r - 1)); if (dx * dx + dy * dy <= r * r) pon(i, j, c); } },
    circulo(cx, cy, r, c) { for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) pon(i, j, c); },
    // degradado de arriba (c1) hacia abajo (c2)
    degradado(y0, y1, c1, c2) { for (let j = y0; j < y1; j++) { const k = (j - y0) / Math.max(1, y1 - y0 - 1); L.rect(0, j, w, 1, c1.map((v, n) => Math.round(v + (c2[n] - v) * k))); } },
  };
  return L;
}
// ---------- Guardar como PNG (el formato de siempre: firma + bloques IHDR, IDAT comprimido, IEND) ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function bloque(tipo, datos) {
  const t = Buffer.from(tipo, 'ascii'), largo = Buffer.alloc(4), crc = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([largo, t, datos, crc]);
}
function png(L) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(L.w, 0); ihdr.writeUInt32BE(L.h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  const filas = Buffer.alloc((L.w * 4 + 1) * L.h);
  for (let y = 0; y < L.h; y++) { filas[y * (L.w * 4 + 1)] = 0; Buffer.from(L.px.buffer, y * L.w * 4, L.w * 4).copy(filas, y * (L.w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', deflateSync(filas, { level: 9 })), bloque('IEND', Buffer.alloc(0))]);
}

// ---------- La letra de píxeles (5 × 7, en mayúsculas; las tildes van arriba) ----------
const LETRAS = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10001 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100', ' ': '00000 00000 00000 00000 00000 00000 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '¡': '00100 00000 00100 00100 00100 00100 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  '¿': '00100 00000 00100 01000 10000 10001 01110', '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000', '-': '00000 00000 00000 11111 00000 00000 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
};
const TILDES = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U', 'Ñ': 'N' };
const glifo = ch => (LETRAS[ch] || LETRAS[TILDES[ch]] || LETRAS['?']).split(' ');
// Escribe el texto con píxeles de tamaño t. Devuelve el ancho. centrado: x es el centro
function texto(L, str, x, y, t, color, { centrado = false, sombra = null } = {}) {
  const s = str.toUpperCase(), ancho = s.length * 6 * t - t;
  let cx = centrado ? Math.round(x - ancho / 2) : x;
  for (const ch of s) {
    const filas = glifo(ch);
    const dibujar = (dx, dy, c) => {
      filas.forEach((fila, j) => [...fila].forEach((b, i) => { if (b === '1') L.rect(cx + i * t + dx, y + j * t + dy, t, t, c); }));
      if (TILDES[ch]) { if (ch === 'Ñ') L.rect(cx + t + dx, y - 2 * t + dy, 3 * t, t, c); else if (ch === 'Ü') { L.rect(cx + t + dx, y - 2 * t + dy, t, t, c); L.rect(cx + 3 * t + dx, y - 2 * t + dy, t, t, c); } else { L.rect(cx + 2 * t + dx, y - 2 * t + dy, t, t, c); L.rect(cx + 3 * t + dx, y - 3 * t + dy, t, t, c); } }
    };
    if (sombra) dibujar(t, t, sombra);
    dibujar(0, 0, color);
    cx += 6 * t;
  }
  return ancho;
}
// Parte un texto en renglones que quepan en "max" letras
function renglones(str, max) {
  const out = []; let r = '';
  for (const p of str.split(' ')) { if ((r + ' ' + p).trim().length > max) { if (r) out.push(r); r = p; } else r = (r + ' ' + p).trim(); }
  if (r) out.push(r); return out;
}

// ---------- Los dibujos ----------
const VERDE = [47, 174, 78], VERDE_OSCURO = [13, 90, 34], CIELO = [140, 210, 245], CIELO2 = [214, 240, 250], PASTO = [90, 166, 54], PASTO2 = [70, 140, 40];
// El personaje: el rectángulo verde con sus dos ojos (x, y: arriba a la izquierda; a: ancho)
function personaje(L, x, y, a) {
  const h = a * 2;
  L.redondo(x + a * 0.08, y + a * 0.08, a, h, Math.round(a * 0.08), [0, 0, 0, 70]);   // sombrita
  L.redondo(x, y, a, h, Math.round(a * 0.08), VERDE);
  L.rect(x + a * 0.08, y + a * 0.06, a * 0.2, h * 0.88, [255, 255, 255, 40]);       // brillo
  for (const ox of [0.3, 0.7]) { L.circulo(x + a * ox, y + h * 0.22, a * 0.11, [255, 255, 255]); L.circulo(x + a * ox, y + h * 0.22, a * 0.07, [20, 20, 20]); }
}
function arbol(L, x, suelo, r) {
  L.rect(x - r * 0.12, suelo - r * 1.2, r * 0.24, r * 1.2, [122, 75, 42]);
  L.circulo(x, suelo - r * 1.6, r, [47, 143, 58]); L.circulo(x - r * 0.6, suelo - r * 1.25, r * 0.65, [58, 163, 70]); L.circulo(x + r * 0.55, suelo - r * 1.3, r * 0.6, [58, 163, 70]);
}
function moneda(L, x, y, r) { L.circulo(x, y, r, [255, 200, 30]); L.circulo(x, y, r * 0.72, [255, 225, 90]); L.rect(x - r * 0.12, y - r * 0.45, r * 0.24, r * 0.9, [230, 170, 20]); }
function paisaje(L) {
  L.degradado(0, Math.round(L.h * 0.7), CIELO, CIELO2);
  L.circulo(L.w * 0.9, L.h * 0.42, L.h * 0.08, [255, 236, 140]);   // el sol
  for (const [cx, cy, r] of [[0.12, 0.42, 0.05], [0.19, 0.41, 0.065], [0.7, 0.45, 0.04], [0.76, 0.44, 0.05]]) L.circulo(L.w * cx, L.h * cy, L.h * r, [255, 255, 255, 230]);   // nubes
  L.degradado(Math.round(L.h * 0.7), L.h, PASTO, PASTO2);
}
function trofeo(L, cx, cy, s) {
  const oro = [255, 196, 30], oro2 = [230, 160, 10];
  L.redondo(cx - s * 0.45, cy - s * 0.6, s * 0.9, s * 0.7, Math.round(s * 0.2), oro);       // la copa
  for (const lado of [-1, 1]) { L.circulo(cx + lado * s * 0.5, cy - s * 0.35, s * 0.18, oro2); L.circulo(cx + lado * s * 0.5, cy - s * 0.35, s * 0.09, [244, 248, 250]); }   // las asas
  L.rect(cx - s * 0.08, cy + s * 0.08, s * 0.16, s * 0.25, oro2);                           // el pie
  L.redondo(cx - s * 0.32, cy + s * 0.3, s * 0.64, s * 0.16, 6, [140, 90, 40]);              // la base
  L.rect(cx - s * 0.3, cy - s * 0.5, s * 0.12, s * 0.45, [255, 255, 255, 90]);               // brillo
}

const archivos = [];
const guardar = (ruta, datos) => { const r = RAIZ + ruta; mkdirSync(r.slice(0, r.lastIndexOf('/')), { recursive: true }); writeFileSync(r, datos); archivos.push(ruta); };

// Íconos: el personaje sobre el cielo (el "maskable" deja más margen: algunos celulares recortan un círculo)
for (const [nombre, n, margen] of [['icono-192', 192, 0.18], ['icono-512', 512, 0.18], ['icono-maskable-512', 512, 0.3]]) {
  const L = lienzo(n, n); L.degradado(0, n, CIELO, [255, 255, 255]); L.rect(0, Math.round(n * 0.78), n, n, PASTO);
  const a = Math.round(n * (1 - 2 * margen) / 2.1); personaje(L, Math.round(n / 2 - a / 2), Math.round(n * margen), a);
  guardar(`iconos/${nombre}.png`, png(L));
}
// La imagen del juego para compartir (1200 × 630)
{
  const L = lienzo(1200, 630); paisaje(L);
  for (const [x, r] of [[90, 60], [250, 45], [960, 55], [1110, 70]]) arbol(L, x, 470, r);
  for (const [x, y] of [[300, 520], [870, 545], [180, 560], [1000, 590]]) moneda(L, x, y, 18);
  personaje(L, 545, 250, 110);
  L.redondo(70, 40, 1060, 130, 26, [16, 48, 31, 190]);   // la franja oscura detrás del título (así se lee bien)
  texto(L, 'RECTÁNGULO VERDE', 600, 72, 10, [255, 255, 255], { centrado: true, sombra: [47, 174, 78] });
  texto(L, '¡JUEGA GRATIS CON TUS AMIGOS!', 600, 196, 5, [16, 48, 31], { centrado: true });
  guardar('og.png', png(L));
}
// Un logro: imagen + página para compartir
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const a of ACHIEVEMENTS) {
  const L = lienzo(1200, 630); paisaje(L);
  L.redondo(120, 110, 960, 420, 30, [255, 255, 255, 215]);
  trofeo(L, 300, 330, 240);
  texto(L, '¡LOGRO!', 470, 160, 8, [201, 138, 0], { sombra: [120, 80, 0] });
  // (que todo quepa en la tarjeta: hasta 12 letras por renglón el nombre y 19 la descripción)
  const lineas = renglones(a.name, 12); lineas.slice(0, 2).forEach((r, i) => texto(L, r, 470, 255 + i * 72, 8, VERDE, { sombra: VERDE_OSCURO }));
  renglones(a.desc, 19).slice(0, 3).forEach((r, i) => texto(L, r, 470, 255 + Math.min(2, lineas.length) * 72 + 12 + i * 56, 5, [60, 80, 70]));
  texto(L, 'RECTÁNGULO VERDE', 600, 570, 4, [255, 255, 255], { centrado: true, sombra: VERDE_OSCURO });
  guardar(`logros/${a.id}.png`, png(L));
  const titulo = `🏆 ¡Logro "${a.name}" en Rectángulo Verde!`, desc = `${a.desc}. ¡Juega gratis con tus amigos!`, url = `${OFICIAL}logros/${a.id}.html`;
  guardar(`logros/${a.id}.html`, `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rectángulo Verde">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OFICIAL}logros/${a.id}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Trofeo del logro ${esc(a.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${OFICIAL}logros/${a.id}.png">
<meta name="theme-color" content="#2fae4e">
<link rel="icon" href="../iconos/icono-192.png">
<meta http-equiv="refresh" content="0; url=../?logro=${encodeURIComponent(a.id)}">
</head>
<body style="font-family:system-ui,sans-serif;background:#bfe3f2;color:#16301f;text-align:center;padding:40px">
<!-- Esta página es para que el link se vea lindo al compartirlo. Las personas pasan directo al juego. -->
<p>🏆 ${esc(a.name)}</p>
<p><a href="../?logro=${encodeURIComponent(a.id)}">Ir a jugar Rectángulo Verde</a></p>
<script>location.replace('../?logro=' + encodeURIComponent(${JSON.stringify(a.id)}));</script>
</body>
</html>
`);
}
console.log(`✅ ${archivos.length} archivos:`, archivos.join(', '));
