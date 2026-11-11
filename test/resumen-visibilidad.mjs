/* UNA SOLA VERDAD PARA «¿SE VE ESTE PANEL?».
   Resumen tiene ahora dos editores —el diálogo de vistas de siempre y el lienzo
   nuevo— y los dos deciden si un panel se ve. Si cada uno guarda la respuesta en
   su propio sitio, uno pisa al otro y la interfaz miente: el defecto medido era
   que en cuanto había un lienzo guardado el diálogo quedaba MUERTO para los ocho
   paneles de Resumen —la preferencia se escribía, la casilla se desmarcaba y el
   panel seguía viéndose—, porque el pase final de `applyViewPrefs` sobreescribía
   la visibilidad con `canvasItems[].hidden`.
   Aquí se comprueba en las dos direcciones y con el estado guardado, porque un
   control que informa de algo que no ha hecho es peor que un control que falla. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.route('**/*', r => r.request().url().startsWith(origin) ? r.continue() : r.abort());
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push(e.message));
await page.goto(origin);
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

const oculto = id => page.locator('#' + id).evaluate(el => el.classList.contains('user-view-hidden'));
const guardado = () => page.evaluate(() => ((JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}').hidden) || {}).cabina || []);
const casilla = () => page.locator('#viewPrefsList input[aria-label*="Últimas 14 sesiones"]');
const abreDialogo = async () => { await page.click('#viewPrefsOpen'); await page.waitForSelector('#viewPrefs:not([hidden])'); };

console.log('\n═══ §1 · SIN LIENZO, EL DIÁLOGO DE VISTAS MANDA ═══');
await abreDialogo();
await casilla().uncheck();
ok(await oculto('panelHist'), 'sin lienzo guardado, ocultar desde el diálogo oculta el panel');
await casilla().check();
ok(!(await oculto('panelHist')), 'y mostrar lo devuelve');
await page.locator('#viewPrefsDone').click();

console.log('\n═══ §2 · CON UN LIENZO GUARDADO, EL DIÁLOGO SIGUE MANDANDO ═══');
await page.locator('#cabCanvasEdit').click();
await page.locator('#cabCanvasPanel').selectOption('panelRules');
for (const [k, v] of Object.entries({ x: 1, y: 150, w: 6, h: 8 })) await page.locator('#cabCanvas-' + k).fill(String(v));
await page.locator('#cabCanvasApply').click();
await page.locator('#cabCanvasSave').click();
ok(/guardada/.test(await page.locator('#cabCanvasStatus').textContent()), 'hay una distribución de lienzo guardada',
   (await page.locator('#cabCanvasStatus').textContent()).slice(0, 48));

await abreDialogo();
await casilla().uncheck();
const trasOcultar = await oculto('panelHist'), prefTrasOcultar = await guardado();
ok(trasOcultar, 'CON lienzo guardado, ocultar desde el diálogo oculta el panel');
/* Lo que delató el defecto: los tres estados se contradecían entre sí. */
ok(prefTrasOcultar.includes('panelHist') === trasOcultar,
   'lo guardado y lo pintado dicen lo mismo',
   `preferencia=${JSON.stringify(prefTrasOcultar)} · pintado oculto=${trasOcultar}`);
ok(!(await casilla().isChecked()) === trasOcultar, 'y la casilla no informa de algo que no ha hecho');
await casilla().check();
ok(!(await oculto('panelHist')), 'y mostrar lo devuelve, también con lienzo');
await page.locator('#viewPrefsDone').click();

console.log('\n═══ §3 · EL LIENZO ES UNA TRANSACCIÓN: CANCELAR DESHACE, GUARDAR VUELCA ═══');
/* Esta sección se escribió primero al revés —dando por hecho que el editor de
   lienzo escribe al momento— y sus dos aserciones salieron en rojo contra el
   código corregido. El rojo tenía razón: `resumen-cuadricula.mjs` ya exigía que
   Cancelar devolviera el panel, o sea que el editor es deliberadamente una
   transacción. Lo que estaba mal era mi aserción, no el modelo; aquí se
   comprueba el contrato que el editor SÍ tiene. */
await page.locator('#cabCanvasEdit').click();
await page.locator('#cabCanvasPanel').selectOption('panelHist');
await page.locator('#cabCanvasVisible').uncheck();
ok(await oculto('panelHist'), 'ocultar desde el editor de lienzo oculta el panel al momento');
ok(!(await guardado()).includes('panelHist'), 'pero no lo guarda todavía: es un cambio pendiente',
   JSON.stringify(await guardado()));
await page.locator('#cabCanvasCancel').click();
ok(!(await oculto('panelHist')), 'y Cancelar lo deshace, como exige resumen-cuadricula');

await page.locator('#cabCanvasEdit').click();
await page.locator('#cabCanvasPanel').selectOption('panelHist');
await page.locator('#cabCanvasVisible').uncheck();
await page.locator('#cabCanvasSave').click();
ok((await guardado()).includes('panelHist'), 'al GUARDAR, lo anota donde el diálogo lo va a leer',
   JSON.stringify(await guardado()));
const lienzoGuardado = await page.evaluate(() => {
  const c = (JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}').pages || {}).cabina || {};
  return Object.values(c.canvas || {}).flat().some(i => 'hidden' in i);
});
ok(!lienzoGuardado, 'y NO la duplica dentro del lienzo guardado: un solo almacén');
await abreDialogo();
ok(!(await casilla().isChecked()), 'el diálogo refleja lo que guardó el lienzo');
await casilla().check();
ok(!(await oculto('panelHist')), 'y puede devolverlo: ningún panel queda atrapado');
await page.locator('#viewPrefsDone').click();

ok(errores.length === 0, 'sin errores de página en todo el recorrido', errores.join(' | ') || 'ninguno');
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
await browser.close(); server.close();
process.exit(fallos.length ? 1 : 0);
