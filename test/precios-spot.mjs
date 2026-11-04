/* Precios negativos en activos spot: error de campo, sin escribir el registro. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`, browser = await chromium.launch();
let failures = 0;
const ok = (v, s) => { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) failures++; };
try {
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 950 } });
    await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await siembra(p, base, { settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [] }, trades: {}, positions: {}, days: {} });
    await arrancada(p, null);
    async function ir(tab) {
      const b = p.locator(`#tabnav [data-tab="${tab}"]`);
      if (await b.isVisible()) await b.click();
      else { await p.locator('#mobileMoreBtn').click(); await p.locator(`[data-mobile-more-tab="${tab}"]`).click(); }
      await quieto(p);
    }
    await ir('invest');
    const cancel = async () => { if (await p.locator('#ov').isVisible()) await p.locator('#edCancel').click(); };
    async function position(market, name, entry, current) {
      await p.locator(`#mlist [data-id="${market}"]`).click();
      await p.locator('#posAdd').click();
      await p.locator('#ef_asset').fill(name); await p.locator('#ef_qty').fill('0.25');
      await p.locator('#ef_entry').fill(entry); await p.locator('#ef_current').fill(current);
    }
    for (const market of ['acciones', 'etfs', 'cripto']) {
      for (const [field, entry, current] of [['entry', '-100', '10'], ['current', '100', '-10']]) {
        await position(market, 'INVALIDA ' + field, entry, current);
        const before = await p.evaluate(() => INV.positions().length);
        await p.locator('#edSave').click();
        ok(await p.locator('#ov').isVisible() && await p.evaluate(() => INV.positions().length) === before, `${width}px · ${market}: ${field} negativo no escribe una posición`);
        ok(await p.locator('#ef_' + field).getAttribute('aria-invalid') === 'true', `${width}px · ${market}: se identifica el campo ${field} para corregirlo`);
        await cancel();
      }
      await position(market, 'CERO ' + market, '0', '0');
      await p.locator('#edSave').click();
      ok(await p.evaluate(name => INV.positions().some(x => x.asset === name && x.entry === 0 && x.current === 0 && x.qty === 0.25), 'CERO ' + market), `${width}px · ${market}: precio cero y cantidad fraccionada siguen admitidos`);
      ok(await p.evaluate(name => { const x = INV.positions().find(x => x.asset === name); return !!x && INV.performance(x.id).costeMedio === 0; }, 'CERO ' + market), `${width}px · ${market}: el coste medio cero no se convierte en dato ausente`);
      await position(market, 'SIN PRECIO ' + market, '100', '');
      await p.locator('#edSave').click();
      ok(await p.evaluate(name => INV.positions().some(x => x.asset === name && x.current == null), 'SIN PRECIO ' + market), `${width}px · ${market}: el precio actual puede quedar sin informar`);
      await p.locator('#ivNew').click();
      await p.locator('#ef_market').selectOption(market); await p.locator('#ef_op').selectOption('compra');
      await p.locator('#ef_asset').fill('COMPRA ' + market); await p.locator('#ef_qty').fill('0.5'); await p.locator('#ef_price').fill('-5');
      const before = await p.evaluate(() => INV.transactions().length);
      await p.locator('#edSave').click();
      ok(await p.locator('#ov').isVisible() && await p.evaluate(() => INV.transactions().length) === before, `${width}px · ${market}: la otra entrada de compras también rechaza un precio negativo`);
      ok(await p.locator('#ef_price').getAttribute('aria-invalid') === 'true', `${width}px · ${market}: la operación señala Precio unitario`);
      if (!(await p.locator('#ov').isVisible())) {
        await p.locator('#ivNew').click(); await p.locator('#ef_market').selectOption(market); await p.locator('#ef_op').selectOption('compra');
        await p.locator('#ef_asset').fill('COMPRA ' + market); await p.locator('#ef_qty').fill('0.5');
      }
      await p.locator('#ef_price').fill('0'); await p.locator('#edSave').click();
      ok(await p.evaluate(name => INV.transactions().some(x => x.asset === name && x.price === 0 && x.qty === 0.5), 'COMPRA ' + market), `${width}px · ${market}: corregir el precio permite guardar`);
    }
    await ir('futuros'); await p.locator('#ftNew').click();
    await p.locator('#ef_instrument').fill('CL'); await p.locator('#ef_entry').fill('-10');
    await p.locator('#edSave').click();
    ok(!(await p.locator('#ov').isVisible()), `${width}px · la validación spot no impone su regla al formulario de futuros`);
    ok(errors.length === 0, `${width}px · sin excepciones JavaScript`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
console.log('fallos: ' + failures); if (failures) process.exitCode = 1;
