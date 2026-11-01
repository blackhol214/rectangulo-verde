// Servidor multijugador de Rectángulo Verde (se enciende con: bun server.js)
// 1) Entrega el juego (index.html y src/) a quien abra el link
// 2) Reparte en tiempo real dónde está cada jugador (WebSocket)
// 3) Guarda a todos los jugadores en una base de datos SQLite (datos/jugadores.sqlite)
// 4) Es el dueño del mundo compartido: la hora, las monedas, quién es el anfitrión, las preguntas del profe
//    y el árbitro de las Escondidas (quién busca, a quién encontraron y quién gana)
//    y de Atrapadas Nocivas (quién tiene la mancha, los relojes, quién explota y quién gana)
//    y de la Carrera (quién llegó a la meta y en qué puesto, los golpes de los obstáculos, los checkpoints)
//    y del Spleef (qué hexágonos se pisaron y cuándo, quién se cayó y quién gana)
//    (lo que compra cada uno y sus monedas son solo suyos)
import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PUERTO, MAX_JUGADORES, NUM_MONEDAS, leerMensaje, lugarMoneda, faseAhora, corto, salaDeHost, linkOficial, leerPreguntas, claveCorrecta, ESC, elegirBuscador, elegirTerreno, faseRonda, puedeEncontrar, ganadorRonda, mgDelServidor, AN, nuevaRondaAN, pasarAN, explotarAN, salirAN, seTocan, sigueEnRondaAN, empujeAN, vigilarPos, VIGILA, MG_CARRERA, MG_SPLEEF } from './src/red.js';
import { zonaAN, zonaEsc, zonaCarrera, CARRERA, checkpointDe, enMetaCarrera, origenCarrera, golpeValidoCarrera, siguienteCheckpoint, SPLEEF, zonaSpleef, origenSpleef, pisoSpleef, fueraSpleef, pisadaValida } from './src/logic.js';

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
  olvidarPos(ids);
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
  const estaba = esc.espera.delete(id), r = esc.ronda;
  if (r && r.jugadores.includes(id) && !(r.salieron || []).includes(id)) {
    r.salieron = [...(r.salieron || []), id];   // se fue de la ronda: aunque se vuelva a sentar, ya no está en esta ronda (espera a la próxima)
    if (r.buscador !== id && r.camaleones.includes(id)) r.camaleones = r.camaleones.filter(c => c !== id);
    revisarFinRonda();   // si se fue el buscador, ganan los camaleones
  }
  if (estaba && esc.ronda === r) avisarEspera();   // (solo si de verdad estaba sentado; si la ronda terminó, revisarFinRonda ya avisó)
}
// Lo que los demás pueden saber de un jugador (nada de lo que el servidor usa por dentro: posiciones vigiladas, checkpoints, contraseñas…)
// (las monedas de cada uno son solo suyas: no se le cuentan a nadie)
const sinWs = j => ({ id: j.id, nombre: j.nombre, color: j.color, rot: j.rot, mg: j.mg, look: j.look, visible: j.visible, x: j.x, y: j.y, z: j.z });

// ---------- 👽 Atrapadas Nocivas ----------
// espera: los sentados en la silla · ronda: { jugadores, vivos, portador, fin (hora en ms), ultimoPase } (ver red.js)
const an = { espera: new Set(), ronda: null };
const avisoAN = (ws, texto) => ws.send(JSON.stringify({ tipo: 'anAviso', texto }));
// En la ronda = vivo o fantasma que no se fue (si se fue y se vuelve a sentar, espera a la próxima)
const enRondaAN = id => sigueEnRondaAN(an.ronda, id) && an.espera.has(id);
function avisarEsperaAN() {
  aTodos({ tipo: 'anEspera', jugadores: [...an.espera].filter(id => conectados.has(id)).map(id => ({ id, nombre: conectados.get(id).nombre })), enRonda: !!an.ronda });
}
// Lo que cada compu necesita saber: quién tiene la mancha y cuánto le falta (en ms, "falta tanto": así cada compu cuenta igual)
const estadoAN = r => ({ portador: r.portador, vivos: r.vivos, finMs: Math.max(0, r.fin - Date.now()) });
// salio: si terminó porque alguien se fue, quién fue (para que el cartel del ganador se entienda)
function terminarAN(ganador, salio = null) {
  aTodos({ tipo: 'anFin', ganador, ...(salio ? { salio: salio.id, nombre: salio.nombre } : {}) });
  console.log(`🏁 Fin de Atrapadas Nocivas: gana ${ganador && conectados.has(ganador) ? conectados.get(ganador).nombre : 'nadie'}`);
  an.ronda = null; avisarEsperaAN();
}
// Cada ratito: ¿se le acabó el tiempo al portador? ¡Explota!
function revisarAN() {
  const r = an.ronda;
  if (!r || Date.now() < r.fin) return;
  const { ronda, exploto, ganador } = explotarAN(r, Date.now());
  aTodos({ tipo: 'anExplota', id: exploto, ...(ronda ? estadoAN(ronda) : { portador: null, vivos: r.vivos.filter(v => v !== exploto), finMs: 0 }) });
  if (!ronda) return terminarAN(ganador);
  an.ronda = ronda;
}
// Alguien se fue (se levantó o cerró el juego). nombre: lo mandamos porque si cerró, los demás ya no lo tienen en su lista
function sacarDeAtrapadas(id, nombre) {
  const estaba = an.espera.delete(id), r = an.ronda;
  const { ronda, que, ganador } = r ? salirAN(r, id, Date.now()) : { que: null };
  if (que === 'explota') {   // se fue con la mancha: ¡explota igual! (no se salva yéndose)
    aTodos({ tipo: 'anExplota', id, salio: true, nombre, ...(ronda ? estadoAN(ronda) : { portador: null, vivos: r.vivos.filter(v => v !== id), finMs: 0 }) });
  } else if (que === 'sale' && ronda) aTodos({ tipo: 'anSale', id, nombre, ...estadoAN(ronda) });
  // (si ya era fantasma, no avisamos nada: ya no estaba jugando)
  if (que) { if (!ronda) return terminarAN(ganador, { id, nombre }); an.ronda = ronda; }
  if (estaba || que) avisarEsperaAN();   // solo si algo cambió (nada de avisos repetidos)
}
// ---------- 🏁 Carrera ----------
// espera: los sentados en la silla · ronda: { jugadores, inicio, llegadas (en orden), primera (cuándo llegó el primero), salieron }
const cr = { espera: new Set(), ronda: null };
const avisoCR = (ws, texto) => ws.send(JSON.stringify({ tipo: 'crAviso', texto }));
const enRondaCR = id => !!(cr.ronda && cr.ronda.jugadores.includes(id) && !cr.ronda.salieron.includes(id) && cr.espera.has(id));
function avisarEsperaCR() {
  aTodos({ tipo: 'crEspera', jugadores: [...cr.espera].filter(id => conectados.has(id)).map(id => ({ id, nombre: conectados.get(id).nombre })), enRonda: !!cr.ronda });
}
function terminarCR() {
  const r = cr.ronda; if (!r) return;
  aTodos({ tipo: 'crFin', llegadas: r.llegadas, ganador: r.llegadas[0] ?? null });
  console.log(`🏁 Fin de la Carrera: gana ${r.llegadas.length && conectados.has(r.llegadas[0]) ? conectados.get(r.llegadas[0]).nombre : 'nadie'}`);
  cr.ronda = null; avisarEsperaCR();
}
// ¿Se terminó? (llegaron todos, o pasaron 45 s desde que llegó el primero, o 5 minutos en total)
function revisarCR() {
  const r = cr.ronda; if (!r) return;
  const ahora = Date.now(), corriendo = r.jugadores.filter(id => !r.salieron.includes(id) && !r.llegadas.includes(id));
  if (!corriendo.length || ahora > r.inicio + CARRERA.maxMs || (r.primera && ahora > r.primera + CARRERA.despuesDelPrimeroMs)) terminarCR();
}
function sacarDeCarrera(id) {
  const estaba = cr.espera.delete(id), r = cr.ronda;
  if (r && r.jugadores.includes(id) && !r.salieron.includes(id)) { r.salieron.push(id); revisarCR(); }
  if (estaba) avisarEsperaCR();
}
// ---------- 🔶 Spleef ----------
// ronda: { jugadores, vivos, orden (los que se cayeron, en orden), inicio, pisadas (una por capa: hexágono → segundo), salieron }
// nuevas: las pisadas que todavía no se mandaron (se mandan juntas cada 0,1 s: así todos ven caer los mismos hexágonos)
const sp = { espera: new Set(), ronda: null, nuevas: [] };
const SPLEEF_CUENTA_MS = 3000;   // la cuenta regresiva (la misma que en el juego)
const avisoSP = (ws, texto) => ws.send(JSON.stringify({ tipo: 'spAviso', texto }));
const enRondaSP = id => !!(sp.ronda && sp.ronda.jugadores.includes(id) && !sp.ronda.salieron.includes(id) && sp.espera.has(id));
const vivoSP = id => enRondaSP(id) && sp.ronda.vivos.includes(id);
function avisarEsperaSP() {
  aTodos({ tipo: 'spEspera', jugadores: [...sp.espera].filter(id => conectados.has(id)).map(id => ({ id, nombre: conectados.get(id).nombre })), enRonda: !!sp.ronda });
}
// Alguien pisó el hexágono i de la capa k: desde ahora (el reloj del servidor) empieza a caerse
function pisarSP(k, i) {
  const r = sp.ronda; if (!r || r.pisadas[k].has(i) || Date.now() < r.inicio + SPLEEF_CUENTA_MS) return;   // (durante el 3, 2, 1 no se hunde nada)
  const t = (Date.now() - r.inicio) / 1000; r.pisadas[k].set(i, t); sp.nuevas.push([k, i, Math.round(t * 1000)]);
}
function revisarSP() {
  const r = sp.ronda; if (!r) return;
  if (r.vivos.length > 1 && Date.now() < r.inicio + SPLEEF.maxMs) return;
  // Gana el último que quedó (si se cayeron los dos últimos juntos, el que se cayó último)
  const ganador = r.vivos.length === 1 ? r.vivos[0] : r.vivos.length === 0 ? (r.orden[r.orden.length - 1] ?? null) : null;
  aTodos({ tipo: 'spFin', ganador, nombre: ganador && conectados.has(ganador) ? conectados.get(ganador).nombre : null });
  console.log(`🔶 Fin del Spleef: gana ${ganador && conectados.has(ganador) ? conectados.get(ganador).nombre : 'nadie'}`);
  sp.ronda = null; avisarEsperaSP();
}
function eliminarSP(id, nombre, salio = false) {
  const r = sp.ronda; if (!r || !r.vivos.includes(id)) return;
  r.vivos = r.vivos.filter(v => v !== id); r.orden.push(id);
  aTodos({ tipo: 'spFuera', id, nombre, salio, quedan: r.vivos.length });
  revisarSP();
}
function sacarDeSpleef(id, nombre) {
  const estaba = sp.espera.delete(id), r = sp.ronda;
  if (r && r.jugadores.includes(id) && !r.salieron.includes(id)) { eliminarSP(id, nombre, true); if (sp.ronda === r) r.salieron.push(id); }
  if (estaba) avisarEsperaSP();
}
// Un jugador está en UNA sola espera y UNA sola ronda a la vez: al sentarse en una silla, se levanta de las otras
const enRondaEsc = id => !!(esc.ronda && esc.ronda.jugadores.includes(id) && esc.espera.has(id) && !(esc.ronda.salieron || []).includes(id));
function enOtraRonda(id, modo) {
  return (modo !== 'esc' && enRondaEsc(id)) || (modo !== 'an' && enRondaAN(id)) || (modo !== 'cr' && enRondaCR(id)) || (modo !== 'sp' && enRondaSP(id));
}
function salirDeOtrasEsperas(yo, modo) {
  if (modo !== 'esc' && esc.espera.has(yo.id)) sacarDeEscondidas(yo.id);
  if (modo !== 'an' && an.espera.has(yo.id)) sacarDeAtrapadas(yo.id, yo.nombre);
  if (modo !== 'cr' && cr.espera.has(yo.id)) sacarDeCarrera(yo.id);
  if (modo !== 'sp' && sp.espera.has(yo.id)) sacarDeSpleef(yo.id, yo.nombre);
}
// 🛡️ La zona que vigila el servidor para este jugador (o null si no está jugando una ronda)
function zonaDe(id) {
  if (vivoSP(id)) {   // (en el Spleef, lo que tiene debajo son los hexágonos que todavía no se cayeron: los que sabe el servidor)
    const r = sp.ronda, c = origenSpleef(), t = (Date.now() - r.inicio) / 1000;
    const soporteBajo = (x, z, y, margen = 0.6) => { const p = pisoSpleef(x - c.x, z - c.z, margen > 1 ? y + 6 : y, r.pisadas, t); return p ? p.top : 0; };
    return { ...zonaSpleef(r.jugadores.indexOf(id), r.jugadores.length), llegarHasta: r.inicio + VIGILA.llegarMs, soporteBajo, quietoHasta: r.inicio + SPLEEF_CUENTA_MS - 300 };
  }
  if (enRondaCR(id)) { const r = cr.ronda, j = conectados.get(id); return { ...zonaCarrera(r.jugadores.indexOf(id), r.jugadores.length, j.cpCarrera || 0, j, r.semilla), llegarHasta: r.inicio + VIGILA.llegarMs, quietoHasta: r.inicio + 3000 - 300 }; }   // (quietoHasta: el 3, 2, 1, con un poquito de margen por internet)
  // llegarHasta: si a los 3 s no llegó a su lugar (se quedó afuera), el servidor lo pone ahí igual
  if (enRondaAN(id)) return { ...zonaAN(an.ronda.jugadores.indexOf(id), an.ronda.jugadores.length), llegarHasta: an.ronda.inicio + VIGILA.llegarMs };
  const r = esc.ronda;
  if (r && r.jugadores.includes(id) && esc.espera.has(id) && !(r.salieron || []).includes(id)) return { ...zonaEsc(r.terreno, (Date.now() - r.inicio) / 1000, conectados.get(id)), llegarHasta: r.inicio + VIGILA.llegarMs };
  return null;
}
// Al empezar una ronda, se olvida de dónde estaba (tiene que aparecer en su lugar de salida)
const olvidarPos = ids => ids.forEach(id => { const j = conectados.get(id); if (j) { j.vigilado = null; j.extra = 0; j.cpCarrera = 0; } });

// ---------- El mundo compartido ----------
// La hora: guardamos en qué fase estaba y cuándo; desde ahí avanza sola
let hora = { fase: 8 / 24, ms: Date.now() };   // empieza a las 8:00
const faseDeAhora = () => faseAhora(hora.fase, hora.ms, Date.now());
let diaPueblo = Math.floor(Math.random() * 1000);   // decide qué misiones piden los bots del pueblo
const monedas = Array.from({ length: NUM_MONEDAS }, () => lugarMoneda());

// ---------- Archivos que se pueden ver desde internet (solo estos, nada más de tu compu) ----------
const PERMITIDOS = /^\/(index\.html|sw\.js|manifest\.webmanifest|og\.png|src\/[a-z]+\.js|iconos\/[a-z0-9-]+\.png|logros\/[a-z0-9-]+\.(html|png))$/;
const TIPOS = { '.webmanifest': 'application/manifest+json', '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

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
    const tipo = TIPOS[ruta.slice(ruta.lastIndexOf('.'))];
    return new Response(Bun.file(new URL('.' + ruta, import.meta.url)), { headers: { 'Cache-Control': 'no-cache', ...(tipo ? { 'Content-Type': tipo } : {}) } });
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
          escondidas: { espera: [...esc.espera], enRonda: !!esc.ronda }, atrapadas: { espera: [...an.espera], enRonda: !!an.ronda }, carrera: { espera: [...cr.espera], enRonda: !!cr.ronda }, spleef: { espera: [...sp.espera], enRonda: !!sp.ronda } }));
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
        const r = esc.ronda, enRonda = enRondaEsc(yo.id);
        yo.mg = mgDelServidor(m.mg, enRonda ? r.terreno : null, enRondaAN(yo.id), enRondaCR(yo.id) ? MG_CARRERA : enRondaSP(yo.id) ? MG_SPLEEF : null);
        // 🛡️ En una ronda, el servidor revisa que no vaya más rápido de lo posible ni se salga de la zona
        const zona = zonaDe(yo.id), ahora = Date.now();
        if (zona) {
          const conEmpuje = ahora < (yo.extraHasta || 0);
          const v = vigilarPos(yo.vigilado, m, ahora, zona, conEmpuje ? yo.extra || 0 : 0, conEmpuje ? yo.empujeDir : null);
          yo.vigilado = v.pos; yo.extra = v.extra;
          yo.x = v.pos.x; yo.y = v.pos.y; yo.z = v.pos.z;
          // 🏁 En la carrera: el checkpoint más lejano al que llegó (por dónde va, arriba de la pista)
          if (enRondaCR(yo.id) && v.pos.llego && yo.y >= CARRERA.y0 - 0.5) yo.cpCarrera = siguienteCheckpoint(yo.cpCarrera || 0, yo.x - origenCarrera().x);   // (en orden: de a uno)
          // 🔶 En el Spleef: el servidor también marca los hexágonos que pisas (así nadie se salva sin avisar),
          // te saca si te caíste de la última capa, y no te deja flotar en el aire (más de 1,6 s en el aire sin bajar)
          if (vivoSP(yo.id) && v.pos.llego) {
            const r = sp.ronda, c = origenSpleef(), t = (ahora - r.inicio) / 1000, piso = pisoSpleef(yo.x - c.x, yo.z - c.z, yo.y, r.pisadas, t);
            if (piso && yo.y - piso.top < 0.5) pisarSP(piso.capa, piso.i);
            if (fueraSpleef(yo.y)) eliminarSP(yo.id, yo.nombre);   // (flotar en el aire lo frena vigilarPos, con la gravedad de verdad)
          }
          // Si su compu quedó muy lejos de donde dice el servidor (¿trampa?), le avisamos dónde está de verdad (como mucho 1 vez por segundo)
          if (v.corregido && Math.hypot(m.x - yo.x, m.y - yo.y, m.z - yo.z) > 2.5 && ahora - (yo.corregidoEn || 0) > 500) {   // (así tu compu y el servidor nunca quedan muy distintos)
            yo.corregidoEn = ahora;
            ws.send(JSON.stringify({ tipo: 'corrige', x: corto(yo.x), y: corto(yo.y), z: corto(yo.z) }));
          }
        } else { yo.vigilado = null; yo.x = m.x; yo.y = m.y; yo.z = m.z; }
        yo.rot = m.rot;
        if (m.color !== null) yo.color = m.color;
        ws.publish('juego', JSON.stringify({ tipo: 'pos', id: yo.id, x: yo.x, y: yo.y, z: yo.z, rot: m.rot, color: yo.color, mg: yo.mg, t: m.t }));   // t: su hora, para dibujarlo suave
      } else if (m.tipo === 'visible') {
        // Una pestaña escondida no corre el juego: si era el anfitrión, otro toma el control ya mismo (sin esperar 3 segundos)
        yo.visible = m.v;
        if (!m.v && yo.id === anfitrion) cambiarAnfitrion();
      } else if (m.tipo === 'look') {
        yo.look = m.look;
        ws.publish('juego', JSON.stringify({ tipo: 'look', id: yo.id, look: m.look }));
      } else if (m.tipo === 'moneda') {
        // Alguien agarró una moneda: aparece en otro lugar para todos (solo si de verdad estaba al lado de esa moneda)
        if (Math.hypot(yo.x - monedas[m.i].x, yo.z - monedas[m.i].z) > 3 || yo.y > 4) return;
        monedas[m.i] = lugarMoneda();
        aTodos({ tipo: 'moneda', i: m.i, x: corto(monedas[m.i].x), z: corto(monedas[m.i].z) });
      } else if (m.tipo === 'hora') {
        hora = { fase: m.fase, ms: Date.now() };
        aTodos({ tipo: 'hora', fase: m.fase, quien: yo.nombre });
      } else if (m.tipo === 'dia' && yo.id === anfitrion) {
        diaPueblo = m.dia;
        ws.publish('juego', JSON.stringify({ tipo: 'dia', dia: m.dia }));
      } else if (m.tipo === 'mundo' && yo.id === anfitrion) {
        ultimoMundo = Date.now(); yo.mandoMundo = true; yo.sinMundo = 0;
        ws.publish('juego', JSON.stringify(m));   // solo el anfitrión cuenta cómo está el mundo
      } else if (m.tipo === 'evento') {
        const host = conectados.get(anfitrion);
        if (host && host.id !== yo.id) host.ws.send(JSON.stringify({ tipo: 'evento', que: m.que, nombre: yo.nombre }));
      } else if (m.tipo === 'disparo') {
        ws.publish('juego', JSON.stringify({ ...m, id: yo.id }));
      } else if (m.tipo === 'an') {
        const r = an.ronda;
        if (m.que === 'entrar') { if (enOtraRonda(yo.id, 'an')) return avisoAN(ws, 'Estás jugando otra ronda: termínala primero'); salirDeOtrasEsperas(yo, 'an'); if (!an.espera.has(yo.id)) { an.espera.add(yo.id); avisarEsperaAN(); } }
        else if (m.que === 'salir') sacarDeAtrapadas(yo.id, yo.nombre);
        else if (m.que === 'empezar') {
          if (r) return avisoAN(ws, 'Ya hay una ronda jugándose: espera a que termine');
          if (!an.espera.has(yo.id)) return avisoAN(ws, 'Siéntate primero en la silla de Atrapadas Nocivas');
          const ids = [...an.espera].filter(id => conectados.has(id));
          if (ids.length < 2) return avisoAN(ws, 'Hacen falta al menos 2 jugadores');
          an.ronda = nuevaRondaAN(ids, Date.now());
          olvidarPos(ids);
          aTodos({ tipo: 'anRonda', jugadores: ids, ...estadoAN(an.ronda) });
          console.log(`👽 Empieza Atrapadas Nocivas: la mancha la tiene ${conectados.get(an.ronda.portador).nombre} (${ids.length} jugadores)`);
          avisarEsperaAN();
        } else if (m.que === 'pasar') {
          // Solo el portador, a alguien vivo, que esté cerca de verdad (con las últimas posiciones) y no de vuelta al toque
          const otro = conectados.get(m.a);
          if (!r || !otro || !seTocan(yo, otro, AN.tocarServidor)) return;
          const nueva = pasarAN(r, yo.id, m.a, Date.now());
          if (!nueva) return;
          an.ronda = nueva;
          // ¡Empujón! El que la recibe sale volando lejos del que se la pasó (así no se la devuelve al toque)
          const empuje = empujeAN(yo, otro);
          otro.extra = AN.empuje.extraM; otro.extraHasta = Date.now() + AN.empuje.extraMs; otro.empujeDir = empuje;   // el servidor lo deja moverse más un ratito (solo hacia allá)
          aTodos({ tipo: 'anPase', de: yo.id, a: m.a, empuje, ...estadoAN(nueva) });
        }
      } else if (m.tipo === 'cr') {
        const r = cr.ronda;
        if (m.que === 'entrar') { if (enOtraRonda(yo.id, 'cr')) return avisoCR(ws, 'Estás jugando otra ronda: termínala primero'); salirDeOtrasEsperas(yo, 'cr'); if (!cr.espera.has(yo.id)) { cr.espera.add(yo.id); avisarEsperaCR(); } }
        else if (m.que === 'salir') sacarDeCarrera(yo.id);
        else if (m.que === 'empezar') {
          if (r) return avisoCR(ws, 'Ya hay una carrera: espera a que termine');
          if (!cr.espera.has(yo.id)) return avisoCR(ws, 'Siéntate primero en la silla de la Carrera');
          const ids = [...cr.espera].filter(id => conectados.has(id));
          if (ids.length < 2) return avisoCR(ws, 'Hacen falta al menos 2 jugadores');
          cr.ronda = { jugadores: ids, inicio: Date.now(), llegadas: [], primera: null, salieron: [], semilla: Math.floor(Math.random() * 1e9) };
          olvidarPos(ids);
          aTodos({ tipo: 'crRonda', jugadores: ids, semilla: cr.ronda.semilla });   // (la semilla decide qué puertas son de verdad: las mismas para todos)
          console.log(`🏁 Empieza la Carrera (${ids.length} jugadores)`);
          avisarEsperaCR();
        } else if (m.que === 'llegue') {
          // Solo vale si el servidor también te ve en la meta (con tu última posición revisada)
          if (!enRondaCR(yo.id) || r.llegadas.includes(yo.id)) return;
          if ((yo.cpCarrera || 0) < CARRERA.checkpoints) return avisoCR(ws, '¡Te faltan checkpoints! Hay que pasar por todos, en orden');   // (nada de atajos)
          const c = origenCarrera();
          if (!enMetaCarrera({ x: yo.x - c.x, y: yo.y + 0.5, z: yo.z - c.z })) return;
          r.llegadas.push(yo.id); if (!r.primera) r.primera = Date.now();
          aTodos({ tipo: 'crLlegada', id: yo.id, puesto: r.llegadas.length, nombre: yo.nombre });
          revisarCR();
        } else if (m.que === 'golpe') {
          // Te pegó un puño o una barra: si es verdad (estabas cerca y te podía pegar), te deja moverte más hacia allá un ratito
          if (!enRondaCR(yo.id)) return;
          const g = golpeValidoCarrera(m.o, yo, (Date.now() - r.inicio) / 1000);
          if (!g) return;
          yo.extra = CARRERA.empuje.extraM; yo.extraHasta = Date.now() + CARRERA.empuje.extraMs; yo.empujeDir = { x: g.x, z: g.z };
        }
      } else if (m.tipo === 'sp') {
        const r = sp.ronda;
        if (m.que === 'entrar') { if (enOtraRonda(yo.id, 'sp')) return avisoSP(ws, 'Estás jugando otra ronda: termínala primero'); salirDeOtrasEsperas(yo, 'sp'); if (!sp.espera.has(yo.id)) { sp.espera.add(yo.id); avisarEsperaSP(); } }
        else if (m.que === 'salir') sacarDeSpleef(yo.id, yo.nombre);
        else if (m.que === 'empezar') {
          if (r) return avisoSP(ws, 'Ya hay un Spleef: espera a que termine');
          if (!sp.espera.has(yo.id)) return avisoSP(ws, 'Siéntate primero en la silla del Spleef');
          const ids = [...sp.espera].filter(id => conectados.has(id));
          if (ids.length < 2) return avisoSP(ws, 'Hacen falta al menos 2 jugadores');
          sp.ronda = { jugadores: ids, vivos: [...ids], orden: [], inicio: Date.now(), pisadas: Array.from({ length: SPLEEF.capas }, () => new Map()), salieron: [] };
          sp.nuevas = [];
          olvidarPos(ids);
          aTodos({ tipo: 'spRonda', jugadores: ids });
          console.log(`🔶 Empieza el Spleef (${ids.length} jugadores)`);
          avisarEsperaSP();
        } else if (m.que === 'pisa') {
          // Los hexágonos que dice que pisó: solo los que tiene cerca de verdad (con su posición en el servidor)
          if (!vivoSP(yo.id)) return;
          for (const [k, i] of m.h) if (pisadaValida(k, i, yo)) pisarSP(k, i);
        }
      } else if (m.tipo === 'esc') {
        const r = esc.ronda;
        if (m.que === 'entrar') { if (enOtraRonda(yo.id, 'esc')) return avisoEsc(ws, 'Estás jugando otra ronda: termínala primero'); salirDeOtrasEsperas(yo, 'esc'); if (!esc.espera.has(yo.id)) { esc.espera.add(yo.id); avisarEspera(); } }   // (si ya estaba, no avisa de nuevo)
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
          if (!puedeEncontrar(yo, otro)) return;   // (no lo tocó de verdad: nada)
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
      sacarDeAtrapadas(yo.id, yo.nombre);
      sacarDeCarrera(yo.id);
      sacarDeSpleef(yo.id, yo.nombre);
      console.log(`💥 ${yo.nombre} se desconectó (${conectados.size} jugando)`);
    },
  },
});

// Elige como anfitrión a alguien que esté jugando ahora (que haya mandado algo hace poco)
// Solo sirve alguien con la pestaña a la vista y que esté jugando ahora. Si no hay nadie así, se queda el mismo
// (pasarle el control a otra pestaña escondida solo haría que el gigante y los bots salten de una compu a otra).
function cambiarAnfitrion() {
  const antes = anfitrion;
  const viejo = conectados.get(anfitrion);
  if (viejo && Date.now() - ultimoMundo > 3000) viejo.sinMundo = Date.now();   // (no mandó cómo está el mundo: por un minuto no vuelve a ser anfitrión)
  const activos = [...conectados.values()].filter(j => j.id !== anfitrion && j.visible && Date.now() - (j.ultimo || 0) < 2000 && Date.now() - (j.sinMundo || 0) > 60000)
    .sort((a, b) => (b.mandoMundo ? 1 : 0) - (a.mandoMundo ? 1 : 0));   // primero los que ya fueron buenos anfitriones
  const nuevo = activos[0] || (conectados.has(anfitrion) ? null : [...conectados.values()][0]);
  if (nuevo) anfitrion = nuevo.id;
  else if (!conectados.has(anfitrion)) anfitrion = null;
  ultimoMundo = Date.now();
  if (anfitrion && anfitrion !== antes) aTodos({ tipo: 'anfitrion', id: anfitrion });   // si sigue el mismo, no se avisa (si no, sus bots se reinician cada 3 segundos)
  if (nuevo) console.log(`👑 ${nuevo.nombre} ahora es el anfitrión`);
}
// Si el anfitrión se quedó callado 3 segundos (cambió de pestaña o se le trabó la compu), otro toma el control
setInterval(() => {
  if (anfitrion && conectados.size > 1 && Date.now() - ultimoMundo > 3000) cambiarAnfitrion();
}, 1000);

// ¿Se acabó el tiempo de la ronda de Escondidas?
setInterval(revisarFinRonda, 250);
setInterval(revisarAN, 100);   // ¿explotó alguien?
setInterval(revisarCR, 500);   // ¿se terminó la carrera?
setInterval(() => { if (sp.ronda && sp.nuevas.length) aTodos({ tipo: 'spPisa', h: sp.nuevas.splice(0, 300) }); else sp.nuevas.length = 0; revisarSP(); }, 100);   // 🔶 los hexágonos pisados, a todos

// Cada 10 segundos guarda a todos (por si la compu se apaga de golpe) y corrige la hora de todos
setInterval(() => {
  for (const j of conectados.values()) guardar(j);
  aTodos({ tipo: 'hora', fase: faseDeAhora() });
}, 10000);

console.log(`🟩 Servidor de Rectángulo Verde en http://localhost:${servidor.port}`);
console.log('   Para que entren tus amigos, en otra terminal: npm run tunel');
