/* IMPORTAR · la frontera por donde entra un fichero que escribio otra persona.

   Es la unica superficie de esta cabina que acepta datos de fuera, asi que es la
   unica que puede traer basura o algo hostil. Lo que se vigila aqui:

     · que un registro SIN `id` no entre como `id: "undefined"` -- se repara con la
       clave bajo la que venia, porque tirarlo seria destruir una operacion legitima;
     · que los escalares no entren;
     · que una version ilegible se diga en vez de asumirse;
     · que NADA se pierda por el camino: una validacion que borra datos del usuario
       pasaria la mitad de estas aserciones y seria peor que no tenerla;
     · que la confirmacion escrita siga ahi.

   Se conduce la INTERFAZ REAL -- pegar, revisar, importar, teclear IMPORTAR -- y no
   una funcion interna: bkParse no esta expuesta, y probar por dentro una frontera
   que por fuera tiene tres pasos no comprueba la frontera.

   Su modo de fallo: que alguien «endurezca» la importacion rechazando registros y
   que un respaldo viejo pierda operaciones en silencio. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const errs = [];

/* Cada caso en su propia pestaña limpia: una importacion deja estado. */
const importa = async (json, { confirmar = true } = {}) => {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1300);
  await p.click('[data-tab="cabina"]'); await p.waitForTimeout(350);
  await p.click('button:has-text("Pegar el texto")'); await p.waitForTimeout(600);
  await p.fill('#edFields textarea', json); await p.waitForTimeout(250);
  /* `flashEd()` escribe el motivo del rechazo EN EL TITULO y lo restaura sola tras
     un momento. Leer a los 1000 ms lo perdia: la asercion pasaba con el detalle
     vacio, o sea decia «se rechaza y se dice» sin poder mostrar QUE se dijo. Se
     captura el destello a los 250 ms y se guarda. */
  await p.click('#edSave'); await p.waitForTimeout(250);
  const destello = await p.evaluate(() => (document.getElementById('edTitle') || {}).textContent || '');
  await p.waitForTimeout(900);
  const trasRevisar = await p.evaluate(() => ({
    titulo: (document.getElementById('edTitle') || {}).textContent,
    error: (document.getElementById('edAvisos') || {}).textContent.replace(/\s+/g, ' ').trim(),
    abierto: document.getElementById('ov').classList.contains('open'),
  }));
  trasRevisar.destello = destello;
  let pidioConfirmacion = false;
  if (/Importar copia/.test(trasRevisar.titulo || '')) {
    await p.click('#edSave'); await p.waitForTimeout(900);
    pidioConfirmacion = await p.evaluate(() => /Escribe IMPORTAR/.test((document.getElementById('edTitle') || {}).textContent || ''));
    if (pidioConfirmacion && confirmar) {
      await p.fill('#ef_ok', 'IMPORTAR').catch(() => {});
      await p.waitForTimeout(250);
      await p.click('#edSave'); await p.waitForTimeout(2200);
    }
  }
  await p.waitForTimeout(700);
  const fin = await p.evaluate(() => {
    let ls = {}; try { ls = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); } catch (e) { }
    return { trades: FUT.trades().map(t => ({ id: String(t.id), pnl: t.pnl })),
      clavesLS: Object.keys(ls.trades || {}), dias: Object.keys(ls.days || {}),
      proto: { a: ({}).contaminado, b: ({}).contaminado2, c: ({}).contaminado3 } };
  });
  await ctx.close();
  return { trasRevisar, pidioConfirmacion, fin };
};

const F = 'cabina-backup';
const copia = (extra) => JSON.stringify(Object.assign({
  format: F, version: 1, exportedAt: Date.now(), source: 'prueba',
}, extra));
const BUENA = { id: 'ok1', type: 'futuros', instrument: 'MNQ', pnl: 10, date: '2026-01-02', direction: 'long' };

console.log('\n═══ UN REGISTRO SIN `id` SE REPARA, NO SE TIRA ═══');
let r = await importa(copia({ trades: { ok1: BUENA, sinId: { type: 'futuros', instrument: 'MNQ', pnl: 5, date: '2026-01-02', direction: 'long' } } }));
ok(r.fin.trades.length === 2, 'las DOS operaciones entran: no se pierde la que venia sin id',
   JSON.stringify(r.fin.trades));
const reparada = r.fin.trades.find(t => t.pnl === 5);
ok(reparada && reparada.id === 'sinId', 'la que no traia `id` sale con la clave como identificador',
   reparada ? `id «${reparada.id}»` : 'no esta');
ok(!r.fin.trades.some(t => t.id === 'undefined' || t.id === 'null'),
   'ninguna operacion queda con id «undefined»', r.fin.trades.map(t => t.id).join(' · '));

console.log('\n═══ LOS ESCALARES NO ENTRAN ═══');
r = await importa(copia({ trades: { ok1: BUENA, cadena: 'soy texto', numero: 42, nulo: null, lista: [1, 2] } }));
ok(r.fin.trades.length === 1 && r.fin.trades[0].id === 'ok1',
   'solo entra el registro que es un objeto', JSON.stringify(r.fin.trades));
ok(!r.fin.clavesLS.some(k => ['cadena', 'numero', 'nulo', 'lista'].includes(k)),
   'y ninguno de los cuatro escalares llega a localStorage', r.fin.clavesLS.join(' · ') || 'solo ok1');

console.log('\n═══ LA VERSION SE LEE O SE PARA ═══');
r = await importa(copia({ version: 'abc', trades: { ok1: BUENA } }), { confirmar: false });
ok(/no dice de qué versión|no dice de que version/i.test(r.trasRevisar.destello + r.trasRevisar.error),
   'una version NO NUMERICA se rechaza, y el motivo se lee', `«${(r.trasRevisar.destello || r.trasRevisar.error).slice(0, 78)}»`);
ok(r.fin.trades.length === 0, 'y no entra nada', `${r.fin.trades.length} operaciones`);
r = await importa(copia({ version: 99, trades: { ok1: BUENA } }), { confirmar: false });
ok(/más nueva|mas nueva/i.test(r.trasRevisar.destello + r.trasRevisar.error),
   'una version MAS NUEVA se rechaza, y el motivo se lee', `«${(r.trasRevisar.destello || r.trasRevisar.error).slice(0, 78)}»`);
ok(r.fin.trades.length === 0, 'y tampoco entra nada', `${r.fin.trades.length} operaciones`);

console.log('\n═══ EL PROTOTIPO NO SE CONTAMINA ═══');
/* Medido antes de escribir la defensa: con el codigo anterior TAMPOCO se contaminaba,
   porque `Object.assign` con `__proto__` cambia el prototipo del DESTINO y no añade
   nada a Object.prototype. Se afirma igual: es barato y el dia que alguien cambie el
   camino de escritura, esta linea lo dice. */
r = await importa(copia({
  __proto__: { contaminado: 'SI' },
  settings: { meta: { contaminado2: 'SI', title: 'X' } },
  trades: { ok1: BUENA, __proto__: { contaminado3: 'SI' } },
}));
ok(r.fin.proto.a === undefined && r.fin.proto.b === undefined && r.fin.proto.c === undefined,
   'Object.prototype sigue limpio tras importar una copia con claves __proto__',
   JSON.stringify(r.fin.proto));
ok(r.fin.trades.some(t => t.id === 'ok1'), 'y la operacion legitima de esa misma copia SI entro',
   JSON.stringify(r.fin.trades));

console.log('\n═══ LA CONFIRMACION ESCRITA SIGUE AHI ═══');
r = await importa(copia({ trades: { ok1: BUENA } }), { confirmar: false });
ok(r.pidioConfirmacion, 'importar pide teclear IMPORTAR antes de escribir nada', 'lo pide');
ok(r.fin.trades.length === 0, 'y sin teclearlo NO se importa', `${r.fin.trades.length} operaciones`);

console.log('\n═══ NADA SE PIERDE · una copia normal entra entera ═══');
r = await importa(copia({
  trades: { a: Object.assign({}, BUENA, { id: 'a', pnl: 1 }), b: Object.assign({}, BUENA, { id: 'b', pnl: 2 }), c: Object.assign({}, BUENA, { id: 'c', pnl: 3 }) },
  days: { '2026-01-01': { date: '2026-01-01', note: 'una nota' } },
}));
ok(r.fin.trades.length === 3, 'las tres operaciones entran', r.fin.trades.map(t => t.id).join(' · '));
ok(r.fin.dias.includes('2026-01-01'), 'y el dia tambien', r.fin.dias.join(' · '));

ok(errs.length === 0, 'ninguna pagina lanzo un error', errs.length ? errs.slice(0, 2).join(' | ') : 'sin pageerror');
await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
