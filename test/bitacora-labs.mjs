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
  return {
    svg: !!svg,
    empty: !!(document.querySelector('#cabEquity .lab-empty')),
    opsFoldClosed: document.getElementById('cabOpsFold')?.open !== true
  };
});
ok(curva.svg || curva.empty, 'Inicio pinta la curva de equity o el vacío honesto', JSON.stringify(curva));
ok(curva.opsFoldClosed, 'Inicio pliega cuentas y pre-sesión bajo el dashboard');

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

await page.click('#tabnav .tabbtn[data-tab="ajustes"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'ajustes');
const bk = await page.evaluate(() => {
  document.getElementById('settingsTabData')?.click();
  return document.getElementById('bkMeta')?.textContent || '';
});
ok(/entrada(?:s)? de diario/.test(bk), 'el panel de respaldo cuenta el journal', bk.slice(0, 120));

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
const insBtn = page.locator('#insList [data-ins="ops"]').first();
if (await insBtn.count()) {
  await page.evaluate(() => {
    /* Deja filtros que podrían ocultar la evidencia si no se limpian. */
    const q = document.getElementById('ftQ'); if (q) { q.value = 'zzz-sin-match'; q.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await insBtn.click();
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
  const filtered = await page.evaluate(() => {
    const chip = [...document.querySelectorAll('#ftFilters .fchip')].find(el => /Evidencia/i.test(el.textContent || ''));
    const all = document.querySelector('#ftFilters [data-clr="all"]');
    return {
      chip: !!(chip),
      chipText: chip ? chip.textContent : '',
      rows: document.querySelectorAll('#jrTable tr[data-id]').length,
      verTodo: !!all
    };
  });
  ok(filtered.chip && filtered.rows >= 1, 'Insights abre Operaciones con chip de evidencia', JSON.stringify(filtered));
  await page.click('#ftFilters [data-clr="all"]');
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => ({
    chips: document.querySelectorAll('#ftFilters .fchip').length,
    rows: document.querySelectorAll('#jrTable tr[data-id]').length
  }));
  ok(cleared.chips === 0 && cleared.rows >= filtered.rows, 'Ver todo quita la evidencia', JSON.stringify(cleared));
}

await page.click('#tabnav .tabbtn[data-tab="calendario"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'calendario');
const cal = await page.evaluate(() => ({
  month: document.getElementById('calLabTitle')?.textContent || '',
  day: document.getElementById('calLabDayMeta')?.textContent || '',
  actions: document.querySelectorAll('#calLabDay [data-lab-act]').length
}));
ok(/2026-09|septiembre|sep/i.test(cal.month + cal.day) || /^\d{4}-\d{2}-\d{2}$/.test(cal.day),
  'Calendario abre un día con datos', JSON.stringify(cal));
ok(cal.actions >= 3, 'Calendario ofrece Operaciones, Diario y Estudio');
const emptyMonth = await page.evaluate(() => {
  const title0 = document.getElementById('calLabTitle')?.textContent || '';
  document.getElementById('calLabNext')?.click();
  document.getElementById('calLabNext')?.click();
  const title1 = document.getElementById('calLabTitle')?.textContent || '';
  return { title0, title1, same: title0 === title1 };
});
ok(!emptyMonth.same, 'Prev/Next puede abrir un mes sin operaciones', JSON.stringify(emptyMonth));

await page.click('#tabnav .tabbtn[data-tab="cuentas"]');
await page.click('#cuVerOps');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
ok(true, 'Cuentas abre Operaciones');

await page.click('#tabnav .tabbtn[data-tab="edge"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'edge');
const estLink = await page.evaluate(() => ({
  stats: !!document.querySelector('#mxAnalytics [data-lab-est]'),
  riskClosed: document.getElementById('mxRiskTools')?.open !== true
}));
ok(estLink.stats, 'Analítica enlaza el catálogo de Estadísticas');
ok(estLink.riskClosed, 'tamaño y ruina quedan plegados bajo la curva');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#operaciones', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
ok(true, 'alias #operaciones → futuros');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#rendimiento', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'edge', null, { timeout: 15000 });
ok(true, 'alias #rendimiento → edge');

await page.goto('http://127.0.0.1:' + srv.address().port + '/#futuros?ids=t0&view=diario', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
const deep = await page.evaluate(() => ({
  tab: document.querySelector('.tab.active')?.dataset.tab,
  hash: location.hash,
  chip: [...document.querySelectorAll('#ftFilters .fchip')].some(el => /Evidencia/i.test(el.textContent || '')),
  rows: document.querySelectorAll('#jrTable tr[data-id]').length
}));
ok(deep.tab === 'futuros' && /ids=t0/.test(deep.hash) && deep.chip && deep.rows === 1,
  'hash con ids conserva evidencia al cargar', JSON.stringify(deep));

await page.click('#tabnav .tabbtn[data-tab="cabina"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'cabina');
await page.click('#tabnav .tabbtn[data-tab="futuros"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros');
const kept = await page.evaluate(() => ({
  chip: [...document.querySelectorAll('#ftFilters .fchip')].some(el => /Evidencia/i.test(el.textContent || '')),
  rows: document.querySelectorAll('#jrTable tr[data-id]').length
}));
ok(kept.chip && kept.rows === 1, 'cambiar de pestaña no quita la evidencia', JSON.stringify(kept));

await page.goto('http://127.0.0.1:' + srv.address().port + '/#futuros?trade=t0', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('ov')?.classList.contains('open'), null, { timeout: 15000 });
const tradeDeep = await page.evaluate(() => ({
  open: document.getElementById('ov')?.classList.contains('open'),
  hash: location.hash
}));
ok(tradeDeep.open && !/trade=/.test(tradeDeep.hash),
  'hash trade= abre el editor y se consume', JSON.stringify(tradeDeep));
await page.click('#edCancel');
await page.waitForFunction(() => !document.getElementById('ov')?.classList.contains('open'));
await page.click('#tabnav .tabbtn[data-tab="futuros"]');
await page.waitForTimeout(300);
ok(!(await page.evaluate(() => document.getElementById('ov')?.classList.contains('open'))),
  'un segundo showTab no reabre el editor');

/* trade= antes de que exista la fila (hidratado tarde): queda pendiente y abre al llegar. */
await page.evaluate(() => { FUT.deleteTrade('t0'); });
await page.evaluate(() => { location.hash = '#futuros?trade=t0'; });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros');
await page.waitForTimeout(300);
ok(!(await page.evaluate(() => document.getElementById('ov')?.classList.contains('open'))),
  'trade= sin fila aún no abre el editor');
await page.evaluate(() => {
  FUT.createTrade({
    id: 't0', type: 'futuros', date: '2026-09-08', time: '09:30',
    instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010
  });
});
await page.waitForFunction(() => document.getElementById('ov')?.classList.contains('open'), null, { timeout: 10000 });
const late = await page.evaluate(() => ({
  open: document.getElementById('ov')?.classList.contains('open'),
  hash: location.hash
}));
ok(late.open && !/trade=/.test(late.hash),
  'al hidratar la operación, trade= pendiente abre y se limpia', JSON.stringify(late));
await page.click('#edCancel');
await page.waitForFunction(() => !document.getElementById('ov')?.classList.contains('open'));

/* Si el hash pierde trade= antes de que exista la fila, el pendiente se cancela. */
await page.evaluate(() => { FUT.deleteTrade('t0'); });
await page.evaluate(() => { location.hash = '#futuros?trade=t0'; });
await page.waitForFunction(() => /trade=t0/.test(location.hash));
await page.waitForTimeout(200);
ok(!(await page.evaluate(() => document.getElementById('ov')?.classList.contains('open'))),
  'trade= fantasma sigue sin abrir el editor');
await page.evaluate(() => { location.hash = '#futuros'; });
await page.waitForFunction(() => !/trade=/.test(location.hash));
await page.waitForTimeout(200);
await page.evaluate(() => {
  FUT.createTrade({
    id: 't0', type: 'futuros', date: '2026-09-08', time: '09:30',
    instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010
  });
});
await page.waitForTimeout(400);
ok(!(await page.evaluate(() => document.getElementById('ov')?.classList.contains('open'))),
  'al quitar trade= del hash, hidratar ya no abre el editor pendiente');

/* ids residuales no deben volver a limpiar filtros en cada showTab. */
await page.goto('http://127.0.0.1:' + srv.address().port + '/#futuros?ids=t0&view=diario', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#ftFilters .fchip'), null, { timeout: 15000 });
await page.evaluate(() => { const d = document.getElementById('ftMoreFilters'); if (d) d.open = true; });
await page.fill('#ftQ', 'keep-me');
await page.locator('#ftQ').dispatchEvent('input');
await page.click('#tabnav .tabbtn[data-tab="futuros"]');
await page.waitForTimeout(200);
const qKept = await page.inputValue('#ftQ');
ok(qKept === 'keep-me', 'ids residuales no limpian filtros al reentrar showTab', qKept);

/* Misma query, otra pestaña: la clave de ruta incluye el tab. */
await page.goto('http://127.0.0.1:' + srv.address().port + '/#futuros?date=2026-09-08', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'futuros', null, { timeout: 15000 });
await page.evaluate(() => { location.hash = '#estudio?date=2026-09-08'; });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'estudio', null, { timeout: 15000 });
const sameQ = await page.evaluate(() => ({
  tab: document.querySelector('.tab.active')?.dataset.tab,
  from: document.getElementById('studyTradeFrom')?.value || '',
  hash: location.hash
}));
ok(sameQ.tab === 'estudio' && sameQ.from === '2026-09-08',
  'cambiar de pestaña con la misma query reaplica la ruta', JSON.stringify(sameQ));

await page.goto('http://127.0.0.1:' + srv.address().port + '/#estudio?date=2026-09-08', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'estudio', null, { timeout: 15000 });
const estDeep = await page.evaluate(() => ({
  tab: document.querySelector('.tab.active')?.dataset.tab,
  from: document.getElementById('studyTradeFrom')?.value || '',
  fut: typeof window.FUT,
  labs: typeof window.CabinaLabs,
  list: !!(document.getElementById('studyTradeList') && document.getElementById('studyTradeList').children.length)
}));
ok(estDeep.tab === 'estudio' && estDeep.from === '2026-09-08' && estDeep.fut === 'object' && estDeep.labs === 'object',
  'deep link Estudio con fecha no rompe el arranque', JSON.stringify(estDeep));
await page.click('#tabnav .tabbtn[data-tab="insights"]');
await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'insights');
const afterDeep = await page.evaluate(() => document.getElementById('insList')?.innerText || '');
ok(afterDeep.length > 0, 'tras deep link Estudio, Labs sigue vivo', afterDeep.slice(0, 80));

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
