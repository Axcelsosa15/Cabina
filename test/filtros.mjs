/* EL MISMO FILTRO, LAS MISMAS OPERACIONES · Futuros contra Métricas / Edge.

   La colección `trades` se filtra en cinco sitios con cinco vocabularios:

       pantalla            objeto    fechas                 campos
       ──────────────────  ────────  ─────────────────────  ─────────────────────────
       Futuros             ft        presets (30/90/mes/año) cuenta setup instr ses q
       Métricas / Edge     mx        desde / hasta           cuenta setup
       Hist. ejecuciones   exec      desde / hasta           cuenta instrumento q
       Inversiones         ivj       —                       cuenta estrategia
       Pre-sesiones        prf       presets                 —

   Las dos primeras leen LAS MISMAS operaciones de futuros y las enseñan una al
   lado de la otra en la misma app, pero contestan «¿qué operaciones entran?»
   con dos implementaciones distintas: `inRange()` + `acctMatch()` en una,
   cuatro `filter` en línea dentro de `mxOps()` en la otra. Mientras eso siga
   así, nada impide que una empiece a seleccionar un conjunto y la otra otro —y
   el conjunto de Métricas es el que decide la expectativa, el profit factor y
   el drawdown, o sea el número que dice si el sistema paga.

   NADIE LO VIGILABA. Se comprobó recorriendo las 35 filas de la compuerta: hay
   una que cuadra las métricas con la cuenta a mano (`edge`) y otra que cuadra
   la capa de riesgo con el motor (`equivalencia`), pero ninguna compara los dos
   FILTROS entre sí. Un cambio que unifique los cinco dialectos —que es
   exactamente lo que este repositorio quiere hacer— pasaría en verde aunque
   moviera qué operaciones entran en el edge. Esta prueba existe para cerrar esa
   puerta ANTES de abrir la otra.

   QUÉ COMPARA: los IDs que cada pantalla PINTA, no funciones internas. `ft`
   ordena y pagina en `jrTable`, `mx` corta a 300 en `mxTabla`; con la muestra
   de abajo ninguna de las dos recorta, así que la tabla es el conjunto. Comparar
   lo pintado también sobrevive al refactor: después de unificar, las dos tienen
   que seguir enseñando lo mismo.

   LAS DIFERENCIAS LEGÍTIMAS, DECLARADAS Y AFIRMADAS ABAJO:

     1. UNA OPERACIÓN ABIERTA SALE EN EL JOURNAL Y NO EN MÉTRICAS. `mxCalc()`
        descarta lo que `mxNeto()` no sabe valorar, y sin salida no hay neto.
        No es un desacuerdo entre filtros: es que Métricas mide resultados y el
        journal registra operaciones. Se afirma para que unificar el filtro no
        la borre por accidente.
     2. `mx` no tiene instrumento, sesión ni búsqueda libre. Esas tres
        dimensiones no se comparan porque no existen en los dos lados.
     3. El setup tampoco se compara: los dos lo resuelven con la MISMA
        expresión (`t.setupId === valor`) y una cabina recién arrancada no trae
        playbooks, así que sembrarlos pediría pasar por el editor. Se dice en
        vez de disimularse. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
/* Dos conjuntos de IDs son iguales sin importar el orden: `ft` ordena por fecha
   descendente y `mx` invierte su propia lista. El orden es cosa de cada tabla;
   lo que esta prueba mide es QUIÉN entra. */
const mismos = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const igualSet = (a, b, t) => ok(mismos(a, b), t,
  mismos(a, b) ? `${a.length} operaciones en las dos` : `journal [${[...a].sort()}] · edge [${[...b].sort()}]`);
const esc = n => R.escenarios.find(x => x.nombre === n);

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
/* SERVIA EL HTML PARA CUALQUIER RUTA. Con la aplicación dentro del documento
   daba igual; desde que la página pide `./app.js`, el navegador recibía HTML
   donde esperaba un script, lo rechazaba por MIME y la página no arrancaba.
   `sirvePublicado` sirve lo que sube Pages —leído del propio workflow— y 404
   para lo demás, que es lo que hace útil a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined' && typeof window.QuantEngine !== 'undefined', null, { timeout: 20000 });

/* Esperar a la CONDICIÓN, no al reloj: test/README lo prohíbe con nombre y
   apellido, y una espera fija convierte «la máquina va lenta» en «la prueba
   está roja». `hasta` recibe el nombre de lo que espera, así que si no llega,
   el mensaje lo nombra. */
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

/* EL «HOY» DE LA APP ES EL DE NUEVA YORK, no el de UTC: `state.today` sale de
   `etNow()`. Sembrar con toISOString() pone las operaciones en el día UTC, y
   entre las 00:00 y las 04:00 UTC eso es el día anterior para la app — con un
   filtro de ventana, un desplazamiento de un día mueve exactamente la operación
   que está en el borde. La fecha se calcula igual que la calcula la app. */
const R = await p.evaluate(async () => {
  const iso = x => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(x);
  const hoy = iso(new Date());
  const menos = n => iso(new Date(new Date(hoy + 'T12:00:00Z').getTime() - 86400000 * n));
  /* El borde de «últimos 30 días», calculado como lo calcula `inRange()`: hoy
     en ET, menos 30 días en UTC sobre el mediodía. Si esta cuenta y la de la
     app dejan de coincidir, la operación sembrada justo encima del borde lo
     dice. */
  const borde = (() => { const l = new Date(hoy + 'T12:00:00Z'); l.setUTCDate(l.getUTCDate() - 30); return l.toISOString().slice(0, 10); })();
  /* Las cotas de «este mes» y «este año», que es lo que el preset tiene que
     resolver. El día 0 del mes siguiente es el último de este: sin tabla de
     28/30/31 y sin año bisiesto que se olvide. */
  const mesIni = hoy.slice(0, 7) + '-01';
  const mesFin = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
  const anioIni = hoy.slice(0, 4) + '-01-01', anioFin = hoy.slice(0, 4) + '-12-31';
  /* Una fecha del mes QUE VIENE y otra del año pasado. La primera es el caso
     que separa las dos gramáticas: «este mes» la deja fuera porque acota por
     arriba, y «últimos 30 días» la mete porque no acota por arriba — eso era
     `d.slice(0,7) === hoy.slice(0,7)` contra `d >= lim`, y al convertir el
     preset en cotas había que conservarlo exactamente. */
  const mesQueViene = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 15, 12)).toISOString().slice(0, 10);
  const anioPasado = (Number(hoy.slice(0, 4)) - 1) + '-06-15';

  FUT.createAccount({ id: 'FA', firm: 'Filtros', name: 'Cuenta A', kind: 'Evaluación',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'activa', ledger: [], total: 0, best: 0 });
  FUT.createAccount({ id: 'FB', firm: 'Filtros', name: 'Cuenta B', kind: 'Evaluación',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'activa', ledger: [], total: 0, best: 0 });
  /* Las dos operaciones que miden los presets van en SU PROPIA cuenta, para no
     mover ninguna de las referencias doradas de FA y FB. */
  FUT.createAccount({ id: 'FC', firm: 'Filtros', name: 'Cuenta C', kind: 'Evaluación',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'activa', ledger: [], total: 0, best: 0 });

  /* MNQ: 1 punto = $2 por contrato, así que cada resultado se comprueba de
     cabeza. Las fechas están elegidas alrededor del borde de los 30 días: una
     dentro, una JUSTO ENCIMA y una fuera. */
  const semilla = [
    { id: 'T_hoy_A',    accountId: 'FA', date: hoy,        time: '10:00', entry: 21000, exit: 21050 },
    { id: 'T_d10_A',    accountId: 'FA', date: menos(10),  time: '10:00', entry: 21000, exit: 20980 },
    { id: 'T_d10_B',    accountId: 'FB', date: menos(10),  time: '11:00', entry: 21000, exit: 21030 },
    { id: 'T_borde_B',  accountId: 'FB', date: borde,      time: '09:45', entry: 21000, exit: 21010 },
    { id: 'T_d45_A',    accountId: 'FA', date: menos(45),  time: '10:00', entry: 21000, exit: 20970 },
    /* Sin cuenta: el filtro «sin cuenta asignada» es `__none` en los DOS
       objetos, y es la clase de valor centinela que un refactor pierde. */
    { id: 'T_hoy_SIN',  accountId: '',   date: hoy,        time: '12:00', entry: 21000, exit: 21020 },
    /* Para los presets: una en el mes que viene y otra en el año pasado. */
    { id: 'T_futura_C', accountId: 'FC', date: mesQueViene, time: '10:00', entry: 21000, exit: 21040 },
    { id: 'T_ayer_C',   accountId: 'FC', date: anioPasado,  time: '10:00', entry: 21000, exit: 20960 },
  ];
  semilla.forEach(o => FUT.createTrade(Object.assign({ instrument: 'MNQ', qty: 1, direction: 'long', stop: 20990 }, o)));
  /* La abierta va aparte: sin salida no tiene neto, y es la diferencia nº 1. */
  FUT.createTrade({ id: 'T_ABIERTA', accountId: 'FA', instrument: 'MNQ', qty: 1, direction: 'long',
    date: hoy, time: '13:00', entry: 21000, stop: 20990 });

  await window.hasta('las 8 operaciones cerradas con su P&L derivado',
    () => FUT.trades().filter(t => t.pnlEff != null).length === 8);

  const $ = id => document.getElementById(id);
  const idsJournal = () => [...document.querySelectorAll('#jrTable tbody tr[data-id]')].map(tr => tr.dataset.id);
  const idsEdge = () => [...document.querySelectorAll('#mxTabla tbody tr[data-mx]')].map(tr => tr.dataset.mx);
  /* La comparación va contra lo CERRADO, y por la diferencia nº 1 declarada
     arriba: Métricas mide resultados, así que una operación sin salida no puede
     estar en su tabla por mucho que el filtro la seleccione. Comparar los dos
     conjuntos en crudo mediría esa diferencia una y otra vez en vez de medir
     los filtros. Qué está cerrado NO se da por sabido desde la semilla: se lee
     de la app, que es quien deriva el P&L. */
  const cerradas = new Set(FUT.trades().filter(t => t.pnlEff != null).map(t => t.id));
  const idsJournalCerradas = () => idsJournal().filter(id => cerradas.has(id));
  /* Las dos pantallas se piden por su puerta: `FUT.setFilters` es la pública de
     Futuros; Métricas no tiene fachada, así que se toca su control y se dispara
     el `change` — que es lo que hace una persona. */
  const pon = (sel, valor) => { const el = $(sel); el.value = valor; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const limpia = () => {
    FUT.setFilters({ acct: '', setup: '', instr: '', ses: '', q: '', range: 'all' });
    ['mxAcct', 'mxSetup'].forEach(s => pon(s, ''));
    ['mxDesde', 'mxHasta'].forEach(s => pon(s, ''));
  };

  const escenarios = [];
  const mide = (nombre, prepara) => {
    limpia(); prepara();
    escenarios.push({ nombre, journal: idsJournal(), cerradas: idsJournalCerradas(), edge: idsEdge() });
  };

  mide('sin filtro', () => {});
  mide('una cuenta', () => { FUT.setFilters({ acct: 'FA' }); pon('mxAcct', 'FA'); });
  mide('la otra cuenta', () => { FUT.setFilters({ acct: 'FB' }); pon('mxAcct', 'FB'); });
  mide('sin cuenta asignada', () => { FUT.setFilters({ acct: '__none' }); pon('mxAcct', '__none'); });
  mide('ventana de 30 días', () => { FUT.setFilters({ range: '30' }); pon('mxDesde', borde); });
  mide('cuenta + ventana de 30 días', () => {
    FUT.setFilters({ acct: 'FA', range: '30' }); pon('mxAcct', 'FA'); pon('mxDesde', borde);
  });
  /* LOS PRESETS CONTRA SUS COTAS. Es la pareja que prueba el resolvedor: el
     journal pide «este mes» con una palabra, Métricas pide el mismo mes con
     dos fechas, y tienen que elegir lo mismo. Si el preset se resolviera mal
     —un mes de 30 días donde toca 31, un año bisiesto, o perder la cota de
     arriba— estas dos filas caen y las anteriores no. */
  mide('preset «este mes» contra sus dos fechas', () => {
    FUT.setFilters({ range: 'month' }); pon('mxDesde', mesIni); pon('mxHasta', mesFin);
  });
  mide('preset «este año» contra sus dos fechas', () => {
    FUT.setFilters({ range: 'year' }); pon('mxDesde', anioIni); pon('mxHasta', anioFin);
  });

  limpia();
  const todoJournal = idsJournal(), todoEdge = idsEdge();
  const opcionesMxAcct = [...$('mxAcct').options].map(o => o.value);
  limpia();

  return { hoy, borde, mesIni, mesFin, anioIni, anioFin, mesQueViene, anioPasado,
    escenarios, todoJournal, todoEdge, opcionesMxAcct,
    sembradas: semilla.map(s => s.id).concat('T_ABIERTA') };
});

console.log('\n═══ LA MUESTRA ═══');
ok(R.todoJournal.length === 9, 'el journal pinta las 9 operaciones sembradas', `${R.todoJournal.length}`);
ok(R.borde < R.hoy, 'el borde de los 30 días cae antes que hoy', `hoy ${R.hoy} · borde ${R.borde}`);
ok(R.opcionesMxAcct.includes('__none'),
  'Métricas ofrece «sin cuenta asignada», o la comparación de ese caso no mediría nada',
  R.opcionesMxAcct.join(','));

console.log('\n═══ EL MISMO FILTRO SELECCIONA LAS MISMAS OPERACIONES ═══');
for (const e of R.escenarios) igualSet(e.cerradas, e.edge, `«${e.nombre}»: journal y edge coinciden`);

console.log('\n═══ Y SELECCIONAN LAS QUE DEBEN · referencia dorada ═══');
/* Dorados escritos a mano: que los dos lados coincidan no sirve de nada si los
   dos se equivocan igual. Estas cifras no pueden moverse sin que alguien lo
   decida. */
ok(mismos(esc('una cuenta').cerradas, ['T_hoy_A', 'T_d10_A', 'T_d45_A']),
  'cuenta A: sus tres operaciones cerradas, ni la de B ni la de nadie',
  esc('una cuenta').cerradas.sort().join(','));
ok(mismos(esc('sin cuenta asignada').cerradas, ['T_hoy_SIN']),
  '«sin cuenta asignada» trae sólo la que no tiene cuenta',
  esc('sin cuenta asignada').cerradas.sort().join(','));
/* La futura entra en «últimos 30 días»: ese preset no acota por arriba, como
   no lo acotaba el `d >= lim` original. Pinarlo aquí es lo que impide que un
   refactor del resolvedor le ponga un techo «porque parece razonable». */
ok(mismos(esc('ventana de 30 días').cerradas, ['T_hoy_A', 'T_d10_A', 'T_d10_B', 'T_borde_B', 'T_hoy_SIN', 'T_futura_C']),
  'la ventana de 30 días incluye el borde y la futura, y deja fuera la de hace 45',
  esc('ventana de 30 días').cerradas.sort().join(','));
ok(mismos(esc('cuenta + ventana de 30 días').cerradas, ['T_hoy_A', 'T_d10_A']),
  'dos filtros a la vez se cruzan, no se suman',
  esc('cuenta + ventana de 30 días').cerradas.sort().join(','));

console.log('\n═══ LOS PRESETS DE FECHA · una palabra y dos fechas eligen lo mismo ═══');
ok(!esc('preset «este mes» contra sus dos fechas').cerradas.includes('T_futura_C'),
  '«este mes» deja fuera la del mes que viene: acota por arriba', `hasta ${R.mesFin} · futura ${R.mesQueViene}`);
ok(!esc('preset «este mes» contra sus dos fechas').cerradas.includes('T_ayer_C'),
  'y también la del año pasado', `desde ${R.mesIni} · vieja ${R.anioPasado}`);
ok(!esc('preset «este año» contra sus dos fechas').cerradas.includes('T_ayer_C'),
  '«este año» deja fuera la del año pasado', `desde ${R.anioIni} · vieja ${R.anioPasado}`);
ok(esc('preset «este año» contra sus dos fechas').cerradas.includes('T_hoy_A'),
  'y sí trae la de hoy', `hasta ${R.anioFin}`);

console.log('\n═══ LAS DIFERENCIAS LEGÍTIMAS · declaradas, no descubiertas ═══');
ok(R.todoJournal.includes('T_ABIERTA'),
  'la operación abierta SÍ sale en el journal: es una operación', 'T_ABIERTA en jrTable');
ok(esc('una cuenta').journal.includes('T_ABIERTA'),
  'y sigue saliendo con un filtro puesto: el filtro la selecciona, Métricas no la puede valorar',
  esc('una cuenta').journal.sort().join(','));
ok(!R.todoEdge.includes('T_ABIERTA'),
  'la operación abierta NO sale en Métricas: sin salida no hay neto que medir', 'T_ABIERTA fuera de mxTabla');
ok(R.todoEdge.length === R.todoJournal.length - 1,
  'y esa es la ÚNICA diferencia sin filtros', `journal ${R.todoJournal.length} · edge ${R.todoEdge.length}`);

ok(errs.length === 0, 'la página no lanzó ningún error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
