/* La hora real no debe decidir si la suite detecta un color ilegible. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
const srv = sirvePublicado();
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${srv.address().port}/`, browser=await chromium.launch();
let failures=0;
const ok=(v,s)=>{console.log(`  ${v?'✅':'❌'} ${s}`);if(!v)failures++;};
try {
 for(const mode of ['light','dark']) for(const [state,hour] of [['warn',13],['live',14],['off',19]]) {
  const ctx=await browser.newContext();
  await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await ctx.addInitScript(({mode,now})=>{
   localStorage.setItem('cabina-appearance:v1',JSON.stringify({mode,accent:'default'}));
   const RealDate=Date;
   window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  },{mode,now:Date.parse(`2026-11-03T${hour}:00:00Z`)});
  const p=await ctx.newPage();await p.goto(base);
  await p.waitForFunction(()=>window.FUT&&document.querySelector('#sesNow small'));
  await p.emulateMedia({reducedMotion:'reduce'});
  const result=await p.locator('#sesNow small').evaluate(el=>{
   const rgba=s=>{const n=s.match(/[\d.]+/g).map(Number);return[n[0],n[1],n[2],n[3]??1];};
   const blend=(a,b)=>a.slice(0,3).map((n,i)=>n*a[3]+b[i]*(1-a[3]));
   const layers=[];for(let e=el;e;e=e.parentElement)layers.push(rgba(getComputedStyle(e).backgroundColor));
   let bg=[255,255,255];for(const c of layers.reverse())bg=blend(c,bg);
   const fg=blend(rgba(getComputedStyle(el).color),bg);
   const l=c=>c.map(n=>n/255).map(n=>n<=.03928?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
   const x=l(fg),y=l(bg);return{ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05),state:el.closest('#sesNow').className};
  });
  ok(result.state.split(' ').includes(state),`${mode} · estado ${state} real`);
  ok(result.ratio>=4.5,`${mode} · ${state} tiene contraste legible (${result.ratio.toFixed(2)}:1)`);
  await ctx.close();
 }
}finally{await browser.close();await new Promise(r=>srv.close(r));}
console.log('fallos: '+failures);if(failures)process.exitCode=1;
