import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';
const failures = [], errors = [];
const check = (v, s) => { console.log('  ' + (v ? '✅ ' : '❌ ') + s); if (!v) failures.push(s); };
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const browser = await chromium.launch();
try {
  for (const mode of ['remote', 'delete', 'read-failure']) {
    const ctx = await browser.newContext(), d = nubeDoble();
    const uid = await d.conSesion(ctx, mode + '@decision.invalid');
    const t = { id: 't1', type: 'futuros', instrument: 'MNQ', date: '2026-10-20', pnl: 10, notes: 'original', updatedAt: 100 };
    d.siembra(uid, 'trades/t1', t);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(base);
    await p.waitForFunction(() => window.FUT && FUT.trades().length === 1 && document.getElementById('saveState').textContent === 'sincronizado');
    d.escribeOtro(uid, 'trades/t1', { ...t, notes: 'REMOTO' });
    await p.evaluate(mode => mode === 'delete' ? FUT.deleteTrade('t1') : FUT.updateTrade('t1', { notes: 'LOCAL' }), mode);
    await p.waitForFunction(() => /CONFLICTO/.test(document.getElementById('saveState').textContent));
    await p.waitForFunction(() => document.getElementById('ef_alla')?.value.includes('REMOTO'));
    if (mode === 'read-failure') {
      await ctx.route('**/rest/v1/cabina_docs?**', async route => {
        if (route.request().method() === 'GET') await route.fulfill({status:503,contentType:'application/json',body:'{"code":"unavailable"}'});
        else await route.fallback();
      });
      await p.selectOption('#ef_elijo', 'remoto');
      await p.click('#edSave');
      await p.waitForFunction(() => !document.getElementById('edSave').disabled);
      check(await p.evaluate(() => document.getElementById('ov').classList.contains('open') && /CONFLICTO/.test(document.getElementById('saveState').textContent)), 'fallar al leer remoto conserva el diálogo y el conflicto');
      check(await p.evaluate(() => FUT.trades()[0]?.notes === 'LOCAL'), 'una lectura fallida conserva el borrador local');
      await ctx.close();
      continue;
    }
    await p.selectOption('#ef_elijo', mode === 'delete' ? 'mio' : 'remoto');
    await p.click('#edSave');
    await p.waitForFunction(() => !/CONFLICTO/.test(document.getElementById('saveState').textContent));
    check(mode === 'delete' ? !d.e.filas.has(uid + '|trades/t1') : await p.evaluate(() => FUT.trades()[0]?.notes === 'REMOTO'),
      mode === 'delete' ? 'confirmar borrado concurrente ejecuta el borrado elegido' : 'aceptar remoto reemplaza también la copia más nueva en pantalla');
    check(mode === 'delete' || d.e.filas.get(uid + '|trades/t1').data.notes === 'REMOTO', 'la decisión conserva exactamente el resultado elegido en servidor');
    await ctx.close();
  }
  check(errors.length === 0, 'sin errores JavaScript');
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
if (failures.length) process.exitCode = 1;
