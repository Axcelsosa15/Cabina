/* Los atajos de página no deben actuar detrás de un diálogo. Datos sintéticos. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
const ok = (v, s) => { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) failures++; };
try {
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 950 } });
    await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await siembra(p, base, { settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [] }, trades: {}, days: {},
      research: { r: { id: 'r', title: 'Documento de prueba', type: 'concept', question: 'Resumen', status: 'todo' } } });
    await arrancada(p, null);
    async function ir(tab) {
      if (await p.locator(`#tabnav [data-tab="${tab}"]`).isVisible()) await p.locator(`#tabnav [data-tab="${tab}"]`).click();
      else { await p.locator('#mobileMoreBtn').click(); await p.locator(`[data-mobile-more-tab="${tab}"]`).click(); }
      await quieto(p);
    }
    const cases = [
      ['Estudio · edición', '#studyClose', async () => { await ir('estudio'); await p.locator('#studyNew').click(); await p.locator('#studyTitle').fill('Borrador sin guardar'); }],
      ['Estudio · lectura', '#studyReaderClose', async () => { await ir('estudio'); await p.locator('[data-study-read="r"]').click(); }],
      ['Registro rápido', '#qkClose', async () => { await p.locator('#quickBtn').click(); }],
      ['Vista', '#viewPrefsClose', async () => { await p.locator('#viewPrefsOpen').click(); }],
      ['Editor compartido', '#edClose', async () => { await ir('ideas'); await p.locator('#idNew').click(); }],
      ['Ayuda', '#settingsHelp [data-settings-close]', async () => { await ir('ajustes'); await p.locator('#settingsHelpOpen').click(); }],
    ];
    if (width === 1366) cases.push(['Cuenta', '#auClose', async () => { await p.locator('#cuentaBtn').click(); }]);
    if (width === 390) cases.push(['Más secciones', '#mobileMoreClose', async () => { await p.locator('#mobileMoreBtn').click(); }]);
    for (const [name, focus, open] of cases) {
      await p.goto(base); await arrancada(p, null); await open();
      const hash = await p.evaluate(() => location.hash);
      await p.locator(focus).focus(); await p.keyboard.press('f');
      ok(await p.evaluate(() => location.hash) === hash, `${width}px · ${name}: F no cambia la sección detrás`);
      await p.locator(focus).focus(); await p.keyboard.press('n');
      ok(await p.locator('#ov.open').count() === (name === 'Editor compartido' ? 1 : 0), `${width}px · ${name}: N no abre otra operación`);
      await p.locator(focus).focus(); await p.keyboard.press('Control+k');
      ok(await p.locator('#cmdOv.open').count() === 0, `${width}px · ${name}: Ctrl+K no superpone la paleta`);
      if (name === 'Estudio · edición') ok(await p.locator('#studyTitle').inputValue() === 'Borrador sin guardar', `${width}px · el borrador de Estudio permanece intacto`);
    }
    await p.goto(base); await arrancada(p, null);
    await p.locator('#quickBtn').focus(); await p.keyboard.press('f');
    ok(await p.evaluate(() => location.hash) === '#futuros', `${width}px · F sigue funcionando fuera de los diálogos`);
    await p.locator('#quickBtn').focus(); await p.keyboard.press('Control+k');
    ok(await p.locator('#cmdOv.open').count() === 1, `${width}px · Ctrl+K abre la paleta sin otro diálogo`);
    await p.keyboard.press('Control+k');
    ok(await p.locator('#cmdOv.open').count() === 0, `${width}px · Ctrl+K conserva el cierre de la paleta`);
    ok(errors.length === 0, `${width}px · sin excepciones JavaScript`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
