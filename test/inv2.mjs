/* RENDIMIENTO INDIVIDUAL DE UNA INVERSIÓN · los tests 1-10 del encargo.

   La pregunta que existe para responder: ¿de DÓNDE vino el dinero? Un solo
   número («+20.9%») no lo dice, y de dónde vino es lo que decide si repetir la
   operación. Las cinco piezas tienen que sumar exactamente. */
import { chromium } from 'playwright';
const errs = [], fallos = [];
const F = new Date('2026-09-18T14:00:00Z').getTime();
const b = await chromium.launch();
const SEM = { settings: { meta: {}, accounts: [], rules: [] } };
const p = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html'); await p.waitForTimeout(1300);

const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const cerca = (a, e, tol = 0.005) => a != null && Math.abs(a - e) <= tol;
const perf = () => p.evaluate(() => INV.performance('pos_aapl'));
const op = (o) => p.evaluate(x => INV.createTransaction(x), Object.assign({ asset: 'AAPL', market: 'acciones' }, o));

console.log('\n═══ TESTS 1-5 · cartera, activo, dos compras, coste medio ═══');
await p.evaluate(() => INV.createPosition({ id: 'pos_aapl', asset: 'AAPL', market: 'acciones', thesis: 'Núcleo' }));
await op({ id: 'c1', op: 'compra', date: '2026-01-10', qty: 5, price: 180 });
await op({ id: 'c2', op: 'compra', date: '2026-02-10', qty: 5, price: 210 });
await p.waitForTimeout(400);
let r = await perf();
ok(r.cantidad === 10, 'cantidad = 10', r.cantidad);
ok(r.costeBase === 1950, 'coste total = $1,950', r.costeBase);
ok(r.costeMedio === 195, 'coste medio = $195', r.costeMedio);

console.log('\n═══ TESTS 6-8 · venta parcial: realizado y no realizado separados ═══');
/* El ejemplo literal del encargo: 10 @ $180, vende 4 @ $240, quedan 6 y el
   precio está a $245.  Realizado 4×60=$240 · No realizado 6×65=$390 */
await p.evaluate(() => { INV.deleteTransaction('c1'); INV.deleteTransaction('c2'); });
await op({ id: 'b1', op: 'compra', date: '2026-01-10', qty: 10, price: 180 });
await op({ id: 's1', op: 'venta',  date: '2026-05-10', qty: 4,  price: 240 });
await p.evaluate(() => INV.updatePosition('pos_aapl', { current: 245 }));
await p.waitForTimeout(400);
r = await perf();
ok(r.cantidad === 6, 'quedan 6 acciones', r.cantidad);
ok(cerca(r.realizado, 240), 'realizado = 4 × ($240−$180) = $240', r.realizado);
ok(cerca(r.noRealizado, 390), 'no realizado = 6 × ($245−$180) = $390', r.noRealizado);
ok(cerca(r.neto, 630), 'total = $630', r.neto);

console.log('\n═══ TESTS 9-10 · dividendo y comisión, cada uno en su línea ═══');
await op({ id: 'd1', op: 'dividendo', date: '2026-06-01', pnl: 48.20 });
await p.evaluate(() => INV.updateTransaction('s1', { fees: 3.50 }));
await p.waitForTimeout(400);
r = await perf();
ok(cerca(r.dividendos, 48.20), 'dividendos = $48.20 — antes NO contaban aquí', r.dividendos);
ok(cerca(r.comisiones, 3.50), 'comisiones = $3.50, restadas aparte', r.comisiones);
ok(cerca(r.neto, 390 + 240 + 48.20 - 3.50), 'las cinco piezas suman exactamente', 
   `${r.noRealizado} + ${r.realizado} + ${r.dividendos} − ${r.comisiones} = ${r.neto}`);
ok(cerca(r.retorno, (390 + 240 + 48.2 - 3.5) / 1800, 1e-6),
   'y el retorno se mide sobre lo INVERTIDO ($1,800), no sobre lo que queda',
   `${(r.retorno * 100).toFixed(2)}% sobre ${r.invertido}`);

console.log('\n═══ el caso que hoy da un número falso ═══');
await p.evaluate(() => {
  INV.createPosition({ id: 'pos_schd', asset: 'SCHD', market: 'etfs', current: 102 });
  INV.createTransaction({ id: 'sc1', type: 'inversion', asset: 'SCHD', market: 'etfs', op: 'compra', date: '2025-01-10', qty: 100, price: 100 });
  for (const [i, d] of ['2025-04-01','2025-07-01','2025-10-01','2026-01-05'].entries())
    INV.createTransaction({ id: 'sd' + i, type: 'inversion', asset: 'SCHD', market: 'etfs', op: 'dividendo', date: d, pnl: 100 });
});
await p.waitForTimeout(500);
const sc = await p.evaluate(() => INV.performance('pos_schd'));
ok(cerca(sc.noRealizado, 200), 'el precio subió $200 (2%)', sc.noRealizado);
ok(cerca(sc.dividendos, 400), 'pero pagó $400 en dividendos', sc.dividendos);
ok(cerca(sc.retorno, 0.06, 1e-9), 'el retorno real es 6%, no 2%', (sc.retorno * 100).toFixed(2) + '%');

console.log('\n═══ posición cerrada del todo ═══');
await p.evaluate(() => {
  INV.createPosition({ id: 'pos_x', asset: 'XYZ', market: 'acciones' });
  INV.createTransaction({ id: 'x1', type: 'inversion', asset: 'XYZ', market: 'acciones', op: 'compra', date: '2025-03-01', qty: 10, price: 50 });
  INV.createTransaction({ id: 'x2', type: 'inversion', asset: 'XYZ', market: 'acciones', op: 'venta',  date: '2025-09-01', qty: 10, price: 70 });
});
await p.waitForTimeout(500);
const x = await p.evaluate(() => INV.performance('pos_x'));
ok(x.cerrada === true && x.cantidad === 0, 'cantidad 0 y marcada como cerrada', `${x.cantidad} · cerrada=${x.cerrada}`);
ok(cerca(x.realizado, 200) && cerca(x.neto, 200), 'pero su realizado sigue contando: +$200',
   `realizado ${x.realizado} · neto ${x.neto}`);

console.log('\n═══ la cartera y la posición no pueden discrepar ═══');
/* El defecto que se vio en una captura: la tabla de posiciones decía SCHD
   +6.0% y el gráfico «Rendimiento por posición», tres paneles más arriba,
   decía 2.0%. La misma posición, dos números, en la misma pantalla. Y la
   tarjeta «Realizado · ventas y cobros cerrados» enseñaba sólo los cobros:
   la ganancia de una venta se deduce del coste medio, no se escribe a mano.

   Este bloque ata las dos vistas a la misma fuente. Si vuelven a separarse,
   falla aquí y no en una captura. */
const cart = await p.evaluate(() => INV.portfolio());
const todas = await p.evaluate(() => INV.positions().map(x => INV.performance(x.id)));
const sumaVentas = todas.reduce((a, x) => a + x.realizado, 0);
const sumaDivs   = todas.reduce((a, x) => a + x.dividendos, 0);
ok(cerca(cart.ventas, sumaVentas, 0.02),
   'el realizado de la cartera = suma del realizado de cada posición',
   `cartera ${cart.ventas.toFixed(2)} · posiciones ${sumaVentas.toFixed(2)}`);
ok(cerca(cart.income, sumaDivs, 0.02),
   'los cobros de la cartera = suma de los dividendos de cada posición',
   `cartera ${cart.income.toFixed(2)} · posiciones ${sumaDivs.toFixed(2)}`);
ok(cerca(cart.realized, sumaVentas + sumaDivs, 0.02),
   'realizado total = ventas + cobros, y ninguna se cuenta dos veces',
   cart.realized.toFixed(2));
ok(sumaVentas > 0, 'y las ventas pesan de verdad (antes salían como $0)', sumaVentas.toFixed(2));

/* El gráfico tiene que enseñar el MISMO porcentaje que la tabla. */
await p.click('.tabbtn[data-tab="invest"]'); await p.waitForTimeout(900);
const meta = await p.evaluate(() => { const e = document.getElementById('ivPerfMeta'); return e ? e.textContent : ''; });
const schd = todas.find(x => x.activo === 'SCHD');
ok(meta.includes((schd.retorno * 100).toFixed(1) + '%'),
   'el gráfico enseña el neto de SCHD, no sólo la subida del precio',
   `«${meta.trim()}» vs tabla ${(schd.retorno * 100).toFixed(1)}%`);

console.log('\n═══ el IRR de la cartera ve los dividendos ═══');
/* Los flujos que la app mandaba al motor calculaban el importe como
   qty × price + fees. Un dividendo no tiene cantidad ni precio — su importe
   vive en `pnl` — así que salía cero y el filtro lo tiraba antes de llegar al
   motor. El titular de toda la pestaña se calculaba sin un solo dividendo. */
const c2 = (await p.evaluate(() => INV.portfolio())).cartera;
const divsTotales = todas.reduce((a, x) => a + x.dividendos, 0);
ok(c2 && c2.recuperado != null, 'el motor devuelve flujos analizables', c2 && c2.recuperado);
const ventasBrutas = await p.evaluate(() => INV.transactions().filter(t => t.op === 'venta')
  .reduce((a, t) => a + (t.qty || 0) * (t.price || 0) - (t.fees || 0), 0));
ok(cerca(c2.recuperado, ventasBrutas + divsTotales, 0.02),
   'lo recuperado = ventas netas de comisión + dividendos',
   `motor ${c2.recuperado} · ventas ${ventasBrutas.toFixed(2)} + cobros ${divsTotales.toFixed(2)}`);
ok(c2.recuperado > ventasBrutas + 0.01,
   'y pesa de verdad: sin el arreglo lo recuperado eran sólo las ventas',
   `${(c2.recuperado - ventasBrutas).toFixed(2)} que antes se perdían`);

/* Un solo retorno simple. La tarjeta enseñaba el de la app (sobre el coste de
   lo que sigue abierto) y la nota «difieren N pts» medía contra el del motor
   (sobre todo lo aportado): dos bases distintas, una sola frase. */
const port = await p.evaluate(() => INV.portfolio());
ok(cerca(port.totalRet, port.cartera.retornoSimple, 1e-9),
   'el retorno simple de la cartera es UNO, el del motor',
   `app ${port.totalRet} · motor ${port.cartera.retornoSimple}`);
ok(cerca(port.cartera.brecha, port.cartera.irrAnual - port.totalRet, 1e-6),
   'y la brecha mide contra ESE, no contra otro',
   `brecha ${port.cartera.brecha}`);

console.log('\n──────────────────────────────────────────');
console.log('  fallos:', fallos.length, fallos.length ? '→ ' + fallos.join(' · ') : '');
console.log('  errores JS:', errs.length, errs.length ? '\n   ' + errs.join('\n   ') : '');
await b.close();
process.exit(fallos.length || errs.length ? 1 : 0);
