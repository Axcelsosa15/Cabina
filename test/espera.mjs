/* ESPERAR A LA CONDICIÓN, NO AL RELOJ.

   La suite dormía 227 segundos escritos a mano en `waitForTimeout`, y esa
   cuenta se queda corta porque no ve los que están dentro de bucles. Perfilado
   sobre `vivo.mjs`: una pasada de `foto()` gastaba 11.840 ms de espera fija
   para hacer 40 ms de trabajo real. Ratio 296:1.

   El motivo es que la espera estaba mal calibrada por construcción: Cabina
   pinta con un coalescer de microtasks (fanout → Promise.resolve().then()), o
   sea que termina de pintar ANTES de que Playwright complete el viaje de
   vuelta del clic. Medido con un MutationObserver, las 23 esperas de una foto
   daban el suelo del observador y nunca más: el DOM ya estaba quieto antes de
   empezar a mirarlo. Los 500 ms no esperaban a nada.

   Un número fijo tiene además el problema de que falla en los dos sentidos: de
   más cuesta minutos, y de menos produce un test intermitente, que es peor que
   no tener test. Esperar a la condición no tiene ese dilema. */

/* Resuelve en cuanto el DOM lleva `calma` ms sin mutar. El tope duro existe
   para que un render que no llegue nunca falle como test lento y no como test
   colgado. */
import { readFileSync } from 'node:fs';

/* La semilla compartida. Se resuelve contra la ubicacion de ESTE archivo, no
   contra process.cwd() ni contra /tmp: tres pruebas la leian de
   /tmp/semilla.json, un archivo que existia en el contenedor donde se
   escribieron y que ningun test crea. Pasaban aqui y morian en CI con ENOENT.
   Es el mismo fallo que los imports por ruta absoluta, con otra cara. */
export const SEMILLA = readFileSync(new URL('./semilla.json', import.meta.url), 'utf8');

/* LAS CUENTAS YA NO VIENEN DE SERIE. Hasta el arranque neutral, una pagina vacia
   traia tres cuentas y unas reglas con numeros: las del autor. Diez pruebas abrian
   la cabina en blanco y daban eso por hecho. Al quitarlas del codigo se quedaron
   sin cuentas -- y en local seguian verdes porque preview.html era una copia vieja
   que aun las llevaba. CI construye el preview de cero y las vio caer.

   Ahora una prueba que necesita cuentas LAS DECLARA, igual que equivalencia declara
   su protocolo. Se siembra solo la CONFIGURACION de la semilla, nunca sus
   operaciones, y solo si lo guardado no trae ya una: asi una prueba que siembra sus
   propias operaciones sin configuracion (migra) recibe las cuentas encima, y una
   recarga no pisa lo que la propia prueba cambio. Registrar DESPUES de la siembra
   propia de la prueba: los init scripts corren en orden. */
export const CONFIG_PRUEBA = JSON.parse(SEMILLA).settings;
export const conCuentas = (pg) => pg.addInitScript(cfg => {
  try {
    const K = 'cabina-mnq:v1';
    const d = JSON.parse(localStorage.getItem(K) || '{}');
    if (d.settings) return;
    d.settings = cfg;
    if (!d.trades) d.trades = {};
    localStorage.setItem(K, JSON.stringify(d));
  } catch (e) { }
}, CONFIG_PRUEBA);

export const quieto = (pg, calma = 30, tope = 1500) => pg.evaluate(([c, t]) => new Promise(res => {
  let timer = setTimeout(fin, c);
  const ob = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(fin, c); });
  ob.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  const duro = setTimeout(fin, t);
  function fin() { clearTimeout(timer); clearTimeout(duro); ob.disconnect(); res(); }
}), [calma, tope]);

/* El arranque es el único caso que NO se resuelve con quiescencia a secas: la
   app carga en fases (localStorage, normalize, renders) y entre dos fases cabe
   un hueco mayor que la calma, así que el observador se rendiría a mitad. Se
   espera a que EXISTA lo que el test va a usar, y sólo después a que se calme. */
export const arrancada = async (pg, sel = '.acct') => {
  /* Primero el motor: `window.FUT` se asigna durante el arranque, así que su
     existencia es la señal de que la app corrió, no de que el HTML llegó.

     Esto importa: pasarle un selector del HTML ESTÁTICO —`.tabbtn`, por
     ejemplo— hace que `waitForSelector` resuelva al instante, porque ese
     elemento está en el documento antes de que se ejecute una sola línea de la
     app. Me pasó escribiendo el test del borrado en masa: la barra de deshacer
     aún no se había pintado y el test la dio por perdida. El selector tiene que
     ser algo que RENDERICE la app. */
  /* `polling: 100` y no el rAF por defecto: requestAnimationFrame se estrangula
     cuando la página no está pintando, y con varios Chromium en paralelo eso
     pasa. Cambiar un sleep fijo por una condición sondeada con rAF es cambiar
     una fragilidad por otra — me pasó, y falló 2 de cada 6 veces. */
  await pg.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 15000, polling: 100 });
  if (sel) await pg.waitForSelector(sel, { timeout: 15000 }).catch(() => {});
  await quieto(pg, 120, 4000);
};

/* ⚠ DÓNDE NO SIRVE LA QUIESCENCIA, Y POR QUÉ
   La app tiene caminos que difieren trabajo con setTimeout. Si la calma es más
   corta que ese diferido, el observador ve el DOM quieto, devuelve, y el
   repintado llega DESPUÉS: test intermitente, que es peor que no tener test.

   Los diferidos que hay hoy en index.html:
       40 ms   bkConfirmImport tras leer un archivo o pegar JSON
       60 ms   openTrade al pulsar «Ver operación» desde una tesis
      100 ms   openPlaybook al crear una versión nueva
     1200 ms   location.reload() tras restaurar un respaldo
     1200 ms   migrarSiHaceFalta al arrancar

   De ahí las dos calmas: `quieto` (30 ms) vale para cambiar de vista, que es
   repintado síncrono vía fanout; `trasAccion` (150 ms) cubre los diferidos de
   40/60/100. Para los dos de 1200 ms NO se usa quiescencia: se espera a la
   navegación o al selector que sólo existe después.

   Antes de meter `quieto` en un sitio nuevo: mira si ese camino difiere algo. */
export const trasAccion = (pg) => quieto(pg, 150, 3000);

/* ── sembrar datos sin que una recarga los borre ──────────────────────────
   El patrón obvio —`addInitScript` que escribe localStorage sólo «si está
   vacío»— NO es fiable sobre `file://`:

       addInitScript(`if(!localStorage.getItem(K)) localStorage.setItem(K, …)`)

   `addInitScript` corre en CADA navegación, incluidas las recargas, y en
   `document_start` la zona de almacenamiento de un `file://` a veces todavía no
   está enlazada: `getItem` devuelve null aunque el dato esté escrito. Entonces
   la semilla se reescribe y borra lo que el test acababa de guardar.

   Medido en `tesis.mjs`: fallaba 2 de cada 10 corridas con las cuentas, las
   operaciones y las tesis a cero, y el marcador confirmó que la semilla había
   vuelto a escribir. Perseguí antes el sondeo de `waitForFunction` y el modo
   demo; ninguno era la causa.

   La solución no es adivinar mejor: es sembrar en un documento YA cargado, donde
   localStorage responde de verdad, y recargar una vez para que la app lo lea. */
export const siembra = async (pg, url, datos) => {
  const txt = JSON.stringify(datos);
  await pg.goto(url);
  await pg.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), txt);
  await pg.reload();
  /* Sobre file:// Chromium tira el area de almacenamiento al recargar de forma
     INTERMITENTE. Esta documentado en sync.mjs, que por eso abre una pestaña
     nueva en vez de recargar, y es lo que hizo fallar borrar.mjs en CI y no aqui:
     la recarga se llevo la papelera, la barra de «Deshacer» no se pinto, y el
     test acuso a la app de un defecto del navegador. 33 s en el runner contra
     18 s en local; el mismo codigo, otra suerte.

     Este ayudante recarga por dentro, asi que el peligro estaba dentro de lo que
     el protocolo recomienda usar. Si el almacen desaparecio, se vuelve a escribir
     y se recarga otra vez: cuando funciona no cambia nada, y cuando no, deja de
     ser suerte. */
  const vivo = async () => pg.evaluate(() => { try { return !!localStorage.getItem('cabina-mnq:v1'); } catch (e) { return false; } });
  if (!(await vivo())) {
    await pg.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), txt);
    await pg.reload();
  }
};

/* ── esperar al DATO, no al pintado ────────────────────────────────────────
   La quiescencia mira el DOM. Hay cosas que no son DOM.

   `persistDay()` escribe el día a localStorage con `debounce("day", fn, 400)`:
   400 ms después del último cambio. Un `waitForTimeout(900)` lo cubría de
   sobra; una quiescencia de 40 ms recarga la página ANTES de que se escriba, y
   el test pierde lo guardado sin un solo error — sale «sin filas» y
   localStorage devuelve null.

   Me pasó convirtiendo `sesiones.mjs`, y la lista de diferidos de arriba no lo
   avisaba: la escribí buscando `setTimeout(…, N)` literales, y este pasa el 400
   como argumento de `debounce`. La lista estaba incompleta.

   Antes de recargar o de leer el disco, se espera a que el disco tenga lo que
   se busca. `prueba` recibe el objeto ya parseado; si no hay nada guardado
   todavía, recibe null. */
export const enDisco = (pg, prueba, tope = 6000) =>
  pg.waitForFunction(([src]) => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('cabina-mnq:v1')); } catch (e) { return false; }
    try { return !!eval('(' + src + ')')(d); } catch (e) { return false; }
  }, [prueba.toString()], { timeout: tope, polling: 50 });

/* Tras guardar en un editor hay dos oleadas: se cierra el overlay y se repinta
   lo que dependa del dato. Más calma y más tope que un simple cambio de vista. */
export const trasGuardar = (pg) => quieto(pg, 60, 3000);
