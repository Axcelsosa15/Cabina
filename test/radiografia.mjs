/* RADIOGRAFÍA (Futuros → Resumen) · lo que pinta y lo que ya NO repite.

   Caída máxima y Sharpe viven en Métricas / Edge, netos y sobre el capital de la
   cuenta. La Radiografía los pintaba otra vez, en bruto y sobre $25.000 fijos:
   dos Sharpe distintos para la misma operativa. Aquí se comprueba que:
     · esas dos tarjetas ya no salen, y la pantalla dice dónde están;
     · úlcera y Sortino se miden sobre el capital REAL de las cuentas del filtro;
     · sin cuenta no hay capital, y esas dos tarjetas no se inventan uno;
     · el ejemplo en rojo sigue funcionando. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const op = (id, fecha, salida, extra = {}) => Object.assign({ id, type: 'futuros', instrument: 'MNQ', direction: 'long', entry: 20000, stop: 19990,
  exit: salida, qty: 1, date: fecha, time: '10:00', accountId: 'a1' }, extra);
const DIAS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-08'];
const SALIDAS = [20020, 19990, 20020, 19990, 20010, 20015];
const semilla = (conCuenta) => ({
  settings: {
    accounts: [{ id: 'a1', firm: 'Firma', name: 'Cuenta 50K', kind: 'Evaluación', size: 50000, dd: 2000, ddKind: 'estatico', target: 3000,
      trailBase: 'intradia', status: 'activa', ledger: [] }],
  },
  trades: Object.fromEntries(DIAS.map((d, i) => [`t${i}`, op(`t${i}`, d, SALIDAS[i], conCuenta ? {} : { accountId: '' })])),
});

const nav = await chromium.launch();
const errs = [];
async function pagina(s) {
  const ctx = await nav.newContext();
  await ctx.addInitScript(x => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify(x)); } catch (e) { } }, s);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await pg.click('.tabbtn[data-tab="futuros"]'); await quieto(pg, 60, 2500);
  return pg;
}
const panel = pg => pg.evaluate(() => (document.getElementById('qePanel') || {}).textContent || '');
const tarjetas = pg => pg.evaluate(() => [...document.querySelectorAll('#qePanel .qk')].map(e => e.textContent));

console.log('\n═══ CON CUENTA · capital real, sin tarjetas repetidas ═══');
{
  const pg = await pagina(semilla(true));
  const t = await panel(pg);
  ok(/Ventaja medida/.test(t), 'la Radiografía se pinta', t.slice(0, 60).replace(/\s+/g, ' '));
  ok(/Riesgo de la curva/.test(t), 'con su bloque de riesgo de la curva');
  const k = await tarjetas(pg);
  ok(!k.some(x => /Sharpe/.test(x)), 'Sharpe ya NO se repite aquí', k.join(' · '));
  ok(!k.includes('Caída máxima'), 'caída máxima tampoco');
  ok(/están en Métricas \/ Edge/.test(t), 'y la pantalla dice dónde están');
  ok(/Días bajo el agua/.test(t) && /Factor de recuperación/.test(t), 'lo que no depende del capital sigue: días bajo el agua y factor de recuperación');
  ok(/Sortino/.test(t) && /Índice de úlcera/.test(t), 'úlcera y Sortino salen: hay capital');
  ok(/sobre \$50,000/.test(t), 'y se miden sobre los $50.000 de la cuenta, no sobre $25.000 fijos', (t.match(/sobre \$[\d,]+/) || [''])[0]);
  ok(!/sobre \$25,000/.test(t), 'el capital inventado ya no aparece');

  await pg.evaluate(() => FUT.setSelectedAccount('a1')); await quieto(pg);
  const t2 = await panel(pg);
  ok(/sobre \$50,000/.test(t2), 'filtrando por la cuenta, el mismo capital');
  ok(/Supervivencia de la cuenta/.test(t2) && /2\.000 caminos/.test(t2), 'y aparece la simulación de supervivencia de esa cuenta');
  await pg.context().close();
}

console.log('\n═══ SIN CUENTA · no se inventa un capital ═══');
{
  const pg = await pagina(semilla(false));
  const t = await panel(pg);
  ok(/Riesgo de la curva/.test(t), 'el bloque sale igual');
  ok(/Días bajo el agua/.test(t), 'con lo que no necesita capital');
  ok(!/Índice de úlcera/.test(t) && !/Sortino/.test(t), 'pero sin úlcera ni Sortino: sin capital serían % de nada');
  await pg.context().close();
}

console.log('\n═══ EJEMPLO EN ROJO ═══');
{
  const pg = await pagina({ settings: {}, trades: {} });
  ok(/El motor no inventa una ventaja/.test(await panel(pg)), 'sin operaciones lo dice');
  await pg.click('#qeDemoBtn'); await quieto(pg);
  const t = await panel(pg);
  ok(/estos NO son tus datos/.test(t), 'el ejemplo se marca como ejemplo');
  ok(/Supervivencia de la cuenta/.test(t) && /Cuenta de ejemplo 25K/.test(t), 'y simula sobre su cuenta de ejemplo');
  await pg.context().close();
}

console.log('\n═══ UN P&L A MANO · la R lo sigue en las DOS pestañas ═══');
/* El caso que rompía: apuntas el precio de salida y luego corriges el P&L a mano
   con lo que de verdad liquidó el broker (slippage). La R salía de los precios,
   así que la misma operación valía −$7 y +10R a la vez, y la Radiografía
   presumía de una esperanza de +4,5R sobre un sistema perdedor. */
{
  const pg = await pagina({
    settings: { meta: { mx: { com: 0 } }, accounts: [{ id: 'a1', firm: 'Firma', name: 'Cuenta 50K', kind: 'Evaluación',
      size: 50000, dd: 2000, ddKind: 'estatico', trailBase: 'intradia', target: 3000, limit: 30, status: 'activa', ledger: [] }] },
    trades: {
      s1: { id: 's1', type: 'futuros', accountId: 'a1', instrument: 'MNQ', date: '2026-09-21', time: '10:00',
            direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21100, pnl: -7 },
      s2: { id: 's2', type: 'futuros', accountId: 'a1', instrument: 'MNQ', date: '2026-09-22', time: '10:00',
            direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 20990 },
    },
  });
  const t = await pg.evaluate(() => { const x = FUT.trades().find(y => y.id === 's1'); return { pnl: x.pnlEff, r: x.rReal, riesgo: x.riskUsd }; });
  ok(t.pnl === -7 && t.riesgo === 20, 'la operación trae el P&L reportado y su riesgo', `pnl ${t.pnl} · riesgo ${t.riesgo}`);
  ok(t.r === -0.35, 'su R sale del P&L reportado (−7/20), no de los precios (+10)', `R ${t.r}`);
  ok(t.pnl < 0 && t.r < 0, 'el P&L y la R nunca tienen signos opuestos');
  const radio = await pg.evaluate(() => {
    const cerradas = FUT.trades().filter(x => x.pnlEff != null);
    const e = window.QuantEngine.analizarEdge(cerradas.map(x => ({ pnl: x.pnlEff, r: x.rReal, fecha: x.date }))).value;
    return e.esperanzaR && e.esperanzaR.valor;
  });
  await pg.click('.tabbtn[data-tab="edge"]'); await quieto(pg, 60, 2500);
  const mxER = await pg.evaluate(() => { const el = document.querySelector('[data-k="expectancyR"]'); return el ? Number(el.dataset.v) : null; });
  ok(Math.abs(radio - mxER) < 1e-6, 'Radiografía y Métricas dan la MISMA esperanza en R', `radiografía ${radio} · métricas ${mxER}`);
  ok(radio < 0, 'y es negativa: un sistema perdedor no se lee como ventaja', `${radio}`);
  await pg.context().close();
}

console.log('\n═══ PASARSE DEL STOP ES UNA PREGUNTA DE PRECIO ═══');
/* Al hacer que la R siga al P&L, un stop LIMPIO con comisiones caras sale a
   −1,4R de dinero y se habría acusado de pasarse del stop sin haberlo pasado.
   Son dos preguntas: el dinero lo mueve una comisión, el precio no. */
{
  const pg = await pagina({
    settings: { accounts: [{ id: 'a1', firm: 'Firma', name: 'Cuenta 50K', kind: 'Evaluación', size: 50000, dd: 2000,
      ddKind: 'estatico', trailBase: 'intradia', target: 3000, limit: 30, status: 'activa', ledger: [] }] },
    trades: {
      /* salió JUSTO en el stop: −1R de precio, pero $8 de comisiones = −1,4R de dinero */
      limpio: { id: 'limpio', type: 'futuros', accountId: 'a1', instrument: 'MNQ', date: '2026-09-21', time: '10:00',
                direction: 'long', qty: 1, entry: 20000, stop: 19990, exit: 19990, fees: 8 },
      /* se pasó de verdad: stop en 19990 y salió en 19970 */
      pasado: { id: 'pasado', type: 'futuros', accountId: 'a1', instrument: 'MNQ', date: '2026-09-22', time: '10:00',
                direction: 'long', qty: 1, entry: 20000, stop: 19990, exit: 19970 },
    },
  });
  const r = await pg.evaluate(() => {
    const QE = window.QuantEngine;
    const m = {}; FUT.trades().forEach(t => { m[t.id] = { pnl: t.pnlEff, dinero: t.rReal, precio: QE.rRealApp(t) }; });
    return m;
  });
  ok(r.limpio.dinero === -1.4 && r.limpio.precio === -1,
     'el stop limpio: −1,4R de dinero y −1R de precio', JSON.stringify(r.limpio));
  ok(r.pasado.precio === -3, 'el que se pasó: 30 puntos entre 10 son −3R de precio', JSON.stringify(r.pasado));
  await pg.click('#ftSeg button[data-v="analisis"]').catch(() => {});
  await quieto(pg, 60, 2500);
  const meta = await pg.evaluate(() => (document.getElementById('rdMeta') || {}).textContent || '');
  ok(/1 pasaron del stop/.test(meta), 'el histograma cuenta UNA sola, la del precio', JSON.stringify(meta.trim()));
  ok(!/2 pasaron del stop/.test(meta), 'y no acusa al stop limpio por su comisión');
  await pg.context().close();
}

ok(errs.length === 0, 'ningún error de página', errs.length ? errs.join(' | ') : 'sin pageerror');
await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
