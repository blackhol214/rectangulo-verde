// 🚀 Nave entre sospechas CON AMIGOS: el ÁRBITRO (lo usa el servidor; también los tests).
// Todo es puro: la ronda (R) entra, cambia, y cada cosa que pasa devuelve MENSAJES con a quién mandarlos:
//   'todos' (los de la ronda) · 'imps' (los impostores) · 'noImps' (los que no son impostores) · 'fantasmasEimps' · o el id de alguien.
// Así nadie se entera de quién es impostor (salvo los impostores, entre ellos) hasta el final.
// Los bots viven aquí, en el servidor: caminan por las puertas, hacen sus tareas, y los bots impostores sabotean y atacan.
// Los jugadores (humanos) tienen ids 'h<número>'; los bots, 'b<número>'. Las posiciones van en metros desde el centro de la nave.
import { SALAS_NAVE, salaNaveEn, rutaNaveLibre, puntoLibreNave, TAREAS_NAVE, tareaNave, ESCOTILLAS_NAVE, siguienteEscotilla, ACCION_NAVE, APAGON, puedeApagar,
  BOTON_REUNION, puedeBotonReunion, puestosReunion, impostoresPara, NAVE, rosterBots, limpiarChat, puedeEscribir, VOTACION, contarVotos, mensajeExpulsion,
  resultadoNave, hayTestigos, lugarInicioNave, MIN_TAREA_NAVE } from './logic.js';

export const NAVE_RED = {
  margen: 0.9,          // un poquito más de distancia que en el juego (por lo que tarda internet)
  velBot: 4.5,          // los bots caminan a 4,5 m/s
  minTarea: MIN_TAREA_NAVE,   // lo mínimo que tarda cada tarea (segundos)
  hablanBots: 5,        // cuántos bots hablan en cada reunión
  chatAntesDeVotar: 30, // si nadie aprieta "Votar", a los 30 s empieza la votación
  resultado: 6,         // cuánto se ve el resultado de la votación (segundos)
  maxHumanos: 15,
};
// 👥 Con más jugadores de verdad, las tareas se hacen más veces (regla de Mathias): 6 o más → cada tarea 2 veces
export const vecesTareas = humanos => (humanos >= 6 ? 2 : 1);
const mezclar = (l, azar) => { const a = l.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const env = (a, m) => ({ a, m });
const r2 = v => Math.round(v * 100) / 100;

// ----- Empezar -----
// humanos: [{ id: 'h3', nombre }] · la nave se llena hasta 15 con bots
export function nuevaRondaNave(humanos, ahora, azar = Math.random) {
  const nBots = Math.max(0, NAVE.jugadores - humanos.length), defs = nBots ? rosterBots(nBots, 'nave') : [];
  const gente = [
    ...humanos.map((h, i) => ({ id: h.id, nombre: h.nombre, humano: true, vivo: true, ...lugarInicioNave(i, humanos.length) })),
    ...defs.map((d, k) => { const s = SALAS_NAVE[(k + 1) % SALAS_NAVE.length], p = puntoLibreNave(s.id, azar); return { id: 'b' + k, nombre: d.nombre, def: d.id, humano: false, vivo: true, x: p.x, z: p.z, rot: 0, ia: { camino: [], hacer: null, trabajo: 0 } }; }),
  ];
  const imps = mezclar(gente.map(p => p.id), azar).slice(0, impostoresPara(gente.length));
  const veces = vecesTareas(humanos.length), rep = {}, base = {};
  for (const p of gente) {
    const ids = imps.includes(p.id) ? [] : p.humano ? TAREAS_NAVE.map(t => t.id) : mezclar(TAREAS_NAVE.map(t => t.id), azar).slice(0, 3);
    const v = p.humano ? veces : 1;
    rep[p.id] = Object.fromEntries(ids.map(id => [id, v])); base[p.id] = { ...rep[p.id] };
  }
  const R = { inicio: ahora, t: 0, gente, imps, veces, rep, base, cuerpos: [], fase: 'jugar', reunion: null, apagon: { hasta: -1, fin: -Infinity },
    ultimaReunion: 0, ultimoSabotaje: -99, botonUsos: {}, caja: {}, abiertas: {}, ultAtaque: {}, chatUlt: {}, proxApagonBot: 25 + azar() * 20, azar, gana: null };
  for (const p of gente) if (p.ia) planBot(R, p);
  return R;
}
export const persona = (R, id) => R.gente.find(p => p.id === id) || null;
export const esImpostor = (R, id) => R.imps.includes(id);
export const esFantasma = (R, id) => { const p = persona(R, id); return !!p && !p.vivo && !p.salio; };
export function progresoRed(R) { let hechas = 0, total = 0; for (const p in R.base) for (const t in R.base[p]) { total += R.base[p][t]; hechas += R.base[p][t] - R.rep[p][t]; } return { hechas, total }; }
const progreso = R => env('todos', { tipo: 'nvProgreso', ...progresoRed(R) });

// Lo que recibe cada jugador al empezar: SU rol (y sus compañeros, si es impostor), quiénes juegan y sus tareas
export function mensajesInicio(R) {
  const gente = R.gente.map(p => ({ id: p.id, nombre: p.nombre, humano: p.humano, def: p.def || null, x: r2(p.x), z: r2(p.z) }));
  return R.gente.filter(p => p.humano).map(p => env(p.id, { tipo: 'nvRonda', yo: p.id, rol: esImpostor(R, p.id) ? 'impostor' : 'tripulante',
    socios: esImpostor(R, p.id) ? R.imps.filter(i => i !== p.id) : [], cuantosImps: R.imps.length, gente, tareas: R.rep[p.id], veces: R.veces, ...progresoRed(R) }));
}

// ----- Los bots -----
function caminoA(R, p, destino) { p.ia.camino = rutaNaveLibre({ x: p.x, z: p.z }, destino); }
function planBot(R, p) {
  const ia = p.ia, azar = R.azar(); ia.trabajo = 0; ia.hacer = null;
  if (esImpostor(R, p.id) && p.vivo) {
    if (azar < 0.3) { const e = ESCOTILLAS_NAVE[Math.floor(R.azar() * ESCOTILLAS_NAVE.length)]; ia.hacer = { tipo: 'escotilla', id: e.id }; caminoA(R, p, e); return; }
    const t = TAREAS_NAVE[Math.floor(R.azar() * TAREAS_NAVE.length)];
    ia.hacer = { tipo: azar < 0.55 && R.t - R.ultimoSabotaje > ACCION_NAVE.esperaSabotaje * 2 ? 'sabotear' : 'fingir', id: t.id }; caminoA(R, p, t); return;
  }
  const pend = Object.keys(R.rep[p.id] || {}).filter(id => R.rep[p.id][id] > 0);
  if (pend.length) { const t = tareaNave(pend[Math.floor(R.azar() * pend.length)]); ia.hacer = { tipo: 'tarea', id: t.id }; caminoA(R, p, t); return; }
  ia.hacer = { tipo: 'pasear' }; caminoA(R, p, puntoLibreNave(SALAS_NAVE[Math.floor(R.azar() * SALAS_NAVE.length)].id, R.azar));
}
function caminarBot(p, meta, vel, dt) {
  const dx = meta.x - p.x, dz = meta.z - p.z, d = Math.hypot(dx, dz), paso = Math.min(d, vel * dt);
  if (d > 1e-6) { p.x += dx / d * paso; p.z += dz / d * paso; p.rot = Math.atan2(dx, dz); }
  return d - paso;
}
function moverBot(R, p, dt, out) {
  const ia = p.ia;
  if (ia.trabajo > 0) {
    ia.trabajo -= dt;
    if (ia.trabajo <= 0) {
      if (ia.hacer.tipo === 'tarea' && R.rep[p.id][ia.hacer.id] > 0) { R.rep[p.id][ia.hacer.id]--; out.push(progreso(R)); }
      else if (ia.hacer.tipo === 'sabotear') out.push(...sabotear(R, ia.hacer.id));
      planBot(R, p);
    }
    return;
  }
  const meta = ia.camino[0];
  if (!meta) {
    const h = ia.hacer;
    if (h.tipo === 'tarea') ia.trabajo = 5 + R.azar() * 4;
    else if (h.tipo === 'fingir' || h.tipo === 'sabotear') ia.trabajo = 3 + R.azar() * 2;
    else { if (h.tipo === 'escotilla') { const s = siguienteEscotilla(h.id); p.x = s.x; p.z = s.z; } planBot(R, p); }
    return;
  }
  if (caminarBot(p, meta, NAVE_RED.velBot, dt) < 0.05) ia.camino.shift();
}
// El bot impostor: si alguien está solo (sin testigos) y ya puede, lo persigue y lo ataca
function cazar(R, p, dt, pos, ahora) {
  if (!p.vivo || R.t < ACCION_NAVE.primerAtaque || R.t - (R.ultAtaque[p.id] ?? 0) < ACCION_NAVE.esperaAtaqueBot) return null;
  const trip = R.gente.filter(q => q.vivo && !esImpostor(R, q.id)), donde = q => (q.humano ? pos[q.id] : q);
  let mejor = null, dm = 12;
  for (const v of trip) {
    const P = donde(v); if (!P) continue;
    const d = dist(P, p);
    if (d < dm && !hayTestigos(p, P, trip.filter(q => q !== v).map(donde).filter(Boolean))) { dm = d; mejor = v; }
  }
  if (!mejor) return null;
  if (dm <= ACCION_NAVE.ataque) { const m = atacar(R, p, mejor, donde(mejor), ahora); planBot(R, p); return m; }
  p.ia.trabajo = 0; caminarBot(p, donde(mejor), 5, dt); return [];
}

// ----- Lo que pasa -----
function atacar(R, atacante, victima, P, ahora) {
  victima.vivo = false; R.ultAtaque[atacante.id] = R.t;
  if (!victima.humano) { victima.x = P.x; victima.z = P.z; victima.ia.trabajo = 0; planBot(R, victima); }   // (el fantasma de un bot sigue con sus tareas)
  const cu = { id: victima.id, nombre: victima.nombre, x: r2(P.x), z: r2(P.z), sala: nombreSala(P), desde: ahora };
  R.cuerpos.push(cu);
  const out = [env('todos', { tipo: 'nvCuerpo', id: victima.id, x: cu.x, z: cu.z }), env('imps', { tipo: 'nvFantasma', id: victima.id })];
  if (victima.humano) out.push(env(victima.id, { tipo: 'nvTeAtacaron', por: atacante.nombre }));
  return out.concat(revisarFin(R));
}
const nombreSala = P => { const i = salaNaveEn(P.x, P.z); return i >= 0 ? SALAS_NAVE[i].nombre : 'el pasillo'; };
function sabotear(R, id) {
  R.ultimoSabotaje = R.t;
  const out = [env('todos', { tipo: 'nvSabotaje', tarea: id })];
  for (const p of R.gente) {
    if (!(id in (R.rep[p.id] || {})) || R.rep[p.id][id] === R.base[p.id][id]) continue;
    R.rep[p.id][id] = R.base[p.id][id];
    if (p.humano) { out.push(env(p.id, { tipo: 'nvTareas', tareas: R.rep[p.id] })); if (id === 'caja') { R.caja[p.id] = 'reactor'; out.push(env(p.id, { tipo: 'nvCaja', estado: 'reactor' })); } }
  }
  out.push(progreso(R));
  return out;
}
function apagar(R) {
  if (!puedeApagar(R.t, R.apagon.fin)) return [];
  R.apagon = { hasta: R.t + APAGON.dura, fin: R.t + APAGON.dura };
  return [env('todos', { tipo: 'nvLuces', ms: APAGON.dura * 1000 })];
}
export function revisarFin(R) {
  if (R.gana) return [];
  const { hechas, total } = progresoRed(R);
  const gana = resultadoNave({ hechas, total, tripulantesVivos: R.gente.filter(p => p.vivo && !esImpostor(R, p.id)).length, impostoresVivos: R.gente.filter(p => p.vivo && esImpostor(R, p.id)).length });
  if (!gana) return [];
  R.gana = gana; R.fase = 'fin';
  return [env('todos', { tipo: 'nvFin', gana, imps: R.imps.map(id => ({ id, nombre: persona(R, id).nombre })) })];
}
// 🗣️ Reunión: todos (los vivos) a la mesa del comedor; los cuerpos se los llevan
function abrirReunion(R, quien, cuerpo, ahora) {
  const vivos = R.gente.filter(p => p.vivo), L = puestosReunion(vivos.length), puestos = {}, teleports = [];
  vivos.forEach((p, i) => { puestos[p.id] = [r2(L[i].x), r2(L[i].z)]; if (p.humano) teleports.push({ id: p.id, x: L[i].x, z: L[i].z }); else { p.x = L[i].x; p.z = L[i].z; p.ia.camino = []; p.ia.trabajo = 0; } });
  R.cuerpos = []; R.abiertas = {}; R.fase = 'reunion'; R.apagon.hasta = -1;
  const hablar = [], bots = mezclar(vivos.filter(p => !p.humano), R.azar).slice(0, NAVE_RED.hablanBots);
  for (const p of bots) {
    const imp = esImpostor(R, p.id), otros = vivos.filter(q => q !== p && !(imp && esImpostor(R, q.id))), impVivos = vivos.filter(q => q !== p && esImpostor(R, q.id));
    const sosp = !imp && impVivos.length && R.azar() < 0.15 ? impVivos[Math.floor(R.azar() * impVivos.length)] : otros[Math.floor(R.azar() * otros.length)];
    p.ia.sospecha = sosp ? sosp.id : null;
    const frases = R.azar() < 0.6 ? ['Yo vi a {x} cerca de {s}… sospechoso 🤔', '¡Fue {x}! Lo vi salir de {s}', '{x} estaba solo en {s}, raro…', 'No sé… yo voto por {x}'] : ['¡Yo no fui! Estaba haciendo mis tareas 🔧', 'pero si yo no soy 😭', 'Yo iba con {x}, {x} no es', 'Estuve todo el rato en {s}'];
    const texto = frases[Math.floor(R.azar() * frases.length)].replaceAll('{x}', sosp ? sosp.nombre : 'alguien').replaceAll('{s}', SALAS_NAVE[Math.floor(R.azar() * SALAS_NAVE.length)].nombre);
    hablar.push({ en: ahora + (1 + R.azar() * 6) * 1000, de: p.nombre, texto });
  }
  for (const p of vivos.filter(q => !q.humano && !q.ia.sospecha)) { const otros = vivos.filter(q => q !== p && !(esImpostor(R, p.id) && esImpostor(R, q.id))); p.ia.sospecha = otros.length ? otros[Math.floor(R.azar() * otros.length)].id : null; }
  R.reunion = { quien: quien.nombre, fase: 'chat', inicio: ahora, votos: {}, votoBot: {}, hablar };
  return { msgs: [env('todos', { tipo: 'nvReunion', quien: quien.nombre, quienId: quien.id, cuerpo: cuerpo ? { nombre: cuerpo.nombre, sala: cuerpo.sala } : null, vivos: vivos.map(p => p.id), puestos })], teleports };
}
function empezarVoto(R, quien, ahora) {
  const M = R.reunion; if (!M || M.fase !== 'chat') return [];
  M.fase = 'votar'; M.finVoto = ahora + VOTACION.segundos * 1000;
  for (const p of R.gente) if (!p.humano && p.vivo) M.votoBot[p.id] = ahora + (3 + R.azar() * 12) * 1000;
  return [env('todos', { tipo: 'nvVotar', quien, ms: VOTACION.segundos * 1000 })];
}
function votar(R, quien, aQuien) {
  const M = R.reunion, p = persona(R, quien), v = persona(R, aQuien);
  if (!M || M.fase !== 'votar' || !p || !p.vivo || quien in M.votos || !v || !v.vivo) return [];
  M.votos[quien] = aQuien;
  return [env('todos', { tipo: 'nvVoto', id: quien })];
}
function cerrarVotacion(R, ahora) {
  const M = R.reunion, r = contarVotos(M.votos), exp = r.expulsado && persona(R, r.expulsado);
  const texto = r.empate ? '🤝 ¡Empate! Nadie fue expulsado.' : !exp ? 'Nadie votó: nadie fue expulsado.' : mensajeExpulsion(exp.nombre, esImpostor(R, exp.id));
  if (exp) { exp.vivo = false; exp.expulsado = true; }
  M.fase = 'resultado'; M.finResultado = ahora + NAVE_RED.resultado * 1000;
  return [env('todos', { tipo: 'nvResultado', cuenta: r.cuenta, expulsado: exp ? exp.id : null, texto }), ...(exp && !exp.humano ? [env('imps', { tipo: 'nvFantasma', id: exp.id })] : []), ...revisarFin(R)];
}

// ----- Cada décima de segundo (lo llama el servidor). pos: las posiciones de los jugadores (las que aceptó el servidor) -----
export function tickNave(R, dt, ahora, pos) {
  if (R.fase === 'fin') return { msgs: [], teleports: [] };
  const out = []; let teleports = [];
  if (R.fase === 'jugar') {
    R.t += dt;
    for (const p of R.gente) {
      if (p.humano) continue;
      if (esImpostor(R, p.id) && p.vivo) {
        const m = cazar(R, p, dt, pos, ahora);
        if (m) { out.push(...m); if (R.fase !== 'jugar') break; continue; }
        if (R.t >= R.proxApagonBot) { const l = apagar(R); if (l.length) { out.push(...l); R.proxApagonBot = R.t + APAGON.espera + 10 + R.azar() * 30; } }
      }
      moverBot(R, p, dt, out);
      if (p.vivo && !esImpostor(R, p.id)) {   // un tripulante vivo que ve un cuerpo, lo reporta
        const cu = R.cuerpos.find(k => ahora - k.desde > 500 && dist(k, p) < 3.2);
        if (cu) { const a = abrirReunion(R, p, cu, ahora); out.push(...a.msgs); teleports = a.teleports; break; }
      }
    }
    if (R.fase === 'jugar') out.push(...revisarFin(R));
  } else if (R.fase === 'reunion') {
    const M = R.reunion;
    for (const h of M.hablar) if (!h.dicho && ahora >= h.en) { h.dicho = true; out.push(env('todos', { tipo: 'nvChat', de: h.de, texto: h.texto, fantasma: false })); }
    if (M.fase === 'chat' && ahora - M.inicio > NAVE_RED.chatAntesDeVotar * 1000) { const b = R.gente.find(p => !p.humano && p.vivo); out.push(...empezarVoto(R, b ? b.nombre : 'Alguien', ahora)); }
    if (M.fase === 'votar') {
      for (const p of R.gente) if (!p.humano && p.vivo && !(p.id in M.votos) && ahora >= M.votoBot[p.id]) {
        const imp = esImpostor(R, p.id), l = R.gente.filter(q => q.vivo && q !== p && !(imp && esImpostor(R, q.id)));
        const sosp = persona(R, p.ia.sospecha);
        out.push(...votar(R, p.id, sosp && sosp.vivo && !(imp && esImpostor(R, sosp.id)) ? sosp.id : l.length ? l[Math.floor(R.azar() * l.length)].id : null));
      }
      if (ahora >= M.finVoto || R.gente.filter(p => p.vivo).every(p => p.id in M.votos)) out.push(...cerrarVotacion(R, ahora));
    } else if (M.fase === 'resultado' && ahora >= M.finResultado && R.fase === 'reunion') {
      R.fase = 'jugar'; R.reunion = null; R.ultimaReunion = R.t;
      for (const id of R.imps) R.ultAtaque[id] = Math.max(R.ultAtaque[id] ?? 0, R.t - ACCION_NAVE.esperaAtaque + 10);
      for (const p of R.gente) if (p.ia) planBot(R, p);
      out.push(env('todos', { tipo: 'nvSigue' }));
    }
  }
  // dónde están los bots (los fantasmas, solo para los impostores)
  const l = R.gente.filter(p => !p.humano).map(p => [p.id, r2(p.x), r2(p.z), r2(p.rot || 0), p.ia.trabajo > 0 ? 1 : 0, p.vivo ? 1 : 0]);
  out.push(env('imps', { tipo: 'nvBots', l }), env('noImps', { tipo: 'nvBots', l: l.filter(b => b[5]) }));
  return { msgs: out, teleports };
}

// ----- Lo que manda un jugador (el servidor revisa TODO). pos: posiciones aceptadas por el servidor -----
// Devuelve { msgs, teleports } (teleports: a quién mover: reunión o escotilla)
export function accionNave(R, id, m, ahora, pos) {
  const p = persona(R, id), P = pos[id], nada = { msgs: [], teleports: [] }, M = NAVE_RED.margen;
  if (!p || p.salio || R.fase === 'fin' || !m || typeof m.que !== 'string') return nada;
  const imp = esImpostor(R, id), ok = msgs => ({ msgs, teleports: [] });
  const que = m.que;
  // 🗣️ la reunión: chat y votos
  if (que === 'chat') {
    if (R.fase !== 'reunion' || !R.reunion || R.reunion.fase === 'resultado') return nada;
    const texto = limpiarChat(m.texto); if (!texto) return nada;
    if (!puedeEscribir(R.chatUlt[id] ?? -Infinity, ahora)) return ok([env(id, { tipo: 'nvAviso', texto: '⏳ Espera 2 segundos entre mensajes' })]);
    R.chatUlt[id] = ahora;
    return ok([env(p.vivo ? 'todos' : 'fantasmasEimps', { tipo: 'nvChat', de: p.nombre, texto, fantasma: !p.vivo })]);
  }
  if (que === 'empezarVoto') return R.fase === 'reunion' && p.vivo ? ok(empezarVoto(R, p.nombre, ahora)) : nada;
  if (que === 'voto') return R.fase === 'reunion' ? ok(votar(R, id, String(m.a))) : nada;
  if (R.fase !== 'jugar' || !P) return nada;
  const cerca = (q, d) => dist(P, q) <= d + M;
  if (que === 'abrir') {   // abrió el panel de una tarea (desde ahí cuenta el tiempo mínimo)
    const t = tareaNave(m.tarea); if (!t || !cerca(t, ACCION_NAVE.tarea)) return nada;
    R.abiertas[id] = { tarea: t.id, desde: R.t }; return nada;
  }
  if (que === 'tarea') {
    const t = tareaNave(m.tarea), a = R.abiertas[id];
    if (!t || t.id === 'caja' || imp || !(R.rep[id] && R.rep[id][t.id] > 0) || !a || a.tarea !== t.id || !cerca(t, ACCION_NAVE.tarea) || R.t - a.desde < (NAVE_RED.minTarea[t.id] || 3)) return nada;
    R.rep[id][t.id]--; delete R.abiertas[id];
    return ok([env(id, { tipo: 'nvTareas', tareas: R.rep[id] }), progreso(R), ...revisarFin(R)]);
  }
  if (que === 'caja') {
    const T = tareaNave('caja'), estado = R.caja[id] || 'reactor';
    if (imp || !(R.rep[id] && R.rep[id].caja > 0)) return nada;
    if (estado === 'reactor' && cerca(T.recoger, ACCION_NAVE.tarea)) { R.caja[id] = 'lleva'; return ok([env(id, { tipo: 'nvCaja', estado: 'lleva' })]); }
    if (estado === 'lleva' && cerca(T, ACCION_NAVE.tarea)) {
      R.rep[id].caja--; R.caja[id] = R.rep[id].caja > 0 ? 'reactor' : 'dejada';
      return ok([env(id, { tipo: 'nvCaja', estado: R.caja[id] }), env(id, { tipo: 'nvTareas', tareas: R.rep[id] }), progreso(R), ...revisarFin(R)]);
    }
    return nada;
  }
  if (que === 'reportar') {
    if (!p.vivo) return nada;
    const cu = R.cuerpos.find(k => cerca(k, ACCION_NAVE.reporte)); if (!cu) return nada;
    return abrirReunion(R, p, cu, ahora);
  }
  if (que === 'boton') {
    if (!p.vivo || !cerca(BOTON_REUNION, BOTON_REUNION.cerca) || !puedeBotonReunion(R.botonUsos[id] || 0, R.t - R.ultimaReunion)) return nada;
    R.botonUsos[id] = (R.botonUsos[id] || 0) + 1;
    return abrirReunion(R, p, null, ahora);
  }
  // lo de los impostores
  if (!imp || !p.vivo) return nada;
  if (que === 'atacar') {
    const v = persona(R, String(m.a)); if (!v || !v.vivo || esImpostor(R, v.id)) return nada;
    const V = v.humano ? pos[v.id] : v; if (!V || !cerca(V, ACCION_NAVE.ataque)) return nada;
    if (R.t < ACCION_NAVE.primerAtaque || R.t - (R.ultAtaque[id] ?? 0) < ACCION_NAVE.esperaAtaque) return nada;
    return ok(atacar(R, p, v, V, ahora));
  }
  if (que === 'escotilla') {
    const e = ESCOTILLAS_NAVE.find(x => x.id === m.id); if (!e || !cerca(e, ACCION_NAVE.escotilla)) return nada;
    const s = siguienteEscotilla(e.id);
    return { msgs: [env(id, { tipo: 'nvMover', x: s.x, z: s.z })], teleports: [{ id, x: s.x, z: s.z }] };
  }
  if (que === 'sabotear') {
    const t = tareaNave(m.tarea); if (!t || !cerca(t, ACCION_NAVE.tarea) || R.t - R.ultimoSabotaje < ACCION_NAVE.esperaSabotaje) return nada;
    return ok(sabotear(R, t.id));
  }
  if (que === 'luces') return ok(apagar(R));
  return nada;
}
// Alguien se fue de la ronda (se levantó o se desconectó): cuenta como que ya no juega (si era impostor, sale de la ronda)
export function salirNave(R, id) {
  const p = persona(R, id); if (!p || p.salio) return [];
  p.vivo = false; p.salio = true;
  if (R.reunion && R.reunion.votos) delete R.reunion.votos[id];
  return [env('todos', { tipo: 'nvSalio', id, nombre: p.nombre }), ...revisarFin(R)];
}
// ¿A quién le llega un mensaje? (destino: 'todos' | 'imps' | 'noImps' | 'fantasmasEimps' | id) → ids de jugadores de verdad
export function destinatarios(R, a) {
  const hum = R.gente.filter(p => p.humano && !p.salio);
  if (a === 'todos') return hum.map(p => p.id);
  if (a === 'imps') return hum.filter(p => esImpostor(R, p.id)).map(p => p.id);
  if (a === 'noImps') return hum.filter(p => !esImpostor(R, p.id)).map(p => p.id);
  if (a === 'fantasmasEimps') return hum.filter(p => esImpostor(R, p.id) || !p.vivo).map(p => p.id);
  return hum.some(p => p.id === a) ? [a] : [];
}
// ¿Quién ve a este jugador? (un fantasma: solo los impostores, regla de Mathias)
export const quienesVen = (R, id) => (esFantasma(R, id) ? destinatarios(R, 'imps').filter(x => x !== id) : null);   // null: todos
