/* Entrar en demo no convierte una edición en ejemplos ni pierde el debounce. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, siembra, arrancada, enDisco } from './espera.mjs';
const HOY='2026-09-17', AHORA=Date.parse(HOY+'T14:00:00Z');
const key='cabina-mnq:v1'; let failed=0;
const ok=(c,t)=>{ console.log(`  ${c?'✅':'❌'} ${t}`);if(!c)failed++; };
const srv=sirvePublicado();await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${srv.address().port}`;
const browser=await chromium.launch();const errors=[];
try {
  for(const kind of ['day','settings','futures-today','futures-history']) {
    const ctx=await browser.newContext({viewport:{width:1320,height:950}});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(({now})=>{const Real=Date;window.Date=class extends Real{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};},{now:AHORA});
    const accounts=[{id:'real-a',name:'Cuenta real A',size:50000,dd:2500,ddKind:'estatico',status:'fondeada',ledger:[]},{id:'real-b',name:'Cuenta real B',size:25000,dd:1500,ddKind:'estatico',status:'fondeada',ledger:[]}];
    const date=kind==='futures-history'?'2026-09-16':HOY;
    await siembra(p,origin+'/',{settings:{...structuredClone(CONFIG_PRUEBA),accounts,updatedAt:AHORA-1000},days:{[HOY]:{date:HOY,note:'Nota original',closed:false,result:null,trades:null,updatedAt:AHORA-1000},'2026-09-16':{date:'2026-09-16',note:'Nota histórica',closed:true,broke:false,updatedAt:AHORA-1000}},trades:{}});
    await arrancada(p);
    if(kind.startsWith('futures')) {
      await p.locator('#tabnav [data-tab="futuros"]').click();
      await p.locator('#ftSeg [data-v="diario"]').click();
      await p.locator(`#cal [data-date="${date}"]`).click();
    }
    // Dispatch consecutive user events in one turn, inside the debounce window.
    await p.evaluate(kind=>{
      if(kind==='day') { const e=document.querySelector('#jNote');e.value='Edición real antes de demo';e.dispatchEvent(new Event('input',{bubbles:true})); }
      else if(kind==='settings') window.FUT.setSelectedAccount('real-b');
      else {
        const e=document.querySelector('#dayNote');e.value='Edición real antes de demo';e.dispatchEvent(new Event('input',{bubbles:true}));
        const cb=document.querySelector('#dayBroke');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));
      }
      document.querySelector('#demoToggle').click();
      document.querySelector('#settingsDemoEnter').click();
    },kind);
    await p.waitForFunction(()=>document.body.classList.contains('demo'));
    await enDisco(p,d=>kind==='settings'?d.settings?.meta?.acct==='real-b':d.days?.[date]?.note==='Edición real antes de demo');
    const data=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    ok(data.settings.accounts.map(a=>a.id).join(',')==='real-a,real-b',`${kind}: las cuentas reales no se sustituyen por la demo`);
    ok(kind==='settings'?data.days[HOY].note==='Nota original':data.days[date].note==='Edición real antes de demo',`${kind}: se conserva la nota real antes de entrar`);
    if(kind.startsWith('futures')) ok(data.days[date].broke===true,`${kind}: nota y regla rota consecutivas se guardan juntas`);
    ok(!JSON.stringify(data).includes('demo_eval')&&!JSON.stringify(data).includes('Sesión de ejemplo'),`${kind}: ningún ejemplo llega al almacenamiento real`);
    await Promise.all([p.waitForNavigation({waitUntil:"load"}),p.locator('#demoExit').click()]);await arrancada(p);
    const after=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    ok(JSON.stringify(after.settings.accounts)===JSON.stringify(data.settings.accounts)&&after.days[date].note===data.days[date].note,`${kind}: salir y recargar recupera los datos editados`);
    await ctx.close();
  }
  ok(errors.length===0,'sin errores de ejecución');
}finally{await browser.close();await new Promise(r=>srv.close(r));}
console.log('fallos: '+failed);process.exitCode=failed?1:0;
