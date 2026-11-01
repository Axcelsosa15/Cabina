/* Pausas: sólo tiempo enfocado observado, con fecha ET suministrada por la UI. */
import assert from 'node:assert/strict';
import '../session-break.js';

const C = globalThis.CabinaBreakClock;
const DATE = '2026-11-01';
let assertions = 0;
function check(label, fn) {
  try { fn(); assertions++; console.log('  ✅ ' + label); }
  catch (e) { console.error('  ❌ ' + label + ': ' + e.message); process.exitCode = 1; }
}
const initial = raw => C.create({ enabled: true, date: DATE, ...raw });
const tick = (s, now, active = true, date = DATE) => C.step(s, { now, active, date });
const ms = minutes => minutes * 60000;

check('sin preferencia explícita el recordatorio está desactivado', () => {
  const s = C.create(); assert.equal(s.enabled, false); assert.equal(s.shouldRemind, false);
});
check('opt-out no conserva tiempo ni ancla ni estado de actividad', () => {
  const s = C.create({ enabled: false, date: DATE, elapsedMs: ms(120), active: true, lastNow: 1000, dismissed: true });
  assert.equal(s.elapsedMs, 0); assert.equal(s.lastNow, null); assert.equal(s.active, false); assert.equal(s.dismissed, false);
  assert.equal(tick(s, 2000).elapsedMs, 0);
});
check('activar empieza a medir desde la activación, sin tiempo retrospectivo', () => {
  const off = tick(C.create({ date: DATE }), 1000);
  const on = C.setEnabled(off, true, { now: 5000, active: true, date: DATE });
  assert.equal(on.elapsedMs, 0); assert.equal(tick(on, 15000).elapsedMs, 10000);
});
check('primer tick sólo establece la referencia temporal', () => {
  const s = tick(initial(), 1000000); assert.equal(s.elapsedMs, 0); assert.equal(s.active, true);
});
check('se acumula un tramo continuo enfocado observado', () => {
  const s = tick(tick(tick(initial(), 1000), 21000), 41000);
  assert.equal(s.elapsedMs, 40000);
});
check('blur suma el tramo activo anterior antes de pausar', () => {
  const s = tick(tick(initial(), 1000), 16000, false);
  assert.equal(s.elapsedMs, 15000); assert.equal(s.active, false);
});
check('tiempo en segundo plano y recuperación de foco no suman', () => {
  let s = tick(tick(initial(), 1000), 16000, false);
  s = tick(s, 46000, false); s = tick(s, 50000, true);
  assert.equal(s.elapsedMs, 15000); assert.equal(tick(s, 60000).elapsedMs, 25000);
});
check('active ambiguo no habilita seguimiento', () => {
  const s = C.step(initial(), { now: 1000, active: 'true', date: DATE });
  assert.equal(s.active, false); assert.equal(tick(s, 31000).elapsedMs, 0);
});
check('se descarta entero un salto superior a un minuto, sin capearlo a tiempo ficticio', () => {
  let s = tick(tick(initial(), 1000), 61001);
  assert.equal(s.elapsedMs, 0); s = tick(s, 71001); assert.equal(s.elapsedMs, 10000);
});
check('un intervalo de exactamente un minuto es válido', () => {
  assert.equal(tick(tick(initial(), 1000), 61000).elapsedMs, 60000);
});
check('salto de sueño de varias horas no cuenta como uso', () => {
  const s = tick(tick(initial(), 1000), ms(180)); assert.equal(s.elapsedMs, 0);
});
check('un reloj hacia atrás no resta tiempo ni añade tiempo negativo', () => {
  const s = tick(tick(initial({ elapsedMs: 12000 }), 50000), 40000);
  assert.equal(s.elapsedMs, 12000);
});
check('corregir un retroceso corto de reloj no suma tiempo fantasma', () => {
  let s = tick(initial({ elapsedMs: 12000 }), 50000);
  s = tick(s, 20000); s = tick(s, 51000);
  assert.equal(s.elapsedMs, 12000); assert.equal(tick(s, 52000).elapsedMs, 13000);
});
check('now inválido pausa sin contaminar el agregado', () => {
  for (const now of [NaN, Infinity, -1, '123', null, undefined]) {
    const s = tick(tick(initial({ elapsedMs: 5000 }), 1000), now);
    assert.equal(s.elapsedMs, 5000); assert.equal(s.lastNow, null); assert.equal(s.active, false);
  }
});
check('restaurar nunca cuenta el intervalo con el navegador cerrado', () => {
  const saved = tick(tick(initial(), 1000), 21000);
  const restored = C.create(saved);
  assert.equal(restored.elapsedMs, 20000); assert.equal(restored.lastNow, null); assert.equal(restored.active, false);
  assert.equal(tick(restored, 51000).elapsedMs, 20000);
});
check('cruzar medianoche reinicia la fecha sin arrastre de segundos', () => {
  const s = tick(tick(initial({ elapsedMs: ms(59), dismissed: true }), 1000), 2000, true, '2026-11-02');
  assert.equal(s.date, '2026-11-02'); assert.equal(s.elapsedMs, 0); assert.equal(s.dismissed, false); assert.equal(s.shouldRemind, false);
});
check('si el reloj cambia la fecha no se combinan agregados de fechas distintas', () => {
  const s = tick(initial({ elapsedMs: ms(40) }), 1000, true, '2026-10-31');
  assert.equal(s.date, '2026-10-31'); assert.equal(s.elapsedMs, 0);
});
check('cambio DST de otoño no duplica la hora civil repetida', () => {
  const first = Date.parse('2026-11-01T05:59:45Z'); // 01:59 EDT
  const second = Date.parse('2026-11-01T06:00:15Z'); // 01:00 EST, mismo día ET
  assert.equal(tick(tick(initial(), first), second).elapsedMs, 30000);
});
check('cambio DST de primavera no inventa la hora civil omitida', () => {
  const date = '2026-03-08', first = Date.parse('2026-03-08T06:59:45Z'), second = Date.parse('2026-03-08T07:00:15Z');
  const s = C.create({ enabled: true, date });
  assert.equal(tick(tick(s, first, true, date), second, true, date).elapsedMs, 30000);
});
check('sólo la fecha ET dada por el adaptador decide medianoche', () => {
  const first = Date.parse('2026-11-02T04:59:45Z');
  const second = Date.parse('2026-11-02T05:00:15Z');
  const s = tick(tick(initial({ elapsedMs: ms(45) }), first), second, true, '2026-11-02');
  assert.equal(s.elapsedMs, 0); assert.equal(s.date, '2026-11-02');
});
check('umbral diario produce shouldRemind sin DOM ni notificaciones', () => {
  const before = tick(initial({ elapsedMs: ms(60) - 10000 }), 1000);
  const due = tick(before, 11000); assert.equal(due.shouldRemind, true);
  assert.equal(tick(due, 21000, false).shouldRemind, true);
});
check('dismiss silencia el resto del día, también tras restaurar', () => {
  const due = initial({ elapsedMs: ms(90) }); const dismissed = C.dismiss(due);
  assert.equal(dismissed.shouldRemind, false); assert.equal(dismissed.dismissed, true);
  assert.equal(tick(C.create(dismissed), 1000).shouldRemind, false);
});
check('después de dismiss no se sigue recogiendo duración innecesaria', () => {
  const s = C.dismiss(tick(initial({ elapsedMs: ms(60) }), 1000));
  assert.equal(tick(s, 31000).elapsedMs, ms(60));
});
check('un nuevo día permite un aviso nuevo después de dismiss', () => {
  const s = tick(C.dismiss(initial({ elapsedMs: ms(60) })), 1000, true, '2026-11-02');
  assert.equal(s.dismissed, false); assert.equal(s.elapsedMs, 0);
});
check('desactivar borra el agregado del día y no lo recupera al reactivar', () => {
  const off = C.setEnabled(initial({ elapsedMs: ms(60), dismissed: true }), false);
  assert.equal(off.elapsedMs, 0); assert.equal(off.dismissed, false); assert.equal(off.shouldRemind, false);
  const on = C.setEnabled(off, true); assert.equal(on.elapsedMs, 0); assert.equal(on.shouldRemind, false);
});
check('cada límite permitido se conserva con su umbral exacto', () => {
  for (const n of [30, 60, 90, 120]) {
    const s = C.setLimit(initial({ elapsedMs: ms(n) }), n);
    assert.equal(s.limitMinutes, n); assert.equal(s.shouldRemind, true);
  }
});
check('límite menor puede activar el aviso sin sumar tiempo', () => {
  const s = initial({ elapsedMs: ms(45) }); assert.equal(s.shouldRemind, false);
  assert.equal(C.setLimit(s, 30).shouldRemind, true);
});
check('cambiar el límite no vuelve a avisar en un día descartado', () => {
  const s = C.setLimit(C.dismiss(initial({ elapsedMs: ms(120) })), 30);
  assert.equal(s.shouldRemind, false); assert.equal(s.dismissed, true);
});
check('configuración de límite inválida usa 60 y editar con inválido conserva preferencia', () => {
  assert.equal(initial({ limitMinutes: 45 }).limitMinutes, 60);
  assert.equal(C.setLimit(initial({ limitMinutes: 90 }), 'mal').limitMinutes, 90);
  assert.equal(C.setLimit(initial(), '120').limitMinutes, 120);
});
check('fecha inválida o ausente no conserva un agregado huérfano', () => {
  for (const date of [undefined, '', '2026-02-30', '01/11/2026']) {
    const s = initial({ date, elapsedMs: ms(100), dismissed: true });
    assert.equal(s.date, ''); assert.equal(s.elapsedMs, 0); assert.equal(s.dismissed, false); assert.equal(s.shouldRemind, false);
  }
});
check('un tick con fecha inválida pausa sin contabilizar actividad', () => {
  const s = tick(tick(initial({ elapsedMs: 1000 }), 1000), 2000, true, 'mal');
  assert.equal(s.elapsedMs, 1000); assert.equal(s.active, false); assert.equal(s.lastNow, null);
});
check('datos malformados no producen NaN, Infinity ni seguimiento implícito', () => {
  for (const raw of [null, [], 'state', 9, { enabled: 'true' }, { enabled: true, date: DATE, elapsedMs: Infinity },
    { enabled: true, date: DATE, elapsedMs: -1 }, { enabled: true, date: DATE, elapsedMs: '123' }]) {
    const s = C.create(raw); assert.ok(Number.isFinite(s.elapsedMs)); assert.equal(s.elapsedMs, 0); assert.equal(s.active, false);
  }
});
check('un agregado restaurado absurdo no supera el día civil ET más largo', () => {
  const s = initial({ elapsedMs: Number.MAX_SAFE_INTEGER });
  assert.equal(s.elapsedMs, ms(25 * 60));
  assert.equal(tick(tick(s, 1000), 61000).elapsedMs, ms(25 * 60));
});
check('la restauración descarta campos ajenos, dueño, notas y datos de trading', () => {
  const s = initial({ accountId: 'privado', owner: 'uid-secreto', note: 'secreto', pnl: 12, shouldRemind: true });
  assert.deepEqual(Object.keys(s).sort(), ['version', 'enabled', 'limitMinutes', 'elapsedMs', 'date', 'dismissed', 'active', 'lastNow', 'shouldRemind'].sort());
  assert.ok(!JSON.stringify(s).includes('secreto')); assert.equal(s.shouldRemind, false);
});
check('estados de dos adaptadores/dueños son independientes', () => {
  const ownerA = tick(initial({ elapsedMs: ms(59) }), 1000), ownerB = C.create();
  const nextA = tick(ownerA, 61000); assert.equal(nextA.shouldRemind, true);
  assert.equal(ownerB.elapsedMs, 0); assert.equal(ownerB.enabled, false);
});
check('ninguna función muta los objetos de entrada', () => {
  const s = tick(initial({ elapsedMs: 1234 }), 1000), ctx = { now: 2000, active: false, date: DATE };
  const before = JSON.stringify(s), beforeCtx = JSON.stringify(ctx);
  C.step(s, ctx); C.setLimit(s, 90); C.setEnabled(s, false, ctx); C.dismiss(s); C.create(s);
  assert.equal(JSON.stringify(s), before); assert.equal(JSON.stringify(ctx), beforeCtx);
});
check('la API y los límites publicados son estables e inmutables', () => {
  assert.ok(Object.isFrozen(C)); assert.ok(Object.isFrozen(C.LIMITS)); assert.equal(C.MAX_DELTA_MS, 60000);
});

console.log('\n' + (process.exitCode ? '❌' : '✅') + ' pausas-modelo · ' + assertions + ' comprobaciones correctas');
