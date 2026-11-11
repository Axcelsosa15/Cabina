/* PREFERENCIAS DE VISTA · la densidad y los módulos visibles no deben alterar datos. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
/* SERVIA EL HTML PARA CUALQUIER RUTA. Con la aplicación dentro del documento
   daba igual; desde que la página pide `./app.js`, el navegador recibía HTML
   donde esperaba un script, lo rechazaba por MIME y la página no arrancaba.
   `sirvePublicado` sirve lo que sube Pages —leído del propio workflow— y 404
   para lo demás, que es lo que hace útil a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await page.click('#viewPrefsOpen');
await page.waitForSelector('#viewPrefs:not([hidden])');
ok(await page.locator('#viewPrefsList .view-prefs-item').count() > 0, 'el configurador lista módulos de la pestaña activa');
ok(await page.locator('#viewPrefsList .view-prefs-table-group[data-view-tab="calc"] input[aria-label^="Mostrar columna"]').count() > 0, 'desde la carga inicial de Cabina aparecen columnas configurables de otras pestañas');
const histCheckbox = page.locator('#viewPrefsList input[aria-label*="Últimas 14 sesiones"]');
ok(await histCheckbox.count() === 1, 'el historial de sesiones se puede personalizar');
const histBefore = await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden'));
await histCheckbox.uncheck();
const histHidden = await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden'));
ok(!histBefore && histHidden, 'ocultar un módulo lo retira de la vista sin borrar el nodo');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}'));
ok(Array.isArray(stored.hidden.cabina) && stored.hidden.cabina.includes('panelHist'), 'la preferencia queda guardada por pestaña');
const panelBefore = await page.locator('#panelHist > .body').evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
const filterBefore = await page.locator('#ftFilters').evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
await page.locator('input[name="viewDensity"][value="compact"]').check();
ok(await page.locator('body').getAttribute('data-density') === 'compact', 'la densidad compacta se aplica al instante');
const filterCompact = await page.locator('#ftFilters').evaluate(el => ({gap:getComputedStyle(el).gap,padding:getComputedStyle(el).padding}));
ok(parseFloat(filterCompact.padding) < filterBefore, 'la densidad compacta reduce espacio vertical de los filtros activos', JSON.stringify(filterCompact));
const compactPanel = await page.locator('#panelHist > .body').evaluate(el => getComputedStyle(el).padding);
ok(parseFloat(compactPanel) < panelBefore, 'la densidad compacta reduce el espacio interior de paneles generales', compactPanel);
// La vista Cabina no contiene una tabla HTML con encabezados en estado vacío;
 // probar las preferencias de columnas en Calculadora, que sí contiene tablas reales.
await page.locator('#viewPrefsDone').click();
await page.click('.tabbtn[data-tab="calc"]');
await page.click('#viewPrefsOpen');
ok(await page.locator('#viewPrefsList .view-prefs-item input[aria-label*="Año a año"]').count() === 1, 'la tabla anual conserva su nombre al convertirse en desplegable');
const calcColumnToggles = page.locator('#viewPrefsList .view-prefs-table-group[data-view-tab="calc"] input[aria-label^="Mostrar columna"]');
const allColumnToggles = page.locator('#viewPrefsList input[aria-label^="Mostrar columna"]');
ok(await allColumnToggles.count() > 0, 'el configurador ofrece controles de visibilidad por columna cuando hay tablas');
ok(await calcColumnToggles.count() > 0, 'el configurador identifica las columnas pertenecientes a Calculadora');
if (await calcColumnToggles.count() > 0) {
  const columnToggle = calcColumnToggles.first();
  await columnToggle.uncheck();
  const columnPrefs = await page.evaluate(() => JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}'));
  ok(Object.keys(columnPrefs.columns?.calc || {}).length > 0, 'las columnas ocultas se guardan separadas por pestaña');
  await columnToggle.check();
}
await page.locator('#viewPrefsDone').click();
await page.click('.tabbtn[data-tab="cabina"]');
await abreCabOps(page);
await page.click('#viewPrefsOpen');
ok(await page.locator('#viewPrefsList .view-prefs-table-group[data-view-tab="calc"] input[aria-label^="Mostrar columna"]').count() > 0, 'desde Cabina se pueden configurar las columnas de Calculadora sin cambiar de pestaña');

await page.locator('#viewPrefsDone').click();
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
ok(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden')), 'el módulo oculto persiste al recargar');
ok(await page.locator('body').getAttribute('data-density') === 'compact', 'la densidad elegida persiste al recargar');
await page.click('#viewPrefsOpen');
await page.click('#viewPrefsReset');
ok(!(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden'))), 'restaurar esta pestaña vuelve a mostrar todos sus módulos');
await page.locator('#viewPrefsDone').click();
await page.click('.tabbtn[data-tab="futuros"]');
await page.click('#viewPrefsOpen');
const importCheckbox = page.locator('#viewPrefsList input[aria-label*="Importar operaciones"]');
ok(await importCheckbox.count() === 1, 'la pestaña Futuros expone sus propios módulos');
await importCheckbox.uncheck();
ok(await page.locator('#panelImportar').evaluate(el => el.classList.contains('user-view-hidden')), 'se puede ocultar un módulo de Futuros sin afectar otras pestañas');
const tabStored = await page.evaluate(() => JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}'));
ok(Array.isArray(tabStored.hidden.futuros) && tabStored.hidden.futuros.includes('panelImportar'), 'las preferencias de Futuros se guardan por separado');
await page.locator('#viewPrefsDone').click();
await page.click('.tabbtn[data-tab="cabina"]');
await abreCabOps(page);
ok(!(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden'))), 'la configuración de Futuros no oculta módulos de Cabina');
await page.click('.tabbtn[data-tab="futuros"]');
await page.click('#viewPrefsOpen');
await page.click('#viewPrefsReset');
await page.locator('input[name="viewDensity"][value="comfortable"]').check();
await page.locator('#viewPrefsDone').click();
ok(!(await page.locator('#panelImportar').evaluate(el => el.classList.contains('user-view-hidden'))), 'restaurar Futuros vuelve a mostrar sus módulos');

console.log('\\n═══ COBERTURA DE TODAS LAS PESTAÑAS ═══');
for (const [tab, label] of [
  ['edge', 'Métricas / Edge'],
  ['invest', 'Inversiones'],
  ['playbook', 'Playbook'],
  ['ideas', 'Formas de hacer dinero'],
  ['calc', 'Calculadora'],
  ['estudio', 'Estudio'],
]) {
  await page.click('.tabbtn[data-tab="' + tab + '"]');
  await page.click('#viewPrefsOpen');
  const count = await page.locator('#viewPrefsList .view-prefs-item').count();
  ok(count > 0, label + ' expone módulos configurables', count + ' módulos');
  await page.locator('#viewPrefsDone').click();
}
await page.click('.tabbtn[data-tab="cabina"]');
await abreCabOps(page);
await page.waitForFunction(() => localStorage.getItem('cabina:migracion:mathengine:v1'));
const journalBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith('cabina-view'))));
await page.locator('#panelHist .view-fold-toggle').click();
ok(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-folded')), 'plegar conserva el panel y oculta su contenido');
await page.click('#viewPrefsOpen');
await page.selectOption('#viewLayout', 'single');
await page.selectOption('#viewCharts', 'small');
await page.selectOption('#viewText', 'large');
await page.fill('#viewName', 'Revisión semanal');
await page.click('#viewSave');
await page.selectOption('#viewLayout', 'balanced');
await page.selectOption('#viewSaved', { label: 'Revisión semanal' });
await page.click('#viewLoad');
ok(await page.locator('#viewLayout').inputValue() === 'single', 'la vista guardada restaura su distribución');
await page.click('#viewPrefsDone');
await page.reload();
await page.waitForFunction(() => typeof window.FUT !== 'undefined');
ok(await page.locator('.tab[data-tab="cabina"]').getAttribute('data-view-charts') === 'small', 'tamaño de gráficos persiste');
ok(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-folded')), 'panel plegado persiste');
ok(await page.locator('.tab[data-tab="invest"]').getAttribute('data-view-layout') === 'original', 'el diseño de otras páginas se conserva');
await page.click('#viewPrefsOpen');
await page.selectOption('#viewSaved', { label: 'Revisión semanal' });
await page.click('#viewDelete');
ok(await page.locator('#viewSaved option').count() === 1, 'eliminar una vista conserva el diseño actual');
await page.click('#viewPrefsDone');
const journalAfter = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith('cabina-view'))));
ok(JSON.stringify(journalBefore) === JSON.stringify(journalAfter), 'personalizar y restaurar no modifica otros datos guardados', JSON.stringify(Object.keys({...journalBefore,...journalAfter}).filter(k => journalBefore[k] !== journalAfter[k]).map(k => ({key:k,before:journalBefore[k],after:journalAfter[k]}))));
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#viewPrefsOpen', { force: true });
ok(await page.locator('.view-prefs-dialog').evaluate(el => el.getBoundingClientRect().width <= innerWidth), 'configurador cabe en móvil');
/* Las capturas son opcionales (CABINA_CAPTURE=1). Un path relativo fuera del
   repo tumba la suite en CI cuando la carpeta no existe. */
if (process.env.CABINA_CAPTURE === '1') {
  const outputs = join(raiz, 'outputs');
  mkdirSync(outputs, { recursive: true });
  await page.locator('.view-prefs-dialog').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: join(outputs, 'cabina-ajustes-movil.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.view-prefs-dialog').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: join(outputs, 'cabina-ajustes.png') });
} else {
  await page.setViewportSize({ width: 1440, height: 1000 });
}
ok(errors.length === 0, 'sin errores JavaScript en el flujo de preferencias', errors.join(' | ') || 'ninguno');
await browser.close();
await new Promise(resolve => srv.close(resolve));
console.log(`\\n${fallos.length ? '❌' : '✅'} vista-personalizable · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
