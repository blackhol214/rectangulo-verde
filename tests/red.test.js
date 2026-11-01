import { describe, it, expect } from 'vitest';
import { limpiarNombre, leerMensaje, acercar, acercarAngulo, piezasExplosion, lugarMoneda, faseAhora, corto, BORDE, DIA_SEGUNDOS, leerLook, leerSala, salaDeHost, linkOficial, leerPreguntas, revisarPreguntas, claveCorrecta, PROFE, MAX_MENSAJE, seVen, MG_SOLO, MG_ESCONDIDAS, MG_ATRAPADAS, AN, nuevaRondaAN, puedePasarAN, pasarAN, explotarAN, salirAN, seTocan, elegirPortador, sigueEnRondaAN, mareadoAN, empujeAN, vigilarPos, VIGILA, ESC, elegirBuscador, elegirTerreno, faseRonda, puedeEncontrar, ganadorRonda, mgDelServidor, nuevoSuavizador, agregarMuestra, valoresEn, mezclar, RETRASO_MS, RETRASO_MAX, retrasoDe, TELETRANSPORTE } from '../src/red.js';

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
      .toEqual({ tipo: 'hola', nombre: 'Leo', color: 0x2fae4e, monedas: 5, look: { hat: 'capBlue', glasses: null, blaster: 1, disfraz: null } });
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
    expect(leerLook({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2 })).toEqual({ hat: 'topHat', glasses: 'glassesPixel', blaster: 2, disfraz: null });
    expect(leerLook({ hat: 42, blaster: 7 })).toEqual({ hat: null, glasses: null, blaster: 0, disfraz: null });
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
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBe(true);    // tocándolo (con un poquito de margen por internet)
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 2 })).toBe(false);   // de lejos ya no vale: hay que tocarlo
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 1, y: 20, z: 0 })).toBe(false);   // arriba de la cama no cuenta
    expect(puedeEncontrar({ x: 0, y: 0, z: 0 }, { x: 1, y: 3, z: 0 })).toBe(false);    // ni a 3 m de altura
    expect(ESC.tocar).toBeLessThanOrEqual(1.5); expect(ESC.encontrarDist).toBeLessThan(3);
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

describe('Atrapadas Nocivas: la ronda', () => {
  const r0 = () => nuevaRondaAN([1, 2, 3, 4], 1000, () => 0);   // con azar 0 empieza el 1
  it('lee los mensajes (y rechaza los raros)', () => {
    const an = m => leerMensaje(JSON.stringify({ tipo: 'an', ...m }));
    for (const que of ['entrar', 'salir', 'empezar']) expect(an({ que })).toEqual({ tipo: 'an', que });
    expect(an({ que: 'pasar', a: 3 })).toEqual({ tipo: 'an', que: 'pasar', a: 3 });
    expect(an({ que: 'pasar', a: 'Leo' })).toBeNull();
    expect(an({ que: 'explotar' })).toBeNull();
  });
  it('empieza con todos vivos, uno con la mancha y 15 s', () => {
    const r = r0();
    expect(r.vivos).toEqual([1, 2, 3, 4]); expect(r.portador).toBe(1); expect(r.fin).toBe(1000 + 15000);
    const vistos = new Set(); for (let i = 0; i < 100; i++) vistos.add(nuevaRondaAN([1, 2, 3], 0).portador);
    expect(vistos.size).toBe(3);
  });
  it('pasar la mancha: solo el portador, a otro vivo, con 15 s nuevos', () => {
    let r = r0();
    expect(pasarAN(r, 2, 3, 2000)).toBeNull();     // el 2 no la tiene
    expect(pasarAN(r, 1, 1, 2000)).toBeNull();     // a sí mismo no
    expect(pasarAN(r, 1, 9, 2000)).toBeNull();     // a alguien que no juega no
    r = pasarAN(r, 1, 2, 2000);
    expect(r.portador).toBe(2); expect(r.fin).toBe(2000 + AN.tiempoMs);
  });
  it('no te la pueden devolver durante 1 s', () => {
    let r = { ...pasarAN(r0(), 1, 2, 2000), mareado: null };   // (sin el mareo, para ver solo esta regla)
    expect(puedePasarAN(r, 2, 1, 2500)).toBe(false);   // devolverla al toque: no
    expect(puedePasarAN(r, 2, 3, 2500)).toBe(true);    // a otro sí
    expect(puedePasarAN(r, 2, 1, 3001)).toBe(true);    // pasado 1 s, sí
  });
  it('si se acaba el reloj, el portador explota y la mancha va a otro al azar (con 15 s)', () => {
    const { ronda, exploto, ganador } = explotarAN(r0(), 16000, () => 0);
    expect(exploto).toBe(1); expect(ganador).toBeNull();
    expect(ronda.vivos).toEqual([2, 3, 4]); expect(ronda.portador).toBe(2); expect(ronda.fin).toBe(16000 + AN.tiempoMs);
  });
  it('gana el último que queda', () => {
    let r = nuevaRondaAN([1, 2], 0, () => 0);
    const fin = explotarAN(r, 15000);
    expect(fin.ronda).toBeNull(); expect(fin.ganador).toBe(2);
  });
  it('si se va el que tiene la mancha: ¡cuenta como explotar!', () => {
    const { ronda, que } = salirAN(r0(), 1, 5000, () => 0);
    expect(que).toBe('explota');
    expect(ronda.vivos).toEqual([2, 3, 4]); expect(ronda.portador).toBe(2); expect(ronda.fin).toBe(5000 + AN.tiempoMs);
    expect(ronda.salieron).toEqual([1]);
    const dos = salirAN(nuevaRondaAN([1, 2], 0, () => 0), 1, 100);
    expect(dos.que).toBe('explota'); expect(dos.ronda).toBeNull(); expect(dos.ganador).toBe(2);
  });
  it('si se va uno vivo sin la mancha: sale (y el portador sigue igual)', () => {
    const { ronda, que } = salirAN(r0(), 3, 5000);
    expect(que).toBe('sale'); expect(ronda.portador).toBe(1); expect(ronda.fin).toBe(16000); expect(ronda.vivos).toEqual([1, 2, 4]);
    const dos = salirAN(nuevaRondaAN([1, 2], 0, () => 0), 2, 100);
    expect(dos.que).toBe('sale'); expect(dos.ronda).toBeNull(); expect(dos.ganador).toBe(1);
  });
  it('si se va un fantasma: nadie se entera, y no vuelve a la ronda aunque se siente de nuevo', () => {
    const r = explotarAN(r0(), 16000, () => 0).ronda;   // explotó el 1
    expect(sigueEnRondaAN(r, 1)).toBe(true);           // fantasma: sigue en la ronda (todos lo ven)
    const { ronda, que } = salirAN(r, 1, 17000);
    expect(que).toBe('fantasma'); expect(ronda.vivos).toEqual(r.vivos); expect(ronda.portador).toBe(r.portador);
    expect(sigueEnRondaAN(ronda, 1)).toBe(false);
    expect(salirAN(ronda, 1, 18000).que).toBeNull();   // irse dos veces no hace nada
    expect(sigueEnRondaAN(ronda, 99)).toBe(false);     // alguien que no jugaba
    expect(sigueEnRondaAN(null, 1)).toBe(false);
  });
  it('el empujón: lejos del que te la pasó, siempre igual de fuerte', () => {
    const e = empujeAN({ x: 0, z: 0 }, { x: 1, z: 0 });
    expect(e.x).toBeCloseTo(AN.empuje.vel); expect(e.z).toBeCloseTo(0);
    const d = empujeAN({ x: 5, z: 5 }, { x: 4, z: 4 });
    expect(d.x).toBeLessThan(0); expect(d.z).toBeLessThan(0); expect(Math.hypot(d.x, d.z)).toBeCloseTo(AN.empuje.vel, 1);
    const encima = empujeAN({ x: 3, z: 3 }, { x: 3, z: 3 }, () => 0.25);   // uno encima del otro: al azar
    expect(encima.x).toBeCloseTo(0, 1); expect(encima.z).toBeCloseTo(AN.empuje.vel, 1);
  });
  it('el empujón te lleva unos 20 m (con la física del juego: gravedad 30, freno 0,4 en el aire y 6 en el piso)', () => {
    let x = 0, y = 0, vx = AN.empuje.vel, vy = AN.empuje.salto; const dt = 1 / 60;
    for (let i = 0; i < 300; i++) {
      x += vx * dt; const piso = y <= 0 && vy <= 0; vx *= Math.exp(-(piso ? 6 : 0.4) * dt);
      vy -= 30 * dt; y = Math.max(0, y + vy * dt); if (y === 0) vy = Math.max(0, vy);
    }
    expect(x).toBeGreaterThan(18); expect(x).toBeLessThan(22);
    expect(AN.empuje.extraM).toBeGreaterThanOrEqual(x);   // el servidor deja moverse todo eso (hacia allá)
  });
  it('el que recibe la mancha queda mareado 2 s: no la puede pasar (y después sí)', () => {
    const r = pasarAN(r0(), 1, 2, 1000);
    expect(mareadoAN(r, 2, 1500)).toBe(true); expect(mareadoAN(r, 1, 1500)).toBe(false);
    expect(puedePasarAN(r, 2, 3, 1500)).toBe(false);                 // mareado: no puede pasársela a nadie
    expect(puedePasarAN(r, 2, 3, 1000 + AN.mareoMs)).toBe(true);     // pasados 2 s, sí
    expect(r.fin).toBe(1000 + AN.tiempoMs);                          // el reloj igual arranca en 15 s
    expect(AN.mareoMs).toBe(2000);
    const e = explotarAN({ ...r, portador: 2 }, 20000, () => 0).ronda;   // si explota, el nuevo no empieza mareado
    expect(e.mareado).toBeNull();
  });
  it('el inmune es fácil de cambiar (sigue en 1 s)', () => {
    expect(AN.inmuneMs).toBe(1000);
  });
  it('tocarse: cerca y a la misma altura', () => {
    expect(seTocan({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(seTocan({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBe(false);
    expect(seTocan({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, AN.tocarServidor)).toBe(true);   // el servidor da margen
    expect(seTocan({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 10, z: 0 })).toBe(false);
  });
  it('el mg de Atrapadas lo decide el servidor', () => {
    expect(mgDelServidor(0, null, true)).toBe(MG_ATRAPADAS);
    expect(mgDelServidor(MG_ATRAPADAS, null, false)).toBe(MG_SOLO);   // no puedes decir que estás adentro si no estás
    expect(mgDelServidor(12, null, false)).toBe(12);
    expect(elegirPortador([5, 6], () => 0.9)).toBe(6);
  });
});

describe('🛡️ vigilarPos: el servidor no deja hacer trampa con la velocidad', () => {
  const zona = { x0: -50, x1: 50, z0: -50, z1: 50, velMax: 16, llegada: { x: 10, z: 0, radio: 4 },
    yMin: 0, yMax: 35, saltos: [{ desde: { x: -20, y: 0, z: 20 }, hasta: { x: 40, y: 10, z: 40 } }] };
  const en = (x, z, t = 0) => ({ x, y: 0, z, t, llego: true });
  it('al empezar: solo puede aparecer en su lugar de salida', () => {
    expect(vigilarPos(null, { x: 11, y: 0, z: 1 }, 0, zona)).toMatchObject({ pos: { x: 11, z: 1, llego: true }, corregido: false });
    const lejos = vigilarPos(null, { x: -40, y: 0, z: -40 }, 0, zona);   // apareció al lado de otro: ¡no!
    expect(lejos.pos).toMatchObject({ x: 10, z: 0, llego: true }); expect(lejos.corregido).toBe(true);
    const salon = vigilarPos(null, { x: 900, y: 0, z: 0 }, 0, zona);     // todavía no llegó (sigue en el salón)
    expect(salon.pos).toMatchObject({ x: 900, llego: false });
    expect(vigilarPos(salon.pos, { x: 9, y: 0, z: 0 }, 100, zona).pos.llego).toBe(true);
  });
  it('caminar o correr normal: lo deja', () => {
    const v = vigilarPos(en(0, 0, 0), { x: 1.2, y: 0, z: 0 }, 100, zona);
    expect(v.pos.x).toBe(1.2); expect(v.corregido).toBe(false);
    // 1,5 m cada 0,1 s (a 15 m/s) durante 3 s: nunca lo corrige
    let p = en(0, 0, 0), corr = false;
    for (let i = 1; i <= 30; i++) { const v = vigilarPos(p, { x: 1.5 * i, y: 0, z: 0 }, i * 100, zona); corr = corr || v.corregido; p = v.pos; }
    expect(corr).toBe(false); expect(p.x).toBeCloseTo(45);
  });
  it('¡XTREMO! muy rápido: solo avanza lo que se puede', () => {
    const v = vigilarPos(en(0, 0, 0), { x: 40, y: 0, z: 0 }, 100, zona);   // 40 m en 0,1 s
    expect(v.corregido).toBe(true);
    expect(v.pos.x).toBeCloseTo(VIGILA.maxSaldo);   // solo lo que tenía en la alcancía
    // Y si sigue corriendo a 60 m/s, en 2 s avanza como mucho velMax (16) por segundo + la alcancía
    let p = v.pos;
    for (let i = 2; i <= 21; i++) p = vigilarPos(p, { x: p.x + 6, y: 0, z: 0 }, i * 100, zona).pos;
    expect(p.x).toBeLessThanOrEqual(VIGILA.maxSaldo + 16 * 2 + 0.01);
  });
  it('caerse sí vale (lo vertical no se revisa)', () => {
    expect(vigilarPos({ ...en(0, 0, 0), y: 30 }, { x: 0, y: 0, z: 0 }, 100, zona).corregido).toBe(false);
  });
  it('dejar de mandar mucho rato no da "metros guardados" (la alcancía tiene un máximo)', () => {
    const v = vigilarPos(en(0, 0, 0), { x: 45, y: 0, z: 0 }, 10000, zona);
    expect(v.corregido).toBe(true); expect(v.pos.x).toBeCloseTo(VIGILA.maxSaldo);
  });
  it('no puede salirse de la zona', () => {
    const v = vigilarPos(en(49, 0, 0), { x: 52, y: 0, z: 0 }, 1000, zona);
    expect(v.pos.x).toBe(50); expect(v.corregido).toBe(true);
  });
  it('un portal: de la entrada a la salida de su par sí vale; a otro lado, no', () => {
    expect(vigilarPos(en(-19, 21, 0), { x: 40, y: 10, z: 41 }, 100, zona).corregido).toBe(false);   // la salida está a 10 m
    expect(vigilarPos(en(-19, 21, 0), { x: -40, y: 0, z: -41 }, 100, zona).corregido).toBe(true);   // no es la salida
    expect(vigilarPos(en(0, 0, 0), { x: 40, y: 10, z: 41 }, 100, zona).corregido).toBe(true);       // no estaba en la entrada
    expect(vigilarPos(en(-17, 20, 0), { x: 40, y: 10, z: 41 }, 100, zona).corregido).toBe(true);    // a 3 m de la entrada: muy lejos
  });
  it('un portal: solo a la altura de verdad (ni volando por encima de la entrada, ni saliendo más arriba)', () => {
    const volando = { ...en(-19, 21, 0), y: 20 };
    expect(vigilarPos(volando, { x: 40, y: 10, z: 41 }, 100, zona).corregido).toBe(true);
    const v = vigilarPos(en(-19, 21, 0), { x: 40, y: 30, z: 41 }, 100, zona);
    expect(v.corregido).toBe(true); expect(v.pos.y).toBeLessThan(5);
  });
  it('¡no se puede volar! (y=300 de golpe): queda en el techo de la zona y sube como mucho un salto', () => {
    const v = vigilarPos(en(0, 0, 0), { x: 0, y: 300, z: 0 }, 100, zona);
    expect(v.corregido).toBe(true); expect(v.pos.y).toBeLessThanOrEqual(VIGILA.maxSaldoY + 0.01);
    // y si sigue mandando y=300 diez segundos: nunca pasa del techo (35)
    let p = v.pos;
    for (let i = 2; i <= 100; i++) p = vigilarPos(p, { x: 0, y: 300, z: 0 }, i * 100, zona).pos;
    expect(p.y).toBeLessThanOrEqual(35);
  });
  it('volar despacito (subiendo de a poco por mucho rato) tampoco: no puede estar a más de un salto de lo que tiene abajo', () => {
    const z2 = { ...zona, soporte: (x, z) => (Math.abs(x - 20) < 3 && Math.abs(z) < 3 ? 10 : 0) };   // una plataforma a 10 m en x=20
    let p = en(0, 0, 0);
    for (let i = 1; i <= 50; i++) p = vigilarPos(p, { x: 0, y: i * 0.5, z: 0 }, i * 100, z2).pos;   // sube 5 m/s durante 5 s
    expect(p.y).toBeLessThanOrEqual(VIGILA.salto + 0.01);
    // arriba de la plataforma sí puede estar a 10 m (+ un salto)
    expect(vigilarPos({ ...en(20, 0, 0), y: 10 }, { x: 20, y: 12.5, z: 0 }, 200, z2).pos.y).toBeCloseTo(12.5);
    // y si se cae del borde (queda alto sin nada abajo) puede bajar, pero no subir
    const borde = { ...en(24, 0, 0), y: 10 };
    expect(vigilarPos(borde, { x: 24, y: 9, z: 0 }, 100, z2).corregido).toBe(false);
    expect(vigilarPos(borde, { x: 24, y: 11, z: 0 }, 100, z2).pos.y).toBe(10);
  });
  it('saltar de verdad sí vale (sube 2,6 m en 0,4 s), y caerse de muy alto también', () => {
    let p = en(0, 0, 0), corr = false;
    const alturas = [1.1, 1.9, 2.4, 2.6, 2.3, 1.6, 0.6, 0];   // un salto con la física del juego, cada 0,1 s
    alturas.forEach((y, i) => { const v = vigilarPos(p, { x: 0, y, z: 0 }, (i + 1) * 100, zona); corr = corr || v.corregido; p = v.pos; });
    expect(corr).toBe(false);
    expect(vigilarPos({ ...en(0, 0, 0), y: 30 }, { x: 0, y: 0, z: 0 }, 100, zona).corregido).toBe(false);
  });
  it('no llegar a tu lugar al empezar: a los 3 s el servidor te pone ahí igual', () => {
    const z2 = { ...zona, llegarHasta: 3000 };
    expect(vigilarPos(null, { x: 900, y: 0, z: 0 }, 1000, z2).pos.llego).toBe(false);   // todavía en el salón: vale
    const tarde = vigilarPos(null, { x: 900, y: 0, z: 0 }, 3500, z2);
    expect(tarde.pos).toMatchObject({ x: 10, y: 0, z: 0, llego: true }); expect(tarde.corregido).toBe(true);
  });
  it('teletransportes cortos (al lado de alguien a 5 m) tampoco: la alcancía es chiquita', () => {
    const v = vigilarPos(en(0, 0, 0), { x: 5, y: 0, z: 0 }, 50, zona);
    expect(v.corregido).toBe(true); expect(v.pos.x).toBeLessThanOrEqual(VIGILA.maxSaldo + 16 * 0.05 + 0.01);
  });
  it('el empujón: los metros de más valen, pero se gastan', () => {
    const gastada = { ...en(0, 0, 0), saldo: 0 };   // ya venía corriendo (sin metros en la alcancía)
    const hacia = { x: 1, z: 0 };   // te empujaron hacia +x
    const v = vigilarPos(gastada, { x: 8, y: 0, z: 0 }, 100, zona, AN.empuje.extraM, hacia);
    expect(v.corregido).toBe(false); expect(v.extra).toBeCloseTo(AN.empuje.extraM - (8 - 1.6));
    expect(vigilarPos(gastada, { x: 8, y: 0, z: 0 }, 100, zona, 0).corregido).toBe(true);   // sin empujón, no
    expect(vigilarPos(gastada, { x: 7, y: 0, z: 3 }, 100, zona, AN.empuje.extraM, hacia).corregido).toBe(false);   // un poquito de costado: vale
  });
  it('el empujón solo vale hacia donde te empujaron (no para teletransportarte para otro lado)', () => {
    const gastada = { ...en(0, 0, 0), saldo: 0 }, hacia = { x: 1, z: 0 };
    const atras = vigilarPos(gastada, { x: -8, y: 0, z: 0 }, 100, zona, AN.empuje.extraM, hacia);
    expect(atras.corregido).toBe(true); expect(atras.pos.x).toBeCloseTo(-1.6); expect(atras.extra).toBe(AN.empuje.extraM);   // no gasta el empujón
    expect(vigilarPos(gastada, { x: 0, y: 0, z: 8 }, 100, zona, AN.empuje.extraM, hacia).corregido).toBe(true);   // de costado tampoco
  });
  it('la ronda nueva recuerda cuándo empezó (para el "no llegaste a tiempo")', () => {
    expect(nuevaRondaAN([1, 2], 5000).inicio).toBe(5000);
  });
});

describe('🎃 el disfraz se ve en el multijugador', () => {
  it('leerLook acepta solo disfraces que existen', () => {
    expect(leerLook({ hat: null, glasses: null, blaster: 0, disfraz: 'momia' }).disfraz).toBe('momia');
    expect(leerLook({ disfraz: '<script>' }).disfraz).toBeNull();
    expect(leerLook({ disfraz: 5 }).disfraz).toBeNull();
    expect(leerLook(null).disfraz).toBeNull();
  });
});
describe('suavizar a los amigos: los portales se ven de golpe', () => {
  it('si saltó lejos (un portal a una isla), aparece allá entero, sin deslizar la altura', () => {
    const a = [0, 0, 0, 0], b = [30, 10, 5, 1];   // 30 m de costado y 10 m arriba
    expect(mezclar(a, b, 0.5)).toEqual(b);
  });
  it('si se movió poquito, se mezcla suave como siempre', () => {
    expect(mezclar([0, 0, 0], [2, 1, 0], 0.5)).toEqual([1, 0.5, 0]);
  });
});

import { MG_CARRERA } from '../src/red.js';
describe('🏁 Carrera por la red', () => {
  it('lee los mensajes de la carrera (y rechaza los raros)', () => {
    for (const que of ['entrar', 'salir', 'empezar', 'llegue']) expect(leerMensaje(JSON.stringify({ tipo: 'cr', que }))).toEqual({ tipo: 'cr', que });
    expect(leerMensaje(JSON.stringify({ tipo: 'cr', que: 'golpe', o: 3 }))).toEqual({ tipo: 'cr', que: 'golpe', o: 3 });
    expect(leerMensaje(JSON.stringify({ tipo: 'cr', que: 'golpe', o: -1 }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'cr', que: 'golpe', o: 'x' }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'cr', que: 'ganar' }))).toBeNull();
  });
  it('el mg de la carrera lo pone el servidor: nadie de afuera puede decir que está corriendo', () => {
    expect(mgDelServidor(0, null, false, MG_CARRERA)).toBe(MG_CARRERA);
    expect(mgDelServidor(MG_CARRERA, null, false, null)).toBe(MG_SOLO);
    expect(mgDelServidor(12, null)).toBe(12);
  });
});

describe('🔶 Spleef por la red', () => {
  it('lee los mensajes del Spleef (y rechaza los raros)', () => {
    for (const que of ['entrar', 'salir', 'empezar']) expect(leerMensaje(JSON.stringify({ tipo: 'sp', que }))).toEqual({ tipo: 'sp', que });
    expect(leerMensaje(JSON.stringify({ tipo: 'sp', que: 'pisa', h: [[0, 12], [1, 300]] }))).toEqual({ tipo: 'sp', que: 'pisa', h: [[0, 12], [1, 300]] });
    expect(leerMensaje(JSON.stringify({ tipo: 'sp', que: 'pisa', h: [] }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'sp', que: 'pisa', h: Array(31).fill([0, 1]) }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'sp', que: 'pisa', h: [[0, -1]] }))).toBeNull();
    expect(leerMensaje(JSON.stringify({ tipo: 'sp', que: 'ganar' }))).toBeNull();
  });
});
