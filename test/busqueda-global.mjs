import { chromium } from 'playwright';

const fallos = [];
const paso = (nombre, ok, detalle = '') => {
  console.log('  ' + (ok ? 'PASS' : '❌') + ' ' + nombre + (detalle ? ' · ' + detalle : ''));
  if (!ok) fallos.push(nombre);
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
try {
  await page.goto('file://' + process.cwd() + '/../index.html');
  await page.waitForFunction(() => typeof window.FUT === 'object' && typeof window.INV === 'object' && typeof window.TES === 'object', null, { timeout: 15000 });

  const tabs = await page.locator('.tabbtn').count();
  paso('El acceso a la búsqueda global existe', await page.locator('#cmdOpenButton').count() === 1);
  paso('La paleta original es única', await page.locator('#cmdOv').count() === 1 && await page.locator('#globalSearchDialog').count() === 0);
  paso('La navegación incluye Estudio', await page.locator('.tabbtn[data-tab="estudio"]').count() === 1, tabs + ' botones de pestaña');

  await page.evaluate(() => {
    FUT.createAccount({ id: 'cmd-test-account', firm: 'Test', name: 'Cuenta Cmd QA', kind: 'Evaluación', size: 25000, dd: 1000, ddKind: 'estatico', status: 'activa', ledger: [] });
    FUT.createTrade({ id: 'cmd-test-trade', accountId: 'cmd-test-account', type: 'futuros', instrument: 'MNQ', direction: 'long', qty: 1, date: '2026-10-14', time: '10:00', entry: 21000, stop: 20990, exit: 21010 });
  });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.waitForFunction(() => document.querySelector('#cmdOv')?.classList.contains('open'));
  paso('Cmd/Ctrl+K abre la paleta', await page.locator('#cmdQ').evaluate(el => document.activeElement === el));
  await page.locator('#cmdQ').fill('MNQ');
  await page.waitForFunction(() => document.querySelector('#cmdList')?.innerText.includes('MNQ'));
  paso('Busca operaciones por instrumento', await page.locator('#cmdList .cmd-it').evaluateAll(nodes => nodes.some(n => n.innerText.includes('MNQ'))));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#cmdOv')?.classList.contains('open') === false);
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros');
  paso('Enter abre el espacio de la operación', await page.locator('.tab.active').getAttribute('data-tab') === 'futuros');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#cmdQ').fill('Cuenta Cmd QA');
  await page.waitForFunction(() => document.querySelector('#cmdList')?.innerText.includes('Cuenta Cmd QA'));
  paso('Busca cuentas por nombre', await page.locator('#cmdList .cmd-it').evaluateAll(nodes => nodes.some(n => n.innerText.includes('Cuenta Cmd QA'))));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.FUT.selectedAccountId() === 'cmd-test-account');
  paso('Abrir una cuenta selecciona la cuenta canónica', await page.evaluate(() => FUT.selectedAccountId() === 'cmd-test-account'));

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#cmdQ').fill('Estudio');
  await page.waitForFunction(() => document.querySelector('#cmdList')?.innerText.includes('Estudio'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'estudio');
  paso('La paleta navega al tab Estudio', await page.locator('.tab.active').getAttribute('data-tab') === 'estudio');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.keyboard.press('Escape');
  paso('Escape cierra la paleta', !(await page.locator('#cmdOv').evaluate(el => el.classList.contains('open'))));
  paso('Sin errores JavaScript', pageErrors.length === 0, pageErrors.join(' | ') || '0');
} catch (e) {
  console.log('  ❌ excepción de prueba · ' + e.message);
  fallos.push('excepción de prueba');
} finally {
  await browser.close();
}
console.log('  ' + (fallos.length ? '❌ fallos: ' + fallos.length : 'PASS búsqueda global completada'));
if (fallos.length) process.exit(1);
