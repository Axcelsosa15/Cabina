/* EL HISTORIAL DE LA CABINA Y EL JOURNAL, UNA SOLA VERDAD · también hacia atrás.

   `syncDayFromTrades()` ya arregló esto para HOY: el journal manda, salvo que
   el resultado lo hayas escrito a mano. El historial se regía por otra regla
   —`historyMerged()` sólo rellenaba huecos, `if (cur.result == null)`— así que
   un día pasado se quedaba con su cifra guardada para siempre:

       · le borrabas las operaciones y seguía diciendo «+$100»
       · le editabas la salida de una y seguía diciendo la vieja
       · con una operación abierta decía «—» operaciones teniendo una

   Y el motivo de no haberlo tocado antes era real: arreglarlo a lo bruto pisa
   los días escritos A MANO, que son legítimos —apuntar el resultado sin
   registrar las operaciones— y que un día guardado antes de que existiera
   `resultManual` no sabe declarar. De ahí las dos mitades de esta prueba: el
   journal manda en lo derivado, y no toca ni lo escrito a mano ni lo que no
   sabe de dónde viene. */
import { chromium } from 'playwright';
import { quieto, arrancada } from './espera.mjs';

const fallos = [], errs = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const F = new Date('2026-09-17T14:00:00Z').getTime();
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

/* Un día guardado, con lo que la app escribe de verdad en `days/<fecha>`. */
const dia = (date, extra) => Object.assign({
  date, checks: {}, checksBy: {}, levels: {}, result: null, trades: null,
  broke: false, note: '', closed: true, resultManual: false, pre: null, pres: {},
}, extra);

const op = (id, date, exit) => ({
  id, type: 'futuros', accountId: 'a1', instrument: 'MNQ', direction: 'long',
  qty: 1, entry: 21000, stop: 20980, exit, date, time: '10:00',
});

const SEMILLA = {
  settings: { meta: { mx: { com: 0 } }, accounts: [CUENTA], rules: [] },
  days: {
    // derivado y SIN operaciones en el journal: la cifra guardada no tiene nada detrás
    '2026-09-10': dia('2026-09-10', { result: 100, trades: 1 }),
    // escrito a mano: intocable
    '2026-09-11': dia('2026-09-11', { result: 250, trades: 3, resultManual: true }),
    // derivado, con una operación que da OTRO número
    '2026-09-12': dia('2026-09-12', { result: 100, trades: 1 }),
    // derivado, con una sola operación ABIERTA
    '2026-09-15': dia('2026-09-15', { result: 100, trades: 1 }),
  },
  trades: {
    // +40 puntos × $2 = $80 en MNQ, contra los $100 guardados
    t1: op('t1', '2026-09-12', 21040),
    // abierta: sin salida
    t2: op('t2', '2026-09-15', null),
  },
};
/* El día legacy se mete SIN el campo `resultManual`, que es lo que de verdad
   distingue a un día viejo. Se construye aparte para que el molde no lo añada. */
SEMILLA.days['2026-09-13'] = {
  date: '2026-09-13', checks: {}, checksBy: {}, levels: {}, result: 75, trades: 2,
  broke: false, note: '', closed: true, pre: null, pres: {},
};

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEMILLA))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html');
await arrancada(p, '.tabbtn');
await quieto(p);

/* Devuelve [resultado, operaciones] como TEXTO de la fila de ese día. */
const filaDe = date => p.evaluate(d => {
  const tr = document.querySelector(`#histWrap tr[data-date="${d}"]`);
  if (!tr) return null;
  const c = tr.querySelectorAll('td');
  return [c[1].textContent.trim(), c[2].textContent.trim()];
}, date);

console.log('\n═══ 1 · un día derivado sin operaciones deja de inventarse una cifra ═══');
let f = await filaDe('2026-09-10');
ok(f !== null, 'el día sigue en el historial, no desaparece', f ? f.join(' · ') : 'NO ESTÁ');
ok(f && f[0] === '—', 'el resultado queda vacío, no «+$100»', f && f[0]);
ok(f && f[1] === '—', 'y las operaciones también', f && f[1]);

console.log('\n═══ 2 · lo escrito a mano no se toca ═══');
f = await filaDe('2026-09-11');
ok(f && /250/.test(f[0]), 'el resultado a mano se conserva', f && f[0]);
ok(f && f[1] === '3', 'y sus operaciones a mano también', f && f[1]);

console.log('\n═══ 3 · un día derivado sigue al journal cuando el journal cambia ═══');
f = await filaDe('2026-09-12');
ok(f && /\b80\b/.test(f[0]), 'manda el journal ($80), no la cifra guardada ($100)', f && f[0]);
ok(f && f[1] === '1', 'con su operación contada', f && f[1]);

console.log('\n═══ 4 · un día viejo sin «resultManual» conserva su cifra ═══');
f = await filaDe('2026-09-13');
ok(f && /75/.test(f[0]), 'no se pisa lo que no sabe de dónde viene', f && f[0]);
ok(f && f[1] === '2', 'ni sus operaciones', f && f[1]);

console.log('\n═══ 5 · una operación abierta cuenta como operación, no como resultado ═══');
f = await filaDe('2026-09-15');
ok(f && f[0] === '—', 'sin nada cerrado, el resultado está vacío', f && f[0]);
ok(f && f[1] === '1', 'pero la operación abierta se cuenta', f && f[1]);

console.log('\n═══ 6 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(`\n${fallos.length ? '❌' : '✅'} historial · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
