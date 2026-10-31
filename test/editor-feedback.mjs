/* Regresión del editor: los errores se mantienen visibles y accesibles, y el
   teclado de enteros no ofrece decimales en móvil. Sin escribir datos al backend. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const ok = (condition, name, detail = '') => {
  console.log('  ' + (condition ? '✅' : '❌') + ' ' + name + (detail ? '   ' + detail : ''));
  if (!condition) fallos.push(name);
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
try {
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(selected => {
      localStorage.setItem('cabina-appearance:v1', JSON.stringify({ mode: selected, accent: 'default', custom: '#1d4ed8' }));
      localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings: { accounts: [], rules: [], meta: {} } }));
    }, mode);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

    await page.locator('#mobileMoreBtn').click();
    await page.locator('#mobileMoreOv [data-mobile-more-tab="ajustes"]').click();
    await page.locator('#bkPaste').click();
    await page.locator('#edFields textarea').fill('NO ES JSON');
    await page.locator('#edSave').click();
    const alert = page.locator('#edValidationError');
    ok(await alert.isVisible(), mode + ' · error persistente dentro del formulario');
    const measured = await alert.evaluate(el => {
      const st = getComputedStyle(el);
      return { text: el.textContent.trim(), role: el.getAttribute('role'),
        focused: document.activeElement === el, color: st.color, bg: st.backgroundColor,
        expected: getComputedStyle(document.documentElement).getPropertyValue('--negative').trim() };
    });
    ok(measured.role === 'alert' && measured.focused && measured.text.length > 4,
      mode + ' · error anunciado y enfocado', JSON.stringify(measured));
    await page.waitForTimeout(2400);
    ok(await alert.isVisible() && await page.locator('#ov.open').count() === 1,
      mode + ' · el error no se borra tras 2.2 segundos');
    await page.locator('#edFields textarea').fill('REINTENTO');
    ok(await alert.count() === 0, mode + ' · se limpia el error cuando el usuario corrige');
    await page.locator('#edCancel').click();

    await page.locator('.tabbtn[data-tab="cabina"]').click();
    const open = page.locator('#accts .vacio button').first();
    ok(await open.count() === 1, mode + ' · cuenta vacía ofrece abrir su editor');
    if (await open.count() === 1) {
      await open.click();
      const inputs = await page.evaluate(() => {
        const keys = ['qty','r_maxContracts','r_maxLosses','r_minDays'];
        return keys.map(k => ({ key: k, el: document.getElementById('ef_' + k) }))
          .filter(x => x.el).map(x => ({ key: x.key, type: x.el.type, keyboard: x.el.inputMode }));
      });
      ok(inputs.length > 0 && inputs.every(x => x.type === 'number' && x.keyboard === 'numeric'),
        mode + ' · enteros usan teclado numeric', JSON.stringify(inputs));
      await page.locator('#edCancel').click();
    }
    ok(errors.length === 0, mode + ' · cero errores de JavaScript', errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS editor-feedback · validación persistente y teclado de enteros');
