// 📦 Prueba el service worker (sw.js) en un "navegador de mentira": cachés, internet (que se puede apagar) y eventos
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { VERSION } from '../src/version.js';

const CODIGO = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGEN = 'https://blackhol214.github.io', BASE = ORIGEN + '/rectangulo-verde/';
const THREE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// Un navegador de mentira
function navegador() {
  const almacen = new Map();   // nombre → Map(url → respuesta)
  const red = { encendida: true, pedidos: [], version: 'A' };
  const respuesta = (cuerpo, extra = {}) => ({ ok: true, type: 'basic', redirected: false, cuerpo, clone() { return respuesta(cuerpo, extra); }, ...extra });
  const url = x => (typeof x === 'string' ? new URL(x, BASE).href : x.url);
  const cacheDe = nombre => {
    if (!almacen.has(nombre)) almacen.set(nombre, new Map());
    const m = almacen.get(nombre);
    return { put: async (k, r) => { m.set(url(k), r); }, match: async k => m.get(url(k)), addAll: async ks => { for (const k of ks) m.set(url(k), await fetchFalso(url(k))); }, keys: async () => [...m.keys()].map(u => ({ url: u })) };
  };
  const caches = {
    open: async n => cacheDe(n), keys: async () => [...almacen.keys()], delete: async n => almacen.delete(n),
    match: async k => { for (const n of almacen.keys()) { const r = almacen.get(n).get(url(k)); if (r) return r; } return undefined; },
  };
  async function fetchFalso(x, opciones = {}) {
    const u = url(x); red.pedidos.push(u);
    if (!red.encendida) throw new TypeError('Failed to fetch (sin internet)');
    if (u === THREE_JS) return respuesta('three', { ok: false, type: 'opaque' });
    return respuesta(`${red.version}:${u}`);
  }
  const oyentes = {};
  const self = { location: new URL(BASE + 'sw.js'), addEventListener: (t, f) => { oyentes[t] = f; }, skipWaiting: () => { self.salto = true; }, clients: { claim: async () => { self.reclamo = true; } }, salto: false };
  const ctx = vm.createContext({ self, caches, fetch: fetchFalso, URL, Response: { error: () => ({ error: true }) }, Promise, console });
  vm.runInContext(CODIGO, ctx);
  // Simular un evento (install / activate / fetch / message): devuelve lo que respondió (o undefined si no se metió)
  async function evento(tipo, datos = {}) {
    let esperar = null, respondio;
    const e = { ...datos, waitUntil: p => { esperar = p; }, respondWith: p => { respondio = p; } };
    oyentes[tipo](e);
    if (esperar) await esperar;
    return respondio === undefined ? undefined : await respondio;
  }
  const pedido = (u, extra = {}) => ({ request: { url: url(u), method: 'GET', mode: 'cors', ...extra } });
  return { almacen, red, self, evento, pedido };
}

describe('📦 El service worker', () => {
  let N;
  beforeEach(() => { N = navegador(); });
  it('al instalarse guarda la página, el manifest, los íconos, los archivos de esta versión y Three.js', async () => {
    await N.evento('install');
    const guardado = [...N.almacen.get('rectangulo-verde-' + VERSION).keys()];
    for (const f of ['index.html', 'manifest.webmanifest', 'iconos/icono-192.png', `src/logic.js?v=${VERSION}`, `src/ia.js?v=${VERSION}`, `src/version.js?v=${VERSION}`]) expect(guardado).toContain(BASE + f);
    expect(guardado).toContain(THREE_JS);
    expect(N.self.salto).toBe(false);   // no se pone a mandar solo: espera al botón "Actualizar"
  });
  it('al activarse borra las cachés de versiones viejas (y nada más)', async () => {
    N.almacen.set('rectangulo-verde-vieja', new Map()); N.almacen.set('otra-cosa', new Map());
    await N.evento('install'); await N.evento('activate');
    expect([...N.almacen.keys()].sort()).toEqual(['otra-cosa', 'rectangulo-verde-' + VERSION]); expect(N.self.reclamo).toBe(true);
  });
  it('la página: primero internet (así llega la versión nueva); sin internet, la guardada', async () => {
    await N.evento('install');
    N.red.version = 'B';   // ¡salió una versión nueva!
    let r = await N.evento('fetch', N.pedido(BASE, { mode: 'navigate' }));
    expect(r.cuerpo).toBe('B:' + BASE);
    N.red.encendida = false;   // sin internet
    r = await N.evento('fetch', N.pedido(BASE, { mode: 'navigate' }));
    expect(r.cuerpo.startsWith('B:')).toBe(true);   // la última que vio (guardada)
    r = await N.evento('fetch', N.pedido(BASE + '?sala=abc-def', { mode: 'navigate' }));   // un link de sala, sin internet: igual carga el juego
    expect(r.cuerpo).toBeTruthy();
  });
  it('los archivos con versión (?v=) salen de lo guardado sin preguntar a internet; los nuevos se piden y se guardan', async () => {
    await N.evento('install'); N.red.pedidos.length = 0; N.red.encendida = false;
    const r = await N.evento('fetch', N.pedido(`src/logic.js?v=${VERSION}`));
    expect(r.cuerpo).toContain('logic.js'); expect(N.red.pedidos).toHaveLength(0);
    expect((await N.evento('fetch', N.pedido(THREE_JS))).cuerpo).toBe('three');   // Three.js también, sin internet
    N.red.encendida = true;
    const nuevo = await N.evento('fetch', N.pedido('src/logic.js?v=otra-version'));
    expect(nuevo.cuerpo).toContain('otra-version'); expect(N.red.pedidos.length).toBe(1);
  });
  it('NO se mete con: el WebSocket, otros sitios, lo que no es GET, las páginas de los logros, ni archivos sin versión', async () => {
    await N.evento('install');
    for (const p of [N.pedido('ws'), N.pedido('https://abc-def.trycloudflare.com/ws'), N.pedido('https://otro.com/x.js'), N.pedido('src/logic.js', { method: 'POST' }),
      N.pedido('logros/boing.html', { mode: 'navigate' }), N.pedido('src/logic.js'), N.pedido('og.png')]) expect(await N.evento('fetch', p)).toBeUndefined();
  });
  it('el botón "Actualizar" le dice a la versión nueva que empiece ya', async () => {
    await N.evento('message', { data: 'ACTUALIZAR' }); expect(N.self.salto).toBe(true);
    const otro = navegador(); await otro.evento('message', { data: 'cualquier cosa' }); expect(otro.self.salto).toBe(false);
  });
});
