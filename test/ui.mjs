/* Lo que el rediseño promete, comprobado: divulgación progresiva, estados
   vacíos con salida, y foco de teclado visible. */
import { chromium } from 'playwright';
import { SEMILLA as sem } from './espera.mjs';
const F=new Date('2026-09-18T14:20:00Z').getTime(); 
const errs=[]; const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1600,height:1100},deviceScaleFactor:2})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(sem)});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1400);
const ok=(c,t,d)=>console.log(`  ${c?'✅':'❌'} ${t}${d!=null?'   '+d:''}`);

console.log('\n═══ DIVULGACIÓN PROGRESIVA ═══');
const sel='.acct[data-id="prop25"] .metric[data-metric="consistencia"]';
ok(await p.evaluate(s=>document.querySelector(s+' .mdet').hidden, sel), 'el detalle nace plegado');
await p.click(sel+' .mtop'); await p.waitForTimeout(320);
ok(!(await p.evaluate(s=>document.querySelector(s+' .mdet').hidden, sel)), 'un clic lo abre');
const filas = await p.evaluate(s=>[...document.querySelectorAll(s+' .mdet > div')].map(r=>r.children[0].textContent.trim()+'='+r.children[1].textContent.trim()).join(' · '), sel);
ok(/Mejor día/.test(filas) && /Total necesario/.test(filas), 'y enseña las cifras del nivel 2', filas.slice(0,90));
await p.click('.acct[data-id="prop25"] .metric[data-metric="colchon"] .mtop'); await p.waitForTimeout(320);
ok(await p.evaluate(s=>document.querySelector(s+' .mdet').hidden, sel), 'abrir otra cierra la anterior');
// sobrevive a que entre una operación
await p.evaluate(()=>FUT.createTrade({accountId:'prop25',instrument:'MNQ',direction:'long',qty:1,date:'2026-09-18',time:'12:05',entry:21000,stop:20990,exit:21010}));
await p.waitForTimeout(600);
ok(!(await p.evaluate(()=>document.querySelector('.acct[data-id="prop25"] .metric[data-metric="colchon"] .mdet').hidden)),
   'sigue abierta tras registrar una operación');
await p.screenshot({path:new URL('./tomas/', import.meta.url).pathname+'detalle.png', clip:{x:0,y:120,width:1600,height:700}});

console.log('\n═══ ESTADOS VACÍOS ═══');
const v = await p.evaluate(()=>{const e=document.querySelector('.acct[data-id="prop50"] .acc-recent .vacio'); return e?e.innerText.replace(/\s+/g,' '):'(no)';});
ok(/sin operaciones/i.test(v) && /registrar/i.test(v), 'el vacío dice qué falta y ofrece el paso', v);
const q=await (await b.newContext({viewport:{width:1200,height:900}})).newPage();
await q.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify({settings:{accounts:[],rules:[],meta:{}}}))});}catch(e){}`);
await q.goto('file://'+process.cwd()+'/preview.html'); await q.waitForTimeout(1200);
const v2 = await q.evaluate(()=>{const e=document.querySelector('#accts .vacio'); return e?e.innerText.replace(/\s+/g,' '):'(no)';});
ok(/sin cuentas/i.test(v2), 'sin cuentas también', v2);
await q.click('#accts .vacio button'); await q.waitForTimeout(400);
ok(await q.isVisible('#ov.open'), 'y su botón abre el editor de cuenta');

console.log('\n═══ ACCESIBILIDAD ═══');
await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(120);
ok(await p.getAttribute('.tabbtn[data-tab="futuros"]', 'aria-current') === 'page', 'la pestaña activa se anuncia como actual');
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(120);
const saveA11y = await p.evaluate(() => {
  const e = document.getElementById('saveState');
  return { role: e.getAttribute('role'), live: e.getAttribute('aria-live') };
});
ok(saveA11y.role === 'status' && saveA11y.live === 'polite', 'el estado de guardado se anuncia sin interrumpir', JSON.stringify(saveA11y));
const modalLabel = await q.getAttribute('#ov', 'aria-labelledby');
ok(modalLabel === 'edTitle', 'el editor tiene nombre accesible', modalLabel || 'sin aria-labelledby');
await q.click('#edCancel');
ok(await q.evaluate(() => document.activeElement && document.activeElement.matches('#accts .vacio button')), 'al cerrar el editor vuelve el foco al control que lo abrió');
/* :focus-visible sólo se activa con teclado — .focus() por JS no cuenta, que
   es justo lo que se quiere: el contorno no aparece al hacer clic con ratón. */
await p.click('body'); 
for (let i=0;i<6;i++) await p.keyboard.press('Tab');
const foco = await p.evaluate(()=>{const a=document.activeElement; const c=getComputedStyle(a);
  return {el: a.tagName+'.'+(a.className||'').split(' ')[0], estilo: c.outlineStyle, ancho: c.outlineWidth, color: c.outlineColor};});
ok(foco.estilo !== 'none' && parseFloat(foco.ancho) >= 2, 'el foco por teclado es visible', JSON.stringify(foco));
/* No se comprueba «y con el ratón no sale»: tras un Tab el navegador queda en
   modalidad de teclado y un .focus() posterior sigue casando con
   :focus-visible. Esa prueba mediría el navegador, no la app. */
const signo = await p.evaluate(()=>[...document.querySelectorAll('.acc-recent td.r')].map(t=>t.textContent.trim()).filter(Boolean).slice(0,6).join(' '));
ok(/[+−-]/.test(signo), 'las cifras llevan signo, no sólo color', signo);
console.log('\n  errores JS:', errs.length, errs.join(' | '));
await b.close(); process.exit(errs.length?1:0);
