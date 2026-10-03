// Servidor multijugador de Rectángulo Verde (se enciende con: bun server.js)
// 1) Entrega el juego (index.html y src/) a quien abra el link
// 2) Reparte en tiempo real dónde está cada jugador (WebSocket)
// 3) Guarda a todos los jugadores en una base de datos SQLite (datos/jugadores.sqlite)
// 4) Es el dueño del mundo compartido: la hora, las monedas, quién es el anfitrión
//    y la base del equipo (lo que compraron entre todos) con su billetera
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { PUERTO, MAX_JUGADORES, NUM_MONEDAS, leerMensaje, lugarMoneda, faseAhora, corto, juntarNiveles } from './src/red.js';

// ---------- Base de datos ----------
mkdirSync(new URL('./datos', import.meta.url), { recursive: true });
const db = new Database(new URL('./datos/jugadores.sqlite', import.meta.url).pathname);
db.run(`CREATE TABLE IF NOT EXISTS jugadores (
  nombre     TEXT PRIMARY KEY,
  color      INTEGER,
  x REAL, y REAL, z REAL,
  monedas    INTEGER DEFAULT 0,
  veces      INTEGER DEFAULT 0,   -- cuántas veces ha entrado
  ultima_vez TEXT
)`);
const buscarJugador = db.query('SELECT * FROM jugadores WHERE nombre = ?');
const guardarJugador = db.query(`INSERT INTO jugadores (nombre, color, x, y, z, monedas, veces, ultima_vez)
  VALUES ($nombre, $color, $x, $y, $z, $monedas, 1, datetime('now', 'localtime'))
  ON CONFLICT(nombre) DO UPDATE SET color = $color, x = $x, y = $y, z = $z, monedas = $monedas, ultima_vez = datetime('now', 'localtime')`);
const sumarVisita = db.query('UPDATE jugadores SET veces = veces + 1 WHERE nombre = ?');
// La base del equipo: una sola fila con todo en JSON (monedas, cajas, lo comprado y quién ya aportó lo suyo)
db.run('CREATE TABLE IF NOT EXISTS equipo (id INTEGER PRIMARY KEY, datos TEXT)');
const filaEquipo = db.query('SELECT datos FROM equipo WHERE id = 1').get();
const equipo = { monedas: 0, cajas: 0, niveles: {}, aportaron: [], ...(filaEquipo ? JSON.parse(filaEquipo.datos) : {}) };
const guardarEquipo = () => db.query('INSERT OR REPLACE INTO equipo (id, datos) VALUES (1, ?)').run(JSON.stringify(equipo));
const billetera = () => ({ tipo: 'equipo', monedas: equipo.monedas, cajas: equipo.cajas });

function guardar(j) {
  guardarJugador.run({ $nombre: j.nombre, $color: j.color, $x: j.x, $y: j.y, $z: j.z, $monedas: j.monedas });
}

// ---------- Jugadores conectados ahora ----------
const conectados = new Map();   // id → { id, nombre, color, x, y, z, rot, monedas, ws }
let siguienteId = 1;
// El anfitrión es el jugador cuya compu mueve al gigante y a los bots (el primero que llegó)
let anfitrion = null, ultimoMundo = Date.now();
const aTodos = datos => servidor.publish('juego', JSON.stringify(datos));
const sinWs = ({ ws, ...j }) => j;

// ---------- El mundo compartido ----------
// La hora: guardamos en qué fase estaba y cuándo; desde ahí avanza sola
let hora = { fase: 8 / 24, ms: Date.now() };   // empieza a las 8:00
const faseDeAhora = () => faseAhora(hora.fase, hora.ms, Date.now());
let diaPueblo = Math.floor(Math.random() * 1000);   // decide qué misiones piden los bots del pueblo
const monedas = Array.from({ length: NUM_MONEDAS }, () => lugarMoneda());

// ---------- Archivos que se pueden ver desde internet (solo estos, nada más de tu compu) ----------
const PERMITIDOS = /^\/(index\.html|src\/[a-z]+\.js)$/;

const servidor = Bun.serve({
  port: PUERTO,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (conectados.size >= MAX_JUGADORES) return new Response('El juego está lleno', { status: 503 });
      return srv.upgrade(req, { data: { id: null } }) ? undefined : new Response('Se necesita WebSocket', { status: 400 });
    }
    const ruta = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!PERMITIDOS.test(ruta)) return new Response('No encontrado', { status: 404 });
    return new Response(Bun.file(new URL('.' + ruta, import.meta.url)), { headers: { 'Cache-Control': 'no-cache' } });
  },
  websocket: {
    maxPayloadLength: 2048,
    message(ws, texto) {
      const m = leerMensaje(String(texto));
      if (!m) return;   // mensaje raro: lo ignoramos
      const yo = ws.data.id && conectados.get(ws.data.id);

      if (m.tipo === 'hola' && !yo) {
        if ([...conectados.values()].some(j => j.nombre.toLowerCase() === m.nombre.toLowerCase())) {
          ws.send(JSON.stringify({ tipo: 'error', texto: `Ya hay alguien jugando como "${m.nombre}". Usa otro nombre.` }));
          ws.close();
          return;
        }
        const antes = buscarJugador.get(m.nombre);   // ¿ya había jugado alguna vez?
        if (antes) sumarVisita.run(m.nombre);
        const j = { id: siguienteId++, nombre: m.nombre, color: m.color, monedas: m.monedas, rot: 0, mg: 0, look: m.look,
          x: antes ? antes.x : 0, y: antes ? antes.y : 0, z: antes ? antes.z : 15, ws };
        // La primera vez que alguien juega en equipo, sus monedas y cajas pasan a la billetera del equipo.
        // Lo que compró en su partida de solo se suma a la base (de cada cosa queda el nivel más alto).
        const nuevoEnEquipo = !equipo.aportaron.includes(m.nombre.toLowerCase());
        if (nuevoEnEquipo) { equipo.monedas += m.monedas; equipo.cajas += m.cajas; equipo.aportaron.push(m.nombre.toLowerCase()); }
        equipo.niveles = juntarNiveles(equipo.niveles, m.niveles);
        guardarEquipo();
        ws.data.id = j.id;
        if (!anfitrion) anfitrion = j.id;
        // Al nuevo: quién es él, quiénes están ya, dónde quedó la última vez y cómo está el mundo
        ws.send(JSON.stringify({ tipo: 'bienvenida', id: j.id, jugadores: [...conectados.values()].map(sinWs),
          guardado: antes ? { x: antes.x, y: antes.y, z: antes.z, veces: antes.veces + 1 } : null,
          anfitrion, fase: faseDeAhora(), dia: diaPueblo, monedas,
          equipo: { monedas: equipo.monedas, cajas: equipo.cajas, niveles: equipo.niveles }, aporte: nuevoEnEquipo ? { monedas: m.monedas, cajas: m.cajas } : null }));
        conectados.set(j.id, j);
        guardar(j);
        ws.subscribe('juego');
        ws.publish('juego', JSON.stringify({ tipo: 'entra', ...sinWs(j) }));   // ws.publish no se lo manda a él mismo
        // A los demás: la billetera nueva y lo que trajo para la base
        ws.publish('juego', JSON.stringify(billetera()));
        for (const [id, nivel] of Object.entries(m.niveles)) ws.publish('juego', JSON.stringify({ tipo: 'nivel', id, nivel: equipo.niveles[id] }));
        console.log(`➕ ${j.nombre} entró (${conectados.size} jugando)${anfitrion === j.id ? ' · es el anfitrión' : ''}`);
        return;
      }
      if (!yo) return;   // todo lo demás solo vale después de saludar

      yo.ultimo = Date.now();   // sigue jugando (no cerró ni cambió de pestaña)
      if (m.tipo === 'pos') {
        yo.x = m.x; yo.y = m.y; yo.z = m.z; yo.rot = m.rot; yo.mg = m.mg;
        if (m.color !== null) yo.color = m.color;
        ws.publish('juego', JSON.stringify({ tipo: 'pos', id: yo.id, x: m.x, y: m.y, z: m.z, rot: m.rot, color: yo.color, mg: m.mg }));
      } else if (m.tipo === 'look') {
        yo.look = m.look;
        ws.publish('juego', JSON.stringify({ tipo: 'look', id: yo.id, look: m.look }));
      } else if (m.tipo === 'cambio') {
        // La billetera nunca queda en negativo (si dos compran a la vez sin alcanzar, el equipo invita 😉)
        equipo.monedas = Math.max(0, equipo.monedas + m.monedas);
        equipo.cajas = Math.max(0, equipo.cajas + m.cajas);
        guardarEquipo();
        aTodos(billetera());
      } else if (m.tipo === 'nivel') {
        if ((equipo.niveles[m.id] || 0) >= m.nivel) return;   // ya lo tenían
        equipo.niveles[m.id] = m.nivel;
        guardarEquipo();
        ws.publish('juego', JSON.stringify({ tipo: 'nivel', id: m.id, nivel: m.nivel, quien: yo.nombre }));
      } else if (m.tipo === 'moneda') {
        // Alguien agarró una moneda: aparece en otro lugar para todos
        monedas[m.i] = lugarMoneda();
        aTodos({ tipo: 'moneda', i: m.i, x: corto(monedas[m.i].x), z: corto(monedas[m.i].z) });
      } else if (m.tipo === 'hora') {
        hora = { fase: m.fase, ms: Date.now() };
        aTodos({ tipo: 'hora', fase: m.fase, quien: yo.nombre });
      } else if (m.tipo === 'dia' && yo.id === anfitrion) {
        diaPueblo = m.dia;
        ws.publish('juego', JSON.stringify({ tipo: 'dia', dia: m.dia }));
      } else if (m.tipo === 'mundo' && yo.id === anfitrion) {
        ultimoMundo = Date.now();
        ws.publish('juego', JSON.stringify(m));   // solo el anfitrión cuenta cómo está el mundo
      } else if (m.tipo === 'evento') {
        const host = conectados.get(anfitrion);
        if (host && host.id !== yo.id) host.ws.send(JSON.stringify({ tipo: 'evento', que: m.que, nombre: yo.nombre }));
      } else if (m.tipo === 'disparo') {
        ws.publish('juego', JSON.stringify({ ...m, id: yo.id }));
      } else if (m.tipo === 'golpe') {
        const otro = conectados.get(m.a);
        if (otro && otro.id !== yo.id) otro.ws.send(JSON.stringify({ tipo: 'golpe', de: yo.nombre }));
      }
    },
    close(ws) {
      const yo = ws.data.id && conectados.get(ws.data.id);
      if (!yo) return;
      conectados.delete(yo.id);
      guardar(yo);
      aTodos({ tipo: 'sale', id: yo.id, nombre: yo.nombre });   // ¡BOOM! en la pantalla de todos
      // Si se fue el anfitrión, el siguiente que llegó toma el control del gigante y los bots
      if (anfitrion === yo.id) cambiarAnfitrion();
      console.log(`💥 ${yo.nombre} se desconectó (${conectados.size} jugando)`);
    },
  },
});

// Elige como anfitrión a alguien que esté jugando ahora (que haya mandado algo hace poco)
function cambiarAnfitrion() {
  const activos = [...conectados.values()].filter(j => j.id !== anfitrion && Date.now() - (j.ultimo || 0) < 2000);
  const nuevo = activos[0] || [...conectados.values()].find(j => j.id !== anfitrion);
  anfitrion = nuevo ? nuevo.id : (conectados.has(anfitrion) ? anfitrion : null);
  ultimoMundo = Date.now();
  if (anfitrion) aTodos({ tipo: 'anfitrion', id: anfitrion });
  if (nuevo) console.log(`👑 ${nuevo.nombre} ahora es el anfitrión`);
}
// Si el anfitrión se quedó callado 3 segundos (cambió de pestaña o se le trabó la compu), otro toma el control
setInterval(() => {
  if (anfitrion && conectados.size > 1 && Date.now() - ultimoMundo > 3000) cambiarAnfitrion();
}, 1000);

// Cada 10 segundos guarda a todos (por si la compu se apaga de golpe) y corrige la hora de todos
setInterval(() => {
  for (const j of conectados.values()) guardar(j);
  aTodos({ tipo: 'hora', fase: faseDeAhora() });
}, 10000);

console.log(`🟩 Servidor de Rectángulo Verde en http://localhost:${servidor.port}`);
console.log('   Para que entren tus amigos, en otra terminal: npm run tunel');
