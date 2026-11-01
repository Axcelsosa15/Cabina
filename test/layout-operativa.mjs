/* Regresiones de la auditoría: acceso al registro móvil, filtros persistentes y
   reglas legibles dentro de un panel estrecho, no sólo de un viewport estrecho. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
let failed = 0;
const check = (condition, label) => { console.log(`  ${condition ? '✅' : '❌'} ${label}`); if (!condition) failed++; };
try {
  for (const width of [390, 820, 1320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!window.FUT);
    const rule = await page.locator('#rules .rulec').nth(1).evaluate(el => {
      const input = el.querySelector('input.rvin').getBoundingClientRect();
      const note = el.querySelector('.rnow');
      const toggle = el.querySelector('.rtog').getBoundingClientRect();
      return { inputWidth: input.width, noteFits: note.scrollWidth <= note.clientWidth + 1, toggleHeight: toggle.height };
    });
    check(rule.inputWidth >= 60 && rule.noteFits && rule.toggleHeight >= 43.5,
      `${width}px · límite editable, explicación completa y detalle accesible ${JSON.stringify(rule)}`);
    await page.locator('#tabnav [data-tab="futuros"]').click();
    const cta = await page.locator('#ftNew').boundingBox();
    const filter = await page.locator('#ftAcct').boundingBox();
    check(cta.y < filter.y && cta.y + cta.height < 740,
      `${width}px · Nueva operación aparece antes de los filtros y dentro de la primera pantalla`);
    const details = page.locator('#ftMoreFilters');
    check((await details.getAttribute('open') !== null) === (width > 700),
      `${width}px · filtros secundarios plegados sólo al iniciar en móvil`);
    if (width <= 700) await details.locator('summary').click();
    await page.locator('#ftQ').fill('prueba sin coincidencias');
    await page.locator('#ftMoreCount').waitFor({ state: 'visible' });
    await details.locator('summary').click();
    check(await page.locator('#ftMoreCount').textContent() === '1 activo' &&
      await page.locator('#ftFilters').isVisible(),
      `${width}px · un filtro plegado sigue anunciado y se puede quitar desde su chip`);
    await page.locator('#ftFilters [data-clr="q"]').click();
    check(await page.locator('#ftMoreCount').isHidden() && await page.locator('#ftQ').inputValue() === '',
      `${width}px · quitar el chip limpia el filtro y el contador`);
    await page.locator('#ftNew').click();
    check(await page.locator('#ov').isVisible() && await page.locator('#ef_instrument').isVisible(),
      `${width}px · acción principal abre el formulario real`);
    await page.locator('#edCancel').click();
    await page.locator('#ftSeg [data-v="diario"]').click();
    check(await page.locator('#ftSeg [data-v="diario"]').getAttribute('aria-pressed') === 'true',
      `${width}px · subvista seleccionada anunciada con semántica`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && !errors.length,
      `${width}px · sin desbordamiento ni errores de ejecución`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
console.log('fallos: ' + failed);
if (failed) process.exitCode = 1;
