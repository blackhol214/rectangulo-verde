import { describe, it, expect } from 'vitest';
import { recompensa, RECOMPENSAS, cerebroNuevo, cerebrosNuevos, decidir, mutar, aprender, juzgar, terminarIntento, proximoCerebro,
  crearEpisodio, pasoEpisodio, correrEpisodio, entrenar, salaTorre, salaEscondidas, sentidos, escondite, exploracion,
  leerCerebros, accionAlAzar, nombreGuy, claveGuy, NOMBRE_GUY, ENTRADAS, SALIDAS, EPISODIO_S, BUSCADOR_SB, terrenoDe, salaAtrapadas, cajasArena, moverConCajas } from '../src/ia.js';
import { seededRandom, torreNoMires, TERRENOS, cajasTerreno, plataformasAN, portalesAN } from '../src/logic.js';

const prom = a => a.reduce((s, x) => s + x, 0) / a.length;
// Cuánto saca un cerebro (en pruebas limpias, sin cosas al azar)
const nota = (sala, pesosDeTodos, n = 8) => prom(Array.from({ length: n }, (_, i) => correrEpisodio(sala, pesosDeTodos, null, 9e6 + i, true)[0]));
// Un cerebro "hecho a mano" para la torre: ir hacia la plataforma siguiente (más rápido si está lejos) y saltar siempre
const N = ENTRADAS * SALIDAS;
const aMano = () => { const w = Array(ENTRADAS * SALIDAS).fill(0); w[0] = 1; w[17] = 1; return w; };

describe('🏆 Las recompensas (las reglas de Mathias)', () => {
  it('No mires abajo: +5 por plataforma nueva; ir para atrás y caerse quitan puntos y lo sacuden', () => {
    expect(recompensa('torre', { tipo: 'checkpoint' })).toEqual({ puntos: 5, castigo: false });
    expect(recompensa('torre', { tipo: 'atras' })).toEqual({ puntos: RECOMPENSAS.torre.atras, castigo: true });
    expect(RECOMPENSAS.torre.atras).toBeLessThan(0);
    expect(recompensa('torre', { tipo: 'caida' }).puntos).toBeLessThan(0);
    expect(recompensa('torre', { tipo: 'caida' }).castigo).toBe(true);
  });
  it('Escondidas: escondido suma, visto resta y quedarse quieto mucho rato es castigo (y sacudida)', () => {
    expect(recompensa('escondidas', { tipo: 'escondido', seg: 2 }).puntos).toBe(2);
    expect(recompensa('escondidas', { tipo: 'visto', seg: 2 }).puntos).toBe(-2);
    expect(recompensa('escondidas', { tipo: 'quieto' })).toEqual({ puntos: RECOMPENSAS.escondidas.quieto, castigo: true });
  });
  it('Atrapadas: cada segundo sin la mancha suma; que te la pasen o explotar quitan y sacuden', () => {
    expect(recompensa('atrapadas', { tipo: 'sinMancha', seg: 3 }).puntos).toBe(3);
    expect(recompensa('atrapadas', { tipo: 'teLaPasan' })).toEqual({ puntos: -5, castigo: true });
    expect(recompensa('atrapadas', { tipo: 'explotas' })).toEqual({ puntos: -10, castigo: true });
    expect(recompensa('atrapadas', { tipo: 'ganas' }).puntos).toBeGreaterThan(0);
  });
});

describe('🧠 El cerebro', () => {
  it('al principio sus pesos son chiquitos y al azar (no sabe nada), y el mismo número da el mismo cerebro', () => {
    const c = cerebroNuevo(5);
    expect(c.pesos).toHaveLength(ENTRADAS * SALIDAS);
    expect(c.pesos.every(w => Math.abs(w) <= 0.5)).toBe(true);
    expect(cerebroNuevo(5).pesos).toEqual(c.pesos);
    expect(cerebroNuevo(6).pesos).not.toEqual(c.pesos);
  });
  it('decidir: "adelante" lo lleva hacia su meta', () => {
    const w = Array(ENTRADAS * SALIDAS).fill(0); w[5] = 3;   // adelante = sesgo grande
    const d = decidir(w, { dir: { x: 0, z: 1 }, entradas: [0, 0, 0, 0, 0, 1] });
    expect(d.mz).toBeGreaterThan(0.9); expect(Math.abs(d.mx)).toBeLessThan(0.01); expect(d.saltar).toBe(false);
  });
  it('explora mucho al principio y poquito después', () => {
    expect(exploracion(0)).toBeGreaterThan(0.5);
    expect(exploracion(200)).toBeLessThan(0.05);
  });
  it('mutar cambia solo unos pocos pesos', () => {
    const w = Array(N).fill(0), m = mutar(w, 0.5, seededRandom(1));
    const cambiados = m.filter(x => x !== 0).length;
    expect(cambiados).toBeGreaterThanOrEqual(1); expect(cambiados).toBeLessThanOrEqual(3);
  });
  it('aprender: si algo da "no es un número" (NaN), no se rompe ni se queda con un cerebro roto', () => {
    const c = cerebroNuevo(1), roto = { pesos: Array(N).fill(NaN) };
    const n = aprender(c, roto, NaN, { nueva: 50, mejor: 0 });
    expect(n.mejor.pesos.every(Number.isFinite)).toBe(true); expect(n.historial).toEqual([0]);
    expect(Number.isFinite(aprender(c, { pesos: c.pesos }, 3, { nueva: NaN, mejor: NaN }).mejor.puntaje)).toBe(true);
  });
  it('aprender: si la idea nueva saca más que el mejor, se la queda; si saca menos, no', () => {
    const c = cerebroNuevo(1), idea = { pesos: Array(N).fill(1) };
    expect(aprender(c, idea, 10, { nueva: 20, mejor: 5 }).mejor.pesos).toEqual(idea.pesos);
    const no = aprender(c, idea, 10, { nueva: 1, mejor: 5 });
    expect(no.mejor.pesos).toEqual(c.mejor.pesos); expect(no.intento).toBe(1); expect(no.historial).toEqual([10]);
  });
});

describe('🧘 Quedarse quieto (una decisión que él aprende)', () => {
  it('existe la acción "quedarse quieto": si su cuarta neurona dice que sí, no camina ni salta', () => {
    const w = Array(N).fill(0); w[3 * ENTRADAS + 5] = 3; w[5] = 3; w[2 * ENTRADAS + 5] = 3;   // quiere ir adelante y saltar… pero también quedarse quieto
    expect(decidir(w, { dir: { x: 1, z: 0 }, entradas: [0, 0, 0, 0, 0, 1] })).toMatchObject({ mx: 0, mz: 0, saltar: false, quieto: true });
    expect(decidir(Array(N).fill(0), { dir: { x: 1, z: 0 }, entradas: [0, 0, 0, 0, 0, 1] }).quieto).toBe(false);
  });
  it('en la torre, quedarse quieto saca más puntos que volver para atrás (que es castigo y sacudida)', () => {
    const probar = pesos => {   // empieza parado en la plataforma 3 (ya llegó hasta ahí), durante 3 segundos
      const ep = crearEpisodio('torre', [pesos], null, 1, true), a = ep.agentes[0], p = ep.def.plats[3];
      Object.assign(a, { x: p.x, y: p.y, z: p.z, plat: 3, maxPlat: 3, ultX: p.x, ultZ: p.z });
      while (ep.t < 3) pasoEpisodio(ep);
      return a.puntaje;
    };
    const atras = Array(N).fill(0); atras[5] = -3;                    // camina para atrás (lejos de la plataforma siguiente)
    const quieto = Array(N).fill(0); quieto[3 * ENTRADAS + 5] = 3;   // se queda quieto
    expect(probar(quieto)).toBe(0);
    expect(probar(atras)).toBeLessThan(0);
    expect(probar(quieto)).toBeGreaterThan(probar(atras));
  });
  it('al explorar, a veces también prueba quedarse quieto', () => {
    const r = seededRandom(9), acciones = Array.from({ length: 200 }, () => accionAlAzar(r));
    expect(acciones.some(a => a.quieto)).toBe(true); expect(acciones.some(a => !a.quieto)).toBe(true);
  });
});

describe('🏃 Los intentos', () => {
  it('la misma semilla da exactamente el mismo intento (y otra semilla, otro)', () => {
    for (const sala of ['torre', 'escondidas', 'atrapadas']) {
      const cs = cerebrosNuevos(sala).map(c => c.pesos);
      expect(correrEpisodio(sala, cs, cs.map(() => 0), 42)).toEqual(correrEpisodio(sala, cs, cs.map(() => 0), 42));
    }
    const cs = cerebrosNuevos('escondidas').map(c => c.pesos);
    expect(correrEpisodio('escondidas', cs, [0], 1)).not.toEqual(correrEpisodio('escondidas', cs, [0], 2));
  });
  it('torre: la primera plataforma es ENORME; quedarse quieto para siempre resta un poquito; el cerebro a mano sube muchas', () => {
    const P = salaTorre().plats, real = torreNoMires();
    expect(P[0].ancho).toBeGreaterThanOrEqual(15); expect(P[0].ancho).toBeGreaterThan(real[0].ancho);   // la única diferencia con la torre de verdad
    P.slice(1).forEach((p, i) => expect(p).toEqual(real[i + 1]));                                     // las demás: exactamente las mismas
    expect(P[P.length - 1].tipo).toBe('checkpoint');                                                  // practica hasta el primer checkpoint
    // quieto para siempre: solo el castiguito por no moverse (-1 cada 5 s), sin sacudidas
    const quietoSiempre = correrEpisodio('torre', [Array(N).fill(0)], null, 1, true)[0];
    expect(quietoSiempre).toBeLessThan(0); expect(quietoSiempre).toBeGreaterThanOrEqual(RECOMPENSAS.torre.quieto * EPISODIO_S.torre / RECOMPENSAS.torre.quietoS);
    expect(correrEpisodio('torre', [aMano()], null, 1, true)[0]).toBeGreaterThanOrEqual(50);
  });
  it('torre: si se cae, pierde puntos, tiembla y vuelve a su última plataforma', () => {
    const w = Array(N).fill(0); w[5] = -3;   // camina para atrás (lejos de la meta) hasta caerse
    const ep = crearEpisodio('torre', [w], null, 1, true); let cayo = null;
    while (!ep.fin && !cayo) { pasoEpisodio(ep); cayo = ep.eventos.find(e => e.tipo === 'caida'); }
    expect(cayo).toBeTruthy(); expect(ep.agentes[0].temblor).toBeGreaterThan(0);
    expect(ep.agentes[0].puntaje).toBe(RECOMPENSAS.torre.caida); expect(ep.agentes[0].y).toBe(salaTorre().plats[0].y);
  });
  it('escondidas: quedarse quieto 4 s es castigo (y sacudida); el buscador de verdad cuenta 30 s y encuentra al que se queda a la vista', () => {
    const ep = crearEpisodio('escondidas', [Array(N).fill(0)], null, 3, true, { terreno: 0 }), quietos = []; let encontrado = null, movio = false;
    const b0 = { x: ep.buscador.x, z: ep.buscador.z };
    while (!ep.fin) {
      pasoEpisodio(ep); quietos.push(...ep.eventos.filter(e => e.tipo === 'quieto'));
      if (ep.t < BUSCADOR_SB.cuentaS - 0.1) movio = movio || Math.hypot(ep.buscador.x - b0.x, ep.buscador.z - b0.z) > 0.5;
      if (ep.eventos.some(e => e.tipo === 'encontrado')) encontrado = ep.t;
    }
    expect(movio).toBe(false);                                     // mientras cuenta, no se mueve
    expect(quietos.length).toBeGreaterThanOrEqual(5); quietos.forEach(q => expect(q.puntos).toBe(RECOMPENSAS.escondidas.quieto));
    expect(encontrado).toBeGreaterThan(BUSCADOR_SB.cuentaS);        // lo encontró (después de contar)
    expect(ep.agentes[0].temblor).toBeGreaterThan(0);
  });
  it('escondidas: el buscador recorre los escondites de verdad si no ve a nadie', () => {
    // un Guy escondido muy lejos y quieto arriba de todo (no lo ve ni lo oye): el buscador va a los escondites
    const ep = crearEpisodio('escondidas', [Array(N).fill(0)], null, 5, true, { terreno: 0 }); let minLugar = Infinity;
    while (ep.t < 90) {
      Object.assign(ep.agentes[0], { x: 0, y: 500, z: 0, vy: 0 });   // (fuera de su vista)
      pasoEpisodio(ep);
      for (const l of ep.def.lugares) minLugar = Math.min(minLugar, Math.hypot(ep.buscador.x - (l.entrada || l).x, ep.buscador.z - (l.entrada || l).z));
    }
    expect(minLugar).toBeLessThan(2);   // llegó a (la entrada de) un escondite
  });
  it('atrapadas: 5 bots que no saben nada, con las reglas del juego (al que se la pasan: castigo y tiembla)', () => {
    const cs = cerebrosNuevos('atrapadas').map(c => c.pesos);
    const ep = crearEpisodio('atrapadas', cs, null, 4, false); let pase = null;
    while (!ep.fin && !pase) { pasoEpisodio(ep); pase = ep.eventos.find(e => e.tipo === 'teLaPasan'); }
    if (pase) { expect(pase.puntos).toBe(-5); expect(ep.agentes[pase.k].temblor).toBeGreaterThan(0); expect(ep.ronda.portador).toBe(pase.k); }
    expect(ep.agentes).toHaveLength(5);
    expect(sentidos(ep, 0).entradas).toHaveLength(ENTRADAS);
  });
});

describe('🦘 The Guy tiene doble salto en la torre (como tú)', () => {
  // Un cerebro que no camina y SIEMPRE quiere saltar: ¿hasta dónde sube? ¿cuántas veces salta en el aire?
  const soloSaltar = () => { const w = Array(N).fill(0); w[17] = 1; return w; };
  const saltar = (sala, pasos = 45) => {
    const ep = crearEpisodio(sala, [soloSaltar()], null, 1, true), a = ep.agentes[0], y0 = a.y; let alto = 0, maxAire = 0;
    for (let i = 0; i < pasos; i++) { pasoEpisodio(ep); alto = Math.max(alto, a.y - y0); maxAire = Math.max(maxAire, a.saltosAire); }
    return { alto, maxAire, dobles: a.dobles, a };
  };
  it('en la torre sube casi el doble que con un salto (12,5²/60 ≈ 2,6 m) y salta UNA sola vez en el aire', () => {
    const r = saltar('torre');
    expect(r.alto).toBeGreaterThan(4.5);            // con un salto solo llegaría a ≈ 2,6 m
    expect(r.maxAire).toBe(1);                       // nunca un tercer salto
    expect(r.dobles).toBeGreaterThanOrEqual(1);
  });
  it('al aterrizar se recarga: en 3 segundos hace varios dobles saltos', () => {
    const r = saltar('torre', 90);
    expect(r.dobles).toBeGreaterThanOrEqual(2);
  });
  it('en Escondidas NO hay doble salto (como en el juego)', () => {
    const r = saltar('escondidas');
    expect(r.dobles).toBe(0); expect(r.alto).toBeLessThan(2.8);
  });
});

describe('🗺️ Los mapas son los de verdad', () => {
  it('Escondidas: los 3 terrenos de verdad, con sus muebles (y cambia de terreno en cada intento)', () => {
    [0, 1, 2].forEach(i => { const d = salaEscondidas(i); expect(d.cajas).toEqual(cajasTerreno(TERRENOS[i])); expect(d.tapan.length).toBeGreaterThan(10); });
    expect(new Set([0, 1, 2, 3, 4, 5].map(terrenoDe)).size).toBe(3);
  });
  it('Atrapadas: la arena de verdad (plataformas que se mueven y portales)', () => {
    const d = salaAtrapadas();
    expect(d.plats).toEqual(plataformasAN()); expect(d.portales).toEqual(portalesAN());
    const a = cajasArena(d, 0), b = cajasArena(d, 1.3);
    expect(a.some((c, i) => c.x0 !== b[i].x0 || c.y1 !== b[i].y1)).toBe(true);   // algunas se movieron
  });
  it('la física: choca de costado con una caja, se sube encima saltando y no atraviesa techos', () => {
    const caja = [{ x0: 1, x1: 3, z0: -1, z1: 1, y0: 0, y1: 1 }];
    const a = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 30; i++) moverConCajas(a, 0.1, 0, caja, 1 / 30, 0);
    expect(a.x).toBeLessThanOrEqual(1 - 0.39);   // la caja lo frena
    a.vy = 12.5; for (let i = 0; i < 30; i++) moverConCajas(a, 0.05, 0, caja, 1 / 30, 0);
    expect(a.y).toBe(1); expect(a.x).toBeGreaterThan(1);   // saltando, quedó arriba
  });
});

describe('📈 ¡Aprende de verdad! (muchos intentos sin dibujar)', () => {
  it('No mires abajo: después de 20 intentos sube mucho más que al principio', () => {
    const c0 = cerebrosNuevos('torre'), cs = entrenar('torre', c0, 20);
    const antes = nota('torre', [c0[0].pesos]), despues = nota('torre', [cs[0].mejor.pesos]);
    expect(despues).toBeGreaterThan(antes + 40);
    expect(despues).toBeGreaterThanOrEqual(50);   // ya sube al menos 10 plataformas
  }, 30000);
  it('Escondidas: con 2 cerebros distintos, después de 20 intentos en el salón se esconden mucho mejor (en promedio, +20 puntos o más)', () => {
    const antes = [], despues = [];
    const notaSalon = pesos => prom(Array.from({ length: 4 }, (_, i) => correrEpisodio('escondidas', [pesos], null, 7e6 + i, true, { terreno: 0 })[0]));
    for (const sem of [100, 300]) {
      const c0 = [cerebroNuevo(sem)], cs = entrenar('escondidas', c0, 20, { terreno: 0 });
      antes.push(notaSalon(c0[0].pesos)); despues.push(notaSalon(cs[0].mejor.pesos));
    }
    expect(prom(despues)).toBeGreaterThan(prom(antes) + 20);
    expect(Math.max(...despues)).toBeGreaterThan(40);
  }, 60000);
  it('Atrapadas: si empieza haciendo todo al revés (corre HACIA el que tiene la mancha), en 10 intentos aprende a escapar', () => {
    for (const sem of [1, 2, 3]) {
      const c0 = Array.from({ length: 5 }, (_, k) => cerebroNuevo(sem * 50 + k));
      const alReves = Array(N).fill(0); alReves[5] = -2;   // "adelante" negativo: se acerca al que tiene la mancha (y, si la tiene, se aleja de todos)
      c0[0] = { ...c0[0], pesos: alReves, mejor: { pesos: alReves, puntaje: 0 } };
      const cs = entrenar('atrapadas', c0, 10, { soloAprende: 0 }), otros = c0.slice(1).map(c => c.pesos);   // (los otros 4 no cambian: así se mide solo a él)
      const antes = nota('atrapadas', [alReves, ...otros], 8), despues = nota('atrapadas', [cs[0].mejor.pesos, ...otros], 8);
      expect(despues, `grupo ${sem}`).toBeGreaterThan(antes + 30);
    }
  }, 30000);
  it('el juez es justo: mismo cerebro, misma nota', () => {
    const w = [aMano()];
    expect(juzgar('torre', w, 0, 5)).toBe(juzgar('torre', w, 0, 5));
  });
});

describe('💾 Guardar y el nombre', () => {
  it('lo guardado se lee igual; si está roto, null', () => {
    const cs = entrenar('torre', cerebrosNuevos('torre'), 3);
    const leido = leerCerebros(JSON.stringify({ cerebros: cs }), 'torre');
    expect(leido[0].mejor.pesos).toEqual(cs[0].mejor.pesos); expect(leido[0].intento).toBe(3);
    expect(leerCerebros('{roto', 'torre')).toBeNull();
    expect(leerCerebros(JSON.stringify({ cerebros: cs }), 'atrapadas')).toBeNull();   // en Atrapadas son 5
    expect(leerCerebros(JSON.stringify({ cerebros: [{ ...cs[0], pesos: [1, 2] }] }), 'torre')).toBeNull();
  });
  it('el nombre de tu Guy: sin espacios de más, máximo 20 letras, y si está vacío "The Guy"', () => {
    expect(nombreGuy('  GILBERT  ')).toBe('GILBERT');
    expect(nombreGuy('Gil    bert')).toBe('Gil bert');
    expect(nombreGuy('x'.repeat(30))).toHaveLength(20);
    expect(nombreGuy('   ')).toBe(NOMBRE_GUY); expect(nombreGuy(null)).toBe('The Guy');
    expect(nombreGuy('<b>hola</b>')).toBe('<b>hola</b>');   // (se muestra con textContent: nunca se vuelve HTML)
  });
  it('cada usuario tiene su propio Guy (se guarda al lado de su partida)', () => {
    expect(claveGuy('Mathias', 'torre')).not.toBe(claveGuy('Otro', 'torre'));
    expect(claveGuy('Mathias', 'nombre')).toContain(':guy:');
    expect(claveGuy('Mathias', 'torre')).not.toBe(claveGuy('Mathias', 'escondidas'));
  });
});
