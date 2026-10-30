// 🆕 Cambia la versión del juego en TODOS lados a la vez: node scripts/version.mjs 2026-11-03-algo
// (src/version.js, las direcciones ?v= de index.html y src/*.js, y el service worker sw.js)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const RAIZ = new URL('..', import.meta.url).pathname, nueva = process.argv[2];
if (!nueva || !/^[0-9a-z-]+$/.test(nueva)) { console.error('Uso: node scripts/version.mjs <nueva-version> (letras, números y guiones)'); process.exit(1); }
const vieja = /VERSION = '([^']+)'/.exec(readFileSync(RAIZ + 'src/version.js', 'utf8'))[1];
const archivos = ['index.html', 'sw.js', ...readdirSync(RAIZ + 'src').filter(f => f.endsWith('.js')).map(f => 'src/' + f)];
for (const f of archivos) {
  const antes = readFileSync(RAIZ + f, 'utf8');
  const despues = antes.split(`?v=${vieja}`).join(`?v=${nueva}`).split(`VERSION = '${vieja}'`).join(`VERSION = '${nueva}'`);
  if (despues !== antes) { writeFileSync(RAIZ + f, despues); console.log('✏️ ', f); }
}
console.log(`✅ Versión: ${vieja} → ${nueva}`);
