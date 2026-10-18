/* BUSCAR Y ORDENAR EN EL JOURNAL · dos cosas que no existían.

   El journal tenía rango, cuenta, setup, instrumento y sesión, selección
   múltiple y borrado en masa — pero ninguna forma de BUSCAR un texto ni de
   ORDENAR por una columna. Con 300 operaciones eso significa que «¿cuáles
   fueron mis cinco peores?» y «¿esa vez que entré tarde en NQ?» sólo se
   responden leyendo la tabla a mano.

   Lo que se mide aquí, por orden de lo que podría costar dinero:

     · ORDENAR LA TABLA NO TOCA LAS MÉTRICAS. La curva de equity, el drawdown,
       las rachas y el calendario leen la MISMA lista que la tabla, y dependen
       de que venga en orden cronológico. Si el orden viviera en futFiltered()
       —el sitio obvio— ordenar por P&L habría reescrito la curva de equity en
       silencio. Esta es la aserción que de verdad protege algo.
     · la búsqueda entra en la clave de memoria de futFiltered(), o la segunda
       búsqueda devolvería el resultado de la primera;
     · una operación ABIERTA no tiene R ni P&L: va al final en los DOS
       sentidos, porque en «peores primero» mentiría;
     · varios términos son un AND, no un OR;
     · la búsqueda aparece como chip y «Ver todo» la quita. */
import { chromium } from 'playwright';
import { quieto, arrancada } from './espera.mjs';
const errs = [], fallos = [];
const F = new Date('2026-09-17T14:00:00Z').getTime();
const b = await chromium.launch();
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

/* MNQ a $2/punto. Entrada 21000, stop 20980 → riesgo $20 por contrato. */
const op = (id, extra) => Object.assign({
  id, type: 'futuros', accountId: 'a1', instrument: 'MNQ', direction: 'long',
  qty: 1, entry: 21000, stop: 20980, date: '2026-09-10', time: '10:00',
}, extra || {});

const TRADES = {
  // +$100 · la lección menciona «sesión», con acento
  t1: op('t1', { date: '2026-09-10', exit: 21050, quality: 'A', tags: 'disciplina', lesson: 'entré tarde en la sesión' }),
  // −$50 · MES, etiqueta «revenge»
  t2: op('t2', { date: '2026-09-12', instrument: 'MES', exit: 20995, quality: 'C', tags: 'revenge', lesson: '' }),
  // +$300 · la mejor
  t3: op('t3', { date: '2026-09-14', exit: 21150, quality: 'A', tags: 'plan', lesson: '' }),
  // −$200 · la peor cerrada
  t4: op('t4', { date: '2026-09-15', exit: 20900, quality: 'D', tags: '', lesson: '' }),
  // ABIERTA · sin salida, así que sin R ni P&L
  t5: op('t5', { date: '2026-09-16', exit: null, quality: 'B', tags: '', lesson: '' }),
};
const SEMILLA = { settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] }, trades: TRADES };

const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html'); await arrancada(p, '.tabbtn');
await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);

const ids = () => p.$$eval('#jrTable tbody tr[data-id]', n => n.map(x => x.dataset.id));
const n = async () => (await ids()).length;
const buscar = async v => { await p.fill('#ftQ', v); await quieto(p); };
// Por data-sort y no por el título: el atributo llega decodificado («P&L»),
// y la clave es lo que de verdad identifica la columna.
const cabecera = async key => {
  const h = await p.$(`#jrTable thead button[data-sort="${key}"]`);
  if (!h) throw new Error('sin encabezado ordenable: ' + key);
  await h.click(); await quieto(p);
};
// Huella de lo que NO debe moverse al ordenar: la curva de equity y el total.
const huella = () => p.evaluate(() => ({
  eq: (document.querySelector('#eqWrap svg path, #eqWrap svg polyline') || {}).outerHTML || '',
  total: FUT.calculateAccountStats('a1').jTotal,
}));

console.log('\n═══ 1 · la tabla arranca y se puede buscar ═══');
ok(await n() === 5, 'las 5 operaciones están en el journal', await n());
ok(!!(await p.$('#ftQ')), 'hay un buscador en la barra de filtros');

await buscar('MES');
ok(await n() === 1, 'buscar «MES» deja 1', await n());
await buscar('revenge');
ok(await n() === 1, 'busca en las etiquetas', await n());
await buscar('sesion');
ok(await n() === 1, 'busca SIN acentos: «sesion» encuentra «sesión»', await n());
await buscar('mnq');
const trasMnq = await n();
ok(trasMnq === 4, 'buscar «mnq» deja las 4 de MNQ (la memoria no devuelve el resultado anterior)', trasMnq);
await buscar('mes revenge');
ok(await n() === 1, 'dos términos que coinciden en la misma fila la dejan', await n());
await buscar('mnq revenge');
ok(await n() === 0, 'dos términos de filas distintas no devuelven nada: es AND, no OR', await n());
await buscar('zzzz');
ok(await n() === 0, 'una búsqueda sin coincidencias deja la tabla vacía', await n());

console.log('\n═══ 2 · la búsqueda es un filtro como los demás ═══');
await buscar('mnq');
const chips = await p.textContent('#ftFilters');
ok(/Búsqueda/.test(chips) && /mnq/.test(chips), 'aparece como chip de filtro activo', chips.replace(/\s+/g, ' ').trim().slice(0, 70));
await p.click('#ftFilters button[data-clr="all"]'); await quieto(p);
ok(await n() === 5, '«Ver todo» quita también la búsqueda', await n());
ok(await p.inputValue('#ftQ') === '', 'y vacía el campo, no sólo el estado', JSON.stringify(await p.inputValue('#ftQ')));

console.log('\n═══ 3 · ordenar por columna ═══');
ok((await ids()).join(',') === 't5,t4,t3,t2,t1', 'por defecto: fecha descendente', (await ids()).join(','));
const antes = await huella();

await cabecera('pnlEff');
let o = await ids();
ok(o[0] === 't3', 'por P&L: la mayor ganancia primero (+$300)', o.join(','));
ok(o[o.length - 1] === 't5', 'y la ABIERTA al final, que no tiene P&L', o.join(','));

await cabecera('pnlEff');
o = await ids();
ok(o[0] === 't4', 'segundo clic invierte: la mayor pérdida primero (−$200)', o.join(','));
ok(o[o.length - 1] === 't5', 'la abierta sigue al final: en «peores primero» mentiría', o.join(','));

await cabecera('quality');
o = await ids();
ok(o[0] === 't4', 'por calificación descendente empieza por la D', o.join(','));

await cabecera('instrument');
o = await ids();
ok(o[o.length - 1] === 't2', 'por instrumento descendente: MNQ antes que MES (t2)', o.join(','));
await cabecera('instrument');
o = await ids();
ok(o[0] === 't2', 'y ascendente lo invierte: MES primero', o.join(','));

console.log('\n═══ 4 · ordenar la tabla NO toca las métricas ═══');
const despues = await huella();
ok(antes.eq !== '' , 'control: la curva de equity se pintó', antes.eq ? 'sí' : 'VACÍA');
ok(despues.eq === antes.eq, 'la curva de equity es IDÉNTICA tras reordenar la tabla cuatro veces');
ok(despues.total === antes.total, 'y el total del journal no se mueve', `${antes.total} → ${despues.total}`);

await cabecera('date');
ok((await ids()).join(',') === 't5,t4,t3,t2,t1', 'volver a Fecha devuelve el orden cronológico', (await ids()).join(','));

console.log('\n═══ 5 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
