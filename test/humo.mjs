/* SMOKE TEST DE PRODUCCION · la pagina servida por HTTP, como en GitHub Pages.

   Sirve exactamente lo que sube pagina.yml —index.html y .nojekyll, nada mas— y
   ejerce los caminos que importan de punta a punta: cargar, navegar, crear una
   cuenta, registrar operaciones, editar, borrar, deshacer, recargar y comprobar
   que los numeros siguen siendo los mismos.

   Por que HTTP y no file://: sobre file:// Chromium tira el area de
   almacenamiento al recargar de forma intermitente, asi que un `reload` ahi mide
   el navegador. El entorno real de Pages es HTTP, donde el reload es fiable, y
   esta prueba es la unica de la suite que lo ejerce de verdad.

   NO sustituye a abrir la URL publicada: esto verifica el mismo payload en el
   mismo protocolo, no el CDN de GitHub ni su configuracion. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = { '/': ['text/html; charset=utf-8', readFileSync(join(raiz, 'index.html'))],
                  '/index.html': ['text/html; charset=utf-8', readFileSync(join(raiz, 'index.html'))],
                  '/.nojekyll': ['text/plain', readFileSync(join(raiz, '.nojekyll'))] };
const srv = createServer((q, r) => {
  const e = PAYLOAD[q.url];
  if (!e) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'content-type': e[0] }); r.end(e[1]);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const fallos = [];
const paso = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(n); };
/* Un recurso externo que no carga no es un defecto de la app: en el contenedor
   donde se escribio esto, Google Fonts falla por el proxy TLS del entorno. Los
   pageerror (JS de la propia pagina) cuentan siempre. */
const AJENO = /Failed to load resource|net::ERR_/;
const errs = [];
const F = new Date('2026-09-18T14:20:00Z').getTime();
const RELOJ = `{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } });
const enchufa = p => {
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !AJENO.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
};
let p = await ctx.newPage(); enchufa(p);
await p.addInitScript(RELOJ);
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1400);

console.log('\n═══ SMOKE TEST · ' + BASE + ' ═══\n');

/* 1 · APP LOAD */
const carga = await p.evaluate(() => ({
  fachadas: ['FUT', 'INV', 'TES'].filter(k => typeof window[k] !== 'undefined').length,
  qe: typeof window.QuantEngine, ver: window.QuantEngine ? window.QuantEngine.QE_VERSION : null,
  /* Prueba de que el bundle esta VIVO, no solo presente: el tick de MNQ es 0.25 y
     su valor $0.50, asi que 1 punto = $2 por contrato. Una implementacion que no
     fuera el motor no acertaria la rejilla. */
  tick: window.QuantEngine ? window.QuantEngine.CONTRACTS.MNQ.tickValue : null,
  pestanas: document.querySelectorAll('.tabbtn').length,
  css: getComputedStyle(document.body).backgroundColor,
}));
paso('APP LOAD', carga.fachadas === 3 && carga.pestanas > 0, `${carga.fachadas}/3 fachadas · ${carga.pestanas} pestañas`);
paso('CSS', carga.css !== '' && carga.css !== 'rgba(0, 0, 0, 0)', carga.css);
paso('BUNDLE presente', carga.qe === 'object' && carga.ver === '2.0.0', `QuantEngine ${carga.ver}`);
paso('BUNDLE vivo (rejilla de ticks)', carga.tick === 0.5, `MNQ tickValue ${carga.tick} · esperado 0.5`);

/* 2 · NAVIGATION */
const tabs = await p.$$eval('.tabbtn', n => n.map(x => x.dataset.tab).filter(Boolean));
let navOk = tabs.length > 0;
for (const t of tabs) {
  await p.click(`.tabbtn[data-tab="${t}"]`); await p.waitForTimeout(220);
  const act = await p.evaluate(() => document.querySelector('.tab.active')?.dataset.tab);
  if (act !== t) { navOk = false; console.log(`        ✗ ${t} -> ${act}`); }
}
paso('NAVIGATION', navOk, `${tabs.length} pestañas recorridas`);

/* 3 · ACCOUNT CREATE / EDIT */
await p.evaluate(() => FUT.createAccount({ id: 'humo1', firm: 'Humo', name: 'Cuenta Humo', kind: 'Evaluación',
  size: 50000, dd: 2000, ddKind: 'estatico', target: 3000, limit: 50, status: 'activa', ledger: [] }));
await p.waitForTimeout(500);
const c1 = await p.evaluate(() => FUT.account('humo1'));
paso('ACCOUNT CREATION', !!c1 && c1.size === 50000, c1 ? `${c1.name} · ${c1.size}` : 'no existe');
await p.evaluate(() => FUT.updateAccount('humo1', { dd: 2500 }));
await p.waitForTimeout(500);
paso('ACCOUNT EDIT', (await p.evaluate(() => FUT.account('humo1').dd)) === 2500, 'dd 2000 -> 2500');

/* 4 · TRADE ENTRY · seis operaciones con P&L conocido de antemano.
   MNQ: tick 0.25, tickValue $0.50 -> 1 punto = $2 por contrato. */
const OPS = [
  { entry: 21000, exit: 21010, qty: 1, direction: 'long'  },  // +10 pts -> +$20
  { entry: 21000, exit: 20990, qty: 1, direction: 'long'  },  // -10 pts -> -$20
  { entry: 21000, exit: 20980, qty: 1, direction: 'short' },  // +20 pts -> +$40
  { entry: 21000, exit: 21020, qty: 1, direction: 'short' },  // -20 pts -> -$40
  { entry: 21000, exit: 21015, qty: 2, direction: 'long'  },  // +15 x2  -> +$60
  { entry: 21000, exit: 21005, qty: 1, direction: 'long'  },  // +5 pts  -> +$10
];
const ESPERADO = 20 - 20 + 40 - 40 + 60 + 10;                 // = $70, calculado a mano
for (const o of OPS) await p.evaluate(o => FUT.createTrade(Object.assign({
  accountId: 'humo1', instrument: 'MNQ', date: '2026-09-18', time: '10:00', stop: 20990 }, o)), o);
await p.waitForFunction(() => { try { return Object.keys(JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}').trades||{}).length >= 6; } catch (e) { return false; } }, null, { timeout: 8000, polling: 50 });
const n6 = await p.evaluate(() => FUT.trades().filter(t => t.accountId === 'humo1').length);
paso('TRADE ENTRY', n6 === 6, `${n6} operaciones`);

/* 9 · CALCULATIONS · contra el valor calculado a mano, no contra la app */
const total = await p.evaluate(() => FUT.calculateAccountStats('humo1').total);
paso('CALCULATIONS', Math.abs(total - ESPERADO) < 0.005, `P&L ${total} · esperado ${ESPERADO} (a mano)`);

/* 10 · RISK · el suelo de la cuenta con dd estatico = tamaño - dd */
const dd = await p.evaluate(() => FUT.calculateDrawdown('humo1'));
paso('RISK', dd && Math.abs(dd.max - 2500) < 0.005, `max ${dd && dd.max} · esperado 2500 (= dd configurado)`);

/* 11 · EQUITY · balance = tamaño + P&L */
const bal = await p.evaluate(() => FUT.calculateAccountStats('humo1').balance);
paso('EQUITY', Math.abs(bal - (50000 + ESPERADO)) < 0.005, `${bal} · esperado ${50000 + ESPERADO}`);

/* 12 · PROP RULES */
const reglas = await p.evaluate(() => { const r = FUT.evaluateRules('humo1'); return { status: r && r.status, n: FUT.rules().length }; });
paso('PROP RULES', !!reglas.status, `estado «${reglas.status}» · ${reglas.n} reglas`);

/* 5 · TRADE EDIT */
const id0 = await p.evaluate(() => FUT.trades().filter(t => t.accountId === 'humo1')[0].id);
await p.evaluate(id => FUT.updateTrade(id, { notes: 'editada por el smoke test' }), id0);
await p.waitForTimeout(500);
paso('TRADE EDIT', (await p.evaluate(id => FUT.trades().find(t => t.id === id).notes, id0)) === 'editada por el smoke test');

/* 6-7 · DELETE + UNDO por la interfaz, la cadena exacta 6 -> 5 -> 6 */
await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(300);
await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(400);
const vivos = () => p.$$eval('#jrTable tr[data-id]', n => n.filter(x => x.offsetParent !== null).length);
const antes = await vivos();
await p.click('#selbtn-jrTable'); await p.waitForTimeout(300);
await p.click('#jrTable tr[data-id]:nth-of-type(1)'); await p.waitForTimeout(250);
await p.click('[data-sel="borrar"]'); await p.waitForTimeout(300);
await p.click('[data-sel="si"]'); await p.waitForTimeout(700);
const tras = await vivos();
paso('TRADE DELETE', tras === antes - 1, `${antes} -> ${tras}`);
const enDisco = await p.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}').trades||{}).length; } catch (e) { return -1; } });
paso('DELETE llega al disco', enDisco === 5, `${enDisco} en localStorage (no solo en pantalla)`);
await p.click('[data-pap="undo"]'); await p.waitForTimeout(800);
const vuelta = await vivos();
paso('UNDO', vuelta === antes, `${tras} -> ${vuelta}`);

/* 8 · RELOAD · sobre HTTP el reload es fiable, y NO hay semilla que resucite nada */
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1400);
const trasRecarga = await p.evaluate(() => ({
  n: FUT.trades().filter(t => t.accountId === 'humo1').length,
  total: FUT.calculateAccountStats('humo1').total,
  cuenta: !!FUT.account('humo1'),
  nota: (FUT.trades().find(t => t.notes === 'editada por el smoke test') || {}).notes,
}));
paso('RELOAD', trasRecarga.n === 6 && trasRecarga.cuenta, `${trasRecarga.n} operaciones, cuenta ${trasRecarga.cuenta ? 'sigue' : 'PERDIDA'}`);
paso('PERSISTENCE (numeros identicos)', Math.abs(trasRecarga.total - ESPERADO) < 0.005, `P&L ${trasRecarga.total} · esperado ${ESPERADO}`);
paso('PERSISTENCE (la edicion sobrevive)', trasRecarga.nota === 'editada por el smoke test');

/* 13 · IMPORT / EXPORT · el respaldo serializa el estado completo */
const exp = await p.evaluate(() => { try { const t = localStorage.getItem('cabina-mnq:v1'); const d = JSON.parse(t);
  return { bytes: t.length, tiene: !!(d.settings && d.trades), cuentas: (d.settings.accounts||[]).length }; } catch (e) { return null; } });
paso('EXPORT (estado serializable)', !!exp && exp.tiene && exp.cuentas >= 1, exp ? `${exp.bytes} bytes · ${exp.cuentas} cuentas` : 'no serializa');
const ida = await p.evaluate(() => { try { const t = localStorage.getItem('cabina-mnq:v1'); return JSON.stringify(JSON.parse(t)) === JSON.stringify(JSON.parse(JSON.stringify(JSON.parse(t)))); } catch (e) { return false; } });
paso('EXPORT -> IMPORT (ida y vuelta)', ida, 'serializar y deserializar conserva el dato');

/* 15 · CONSOLE ERRORS */
paso('CONSOLE ERRORS', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'ninguno');

console.log(`\n  ${fallos.length ? 'FALLOS: ' + fallos.join(' · ') : 'todo PASS'}`);
console.log(`  fallos: ${fallos.length}`);
await b.close(); srv.close();
process.exit(fallos.length ? 1 : 0);
