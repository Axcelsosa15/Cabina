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

console.log('\n═══ LAS DOS TABLAS DE UMBRALES · comparacion ESTATICA del fuente ═══');
/* Honestidad sobre el metodo: esto compara TEXTO, no comportamiento. Lo hace
   porque ninguna de las dos tablas es alcanzable en ejecucion -- NIVELES es const
   privada de compliance.js y RISK_STEPS es local del IIFE de la app -- y porque el
   fallo que importa es que alguien edite una y no la otra. El comportamiento se
   comprueba en la seccion siguiente. */
const leerTabla = (texto, nombre, reUmbral) => {
  const i = texto.indexOf(nombre);
  if (i < 0) return null;
  const cuerpo = texto.slice(i, texto.indexOf('];', i));
  return Array.from(cuerpo.matchAll(reUmbral)).map(m => ({ hasta: Number(m[1]), codigo: m[2] }));
};
const tMotor = leerTabla(readFileSync(join(raiz, 'engine/quant/compliance.js'), 'utf8'),
  'const NIVELES = [', /hasta:\s*([\d.]+),\s*codigo:\s*"([a-z_]+)"/g);
const tApp = leerTabla(html.toString('utf8'), 'const RISK_STEPS = [',
  /under:\s*([\d.]+),\s*code:\s*"([a-z_]+)"/g);
ok(tMotor && tMotor.length > 0, 'NIVELES se lee de engine/quant/compliance.js',
   tMotor ? `${tMotor.length} niveles` : 'no se encontro la tabla');
ok(tApp && tApp.length > 0, 'RISK_STEPS se lee de index.html',
   tApp ? `${tApp.length} niveles` : 'no se encontro la tabla');
if (tMotor && tApp) {
  ok(tMotor.length === tApp.length, 'las dos tablas tienen el mismo numero de niveles',
     `motor ${tMotor.length} · app ${tApp.length}`);
  const malU = tMotor.map((n, i) => [n.hasta, tApp[i] && tApp[i].hasta])
    .filter(([m, a]) => !casi(m, a, 1e-9));
  ok(malU.length === 0, 'los umbrales son los mismos en las dos tablas',
     malU.length ? malU.map(x => `motor ${x[0]} vs app ${x[1]}`).join(' · ')
       : tMotor.map(n => n.hasta).join(' / '));
  /* Los codigos estan en idiomas distintos A PROPOSITO: el CSS de la app se cuelga
     de `code`, asi que renombrarlos rompe los colores. Se comprueba la
     CORRESPONDENCIA, no la igualdad. */
  /* El detalle tiene que decir POR QUE falla. Si el codigo de la app no esta en
     PAREJAS, «app precaucion · motor precaucion» se lee como si coincidieran: el
     fallo es que nadie declaro la correspondencia, no que sean distintos. */
  const porque = (a, m) => PAREJAS[a] === undefined
    ? `«${a}» no figura en la tabla de correspondencia (esperaba una de: ${Object.keys(PAREJAS).join(', ')})`
    : `app «${a}» deberia corresponder a «${PAREJAS[a]}», pero el motor dice «${m}»`;
  const malC = tMotor.map((n, i) => [tApp[i] && tApp[i].codigo, n.codigo])
    .filter(([a, m]) => PAREJAS[a] !== m);
  ok(malC.length === 0, 'cada codigo de la app se corresponde con el del motor',
     malC.length ? malC.map(x => porque(x[0], x[1])).join(' · ')
       : tMotor.map((n, i) => `${tApp[i].codigo}=${n.codigo}`).join(' · '));
}

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

console.log('\n═══ LAS FUNCIONES QUE LA FASE 2 VA A CONECTAR · existen hoy ═══');
R.huerfanas.forEach(([n, t]) => ok(t === 'function', `QE.${n} existe y es funcion`, t));

ok(errs.length === 0, 'la pagina no lanzo ningun error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
