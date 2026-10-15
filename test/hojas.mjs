/* LAS HOJAS DE ESTILO QUE LA PÁGINA PIDE, Y LA CSP QUE LAS PERMITE O NO.
   ─────────────────────────────────────────────────────────────────────────────
   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, Y QUE YA OCURRIÓ:

   `pagina.yml` inyectaba en el HTML publicado una línea que no está en el
   repositorio:

       <link rel="stylesheet" href="./cabina-refinement.css?v=HASH">

   La CSP de la página declara `style-src 'unsafe-inline' https://fonts.googleapis.com`.
   Sin `'self'`, el navegador RECHAZA cualquier hoja del propio origen. Las 441
   líneas de ese fichero no pintaban nada en producción, y nadie se enteró por
   dos razones que se refuerzan:

     1. La verificación del despliegue hacía `curl` a la URL del CSS y escribía
        «✅ cabina-refinement.css responde». curl NO aplica CSP: medía que el
        fichero se sirve, no que el navegador lo use. Un verde sobre la pregunta
        equivocada.
     2. La inyección ocurría SÓLO en el workflow. `humo.mjs` sirve index.html y
        .nojekyll, así que la suite probaba un payload DISTINTO del publicado.
        «Lo publicado es lo probado» —la frase que sostiene la compuerta— dejaba
        de ser cierta exactamente en el fichero que ninguna prueba miraba.

   QUÉ SE AFIRMA AQUÍ, en las dos direcciones:

     §1  Toda hoja que index.html pide por <link> la permite su propia CSP.
     §2  Cargada por HTTP como en Pages, el navegador no rechaza ninguna hoja.
     §3  CONTROL POSITIVO: se inyecta a propósito un <link> del propio origen y
         se EXIGE que el navegador lo rechace. Esto es lo que impide que este
         archivo se vuelva un verde vacío: si alguien añadiera `'self'` a
         style-src, el control deja de dispararse y §3 lo dice en rojo en vez de
         callarse. La prueba mide el comportamiento real de la CSP, no una
         suposición escrita aquí.
     §4  El workflow de Pages publica index.html SIN reescribirlo: ninguna etapa
         vuelve a escribir `sitio/index.html`. Es la regresión original.

   SABOTAJES CORRIDOS AL ESCRIBIRLO (15/10/2026). Los cuatro se pusieron rojos
   por su propia aserción, no por un error de ejecución, y al restaurar los
   ficheros la prueba volvió a verde con un diff vacío:

     · reponer en index.html el <link> a una hoja del propio origen
       → §1 roja («./cabina-refinement.css?v=deadbeef → RECHAZADA») y §2 roja
         («Refused to load the stylesheet ... style-src»). fallos: 2.
     · añadir `'self'` a style-src
       → §3 roja: «NO la rechazó: style-src es ... y §1/§2 ya no prueban nada».
         Es el sabotaje que importa: deja §1 y §2 en verde y aun así la suite se
         pone roja, porque lo que habrían dejado de medir es el punto entero.
     · reponer la inyección python en pagina.yml
       → §4 roja por las dos aserciones: «reescritura: page = Path("sitio/index.html")»
         y «vuelve a aparecer cabina-refinement.css en el YAML». fallos: 2.
     · reescribir el HTML publicado con `sed -i` en vez de python —un reescritor
       que no estaba previsto al escribir la prueba—
       → §4 roja igual: se clasifica por FORMA de la línea, no por herramienta. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');

/* ── La CSP declarada, tal cual, y su style-src ─────────────────────────────── */
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const directiva = (csp.split(';').map(s => s.trim()).find(s => /^style-src(-elem)?\s/.test(s)) || '').trim();
const fuentes = directiva.split(/\s+/).slice(1);

console.log('\n═══ §1 · LAS HOJAS QUE PIDE EL HTML CONTRA SU PROPIA CSP ═══');
ok(!!csp, 'la página declara una CSP', csp ? `${csp.length} caracteres` : 'no hay <meta> de CSP');
ok(!!directiva, 'la CSP declara style-src', directiva || 'NO — style-src cae en default-src');

/* Los <link rel=stylesheet> del documento. `rel` puede ir antes o después de
   `href`, así que se busca la etiqueta completa y luego se leen los atributos:
   una regex con el orden fijo daría un verde por no encontrar nada. */
const enlaces = (html.match(/<link\b[^>]*>/gi) || [])
  .filter(t => /rel\s*=\s*["']?stylesheet/i.test(t))
  .map(t => (t.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1])
  .filter(Boolean);

const permitida = url => {
  /* Del propio origen (relativa o absoluta al sitio) sólo si hay 'self'. */
  const esPropia = !/^https?:\/\//i.test(url) || url.startsWith('https://axcelsosa15.github.io/');
  if (esPropia) return fuentes.includes("'self'");
  try {
    const o = new URL(url).origin;
    return fuentes.some(f => f === o || f === `${o}/` || (f.startsWith(o) && !f.includes('*')));
  } catch { return false; }
};

ok(enlaces.every(permitida),
   'toda hoja pedida por <link> la permite la CSP de la página',
   enlaces.length ? enlaces.map(u => `${u} → ${permitida(u) ? 'permitida' : 'RECHAZADA'}`).join(' | ')
                  : 'ningún <link rel=stylesheet>: la página es autosuficiente');

/* ── §2 y §3 · lo que dice el navegador, no lo que decimos nosotros ────────── */
const sirve = async (cuerpo) => {
  const srv = createServer((q, r) => {
    const f = decodeURIComponent(q.url.split('?')[0]);
    if (f === '/' || f === '/index.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(cuerpo); }
    try {
      const b = readFileSync(join(raiz, f.replace(/^\//, '')));
      const ext = f.slice(f.lastIndexOf('.'));
      r.writeHead(200, { 'content-type': ext === '.css' ? 'text/css; charset=utf-8' : ext === '.png' ? 'image/png' : 'application/octet-stream' });
      r.end(b);
    } catch { r.writeHead(404); r.end('no'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
};

/* Una violación de CSP sobre una HOJA, no sobre cualquier cosa: el mensaje de
   Chromium nombra la directiva, así que se filtra por style-src para no contar
   un rechazo de otro tipo como si fuera de estilos. */
const esDeHoja = t => /Refused to (?:load|apply) the stylesheet/i.test(t)
                   || (/Content Security Policy/i.test(t) && /style-src/i.test(t));

const mide = async (cuerpo) => {
  const { srv, base } = await sirve(cuerpo);
  const nav = await chromium.launch();
  const pag = await (await nav.newContext()).newPage();
  const viol = [];
  const rechazos = [];
  pag.on('console', m => { if (esDeHoja(m.text())) viol.push(m.text().replace(/\s+/g, ' ').trim().slice(0, 150)); });
  pag.on('requestfailed', r => {
    if (r.resourceType() === 'stylesheet' && /csp/i.test(r.failure()?.errorText || '')) rechazos.push(r.url());
  });
  await pag.goto(base, { waitUntil: 'load' });
  /* No una espera fija: la señal de la propia app. Cuando `window.FUT` existe,
     el <script> inline ya corrió, y por tanto el documento entero —cabecera
     incluida— se parseó: los rechazos de hoja por CSP se emiten al parsear, así
     que a partir de aquí ya están contados. Protocolo 4: nada de esperas fijas. */
  await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await nav.close(); srv.close();
  return { viol, rechazos };
};

console.log('\n═══ §2 · SERVIDA POR HTTP, COMO PAGES: NINGUNA HOJA RECHAZADA ═══');
const real = await mide(html);
ok(real.viol.length === 0 && real.rechazos.length === 0,
   'el navegador no rechaza ninguna hoja de la página publicada',
   real.viol.length || real.rechazos.length
     ? [...real.viol, ...real.rechazos].join(' | ')
     : 'cero violaciones de style-src, cero stylesheets con errorText csp');

console.log('\n═══ §3 · CONTROL POSITIVO · la CSP sigue rechazando el propio origen ═══');
/* Si esto NO se dispara, §1 y §2 no demuestran nada: estarían midiendo una CSP
   que ya permite lo que creemos que prohíbe. */
const cebo = html.replace('</head>', '  <link rel="stylesheet" href="./cebo-hojas.css">\n</head>');
const control = await mide(cebo);
ok(control.viol.length > 0 || control.rechazos.length > 0,
   'inyectar una hoja del propio origen la rechaza el navegador',
   control.viol.length || control.rechazos.length
     ? [...control.viol, ...control.rechazos][0]
     : `NO la rechazó: style-src es «${directiva}» y §1/§2 ya no prueban nada`);

/* ── §4 · el payload publicado es el probado ───────────────────────────────── */
console.log('\n═══ §4 · PAGES PUBLICA index.html SIN REESCRIBIRLO ═══');
const wf = readFileSync(join(raiz, '.github/workflows/pagina.yml'), 'utf8');
/* Se mira el YAML sin sus comentarios: el motivo de esta prueba está escrito
   ahí arriba en prosa y nombra el fichero, así que contar sobre el texto crudo
   daría un rojo por leer la explicación. Es el protocolo 14 del repositorio. */
const yaml = wf.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
/* Cada línea que nombra el HTML publicado tiene que ser una de DOS formas: la
   copia literal, o una lectura para comparar hashes. Cualquier otra —un
   write_text de python, un sed -i, una redirección— es una reescritura, y es
   exactamente lo que rompió «lo publicado es lo probado». Se clasifica por
   forma en vez de buscar herramientas una por una: así un reescritor que nadie
   previó (awk, tee, perl) tampoco pasa. */
const COPIA = /^cp index\.html sitio\/index\.html$/;
const LECTURA = /^esperado="\$\(sha256sum sitio\/index\.html \| cut -d' ' -f1\)"$/;
const tocan = yaml.split('\n').map(l => l.trim()).filter(l => l.includes('sitio/index.html'));
const sospechosas = tocan.filter(l => !COPIA.test(l) && !LECTURA.test(l));
ok(sospechosas.length === 0 && tocan.some(l => COPIA.test(l)),
   'ninguna etapa del workflow reescribe sitio/index.html',
   sospechosas.length ? `reescritura: ${sospechosas.join(' · ').slice(0, 160)}`
     : tocan.some(l => COPIA.test(l))
       ? `${tocan.length} líneas lo nombran: la copia literal y la lectura del hash`
       : 'no se encontró la copia `cp index.html sitio/index.html`');
ok(!/cabina-refinement\.css/.test(yaml), 'el workflow no publica ni enlaza hojas externas',
   /cabina-refinement\.css/.test(yaml) ? 'vuelve a aparecer cabina-refinement.css en el YAML' : 'ninguna referencia activa');

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
