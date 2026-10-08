/* EL SELLO · un documento viejo no pisa uno nuevo.

   `days/<fecha>` ya estaba protegido: `subscribeDay` compara `updatedAt` y sólo
   acepta el remoto si es igual o más nuevo. `settings/main` NO lo estaba, y es
   el documento que guarda TODAS las cuentas de prop firm y TODAS las reglas
   duras. Las fichas de colección (`trades/<id>` y las demás) tampoco: la lista
   que llegaba del servidor reemplazaba lo que había en memoria sin mirar la
   antigüedad.

   Los dos caminos de pérdida silenciosa, los dos sobre dinero:

     1. LA VENTANA DEL DEBOUNCE. Entre editar y escribir hay 500 ms. Volver a la
        pestaña en ese hueco recarga las suscripciones; llegaba el documento de
        ANTES de la edición y se pintaba encima. La edición había desaparecido, y
        la escritura que salía después guardaba ya los valores remotos. Dos
        agravantes: la pantalla seguía diciendo «sincronizado», y el cambio no
        existía en ningún sitio desde el que recuperarlo.

     2. UNA LECTURA QUE LLEGA TARDE. Con la cuenta, una respuesta con la versión
        anterior de una operación —o de la configuración— borraba de la pantalla
        la edición que se acababa de guardar.

   La regla es la misma en los tres sitios: gana el `updatedAt` más alto; empate
   o ausencia la deja ganar al servidor, que es lo que hacía antes. Y el sello de
   la configuración se pone AL PEDIR la escritura, no al escribirla, porque si no
   el hueco del `debounce` sigue abierto.

   LO QUE ESTO NO ARREGLA, y está dicho en docs/MULTIUSUARIO.md: dos dispositivos
   escribiendo a la vez. La base recibe un upsert sin condición, así que el último
   que llega gana allí. Esto protege lo que hay en ESTA pantalla; no resuelve el
   conflicto. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const d = nubeDoble(html);
const nube = d.e;
const nav = await chromium.launch();
const errs = [];

const CUENTA = (id, nombre, size) => ({ id, firm: 'Firma', name: nombre, kind: 'Evaluación',
  size, dd: 2000, ddKind: 'estatico', target: 3000, trailBase: 'intradia',
  status: 'activa', ledger: [], limit: 50, total: 0, best: 0, rules: { maxLoss: 500 } });

/* La configuración que vive en la base, con su sello. */
const CFG = (sello, cuentas) => ({ meta: { title: 'Cabina' }, accounts: cuentas, updatedAt: sello });

async function abre() {
  const ctx = await nav.newContext();
  const uid = await d.conSesion(ctx, 'duena@ejemplo.com');
  return { ctx, uid };
}
async function pagina(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 3000);
  return p;
}
const cuentasEn = p => p.evaluate(() => FUT.accounts().map(a => a.name));
/* Fuerza una relectura de TODAS las suscripciones, que es lo que hace volver a
   la pestaña. Se usa el evento `online` porque su manejador llama a
   `refresca(true)` sin el freno de 20 s que tiene `visibilitychange`; el camino
   dentro del adaptador es el mismo. */
const recarga = p => p.evaluate(() => window.dispatchEvent(new Event('online')));

console.log('\n═══ 1 · la configuración de la cuenta llega y se adopta ═══');
const A = await abre();
const VIEJO = Date.now() - 600000;
d.siembra(A.uid, 'settings/main', CFG(VIEJO, [CUENTA('c1', 'Cuenta de la base', 50000)]));
const p1 = await pagina(A.ctx);
ok(JSON.stringify(await cuentasEn(p1)) === '["Cuenta de la base"]',
   'arranca con la cuenta que hay en la base', JSON.stringify(await cuentasEn(p1)));

console.log('\n═══ 2 · LA VENTANA DEL DEBOUNCE: una edición no la borra una lectura ═══');
/* Se edita (lo que sella la configuración en el acto) y, ANTES de que pasen los
   500 ms del debounce, se fuerza una recarga de las suscripciones: es lo que
   hace volver a la pestaña. La lectura trae el documento de la base, que es el
   de antes de la edición. */
await p1.evaluate(() => FUT.createAccount({ id: 'nueva', firm: 'Firma', name: 'Recién creada', size: 25000, dd: 1000, ddKind: 'estatico', status: 'activa', ledger: [] }));
await recarga(p1);
await quieto(p1, 60, 2500);
const tras = await cuentasEn(p1);
ok(tras.includes('Recién creada'),
   'la cuenta recién creada sigue en pantalla tras la lectura (desaparecía)', JSON.stringify(tras));
ok(tras.includes('Cuenta de la base'), 'y la que ya había no se perdió', JSON.stringify(tras));

console.log('\n═══ 3 · y acaba guardada en la base, no los valores remotos ═══');
await p1.waitForTimeout(900);
const fila = () => {
  const f = d.filasDe(A.uid).find(x => x.path === 'settings/main');
  return f ? (f.data.accounts || []).map(a => a.name) : null;
};
ok(JSON.stringify(fila()) === JSON.stringify(tras),
   'la base guarda exactamente lo que hay en pantalla', JSON.stringify(fila()));

console.log('\n═══ 4 · el rótulo no miente: dice sincronizado porque LO ESTÁ ═══');
const rot = await p1.evaluate(() => document.getElementById('saveState').textContent);
ok(rot === 'sincronizado', 'rótulo «sincronizado» con la base al día', rot);

console.log('\n═══ 5 · UNA LECTURA QUE LLEGA TARDE con contenido viejo no gana ═══');
/* Se mete en la base, a mano, una configuración MÁS VIEJA que la de la pantalla
   —lo que produce una respuesta que llega tarde, o un dispositivo con el reloj
   atrasado— y se fuerza la lectura. No puede pisar lo de la pantalla. */
const antes5 = await cuentasEn(p1);
d.siembra(A.uid, 'settings/main', CFG(VIEJO - 60000, [CUENTA('c1', 'VERSIÓN VIEJA', 50000)]));
await recarga(p1);
await quieto(p1, 60, 2500);
const despues5 = await cuentasEn(p1);
ok(!despues5.includes('VERSIÓN VIEJA'), 'la configuración vieja de la base NO entra', JSON.stringify(despues5));
ok(JSON.stringify(despues5) === JSON.stringify(antes5), 'y la pantalla queda intacta', JSON.stringify(despues5));

console.log('\n═══ 6 · una configuración MÁS NUEVA sí entra: esto no es un candado ═══');
d.siembra(A.uid, 'settings/main', CFG(Date.now() + 120000, [CUENTA('c9', 'DESDE OTRO DISPOSITIVO', 100000)]));
await recarga(p1);
await quieto(p1, 60, 2500);
const despues6 = await cuentasEn(p1);
ok(despues6.includes('DESDE OTRO DISPOSITIVO'),
   'lo escrito en otro dispositivo DESPUÉS sí llega: sigue habiendo sync', JSON.stringify(despues6));

console.log('\n═══ 7 · lo mismo para una ficha de colección ═══');
/* Una operación editada aquí no puede volver atrás porque llegue tarde la
   versión anterior desde la base. */
await p1.evaluate(() => FUT.createTrade({ id: 'op1', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00' }));
await quieto(p1, 60, 2500);
await p1.evaluate(() => FUT.updateTrade('op1', { notes: 'NOTA NUEVA' }));
await quieto(p1, 60, 2500);
/* En la base se pone la versión ANTERIOR, con sello viejo. */
d.siembra(A.uid, 'trades/op1', { id: 'op1', type: 'futuros', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00',
  notes: 'NOTA VIEJA', updatedAt: VIEJO });
await recarga(p1);
await quieto(p1, 60, 2500);
const nota = await p1.evaluate(() => { const t = FUT.trades().find(x => x.id === 'op1'); return t ? t.notes : null; });
ok(nota === 'NOTA NUEVA', 'la nota editada aquí sobrevive a la versión vieja de la base', nota);

d.siembra(A.uid, 'trades/op1', { id: 'op1', type: 'futuros', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00',
  notes: 'NOTA DE OTRO DISPOSITIVO', updatedAt: Date.now() + 120000 });
await recarga(p1);
await quieto(p1, 60, 2500);
const nota2 = await p1.evaluate(() => { const t = FUT.trades().find(x => x.id === 'op1'); return t ? t.notes : null; });
ok(nota2 === 'NOTA DE OTRO DISPOSITIVO', 'y una versión más nueva sí entra', nota2);

console.log('\n═══ 8 · sin cuenta el sello no cambia nada ═══');
/* El almacén local contesta en el acto y devuelve lo mismo que se escribió, así
   que el sello nunca puede perder; se comprueba que seguir editando funciona. */
const ctxL = await nav.newContext();
const pL = await ctxL.newPage();
pL.on('pageerror', e => errs.push(e.message));
await pL.goto(BASE, { waitUntil: 'load' });
await pL.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await quieto(pL, 60, 2500);
await pL.evaluate(() => FUT.createAccount({ id: 'loc', firm: 'F', name: 'Local', size: 25000, dd: 1000, ddKind: 'estatico', status: 'activa', ledger: [] }));
/* Espera explícita: `quieto` mira el DOM, y el guardado de la configuración
   lleva 500 ms de `debounce` que pueden caer después de que el DOM se calme. */
await pL.waitForTimeout(1200);
await pL.reload({ waitUntil: 'load' });
await pL.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await quieto(pL, 60, 2500);
ok((await cuentasEn(pL)).includes('Local'), 'sin cuenta, lo creado sigue ahí tras recargar', JSON.stringify(await cuentasEn(pL)));

console.log('\n═══ 9 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
