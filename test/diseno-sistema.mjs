/* GUARDIÁN DE ERGONOMÍA, NO DE PALETA.
   El guardián que venía en la PR #75 comprobaba que ciertos hex ESTUVIERAN EN
   EL TEXTO del CSS. Eso no protege nada: pasa en verde sobre colores que el
   `!important` del tema de `744c1a3` tapa, y de hecho habría pasado sobre 374
   líneas muertas. Lo que se puede comprobar sin abrir un navegador es que las
   decisiones de ergonomía siguen escritas; lo que hay que ver en pantalla se
   ve en pantalla. La decisión de tema está en docs/DISENO.md. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fallos = [];
const exige = (cond, que) => { if (!cond) fallos.push(que); };

/* Cinco bloques <style> y no más: el guardián estructural de `sistema.mjs`
   cuenta ese número, y añadir un sexto es exactamente lo que hace falta
   evitar — otra capa encima en vez de arreglar la de debajo. */
exige((html.match(/<style\b[^>]*>/g) || []).length === 5,
  'deben seguir siendo cinco bloques <style>: una capa más es la deuda de docs/DISENO.md creciendo');

/* ---------- ergonomía que no depende del tema ---------- */
exige(/:where\([^)]*\):focus-visible|:focus-visible\s*{/.test(html),
  'foco visible: un teclado sin anillo de foco no puede recorrer la aplicación');
exige(html.includes('-webkit-tap-highlight-color: transparent'),
  'el destello al tocar tapa el estado de foco y dura más que el toque');
exige(html.includes('tabular-nums') && html.includes('lining-nums'),
  'cifras tabulares Y de caja alta: sin lining-nums una tabla de P&L se lee torcida');
exige(html.includes('text-wrap: pretty') && html.includes('text-wrap: balance'),
  'balance en títulos y pretty en texto corrido');
exige(/@media[^{]*max-width[^}]*?font-size: ?16px/s.test(html.replace(/\n/g, ' ')),
  'campos a 16 px en móvil: por debajo, Safari amplía el zoom al enfocar');
exige(/min-height: ?4[0-9]px/.test(html),
  'altura de control táctil en móvil');
exige(html.includes('prefers-reduced-motion'),
  'prefers-reduced-motion respetado');
exige(html.includes('overscroll-behavior'),
  'el scroll horizontal de las tablas no debe propagarse al viewport');
exige(html.includes('scroll-padding-top'),
  'scroll-padding-top: con barra fija, un ancla sin él aterriza debajo de ella');

/* ---------- lo que la capa visual NO puede haberse llevado ---------- */
for (const tab of ['cabina', 'futuros', 'cuentas', 'edge', 'invest', 'historial', 'playbook', 'ideas', 'estudio', 'calc', 'ajustes']) {
  exige(html.includes('data-tab="' + tab + '"'), 'la pestaña debe conservarse: ' + tab);
}
exige(/<script[^>]+src=["'](\.\/)?app\.js["']/.test(html),
  'la aplicación vive en app.js: la CSP declara script-src \'self\' sin unsafe-inline');

/* ---------- la paleta descartada no debe volver de tapadillo ---------- */
for (const hex of ['#FAF8F4', '#16915B', '#D6483B', '#3D6FB0']) {
  exige(!html.includes(hex),
    'vuelve un color de la paleta descartada de la PR #75 (' + hex + '): lo tapa el !important de 744c1a3 y sería CSS muerto — ver docs/DISENO.md');
}

if (fallos.length) {
  console.error('❌ diseno-sistema · ' + fallos.length + ' fallo(s):');
  for (const f of fallos) console.error('   · ' + f);
  process.exit(1);
}
console.log('PASS diseno-sistema: ergonomía, cinco capas, once pestañas, app.js y la paleta descartada sin volver');
