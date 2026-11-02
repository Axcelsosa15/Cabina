/* La versión de una edición offline debe sobrevivir al cierre de la pestaña.
   El servidor y la IndexedDB de esta prueba son datos sintéticos. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [], errors = [];
const ok = (c, t) => { console.log('  ' + (c ? '✅ ' : '❌ ') + t); if (!c) fallos.push(t); };
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/';
const browser = await chromium.launch();
const dato = note => ({ id: 't1', type: 'futuros', date: '2026-10-20', instrument: 'MNQ', pnl: 20, note });
const abre = async ctx => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => window.FUT && FUT.trades().length === 1);
  return p;
};
const enDisco = p => p.waitForFunction(() => new Promise(resolve => {
  const q = indexedDB.open('cabina-cola', 1);
  q.onsuccess = () => {
    const db = q.result, r = db.transaction('pendientes', 'readonly').objectStore('pendientes').getAll();
    r.onsuccess = () => { db.close(); resolve(r.result.length === 1); };
    r.onerror = () => { db.close(); resolve(false); };
  };
  q.onerror = () => resolve(false);
}));

try {
  for (const op of ['set', 'del']) {
    const ctx = await browser.newContext(), d = nubeDoble();
    const uid = await d.conSesion(ctx, 'cola-' + op + '@ejemplo.invalid');
    d.siembra(uid, 'trades/t1', dato('original'));
    let p = await abre(ctx);
    d.e.caida = true;
    await p.evaluate(op => op === 'set' ? FUT.updateTrade('t1', { note: 'COPIA OFFLINE' }) : FUT.deleteTrade('t1'), op);
    await enDisco(p);
    const version = await p.evaluate(() => new Promise(resolve => {
      const q = indexedDB.open('cabina-cola', 1);
      q.onsuccess = () => {
        const db = q.result, r = db.transaction('pendientes', 'readonly').objectStore('pendientes').getAll();
        r.onsuccess = () => { db.close(); resolve(r.result[0]?.versionBase ?? null); };
        r.onerror = () => { db.close(); resolve(null); };
      };
      q.onerror = () => resolve(null);
    }));
    ok(version === 1, op + ': la versión original queda en la cola durable');
    await p.close();
    d.escribeOtro(uid, 'trades/t1', dato('OTRO DISPOSITIVO'));
    d.e.caida = false;
    p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    const intento = p.waitForResponse(r => ['PATCH', 'DELETE'].includes(r.request().method()) && new URL(r.url()).searchParams.get('path') === 'eq.trades/t1');
    await p.goto(base, { waitUntil: 'load' });
    await intento;
    await p.waitForFunction(() => window.FUT && (/CONFLICTO/.test(document.getElementById('saveState').textContent) || FUT.cola().length === 0));
    const remoto = d.e.filas.get(uid + '|trades/t1');
    ok(remoto?.data.note === 'OTRO DISPOSITIVO', op + ': reabrir conserva la edición del otro dispositivo');
    const conflicto = await p.evaluate(() => /CONFLICTO/.test(document.getElementById('saveState').textContent));
    ok(conflicto, op + ': pide decidir, en vez de anunciar sincronización');
    if (conflicto) {
      await p.waitForFunction(() => document.getElementById('ef_alla')?.value.includes('OTRO DISPOSITIVO'));
      if (op === 'set') ok(await p.locator('#ef_aqui').inputValue().then(v => v.includes('COPIA OFFLINE')),
        'tras recargar, el diálogo conserva y muestra la copia offline');
      await p.selectOption('#ef_elijo', 'mio');
      await p.click('#edSave');
      await p.waitForFunction(() => FUT.cola().length === 0 && document.getElementById('saveState').textContent === 'sincronizado');
      const fin = d.e.filas.get(uid + '|trades/t1');
      ok(op === 'set' ? fin?.data.note === 'COPIA OFFLINE' : !fin,
        op + ': sólo la decisión explícita aplica la edición o el borrado pendiente');
    }
    await ctx.close();
  }
  // Una cola de una versión anterior de Cabina no trae versión base.
  const ctx = await browser.newContext(), d = nubeDoble();
  const uid = await d.conSesion(ctx, 'cola-heredada@ejemplo.invalid');
  d.siembra(uid, 'trades/t1', dato('original'));
  let p = await abre(ctx);
  d.e.caida = true;
  await p.evaluate(() => FUT.updateTrade('t1', { note: 'COPIA HEREDADA' }));
  await enDisco(p);
  await p.evaluate(() => new Promise(resolve => {
    const q = indexedDB.open('cabina-cola', 1);
    q.onsuccess = () => {
      const db = q.result, tx = db.transaction('pendientes', 'readwrite'), store = tx.objectStore('pendientes');
      const get = store.getAll();
      get.onsuccess = () => { const r = get.result[0]; delete r.versionBase; store.put(r); };
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await p.close();
  d.escribeOtro(uid, 'trades/t1', dato('OTRO DISPOSITIVO'));
  d.e.caida = false;
  p = await ctx.newPage();
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => window.FUT && /CONFLICTO/.test(document.getElementById('saveState').textContent));
  ok(d.e.filas.get(uid + '|trades/t1')?.data.note === 'OTRO DISPOSITIVO',
    'una cola heredada sin versión tampoco sobrescribe documentos existentes');
  await p.selectOption('#ef_elijo', 'remoto');
  await p.click('#edSave');
  await p.waitForFunction(() => FUT.cola().length === 0 && document.getElementById('saveState').textContent === 'sincronizado');
  ok(d.e.filas.get(uid + '|trades/t1')?.data.note === 'OTRO DISPOSITIVO',
    'aceptar la versión remota descarta sólo la copia pendiente elegida');
  await ctx.close();
  ok(errors.length === 0, 'sin errores JavaScript');
} finally {
  await browser.close();
  await new Promise(r => srv.close(r));
}
if (fallos.length) { console.error('fallos: ' + fallos.length); process.exitCode = 1; }
