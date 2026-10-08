/* DOS DISPOSITIVOS, UN DOCUMENTO · lo que pasa cuando los dos escriben.
   ─────────────────────────────────────────────────────────────────────────────
   Hasta la fase 2 la app escribía con un upsert SIN CONDICIÓN
   (`POST ?on_conflict=user_id,path` + `resolution=merge-duplicates`): la base no
   miraba nada antes de escribir, así que el último que llegaba ganaba, el otro
   cambio desaparecía, y NADIE lo detectaba. El rótulo seguía diciendo
   «sincronizado».

   Esto conduce la app real contra el doble de Supabase y exige el resultado del
   encargo:

     A lee v5 · B lee v5 · A escribe (v6) · B intenta escribir con v5
       →  A ÉXITO  ·  B CONFLICTO
     y nunca  A ÉXITO · B ÉXITO  con los cambios de A destruidos.

   LA PRUEBA TIENE QUE PODER FALLAR contra el comportamiento anterior, o no prueba
   nada: por eso no se mira sólo que el rótulo diga «CONFLICTO», se mira que el
   DATO DE A SIGA EN LA BASE. Un sistema last-write-wins pasa la primera
   comprobación si alguien pinta la palabra y falla ésta.

   El doble habla el protocolo real: PATCH con `?version=eq.N` y
   `Prefer: return=representation`, que devuelve las filas afectadas; cero filas es
   el conflicto. Y LA VERSIÓN LA PONE EL SERVIDOR, nunca el cuerpo. Lo mismo,
   contra Postgres de verdad, está en `test/db.mjs` y
   `supabase/pruebas/concurrencia.sql`. */
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

const OP = (id, nota) => ({ id, type: 'futuros', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00', notes: nota });

async function dispositivo(email) {
  const ctx = await nav.newContext();
  const uid = await d.conSesion(ctx, email);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 3000);
  return { ctx, p, uid };
}
const fila = (uid, path) => nube.filas.get(uid + '|' + path);
const rotulo = p => p.evaluate(() => document.getElementById('saveState').textContent);
const pie = p => p.evaluate(() => document.getElementById('footerStore').textContent);

console.log('\n═══ 1 · la base lleva versión, y la pone ella ═══');
const A = await dispositivo('dos@ejemplo.com');
d.siembra(A.uid, 'trades/t1', OP('t1', 'original'));
await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
await quieto(A.p, 60, 2500);
ok(fila(A.uid, 'trades/t1').version === 1, 'la fila sembrada está en versión 1', fila(A.uid, 'trades/t1').version);
await A.p.evaluate(() => FUT.updateTrade('t1', { notes: 'escrito por A' }));
await quieto(A.p, 60, 2500); await A.p.waitForTimeout(600);
const f1 = fila(A.uid, 'trades/t1');
ok(f1.data.notes === 'escrito por A', 'A escribe y la base lo tiene', f1.data.notes);
ok(f1.version === 2, 'y la versión sube a 2 SIN que el cliente la mande', f1.version);
ok(await rotulo(A.p) === 'sincronizado', 'el rótulo dice sincronizado, porque lo está', await rotulo(A.p));

console.log('\n═══ 2 · EL CASO DEL ENCARGO: A gana, B tiene CONFLICTO ═══');
/* Un segundo dispositivo del MISMO usuario. Lee lo que hay (versión 2). */
const B = await dispositivo('dos@ejemplo.com');
await quieto(B.p, 60, 2500);
ok(await B.p.evaluate(() => !!FUT.trades().find(t => t.id === 't1')), 'B ve la operación');

/* A escribe otra vez: la base pasa a 3. B sigue creyendo que está en 2. */
await A.p.evaluate(() => FUT.updateTrade('t1', { notes: 'Setup validado' }));
await quieto(A.p, 60, 2500); await A.p.waitForTimeout(600);
ok(fila(A.uid, 'trades/t1').version === 3, 'A escribe «Setup validado» y la base va por la 3', fila(A.uid, 'trades/t1').version);

/* B intenta escribir con la versión vieja. */
await B.p.evaluate(() => FUT.updateTrade('t1', { notes: 'Setup rechazado' }));
await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);

const fB = fila(A.uid, 'trades/t1');
/* LA ASERCIÓN QUE NO PUEDE PASAR CON LAST-WRITE-WINS. */
ok(fB.data.notes === 'Setup validado',
   'la base conserva lo de A: B NO lo pisó (con last-write-wins diría «Setup rechazado»)', fB.data.notes);
ok(/CONFLICTO/.test(await rotulo(B.p)), 'y B ve CONFLICTO en el rótulo', await rotulo(B.p));
ok(!/sincronizado/i.test(await rotulo(B.p)), 'B NO dice «sincronizado» sobre algo que no se guardó', await rotulo(B.p));
ok(/otro dispositivo/i.test(await pie(B.p)), 'y el pie explica qué pasó, no sólo que falló', (await pie(B.p)).slice(0, 110));
ok(await rotulo(A.p) === 'sincronizado', 'A sigue sincronizado: su escritura fue la buena', await rotulo(A.p));

console.log('\n═══ 3 · el diálogo ofrece las dos versiones, y ninguna gana sola ═══');
/* NO HACE FALTA PULSAR NADA: el conflicto abre el diálogo solo. Es lo correcto —
   acabas de guardar, la escritura no ocurrió, y enterarte por un rótulo pequeño no
   es enterarte—. Lo único que lo frena es que ya haya otro diálogo abierto, para no
   robar una edición a medias; entonces el rótulo queda como la vía de entrada. */
await B.p.waitForTimeout(500);
const dlg = await B.p.evaluate(() => ({
  abierto: document.getElementById('ov').classList.contains('open'),
  titulo: (document.getElementById('edTitle') || {}).textContent || '',
  aqui: (document.getElementById('ef_aqui') || {}).value || '',
  alla: (document.getElementById('ef_alla') || {}).value || '',
  opciones: [...document.querySelectorAll('#ef_elijo option')].map(o => o.value),
}));
ok(dlg.abierto, 'el conflicto abre el diálogo solo: no hay que ir a buscarlo');
ok(/cambió en otro dispositivo/i.test(dlg.titulo), 'y dice qué pasó, en una frase', dlg.titulo);
ok(/Setup rechazado/.test(dlg.aqui), 'enseña LO DE AQUÍ', dlg.aqui.replace(/\s+/g, ' ').slice(0, 60));
ok(/Setup validado/.test(dlg.alla), 'y enseña LO DE LA CUENTA: las dos a la vista, sin un botón de por medio', dlg.alla.replace(/\s+/g, ' ').slice(0, 60));
ok(dlg.opciones.includes('mio') && dlg.opciones.includes('remoto'), 'con las dos salidas', dlg.opciones.join(','));
ok(dlg.opciones[0] === '', 'y NINGUNA preseleccionada: la app no elige por el usuario', JSON.stringify(dlg.opciones[0]));

console.log('\n═══ 4 · «mantener mis cambios» escribe encima, y queda sincronizado ═══');
await B.p.selectOption('#ef_elijo', 'mio');
await B.p.click('#edSave'); await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
const fM = fila(A.uid, 'trades/t1');
ok(fM.data.notes === 'Setup rechazado', 'ahora sí: la versión de B está en la base', fM.data.notes);
ok(fM.version === 4, 'sobre la versión que había, no sobre la que B creía', fM.version);
ok(await rotulo(B.p) === 'sincronizado', 'y el rótulo vuelve a sincronizado, que ahora es verdad', await rotulo(B.p));

console.log('\n═══ 5 · «usar la versión remota» descarta lo de aquí, y sólo si se pide ═══');
await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
await quieto(A.p, 60, 2500);
await A.p.evaluate(() => FUT.updateTrade('t1', { notes: 'A otra vez' }));
await quieto(A.p, 60, 2500); await A.p.waitForTimeout(600);
/* B vuelve a quedarse atrás: escribe con su versión vieja. */
await B.p.evaluate(() => FUT.updateTrade('t1', { notes: 'B que se descarta' }));
await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
ok(/CONFLICTO/.test(await rotulo(B.p)), 'B vuelve a conflicto', await rotulo(B.p));
await B.p.waitForTimeout(400);
await B.p.selectOption('#ef_elijo', 'remoto');
await B.p.click('#edSave'); await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
ok(fila(A.uid, 'trades/t1').data.notes === 'A otra vez',
   'la base conserva la de A, que es la que B eligió', fila(A.uid, 'trades/t1').data.notes);
ok(!/CONFLICTO/.test(await rotulo(B.p)), 'y el conflicto se cierra', await rotulo(B.p));

console.log('\n═══ 6 · BORRADO CONCURRENTE: A borra, B actualiza ═══');
d.siembra(A.uid, 'trades/t2', OP('t2', 'para borrar'));
await A.p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(A.p, 60, 2500);
await B.p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(B.p, 60, 2500);
ok(await B.p.evaluate(() => !!FUT.trades().find(t => t.id === 't2')), 'los dos ven t2');
await A.p.evaluate(() => FUT.deleteTrade('t2'));
await quieto(A.p, 60, 2500); await A.p.waitForTimeout(700);
ok(!fila(A.uid, 'trades/t2'), 'A la borra de la base');
await B.p.evaluate(() => FUT.updateTrade('t2', { notes: 'B escribe sobre una borrada' }));
await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
ok(!fila(A.uid, 'trades/t2'), 'la actualización de B NO resucita la fila borrada');
ok(/CONFLICTO/.test(await rotulo(B.p)), 'y B se entera: conflicto, no silencio', await rotulo(B.p));
await B.p.waitForTimeout(500);
ok(/se borró en otro dispositivo/i.test(await B.p.evaluate(() => (document.getElementById('edTitle') || {}).textContent || '')),
   'y el diálogo dice que se BORRÓ, que no es lo mismo que que cambió',
   await B.p.evaluate(() => (document.getElementById('edTitle') || {}).textContent || ''));
await B.p.keyboard.press('Escape'); await quieto(B.p, 60, 1500);

console.log('\n═══ 7 · BORRADO CONCURRENTE al revés: A actualiza, B borra ═══');
d.siembra(A.uid, 'trades/t3', OP('t3', 'original t3'));
await A.p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(A.p, 60, 2500);
await B.p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(B.p, 60, 2500);
await A.p.evaluate(() => FUT.updateTrade('t3', { notes: 'A la edita' }));
await quieto(A.p, 60, 2500); await A.p.waitForTimeout(700);
ok(fila(A.uid, 'trades/t3').data.notes === 'A la edita', 'A la edita en la base');
await B.p.evaluate(() => FUT.deleteTrade('t3'));
await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
/* EL BORRADO CIEGO ERA PEOR QUE EL UPDATE PERDIDO: se llevaba la edición de A y no
   dejaba nada que recuperar. */
ok(!!fila(A.uid, 'trades/t3'), 'el borrado de B NO se lleva la edición de A (antes sí)');
ok(fila(A.uid, 'trades/t3').data.notes === 'A la edita', 'y el texto de A sigue intacto', fila(A.uid, 'trades/t3').data.notes);
ok(/CONFLICTO/.test(await rotulo(B.p)), 'y B lo sabe', await rotulo(B.p));

console.log('\n═══ 8 · cerrar el diálogo no borra el conflicto, y hay botón para volver ═══');
/* Escape cierra el diálogo. El conflicto SIGUE: cerrarlo no decide nada, y si el
   rótulo volviera a «sincronizado» la app estaría mintiendo. La vía de vuelta es un
   BOTÓN DE VERDAD, no el rótulo disfrazado: el rótulo es una región viva
   (`role="status"`) que anuncia los cambios de estado a un lector de pantalla, y
   ponerle `role="button"` encima se lo quita. Así que se comprueban las dos cosas
   por separado: que el rótulo sigue siendo región viva, y que el botón existe,
   recibe foco y abre con Enter —que un <button> trae de serie—. */
await B.p.keyboard.press('Escape'); await quieto(B.p, 60, 1500); await B.p.waitForTimeout(200);
ok(!(await B.p.evaluate(() => document.getElementById('ov').classList.contains('open'))), 'Escape cierra el diálogo');
ok(/CONFLICTO/.test(await rotulo(B.p)), 'y el conflicto SIGUE: cerrar no es decidir', await rotulo(B.p));
const acc = await B.p.evaluate(() => {
  const el = document.getElementById('saveState'), b = document.getElementById('resolveConflict');
  return { rol: el.getAttribute('role'), vivo: el.getAttribute('aria-live'),
           hayBoton: !!b && !b.hidden, etiqueta: b ? b.textContent : null, tag: b ? b.tagName : null };
});
ok(acc.rol === 'status' && acc.vivo === 'polite',
   'el rótulo sigue siendo región viva: el estado se anuncia sin interrumpir', JSON.stringify(acc));
ok(acc.hayBoton && acc.tag === 'BUTTON', 'y con conflicto aparece un <button> de verdad', JSON.stringify(acc));
ok(/[Rr]esolver/.test(acc.etiqueta || ''), 'que dice lo que hace', acc.etiqueta);
await B.p.focus('#resolveConflict');
ok(await B.p.evaluate(() => document.activeElement.id === 'resolveConflict'), 'recibe el foco');
await B.p.keyboard.press('Enter'); await quieto(B.p, 60, 2500); await B.p.waitForTimeout(400);
ok(await B.p.evaluate(() => document.getElementById('ov').classList.contains('open')),
   'y Enter lo vuelve a abrir, sin un manejador de teclado escrito a mano');

console.log('\n═══ 9 · se resuelven de uno en uno, y el recuento dice cuántos quedan ═══');
/* A estas alturas hay DOS conflictos sin resolver: el borrado de §6 y el de §7. El
   rótulo los cuenta, y resolver uno deja el otro — que es lo correcto: cada
   documento es una decisión distinta y la app no puede tomarlas en bloque. */
ok(/CONFLICTO · 2/.test(await rotulo(B.p)), 'el rótulo cuenta los dos', await rotulo(B.p));
let vueltas = 0;
while (/CONFLICTO/.test(await rotulo(B.p)) && vueltas++ < 4) {
  if (!(await B.p.evaluate(() => document.getElementById('ov').classList.contains('open')))) {
    await B.p.focus('#resolveConflict'); await B.p.keyboard.press('Enter');
    await quieto(B.p, 60, 2000); await B.p.waitForTimeout(400);
  }
  await B.p.selectOption('#ef_elijo', 'remoto');
  await B.p.click('#edSave'); await quieto(B.p, 60, 2500); await B.p.waitForTimeout(900);
}
ok(vueltas === 2, 'hicieron falta dos decisiones, una por documento', `${vueltas} vueltas`);
const sinC = await B.p.evaluate(() => {
  const el = document.getElementById('saveState'), b = document.getElementById('resolveConflict');
  return { texto: el.textContent, rol: el.getAttribute('role'), boton: !!b && !b.hidden };
});
ok(!/CONFLICTO/.test(sinC.texto), 'el conflicto se resolvió', sinC.texto);
ok(sinC.rol === 'status', 'el rótulo nunca dejó de ser región viva', sinC.rol);
/* Y el botón se va. Un botón de «resolver conflicto» en una pantalla sin conflicto
   es una trampa: quien lo pulsa no entiende qué resolvió. */
ok(sinC.boton === false, 'y el botón de resolver desaparece cuando no hay nada que resolver', JSON.stringify(sinC));

console.log('\n═══ 10 · un conflicto de A no cruza a la sesión de B ═══');
/* P0 DE AISLAMIENTO. Si un conflicto pendiente sobreviviera al cambio de cuenta, el
   diálogo le ofrecería a B «mantener mis cambios» sobre un documento de A — y
   «mantener» ESCRIBE. Lo que lo impide es que entrar y salir RECARGAN la página, así
   que `conflictos` y las versiones leídas mueren con ella; aquí se afirma, porque
   depender de eso sin comprobarlo es depender de un comentario. */
{
  const C = await dispositivo('otro@ejemplo.com');
  d.siembra(C.uid, 'trades/t9', OP('t9', 'de C'));
  await C.p.evaluate(() => window.dispatchEvent(new Event('online'))); await quieto(C.p, 60, 2500);
  /* Otro dispositivo de C escribe: la versión que esta pestaña tiene queda vieja. */
  d.escribeOtro(C.uid, 'trades/t9', Object.assign({}, OP('t9', 'cambiado por otro'), { id: 't9' }));
  await C.p.evaluate(() => FUT.updateTrade('t9', { notes: 'C escribe y choca' }));
  await quieto(C.p, 60, 2500); await C.p.waitForTimeout(900);
  ok(/CONFLICTO/.test(await rotulo(C.p)), 'C tiene un conflicto pendiente', await rotulo(C.p));
  await C.p.keyboard.press('Escape'); await quieto(C.p, 60, 1500);

  /* Salir y entrar como otra persona en la MISMA pestaña. */
  await C.p.click('#cuentaBtn'); await quieto(C.p, 60, 2000);
  const recarga = C.p.waitForEvent('load', { timeout: 15000 }).catch(() => null);
  await C.p.click('#auSalir');
  await recarga;
  await C.p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(C.p, 60, 3000);
  ok(!/CONFLICTO/.test(await rotulo(C.p)),
     'al salir, el conflicto NO sigue colgado del rótulo', await rotulo(C.p));
  ok(await C.p.evaluate(() => !document.getElementById('ov').classList.contains('open')),
     'y no queda ningún diálogo abierto ofreciendo escribir el dato de otro');
  /* Y el documento de C en la base sigue siendo el que escribió el otro dispositivo:
     nada de la sesión que se cerró llegó a escribirse. */
  ok(fila(C.uid, 'trades/t9').data.notes === 'cambiado por otro',
     'el documento de C queda como estaba: la sesión cerrada no escribió nada',
     fila(C.uid, 'trades/t9').data.notes);
  await C.ctx.close();
}

console.log('\n═══ 11 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
