// Multijugador: funciones puras que usan el servidor (server.js) y el juego (index.html)

export const PUERTO = 8080;
export const MAX_JUGADORES = 12;
export const ENVIOS_POR_SEGUNDO = 10;   // cuántas veces por segundo mandas tu posición
export const DIA_SEGUNDOS = 240;        // un día del juego dura 4 minutos (igual para todos)
export const NUM_MONEDAS = 30;
export const BORDE = 100;               // la mitad del tamaño del mapa (200)

// Dónde aparece una moneda: siempre en la mitad del gigante
export function lugarMoneda(azar = Math.random) {
  return { x: (azar() * 2 - 1) * (BORDE - 6), z: -6 - azar() * (BORDE - 12) };
}

// La hora del juego: avanza sola desde la última vez que alguien la cambió (por ejemplo, al dormir)
export function faseAhora(fase0, ms0, msAhora) {
  return (((fase0 + (msAhora - ms0) / 1000 / DIA_SEGUNDOS) % 1) + 1) % 1;
}

// Números cortos para mandar menos letras por la red (2 decimales)
export const corto = n => Math.round(n * 100) / 100;

// Nombre limpio: sin espacios de más y máximo 20 letras
export function limpiarNombre(nombre) {
  if (typeof nombre !== 'string') return '';
  return nombre.trim().replace(/\s+/g, ' ').slice(0, 20);
}

const esNumero = n => typeof n === 'number' && Number.isFinite(n);
const esEntero = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const esId = t => typeof t === 'string' && /^[A-Za-z0-9]{1,24}$/.test(t);

// Cómo te ves: gorra, gafas y bláster (0 = sin bláster, 1 = bláster, 2 = Bláster 2.0)
export function leerLook(l) {
  if (!l || typeof l !== 'object') return { hat: null, glasses: null, blaster: 0 };
  return { hat: esId(l.hat) ? l.hat : null, glasses: esId(l.glasses) ? l.glasses : null, blaster: esEntero(l.blaster, 0, 2) ? l.blaster : 0 };
}
// Niveles de la tienda (lo que compró el equipo): { belt: 1, bigHouse: 1, ... }
export function leerNiveles(n) {
  const out = {};
  if (!n || typeof n !== 'object') return out;
  for (const [id, v] of Object.entries(n).slice(0, 40)) if (esId(id) && esEntero(v, 0, 50)) out[id] = v;
  return out;
}
// Junta lo que compró cada uno: de cada cosa se queda el nivel más alto
export function juntarNiveles(equipo, mios) {
  const out = { ...equipo };
  for (const [id, v] of Object.entries(mios)) out[id] = Math.max(out[id] || 0, v);
  return out;
}

// Lee un mensaje que llegó por la red. Si viene roto o con trampas, devuelve null.
export function leerMensaje(texto) {
  if (typeof texto !== 'string' || texto.length > 1500) return null;
  let m;
  try { m = JSON.parse(texto); } catch (e) { return null; }
  if (!m || typeof m !== 'object') return null;
  if (m.tipo === 'hola') {
    const nombre = limpiarNombre(m.nombre);
    if (!nombre || !esNumero(m.color)) return null;
    return { tipo: 'hola', nombre, color: m.color, monedas: esEntero(m.monedas, 0, 1e9) ? m.monedas : 0, cajas: esEntero(m.cajas, 0, 1e9) ? m.cajas : 0,
      niveles: leerNiveles(m.niveles), look: leerLook(m.look) };
  }
  if (m.tipo === 'pos') {
    if (![m.x, m.y, m.z, m.rot].every(esNumero)) return null;
    return { tipo: 'pos', x: m.x, y: m.y, z: m.z, rot: m.rot, color: esNumero(m.color) ? m.color : null, mg: m.mg === 1 ? 1 : 0 };
  }
  // Cambió tu gorra, tus gafas o tu bláster
  if (m.tipo === 'look') return { tipo: 'look', look: leerLook(m.look) };
  // Billetera del equipo: cuántas monedas y cajas ganaste (+) o gastaste (-)
  if (m.tipo === 'cambio') {
    if (!esEntero(m.monedas, -1e6, 1e6) || !esEntero(m.cajas, -1e6, 1e6)) return null;
    return { tipo: 'cambio', monedas: m.monedas, cajas: m.cajas };
  }
  // Alguien compró algo para la base del equipo
  if (m.tipo === 'nivel') {
    if (!esId(m.id) || !esEntero(m.nivel, 1, 50)) return null;
    return { tipo: 'nivel', id: m.id, nivel: m.nivel };
  }
  // Agarraste la moneda número i
  if (m.tipo === 'moneda') {
    if (!Number.isInteger(m.i) || m.i < 0 || m.i >= NUM_MONEDAS) return null;
    return { tipo: 'moneda', i: m.i };
  }
  // Cambió la hora (alguien durmió y se saltó la noche)
  if (m.tipo === 'hora') {
    if (!esNumero(m.fase) || m.fase < 0 || m.fase >= 1) return null;
    return { tipo: 'hora', fase: m.fase };
  }
  // Empezó un día nuevo en el pueblo (lo avisa el anfitrión)
  if (m.tipo === 'dia') {
    if (!Number.isInteger(m.dia)) return null;
    return { tipo: 'dia', dia: m.dia };
  }
  // El anfitrión cuenta cómo está el mundo: el gigante y los bots
  if (m.tipo === 'mundo') {
    const fila = (a, n) => Array.isArray(a) && a.length === n && a.every(esNumero);
    if (!fila(m.g, 6) || !Array.isArray(m.b) || m.b.length > 20 || !m.b.every(b => fila(b, 5))) return null;
    const a = Array.isArray(m.a) && m.a.length <= 12 && m.a.every(r => fila(r, 4)) ? m.a : [];   // los asistentes del equipo
    return { tipo: 'mundo', g: m.g, b: m.b, a };
  }
  // Algo que solo puede resolver el anfitrión: el gigante te atrapó o le diste con el láser
  if (m.tipo === 'evento') {
    if (m.que !== 'atrapado' && m.que !== 'aturdir') return null;
    return { tipo: 'evento', que: m.que };
  }
  // Disparaste: de dónde sale el láser y hacia dónde va
  if (m.tipo === 'disparo') {
    const tres = a => Array.isArray(a) && a.length === 3 && a.every(esNumero);
    if (!tres(m.s) || !tres(m.d)) return null;
    return { tipo: 'disparo', s: m.s, d: m.d, v2: m.v2 === true };
  }
  // Tu láser le dio a un amigo
  if (m.tipo === 'golpe') {
    if (!Number.isInteger(m.a)) return null;
    return { tipo: 'golpe', a: m.a };
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
