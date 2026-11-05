/* LAS FRANJAS, EN DOS FICHEROS QUE NO SE HABLAN · y el minuto a minuto.
   ─────────────────────────────────────────────────────────────────────────────
   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, Y QUE YA OCURRIO. La tabla de
   sesiones vive en `app.js` (`SESSIONS`), y `discipline.js` la reimplementa en
   su `session(m)` porque es un modelo puro sin acceso al DOM ni a la app. Dos
   copias de la misma decision en dos ficheros que no se importan: no es que
   puedan divergir, es cuestion de cuando.

   Y ya habia divergido en lo que importa. `app.js` marca con `pre: true` las
   CINCO franjas que se preparan con lista propia, y `sesSel()` nunca devuelve
   una que no lo este, asi que `day.pres` no recibe JAMAS una clave de las otras
   tres. Pero `preparation()` en `discipline.js` si calculaba esas tres, buscaba
   una pre-sesion que no puede existir y devolvia «unknown» para siempre.
   Medido antes del arreglo, con una operacion impecable —riesgo, condiciones,
   reglas y revision en `pass`—: 09:30 ET daba `scored` 100; 16:30 y 18:00
   daban `insufficient` y `null`. El motivo que se le ensenaba al usuario era
   «No hay una pre-sesion guardada para esta sesion», y el usuario NO PUEDE
   guardarla: la app no ofrece checklist para esas franjas. Cualquier operacion
   entrada entre 07:00-08:30, 16:00-17:00 o 17:00-20:00 ET quedaba sin
   puntuacion para siempre, por una franja que no eligio.

   QUE SE AFIRMA AQUI:
     §1 Las franjas preparables de `discipline.js` son EXACTAMENTE las que
        `app.js` marca con `pre: true`. Ni una mas, ni una menos.
     §2 Los 1440 minutos del dia caen en la misma franja en los dos ficheros.
        Mover un limite en `SESSIONS` y olvidarse de `session()` deja de ser
        posible en silencio: aqui sale el minuto exacto donde discrepan.
     §3 Una operacion impecable puntua en las once franjas, incluidas las tres
        que no se preparan, y el criterio de preparacion sale `na` —no `unknown`—
        en esas tres. Es la prueba de comportamiento del arreglo, no de la forma.
     §4 Un `na` no regala puntos: con cuatro criterios aplicables, fallar uno
        baja la nota. Y con los cinco aplicables la escala es la de siempre. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../discipline.js';

const D = globalThis.CabinaDiscipline;
const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(raiz, 'app.js'), 'utf8');

/* La tabla de `app.js`, leida de su codigo: es el unico sitio donde la decision
   existe de verdad. Si el bloque cambia de forma, esto se pone rojo por no
   encontrarlo, que es lo correcto: nadie debe poder moverlo sin enterarse. */
const bloque = (app.match(/const SESSIONS = \[([\s\S]*?)\n  \];/) || [])[1] || '';
const filas = Array.from(bloque.matchAll(
  /\{\s*id:\s*"([a-z]+)",[\s\S]*?start:\s*([0-9 *+]+?),\s*end:\s*([0-9 *+]+?),[\s\S]*?pre:\s*(true|false)/g
)).map(m => ({ id: m[1], start: eval(m[2]), end: eval(m[3]), pre: m[4] === 'true' }));

console.log('\n═══ §1 · las franjas preparables son las mismas en los dos ficheros ═══');
ok(filas.length === 8, 'se leyeron las ocho franjas de SESSIONS en app.js',
   filas.map(f => f.id).join(' · ') || 'NO se encontró el bloque SESSIONS');
const appPre = filas.filter(f => f.pre).map(f => f.id).sort();
const modPre = [...D.PREPARABLES].sort();
ok(JSON.stringify(appPre) === JSON.stringify(modPre),
   'discipline.js prepara exactamente las franjas que app.js marca con pre: true',
   `app.js: ${appPre.join(' ')} · discipline.js: ${modPre.join(' ')}`);

console.log('\n═══ §2 · los 1440 minutos del día caen en la misma franja ═══');
/* La misma regla de `app.js`: un tramo que cruza medianoche tiene fin < inicio. */
const enFranja = (f, m) => f.start <= f.end ? (m >= f.start && m < f.end) : (m >= f.start || m < f.end);
const discrepan = [];
for (let m = 0; m < 1440; m++) {
  const deApp = (filas.find(f => enFranja(f, m)) || {}).id;
  const deMod = D.sessionAt(m);
  if (deApp !== deMod) discrepan.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} app=${deApp} modelo=${deMod}`);
}
ok(discrepan.length === 0, 'ningún minuto del día se clasifica distinto',
   discrepan.length ? `${discrepan.length} minutos discrepan, el primero: ${discrepan[0]}` : '1440 minutos, misma franja');

console.log('\n═══ §3 · una operación impecable puntúa en TODAS las franjas ═══');
const NOW = Date.parse('2026-11-03T23:30:00Z'), HOY = '2026-11-03';
/* Una pre-sesión guardada para cada franja preparable, sellada a las 00:05 ET
   para que siempre sea anterior a la entrada. Con `na` no se mira. */
const presTodas = Object.fromEntries(D.PREPARABLES.map(id =>
  [id, { ses: id, at: Date.parse(HOY + 'T05:05:00Z'), items: [{ ok: true }, { ok: true }] }]));
const impecable = time => D.scoreTrade({
  id: 't', date: HOY, time, instrument: 'MNQ', direction: 'long', qty: 1,
  entry: 20000, stop: 19950, exit: 20050, invalida: 'pierde el nivel',
  cStruct: true, cPull: true, cWindow: true, cSize: true, plan: 'cumpli',
  processRules: { status: 'pass' },
}, { day: { date: HOY, pres: presTodas }, now: NOW, today: HOY });

/* Un minuto dentro de cada franja, el de en medio, para no rozar los límites. */
const medio = f => { const dur = f.start <= f.end ? f.end - f.start : (1440 - f.start) + f.end; return (f.start + Math.floor(dur / 2)) % 1440; };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const sinPuntuar = [], prepMal = [];
for (const f of filas) {
  const t = hhmm(medio(f)), r = impecable(t), prep = r.criteria.find(c => c.key === 'preparation');
  if (r.score !== 100 || r.status !== 'scored') sinPuntuar.push(`${f.id} ${t} → ${r.status}/${r.score}`);
  const esperado = f.pre ? 'pass' : 'na';
  if (prep.status !== esperado) prepMal.push(`${f.id} ${t} → ${prep.status}, se esperaba ${esperado}`);
  console.log(`     ${f.id.padEnd(8)} ${t}  ${String(r.status).padEnd(12)} ${String(r.score).padEnd(4)}/${r.possiblePoints}  prep=${prep.status}`);
}
ok(sinPuntuar.length === 0, 'las ocho franjas dan 100 y status scored con un registro impecable',
   sinPuntuar.length ? sinPuntuar.join(' | ') : 'ocho de ocho');
ok(prepMal.length === 0, 'la preparación sale pass donde hay lista y na donde no la hay',
   prepMal.length ? prepMal.join(' | ') : 'coincide con pre: true/false de app.js');

console.log('\n═══ §4 · un na no regala puntos ═══');
const cierre = hhmm(medio(filas.find(f => f.id === 'cierre')));
const nyam = hhmm(medio(filas.find(f => f.id === 'nyam')));
const falloEnCierre = D.scoreTrade({
  id: 't', date: HOY, time: cierre, instrument: 'MNQ', direction: 'long', qty: 1,
  entry: 20000, stop: 20050, exit: 20050, invalida: 'pierde el nivel',  // stop del lado equivocado
  cStruct: true, cPull: true, cWindow: true, cSize: true, plan: 'cumpli',
  processRules: { status: 'pass' },
}, { day: { date: HOY, pres: presTodas }, now: NOW, today: HOY });
ok(falloEnCierre.possiblePoints === 80, 'con un criterio no aplicable el denominador baja a 80',
   `${falloEnCierre.confirmedPoints}/${falloEnCierre.possiblePoints}`);
ok(falloEnCierre.score === 75, 'fallar uno de cuatro baja la nota a 75, no la deja en 100',
   `score=${falloEnCierre.score} estrellas=${falloEnCierre.stars}`);
ok(impecable(nyam).possiblePoints === 100, 'con los cinco aplicables el denominador sigue siendo 100',
   `${impecable(nyam).confirmedPoints}/${impecable(nyam).possiblePoints}`);
ok(impecable(cierre).coverage === 1, 'un na no baja la cobertura: no es un hueco',
   `cobertura=${impecable(cierre).coverage}`);

console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' | ') : ''));
if (fallos.length) process.exitCode = 1;
