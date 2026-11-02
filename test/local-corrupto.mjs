/* REGRESIÓN: JSON local corrupto jamás se sustituye por estado vacío. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)), '..');
const srv=sirvePublicado(readFileSync(join(root,'index.html')));
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+srv.address().port+'/';
const nav=await chromium.launch();
const ctx=await nav.newContext();
await ctx.addInitScript(()=>localStorage.setItem('cabina-mnq:v1','{datos_originales_ilegibles'));
const p=await ctx.newPage();
const failed=[];
const check=(yes,msg)=>{console.log('  '+(yes?'✅ ':'❌ ')+msg);if(!yes)failed.push(msg);};
try {
 await p.goto(base,{waitUntil:'load'});
 await p.waitForFunction(()=>window.FUT && typeof FUT.createTrade==='function');
 const inicial=await p.evaluate(()=>({
   raw:localStorage.getItem('cabina-mnq:v1'),
   label:document.getElementById('saveState').textContent,
   note:document.getElementById('footerStore').textContent
 }));
 check(inicial.raw==='{datos_originales_ilegibles','los bytes originales continúan');
 check(/ILEGIBLES/.test(inicial.label)&&/BLOQUEADO/.test(inicial.note),'advierte que la copia local es ilegible y está protegida');
 await p.evaluate(()=>FUT.createTrade({type:'futuros',instrument:'MNQ',date:'2026-11-01',qty:1,entry:20000,exit:20005}));
 await p.waitForTimeout(200);
 const despues=await p.evaluate(()=>({
   raw:localStorage.getItem('cabina-mnq:v1'),
   label:document.getElementById('saveState').textContent
 }));
 check(despues.raw==='{datos_originales_ilegibles','una escritura posterior NO pisa el contenido corrupto');
 check(!/guardado local/i.test(despues.label),'tampoco confirma falsamente que se guardó');
} finally {
 await nav.close();
 await new Promise(r=>srv.close(r));
}
if(failed.length){console.error('fallos: '+failed.length);process.exit(1);}
console.log('OK local-corrupto');
