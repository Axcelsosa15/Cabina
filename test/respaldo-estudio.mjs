/* Respaldo portátil: también las capturas propias de ESTUDIO, sin depender del bucket. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { nubeDoble } from './nube-doble.mjs';
import { quieto } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t) => { console.log(`  ${c ? '✅' : '❌'} ${t}`); if (!c) fallos.push(t); };
const url = new URL('../index.html', import.meta.url);
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

  const ultimoCompleto = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cabina:last-backup:')).map(k => localStorage.getItem(k)));
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
  const stamp = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cabina:last-backup:')).map(k => localStorage.getItem(k)));
  ok(stamp.length === 1 && JSON.stringify(stamp) === JSON.stringify(ultimoCompleto), 'la copia parcial no actualiza el último respaldo completo');
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
} finally { await browser.close(); }
console.log(`\n  fallos: ${fallos.length}`);
process.exitCode = fallos.length ? 1 : 0;
