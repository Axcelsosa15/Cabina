/* CÓMO VIAJA EL DATO Y QUÉ TE DICE LA APP · las dos mitades del mismo problema.

   §1 · ESTUDIO NO ERA UNA ZONA. `renderEstudio()` lee las operaciones de
   futuros —las lista, construye sus desplegables con ellas y calcula sus
   métricas— pero no estaba en `FANOUT_TRADES`, las zonas que se repintan
   cuando cambia una operación. Colgaba de `coll("research")` y del clic en el
   BOTÓN de su pestaña, y `test/estudio.mjs` ya dejó escrito que ese botón era
   el único hilo que lo salvaba. Esta prueba usa el camino que NO pasa por él:
   la paleta de acciones, cuya entrada «Ir a» hace `showTab("estudio")` a
   secas. Con el tic de la nube hay un segundo camino, imposible de montar
   aquí: una operación que cambia en otro dispositivo mientras MIRAS Estudio.
   El arreglo —Estudio como zona del registro— cierra los dos a la vez.

   §2 · LAS LECTURAS QUE FALLAN ERAN MUDAS. `attachDb` llama a
   `onSnapshot(cb)` sin segundo argumento, así que el `mal` de `cuando()`
   llegaba `undefined` y cada lectura fallida se tiraba en silencio. El rótulo
   sólo hablaba de lo que SALE: con la base rechazando todas las lecturas decía
   «sincronizado» sobre una cabina vacía. Es la misma mentira que ese rótulo
   existe para no contar, en la dirección que nadie había mirado. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto, arrancada, trasGuardar } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const F = new Date('2026-09-17T14:00:00Z').getTime();
const RELOJ = `{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`;

const nav = await chromium.launch();

/* ══════════════════════════════════════════════════════════════════════════
   §1 · Estudio sigue a las operaciones por CUALQUIER camino
   ══════════════════════════════════════════════════════════════════════════ */
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };
const op = (id, instr, exit) => ({
  id, type: 'futuros', accountId: 'a1', instrument: instr, direction: 'long',
  qty: 1, entry: 21000, stop: 20980, exit, date: '2026-09-1' + id.slice(-1), time: '10:00',
});
const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  trades: { t1: op('t1', 'MNQ', 21050), t2: op('t2', 'MES', 20995), t3: op('t3', 'CL', 21100) },
};

{
  const ctx = await nav.newContext({ viewport: { width: 1600, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR §1: ' + e.message));
  await p.addInitScript(RELOJ);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
  await p.goto('file://' + join(raiz, 'index.html'));
  await arrancada(p, '.tabbtn');

  const enEstudio = () => p.$$eval('#studyTradeList button[data-study-trade]', n => n.map(x => x.dataset.studyTrade));
  const instrumentos = () => p.$$eval('#studyTradeInstrument option', n => n.map(x => x.value).filter(Boolean));

  console.log('\n═══ 1 · control: Estudio parte de las 3 operaciones ═══');
  await p.click('.tabbtn[data-tab="estudio"]'); await quieto(p);
  let l = await enEstudio();
  ok(l.length === 3, 'Estudio lista las 3 del journal', l.join(','));

  console.log('\n═══ 2 · borrar en el journal, y llegar a Estudio POR LA PALETA ═══');
  await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
  await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
  await p.click('#selbtn-jrTable'); await quieto(p);
  // La de CL: es la que vigila el desplegable de instrumento.
  await p.click('#jrTable tr[data-id="t3"]'); await quieto(p);
  await p.click('[data-sel="borrar"]'); await quieto(p);
  await p.click('[data-sel="si"]'); await trasGuardar(p);
  const quedan = await p.$$eval('#jrTable tbody tr[data-id]', n => n.length);
  ok(quedan === 2, 'control: en el journal quedan 2', quedan);

  /* El camino que el botón de la pestaña NO cubre. «biblioteca» sólo casa con
     la entrada «Ir a → Estudio · biblioteca de investigación», que hace
     `showTab("estudio")` sin repintar nada. */
  await p.keyboard.press('Control+k'); await p.waitForTimeout(350);
  await p.keyboard.type('biblioteca'); await p.waitForTimeout(300);
  const primera = await p.evaluate(() => document.querySelector('.cmd-it .ct')?.textContent || '');
  ok(/biblioteca/i.test(primera), 'la paleta ofrece «Ir a Estudio»', primera);
  await p.keyboard.press('Enter'); await quieto(p);
  const tab = await p.evaluate(() => document.querySelector('.tab.active')?.dataset.tab);
  ok(tab === 'estudio', 'la paleta deja la pestaña de Estudio delante', tab);

  l = await enEstudio();
  ok(!l.includes('t3'), 'la operación borrada NO sigue en Estudio', l.join(',') || 'vacío');
  ok(l.length === 2, 'Estudio lista 2, lo mismo que el journal', l.length);
  const ins = await instrumentos();
  ok(!ins.includes('CL'), 'y CL desaparece del desplegable', ins.join(',') || 'vacío');

  const cont = await p.evaluate(() => document.getElementById('studyTradeMetricCount')?.textContent);
  ok(cont === '2', 'las métricas de Estudio cuentan 2, no 3', cont);

  await ctx.close();
}

/* ══════════════════════════════════════════════════════════════════════════
   §2 · una lectura que falla deja de ser muda
   ══════════════════════════════════════════════════════════════════════════ */
{
  const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const d = nubeDoble(html);

  const ctx = await nav.newContext();
  const uid = await d.conSesion(ctx, 'retro@ejemplo.com');
  d.siembra(uid, 'trades/t1', op('t1', 'MNQ', 21050));

  /* La base acepta escrituras y rechaza TODA lectura: es el caso real de una
     RLS mal puesta o una tabla que falta. Se registra DESPUÉS de `conSesion`,
     así que gana a la ruta del doble; lo que no es una lectura cae a ella. */
  let leidas = 0;
  await ctx.route(d.NUBE + '/rest/v1/**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    leidas++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
  });

  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR §2: ' + e.message));
  await p.addInitScript(RELOJ);
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 3000);

  console.log('\n═══ 3 · con la base rechazando lecturas, el rótulo no dice «sincronizado» ═══');
  ok(leidas >= 2, 'control: la app intentó leer y se le negó', leidas + ' lecturas rechazadas');
  const rot = await p.evaluate(() => document.getElementById('saveState').textContent);
  ok(rot !== 'sincronizado', 'el rótulo NO miente', '«' + rot + '»');
  ok(rot === 'sin actualizar', 'y dice exactamente qué pasa', '«' + rot + '»');

  const pie = await p.evaluate(() => document.getElementById('footerStore').textContent);
  ok(/no se puede LEER/i.test(pie), 'el pie explica que es la LECTURA lo que falla', pie.slice(0, 90));
  ok(/se está guardando/i.test(pie), 'y que lo que cambias sí se guarda', pie.slice(0, 60));
  ok(/no ha llegado nada/i.test(pie), 'y que en esta sesión no llegó nada', pie.slice(-70));

  console.log('\n═══ 4 · al volver la lectura, el rótulo se corrige solo ═══');
  await ctx.unroute(d.NUBE + '/rest/v1/**');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await quieto(p, 60, 4000);
  const rot2 = await p.evaluate(() => document.getElementById('saveState').textContent);
  ok(rot2 === 'sincronizado', 'vuelve a «sincronizado» cuando vuelve a ser verdad', '«' + rot2 + '»');
  const ops = await p.evaluate(() => window.FUT.trades().length);
  ok(ops === 1, 'y la operación sembrada aparece', ops);

  await ctx.close();
  srv.close();
}

console.log('\n═══ 5 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close();
console.log(`\n${fallos.length ? '❌' : '✅'} retro · ${fallos.length} fallos`);
if (fallos.length) process.exitCode = 1;
process.exit(fallos.length ? 1 : 0);
