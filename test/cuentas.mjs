/* CUENTAS CON SYNC · el adaptador de Supabase y el login, contra un doble.

   Desde el entorno donde se escribió, el proxy corta supabase.co (403 al túnel):
   el proyecto real no se puede tocar desde aquí, y en CI tampoco sin secretos.
   Así que la página habla con un DOBLE que intercepta el navegador antes de la
   red y que se comporta como el real en lo que importa:

     - tokens con forma de JWT (la app lee sub y email del token),
     - cada fila con su user_id, y el doble filtra por el dueño del token como
       lo hace la RLS del proyecto: una fila con user_id ajeno se rechaza (42501),
     - tokens que caducan (401) y refresh que se gasta al usarse,
     - la API corta en 1000 filas, como la real.

   LO QUE ESTA PRUEBA NO DEMUESTRA: que la base real aísle a los usuarios. Eso es
   de supabase/pruebas/aislamiento.sql, que corre contra el proyecto de verdad.
   Aquí se prueba que la APP pide lo suyo, lo guarda donde toca, no mezcla la
   data de dos personas en el mismo navegador, y no manda nada sin cuenta. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto, conCuentas } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const NUBE = (html.match(/const NUBE_URL = "([^"]+)"/) || [])[1];
const CLAVE = (html.match(/const NUBE_CLAVE = "([^"]+)"/) || [])[1];
ok(!!NUBE && !!CLAVE, 'la página declara el origen y la clave pública de la nube', NUBE);

const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* ═══ EL DOBLE ═══ */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const nube = {
  usuarios: new Map(),      // email -> { id, pass, confirmado }
  tokens: new Map(),        // at -> { uid, caduca }
  refresh: new Map(),       // rt -> uid (se gasta al usarse)
  filas: new Map(),         // uid|path -> { user_id, path, data }
  pedidas: [],
  n: 0,
};
function nuevoUsuario(email, pass, confirmado = true) {
  const id = `00000000-0000-4000-8000-${String(++nube.n).padStart(12, '0')}`;
  nube.usuarios.set(email, { id, email, pass, confirmado });
  return id;
}
function sesion(u) {
  const at = `${b64({ alg: 'HS256' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated' })}.firma${++nube.n}`;
  const rt = `rt${++nube.n}`;
  nube.tokens.set(at, { uid: u.id, caduca: Date.now() + 3600e3 });
  nube.refresh.set(rt, u.id);
  return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
}
const porId = id => [...nube.usuarios.values()].find(u => u.id === id);
const filasDe = uid => [...nube.filas.values()].filter(f => f.user_id === uid);
const PATH_OK = /^[A-Za-z0-9_.~:@+-]+(\/[A-Za-z0-9_.~:@+-]+)+$/;

async function doble(route) {
  if (nube.caida) return route.abort('internetdisconnected');
  const req = route.request(), u = new URL(req.url()), h = req.headers();
  const cuerpo = () => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } };
  const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: obj == null ? '' : JSON.stringify(obj) });
  nube.pedidas.push({ m: req.method(), ruta: u.pathname + u.search, auth: h.authorization || '', apikey: h.apikey || '', body: req.postData() || '' });
  if (h.apikey !== CLAVE) return json(401, { message: 'Invalid API key' });

  if (u.pathname === '/auth/v1/token') {
    const b = cuerpo() || {};
    if (u.searchParams.get('grant_type') === 'password') {
      const usr = nube.usuarios.get(b.email);
      if (!usr || usr.pass !== b.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!usr.confirmado) return json(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return json(200, sesion(usr));
    }
    const uid = nube.refresh.get(b.refresh_token);
    if (!uid) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    nube.refresh.delete(b.refresh_token);
    return json(200, sesion(porId(uid)));
  }
  if (u.pathname === '/auth/v1/signup') {
    const b = cuerpo() || {};
    nube.ultimoRegistro = { email: b.email, redirect: u.searchParams.get('redirect_to') };
    if (!nube.usuarios.has(b.email)) nuevoUsuario(b.email, b.password, false);
    const usr = nube.usuarios.get(b.email);
    return json(200, { id: usr.id, email: usr.email, confirmation_sent_at: new Date().toISOString() });
  }
  if (u.pathname === '/auth/v1/recover') { nube.ultimaRecuperacion = { email: (cuerpo() || {}).email, redirect: u.searchParams.get('redirect_to') }; return json(200, {}); }

  const at = String(h.authorization || '').replace(/^Bearer /, '');
  const t = nube.tokens.get(at);
  if (!t) return json(401, { code: 'PGRST301', message: 'No suitable key or wrong key type' });
  if (t.caduca < Date.now()) return json(401, { code: 'PGRST301', message: 'JWT expired' });
  const uid = t.uid;

  if (u.pathname === '/auth/v1/logout') { nube.tokens.delete(at); return route.fulfill({ status: 204, body: '' }); }
  if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') {
    const usr = porId(uid); const b = cuerpo() || {};
    if (b.password === usr.pass) return json(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' });
    usr.pass = b.password; return json(200, { id: usr.id, email: usr.email });
  }
  if (u.pathname !== '/rest/v1/cabina_docs') return json(404, { message: 'no existe en el doble' });

  /* RLS del doble: todo lo que se lee, cambia o borra es SOLO del dueño del token. */
  const mias = filasDe(uid);
  const eq = k => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
  if (req.method() === 'GET') {
    let a = mias;
    if (eq('path') != null) a = a.filter(f => f.path === eq('path'));
    if (eq('coll') != null) a = a.filter(f => f.path.replace(/\/[^/]+$/, '') === eq('coll'));
    const orden = (u.searchParams.get('order') || 'path.asc').split(',')[0];
    const m = orden.match(/^(?:data->>(\w+)|(path))\.(asc|desc)$/);
    if (m) { const k = f => String(m[1] ? (f.data[m[1]] ?? '') : f.path); const s = m[3] === 'desc' ? -1 : 1; a = a.slice().sort((x, y) => (k(x) < k(y) ? -s : k(x) > k(y) ? s : x.path < y.path ? -1 : 1)); }
    const off = Number(u.searchParams.get('offset') || 0);
    const lim = Math.min(1000, Number(u.searchParams.get('limit') || 1000));   // la API real corta en 1000
    a = a.slice(off, off + lim);
    const sel = (u.searchParams.get('select') || 'data').split(',');
    return json(200, a.map(f => Object.fromEntries(sel.map(c => [c, f[c]]))));
  }
  if (req.method() === 'POST') {
    const b = cuerpo();
    if (!b || b.user_id !== uid) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "cabina_docs"' });
    if (!PATH_OK.test(b.path)) return json(400, { code: '23514', message: 'violates check constraint "cabina_docs_path_forma"' });
    nube.filas.set(uid + '|' + b.path, { user_id: uid, path: b.path, data: b.data });
    return route.fulfill({ status: 201, body: '' });
  }
  if (req.method() === 'DELETE') {
    const p = eq('path'); if (p != null) nube.filas.delete(uid + '|' + p);
    return route.fulfill({ status: 204, body: '' });
  }
  return json(405, { message: 'metodo' });
}

const b = await chromium.launch();
const errs = [];
async function contexto() {
  const ctx = await b.newContext();
  await ctx.route(NUBE + '/**', doble);
  return ctx;
}
async function abre(ctx, url = BASE) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 2500);
  return p;
}
const lee = p => p.evaluate(() => ({
  boton: (() => { const x = document.getElementById('cuentaBtn'); return x.hidden ? null : x.textContent; })(),
  rotulo: document.getElementById('saveState').textContent,
  pie: document.getElementById('footerStore').textContent,
  ops: FUT.trades().length,
  cuentas: FUT.accounts().length,
  sesion: localStorage.getItem('cabina-sesion:v1'),
  local: localStorage.getItem('cabina-mnq:v1') || '',
  papelera: Object.keys(localStorage).filter(k => /papelera/i.test(k)).map(k => localStorage.getItem(k)).join(''),
  href: location.href,
}));
async function entra(p, email, pass) {
  await p.click('#cuentaBtn'); await quieto(p);
  await p.fill('#auEmail', email); await p.fill('#auPass', pass);
  const nav = p.waitForEvent('load', { timeout: 8000 }).catch(() => null);
  await p.click('#auEntrar');
  await nav;
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 80, 3000);
}
const esperaNube = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);

const A = { email: 'ana@prueba.invalid', pass: 'contrasena-de-ana' };
const B = { email: 'beto@prueba.invalid', pass: 'contrasena-de-beto' };
const idA = nuevoUsuario(A.email, A.pass), idB = nuevoUsuario(B.email, B.pass);

console.log('\n═══ SIN CUENTA · nada sale del navegador ═══');
const ctx = await contexto();
await conCuentas(ctx);
{
  const p = await abre(ctx);
  const r = await lee(p);
  ok(r.boton === 'Entrar', 'fuera del artefacto aparece el botón «Entrar»', r.boton);
  ok(/no se envían a ningún servidor/.test(r.pie), 'y el pie sigue diciendo la verdad: no se envía nada', r.pie.slice(0, 70));
  await p.evaluate(() => FUT.createTrade({ id: 'loc1', type: 'futuros', accountId: FUT.accounts()[0].id, date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010, notes: 'SOLO-LOCAL' }));
  await quieto(p);
  ok(nube.pedidas.length === 0, 'sin cuenta, CERO peticiones a la nube', `${nube.pedidas.length} peticiones`);

  await p.click('#cuentaBtn'); await quieto(p);
  await p.fill('#auEmail', A.email); await p.fill('#auPass', 'mala');
  await p.click('#auEntrar');
  await esperaNube(p, () => /incorrectos/.test(document.getElementById('auMsg').textContent));
  const msg = await p.textContent('#auMsg');
  ok(/Email o contraseña incorrectos/.test(msg), 'contraseña mala: lo dice en castellano, sin sesión', msg);
  ok(!(await lee(p)).sesion, 'y no queda ninguna sesión guardada');
  await p.close();
}

console.log('\n═══ ENTRAR · la cuenta empieza limpia, sin lo del navegador ═══');
{
  const p = await abre(ctx);
  await entra(p, A.email, A.pass);
  const r = await lee(p);
  ok(!!r.sesion && JSON.parse(r.sesion).uid === idA, 'la sesión guardada es la de A');
  ok(r.rotulo === 'sincronizado' && r.pie.includes(A.email), 'el rótulo dice «sincronizado» y el pie nombra la cuenta', r.pie.slice(0, 60));
  ok(r.ops === 0 && r.cuentas === 0, 'la cuenta nueva NO hereda las cuentas ni operaciones de este navegador', `${r.ops} ops · ${r.cuentas} cuentas`);
  ok(filasDe(idA).length === 0, 'y no se escribió nada en la nube solo por entrar', `${filasDe(idA).length} filas`);
  const lecturas = nube.pedidas.filter(x => x.m === 'GET' && x.ruta.startsWith('/rest/'));
  ok(lecturas.length > 0 && lecturas.every(x => x.auth.startsWith('Bearer ')), 'cada lectura va con el token de A', `${lecturas.length} lecturas`);
  ok(nube.pedidas.every(x => x.apikey === CLAVE), 'y con la clave pública, nunca otra');

  console.log('\n═══ ESCRIBIR · cada cosa en su fila, con el dueño correcto ═══');
  await p.evaluate(() => {
    FUT.createAccount({ id: 'ca1', firm: 'Firma', name: 'Cuenta de Ana', size: 50000, dd: 2000, ddKind: 'estatico', status: 'evaluacion', ledger: [] });
    FUT.createTrade({ id: 'ta1', type: 'futuros', accountId: 'ca1', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21020, notes: 'NOTA-DE-ANA' });
  });
  ok(await esperaNube(p, () => document.getElementById('saveState').textContent === 'sincronizado'), 'nada queda «SIN GUARDAR»');
  await new Promise(r => setTimeout(r, 900));
  const fa = filasDe(idA).map(f => f.path).sort();
  ok(fa.includes('trades/ta1') && fa.includes('settings/main'), 'la operación y la configuración están en la nube, a nombre de A', fa.join(' · '));
  const posts = nube.pedidas.filter(x => x.m === 'POST' && x.ruta.startsWith('/rest/'));
  ok(posts.length > 0 && posts.every(x => JSON.parse(x.body).user_id === idA), 'toda escritura lleva user_id de A', `${posts.length} escrituras`);
  ok(!(await lee(p)).local.includes('NOTA-DE-ANA'), 'y NADA de A se escribió en el almacén local del navegador');

  console.log('\n═══ RECARGAR · lo de la nube vuelve ═══');
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined');
  ok(await esperaNube(p, () => FUT.trades().length === 1 && FUT.accounts().length === 1), 'tras recargar, A ve su operación y su cuenta');

  console.log('\n═══ SESIÓN QUE CADUCA · se renueva sola, una vez ═══');
  for (const [, t] of nube.tokens) if (t.uid === idA) t.caduca = Date.now() - 1000;
  const antes = nube.pedidas.filter(x => x.ruta.includes('grant_type=refresh_token')).length;
  await p.evaluate(() => FUT.createTrade({ id: 'ta2', type: 'futuros', accountId: 'ca1', date: '2026-09-18', instrument: 'MNQ', direction: 'short', qty: 1, entry: 21000, stop: 21010, exit: 20990 }));
  const guardada = await new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (nube.filas.has(idA + '|trades/ta2') || Date.now() - t0 > 5000) { clearInterval(i); res(nube.filas.has(idA + '|trades/ta2')); } }, 50); });
  const renovaciones = nube.pedidas.filter(x => x.ruta.includes('grant_type=refresh_token')).length - antes;
  ok(guardada, 'con el token caducado (401), la escritura se renueva y entra');
  ok(renovaciones === 1, 'con UNA sola renovación', `${renovaciones}`);

  console.log('\n═══ SESIÓN REVOCADA · se dice, no se finge ═══');
  for (const [, t] of nube.tokens) if (t.uid === idA) t.caduca = Date.now() - 1000;
  for (const [rt, uid] of nube.refresh) if (uid === idA) nube.refresh.delete(rt);
  await p.evaluate(() => FUT.createTrade({ id: 'ta3', type: 'futuros', accountId: 'ca1', date: '2026-09-19', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21000 }));
  ok(await esperaNube(p, () => document.getElementById('saveState').textContent === 'sesión caducada'), 'el rótulo pasa a «sesión caducada»');
  const r2 = await lee(p);
  ok(/NO se guarda/.test(r2.pie) && r2.boton === 'Entrar', 'el pie dice que no se guarda y el botón vuelve a «Entrar»', r2.pie.slice(0, 60));
  ok(!r2.sesion, 'y la sesión muerta se borra del navegador');
  ok(!nube.filas.has(idA + '|trades/ta3'), 'la operación no llegó, y así se dice');
  await entra(p, A.email, A.pass);
  ok(await esperaNube(p, () => document.getElementById('saveState').textContent === 'sincronizado'), 'volver a entrar la deja sincronizada otra vez');
  await p.close();
}

console.log('\n═══ SALIR · el navegador no guarda nada de A ═══');
{
  const p = await abre(ctx);
  ok(await esperaNube(p, () => FUT.trades().length === 2), 'A sigue dentro al abrir otra pestaña');
  /* Borrar en lote deja lo borrado en la papelera, que vive en ESTE navegador.
     Si sobreviviera al cierre de sesión, la siguiente persona podría
     «deshacer» las operaciones de A dentro de su propia cuenta. */
  await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
  await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
  await p.click('#selbtn-jrTable'); await quieto(p);
  await p.click('[data-sel="todo"]'); await quieto(p);
  await p.click('[data-sel="borrar"]'); await quieto(p);
  await p.click('[data-sel="si"]'); await new Promise(r => setTimeout(r, 800));
  ok((await lee(p)).papelera.includes('NOTA-DE-ANA'), 'A borra en lote: la papelera de este navegador guarda lo de A');
  await p.click('#cuentaBtn'); await quieto(p);
  ok(await p.evaluate(() => !document.getElementById('auDentro').hidden && document.getElementById('auQuien').textContent), 'el diálogo dice con qué cuenta estás');
  ok(await p.isVisible('#auSubir'), 'y ofrece subir lo de este navegador, que existe');
  const nav = p.waitForEvent('load', { timeout: 8000 }).catch(() => null);
  await p.click('#auSalir'); await nav;
  await p.waitForFunction(() => typeof window.FUT !== 'undefined'); await quieto(p);
  const r = await lee(p);
  ok(!r.sesion && r.boton === 'Entrar', 'fuera: sin sesión y con «Entrar»');
  ok(/no se envían/.test(r.pie), 'de vuelta al modo local');
  ok(r.ops === 1 && (await p.evaluate(() => FUT.trades()[0].notes)) === 'SOLO-LOCAL', 'se ve lo local de antes, no lo de A');
  const todo = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  ok(!todo.includes('NOTA-DE-ANA') && !todo.includes('Cuenta de Ana'), 'en localStorage no queda NI UN dato de A, tampoco en la papelera', `${todo.length} bytes revisados`);
  ok(!(await p.evaluate(() => !!document.getElementById('papelera'))), 'y no hay barra de «Deshacer» con lo de A');
  ok(nube.pedidas.some(x => x.ruta === '/auth/v1/logout'), 'y la sesión se cerró también en el servidor');
  await p.close();
}

console.log('\n═══ OTRA PERSONA EN EL MISMO NAVEGADOR ═══');
{
  const p = await abre(ctx);
  await entra(p, B.email, B.pass);
  const r = await lee(p);
  ok(JSON.parse(r.sesion).uid === idB, 'entra B');
  ok(r.ops === 0 && r.cuentas === 0, 'B no ve nada de A', `${r.ops} ops · ${r.cuentas} cuentas`);
  const deB = nube.pedidas.filter(x => x.auth && nube.tokens.get(x.auth.slice(7))?.uid === idB);
  ok(deB.length > 0, 'todo lo que pide B va con el token de B');
  await p.evaluate(() => FUT.createAccount({ id: 'cb1', firm: 'F', name: 'Cuenta de Beto', size: 25000, dd: 1000, ddKind: 'estatico', status: 'evaluacion', ledger: [] }));
  await new Promise(r => setTimeout(r, 900));
  ok(filasDe(idB).some(f => f.path === 'settings/main') && filasDe(idA).find(f => f.path === 'settings/main').data.accounts.every(a => a.id !== 'cb1'), 'la configuración de B es suya; la de A no se tocó');

  console.log('\n═══ BORRAR SESIONES EN LOTE, CON CUENTA ═══');
  nube.filas.set(idB + '|days/2026-09-10', { user_id: idB, path: 'days/2026-09-10', data: { date: '2026-09-10', result: 120, trades: 2, closed: true } });
  nube.filas.set(idB + '|days/2026-09-11', { user_id: idB, path: 'days/2026-09-11', data: { date: '2026-09-11', result: -40, trades: 1, closed: true } });
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => typeof window.FUT !== 'undefined');
  const filas = () => p.$$eval('#histWrap tr[data-date]:not(.sintetica)', n => n.length);
  ok(await esperaNube(p, () => document.querySelectorAll('#histWrap tr[data-date]').length === 2), 'las dos sesiones de la nube aparecen en el historial');
  await p.click('#selbtn-histWrap'); await quieto(p);
  await p.click('[data-sel="todo"]'); await quieto(p);
  await p.click('[data-sel="borrar"]'); await quieto(p);
  const conf = await p.textContent('#selbar-histWrap');
  ok(/\+\$120|\$80|resultados/.test(conf) && !/sin resultados/.test(conf), 'la confirmación cuenta el resultado real (antes leía de local: «sin resultados»)', conf.slice(0, 70));
  await p.click('[data-sel="si"]'); await new Promise(r => setTimeout(r, 800));
  ok(await filas() === 0 && !nube.filas.has(idB + '|days/2026-09-10') && !nube.filas.has(idB + '|days/2026-09-11'), 'se borran en pantalla Y en la nube');
  await p.click('[data-pap="undo"]'); await new Promise(r => setTimeout(r, 800));
  ok(await filas() === 2 && nube.filas.has(idB + '|days/2026-09-10'), 'y «Deshacer» las devuelve a los dos sitios');

  console.log('\n═══ SUBIR LO DEL NAVEGADOR · sólo si se pide, dos veces ═══');
  const n0 = filasDe(idB).length;
  await p.click('#cuentaBtn'); await quieto(p);
  await p.click('#auSubir'); await quieto(p);
  ok(filasDe(idB).length === n0 && /Pulsa otra vez/.test(await p.textContent('#auSubir')), 'el primer clic sólo pregunta');
  const nav = p.waitForEvent('load', { timeout: 8000 }).catch(() => null);
  await p.click('#auSubir'); await nav;
  await p.waitForFunction(() => typeof window.FUT !== 'undefined');
  ok(nube.filas.has(idB + '|trades/loc1'), 'el segundo sube la operación local a la cuenta de B');
  const cfgB = nube.filas.get(idB + '|settings/main').data;
  ok(cfgB.accounts.some(a => a.id === 'cb1') && cfgB.accounts.length === 1, 'y NO pisa la configuración que B ya tenía', cfgB.accounts.map(a => a.name).join(' · '));
  ok(await esperaNube(p, () => FUT.trades().some(t => t.id === 'loc1')), 'tras recargar, B la ve');
  await p.close();
}
await ctx.close();

console.log('\n═══ ENLACES DEL CORREO ═══');
{
  const c2 = await contexto();
  const p = await abre(c2);
  await p.click('#cuentaBtn'); await quieto(p);
  await p.fill('#auEmail', 'nueva@prueba.invalid'); await p.fill('#auPass', 'corta');
  await p.click('#auCrear'); await quieto(p);
  ok(/8 caracteres/.test(await p.textContent('#auMsg')), 'crear con contraseña corta: se para antes de enviar');
  await p.fill('#auPass', 'una-contrasena-larga');
  await p.click('#auCrear');
  ok(await esperaNube(p, () => /te llegará un enlace/.test(document.getElementById('auMsg').textContent)), 'crear: pide confirmar por email, sin decir si el email ya existía');
  ok(nube.ultimoRegistro && nube.ultimoRegistro.redirect === BASE, 'el enlace vuelve a ESTA página', nube.ultimoRegistro && nube.ultimoRegistro.redirect);
  await p.close();

  const usr = nube.usuarios.get('nueva@prueba.invalid'); usr.confirmado = true;
  const s = sesion(usr);
  const q = await abre(c2, `${BASE}#access_token=${s.access_token}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=signup`);
  const r = await lee(q);
  ok(!/access_token|refresh_token/.test(r.href) && /#cabina$/.test(r.href), 'el token se borra de la barra de direcciones al llegar', r.href.replace(BASE, '/'));
  ok(r.rotulo === 'sincronizado' && JSON.parse(r.sesion).uid === usr.id, 'y la cuenta confirmada queda dentro');
  await q.close();

  const s2 = sesion(usr);
  const w = await abre(c2, `${BASE}#access_token=${s2.access_token}&expires_in=3600&refresh_token=${s2.refresh_token}&type=recovery`);
  ok(await w.evaluate(() => document.getElementById('authOv').classList.contains('open') && !document.getElementById('auNueva').hidden), 'el enlace de recuperar abre «Contraseña nueva»');
  await w.fill('#auNuevaPass', 'otra-contrasena-nueva'); await w.click('#auGuardarNueva');
  ok(await esperaNube(w, () => /Contraseña cambiada/.test(document.getElementById('auMsg').textContent)), 'y la cambia');
  ok(usr.pass === 'otra-contrasena-nueva', 'en el servidor');
  await w.close();

  const e = await abre(c2, `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  ok(await e.evaluate(() => /caducó/.test(document.getElementById('auMsg').textContent)), 'un enlace caducado lo dice y ofrece pedir otro');
  await c2.close();
}

console.log('\n═══ ABRIR SIN RED · no parece una cuenta vacía ═══');
{
  const c5 = await contexto();
  const idD = nuevoUsuario('sinred@prueba.invalid', 'contrasena-larga');
  nube.filas.set(idD + '|trades/d1', { user_id: idD, path: 'trades/d1', data: { id: 'd1', type: 'futuros', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 } });
  const p = await abre(c5);
  await entra(p, 'sinred@prueba.invalid', 'contrasena-larga');
  ok(await esperaNube(p, () => FUT.trades().length === 1), 'con red, D ve su operación');
  nube.caida = true;
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => typeof window.FUT !== 'undefined');
  ok(await esperaNube(p, () => document.getElementById('saveState').textContent === 'sin conexión'), 'sin red: el rótulo dice «sin conexión», no «sincronizado»');
  ok(/NO se guarda/.test(await p.textContent('#footerStore')), 'y el pie avisa de que no se guarda');
  nube.caida = false;
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  ok(await esperaNube(p, () => document.getElementById('saveState').textContent === 'sincronizado' && FUT.trades().length === 1), 'vuelve la red: se recarga sola y dice «sincronizado»');
  await c5.close();
}

console.log('\n═══ MÁS DE 1000 OPERACIONES · no se quedan en la 1000 ═══');
{
  const c3 = await contexto();
  const idC = nuevoUsuario('muchas@prueba.invalid', 'contrasena-larga');
  for (let i = 0; i < 1005; i++) { const id = 't' + String(i).padStart(4, '0'); nube.filas.set(idC + '|trades/' + id, { user_id: idC, path: 'trades/' + id, data: { id, type: 'futuros', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21001 } }); }
  const p = await abre(c3);
  await entra(p, 'muchas@prueba.invalid', 'contrasena-larga');
  ok(await esperaNube(p, () => FUT.trades().length === 1005), 'las 1005 operaciones llegan (la API corta en 1000)', String(await p.evaluate(() => FUT.trades().length)));
  await c3.close();
}

console.log('\n═══ DENTRO DEL ARTEFACTO · la cuenta no existe ═══');
{
  const c4 = await contexto();
  await c4.addInitScript(() => { window.claude = { use: async () => null }; });
  const antes = nube.pedidas.length;
  const p = await abre(c4);
  ok((await lee(p)).boton === null, 'el botón de cuenta no aparece: allí manda la base del artefacto');
  ok(nube.pedidas.length === antes, 'y no sale ni una petición a la nube');
  await c4.close();
}

ok(errs.length === 0, 'la página no lanzó ningún error', errs.join(' | ') || 'sin pageerror');
await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
