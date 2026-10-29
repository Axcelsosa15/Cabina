/* VENTANA OPERATIVA · tu horario, no el del mercado.

   Hasta ahora la ventana estaba fija en el código: 8:30–11:00 AM ET, de lunes a
   viernes, escrita en tres sitios distintos (el pie de página, el permiso de la
   pre-sesión y la señal `fuera_ventana`). Quien opera en otro horario —un turno
   de noche, una tarde libre— tenía una cabina que le decía «fuera de la ventana»
   todos los días y un pie de página que mentía.

   Lo que esta prueba fija, y que es fácil de romper sin darse cuenta:

     · el valor POR DEFECTO es exactamente la ventana de antes. Un cambio que
       mejore la edición pero mueva el defecto cambia el pasado de todos;
     · la AUSENCIA del campo en una configuración vieja significa «nunca se
       tocó» y se lee como el defecto, sin escribir nada encima (protocolo 17);
     · una lista de días VACÍA se respeta: es una pausa deliberada, no un hueco
       que rellenar con lunes-a-viernes;
     · una ventana invertida NO se guarda y se dice QUÉ choca y qué cambiar
       antes. Mover el otro extremo «para hacer sitio» sería inventar una
       ventana que nadie pidió;
     · las SESIONES DEL MERCADO no se mueven con la ventana. NY AM es 8:30–11:00
       opere quien opere, y una operación vieja no cambia de sesión porque hoy
       operes por la tarde. Lo que sí se mueve —a propósito— es `fuera_ventana`,
       que significa «fuera de la ventana que TÚ pusiste».

   Su modo de fallo: una ventana configurable que, al configurarla, reescribe la
   historia del mercado o se come los días que el usuario quitó. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
/* SERVIA EL HTML PARA CUALQUIER RUTA. Con la aplicación dentro del documento
   daba igual; desde que la página pide `./app.js`, el navegador recibía HTML
   donde esperaba un script, lo rechazaba por MIME y la página no arrancaba.
   `sirvePublicado` sirve lo que sube Pages —leído del propio workflow— y 404
   para lo demás, que es lo que hace útil a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL_APP = () => `http://127.0.0.1:${srv.address().port}/`;

/* Viernes 18/09/2026, 10:20 ET: dentro de la ventana por defecto y en un día
   que por defecto es operativo. Las dos cosas que la prueba va a quitar. */
const F = new Date('2026-09-18T14:20:00Z').getTime();
const RELOJ = `{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`;

const b = await chromium.launch();
const errs = [];
const abre = async (semilla) => {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(RELOJ);
  if (semilla) await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(semilla))});}catch(e){}`);
  await p.goto(URL_APP(), { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1300);
  return p;
};

const p = await abre(null);
const vista = () => p.textContent('#winView');
const pie = () => p.evaluate(() => document.getElementById('footerWindow').textContent + ' · ' + document.getElementById('footerWindowDays').textContent);
const permiso = () => p.textContent('#goText');
const guardada = () => p.evaluate(() => { try { return JSON.stringify((JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}').settings || {}).window); } catch (e) { return 'ERR'; } });
const aviso = () => p.textContent('#preSaved');
/* El debounce de la configuración es de 500 ms: por debajo se mide el estado
   anterior y la prueba miente en verde (protocolo 24). */
const reposo = () => p.waitForTimeout(900);

console.log('\n═══ EL DEFECTO ES LA VENTANA DE SIEMPRE ═══');
ok(/8:30 AM–11:00 AM ET/.test(await vista()), 'la vista dice 8:30–11:00 AM ET', await vista());
ok(/lun–vie/.test(await vista()), 'de lunes a viernes');
ok(/Ventana operativa: 8:30 AM–11:00 AM ET/.test(await pie()), 'y el pie dice lo mismo', await pie());
ok(/ventana abierta/i.test(await permiso()), 'viernes 10:20 ET: la ventana está abierta', (await permiso()).slice(0, 70));

console.log('\n═══ SE EDITA, Y SÓLO EN MODO EDICIÓN ═══');
ok(!(await p.isVisible('#winStart')), 'las casillas no están a la vista por defecto');
await p.click('#editToggle'); await p.waitForTimeout(350);
ok(await p.isVisible('#winStart') && await p.isVisible('#winDays'), 'Editar las muestra');
await p.fill('#winEnd', '15:00'); await p.dispatchEvent('#winEnd', 'change'); await reposo();
await p.fill('#winStart', '13:00'); await p.dispatchEvent('#winStart', 'change'); await reposo();
ok(/1:00 PM–3:00 PM ET/.test(await vista()), 'la ventana nueva se pinta', await vista());
ok(/1:00 PM–3:00 PM ET/.test(await pie()), 'y llega al pie', await pie());
ok(/"start":780/.test(await guardada()) && /"end":900/.test(await guardada()), 'y se guarda en minutos ET', await guardada());

console.log('\n═══ UNA VENTANA DEL REVÉS NO ENTRA, Y SE DICE POR QUÉ ═══');
await p.fill('#winEnd', '12:00'); await p.dispatchEvent('#winEnd', 'change'); await reposo();
ok(/"end":900/.test(await guardada()), 'un cierre anterior a la apertura se rechaza', await guardada());
ok(/anterior a la apertura/.test(await aviso()) && /«desde»/.test(await aviso()), 'y el aviso nombra el choque y qué cambiar antes', (await aviso()).slice(0, 80));
await p.fill('#winStart', '16:00'); await p.dispatchEvent('#winStart', 'change'); await reposo();
ok(/"start":780/.test(await guardada()), 'una apertura posterior al cierre, igual', await guardada());
ok(/posterior al cierre/.test(await aviso()) && /«hasta»/.test(await aviso()), 'con su propio mensaje', (await aviso()).slice(0, 80));

console.log('\n═══ LOS DÍAS ═══');
await p.click('#winDays button[data-dia="5"]'); await reposo();
ok(/"days":\[1,2,3,4\]/.test(await guardada()), 'quitar el viernes lo quita', await guardada());
await p.click('#editDone'); await p.waitForTimeout(600);
ok(/no es día operativo/i.test(await permiso()), 'y hoy, viernes, deja de dar permiso', (await permiso()).slice(0, 100));
ok(/vuelve el lunes|para el lunes/.test(await permiso()), 'diciendo cuándo vuelve la ventana, no «el lunes» por costumbre');
ok(/lun–jue/.test(await pie()), 'el pie lo dice en cristiano', await pie());

console.log('\n═══ NINGÚN DÍA ES UN ESTADO, NO UN HUECO ═══');
await p.click('#editToggle'); await p.waitForTimeout(300);
for (const d of [1, 2, 3, 4]) { await p.click(`#winDays button[data-dia="${d}"]`); await p.waitForTimeout(220); }
await reposo();
ok(/"days":\[\]/.test(await guardada()), 'la lista vacía se respeta', await guardada());
ok(/ningún día/.test(await pie()), 'y se dice, no se rellena con lunes-a-viernes', await pie());

console.log('\n═══ LAS SESIONES DEL MERCADO NO SE MUEVEN ═══');
/* A las 10:20 ET la sesión que se prepara sigue siendo NY AM aunque la ventana
   del usuario esté ahora por la tarde: una cosa es el mercado y otra tu regla. */
ok(/NY AM/.test(await p.textContent('#checkMeta')), 'a las 10:20 ET se sigue preparando NY AM', await p.textContent('#checkMeta'));

console.log('\n═══ SOBREVIVE A RECARGAR ═══');
/* Se sigue en modo edición desde el bloque anterior. */
await p.click('#winDays button[data-dia="1"]'); await reposo();   // lunes vuelve
await p.click('#editDone');
await p.reload(); await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 }); await p.waitForTimeout(1300);
ok(/1:00 PM–3:00 PM ET · lun/.test(await vista()), 'la ventana editada vuelve igual', await vista());

console.log('\n═══ `fuera_ventana` SIGUE A TU VENTANA, NO A NY AM ═══');
const sen = await p.evaluate(() => {
  FUT.createAccount({ id: 'win1', firm: 'Prueba', name: 'Ventana', kind: 'Evaluación', size: 50000,
    dd: 2000, ddKind: 'estatico', target: 3000, limit: 40, status: 'activa', ledger: [], rules: {} });
  const base = { type: 'futuros', accountId: 'win1', instrument: 'MNQ', direction: 'long', qty: 1,
    entry: 20000, stop: 19990, target: 20020, exit: 19990, exitWhy: 'stop', plan: 'cumpli',
    invalida: 'cierre de 5m bajo 19990', cStruct: true, cPull: true, cWindow: true, cSize: true,
    quality: 'A', source: 'manual' };
  FUT.createTrade({ ...base, id: 'W_tarde', date: '2026-09-14', time: '13:30' });
  FUT.createTrade({ ...base, id: 'W_manana', date: '2026-09-15', time: '09:15' });
  const r = FUT.clasificaErrores('win1') || {};
  const de = id => ((r.porTrade || []).find(x => x.id === id) || { senales: [] }).senales.map(s => s.clave).join(',');
  return { tarde: de('W_tarde'), manana: de('W_manana') };
});
ok(!/fuera_ventana/.test(sen.tarde), '13:30, dentro de la ventana nueva: no se marca', sen.tarde || '(sin señales)');
ok(/fuera_ventana/.test(sen.manana), '09:15, que antes era la ventana buena: ahora sí se marca', sen.manana);

console.log('\n═══ UNA CONFIGURACIÓN VIEJA, SIN EL CAMPO ═══');
const q = await abre({ settings: { meta: { title: 'Cabina' }, rules: [], accounts: [], checks: [{ id: 'x', t: 'un paso', s: '' }] } });
ok(/8:30 AM–11:00 AM ET · lun–vie/.test(await q.textContent('#winView')), 'la ausencia se lee como la ventana de siempre', await q.textContent('#winView'));
const sinCampo = await q.evaluate(() => { try { return JSON.stringify((JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}').settings || {}).window); } catch (e) { return 'ERR'; } });
ok(sinCampo === undefined || sinCampo === 'undefined', 'y abrir no escribe la ventana encima de lo que ya había', String(sinCampo));

console.log('\n═══ SIN ERRORES DE PÁGINA ═══');
ok(errs.length === 0, 'ninguno', errs.join(' | ') || 'ninguno');

await b.close(); srv.close();
console.log(`\n  ${fallos.length} fallos${fallos.length ? ': ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
