/* La página servida por HTTP, como en GitHub Pages.

   Casi todas las pruebas cargan `file://`. Servida de verdad cambian el origen,
   la carga de fuentes y el almacenamiento: esto comprueba que arranca, guarda en
   este navegador y sobrevive a recargar.

   Levanta su propio servidor: sin puerto fijo (0 = el sistema elige, así dos
   corridas en paralelo no se pisan) y sirviendo sólo lo que Pages publica. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagina = readFileSync(join(raiz, 'index.html'));
const srv = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(pagina);
  } else { res.writeHead(404); res.end('no'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
/* Se ignora un recurso externo que no carga: en el contenedor donde se escribio
   esto, la hoja de Google Fonts falla con ERR_CERT_AUTHORITY_INVALID por el
   proxy TLS del entorno, no por la pagina. Un fallo de red de un tercero no es
   un defecto de la app -- las fuentes degradan solas. Todo lo demas cuenta, y
   los pageerror cuentan siempre. */
const AJENO = /Failed to load resource|net::ERR_/;
p.on('console', m => { if (m.type() === 'error' && !AJENO.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 140)); });

await p.goto(base, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 15000 });
await p.waitForTimeout(1200);

console.log('\n═══ ARRANCA SERVIDA POR HTTP ═══');
const fach = await p.evaluate(() => ['FUT', 'INV', 'TES'].filter(k => typeof window[k] !== 'undefined'));
ok(fach.length === 3, 'las tres fachadas existen igual', fach.join(' '));
ok(await p.evaluate(() => document.querySelectorAll('.tabbtn').length) > 0,
   'la interfaz se pinta', await p.evaluate(() => document.querySelectorAll('.tabbtn').length) + ' pestañas');

console.log('\n═══ DEGRADA A localStorage ═══');
/* Escribir y recargar: si `db` hubiera quedado a medias en vez de caer a null,
   el dato no sobreviviría. */
await p.evaluate(() => FUT.createTrade({ instrument: 'MNQ', direction: 'long', qty: 1, date: '2026-09-20', time: '10:00', entry: 21000, stop: 20990, exit: 21010 }));
await p.waitForFunction(() => { try { return !!localStorage.getItem('cabina-mnq:v1'); } catch (e) { return false; } }, null, { timeout: 6000, polling: 50 });
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 15000 });
await p.waitForTimeout(1200);
const n = await p.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}').trades || {}).length; } catch (e) { return -1; } });
ok(n >= 1, 'lo escrito sobrevive a recargar', n + ' operaciones en disco');

console.log('\n  errores JS:', errs.length, errs.slice(0, 4).join(' | '));
if (errs.length) fallos.push('errores JS');
console.log('  fallos:', fallos.length, fallos.length ? '→ ' + fallos.join(' · ') : '');
await b.close(); srv.close();
process.exit(fallos.length ? 1 : 0);
