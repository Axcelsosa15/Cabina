/* INVARIANTES · propiedades que tienen que cumplirse SIEMPRE, no casos concretos.

   Las pruebas del motor comprueban valores ("42.5 pts x 2 = $170"). Esto
   comprueba relaciones que no pueden romperse para NINGUNA entrada: que el
   multiplicador siempre sea tickValue/tickSize, que riesgo cero nunca produzca
   un tamaño de posicion, que un largo y un corto con el mismo recorrido den el
   mismo P&L en valor absoluto, que el suelo de una cuenta nunca quede por
   encima de su saldo inicial.

   No inventa matematica nueva: usa las definiciones que ya estan en el motor.

   La ultima seccion es la que cierra la cadena de §7: los MODULOS FUENTE y el
   BUNDLE VIVO EN LA APP tienen que dar el mismo numero para las mismas entradas.
   Sin eso, «el bundle coincide con los modulos» es una comparacion de texto; con
   eso, es una comparacion de resultados. */
import * as Q from '../engine/quant/index.js';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const casi = (a, b, e = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= e;

console.log('\n═══ CONTRATOS · el multiplicador es DERIVADO, nunca un dato suelto ═══');
/* contracts.js lo declara: `const multiplier = tickValueUSD / tickSize`. Si un
   contrato dejara de cumplirlo, todo el P&L de ese instrumento estaria mal. */
let malos = [];
for (const [sym, c] of Object.entries(Q.CONTRACTS)) {
  const esperado = Q.roundTo(c.tickValue / c.tickSize, 8);
  if (!casi(c.multiplier, esperado, 1e-6)) malos.push(`${sym}: ${c.multiplier} != ${esperado}`);
}
ok(malos.length === 0, `los ${Object.keys(Q.CONTRACTS).length} contratos cumplen multiplier = tickValue / tickSize`,
   malos.length ? malos.slice(0, 3).join(' · ') : 'sin excepciones');

const ticksMal = Object.entries(Q.CONTRACTS).filter(([, c]) => !(c.tickSize > 0) || !(c.tickValue > 0));
ok(ticksMal.length === 0, 'ningun contrato tiene tickSize o tickValue <= 0', ticksMal.map(x => x[0]).join(' ') || 'todos positivos');

console.log('\n═══ DIMENSIONAR · lo que se NIEGA a calcular ═══');
const base = { simbolo: 'MNQ', balance: 50000, entrada: 21000, stop: 20990, riesgoPct: 1 };
const r0 = Q.dimensionar(Object.assign({}, base, { stop: 21000 }));
ok(!r0.ok && r0.error.code === 'RIESGO_CERO', 'riesgo cero NO produce tamaño: se niega', r0.ok ? `devolvio ${JSON.stringify(r0.value).slice(0,60)}` : r0.error.code);
const rb = Q.dimensionar(Object.assign({}, base, { balance: 0 }));
ok(!rb.ok && rb.error.code === 'BALANCE_INVALIDO', 'balance cero se niega', rb.ok ? 'PASO' : rb.error.code);
const rn = Q.dimensionar(Object.assign({}, base, { balance: -100 }));
ok(!rn.ok, 'balance negativo se niega', rn.ok ? 'PASO' : rn.error.code);
const rx = Q.dimensionar(Object.assign({}, base, { riesgoPct: 80 }));
ok(!rx.ok && rx.error.code === 'RIESGO_FUERA_DE_RANGO', 'arriesgar 80% se niega', rx.ok ? 'PASO' : rx.error.code);
const rOk = Q.dimensionar(base);
ok(rOk.ok && Number.isFinite(rOk.value.contratos) && rOk.value.contratos >= 0,
   'un caso valido da un numero finito de contratos', rOk.ok ? `${rOk.value.contratos} contratos` : rOk.error.code);
/* Monotonia, expresada en FRACCIONES para no tropezar con la doble lectura. */
const chico = Q.dimensionar(Object.assign({}, base, { riesgoPct: 0.005 }));
const grande = Q.dimensionar(Object.assign({}, base, { riesgoPct: 0.02 }));
ok(chico.ok && grande.ok && grande.value.contratos >= chico.value.contratos,
   'mas riesgo permitido nunca da menos contratos',
   `0.5% -> ${chico.ok && chico.value.contratos} · 2% -> ${grande.ok && grande.value.contratos}`);

/* LA DOBLE LECTURA, FIJADA. dimensionar acepta porcentaje y fraccion y las
   distingue por el valor: `>= 1` es porcentaje, `< 1` es fraccion. Eso hace que
   0.5 signifique 50% y no medio por ciento -- y un campo de interfaz rotulado
   «(%)» con step 0.1 invita justo a ese error: 1250 contratos en vez de 12.
   Se fija aqui para que quede a la vista y no vuelva a sorprender, y para que
   cambiarla rompa una prueba en vez de romper un tamaño de posicion. */
const comoPct = Q.dimensionar(Object.assign({}, base, { riesgoPct: 50 }));
const comoFrac = Q.dimensionar(Object.assign({}, base, { riesgoPct: 0.5 }));
ok(comoPct.ok && comoFrac.ok && comoPct.value.contratos === comoFrac.value.contratos,
   'CONVENCION: 0.5 y 50 significan lo MISMO (50%), no medio por ciento',
   `50 -> ${comoPct.ok && comoPct.value.contratos} · 0.5 -> ${comoFrac.ok && comoFrac.value.contratos}`);
const frac = Q.dimensionar(Object.assign({}, base, { riesgoPct: 0.005 }));
ok(frac.ok && frac.value.contratos * 100 <= comoFrac.value.contratos,
   'y una fraccion pequeña si expresa un riesgo pequeño', `0.005 -> ${frac.ok && frac.value.contratos}`);

console.log('\n═══ SIGNO · un largo y un corto simetricos valen lo mismo ═══');
const op = (direction, entry, exit) => ({ instrument: 'MNQ', direction, qty: 1, entry, stop: direction === 'long' ? entry - 10 : entry + 10, exit });
/* calcularTradeApp NO devuelve un Result: devuelve {pnlEff, rReal, riskUsd,
   ticks, calcError, avisos}. Se comprueba `calcError` para saber si valio. */
const pnl = r => (r && r.calcError == null ? r.pnlEff : null);
const L = Q.calcularTradeApp(op('long', 21000, 21020));
const S = Q.calcularTradeApp(op('short', 21000, 20980));
ok(casi(pnl(L), pnl(S), 1e-6), 'largo +20 pts y corto +20 pts dan el MISMO P&L', `${pnl(L)} vs ${pnl(S)}`);
ok(pnl(L) > 0, 'una operacion GANADORA nunca devuelve P&L negativo', String(pnl(L)));
const P = Q.calcularTradeApp(op('long', 21000, 20980));
ok(pnl(P) < 0, 'una operacion PERDEDORA nunca devuelve P&L positivo', String(pnl(P)));
const Lx2 = Q.calcularTradeApp(Object.assign(op('long', 21000, 21020), { qty: 2 }));
ok(casi(pnl(Lx2), pnl(L) * 2, 1e-6), 'doblar contratos dobla el P&L exactamente', `${pnl(L)} x2 = ${pnl(Lx2)}`);
ok(casi(L.riskUsd, 20, 1e-6), 'el riesgo en dolares sale de la rejilla de ticks', `${L.riskUsd} (10 pts x $2)`);

console.log('\n═══ DRAWDOWN · cada tipo de suelo, por su propia regla ═══');
/* Un invariante generico («el suelo nunca supera el saldo inicial») es FALSO
   aqui, y conviene decir por que: un trailing sube con el pico, asi que con la
   cuenta en +10.000 el suelo QUEDA por encima del saldo inicial -- eso es lo que
   hace, fijar beneficio. Medido: estatico = saldo-max · trailing = pico-max ·
   trailing_lock = min(pico-max, saldo), que sube y se bloquea en el saldo.
   Cada tipo se comprueba por su regla, no por una intuicion. */
const CASOS_DD = [[50000, 50000, 2500], [50000, 52000, 2500], [50000, 60000, 2500], [25000, 24000, 1000]];
const reglas = {
  [Q.DD_TIPOS.ESTATICO]:           (s, pk, m) => s - m,
  [Q.DD_TIPOS.TRAILING]:           (s, pk, m) => pk - m,
  [Q.DD_TIPOS.TRAILING_BLOQUEADO]: (s, pk, m) => Math.min(pk - m, s),
};
for (const [tipo, regla] of Object.entries(reglas)) {
  const mal = CASOS_DD.filter(([s, pk, m]) => Q.sueloPara(tipo, s, pk, m) !== regla(s, pk, m))
    .map(([s, pk, m]) => `saldo ${s} pico ${pk} -> ${Q.sueloPara(tipo, s, pk, m)}, esperado ${regla(s, pk, m)}`);
  ok(mal.length === 0, `«${tipo}» cumple su regla en los ${CASOS_DD.length} casos`, mal[0] || 'sin excepciones');
}
/* El bloqueo del trailing_lock: por mucho que suba el pico, el suelo NO pasa del
   saldo inicial. Es la unica promesa de ese tipo, y sin ella seria un trailing. */
const topes = [52000, 60000, 90000, 1e6].map(pk => Q.sueloPara(Q.DD_TIPOS.TRAILING_BLOQUEADO, 50000, pk, 2500));
ok(topes.every(x => x <= 50000), 'trailing_lock: el suelo se BLOQUEA en el saldo inicial, no lo pasa', topes.join(' · '));
/* Y el trailing sin bloqueo si lo pasa: son tipos distintos y deben diferenciarse. */
ok(Q.sueloPara(Q.DD_TIPOS.TRAILING, 50000, 60000, 2500) > 50000,
   'trailing SIN bloqueo si sube por encima del saldo (si no, serian el mismo tipo)',
   String(Q.sueloPara(Q.DD_TIPOS.TRAILING, 50000, 60000, 2500)));
const finitos = Object.values(Q.DD_TIPOS).every(t => CASOS_DD.every(([s, pk, m]) => Number.isFinite(Q.sueloPara(t, s, pk, m))));
ok(finitos, 'ningun suelo sale NaN ni Infinity en los 12 casos');

console.log('\n═══ CURVA · el final es el inicio mas la suma de las operaciones ═══');
const pnls = [20, -20, 40, -40, 60, 10];
const cv = Q.construirCurva(pnls.map((pnl, i) => ({ fecha: `2026-09-${10 + i}`, pnl })), { saldoInicial: 50000 });
const suma = pnls.reduce((a, b) => a + b, 0);
ok(cv.ok, 'la curva se construye', cv.ok ? `${cv.value.nDias} dias · ${cv.value.nOperaciones} operaciones` : cv.error.code);
if (cv.ok) {
  ok(casi(cv.value.equity, 50000 + suma, 1e-6), 'equity final = saldo inicial + Σ P&L', `${cv.value.equity} · esperado ${50000 + suma}`);
  ok(cv.value.suelo == null || cv.value.suelo <= cv.value.saldoInicial, 'el suelo de la curva no supera el saldo inicial', `suelo ${cv.value.suelo}`);
  ok(cv.value.pico >= cv.value.saldoInicial || cv.value.equity < cv.value.saldoInicial, 'el pico nunca queda por debajo del saldo si hubo ganancia', `pico ${cv.value.pico}`);
}

console.log('\n═══ SERIALIZAR · ida y vuelta no cambia un numero ═══');
const t0 = op('long', 21000, 21020);
const ida = Q.calcularTradeApp(JSON.parse(JSON.stringify(t0)));
ok(casi(pnl(L), pnl(ida), 0), 'JSON ida y vuelta conserva el P&L al bit', `${pnl(L)} = ${pnl(ida)}`);

console.log('\n═══ FUENTE == BUNDLE VIVO EN LA APP ═══');
/* La comparacion de texto (capa2 §15) dice que el bloque incrustado es el mismo
   fichero. Esto dice algo mas fuerte: que produce los mismos NUMEROS. */
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
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.QuantEngine !== 'undefined', null, { timeout: 20000 });

const CASOS = [
  ['MNQ largo 10 pts',   op('long', 21000, 21010)],
  ['MNQ corto 20 pts',   op('short', 21000, 20980)],
  ['MNQ 2 contratos',    Object.assign(op('long', 21000, 21015), { qty: 2 })],
  ['ES largo 4 pts',     { instrument: 'ES', direction: 'long', qty: 1, entry: 5000, stop: 4995, exit: 5004 }],
];
let difs = [];
for (const [nombre, t] of CASOS) {
  const aqui = Q.calcularTradeApp(t);
  const alla = await p.evaluate(t => { const r = window.QuantEngine.calcularTradeApp(t); return r && r.calcError == null ? r.pnlEff : 'ERR:' + (r && r.calcError); }, t);
  const mio = aqui && aqui.calcError == null ? aqui.pnlEff : 'ERR:' + (aqui && aqui.calcError);
  if (String(mio) !== String(alla)) difs.push(`${nombre}: fuente ${mio} vs app ${alla}`);
}
ok(difs.length === 0, `los ${CASOS.length} casos dan el MISMO P&L en los modulos fuente y en el bundle de la app`,
   difs.length ? difs.join(' · ') : 'identicos');

const dimA = Q.dimensionar(base);
const dimB = await p.evaluate(b => { const r = window.QuantEngine.dimensionar(b); return r.ok ? r.value.contratos : 'ERR'; }, base);
ok(dimA.ok && dimA.value.contratos === dimB, 'dimensionar da el mismo tamaño en fuente y en app',
   `fuente ${dimA.ok && dimA.value.contratos} · app ${dimB}`);

const verA = Q.QE_VERSION;
const verB = await p.evaluate(() => window.QuantEngine.QE_VERSION);
ok(verA === verB, 'la version del motor coincide', `${verA} = ${verB}`);

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
