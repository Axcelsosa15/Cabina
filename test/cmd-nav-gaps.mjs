/* Paleta ⌘K: las 11 rutas y el respaldo deben entrar por la misma puerta que un clic.
   Antes faltaban Historial/Ajustes/Cuentas y «Descargar copia» disparaba #bkExport
   sin abrir el diálogo (sin opción de capturas, aterrizando en Resumen). */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { arrancada, quieto } from './espera.mjs';

const FAIL = [], errors = [];
const ok = (yes, label, detail = '') => {
  console.log('  ' + (yes ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!yes) FAIL.push(label);
};

const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })).newPage();
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await arrancada(page, '#todayLabel');

  async function openCmd(query) {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cmdOv .cmd-it');
    if (query) {
      await page.fill('#cmdQ', query);
      await page.waitForTimeout(120);
    }
  }
  async function pickExact(title) {
    const hit = page.locator('#cmdList .cmd-it').filter({ has: page.locator('.ct', { hasText: new RegExp('^' + title + '$') }) }).first();
    await hit.click();
    await quieto(page);
  }

  for (const [q, tab] of [['Historial', 'historial'], ['Ajustes', 'ajustes'], ['Cuentas', 'cuentas']]) {
    await openCmd(q);
    await pickExact(q);
    ok(await page.evaluate(t => location.hash === '#' + t && document.querySelector('.tab.active')?.dataset.tab === t, tab),
      '⌘K → ' + q + ' abre la pestaña real', await page.evaluate(() => location.hash));
  }

  await openCmd('Descargar copia');
  await pickExact('Descargar copia de seguridad');
  const exportState = await page.evaluate(() => ({
    tab: document.querySelector('.tab.active')?.dataset.tab,
    hash: location.hash,
    dialogOpen: !!document.getElementById('settingsExport')?.open,
    datosSelected: document.getElementById('settingsTabData')?.getAttribute('aria-selected') === 'true',
  }));
  ok(exportState.tab === 'ajustes' && exportState.hash === '#ajustes',
    'copia de seguridad aterriza en Ajustes', JSON.stringify(exportState));
  ok(exportState.dialogOpen && exportState.datosSelected,
    'abre el diálogo de exportación sobre Datos', JSON.stringify(exportState));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('settingsExport')?.open);

  ok(errors.length === 0, 'sin errores de JavaScript', errors.slice(0, 3).join(' | '));
} catch (e) {
  ok(false, 'prueba completada sin excepción', String(e.message || e).slice(0, 400));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
console.log('fallos: ' + FAIL.length);
if (FAIL.length) process.exit(1);
console.log('PASS cmd-nav-gaps');
