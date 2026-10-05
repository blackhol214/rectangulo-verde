import { describe, it, expect } from 'vitest';
import {
  collideWalls, moveAndCollide, boxHit,
  upgradePrice, fmt, sunElevation, isNightPhase, clockText, hourToPhase,
  launchSpeedForHeight, advanceOnBelt, beltItemIsBox, beltItemY, beltSpeed, extraLineSlot, MAIN_LINES, MAX_EXTRA_BOX_LINES, MAX_EXTRA_BAG_LINES, productReward, BAG_VALUE, nearestIndex, assistantSpeed, ASSIST_SPEED_MAX,
  normalizeName, saveKey, serializeSave, parseSave,
  BIG_HOUSE, BASEMENT, STAIRWELL, groundHeight, slabPieces, missingFor, canAfford,
  mountainRing, MOUNTAIN_WALL_INSET, seededRandom,
  blasterStats,
  COSMETICS, DEFAULT_COLOR, emptyStyle, toggleEquip, parseStyle, cosmeticById,
  noteFrequency, COIN_NOTES, ambientVolume, bitcrush, footstepInterval,
  distanceGain, distanceCutoff, STYLE_STALL, BOT_COLORS, BOT_SCALE, MINIGAME_BOT_SCALE, BOT_MIN_Z, botCanGo, randomBotTarget,
  SWINGS, swingAngle, SLIDE, slidePoint,
  HOUSE_VISIT_CHANCE, HOUSE_VISIT, RED_BUTTON, RED_BUTTON_HOUSE, PARKOUR, parkourStep, parkourSize, LAVA, lavaHeight, followTrail,
  MINIGAMES, minigameOrigin, MAZE, generateMaze, mazePathLength, pickMaze, pickLemon, clampToArea, flowerTired, MEDIUM_HOUSE, insideRect, segmentHitsRect, detourAround, INVERTED, INVERTED_K, minigameDef, invertColor, fleeCoin, botSpeedAfter, CRATES, crateOutside, GARDEN, DROPPER, dropperLayers, dropperPad,
  DOLPHINS, dolphinLane, dolphinLeap, VILLAGE, villageDoor, nearVillageHouse, TASKS, tasksForDay, taskSpot, taskReady, cloudPath, CLOUD_SIZE, TREES, treeCircles, METEORS, meteorSpot,
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
      MAIN_LINES.box, MAIN_LINES.bag,          // las dos primeras
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

  it('ninguna cinta se mete en las casas del pueblo, tu casa, el parque, la tienda de estilo, el trampolín ni la cámara', () => {
    const area = ({ x0, len, z }) => ({ x0: x0 - 0.3, x1: x0 + len + 1.6 + 1.3, z0: z - 1.3, z1: z + 1.3 });
    const slots = [MAIN_LINES.box, MAIN_LINES.bag,
      ...Array.from({ length: MAX_EXTRA_BOX_LINES }, (_, i) => extraLineSlot('box', i)),
      ...Array.from({ length: MAX_EXTRA_BAG_LINES }, (_, i) => extraLineSlot('bag', i))].map(area);
    const S = VILLAGE.size / 2 + 1;
    const blocked = [...VILLAGE.houses.map(h => ({ x0: h.x - S, x1: h.x + S, z0: h.z - S, z1: h.z + S })),
      { x0: BIG_HOUSE.x0 - 1, x1: BIG_HOUSE.x1 + 1, z0: BIG_HOUSE.z0 - 1, z1: BIG_HOUSE.z1 + 1 },   // tu casa (la grande)
      { x0: STYLE_STALL.x - 5, x1: STYLE_STALL.x + 5, z0: STYLE_STALL.z - 4.5, z1: STYLE_STALL.z + 4.5 },
      { x0: -34, x1: -10, z0: 14, z1: 28 },                                                      // parque
      { x0: 69, x1: 86, z0: 77, z1: 87 }];                                                       // trampolín y cámara
    for (const a of slots) for (const b of blocked) expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1).toBe(false);
    for (const a of slots) expect(a.x1).toBeLessThan(92);
  });

  it('como máximo hay 5 cintas de cada tipo (la primera + 4 extra)', () => {
    expect(1 + MAX_EXTRA_BOX_LINES).toBe(5);
    expect(1 + MAX_EXTRA_BAG_LINES).toBe(5);
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

  it('cada mejora de velocidad le suma 2, hasta el nivel 5', () => {
    expect(ASSIST_SPEED_MAX).toBe(5);
    expect([0, 1, 2, 5].map(assistantSpeed)).toEqual([6, 8, 10, 16]);
    expect(assistantSpeed(9)).toBe(16); // un guardado viejo con más nivel no pasa del máximo
  });
});

describe('guardado por usuario', () => {
  const LEVELS = ['belt', 'hopper', 'assistant', 'speed'];

  it('el mismo nombre con mayúsculas o espacios de más es el mismo usuario', () => {
    expect(normalizeName('  El   Humano ')).toBe('el humano');
    expect(saveKey('El Humano')).toBe(saveKey('el humano'));
    expect(saveKey('el humano')).not.toBe(saveKey('otro'));
  });

  it('lo que se guarda se recupera igual', () => {
    const game = { coins: 130, boxes: 7, levels: { belt: 1, hopper: 1, assistant: 0, speed: 3 }, dayPhase: 0.375, pos: { x: 4, y: 0, z: 12.5 },
      style: { owned: ['capBlue', 'colorPink'], equipped: { hat: 'capBlue', color: 'colorPink', glasses: null } }, trophies: ['diamante'] };
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
      coins: 0, boxes: 2, levels: { belt: 1, hopper: 0, assistant: 0, speed: 0 }, dayPhase: null, pos: null, style: emptyStyle(), trophies: [],
    });
  });
});

describe('casa grande con sótano', () => {
  const inside = (p, r) => p.x0 >= r.x0 && p.x1 <= r.x1 && p.z0 >= r.z0 && p.z1 <= r.z1;
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  // Lo que ocupa una cinta en el suelo: marco, plato y tolva (radio 1,3 m)
  const laneArea = ({ x0, len, z }) => ({ x0: x0 - 0.3, x1: x0 + len + 1.6 + 1.3, z0: z - 1.3, z1: z + 1.3 });

  it('el sótano es casi del tamaño de la casa: 2 m más largo', () => {
    const house = { w: BIG_HOUSE.x1 - BIG_HOUSE.x0, d: BIG_HOUSE.z1 - BIG_HOUSE.z0 };
    const base = { w: BASEMENT.x1 - BASEMENT.x0, d: BASEMENT.z1 - BASEMENT.z0 };
    expect(base.w - house.w).toBe(2);
    expect(base.d).toBe(house.d);
  });

  it('el techo del sótano está 2 m bajo el suelo y hay altura para saltar', () => {
    expect(BASEMENT.ceilingY).toBe(-2);
    expect(BASEMENT.ceilingY - BASEMENT.y).toBeGreaterThanOrEqual(2 + 2.6); // tu altura + tu salto
  });

  it('la escalera baja justo hasta el piso del sótano y se baja caminando', () => {
    expect(STAIRWELL.steps * STAIRWELL.rise).toBeCloseTo(-BASEMENT.y);
    expect(STAIRWELL.rise).toBeLessThanOrEqual(0.45);
    expect(STAIRWELL.z1 - STAIRWELL.z0).toBeCloseTo(STAIRWELL.steps * STAIRWELL.run);
  });

  it('la casa grande es más chica que antes, pero la cama y la escalera caben sin tocarse', () => {
    expect((BIG_HOUSE.x1 - BIG_HOUSE.x0) * (BIG_HOUSE.z1 - BIG_HOUSE.z0)).toBeLessThan(26 * 22);
    const bed = { x0: 28.5 - 0.75, x1: 28.5 + 0.75, z0: 9 - 1.25, z1: 9 + 1.25 };
    expect(overlap(bed, { ...STAIRWELL, x0: STAIRWELL.x0 - 0.5, x1: STAIRWELL.x1 + 0.5 })).toBe(false);
  });

  it('la escalera está dentro de la casa y dentro del sótano', () => {
    const houseInside = { x0: BIG_HOUSE.x0 + 0.3, x1: BIG_HOUSE.x1 - 0.3, z0: BIG_HOUSE.z0 + 0.3, z1: BIG_HOUSE.z1 - 0.3 };
    expect(inside(STAIRWELL, houseInside)).toBe(true);
    expect(inside(STAIRWELL, BASEMENT)).toBe(true);
  });

  it('las cintas se quedan afuera: ninguna toca el sótano', () => {
    const slots = [
      MAIN_LINES.box, MAIN_LINES.bag,          // las dos primeras
      ...Array.from({ length: MAX_EXTRA_BOX_LINES }, (_, i) => extraLineSlot('box', i)),
      ...Array.from({ length: MAX_EXTRA_BAG_LINES }, (_, i) => extraLineSlot('bag', i)),
    ];
    for (const sl of slots) expect(overlap(laneArea(sl), BASEMENT)).toBe(false);
  });

  it('el suelo baja al sótano solo dentro del sótano y solo si ya compraste la casa', () => {
    expect(groundHeight(25, 11, false)).toBe(0);
    expect(groundHeight(25, 11, true)).toBe(BASEMENT.y);
    expect(groundHeight(0, 50, true)).toBe(0);   // donde están las cintas de afuera no hay sótano
    expect(groundHeight(0, -20, true)).toBe(0);  // ni en la mitad del gigante
  });

  it('el techo del sótano cubre todo menos el hueco de la escalera', () => {
    const pieces = slabPieces();
    const area = r => (r.x1 - r.x0) * (r.z1 - r.z0);
    expect(pieces.reduce((a, r) => a + area(r), 0)).toBeCloseTo(area(BASEMENT) - area(STAIRWELL));
    for (const r of pieces) expect(overlap(r, STAIRWELL)).toBe(false);
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

describe('montañas alrededor del mapa', () => {
  const EDGE = 100, cones = mountainRing(EDGE);
  // Altura de la cordillera en un punto (el cono más alto que lo cubre)
  const heightAt = (x, z) => Math.max(0, ...cones.map(c => c.h * (1 - Math.hypot(x - c.x, z - c.z) / c.r)));

  it('siempre salen las mismas montañas', () => {
    expect(mountainRing(EDGE)).toEqual(cones);
    const a = seededRandom(3), b = seededRandom(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('son muy altas', () => {
    expect(Math.max(...cones.map(c => c.h))).toBeGreaterThan(150);
    expect(Math.min(...cones.map(c => c.h))).toBeGreaterThanOrEqual(70);
  });

  it('cubren todo el borde: no hay huecos por donde ver el final del mapa', () => {
    for (let t = -EDGE; t <= EDGE; t += 1)
      for (const [x, z] of [[EDGE, t], [-EDGE, t], [t, EDGE], [t, -EDGE]])
        expect(heightAt(x, z)).toBeGreaterThan(2);
  });

  it('casi no se meten al campo: terminan antes de la pared invisible que te detiene', () => {
    for (const c of cones) {
      const inside = Math.min(Math.abs(c.x), Math.abs(c.z)) < EDGE ? Math.max(Math.abs(c.x), Math.abs(c.z)) : EDGE + 999;
      // Lo que entra al campo cada cono (desde el borde hacia adentro)
      expect(c.r - (inside - EDGE)).toBeLessThanOrEqual(MOUNTAIN_WALL_INSET + 0.5);
    }
  });
});

describe('bláster 2.0', () => {
  it('dispara a 25 m/s, recarga en 1 segundo y sus láseres son rojos con partículas', () => {
    const v2 = blasterStats(true);
    expect(v2.speed).toBe(25);
    expect(v2.reload).toBe(1);
    expect(v2.color).toBe(0xff2a2a);
    expect(v2.particles).toBe(true);
  });
  it('el bláster normal sigue igual: azul, 30 m/s y sin partículas', () => {
    expect(blasterStats(false)).toMatchObject({ speed: 30, reload: 1, color: 0x1e6bff, particles: false });
  });
});

describe('estilo: sombreros, colores y gafas', () => {
  it('la tienda tiene 3 sombreros, 6 colores y 4 gafas', () => {
    expect(COSMETICS.filter(c => c.type === 'hat').map(c => c.name)).toEqual(['Gorra azul', 'Sombrero de copa', 'Gorra roja (visera hacia atrás)']);
    expect(COSMETICS.filter(c => c.type === 'color')).toHaveLength(6);
    expect(COSMETICS.filter(c => c.type === 'glasses').map(c => c.name)).toEqual(['Gafas pixel', 'Gafas 1 (redondas azules)', 'Gafas 2 (redondas verdes)', 'Gafas 3 (redondas negras)']);
    expect(cosmeticById(DEFAULT_COLOR).name).toMatch(/Verde/);
  });

  it('cambiar de sombrero o de gafas reemplaza el anterior', () => {
    let st = { owned: ['capBlue', 'topHat', 'glassesRound1', 'glassesRound3'], equipped: emptyStyle().equipped };
    st = toggleEquip(st, 'capBlue'); st = toggleEquip(st, 'topHat');
    expect(st.equipped.hat).toBe('topHat');
    st = toggleEquip(st, 'glassesRound1'); st = toggleEquip(st, 'glassesRound3');
    expect(st.equipped.glasses).toBe('glassesRound3');
  });

  it('se empieza con el verde y sin nada puesto', () => {
    expect(emptyStyle().equipped).toEqual({ hat: null, color: DEFAULT_COLOR, glasses: null });
  });

  it('solo te puedes poner lo que compraste', () => {
    expect(toggleEquip(emptyStyle(), 'capBlue').equipped.hat).toBeNull();
    const st = { owned: ['capBlue'], equipped: emptyStyle().equipped };
    expect(toggleEquip(st, 'capBlue').equipped.hat).toBe('capBlue');
  });

  it('ponerte algo dos veces te lo quita', () => {
    let st = { owned: ['capBlue', 'glassesPixel'], equipped: emptyStyle().equipped };
    st = toggleEquip(st, 'glassesPixel'); expect(st.equipped.glasses).toBe('glassesPixel');
    st = toggleEquip(st, 'glassesPixel'); expect(st.equipped.glasses).toBeNull();
  });

  it('solo tienes un color a la vez; quitártelo te deja el verde', () => {
    let st = { owned: ['colorBlue', 'colorPink'], equipped: emptyStyle().equipped };
    st = toggleEquip(st, 'colorBlue'); expect(st.equipped.color).toBe('colorBlue');
    st = toggleEquip(st, 'colorPink'); expect(st.equipped.color).toBe('colorPink');
    st = toggleEquip(st, 'colorPink'); expect(st.equipped.color).toBe(DEFAULT_COLOR);
  });

  it('un guardado raro no rompe nada: ignora lo que no existe o no compraste', () => {
    expect(parseStyle(null)).toEqual(emptyStyle());
    const st = parseStyle({ owned: ['capBlue', 'capBlue', 'sombreroInventado'], equipped: { hat: 'capBlue', color: 'colorPink', glasses: 'glassesPixel' } });
    expect(st.owned).toEqual(['capBlue']);
    expect(st.equipped).toEqual({ hat: 'capBlue', color: DEFAULT_COLOR, glasses: null });
  });
});

describe('sonido', () => {
  it('calcula bien la frecuencia de las notas', () => {
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('E4')).toBeCloseTo(329.63, 2);
    expect(noteFrequency('B5')).toBeCloseTo(987.77, 2);
    expect(noteFrequency('E6')).toBeCloseTo(1318.51, 2);
    expect(noteFrequency('nada')).toBeNaN();
  });

  it('la moneda suena como la de Mario: SI 5 corta y luego MI 6, mucho más agudo que antes', () => {
    expect(COIN_NOTES.map(n => n.note)).toEqual(['B5', 'E6']);
    expect(COIN_NOTES[0].length).toBeLessThan(COIN_NOTES[1].length);       // la primera es cortita
    expect(COIN_NOTES[1].start).toBeCloseTo(COIN_NOTES[0].length);         // la segunda empieza justo después
    for (const n of COIN_NOTES) expect(noteFrequency(n.note)).toBeGreaterThan(noteFrequency('E4') * 2.5);
  });

  it('el bosque suena normal de día y un 15% más bajo de noche', () => {
    expect(ambientVolume(1)).toBe(1);
    expect(ambientVolume(0)).toBeCloseTo(0.85);
    expect(ambientVolume(0.5)).toBeCloseTo(0.925);
  });

  it('el efecto bitcrush deja pocos niveles y repite muestras', () => {
    const wave = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 3));
    const out = bitcrush(wave, 3, 4);
    expect(new Set(out).size).toBeLessThanOrEqual(2 ** 3 + 1);       // 3 bits: muy pocos niveles
    for (let i = 0; i < 64; i += 4) expect(new Set(out.slice(i, i + 4)).size).toBe(1); // cada 4 muestras, la misma
  });

  it('los pasos van más seguido si corres más rápido', () => {
    expect(footstepInterval(12)).toBeCloseTo(0.32);
    expect(footstepInterval(24)).toBeCloseTo(0.16);
  });
});

describe('sonido a distancia', () => {
  it('cerca suena fuerte y lejos suena bajito', () => {
    expect(distanceGain(2)).toBe(1);
    expect(distanceGain(6)).toBe(1);
    expect(distanceGain(60)).toBeCloseTo(0.1);
    expect(distanceGain(30)).toBeGreaterThan(distanceGain(80));
  });
  it('lejos suena más apagado', () => {
    expect(distanceCutoff(0)).toBe(12000);
    expect(distanceCutoff(90)).toBe(600);
    expect(distanceCutoff(200)).toBe(600);
    expect(distanceCutoff(20)).toBeGreaterThan(distanceCutoff(60));
  });
});

describe('tienda de estilo frente a la ventana de atrás', () => {
  it('queda detrás de la casa, frente a su ventana, sin tocarla', () => {
    const windowX = (BIG_HOUSE.x0 + BIG_HOUSE.x1) / 2;
    expect(Math.abs(STYLE_STALL.x - windowX)).toBeLessThan(2.5);          // alineada con la ventana
    expect(STYLE_STALL.z - BIG_HOUSE.z1).toBeGreaterThan(6);             // con espacio para pararte entre las dos
    expect(STYLE_STALL.z - BIG_HOUSE.z1).toBeLessThan(14);               // pero cerca
  });
});

describe('bots tontos', () => {
  it('son 10, de colores distintos y la mitad de tu tamaño', () => {
    expect(BOT_COLORS).toHaveLength(10);
    expect(new Set(BOT_COLORS).size).toBe(10);
    expect(BOT_SCALE).toBe(0.5);
  });
  it('en los minijuegos son de tu ancho, pero un 20 % más bajitos', () => {
    expect(MINIGAME_BOT_SCALE.height).toBeCloseTo(1 - 0.2);
    expect(MINIGAME_BOT_SCALE.width).toBe(1);
    expect(MINIGAME_BOT_SCALE.depth).toBe(1);
    expect(BOT_SCALE).toBe(0.5);   // los del parque siguen igual de chiquitos
  });
  it('nunca van a la mitad del gigante ni a la línea amarilla', () => {
    expect(botCanGo(0, -10)).toBe(false);
    expect(botCanGo(0, 1)).toBe(false);
    expect(botCanGo(0, 30)).toBe(true);
    const rnd = seededRandom(42);
    for (let i = 0; i < 500; i++) {
      const p = randomBotTarget(rnd);
      expect(p.z).toBeGreaterThanOrEqual(BOT_MIN_Z);
      expect(botCanGo(p.x, p.z)).toBe(true);
    }
  });
  it('no van a meterse a la casa ni a la tienda de estilo', () => {
    expect(botCanGo(28, 10)).toBe(false);
    expect(botCanGo(STYLE_STALL.x, STYLE_STALL.z)).toBe(false);
  });
});

describe('parque: columpios y tobogán', () => {
  it('hay 2 columpios', () => {
    expect(SWINGS.seats).toHaveLength(2);
  });
  it('el columpio empieza quieto y se mece cada vez más, sin pasarse de 0,6 rad', () => {
    expect(swingAngle(0)).toBe(0);
    let max = 0; for (let t = 0; t < 20; t += 0.01) max = Math.max(max, Math.abs(swingAngle(t)));
    expect(max).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(max).toBeGreaterThan(0.55);
  });
  it('el tobogán empieza arriba y termina casi en el suelo', () => {
    expect(slidePoint(0).y).toBe(SLIDE.top);
    expect(slidePoint(1).y).toBeCloseTo(SLIDE.endY);
    expect(slidePoint(1).x - slidePoint(0).x).toBeCloseTo(SLIDE.chute);
    expect(slidePoint(0.5).y).toBeLessThan(slidePoint(0.2).y);
  });
  it('el parque está en tu mitad, donde los bots pueden ir', () => {
    expect(botCanGo(SWINGS.x, SWINGS.z + 2)).toBe(true);
    expect(botCanGo(SLIDE.x0 - 1, SLIDE.z)).toBe(true);
    expect(SWINGS.z - 2).toBeGreaterThan(BOT_MIN_Z);
  });
});

describe('bots que entran a tu casa y el botón rojo', () => {
  const inHouse = (p, h) => p.x > h.x0 + 0.3 && p.x < h.x1 - 0.3 && p.z > h.z0 + 0.3 && p.z < h.z1 - 0.3;
  it('entran 1 de cada 5 veces', () => { expect(HOUSE_VISIT_CHANCE).toBe(0.2); });
  it('el lugar donde se quedan está dentro de las dos casas, lejos de la cama y de la escalera', () => {
    expect(inHouse(HOUSE_VISIT.inside, { x0: 20, x1: 32, z0: 4, z1: 14 })).toBe(true);
    expect(inHouse(HOUSE_VISIT.inside, BIG_HOUSE)).toBe(true);
    const far = (p, r, m) => p.x < r.x0 - m || p.x > r.x1 + m || p.z < r.z0 - m || p.z > r.z1 + m;
    expect(far(HOUSE_VISIT.inside, { x0: 27.75, x1: 29.25, z0: 7.75, z1: 10.25 }, 0.5)).toBe(true); // la cama
    expect(far(HOUSE_VISIT.inside, STAIRWELL, 1)).toBe(true);
    expect(Math.abs(HOUSE_VISIT.door.z - BIG_HOUSE.doorZ)).toBeLessThan(0.5);                     // entran por la puerta
  });
  it('el botón rojo está dentro del sótano y lejos de la escalera', () => {
    expect(RED_BUTTON.x > BASEMENT.x0 && RED_BUTTON.x < BASEMENT.x1 && RED_BUTTON.z > BASEMENT.z0 && RED_BUTTON.z < BASEMENT.z1).toBe(true);
    expect(RED_BUTTON.x > STAIRWELL.x1 + 1 || RED_BUTTON.z > STAIRWELL.z1 + 1).toBe(true);
  });
  it('antes del sótano, el botón rojo está en una esquina de la casa mediana sin tocar paredes, la cama ni la puerta', () => {
    const { x, z } = RED_BUTTON_HOUSE, half = 0.35, wall = 0.3;
    expect(x + half).toBeLessThan(MEDIUM_HOUSE.x1 - wall);      // no se mete en la pared de la derecha
    expect(z - half).toBeGreaterThan(MEDIUM_HOUSE.z0 + wall);   // ni en la de adelante
    expect(MEDIUM_HOUSE.x1 - x).toBeLessThan(1.5);              // está en la esquina
    expect(z - MEDIUM_HOUSE.z0).toBeLessThan(1.5);
    const bed = { x0: 27.75, x1: 29.25, z0: 7.75, z1: 10.25 };
    expect(x - half > bed.x1 || z + half < bed.z0).toBe(true);   // lejos de la cama
    expect(Math.hypot(x - HOUSE_VISIT.door.x, z - HOUSE_VISIT.door.z)).toBeGreaterThan(5);   // y de la puerta
  });
});

describe('parkour con lava (modo turquesa)', () => {
  const steps = Array.from({ length: PARKOUR.steps }, (_, i) => parkourStep(i));
  it('tiene 50 escalones y es súper alto', () => {
    expect(steps).toHaveLength(50);
    expect(steps[49].y).toBeGreaterThan(60);
  });
  it('cada escalón se alcanza de un salto (tu salto llega a unos 2,6 m)', () => {
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1], b = steps[i];
      expect(b.y - a.y).toBeLessThanOrEqual(1.5);
      const half = (parkourSize(i - 1) + parkourSize(i)) / 2;
      const gap = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z)) - half; // espacio entre los bordes
      expect(gap).toBeLessThan(2.5);
    }
  });
  it('ningún escalón (ni la cima, que es más grande) queda encima de otro: no te pegas en la cabeza', () => {
    for (let i = 0; i < steps.length; i++) for (let j = i + 1; j < steps.length; j++) {
      const a = steps[i], b = steps[j], half = (parkourSize(i) + parkourSize(j)) / 2 + 0.45; // + tu ancho
      const overlapXZ = Math.abs(a.x - b.x) < half && Math.abs(a.z - b.z) < half;
      if (overlapXZ) expect(b.y - a.y).toBeGreaterThan(4);
    }
  });
  it('la lava sube 1 m por segundo y da tiempo de escapar (más de 1,2 s por escalón)', () => {
    expect(lavaHeight(0)).toBe(LAVA.start);
    expect(lavaHeight(10) - lavaHeight(5)).toBe(5);
    for (const s of steps) {
      const t = (s.y - LAVA.start) / LAVA.speed;                    // cuándo llega la lava a ese escalón
      expect(t / (steps.indexOf(s) + 1)).toBeGreaterThan(1.2);
    }
  });
  it('el bot rojo sigue tu camino un poco atrás', () => {
    const trail = [{ t: 0, x: 0, y: 1, z: 0 }, { t: 1, x: 4, y: 1, z: 0 }, { t: 2, x: 4, y: 3, z: 4 }];
    expect(followTrail(trail, 1, 1)).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(followTrail(trail, 1.5, 1)).toMatchObject({ x: 2, y: 1, z: 0 });
    expect(followTrail(trail, 9, 1)).toMatchObject({ x: 4, y: 3, z: 4 });
    expect(followTrail([], 1, 1)).toBeNull();
  });
});

describe('los 10 minijuegos', () => {
  it('hay uno por cada bot, en el mismo orden de colores', () => {
    expect(MINIGAMES).toHaveLength(BOT_COLORS.length);
    expect(MINIGAMES.map(m => m.bot)).toEqual(['amarillo', 'naranja', 'rosa', 'morado', 'azul', 'celeste', 'turquesa', 'verde lima', 'magenta', 'coral']);
    expect(new Set(MINIGAMES.map(m => m.id)).size).toBe(10);
  });
  it('los premios que pediste', () => {
    const r = id => MINIGAMES.find(m => m.id === id).reward;
    expect(r('crates')).toEqual({ boxes: 5 });
    expect(r('flower')).toEqual({ coins: 20 });
    expect(r('dropper')).toEqual({ coins: 150 });
  });
  it('cada minijuego está lejos del mapa y de los demás', () => {
    for (let k = 0; k < 10; k++) {
      const o = minigameOrigin(k);
      expect(Math.hypot(o.x, o.z)).toBeGreaterThan(1500);
      if (k) expect(o.x - minigameOrigin(k - 1).x).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('amarillo: laberinto', () => {
  const maze = generateMaze(MAZE.cols, MAZE.rows, MAZE.seed);
  it('siempre es el mismo y se puede llegar a cualquier lado', () => {
    expect(generateMaze(MAZE.cols, MAZE.rows, MAZE.seed)).toEqual(maze);
    for (let r = 0; r < MAZE.rows; r++) for (let c = 0; c < MAZE.cols; c++) expect(mazePathLength(maze, [0, 0], [r, c])).toBeGreaterThanOrEqual(0);
  });
  it('es más o menos difícil: el camino a la casa da muchas vueltas', () => {
    const len = mazePathLength(maze, [0, 0], [MAZE.rows - 1, MAZE.cols - 1]);
    expect(len).toBeGreaterThan((MAZE.rows + MAZE.cols) * 1.3);  // bastante más que el camino directo (16)
  });
  it('cada vez sale uno distinto, pero nunca demasiado fácil', () => {
    const rnd = seededRandom(9), seen = new Set();
    for (let i = 0; i < 30; i++) {
      const m = pickMaze(rnd);
      seen.add(JSON.stringify(m.walls));
      expect(mazePathLength(m, [0, 0], [MAZE.rows - 1, MAZE.cols - 1])).toBeGreaterThanOrEqual(MAZE.minPath);
      for (let r = 0; r < MAZE.rows; r++) for (let c = 0; c < MAZE.cols; c++) expect(mazePathLength(m, [0, 0], [r, c])).toBeGreaterThanOrEqual(0);
    }
    expect(seen.size).toBe(30);
  });
});

describe('naranja: cajas grandes', () => {
  it('las 5 cajas empiezan adentro, sin encimarse, y caben por la puerta', () => {
    expect(CRATES.start).toHaveLength(5);
    for (const [x, z] of CRATES.start) expect(crateOutside(x, z)).toBe(false);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const [a, b] = [CRATES.start[i], CRATES.start[j]];
      expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThan(CRATES.size);
    }
    expect(CRATES.doorHalf * 2).toBeGreaterThan(CRATES.size + 0.3);
  });
});

describe('morado: dropper', () => {
  const layers = dropperLayers();
  it('caes 200 m: empieza arriba y los pisos rojos están por todo el camino', () => {
    expect(DROPPER.top).toBeGreaterThanOrEqual(200);
    expect(layers).toHaveLength(DROPPER.layers);
    expect(layers[layers.length - 1].y).toBeGreaterThan(10);
  });
  it('cada hueco está dentro del tubo y en otro lugar que el anterior', () => {
    for (let i = 0; i < layers.length; i++) {
      const h = layers[i].hole;
      expect(Math.abs(h.x) + DROPPER.hole / 2).toBeLessThan(DROPPER.half);
      expect(Math.abs(h.z) + DROPPER.hole / 2).toBeLessThan(DROPPER.half);
      if (i) expect(Math.hypot(h.x - layers[i - 1].hole.x, h.z - layers[i - 1].hole.z)).toBeGreaterThanOrEqual(3);
    }
  });
  it('da tiempo de moverte al siguiente hueco mientras caes (con caída máxima de 18 m/s)', () => {
    const secondsBetweenLayers = DROPPER.gap / DROPPER.maxFall;
    const worstMove = Math.hypot(2 * (DROPPER.half - DROPPER.hole / 2), 2 * (DROPPER.half - DROPPER.hole / 2));
    expect(secondsBetweenLayers * 12).toBeGreaterThan(worstMove); // a 12 m/s llegas aunque esté en la otra punta
    const pad = dropperPad();
    expect(Math.abs(pad.x) + DROPPER.pad / 2).toBeLessThan(DROPPER.half);
  });
});

describe('azul: delfines que saltan de lado', () => {
  const D = DOLPHINS;
  it('son 10 y las filas se alcanzan de un salto, del muelle a la ballena', () => {
    expect(D.count).toBe(10);
    const rows = [1.4, ...Array.from({ length: D.count }, (_, i) => dolphinLane(i)), D.whaleZ - D.whaleSize[2] / 2];
    for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBeLessThanOrEqual(6.5);
  });
  it('cada delfín sale del agua, salta de lado y se vuelve a esconder', () => {
    let up = 0, down = 0;
    for (let t = 0; t < 36; t += 0.05) { const L = dolphinLeap(3, t); if (L.up) { up++; expect(L.y).toBeGreaterThanOrEqual(0); expect(L.y).toBeLessThanOrEqual(D.peak); expect(Math.abs(L.x)).toBeLessThanOrEqual(D.span / 2); } else down++; }
    expect(up).toBeGreaterThan(0); expect(down).toBeGreaterThan(0);
  });
  it('estilo de rotación izquierda-derecha: solo miran a un lado o al otro, sin inclinarse', () => {
    for (let t = 0; t < 10; t += 0.1) for (let i = 0; i < D.count; i++) {
      const L = dolphinLeap(i, t);
      expect([1, -1]).toContain(L.dir);
      expect(L.pitch).toBeUndefined();   // no hay inclinación
    }
    expect(dolphinLeap(0, 0).dir).toBe(-dolphinLeap(1, 0).dir);   // uno salta a la derecha y el siguiente a la izquierda
  });
  it('siempre hay un momento en que el siguiente delfín también está afuera (para saltar de uno a otro)', () => {
    for (let i = 0; i + 1 < D.count; i++) {
      let both = 0;
      for (let t = 0; t < D.leap + D.under; t += 0.05) if (dolphinLeap(i, t).up && dolphinLeap(i + 1, t).up) both += 0.05;
      expect(both).toBeGreaterThan(1);
    }
  });
});

describe('celeste y coral: nubes', () => {
  it('10 nubes que se alcanzan de un salto', () => {
    const c = cloudPath(10, 3, 0.6);
    expect(c).toHaveLength(10);
    for (let i = 1; i < c.length; i++) {
      const gap = Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z) - CLOUD_SIZE;
      expect(gap).toBeLessThan(3);
      expect(c[i].y - c[i - 1].y).toBeLessThanOrEqual(1.5);
    }
  });
  it('las nubes que suben (coral) también se alcanzan', () => {
    const c = cloudPath(16, 9, 1.3);
    for (let i = 1; i < c.length; i++) expect(c[i].y - c[i - 1].y).toBeLessThanOrEqual(1.5);
  });
});

describe('verde lima: árboles', () => {
  it('20 árboles con sus círculos', () => {
    const t = treeCircles();
    expect(t).toHaveLength(20);
    expect(t.flat().length).toBe(20 * TREES.circlesPerTree);
  });
  it('los árboles no se chocan entre sí ni con el punto de inicio', () => {
    const S = TREES.spots;
    for (let i = 0; i < S.length; i++) {
      expect(Math.hypot(S[i][0], S[i][1] + 4)).toBeGreaterThan(6);
      for (let j = i + 1; j < S.length; j++) expect(Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1])).toBeGreaterThan(5.5);
    }
  });
  it('el limón cambia de lugar, pero siempre está en un árbol que existe', () => {
    const rnd = seededRandom(3), places = new Set();
    for (let i = 0; i < 50; i++) {
      const L = pickLemon(rnd);
      expect(L.tree).toBeGreaterThanOrEqual(0); expect(L.tree).toBeLessThan(20);
      expect(L.slot).toBeGreaterThanOrEqual(0); expect(L.slot).toBeLessThan(TREES.circlesPerTree);
      places.add(L.tree);
    }
    expect(places.size).toBeGreaterThan(10);
  });
});

describe('magenta: meteoritos', () => {
  it('caen siempre dentro de la arena', () => {
    for (const r1 of [0, 0.3, 0.99]) for (const r2 of [0, 0.5, 0.999]) {
      const p = meteorSpot(r1, r2);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(METEORS.radius);
    }
    expect(METEORS.survive).toBe(30);
  });
  it('no te puedes salir de la arena (ni a los backrooms)', () => {
    const p = clampToArea(100, 0, { r: METEORS.wall });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(METEORS.wall);
    expect(clampToArea(3, 4, { r: METEORS.wall })).toEqual({ x: 3, z: 4 });
    expect(METEORS.wall).toBeLessThan(METEORS.radius);
  });
  it('en un rectángulo te quedas dentro', () => {
    expect(clampToArea(-50, 50, { x0: -7, x1: 7, z0: -7, z1: 7 })).toEqual({ x: -7, z: 7 });
  });
});

describe('rosa: la flor', () => {
  it('tú eres más rápido que la flor, así que se puede alcanzar', () => {
    expect(GARDEN.flowerSpeed).toBeGreaterThan(12);   // corriendo es más rápida que tú…
    const avg = (GARDEN.flowerSpeed * GARDEN.sprint + GARDEN.restSpeed * GARDEN.rest) / (GARDEN.sprint + GARDEN.rest);
    expect(avg).toBeLessThan(12);                       // …pero se cansa, y en promedio eres más rápido
    expect(flowerTired(0)).toBe(false);
    expect(flowerTired(GARDEN.sprint + 0.1)).toBe(true);
    expect(flowerTired(GARDEN.sprint + GARDEN.rest + 0.1)).toBe(false);
    expect(GARDEN.half * 2).toBe(15);   // jardín de 15 × 15 m
    expect(GARDEN.waterRange).toBeGreaterThan(3);
  });
});

describe('los asistentes rodean tu casa', () => {
  const H = MEDIUM_HOUSE;   // x 20–32, z 4–14
  it('sabe si una línea cruza la casa', () => {
    expect(segmentHitsRect(15, 9, 40, 9, H)).toBe(true);    // la atraviesa de lado a lado
    expect(segmentHitsRect(15, 20, 40, 20, H)).toBe(false); // pasa por detrás
    expect(segmentHitsRect(15, 9, 18, 9, H)).toBe(false);   // se queda antes de llegar
  });
  it('si la casa no estorba, va directo', () => {
    expect(detourAround(10, 20, 10, -20, H)).toEqual({ x: 10, z: -20 });
  });
  it('si la casa estorba, va primero a una esquina y desde ahí ya no la cruza', () => {
    const w = detourAround(26, 25, 26, -20, H);   // detrás de la casa y la moneda adelante
    expect(w).not.toEqual({ x: 26, z: -20 });
    expect(insideRect(w.x, w.z, H)).toBe(false);
    expect(segmentHitsRect(26, 25, w.x, w.z, H)).toBe(false);
  });
});

describe('mundo al revés', () => {
  it('es un modo aparte de los 10 minijuegos de los bots', () => {
    expect(MINIGAMES).toHaveLength(10);
    expect(minigameDef(INVERTED_K)).toBe(INVERTED);
    expect(minigameDef(0)).toBe(MINIGAMES[0]);
    expect(INVERTED.catches).toBe(10);
    expect(INVERTED.reward).toEqual({ coins: 10, boxes: 10 });
  });
  it('los colores se invierten (y dos veces vuelven a ser los mismos)', () => {
    expect(invertColor(0xffffff)).toBe(0x000000);
    expect(invertColor(0xffd400)).toBe(0x002bff);   // la línea amarilla se vuelve azul
    expect(invertColor(invertColor(0x5fa83a))).toBe(0x5fa83a);
  });
  it('el jugador huye hacia la moneda que está lejos del gigante', () => {
    const coins = [{ x: 0, z: -5 }, { x: 0, z: -40 }];
    expect(fleeCoin({ x: 0, z: -20 }, { x: 0, z: -8 }, coins)).toBe(1);
    expect(fleeCoin({ x: 0, z: -20 }, { x: 0, z: -38 }, coins)).toBe(0);
  });
  it('con las mejoras corre más, pero nunca demasiado', () => {
    expect(botSpeedAfter(0)).toBe(INVERTED.botSpeed);
    expect(botSpeedAfter(1)).toBeGreaterThan(botSpeedAfter(0));
    expect(botSpeedAfter(100)).toBe(INVERTED.botMaxSpeed);
  });
  it('con tu salto de gigante avanzas más rápido que él aunque tenga todas las mejoras', () => {
    expect(12 * INVERTED.lunge).toBeGreaterThan(INVERTED.botMaxSpeed);
  });
  it('las partidas viejas (sin trofeos) se cargan sin problema', () => {
    const old = JSON.stringify({ v: 1, coins: 1, boxes: 0, levels: {}, dayPhase: 0.5, pos: { x: 0, y: 0, z: 0 } });
    expect(parseSave(old, []).trophies).toEqual([]);
  });
});

describe('pueblo y misiones', () => {
  it('hay 10 casas, una por cada color de bot, en tu mitad y sin chocar entre sí', () => {
    const H = VILLAGE.houses;
    expect(H).toHaveLength(BOT_COLORS.length);
    for (let i = 0; i < H.length; i++) {
      expect(H[i].z).toBeGreaterThan(BOT_MIN_Z + 10);
      expect(Math.abs(H[i].x) + VILLAGE.size / 2).toBeLessThan(92);
      for (let j = i + 1; j < H.length; j++) expect(Math.abs(H[i].x - H[j].x) > VILLAGE.size + 4 || Math.abs(H[i].z - H[j].z) > VILLAGE.size + 4).toBe(true);
    }
  });
  it('las casas no tapan tu casa, el parque, la tienda de estilo, el trampolín ni la cámara del mundo al revés', () => {
    for (const [x, z] of [[28, 11], [STYLE_STALL.x, STYLE_STALL.z], [-28, 22], [-18, 18], [82, 82], [73.5, 82]]) expect(nearVillageHouse(x, z, 3)).toBe(false);
  });
  it('los bots tontos no se meten a las casas del pueblo, y la puerta del bot grande queda afuera', () => {
    for (let i = 0; i < 10; i++) { const h = VILLAGE.houses[i]; expect(botCanGo(h.x, h.z)).toBe(false); const d = villageDoor(i); expect(nearVillageHouse(d.x, d.z, 0.5)).toBe(false); }
  });
  it('cada día cada bot tiene una misión, y cambian de un día a otro', () => {
    const a = tasksForDay(1), b = tasksForDay(2);
    expect(a).toHaveLength(10);
    for (let i = 1; i < 10; i++) expect(a[i].id).not.toBe(a[i - 1].id);
    expect(a.map(t => t.id).join()).not.toBe(b.map(t => t.id).join());
    expect(tasksForDay(1)).toEqual(a);
  });
  it('las cosas perdidas aparecen donde dice la misión (y nunca dentro de una casa)', () => {
    const rnd = seededRandom(4);
    for (let i = 0; i < 100; i++) {
      const g = taskSpot('giant', rnd); expect(g.z).toBeLessThan(-1.5); expect(Math.abs(g.x)).toBeLessThanOrEqual(80);
      const m = taskSpot('mine', rnd); expect(m.z).toBeGreaterThan(1.5); expect(nearVillageHouse(m.x, m.z, 0)).toBe(false);
    }
  });
  it('una misión está lista cuando tienes lo que el bot necesita', () => {
    const rock = TASKS.find(t => t.id === 'rock'), apples = TASKS.find(t => t.id === 'apples');
    expect(taskReady(rock, 0)).toBe(false); expect(taskReady(rock, 1)).toBe(true);
    expect(taskReady(apples, 4)).toBe(false); expect(taskReady(apples, 5)).toBe(true);
    for (const t of TASKS) expect((t.reward.coins || 0) + (t.reward.boxes || 0)).toBeGreaterThan(0);
  });
});
