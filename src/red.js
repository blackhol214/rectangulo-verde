// Multijugador: funciones puras que usan el servidor (server.js) y el juego (index.html)

export const PUERTO = 8080;
export const MAX_JUGADORES = 12;
export const ENVIOS_POR_SEGUNDO = 10;   // cuántas veces por segundo mandas tu posición

// Nombre limpio: sin espacios de más y máximo 20 letras
export function limpiarNombre(nombre) {
  if (typeof nombre !== 'string') return '';
  return nombre.trim().replace(/\s+/g, ' ').slice(0, 20);
}

const esNumero = n => typeof n === 'number' && Number.isFinite(n);

// Lee un mensaje que llegó por la red. Si viene roto o con trampas, devuelve null.
export function leerMensaje(texto) {
  if (typeof texto !== 'string' || texto.length > 500) return null;
  let m;
  try { m = JSON.parse(texto); } catch (e) { return null; }
  if (!m || typeof m !== 'object') return null;
  if (m.tipo === 'hola') {
    const nombre = limpiarNombre(m.nombre);
    if (!nombre || !esNumero(m.color)) return null;
    return { tipo: 'hola', nombre, color: m.color, monedas: esNumero(m.monedas) ? m.monedas : 0 };
  }
  if (m.tipo === 'pos') {
    if (![m.x, m.y, m.z, m.rot].every(esNumero)) return null;
    return { tipo: 'pos', x: m.x, y: m.y, z: m.z, rot: m.rot, color: esNumero(m.color) ? m.color : null, monedas: esNumero(m.monedas) ? m.monedas : null };
  }
  return null;
}

// Mueve un número un poquito hacia otro (k = 0 no se mueve, k = 1 llega de golpe).
// Así los otros jugadores se deslizan suave en vez de dar saltitos 10 veces por segundo.
export function acercar(desde, hacia, k) {
  return desde + (hacia - desde) * Math.min(1, Math.max(0, k));
}

// Pedacitos de la explosión: cada uno sale volando en una dirección al azar y hacia arriba
export function piezasExplosion(cantidad, azar = Math.random) {
  const piezas = [];
  for (let i = 0; i < cantidad; i++) {
    const ang = azar() * Math.PI * 2, fuerza = 3 + azar() * 5;
    piezas.push({
      vx: Math.cos(ang) * fuerza,
      vy: 4 + azar() * 6,
      vz: Math.sin(ang) * fuerza,
      y: azar() * 2,             // sale desde algún punto del cuerpo (que mide 2 de alto)
      giro: (azar() - 0.5) * 10,
    });
  }
  return piezas;
}
