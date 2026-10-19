/* LA COLA DE LO QUE FALTA REVISAR · acordarse no escala.

   La revisión por operación existía y su formulario estaba, pero NADA decía qué
   operaciones cerradas se habían quedado sin revisar. Dependía de la memoria, y
   es el mismo razonamiento que la fase 5 de `docs/IMPORTAR.md` aplica a las
   operaciones incompletas: lo que no se enseña, no se hace.

   Lo que esta prueba fija, y que es fácil de romper sin darse cuenta:

       · las operaciones ABIERTAS no entran en la cola — no hay nada que
         revisar en ellas, y meterlas haría del contador ruido permanente
       · el contador se cuenta sobre los DEMÁS filtros, no sobre lo que el
         propio interruptor deja ver
       · guardar una revisión baja la cola EN EL MOMENTO, sin recargar: eso
         cuelga de que Estudio sea una zona del registro, que es lo que se
         arregló en #39 y #40
       · el interruptor entra en «Limpiar filtros», que es el fallo que la
         revisión cazó en el modo demo con `ft.q`
       · quedarse sin cola es un ÉXITO y se dice como tal, no como un filtro
         que no encuentra nada */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar } from './espera.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const F = new Date('2026-09-17T14:00:00Z').getTime();
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };
const op = (id, instr, exit, date) => ({
  id, type: 'futuros', accountId: 'a1', instrument: instr, direction: 'long',
  qty: 1, entry: 21000, stop: 20980, exit, date, time: '10:00',
});

const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  trades: {
    t1: op('t1', 'MNQ', 21050, '2026-09-14'),   // cerrada, SIN revisión
    t2: op('t2', 'MES', 20995, '2026-09-15'),   // cerrada, CON revisión
    t3: op('t3', 'CL', 21100, '2026-09-16'),    // cerrada, SIN revisión
    t4: op('t4', 'MYM', null, '2026-09-16'),    // ABIERTA: no cuenta
  },
  research: {
    r2: {
      id: 'r2', type: 'trade-review', tradeId: 't2', title: 'Revisión: MES',
      status: 'review', question: 'plan', evidence: 'ejecución', conclusion: 'lección',
      tags: ['trade-review', 'MES'], createdAt: F, updatedAt: F,
    },
  },
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html');
await arrancada(p, '.tabbtn');
await p.click('.tabbtn[data-tab="estudio"]');
await quieto(p);

const rotulo = () => p.textContent('#studyTradeSinRevisar').then(t => t.trim());
const listados = () => p.$$eval('#studyTradeList button[data-study-trade]', n => n.map(x => x.dataset.studyTrade));
const marcadas = () => p.$$eval('#studyTradeList button[data-study-trade]',
  n => n.filter(x => /sin revisar/i.test(x.textContent)).map(x => x.dataset.studyTrade));
const pulsado = () => p.getAttribute('#studyTradeSinRevisar', 'aria-pressed');

console.log('\n═══ 1 · la cola cuenta las cerradas sin revisar, y sólo ésas ═══');
/* Primero que el control EXISTA. Sin esto, contra un index.html que no lo
   tiene la prueba se cuelga 30 s en el primer `textContent` y el log dice
   «Timeout» en vez de «falta el interruptor», que es lo que hay que leer. */
if (!await p.$('#studyTradeSinRevisar')) {
  ok(false, 'existe el interruptor «Sólo sin revisar»', 'NO está en el index.html');
  console.log(`\n❌ revisiones · ${fallos.length} fallos`);
  await b.close(); process.exit(1);
}
ok(true, 'existe el interruptor «Sólo sin revisar»', 'presente');
let l = await listados();
ok(l.length === 4, 'control: las 4 operaciones están listadas', l.join(','));
ok(/\(2\)/.test(await rotulo()), 'el interruptor dice 2, no 3 ni 4', await rotulo());
let m = await marcadas();
ok(m.length === 2 && m.includes('t1') && m.includes('t3'), 'marcadas t1 y t3', m.join(',') || 'ninguna');
ok(!m.includes('t2'), 'la que tiene revisión no está marcada', m.join(','));
ok(!m.includes('t4'), 'la ABIERTA no está marcada: no hay nada que revisar', m.join(','));

console.log('\n═══ 2 · el interruptor deja sólo la cola ═══');
await p.click('#studyTradeSinRevisar'); await quieto(p);
ok(await pulsado() === 'true', 'queda pulsado', await pulsado());
l = await listados();
ok(l.length === 2 && !l.includes('t2') && !l.includes('t4'), 'la lista baja a t1 y t3', l.join(','));
ok(/\(2\)/.test(await rotulo()), 'y el contador NO se recalcula sobre sí mismo', await rotulo());

console.log('\n═══ 3 · «Limpiar filtros» suelta el interruptor ═══');
await p.click('#studyTradeClear'); await quieto(p);
ok(await pulsado() === 'false', 'deja de estar pulsado', await pulsado());
l = await listados();
ok(l.length === 4, 'y vuelven las 4', l.join(','));

console.log('\n═══ 4 · guardar una revisión baja la cola en el momento, sin recargar ═══');
await p.click('#studyTradeList button[data-study-trade="t1"]'); await quieto(p);
await p.fill('#studyTradeLesson', 'perseguí una tendencia agotada');
await p.click('#studyTradeReviewForm button[type="submit"]'); await trasGuardar(p);
ok(/\(1\)/.test(await rotulo()), 'el contador pasa a 1', await rotulo());
m = await marcadas();
ok(!m.includes('t1'), 'y t1 pierde su marca', m.join(',') || 'ninguna');
ok(m.includes('t3'), 'mientras t3 la conserva', m.join(',') || 'ninguna');

/* El mensaje de cola vacía SÓLO se alcanza revisando la última mientras
   filtras: con la cola a cero el interruptor se desactiva, a propósito, para no
   ofrecer un filtro que no enseñaría nada. La primera versión de esta prueba
   intentaba pulsarlo desde apagado y se quedó colgada 30 s — el test estaba
   equivocado, no el botón. */
console.log('\n═══ 5 · revisar la última mientras filtras: la cola se vacía ═══');
await p.click('#studyTradeSinRevisar'); await quieto(p);
l = await listados();
ok(l.length === 1 && l[0] === 't3', 'filtrando queda sólo t3', l.join(',') || 'vacío');
await p.fill('#studyTradeLesson', 'entré sin confirmación');
await p.click('#studyTradeReviewForm button[type="submit"]'); await trasGuardar(p);
ok(/revisadas/i.test(await rotulo()), 'el interruptor dice que están todas revisadas', await rotulo());
const vacio = (await p.textContent('#studyTradeList')).replace(/\s+/g, ' ').trim();
ok(/No queda ninguna sin revisar/i.test(vacio), 'y el vacío no parece un error', vacio.slice(0, 90));
/* «Las 3 CERRADAS», no «las 4»: una de las cuatro de la vista está abierta y no
   tiene revisión ni la necesita, así que contarla sería una mentira pequeña. */
ok(/3 cerradas de esta vista tienen su revisión/i.test(vacio), 'cuenta las cerradas, no las abiertas', vacio.slice(0, 120));

console.log('\n═══ 6 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n${fallos.length ? '❌' : '✅'} revisiones · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
