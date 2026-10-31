/* AJUSTES · VERSION Y ACTUALIZACIONES
   ─────────────────────────────────────────────────────────────────────────────
   QUE AFIRMA ESTE ARCHIVO. Que el botón compara de verdad: que dice «al día»
   cuando el servidor publica lo mismo, y «hay versión nueva» cuando publica
   algo distinto. Las dos mitades, porque un botón que SIEMPRE dice «al día»
   pasaría la mitad fácil y sería exactamente el botón inútil que se quería
   evitar.

   EL SERVIDOR ES PROPIO Y MUTABLE a propósito: `sirvePublicado` congela los
   ficheros al construirse, y aquí hace falta publicar una versión nueva a
   mitad de la prueba. Sirve EXACTAMENTE la misma lista de `publicado.mjs`, que
   se lee del workflow, así que no inventa un despliegue distinto.

   LA CACHE TIENE QUE ESTAR POBLADA ANTES DE MUTAR, y se exige: si el
   trabajador de servicio no ha guardado app.js, `copiaLocal` cae a un fetch
   normal, leería el fichero YA mutado y la comparación daría «al día» — un
   verde falso en la única pantalla que existe para no mentir sobre la versión.
   Por eso §2 no es decorado: es la condición que hace válido a §3. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLICADO } from './publicado.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEM = readFileSync(join(raiz, 'test/semilla.json'), 'utf8');
const fallos = [], errores = [];
const ok = (c, t, d) => { console.log('  ' + (c ? '✅' : '❌') + ' ' + t + (d != null ? '   ' + d : '')); if (!c) fallos.push(t); };

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

let sufijoAppJs = '';                     // lo que «se publica» de más
let falloAppJs = false;                  // simula un fallo parcial del servidor
const disco = new Map();
for (const f of PUBLICADO) disco.set('/' + f, [TIPOS[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', readFileSync(join(raiz, f))]);
const srv = createServer((q, r) => {
  let ruta = decodeURIComponent(q.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const e = disco.get(ruta);
  if (!e) { r.writeHead(404); return r.end('no'); }
  if (ruta === '/app.js' && falloAppJs) { r.writeHead(503); return r.end('fallo simulado'); }
  let cuerpo = e[1];
  if (ruta === '/app.js' && sufijoAppJs) cuerpo = Buffer.concat([cuerpo, Buffer.from(sufijoAppJs)]);
  r.writeHead(200, { 'content-type': e[0], 'cache-control': 'no-store' });
  r.end(cuerpo);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.addInitScript(s => { try { localStorage.setItem('cabina-mnq:v1', s); } catch (e) {} }, SEM);
const p = await ctx.newPage();
p.on('pageerror', e => errores.push(e.message));
await p.goto(base, { waitUntil: 'load' });
await p.waitForFunction(() => window.FUT, null, { timeout: 20000 });

console.log('\n═══ 1 · el panel existe y pinta el estado al abrir Ajustes ═══');
await p.click('.tabbtn[data-tab="ajustes"]');
await p.waitForTimeout(600);
ok(await p.locator('#panelActualizacion').count() === 1, 'la pestaña Ajustes tiene el panel de versión');
/* La huella sale de la copia guardada por el trabajador, que en la primera
   visita llega unos cientos de ms despues de cargar. Se espera a ella: el
   contrato es que acabe apareciendo, no que este en el primer repintado. */
const llegoHuella = await p.waitForFunction(
  () => /^[0-9a-f]{8,12}$/.test((document.querySelector('#updHuella b') || {}).textContent || ''),
  null, { timeout: 20000 }).then(() => true).catch(() => false);
const huella1 = (await p.locator('#updHuella b').textContent()).trim();
ok(llegoHuella, 'la huella del código cargado acaba siendo una huella, no un guion', huella1);
ok(/trabajador de servicio/i.test(await p.locator('#updSW').textContent()), 'informa del trabajador de servicio');

console.log('\n═══ 2 · la caché del trabajador guarda app.js (condición de §3) ═══');
const cacheada = await p.waitForFunction(async () => {
  if (!window.caches) return false;
  const r = await caches.match('./app.js');
  return !!r;
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
ok(cacheada, 'app.js está en la caché del trabajador antes de publicar nada nuevo');

console.log('\n═══ 3 · mismo payload publicado → al día, sin botón de aplicar ═══');
const opsAntes = await p.evaluate(() => FUT.trades().length);
await p.click('#updCheck');
await p.waitForFunction(() => /al día|up to date|no se pudo|could not/.test(document.getElementById('updMeta').textContent), null, { timeout: 20000 });
const meta1 = await p.locator('#updMeta').textContent();
ok(/al día/.test(meta1), 'dice que estás en la versión publicada', meta1.trim());
ok(await p.locator('#updApply').isHidden(), 'no ofrece actualizar cuando no hay nada nuevo');
ok(/\d+ archivos comparados/.test(await p.locator('#updNote').textContent()), 'dice cuántos archivos comparó',
  (await p.locator('#updNote').textContent()).trim().slice(0, 80));

console.log('\n═══ 4 · se publica algo nuevo → lo detecta y lo nombra ═══');
sufijoAppJs = '\n/* publicación nueva simulada por test/actualizacion.mjs */\n';
await p.click('#updCheck');
const detecta = await p.waitForFunction(() => /versión nueva|update available/.test(document.getElementById('updMeta').textContent), null, { timeout: 20000 })
  .then(() => true).catch(() => false);
ok(detecta, 'detecta que el servidor publica algo distinto', (await p.locator('#updMeta').textContent()).trim());
const nota4 = await p.locator('#updNote').textContent();
ok(/app\.js/.test(nota4), 'nombra el archivo que cambió', nota4.trim().slice(0, 90));
ok(await p.locator('#updApply').isVisible(), 'ofrece «Actualizar y recargar»');
ok(await p.evaluate(() => FUT.trades().length) === opsAntes, 'comprobar no tocó ni una operación', 'ops=' + opsAntes);
await p.click('#updCheck');
await p.waitForFunction(() => /versión nueva|update available/.test(document.getElementById('updMeta').textContent), null, { timeout: 20000 });
ok(await p.locator('#updApply').isVisible(), 'segunda comprobación conserva la actualización pendiente hasta recargar');
falloAppJs = true;
await p.click('#updCheck');
await p.waitForFunction(() => /no se pudo comprobar|could not check/.test(document.getElementById('updMeta').textContent), null, { timeout: 20000 });
ok(!/al día/.test(await p.locator('#updMeta').textContent()), 'un 503 de app.js nunca se informa como al día');
ok(await p.locator('#updApply').isVisible(), 'un fallo parcial no oculta la actualización ya detectada');
falloAppJs = false;

console.log('\n═══ 5 · recargar no se lleva por delante un cambio sin guardar ═══');
/* La barra pinta «SIN GUARDAR · N» cuando una escritura falla sin entrar en la
   cola, y su propio texto dice que recargar los pierde. El botón lee ESE
   veredicto ya renderizado, así que la prueba lo pone en la pantalla tal y
   como la app lo pintaría, y exige que el primer clic avise en vez de
   recargar. La URL antes y después es la evidencia de que no recargó. */
await p.evaluate(() => {
  const d = document.createElement('span');
  d.className = 'save-state nosave';
  d.textContent = 'SIN GUARDAR · 3';
  document.body.appendChild(d);
});
const urlAntes = p.url();
await p.click('#updApply');
await p.waitForTimeout(700);
ok(p.url() === urlAntes, 'con cambios en peligro, el primer clic NO recarga');
const aviso = await p.locator('#updNote').textContent();
ok(/3 cambio\(s\) no se guardaron/.test(aviso), 'avisa de cuántos se perderían', aviso.trim().slice(0, 95));
ok(/perder 3/.test(await p.locator('#updApply').textContent()), 'y el botón dice lo que va a costar',
  (await p.locator('#updApply').textContent()).trim());
await p.evaluate(() => { const d = document.querySelector('.save-state.nosave'); if (d) d.remove(); });

console.log('\n═══ 6 · sin conexión no inventa un verde ═══');
sufijoAppJs = '';
await ctx.setOffline(true);
await p.click('#updCheck');
await p.waitForTimeout(900);
const meta5 = await p.locator('#updMeta').textContent();
ok(/sin conexión|offline/i.test(meta5), 'con la red caída lo dice, en vez de decir que estás al día', meta5.trim());
await ctx.setOffline(false);

console.log('\n═══ 7 · las dos tarjetas del inventario que no llevaban a ninguna parte ═══');
await p.click('[data-ajuste-accion="vista"]');
await p.waitForTimeout(400);
ok(await p.locator('#viewPrefs').isVisible(), '«Abrir Vista» abre el panel de módulos y densidad');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.click('.tabbtn[data-tab="ajustes"]');
await p.waitForTimeout(300);
await p.click('[data-ajuste-accion="editar"]');
await p.waitForTimeout(500);
ok(await p.evaluate(() => document.querySelector('.tab[data-tab="cabina"]').classList.contains('active')),
  '«Abrir modo edición» lleva a la Cabina, que es donde vive');
ok(await p.evaluate(() => document.body.classList.contains('editing')), 'y deja el modo edición activado');

ok(errores.length === 0, 'sin errores de JavaScript', errores.join(' | ') || 'ninguno');
await browser.close();
await new Promise(r => srv.close(r));
console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' · ') : ''));
process.exit(fallos.length ? 1 : 0);