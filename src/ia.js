// 🧠 El SANDBOX de The Guy: un bot que aprende a jugar solo, probando y equivocándose (como en "AI Warehouse").
// Todo es lógica pura (sin Three.js ni pantalla): el juego solo dibuja lo que pasa aquí, y los tests lo pueden probar.
//
// ¿Cómo aprende? Con "subir la colina" (hill climbing), la forma más simple de neuroevolución:
//  1. Su "cerebro" son unos pocos números (pesos). Con ellos decide hacia dónde caminar y si salta.
//  2. En cada intento prueba un cerebro un poquito cambiado al azar (una mutación).
//  3. Si con ese cerebro sacó MÁS puntos que con el mejor que tenía, se lo queda. Si no, lo tira.
// Al principio sus pesos son al azar y además hace muchas cosas al azar ("explora"); con los intentos explora menos.
// (las versiones ?v= tienen que ser las mismas que en index.html: así el navegador usa una sola copia de cada archivo)
import { seededRandom, torreNoMires, botVe, tapanVista, saveKey, cajasDe, NO_MIRES, TERRENOS, cajasTerreno, OJO, BOT_ESC, plataformasAN, desplazamientoAN, portalesAN, portalCerca, ARENA_AN, CARROS, CARRO, carroPos, partesCarro, cajasTortugas, elegirObjetivoAN, launchSpeedForHeight, puedeDobleSalto, escondites, ordenEscondites, SPLEEF, HEXES, hexEn, capaY, pisoSpleef, salidaSpleef, fueraSpleef, capaDe, hexSolido, CARRERA, PISTA_CARRERA, posPlatCarrera, golpePuno, golpeBarra, golpeGuardian, vientoTubo, salidaCarrera, siguienteCheckpoint, enMetaCarrera, seCayoCarrera, puertasReales, lugaresPuertas, CORREDOR_CARRERA, PARED } from './logic.js?v=2026-11-02-nave15';
import { AN, ESC, nuevaRondaAN, pasarAN, explotarAN, seTocan, mareadoAN, empujeAN, limpiarNombre } from './red.js?v=2026-11-02-nave15';

export const SALAS = ['torre', 'escondidas', 'atrapadas', 'spleef', 'carrera'];
export const NOMBRE_SALA = { torre: 'No mires abajo', escondidas: 'Escondidas', atrapadas: 'Atrapadas Nocivas', spleef: 'Spleef', carrera: 'Carrera' };
// Cuántos juegan en cada sala (el 0 siempre es The Guy; los demás son bots que también aprenden)
export const AGENTES = { atrapadas: 5, spleef: 4 };
export const agentesDe = sala => AGENTES[sala] || 1;
// La física de siempre (la misma del juego): gravedad 30, salto 12,5 y caminar a 12 (en Atrapadas, 15)
export const FISICA = { grav: 30, salto: 12.5, vel: 12, dt: 1 / 30 };
export const EPISODIO_S = { torre: 25, escondidas: (ESC.esconderMs + ESC.buscarMs) / 1000, atrapadas: 120, spleef: 45, carrera: 45 };   // Escondidas: 30 s para esconderse + 100 s de búsqueda (como el juego)   // cuánto dura cada intento (en segundos del juego)

// ---------- 🏆 Las recompensas (las inventó Mathias) ----------
export const RECOMPENSAS = {
  // quieto (torre): un castiguito por quedarse quieto mucho rato. Sin esto, el "truco" más fácil sería no moverse NUNCA
  // de la plataforma gigante (0 puntos, sin castigos): eso se llama "hacer trampa con el premio" (reward hacking)
  torre: { checkpoint: 5, atras: -3, caida: -4, quieto: -1, quietoS: 5 },   // +5 por cada plataforma nueva · ir para atrás y caerse, castigo
  escondidas: { escondidoPorSeg: 1, vistoPorSeg: -1, quieto: -3, quietoS: 4, encontrado: -10 }, // escondido suma · si lo ven resta · quieto mucho rato y que lo encuentren: ¡castigo!
  atrapadas: { sinManchaPorSeg: 1, teLaPasan: -5, explotas: -10, ganas: 10 },  // cada segundo sin la mancha suma · que te la pasen o explotar, castigo
  // Spleef: cada segundo que sigue arriba suma (y más si está en las capas de arriba) · caerse a la capa de abajo, castigo y licuadora
  // · quedar afuera, ¡castigo grande! · quieto mucho rato en un hexágono: castigo (si no, el "truco" sería no moverse)
  spleef: { vivoPorSeg: 1, arribaPorSeg: 0.5, baja: -3, fuera: -15, quieto: -2, quietoS: 2 },
  // Carrera: +5 por cada checkpoint (como la torre) · que te tiren para atrás o caerte, castigo · ¡premio grande en la meta!
  // (+0,2 por cada metro nuevo que avanza: así sabe que va bien antes de llegar al primer checkpoint)
  carrera: { checkpoint: 5, avancePorM: 0.2, atras: -2, caida: -4, meta: 20, quieto: -1, quietoS: 4 },
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
    case 'spleef:vivo': return { puntos: R.vivoPorSeg * ev.seg, castigo: false };
    case 'spleef:arriba': return { puntos: R.arribaPorSeg * ev.seg, castigo: false };
    case 'spleef:baja': return { puntos: R.baja, castigo: true };
    case 'spleef:fuera': return { puntos: R.fuera, castigo: true };
    case 'spleef:quieto': return { puntos: R.quieto, castigo: true };
    case 'carrera:checkpoint': return { puntos: R.checkpoint, castigo: false };
    case 'carrera:avance': return { puntos: R.avancePorM * ev.seg, castigo: false };   // (seg: los metros nuevos)
    case 'carrera:atras': return { puntos: R.atras, castigo: true };
    case 'carrera:caida': return { puntos: R.caida, castigo: true };
    case 'carrera:meta': return { puntos: R.meta, castigo: false };
    case 'carrera:quieto': return { puntos: R.quieto, castigo: false };
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
export const PRUEBAS_JUEZ = { torre: 2, escondidas: 1, atrapadas: 3, spleef: 2, carrera: 1 };
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
export const IDEAS = { torre: 6, escondidas: 2, atrapadas: 2, spleef: 3, carrera: 6 };
export function* pensar(sala, cerebros, pruebas, vistos, opciones = {}) {
  const semilla = semillaIntento(sala, cerebros[0].intento) + 7, mejores = cerebros.map(c => c.mejor.pesos), out = [];
  for (let k = 0; k < cerebros.length; k++) {
    const c = cerebros[k];
    if (opciones.soloAprende !== undefined && opciones.soloAprende !== k) { out.push(c); continue; }   // (para medir: los demás no aprenden)
    if (!PRUEBAS_JUEZ[sala] || (agentesDe(sala) > 1 && k > 0)) {   // (los bots de Atrapadas y del Spleef)   // sin juez: compara lo que sacó con lo que venía sacando su mejor cerebro (que se va "olvidando" un poquito)
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
// 🔶 Spleef: la arena de verdad (6 capas de hexágonos que se hunden con las mismas reglas). Los primeros 3 s no se hunde nada
// (así tiene tiempo de "despertarse": un comienzo seguro)
export const SPLEEF_SB = { segura: 3 };
export const salaSpleef = () => unaVez('spleef', () => ({ inicio: { x: 0, y: capaY(0), z: 0 }, piso: null, radio: SPLEEF.radio }));
// 🏁 Carrera: la pista de verdad (puños, puertas, tubos, trampolines, ruedas, checkpoints). Las puertas de verdad dependen de la semilla
// del intento (así aprende a buscar la puerta: a veces es una, a veces otra). Cajas fijas + las que se mueven (cada paso)
export function salaCarrera(semilla) {
  const reales = PISTA_CARRERA.puertas.map((f, i) => puertasReales(semilla, i, f.n));
  return unaVez('carrera:' + reales.map(r => r.map(Number).join('')).join('|'), () => {
    const P = PISTA_CARRERA, Y = CARRERA.y0, fijas = [], mueven = [];
    P.plats.forEach((p, i) => {
      const hw = p.redonda ? p.r * 0.85 : p.ancho / 2, hd = p.redonda ? p.r * 0.85 : p.largo / 2, caja = { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, y0: p.y - (p.grosor || 1), y1: p.y, plat: i, lanza: p.lanza || null };
      (p.mueve ? mueven : fijas).push(caja);
    });
    // las puertas falsas, los pilares y las paredes de las zonas de puertas (las de verdad se dejan pasar)
    P.puertas.forEach((f, fi) => {
      const L = lugaresPuertas(f); let z = f.z0;
      const pared = (z0, z1) => { if (z1 - z0 > 0.05) fijas.push({ x0: f.x - 0.5, x1: f.x + 0.5, z0, z1, y0: Y, y1: Y + CARRERA.puerta.alto }); };
      L.forEach((p, i) => { pared(z, p.z - p.ancho / 2); if (!reales[fi][i]) pared(p.z - p.ancho / 2, p.z + p.ancho / 2); z = p.z + p.ancho / 2; });
      pared(z, f.z1);
    });
    for (const t of CORREDOR_CARRERA) { fijas.push({ x0: t.x0, x1: t.x1, z0: t.zmin - PARED.grosor, z1: t.zmin, y0: Y - PARED.abajo, y1: Y + PARED.arriba }); fijas.push({ x0: t.x0, x1: t.x1, z0: t.zmax, z1: t.zmax + PARED.grosor, y0: Y - PARED.abajo, y1: Y + PARED.arriba }); }
    return { fijas, indice: indexarCajas(fijas), mueven, reales, inicio: salidaCarrera(0), piso: null };
  });
}
// Las plataformas que se mueven de la carrera, en el segundo t
function cajasCarreraEn(def, t) {
  return def.mueven.map(c => { const p = PISTA_CARRERA.plats[c.plat], q = posPlatCarrera(p, t), hw = (c.x1 - c.x0) / 2, hd = (c.z1 - c.z0) / 2; return { ...c, x0: q.x - hw, x1: q.x + hw, z0: q.z - hd, z1: q.z + hd, y0: q.y - (p.grosor || 1), y1: q.y }; });
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
  const rnd = seededRandom(semilla), def = sala === 'torre' ? salaTorre() : sala === 'escondidas' ? salaEscondidas(opciones.terreno ?? terrenoDe(semilla))
    : sala === 'spleef' ? salaSpleef() : sala === 'carrera' ? salaCarrera(semilla) : salaAtrapadas();
  const n = agentesDe(sala);
  const agentes = Array.from({ length: n }, (_, k) => {
    const ang = (k / n) * Math.PI * 2, r = n > 1 ? 12 : 0;   // en Atrapadas empiezan en un círculo de 12 m, como en el juego
    const s = sala === 'spleef' ? salidaSpleef(k, n) : null;   // (en el Spleef, en su lugar de la capa de arriba)
    return { x: s ? s.x : def.inicio.x + Math.cos(ang) * r, y: def.inicio.y, z: s ? s.z : def.inicio.z + Math.sin(ang) * r, vy: 0, ex: 0, ez: 0, suelo: true, pisaba: true, capa: 0, cp: 0, golpeHasta: 0, probadas: {},
      pesos: cerebros[k], explora: limpio ? 0 : exploracion((intentos && intentos[k]) ?? 0), accion: null, cambia: 0, puntaje: 0, temblor: 0, vivo: true,
      plat: 0, maxPlat: 0, saltosAire: 0, dobles: 0, quieto: 0, ultX: 0, ultZ: 0, visto: false, portalListo: 0 };
  });
  const ep = { sala, def, rnd, t: 0, fin: false, agentes, eventos: [] };
  if (sala === 'escondidas') {
    ep.buscador = { x: def.buscador.x, y: 0, z: def.buscador.z + 4, vy: 0, suelo: true, modo: 'contar', orden: ordenEscondites(def.lugares, rnd), paso: 0, camino: null, salida: null, olvido: 0, tMeta: 0, metaVieja: null, esquivar: 0, lado: 1, atascado: 0, choco: false };
    for (const a of agentes) { a.ultX = a.x; a.ultZ = a.z; a.ruta = rutaEscondite(def, a); }
  }
  if (sala === 'atrapadas') ep.ronda = nuevaRondaAN(agentes.map((_, k) => k), 0, rnd);
  if (sala === 'spleef') ep.pisadas = Array.from({ length: SPLEEF.capas }, () => new Map());
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
  if (ep.sala === 'spleef') return sentidosSpleef(ep, a);
  if (ep.sala === 'carrera') return sentidosCarrera(ep, a);
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
// Spleef: su meta es un hexágono SANO (que nadie pisó) cerca, en su capa. Le cuenta: qué tan lejos está, si adelante hay un hueco
// (o un hexágono que se está cayendo), si el que pisa ya se está hundiendo, si está en el piso y en qué capa está
function sentidosSpleef(ep, a) {
  const P = ep.pisadas[Math.min(SPLEEF.capas - 1, a.capa)], dirA = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };
  if (!a.meta || P.has(a.meta.i) || Math.hypot(a.meta.x - a.x, a.meta.z - a.z) < 1.5) {
    let mejor = null, nota = -Infinity;
    for (let n = 0; n < 30; n++) {
      const j = Math.floor(ep.rnd() * HEXES.length), h = HEXES[j], d = Math.hypot(h.x - a.x, h.z - a.z);
      if (d < 2.5 || d > 9 || P.has(j)) continue;
      const v = -Math.abs(d - 5) - Math.hypot(h.x, h.z) * 0.05;
      if (v > nota) { nota = v; mejor = { x: h.x, z: h.z, i: j }; }
    }
    a.meta = mejor || { x: -a.x * 0.5, z: -a.z * 0.5, i: -1 };
  }
  const dx = a.meta.x - a.x, dz = a.meta.z - a.z, d = Math.hypot(dx, dz) || 1;
  const adelante = hexEn(a.x + dx / d * 1.8, a.z + dz / d * 1.8), malo = adelante < 0 || (P.has(adelante) && !hexSolido(P.get(adelante), ep.t + 0.3));
  const abajo = hexEn(a.x, a.z), hundiendo = abajo >= 0 && P.has(abajo);
  return { dir: dirA(dx, dz), entradas: [Math.min(d, 9) / 6, malo ? 1 : 0, hundiendo ? 1 : 0, a.suelo ? 1 : 0, a.capa / (SPLEEF.capas - 1), 1] };
}
// Carrera: su meta es un punto un poco más adelante en la pista (por el medio de la plataforma que viene; en las puertas, la que está
// probando). Le cuenta: si adelante hay un hueco, si viene un golpe (puño o barra), si está en el piso, qué tan alta está la siguiente
function sentidosCarrera(ep, a) {
  const P = PISTA_CARRERA, def = ep.def, t = ep.t, dirA = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };
  const cajas = def.fijas.concat(ep.moviles);
  const pisoEn = (x, z) => { let top = null; for (const c of cajas) if (c.plat !== undefined && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && (top === null || c.y1 > top)) top = c.y1; return top; };
  // por dónde seguir: la plataforma que hay 4 m más adelante (la más cercana a él de costado); si ahí hay un hueco, la siguiente
  let cubre = null, sig = null;
  for (const c of cajas) {
    if (c.plat === undefined || (c.lanza && c.lanza.x < 0)) continue;   // (el trampolín rojo, no)
    if (c.x0 <= a.x + 4 && c.x1 >= a.x + 4 && (!cubre || Math.abs((c.z0 + c.z1) / 2 - a.z) < Math.abs((cubre.z0 + cubre.z1) / 2 - a.z))) cubre = c;
    if (c.x0 > a.x + 1 && c.x0 < a.x + 25 && (!sig || c.x0 < sig.x0)) sig = c;
  }
  const guia = cubre || sig;
  let tx = a.x + 5, tz = guia ? (guia.z0 + guia.z1) / 2 : a.z;
  // 🚪 una fila de puertas adelante: prueba una (si chocó contra una falsa, la tacha y prueba otra)
  const fi = P.puertas.findIndex(f => a.x > f.x - 12 && a.x < f.x + 0.5);
  if (fi >= 0) {
    const f = P.puertas[fi], L = lugaresPuertas(f), prob = a.probadas[fi] || (a.probadas[fi] = []);
    if (a.puerta === undefined || a.puertaFila !== fi || prob.includes(a.puerta)) { const libres = L.map((_, i) => i).filter(i => !prob.includes(i)); a.puerta = libres.length ? libres[Math.floor(ep.rnd() * libres.length)] : 0; a.puertaFila = fi; }
    tz = L[a.puerta].z; tx = Math.abs(a.z - tz) > 0.6 && a.x > f.x - 2.5 ? f.x - 2 : f.x + 3;
    if (a.choco && a.x > f.x - 1.4 && Math.abs(a.z - tz) < 0.8) prob.push(a.puerta);   // ¡era falsa!
  }
  const hueco = pisoEn(a.x + 2, a.z) === null ? 1 : 0;
  // ¿viene un golpe? (un puño o una barra que lo tocaría en un ratito, un poco más adelante)
  const pos = { x: a.x + 1.2, y: a.y, z: a.z }; let peligro = 0;
  for (const f of P.punos) if (Math.abs(f.x - pos.x) < 3 && golpePuno(pos, f, t + 0.35)) peligro = 1;
  for (const b of P.barras) if (Math.hypot(b.x - pos.x, b.z - pos.z) < b.r + 1 && golpeBarra(pos, b, t + 0.25)) peligro = 1;
  return { dir: dirA(tx - a.x, tz - a.z), entradas: [hueco, peligro, a.suelo ? 1 : 0, sig ? Math.max(-1, Math.min(1, (sig.y1 - a.y) / 4)) : 0, Math.min(1, Math.abs(tz - a.z) / 4), 1] };
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
  const moviles = S === 'atrapadas' ? cajasArena({ plats: def.mueven }, ep.t) : S === 'escondidas' && def.terreno === 1 ? cajasCarros(ep.t) : S === 'carrera' ? cajasCarreraEn(def, ep.t) : NADA;
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
    else if ((S === 'torre' || S === 'spleef' || S === 'carrera') && ac.saltar && puedeDobleSalto({ enElPiso: a.suelo, saltosEnAire: a.saltosAire, apretoRecien: a.vy <= 0, bateria: Infinity })) {
      a.vy = FISICA.salto; a.saltosAire++; a.dobles++;   // (dobles: el juego lo cuenta para dibujar el anillo y el sonido)
    }
    // 2. Se mueve chocando con las cajas del mapa (con el empujón que traiga, que se va frenando)
    if (S === 'spleef') { pasoSpleefAgente(ep, a, (ux * vel + a.ex) * dt, (uz * vel + a.ez) * dt, dt); return; }
    const viento = S === 'carrera' ? vientoTubo(a, PISTA_CARRERA.tubos) : null;   // (en un tubo de viento, te lleva)
    const sobre = moverConCajas(a, (ux * vel + a.ex + (viento ? viento.x : 0)) * dt, (uz * vel + a.ez + (viento ? viento.z : 0)) * dt, cajasCerca(a.x, a.z), dt, def.piso);
    if (S === 'carrera') { pasoCarreraAgente(ep, a, sobre, dt); return; }
    const freno = Math.exp(-(a.suelo ? 6 : 0.4) * dt); a.ex *= freno; a.ez *= freno;
    if (a.suelo) a.saltosAire = 0;   // tocó el piso: se recarga el doble salto
    if (sobre && sobre.salto && a.suelo) { a.vy = launchSpeedForHeight(sobre.salto, FISICA.grav); a.suelo = false; }   // ¡un trampolín! (como en el juego)
    if (S !== 'torre' && def.limX) { a.x = Math.min(def.limX, Math.max(-def.limX, a.x)); a.z = Math.min(def.limZ, Math.max(-def.limZ, a.z)); }
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
  if (S === 'spleef' && ep.agentes.every(a => !a.vivo)) ep.fin = true;
  if (ep.t >= EPISODIO_S[S]) ep.fin = true;
  return ep;
}
// Quedarse quieto mucho rato: castigo (para que no "haga trampa" sin moverse)
function revisarQuieto(ep, a, S, dt) {
  if (Math.hypot(a.x - a.ultX, a.z - a.ultZ) > 1) { a.ultX = a.x; a.ultZ = a.z; a.quieto = 0; }
  else if ((a.quieto += dt) >= RECOMPENSAS[S].quietoS) { sumar(ep, a, S, { tipo: 'quieto' }); a.quieto = 0; }
}
// 🔶 Spleef: el piso son los hexágonos (los mismos de la sala de verdad). Lo que pisa se empieza a hundir (después de los 3 s seguros)
function pasoSpleefAgente(ep, a, dx, dz, dt) {
  a.x += dx; a.z += dz;
  const yAntes = a.y; a.vy -= FISICA.grav * dt; a.y += a.vy * dt;
  const p = pisoSpleef(a.x, a.z, yAntes, ep.pisadas, ep.t);
  if (p && a.y <= p.top) { a.y = p.top; a.vy = 0; a.suelo = true; } else a.suelo = false;
  const freno = Math.exp(-(a.suelo ? 6 : 0.4) * dt); a.ex *= freno; a.ez *= freno;
  if (a.suelo) {
    a.saltosAire = 0;
    if (ep.t >= SPLEEF_SB.segura && !ep.pisadas[p.capa].has(p.i)) ep.pisadas[p.capa].set(p.i, ep.t);
    if (p.capa > a.capa) { sumar(ep, a, 'spleef', { tipo: 'baja', capa: p.capa }); a.capa = p.capa; a.meta = null; }   // ¡se cayó a la capa de abajo!
  }
  if (fueraSpleef(a.y)) { a.vivo = false; sumar(ep, a, 'spleef', { tipo: 'fuera' }); return; }   // ¡afuera!
  sumar(ep, a, 'spleef', { tipo: 'vivo', seg: dt });
  sumar(ep, a, 'spleef', { tipo: 'arriba', seg: dt * (SPLEEF.capas - 1 - a.capa) / (SPLEEF.capas - 1) });   // más puntos más arriba
  revisarQuieto(ep, a, 'spleef', dt);
}
// 🏁 Carrera: checkpoints (en orden), golpes (puños, barras, el guardián de las puertas), trampolines, caerse y la meta
function pasoCarreraAgente(ep, a, sobre, dt) {
  const P = PISTA_CARRERA, t = ep.t, R = RECOMPENSAS.carrera;
  const freno = Math.exp(-(a.suelo ? 6 : 0.4) * dt); a.ex *= freno; a.ez *= freno;
  if (a.suelo) a.saltosAire = 0;
  if (a.suelo && sobre && sobre.lanza) { a.ex = sobre.lanza.x; a.vy = sobre.lanza.y; a.suelo = false; }   // ¡un trampolín! (el rojo te tira para atrás)
  if (t >= a.golpeHasta) {
    let g = null;
    for (const f of P.punos) if (!g && Math.abs(f.x - a.x) < 3) g = golpePuno(a, f, t);
    for (const b of P.barras) if (!g && Math.hypot(b.x - a.x, b.z - a.z) < b.r + 1) g = golpeBarra(a, b, t);
    for (const f of P.puertas) if (!g) g = golpeGuardian(a, f);
    if (g) { a.ex = g.x; a.ez = g.z; a.vy = g.y; a.suelo = false; a.golpeHasta = t + 0.5; sumar(ep, a, 'carrera', { tipo: 'atras' }); }
  }
  if (a.y >= CARRERA.y0 - 0.5) {
    const n = siguienteCheckpoint(a.cp, a.x); if (n > a.cp) { a.cp = n; sumar(ep, a, 'carrera', { tipo: 'checkpoint', cp: n }); }
    if (a.maxX === undefined) a.maxX = a.x;
    if (a.x > a.maxX + 0.5) { sumar(ep, a, 'carrera', { tipo: 'avance', seg: a.x - a.maxX }); a.maxX = a.x; }   // metros nuevos
  }
  if (seCayoCarrera(a.y)) { sumar(ep, a, 'carrera', { tipo: 'caida' }); const s = salidaCarrera(a.cp); a.x = s.x; a.y = s.y; a.z = s.z; a.vy = 0; a.ex = a.ez = 0; a.puerta = undefined; return; }
  if (a.cp >= CARRERA.checkpoints && enMetaCarrera(a)) { sumar(ep, a, 'carrera', { tipo: 'meta' }); ep.fin = true; return; }
  revisarQuieto(ep, a, 'carrera', dt);
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
    const d = JSON.parse(texto), n = agentesDe(sala);
    if (!d || !Array.isArray(d.cerebros) || d.cerebros.length !== n) return null;
    const ok = d.cerebros.every(c => c && Array.isArray(c.pesos) && c.pesos.length === ENTRADAS * SALIDAS && c.pesos.every(Number.isFinite)
      && c.mejor && Array.isArray(c.mejor.pesos) && c.mejor.pesos.length === ENTRADAS * SALIDAS && Number.isInteger(c.intento) && Array.isArray(c.historial));
    if (!ok) return null;
    return d.cerebros.map(c => ({ ...c, notas: Array.isArray(c.notas) ? c.notas.filter(Number.isFinite).slice(-200) : [], historial: c.historial.filter(Number.isFinite).slice(-200), mejor: { pesos: c.mejor.pesos, puntaje: Number.isFinite(c.mejor.puntaje) ? c.mejor.puntaje : 0 }, sigma: Number.isFinite(c.sigma) ? c.sigma : 0.6, semilla: Number.isInteger(c.semilla) ? c.semilla : 1 }));
  } catch (e) { return null; }
}
export const cerebrosNuevos = sala => Array.from({ length: agentesDe(sala) }, (_, k) => cerebroNuevo(SALAS.indexOf(sala) * 10 + k + 1));
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
