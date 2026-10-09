/* QuantEngine · suite de pruebas.  Ejecutar: node engine/quant/quant.test.js */
import * as Q from "./index.js";

let pass = 0, fail = 0; const fallos = [];
const eq = (a, b, msg) => { const ok = Object.is(a, b) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9); ok ? pass++ : (fail++, fallos.push(`${msg}\n    esperado ${b}, obtenido ${a}`)); };
const near = (a, b, tol, msg) => { const ok = a !== null && Math.abs(a - b) <= tol; ok ? pass++ : (fail++, fallos.push(`${msg}\n    esperado ~${b}±${tol}, obtenido ${a}`)); };
const ok = (c, msg) => { c ? pass++ : (fail++, fallos.push(msg)); };
const grupo = n => console.log(`\n── ${n}`);

/* ═══ kernel ═══ */
grupo("kernel · redondeo y dinero");
eq(Q.roundHalfAway(0.5), 1, "0.5 redondea alejandose de cero");
eq(Q.roundHalfAway(-0.5), -1, "-0.5 redondea a -1, no a -0 como Math.round");
eq(Q.roundTo(2.675, 2), 2.68, "2.675 -> 2.68 (el float ingenuo da 2.67)");
eq(Q.roundTo(-2.675, 2), -2.68, "negativo simetrico");
eq(Q.toCents(1.005), 101, "1.005 -> 101 centavos");
eq(Q.toCents(-1.005), -101, "negativo simetrico en centavos");
eq(Q.fromCents(Q.sumCents([1, 2, 3])), 0.06, "suma exacta en centavos");
eq(Q.roundTo(0, 2), 0, "cero normalizado, nunca -0");
eq(Q.roundTo(-0.0001, 2), 0, "-0 se normaliza a 0");
ok(!Q.isFiniteNum(""), "cadena vacia no es numero");
ok(!Q.isFiniteNum(null) && !Q.isFiniteNum(NaN) && !Q.isFiniteNum(Infinity), "null, NaN e Infinity rechazados");
ok(!Q.isFiniteNum(true), "booleano no es numero");
eq(Q.toNum("12.5"), 12.5, "cadena numerica se acepta");
eq(Q.clamp(5, 0, 3), 3, "clamp superior");
eq(Q.clamp(-5, 0, 3), 0, "clamp inferior");
near(Q.zFor(0.95), 1.959964, 1e-5, "z al 95%");
near(Q.zFor(0.99), 2.575829, 1e-5, "z al 99%");
near(Q.normalCDF(0), 0.5, 1e-6, "CDF normal en 0");
near(Q.normalCDF(1.959964), 0.975, 1e-4, "CDF normal en z95");

grupo("kernel · PRNG determinista");
{
  const a = Q.rng(42), b = Q.rng(42), c = Q.rng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  ok(sa.every((v, i) => v === sb[i]), "misma semilla -> misma secuencia");
  ok(sa.some((v, i) => v !== sc[i]), "semilla distinta -> secuencia distinta");
  ok(sa.every(v => v >= 0 && v < 1), "uniforme en [0,1)");
}

/* ═══ contratos ═══ */
grupo("contratos · rejilla de ticks");
for (const k of Object.keys(Q.CONTRACTS)) {
  const c = Q.CONTRACTS[k];
  near(c.multiplier * c.tickSize, c.tickValue, 1e-9, `${k}: multiplier*tickSize == tickValue`);
}
eq(Q.CONTRACTS.MNQ.multiplier, 2, "MNQ multiplicador 2");
eq(Q.CONTRACTS.ES.multiplier, 50, "ES multiplicador 50");
eq(Q.CONTRACTS.CL.multiplier, 1000, "CL multiplicador 1000");
eq(Q.CONTRACTS["6E"].multiplier, 125000, "6E multiplicador 125000");
eq(Q.rootOf("MNQZ5"), "MNQ", "contrato con mes/anio se reduce a la raiz");
eq(Q.rootOf("/ES"), "ES", "prefijo barra se ignora");
eq(Q.rootOf("esh6"), "ES", "minusculas y sufijo");
ok(!Q.resolveContract("FOO").ok, "simbolo desconocido no se adivina");
eq(Q.resolveContract("FOO").error.code, "CONTRATO_DESCONOCIDO", "codigo de error correcto");
ok(!Q.resolveContract("").ok, "simbolo vacio rechazado");
{
  const r = Q.resolveContract("FOO", { FOO: { tickSize: 0.25, multiplier: 2 } });
  ok(r.ok && r.value.tickValue === 0.5 && r.value.sintetico, "override por multiplicador se traduce a tickValue");
}

/* ═══ valuacion ═══ */
grupo("operacion · P&L exacto en ticks");
{
  const v = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20042.5, stop: 19990, contratos: 2 }, { incluirComisiones: false }).value;
  eq(v.pnlNeto, 170, "MNQ 42.5 pts x 2 = $170");
  eq(v.ticks, 170, "170 ticks");
  eq(v.riesgoUSD, 40, "riesgo 10 pts x 2 x $2 = $40");
  eq(v.rBruto, 4.25, "R = 42.5/10");
  eq(v.resultado, "ganancia", "clasificacion correcta");
}
{
  const v = Q.valuarOperacion({ simbolo: "MNQ", direccion: "short", entrada: 20042.5, salida: 20000, stop: 20052.5, contratos: 2 }, { incluirComisiones: false }).value;
  eq(v.pnlNeto, 170, "corto simetrico: mismo P&L");
  eq(v.rBruto, 4.25, "corto: mismo R");
}
{
  const v = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 19990, stop: 19990, contratos: 1 }, { incluirComisiones: false }).value;
  eq(v.pnlNeto, -20, "perdida negativa correcta");
  eq(v.rBruto, -1, "toco el stop = -1R");
  eq(v.resultado, "perdida", "clasifica perdida");
}
{
  const v = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20042.5, stop: 19990, contratos: 2 }, { incluirComisiones: true }).value;
  eq(v.comisiones, 3, "comision 1.5 x 2 contratos");
  eq(v.pnlNeto, 167, "neto tras comisiones");
  eq(v.rBruto, 4.25, "R bruto no cambia con comisiones");
  near(v.rNeto, 167 / 40, 1e-4, "R neto si las descuenta");
}
{
  const v = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, stop: 19990, contratos: 1 }, {}).value;
  ok(v.abierta && v.pnlNeto === null, "sin salida: abierta, P&L null, no cero");
  eq(v.resultado, "abierta", "estado abierta");
  eq(v.riesgoUSD, 20, "riesgo definido aunque este abierta");
}
{
  const r = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20010 }, {});
  eq(r.value.rBruto, null, "sin stop no hay R: division por cero evitada");
}
{
  const r = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20010, stop: 20000 }, {});
  eq(r.value.rBruto, null, "stop igual a entrada: R indefinido, no Infinity");
  ok(r.warnings.some(w => w.code === "RIESGO_CERO"), "avisa riesgo cero");
}
{
  const r = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000.13, salida: 20042.5 }, {});
  ok(r.warnings.some(w => w.code === "PRECIO_FUERA_DE_REJILLA"), "detecta precio fuera de rejilla");
}
{
  const r = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000.13, salida: 20042.5 }, { permitirFueraDeRejilla: false });
  ok(!r.ok, "modo estricto rechaza precios fuera de rejilla");
}
{
  const r = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 19990, stop: 20010 }, {});
  ok(r.warnings.some(w => w.code === "STOP_INCOHERENTE"), "largo con stop arriba: incoherente");
}
ok(!Q.valuarOperacion({ simbolo: "MNQ", direccion: "long" }, {}).ok, "sin entrada devuelve Err");
ok(!Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: -5 }, {}).ok, "entrada negativa rechazada");
grupo("operacion · cantidad y comision son MAGNITUDES, no cantidades con signo");
/* REGRESION. Las dos escondian dinero, y las dos se medían antes de arreglarse.

   Con el codigo anterior:
     · fees -25 -> pnlEff +45 y rReal +2,25R, donde lo correcto es -5 y -0,25R.
       Un menos tecleado en «Comisiones $» CONVERTIA un coste en un cobro.
     · qty -3 -> el motor valuaba 1 contrato (riesgo 20) mientras Metricas/Edge
       ya hacia Math.abs(qty) y dimensionaba el riesgo sobre 3 (riesgo 60): la
       MISMA operacion daba R = 1,00 en el journal y R = 0,33 en Metricas. */
{
  const base = { simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20010, stop: 19990, contratos: 1 };
  const sin  = Q.valuarOperacion(Object.assign({}, base), { incluirComisiones: false }).value;
  const con  = Q.valuarOperacion(Object.assign({}, base, { comisionExtra: 25 }), { incluirComisiones: false }).value;
  const neg  = Q.valuarOperacion(Object.assign({}, base, { comisionExtra: -25 }), { incluirComisiones: false });
  eq(sin.pnlNeto, 20, "control: 10 pts x $2 = $20 bruto");
  eq(con.pnlNeto, -5, "con 25 de comision: -$5");
  eq(neg.value.pnlNeto, -5, "con -25 de comision: TAMBIEN -$5, no +$45");
  eq(neg.value.comisiones, 25, "la comision se descuenta como magnitud");
  near(neg.value.rNeto, -0.25, 1e-6, "y la R sigue al dinero: -0,25R, no +2,25R");
  ok(neg.warnings.some(w => w.code === "COMISION_NEGATIVA"), "y lo avisa en vez de corregirlo en silencio");
  ok(!con.pnlNeto || !Q.valuarOperacion(Object.assign({}, base, { comisionExtra: 25 }), { incluirComisiones: false }).warnings.some(w => w.code === "COMISION_NEGATIVA"), "una comision positiva no genera el aviso");
}
{
  const base = { simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20010, stop: 19990 };
  const tres = Q.valuarOperacion(Object.assign({}, base, { contratos: 3 }), { incluirComisiones: false }).value;
  const neg  = Q.valuarOperacion(Object.assign({}, base, { contratos: -3 }), { incluirComisiones: false });
  eq(neg.value.contratos, 3, "contratos -3 se leen como 3, no como 1");
  eq(neg.value.pnlNeto, tres.pnlNeto, "mismo P&L que con +3");
  eq(neg.value.riesgoUSD, tres.riesgoUSD, "y el MISMO riesgo: una sola R posible");
  eq(neg.value.rNeto, tres.rNeto, "la R de -3 y la de +3 coinciden");
  ok(neg.warnings.some(w => w.code === "CANTIDAD_NEGATIVA"), "y lo avisa");
}
{
  /* `contratosDe` es la unica respuesta a «cuantos contratos son». Si Metricas/Edge
     vuelve a resolverlo por su cuenta, esta tabla es con la que tiene que coincidir. */
  const casos = [[null, 1], [undefined, 1], ["", 1], [0, 1], [1, 1], [2.7, 2], [-3, 3], [-0.5, 1], ["4", 4], [NaN, 1]];
  for (const [entrada, esperado] of casos) eq(Q.contratosDe(entrada), esperado, `contratosDe(${JSON.stringify(entrada)}) = ${esperado}`);
  eq(Q.contratosDe(-3), Math.abs(-3), "y para un negativo es exactamente su magnitud, como ya hacia Metricas");
}
{
  /* La direccion NO sale del signo de los contratos: un corto con contratos -1
     seguiria siendo corto por su campo `direccion`, no por el menos. */
  const a = Q.valuarOperacion({ simbolo: "MNQ", direccion: "short", entrada: 20010, salida: 20000, stop: 20020, contratos: -1 }, { incluirComisiones: false }).value;
  eq(a.direccion, "short", "la direccion la decide el campo, no el signo");
  eq(a.pnlNeto, 20, "y el corto gana cuando el precio baja");
}
{
  /* Un override no puede colar una comision negativa por la puerta del contrato. */
  const r = Q.valuarOperacion({ simbolo: "ZZZ", direccion: "long", entrada: 100, salida: 101, stop: 99, contratos: 1 },
    { incluirComisiones: true, overrides: { ZZZ: { tickSize: 1, multiplier: 10, commissionPerContract: -5 } } }).value;
  eq(r.comisiones, 5, "comision del contrato tambien como magnitud");
  eq(r.pnlNeto, 5, "10 - 5 = 5, no 10 + 5 = 15");
}
{ /* acumulacion: 1000 operaciones de 0.1 no derivan */
  let c = 0;
  for (let i = 0; i < 1000; i++) c += Q.valuarOperacion({ simbolo: "MCL", direccion: "long", entrada: 70.00, salida: 70.01, contratos: 1 }, { incluirComisiones: false }).value.pnlNetoCents;
  eq(Q.fromCents(c), 1000, "1000 x $1.00 = $1000 exacto, sin deriva de centavos");
}

grupo("dimensionamiento");
{
  const d = Q.dimensionar({ simbolo: "MNQ", balance: 25315, entrada: 20000, stop: 19990, riesgoPct: 1 }).value;
  eq(d.contratos, 12, "12 contratos enteros");
  eq(d.riesgoReal, 240, "riesgo real $240");
  near(d.desaprovechado, 13.15, 0.01, "lo que se pierde por no fraccionar");
  ok(d.contratos === Math.floor(d.fraccional), "siempre redondea hacia abajo");
}
eq(Q.dimensionar({ simbolo: "MNQ", balance: 25315, entrada: 20000, stop: 19990, riesgoPct: 0.01 }).value.contratos, 12, "0.01 y 1 significan lo mismo: 1%");
ok(!Q.dimensionar({ simbolo: "MNQ", balance: 25315, entrada: 20000, stop: 19990, riesgoPct: 80 }).ok, "80% de riesgo se rechaza");
ok(!Q.dimensionar({ simbolo: "MNQ", balance: 0, entrada: 20000, stop: 19990 }).ok, "balance cero rechazado");
ok(!Q.dimensionar({ simbolo: "MNQ", balance: 1000, entrada: 20000, stop: 20000 }).ok, "riesgo cero rechazado");
{
  const d = Q.dimensionar({ simbolo: "ES", balance: 1000, entrada: 5000, stop: 4990, riesgoPct: 1 }).value;
  eq(d.contratos, 0, "cuenta chica no alcanza ni 1 contrato");
}
ok(Q.dimensionar({ simbolo: "MNQ", balance: 25000, entrada: 20000, stop: 19990, riesgoPct: 8 }).warnings.some(w => w.code === "RIESGO_ALTO"), "avisa riesgo agresivo");

/* UN TICK QUE NO LLEGA AL CENTAVO. `toCents(0.001)` es 0, asi que
   `riesgoPorContratoCents` valia 0 y la division daba Infinity: dimensionar()
   respondia ok:true con **contratos: Infinity**. valuarOperacion ya lo
   rechazaba con TICK_SIN_VALOR; las dos tienen que decir lo mismo. */
{
  const ov = { XYZ: { tickSize: 0.01, tickValue: 0.001 } };
  const d = Q.dimensionar({ simbolo: "XYZ", balance: 50000, entrada: 100, stop: 99, riesgoPct: 1 }, { overrides: ov });
  ok(!d.ok, "un tick que no llega al centavo NO dimensiona");
  /* `d.error` es null cuando el fallo NO ocurre, asi que se lee con `?.`: sin
     eso el sabotaje revienta la suite entera con un TypeError en vez de dejar
     una asercion roja, y se pierden las 300 de abajo. */
  const cod = d.ok ? null : (d.error || {}).code;
  ok(cod === "TICK_SIN_VALOR", "y lo dice con TICK_SIN_VALOR, igual que valuarOperacion");
  const v2 = Q.valuarOperacion({ simbolo: "XYZ", direccion: "long", entrada: 100, salida: 101, stop: 99, contratos: 1 }, { overrides: ov });
  const cod2 = v2.ok ? null : (v2.error || {}).code;
  ok(cod2 !== null && cod2 === cod, "las dos funciones dan el MISMO codigo para el mismo contrato");
}
/* Un balance por debajo de medio centavo hacia toCents(balance) === 0 y el
   porcentaje real salia de una division por cero. */
{
  const d = Q.dimensionar({ simbolo: "MNQ", balance: 0.001, entrada: 21000, stop: 20990, riesgoPct: 1 });
  ok(d.ok && d.value.contratos === 0, "un balance diminuto da cero contratos, no un error");
  ok(d.ok && d.value.riesgoPctReal === null, "y el porcentaje real es null, no una division por cero");
}

/* ═══ estadistica ═══ */
grupo("estadistica");
eq(Q.momentos([1, 2, 3, 4, 5]).media, 3, "media");
near(Q.momentos([1, 2, 3, 4, 5]).desv, 1.5811388, 1e-6, "desviacion muestral (n-1)");
eq(Q.momentos([]).n, 0, "lista vacia no revienta");
eq(Q.momentos([7]).varianza, 0, "un solo valor: varianza 0");
eq(Q.cuantil([1, 2, 3, 4], 0.5), 2.5, "mediana par (tipo 7)");
eq(Q.cuantil([1, 2, 3], 0.5), 2, "mediana impar");
eq(Q.cuantil([1, 2, 3, 4, 5], 0.25), 2, "primer cuartil tipo 7");
eq(Q.cuantil([], 0.5), null, "cuantil de vacio es null");
{
  const w = Q.ciProporcion(3, 5);
  ok(w.bajo >= 0 && w.alto <= 1, "Wilson nunca sale de [0,1]");
  const w0 = Q.ciProporcion(0, 10);
  ok(w0.bajo === 0 && w0.alto > 0 && w0.alto < 1, "0 exitos: intervalo valido, no degenerado");
  const w1 = Q.ciProporcion(10, 10);
  ok(w1.alto === 1 && w1.bajo < 1, "10 de 10: intervalo valido");
}
{
  const xs = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 2 + 1);
  const a = Q.bootstrapCI(xs, undefined, { semilla: 7 });
  const b = Q.bootstrapCI(xs, undefined, { semilla: 7 });
  ok(a.bajo === b.bajo && a.alto === b.alto, "bootstrap con misma semilla es reproducible");
  ok(a.bajo < a.punto && a.punto < a.alto, "el punto cae dentro del intervalo");
}
eq(Q.bootstrapCI([1, 2], undefined, {}), null, "bootstrap con n<5 devuelve null en vez de un numero falso");
{
  const m = Q.muestraMinima([1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
  ok(m.requerido === Infinity || m.requerido > 0, "muestra minima calculable");
}
ok(Q.veredicto(5).fiable === false && Q.veredicto(150).nivel === "solido", "escalera de fiabilidad");

/* ═══ ventaja ═══ */
grupo("ventaja");
{
  const ops = [{ pnl: 200, r: 2 }, { pnl: -100, r: -1 }, { pnl: 200, r: 2 }, { pnl: -100, r: -1 }];
  const e = Q.analizarEdge(ops).value;
  eq(e.profitFactor, 2, "profit factor 400/200");
  eq(e.tasaAcierto.valor, 0.5, "tasa de acierto 50%");
  eq(e.gananciaMedia, 200, "ganancia media");
  eq(e.perdidaMedia, 100, "perdida media");
  eq(e.payoff, 2, "payoff 2:1");
  near(e.kelly.completo, 0.25, 1e-6, "Kelly clasico 2:1 al 50% = 0.25");
  ok(e.kelly.recomendado < e.kelly.completo, "el recomendado es una fraccion del Kelly completo");
  ok(!e.veredicto.fiable, "n=4 no es fiable y lo dice");
}
{
  const e = Q.analizarEdge([{ pnl: 100, r: 1 }, { pnl: 200, r: 2 }]).value;
  eq(e.profitFactor, null, "sin perdedoras el PF es indefinido, NO Infinity");
  ok(/no esta definido/.test(e.profitFactorRazon), "y explica por que");
}
{
  const e = Q.analizarEdge([{ pnl: -100, r: -1 }, { pnl: -50, r: -0.5 }]).value;
  eq(e.profitFactor, 0, "sin ganadoras el PF es 0");
}
eq(Q.analizarEdge([]).value.n, 0, "lista vacia no revienta");
{
  const e = Q.analizarEdge([{ pnl: 0, r: 0 }, { pnl: 100, r: 1 }, { pnl: -100, r: -1 }]).value;
  eq(e.planas, 1, "las operaciones planas se cuentan aparte");
  eq(e.tasaAcierto.n, 2, "y no entran en el denominador de la tasa de acierto");
}
{
  const ops = [{ pnl: 1000, r: 10 }, { pnl: 50, r: 0.5 }, { pnl: -50, r: -0.5 }];
  const e = Q.analizarEdge(ops).value;
  ok(e.concentracion.dependeDeUna, "detecta que una sola operacion explica el resultado");
}
{
  const ops = [];
  for (let i = 0; i < 40; i++) ops.push({ pnl: i % 3 === 0 ? 200 : -100, r: i % 3 === 0 ? 2 : -1 });
  const e = Q.analizarEdge(ops).value;
  ok(e.rachas.maxPerdedoras >= 2, "mide la racha perdedora maxima");
  ok(e.rachas.esperadaPorAzar > 0, "calcula la racha esperada por azar");
}

/* ═══ curva ═══ */
grupo("curva y drawdown");
{
  const c = Q.construirCurva([{ fecha: "2026-09-15", pnl: 170 }, { fecha: "2026-09-16", pnl: 145 }],
    { saldoInicial: 25000, ddTipo: "trailing_lock", ddMaximo: 1000 }).value;
  eq(c.equity, 25315, "balance 25315");
  eq(c.pico, 25315, "pico 25315");
  eq(c.suelo, 24315, "suelo trailing bloqueado 24315");
  eq(c.colchon, 1000, "colchon 1000");
}
eq(Q.sueloPara("estatico", 25000, 26000, 1000), 24000, "suelo estatico no sigue al pico");
eq(Q.sueloPara("trailing", 25000, 26000, 1000), 25000, "suelo trailing sigue al pico");
eq(Q.sueloPara("trailing_lock", 25000, 26000, 1000), 25000, "trailing bloqueado se congela en el tamano inicial");
eq(Q.sueloPara("trailing_lock", 25000, 25500, 1000), 24500, "trailing bloqueado aun no ha llegado al tope");
eq(Q.sueloPara("trailing", 25000, 25000, 0), null, "drawdown cero devuelve null, no un suelo falso");
{
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: 800 }, { fecha: "2026-09-02", pnl: -700 }],
    { saldoInicial: 25000, ddTipo: "trailing", ddMaximo: 1000 }).value;
  eq(c.pico, 25800, "pico registrado");
  eq(c.suelo, 24800, "suelo sigue al pico");
  eq(c.colchon, 300, "colchon tras la caida");
  eq(c.peorMomento.fecha, "2026-09-02", "identifica el dia de maximo riesgo");
  eq(c.peorMomento.colchon, 300, "y cuanto colchon quedaba");
}
{
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: -1100 }], { saldoInicial: 25000, ddTipo: "estatico", ddMaximo: 1000 }).value;
  ok(c.quemadaEn && c.quemadaEn.fecha === "2026-09-01", "detecta el dia en que se quemo");
}
{ /* intradia vs cierre: la misma sesion puede pasar o quemar segun la base */
  const ops = [{ fecha: "2026-09-01", orden: 0, pnl: 900 }, { fecha: "2026-09-01", orden: 1, pnl: -900 }];
  const cierre = Q.construirCurva(ops, { saldoInicial: 25000, ddTipo: "trailing", ddMaximo: 1000, base: "cierre" }).value;
  const intra = Q.construirCurva(ops, { saldoInicial: 25000, ddTipo: "trailing", ddMaximo: 1000, base: "intradia" }).value;
  eq(cierre.pico, 25000, "base cierre: el pico intradia no cuenta");
  eq(intra.pico, 25900, "base intradia: el pico si cuenta");
  ok(intra.colchon < cierre.colchon, "y el colchon resultante es menor");
}
{
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: 100 }], { saldoInicial: 25000, ddMaximo: 1000, movimientos: [{ fecha: "2026-09-01", tipo: "retiro", monto: 500 }] }).value;
  eq(c.equity, 24600, "los retiros bajan el equity");
}
eq(Q.construirCurva([], { saldoInicial: 25000, ddMaximo: 1000 }).value.nDias, 0, "curva vacia no revienta");
{
  const c = Q.construirCurva(Array.from({ length: 80 }, (_, i) => ({ fecha: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, pnl: (i % 4 === 0 ? -150 : 80) })), { saldoInicial: 25000, ddMaximo: 3000 }).value;
  const m = Q.metricasCurva(c).value;
  ok(m.fiable, "con 80 dias los ratios se marcan fiables");
  ok(m.maxDrawdown > 0, "mide el drawdown maximo de la curva");
  ok(m.sharpe !== null && m.sortino !== null, "Sharpe y Sortino calculados");
}
{
  const m = Q.metricasCurva(Q.construirCurva([{ fecha: "2026-09-01", pnl: 10 }], { saldoInicial: 25000 }).value).value;
  ok(!m.fiable, "con 1 dia los ratios se marcan NO fiables");
}
{
  /* Sharpe con tasa libre de riesgo, contra la cuenta hecha a mano. Tres dias sobre
     10.000: +100, -50, +150 -> rendimientos 0.01, -0.004950..., 0.015075... */
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: 100 }, { fecha: "2026-09-02", pnl: -50 }, { fecha: "2026-09-03", pnl: 150 }], { saldoInicial: 10000 }).value;
  const r = [100 / 10000, -50 / 10100, 150 / 10050];
  const media = r.reduce((a, b) => a + b, 0) / 3;
  const desv = Math.sqrt(r.reduce((a, b) => a + (b - media) ** 2, 0) / 2);
  const m0 = Q.metricasCurva(c).value, m5 = Q.metricasCurva(c, { tasaLibreAnual: 0.05 }).value;
  near(m0.sharpeDiario, media / desv, 1e-4, "Sharpe diario sin tasa = media / desviacion");
  near(m5.sharpeDiario, (media - 0.05 / 252) / desv, 1e-4, "con 5% anual se resta 0.05/252 de cada dia");
  near(m5.sharpe, (media - 0.05 / 252) / desv * Math.sqrt(252), 1e-3, "y el anualizado es el diario por raiz de 252");
  ok(m5.sharpe < m0.sharpe, "una tasa positiva baja el Sharpe");
  eq(Q.metricasCurva(c, { tasaLibreAnual: 0 }).value.sharpe, m0.sharpe, "tasa 0 da exactamente lo de antes");
}

grupo("consistencia");
{
  const k = Q.evaluarConsistencia([{ pnl: 170 }, { pnl: 145 }], 50).value;
  near(k.ratio, 170 / 315, 1e-6, "ratio 53.97%");
  eq(k.cumple, false, "no cumple con limite 50%");
  eq(k.totalRequerido, 340, "total requerido = mejor/limite");
  eq(k.falta, 25, "faltan exactamente $25");
  eq(k.topeDiaHoy, 315, "el dia mas grande que aun cumpliria");
}
eq(Q.evaluarConsistencia([{ pnl: 100 }], 0).value.aplica, false, "sin limite no aplica");
eq(Q.evaluarConsistencia([], 50).value.hayDatos, false, "sin datos lo dice en vez de inventar");
{
  const k = Q.evaluarConsistencia([{ pnl: 100 }, { pnl: 100 }, { pnl: 100 }], 50).value;
  eq(k.cumple, true, "33% cumple un limite del 50%");
  eq(k.falta, 0, "no falta nada");
}
{
  const k = Q.evaluarConsistencia([{ pnl: 100 }], 50, { gananciaPrevia: 200, mejorDiaPrevio: 150 }).value;
  eq(k.total, 300, "suma la ganancia previa escrita a mano");
  eq(k.mejor, 150, "y respeta el mejor dia previo si es mayor");
}

/* ═══ supervivencia ═══ */
grupo("supervivencia");
{
  const rs = [2, -1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1];
  const a = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 100, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 800, semilla: 1 });
  const b = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 100, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 800, semilla: 1 });
  eq(a.value.pPasar, b.value.pPasar, "misma semilla -> misma probabilidad (reproducible)");
  near(a.value.pPasar + a.value.pQuemar + a.value.pSinResolver, 1, 1e-6, "las probabilidades suman 1");
}
ok(!Q.simularCuenta({ rMultiples: [1, -1], riesgoPorOperacion: 100 }).ok, "con menos de 5 operaciones se niega a simular");
ok(!Q.simularCuenta({ rMultiples: [1, -1, 1, -1, 1, -1], riesgoPorOperacion: 0 }).ok, "sin valor de 1R se niega a simular");
{
  const rs = [2, -1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1];
  const chico = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 50, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 1200, semilla: 5 }).value;
  const grande = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 400, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 1200, semilla: 5 }).value;
  ok(grande.pQuemar > chico.pQuemar, "mas riesgo por operacion -> mas probabilidad de quemar");
}
{
  const rs = [2, -1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1];
  const sin = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 150, saldoInicial: 25000, ddMaximo: 2000, objetivoGanancia: 1500, caminos: 1200, semilla: 3 }).value;
  const con = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 150, saldoInicial: 25000, ddMaximo: 2000, objetivoGanancia: 1500, limiteConsistencia: 30, caminos: 1200, semilla: 3 }).value;
  ok(con.pPasar <= sin.pPasar, "la regla de consistencia nunca facilita pasar la cuenta");
}
{
  const b = Q.barridoDeRiesgo({ rMultiples: [2, -1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1], riesgoPorOperacion: 100, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 400, semilla: 9 }, [0.5, 1, 2]);
  ok(b.ok && b.value.filas.length === 3 && b.value.optimo, "el barrido devuelve la curva y su optimo");
}

/* ═══ cumplimiento ═══ */
grupo("cumplimiento");
{
  const c = Q.construirCurva([{ fecha: "2026-09-16", pnl: -800 }], { saldoInicial: 25000, ddTipo: "estatico", ddMaximo: 1000 }).value;
  const m = Q.margenDeDrawdown(c, 100);
  eq(m.stopsRestantes, 2, "traduce el colchon a numero de stops");
}
{
  const k = Q.evaluarConsistencia([{ pnl: 100 }, { pnl: 100 }], 50).value;
  const t = Q.topeDeGanancia(k, 1000);
  ok(t.valor === 200 && /consistencia/.test(t.porque), "manda el menor entre regla dura y consistencia");
}

/* ═══ adaptador de la app ═══ */
grupo("adaptador Cabina");
{
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 20000, exit: 20042.5, stop: 19990, qty: 2 });
  eq(r.pnlEff, 170, "drop-in de tradeCalc: mismo P&L");
  eq(r.rReal, 4.25, "mismo R");
  eq(r.riskUsd, 40, "mismo riesgo");
  eq(r.multUnknown, false, "instrumento conocido");
}
{
  const r = Q.calcularTradeApp({ instrument: "FOO", direction: "long", entry: 100, exit: 120, stop: 90, target: 130, qty: 1 });
  eq(r.pnlEff, null, "simbolo desconocido: P&L null, nunca un numero inventado");
  eq(r.rReal, 2, "pero R SI sobrevive: es un cociente de precios");
  eq(r.rPlanned, 3, "y el R planeado tambien");
  eq(r.multUnknown, true, "marcado como desconocido");
}
{
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 20000, exit: 20042.5, qty: 2, pnl: 999 });
  eq(r.pnlEff, 999, "un P&L escrito a mano gana sobre el calculado");
}
{
  /* Y LA R TIENE QUE SEGUIRLO. Un P&L a mano es lo que de verdad liquido el
     broker: se escribe justo cuando el fill fue peor que el precio apuntado.
     Si la R sigue saliendo de los precios, la app esconde el slippage y
     presume de una ventaja que no tuvo. Medido antes de arreglarlo: la misma
     operacion valia -7 USD y +10 R a la vez. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, stop: 20990, exit: 21100, qty: 1, pnl: -7 });
  eq(r.riskUsd, 20, "riesgo 10 puntos x 2 USD = 20");
  eq(r.rReal, -0.35, "la R sale del P&L reportado (-7/20), no de los precios (+10)");
  ok(r.pnlEff < 0 && r.rReal < 0, "el P&L y la R de una operacion nunca tienen signos opuestos");
}
{
  /* Sin P&L a mano nada cambia: la R sigue siendo la de los precios. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, stop: 20990, exit: 21020, qty: 1 });
  eq(r.rReal, 2, "sin P&L a mano la R es la de los precios");
}
{
  /* Un P&L a mano sin stop no tiene riesgo con el que dividir: R null, no cero. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, exit: 21100, qty: 1, pnl: -7 });
  eq(r.rReal, null, "sin stop no hay R que calcular, ni siquiera con P&L a mano");
}
{
  /* Simbolo desconocido + P&L a mano: sin multiplicador no hay forma de pasar
     ese dolar a R, y la de los precios saldria +2 sobre una perdida. */
  const r = Q.calcularTradeApp({ instrument: "FOO", direction: "long", entry: 100, stop: 90, exit: 120, qty: 1, pnl: -7 });
  eq(r.pnlEff, -7, "el P&L a mano sobrevive sin contrato");
  eq(r.rReal, null, "y la R no se inventa a partir de los precios");
}
{
  /* Las comisiones del journal mueven el P&L: la R tiene que moverse con el.
     Medido antes de arreglarlo: 25 USD de comisiones dejaban la operacion en
     -5 USD y la app seguia publicando +1,0 R. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, stop: 20990, exit: 21010, qty: 1, fees: 25 });
  eq(r.pnlEff, -5, "20 USD de recorrido menos 25 de comisiones son -5");
  eq(r.rReal, -0.25, "y la R es -0,25, no la bruta +1");
  ok(r.pnlEff < 0 && r.rReal < 0, "el P&L y la R no tienen signos opuestos por una comision");
}
{
  /* Comisiones automaticas del contrato: mismo caso, mismo arreglo. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, stop: 20990, exit: 21000.5, qty: 1 }, { incluirComisiones: true });
  eq(r.pnlEff, -0.5, "1 USD de recorrido menos 1,50 de comision son -0,50");
  ok(r.rReal < 0, "y la R acompana: antes publicaba +0,05");
}
{
  /* Sin comisiones, rNeto y rBruto son el mismo numero: nada de lo que ya
     estaba bien se mueve. */
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, stop: 20990, exit: 21010, qty: 3 });
  eq(r.pnlEff, 60, "3 contratos, 10 puntos, sin comisiones");
  eq(r.rReal, 1, "y la R sigue siendo 1");
}

/* ═══ pureza ═══ */
grupo("pureza");
{
  const t = { instrument: "MNQ", direction: "long", entry: 20000, exit: 20042.5, stop: 19990, qty: 2 };
  const antes = JSON.stringify(t);
  Q.calcularTradeApp(t);
  eq(JSON.stringify(t), antes, "el motor no muta su entrada");
}
{
  const a = Q.valuarOperacion({ simbolo: "MNQ", direccion: "long", entrada: 20000, salida: 20042.5, stop: 19990, contratos: 2 }, {}).value;
  let lanzo = false;
  try { a.pnlNeto = 0; if (a.pnlNeto === 0) lanzo = false; else lanzo = true; } catch (e) { lanzo = true; }
  ok(lanzo, "el resultado es inmutable");
}

console.log(`\n${"─".repeat(56)}\n${pass} ok · ${fail} fallos`);
if (fallos.length) { console.log("\nFALLOS:"); fallos.forEach(f => console.log("  ✗ " + f)); process.exit(1); }

/* ═══ resolución de Monte Carlo ═══ */
{
  const rs = [2, -1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1];
  const v = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 100, saldoInicial: 25000, ddMaximo: 1000, objetivoGanancia: 1500, caminos: 2000, semilla: 11 }).value;
  ok(v.errorEstandar && v.errorEstandar.pasar !== undefined, "la simulacion reporta su propio error estandar");
  eq(v.resolucion, 0.0005, "y su resolucion: 1/caminos");
  near(v.pPasar + v.pQuemar + v.pSinResolver, 1, 1e-9, "las tres probabilidades suman exactamente 1");
}
console.log(`\n${pass} ok · ${fail} fallos (con resolucion MC)`);
if (fallos.length) process.exit(1);

/* ═══ números en negativo ═══ */
grupo("negativos · consistencia sin ganancia");
{
  const k = Q.evaluarConsistencia([{ pnl: 100 }, { pnl: -220 }], 50).value;
  eq(k.total, -120, "total negativo se conserva");
  eq(k.ratio, null, "sin ganancia el ratio es null, NUNCA el centinela 1 pintado como 100%");
  eq(k.sinGanancia, true, "y se marca explícitamente");
  eq(k.cumple, null, "cumple es null: no es ni cumplir ni incumplir");
  ok(/no hay ganancia/i.test(k.razonSinRatio), "y dice por qué");
  eq(k.falta, 320, "lo que falta para cobrar sigue siendo medible: 100/0.5 - (-120)");
  eq(k.topeDiaHoy, 0, "no hay tope de día que calcular");
}
{
  const k = Q.evaluarConsistencia([{ pnl: -50 }, { pnl: -70 }], 50).value;
  eq(k.mejor, 0, "sin días verdes el mejor día es 0");
  eq(k.ratio, null, "ratio null");
  eq(k.falta, 0, "sin mejor día no hay nada que exigir");
}

grupo("negativos · ganancia previa y mejor día previos en rojo");
{
  const k = Q.evaluarConsistencia([{ pnl: 200 }], 50, { gananciaPrevia: -500, mejorDiaPrevio: 0 }).value;
  eq(k.total, -300, "ganancia previa negativa se suma correctamente");
  eq(k.ratio, null, "y deja la consistencia sin aplicar");
}
{
  const k = Q.evaluarConsistencia([{ pnl: 200 }, { pnl: 300 }], 50, { gananciaPrevia: -100 }).value;
  eq(k.total, 400, "previa negativa + journal positivo");
  near(k.ratio, 300 / 400, 1e-6, "el ratio vuelve a existir en cuanto hay ganancia");
  eq(k.cumple, false, "75% supera el límite del 50%");
}
grupo("negativos · curva y ventaja");
{
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: -300 }, { fecha: "2026-09-02", pnl: -400 }], { saldoInicial: 25000, ddTipo: "trailing_lock", ddMaximo: 1000 }).value;
  eq(c.equity, 24300, "equity por debajo del inicio");
  eq(c.pico, 25000, "el pico es el arranque: nunca se subió de ahí");
  eq(c.suelo, 24000, "suelo correcto");
  eq(c.colchon, 300, "colchón positivo pero pequeño");
  eq(c.quemadaEn, null, "aún no quemada");
}
{
  const c = Q.construirCurva([{ fecha: "2026-09-01", pnl: -1200 }], { saldoInicial: 25000, ddTipo: "trailing_lock", ddMaximo: 1000 }).value;
  eq(c.colchon, -200, "colchón NEGATIVO cuando se pasa del suelo");
  ok(c.quemadaEn !== null, "y la cuenta queda marcada como quemada");
}
{
  const e = Q.analizarEdge([{ pnl: -100, r: -1 }, { pnl: -100, r: -1 }, { pnl: 80, r: 0.8 }, { pnl: -100, r: -1 }]).value;
  ok(e.pnlTotal < 0, "P&L total negativo");
  ok(e.esperanzaR.valor < 0, "esperanza negativa");
  ok(e.kelly.completo < 0, "Kelly negativo");
  ok(/no operar/.test(e.kelly.razon), "y dice que la fracción óptima es no operar");
  eq(e.kelly.recomendado, null, "sin fracción recomendada sobre una ventaja negativa");
  eq(e.concentracion, null, "sin ganancia total no hay concentración que medir");
}
{
  const rs = [-1, -1, -1, 1.2, -1, -1, 1, -1, -1, -1];
  const s = Q.simularCuenta({ rMultiples: rs, riesgoPorOperacion: 100, saldoInicial: 25000, ddTipo: "trailing_lock", ddMaximo: 1000, objetivoGanancia: 1500, caminos: 800, semilla: 4 }).value;
  eq(s.pPasar, 0, "con ventaja negativa no se pasa la cuenta en ningún camino");
  eq(s.pQuemar, 1, "y se quema en todos");
  ok(s.colchonMinimo.mediana <= 0, "el colchón mínimo esperado es negativo o cero");
}
grupo("modelo paramétrico");
{
  const a = Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: 10, objetivoUnidades: 30 });
  const b = Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: 10, objetivoUnidades: 30 });
  eq(a.value.pQuemar, b.value.pQuemar, "misma semilla -> mismo resultado");
  near(a.value.esperanzaR, 0.45 * 2 - 0.55, 1e-9, "esperanza en R = p*R - q");
  ok(a.value.pQuemar < 0.1, "con ventaja positiva y 10 unidades de colchón, la ruina es baja");
}
{
  const v = Q.simularParametrico({ acierto: 30, gananciaR: 2, colchonUnidades: 10, objetivoUnidades: 30 }).value;
  ok(v.esperanzaR < 0, "30% con 2R tiene esperanza negativa");
  ok(v.pQuemar > 0.9, "y la ruina es casi segura");
}
eq(Q.simularParametrico({ acierto: 0.45, gananciaR: 2, colchonUnidades: 10 }).value.esperanzaR,
   Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: 10 }).value.esperanzaR,
   "0.45 y 45 significan lo mismo");
{
  const v = Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: 0 }).value;
  ok(v.yaQuemada && v.pQuemar === 1, "sin colchón la cuenta ya está quemada: no es una probabilidad");
  ok(/no es una probabilidad/.test(v.nota), "y lo dice");
}
{
  const v = Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: -5 }).value;
  ok(v.yaQuemada, "colchón NEGATIVO también es cuenta quemada");
}
ok(!Q.simularParametrico({ acierto: 0, gananciaR: 2, colchonUnidades: 10 }).ok, "acierto 0 se rechaza");
ok(!Q.simularParametrico({ acierto: 100, gananciaR: 2, colchonUnidades: 10 }).ok, "acierto 100% se rechaza");
ok(!Q.simularParametrico({ acierto: 45, gananciaR: 0, colchonUnidades: 10 }).ok, "ganancia 0R se rechaza");
{
  const v = Q.simularParametrico({ acierto: 45, gananciaR: 2, colchonUnidades: 10, objetivoUnidades: 30 }).value;
  ok(v.errorEstandar.quemar >= 0 && v.resolucion === 0.00025, "reporta su propio error y su resolución");
}

grupo("probabilidad de racha (valor exacto, no simulación)");
eq(Q.probabilidadDeRacha(0.5, 1, 1), 0.5, "una pérdida en una operación");
eq(Q.probabilidadDeRacha(0.5, 2, 2), 0.25, "dos seguidas en dos operaciones");
eq(Q.probabilidadDeRacha(0.5, 20, 10), 0, "una racha más larga que la muestra es imposible");
eq(Q.probabilidadDeRacha(0, 3, 100), 0, "sin pérdidas no hay rachas");
eq(Q.probabilidadDeRacha(1, 3, 100), 1, "perdiendo siempre la racha es segura");
ok(Q.probabilidadDeRacha(0.55, 5, 100) > 0.9, "con 55% de pérdidas, 5 seguidas en 100 es casi segura");
ok(Q.probabilidadDeRacha(0.55, 5, 100) > Q.probabilidadDeRacha(0.55, 8, 100), "rachas más largas son menos probables");
ok(Q.probabilidadDeRacha(0.55, 5, 200) > Q.probabilidadDeRacha(0.55, 5, 100), "más operaciones, más probable verla");

grupo("una sola definición del suelo");
{
  /* El calculador de riesgo tenía su propia riskThreshold(). Dos definiciones
     de cuándo revientas es exactamente el bug de las dos tablas de multiplicadores. */
  const casos = [
    ["estatico", 25000, 26000, 1000, 24000],
    ["trailing", 25000, 26000, 1000, 25000],
    ["trailing_lock", 25000, 26000, 1000, 25000],
    ["trailing_lock", 25000, 25500, 1000, 24500],
    ["trailing", 50000, 50000, 2000, 48000],
  ];
  for (const [tipo, size, peak, dd, esperado] of casos)
    eq(Q.sueloPara(tipo, size, peak, dd), esperado, `suelo ${tipo} size=${size} pico=${peak} dd=${dd}`);
}

console.log(`\n${pass} ok · ${fail} fallos (con negativos)`);
if (fallos.length) { console.log("\nFALLOS:"); fallos.forEach(f => console.log("  ✗ " + f)); process.exit(1); }

grupo("avisos que la interfaz puede mostrar");
{
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000.13, exit: 21030, stop: 20990, qty: 2 });
  ok(r.avisos.length > 0, "un precio fuera de rejilla genera aviso");
  const a = r.avisos.find(x => x.code === "PRECIO_FUERA_DE_REJILLA");
  ok(!!a, "con su código");
  ok(/21000\.13/.test(a.mensaje), "el mensaje nombra el precio exacto");
  eq(a.detalle.campo, "entrada", "y el campo afectado");
  eq(a.detalle.ajustado, 21000.25, "y a qué valor de la rejilla cae");
}
{
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, exit: 21030, stop: 21010, qty: 1 });
  ok(r.avisos.some(x => x.code === "STOP_INCOHERENTE"), "un stop al otro lado también avisa");
}
{
  const r = Q.calcularTradeApp({ instrument: "MNQ", direction: "long", entry: 21000, exit: 21030, stop: 20990, qty: 2 });
  eq(r.avisos.length, 0, "una operación limpia no genera ruido");
}
grupo("excursión · MAE y MFE");
{
  const e = Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990, salida: 21030, mae: 20994, mfe: 21045 });
  eq(e.riesgoPuntos, 10, "riesgo en puntos");
  eq(e.adversoPuntos, 6, "fue 6 puntos en contra");
  eq(e.maeR, 0.6, "MAE = 0.6R");
  eq(e.mfeR, 4.5, "MFE = 4.5R");
  eq(e.logradoR, 3, "salió con +3R");
  near(e.capturaMFE, 30 / 45, 1e-4, "capturó dos tercios del recorrido");
  eq(e.usoDelStop, 0.6, "gastó el 60% del stop");
  eq(e.ticksAdverso, 24, "6 puntos MNQ = 24 ticks");
  eq(e.ganadora, true, "clasifica ganadora");
}
{
  const e = Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "short", entrada: 21030, stop: 21040, salida: 21000, mae: 21036, mfe: 20985 });
  eq(e.maeR, 0.6, "corto: MAE simétrico");
  eq(e.mfeR, 4.5, "corto: MFE simétrico");
  eq(e.logradoR, 3, "corto: mismo R logrado");
}
{
  const e = Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990, salida: 21030 });
  eq(e.maeR, null, "sin MAE devuelve null, no cero");
  eq(e.mfeR, null, "sin MFE devuelve null, no cero");
  eq(e.capturaMFE, null, "y sin MFE no hay captura que calcular");
}
{
  const e = Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "long", entrada: 21000, salida: 21030, mae: 20994, mfe: 21045 });
  eq(e.maeR, null, "sin stop no hay R: división por cero evitada");
  eq(e.adversoPuntos, 6, "pero la distancia en puntos sí existe");
}
{
  /* un MAE al otro lado de la entrada no es excursión adversa: es ruido de captura */
  const e = Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990, salida: 21030, mae: 21005, mfe: 21045 });
  eq(e.adversoPuntos, 0, "un MAE por encima de la entrada en largo se lee como 0, no como negativo");
}
eq(Q.excursionDeOperacion({ simbolo: "MNQ", direccion: "long" }), null, "sin entrada no hay excursión");
eq(Q.excursionDeOperacion({ simbolo: "FOO", direccion: "long", entrada: 100, stop: 90, salida: 120, mae: 96, mfe: 130 }).maeR, 0.4,
   "símbolo desconocido: R sigue existiendo porque es cociente de precios");

grupo("excursión · conclusiones agregadas");
{
  /* 12 ganadoras que nunca pasaron del 50% del stop: sobra la mitad del stop */
  const ops = [];
  for (let i = 0; i < 12; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 21020, mae: 21000 - (3 + (i % 3)), mfe: 21040 });
  const a = Q.analizarExcursion(ops).value;
  eq(a.conMAE, 12, "cuenta las que traen MAE");
  ok(a.stop.usoP95 <= 0.55, "el 95% de las ganadoras no pasó del 55% del stop");
  ok(a.stop.margenSobrante >= 0.45, "sobra casi la mitad del stop");
  ok(a.stop.recorteSugerido > 0, "y sugiere recortarlo");
  ok(!a.stop.fiable, "pero con n=12 avisa de que no es fiable");
}
{
  /* ganadoras que usan casi todo el stop: no hay nada que recortar */
  const ops = [];
  for (let i = 0; i < 10; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 21020, mae: 20991, mfe: 21040 });
  const a = Q.analizarExcursion(ops).value;
  eq(a.stop.recorteSugerido, 0, "sin margen sobrante no sugiere recorte");
}
{
  const ops = [];
  for (let i = 0; i < 10; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 21010, mae: 20995, mfe: 21050 });
  const a = Q.analizarExcursion(ops).value;
  near(a.salida.capturaMedia, 0.2, 1e-6, "captura el 20% del recorrido disponible");
  near(a.salida.dejadoEnLaMesaR, 4, 1e-6, "deja 4R de media en la mesa");
}
{
  /* mezcla de ganadoras y perdedoras: la captura NO puede salir negativa */
  const ops = [];
  for (let i = 0; i < 10; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 21020, mae: 20995, mfe: 21040 });
  for (let i = 0; i < 20; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 20990, mae: 20990, mfe: 21030 });
  const a = Q.analizarExcursion(ops).value;
  ok(a.salida.capturaMedia > 0 && a.salida.capturaMedia <= 1, "la captura se promedia sólo sobre ganadoras: nunca negativa");
  eq(a.salida.n, 10, "y su n son las ganadoras, no el total");
}
{
  /* 20 operaciones que llegaron a +3R y acabaron en el stop */
  const ops = [];
  for (let i = 0; i < 20; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 20990, mae: 20990, mfe: 21030 });
  for (let i = 0; i < 10; i++) ops.push({ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990,
    salida: 21020, mae: 20995, mfe: 21025 });
  const a = Q.analizarExcursion(ops).value;
  eq(a.devueltas.llegaronA1R, 30, "todas llegaron al menos a 1R a favor");
  eq(a.devueltas.acabaronEnPerdida, 20, "y 20 acabaron en pérdida");
  near(a.devueltas.tasa, 20 / 30, 1e-4, "dos de cada tres ganancias se devolvieron");
  near(a.devueltas.rMedioDevuelto, 4, 1e-6, "devolviendo 4R de media (de +3R a -1R)");
}
eq(Q.analizarExcursion([]).value.n, 0, "lista vacía no revienta");
{
  const a = Q.analizarExcursion([{ simbolo: "MNQ", direccion: "long", entrada: 21000, stop: 20990, salida: 21020, mae: 20995, mfe: 21040 }]).value;
  eq(a.stop, null, "con una sola operación no se concluye nada sobre el stop");
  eq(a.salida, null, "ni sobre la salida");
  ok(a.faltanParaMedir > 0, "y dice cuántas faltan");
}

grupo("cartera · fechas y capitalización");
eq(Q.aniosEntre("2025-01-01", "2026-01-01"), 365 / 365, "un año son 365 días");
near(Q.aniosEntre("2025-01-01", "2025-07-02"), 182 / 365, 1e-9, "182 días son 0,4986 años");
eq(Q.aniosEntre("mal", "2026-01-01"), null, "fecha inválida devuelve null");
{
  /* 1000 capitalizado al 10% durante un año vale 1100 */
  const v = Q.valorCapitalizado([{ fecha: "2025-01-01", monto: 1000 }], 0.10, "2026-01-01");
  near(v, 1100, 0.5, "capitaliza hacia adelante, no descuenta");
}
{
  /* el signo del exponente fue un bug real: dividir devuelve una tasa negativa
     para una cartera que gana */
  const ops = [{ fecha: "2025-01-01", tipo: "compra", monto: 1000 }];
  const v = Q.analizarCartera({ ops, valorActual: 1100, hasta: "2026-01-01" }).value;
  near(v.irrAnual, 0.10, 1e-4, "una compra con +10% en un año da IRR 10%, no negativo");
  near(v.retornoSimple, 0.10, 1e-6, "y con un solo flujo el simple coincide");
}

grupo("cartera · el defecto que corrige");
{
  const ops = [];
  for (let m = 0; m < 12; m++) ops.push({ fecha: `2025-${String(m + 1).padStart(2, "0")}-01`, tipo: "aporte", monto: 200 });
  const v = Q.analizarCartera({ ops, valorActual: 2528.11, hasta: "2026-01-01" }).value;
  eq(v.invertido, 2400, "aportado");
  near(v.retornoSimple, 0.0534, 1e-3, "el retorno simple dice 5.3%");
  near(v.irrAnual, 0.10, 0.01, "el IRR dice 10%");
  ok(v.irrAnual > v.retornoSimple, "con aportes repartidos el simple SIEMPRE queda por debajo");
  ok(/resta/.test(v.brechaTexto || ""), "y la brecha se explica en texto");
}
{
  const v = Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: 1000 }], valorActual: 1100, hasta: "2026-01-01" }).value;
  eq(v.twr, null, "el TWR no se inventa");
  ok(/no se registra/.test(v.twrRazon), "se dice por qué falta");
}

grupo("cartera · signos y tipos de operación");
{
  const v = Q.analizarCartera({ ops: [
    { fecha: "2025-01-01", tipo: "compra", monto: 1000 },
    { fecha: "2025-06-01", tipo: "dividendo", monto: 30 },
    { fecha: "2025-09-01", tipo: "venta", monto: 400 },
  ], valorActual: 700, hasta: "2026-01-01" }).value;
  eq(v.invertido, 1000, "solo la compra sale del bolsillo");
  eq(v.recuperado, 430, "dividendo y venta vuelven");
  eq(v.ganancia, 130, "ganancia = recuperado + valor − invertido");
  ok(v.irrAnual > 0, "IRR positivo");
}
{
  /* el tipo lleva el signo: un monto negativo NO debe invertir la dirección */
  const a = Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: 1000 }], valorActual: 1100, hasta: "2026-01-01" }).value;
  const b = Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: -1000 }], valorActual: 1100, hasta: "2026-01-01" }).value;
  eq(a.invertido, b.invertido, "un monto en negativo se lee como magnitud, igual que en el ledger");
  eq(a.irrAnual, b.irrAnual, "y no cambia el resultado");
}

grupo("cartera · lo que se niega a calcular");
ok(!Q.analizarCartera({ ops: [], valorActual: 100, hasta: "2026-01-01" }).ok, "sin operaciones no hay retorno");
ok(!Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: 100 }], hasta: "2026-01-01" }).ok, "sin valor actual tampoco");
ok(!Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: 100 }], valorActual: 100 }).ok, "sin fecha de corte tampoco");
{
  /* todo el dinero saliendo y nada volviendo: el IRR no existe */
  const r = Q.irr([{ fecha: "2025-01-01", monto: -100 }, { fecha: "2025-06-01", monto: -100 }], "2026-01-01");
  ok(!r.ok && r.error.code === "SIN_CAMBIO_DE_SIGNO", "sin cambio de signo se niega, en vez de devolver un número");
}
{
  const v = Q.analizarCartera({ ops: [{ fecha: "2025-01-01", tipo: "compra", monto: 1000 }], valorActual: 0, hasta: "2026-01-01" }).value;
  eq(v.irrAnual, null, "pérdida total: el IRR no converge en el rango y se dice");
  ok(v.irrError !== null, "con su motivo");
}
ok(!Q.irr([{ fecha: "2025-01-01", monto: -100 }], "2026-01-01").ok, "un solo flujo no define un IRR");

grupo("cartera · CAGR de una posición");
near(Q.cagr(1000, 1100, 1), 0.10, 1e-6, "+10% en un año");
near(Q.cagr(1000, 1210, 2), 0.10, 1e-6, "+21% en dos años son 10% anual");
eq(Q.cagr(1000, 0, 1), -1, "a cero es −100%");
eq(Q.cagr(0, 100, 1), null, "sin inversión inicial no hay CAGR");
eq(Q.cagr(1000, 1100, 0), null, "sin tiempo transcurrido tampoco");

console.log(`\n${pass} ok · ${fail} fallos (avisos)`);
if (fallos.length) { console.log("\nFALLOS:"); fallos.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
