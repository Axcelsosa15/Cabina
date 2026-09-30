/* Corre la suite entera y devuelve un código de salida útil para CI.

   Cada archivo es un proceso aparte a propósito: comparten `preview.html` pero
   no estado de navegador, y uno que se cuelgue no se lleva a los demás. El
   `timeout` está para que un test colgado falle como test colgado y no como
   una tubería de CI que se agota a los seis minutos sin decir cuál fue. */
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
/* No son tests: una herramienta y un ayudante. Se nombran para que nadie se
   pregunte por qué faltan. */
/* compuerta.mjs LANZA este archivo. Sin excluirla, correr.mjs la descubriria como
   una prueba mas y se llamaria a si mismo sin fondo. Se detecto antes de ejecutarla. */
const NO_SON_TESTS = new Set(['build-preview.mjs', 'espera.mjs', 'correr.mjs', 'compuerta.mjs']);
const SIN_BASELINE = new Set();

/* Las pruebas del motor viven fuera de test/, y por eso no se ejecutaban NUNCA:
   este runner escaneaba solo este directorio. Eran 421 aserciones sobre la
   matematica del dinero -- dimensionado en la rejilla de ticks, IRR, drawdown,
   Monte Carlo de supervivencia -- presentes en el repositorio y sin correr, asi
   que «45/45 en verde» no las incluia. El mismo fallo que el preview.html
   rancio, un nivel mas abajo y sobre los numeros.

   Estas dos si reportan sus fallos por el codigo de salida, al contrario que la
   mayoria de test/. */
const MOTOR = [
  ['motor-quant', join(aqui, '..', 'engine', 'quant', 'quant.test.js')],
  /* No es una prueba de comportamiento: comprueba que el bundle committeado es
     el que producen los modulos. Sin esto, el primer eslabon de la cadena queda
     sin vigilar. El segundo (bundle -> inline en index.html) lo vigila capa2. */
  ['motor-bundle', join(aqui, '..', 'engine', 'quant', 'bundle.mjs'), ['--check']],
];

/* EL PREVIEW SE CONSTRUYE AQUI, SIEMPRE. CI lo construia en un paso aparte y en local
   dependia de acordarse. Un preview viejo con codigo ya quitado de index.html dio
   60/60 en local sobre un main que en CI estaba rojo. El runner mide el index.html de
   AHORA o no mide. */
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, [join(aqui, 'build-preview.mjs')], { stdio: 'ignore' });

const solo = process.argv.slice(2);
let archivos = readdirSync(aqui)
  .filter(f => f.endsWith('.mjs') && !NO_SON_TESTS.has(f) && !SIN_BASELINE.has(f))
  .map(f => [f.replace(/\.mjs$/, ''), join(aqui, f)])
  .concat(MOTOR)
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
if (solo.length) archivos = archivos.filter(([et]) => solo.some(s => et.startsWith(s)));

const TOPE_MS = 300000;
const corre = ([etiqueta, ruta, args = []]) => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [ruta, ...args], { cwd: aqui, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  const reloj = setTimeout(() => { p.kill('SIGKILL'); }, TOPE_MS);
  p.on('close', code => { clearTimeout(reloj); res({ f: etiqueta, code, ms: Date.now() - t0, out }); });
});

console.log(`Cabina · ${archivos.length} archivos de prueba\n`);
const malos = [];
const t0 = Date.now();
let totalAfirm = 0, conAfirm = 0;
for (const entrada of archivos) {
  const r = await corre(entrada);
  const fallos = (r.out.match(/fallos: (\d+)/) || [])[1];
  /* Un test es rojo si se rompe O si dice que algo falló. Lo segundo no se
     miraba, y de 44 archivos sólo 8 reportaban sus fallos por el código de
     salida: los demás imprimían ❌ y salían 0, así que la suite los daba en
     verde. Se comprobó con cmd.mjs, que falló una aserción y salió ✅.
     Mirarlo aquí lo arregla para los 44 y para los que vengan, sin depender de
     que cada archivo se acuerde de contar. Los 30 que sólo miden no imprimen
     ❌, así que no les afecta. */
  const cruces = (r.out.match(/❌/g) || []).length;
  const rojo = r.code !== 0 || cruces > 0;
  /* CUANTAS ASERCIONES CORRIERON DE VERDAD, contando la SALIDA y no el fuente.
     Contarlas con una regex sobre el codigo NO funciona: se cuelan las que
     aparecen dentro de un comentario. Paso aqui — capsula.mjs daba 29 por grep y
     28 al ejecutarse, y la de mas estaba en una linea de su encabezado que
     menciona `paso(...)` como prosa. Ese mismo error ya se habia cometido en la
     §14 de capa2, que contaba «§13» escrito en un parrafo como si fuera una
     etiqueta. Leer la salida es la unica medicion que un comentario no puede
     falsear, y asi el numero que va al README lo produce la suite, no yo.
     Los archivos que solo miden no imprimen lineas con esta forma: salen en 0,
     que es exactamente lo que son. */
  const afirm = (r.out.match(/^ {2}(?:[✅❌]|PASS|FAIL) /gm) || []).length;
  const nota = cruces ? `  ${cruces} ✗` : fallos ? `  ${fallos} fallos` : '';
  totalAfirm += afirm;
  if (afirm) conAfirm++;
  console.log(`  ${rojo ? '❌' : '✅'} ${r.f.padEnd(14)} ${String(r.ms).padStart(6)} ms${(afirm ? '  ' + String(afirm).padStart(3) + ' af.' : '        ')}${nota}`);
  if (rojo) {
    malos.push(r.f);
    /* Las líneas que fallaron primero: son lo que se quiere leer. Si no hay
       ninguna, el proceso murió y entonces sí vale la cola. */
    const rojas = r.out.split('\n').filter(l => l.includes('❌'));
    const cuerpo = rojas.length ? rojas : r.out.split('\n').slice(-14);
    console.log(cuerpo.map(l => '       ' + l).join('\n'));
  }
}
console.log(`\n${archivos.length - malos.length}/${archivos.length} en verde · ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`${totalAfirm} aserciones ejecutadas en ${conAfirm} archivos · el resto solo mide`);
if (malos.length) { console.log('rojos: ' + malos.join(' ')); process.exit(1); }
