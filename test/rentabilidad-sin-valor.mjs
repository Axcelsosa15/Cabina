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
  const pending = page.locator('#ivPending');
  if (await pending.count()) {
    await page.locator('#ivPendingSummary').press('Enter');
    await pending.getByRole('button', { name: 'Añadir posición · VTI · ETFs · Cuenta A' }).click();
    const inputs = await page.evaluate(() => Object.fromEntries(
      ['asset', 'accountId', 'qty', 'entry', 'date'].map(key => [key, document.getElementById('ef_' + key).value])
    ));
    check(inputs.asset === 'VTI' && inputs.accountId === 'a' && inputs.qty === '1' && inputs.entry === '100' && inputs.date === '2026-01-05',
      'el pendiente precarga la posición con los datos de la compra y su cuenta');
    check(await page.locator('#ef_current').evaluate(el => el === document.activeElement), 'el formulario enfoca el precio pendiente');
    await page.locator('#edSave').click();
    await quieto(page);
    check(await unavailable() && (await page.locator('#ivPendingSummary').innerText()).includes('(1)'),
      'guardar sin precio deja el registro de precio como único pendiente');
    await pending.getByRole('button', { name: 'Registrar precio · VTI · ETFs · Cuenta A' }).click();
    await page.locator('#edSave').click();
    check(await page.locator('#ef_current').getAttribute('aria-invalid') === 'true', 'la edición rápida pide un precio explícito');
    await page.locator('#ef_current').fill('0');
    await page.locator('#edSave').click();
    await quieto(page);
    check(await pending.isHidden() && await value() === '-100.0%', 'el precio cero resuelve el pendiente y conserva el retorno');
    await page.evaluate(() => INV.deletePosition(INV.positions()[0].id));
    await quieto(page);
  } else {
    check(false, 'hay un acceso visible a los pendientes de valoración');
  }
  await page.evaluate(() => {
    INV.createPosition({ id: 'other', asset: 'VTI', market: 'etfs', accountId: 'b', qty: 1, entry: 100, current: 120 });
    INV.createPosition({ id: 'wrong-market', asset: 'VTI', market: 'acciones', accountId: 'a', qty: 1, entry: 100, current: 120 });
  });
  await quieto(page);
  check(await unavailable(), 'el mismo símbolo en otra cuenta o mercado no cubre la compra');
  await page.locator('#ivAccountFilter').selectOption('b');
  await quieto(page);
  check(await value() === '+20.0%', 'una cuenta valorada conserva su rentabilidad aunque otra esté incompleta');
  check(await pending.count() && await pending.isHidden(), 'los pendientes respetan el filtro de cuenta');
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
  await page.evaluate(() => {
    INV.updateTransaction('buy', { qty: 0.1 });
    INV.deleteTransaction('sell');
    INV.updateTransaction('close', { qty: 0.3 });
    INV.createTransaction({ id: 'second-buy', asset: 'VTI', market: 'etfs', accountId: 'a', op: 'compra', date: '2026-01-06', qty: 0.2, price: 100 });
    INV.createPosition({ id: 'closed', asset: 'VTI', market: 'etfs', accountId: 'a' });
  });
  await quieto(page);
  check(await page.evaluate(() => {
    const p = INV.performance('closed');
    return p.cerrada && p.cantidad === 0 && INV.portfolio().totalRet === 0.2;
  }), 'una posición fraccionada cerrada no necesita cotización aunque quede en el historial');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
