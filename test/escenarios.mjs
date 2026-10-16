/* ESCENARIOS · los tres momentos de un trade, con sus capturas, dentro de ESTUDIO.

   Lo que esta suite defiende, y que no se ve mirando la pantalla:

   1. Las ranuras existen y son las acordadas: contexto alto (1D/4H/1H), entrada
      (1H/30m/15m/3m) y después (salida / qué hizo después). Nueve en total.
   2. Una captura de escenario va al MISMO bucket privado que las del journal y
      cuelga de la carpeta del dueño de la sesión.
   3. El trade de FUTUROS NO se toca: la imagen queda en el documento de revisión
      de `research`, asociada por tradeId. Ese es el requisito que separa ESTUDIO
      de un segundo journal, y el que se rompería sin darse cuenta.
   4. Se guarda sola: la captura ya está subida: si el documento no la anota, el
      objeto queda huérfano en el bucket y nadie vuelve a verlo.
   5. Quitarla la saca del bucket y del documento.
   6. Sin cuenta no se ofrece un botón que no puede funcionar.

   Contra el doble de test/nube-doble.mjs, como capturas.mjs. */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';
import { readFileSync } from 'node:fs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const URL_APP = 'file://' + join(raiz, 'index.html');
const D = nubeDoble(html);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const nav = await chromium.launch();
const errs = [], csp = [];
async function abre(email) {
  const ctx = await nav.newContext();
  await ctx.exposeBinding('__violacion', (_, v) => csp.push(v));
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__violacion(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline'))));
  const uid = email ? await D.conSesion(ctx, email) : null;
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL_APP, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 2500);
  return { ctx, p, uid };
}
/* Selecciona la primera operación del explorador de ESTUDIO. */
async function enEstudio(p) {
  await p.click('.tabbtn[data-tab="estudio"]');
  await p.waitForSelector('#studyTradeList [data-study-trade]', { timeout: 8000 });
  await p.click('#studyTradeList [data-study-trade]');
  await p.waitForSelector('#studyScenes [data-escena-add], #studyScenes .study-note', { timeout: 5000 });
  await quieto(p);
}
const RANURA = k => `#studyScenes button[data-escena-add="${k}"]`;

console.log('\n═══ RANURAS · los tres momentos, con sus temporalidades ═══');
const ana = await abre('ana@prueba.invalid');
await ana.p.evaluate(() => FUT.createTrade({ instrument: 'MNQ', date: '2026-09-18', time: '10:00', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 }));
await quieto(ana.p);
await enEstudio(ana.p);
const ranuras = await ana.p.$$eval('#studyScenes [data-escena-add]', bs => bs.map(b => b.dataset.escenaAdd));
ok(ranuras.length === 9, 'hay nueve ranuras de captura', ranuras.join(' '));
ok(['htf:1D', 'htf:4H', 'htf:1H'].every(k => ranuras.includes(k)), 'contexto alto: diario, 4 horas y 1 hora');
ok(['entrada:1H', 'entrada:30m', 'entrada:15m', 'entrada:3m'].every(k => ranuras.includes(k)), 'entrada: 1 hora, 30, 15 y 3 minutos');
ok(['post:salida', 'post:despues'].every(k => ranuras.includes(k)), 'después del trade: salida y qué hizo después');

console.log('\n═══ SUBIR · al bucket de la cuenta, no al trade ═══');
const [fc] = await Promise.all([ana.p.waitForEvent('filechooser'), ana.p.click(RANURA('htf:1D'))]);
await fc.setFiles({ name: 'diario.png', mimeType: 'image/png', buffer: PNG });
await ana.p.waitForSelector('#studyScenes figure.pbimg', { timeout: 5000 });
await quieto(ana.p);
const claves = [...D.e.objetos.keys()];
ok(claves.length === 1, 'la imagen llegó al bucket', claves.join(', '));
ok(claves[0] && claves[0].startsWith(ana.uid + '/'), 'y cuelga de la carpeta de su dueña', claves[0]);
ok(await ana.p.evaluate(() => !FUT.trades().some(t => t.images && t.images.length)), 'el trade de FUTUROS sigue sin capturas: ESTUDIO no lo modifica');
const fila = D.filasDe(ana.uid).find(f => /^research\//.test(f.path));
const escenas = fila && fila.data && fila.data.scenes;
ok(!!escenas && Array.isArray(escenas['htf:1D']) && escenas['htf:1D'].length === 1,
  'la revisión guarda la captura en la ranura del diario', JSON.stringify(escenas || null));
ok(escenas && escenas['htf:1D'][0].id === claves[0].split('/')[1], 'guarda el id del objeto, no la imagen');
ok(escenas && !escenas['htf:1D'][0].data, 'nada de data URI dentro del documento');
ok(fila && String(fila.data.tradeId) === String(await ana.p.evaluate(() => FUT.trades()[0].id)), 'y queda asociada al tradeId original');
ok(/añadida/i.test(await ana.p.textContent('#studyTradeSaveState')), 'la app confirma el guardado sin pulsar nada');

console.log('\n═══ VOLVER · otra sesión la encuentra en su ranura ═══');
const ana2 = await abre('ana@prueba.invalid');
await enEstudio(ana2.p);
await ana2.p.waitForFunction(() => { const i = document.querySelector('#studyScenes figure.pbimg img'); return i && /^blob:/.test(i.src); }, null, { timeout: 8000 }).catch(() => {});
const vista = await ana2.p.evaluate(() => {
  const f = document.querySelector('#studyScenes figure.pbimg');
  const i = f && f.querySelector('img');
  return i ? { ranura: f.dataset.escenaFig, src: i.src.slice(0, 5), w: i.naturalWidth } : null;
});
ok(vista && vista.ranura === 'htf:1D', 'la captura vuelve a la ranura del diario', JSON.stringify(vista));
ok(vista && vista.src === 'blob:' && vista.w === 1, 'se pide al bucket con token y el navegador la decodifica');

console.log('\n═══ QUITAR · sale del documento y del bucket ═══');
const rm = '#studyScenes button[data-escena-rm="htf:1D"]';
await ana2.p.click(rm); await ana2.p.click(rm).catch(() => {});
await quieto(ana2.p, 60, 3000);
ok(D.e.objetos.size === 0, 'el objeto ya no está en el bucket', `${D.e.objetos.size} objetos`);
const tras = D.filasDe(ana2.uid).find(f => /^research\//.test(f.path));
ok(tras && (!tras.data.scenes || !tras.data.scenes['htf:1D']), 'y la revisión ya no la referencia', JSON.stringify(tras ? tras.data.scenes : null));

console.log('\n═══ ERRORES · lo que el bucket rechaza se dice ═══');
const [fc2] = await Promise.all([ana2.p.waitForEvent('filechooser'), ana2.p.click(RANURA('entrada:3m'))]);
await fc2.setFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
await quieto(ana2.p);
ok(D.e.objetos.size === 0, 'un fichero que no es imagen no se sube');
ok(/solo imágenes/.test(await ana2.p.textContent('#studyTradeSaveState')), 'y la ficha dice por qué');

console.log('\n═══ SIN CUENTA · no se ofrece lo que no puede funcionar ═══');
const local = await abre(null);
await local.p.evaluate(() => FUT.createTrade({ instrument: 'MNQ', date: '2026-09-18', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 }));
await quieto(local.p);
await enEstudio(local.p);
ok(await local.p.locator('#studyScenes [data-escena-add]').count() === 0, 'sin cuenta no hay botón de añadir');
ok(/Entra con tu cuenta para adjuntar capturas/.test(await local.p.textContent('#studyScenes')), 'y dice por qué');

ok(csp.length === 0, 'ninguna violación de CSP', csp.join(' | ') || 'ninguna');
ok(errs.length === 0, 'ningún error de página', errs.length ? errs.join(' | ') : 'sin pageerror');
await nav.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
