// 📦 El "service worker": guarda el juego en la compu para que cargue rápido (y hasta sin internet).
// Reglas (simples y seguras, para que el juego SIEMPRE cargue la versión nueva):
//  · La página (index.html) se pide primero a internet; solo si no hay internet, se usa la guardada.
//  · Los archivos con versión (src/…js?v=…) y los íconos se usan de lo guardado (nunca cambian: cada versión tiene otra dirección).
//  · Nada más: ni el WebSocket de la sala, ni otros sitios, ni los links de Cloudflare.
// VERSION: la misma que src/version.js (un test lo revisa). Cuando cambia, este archivo cambia → la compu ve que hay versión nueva.
const VERSION = '2026-11-02-nave15';
const CACHE = 'rectangulo-verde-' + VERSION;
const GUARDAR = ['./', './index.html', './manifest.webmanifest', './iconos/icono-192.png', './iconos/icono-512.png',
  ...['logic', 'red', 'ia', 'version'].map(f => `./src/${f}.js?v=${VERSION}`)];

// Three.js (los gráficos) viene de otro sitio, pero con su versión en la dirección (r128): nunca cambia, así que también se guarda
const THREE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
self.addEventListener('install', e => {
  // (si algo falla al guardar, igual se instala: el juego sigue cargando desde internet)
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([c.addAll(GUARDAR), fetch(THREE_JS, { mode: 'no-cors' }).then(r => c.put(THREE_JS, r))])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rectangulo-verde-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// El botón "Actualizar" del juego le pide a la versión nueva que empiece ya
self.addEventListener('message', e => { if (e.data === 'ACTUALIZAR') self.skipWaiting(); });

const sirve = r => r && r.ok && r.type === 'basic' && !r.redirected;
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'GET' && req.url === THREE_JS) { e.respondWith(caches.match(THREE_JS).then(g => g || fetch(req))); return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/ws')) return;   // eso no se toca
  const esPagina = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (req.mode === 'navigate' && !esPagina) return;   // (otras páginas, como las de los logros: directo a internet)
  if (esPagina) {
    // Primero internet (así llega la versión nueva); si no hay, la guardada
    e.respondWith(fetch(req).then(r => {
      if (sirve(r) && !url.search) { const copia = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copia)).catch(() => {}); }
      return r;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')).then(r => r || Response.error())));
    return;
  }
  const fijo = url.searchParams.has('v') || url.pathname.includes('/iconos/') || url.pathname.endsWith('.webmanifest');
  if (!fijo) return;   // (lo demás: directo a internet, como siempre)
  e.respondWith(caches.match(req).then(g => g || fetch(req).then(r => {
    if (sirve(r)) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {}); }
    return r;
  })));
});
