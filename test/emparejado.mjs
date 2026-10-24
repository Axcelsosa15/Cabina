/* FIFO de ejecuciones · fixtures deterministas contra la función expuesta por la app.
   No toca el almacén ni modifica los cálculos del motor cuantitativo. */
import { chromium } from 'playwright';
import { quieto, trasAccion, trasGuardar } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t, d) => {
  console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`);
  if (!c) fallos.push(t);
};
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [
    { id: 'acct-1', name: 'Cuenta FIFO', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] }
  ], rules: [] },
  trades: {}
};
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html');
await p.waitForFunction(() => window.FUT?.imp?.emparejarEjecuciones, null, { timeout: 20000 });

const run = fills => p.evaluate(f => FUT.imp.emparejarEjecuciones(f), fills);
const base = (side, qty, price, time, extra = {}) => ({
  accountId: 'acct-1', instrument: 'MNQ', date: '2026-10-01', time,
  side, qty, price, fees: 0, ...extra
});

console.log('\n═══ 1 · cuatro contratos y tres cierres parciales forman una ida y vuelta ═══');
const parcial = await run([
  base('buy', 4, 100, '09:30:00', { fees: 4, executionId: 'open-1' }),
  base('sell', 1, 110, '09:31:00', { fees: 1, executionId: 'close-1' }),
  base('sell', 2, 120, '09:32:00', { fees: 2, executionId: 'close-2' }),
  base('sell', 1, 130, '09:33:00', { fees: 1, executionId: 'close-3' }),
]);
ok(parcial.ops.length === 1, 'no multiplica una entrada por cada cierre', parcial.ops.length + ' operación');
ok(parcial.ops[0]?.qty === 4 && parcial.ops[0]?.exit === 120, 'cantidad y salida media ponderada', JSON.stringify({ qty: parcial.ops[0]?.qty, exit: parcial.ops[0]?.exit }));
ok(parcial.ops[0]?.fees === 8, 'suma comisión de entrada y cierres, asignada por cantidad', parcial.ops[0]?.fees);
ok(parcial.ops[0]?.executionIds.length === 4, 'conserva las cuatro huellas de ejecución', parcial.ops[0]?.executionIds.length);

console.log('\n═══ 2 · dos entradas se emparejan en FIFO y el resto queda abierto ═══');
const fifo = await run([
  base('buy', 1, 100, '09:30:00', { executionId: 'e1' }),
  base('buy', 2, 105, '09:31:00', { executionId: 'e2' }),
  base('sell', 2, 110, '09:32:00', { executionId: 'x1' }),
]);
const cerradas = fifo.ops.filter(x => !x.open), abiertas = fifo.ops.filter(x => x.open);
ok(cerradas.length === 2 && cerradas[0].entry === 100 && cerradas[1].entry === 105, 'el cierre consume primero la entrada más antigua', cerradas.map(x => x.entry).join(', '));
ok(abiertas.length === 1 && abiertas[0].entry === 105 && abiertas[0].qty === 1 && abiertas[0].exit == null, 'no descarta el contrato que sigue abierto', JSON.stringify(abiertas[0] && { entry: abiertas[0].entry, qty: abiertas[0].qty, exit: abiertas[0].exit }));

console.log('\n═══ 3 · una vuelta de posición cierra y abre en la misma ejecución ═══');
const reversal = await run([
  base('buy', 1, 100, '09:30:00', { executionId: 'r1' }),
  base('sell', 2, 90, '09:31:00', { executionId: 'r2' }),
]);
ok(reversal.ops.some(x => !x.open && x.direction === 'long' && x.qty === 1 && x.exit === 90), 'cierra el largo existente', JSON.stringify(reversal.ops));
ok(reversal.ops.some(x => x.open && x.direction === 'short' && x.qty === 1 && x.entry === 90), 'abre el corto residual', JSON.stringify(reversal.ops));

console.log('\n═══ 4 · las huellas evitan duplicados y la cuenta/instrumento aíslan el FIFO ═══');
const dedupe = await p.evaluate(() => FUT.imp.emparejarEjecuciones([
  { accountId: 'acct-1', instrument: 'MNQ', date: '2026-10-01', time: '09:30:00', side: 'buy', qty: 1, price: 100, executionId: 'same-id' },
  { accountId: 'acct-1', instrument: 'MNQ', date: '2026-10-01', time: '09:30:00', side: 'buy', qty: 1, price: 100, executionId: 'same-id' }
], ['id:same-id']));
ok(dedupe.aceptadas === 0 && dedupe.duplicadas.length === 2, 'no vuelve a consumir IDs ya importados', dedupe.duplicadas.length + ' duplicados');
const aisladas = await run([
  base('buy', 1, 100, '09:30:00', { accountId: 'acct-1' }),
  base('sell', 1, 110, '09:31:00', { accountId: 'acct-2' }),
  base('sell', 1, 110, '09:32:00', { instrument: 'MES' }),
]);
ok(aisladas.ops.length === 3 && aisladas.ops.every(x => x.open), 'nunca empareja cuentas o instrumentos distintos', aisladas.ops.length + ' posiciones abiertas');

console.log('\n═══ 5 · los datos inválidos se informan, no se descartan en silencio ═══');
const invalid = await run([base('buy', 0, 100, '09:30:00'), base('hold', 1, 100, '09:31:00')]);
ok(invalid.invalidas.length === 2 && invalid.ops.length === 0, 'rechaza cantidad cero y lado desconocido', invalid.invalidas.length + ' filas rechazadas');
console.log('\n═══ 6 · el mapeador de ejecuciones produce operaciones y conserva la huella ═══');
const previo = await p.evaluate(() => {
  const csv = 'date,time,instrument,side,qty,price,fees,execution_id\n'
    + '2026-10-01,09:30:00,MNQ,buy,2,100,2,fill-open\n'
    + '2026-10-01,09:31:00,MNQ,sell,2,110,2,fill-close';
  const lectura = FUT.csv.lee(csv);
  const mapa = { date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, fees: 6, executionId: 7 };
  return FUT.imp.previoEjecuciones(lectura, mapa, {}, 'acct-1', [], []);
});
ok(previo.ops.length === 1 && previo.ops[0].qty === 2 && previo.ops[0].exit === 110,
   'el CSV de ejecuciones se transforma en una ida y vuelta', JSON.stringify(previo.ops[0]));
ok(previo.ops[0]?.executionLedger?.length === 2 && previo.ops[0]?.executionIds?.length === 2,
   'la operación mantiene los detalles de entrada y salida', JSON.stringify(previo.ops[0]?.executionLedger));
const duplicado = await p.evaluate(() => {
  const csv = 'date,time,instrument,side,qty,price,execution_id\n2026-10-01,09:30:00,MNQ,buy,1,100,seen';
  return FUT.imp.previoEjecuciones(FUT.csv.lee(csv),
    { date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, executionId: 6 },
    {}, 'acct-1', ['id:seen'], []);
});
ok(duplicado.ops.length === 0 && duplicado.duplicadas.length === 1, 'el mapeador marca una ejecución reimportada');

const parcialPrevio = await p.evaluate(() => {
  const csv = 'date,time,instrument,side,qty,price,execution_id\\n2026-10-01,09:31:00,MNQ,sell,1,110,new-close';
  const lectura = FUT.csv.lee(csv);
  const mapa = { date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, executionId: 6 };
  return FUT.imp.previoEjecuciones(lectura, mapa, {}, 'acct-1', [], [{
    type: 'futuros', source: 'import:ejecuciones', accountId: 'acct-1',
    instrument: 'MNQ', direction: 'long', exit: null
  }]);
});
ok(parcialPrevio.conflictos.length === 1 && !parcialPrevio.listo,
   'bloquea un rango parcial que cerraría una posición importada aún abierta sin ledger',
   JSON.stringify({ conflictos: parcialPrevio.conflictos.length, listo: parcialPrevio.listo }));

console.log('\\n═══ 6b · reanudar una posición abierta importada con su ledger ═══');
const incremental = async qty => p.evaluate(q => {
  const csv = 'date,time,instrument,side,qty,price,fees,execution_id\\n'
    + '2026-10-01,09:31:00,MNQ,sell,' + q + ',110,1,close-new';
  const lectura = FUT.csv.lee(csv);
  const mapa = { date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, fees: 6, executionId: 7 };
  const previa = [{
    id: 'existing-open', type: 'futuros', source: 'import:ejecuciones', accountId: 'acct-1',
    instrument: 'MNQ', direction: 'long', qty: 2, entry: 100, exit: null, fees: 2,
    executionIds: ['id:open-fill'],
    executionLedger: [{ role: 'entry', side: 'buy', qty: 2, price: 100, fees: 2,
      date: '2026-10-01', time: '09:30:00', executionId: 'open-fill', fingerprint: 'id:open-fill' }]
  }];
  return FUT.imp.previoEjecuciones(lectura, mapa, {}, 'acct-1', ['id:open-fill'], previa);
}, qty);
const incrementalFull = await incremental(2);
ok(incrementalFull.listo && incrementalFull.conflictos.length === 0
   && incrementalFull.ops.length === 1 && incrementalFull.ops[0].existingTradeId === 'existing-open'
   && incrementalFull.ops[0].exit === 110,
   'un cierre nuevo completa la operación abierta existente sin duplicarla',
   JSON.stringify({ listo: incrementalFull.listo, conflictos: incrementalFull.conflictos.length,
     ops: incrementalFull.ops.map(x => ({ id: x.existingTradeId, qty: x.qty, exit: x.exit })) }));
const incrementalPartial = await incremental(1);
ok(incrementalPartial.listo && incrementalPartial.ops.length === 2
   && incrementalPartial.ops.some(x => x.existingTradeId === 'existing-open' && x.exit === 110 && x.qty === 1)
   && incrementalPartial.ops.some(x => !x.existingTradeId && x.open && x.qty === 1),
   'un cierre parcial guarda el tramo cerrado y conserva el resto abierto',
   JSON.stringify(incrementalPartial.ops.map(x => ({ id: x.existingTradeId || 'nuevo', qty: x.qty, exit: x.exit, open: x.open }))));

console.log('\\n═══ 7 · importación real y ledger visible en el journal ═══');
await p.click('.tabbtn[data-tab="futuros"]');
await p.click('#ftSeg button[data-v="diario"]');
await quieto(p);
await p.click('#impPaste');
await p.fill('#ef_c', 'date,time,instrument,side,qty,price,fees,execution_id\\n'
  + '2026-10-01,09:30:00,MNQ,buy,2,100,2,fill-open\\n'
  + '2026-10-01,09:31:00,MNQ,sell,2,110,2,fill-close');
await p.click('#edSave');
await trasAccion(p);
await p.selectOption('#impMode', 'ejecuciones');
await quieto(p);
for (const [campo, i] of Object.entries({ date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, fees: 6, executionId: 7 })) {
  await p.selectOption(`select[data-imp="col_${campo}"]`, String(i));
}
await p.selectOption('select[data-imp="cuenta"]', 'acct-1');
await quieto(p);
ok(await p.$('#impGo') !== null, 'el modo FIFO deja previsualizar una ida y vuelta válida', 'botón disponible');
await p.click('#impGo');
await p.fill('#ef_ok', 'IMPORTAR');
await p.click('#edSave');
await trasGuardar(p);
const guardada = await p.evaluate(() => {
  const t = (FUT.trades() || []).find(x => x.source === 'import:ejecuciones');
  return {
    source: t && t.source, qty: t && t.qty, exit: t && t.exit,
    ledger: t && t.executionLedger && t.executionLedger.length,
    ids: t && t.executionIds && t.executionIds.length,
    visible: document.querySelector('#jrTable .execs details summary')?.textContent || ''
  };
});
ok(guardada.source === 'import:ejecuciones' && guardada.qty === 2 && guardada.exit === 110,
   'el botón escribe la operación emparejada con su procedencia', JSON.stringify(guardada));
ok(guardada.ledger === 2 && guardada.ids === 2 && /2 fills/.test(guardada.visible),
   'el journal muestra los dos fills originales dentro de la operación', JSON.stringify(guardada));

await p.click('#execToggle');
const historyRows = await p.locator('#execHistoryTable tbody tr').count();
const historyText = await p.locator('#execHistoryTable').innerText();
ok(historyRows === 2 && historyText.includes('fill-open') && historyText.includes('fill-close'),
   'el historial consolidado muestra los fills sin duplicarlos', JSON.stringify({ rows: historyRows, text: historyText.slice(0, 300) }));
await p.fill('#execQ', 'fill-open');
await quieto(p);
ok(await p.locator('#execHistoryTable tbody tr').count() === 1,
   'el historial permite filtrar por ID de ejecución');
await p.click('#execReset');
ok(await p.locator('#execHistoryTable tbody tr').count() === 2,
   'limpiar filtros restaura el historial completo');

console.log('\\n═══ 8 · reconciliación incremental real y deshacer seguro ═══');
const importarCSV = async csv => {
  await p.click('#impPaste');
  await p.fill('#ef_c', csv);
  await p.click('#edSave');
  await trasAccion(p);
  await p.selectOption('#impMode', 'ejecuciones');
  for (const [campo, i] of Object.entries({ date: 0, time: 1, instrument: 2, side: 3, qty: 4, price: 5, fees: 6, executionId: 7 })) {
    await p.selectOption(`select[data-imp="col_${campo}"]`, String(i));
  }
  await p.selectOption('select[data-imp="cuenta"]', 'acct-1');
  await quieto(p);
  await p.click('#impGo');
  await p.fill('#ef_ok', 'IMPORTAR');
  await p.click('#edSave');
  await trasGuardar(p);
};
await importarCSV('date,time,instrument,side,qty,price,fees,execution_id\\n'
  + '2026-10-02,09:30:00,MNQ,buy,2,100,2,open-inc');
const openBefore = await p.evaluate(() => {
  const t = (FUT.trades() || []).find(x => x.executionIds?.includes('id:open-inc'));
  return t && { id: t.id, exit: t.exit, qty: t.qty, ledger: t.executionLedger?.length };
});
ok(!!openBefore && openBefore.exit == null && openBefore.qty === 2 && openBefore.ledger === 1,
   'una importación de entrada conserva una posición abierta', JSON.stringify(openBefore));
await importarCSV('date,time,instrument,side,qty,price,fees,execution_id\\n'
  + '2026-10-02,09:31:00,MNQ,sell,2,110,2,close-inc');
const closedAfter = await p.evaluate(id => {
  const t = (FUT.trades() || []).find(x => x.id === id);
  return t && { id: t.id, exit: t.exit, qty: t.qty, ledger: t.executionLedger?.length, ids: t.executionIds };
}, openBefore?.id);
ok(!!closedAfter && closedAfter.exit === 110 && closedAfter.qty === 2 && closedAfter.ledger === 2
   && closedAfter.ids.includes('id:close-inc'),
   'la segunda importación actualiza la misma operación y conserva ambos fills', JSON.stringify(closedAfter));
await p.click('#impUndo');
await p.fill('#ef_ok', 'BORRAR');
await p.click('#edSave');
await trasGuardar(p);
const restored = await p.evaluate(id => {
  const t = (FUT.trades() || []).find(x => x.id === id);
  return t && { id: t.id, exit: t.exit, qty: t.qty, ledger: t.executionLedger?.length, ids: t.executionIds };
}, openBefore?.id);
ok(!!restored && restored.exit == null && restored.qty === 2 && restored.ledger === 1
   && !restored.ids.includes('id:close-inc'),
   'deshacer restaura el trade abierto original sin borrar su entrada', JSON.stringify(restored));

ok(errores.length === 0, 'sin errores JavaScript', errores.join(' | ') || 'ninguno');

await b.close();
console.log(`\\n${fallos.length ? '❌' : '✅'} emparejado · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
