import { describe, it, expect } from 'vitest';
import { nuevaRondaNave, mensajesInicio, tickNave, accionNave, salirNave, destinatarios, quienesVen, progresoRed, persona, esImpostor, vecesTareas, NAVE_RED } from '../src/nave.js';
import { seededRandom, tareaNave, ACCION_NAVE, BOTON_REUNION, ESCOTILLAS_NAVE, siguienteEscotilla, VOTACION, rutaNaveLibre, cruzaProp, TAREAS_NAVE, SALAS_NAVE, puntoLibreNave,
  zonaNave, centroNave, segmentoEnCaja, INICIO_NAVE } from '../src/logic.js';
import { vigilarPos } from '../src/red.js';

const humanos = n => Array.from({ length: n }, (_, i) => ({ id: 'h' + (i + 1), nombre: 'Jugador' + (i + 1) }));
// Una ronda con 3 amigos, y los impostores que queremos (para probar cada caso)
function ronda(n = 3, imps = null, semilla = 7) {
  const R = nuevaRondaNave(humanos(n), 0, seededRandom(semilla));
  if (imps) { R.imps = imps; for (const p of R.gente) { if (imps.includes(p.id)) { R.rep[p.id] = {}; R.base[p.id] = {}; } } }
  return R;
}
const posDe = R => Object.fromEntries(R.gente.filter(p => p.humano).map(p => [p.id, { x: p.x, z: p.z }]));
const tipos = msgs => msgs.map(e => e.m.tipo);

describe('🚀 Nave con amigos: empezar', () => {
  it('se llena hasta 15 con bots (3 amigos + 12 bots), con 2 impostores', () => {
    const R = ronda(3);
    expect(R.gente).toHaveLength(15); expect(R.gente.filter(p => p.humano)).toHaveLength(3); expect(R.imps).toHaveLength(2);
    const R15 = nuevaRondaNave(humanos(15), 0, seededRandom(1)); expect(R15.gente.every(p => p.humano)).toBe(true);
  });
  it('🤫 cada uno recibe SOLO su rol; los impostores saben quién es su compañero; nadie más', () => {
    const R = ronda(3, ['h1', 'b4']), m = mensajesInicio(R);
    expect(m.map(e => e.a).sort()).toEqual(['h1', 'h2', 'h3']);
    const de = id => m.find(e => e.a === id).m;
    expect(de('h1')).toMatchObject({ rol: 'impostor', socios: ['b4'] });
    for (const id of ['h2', 'h3']) { expect(de(id)).toMatchObject({ rol: 'tripulante', socios: [] }); expect(JSON.stringify(de(id))).not.toMatch(/impostor"|imps/); }
    // (en la lista de gente no dice quién es impostor)
    expect(Object.keys(de('h2').gente[0]).sort()).toEqual(['def', 'humano', 'id', 'nombre', 'x', 'z']);
  });
  it('con 6 o más amigos, cada tarea se hace 2 veces', () => {
    expect(vecesTareas(5)).toBe(1); expect(vecesTareas(6)).toBe(2);
    const R = nuevaRondaNave(humanos(6), 0, seededRandom(3)), h = R.gente.find(p => p.humano && !esImpostor(R, p.id));
    expect(Object.values(R.rep[h.id]).every(v => v === 2)).toBe(true);
  });
});

describe('🚀 Nave con amigos: el servidor revisa todo', () => {
  it('👊 atacar: solo un impostor, cerca, después de la espera, y nunca a su compañero', () => {
    const R = ronda(3, ['h1', 'h2']), pos = posDe(R);
    pos.h1 = { x: 30, z: 0 }; pos.h2 = { x: 31, z: 0 }; pos.h3 = { x: 31, z: 0.5 };
    expect(accionNave(R, 'h1', { que: 'atacar', a: 'h3' }, 0, pos).msgs).toEqual([]);   // (todavía no: primeros 20 s)
    R.t = 30;
    expect(accionNave(R, 'h3', { que: 'atacar', a: 'h1' }, 0, pos).msgs).toEqual([]);   // (un tripulante no puede)
    expect(accionNave(R, 'h1', { que: 'atacar', a: 'h2' }, 0, pos).msgs).toEqual([]);   // (a su compañero no)
    pos.h3 = { x: 40, z: 0 }; expect(accionNave(R, 'h1', { que: 'atacar', a: 'h3' }, 0, pos).msgs).toEqual([]);   // (lejos)
    pos.h3 = { x: 31.5, z: 0.5 };
    const r = accionNave(R, 'h1', { que: 'atacar', a: 'h3' }, 0, pos);
    expect(tipos(r.msgs)).toEqual(expect.arrayContaining(['nvCuerpo', 'nvFantasma', 'nvTeAtacaron']));
    expect(r.msgs.find(e => e.m.tipo === 'nvFantasma').a).toBe('imps');   // (que es fantasma, solo lo saben los impostores)
    expect(r.msgs.find(e => e.m.tipo === 'nvTeAtacaron').a).toBe('h3');
    expect(persona(R, 'h3').vivo).toBe(false);
    R.t = 40; expect(accionNave(R, 'h1', { que: 'atacar', a: 'b0' }, 0, { ...pos, h1: { x: persona(R, 'b0').x, z: persona(R, 'b0').z } }).msgs).toEqual([]);   // (espera de 25 s)
  });
  it('👻 a un fantasma solo lo ven los impostores (sus posiciones y sus mensajes)', () => {
    const R = ronda(3, ['h1', 'b0']); persona(R, 'h3').vivo = false;
    expect(quienesVen(R, 'h3')).toEqual(['h1']); expect(quienesVen(R, 'h2')).toBeNull();
    expect(destinatarios(R, 'fantasmasEimps').sort()).toEqual(['h1', 'h3']);
    expect(destinatarios(R, 'noImps').sort()).toEqual(['h2', 'h3']);
    // los bots fantasmas no les llegan a los que no son impostores
    persona(R, 'b2').vivo = false;
    const t = tickNave(R, 0.1, 0, posDe(R)).msgs, aImps = t.find(e => e.a === 'imps' && e.m.tipo === 'nvBots').m.l, aOtros = t.find(e => e.a === 'noImps' && e.m.tipo === 'nvBots').m.l;
    expect(aImps.some(b => b[0] === 'b2')).toBe(true); expect(aOtros.some(b => b[0] === 'b2')).toBe(false);
  });
  it('🔧 una tarea vale solo parado en su lugar y después de su tiempo mínimo', () => {
    const R = ronda(3, ['b0', 'b1']), t = tareaNave('cables'), pos = posDe(R);
    pos.h2 = { x: t.x, z: t.z };
    expect(accionNave(R, 'h2', { que: 'tarea', tarea: 'cables' }, 0, pos).msgs).toEqual([]);   // (sin abrir)
    accionNave(R, 'h2', { que: 'abrir', tarea: 'cables' }, 0, pos);
    expect(accionNave(R, 'h2', { que: 'tarea', tarea: 'cables' }, 0, pos).msgs).toEqual([]);   // (muy rápido)
    R.t += NAVE_RED.minTarea.cables;
    pos.h2 = { x: t.x + 10, z: t.z }; expect(accionNave(R, 'h2', { que: 'tarea', tarea: 'cables' }, 0, pos).msgs).toEqual([]);   // (se fue)
    pos.h2 = { x: t.x, z: t.z };
    const r = accionNave(R, 'h2', { que: 'tarea', tarea: 'cables' }, 0, pos);
    expect(tipos(r.msgs)).toEqual(expect.arrayContaining(['nvTareas', 'nvProgreso'])); expect(R.rep.h2.cables).toBe(0);
    expect(accionNave(R, 'h2', { que: 'tarea', tarea: 'cables' }, 0, pos).msgs).toEqual([]);   // (ya está)
  });
  it('📦 la caja: se agarra en el reactor y se deja en la bodega', () => {
    const R = ronda(3, ['b0', 'b1']), T = tareaNave('caja'), pos = posDe(R);
    pos.h2 = { x: T.x, z: T.z }; expect(accionNave(R, 'h2', { que: 'caja' }, 0, pos).msgs).toEqual([]);   // (no la tiene)
    pos.h2 = { ...T.recoger }; expect(accionNave(R, 'h2', { que: 'caja' }, 0, pos).msgs[0].m.estado).toBe('lleva');
    pos.h2 = { x: T.x, z: T.z }; accionNave(R, 'h2', { que: 'caja' }, 0, pos); expect(R.rep.h2.caja).toBe(0);
  });
  it('💥 sabotaje y 💡 luces: solo impostores, cerca, y con espera', () => {
    const R = ronda(3, ['h1', 'b0']), t = tareaNave('virus'), pos = posDe(R); R.t = 30;
    R.rep.h2.virus = 0;
    pos.h2 = { x: t.x, z: t.z }; expect(accionNave(R, 'h2', { que: 'sabotear', tarea: 'virus' }, 0, pos).msgs).toEqual([]);
    pos.h1 = { x: t.x, z: t.z }; const r = accionNave(R, 'h1', { que: 'sabotear', tarea: 'virus' }, 0, pos);
    expect(R.rep.h2.virus).toBe(R.base.h2.virus); expect(r.msgs.find(e => e.a === 'h2' && e.m.tipo === 'nvTareas')).toBeTruthy();
    expect(accionNave(R, 'h1', { que: 'sabotear', tarea: 'virus' }, 0, pos).msgs).toEqual([]);   // (espera)
    expect(tipos(accionNave(R, 'h1', { que: 'luces' }, 0, pos).msgs)).toEqual(['nvLuces']);
    expect(accionNave(R, 'h1', { que: 'luces' }, 0, pos).msgs).toEqual([]);
    expect(accionNave(R, 'h2', { que: 'luces' }, 0, pos).msgs).toEqual([]);
  });
  it('🕳️ escotillas: solo el impostor, de una a la siguiente de su red', () => {
    const R = ronda(3, ['h1', 'b0']), e = ESCOTILLAS_NAVE[0], pos = posDe(R);
    pos.h2 = { x: e.x, z: e.z }; expect(accionNave(R, 'h2', { que: 'escotilla', id: e.id }, 0, pos).teleports).toEqual([]);
    pos.h1 = { x: e.x, z: e.z }; const r = accionNave(R, 'h1', { que: 'escotilla', id: e.id }, 0, pos), s = siguienteEscotilla(e.id);
    expect(r.teleports).toEqual([{ id: 'h1', x: s.x, z: s.z }]); expect(r.msgs[0]).toMatchObject({ a: 'h1', m: { tipo: 'nvMover' } });
    pos.h1 = { x: e.x + 5, z: e.z }; expect(accionNave(R, 'h1', { que: 'escotilla', id: e.id }, 0, pos).teleports).toEqual([]);
  });
});

describe('🚀 Nave con amigos: reuniones, chat y votos', () => {
  it('🚨 el botón: cerca, una vez, y después de 20 s; todos (vivos) van a la mesa', () => {
    const R = ronda(3, ['h1', 'b0']), pos = posDe(R); pos.h2 = { x: BOTON_REUNION.x, z: BOTON_REUNION.z - 2 };
    expect(accionNave(R, 'h2', { que: 'boton' }, 0, pos).msgs).toEqual([]);
    R.t = 25; const r = accionNave(R, 'h2', { que: 'boton' }, 1000, pos);
    expect(r.msgs[0].m.tipo).toBe('nvReunion'); expect(r.teleports.map(t => t.id).sort()).toEqual(['h1', 'h2', 'h3']); expect(R.fase).toBe('reunion');
  });
  it('🗣️ chat: limpio (sin palabras feas ni enlaces), 1 cada 2 s, y los fantasmas solo les hablan a fantasmas e impostores', () => {
    const R = ronda(3, ['h1', 'b0']); persona(R, 'h3').vivo = false; R.fase = 'reunion'; R.reunion = { fase: 'chat', votos: {}, votoBot: {}, hablar: [], inicio: 0 };
    const a = accionNave(R, 'h2', { que: 'chat', texto: 'eres un tonto, mira www.x.com' }, 1000, {});
    expect(a.msgs[0]).toMatchObject({ a: 'todos', m: { tipo: 'nvChat', texto: 'eres un *****, mira [enlace]' } });
    expect(accionNave(R, 'h2', { que: 'chat', texto: 'otra' }, 2000, {}).msgs[0].m.tipo).toBe('nvAviso');
    expect(accionNave(R, 'h2', { que: 'chat', texto: 'x'.repeat(300) }, 3100, {}).msgs[0].m.texto).toHaveLength(100);
    expect(accionNave(R, 'h3', { que: 'chat', texto: 'soy fantasma' }, 1000, {}).msgs[0].a).toBe('fantasmasEimps');
    expect(accionNave(R, 'h2', { que: 'chat', texto: '   ' }, 9000, {}).msgs).toEqual([]);
  });
  it('🗳️ votación de 20 s, sin saltar; el más votado sale (y se sabe si era impostor); empate: nadie', () => {
    const R = ronda(3, ['h1', 'b0']), pos = posDe(R); pos.h2 = { x: BOTON_REUNION.x, z: BOTON_REUNION.z - 2 }; R.t = 25;
    accionNave(R, 'h2', { que: 'boton' }, 0, pos);
    accionNave(R, 'h2', { que: 'empezarVoto' }, 1000, pos);
    expect(R.reunion.fase).toBe('votar');
    // todos los bots votan a h1; los amigos también
    for (const p of R.gente.filter(q => q.vivo)) R.reunion.votos[p.id] = 'h1';
    const t = tickNave(R, 0.1, 2000, pos).msgs, res = t.find(e => e.m.tipo === 'nvResultado');
    expect(res.m).toMatchObject({ expulsado: 'h1', texto: 'Jugador1 era el impostor :D' });
    expect(persona(R, 'h1').vivo).toBe(false);
    // y después del resultado, se sigue jugando
    const s = tickNave(R, 0.1, 2000 + NAVE_RED.resultado * 1000 + 10, pos).msgs; expect(tipos(s)).toContain('nvSigue'); expect(R.fase).toBe('jugar');
  });
  it('⏱️ si nadie vota a tiempo, se cierra a los 20 s', () => {
    const R = ronda(3, ['h1', 'b0']); R.fase = 'reunion'; R.reunion = { fase: 'chat', votos: {}, votoBot: {}, hablar: [], inicio: 0 };
    accionNave(R, 'h2', { que: 'empezarVoto' }, 0, {});
    for (const id in R.reunion.votoBot) R.reunion.votoBot[id] = Infinity;   // (los bots no votan)
    expect(tipos(tickNave(R, 0.1, VOTACION.segundos * 1000 - 100, {}).msgs)).not.toContain('nvResultado');
    expect(tickNave(R, 0.1, VOTACION.segundos * 1000 + 10, {}).msgs.find(e => e.m.tipo === 'nvResultado').m.texto).toMatch(/Nadie votó/);
  });
});

describe('🚀 Nave con amigos: quién gana', () => {
  it('ganan los impostores si quedan tantos tripulantes vivos como impostores (y al final se sabe quiénes eran)', () => {
    const R = ronda(3, ['h1', 'h2']);
    for (const p of R.gente) if (!R.imps.includes(p.id) && p.id !== 'h3') p.vivo = false;
    const r = salirNave(R, 'h3');
    const fin = r.find(e => e.m.tipo === 'nvFin'); expect(fin.m.gana).toBe('impostor'); expect(fin.m.imps.map(i => i.id)).toEqual(['h1', 'h2']);
  });
  it('gana la tripulación si se van los impostores, o con todas las tareas', () => {
    const R = ronda(3, ['h1', 'b0']); persona(R, 'b0').vivo = false;
    expect(salirNave(R, 'h1').find(e => e.m.tipo === 'nvFin').m.gana).toBe('tripulacion');
    const S = ronda(3, ['h1', 'b0']); for (const p in S.rep) for (const t in S.rep[p]) S.rep[p][t] = 0;
    expect(tickNave(S, 0.1, 0, posDe(S)).msgs.find(e => e.m.tipo === 'nvFin').m.gana).toBe('tripulacion');
  });
  it('🤖 los bots hacen sus tareas solos (la barra avanza) y la ronda termina', () => {
    const R = nuevaRondaNave(humanos(2), 0, seededRandom(11)), pos = posDe(R);
    let fin = null;
    for (let i = 0; i < 6000 && !fin; i++) {   // hasta 10 minutos de juego
      const r = tickNave(R, 0.1, i * 100, pos);
      const f = r.msgs.find(e => e.m.tipo === 'nvFin'); if (f) fin = f.m;
      if (R.fase === 'reunion' && R.reunion.fase === 'chat') accionNave(R, R.gente.find(p => p.vivo).id, { que: 'empezarVoto' }, i * 100, pos);
      for (const b of R.gente) if (!b.humano) { expect(Number.isFinite(b.x) && Number.isFinite(b.z)).toBe(true); expect(salaNaveEnOk(b)).toBe(true); }
    }
    expect(progresoRed(R).hechas).toBeGreaterThan(0); expect(fin).not.toBeNull();
  });
});
const salaNaveEnOk = b => SALAS_NAVE.some(s => b.x >= s.x0 - 0.01 && b.x <= s.x1 + 0.01 && b.z >= s.z0 - 0.01 && b.z <= s.z1 + 0.01);

describe('🚀 Nave: caminos de los bots y paredes del servidor', () => {
  it('los caminos de los bots nunca atraviesan las cosas de las salas', () => {
    const r = seededRandom(5);
    for (const t of TAREAS_NAVE) for (const s of SALAS_NAVE) for (let k = 0; k < 3; k++) {
      const desde = puntoLibreNave(s.id, r), camino = [desde, ...rutaNaveLibre(desde, t)];
      for (let i = 1; i < camino.length; i++) expect(cruzaProp(camino[i - 1], camino[i], 0.4), `${s.id} → ${t.id}`).toBe(false);
    }
  });
  it('🛡️ en la nave no se atraviesan paredes (pero sí se pasa por las puertas), y no se vuela', () => {
    const C = centroNave(), z = zonaNave(0, 1), en = (x, zz, y = 0) => ({ x: C.x + x, y, z: C.z + zz });
    const antes = { ...en(20, 0), t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    expect(vigilarPos({ ...antes, ...en(25, 0) }, en(25, 4), 500, z).pos.z).toBeCloseTo(C.z + 0, 5);   // del pasillo a la enfermería por la pared: no
    const puerta = { ...en(20, 0), t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    const door = SALAS_NAVE.findIndex(s => s.id === 'enfermeria');
    void door;
    const enPuerta = { ...en(19.5, 2), t: 0, llego: true, saldo: 3, saldoY: 3.5 };
    expect(vigilarPos(enPuerta, en(19.5, 4), 500, z).pos.z).toBeCloseTo(C.z + 4, 5);   // por la puerta (x 18..21): sí
    expect(vigilarPos(puerta, en(20, 0, 9), 500, z).pos.y).toBeLessThanOrEqual(4.6);   // (no se vuela)
    expect(segmentoEnCaja({ x: 0, z: 0 }, { x: 2, z: 0 }, { x0: 1, x1: 1.2, z0: -1, z1: 1 })).toBe(true);
    expect(segmentoEnCaja({ x: 0, z: 2 }, { x: 2, z: 2 }, { x0: 1, x1: 1.2, z0: -1, z1: 1 })).toBe(false);
    expect(INICIO_NAVE).toBeTruthy();
  });
});
