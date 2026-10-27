/* LA COLA DE OPERACIONES IMPORTADAS INCOMPLETAS · fase 5 de docs/IMPORTAR.md.

   Lo que esta prueba fija, y por qué cada cosa:

       · SÓLO LO IMPORTADO ENTRA EN LA COLA. Una operación escrita a mano sin
         stop ya es un error de EJECUCIÓN —categoría 2, «sabías qué hacer y no
         lo hiciste»— y `senalesDe` exime a la importada justamente porque a
         ella el campo le falta por construcción. Meter las manuales aquí
         contaría dos veces lo mismo y borraría esa distinción, que es la que
         impide que cien filas de un CSV se conviertan en cien errores que
         nadie cometió.
       · EL CONTADOR SE CUENTA SOBRE LOS DEMÁS FILTROS, no sobre lo que el
         propio interruptor deja ver. Contarlo después haría que al activarlo el
         número pasara a ser el de la lista y dejara de decir «cuántas de las
         que estás mirando te faltan».
       · LA COLA SE PUEDE VACIAR. De una operación de hace meses no siempre se
         recuerda el stop, y una cola que nunca llega a cero se aprende a
         ignorar —y el día que importa, también—. `stopUnknown` es la salida
         honesta: no inventa un número y no toca la R.
       · QUEDARSE SIN COLA ES EL ÉXITO. Completar la última con el filtro
         puesto vacía la lista, y poner ahí «sin operaciones en este rango»
         convertiría ese momento en un mensaje de error.
       · UN STOP ESCRITO GANA SIEMPRE sobre la marca: si deja de faltar, la
         marca sobra y no se guarda.

   Su modo de fallo: que la cola acabe contando también las manuales, que es
   como vuelve el envenenamiento de la pestaña de errores que la fase 1 cerró. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar, trasAccion } from './espera.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const F = new Date('2026-09-17T14:00:00Z').getTime();
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

/* Tres importadas sin stop, una importada CON stop y una manual sin stop. El
   par que importa es la última contra las primeras: misma ausencia, distinta
   procedencia, y sólo una de las dos es una omisión. */
const op = (id, extra) => Object.assign({
  id, type: 'futuros', accountId: 'a1', instrument: 'MNQ', direction: 'long',
  qty: 1, entry: 21000, exit: 20990, date: '2026-09-15', time: '10:05',
}, extra);

const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  trades: {
    i1: op('i1', { source: 'import:manual', importId: 'imp_x', date: '2026-09-14', time: '09:40' }),
    i2: op('i2', { source: 'import:manual', importId: 'imp_x', date: '2026-09-15', time: '10:05' }),
    i3: op('i3', { source: 'import:ejecuciones', importId: 'imp_y', date: '2026-09-16', time: '11:20' }),
    ic: op('ic', { source: 'import:manual', importId: 'imp_x', stop: 20980, date: '2026-09-15', time: '12:00' }),
    tm: op('tm', { source: 'manual', date: '2026-09-15', time: '13:00' }),
  },
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html');
await arrancada(p, '.tabbtn');
await quieto(p);
await p.click('.tabbtn[data-tab="futuros"]');
await p.click('#ftSeg button[data-v="diario"]');
await quieto(p);

const filas = () => p.$$eval('#jrTable tbody tr[data-id]', n => n.map(x => x.dataset.id));
const textoBoton = () => p.textContent('#jrSoloIncompletas');

console.log('\n═══ 1 · la cola cuenta lo importado sin stop, y sólo eso ═══');
ok(await p.$('#jrCola') !== null && !(await p.getAttribute('#jrCola', 'hidden') !== null),
   'la cola está visible cuando hay importadas', 'visible');
const t1 = await textoBoton();
ok(/\(3\)/.test(t1), 'cuenta las 3 importadas sin stop', t1);
const nota = await p.textContent('#jrColaNota');
ok(/no en R/.test(nota), 'y dice por qué importa: no cuentan en R', nota.trim().slice(0, 72));
ok(!/\(4\)/.test(t1) && !/\(5\)/.test(t1), 'la manual sin stop NO entra en la cola', 'ni la importada con stop');

console.log('\n═══ 2 · el interruptor deja ver sólo esas, y el contador no cambia ═══');
await p.click('#jrSoloIncompletas');
await trasAccion(p);
const vis = await filas();
ok(vis.length === 3 && !vis.includes('tm') && !vis.includes('ic'),
   'la tabla enseña las 3 importadas sin stop', vis.join(','));
const t2 = await textoBoton();
ok(/\(3\)/.test(t2), 'el contador se cuenta sobre los demás filtros, no sobre la vista', t2);
ok(await p.getAttribute('#jrSoloIncompletas', 'aria-pressed') === 'true', 'y el botón se declara pulsado', 'aria-pressed=true');

console.log('\n═══ 3 · «completar la siguiente» abre la más antigua, no la primera de la tabla ═══');
await p.click('#jrCompletarSig');
await trasAccion(p);
const abierta = await p.inputValue('#ef_date').catch(() => '');
ok(abierta === '2026-09-14', 'abre la más antigua de la cola, en orden cronológico', abierta);
ok(await p.$('#ef_stopUnknown') !== null, 'la importada ofrece la salida honesta «no recuerdo el stop»', 'presente');

console.log('\n═══ 4 · escribir el stop la saca de la cola ═══');
await p.fill('#ef_stop', '20985');
await p.click('#edSave');
await trasGuardar(p);
await quieto(p);
/* El encadenado abre la siguiente sola: se cierra para volver a mirar la cola. */
if (await p.$('#ef_date') !== null) { await p.click('#edClose').catch(() => {}); await trasAccion(p); }
await quieto(p);
const t4 = await textoBoton();
ok(/\(2\)/.test(t4), 'quedan 2 en la cola', t4);
const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('cabina-mnq:v1')).trades.i1);
ok(Number(guardado.stop) === 20985, 'el stop quedó escrito', String(guardado.stop));
ok(guardado.source === 'import:manual', 'y sigue marcada como importada', guardado.source);

console.log('\n═══ 5 · «no recuerdo el stop» la saca sin inventar un número ═══');
await p.click('#jrCompletarSig');
await trasAccion(p);
await p.check('#ef_stopUnknown');
await p.click('#edSave');
await trasGuardar(p);
await quieto(p);
if (await p.$('#ef_date') !== null) { await p.click('#edClose').catch(() => {}); await trasAccion(p); }
await quieto(p);
const t5 = await textoBoton();
ok(/\(1\)/.test(t5), 'queda 1 en la cola', t5);
const marcada = await p.evaluate(() => JSON.parse(localStorage.getItem('cabina-mnq:v1')).trades.i2);
ok(marcada.stopUnknown === true, 'se guardó la marca', String(marcada.stopUnknown));
ok(marcada.stop == null || marcada.stop === '', 'y NO se inventó ningún stop', JSON.stringify(marcada.stop));

console.log('\n═══ 6 · quedarse sin cola es el éxito, no una lista vacía sin motivo ═══');
await p.click('#jrCompletarSig');
await trasAccion(p);
await p.check('#ef_stopUnknown');
await p.click('#edSave');
await trasGuardar(p);
await quieto(p);
if (await p.$('#ef_date') !== null) { await p.click('#edClose').catch(() => {}); await trasAccion(p); }
await quieto(p);
const vacio = await p.textContent('#jrTable');
ok(/No queda ninguna importada sin completar/.test(vacio), 'el vacío se dice como un éxito', vacio.trim().slice(0, 64));
const t6 = await textoBoton();
ok(/Todas completadas/.test(t6), 'y el botón lo dice también', t6);
ok(await p.getAttribute('#jrColaNota', 'hidden') !== null, 'la nota de «no cuentan en R» desaparece', 'oculta');

console.log('\n═══ 7 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.length ? errs[0] : 'ninguno');

await b.close();
console.log(`\n${fallos.length ? '❌' : '✅'} cola-importadas · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
