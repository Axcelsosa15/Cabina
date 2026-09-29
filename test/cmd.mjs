/* Paleta de comandos y atajos. La prueba que importa es la última: escribir
   una «n» en una nota NO puede abrir el editor de operaciones. */
import { chromium } from 'playwright';
import { SEMILLA as sem } from './espera.mjs';
const F=new Date('2026-09-18T14:20:00Z').getTime();

const errs=[]; const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:2})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(sem)});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1400);
const ok=(c,t,d)=>console.log(`  ${c?'✅':'❌'} ${t}${d!=null?'   '+d:''}`);

await p.keyboard.press('Control+k'); await p.waitForTimeout(350);
ok(await p.isVisible('#cmdOv .cmd'), 'Ctrl+K abre la paleta');
await p.screenshot({path:new URL('./tomas/', import.meta.url).pathname+'paleta.png'});
ok((await p.evaluate(()=>document.querySelectorAll('.cmd-it').length))>10, 'lista acciones y cuentas', await p.evaluate(()=>document.querySelectorAll('.cmd-it').length)+' entradas');
await p.keyboard.type('analisis'); await p.waitForTimeout(250);
ok((await p.evaluate(()=>document.querySelector('.cmd-it .ct')?.textContent))?.includes('análisis'), 'busca sin tildes', await p.evaluate(()=>document.querySelector('.cmd-it .ct')?.textContent));
await p.keyboard.press('Enter'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>document.querySelector('.tab.active').dataset.tab==='futuros' && document.querySelector('.ftview.active').dataset.v==='analisis'), 'Enter ejecuta la acción');
ok(!(await p.isVisible('#cmdOv .cmd')), 'y cierra la paleta');

await p.keyboard.press('Control+k'); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
ok(!(await p.isVisible('#cmdOv .cmd')), 'Esc cierra');

// atajos
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(300);
await p.keyboard.press('f'); await p.waitForTimeout(350);
ok(await p.evaluate(()=>document.querySelector('.tab.active').dataset.tab==='futuros'), 'F va a Futuros');
await p.keyboard.press('c'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.querySelector('.tab.active').dataset.tab==='cabina'), 'C vuelve a Cabina');

// LA guarda: una letra escribiendo NO debe disparar
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(250);
const nota = await p.$('#jNote') || await p.$('textarea');
await nota.click(); await p.keyboard.type('nunca falla con foco');
await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.querySelector('.tab.active').dataset.tab==='cabina'), 'escribir «n», «f», «c» NO navega');
ok((await nota.inputValue()).includes('nunca falla con foco'), 'y el texto entra entero', JSON.stringify(await nota.inputValue()));
// Ctrl+K sí funciona escribiendo
await p.keyboard.press('Control+k'); await p.waitForTimeout(300);
ok(await p.isVisible('#cmdOv .cmd'), 'Ctrl+K sí funciona escribiendo');
await p.keyboard.press('Escape');

// cambiar de cuenta desde la paleta
await p.keyboard.press('Control+k'); await p.waitForTimeout(250);
await p.keyboard.type('50K'); await p.waitForTimeout(250);
await p.keyboard.press('Enter'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>FUT.selectedAccountId()==='prop50'), 'selecciona cuenta por la puerta de FUT', await p.evaluate(()=>FUT.selectedAccountId()));
console.log('\n  errores JS:', errs.length, errs.join(' | '));
await b.close(); process.exit(errs.length?1:0);
