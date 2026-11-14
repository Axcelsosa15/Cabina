/* Coach en Insights: clics reales, evidencia y ausencia de escrituras de trading. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, siembra } from './espera.mjs';

const fallos = [], js = [];
const ok = (c, t, info = '') => {
  console.log('  ' + (c ? '✅' : '❌') + ' ' + t + (info ? ' · ' + info : ''));
  if (!c) fallos.push(t);
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const dataset = () => {
  const trades = {};
  let serial = 0;
  const add = (day, time, pnl, quality) => {
    const id = 'co' + ++serial;
    trades[id] = {
      id, type: 'futuros', date: '2026-09-' + String(day).padStart(2, '0'),
      time, accountId: 'prop25', instrument: 'MNQ', direction: 'long',
      qty: 1, entry: 21000, stop: 20990, exit: 21000 + pnl / 2,
      fees: 0, quality, source: 'manual', createdAt: 1780000000000 + serial,
    };
  };
  for (let d = 1; d <= 9; d++) add(d, '09:30', 80, 'A');
  for (let d = 10; d <= 16; d++) {
    add(d, '09:30', 10, 'A'); add(d, '09:40', 10, 'A');
    add(d, '10:00', -70, 'C'); add(d, '10:10', -70, 'C');
  }
  return { settings: structuredClone(CONFIG_PRUEBA), trades, days: {} };
};
async function open(width, seed) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith(origin + '/') || /^(data:|blob:)/.test(url) ? route.continue() : route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', err => js.push(err.message));
  await siembra(page, origin + '/', seed);
  await arrancada(page, null);
  return { ctx, page };
}
try {
  const { ctx, page } = await open(1280, dataset());
  await page.locator('#tabnav [data-tab="insights"]').click();
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'insights');
  const panel = page.locator('#coachList');
  await panel.locator('.insight-card').first().waitFor({ timeout: 15000 });
  const shown = await panel.locator('.insight-card').count();
  ok(shown >= 1 && shown <= 3, 'Coach pinta de 1 a 3 tareas desde la muestra', String(shown));
  const content = await panel.innerText();
  ok(/Evidencia: n=/.test(content) && /no causalidad/i.test(content),
    'expone muestra y límite de interpretación');
  ok(!/compra ahora|vende ahora|AI garantiz/i.test(content),
    'no produce señales ni promesas');
  const initialTrades = await page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem('cabina-mnq:v1')).trades));
  await panel.locator('[data-coach="ops"]').first().click();
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros');
  ok(/#futuros\?/.test(await page.evaluate(() => location.hash)) &&
    /ids=/.test(await page.evaluate(() => location.hash)),
    'botón Ver operaciones navega con IDs de evidencia');
  await page.locator('#tabnav [data-tab="insights"]').click();
  await page.locator('#coachList [data-coach="est"]').first().click();
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'estudio');
  ok(/#estudio\?date=/.test(await page.evaluate(() => location.hash)),
    'botón Revisar en Estudio abre la fecha de la operación');
  const finalTrades = await page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem('cabina-mnq:v1')).trades));
  ok(initialTrades === finalTrades, 'Coach y navegación no alteran trades');
  await ctx.close();

  const empty = await open(390, { settings: structuredClone(CONFIG_PRUEBA), trades: {}, days: {} });
  await empty.page.locator('#tabnav [data-tab="insights"]').click();
  await empty.page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'insights');
  const noEvidence = await empty.page.locator('#coachList').innerText();
  ok(/No hay patrones accionables/.test(noEvidence),
    'sin operaciones explica evidencia insuficiente, no inventa problemas');
  ok(await empty.page.locator('#coachList [data-coach]').count() === 0,
    'sin evidencia no aparecen botones falsos');
  ok(await empty.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'móvil 390px sin desbordamiento horizontal');
  await empty.ctx.close();
  ok(!js.length, 'sin errores JavaScript del navegador', js.join(' | '));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS coach-ui');
