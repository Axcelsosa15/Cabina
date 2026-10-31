/* Regresión de layout del cockpit: Resumen + Futuros.
 * Los puntos de corte son los del diseño; no escribe datos del usuario.
 * Incluido automáticamente en test/correr.mjs y la compuerta de CI. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const check = (ok, label, detail = '') => {
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!ok) fallos.push(label);
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  for (const width of [1500, 820, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/');
      await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
      const cabina = await page.evaluate(() => {
        const tab = document.querySelector('.tab[data-tab="cabina"]');
        const accts = document.getElementById('panelAccts');
        const checkPanel = document.getElementById('panelCheck');
        const rules = document.getElementById('panelRules');
        const cal = document.getElementById('panelCabCal');
        const visible = element => element && getComputedStyle(element).display !== 'none';
        const radius = checkPanel ? parseFloat(getComputedStyle(checkPanel).borderTopLeftRadius) : 0;
        return {
          active: !!tab?.classList.contains('active'),
          panels: [accts, checkPanel, rules, cal].every(visible),
          radius,
          checklist: !!document.getElementById('checkList'),
          editingControls: !!document.getElementById('addRule') && !!document.getElementById('addCheck')
        };
      });
      check(cabina.active && cabina.panels && cabina.checklist && cabina.editingControls,
        width + 'px · paneles y controles de Resumen conservados');
      check(cabina.radius >= 8 && cabina.radius <= 12,
        width + 'px · superficies de Resumen usan radio sobrio', String(cabina.radius));

      await page.locator('#tabnav .tabbtn[data-tab="futuros"]').click();
      await page.locator('#ftTiles .tile').first().waitFor({ timeout: 15000 });
      const stats = await page.evaluate(() => {
        const tileEls = [...document.querySelectorAll('#ftTiles .tile')];
        const rects = tileEls.map(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
        });
        const heading = document.querySelector('#qeSec > header h2');
        const charts = ['eqWrap', 'uwWrap', 'dailyWrap', 'rollWrap'].map(id => {
          const el = document.getElementById(id);
          return el ? el.getBoundingClientRect().width : 0;
        });
        const rows = new Set(rects.map(r => Math.round(r.top))).size;
        return {
          active: !!document.querySelector('.tab[data-tab="futuros"]')?.classList.contains('active'),
          count: tileEls.length,
          labels: tileEls.every(el => !!el.querySelector('.lab')?.textContent.trim()),
          rows,
          widthsOK: rects.every(r => r.width > 90 && r.left >= -1 && r.right <= innerWidth + 1),
          chartWidthsOK: charts.every(v => v > 120),
          heading: heading?.textContent.trim(),
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });
      check(stats.active && stats.count >= 5 && stats.labels,
        width + 'px · KPIs siguen accesibles con sus etiquetas', 'tiles=' + stats.count);
      check(stats.widthsOK && !stats.overflow,
        width + 'px · rejilla sin desbordamiento horizontal', 'rows=' + stats.rows);
      check(stats.chartWidthsOK && stats.heading === 'Radiografía cuantitativa',
        width + 'px · cuatro gráficas y radiografía presentes');
      check(errors.length === 0,
        width + 'px · sin errores de JavaScript', errors.slice(0, 3).join(' | '));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS workspace-ui');
