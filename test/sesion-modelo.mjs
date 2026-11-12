/* Sesión operativa: transiciones, versiones del plan, límite y cierres.
   Modelo puro, sin navegador. Cubre T08 (plan original conservado), T09 (el
   límite no se borra cambiando la regla) y T24 (cierre y reapertura) a nivel
   de modelo; el recorrido en la app real está en test/sesion-flujo.mjs. */
import assert from 'node:assert/strict';
import '../session-state.js';

const S = globalThis.CabinaSession;
let n = 0;
function check(label, fn) {
  try { fn(); n++; console.log('  ✅ ' + label); }
  catch (e) { console.error('  ❌ ' + label + ': ' + e.message); process.exitCode = 1; }
}
const T0 = 1794500000000;
const PLAN = { cuenta: 'a1', ventana: { start: 510, end: 660, days: [1, 2, 3, 4, 5], tz: 'America/New_York' },
  limites: { maxLoss: 300, maxContracts: 2, maxLosses: 3 }, instrumentos: ['MNQ'],
  setups: [{ id: 'pb1', nombre: 'ORB' }], checklist: { ses: 'nyam', done: 6, total: 6, at: T0 - 1000, guardada: true },
  reglasCuenta: { cuenta: 'a1', rulesetId: 'v1', origen: 'anclada' }, faltantes: [] };
const dia = extra => Object.assign({ date: '2026-11-12', closed: false }, extra);
const paso = (s, accion, datos, t) => { const r = S.aplicar(s, accion, datos, t); assert.equal(r.ok, true, accion + ' → ' + r.error); return r.sesion; };
const activa = () => paso(S.leer(dia()), 'iniciar', { plan: PLAN }, T0);

check('un día sin `sesion` es heredado y está en preparación', () => {
  const s = S.leer(dia()); assert.equal(s.estado, 'preparacion'); assert.equal(s.heredada, true);
});
check('un día viejo cerrado se lee cerrado, con el cierre marcado como de cliente anterior', () => {
  const s = S.leer(dia({ closed: true, updatedAt: T0 }));
  assert.equal(s.estado, 'cerrada'); assert.equal(s.cierres.length, 1); assert.equal(s.cierres[0].origen, 'cliente_anterior');
  assert.equal(s.desfase, '');
});
check('leer no muta el día ni inventa plan', () => {
  const d = dia({ closed: true }); const antes = JSON.stringify(d); S.leer(d);
  assert.equal(JSON.stringify(d), antes); assert.equal(S.planVigente(S.leer(d)), null);
});
check('basura en `sesion` no rompe: cae a preparación', () => {
  for (const x of [null, 'x', 7, [], { estado: 'volando' }, { estado: 'activa' }, { estado: 'limite', planes: 'no' }])
    assert.equal(S.leer(dia({ sesion: x })).estado, 'preparacion');
});

check('tabla de transiciones: sólo las declaradas', () => {
  const permitido = { preparacion: ['iniciar', 'cerrar'], activa: ['pausar', 'limite', 'cerrar'], pausa: ['reanudar', 'limite', 'cerrar'],
    limite: ['levantar', 'cerrar'], cerrada: ['reabrir'] };
  for (const e of S.ESTADOS) for (const a of Object.keys(S.TRANSICIONES))
    assert.equal(S.puede({ estado: e }, a), permitido[e].includes(a), e + ' · ' + a);
});
check('una transición no permitida no cambia nada y dice por qué', () => {
  const s = S.leer(dia()); const r = S.aplicar(s, 'pausar', { motivo: 'x', condicion: 'y' }, T0);
  assert.equal(r.ok, false); assert.equal(r.error, 'transicion_no_permitida'); assert.equal(r.sesion.estado, 'preparacion'); assert.equal(r.sesion.eventos.length, 0);
});
check('aplicar no muta la sesión de entrada', () => {
  const s = S.leer(dia()); const antes = JSON.stringify(s); S.aplicar(s, 'iniciar', { plan: PLAN }, T0);
  assert.equal(JSON.stringify(s), antes);
});

check('iniciar exige plan con ventana y guarda la versión 1 con zona horaria', () => {
  assert.equal(S.aplicar(S.leer(dia()), 'iniciar', {}, T0).error, 'falta_plan');
  assert.equal(S.aplicar(S.leer(dia()), 'iniciar', { plan: { cuenta: 'a1' } }, T0).error, 'falta_ventana');
  const p = S.planVigente(activa());
  assert.equal(p.v, 1); assert.equal(p.tipo, 'inicio'); assert.equal(p.ventana.tz, 'America/New_York');
  assert.deepEqual(p.limites, { maxLoss: 300, maxContracts: 2, maxLosses: 3 });
  assert.equal(p.reglasCuenta.rulesetId, 'v1'); assert.equal(p.checklist.done, 6); assert.equal(p.setups[0].id, 'pb1');
});
check('un límite que nadie escribió no aparece en el plan: no se inventa', () => {
  const s = paso(S.leer(dia()), 'iniciar', { plan: Object.assign({}, PLAN, { limites: { maxLoss: '', maxGain: 0, maxContracts: null } }) }, T0);
  assert.deepEqual(S.planVigente(s).limites, {});
});
check('los datos que faltan al iniciar viajan con el plan', () => {
  const s = paso(S.leer(dia()), 'iniciar', { plan: Object.assign({}, PLAN, { faltantes: ['pérdida máxima del día'] }) }, T0);
  assert.deepEqual(S.planVigente(s).faltantes, ['pérdida máxima del día']);
});
check('doble clic con la misma mutación deja un solo evento', () => {
  const a = S.aplicar(S.leer(dia()), 'iniciar', { plan: PLAN, mutId: 'm1' }, T0);
  const b = S.aplicar(a.sesion, 'iniciar', { plan: PLAN, mutId: 'm1' }, T0 + 5);
  assert.equal(b.ok, true); assert.equal(b.repetida, true); assert.equal(b.sesion.eventos.length, 1); assert.equal(b.sesion.planes.length, 1);
});

check('pausar exige motivo y condición de reanudación, y los enseña', () => {
  const s = activa();
  assert.equal(S.aplicar(s, 'pausar', { condicion: 'x' }, T0 + 1).error, 'falta_motivo');
  assert.equal(S.aplicar(s, 'pausar', { motivo: 'x' }, T0 + 1).error, 'falta_condicion');
  const p = paso(s, 'pausar', { motivo: 'Dos pérdidas seguidas', condicion: 'Esperar 20 min y releer el plan' }, T0 + 1);
  assert.equal(p.estado, 'pausa'); assert.equal(p.pausa.condicion, 'Esperar 20 min y releer el plan');
  const r = paso(p, 'reanudar', {}, T0 + 2);
  assert.equal(r.estado, 'activa'); assert.equal(r.pausa, null);
  assert.equal(r.eventos[r.eventos.length - 1].detalle.condicion, 'Esperar 20 min y releer el plan');
});

const EVID = { regla: 'maxLoss', limite: 300, valor: 320, alcance: 'cuenta a1 · hoy', texto: 'Pérdida del día $320 contra un tope de $300', operaciones: ['t1', 't2'] };
const enLimite = () => paso(activa(), 'limite', { evidencia: EVID }, T0 + 10);
check('límite exige evidencia y guarda regla, valor, alcance y operaciones', () => {
  assert.equal(S.aplicar(activa(), 'limite', {}, T0 + 10).error, 'falta_evidencia');
  const s = enLimite();
  assert.equal(s.estado, 'limite'); assert.equal(s.limite.regla, 'maxLoss'); assert.equal(s.limite.valor, 320);
  assert.deepEqual(s.limite.operaciones, ['t1', 't2']); assert.equal(s.limite.plan, 1);
});
check('T09 · en límite sólo se puede corregir datos o cerrar: no hay «reanudar»', () => {
  const s = enLimite();
  for (const a of ['reanudar', 'pausar', 'iniciar', 'reabrir']) assert.equal(S.puede(s, a), false, a);
  assert.equal(S.puede(s, 'cerrar'), true); assert.equal(S.puede(s, 'levantar'), true);
});
check('T09 · cambiar el número de la regla NO levanta el límite', () => {
  const r = S.aplicar(enLimite(), 'levantar', { motivo: 'subí el tope', evaluacion: { alcanzado: false, limite: 500 } }, T0 + 20);
  assert.equal(r.ok, false); assert.equal(r.error, 'limite_modificado'); assert.equal(r.sesion.estado, 'limite');
});
check('T09 · quitar la regla tampoco lo levanta', () => {
  const r = S.aplicar(enLimite(), 'levantar', { motivo: 'x', evaluacion: { alcanzado: false, limite: null } }, T0 + 20);
  assert.equal(r.error, 'limite_modificado');
});
check('un tope más estricto que el del aviso no impide corregir datos', () => {
  const r = S.aplicar(enLimite(), 'levantar', { motivo: 'duplicada', evaluacion: { alcanzado: false, limite: 250 } }, T0 + 20);
  assert.equal(r.ok, true); assert.equal(r.sesion.estado, 'activa');
});
check('si los datos siguen diciendo que se alcanzó, no se levanta', () => {
  assert.equal(S.aplicar(enLimite(), 'levantar', { motivo: 'x', evaluacion: { alcanzado: true, limite: 300 } }, T0 + 20).error, 'limite_vigente');
});
check('una corrección de datos con la misma regla sí lo levanta, con motivo y rastro', () => {
  assert.equal(S.aplicar(enLimite(), 'levantar', { evaluacion: { alcanzado: false, limite: 300 } }, T0 + 20).error, 'falta_motivo');
  const s = paso(enLimite(), 'levantar', { motivo: 'La operación t2 estaba duplicada', evaluacion: { alcanzado: false, limite: 300 } }, T0 + 20);
  assert.equal(s.estado, 'activa'); assert.equal(s.limite, null);
  const e = s.eventos[s.eventos.length - 1];
  assert.equal(e.detalle.tipo, 'correccion_datos'); assert.equal(e.detalle.limiteAnterior.valor, 320);
});

check('T08 · reducir riesgo durante la sesión aplica ya y conserva la versión original', () => {
  const r = S.ajustarPlan(activa(), { campo: 'maxLoss', valor: 200, motivo: 'Día de noticias' }, T0 + 30);
  assert.equal(r.efecto, 'aplicado'); assert.equal(r.sesion.planes.length, 2);
  assert.equal(r.sesion.planes[0].limites.maxLoss, 300); assert.equal(r.sesion.planes[1].limites.maxLoss, 200);
  assert.equal(r.sesion.planes[1].tipo, 'reduccion'); assert.equal(r.sesion.planes[1].base, 1); assert.equal(r.sesion.planes[1].motivo, 'Día de noticias');
});
check('T08 · relajar durante la sesión es una propuesta: el plan vigente no cambia', () => {
  const r = S.ajustarPlan(activa(), { campo: 'maxLoss', valor: 500, motivo: 'Me siento bien' }, T0 + 30);
  assert.equal(r.efecto, 'propuesto'); assert.equal(r.sesion.planes.length, 1); assert.equal(S.planVigente(r.sesion).limites.maxLoss, 300);
  assert.equal(r.sesion.propuestas[0].estado, 'pendiente'); assert.equal(r.sesion.propuestas[0].a, 500);
});
check('quitar un tope es relajar; poner uno donde no había es reducir', () => {
  assert.equal(S.ajustarPlan(activa(), { campo: 'maxContracts', valor: '', motivo: 'x' }, T0 + 30).efecto, 'propuesto');
  assert.equal(S.ajustarPlan(activa(), { campo: 'maxGain', valor: 400, motivo: 'x' }, T0 + 30).efecto, 'aplicado');
});
check('ventana: estrecharla aplica, ampliarla se propone', () => {
  const w = (start, end, days) => ({ start, end, days, tz: 'America/New_York' });
  assert.equal(S.ajustarPlan(activa(), { campo: 'ventana', valor: w(540, 660, [1, 2, 3]), motivo: 'x' }, T0 + 30).efecto, 'aplicado');
  assert.equal(S.ajustarPlan(activa(), { campo: 'ventana', valor: w(510, 720, [1, 2, 3, 4, 5]), motivo: 'x' }, T0 + 30).efecto, 'propuesto');
  assert.equal(S.ajustarPlan(activa(), { campo: 'ventana', valor: w(510, 660, [1, 2, 3, 4, 5, 6]), motivo: 'x' }, T0 + 30).efecto, 'propuesto');
  assert.equal(S.ajustarPlan(activa(), { campo: 'ventana', valor: w(510, 660, [1, 2, 3, 4, 5]), motivo: 'x' }, T0 + 30).efecto, 'sin_cambio');
});
check('todo ajuste exige motivo; sin sesión abierta no hay ajuste', () => {
  assert.equal(S.ajustarPlan(activa(), { campo: 'maxLoss', valor: 200 }, T0 + 30).error, 'falta_motivo');
  assert.equal(S.ajustarPlan(S.leer(dia()), { campo: 'maxLoss', valor: 200, motivo: 'x' }, T0).error, 'sin_sesion_abierta');
});
check('una corrección de datos es otra cosa: queda marcada como tal, y no afloja un límite alcanzado', () => {
  const r = S.ajustarPlan(activa(), { campo: 'maxLoss', valor: 350, motivo: 'El tope real de la firma es 350', tipo: 'correccion' }, T0 + 30);
  assert.equal(r.efecto, 'aplicado'); assert.equal(S.planVigente(r.sesion).tipo, 'correccion'); assert.equal(r.sesion.planes[0].limites.maxLoss, 300);
  const l = S.ajustarPlan(enLimite(), { campo: 'maxLoss', valor: 500, motivo: 'x', tipo: 'correccion' }, T0 + 40);
  assert.equal(l.ok, false); assert.equal(l.error, 'limite_vigente');
});
check('en límite se puede REDUCIR riesgo; relajar sigue siendo propuesta', () => {
  assert.equal(S.ajustarPlan(enLimite(), { campo: 'maxContracts', valor: 1, motivo: 'x' }, T0 + 40).efecto, 'aplicado');
  assert.equal(S.ajustarPlan(enLimite(), { campo: 'maxLoss', valor: 900, motivo: 'x' }, T0 + 40).efecto, 'propuesto');
});

check('cerrar sin iniciar con decisión de no operar queda registrado', () => {
  const s = paso(S.leer(dia()), 'cerrar', { decision: 'no_operar', resumen: { n: 0 } }, T0);
  assert.equal(s.estado, 'cerrada'); assert.equal(s.cierres[0].decision, 'no_operar'); assert.equal(s.cierres[0].desde, 'preparacion');
});
check('T24 · reabrir exige motivo y conserva el cierre anterior', () => {
  let s = paso(activa(), 'cerrar', { resumen: { n: 2, pnl: -80 }, nota: 'ok' }, T0 + 50);
  assert.equal(S.aplicar(s, 'reabrir', {}, T0 + 60).error, 'falta_motivo');
  s = paso(s, 'reabrir', { motivo: 'Faltaba registrar una operación' }, T0 + 60);
  assert.equal(s.estado, 'activa'); assert.equal(s.cierres.length, 1); assert.equal(s.cierres[0].resumen.pnl, -80);
  s = paso(s, 'cerrar', { resumen: { n: 3, pnl: -120 } }, T0 + 70);
  assert.equal(s.cierres.length, 2); assert.equal(s.cierres[0].resumen.n, 2); assert.equal(s.cierres[1].resumen.n, 3);
  assert.deepEqual(s.eventos.map(e => e.accion), ['iniciar', 'cerrar', 'reabrir', 'cerrar']);
});
check('T24 · cerrar con el límite alcanzado y reabrir vuelve a LÍMITE, no a activa', () => {
  let s = paso(enLimite(), 'cerrar', {}, T0 + 50);
  s = paso(s, 'reabrir', { motivo: 'corregir nota' }, T0 + 60);
  assert.equal(s.estado, 'limite'); assert.equal(s.limite.valor, 320);
});
check('reabrir un día cerrado sin iniciar vuelve a preparación', () => {
  let s = paso(S.leer(dia()), 'cerrar', { decision: 'no_operar' }, T0);
  s = paso(s, 'reabrir', { motivo: 'al final sí preparo' }, T0 + 1);
  assert.equal(s.estado, 'preparacion'); assert.equal(s.cierres.length, 1);
});

check('lo guardado se vuelve a leer igual (ida y vuelta)', () => {
  let s = paso(enLimite(), 'cerrar', { resumen: { n: 2 } }, T0 + 50);
  const guardado = JSON.parse(JSON.stringify(S.paraGuardar(s)));
  const otra = S.leer(dia({ closed: true, sesion: guardado }));
  assert.equal(otra.estado, 'cerrada'); assert.equal(otra.heredada, false); assert.equal(otra.desfase, '');
  assert.deepEqual(S.paraGuardar(otra), guardado);
});
check('cliente anterior cierra un día con sesión activa: se respeta y se dice', () => {
  const s = S.leer(dia({ closed: true, sesion: S.paraGuardar(activa()) }));
  assert.equal(s.estado, 'cerrada'); assert.equal(s.desfase, 'cerrada_por_cliente_anterior');
  assert.equal(s.cierres[s.cierres.length - 1].origen, 'cliente_anterior');
});
check('cliente anterior reabre sin motivo: se lee abierta, marcada, con el cierre conservado', () => {
  const cerrada = paso(activa(), 'cerrar', {}, T0 + 50);
  const s = S.leer(dia({ closed: false, sesion: S.paraGuardar(cerrada) }));
  assert.equal(s.estado, 'activa'); assert.equal(s.desfase, 'reabierta_sin_motivo'); assert.equal(s.cierres.length, 1);
});
check('el historial de eventos está acotado', () => {
  let s = activa();
  for (let i = 0; i < 150; i++) { s = paso(s, 'pausar', { motivo: 'm', condicion: 'c' }, T0 + 100 + i * 2); s = paso(s, 'reanudar', {}, T0 + 101 + i * 2); }
  assert.equal(s.eventos.length, 200); assert.equal(s.planes.length, 1);
});
check('sin reloj no hay transición', () => {
  assert.equal(S.aplicar(S.leer(dia()), 'iniciar', { plan: PLAN }, NaN).error, 'sin_reloj');
});

console.log(`\nsesion-modelo: ${n} afirmaciones`);
