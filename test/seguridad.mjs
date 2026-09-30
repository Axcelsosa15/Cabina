/* SEGURIDAD · lo que la auditoria de la fase 0 encontro, convertido en guardian.

   No prueba «la app es segura»: eso no se puede probar. Prueba las propiedades
   concretas que se comprobaron y que un cambio futuro podria romper sin que nadie
   lo note, porque ninguna de ellas es visible en pantalla.

   Su modo de fallo: que alguien «simplifique» imgSrc de vuelta a devolver im.data
   tal cual, y que importar un respaldo ajeno vuelva a delatar a quien lo abre. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');

console.log('\n═══ SUPERFICIE DE EJECUCION · lo que no debe aparecer nunca ═══');
/* SE CUENTA SOBRE EL CODIGO, NO SOBRE LA PROSA. La primera version de esta seccion
   se puso roja por «cero urls javascript:» con una sola aparicion... dentro del
   COMENTARIO que explica por que se filtran los esquemas de las imagenes. El
   fichero estaba bien; el instrumento contaba prosa como codigo. Es el protocolo 14
   otra vez, con otro disfraz, y es un fallo que este mismo fichero tenia que evitar.

   Asi que se quitan los comentarios antes de contar. Si alguna vez hace falta uno de
   estos patrones DE VERDAD, tendra que ser una decision consciente que ponga esta
   prueba en rojo primero. */
const sinComentarios = html
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      /* bloque */
  .replace(/^[ \t]*\/\/.*$/gm, ' ')        /* linea entera */
  .replace(/<!--[\s\S]*?-->/g, ' ');       /* comentario HTML */
const PROHIBIDO = [
  ['eval(', 'eval'], ['new Function(', 'new Function'], ['document.write(', 'document.write'],
  ['javascript:', 'urls javascript:'], ['.outerHTML', 'outerHTML'], ['insertAdjacentHTML', 'insertAdjacentHTML'],
  ['srcdoc', 'srcdoc'], ['document.domain', 'document.domain'],
  ['XMLHttpRequest', 'XMLHttpRequest'], ['new WebSocket', 'WebSocket'], ['new EventSource', 'EventSource'],
  ['sendBeacon', 'sendBeacon'], ['postMessage', 'postMessage'], ['window.open', 'window.open'],
];
PROHIBIDO.forEach(([pat, nom]) => {
  const n = sinComentarios.split(pat).length - 1;
  const enProsa = (html.split(pat).length - 1) - n;
  ok(n === 0, `cero ${nom}`,
     n ? `${n} apariciones EN CODIGO` : (enProsa ? `0 en codigo (${enProsa} en comentarios)` : '0'));
});

console.log('\n═══ RECURSOS EXTERNOS · la cadena de suministro del navegador ═══');
const externos = Array.from(html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)).map(m => m[1]);
const hosts = Array.from(new Set(externos.map(u => { try { return new URL(u).host; } catch { return u; } })));
ok(hosts.every(h => /(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/.test(h)),
   'los unicos origenes externos son las fuentes de Google', hosts.join(' · ') || 'ninguno');
ok(!/<script[^>]+src=/i.test(html), 'cero <script src>: no se carga codigo de terceros',
   'el motor va incrustado');

console.log('\n═══ LA RED · un solo destino, y sólo con cuenta ═══');
/* Con las cuentas, la página habla con Supabase. Eso abre una puerta que antes no
   existía, y se vigila en tres propiedades: un ÚNICO origen (el del proyecto), una
   única función que llama a la red, y una clave que es la PÚBLICA. La clave
   secreta (service_role, sb_secret_) salta la RLS: si apareciera aquí, cualquiera
   que leyera la página leería la data de todos. */
const NUBE = (sinComentarios.match(/const NUBE_URL = "([^"]+)"/) || [])[1] || '';
const CLAVE = (sinComentarios.match(/const NUBE_CLAVE = "([^"]+)"/) || [])[1] || '';
ok(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(NUBE), 'el origen de la nube es un proyecto Supabase exacto, por https', NUBE);
ok(/^sb_publishable_/.test(CLAVE), 'la clave es la publicable, nunca una secreta', CLAVE.slice(0, 15) + '…');
ok(!/service_role|sb_secret_/.test(html), 'ni rastro de service_role ni de sb_secret_ en el fichero', 'limpio');
/* Dos llamadas y ni una más: la de la nube, y la que mete las capturas dentro de
   un respaldo, que sólo recibe lo que ya pasó por imgSrc (el filtro de abajo). */
const llamadas = Array.from(sinComentarios.matchAll(/\bfetch\(([^,)]*)/g)).map(m => m[1].trim());
ok(llamadas.length === 2 && llamadas.includes('NUBE_URL + ruta') && llamadas.includes('imgSrc(im'),
   'fetch sólo a NUBE_URL y a imágenes ya filtradas por imgSrc', llamadas.join(' · '));
const urls = Array.from(new Set(Array.from(sinComentarios.matchAll(/https?:\/\/[a-z0-9.-]+\.supabase\.(co|in|com)/gi)).map(m => m[0])));
ok(urls.length === 1 && urls[0] === NUBE, 'ningún otro proyecto Supabase citado en el código', urls.join(' · '));

console.log('\n═══ SECRETOS · en el fichero que se publica ═══');
/* El artefacto ES este fichero. Un secreto aqui es un secreto publicado. */
const SOSPECHA = /(sk-[A-Za-z0-9]{20})|(ghp_[A-Za-z0-9]{20})|(AKIA[0-9A-Z]{16})|(-----BEGIN [A-Z ]*PRIVATE KEY)|(["'](?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)["']\s*:\s*["'][^"']{8,})/i;
ok(!SOSPECHA.test(html), 'ningun patron de secreto en index.html', 'limpio');

console.log('\n═══ EL FILTRO DE IMAGENES · el hallazgo 3.1 de la auditoria ═══');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
/* SE REGISTRA TODA PETICION QUE SALGA. Es la asercion de verdad: no que una funcion
   devuelva lo correcto, sino que el navegador NO PIDA la URL del atacante.

   UN MATIZ QUE DESTAPO EL PROPIO SABOTAJE, y conviene no sobreleer esta prueba:
   al quitar el filtro, las que se pidieron de inmediato fueron `blob:` y `file:`.
   Las de `http(s)://` NO aparecieron en esa corrida porque las miniaturas llevan
   `loading="lazy"` y no estaban en pantalla. O sea: esta prueba detecta la
   regresion —se pone roja— pero NO demuestra que una baliza https se dispare al
   instante; se dispararia al hacer scroll. El filtro las bloquea igual, porque
   actua antes, en `imgSrc`. */
const pedidas = [];
p.on('request', r => pedidas.push(r.url()));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1200);

const F = await p.evaluate(() => {
  const casos = [
    ['data:image/png;base64 valido',  { data: 'data:image/png;base64,iVBORw0KGgo=' }, true],
    ['data:image/webp valido',        { data: 'data:image/webp;base64,UklGRg==' },     true],
    ['id de asset valido',            { id: 'abc123_ID-xyz' },                         true],
    ['https:// de un respaldo ajeno', { data: 'https://evil.example/track.png' },      false],
    ['http:// de un respaldo ajeno',  { data: 'http://evil.example/p.gif' },           false],
    ['protocolo relativo //',         { data: '//evil.example/p.gif' },                false],
    ['javascript:',                   { data: 'javascript:alert(1)' },                 false],
    ['blob:',                         { data: 'blob:https://evil.example/x' },         false],
    ['file:',                         { data: 'file:///etc/passwd' },                  false],
    ['data:text/html',                { data: 'data:text/html;base64,PHNjcmlwdD4=' },  false],
    ['data:image sin base64',         { data: 'data:image/svg+xml,<svg onload=1>' },   false],
    ['id con travesia de rutas',      { id: '../../../etc/passwd' },                   false],
    ['id con barra',                  { id: 'a/b' },                                   false],
    ['objeto vacio',                  {},                                              false],
    ['null',                          null,                                            false],
  ];
  return casos.map(([nom, im, esperado]) => ({
    nom, esperado, valida: window.__imgValida ? window.__imgValida(im) : null,
    src: window.__imgSrc ? window.__imgSrc(im) : null }));
});
/* imgValida/imgSrc viven dentro del IIFE. Se comprueban por su EFECTO: se siembra
   una operacion con cada imagen y se mira que pide el navegador. */
ok(F[0].valida === null, 'imgValida no esta expuesta al exterior (vive en el IIFE)',
   'se comprueba por su efecto, abajo');

const antes = pedidas.length;
await p.evaluate(async () => {
  FUT.createAccount({ id: 'SEG', firm: 'Seguridad', name: 'Filtro', kind: 'Evaluación',
    size: 25000, dd: 1000, ddKind: 'estatico', trailBase: 'intradia',
    target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  const hoy = new Date().toISOString().slice(0, 10);
  const MALAS = ['https://evil.example/track.png', 'http://evil.example/p.gif',
                 '//evil.example/x.gif', 'javascript:alert(1)', 'blob:https://evil.example/x',
                 'file:///etc/passwd', 'data:text/html;base64,PHNjcmlwdD4='];
  MALAS.forEach((u, i) => FUT.createTrade({ accountId: 'SEG', instrument: 'MNQ', date: hoy,
    time: '10:0' + i, entry: 21000, exit: 21010, qty: 1, direction: 'long', stop: 20990,
    images: [{ data: u, caption: 'baliza ' + i }] }));
  await new Promise(r => setTimeout(r, 1200));
});
await p.click('[data-tab="futuros"]').catch(() => {});
await p.waitForTimeout(1500);
const malas = pedidas.slice(antes).filter(u => /evil\.example|etc\/passwd/.test(u));
ok(malas.length === 0,
   'el navegador NO pide ninguna de las 7 urls de un respaldo malicioso',
   malas.length ? malas.join(' · ') : `${pedidas.length - antes} peticiones, ninguna al atacante`);

/* Y que las buenas SI se rendericen: un filtro que rechaza todo tambien pasaria
   la asercion de arriba, y seria inutil. */
const buenas = await p.evaluate(async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  FUT.createTrade({ accountId: 'SEG', instrument: 'MNQ', date: hoy, time: '11:00',
    entry: 21000, exit: 21010, qty: 1, direction: 'long', stop: 20990,
    images: [{ data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', caption: 'legitima' }] });
  await new Promise(r => setTimeout(r, 1200));
  const imgs = Array.prototype.slice.call(document.querySelectorAll('img.thumb, .pbimg img'));
  return { total: imgs.length,
    conData: imgs.filter(i => /^data:image\/png;base64,iVBOR/.test(i.getAttribute('src') || '')).length,
    rechazadas: imgs.filter(i => /svg%2Bxml|svg\+xml/.test(i.getAttribute('src') || '')).length };
});
ok(buenas.conData >= 1, 'una imagen legitima data:image/png SI se renderiza',
   `${buenas.conData} de ${buenas.total} imagenes`);
ok(buenas.rechazadas >= 1, 'y las rechazadas se dibujan con la marca visible, no desaparecen',
   `${buenas.rechazadas} marcadas`);

/* Sin cuenta, el pie promete «no se envía a ningún servidor». Se comprueba sobre
   TODO lo que el navegador pidió en esta corrida, que crea operaciones y cambia
   de pestaña: fuera del propio servidor y de las fuentes, nada. */
const fuera = pedidas.filter(u => { try { const h = new URL(u).host; return !/^127\.0\.0\.1(:\d+)?$/.test(h) && !/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(h) && !/^(data|blob):/.test(u); } catch { return false; } });
ok(fuera.length === 0, 'sin cuenta, el navegador no pide nada a ningún otro sitio (tampoco a la nube)',
   fuera.length ? fuera.slice(0, 3).join(' · ') : `${pedidas.length} peticiones, todas locales o de fuentes`);

ok(errs.length === 0, 'la pagina no lanzo ningun error', errs.length ? errs.join(' | ') : 'sin pageerror');
await b.close(); srv.close();

console.log('\n═══ PERMISOS DE GITHUB ACTIONS ═══');
const wf = n => readFileSync(join(raiz, '.github/workflows', n), 'utf8');
['pruebas.yml', 'pagina.yml'].forEach(n => {
  const t = wf(n);
  const m = t.match(/^permissions:\s*$/m);
  ok(!!m, `${n} declara permissions explicitamente`, m ? 'si' : 'NO — hereda el ajuste del repositorio');
  if (m) {
    const bloque = t.slice(t.indexOf('permissions:')).split(/\n(?=\S)/)[0];
    ok(/contents:\s*read/.test(bloque), `${n}: contents es read, no write`,
       bloque.replace(/\s+/g, ' ').trim().slice(0, 70));
  }
});

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
