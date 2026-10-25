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

     6. QUE EL CSV SALGA DE LAS OPERACIONES Y SALGAN TODAS. La tabla pinta 250
        filas y un botón; exportar lo PINTADO daría 250 líneas de un historial
        de mil sin decir que faltan setecientas cincuenta. El §7 siembra 260
        operaciones a propósito para que la tabla recorte y el fichero no.
        Y el fichero no puede llevar HTML dentro: si lo lleva, es que alguien
        volvió a raspar las celdas en vez de leer la operación.

   El nombre es `unificado` y no `historial` porque `test/historial.mjs` ya
   existe y vigila otra cosa —el historial de la Cabina contra el journal—, y
   dos filas de la compuerta no pueden citar la misma suite. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const mismos = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext({ acceptDownloads: true })).newPage();
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

console.log('\n═══ 7 · EL CSV SALE DE LAS OPERACIONES, Y SALEN TODAS ═══');
{
  const lineas = async () => {
    const espera = p.waitForEvent('download');
    await p.click('#hsExport');
    const f = await espera;
    return readFileSync(await f.path(), 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  };
  /* Los bloques de arriba tocan el DOM desde `evaluate`, que funciona sobre
     una pestaña oculta. Una descarga no: el botón tiene que ser pulsable de
     verdad, así que aquí se entra en la pestaña como se entra de verdad. */
  await p.click('#tabnav .tabbtn[data-tab="historial"]');
  await quieto(p);
  await p.click('#hsLimpiar');
  await quieto(p);
  const todo = await lineas();
  const cab = todo[0];
  ok(/^"Fecha","Hora","Tipo","Cuenta","Activo","Operación","Cantidad","Entrada","Salida","Estado","Resultado","R","Nota"$/.test(cab),
    'la cabecera son las trece columnas, en orden', cab);
  ok(todo.length === 5, 'cuatro operaciones sembradas, cuatro líneas de datos', `${todo.length - 1} filas`);
  /* Si esto encuentra un `<span`, es que alguien volvió a raspar las celdas:
     la columna «Resultado» de una operación abierta lleva uno dentro. */
  ok(!/<[a-z]/i.test(todo.join('')), 'no hay una sola etiqueta HTML en el fichero');

  /* Por POSICIÓN, no por «contiene». Una aserción que sólo busca el texto
     pasa en verde aunque la columna sea otra, y la celda que importa aquí es
     justamente una que tiene que estar VACÍA: un `includes` nunca la ve.
     Cada campo va entrecomillado y las comillas internas van dobladas, así que
     partir por `","` recupera los trece campos tal cual. */
  const campos = l => l.slice(1, -1).split('","');
  const K = { fecha: 0, hora: 1, tipo: 2, cuenta: 3, activo: 4, op: 5, cant: 6,
              entrada: 7, salida: 8, estado: 9, res: 10, r: 11, nota: 12 };
  const fut = campos(todo.find(l => l.includes('MNQ')) || '""');
  const inv = campos(todo.find(l => l.includes('SCHD')) || '""');
  ok(fut[K.tipo] === 'futuros' && fut[K.op] === 'largo' && fut[K.entrada] === '21000'
     && fut[K.salida] === '21050' && fut[K.estado] === 'cerrada',
    'el futuro sale con su familia, su dirección, su entrada, su salida y su estado', fut.join(' | '));
  ok(inv[K.tipo] === 'inversión' && inv[K.op] === 'compra' && inv[K.entrada] === '27.5',
    'la inversión sale con la suya, su operación y su precio', inv.join(' | '));
  /* Salida, Estado y R van VACÍOS en una inversión A PROPÓSITO: una compra no
     está «abierta» ni «cerrada» —eso lo resuelve la posición, no la operación—
     y no tiene R. Rellenar cualquiera de las tres sería inventar un dato, y es
     el tipo de invención que nadie revisa en un CSV de mil líneas. */
  ok(inv[K.salida] === '' && inv[K.estado] === '' && inv[K.r] === '',
    'y con salida, estado y R vacíos en vez de inventados',
    `salida=«${inv[K.salida]}» estado=«${inv[K.estado]}» R=«${inv[K.r]}»`);
  ok(fut[K.r] !== '' && fut[K.cuenta] === 'Prop Alfa',
    'el futuro sí trae R y el nombre de su cuenta de futuros', `R=${fut[K.r]} · ${fut[K.cuenta]}`);

  /* El filtro manda sobre el fichero, no sólo sobre la tabla. */
  await p.evaluate(() => {
    const el = document.getElementById('hsTipo');
    el.value = 'inversion'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await quieto(p);
  const soloInv = await lineas();
  ok(soloInv.length === 3 && !soloInv.join('').includes('MNQ'),
    'con «sólo inversiones» el fichero trae dos filas y ningún futuro', `${soloInv.length - 1} filas`);

  /* Un filtro imposible apaga el botón: un fichero con la cabecera y nada
     debajo parece una exportación que funcionó. */
  await p.evaluate(() => {
    const t = document.getElementById('hsAcct');
    t.value = 'f:UA'; t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await quieto(p);
  ok(await p.locator('#hsExport').isDisabled(), 'sin filas que exportar, el botón se apaga');

  /* LA QUE DE VERDAD IMPORTA. 260 operaciones: la tabla recorta a 250 y el
     fichero tiene que traer las 260. Exportar lo pintado pasaría todas las
     aserciones de arriba y fallaría ésta. */
  await p.evaluate(async () => {
    document.getElementById('hsLimpiar').click();
    for (let i = 0; i < 256; i++) {
      FUT.createTrade({ id: 'U_MASA' + i, accountId: 'UA', instrument: 'MNQ', qty: 1, direction: 'long',
        date: '2026-01-' + String((i % 28) + 1).padStart(2, '0'), time: '10:00',
        entry: 21000, stop: 20990, exit: 21010 });
    }
    await window.hasta('las 260 operaciones en la lista',
      () => /\bde 260\b/.test(document.getElementById('hsMeta').textContent));
  });
  await quieto(p);
  const pintadas = await p.locator('#hsTabla tbody tr[data-id]').count();
  const masa = await lineas();
  ok(pintadas === 250, 'la tabla recorta a 250 filas', String(pintadas));
  ok(masa.length === 261, 'y el fichero trae las 260, no las 250 pintadas', `${masa.length - 1} filas`);
}

ok(errs.length === 0, 'la página no lanzó ningún error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
