import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { arrancada, CONFIG_PRUEBA, quieto, siembra } from './espera.mjs';

const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
function check(condition, description) {
  console.log(`  ${condition ? '✅' : '❌'} ${description}`);
  if (!condition) failures++;
}

try {
  for (const width of [390, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const settings = structuredClone(CONFIG_PRUEBA);
    settings.meta = { ...settings.meta, investAccounts: [{ id: 'broker-test', name: 'Bróker de prueba' }] };
    await siembra(page, base + '#cabina', { settings, days: {}, trades: {} });
    await arrancada(page, null);
    const symbol = page.locator('#qtSym');
    const market = page.locator('#qtDest');
    const account = page.locator('#qtAccount');
    const accounts = () => account.locator('option').evaluateAll(options => options.map(option => option.value));
    const open = () => page.locator('#qtGo').click();
    const cancel = () => page.locator('#edCancel').click();
    const checkAtWidth = (condition, label) => check(condition, `${width}px · ${label}`);

    await market.selectOption('etfs');
    await symbol.fill('BTC');
    checkAtWidth(await market.inputValue() === 'etfs', 'el mercado elegido antes del símbolo gana a la sugerencia');
    await market.selectOption('etfs');
    checkAtWidth((await accounts()).join(',') === ',broker-test', 'Inversiones sólo ofrece cuentas de inversión');
    if ((await accounts()).includes('broker-test')) await account.selectOption('broker-test');
    await open();
    checkAtWidth(await page.locator('#ef_accountId').inputValue() === 'broker-test', 'el formulario recibe la cuenta de inversión seleccionada');
    await cancel();
    checkAtWidth(await symbol.inputValue() === 'BTC', 'cancelar conserva el símbolo');
    checkAtWidth(await market.inputValue() === 'etfs' && await account.inputValue() === 'broker-test', 'cancelar conserva mercado y cuenta');

    await symbol.fill('');
    await symbol.fill('MNQ');
    checkAtWidth(await market.inputValue() === 'futuros' && !(await accounts()).includes('broker-test'), 'al volver a Futuros cambia la lista de cuentas');
    await account.selectOption('');
    await page.locator('#jBroke').click();
    checkAtWidth(await account.inputValue() === '', 'repintar la sesión conserva la elección explícita sin cuenta');

    await market.selectOption('etfs');
    await symbol.fill('VTI');
    checkAtWidth(await account.inputValue() === 'broker-test', 'al volver a Inversiones recupera su cuenta');
    await open();
    await page.locator('#ef_qty').fill('1');
    await page.locator('#ef_price').fill('100');
    await page.locator('#edSave').click();
    await quieto(page);
    checkAtWidth(await page.evaluate(() => INV.transactions().some(t => t.asset === 'VTI' && t.market === 'etfs' && t.accountId === 'broker-test')), 'se guarda en el mercado y la cuenta elegidos');
    checkAtWidth(await symbol.inputValue() === '', 'guardar limpia el símbolo');
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
