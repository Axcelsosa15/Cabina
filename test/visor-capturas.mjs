/* Visor de capturas: teclado, capas y retorno al editor. Sólo datos sintéticos. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`, browser = await chromium.launch();
const data = 'data:image/png;base64,' + readFileSync(new URL('../og.png', import.meta.url)).toString('base64');
let failures = 0;
const ok = (v, s) => { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) failures++; };
try {
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 950 } });
    await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await siembra(p, base, { settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [] }, days: {}, research: {},
      trades: { shot: { id: 'shot', type: 'futuros', instrument: 'MNQ', date: '2026-11-04', time: '09:45', direction: 'long', qty: 1, entry: 100, stop: 95, exit: 110, images: [{ data, name: 'Captura de prueba' }] } } });
    async function study() {
      await p.goto(base); await arrancada(p, null);
      const b = p.locator('#tabnav [data-tab="estudio"]');
      if (await b.isVisible()) await b.click();
      else { await p.locator('#mobileMoreBtn').click(); await p.locator('[data-mobile-more-tab="estudio"]').click(); }
      await p.locator('[data-study-trade="shot"]').click(); await quieto(p);
      return p.locator('#studyScenes img').first();
    }
    let thumb = await study();
    ok(await thumb.evaluate(e => e.tabIndex === 0 && e.getAttribute('role') === 'button'), `${width}px · la miniatura es accesible por teclado y anuncia una acción`);
    await thumb.focus(); await p.keyboard.press('Enter');
    ok(await p.locator('#lightbox').isVisible(), `${width}px · Enter amplía la captura`);
    if (!(await p.locator('#lightbox').isVisible())) await thumb.click();
    ok(await p.evaluate(() => document.getElementById('lightbox').contains(document.activeElement)), `${width}px · abrir sitúa el foco dentro del visor`);
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.getElementById('lightbox').contains(document.activeElement)), `${width}px · Tab permanece dentro del visor`);
    await p.keyboard.press('Shift+Tab');
    ok(await p.evaluate(() => document.getElementById('lightbox').contains(document.activeElement)), `${width}px · Shift+Tab permanece dentro del visor`);
    await p.keyboard.press('Escape');
    ok(!(await p.locator('#lightbox').isVisible()), `${width}px · Escape cierra la imagen`);
    ok(await thumb.evaluate(e => document.activeElement === e), `${width}px · el foco vuelve a la miniatura`);

    thumb = await study(); await thumb.focus(); await p.keyboard.press('Space');
    ok(await p.locator('#lightbox').isVisible(), `${width}px · Espacio también amplía la captura`);
    if (!(await p.locator('#lightbox').isVisible())) await thumb.click();
    const close = p.locator('#lightbox button');
    const hasClose = await close.count() === 1;
    ok(hasClose && await close.isVisible(), `${width}px · hay un botón visible para cerrar`);
    if (hasClose) {
      const box = await close.boundingBox();
      ok(box.width >= 44 && box.height >= 44, `${width}px · el cierre tiene un área de al menos 44 × 44 px`);
      await close.click();
      ok(!(await p.locator('#lightbox').isVisible()), `${width}px · el botón cierra el visor`);
    } else { ok(false, `${width}px · falta el área táctil de cierre`); ok(false, `${width}px · falta cierre por botón`); }

    thumb = await study();
    await p.locator('#studyScenes [data-study-edit-shots]').first().click();
    const image = p.locator('#edShots img').first();
    await image.click();
    ok(await p.evaluate(() => {
      const lb = document.getElementById('lightbox'), r = lb.querySelector('img').getBoundingClientRect();
      return lb.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), `${width}px · la imagen ampliada queda por encima del editor`);
    await p.keyboard.press('Escape');
    ok(!(await p.locator('#lightbox').isVisible()) && await p.locator('#ov').isVisible(), `${width}px · Escape cierra sólo la imagen y conserva el editor`);
    ok(await image.evaluate(e => document.activeElement === e), `${width}px · al cerrar se recupera la captura del editor`);
    ok(errors.length === 0, `${width}px · sin excepciones JavaScript`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
console.log('fallos: ' + failures); if (failures) process.exitCode = 1;
