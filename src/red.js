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
// disfraz: el de Halloween que tiene puesto (solo uno de la lista; si no, ninguno)
export const DISFRACES_IDS = ['aracnido', 'dulce', 'milojos', 'fantasmita', 'momia'];
export function leerLook(l) {
  if (!l || typeof l !== 'object') return { hat: null, glasses: null, blaster: 0, disfraz: null };
  return { hat: esId(l.hat) ? l.hat : null, glasses: esId(l.glasses) ? l.glasses : null, blaster: esEntero(l.blaster, 0, 2) ? l.blaster : 0,
    disfraz: DISFRACES_IDS.includes(l.disfraz) ? l.disfraz : null };
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
// · 50 = en una Carrera con amigos · 60 = en un Spleef con amigos
export const MG_TORRE = 21, MG_ESCONDIDAS = 30, MG_ATRAPADAS = 40, MG_CARRERA = 50, MG_SPLEEF = 60, MG_NAVE = 70, MG_SOLO = 99;
// Dos jugadores se ven solo si están en el mismo lugar (y ninguno está jugando solo)
export const seVen = (miMg, suMg) => miMg === suMg && miMg !== MG_SOLO;

// ---------- 🙈 Escondidas con amigos (el servidor es el árbitro) ----------
// 30 s para esconderse (el buscador no ve nada) y 100 s para buscar. Para encontrar, el buscador tiene que TOCARLO (como en Atrapadas):
// tocar: 1,5 m en la compu del buscador · encontrarDist: lo que acepta el servidor (un poquito más, por lo que tarda internet) · alto: diferencia de altura
export const ESC = { esconderMs: 30000, buscarMs: 100000, tocar: 1.5, encontrarDist: 2.5, alto: 2.5, terrenos: 3 };
// El buscador: uno al azar entre los que están esperando
export const elegirBuscador = (ids, azar = Math.random) => ids[Math.min(ids.length - 1, Math.floor(azar() * ids.length))];
// El terreno de la ronda con amigos: también al azar (lo elige el servidor, no el que aprieta Empezar)
export const elegirTerreno = (azar = Math.random) => Math.min(ESC.terrenos - 1, Math.floor(azar() * ESC.terrenos));
// ¿En qué parte de la ronda vamos? (ms: cuánto pasó desde que empezó)
export const faseRonda = ms => (ms < ESC.esconderMs ? 'esconder' : ms < ESC.esconderMs + ESC.buscarMs ? 'buscar' : 'fin');
// ¿Lo tocó? (con las últimas posiciones que conoce el servidor)
export const puedeEncontrar = (a, b, max = ESC.encontrarDist) => Math.hypot(a.x - b.x, a.z - b.z) <= max && Math.abs(a.y - b.y) <= ESC.alto;
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
// enAtrapadas: si está jugando una ronda de Atrapadas Nocivas (lo sabe el servidor)
// enModo: el mg de otra ronda que está jugando (Carrera o Spleef), o null
const MG_DE_RONDA = [MG_ATRAPADAS, MG_CARRERA, MG_SPLEEF];
export function mgDelServidor(mg, terrenoRonda, enAtrapadas = false, enModo = null) {
  if (enAtrapadas) return MG_ATRAPADAS;
  if (enModo !== null) return enModo;
  if (terrenoRonda !== null) return MG_ESCONDIDAS + terrenoRonda;
  return (mg >= MG_ESCONDIDAS && mg < MG_ESCONDIDAS + ESC.terrenos) || MG_DE_RONDA.includes(mg) ? MG_SOLO : mg;
}

// ---------- 👽 Atrapadas Nocivas: la mancha verde alien (el servidor es el árbitro) ----------
// El que tiene la mancha (el portador) tiene 15 s para pasársela a otro tocándolo. Si no, ¡explota! y queda de fantasma.
// El que te la pasó no la puede recibir de vuelta durante 1 s. Gana el último que queda.
// inmuneMs: cuánto tiempo no se la puedes devolver al que te la pasó (cambiar aquí si hace falta más o menos).
// empuje: al recibirla sales volando lejos del que te la pasó (vel en m/s + un salto): unos 20 m, ¡así no se quedan pegados!
// mareoMs: y quedas mareado 2 s (no te mueves ni la puedes pasar): el que te la pasó tiene tiempo de escaparse
// vel: en Atrapadas todos corren a 15 m/s (en el resto del juego, 12)
export const AN = { tiempoMs: 15000, tocar: 1.5, tocarServidor: 2.5, inmuneMs: 1000, vel: 15,
  empuje: { vel: 28, salto: 10, extraM: 24, extraMs: 3000 }, mareoMs: 2000 };
export const elegirPortador = elegirBuscador;   // al azar, igual que el buscador
// Una ronda nueva: todos vivos, uno al azar con la mancha y 15 s en su reloj. salieron: los que se fueron de la ronda
export function nuevaRondaAN(ids, ahora, azar = Math.random) {
  return { jugadores: [...ids], vivos: [...ids], salieron: [], portador: elegirPortador(ids, azar), fin: ahora + AN.tiempoMs, ultimoPase: null, inicio: ahora };
}
// ¿Sigue en la ronda? (vivo o fantasma, pero NO si se fue: aunque se vuelva a sentar, ya no entra a esta ronda)
export const sigueEnRondaAN = (r, id) => !!(r && r.jugadores.includes(id) && !(r.salieron || []).includes(id));
// ¿Está mareado? (el que recién recibió la mancha, durante 2 s)
export const mareadoAN = (r, id, ahora) => !!(r && r.mareado && r.mareado.id === id && ahora < r.mareado.hasta);
// ¿Puede "de" pasarle la mancha a "a"? Solo el portador (si no está mareado), a alguien vivo que no es él,
// y no de vuelta al que se la acaba de pasar
export function puedePasarAN(r, de, a, ahora) {
  if (!r || de !== r.portador || a === de || !r.vivos.includes(a) || mareadoAN(r, de, ahora)) return false;
  const u = r.ultimoPase;
  return !(u && u.de === a && u.a === de && ahora - u.t < AN.inmuneMs);
}
// Pasar la mancha: devuelve la ronda nueva (con 15 s nuevos para el que la recibe), o null si no se puede
export function pasarAN(r, de, a, ahora) {
  if (!puedePasarAN(r, de, a, ahora)) return null;
  return { ...r, portador: a, fin: ahora + AN.tiempoMs, ultimoPase: { de, a, t: ahora }, mareado: { id: a, hasta: ahora + AN.mareoMs } };
}
// El empujón: hacia dónde sale volando el que la recibe (del que se la pasó hacia él). Si están uno encima del otro, al azar.
export function empujeAN(de, a, azar = Math.random) {
  let dx = a.x - de.x, dz = a.z - de.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { const ang = azar() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
  const v = AN.empuje.vel;
  return { x: Math.round(dx / d * v * 100) / 100, z: Math.round(dz / d * v * 100) / 100 };
}
// Se acabó el reloj del portador: explota. Devuelve { ronda (o null si terminó), exploto, ganador (o null) }
export function explotarAN(r, ahora, azar = Math.random) {
  const vivos = r.vivos.filter(id => id !== r.portador);
  if (vivos.length <= 1) return { ronda: null, exploto: r.portador, ganador: vivos[0] ?? null };
  return { ronda: { ...r, vivos, portador: elegirPortador(vivos, azar), fin: ahora + AN.tiempoMs, ultimoPase: null, mareado: null }, exploto: r.portador, ganador: null };
}
// Alguien se fue de la ronda (cerró el juego o se levantó). que:
//  null: no estaba · 'fantasma': ya había explotado (nadie se entera) · 'sale': estaba vivo
//  'explota': ¡se fue con la mancha! Cuenta como explotar (no se salva yéndose)
export function salirAN(r, id, ahora, azar = Math.random) {
  if (!sigueEnRondaAN(r, id)) return { ronda: r, que: null, ganador: null };
  const r2 = { ...r, salieron: [...(r.salieron || []), id] };
  if (!r.vivos.includes(id)) return { ronda: r2, que: 'fantasma', ganador: null };
  if (r.portador === id) { const e = explotarAN(r2, ahora, azar); return { ronda: e.ronda, que: 'explota', ganador: e.ganador }; }
  const vivos = r.vivos.filter(v => v !== id);
  if (vivos.length <= 1) return { ronda: null, que: 'sale', ganador: vivos[0] ?? null };
  return { ronda: { ...r2, vivos }, que: 'sale', ganador: null };
}
// ¿Lo tocó? (con las posiciones: el servidor da un poquito más de margen, por lo que tarda internet)
export const seTocan = (a, b, max = AN.tocar) => Math.hypot(a.x - b.x, a.z - b.z) <= max && Math.abs(a.y - b.y) <= 2.5;

// ---------- 🛡️ El servidor vigila que nadie corra más de la cuenta ----------
// antes: la última posición que aceptó { x, y, z, t, llego, saldo, saldoY } · nuevo: la que mandó la compu
// zona: ver zonaAN / zonaEsc (logic.js) · extra: metros de más por un empujón, que solo valen hacia dirExtra ({x,z})
// Devuelve { pos (la que acepta), extra, corregido }. Reglas:
//  · al empezar la ronda solo puede "aparecer" en su lugar de salida (y si no llega a tiempo, el servidor lo pone ahí)
//  · no sale del cuadrado de la zona ni de su altura (piso..lo más alto + un salto)
//  · no corre más rápido que zona.velMax ni SUBE más rápido que un salto (caerse sí, eso es libre)
//  · solo salta lejos (o alto) si entró a un portal y sale por su par, a la altura de verdad de la salida
// saldo y saldoY: como alcancías de metros. Se llenan con el tiempo (hasta un máximo) y cada paso gasta lo que avanza o sube.
export const VIGILA = { maxSaldo: 3, maxSaldoY: 3.5, subeVel: 13, salto: 3.2, portalEntrada: 2.2, portalSalida: 2.5, cosEmpuje: 0.7, llegarMs: 3000, trampolinCerca: 2, trampolinAlto: 3, dobleSalto: 5.4, subeS: 0.42, subeDobleS: 0.83, margenS: 0.25 };   // (un salto sube 2,6 m en 0,42 s; el doble, 5,2 m en 0,83 s)
// 🟡 Trampolines (zona.lanzadores: [{ x0, x1, z0, z1, top, salto }]): si estaba encima de uno (o llegando, a su altura),
// lo puede lanzar MUY rápido hacia arriba (un trampolín de 40 m sale a 49 m/s): durante el vuelo (lo que tarda en llegar
// arriba, más un margen) puede subir hasta la altura del trampolín + un poco, sin el límite de "subir de a poco"
const GRAV_VIGILA = 30;
function lanzadoPor(zona, antes, ahora) {
  for (const L of zona.lanzadores || []) {
    const m = VIGILA.trampolinCerca;
    if (antes.x < L.x0 - m || antes.x > L.x1 + m || antes.z < L.z0 - m || antes.z > L.z1 + m) continue;
    if (antes.y < L.top - VIGILA.trampolinAlto || antes.y > L.top + VIGILA.trampolinAlto) continue;
    const vuela = Math.sqrt(2 * L.salto / GRAV_VIGILA);   // cuánto tarda en llegar arriba
    return { hasta: ahora + (vuela + 0.8) * 1000, techo: L.top + L.salto + 3 };
  }
  return null;
}
export function vigilarPos(antes, nuevo, ahora, zona, extra = 0, dirExtra = null) {
  const lanzado = antes && antes.llego ? (lanzadoPor(zona, antes, ahora) || (antes.lanzado && ahora < antes.lanzado.hasta ? antes.lanzado : null)) : null;
  const ok = (p, ex, saldo, saldoY, corregido = false) => ({ pos: { x: p.x, y: p.y, z: p.z, t: ahora, llego: true, saldo, saldoY, ...(lanzado ? { lanzado } : {}) }, extra: ex, corregido });
  const dentro = p => p.x >= zona.x0 && p.x <= zona.x1 && p.z >= zona.z0 && p.z <= zona.z1;
  const piso = zona.yMin ?? 0, techo = zona.yMax ?? Infinity, yLl = zona.pisoLlegada ?? piso;   // (en la carrera empiezas arriba, en la pista)
  if (!antes || !antes.llego) {
    const l = zona.llegada, enSuLugar = { x: l.x, y: yLl, z: l.z };
    if (Math.hypot(nuevo.x - l.x, nuevo.z - l.z) <= l.radio && nuevo.y <= yLl + 1 && nuevo.y >= yLl - 1) return ok(nuevo, extra, VIGILA.maxSaldo, VIGILA.maxSaldoY);   // llegó a su lugar
    const tarde = zona.llegarHasta !== undefined && ahora > zona.llegarHasta;
    if (!dentro(nuevo) && !tarde) return { pos: { x: nuevo.x, y: nuevo.y, z: nuevo.z, t: ahora, llego: false }, extra, corregido: false };   // todavía en el salón
    return ok(enSuLugar, extra, VIGILA.maxSaldo, VIGILA.maxSaldoY, true);   // apareció en otro lado (o no llegó a tiempo): lo ponemos en su lugar
  }
  const p = { x: Math.min(zona.x1, Math.max(zona.x0, nuevo.x)), y: Math.min(techo, Math.max(piso, nuevo.y)), z: Math.min(zona.z1, Math.max(zona.z0, nuevo.z)) };
  // 3, 2, 1… (zona.quietoHasta): antes del "¡ya!" no te puedes ir de tu lugar de salida
  if (zona.quietoHasta && ahora < zona.quietoHasta) {
    const l = zona.llegada, dx = p.x - l.x, dz = p.z - l.z, d = Math.hypot(dx, dz), r = l.radio || 2;
    if (d > r) { p.x = l.x + dx / d * r; p.z = l.z + dz / d * r; }
  }
  // Un corredor (la Carrera): en cada x, solo puedes estar entre sus paredes
  const L = zona.limiteZ && zona.limiteZ(p.x);
  if (L) p.z = Math.min(L.z1, Math.max(L.z0, p.z));
  // 🚪 cosas que no se atraviesan (las puertas falsas de la carrera)
  const bloqueo = zona.cruce && antes.llego ? zona.cruce(antes, p) : null;
  if (bloqueo) { p.x = bloqueo.x; p.z = bloqueo.z; }
  let corregido = p.x !== nuevo.x || p.y !== nuevo.y || p.z !== nuevo.z;
  const dt = Math.max(0, (ahora - antes.t) / 1000);
  // ¿Reapareció en un checkpoint después de caerse? (la carrera dice si vale: solo en uno que ya alcanzó)
  if (zona.reaparecer && zona.reaparecer(antes, p)) return ok(p, extra, VIGILA.maxSaldo, VIGILA.maxSaldoY, corregido);
  // ¿Un portal? Desde cerca de la entrada (a su altura) hasta su par, a la altura de la salida
  const cerca = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
  if (zona.saltos.some(s => cerca(antes, s.desde, VIGILA.portalEntrada) && antes.y >= s.desde.y - 0.5 && antes.y <= s.desde.y + 2.5
    && cerca(p, s.hasta, VIGILA.portalSalida) && Math.abs(p.y - s.hasta.y) <= 1)) return ok(p, extra, VIGILA.maxSaldo, VIGILA.maxSaldoY, corregido);
  // Lo de los costados
  const saldo = Math.min(VIGILA.maxSaldo, (antes.saldo ?? VIGILA.maxSaldo) + zona.velMax * dt);
  const mx = p.x - antes.x, mz = p.z - antes.z, d = Math.hypot(mx, mz);
  // el empujón solo vale para moverse hacia donde te empujaron (con un poquito de margen)
  const haciaEmpuje = dirExtra && d > 0 ? (mx * dirExtra.x + mz * dirExtra.z) / (d * (Math.hypot(dirExtra.x, dirExtra.z) || 1)) >= VIGILA.cosEmpuje : !dirExtra;
  const usable = haciaEmpuje ? extra : 0;
  let x = p.x, z = p.z, saldoNuevo, extraNuevo = extra;
  if (d <= saldo) saldoNuevo = saldo - d;
  else if (d <= saldo + usable) { saldoNuevo = 0; extraNuevo = extra - (d - saldo); }
  else { const k = (saldo + usable) / d; x = antes.x + mx * k; z = antes.z + mz * k; saldoNuevo = 0; extraNuevo = haciaEmpuje ? 0 : extra; corregido = true; }
  // Lo de subir (bajar es libre: caerse no es trampa)
  const saldoY = Math.min(VIGILA.maxSaldoY, (antes.saldoY ?? VIGILA.maxSaldoY) + VIGILA.subeVel * dt);
  let y = p.y, saldoYNuevo = saldoY;
  const sube = p.y - antes.y;
  if (lanzado) { if (y > lanzado.techo) { y = lanzado.techo; corregido = true; } }   // 🟡 volando por un trampolín: sube rápido (pero no más alto que lo que lanza)
  else if (sube > saldoY) { y = antes.y + saldoY; saldoYNuevo = 0; corregido = true; }
  else if (sube > 0) saldoYNuevo = saldoY - sube;
  // ¿Está volando? Más de un salto por encima de lo que tiene abajo: no puede seguir subiendo (caerse sí)
  if (zona.soporte && !lanzado) {
    const lim = zona.soporte(x, z) + (zona.doble ? VIGILA.dobleSalto : VIGILA.salto);   // (donde hay doble salto, sube hasta ~5,2 m)
    if (y > lim && y > antes.y) { y = Math.max(antes.y, lim); corregido = true; }
  }
  // 🪂 ¿Flotando? (zona.soporteBajo: lo más alto que tiene justo debajo de los pies). Desde que deja de pisar algo, lo más alto que
  // puede estar es su altura de ese momento + un doble salto; y pasado lo que dura un doble salto, cae con la gravedad de verdad.
  // Si está más arriba de eso, lo bajamos (a la velocidad de la gravedad: no importa si "baja un poquito" en cada mensaje).
  // (los trampolines tienen su permiso; abajo de zona.aireDesde no se revisa: ahí están los carros y las tortugas, que se mueven)
  let aire = null;
  if (zona.soporteBajo && !lanzado) {
    // no puede subir más de un salto por encima de lo que tiene cerca (7 m: lo que avanza saltando de un mueble a otro)
    const H = zona.doble ? VIGILA.dobleSalto : VIGILA.salto, T = (zona.doble ? VIGILA.subeDobleS : VIGILA.subeS) + VIGILA.margenS;
    const cercano = zona.soporteBajo(x, z, antes.y, 7);
    if (y > cercano + H && y > antes.y) { y = Math.max(antes.y, cercano + H); corregido = true; }
    const base = zona.soporteBajo(x, z, y);
    if (y - base > 0.6 && y > (zona.aireDesde ?? 2)) {
      // lo más alto que puede estar t segundos después de dejar el piso: lo que sube su salto (o doble salto), y después cae con la gravedad
      aire = antes.aire || { t0: antes.t, y0: Math.min(antes.y, y) };
      const t = (ahora - aire.t0) / 1000, techoAire = aire.y0 + H - (t > T ? 15 * (t - T) ** 2 : 0);
      if (y > techoAire) { y = Math.max(base, techoAire); corregido = true; }
    }
  }
  const r = ok({ x, y, z }, extraNuevo, saldoNuevo, saldoYNuevo, corregido);
  if (aire) r.pos.aire = aire;
  return r;
}

// Lee un mensaje que llegó por la red. Si viene roto o con trampas, devuelve null.
// Los mensajes son cortitos (1.500 letras), menos el de las preguntas del profe, que puede ser más largo.
export const MAX_MENSAJE = 1500, MAX_MENSAJE_PREGUNTAS = 40000;
// t: la hora (en ms) de la compu que mandó el mensaje. Es opcional: los juegos viejos no la mandan
const horaDe = t => esNumero(t) && t >= 0 ? t : null;
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
    return { tipo: 'hola', nombre, color: m.color, monedas: esEntero(m.monedas, 0, 1e7) ? m.monedas : 0, look: leerLook(m.look) };   // (más de 10 millones: no es de verdad)
  }
  if (m.tipo === 'pos') {
    if (![m.x, m.y, m.z, m.rot].every(esNumero)) return null;
    return { tipo: 'pos', x: m.x, y: m.y, z: m.z, rot: m.rot, color: esNumero(m.color) ? m.color : null, mg: esEntero(m.mg, 0, 99) ? m.mg : 0, t: horaDe(m.t) };
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
    return { tipo: 'mundo', g: m.g, b: m.b, t: horaDe(m.t) };
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
  // Atrapadas Nocivas: entrar a la espera, salir, empezar, o pasarle la mancha al jugador a
  if (m.tipo === 'an') {
    if (m.que === 'entrar' || m.que === 'salir' || m.que === 'empezar') return { tipo: 'an', que: m.que };
    if (m.que === 'pasar' && Number.isInteger(m.a)) return { tipo: 'an', que: 'pasar', a: m.a };
    return null;
  }
  // 🏁 Carrera: entrar a la espera, salir, empezar, "llegué a la meta" o "me pegó el obstáculo número o"
  if (m.tipo === 'cr') {
    if (['entrar', 'salir', 'empezar', 'llegue'].includes(m.que)) return { tipo: 'cr', que: m.que };
    if (m.que === 'golpe' && esEntero(m.o, 0, 99)) return { tipo: 'cr', que: 'golpe', o: m.o };
    return null;
  }
  // 🔶 Spleef: entrar a la espera, salir, empezar, o "pisé estos hexágonos" (hasta 30: [capa, número])
  if (m.tipo === 'sp') {
    if (['entrar', 'salir', 'empezar'].includes(m.que)) return { tipo: 'sp', que: m.que };
    if (m.que === 'pisa' && Array.isArray(m.h) && m.h.length >= 1 && m.h.length <= 30 && m.h.every(p => Array.isArray(p) && p.length === 2 && esEntero(p[0], 0, 9) && esEntero(p[1], 0, 9999)))
      return { tipo: 'sp', que: 'pisa', h: m.h.map(p => [p[0], p[1]]) };
    return null;
  }
  // 🚀 Nave entre sospechas: la espera (entrar, salir, empezar) y lo que haces en la ronda (el servidor revisa TODO)
  if (m.tipo === 'nv') {
    if (['entrar', 'salir', 'empezar', 'luces', 'reportar', 'boton', 'caja', 'empezarVoto'].includes(m.que)) return { tipo: 'nv', que: m.que };
    if (['abrir', 'tarea', 'sabotear'].includes(m.que) && typeof m.tarea === 'string' && /^[a-z]{1,12}$/.test(m.tarea)) return { tipo: 'nv', que: m.que, tarea: m.tarea };
    if ((m.que === 'atacar' || m.que === 'voto') && typeof m.a === 'string' && /^[hb][0-9]{1,6}$/.test(m.a)) return { tipo: 'nv', que: m.que, a: m.a };
    if (m.que === 'escotilla' && typeof m.id === 'string' && /^[a-z][0-9]$/.test(m.id)) return { tipo: 'nv', que: 'escotilla', id: m.id };
    if (m.que === 'chat' && typeof m.texto === 'string' && m.texto.length <= 300) return { tipo: 'nv', que: 'chat', texto: m.texto };
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

// ---------- Movimiento suave: dibujar lo que llega por la red un poquito en el pasado ----------
// Por internet los mensajes llegan a tirones (dos juntos y después nada). Si dibujas siempre "lo último que llegó",
// tus amigos avanzan a saltitos. El truco: guardar las últimas posiciones con su hora y dibujarlos RETRASO_MS atrás,
// en un punto entre dos posiciones conocidas. Así siempre hay "una posición siguiente" hacia donde ir.
export const RETRASO_MS = 100;     // lo mínimo que se dibuja en el pasado (si internet anda a tirones, se atrasa más: ver retrasoDe)
export const RETRASO_MAX = 500;    // pero nunca más de medio segundo
export const TELETRANSPORTE = 15;  // si algo se movió más que esto (en metros) entre dos mensajes, aparece allá de golpe
const INTERVALO_MS = 1000 / ENVIOS_POR_SEGUNDO;
export const nuevoSuavizador = () => ({ muestras: [], desfase: null, atraso: 0 });
// v = lista de números (x, y, z, giro…) · t = la hora del que lo mandó · ahora = mi hora al recibirlo
export function agregarMuestra(s, v, t, ahora) {
  if (t === null || t === undefined) t = ahora;   // un juego viejo que no manda su hora: usamos la hora en que llegó
  // Las dos compus tienen relojes distintos: el mensaje que llegó más rápido dice cuánto se diferencian.
  // (Sube despacito, por si internet se puso más lento para siempre)
  const d = ahora - t;
  s.desfase = s.desfase === null ? d : Math.min(d, s.desfase + 0.5);
  // ¿Cuánto más tarde que el más rápido llegó este? El peor atraso de los últimos mensajes dice cuánto hay que esperar
  // (va bajando de a poquito si internet se arregla)
  s.atraso = Math.max(d - s.desfase, s.atraso * 0.98);
  const hora = t + s.desfase, m = s.muestras, ult = m[m.length - 1];
  if (ult && hora <= ult.t) return;   // llegó tarde o repetido: ya tenemos algo más nuevo
  // Si estuvo quieto, solo manda una vez por segundo: copiamos su última posición justo antes de esta,
  // para que no se deslice despacito durante todo ese segundo
  if (ult && hora - ult.t > INTERVALO_MS * 1.5) m.push({ t: hora - INTERVALO_MS, v: ult.v });
  m.push({ t: hora, v });
  if (m.length > 30) m.splice(0, m.length - 30);
}
// Mezcla dos posiciones: f = 0 es la primera, f = 1 la segunda. clase(i) dice qué es cada número:
// 'giro' (va por el camino más corto), 'fijo' (no se mezcla, como "está dormido") o nada (un número normal)
// Si las 3 primeras (x, y, z) saltaron más de TELETRANSPORTE (un portal, reaparecer…), aparece allá de golpe ENTERO
// (si no, una parte se deslizaría: por ejemplo la altura, al subir 10 m por un portal)
export function mezclar(a, b, f, clase = null) {
  if (a.length !== b.length) return b;
  if (a.length >= 3 && Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > TELETRANSPORTE) return b;
  return a.map((x, i) => {
    const c = clase && clase(i), y = b[i];
    if (c === 'fijo') return f < 1 ? x : y;
    if (c === 'giro') return acercarAngulo(x, y, f);
    return Math.abs(y - x) > TELETRANSPORTE ? y : x + (y - x) * f;
  });
}
// Cuánto en el pasado hay que dibujarlo: lo que se atrasan los mensajes, más el tiempo entre dos mensajes
// (para dibujar ENTRE dos posiciones, la siguiente ya tiene que haber llegado), más un poquito de margen
export const retrasoDe = s => Math.min(RETRASO_MAX, Math.max(RETRASO_MS, s.atraso + INTERVALO_MS + 20));
// ¿Dónde dibujarlo ahora? null si todavía no llegó nada
export function valoresEn(s, ahora, clase) {
  const m = s.muestras, t = ahora - retrasoDe(s);
  if (!m.length) return null;
  while (m.length > 2 && m[1].t <= t) m.shift();   // las muestras viejas ya no sirven
  if (t <= m[0].t || m.length === 1) return m[0].v;
  const [a, b] = m;
  if (t >= b.t) return b.v;   // se acabaron las muestras (internet se trabó): se queda en la última, sin inventar
  return mezclar(a.v, b.v, (t - a.t) / (b.t - a.t), clase);
}
