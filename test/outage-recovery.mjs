/* INCIDENTE REAL: PGRST002/503 dejó Cabina sin trades pese a existir en DB.
   No llamar vacío a un fallo de lectura; repoblar al recuperarse la API. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const failed = [];
const check = (cond, name) => {
  console.log('  ' + (cond ? '✅ ' : '❌ ') + name);
  if (!cond) failed.push(name);
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srv = sirvePublicado(readFileSync(join(root,'index.html')));
await new Promise(resolve => srv.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + srv.address().port + '/';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const remote = nubeDoble();
const uid = await remote.conSesion(ctx, 'incidente-503@ejemplo.invalid');
remote.siembra(uid,'settings/main', { meta:{title:'Mi cuenta'},accounts:[{id:'prop25',name:'Cuenta de prueba 25K'}],updatedAt:1000 });
const expected = ['t1','t2','t3','t4','t5','t6'];
for (const [i,id] of expected.entries()) remote.siembra(uid, 'trades/' + id, {
  id, type:'futuros', accountId:'prop25', date:'2026-10-'+(25+i),
  instrument:'MNQ',qty:1,entry:20000,exit:20010,pnl:20,updatedAt:1000+i
});
remote.e.lecturasRotas = 'trades';
const page = await ctx.newPage();
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
try {
  await page.goto(base, {waitUntil:'load'});
  await page.waitForFunction(()=>window.FUT && typeof FUT.trades==='function');
  await page.waitForFunction(()=>/cargando datos|sin actualizar/i.test(document.getElementById('saveState').textContent),null,{timeout:10000});
  const initial = await page.evaluate(()=>({label:document.getElementById('saveState').textContent,seen:FUT.trades().length}));
  check(!/sincronizado/i.test(initial.label), '503 no anuncia nube sincronizada');
  check(initial.seen === 0, 'aún no llegaron registros; no se fabrican operaciones');
  check(expected.every(id=>remote.e.filas.has(uid+'|trades/'+id)),'las seis operaciones siguen en el servidor');
  remote.e.lecturasRotas = '';
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>FUT.trades().length===6 && /sincronizado/i.test(document.getElementById('saveState').textContent),null,{timeout:15000});
  check((await page.evaluate(()=>FUT.trades().map(x=>x.id))).sort().join(',')===expected.join(','),'las seis operaciones reaparecen tras restablecer lectura');
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.FUT && FUT.trades().length===6,null,{timeout:15000});
  check((await page.evaluate(()=>FUT.trades().length))===6,'recargar nuevamente conserva los seis trades');
  check(errors.length===0,'sin errores JavaScript');
} finally {
  await browser.close();
  await new Promise(resolve=>srv.close(resolve));
}
if (failed.length) { console.error('fallos: '+failed.length); process.exit(1); }
console.log('OK outage-recovery');
