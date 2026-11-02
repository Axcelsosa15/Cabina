/* Carreras de carga reales: día pendiente, selección remota y fallo parcial.
   Todas las escrituras se interceptan en el doble; no usa datos reales. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (cond, msg) => {
  console.log('  ' + (cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fallos.push(msg);
};
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/';
const browser = await chromium.launch();
const errors = [];
const hoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

try {
  const ctx = await browser.newContext();
  const d = nubeDoble();
  const uid = await d.conSesion(ctx, 'hidratacion@ejemplo.invalid');
  d.siembra(uid, 'settings/main', {
    meta: { acct: 'cta1' }, accounts: [{ id: 'cta1', name: 'Cuenta guardada', firm: 'Prop' }]
  });
  const original = { date: hoy, note: 'NOTA ORIGINAL', result: 125, resultManual: true, updatedAt: 100 };
  d.siembra(uid, 'days/' + hoy, original);
  let libera;
  const puerta = new Promise(r => { libera = r; });
  let bloqueadas = 0;
  await ctx.route('**/rest/v1/cabina_docs?**', async route => {
    const u = new URL(route.request().url());
    if (route.request().method() === 'GET' && u.searchParams.get('path') === 'eq.days/' + hoy) {
      bloqueadas++;
      await puerta;
    }
    await route.fallback();
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => window.FUT && FUT.accounts().length === 1);
  ok(bloqueadas > 0, 'el documento del día sigue pendiente mientras la cuenta ya llegó');
  ok(await p.evaluate(() => document.getElementById('saveState').textContent !== 'sincronizado'),
    'el día sin cargar impide anunciar sincronización');
  ok(await p.evaluate(() => document.getElementById('jNote').disabled),
    'el journal espera al documento del día antes de permitir editar');
  ok(await p.evaluate(() => FUT.selectedAccountId() === 'cta1'),
    'restaura la cuenta seleccionada cuando settings llega por red');
  // Incluso un evento sintético no debe publicar un día construido con defaults.
  await p.evaluate(() => {
    const el = document.getElementById('jNote');
    el.value = 'NO REEMPLAZAR EL DÍA';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
  });
  libera();
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'sincronizado');
  ok(JSON.stringify(d.e.filas.get(uid + '|days/' + hoy).data) === JSON.stringify(original),
    'editar antes de hidratar no sobrescribe el día guardado');
  ok(await p.evaluate(() => document.getElementById('jNote').value === 'NOTA ORIGINAL'),
    'la nota original se muestra al terminar la carga');
  await ctx.close();

  // Un éxito de settings NO debe limpiar el fallo pendiente de trades.
  const ctx2 = await browser.newContext();
  const d2 = nubeDoble();
  await d2.conSesion(ctx2, 'salud-parcial@ejemplo.invalid');
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  await p2.goto(base, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.FUT && document.getElementById('saveState').textContent === 'sincronizado');
  let falloVisto = false;
  let liberaSettings;
  const settingsPuerta = new Promise(r => { liberaSettings = r; });
  await ctx2.route('**/rest/v1/cabina_docs?**', async route => {
    const u = new URL(route.request().url());
    if (route.request().method() === 'GET' && u.searchParams.get('coll') === 'eq.trades') {
      falloVisto = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST002' }) });
      return;
    }
    if (u.searchParams.get('path') === 'eq.settings/main') await settingsPuerta;
    await route.fallback();
  });
  const mala = p2.waitForResponse(r => r.status() === 503);
  await p2.evaluate(() => window.dispatchEvent(new Event('online')));
  await mala;
  const buena = p2.waitForResponse(r => new URL(r.url()).searchParams.get('path') === 'eq.settings/main');
  liberaSettings();
  await buena;
  // El callback de fetch termina antes de esta evaluación en el siguiente turno.
  await p2.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  ok(falloVisto && await p2.evaluate(() => /sin actualizar/i.test(document.getElementById('saveState').textContent)),
    'una lectura exitosa de otra colección no oculta el fallo de trades');
  await ctx2.unroute('**/rest/v1/cabina_docs?**');
  await p2.evaluate(() => window.dispatchEvent(new Event('online')));
  await p2.waitForFunction(() => document.getElementById('saveState').textContent === 'sincronizado');
  ok(true, 'el aviso se limpia cuando la colección que falló vuelve a cargar');
  await ctx2.close();
  ok(errors.length === 0, 'sin errores JavaScript');
} finally {
  await browser.close();
  await new Promise(r => srv.close(r));
}
if (fallos.length) { console.error('fallos: ' + fallos.length); process.exitCode = 1; }
