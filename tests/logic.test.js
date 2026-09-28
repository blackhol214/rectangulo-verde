import { describe, it, expect } from 'vitest';
import {
  collideWalls, moveAndCollide, boxHit,
  upgradePrice, fmt, sunElevation, isNightPhase, clockText, hourToPhase,
  parseSetHour, launchSpeedForHeight, advanceOnBelt, beltItemIsBox, beltItemY, nearestIndex, assistantSpeed,
} from '../src/logic.js';

// Caja de un personaje normal (1 × 0,6 × 2 m) en (x, z), girada `a` radianes
const body = (x, z, a = 0, y = 0, scale = 1) => ({ x, z, hw: 0.5 * scale, hd: 0.3 * scale, a, y0: y, y1: y + 2 * scale });

describe('boxHit (hitboxes exactas)', () => {
  it('detecta dos cajas que se superponen y dice cuánto se meten', () => {
    const hit = boxHit(body(0, 0), body(0.9, 0));
    expect(hit).not.toBeNull();
    expect(hit.depth).toBeCloseTo(0.1);
    expect(hit.nx).toBeCloseTo(1);   // hay que separar a B hacia +x
    expect(hit.nz).toBeCloseTo(0);
  });

  it('no detecta nada si están separadas', () => {
    expect(boxHit(body(0, 0), body(1.1, 0))).toBeNull();
    expect(boxHit(body(0, 0), body(0, 0.7))).toBeNull(); // de fondo solo miden 0,6
  });

  it('no choca si una está encima de la otra (sin cruzarse en altura)', () => {
    expect(boxHit(body(0, 0, 0, 0), body(0, 0, 0, 2))).toBeNull();
    expect(boxHit(body(0, 0, 0, 0), body(0, 0, 0, 1.9))).not.toBeNull();
  });

  it('usa el giro de la caja: de lado ocupa menos en x', () => {
    // A 0,85 m en x: de frente (1 m de ancho) chocan, girado 90° (0,6 de ancho) ya no
    expect(boxHit(body(0, 0), body(0.85, 0))).not.toBeNull();
    expect(boxHit(body(0, 0), body(0.85, 0, Math.PI / 2))).toBeNull();
  });

  it('el gigante (3 veces más grande) alcanza más lejos', () => {
    const giant = body(0, 0, 0, 0, 3); // 3 m de ancho
    expect(boxHit(giant, body(1.9, 0))).not.toBeNull();
    expect(boxHit(giant, body(2.1, 0))).toBeNull();
  });

  it('es simétrico: la dirección se invierte al cambiar el orden', () => {
    const a = body(0, 0, 0.3), b = body(0.7, 0.2, -0.4);
    const ab = boxHit(a, b), ba = boxHit(b, a);
    expect(ab.depth).toBeCloseTo(ba.depth);
    expect(ab.nx).toBeCloseTo(-ba.nx);
    expect(ab.nz).toBeCloseTo(-ba.nz);
  });
});

describe('parseSetHour (comando T → set hour)', () => {
  it.each([
    ['set hour 21', 21, 0],
    ['set hour 21:30', 21, 30],
    ['set hour 9 pm', 21, 0],
    ['set hour 9:30am', 9, 30],
    ['SET HOUR 7', 7, 0],
    ['set hour 12 am', 0, 0],
    ['set hour 12 pm', 12, 0],
    ['  set   hour  0  ', 0, 0],
  ])('"%s" → %i:%i', (text, h, min) => {
    expect(parseSetHour(text)).toEqual({ h, min });
  });

  it.each(['set hour 25', 'set hour 13 pm', 'set hour 0 am', 'set hour 10:60'])('"%s" es una hora que no existe', text => {
    expect(parseSetHour(text)).toEqual({ error: 'range' });
  });

  it.each(['', 'hola', 'set hour', 'set hour nueve', 'set hour 9:5'])('"%s" no se entiende', text => {
    expect(parseSetHour(text)).toEqual({ error: 'format' });
  });
});

describe('reloj y ciclo día/noche', () => {
  it('convierte horas a fase del día y de vuelta al reloj', () => {
    expect(hourToPhase(0)).toBe(0);
    expect(hourToPhase(12)).toBe(0.5);
    expect(clockText(hourToPhase(9))).toBe('09:00');
    expect(clockText(hourToPhase(21, 30))).toBe('21:30');
    expect(clockText(hourToPhase(23, 59))).toBe('23:59');
  });

  it('el sol está más alto al mediodía y más bajo a medianoche', () => {
    expect(sunElevation(hourToPhase(12))).toBeCloseTo(1);
    expect(sunElevation(hourToPhase(0))).toBeCloseTo(-1);
    expect(sunElevation(hourToPhase(6))).toBeCloseTo(0);
  });

  it('sabe cuándo es de noche', () => {
    expect(isNightPhase(hourToPhase(8))).toBe(false);   // empieza la partida
    expect(isNightPhase(hourToPhase(9))).toBe(false);   // después de dormir
    expect(isNightPhase(hourToPhase(12))).toBe(false);
    expect(isNightPhase(hourToPhase(22))).toBe(true);
    expect(isNightPhase(hourToPhase(0))).toBe(true);
    expect(isNightPhase(hourToPhase(3))).toBe(true);
  });
});

describe('tienda', () => {
  it('el precio se duplica en cada nivel', () => {
    expect([0, 1, 2, 3, 4].map(l => upgradePrice(5, l))).toEqual([5, 10, 20, 40, 80]);
    expect(upgradePrice(20, 0)).toBe(20); // bláster láser
  });

  it('los números grandes se muestran con puntos', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(1234)).toBe('1.234');
    expect(fmt(9999999)).toBe('9.999.999');
  });
});

describe('trampolín', () => {
  it('la velocidad de salida alcanza justo 100 m de altura', () => {
    const g = 30, v = launchSpeedForHeight(100, g);
    expect(v * v / (2 * g)).toBeCloseTo(100);
  });
});

describe('choques contra paredes (sin atravesarlas)', () => {
  const OPTS = { PR: 0.45, H: 2, STEP_UP: 0.45 };
  // Pared de 0,3 m de grueso en x = 0, larga en z
  const wall = { x: 0, z: 0, hw: 0.15, hd: 5, top: 8, bottom: 0 };
  const body = (x, z = 0, y = 0) => ({ pos: { x, y, z }, vel: { x: 0, z: 0 }, onGround: true });

  it('no deja pasar: se queda del lado de donde venía', () => {
    const st = body(-1);
    moveAndCollide(st, 3, 0, [wall], OPTS); // un paso enorme de 3 m hacia la pared
    expect(st.pos.x).toBeCloseTo(-0.6);    // pegado a la pared, del lado izquierdo
  });

  it('aunque en un cuadro ya haya cruzado el centro de la pared, vuelve a su lado', () => {
    // Este era el bug: el empujón decidía el lado por la posición actual y lo mandaba afuera
    const st = { ...body(0.1), prevX: -1, prevZ: 0 };
    expect(collideWalls(st, [wall], OPTS)).toBe(true);
    expect(st.pos.x).toBeCloseTo(-0.6);
  });

  it('funciona igual desde el otro lado y a lo largo de z', () => {
    const a = body(1); moveAndCollide(a, -3, 0, [wall], OPTS);
    expect(a.pos.x).toBeCloseTo(0.6);
    const wallZ = { x: 0, z: 0, hw: 5, hd: 0.15, top: 8, bottom: 0 };
    const b = body(0, -1); moveAndCollide(b, 0, 3, [wallZ], OPTS);
    expect(b.pos.z).toBeCloseTo(-0.6);
  });

  it('frena la velocidad contra la pared', () => {
    const st = body(-1); st.vel.x = 20;
    moveAndCollide(st, 1, 0, [wall], OPTS);
    expect(st.vel.x).toBe(0);
  });

  it('sube solo un escalón bajito, pero no una cama', () => {
    const step = { x: 1, z: 0, hw: 0.5, hd: 1.5, top: 0.4, bottom: 0 };
    const st = body(0); moveAndCollide(st, 0.3, 0, [step], OPTS);
    expect(st.pos.y).toBeCloseTo(0.4);
    const bed = { x: 1, z: 0, hw: 0.75, hd: 1.25, top: 0.55, bottom: 0 };
    const st2 = body(-0.5); moveAndCollide(st2, 1, 0, [bed], OPTS);
    expect(st2.pos.y).toBe(0);
    expect(st2.pos.x).toBeCloseTo(1 - 0.75 - 0.45);
  });

  it('si va por encima de la caja, no choca', () => {
    const low = { x: 1, z: 0, hw: 0.5, hd: 0.5, top: 1, bottom: 0 };
    const st = body(0, 0, 1.5); st.onGround = false;
    expect(moveAndCollide(st, 2, 0, [low], OPTS)).toBe(false);
    expect(st.pos.x).toBeCloseTo(2);
  });
});

describe('cinta transportadora', () => {
  it('la caja avanza con la velocidad de la cinta', () => {
    expect(advanceOnBelt(-4.4, 2, 0.5, 4.4)).toBeCloseTo(-3.4);
  });

  it('se detiene justo al final y no se pasa', () => {
    expect(advanceOnBelt(4.3, 2, 0.5, 4.4)).toBe(4.4);
    expect(advanceOnBelt(4.4, 2, 1, 4.4)).toBe(4.4);
  });

  it('recorre la cinta de 20 m hasta el plato en unos 11 segundos', () => {
    const start = -9.4, plate = 11.6;
    let x = start, time = 0;
    while (x < plate) { x = advanceOnBelt(x, 2, 0.1, plate); time += 0.1; }
    expect(Math.abs(time - (plate - start) / 2)).toBeLessThanOrEqual(0.1 + 1e-9); // 10,5 s, con pasos de 0,1 s
  });

  it('son pedazos amarillos antes de la máquina y una caja dorada después', () => {
    const machineX = -4;
    expect(beltItemIsBox(-9.4, machineX)).toBe(false);
    expect(beltItemIsBox(-4.1, machineX)).toBe(false);
    expect(beltItemIsBox(-4, machineX)).toBe(true);
    expect(beltItemIsBox(10, machineX)).toBe(true);
  });

  it('la caja va arriba de la cinta y al final baja al plato del suelo', () => {
    const y = x => beltItemY(x, 10, 11.6, 0.8, 0.48);
    expect(y(0)).toBe(0.8);
    expect(y(10)).toBe(0.8);
    expect(y(10.8)).toBeCloseTo(0.64);
    expect(y(11.6)).toBeCloseTo(0.48);
    expect(y(20)).toBeCloseTo(0.48); // nunca más abajo que el plato
  });
});

describe('asistente', () => {
  it('elige la moneda más cercana', () => {
    const coins = [{ x: 10, z: 0 }, { x: 2, z: 1 }, { x: -5, z: -5 }];
    expect(nearestIndex({ x: 0, z: 0 }, coins)).toBe(1);
    expect(nearestIndex({ x: -4, z: -4 }, coins)).toBe(2);
  });

  it('sin monedas no elige ninguna', () => {
    expect(nearestIndex({ x: 0, z: 0 }, [])).toBe(-1);
  });

  it('cada mejora de velocidad le suma 2', () => {
    expect([0, 1, 2, 5].map(assistantSpeed)).toEqual([6, 8, 10, 16]);
  });
});
