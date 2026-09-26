// Lógica pura del juego (sin Three.js ni DOM), para poder probarla con tests.

// ---------- Casa ----------
export const HOUSE = { HX0: 20, HX1: 44, HZ0: 4, HZ1: 20, DOOR_Z: 12, FLOOR_H: 4 };
// Escalera: 10 escalones de 1 m de largo, 0,4 m de alto y 3 m de ancho, pegada a la pared de atrás
export const STAIRS = { X0: 22, RUN: 1, RISE: 0.4, STEPS: 10, Z0: 16.4, Z1: 19.4 };
STAIRS.X1 = STAIRS.X0 + STAIRS.RUN * STAIRS.STEPS;   // 32: donde termina (arriba)
STAIRS.MZ = (STAIRS.Z0 + STAIRS.Z1) / 2;            // 17.9: el centro de la escalera

export const insideHouse = ({ x, z }, h = HOUSE) => x > h.HX0 && x < h.HX1 && z > h.HZ0 && z < h.HZ1;

// ¿Está parado sobre la escalera (entre la planta baja y el piso 2)?
export const onStairs = ({ x, z, y }, h = HOUSE, S = STAIRS) =>
  z > S.Z0 - 0.3 && z < S.Z1 + 0.3 && x > S.X0 - 0.5 && x < S.X1 + 0.2 && y > 0.2 && y < h.FLOOR_H - 0.1;

// Ruta para salir de la casa: bajar la escalera y salir por la puerta
export function exitHouseTarget(pos, h = HOUSE, S = STAIRS) {
  const { x, z, y } = pos;
  // Ya va en la escalera: sigue bajando hasta el final (antes se daba la vuelta a medio camino)
  if (onStairs(pos, h, S)) return { x: S.X0 - 0.6, z: S.MZ };
  if (y > 3.5) {                                                   // piso 2
    if (z > S.Z0 - 0.3 && x > S.X0 && x < S.X1 + 1) return { x: S.X0 - 0.6, z: S.MZ }; // arriba de la escalera: baja
    if (z < S.Z0 - 1) return { x: S.X1 + 1.2, z: S.Z0 - 0.7 };     // se acerca a la escalera sin caer al hueco
    return { x: S.X1 + 0.8, z: S.MZ };                             // se pone arriba de la escalera
  }
  // Planta baja
  if (z > S.Z0 - 0.5 && x > S.X0 - 0.5) return { x, z: S.Z0 - 1.5 }; // se aparta de la escalera
  if (x > h.HX0 + 1.2) return { x: h.HX0 + 1, z: h.DOOR_Z };          // hacia la puerta
  return { x: h.HX0 - 5, z: h.DOOR_Z };                               // ¡afuera!
}

// Ruta para ir a su cama: entrar por la puerta, subir la escalera y subirse a la cama.
// bed = [x, piso, z]
export function goToBedTarget(pos, bed, h = HOUSE, S = STAIRS) {
  const [bx, bf, bz] = bed;
  const { x, z, y } = pos;
  if (!insideHouse(pos, h)) {
    if (x > h.HX0 - 3 && x < h.HX0 + 0.5 && Math.abs(z - h.DOOR_Z) < 1.2) return { x: h.HX0 + 1.8, z: h.DOOR_Z };             // entra por la puerta
    if (x > h.HX1 - 1 && z > h.HZ0 - 1.5 && z < h.HZ1 + 1.5) return { x: h.HX1 + 2.5, z: z < h.DOOR_Z ? h.HZ0 - 2.5 : h.HZ1 + 2.5 }; // rodea la casa por detrás
    if (x > h.HX0 - 1.2) return { x: h.HX0 - 2.5, z: z < h.DOOR_Z ? h.HZ0 - 2.5 : h.HZ1 + 2.5 };                                 // rodea por los lados
    return { x: h.HX0 - 2.5, z: h.DOOR_Z };                                                                                      // frente a la puerta
  }
  // En la escalera: sube si su cama está arriba, baja si está abajo
  if (onStairs(pos, h, S)) return bf === 0 ? { x: S.X0 - 0.6, z: S.MZ } : { x: S.X1 + 0.9, z: S.MZ };
  // Está en el piso 2 pero su cama está abajo: baja por la misma ruta que para salir
  if (y >= 3.5 && bf === 0) return exitHouseTarget(pos, h, S);
  if (y < 3.5) {                                               // planta baja
    if (bf === 0) return z > S.Z0 - 0.5 ? { x, z: S.Z0 - 1.5 } : { x: bx, z: bz }; // se aparta de la escalera y va a su cama
    if (z > S.Z0 - 0.3 && x < S.X0 + 0.3) return { x: S.X1 + 0.9, z: S.MZ }; // sube la escalera
    return { x: S.X0 - 0.4, z: S.MZ };                          // al pie de la escalera
  }
  if (z > S.Z0 - 0.3 && x > S.X0 && x < S.X1 + 1) return { x: S.X1 + 1.5, z: S.Z0 - 1.5 }; // piso 2: se aleja del hueco
  return { x: bx, z: bz };
}

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
