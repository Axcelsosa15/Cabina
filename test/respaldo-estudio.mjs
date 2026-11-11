/* Respaldo portátil: también las capturas propias de ESTUDIO, sin depender del bucket. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { nubeDoble } from './nube-doble.mjs';
import { quieto } from './espera.mjs';
import { sirvePublicado } from './publicado.mjs';

const fallos = [], errores = [];
/* El tercer argumento es el DATO, y faltaba: este `ok` sólo aceptaba (c, t), así
   que sus quince aserciones no podían enseñar lo que vieron ni al fallar. El
   resto de la suite lo imprime —ver contraste.mjs— y por eso un rojo de aquí en
   CI no se podía diagnosticar. */
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
/* SE SIRVE POR HTTP, no por file://. Medido el 2026-11-11, 50 corridas de cada
   forma intercaladas en la misma maquina: por file:// esta suite falla 9 veces,
   por HTTP ninguna (Fisher exacto, una cola, p = 0,0013). Con file:// la pagina
   recibe a veces un localStorage VACIO tras recargar —solo sobrevive la clave
   que el doble de nube replanta en cada carga— y la aplicacion arranca sin
   sesion: nube.ses null y state.nube false con el token presente y valido.
   Las otras 87 suites ya usan este servidor. */
const servidor = sirvePublicado();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
servidor.unref();
const url = new URL('http://127.0.0.1:' + servidor.address().port + '/');
const D = nubeDoble();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const data = 'data:image/png;base64,' + PNG.toString('base64');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const uid = await D.conSesion(ctx, 'respaldo-estudio@prueba.invalid');
  D.siembra(uid, 'trades/t1', { id: 't1', type: 'futuros', date: '2026-11-03', instrument: 'MNQ', direction: 'long', entry: 21000, exit: 21010, qty: 1, images: [{ id: 'trade-shot' }] });
  D.siembra(uid, 'research/r1', { id: 'r1', type: 'trade-review', tradeId: 't1', title: 'Revisión con captura propia', scenes: { 'htf:1D': [{ id: 'study-shot', caption: 'Contexto propio' }] } });
  D.siembra(uid, 'research/r2', { id: 'r2', type: 'brief', title: 'Tesis con tema', topic: 'Energía',
    thesis: 'Tesis comprobable.', evidence: 'Hecho observado.', evidenceAgainst: 'Dato contrario.',
    openQuestions: '¿Qué dato falta?', conclusion: 'Interpretación.', speculation: 'Supuesto pendiente.' });
  D.siembra(uid, 'credo/c1', { id: 'c1', title: 'Mi regla' });
  for (const id of ['trade-shot', 'study-shot']) D.e.objetos.set(uid + '/' + id, { tipo: 'image/png', bytes: PNG });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(url.href);
  await p.waitForFunction(() => window.FUT && FUT.trades().length === 1);
  await quieto(p, 100, 2000);
  await p.click('[data-tab="ajustes"]');
  await p.click('#settingsTabData');
  await p.click('#bkExportOpen');
  ok(/2 capturas/.test(await p.textContent('#bkMeta')), 'el resumen cuenta también la captura exclusiva de ESTUDIO');
  await p.locator('#bkImgs').check();
  async function exporta() {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bkExport')]);
    const b = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    await p.waitForFunction(() => !document.getElementById('bkExport').disabled);
    return b;
  }
  const copia = await exporta();
  ok(copia.trades.t1.images[0].data === data, 'el trade conserva los bytes de su imagen');
  ok(copia.research.r1.scenes['htf:1D'][0].data === data, 'la escena de ESTUDIO lleva los bytes, no solo el id remoto');
  ok(copia.imagesInlined.total === 2 && copia.imagesInlined.failed === 0, 'la cobertura de capturas incluye ambas colecciones');
  ok(copia.counts.research === 2 && copia.counts.credo === 1, 'los sellos cuentan investigación y reglas personales');
  ok(copia.research.r2.topic === 'Energía' && copia.research.r2.speculation === 'Supuesto pendiente.',
    'el respaldo exporta el tema y la especulación separados');
  ok(!D.filasDe(uid).find(f => f.path === 'research/r1').data.scenes['htf:1D'][0].data, 'exportar no modifica el documento remoto');

  const ultimoCompleto = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cabina:last-backup:')).sort().map(k => [k, localStorage.getItem(k)]));
  D.e.objetos.set(uid + '/study-shot', { tipo: 'image/png', bytes: Buffer.alloc(0) });

  // Otra sesión no conserva los blobs en memoria: un archivo vacío debe dar un respaldo parcial explícito.
  await p.reload();
  await p.waitForFunction(() => window.FUT && FUT.trades().length === 1);
  await p.click('[data-tab="ajustes"]');
  await p.click('#settingsTabData');
  await p.click('#bkExportOpen');
  await p.locator('#bkImgs').check();
  const parcial = await exporta();
  ok(parcial.imagesInlined.failed === 1, 'una captura de cero bytes cuenta como fallo');
  ok(await p.locator('#bkExportStatus').evaluate(el => el.classList.contains('bad')), 'la copia parcial se marca como advertencia');
  ok(await p.locator('#bkRetry').isVisible(), 'la copia parcial permite reintentar');
  const stamp = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cabina:last-backup:')).sort().map(k => [k, localStorage.getItem(k)]));
  /* ESTA FILA SALÍA EN ROJO SIN DECIR QUÉ VIO, y es una conjunción de dos
     condiciones: que haya UNA sola clave y que su valor no haya cambiado. Falló
     dos veces en CI —corridas 42188371037 y 42200130814, las dos sobre
     feature/visual-themes-v2— y el log sólo imprimía el nombre, así que no se
     podía saber si sobraba una clave o si el sello se había movido.

     YA LO DIJO, y la respuesta no era ninguna de las dos: «antes [[clave,
     sello]] · después []». La clave NO ESTÁ en esa lectura. Ni sobra una ni se
     movió el valor: no hay ninguna. Medido el 2026-11-06 en la corrida
     42297093684 y en 3 de 38 corridas locales (≈8 %).

     Y aquí hay que corregir lo que este comentario decía antes. Decía «Pasa en
     local, también bajo carga: 6 de 6», y es falso: reproduce en local, 1 de 6
     sobre 6f7fb48 y 1 de 6 sobre 8e2fd1d, 3 de 12 en otra tanda y 0 de 26
     después. Esa frase se escribió sobre seis corridas, que para un fallo del
     8 % es no haber mirado: 0.92^6 = 61 % de no verlo nunca.

     Descartado por medición, para que nadie lo vuelva a recorrer: NO es una
     carrera de identidad tras recargar (`nube.ses` y `state.nube` se asignan
     sincrónicamente desde localStorage al arrancar, app.js:15953); NO es el
     orden de escritura (el sello sólo se escribe si la copia es completa, y
     antes de que el botón se reactive); NO es durabilidad de localStorage en
     `file://` (escribir y recargar sin pausa: 0 pérdidas de 40); NO la borra la
     app (4 `removeItem`, ninguno sobre esta clave, y nadie recorre las claves);
     NO la tira una navegación de la descarga (`bkDownload` tiene un camino).
     Tampoco es carga: 0 de 8 con la máquina saturada.

     La causa sigue SIN establecer. Sin el dato no había nada que investigar.
     Y se leen las CLAVES además de los valores porque la clave lleva el uid de
     la sesión —`cabina:last-backup:v1:` + uid, o `local` sin nube—: si tras la
     recarga la sesión aún no se ha restablecido, el sello se buscaría bajo otra
     clave, y leyendo sólo valores eso es invisible. La condición no se relaja:
     sigue exigiendo una clave y el mismo valor. */
  ok(stamp.length === 1 && JSON.stringify(stamp) === JSON.stringify(ultimoCompleto),
     'la copia parcial no actualiza el último respaldo completo',
     `antes ${JSON.stringify(ultimoCompleto)} · después ${JSON.stringify(stamp)}`);
  D.e.objetos.set(uid + '/study-shot', { tipo: 'image/png', bytes: PNG });
  const recuperada = await exporta();
  ok(recuperada.imagesInlined.failed === 0 && recuperada.research.r1.scenes['htf:1D'][0].data === data, 'el reintento recupera la captura y completa el respaldo');
  ok(!(await p.locator('#bkRetry').isVisible()), 'el reintento correcto limpia la advertencia');

  const local = await browser.newContext();
  const q = await local.newPage();
  q.on('pageerror', e => errores.push(e.message));
  await q.goto(url.href);
  await q.waitForFunction(() => !!window.FUT);
  await q.click('[data-tab="ajustes"]');
  await q.click('#settingsTabData');
  await q.locator('#panelDatos > .settings-details:not([open]) > summary').click();
  await q.click('#bkPaste');
  await q.locator('#edFields textarea').fill(JSON.stringify(copia));
  await q.click('#edSave');
  await q.locator('#ef_ok').fill('IMPORTAR');
  await q.click('#edSave');
  await q.waitForFunction(() => FUT.trades().length === 1);
  await q.reload();
  await q.waitForFunction(() => FUT.trades().length === 1);
  const restaurada = await q.evaluate(() => JSON.parse(localStorage.getItem('cabina-mnq:v1')));
  ok(restaurada.research.r1.scenes['htf:1D'][0].data === data, 'restaurar y recargar sin cuenta conserva la captura de ESTUDIO');
  ok(restaurada.research.r1.scenes['htf:1D'][0].caption === 'Contexto propio', 'se conserva la nota de la escena');
  ok(restaurada.research.r2.topic === 'Energía' && restaurada.research.r2.speculation === 'Supuesto pendiente.' &&
    restaurada.research.r2.evidence === 'Hecho observado.' && restaurada.research.r2.conclusion === 'Interpretación.',
    'restaurar y recargar conserva tema, hechos, interpretación y especulación');
  ok(restaurada.research.r2.thesis === 'Tesis comprobable.' && restaurada.research.r2.evidenceAgainst === 'Dato contrario.' &&
    restaurada.research.r2.openQuestions === '¿Qué dato falta?', 'la restauración conserva las secciones del brief');
  ok(errores.length === 0, 'sin errores de página: ' + errores.join(' | '));
} finally { await browser.close(); servidor.close(); }
console.log(`\n  fallos: ${fallos.length}`);
process.exitCode = fallos.length ? 1 : 0;
