/* LA COLA DURABLE · lo que pasa cuando se cierra la pestaña sin red.
   ─────────────────────────────────────────────────────────────────────────────
   Hasta aquí, una escritura que fallaba se anotaba en `sinGuardar`, un Map EN
   MEMORIA. El rótulo lo decía —eso ya estaba bien— y al recargar la operación
   había desaparecido sin dejar rastro. Apuntar una operación en el metro y
   cerrar la pestaña la perdía.

   LAS DOS ASERCIONES QUE DECIDEN, y las dos tienen que poder fallar:

     1. Sin red, escribo, CIERRO la pestaña, vuelvo, vuelve la red
        → la operación llega a la base.
        Contra el código anterior: no llega nunca. La prueba se pone roja.

     2. Mientras estaba en la cola, OTRO dispositivo escribió ese documento
        → al drenar sale CONFLICTO y lo del otro SIGUE EN LA BASE.
        Contra una cola que drenara con upsert —el atajo fácil— lo del otro
        desaparece y esta prueba se pone roja. Es la que impide que la cola se
        convierta en last-write-wins por la puerta de atrás.

   Y la tercera, que es de aislamiento y no de durabilidad:

     3. Lo que A dejó en cola NO se escribe en la cuenta de B cuando B entra en
        el mismo navegador. La RLS de la base no para esto: la petición iría
        firmada con el token de B y sería legítima para Postgres. Se para aquí o
        no se para en ningún sitio. */
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

const fila = (uid, path) => nube.filas.get(uid + '|' + path);
const rotulo = p => p.evaluate(() => document.getElementById('saveState').textContent);
const pie = p => p.evaluate(() => document.getElementById('footerStore').textContent);
const enCola = p => p.evaluate(() => (window.FUT && FUT.cola ? FUT.cola() : []));

async function abre(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 3000);
  return p;
}
const vuelveLaRed = async p => { nube.caida = false; await p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(p, 60, 3000); await p.waitForTimeout(1200); };

/* ════════════════════════════════════════════════════════════════════════════ */
console.log('\n═══ 1 · sin red, el cambio se queda EN EL DISPOSITIVO, no en memoria ═══');
const ctxA = await nav.newContext();
const uidA = await d.conSesion(ctxA, 'cola@ejemplo.com');
let pA = await abre(ctxA);
d.siembra(uidA, 'trades/t1', { id: 't1', type: 'futuros', instrument: 'MNQ', direction: 'long', entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00', notes: 'original' });
await vuelveLaRed(pA);
ok(fila(uidA, 'trades/t1').version === 1, 'la operación sembrada está en la base, versión 1');

nube.caida = true;
await pA.evaluate(() => FUT.updateTrade('t1', { notes: 'escrito en el metro' }));
await quieto(pA, 60, 2500); await pA.waitForTimeout(900);

ok(fila(uidA, 'trades/t1').data.notes === 'original', 'sin red la base NO cambió, como debe ser', fila(uidA, 'trades/t1').data.notes);
const c1 = await enCola(pA);
ok(c1.length === 1 && c1[0].ruta === 'trades/t1', 'y el cambio está en la cola, con su ruta', JSON.stringify(c1.map(r => r.ruta)));
ok(c1[0] && c1[0].op === 'set' && c1[0].dato && c1[0].dato.notes === 'escrito en el metro', 'con el documento entero, no un parche', c1[0] && c1[0].dato && c1[0].dato.notes);
ok(!/sincronizado/i.test(await rotulo(pA)), 'el rótulo NO dice sincronizado', await rotulo(pA));
ok(/cola/i.test(await rotulo(pA)) || /cola/i.test(await pie(pA)), 'y dice que hay algo en cola', await rotulo(pA));
ok(!/se pierden/i.test(await pie(pA)), 'y NO amenaza con perderlo, porque ya no se pierde', (await pie(pA)).slice(0, 120));

/* La prueba de verdad: que esté en IndexedDB y no en una variable. */
const enDisco = await pA.evaluate(() => new Promise(res => {
  const q = indexedDB.open('cabina-cola', 1);
  q.onsuccess = () => { const t = q.result.transaction('pendientes', 'readonly').objectStore('pendientes').getAll(); t.onsuccess = () => res(t.result.map(r => r.ruta)); t.onerror = () => res(null); };
  q.onerror = () => res(null);
}));
ok(Array.isArray(enDisco) && enDisco.includes('trades/t1'), 'y está EN INDEXEDDB, no en una variable de la página', JSON.stringify(enDisco));

console.log('\n═══ 2 · LA ASERCIÓN QUE DECIDE: cerrar la pestaña y volver ═══');
await pA.close();                       // se cierra la pestaña, sigue sin red
pA = await abre(ctxA);                  // se vuelve a abrir, mismo navegador
await pA.waitForTimeout(800);
const c2 = await enCola(pA);
ok(c2.length === 1 && c2[0].ruta === 'trades/t1', 'tras cerrar y volver a abrir, el cambio SIGUE en la cola', JSON.stringify(c2.map(r => r.ruta)));

await vuelveLaRed(pA);
const fFin = fila(uidA, 'trades/t1');
ok(fFin.data.notes === 'escrito en el metro',
   'y al volver la red LLEGA A LA BASE (antes de esto se perdía al cerrar la pestaña)', fFin.data.notes);
ok(fFin.version === 2, 'con la versión subida por la base, no por el cliente', fFin.version);
ok((await enCola(pA)).length === 0, 'la cola queda vacía: sólo sale con éxito confirmado');
ok(await rotulo(pA) === 'sincronizado', 'y ahora sí: sincronizado', await rotulo(pA));

console.log('\n═══ 3 · LA OTRA QUE DECIDE: drenar NO puede pisar a otro dispositivo ═══');
nube.caida = true;
await pA.evaluate(() => FUT.updateTrade('t1', { notes: 'lo que escribí sin red' }));
await quieto(pA, 60, 2500); await pA.waitForTimeout(900);
ok((await enCola(pA)).length === 1, 'hay un cambio esperando en la cola');

/* Mientras tanto, otro dispositivo escribe ese mismo documento. */
const vNueva = d.escribeOtro(uidA, 'trades/t1', Object.assign({}, fila(uidA, 'trades/t1').data, { notes: 'lo que escribió el otro teléfono' }));
ok(vNueva === 3, 'otro dispositivo escribe y la base va por la 3', vNueva);

await vuelveLaRed(pA);
const fConf = fila(uidA, 'trades/t1');
/* ESTA ES LA QUE NO PUEDE PASAR CON UPSERT. */
ok(fConf.data.notes === 'lo que escribió el otro teléfono',
   'al drenar, la base CONSERVA lo del otro: la cola no pisa (con upsert diría «lo que escribí sin red»)', fConf.data.notes);
ok(/CONFLICTO/.test(await rotulo(pA)), 'y se levanta como CONFLICTO, no como éxito', await rotulo(pA));
const c3 = await enCola(pA);
ok(c3.length === 1 && c3[0].estado === 'conflicto',
   'la copia pendiente SIGUE en la cola marcada conflicto: sin ella no se podría decidir', JSON.stringify(c3.map(r => r.estado)));

/* Resolver el conflicto quedándose con lo propio limpia la cola. */
await pA.waitForTimeout(400);
if (await pA.evaluate(() => document.getElementById('ov').classList.contains('open'))) {
  await pA.selectOption('#ef_elijo', 'mio');
  await pA.click('#edSave');
  await quieto(pA, 60, 2500); await pA.waitForTimeout(900);
  ok(fila(uidA, 'trades/t1').data.notes === 'lo que escribí sin red', 'resuelto a favor de lo propio, la base lo toma', fila(uidA, 'trades/t1').data.notes);
  ok((await enCola(pA)).length === 0, 'y la entrada de la cola se cierra con él: no queda ruido marcado para siempre');
} else {
  ok(false, 'el diálogo de conflicto debería abrirse al drenar');
}

console.log('\n═══ 4 · la cola es de su dueño: lo de A no se escribe en la cuenta de B ═══');
nube.caida = true;
await pA.evaluate(() => FUT.updateTrade('t1', { notes: 'secreto de A, sin enviar' }));
await quieto(pA, 60, 2500); await pA.waitForTimeout(900);
ok((await enCola(pA)).length === 1, 'A deja un cambio en cola y se va');
await pA.close();

/* B entra EN EL MISMO NAVEGADOR: mismo origen, misma IndexedDB. */
const uidB = await d.conSesion(ctxA, 'otro@ejemplo.com');
const pB = await abre(ctxA);
await vuelveLaRed(pB);
await pB.waitForTimeout(1200);

ok(!fila(uidB, 'trades/t1'), 'B NO tiene la operación de A en su cuenta: la cola no se drenó al dueño equivocado', fila(uidB, 'trades/t1') ? JSON.stringify(fila(uidB, 'trades/t1').data) : 'no existe');
ok((await enCola(pB)).length === 0, 'y B no ve nada en su cola: lo de A no es suyo');
ok(fila(uidA, 'trades/t1').data.notes === 'lo que escribí sin red', 'la cuenta de A tampoco se tocó desde la sesión de B', fila(uidA, 'trades/t1').data.notes);

/* Y lo de A sigue ahí para cuando A vuelva: no se borra por ser de otro. */
const sobrevive = await pB.evaluate(() => new Promise(res => {
  const q = indexedDB.open('cabina-cola', 1);
  q.onsuccess = () => { const t = q.result.transaction('pendientes', 'readonly').objectStore('pendientes').getAll(); t.onsuccess = () => res(t.result.map(r => r.ruta)); t.onerror = () => res(null); };
  q.onerror = () => res(null);
}));
ok(Array.isArray(sobrevive) && sobrevive.includes('trades/t1'), 'y lo de A sigue guardado, esperando a que A vuelva: no se tira por ser de otro', JSON.stringify(sobrevive));
await pB.close();

console.log('\n═══ 5 · sin cuenta no hay cola, porque no hay red que pueda fallar ═══');
const ctxC = await nav.newContext();
const pC = await abre(ctxC);
await pC.waitForTimeout(600);
ok(await pC.evaluate(() => !FUT.cola || FUT.cola().length === 0), 'sin sesión, la cola está vacía');
ok(/local/i.test(await rotulo(pC)), 'y el rótulo sigue diciendo guardado local', await rotulo(pC));
/* Sin cuenta la base ni siquiera debería existir. Se abre con `onupgradeneeded`
   propio para no CREARLA aquí por accidente —eso convertiría la prueba en la
   causa de lo que mide— y se distingue «no hay base» de «hay base vacía»:
   las dos valen, cualquier otra cosa no. */
await pC.waitForLoadState('load');
const sinIdb = await pC.evaluate(() => new Promise(res => {
  let nueva = false;
  const q = indexedDB.open('cabina-cola');
  q.onupgradeneeded = () => { nueva = true; };
  q.onerror = () => res('error');
  q.onsuccess = () => {
    const db = q.result;
    if (nueva || !db.objectStoreNames.contains('pendientes')) { db.close(); indexedDB.deleteDatabase('cabina-cola'); return res('no existe'); }
    const t = db.objectStore ? null : null;
    const r = db.transaction('pendientes', 'readonly').objectStore('pendientes').getAll();
    r.onsuccess = () => res(r.result.length);
    r.onerror = () => res('error');
  };
}));
ok(sinIdb === 'no existe' || sinIdb === 0, 'y sin cuenta no se escribió nada en IndexedDB', sinIdb);
await pC.close();

console.log('\n═══ 6 · ningún error de página en todo el recorrido ═══');
ok(errs.length === 0, 'la consola no soltó ningún error', errs.slice(0, 3).join(' | ') || 'limpio');

await nav.close();
srv.close();
console.log(`\n${fallos.length ? '❌ ' + fallos.length + ' fallo(s)' : '✅ todo en pie'}\n`);
process.exit(fallos.length ? 1 : 0);
