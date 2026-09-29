import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
/* Apuntaba a una ruta ABSOLUTA del scratchpad. Ese archivo existía, así que
   el test pasaba en verde — midiendo una copia congelada de la app. Cuando se
   descubrió llevaba seis días sin regenerarse: 141 KB menos, sin posPerf, sin
   INV, sin TES, sin el arreglo del IRR. Verde sobre código que ya no existía.
   La ruta se deriva del sitio desde el que se corre, como los otros 36. */
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type()==='error' && !/ERR_CONNECTION|fonts|_blob|ERR_FILE/.test(t)) errs.push('CONSOLE: '+t); });
await page.addInitScript(() => { window.claude = { use: async n => n==='permissions' ? { state: async()=> 'granted', request: async ns => Object.fromEntries((ns||[]).map(x=>[x,'granted'])) } : null }; });
await conCuentas(page);
await page.goto(URL); await page.waitForTimeout(700);
const T = await page.evaluate(() => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}));
const say = (k,v) => console.log('  ' + k.padEnd(38) + v);

console.log('=== 1. cuentas por defecto ===');
say('cuentas en Cabina:', await page.locator('#accts .acct').count());
await page.click('.tabbtn[data-tab="futuros"]'); await page.click('#ftSeg button[data-v="cuentas"]'); await page.waitForTimeout(350);
say('cuentas en Futuros:', await page.locator('#ftAccts .facct').count());

console.log('=== 2. alta de operación con cuenta ===');
await page.click('#ftNew'); await page.waitForTimeout(250);
const accOpts = await page.$$eval('#ef_accountId option', o=>o.map(x=>x.textContent));
say('opciones de cuenta:', accOpts.join(' / '));
await page.fill('#ef_date', T); await page.fill('#ef_time','09:45');
await page.fill('#ef_instrument','MNQ'); await page.fill('#ef_qty','2');
await page.fill('#ef_entry','21000'); await page.fill('#ef_stop','20980'); await page.fill('#ef_target','21040'); await page.fill('#ef_exit','21030');
await page.check('#ef_cStruct'); await page.check('#ef_cPull'); await page.check('#ef_cWindow'); await page.check('#ef_cSize');
await page.click('#edSave'); await page.waitForTimeout(500);
say('tiles P&L neto:', (await page.textContent('#ftTiles')).replace(/\s+/g,' ').slice(0,60));
await page.click('#ftSeg button[data-v="cuentas"]'); await page.waitForTimeout(350);
say('cuenta 1 del journal:', (await page.textContent('#ftAccts .facct')).replace(/\s+/g,' ').match(/Del journal\S*/)?.[0]);
console.log('=== 3. propagación a Cabina ===');
await page.click('.tabbtn[data-tab="cabina"]'); await page.waitForTimeout(450);
say('resultado del día:', await page.inputValue('#jResult'));
say('ops del día:', await page.inputValue('#jTrades'));
say('filas de historial:', await page.locator('#histWrap tbody tr').count());
say('tiles neto:', (await page.textContent('#tiles')).replace(/\s+/g,' ').match(/Neto\S*/)?.[0]);
say('cuenta en Cabina del journal:', (await page.textContent('#accts')).replace(/\s+/g,' ').match(/Del journal\S*/)?.[0]);
console.log('=== 4. regla dura -> topes ===');
await page.fill('#rules .rulec[data-id="maxloss"] input[data-f="value"]', '99'); await page.waitForTimeout(700);
say('tope diario en la cuenta:', (await page.textContent('#accts')).replace(/\s+/g,' ').match(/Tope diario\s*-?\$[\d,]+/)?.[0]);
console.log('=== 5. niveles del día ===');
await page.fill('#mktLevels input[data-lv="pdh"]','21100'); await page.fill('#mktLevels input[data-lv="pdl"]','20900');
await page.waitForTimeout(900);
say('rango previo:', (await page.textContent('#mktLevels')).replace(/\s+/g,' ').match(/rango del día previo \S+ \S+/)?.[0]);
console.log('=== 6. playbook -> selector de setup ===');
await page.click('.tabbtn[data-tab="playbook"]'); await page.waitForTimeout(300);
await page.click('#pbNav .tabbtn[data-v="perpetuos"]'); await page.click('#pbTemplate'); await page.waitForTimeout(250);
await page.click('#edSave'); await page.waitForTimeout(350); await page.click('#edSave'); await page.waitForTimeout(450);
say('fichas en perpetuos:', await page.locator('#pbCards .card').count());
await page.click('.tabbtn[data-tab="futuros"]'); await page.waitForTimeout(350);
say('setups en el filtro:', (await page.$$eval('#ftSetup option', o=>o.map(x=>x.textContent))).join(' / '));
console.log('=== 7. inversiones ===');
await page.click('.tabbtn[data-tab="invest"]'); await page.waitForTimeout(400);
await page.click('#mlist button[data-id="etfs"]'); await page.waitForTimeout(300);
await page.click('#posAdd'); await page.waitForTimeout(250);
await page.fill('#ef_asset','VTI'); await page.fill('#ef_qty','10'); await page.fill('#ef_entry','280'); await page.fill('#ef_current','300');
await page.fill('#ef_exitPlan','Solo por necesidad real.');
await page.click('#edSave'); await page.waitForTimeout(600);
say('tiles inversión:', (await page.textContent('#ivTiles')).replace(/\s+/g,' ').slice(0,150));
say('salud:', await page.textContent('#ivHealthMeta'));
say('alloc:', await page.textContent('#ivAllocMeta'));
console.log('=== 8. recarga y persistencia ===');
await page.reload(); await page.waitForTimeout(900);
await page.click('.tabbtn[data-tab="futuros"]'); await page.waitForTimeout(400);
say('ops tras recarga:', await page.textContent('#nFut'));
say('posiciones tras recarga:', await page.textContent('#nInvest'));
console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await browser.close();
