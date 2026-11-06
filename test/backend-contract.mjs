/* Frontend ↔ Supabase contract.
   A mock does not certify the live database. This suite does certify that
   mismatches cannot silently convert an authenticated cloud write into
   last-write-wins, or a malformed response into an empty journal. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const contract = JSON.parse(readFileSync(join(root, 'contracts/backend.json'), 'utf8'));
const bad = [];
const check = (ok, title) => { console.log('  ' + (ok ? '✅' : '❌') + ' ' + title); if (!ok) bad.push(title); };

const adapter = app.slice(app.indexOf('function nubeDb() {'), app.indexOf('function localDb('));
check(contract.backend === 'supabase' && contract.table === 'public.cabina_docs', 'backend del contrato identificado');
check(contract.columns.version === 'integer' && contract.columns.data === 'jsonb' && contract.rlsRequired,
  'OCC, JSONB y RLS obligatorios en el contrato');
check(app.includes('lazniuuedlhqomfyykvf.supabase.co'), 'cliente usa el proyecto Supabase identificado');
check(adapter.includes('const T = "/rest/v1/cabina_docs"'), 'adaptador apunta a la tabla declarada');
const selected = [...adapter.matchAll(/select=([a-z][a-z0-9_,]*)/g)].flatMap(m => m[1].split(','));
check(selected.every(col => col in contract.columns), 'el frontend no consulta columnas ajenas al contrato');
check(selected.includes('version') && selected.includes('data') && selected.includes('path'),
  'la lectura solicita versión, datos y ruta');
check(!adapter.includes('nubeFetch(`${T}?on_conflict='), 'sin upsert incondicional en escrituras cloud');
check((adapter.match(/if \(nube\.occ === false\) throw err\("esquema_incompatible"/g) || []).length >= 3,
  'crear, editar y borrar fallan cerrados ante esquema incompatible');
check(adapter.includes('filasValidas('), 'respuestas validadas antes de publicar el snapshot');
check((adapter.match(/await this\.leeDoc\(p\); if \(nube\.occ === false\) throw err\("esquema_incompatible"/g) || []).length === 2,
  'crear y borrar/editar no escriben después de una lectura que degradó el contrato');
check(adapter.includes('select=version&limit=0'), 'recuperación de datos valida el esquema antes de insertar');

const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const exceptions = [];
try {
  /* Column absent: allow read-only fallback, never write or delete. */
  {
    const ctx = await browser.newContext();
    const d = nubeDoble();
    const uid = await d.conSesion(ctx, 'backend-mismatch@ejemplo.invalid');
    d.siembra(uid, 'trades/t1', {
      id:'t1',type:'futuros',instrument:'MNQ',direction:'long',entry:20000,
      stop:19990,exit:20010,qty:1,date:'2026-11-06',time:'10:00',notes:'original'
    });
    const writes = [];
    await ctx.route('**/rest/v1/cabina_docs?**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && (url.searchParams.get('select') || '').split(',').includes('version')) {
        return route.fulfill({status:400,contentType:'application/json',
          body:JSON.stringify({code:'42703',message:'column version does not exist'})});
      }
      if (['POST','PATCH','DELETE'].includes(request.method())) writes.push(request.method());
      return route.fallback();
    });
    const page = await ctx.newPage();
    page.on('pageerror',e=>exceptions.push(e.message));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('saveState')?.textContent.includes('BACKEND INCOMPATIBLE'),null,{timeout:20000});
    check(await page.evaluate(()=>document.getElementById('footerStore')?.textContent.includes('bloqueó las escrituras')),
      'aviso visible de backend incompatible');
    await page.waitForFunction(()=>window.FUT && FUT.trades().some(t=>t.id==='t1'),null,{timeout:20000});
    const before = JSON.stringify(d.e.filas.get(uid+'|trades/t1').data);
    await page.evaluate(()=>FUT.updateTrade('t1',{notes:'cambio que no debe pisar la nube'}));
    await page.waitForTimeout(700);
    check(JSON.stringify(d.e.filas.get(uid+'|trades/t1').data)===before,
      'trade remoto permanece intacto tras edición con versión ausente');
    check(writes.length===0,'ninguna petición POST/PATCH/DELETE en modo incompatible');
    check(await page.evaluate(()=>document.getElementById('saveState')?.textContent.includes('BACKEND INCOMPATIBLE')),
      'el error no se confunde con sincronizado después de editar');
    await ctx.close();
  }
  /* A 200 response with the wrong shape cannot be treated as an empty
     collection and authorise overwriting user data. */
  {
    const ctx = await browser.newContext();
    const d = nubeDoble();
    await d.conSesion(ctx,'backend-shape@ejemplo.invalid');
    let malformed=0;
    await ctx.route('**/rest/v1/cabina_docs?**',async route=>{
      const request=route.request();
      const u=new URL(request.url());
      if(request.method()==='GET' && (u.searchParams.get('select')||'').split(',').includes('version') && malformed++ === 0){
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({unexpected:'not an array'})});
      }
      return route.fallback();
    });
    const page=await ctx.newPage();
    page.on('pageerror',e=>exceptions.push(e.message));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('saveState')?.textContent.includes('BACKEND INCOMPATIBLE'),null,{timeout:20000});
    check(await page.evaluate(()=>document.getElementById('saveState').textContent!=='sincronizado'),
      'JSON malformado no se representa como sincronización correcta');
    check(malformed >= 1,'un único HTTP 200 incorrecto bastó para bloquear el contrato');
    check(await page.evaluate(()=>document.getElementById('saveState').textContent.includes('BACKEND INCOMPATIBLE')),
      'lecturas correctas posteriores no levantan la cuarentena de la sesión');
    await ctx.close();
  }
  check(exceptions.length===0,'ninguna excepción de JavaScript: '+exceptions.join(' | '));
} finally { await browser.close(); server.close(); }
if (bad.length) { console.error(bad.join('\n')); process.exitCode=1; }
