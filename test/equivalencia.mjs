/* EQUIVALENCIA · la capa de riesgo de la UI contra la del motor, MISMA pagina,
   MISMOS datos.

   index.html reimplementa cinco calculos que el Quant Engine ya tiene:

       app (index.html)                motor (engine/quant/)
       ────────────────────────────    ──────────────────────────────
       ddEngine        (linea 2926)    margenDeDrawdown   compliance.js:53
       riskEngine      (linea 2951)    margenDePerdida    compliance.js:30
       consistency     (linea 2878)    evaluarConsistencia curve.js
         + consEngine  (linea 2936)
       gainCap         (linea 2963)    topeDeGanancia     compliance.js:42
       evaluateAccountRules (3196)     evaluarCumplimiento compliance.js:72

   Y dos tablas de umbrales identicas con nombres de clave distintos: NIVELES en
   el motor (`hasta`/`codigo`/`etiqueta`/`clase`) contra RISK_STEPS en la app
   (`under`/`code`/`label`/`cls`), ambas 0.50 / 0.75 / 1.00.

   ESTE FICHERO NO ARREGLA LA DUPLICACION. La MIDE, y por eso se escribe ANTES de
   tocar nada: fija la REFERENCIA DORADA. Hoy las dos implementaciones coinciden
   al centavo, asi que la consolidacion de la fase 2 se verifica por igualdad
   numerica y no a ojo. El dia que una de las dos cambie sola, esto se pone rojo
   en la corrida siguiente en vez de descubrirse meses despues con un numero malo
   en pantalla.

   Las DOS diferencias conocidas, medidas y toleradas a proposito:

     1. El motor redondea a 4 decimales en la frontera de presentacion; la app no.
        Por eso se compara con tolerancia en `pct`, no con ===.
     2. Los codigos de nivel estan en idiomas distintos: la app dice `caution`, el
        motor dice `precaucion`. Y el CSS de la app se cuelga de `code`, asi que
        una consolidacion ingenua ROMPE LOS COLORES. Se comprueba la
        CORRESPONDENCIA entre los dos vocabularios, no la igualdad de la cadena.

   Su modo de fallo: que alguien "consolide" cambiando la UI para que llame al
   motor, y los numeros salgan distintos sin que nadie lo note porque la pantalla
   sigue teniendo el aspecto de siempre. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
/* `casi` con tolerancia al centavo: el motor redondea a 4 decimales y la app no. */
const casi = (a, b, e = 0.005) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= e;
const igual = (a, b, t, d) => ok(casi(a, b), t, d != null ? d : `app ${a} · motor ${b}`);
/* El mapeo entre los dos vocabularios, leido de compliance.js y de index.html:
   la app usa ingles y el motor español, y el CSS de la app se cuelga de `code`. */
const PAREJAS = { safe: 'seguro', caution: 'precaucion', danger: 'peligro', locked: 'agotado' };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined' && typeof window.QuantEngine !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1200);

/* Cuenta y operaciones con numeros elegidos a mano, no aleatorios: MNQ 1 punto =
   $2/contrato, asi que cada P&L de abajo se puede comprobar de cabeza.
   TRES dias distintos a proposito: la consistencia y el drawdown trailing no
   significan nada con un solo dia. */
const R = await p.evaluate(async () => {
  FUT.createAccount({ id: 'EQ1', firm: 'Equivalencia', name: 'Guardian 25K', kind: 'Evaluación',
    size: 25000, dd: 1500, ddKind: 'trailing_lock', trailBase: 'intradia',
    target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  const d = new Date(), iso = x => x.toISOString().slice(0, 10);
  const d3 = new Date(d.getTime() - 86400000 * 3), d2 = new Date(d.getTime() - 86400000 * 2);
  [
    { date: iso(d3), time: '09:00', entry: 21000, exit: 21060, qty: 2, direction: 'long' }, /* +120 pts x2 = +$240 */
    { date: iso(d2), time: '09:30', entry: 21000, exit: 20950, qty: 1, direction: 'long' }, /* -50 pts     = -$100 */
    { date: iso(d),  time: '10:00', entry: 21000, exit: 20980, qty: 1, direction: 'long' }, /* -20 pts     =  -$40 */
    { date: iso(d),  time: '10:30', entry: 21000, exit: 20975, qty: 1, direction: 'long' }, /* -25 pts     =  -$50 */
  ].forEach(o => FUT.createTrade(Object.assign({ accountId: 'EQ1', instrument: 'MNQ', stop: 20990 }, o)));
  await new Promise(r => setTimeout(r, 900));

  const QE = window.QuantEngine;
  const a = FUT.account('EQ1');
  const g = FUT.calculateAccountStats('EQ1');
  const ev = FUT.evaluateRules('EQ1');
  const diaHoy = FUT.calculateDailyStats('EQ1');

  /* ── lado APP ── */
  const appDD = FUT.calculateDrawdown('EQ1');
  const appCons = FUT.calculateConsistency('EQ1');
  const appRisk = ev.risk;

  /* ── lado MOTOR, alimentado con LOS MISMOS trades que ya calculo la app ── */
  const ordenadas = FUT.trades('EQ1').filter(t => t.pnlEff != null).slice()
    .sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.time || '').localeCompare(y.time || ''));
  const curva = QE.construirCurva(
    ordenadas.map((t, i) => ({ fecha: t.date, orden: i, pnl: t.pnlEff })),
    { saldoInicial: a.size, ddTipo: QE.DD_TIPOS.TRAILING_BLOQUEADO, ddMaximo: a.dd, base: 'intradia', movimientos: [] }
  ).value;
  const riesgos = ordenadas.map(t => t.riskUsd).filter(x => x != null && x > 0);
  const riesgoTipico = riesgos.length ? riesgos.reduce((s, x) => s + x, 0) / riesgos.length : null;
  const mDD = QE.margenDeDrawdown(curva, riesgoTipico);
  const mCons = QE.evaluarConsistencia(curva.dias.map(x => ({ fecha: x.fecha, pnl: x.pnl })),
    a.limit, { gananciaPrevia: 0, mejorDiaPrevio: 0 }).value;
  const reglaMaxLoss = FUT.rules().find(r => r.role === 'maxLoss');
  const mPerd = QE.margenDePerdida(diaHoy.pnl, reglaMaxLoss ? reglaMaxLoss.value : null);

  return {
    ctx: { size: a.size, dd: a.dd, limit: a.limit, balance: g.balance, pnlHoy: diaHoy.pnl,
           maxLoss: reglaMaxLoss ? reglaMaxLoss.value : null, riesgoTipico, dias: curva.dias.length,
           ops: ordenadas.length },
    dd: { app: { suelo: appDD.floor, colchon: appDD.buffer, usado: appDD.used, pct: appDD.util, quemada: appDD.breached },
          motor: { suelo: curva.suelo, colchon: mDD.colchon, usado: mDD.usado, pct: mDD.pct, quemada: mDD.quemada } },
    cons: { app: { ratio: appCons.ratio, mejor: appCons.best, total: appCons.total, tope: appCons.cap, falta: appCons.additional, cumple: appCons.compliant },
            motor: { ratio: mCons.ratio, mejor: mCons.mejor, total: mCons.total, tope: mCons.topeDiaHoy, falta: mCons.falta, cumple: mCons.cumple } },
    perd: { app: { max: appRisk.max, usado: appRisk.used, restante: appRisk.remaining, pct: appRisk.pct, codigo: appRisk.code, agotado: appRisk.locked },
            motor: { max: mPerd.max, usado: mPerd.usado, restante: mPerd.restante, pct: mPerd.pct, codigo: mPerd.codigo, agotado: mPerd.agotado } },
    /* NIVELES es const privada de compliance.js y RISK_STEPS es local del IIFE de
       la app: NINGUNA de las dos es alcanzable desde aqui. Se comprueban por su
       EFECTO -- un barrido que aterriza en cada banda -- y ademas de forma
       estatica sobre el fuente, fuera de la pagina. */
    barrido: (function () {
      const max = reglaMaxLoss ? Math.abs(reglaMaxLoss.value) : 0;
      if (!max) return null;
      /* Cuatro fracciones del limite, una por banda: <0.50, <0.75, <1.00, >=1.00. */
      return [0.30, 0.60, 0.85, 1.20].map(function (frac, i) {
        const id = 'EQB' + i;
        FUT.createAccount({ id, firm: 'Equivalencia', name: 'Banda ' + i, kind: 'Evaluación',
          size: 25000, dd: 1500, ddKind: 'estatico', trailBase: 'intradia',
          target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
        /* MNQ: 1 punto = $2/contrato, tickSize 0.25 -> la perdida se redondea al tick. */
        const pts = Math.round((frac * max / 2) / 0.25) * 0.25;
        FUT.createTrade({ accountId: id, instrument: 'MNQ', date: iso(d), time: '11:0' + i,
          entry: 21000, exit: 21000 - pts, qty: 1, direction: 'long', stop: 20990 });
        return { id, frac, pts };
      });
    })(),
    /* UNA CUENTA QUEMADA. Es el caso en el que las dos implementaciones NO son
       intercambiables sin cuidado: la app clampa el colchon a >= 0
       (`Math.max(0, g.balance - floor)`) y el motor lo devuelve NEGATIVO
       (`roundTo(curva.colchon, 2)`). El escenario dorado de arriba no esta quemado,
       asi que no lo detectaria. Se mide aqui para que la consolidacion de ddEngine
       tenga que decidirlo a proposito en vez de cambiarlo por accidente. */
    quemada: (function () {
      FUT.createAccount({ id: 'EQQ', firm: 'Equivalencia', name: 'Quemada', kind: 'Evaluación',
        size: 25000, dd: 500, ddKind: 'estatico', trailBase: 'intradia',
        target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
      /* -400 puntos x 1 contrato = -$800 contra un drawdown de $500: suelo 24.500,
         balance 24.200, colchon -300. */
      FUT.createTrade({ accountId: 'EQQ', instrument: 'MNQ', date: iso(d), time: '12:00',
        entry: 21000, exit: 20600, qty: 1, direction: 'long', stop: 20990 });
      return 'EQQ';
    })(),

    /* Las huerfanas que la fase 2 va a conectar: existir es requisito previo. */
    huerfanas: ['evaluarCumplimiento', 'radiografiaCuenta', 'topeDeGanancia', 'margenDeDrawdown',
                'margenDePerdida', 'evaluarConsistencia'].map(n => [n, typeof QE[n]]),
  };
});

/* El barrido se lee en una SEGUNDA evaluacion: las cuentas se crearon dentro de la
   primera, y la app necesita su vuelta de recalculo antes de que ev.risk valga. */
const BANDAS = await p.evaluate(async (barrido) => {
  if (!barrido) return null;
  await new Promise(r => setTimeout(r, 900));
  const QE = window.QuantEngine;
  const maxLoss = (FUT.rules().find(r => r.role === 'maxLoss') || {}).value;
  return barrido.map(x => {
    const dia = FUT.calculateDailyStats(x.id);
    const app = FUT.evaluateRules(x.id).risk;
    const motor = QE.margenDePerdida(dia.pnl, maxLoss);
    return { frac: x.frac, pnl: dia.pnl,
             app: { pct: app.pct, codigo: app.code, agotado: app.locked },
             motor: { pct: motor.pct, codigo: motor.codigo, agotado: motor.agotado } };
  });
}, R.barrido);

/* La cuenta quemada, tambien en la segunda pasada. */
const QUEMADA = await p.evaluate(async (id) => {
  if (!id) return null;
  await new Promise(r => setTimeout(r, 600));
  const QE = window.QuantEngine;
  const g = FUT.calculateAccountStats(id);
  const app = FUT.calculateDrawdown(id);
  const riesgos = FUT.trades(id).map(t => t.riskUsd).filter(x => x != null && x > 0);
  const motor = QE.margenDeDrawdown(g.curva, riesgos.length ? riesgos[0] : null);
  return { balance: g.balance, suelo: g.th,
           app: { colchon: app.buffer, usado: app.used, pct: app.util, quemada: app.breached },
           motor: { colchon: motor.colchon, usado: motor.usado, pct: motor.pct, quemada: motor.quemada } };
}, R.quemada);

console.log('\n═══ CONTEXTO · los datos que ven las dos implementaciones ═══');
const c = R.ctx;
ok(c.ops === 4 && c.dias === 3, 'la siembra llego entera a las dos',
   `${c.ops} operaciones en ${c.dias} dias · cuenta ${c.size} · dd ${c.dd} · limite ${c.limit}%`);
ok(casi(c.balance, 25050), 'el balance es el que dicen los numeros a mano',
   `${c.balance} = 25000 + 240 - 100 - 40 - 50`);
ok(casi(c.pnlHoy, -90), 'el P&L de hoy son las dos operaciones de hoy', `${c.pnlHoy} = -40 - 50`);

console.log('\n═══ DRAWDOWN · ddEngine (app) contra margenDeDrawdown (motor) ═══');
igual(R.dd.app.suelo, R.dd.motor.suelo, 'el suelo coincide');
igual(R.dd.app.colchon, R.dd.motor.colchon, 'el colchon coincide');
igual(R.dd.app.usado, R.dd.motor.usado, 'el drawdown usado coincide');
igual(R.dd.app.pct, R.dd.motor.pct, 'el porcentaje coincide (tolerancia: el motor redondea a 4dp)');
ok(R.dd.app.quemada === R.dd.motor.quemada, 'las dos dicen lo mismo sobre si la cuenta esta quemada',
   `app ${R.dd.app.quemada} · motor ${R.dd.motor.quemada}`);
/* El suelo no es un numero libre: lo define sueloPara. trailing_lock = min(pico - max, saldoInicial). */
ok(R.dd.motor.suelo <= c.size, 'el suelo de un trailing_lock nunca sube por encima del saldo inicial',
   `${R.dd.motor.suelo} <= ${c.size}`);

console.log('\n═══ CONSISTENCIA · consEngine (app) contra evaluarConsistencia (motor) ═══');
igual(R.cons.app.ratio, R.cons.motor.ratio, 'el ratio coincide');
igual(R.cons.app.mejor, R.cons.motor.mejor, 'el mejor dia coincide');
igual(R.cons.app.total, R.cons.motor.total, 'el total coincide');
igual(R.cons.app.tope, R.cons.motor.tope, 'el tope del dia coincide');
igual(R.cons.app.falta, R.cons.motor.falta, 'lo que falta para cumplir coincide');
ok(R.cons.app.cumple === R.cons.motor.cumple, 'las dos dicen lo mismo sobre si cumple',
   `app ${R.cons.app.cumple} · motor ${R.cons.motor.cumple}`);

console.log('\n═══ PERDIDA DIARIA · riskEngine (app) contra margenDePerdida (motor) ═══');
igual(R.perd.app.max, R.perd.motor.max, 'el maximo coincide');
igual(R.perd.app.usado, R.perd.motor.usado, 'lo usado coincide');
igual(R.perd.app.restante, R.perd.motor.restante, 'lo que resta coincide');
igual(R.perd.app.pct, R.perd.motor.pct, 'el porcentaje coincide (tolerancia: 4dp)');
ok(R.perd.app.agotado === R.perd.motor.agotado, 'las dos dicen lo mismo sobre si se agoto el dia',
   `app ${R.perd.app.agotado} · motor ${R.perd.motor.agotado}`);

console.log('\n═══ UNA SOLA TABLA DE UMBRALES · y la app la traduce, no la copia ═══');
/* Esta seccion cambio de trabajo con la consolidacion de la fase 2, y el cambio es
   el punto: ANTES comparaba dos tablas de umbrales para detectar que divergieran.
   Ahora hay UNA. Asi que lo que vigila es lo contrario -- que la segunda no vuelva
   -- mas el riesgo NUEVO que la consolidacion introduce: que el motor emita un
   codigo de nivel que la app no sepa traducir. Si eso pasa, `NIVEL_APP[codigo]` da
   undefined, el fallback mete el codigo español crudo en el atributo del que cuelga
   el CSS, y la tarjeta se queda sin color sin que falle ningun calculo.

   Es comparacion de TEXTO, dicho de frente. El comportamiento va en la seccion
   siguiente. */
const fuenteMotor = readFileSync(join(raiz, 'engine/quant/compliance.js'), 'utf8');
const fuenteApp = html.toString('utf8');

const iNiv = fuenteMotor.indexOf('const NIVELES = [');
const cuerpoNiv = iNiv < 0 ? '' : fuenteMotor.slice(iNiv, fuenteMotor.indexOf('];', iNiv));
const umbrales = Array.from(cuerpoNiv.matchAll(/hasta:\s*([\d.]+),\s*codigo:\s*"([a-z_]+)"/g))
  .map(m => ({ hasta: Number(m[1]), codigo: m[2] }));
ok(umbrales.length > 0, 'NIVELES sigue siendo la tabla de umbrales, en compliance.js',
   umbrales.length ? umbrales.map(n => `${n.hasta}=${n.codigo}`).join(' · ') : 'no se encontro');

/* La tabla duplicada tenia entradas `under: 0.50`. Que no vuelva ninguna. */
const duplicadas = Array.from(fuenteApp.matchAll(/under:\s*[\d.]+/g)).length;
ok(duplicadas === 0, 'index.html NO tiene una segunda tabla de umbrales',
   duplicadas ? `${duplicadas} entradas «under: N» han vuelto a index.html` : 'cero entradas «under:»');

/* TODOS los codigos que el motor puede emitir, no solo los tabulados: los dos
   niveles extremos (`agotado`, `quemada`) y el de sin regla estan escritos a mano
   dentro de las funciones, fuera de NIVELES. */
const codigosMotor = Array.from(new Set(
  Array.from(fuenteMotor.matchAll(/codigo:\s*"([a-z_]+)"/g)).map(m => m[1])));
const iMap = fuenteApp.indexOf('const NIVEL_APP = {');
const cuerpoMap = iMap < 0 ? '' : fuenteApp.slice(iMap, fuenteApp.indexOf('};', iMap));
const traducidos = Array.from(cuerpoMap.matchAll(/^\s*([a-z_]+):\s*\{\s*code:\s*"([a-z]+)"/gm))
  .map(m => ({ motor: m[1], app: m[2] }));
ok(iMap >= 0, 'NIVEL_APP existe en index.html', traducidos.length + ' codigos traducidos');
const sinTraducir = codigosMotor.filter(c => !traducidos.some(t => t.motor === c));
ok(sinTraducir.length === 0,
   `los ${codigosMotor.length} codigos que el motor puede emitir tienen traduccion en la app`,
   sinTraducir.length ? `SIN traducir: ${sinTraducir.join(' · ')} — la tarjeta se quedaria sin color`
     : traducidos.map(t => `${t.motor}→${t.app}`).join(' · '));
/* Y al reves: una traduccion que sobra es un codigo que el motor ya no emite, o un
   error de copia. No es grave, pero se dice. */
const sobran = traducidos.filter(t => !codigosMotor.includes(t.motor)).map(t => t.motor);
ok(sobran.length === 0, 'ninguna traduccion de NIVEL_APP apunta a un codigo que el motor no emite',
   sobran.length ? `sobran: ${sobran.join(' · ')}` : 'ninguna de sobra');

console.log('\n═══ LAS BANDAS, POR SU EFECTO · un caso que aterriza en cada una ═══');
/* Esto SI es comportamiento: cuatro cuentas con la perdida de hoy al 30%, 60%, 85%
   y 120% del limite diario. Si las dos tablas dejaran de coincidir, las dos
   implementaciones cruzarian el umbral en puntos distintos y esto se pondria rojo.
   Es lo que hace segura la consolidacion de la fase 2. */
ok(BANDAS !== null, 'hay una regla de perdida maxima diaria con la que barrer',
   BANDAS === null ? 'no hay regla maxLoss: el barrido no se puede hacer' : `${BANDAS.length} bandas`);
if (BANDAS) {
  const bandas = new Set();
  BANDAS.forEach(x => {
    bandas.add(x.app.codigo);
    igual(x.app.pct, x.motor.pct, `al ${Math.round(x.frac * 100)}% del limite el porcentaje coincide`,
      `pnl ${x.pnl} · app ${x.app.pct} · motor ${x.motor.pct}`);
    ok(PAREJAS[x.app.codigo] === x.motor.codigo,
      `al ${Math.round(x.frac * 100)}% las dos caen en la MISMA banda`,
      PAREJAS[x.app.codigo] === x.motor.codigo
        ? `app «${x.app.codigo}» · motor «${x.motor.codigo}»`
        : (PAREJAS[x.app.codigo] === undefined
            ? `la app dice «${x.app.codigo}», que NO figura en la tabla de correspondencia`
            : `app «${x.app.codigo}» (= «${PAREJAS[x.app.codigo]}») contra motor «${x.motor.codigo}»`));
    ok(x.app.agotado === x.motor.agotado,
      `al ${Math.round(x.frac * 100)}% las dos dicen lo mismo sobre si el dia esta agotado`,
      `app ${x.app.agotado} · motor ${x.motor.agotado}`);
  });
  ok(bandas.size >= 3, 'el barrido toca al menos tres bandas distintas',
     Array.from(bandas).join(' · '));
}

console.log('\n═══ CUENTA QUEMADA · donde las dos NO son intercambiables sin decidirlo ═══');
ok(QUEMADA !== null, 'la cuenta quemada se sembro', QUEMADA ? 'sembrada' : 'no se sembro');
if (QUEMADA) {
  const Q = QUEMADA;
  ok(casi(Q.balance, 24200) && casi(Q.suelo, 24500),
     'la cuenta esta quemada de verdad: el balance esta por DEBAJO del suelo',
     `balance ${Q.balance} · suelo ${Q.suelo} · diferencia ${Q.balance - Q.suelo}`);
  ok(Q.app.quemada === true && Q.motor.quemada === true,
     'las dos la reconocen como quemada', `app ${Q.app.quemada} · motor ${Q.motor.quemada}`);
  /* Esta es la DIFERENCIA, y se afirma tal cual en vez de esconderla: la app dice 0
     y el motor dice el numero negativo. Las dos son defendibles -- "no te queda
     nada" contra "te has pasado en 300" -- pero NO son el mismo numero, y quien
     consolide ddEngine tiene que elegir cual muestra la tarjeta. */
  ok(casi(Q.app.colchon, 0), 'la APP clampa el colchon a 0 cuando la cuenta esta quemada',
     `app ${Q.app.colchon}`);
  ok(Q.motor.colchon < 0, 'el MOTOR devuelve el colchon NEGATIVO: cuanto te pasaste',
     `motor ${Q.motor.colchon}`);
  ok(!casi(Q.app.colchon, Q.motor.colchon),
     'queda afirmado que en este caso los dos numeros NO coinciden',
     `app ${Q.app.colchon} · motor ${Q.motor.colchon} — decision pendiente de la fase 2`);
  /* El porcentaje, en cambio, si coincide: las dos lo clampan a 1. */
  igual(Q.app.pct, Q.motor.pct, 'el porcentaje usado SI coincide (las dos lo clampan a 1)');
  ok(casi(Q.app.pct, 1), 'y vale exactamente 1', `${Q.app.pct}`);
}

console.log('\n═══ REFERENCIA DORADA · los numeros de ANTES de consolidar, como literales ═══');
/* POR QUE ESTA SECCION EXISTE, y por que sin ella el fichero se vuelve inutil:
   las secciones de arriba comparan la app contra el motor. En el momento en que la
   fase 2 haga que la app LLAME al motor, esa comparacion pasa a ser tautologica --
   compara el motor consigo mismo y no puede fallar. Seria exactamente lo que el
   protocolo 15 prohibe: una prueba que siempre pasa porque ya no mira nada.

   Asi que los valores medidos ANTES de consolidar quedan aqui escritos a mano. La
   consolidacion es correcta si y solo si estos numeros NO cambian. Esto es lo que
   convierte "los arregle y siguen verdes" en una afirmacion comprobable.

   Si un cambio de producto los mueve a proposito, se actualizan A MANO y se dice en
   el commit cual y por que. No se regeneran automaticamente: un valor dorado que se
   regenera solo no es una referencia, es un eco. */
const DORADO = {
  contexto:  { balance: 25050, pnlHoy: -90 },
  drawdown:  { suelo: 23740, colchon: 1310, usado: 190, pct: 0.1267 },
  consistencia: { ratio: 4.8, mejor: 240, total: 50, tope: 21.43, falta: 750 },
  perdida:   { max: 150, usado: 90, restante: 60, pct: 0.6 },
  bandas:    [{ frac: 0.30, pnl: -45,    pct: 0.30, app: 'safe' },
              { frac: 0.60, pnl: -90,    pct: 0.60, app: 'caution' },
              { frac: 0.85, pnl: -127.5, pct: 0.85, app: 'danger' },
              { frac: 1.20, pnl: -180,   pct: 1.00, app: 'locked' }],
};
const dorado = (obtenido, esperado, t) =>
  ok(casi(obtenido, esperado), t, `obtenido ${obtenido} · dorado ${esperado}`);

dorado(R.ctx.balance, DORADO.contexto.balance, 'el balance sigue siendo el dorado');
dorado(R.ctx.pnlHoy, DORADO.contexto.pnlHoy, 'el P&L de hoy sigue siendo el dorado');
dorado(R.dd.app.suelo, DORADO.drawdown.suelo, 'el suelo que da la APP sigue siendo el dorado');
dorado(R.dd.app.colchon, DORADO.drawdown.colchon, 'el colchon que da la APP sigue siendo el dorado');
dorado(R.dd.app.usado, DORADO.drawdown.usado, 'el drawdown usado que da la APP sigue siendo el dorado');
dorado(R.dd.app.pct, DORADO.drawdown.pct, 'el porcentaje de drawdown de la APP sigue siendo el dorado');
dorado(R.cons.app.ratio, DORADO.consistencia.ratio, 'el ratio de consistencia de la APP sigue siendo el dorado');
dorado(R.cons.app.mejor, DORADO.consistencia.mejor, 'el mejor dia que da la APP sigue siendo el dorado');
dorado(R.cons.app.total, DORADO.consistencia.total, 'el total que da la APP sigue siendo el dorado');
dorado(R.cons.app.tope, DORADO.consistencia.tope, 'el tope del dia que da la APP sigue siendo el dorado');
dorado(R.cons.app.falta, DORADO.consistencia.falta, 'lo que falta segun la APP sigue siendo el dorado');
dorado(R.perd.app.max, DORADO.perdida.max, 'el maximo de perdida diaria de la APP sigue siendo el dorado');
dorado(R.perd.app.usado, DORADO.perdida.usado, 'la perdida usada segun la APP sigue siendo la dorada');
dorado(R.perd.app.restante, DORADO.perdida.restante, 'lo que resta segun la APP sigue siendo el dorado');
dorado(R.perd.app.pct, DORADO.perdida.pct, 'el porcentaje de perdida de la APP sigue siendo el dorado');
if (BANDAS) {
  const malas = DORADO.bandas.map((g, i) => {
    const x = BANDAS[i];
    if (!x) return `banda ${i} ausente`;
    if (!casi(x.pnl, g.pnl)) return `al ${g.frac * 100}% el pnl es ${x.pnl}, dorado ${g.pnl}`;
    if (!casi(x.app.pct, g.pct)) return `al ${g.frac * 100}% el pct de la app es ${x.app.pct}, dorado ${g.pct}`;
    if (x.app.codigo !== g.app) return `al ${g.frac * 100}% la app dice «${x.app.codigo}», dorado «${g.app}»`;
    return null;
  }).filter(Boolean);
  ok(malas.length === 0, 'las cuatro bandas de la APP siguen siendo las doradas',
     malas.length ? malas.join(' · ') : DORADO.bandas.map(g => `${g.frac * 100}%=${g.app}`).join(' · '));
}

console.log('\n═══ LAS FUNCIONES QUE LA FASE 2 VA A CONECTAR · existen hoy ═══');
R.huerfanas.forEach(([n, t]) => ok(t === 'function', `QE.${n} existe y es funcion`, t));

ok(errs.length === 0, 'la pagina no lanzo ningun error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
