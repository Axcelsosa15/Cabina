/* Saved presentation must follow the same modules and columns after reordering. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { sirvePublicado } from './publicado.mjs';
import { arrancada, quieto, SEMILLA } from './espera.mjs';
const seed=JSON.parse(SEMILLA);
seed.positions={p:{id:'p',asset:'VOO',market:'etfs',qty:2,entry:100,current:110,date:'2026-09-01'}};
seed.trades.inv={id:'inv',type:'inversion',asset:'VOO',market:'etfs',op:'compra',date:'2026-09-01',qty:2,price:100};
const prefs={hidden:{invest:['invest:panel:cartera-todos-los-mercados','invest:panel:etfs','invest:panel:watchlist-e-ideas'],
 estudio:['estudio:study-panel:trades-para-revisar','estudio:study-panel:p-l-neto-disponible','estudio:study-panel:modulo-11']},
 pages:{calc:{folded:['calc:panel:ano-a-ano']}},columns:{invest:{
 'invest:table:0':['valor:2'],'invest:table:1':['activo:3'],'invest:table:2':['actual:4']}}};
const server=sirvePublicado();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();let checks=0;
const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('  ✅ '+label);};
const snapshot=page=>page.evaluate(()=>JSON.stringify({trades:FUT.trades(),accounts:FUT.accounts(),positions:INV.positions()}));
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(({seed,prefs})=>{
  if(!localStorage.getItem('cabina-mnq:v1'))localStorage.setItem('cabina-mnq:v1',JSON.stringify(seed));
  if(!localStorage.getItem('cabina-view-prefs:v1'))localStorage.setItem('cabina-view-prefs:v1',JSON.stringify(prefs));
 },{seed,prefs});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#invest');await arrancada(page,null);
 const before=await snapshot(page);
 ok(await page.locator('#ivOverview').evaluate(e=>e.classList.contains('user-view-hidden')),'la cartera conserva la preferencia de visibilidad anterior');
 ok(await page.locator('#marketGuide').evaluate(e=>e.classList.contains('user-view-hidden')),'la guía dinámica conserva su clave anterior');
 ok(await page.locator('[data-view-key="invest:panel:watchlist-e-ideas"]').evaluate(e=>e.classList.contains('user-view-hidden')),'la watchlist conserva su preferencia anterior');
 const hiddenHeader=async (selector,label)=>page.locator(selector+' th').evaluateAll((nodes,label)=>nodes.some(n=>n.textContent.trim()===label&&n.classList.contains('user-column-hidden')),label);
 ok(await hiddenHeader('#ivAllocTable','Valor'),'la columna de asignación sigue a su tabla original');
 ok(await hiddenHeader('#ivOps','Activo'),'la columna del journal sigue a su tabla original');
 ok(await hiddenHeader('#mDetail table','Actual'),'la columna de posiciones sigue a su tabla original');
 ok(!(await hiddenHeader('#ivOps','Precio')),'la preferencia de otra tabla no oculta una columna del journal');
 await page.click('#viewPrefsOpen');
 const guide=page.locator('#viewPrefsList input[aria-label="Mostrar Guía de ETFs"]');
 ok(await guide.count()===1&&!await guide.isChecked(),'Vista sigue ofreciendo la guía con un nombre claro');
 await guide.check();await page.click('#viewPrefsDone');
 ok(!await page.locator('#marketGuide').evaluate(e=>e.classList.contains('user-view-hidden')),'mostrar la guía retira la preferencia heredada');
 await page.click('#tabnav .tabbtn[data-tab="calc"]');await quieto(page);
 const year=page.locator('.tab.active details.panel').filter({has:page.locator('summary',{hasText:'Año a año'})});
 ok(await year.locator(':scope > summary').isVisible()&&!await year.evaluate(e=>e.open),'un panel plegado antiguo conserva un resumen accesible');
 await year.locator(':scope > summary').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('cabina-view-prefs:v1')).pages.calc.folded.includes('calc:panel:ano-a-ano'));
 ok(await year.evaluate(e=>e.open),'el teclado abre el panel y actualiza el plegado guardado');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cabina-view-prefs:v1')).pages.calc?.folded?.includes('calc:panel:ano-a-ano'));
 await page.click('#viewPrefsOpen');await page.click('#viewPrefsReset');await page.click('#viewPrefsDone');
 ok(await year.evaluate(e=>e.open),'restaurar la vista permite volver a leer el panel');
 await year.locator(':scope > summary').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cabina-view-prefs:v1')).pages.calc?.folded?.includes('calc:panel:ano-a-ano'));
 await year.locator(':scope > summary').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cabina-view-prefs:v1')).pages.calc?.expanded?.includes('calc:panel:ano-a-ano'));
 await page.click('#viewPrefsOpen');await page.fill('#viewName','Desplegable abierto');await page.click('#viewSave');await page.click('#viewPrefsDone');
 await page.reload();await arrancada(page,null);
 ok(await year.evaluate(e=>e.open),'un desplegable abierto se conserva al recargar');
 await year.locator(':scope > summary').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cabina-view-prefs:v1')).pages.calc?.folded?.includes('calc:panel:ano-a-ano'));
 await page.click('#viewPrefsOpen');await page.selectOption('#viewSaved',{label:'Desplegable abierto'});await page.click('#viewLoad');await page.click('#viewPrefsDone');
 ok(await year.evaluate(e=>e.open),'aplicar la vista guardada restaura su desplegable abierto');
 await page.reload();await arrancada(page,null);
 ok(await year.evaluate(e=>e.open),'la vista aplicada mantiene el desplegable abierto tras otra recarga');
 await page.click('#tabnav .tabbtn[data-tab="estudio"]');await quieto(page);
 for(const key of prefs.hidden.estudio){
  ok(await page.locator('[data-view-key="'+key+'"]').evaluate(e=>e.classList.contains('user-view-hidden')),'Estudio conserva el módulo '+key.split(':').at(-1));
 }
 await page.click('#viewPrefsOpen');
 for(const label of ['Elegir operación','Revisión de operación','P&L neto disponible','Protocolo de investigación','Recuperación activa']){
  ok(await page.locator('#viewPrefsList input').evaluateAll((nodes,label)=>nodes.some(n=>n.getAttribute('aria-label')==='Mostrar '+label),label),'Vista permite configurar '+label);
 }
 await page.click('#viewPrefsDone');
 ok(await snapshot(page)===before,'cambiar la presentación conserva operaciones, cuentas y posiciones');
 await page.reload();await arrancada(page,null);
 ok(await page.locator('[data-view-key="estudio:study-panel:modulo-11"]').evaluate(e=>e.classList.contains('user-view-hidden')),'la preferencia heredada sobrevive a recargar');
 ok(errors.length===0,'sin errores de JavaScript ni bucles de actualización');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log('PASS vista-heredada · '+checks+' comprobaciones');
