/* T02 · LA RESPUESTA QUE NO LLEGA · un timeout después de una escritura que SÍ entró.

   El caso que la cola no distinguía: la petición sale, la base escribe, y la
   respuesta se pierde (wifi que cae a mitad, timeout). El cliente no sabe que
   entró, así que la encola y reintenta con la versión de antes. La base ya va
   una por delante: 0 filas, y eso se leía como «otro dispositivo lo cambió».
   Resultado medido antes del arreglo: un CONFLICTO contra tu propia escritura,
   con las dos versiones iguales delante.

   Lo que se exige ahora, y lo que NO se puede romper para conseguirlo:
     1 · mismo contenido ya en la base  → se da por guardado, sin segunda escritura
     2 · en la base está un intento MÍO anterior y aquí hay uno más nuevo → entra
     3 · crear con la respuesta perdida  → un documento, no dos, y sin conflicto
     4 · borrar con la respuesta perdida → borrado, sin conflicto
     5 · si quien escribió fue OTRO dispositivo, sigue siendo un conflicto

   Todo contra el doble de Supabase; ningún dato real. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';
import { quieto } from './espera.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const d = nubeDoble(html), nube = d.e;
const nav = await chromium.launch();

const fila = (uid, path) => nube.filas.get(uid + '|' + path);
const rotulo = p => p.evaluate(() => document.getElementById('saveState').textContent);
const enCola = p => p.evaluate(() => (window.FUT && FUT.cola ? FUT.cola() : []));
const conflicto = p => p.evaluate(() => !document.getElementById('resolveConflict').hidden || /CONFLICTO/.test(document.getElementById('saveState').textContent));
const escrituras = () => nube.pedidas.filter(x => /cabina_docs/.test(x.url || x) && /POST|PATCH|DELETE/.test(x.method || '')).length;
async function abre(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 3000);
  return p;
}
/* Empuja el drenaje y espera a que la cola se vacíe o a que salte un conflicto. */
const drena = async p => {
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => (window.FUT.cola().length === 0) || window.FUT.cola().some(r => r.estado === 'conflicto'), null, { timeout: 15000, polling: 100 }).catch(() => {});
  await quieto(p, 80, 2000);
};
const hasta = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000, polling: 100 }).catch(() => {});

try {
  const ctx = await nav.newContext();
  const uid = await d.conSesion(ctx, 'timeout@ejemplo.com');
  const p = await abre(ctx);
  d.siembra(uid, 'trades/t1', { id: 't1', type: 'futuros', instrument: 'MNQ', direction: 'long', entry: 20000, stop: 19990, exit: 20010, qty: 1, date: '2026-09-01', time: '10:00', notes: 'original' });
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await hasta(p, () => window.FUT.trades().some(t => t.id === 't1'));
  await quieto(p, 80, 2000);
  ok(fila(uid, 'trades/t1').version === 1, 'la operación sembrada está en la base, versión 1');

  console.log('\n═══ 1 · entró, pero la respuesta se perdió ═══');
  nube.pierdeRespuesta = 1;
  await p.evaluate(() => FUT.updateTrade('t1', { notes: 'una' }));
  await hasta(p, () => window.FUT.cola().length === 1);
  ok(fila(uid, 'trades/t1').data.notes === 'una' && fila(uid, 'trades/t1').version === 2, 'la base SÍ escribió (versión 2)', fila(uid, 'trades/t1').version);
  ok((await enCola(p)).length === 1, 'y el cliente, que no recibió respuesta, lo tiene en cola');
  ok(await rotulo(p) !== 'sincronizado', 'mientras tanto el rótulo no dice sincronizado', await rotulo(p));
  await drena(p);
  ok(!(await conflicto(p)), 'al reintentar NO se levanta un conflicto contra la propia escritura', await rotulo(p));
  ok((await enCola(p)).length === 0, 'la cola se vacía');
  ok(fila(uid, 'trades/t1').version === 2 && fila(uid, 'trades/t1').data.notes === 'una', 'sin una segunda escritura: la base sigue en la versión 2', fila(uid, 'trades/t1').version);
  ok(await rotulo(p) === 'sincronizado', 'y ahora sí: sincronizado', await rotulo(p));

  console.log('\n═══ 2 · respuesta perdida y, antes del reintento, otra edición ═══');
  nube.pierdeRespuesta = 1;
  await p.evaluate(() => FUT.updateTrade('t1', { notes: 'dos' }));
  await hasta(p, () => window.FUT.cola().length === 1);
  nube.caida = true;
  await p.evaluate(() => FUT.updateTrade('t1', { notes: 'tres' }));
  await quieto(p, 80, 2000); await p.waitForTimeout(700);
  ok(fila(uid, 'trades/t1').data.notes === 'dos' && fila(uid, 'trades/t1').version === 3, 'en la base está mi intento anterior («dos», versión 3)');
  const c = await enCola(p);
  ok(c.length === 1 && c[0].dato.notes === 'tres', 'y en la cola, lo último que escribí («tres»)', c[0] && c[0].dato && c[0].dato.notes);
  nube.caida = false;
  await drena(p);
  ok(!(await conflicto(p)), 'no hay conflicto: lo que había en la base lo envié yo');
  ok(fila(uid, 'trades/t1').data.notes === 'tres' && fila(uid, 'trades/t1').version === 4, 'lo más nuevo entra encima, condicionado a la versión leída', `${fila(uid, 'trades/t1').data.notes} v${fila(uid, 'trades/t1').version}`);
  ok((await enCola(p)).length === 0 && await rotulo(p) === 'sincronizado', 'cola vacía y sincronizado');

  console.log('\n═══ 3 · crear con la respuesta perdida: un documento, no dos ═══');
  nube.pierdeRespuesta = 1;
  const idNuevo = await p.evaluate(() => { const r = FUT.createTrade({ type: 'futuros', instrument: 'MNQ', direction: 'short', qty: 1, date: '2026-09-02', time: '10:30', pnl: -40 }); return r && (r.id || r); });
  await hasta(p, () => window.FUT.cola().length === 1);
  const rutasNuevas = () => Array.from(nube.filas.keys()).filter(k => k.startsWith(uid + '|trades/') && !k.endsWith('/t1'));
  ok(rutasNuevas().length === 1, 'la base creó el documento', rutasNuevas().length);
  await drena(p);
  ok(!(await conflicto(p)), 'el reintento no levanta conflicto');
  ok(rutasNuevas().length === 1 && nube.filas.get(rutasNuevas()[0]).version === 1, 'sigue habiendo UN documento, en su versión 1', rutasNuevas().length);
  ok(await p.evaluate(() => FUT.trades().filter(t => t.date === '2026-09-02').length) === 1, 'y una sola operación en la app');
  ok((await enCola(p)).length === 0, 'cola vacía');

  console.log('\n═══ 4 · borrar con la respuesta perdida ═══');
  nube.pierdeRespuesta = 1;
  await p.evaluate(id => FUT.deleteTrade(id), String(idNuevo));
  await hasta(p, () => window.FUT.cola().length === 1);
  ok(rutasNuevas().length === 0, 'la base borró el documento');
  await drena(p);
  ok(!(await conflicto(p)) && (await enCola(p)).length === 0, 'el reintento lo da por borrado: sin conflicto y sin pendientes');

  console.log('\n═══ 5 · si escribió OTRO dispositivo, sigue siendo un conflicto ═══');
  nube.caida = true;
  await p.evaluate(() => FUT.updateTrade('t1', { notes: 'lo mío' }));
  await quieto(p, 80, 2000); await p.waitForTimeout(700);
  const f = fila(uid, 'trades/t1');
  f.data = Object.assign({}, f.data, { notes: 'lo del otro teléfono' }); f.version++;
  nube.caida = false;
  await drena(p);
  ok(await conflicto(p), 'se levanta como CONFLICTO', await rotulo(p));
  ok(fila(uid, 'trades/t1').data.notes === 'lo del otro teléfono', 'y lo del otro dispositivo NO se pisó');
  const c5 = await enCola(p);
  ok(c5.length === 1 && c5[0].dato.notes === 'lo mío', 'mi versión sigue guardada para decidir');
  await ctx.close();
} catch (e) { fallos.push('excepción: ' + e.message); console.error(e); }
finally { await nav.close(); srv.close(); }
ok(errs.length === 0, 'la consola no soltó ningún error', errs.join(' | ') || null);
console.log(fallos.length ? `\nFAIL cola-timeout: ${fallos.length}` : '\nPASS cola-timeout');
process.exit(fallos.length ? 1 : 0);
