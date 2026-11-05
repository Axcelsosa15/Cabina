import { chromium } from 'playwright';
import { arrancada, quieto, siembra } from './espera.mjs';
import { sirvePublicado } from './publicado.mjs';

const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
function check(ok, label) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
}

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await siembra(page, base + '#invest', { settings: { accounts: [], rules: [], meta: {
    investAccounts: [{ id: 'a', name: 'Cuenta A' }, { id: 'b', name: 'Cuenta B' }]
  } } });
  await arrancada(page, null);
  const metric = page.locator('#ivTiles .tile').last();
  const value = () => metric.locator('.v').innerText();
  const unavailable = () => page.evaluate(() => {
    const p = INV.portfolio();
    return p.totalRet === null && p.cartera === null;
  });
  await page.evaluate(() => {
    INV.createTransaction({ id: 'buy', asset: 'VTI', market: 'etfs', accountId: 'a', op: 'compra', date: '2026-01-05', qty: 1, price: 100 });
  });
  await quieto(page);
  check(await unavailable() && await value() === '—', 'una compra abierta sin posición no muestra -100%');
  check(/sin posición/i.test(await metric.innerText()), 'la tarjeta explica que falta registrar la posición');
  await page.evaluate(() => {
    INV.createPosition({ id: 'other', asset: 'VTI', market: 'etfs', accountId: 'b', qty: 1, entry: 100, current: 120 });
    INV.createPosition({ id: 'wrong-market', asset: 'VTI', market: 'acciones', accountId: 'a', qty: 1, entry: 100, current: 120 });
  });
  await quieto(page);
  check(await unavailable(), 'el mismo símbolo en otra cuenta o mercado no cubre la compra');
  await page.locator('#ivAccountFilter').selectOption('b');
  await quieto(page);
  check(await value() === '+20.0%', 'una cuenta valorada conserva su rentabilidad aunque otra esté incompleta');
  await page.locator('#ivAccountFilter').selectOption('a');
  await page.evaluate(() => {
    INV.deletePosition('wrong-market');
    INV.createPosition({ id: 'own', asset: 'vti', market: 'etfs', accountId: 'a', current: '' });
  });
  await quieto(page);
  check(await unavailable() && await value() === '—' && /precio actual/i.test(await metric.innerText()), 'un precio histórico vacío sigue sin valoración');
  await page.evaluate(() => INV.updatePosition('own', { current: 0 }));
  await quieto(page);
  check(await value() === '-100.0%' && await page.evaluate(() => INV.portfolio().totalRet === -1), 'un precio cero explícito conserva la pérdida real del 100%');
  await page.evaluate(() => INV.updatePosition('own', { current: 120 }));
  await quieto(page);
  check(await page.evaluate(() => INV.portfolio().totalRet === 0.2), 'al registrar la cotización vuelve el retorno calculado');
  await page.evaluate(() => {
    INV.deletePosition('own');
    INV.updateTransaction('buy', { qty: 0.3 });
    INV.createTransaction({ id: 'sell', asset: ' vti ', market: 'etfs', accountId: 'a', op: 'venta', date: '2026-02-05', qty: 0.1, price: 120 });
  });
  await quieto(page);
  check(await unavailable(), 'una venta parcial no sustituye el valor de las unidades que quedan');
  await page.evaluate(() => {
    INV.createTransaction({ id: 'close', asset: 'VTI', market: 'etfs', accountId: 'a', op: 'venta', date: '2026-03-05', qty: 0.2, price: 120 });
  });
  await quieto(page);
  check(await page.evaluate(() => INV.portfolio().totalRet === 0.2), 'una compra fraccionada vendida por completo conserva su retorno');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
