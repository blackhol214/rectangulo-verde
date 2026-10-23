import { describe, it, expect } from 'vitest';
import { limpiarNombre, leerMensaje, acercar, acercarAngulo, piezasExplosion, lugarMoneda, faseAhora, corto, BORDE, DIA_SEGUNDOS, leerLook, leerSala, salaDeHost, linkOficial, leerPreguntas, revisarPreguntas, claveCorrecta, PROFE, MAX_MENSAJE, seVen, MG_SOLO, MG_ESCONDIDAS, ESC, elegirBuscador, elegirTerreno, faseRonda, puedeEncontrar, ganadorRonda, mgDelServidor, nuevoSuavizador, agregarMuestra, valoresEn, mezclar, RETRASO_MS, RETRASO_MAX, retrasoDe, TELETRANSPORTE } from '../src/red.js';

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
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', nombre: ' Leo ', color: 0x2fae4e, monedas: 5, look: { hat: 'capBlue', blaster: 1 } })))
      .toEqual({ tipo: 'hola', nombre: 'Leo', color: 0x2fae4e, monedas: 5, look: { hat: 'capBlue', glasses: null, blaster: 1 } });
  });
  it('lee una posición', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, mg: 1 })))
      .toEqual({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, color: null, mg: 1, t: null });
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, t: 1234 })).t).toBe(1234);   // la hora del que lo mandó
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: -3, rot: 0.5, t: 'ayer' })).t).toBeNull();
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
    expect(leer({ tipo: 'moneda', i: 3 })).toEqual({ tipo: 'moneda', i: 3 });
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
    expect(leer(ok)).toEqual({ ...ok, t: null });
    expect(leer({ ...ok, t: 500 }).t).toBe(500);
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

describe('cada uno con sus cosas', () => {
  it('leerLook arregla lo que venga mal', () => {
    expect(leerLook({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2 })).toEqual({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2 });
    expect(leerLook({ hat: 42, blaster: 7 })).toEqual({ hat: null, glasses: null, blaster: 0 });
  });
  it('ya no hay compras del equipo ni billetera del equipo: esos mensajes se ignoran', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'nivel', id: 'blaster', nivel: 1 }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'cambio', monedas: -30, cajas: 2 }))).toBeNull();
  });
});

describe('salas: github.io es el único juego oficial', () => {
  it('leerSala acepta nombres de túnel y rechaza cosas raras', () => {
    expect(leerSala('Palabras-Raras-123')).toBe('palabras-raras-123');
    expect(leerSala('evil.com/hack')).toBeNull();          // no se puede mandar el juego a otro sitio
    expect(leerSala('a b')).toBeNull();
    expect(leerSala('')).toBeNull();
    expect(leerSala(null)).toBeNull();
  });
  it('salaDeHost saca la sala del link de Cloudflare', () => {
    expect(salaDeHost('palabras-raras.trycloudflare.com')).toBe('palabras-raras');
    expect(salaDeHost('localhost:8080')).toBeNull();
    expect(salaDeHost('trampa.trycloudflare.com.otro.com')).toBeNull();
  });
  it('linkOficial arma el link de github.io con la sala', () => {
    expect(linkOficial('palabras-raras')).toBe('https://blackhol214.github.io/rectangulo-verde/?sala=palabras-raras');
  });
});

describe('giros suaves y pestañas escondidas', () => {
  it('acercarAngulo gira por el camino más corto', () => {
    const casi360 = 350 * Math.PI / 180, diez = 10 * Math.PI / 180;
    expect(acercarAngulo(casi360, diez, 1) % (2 * Math.PI)).toBeCloseTo(diez);   // llega
    expect(acercarAngulo(casi360, diez, 0.5) - casi360).toBeCloseTo(10 * Math.PI / 180);   // a la mitad avanza 10°, no 170°
    expect(acercarAngulo(1, 2, 0)).toBe(1);
  });
  it('mensaje de pestaña escondida o visible', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'visible', v: 0 }))).toEqual({ tipo: 'visible', v: 0 });
    expect(leerMensaje(JSON.stringify({ tipo: 'visible', v: 1 }))).toEqual({ tipo: 'visible', v: 1 });
    expect(leerMensaje(JSON.stringify({ tipo: 'visible' }))).toEqual({ tipo: 'visible', v: 1 });
  });
});

describe('modo profe: las preguntas de la clase', () => {
  const q = (extra = {}) => ({ p: '¿Cuánto es 2 + 2?', r: ['4', '3', '5', '22'], ok: 0, ...extra });
  const msj = (lista, clave = 'algo') => JSON.stringify({ tipo: 'preguntas', clave, lista });
  it('lee una lista buena (y recorta los espacios)', () => {
    expect(leerMensaje(msj([q({ p: '  ¿Cuánto es 2 + 2?  ', r: [' 4 ', '3', '5', '22'] })])))
      .toEqual({ tipo: 'preguntas', clave: 'algo', lista: [q()] });
    expect(leerMensaje(msj([]))).toEqual({ tipo: 'preguntas', clave: 'algo', lista: [] });   // lista vacía = volver a las normales
  });
  it('acepta 30 preguntas largas (más grande que un mensaje normal)', () => {
    const larga = q({ p: 'x'.repeat(PROFE.maxPregunta), r: Array(4).fill('y'.repeat(PROFE.maxRespuesta)) });
    const texto = msj(Array(30).fill(larga));
    expect(texto.length).toBeGreaterThan(MAX_MENSAJE);
    expect(leerMensaje(texto).lista).toHaveLength(30);
  });
  it('si UNA cosa viene mal, rechaza el mensaje entero', () => {
    const malas = [
      Array(31).fill(q()),                     // más de 30
      [q(), q({ p: '   ' })],                  // pregunta vacía
      [q({ p: 'x'.repeat(121) })],             // pregunta de más de 120 letras
      [q({ r: ['a', 'b', 'c'] })],             // solo 3 respuestas
      [q({ r: ['a', 'b', 'c', ''] })],         // una respuesta vacía
      [q({ r: ['a', 'b', 'c', 'z'.repeat(61)] })],   // respuesta de más de 60 letras
      [q({ r: ['a', 'b', 'c', 7] })],          // una respuesta que no es texto
      [q({ ok: 4 })], [q({ ok: 1.5 })], [q({ ok: '0' })],   // la correcta tiene que ser 0, 1, 2 o 3
      [null], 'no soy una lista',
    ];
    for (const l of malas) expect(leerMensaje(msj(l))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'preguntas', lista: [q()] }))).toBeNull();   // sin contraseña
    expect(leerMensaje(msj([q()], 'c'.repeat(61)))).toBeNull();
  });
  it('los otros mensajes siguen siendo cortitos', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'pos', x: 1, y: 0, z: 0, rot: 0, relleno: 'x'.repeat(2000) }))).toBeNull();
  });
  it('leerPreguntas también sirve para revisar lo que manda el servidor', () => {
    expect(leerPreguntas([q()])).toEqual([q()]);
    expect(leerPreguntas([q({ ok: -1 })])).toBeNull();
    expect(leerPreguntas(undefined)).toBeNull();
  });
  it('dice qué le falta a lo que escribió el profe (para marcarlo en rojo)', () => {
    expect(revisarPreguntas([q()])).toEqual([]);
    expect(revisarPreguntas([q(), q({ p: '', r: ['a', ' ', 'c', 'd'.repeat(61)] })]))
      .toEqual([{ i: 1, campo: 'p' }, { i: 1, campo: 'r1' }, { i: 1, campo: 'r3' }]);
  });
  it('la contraseña: solo vale si es igual a la de verdad (y tiene que haber una)', () => {
    expect(claveCorrecta('aprendo', 'aprendo')).toBe(true);
    expect(claveCorrecta('Aprendo', 'aprendo')).toBe(false);
    expect(claveCorrecta('', '')).toBe(false);      // sin contraseña guardada, nadie entra
    expect(claveCorrecta(undefined, 'x')).toBe(false);
    expect(claveCorrecta('x', null)).toBe(false);
  });
});

describe('dónde está cada jugador (mg) y quién ve a quién', () => {
  it('pos acepta mg de 0 a 99 (lo demás cuenta como 0)', () => {
    const pos = mg => leerMensaje(JSON.stringify({ tipo: 'pos', x: 0, y: 0, z: 0, rot: 0, mg })).mg;
    expect(pos(31)).toBe(31); expect(pos(1)).toBe(1); expect(pos(0)).toBe(0);
    expect(pos(100)).toBe(0); expect(pos(-1)).toBe(0); expect(pos(2.5)).toBe(0); expect(pos('31')).toBe(0);
  });
  it('se ven los que están en el mismo lugar; jugando solo no ves a nadie', () => {
    expect(seVen(0, 0)).toBe(true);
    expect(seVen(MG_ESCONDIDAS + 1, MG_ESCONDIDAS + 1)).toBe(true);
    expect(seVen(MG_ESCONDIDAS + 1, MG_ESCONDIDAS + 2)).toBe(false);
    expect(seVen(0, 5)).toBe(false);
    expect(seVen(MG_SOLO, MG_SOLO)).toBe(false);
  });
});

describe('Escondidas con amigos: la ronda', () => {
  it('lee los mensajes de las escondidas (y rechaza los raros)', () => {
    const esc = m => leerMensaje(JSON.stringify({ tipo: 'esc', ...m }));
    expect(esc({ que: 'entrar' })).toEqual({ tipo: 'esc', que: 'entrar' });
    expect(esc({ que: 'salir' })).toEqual({ tipo: 'esc', que: 'salir' });
    expect(esc({ que: 'empezar' })).toEqual({ tipo: 'esc', que: 'empezar' });
    expect(esc({ que: 'empezar', terreno: 2 })).toEqual({ tipo: 'esc', que: 'empezar' });   // el terreno que mande alguien no cuenta
    expect(esc({ que: 'encontrar', a: 7 })).toEqual({ tipo: 'esc', que: 'encontrar', a: 7 });
    expect(esc({ que: 'encontrar', a: 'Leo' })).toBeNull();
    expect(esc({ que: 'ganar' })).toBeNull();
  });
  it('el buscador sale al azar entre los que esperan', () => {
    expect(elegirBuscador([4, 7, 9], () => 0)).toBe(4);
    expect(elegirBuscador([4, 7, 9], () => 0.5)).toBe(7);
    expect(elegirBuscador([4, 7, 9], () => 0.9999)).toBe(9);
    const vistos = new Set(); for (let i = 0; i < 200; i++) vistos.add(elegirBuscador([1, 2, 3]));
    expect(vistos.size).toBe(3);
  });
  it('el terreno de la ronda con amigos también sale al azar', () => {
    expect(elegirTerreno(() => 0)).toBe(0);
    expect(elegirTerreno(() => 0.5)).toBe(1);
    expect(elegirTerreno(() => 0.9999)).toBe(2);
    const vistos = new Set(); for (let i = 0; i < 200; i++) vistos.add(elegirTerreno());
    expect([...vistos].sort()).toEqual([0, 1, 2]);
  });
  it('los tiempos: 30 s para esconderse y 100 s para buscar', () => {
    expect(faseRonda(0)).toBe('esconder');
    expect(faseRonda(29999)).toBe('esconder');
    expect(faseRonda(30000)).toBe('buscar');
    expect(faseRonda(129999)).toBe('buscar');
    expect(faseRonda(130000)).toBe('fin');
  });
  it('para encontrar a alguien hay que estar cerca', () => {
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 2 })).toBe(true);
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 })).toBe(false);
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 1, y: 20, z: 0 })).toBe(false);   // arriba de la cama no cuenta
  });
  it('quién gana', () => {
    expect(ganadorRonda({ camaleones: [2, 3], encontrados: [2, 3], ms: 50000 })).toBe('buscador');   // encontró a todos
    expect(ganadorRonda({ camaleones: [2, 3], encontrados: [2], ms: 50000 })).toBeNull();            // sigue la ronda
    expect(ganadorRonda({ camaleones: [2, 3], encontrados: [2], ms: 130000 })).toBe('camaleones');   // se acabó el tiempo
    expect(ganadorRonda({ camaleones: [2, 3], encontrados: [3, 2], ms: 130000 })).toBe('buscador');
    expect(ganadorRonda({ camaleones: [2, 3], encontrados: [], ms: 50000, buscadorSeFue: true })).toBe('camaleones');   // el buscador se salió
    expect(ganadorRonda({ camaleones: [], encontrados: [], ms: 50000 })).toBe('nadie');      // se fueron todos sin que encontrara a nadie
    expect(ganadorRonda({ camaleones: [], encontrados: [2], ms: 50000 })).toBe('buscador');  // encontró a uno y los demás se fueron
  });
  it('el servidor decide el mg durante la ronda (nadie se hace invisible ni se mete a una ronda ajena)', () => {
    expect(mgDelServidor(MG_SOLO, 1)).toBe(MG_ESCONDIDAS + 1);       // un tramposo en la ronda que manda 99
    expect(mgDelServidor(0, 2)).toBe(MG_ESCONDIDAS + 2);
    expect(mgDelServidor(MG_ESCONDIDAS + 1, null)).toBe(MG_SOLO);   // uno de afuera que dice estar en la ronda
    expect(mgDelServidor(12, null)).toBe(12);                       // en el salón: como siempre
    expect(mgDelServidor(MG_SOLO, null)).toBe(MG_SOLO);
  });
});

describe('movimiento suave (interpolación)', () => {
  // Un amigo que camina 1 m cada 100 ms, con su reloj 5000 ms adelantado al nuestro y 50 ms de viaje por internet
  const llega = (s, n, viaje = 50) => agregarMuestra(s, [n, 0, 0, 0], 5000 + n * 100, n * 100 + viaje);
  it('dibuja al amigo entre dos posiciones que ya llegaron', () => {
    const s = nuevoSuavizador();
    for (let n = 0; n <= 5; n++) llega(s, n);
    // todos llegan igual de rápido: se dibuja poquito en el pasado. Si dibujo su posición de los 300 ms (más el viaje) → 2,5 m
    expect(retrasoDe(s)).toBeLessThan(150);
    expect(valoresEn(s, 300 + retrasoDe(s), null)[0]).toBeCloseTo(2.5);
  });
  it('aunque los mensajes lleguen amontonados, el camino sigue parejo', () => {
    const parejo = nuevoSuavizador(), amontonado = nuevoSuavizador();
    for (let n = 0; n <= 6; n++) llega(parejo, n);
    // los mensajes 2 y 3 se atrasaron y llegaron juntos con el 4
    for (const n of [0, 1]) llega(amontonado, n);
    for (const n of [2, 3]) llega(amontonado, n, 50 + (4 - n) * 100);
    for (const n of [4, 5, 6]) llega(amontonado, n);
    expect(retrasoDe(amontonado)).toBeGreaterThan(300);   // se dio cuenta de que hay que esperar más
    // dibujando con ese retraso, el amontonado avanza parejo: lo mismo en cada pasito de 50 ms
    const pasos = [700, 750, 800, 850, 900].map(a => valoresEn(amontonado, a)[0]);
    for (let i = 1; i < pasos.length; i++) expect(pasos[i] - pasos[i - 1]).toBeCloseTo(0.5, 1);
  });
  it('si dejan de llegar mensajes, se queda en el último (no inventa)', () => {
    const s = nuevoSuavizador();
    for (let n = 0; n <= 3; n++) llega(s, n);
    expect(valoresEn(s, 5000, null)[0]).toBe(3);
  });
  it('si estuvo quieto un segundo, no se desliza despacito todo ese segundo', () => {
    const s = nuevoSuavizador();
    agregarMuestra(s, [0, 0, 0, 0], 0, 50);
    agregarMuestra(s, [1, 0, 0, 0], 1000, 1050);   // se quedó quieto y recién ahora se movió 1 m
    expect(valoresEn(s, 500 + 50 + retrasoDe(s))[0]).toBe(0);   // a la mitad de ese segundo sigue quieto
  });
  it('gira por el camino más corto, teletransporta lo lejano y no mezcla los "sí/no"', () => {
    const clase = i => (i === 1 ? 'giro' : i === 2 ? 'fijo' : null);
    const v = mezclar([0, 3.0, 0], [10, -3.0, 1], 0.5, clase);
    expect(v[0]).toBe(5);
    expect(Math.abs(Math.sin(v[1]))).toBeLessThan(0.2);   // de 3 a -3 rad pasa por π (atrás), no por 0
    expect(v[2]).toBe(0);
    expect(mezclar([0], [TELETRANSPORTE + 5], 0.5)[0]).toBe(TELETRANSPORTE + 5);
  });
  it('el retraso nunca pasa de medio segundo', () => {
    const s = nuevoSuavizador();
    agregarMuestra(s, [0, 0, 0, 0], 0, 0);
    agregarMuestra(s, [1, 0, 0, 0], 100, 5000);   // llegó 5 segundos tarde
    expect(retrasoDe(s)).toBe(RETRASO_MAX);
  });
  it('sin muestras no hay posición, y un juego viejo (sin hora) también funciona', () => {
    const s = nuevoSuavizador();
    expect(valoresEn(s, 100)).toBeNull();
    agregarMuestra(s, [7, 0, 0, 0], null, 100);
    expect(valoresEn(s, 1000)[0]).toBe(7);
  });
});
