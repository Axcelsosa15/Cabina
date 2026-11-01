/* Disciplina: fechas ET, evidencia incompleta y puntos de proceso sin P&L. */
import assert from 'node:assert/strict';
import '../discipline.js';

const D = globalThis.CabinaDiscipline;
let assertions = 0;
function check(label, fn) {
  try { fn(); assertions++; console.log('  ✅ ' + label); }
  catch (err) { console.error('  ❌ ' + label + ': ' + err.message); process.exitCode = 1; }
}
const NOW = Date.parse('2026-10-30T21:00:00Z');
const TODAY = '2026-10-30';
const stamp = (date, hour = '12:00') => Date.parse(date + 'T' + hour + ':00Z');
const snapshot = (date, all = true, hour = '12:00') => ({
  at: stamp(date, hour), ses: 'nyam', done: all ? 2 : 1, total: 2,
  items: [{ t: 'Nivel', ok: true }, { t: 'Descanso', ok: all, gate: true }],
});
const day = (date, overrides = {}) => ({
  date, closed: true, note: 'Reflexión privada, cuenta Secreta, $1234.',
  pres: { nyam: snapshot(date) }, updatedAt: stamp(date, '21:00'), ...overrides,
});
const baseTrade = (overrides = {}) => ({
  id: 't1', type: 'futuros', date: TODAY, time: '09:15', source: 'manual',
  instrument: 'MNQ', accountId: 'SECRETA', direction: 'long', qty: 1,
  entry: 21000, stop: 20990, exit: 21010, pnl: 20,
  invalida: 'Texto privado de mi plan', cStruct: true, cPull: true, cWindow: true, cSize: true,
  plan: 'cumpli', processRules: { status: 'pass' }, ...overrides,
});
const score = (overrides = {}, opts = {}) => D.scoreTrade(baseTrade(overrides), { day: day(TODAY), now: NOW, today: TODAY, ...opts });
const summary = (days, trades = [], extra = {}) => D.summarize({ days, trades, today: TODAY, now: NOW, ...extra });

check('cinco hechos documentados dan 100 puntos y cinco estrellas', () => {
  const r = score(); assert.equal(r.score, 100); assert.equal(r.stars, 5); assert.equal(r.coverage, 1);
});
check('ganar o perder el mismo trade no cambia puntos ni estrellas', () => {
  assert.equal(score({ exit: 20990, pnl: -20 }).score, score({ exit: 21010, pnl: 20 }).score);
  assert.equal(score({ exit: 20990, pnl: -20 }).stars, score({ exit: 21010, pnl: 20 }).stars);
});
check('un P&L manual grande no mejora disciplina', () => assert.equal(score({ pnl: 1000000 }).score, score({ pnl: -1000000 }).score));
check('un stop incoherente es fallo documentado, no dato ausente', () => {
  const r = score({ stop: 21010 }); assert.equal(r.score, 80); assert.equal(r.criteria.find(x => x.key === 'risk').status, 'fail');
});
check('invalidación vacía no equivale éxito', () => assert.equal(score({ invalida: '' }).criteria.find(x => x.key === 'risk').status, 'fail'));
check('invalidación ausente conserva desconocido', () => {
  const t = baseTrade(); delete t.invalida;
  assert.equal(D.scoreTrade(t, { day: day(TODAY), now: NOW }).score, null);
});
check('ningún campo faltante produce una puntuación perfecta', () => {
  const r = D.scoreTrade({ id: 'antigua', date: TODAY, pnl: 0 }, { now: NOW });
  assert.equal(r.score, null); assert.equal(r.coverage, 0); assert.equal(r.confirmedPoints, 0);
});
check('sin snapshot de reglas no se deduce éxito de offProtocol ausente', () => {
  const r = score({ processRules: undefined }); assert.equal(r.score, null); assert.equal(r.coverage, 0.8);
  assert.equal(r.criteria.find(x => x.key === 'rules').status, 'unknown');
});
check('offProtocol guardado prevalece sobre un snapshot favorable', () => {
  const r = score({ offProtocol: ['Pre-sesión incompleta'] });
  assert.equal(r.criteria.find(x => x.key === 'rules').status, 'fail'); assert.equal(r.score, 80);
});
check('una casilla falsa produce fallo aunque las otras no existan', () => {
  assert.equal(score({ cStruct: false, cPull: undefined }).criteria.find(x => x.key === 'conditions').status, 'fail');
});
check('casillas faltantes producen desconocido', () => assert.equal(score({ cPull: undefined }).score, null));
check('sólo las respuestas explícitas de revisión suman', () => {
  assert.equal(score({ plan: '' }).score, null); assert.equal(score({ plan: 'antes' }).score, 80);
  assert.equal(score({ exitWhy: 'nervios' }).score, 80); assert.equal(score({ plan: 'no_hizo_falta' }).score, 100);
});
check('un trade abierto nunca gana estrellas', () => {
  const r = score({ exit: null, pnl: null }); assert.equal(r.score, null); assert.equal(r.stars, null); assert.equal(r.status, 'open');
});
check('registro rápido no gana por casillas rellenadas después', () => assert.equal(score({ source: 'quick_add' }).stars, null));
check('CSV importado no gana por plan rellenado después', () => assert.equal(score({ source: 'import:tradovate' }).stars, null));
check('fuente antigua sin datos de preparación sigue incompleta', () => assert.equal(score({ source: undefined }, { day: { date: TODAY } }).score, null));
check('se comparan minutos ET y no la zona local de la máquina', () => {
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: snapshot(TODAY, true, '13:14') } }) }).score, 100);
});
check('una lista guardada en el mismo minuto de entrada no prueba anterioridad', () => {
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: snapshot(TODAY, true, '13:15') } }) }).score, null);
});
check('una lista posterior al trade no cuenta como preparación previa', () => {
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: snapshot(TODAY, true, '14:00') } }) }).score, null);
});
check('un snapshot de otra fecha no sirve aunque coincida la sesión', () => {
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: snapshot('2026-10-29') } }) }).score, null);
});
check('done/total falsos no reemplazan la evidencia de items', () => {
  const p = snapshot(TODAY, false); p.done = 999; p.total = 999;
  const r = score({}, { day: day(TODAY, { pres: { nyam: p } }) });
  assert.equal(r.criteria[0].status, 'fail'); assert.equal(r.score, 80);
});
check('lista vacía o booleans no explícitos no completa la preparación', () => {
  const p = snapshot(TODAY); p.items = [{ t: 'Nivel', ok: 1 }];
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: p } }) }).score, null);
});
check('el horario de invierno se compara con EST después del cambio DST', () => {
  const date = '2026-11-02', p = snapshot(date, true, '14:00');
  const r = D.scoreTrade(baseTrade({ date }), { day: day(date, { pres: { nyam: p } }), now: stamp(date, '22:00'), today: date });
  assert.equal(r.score, 100);
});
check('el horario de verano usa EDT antes del cambio DST', () => {
  const date = '2026-03-09', p = snapshot(date, true, '13:00');
  const r = D.scoreTrade(baseTrade({ date }), { day: day(date, { pres: { nyam: p } }), now: stamp(date, '22:00'), today: date });
  assert.equal(r.score, 100);
});
check('un sello futuro no produce éxito', () => {
  assert.equal(score({}, { day: day(TODAY, { pres: { nyam: snapshot(TODAY, true, '23:00') } }) }).score, null);
});
check('reglas explícitas evalúan cantidad, instrumento y ventana históricos', () => {
  const rulesSnapshot = { maxContracts: 1, instruments: ['MNQ'], window: { start: 510, end: 660, days: [1, 2, 3, 4, 5] } };
  assert.equal(score({}, { rulesSnapshot }).score, 100);
  assert.equal(score({ qty: 2 }, { rulesSnapshot }).score, 80);
  assert.equal(score({ instrument: 'MES' }, { rulesSnapshot }).score, 80);
});
check('toda una lista de reglas sin configurar sigue desconocida', () => assert.equal(score({}, { rulesSnapshot: { maxContracts: 0, instruments: [] } }).score, null));

const noEdge = { kind: 'no_edge', at: stamp(TODAY, '14:00') };
check('XP diario usa sólo tres acciones de proceso y tiene tope20', () => {
  const r = summary([day(TODAY, { processDecision: noEdge })]); assert.equal(r.totalXP, 20); assert.equal(r.days[0].xp, 20);
});
check('100 trades adicionales no añaden XP', () => {
  const many = Array.from({ length: 100 }, (_, i) => baseTrade({ id: 't' + i }));
  assert.equal(summary([day(TODAY)], many).totalXP, summary([day(TODAY)], []).totalXP);
});
check('duplicar días o trades no infla puntos ni recuentos', () => {
  const d = day(TODAY), t = baseTrade(); const r = summary([d, d], [t, t]);
  assert.equal(r.totalXP, 15); assert.equal(r.days.length, 1); assert.equal(r.tradeScores.length, 1); assert.equal(r.days[0].tradeCount, 1);
});
check('con dos versiones manda la actualizada, aunque quite puntos', () => {
  const d = day(TODAY); const r = summary([d, { ...d, updatedAt: d.updatedAt + 1, pres: {}, closed: false }]);
  assert.equal(r.totalXP, 0);
});
check('borrar snapshot quita puntos y deshace la racha derivada', () => {
  const before = summary([day(TODAY)]), after = summary([day(TODAY, { pres: {} })]);
  assert.equal(before.totalXP, 15); assert.equal(after.totalXP, 5); assert.equal(after.streaks.checklist.current, 0);
});
check('reabrir el día quita journaling y excluye hoy de rachas', () => {
  const before = summary([day('2026-10-29'), day(TODAY)]);
  const after = summary([day('2026-10-29'), day(TODAY, { closed: false })]);
  assert.equal(before.streaks.checklist.current, 2); assert.equal(after.streaks.checklist.current, 1);
  assert.equal(after.totalXP, 25); assert.equal(after.days[1].journalComplete, false);
});
check('nota vacía no obtiene puntos de journal aunque el día esté cerrado', () => assert.equal(summary([day(TODAY, { note: '  ' })]).totalXP, 10));
check('broke falso por defecto y cero trades no inventan un día sin edge', () => {
  const r = summary([{ date: TODAY, broke: false }]); assert.equal(r.totalXP, 0); assert.equal(r.days[0].noEdge, false);
});
check('descanso explícito no_edge requiere sello en la fecha ET', () => {
  assert.equal(summary([day(TODAY, { processDecision: { kind: 'no_edge' } })]).totalXP, 15);
  assert.equal(summary([day(TODAY, { processDecision: { kind: 'no_edge', at: stamp('2026-10-29') } })]).totalXP, 15);
});
check('añadir una operación revoca el bonus de no operar', () => {
  assert.equal(summary([day(TODAY, { processDecision: noEdge })], [baseTrade()]).totalXP, 15);
});
check('operaciones apuntadas a mano revocan bonus y racha de no operar', () => {
  const r = summary([day(TODAY, { processDecision: noEdge, trades: 1 })]);
  assert.equal(r.totalXP, 15); assert.equal(r.days[0].noEdge, false); assert.equal(r.streaks.noEdge.current, 0);
});
check('resultado manual, incluso cero, no prueba un día sin operaciones', () => {
  for (const result of [-20, 0, 20]) {
    const r = summary([day(TODAY, { processDecision: noEdge, resultManual: true, result })]);
    assert.equal(r.totalXP, 15); assert.equal(r.days[0].noEdge, false); assert.equal(r.streaks.noEdge.current, 0);
  }
});
check('resultado manual ausente y cero operaciones conservan la decisión explícita', () => {
  const r = summary([day(TODAY, { processDecision: noEdge, trades: 0, resultManual: true, result: null })]);
  assert.equal(r.totalXP, 20); assert.equal(r.days[0].noEdge, true);
});
check('borrar la operación permite de nuevo la decisión explícita sin duplicarla', () => {
  const r = summary([day(TODAY, { processDecision: noEdge })], []); assert.equal(r.totalXP, 20); assert.equal(r.days[0].noEdge, true);
});
check('hueco laborable rompe racha aunque no haya documento del día', () => {
  const r = summary([day('2026-10-26'), day('2026-10-28')], [], { today: '2026-10-29' });
  assert.equal(r.streaks.checklist.current, 1); assert.equal(r.streaks.checklist.best, 1);
});
check('fines de semana sin actividad no rompen rachas', () => {
  const r = summary([day('2026-10-23'), day('2026-10-26')], [], { today: '2026-10-26' });
  assert.equal(r.streaks.checklist.current, 2); assert.equal(r.streaks.checklist.best, 2);
});
check('fines de semana con actividad incompleta sí cierran la racha', () => {
  const r = summary([day('2026-10-23'), { date: '2026-10-24', note: 'Actividad sin lista' }, day('2026-10-26')], [], { today: '2026-10-26' });
  assert.equal(r.streaks.checklist.current, 1); assert.equal(r.streaks.checklist.best, 1);
});
check('hoy incompleto permite conservar la racha de ayer hasta el cierre', () => {
  const r = summary([day('2026-10-29'), { date: TODAY }]); assert.equal(r.streaks.checklist.current, 1);
});
check('un día laborable perdido antes de hoy deja la racha actual en cero', () => {
  const r = summary([day('2026-10-28')]); assert.equal(r.streaks.checklist.current, 0);
});
check('no se trunca la historia de checklist a catorce documentos', () => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse('2026-09-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    return day(date, { closed: false, note: '' });
  });
  assert.equal(summary(days).days.length, 30); assert.equal(summary(days).totalXP, 300);
});
check('fechas imposibles y futuras no obtienen puntos', () => {
  assert.equal(summary([day('2026-02-30'), day('2026-11-01')]).totalXP, 0);
});
check('mapa de días y array de días producen el mismo resumen', () => {
  assert.equal(summary({ [TODAY]: day(TODAY) }).totalXP, summary([day(TODAY)]).totalXP);
});
check('no se muta ningún objeto de entrada', () => {
  const input = { days: [day(TODAY)], trades: [baseTrade()], today: TODAY, now: NOW };
  const before = JSON.stringify(input); D.summarize(input); D.weekSummary(input);
  assert.equal(JSON.stringify(input), before);
});
check('recap semanal usa lunes ET y sólo proceso', () => {
  const r = D.weekSummary({ days: [day('2026-10-23'), day('2026-10-26'), day(TODAY)], trades: [baseTrade({ plan: 'antes' })], today: TODAY, now: NOW });
  assert.equal(r.start, '2026-10-26'); assert.equal(r.end, TODAY); assert.equal(r.totalXP, 30);
  assert.equal(r.frequentError.key, 'review'); assert.equal(r.frequentError.count, 1);
});
check('recap semanal vacío conserva un estado vacío explícito', () => {
  const r = D.weekSummary({ days: [], trades: [], today: TODAY, now: NOW });
  assert.equal(r.processDays, 0); assert.equal(r.frequentError, null); assert.equal(r.bestProcessDay, null);
});
check('documentos vacíos y trades sin evidencia no inventan mejor día de proceso', () => {
  const r = D.weekSummary({ days: [{ date: TODAY }], trades: [baseTrade({ processRules: undefined })], today: TODAY, now: NOW });
  assert.equal(r.totalXP, 0); assert.equal(r.bestProcessDay, null);
});
check('el resumen compartible no incluye identificadores ni texto ni importes privados', () => {
  const input = { days: [day(TODAY)], trades: [baseTrade()], today: TODAY, now: NOW };
  for (const r of [D.summarize(input), D.weekSummary(input)]) {
    const s = JSON.stringify(r.shareSummary);
    assert.ok(!/SECRETA|Secreta|MNQ|1234|Texto privado|Reflexión privada|accountId|pnl|instrument|note|tradeId/.test(s));
    assert.ok(!s.includes('"t1"'));
  }
});

console.log('\n' + (process.exitCode ? '❌' : '✅') + ' disciplina-modelo · ' + assertions + ' comprobaciones correctas');
