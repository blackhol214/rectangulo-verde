// Abre el túnel de Cloudflare hacia el servidor (bun server.js) y muestra el link oficial para tus amigos
import { PUERTO, linkOficial, salaDeHost } from './src/red.js';

const tunel = Bun.spawn(['cloudflared', 'tunnel', '--url', `http://localhost:${PUERTO}`], { stdout: 'inherit', stderr: 'pipe' });
let listo = false;
const lector = tunel.stderr.pipeThrough(new TextDecoderStream()).getReader();
for (;;) {
  const { value, done } = await lector.read();
  if (done) break;
  const m = !listo && /https:\/\/([a-z0-9-]+\.trycloudflare\.com)/.exec(value);
  if (m) {
    listo = true;
    console.log('\n🌉 ¡Puente listo! Manda este link a tus amigos (es el juego oficial con tu sala):\n');
    console.log('   ' + linkOficial(salaDeHost(m[1])) + '\n');
    console.log('   El link cambia cada vez que abres el túnel. Para cerrarlo: Ctrl+C\n');
  }
}
