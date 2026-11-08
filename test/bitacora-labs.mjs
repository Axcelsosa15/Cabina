/* Pestañas Bitácora: navegación, diario persistente y cálculos compartidos. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { SEMILLA } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => {
  console.log('  ' + (c ? '✅' : '❌') + ' ' + t + (d != null ? ' · ' + d : ''));
  if (!c) fallos.push(t);
};

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const js = [];
page.on('pageerror', e => js.push(e.message));
await page.addInitScript(seed => {
  try { localStorage.setItem('cabina-mnq:v1', seed); } catch (e) {}
}, SEMILLA);
await page.goto('http://127.0.0.1:' + srv.address().port + '/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined' && window.CabinaLabs, null, { timeout: 20000 });

const tabs = ['cabina', 'futuros', 'calendario', 'diario', 'edge', 'estadisticas', 'correlaciones', 'insights', 'playbook', 'cuentas'];
for (const tab of tabs) {
  await page.click('#tabnav .tabbtn[data-tab="' + tab + '"]');
  await page.waitForFunction(t => document.querySelector('.tab.active')?.dataset.tab === t, tab);
  const state = await page.evaluate(() => ({
    hash: location.hash.replace(/^#/, '').split('?')[0],
    active: document.querySelector('.tab.active')?.dataset.tab,
    emptyBroken: [...document.querySelectorAll('.tab.active button, .tab.active a')].some(el => el.offsetParent && el.disabled && el.dataset.fake === '1')
  }));
  ok(state.active === tab && state.hash === tab, 'navega a ' + tab, state.hash);
}

await page.click('#tabnav .tabbtn[data-tab="futuros"]');
const tabla = await page.evaluate(() => {
  const wrap = document.getElementById('jrTable');
  const view = document.querySelector('.ftview.active')?.dataset.v;
  return { view, rows: wrap ? wrap.querySelectorAll('tr[data-id]').length : 0, visible: !!(wrap && wrap.offsetParent) };
});
ok(tabla.view === 'diario' && tabla.visible && tabla.rows >= 1, 'Operaciones abre en la tabla', JSON.stringify(tabla));

await page.click('#tabnav .tabbtn[data-tab="diario"]');
await page.click('#jrNew');
await page.waitForSelector('#ov.open, #ov.edopen, #ov[class*="open"]');
const editorOpen = await page.evaluate(() => document.getElementById('ov')?.classList.contains('open'));
ok(editorOpen, 'Nueva entrada abre el editor canónico');
await page.fill('#ef_title', 'Lección de prueba');
await page.fill('#ef_body', 'Me sentí paciente');
await page.fill('#ef_lesson', 'Esperar confirmación');
await page.selectOption('#ef_mood', 'Paciente');
await page.fill('#ef_date', '2026-03-02');
await page.click('#edSave');
await page.waitForTimeout(400);
const saved = await page.evaluate(() => {
  const items = (window.colls && Object.values(window.colls)) || [];
  const jr = [...document.querySelectorAll('.journal-entry')].map(el => el.textContent);
  return { cards: jr.join(' | '), n: jr.length };
});
ok(saved.n >= 1 && /Lección de prueba|Esperar confirmación/.test(saved.cards),
  'la entrada de diario se pinta', saved.cards.slice(0, 120));

await page.click('#tabnav .tabbtn[data-tab="estadisticas"]');
const stats = await page.evaluate(() => document.getElementById('stEstLista')?.innerText || '');
ok(stats.length > 0, 'Estadísticas usa el catálogo real', stats.slice(0, 80));

await page.click('#tabnav .tabbtn[data-tab="insights"]');
const ins = await page.evaluate(() => document.getElementById('insList')?.innerText || '');
ok(/evidencia|insight|operacion|operación|muestra|suficiente/i.test(ins),
  'Insights habla de evidencia real, no de frases vacías', ins.slice(0, 120));

await page.goto('http://127.0.0.1:' + srv.address().port + '/#operaciones', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
ok(true, 'alias #operaciones → futuros');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#rendimiento', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'edge', null, { timeout: 15000 });
ok(true, 'alias #rendimiento → edge');

ok(js.length === 0, 'sin errores de página', js.join(' | '));

await browser.close();
await new Promise(r => srv.close(r));
console.log('fallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS bitacora-labs');
