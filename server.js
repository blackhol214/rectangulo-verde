// Servidor multijugador de Rectángulo Verde (se enciende con: bun server.js)
// 1) Entrega el juego (index.html y src/) a quien abra el link
// 2) Reparte en tiempo real dónde está cada jugador (WebSocket)
// 3) Guarda a todos los jugadores en una base de datos SQLite (datos/jugadores.sqlite)
// 4) Es el dueño del mundo compartido: la hora, las monedas, quién es el anfitrión, las preguntas del profe
//    y el árbitro de las Escondidas (quién busca, a quién encontraron y quién gana)
//    (lo que compra cada uno y sus monedas son solo suyos)
import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PUERTO, MAX_JUGADORES, NUM_MONEDAS, leerMensaje, lugarMoneda, faseAhora, corto, salaDeHost, linkOficial, leerPreguntas, claveCorrecta, ESC, elegirBuscador, elegirTerreno, faseRonda, puedeEncontrar, ganadorRonda, mgDelServidor } from './src/red.js';

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
db.run('DROP TABLE IF EXISTS equipo');   // ya no hay base del equipo: cada uno tiene sus propias cosas

function guardar(j) {
  guardarJugador.run({ $nombre: j.nombre, $color: j.color, $x: j.x, $y: j.y, $z: j.z, $monedas: j.monedas });
}

// ---------- Modo profe ----------
// La contraseña NO está en el código (el repo es público): vive en datos/profe.json, que no se sube a GitHub.
// Si no existe, se crea con la variable de entorno PROFE_CLAVE (por ejemplo: PROFE_CLAVE=miclave bun server.js).
const RUTA_CLAVE = new URL('./datos/profe.json', import.meta.url), RUTA_PREGUNTAS = new URL('./datos/preguntas.json', import.meta.url);
if (!existsSync(RUTA_CLAVE) && process.env.PROFE_CLAVE) writeFileSync(RUTA_CLAVE, JSON.stringify({ clave: process.env.PROFE_CLAVE }));
if (!existsSync(RUTA_CLAVE)) console.log('👩‍🏫 Para usar el modo profe, crea datos/profe.json con tu clave: { "clave": "..." }');
// Se lee cada vez: si cambias el archivo, no hace falta reiniciar el servidor
function claveDelProfe() {
  try { const j = JSON.parse(readFileSync(RUTA_CLAVE, 'utf8')); return typeof j.clave === 'string' ? j.clave : null; } catch (e) { return null; }
}
// Las preguntas de la clase se guardan en datos/preguntas.json (así siguen después de reiniciar)
let preguntasClase = [];
try { preguntasClase = leerPreguntas(JSON.parse(readFileSync(RUTA_PREGUNTAS, 'utf8'))) || []; } catch (e) {}
const INTENTOS = 5, ESPERA_MS = 30000;   // después de 5 contraseñas malas, hay que esperar 30 segundos

// ---------- Jugadores conectados ahora ----------
const conectados = new Map();   // id → { id, nombre, color, x, y, z, rot, monedas, ws }
let siguienteId = 1;
// El anfitrión es el jugador cuya compu mueve al gigante y a los bots (el primero que llegó)
let anfitrion = null, ultimoMundo = Date.now();
const aTodos = datos => servidor.publish('juego', JSON.stringify(datos));

// ---------- 🙈 Escondidas ----------
// espera: los que están sentados en la silla de Escondidas · ronda: la que se está jugando (o null)
const esc = { espera: new Set(), ronda: null };
const avisoEsc = (ws, texto) => ws.send(JSON.stringify({ tipo: 'escAviso', texto }));
// A todos: quién está esperando y si hay una ronda (con nombres, para mostrarlos en el panel)
function avisarEspera() {
  aTodos({ tipo: 'escEspera', jugadores: [...esc.espera].filter(id => conectados.has(id)).map(id => ({ id, nombre: conectados.get(id).nombre })), enRonda: !!esc.ronda });
}
function empezarRonda(terreno) {
  const ids = [...esc.espera].filter(id => conectados.has(id));
  const buscador = elegirBuscador(ids);
  esc.ronda = { terreno, buscador, jugadores: ids, camaleones: ids.filter(id => id !== buscador), encontrados: [], inicio: Date.now() };
  // Los tiempos van como "falta tanto" (en ms), así cada compu cuenta igual aunque su reloj esté adelantado
  aTodos({ tipo: 'escRonda', terreno, buscador, jugadores: ids, esconderMs: ESC.esconderMs, finMs: ESC.esconderMs + ESC.buscarMs });
  console.log(`🙈 Empieza una ronda de Escondidas: busca ${conectados.get(buscador).nombre} (${ids.length} jugadores)`);
  avisarEspera();
}
function revisarFinRonda() {
  const r = esc.ronda;
  if (!r) return;
  const gana = ganadorRonda({ camaleones: r.camaleones, encontrados: r.encontrados, ms: Date.now() - r.inicio, buscadorSeFue: !conectados.has(r.buscador) || !esc.espera.has(r.buscador) });
  if (!gana) return;
  const quedan = r.camaleones.filter(id => !r.encontrados.includes(id));
  aTodos({ tipo: 'escFin', gana, buscador: r.buscador, quedan, encontrados: r.encontrados });
  console.log(`🏁 Fin de la ronda de Escondidas: ${gana === 'buscador' ? 'gana el buscador' : gana === 'camaleones' ? 'ganan los camaleones' : 'nadie gana (se fueron todos)'}`);
  esc.ronda = null;
  avisarEspera();
}
// Alguien se fue (cerró o salió de la silla): ya no juega en la ronda
function sacarDeEscondidas(id) {
  esc.espera.delete(id);
  const r = esc.ronda;
  if (r) {
    if (r.buscador !== id && r.camaleones.includes(id)) r.camaleones = r.camaleones.filter(c => c !== id);
    if (r.jugadores.includes(id)) revisarFinRonda();   // si se fue el buscador, ganan los camaleones
  }
  if (esc.ronda === r) avisarEspera();   // (si la ronda terminó, revisarFinRonda ya avisó)
}
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
    // Quien abre el link de Cloudflare va al juego oficial (github.io) con la sala puesta: así hay un solo juego
    const sala = salaDeHost(req.headers.get('host'));
    if (sala && (url.pathname === '/' || url.pathname === '/index.html')) return Response.redirect(linkOficial(sala), 302);
    const ruta = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!PERMITIDOS.test(ruta)) return new Response('No encontrado', { status: 404 });
    return new Response(Bun.file(new URL('.' + ruta, import.meta.url)), { headers: { 'Cache-Control': 'no-cache' } });
  },
  websocket: {
    maxPayloadLength: 128 * 1024,   // (las preguntas del profe pueden ser largas; leerMensaje revisa el tamaño de verdad)
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
        const j = { id: siguienteId++, nombre: m.nombre, color: m.color, monedas: m.monedas, rot: 0, mg: 0, look: m.look, visible: 1,
          x: antes ? antes.x : 0, y: antes ? antes.y : 0, z: antes ? antes.z : 15, ws };
        ws.data.id = j.id;
        if (!anfitrion) anfitrion = j.id;
        // Al nuevo: quién es él, quiénes están ya, dónde quedó la última vez y cómo está el mundo
        ws.send(JSON.stringify({ tipo: 'bienvenida', id: j.id, jugadores: [...conectados.values()].map(sinWs),
          guardado: antes ? { x: antes.x, y: antes.y, z: antes.z, veces: antes.veces + 1 } : null,
          anfitrion, fase: faseDeAhora(), dia: diaPueblo, monedas, preguntas: preguntasClase,
          escondidas: { espera: [...esc.espera], enRonda: !!esc.ronda } }));
        conectados.set(j.id, j);
        guardar(j);
        ws.subscribe('juego');
        ws.publish('juego', JSON.stringify({ tipo: 'entra', ...sinWs(j) }));   // ws.publish no se lo manda a él mismo
        console.log(`➕ ${j.nombre} entró (${conectados.size} jugando)${anfitrion === j.id ? ' · es el anfitrión' : ''}`);
        return;
      }
      if (!yo) return;   // todo lo demás solo vale después de saludar

      yo.ultimo = Date.now();   // sigue jugando (no cerró ni cambió de pestaña)
      if (m.tipo === 'pos') {
        // El mg lo pone el servidor si estás jugando una ronda (y nadie de afuera puede decir que está adentro)
        const r = esc.ronda, enRonda = r && r.jugadores.includes(yo.id) && esc.espera.has(yo.id);
        yo.x = m.x; yo.y = m.y; yo.z = m.z; yo.rot = m.rot; yo.mg = mgDelServidor(m.mg, enRonda ? r.terreno : null);
        if (m.color !== null) yo.color = m.color;
        ws.publish('juego', JSON.stringify({ tipo: 'pos', id: yo.id, x: m.x, y: m.y, z: m.z, rot: m.rot, color: yo.color, mg: yo.mg }));
      } else if (m.tipo === 'visible') {
        // Una pestaña escondida no corre el juego: si era el anfitrión, otro toma el control ya mismo (sin esperar 3 segundos)
        yo.visible = m.v;
        if (!m.v && yo.id === anfitrion) cambiarAnfitrion();
      } else if (m.tipo === 'look') {
        yo.look = m.look;
        ws.publish('juego', JSON.stringify({ tipo: 'look', id: yo.id, look: m.look }));
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
      } else if (m.tipo === 'esc') {
        const r = esc.ronda;
        if (m.que === 'entrar') { esc.espera.add(yo.id); avisarEspera(); }
        else if (m.que === 'salir') sacarDeEscondidas(yo.id);
        else if (m.que === 'empezar') {
          if (r) return avisoEsc(ws, 'Ya hay una ronda jugándose: espera a que termine');
          if (!esc.espera.has(yo.id)) return avisoEsc(ws, 'Siéntate primero en la silla de Escondidas');
          if (esc.espera.size < 2) return avisoEsc(ws, 'Hacen falta al menos 2 jugadores');
          empezarRonda(elegirTerreno());   // el terreno sale al azar
        } else if (m.que === 'encontrar') {
          // Solo el buscador, solo en la parte de buscar, solo a un camaleón que no encontró antes y que esté cerca
          if (!r || r.buscador !== yo.id || faseRonda(Date.now() - r.inicio) !== 'buscar') return;
          const otro = conectados.get(m.a);
          if (!otro || !r.camaleones.includes(m.a) || r.encontrados.includes(m.a)) return;
          if (!puedeEncontrar(yo, otro)) return avisoEsc(ws, '¡Casi! Acércate más');
          r.encontrados.push(m.a);
          aTodos({ tipo: 'escEncontrado', id: m.a, por: yo.id });
          revisarFinRonda();
        }
      } else if (m.tipo === 'preguntas') {
        // El profe cambió las preguntas: solo si la contraseña es la de verdad (y nunca se la mandamos a nadie)
        const responder = (ok, texto) => ws.send(JSON.stringify({ tipo: 'profe', ok, texto }));
        if (yo.esperarHasta && Date.now() < yo.esperarHasta) return responder(false, 'Demasiados intentos: espera un ratito');
        if (!claveCorrecta(m.clave, claveDelProfe())) {
          yo.fallos = (yo.fallos || 0) + 1;
          if (yo.fallos >= INTENTOS) { yo.fallos = 0; yo.esperarHasta = Date.now() + ESPERA_MS; }
          console.log(`🔒 ${yo.nombre} probó una contraseña de profe incorrecta`);
          return responder(false, claveDelProfe() ? 'Contraseña incorrecta' : 'El servidor no tiene contraseña de profe (crea datos/profe.json)');
        }
        yo.fallos = 0;
        preguntasClase = m.lista;
        writeFileSync(RUTA_PREGUNTAS, JSON.stringify(preguntasClase));
        aTodos({ tipo: 'preguntas', lista: preguntasClase, quien: yo.nombre });   // a todos, sin la contraseña
        responder(true, '');
        console.log(`👩‍🏫 ${yo.nombre} cambió las preguntas de la clase (${preguntasClase.length})`);
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
      sacarDeEscondidas(yo.id);
      console.log(`💥 ${yo.nombre} se desconectó (${conectados.size} jugando)`);
    },
  },
});

// Elige como anfitrión a alguien que esté jugando ahora (que haya mandado algo hace poco)
// Solo sirve alguien con la pestaña a la vista y que esté jugando ahora. Si no hay nadie así, se queda el mismo
// (pasarle el control a otra pestaña escondida solo haría que el gigante y los bots salten de una compu a otra).
function cambiarAnfitrion() {
  const activos = [...conectados.values()].filter(j => j.id !== anfitrion && j.visible && Date.now() - (j.ultimo || 0) < 2000);
  const nuevo = activos[0] || (conectados.has(anfitrion) ? null : [...conectados.values()][0]);
  if (nuevo) anfitrion = nuevo.id;
  else if (!conectados.has(anfitrion)) anfitrion = null;
  ultimoMundo = Date.now();
  if (anfitrion) aTodos({ tipo: 'anfitrion', id: anfitrion });
  if (nuevo) console.log(`👑 ${nuevo.nombre} ahora es el anfitrión`);
}
// Si el anfitrión se quedó callado 3 segundos (cambió de pestaña o se le trabó la compu), otro toma el control
setInterval(() => {
  if (anfitrion && conectados.size > 1 && Date.now() - ultimoMundo > 3000) cambiarAnfitrion();
}, 1000);

// ¿Se acabó el tiempo de la ronda de Escondidas?
setInterval(revisarFinRonda, 250);

// Cada 10 segundos guarda a todos (por si la compu se apaga de golpe) y corrige la hora de todos
setInterval(() => {
  for (const j of conectados.values()) guardar(j);
  aTodos({ tipo: 'hora', fase: faseDeAhora() });
}, 10000);

console.log(`🟩 Servidor de Rectángulo Verde en http://localhost:${servidor.port}`);
console.log('   Para que entren tus amigos, en otra terminal: npm run tunel');
