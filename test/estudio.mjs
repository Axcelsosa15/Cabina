/* LO QUE EDITAS SE VE EN TODAS PARTES · Estudio y el journal, una sola verdad.

   Esto NO documenta un fallo: fija un comportamiento que hoy es correcto y que
   es fácil de romper sin darse cuenta.

   Estudio lista las operaciones de futuros, construye sus desplegables de
   instrumento / dirección / cuenta a partir de ellas y calcula sus propias
   métricas. Todo eso lo pinta `renderEstudioTrades()`, que sólo se invoca desde
   `renderEstudio()` — y `renderEstudio()` NO está en `FANOUT_TRADES`, las 13
   zonas que se repintan cuando cambia una operación. Cuelga de dos hilos:

       coll("research").subscribe(() => renderEstudio());                 // :15330
       .tabbtn[data-tab="estudio"] → click → renderEstudio();             // :15169

   El segundo es el que lo salva: `showTab()` sólo alterna clases, así que lo
   que mantiene Estudio al día es el listener del BOTÓN de la pestaña. Quitarlo
   —o navegar a Estudio por un camino que no pase por ese botón, como el
   `showTab("estudio")` de la paleta de acciones— deja la pestaña mostrando la
   operación borrada, su P&L en las métricas y su instrumento en el desplegable,
   sin ningún aviso: parece al día.

   Esta prueba conduce la app real: siembra tres operaciones, borra una desde el
   journal con la selección múltiple, y vuelve a Estudio SIN recargar. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar } from './espera.mjs';
const errs = [], fallos = [];
const F = new Date('2026-09-17T14:00:00Z').getTime();
const b = await chromium.launch();
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

const op = (id, instr, exit) => ({
  id, type: 'futuros', accountId: 'a1', instrument: instr, direction: 'long',
  qty: 1, entry: 21000, stop: 20980, exit, date: '2026-09-1' + id.slice(-1), time: '10:00',
});
const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  trades: { t1: op('t1', 'MNQ', 21050), t2: op('t2', 'MES', 20995), t3: op('t3', 'CL', 21100) },
};

const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html'); await arrancada(p, '.tabbtn');

const enEstudio = () => p.$$eval('#studyTradeList button[data-study-trade]', n => n.map(x => x.dataset.studyTrade));
const instrumentos = () => p.$$eval('#studyTradeInstrument option', n => n.map(x => x.value).filter(Boolean));
const irA = async tab => { await p.click(`.tabbtn[data-tab="${tab}"]`); await quieto(p); };

console.log('\n═══ 1 · Estudio parte de las operaciones del journal ═══');
await irA('estudio');
let l = await enEstudio();
ok(l.length === 3, 'las 3 operaciones aparecen en Estudio', l.join(','));
let ins = await instrumentos();
ok(ins.includes('CL'), 'y el desplegable de instrumento incluye CL', ins.join(','));

console.log('\n═══ 2 · borrar en el journal se ve en Estudio, sin recargar ═══');
await irA('futuros');
await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
await p.click('#selbtn-jrTable'); await quieto(p);
// Borra la de CL, que es la que vigila el desplegable.
await p.click('#jrTable tr[data-id="t3"]'); await quieto(p);
const conf = await p.textContent('#selbar-jrTable');
ok(/1/.test(conf), 'el journal confirma 1 marcada', conf.replace(/\s+/g, ' ').trim().slice(0, 60));
// Dos pasos, como el resto de la app: «Borrar» pide confirmación y «sí» ejecuta.
await p.click('[data-sel="borrar"]'); await quieto(p);
await p.click('[data-sel="si"]'); await trasGuardar(p);
const quedan = await p.$$eval('#jrTable tbody tr[data-id]', n => n.length);
ok(quedan === 2, 'control: en el journal quedan 2', quedan);

await irA('estudio');
l = await enEstudio();
ok(!l.includes('t3'), 'la operación borrada ya no está en Estudio', l.join(','));
ok(l.length === 2, 'Estudio lista 2, lo mismo que el journal', l.length);
ins = await instrumentos();
ok(!ins.includes('CL'), 'y CL desaparece del desplegable de instrumento', ins.join(',') || 'vacío');

console.log('\n═══ 3 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
