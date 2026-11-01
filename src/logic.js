// Lógica pura del juego (sin Three.js ni DOM), para poder probarla con tests.

// ---------- Choques contra paredes, pisos y muebles ----------
// Cajas fijas alineadas a los ejes: { x, z, hw, hd, top, bottom }.
// st = { pos: {x,y,z}, vel: {x,z}, onGround, prevX, prevZ }. Saca al cuerpo de cualquier caja que atraviese.
// El lado hacia el que se empuja sale de dónde estaba antes (prevX/prevZ), así nunca "salta" al otro lado de una pared.
export function collideWalls(st, boxes, { PR, H, STEP_UP }) {
  let hit = false;
  for (const pl of boxes) {
    const y = st.pos.y;
    if (y >= pl.top - 0.05 || y + H <= pl.bottom) continue;
    const dx = st.pos.x - pl.x, dz = st.pos.z - pl.z;
    const ox = pl.hw + PR - Math.abs(dx), oz = pl.hd + PR - Math.abs(dz);
    if (ox <= 0 || oz <= 0) continue;
    // Escalón bajito: se sube solo caminando
    if (st.onGround && pl.top - y <= STEP_UP) { st.pos.y = pl.top; continue; }
    const px = (st.prevX ?? st.pos.x) - pl.x, pz = (st.prevZ ?? st.pos.z) - pl.z;
    const wasInX = Math.abs(px) < pl.hw + PR - 1e-6, wasInZ = Math.abs(pz) < pl.hd + PR - 1e-6;
    let alongX;
    if (wasInZ && !wasInX) alongX = true;        // llegó por el lado x
    else if (wasInX && !wasInZ) alongX = false;  // llegó por el lado z
    else alongX = ox < oz;                       // ya estaba dentro: sale por el lado más cercano
    if (alongX) { st.pos.x = pl.x + (Math.sign(wasInX ? dx : px) || 1) * (pl.hw + PR); st.vel.x = 0; }
    else { st.pos.z = pl.z + (Math.sign(wasInZ ? dz : pz) || 1) * (pl.hd + PR); st.vel.z = 0; }
    hit = true;
  }
  return hit;
}

// Mueve un cuerpo (tx, tz) en pasitos de máximo 0,2 m, chocando en cada uno: así no atraviesa paredes aunque vaya muy rápido.
export function moveAndCollide(st, tx, tz, boxes, opts) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(tx), Math.abs(tz)) / 0.2));
  let hit = false;
  for (let i = 0; i < n; i++) {
    st.prevX = st.pos.x; st.prevZ = st.pos.z;
    st.pos.x += tx / n; st.pos.z += tz / n;
    if (collideWalls(st, boxes, opts)) hit = true;
  }
  return hit;
}

// ---------- Hitboxes exactas ----------
// Caja girada en el suelo: { x, z, hw, hd, a (giro en Y), y0, y1 }.
// Devuelve cuánto se meten dos cajas y en qué dirección separarlas (de A hacia B), o null si no se tocan.
export function boxHit(A, B) {
  if (A.y0 >= B.y1 || B.y0 >= A.y1) return null;
  const axes = [
    [Math.cos(A.a), -Math.sin(A.a)], [Math.sin(A.a), Math.cos(A.a)],
    [Math.cos(B.a), -Math.sin(B.a)], [Math.sin(B.a), Math.cos(B.a)],
  ];
  const dx = B.x - A.x, dz = B.z - A.z;
  let best = Infinity, nx = 0, nz = 0;
  for (const [ax, az] of axes) {
    const ra = A.hw * Math.abs(Math.cos(A.a) * ax - Math.sin(A.a) * az) + A.hd * Math.abs(Math.sin(A.a) * ax + Math.cos(A.a) * az);
    const rb = B.hw * Math.abs(Math.cos(B.a) * ax - Math.sin(B.a) * az) + B.hd * Math.abs(Math.sin(B.a) * ax + Math.cos(B.a) * az);
    const dist = dx * ax + dz * az;
    const over = ra + rb - Math.abs(dist);
    if (over <= 0) return null; // hay un eje que los separa: no se tocan
    if (over < best) { best = over; const sg = dist < 0 ? -1 : 1; nx = ax * sg; nz = az * sg; }
  }
  return { depth: best, nx, nz };
}

// ---------- Tienda y monedas ----------
export const upgradePrice = (base, level) => base * 2 ** level;
export const fmt = n => n.toLocaleString('es-ES', { useGrouping: 'always' }); // 1.234.567

// ---------- Tiempo ----------
// phase: 0 = medianoche, 0.25 = amanecer, 0.5 = mediodía, 0.75 = atardecer
export const sunElevation = phase => -Math.cos(phase * Math.PI * 2);
export const isNightPhase = phase => sunElevation(phase) < -0.05;
export function clockText(phase) {
  const mins = Math.floor(phase * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
export const hourToPhase = (h, min = 0) => (h * 60 + min) / (24 * 60);


// ---------- Física ----------
// Velocidad inicial para subir `height` metros con la gravedad `grav`
export const launchSpeedForHeight = (height, grav) => Math.sqrt(2 * grav * height);

// ---------- Cinta transportadora y asistente ----------
// La caja avanza por la cinta y se detiene justo al final
export const advanceOnBelt = (x, speed, dt, end) => Math.min(x + speed * dt, end);

// Velocidad de la cinta según la mejora: 0 = normal, 1 = Cinta 2.0 (+50%), 2 = turbo (+100%, el doble)
export const beltSpeed = tier => 2 * [1, 1.5, 2][tier];

// Dónde va cada cinta extra (x0 = donde empieza, z = su fila; filas cada 4 m):
//   · cintas de cajas: detrás de las dos primeras (z = 50 y 54), en su misma columna
//   · transformadores: en su propia zona a la izquierda, en columnas de 12 filas
// Máximo 5 cintas de cada tipo: la primera (de la tienda) + 4 extra
export const MAX_EXTRA_BOX_LINES = 4, MAX_EXTRA_BAG_LINES = 4;
// Las cintas están a la derecha de tu casa (x desde 42), lejos del pueblo, del parque y de la tienda de estilo.
// Primero la cinta normal y el transformador; detrás, las cintas extra que compres.
export const MAIN_LINES = { box: { x0: 42, len: 20, z: 8 }, bag: { x0: 42, len: 15, z: 12 } };
export function extraLineSlot(type, index) {
  if (type === 'box') return { x0: 42, len: 20, z: 16 + index * 4 };
  return { x0: 42, len: 15, z: 32 + index * 4 };
}

// Lo que ganas al recoger lo que llega al plato: una caja dorada (cinta normal) o una bolsa de 10 monedas (transformador)
export const BAG_VALUE = 10;
export const productReward = kind => (kind === 'bag' ? { coins: BAG_VALUE, boxes: 0 } : { coins: 0, boxes: 1 });

// Antes de la máquina viajan pedazos amarillos; desde el centro de la máquina, ya es una caja dorada
export const beltItemIsBox = (x, machineX) => x >= machineX;

// Altura de la caja: arriba de la cinta, y al pasar el final baja poco a poco hasta el plato del suelo
export function beltItemY(x, beltEndX, plateX, onBeltY, onPlateY) {
  if (x <= beltEndX) return onBeltY;
  const k = Math.min(1, (x - beltEndX) / (plateX - beltEndX));
  return onBeltY + (onPlateY - onBeltY) * k;
}

// Índice del punto más cercano (en el suelo) a `from`
export function nearestIndex(from, points) {
  let best = -1, bestD = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Velocidad del asistente según el nivel de su mejora (hasta el nivel 5)
export const ASSIST_SPEED_MAX = 5;
export const assistantSpeed = level => 6 + Math.min(level, ASSIST_SPEED_MAX) * 2;

// ---------- Guardado por usuario (localStorage) ----------
// "El Humano", " el   humano " y "el humano" son el mismo usuario
export const normalizeName = name => String(name).trim().replace(/\s+/g, ' ').toLowerCase();
export const saveKey = name => `rectangulo-verde:partida:${normalizeName(name)}`;

// Convierte la partida en texto para guardarla
export function serializeSave({ coins, boxes, levels, dayPhase, pos, style, trophies = [], spooky = 0, spookyT = 0, disfraces = [], disfraz = null }) {
  return JSON.stringify({ v: 1, coins, boxes, levels, dayPhase, pos: { x: pos.x, y: pos.y, z: pos.z }, style, trophies, spooky, spookyT, disfraces, disfraz });
}

// Lee una partida guardada. Si el texto está roto o trae valores raros, los ignora.
// knownLevels: los nombres de mejoras que existen hoy en el juego.
export function parseSave(text, knownLevels) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== 'object' || d.v !== 1) return null;
  const count = n => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  const levels = {};
  for (const k of knownLevels) levels[k] = count(d.levels && d.levels[k]);
  const phase = Number.isFinite(d.dayPhase) && d.dayPhase >= 0 && d.dayPhase < 1 ? d.dayPhase : null;
  const p = d.pos || {};
  const pos = [p.x, p.y, p.z].every(Number.isFinite) ? { x: p.x, y: p.y, z: p.z } : null;
  const trophies = Array.isArray(d.trophies) ? d.trophies.filter(t => typeof t === 'string') : [];   // las partidas viejas no tienen trofeos
  // 🎃 SpookyCoins y disfraces (las partidas viejas no los tienen: empiezan en 0 y sin disfraces)
  const disfraces = Array.isArray(d.disfraces) ? [...new Set(d.disfraces.filter(id => disfrazById(id)))] : [];
  const disfraz = disfraces.includes(d.disfraz) ? d.disfraz : null;
  const spookyT = Number.isFinite(d.spookyT) && d.spookyT >= 0 && d.spookyT < 60 ? d.spookyT : 0;
  return { coins: count(d.coins), boxes: count(d.boxes), levels, dayPhase: phase, pos, style: parseStyle(d.style), trophies, spooky: count(d.spooky), spookyT, disfraces, disfraz };
}

// ---------- 🎃 Halloween: SpookyCoins y la tienda de disfraces (en una esquina del salón, atendida por un fantasma) ----------
// Ganas 20 🎃 por cada minuto que juegas en cualquier modo (minijuegos, la Escuela, el sandbox; en tu mundo, no)
// y 30 🎃 más cada vez que ganas un modo. Con ellas compras disfraces (uno puesto a la vez; tus amigos lo ven).
export const SPOOKY = { porMinuto: 20, porGanar: 30 };
// Sumar tiempo jugado: segundos que llevabas (menos de 1 minuto) + dt → { segundos (lo que sobra), ganados }
export function sumarTiempoSpooky(segundos, dt) {
  const total = Math.max(0, segundos) + Math.max(0, dt), minutos = Math.floor(total / 60 + 1e-9);   // (+1e-9: que las sumas de 1/60 no se queden cortas)
  return { segundos: total - minutos * 60, ganados: minutos * SPOOKY.porMinuto };
}
// ¿Este momento cuenta como JUGAR (para ganar 🎃 por minuto)? Solo jugando de verdad: en la torre, en una ronda de
// Escondidas o de Atrapadas, o en un minijuego del mundo. NO en el salón, ni mirando a GILBERT en el sandbox, ni en la zona rara,
// ni en una pantalla de resultado, ni en tu mundo.  modo: el id del minijuego (o null) · fase: la de la Escuela · enRonda · resultado
export function ganaSpooky({ modo = null, fase = null, enRonda = false, resultado = false } = {}) {
  if (!modo || modo === 'sandbox' || resultado) return false;
  if (modo !== 'escuela') return true;   // los minijuegos del mundo
  if (fase === 'nomires') return true;
  return (fase === 'escondidas' || fase === 'atrapadas' || fase === 'carrera' || fase === 'spleef') && enRonda;
}
// Los ojos del disfraz "Mil ojos": ~20 ojos grandes, bien repartidos por el cuerpo (sin encimarse)
// cuerpo: ancho W, alto H, grosor D (el rectángulo del personaje). Cada ojo: { x, y, z, nx, nz } (hacia dónde mira)
export const OJO_MIL = 0.13;   // el radio de cada ojo
export function ojosMilOjos(W = 1, H = 2, D = 0.6) {
  const out = [], filas = [0.32, 0.76, 1.2, 1.64].map(f => f * H / 2);
  for (const y of filas) for (const x of [-W / 4, W / 4]) { out.push({ x, y, z: D / 2 + 0.03, nx: 0, nz: 1 }); out.push({ x, y, z: -D / 2 - 0.03, nx: 0, nz: -1 }); }
  for (const y of [0.5, 1.05, 1.6].map(f => f * H / 2)) for (const s of [-1, 1]) out.push({ x: s * (W / 2 + 0.03), y, z: 0, nx: s, nz: 0 });
  return out;
}
export const DISFRACES = [
  { id: 'aracnido', nombre: 'Arácnido puro', precio: 15, desc: 'Tu personaje de siempre… lleno de arañitas' },
  { id: 'dulce', nombre: 'Qué dulce', precio: 30, desc: 'Eres una calabaza (la mitad de alto) con dulces y chupetines; tus ojos son 2 chupetines' },
  { id: 'milojos', nombre: 'Mil ojos', precio: 45, desc: 'Te vuelves blanco y lleno de ojos grandes de colores' },
  { id: 'fantasmita', nombre: 'Fantasmita', precio: 55, desc: 'Una sábana blanca que flota, con dos agujeros para mirar' },
  { id: 'momia', nombre: 'Momia', precio: 70, desc: 'Vendas por todos lados y un ojo rojo que brilla' },
];
export const disfrazById = id => DISFRACES.find(d => d.id === id) || null;
// Comprar: si alcanza y no lo tienes, se descuenta y es tuyo. Devuelve { ok, spooky, disfraces, motivo }
export function comprarDisfraz(spooky, disfraces, id) {
  const d = disfrazById(id);
  if (!d) return { ok: false, spooky, disfraces, motivo: 'no existe' };
  if (disfraces.includes(id)) return { ok: false, spooky, disfraces, motivo: 'ya lo tienes' };
  if (spooky < d.precio) return { ok: false, spooky, disfraces, motivo: `te faltan ${d.precio - spooky} 🎃` };
  return { ok: true, spooky: spooky - d.precio, disfraces: [...disfraces, id], motivo: '' };
}
// Ponerse o sacarse un disfraz (uno a la vez; solo los que tienes)
export const ponerDisfraz = (puesto, disfraces, id) => (id === puesto ? null : disfraces.includes(id) ? id : puesto);
// La tienda: en la esquina de atrás a la izquierda del salón (mirando al pizarrón), lejos de la puerta y de las sillas
export const TIENDA_HALLOWEEN = { x: 12.3, z: -9.8, vendedor: { x: 13.3, z: -10.8 } };   // el vendedor: un fantasmita
export const cercaDelVendedor = (x, z, cerca = 2.6) => Math.hypot(x - TIENDA_HALLOWEEN.x, z - TIENDA_HALLOWEEN.z) < cerca;

// ---------- Casa grande con sótano ----------
// El sótano es casi del tamaño de la casa (2 m más largo) y está vacío. Su techo está 2 m bajo el suelo,
// así que desde afuera no se ve nada. Las cintas se quedan afuera.
export const BIG_HOUSE = { x0: 20, x1: 36, z0: 4, z1: 18, doorZ: 9, height: 5 };
export const MEDIUM_HOUSE = { x0: 20, x1: 32, z0: 4, z1: 14 };

// ---------- Rodear la casa (para que los asistentes no se metan) ----------
// ¿Está el punto dentro del rectángulo?
export const insideRect = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
// ¿La línea recta de a hasta b atraviesa el rectángulo?
export function segmentHitsRect(ax, az, bx, bz, r) {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, bx - ax, r.x0, r.x1], [az, bz - az, r.z0, r.z1]]) {
    if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}
// A dónde caminar para ir de a hasta b sin cruzar la casa: si la casa estorba, primero a la esquina más conveniente
export function detourAround(ax, az, bx, bz, r, margin = 1.2) {
  const grow = m => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
  if (!segmentHitsRect(ax, az, bx, bz, grow(margin / 2))) return { x: bx, z: bz };
  const g = grow(margin);
  let best = null, bestLen = Infinity;
  for (const [x, z] of [[g.x0, g.z0], [g.x1, g.z0], [g.x0, g.z1], [g.x1, g.z1]]) {
    if (Math.hypot(x - ax, z - az) < 0.3 || segmentHitsRect(ax, az, x, z, r)) continue;
    const len = Math.hypot(x - ax, z - az) + Math.hypot(bx - x, bz - z);
    if (len < bestLen) { bestLen = len; best = { x, z }; }
  }
  return best || { x: bx, z: bz };
}
export const BASEMENT = { x0: 19, x1: 37, z0: 4, z1: 18, y: -7, ceilingY: -2 };
// Escalera dentro de la casa: baja 7 m en 18 escalones (de 0,39 m de alto y 0,6 m de fondo; se baja caminando)
export const STAIRWELL = { x0: 31, x1: 34, z0: 5, steps: 18, rise: 7 / 18, run: 0.6 };
STAIRWELL.z1 = STAIRWELL.z0 + STAIRWELL.steps * STAIRWELL.run;   // 15,8

// Altura del suelo en (x, z): dentro del sótano (si ya existe) es el piso del sótano; afuera, 0
export function groundHeight(x, z, basementOpen, factoryOpen = false) {
  const b = BASEMENT;
  if (basementOpen && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b.y;
  return factoryOpen && inFactory(x, z) ? FACTORY.y : 0;
}

// ---------- Fábrica subterránea (se compra después del sótano) ----------
// Un salón al lado del sótano (se entra por una puerta en su pared derecha) con las 10 cintas en filas.
// Entre fila y fila queda un pasillo para caminar; los trabajadores están en las puntas de cada cinta.
export const FACTORY = { x0: 37, x1: 72, z0: 4, z1: 62, y: -7, ceilingY: -2, door: { z0: 12, z1: 16 }, lineX0: 44, firstZ: 8, rowGap: 5.5,
  cost: { coins: 2000, boxes: 1000 } };
export const inFactory = (x, z) => x > FACTORY.x0 && x < FACTORY.x1 && z > FACTORY.z0 && z < FACTORY.z1;
// Dónde va cada cinta en la fábrica. index 0 = la de la tienda; 1, 2, 3, 4 = las extra.
// Arriba las 5 cintas de cajas y abajo los 5 transformadores.
export function factoryLineSlot(type, index) {
  const row = (type === 'box' ? 0 : 5) + index;
  return { x0: FACTORY.lineX0, len: type === 'box' ? 20 : 15, z: FACTORY.firstZ + row * FACTORY.rowGap, y0: FACTORY.y };
}

// El techo del sótano (que es el suelo de arriba) tiene un hueco para la escalera.
// Devuelve 4 rectángulos que cubren todo el sótano menos ese hueco.
export function slabPieces(area = BASEMENT, hole = STAIRWELL) {
  return [
    { x0: area.x0, x1: area.x1, z0: area.z0, z1: hole.z0 },  // antes del hueco
    { x0: area.x0, x1: area.x1, z0: hole.z1, z1: area.z1 },  // después del hueco
    { x0: area.x0, x1: hole.x0, z0: hole.z0, z1: hole.z1 },  // a la izquierda
    { x0: hole.x1, x1: area.x1, z0: hole.z0, z1: hole.z1 },  // a la derecha
  ];
}

// ---------- Precios con dos monedas (por ejemplo: 100 cajas + 200 monedas) ----------
// cost = { coins, boxes }. Devuelve cuánto te falta de cada una (0 si alcanza).
export function missingFor(wallet, cost) {
  const out = {};
  for (const k of Object.keys(cost)) out[k] = Math.max(0, cost[k] - (wallet[k] || 0));
  return out;
}
export const canAfford = (wallet, cost) => Object.values(missingFor(wallet, cost)).every(n => n === 0);

// ---------- Montañas alrededor del mapa ----------
// El mapa sigue siendo un cuadrado; en vez del borde invisible con trampolín, lo rodean montañas muy altas.
// Generador de números al azar con semilla (siempre salen las mismas montañas)
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Conos { x, z, r (radio de la base), h (alto) }. Fila de adelante pegada al borde (casi sin meterse al campo)
// y una fila de atrás más grande, para que se vea una cordillera.
export const MOUNTAIN_WALL_INSET = 2; // la pared invisible que te detiene está 2 m antes del borde, al pie de las montañas
export function mountainRing(edge = 100, seed = 7) {
  const rnd = seededRandom(seed), out = [];
  const rows = [
    { r: 24, out: 0.9, step: 8, hMin: 70, hMax: 120 },   // al pie: casi no entra al campo
    { r: 40, out: 1.4, step: 28, hMin: 110, hMax: 180 }, // atrás, más grandes
  ];
  for (const row of rows) {
    for (const side of [0, 1, 2, 3]) {
      for (let t = -edge - row.r; t <= edge + row.r; t += row.step) {
        const r = row.r * (0.9 + rnd() * 0.1), h = row.hMin + rnd() * (row.hMax - row.hMin);
        const d = edge + r * row.out;                // distancia del centro del mapa al centro del cono
        const along = t + (rnd() - 0.5) * row.step * 0.3;
        const [x, z] = side === 0 ? [d, along] : side === 1 ? [-d, along] : side === 2 ? [along, d] : [along, -d];
        out.push({ x, z, r, h });
      }
    }
  }
  return out;
}

// ---------- Bláster ----------
// El normal dispara láseres azules a 30 m/s; el Bláster 2.0, láseres rojos a 25 m/s que estallan en partículas rojas.
// Los dos recargan en 1 segundo.
export const blasterStats = v2 => (v2
  ? { speed: 25, reload: 1, color: 0xff2a2a, glow: 0xff8a8a, particles: true }
  : { speed: 30, reload: 1, color: 0x1e6bff, glow: 0x7fb2ff, particles: false });

// ---------- Estilo: sombreros, colores y gafas ----------
// Se compran en la tienda de estilo (en una esquina de tu mitad) y se ponen o quitan en el armario de tu casa.
export const DEFAULT_COLOR = 'green';
export const COSMETICS = [
  { id: 'capBlue', type: 'hat', name: 'Gorra azul', price: 30, color: 0x2f7de1, model: 'cap' },
  { id: 'topHat', type: 'hat', name: 'Sombrero de copa', price: 50, color: 0x1a1a1a, model: 'topHat' },
  { id: 'capRedBack', type: 'hat', name: 'Gorra roja (visera hacia atrás)', price: 30, color: 0xe0302f, model: 'capBack' },
  { id: 'colorBlue', type: 'color', name: 'Azul', price: 20, color: 0x2f7de1 },
  { id: 'colorYellow', type: 'color', name: 'Amarillo', price: 20, color: 0xffd23f },
  { id: 'colorPurple', type: 'color', name: 'Morado', price: 20, color: 0x9b4de0 },
  { id: 'colorOrange', type: 'color', name: 'Naranja', price: 20, color: 0xff8a3d },
  { id: 'colorPink', type: 'color', name: 'Rosa', price: 20, color: 0xf15bb5 },
  { id: 'colorBlack', type: 'color', name: 'Negro', price: 20, color: 0x2b2f35 },
  { id: 'glassesPixel', type: 'glasses', name: 'Gafas pixel', price: 40, model: 'pixel' },
  { id: 'glassesRound1', type: 'glasses', name: 'Gafas 1 (redondas azules)', price: 35, color: 0x2f7de1, model: 'round' },
  { id: 'glassesRound2', type: 'glasses', name: 'Gafas 2 (redondas verdes)', price: 35, color: 0x2fae4e, model: 'round' },
  { id: 'glassesRound3', type: 'glasses', name: 'Gafas 3 (redondas negras)', price: 35, color: 0x1a1a1a, model: 'round' },
];
// Tu verde de siempre: no se compra, siempre lo tienes
export const GREEN = { id: DEFAULT_COLOR, type: 'color', name: 'Verde (el tuyo)', price: 0, color: 0x2fae4e };
export const cosmeticById = id => (id === DEFAULT_COLOR ? GREEN : COSMETICS.find(c => c.id === id));
export const emptyStyle = () => ({ owned: [], equipped: { hat: null, color: DEFAULT_COLOR, glasses: null } });

// Ponerse o quitarse algo del armario. Solo se puede usar lo que compraste.
// Sombrero y gafas se ponen y se quitan; el color se cambia (quitarte un color te deja el verde).
export function toggleEquip(style, id) {
  const item = cosmeticById(id);
  if (!item || (id !== DEFAULT_COLOR && !style.owned.includes(id))) return style;
  const eq = { ...style.equipped };
  if (item.type === 'color') eq.color = eq.color === id ? DEFAULT_COLOR : id;
  else eq[item.type] = eq[item.type] === id ? null : id;
  return { owned: [...style.owned], equipped: eq };
}

// Lee el estilo guardado; ignora cosas que no existen o que no compraste
export function parseStyle(raw) {
  const st = emptyStyle();
  if (!raw || typeof raw !== 'object') return st;
  const known = new Set(COSMETICS.map(c => c.id));
  st.owned = Array.isArray(raw.owned) ? [...new Set(raw.owned.filter(id => known.has(id)))] : [];
  const eq = raw.equipped || {};
  const okFor = (type, id) => id && st.owned.includes(id) && cosmeticById(id).type === type;
  if (okFor('hat', eq.hat)) st.equipped.hat = eq.hat;
  if (okFor('glasses', eq.glasses)) st.equipped.glasses = eq.glasses;
  if (okFor('color', eq.color)) st.equipped.color = eq.color;
  return st;
}

// ---------- Sonido ----------
// Frecuencia de una nota ("E4" = MI 4). La4 = 440 Hz.
export function noteFrequency(name) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) return NaN;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}
// Sonido de moneda al estilo Mario: dos notas agudas de onda cuadrada, SI 5 cortita y luego MI 6 que se apaga
export const COIN_NOTES = [{ note: 'B5', start: 0, length: 0.07 }, { note: 'E6', start: 0.07, length: 0.38 }];
// Volumen del bosque: de día normal, de noche un 15% más bajo (day: 1 = día, 0 = noche)
export const ambientVolume = day => 0.85 + 0.15 * Math.min(1, Math.max(0, day));
// Efecto "bitcrushed": repite cada muestra `hold` veces (menos calidad) y la redondea a `bits` bits (sonido de videojuego viejo)
export function bitcrush(samples, bits, hold) {
  const levels = 2 ** (bits - 1), out = new Float32Array(samples.length);
  let held = 0;
  for (let i = 0; i < samples.length; i++) {
    if (i % hold === 0) held = Math.round(Math.max(-1, Math.min(1, samples[i])) * levels) / levels;
    out[i] = held;
  }
  return out;
}
// Cada cuánto suena un paso según qué tan rápido vas (a 12 m/s, un paso cada 0,32 s)
export const footstepInterval = speed => 0.32 * (12 / Math.max(1, speed));

// Sonidos a distancia: lo que pasa lejos suena más bajo y más apagado (como en la vida real)
export function distanceGain(d, ref = 6) {
  return ref / (ref + Math.max(0, d - ref));          // 1 de cerca; a 60 m, una décima parte
}
export const distanceCutoff = d => 600 + 11400 * Math.max(0, 1 - d / 90); // filtro: de 12 000 Hz (cerca) a 600 Hz (muy lejos)

// ---------- Tienda de estilo: frente a la ventana de atrás de tu casa (la que mira hacia tu mitad) ----------
export const STYLE_STALL = { x: 27, z: 28 };

// ---------- Bots tontos: juegan solo en tu mitad ----------
export const BOT_COLORS = [0xffd60a, 0xff8c00, 0xff2d95, 0xaf52de, 0x0a84ff, 0x64d2ff, 0x30d5c8, 0xa4e400, 0xe040fb, 0xff6b6b];
export const BOT_SCALE = 0.5;                       // la mitad de tu tamaño
// Bots de los minijuegos: tu mismo ancho y grosor, pero un 20 % más bajitos (100 % − 20 % = 80 %)
export const MINIGAME_BOT_SCALE = { width: 1, height: 0.8, depth: 1 };
export const BOT_MIN_Z = 4;                         // nunca bajan de aquí: la línea amarilla está en z 0–1,5
// ---------- Pueblo: una casa por cada color de bot, con un bot grande (de tu altura) que vive ahí ----------
// Dos filas de 5 casas al fondo de tu mitad. La puerta mira hacia ti (hacia z más chico).
export const VILLAGE = {
  size: 7, doorOut: 5,   // la casa mide 7 × 7 m; el bot grande espera 5 m delante de su casa
  houses: [-80, -56, -32, -8, 16].flatMap(x => [{ x, z: 48 }, { x, z: 70 }]).sort((a, b) => a.z - b.z || a.x - b.x),
};
export const villageDoor = i => ({ x: VILLAGE.houses[i].x, z: VILLAGE.houses[i].z - VILLAGE.doorOut });
// ---------- Por dentro de las casas del pueblo ----------
// La puerta está en la pared de adelante (la que mira hacia el bot). Hay ventanas de vidrio, un tapete y la cama del bot.
export const VILLAGE_HOUSE = {
  wall: 0.25, height: 3.6,
  door: { w: 1.4, h: 2.3 },                    // el hueco de la puerta, en medio de la pared de adelante
  window: { w: 1.1, y0: 1.5, y1: 2.5 },         // las ventanas (huecos con vidrio)
  bed: { dx: 1.9, dz: 2.0, w: 1.3, l: 2.3, top: 0.55 },   // la cama, al fondo a la derecha
  rug: { dz: -0.2, r: 1.5 },                    // el tapete redondo, en el medio
};
// Pedazos de una pared con huecos (puertas y ventanas). La pared va de a0 a a1; cada hueco es { c0, c1, y0, y1 }.
// Devuelve cajitas { a0, a1, y0, y1 }: columnas enteras entre huecos, y debajo y encima de cada hueco.
export function wallPieces(a0, a1, holes, height = VILLAGE_HOUSE.height) {
  const out = [];
  let cur = a0;
  for (const h of [...holes].sort((p, q) => p.c0 - q.c0)) {
    if (h.c0 > cur) out.push({ a0: cur, a1: h.c0, y0: 0, y1: height });
    if (h.y0 > 0) out.push({ a0: h.c0, a1: h.c1, y0: 0, y1: h.y0 });
    if (h.y1 < height) out.push({ a0: h.c0, a1: h.c1, y0: h.y1, y1: height });
    cur = h.c1;
  }
  if (cur < a1) out.push({ a0: cur, a1, y0: 0, y1: height });
  return out;
}
// ¿Estás dentro de la casa i? (entre las paredes)
export function insideVillageHouse(x, z, i) {
  const h = VILLAGE.houses[i], m = VILLAGE.size / 2 - VILLAGE_HOUSE.wall;
  return Math.abs(x - h.x) < m && Math.abs(z - h.z) < m;
}
// La cama del bot, la entrada (justo adentro de la puerta) y la salida (afuera, frente a la puerta)
export const villageBed = i => ({ x: VILLAGE.houses[i].x + VILLAGE_HOUSE.bed.dx, z: VILLAGE.houses[i].z + VILLAGE_HOUSE.bed.dz });
export const villageEntrance = i => ({ x: VILLAGE.houses[i].x, z: VILLAGE.houses[i].z - VILLAGE.size / 2 + 1 });
export const villageExit = i => ({ x: VILLAGE.houses[i].x, z: VILLAGE.houses[i].z - VILLAGE.size / 2 - 1.5 });
export const nearVillageHouse = (x, z, margin = 2) => VILLAGE.houses.some(h => Math.abs(x - h.x) < VILLAGE.size / 2 + margin && Math.abs(z - h.z) < VILLAGE.size / 2 + margin);
// ¿Puede un bot ir a (x, z)? Solo en tu mitad, lejos de las montañas, de la casa y de la tienda de estilo
export function botCanGo(x, z) {
  if (z < BOT_MIN_Z || z > 92 || Math.abs(x) > 92) return false;
  if (x > 17 && x < 39 && z > 1 && z < 21) return false;                               // casa (y su alrededor)
  if (Math.abs(x - STYLE_STALL.x) < 5 && Math.abs(z - STYLE_STALL.z) < 4.5) return false; // tienda de estilo
  if (nearVillageHouse(x, z)) return false;                                               // casas del pueblo
  return true;
}
// Un lugar al azar al que un bot puede ir (rnd: función que da números entre 0 y 1)
export function randomBotTarget(rnd) {
  for (let i = 0; i < 50; i++) {
    const x = (rnd() * 2 - 1) * 90, z = BOT_MIN_Z + rnd() * (92 - BOT_MIN_Z);
    if (botCanGo(x, z)) return { x, z };
  }
  return { x: 0, z: 30 };
}

// ---------- Parque: 2 columpios y un tobogán con escalera (los bots suben, bajan y juegan) ----------
// Columpios: un marco con 2 asientos que se mecen hacia adelante y atrás (a lo largo de z)
export const SWINGS = { x: -28, z: 22, barY: 3.2, rope: 2.4, seats: [-1, 1] };   // seats: desplazamiento en x de cada asiento
// Ángulo del columpio (radianes) a los t segundos de mecerse: sube poco a poco hasta ±0,6
export const swingAngle = t => 0.6 * Math.min(1, t / 2) * Math.sin(Math.sqrt(30 / SWINGS.rope) * t);
// Tobogán: escalera en x0, plataforma arriba y bajada hasta x0 + 6 (a lo largo de x)
export const SLIDE = { x0: -18, z: 18, top: 2.2, platform: 1.2, chute: 4.4, endY: 0.3 };
// Dónde está alguien que se tira por el tobogán (p de 0 = arriba a 1 = abajo); baja más rápido al final
export function slidePoint(p) {
  const k = Math.min(1, Math.max(0, p)), s = SLIDE;
  const start = s.x0 + s.platform;
  return { x: start + k * s.chute, y: s.top + (s.endY - s.top) * k };
}

// ---------- Bots que entran a tu casa (1 de cada 5 veces que eligen a dónde ir) ----------
export const HOUSE_VISIT_CHANCE = 1 / 5;
// Ruta: frente a la puerta (afuera) → adentro → (se queda un rato) → puerta → afuera. Sirve para la casa mediana y la grande.
export const HOUSE_VISIT = { outside: { x: 16.5, z: 9 }, door: { x: 21.5, z: 9 }, inside: { x: 24.5, z: 12.5 } };

// ---------- Botón rojo del sótano ----------
export const RED_BUTTON = { x: 35.6, z: 9 };   // contra la pared derecha del sótano
// Antes de comprar el sótano, el botón está en la esquina de adelante a la derecha de tu casa mediana
export const RED_BUTTON_HOUSE = { x: 31.2, z: 4.8 };

// ---------- Parkour con lava (modo turquesa) ----------
// Torre de 50 escalones en espiral (coordenadas relativas al centro de su zona); en la cima está la casita del bot.
export const PARKOUR = { steps: 50, radius: 9, turn: 0.55, rise: 1.4, firstY: 1, size: 3, topSize: 6, topPush: 4 };
// La cima es más grande y está un poco hacia afuera, para que no quede encima del escalón anterior
export function parkourStep(i) {
  const P = PARKOUR, a = i * P.turn, r = i === P.steps - 1 ? P.radius + P.topPush : P.radius;
  return { x: Math.sin(a) * r, y: P.firstY + i * P.rise, z: Math.cos(a) * r };
}
export const parkourSize = i => (i === PARKOUR.steps - 1 ? PARKOUR.topSize : PARKOUR.size);
// La lava empieza 5 m por debajo del primer escalón y sube 1 m por segundo
export const LAVA = { start: -5, speed: 1 };
export const lavaHeight = t => LAVA.start + LAVA.speed * Math.max(0, t);

// El bot rojo te sigue por el mismo camino que hiciste, un poco atrás (lag segundos).
// trail: [{ t, x, y, z }] ordenado por tiempo. Devuelve dónde debería estar el bot en el momento `now`.
export function followTrail(trail, now, lag) {
  if (!trail.length) return null;
  const want = now - lag;
  if (want <= trail[0].t) return { ...trail[0] };
  for (let i = 1; i < trail.length; i++) {
    if (trail[i].t >= want) {
      const a = trail[i - 1], b = trail[i], k = (want - a.t) / (b.t - a.t || 1);
      return { t: want, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return { ...trail[trail.length - 1] };
}

// ---------- Los 10 minijuegos: uno por cada bot tonto (mismo orden que BOT_COLORS) ----------
export const MINIGAMES = [
  { id: 'maze',     bot: 'amarillo',   name: 'Laberinto',             goal: 'Lleva al bot amarillo a su casa por el laberinto', reward: { coins: 60 } },
  { id: 'crates',   bot: 'naranja',    name: 'Cajas grandes',         goal: 'Saca las 5 cajas grandes de la casa del bot naranja (empújalas)', reward: { boxes: 5 } },
  { id: 'flower',   bot: 'rosa',       name: 'La flor que corre',     goal: 'Alcanza a la flor rosada y riégala con F', reward: { coins: 20 } },
  { id: 'dropper',  bot: 'morado',     name: 'Dropper',               goal: 'Cae 200 m sin tocar lo rojo y aterriza en lo verde', reward: { coins: 150 } },
  { id: 'dolphins', bot: 'azul',       name: 'Delfines',              goal: 'Salta sobre los 10 delfines que saltan fuera del agua y recoge la gorra sobre la ballena dormida', reward: { coins: 80 } },
  { id: 'clouds',   bot: 'celeste',    name: 'Nubes',                 goal: 'Salta por las 10 nubes y lleva al bot celeste a su casa', reward: { coins: 60 } },
  { id: 'lava',     bot: 'turquesa',   name: '50 escalones con lava', goal: 'Sube los 50 escalones con el bot turquesa antes de que llegue la lava', reward: { coins: 100 } },
  { id: 'trees',    bot: 'verde lima', name: 'Los 20 árboles',        goal: 'Busca el círculo amarillo entre los rojos: pulsa E junto a cada árbol', reward: { coins: 40 } },
  { id: 'meteors',  bot: 'magenta',    name: 'Lluvia de meteoritos',  goal: 'Sobrevive 30 segundos: aléjate de las sombras rojas', reward: { coins: 70 } },
  { id: 'mix',      bot: 'coral',      name: 'Nubes y lava',          goal: 'Sube por las nubes con los bots celeste, turquesa y coral mientras sube la lava', reward: { coins: 120 } },
];
// Cada minijuego vive lejos del mapa, en su propia zona
// (el sandbox queda más lejos, en otra fila: sus salas son grandes y así nunca se encima con el Modo Escuela)
export const minigameOrigin = k => ({ x: 2000 + k * 1000, z: k === SANDBOX_K ? 9000 : 3000 });

// ----- Amarillo: laberinto -----
export const MAZE = { cols: 9, rows: 9, cell: 4, wallH: 3, seed: 2026, minPath: 24 };
// Laberinto "perfecto" (un solo camino entre dos celdas). walls[r][c] = { n, e, s, w } (true = hay pared)
export function generateMaze(cols, rows, seed) {
  const rnd = seededRandom(seed);
  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ n: true, e: true, s: true, w: true })));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  const dirs = [[-1, 0, 'n', 's'], [0, 1, 'e', 'w'], [1, 0, 's', 'n'], [0, -1, 'w', 'e']];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = dirs.filter(([dr, dc]) => { const R = r + dr, C = c + dc; return R >= 0 && R < rows && C >= 0 && C < cols && !seen[R][C]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dr, dc, a, b] = opts[Math.floor(rnd() * opts.length)];
    walls[r][c][a] = false; walls[r + dr][c + dc][b] = false; seen[r + dr][c + dc] = true;
    stack.push([r + dr, c + dc]);
  }
  return { cols, rows, walls };
}
// Un laberinto nuevo cada vez, pero nunca uno demasiado fácil (el camino a la casa da al menos minPath pasos)
export function pickMaze(rnd = Math.random) {
  for (;;) {
    const maze = generateMaze(MAZE.cols, MAZE.rows, Math.floor(rnd() * 1e9));
    if (mazePathLength(maze, [0, 0], [MAZE.rows - 1, MAZE.cols - 1]) >= MAZE.minPath) return maze;
  }
}
// Largo del camino (en celdas) entre dos celdas; -1 si no hay camino
export function mazePathLength(maze, [r0, c0], [r1, c1]) {
  const dist = Array.from({ length: maze.rows }, () => Array(maze.cols).fill(-1));
  const q = [[r0, c0]]; dist[r0][c0] = 0;
  const step = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  while (q.length) {
    const [r, c] = q.shift();
    for (const k of ['n', 'e', 's', 'w']) {
      if (maze.walls[r][c][k]) continue;
      const R = r + step[k][0], C = c + step[k][1];
      if (dist[R][C] < 0) { dist[R][C] = dist[r][c] + 1; q.push([R, C]); }
    }
  }
  return dist[r1][c1];
}

// ----- Naranja: 5 cajas grandes dentro de su casa -----
export const CRATES = { house: { x0: -8, x1: 8, z0: -6, z1: 6 }, doorHalf: 2, size: 1.8,
  start: [[-4, -2.5], [0, -2.5], [4, -2.5], [-2, 2], [2, 2]] };   // la puerta está en la pared de z = -6
export const crateOutside = (x, z) => x < CRATES.house.x0 || x > CRATES.house.x1 || z < CRATES.house.z0 || z > CRATES.house.z1;

// ----- Rosa: jardín donde corre la flor -----
// La flor corre más rápido que tú (14 contra 12), pero se cansa: corre 2,5 s y descansa 1,2 s
export const GARDEN = { half: 7.5, flowerSpeed: 14, sprint: 2.5, rest: 1.2, restSpeed: 4, waterRange: 4.5, waterSpeed: 14, leapAt: 4.8, leapTime: 0.45, leapEvery: 0.5 };
// Si te acercas, salta por encima de ti al otro lado del jardín (pero cansada no puede)
// ¿Está cansada la flor en el segundo t?
export const flowerTired = t => t % (GARDEN.sprint + GARDEN.rest) >= GARDEN.sprint;   // jardín de 15 × 15 m

// ----- Morado: dropper -----
export const DROPPER = { top: 205, half: 6, hole: 3.6, layers: 8, firstLayer: 175, gap: 21, pad: 3.4, maxFall: 18, seed: 77 };
// Cada piso rojo tapa todo el tubo menos un hueco; el último es el suelo rojo con el cuadro verde
export function dropperLayers() {
  const D = DROPPER, rnd = seededRandom(D.seed), lim = D.half - D.hole / 2 - 0.3, out = [];
  let prev = { x: 0, z: 0 };
  for (let i = 0; i < D.layers; i++) {
    let h;
    do { h = { x: (rnd() * 2 - 1) * lim, z: (rnd() * 2 - 1) * lim }; } while (Math.hypot(h.x - prev.x, h.z - prev.z) < 3); // que cada hueco esté en otro lugar
    out.push({ y: D.firstLayer - i * D.gap, hole: h }); prev = h;
  }
  return out;
}
export const dropperPad = () => { const r = seededRandom(DROPPER.seed + 1); const lim = DROPPER.half - DROPPER.pad / 2 - 0.3; return { x: (r() * 2 - 1) * lim, z: (r() * 2 - 1) * lim }; };

// ----- Azul: delfines y ballena -----
// Cada delfín nada de un lado a otro (a lo largo de x) en su carril z; el muelle está en z = 0 y la ballena al final.
// 10 delfines, uno por fila. No nadan: salen del agua, hacen un arco de lado y se vuelven a meter.
// Como "fijar estilo de rotación a izquierda-derecha" en Scratch: solo miran a la izquierda o a la derecha, nunca se inclinan.
// leap: segundos fuera del agua · under: segundos escondidos · span: metros que avanzan de lado en el salto
// peak: qué tan alto suben · wave: retraso entre un delfín y el siguiente (salen en ola)
export const DOLPHINS = { count: 10, firstZ: 5, gap: 4.4, leap: 2.6, under: 1.0, span: 5, peak: 2.2, wave: 0.85, length: 3, width: 1.4, whaleZ: 51, whaleSize: [7.2, 2.4, 3.4] };   // whaleSize: la parte de arriba de su espalda, donde se puede pisar
export const dolphinLane = i => DOLPHINS.firstZ + i * DOLPHINS.gap;
// Dónde está el delfín i en el segundo t (x: de lado en su fila; y: cuánto subió; dir: 1 = mira a la derecha, -1 = a la izquierda)
export function dolphinLeap(i, t) {
  const D = DOLPHINS, cycle = D.leap + D.under, local = (((t - i * D.wave) % cycle) + cycle) % cycle;
  const dir = i % 2 ? -1 : 1;   // uno salta hacia la derecha, el siguiente hacia la izquierda
  if (local >= D.leap) return { up: false, u: 1, x: 0, y: -2, dir };
  const u = local / D.leap;
  return { up: true, u, dir, x: dir * (u - 0.5) * D.span, y: Math.sin(u * Math.PI) * D.peak };
}

// ----- Celeste y coral: nubes -----
// Nubes una detrás de otra, subiendo un poco; se alcanzan de un salto
export function cloudPath(n, seed, rise) {
  const rnd = seededRandom(seed), out = [{ x: 0, y: 30, z: 0 }];
  let ang = 0;
  for (let i = 1; i < n; i++) {
    ang += (rnd() - 0.5) * 1.2;
    const d = 5.2 + rnd() * 0.8, p = out[i - 1];
    out.push({ x: p.x + Math.sin(ang) * d, y: p.y + rise, z: p.z + Math.cos(ang) * d });
  }
  return out;
}
export const CLOUD_SIZE = 3.4;

// ----- Verde lima: 20 árboles con círculos -----
// Una cuadrícula de 5 × 4 árboles, cada uno movido un poquito para que no se vea tan ordenado
function treeSpots() {
  const rnd = seededRandom(41), spots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) spots.push([(c - 2) * 10 + (rnd() - 0.5) * 4, 8 + r * 10 + (rnd() - 0.5) * 4]);
  return spots;
}
export const TREES = { spots: treeSpots(), circlesPerTree: 8, seed: 5 };
// Dónde está el limón (el círculo amarillo): cambia en cada partida
export function pickLemon(rnd = Math.random) {
  return { tree: Math.floor(rnd() * TREES.spots.length), slot: Math.floor(rnd() * TREES.circlesPerTree) };
}
export function treeCircles() {
  const rnd = seededRandom(TREES.seed), yellowTree = Math.floor(rnd() * TREES.spots.length), yellowSlot = Math.floor(rnd() * TREES.circlesPerTree);
  return TREES.spots.map((_, ti) => Array.from({ length: TREES.circlesPerTree }, (__, k) => ({
    yellow: ti === yellowTree && k === yellowSlot, theta: k / TREES.circlesPerTree * Math.PI * 2 + rnd() * 0.4, up: 0.2 + rnd() * 0.6,
  })));
}

// ----- Magenta: lluvia de meteoritos -----
export const METEORS = { radius: 14, wall: 13.4, warn: 1.2, every: 0.75, blast: 2.2, survive: 30 };

// Que nadie se salga de la zona de un minijuego. area: { r } (círculo) o { x0, x1, z0, z1 } (rectángulo), relativa al centro
export function clampToArea(x, z, area) {
  if (area.r !== undefined) {
    const d = Math.hypot(x, z);
    return d <= area.r ? { x, z } : { x: x / d * area.r, z: z / d * area.r };
  }
  return { x: Math.min(area.x1, Math.max(area.x0, x)), z: Math.min(area.z1, Math.max(area.z0, z)) };
}
export function meteorSpot(r1, r2) { const a = r1 * Math.PI * 2, d = Math.sqrt(r2) * (METEORS.radius - 1.5); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }

// ---------- Mundo al revés: tú eres el gigante y el bot es "el jugador" ----------
// El jugador pasea por tu mitad recogiendo monedas; si te acercas huye hacia monedas lejos de ti,
// y con unas monedas vuelve a su zona segura a comprar una mejora (corre un poco más).
// Tú lo atrapas con tu salto de gigante, que avanza mucho más que correr.
export const INVERTED = {
  id: 'inverted', bot: 'jugador', intro: 'Mundo al revés', name: 'Mundo al revés',
  goal: 'Eres el gigante: atrapa 10 veces al jugador (salta para alcanzarlo)', reward: { coins: 10, boxes: 10 }, trophy: 'diamante',
  half: 50, lineW: 3, catches: 10, catchDist: 2.6, giantR: 1.5, giantJump: 16, lunge: 1.7,
  botSpeed: 10, botMaxSpeed: 12.5, speedPerUpgrade: 0.5, coinsPerUpgrade: 3, coinCount: 8,
  fleeDist: 16, panicDist: 7, braveAfter: 6, shopTime: 2.5, shop: { x: 0, z: 38 }, home: { x: 0, z: 30 }, caughtPause: 2,
};
export const INVERTED_K = MINIGAMES.length;   // su "número de minijuego" (para minigameOrigin)
export const minigameDef = k => (k < MINIGAMES.length ? MINIGAMES[k] : k === ESCUELA_K ? ESCUELA : k === SANDBOX_K ? SANDBOX : INVERTED);
// Colores invertidos: cada canal de color pasa a 255 − valor (blanco ↔ negro, amarillo ↔ azul…)
export const invertColor = hex => 0xffffff ^ hex;
// A qué moneda corre el jugador: la que está cerca de él y lejos del gigante
export function fleeCoin(bot, giant, coins) {
  let best = -1, bestScore = -Infinity;
  coins.forEach((c, i) => {
    const score = Math.hypot(c.x - giant.x, c.z - giant.z) - 0.6 * Math.hypot(c.x - bot.x, c.z - bot.z);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}
// Velocidad del jugador después de comprar mejoras (con un tope)
export const botSpeedAfter = upgrades => Math.min(INVERTED.botMaxSpeed, INVERTED.botSpeed + upgrades * INVERTED.speedPerUpgrade);

// ---------- Modo Escuela: un salón con sillas, y cada silla es un modo ----------
// Se entra por el portal violeta (al lado del Mundo al Revés). Caminas por el salón;
// junto a una silla pulsas E para jugar su modo. Por ahora hay uno: "No mires abajo".
export const ESCUELA = {
  id: 'escuela', bot: 'profe', intro: 'Modo Escuela', name: 'Modo Escuela',
  goal: '', reward: {},   // sin cartel al entrar (lo explica el bot guía) · el premio lo da cada modo al ganarlo
};
export const ESCUELA_K = MINIGAMES.length + 1;   // su "número de minijuego" (el Mundo al Revés es MINIGAMES.length)

// ---------- 🕳️ El hoyo de la casa morada → la zona rara → el SANDBOX de The Guy ----------
// En la casa del bot morado (la casa 3), el tapete no es un tapete: ¡es un HOYO! Si te caes, llegas a una zona rara
// (colores y formas al azar). Ahí está el portal SANDBOX, donde tu bot "The Guy" aprende a jugar solito.
export const SANDBOX = { id: 'sandbox', bot: 'The Guy', intro: 'Zona rara', name: 'Sandbox', goal: '', reward: {} };
export const SANDBOX_K = MINIGAMES.length + 2;
export const HOYO = { casa: 3 };
// ¿Te caíste en el hoyo? (adentro del círculo del tapete de la casa morada, con los pies en el piso)
export function enElHoyo(x, z, y) {
  const h = VILLAGE.houses[HOYO.casa], r = VILLAGE_HOUSE.rug;
  return y < 0.5 && Math.hypot(x - h.x, z - (h.z + r.dz)) < r.r - 0.3;
}
// La zona rara: un piso de baldosas de colores y formas raras flotando, todo al azar (pero siempre igual con la misma semilla).
// Deja libre el medio (donde caes) y el camino a los dos portales: SANDBOX (adelante) y SALIDA (atrás)
export const ZONA_RARA = { mitad: 30, baldosa: 6, portalSandbox: { x: 0, z: 22 }, portalSalida: { x: 0, z: -22 }, formas: 70, seed: 77 };
export function zonaRara(seed = ZONA_RARA.seed) {
  const Z = ZONA_RARA, rnd = seededRandom(seed), color = () => Math.floor(rnd() * 0xffffff);
  const n = (2 * Z.mitad) / Z.baldosa, baldosas = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) baldosas.push({ x: -Z.mitad + Z.baldosa * (i + 0.5), z: -Z.mitad + Z.baldosa * (j + 0.5), color: color() });
  const tipos = ['caja', 'esfera', 'cono', 'toro', 'cilindro', 'piramide'], formas = [];
  const libre = (x, z) => Math.hypot(x, z) > 6 && Math.abs(x) > 4;   // el medio y el pasillo de los portales quedan libres
  while (formas.length < Z.formas) {
    const x = (rnd() * 2 - 1) * (Z.mitad - 2), z = (rnd() * 2 - 1) * (Z.mitad - 2);
    if (!libre(x, z)) continue;
    formas.push({ tipo: tipos[Math.floor(rnd() * tipos.length)], x, z, y: 0.5 + rnd() * 12, tam: 0.6 + rnd() * 2.6, color: color(), giro: rnd() * Math.PI * 2, gira: (rnd() * 2 - 1) * 1.5 });
  }
  return { baldosas, formas };
}

// El salón: 30 × 24 m, con el centro en el origen del minijuego. El pizarrón está al frente (z grande)
// y la puerta de SALIDA atrás (z chico). Mirando al pizarrón, la izquierda es x grande.
export const SALON = {
  ancho: 30, largo: 24, alto: 6,
  mesasX: [10.5, 3.5, -3.5, -10.5],   // de izquierda a derecha (mirando al pizarrón)
  filasZ: [4.5, -0.5, -5.5],          // de adelante hacia atrás
  sillaAtras: 1.5,                    // la silla está 1,5 m detrás de su mesa
  puerta: { x: 0, ancho: 2.4 },       // la salida, en la pared de atrás
  escritorio: { x0: -2, x1: 2, z0: 7.8, z1: 9.1 },   // el escritorio de la profe, adelante
  profe: { x: 0, z: 10.3 },           // su silla: entre el escritorio y el pizarrón, mirando hacia las mesas
};
// Las 12 sillas. La primera (adelante a la izquierda) es "No mires abajo", la segunda la "Carrera"; la última (atrás a la derecha,
// mirando el salón desde arriba con el pizarrón arriba) es "Escondidas"; las demás, próximamente
export const SILLA_CARRERA = 1, SILLA_SPLEEF = 2, SILLA_NAVE = 4;   // (la 4: segunda fila, a la izquierda)
export function salonSillas() {
  const out = [], modos = { 0: 'nomires', [SILLA_CARRERA]: 'carrera', [SILLA_SPLEEF]: 'spleef', 3: 'atrapadas', [SILLA_NAVE]: 'nave', 11: 'escondidas' };
  for (const z of SALON.filasZ) for (const x of SALON.mesasX) out.push({ x, z: z - SALON.sillaAtras, modo: modos[out.length] || null });
  return out;
}
// ¿Estás junto a la silla de la profe? (ahí se abre el modo profe)
export const cercaDeLaProfe = (x, z, cerca = 2) => Math.hypot(x - SALON.profe.x, z - SALON.profe.z) < cerca;
// ¿Junto a qué silla estás? (la más cercana a menos de `cerca` metros; -1 = ninguna)
export function sillaCercana(x, z, sillas, cerca = 2) {
  let mejor = -1, d = cerca;
  sillas.forEach((s, i) => { const di = Math.hypot(x - s.x, z - s.z); if (di < d) { d = di; mejor = i; } });
  return mejor;
}

// ---------- ⬇️ No mires abajo: una torre de 1000 m que solo sube, en 10 etapas ----------
// Con el salto normal (JUMP 12,5 y GRAV 30) subes unos 2,6 m: una plataforma normal sube como mucho 2,2 m.
// Cada 30 m hay un checkpoint verde. Arriba del todo, a 1000 m, la bandera dorada.
export const NO_MIRES = {
  id: 'nomires', nombre: '⬇️ No mires abajo', altura: 1000, cada: 30, premio: { coins: 100 },
  seed: 1000, radio: 12, inicioY: 1, grosor: 0.4,
  subeMax: 2.2,        // lo más que sube una plataforma normal (el salto llega a ~2,6 m)
  huecoMax: 2.6,       // el hueco más largo que hay que saltar (de borde a borde)
  separaMin: 0.3,      // dos plataformas nunca se tocan (si no, te golpeas la cabeza)
  lado: { checkpoint: 4, meta: 6, inicio: 6 },
};
// Las 10 etapas, de 100 m cada una. Cada una más difícil: plataformas más chicas (lado),
// huecos más largos (hueco), que suben más (sube) y más saltos lejanos que necesitan doble salto (lejos: la probabilidad). piezas: [tipo de pieza, cuántas veces sale (peso)]
// Los letreros de las etapas: van en la PRIMERA plataforma de cada etapa (en vez de un aviso en la pantalla)
export function letrerosEtapas(plats) {
  const out = [];
  plats.forEach((p, i) => { if (!out.some(q => q.etapa === p.etapa)) { const e = ETAPAS.find(x => x.n === p.etapa); out.push({ i, etapa: p.etapa, texto: `Etapa ${p.etapa}: ${e ? e.nombre : ''}`, x: p.x, y: p.y, z: p.z }); } });
  return out;
}
export const ETAPAS = [
  { n: 1, id: 'playa', nombre: 'Playa colorida', lejos: 0.02, lado: [3.2, 4], hueco: [0.4, 1], sube: [1.2, 1.7], piezas: [['arena', 3], ['balde', 1]] },
  { n: 2, id: 'bosque', nombre: 'Bosque puro', lejos: 0.04, lado: [2.8, 3.6], hueco: [0.6, 1.2], sube: [1.3, 1.8], piezas: [['pino', 5], ['descanso', 1]] },
  { n: 3, id: 'oceano', nombre: 'Océano', lejos: 0.08, lado: [2.6, 3.2], hueco: [0.7, 1.4], sube: [1.4, 1.9], piezas: [['delfin', 4], ['ballena', 1]] },
  { n: 4, id: 'teles', nombre: 'Televisores', lejos: 0.08, lado: [2.4, 3], hueco: [0.8, 1.5], sube: [1.4, 1.9], piezas: [['tele', 4], ['telePlana', 1]] },
  { n: 5, id: 'espacio', nombre: 'Espacio', lejos: 0.06, lado: [1.8, 4.5], hueco: [0.9, 1.4], sube: [1.5, 2], piezas: [['ovni', 3], ['ovniMueve', 1]] },
  { n: 6, id: 'dulces', nombre: 'Dulces', lejos: 0.14, lado: [2.2, 2.8], hueco: [1, 1.7], sube: [1.5, 2], piezas: [['galleta', 3], ['chocolate', 1]] },
  { n: 7, id: 'neon', nombre: 'Neón', lejos: 0.16, lado: [2, 2.6], hueco: [1, 1.6], sube: [1.5, 2], piezas: [['neon', 3], ['neonBarra', 1]] },
  { n: 8, id: 'trampolines', nombre: 'Trampolines', lejos: 0.3, lado: [2, 2.6], hueco: [0.8, 1.4], sube: [1.5, 2], piezas: [['tramp', 6], ['trampPalido', 2], ['colchon', 0.5]] },
  { n: 9, id: 'hielo', nombre: 'Hielo absoluto', lejos: 0.16, lado: [1.8, 2.4], hueco: [1.2, 2], sube: [1.6, 2.1], piezas: [['hielo', 5], ['tramp', 1]] },
  { n: 10, id: 'masacote', nombre: 'El final: un masacote', lejos: 0.22, lado: [1.6, 2.2], hueco: [1.3, 2.2], sube: [1.7, 2.2],
    piezas: [['arena', 1], ['pino', 1], ['delfin', 1], ['tele', 1], ['ovniMueve', 1], ['galleta', 1], ['neon', 1], ['tramp', 1], ['hielo', 1]] },
];
// ¿En qué etapa estás a esta altura? (0–100 m → 1, 100–200 m → 2 … 900–1000 m → 10)
export const etapaDe = y => ETAPAS[Math.min(ETAPAS.length - 1, Math.max(0, Math.floor(y / 100)))];

// Los trampolines: los normales te lanzan a 2 veces tu altura (4 m); los pálidos, a 3 veces (6 m)
export const ALTO_JUGADOR = 2;
export const TRAMPOLIN = { salto: 2 * ALTO_JUGADOR, saltoPalido: 3 * ALTO_JUGADOR };
// Desde un trampolín, la siguiente plataforma puede estar más arriba que con un salto normal (2,6 m), con margen:
// desde uno normal, de 2,4 a 3,4 m más arriba; desde uno pálido, de 4 a 5,2 m (¡sin él no se alcanza!)
export const subeDesdeTramp = salto => (salto > TRAMPOLIN.salto ? [4, 5.2] : [2.4, 3.4]);
// Los ovnis que se mueven: cuánto se corren (amp, en metros) y cada cuántos segundos van y vuelven (periodo)
export const OVNI = { amp: 1.2, periodo: [4, 6] };
// Dónde está un ovni que se mueve en el segundo t (desplazamiento desde su lugar)
export const ovniDesplazamiento = (mueve, t) => mueve.amp * Math.sin((t / mueve.periodo) * Math.PI * 2);
// Hielo: tu velocidad cambia de a poco (agarre chico = resbala más). En el piso normal cambia de golpe.
export const HIELO = { agarre: 2.2 };
export function deslizar(vel, quiere, dt, agarre) {
  const k = 1 - Math.exp(-agarre * dt);
  return { x: vel.x + (quiere.x - vel.x) * k, z: vel.z + (quiere.z - vel.z) * k };
}

const COLORES_PLAYA = [0xe8a5a0, 0xe9cf8a, 0xd98c6e, 0xa9d3c4, 0xe8b07f, 0xc9b5d6];   // arena pastel: rosada, amarilla, roja, turquesa…
const COLORES_NEON = [0x00f0ff, 0xff2bd6, 0xffe600, 0x39ff14];   // el color del borde que brilla
const COLORES_TRAMP = [0x1e6bff, 0xff3b3b, 0x2fd158, 0xff9f0a, 0xaf52de];
const COLORES_PALIDOS = [0xbcd6ff, 0xffc7c7, 0xc4f5d0, 0xffe2b8, 0xe6ccf5];   // los pálidos saltan más alto
// Cómo es cada pieza: su tamaño (ancho × largo), si está girada, si es redonda… r: números al azar, L: tamaño de la etapa
const azar = (r, [a, b]) => a + r() * (b - a);
const elegir = (r, lista) => lista[Math.floor(r() * lista.length)];
const PIEZAS = {
  arena: (r, L) => ({ ancho: L, largo: L, color: elegir(r, COLORES_PLAYA) }),
  balde: (r, L) => ({ ancho: L * 1.1, largo: L * 1.1, redonda: true, color: elegir(r, COLORES_PLAYA) }),
  pino: (r, L) => ({ ancho: L, largo: L, redonda: true }),
  descanso: () => ({ ancho: 5.5, largo: 5.5, descanso: true }),
  delfin: (r, L) => ({ ancho: 1.6, largo: L + 1, giro: r() * Math.PI, inclina: (r() - 0.5) * 0.16 }),
  ballena: r => ({ ancho: 3, largo: 8, giro: r() * Math.PI, inclina: (r() - 0.5) * 0.1, descanso: true }),
  tele: (r, L) => ({ ancho: L, largo: L, color: elegir(r, [0xd8cfc0, 0x8a8f96, 0x4a4f57]) }),
  telePlana: r => ({ ancho: 2.2, largo: 7, giro: r() * Math.PI, descanso: true }),
  ovni: (r, L) => ({ ancho: azar(r, [1.8, 4.5]), largo: azar(r, [1.8, 5.5]), redonda: true }),
  ovniMueve: (r, L) => ({ ancho: azar(r, [2, 3.5]), largo: azar(r, [2, 3.5]), redonda: true,
    mueve: { eje: r() < 0.5 ? 'x' : 'y', amp: OVNI.amp, periodo: azar(r, OVNI.periodo) } }),
  galleta: (r, L) => ({ ancho: L, largo: L, redonda: true }),
  chocolate: r => ({ ancho: 2, largo: 7, giro: r() * Math.PI, inclina: (r() - 0.5) * 0.12, descanso: true }),
  neon: (r, L) => ({ ancho: L, largo: L, color: elegir(r, COLORES_NEON) }),
  neonBarra: (r, L) => ({ ancho: 1.4, largo: 5, giro: r() * Math.PI, color: elegir(r, COLORES_NEON) }),   // una barra angosta y girada
  tramp: (r, L) => ({ ancho: L, largo: L, redonda: true, salto: TRAMPOLIN.salto, color: elegir(r, COLORES_TRAMP) }),
  trampPalido: (r, L) => ({ ancho: L, largo: L, redonda: true, salto: TRAMPOLIN.saltoPalido, color: elegir(r, COLORES_PALIDOS) }),
  colchon: (r, L) => ({ ancho: L + 0.6, largo: L + 0.6, color: elegir(r, COLORES_TRAMP) }),
  hielo: (r, L) => ({ ancho: L, largo: L, hielo: true }),
};
const esTramp = pieza => pieza === 'tramp' || pieza === 'trampPalido';

// ----- Geometría de rectángulos (vistos desde arriba): sirve para medir huecos y para no encimar plataformas -----
// Las 2 direcciones de los lados de una plataforma (girada `giro` radianes)
const ejesDe = p => { const g = p.giro || 0; return [[Math.cos(g), -Math.sin(g)], [Math.sin(g), Math.cos(g)]]; };   // [eje del ancho, eje del largo]
// Cuánto "sobresale" la plataforma desde su centro en la dirección u
function alcance(p, u) {
  const [ea, el] = ejesDe(p), extra = p.mueve && p.mueve.eje === 'x' ? p.mueve.amp * Math.abs(u[0]) : 0;
  return (p.ancho / 2) * Math.abs(u[0] * ea[0] + u[1] * ea[1]) + (p.largo / 2) * Math.abs(u[0] * el[0] + u[1] * el[1]) + extra;
}
// Hueco por la línea que une los centros (lo que saltas si vas derecho de una a la otra)
export function huecoEntre(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-9, u = [dx / d, dz / d];
  return d - alcance(a, u) - alcance(b, u);
}
// Separación segura (si es > 0, seguro que no se tocan): se revisan los 4 lados (teorema del eje separador)
export function separacion(a, b) {
  let mejor = -Infinity;
  for (const u of [...ejesDe(a), ...ejesDe(b)]) {
    const centro = Math.abs((b.x - a.x) * u[0] + (b.z - a.z) * u[1]);
    mejor = Math.max(mejor, centro - alcance(a, u) - alcance(b, u));
  }
  return mejor;
}
// Lo más que se puede subir desde la plataforma p (un trampolín te lanza mucho más alto)
export function subeMaxDesde(p) {
  if (p.salto) return subeDesdeTramp(p.salto)[1];
  return NO_MIRES.subeMax - (p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0);
}
// Lo más que hay que saltar de largo desde la plataforma p
export const huecoMaxDesde = p => (p.salto ? 1.6 : NO_MIRES.huecoMax);

// ----- Saltos: hasta dónde llegas (de largo) con un salto y con doble salto -----
// El jugador corre a 12 m/s, salta a 12,5 m/s y la gravedad es 30 (los mismos números del juego)
export const JUGADOR = { velocidad: 12, salto: 12.5, gravedad: 30 };
// Cuánto tiempo estás en el aire hasta volver a bajar a `sube` metros más arriba de donde saltaste
function tiempoSimple(sube) {
  const { salto: v, gravedad: g } = JUGADOR, d = v * v - 2 * g * sube;
  return d < 0 ? 0 : (v + Math.sqrt(d)) / g;
}
function tiempoDoble(sube) {   // el segundo salto, justo arriba del primero (lo que más lejos te lleva)
  const { salto: v, gravedad: g } = JUGADOR, arriba = (v * v) / (2 * g), d = v * v + 2 * g * (arriba - sube);
  return d < 0 ? 0 : v / g + (v + Math.sqrt(d)) / g;
}
// Lo más lejos que llegas (de borde a borde, sin perder ni un poquito): con un salto o con doble salto
export const alcanceSimple = sube => JUGADOR.velocidad * tiempoSimple(sube);
export const alcanceDoble = sube => JUGADOR.velocidad * tiempoDoble(sube);
// Los saltos lejanos: más largos de lo que alcanza un salto, pero bien por debajo de lo que alcanza el doble salto
export const LEJOS = { sobreSimple: 1.05, deDoble: 0.6, subeMax: 1.6 };
export const huecoLejos = sube => [alcanceSimple(sube) * LEJOS.sobreSimple, alcanceDoble(sube) * LEJOS.deDoble];

// ----- Doble salto (solo en la torre): en el aire puedes saltar UNA vez más -----
// Solo cuando vuelves a apretar (no por dejar el botón apretado), y solo con batería
export const DOBLE_SALTO = { max: 1 };
export const puedeDobleSalto = ({ enElPiso, saltosEnAire, apretoRecien, bateria }) =>
  !enElPiso && apretoRecien && saltosEnAire < DOBLE_SALTO.max && bateria > 0;

// Las cajas para chocar (relativas al centro). Las giradas se arman con varios cuadraditos a lo largo,
// porque el juego solo choca con cajas derechas.
export function cajasDe(p) {
  const g = p.giro || 0, c = Math.abs(Math.cos(g)), s = Math.abs(Math.sin(g));
  if (p.redonda) return [{ x: 0, z: 0, hw: p.ancho * 0.85 / 2, hd: p.largo * 0.85 / 2 }];
  if (s < 1e-6) return [{ x: 0, z: 0, hw: p.ancho / 2, hd: p.largo / 2 }];
  if (c < 1e-6) return [{ x: 0, z: 0, hw: p.largo / 2, hd: p.ancho / 2 }];
  const lado = Math.min(p.ancho, p.largo) / (c + s);   // un cuadradito que cabe dentro, aunque esté girado
  const largoEje = Math.max(p.ancho, p.largo) - Math.min(p.ancho, p.largo), n = Math.max(1, Math.ceil(largoEje / (lado * 0.7)) + 1);
  const [ea, el] = ejesDe(p), eje = p.largo >= p.ancho ? el : ea, out = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i / (n - 1) - 0.5) * largoEje;
    out.push({ x: eje[0] * k, z: eje[1] * k, hw: lado / 2, hd: lado / 2 });
  }
  return out;
}

// Las alturas que tocan: cada 30 m un checkpoint, y la meta a 1000 m
const proximaParada = y => Math.min(NO_MIRES.altura, (Math.floor(y / NO_MIRES.cada + 1e-9) + 1) * NO_MIRES.cada);

// Todas las plataformas de la torre: { x, y (arriba de la plataforma), z, ancho, largo, giro, tipo, pieza, etapa, … }
// tipo: 'inicio' · 'normal' · 'checkpoint' (cada 30 m) · 'meta' (a 1000 m). Dan vueltas en espiral alrededor del centro.
export function torreNoMires(seed = NO_MIRES.seed) {
  const N = NO_MIRES, rnd = seededRandom(seed);
  const plats = [{ x: N.radio, y: N.inicioY, z: 0, ancho: N.lado.inicio, largo: N.lado.inicio, giro: 0, tipo: 'inicio', pieza: 'inicio', etapa: 1 }];
  let ang = 0;
  while (plats[plats.length - 1].y < N.altura) {
    const prev = plats[plats.length - 1], parada = proximaParada(prev.y), falta = parada - prev.y;
    // 1. Cuánto sube
    const maxSube = subeMaxDesde(prev), etP = etapaDe(prev.y + 0.01);
    let sube, tipo = 'normal';
    if (falta <= maxSube) { sube = falta; tipo = parada === N.altura ? 'meta' : 'checkpoint'; }
    else {
      sube = prev.salto ? azar(rnd, subeDesdeTramp(prev.salto)) : azar(rnd, [Math.min(etP.sube[0], maxSube), Math.min(etP.sube[1], maxSube)]);
      if (falta - sube < 1) sube = falta - 1;   // que no quede un escalón chiquitito antes del checkpoint
    }
    let y = prev.y + sube;
    // 2. Qué pieza es (según la etapa de su altura)
    const et = etapaDe(y), L = azar(rnd, et.lado);
    let pieza;
    if (tipo !== 'normal') pieza = tipo;
    else {
      const total = et.piezas.reduce((s, [, w]) => s + w, 0); let k = rnd() * total;
      pieza = et.piezas.find(([, w]) => (k -= w) < 0)[0];   // al azar, según su peso
      // Un trampolín necesita espacio arriba antes del checkpoint; si no hay, va algo que no rebota
      if (pieza === 'trampPalido' && parada - y < subeDesdeTramp(TRAMPOLIN.saltoPalido)[0] + 1) pieza = 'tramp';
      if (pieza === 'tramp' && parada - y < subeDesdeTramp(TRAMPOLIN.salto)[0] + 1) pieza = et.piezas.find(([pz]) => !esTramp(pz))?.[0] || 'arena';
      // Un ovni que sube y baja no puede quedar muy alto (lo más alto que llega es y + amp)
    }
    const forma = tipo === 'normal' ? PIEZAS[pieza](rnd, L) : { ancho: N.lado[tipo], largo: N.lado[tipo] };
    if (forma.mueve && forma.mueve.eje === 'y' && prev.mueve && prev.mueve.eje === 'y') forma.mueve.eje = 'x';   // dos que suben y bajan seguidos, no
    if (forma.mueve && forma.mueve.eje === 'y' && y + forma.mueve.amp - prev.y > maxSube) {
      y = prev.y + Math.max(0.5, maxSube - forma.mueve.amp);
    }
    // ¿Un salto lejano? (de una plataforma quieta a otra quieta; desde un trampolín, nunca)
    const lejos = tipo === 'normal' && prev.tipo !== 'inicio' && !prev.salto && !prev.mueve && !forma.mueve && rnd() < et.lejos;
    if (lejos && y - prev.y > LEJOS.subeMax) y = prev.y + LEJOS.subeMax;   // los lejanos suben poquito
    const p = { y, giro: 0, inclina: 0, tipo, pieza, etapa: et.n, ...forma, lejos };
    // 3. Dónde va: avanzando por la espiral hasta que el hueco sea el que queremos
    let quiero = lejos ? azar(rnd, huecoLejos(y - prev.y)) : prev.salto ? azar(rnd, [0.8, 1.4]) : p.mueve || prev.mueve ? et.hueco[0] : azar(rnd, et.hueco);
    let paso = (quiero + (prev.ancho + p.ancho) / 2) / N.radio, radio = N.radio, primera = null, bien = false;
    for (let intento = 0; intento < 40 && !bien; intento++) {
      for (let k = 0; k < 8; k++) {   // ajustar el ángulo para que el hueco quede justo
        p.x = Math.cos(ang + paso) * radio; p.z = Math.sin(ang + paso) * radio;
        paso += (quiero - huecoEntre(prev, p)) / radio;
      }
      p.x = Math.cos(ang + paso) * radio; p.z = Math.sin(ang + paso) * radio;
      if (!primera) primera = { x: p.x, z: p.z, paso, giro: p.giro };
      if (!chocaCon(plats, p, lejos ? huecoLejos(y - prev.y)[1] : null)) { bien = true; break; }
      // Si choca con otra: la giramos, o la ponemos un poco más afuera o más adentro de la espiral
      if (p.giro) p.giro += 0.35;
      else radio = N.radio + (intento % 2 ? -1 : 1) * (1 + Math.floor(intento / 2) * 0.5);
    }
    if (!bien) { p.x = primera.x; p.z = primera.z; p.giro = primera.giro; paso = primera.paso; }   // si nada sirvió, el primer intento
    ang += paso;
    plats.push(p);
  }
  return plats;
}
// ¿La plataforma nueva queda encima de otra (muy cerca) o en el camino de un salto de trampolín?
function chocaCon(plats, p, huecoMax) {
  const n = plats.length, prev = plats[n - 1];
  for (let i = n - 1; i >= 0; i--) {
    const q = plats[i];
    if (p.y - q.y > TRAMPOLIN.saltoPalido + 4) break;   // las de mucho más abajo no molestan
    const margen = NO_MIRES.separaMin;   // (los ovnis que van de lado ya cuentan su recorrido en `alcance`)
    const cerca = p.y - q.y < 4.5 || (q.salto && p.y - q.y < q.salto + 4);   // muy cerca en altura, o en la columna de un trampolín
    if (cerca && separacion(q, p) < (i === n - 1 ? margen : margen + 0.5)) return true;
  }
  return huecoEntre(prev, p) > (huecoMax || huecoMaxDesde(prev) - (p.mueve || prev.mueve ? OVNI.amp : 0));
}

// Decoración que no se pisa (alrededor de la torre, por fuera): pelotas de playa, pinos inclinados, chupetines, planetas…
export function decoracionTorre(seed = NO_MIRES.seed + 1) {
  const rnd = seededRandom(seed), out = [];
  const tipos = { playa: 'pelota', bosque: 'pinoChueco', oceano: 'burbuja', dulces: 'chupetin', espacio: 'planeta', trampolines: 'trampAdorno' };
  for (const et of ETAPAS) {
    const tipo = tipos[et.id]; if (!tipo) continue;
    const cuantos = tipo === 'pinoChueco' ? 40 : tipo === 'planeta' ? 6 : 16;
    for (let i = 0; i < cuantos; i++) {
      const a = rnd() * Math.PI * 2, d = NO_MIRES.radio + 7 + rnd() * (tipo === 'planeta' ? 40 : 14);
      out.push({ tipo, x: Math.cos(a) * d, z: Math.sin(a) * d, y: (et.n - 1) * 100 + rnd() * 100, tam: 0.6 + rnd() * 1.2, inclina: tipo === 'pinoChueco' && rnd() < 0.6 ? (rnd() - 0.5) * 0.7 : 0, giro: rnd() * Math.PI * 2 });
    }
  }
  return out;
}
// ¿Te caíste al vacío? Solo si llegas al piso de abajo de la torre (la plataforma de inicio está a 1 m, no cuenta).
// Si caes en una plataforma más abajo, no pasa nada: sigues desde ahí (y tu checkpoint no baja).
// ---------- 🚶 Caminar, pasos, salto y el láser en la Escuela ----------
// El rebote al caminar (el tuyo y el de los bots): sube y baja 8 cm al ritmo de los pasos; quieto (o en el aire), nada
export const reboteCaminar = (fase, camina) => (camina ? Math.abs(Math.sin(fase)) * 0.08 : 0);
// ¿Está caminando? Si se movió más de 1 m/s por el piso. (Más de 40 m/s no es caminar: es un portal o un empujón)
export const estaCaminando = (vel, enPiso) => enPiso && vel > 1 && vel < 40;
// Qué tan fuerte suenan tus pasos: en tu mundo, más fuerte (es pasto y estás tranquilo); en los modos, más bajito
export const volumenPasos = enMundo => (enMundo ? 0.8 : 0.35);
// El aviso de "no dispares en la Escuela": como mucho uno cada 3 segundos (para que no llene la pantalla)
export const AVISO_LASER = { texto: '¿Qué estás intentando? Tienes que jugar, no aturdir a todos', cadaMs: 3000 };
export const puedeAvisar = (ultimo, ahora, cadaMs = AVISO_LASER.cadaMs) => ultimo === null || ahora - ultimo >= cadaMs;
export const debeReaparecer = (y, enElPiso) => (enElPiso && y < 0.5) || y < -1;

// ----- La batería: moverte y saltar la gastan; responder bien la carga -----
export const BATERIA = { porSegundo: 50, porSalto: 50, porRespuesta: 2000 };
// Lo que queda después de un ratito dt (caminando o no, saltando o no). Nunca baja de 0.
export function gastarBateria(bateria, dt, caminando, salto) {
  const gasto = (caminando ? BATERIA.porSegundo * dt : 0) + (salto ? BATERIA.porSalto : 0);
  return Math.max(0, bateria - gasto);
}
// cuanto: lo que da una respuesta buena (2.000; en la Carrera 4.000 y en el Spleef 3.000)
export const cargarBateria = (bateria, correcta, cuanto = BATERIA.porRespuesta) => (correcta ? bateria + cuanto : bateria);
export const hayBateria = bateria => bateria > 0;

// Banco de preguntas. La primera opción de `op` es SIEMPRE la correcta: al mostrarla se mezclan.
export const ESCUELA_PREGUNTAS = [
  // Matemáticas
  { p: '¿Cuánto es 7 + 8?', op: ['15', '14', '16', '13'] },
  { p: '¿Cuánto es 25 + 17?', op: ['42', '32', '43', '52'] },
  { p: '¿Cuánto es 50 − 18?', op: ['32', '38', '42', '28'] },
  { p: '¿Cuánto es 100 − 37?', op: ['63', '73', '67', '53'] },
  { p: '¿Cuánto es 6 × 7?', op: ['42', '36', '48', '49'] },
  { p: '¿Cuánto es 8 × 9?', op: ['72', '64', '81', '63'] },
  { p: '¿Cuánto es 12 × 3?', op: ['36', '34', '32', '39'] },
  { p: '¿Cuánto es 4 × 25?', op: ['100', '75', '125', '90'] },
  { p: '¿Cuánto es 144 ÷ 12?', op: ['12', '11', '14', '10'] },
  { p: '¿Cuál es el doble de 35?', op: ['70', '65', '75', '60'] },
  { p: '¿Cuál es el doble de 125?', op: ['250', '225', '205', '260'] },
  { p: '¿Cuál es la mitad de 64?', op: ['32', '30', '34', '28'] },
  { p: '¿Cuál es la mitad de 150?', op: ['75', '70', '50', '85'] },
  { p: '¿Cuál es el doble de la mitad de 40?', op: ['40', '20', '80', '10'] },
  // Scratch
  { p: 'En Scratch, ¿qué bloque repite algo sin parar?', op: ['por siempre', 'repetir 10', 'esperar 1 segundos', 'detener todos'] },
  { p: 'En Scratch, ¿qué bloque empieza el programa con la bandera verde?', op: ['al hacer clic en la bandera verde', 'al presionar tecla espacio', 'al recibir mensaje1', 'cuando este objeto sea clicado'] },
  { p: 'En Scratch, ¿qué hace "mover 10 pasos"?', op: ['Avanza hacia donde mira', 'Gira 10 grados', 'Espera 10 segundos', 'Sube 10 en y'] },
  { p: 'En Scratch, ¿qué bloque hace algo solo si se cumple una condición?', op: ['si … entonces', 'por siempre', 'decir ¡Hola!', 'mostrar'] },
  { p: 'En Scratch, "cambiar x en 10" mueve el objeto hacia…', op: ['la derecha', 'la izquierda', 'arriba', 'abajo'] },
  { p: 'En Scratch, ¿para qué sirve una variable?', op: ['Para guardar un dato, como los puntos', 'Para cambiar el disfraz', 'Para tocar un sonido', 'Para borrar el objeto'] },
  { p: 'En Scratch, ¿qué bloque avisa a los otros objetos?', op: ['enviar mensaje1', 'pensar Hmm…', 'siguiente disfraz', 'esconder'] },
  { p: 'En Scratch, ¿qué hace "siguiente disfraz"?', op: ['Cambia cómo se ve el objeto', 'Lo mueve 10 pasos', 'Lo esconde', 'Detiene el programa'] },
  { p: 'En Scratch, ¿dónde está x: 0, y: 0?', op: ['En el centro del escenario', 'Arriba a la izquierda', 'Abajo a la derecha', 'Fuera del escenario'] },
  // Rectángulo Verde
  { p: '¿Qué pasa si el gigante te atrapa?', op: ['Mueres y vuelves al inicio', 'Ganas monedas', 'Te vuelves gigante', 'No pasa nada'] },
  { p: '¿Qué NO puede cruzar el gigante rojo?', op: ['La línea amarilla', 'El trampolín', 'El pueblo', 'La fábrica'] },
  { p: '¿Qué hace el gigante de noche?', op: ['Duerme', 'Baila', 'Corre más rápido', 'Se va a la fábrica'] },
  { p: '¿Con qué tecla abres la tienda?', op: ['P', 'E', 'V', 'F'] },
  { p: '¿Qué tecla cambia a primera persona?', op: ['V', 'P', 'E', 'Espacio'] },
  { p: '¿Cuántas monedas da una bolsa de la cinta?', op: [`${BAG_VALUE}`, '1', '5', '100'] },
  { p: '¿Qué hace el trampolín azul?', op: ['Te lanza 100 m hacia arriba', 'Te hace gigante', 'Te da monedas', 'Te lleva al pueblo'] },
  { p: 'En el Mundo al Revés, ¿quién eres?', op: ['El gigante', 'El bot amarillo', 'La flor rosada', 'Una nube'] },
];
// La siguiente pregunta, al azar, pero nunca la misma que acaba de salir (anterior = -1 si es la primera)
export function escuelaSiguiente(anterior, rnd = Math.random, total = ESCUELA_PREGUNTAS.length) {
  if (anterior < 0 || total < 2) return Math.floor(rnd() * total);   // la primera: cualquiera
  const i = Math.floor(rnd() * (total - 1));   // elige entre todas menos una…
  return i >= anterior ? i + 1 : i;            // …y se salta la anterior
}
// Las preguntas del profe vienen como { p, r: [4 respuestas], ok: cuál es la correcta }.
// Las pasamos al formato del banco: la correcta primero (después se mezclan igual que las normales).
export const deLaProfe = q => ({ p: q.p, op: [q.r[q.ok], ...q.r.filter((_, i) => i !== q.ok)] });
// Las preguntas que se usan en la torre: las del profe si hay; si no, las normales
export const preguntasDeLaClase = lista => (Array.isArray(lista) && lista.length ? lista.map(deLaProfe) : ESCUELA_PREGUNTAS);
// Para mostrar texto que escribió alguien sin que el navegador lo tome como HTML (por ejemplo "<img …>")
export const escaparHTML = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Mezcla las opciones de una pregunta. Devuelve { opciones, correcta } (correcta = en qué lugar quedó la buena)
export function escuelaMezclar(pregunta, rnd = Math.random) {
  const idx = pregunta.op.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { opciones: idx.map(i => pregunta.op[i]), correcta: idx.indexOf(0) };
}

// ---------- Misiones del pueblo: cada día, cada bot grande necesita ayuda con algo ----------
// fetch: traer UNA cosa (la llevas encima; si el gigante te atrapa, se te cae) · collect: juntar varias cosas
// where: 'giant' = en la mitad del gigante (más peligroso, mejor premio) · 'mine' = en tu mitad
export const TASKS = [
  { id: 'rock', kind: 'fetch', item: 'rock', name: 'la roca mascota', ask: '¡Mi roca mascota se perdió en la mitad del gigante! ¿Me la traes?', where: 'giant', reward: { coins: 30 } },
  { id: 'ball', kind: 'fetch', item: 'ball', name: 'la pelota', ask: 'Pateé mi pelota muy fuerte y cayó del otro lado de la línea… ¿me la traes?', where: 'giant', reward: { coins: 25 } },
  { id: 'teddy', kind: 'fetch', item: 'teddy', name: 'el osito', ask: 'No puedo dormir sin mi osito… ¡y el gigante se lo llevó a su mitad!', where: 'giant', reward: { coins: 30 } },
  { id: 'key', kind: 'fetch', item: 'key', name: 'la llave dorada', ask: 'Perdí la llave de mi casa paseando por el pueblo. ¿Me ayudas a buscarla?', where: 'mine', reward: { coins: 15 } },
  { id: 'apples', kind: 'collect', item: 'apple', count: 5, name: 'manzanas', ask: 'Se me rompió la canasta y se me cayeron 5 manzanas por el pueblo. ¿Me ayudas a juntarlas?', where: 'mine', reward: { coins: 20 } },
  { id: 'planks', kind: 'collect', item: 'plank', count: 4, name: 'tablas', ask: '¡El viento se llevó el techo de mi casa! Necesito 4 tablas para arreglarlo.', where: 'mine', reward: { boxes: 2 } },
  { id: 'flowers', kind: 'collect', item: 'flower', count: 6, name: 'flores', ask: 'Hoy es el cumpleaños de mi mamá. ¿Me juntas 6 flores para un ramo?', where: 'mine', reward: { coins: 20 } },
  { id: 'gems', kind: 'collect', item: 'gem', count: 3, name: 'gemas', ask: 'Se me escaparon 3 gemas de mi colección… ¡y cayeron en la mitad del gigante!', where: 'giant', reward: { boxes: 3 } },
];
// Qué misión tiene cada uno de los 10 bots grandes ese día (cambia cada día; nunca dos bots seguidos con la misma)
export function tasksForDay(day) {
  const rnd = seededRandom(day * 97 + 13), out = [];
  for (let i = 0; i < VILLAGE.houses.length; i++) {
    let k; do k = Math.floor(rnd() * TASKS.length); while (i > 0 && TASKS[k].id === out[i - 1].id);
    out.push(TASKS[k]);
  }
  return out;
}
// Dónde aparece una cosa perdida: en la mitad del gigante o en tu mitad (nunca dentro de una casa)
export function taskSpot(where, rnd) {
  if (where === 'giant') return { x: (rnd() * 2 - 1) * 80, z: -10 - rnd() * 75 };
  return randomBotTarget(rnd);
}
// ¿Ya está lista la misión para entregar?
export const taskReady = (task, got) => (task.kind === 'fetch' ? got >= 1 : got >= task.count);

// ---------- Estirar y aplastar al saltar (como en los dibujos animados) ----------
// En el aire el personaje se estira un poquito (más mientras más rápido sube o cae);
// al caer al piso se aplasta un instante y vuelve a la normalidad. Lo de ancho cambia al revés,
// para que parezca de goma y no "crezca": si se estira hacia arriba, se adelgaza.
export const SQUASH = { stretchPerSpeed: 0.012, maxStretch: 0.16, landSquash: 0.2, landTime: 0.18 };
export function squashStretch(vy, airborne, landT) {
  let tall = 1;
  if (airborne) tall = 1 + Math.min(SQUASH.maxStretch, Math.abs(vy) * SQUASH.stretchPerSpeed);
  else if (landT < SQUASH.landTime) tall = 1 - SQUASH.landSquash * (1 - landT / SQUASH.landTime);
  return { tall, wide: 1 / Math.sqrt(tall) };
}

// ---------- Logros: trofeos en la mesa larga del sótano ----------
// No se anuncian: el trofeo aparece calladito en la mesa. Si te acercas y pulsas E, sale su nombre y descripción.
// where: 'table' = en la mesa del sótano · 'wardrobe' = el de diamante, que sigue sobre el armario
export const ACHIEVEMENTS = [
  { id: 'gracias', name: '¡Muchas gracias!', desc: 'Obtuviste este logro ayudando a un bot', model: 'bot', where: 'table' },
  { id: 'ahorros', name: 'Pequeños ahorros', desc: 'Conseguiste 15 monedas', model: 'piggy', where: 'table' },
  { id: 'billete', name: 'Soy un billete', desc: 'Ganaste 1.000 monedas', model: 'bags', where: 'table' },
  { id: 'compra', name: 'Compra exitosa', desc: 'Compraste algo por primera vez', model: 'shop', where: 'table' },
  { id: 'diamante', name: '!etsanaG¡', desc: 'Ganaste en el Mundo al Revés', model: 'diamond', where: 'wardrobe' },
  { id: 'boing', name: 'Boing boing', desc: 'Saltaste por primera vez en el trampolín', model: 'trampoline', where: 'table' },
];
export const achievementById = id => ACHIEVEMENTS.find(a => a.id === id) || null;
// Los logros de monedas: cuántas tienes que tener juntas (la primera vez que llegas)
export const COIN_ACHIEVEMENTS = [{ id: 'ahorros', coins: 15 }, { id: 'billete', coins: 1000 }];
export const coinAchievementsFor = coins => COIN_ACHIEVEMENTS.filter(a => coins >= a.coins).map(a => a.id);
// La mesa: pegada a la pared izquierda del sótano, casi de punta a punta (la escalera y el botón rojo quedan al otro lado)
export const TROPHY_TABLE = { x0: 20, x1: 21.4, z0: 5, z1: 17, top: 1 };
// Cada trofeo de la mesa tiene su lugar fijo (en el orden de la lista), repartidos a lo largo de la mesa
export function trophySpot(id) {
  const onTable = ACHIEVEMENTS.filter(a => a.where === 'table'), i = onTable.findIndex(a => a.id === id);
  if (i < 0) return null;
  const T = TROPHY_TABLE, step = (T.z1 - T.z0) / onTable.length;
  return { x: (T.x0 + T.x1) / 2, z: T.z0 + step * (i + 0.5) };
}

// ---------- 🙈 Escondidas: terrenos gigantes (la segunda silla del Modo Escuela) ----------
// Todo está construido 50 veces más grande que en la vida real; tú sigues de tu tamaño, como una hormiga.
// Las medidas de abajo ya están en metros del juego (una mesa de 72 cm de verdad mide 36 m aquí).
export const ESCALA = 50;
// Cada pieza: { t: tipo, x, z (el centro), a (ancho, en x), l (largo, en z), h (alto), y (dónde empieza, 0 = el piso), ... }
// Tipos: 'bloque' (sólido) · 'mesa' (tabla con 4 patas) · 'silla' (asiento, patas y respaldo) · 'cueva' (una caja con
// lados abiertos: abierta = 'n' +z, 's' −z, 'e' +x, 'o' −x) · 'cama' · 'canasta' (sin techo, con escalera de mano)
// · 'trampolin' · 'esfera' (choca como una caja) · 'decor' (solo se ve). estilo: cómo se dibuja.
const PIEZAS_SALON = [
  ...[-90, 0, 90].flatMap(x => [-35, 35].flatMap(z => [
    { t: 'mesa', x, z, a: 30, l: 22, h: 36, estilo: 'pupitre' },
    { t: 'silla', x, z: z - 22, a: 19, l: 19, h: 40, respaldo: 's', estilo: 'silla' },
  ])),
  { t: 'cueva', x: 0, z: 92, a: 60, l: 30, h: 37, abierta: 'n', estilo: 'escritorio' },            // el escritorio de la profe: debajo, un escondite
  { t: 'cueva', x: -125, z: -60, a: 22, l: 30, h: 12, abierta: 'e', estilo: 'mochila', color: 0x2f7de1 },   // mochila tirada (abierta)
  { t: 'cueva', x: 125, z: 5, a: 22, l: 30, h: 12, abierta: 'o', estilo: 'mochila', color: 0xe0475f },
  { t: 'cueva', x: 45, z: -85, a: 12, l: 5, h: 3.2, abierta: 'eo', estilo: 'estuche', color: 0x8e5bd9 },    // un estuche: un túnel
  { t: 'cueva', x: 125, z: 95, a: 15, l: 18, h: 15, abierta: 's', estilo: 'basurero', color: 0x7a8794 },    // el basurero, volcado
  { t: 'cueva', x: -45, z: -95, a: 20, l: 14, h: 8, abierta: 'eo', estilo: 'libroAbierto', color: 0x2fae4e }, // libro abierto boca abajo
  { t: 'cueva', x: -125, z: 85, a: 26, l: 26, h: 22, abierta: 'e', estilo: 'carton' },                      // caja de cartón
  { t: 'bloque', x: -55, z: 0, a: 12, l: 17, h: 9, estilo: 'libros' },                                       // pila de libros
  { t: 'bloque', x: 100, z: -100, a: 12, l: 9, h: 10, estilo: 'lonchera', color: 0xffc83d },
  { t: 'decor', x: 20, z: -55, a: 9, l: 0.4, h: 0.4, estilo: 'lapiz', color: 0xffc400 },
  { t: 'decor', x: -20, z: 60, a: 0.4, l: 9, h: 0.4, estilo: 'lapiz', color: 0x2f7de1 },
  { t: 'decor', x: -85, z: 60, a: 15, l: 1.6, h: 0.15, estilo: 'regla' },
  { t: 'decor', x: 0, z: 119, a: 150, l: 1, h: 60, y: 45, estilo: 'pizarron' },
  // Trampolines tirados en el piso: te lanzan arriba de una mesa, de una silla o del escritorio de la profe
  { t: 'trampolin', x: -69, z: -35, a: 8, l: 8, h: 2, salto: 40, color: 0xe0475f },   // → la mesa de la izquierda
  { t: 'trampolin', x: 16, z: 13, a: 8, l: 8, h: 2, salto: 24, color: 0xffc400 },     // → el asiento de una silla
  { t: 'trampolin', x: 35, z: 92, a: 8, l: 8, h: 2, salto: 41, color: 0x2fae4e },     // → el escritorio de la profe
  { t: 'trampolin', x: 90, z: 51, a: 8, l: 8, h: 2, salto: 40, color: 0x8e5bd9 },     // → la mesa de la derecha
  // ⚡ Súper trampolín (brilla): te lanza altísimo… y caes arriba del escritorio de la profe
  { t: 'trampolin', x: -38, z: 92, a: 8, l: 8, h: 2, salto: 70, super: true },
];
const PIEZAS_HABITACION = [
  { t: 'cama', x: 77.5, z: 62.5, a: 45, l: 95, h: 27.5 },
  { t: 'trampolin', x: 42, z: 45, a: 12, l: 12, h: 2, salto: 36 },                                   // ¡te lanza arriba de la cama!
  { t: 'canasta', x: -70, z: 80, a: 18, l: 18, h: 14, escalera: 's', color: 0xd9a066 },
  { t: 'canasta', x: -82, z: -82, a: 16, l: 16, h: 12, escalera: 'e', color: 0xc98a5a },
  { t: 'cueva', x: 60, z: -80, a: 30, l: 22, h: 20, abierta: 'o', estilo: 'juguetes', color: 0xe0475f },    // caja de juguetes
  { t: 'cueva', x: -30, z: 95, a: 7, l: 13, h: 5, abierta: 's', estilo: 'zapato', color: 0x3d6f96 },        // un zapato
  { t: 'bloque', x: 18, z: 92, a: 9, l: 9, h: 9, estilo: 'cubo', color: 0xff6fa8 },
  { t: 'bloque', x: 29, z: 95, a: 9, l: 9, h: 9, estilo: 'cubo', color: 0x4dd6c8 },
  { t: 'bloque', x: 23, z: 93, a: 9, l: 9, h: 9, y: 9, estilo: 'cubo', color: 0xffd23f },
  { t: 'esfera', x: -88, z: 20, a: 14, l: 14, h: 14, estilo: 'pelota', color: 0xff4b3e },
  { t: 'bloque', x: 85, z: -30, a: 12, l: 16, h: 3, estilo: 'libros' },
  { t: 'decor', x: -10, z: -20, a: 110, l: 95, h: 0.2, estilo: 'alfombra' },
  // 🦖 Un dinosaurio de peluche (35 % del tamaño del oso), echado DEBAJO de la cama, tapado por la cobija. Es sólido:
  // al lado queda espacio para meterte en la cueva de la cobija (entras agachado por debajo, que cuelga hasta 3 m del piso)
  { t: 'bloque', x: 88, z: 40, a: 9, l: 15, h: 8, estilo: 'dino', color: 0x5cc85c, debajoCama: true },
  // ⚡ Súper trampolín: ¡arriba de la cabecera de la cama!
  { t: 'trampolin', x: 45, z: 105, a: 8, l: 8, h: 2, salto: 70, super: true },
];
const PIEZAS_COCINA = [
  { t: 'mesa', x: 0, z: 10, a: 60, l: 40, h: 38, estilo: 'mesaCocina' },
  ...[[-18, -22, 's'], [18, -22, 's'], [-18, 42, 'n'], [18, 42, 'n']].map(([x, z, respaldo]) => ({ t: 'silla', x, z, a: 20, l: 20, h: 45, respaldo, estilo: 'silla' })),
  { t: 'bloque', x: 100, z: 80, a: 35, l: 35, h: 90, estilo: 'refri' },
  { t: 'bloque', x: -65, z: 85, a: 70, l: 30, h: 45, estilo: 'gabinete' },
  { t: 'cueva', x: -15, z: 85, a: 30, l: 30, h: 45, abierta: 's', estilo: 'gabineteAbierto' },             // un mueble con la puerta abierta
  { t: 'bloque', x: 45, z: 85, a: 40, l: 30, h: 45, estilo: 'gabinete' },
  { t: 'cueva', x: -80, z: -40, a: 15, l: 10, h: 3.5, abierta: 'e', estilo: 'cereal', color: 0xffb000 },    // caja de cereal volcada
  { t: 'cueva', x: 60, z: -50, a: 5, l: 6, h: 4, abierta: 's', estilo: 'taza', color: 0xe8eef2 },           // una taza caída
  { t: 'bloque', x: -100, z: -80, a: 15, l: 15, h: 15, estilo: 'balde', color: 0x2f7de1 },
  { t: 'bloque', x: 100, z: -70, a: 10, l: 10, h: 3.5, estilo: 'tazon', color: 0xff8fc8 },
  { t: 'esfera', x: 30, z: -80, a: 4, l: 4, h: 4, estilo: 'manzana', color: 0xd4161b },
  { t: 'esfera', x: 38, z: -76, a: 4, l: 4, h: 4, estilo: 'manzana', color: 0x7cc242 },
  // Terrones de azúcar para subirte arriba de las manzanas (la manzana mide 4 m y tu salto llega a 2,6 m)
  { t: 'bloque', x: 24.5, z: -80, a: 3, l: 3, h: 2, estilo: 'azucar' },
  { t: 'bloque', x: 43.5, z: -74, a: 3, l: 3, h: 2, estilo: 'azucar' },
  { t: 'decor', x: -40, z: -60, a: 10, l: 2.4, h: 2, estilo: 'platano' },
  { t: 'decor', x: 0, z: -40, a: 120, l: 70, h: 0.2, estilo: 'tapete' },
  // Para subir a lo alto (tu salto llega a 2,6 m): el trampolín AMARILLO al refri y frutas que en verdad son trampolines
  { t: 'trampolin', x: 75, z: 60, a: 10, l: 10, h: 2, salto: 93, color: 0xffd60a },   // → arriba del refri (90 m)
  { t: 'trampolin', x: -38, z: 10, a: 8, l: 8, h: 2, salto: 41, estilo: 'naranja' },   // una naranja → la mesa (38 m)
  ...[[-18, -38], [18, -38], [-18, 58], [18, 58]].map(([x, z]) => ({ t: 'trampolin', x, z, a: 6, l: 6, h: 2, salto: 25, estilo: 'limon' })),   // limones → los asientos de las sillas
  { t: 'trampolin', x: -65, z: 62, a: 8, l: 8, h: 2, salto: 48, estilo: 'sandia' },    // una tajada de sandía → el mueble de la izquierda (y el abierto)
  { t: 'trampolin', x: 45, z: 62, a: 8, l: 8, h: 2, salto: 48, estilo: 'naranja' },    // otra naranja → el mueble de la derecha
  { t: 'trampolin', x: -100, z: -63, a: 6, l: 6, h: 2, salto: 18, estilo: 'limon' },   // un limón → el balde
  // ⚡ Súper trampolín: el salto más alto de todos (cae arriba de los muebles)
  { t: 'trampolin', x: -108, z: 85, a: 8, l: 8, h: 2, salto: 110, super: true },
];
// Los 3 terrenos. spawn: dónde empiezan (el buscador en el centro, los demás alrededor).
// escondites extra: lugares buenos que no son cuevas (alto: solo se llega trepando; el bot no busca ahí)
export const TERRENOS = [
  { id: 'salon', nombre: 'Salón gigante', emoji: '🏫', ancho: 300, largo: 240, alto: 130, spawn: { x: 0, z: -10 }, piezas: PIEZAS_SALON,
    descripcion: 'Mesas, sillas, mochilas, libros y un basurero… ¡todo gigante!', extra: [] },
  { id: 'habitacion', nombre: 'Habitación', emoji: '🧸', ancho: 200, largo: 230, alto: 130, spawn: { x: -20, z: 45 }, piezas: PIEZAS_HABITACION,
    descripcion: 'Carros que se mueven, canastas con escaleras y un trampolín hasta la cama.',
    extra: [{ x: 77, z: 40 }, { x: 88, z: 95 }, { x: 70, z: 100, y: 27.5, alto: true }, { x: -70, z: 76, alto: true }] },
  { id: 'cocina', nombre: 'Cocina gigante', emoji: '🍳', ancho: 250, largo: 200, alto: 130, spawn: { x: 0, z: -45 }, piezas: PIEZAS_COCINA,
    descripcion: 'Un refri enorme (con su trampolín amarillo), frutas que rebotan, una taza caída y muebles abiertos.',
    extra: [{ x: -100, z: -93 }, { x: 118, z: 55 }] },
];
// Los carros de juguete de la habitación: andan RÁPIDO por toda la habitación, siempre por el mismo circuito
// (unos puntos por el espacio libre, sin pasar por la cama, las canastas ni la caja de juguetes). Dónde está cada uno
// depende solo del reloj de la ronda: así todos los jugadores los ven en el mismo lugar.
export const CIRCUITO = [[-45, -103], [30, -103], [30, -55], [65, -55], [65, 0], [20, 0], [20, 70], [-40, 70], [-40, 30], [-45, -40]];
export const CARRO = { largo: 15, ancho: 8, cubierta: 1, cabina: 6, vel: 15, cabinaLargo: 6 };   // la cubierta a 1 m: te subes de un saltito
// Los 3 son distintos: un carro de carreras (bajito), una camioneta (con su caja atrás) y un bus (alto, con un escalón atrás)
export const CARROS = [
  { color: 0xe0475f, tipo: 'carrera', largo: 15, ancho: 7, cubierta: 1, cabina: 3.5, cabinaLargo: 5 },
  { color: 0x2f7de1, tipo: 'camioneta', largo: 15, ancho: 8, cubierta: 1.8, cabina: 7, cabinaLargo: 6 },
  { color: 0x2fae4e, tipo: 'bus', largo: 15, ancho: 8, cubierta: 1, cabina: 9, cabinaLargo: 11 },
];
// Un recorrido que da vueltas: dónde está algo que va a "vel" por esos puntos en el segundo t (desfase: 0 a 1 de la vuelta)
const tramosDe = puntos => puntos.map((p, i) => { const q = puntos[(i + 1) % puntos.length]; return { p, q, largo: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
export function posEnRuta(puntos, vel, t, desfase = 0) {
  const T = tramosDe(puntos), L = T.reduce((s, q) => s + q.largo, 0);
  let d = (((vel * t + desfase * L) % L) + L) % L;
  for (const { p, q, largo } of T) {
    if (d <= largo) { const k = d / largo; return { x: p[0] + (q[0] - p[0]) * k, z: p[1] + (q[1] - p[1]) * k, giro: Math.atan2(q[0] - p[0], q[1] - p[1]) }; }
    d -= largo;
  }
  const p = T[0].p; return { x: p[0], z: p[1], giro: 0 };
}
export const largoCircuito = () => tramosDe(CIRCUITO).reduce((s, t) => s + t.largo, 0);
// Dónde está el carro i en el segundo t, y hacia dónde mira (giro: 0 = hacia +z)
export const carroPos = (i, t) => posEnRuta(CIRCUITO, CARRO.vel, t, i / CARROS.length);
// Las partes de una cosa que anda (relativas a su centro), según hacia dónde mira: una caja a lo largo, entre "desde" y "hasta"
function parteGirada(giro, desde, hasta, ancho, top) {
  const dx = Math.sin(giro), dz = Math.cos(giro), largo = hasta - desde, centro = (desde + hasta) / 2;
  return { x: dx * centro, z: dz * centro, hw: Math.abs(dx) * largo / 2 + Math.abs(dz) * ancho / 2, hd: Math.abs(dz) * largo / 2 + Math.abs(dx) * ancho / 2, top };
}
// 🐢 Tortugas de cuerda: caminan despacito (siempre igual según el reloj). Te subes por la COLA (un escalón) y de ahí al caparazón,
// y te llevan encima como los carros
export const TORTUGA = { vel: 2.5, largo: 11, ancho: 8, caparazon: 4, cola: 1.8, colaLargo: 3, cabeza: 3, cabezaLargo: 3 };
export const TORTUGAS = [
  { color: 0x3e9b4f, ruta: [[-90, -55], [-62, -55], [-62, -15], [-90, -15]] },   // (lejos del camino de los carros y de los muebles)
  { color: 0x2f8f8f, ruta: [[78, -60], [88, -60], [88, -50], [78, -50]] },
  { color: 0x8a6d3b, ruta: [[-75, 36], [-55, 36], [-55, 45], [-75, 45]] },
];
export const tortugaPos = (i, t) => posEnRuta(TORTUGAS[i].ruta, TORTUGA.vel, t, 0);
export function partesTortuga(giro) {
  const T = TORTUGA, L = T.largo / 2;
  return {
    cola: parteGirada(giro, -L - T.colaLargo, -L, T.ancho * 0.4, T.cola),           // atrás: el escalón para subirte
    caparazon: parteGirada(giro, -L, L, T.ancho, T.caparazon),                        // el caparazón (donde te llevan)
    cabeza: parteGirada(giro, L, L + T.cabezaLargo, T.ancho * 0.45, T.cabeza),       // adelante: la cabeza
  };
}
// 🚗 Lo que te lleva un carro (o una tortuga) en este cuadro: cuánto se movió desde el cuadro anterior.
// antes = null: recién empezó la ronda (o el intento) y el carro aparece en su lugar: ese cuadro NO te arrastra.
// (No se mira la distancia: si la compu se traba medio segundo, el carro avanza mucho y te lleva igual, sin tirarte)
export const arrastreDe = (antes, ahora) => (antes ? { dx: ahora.x - antes.x, dz: ahora.z - antes.z } : { dx: 0, dz: 0 });
// Si el carro dobla, giras con él alrededor de su centro (para no quedar colgando)
export function girarAlrededor(pos, centro, g) {
  const rx = pos.x - centro.x, rz = pos.z - centro.z;
  return { x: centro.x + rx * Math.cos(g) + rz * Math.sin(g), z: centro.z - rx * Math.sin(g) + rz * Math.cos(g) };
}
// Las cajas de todas las tortugas en el segundo t (en coordenadas del terreno), para chocar y subirse
export function cajasTortugas(t) {
  return TORTUGAS.flatMap((_, i) => {
    const p = tortugaPos(i, t), partes = partesTortuga(p.giro);
    return Object.values(partes).map(q => ({ x0: p.x + q.x - q.hw, x1: p.x + q.x + q.hw, z0: p.z + q.z - q.hd, z1: p.z + q.z + q.hd, y0: 0, y1: q.top }));
  });
}
// Las partes del carro para chocar (relativas a su centro), según hacia dónde mira:
// la cubierta (atrás, donde te subes) y la cabina (adelante, no se puede atravesar). i: cuál carro (cada uno tiene su forma)
export function partesCarro(giro, i = null) {
  const dx = Math.sin(giro), dz = Math.cos(giro), C = i === null ? CARRO : { ...CARRO, ...CARROS[i] }, atras = C.largo - C.cabinaLargo;
  const caja = (centro, largo, alto) => ({ x: dx * centro, z: dz * centro, hw: Math.abs(dx) * largo / 2 + Math.abs(dz) * C.ancho / 2, hd: Math.abs(dz) * largo / 2 + Math.abs(dx) * C.ancho / 2, top: alto });
  return { cubierta: caja(-C.largo / 2 + atras / 2, atras, C.cubierta), cabina: caja(C.largo / 2 - C.cabinaLargo / 2, C.cabinaLargo, C.cabina) };
}

// Las cajas para chocar de una pieza: [{ x0, x1, y0, y1, z0, z1 }] (relativas al centro del terreno)
const caja = (x0, x1, y0, y1, z0, z1, extra) => ({ x0, x1, y0, y1, z0, z1, ...extra });
export function cajasPieza(p) {
  const { x, z, a, l, h } = p, y = p.y || 0, X0 = x - a / 2, X1 = x + a / 2, Z0 = z - l / 2, Z1 = z + l / 2;
  if (p.t === 'decor') return [];
  if (p.t === 'bloque' || p.t === 'esfera') return [caja(X0, X1, y, y + h, Z0, Z1)];
  if (p.t === 'trampolin') return [caja(X0, X1, 0, h, Z0, Z1, { salto: p.salto })];
  if (p.t === 'mesa' || p.t === 'silla') {
    const g = h * 0.06, pata = Math.max(1.2, a * 0.08), alto = p.t === 'silla' ? h * 0.5 : h;   // la silla: asiento a media altura
    const out = [caja(X0, X1, alto - g, alto, Z0, Z1)];
    for (const px of [X0, X1 - pata]) for (const pz of [Z0, Z1 - pata]) out.push(caja(px, px + pata, 0, alto - g, pz, pz + pata));
    if (p.t === 'silla') out.push(p.respaldo === 'n' ? caja(X0, X1, alto, h, Z1 - pata, Z1) : caja(X0, X1, alto, h, Z0, Z0 + pata));
    return out;
  }
  if (p.t === 'cueva') {
    const g = Math.max(0.6, Math.min(a, l) * 0.08), ab = p.abierta || '', out = [caja(X0, X1, h - g, h, Z0, Z1)];   // el techo
    if (!ab.includes('n')) out.push(caja(X0, X1, 0, h - g, Z1 - g, Z1));
    if (!ab.includes('s')) out.push(caja(X0, X1, 0, h - g, Z0, Z0 + g));
    if (!ab.includes('e')) out.push(caja(X1 - g, X1, 0, h - g, Z0, Z1));
    if (!ab.includes('o')) out.push(caja(X0, X0 + g, 0, h - g, Z0, Z1));
    return out;
  }
  if (p.t === 'cama') {
    // Patas, la base (15 a 20 m), el colchón hasta h, la cabecera (+z) y la cobija colgando del lado −x (debajo queda una cueva)
    const pata = 4, out = [];
    for (const px of [X0, X1 - pata]) for (const pz of [Z0, Z1 - pata]) out.push(caja(px, px + pata, 0, 15, pz, pz + pata));
    out.push(caja(X0, X1, 15, h, Z0, Z1));
    out.push(caja(X0, X1, 0, h + 15, Z1, Z1 + 3));
    out.push(caja(X0 - 1, X0, 3, h, Z0, Z1));
    return out;
  }
  if (p.t === 'canasta') {
    const g = 1.2, out = [caja(X0, X1, 0, h, Z1 - g, Z1), caja(X0, X1, 0, h, Z0, Z0 + g), caja(X1 - g, X1, 0, h, Z0, Z1), caja(X0, X0 + g, 0, h, Z0, Z1)];
    out.push(...escaleraCanasta(p));
    // Adentro: bloques de juguete como escalones para volver a salir
    const n = Math.ceil(h / 2.4);
    for (let k = 1; k <= n; k++) { const hk = Math.min(h, k * 2.4); out.push(caja(X0 + g, X0 + g + 3, 0, hk, Z0 + g + (k - 1) * 2.6, Z0 + g + k * 2.6)); }
    return out;
  }
  return [];
}
// La escalera de mano de una canasta: peldaños que suben 1,4 m cada uno y se acercan 1,4 m a la canasta
// (no se tapan uno al otro, así no te golpeas la cabeza). El último queda a la altura del borde.
export function escaleraCanasta(p) {
  const { x, z, a, l, h } = p, lado = p.escalera || 's', paso = 1.4, prof = 1.2, ancho = 4, n = Math.ceil(h / paso), out = [];
  for (let k = 1; k <= n; k++) {
    const y = Math.min(h, k * paso), lejos = (n - k) * paso + 0.2;   // el de más arriba, pegadito a la canasta
    if (lado === 's') { const z1 = z - l / 2 - lejos; out.push(caja(x - ancho / 2, x + ancho / 2, y - 0.3, y, z1 - prof, z1, { peldano: true })); }
    else if (lado === 'n') { const z0 = z + l / 2 + lejos; out.push(caja(x - ancho / 2, x + ancho / 2, y - 0.3, y, z0, z0 + prof, { peldano: true })); }
    else if (lado === 'e') { const x0 = x + a / 2 + lejos; out.push(caja(x0, x0 + prof, y - 0.3, y, z - ancho / 2, z + ancho / 2, { peldano: true })); }
    else { const x1 = x - a / 2 - lejos; out.push(caja(x1 - prof, x1, y - 0.3, y, z - ancho / 2, z + ancho / 2, { peldano: true })); }
  }
  return out;
}
// Todas las cajas del terreno, con las 4 paredes del cuarto
export function cajasTerreno(T) {
  const w = T.ancho / 2, l = T.largo / 2, g = 4;
  return [caja(-w - g, w + g, 0, T.alto, l, l + g), caja(-w - g, w + g, 0, T.alto, -l - g, -l), caja(w, w + g, 0, T.alto, -l, l), caja(-w - g, -w, 0, T.alto, -l, l),
    ...T.piezas.flatMap(cajasPieza)];
}
// Los escondites: adentro de cada cueva (con su entrada, para llegar caminando) y los extra del terreno
export function escondites(T) {
  const out = [];
  for (const p of T.piezas) {
    if (p.t !== 'cueva') continue;
    const ab = p.abierta[0], d = { n: [0, 1], s: [0, -1], e: [1, 0], o: [-1, 0] }[ab];
    const fondo = (ab === 'n' || ab === 's' ? p.l : p.a) * 0.15;   // un poco hacia el fondo de la cueva
    out.push({ x: p.x - d[0] * fondo, z: p.z - d[1] * fondo, y: 0,
      entrada: { x: p.x + d[0] * ((ab === 'n' || ab === 's' ? p.l : p.a) / 2 + 4), z: p.z + d[1] * ((ab === 'n' || ab === 's' ? p.l : p.a) / 2 + 4) } });
  }
  for (const e of T.extra) {
    const lugar = { x: e.x, z: e.z, y: e.y || 0, alto: !!e.alto, entrada: null };
    if (e.alto) Object.assign(lugar, rutasAlto(T, lugar));   // cómo subir (y bajar) hasta un escondite alto
    out.push(lugar);
  }
  return out;
}
// Cómo llega el bot a un escondite alto: una lista de puntos por donde pasar ({ x, z, y: la altura a la que tiene que llegar }).
// Arriba de la cama: al trampolín (tramp: true, te lanza), después sobre la cama y al escondite.
// Adentro de una canasta: sube la escalera de mano peldaño por peldaño, camina por el borde y se deja caer adentro.
// salida: cómo vuelve a salir (de la cama basta con caminar hasta el borde y caer; de la canasta, por los cubos de adentro).
export function rutasAlto(T, e) {
  const cama = T.piezas.find(p => p.t === 'cama'), tramp = T.piezas.find(p => p.t === 'trampolin');
  if (cama && tramp && e.y >= cama.h - 1) {
    const borde = { x: cama.x - cama.a / 2 + 5, z: Math.max(cama.z - cama.l / 2 + 5, Math.min(cama.z + cama.l / 2 - 5, tramp.z)), y: cama.h };
    return { ruta: [{ x: tramp.x, z: tramp.z, y: 0, tramp: true }, borde, { x: e.x, z: e.z, y: e.y }], salida: [{ x: borde.x, z: borde.z, y: cama.h }, { x: cama.x - cama.a / 2 - 8, z: borde.z, y: 0 }] };
  }
  const c = T.piezas.find(p => p.t === 'canasta' && Math.abs(e.x - p.x) < p.a / 2 && Math.abs(e.z - p.z) < p.l / 2);
  if (!c) return { ruta: null, salida: null };
  const centro = q => ({ x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, y: q.y1 });
  const peldanos = escaleraCanasta(c).map(centro), pie = peldanos[0], arriba = peldanos[peldanos.length - 1], g = 1.2;
  // El pie de la escalera (en el piso, un poco antes del primer peldaño) y el borde de la canasta (arriba de la pared)
  const lejos = (q, k) => ({ x: q.x + (q.x - c.x) / Math.hypot(q.x - c.x, q.z - c.z) * k, z: q.z + (q.z - c.z) / Math.hypot(q.x - c.x, q.z - c.z) * k });
  const piso = { ...lejos(pie, 2), y: 0 }, borde = { ...lejos(arriba, -(0.2 + 1.2 / 2 + g / 2 + 0.4)), y: c.h };
  // Para salir: los cubos de adentro (del más bajito al más alto), el borde de atrás y afuera
  const cubos = cajasPieza(c).filter(q => !q.peldano && q.x1 - q.x0 < 4 && q.z1 - q.z0 < 4).map(centro).sort((a, b) => a.y - b.y);
  const ultimo = cubos[cubos.length - 1];
  const bordeAtras = { x: ultimo.x, z: c.z + c.l / 2 - g / 2, y: c.h }, afuera = { x: ultimo.x, z: c.z + c.l / 2 + 5, y: 0 };
  return { ruta: [piso, ...peldanos, borde, { x: e.x, z: e.z, y: 0 }], salida: [...cubos, bordeAtras, afuera] };
}
// Las cajas que tapan la vista: las que están a la altura de los ojos (1,6 m)
export const OJO = 1.6;
// (ojo: a qué altura están los ojos; si el bot está arriba de la cama, sus ojos están a 27,5 + 1,6 m)
export const tapanVista = (cajas, ojo = OJO) => cajas.filter(c => c.y0 <= ojo && c.y1 >= ojo);
// ¿Hay algo que tape la vista entre a y b?
export const lineaDeVista = (a, b, tapan) => !tapan.some(c => segmentHitsRect(a.x, a.z, b.x, b.z, c));

// ¿A qué plataforma te lleva un trampolín? La más alta que alcanzas (con 1,5 m de margen) y que está cerca
// (a menos de 8 m de borde a borde: en el aire tienes tiempo de sobra para llegar). null = a ninguna
export function destinoTrampolin(T, tramp) {
  let mejor = null;
  for (const c of cajasTerreno(T)) {
    if (c.salto || c.y1 > tramp.salto - 1.5 || c.y1 < 3) continue;
    const gx = Math.max(0, c.x0 - (tramp.x + tramp.a / 2), (tramp.x - tramp.a / 2) - c.x1), gz = Math.max(0, c.z0 - (tramp.z + tramp.l / 2), (tramp.z - tramp.l / 2) - c.z1);
    if (Math.hypot(gx, gz) <= 8 && (!mejor || c.y1 > mejor.y1)) mejor = c;
  }
  return mejor;
}

// ---------- En los modos de juego siempre es de día ----------
// El reloj de verdad sigue (el pueblo de afuera tiene su día y su noche normal, y la hora de la sala no cambia),
// pero la luz de los minijuegos se dibuja como si fuera mediodía: así nunca está oscuro.
export const MEDIODIA = 0.5;
export const faseDeLuz = (fase, enModo) => (enModo ? MEDIODIA : fase);

// ----- El bot de las escondidas (jugando solo) -----
// Busca recorriendo escondites; si te VE (sin nada en medio y no muy lejos) o te OYE (muy cerca), te persigue.
export const BOT_ESC = { busca: 7, persigue: 10.5, vista: 70, oido: 9, atrapa: 1.6, olvida: 3 };
// cajas: todas las del terreno (mira solo las que están a la altura de SUS ojos, que dependen de dónde está parado)
export function botVe(bot, yo, cajas) {
  const d = Math.hypot(bot.x - yo.x, bot.z - yo.z);
  if (Math.abs((bot.y || 0) - (yo.y || 0)) > 3) return false;   // si estás mucho más arriba o más abajo (en la cama y él en el piso), no te ve
  return d <= BOT_ESC.oido || (d <= BOT_ESC.vista && lineaDeVista(bot, yo, tapanVista(cajas, (bot.y || 0) + OJO)));
}
// El orden en que el bot revisa los escondites (al azar; los altos solo si sabe cómo subir)
export function ordenEscondites(lista, rnd = Math.random) {
  const idx = lista.map((e, i) => i).filter(i => !lista[i].alto || lista[i].ruta);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

// ---------- 🌳 Pasto y árboles del mundo ----------
// Donde NO va pasto alto ni árboles: las casas, la fábrica, el parque, el pueblo, los portales, el trampolín,
// la línea amarilla y donde apareces. (Los rectángulos son { x0, x1, z0, z1 } en metros)
const zona = (x, z, a, l = a) => ({ x0: x - a, x1: x + a, z0: z - l, z1: z + l });
export const ZONAS_SIN_PASTO = [
  { x0: BIG_HOUSE.x0, x1: BIG_HOUSE.x1, z0: BIG_HOUSE.z0, z1: BIG_HOUSE.z1 },   // la casa (chica o grande)
  { x0: FACTORY.x0, x1: FACTORY.x1, z0: FACTORY.z0, z1: FACTORY.z1 },           // la fábrica y las cintas
  zona(STYLE_STALL.x, STYLE_STALL.z, 4),                                         // la tienda de estilo
  zona(SWINGS.x, SWINGS.z, 4, 3),                                                // los columpios
  { x0: SLIDE.x0 - 2, x1: SLIDE.x0 + 9, z0: SLIDE.z - 3, z1: SLIDE.z + 3 },     // el tobogán
  ...VILLAGE.houses.map(h => ({ x0: h.x - 5, x1: h.x + 5, z0: h.z - VILLAGE.doorOut - 4, z1: h.z + 5 })),   // las casas del pueblo y su puerta
  { x0: 70, x1: 77, z0: 71, z1: 86 },                                            // los portales (Mundo al Revés y Escuela)
  zona(82, 82, 5),                                                               // el trampolín
  { x0: -100, x1: 100, z0: -3, z1: 6 },                                          // la línea amarilla
  zona(0, 15, 4),                                                                // donde apareces
];
export const libreDePasto = (x, z, zonas = ZONAS_SIN_PASTO, margen = 0) =>
  !zonas.some(r => x > r.x0 - margen && x < r.x1 + margen && z > r.z0 - margen && z < r.z1 + margen);
// Los árboles: casi todos en el borde, cerca de las montañas, y unos pocos en la mitad del gigante (para esconderte de él)
export const ARBOLES = { borde: 26, gigante: 8, desde: 84, hasta: 94, separacion: 9, semilla: 11, tronco: 0.35 };
export function lugaresArboles(libre = (x, z) => libreDePasto(x, z, ZONAS_SIN_PASTO, 3), rnd = seededRandom(ARBOLES.semilla)) {
  const A = ARBOLES, out = [];
  const lejos = (x, z) => out.every(p => Math.hypot(p.x - x, p.z - z) >= A.separacion);
  const poner = (n, elegir) => {
    for (let i = 0, puestos = 0; i < 400 && puestos < n; i++) {
      const p = elegir();
      if (libre(p.x, p.z) && lejos(p.x, p.z)) { out.push({ ...p, tipo: rnd() < 0.5 ? 'redondo' : 'pino', alto: 5 + rnd() * 3 }); puestos++; }
    }
  };
  // En el borde: un punto al azar en la franja de 84 a 94 m del centro
  poner(A.borde, () => {
    const lado = Math.floor(rnd() * 4), a = (rnd() * 2 - 1) * A.hasta, b = (A.desde + rnd() * (A.hasta - A.desde)) * (lado % 2 ? 1 : -1);
    return lado < 2 ? { x: a, z: b } : { x: b, z: a };
  });
  // En la mitad del gigante (z negativa), lejos de la línea amarilla
  poner(A.gigante, () => ({ x: (rnd() * 2 - 1) * 70, z: -20 - rnd() * 55 }));
  return out;
}
// Matas de pasto y florecitas: puntos al azar en todo el campo, solo donde hay lugar
export function lugaresPasto(n, libre = (x, z) => libreDePasto(x, z), rnd = Math.random, borde = 96) {
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const x = (rnd() * 2 - 1) * borde, z = (rnd() * 2 - 1) * borde;
    if (libre(x, z)) out.push({ x, z, giro: rnd() * Math.PI * 2, tam: 0.7 + rnd() * 0.6 });
  }
  return out;
}
// Los mini sombreros de los bots chiquitos: uno distinto para cada bot (se repiten en orden)
export const SOMBREROS_BOTS = ['helice', 'gorra', 'lana'];
export const sombreroDeBot = i => SOMBREROS_BOTS[i % SOMBREROS_BOTS.length];

// ---------- 🤖 El bot guía: un cubito que te sigue y te explica el juego ----------
// Lo que dice cuando pulsas «¿Cómo juego?» (en el celular no hay teclas: nombra los botones)
export const GUIA_COMO = {
  teclado: 'Para moverte usa WASD, las flechas izquierda/derecha (o arrastrar el mouse) para mover la cámara, y ESPACIO para saltar. Extra: P = tienda · E = usar (dormir en tu cama de noche, la tienda de estilo detrás de tu casa, el armario de tu casa) · V = primera persona · clic = láser · ENTER = abrir o cerrar este diálogo · H = esconderme o llamarme · C = cambiar mi color. Para guardar, pulsa el botón verde GUARDAR.',
  touch: 'Para moverte usa el círculo de abajo a la izquierda, arrastra el dedo (o el círculo CÁMARA) para mover la cámara, y toca SALTAR para saltar. Los botones de la derecha sirven para usar cosas (el de 🤖 Guía abre o cierra este diálogo). Para guardar, toca GUARDAR.',
};
// Lo que dice cuando pulsas «¿Qué tengo que hacer?», según dónde estás (un resumen cortito de cada lugar)
export const GUIA_QUE_HAGO = {
  mundo: 'Recolecta monedas en la zona del gigante rojo (pasando la línea amarilla) y úsalas en la tienda (P) para conseguir mejoras en tu base. ¡Que el gigante no te atrape! El gigante no puede cruzar la línea amarilla: detrás de ella estás a salvo. De noche el gigante duerme: no te acerques o se despierta.',
  maze: 'Laberinto: encuentra el camino hasta la casa del bot amarillo (la esquina del fondo). Él te sigue. Aquí no se salta.',
  crates: 'Cajas grandes: empuja las 5 cajas hasta sacarlas de la casa del bot naranja.',
  flower: 'La flor que corre: alcanza a la flor rosada y riégala con F. Corre más que tú, pero a veces se cansa.',
  dropper: 'Dropper: déjate caer 200 m sin tocar lo rojo y aterriza en lo verde.',
  dolphins: 'Delfines: salta sobre los 10 delfines cuando están fuera del agua y recoge la gorra sobre la ballena dormida.',
  clouds: 'Nubes: salta por las 10 nubes y lleva al bot celeste hasta su casa.',
  lava: '50 escalones: sube con el bot turquesa hasta arriba antes de que la lava los alcance.',
  trees: 'Los 20 árboles: pulsa E junto a cada árbol hasta encontrar el círculo amarillo entre los rojos.',
  meteors: 'Meteoritos: sobrevive 30 segundos alejándote de las sombras rojas (ahí cae un meteorito).',
  mix: 'Nubes y lava: sube por las nubes con los bots celeste, turquesa y coral sin que la lava alcance a nadie.',
  inverted: 'Mundo al revés: ahora TÚ eres el gigante. Atrapa 10 veces al jugador en tu mitad (salta para alcanzarlo).',
  sandbox: 'Zona rara: todo tiene colores y formas al azar. Camina al portal SANDBOX (adelante) para ver a tu bot The Guy aprender a jugar, o al portal SALIDA (atrás) para volver a tu mundo.',
  sandboxSala: 'Sandbox: tu bot aprende solito probando y equivocándose. Arriba eliges la sala (No mires abajo, Escondidas, Atrapadas Nocivas, Spleef o Carrera), la velocidad (x1, x10 o x50) y le puedes cambiar el nombre. Cuando hace algo mal, ¡tiembla como licuadora! Lo que aprende se guarda en este navegador.',
  salon: 'Modo Escuela: cada silla es un juego. Acércate a una y pulsa E: la que brilla es «No mires abajo», la que se esconde es «Escondidas», la que tiene la mancha verde es «Atrapadas Nocivas», la rosada con la bandera es la «Carrera» y la de los hexágonos es el «Spleef». La SALIDA está atrás.',
  atrapadas: 'Atrapadas Nocivas: el que tiene la mancha verde alien tiene 15 segundos para pasársela a otro tocándolo. ¡Si se le acaba el tiempo, explota! Gana el último que quede. Usa los portales verdes y las plataformas. Moverte gasta batería: pulsa Q y responde preguntas.',
  fantasmaAN: 'Atrapadas Nocivas: explotaste 💥 y ahora eres un fantasma. Todos te ven, pero ya no puedes tocar a nadie: mira cómo termina la ronda.',
  nomires: 'No mires abajo: sube la torre de 10 etapas sin caerte. Caminar y saltar gasta batería: pulsa Q y responde preguntas para cargarla. ¡Aquí hay doble salto!',
  esconder: 'Escondidas: ¡te toca esconderte! Busca un buen escondite antes de que el buscador termine de contar. Moverte gasta batería: pulsa Q y responde preguntas.',
  buscar: 'Escondidas: ¡eres el buscador! Mientras cuentas, los demás se esconden; después búscalos: para encontrar a alguien, ¡tócalo! (como en Atrapadas).',
  fantasma: 'Escondidas: ya te encontraron, ahora eres un fantasma 👻. Mira cómo sigue la ronda hasta que termine.',
};
// ¿Dónde estás? id = el minijuego (null = el mundo normal) · fase = la del Modo Escuela · rol / fantasma = en Escondidas
export function lugarDelGuia({ id = null, fase = null, rol = null, fantasma = false } = {}) {
  if (!id) return 'mundo';
  if (id === 'sandbox') return fase === 'sala' ? 'sandboxSala' : 'sandbox';
  if (id !== 'escuela') return id in GUIA_QUE_HAGO ? id : 'mundo';
  if (fase === 'nomires') return 'nomires';
  if (fase === 'escondidas') return fantasma ? 'fantasma' : rol === 'buscar' ? 'buscar' : 'esconder';
  if (fase === 'atrapadas') return fantasma ? 'fantasmaAN' : 'atrapadas';
  return 'salon';
}
export const textoQueHago = lugar => GUIA_QUE_HAGO[lugar] || GUIA_QUE_HAGO.mundo;
// Colores del bot guía: C pasa al siguiente (y después del último vuelve al primero)
export const GUIA_COLORES = [0xffffff, 0x64d2ff, 0xffd60a, 0xff6bb5, 0x9b6bff, 0xff8a3d];
export const siguienteColorGuia = i => (i + 1) % GUIA_COLORES.length;

// ---------- 👽 Atrapadas Nocivas: la mancha verde alien (la tercera silla del Modo Escuela) ----------
// Un espacio verde azulado oscuro con plataformas negras flotando (algunas se mueven) y portales verdes de a pares.
// Todo se calcula con números fijos (semilla) y el reloj de la ronda: así todos ven lo mismo.
export const ARENA_AN = { mitad: 70, cadenas: 4, pasos: 11, sube: 1.5, lado: 6, hueco: 1.6, radio: 46, cima: { y: 18, lado: 16 }, seed: 23 };
// Las plataformas: 4 escaleras en espiral (una en cada esquina) que suben hasta 16,5 m, puentes hasta la CIMA del centro
// (a 18 m) e islas flotantes que solo se alcanzan por los portales. mueve: { eje: 'x' | 'y', amp, periodo } (como los ovnis)
export function plataformasAN() {
  const A = ARENA_AN, rnd = seededRandom(A.seed), out = [];
  for (let c = 0; c < A.cadenas; c++) {
    let ang = c * Math.PI / 2 + Math.PI / 4, y = A.sube, r = A.radio;
    const mueven = Array.from({ length: A.pasos }, (_, k) => (k % 4 === 3 ? (k === 3 ? { eje: 'y', amp: 0.7, periodo: 4 + rnd() * 2 } : { eje: 'x', amp: 1, periodo: 5 + rnd() * 2 }) : null));
    for (let k = 0; k < A.pasos; k++) {
      const mueve = mueven[k];
      out.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, y, lado: A.lado, mueve, tipo: 'escalera', cadena: c });
      // Hasta la siguiente: un hueco normal, más lo que se mueve la de ahora o la siguiente (para que no se choquen)
      const extra = (mueve ? mueve.amp * 1.5 + 0.6 : 0) + (mueven[k + 1] ? mueven[k + 1].amp * 1.5 + 0.6 : 0);
      y += A.sube; ang += (A.lado + A.hueco + extra) / r; r -= 1.2;
    }
    // El puente hacia la cima: derecho hacia el centro, ya a la altura de la cima
    const fin = out[out.length - 1], a = Math.atan2(fin.z, fin.x), r0 = Math.hypot(fin.x, fin.z);
    for (let j = 1; j <= 3; j++) out.push({ x: Math.cos(a) * (r0 - j * 7), z: Math.sin(a) * (r0 - j * 7), y: A.cima.y, lado: A.lado, mueve: null, tipo: 'puente', cadena: c });
  }
  out.push({ x: 0, z: 0, y: A.cima.y, lado: A.cima.lado, mueve: null, tipo: 'cima' });
  // Islas flotantes (se llega por los portales): dos con portal no se mueven; las otras, sí
  const islas = [[-50, 0, 10], [50, 0, 12], [0, 52, 24], [0, -52, 26], [-25, -25, 30], [0, 0, 32]];
  islas.forEach(([x, z, y], i) => out.push({ x, z, y, lado: 9, mueve: i >= 4 ? { eje: i === 4 ? 'x' : 'y', amp: 2, periodo: 7 } : null, tipo: 'isla' }));
  return out;
}
// Dónde está una plataforma en el segundo t de la ronda (desplazamiento desde su lugar)
export const desplazamientoAN = (p, t) => (p.mueve ? p.mueve.amp * Math.sin((t / p.mueve.periodo) * Math.PI * 2) : 0);
// Los portales verdes, de a pares: entras por uno y sales por el otro. Unos en el piso y otros arriba de islas o de la cima.
// { x, y, z, par: el número del otro, salida: { x, z } (un poco adelante del portal, para no volver a entrar) }
export function portalesAN() {
  const P = plataformasAN(), islas = P.filter(p => p.tipo === 'isla'), cima = P.find(p => p.tipo === 'cima');
  const arriba = p => ({ x: p.x, y: p.y, z: p.z - 1.5, salida: { x: p.x, z: p.z + 2 } });
  const piso = (x, z) => ({ x, y: 0, z, salida: { x, z: z + 3 } });
  const pares = [
    [piso(-20, 20), arriba(islas[0])], [piso(20, -20), arriba(islas[1])], [piso(20, 20), arriba(islas[2])],
    [piso(-20, -20), arriba(islas[3])], [piso(0, -14), arriba(cima)],
  ];
  const out = [];
  pares.forEach(([a, b]) => { const i = out.length; out.push({ ...a, par: i + 1 }, { ...b, par: i }); });
  return out;
}
// 🎯 La "motivación" del bot que tiene la mancha: persigue al más cercano que PUEDE alcanzar (que no está más alto que su salto).
// Si alguien está muy arriba y el bot no avanza, se aburre de él por un rato (lo ignora) y busca a otro.
// candidatos: [{ id, x, y, z }] · ignorados: { id: hasta (en ms) } · devuelve { id, alcanzable } o null
export const MOTIVACION_AN = { salto: 2.6, sinAvanceMs: 2000, avanceMin: 1, olvidoMs: 6000 };
export function elegirObjetivoAN(yo, candidatos, ignorados, ahora) {
  const libres = candidatos.filter(c => !((ignorados[c.id] || 0) > ahora));
  const puede = c => c.y - yo.y <= MOTIVACION_AN.salto;
  const lista = libres.some(puede) ? libres.filter(puede) : libres;
  let mejor = null, dm = Infinity;
  for (const c of lista) { const d = Math.hypot(c.x - yo.x, c.z - yo.z); if (d < dm) { dm = d; mejor = c; } }
  return mejor && { id: mejor.id, alcanzable: puede(mejor) };
}
// ¿Se aburre de ese objetivo? Si en los últimos 2 s no se acercó ni 1 m y está más alto de lo que salta
export const meAburro = (distAntes, distAhora, alturaObjetivo, alturaYo) => alturaObjetivo - alturaYo > MOTIVACION_AN.salto && distAntes - distAhora < MOTIVACION_AN.avanceMin;
// ¿Estás adentro de un portal? (devuelve su número, o -1)
export function portalCerca(pos, portales) {
  return portales.findIndex(p => Math.abs(pos.x - p.x) < 1.2 && Math.abs(pos.z - p.z) < 1.2 && pos.y >= p.y - 0.5 && pos.y < p.y + 2);
}

// ---------- 🛡️ Zonas que vigila el servidor (para que nadie haga trampa con la velocidad) ----------
// Dónde está cada cosa en el mundo de verdad (las mismas cuentas que usa el juego para dibujarlas)
// Lo más rápido que se puede ir en la arena: corres a 15 (AN.vel en red.js) + lo que te llevan las plataformas que se mueven
export const ARENA_VEL_MAX = 19;
export const ARENA_AN_X = 2300;   // la arena está dentro del minijuego del Modo Escuela, lejos de todo lo demás
export const TERRENO_X = [700, 1200, 1700];   // los 3 terrenos de Escondidas, igual
export const centroArenaAN = () => { const o = minigameOrigin(ESCUELA_K); return { x: o.x + ARENA_AN_X, z: o.z }; };
// Dónde empieza el jugador número k de n: en un círculo de 12 m en el piso, alrededor del centro
export function salidaAN(k, n) {
  const c = centroArenaAN(), ang = (k / Math.max(1, n)) * Math.PI * 2;
  return { x: c.x + Math.cos(ang) * 12, z: c.z + Math.sin(ang) * 12 };
}
// Lo más alto que se puede estar en la arena: la plataforma más alta (con lo que sube si se mueve) + un salto (12,5² / 2·30 ≈ 2,6 m)
export const alturaMaxAN = () => Math.max(...plataformasAN().map(p => p.y + (p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0))) + 3;
// ¿Qué tan alto está lo más alto que hay debajo de (x, z), o cerquita? (en la arena, desde su centro). Sirve para saber que no estás volando:
// nadie puede estar a más de un salto por encima de eso (salvo cayéndose). "Cerquita" = 7 m: lo que avanzas mientras subes en un salto
// (15 m/s × 0,42 s), para que saltar de un escalón al siguiente nunca cuente como volar. Cuenta lo que se mueven las plataformas.
const ARENA_PLATS = plataformasAN().map(p => {
  const ax = p.mueve && p.mueve.eje === 'x' ? p.mueve.amp : 0, ay = p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0;
  return { x: p.x, z: p.z, medio: p.lado / 2 + ax + 7, top: p.y + ay };
});
export function soporteAN(x, z) {
  let alto = 0;
  for (const p of ARENA_PLATS) if (Math.abs(x - p.x) <= p.medio && Math.abs(z - p.z) <= p.medio && p.top > alto) alto = p.top;
  return alto;
}
// La zona de una ronda: el cuadrado donde se juega, la velocidad máxima, dónde puede "aparecer" al llegar
// y los saltos que sí valen (entrar a un portal y salir por su par)
const ARENA_BAJO = plataformasAN().map(p => { const ax = p.mueve && p.mueve.eje === 'x' ? p.mueve.amp : 0, ay = p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0;
  return { x0: p.x - p.lado / 2 - ax, x1: p.x + p.lado / 2 + ax, z0: p.z - p.lado / 2, z1: p.z + p.lado / 2, top: p.y + ay, ay }; });
// Lo más alto que hay justo debajo (o cerquita, con margen) en la arena: para saber si alguien flota (las que suben y bajan, a tu altura)
export function soporteBajoAN(x, z, y, margen = 0.6) {
  let alto = 0;
  for (const c of ARENA_BAJO) {
    if (x < c.x0 - margen || x > c.x1 + margen || z < c.z0 - margen || z > c.z1 + margen) continue;
    const top = margen > 1 ? c.top : c.top - 2 * c.ay <= y + 0.5 ? Math.min(c.top, y) : -Infinity;
    if (top > alto) alto = top;
  }
  return alto;
}
export function zonaAN(k, n) {
  const c = centroArenaAN(), m = ARENA_AN.mitad - 1, P = portalesAN();
  const saltos = P.map(p => { const d = P[p.par]; return { desde: { x: c.x + p.x, y: p.y, z: c.z + p.z }, hasta: { x: c.x + d.salida.x, y: d.y, z: c.z + d.salida.z } }; });
  return { x0: c.x - m, x1: c.x + m, z0: c.z - m, z1: c.z + m, yMin: 0, yMax: alturaMaxAN(), velMax: ARENA_VEL_MAX, llegada: { ...salidaAN(k, n), radio: 4 }, saltos,
    soporte: (x, z) => soporteAN(x - c.x, z - c.z), soporteBajo: (x, z, y, margen) => soporteBajoAN(x - c.x, z - c.z, y, margen) };
}
// Escondidas: el terreno entero. Ahí hay carros que te llevan (15 m/s) y encima puedes correr: cerca de un carro deja ir más rápido
const cercaDeUnCarro = (i, t, pos, x0, z0) => !!pos && cajasMovilesEsc(i, t).some(c => pos.x >= x0 + c.x0 - 6 && pos.x <= x0 + c.x1 + 6 && pos.z >= z0 + c.z0 - 6 && pos.z <= z0 + c.z1 + 6 && pos.y <= c.y1 + 4);
const LANZADORES_ESC = [], PISOS_ESC = [];
// Lo más alto que hay justo debajo de (x, z) y no más arriba de tus pies (en el terreno i de Escondidas): para saber si estás flotando
// En la habitación (terreno 1) también cuentan los carros y las tortugas, donde estén en el segundo t de la ronda (con 2 m de margen: internet tarda)
export function cajasMovilesEsc(i, t) {
  if (i !== 1 || t === null || t === undefined) return [];
  return [...CARROS.flatMap((_, k) => { const p = carroPos(k, t), partes = partesCarro(p.giro, k); return [partes.cubierta, partes.cabina].map(q => ({ x0: p.x + q.x - q.hw, x1: p.x + q.x + q.hw, z0: p.z + q.z - q.hd, z1: p.z + q.z + q.hd, y1: q.top })); }),
    ...cajasTortugas(t)];
}
function soporteEsc(i, x0, z0, t) {
  if (!PISOS_ESC[i]) PISOS_ESC[i] = cajasTerreno(TERRENOS[i]).slice(4).map(c => ({ x0: x0 + c.x0, x1: x0 + c.x1, z0: z0 + c.z0, z1: z0 + c.z1, top: c.y1 }));   // (sin las 4 paredes)
  const moviles = cajasMovilesEsc(i, t).map(c => ({ x0: x0 + c.x0 - 2, x1: x0 + c.x1 + 2, z0: z0 + c.z0 - 2, z1: z0 + c.z1 + 2, top: c.y1 }));
  const todas = moviles.length ? PISOS_ESC[i].concat(moviles) : PISOS_ESC[i];
  // margen: qué tan cerca cuenta (0,6 m = justo debajo; 7 m = "cerquita", para saltar de un mueble a otro)
  return (x, z, y, margen = 0.6) => { let alto = 0; for (const c of todas) if (x >= c.x0 - margen && x <= c.x1 + margen && z >= c.z0 - margen && z <= c.z1 + margen && (margen > 1 || c.top <= y + 0.5) && c.top > alto) alto = c.top; return alto; };
}
// t: el segundo de la ronda (para saber dónde están los carros): cerca de un carro o una tortuga, puedes ir más rápido (te llevan)
export const VEL_ESC = 14;   // corres a 12 (+ un margen)
export function zonaEsc(i, t = null, pos = null) {
  const o = minigameOrigin(ESCUELA_K), T = TERRENOS[i], x = o.x + TERRENO_X[i];
  // los trampolines del terreno (normales, súper, frutas y los amarillos): te pueden lanzar de 18 a 110 m
  if (!LANZADORES_ESC[i]) LANZADORES_ESC[i] = cajasTerreno(T).filter(c => c.salto).map(c => ({ x0: x + c.x0, x1: x + c.x1, z0: o.z + c.z0, z1: o.z + c.z1, top: c.y1, salto: c.salto }));   // (se calcula una sola vez)
  const lanzadores = LANZADORES_ESC[i];
  return { x0: x - T.ancho / 2 + 1, x1: x + T.ancho / 2 - 1, z0: o.z - T.largo / 2 + 1, z1: o.z + T.largo / 2 - 1,
    yMin: 0, yMax: T.alto, velMax: VEL_ESC + (cercaDeUnCarro(i, t, pos, x, o.z) ? CARRO.vel + 3 : 0), llegada: { x: x + T.spawn.x, z: o.z + T.spawn.z, radio: 10 }, saltos: [], lanzadores,
    soporteBajo: soporteEsc(i, x, o.z, t) };
}

// ---------- 🏁 Carrera (como Fall Guys): otra silla del Modo Escuela ----------
// Una pista larga de colores pastel FLOTANDO en el cielo (a 30 m), con puentes de dulce que se curvan, discos que giran,
// una rueda gigante con barras que barren, puños de boxeo que salen de los costados y plataformas que se mueven.
// Va de x = 0 a x = 304 (desde su origen, sobre el eje x). Cada 30 m, un checkpoint: si te caes, vuelves al último que pisaste.
// Todo se mueve con el RELOJ DE LA RONDA (t en segundos): así todos ven lo mismo, y el servidor también.
export const CARRERA_X = 3000;   // dentro del minijuego del Modo Escuela, lejos de todo lo demás
export const CARRERA = {
  y0: 30, cada: 30, checkpoints: 17, caida: 8, largo: 530,   // caes 8 m por debajo de la pista = vuelves al checkpoint
  meta: { x0: 529, x1: 544, z: 9 }, vel: 12, bots: 5, bateriaRespuesta: 4000,
  maxMs: 420000, despuesDelPrimeroMs: 45000,   // la carrera dura como mucho 7 min; cuando llega el primero, 45 s más para los demás
  puerta: { ancho: 3, alto: 6 },               // las puertas (las de verdad se rompen; las falsas son pared): más altas que un doble salto
  tubo: { radio: 2.2, vel: 10 },               // los tubos de viento te llevan a 10 m/s
  lanza: { vel: 18, salto: 15 },               // los trampolines inclinados: hacia adelante (o hacia atrás: ¡trampa!)
  puno: { vel: 24, salto: 9, mano: 0.9 }, barra: { vel: 16, salto: 7, grueso: 0.35, alto: 1.2 },
  empuje: { extraM: 30, extraMs: 3000 },   // el servidor te deja moverte 30 m de más (hacia donde te empujaron) durante 3 s
};
export const COLORES_CARRERA = { rosa: 0xff8fc7, lila: 0xb48cff, celeste: 0x8fd3ff, amarillo: 0xffe27a, menta: 0x8ff0c4, naranja: 0xffb27a };
// La pista: { plats, punos, barras, puertas, tubos, lanzas }. Cada plataforma: { x, z, y (arriba), ancho (en x), largo (en z), color, tipo,
//  mueve?: { amp, vel, fase } (de lado a lado en z), gira?: { w (radianes por segundo), fase }, redonda?, r?, cp? (número de checkpoint),
//  grosor? (qué tan gruesa es hacia abajo: 1 m, o más si es un bloque), lanza? ({ x, y }: un trampolín que te tira hacia adelante o atrás) }
// mueve.eje: 'z' (de lado a lado, el normal) o 'y' (sube y baja)
// puertas: filas de puertas (unas de verdad, otras falsas: depende de la semilla de la ronda) · tubos: { x0, x1, z, y, vx, vz } te llevan
export function pistaCarrera() {
  const C = CARRERA, Y = C.y0, K = COLORES_CARRERA, plats = [], punos = [], barras = [], puertas = [], tubos = [];
  const caja = (x0, x1, z0, z1, y, color, extra = {}) => plats.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, ancho: x1 - x0, largo: z1 - z0, color, tipo: 'piso', ...extra });
  // Puente de dulce que se curva: pedacitos de `paso` m que se van corriendo de costado (sin huecos entre uno y otro)
  const puente = (x0, x1, paso, anchoZ, curva, frec, y = Y) => {
    let i = 0;
    for (let x = x0; x < x1 - 0.01; x += paso, i++) { const dz = curva * Math.sin(i * frec); caja(x, Math.min(x1, x + paso + 0.3), dz - anchoZ / 2, dz + anchoZ / 2, y, i % 2 ? K.lila : K.rosa, { tipo: 'puente' }); }
  };
  const puno = (x, lado, y = Y, ancho = 8, fase = 0) => punos.push({ x, z: lado * (ancho / 2 + 1.2), lado, y, largo: ancho + 0.5, periodo: 2.2, fase });
  const disco = (x, r, w, color, fase = 0) => { plats.push({ x, z: 0, y: Y, ancho: r * 2, largo: r * 2, color, tipo: 'disco', redonda: true, r, gira: { w, fase } }); return plats.length - 1; };
  // La salida (más ancha) y los 9 checkpoints (verde menta), uno cada 30 m
  caja(-8, 6, -10, 10, Y, K.menta, { tipo: 'salida', cp: 0 });
  for (let k = 1; k <= C.checkpoints; k++) caja(k * C.cada, k * C.cada + 6, -7, 7, Y, K.menta, { tipo: 'checkpoint', cp: k });
  // 0 · puente de dulce que se curva
  puente(6, 30, 3, 4.5, 3, 0.8);
  // 1 · pasillo con 4 puños de boxeo (de los dos lados)
  caja(36, 60, -4, 4, Y, K.celeste);
  [40, 46, 52, 58].forEach((x, i) => puno(x, i % 2 ? -1 : 1, Y, 8, i * 0.55));
  // 2 · tres discos que giran (salta de uno a otro)
  [[70.5, 1.1], [79, -1.1], [87.5, 1.1]].forEach(([x, w], i) => disco(x, 3.6, w, i % 2 ? K.amarillo : K.lila, i));
  // 3 · ¡la rueda gigante! Gira despacito, y sus dos barras giran MÁS RÁPIDO encima (si no, irías con ellas y nunca te tocarían): hay que saltarlas
  const rueda = disco(108, 11, 0.25, K.rosa);
  for (const f of [0, Math.PI / 2]) barras.push({ x: 108, z: 0, y: Y, r: 11, w: 0.9, fase: f, disco: rueda });
  // 4 · plataformas que se mueven de lado a lado
  [128.5, 134.5, 140.5, 146.5].forEach((x, i) => caja(x - 2, x + 2, -2, 2, Y, K.amarillo, { tipo: 'mueve', mueve: { amp: 4, vel: 1.2, fase: i * 1.3 } }));
  // 5 · puente largo y angosto que se curva mucho
  puente(156, 180, 2.5, 3.2, 4, 0.6);
  // 6 · un escalón ALTO (4 m: necesitas el doble salto) con 2 puños arriba
  caja(186, 196, -3.5, 3.5, Y, K.celeste);
  caja(196, 210, -3.5, 3.5, Y + 4, K.naranja, { tipo: 'escalon', grosor: 5 });   // (es un bloque macizo: no se puede pasar por debajo)
  puno(201, 1, Y + 4, 7, 0.3); puno(206, -1, Y + 4, 7, 1.4);
  // 7 · dos ruedas medianas, cada una con su barra
  const r1 = disco(223.5, 6.5, 0.3, K.lila), r2 = disco(236.5, 6.5, -0.3, K.amarillo);
  barras.push({ x: 223.5, z: 0, y: Y, r: 6.5, w: 1.2, fase: 0, disco: r1 }, { x: 236.5, z: 0, y: Y, r: 6.5, w: -1.3, fase: 1, disco: r2 });
  // 8 · dos plataformas que se mueven y un pasillo con 3 puños
  [248.5, 254.5].forEach((x, i) => caja(x - 2, x + 2, -2, 2, Y, K.amarillo, { tipo: 'mueve', mueve: { amp: 3, vel: 1.5, fase: i * 2 } }));
  caja(257, 270, -4, 4, Y, K.celeste);
  [260, 264, 268].forEach((x, i) => puno(x, i % 2 ? 1 : -1, Y, 8, i * 0.7));
  // 9 · ¡PUERTAS FALSAS! Una pared con 5 puertas: unas se rompen al pasar y otras son de mentira (pared). ¿Cuál será?
  caja(276, 300, -7.5, 7.5, Y, K.celeste); puertas.push({ x: 290, n: 5, z0: -7.5, z1: 7.5 });
  // 10 · plataformas que SUBEN Y BAJAN
  [308.5, 314.5, 320.5, 326.5].forEach((x, i) => caja(x - 2, x + 2, -2, 2, Y, K.lila, { tipo: 'mueve', mueve: { eje: 'y', amp: 1.6, vel: 1.4, fase: i * 1.6 } }));
  // 11 · un TUBO de viento que te lleva hacia adelante (¡rapidísimo!)
  caja(336, 360, -4, 4, Y, K.celeste); tubos.push({ x0: 338, x1: 358, z: 0, y: Y, vx: C.tubo.vel, vz: 0 });
  // 12 · TRAMPOLINES inclinados sobre un hueco de 20 m: el verde te tira hacia ADELANTE… el rojo hacia ATRÁS (¡trampa!)
  caja(366, 370, -5, 5, Y, K.celeste);
  caja(370, 373, -4.5, -1, Y, 0x3ddc84, { tipo: 'lanza', lanza: { x: C.lanza.vel, y: C.lanza.salto } });
  caja(370, 373, 1, 4.5, Y, 0xff4d4d, { tipo: 'lanza', lanza: { x: -C.lanza.vel * 0.8, y: C.lanza.salto } });
  // 13 · un tubo que te empuja DE COSTADO (hacia el vacío): camina contra el viento
  caja(396, 420, -4, 4, Y, K.celeste); tubos.push({ x0: 398, x1: 418, z: 0, y: Y, vx: 0, vz: 6 });
  // 14 · más puertas falsas (7, más angostas, en un pasillo más ancho)
  caja(426, 450, -10.5, 10.5, Y, K.celeste); puertas.push({ x: 440, n: 7, z0: -10.5, z1: 10.5 });
  // 15 · de todo: plataformas que suben y bajan, de lado a lado, y un trampolín hacia adelante en el medio
  caja(456.5, 460.5, -2, 2, Y, K.lila, { tipo: 'mueve', mueve: { eje: 'y', amp: 1.4, vel: 1.6, fase: 0 } });
  caja(462.5, 466.5, -2, 2, Y, K.amarillo, { tipo: 'mueve', mueve: { amp: 3, vel: 1.4, fase: 1 } });
  caja(468.5, 472.5, -2, 2, Y, K.lila, { tipo: 'mueve', mueve: { eje: 'y', amp: 1.4, vel: 1.6, fase: 2 } });
  caja(474.5, 477.5, -2, 2, Y, 0x3ddc84, { tipo: 'lanza', lanza: { x: C.lanza.vel * 0.55, y: C.lanza.salto * 0.8 } });
  // 16 · dos ruedas más, con sus barras
  const r3 = disco(493.5, 6.5, 0.35, K.rosa), r4 = disco(506.5, 6.5, -0.35, K.lila);
  barras.push({ x: 493.5, z: 0, y: Y, r: 6.5, w: 1.0, fase: 0.5, disco: r3 }, { x: 506.5, z: 0, y: Y, r: 6.5, w: -1.1, fase: 2, disco: r4 });
  // 17 · el último puente y la META (amarilla, con su arco)
  puente(516, 529, 2.6, 4, 2, 0.9);
  caja(C.meta.x0 - 1, C.meta.x1, -C.meta.z, C.meta.z, Y, K.amarillo, { tipo: 'meta' });
  const lanzas = plats.map((p, i) => (p.lanza ? i : -1)).filter(i => i >= 0);
  return { plats, punos, barras, puertas, tubos, lanzas };
}
// Dónde está una plataforma en el segundo t: { x, z, giro } (las que se mueven van de lado a lado; los discos giran)
export function posPlatCarrera(p, t) {
  const off = p.mueve ? p.mueve.amp * Math.sin(p.mueve.vel * t + p.mueve.fase) : 0, eje = p.mueve && p.mueve.eje === 'y' ? 'y' : 'z';
  return { x: p.x, z: eje === 'z' ? p.z + off : p.z, y: eje === 'y' ? p.y + off : p.y, giro: p.gira ? p.gira.w * t + p.gira.fase : 0 };
}
// Cuánto sale un puño (0 = guardado, 1 = afuera del todo) en el segundo t, y si está PEGANDO (saliendo o afuera)
// Cada vuelta (periodo): sale rapidísimo (12 %), se queda afuera (18 %), vuelve despacio (30 %) y espera (40 %)
export function punoEn(f, t) {
  const u = ((((t + f.fase) % f.periodo) + f.periodo) % f.periodo) / f.periodo;
  if (u < 0.12) return { e: u / 0.12, pega: true };
  if (u < 0.3) return { e: 1, pega: true };
  if (u < 0.6) return { e: 1 - (u - 0.3) / 0.3, pega: false };
  return { e: 0, pega: false };
}
// Dónde está el guante (su centro) en el segundo t
export const guanteEn = (f, t) => ({ x: f.x, z: f.z - f.lado * punoEn(f, t).e * f.largo, y: f.y + 0.9 });
// ¿Te pegó un puño? pos = tus pies. Devuelve el empujón { x, y, z } (hacia donde pega, y para arriba) o null
// Pega TODO el puño: el guante y también el brazo (desde el poste hasta el guante). Tu cuerpo: 1 m de ancho, 0,6 de grueso y 2 de alto
export function golpePuno(pos, f, t, alto = 2) {
  const p = punoEn(f, t);
  if (!p.pega || p.e < 0.1) return null;
  const g = guanteEn(f, t), mano = CARRERA.puno.mano, cy = f.y + 0.9;
  if (pos.y > cy + mano || pos.y + alto < cy - mano) return null;   // por encima o por debajo
  const enGuante = Math.abs(pos.x - g.x) <= mano + 0.5 && Math.abs(pos.z - g.z) <= mano + 0.3;
  const z0 = Math.min(f.z, g.z), z1 = Math.max(f.z, g.z);
  const enBrazo = Math.abs(pos.x - f.x) <= 0.3 + 0.5 && pos.z >= z0 - 0.3 && pos.z <= z1 + 0.3;
  if (!enGuante && !enBrazo) return null;
  return { x: 0, y: CARRERA.puno.salto, z: -f.lado * CARRERA.puno.vel };
}
// 🚪 Las puertas de una fila: cuáles son de verdad (se rompen) y cuáles falsas. Depende de la semilla de la ronda
// (la misma para todos: la manda el servidor). Siempre hay al menos 2 de verdad y al menos 1 falsa
// Casi siempre hay UNA sola de verdad (a veces 2, muy pocas veces 3; nunca más): las demás son pared
export function puertasReales(semilla, fila, n) {
  const rnd = seededRandom((semilla >>> 0) * 31 + fila * 7919 + 1), u = rnd();
  const cuantas = Math.min(n - 1, u < 0.65 ? 1 : u < 0.92 ? 2 : 3), r = Array(n).fill(false);
  for (let k = 0; k < cuantas;) { const i = Math.floor(rnd() * n); if (!r[i]) { r[i] = true; k++; } }
  return r;
}
// Dónde está cada puerta de una fila: { z (su centro), ancho } (con pilares entre ellas)
export function lugaresPuertas(fila) {
  const largo = fila.z1 - fila.z0, paso = largo / fila.n;
  return Array.from({ length: fila.n }, (_, i) => ({ z: fila.z0 + paso * (i + 0.5), ancho: Math.min(CARRERA.puerta.ancho, paso - 0.4), paso }));
}
// 🥊 El PUÑO GUARDIÁN de cada fila de puertas: una viga con guantes arriba de las puertas. Si alguien pasa por ARRIBA
// (más alto que cualquier puerta), le pega hacia atrás: no se puede saltar por encima de las puertas. Cubre todo el ancho.
export const GUARDIAN = { medio: 2.5, desde: 4, vel: 20, salto: 6 };   // desde: 4 m sobre la pista (por una puerta nunca pasas tan alto)
export function golpeGuardian(pos, fila) {
  if (Math.abs(pos.x - fila.x) > GUARDIAN.medio || pos.y < CARRERA.y0 + GUARDIAN.desde || pos.z < fila.z0 - 1 || pos.z > fila.z1 + 1) return null;
  return { x: -GUARDIAN.vel, y: GUARDIAN.salto, z: 0 };
}
// ¿Estás dentro de un tubo de viento? Devuelve cuánto te lleva { x, z } (m/s) o null
export function vientoTubo(pos, tubos) {
  for (const u of tubos) if (pos.x >= u.x0 && pos.x <= u.x1 && Math.abs(pos.z - u.z) <= CARRERA.tubo.radio && pos.y >= u.y - 0.5 && pos.y <= u.y + CARRERA.tubo.radio * 2) return { x: u.vx, z: u.vz };
  return null;
}
// ¿Te barrió una barra de una rueda? La barra cruza la rueda entera (de un borde al otro) y gira con ella.
// Si te toca (y no la saltaste), te empuja hacia donde va la barra. Devuelve { x, y, z } o null
export function golpeBarra(pos, b, t) {
  if (pos.y > b.y + CARRERA.barra.alto || pos.y < b.y - 0.5) return null;   // saltaste por encima (o estás abajo)
  const a = b.w * t + b.fase, ux = Math.cos(a), uz = -Math.sin(a);   // (la misma cuenta que rotation.y de Three.js)
  const rx = pos.x - b.x, rz = pos.z - b.z, s = rx * ux + rz * uz;   // s: dónde estás a lo largo de la barra
  if (Math.abs(s) > b.r) return null;
  if (Math.abs(rx * uz - rz * ux) > CARRERA.barra.grueso + 0.45) return null;   // estás lejos de la barra
  // la barra se mueve "de costado": en el punto s va hacia (−sin a, −cos a) · w · s
  let vx = -Math.sin(a) * b.w * s, vz = -Math.cos(a) * b.w * s;
  const l = Math.hypot(vx, vz);
  if (l < 0.01) { vx = -uz; vz = ux; } else { vx /= l; vz /= l; }   // justo en el centro: igual te empuja de costado
  return { x: vx * CARRERA.barra.vel, y: CARRERA.barra.salto, z: vz * CARRERA.barra.vel };
}
// ¿En qué checkpoint vas? (por dónde vas en la pista: cada 30 m hay uno). 0 = la salida
export const checkpointDe = x => Math.max(0, Math.min(CARRERA.checkpoints, Math.floor(x / CARRERA.cada)));
// Dónde reapareces (o empiezas): en el checkpoint k, en tu carril (i de n), mirando hacia la meta
export function salidaCarrera(k, i = 0, n = 1) {
  const sep = Math.min(1.6, 13 / Math.max(1, n)), fila = n > 8 && i % 2 ? 1.6 : 0;   // (con muchos: en dos filas, para no quedar encimados)
  return { x: (k === 0 ? -1 : k * CARRERA.cada + 3) + fila, z: (i - (n - 1) / 2) * sep, y: CARRERA.y0 };
}
// ¿Llegaste a la meta? (pos desde el origen de la pista)
export const enMetaCarrera = pos => pos.x >= CARRERA.meta.x0 && pos.x <= CARRERA.meta.x1 + 0.5 && Math.abs(pos.z) <= CARRERA.meta.z + 0.5 && pos.y >= CARRERA.y0 - 0.5;
// ¿Te caíste de la pista?
export const seCayoCarrera = y => y < CARRERA.y0 - CARRERA.caida;
// El puesto de cada uno: primero los que llegaron (en orden) y después los demás según qué tan lejos van. → lista de ids
export function puestosCarrera(corredores, llegadas) {
  const resto = corredores.filter(c => !llegadas.includes(c.id)).sort((a, b) => b.x - a.x).map(c => c.id);
  return [...llegadas, ...resto];
}
// El origen de la pista (en el mundo)
export const origenCarrera = () => { const o = minigameOrigin(ESCUELA_K); return { x: o.x + CARRERA_X, z: o.z }; };
// 🛡️ Lo que vigila el servidor en la carrera. Lo más rápido: corres a 12, más lo que te llevan las plataformas
// (4 × 1,2 = 4,8 m/s) o el borde de un disco (3,6 × 1,1 ≈ 4 m/s), más un margen
export const CARRERA_VEL_MAX = 22, CARRERA_VEL = 14;   // (14: corriendo; 22: arriba de algo que se mueve)
const CARRERA_PISOS = pistaCarrera().plats.map(p => ({ x: p.x, z: p.z, mx: p.ancho / 2 + 8, mz: p.largo / 2 + (p.mueve ? p.mueve.amp : 0) + 8, top: p.y + (p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0) + (p.lanza ? 3 : 0) }));
// Lo más alto que hay debajo (o cerquita: 8 m) de x, z (desde el origen de la pista). Si no hay nada: el piso del mundo (0)
export function soporteCarrera(x, z) {
  let alto = 0;
  for (const p of CARRERA_PISOS) if (Math.abs(x - p.x) <= p.mx && Math.abs(z - p.z) <= p.mz && p.top > alto) alto = p.top;
  return alto;
}
// La zona de la carrera para el jugador i de n. cpMax: el checkpoint más lejano que el servidor sabe que alcanzaste
// (si te caes, solo puedes reaparecer en un checkpoint que ya alcanzaste: así nadie "reaparece" más adelante)
// pos: dónde lo tiene el servidor (si está en un tubo de viento, o cerquita, lo deja ir más rápido)
// Lo que hay justo debajo (o cerquita, con margen) en la pista: para saber si alguien camina sobre el aire
const CARRERA_BAJO = pistaCarrera().plats.map(p => { const hw = p.redonda ? p.r : p.ancho / 2, hd = (p.redonda ? p.r : p.largo / 2) + (p.mueve && p.mueve.eje !== 'y' ? p.mueve.amp : 0);
  const ay = p.mueve && p.mueve.eje === 'y' ? p.mueve.amp : 0;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, top: p.y + ay, ay }; });
// (las que suben y bajan: si su recorrido pasa por tus pies, cuentan a tu altura)
export function soporteBajoCarrera(x, z, y, margen = 0.6) {
  let alto = 0;
  for (const c of CARRERA_BAJO) {
    if (x < c.x0 - margen || x > c.x1 + margen || z < c.z0 - margen || z > c.z1 + margen) continue;
    const top = margen > 1 ? c.top : c.top - 2 * c.ay <= y + 0.5 ? Math.min(c.top, y) : -Infinity;
    if (top > alto) alto = top;
  }
  return alto;
}
// semilla: la de la ronda (dice qué puertas son de verdad: las falsas no se atraviesan, ni por el servidor)
export function zonaCarrera(i, n, cpMax = 0, pos = null, semilla = null) {
  const c = origenCarrera(), Y = CARRERA.y0, s = salidaCarrera(0, i, n);
  const enMovil = pos && CARRERA_BAJO.some((b, k) => (PISTA_CARRERA.plats[k].mueve || PISTA_CARRERA.plats[k].gira) && pos.x - c.x >= b.x0 - 3 && pos.x - c.x <= b.x1 + 3 && pos.z - c.z >= b.z0 - 3 && pos.z - c.z <= b.z1 + 3);
  const reales = semilla === null || semilla === undefined ? null : PISTA_CARRERA.puertas.map((f, k) => puertasReales(semilla, k, f.n));
  const cercaTubo = pos && PISTA_CARRERA.tubos.some(u => pos.x - c.x >= u.x0 - 4 && pos.x - c.x <= u.x1 + 4 && Math.abs(pos.z - c.z - u.z) <= CARRERA.tubo.radio + 4);
  return { x0: c.x - 12, x1: c.x + CARRERA.meta.x1 + 4, z0: c.z - 26, z1: c.z + 26, yMin: 0, yMax: Y + 4 + 6, velMax: (enMovil ? CARRERA_VEL_MAX : CARRERA_VEL) + (cercaTubo ? CARRERA.tubo.vel : 0), doble: true,
    llegada: { x: c.x + s.x, z: c.z + s.z, radio: 4 }, pisoLlegada: Y, saltos: [],
    soporte: (x, z) => soporteCarrera(x - c.x, z - c.z),
    // 🪂 nada de caminar sobre el aire: si no hay nada debajo y no bajas por más de 1,6 s, te caes
    soporteBajo: (x, z, y, margen) => soporteBajoCarrera(x - c.x, z - c.z, y, margen),
    // 🟡 los trampolines inclinados (verde y rojo): te lanzan (su salto: lo que sube con su velocidad hacia arriba)
    lanzadores: PISTA_CARRERA.lanzas.map(k => { const p = PISTA_CARRERA.plats[k]; return { x0: c.x + p.x - p.ancho / 2, x1: c.x + p.x + p.ancho / 2, z0: c.z + p.z - p.largo / 2, z1: c.z + p.z + p.largo / 2, top: p.y, salto: p.lanza.y ** 2 / 60 + 3 }; }),
    // 🚪 las puertas falsas son pared: cruzar la fila de puertas solo vale por una de verdad (y por abajo de la viga)
    cruce: (antes, p) => {
      if (!reales) return null;
      for (const [k, f] of PISTA_CARRERA.puertas.entries()) {
        const W = c.x + f.x, cruza = (antes.x < W - 0.3 && p.x > W - 0.3) || (antes.x > W + 0.3 && p.x < W + 0.3);
        if (!cruza || Math.min(antes.y, p.y) > Y + CARRERA.puerta.alto) continue;
        const zz = p.z - c.z, porReal = lugaresPuertas(f).some((q, j) => reales[k][j] && Math.abs(zz - q.z) <= q.ancho / 2 + 0.4);
        if (!porReal) return { x: antes.x < W ? W - 0.8 : W + 0.8, z: p.z };
      }
      return null;
    },
    // 🧱 en las zonas de puertas: entre las paredes (con un poquito de margen por lo que tarda internet). En el resto, te puedes caer
    limiteZ: x => { const t = corredorEn(x - c.x); return t && { z0: c.z + t.zmin - 0.6, z1: c.z + t.zmax + 0.6 }; },
    // Reaparecer: venías cayéndote (por debajo de la pista) y apareces arriba de un checkpoint que ya alcanzaste
    reaparecer: (antes, p) => {
      if (antes.y > Y - 2 || Math.abs(p.y - Y) > 1.5 || Math.abs(p.z - c.z) > 10) return false;
      for (let k = 0; k <= cpMax; k++) if (Math.abs(p.x - (c.x + salidaCarrera(k).x)) <= 7) return true;
      return false;
    } };
}
// ¿Vale el golpe que dice un jugador? (el servidor lo revisa con su última posición y el reloj de la ronda)
// o: el número del obstáculo (primero los puños, después las barras, después los trampolines). Devuelve el empujón (para dejarlo moverse más) o null
export function golpeValidoCarrera(o, pos, t) {
  const P = PISTA_CARRERA, c = origenCarrera(), rel = { x: pos.x - c.x, y: pos.y, z: pos.z - c.z };
  if (!Number.isInteger(o) || o < 0 || o >= P.punos.length + P.barras.length + P.lanzas.length + P.puertas.length) return null;
  if (o >= P.punos.length + P.barras.length + P.lanzas.length) {   // el puño guardián de una fila de puertas: tienes que estar cerca, arriba de las puertas
    const f = P.puertas[o - P.punos.length - P.barras.length - P.lanzas.length];
    if (Math.abs(rel.x - f.x) > GUARDIAN.medio + 3 || rel.y < CARRERA.y0 + GUARDIAN.desde - 2 || rel.z < f.z0 - 3 || rel.z > f.z1 + 3) return null;
    return { x: -GUARDIAN.vel, y: GUARDIAN.salto, z: 0 };
  }
  if (o >= P.punos.length + P.barras.length) {   // un trampolín: tienes que estar encima (o casi)
    const q = P.plats[P.lanzas[o - P.punos.length - P.barras.length]];
    if (Math.abs(rel.x - q.x) > q.ancho / 2 + 2 || Math.abs(rel.z - q.z) > q.largo / 2 + 2 || Math.abs(rel.y - q.y) > 2) return null;
    return { x: q.lanza.x, y: q.lanza.y, z: 0 };
  }
  if (o < P.punos.length) {
    const f = P.punos[o];
    if (Math.abs(rel.x - f.x) > 4 || Math.abs(rel.z) > 12 || Math.abs(rel.y - f.y) > 4) return null;
    for (const dt of [0, -0.15, -0.3, -0.45, -0.6, 0.15]) if (punoEn(f, t + dt).pega) return { x: 0, y: CARRERA.puno.salto, z: -f.lado * CARRERA.puno.vel };   // (un poquito antes o después: internet tarda)
    return null;
  }
  const b = P.barras[o - P.punos.length];
  if (Math.hypot(rel.x - b.x, rel.z - b.z) > b.r + 2 || Math.abs(rel.y - b.y) > 3) return null;
  // ¿la barra pasó de verdad cerca de ti? (un poquito antes o después, por lo que tarda internet: a menos de 2,5 m de la barra)
  const pasoCerca = [0, -0.15, -0.3, -0.45, -0.6, 0.15].some(d => {
    const an = b.w * (t + d) + b.fase, ux = Math.cos(an), uz = -Math.sin(an), rx = rel.x - b.x, rz = rel.z - b.z;
    return Math.abs(rx * ux + rz * uz) <= b.r + 1 && Math.abs(rx * uz - rz * ux) <= 2.5;
  });
  if (!pasoCerca) return null;
  const a = b.w * t + b.fase, s = (rel.x - b.x) * Math.cos(a) - (rel.z - b.z) * Math.sin(a);
  const dx = -Math.sin(a) * Math.sign(b.w * s || 1), dz = -Math.cos(a) * Math.sign(b.w * s || 1);
  return { x: dx * CARRERA.barra.vel, y: CARRERA.barra.salto, z: dz * CARRERA.barra.vel };
}
export const PISTA_CARRERA = pistaCarrera();
// 🧱 Las paredes invisibles: SOLO alrededor de las filas de puertas falsas (ahí nadie puede rodear las puertas por afuera).
// En el resto de la pista no hay paredes: ¡te puedes caer por los costados! (los puños, las barras y el viento te pueden tirar)
// Cubren desde 16 m antes hasta 16 m después de cada fila de puertas (más de lo que vuela un doble salto: ~20 m en total).
// Para cada metro: lo más a la izquierda y a la derecha que llega algo. Después se juntan los metros iguales en tramos.
// → [{ x0, x1, zmin, zmax }] (desde el origen de la pista)
export const PARED = { margen: 0.4, grosor: 0.6, abajo: 8, arriba: 12, antes: 16, despues: 16 };   // más alta que un doble salto desde el escalón alto
export function corredorCarrera() {
  const P = PISTA_CARRERA, x0 = -8, x1 = Math.ceil(CARRERA.meta.x1), lados = [];
  for (let x = x0; x < x1; x++) {
    let zmin = Infinity, zmax = -Infinity;
    for (const p of P.plats) {
      const hw = p.redonda ? p.r : p.ancho / 2, hd = p.redonda ? p.r : p.largo / 2 + (p.mueve && p.mueve.eje !== 'y' ? p.mueve.amp : 0);
      if (p.x + hw > x && p.x - hw < x + 1) { zmin = Math.min(zmin, p.z - hd); zmax = Math.max(zmax, p.z + hd); }
    }
    lados.push(zmin === Infinity ? null : { zmin, zmax });
  }
  // los huecos: la pared sigue como la del lado más ancho de los dos (la de antes y la de después)
  const lleno = lados.map((l, i) => {
    if (l) return l;
    let a = i, b = i; while (a >= 0 && !lados[a]) a--; while (b < lados.length && !lados[b]) b++;
    const A = lados[a] || lados[b], B = lados[b] || lados[a];
    return { zmin: Math.min(A.zmin, B.zmin), zmax: Math.max(A.zmax, B.zmax) };
  });
  const tramos = [], enPuertas = x => P.puertas.some(f => x >= f.x - PARED.antes && x < f.x + PARED.despues);
  lleno.forEach((l, i) => {
    if (!enPuertas(x0 + i)) return;   // solo en las zonas de puertas
    const zmin = l.zmin - PARED.margen, zmax = l.zmax + PARED.margen, u = tramos[tramos.length - 1];
    if (u && u.x1 === x0 + i && Math.abs(u.zmin - zmin) < 1e-6 && Math.abs(u.zmax - zmax) < 1e-6) u.x1 = x0 + i + 1;
    else tramos.push({ x0: x0 + i, x1: x0 + i + 1, zmin, zmax });
  });
  return tramos;
}
export const CORREDOR_CARRERA = corredorCarrera();
// ¿Entre qué z puedes estar en el metro x? (null si ahí no hay paredes: afuera de las zonas de puertas)
export function corredorEn(x) {
  for (const t of CORREDOR_CARRERA) if (x >= t.x0 && x < t.x1) return t;
  return null;
}
// El checkpoint siguiente, EN ORDEN: solo sube de a uno (si apareces más adelante de golpe, no cuenta)
export const siguienteCheckpoint = (cp, x) => (checkpointDe(x) === cp + 1 ? cp + 1 : cp);

// ---------- 🔶 Spleef (como Hex-A-Gone): otra silla del Modo Escuela ----------
// Una arena redonda GIGANTE (100 m de ancho) con el piso hecho de HEXÁGONOS. Cuando pisas uno, al ratito se empieza a hundir
// y se cae. Hay 6 CAPAS una encima de otra (6 etapas): si se te cae el piso, caes a la de abajo. Si te caes de la última… ¡quedas afuera!
// Gana el último que queda arriba. Cada hexágono sigue SÓLIDO hasta que se hundió 2 m (después ya no te sostiene y desaparece).
export const SPLEEF_X = 3700;   // dentro del minijuego del Modo Escuela, lejos de todo lo demás (la Carrera está en 3000)
export const SPLEEF = {
  R: 2,             // el "radio" de un hexágono (del centro a una punta): mide 3,5 m de lado a lado
  radio: 50,        // la arena mide 100 m de ancho
  capas: 6, y0: 62, sep: 10,   // la capa de arriba está a 62 m; cada una 10 m más abajo (la última, a 12 m)
  fuera: 6,         // más abajo que esto: ¡quedaste afuera!
  espera: 0.35,     // cuánto tarda en empezar a hundirse después de que lo pisas (segundos)
  cae: 8,           // qué tan rápido se acelera hacia abajo (m/s²)
  solidoHasta: 2,   // te sostiene hasta que se hundió 2 m
  bots: 5, bateriaRespuesta: 3000, maxMs: 360000,
  palco: { x: 0, z: -60, y: 70, ancho: 20, largo: 8 },   // donde miran los que quedaron afuera (arriba, al costado)
  colores: [0xff6fb5, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0x9775fa],   // una por capa (de arriba hacia abajo)
};
// La altura de la capa k (0 = la de arriba)
export const capaY = k => SPLEEF.y0 - k * SPLEEF.sep;
// Los hexágonos de una capa (todas las capas tienen los mismos): { q, r, x, z }. Puntas hacia z (como CylinderGeometry de 6 lados)
// x = R·√3·(q + r/2) · z = R·1,5·r
const RAIZ3 = Math.sqrt(3);
export const HEXES = (() => {
  const R = SPLEEF.R, n = Math.ceil(SPLEEF.radio / (R * 1.5)) + 1, out = [];
  for (let r = -n; r <= n; r++) for (let q = -2 * n; q <= 2 * n; q++) {
    const x = R * RAIZ3 * (q + r / 2), z = R * 1.5 * r;
    if (Math.hypot(x, z) <= SPLEEF.radio - R) out.push({ q, r, x, z });
  }
  return out;
})();
const HEX_INDICE = new Map(HEXES.map((h, i) => [h.q + ',' + h.r, i]));
// ¿Qué hexágono hay en (x, z)? (desde el centro de la arena) → su número, o -1 si ahí no hay ninguno
export function hexEn(x, z) {
  const R = SPLEEF.R, qf = (RAIZ3 / 3 * x - z / 3) / R, rf = (2 / 3 * z) / R, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;   // (el redondeo de las coordenadas "cúbicas")
  const i = HEX_INDICE.get(q + ',' + r);
  return i === undefined ? -1 : i;
}
// Cuánto se hundió un hexágono que pisaron hace dt segundos (al principio nada; después cae cada vez más rápido)
export const hundido = dt => (dt < SPLEEF.espera ? 0 : 0.5 * SPLEEF.cae * (dt - SPLEEF.espera) ** 2);
// ¿Todavía te sostiene? (pisado: el segundo en que lo pisaron, o null si nadie lo pisó)
export const hexSolido = (pisado, t) => pisado === null || pisado === undefined || hundido(t - pisado) < SPLEEF.solidoHasta;
// ¿Todavía se ve? (cae hasta 20 m y desaparece)
export const hexSeVe = (pisado, t) => pisado === null || pisado === undefined || hundido(t - pisado) < 20;
// El piso que tienes debajo: la capa más alta con un hexágono sólido debajo de (x, z) que no esté más arriba que tus pies (+ un escaloncito)
// pisadas: una lista por capa (Map: número de hexágono → segundo en que lo pisaron). Devuelve { capa, i, top } o null
export function pisoSpleef(x, z, pies, pisadas, t, escalon = 0.3) {
  const i = hexEn(x, z); if (i < 0) return null;
  for (let k = 0; k < SPLEEF.capas; k++) {
    const p = pisadas[k] && pisadas[k].get(i), top = capaY(k) - (p === undefined ? 0 : hundido(t - p));
    if (top <= pies + escalon && hexSolido(p, t)) return { capa: k, i, top };
  }
  return null;
}
// Dónde empieza el jugador i de n: en un círculo de 18 m en la capa de arriba
export function salidaSpleef(i, n) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: Math.cos(a) * 18, z: Math.sin(a) * 18, y: capaY(0) };
}
// ¿Quedaste afuera? (más abajo que la última capa)
export const fueraSpleef = y => y < SPLEEF.fuera;
// En qué capa estás (por tu altura): 0 = arriba … 5 = la última
export const capaDe = y => Math.max(0, Math.min(SPLEEF.capas - 1, Math.round((SPLEEF.y0 - y) / SPLEEF.sep)));
export const origenSpleef = () => { const o = minigameOrigin(ESCUELA_K); return { x: o.x + SPLEEF_X, z: o.z }; };
// 🛡️ Lo que vigila el servidor: corres a 12 (más un margen); de la arena no se sale; empiezas en tu lugar de la capa de arriba
export function zonaSpleef(i, n) {
  const c = origenSpleef(), s = salidaSpleef(i, n), m = SPLEEF.radio + 2;
  return { x0: c.x - m, x1: c.x + m, z0: c.z - m, z1: c.z + m, yMin: 0, yMax: capaY(0) + 6, velMax: 15, doble: true,
    llegada: { x: c.x + s.x, z: c.z + s.z, radio: 4 }, pisoLlegada: capaY(0), saltos: [] };
}
// ¿Vale que el jugador diga que pisó el hexágono i de la capa k? Solo si está cerca (con su posición en el servidor) y a esa altura
export function pisadaValida(k, i, pos) {
  if (!Number.isInteger(k) || k < 0 || k >= SPLEEF.capas || !Number.isInteger(i) || i < 0 || i >= HEXES.length) return false;
  const c = origenSpleef(), h = HEXES[i];
  return Math.hypot(pos.x - c.x - h.x, pos.z - c.z - h.z) <= SPLEEF.R * 2 && Math.abs(pos.y - capaY(k)) <= 3;
}

// ---------- 🎵 La música: se inventa sola mientras juegas (cada lugar con su canción) ----------
// Nada de archivos: cada compás (4 tiempos) se arma con números. Una "canción" es: una nota base (raiz, en MIDI: 60 = DO 4),
// una escala, una velocidad (bpm), unas vueltas de acordes (progresiones, en grados de la escala: 0 = I, 3 = IV, 4 = V…)
// y los instrumentos. Cada 16 compases (~30 a 60 s) cambia de SECCIÓN: otra vuelta de acordes, otra melodía, y a veces
// una parte tranquila sin batería. Y la INTENSIDAD (0 a 1) cambia según lo que pasa: más batería, más notas, más rápido.
export const ESCALAS = {
  mayor: [0, 2, 4, 5, 7, 9, 11], menor: [0, 2, 3, 5, 7, 8, 10], dorica: [0, 2, 3, 5, 7, 9, 10], frigia: [0, 1, 3, 5, 7, 8, 10],
  lidia: [0, 2, 4, 6, 7, 9, 11], mixolidia: [0, 2, 4, 5, 7, 9, 10],
};
export const midiAFrecuencia = m => 440 * 2 ** ((m - 69) / 12);
// bateria: 'nada' | 'suave' | 'normal' | 'fiesta' · corto: notas cortitas (como pellizcar cuerdas) · vol: qué tan fuerte
export const MUSICAS = {
  mundoDia:   { nombre: 'Tu mundo (día)', raiz: 60, escala: 'mayor', bpm: 92, bpmNormal: 124, progresiones: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5]], timbres: { bajo: 'triangle', acorde: 'sine', melodia: 'triangle' }, bateria: 'suave', vol: 1 },
  mundoNoche: { nombre: 'Tu mundo (noche)', raiz: 57, escala: 'dorica', bpm: 68, bpmNormal: 96, progresiones: [[0, 3, 0, 4], [5, 3, 0, 4]], timbres: { bajo: 'triangle', acorde: 'sine', melodia: 'triangle' }, bateria: 'nada', vol: 1 },
  salon:      { nombre: 'El salón', raiz: 65, escala: 'mayor', bpm: 104, bpmNormal: 115, progresiones: [[0, 5, 1, 4], [0, 3, 4, 0]], timbres: { bajo: 'triangle', acorde: 'triangle', melodia: 'square' }, bateria: 'suave', corto: true, vol: 0.7 },
  torre:      { nombre: 'No mires abajo', raiz: 62, escala: 'dorica', bpm: 110, bpmNormal: 125, progresiones: [[0, 6, 5, 6], [0, 3, 6, 4], [5, 6, 0, 0]], timbres: { bajo: 'sawtooth', acorde: 'triangle', melodia: 'square' }, bateria: 'normal', vol: 0.75 },
  escondidas: { nombre: 'Escondidas', raiz: 64, escala: 'menor', bpm: 92, bpmNormal: 110, progresiones: [[0, 5, 6, 4], [0, 3, 0, 4]], timbres: { bajo: 'triangle', acorde: 'sine', melodia: 'triangle' }, bateria: 'suave', corto: true, vol: 0.75 },
  atrapadas:  { nombre: 'Atrapadas Nocivas', raiz: 55, escala: 'frigia', bpm: 124, bpmNormal: 130, progresiones: [[0, 1, 0, 6], [0, 6, 5, 1]], timbres: { bajo: 'sawtooth', acorde: 'sawtooth', melodia: 'square' }, bateria: 'normal', vol: 0.65 },
  carrera:    { nombre: 'Carrera', raiz: 58, escala: 'mayor', bpm: 138, bpmNormal: 150, progresiones: [[0, 4, 5, 3], [3, 4, 0, 0], [5, 3, 0, 4]], timbres: { bajo: 'square', acorde: 'triangle', melodia: 'square' }, bateria: 'fiesta', corto: true, vol: 0.7 },
  spleef:     { nombre: 'Spleef', raiz: 61, escala: 'lidia', bpm: 128, bpmNormal: 140, progresiones: [[0, 1, 0, 4], [5, 1, 0, 4]], timbres: { bajo: 'square', acorde: 'triangle', melodia: 'triangle' }, bateria: 'fiesta', corto: true, vol: 0.7 },
  sandbox:    { nombre: 'Sandbox', raiz: 60, escala: 'lidia', bpm: 84, bpmNormal: 104, progresiones: [[0, 1, 4, 0], [5, 1, 0, 0]], timbres: { bajo: 'triangle', acorde: 'sine', melodia: 'sine' }, bateria: 'nada', vol: 0.95 },
  nave:       { nombre: 'Nave entre sospechas', raiz: 57, escala: 'lidia', bpm: 76, bpmNormal: 96, progresiones: [[0, 1, 0, 5], [3, 1, 4, 0]], timbres: { bajo: 'sine', acorde: 'sine', melodia: 'triangle' }, bateria: 'nada', vol: 0.9 },   // 🚀 tranquila, como flotar en el espacio
  minijuego:  { nombre: 'Minijuego', raiz: 67, escala: 'mayor', bpm: 120, bpmNormal: 128, progresiones: [[0, 3, 4, 3], [0, 5, 3, 4]], timbres: { bajo: 'square', acorde: 'triangle', melodia: 'square' }, bateria: 'normal', corto: true, vol: 0.65 },
};
// ¿Qué canción va aquí? modo: el minijuego (null = tu mundo) · fase: dónde estás en la escuela · noche: en tu mundo de noche
export function lugarMusica({ modo = null, fase = null, noche = false } = {}) {
  if (!modo) return noche ? 'mundoNoche' : 'mundoDia';
  if (modo === 'sandbox') return 'sandbox';
  if (modo === 'escuela') return { nomires: 'torre', escondidas: 'escondidas', atrapadas: 'atrapadas', carrera: 'carrera', spleef: 'spleef', nave: 'nave' }[fase] || 'salon';
  return 'minijuego';
}
const entre01 = x => Math.max(0, Math.min(1, x));
// Qué tan intensa tiene que estar la música (0 tranquila … 1 a todo) según lo que pasa
//  atrapadas: tengo (¿tengo la mancha?), faltaMs · escondidas: persiguen (¿me están persiguiendo?), cuenta (¿cuenta regresiva para esconderse?)
//  carrera: puesto, x (metros) · spleef: capa (0 arriba … 5), quedan, total · torre: etapa (1 a 10)
export function intensidadMusica(lugar, d = {}) {
  switch (lugar) {
    case 'atrapadas': return d.tengo ? (d.faltaMs < 5000 ? 1 : 0.75) : 0.35;
    case 'escondidas': return d.persiguen ? 1 : d.cuenta ? 0.45 : 0.3;
    case 'carrera': return d.x > 240 || d.puesto === 1 ? 0.9 : 0.5;
    case 'spleef': return entre01(0.3 + 0.7 * Math.max((d.capa || 0) / 5, d.total > 1 ? 1 - (d.quedan - 1) / (d.total - 1) : 0));
    case 'torre': return entre01(0.2 + 0.09 * ((d.etapa || 1) - 1));
    case 'mundoNoche': return 0.1;
    case 'mundoDia': case 'sandbox': case 'nave': return 0.25;
    default: return 0.4;
  }
}
// Un número al azar que siempre sale igual con la misma semilla (para que la melodía de una sección se repita y se pueda tararear)
function semillaDe(texto, n) { let h = 2166136261 ^ n; for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619); return h >>> 0; }
function azarFijo(s) { return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const COMPASES_POR_SECCION = 16;
// La nota MIDI del grado g de la escala (puede ser negativo o pasar de 7: cambia de octava)
export function notaDeGrado(M, g) {
  const E = ESCALAS[M.escala], oct = Math.floor(g / E.length), i = ((g % E.length) + E.length) % E.length;
  return M.raiz + oct * 12 + E[i];
}
// El compás número n de la canción id: { bpm, tiempos: 4, notas: [{ t (en tiempos), dur (en tiempos), midi, voz, vel }] }
// voz: 'bajo' | 'acorde' | 'arpegio' | 'melodia' | 'bombo' | 'caja' | 'hihat' | 'tic' | 'campana' | 'platillo'
// azar: para las variaciones chiquitas (cada vez distinto) · extra: { tic (cuenta regresiva), invierno (cascabeles), estilo: 'normal' | 'lofi' }
// Dos estilos: NORMAL (rápido y bailable: el de siempre) y LOFI (lento y tranquilo, con swing: el primero que hicimos)
export const ESTILOS_MUSICA = ['normal', 'lofi'];
export const leerEstilo = texto => (texto === 'lofi' ? 'lofi' : 'normal');
export function compasMusica(id, n, intensidad = 0.3, azar = Math.random, extra = {}) {
  return extra.estilo === 'lofi' ? compasLofi(id, n, intensidad, azar, extra) : compasNormal(id, n, intensidad, azar, extra);
}
// 🎧 Lofi: lento, con "swing" (las corcheas de a contratiempo llegan un poquito tarde, como tocado por una persona relajada)
export const SWING = 0.08;
function compasLofi(id, n, intensidad, azar, extra) {
  const c = compasLento(id, n, intensidad, azar, extra);
  for (const x of c.notas) if (Math.abs((x.t % 1) - 0.5) < 1e-9) x.t += SWING;
  return c;
}
// 🎵 Normal: rápido, con bajo que camina, un "gancho" pegadizo que pregunta y responde, batería con síncopas,
// redobles cada 4 compases, una subida (build) al final de algunas secciones y ¡un platillo! cuando arranca la siguiente (drop)
const BAJOS = [[0, 0, 4, 0, 7, 0, 4, 2], [0, 7, 0, 4, 0, 7, 5, 4], [0, 0, 2, 4, 5, 4, 2, 1]];   // (en grados de la escala, sobre el acorde)
const BOMBOS = [[0, 1.5, 2], [0, 0.75, 2, 2.5], [0, 1.5, 2.5], [0, 2, 2.75]];
function compasNormal(id, n, intensidad, azar, extra) {
  const M = MUSICAS[id], I = entre01(intensidad), seccion = Math.floor(n / COMPASES_POR_SECCION), en = n % COMPASES_POR_SECCION;
  const prog = M.progresiones[seccion % M.progresiones.length], grado = prog[en % prog.length], siguiente = prog[(en + 1) % prog.length];
  const fijo = azarFijo(semillaDe(id + '!', seccion));
  const descanso = seccion % 4 === 3 && I < 0.7, sube = seccion % 2 === 1 && en >= 12, platillo = en === 0 && seccion > 0;
  const notas = [], add = (t, dur, midi, voz, vel) => notas.push({ t, dur, midi, voz, vel: Math.min(1, vel) });
  // Bajo que camina (corcheas); la última va de camino al acorde que viene
  const patron = BAJOS[Math.floor(fijo() * BAJOS.length)];
  patron.forEach((g, k) => add(k / 2, 0.42, notaDeGrado(M, (k === 7 ? siguiente - 1 : grado + g)) - 12, 'bajo', k % 2 ? 0.75 : 0.95));
  // Acordes: golpecitos a contratiempo (suena saltarín); con acción, además un arpegio en semicorcheas
  const acorde = [0, 2, 4].map(k => notaDeGrado(M, grado + k));
  for (const t of [0.5, 1.5, 2.5, 3.5]) for (const m of acorde) add(t, 0.28, m, 'acorde', 0.55);
  if (I >= 0.5) for (let k = 0; k < 16; k++) add(k / 4, 0.2, acorde[k % 3] + 12 * (k % 8 >= 4 ? 1 : 0), 'arpegio', 0.45 + 0.4 * I);
  // El gancho: 8 corcheas fijas por sección. Compases pares = la PREGUNTA; impares = la RESPUESTA (el mismo ritmo, otras notas, termina en la nota del acorde)
  const motivo = Array.from({ length: 8 }, () => ({ suena: fijo() < 0.55 + 0.3 * I, paso: [0, 2, 4, 7, 4, 2, 1, 3][Math.floor(fijo() * 8)] }));
  const respuesta = en % 2 === 1;
  if (!(descanso && en % 4 >= 2)) motivo.forEach((p, k) => {
    if (!p.suena && !(respuesta && k === 6)) return;
    let g = grado + (respuesta ? (k === 6 ? 7 : 4 - p.paso % 5) : p.paso);
    if (azar() < 0.12) g += azar() < 0.5 ? 1 : -1;
    add(k / 2, M.corto ? 0.3 : 0.45, notaDeGrado(M, g) + 12, 'melodia', 0.7 + 0.3 * I);
  });
  // Batería
  if (!descanso) {
    const bombo = I > 0.75 ? [0, 1, 2, 3, 3.5] : BOMBOS[Math.floor(fijo() * BOMBOS.length)];
    if (!(sube && en === 15)) for (const t of bombo) add(t, 0.2, 36, 'bombo', 0.95);   // (en el último compás de la subida: sin bombo… ¡y después el drop!)
    const redoble = en % 4 === 3 || (sube && en >= 14);
    if (redoble) { const paso = sube && en === 15 ? 0.125 : 0.25, desde = sube && en >= 14 ? 0 : 3; for (let t = desde; t < 4; t += paso) add(t, 0.1, 38, 'caja', 0.5 + 0.5 * (t / 4)); }
    else for (const t of [1, 3]) add(t, 0.2, 38, 'caja', 0.9);
    const paso = I > 0.6 || sube ? 0.25 : 0.5;
    for (let t = 0; t < 4; t += paso) add(t, 0.08, 42, extra.invierno ? 'campana' : 'hihat', t % 1 === 0.5 ? 0.75 : 0.45);
  }   // (en la parte tranquila: sin batería)
  if (platillo) add(0, 2, 49, 'platillo', 0.8);
  if (extra.tic) for (let t = 0; t < 4; t++) add(t, 0.05, 84, 'tic', t === 0 ? 1 : 0.6);
  return { bpm: Math.round(M.bpmNormal * (1 + 0.08 * I)), tiempos: 4, notas };
}
// (el de antes: lento y tranquilo — ahora es la base del estilo Lofi)
function compasLento(id, n, intensidad = 0.3, azar = Math.random, extra = {}) {
  const M = MUSICAS[id], I = entre01(intensidad), seccion = Math.floor(n / COMPASES_POR_SECCION), enSeccion = n % COMPASES_POR_SECCION;
  const prog = M.progresiones[seccion % M.progresiones.length], grado = prog[enSeccion % prog.length];
  const tranquila = seccion % 4 === 3 && I < 0.7;   // cada 4 secciones, una parte tranquila (sin batería) — salvo que esté todo muy intenso
  const notas = [], add = (t, dur, midi, voz, vel) => notas.push({ t, dur, midi, voz, vel });
  // Bajo: la nota del acorde, abajo. Con más intensidad, corcheas
  const bajo = notaDeGrado(M, grado) - 12;
  if (I > 0.6) for (let k = 0; k < 8; k++) add(k / 2, 0.45, bajo + (k % 2 && azar() < 0.3 ? 12 : 0), 'bajo', 0.8);
  else { add(0, 1.8, bajo, 'bajo', 0.9); add(2, 1.8, azar() < 0.25 ? bajo + 7 : bajo, 'bajo', 0.8); }
  // Acorde: tres notas largas (o arpegio cuando hay acción: la "capa de persecución")
  const acorde = [0, 2, 4].map(k => notaDeGrado(M, grado + k));
  if (I >= 0.5) for (let k = 0; k < 8; k++) add(k / 2, 0.4, acorde[k % 3] + (k >= 4 ? 12 : 0), 'arpegio', 0.6 + 0.3 * I);
  else for (const m of acorde) add(0, 3.9, m, 'acorde', 0.5);
  // Melodía: un motivo de 8 corcheas por sección (se repite → se puede tararear), con variaciones chiquitas en cada compás
  const fijo = azarFijo(semillaDe(id, seccion)), alto = seccion % 2 ? 7 : 0, densidad = 0.35 + 0.45 * I;
  const motivo = Array.from({ length: 8 }, () => ({ suena: fijo() < densidad, paso: [0, 2, 4, 7, 4, 2][Math.floor(fijo() * 6)] }));
  if (!(tranquila && enSeccion % 2)) motivo.forEach((p, k) => {
    if (!p.suena) return;
    let g = grado + p.paso + alto;
    if (azar() < 0.2) g += azar() < 0.5 ? 1 : -1;   // la variación chiquita
    add(k / 2, M.corto ? 0.35 : 0.9, notaDeGrado(M, g) + 12, 'melodia', 0.55 + 0.35 * I);
  });
  // Batería
  const estilo = tranquila ? 'nada' : M.bateria;
  if (estilo !== 'nada') {
    const golpes = estilo === 'fiesta' || I > 0.7 ? [0, 1, 2, 3] : estilo === 'normal' ? [0, 2, 2.5] : [0, 2];
    for (const t of golpes) add(t, 0.2, 36, 'bombo', 0.9);
    if (estilo !== 'suave' || I > 0.5) for (const t of [1, 3]) add(t, 0.2, 38, 'caja', 0.7 + 0.3 * I);
    const paso = I > 0.75 ? 0.25 : 0.5;
    if (estilo === 'fiesta' || I > 0.3) for (let t = 0; t < 4; t += paso) add(t, 0.1, 42, extra.invierno ? 'campana' : 'hihat', t % 1 ? 0.4 : 0.6);
  }
  if (extra.tic) for (let t = 0; t < 4; t++) add(t, 0.05, 84, 'tic', t === 0 ? 1 : 0.6);   // tic-tac de la cuenta regresiva
  return { bpm: Math.round(M.bpm * (1 + 0.12 * I)), tiempos: 4, notas };
}
// Volumen de la música: los pasos del botón 🎵 (de más a menos) y el que viene después
export const VOLUMENES_MUSICA = [1, 0.6, 0.3, 0];
export const siguienteVolumen = v => VOLUMENES_MUSICA[(Math.max(0, VOLUMENES_MUSICA.indexOf(v)) + 1) % VOLUMENES_MUSICA.length];
export const leerVolumen = texto => { if (texto === null || texto === undefined || texto === '') return 0.6; const v = Number(texto); return VOLUMENES_MUSICA.includes(v) ? v : 0.6; };

// ---------- 🍂❄️☀️🌸 Las estaciones (el calendario de Mathias, todos los años, con la fecha de la compu) ----------
//  otoño: del 31 de octubre al 25 de noviembre · invierno: diciembre y enero · verano: marzo · primavera: mayo y julio
//  Los demás días: el mundo de siempre (null)
export function temporada(fecha) {
  const m = fecha.getMonth() + 1, d = fecha.getDate();
  if ((m === 10 && d === 31) || (m === 11 && d <= 25)) return 'otono';
  if (m === 12 || m === 1) return 'invierno';
  if (m === 3) return 'verano';
  if (m === 5 || m === 7) return 'primavera';
  return null;
}
// Para probar: ?temporada=otono (o invierno, verano, primavera, ninguna). Si no viene nada (o algo raro): la de la fecha
export function temporadaDe(fecha, param) {
  if (param === 'ninguna') return null;
  return ['otono', 'invierno', 'verano', 'primavera'].includes(param) ? param : temporada(fecha);
}
// Cómo se ve cada estación. suelo: los colores de la textura del pasto · matas: el pasto · hojas: las copas redondas (pinos: los pinos)
// cielo + mezcla: un tinte del cielo · sol: más o menos fuerte, y su color · caen: lo que cae del cielo · adorno: lo que hay en el pasto
export const TEMPORADAS = {
  otono: { nombre: 'Otoño', suelo: { base: '#7a8f3a', manchas: ['rgba(150,110,40,.35)', 'rgba(120,140,50,.3)'], hojitas: ['#8a8a30', '#a08a3a', '#6f8a2e', '#b0903a'] },
    matas: [0x9a9a3a, 0xb09040, 0x8a8a35, 0xa8a045], hojas: [0xd9622b, 0xe8a23a, 0xb8442a], pinos: [0x3f7a3a, 0x4a7f35, 0x355f2a],
    cielo: 0xffd9a8, mezcla: 0.12, sol: 1.05, solColor: 0xffe2b8, caen: { tipo: 'hoja', n: 160, colores: [0xd9622b, 0xe8a23a, 0xb8442a, 0x8a5a2b] },
    suelto: { tipo: 'hoja', n: 1600, colores: [0xd9622b, 0xe8a23a, 0xb8442a, 0x8a5a2b, 0xf0c040] }, adorno: 'calabaza', flores: null },
  invierno: { nombre: 'Invierno', suelo: { base: '#e9f0f5', manchas: ['rgba(200,215,235,.5)', 'rgba(255,255,255,.6)'], hojitas: ['#d5e0ea', '#c8d6e3', '#f4f8fb', '#b9c9d8'] },
    matas: [0xdde8f0, 0xcfdde8, 0xeef4f8, 0xc5d5e2], hojas: [0xeef4f8, 0xdfe9f0, 0xf6fafc], pinos: [0x2c5e45, 0x2f6a4a, 0x264f3a],
    cielo: 0xdfeeff, mezcla: 0.35, sol: 0.95, solColor: 0xe6f0ff, caen: { tipo: 'nieve', n: 500, colores: [0xffffff] },
    suelto: { tipo: 'nieve', n: 900, colores: [0xffffff, 0xf2f7fb] }, adorno: 'muneco', flores: null, nieveEnPinos: true },
  verano: { nombre: 'Verano', suelo: { base: '#66b23a', manchas: ['rgba(90,170,50,.35)', 'rgba(170,210,80,.3)'], hojitas: ['#5aa836', '#7cc753', '#4b9a2e', '#93d35a'] },
    matas: [0x6dbb45, 0x7cc753, 0x5fb03a, 0x8fd060], hojas: [0x2f9a3a, 0x3fb04a, 0x2a8a35], pinos: [0x2a7d35, 0x2f8f3a, 0x2a7d35],
    cielo: 0xfff0c8, mezcla: 0.15, sol: 1.18, solColor: 0xfff1d6, caen: null, suelto: null, adorno: 'sombrilla',
    flores: { n: 700, colores: [0xff5a5a, 0xffd43b, 0xff8a3d, 0xffffff, 0xd25bff] } },
  primavera: { nombre: 'Primavera', suelo: { base: '#5fb03a', manchas: ['rgba(80,160,50,.35)', 'rgba(130,200,80,.25)'], hojitas: ['#4b9a2e', '#6dbb45', '#3f8a28', '#7cc753'] },
    matas: [0x5fb03a, 0x6dbb45, 0x4fa232, 0x7cc753], hojas: [0xffb7d5, 0xffffff, 0xff9fc7], pinos: [0x2f8f3a, 0x3aa346, 0x2a7d35],
    cielo: 0xffe6f2, mezcla: 0.1, sol: 1.05, solColor: 0xfff6f0, caen: { tipo: 'petalo', n: 120, colores: [0xffb7d5, 0xffffff, 0xff9fc7] },
    suelto: null, adorno: 'mariposa', flores: { n: 900, colores: [0xff6fb5, 0xffffff, 0xffd43b, 0xb48cff, 0x4dabf7] } },
};
// Lo que cae del cielo, alrededor tuyo: dónde está la partícula i en el segundo t (cae, se mece y vuelve a empezar arriba)
// caja: el cubo alrededor tuyo (ancho y alto) · vel: qué tan rápido cae · Devuelve { x, y, z, giro } (relativo a ti)
export function particulaEstacion(i, t, tipo, caja = { ancho: 60, alto: 22 }) {
  const r = seededRandom(i * 9301 + 49297), x0 = (r() - 0.5) * caja.ancho, z0 = (r() - 0.5) * caja.ancho, fase = r() * 100;
  const vel = tipo === 'nieve' ? 1.6 + r() * 0.8 : tipo === 'petalo' ? 1 + r() * 0.6 : 1.3 + r() * 0.7, meneo = tipo === 'nieve' ? 0.6 : 1.4;
  const y = caja.alto - (((t * vel + fase) % caja.alto) + caja.alto) % caja.alto;
  return { x: x0 + Math.sin(t * 0.9 + fase) * meneo, y, z: z0 + Math.cos(t * 0.7 + fase) * meneo, giro: t * 2 + fase };
}

// ---------- ⚙️ Calidad: para que el juego vaya fluido también en compus más lentas ----------
// ratioMax: cuántos píxeles por punto de la pantalla · sombras · sombraMapa: el tamaño del mapa de sombras · niebla: hasta dónde se ve
// pasto / flores: cuántas matas y florecitas · extra: cuántas decoraciones de la estación (× 1, 0,6…) · particulas: lo que cae del cielo
export const CALIDADES = {
  alta: { nombre: 'Alta', ratioMax: 2, sombras: true, sombraMapa: 2048, niebla: 320, pasto: 2500, flores: 300, extra: 1, particulas: 1 },
  media: { nombre: 'Media', ratioMax: 1.5, sombras: true, sombraMapa: 1024, niebla: 250, pasto: 1250, flores: 200, extra: 0.6, particulas: 0.6 },
  baja: { nombre: 'Baja', ratioMax: 1, sombras: false, sombraMapa: 512, niebla: 180, pasto: 450, flores: 90, extra: 0.3, particulas: 0.3 },
};
export const OPCIONES_CALIDAD = ['auto', 'alta', 'media', 'baja'];
export const leerCalidad = t => (OPCIONES_CALIDAD.includes(t) ? t : 'auto');
export const leerNivel = t => (t === 'alta' || t === 'media' || t === 'baja' ? t : null);
export const siguienteCalidad = c => OPCIONES_CALIDAD[(Math.max(0, OPCIONES_CALIDAD.indexOf(c)) + 1) % OPCIONES_CALIDAD.length];
// En "Auto", ¿con cuál empezamos? Con lo que dice la compu: núcleos del procesador, memoria (GB) y si es táctil (celular/tablet)
export function calidadInicial({ nucleos = 0, memoria = 0, tactil = false } = {}) {
  if ((memoria && memoria <= 2) || (nucleos && nucleos <= 2)) return 'baja';
  if (tactil || (memoria && memoria <= 4) || (nucleos && nucleos <= 4)) return 'media';
  return 'alta';
}
// Si va lento (menos de 30 cuadros por segundo) aun con la resolución más baja, baja un nivel. Nunca sube sola (para que no salte de un lado a otro)
export const bajarCalidad = (nivel, fps) => (fps >= 30 ? nivel : nivel === 'alta' ? 'media' : 'baja');

// 🧭 Hacia dónde mirar: si se está moviendo (más de 0,5 m/s de costado), hacia donde camina; si no, hacia donde dice su "rot"
// (así un amigo o un bot que manda siempre el mismo giro igual camina mirando para adelante, y no "deslizándose" de lado)
export const rumboDeMovimiento = (vx, vz, rot, umbral = 0.5) => (Math.hypot(vx, vz) > umbral ? Math.atan2(vx, vz) : rot);

// ---------- 🤖 Los bots de los modos (jugando solo): ALBERT siempre, y hasta 10 más, en este orden ----------
// color: el de su cuerpo · disfraz: el que lleva puesto (los de la tienda de Halloween) · sombrero: el de ALBERT
export const BOTS_SOLO = [
  { id: 'albert', nombre: 'ALBERT', color: 0x1f8a4c, sombrero: true },
  { id: 'amarillo', nombre: 'Amarillo', color: 0xffd43b },
  { id: 'rojo', nombre: 'Rojo', color: 0xe03131 },
  { id: 'azul', nombre: 'Azul', color: 0x1c7ed6 },
  { id: 'verde', nombre: 'Verde', color: 0x74d65a },
  { id: 'ghoul', nombre: 'Ghoul', color: 0xdfe6ee, disfraz: 'fantasmita' },   // (un fantasmita: blanco grisáceo)
  { id: 'naranja', nombre: 'Naranja', color: 0xff922b },
  { id: 'rosa', nombre: 'Rosa', color: 0xf783ac },
  { id: 'gris', nombre: 'Gris', color: 0x868e96 },
  { id: 'blanco', nombre: 'Blanco', color: 0xf8f9fa },
  { id: 'misterio', nombre: 'Misterio', color: 0x5f3dc4, disfraz: 'dulce' },   // (morado misterioso, con el disfraz "Qué dulce")
];
export const BOTS_MIN = 1, BOTS_MAX = BOTS_SOLO.length;
// Cuántos bots por modo si nunca elegiste (los de siempre)
export const BOTS_POR_MODO = { escondidas: 1, atrapadas: 4, carrera: 5, spleef: 5 };
export const limitarBots = n => { const v = Number(n); return Number.isFinite(v) ? Math.min(BOTS_MAX, Math.max(BOTS_MIN, Math.round(v))) : null; };
// Lo guardado (en el navegador): si no hay nada o algo raro, los de siempre de ese modo
export const leerBots = (texto, modo) => (texto === null || texto === undefined || texto === '' ? BOTS_POR_MODO[modo] : limitarBots(texto) ?? BOTS_POR_MODO[modo]);
// Los n bots que juegan (siempre empieza con ALBERT)
export const rosterBots = n => BOTS_SOLO.slice(0, limitarBots(n) ?? BOTS_MIN);

// ---------- 🚀 Nave entre sospechas: una nave espacial de diseño propio (fase 1: explorar y construir) ----------
// El plano: salas rectangulares (en metros enteros, desde el origen de la nave) unidas por un pasillo central largo.
// Diseño nuestro: la nave es como una flecha que apunta hacia +x (el puente de mando adelante y los motores atrás).
export const NAVE_X = 4500;   // dentro del minijuego del Modo Escuela, lejos de todo lo demás
export const NAVE = { alto: 5, grosor: 0.3, puerta: 3, vuelo: 7, sube: 7 };
export const SALAS_NAVE = [
  { id: 'pasillo', nombre: 'Pasillo central', x0: 8, x1: 62, z0: -3, z1: 3, color: 0x5c6f82, pasillo: true },
  { id: 'puente', nombre: 'Puente de mando', x0: 62, x1: 78, z0: -9, z1: 9, color: 0x2f5d8a, ventanas: true },
  { id: 'motores', nombre: 'Sala de motores', x0: -8, x1: 8, z0: -13, z1: 13, color: 0x8a4b2f },
  { id: 'enfermeria', nombre: 'Enfermería', x0: 12, x1: 28, z0: 3, z1: 15, color: 0x3f9a8a },
  { id: 'comedor', nombre: 'Comedor', x0: 28, x1: 46, z0: 3, z1: 20, color: 0xb8863b, ventanas: true },
  { id: 'laboratorio', nombre: 'Laboratorio', x0: 46, x1: 62, z0: 3, z1: 15, color: 0x6b4fa8 },
  { id: 'bodega', nombre: 'Bodega de carga', x0: 12, x1: 28, z0: -17, z1: -3, color: 0x6b6b4a },
  { id: 'invernadero', nombre: 'Invernadero', x0: 28, x1: 46, z0: -20, z1: -3, color: 0x3f8a3f, ventanas: true },
  { id: 'reactor', nombre: 'Sala del reactor', x0: 46, x1: 62, z0: -15, z1: -3, color: 0xa83f5c },
];
export const SALIDA_NAVE = { x: 16, z: -14, radio: 1.6 };   // la escotilla de salida (en la bodega): vuelves al salón
export const INICIO_NAVE = { x: 40, z: 0 };                  // apareces en el pasillo central
// ¿En qué sala está el punto (x, z)? → su número, o -1 (afuera)
export const salaNaveEn = (x, z) => SALAS_NAVE.findIndex(s => x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1);
// Las puertas: donde dos salas se tocan (y lo que se tocan mide 3 m o más), una puerta de 3 m en el medio
export function puertasNave() {
  const out = [], S = SALAS_NAVE, P = NAVE.puerta;
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const A = S[a], B = S[b];
    for (const [eje, linea] of [['x', A.x1 === B.x0 ? A.x1 : A.x0 === B.x1 ? A.x0 : null], ['z', A.z1 === B.z0 ? A.z1 : A.z0 === B.z1 ? A.z0 : null]]) {
      if (linea === null) continue;
      const [i0, i1] = eje === 'x' ? [Math.max(A.z0, B.z0), Math.min(A.z1, B.z1)] : [Math.max(A.x0, B.x0), Math.min(A.x1, B.x1)];
      if (i1 - i0 < P) continue;
      const m = Math.floor((i0 + i1) / 2 - P / 2);   // (en metros enteros)
      out.push({ a, b, eje, linea, desde: m, hasta: m + P, x: eje === 'x' ? linea : m + P / 2, z: eje === 'x' ? m + P / 2 : linea });
    }
  }
  return out;
}
// Las paredes: en cada borde de 1 m entre dos lugares distintos (una sala y otra, o una sala y el espacio), menos donde hay puerta.
// Los bordes seguidos se juntan en una sola pared. exterior: si del otro lado está el espacio (ahí van las ventanas)
export function paredesNave() {
  const xs = SALAS_NAVE.flatMap(s => [s.x0, s.x1]), zs = SALAS_NAVE.flatMap(s => [s.z0, s.z1]);
  const X0 = Math.min(...xs) - 1, X1 = Math.max(...xs) + 1, Z0 = Math.min(...zs) - 1, Z1 = Math.max(...zs) + 1;
  const sala = (x, z) => salaNaveEn(x + 0.5, z + 0.5), abiertas = new Set();
  for (const p of puertasNave()) for (let u = p.desde; u < p.hasta; u++) abiertas.add(`${p.eje}:${p.linea}:${u}`);
  const tramos = [];   // { eje, linea, desde, hasta, exterior, sala }
  const agregar = (eje, linea, u, exterior, s) => { const t = tramos[tramos.length - 1]; if (t && t.eje === eje && t.linea === linea && t.hasta === u && t.exterior === exterior && t.sala === s) t.hasta = u + 1; else tramos.push({ eje, linea, desde: u, hasta: u + 1, exterior, sala: s }); };
  for (let x = X0; x <= X1; x++) for (let z = Z0; z < Z1; z++) {   // bordes verticales (en la línea x, entre la celda x−1 y la x)
    const a = sala(x - 1, z), b = sala(x, z);
    if (a !== b && !abiertas.has(`x:${x}:${z}`)) agregar('x', x, z, a < 0 || b < 0, a < 0 ? b : a);
  }
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x < X1; x++) {   // bordes horizontales (en la línea z)
    const a = sala(x, z - 1), b = sala(x, z);
    if (a !== b && !abiertas.has(`z:${z}:${x}`)) agregar('z', z, x, a < 0 || b < 0, a < 0 ? b : a);
  }
  const g = NAVE.grosor / 2;
  return tramos.map(t => (t.eje === 'x' ? { x0: t.linea - g, x1: t.linea + g, z0: t.desde, z1: t.hasta } : { x0: t.desde, x1: t.hasta, z0: t.linea - g, z1: t.linea + g })
    ).map((c, i) => ({ ...c, y0: 0, y1: NAVE.alto, exterior: tramos[i].exterior, sala: tramos[i].sala }));
}
// El camino de una sala a otra pasando por las puertas (para los bots): la lista de puntos (las puertas) por donde pasar
export function rutaNave(desde, hasta) {
  const P = puertasNave(), previo = new Map([[desde, null]]), cola = [desde];
  while (cola.length) { const s = cola.shift(); if (s === hasta) break; for (const p of P) { const o = p.a === s ? p.b : p.b === s ? p.a : null; if (o !== null && !previo.has(o)) { previo.set(o, { s, p }); cola.push(o); } } }
  if (!previo.has(hasta)) return null;
  const out = []; for (let s = hasta; previo.get(s); s = previo.get(s).s) out.unshift({ x: previo.get(s).p.x, z: previo.get(s).p.z });
  return out;
}
// ✈️ Volar: tocar ESPACIO dos veces rápido (en menos de 0,35 s) prende o apaga el modo vuelo
export const DOBLE_TOQUE_MS = 350;
export function tocarEspacio(est, ahora) {
  if (ahora - est.ultimo <= DOBLE_TOQUE_MS) return { ultimo: -Infinity, volando: !est.volando, cambio: true };   // (el tercer toque cuenta como uno nuevo)
  return { ultimo: ahora, volando: est.volando, cambio: false };
}

// 🥊 ¿Qué obstáculo de la carrera te pega en el segundo t? (el guardián de las puertas, un puño o una barra)
// rel: tus pies desde el origen de la pista · alto: tu altura. Devuelve { o (su número), g (el empujón) } o null
export function golpeObstaculoCarrera(rel, t, alto = 2) {
  const P = PISTA_CARRERA;
  for (let i = 0; i < P.puertas.length; i++) { const g = golpeGuardian(rel, P.puertas[i]); if (g) return { o: P.punos.length + P.barras.length + P.lanzas.length + i, g, guardian: i }; }
  for (let i = 0; i < P.punos.length; i++) if (Math.abs(rel.x - P.punos[i].x) < 3) { const g = golpePuno(rel, P.punos[i], t, alto); if (g) return { o: i, g }; }
  for (let i = 0; i < P.barras.length; i++) { const b = P.barras[i]; if (Math.hypot(rel.x - b.x, rel.z - b.z) < b.r + 1) { const g = golpeBarra(rel, b, t); if (g) return { o: P.punos.length + i, g }; } }
  return null;
}
// Después de un golpe, medio segundo sin que te vuelvan a pegar. Con el reloj de la compu (ms); si "hasta" quedó de otro reloj
// (más de 1 s en el futuro: imposible), no cuenta. Así nunca quedas "inmune" para siempre
export const GOLPE_PAUSA_MS = 500;
export const puedeRecibirGolpe = (hasta, ahora) => !(hasta > ahora && hasta - ahora <= GOLPE_PAUSA_MS * 2);
