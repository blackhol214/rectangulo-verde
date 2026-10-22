// Multijugador: funciones puras que usan el servidor (server.js) y el juego (index.html)

export const PUERTO = 8080;
export const OFICIAL = 'https://blackhol214.github.io/rectangulo-verde/';   // el único juego oficial

// La sala es el nombre del túnel de Cloudflare (lo de antes de .trycloudflare.com). Solo letras, números y guiones,
// así nadie puede mandarte un link que conecte el juego a otro sitio raro.
export function leerSala(texto) {
  const sala = String(texto || '').trim().toLowerCase();
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sala) && sala.length <= 80 ? sala : null;
}
export const salaDeHost = host => { const m = /^([a-z0-9-]+)\.trycloudflare\.com$/.exec(String(host).toLowerCase()); return m ? leerSala(m[1]) : null; };
export const linkOficial = sala => `${OFICIAL}?sala=${sala}`;
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

// ---------- Modo profe: las preguntas de la clase ----------
// Cada pregunta: { p: el texto (1 a 120 letras), r: 4 respuestas (1 a 60 letras cada una), ok: cuál es la correcta (0 a 3) }
export const PROFE = { maxPreguntas: 30, maxPregunta: 120, maxRespuesta: 60, maxClave: 60 };
// Un texto recortado con entre 1 y max letras; si no, null
const textoEntre = (t, max) => (typeof t === 'string' && t.trim().length >= 1 && t.trim().length <= max ? t.trim() : null);
// Lee la lista de preguntas (de 0 a 30). Si UNA sola cosa viene mal, se rechaza todo (devuelve null)
export function leerPreguntas(lista) {
  if (!Array.isArray(lista) || lista.length > PROFE.maxPreguntas) return null;
  const out = [];
  for (const q of lista) {
    if (!q || typeof q !== 'object' || !Array.isArray(q.r) || q.r.length !== 4 || !esEntero(q.ok, 0, 3)) return null;
    const p = textoEntre(q.p, PROFE.maxPregunta), r = q.r.map(t => textoEntre(t, PROFE.maxRespuesta));
    if (!p || r.some(t => !t)) return null;
    out.push({ p, r, ok: q.ok });
  }
  return out;
}
// Qué le falta (o le sobra) a lo que escribió el profe, para marcarlo en rojo: [{ i: número de pregunta, campo: 'p' o 'r0'…'r3' }]
export function revisarPreguntas(lista) {
  const faltan = [];
  lista.forEach((q, i) => {
    if (!textoEntre(q.p, PROFE.maxPregunta)) faltan.push({ i, campo: 'p' });
    q.r.forEach((t, k) => { if (!textoEntre(t, PROFE.maxRespuesta)) faltan.push({ i, campo: 'r' + k }); });
  });
  return faltan;
}
// El servidor revisa la contraseña (la de verdad está en datos/profe.json, que no se sube a GitHub)
export const claveCorrecta = (dada, real) => typeof dada === 'string' && typeof real === 'string' && real.length > 0 && dada === real;

// ---------- ¿Dónde está cada jugador? (mg) ----------
// 0 = en el mundo · 1 a 20 = en el minijuego número mg − 1 · 21 = en la torre "No mires abajo"
// · 30, 31, 32 = en una ronda de Escondidas con amigos (en el terreno 0, 1 o 2) · 99 = jugando solo (no ve a nadie)
export const MG_TORRE = 21, MG_ESCONDIDAS = 30, MG_SOLO = 99;
// Dos jugadores se ven solo si están en el mismo lugar (y ninguno está jugando solo)
export const seVen = (miMg, suMg) => miMg === suMg && miMg !== MG_SOLO;

// ---------- 🙈 Escondidas con amigos (el servidor es el árbitro) ----------
// 30 s para esconderse (el buscador no ve nada) y 100 s para buscar. Para encontrar, el buscador tiene que estar cerca.
export const ESC = { esconderMs: 30000, buscarMs: 100000, encontrarDist: 4.5, terrenos: 3 };
// El buscador: uno al azar entre los que están esperando
export const elegirBuscador = (ids, azar = Math.random) => ids[Math.min(ids.length - 1, Math.floor(azar() * ids.length))];
// El terreno de la ronda con amigos: también al azar (lo elige el servidor, no el que aprieta Empezar)
export const elegirTerreno = (azar = Math.random) => Math.min(ESC.terrenos - 1, Math.floor(azar() * ESC.terrenos));
// ¿En qué parte de la ronda vamos? (ms: cuánto pasó desde que empezó)
export const faseRonda = ms => (ms < ESC.esconderMs ? 'esconder' : ms < ESC.esconderMs + ESC.buscarMs ? 'buscar' : 'fin');
// ¿Está lo bastante cerca para encontrarlo? (con las últimas posiciones que conoce el servidor)
export const puedeEncontrar = (a, b, max = ESC.encontrarDist) => Math.hypot(a.x - b.x, a.z - b.z) <= max && Math.abs(a.y - b.y) <= 4;
// ¿Quién ganó? 'buscador' si encontró a todos · 'camaleones' si se acabó el tiempo y queda alguien (o si el buscador se fue)
// · 'nadie' si todos los camaleones se fueron sin que encontrara a ninguno · null si sigue la ronda
export function ganadorRonda({ camaleones, encontrados, ms, buscadorSeFue = false }) {
  if (buscadorSeFue) return 'camaleones';
  const quedan = camaleones.filter(id => !encontrados.includes(id));
  if (!quedan.length) return encontrados.length ? 'buscador' : 'nadie';
  return faseRonda(ms) === 'fin' ? 'camaleones' : null;
}
// El mg de un jugador lo decide el servidor durante la ronda: así nadie se vuelve invisible cambiándolo desde la consola.
// terrenoRonda: el terreno de SU ronda (o null si no está jugando una). Fuera de la ronda nadie puede decir que está adentro.
export function mgDelServidor(mg, terrenoRonda) {
  if (terrenoRonda !== null) return MG_ESCONDIDAS + terrenoRonda;
  return mg >= MG_ESCONDIDAS && mg < MG_ESCONDIDAS + ESC.terrenos ? MG_SOLO : mg;
}

// Lee un mensaje que llegó por la red. Si viene roto o con trampas, devuelve null.
// Los mensajes son cortitos (1.500 letras), menos el de las preguntas del profe, que puede ser más largo.
export const MAX_MENSAJE = 1500, MAX_MENSAJE_PREGUNTAS = 40000;
export function leerMensaje(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_MENSAJE_PREGUNTAS) return null;
  let m;
  try { m = JSON.parse(texto); } catch (e) { return null; }
  if (!m || typeof m !== 'object') return null;
  if (m.tipo !== 'preguntas' && texto.length > MAX_MENSAJE) return null;
  // El profe manda las preguntas de la clase (con su contraseña, que solo revisa el servidor)
  if (m.tipo === 'preguntas') {
    const lista = leerPreguntas(m.lista);
    if (!lista || typeof m.clave !== 'string' || m.clave.length > PROFE.maxClave) return null;
    return { tipo: 'preguntas', clave: m.clave, lista };
  }
  if (m.tipo === 'hola') {
    const nombre = limpiarNombre(m.nombre);
    if (!nombre || !esNumero(m.color)) return null;
    return { tipo: 'hola', nombre, color: m.color, monedas: esEntero(m.monedas, 0, 1e9) ? m.monedas : 0, look: leerLook(m.look) };
  }
  if (m.tipo === 'pos') {
    if (![m.x, m.y, m.z, m.rot].every(esNumero)) return null;
    return { tipo: 'pos', x: m.x, y: m.y, z: m.z, rot: m.rot, color: esNumero(m.color) ? m.color : null, mg: esEntero(m.mg, 0, 99) ? m.mg : 0 };
  }
  // Cambió tu gorra, tus gafas o tu bláster
  if (m.tipo === 'look') return { tipo: 'look', look: leerLook(m.look) };
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
    return { tipo: 'mundo', g: m.g, b: m.b };
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
  // Escondidas: entrar a la espera, salir, empezar una ronda o encontrar al jugador a
  if (m.tipo === 'esc') {
    if (m.que === 'entrar' || m.que === 'salir') return { tipo: 'esc', que: m.que };
    if (m.que === 'empezar') return { tipo: 'esc', que: 'empezar' };   // (el terreno lo elige el servidor al azar)
    if (m.que === 'encontrar' && Number.isInteger(m.a)) return { tipo: 'esc', que: 'encontrar', a: m.a };
    return null;
  }
  // Tu pestaña se escondió (v: 0) o volvió a verse (v: 1): una pestaña escondida no puede ser el anfitrión
  if (m.tipo === 'visible') return { tipo: 'visible', v: m.v === 0 ? 0 : 1 };
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

// Lo mismo, pero para girar: va por el camino más corto (de 350° a 10° gira 20°, no 340°)
export function acercarAngulo(desde, hacia, k) {
  const d = Math.atan2(Math.sin(hacia - desde), Math.cos(hacia - desde));
  return desde + d * Math.min(1, Math.max(0, k));
}
