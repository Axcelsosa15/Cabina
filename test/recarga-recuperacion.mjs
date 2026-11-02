/* REGRESIÓN CRÍTICA: una recarga NO vacía el journal ni autoriza
   escrituras sobre configuración todavía no hidratada.
   Usa el doble de Supabase, nunca toca datos reales. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (cond, label) => {
  console.log('  ' + (cond ? '✅ ' : '❌ ') + label);
  if (!cond) fallos.push(label);
};
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const srv = sirvePublicado(readFileSync(join(raiz, 'index.html')));
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const nav = await chromium.launch();
const ctx = await nav.newContext();
const d = nubeDoble();
const uid = await d.conSesion(ctx, 'recarga-segura@ejemplo.invalid');
const initialSettings = {
  meta: { title: 'CUENTA RECUPERABLE', acct: 'cta1' },
  accounts: [{ id: 'cta1', name: 'Cuenta real', firm: 'Firma', kind: 'evaluacion', size: 25000, dd: 1000 }],
  updatedAt: Date.now() - 5000
};
d.siembra(uid, 'settings/main', initialSettings);
d.siembra(uid, 'trades/t_real', {
  id: 't_real', type: 'futuros', accountId: 'cta1', date: '2026-10-30',
  time: '10:00', instrument: 'MNQ', direction: 'long', qty: 1,
  entry: 20200, exit: 20220, pnl: 40, updatedAt: Date.now() - 5000
});
d.e.retraso['settings/main'] = 1250;
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));

try {
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => window.FUT && typeof FUT.createAccount === 'function');
  const temprano = await p.evaluate(() => ({
    label: document.getElementById('saveState').textContent.trim(),
    cuentas: FUT.accounts().length
  }));
  ok(temprano.label === 'cargando datos', 'no anuncia sincronización antes de recibir settings');

  const intento = await p.evaluate(() =>
    FUT.createAccount({ id: 'phantom_on_reload', name: 'NO PERSISTIR', firm: 'test', size: 25000 }));
  const ficticio = await p.evaluate(() => FUT.accounts().some(a => a.id === 'phantom_on_reload'));
  ok(intento === null && !ficticio, 'no permite crear una cuenta en memoria antes de hidratarse');

  const llena = async () => {
    await p.waitForFunction(() =>
      FUT.accounts().some(a => a.id === 'cta1') &&
      FUT.trades().some(t => t.id === 't_real') &&
      document.getElementById('saveState').textContent.trim() === 'sincronizado',
      null, { timeout: 12000 });
  };
  await llena();
  ok(d.e.filas.has(uid + '|settings/main') && d.e.filas.has(uid + '|trades/t_real'),
    'recupera configuración y operaciones reales del usuario');

  for (let i = 0; i < 2; i++) {
    await p.reload({ waitUntil: 'load' });
    await llena();
    const data = await p.evaluate(() => ({ acc: FUT.accounts().map(a => a.id), tr: FUT.trades().map(t => t.id) }));
    ok(data.acc.length === 1 && data.acc[0] === 'cta1' && data.tr.length === 1 && data.tr[0] === 't_real',
      'recarga ' + (i + 1) + ' conserva exactamente los datos de la nube');
  }
  ok(!d.e.filas.has(uid + '|trades/phantom_on_reload'), 'nunca publica el intento prematuro');
  const mutaciones = d.e.pedidas.filter(r => /^\\/(rest|storage)\\//.test(r.ruta) && /^(POST|PATCH|DELETE)$/.test(r.m));
  ok(mutaciones.length === 0, 'recargar sin editar nunca escribe, reemplaza ni borra documentos');
  ok(errors.length === 0, 'sin errores JavaScript de página');
} finally {
  await nav.close();
  await new Promise(resolve => srv.close(resolve));
}
if (fallos.length) { console.error('fallos: ' + fallos.length); process.exit(1); }
console.log('OK recarga-recuperacion');
