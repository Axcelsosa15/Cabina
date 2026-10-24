/* VISTAS PERSONALIZABLES · preferencias de visibilidad sin tocar datos.
   Comprueba apertura, agrupación por pestaña, ocultar/mostrar, persistencia
   tras recarga, búsqueda y restauración global. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'index.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();
const failures = [];
const ok = (condition, label, detail='') => {
  console.log('  ' + (condition ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!condition) failures.push(label);
};
page.on('pageerror', error => failures.push('error de página: ' + error.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await page.waitForSelector('#viewPrefsOpen', { timeout: 10000 });
ok(await page.isVisible('#viewPrefsOpen'), 'acción Vista visible');

await page.click('#viewPrefsOpen');
ok(await page.isVisible('#viewPrefsOv.open'), 'abre el diálogo accesible');
const tabs = await page.locator('#viewPrefsGroups > details').count();
ok(tabs === 8, 'hay un grupo para cada una de las ocho pestañas', String(tabs));
const expected = ['Cabina','Futuros','Métricas / Edge','Inversiones','Playbook','Formas de hacer dinero','Estudio','Calculadora'];
const groupNames = await page.locator('#viewPrefsGroups > details > summary span:first-child').allTextContents();
ok(expected.every(name => groupNames.includes(name)), 'las ocho pestañas están nombradas');

const first = page.locator('#viewPrefsGroups .view-prefs-item input[type=checkbox]').first();
const key = await first.getAttribute('data-key');
const before = await page.locator('[data-cabina-view-key]').evaluateAll(els => els.length);
await first.uncheck();
const hiddenNow = await page.locator('[data-cabina-view-key]').evaluateAll(els => {
  const el = els.find(x => x.dataset.cabinaViewKey === document.querySelector('#viewPrefsGroups input[data-key]')?.dataset.key);
  return el ? el.classList.contains('cabina-user-hidden') : null;
});
ok(hiddenNow === true, 'desmarcar oculta el módulo sin borrarlo');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
const persisted = await page.locator('[data-cabina-view-key]').evaluateAll((els, wanted) => {
  const el = els.find(x => x.dataset.cabinaViewKey === wanted);
  return !!el && el.classList.contains('cabina-user-hidden');
}, key);
ok(persisted, 'la preferencia sobrevive a recargar la página');
const after = await page.locator('[data-cabina-view-key]').evaluateAll(els => els.length);
ok(after === before, 'la personalización no elimina módulos del DOM', String(after) + ' módulos');

await page.click('#viewPrefsOpen');
await page.fill('#viewPrefsSearch', 'Estudio');
const matches = await page.locator('#viewPrefsGroups .view-prefs-item:visible').count();
ok(matches > 0, 'la búsqueda filtra la lista de secciones', String(matches) + ' resultado(s)');
await page.click('#viewPrefsReset');
const remainingHidden = await page.locator('[data-cabina-view-key].cabina-user-hidden').count();
ok(remainingHidden === 0, 'Restaurar todas devuelve la vista completa', String(remainingHidden) + ' ocultos');
await page.click('#viewPrefsDone');
ok(!(await page.locator('#viewPrefsOv').evaluate(el => el.classList.contains('open'))), 'Listo cierra el diálogo');
const errors = await page.evaluate(() => window.__cabinaViewPreferenceError || '');
ok(!errors, 'sin error interno de preferencias', errors);
await browser.close();
server.close();
console.log(failures.length ? '\n  ' + failures.length + ' fallo(s)' : '\n  todo en verde');
process.exit(failures.length ? 1 : 0);
