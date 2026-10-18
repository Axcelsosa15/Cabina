/* ¿ESTÁ TODO CONECTADO? · el cruce que nadie hacía.

   La app tiene 11 colecciones, 20 zonas de repintado y ~71 funciones `render*`.
   Cuando un render lee un dato que vive en OTRA colección —el nombre del
   mercado, la etiqueta de la cuenta, el número de posiciones— hay que acordarse
   de meter su zona en el suscriptor de esa colección. Acordarse no escala: ya
   se olvidó tres veces.

       · Estudio leía las operaciones y no estaba en FANOUT_TRADES.
       · La clave del buscador leía `acctLabel()` y guardaba sólo `a.name`.
       · La lista de inversión leía `marketName()` y el número de posiciones,
         y no estaba en el suscriptor de `markets` ni en el de `positions`.

   Los tres son el mismo fallo, y los tres se encontraron por casualidad. Esta
   prueba lo cruza a máquina: para cada colección, QUIÉN la lee contra QUÉ se
   repinta cuando cambia. Es estática —no abre navegador— y tarda milisegundos.

   POR QUÉ HAY ARISTAS EXCLUIDAS. El grafo de llamadas no distingue «leo esto
   para pintarlo» de «leo esto para borrarlo / para abrir el editor». Sin esa
   distinción el cruce daba 34 de 71 renders dependiendo de `positions`, porque
   la cadena pasaba por `coll` y de ahí a la maquinaria de conflictos. Cada
   exclusión de abajo es una arista que NO transporta dependencia de pintado, y
   lleva escrito por qué. Añadir una para silenciar un fallo real es hacer
   trampa; la lista es corta a propósito. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(raiz, 'index.html'), 'utf8');
const js = [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

/* Aristas que NO transportan dependencia de pintado. */
const NO_PINTAN = new Map([
  ['coll', 'el accesor: llamarlo no es depender de una colección concreta'],
  ['noSeGuardo', 'maquinaria de guardado; desde aquí el grafo llega a los diálogos de conflicto'],
  ['siSeGuardo', 'ídem'],
  ['openEditor', 'abre un diálogo por un evento del usuario, no pinta la vista de debajo'],
  ['closeEditor', 'ídem'],
  ['openTrade', 'abre el editor de una operación; sus campos leen mercados para el desplegable'],
  ['openPosition', 'abre el editor de una posición'],
  ['borrables', 'el registro de borrado masivo: enumera colecciones para BORRAR, no para pintar'],
  ['enterDemo', 'reemplaza los datos por el juego de ejemplo; repinta todo por su cuenta'],
  ['renderAll', 'pinta la app entera al arrancar: no es el repintado de una zona'],
]);

/* ── cuerpos de función, por emparejado de llaves ──────────────────────── */
const fns = new Map();
const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
let m;
while ((m = re.exec(js))) {
  let i = m.index + m[0].length - 1, prof = 0, fin = i;
  for (let k = i; k < js.length; k++) {
    const c = js[k];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (!prof) { fin = k; break; } }
  }
  fns.set(m[1], js.slice(i, fin));
}
ok(fns.size > 300, 'se leyeron los cuerpos de función del index', fns.size + ' funciones');

const directas = new Map(), llama = new Map();
for (const [n, cuerpo] of fns) {
  directas.set(n, new Set([...cuerpo.matchAll(/coll\(\s*"([a-zA-Z]+)"\s*\)/g)].map(x => x[1])));
  const ll = new Set();
  for (const x of cuerpo.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (fns.has(x[1]) && x[1] !== n) ll.add(x[1]);
  llama.set(n, ll);
}

/* LOS ENVOLTORIOS CUENTAN. `renderHistory` se reasigna para llamar también a
   los calendarios (`renderHistory = function () { _renderHistory(); …
   renderCabCalendar(); }`). Sin leer esa reasignación el cruce no ve la arista
   y canta el calendario de la Cabina como desconectado, cuando lo que pasa es
   que cuelga de un parche. Se leen y se suman al grafo. */
let envoltorios = 0;
for (const w of js.matchAll(/(?:^|[;{}]\s*)([A-Za-z_$][\w$]*)\s*=\s*function\s*\([^)]*\)\s*\{/gm)) {
  const n = w[1];
  if (!fns.has(n)) continue;
  let i = w.index + w[0].length - 1, prof = 0, fin = i;
  for (let k = i; k < js.length; k++) {
    const c = js[k];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (!prof) { fin = k; break; } }
  }
  const cuerpo = js.slice(i, fin);
  envoltorios++;
  for (const x of cuerpo.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (fns.has(x[1]) && x[1] !== n) llama.get(n).add(x[1]);
  for (const x of cuerpo.matchAll(/coll\(\s*"([a-zA-Z]+)"\s*\)/g)) directas.get(n).add(x[1]);
}
ok(envoltorios > 0, 'se leyeron las reasignaciones que envuelven renders', envoltorios + ' envoltorios');

/* ── registro de zonas y conjuntos de repintado ────────────────────────── */
const zBloque = js.slice(js.indexOf('const Z = {'), js.indexOf('const FANOUT_SEL'));
const zona = new Map();
for (const z of zBloque.matchAll(/^\s{4}([a-zA-Z]+):\s*\[[^\]]*?\]\s*,/gms)) {
  zona.set(z[1], [...z[0].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(\s*\)/g)].map(x => x[1]).filter(n => fns.has(n)));
}
ok(zona.size >= 20, 'se leyó el registro de zonas Z', zona.size + ' zonas');

const listaDe = txt => [...txt.matchAll(/Z\.([a-zA-Z]+)/g)].map(x => x[1]);
const CONJ = {};
for (const c of js.matchAll(/const (FANOUT_[A-Z]+) = \[([\s\S]*?)\];/g)) CONJ[c[1]] = listaDe(c[2]);
ok(Object.keys(CONJ).length >= 2, 'se leyeron los conjuntos FANOUT_*', Object.keys(CONJ).join(', '));

/* Una zona del registro que ningún Z.x nombra está muerta: se pinta sola o no
   se pinta nunca, y en los dos casos es una trampa para el siguiente. */
const nombradas = new Set([...Object.values(CONJ).flat(), ...listaDe(js.slice(js.indexOf('const FANOUT_SEL')))]);
const muertas = [...zona.keys()].filter(z => !nombradas.has(z));
ok(muertas.length === 0, 'ninguna zona del registro queda sin nombrar', muertas.join(', ') || 'ninguna');

const BARRERA = new Set([...[...zona.values()].flat(), ...NO_PINTAN.keys()]);

/* QUIÉN PINTA Y QUIÉN SÓLO CALCULA. La barrera de «ya está cubierto» sólo vale
   para una función que escribe en el DOM: si su pintura se refresca, quien la
   llama no necesita repintarse. Un ayudante PURO no tiene DOM que refrescar
   —`marketName(id)` devuelve una cadena— así que la dependencia lo atraviesa.
   Sin esta distinción el cruce se tragaba un hueco real: la lista de inversión
   lee el nombre del mercado a través de `marketName()`, y `marketName()`
   contaba como cubierto porque lo llama también una zona que sí se repintaba. */
const pinta = n => /\.innerHTML|\.textContent|\.value\s*=|classList|setAttribute|\.hidden\s*=|\.style\./.test(fns.get(n) || '');

/* ── colección → zonas que repinta ────────────────────────────────────── */
const repinta = new Map();
for (const s of js.matchAll(/coll\(\s*"([a-zA-Z]+)"\s*\)\.subscribe\(\s*\(\s*\)\s*=>\s*([^;]*?)\)\s*;/g)) {
  const [, col, cuerpo] = s;
  const cn = cuerpo.match(/fanout\(\s*(FANOUT_[A-Z]+)\s*\)/);
  const zs = cn ? (CONJ[cn[1]] || []) : /fanout\(/.test(cuerpo) ? listaDe(cuerpo) : null;
  if (zs === null) continue;                    // no pasa por el agrupador
  repinta.set(col, [...new Set([...(repinta.get(col) || []), ...zs])]);
}
for (const s of js.matchAll(/\[([^\]]*?)\]\.forEach\(n => coll\(n\)\.subscribe/g)) {
  for (const q of s[1].matchAll(/"([a-zA-Z]+)"/g)) if (!repinta.has(q[1])) repinta.set(q[1], []);
}

const todas = [...new Set([...js.matchAll(/coll\(\s*"([a-zA-Z]+)"\s*\)/g)].map(x => x[1]))].sort();
const RENDERS = [...fns.keys()].filter(n => /^render/.test(n) && !NO_PINTAN.has(n));

console.log(`\n═══ 1 · toda colección tiene quien la escuche ═══`);
const sinSus = todas.filter(c => !repinta.has(c));
ok(sinSus.length === 0, 'ninguna colección se guarda sin que nadie se entere', sinSus.join(', ') || 'ninguna');

console.log(`\n═══ 2 · todo lector se repinta cuando su dato cambia ═══`);
/* EL CRUCE ES POR COLECCIÓN, no global, y ésa es la pieza que hace que el
   resultado sea creíble. «Cubierto» se calcula primero: las zonas que esa
   colección repinta, más lo que esas zonas llaman. Y la dependencia NO se
   propaga hacia arriba a través de algo ya cubierto: si `paintGateButtons()`
   se repinta con cada cambio de operación —lo hace, `renderFutures` lo llama—
   entonces `renderChecklist`, que lo invoca, no necesita repintarse por eso.
   Sin esta regla el cruce cantaba cinco falsos positivos de ese tipo, y la
   tentación era taparlos con excepciones a mano. */
const huecos = [];
for (const col of todas) {
  const cubiertos = new Set((repinta.get(col) || []).flatMap(z => zona.get(z) || []));
  for (let v = true; v;) {                       // un render cubierto arrastra a los que llama
    v = false;
    for (const n of [...cubiertos]) for (const d of llama.get(n) || []) {
      if (!cubiertos.has(d) && !NO_PINTAN.has(d)) { cubiertos.add(d); v = true; }
    }
  }
  const dep = new Map([...fns.keys()].map(n => [n, directas.get(n).has(col)]));
  for (let v = true, giros = 0; v && giros < 60; giros++) {
    v = false;
    for (const n of fns.keys()) {
      if (dep.get(n)) continue;
      for (const d of llama.get(n)) {
        if (BARRERA.has(d) || (cubiertos.has(d) && pinta(d))) continue;
        if (dep.get(d)) { dep.set(n, true); v = true; break; }
      }
    }
  }
  for (const n of RENDERS) if (dep.get(n) && !cubiertos.has(n)) huecos.push(`${col} → ${n}`);
}
ok(huecos.length === 0, `${todas.length} colecciones × ${RENDERS.length} renders cruzados`,
  huecos.length ? huecos.join(' · ') : '0 pares sin conectar');

console.log(`\n${fallos.length ? '❌' : '✅'} conexiones · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
