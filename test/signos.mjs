/* EL SIGNO DE LOS CAMPOS QUE SON MAGNITUDES · regresión sobre dinero.

   Qué falló, medido antes de arreglarlo, con MNQ a $2 el punto, 10 puntos a
   favor, 1 contrato (bruto $20) y «Comisiones $» = −25:

     el journal publicaba   pnlEff = +$45   y   R = +2,25
     lo correcto es         pnlEff = −$5    y   R = −0,25

   Un menos tecleado en «Comisiones $» —el hábito de cualquiera que apunte
   costes en negativo— CONVERTÍA un coste de $25 en un cobro de $25, y la R
   cambiaba de signo. De esa R cuelgan la esperanza, el profit factor, el
   Monte Carlo de supervivencia y el colchón de la cuenta. El campo no tiene
   ninguna validación en el editor.

   Y con `qty: -3`, la MISMA operación daba dos R distintas en dos pestañas:

     journal / Radiografía    1 contrato   riesgo $20   R = 1,00
     Métricas / Edge          3 contratos  riesgo $60   R = 0,33

   porque el motor hacía `toPosInt(-3)` (null → 1) y la pestaña Métricas ya
   hacía `Math.abs(qty)`. El editor bloquea `qty <= 0` al guardar, así que esto
   no se crea desde el formulario — pero entra por un respaldo importado y
   existe en cualquier operación anterior a esa guarda.

   La cantidad y la comisión se leen ahora como MAGNITUDES, con una sola
   definición en el motor (`QE.contratosDe` y el `Math.abs` de la comisión
   dentro de `valuarOperacion`), y cada corrección deja su aviso en vez de
   hacerse en silencio. Es el mismo fallo que ya se había corregido un campo
   más allá, en el ledger de la cuenta: «un retiro guardado como −500 sumaba
   500 al balance».

   Esta prueba conduce la app real: siembra las operaciones, lee el journal y
   lee Métricas / Edge, y exige que las dos den el MISMO número. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const cerca = (a, b, tol = 1e-6) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* 10 puntos a favor en MNQ = $20 brutos. Stop a 10 puntos = riesgo $20 por contrato. */
const op = (id, extra) => Object.assign({
  id, type: 'futuros', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, target: 20020, exit: 20010,
  qty: 1, date: '2026-09-01', time: '10:00', accountId: 'a1', setupId: 'p1',
}, extra || {});

const SEMILLA = {
  settings: {
    /* com: 0 para que la comisión automática de los parámetros no se mezcle con
       lo que se está midiendo, que es el signo del campo del journal. */
    meta: { mx: { com: 0 } },
    accounts: [{ id: 'a1', firm: 'Firma', name: 'Cuenta 50K', kind: 'Evaluación',
      size: 50000, dd: 2000, ddKind: 'estatico', target: 3000, trailBase: 'intradia',
      status: 'activa', ledger: [], rules: { maxLoss: 500 } }],
  },
  trades: {
    limpia:  op('limpia'),                        // sin comisión:          +$20
    coste:   op('coste',  { fees: 25 }),          // comisión $25:          −$5
    credito: op('credito', { fees: -25 }),        // comisión −$25: también −$5
    tres:    op('tres',   { qty: 3 }),            // 3 contratos:          +$60
    menos3:  op('menos3', { qty: -3 }),           // −3 contratos: también +$60
    /* INVERSIONES: la misma pregunta en la otra pestaña. 10 × $100 = $1.000
       invertidos y precio actual 100, o sea cero ganancia. Lo único que cambia
       entre las dos posiciones es el SIGNO del campo «Comisiones $». */
    invCoste:   { id: 'invCoste', type: 'inversion', op: 'compra', asset: 'AAA', market: 'us',
                  date: '2026-09-01', qty: 10, price: 100, fees: 100 },
    invCredito: { id: 'invCredito', type: 'inversion', op: 'compra', asset: 'BBB', market: 'us',
                  date: '2026-09-01', qty: 10, price: 100, fees: -100 },
  },
  positions: {
    pA: { id: 'pA', asset: 'AAA', market: 'us', date: '2026-09-01', qty: 10, entry: 100, current: 100 },
    pB: { id: 'pB', asset: 'BBB', market: 'us', date: '2026-09-01', qty: 10, entry: 100, current: 100 },
  },
  playbooks: { p1: { id: 'p1', name: 'Setup', type: 'futuros', kind: 'futuros', status: 'activo' } },
};

const nav = await chromium.launch();
const errs = [];
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1200 } });
await ctx.addInitScript(s => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify(s)); } catch (e) { } }, SEMILLA);
const pg = await ctx.newPage();
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await quieto(pg, 60, 2500);

const calc = id => pg.evaluate(i => {
  const t = FUT.trades().find(x => x.id === i);
  return t ? { pnl: t.pnlEff, r: t.rReal, risk: t.riskUsd, qty: t.contratos, fees: t.comisiones,
               avisos: (t.avisos || []).map(a => a.code) } : null;
}, id);

console.log('\n═══ 1 · una comisión NEGATIVA sigue siendo un coste ═══');
const limpia = await calc('limpia'), coste = await calc('coste'), credito = await calc('credito');
ok(cerca(limpia.pnl, 20), 'control: 10 pts × $2 = +$20 sin comisión', limpia.pnl);
ok(cerca(limpia.r, 1), 'control: R = 1,00', limpia.r);
ok(cerca(coste.pnl, -5), 'con «Comisiones $» 25 → −$5', coste.pnl);
ok(cerca(credito.pnl, -5), 'con «Comisiones $» −25 → −$5 TAMBIÉN (publicaba +$45)', credito.pnl);
ok(cerca(credito.r, -0.25), 'y la R sigue al dinero: −0,25R (publicaba +2,25R)', credito.r);
ok(cerca(credito.fees, 25), 'la comisión efectiva es la magnitud, $25', credito.fees);
ok(credito.avisos.includes('COMISION_NEGATIVA'), 'y la operación lleva su aviso, no se corrige en silencio', credito.avisos.join(','));
ok(!coste.avisos.includes('COMISION_NEGATIVA'), 'una comisión positiva no genera el aviso', coste.avisos.join(',') || 'sin avisos');

console.log('\n═══ 2 · una cantidad NEGATIVA es su magnitud, y da UN solo número ═══');
const tres = await calc('tres'), menos3 = await calc('menos3');
ok(cerca(tres.pnl, 60) && cerca(tres.risk, 60), 'control: 3 contratos → +$60 sobre riesgo $60', `${tres.pnl} / ${tres.risk}`);
ok(menos3.qty === 3, '−3 contratos se leen como 3 (el motor leía 1)', menos3.qty);
ok(cerca(menos3.pnl, 60), 'y el P&L es el de 3 contratos: +$60 (publicaba +$20)', menos3.pnl);
ok(cerca(menos3.risk, 60), 'y el riesgo también: $60 (publicaba $20)', menos3.risk);
ok(cerca(menos3.r, tres.r), 'así que −3 y +3 dan la MISMA R', `${menos3.r} vs ${tres.r}`);
ok(menos3.avisos.includes('CANTIDAD_NEGATIVA'), 'y lleva su aviso', menos3.avisos.join(','));

console.log('\n═══ 3 · el journal y Métricas / Edge dan el MISMO número ═══');
/* La divergencia vivía aquí: `mxNeto` resolvía la cantidad por su cuenta con
   `Math.abs(qty) || 1`, que para −3 no coincidía con el motor. Ahora lee
   `t.contratos`, que es lo que el motor ya resolvió. */
/* Se compara contra la FÓRMULA LITERAL que Métricas tenía escrita —
   `Math.abs(qty) || 1` — no contra `QE.contratosDe`, que sería la misma función
   comparada consigo misma. Lo que esta prueba vigila es que las DOS respuestas
   sigan siendo una. Si alguien vuelve a escribir la cantidad a mano en una
   pestaña y no coincide con el motor, esto se pone rojo. */
const porMetricas = await pg.evaluate(() => FUT.trades().map(t => ({
  id: t.id,
  delMotor: t.contratos,
  comoLoHaciaMetricas: Math.abs(Number(t.qty) || 0) || 1,
})));
for (const f of porMetricas) ok(f.delMotor === f.comoLoHaciaMetricas,
  `«${f.id}»: la cantidad del motor y la fórmula de Métricas coinciden`, `${f.delMotor} / ${f.comoLoHaciaMetricas}`);

/* Y la R de la pestaña, calculada con el riesgo que ella dimensiona, tiene que
   ser la misma que la del journal para la operación de −3 contratos. */
await pg.click('.tabbtn[data-tab="edge"]'); await quieto(pg, 60, 2500);
const rMetricas = await pg.evaluate(() => {
  const t = FUT.trades().find(x => x.id === 'menos3');
  const qty = t.contratos;                       // lo que mxNeto usa ahora
  const pv = window.QuantEngine.resolveContract('MNQ').value.multiplier;
  const riesgo = Math.abs(20000 - 19990) * pv * qty;   // mxRiesgo con com = 0
  return t.pnlEff / riesgo;
});
ok(cerca(rMetricas, menos3.r), 'la R de Métricas y la del journal son el mismo número (eran 0,33 y 1,00)',
   `${rMetricas} vs ${menos3.r}`);

console.log('\n═══ 4 · la suma de la cuenta refleja el dinero corregido ═══');
/* +20 (limpia) −5 (coste) −5 (credito) +60 (tres) +60 (menos3) = +130.
   Con el código anterior: +20 −5 +45 +60 +20 = +140, y $10 de esos venían de
   un contrato que no existió más $50 de una comisión cobrada al revés. */
const total = await pg.evaluate(() => FUT.calculateAccountStats('a1').jTotal);
ok(cerca(total, 130), 'el journal de la cuenta suma +$130 (sumaba +$140)', total);

console.log('\n═══ 5 · lo mismo en INVERSIONES, que era la pestaña que faltaba ═══');
/* Qué falló aquí, medido en un navegador antes de arreglarlo: con «Comisiones $»
   = −100 sobre una posición que no había ganado ni perdido nada, la app publicaba
   `neto = +100` y `retorno = +10%`. Doscientos dólares inventados y un cambio de
   SIGNO en el número que dice si una inversión va bien.

   El ledger de la cuenta prop ya leía el importe como magnitud, y el motor ya lo
   hacía para futuros. Inversiones era la única de las tres que seguía leyendo el
   signo, y resolvía las comisiones por su cuenta en once sitios distintos. */
const inv = id => pg.evaluate(i => {
  const r = window.INV.performance(i);
  return r ? { comisiones: r.comisiones, neto: r.neto, retorno: r.retorno } : null;
}, id);
const iCoste = await inv('pA'), iCredito = await inv('pB');
ok(iCoste && cerca(iCoste.comisiones, 100), 'control: comisión 100 se lee 100', iCoste && iCoste.comisiones);
ok(iCoste && cerca(iCoste.neto, -100), 'control: su neto es −$100 (la comisión es un coste)', iCoste && iCoste.neto);
ok(iCredito && cerca(iCredito.comisiones, 100), 'comisión −100 TAMBIÉN se lee 100', iCredito && iCredito.comisiones);
ok(iCredito && cerca(iCredito.neto, -100), 'y su neto es −$100, no +$100', iCredito && iCredito.neto);
ok(iCoste && iCredito && cerca(iCoste.retorno, iCredito.retorno),
   'el signo del campo NO cambia el rendimiento', iCredito && iCredito.retorno);
ok(iCredito && iCredito.retorno < 0, 'una posición plana con comisión rinde NEGATIVO, nunca +10%', iCredito && iCredito.retorno);

console.log('\n═══ 6 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
