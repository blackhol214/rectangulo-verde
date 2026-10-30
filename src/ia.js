// 🧠 El SANDBOX de The Guy: un bot que aprende a jugar solo, probando y equivocándose (como en "AI Warehouse").
// Todo es lógica pura (sin Three.js ni pantalla): el juego solo dibuja lo que pasa aquí, y los tests lo pueden probar.
//
// ¿Cómo aprende? Con "subir la colina" (hill climbing), la forma más simple de neuroevolución:
//  1. Su "cerebro" son unos pocos números (pesos). Con ellos decide hacia dónde caminar y si salta.
//  2. En cada intento prueba un cerebro un poquito cambiado al azar (una mutación).
//  3. Si con ese cerebro sacó MÁS puntos que con el mejor que tenía, se lo queda. Si no, lo tira.
// Al principio sus pesos son al azar y además hace muchas cosas al azar ("explora"); con los intentos explora menos.
// (las versiones ?v= tienen que ser las mismas que en index.html: así el navegador usa una sola copia de cada archivo)
import { seededRandom, torreNoMires, botVe, tapanVista, saveKey, cajasDe, NO_MIRES, TERRENOS, cajasTerreno, OJO, BOT_ESC, plataformasAN, desplazamientoAN, portalesAN, portalCerca, ARENA_AN, CARROS, CARRO, carroPos, partesCarro, cajasTortugas, elegirObjetivoAN, launchSpeedForHeight, puedeDobleSalto, escondites, ordenEscondites } from './logic.js?v=2026-11-02-ritmo';
import { AN, ESC, nuevaRondaAN, pasarAN, explotarAN, seTocan, mareadoAN, empujeAN, limpiarNombre } from './red.js?v=2026-11-02-ritmo';

export const SALAS = ['torre', 'escondidas', 'atrapadas'];
export const NOMBRE_SALA = { torre: 'No mires abajo', escondidas: 'Escondidas', atrapadas: 'Atrapadas Nocivas' };
// La física de siempre (la misma del juego): gravedad 30, salto 12,5 y caminar a 12 (en Atrapadas, 15)
export const FISICA = { grav: 30, salto: 12.5, vel: 12, dt: 1 / 30 };
export const EPISODIO_S = { torre: 25, escondidas: (ESC.esconderMs + ESC.buscarMs) / 1000, atrapadas: 120 };   // Escondidas: 30 s para esconderse + 100 s de búsqueda (como el juego)   // cuánto dura cada intento (en segundos del juego)

// ---------- 🏆 Las recompensas (las inventó Mathias) ----------
export const RECOMPENSAS = {
  // quieto (torre): un castiguito por quedarse quieto mucho rato. Sin esto, el "truco" más fácil sería no moverse NUNCA
  // de la plataforma gigante (0 puntos, sin castigos): eso se llama "hacer trampa con el premio" (reward hacking)
  torre: { checkpoint: 5, atras: -3, caida: -4, quieto: -1, quietoS: 5 },   // +5 por cada plataforma nueva · ir para atrás y caerse, castigo
  escondidas: { escondidoPorSeg: 1, vistoPorSeg: -1, quieto: -3, quietoS: 4, encontrado: -10 }, // escondido suma · si lo ven resta · quieto mucho rato y que lo encuentren: ¡castigo!
  atrapadas: { sinManchaPorSeg: 1, teLaPasan: -5, explotas: -10, ganas: 10 },  // cada segundo sin la mancha suma · que te la pasen o explotar, castigo
};
// Cuántos puntos da (o quita) cada cosa que pasa. evento: { tipo, seg? }. castigo: si hay que sacudirlo (¡como licuadora!)
export function recompensa(sala, ev) {
  const R = RECOMPENSAS[sala];
  switch (`${sala}:${ev.tipo}`) {
    case 'torre:checkpoint': return { puntos: R.checkpoint, castigo: false };
    case 'torre:atras': return { puntos: R.atras, castigo: true };
    case 'torre:caida': return { puntos: R.caida, castigo: true };
    case 'torre:quieto': return { puntos: R.quieto, castigo: false };   // (chiquito y sin sacudida: solo para que no se quede ahí para siempre)
    case 'escondidas:escondido': return { puntos: R.escondidoPorSeg * ev.seg, castigo: false };
    case 'escondidas:visto': return { puntos: R.vistoPorSeg * ev.seg, castigo: false };
    case 'escondidas:quieto': return { puntos: R.quieto, castigo: true };
    case 'escondidas:encontrado': return { puntos: R.encontrado, castigo: true };
    case 'atrapadas:sinMancha': return { puntos: R.sinManchaPorSeg * ev.seg, castigo: false };
    case 'atrapadas:teLaPasan': return { puntos: R.teLaPasan, castigo: true };
    case 'atrapadas:explotas': return { puntos: R.explotas, castigo: true };
    case 'atrapadas:ganas': return { puntos: R.ganas, castigo: false };
    default: return { puntos: 0, castigo: false };
  }
}

// ---------- 🧠 El cerebro: una "neurona" por cada cosa que decide ----------
// entradas (6 números, ver "sentidos") → salidas: ir hacia la meta, ir de costado, saltar y QUEDARSE QUIETO.
// Cada salida = tanh(suma de entrada × peso). Quedarse quieto es una decisión más: él aprende cuándo le conviene.
export const ENTRADAS = 6, SALIDAS = 4;
export function cerebroNuevo(semilla) {
  const rnd = seededRandom(semilla);
  const pesos = Array.from({ length: ENTRADAS * SALIDAS }, () => (rnd() * 2 - 1) * 0.5);   // pesos chiquitos al azar: no sabe nada
  return { pesos, mejor: { pesos: [...pesos], puntaje: 0 }, intento: 0, sigma: 0.6, historial: [], semilla };
}
// sentido = { dir: hacia dónde queda su meta, entradas }. Salidas: adelante (hacia la meta), lado (de costado) y saltar
export function decidir(pesos, sentido) {
  const s = [], e = sentido.entradas, d = sentido.dir;
  for (let j = 0; j < SALIDAS; j++) {
    let t = 0;
    for (let i = 0; i < ENTRADAS; i++) t += pesos[j * ENTRADAS + i] * e[i];
    s.push(Math.tanh(t));
  }
  // adelante y lado → hacia dónde camina de verdad (x, z)
  if (s[3] > 0.3) return { mx: 0, mz: 0, saltar: false, quieto: true, adelante: 0, lado: 0 };   // 🧘 decidió quedarse quieto
  return { mx: s[0] * d.x - s[1] * d.z, mz: s[0] * d.z + s[1] * d.x, saltar: s[2] > 0, quieto: false, adelante: s[0], lado: s[1] };
}
// Cuánto hace cosas al azar (explora): mucho al principio, poquito después de muchos intentos
export const exploracion = intento => Math.max(0.03, 0.6 * Math.pow(0.93, intento));
// Un cerebro "mutado": el mejor, con un poquito de ruido en cada peso
// (cambia solo algunos pesos por vez: así es más fácil saber qué cambio sirvió)
export function mutar(pesos, sigma, rnd) {
  const n = pesos.length, cambiar = new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => Math.floor(rnd() * n)));
  return pesos.map((w, i) => (cambiar.has(i) ? w + gauss(rnd) * sigma * 2 : w));
}
function gauss(rnd) { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
// Qué cerebro prueba en el próximo intento: el mejor que tiene, con una mutación
export function proximoCerebro(c) {
  const rnd = seededRandom(c.semilla * 7919 + c.intento * 104729 + 13);
  return { pesos: mutar(c.mejor.pesos, c.sigma, rnd) };
}
// El juez: ¿cuántos puntos saca el agente k con estos cerebros, en pruebas "limpias" (sin cosas al azar)?
// Se juzga al cerebro nuevo y al mejor con las MISMAS pruebas: así es justo (los dos con la misma suerte)
// En Atrapadas el juez mira solo a The Guy (los otros 4 bots aprenden con lo que sacaron en el intento que se vio: son muchos)
export const PRUEBAS_JUEZ = { torre: 2, escondidas: 1, atrapadas: 3 };
export function juzgar(sala, pesosDeTodos, k, semilla, opciones = {}) {
  let suma = 0;
  for (let i = 0; i < PRUEBAS_JUEZ[sala]; i++) suma += correrEpisodio(sala, pesosDeTodos, null, semilla * 31 + i, true, opciones)[k];
  return suma / PRUEBAS_JUEZ[sala];
}
// Terminó un intento: visto = los puntos del intento que se vio · nota = { nueva, mejor } (lo que dijo el juez)
// Si el cerebro nuevo sacó igual o más que el mejor, ¡se lo queda! (devuelve el cerebro nuevo, sin cambiar el viejo)
export function aprender(c, prueba, visto, nota) {
  visto = Number.isFinite(visto) ? visto : 0;   // (si algo raro dio "no es un número", cuenta como 0)
  if (!Number.isFinite(nota.nueva)) nota = { ...nota, nueva: -Infinity };
  if (!Number.isFinite(nota.mejor)) nota = { ...nota, mejor: -Infinity };
  const n = { ...c, intento: c.intento + 1, historial: [...c.historial, visto].slice(-200) };   // historial: los puntos de cada intento que se vio
  if (nota.nueva > nota.mejor && prueba.pesos.every(Number.isFinite)) { n.mejor = { pesos: prueba.pesos, puntaje: nota.nueva }; n.sigma = Math.max(0.08, c.sigma * 0.97); }   // ¡mejor! se lo queda
  else if (nota.nueva === nota.mejor) { n.mejor = { pesos: prueba.pesos, puntaje: nota.nueva }; n.sigma = Math.min(2, c.sigma * 1.05); }   // igual de bien: se lo queda, y la próxima prueba cosas más distintas
  else { n.mejor = { ...c.mejor, puntaje: Number.isFinite(nota.mejor) ? nota.mejor : c.mejor.puntaje }; n.sigma = Math.min(2, c.sigma * 1.05); }   // no mejoró: prueba cambios un poquito más grandes
  if (!n.mejor.pesos.every(Number.isFinite)) n.mejor = { ...c.mejor };   // (nunca se queda con un cerebro roto)
  if (!Number.isFinite(n.mejor.puntaje)) n.mejor = { ...n.mejor, puntaje: Number.isFinite(c.mejor.puntaje) ? c.mejor.puntaje : 0 };
  n.notas = [...(c.notas || []), n.mejor.puntaje].slice(-200);   // notas: lo que saca su mejor cerebro (para el gráfico)
  return n;
}
// Después de cada intento "piensa": prueba en su cabeza IDEAS más (otras mutaciones) y el juez compara todas con su mejor.
// Es una función que va de a poquito (yield): así el juego no se traba mientras piensa
export const IDEAS = { torre: 6, escondidas: 2, atrapadas: 2 };
export function* pensar(sala, cerebros, pruebas, vistos, opciones = {}) {
  const semilla = semillaIntento(sala, cerebros[0].intento) + 7, mejores = cerebros.map(c => c.mejor.pesos), out = [];
  for (let k = 0; k < cerebros.length; k++) {
    const c = cerebros[k];
    if (opciones.soloAprende !== undefined && opciones.soloAprende !== k) { out.push(c); continue; }   // (para medir: los demás no aprenden)
    if (!PRUEBAS_JUEZ[sala] || (sala === 'atrapadas' && k > 0)) {   // sin juez: compara lo que sacó con lo que venía sacando su mejor cerebro (que se va "olvidando" un poquito)
      out.push(aprender(c, pruebas[k], vistos[k], { nueva: vistos[k], mejor: c.intento ? c.mejor.puntaje * 0.97 : -Infinity }));
      continue;
    }
    const rnd = seededRandom(semilla * 13 + k);
    const ideas = [pruebas[k].pesos, ...Array.from({ length: IDEAS[sala] }, () => mutar(c.mejor.pesos, c.sigma, rnd))];
    const notaMejor = juzgar(sala, mejores, k, semilla, opciones); yield;
    let mejorIdea = null, notaIdea = -Infinity;
    for (const pesos of ideas) {
      const nota = juzgar(sala, mejores.map((p, j) => (j === k ? pesos : p)), k, semilla, opciones); yield;
      if (nota > notaIdea) { notaIdea = nota; mejorIdea = pesos; }
    }
    out.push(aprender(c, { pesos: mejorIdea }, vistos[k], { nueva: notaIdea, mejor: notaMejor }));
  }
  return out;
}
// Lo mismo, de una sola vez (para los tests)
export function terminarIntento(sala, cerebros, pruebas, vistos, opciones = {}) {
  const g = pensar(sala, cerebros, pruebas, vistos, opciones);
  let r = g.next(); while (!r.done) r = g.next();
  return r.value;
}

// ---------- 🏗️ Las salas: los MISMOS mapas que los modos de verdad (mismas piezas, mismas cajas para chocar) ----------
// Cada caja: { x0, x1, z0, z1, y0, y1 } (en metros, desde el centro de su mapa). Todo choca igual: se puede subir encima,
// las paredes no se atraviesan y lo de arriba es techo.
// Torre: la de verdad ("No mires abajo"), pero la primera plataforma es ENORME (así casi no se cae al principio).
// El Guy practica la primera etapa: desde el inicio hasta el primer checkpoint.
export const SANDBOX_TORRE = { inicioLado: 18 };
export function torreSandbox() {
  return torreNoMires().map((p, i) => (i === 0 ? { ...p, ancho: SANDBOX_TORRE.inicioLado, largo: SANDBOX_TORRE.inicioLado } : p));
}
// (las salas se arman una sola vez y se guardan: son siempre iguales, y así los intentos van mucho más rápido)
const salasHechas = new Map();
const unaVez = (clave, hacer) => { if (!salasHechas.has(clave)) salasHechas.set(clave, hacer()); return salasHechas.get(clave); };
// Para chocar rápido: las cajas ordenadas en cuadros de 16 m (cada una en los cuadros que toca, con 1 m de margen).
// Así cada uno revisa solo las cajas de SU cuadro, no las 100 del mapa
export const CELDA = 16;
const claveCelda = (i, j) => i * 100003 + j;
export function indexarCajas(cajas) {
  const m = new Map();
  for (const c of cajas) for (let i = Math.floor((c.x0 - 1) / CELDA); i <= Math.floor((c.x1 + 1) / CELDA); i++) for (let j = Math.floor((c.z0 - 1) / CELDA); j <= Math.floor((c.z1 + 1) / CELDA); j++) {
    const k = claveCelda(i, j); if (!m.has(k)) m.set(k, []); m.get(k).push(c);
  }
  return m;
}
const NADA = [];
export const cajasDelCuadro = (indice, x, z) => indice.get(claveCelda(Math.floor(x / CELDA), Math.floor(z / CELDA))) || NADA;
export function salaTorre() {
  return unaVez('torre', () => {
    const todas = torreSandbox(), fin = todas.findIndex(p => p.tipo === 'checkpoint'), G = NO_MIRES.grosor;
    const plats = todas.slice(0, fin + 1);
    const cajas = plats.flatMap((p, i) => cajasDe(p).map(c => ({ x0: p.x + c.x - c.hw, x1: p.x + c.x + c.hw, z0: p.z + c.z - c.hd, z1: p.z + c.z + c.hd, y0: p.y - G, y1: p.y, plat: i })));
    return { plats, cajas, indice: indexarCajas(cajas), inicio: { x: plats[0].x, y: plats[0].y, z: plats[0].z }, piso: 0 };
  });
}
// Escondidas: los 3 terrenos gigantes de verdad (salón, habitación, cocina), con sus muebles. El buscador ve con botVe (el del juego)
export function salaEscondidas(terreno = 0) {
  return unaVez('escondidas' + terreno, () => {
    const T = TERRENOS[terreno], cajas = cajasTerreno(T);
    // Los escondites posibles: detrás de los muebles que tapan la vista (los que llegan a la altura de los ojos), sin las 4 paredes
    const tapan = cajas.slice(4).filter(c => c.y0 <= OJO && c.y1 >= OJO && Math.max(c.x1 - c.x0, c.z1 - c.z0) >= 1.5);
    return { terreno, cajas, indice: indexarCajas(cajas), ojos: tapanVista(cajas), tapan, lugares: escondites(T), limX: T.ancho / 2 - 0.6, limZ: T.largo / 2 - 0.6,
      inicio: { x: T.spawn.x + 6, y: 0, z: T.spawn.z }, buscador: { x: T.spawn.x, z: T.spawn.z }, piso: 0 };
  });
}
// Atrapadas: la arena de verdad (plataformas negras, las que se mueven y los portales verdes)
export function salaAtrapadas() {
  return unaVez('atrapadas', () => {
    const plats = plataformasAN(), quietas = cajasArena({ plats: plats.filter(p => !p.mueve) }, 0);
    return { plats, quietas: plats.filter(p => !p.mueve), mueven: plats.filter(p => p.mueve), indice: indexarCajas(quietas), portales: portalesAN(),
      limX: ARENA_AN.mitad - 1, limZ: ARENA_AN.mitad - 1, mitad: ARENA_AN.mitad, piso: 0, inicio: { x: 0, y: 0, z: 0 } };
  });
}
// Las cajas de la arena en el segundo t (las que se mueven, donde estén en ese momento)
export function cajasArena(def, t) {
  return def.plats.map(p => {
    const off = desplazamientoAN(p, t), x = p.x + (p.mueve && p.mueve.eje === 'x' ? off : 0), y = p.y + (p.mueve && p.mueve.eje === 'y' ? off : 0);
    return { x0: x - p.lado / 2, x1: x + p.lado / 2, z0: p.z - p.lado / 2, z1: p.z + p.lado / 2, y0: y - 0.8, y1: y };
  });
}
// Los carros de juguete de la habitación (se mueven según el reloj, igual que en el juego): la cubierta y la cabina
export function cajasCarros(t) {
  return [...CARROS.flatMap((_, i) => {
    const p = carroPos(i, t), partes = partesCarro(p.giro, i);   // (cada carro con su forma)
    return [partes.cubierta, partes.cabina].map(q => ({ x0: p.x + q.x - q.hw, x1: p.x + q.x + q.hw, z0: p.z + q.z - q.hd, z1: p.z + q.z + q.hd, y0: 0, y1: q.top }));
  }), ...cajasTortugas(t)];   // y las tortugas de cuerda
}
// La física de todos (el Guy, los bots y el buscador): caminar chocando con las cajas, gravedad y aterrizar encima de algo.
// Devuelve la caja sobre la que quedó parado (o null si está en el piso / en el aire)
export const ALTO = 2, RADIO = 0.4;
export function moverConCajas(a, dx, dz, cajas, dt, piso = 0) {
  a.x += dx; a.z += dz; a.choco = false;
  for (const c of cajas) {   // de costado: si está a la altura de la caja, lo saca por el lado más cercano
    if (a.y >= c.y1 - 0.05 || a.y + ALTO <= c.y0) continue;
    if (a.x <= c.x0 - RADIO || a.x >= c.x1 + RADIO || a.z <= c.z0 - RADIO || a.z >= c.z1 + RADIO) continue;
    const op = [[c.x0 - RADIO - a.x, 'x'], [c.x1 + RADIO - a.x, 'x'], [c.z0 - RADIO - a.z, 'z'], [c.z1 + RADIO - a.z, 'z']].sort((p, q) => Math.abs(p[0]) - Math.abs(q[0]))[0];
    if (op[1] === 'x') a.x += op[0]; else a.z += op[0];
    a.choco = true;   // chocó con algo de costado (el buscador salta cuando pasa esto)
  }
  const yAntes = a.y;
  a.vy -= FISICA.grav * dt; a.y += a.vy * dt;
  let suelo = piso ?? -Infinity, sobre = null;
  for (const c of cajas) {
    if (a.x < c.x0 || a.x > c.x1 || a.z < c.z0 || a.z > c.z1) continue;
    if (c.y1 <= yAntes + 0.01 && c.y1 > suelo) { suelo = c.y1; sobre = c; }   // algo abajo: el piso más alto
    else if (a.vy > 0 && yAntes + ALTO <= c.y0 && a.y + ALTO > c.y0) { a.y = c.y0 - ALTO; a.vy = 0; }   // se dio en la cabeza con un techo
  }
  if (a.y <= suelo) { a.y = suelo; a.vy = 0; a.suelo = true; } else { a.suelo = false; sobre = null; }
  return sobre;
}

// ---------- 🏃 Un intento (episodio) ----------
// cerebros: un array de pesos (en Atrapadas 5: el 0 es The Guy). semilla: para que el mismo intento salga siempre igual
// limpio: sin cosas al azar (para el juez). En Escondidas el terreno cambia con cada intento (salón, habitación, cocina)
export const terrenoDe = semilla => Math.abs(semilla) % TERRENOS.length;
// opciones.terreno: en Escondidas, en qué terreno (el que estás mirando); si no, cambia con cada intento
export function crearEpisodio(sala, cerebros, intentos, semilla, limpio = false, opciones = {}) {
  const rnd = seededRandom(semilla), def = sala === 'torre' ? salaTorre() : sala === 'escondidas' ? salaEscondidas(opciones.terreno ?? terrenoDe(semilla)) : salaAtrapadas();
  const n = sala === 'atrapadas' ? 5 : 1;
  const agentes = Array.from({ length: n }, (_, k) => {
    const ang = (k / n) * Math.PI * 2, r = n > 1 ? 12 : 0;   // en Atrapadas empiezan en un círculo de 12 m, como en el juego
    return { x: def.inicio.x + Math.cos(ang) * r, y: def.inicio.y, z: def.inicio.z + Math.sin(ang) * r, vy: 0, ex: 0, ez: 0, suelo: true, pisaba: true,
      pesos: cerebros[k], explora: limpio ? 0 : exploracion((intentos && intentos[k]) ?? 0), accion: null, cambia: 0, puntaje: 0, temblor: 0, vivo: true,
      plat: 0, maxPlat: 0, saltosAire: 0, dobles: 0, quieto: 0, ultX: 0, ultZ: 0, visto: false, portalListo: 0 };
  });
  const ep = { sala, def, rnd, t: 0, fin: false, agentes, eventos: [] };
  if (sala === 'escondidas') {
    ep.buscador = { x: def.buscador.x, y: 0, z: def.buscador.z + 4, vy: 0, suelo: true, modo: 'contar', orden: ordenEscondites(def.lugares, rnd), paso: 0, camino: null, salida: null, olvido: 0, tMeta: 0, metaVieja: null, esquivar: 0, lado: 1, atascado: 0, choco: false };
    for (const a of agentes) { a.ultX = a.x; a.ultZ = a.z; a.ruta = rutaEscondite(def, a); }
  }
  if (sala === 'atrapadas') ep.ronda = nuevaRondaAN(agentes.map((_, k) => k), 0, rnd);
  return ep;
}
// Los "sentidos" de cada agente: hacia dónde queda "su meta" (dir) y 6 números que le cuentan qué pasa
// (siempre el último es 1: el "sesgo"). El cerebro decide cuánto ir hacia la meta (adelante), de costado (lado) y si salta.
//  · Torre: la meta es la plataforma siguiente · Escondidas: el escondite más cercano (detrás de un mueble)
//  · Atrapadas: si tiene la mancha, el más cercano; si no, alejarse del que la tiene
export function sentidos(ep, k) {
  const a = ep.agentes[k], dirA = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };
  if (ep.sala === 'torre') {
    const P = ep.def.plats, sig = P[Math.min(P.length - 1, a.plat + 1)];
    const dx = sig.x - a.x, dz = sig.z - a.z, d = Math.hypot(dx, dz);
    return { dir: dirA(dx, dz), entradas: [Math.min(d, 8) / 4, (sig.y - a.y) / 2, a.suelo ? 1 : 0, Math.min(d, 1), a.plat === a.maxPlat ? 1 : 0, 1] };
  }
  if (ep.sala === 'escondidas') {
    // su meta: el próximo punto del camino a su escondite (la entrada de la cueva y después adentro)
    const b = ep.buscador, h = a.ruta[0], hx = h.x - a.x, hz = h.z - a.z, hd = Math.hypot(hx, hz);
    const sd = Math.hypot(a.x - b.x, a.z - b.z);
    return { dir: dirA(hx, hz), entradas: [Math.min(hd, 10) / 5, Math.min(sd, 30) / 15, a.visto ? 1 : 0, a.quieto / RECOMPENSAS.escondidas.quietoS, Math.min(hd, 1), 1] };
  }
  const r = ep.ronda, soy = r && r.portador === k;
  let tx = 0, tz = 0, d = 20;
  if (r && soy) {
    let mejor = null;
    // (el más cercano que puede alcanzar: los que están trepados muy alto no le sirven)
    const obj = elegirObjetivoAN(a, [...r.vivos].filter(id => id !== k).map(id => ({ id, ...ep.agentes[id] })), {}, 0);
    if (obj) { mejor = ep.agentes[obj.id]; d = Math.hypot(mejor.x - a.x, mejor.z - a.z); tx = mejor.x - a.x; tz = mejor.z - a.z; }
  } else if (r && r.portador !== null) {
    const p = ep.agentes[r.portador]; d = Math.hypot(a.x - p.x, a.z - p.z); tx = a.x - p.x; tz = a.z - p.z;
  }
  const borde = Math.min(ep.def.mitad - Math.abs(a.x), ep.def.mitad - Math.abs(a.z)) / ep.def.mitad;   // ¿qué tan cerca de la pared?
  return { dir: dirA(tx, tz), entradas: [Math.min(d, 20) / 10, soy ? 1 : -1, borde, Math.min(d, 2) / 2, mareadoAN(r, k, ep.t * 1000) ? 1 : 0, 1] };
}
// El camino al escondite de verdad más cercano (una cueva del terreno): primero su entrada y después adentro
export function rutaEscondite(def, a) {
  let mejor = null, dm = Infinity;
  for (const l of def.lugares) { if (!l.entrada) continue; const d = Math.hypot(l.entrada.x - a.x, l.entrada.z - a.z); if (d < dm) { dm = d; mejor = l; } }
  return mejor ? [{ x: mejor.entrada.x, z: mejor.entrada.z }, { x: mejor.x, z: mejor.z }] : [{ x: a.x, z: a.z }];
}
// El mejor escondite: detrás del mueble más cercano que tapa la vista (del lado contrario al buscador)
export function escondite(ep, a) {
  const b = ep.buscador; let mejor = null, dm = Infinity;
  for (const c of ep.def.tapan) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, vx = cx - b.x, vz = cz - b.z, v = Math.hypot(vx, vz) || 1;
    const r = Math.abs(vx / v) * (c.x1 - c.x0) / 2 + Math.abs(vz / v) * (c.z1 - c.z0) / 2 + 1;   // justo detrás del borde
    const p = { x: cx + vx / v * r, z: cz + vz / v * r }, d = Math.hypot(p.x - a.x, p.z - a.z);
    if (d < dm) { dm = d; mejor = p; }
  }
  return mejor || { x: a.x, z: a.z };
}
// Probar algo al azar (para explorar): a veces quedarse quieto, a veces caminar para cualquier lado y saltar
export function accionAlAzar(rnd) {
  if (rnd() < 0.15) return { mx: 0, mz: 0, saltar: false, quieto: true };
  return { mx: rnd() * 2 - 1, mz: rnd() * 2 - 1, saltar: rnd() < 0.3, quieto: false };
}
const sumar = (ep, a, sala, ev) => {
  if (ev.seg !== undefined) { a.puntaje += recompensa(sala, ev).puntos; return; }   // lo de "por segundo" (pasa en cada paso): solo suma, sin anotarlo
  const r = recompensa(sala, ev);
  a.puntaje += r.puntos;
  if (r.castigo) a.temblor = 0.7;   // ¡a temblar como licuadora!
  ep.eventos.push({ ...ev, k: ep.agentes.indexOf(a), puntos: r.puntos });
};
// Un paso del juego (1/30 de segundo). Devuelve el episodio (cambiado: es el "estado" del intento)
export function pasoEpisodio(ep) {
  if (ep.fin) return ep;
  const dt = FISICA.dt, S = ep.sala, def = ep.def;
  ep.t += dt;
  ep.eventos = [];
  // lo que se mueve (la arena, los carros y las tortugas) se calcula cada paso; lo quieto se busca en su cuadro
  const moviles = S === 'atrapadas' ? cajasArena({ plats: def.mueven }, ep.t) : S === 'escondidas' && def.terreno === 1 ? cajasCarros(ep.t) : NADA;
  ep.moviles = moviles;
  const cajasCerca = (x, z) => (def.indice ? (moviles.length ? cajasDelCuadro(def.indice, x, z).concat(moviles) : cajasDelCuadro(def.indice, x, z)) : moviles);
  ep.agentes.forEach((a, k) => {
    a.temblor = Math.max(0, a.temblor - dt);
    if (!a.vivo) return;
    // 1. Decide (cada 0,2 s). A veces hace algo al azar: así explora
    if ((a.cambia -= dt) <= 0) {
      a.cambia = 0.2;
      a.accion = ep.rnd() < a.explora ? accionAlAzar(ep.rnd) : decidir(a.pesos, sentidos(ep, k));
    }
    const mareado = S === 'atrapadas' && mareadoAN(ep.ronda, k, ep.t * 1000);
    const vel = S === 'atrapadas' ? AN.vel : FISICA.vel, ac = mareado ? { mx: 0, mz: 0, saltar: false } : a.accion;
    const m = Math.min(1, Math.hypot(ac.mx, ac.mz));
    const ux = m > 0.15 ? ac.mx / (Math.hypot(ac.mx, ac.mz) || 1) * m : 0, uz = m > 0.15 ? ac.mz / (Math.hypot(ac.mx, ac.mz) || 1) * m : 0;
    if (ac.saltar && a.suelo) { a.vy = FISICA.salto; a.suelo = false; }
    // 🦘 En la torre también tiene DOBLE SALTO (como tú): en el aire, si "salta" otra vez, salta una vez más.
    // Su "volver a apretar" es cuando ya dejó de subir (vy ≤ 0). En el sandbox la energía es infinita: no gasta batería.
    else if (S === 'torre' && ac.saltar && puedeDobleSalto({ enElPiso: a.suelo, saltosEnAire: a.saltosAire, apretoRecien: a.vy <= 0, bateria: Infinity })) {
      a.vy = FISICA.salto; a.saltosAire++; a.dobles++;   // (dobles: el juego lo cuenta para dibujar el anillo y el sonido)
    }
    // 2. Se mueve chocando con las cajas del mapa (con el empujón que traiga, que se va frenando)
    const sobre = moverConCajas(a, (ux * vel + a.ex) * dt, (uz * vel + a.ez) * dt, cajasCerca(a.x, a.z), dt, def.piso);
    const freno = Math.exp(-(a.suelo ? 6 : 0.4) * dt); a.ex *= freno; a.ez *= freno;
    if (a.suelo) a.saltosAire = 0;   // tocó el piso: se recarga el doble salto
    if (sobre && sobre.salto && a.suelo) { a.vy = launchSpeedForHeight(sobre.salto, FISICA.grav); a.suelo = false; }   // ¡un trampolín! (como en el juego)
    if (S !== 'torre') { a.x = Math.min(def.limX, Math.max(-def.limX, a.x)); a.z = Math.min(def.limZ, Math.max(-def.limZ, a.z)); }
    // 3. Lo que pasa en la torre: ¿llegó a una plataforma nueva? ¿volvió para atrás? ¿se cayó al piso?
    if (S === 'torre' && a.suelo && !a.pisaba) {   // recién aterrizó
      if (sobre) {
        const en = sobre.plat;
        if (en > a.maxPlat) { for (let q = a.maxPlat + 1; q <= en; q++) sumar(ep, a, S, { tipo: 'checkpoint', plat: q }); a.maxPlat = en; }
        else if (en < a.plat) sumar(ep, a, S, { tipo: 'atras', plat: en });
        a.plat = en;
      } else {   // ¡se cayó al piso! Pierde puntos y vuelve a la última plataforma donde estuvo (como un checkpoint)
        sumar(ep, a, S, { tipo: 'caida' });
        const p = def.plats[a.plat]; a.x = p.x; a.z = p.z; a.y = p.y; a.vy = 0; a.saltosAire = 0;
      }
    }
    a.pisaba = a.suelo;
    // ¿Se quedó quieto mucho rato en la torre? Castiguito (ver RECOMPENSAS)
    if (S === 'torre') {
      if (Math.hypot(a.x - a.ultX, a.z - a.ultZ) > 1) { a.ultX = a.x; a.ultZ = a.z; a.quieto = 0; }
      else if ((a.quieto += dt) >= RECOMPENSAS.torre.quietoS) { sumar(ep, a, S, { tipo: 'quieto' }); a.quieto = 0; }
    }
    // 4. Atrapadas: los portales verdes (entras por uno y sales por su par)
    if (S === 'atrapadas' && ep.t >= a.portalListo) {
      const i = portalCerca(a, def.portales);
      if (i >= 0) { const d = def.portales[def.portales[i].par]; a.x = d.salida.x; a.z = d.salida.z; a.y = d.y + 0.05; a.vy = 0; a.portalListo = ep.t + 1.2; }
    }
  });
  if (S === 'escondidas') pasoEscondidas(ep, dt);
  if (S === 'atrapadas') pasoAtrapadas(ep, dt);
  if (ep.t >= EPISODIO_S[S]) ep.fin = true;
  return ep;
}
// Escondidas: el buscador de VERDAD (el mismo cerebro que moverBotEsc del juego), pero buscando al Guy en vez de a ti:
// 30 s contando (mirando a la pared), después recorre los escondites en orden al azar (entrando a las cuevas y subiendo
// por las rutas a los altos), y si lo ve (botVe) lo persigue. Si lo alcanza, ¡lo encontró!
export const BUSCADOR_SB = { cuentaS: ESC.esconderMs / 1000 };
function pasoEscondidas(ep, dt) {
  const b = ep.buscador, a = ep.agentes[0], R = RECOMPENSAS.escondidas, def = ep.def;
  const cajas = ep.moviles.length ? cajasDelCuadro(def.indice, b.x, b.z).concat(ep.moviles) : cajasDelCuadro(def.indice, b.x, b.z);
  if (a.ruta.length > 1 && Math.hypot(a.ruta[0].x - a.x, a.ruta[0].z - a.z) < 1.6) a.ruta.shift();   // llegó a la entrada: ahora, adentro
  // ¿Se quedó quieto mucho rato? ¡Castigo! (todo el tiempo: escondiéndose y mientras lo buscan)
  if (Math.hypot(a.x - a.ultX, a.z - a.ultZ) > 1) { a.ultX = a.x; a.ultZ = a.z; a.quieto = 0; }
  else if ((a.quieto += dt) >= R.quietoS) { sumar(ep, a, 'escondidas', { tipo: 'quieto' }); a.quieto = 0; }
  if (ep.t < BUSCADOR_SB.cuentaS) { moverConCajas(b, 0, 0, cajas, dt, 0); return; }   // está contando, mirando a la pared
  let meta;
  const veo = (b.suelo || b.modo === 'perseguir') && a.visto;   // (lo que vio en el paso anterior)
  if (veo) { b.modo = 'perseguir'; b.olvido = BOT_ESC.olvida; b.camino = null; }
  else if (b.modo === 'perseguir' && (b.olvido -= dt) <= 0) b.modo = 'buscar';
  if (b.modo === 'contar') b.modo = 'buscar';
  if (b.modo === 'perseguir') meta = a;
  else {
    if (!b.camino || !b.camino.length) {
      if (b.salida) { b.camino = [...b.salida]; b.salida = null; }
      else {
        const lugar = def.lugares[b.orden[b.paso++ % b.orden.length]];
        b.camino = lugar.ruta ? [...lugar.ruta] : [lugar.entrada, lugar].filter(Boolean);
        b.salida = lugar.salida || null;
      }
    }
    meta = b.camino[0];
    if (meta !== b.metaVieja) { b.metaVieja = meta; b.tMeta = 0; }
    if ((b.tMeta += dt) > 8 && b.camino.length > 1) { b.camino.shift(); meta = b.camino[0]; }
    else if (b.tMeta > 8) { b.camino = null; b.salida = null; b.metaVieja = null; }
    const cerca = Math.hypot(b.x - meta.x, b.z - meta.z) < 1.6;
    if (b.camino && ((meta.tramp && b.y > 4) || (cerca && (meta.y === undefined || Math.abs(b.y - meta.y) < 1.2)))) b.camino.shift();
  }
  let dx = meta.x - b.x, dz = meta.z - b.z;
  const d = Math.hypot(dx, dz) || 1, vel = b.modo === 'perseguir' ? BOT_ESC.persigue : BOT_ESC.busca;
  dx /= d; dz /= d;
  if (b.esquivar > 0) { b.esquivar -= dt; [dx, dz] = [-dz * b.lado, dx * b.lado]; }   // se atascó: camina un ratito de lado
  const subir = (meta.y || 0) > b.y + 0.4 && d < 2.6;
  if (b.suelo && (b.choco || subir)) { b.vy = FISICA.salto; b.suelo = false; }   // salta si choca, o para subir peldaños
  const antes = { x: b.x, z: b.z };
  const sobre = moverConCajas(b, dx * vel * dt, dz * vel * dt, cajas, dt, 0);
  if (sobre && sobre.salto && b.suelo) { b.vy = launchSpeedForHeight(sobre.salto, FISICA.grav); b.suelo = false; }   // el trampolín también lo lanza
  b.x = Math.min(def.limX, Math.max(-def.limX, b.x)); b.z = Math.min(def.limZ, Math.max(-def.limZ, b.z));
  if (b.choco && Math.hypot(b.x - antes.x, b.z - antes.z) < vel * dt * 0.3) { if ((b.atascado += dt) > 0.6) { b.esquivar = 1.2; b.lado = ep.rnd() < 0.5 ? 1 : -1; b.atascado = 0; } }
  else b.atascado = 0;
  // ¿Lo ve? (la vista del buscador de verdad: muebles que tapan, y oído si está muy cerca)
  a.visto = botVe(b, a, def.ojos);   // (solo con los muebles que están a la altura de los ojos: los demás no tapan)
  sumar(ep, a, 'escondidas', { tipo: a.visto ? 'visto' : 'escondido', seg: dt });
  // ¿Lo alcanzó? ¡Lo encontró!
  if (Math.hypot(b.x - a.x, b.z - a.z) < BOT_ESC.atrapa && Math.abs(b.y - a.y) < 2) { sumar(ep, a, 'escondidas', { tipo: 'encontrado' }); ep.fin = true; }
}
function pasoAtrapadas(ep, dt) {
  const r = ep.ronda, ahora = ep.t * 1000;
  if (!r) return;
  // Cada segundo sin la mancha, suma
  for (const id of r.vivos) if (id !== r.portador) sumar(ep, ep.agentes[id], 'atrapadas', { tipo: 'sinMancha', seg: dt });
  // ¿El que la tiene tocó a alguien? Se la pasa (con las mismas reglas del juego: 1 s sin devolverla, mareo y empujón)
  const p = ep.agentes[r.portador];
  for (const id of r.vivos) {
    if (id === r.portador) continue;
    const o = ep.agentes[id];
    if (seTocan(p, o) && pasarAN(r, r.portador, id, ahora)) {
      ep.ronda = pasarAN(r, r.portador, id, ahora);
      const e = empujeAN(p, o, ep.rnd); o.ex = e.x; o.ez = e.z; o.vy = AN.empuje.salto; o.suelo = false;
      sumar(ep, o, 'atrapadas', { tipo: 'teLaPasan' });
      break;
    }
  }
  // ¿Se le acabó el tiempo? ¡Explota!
  if (ahora >= ep.ronda.fin) {
    const { ronda, exploto, ganador } = explotarAN(ep.ronda, ahora, ep.rnd);
    const x = ep.agentes[exploto]; x.vivo = false; sumar(ep, x, 'atrapadas', { tipo: 'explotas' });
    ep.ronda = ronda;
    if (!ronda) { if (ganador !== null) sumar(ep, ep.agentes[ganador], 'atrapadas', { tipo: 'ganas' }); ep.fin = true; }
  }
}
// Un intento entero, sin dibujar (para los tests y para aprender rápido). Devuelve los puntajes de cada agente
export function correrEpisodio(sala, cerebros, intentos, semilla, limpio = false, opciones = {}) {
  const ep = crearEpisodio(sala, cerebros, intentos, semilla, limpio, opciones);
  while (!ep.fin) pasoEpisodio(ep);
  return ep.agentes.map(a => Math.round(a.puntaje * 10) / 10);
}
// La semilla de cada intento (cambia en cada uno: así no aprende de memoria un solo intento)
export const semillaIntento = (sala, intento) => 1000 + SALAS.indexOf(sala) * 100000 + intento;
// Guardar / leer lo que aprendió (en el navegador). Devuelve null si está roto
export function leerCerebros(texto, sala) {
  try {
    const d = JSON.parse(texto), n = sala === 'atrapadas' ? 5 : 1;
    if (!d || !Array.isArray(d.cerebros) || d.cerebros.length !== n) return null;
    const ok = d.cerebros.every(c => c && Array.isArray(c.pesos) && c.pesos.length === ENTRADAS * SALIDAS && c.pesos.every(Number.isFinite)
      && c.mejor && Array.isArray(c.mejor.pesos) && c.mejor.pesos.length === ENTRADAS * SALIDAS && Number.isInteger(c.intento) && Array.isArray(c.historial));
    if (!ok) return null;
    return d.cerebros.map(c => ({ ...c, notas: Array.isArray(c.notas) ? c.notas.filter(Number.isFinite).slice(-200) : [], historial: c.historial.filter(Number.isFinite).slice(-200), mejor: { pesos: c.mejor.pesos, puntaje: Number.isFinite(c.mejor.puntaje) ? c.mejor.puntaje : 0 }, sigma: Number.isFinite(c.sigma) ? c.sigma : 0.6, semilla: Number.isInteger(c.semilla) ? c.semilla : 1 }));
  } catch (e) { return null; }
}
export const cerebrosNuevos = sala => Array.from({ length: sala === 'atrapadas' ? 5 : 1 }, (_, k) => cerebroNuevo(SALAS.indexOf(sala) * 10 + k + 1));
// Entrenar varios intentos seguidos (sin dibujar): para los tests
export function entrenar(sala, cerebros, n, opciones = {}) {
  let cs = cerebros;
  for (let i = 0; i < n; i++) {
    const pruebas = cs.map(proximoCerebro);
    const vistos = correrEpisodio(sala, pruebas.map(p => p.pesos), cs.map(c => c.intento), semillaIntento(sala, cs[0].intento), false, opciones);
    cs = terminarIntento(sala, cs, pruebas, vistos, opciones);
  }
  return cs;
}

// ---------- 🏷️ El nombre de tu Guy y dónde se guarda (cada jugador tiene el suyo, en su navegador) ----------
export const NOMBRE_GUY = 'The Guy';
// Como los nombres de los jugadores: sin espacios de más, máximo 20 letras. Si queda vacío, se llama "The Guy"
export const nombreGuy = texto => limpiarNombre(texto).trim() || NOMBRE_GUY;
// Dónde se guarda lo de cada usuario: el cerebro de cada sala y el nombre (al lado de su partida)
export const claveGuy = (usuario, cosa) => `${saveKey(usuario).replace(':partida:', ':guy:')}:${cosa}`;
