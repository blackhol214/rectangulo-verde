import { describe, it, expect } from 'vitest';
import {
  collideWalls, moveAndCollide, boxHit,
  upgradePrice, fmt, sunElevation, isNightPhase, clockText, hourToPhase,
  parseSetHour, launchSpeedForHeight, advanceOnBelt, beltItemIsBox, beltItemY, beltSpeed, extraLineSlot, MAX_EXTRA_BOX_LINES, MAX_EXTRA_BAG_LINES, GOLD_BAG_VALUE, nextGoldBagDelay, randomGiantHalfPoint, productReward, BAG_VALUE, nearestIndex, assistantSpeed,
  normalizeName, saveKey, isSaveCommand, serializeSave, parseSave,
  BIG_HOUSE, BASEMENT, STAIRWELL, groundHeight, slabPieces, missingFor, canAfford,
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

describe('mejoras de la cinta', () => {
  it('la Cinta 2.0 va un 50% más rápido y las cintas turbo el doble', () => {
    expect(beltSpeed(0)).toBe(2);
    expect(beltSpeed(1)).toBe(3);
    expect(beltSpeed(2)).toBe(4);
  });

  it('todas las cintas extra caben en tu mitad del mapa y no se pisan', () => {
    // Rectángulo que ocupa cada cinta con su plato y su tolva (radio 1,3 m)
    const area = ({ x0, len, z }) => ({ xa: x0 - 0.3, xb: x0 + len + 1.6 + 1.3, za: z - 1.3, zb: z + 1.3 });
    const all = [
      { x0: -10, len: 20, z: 50 }, { x0: -5, len: 15, z: 54 },          // las dos primeras
      ...Array.from({ length: MAX_EXTRA_BOX_LINES }, (_, i) => extraLineSlot('box', i)),
      ...Array.from({ length: MAX_EXTRA_BAG_LINES }, (_, i) => extraLineSlot('bag', i)),
    ].map(area);
    for (const a of all) {
      expect(a.za).toBeGreaterThan(1.5);   // del lado seguro de la línea amarilla
      expect(a.zb).toBeLessThan(100);      // antes del borde del mapa
      expect(a.xa).toBeGreaterThan(-100);
    }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const overlap = a.xa < b.xb && b.xa < a.xb && a.za < b.zb && b.za < a.zb;
        expect(overlap).toBe(false);
      }
  });

  it('se pueden tener muchos más transformadores que antes', () => {
    expect(MAX_EXTRA_BAG_LINES).toBeGreaterThan(5);
  });

  it('la cinta normal da cajas doradas y el transformador bolsas de 10 monedas', () => {
    expect(productReward('box')).toEqual({ coins: 0, boxes: 1 });
    expect(productReward('bag')).toEqual({ coins: 10, boxes: 0 });
    expect(BAG_VALUE).toBe(10);
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

describe('guardado por usuario', () => {
  const LEVELS = ['belt', 'hopper', 'assistant', 'speed'];

  it('el mismo nombre con mayúsculas o espacios de más es el mismo usuario', () => {
    expect(normalizeName('  El   Humano ')).toBe('el humano');
    expect(saveKey('El Humano')).toBe(saveKey('el humano'));
    expect(saveKey('el humano')).not.toBe(saveKey('otro'));
  });

  it('reconoce el comando save_changes', () => {
    expect(isSaveCommand('save_changes')).toBe(true);
    expect(isSaveCommand('  SAVE_CHANGES ')).toBe(true);
    expect(isSaveCommand('save changes')).toBe(false);
    expect(isSaveCommand('set hour 9')).toBe(false);
  });

  it('lo que se guarda se recupera igual', () => {
    const game = { coins: 130, boxes: 7, levels: { belt: 1, hopper: 1, assistant: 0, speed: 3 }, dayPhase: 0.375, pos: { x: 4, y: 0, z: 12.5 } };
    expect(parseSave(serializeSave(game), LEVELS)).toEqual(game);
  });

  it('un guardado roto o de otra versión no se carga', () => {
    expect(parseSave('esto no es json', LEVELS)).toBeNull();
    expect(parseSave('null', LEVELS)).toBeNull();
    expect(parseSave(JSON.stringify({ v: 99, coins: 5 }), LEVELS)).toBeNull();
    expect(parseSave(null, LEVELS)).toBeNull();
  });

  it('ignora valores raros y mejoras que ya no existen', () => {
    const raw = JSON.stringify({ v: 1, coins: -50, boxes: 2.9, levels: { belt: 1, magnet: 4, speed: 'mucho' }, dayPhase: 3, pos: { x: 1, y: 'a', z: 2 } });
    expect(parseSave(raw, LEVELS)).toEqual({
      coins: 0, boxes: 2, levels: { belt: 1, hopper: 0, assistant: 0, speed: 0 }, dayPhase: null, pos: null,
    });
  });
});

describe('bolsa dorada', () => {
  it('vale 60 monedas', () => {
    expect(GOLD_BAG_VALUE).toBe(60);
  });

  it('aparece cada 35 a 40 segundos', () => {
    expect(nextGoldBagDelay(0)).toBe(35);
    expect(nextGoldBagDelay(0.5)).toBe(37.5);
    expect(nextGoldBagDelay(0.9999)).toBeLessThan(40);
  });

  it('siempre aparece en la mitad del gigante, lejos de la línea y del borde', () => {
    for (const r1 of [0, 0.3, 0.7, 0.9999])
      for (const r2 of [0, 0.5, 0.9999]) {
        const p = randomGiantHalfPoint(r1, r2);
        expect(p.z).toBeLessThan(-7);     // del lado del gigante, a más de 5 m de la línea
        expect(p.z).toBeGreaterThan(-95);
        expect(Math.abs(p.x)).toBeLessThan(95);
      }
  });
});

describe('casa grande con sótano', () => {
  const inside = (p, r) => p.x0 >= r.x0 && p.x1 <= r.x1 && p.z0 >= r.z0 && p.z1 <= r.z1;

  it('la escalera baja justo hasta el piso del sótano y se baja caminando', () => {
    expect(STAIRWELL.steps * STAIRWELL.rise).toBeCloseTo(-BASEMENT.y);
    expect(STAIRWELL.rise).toBeLessThanOrEqual(0.45);
    expect(STAIRWELL.z1 - STAIRWELL.z0).toBe(STAIRWELL.steps); // un escalón por metro
  });

  it('la escalera está dentro de la casa y dentro del sótano', () => {
    const houseInside = { x0: BIG_HOUSE.x0 + 0.3, x1: BIG_HOUSE.x1 - 0.3, z0: BIG_HOUSE.z0 + 0.3, z1: BIG_HOUSE.z1 - 0.3 };
    expect(inside(STAIRWELL, houseInside)).toBe(true);
    expect(inside(STAIRWELL, BASEMENT)).toBe(true);
  });

  it('todas las cintas posibles caben en el sótano', () => {
    const slots = [
      { x0: -10, len: 20, z: 50 }, { x0: -5, len: 15, z: 54 },
      ...Array.from({ length: MAX_EXTRA_BOX_LINES }, (_, i) => extraLineSlot('box', i)),
      ...Array.from({ length: MAX_EXTRA_BAG_LINES }, (_, i) => extraLineSlot('bag', i)),
    ];
    for (const { x0, len, z } of slots)
      expect(inside({ x0: x0 - 0.3, x1: x0 + len + 1.6 + 1.3, z0: z - 1.3, z1: z + 1.3 }, BASEMENT)).toBe(true);
  });

  it('el suelo baja al sótano solo cuando ya compraste la casa grande', () => {
    expect(groundHeight(0, 50, false)).toBe(0);
    expect(groundHeight(0, 50, true)).toBe(BASEMENT.y);
    expect(groundHeight(0, -20, true)).toBe(0);  // la mitad del gigante no tiene sótano
    expect(groundHeight(80, 80, true)).toBe(0);  // ni el trampolín
  });

  it('el techo del sótano cubre todo menos el hueco de la escalera', () => {
    const pieces = slabPieces();
    const area = r => (r.x1 - r.x0) * (r.z1 - r.z0);
    const total = pieces.reduce((a, r) => a + area(r), 0);
    expect(total).toBeCloseTo(area(BASEMENT) - area(STAIRWELL));
    for (const r of pieces) {
      const overlapsHole = r.x0 < STAIRWELL.x1 && STAIRWELL.x0 < r.x1 && r.z0 < STAIRWELL.z1 && STAIRWELL.z0 < r.z1;
      expect(overlapsHole).toBe(false);
    }
  });
});

describe('precios con cajas y monedas a la vez', () => {
  const cost = { boxes: 100, coins: 200 };
  it('alcanza solo si tienes las dos cosas', () => {
    expect(canAfford({ boxes: 100, coins: 200 }, cost)).toBe(true);
    expect(canAfford({ boxes: 150, coins: 999 }, cost)).toBe(true);
    expect(canAfford({ boxes: 99, coins: 999 }, cost)).toBe(false);
    expect(canAfford({ boxes: 999, coins: 199 }, cost)).toBe(false);
  });
  it('dice cuánto falta de cada una', () => {
    expect(missingFor({ boxes: 80, coins: 250 }, cost)).toEqual({ boxes: 20, coins: 0 });
    expect(missingFor({ boxes: 0, coins: 0 }, cost)).toEqual({ boxes: 100, coins: 200 });
  });
});
