/* ESM, no CommonJS: el package.json del repo declara "type": "module", asi que
   un require() aqui ni siquiera compila. Estuvo roto desde que se añadio ese
   package.json, y nadie lo noto porque nada ejecutaba este archivo. */
import * as E from "./MathEngine.js";
let ok = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function t(nombre, real, esperado) {
  if (eq(real, esperado)) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre + "\n      esperado: " + JSON.stringify(esperado) + "\n      real:     " + JSON.stringify(real)); }
}
function show(nombre, v) { console.log("  · " + nombre.padEnd(46) + JSON.stringify(v)); }

console.log("\n=== 1. getInstrumentConfig ===");
t("MNQ", (({ multiplier, tickSize, commissionPerContract, tickValue }) => ({ multiplier, tickSize, commissionPerContract, tickValue }))(E.getInstrumentConfig("MNQ")), { multiplier: 2, tickSize: 0.25, commissionPerContract: 1.5, tickValue: 0.5 });
t("ES", E.getInstrumentConfig("ES").multiplier, 50);
t("NQ tickValue", E.getInstrumentConfig("NQ").tickValue, 5);
t("MES tickValue", E.getInstrumentConfig("MES").tickValue, 1.25);
t("BTC", E.getInstrumentConfig("BTC").tickValue, 25);
t("MNQZ5 -> MNQ (vencimiento)", E.getInstrumentConfig("MNQZ5").symbol, "MNQ");
t("minúsculas + espacios", E.getInstrumentConfig("  mnq ").multiplier, 2);
t("desconocido NO hereda multiplicador", E.getInstrumentConfig("XYZ").multiplier, null);
show("desconocido: error", E.getInstrumentConfig("XYZ").error);
t("override", E.getInstrumentConfig("XYZ", { XYZ: { multiplier: 7, tickSize: 0.1, commissionPerContract: 2 } }).multiplier, 7);

console.log("\n=== 2. calculatePnL ===");
const sl = E.calculatePnL("long", 21000, 20950, 2, "MNQ", 20950);
t("MNQ long 2 ctos, tocó el SL: bruto", sl.pnlBruto, -200);
t("  comisiones (1.5 x 2 round turn)", sl.comisiones, 3);
t("  neto", sl.pnlNeto, -203);
t("  riesgo inicial", sl.riesgoInicialUSD, 200);
t("  R (sobre neto, incluye comisiones)", sl.rMultiple, -1.02);
t("  R sobre bruto = -1 exacto (7 args)", E.calculatePnL("long", 21000, 20950, 2, "MNQ", 20950, { rSobreBruto: true }).rMultiple, -1);
t("  opciones en el sitio del stop: no hay stop, R null", E.calculatePnL("long", 21000, 20950, 2, "MNQ", { rSobreBruto: true }).rMultiple, null);
t("  ...y el P&L sigue saliendo", E.calculatePnL("long", 21000, 20950, 2, "MNQ", { rSobreBruto: true }).pnlNeto, -203);
const gana = E.calculatePnL("long", 21000, 21100, 2, "MNQ", 20950);
t("ganadora 2R: neto", gana.pnlNeto, 397);
t("  R", gana.rMultiple, 1.99);
const corto = E.calculatePnL("short", 21000, 20900, 1, "MNQ", 21050);
t("short ganador: bruto", corto.pnlBruto, 200);
t("  riesgo", corto.riesgoInicialUSD, 100);
t("llamada de 5 args (tu firma): R null", E.calculatePnL("long", 21000, 20950, 2, "MNQ").rMultiple, null);
t("  ...pero el P&L sí sale", E.calculatePnL("long", 21000, 20950, 2, "MNQ").pnlNeto, -203);
t("ABIERTA (sin salida): pnlNeto null, no 0", E.calculatePnL("long", 21000, null, 2, "MNQ", 20950).pnlNeto, null);
t("  y marca abierta", E.calculatePnL("long", 21000, null, 2, "MNQ", 20950).abierta, true);
t("  con riesgo ya calculado", E.calculatePnL("long", 21000, null, 2, "MNQ", 20950).riesgoInicialUSD, 200);
show("stop imposible en long", E.calculatePnL("long", 21000, 21100, 1, "MNQ", 21050).error);
show("símbolo desconocido", E.calculatePnL("long", 100, 110, 1, "XYZ").error);
show("contratos 0", E.calculatePnL("long", 21000, 21100, 0, "MNQ").error);
show("contratos negativos", E.calculatePnL("long", 21000, 21100, -2, "MNQ").error);
show("dirección inválida", E.calculatePnL("arriba", 21000, 21100, 1, "MNQ").error);
t("stop = entrada -> sin R, sin dividir por cero", E.calculatePnL("long", 21000, 21100, 1, "MNQ", 21000).rMultiple, null);

console.log("\n=== 2b. calculatePlannedR ===");
t("objetivo a 2R", E.calculatePlannedR(21000, 20950, 21100), 2);
t("objetivo a 1.5R", E.calculatePlannedR(21000, 20950, 21075), 1.5);
t("short a 2R", E.calculatePlannedR(21000, 21050, 20900), 2);
t("sin target", E.calculatePlannedR(21000, 20950, null), null);
t("sin stop", E.calculatePlannedR(21000, null, 21100), null);
t("stop = entrada (div/0)", E.calculatePlannedR(21000, 21000, 21100), null);

console.log("\n=== 2c. calculateRealR ===");
t("perdedora en el stop = -1R", E.calculateRealR("long", 21000, 20950, 20950), -1);
t("ganadora 2R", E.calculateRealR("long", 21000, 21100, 20950), 2);
t("short 2R", E.calculateRealR("short", 21000, 20900, 21050), 2);
t("NO necesita instrumento: símbolo raro da R igual", E.calculateRealR("long", 100, 110, 90), 1);
t("sin stop", E.calculateRealR("long", 21000, 21100, null), null);
t("stop = entrada", E.calculateRealR("long", 21000, 21100, 21000), null);
t("sin salida (abierta)", E.calculateRealR("long", 21000, null, 20950), null);

console.log("\n=== 3. calculateDrawdown ===");
const d3 = E.calculateDrawdown(25315, 25315, 1000);
t("3 args = trailing puro: suelo", d3.sueloCuenta, 24315);
t("  usado", d3.drawdownUsado, 0);
t("  estado", d3.estado, "ACTIVA");
const lock = E.calculateDrawdown(25315, 25315, 1000, { tipo: "trailing_lock", balanceInicial: 25000 });
t("Evaluación con trailing bloqueado: suelo", lock.sueloCuenta, 24315);
const lock2 = E.calculateDrawdown(26500, 26500, 1000, { tipo: "trailing_lock", balanceInicial: 25000 });
t("  congelado al superar el inicial", lock2.sueloCuenta, 25000);
t("  vs trailing puro, que seguiría subiendo", E.calculateDrawdown(26500, 26500, 1000).sueloCuenta, 25500);
const est = E.calculateDrawdown(25315, 25315, 1000, { tipo: "estatico", balanceInicial: 25000 });
t("estático: suelo fijo", est.sueloCuenta, 24000);
t("  colchón mayor que el máximo, usado = 0", est.drawdownUsado, 0);
t("pico no baja si el balance baja", E.calculateDrawdown(24500, 25315, 1000).nuevoPico, 25315);
t("  usado", E.calculateDrawdown(24500, 25315, 1000).drawdownUsado, 815);
t("suelo tocado -> BLOQUEADA", E.calculateDrawdown(24315, 25315, 1000).estado, "BLOQUEADA");
t("por debajo del suelo: usado no pasa del máximo", E.calculateDrawdown(23000, 25315, 1000).drawdownUsado, 1000);
t("  colchón nunca negativo", E.calculateDrawdown(23000, 25315, 1000).colchonRestante, 0);
t("sin pico previo lo inaugura el balance", E.calculateDrawdown(25000, null, 1000).nuevoPico, 25000);
show("drawdown 0", E.calculateDrawdown(25000, 25000, 0).error);
show("trailing_lock sin balanceInicial", E.calculateDrawdown(25000, 25000, 1000, { tipo: "trailing_lock" }).error);

console.log("\n=== 4. calculateConsistency ===");
const c = E.calculateConsistency({ "2026-09-14": 170, "2026-09-15": 145 }, { limitePorcentaje: 50 });
t("tu caso: mejor día", c.mejorDia, 170);
t("  ganancia total", c.gananciaTotal, 315);
t("  consistencia %", c.consistenciaPorcentaje, 53.97);
t("  total necesario", c.totalNecesario, 340);
t("  falta para retirar", c.dineroFaltanteParaRetiro, 25);
t("  estado", c.estado, "RESTRINGIDA");
t("límite 0.50 = 50 (misma cosa)", E.calculateConsistency({ a: 170, b: 145 }, { limitePorcentaje: 0.5 }).consistenciaPorcentaje, 53.97);
t("acepta lista [{date,pnl}]", E.calculateConsistency([{ date: "x", pnl: 170 }, { date: "y", pnl: 145 }], { limitePorcentaje: 50 }).mejorDia, 170);
const cOk = E.calculateConsistency({ a: 100, b: 100, c: 100, d: 100 }, { limitePorcentaje: 30 });
t("cumpliendo: estado", cOk.estado, "ACTIVA");
t("  falta 0", cOk.dineroFaltanteParaRetiro, 0);
t("  día máximo que aún cumple", cOk.diaMaximoPermitido, 171.43);
const neg = E.calculateConsistency({ a: -200, b: -100 });
t("todo en rojo: sin división por cero", neg.consistenciaPorcentaje, null);
t("  estado", neg.estado, "ACTIVA");
show("  nota", neg.nota);
const cero = E.calculateConsistency({ a: 200, b: -200 });
t("total exactamente 0", cero.consistenciaPorcentaje, null);
show("  nota", cero.nota);
t("sin días", E.calculateConsistency({}).gananciaTotal, 0);
t("un solo día verde = 100%", E.calculateConsistency({ a: 500 }, { limitePorcentaje: 50 }).consistenciaPorcentaje, 100);
t("  y le falta", E.calculateConsistency({ a: 500 }, { limitePorcentaje: 50 }).dineroFaltanteParaRetiro, 500);
show("entrada basura", E.calculateConsistency("no soy un objeto").error);

console.log("\n=== 5. calculatePositionSize ===");
const ps = E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0.01);
t("1% de 25.315 con stop de 50 pts", ps.contratos, 2);
t("  riesgo por contrato", ps.riesgoPorContrato, 100);
t("  riesgo permitido", ps.riesgoPermitido, 253.15);
t("  riesgo real asumido", ps.riesgoTotal, 200);
t("  limitante", ps.limitante, "porcentaje del balance");
t("1 se lee como 1%, NO como 100%", E.calculatePositionSize(25315, 21000, 20950, "MNQ", 1).contratos, 2);
t("  2 = 2%", E.calculatePositionSize(25315, 21000, 20950, "MNQ", 2).contratos, 5);
t("  0.02 = 2% también", E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0.02).contratos, 5);
t("siempre redondea HACIA ABAJO", E.calculatePositionSize(25000, 21000, 20940, "MNQ", 0.01).contratos, 2);
const cap = E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0.01, { colchonRestante: 150 });
t("el colchón manda sobre el 1%", cap.contratos, 1);
t("  limitante", cap.limitante, "colchón de drawdown");
const cap2 = E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0.01, { colchonRestante: 900, perdidaMaximaDiariaRestante: 120 });
t("la pérdida diaria manda", cap2.contratos, 1);
t("  limitante", cap2.limitante, "pérdida diaria restante");
const cap3 = E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0.05, { maxContratos: 2 });
t("regla de contratos máximos", cap3.contratos, 2);
t("  limitante", cap3.limitante, "regla de contratos máximos");
const nada = E.calculatePositionSize(25315, 21000, 20950, "ES", 0.01);
t("ES: ni un contrato entra", nada.contratos, 0);
show("  motivo", nada.error);
show("sin stop", E.calculatePositionSize(25315, 21000, null, "MNQ").error);
show("stop = entrada (división por cero)", E.calculatePositionSize(25315, 21000, 21000, "MNQ").error);
show("balance 0", E.calculatePositionSize(0, 21000, 20950, "MNQ").error);
show("balance negativo", E.calculatePositionSize(-500, 21000, 20950, "MNQ").error);
t("riesgo 0% -> 0 contratos", E.calculatePositionSize(25315, 21000, 20950, "MNQ", 0).contratos, 0);

console.log("\n=== redondeo ===");
t("1.005 -> 1.01 (no 1 como Math.round pelado)", E.redondear(1.005, 2), 1.01);
t("0.1+0.2 -> 0.3", E.dinero(0.1 + 0.2), 0.3);
t("-0 se normaliza a 0", Object.is(E.dinero(-0.001), 0), true);
t("2 decimales siempre", E.dinero(-203.00000000001), -203);

console.log("\n" + (fail ? "✗ " + fail + " fallos, " : "✓ ") + ok + " pruebas pasadas");
process.exit(fail ? 1 : 0);
