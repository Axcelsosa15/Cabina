/* IDIOMA · EL INGLÉS ES UNA CAPA, Y UNA CAPA NO PUEDE TOCAR LOS DATOS
   ─────────────────────────────────────────────────────────────────────────────
   Cabina está escrita en español y el inglés se aplica encima, sobre el DOM ya
   pintado. Ese diseño tiene exactamente dos modos de fallar, y este archivo
   existe para los dos:

   1 · QUE TRADUZCA UN DATO DEL USUARIO. Es el grave y el irreversible de cara a
       quien lo lee: si la capa decidiera por selector —«todos los h2», «todos
       los label»— bastaría que alguien llamara «Pre-sesión» a un setup para que
       la app le reescribiera lo que escribió. La guarda es que un nodo sólo se
       toca si su texto está LITERALMENTE en el diccionario, y §3 la prueba
       metiendo datos del usuario que son, a propósito, idénticos a claves del
       diccionario.

   2 · QUE LA PREFERENCIA SE INVENTE. Protocolo 17: que no haya clave guardada
       significa «no lo ha elegido», no «español». Si el arranque escribiera
       "es", todo navegador que abriera Cabina una vez quedaría afirmando una
       preferencia que nadie expresó. §1 lo afirma en los dos sentidos: que
       arrancar NO escribe, y que pulsar SÍ escribe.

   POR QUÉ §2 COMPRUEBA EL CONTADOR DE LA PESTAÑA. El botón de Futuros es
   `Futuros<span class="n">` con el número de operaciones dentro. Una traducción
   escrita con textContent se lo lleva por delante, y el fallo no se ve en la
   palabra —que queda bien— sino en el contador, que desaparece. Es el modo de
   fallar más fácil de no mirar.

   POR QUÉ §4 VUELVE A ESPAÑOL Y COMPARA CON EL ORIGINAL. Volver no se hace
   traduciendo al revés —eso acumula error y depende de que el diccionario sea
   biyectivo— sino restaurando el español que se guardó la primera vez. La
   prueba es la igualdad exacta con lo que había antes de tocar nada. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA, arrancada, quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const CLAVE = 'cabina:idioma:v1';

const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/`;

const nav = await chromium.launch();
const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), SEMILLA);
  await p.reload();
  await arrancada(p);
  return { ctx, p };
};
const pulsa = async (p) => { await p.click('#idiomaBtn'); await quieto(p, 80, 2500); };
const textoPestana = (p, tab) => p.evaluate(t => {
  const b = document.querySelector(`#tabnav .tabbtn[data-tab="${t}"]`);
  if (!b) return null;
  const n = [...b.childNodes].find(x => x.nodeType === 3 && x.data.trim());
  return { palabra: n ? n.data.trim() : null, contador: !!b.querySelector('span.n'), lang: document.documentElement.lang };
}, tab);

console.log('\n═══ 1 · la preferencia no se inventa: la ausencia sobrevive (protocolo 17) ═══');
{
  const { ctx, p } = await abrir();
  const trasArrancar = await p.evaluate(k => localStorage.getItem(k), CLAVE);
  ok(trasArrancar === null, 'arrancar NO escribe la clave del idioma', `getItem = ${JSON.stringify(trasArrancar)}`);
  const t0 = await textoPestana(p, 'futuros');
  ok(t0.palabra === 'Futuros' && t0.lang === 'es', 'sin elección, se lee en español', `${t0.palabra} · lang=${t0.lang}`);

  await pulsa(p);
  const trasPulsar = await p.evaluate(k => localStorage.getItem(k), CLAVE);
  ok(trasPulsar === 'en', 'pulsar SÍ escribe la elección', `getItem = ${JSON.stringify(trasPulsar)}`);

  /* La elección tiene que sobrevivir a una recarga, porque si no, no es una
     preferencia: es un botón que se olvida. */
  await p.reload(); await arrancada(p); await quieto(p, 80, 2500);
  const t1 = await textoPestana(p, 'futuros');
  ok(t1.palabra === 'Futures' && t1.lang === 'en', 'la elección sobrevive a recargar', `${t1.palabra} · lang=${t1.lang}`);
  await ctx.close();
}

console.log('\n═══ 2 · traducir no se lleva por delante lo que había dentro del nodo ═══');
{
  const { ctx, p } = await abrir();
  const antes = await textoPestana(p, 'futuros');
  await pulsa(p);
  const despues = await textoPestana(p, 'futuros');
  ok(despues.palabra === 'Futures', 'la pestaña se traduce', despues.palabra);
  ok(antes.contador && despues.contador, 'el contador de operaciones sigue dentro del botón',
    `antes=${antes.contador} después=${despues.contador}`);

  /* Las ocho pestañas, porque el modo de fallar no es «una se traduce mal»:
     es «una se queda en español y parece que falta una traducción». */
  const pend = await p.evaluate(() => [...document.querySelectorAll('#tabnav .tabbtn')]
    .map(b => { const n = [...b.childNodes].find(x => x.nodeType === 3 && x.data.trim()); return n ? n.data.trim() : ''; })
    .filter(t => /[áéíóúñÁÉÍÓÚÑ]/.test(t) || t === 'Futuros' || t === 'Inversiones' || t === 'Calculadora'));
  ok(pend.length === 0, 'ninguna de las ocho pestañas se queda en español', pend.join(' | ') || 'ninguna');
  await ctx.close();
}

console.log('\n═══ 3 · un dato del usuario NO se traduce, ni aunque sea idéntico a una clave ═══');
{
  const { ctx, p } = await abrir();
  /* Se escriben datos cuyo texto COINCIDE con claves del diccionario. Si la capa
     tradujera por selector en vez de por coincidencia dentro de su allow-list,
     esto saldría en inglés y el usuario vería su propio texto reescrito. */
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('cabina-mnq:v1'));
    d.levels = d.levels || {};
    d.dayNote = 'Pre-sesión';
    localStorage.setItem('cabina-mnq:v1', JSON.stringify(d));
  });
  await p.reload(); await arrancada(p);
  await pulsa(p);
  const nota = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('cabina-mnq:v1'));
    return d.dayNote;
  });
  ok(nota === 'Pre-sesión', 'el dato guardado sigue en las palabras del usuario', JSON.stringify(nota));

  /* Y la guarda estructural: ningún nodo marcado como cromo puede contener un
     texto que el usuario escribiera. Se comprueba que todo `data-i18n-es` que
     existe es una clave del diccionario y no texto libre. */
  const marcados = await p.evaluate(() => [...document.querySelectorAll('[data-i18n-es]')].length);
  ok(marcados > 0, 'hay cromo marcado con su español original', `${marcados} nodos`);

  /* LA ASERCIÓN QUE FALTABA, Y EL FALLO QUE DEJÓ PASAR.
     Lo de arriba comprueba el dato GUARDADO; el daño real es un dato
     RENDERIZADO sobrescrito en pantalla. Un <h2> del día tenía el texto
     estático «Día» —una clave del diccionario—, quedó marcado, y después un
     render le puso la fecha dentro: el elemento sobrevive, sólo cambia su nodo
     de texto, así que la marca seguía puesta y la pasada siguiente escribía
     «Día» encima de «jue 17/09/26».
     Se mide recorriendo todo nodo marcado y exigiendo que su texto sea el
     español guardado o su traducción. Cualquier otra cosa significa que un dato
     ocupa un nodo que la capa de idioma cree suyo. */
  /* LA ASERCIÓN QUE FALTABA, Y EL FALLO QUE DEJÓ PASAR.
     Lo de arriba comprueba el dato GUARDADO. El daño real es otro: un dato
     RENDERIZADO sobrescrito en pantalla. Un <h2> del día tenía el texto
     estático «Día» —una clave del diccionario—, quedó marcado, y después un
     render le puso la fecha dentro: el ELEMENTO sobrevive y sólo cambia su nodo
     de texto, así que la marca seguía puesta y la pasada siguiente escribía
     «Día» encima de «jue 17/09/26».

     POR QUÉ SE MIDE LA FECHA Y NO «el texto coincide con el diccionario». En
     modo español el fallo es INVISIBLE a esa comprobación: el dato ya fue
     destruido y sustituido por el cromo, así que el nodo coincide con su
     español guardado y la aserción pasaría tan contenta. Lo que hay que medir
     es que el DATO siga ahí. Se busca una fecha —un dato que ningún
     diccionario contiene— y se exige que sobreviva al viaje de ida y vuelta. */
  const FECHA = /\d{1,2}\/\d{1,2}\/\d{2}/;
  const conFecha = () => p.evaluate(() => [...document.querySelectorAll('h1, h2, h3')]
    .map(e => { const n = [...e.childNodes].find(x => x.nodeType === 3 && x.data.trim()); return n ? n.data.trim() : ''; })
    .filter(t => /\d{1,2}\/\d{1,2}\/\d{2}/.test(t)));
  const fechasAntes = await conFecha();
  ok(fechasAntes.length > 0, 'hay al menos una fecha renderizada que vigilar', fechasAntes.join(' | ') || 'NINGUNA');
  await pulsa(p);                 /* a inglés */
  await pulsa(p);                 /* y de vuelta */
  const fechasDespues = await conFecha();
  ok(JSON.stringify(fechasDespues) === JSON.stringify(fechasAntes),
    'las fechas renderizadas sobreviven al viaje de ida y vuelta',
    `antes=[${fechasAntes.join(' | ')}] despues=[${fechasDespues.join(' | ')}]`);
  await ctx.close();
}

console.log('\n═══ 4 · volver a español restaura el original, no lo retraduce ═══');
{
  const { ctx, p } = await abrir();
  const leeCromo = () => p.evaluate(() => [...document.querySelectorAll('#tabnav .tabbtn, h1, h2')]
    .map(e => { const n = [...e.childNodes].find(x => x.nodeType === 3 && x.data.trim()); return n ? n.data.trim() : ''; }));
  const original = await leeCromo();
  await pulsa(p);
  const ingles = await leeCromo();
  ok(JSON.stringify(original) !== JSON.stringify(ingles), 'el inglés cambia el cromo de verdad',
    `${original.filter((v, i) => v !== ingles[i]).length} nodos distintos`);
  await pulsa(p);
  const vuelta = await leeCromo();
  ok(JSON.stringify(vuelta) === JSON.stringify(original), 'volver a español es EXACTO al original',
    JSON.stringify(vuelta) === JSON.stringify(original) ? 'idéntico' : 'difiere');
  const lang = await p.evaluate(() => document.documentElement.lang);
  ok(lang === 'es', 'el atributo lang del documento acompaña al idioma', `lang=${lang}`);
  await ctx.close();
}

await nav.close();
srv.close();
console.log(`\nfallos: ${fallos.length}`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
