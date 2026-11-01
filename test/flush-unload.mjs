/* CIERRE DURANTE EL DEBOUNCE · el cambio tiene que llegar al almacén.
   ─────────────────────────────────────────────────────────────────────────────
   `persistSettings` espera 500 ms. Antes, recargar dentro de ese hueco mataba el
   temporizador y el cambio nunca tocaba `cabina-mnq:v1`, aunque la pantalla ya
   lo mostraba. Esta prueba dispara `pagehide` a mano (igual que un cierre) y
   exige que localStorage tenga la cuenta nueva SIN esperar al debounce. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const nav = await chromium.launch();
const errs = [];
const ctx = await nav.newContext();
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(800);

console.log('\n═══ 1 · pagehide vacía el debounce de settings hacia localStorage ═══');
const antes = await p.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); } catch (e) { return {}; }
});
const nAntes = (antes.settings && antes.settings.accounts || []).length;

await p.evaluate(() => {
  FUT.createAccount({ firm: 'FirmaFlush', name: 'Cuenta Flush Debounce', kind: 'Evaluación',
    size: 25000, dd: 1000, ddKind: 'estatico', target: 1500, status: 'activa', ledger: [] });
});
const mid = await p.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); } catch (e) { return {}; }
});
const nMid = (mid.settings && mid.settings.accounts || []).length;
ok(nMid === nAntes, 'aún dentro del debounce: localStorage NO tiene la cuenta nueva',
  `antes=${nAntes} mid=${nMid}`);

await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await p.waitForTimeout(80);

const despues = await p.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); } catch (e) { return {}; }
});
const nDesp = (despues.settings && despues.settings.accounts || []).length;
const nombres = (despues.settings && despues.settings.accounts || []).map(a => a.name);
ok(nDesp === nAntes + 1, 'tras pagehide la cuenta está en localStorage',
  `antes=${nAntes} despues=${nDesp}`);
ok(nombres.includes('Cuenta Flush Debounce'), 'el nombre nuevo llegó intacto', nombres.join(' · '));

console.log('\n═══ 2 · beforeunload sin falso positivo en local ═══');
const sinPeligro = await p.evaluate(() => {
  let cancelado = false;
  const e = new Event('beforeunload', { cancelable: true });
  Object.defineProperty(e, 'returnValue', { configurable: true, get() { return ''; }, set() { cancelado = true; } });
  window.dispatchEvent(e);
  return cancelado;
});
ok(sinPeligro === false, 'sin cambios volátiles, beforeunload no avisa');

ok(errs.length === 0, 'sin errores de página', errs.join(' | ') || 'ninguno');
await nav.close();
await new Promise(r => srv.close(r));
if (fallos.length) { console.error('\nFALLOS:', fallos.join(' · ')); process.exit(1); }
console.log('\nOK flush-unload');
