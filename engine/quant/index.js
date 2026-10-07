/* =========================================================================
   QuantEngine · fachada publica
   -------------------------------------------------------------------------
   Capas, de abajo a arriba. Cada una solo depende de las anteriores:

      kernel      Result, guardas, dinero entero, PRNG, normal inversa
      contracts   rejilla de ticks y especificacion de cada futuro
      trade       valuacion exacta de una operacion y dimensionamiento
      stats       momentos, cuantiles, intervalos, bootstrap, muestra minima
      edge        esperanza, profit factor, Kelly, SQN, rachas
      curve       curva de capital, drawdown como maquina de estados
      survival    Monte Carlo de supervivencia de cuenta
      compliance  margenes de perdida diaria, drawdown y tope de ganancia

   Nada de esto toca el DOM, ni el reloj, ni el azar sin semilla.
   ========================================================================= */

export * from "./kernel.js";
export * from "./contracts.js";
export * from "./trade.js";
export * from "./stats.js";
export * from "./edge.js";
export * from "./curve.js";
export * from "./survival.js";
export * from "./compliance.js";
export * from "./excursion.js";
export * from "./portfolio.js";

import { isOk, toNum, roundTo, sym } from "./kernel.js";
import { CONTRACTS, resolveContract, rootOf } from "./contracts.js";
import { valuarOperacion, dirOf } from "./trade.js";
import { analizarEdge } from "./edge.js";
import { construirCurva, metricasCurva, evaluarConsistencia, DD_TIPOS } from "./curve.js";
import { simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha } from "./survival.js";
import { analizarExcursion, excursionDeOperacion } from "./excursion.js";
import { analizarCartera, irr, cagr } from "./portfolio.js";

const APP_DEFAULT_OPTIONS = Object.freeze({
  incluirComisiones: false,
  overrides: null,
});

/* =========================================================================
   Adaptador para Cabina
   -------------------------------------------------------------------------
   La app guarda las operaciones con sus propios nombres de campo. En lugar de
   renombrar 5.000 lineas de render, la traduccion vive aqui, en un solo sitio,
   y es lo unico que hay que revisar si el modelo de datos cambia.
   ========================================================================= */

function asTradeInput(trade = {}) {
  return {
    simbolo: trade.instrument ?? null,
    direccion: trade.direction ?? null,
    entrada: toNum(trade.entry),
    salida: toNum(trade.exit),
    stop: toNum(trade.stop),
    objetivo: toNum(trade.target),
    contratos: toNum(trade.qty) || 1,
    comisionExtra: toNum(trade.fees) || 0,
  };
}

function buildAppErrorResult(trade, evaluation) {
  const errorCode = evaluation?.error?.code ?? "ERROR_DESCONOCIDO";
  return {
    pnlEff: toNum(trade.pnl),
    rReal: toNum(trade.pnl) !== null ? null : rRealApp(trade),
    rPlanned: rPlanApp(trade),
    riskUsd: null,
    multUnknown: errorCode === "CONTRATO_DESCONOCIDO" && !!sym(trade.instrument),
    calcError: evaluation?.error?.message ?? "No se pudo calcular la operación.",
    avisos: [],
  };
}

function buildAppSuccessResult(trade, evaluation, value, manual) {
  const riesgoUsd = value?.riesgoUSD ?? null;

  return {
    pnlEff: manual !== null ? manual : value.pnlNeto,
    rReal: manual !== null ? (riesgoUsd ? roundTo(manual / riesgoUsd, 4) : null) : value.rNeto,
    rPlanned: value.rPlaneado,
    riskUsd: riesgoUsd,
    ticks: value.ticks,
    eficiencia: value.eficiencia,
    multUnknown: false,
    calcError: null,
    avisos: evaluation.warnings.map(w => ({
      code: w.code,
      mensaje: w.message,
      detalle: w.detail,
    })),
  };
}

/* Drop-in de tradeCalc: devuelve exactamente los campos derivados que los
   renders de la app ya leen, ni uno mas. */
export function calcularTradeApp(trade, opciones) {
  const cfg = { ...APP_DEFAULT_OPTIONS, ...(opciones ?? {}) };
  const normalizedTrade = asTradeInput(trade ?? {});
  const evaluation = valuarOperacion(normalizedTrade, cfg);

  if (!isOk(evaluation)) {
    return buildAppErrorResult(trade ?? {}, evaluation);
  }

  const value = evaluation.value;
  const manual = toNum((trade ?? {}).pnl);

  return buildAppSuccessResult(trade ?? {}, evaluation, value, manual);
}

/* R planeado sin contrato: tambien es un cociente de precios. */
export function rPlanApp(trade = {}) {
  const entry = toNum(trade.entry);
  const stop = toNum(trade.stop);
  const target = toNum(trade.target);

  if (entry === null || stop === null || target === null) return null;

  const riesgo = Math.abs(entry - stop);
  if (!riesgo) return null;

  return roundTo(Math.abs(target - entry) / riesgo, 4);
}

/* R real de una operacion aunque el simbolo sea desconocido: es un cociente
   de precios, el multiplicador se cancela. */
export function rRealApp(trade = {}) {
  const direction = dirOf(trade.direction);
  const entry = toNum(trade.entry);
  const stop = toNum(trade.stop);
  const exit = toNum(trade.exit);

  if (entry === null || stop === null || exit === null) return null;

  const riesgo = Math.abs(entry - stop);
  if (!riesgo) return null;

  return roundTo(((exit - entry) * direction) / riesgo, 4);
}

export function desdeTradeApp(trade = {}) {
  return asTradeInput(trade);
}

export const QuantEngine = {
  /* contratos */ CONTRACTS, resolveContract, rootOf,
  /* operacion */ valuarOperacion, dirOf,
  /* ventaja   */ analizarEdge,
  /* curva     */ construirCurva, metricasCurva, evaluarConsistencia, DD_TIPOS,
  /* riesgo    */ simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha,
  /* excursion */ analizarExcursion, excursionDeOperacion,
  /* cartera   */ analizarCartera, irr, cagr,
  /* app       */ calcularTradeApp, rRealApp, rPlanApp, desdeTradeApp,
};
export default QuantEngine;
