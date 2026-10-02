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
export function extraLineSlot(type, index) {
  if (type === 'box') return { x0: -10, len: 20, z: 58 + index * 4 };
  return { x0: -38 - 22 * Math.floor(index / 12), len: 15, z: 50 + (index % 12) * 4 };
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
export function serializeSave({ coins, boxes, levels, dayPhase, pos, style }) {
  return JSON.stringify({ v: 1, coins, boxes, levels, dayPhase, pos: { x: pos.x, y: pos.y, z: pos.z }, style });
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
  return { coins: count(d.coins), boxes: count(d.boxes), levels, dayPhase: phase, pos, style: parseStyle(d.style) };
}

// ---------- Casa grande con sótano ----------
// El sótano es casi del tamaño de la casa (2 m más largo) y está vacío. Su techo está 2 m bajo el suelo,
// así que desde afuera no se ve nada. Las cintas se quedan afuera.
export const BIG_HOUSE = { x0: 20, x1: 36, z0: 4, z1: 18, doorZ: 9, height: 5 };
export const BASEMENT = { x0: 19, x1: 37, z0: 4, z1: 18, y: -7, ceilingY: -2 };
// Escalera dentro de la casa: baja 7 m en 18 escalones (de 0,39 m de alto y 0,6 m de fondo; se baja caminando)
export const STAIRWELL = { x0: 31, x1: 34, z0: 5, steps: 18, rise: 7 / 18, run: 0.6 };
STAIRWELL.z1 = STAIRWELL.z0 + STAIRWELL.steps * STAIRWELL.run;   // 15,8

// Altura del suelo en (x, z): dentro del sótano (si ya existe) es el piso del sótano; afuera, 0
export function groundHeight(x, z, basementOpen) {
  const b = BASEMENT;
  return basementOpen && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 ? b.y : 0;
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
export const BOT_MIN_Z = 4;                         // nunca bajan de aquí: la línea amarilla está en z 0–1,5
// ¿Puede un bot ir a (x, z)? Solo en tu mitad, lejos de las montañas, de la casa y de la tienda de estilo
export function botCanGo(x, z) {
  if (z < BOT_MIN_Z || z > 92 || Math.abs(x) > 92) return false;
  if (x > 17 && x < 39 && z > 1 && z < 21) return false;                               // casa (y su alrededor)
  if (Math.abs(x - STYLE_STALL.x) < 5 && Math.abs(z - STYLE_STALL.z) < 4.5) return false; // tienda de estilo
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
  { id: 'dolphins', bot: 'azul',       name: 'Delfines',              goal: 'Salta entre los delfines y recoge la gorra sobre la ballena dormida', reward: { coins: 80 } },
  { id: 'clouds',   bot: 'celeste',    name: 'Nubes',                 goal: 'Salta por las 10 nubes y lleva al bot celeste a su casa', reward: { coins: 60 } },
  { id: 'lava',     bot: 'turquesa',   name: '50 escalones con lava', goal: 'Sube los 50 escalones con el bot turquesa antes de que llegue la lava', reward: { coins: 100 } },
  { id: 'trees',    bot: 'verde lima', name: 'Los 5 árboles',         goal: 'Busca el círculo amarillo entre los rojos (E junto a cada árbol)', reward: { coins: 40 } },
  { id: 'meteors',  bot: 'magenta',    name: 'Lluvia de meteoritos',  goal: 'Sobrevive 30 segundos: aléjate de las sombras rojas', reward: { coins: 70 } },
  { id: 'mix',      bot: 'coral',      name: 'Nubes y lava',          goal: 'Sube por las nubes con el bot coral mientras sube la lava', reward: { coins: 120 } },
];
// Cada minijuego vive lejos del mapa, en su propia zona
export const minigameOrigin = k => ({ x: 2000 + k * 1000, z: 3000 });

// ----- Amarillo: laberinto -----
export const MAZE = { cols: 9, rows: 9, cell: 4, wallH: 3, seed: 2026 };
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
export const GARDEN = { half: 18, flowerSpeed: 8, waterRange: 7, waterSpeed: 16 };

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
export const DOLPHINS = { lanes: [5, 9.5, 14, 18.5, 23, 27.5], halfRange: 4, speed: 1.1, length: 3, width: 1.4, whaleZ: 34, whaleSize: [8, 2.4, 6] };
export const dolphinX = (i, t) => Math.sin(t * DOLPHINS.speed + i * 1.7) * DOLPHINS.halfRange;

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

// ----- Verde lima: 5 árboles con círculos -----
export const TREES = { spots: [[-12, 8], [12, 8], [0, 18], [-14, 24], [14, 24]], circlesPerTree: 8, seed: 5 };
export function treeCircles() {
  const rnd = seededRandom(TREES.seed), yellowTree = Math.floor(rnd() * TREES.spots.length), yellowSlot = Math.floor(rnd() * TREES.circlesPerTree);
  return TREES.spots.map((_, ti) => Array.from({ length: TREES.circlesPerTree }, (__, k) => ({
    yellow: ti === yellowTree && k === yellowSlot, theta: k / TREES.circlesPerTree * Math.PI * 2 + rnd() * 0.4, up: 0.2 + rnd() * 0.6,
  })));
}

// ----- Magenta: lluvia de meteoritos -----
export const METEORS = { radius: 14, warn: 1.2, every: 0.75, blast: 2.2, survive: 30 };
export function meteorSpot(r1, r2) { const a = r1 * Math.PI * 2, d = Math.sqrt(r2) * (METEORS.radius - 1.5); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
