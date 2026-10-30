import { describe, it, expect } from 'vitest';
import {
  ARENA_AN, plataformasAN, desplazamientoAN, portalesAN, portalCerca,
  GUIA_COMO, GUIA_QUE_HAGO, textoQueHago, lugarDelGuia, GUIA_COLORES, siguienteColorGuia, MINIGAMES as MINIGAMES_G,
  lugaresArboles, lugaresPasto, libreDePasto, ZONAS_SIN_PASTO, ARBOLES, sombreroDeBot, SOMBREROS_BOTS, VILLAGE as VILLAGE_P, BIG_HOUSE as BIG_HOUSE_P,
  ESCALA, TERRENOS, CARROS, CARRO, carroPos, CIRCUITO, largoCircuito, partesCarro, destinoTrampolin, MEDIODIA, faseDeLuz, cajasPieza, escaleraCanasta, cajasTerreno, escondites, OJO, tapanVista, lineaDeVista, BOT_ESC, botVe, ordenEscondites,
  collideWalls, moveAndCollide, boxHit,
  upgradePrice, fmt, sunElevation, isNightPhase, clockText, hourToPhase,
  launchSpeedForHeight, advanceOnBelt, beltItemIsBox, beltItemY, beltSpeed, extraLineSlot, MAIN_LINES, MAX_EXTRA_BOX_LINES, MAX_EXTRA_BAG_LINES, productReward, BAG_VALUE, nearestIndex, assistantSpeed, ASSIST_SPEED_MAX,
  normalizeName, saveKey, serializeSave, parseSave,
  BIG_HOUSE, BASEMENT, STAIRWELL, groundHeight, FACTORY, factoryLineSlot, inFactory, squashStretch, SQUASH, ACHIEVEMENTS, achievementById, coinAchievementsFor, TROPHY_TABLE, trophySpot, VILLAGE_HOUSE, wallPieces, insideVillageHouse, villageBed, villageEntrance, villageExit, slabPieces, missingFor, canAfford,
  mountainRing, MOUNTAIN_WALL_INSET, seededRandom,
  blasterStats,
  COSMETICS, DEFAULT_COLOR, emptyStyle, toggleEquip, parseStyle, cosmeticById,
  noteFrequency, COIN_NOTES, ambientVolume, bitcrush, footstepInterval,
  distanceGain, distanceCutoff, STYLE_STALL, BOT_COLORS, BOT_SCALE, MINIGAME_BOT_SCALE, BOT_MIN_Z, botCanGo, randomBotTarget,
  SWINGS, swingAngle, SLIDE, slidePoint,
  HOUSE_VISIT_CHANCE, HOUSE_VISIT, RED_BUTTON, RED_BUTTON_HOUSE, PARKOUR, parkourStep, parkourSize, LAVA, lavaHeight, followTrail,
  MINIGAMES, minigameOrigin, MAZE, generateMaze, mazePathLength, pickMaze, pickLemon, clampToArea, flowerTired, MEDIUM_HOUSE, insideRect, segmentHitsRect, detourAround, INVERTED, INVERTED_K, minigameDef, invertColor, fleeCoin, botSpeedAfter, CRATES, crateOutside, GARDEN, DROPPER, dropperLayers, dropperPad,
  ESCUELA, ESCUELA_K, ESCUELA_PREGUNTAS, escuelaSiguiente, escuelaMezclar, SALON, salonSillas, sillaCercana, cercaDeLaProfe, deLaProfe, preguntasDeLaClase, escaparHTML,
  NO_MIRES, torreNoMires, huecoEntre, separacion, huecoMaxDesde, subeDesdeTramp, cajasDe, decoracionTorre, ETAPAS, etapaDe, TRAMPOLIN, ALTO_JUGADOR, OVNI, ovniDesplazamiento, HIELO, alcanceSimple, alcanceDoble, huecoLejos, puedeDobleSalto, DOBLE_SALTO, deslizar, debeReaparecer, BATERIA, gastarBateria, cargarBateria, hayBateria,
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
    expect(parseSave(serializeSave(game), LEVELS)).toEqual({ ...game, spooky: 0, spookyT: 0, disfraces: [], disfraz: null });
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
      spooky: 0, spookyT: 0, disfraces: [], disfraz: null,
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

describe('fábrica subterránea', () => {
  const slots = [0, 1, 2, 3, 4].flatMap(i => [factoryLineSlot('box', i), factoryLineSlot('bag', i)]);
  // Lo que ocupa cada cinta: desde el marco hasta el plato y su tolva (radio 1,3)
  const area = ({ x0, len, z }) => ({ x0: x0 - 0.3, x1: x0 + len + 1.6 + 1.3, z0: z - 1.3, z1: z + 1.3 });
  it('cuesta 2000 monedas y 1000 cajas', () => {
    expect(FACTORY.cost).toEqual({ coins: 2000, boxes: 1000 });
  });
  it('las 10 cintas caben adentro, con lugar para los trabajadores en las dos puntas', () => {
    for (const s of slots.map(area)) {
      expect(s.x0 - 2.5).toBeGreaterThan(FACTORY.x0 + 0.5);   // trabajador de la izquierda + la pared
      expect(s.x1 + 2.5).toBeLessThan(FACTORY.x1);            // trabajador de la derecha
      expect(s.z0).toBeGreaterThan(FACTORY.z0);
      expect(s.z1).toBeLessThan(FACTORY.z1);
    }
  });
  it('entre cinta y cinta hay un pasillo de más de 2,5 m para caminar', () => {
    const zs = slots.map(s => s.z).sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1] - 2 * 1.3).toBeGreaterThan(2.5);   // 1,3 = media máquina
  });
  it('está al lado del sótano, a la misma altura, y la puerta queda lejos del botón rojo', () => {
    expect(FACTORY.x0).toBe(BASEMENT.x1);
    expect(FACTORY.y).toBe(BASEMENT.y);
    expect(FACTORY.door.z0).toBeGreaterThan(BASEMENT.z0); expect(FACTORY.door.z1).toBeLessThan(BASEMENT.z1);
    expect(RED_BUTTON.z < FACTORY.door.z0 - 1 || RED_BUTTON.z > FACTORY.door.z1 + 1).toBe(true);
  });
  it('el piso de la fábrica solo existe después de comprarla', () => {
    expect(groundHeight(55, 30, true, false)).toBe(0);
    expect(groundHeight(55, 30, true, true)).toBe(FACTORY.y);
    expect(groundHeight(25, 11, true, true)).toBe(BASEMENT.y);   // el sótano sigue igual
    expect(inFactory(30, 30)).toBe(false);
  });
});

describe('estirar y aplastar al saltar', () => {
  it('parado en el piso (hace rato) no cambia', () => {
    expect(squashStretch(0, false, 5)).toEqual({ tall: 1, wide: 1 });
  });
  it('en el aire se estira, pero nunca más del máximo', () => {
    expect(squashStretch(10, true, 0).tall).toBeGreaterThan(1);
    expect(squashStretch(-200, true, 0).tall).toBeCloseTo(1 + SQUASH.maxStretch);
  });
  it('justo al caer se aplasta, y después vuelve a 1', () => {
    expect(squashStretch(0, false, 0).tall).toBeCloseTo(1 - SQUASH.landSquash);
    expect(squashStretch(0, false, SQUASH.landTime).tall).toBe(1);
  });
  it('si se estira hacia arriba se adelgaza (parece de goma)', () => {
    const r = squashStretch(15, true, 0);
    expect(r.wide).toBeLessThan(1);
    expect(r.tall * r.wide * r.wide).toBeCloseTo(1);   // el "tamaño" total se mantiene
  });
});

describe('logros (trofeos)', () => {
  it('son los 6 de Mathias, con su nombre y descripción exactos', () => {
    expect(ACHIEVEMENTS.map(a => [a.name, a.desc])).toEqual([
      ['¡Muchas gracias!', 'Obtuviste este logro ayudando a un bot'],
      ['Pequeños ahorros', 'Conseguiste 15 monedas'],
      ['Soy un billete', 'Ganaste 1.000 monedas'],
      ['Compra exitosa', 'Compraste algo por primera vez'],
      ['!etsanaG¡', 'Ganaste en el Mundo al Revés'],
      ['Boing boing', 'Saltaste por primera vez en el trampolín'],
    ]);
  });
  it('el de diamante es el mismo trofeo que ya existía (sigue sobre el armario)', () => {
    expect(achievementById('diamante').where).toBe('wardrobe');
    expect(INVERTED.trophy).toBe('diamante');
  });
  it('logros de monedas: 15 y 1.000', () => {
    expect(coinAchievementsFor(14)).toEqual([]);
    expect(coinAchievementsFor(15)).toEqual(['ahorros']);
    expect(coinAchievementsFor(999)).toEqual(['ahorros']);
    expect(coinAchievementsFor(1000)).toEqual(['ahorros', 'billete']);
  });
  it('la mesa está en el sótano, lejos de la escalera y del botón rojo, y cada trofeo tiene su lugar en ella', () => {
    expect(TROPHY_TABLE.x0).toBeGreaterThan(BASEMENT.x0); expect(TROPHY_TABLE.z0).toBeGreaterThan(BASEMENT.z0); expect(TROPHY_TABLE.z1).toBeLessThan(BASEMENT.z1);
    expect(STAIRWELL.x0 - TROPHY_TABLE.x1).toBeGreaterThan(5);
    const spots = ACHIEVEMENTS.filter(a => a.where === 'table').map(a => trophySpot(a.id));
    for (const p of spots) { expect(p.z).toBeGreaterThan(TROPHY_TABLE.z0); expect(p.z).toBeLessThan(TROPHY_TABLE.z1); }
    for (let i = 1; i < spots.length; i++) expect(spots[i].z - spots[i - 1].z).toBeGreaterThan(2);   // no se tocan
    expect(trophySpot('diamante')).toBeNull();
  });
});

describe('modo Escuela', () => {
  it('es otro minijuego extra, con su propio lugar lejos de todo', () => {
    expect(ESCUELA_K).toBe(MINIGAMES.length + 1);
    expect(minigameDef(ESCUELA_K)).toBe(ESCUELA);
    expect(minigameDef(INVERTED_K)).toBe(INVERTED);   // el Mundo al Revés sigue igual
    const o = minigameOrigin(ESCUELA_K);
    for (let k = 0; k < ESCUELA_K; k++) {
      const p = minigameOrigin(k);
      expect(Math.hypot(o.x - p.x, o.z - p.z)).toBeGreaterThanOrEqual(1000);   // el Mundo al Revés mide 108 m: sobra espacio
    }
    expect(Math.hypot(o.x, o.z)).toBeGreaterThan(1500);
  });
  it('el salón tiene 12 sillas: adelante a la izquierda "No mires abajo" y atrás a la derecha "Escondidas"', () => {
    const sillas = salonSillas();
    expect(sillas).toHaveLength(12);
    expect(sillas.filter(s => s.modo)).toEqual([sillas[0], sillas[1], sillas[2], sillas[3], sillas[11]]);
    expect(sillas[1].modo).toBe('carrera'); expect(sillas[2].modo).toBe('spleef');
    expect(sillas[3].modo).toBe('atrapadas');   // la tercera: adelante a la derecha
    expect(sillas[0].modo).toBe('nomires');
    expect(sillas[11].modo).toBe('escondidas');
    // la de Escondidas: la última fila (z más chico) y la más a la derecha (x más chico, mirando al pizarrón)
    for (const s of sillas) { expect(s.z).toBeGreaterThanOrEqual(sillas[11].z); expect(s.x).toBeGreaterThanOrEqual(sillas[11].x); }
    // adelante = z más grande · izquierda (mirando al pizarrón) = x más grande
    for (const s of sillas) { expect(s.z).toBeLessThanOrEqual(sillas[0].z); expect(s.x).toBeLessThanOrEqual(sillas[0].x); }
    // todas caben dentro del salón
    for (const s of sillas) { expect(Math.abs(s.x)).toBeLessThan(SALON.ancho / 2 - 1); expect(Math.abs(s.z)).toBeLessThan(SALON.largo / 2 - 1); }
  });
  it('sabe junto a qué silla estás', () => {
    const sillas = salonSillas();
    expect(sillaCercana(sillas[0].x + 0.5, sillas[0].z, sillas)).toBe(0);
    expect(sillaCercana(sillas[5].x, sillas[5].z - 1, sillas)).toBe(5);
    expect(sillaCercana(0, 11, sillas)).toBe(-1);   // junto al pizarrón no hay sillas
  });
});

describe('No mires abajo: la torre', () => {
  const torre = torreNoMires();
  it('siempre sale igual (tiene semilla)', () => {
    expect(torreNoMires()).toEqual(torre);
  });
  it('empieza abajo y termina a 1000 m con la meta', () => {
    expect(torre[0].tipo).toBe('inicio');
    expect(torre.at(-1)).toMatchObject({ tipo: 'meta', y: NO_MIRES.altura });
    expect(torre.filter(p => p.tipo === 'meta')).toHaveLength(1);
    expect(torre.length).toBeGreaterThan(400);   // ¡muchas plataformas!
  });
  it('cada plataforma sube y se alcanza desde la anterior (de un salto o con trampolín)', () => {
    const subeSalto = 12.5 ** 2 / (2 * 30);   // lo más alto que llegas saltando (≈ 2,6 m)
    for (let i = 1; i < torre.length; i++) {
      const a = torre[i - 1], b = torre[i], sube = b.y - a.y;
      expect(sube).toBeGreaterThan(0);   // solo suben
      if (a.salto) {
        expect(sube).toBeLessThanOrEqual(subeDesdeTramp(a.salto)[1] + 1e-9);
        expect(sube).toBeLessThan(a.salto - 0.5);   // el trampolín te lanza más alto que eso, con margen
      } else {
        // si alguno es un ovni que sube y baja, cuenta lo más alto que puede quedar
        const extra = (a.mueve?.eje === 'y' ? a.mueve.amp : 0) + (b.mueve?.eje === 'y' ? b.mueve.amp : 0);
        expect(sube + extra).toBeLessThan(subeSalto - 0.3);
      }
      const hueco = huecoEntre(a, b);
      if (b.lejos) {   // un salto lejano: no llegas con un salto, pero sí (con margen) con doble salto
        expect(hueco).toBeGreaterThan(alcanceSimple(sube));
        expect(hueco).toBeLessThanOrEqual(alcanceDoble(sube) * 0.6 + 1e-9);
      } else expect(hueco).toBeLessThanOrEqual(huecoMaxDesde(a) + 1e-9);   // los demás, de un salto (y con margen)
      expect(separacion(a, b)).toBeGreaterThan(0.25);                     // y no se enciman
    }
  });
  it('hay saltos cortos y saltos lejanos (de doble salto), y más lejanos en las etapas difíciles', () => {
    const lejos = n => torre.filter(p => p.etapa === n && p.lejos).length;
    const cortos = n => torre.filter((p, i) => i && p.etapa === n && !p.lejos && huecoEntre(torre[i - 1], p) <= NO_MIRES.huecoMax).length;
    for (const et of ETAPAS) expect(cortos(et.n)).toBeGreaterThan(0);
    const facil = [1, 2, 3, 4, 5].reduce((s, n) => s + lejos(n), 0), dificil = [6, 7, 8, 9, 10].reduce((s, n) => s + lejos(n), 0);
    expect(facil).toBeGreaterThan(3);
    expect(dificil).toBeGreaterThan(facil);
    expect(torre[1].lejos).toBe(false);   // el primer salto, fácil
  });
  it('hay un checkpoint cada 30 m (30, 60 … 990)', () => {
    const cps = torre.filter(p => p.tipo === 'checkpoint').map(p => p.y);
    expect(cps).toEqual(Array.from({ length: 33 }, (_, i) => (i + 1) * 30));
  });
  it('ninguna plataforma tapa a otra de cerca (ni el salto de un trampolín)', () => {
    for (let i = 0; i < torre.length; i++) {
      const alto = torre[i].salto ? torre[i].salto + 4 : 4.5;
      for (let j = i + 2; j < torre.length && torre[j].y - torre[i].y < alto; j++) expect(separacion(torre[i], torre[j])).toBeGreaterThan(0.25);
    }
  });
  it('hay 10 etapas de 100 m, y cada plataforma es de la etapa de su altura', () => {
    expect(ETAPAS).toHaveLength(10);
    expect(etapaDe(0).n).toBe(1); expect(etapaDe(99.9).n).toBe(1); expect(etapaDe(100).n).toBe(2);
    expect(etapaDe(230).id).toBe('oceano'); expect(etapaDe(1000).n).toBe(10);
    for (const p of torre) expect(p.etapa).toBe(etapaDe(p.y).n);
    for (const et of ETAPAS) expect(torre.filter(p => p.etapa === et.n && p.tipo === 'normal').length).toBeGreaterThan(8);
  });
  it('cada etapa es más difícil: plataformas más chicas y huecos más largos', () => {
    for (let i = 1; i < ETAPAS.length; i++) {
      if (ETAPAS[i].id !== 'espacio' && ETAPAS[i - 1].id !== 'espacio') expect(ETAPAS[i].lado[0]).toBeLessThanOrEqual(ETAPAS[i - 1].lado[0]);   // (los ovnis tienen muchos tamaños)
      expect(ETAPAS[i].hueco[1]).toBeGreaterThanOrEqual(ETAPAS[i - 1].hueco[1] - 0.4);
    }
    expect(ETAPAS[9].lado[1]).toBeLessThan(ETAPAS[0].lado[0]);
    expect(ETAPAS[9].hueco[1]).toBeGreaterThan(ETAPAS[0].hueco[1] * 2);
  });
  it('las piezas son del tema de su etapa', () => {
    const piezas = n => new Set(torre.filter(p => p.etapa === n && p.tipo === 'normal').map(p => p.pieza));
    expect([...piezas(1)].every(p => ['arena', 'balde'].includes(p))).toBe(true);
    expect(piezas(2).has('pino') && piezas(2).has('descanso')).toBe(true);
    expect(piezas(3).has('delfin') && piezas(3).has('ballena')).toBe(true);
    expect(piezas(4).has('tele') && piezas(4).has('telePlana')).toBe(true);
    expect(piezas(5).has('ovni') && piezas(5).has('ovniMueve')).toBe(true);
    expect([...piezas(7)].every(p => p.startsWith('neon'))).toBe(true);
    expect(piezas(8).has('tramp') && piezas(8).has('trampPalido')).toBe(true);
    expect(piezas(9).has('hielo') && piezas(9).has('tramp')).toBe(true);
    expect(piezas(10).size).toBeGreaterThanOrEqual(7);   // el masacote: de todo
    expect(torre.some(p => p.etapa === 3 && p.giro)).toBe(true);   // hay plataformas giradas
  });
  it('las cajas para chocar quedan dentro de la plataforma (aunque esté girada)', () => {
    for (const p of torre) for (const c of cajasDe(p)) {
      const caja = { x: p.x + c.x, z: p.z + c.z, ancho: c.hw * 2, largo: c.hd * 2 };
      // cada esquina de la caja está dentro del rectángulo de la plataforma
      const [ea, el] = [[Math.cos(p.giro || 0), -Math.sin(p.giro || 0)], [Math.sin(p.giro || 0), Math.cos(p.giro || 0)]];
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const dx = caja.x + sx * c.hw - p.x, dz = caja.z + sz * c.hd - p.z;
        expect(Math.abs(dx * ea[0] + dz * ea[1])).toBeLessThanOrEqual(p.ancho / 2 + 1e-6);
        expect(Math.abs(dx * el[0] + dz * el[1])).toBeLessThanOrEqual(p.largo / 2 + 1e-6);
      }
    }
  });
  it('solo vuelves al checkpoint si caes al vacío (al piso de abajo de la torre)', () => {
    expect(debeReaparecer(0, true)).toBe(true);       // tocaste el piso de abajo
    expect(debeReaparecer(-3, false)).toBe(true);     // y más abajo todavía
    expect(debeReaparecer(0.2, false)).toBe(false);   // en el aire, todavía no
    expect(debeReaparecer(100, true)).toBe(false);    // caíste a una plataforma más abajo: de malas, a seguir desde ahí
    expect(debeReaparecer(NO_MIRES.inicioY, true)).toBe(false);   // en la plataforma de inicio no pasa nada
  });
  it('la decoración queda por fuera del camino', () => {
    for (const d of decoracionTorre()) expect(Math.hypot(d.x, d.z)).toBeGreaterThan(NO_MIRES.radio + 6);
  });
});

describe('No mires abajo: ovnis, trampolines y hielo', () => {
  it('los ovnis se mueven de ida y vuelta, sin pasarse de su recorrido', () => {
    const m = { amp: OVNI.amp, periodo: 4 };
    expect(ovniDesplazamiento(m, 0)).toBeCloseTo(0);
    expect(ovniDesplazamiento(m, 1)).toBeCloseTo(OVNI.amp);
    expect(ovniDesplazamiento(m, 3)).toBeCloseTo(-OVNI.amp);
    expect(ovniDesplazamiento(m, 4)).toBeCloseTo(0);
  });
  it('los trampolines lanzan a 2 veces tu altura, y los pálidos a 3 veces', () => {
    expect(TRAMPOLIN.salto).toBe(2 * ALTO_JUGADOR);
    expect(TRAMPOLIN.saltoPalido).toBe(3 * ALTO_JUGADOR);
    expect(subeDesdeTramp(TRAMPOLIN.salto)[1]).toBeGreaterThan(12.5 ** 2 / 60);   // más que un salto normal
    expect(subeDesdeTramp(TRAMPOLIN.saltoPalido)[0]).toBeGreaterThan(subeDesdeTramp(TRAMPOLIN.salto)[1]);   // a esas solo llegas con un pálido
    expect(TRAMPOLIN.saltoPalido).toBeGreaterThan(TRAMPOLIN.salto);
    expect(subeDesdeTramp(TRAMPOLIN.saltoPalido)[1]).toBeGreaterThan(subeDesdeTramp(TRAMPOLIN.salto)[1]);
  });
  it('con doble salto llegas más lejos y más alto que con un salto', () => {
    expect(alcanceSimple(0)).toBeCloseTo(12 * 2 * 12.5 / 30);   // corres 12 m/s durante todo el salto
    expect(alcanceDoble(2)).toBeGreaterThan(alcanceSimple(2) * 1.8);
    expect(alcanceSimple(3)).toBe(0);      // 3 m más arriba no llegas con un salto…
    expect(alcanceDoble(3)).toBeGreaterThan(0);   // …pero con doble salto sí
    const [a, b] = huecoLejos(1.5); expect(a).toBeGreaterThan(alcanceSimple(1.5)); expect(b).toBeLessThan(alcanceDoble(1.5));
  });
  it('el doble salto: solo en el aire, al volver a apretar, una vez y con batería', () => {
    const base = { enElPiso: false, saltosEnAire: 0, apretoRecien: true, bateria: 500 };
    expect(puedeDobleSalto(base)).toBe(true);
    expect(puedeDobleSalto({ ...base, enElPiso: true })).toBe(false);        // en el piso es el salto normal
    expect(puedeDobleSalto({ ...base, apretoRecien: false })).toBe(false);   // dejar Espacio apretado no cuenta
    expect(puedeDobleSalto({ ...base, saltosEnAire: 1 })).toBe(false);       // solo uno más
    expect(puedeDobleSalto({ ...base, bateria: 0 })).toBe(false);            // sin batería, nada
    expect(DOBLE_SALTO.max).toBe(1);
  });
  it('en el hielo la velocidad cambia de a poco (y al soltar sigues deslizándote)', () => {
    let v = { x: 0, z: 0 };
    v = deslizar(v, { x: 12, z: 0 }, 0.1, HIELO.agarre);
    expect(v.x).toBeGreaterThan(0); expect(v.x).toBeLessThan(6);   // toma impulso de a poco
    for (let i = 0; i < 50; i++) v = deslizar(v, { x: 12, z: 0 }, 0.1, HIELO.agarre);
    expect(v.x).toBeCloseTo(12, 0);
    v = deslizar(v, { x: 0, z: 0 }, 0.1, HIELO.agarre);   // soltaste las teclas…
    expect(v.x).toBeGreaterThan(8);                        // …y sigues resbalando
  });
});

describe('No mires abajo: la batería', () => {
  it('caminar y saltar gastan batería', () => {
    expect(gastarBateria(1000, 1, true, false)).toBe(1000 - BATERIA.porSegundo);
    expect(gastarBateria(1000, 0.5, false, true)).toBe(1000 - BATERIA.porSalto);
    expect(gastarBateria(1000, 1, true, true)).toBe(1000 - BATERIA.porSegundo - BATERIA.porSalto);
    expect(gastarBateria(1000, 1, false, false)).toBe(1000);   // quieto no gasta
  });
  it('nunca baja de 0', () => {
    expect(gastarBateria(30, 1, true, true)).toBe(0);
    expect(gastarBateria(0, 1, true, false)).toBe(0);
  });
  it('responder bien da 2000; mal, nada', () => {
    expect(cargarBateria(0, true)).toBe(2000);
    expect(cargarBateria(500, true)).toBe(2500);
    expect(cargarBateria(500, false)).toBe(500);
  });
  it('sin batería no te puedes mover', () => {
    expect(hayBateria(0)).toBe(false);
    expect(hayBateria(1)).toBe(true);
  });
});

describe('preguntas de la escuela', () => {
  it('hay unas 30 preguntas, todas con 4 opciones distintas', () => {
    expect(ESCUELA_PREGUNTAS.length).toBeGreaterThanOrEqual(30);
    for (const q of ESCUELA_PREGUNTAS) {
      expect(q.op).toHaveLength(4);
      expect(new Set(q.op).size).toBe(4);
    }
  });
  it('la siguiente pregunta nunca es la misma que la anterior', () => {
    const rnd = seededRandom(3), n = ESCUELA_PREGUNTAS.length;
    let prev = escuelaSiguiente(-1, rnd);
    const vistas = new Set([prev]);
    for (let i = 0; i < 500; i++) {
      const q = escuelaSiguiente(prev, rnd);
      expect(q).not.toBe(prev);
      expect(q).toBeGreaterThanOrEqual(0); expect(q).toBeLessThan(n);
      vistas.add(q); prev = q;
    }
    expect(vistas.size).toBe(n);   // con el tiempo salen todas
    expect(escuelaSiguiente(5, () => 0.999, 6)).toBe(4);   // la última posible, saltándose la 5
    expect(escuelaSiguiente(0, () => 0, 6)).toBe(1);
  });
  it('mezclar las opciones no pierde la correcta', () => {
    const rnd = seededRandom(9), q = ESCUELA_PREGUNTAS[0], lugares = new Set();
    for (let i = 0; i < 50; i++) {
      const m = escuelaMezclar(q, rnd);
      expect([...m.opciones].sort()).toEqual([...q.op].sort());
      expect(m.opciones[m.correcta]).toBe(q.op[0]);
      lugares.add(m.correcta);
    }
    expect(lugares.size).toBe(4);   // la buena no está siempre en el mismo botón
  });
});

describe('modo profe', () => {
  it('la silla de la profe está entre su escritorio y el pizarrón, sin encimarse', () => {
    const { profe, escritorio, largo } = SALON;
    expect(profe.z - 0.5).toBeGreaterThan(escritorio.z1);   // el asiento mide 1 m: no toca el escritorio
    expect(profe.z + 0.6).toBeLessThan(largo / 2);           // ni la pared del pizarrón
    expect(cercaDeLaProfe(profe.x + 1.5, profe.z)).toBe(true);   // te paras al lado
    expect(cercaDeLaProfe(0, 0)).toBe(false);
    for (const s of salonSillas()) expect(cercaDeLaProfe(s.x, s.z)).toBe(false);   // no se confunde con las de los alumnos
  });
  it('las preguntas del profe se pasan al formato del banco (la correcta primero)', () => {
    expect(deLaProfe({ p: '¿2 + 2?', r: ['3', '4', '5', '6'], ok: 1 })).toEqual({ p: '¿2 + 2?', op: ['4', '3', '5', '6'] });
    const m = escuelaMezclar(deLaProfe({ p: 'x', r: ['a', 'b', 'c', 'd'], ok: 3 }), seededRandom(2));
    expect(m.opciones[m.correcta]).toBe('d');
  });
  it('las del profe reemplazan a las normales; sin ellas vuelven las normales', () => {
    const profe = [{ p: 'uno', r: ['a', 'b', 'c', 'd'], ok: 0 }, { p: 'dos', r: ['e', 'f', 'g', 'h'], ok: 2 }];
    expect(preguntasDeLaClase(profe).map(q => q.p)).toEqual(['uno', 'dos']);
    expect(preguntasDeLaClase([])).toBe(ESCUELA_PREGUNTAS);
    expect(preguntasDeLaClase(null)).toBe(ESCUELA_PREGUNTAS);
  });
  it('con una sola pregunta del profe, igual se puede elegir la siguiente', () => {
    expect(escuelaSiguiente(-1, () => 0.5, 1)).toBe(0);
    expect(escuelaSiguiente(0, () => 0.5, 1)).toBe(0);
  });
  it('un texto con HTML se muestra como texto (no se convierte en una imagen ni corre nada)', () => {
    const malo = '<img src=x onerror=alert(1)>';
    expect(escaparHTML(malo)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escaparHTML('"Tom & Jerry"')).toBe('&quot;Tom &amp; Jerry&quot;');
    expect(escaparHTML(malo)).not.toContain('<');
  });
});

describe('por dentro de las casas del pueblo', () => {
  const H = VILLAGE_HOUSE;
  it('una pared con una puerta y dos ventanas deja los huecos libres y tapa todo lo demás', () => {
    const holes = [{ c0: -0.7, c1: 0.7, y0: 0, y1: 2.3 }, { c0: -2.75, c1: -1.65, y0: 1.5, y1: 2.5 }, { c0: 1.65, c1: 2.75, y0: 1.5, y1: 2.5 }];
    const pieces = wallPieces(-3.5, 3.5, holes);
    const area = pieces.reduce((s, p) => s + (p.a1 - p.a0) * (p.y1 - p.y0), 0);
    const huecos = holes.reduce((s, h) => s + (h.c1 - h.c0) * (h.y1 - h.y0), 0);
    expect(area).toBeCloseTo(7 * H.height - huecos);   // toda la pared menos los huecos
    // por el hueco de la puerta se pasa: ninguna pieza tapa la puerta abajo
    expect(pieces.some(p => p.a0 < 0.7 && p.a1 > -0.7 && p.y0 < 2.3)).toBe(false);
  });
  it('sin huecos es una sola pared entera', () => {
    expect(wallPieces(0, 5, [])).toEqual([{ a0: 0, a1: 5, y0: 0, y1: H.height }]);
  });
  it('la cama, la entrada y el tapete quedan adentro; la salida queda afuera, frente a la puerta', () => {
    for (let i = 0; i < VILLAGE.houses.length; i++) {
      const b = villageBed(i), e = villageEntrance(i), x = villageExit(i), h = VILLAGE.houses[i];
      expect(insideVillageHouse(b.x, b.z, i)).toBe(true);
      expect(insideVillageHouse(e.x, e.z, i)).toBe(true);
      expect(insideVillageHouse(h.x, h.z + H.rug.dz, i)).toBe(true);
      expect(insideVillageHouse(x.x, x.z, i)).toBe(false);
      expect(x.z).toBeLessThan(h.z - VILLAGE.size / 2);   // la salida está del lado de la puerta
      expect(Math.abs(x.x - h.x)).toBeLessThan(H.door.w / 2);   // derecho por la puerta
    }
  });
  it('la cama no tapa el camino de la puerta al tapete', () => {
    expect(H.bed.dx - H.bed.w / 2).toBeGreaterThan(H.door.w / 2);
  });
});

describe('Escondidas: los terrenos gigantes', () => {
  const dentro = (c, x, z, y = 0, r = 0.5) => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r && y + 2 > c.y0 && y < c.y1;
  it('hay 3 terrenos y todo es 50 veces más grande', () => {
    expect(TERRENOS).toHaveLength(3);
    expect(ESCALA).toBe(50);
    const mesa = TERRENOS[0].piezas.find(p => p.t === 'mesa');
    expect(mesa.h).toBe(0.72 * ESCALA);   // una mesa de 72 cm mide 36 m
  });
  for (const T of TERRENOS) {
    const cajas = cajasTerreno(T), lugares = escondites(T);
    it(`${T.nombre}: las piezas caben en el cuarto y no se enciman en el piso`, () => {
      for (const p of T.piezas) {
        expect(Math.abs(p.x) + p.a / 2).toBeLessThanOrEqual(T.ancho / 2);
        expect(Math.abs(p.z) + p.l / 2).toBeLessThanOrEqual(T.largo / 2);
      }
      const solidas = T.piezas.filter(p => p.t !== 'decor' && !p.y && !p.debajoCama);   // (lo que está debajo de la cama va encimado a propósito)
      for (let i = 0; i < solidas.length; i++) for (let j = i + 1; j < solidas.length; j++) {
        const a = solidas[i], b = solidas[j];
        const separadas = Math.abs(a.x - b.x) >= (a.a + b.a) / 2 || Math.abs(a.z - b.z) >= (a.l + b.l) / 2;
        expect(separadas, `${a.estilo || a.t} y ${b.estilo || b.t}`).toBe(true);
      }
    });
    it(`${T.nombre}: los escondites y el lugar de inicio están libres (no adentro de algo)`, () => {
      expect(lugares.length).toBeGreaterThanOrEqual(4);
      for (const e of lugares) {
        expect(cajas.some(c => dentro(c, e.x, e.z, e.y)), `escondite ${e.x},${e.z}`).toBe(false);
        if (e.entrada) expect(cajas.some(c => dentro(c, e.entrada.x, e.entrada.z)), `entrada ${e.entrada.x},${e.entrada.z}`).toBe(false);
      }
      expect(cajas.some(c => dentro(c, T.spawn.x, T.spawn.z))).toBe(false);
      for (let k = 0; k < 8; k++) {   // los camaleones aparecen en un círculo alrededor del inicio
        const a = k / 8 * Math.PI * 2;
        expect(cajas.some(c => dentro(c, T.spawn.x + Math.cos(a) * 6, T.spawn.z + Math.sin(a) * 6))).toBe(false);
      }
    });
    it(`${T.nombre}: en las cuevas cabes (2 m de alto y 1 m de ancho, como tú)`, () => {
      for (const p of T.piezas.filter(q => q.t === 'cueva')) {
        const g = Math.max(0.6, Math.min(p.a, p.l) * 0.08);
        expect(p.h - g).toBeGreaterThan(2.2);
        expect(Math.min(p.a, p.l) - 2 * g).toBeGreaterThan(1.5);
      }
    });
  }
  it('la escalera de mano: cada peldaño sube poquito y no tapa al de abajo (no te golpeas la cabeza)', () => {
    for (const p of TERRENOS[1].piezas.filter(q => q.t === 'canasta')) {
      const peldanos = escaleraCanasta(p);
      expect(peldanos.at(-1).y1).toBe(p.h);   // el último, a la altura del borde
      for (let i = 1; i < peldanos.length; i++) {
        const a = peldanos[i - 1], b = peldanos[i];
        expect(b.y1 - a.y1).toBeLessThanOrEqual(1.5);   // el salto llega a 2,6 m
        const tapa = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
        expect(tapa).toBe(false);
      }
    }
  });
  it('el trampolín de la habitación te lanza más alto que la cama', () => {
    const T = TERRENOS[1], cama = T.piezas.find(p => p.t === 'cama'), tramp = T.piezas.find(p => p.t === 'trampolin');
    expect(tramp.salto).toBeGreaterThan(cama.h + 4);
    expect(cajasPieza(tramp)[0].salto).toBe(tramp.salto);
  });
  it('los trampolines del salón te llevan arriba de algo (una mesa, una silla o el escritorio)', () => {
    const T = TERRENOS[0], tramps = T.piezas.filter(p => p.t === 'trampolin');
    expect(tramps.length).toBeGreaterThanOrEqual(3);
    for (const tr of tramps) {
      const destino = destinoTrampolin(T, tr);
      expect(destino, `trampolín en ${tr.x}, ${tr.z}`).not.toBeNull();
      expect(destino.y1).toBeGreaterThan(15);              // algo alto que no alcanzas saltando
      expect(tr.salto).toBeGreaterThanOrEqual(destino.y1 + 1.5);
    }
    const alturas = tramps.map(tr => destinoTrampolin(T, tr).y1);
    expect(new Set(alturas).size).toBeGreaterThan(1);       // no todos llevan a la misma altura
  });
  it('a las manzanas de la cocina te puedes subir (con un terrón de azúcar de escalón)', () => {
    const T = TERRENOS[2], cajas = cajasTerreno(T), salto = 12.5 ** 2 / 60;   // ~2,6 m
    for (const m of T.piezas.filter(p => p.estilo === 'manzana')) {
      const arriba = cajasPieza(m)[0];
      expect(arriba.y1).toBeGreaterThan(salto);   // del piso no llegas…
      // …pero hay algo al lado (a menos de 2 m) desde donde sí: más bajito que tu salto y que te deja a menos de 2,4 m de la manzana
      const escalon = cajas.find(c => c !== arriba && c.y1 <= salto - 0.2 && arriba.y1 - c.y1 <= 2.4 &&
        Math.hypot(Math.max(0, c.x0 - arriba.x1, arriba.x0 - c.x1), Math.max(0, c.z0 - arriba.z1, arriba.z0 - c.z1)) <= 2);
      expect(escalon, `manzana en ${m.x}, ${m.z}`).toBeTruthy();
    }
  });
  it('los carros andan rápido por toda la habitación, siempre igual según el reloj', () => {
    expect(carroPos(0, 12.5)).toEqual(carroPos(0, 12.5));
    expect(CARRO.vel).toBeGreaterThan(12);              // más rápido que tú corriendo
    expect(largoCircuito()).toBeGreaterThan(400);       // una vuelta grande, no solo la alfombra
    const xs = [], zs = [];
    for (let t = 0; t < 60; t += 0.25) { const c = carroPos(0, t); xs.push(c.x); zs.push(c.z); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(150);
    // de un cuadro al siguiente se mueve poquito (no da saltos)
    for (let t = 0; t < 60; t += 1 / 60) { const a = carroPos(1, t), b = carroPos(1, t + 1 / 60); expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(CARRO.vel / 60 + 0.01); }
  });
  it('los carros nunca se meten en los muebles ni se salen del cuarto', () => {
    const T = TERRENOS[1], muebles = cajasTerreno(T).filter(c => c.y0 < CARRO.cabina && c.y1 > 0.5);
    for (let i = 0; i < CARROS.length; i++) for (let t = 0; t < largoCircuito() / CARRO.vel; t += 0.2) {
      const c = carroPos(i, t), { cubierta, cabina } = partesCarro(c.giro, i);
      for (const parte of [cubierta, cabina]) {
        const x0 = c.x + parte.x - parte.hw, x1 = c.x + parte.x + parte.hw, z0 = c.z + parte.z - parte.hd, z1 = c.z + parte.z + parte.hd;
        expect(Math.abs(c.x) + 8).toBeLessThan(T.ancho / 2);
        expect(Math.abs(c.z) + 8).toBeLessThan(T.largo / 2);
        const choca = muebles.find(m => x0 < m.x1 && m.x0 < x1 && z0 < m.z1 && m.z0 < z1);
        expect(choca, `carro ${i} en ${c.x.toFixed(0)}, ${c.z.toFixed(0)}`).toBeUndefined();
      }
    }
  });
  it('los 3 carros van separados (no chocan entre ellos)', () => {
    for (let t = 0; t < 40; t += 0.5) for (let i = 0; i < CARROS.length; i++) for (let j = i + 1; j < CARROS.length; j++) {
      const a = carroPos(i, t), b = carroPos(j, t);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(30);
    }
  });
  it('subirse es fácil: la cubierta está bajita, atrás, y la cabina adelante', () => {
    expect(CARRO.cubierta).toBeLessThan(1.5);
    const { cubierta, cabina } = partesCarro(0);   // mirando hacia +z
    expect(cubierta.z).toBeLessThan(0); expect(cabina.z).toBeGreaterThan(0);
    expect(cabina.top).toBeGreaterThan(2.6);   // la cabina no se salta: es una pared
    const giro90 = partesCarro(Math.PI / 2);     // mirando hacia +x: lo largo queda en x
    expect(giro90.cubierta.hw).toBeGreaterThan(giro90.cubierta.hd);
  });
  it('la línea de vista: una pared en medio tapa, el aire no', () => {
    const tapan = tapanVista([{ x0: -1, x1: 1, y0: 0, y1: 10, z0: -5, z1: 5 }, { x0: 10, x1: 12, y0: 20, y1: 30, z0: -5, z1: 5 }]);
    expect(tapan).toHaveLength(1);   // la de arriba (de 20 a 30 m) no tapa los ojos
    expect(lineaDeVista({ x: -5, z: 0 }, { x: 5, z: 0 }, tapan)).toBe(false);
    expect(lineaDeVista({ x: -5, z: 8 }, { x: 5, z: 8 }, tapan)).toBe(true);
  });
  it('el bot te ve si no hay nada en medio, y te oye si estás muy cerca', () => {
    const tapan = [{ x0: -1, x1: 1, y0: 0, y1: 10, z0: -5, z1: 5 }];
    expect(botVe({ x: -30, z: 8 }, { x: 30, z: 8 }, tapan)).toBe(true);          // se ve de lejos
    expect(botVe({ x: -50, z: 8 }, { x: 50, z: 8 }, tapan)).toBe(false);         // demasiado lejos
    expect(botVe({ x: -5, z: 0 }, { x: 5, z: 0 }, tapan)).toBe(false);           // la pared tapa…
    expect(botVe({ x: -3, z: 0 }, { x: 3, z: 0 }, tapan)).toBe(true);            // …pero tan cerca te oye
    expect(botVe({ x: 0, z: 20 }, { x: 2, z: 20, y: 27 }, tapan)).toBe(false);   // desde el piso no te ve arriba de la cama…
    expect(botVe({ x: 0, z: 20, y: 27 }, { x: 2, z: 20, y: 27.5 }, tapan)).toBe(true);   // …pero si él también subió, sí
    // Las cosas que tapan dependen de la altura de los ojos: una pared de 0 a 10 m no tapa a 27 m
    expect(botVe({ x: -30, z: 0, y: 27 }, { x: 30, z: 0, y: 27 }, tapan)).toBe(true);
    expect(botVe({ x: -30, z: 0 }, { x: 30, z: 0 }, tapan)).toBe(false);
  });
  it('el bot recorre los escondites en desorden, también los altos (sabe cómo subir)', () => {
    const lista = escondites(TERRENOS[1]), orden = ordenEscondites(lista, seededRandom(3));
    expect(new Set(orden).size).toBe(orden.length);
    expect(orden.length).toBe(lista.length);
    expect(orden.some(i => lista[i].alto)).toBe(true);
  });
  it('arriba de la cama: el bot va al trampolín, que lo lanza más alto que la cama, y baja caminando hasta el borde', () => {
    const T = TERRENOS[1], cama = T.piezas.find(p => p.t === 'cama'), tramp = T.piezas.find(p => p.t === 'trampolin');
    const e = escondites(T).find(q => q.alto && q.y >= cama.h - 1);
    expect(e.ruta[0]).toMatchObject({ x: tramp.x, z: tramp.z, tramp: true });
    expect(tramp.salto).toBeGreaterThan(cama.h + 2);
    expect(e.ruta.at(-1)).toMatchObject({ x: e.x, z: e.z, y: e.y });
    const borde = e.ruta[1];   // el primer punto sobre la cama: arriba del colchón y cerca del trampolín
    expect(Math.abs(borde.x - cama.x)).toBeLessThan(cama.a / 2);
    expect(Math.hypot(borde.x - tramp.x, borde.z - tramp.z)).toBeLessThan(25);
    expect(e.salida.at(-1).y).toBe(0);
    expect(Math.abs(e.salida.at(-1).x - cama.x)).toBeGreaterThan(cama.a / 2);   // termina afuera de la cama
  });
  it('adentro de la canasta: sube la escalera (cada peldaño se alcanza saltando) y sale por los cubos', () => {
    const T = TERRENOS[1], e = escondites(T).find(q => q.alto && q.y === 0), c = T.piezas.find(p => p.t === 'canasta' && Math.abs(e.x - p.x) < p.a / 2);
    expect(e.ruta[0].y).toBe(0);
    for (let i = 1; i < e.ruta.length - 1; i++) expect(e.ruta[i].y - e.ruta[i - 1].y).toBeLessThanOrEqual(1.5);   // el salto llega a 2,6 m
    expect(e.ruta.at(-2).y).toBe(c.h);   // el borde
    for (let i = 1; i < e.salida.length - 1; i++) expect(e.salida[i].y - e.salida[i - 1].y).toBeLessThanOrEqual(2.5);
    expect(e.salida.at(-2).y).toBe(c.h);
    const afuera = e.salida.at(-1);
    expect(Math.abs(afuera.z - c.z) > c.l / 2 || Math.abs(afuera.x - c.x) > c.a / 2).toBe(true);
  });
});

describe('en los modos de juego siempre es de día', () => {
  it('afuera la luz sigue el reloj; en un modo, siempre mediodía', () => {
    expect(faseDeLuz(0.1, false)).toBe(0.1);    // de noche en el pueblo
    expect(faseDeLuz(0.1, true)).toBe(MEDIODIA); // pero en un modo, de día
    expect(faseDeLuz(0.9, true)).toBe(0.5);
    expect(isNightPhase(faseDeLuz(0.0, true))).toBe(false);
  });
});

describe('🌳 pasto, árboles y mini sombreros', () => {
  const arboles = lugaresArboles();
  it('pone los árboles dentro del mapa, en lugares libres y separados', () => {
    expect(arboles.length).toBeGreaterThanOrEqual(25);
    for (const a of arboles) {
      expect(Math.abs(a.x)).toBeLessThanOrEqual(ARBOLES.hasta);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(ARBOLES.hasta);
      expect(libreDePasto(a.x, a.z, ZONAS_SIN_PASTO, 3)).toBe(true);
      expect(['redondo', 'pino']).toContain(a.tipo);
    }
    for (let i = 0; i < arboles.length; i++) for (let j = i + 1; j < arboles.length; j++)
      expect(Math.hypot(arboles[i].x - arboles[j].x, arboles[i].z - arboles[j].z)).toBeGreaterThanOrEqual(ARBOLES.separacion);
  });
  it('siempre salen los mismos árboles (así todos los amigos ven el mismo bosque)', () => {
    expect(lugaresArboles()).toEqual(arboles);
  });
  it('hay algunos árboles en la mitad del gigante para esconderse', () => {
    expect(arboles.filter(a => a.z < -15 && Math.abs(a.x) < 80).length).toBeGreaterThanOrEqual(4);
  });
  it('no pone pasto ni árboles en las casas, el pueblo ni la línea amarilla', () => {
    expect(libreDePasto((BIG_HOUSE_P.x0 + BIG_HOUSE_P.x1) / 2, (BIG_HOUSE_P.z0 + BIG_HOUSE_P.z1) / 2)).toBe(false);
    const h = VILLAGE_P.houses[0];
    expect(libreDePasto(h.x, h.z)).toBe(false);
    expect(libreDePasto(h.x, h.z - VILLAGE_P.doorOut)).toBe(false);   // la puerta, donde espera el bot grande
    expect(libreDePasto(40, 1)).toBe(false);                          // la línea amarilla
    expect(libreDePasto(-60, -50)).toBe(true);                        // el campo del gigante
  });
  it('las matas de pasto caen solo donde hay lugar', () => {
    const matas = lugaresPasto(500, (x, z) => libreDePasto(x, z));
    expect(matas.length).toBe(500);
    for (const p of matas) { expect(libreDePasto(p.x, p.z)).toBe(true); expect(Math.abs(p.x)).toBeLessThanOrEqual(96); }
  });
  it('cada bot chiquito tiene un sombrero, y los 3 tipos aparecen', () => {
    const tipos = Array.from({ length: 10 }, (_, i) => sombreroDeBot(i));
    expect(new Set(tipos)).toEqual(new Set(SOMBREROS_BOTS));
    expect(tipos[0]).toBe('helice'); expect(tipos[1]).toBe('gorra'); expect(tipos[2]).toBe('lana');
  });
});

describe('🤖 bot guía', () => {
  it('«¿Cómo juego?» explica WASD, las flechas y ESPACIO', () => {
    expect(GUIA_COMO.teclado).toContain('WASD');
    expect(GUIA_COMO.teclado).toContain('flechas izquierda/derecha');
    expect(GUIA_COMO.teclado).toContain('ESPACIO');
  });
  it('en el mundo normal explica el objetivo: monedas y mejoras', () => {
    expect(lugarDelGuia()).toBe('mundo');
    expect(textoQueHago('mundo')).toMatch(/monedas/);
    expect(textoQueHago('mundo')).toMatch(/mejoras/);
  });
  it('cada minijuego tiene su resumen', () => {
    for (const m of MINIGAMES_G) { expect(lugarDelGuia({ id: m.id })).toBe(m.id); expect(GUIA_QUE_HAGO[m.id]).toBeTruthy(); }
    expect(lugarDelGuia({ id: 'inverted' })).toBe('inverted');
  });
  it('en el Modo Escuela dice algo distinto en el salón, la torre y Escondidas', () => {
    expect(lugarDelGuia({ id: 'escuela', fase: 'salon' })).toBe('salon');
    expect(lugarDelGuia({ id: 'escuela', fase: 'nomires' })).toBe('nomires');
    expect(lugarDelGuia({ id: 'escuela', fase: 'escondidas', rol: 'buscar' })).toBe('buscar');
    expect(lugarDelGuia({ id: 'escuela', fase: 'escondidas', rol: 'esconder' })).toBe('esconder');
    expect(lugarDelGuia({ id: 'escuela', fase: 'escondidas', rol: 'esconder', fantasma: true })).toBe('fantasma');
    const textos = ['salon', 'nomires', 'buscar', 'esconder', 'fantasma'].map(textoQueHago);
    expect(new Set(textos).size).toBe(5);
  });
  it('un lugar desconocido no rompe nada: explica el mundo normal', () => {
    expect(lugarDelGuia({ id: 'no-existe' })).toBe('mundo');
    expect(textoQueHago('no-existe')).toBe(GUIA_QUE_HAGO.mundo);
  });
  it('C pasa por todos los colores y vuelve al primero', () => {
    let i = 0; const vistos = new Set([i]);
    for (let n = 0; n < GUIA_COLORES.length - 1; n++) { i = siguienteColorGuia(i); vistos.add(i); }
    expect(vistos.size).toBe(GUIA_COLORES.length);
    expect(siguienteColorGuia(GUIA_COLORES.length - 1)).toBe(0);
  });
});

describe('Atrapadas Nocivas: la arena', () => {
  const P = plataformasAN(), portales = portalesAN();
  const dentro = (p, x, z, m = 0) => Math.abs(x - p.x) <= p.lado / 2 + m && Math.abs(z - p.z) <= p.lado / 2 + m;
  // El hueco entre dos plataformas (lo que se mueven de lado cuenta en x: en el peor momento están así de cerca)
  const ampX = p => (p.mueve?.eje === 'x' ? p.mueve.amp : 0), ampY = p => (p.mueve?.eje === 'y' ? p.mueve.amp : 0);
  const hueco = (a, b, peor = false) => Math.max(Math.abs(a.x - b.x) - (a.lado + b.lado) / 2 - (peor ? ampX(a) + ampX(b) : 0), Math.abs(a.z - b.z) - (a.lado + b.lado) / 2);
  it('hay muchas plataformas, algunas que se mueven de lado y otras de arriba abajo', () => {
    expect(P.length).toBeGreaterThan(50);
    expect(P.some(p => p.mueve && p.mueve.eje === 'x')).toBe(true);
    expect(P.some(p => p.mueve && p.mueve.eje === 'y')).toBe(true);
    expect(plataformasAN()).toEqual(P);   // siempre igual (semilla)
    for (const p of P) expect(Math.abs(p.x) + p.lado / 2 + 2).toBeLessThan(ARENA_AN.mitad);
  });
  it('las plataformas que se mueven van de ida y vuelta según el reloj', () => {
    const p = P.find(q => q.mueve);
    expect(desplazamientoAN(p, 0)).toBeCloseTo(0);
    expect(Math.abs(desplazamientoAN(p, p.mueve.periodo / 4))).toBeCloseTo(p.mueve.amp);
    expect(desplazamientoAN(P.find(q => !q.mueve), 3)).toBe(0);
  });
  it('cada escalera se sube saltando (y llega a la cima por el puente)', () => {
    const salto = 12.5 ** 2 / 60;
    for (let c = 0; c < ARENA_AN.cadenas; c++) {
      const cad = P.filter(p => p.cadena === c);
      expect(cad[0].y).toBeLessThan(salto - 0.4);   // la primera, desde el piso
      for (let i = 1; i < cad.length; i++) {
        const a = cad[i - 1], b = cad[i], extra = (a.mueve?.eje === 'y' ? a.mueve.amp : 0) + (b.mueve?.eje === 'y' ? b.mueve.amp : 0);
        expect(b.y - a.y + extra).toBeLessThan(salto - 0.3);
        expect(hueco(a, b) + ampX(a) + ampX(b)).toBeLessThan(3.6);   // en el peor momento, igual se llega (el salto de lado llega a más de 3 m)
        expect(hueco(a, b, true)).toBeGreaterThan(0.2);              // no se enciman
      }
      const cima = P.find(p => p.tipo === 'cima'), ultimo = cad[cad.length - 1];
      expect(hueco(ultimo, cima)).toBeLessThan(3);
      expect(ultimo.y).toBe(cima.y);
    }
  });
  it('ninguna plataforma tapa a otra de cerca', () => {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (Math.abs(a.y - b.y) < 4 + ampY(a) + ampY(b)) expect(hueco(a, b, true), `${i} y ${j}`).toBeGreaterThan(0.2);
    }
  });
  it('los portales van de a pares, cada uno sale en el otro, y la salida queda arriba de algo (o en el piso)', () => {
    expect(portales.length).toBeGreaterThanOrEqual(10);
    portales.forEach((p, i) => {
      expect(portales[p.par].par).toBe(i);
      expect(Math.hypot(p.x - portales[p.par].x, p.z - portales[p.par].z) + Math.abs(p.y - portales[p.par].y)).toBeGreaterThan(15);
      if (p.y > 0) {
        const base = P.find(q => Math.abs(q.y - p.y) < 0.01 && dentro(q, p.x, p.z));
        expect(base, `portal ${i}`).toBeTruthy();
        expect(base.mueve).toBeNull();                       // los portales no están en plataformas que se mueven
        expect(dentro(base, p.salida.x, p.salida.z, -0.6)).toBe(true);
      } else {
        // en el piso: nada bajito encima (no te golpeas la cabeza al entrar)
        for (const q of P) if (q.y < 4) expect(dentro(q, p.x, p.z, 1)).toBe(false);
      }
    });
  });
  it('sabe si estás adentro de un portal', () => {
    const p = portales[0];
    expect(portalCerca({ x: p.x + 0.5, y: p.y, z: p.z }, portales)).toBe(0);
    expect(portalCerca({ x: p.x + 5, y: p.y, z: p.z }, portales)).toBe(-1);
    expect(portalCerca({ x: p.x, y: p.y + 10, z: p.z }, portales)).toBe(-1);   // pasando por arriba no cuenta
  });
});

import { ARENA_AN_X, TERRENO_X, centroArenaAN, salidaAN, zonaAN, zonaEsc, portalesAN as portalesAN2, minigameOrigin as mo, ESCUELA_K as EK, TERRENOS as TT } from '../src/logic.js';
import { vigilarPos as vigilar } from '../src/red.js';
describe('🛡️ Las zonas que vigila el servidor', () => {
  it('la arena está donde la dibuja el juego', () => {
    const o = mo(EK);
    expect(centroArenaAN()).toEqual({ x: o.x + ARENA_AN_X, z: o.z });
  });
  it('las salidas: en un círculo de 12 m, todas dentro de la zona y separadas', () => {
    const c = centroArenaAN(), n = 6, s = Array.from({ length: n }, (_, k) => salidaAN(k, n));
    s.forEach(p => expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(12));
    expect(Math.hypot(s[0].x - s[1].x, s[0].z - s[1].z)).toBeGreaterThan(8);
    const z = zonaAN(0, n); s.forEach(p => { expect(p.x).toBeGreaterThan(z.x0); expect(p.x).toBeLessThan(z.x1); });
  });
  it('cada portal tiene su salto (de su entrada a la salida de su par) y vale para el servidor', () => {
    const z = zonaAN(0, 2), c = centroArenaAN(), P = portalesAN2();
    expect(z.saltos).toHaveLength(P.length);
    P.forEach(p => {
      const d = P[p.par], antes = { x: c.x + p.x + 1, y: p.y, z: c.z + p.z, t: 0, llego: true };   // (1 m: lo que avanzas antes de entrar)
      const v = vigilar(antes, { x: c.x + d.salida.x + 1, y: d.y, z: c.z + d.salida.z }, 100, z);
      expect(v.corregido).toBe(false);
    });
  });
  it('Escondidas: la zona es el terreno y deja ir arriba de un carro corriendo', () => {
    TT.forEach((T, i) => {
      const z = zonaEsc(i), o = mo(EK);
      expect(z.x1 - z.x0).toBe(T.ancho - 2); expect(z.llegada.x).toBe(o.x + TERRENO_X[i] + T.spawn.x);
      expect(z.velMax).toBeGreaterThanOrEqual(27);
    });
  });
});
import { ARENA_VEL_MAX } from '../src/logic.js';
import { AN as AN2 } from '../src/red.js';
import { reboteCaminar, estaCaminando, volumenPasos, puedeAvisar, AVISO_LASER } from '../src/logic.js';
describe('🚶 Caminar, pasos, salto y el láser en la Escuela', () => {
  it('el rebote al caminar: sube y baja hasta 8 cm; quieto, nada', () => {
    expect(reboteCaminar(1.2, false)).toBe(0);
    const r = [0, 0.5, 1, 1.5, 2, 2.5, 3].map(f => reboteCaminar(f, true));
    r.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.08); });
    expect(Math.max(...r)).toBeGreaterThan(0.07);
  });
  it('caminar es moverse por el piso (ni quieto, ni en el aire, ni un portal)', () => {
    expect(estaCaminando(12, true)).toBe(true);
    expect(estaCaminando(0.2, true)).toBe(false);
    expect(estaCaminando(12, false)).toBe(false);
    expect(estaCaminando(300, true)).toBe(false);
  });
  it('los pasos suenan más fuerte en tu mundo que en los modos', () => {
    expect(volumenPasos(true)).toBeGreaterThan(volumenPasos(false) * 2);
    expect(volumenPasos(true)).toBeLessThanOrEqual(1);
  });
  it('el aviso del láser: como mucho uno cada 3 s', () => {
    expect(puedeAvisar(null, 0)).toBe(true);
    expect(puedeAvisar(1000, 2000)).toBe(false);
    expect(puedeAvisar(1000, 1000 + AVISO_LASER.cadaMs)).toBe(true);
    expect(AVISO_LASER.texto).toBe('¿Qué estás intentando? Tienes que jugar, no aturdir a todos');
  });
});
import { cajasTortugas, TORTUGAS, TORTUGA, tortugaPos, partesTortuga, posEnRuta } from '../src/logic.js';
describe('🙈 Escondidas: trampolines, frutas, súper trampolines, dinosaurio, carros y tortugas', () => {
  const alcanzados = T => {   // las superficies altas a las que te lleva algún trampolín (o a las que llegas caminando desde ahí)
    const cajas = cajasTerreno(T), tapada = c => cajas.some(o => o !== c && Math.abs(o.y0 - c.y1) < 0.5 && o.x0 <= c.x0 && o.x1 >= c.x1 && o.z0 <= c.z0 && o.z1 >= c.z1);   // (la pata de una mesa: arriba tiene la mesa)
    const altos = cajas.slice(4).filter(c => c.y1 > 5 && Math.min(c.x1 - c.x0, c.z1 - c.z0) >= 3 && !c.salto && !tapada(c));
    const llego = new Set(T.piezas.filter(p => p.t === 'trampolin').map(tr => destinoTrampolin(T, tr)).filter(Boolean));
    let cambio = true;
    while (cambio) { cambio = false; for (const c of altos) if (!llego.has(c) && [...llego].some(d => Math.abs(d.y1 - c.y1) < 0.5 && Math.max(c.x0 - d.x1, d.x0 - c.x1, c.z0 - d.z1, d.z0 - c.z1) <= 1)) { llego.add(c); cambio = true; } }
    return { altos, llego };
  };
  it('cocina: a TODO lo alto (la mesa, las sillas, los muebles, el balde y el refri) se llega con algún trampolín', () => {
    const { altos, llego } = alcanzados(TERRENOS[2]);
    expect(altos.length).toBeGreaterThanOrEqual(8);
    for (const c of altos) expect(llego.has(c), `superficie a ${c.y1} m en ${((c.x0 + c.x1) / 2).toFixed(0)}, ${((c.z0 + c.z1) / 2).toFixed(0)}`).toBe(true);
    const refri = cajasTerreno(TERRENOS[2]).find(c => c.y1 === 90), amarillo = TERRENOS[2].piezas.find(p => p.color === 0xffd60a);
    expect(destinoTrampolin(TERRENOS[2], amarillo)).toEqual(refri);   // el amarillo te deja arriba del refri
    expect(TERRENOS[2].piezas.filter(p => ['naranja', 'limon', 'sandia'].includes(p.estilo)).length).toBeGreaterThanOrEqual(4);   // frutas que rebotan
  });
  it('súper trampolines: uno en cada terreno, mucho más altos que los normales, y te dejan arriba de algo', () => {
    TERRENOS.forEach(T => {
      const tr = T.piezas.filter(p => p.t === 'trampolin'), sup = tr.filter(p => p.super), normales = tr.filter(p => !p.super && p.color !== 0xffd60a);
      expect(sup.length).toBeGreaterThanOrEqual(1);
      for (const s of sup) { expect(s.salto).toBeGreaterThan(1.4 * Math.max(...normales.map(p => p.salto))); expect(destinoTrampolin(T, s)).not.toBeNull(); }
    });
  });
  it('el dinosaurio: 35 % del oso, debajo de la cama (sólido) y con lugar al lado para esconderse bajo la cobija', () => {
    const T = TERRENOS[1], dino = T.piezas.find(p => p.estilo === 'dino'), cama = T.piezas.find(p => p.t === 'cama');
    expect(dino.h).toBeGreaterThan(25 * 0.3); expect(dino.h).toBeLessThan(25 * 0.4);   // el oso mide unos 25 m
    expect(cajasPieza(dino)).toHaveLength(1);                                            // sólido
    expect(Math.abs(dino.x - cama.x)).toBeLessThan(cama.a / 2); expect(dino.h).toBeLessThan(15);   // debajo de la cama (la base está a 15 m)
    const lugar = T.extra.find(e => !e.alto && Math.abs(e.x - cama.x) < cama.a / 2 && Math.abs(e.z - cama.z) < cama.l / 2);
    expect(lugar).toBeTruthy(); expect(Math.hypot(lugar.x - dino.x, lugar.z - dino.z)).toBeLessThan(15);
  });
  it('los 3 carros son distintos (cada uno con su forma)', () => {
    expect(new Set(CARROS.map(c => c.tipo)).size).toBe(3);
    expect(new Set(CARROS.map((_, i) => partesCarro(0, i).cabina.top)).size).toBe(3);
    CARROS.forEach((_, i) => expect(partesCarro(0, i).cubierta.top).toBeLessThan(2.4));   // a todos te subes de un saltito
  });
  it('las tortugas de cuerda: despacito, siempre igual, te subes por la cola y no se meten en los muebles', () => {
    expect(TORTUGAS.length).toBeGreaterThanOrEqual(2); expect(TORTUGA.vel).toBeLessThan(4);
    expect(tortugaPos(1, 7.3)).toEqual(tortugaPos(1, 7.3));
    const { cola, caparazon } = partesTortuga(0);
    expect(cola.top).toBeLessThan(2.6); expect(caparazon.top - cola.top).toBeLessThan(2.6);   // de la cola al caparazón, de un salto
    const T = TERRENOS[1], muebles = cajasTerreno(T).filter(c => c.y0 < TORTUGA.caparazon && c.y1 > 0.5);
    for (let t = 0; t < 120; t += 0.5) for (const c of cajasTortugas(t)) {
      const choca = muebles.find(m => c.x0 < m.x1 && m.x0 < c.x1 && c.z0 < m.z1 && m.z0 < c.z1);
      expect(choca, `tortuga en ${c.x0.toFixed(0)}, ${c.z0.toFixed(0)}`).toBeUndefined();
    }
    const a = posEnRuta([[0, 0], [10, 0]], 1, 5), b = posEnRuta([[0, 0], [10, 0]], 1, 15);
    expect(a.x).toBeCloseTo(5); expect(b.x).toBeCloseTo(5);   // ida y vuelta
  });
});
import { elegirObjetivoAN, meAburro, MOTIVACION_AN } from '../src/logic.js';
describe('🎯 Atrapadas: la motivación del bot que tiene la mancha', () => {
  const yo = { x: 0, y: 0, z: 0 };
  it('persigue al más cercano que puede alcanzar (no al que está trepado muy alto)', () => {
    const c = [{ id: 1, x: 2, y: 10, z: 0 }, { id: 2, x: 9, y: 0, z: 0 }];
    expect(elegirObjetivoAN(yo, c, {}, 0)).toEqual({ id: 2, alcanzable: true });
  });
  it('si todos están altos, va por el más cercano igual (para intentar subir)', () => {
    expect(elegirObjetivoAN(yo, [{ id: 1, x: 2, y: 10, z: 0 }, { id: 3, x: 5, y: 12, z: 0 }], {}, 0)).toEqual({ id: 1, alcanzable: false });
  });
  it('al que ignora (por un rato) no lo persigue; después sí', () => {
    const c = [{ id: 1, x: 2, y: 0, z: 0 }, { id: 2, x: 9, y: 0, z: 0 }], ign = { 1: 6000 };
    expect(elegirObjetivoAN(yo, c, ign, 1000).id).toBe(2);
    expect(elegirObjetivoAN(yo, c, ign, 7000).id).toBe(1);
    expect(elegirObjetivoAN(yo, [{ id: 1, x: 2, y: 0, z: 0 }], ign, 1000)).toBeNull();
  });
  it('se aburre solo si está muy arriba y no avanza', () => {
    expect(meAburro(10, 9.8, 8, 0)).toBe(true);    // arriba y sin avanzar
    expect(meAburro(10, 6, 8, 0)).toBe(false);     // se está acercando
    expect(meAburro(10, 9.8, 1, 0)).toBe(false);   // está a su altura: no se rinde
    expect(MOTIVACION_AN.olvidoMs).toBeGreaterThan(MOTIVACION_AN.sinAvanceMs);
  });
});
import { letrerosEtapas, ETAPAS as ETAPAS_L } from '../src/logic.js';
describe('🗼 No mires abajo: letreros de las etapas', () => {
  it('hay un letrero por etapa, en su primera plataforma, con su nombre', () => {
    const plats = torreNoMires(), L = letrerosEtapas(plats);
    expect(L).toHaveLength(ETAPAS_L.length);
    L.forEach(l => {
      expect(plats[l.i].etapa).toBe(l.etapa);
      expect(plats.slice(0, l.i).every(p => p.etapa !== l.etapa)).toBe(true);   // la primera de esa etapa
      expect(l.texto).toContain(ETAPAS_L.find(e => e.n === l.etapa).nombre);
    });
  });
});
import { SPOOKY, sumarTiempoSpooky, DISFRACES, disfrazById, comprarDisfraz, ponerDisfraz, TIENDA_HALLOWEEN, cercaDelVendedor, SALON as SALON_H, salonSillas as sillasH } from '../src/logic.js';
import { DISFRACES_IDS } from '../src/red.js';
describe('🎃 Halloween: SpookyCoins y disfraces', () => {
  it('20 🎃 por cada minuto jugado (lo que sobra se guarda para el próximo minuto)', () => {
    expect(sumarTiempoSpooky(0, 30)).toEqual({ segundos: 30, ganados: 0 });
    expect(sumarTiempoSpooky(50, 15)).toEqual({ segundos: 5, ganados: 20 });
    expect(sumarTiempoSpooky(0, 185)).toEqual({ segundos: 5, ganados: 60 });   // 3 minutos y 5 segundos
    let s = 0, g = 0; for (let i = 0; i < 60 * 60 * 2; i++) { const r = sumarTiempoSpooky(s, 1 / 60); s = r.segundos; g += r.ganados; }
    expect(g).toBe(40);   // 2 minutos a 60 cuadros por segundo
    expect(SPOOKY.porGanar).toBe(30);
  });
  it('los disfraces: 5, con precios de 15 a 70, y "Arácnido puro" (15) y "Qué dulce" (30) como pidió Mathias', () => {
    expect(DISFRACES).toHaveLength(5);
    expect(disfrazById('aracnido')).toMatchObject({ nombre: 'Arácnido puro', precio: 15 });
    expect(disfrazById('dulce')).toMatchObject({ nombre: 'Qué dulce', precio: 30 });
    DISFRACES.forEach(d => { expect(d.precio).toBeGreaterThanOrEqual(15); expect(d.precio).toBeLessThanOrEqual(80); });
    expect(DISFRACES.map(d => d.id)).toEqual(DISFRACES_IDS);   // la lista del servidor es la misma
  });
  it('comprar: si alcanza se descuenta; si no, no; no se compra dos veces', () => {
    let r = comprarDisfraz(20, [], 'aracnido'); expect(r).toMatchObject({ ok: true, spooky: 5, disfraces: ['aracnido'] });
    expect(comprarDisfraz(5, r.disfraces, 'aracnido').ok).toBe(false);
    r = comprarDisfraz(10, [], 'dulce'); expect(r.ok).toBe(false); expect(r.motivo).toContain('20');
    expect(comprarDisfraz(999, [], 'nada').ok).toBe(false);
  });
  it('ponerse y sacarse: uno a la vez, solo los que tienes', () => {
    expect(ponerDisfraz(null, ['aracnido'], 'aracnido')).toBe('aracnido');
    expect(ponerDisfraz('aracnido', ['aracnido'], 'aracnido')).toBe(null);          // otra vez: te lo sacas
    expect(ponerDisfraz('aracnido', ['aracnido', 'dulce'], 'dulce')).toBe('dulce');  // cambias
    expect(ponerDisfraz(null, [], 'momia')).toBe(null);                              // no lo tienes
  });
  it('se guarda con la partida (y las partidas viejas empiezan sin nada)', () => {
    const base = { coins: 1, boxes: 0, levels: {}, dayPhase: 0.3, pos: { x: 0, y: 0, z: 0 }, style: emptyStyle(), trophies: [] };
    const d = parseSave(serializeSave({ ...base, spooky: 77, spookyT: 12.5, disfraces: ['dulce', 'trucho'], disfraz: 'dulce' }), []);
    expect(d).toMatchObject({ spooky: 77, spookyT: 12.5, disfraces: ['dulce'], disfraz: 'dulce' });
    const viejo = parseSave(JSON.stringify({ v: 1, coins: 3, levels: {}, pos: { x: 0, y: 0, z: 0 } }), []);
    expect(viejo).toMatchObject({ spooky: 0, spookyT: 0, disfraces: [], disfraz: null });
  });
  it('la tienda está en una esquina del salón, lejos de la puerta y de las sillas', () => {
    const T = TIENDA_HALLOWEEN;
    expect(Math.abs(T.x)).toBeLessThan(SALON_H.ancho / 2); expect(Math.abs(T.z)).toBeLessThan(SALON_H.largo / 2);
    expect(Math.abs(T.x - SALON_H.puerta.x)).toBeGreaterThan(5);
    sillasH().forEach(s => expect(Math.hypot(s.x - T.x, s.z - T.z)).toBeGreaterThan(2.5));
    expect(cercaDelVendedor(T.x + 1, T.z)).toBe(true); expect(cercaDelVendedor(0, 0)).toBe(false);
  });
});
import { ganaSpooky, ojosMilOjos, OJO_MIL } from '../src/logic.js';
describe('🎃 SpookyCoins: solo jugando de verdad', () => {
  it('ganas jugando: la torre, una ronda de Escondidas o de Atrapadas, y los minijuegos del mundo', () => {
    expect(ganaSpooky({ modo: 'escuela', fase: 'nomires' })).toBe(true);
    expect(ganaSpooky({ modo: 'escuela', fase: 'escondidas', enRonda: true })).toBe(true);
    expect(ganaSpooky({ modo: 'escuela', fase: 'atrapadas', enRonda: true })).toBe(true);
    expect(ganaSpooky({ modo: 'maze' })).toBe(true);
  });
  it('no ganas en el salón, mirando a GILBERT, en la zona rara, en un resultado, ni en tu mundo', () => {
    expect(ganaSpooky({ modo: 'escuela', fase: 'salon' })).toBe(false);
    expect(ganaSpooky({ modo: 'sandbox', fase: 'sala' })).toBe(false);
    expect(ganaSpooky({ modo: 'sandbox', fase: 'zona' })).toBe(false);
    expect(ganaSpooky({ modo: 'escuela', fase: 'atrapadas', enRonda: true, resultado: true })).toBe(false);
    expect(ganaSpooky({ modo: 'escuela', fase: 'escondidas', enRonda: false })).toBe(false);
    expect(ganaSpooky({})).toBe(false);
  });
});
describe('👁️ Mil ojos', () => {
  it('unos 20 ojos grandes, que no se enciman', () => {
    const o = ojosMilOjos();
    expect(o.length).toBeGreaterThanOrEqual(18); expect(o.length).toBeLessThanOrEqual(24);
    for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) expect(Math.hypot(o[i].x - o[j].x, o[i].y - o[j].y, o[i].z - o[j].z)).toBeGreaterThanOrEqual(2 * OJO_MIL);
    o.forEach(p => { expect(p.y).toBeGreaterThan(OJO_MIL); expect(p.y).toBeLessThan(2 - OJO_MIL); });
  });
});
import { arrastreDe, girarAlrededor, carroPos as carroPosA, CARRO as CARRO_A } from '../src/logic.js';
describe('🚗 Los carros y las tortugas te llevan encima', () => {
  it('un cuadro normal (15 m/s a 60 cuadros por segundo): te lleva lo mismo que avanzó el carro', () => {
    const a = carroPosA(0, 3), b = carroPosA(0, 3 + 1 / 60), m = arrastreDe(a, b);
    expect(Math.hypot(m.dx, m.dz)).toBeCloseTo(CARRO_A.vel / 60, 2);
  });
  it('si la compu se traba (un cuadro de medio segundo = 7,5 m), te lleva igual (no te caes)', () => {
    const m = arrastreDe({ x: 0, z: 0 }, { x: 7.5, z: 0 });
    expect(m).toEqual({ dx: 7.5, dz: 0 });
  });
  it('cuando empieza otra ronda el carro aparece en su lugar y ese cuadro NO te arrastra', () => {
    expect(arrastreDe(null, { x: 80, z: -40 })).toEqual({ dx: 0, dz: 0 });
  });
  it('si dobla, giras con él alrededor de su centro (y sigues arriba, a la misma distancia)', () => {
    const p = girarAlrededor({ x: 2, z: 0 }, { x: 0, z: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0); expect(p.z).toBeCloseTo(-2);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2);
  });
});
describe('🏃 Atrapadas: todos más rápidos', () => {
  it('todos corren a 15 y el servidor deja eso + lo que llevan las plataformas', () => {
    expect(AN2.vel).toBe(15);
    expect(ARENA_VEL_MAX).toBeGreaterThanOrEqual(AN2.vel + 3);
    expect(zonaAN(0, 2).velMax).toBe(ARENA_VEL_MAX);
  });
});

import { alturaMaxAN, soporteAN } from '../src/logic.js';
describe('🛡️ Atrapadas: la altura', () => {
  it('el techo de la arena es la plataforma más alta + un salto (y nada de volar a 300 m)', () => {
    const top = Math.max(...plataformasAN().map(p => p.y));
    expect(alturaMaxAN()).toBeGreaterThan(top + 2.5);
    expect(alturaMaxAN()).toBeLessThan(top + 6);
    expect(zonaAN(0, 2).yMax).toBe(alturaMaxAN());
  });
  it('todas las salidas de portal están por debajo del techo', () => {
    zonaAN(0, 2).saltos.forEach(s => expect(s.hasta.y).toBeLessThan(alturaMaxAN()));
  });
});
describe('🛡️ Atrapadas: lo que hay debajo', () => {
  it('saltar de un escalón al siguiente nunca es "volar": en el camino siempre hay soporte a un salto', () => {
    const P = plataformasAN().filter(p => p.tipo === 'escalera');
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1]; if (a.cadena !== b.cadena) continue;
      for (let f = 0; f <= 1; f += 0.1) expect(soporteAN(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f)).toBeGreaterThanOrEqual(Math.max(a.y, b.y) + 2.6 - 3.2);
    }
  });
  it('en el piso es 0; arriba de cada plataforma, su altura (o más)', () => {
    expect(soporteAN(0, 66)).toBe(0);   // lejos de todo (cerca del borde)
    plataformasAN().forEach(p => expect(soporteAN(p.x, p.z)).toBeGreaterThanOrEqual(p.y));
    const c = centroArenaAN(); expect(zonaAN(0, 2).soporte(c.x, c.z)).toBeGreaterThanOrEqual(32);   // la isla del centro, arriba de la cima
  });
});

import { CARRERA, pistaCarrera, posPlatCarrera, punoEn, guanteEn, golpePuno, golpeBarra, checkpointDe, salidaCarrera, enMetaCarrera, seCayoCarrera, puestosCarrera, soporteCarrera, zonaCarrera, origenCarrera, golpeValidoCarrera, cargarBateria as cargarB, ganaSpooky as ganaS } from '../src/logic.js';
import { vigilarPos as vigilar } from '../src/red.js';
describe('🏁 Carrera (como Fall Guys)', () => {
  const P = pistaCarrera(), Y = CARRERA.y0;
  const sobre = (x, z, t = 0) => P.plats.some(p => { const q = posPlatCarrera(p, t), hw = p.redonda ? p.r * 0.85 : p.ancho / 2, hd = p.redonda ? p.r * 0.85 : p.largo / 2; return Math.abs(x - q.x) <= hw && Math.abs(z - q.z) <= hd; });
  it('la pista (~540 m) tiene salida, 17 checkpoints (uno cada 30 m) y la meta; puños, ruedas con barras, discos, plataformas que se mueven y un escalón alto', () => {
    const cps = P.plats.filter(p => p.cp !== undefined).map(p => p.cp);
    expect(cps).toEqual(Array.from({ length: 18 }, (_, k) => k));
    expect(CARRERA.meta.x1).toBeGreaterThan(500); expect(CARRERA.meta.x1).toBeLessThan(600);
    P.plats.filter(p => p.tipo === 'checkpoint').forEach(p => expect(p.x - p.ancho / 2).toBe(p.cp * 30));
    expect(P.plats.some(p => p.tipo === 'meta')).toBe(true);
    expect(P.punos.length).toBeGreaterThanOrEqual(8); expect(P.barras.length).toBeGreaterThanOrEqual(4);
    expect(P.plats.filter(p => p.gira).length).toBeGreaterThanOrEqual(6); expect(P.plats.filter(p => p.mueve).length).toBeGreaterThanOrEqual(6);
    const esc = P.plats.find(p => p.tipo === 'escalon'); expect(esc.y - Y).toBeGreaterThan(12.5 ** 2 / 60);   // más alto que un salto: hace falta el doble salto
    expect(esc.y - Y).toBeLessThan(2 * 12.5 ** 2 / 60);                                                   // pero el doble salto sí llega
  });
  it('ningún hueco del camino es más largo de lo que alcanza un salto corriendo (12 m/s × 0,83 s ≈ 10 m): se puede terminar', () => {
    // A lo largo de la pista (en x): el hueco más largo sin ninguna plataforma (los discos cuentan por su caja para chocar)
    let hueco = 0, max = 0;
    const lanza = P.plats.find(p => p.lanza && p.lanza.x > 10), finLanza = lanza.x + lanza.ancho / 2;
    let huecoLanza = 0;
    for (let x = -1; x <= CARRERA.meta.x0; x += 0.25) {
      if (P.plats.some(p => Math.abs(x - p.x) <= (p.redonda ? p.r * 0.85 : p.ancho / 2))) hueco = 0;
      else if (x > finLanza && x < finLanza + 25) huecoLanza += 0.25;   // el hueco grande de los trampolines (se cruza con el verde)
      else max = Math.max(max, hueco += 0.25);
    }
    expect(max).toBeGreaterThan(0.5); expect(max).toBeLessThan(4);
    // el trampolín verde te tira más lejos que el hueco (vuelas lanza.y·2/30 s a lanza.x m/s)
    expect(huecoLanza).toBeGreaterThan(10); expect(lanza.lanza.x * (2 * lanza.lanza.y / 30)).toBeGreaterThan(huecoLanza);
  });
  it('los puños: salen rápido, se quedan afuera, vuelven y esperan; solo pegan saliendo o afuera', () => {
    const f = { x: 0, z: 5, lado: 1, y: Y, largo: 8.5, periodo: 2.2, fase: 0 };
    expect(punoEn(f, 0).e).toBe(0); expect(punoEn(f, 0.2).pega).toBe(true);
    expect(punoEn(f, 0.5).e).toBe(1); expect(punoEn(f, 1).pega).toBe(false); expect(punoEn(f, 2).e).toBe(0);
    expect(guanteEn(f, 0.5).z).toBeCloseTo(5 - 8.5);   // afuera del todo: cruzó el pasillo
    // Parado donde llega el guante, te pega hacia el otro lado (y para arriba)
    const g = golpePuno({ x: 0, y: Y, z: guanteEn(f, 0.5).z }, f, 0.5);
    expect(g.z).toBeLessThan(-20); expect(g.y).toBeGreaterThan(0);
    expect(golpePuno({ x: 0, y: Y, z: guanteEn(f, 0.5).z }, f, 1.5)).toBeNull();     // volviendo: no pega
    expect(golpePuno({ x: 5, y: Y, z: -3.5 }, f, 0.5)).toBeNull();                   // estás lejos
    expect(golpePuno({ x: 0, y: Y + 3, z: -3.5 }, f, 0.5)).toBeNull();               // saltaste por encima
  });
  it('las barras de las ruedas: te empujan de costado si te tocan, pero no si las saltas', () => {
    const b = { x: 0, z: 0, y: Y, r: 10, w: 1, fase: 0 };
    const g = golpeBarra({ x: 5, y: Y, z: 0 }, b, 0);   // la barra está sobre el eje x en t = 0
    expect(g).not.toBeNull(); expect(Math.hypot(g.x, g.z)).toBeCloseTo(CARRERA.barra.vel);
    expect(golpeBarra({ x: 5, y: Y + 2, z: 0 }, b, 0)).toBeNull();   // saltando
    expect(golpeBarra({ x: 5, y: Y, z: 3 }, b, 0)).toBeNull();       // lejos de la barra
    expect(golpeBarra({ x: 12, y: Y, z: 0 }, b, 0)).toBeNull();      // afuera de la rueda
    // un cuarto de vuelta después, la barra está sobre el eje z
    expect(golpeBarra({ x: 0, y: Y, z: -5 }, b, Math.PI / 2)).not.toBeNull();
  });
  it('los discos giran y las plataformas van de lado a lado (con el reloj de la ronda: todos lo ven igual)', () => {
    const d = P.plats.find(p => p.gira), m = P.plats.find(p => p.mueve);
    expect(posPlatCarrera(d, 2).giro).toBeCloseTo(d.gira.w * 2 + d.gira.fase);
    const zs = Array.from({ length: 40 }, (_, i) => posPlatCarrera(m, i * 0.2).z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(m.mueve.amp * 1.5);
  });
  it('checkpoints, salida, meta, caerse y puestos', () => {
    expect(checkpointDe(-1)).toBe(0); expect(checkpointDe(29.9)).toBe(0); expect(checkpointDe(30)).toBe(1); expect(checkpointDe(999)).toBe(17);
    const s = salidaCarrera(3, 0, 1); expect(s.x).toBe(93); expect(sobre(s.x, s.z)).toBe(true);
    for (let k = 0; k <= 17; k++) for (let i = 0; i < 6; i++) { const q = salidaCarrera(k, i, 6); expect(sobre(q.x, q.z)).toBe(true); }   // todos caben en su checkpoint
    expect(enMetaCarrera({ x: 535, y: Y, z: 0 })).toBe(true); expect(enMetaCarrera({ x: 520, y: Y, z: 0 })).toBe(false); expect(enMetaCarrera({ x: 535, y: Y - 5, z: 0 })).toBe(false);
    expect(seCayoCarrera(Y - 9)).toBe(true); expect(seCayoCarrera(Y - 2)).toBe(false);
    expect(puestosCarrera([{ id: 1, x: 50 }, { id: 2, x: 200 }, { id: 3, x: 300 }], [3])).toEqual([3, 2, 1]);
  });
  it('batería: una respuesta buena da 4.000 en la Carrera; y se ganan SpookyCoins jugándola', () => {
    expect(cargarB(0, true, CARRERA.bateriaRespuesta)).toBe(4000); expect(cargarB(0, true)).toBe(2000); expect(cargarB(5, false, 4000)).toBe(5);
    expect(ganaS({ modo: 'escuela', fase: 'carrera', enRonda: true })).toBe(true);
    expect(ganaS({ modo: 'escuela', fase: 'carrera', enRonda: true, resultado: true })).toBe(false);
  });
  it('🛡️ el servidor: empiezas en tu carril (arriba, en la pista), puedes reaparecer solo en un checkpoint que ya alcanzaste, y no puedes volar', () => {
    const c = origenCarrera(), z = zonaCarrera(0, 2, 3), s = salidaCarrera(0, 0, 2);
    let v = vigilar(null, { x: c.x + s.x, y: Y, z: c.z + s.z }, 0, z);
    expect(v.corregido).toBe(false); expect(v.pos.llego).toBe(true);
    // cayéndose (por debajo de la pista) → aparece en el checkpoint 3: vale
    const cayendo = { ...v.pos, x: c.x + 100, y: Y - 9, z: c.z + 3, t: 1000 };
    v = vigilar(cayendo, { x: c.x + 93, y: Y, z: c.z }, 1100, z); expect(v.corregido).toBe(false); expect(v.pos.x).toBe(c.x + 93);
    // …pero en el checkpoint 5 (no lo alcanzó): no vale
    v = vigilar(cayendo, { x: c.x + 153, y: Y, z: c.z }, 1100, z); expect(v.corregido).toBe(true); expect(v.pos.x).toBeLessThan(c.x + 110);
    // volar por encima del vacío: no
    const arriba = { x: c.x + 3, y: Y, z: c.z, t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    let pos = arriba; for (let i = 1; i <= 30; i++) pos = vigilar(pos, { x: pos.x, y: pos.y + 1, z: c.z - 20 }, i * 100, z).pos;
    expect(pos.y).toBeLessThanOrEqual(Y + 3.2 + 0.01);   // no subió más que un salto desde la pista
  });
  it('🛡️ el golpe de un puño solo vale si estabas cerca del puño y estaba pegando; y te deja moverte más hacia allá', () => {
    const c = origenCarrera(), f = P.punos[0];
    const t = 0.5 - f.fase;   // afuera del todo
    expect(golpeValidoCarrera(0, { x: c.x + f.x, y: Y, z: c.z }, t)).not.toBeNull();
    expect(golpeValidoCarrera(0, { x: c.x + f.x + 40, y: Y, z: c.z }, t)).toBeNull();   // lejos
    expect(golpeValidoCarrera(0, { x: c.x + f.x, y: Y, z: c.z }, t + 1.1)).toBeNull();  // estaba guardado
    expect(golpeValidoCarrera(999, { x: c.x, y: Y, z: c.z }, t)).toBeNull();
    const b = P.barras[0]; expect(golpeValidoCarrera(P.punos.length, { x: c.x + b.x + 3, y: Y, z: c.z }, 1)).not.toBeNull();
  });
});

import { SPLEEF, capaY, HEXES, hexEn, hundido, hexSolido, hexSeVe, pisoSpleef, salidaSpleef, fueraSpleef, capaDe, zonaSpleef, origenSpleef, pisadaValida } from '../src/logic.js';
describe('🔶 Spleef (hexágonos que se caen)', () => {
  it('la arena mide 100 m y tiene 6 capas una encima de otra (10 m entre una y otra)', () => {
    const lejos = Math.max(...HEXES.map(h => Math.hypot(h.x, h.z))) + SPLEEF.R;
    expect(lejos).toBeGreaterThan(48); expect(lejos).toBeLessThanOrEqual(SPLEEF.radio + 0.01);
    expect(Array.from({ length: SPLEEF.capas }, (_, k) => capaY(k))).toEqual([62, 52, 42, 32, 22, 12]);
    expect(HEXES.length).toBeGreaterThan(500);
  });
  it('cada punto del piso cae en un solo hexágono (sin huecos entre ellos)', () => {
    HEXES.forEach((h, i) => expect(hexEn(h.x, h.z)).toBe(i));
    let huecos = 0;
    for (let x = -40; x <= 40; x += 0.7) for (let z = -40; z <= 40; z += 0.7) if (Math.hypot(x, z) < 45 && hexEn(x, z) < 0) huecos++;
    expect(huecos).toBe(0);
    expect(hexEn(70, 0)).toBe(-1);   // afuera de la arena
  });
  it('un hexágono pisado: espera un poquito, se hunde cada vez más rápido y te sostiene hasta que bajó 2 m', () => {
    expect(hundido(0.2)).toBe(0);
    expect(hundido(1)).toBeGreaterThan(hundido(0.6));
    expect(hexSolido(null, 99)).toBe(true); expect(hexSolido(0, 0.5)).toBe(true);
    const t2 = SPLEEF.espera + Math.sqrt(2 * SPLEEF.solidoHasta / SPLEEF.cae);   // cuándo llega a 2 m
    expect(hexSolido(0, t2 - 0.02)).toBe(true); expect(hexSolido(0, t2 + 0.02)).toBe(false);
    expect(t2).toBeGreaterThan(0.8); expect(t2).toBeLessThan(1.5);   // ~1 s para salir corriendo
    expect(hexSeVe(0, t2 + 0.1)).toBe(true); expect(hexSeVe(0, 10)).toBe(false);
  });
  it('el piso debajo: la capa de arriba; si su hexágono se cayó, la de abajo; si se cayeron todos, nada', () => {
    const p = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()], i = hexEn(0, 0);
    expect(pisoSpleef(0, 0, 62, p, 5)).toEqual({ capa: 0, i, top: 62 });
    p[0].set(i, 0);   // lo pisaron en el segundo 0
    expect(pisoSpleef(0, 0, 62, p, 0.5).capa).toBe(0);                    // todavía no se hunde mucho
    expect(pisoSpleef(0, 0, 62, p, 5)).toEqual({ capa: 1, i, top: 52 });  // ya se cayó: caes a la de abajo
    for (const m of p) m.set(i, 0);
    expect(pisoSpleef(0, 0, 62, p, 5)).toBeNull();
    // estando en la capa de abajo, la de arriba no cuenta (no subes de golpe)
    expect(pisoSpleef(0, 0, 52, [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()], 0).capa).toBe(1);
  });
  it('salidas, quedar afuera, en qué capa estás', () => {
    for (let k = 0; k < 6; k++) { const s = salidaSpleef(k, 6); expect(hexEn(s.x, s.z)).toBeGreaterThanOrEqual(0); expect(s.y).toBe(62); }
    expect(fueraSpleef(5)).toBe(true); expect(fueraSpleef(11)).toBe(false);
    expect(capaDe(62)).toBe(0); expect(capaDe(51)).toBe(1); expect(capaDe(12)).toBe(5); expect(capaDe(-3)).toBe(5);
  });
  it('🛡️ el servidor solo acepta "pisé este hexágono" si estás cerca y a esa altura; empiezas arriba en tu lugar', () => {
    const c = origenSpleef(), h = HEXES[hexEn(0, 0)];
    expect(pisadaValida(0, hexEn(0, 0), { x: c.x + h.x + 1, y: 62, z: c.z + h.z })).toBe(true);
    expect(pisadaValida(0, hexEn(0, 0), { x: c.x + 30, y: 62, z: c.z })).toBe(false);   // lejos
    expect(pisadaValida(3, hexEn(0, 0), { x: c.x, y: 62, z: c.z })).toBe(false);        // otra capa
    expect(pisadaValida(0, 99999, { x: c.x, y: 62, z: c.z })).toBe(false);
    const z = zonaSpleef(0, 2), s = salidaSpleef(0, 2);
    expect(z.pisoLlegada).toBe(62); expect(Math.hypot(z.llegada.x - c.x - s.x, z.llegada.z - c.z - s.z)).toBeLessThan(0.01);
  });
});

import { MUSICAS, ESCALAS, midiAFrecuencia, lugarMusica, intensidadMusica, compasMusica, notaDeGrado, COMPASES_POR_SECCION, siguienteVolumen, leerVolumen, VOLUMENES_MUSICA, seededRandom as sr } from '../src/logic.js';
describe('🎵 La música que se inventa sola', () => {
  it('cada lugar tiene su canción (de día y de noche en tu mundo)', () => {
    expect(lugarMusica({})).toBe('mundoDia'); expect(lugarMusica({ noche: true })).toBe('mundoNoche');
    expect(lugarMusica({ modo: 'escuela', fase: 'salon' })).toBe('salon');
    for (const [f, id] of [['nomires', 'torre'], ['escondidas', 'escondidas'], ['atrapadas', 'atrapadas'], ['carrera', 'carrera'], ['spleef', 'spleef']]) expect(lugarMusica({ modo: 'escuela', fase: f })).toBe(id);
    expect(lugarMusica({ modo: 'sandbox', fase: 'sala' })).toBe('sandbox'); expect(lugarMusica({ modo: 'maze' })).toBe('minijuego');
    // todas distintas: otra nota base, otra escala u otra velocidad
    const firmas = Object.values(MUSICAS).map(M => `${M.raiz}-${M.escala}-${M.bpm}`); expect(new Set(firmas).size).toBe(firmas.length);
  });
  it('la intensidad cambia con lo que pasa', () => {
    expect(intensidadMusica('atrapadas', { tengo: true, faltaMs: 3000 })).toBe(1);
    expect(intensidadMusica('atrapadas', { tengo: true, faltaMs: 9000 })).toBeGreaterThan(intensidadMusica('atrapadas', { tengo: false }));
    expect(intensidadMusica('escondidas', { persiguen: true })).toBe(1);
    expect(intensidadMusica('carrera', { puesto: 1, x: 50 })).toBeGreaterThan(intensidadMusica('carrera', { puesto: 3, x: 50 }));
    expect(intensidadMusica('spleef', { capa: 5, quedan: 6, total: 6 })).toBe(1);
    expect(intensidadMusica('spleef', { capa: 0, quedan: 2, total: 6 })).toBeGreaterThan(intensidadMusica('spleef', { capa: 0, quedan: 6, total: 6 }));
    expect(intensidadMusica('torre', { etapa: 10 })).toBeGreaterThan(intensidadMusica('torre', { etapa: 1 }));
    expect(intensidadMusica('mundoNoche')).toBeLessThan(intensidadMusica('mundoDia'));
  });
  it('las notas: LA 4 = 440 Hz, y los grados de la escala suben bien (también de octava)', () => {
    expect(midiAFrecuencia(69)).toBe(440); expect(midiAFrecuencia(81)).toBeCloseTo(880);
    const M = MUSICAS.mundoDia; expect(notaDeGrado(M, 0)).toBe(60); expect(notaDeGrado(M, 4)).toBe(67); expect(notaDeGrado(M, 7)).toBe(72); expect(notaDeGrado(M, -1)).toBe(59);
  });
  it('un compás: notas adentro del compás, en la escala; más intensidad = más notas y más rápido', () => {
    for (const id of Object.keys(MUSICAS)) {
      const c = compasMusica(id, 5, 0.5, sr(3)), M = MUSICAS[id];
      expect(c.tiempos).toBe(4);
      for (const n of c.notas) { expect(n.t).toBeGreaterThanOrEqual(0); expect(n.t).toBeLessThan(4); expect(n.vel).toBeGreaterThan(0); expect(n.vel).toBeLessThanOrEqual(1);
        if (['bajo', 'acorde', 'arpegio', 'melodia'].includes(n.voz)) expect(ESCALAS[M.escala]).toContain(((n.midi - M.raiz) % 12 + 12) % 12); }
    }
    const calma = compasMusica('carrera', 3, 0, sr(1)), fuerte = compasMusica('carrera', 3, 1, sr(1));
    expect(fuerte.notas.length).toBeGreaterThan(calma.notas.length); expect(fuerte.bpm).toBeGreaterThan(calma.bpm);
    expect(fuerte.notas.some(n => n.voz === 'arpegio')).toBe(true); expect(calma.notas.some(n => n.voz === 'arpegio')).toBe(false);
  });
  it('no aburre: la melodía se repite dentro de una sección pero cambia en la siguiente; a veces hay una parte tranquila sin batería', () => {
    const mel = (n, s = 1) => compasMusica('mundoDia', n, 0.3, () => 0.9).notas.filter(x => x.voz === 'melodia').map(x => x.t).join();
    expect(mel(0)).toBe(mel(4));                                  // mismo ritmo de melodía en la misma sección
    const distintas = new Set(Array.from({ length: 6 }, (_, s) => mel(s * COMPASES_POR_SECCION))); expect(distintas.size).toBeGreaterThan(2);
    const tranq = compasMusica('carrera', 3 * COMPASES_POR_SECCION, 0.3, sr(2)); expect(tranq.notas.some(n => n.voz === 'bombo')).toBe(false);
    expect(compasMusica('carrera', 3 * COMPASES_POR_SECCION, 0.9, sr(2)).notas.some(n => n.voz === 'bombo')).toBe(true);   // (si está muy intenso, no se calma)
  });
  it('tic-tac en la cuenta regresiva y cascabeles en invierno', () => {
    expect(compasMusica('escondidas', 1, 0.45, sr(1), { tic: true }).notas.filter(n => n.voz === 'tic')).toHaveLength(4);
    const inv = compasMusica('mundoDia', 1, 0.5, sr(1), { invierno: true }).notas;
    expect(inv.some(n => n.voz === 'campana')).toBe(true); expect(inv.some(n => n.voz === 'hihat')).toBe(false);
  });
  it('el volumen: el botón pasa 100 → 60 → 30 → 0 → 100 %, y lo guardado raro vuelve a 60 %', () => {
    expect(VOLUMENES_MUSICA.map(siguienteVolumen)).toEqual([0.6, 0.3, 0, 1]);
    expect(leerVolumen('0.3')).toBe(0.3); expect(leerVolumen(null)).toBe(0.6); expect(leerVolumen('7')).toBe(0.6); expect(leerVolumen('0')).toBe(0);
  });
});

import { puertasReales, lugaresPuertas, vientoTubo, golpePuno as golpeP, guanteEn as guanteE, PISTA_CARRERA as PISTA, golpeValidoCarrera as golpeV, origenCarrera as origenC, zonaCarrera as zonaC, CARRERA as CR2 } from '../src/logic.js';
describe('🏁 Carrera: los obstáculos nuevos', () => {
  it('🥊 pega TODO el puño: el guante y también el brazo', () => {
    const f = { x: 0, z: 5, lado: 1, y: 30, largo: 8.5, periodo: 2.2, fase: 0 }, t = 0.5;   // afuera del todo: el guante en z = −3,5
    expect(golpeP({ x: 0, y: 30, z: -3.5 }, f, t)).not.toBeNull();   // el guante
    expect(golpeP({ x: 0, y: 30, z: 1 }, f, t)).not.toBeNull();      // el brazo (en el medio)
    expect(golpeP({ x: 0.7, y: 30, z: 1 }, f, t).z).toBeLessThan(0);   // de costado del brazo, igual, hacia donde pega
    expect(golpeP({ x: 2, y: 30, z: 1 }, f, t)).toBeNull();          // lejos
  });
  it('🚪 puertas: casi siempre una sola de verdad (nunca más de 3), igual para todos con la misma semilla (y distinto en otra ronda)', () => {
    const cuantas = [];
    for (let sem = 1; sem < 200; sem++) for (const [fila, n] of [[0, 5], [1, 7]]) { const k = puertasReales(sem, fila, n).filter(Boolean).length; cuantas.push(k); expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(3); }
    expect(cuantas.filter(k => k === 1).length).toBeGreaterThan(cuantas.length / 2);   // casi siempre UNA sola de verdad
    expect(puertasReales(7, 0, 5)).toEqual(puertasReales(7, 0, 5));
    const distintas = new Set(Array.from({ length: 20 }, (_, s) => puertasReales(s, 0, 5).join())); expect(distintas.size).toBeGreaterThan(3);
    expect(PISTA.puertas.length).toBe(2);
    for (const fila of PISTA.puertas) { const L = lugaresPuertas(fila); expect(L).toHaveLength(fila.n); L.forEach(p => { expect(p.ancho).toBeGreaterThan(1.5); expect(p.z).toBeGreaterThan(fila.z0); expect(p.z).toBeLessThan(fila.z1); }); }
  });
  it('💨 tubos de viento: te llevan solo si estás adentro', () => {
    const u = PISTA.tubos[0];
    expect(vientoTubo({ x: (u.x0 + u.x1) / 2, y: u.y, z: u.z }, PISTA.tubos)).toEqual({ x: u.vx, z: u.vz });
    expect(vientoTubo({ x: u.x0 - 3, y: u.y, z: u.z }, PISTA.tubos)).toBeNull();
    expect(vientoTubo({ x: (u.x0 + u.x1) / 2, y: u.y, z: u.z + 5 }, PISTA.tubos)).toBeNull();
    expect(PISTA.tubos.some(u => u.vz !== 0)).toBe(true);   // uno empuja de costado
  });
  it('↗️ trampolines hacia adelante y hacia atrás; plataformas que suben y bajan', () => {
    const L = PISTA.lanzas.map(i => PISTA.plats[i]);
    expect(L.some(p => p.lanza.x > 0)).toBe(true); expect(L.some(p => p.lanza.x < 0)).toBe(true);
    expect(L.find(p => p.lanza.x > 0).color).not.toBe(L.find(p => p.lanza.x < 0).color);   // se ven distintos
    expect(PISTA.plats.some(p => p.mueve && p.mueve.eje === 'y')).toBe(true);
  });
  it('🛡️ el servidor: el trampolín vale si estás encima; el tubo te deja ir más rápido solo cerca de él', () => {
    const c = origenC(), o = PISTA.punos.length + PISTA.barras.length, q = PISTA.plats[PISTA.lanzas[0]];
    expect(golpeV(o, { x: c.x + q.x, y: 30, z: c.z + q.z }, 3)).toEqual({ x: q.lanza.x, y: q.lanza.y, z: 0 });
    expect(golpeV(o, { x: c.x + q.x + 40, y: 30, z: c.z + q.z }, 3)).toBeNull();
    const u = PISTA.tubos[0];
    expect(zonaC(0, 1, 0, { x: c.x + u.x0 + 5, y: 30, z: c.z }).velMax).toBeGreaterThan(zonaC(0, 1, 0, { x: c.x + 50, y: 30, z: c.z }).velMax);
  });
});

import { CORREDOR_CARRERA, corredorEn, siguienteCheckpoint, PARED } from '../src/logic.js';
import { vigilarPos as vigilarR } from '../src/red.js';
describe('🧱 Carrera: sin atajos por afuera', () => {
  const P = PISTA;
  it('las paredes están SOLO alrededor de las puertas (16 m antes y después), y lo que se pisa ahí queda adentro', () => {
    for (const f of P.puertas) {
      for (let x = f.x - PARED.antes; x < f.x + PARED.despues; x++) expect(corredorEn(x + 0.5)).not.toBeNull();   // sin agujeros
      for (const p of P.plats) { if (Math.abs(p.x - f.x) > PARED.antes - 3) continue; const t = corredorEn(p.x); expect(t.zmin).toBeLessThanOrEqual(p.z - p.largo / 2); expect(t.zmax).toBeGreaterThanOrEqual(p.z + p.largo / 2); }
    }
    expect(PARED.antes + PARED.despues).toBeGreaterThan(2 * 12 * 2 * 12.5 / 30);   // más largo que lo que vuela un doble salto (~20 m)
    for (const x of [0, 44, 108, 200, 340, 400, 500]) expect(corredorEn(x)).toBeNull();   // en el resto, no hay paredes: te puedes caer
    expect(PARED.arriba).toBeGreaterThan(4 + 2 * 12.5 ** 2 / 60);   // ni con doble salto desde el escalón alto
  });
  it('los checkpoints cuentan solo en orden (de a uno)', () => {
    expect(siguienteCheckpoint(0, 31)).toBe(1); expect(siguienteCheckpoint(1, 95)).toBe(1);   // saltarse el 2: no cuenta el 3
    expect(siguienteCheckpoint(2, 95)).toBe(3); expect(siguienteCheckpoint(5, 40)).toBe(5);   // volver atrás no baja
  });
  it('🛡️ el servidor: en una zona de puertas no te deja rodearlas por afuera; en el resto, caerte por el costado está bien', () => {
    const c = origenC(), z = zonaC(0, 1, 0), f = P.puertas[0], t = corredorEn(f.x - 5);
    const enZona = { x: c.x + f.x - 5, y: 30, z: c.z, t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    const v = vigilarR(enZona, { x: c.x + f.x - 4.5, y: 30, z: c.z + t.zmax + 2.5 }, 100, z);
    expect(v.corregido).toBe(true); expect(v.pos.z - c.z).toBeLessThanOrEqual(t.zmax + 0.61);
    const afuera = { x: c.x + 44, y: 30, z: c.z + 3, t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    const v2 = vigilarR(afuera, { x: c.x + 44, y: 29, z: c.z + 5.5 }, 100, z);
    expect(v2.pos.z - c.z).toBe(5.5);   // se cae por el costado del pasillo de los puños (z > 4)
    expect(v2.corregido).toBe(false);
  });

});

import { temporada, temporadaDe, TEMPORADAS, particulaEstacion } from '../src/logic.js';
describe('🍂❄️☀️🌸 Las estaciones (el calendario de Mathias)', () => {
  const dia = (m, d, a = 2026) => new Date(a, m - 1, d, 12);
  it('los bordes de cada estación (todos los años)', () => {
    const casos = [[10, 30, null], [10, 31, 'otono'], [11, 25, 'otono'], [11, 26, null], [12, 1, 'invierno'], [1, 31, 'invierno'], [2, 1, null],
      [3, 1, 'verano'], [3, 31, 'verano'], [4, 1, null], [4, 30, null], [5, 1, 'primavera'], [5, 31, 'primavera'], [6, 15, null], [7, 1, 'primavera'], [7, 31, 'primavera'], [8, 1, null], [9, 20, null]];
    for (const [m, d, e] of casos) expect(temporada(dia(m, d)), `${d}/${m}`).toBe(e);
    expect(temporada(dia(11, 3, 2031))).toBe('otono'); expect(temporada(dia(12, 31, 2029))).toBe('invierno');
  });
  it('para probar: ?temporada=… manda (y "ninguna" la apaga); algo raro no cuenta', () => {
    expect(temporadaDe(dia(8, 1), 'invierno')).toBe('invierno'); expect(temporadaDe(dia(12, 5), 'ninguna')).toBeNull();
    expect(temporadaDe(dia(12, 5), 'lluvia')).toBe('invierno'); expect(temporadaDe(dia(8, 1), null)).toBeNull();
  });
  it('cada estación tiene sus colores y sus cosas', () => {
    for (const k of ['otono', 'invierno', 'verano', 'primavera']) { const T = TEMPORADAS[k]; expect(T.hojas).toHaveLength(3); expect(T.matas.length).toBeGreaterThan(0); expect(T.suelo.hojitas.length).toBeGreaterThan(0); }
    expect(TEMPORADAS.otono.adorno).toBe('calabaza'); expect(TEMPORADAS.invierno.adorno).toBe('muneco'); expect(TEMPORADAS.invierno.caen.tipo).toBe('nieve');
    expect(TEMPORADAS.primavera.caen.tipo).toBe('petalo'); expect(TEMPORADAS.verano.flores.n).toBeGreaterThan(300);
  });
  it('lo que cae del cielo: siempre adentro de la caja alrededor tuyo, y va bajando', () => {
    for (let i = 0; i < 50; i++) for (const t of [0, 3.3, 47]) { const p = particulaEstacion(i, t, 'nieve'); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(22); expect(Math.abs(p.x)).toBeLessThanOrEqual(31); }
    const a = particulaEstacion(3, 1, 'hoja'), b = particulaEstacion(3, 1.1, 'hoja'); expect(b.y < a.y || b.y > 20).toBe(true);
  });
});

import { golpeGuardian, GUARDIAN } from '../src/logic.js';
describe('🥊 El puño guardián de las puertas', () => {
  const f = PISTA.puertas[0], Y = CR2.y0;
  it('si pasas por ARRIBA de las puertas te pega hacia atrás (en todo el ancho); por una puerta, nunca', () => {
    for (let z = f.z0; z <= f.z1; z += 0.5) expect(golpeGuardian({ x: f.x, y: Y + 4.5, z }, f).x).toBeLessThan(0);
    expect(golpeGuardian({ x: f.x - 2, y: Y + 6, z: 0 }, f)).not.toBeNull();
    expect(golpeGuardian({ x: f.x, y: Y + 2.6, z: 0 }, f)).toBeNull();     // saltando dentro de una puerta (un salto: 2,6 m)
    expect(golpeGuardian({ x: f.x, y: Y, z: 0 }, f)).toBeNull();           // caminando por una puerta
    expect(golpeGuardian({ x: f.x - 6, y: Y + 6, z: 0 }, f)).toBeNull();   // lejos
    expect(CR2.puerta.alto - 1.2).toBeGreaterThanOrEqual(GUARDIAN.desde + 0.5);   // (las puertas son más altas que donde empieza a pegar… menos tu cuerpo)
  });
  it('🛡️ el servidor: el golpe del guardián vale solo cerca y arriba de las puertas', () => {
    const c = origenC(), o = PISTA.punos.length + PISTA.barras.length + PISTA.lanzas.length;
    expect(golpeV(o, { x: c.x + f.x, y: Y + 5, z: c.z }, 1)).toEqual({ x: -GUARDIAN.vel, y: GUARDIAN.salto, z: 0 });
    expect(golpeV(o, { x: c.x + f.x, y: Y, z: c.z }, 1)).toBeNull();
    expect(golpeV(o, { x: c.x + f.x + 40, y: Y + 5, z: c.z }, 1)).toBeNull();
  });
});

import { compasMusica as compasM, MUSICAS as MUS, leerEstilo, SWING, COMPASES_POR_SECCION as CPS } from '../src/logic.js';
describe('🎵 Música Normal (rápida) y 🎧 Lofi', () => {
  it('tempos de la Normal: rápidos y distintos por lugar; la Lofi usa los lentos de antes', () => {
    const esperado = { mundoDia: [120, 128], salon: [112, 118], escondidas: [106, 114], atrapadas: [126, 134], carrera: [146, 154], spleef: [136, 144], torre: [121, 129] };
    for (const [id, [a, b]] of Object.entries(esperado)) { const bpm = compasM(id, 1, 0, sr(1)).bpm; expect(bpm, id).toBeGreaterThanOrEqual(a); expect(bpm, id).toBeLessThanOrEqual(b); }
    expect(compasM('carrera', 1, 0, sr(1), { estilo: 'lofi' }).bpm).toBe(MUS.carrera.bpm);
    expect(compasM('mundoDia', 1, 0, sr(1), { estilo: 'lofi' }).bpm).toBeLessThan(compasM('mundoDia', 1, 0, sr(1)).bpm - 20);
  });
  it('bajo que camina, redoble cada 4 compases, platillo al empezar cada sección', () => {
    const c = compasM('mundoDia', 1, 0.3, sr(2));
    expect(new Set(c.notas.filter(n => n.voz === 'bajo').map(n => n.midi)).size).toBeGreaterThanOrEqual(3);
    const cajas = n => compasM('carrera', n, 0.3, sr(2)).notas.filter(x => x.voz === 'caja').length;
    expect(cajas(3)).toBeGreaterThan(cajas(1)); expect(cajas(7)).toBeGreaterThan(cajas(5));
    expect(compasM('carrera', CPS, 0.3, sr(2)).notas.some(n => n.voz === 'platillo')).toBe(true);
    expect(compasM('carrera', CPS + 1, 0.3, sr(2)).notas.some(n => n.voz === 'platillo')).toBe(false);
  });
  it('pregunta y respuesta: el compás 1 contesta distinto que el 0, y la respuesta termina en la nota del acorde', () => {
    const mel = n => compasM('salon', n, 0.5, () => 0.9).notas.filter(x => x.voz === 'melodia').map(x => x.midi).join();
    expect(mel(0)).not.toBe(mel(1)); expect(mel(0)).toBe(mel(4));   // (el compás 4 tiene el mismo acorde que el 0)
  });
  it('subida antes del drop: al final de algunas secciones más platillos/redoble y en el último compás no hay bombo', () => {
    const fin = compasM('spleef', CPS + 15, 0.3, sr(3)).notas, antes = compasM('spleef', CPS + 5, 0.3, sr(3)).notas;
    expect(fin.some(n => n.voz === 'bombo')).toBe(false);
    expect(fin.filter(n => n.voz === 'caja').length).toBeGreaterThan(antes.filter(n => n.voz === 'caja').length);
  });
  it('lofi: con swing (las corcheas de a contratiempo llegan un poquito tarde); el estilo guardado raro vuelve a Normal', () => {
    const t = compasM('mundoDia', 2, 0.6, sr(1), { estilo: 'lofi' }).notas.map(n => n.t % 1);
    expect(t.some(x => Math.abs(x - (0.5 + SWING)) < 1e-6)).toBe(true); expect(t.some(x => Math.abs(x - 0.5) < 1e-9)).toBe(false);
    expect(leerEstilo('lofi')).toBe('lofi'); expect(leerEstilo(null)).toBe('normal'); expect(leerEstilo('rock')).toBe('normal');
  });
});

import { CALIDADES, leerCalidad, leerNivel, siguienteCalidad, calidadInicial, bajarCalidad } from '../src/logic.js';
describe('⚙️ Calidad de los gráficos', () => {
  it('Baja hace menos trabajo que Media, y Media menos que Alta', () => {
    const [A, M, B] = ['alta', 'media', 'baja'].map(k => CALIDADES[k]);
    for (const k of ['ratioMax', 'sombraMapa', 'niebla', 'pasto', 'flores', 'extra', 'particulas']) { expect(M[k], k).toBeLessThanOrEqual(A[k]); expect(B[k], k).toBeLessThan(A[k]); }
    expect(B.sombras).toBe(false); expect(A.sombras).toBe(true);
  });
  it('en Auto empieza según la compu (núcleos, memoria, si es táctil)', () => {
    expect(calidadInicial({ nucleos: 8, memoria: 8 })).toBe('alta');
    expect(calidadInicial({ nucleos: 4, memoria: 8 })).toBe('media'); expect(calidadInicial({ nucleos: 8, memoria: 8, tactil: true })).toBe('media');
    expect(calidadInicial({ nucleos: 2 })).toBe('baja'); expect(calidadInicial({ memoria: 2, nucleos: 8 })).toBe('baja');
    expect(calidadInicial({})).toBe('alta');   // (Safari no dice cuántos núcleos ni cuánta memoria)
  });
  it('si va lento baja un nivel (nunca sube sola); el botón pasa Auto → Alta → Media → Baja → Auto; lo guardado raro vuelve a Auto', () => {
    expect(bajarCalidad('alta', 20)).toBe('media'); expect(bajarCalidad('media', 20)).toBe('baja'); expect(bajarCalidad('baja', 10)).toBe('baja'); expect(bajarCalidad('alta', 50)).toBe('alta');
    expect(['auto', 'alta', 'media', 'baja'].map(siguienteCalidad)).toEqual(['alta', 'media', 'baja', 'auto']);
    expect(leerCalidad('ultra')).toBe('auto'); expect(leerCalidad(null)).toBe('auto'); expect(leerNivel('auto')).toBeNull(); expect(leerNivel('baja')).toBe('baja');
  });
});
