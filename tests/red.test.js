import { describe, it, expect } from 'vitest';
import { limpiarNombre, leerMensaje, acercar, piezasExplosion, lugarMoneda, faseAhora, corto, BORDE, DIA_SEGUNDOS, leerLook, leerNiveles, juntarNiveles } from '../src/red.js';

describe('limpiarNombre', () => {
  it('quita espacios de más y corta a 20 letras', () => {
    expect(limpiarNombre('  Mathias   El  Grande ')).toBe('Mathias El Grande');
    expect(limpiarNombre('a'.repeat(30))).toHaveLength(20);
  });
  it('si no es texto devuelve vacío', () => {
    expect(limpiarNombre(42)).toBe('');
  });
});

describe('leerMensaje', () => {
  it('lee un saludo', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', nombre: ' Leo ', color: 0x2fae4e, monedas: 5, cajas: 2, niveles: { belt: 1 }, look: { hat: 'capBlue', blaster: 1 } })))
      .toEqual({ tipo: 'hola', nombre: 'Leo', color: 0x2fae4e, monedas: 5, cajas: 2, niveles: { belt: 1 }, look: { hat: 'capBlue', glasses: null, blaster: 1 } });
  });
  it('lee una posición', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, mg: 1 })))
      .toEqual({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, color: null, mg: 1 });
  });
  it('rechaza mensajes rotos, raros o gigantes', () => {
    expect(leerMensaje('no soy json')).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', nombre: '   ', color: 1 }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 'mucho', y: 0, z: 0, rot: 0 }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'hackear' }))).toBeNull();
    expect(leerMensaje('x'.repeat(600))).toBeNull();
  });
});

describe('acercar', () => {
  it('con k = 0 no se mueve, con k = 1 llega, con 0.5 queda a la mitad', () => {
    expect(acercar(0, 10, 0)).toBe(0);
    expect(acercar(0, 10, 1)).toBe(10);
    expect(acercar(0, 10, 0.5)).toBe(5);
    expect(acercar(0, 10, 3)).toBe(10);   // nunca se pasa
  });
});

describe('piezasExplosion', () => {
  it('crea la cantidad pedida y todas salen hacia arriba', () => {
    const piezas = piezasExplosion(30);
    expect(piezas).toHaveLength(30);
    for (const p of piezas) expect(p.vy).toBeGreaterThan(0);
  });
});

describe('el mundo compartido', () => {
  it('las monedas siempre aparecen en la mitad del gigante y dentro del mapa', () => {
    for (let i = 0; i < 200; i++) {
      const m = lugarMoneda();
      expect(m.z).toBeLessThan(0);
      expect(Math.abs(m.x)).toBeLessThan(BORDE);
      expect(Math.abs(m.z)).toBeLessThan(BORDE);
    }
  });
  it('la hora avanza sola y da la vuelta a medianoche', () => {
    expect(faseAhora(0.5, 0, 0)).toBe(0.5);
    expect(faseAhora(0.5, 0, DIA_SEGUNDOS * 1000 / 4)).toBeCloseTo(0.75);   // un cuarto de día después
    expect(faseAhora(0.9, 0, DIA_SEGUNDOS * 1000 / 5)).toBeCloseTo(0.1);    // pasó la medianoche
  });
  it('corto deja solo 2 decimales', () => {
    expect(corto(3.14159)).toBe(3.14);
    expect(corto(-2.005)).toBeCloseTo(-2, 1);
  });
});

describe('leerMensaje: mensajes del mundo', () => {
  const leer = m => leerMensaje(JSON.stringify(m));
  it('acepta monedas válidas y rechaza números de moneda que no existen', () => {
    expect(leer({ tipo: 'moneda', i: 3 })).toEqual({ tipo: 'moneda', i: 3, ayuda: 0 });
    expect(leer({ tipo: 'moneda', i: 3, ayuda: 1 })).toEqual({ tipo: 'moneda', i: 3, ayuda: 1 });   // la agarró un asistente
    expect(leer({ tipo: 'moneda', i: 30 })).toBeNull();
    expect(leer({ tipo: 'moneda', i: -1 })).toBeNull();
    expect(leer({ tipo: 'moneda', i: 1.5 })).toBeNull();
  });
  it('la hora tiene que estar entre 0 y 1', () => {
    expect(leer({ tipo: 'hora', fase: 0.25 })).toEqual({ tipo: 'hora', fase: 0.25 });
    expect(leer({ tipo: 'hora', fase: 7 })).toBeNull();
  });
  it('el mundo trae al gigante (6 números) y a los bots (5 números cada uno)', () => {
    const ok = { tipo: 'mundo', g: [1, 0, -20, 0.5, 0, 1], b: [[1, 0, 2, 0, 1], [3, 0, 4, 1, 0]] };
    expect(leer(ok)).toEqual({ ...ok, a: [] });
    expect(leer({ ...ok, a: [[5, 0, 5, 1]] }).a).toEqual([[5, 0, 5, 1]]);   // con un asistente
    expect(leer({ ...ok, g: [1, 2, 3] })).toBeNull();
    expect(leer({ ...ok, b: [[1, 2]] })).toBeNull();
  });
  it('solo hay dos eventos: atrapado y aturdir', () => {
    expect(leer({ tipo: 'evento', que: 'atrapado' })).toEqual({ tipo: 'evento', que: 'atrapado' });
    expect(leer({ tipo: 'evento', que: 'monedas-infinitas' })).toBeNull();
  });
  it('disparos y golpes', () => {
    expect(leer({ tipo: 'disparo', s: [0, 1, 0], d: [0, 0, 1], v2: true })).toEqual({ tipo: 'disparo', s: [0, 1, 0], d: [0, 0, 1], v2: true });
    expect(leer({ tipo: 'disparo', s: [0, 1], d: [0, 0, 1] })).toBeNull();
    expect(leer({ tipo: 'golpe', a: 4 })).toEqual({ tipo: 'golpe', a: 4 });
    expect(leer({ tipo: 'golpe', a: 'todos' })).toBeNull();
  });
});

describe('la base del equipo', () => {
  it('juntarNiveles se queda con el nivel más alto de cada cosa', () => {
    expect(juntarNiveles({ belt: 1, lineBox: 2 }, { lineBox: 4, bigHouse: 1 })).toEqual({ belt: 1, lineBox: 4, bigHouse: 1 });
    expect(juntarNiveles({ belt: 1 }, { belt: 0 })).toEqual({ belt: 1 });   // nunca se pierde una compra
  });
  it('leerNiveles ignora nombres raros y niveles imposibles', () => {
    expect(leerNiveles({ belt: 1, 'hack<script>': 1, turbo: 999, hopper: -1 })).toEqual({ belt: 1 });
    expect(leerNiveles(null)).toEqual({});
  });
  it('leerLook arregla lo que venga mal', () => {
    expect(leerLook({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2 })).toEqual({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2 });
    expect(leerLook({ hat: 42, blaster: 7 })).toEqual({ hat: null, glasses: null, blaster: 0 });
  });
  it('compras de la base (la plata es de cada uno: no hay billetera del equipo)', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'cambio', monedas: -30, cajas: 2 }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'nivel', id: 'belt', nivel: 1 }))).toEqual({ tipo: 'nivel', id: 'belt', nivel: 1 });
    expect(leerMensaje(JSON.stringify({ tipo: 'nivel', id: 'belt', nivel: 0 }))).toBeNull();
  });
});
