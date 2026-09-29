/* LANZAMIENTO · lo minimo para que una persona que no es el autor pueda usarla.

   No es la lista de todo lo que falta para lanzar -- esa esta en
   docs/LANZAMIENTO.md, con lo que es decision del dueño y no de ingenieria --, sino
   lo que el codigo tiene que garantizar y puede comprobarse:

     · que se dice, en todas las pestañas y en un telefono, que esto NO es
       asesoramiento financiero;
     · que se dice donde viven los datos, y que no salen del navegador;
     · que quien recibe el enlace ve un nombre y una descripcion de producto, y no
       «copia estatica del artefacto»;
     · que la cabecera no lleva nada de la configuracion personal;
     · y que mientras la pagina diga `noindex`, el documento de lanzamiento explique
       que ese es el interruptor. Cuando se quite, esta comprobacion deja de exigirlo.

   Su modo de fallo: un aviso legal que existe en el HTML y no se ve. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fuente); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const errs = [];

console.log('\n═══ EL AVISO SE VE, NO SOLO EXISTE ═══');
for (const [w, nom] of [[1440, 'escritorio'], [430, 'telefono']]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1200);
  const vistos = [];
  for (const t of ['cabina', 'futuros', 'invest', 'playbook', 'ideas', 'calc']) {
    await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(200);
    const v = await p.evaluate(() => {
      const el = [...document.querySelectorAll('footer span')].find(s => /asesoramiento financiero/i.test(s.textContent));
      if (!el) return null;
      el.scrollIntoView(); const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { alto: Math.round(r.height), ancho: Math.round(r.width), oculto: cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0,
        txt: el.textContent.trim(), sale: Math.round(r.right - document.documentElement.clientWidth) };
    });
    vistos.push([t, v]);
  }
  const malos = vistos.filter(([, v]) => !v || v.oculto || v.alto === 0 || v.sale > 0).map(([t]) => t);
  ok(malos.length === 0, `en ${nom}: el aviso de que no es asesoramiento financiero se ve en las seis pestañas`,
     malos.length ? `falta o no se ve en: ${malos.join(', ')}` : `${vistos[0][1].ancho}×${vistos[0][1].alto}px`);
  if (nom === 'escritorio') {
    const t = vistos[0][1] ? vistos[0][1].txt : '';
    ok(/riesgo/i.test(t), 'y dice que operar futuros conlleva riesgo de perdida', `«${t.slice(0, 110)}»`);
    const pie = await p.evaluate(() => (document.getElementById('footerStore') || {}).textContent || '');
    ok(/solo en este navegador/i.test(pie) && /no se env[ií]a/i.test(pie),
       'dice donde viven los datos y que no salen del navegador', `«${pie.trim()}»`);
  }
  await p.close();
}

console.log('\n═══ ARRANCA SIN GOOGLE ═══');
{
  /* Una app local-first que no arranca si Google no responde no es local-first. La
     hoja de estilos de las fuentes estaba en la cabecera, y una hoja de estilos
     pendiente BLOQUEA la ejecucion del script que viene despues: medido, FUT aparecia
     siempre ~200 ms despues de que fallara la peticion, 10 de 10. Detras de un proxy
     corporativo o sin conexion, la cabina esperaba a que caducara. Aqui la peticion
     no se contesta NUNCA. */
  const ctx = await b.newContext();
  await ctx.route('**/fonts.googleapis.com/**', () => { /* colgada: ni responde ni falla */ });
  await ctx.route('**/fonts.gstatic.com/**', () => { });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'commit' });
  let ms = null;
  try { await p.waitForFunction(() => typeof window.FUT !== 'undefined' && document.querySelector('.tabbtn'), null, { timeout: 8000 }); ms = Date.now() - t0; } catch (e) { }
  ok(ms != null && ms < 3000, 'con las fuentes de Google colgadas, la cabina arranca igual', ms == null ? 'NO arranco en 8 s' : `lista a los ${ms} ms`);
  let cargo = false;
  try { await p.waitForLoadState('load', { timeout: 5000 }); cargo = true; } catch (e) { }
  ok(cargo, 'y la pagina termina de cargar: el evento load no espera a Google', cargo ? 'load disparado' : 'load NO llego en 5 s');
  await ctx.close();
}

console.log('\n═══ LO QUE VE QUIEN RECIBE EL ENLACE ═══');
const cab = fuente.slice(0, fuente.indexOf('</head>'));
const meta = (attr, val) => (cab.match(new RegExp(`<meta[^>]+${attr}="${val}"[^>]+content="([^"]*)"`)) || cab.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attr}="${val}"`)) || [])[1];
const desc = meta('name', 'description') || '';
ok(desc && !/copia est[aá]tica|artefacto/i.test(desc), 'la descripcion es de producto, no «copia estatica del artefacto»', `«${desc.slice(0, 90)}»`);
ok(!!meta('property', 'og:title') && !!meta('property', 'og:description'), 'con titulo y descripcion para compartir (og)',
   `og:title «${meta('property', 'og:title') || '—'}»`);
ok(!!meta('name', 'twitter:card'), 'y tarjeta de enlace', `twitter:card «${meta('name', 'twitter:card') || '—'}»`);
const icono = (cab.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/) || [])[1] || '';
ok(/^data:image\/svg\+xml/.test(icono), 'con icono de pestaña, dentro del propio fichero: ningun recurso externo nuevo', icono ? icono.slice(0, 40) + '…' : 'sin icono');
const personal = (cab.match(/Lucid|Alpha Futures|MGC|Protocolo v2\.0|instrumento perdedor/) || [])[0];
ok(!personal, 'la cabecera no lleva nada de la configuracion personal', personal ? `aparece «${personal}»` : 'limpia');

/* Y NO SOLO LA CABECERA: EL REPOSITORIO ENTERO. Las cuentas, firmas y reglas de su
   autor salieron del codigo, de las pruebas, de la semilla y de la documentacion.
   Se recorre todo fichero versionado (git ls-files) para que no vuelvan por la
   puerta de atras: un fixture copiado, un comentario, un ejemplo. Se excluyen solo
   este fichero y primer.mjs, que tienen que nombrar lo que prohiben. MGC a secas no
   cuenta: es un contrato real del catalogo, no un dato personal. */
const PERSONAL_REPO = /Lucid|lucid25|Alpha Futures|alpha50|Alpha 50K|Apex|Topstep|MGC eliminado|instrumento perdedor|Protocolo v2\.0|EMA 10\/20\/55|Cabina MNQ/;
const versionados = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n')
  .filter(f => f && !/^test\/(lanzamiento|primer)\.mjs$/.test(f) && /\.(html|m?js|json|md|ya?ml|txt|css)$/.test(f));
const conRastro = versionados.map(f => {
  const m = readFileSync(join(raiz, f), 'utf8').match(PERSONAL_REPO);
  return m ? `${f} «${m[0]}»` : null;
}).filter(Boolean);
ok(versionados.length > 50 && conRastro.length === 0,
   'ningun fichero versionado lleva las cuentas ni las reglas personales',
   conRastro.length ? conRastro.slice(0, 4).join(' · ') : `${versionados.length} ficheros revisados`);

console.log('\n═══ EL INTERRUPTOR DEL LANZAMIENTO ═══');
const noindex = /<meta[^>]+name="robots"[^>]+noindex/.test(cab);
const doc = existsSync(join(raiz, 'docs', 'LANZAMIENTO.md')) ? readFileSync(join(raiz, 'docs', 'LANZAMIENTO.md'), 'utf8') : '';
ok(!noindex || /noindex/.test(doc), noindex
   ? 'la pagina aun dice noindex, y docs/LANZAMIENTO.md explica que ese es el interruptor'
   : 'la pagina ya es indexable: el lanzamiento esta hecho', noindex ? (doc ? 'documentado' : 'NO hay docs/LANZAMIENTO.md') : 'sin noindex');

ok(errs.length === 0, 'ningun error de pagina', errs.slice(0, 2).join(' | ') || 'ninguno');
await b.close(); srv.close();
console.log(fallos.length ? `\n  ${fallos.length} fallos` : '\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
