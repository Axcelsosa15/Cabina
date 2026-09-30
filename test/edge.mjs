/* MÉTRICAS / EDGE · cada fórmula contra la cuenta hecha a mano.

   Los números esperados NO salen de la app: se calculan aquí, a mano, sobre una
   muestra pensada para que cada fórmula se pueda comprobar de cabeza. MNQ a $2 el
   punto, comisión de $2 ida y vuelta por contrato (escrita en los parámetros).

     T1  +20 pts  bruto  40  neto  38      T5  +10 pts  bruto 20  neto 18
     T2  −10 pts  bruto −20  neto −22      T6    0 pts  bruto  0  neto −2  ← la comisión
     T3  +20 pts  bruto  40  neto  38                                        la vuelve pérdida
     T4  −10 pts  bruto −20  neto −22      T7  +20 pts  (otro setup)  neto 38
     T8  +20 pts × 2 contratos, «Comisiones $» 5 en el journal: neto 75 (no se descuenta dos veces)
     y una operación de INVERSIÓN de +9.999 que no puede entrar en nada. */
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

const op = (id, fecha, salida, extra = {}) => Object.assign({ id, type: 'futuros', instrument: 'MNQ', direction: 'long', entry: 20000, stop: 19990, target: 20020,
  exit: salida, qty: 1, date: fecha, time: '10:00', accountId: 'a1', setupId: 'p1' }, extra);
const TRADES = {
  t1: op('t1', '2026-09-01', 20020), t2: op('t2', '2026-09-02', 19990), t3: op('t3', '2026-09-03', 20020),
  t4: op('t4', '2026-09-04', 19990), t5: op('t5', '2026-09-05', 20010), t6: op('t6', '2026-09-08', 20000),
  t7: op('t7', '2026-09-09', 20020, { setupId: 'p2' }),
  t8: op('t8', '2026-09-10', 20020, { qty: 2, fees: 5 }),
  inv: { id: 'inv', type: 'inversion', asset: 'AAPL', op: 'venta', pnl: 9999, date: '2026-09-06' },
};
const SEMILLA = {
  settings: {
    meta: { mx: { com: 2 } },
    accounts: [{ id: 'a1', firm: 'Firma', name: 'Cuenta 50K', kind: 'Evaluación', size: 50000, dd: 2000, ddKind: 'estatico', target: 3000,
      trailBase: 'intradia', status: 'activa', ledger: [], rules: { maxLoss: 500 } }],
  },
  trades: TRADES,
  playbooks: { p1: { id: 'p1', name: 'Setup C', type: 'futuros', kind: 'futuros', status: 'activo' },
               p2: { id: 'p2', name: 'Otro', type: 'futuros', kind: 'futuros', status: 'activo' } },
};

/* ── LO ESPERADO, A MANO ── */
const NETOS = [38, -22, 38, -22, 18, -2, 38, 75];
const gan = NETOS.filter(x => x > 0), per = NETOS.filter(x => x < 0);
const N = NETOS.length, p = gan.length / N, qL = per.length / N;
const W = gan.reduce((a, b) => a + b, 0) / gan.length, L = -per.reduce((a, b) => a + b, 0) / per.length;
const b = W / L, E = p * W - qL * L;
const RS = [38 / 22, -1, 38 / 22, -1, 18 / 22, -2 / 22, 38 / 22, 75 / 44];
const ER = RS.reduce((a, c) => a + c, 0) / RS.length;

const nav = await chromium.launch();
const errs = [];
async function pagina(semilla) {
  const ctx = await nav.newContext();
  await ctx.addInitScript(s => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify(s)); } catch (e) { } }, semilla);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await pg.click('.tabbtn[data-tab="edge"]'); await quieto(pg, 60, 2500);
  return pg;
}
const v = (pg, k) => pg.evaluate(k => { const el = document.querySelector(`[data-k="${k}"]`); return el ? el.dataset.v : null; }, k);
const txt = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : ''; }, sel);

console.log('\n═══ LA PESTAÑA EXISTE Y NO ROMPE LAS DEMÁS ═══');
const pg = await pagina(SEMILLA);
ok(await pg.isVisible('.tab[data-tab="edge"]'), 'la pestaña «Métricas / Edge» se abre');
ok(/N = 8 operaciones de futuros/.test(await txt(pg, '#mxN')), 'N cuenta 8 operaciones: la de inversión no entra', await txt(pg, '#mxN'));

console.log('\n═══ LAS FÓRMULAS, CONTRA LA CUENTA A MANO ═══');
ok(cerca(await v(pg, 'winrate'), p), `win rate p = 5/8 = ${p}`, await v(pg, 'winrate'));
ok(cerca(await v(pg, 'expectancy'), E, 1e-3), `expectancy E = p·W − q·L = ${E.toFixed(4)} $`, await v(pg, 'expectancy'));
ok(cerca(E, NETOS.reduce((a, c) => a + c, 0) / N), 'y es exactamente la media neta por operación (comprobación de la propia cuenta)');
ok(cerca(await v(pg, 'expectancyR'), ER, 1e-3), `expectancy en R = media del R neto = ${ER.toFixed(4)}`, await v(pg, 'expectancyR'));
ok(cerca(await v(pg, 'b'), b, 1e-4), `b = W/L = ${W} / ${L.toFixed(3)} = ${b.toFixed(4)}`, await v(pg, 'b'));
ok(cerca(await v(pg, 'pf'), 207 / 46, 1e-3), 'profit factor = 207 / 46 = 4.5', await v(pg, 'pf'));
ok(cerca(await v(pg, 'breakeven'), 1 / (1 + b), 1e-5), `break-even p = 1/(1+b) = ${(1 / (1 + b)).toFixed(4)}`, await v(pg, 'breakeven'));
ok(await pg.evaluate(() => document.querySelector('[data-k="breakeven"] .qv').classList.contains('good')), 'p real (62,5%) por encima del break-even: se marca en verde');
ok(cerca(await v(pg, 'kelly'), p - (1 - p) / b, 1e-5), `Kelly f* = p − (1−p)/b = ${(p - (1 - p) / b).toFixed(4)}`, await v(pg, 'kelly'));
ok(/En prop el tamaño lo limita la cuenta, no Kelly/.test(await txt(pg, '[data-k="kelly"]')), 'Kelly lleva su nota, y está marcado como referencia');
ok(cerca(await v(pg, 'rr'), 38 / 22, 1e-4), 'reward-to-risk planeado neto = (20×2 − 2) / (10×2 + 2) = 1,727', await v(pg, 'rr'));
ok(cerca(await v(pg, 'mdd'), 22 / 50038, 1e-7), 'max drawdown = 22 / 50.038 (pico tras T1, valle tras T2)', await v(pg, 'mdd'));
ok(/\$2,000/.test(await txt(pg, '#mxDD')) && /-\$22/.test(await txt(pg, '#mxDD')), 'y en $ junto al drawdown permitido de la cuenta', (await txt(pg, '#mxDD')).replace(/\s+/g, ' ').slice(0, 80));

/* Sharpe diario sobre el P&L diario neto y capital 50.000, con 5% anual. */
await pg.fill('#mxRf', '5'); await quieto(pg);
{
  const porDia = {}; ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-08', '2026-09-09', '2026-09-10'].forEach((d, i) => { porDia[d] = (porDia[d] || 0) + NETOS[i]; });
  let eq = 50000; const r = [];
  Object.keys(porDia).sort().forEach(d => { r.push(porDia[d] / eq); eq += porDia[d]; });
  const media = r.reduce((a, c) => a + c, 0) / r.length;
  const desv = Math.sqrt(r.reduce((a, c) => a + (c - media) ** 2, 0) / (r.length - 1));
  const esperado = (media - 0.05 / 252) / desv;
  ok(cerca(await v(pg, 'sharpe'), esperado, 1e-3), `Sharpe diario = media(r − rf) / σ con rf 5% anual = ${esperado.toFixed(4)}`, await v(pg, 'sharpe'));
}

console.log('\n═══ NETO DE COMISIONES, SIN DESCONTAR DOS VECES ═══');
const fila6 = await txt(pg, '#mxTabla tr[data-mx="t6"]');
ok(/-\$2/.test(fila6), 'T6: 0 puntos de bruto son −$2 netos', fila6.replace(/\s+/g, ' '));
const fila8 = await txt(pg, '#mxTabla tr[data-mx="t8"]');
ok(/en journal/.test(fila8) && /\$75/.test(fila8), 'T8 ya traía «Comisiones $» 5: se respeta, no se descuentan otros 4', fila8.replace(/\s+/g, ' '));
ok(/a 7 se les descontó comisión aquí \(\$14/.test(await txt(pg, '#mxComNota')), 'y se dice cuánto se descontó y a cuántas', await txt(pg, '#mxComNota'));

console.log('\n═══ FILTROS ═══');
await pg.selectOption('#mxSetup', 'p1'); await quieto(pg);
ok(/N = 7 /.test(await txt(pg, '#mxN')), 'por setup: «Setup C» deja 7 (fuera T7)', await txt(pg, '#mxN'));
await pg.selectOption('#mxSetup', ''); await pg.fill('#mxDesde', '2026-09-03'); await pg.dispatchEvent('#mxDesde', 'change');
await pg.fill('#mxHasta', '2026-09-05'); await pg.dispatchEvent('#mxHasta', 'change'); await quieto(pg);
ok(/N = 3 /.test(await txt(pg, '#mxN')), 'por fechas: del 3 al 5 de septiembre, 3 operaciones', await txt(pg, '#mxN'));
await pg.fill('#mxDesde', ''); await pg.dispatchEvent('#mxDesde', 'change'); await pg.fill('#mxHasta', ''); await pg.dispatchEvent('#mxHasta', 'change');
await pg.selectOption('#mxAcct', '__none'); await quieto(pg);
ok(/N = 0 /.test(await txt(pg, '#mxN')), 'por cuenta: «sin cuenta asignada» no tiene ninguna');
await pg.selectOption('#mxAcct', 'a1'); await quieto(pg);
ok(/N = 8 /.test(await txt(pg, '#mxN')), 'y la cuenta 50K tiene las 8');

console.log('\n═══ MUESTRA ═══');
ok(/Muestra insuficiente, no confiar en las métricas/.test(await txt(pg, '#mxAviso')), 'con N = 8 < 30 aparece el aviso');

console.log('\n═══ TAMAÑO DE POSICIÓN ═══');
await pg.selectOption('#mxFuente', 'mano'); await pg.fill('#mxRiesgo', '200'); await pg.fill('#mxStop', '20'); await quieto(pg);
ok(await v(pg, 'contratos') === '4', 'floor(200 ÷ (20 × $2 + $2)) = floor(200 ÷ 42) = 4', await v(pg, 'contratos'));
ok(await v(pg, 'usado') === '168.00', 'riesgo real 4 × 42 = $168', await v(pg, 'usado'));
ok(/El stop puede tener slippage/.test(await txt(pg, '#mxSizeRes')), 'con la advertencia de slippage');
await pg.selectOption('#mxFuente', 'cuenta'); await quieto(pg);
ok(await v(pg, 'contratos') === '11', 'riesgo de la cuenta (pérdida diaria $500): floor(500 ÷ 42) = 11', await v(pg, 'contratos'));
await pg.selectOption('#mxFuente', 'mano'); await pg.fill('#mxStop', '20.1'); await quieto(pg);
ok(/no es múltiplo del tick/.test(await txt(pg, '#mxSizeRes')), '20,1 puntos no existe en MNQ (tick 0,25): se avisa');
await pg.fill('#mxStop', '20'); await quieto(pg);
ok(!/Kelly/.test(await txt(pg, '#mxSize')), 'Kelly no aparece en el cálculo de tamaño');

console.log('\n═══ RIESGO DE RUINA · MONTE CARLO ═══');
ok(!(await pg.isDisabled('#mxSimular')), 'con cuenta y 8 R netos, se puede simular');
await pg.click('#mxSimular');
await pg.waitForFunction(() => !!document.querySelector('[data-k="quemar"]'), null, { timeout: 30000 });
const q = Number(await v(pg, 'quemar')), o = Number(await v(pg, 'objetivo')), s = Number(await v(pg, 'abierta'));
ok(q >= 0 && q <= 1 && o >= 0 && o <= 1, 'da % de quemar la cuenta y % de llegar al objetivo primero', `quemar ${q} · objetivo ${o} · abierta ${s}`);
ok(cerca(q + o + s, 1, 1e-3), 'y las tres suman 100%');
ok(/10\.000 caminos/.test(await txt(pg, '#mxRuinaRes')) && /8 R netos remuestreados/.test(await txt(pg, '#mxRuinaRes')), 'con 10.000 caminos sobre los 8 R netos', (await txt(pg, '#mxRuinaRes')).match(/8 R netos[^·]*·[^·]*·[^·]*/)?.[0]);
ok(/estático de \$2,000/.test(await txt(pg, '#mxRuinaRes')), 'contra el drawdown de la cuenta seleccionada');

console.log('\n═══ GRÁFICO ═══');
ok(await pg.evaluate(() => !!document.querySelector('#mxChart #mxEq') && !!document.querySelector('#mxChart #mxDdArea')), 'la curva de equity y el área de drawdown están dibujadas');

console.log('\n═══ EDITABLE Y GUARDADO ═══');
await pg.fill('#mxCom', '3'); await pg.waitForTimeout(900);
const guardado = await pg.evaluate(() => JSON.parse(localStorage.getItem('cabina-mnq:v1')).settings.meta.mx.com);
ok(guardado === 3, 'cambiar la comisión se guarda con la configuración', String(guardado));
ok(cerca(await v(pg, 'expectancy'), (37 - 23 + 37 - 23 + 17 - 3 + 37 + 75) / 8, 1e-3), 'y recalcula: con $3 la media neta baja a 154/8 = 19,25', await v(pg, 'expectancy'));
const pnlFut = await pg.evaluate(() => FUT.trades().find(t => t.id === 't6').pnlEff);
ok(pnlFut === 0, 'el journal NO cambia: T6 sigue valiendo $0 allí (la comisión se descuenta sólo aquí, y se dice)', String(pnlFut));

console.log('\n═══ P&L MANUAL ═══');
{
  const man = { settings: { meta: { mx: { com: 2 } }, accounts: SEMILLA.settings.accounts },
    trades: { m1: { id: 'm1', type: 'futuros', instrument: 'MNQ', direction: 'long', pnl: 100, qty: 1, date: '2026-09-01', accountId: 'a1' } } };
  const pm = await pagina(man);
  ok(/\$98/.test(await txt(pm, '#mxTabla tr[data-mx="m1"]')), 'un P&L escrito a mano se toma como bruto: $100 → $98');
  await pm.check('#mxManualNeto'); await quieto(pm);
  ok(/\$100/.test(await txt(pm, '#mxTabla tr[data-mx="m1"]')), 'con «ya son netos» marcado, se queda en $100');
  await pm.context().close();
}

console.log('\n═══ UNA PLANA NO ES UNA PÉRDIDA ═══');
{
  /* +38, −22 y una que sale 1 punto a favor: bruto $2, comisión $2, neto $0.
     Media real = 16/3 = 5,33. Con q = 1 − p = 2/3, la plana contaría como una
     pérdida media entera: E = 38/3 − 2/3 × 22 = −2. Mismo sistema, signo contrario. */
  const tres = { settings: { meta: { mx: { com: 2 } }, accounts: SEMILLA.settings.accounts },
    trades: { a: op('a', '2026-09-01', 20020), b: op('b', '2026-09-02', 19990), c: op('c', '2026-09-03', 20001) } };
  const pp = await pagina(tres);
  ok(cerca(await v(pp, 'expectancy'), 16 / 3, 1e-6), 'con una plana, E = 16/3 = 5,33 (la media real), no −2', await v(pp, 'expectancy'));
  ok(cerca(await v(pp, 'winrate'), 1 / 3, 1e-9), 'y p = 1/3: la plana sí cuenta en el total');
  ok(/la plana no es una pérdida/.test(await txt(pp, '[data-k="expectancy"]')), 'y se dice en la tarjeta');
  await pp.context().close();
}

console.log('\n═══ LAS OTRAS PESTAÑAS SIGUEN VIVAS ═══');
for (const t of ['cabina', 'futuros', 'invest', 'playbook', 'ideas', 'calc', 'edge']) {
  await pg.click(`.tabbtn[data-tab="${t}"]`); await quieto(pg);
  ok(await pg.isVisible(`.tab[data-tab="${t}"]`), `«${t}» se abre`);
}

ok(errs.length === 0, 'la página no lanzó ningún error', errs.join(' | ') || 'sin pageerror');
await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
