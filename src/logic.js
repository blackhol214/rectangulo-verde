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
