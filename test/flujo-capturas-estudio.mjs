/* FUTUROS → ESTUDIO · un objeto privado, dos vistas, ningún trade duplicado.
   Prueba navegador real contra el doble de nube y almacenamiento del proyecto. */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [], errores = [], csp = [];
const ok = (c, nombre, detalle = '') => {
  console.log('  ' + (c ? '✅' : '❌') + ' ' + nombre + (detalle ? '   ' + detalle : ''));
  if (!c) fallos.push(nombre);
};
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const D = nubeDoble(html);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch();
async function abre(email, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 850 } });
  await ctx.exposeBinding('__csp', (_, v) => csp.push(v));
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
    window.__csp(e.violatedDirective + ' ' + (e.blockedURI || 'inline'))));
  const uid = await D.conSesion(ctx, email);
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await p.goto('file://' + join(raiz, 'index.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 2500);
  return { ctx, p, uid };
}
async function adjunta(p, nombre) {
  const [picker] = await Promise.all([
    p.waitForEvent('filechooser'),
    p.click('#edShots button[data-act="add"][data-source="gallery"]')
  ]);
  await picker.setFiles({ name: nombre, mimeType: 'image/png', buffer: PNG });
  await p.waitForFunction(n => document.querySelectorAll('#edShots figure.pbimg').length >= n,
    nombre === 'a.png' ? 1 : nombre === 'b.png' ? 2 : nombre === 'c.png' ? 3 : 1, { timeout: 8000 });
  await quieto(p);
}
async function enEstudio(p) {
  await p.click('.tabbtn[data-tab="estudio"]');
  await p.waitForSelector('#studyTradeList [data-study-trade]', { timeout: 8000 });
  await p.click('#studyTradeList [data-study-trade]');
  await quieto(p);
}

console.log('\n═══ 1 · desde entrada de datos, tres capturas y dos timeframes ═══');
const ana = await abre('capturas-estudio@prueba.invalid');
await ana.p.click('.tabbtn[data-tab="futuros"]');
await ana.p.click('#ftNew');
await ana.p.waitForSelector('#edShots');
await adjunta(ana.p, 'a.png');
await ana.p.locator('#edShots select[data-scene="0"]').selectOption('htf:4H');
await adjunta(ana.p, 'b.png');
await ana.p.locator('#edShots select[data-scene="1"]').selectOption('entrada:3m');
await adjunta(ana.p, 'c.png'); // legacy / sin clasificar no inventa timeframe
ok(await ana.p.locator('#edShots select[data-scene]').count() === 3, 'cada captura tiene selector propio');
await ana.p.click('#edSave');
await quieto(ana.p, 60, 3500);
const t = await ana.p.evaluate(() => FUT.trades().find(x => Array.isArray(x.images) && x.images.length === 3));
ok(!!t, 'el trade tiene las tres referencias');
ok(t && t.images[0].scene === 'htf:4H' && t.images[1].scene === 'entrada:3m' && !t.images[2].scene,
  'dos clasificadas y otra sin clasificar, sin asignación falsa');
ok(t && t.images.every(x => x.id && !x.data), 'las imágenes no se incrustan en el trade');
ok(D.e.objetos.size === 3 && [...D.e.objetos.keys()].every(k => k.startsWith(ana.uid + '/')),
  'tres objetos privados, todos de su dueño');

console.log('\n═══ 2 · ESTUDIO las muestra en la fase correcta sin duplicar almacenamiento ═══');
await enEstudio(ana.p);
const slot = k => '#studyScenes figure[data-escena-fig="' + k + '"]';
ok(await ana.p.locator(slot('htf:4H')).count() === 1, '4 horas aparece en Antes');
ok(await ana.p.locator(slot('entrada:3m')).count() === 1, '3 minutos aparece en Entrada');
ok(await ana.p.locator('#studyScenes section').filter({ hasText: 'Sin clasificar' }).locator('img').count() >= 1,
  'una captura no clasificada también es accesible');
ok(await ana.p.locator('#studyScenes button[data-escena-rm="htf:4H"]').count() === 0,
  'ESTUDIO no ofrece borrar un objeto todavía usado por FUTUROS');
ok(!D.filasDe(ana.uid).some(f => f.path.startsWith('research/') && f.data.type === 'trade-review'),
  'no se crea otra revisión ni se duplica la imagen al ver el trade');
ok(D.e.objetos.size === 3, 'solo hay tres objetos, no seis');

console.log('\n═══ 3 · en otra sesión sigue sincronizado ═══');
const segunda = await abre('capturas-estudio@prueba.invalid', 1280);
await enEstudio(segunda.p);
await segunda.p.waitForFunction(() => {
  const i = document.querySelector('#studyScenes figure[data-escena-fig="htf:4H"] img');
  return i && i.src.startsWith('blob:') && i.naturalWidth === 1;
}, null, { timeout: 8000 });
ok(await segunda.p.locator(slot('htf:4H')).count() === 1, 'otro navegador conserva la asignación');
ok((await segunda.p.locator(slot('htf:4H') + ' img').getAttribute('src')).startsWith('blob:'),
  'la imagen se lee del bucket autenticado');

console.log('\n═══ 4 · reclasificar desde ESTUDIO abre el editor del trade ═══');
await segunda.p.click('#studyScenes [data-study-edit-shots]');
await segunda.p.waitForSelector('#edShots select[data-scene="2"]');
await segunda.p.locator('#edShots select[data-scene="2"]').selectOption('post:salida');
await segunda.p.locator('#edShots select[data-scene="0"]').selectOption('htf:1D');
await segunda.p.click('#edSave');
await quieto(segunda.p, 60, 3500);
await enEstudio(segunda.p);
ok(await segunda.p.locator(slot('post:salida')).count() === 1, 'la captura movida aparece en Salida');
ok(await segunda.p.locator(slot('htf:1D')).count() === 1, 'la captura movida aparece en Diario');
ok(await segunda.p.locator(slot('htf:4H')).count() === 0, 'ya no aparece en el timeframe antiguo');
ok(await segunda.p.locator('#studyScenes section').filter({ hasText: 'Sin clasificar' }).count() === 0,
  'la galería sin clasificar desaparece cuando se asignan todas');
ok(D.e.objetos.size === 3, 'reclasificar no vuelve a subir ni borra objetos');
const otra = await segunda.p.evaluate(() => FUT.trades().find(x => x.images && x.images.length === 3));
ok(t && otra && t.id === otra.id, 'se mantiene el ID del trade original');

console.log('\n═══ 5 · las capturas exclusivas de ESTUDIO siguen independientes ═══');
const [picker] = await Promise.all([
  segunda.p.waitForEvent('filechooser'),
  segunda.p.click('#studyScenes button[data-escena-add="entrada:15m"]')
]);
await picker.setFiles({ name: 'estudio.png', mimeType: 'image/png', buffer: PNG });
await segunda.p.waitForSelector('#studyScenes figure[data-escena-fig="entrada:15m"]');
await quieto(segunda.p, 60, 3000);
const docs = D.filasDe(segunda.uid).filter(f => f.path.startsWith('research/') && f.data.type === 'trade-review');
ok(docs.length === 1 && docs[0].data.scenes['entrada:15m']?.length === 1,
  'ESTUDIO guarda su propia captura en research');
ok((await segunda.p.evaluate(() => FUT.trades().find(x => x.id === document.querySelector('#studyTradeId').value)?.images.length)) === 3,
  'una captura añadida en ESTUDIO no altera el journal');
ok(D.e.objetos.size === 4, 'cuatro capturas únicas en almacenamiento');
console.log('\n═══ 6 · nueva captura de ESTUDIO en timeframe ya usado por FUTUROS ═══');
const [repetida] = await Promise.all([
  segunda.p.waitForEvent('filechooser'),
  segunda.p.click('#studyScenes button[data-escena-add="htf:1D"]')
]);
await repetida.setFiles({ name: 'nota-diaria.png', mimeType: 'image/png', buffer: PNG });
await quieto(segunda.p, 60, 3000);
const finalDocs = D.filasDe(segunda.uid).filter(f => f.path.startsWith('research/') && f.data.type === 'trade-review');
ok(finalDocs.length === 1 && finalDocs[0].data.scenes['htf:1D']?.length === 1,
  'research sólo guarda la captura propia, no una copia del screenshot de FUTUROS');
ok(await segunda.p.locator(slot('htf:1D')).count() === 2,
  'ambas capturas aparecen en la misma fase sin duplicación');
ok(D.e.objetos.size === 5, 'dos capturas visibles, dos IDs diferentes');

console.log('\n\u2550\u2550\u2550 7 \u00b7 abandonar el editor con la subida EN VUELO \u2550\u2550\u2550');
/* El caso que ninguna de las dos pruebas anteriores alcanza. test/capturas.mjs
   cubre cancelar con la imagen YA subida; aquí el editor se cierra mientras el
   objeto viaja, así que llega al bucket cuando ningún trade puede referenciarlo.
   La ruta lenta da una ventana medible: 1,2 s antes de delegar en la nube. */
const antes7 = D.e.objetos.size;
await ana.p.click('.tabbtn[data-tab="futuros"]');
await ana.p.click('#ftNew');
await ana.p.waitForSelector('#edShots');
await ana.ctx.route(D.NUBE + '/storage/v1/object/**', async route => {
  await new Promise(r => setTimeout(r, 1200));
  await route.fallback();
});
const [lenta] = await Promise.all([
  ana.p.waitForEvent('filechooser'),
  ana.p.click('#edShots button[data-act="add"][data-source="gallery"]')
]);
await lenta.setFiles({ name: 'lenta.png', mimeType: 'image/png', buffer: PNG });
const bloqueado = await ana.p.waitForFunction(() => document.getElementById('edSave').disabled === true,
  null, { timeout: 5000 }).then(() => true).catch(() => false);
ok(bloqueado, 'Guardar se desactiva mientras la captura sube');
/* Esperar un contador igual ANTES de que el POST termine daría falso verde.
   Este test exige la respuesta real de subida y de limpieza del bucket. */
const post = ana.p.waitForResponse(res => res.request().method() === 'POST' &&
  res.url().includes('/storage/v1/object/'), { timeout: 15000 }).then(() => true).catch(() => false);
const del = ana.p.waitForResponse(res => res.request().method() === 'DELETE' &&
  res.url().includes('/storage/v1/object/'), { timeout: 15000 }).then(() => true).catch(() => false);
await ana.p.click('#edCancel');
const [postOk, deleteOk] = await Promise.all([post, del]);
const vivos = D.e.objetos.size;
ok(postOk && deleteOk && vivos === antes7, 'la subida cancelada terminó en un DELETE confirmado',
  'POST=' + postOk + ' DELETE=' + deleteOk + ' antes=' + antes7 + ' ahora=' + vivos);
ok(await ana.p.evaluate(() => FUT.trades().length) === 1, 'cancelar a mitad de la subida no crea un trade');
/* Y el editor siguiente no hereda el bloqueo: si Guardar se quedara apagado,
   la operaci\u00f3n siguiente ser\u00eda imposible de registrar. */
await ana.p.click('#ftNew');
await ana.p.waitForSelector('#edShots');
ok(await ana.p.evaluate(() => document.getElementById('edSave').disabled === false),
  'el editor siguiente abre con Guardar disponible');
await ana.p.click('#edCancel');
await ana.ctx.unroute(D.NUBE + '/storage/v1/object/**');

ok(csp.length === 0, 'sin violaciones CSP', csp.join(' | '));
ok(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));

await browser.close();
console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' · ') : ''));
process.exit(fallos.length ? 1 : 0);
