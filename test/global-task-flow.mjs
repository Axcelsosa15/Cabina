/* Reorganizar una pantalla no puede cambiar el registro que la alimenta.
   Esta prueba usa sólo los ficheros publicados y datos sintéticos. Recorre
   preparar → registrar → revisar → analizar; los detalles secundarios se
   abren con teclado y las advertencias siguen visibles sin abrirlos. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { sirvePublicado } from './publicado.mjs';
import { arrancada, quieto, siembra, enDisco, SEMILLA, despliegaAncestros } from './espera.mjs';

const failures = [];
const check = (yes, label, detail = '') => {
  console.log(`  ${yes ? '✅' : '❌'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!yes) failures.push(label);
};
const seed = JSON.parse(SEMILLA);
seed.settings.checks = [{ id: 'flow-ready', t: 'Confirmar el plan de prueba', s: 'Dato sintético', gate: true }];
const marker = 'GLOBAL_TASK_FLOW';
const fixed = Date.parse('2026-09-17T14:00:00Z');
const routes = ['cabina', 'futuros', 'historial', 'edge', 'cuentas', 'invest', 'playbook', 'ideas', 'estudio', 'calc', 'ajustes', 'calendario', 'diario', 'estadisticas', 'correlaciones', 'insights'];
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];

async function navigate(page, route) {
  const button = page.locator(`#tabnav .tabbtn[data-tab="${route}"]`);
  if (await button.isVisible()) await button.click();
  else {
    await page.locator('#mobileMoreBtn').click();
    await page.locator(`[data-mobile-more-tab="${route}"]`).click();
  }
  await page.locator(`.tab.active[data-tab="${route}"]`).waitFor();
  await quieto(page);
}

const reveal = despliegaAncestros;

const financialSnapshot = page => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}');
  return JSON.stringify({ trades: d.trades, days: d.days, positions: d.positions,
    accounts: d.settings?.accounts, investmentAccounts: d.settings?.meta?.investAccounts,
    scenarios: d.scenarios, risk: d.risk });
});

async function checkDisclosures(page, route, viewport) {
  const details = page.locator(`.tab.active details.ui-disclosure`);
  const before = await financialSnapshot(page);
  let reached = 0;
  for (let i = 0; i < await details.count(); i++) {
    const detail = details.nth(i);
    await reveal(detail);
    const summary = detail.locator(':scope > summary');
    if (!(await summary.isVisible())) continue;
    const wasOpen = await detail.evaluate(el => el.open);
    await summary.focus();
    await page.keyboard.press('Enter');
    check(await detail.evaluate(el => el.open) !== wasOpen,
      `${viewport} · ${route}: el detalle «${(await summary.textContent()).trim().slice(0, 50)}» responde al teclado`);
    await page.keyboard.press('Enter');
    check(await detail.evaluate(el => el.open) === wasOpen,
      `${viewport} · ${route}: el detalle vuelve a su estado inicial`);
    reached++;
  }
  if (reached) check(await financialSnapshot(page) === before,
    `${viewport} · ${route}: abrir detalles conserva operaciones, sesiones, cuentas y escenarios`);
  return reached;
}

try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(time => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [time])); }
      static now() { return time; }
    };
  }, fixed);
  await siembra(page, origin + '/#cabina', seed);
  await arrancada(page, null);

  console.log('\n═══ PREPARAR Y REGISTRAR ═══');
  await reveal(page.locator('#checkList'));
  await page.locator('#chk_flow-ready').check();
  await reveal(page.locator('#preSave'));
  await page.locator('#preSave').click();
  await enDisco(page, d => Object.values(d.days || {}).some(day => Object.values(day.pres || {}).some(pre => pre.done === 1 && pre.total === 1)));
  check(await page.locator('#preBanner').isVisible() && /1 de 1|completa/i.test(await page.locator('#preBanner').textContent()), 'la preparación queda guardada y confirmada');
  check(/Registrar operación/.test(await page.locator('#quickBtn').textContent()), 'la acción global identifica la tarea de registro');
  await page.locator('#quickBtn').click();
  check(await page.locator('#quickOv').isVisible() && await page.locator('#qkDetalles').isVisible(), 'el registro rápido conserva el acceso al formulario completo');
  await page.locator('#qkCancel').click();
  await reveal(page.locator('#qtGo'));
  check(/Registrar operación/.test(await page.locator('#qtGo').textContent()), 'la acción contextual conserva el mismo nombre al actualizar el protocolo');
  await page.locator('#qtSym').fill('MNQ');
  await page.locator('#qtAccount').selectOption('prop25');
  const countBefore = await page.evaluate(() => FUT.trades().length);
  await page.locator('#qtGo').click();
  await page.locator('#ov.open').waitFor();
  check(await page.locator('#ef_accountId').inputValue() === 'prop25', 'registrar conserva la cuenta elegida al preparar');
  for (const id of ['date', 'instrument', 'direction', 'qty', 'entry', 'stop', 'exit', 'fees']) {
    const field = page.locator('#ef_' + id);
    await reveal(field);
    check(await field.isVisible(), `el formulario conserva el campo ${id}`);
  }
  await page.locator('#ef_date').fill('2026-09-17');
  await page.locator('#ef_direction').selectOption('long');
  await page.locator('#ef_qty').fill('0');
  await page.locator('#edSave').click();
  check(await page.locator('#edValidation').isVisible() && await page.evaluate(() => FUT.trades().length) === countBefore,
    'una cantidad inválida muestra el error sin guardar una operación');
  await page.locator('#ef_qty').fill('1');
  await page.locator('#ef_entry').fill('21000');
  await page.locator('#ef_stop').fill('20990');
  await page.locator('#ef_exit').fill('21020');
  await page.locator('#ef_fees').fill('2');
  await reveal(page.locator('#ef_tags'));
  await page.locator('#ef_tags').fill(marker);
  await page.locator('#edSave').click();
  await page.locator('#ov.open').waitFor({ state: 'hidden' });
  await enDisco(page, d => Object.values(d.trades || {}).some(trade => trade.tags === marker));
  const saved = await page.evaluate(tag => FUT.filtered({ tipo: 'futuros', rango: 'all' }).find(trade => trade.tags === tag), marker);
  check(saved && saved.accountId === 'prop25' && saved.pnlEff === 38,
    'la operación registrada conserva cuenta y resultado: $40 brutos menos $2 de comisión');
  // El día derivado se guarda después del trade; esperar ese dato evita
  // atribuir su escritura pendiente a la posterior cancelación del editor.
  const sessionTotal = await page.evaluate(() => {
    const trades = FUT.trades().filter(t => t.date === '2026-09-17');
    return { count: trades.length, result: Math.round(trades.reduce((sum, t) => sum + (t.pnlEff || 0), 0) * 100) / 100 };
  });
  await enDisco(page, d => d.days?.['2026-09-17']?.trades === sessionTotal.count && d.days['2026-09-17'].result === sessionTotal.result);

  console.log('\n═══ REVISAR Y ANALIZAR ═══');
  await navigate(page, 'historial');
  await page.locator('#hsQ').fill(marker);
  await quieto(page);
  const row = page.locator(`#hsTabla tr[data-id="${saved.id}"]`);
  check(await row.isVisible() && /38/.test(await row.textContent()), 'Historial encuentra la operación y muestra el mismo resultado');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#hsExport').click();
  const csv = readFileSync(await (await downloadPromise).path(), 'utf8');
  check(csv.includes(marker) && csv.includes('MNQ'), 'el CSV conserva la operación filtrada');
  const beforeReview = await financialSnapshot(page);
  await row.click();
  await page.locator('#ov.open').waitFor();
  check(await page.locator('#ef_accountId').inputValue() === 'prop25' && await page.locator('#ef_stop').inputValue() === '20990',
    'revisar abre la operación original con su cuenta y stop');
  await page.locator('#edCancel').click();
  const afterReview = await financialSnapshot(page);
  const beforeData = JSON.parse(beforeReview), afterData = JSON.parse(afterReview);
  const reviewChanges = Object.keys(beforeData).filter(key => JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key]));
  check(afterReview === beforeReview, 'cancelar la revisión deja los datos intactos',
    reviewChanges.map(key => JSON.stringify({ key, before: beforeData[key], after: afterData[key] })).join('\n'));
  await page.locator('#hsLimpiar').click();
  await navigate(page, 'edge');
  check(await page.locator('#mxAviso').isVisible() && /muestra insuficiente/i.test(await page.locator('#mxAviso').textContent()),
    'Analizar mantiene visible la advertencia de muestra insuficiente');
  check(await page.locator('#mxN').isVisible() && /netas de comisión/i.test(await page.locator('#mxN').textContent()),
    'Analizar identifica que los resultados son netos de comisión');
  await navigate(page, 'cuentas');
  check(await page.locator('#cuCajaNota').isVisible() && /cost[eo]|pagado/i.test(await page.locator('#cuCajaNota').textContent()) && /no.*(calcul|sabe)|sin registrar|falt/i.test(await page.locator('#cuCajaNota').textContent()),
    'Cuentas mantiene visible que faltan costes y el neto no es calculable');
  await navigate(page, 'calc');
  await page.locator('#calcSeg [data-v="trading"]').click();
  check(await page.locator('#ccCaution').isVisible() && /escenario|proyección|hipótesis/i.test(await page.locator('#ccCaution').innerText()), 'la proyección de trading mantiene visible su carácter hipotético');
  await page.locator('#calcSeg [data-v="classic"]').click();
  await page.locator('#cc_p').fill('0');
  await page.locator('#cc_c').fill('0');
  await quieto(page);
  check(await page.locator('#ccCaution').isVisible() && /sin capital|escribe al menos|falta.*capital/i.test(await page.locator('#ccCaution').innerText()), 'la falta de capital se comunica sin abrir ayuda');
  await page.locator('#calcSeg [data-v="risk"]').click();
  await reveal(page.locator('#rk_stop'));
  await page.locator('#rk_stop').fill('0');
  await quieto(page);
  check(await page.locator('#riskOut').isVisible() && /sin stop|falta.*stop/i.test(await page.locator('#riskOut').innerText()),
    'Riesgo mantiene visible la advertencia de stop faltante');

  console.log('\n═══ TODAS LAS RUTAS Y DETALLES EN ESCRITORIO Y MÓVIL ═══');
  let testedDisclosures = 0;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await navigate(page, route);
      check(new URL(page.url()).hash === '#' + route, `${width} · ${route}: la ruta original sigue accesible`);
      if (route === 'cabina') {
        check(await page.locator('[data-account-analysis][open]').count() === 0,
          width + ': gráficos e historial de cuenta comienzan bajo demanda');
        check(await page.locator('.acc-acts [data-act="newtrade"]').first().isVisible(),
          width + ': registrar sigue visible antes de abrir el análisis de la cuenta');
        if (width === 390) check(await page.locator('.acct .mtop .s').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth + 1)),
          '390: límites y datos de riesgo de las cuentas se leen completos');
      }
      testedDisclosures += await checkDisclosures(page, route, width);
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
      check(geometry.scroll <= geometry.width + 1, `${width} · ${route}: la página cabe sin desplazamiento horizontal`, `${geometry.scroll}/${geometry.width}`);
      if (route === 'edge') check(await page.locator('#mxAviso').isVisible(), `${width}: la advertencia de muestra no queda dentro de un detalle cerrado`);
      if (route === 'futuros') check(await page.locator('#ftSampleNote').isVisible(), `${width}: el resumen de Futuros mantiene visible la advertencia de muestra`);
      if (route === 'cuentas') check(await page.locator('#cuCajaNota').isVisible(), `${width}: la falta de costes sigue visible al cerrar detalles`);
    }
  }
  check(testedDisclosures > 0, 'se ha comprobado la interacción real de los detalles compartidos');
  await page.reload();
  await arrancada(page, null);
  check(await page.evaluate(tag => FUT.trades().some(trade => trade.tags === tag), marker), 'la operación sobrevive al recorrido completo y a recargar');
  check(errors.length === 0, 'sin errores de JavaScript durante el recorrido', errors.join(' | '));
  await context.close();
} catch (error) {
  check(false, 'el recorrido completo termina sin interrupciones', error.stack || error.message);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`\n  fallos: ${failures.length}${failures.length ? ' → ' + failures.join(' · ') : ''}`);
process.exitCode = failures.length ? 1 : 0;
