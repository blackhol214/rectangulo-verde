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


// Comando "set hour": acepta 21, 21:30, 9 pm, 9:30am.
// Devuelve { h, min } o { error: 'format' | 'range' }.
export function parseSetHour(text) {
  const m = String(text).trim().match(/^set\s+hour\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return { error: 'format' };
  let h = +m[1];
  const min = m[2] ? +m[2] : 0, ap = m[3] && m[3].toLowerCase();
  if (min > 59 || (ap ? (h < 1 || h > 12) : h > 23)) return { error: 'range' };
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return { h, min };
}

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
export const MAX_EXTRA_BOX_LINES = 5, MAX_EXTRA_BAG_LINES = 24;
export function extraLineSlot(type, index) {
  if (type === 'box') return { x0: -10, len: 20, z: 58 + index * 4 };
  return { x0: -38 - 22 * Math.floor(index / 12), len: 15, z: 50 + (index % 12) * 4 };
}

// ---------- Bolsa dorada (evento en la mitad del gigante) ----------
export const GOLD_BAG_VALUE = 60;
// Aparece cada 35–40 segundos (r en [0, 1) decide cuánto exactamente)
export const nextGoldBagDelay = r => 35 + r * 5;
// Un punto al azar en la mitad del gigante (z < 0), lejos de la línea amarilla y del borde
export function randomGiantHalfPoint(r1, r2, edge = 100, lineHalf = 1.5, margin = 6) {
  return { x: (r1 * 2 - 1) * (edge - margin), z: -(lineHalf + margin) - r2 * (edge - 2 * margin - lineHalf) };
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

// Velocidad del asistente según el nivel de su mejora
export const assistantSpeed = level => 6 + level * 2;

// ---------- Guardado por usuario (localStorage) ----------
// "El Humano", " el   humano " y "el humano" son el mismo usuario
export const normalizeName = name => String(name).trim().replace(/\s+/g, ' ').toLowerCase();
export const saveKey = name => `rectangulo-verde:partida:${normalizeName(name)}`;

// El comando que guarda (se escribe con T)
export const isSaveCommand = text => /^save_changes$/i.test(String(text).trim());

// Convierte la partida en texto para guardarla
export function serializeSave({ coins, boxes, levels, dayPhase, pos }) {
  return JSON.stringify({ v: 1, coins, boxes, levels, dayPhase, pos: { x: pos.x, y: pos.y, z: pos.z } });
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
  return { coins: count(d.coins), boxes: count(d.boxes), levels, dayPhase: phase, pos };
}

// ---------- Casa grande con sótano ----------
// La casa grande ocupa donde estaba la mediana y más. Debajo hay un sótano enorme (a 6 m de profundidad)
// que llega hasta tus cintas; al comprar la casa, las cintas bajan al sótano.
export const BIG_HOUSE = { x0: 20, x1: 46, z0: 4, z1: 26, doorZ: 9, height: 5 };
export const BASEMENT = { x0: -64, x1: 48, z0: 2, z1: 98, y: -6 };
// Escalera dentro de la casa: baja 6 m en 15 escalones de 0,4 m (se baja caminando)
export const STAIRWELL = { x0: 41, x1: 44, z0: 7, z1: 22, steps: 15, rise: 0.4 };

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
