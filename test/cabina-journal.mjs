/* CABINA Y FUTUROS, UNA SOLA VERDAD · el día dejaba de seguir al journal.

   La Cabina muestra el resultado del día y cuántas operaciones hubo, y los
   deriva del journal de futuros con `syncDayFromTrades()`. Pero esa función
   empieza así:

       const g = futDayAgg(d.date);
       if (!g.closed) return;          // ← sin operaciones CERRADAS, no toca nada

   `g.closed` es cuántas operaciones cerradas tiene el día. La guarda existe
   para no escribir un 0 sobre un día que todavía no ha cerrado nada — pero
   también se dispara cuando el día SE QUEDA sin operaciones cerradas porque
   las borras. Entonces la función vuelve sin hacer nada y la Cabina conserva
   el resultado anterior.

   Medido antes de arreglarlo: un día con una operación de +$100, borrada desde
   el journal. El journal queda a 0 operaciones; la Cabina seguía diciendo
   «Resultado $100 · 1 operación». Dos pantallas de la misma app contando cosas
   distintas del mismo día, y la que miras por la mañana es la que miente.

   No se puede distinguir «aún no hay nada cerrado» de «ya no hay nada» mirando
   sólo `g.closed`; hay que mirar también si el día TIENE operaciones. Con 0
   operaciones en total, el día derivado vuelve a cero. Si hay operaciones pero
   ninguna cerrada, la guarda sigue siendo correcta y no se toca. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar } from './espera.mjs';
const errs = [], fallos = [];
const F = new Date('2026-09-17T14:00:00Z').getTime();
const b = await chromium.launch();
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };
const HOY = '2026-09-17';

// +50 puntos en MNQ a $2/punto = +$100. Entrada 21000, stop 20980.
const op = (id, extra) => Object.assign({
  id, type: 'futuros', accountId: 'a1', instrument: 'MNQ', direction: 'long',
  qty: 1, entry: 21000, stop: 20980, exit: 21050, date: HOY, time: '10:00',
}, extra || {});

async function pagina(semilla) {
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(semilla))});}catch(e){}`);
  await p.goto('file://' + process.cwd() + '/../index.html'); await arrancada(p, '.tabbtn');
  return p;
}
const base = trades => ({ settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] }, trades });
// `$` vive dentro del IIFE de la app, no es global: se leen los campos del DOM.
const dia = p => p.evaluate(() => ({
  result: document.getElementById("jResult").value,
  trades: document.getElementById("jTrades").value,
}));
const filas = p => p.$$eval('#jrTable tbody tr[data-id]', n => n.length);

console.log('\n═══ 1 · la Cabina toma el resultado del journal ═══');
const p = await pagina(base({ t1: op('t1'), t2: op('t2', { exit: 21025 }) }));  // +$100 y +$50
let d = await dia(p);
ok(d.result === '150', 'el día deriva +$150 de las dos operaciones', JSON.stringify(d));
ok(d.trades === '2', 'y dice 2 operaciones', d.trades);

console.log('\n═══ 2 · borrar UNA se refleja ═══');
await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
await p.click('#selbtn-jrTable'); await quieto(p);
await p.click('#jrTable tr[data-id="t2"]'); await quieto(p);
await p.click('[data-sel="borrar"]'); await quieto(p);
await p.click('[data-sel="si"]'); await trasGuardar(p);
ok(await filas(p) === 1, 'control: queda 1 en el journal', await filas(p));
await p.click('.tabbtn[data-tab="cabina"]'); await quieto(p);
d = await dia(p);
ok(d.result === '100', 'la Cabina baja a +$100', JSON.stringify(d));
ok(d.trades === '1', 'y a 1 operación', d.trades);

console.log('\n═══ 3 · borrar la ÚLTIMA también (aquí se quedaba atrás) ═══');
await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
await p.click('#selbtn-jrTable'); await quieto(p);
await p.click('#jrTable tr[data-id="t1"]'); await quieto(p);
await p.click('[data-sel="borrar"]'); await quieto(p);
await p.click('[data-sel="si"]'); await trasGuardar(p);
ok(await filas(p) === 0, 'control: el journal queda vacío', await filas(p));
await p.click('.tabbtn[data-tab="cabina"]'); await quieto(p);
d = await dia(p);
ok(d.result === '0' || d.result === '', 'la Cabina ya NO dice $100 sobre un día sin operaciones', JSON.stringify(d));
ok(d.trades === '0' || d.trades === '', 'y las operaciones vuelven a 0', JSON.stringify(d));

console.log('\n═══ 4 · un día con operaciones ABIERTAS no se pisa con un 0 ═══');
const p2 = await pagina(base({ a1: op('a1', { exit: null }) }));   // abierta: sin P&L
const d2 = await dia(p2);
ok(d2.result === '', 'con una operación abierta el resultado se queda vacío, no 0', JSON.stringify(d2));

console.log('\n═══ 5 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
