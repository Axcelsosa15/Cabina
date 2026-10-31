/* Flujo Cabina -> Estudio: un día, varias cuentas, P&L real, filtros y retorno.
   Ningún trade ni revisión se copia o guarda por navegar. */
import { chromium } from 'playwright';
import { arrancada, quieto } from './espera.mjs';

const FAIL = [], errors = [];
const ok = (yes, label, detail='') => {
  console.log('  ' + (yes ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!yes) FAIL.push(label);
};
const fixed = new Date('2026-09-17T14:00:00Z').getTime();
const account = id => ({ id, name:'Cuenta '+id, size:50000, dd:2500, ddKind:'estatico', status:'fondeada', ledger:[] });
const op = (id, date, accountId, exit) => ({
  id, type:'futuros', accountId, instrument:'MNQ', direction:'long', qty:1,
  entry:21000, stop:20980, exit, date, time:'10:00'
});
const seed = {
  settings:{meta:{mx:{com:0}}, accounts:[account('a1'),account('a2')], rules:[]},
  trades:{
    uno:op('uno','2026-09-17','a1',21050),
    dos:op('dos','2026-09-17','a2',20975),
    abierta:op('abierta','2026-09-17','a2',null),
    anterior:op('anterior','2026-09-16','a1',21010),
  }
};
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce'})).newPage();
page.on('pageerror', e => errors.push(e.message));
const ids = () => page.locator('#studyTradeList button[data-study-trade]').evaluateAll(els => els.map(el=>el.dataset.studyTrade).sort());
const context = () => page.locator('#studyDayContext');
try {
  await page.addInitScript(`{const F=${fixed};const O=Date;class D extends O{constructor(...a){super(...(a.length?a:[F]));}static now(){return F;}}window.Date=D;}`);
  await page.addInitScript(data => localStorage.setItem('cabina-mnq:v1', JSON.stringify(data)),seed);
  await page.goto('file://' + process.cwd() + '/../index.html');
  await arrancada(page, '#todayLabel');
  await page.locator('#studyDayNow').waitFor({state:'attached',timeout:15000});
  ok(await page.locator('#studyDayNow').count()===1,'la sesión actual ofrece Estudiar día');
  const before = await page.evaluate(() => { const d=JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}'); return {trades:d.trades||{}, research:d.research||{}}; });
  await page.click('#studyDayNow');
  await page.waitForFunction(() => document.querySelector('.tab[data-tab="estudio"]')?.classList.contains('active')
      && document.querySelector('#studyDayContext') && !document.querySelector('#studyDayContext').hidden);
  await quieto(page);
  ok(await page.inputValue('#studyTradeFrom')==='2026-09-17' && await page.inputValue('#studyTradeTo')==='2026-09-17',
    'Estudio filtra ambos límites a la fecha exacta');
  const nowIds = await ids();
  ok(nowIds.length===3 && nowIds.includes('uno') && nowIds.includes('dos') && nowIds.includes('abierta') && !nowIds.includes('anterior'),
    'abre los 3 trades del día, de las dos cuentas, sin incluir el día anterior',nowIds.join(','));
  const dayText=await context().innerText();
  ok(dayText.includes('Cuentas') && /Cuentas\\s*2/.test(dayText.replace(/\\s+/g,' ')),
    'contexto cuenta las dos cuentas distintas',dayText.replace(/\\s+/g,' ').slice(0,200));
  ok(dayText.includes('Cerradas') && dayText.includes('1 / 1 / 0'),
    'separa dos trades cerrados de uno abierto');
  ok(await page.textContent('#studyTradeMetricCount').then(x=>x.trim())==='3',
    'las métricas usan el mismo subconjunto que las tarjetas');
  await page.locator('#studyTradeFrom').fill('2026-09-16');
  await page.waitForFunction(() => document.querySelector('#studyDayContext')?.hidden===true);
  const manualIds=await ids();
  ok(manualIds.length===4,'cambiar la fecha abandona el enfoque anterior y muestra el nuevo rango',manualIds.join(','));
  await page.click('#studyTradeClear');
  ok(await page.inputValue('#studyTradeFrom')==='' && await page.inputValue('#studyTradeTo')==='' && (await ids()).length===4,
    'Limpiar filtros libera el día sin dejar una vista oculta');
  await page.click('.tabbtn[data-tab="cabina"]');
  await page.locator('#histWrap button[data-study-day="2026-09-16"]').first().waitFor({timeout:15000});
  await page.locator('#histWrap button[data-study-day="2026-09-16"]').first().click();
  await page.waitForFunction(() => document.querySelector('#studyDayContext') && !document.querySelector('#studyDayContext').hidden);
  ok(await page.inputValue('#studyTradeFrom')==='2026-09-16' && await page.inputValue('#studyTradeTo')==='2026-09-16',
    'historial abre exactamente el día elegido');
  ok(JSON.stringify(await ids())===JSON.stringify(['anterior']),
    'desde historial sólo aparece la operación de ese día');
  await context().locator('[data-study-day-clear]').click();
  ok(await context().isHidden() && await page.inputValue('#studyTradeFrom')==='' && (await ids()).length===4,
    'Ver todo recupera los trades sin eliminar ninguna revisión');
  const after=await page.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}'); return {trades:d.trades||{}, research:d.research||{}}; });
  ok(JSON.stringify(before)===JSON.stringify(after),'navegar entre sesiones no crea ni modifica trades o revisiones');
  ok(errors.length===0,'sin errores de JavaScript',errors.slice(0,4).join(' | '));
} catch(e) {
  ok(false,'prueba completada sin excepción',String(e.message||e).slice(0,500));
} finally {
  await browser.close();
}
console.log('fallos: '+FAIL.length);
if(FAIL.length)process.exit(1);
