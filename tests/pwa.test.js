import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { VERSION } from '../src/version.js';
import { ACHIEVEMENTS } from '../src/logic.js';
import { OFICIAL } from '../src/red.js';

const RAIZ = new URL('..', import.meta.url).pathname, leer = f => readFileSync(RAIZ + f, 'utf8');
const pngTamano = f => { const b = readFileSync(RAIZ + f); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

describe('🆕 Una sola versión para todo', () => {
  it('todas las direcciones ?v= (index.html y src/*.js) y el service worker usan la VERSION de src/version.js', () => {
    for (const f of ['index.html', ...readdirSync(RAIZ + 'src').filter(x => x.endsWith('.js')).map(x => 'src/' + x)]) {
      const vs = [...leer(f).matchAll(/\?v=([0-9a-z-]+)/g)].map(m => m[1]);
      for (const v of vs) expect(v, f).toBe(VERSION);
    }
    expect(leer('index.html')).toContain(`./src/version.js?v=${VERSION}`);
    expect(/const VERSION = '([^']+)'/.exec(leer('sw.js'))[1]).toBe(VERSION);
  });
});

describe('📦 Instalar como app', () => {
  it('el manifest es válido: nombre, idioma, colores, íconos 192 y 512 (y uno "maskable")', () => {
    const m = JSON.parse(leer('manifest.webmanifest'));
    expect(m.name).toBe('Rectángulo Verde'); expect(m.lang).toBe('es'); expect(m.start_url).toBe('./');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/); expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/);
    for (const i of m.icons) { const [w, h] = pngTamano(i.src); expect(`${w}x${h}`).toBe(i.sizes); }
    expect(m.icons.some(i => i.sizes === '192x192')).toBe(true); expect(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(leer('index.html')).toContain('<link rel="manifest" href="manifest.webmanifest">');
  });
  it('el service worker: la página primero de internet; nunca toca el WebSocket ni otros sitios', () => {
    const sw = leer('sw.js');
    expect(sw).toContain("url.pathname.endsWith('/ws')"); expect(sw).toContain('url.origin !== self.location.origin'); expect(sw).toContain("req.method !== 'GET'");
    expect(sw).toMatch(/fetch\(req\)\.then[\s\S]*catch\(\(\) => caches\.match\('\.\/index\.html'\)/);   // primero internet; sin internet, lo guardado
  });
  it('el servidor local deja ver los archivos nuevos (y nada más)', () => {
    const re = new RegExp(/const PERMITIDOS = \/(.+)\/;/.exec(leer('server.js'))[1]);
    for (const ok of ['/index.html', '/sw.js', '/manifest.webmanifest', '/og.png', '/src/logic.js', '/iconos/icono-192.png', '/logros/boing.html', '/logros/boing.png']) expect(re.test(ok), ok).toBe(true);
    for (const no of ['/server.js', '/datos/profe.json', '/datos/jugadores.sqlite', '/../etc/passwd', '/logros/../server.js', '/tests/pwa.test.js']) expect(re.test(no), no).toBe(false);
  });
  it('GitHub Pages sube todo lo necesario (después de que pasan los tests)', () => {
    const w = leer('.github/workflows/pages.yml');
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'og.png', 'src', 'iconos', 'logros']) expect(w).toContain(f);
    expect(w).toMatch(/needs: test/);
  });
});

describe('🔗 Compartir', () => {
  it('el juego tiene su vista previa (Open Graph y Twitter) con una imagen de 1200 × 630', () => {
    const h = leer('index.html');
    for (const t of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'theme-color']) expect(h).toContain(t);
    expect(h).toContain(`content="${OFICIAL}og.png"`); expect(pngTamano('og.png')).toEqual([1200, 630]);
  });
  it('cada logro tiene su página para compartir (con su imagen) que lleva al juego', () => {
    for (const a of ACHIEVEMENTS) {
      expect(existsSync(RAIZ + `logros/${a.id}.html`), a.id).toBe(true); expect(pngTamano(`logros/${a.id}.png`)).toEqual([1200, 630]);
      const p = leer(`logros/${a.id}.html`);
      expect(p).toContain(`og:image" content="${OFICIAL}logros/${a.id}.png"`); expect(p).toContain('summary_large_image');
      expect(p).toContain(`url=../?logro=${a.id}`);
    }
  });
});
