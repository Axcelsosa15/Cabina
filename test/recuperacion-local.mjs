/* RECUPERACIÓN LOCAL: dos IDs iguales NO autorizan a pisar datos cloud. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fail = [];
const check = (yes, msg) => {
  console.log('  ' + (yes ? '✅ ' : '❌ ') + msg);
  if (!yes) fail.push(msg);
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srv = sirvePublicado(readFileSync(join(root, 'index.html')));
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const d = nubeDoble();
const uid = await d.conSesion(ctx, 'no-pisar@prueba.invalid');
d.siembra(uid, 'settings/main', { meta: { title: 'REMOTO' }, accounts: [{id:'cloud',name:'Cloud',firm:'Prop'}], updatedAt: 100 });
d.siembra(uid, 'trades/coincide', { id:'coincide', type:'futuros', date:'2026-10-20', instrument:'MNQ', pnl: 30, note:'no sobrescribir' });
await ctx.addInitScript(() => localStorage.setItem('cabina-mnq:v1', JSON.stringify({
  settings: {meta:{title:'LOCAL'},accounts:[{id:'local',name:'Local'}]},
  trades: {
    coincide: {id:'coincide',type:'futuros',date:'2026-10-20',instrument:'MNQ',pnl:-999,note:'incorrecto'},
    nuevo: {id:'nuevo',type:'futuros',date:'2026-10-21',instrument:'MNQ',pnl:25,note:'recuperar'}
  }
})));
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
try {
  await p.goto(base, {waitUntil:'load'});
  await p.waitForFunction(() => window.FUT && FUT.accounts().some(a => a.id === 'cloud') && FUT.trades().some(t => t.id === 'coincide') && document.getElementById('saveState').textContent.trim() === 'sincronizado', null,{timeout:12000});
  await p.click('#cuentaBtn');
  await p.waitForFunction(() => {
    const b=document.getElementById('auSubir'); return b && !b.hidden;
  });
  await p.click('#auSubir');
  await p.click('#auSubir');
  await p.waitForFunction(() => window.FUT && FUT.trades().some(t => t.id === 'nuevo'), null, {timeout:12000});
  const existing = d.e.filas.get(uid+'|trades/coincide')?.data;
  const imported = d.e.filas.get(uid+'|trades/nuevo')?.data;
  const config = d.e.filas.get(uid+'|settings/main')?.data;
  check(existing?.note === 'no sobrescribir' && existing?.pnl === 30, 'colisión conservada en nube');
  check(imported?.note === 'recuperar' && imported?.pnl === 25, 'trade local ausente importado');
  check(config?.meta?.title === 'REMOTO' && config?.accounts?.[0]?.id === 'cloud', 'configuración de nube sin alterar');
  const trash = d.e.pedidas.filter(r => r.m==='DELETE' && r.ruta.startsWith('/rest/'));
  check(trash.length === 0, 'la recuperación nunca borra documentos');
  check(errors.length === 0, 'sin errores JavaScript');
} finally {
  await browser.close();
  await new Promise(r=>srv.close(r));
}
if (fail.length) { console.error('fallos: '+fail.length); process.exit(1); }
console.log('OK recuperacion-local');
