/* EL MAPEADOR MANUAL · fase 1 de docs/IMPORTAR.md.

   Lo que esta prueba fija, y por qué cada cosa:

       · «NO HAY NADA QUE DECIDIR» NO ES «ES AMBIGUO». Una columna de contratos
         con «1» y «2» no tiene separador decimal: no hay nada que preguntar.
         Tratarlo como ambiguo pediría una decisión imposible en casi todos los
         ficheros, y un aviso que sale siempre se aprende a ignorar — y el día
         que importa, también.
       · UNA CELDA CON ALGO DENTRO QUE NO SE LEE ES UN PROBLEMA, NO UN HUECO.
         Si «Salida» trae «abc», la operación no está abierta: está mal leída.
         Dejarla entrar como abierta le quita su resultado a la cuenta sin un
         solo error en pantalla.
       · LA FILA QUE NO ENTRA SE ENSEÑA con su número y su motivo, y el número
         cuadra con lo que se ve al abrir el CSV en una hoja de cálculo.
       · FECHA Y HORA PUEDEN COMPARTIR COLUMNA —un «15/09/2026 10:05» es lo
         normal— y ninguna otra pareja puede.
       · LA COMISIÓN ES MAGNITUD Y EL P&L LLEVA SIGNO: «(50.00)» es −50.
       · Y LO IMPORTADO NO SE JUZGA COMO SI HUBIERA TENIDO UN PLAN. Es la parte
         que más daño haría si se rompe: sin esto, cada fila de un CSV entra en
         la pestaña de errores como «Ejecución · sabías qué hacer y no lo
         hiciste», porque le falta el stop que ningún bróker exporta. Cien
         operaciones importadas, cien errores que nadie cometió.

   Lo que esta prueba NO puede dar por bueno: que las cifras cuadren con la
   plataforma del bróker al céntimo. Ése es el control que `IMPORTAR.md` le pone
   a la fase 1 y exige un `.csv` REAL de la fase 0, que sigue sin existir. Los
   CSV de aquí son sintéticos y van EN ESTE FICHERO a propósito, no en
   `test/fixtures/`: un fixture sintético ahí se confundiría con el real y daría
   la fase 0 por cerrada sin estarlo. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar, trasAccion } from './espera.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const F = new Date('2026-09-17T14:00:00Z').getTime();
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

/* Dos pérdidas iguales salvo en la procedencia. Es el par que prueba que la
   excepción está ACOTADA a lo importado y no es una amnistía general: la
   escrita a mano sin stop sigue siendo un error de ejecución. */
const op = (id, source) => ({
  id, type: 'futuros', accountId: 'a1', instrument: 'MNQ', direction: 'long',
  qty: 1, entry: 21000, exit: 20990, date: '2026-09-15', time: '10:05', source,
});
const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  trades: { tm: op('tm', 'manual'), ti: Object.assign(op('ti', 'import:manual'), { importId: 'imp_x' }) },
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html');
await arrancada(p, '.tabbtn');
await quieto(p);

/* Que el núcleo EXISTA, antes de nada. Sin esto, contra un index.html sin
   importador la prueba falla veinte veces con «undefined» en vez de una vez
   diciendo qué falta. */
const hay = await p.evaluate(() => !!(window.FUT && FUT.imp && FUT.imp.previo && FUT.csv && FUT.csv.lee));
if (!hay) {
  ok(false, 'el mapeador está expuesto en FUT.imp', 'NO existe en el index.html');
  console.log(`\n❌ importar · ${fallos.length} fallos`);
  await b.close(); process.exit(1);
}
ok(true, 'el mapeador está expuesto en FUT.imp', 'presente');

const previo = (txt, mapa, elegido) => p.evaluate(([t, m, e]) => {
  const l = FUT.csv.lee(t);
  const r = FUT.imp.previo(l, m, e || {});
  return {
    ops: r.ops, rech: r.rechazadas.map(x => ({ n: x.n, por: x.problemas.join('; ') })),
    faltan: r.faltan, rep: r.repetidas.map(x => x.campos.join('+')),
    amb: r.plan.ambiguas.map(a => a.que), orden: r.plan.orden, dec: r.plan.decimal, listo: r.listo,
  };
}, [txt, mapa, elegido || {}]);

const M = { date: 0, time: 1, instrument: 2, direction: 3, qty: 4, entry: 5, exit: 6, fees: 7 };
const LIMPIO = `Fecha,Hora,Simbolo,Lado,Ctr,Entrada,Salida,Com
15/09/2026,10:05,MNQ,Buy,1,21000.25,21010.25,1.50
16/09/2026,11:00,MES,Sell,2,5900.50,5895.00,3.00`;

console.log('\n═══ 1 · un CSV legible entra entero, y lo que no hay que decidir no se pregunta ═══');
let r = await previo(LIMPIO, M);
ok(r.ops.length === 2, 'las 2 filas se convierten en 2 operaciones', r.ops.length + ' ops');
ok(r.orden === 'dmy', 'el orden de la fecha sale de la columna (hay un día 15)', r.orden || 'vacío');
ok(r.ops[0] && r.ops[0].date === '2026-09-15', 'la primera es el 15 de septiembre', r.ops[0] && r.ops[0].date);
ok(r.ops[1] && r.ops[1].direction === 'short', '«Sell» es venta, no se cae a compra', r.ops[1] && r.ops[1].direction);
ok(r.ops[1] && r.ops[1].qty === 2, 'los contratos se leen de su columna', r.ops[1] && String(r.ops[1].qty));
/* LA ASERCIÓN DEL AVISO QUE NO SE DA: la columna de contratos no tiene ningún
   separador, así que no es ambigua — es que no hay nada que decidir. */
ok(!r.amb.includes('dec_qty'), 'una columna sin separador NO se declara ambigua', r.amb.join(',') || 'ninguna ambigüedad');
ok(r.amb.length === 0 && r.listo, 'nada que preguntar y listo para importar', 'amb: ' + (r.amb.join(',') || 'ninguna'));

console.log('\n═══ 2 · lo que no se puede decidir se pregunta, y mientras no se contesta no entra nada ═══');
const SOLO12 = `Fecha,Simbolo,Lado,Ctr,Entrada
03/04/2026,MNQ,Buy,1,21000
05/06/2026,MNQ,Sell,1,21010`;
const M2 = { date: 0, instrument: 1, direction: 2, qty: 3, entry: 4 };
r = await previo(SOLO12, M2);
ok(r.amb.includes('orden'), 'con todos los días por debajo de 13, el orden es ambiguo', r.amb.join(',') || 'ninguna');
ok(!r.listo && r.ops.length === 0, 'y NO se produce ninguna operación mientras no se diga', r.ops.length + ' ops');
r = await previo(SOLO12, M2, { orden: 'dmy' });
ok(r.ops.length === 2 && r.ops[0].date === '2026-04-03', 'contestado «día/mes/año», el 03/04 es el 3 de abril', r.ops[0] && r.ops[0].date);
r = await previo(SOLO12, M2, { orden: 'mdy' });
ok(r.ops[0] && r.ops[0].date === '2026-03-04', 'y contestado «mes/día/año», el 4 de marzo', r.ops[0] && r.ops[0].date);

const MILES = `Fecha,Simbolo,Lado,Ctr,Entrada
15/09/2026,MNQ,Buy,1,"1,500"
16/09/2026,MNQ,Sell,1,"2,250"`;
r = await previo(MILES, M2);
ok(r.amb.includes('dec_entry'), 'todos los grupos de 3 cifras: el decimal es ambiguo', r.amb.join(',') || 'ninguna');
r = await previo(MILES, M2, { dec_entry: ',' });
ok(r.ops[0] && r.ops[0].entry === 1.5, 'con coma decimal, «1,500» es uno y medio', r.ops[0] && String(r.ops[0].entry));
r = await previo(MILES, M2, { dec_entry: '.' });
ok(r.ops[0] && r.ops[0].entry === 1500, 'con punto decimal, es mil quinientos', r.ops[0] && String(r.ops[0].entry));

/* Una columna que NO son fechas no es un problema de orden: es una columna
   equivocada, y lo dice cada fila. Preguntar el orden aquí sería pedir que se
   elija entre tres respuestas, las tres inútiles. */
const NOFECHA = `Fecha,Simbolo,Lado,Ctr,Entrada
hola,MNQ,Buy,1,21000`;
r = await previo(NOFECHA, M2);
ok(!r.amb.includes('orden'), 'una columna que no son fechas no pregunta el orden', r.amb.join(',') || 'ninguna');
ok(r.rech.length === 1 && /fecha no se pudo leer/.test(r.rech[0].por), 'lo dice la fila, con su motivo', r.rech[0] && r.rech[0].por);

console.log('\n═══ 3 · una celda ilegible no es un hueco ═══');
const SALIDA = `Fecha,Simbolo,Lado,Ctr,Entrada,Salida
15/09/2026,MNQ,Buy,1,21000,abc
16/09/2026,MNQ,Sell,1,21010,`;
const M3 = { date: 0, instrument: 1, direction: 2, qty: 3, entry: 4, exit: 5 };
r = await previo(SALIDA, M3);
ok(r.ops.length === 1, 'sólo entra una de las dos', r.ops.length + ' ops');
ok(r.ops[0] && r.ops[0].exit === null, 'la de la celda VACÍA entra abierta', r.ops[0] && String(r.ops[0].exit));
ok(r.rech.length === 1 && /Salida no es un número/.test(r.rech[0].por), 'y la de «abc» NO entra como abierta: se para', r.rech[0] && r.rech[0].por);
ok(r.rech[0] && r.rech[0].n === 2, 'el número de fila es el del fichero, con su cabecera contada', r.rech[0] && String(r.rech[0].n));

console.log('\n═══ 4 · lo que falta por decir se nombra, y la columna repetida se caza ═══');
r = await previo(LIMPIO, { date: 0, instrument: 2 });
ok(r.faltan.includes('Lado') && r.faltan.includes('Contratos') && r.faltan.includes('Entrada'), 'los campos sin mapear se nombran', r.faltan.join(', '));
ok(!r.listo && r.ops.length === 0, 'y no se produce nada hasta que estén', r.ops.length + ' ops');
const JUNTO = `Marca,Simbolo,Lado,Ctr,Entrada
15/09/2026 10:05,MNQ,Buy,1,21000`;
r = await previo(JUNTO, { date: 0, time: 0, instrument: 1, direction: 2, qty: 3, entry: 4 });
ok(r.rep.length === 0, 'fecha y hora SÍ pueden compartir columna', r.rep.join(' / ') || 'ninguna repetida');
ok(r.ops[0] && r.ops[0].date === '2026-09-15' && r.ops[0].time === '10:05', 'y de una marca de tiempo salen las dos', r.ops[0] && r.ops[0].date + ' ' + r.ops[0].time);
r = await previo(LIMPIO, Object.assign({}, M, { exit: 5 }));
ok(r.rep.length === 1, 'entrada y salida en la misma columna, en cambio, es un error', r.rep.join(' / ') || 'ninguna');

console.log('\n═══ 5 · la comisión es magnitud; el P&L del bróker lleva signo ═══');
const CONTA = `Fecha,Simbolo,Lado,Ctr,Entrada,PL,Com
15/09/2026,MNQ,Buy,1,21000,(50.00),-1.50`;
r = await previo(CONTA, { date: 0, instrument: 1, direction: 2, qty: 3, entry: 4, pnl: 5, fees: 6 });
ok(r.ops[0] && r.ops[0].pnl === -50, '«(50.00)» es una pérdida de 50', r.ops[0] && String(r.ops[0].pnl));
ok(r.ops[0] && r.ops[0].fees === 1.5, 'y la comisión entra sin signo', r.ops[0] && String(r.ops[0].fees));

console.log('\n═══ 6 · por la pantalla: pegar, mapear, previsualizar, importar, deshacer ═══');
await p.click('.tabbtn[data-tab="futuros"]');
await p.click('#ftSeg button[data-v="diario"]');
await quieto(p);
ok(await p.$('#panelImportar') !== null, 'el panel de importar está en el Diario', 'presente');
await p.click('#impPaste');
await p.fill('#ef_c', LIMPIO);
await p.click('#edSave');
/* `trasAccion` y no `quieto`: leer el texto pegado se difiere 40 ms —el modal
   tiene que cerrarse antes de repintar debajo— y una calma de 30 ms devuelve
   antes de que el mapeo exista. Es el aviso que `espera.mjs` deja escrito. */
await trasAccion(p);
ok(await p.$('select[data-imp="col_date"]') !== null, 'tras leerlo, aparecen los desplegables del mapeo', 'sí');
/* Ni uno viene relleno: es la decisión del panel y se comprueba, porque un
   desplegable ya relleno se lee como comprobado. */
ok(await p.inputValue('select[data-imp="col_entry"]') === '', 'y ninguno viene adivinado', 'vacíos');
for (const [campo, i] of Object.entries(M)) await p.selectOption(`select[data-imp="col_${campo}"]`, String(i));
await quieto(p);
const filasPrev = await p.$$eval('#impMapa tbody tr', n => n.length);
ok(filasPrev === 2, 'la vista previa enseña las 2 que van a entrar', filasPrev + ' filas');
ok(await p.$('#impGo') !== null, 'y aparece el botón de importar', 'sí');
await p.click('#impGo');
await p.fill('#ef_ok', 'IMPORTAR');
await p.click('#edSave');
await trasGuardar(p);
const nota = (await p.textContent('#impNote')).replace(/\s+/g, ' ').trim();
ok(/2 operaciones importadas/.test(nota), 'dice cuántas entraron', nota.slice(0, 80));
/* Contando TODAS las importadas, no sólo las nuevas: la semilla ya trae una
   —la de la sección 7— así que son 1 + 2. Contar sólo el lote nuevo escondería
   un importador que pisara lo que ya había. */
const enJournal = await p.evaluate(() => (FUT.trades ? FUT.trades() : []).filter(t => /^import:/.test(String(t.source || ''))).length);
ok(enJournal === 3, 'están en el journal marcadas como importadas, encima de la que ya había', enJournal + ' importadas (1 sembrada + 2)');
const undo = await p.textContent('#impUndo');
ok(/\(2\)/.test(undo), 'el botón de deshacer cuenta las que quedan', undo.trim());
await p.click('#impUndo');
await p.fill('#ef_ok', 'BORRAR');
await p.click('#edSave');
await trasGuardar(p);
ok(await p.isHidden('#impUndo'), 'deshecho, el botón desaparece', 'oculto');
/* Y DESHACER BORRA SU LOTE, NO TODO LO IMPORTADO. Queda la de la semilla: un
   deshacer que se llevara también las importaciones anteriores sería un borrado
   en masa disfrazado de botón de deshacer. */
const tras = await p.evaluate(() => (FUT.trades ? FUT.trades() : []).map(t => String(t.source || '') + '|' + String(t.importId || '')).filter(s => /^import:/.test(s)));
ok(tras.length === 1 && /imp_x$/.test(tras[0]), 'deshacer borra su lote y deja intacto lo importado antes', tras.join(', ') || 'ninguna');

console.log('\n═══ 7 · una pérdida importada no se juzga como si hubiera tenido un plan ═══');
await p.click('#ftSeg button[data-v="analisis"]');
await quieto(p);
const er = (await p.textContent('#erWrap')).replace(/\s+/g, ' ').trim();
ok(/Sin datos/.test(er), 'la importada cae en «Sin datos»', er.slice(0, 110));
/* Y LA EXCEPCIÓN ESTÁ ACOTADA: la escrita a mano sin stop sigue siendo un error
   de ejecución. Si esta aserción cae con la de arriba en verde, lo que se hizo
   no fue una excepción, fue quitar la señal para todos. */
ok(/Ejecución/.test(er), 'y la escrita a mano sin stop sigue siendo «Ejecución»', er.slice(0, 110));
const unaYuna = await p.$$eval('#erWrap .errcat', n => n.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
ok(unaYuna.filter(t => /Ejecución/.test(t)).some(t => /1 pérdida/.test(t)), 'una sola en Ejecución: la manual', unaYuna.find(t => /Ejecución/.test(t)) || 'ninguna');
ok(unaYuna.filter(t => /Sin datos/.test(t)).some(t => /1 pérdida/.test(t)), 'y una sola sin datos: la importada', unaYuna.find(t => /Sin datos/.test(t)) || 'ninguna');

console.log('\n═══ 8 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n${fallos.length ? '❌' : '✅'} importar · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
