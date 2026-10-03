import { describe, it, expect } from 'vitest';
import { limpiarNombre, leerMensaje, acercar, piezasExplosion } from '../src/red.js';

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
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', nombre: ' Leo ', color: 0x2fae4e, monedas: 5 })))
      .toEqual({ tipo: 'hola', nombre: 'Leo', color: 0x2fae4e, monedas: 5 });
  });
  it('lee una posición', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5 })))
      .toEqual({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, color: null, monedas: null });
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
