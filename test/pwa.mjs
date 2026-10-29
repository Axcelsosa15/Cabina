/* SIN CONEXION E INSTALABLE · el casco, su politica y lo que NO se cachea.
   ─────────────────────────────────────────────────────────────────────────────
   POR QUE EXISTE ESTE ARCHIVO. El dia que la pagina dejo de ser un solo fichero
   aparecieron tres formas nuevas de romperla en silencio, y las tres son
   invisibles en pantalla:

     1. QUE EL CASCO Y LO PUBLICADO DIVERJAN. `sw.js` declara una lista de
        ficheros que guarda para cuando no hay red; `pagina.yml` declara otra
        lista de ficheros que sube. Si alguien añade uno a una y se olvida de la
        otra, la pagina se ve perfecta con red y abre rota sin ella. Es
        exactamente el fallo de `og.png` —referenciado, no publicado, 404
        durante horas— un nivel mas abajo.
     2. QUE LA CSP NIEGUE EL TRABAJADOR. `default-src 'none'` prohibe todo lo no
        listado. Sin `worker-src 'self'` el registro falla, y como el registro
        va con `.catch()` —tiene que ir— el fallo NO se ve: la pagina funciona,
        simplemente nunca vuelve a abrir sin red. Un silencio perfecto.
     3. QUE LA NUBE ACABE EN LA CACHE. Guardar una respuesta de Supabase seria
        servir el journal de una sesion a la siguiente. La frontera entre dos
        usuarios de este navegador esta en la base, con RLS; un trabajador que
        cachee respuestas la mueve al disco del cliente, que es justo donde no
        puede estar.

   Y UNA CUARTA, la que mas pruebas tocaria: que el registro se haga tambien en
   `file://`. Treinta de las sesenta y dos pruebas de la suite cargan la pagina
   asi; registrar ahi lanza, y una excepcion es un `pageerror`. Media suite roja
   por algo que ningun usuario ve nunca. §6 lo vigila por la forma de la guarda.

   LO QUE AQUI NO SE PRUEBA, dicho antes de que nadie lo suponga: que GitHub
   Pages sirva estos ficheros. Eso lo comprueba `pagina.yml` contra la URL real
   despues de desplegar, y la compuerta lo deja en UNKNOWN. Aqui se mide el
   mismo payload por HTTP local, que es lo unico que una prueba puede medir. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const lee = f => readFileSync(join(raiz, f), 'utf8');
const html = lee('index.html');
const sw = lee('sw.js');
const app = lee('app.js');
const wf = lee('.github/workflows/pagina.yml');

/* Un servidor que sirve el repositorio tal cual, como Pages. No un mapa fijo de
   rutas: si una prueba sirve menos de lo que se publica, mide otra cosa. */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.webmanifest': 'application/manifest+json', '.png': 'image/png',
                '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const sirve = async (cuerpoHtml) => {
  const srv = createServer((q, r) => {
    const ruta = decodeURIComponent(q.url.split('?')[0]);
    if (ruta === '/' || ruta === '/index.html') {
      r.writeHead(200, { 'content-type': TIPOS['.html'] }); return r.end(cuerpoHtml);
    }
    try {
      const b = readFileSync(join(raiz, ruta.replace(/^\//, '')));
      r.writeHead(200, { 'content-type': TIPOS[ruta.slice(ruta.lastIndexOf('.'))] || 'application/octet-stream' });
      r.end(b);
    } catch { r.writeHead(404); r.end('no'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
};

/* ═══ §1 · EL CASCO DECLARADO, EL PUBLICADO Y EL QUE EXISTE ═══════════════ */
console.log('\n═══ §1 · EL CASCO: sw.js, pagina.yml y el disco dicen lo mismo ═══');
const casco = Array.from((sw.match(/var CASCO = \[([\s\S]*?)\];/) || ['', ''])[1].matchAll(/'\.\/([^']*)'/g)).map(m => m[1]);
ok(casco.length >= 10, 'sw.js declara un casco', `${casco.length} entradas`);

/* './' es la propia pagina: no es un fichero del disco. */
const ficheros = casco.filter(f => f !== '');
const noExisten = ficheros.filter(f => !existsSync(join(raiz, f)));
ok(noExisten.length === 0, 'cada fichero del casco existe en el repositorio',
   noExisten.length ? `no está: ${noExisten.join(' · ')}` : ficheros.join(' · '));

/* El YAML sin comentarios: la prosa de arriba nombra ficheros y contarla seria
   el protocolo 14 otra vez. */
const yaml = wf.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
const sinPublicar = ficheros.filter(f => !yaml.includes(f));
ok(sinPublicar.length === 0, 'cada fichero del casco lo copia pagina.yml a sitio/',
   sinPublicar.length ? `el casco lo guarda y Pages NO lo publica: ${sinPublicar.join(' · ')}` : `${ficheros.length} ficheros`);

/* Y al reves: lo que se publica y no esta en el casco no abre sin red. Se
   excluyen los que no son parte de la pagina instalada. */
const FUERA_DEL_CASCO = new Set(['robots.txt', 'sitemap.xml', 'security.txt', '.nojekyll', 'sw.js']);
const publicados = Array.from(yaml.matchAll(/^\s*cp ([^\n]+?) sitio\/?[^\n]*$/gm))
  .flatMap(m => m[1].split(/\s+/)).map(f => f.replace(/^.*\//, ''))
  .filter(f => /\.(html|png|webmanifest|js|txt|xml)$/.test(f));
const huerfanos = Array.from(new Set(publicados)).filter(f => !FUERA_DEL_CASCO.has(f) && !ficheros.includes(f));
ok(huerfanos.length === 0, 'nada se publica como parte de la página sin entrar en el casco',
   huerfanos.length ? `publicado y no cacheado: ${huerfanos.join(' · ')}` : 'ninguno');

/* ═══ §2 · LA POLITICA PERMITE EL TRABAJADOR Y EL MANIFIESTO ══════════════ */
console.log('\n═══ §2 · LA CSP DECLARA worker-src Y manifest-src ═══');
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const dir = Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
ok(JSON.stringify(dir['worker-src']) === `["'self'"]`, "worker-src 'self': el trabajador puede registrarse", (dir['worker-src'] || []).join(' ') || 'NO declarado — cae en default-src none');
ok(JSON.stringify(dir['manifest-src']) === `["'self'"]`, "manifest-src 'self': el manifiesto se puede leer", (dir['manifest-src'] || []).join(' ') || 'NO declarado — cae en default-src none');
ok(/<link rel="manifest" href="\.\/manifest\.webmanifest">/.test(html), 'la página enlaza su manifiesto');

const manifiesto = JSON.parse(lee('manifest.webmanifest'));
const iconos = manifiesto.icons.map(i => i.src);
ok(iconos.every(i => existsSync(join(raiz, i))), 'cada icono del manifiesto existe', iconos.join(' · '));
ok(manifiesto.icons.some(i => i.purpose === 'maskable'), 'hay un icono maskable (Android lo recorta)');
ok(iconos.every(i => ficheros.includes(i)), 'los iconos del manifiesto están en el casco');

/* ═══ §3 · POR HTTP: SE REGISTRA, Y SIN RED LA PAGINA ABRE ════════════════ */
console.log('\n═══ §3 · SERVIDA COMO PAGES: se instala y sobrevive a quedarse sin red ═══');
const { srv, base } = await sirve(html);
const nav = await chromium.launch();
const ctx = await nav.newContext();
const pag = await ctx.newPage();
const errs = [];
pag.on('pageerror', e => errs.push(e.message));
const violaciones = [];
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline'))); });
await pag.goto(base, { waitUntil: 'load' });
await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

const activo = await pag.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
ok(activo === true, 'el trabajador de servicio queda activo', activo ? 'ready con un worker activo' : 'NO se activó');
violaciones.push(...await pag.evaluate(() => window.__csp));
ok(!violaciones.some(v => /worker-src|manifest-src/.test(v)), 'ninguna violación de worker-src ni manifest-src',
   violaciones.length ? violaciones.join(' | ') : 'ninguna violación de CSP');

/* El casco en la cache, contado: que el trabajador este activo no dice que haya
   guardado nada. */
const guardadas = await pag.evaluate(async () => {
  const ks = await caches.keys();
  const c = await caches.open(ks[0]);
  return (await c.keys()).map(r => r.url);
});
ok(guardadas.length >= ficheros.length, 'el casco está guardado en la caché',
   `${guardadas.length} respuestas en caché, el casco son ${ficheros.length} ficheros + la raíz`);

/* LA PRUEBA DE VERDAD: se corta la red y se recarga. Si la pagina pinta y el
   script corre, el casco sirve para lo que dice servir. */
await ctx.setOffline(true);
let abreSinRed = false, detalle = '';
try {
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  abreSinRed = await pag.evaluate(() => !!document.querySelector('footer') && typeof window.FUT !== 'undefined');
} catch (e) { detalle = e.message.split('\n')[0].slice(0, 120); }
ok(abreSinRed, 'SIN RED, la página recarga y la aplicación arranca', abreSinRed ? 'window.FUT presente tras recargar offline' : detalle || 'no arrancó');
await ctx.setOffline(false);

/* ═══ §4 · LA NUBE NO SE CACHEA NUNCA ════════════════════════════════════ */
console.log('\n═══ §4 · SUPABASE NO ENTRA EN LA CACHÉ ═══');
const enCache = guardadas.filter(u => /supabase\./.test(u));
ok(enCache.length === 0, 'ninguna respuesta de Supabase en la caché', enCache.length ? enCache.join(' | ') : '0 de ' + guardadas.length);
/* Y la forma: el `return` ANTES de cualquier respondWith. Una prueba de
   comportamiento no puede demostrarlo sin red real, asi que se vigila la guarda
   en el codigo, que es lo que un cambio futuro tocaria. */
const guarda = /supabase\\\.\(co\|in\|com\)\$\/\.test\(url\.hostname\)\)\s*return;/.test(sw)
            || /supabase[^\n]*test\(url\.hostname\)\)\s*return;/.test(sw);
ok(guarda, 'sw.js sale sin tocar la petición cuando el destino es Supabase');
const posRespond = sw.indexOf('respondWith');
const posGuarda = sw.search(/supabase[^\n]*test\(url\.hostname\)/);
ok(posGuarda > 0 && posGuarda < posRespond, 'la guarda de Supabase va ANTES del primer respondWith',
   `guarda en ${posGuarda}, respondWith en ${posRespond}`);
ok(/url\.origin !== self\.location\.origin\)\s*return;/.test(sw), 'nada de otro origen se cachea (ni fuentes ni CDN)');

/* ═══ §5 · LAS PAGINAS LEGALES ═══════════════════════════════════════════ */
console.log('\n═══ §5 · LO LEGAL: existe, se enlaza y no carga nada ═══');
const LEGALES = ['privacidad.html', 'terminos.html', 'seguridad.html'];
LEGALES.forEach(f => {
  const t = lee(f);
  const externos = Array.from(t.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)).map(m => m[1]);
  const fuera = externos.filter(u => !/^https:\/\/github\.com\//.test(u));
  ok(!/<script/i.test(t), `${f} no trae una sola etiqueta <script>`);
  ok(fuera.length === 0, `${f} no pide ningún recurso externo`, fuera.length ? fuera.join(' | ') : `${externos.length} enlaces, todos a GitHub o locales`);
  ok(/default-src 'none'/.test(t), `${f} declara default-src 'none'`);
});
const pie = (html.match(/<footer>[\s\S]*?<\/footer>/) || [''])[0];
const sinEnlazar = LEGALES.filter(f => !pie.includes(`./${f}`));
ok(sinEnlazar.length === 0, 'el pie de la aplicación enlaza las tres',
   sinEnlazar.length ? `sin enlace: ${sinEnlazar.join(' · ')}` : LEGALES.join(' · '));

const mapa = lee('sitemap.xml');
const enMapa = Array.from(mapa.matchAll(/<loc>https:\/\/axcelsosa15\.github\.io\/Cabina\/([^<]*)<\/loc>/g)).map(m => m[1]).filter(Boolean);
ok(LEGALES.every(f => enMapa.includes(f)), 'el sitemap lista las tres páginas legales', enMapa.join(' · '));
ok(enMapa.every(f => existsSync(join(raiz, f))), 'el sitemap no lista ninguna página que no exista');
ok(/Contact: https:\/\/github\.com\/Axcelsosa15\/Cabina\/security\/advisories\/new/.test(lee('.well-known/security.txt')),
   'security.txt da un canal privado, y no un correo personal');

/* ═══ §6 · EL REGISTRO NO SE HACE EN file:// ═════════════════════════════ */
console.log('\n═══ §6 · LA GUARDA QUE PROTEGE A LAS OTRAS 30 PRUEBAS ═══');
/* El registro vive en app.js desde que la aplicacion salio del documento.
   Buscarlo en el HTML devolvia cadena vacia y las dos aserciones de abajo se
   ponian rojas diciendo «no se encontro el bloque» — que es lo correcto, pero
   el sitio donde mirar es este. */
const bloque = (app.match(/if \('serviceWorker' in navigator[\s\S]{0,320}?\n  \}/) || [''])[0];
ok(/location\.protocol/.test(bloque), 'el registro comprueba el protocolo antes de intentarlo',
   bloque ? bloque.split('\n')[0].trim() : 'no se encontró el bloque de registro');
ok(/\.catch\(/.test(bloque), 'el registro atrapa su propio rechazo (sw.js puede no estar servido)');

/* CONTROL POSITIVO · si se quita worker-src, el navegador TIENE que negarse.
   Sin esto, §2 y §3 podrian estar midiendo una politica que ya permite todo. */
console.log('\n═══ §7 · CONTROL POSITIVO · con worker-src none, el navegador lo rechaza ═══');
/* ESTE CONTROL CAMBIO CUANDO LA CSP DEJO DE SER 'unsafe-inline'. Antes bastaba
   con QUITAR worker-src: la politica caia en `default-src 'none'` y el registro
   moria. Hoy `script-src 'self'` es el respaldo de worker-src, asi que quitarlo
   ya NO prohibe nada — medido: el trabajador se registraba igual y este control
   se puso rojo diciendo exactamente eso, «SE REGISTRO IGUAL».
   Un control positivo que deja de disparar es peor que no tenerlo, asi que se
   prohibe de verdad: worker-src 'none'. */
const htmlSinWorker = html.replace("worker-src 'self';", "worker-src 'none';");
const { srv: srv2, base: base2 } = await sirve(htmlSinWorker);
const ctx2 = await nav.newContext();
const pag2 = await ctx2.newPage();
await pag2.goto(base2, { waitUntil: 'load' });
await pag2.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
const activo2 = await pag2.evaluate(() => Promise.race([
  navigator.serviceWorker.ready.then(() => true),
  new Promise(r => setTimeout(() => r(false), 2500)),
]).catch(() => false));
ok(activo2 === false, "worker-src 'none' impide que el trabajador se registre",
   activo2 ? 'SE REGISTRÓ IGUAL: §2 y §3 no prueban nada' : 'rechazado por la CSP, como debe');

await ctx2.close(); srv2.close();
ok(errs.length === 0, 'la página no lanzó ningún error', errs.length ? errs.join(' | ') : 'sin pageerror');
await nav.close(); srv.close();

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
