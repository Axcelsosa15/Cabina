/* Una misma captura se enlaza desde la entrada de FUTUROS a ESTUDIO,
   sin duplicar el objeto y sin romper el journal al desvincularla. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (v, title, detail) => {
  console.log('  ' + (v ? '✅' : '❌') + ' ' + title + (detail == null ? '' : '   ' + detail));
  if (!v) fallos.push(title);
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = nubeDoble(readFileSync(join(root, 'index.html'), 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const uid = await D.conSesion(ctx, 'capturas-link@prueba.invalid');
const page = await ctx.newPage();
const errors = [], csp = [];
page.on('pageerror', e => errors.push(e.message));
await ctx.exposeBinding('__cspError', (_, m) => csp.push(m));
await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__cspError(e.violatedDirective)));
await page.goto('file://' + join(root, 'index.html'), { waitUntil: 'load' });
await page.waitForFunction(() => typeof FUT !== 'undefined');
await quieto(page, 60, 3000);

const review = () => D.filasDe(uid).find(f => f.path.startsWith('research/') && f.data.type === 'trade-review');
async function openStudio() {
  await page.click('.tabbtn[data-tab="estudio"]');
  await page.waitForSelector('#studyTradeList [data-study-trade]');
  await page.click('#studyTradeList [data-study-trade]');
  await quieto(page);
}
async function openFutureEdit() {
  await page.click('.tabbtn[data-tab="futuros"]');
  await page.click('#ftSeg button[data-v="diario"]');
  await page.waitForSelector('#jrTable button[data-act="edit"]');
  await page.click('#jrTable button[data-act="edit"]');
  await page.waitForSelector('#edShots select[data-study-slot]');
}
async function save() {
  await page.click('#edSave');
  await quieto(page, 90, 3500);
}

console.log('\n═══ CAPTURA → ESCENARIO DE ESTUDIO · editor móvil ═══');
await page.click('.tabbtn[data-tab="futuros"]');
await page.click('#ftNew');
await page.waitForSelector('#edShots button[data-act="add"]');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#edShots button[data-act="add"][data-source="gallery"]')]);
await chooser.setFiles({ name: 'entrada.png', mimeType: 'image/png', buffer: PNG });
await page.waitForSelector('#edShots select[data-study-slot="0"]');
ok(await page.locator('#edShots select[data-study-slot="0"] option').count() === 10,
  'la imagen ofrece 9 destinos de estudio más FUTUROS');
await page.selectOption('#edShots select[data-study-slot="0"]', 'entrada:15m');
await save();
await page.waitForFunction(() => FUT.trades().some(t => Array.isArray(t.images) && t.images.length > 0));
const trade = await page.evaluate(() => FUT.trades().find(t => t.images && t.images.length));
const keys = [...D.e.objetos.keys()];
ok(keys.length === 1 && keys[0].startsWith(uid + '/'), 'se subió un solo archivo privado', keys.join(', '));
ok(trade && trade.images[0].id === keys[0].split('/')[1], 'FUTUROS mantiene la referencia original');
await page.waitForFunction(() => !!document.querySelector('.tabbtn[data-tab="estudio"]'), null);
await quieto(page, 90, 3500);
ok(review() && review().data.scenes['entrada:15m']?.[0]?.id === trade.images[0].id,
  'el documento research enlaza entrada:15m al mismo objeto');
ok(review() && review().data.tradeId === String(trade.id), 'vínculo por ID del trade, no por fecha o instrumento');
ok(review() && review().data.scenesOnly === true, 'adjuntar una foto no equivale a completar la revisión');

await openStudio();
ok(await page.locator('#studyScenes figure[data-escena-fig="entrada:15m"] img').count() === 1,
  'ESTUDIO muestra la imagen en 15 minutos');
ok(await page.locator('#studyScenes figure[data-escena-fig="htf:1D"]').count() === 0,
  'no inventa otras temporalidades');

console.log('\n═══ REASIGNAR · no crea otro archivo ni otra revisión ═══');
await openFutureEdit();
ok(await page.locator('#edShots select[data-study-slot="0"]').inputValue() === 'entrada:15m',
  'al editar recuerda el destino anterior');
await page.selectOption('#edShots select[data-study-slot="0"]', 'htf:4H');
await save();
await quieto(page);
ok(review() && review().data.scenes['htf:4H']?.[0]?.id === trade.images[0].id,
  'reubicar a 4 horas actualiza el escenario');
ok(review() && !review().data.scenes['entrada:15m'], 'elimina la referencia del escenario anterior');
ok(D.e.objetos.size === 1, 'reubicar no duplica objetos');

console.log('\n═══ QUITAR DEL ESTUDIO · conservar la captura del trade ═══');
await openStudio();
const rm = '#studyScenes button[data-escena-rm="htf:4H"]';
await page.click(rm); await page.click(rm);
await quieto(page, 90, 3000);
ok(review() && !review().data.scenes['htf:4H'], 'desvincular la escena actualiza research');
ok(D.e.objetos.size === 1, 'el archivo permanece porque FUTUROS aún lo referencia');
ok((await page.evaluate(() => FUT.trades().find(t => t.id === document.getElementById('studyTradeId').value)?.images.length)) === 1,
  'el trade conserva la imagen sin cambios');

console.log('\n═══ BORRAR DESDE FUTUROS · cleanup final ═══');
await openFutureEdit();
await page.click('#edShots button[data-act="rm"]'); await page.click('#edShots button[data-act="rm"]').catch(() => {});
await quieto(page);
ok(D.e.objetos.size === 0, 'cuando ya no está en estudio, quitarla del editor libera el objeto');
await save();
ok(await page.evaluate(() => FUT.trades().every(t => !t.images || !t.images.length)), 'el journal guarda la operación sin imágenes');
ok(csp.length === 0, 'sin violaciones CSP', csp.join(' | ') || 'ninguna');
ok(errors.length === 0, 'sin errores JavaScript', errors.join(' | ') || 'ninguno');
await browser.close();
console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' · ') : ''));
process.exit(fallos.length ? 1 : 0);
