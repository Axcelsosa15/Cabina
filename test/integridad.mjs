/* LOS SELLOS DE UN RESPALDO · que una copia a medias no pase por entera.

   Un respaldo que llega truncado y se importa como si estuviera completo es la
   peor forma de perder datos: el archivo existe, se confía en él, y lo que falta
   no se descubre hasta que hace falta. Hasta aquí nada en el fichero decía
   cuántos registros debería traer, así que una copia de 1.500 operaciones cortada
   a 900 se importaba sin un solo aviso.

   Dos sellos, dos preguntas distintas:

     `counts`    cuántos registros había al exportar, por sección. Caza el
                 TRUNCAMIENTO, y dice el número que falta.
     `checksum`  una huella del contenido. Caza el byte cambiado que no mueve
                 ningún recuento.

   LO QUE LA HUELLA NO ES: una firma. No hay secreto, así que quien edite el
   fichero puede recalcularla. Detecta daño accidental, no manipulación, y esta
   prueba lo dice tal cual.

   Y NO BLOQUEA, a propósito: la importación acepta copias editadas a mano y los
   respaldos viejos no traen sellos. Lo que se exige aquí es que el estado salga en
   la VISTA PREVIA, antes de teclear IMPORTAR. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const op = (id, n) => ({ id, type: 'futuros', instrument: 'MNQ', direction: 'long',
  entry: 20000, stop: 19990, exit: 20000 + n, qty: 1, date: '2026-09-0' + ((n % 9) + 1), time: '10:00' });
const SEMILLA = { settings: { meta: { title: 'Cabina' }, accounts: [] },
  trades: Object.fromEntries([1, 2, 3, 4, 5].map(n => ['t' + n, op('t' + n, n)])) };

const nav = await chromium.launch();
const errs = [];

/* Abre la cabina con la semilla y devuelve la página. */
async function pagina(semilla) {
  const ctx = await nav.newContext();
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('cabina-mnq:v1')) localStorage.setItem('cabina-mnq:v1', JSON.stringify(s)); } catch (e) { } }, semilla || SEMILLA);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 2500);
  return { ctx, p };
}

/* El texto del respaldo tal y como lo produce «Ver el texto»: se conduce el botón
   real, no una función interna, porque lo que se está probando es el fichero que
   el usuario se lleva. */
async function exporta(p) {
  await p.click('[data-tab="cabina"]'); await quieto(p, 60, 1200);
  await p.click('#bkShow'); await p.waitForTimeout(1600);
  const txt = await p.evaluate(() => { const t = document.querySelector('#edFields textarea'); return t ? t.value : ''; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  return txt;
}

/* Pega un respaldo, pulsa «Revisar» y devuelve lo que la vista previa DICE, sin
   confirmar: lo que se mide es lo que el usuario lee antes de decidir. */
async function vistaPrevia(json) {
  const { ctx, p } = await pagina();
  await p.click('[data-tab="cabina"]'); await quieto(p, 60, 1200);
  await p.click('button:has-text("Pegar el texto")'); await p.waitForTimeout(600);
  await p.fill('#edFields textarea', json); await p.waitForTimeout(250);
  await p.click('#edSave'); await p.waitForTimeout(1100);
  const out = await p.evaluate(() => ({
    titulo: (document.getElementById('edTitle') || {}).textContent || '',
    error: ((document.getElementById('edAvisos') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    resumen: (() => { const t = document.querySelector('#ef_resumen'); return t ? t.value.replace(/\s+/g, ' ').trim() : ''; })(),
  }));
  await ctx.close();
  return out;
}

console.log('\n═══ 1 · el respaldo que produce la app lleva sus sellos ═══');
const { ctx: c1, p: p1 } = await pagina();
const txt = await exporta(p1);
let raw = null;
try { raw = JSON.parse(txt); } catch (e) { }
ok(!!raw, 'el respaldo es JSON válido', txt ? `${txt.length} bytes` : 'vacío');
ok(raw && raw.format === 'cabina-backup' && Number(raw.version) === 1, 'con su formato y versión', raw && `${raw.format} v${raw.version}`);
ok(raw && Number(raw.schemaVersion) === 1, 'y la generación del MODELO DE DATOS, que no es la del formato', raw && raw.schemaVersion);
ok(raw && typeof raw.checksum === 'string' && /^[0-9a-f]{8}$/.test(raw.checksum), 'una huella del contenido', raw && raw.checksum);
ok(raw && raw.counts && raw.counts.trades === 5, 'y el recuento declarado por sección', raw && JSON.stringify(raw.counts));
await c1.close();

console.log('\n═══ 2 · su propio respaldo CUADRA ═══');
const v2 = await vistaPrevia(txt);
ok(/Importar copia/.test(v2.titulo), 'pasa la validación y llega a la vista previa', v2.titulo);
ok(/Integridad: el archivo cuadra/.test(v2.resumen), 'y la vista previa dice que cuadra', v2.resumen.slice(0, 120));
ok(!/NO CUADRA/.test(v2.resumen), 'sin falsos positivos');

console.log('\n═══ 3 · UNA COPIA TRUNCADA se dice, con el número que falta ═══');
/* Se quitan dos operaciones sin tocar `counts`: es exactamente lo que deja un
   fichero cortado o una escritura a medias. */
const cortada = JSON.parse(txt);
delete cortada.trades.t4; delete cortada.trades.t5;
const v3 = await vistaPrevia(JSON.stringify(cortada));
ok(/Importar copia/.test(v3.titulo), 'no se rechaza: es la única copia del usuario y bloquearla sería peor', v3.titulo);
ok(/NO CUADRA/.test(v3.resumen), 'pero la vista previa lo grita', v3.resumen.slice(0, 200));
ok(/trades: el archivo dice 5 y se leen 3/.test(v3.resumen), 'y dice cuántas faltan, por su nombre', v3.resumen.slice(0, 260));
ok(/truncada/.test(v3.resumen), 'y nombra la causa probable', v3.resumen.slice(0, 300));

console.log('\n═══ 4 · UN BYTE CAMBIADO que no mueve ningún recuento ═══');
/* Mismo número de operaciones, un P&L distinto: los recuentos cuadran y sólo la
   huella lo caza. */
const tocada = JSON.parse(txt);
tocada.trades.t1.exit = 99999;
const v4 = await vistaPrevia(JSON.stringify(tocada));
ok(/NO CUADRA/.test(v4.resumen), 'la huella lo caza aunque los recuentos cuadren', v4.resumen.slice(0, 200));
ok(/huella no coincide/.test(v4.resumen), 'y dice que es la huella, no el recuento', v4.resumen.slice(0, 220));
ok(/editó a mano, o se dañó/.test(v4.resumen), 'y no acusa de nada que no pueda demostrar', v4.resumen.slice(0, 240));

console.log('\n═══ 5 · un respaldo ANTERIOR a los sellos no es un error ═══');
const vieja = JSON.parse(txt);
delete vieja.checksum; delete vieja.counts; delete vieja.schemaVersion;
const v5 = await vistaPrevia(JSON.stringify(vieja));
ok(/Importar copia/.test(v5.titulo), 'entra igual', v5.titulo);
ok(/anterior a los sellos/.test(v5.resumen), 'y se dice que NO SE PUEDE comprobar, que no es lo mismo que que esté bien', v5.resumen.slice(0, 200));
ok(!/NO CUADRA/.test(v5.resumen), 'y no se la acusa de no cuadrar', v5.resumen.slice(0, 120));

console.log('\n═══ 6 · la huella no depende del orden de las claves ═══');
/* Un editor, un `jq`, o cualquier herramienta que reescriba el JSON cambia el
   orden de las claves sin cambiar el contenido. Si la huella dependiera de eso,
   diría «dañada» sobre una copia intacta y nadie volvería a mirarla. */
const reordenada = JSON.parse(txt);
const alReves = {};
Object.keys(reordenada).reverse().forEach(k => { alReves[k] = reordenada[k]; });
alReves.trades = Object.fromEntries(Object.keys(reordenada.trades).reverse().map(k => [k, reordenada.trades[k]]));
const v6 = await vistaPrevia(JSON.stringify(alReves));
ok(!/NO CUADRA/.test(v6.resumen), 'reordenar las claves no la rompe', v6.resumen.slice(0, 140));
ok(/cuadra/.test(v6.resumen), 'sigue cuadrando', v6.resumen.slice(0, 140));

console.log('\n═══ 7 · un sello inventado no cuela ═══');
const falsa = JSON.parse(txt);
falsa.checksum = '00000000';
const v7 = await vistaPrevia(JSON.stringify(falsa));
ok(/NO CUADRA/.test(v7.resumen), 'una huella que no es la del contenido se caza', v7.resumen.slice(0, 160));

console.log('\n═══ 8 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
