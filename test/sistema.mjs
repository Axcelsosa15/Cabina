/* EL SISTEMA VISUAL ES UNO, Y LAS OCHO PESTAÑAS LO COMPARTEN.
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ AFIRMA ESTE ARCHIVO, Y POR QUÉ ASÍ.

   El rediseño pedía que CABINA se sienta como UNA aplicación: la misma primitiva
   —un panel, un botón, un campo, una cabecera de tabla— tiene que verse igual en
   cualquier pestaña. Eso no se comprueba mirando capturas: se comprueba
   preguntando al navegador por el estilo COMPUTADO de TODAS las instancias
   visibles de cada primitiva, en las ocho pestañas y con datos, y exigiendo UN
   SOLO valor por propiedad. Si hay dos, hay dos sistemas.

   POR QUÉ «TODAS LAS INSTANCIAS» Y NO «LA PRIMERA DE CADA PESTAÑA». El primer
   intento comparaba la primera coincidencia por pestaña y daba divergencias que
   no existían: en METRICAS/EDGE la primera `.btn` es `.primary` y en CABINA no,
   así que comparaba un botón de acento contra uno llano. Medir mal produce
   defectos imaginarios, y perseguirlos habría «arreglado» cosas que estaban
   bien.

   LO QUE ESTE ARCHIVO ENCONTRÓ CUANDO SE ESCRIBIÓ (y ya está arreglado):

     · La tabla de desglose de ESTUDIO se montaba con estilos en línea y SIN
       `class="t"`, así que se quedaba fuera del sistema de tablas: cabeceras en
       #b7c4d0 a 10px con 0.075em contra #A2AAB9 a 10.5px con 0.1em del resto, y
       celdas con borde #26313c contra #1E2531. Las 40 cabeceras de las ocho
       pestañas ahora dan un solo valor en cada propiedad.
     · Los tres niveles de color de texto no existían por un comentario de CSS
       sin cerrar. Eso lo vigila `tokens.mjs`; aquí se nota porque sin ellos
       media aplicación computa el mismo color y la jerarquía desaparece.

   LAS EXCEPCIONES SE NOMBRAN, NO SE IGNORAN. Una excepción sin motivo escrito es
   una grieta por la que entra el siguiente desajuste:

     · LOS CALENDARIOS. Los dos paneles de calendario llevan `padding:12px` en
       línea en vez de los 16/17px del resto: la rejilla del mes necesita el
       ancho, y es una razón óptica declarada, igual que la escala de espacio del
       propio sistema permite. Son dos, y coinciden entre sí.
     · EL COLOR DE UN BORDE QUE NO SE DIBUJA. Una celda con
       `border-bottom-width: 0` computa el color heredado, que no se ve. Se
       midió: las 328 celdas con borde de 1px tienen TODAS el mismo color; los
       otros cinco valores estaban todos sobre bordes de 0px. Comparar sin
       filtrar por ancho inventa cinco divergencias invisibles.
     · LAS VARIANTES SEMÁNTICAS. `.chip.inv` es azul y `.chip.fut` es teal porque
       significan inversión y futuros; `td.r.pos` y `td.r.neg` llevan el color de
       la ganancia y de la pérdida. Eso es el sistema haciendo su trabajo, no
       rompiéndose, así que las primitivas se eligen con selectores que excluyen
       la variante y el color semántico se queda fuera de la comparación.

   SABOTAJES CORRIDOS, al pie del archivo. */
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
const TABS = ['cabina', 'futuros', 'edge', 'invest', 'playbook', 'ideas', 'estudio', 'calc'];

/* nombre → [selector, propiedades]. El selector excluye las variantes
   semánticas; `.panel .body` excluye los calendarios por su contenedor. */
const PRIM = {
  'panel':             ['section.panel', ['border-top-color', 'border-top-left-radius']],
  'cabecera de panel': ['.panel > header', ['border-bottom-color']],
  'titulo de panel':   ['.panel > header h2', ['font-size', 'letter-spacing', 'color']],
  'cuerpo de panel':   ['.panel:not(:has(.cal)) > .body', ['padding-top', 'padding-left']],
  'tile':              ['.tile', ['padding-top', 'padding-left']],
  'boton primario':    ['.btn.primary:not(.sm)', ['background-image', 'color']],
  'campo numerico':    ['input[type=number]', ['border-top-left-radius', 'min-height', 'background-color']],
  'desplegable':       ['select', ['border-top-left-radius']],
  'cabecera de tabla': ['th', ['color', 'font-size', 'letter-spacing']],
  'celda con borde':   ['td', ['border-bottom-color']],
  'estado vacio':      ['.empty', ['border-top-color', 'border-top-left-radius', 'color']],
};

const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const b = await chromium.launch();
const pag = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await pag.goto(BASE);
await pag.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), SEMILLA);
await pag.reload();
await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

/* primitiva → propiedad → valor → [quién] */
const mapa = {};
for (const t of TABS) {
  await pag.click(`[data-tab="${t}"]`);
  /* Al DATO, no al reloj: la pestaña está lista cuando su panel está activo. */
  await pag.waitForFunction(x => {
    const el = document.querySelector(`.tab[data-tab="${x}"]`);
    return el && el.classList.contains('active');
  }, t, { timeout: 10000 });
  const r = await pag.evaluate(([tab, PRIM]) => {
    const raiz = document.querySelector(`.tab[data-tab="${tab}"]`);
    const out = {};
    for (const [nombre, [sel, props]] of Object.entries(PRIM)) {
      out[nombre] = [];
      if (!raiz) continue;
      for (const el of raiz.querySelectorAll(sel)) {
        if (!el.offsetParent) continue;
        const q = el.getBoundingClientRect();
        if (!q.width || !q.height) continue;
        const cs = getComputedStyle(el);
        /* El color de un borde que no se dibuja no es un valor del sistema. */
        if (nombre === 'celda con borde' && parseFloat(cs.borderBottomWidth) === 0) continue;
        out[nombre].push({
          id: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : ''}`,
          v: Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)])),
        });
      }
    }
    return out;
  }, [t, PRIM]);
  for (const [nombre, lista] of Object.entries(r)) {
    mapa[nombre] = mapa[nombre] || {};
    for (const { id, v } of lista) for (const [p, val] of Object.entries(v)) {
      mapa[nombre][p] = mapa[nombre][p] || {};
      (mapa[nombre][p][val] = mapa[nombre][p][val] || []).push(`${t}·${id}`);
    }
  }
}
await b.close(); srv.close();

console.log('\n═══ UNA SOLA DEFINICIÓN DE CADA PRIMITIVA EN LAS OCHO PESTAÑAS ═══');
for (const [nombre, [, props]] of Object.entries(PRIM)) {
  const vistas = mapa[nombre] || {};
  const total = vistas[props[0]] ? Object.values(vistas[props[0]]).flat().length : 0;
  /* Cero instancias no es un verde: es que la prueba no midió nada, y eso ya
     pasó una vez en este repositorio con siete pruebas sobre un fichero viejo. */
  if (!total) { ok(false, `${nombre}: hay instancias que medir`, 'NINGUNA instancia visible en las ocho pestañas, ni con la semilla'); continue; }
  const malas = props.filter(p => Object.keys(vistas[p] || {}).length > 1);
  ok(malas.length === 0, `${nombre.padEnd(18)} un solo valor en cada propiedad`,
     malas.length
       ? malas.map(p => `${p}: ` + Object.entries(vistas[p]).sort((a, z) => z[1].length - a[1].length)
           .map(([v, q]) => `${q.length}× ${v.slice(0, 34)} (${q[0]})`).join(' ≠ ')).join(' | ')
       : `${total} instancias · ${props.join(', ')}`);
}

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);

/* SABOTAJES (15/10/2026). Cada uno rojo por su propia aserción, con exit 1, y al
   restaurar el fichero la prueba volvió a verde con un diff vacío. Los mensajes
   son los que imprimió de verdad:

   1 · devolver la tabla de ESTUDIO a sus estilos en línea y sin `class="t"`
         ❌ cabecera de tabla
              color:         34× rgb(162, 170, 185) ≠ 6× rgb(183, 196, 208)
              font-size:     34× 10.5px             ≠ 6× 10px
              letter-spacing:34× 1.05px             ≠ 6× 0.75px

   2 · dar a los paneles de UNA pestaña otro radio
         ❌ panel
              border-top-left-radius: 31× 14px ≠ 4× 4px (calc·section.panel)
       Y una lección que vale más que el sabotaje: el primer intento NO hizo
       nada. La regla se insertó al PRINCIPIO de la capa unificada, y
       `.tab[data-tab="calc"] .panel` tiene la misma especificidad que
       `.tab:not([data-tab="estudio"]) .panel`, que va después y por tanto gana.
       La prueba salió verde con razón: el valor computado no había cambiado. Un
       sabotaje que no cambia lo que mide no demuestra que la prueba sirva, sólo
       que el sabotaje era inerte — y ésa es justo la confusión que este
       repositorio persigue en los verdes. Repetido al FINAL de la capa, donde sí
       gana, la fila se puso roja.

   3 · quitar la exclusión de los calendarios del selector de `cuerpo de panel`
         ❌ cuerpo de panel
              padding-top:  32× 16px ≠ 1× 12px
              padding-left: 32× 17px ≠ 1× 12px
       Es el sabotaje que prueba que la excepción está donde dice estar: si
       alguien la borra creyéndola de adorno, la prueba se lo dice. */
