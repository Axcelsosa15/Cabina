/* La recarga desde /Cabina/ debe renovar también index.html, sin tocar datos. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { PUBLICADO } from './publicado.mjs';
import { CONFIG_PRUEBA } from './espera.mjs';
const files = new Map(PUBLICADO.map(f => [f, readFileSync(new URL('../' + f, import.meta.url))]));
let version = 1, failures = 0;
const html = () => files.get('index.html').toString().replace('</head>', `<meta name="cabina-qa-version" content="${version}"></head>`);
const srv = createServer((q, r) => {
  let f = new URL(q.url, 'http://localhost').pathname.replace(/^\/Cabina\//, '');
  if (!f) f = 'index.html';
  if (!files.has(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', 'cache-control': 'no-store' });
  r.end(f === 'index.html' ? html() : files.get(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/Cabina/`, browser = await chromium.launch();
const ok = (v, s) => { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) failures++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await ctx.addInitScript(settings => {
    if (!localStorage.getItem('cabina-mnq:v1')) localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings, trades: {}, research: {}, days: {} }));
  }, { ...structuredClone(CONFIG_PRUEBA), accounts: [] });
  const p = await ctx.newPage();
  await p.goto(base);
  /* LA PRECONDICION, Y POR QUE NO BASTA `caches.match('./index.html')`.
     A partir de aqui el test MUTA lo que el servidor publica, asi que la copia
     guardada tiene que haber dejado de moverse. Y se mueve por DOS caminos a la
     vez: el `fetch` de la pagina, que cachea index.html y sus cinco scripts al
     cargar, y el `install` del trabajador, que hace su propio `c.add()` de los
     16 ficheros del casco en paralelo. Esperar a que index.html «este» lo
     satisface el primer camino mientras el `c.add('./index.html')` del segundo
     sigue en vuelo: aterriza DESPUES de `version = 2`, guarda la v2 y entonces
     cache y red coinciden. El veredicto correcto pasa a ser «al dia» y la
     prueba se pone roja por el reloj, no por la aplicacion.
     Medido en main, sin ningun otro cambio: 1 de cada 4 ejecuciones en rojo.
     `serviceWorker.ready` resuelve con un trabajador ACTIVO, o sea cuando
     `install` ya termino: es el unico momento en que la copia esta quieta. */
  await p.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller && !!(await caches.match('./index.html'));
  });
  const records = await p.evaluate(() => localStorage.getItem('cabina-mnq:v1'));
  async function check() {
    await p.locator('#tabnav [data-tab="ajustes"]').click();
    await p.locator('#updCheck').click();
    await p.waitForFunction(() => !document.getElementById('updCheck').disabled && !/comprobando/i.test(document.getElementById('updMeta').textContent));
    return p.locator('#updMeta').innerText();
  }
  async function reloadVersion() {
    await Promise.all([p.waitForNavigation(), p.locator('#updApply').click()]);
    await p.waitForFunction(v => document.querySelector('meta[name="cabina-qa-version"]')?.content === String(v) && window.FUT, version);
  }
  version = 2;
  ok(/versión nueva/.test(await check()), 'desde /Cabina/ se detecta un index.html nuevo');
  await reloadVersion();
  ok(/al día/.test(await check()), 'después de actualizar la ruta inicial no reaparece el aviso');
  ok(await p.evaluate(async () => (await (await caches.match('./index.html')).text()).includes('content="2"')), 'la caché canónica de index.html se renueva al navegar a la ruta inicial');
  ok(await p.evaluate(() => localStorage.getItem('cabina-mnq:v1')) === records, 'la actualización no modifica los registros locales');
  await p.goto(base + 'privacidad.html');
  ok(await p.evaluate(async () => (await (await caches.match('./index.html')).text()).includes('cabina-qa-version')), 'abrir Privacidad no reemplaza la aplicación en caché');
  await p.goto(base);
  version = 3;
  ok(/versión nueva/.test(await check()), 'una publicación posterior sigue detectándose');
  await reloadVersion();
  ok(/al día/.test(await check()), 'la segunda actualización también termina al día');
  version = 4;
  await p.goto(base + 'index.html');
  await p.waitForFunction(() => document.querySelector('meta[name="cabina-qa-version"]')?.content === '4' && window.FUT);
  ok(await p.evaluate(async () => (await (await caches.match('./')).text()).includes('name="cabina-qa-version" content="4"')), 'abrir index.html también renueva la entrada corta para el siguiente arranque sin red');
  await ctx.close();
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
console.log('fallos: ' + failures); if (failures) process.exitCode = 1;
