/* LOS TOKENS EXISTEN DE VERDAD, Y LA JERARQUÍA DE TEXTO SE VE.
   ─────────────────────────────────────────────────────────────────────────────
   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, Y QUE YA OCURRIÓ:

   Al bloque `/* ── TEXTO · tres niveles ...` del sistema de tokens le faltaba el
   cierre. Los comentarios de CSS NO ANIDAN, así que ese comentario se cerraba en
   el cierre del comentario SIGUIENTE y se tragaba las tres declaraciones que
   había en medio:

       --text:  #E8ECF2;
       --muted: #A2AAB9;
       --dim:   #848EA1;

   Consecuencia, medida en Chromium con la semilla puesta y recorriendo las ocho
   pestañas: `getComputedStyle` devolvía CADENA VACÍA para los tres, así que cada
   `color: var(--text)` y cada `color: var(--muted)` SIN fallback quedaba en
   `unset`; `color` se hereda, y el texto acababa en BLANCO PURO.

       935 de 1333 elementos con texto propio en rgb(255,255,255)

   Es decir: la etiqueta, la nota al pie, la cabecera de tabla y el dato se
   pintaban al MISMO contraste. La «jerarquía tipográfica clara» que pide el
   rediseño no estaba roto en el diseño: no existía, por un cierre de comentario.
   `--bg`, `--surface`, `--line`, `--accent` y los radios sí resolvían, así que la
   página no parecía averiada — parecía plana.

   NO SE ARREGLA MIRANDO LA PÁGINA. El síntoma es «texto un poco más claro de lo
   previsto», que es justo lo que nadie reporta. Se arregla preguntando al
   navegador si el token existe, y eso es §2.

   QUÉ SE AFIRMA AQUÍ:

     §1  Ninguna declaración del CSS vive DENTRO de un comentario. Es la forma
         general del defecto, y atrapa también el error contrario —escribir el
         delimitador de cierre dentro de la prosa de un comentario, que lo cierra
         antes de tiempo y convierte el resto del párrafo en CSS inválido—. Se
         cometió al redactar el arreglo, y esta sección lo cazó.
     §2  Todo custom property declarado en `:root` RESUELVE a algo no vacío.
     §3  Ningún elemento con texto propio se pinta en blanco puro, en ninguna de
         las ocho pestañas, con datos. Blanco puro no está en la escala: si
         aparece, un token falló.
     §4  Los tres niveles cumplen, sobre `--surface-3`, los contrastes que el
         propio bloque de tokens afirma, y ninguno baja del suelo AA de 4.5:1.

   SABOTAJES CORRIDOS (15/10/2026), cada uno rojo por su propia aserción. Están
   al pie de este archivo, en el mismo orden en que se corrieron. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');

/* ── §1 · ninguna declaración dentro de un comentario ─────────────────────── */
console.log('\n═══ §1 · NINGUNA DECLARACIÓN VIVE DENTRO DE UN COMENTARIO ═══');
/* Se compara el conjunto de declaraciones `--x:` que hay en el TEXTO CRUDO de
   cada <style> con el que queda tras quitar los comentarios. Lo que desaparece
   es lo que el navegador no va a ver. Comparar conjuntos y no contar es lo que
   hace que el mensaje diga QUÉ token se perdió. */
const bloques = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const declara = txt => new Set([...txt.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
const perdidos = [];
bloques.forEach((b, i) => {
  const crudo = declara(b);
  const vivo = declara(b.replace(/\/\*[\s\S]*?\*\//g, ' '));
  for (const t of crudo) if (!vivo.has(t)) perdidos.push(`bloque ${i + 1}: ${t}`);
});
ok(perdidos.length === 0, 'ningún custom property queda sepultado en un comentario',
   perdidos.length ? perdidos.slice(0, 6).join(' · ') : `${bloques.length} bloques <style> revisados`);

/* ── el navegador, con datos y recorriendo las ocho pestañas ──────────────── */
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const TABS = ['cabina', 'futuros', 'edge', 'invest', 'playbook', 'ideas', 'estudio', 'calc'];

const b = await chromium.launch();
const pag = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await pag.goto(BASE);
await pag.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), SEMILLA);
await pag.reload();
await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

/* ── §2 · todo token declarado resuelve ──────────────────────────────────── */
console.log('\n═══ §2 · TODO TOKEN DECLARADO EN :root RESUELVE ═══');
/* La lista sale del FICHERO, no de una constante escrita aquí: si mañana se
   añade un token y se entierra en un comentario, esta sección lo pilla sin que
   nadie tenga que acordarse de apuntarlo.

   SÓLO los `:root` de primer nivel. Hay uno dentro de `@media (min-width:1800px)`
   que declara `--sobra`, y a 1500px de ancho ese bloque NO aplica: exigirle un
   valor sería pedirle que resuelva una regla que el navegador, correctamente, no
   está usando. Se midió: §2 se puso roja por `--sobra` antes de acotarlo, y era
   la prueba la que estaba mal, no la página. Así que se recorre el texto llevando
   la PROFUNDIDAD DE LLAVES y se toman los `:root` que están a nivel 0. */
const aNivelCero = (txt) => {
  const limpio = txt.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const fuera = [];
  let prof = 0;
  for (let i = 0; i < limpio.length; i++) {
    if (limpio[i] === '{') {
      /* ¿Es la llave de un `:root` que empieza a nivel 0? */
      if (prof === 0 && /:root\s*$/.test(limpio.slice(Math.max(0, i - 40), i))) {
        let d = 1, j = i + 1;
        while (j < limpio.length && d > 0) { if (limpio[j] === '{') d++; else if (limpio[j] === '}') d--; j++; }
        fuera.push(limpio.slice(i + 1, j - 1));
      }
      prof++;
    } else if (limpio[i] === '}') prof--;
  }
  return fuera;
};
const enRaiz = [...new Set(bloques.flatMap(aNivelCero).join('\n')
  .matchAll(/(--[a-zA-Z0-9-]+)\s*:/g))].map(m => m[1]);
const vacios = await pag.evaluate(ns => {
  const cs = getComputedStyle(document.documentElement);
  return ns.filter(n => cs.getPropertyValue(n).trim() === '');
}, enRaiz);
ok(vacios.length === 0, `los ${enRaiz.length} tokens de :root resuelven a un valor`,
   vacios.length ? `VACÍOS: ${vacios.join(', ')}` : 'ninguno vacío');

/* ── §3 · nada en blanco puro ────────────────────────────────────────────── */
console.log('\n═══ §3 · NINGÚN TEXTO EN BLANCO PURO EN LAS OCHO PESTAÑAS ═══');
let medidos = 0;
const blancos = [];
for (const t of TABS) {
  await pag.click(`[data-tab="${t}"]`);
  /* Al DATO, no al reloj: la pestaña está activa cuando su panel lo está. */
  await pag.waitForFunction(x => {
    const el = document.querySelector(`.tab[data-tab="${x}"]`);
    return el && el.classList.contains('active');
  }, t, { timeout: 10000 });
  const r = await pag.evaluate(() => {
    const out = { n: 0, blancos: [] };
    for (const el of document.querySelectorAll('.tab.active *')) {
      if (!el.offsetParent) continue;
      const q = el.getBoundingClientRect();
      if (!q.width || !q.height) continue;
      /* Sólo quien lleva texto PROPIO: si no, se contaría mil veces el color
         heredado de un contenedor que no pinta una sola letra. */
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      out.n++;
      if (getComputedStyle(el).color === 'rgb(255, 255, 255)')
        out.blancos.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''}`);
    }
    return out;
  });
  medidos += r.n;
  blancos.push(...r.blancos.map(x => `${t}·${x}`));
}
ok(blancos.length === 0, `ninguno de los ${medidos} elementos con texto propio se pinta en blanco puro`,
   blancos.length ? `${blancos.length} en blanco, p.ej. ${[...new Set(blancos)].slice(0, 4).join(', ')}`
                  : 'cero — los tres niveles del sistema están en pie');

/* ── §4 · los contrastes que el propio bloque afirma ─────────────────────── */
console.log('\n═══ §4 · LOS TRES NIVELES CUMPLEN SU CONTRASTE SOBRE --surface-3 ═══');
const tok = await pag.evaluate(() => {
  const r = getComputedStyle(document.documentElement);
  const g = n => r.getPropertyValue(n).trim();
  return { text: g('--text'), muted: g('--muted'), dim: g('--dim'), s3: g('--surface-3') };
});
await b.close(); srv.close();

/* Un token vacío NO puede tumbar este archivo con un TypeError: eso saldría
   rojo, sí, pero por «no se pudo ejecutar» y no por «el contraste no se cumple»,
   y el log no diría qué pasa. Se midió: con el comentario reabierto, `lum('')`
   petaba en `.match(...)` y el proceso moría ANTES de imprimir `fallos:`.
   Protocolo 11: una aserción tiene que poder fallar por el motivo correcto. */
const HEX = /^#[0-9a-f]{6}$/i;
const lum = hex => hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255)
  .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  .reduce((a, c, i) => a + [.2126, .7152, .0722][i] * c, 0);
const ratio = (a, z) => {
  if (!HEX.test(a) || !HEX.test(z)) return null;
  const [x, y] = [lum(a), lum(z)].sort((m, n) => n - m);
  return (x + .05) / (y + .05);
};

/* Las cifras no se inventan aquí: son las que el bloque de tokens de index.html
   escribe al lado de cada nivel. Si alguien cambia un color y no la cifra, o la
   cifra y no el color, esta sección los enfrenta. */
const AA = 4.5;
for (const [nombre, valor, afirmado] of [['text', tok.text, 12.82], ['muted', tok.muted, 6.50], ['dim', tok.dim, 4.61]]) {
  const r = ratio(valor, tok.s3);
  ok(r !== null && Math.abs(r - afirmado) < 0.05 && r >= AA,
     `${nombre.padEnd(5)} cumple lo que index.html afirma y no baja de AA`,
     r === null
       ? `--${nombre} vale «${valor}» y --surface-3 «${tok.s3}»: sin un color no hay contraste que medir`
       : `${valor} sobre ${tok.s3}: ${r.toFixed(2)}:1 (afirmado ${afirmado}:1, suelo ${AA}:1)`);
}

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);

/* SABOTAJES, en el orden en que se corrieron (15/10/2026). Los tres salieron
   exit 1 imprimiendo su línea `fallos:`, no por un error de ejecución, y al
   restaurar el fichero la prueba volvió a verde con un diff vacío.

   1 · quitar otra vez el cierre del comentario de TEXTO  →  fallos: 5
         §1 ❌ bloque 4: --text · bloque 4: --muted · bloque 4: --dim
         §3 ❌ 935 en blanco, p.ej. cabina·h2, cabina·span.meta, cabina·p, cabina·h1
         §4 ❌ los tres: «sin un color no hay contraste que medir»
       §2 NO se pone roja aquí, y conviene saber por qué: su lista de tokens sale
       del fichero YA SIN COMENTARIOS, así que un token sepultado no llega ni a
       la lista y no hay nada que comprobar. Esa variante la cubre §1. Dos
       secciones que parecían solaparse resultan ser las dos necesarias.

   2 · escribir el delimitador de cierre DENTRO de la prosa del comentario
       —el error que se cometió de verdad al redactar el arreglo, y que cerraba
       el comentario antes de tiempo dejando sólo `--text` fuera—  →  fallos: 3
         §2 ❌ VACÍOS: --text
         §3 ❌ 389 en blanco, p.ej. cabina·h2, cabina·h1, cabina·span.name, cabina·div.v
         §4 ❌ text: «sin un color no hay contraste que medir»

   3 · bajar --dim a #5B6577, el valor que tenía antes de subirlo a AA  →  fallos: 1
         §4 ❌ dim   #5B6577 sobre #1F2632: 2.59:1 (afirmado 4.61:1, suelo 4.5:1)
       Las otras tres secciones siguen verdes: el token existe y no es blanco.
       Es la única que mira si el color, además de existir, SE LEE. */
