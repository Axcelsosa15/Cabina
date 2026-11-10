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

const rowLinks = await page.evaluate(() => ({
  jr: document.querySelectorAll('#jrTable [data-act="jr"]').length,
  est: document.querySelectorAll('#jrTable [data-act="est"]').length
}));
ok(rowLinks.jr >= 1 && rowLinks.est >= 1, 'cada fila enlaza Diario y Estudio', JSON.stringify(rowLinks));

await page.locator('#jrTable [data-act="edit"]').first().click();
await page.waitForSelector('#ov.open');
const editorLinks = await page.evaluate(() => ({
  diario: !!document.querySelector('#edFields [data-trade-go="diario"]'),
  estudio: !!document.querySelector('#edFields [data-trade-go="estudio"]')
}));
ok(editorLinks.diario && editorLinks.estudio, 'el editor enlaza Diario y Estudio');
await page.click('#edCancel');
await page.waitForFunction(() => !document.getElementById('ov')?.classList.contains('open'));

await page.locator('#jrTable [data-act="est"]').first().click();
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'estudio', null, { timeout: 15000 });
const estudio = await page.evaluate(() => ({
  from: document.getElementById('studyTradeFrom')?.value || '',
  hash: location.hash
}));
ok(/^\d{4}-\d{2}-\d{2}$/.test(estudio.from) && /date=/.test(estudio.hash),
  'Estudio abre el día de la operación', JSON.stringify(estudio));

await page.click('#tabnav .tabbtn[data-tab="futuros"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros');
await page.locator('#jrTable [data-act="jr"]').first().click();
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'diario', null, { timeout: 15000 });
ok(true, 'Diario abre desde la fila');
await page.waitForSelector('#ov.open', { timeout: 3000 }).catch(() => {});
if (await page.locator('#ov.open').count()) {
  await page.locator('#edCancel').click();
  await page.waitForFunction(() => !document.getElementById('ov')?.classList.contains('open'));
}

await page.click('#tabnav .tabbtn[data-tab="cabina"]');
const inicio = await page.evaluate(() => {
  const band = document.getElementById('credoBand');
  const trace = document.getElementById('credoTrace');
  const kpis = document.getElementById('cabKpis');
  return {
    bandHidden: !!(band && band.hidden),
    traceVisible: !!(trace && !trace.hidden && trace.offsetParent),
    kpis: (kpis?.innerText || '').length
  };
});
ok(inicio.bandHidden && inicio.traceVisible && inicio.kpis > 0,
  'Inicio sin reglas: huella compacta y KPIs visibles', JSON.stringify(inicio));

const curva = await page.evaluate(() => {
  const svg = document.querySelector('#cabEquity svg.lab-equity, #cabEquity svg.chart');
  return { svg: !!svg, empty: !!(document.querySelector('#cabEquity .lab-empty')) };
});
ok(curva.svg || curva.empty, 'Inicio pinta la curva de equity o el vacío honesto', JSON.stringify(curva));

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

const sesPanel = await page.evaluate(() => {
  const body = document.getElementById('jrCabinaDaysBody');
  return { exists: !!body, text: body ? body.innerText : '' };
});
ok(sesPanel.exists && /no se copian|notas del día|Operaciones/i.test(sesPanel.text),
  'Diario enseña notas de sesión sin copiarlas', sesPanel.text.slice(0, 140));

await page.click('#tabnav .tabbtn[data-tab="estadisticas"]');
const stats = await page.evaluate(() => document.getElementById('stEstLista')?.innerText || '');
ok(stats.length > 0, 'Estadísticas usa el catálogo real', stats.slice(0, 80));

await page.click('#tabnav .tabbtn[data-tab="insights"]');
const ins = await page.evaluate(() => document.getElementById('insList')?.innerText || '');
ok(/evidencia|insight|operacion|operación|muestra|suficiente/i.test(ins),
  'Insights habla de evidencia real, no de frases vacías', ins.slice(0, 120));

await page.click('#tabnav .tabbtn[data-tab="cuentas"]');
await page.click('#cuVerOps');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
ok(true, 'Cuentas abre Operaciones');

await page.click('#tabnav .tabbtn[data-tab="edge"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'edge');
const estLink = await page.evaluate(() => !!document.querySelector('#mxAnalytics [data-lab-est]'));
ok(estLink, 'Analítica enlaza el catálogo de Estadísticas');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#operaciones', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
ok(true, 'alias #operaciones → futuros');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#rendimiento', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'edge', null, { timeout: 15000 });
ok(true, 'alias #rendimiento → edge');

{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => js.push('phone: ' + e.message));
  await p2.addInitScript(seed => {
    try { localStorage.setItem('cabina-mnq:v1', seed); } catch (e) {}
  }, SEMILLA);
  await p2.goto('http://127.0.0.1:' + srv.address().port + '/', { waitUntil: 'load' });
  await p2.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p2.evaluate(() => {
    const btn = document.querySelector('#tabnav .tabbtn[data-tab="futuros"]');
    if (btn) btn.click();
  });
  await p2.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
  const fold = await p2.evaluate(() => {
    const wrap = document.getElementById('jrTable');
    const r = wrap && wrap.getBoundingClientRect();
    return { tableTop: r ? Math.round(r.top) : null, visible: !!(wrap && wrap.offsetParent) };
  });
  ok(fold.visible && fold.tableTop != null && fold.tableTop < 560,
    'en teléfono la tabla queda cerca del fold', JSON.stringify(fold));
  await phone.close();
}

ok(js.length === 0, 'sin errores de página', js.join(' | '));

await browser.close();
await new Promise(r => srv.close(r));
console.log('fallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS bitacora-labs');
