/* EL HISTORIAL UNIFICADO · las dos familias en una tabla, y NI UNA TERCERA VERDAD.

   La pestaña Historial enseña operaciones de futuros y de inversión juntas. Lo
   que la hace segura no es que la tabla esté bien pintada: es que no calcula
   nada. Pide cada subconjunto a `FUT.filtered({ tipo })` —la puerta única que
   ya usan el journal y las métricas— y enseña el resultado que la operación
   trae resuelto.

   LO QUE ESTE FICHERO VIGILA, Y POR QUÉ CADA COSA:

     1. QUE NO SEA UNA TERCERA LISTA. Con el filtro en «sólo futuros» y nada
        más puesto, el historial tiene que elegir exactamente las mismas
        operaciones que el journal de Futuros sin filtros. Si alguna vez
        divergen, es que una de las dos se saltó la puerta — que es la frase
        que la fachada FUT lleva escrita.

     2. QUE LAS DOS FAMILIAS NO SE MEZCLEN EN EL NOMBRE DE LA CUENTA. Los
        futuros viven en `state.settings.accounts`; las inversiones en
        `state.settings.meta.investAccounts`. Son DOS espacios de nombres, así
        que el mismo id puede existir en los dos y significar otra cosa. La
        prueba siembra una inversión con el id de una cuenta DE FUTUROS: si la
        tabla usara `acctLabel()` para las dos —el error natural— enseñaría el
        nombre de la cuenta de futuros en una fila de inversión. Tiene que
        decir «Cuenta desconocida», porque en SU espacio de nombres ese id no
        existe.

     3. QUE CADA FAMILIA SE LEA POR SUS CAMPOS. Un futuro tiene instrumento,
        dirección, entrada y salida; una inversión tiene activo, tipo de
        operación y precio. La misma columna, dos lecturas.

     4. QUE UN FILTRO IMPOSIBLE DÉ VACÍO Y LO DIGA. Una cuenta de futuros con
        el tipo puesto en «sólo inversiones» es un conjunto vacío, no una
        excusa para ignorar uno de los dos filtros.

     5. QUE LA BÚSQUEDA NO INVENTE DIRECCIONES. `qMatch` metía «largo long l»
        en el pajar de cualquier operación sin `direction` —el else de un
        ternario sin tercera salida—, así que buscar «largo» devolvía todas las
        inversiones. Para un futuro no cambia nada: siempre trae dirección.

   El nombre es `unificado` y no `historial` porque `test/historial.mjs` ya
   existe y vigila otra cosa —el historial de la Cabina contra el journal—, y
   dos filas de la compuerta no pueden citar la misma suite. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const mismos = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined' && typeof window.INV !== 'undefined', null, { timeout: 20000 });
await p.evaluate(() => {
  window.hasta = (que, fn, tope = 15000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const tic = () => {
      let v = false; try { v = fn(); } catch (e) { v = false; }
      if (v) return res(v);
      if (Date.now() - t0 > tope) return rej(new Error('nunca llegó: ' + que));
      setTimeout(tic, 25);
    };
    tic();
  });
});

const R = await p.evaluate(async () => {
  const iso = x => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(x);
  const hoy = iso(new Date());
  const ayer = iso(new Date(new Date(hoy + 'T12:00:00Z').getTime() - 86400000));

  FUT.createAccount({ id: 'UA', firm: 'Unificado', name: 'Prop Alfa', kind: 'Evaluación',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'activa', ledger: [], total: 0, best: 0 });

  // Futuros: MNQ, 1 punto = $2/contrato.
  FUT.createTrade({ id: 'U_FUT1', accountId: 'UA', instrument: 'MNQ', qty: 1, direction: 'long',
    date: hoy, time: '10:00', entry: 21000, stop: 20990, exit: 21050, lesson: 'respetó el plan' });
  FUT.createTrade({ id: 'U_FUT2', accountId: 'UA', instrument: 'MES', qty: 2, direction: 'short',
    date: ayer, time: '11:30', entry: 5800, stop: 5810, exit: 5790 });

  /* La inversión lleva el id de la cuenta DE FUTUROS a propósito: es el caso
     que separa los dos espacios de nombres. */
  INV.createTransaction({ id: 'U_INV1', accountId: 'UA', asset: 'SCHD', op: 'compra',
    date: hoy, qty: 10, price: 27.5, market: 'etfs', note: 'aporte mensual' });
  INV.createTransaction({ id: 'U_INV2', accountId: '', asset: 'VTI', op: 'venta',
    date: ayer, qty: 4, price: 300, pnl: 120, market: 'etfs' });

  await window.hasta('las 4 operaciones sembradas',
    () => coll => false || document.querySelectorAll('#hsTabla tbody tr[data-id]').length === 4);

  const $ = id => document.getElementById(id);
  const filas = () => [...document.querySelectorAll('#hsTabla tbody tr[data-id]')].map(tr => ({
    id: tr.dataset.id,
    celdas: [...tr.querySelectorAll('td')].map(td => td.textContent.trim()),
  }));
  const ids = () => filas().map(f => f.id);
  const pon = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const teclea = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const limpia = () => { $('hsLimpiar').click(); };

  limpia();
  const todo = filas();
  const meta = $('hsMeta').textContent;
  const opcionesCuenta = [...$('hsAcct').options].map(o => [o.value, o.textContent]);

  limpia(); pon('hsTipo', 'futuros');
  const soloFut = ids();
  limpia(); pon('hsTipo', 'inversion');
  const soloInv = ids();

  /* El journal de Futuros, sin filtros, para la comparación del punto 1. */
  FUT.setFilters({ acct: '', setup: '', instr: '', ses: '', q: '', range: 'all' });
  const journal = [...document.querySelectorAll('#jrTable tbody tr[data-id]')].map(tr => tr.dataset.id);

  limpia(); pon('hsAcct', 'f:UA'); pon('hsTipo', 'inversion');
  const imposible = ids();
  const vacioTexto = (document.querySelector('#hsTabla .empty') || {}).textContent || '';

  limpia(); teclea('hsQ', 'schd');
  const porActivo = ids();
  limpia(); teclea('hsQ', 'largo');
  const porLargo = ids();
  limpia(); teclea('hsQ', 'aporte');
  const porNota = ids();
  limpia();

  return { hoy, ayer, todo, meta, opcionesCuenta, soloFut, soloInv, journal,
    imposible, vacioTexto, porActivo, porLargo, porNota,
    nHist: $('nHist').textContent };
});

const fila = id => R.todo.find(f => f.id === id);
// Fecha · Hora · Tipo · Cuenta · Activo · Op. · Cant. · Precio · Resultado · Nota
const C = { fecha: 0, hora: 1, tipo: 2, cuenta: 3, activo: 4, op: 5, cant: 6, precio: 7, res: 8, nota: 9 };

console.log('\n═══ 1 · LAS DOS FAMILIAS, EN UNA TABLA ═══');
ok(R.todo.length === 4, 'el historial pinta las cuatro operaciones, de los dos tipos', `${R.todo.length}`);
ok(/2 de futuros/.test(R.meta) && /2 de inversión/.test(R.meta),
  'la cabecera cuenta cada familia por separado', R.meta);
ok(R.nHist === '4', 'el contador de la pestaña lleva las dos familias', `nHist=${R.nHist}`);
ok(fila('U_FUT1') && fila('U_FUT1').celdas[C.tipo] === 'futuros', 'una fila de futuros se marca futuros',
  fila('U_FUT1') && fila('U_FUT1').celdas[C.tipo]);
ok(fila('U_INV1') && fila('U_INV1').celdas[C.tipo] === 'inversión', 'una de inversión se marca inversión',
  fila('U_INV1') && fila('U_INV1').celdas[C.tipo]);
ok(R.todo[0].id === 'U_FUT1' || R.todo[0].id === 'U_INV1',
  'lo más reciente va arriba, mezclando familias', R.todo.map(f => f.id).join(' → '));

console.log('\n═══ 2 · LOS DOS ESPACIOS DE NOMBRES DE CUENTA NO SE MEZCLAN ═══');
ok(fila('U_FUT1').celdas[C.cuenta] === 'Prop Alfa',
  'el futuro enseña el nombre de su cuenta de futuros', fila('U_FUT1').celdas[C.cuenta]);
/* EL CASO QUE IMPORTA: la inversión lleva el id «UA», que en cuentas de
   futuros es «Prop Alfa» y en cuentas de inversión no existe. */
ok(fila('U_INV1').celdas[C.cuenta] === 'Cuenta desconocida',
  'la inversión con un id de la OTRA familia no hereda su nombre',
  fila('U_INV1').celdas[C.cuenta]);
ok(fila('U_INV1').celdas[C.cuenta] !== 'Prop Alfa',
  'y en particular no enseña el nombre de la cuenta de futuros',
  fila('U_INV1').celdas[C.cuenta]);
ok(fila('U_INV2').celdas[C.cuenta] === 'Sin asignar',
  'una inversión sin cuenta lo dice', fila('U_INV2').celdas[C.cuenta]);
ok(R.opcionesCuenta.some(([v, l]) => v === 'f:UA' && /futuros/.test(l)),
  'el selector de cuenta dice de qué familia es cada una',
  R.opcionesCuenta.map(([v]) => v).join(','));

console.log('\n═══ 3 · CADA FAMILIA SE LEE POR SUS CAMPOS ═══');
ok(fila('U_FUT1').celdas[C.activo] === 'MNQ', 'el futuro enseña su instrumento', fila('U_FUT1').celdas[C.activo]);
ok(fila('U_INV1').celdas[C.activo] === 'SCHD', 'la inversión enseña su activo', fila('U_INV1').celdas[C.activo]);
ok(fila('U_FUT1').celdas[C.op] === 'L' && fila('U_FUT2').celdas[C.op] === 'S',
  'la dirección del futuro es L o S', `${fila('U_FUT1').celdas[C.op]} / ${fila('U_FUT2').celdas[C.op]}`);
ok(fila('U_INV1').celdas[C.op] === 'compra' && fila('U_INV2').celdas[C.op] === 'venta',
  'la operación de inversión es compra o venta', `${fila('U_INV1').celdas[C.op]} / ${fila('U_INV2').celdas[C.op]}`);
ok(/21000/.test(fila('U_FUT1').celdas[C.precio]) && /21050/.test(fila('U_FUT1').celdas[C.precio]),
  'el futuro enseña entrada y salida', fila('U_FUT1').celdas[C.precio]);
ok(/27\.50/.test(fila('U_INV1').celdas[C.precio]),
  'la inversión enseña su precio', fila('U_INV1').celdas[C.precio]);
/* MNQ: 1 punto = $2/contrato, 50 puntos × 1 contrato = $100. No se calcula
   aquí: es el que el motor ya dejó en la operación. */
ok(/100/.test(fila('U_FUT1').celdas[C.res]),
  'el resultado del futuro es el que trae resuelto, +$100', fila('U_FUT1').celdas[C.res]);
ok(/120/.test(fila('U_INV2').celdas[C.res]),
  'y el de la inversión el que se anotó, +$120', fila('U_INV2').celdas[C.res]);
ok(fila('U_FUT1').celdas[C.nota] === 'respetó el plan',
  'la nota del futuro sale de su lección', fila('U_FUT1').celdas[C.nota]);
ok(fila('U_INV1').celdas[C.nota] === 'aporte mensual',
  'y la de la inversión de su nota', fila('U_INV1').celdas[C.nota]);

console.log('\n═══ 4 · NI UNA TERCERA VERDAD · contra el journal de Futuros ═══');
ok(mismos(R.soloFut, ['U_FUT1', 'U_FUT2']), '«sólo futuros» trae los dos futuros', R.soloFut.sort().join(','));
ok(mismos(R.soloInv, ['U_INV1', 'U_INV2']), '«sólo inversiones» trae las dos inversiones', R.soloInv.sort().join(','));
ok(mismos(R.soloFut, R.journal),
  'el historial en «sólo futuros» elige LO MISMO que el journal sin filtros',
  `historial [${R.soloFut.sort()}] · journal [${R.journal.sort()}]`);

console.log('\n═══ 5 · UN FILTRO IMPOSIBLE DA VACÍO, Y LO DICE ═══');
ok(R.imposible.length === 0,
  'cuenta de futuros + «sólo inversiones» no devuelve nada', `${R.imposible.length} filas`);
ok(/Sin operaciones que coincidan/.test(R.vacioTexto),
  'y la tabla lo explica en vez de quedarse en blanco', R.vacioTexto.slice(0, 60));

console.log('\n═══ 6 · LA BÚSQUEDA, SIN INVENTAR DIRECCIONES ═══');
ok(mismos(R.porActivo, ['U_INV1']), 'buscar «schd» encuentra la inversión por su activo', R.porActivo.join(','));
ok(mismos(R.porNota, ['U_INV1']), 'buscar «aporte» la encuentra por su nota', R.porNota.join(','));
/* El fallo que esto cierra: «largo long l» entraba en el pajar de CUALQUIER
   operación sin dirección, así que esta búsqueda devolvía las inversiones. */
ok(mismos(R.porLargo, ['U_FUT1']),
  'buscar «largo» trae el futuro largo y NINGUNA inversión', R.porLargo.sort().join(','));

ok(errs.length === 0, 'la página no lanzó ningún error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
