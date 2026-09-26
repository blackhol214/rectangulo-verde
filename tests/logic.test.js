import { describe, it, expect } from 'vitest';
import {
  HOUSE, STAIRS, insideHouse, onStairs, collideWalls, moveAndCollide, exitHouseTarget, goToBedTarget, boxHit,
  upgradePrice, fmt, sunElevation, isNightPhase, clockText, hourToPhase,
  parseSetHour, launchSpeedForHeight,
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

describe('escalera', () => {
  it('es más grande: 3 m de ancho, 10 m de largo y llega justo al piso 2', () => {
    expect(STAIRS.Z1 - STAIRS.Z0).toBeCloseTo(3);
    expect(STAIRS.X1 - STAIRS.X0).toBe(10);
    expect(STAIRS.RISE * STAIRS.STEPS).toBeCloseTo(HOUSE.FLOOR_H);
    expect(STAIRS.RISE).toBeLessThanOrEqual(0.45); // se sube caminando
  });
});

describe('rutas de los bots en la casa', () => {
  const { HX0, DOOR_Z } = HOUSE;
  const at = (x, z, y = 0) => ({ x, z, y });

  it('sabe si alguien está dentro de la casa', () => {
    expect(insideHouse(at(30, 10))).toBe(true);
    expect(insideHouse(at(10, 10))).toBe(false);
    expect(insideHouse(at(30, 25))).toBe(false);
  });

  describe('salir de la casa', () => {
    it('desde la planta baja va hacia la puerta y luego afuera', () => {
      expect(exitHouseTarget(at(32, 9))).toEqual({ x: 21, z: DOOR_Z });
      expect(exitHouseTarget(at(21, DOOR_Z))).toEqual({ x: 15, z: DOOR_Z });
    });

    it('en la planta baja se aparta de la escalera antes de ir a la puerta', () => {
      expect(exitHouseTarget(at(26, 18.5))).toEqual({ x: 26, z: STAIRS.Z0 - 1.5 });
    });

    it('desde el piso 2 va a la escalera sin caer al hueco y luego baja', () => {
      expect(exitHouseTarget(at(32, 10, 4.55))).toEqual({ x: STAIRS.X1 + 1.2, z: STAIRS.Z0 - 0.7 });
      expect(exitHouseTarget(at(STAIRS.X1 + 1.2, STAIRS.Z0 - 0.7, 4))).toEqual({ x: STAIRS.X1 + 0.8, z: STAIRS.MZ });
      expect(exitHouseTarget(at(STAIRS.X1 + 0.8, STAIRS.MZ, 4))).toEqual({ x: STAIRS.X0 - 0.6, z: STAIRS.MZ });
    });

    it('siguiendo la ruta paso a paso termina fuera de la casa', () => {
      // Camina en línea recta entre puntos; la altura baja al pisar la escalera (x 22–30)
      let p = at(37, 10, 4.55);
      for (let i = 0; i < 40 && insideHouse(p); i++) {
        const t = exitHouseTarget(p);
        const onStairs = t.z > STAIRS.Z0 - 0.3 && t.x < STAIRS.X1;
        p = { x: t.x, z: t.z, y: onStairs ? Math.max(0, (t.x - STAIRS.X0) / STAIRS.RUN * STAIRS.RISE) : p.y };
      }
      expect(insideHouse(p)).toBe(false);
      expect(p.x).toBeLessThan(HX0);
    });
  });

  // Simulación sencilla: camina 0,4 m por paso hacia el siguiente punto de la ruta,
  // con la altura real del piso (planta baja, escalera o piso 2) donde está parado.
  function walk(start, route, stop, maxSteps = 600) {
    const S = STAIRS;
    const heightAt = (x, z, y) => {
      if (z > S.Z0 && z < S.Z1 && x > S.X0 && x < S.X1) return S.RISE * Math.min(S.STEPS, Math.ceil((x - S.X0) / S.RUN)); // escalera
      if (y > 3.5 && insideHouse({ x, z })) return HOUSE.FLOOR_H; // sigue en el piso 2
      return 0;
    };
    let p = { ...start };
    for (let i = 0; i < maxSteps; i++) {
      if (stop(p)) return { p, steps: i };
      const t = route(p), dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      const k = d > 0.4 ? 0.4 / d : 1;
      const x = p.x + dx * k, z = p.z + dz * k;
      p = { x, z, y: heightAt(x, z, p.y) };
    }
    return { p, steps: maxSteps };
  }

  describe('los bots del piso 2 (morado, naranja y rosa) saben bajar solos', () => {
    // Antes, al bajar un par de escalones, la ruta los mandaba otra vez arriba y se quedaban dando vueltas
    it('en la escalera sigue bajando aunque todavía esté alto', () => {
      const midStair = { x: STAIRS.X0 + 8.5, z: STAIRS.MZ, y: 3.6 }; // escalón 9, más alto que 3,5 m
      expect(onStairs(midStair)).toBe(true);
      expect(exitHouseTarget(midStair).x).toBeLessThan(STAIRS.X0);
    });

    it.each([['morado', 27], ['naranja', 32], ['rosa', 37]])('el bot %s sale de la casa desde su cama', (_, bx) => {
      const { p, steps } = walk({ x: bx, z: 10, y: 4.55 }, exitHouseTarget, q => !insideHouse(q));
      expect(steps).toBeLessThan(600);   // no se queda atascado
      expect(p.y).toBe(0);
      expect(insideHouse(p)).toBe(false);
    });

    it.each([['morado', 27], ['naranja', 32], ['rosa', 37]])('el bot %s vuelve de noche a su cama', (_, bx) => {
      const bed = [bx, 1, 10];
      const { p, steps } = walk({ x: 0, z: 12, y: 0 }, q => goToBedTarget(q, bed),
        q => Math.hypot(q.x - bx, q.z - 10) < 0.5 && q.y === HOUSE.FLOOR_H);
      expect(steps).toBeLessThan(600);
      expect(p.y).toBe(HOUSE.FLOOR_H);
    });

    it('un bot de la planta baja que quedó en el piso 2 baja a su cama', () => {
      const bed = [32, 0, 9];
      const { p, steps } = walk({ x: 37, z: 10, y: 4 }, q => goToBedTarget(q, bed),
        q => Math.hypot(q.x - 32, q.z - 9) < 0.5 && q.y === 0);
      expect(steps).toBeLessThan(600);
      expect(p.y).toBe(0);
    });
  });

  describe('ir a su cama', () => {
    it('desde lejos rodea la casa y llega frente a la puerta', () => {
      expect(goToBedTarget(at(0, 12), [32, 0, 9])).toEqual({ x: HX0 - 2.5, z: DOOR_Z });
      expect(goToBedTarget(at(50, 10), [32, 0, 9])).toEqual({ x: 46.5, z: 1.5 }); // por detrás
      expect(goToBedTarget(at(HX0 - 2.5, DOOR_Z), [32, 0, 9])).toEqual({ x: 21.8, z: DOOR_Z });
    });

    it('si su cama está en la planta baja va directo a ella', () => {
      expect(goToBedTarget(at(22, DOOR_Z), [37, 0, 9])).toEqual({ x: 37, z: 9 });
    });

    it('si su cama está en el piso 2 sube la escalera', () => {
      const bed = [27, 1, 10], top = { x: STAIRS.X1 + 0.9, z: STAIRS.MZ };
      expect(goToBedTarget(at(22, DOOR_Z), bed)).toEqual({ x: STAIRS.X0 - 0.4, z: STAIRS.MZ }); // al pie
      expect(goToBedTarget(at(STAIRS.X0 - 0.4, STAIRS.MZ), bed)).toEqual(top);                  // sube
      expect(goToBedTarget(at(27, STAIRS.MZ, 2), bed)).toEqual(top);                            // a medio camino
      expect(goToBedTarget(at(top.x, top.z, 4), bed)).toEqual({ x: STAIRS.X1 + 1.5, z: STAIRS.Z0 - 1.5 }); // se aleja del hueco
      expect(goToBedTarget(at(STAIRS.X1 + 1.5, STAIRS.Z0 - 1.5, 4), bed)).toEqual({ x: 27, z: 10 });      // a la cama
    });
  });
});
