import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const errs=[]; const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1400,height:1100}});
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/ERR_CONNECTION|fonts|_blob|ERR_FILE/.test(t))errs.push('CONSOLE: '+t);});
await p.addInitScript(()=>{window.claude={use:async n=>n==='permissions'?{state:async()=>'granted',request:async ns=>Object.fromEntries((ns||[]).map(x=>[x,'granted']))}:null};});
await conCuentas(p);
await p.goto('file://' + process.cwd() + '/preview.html');
await p.waitForTimeout(700);
const T=await p.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}));
const say=(k,v)=>console.log('  '+k.padEnd(40)+v);
// crear operación con cuenta
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(250);
const opts=await p.$$eval('#ef_accountId option',o=>o.map(x=>({v:x.value,t:x.textContent})));
await p.selectOption('#ef_accountId',opts[1].v);
await p.fill('#ef_date',T); await p.fill('#ef_time','10:15'); await p.fill('#ef_instrument','MNQ');
await p.fill('#ef_qty','1'); await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit','21020');
await p.click('#edSave'); await p.waitForTimeout(500);
say('ops creadas:', await p.textContent('#nFut'));

console.log('=== filtro "sin cuenta asignada" no debe contaminar ===');
await p.selectOption('#ftAcct','__none'); await p.waitForTimeout(400);
say('ops visibles con filtro __none:', await p.locator('#jrTable tbody tr').count());
await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(300);
await p.click('#ftNew'); await p.waitForTimeout(250);
say('cuenta preseleccionada:', await p.$eval('#ef_accountId', e=>e.value===''?'(sin cuenta)':e.selectedOptions[0].textContent));
await p.click('#edCancel'); await p.waitForTimeout(200);
await p.selectOption('#ftAcct',''); await p.waitForTimeout(400);

console.log('=== borrar la cuenta que tiene la operación ===');
await p.click('#ftSeg button[data-v="cuentas"]'); await p.waitForTimeout(400);
const nAntes=await p.locator('#ftAccts .facct').count();
await p.click('#ftAccts .facct button[data-act="edit"]'); await p.waitForTimeout(300);
await p.click('#edDelete'); await p.click('#edDelete'); await p.waitForTimeout(600);
say('cuentas antes/después:', nAntes+' -> '+await p.locator('#ftAccts .facct').count());
say('aviso de huérfanas:', (await p.textContent('#ftSync')).replace(/\s+/g,' ').match(/\d+ sin cuenta asignada/)?.[0] || 'ninguno');
await p.click('#ftSeg button[data-v="resumen"]'); await p.waitForTimeout(400);
say('P&L sigue contando:', (await p.textContent('#ftTiles')).replace(/\s+/g,' ').slice(0,44));
say('scorecard vivo:', await p.textContent('#scMeta').catch(()=>'-'));

console.log('=== borrar el setup que usa una operación ===');
await p.click('.tabbtn[data-tab="playbook"]'); await p.waitForTimeout(300);
await p.click('#pbTemplate'); await p.waitForTimeout(250); await p.click('#edSave'); await p.waitForTimeout(300); await p.click('#edSave'); await p.waitForTimeout(400);
say('setups en futuros:', await p.locator('#pbCards .card').count());
await p.click('#pbCards .card button[data-act="del"]'); await p.click('#pbCards .card button[data-act="del"]'); await p.waitForTimeout(500);
say('tras borrar:', await p.locator('#pbCards .card').count());
await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(500);
say('filtro de setup reseteado:', await p.$eval('#ftSetup',e=>e.value===''?'sí':'no ('+e.value+')'));

console.log('=== borrar una sesión del historial ===');
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
say('filas historial:', await p.locator('#histWrap tbody tr').count());
say('resultado hoy:', await p.inputValue('#jResult'));

console.log('\n--- errores js ---'); console.log(errs.length?errs.join('\n'):'none');
await b.close();
