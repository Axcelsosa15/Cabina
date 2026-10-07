/**
 * QuantEngine · fachada pública
 *
 * Esta versión añade JSDoc para tipos y funciones, documentación clara y pequeñas
 * mejoras en patrones (constantes inmutables, validación mínima) sin cambiar
 * la lógica de negocio ni la API pública.
 *
 * Notas de diseño:
 * - Mantengo los nombres públicos en español para compatibilidad con la app.
 * - Añadí typedefs para facilitar autocompletado en editores y generación de docs.
 * - Las funciones auxiliares separan responsabilidades: normalizar, construir
 *   resultado de error y de éxito.
 */

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

/** Default options used by calcularTradeApp */
const APP_DEFAULT_OPTIONS = Object.freeze({
  incluirComisiones: false,
  overrides: null,
});

/**
 * @typedef {Object} TradeAppRaw
 * @property {string} [instrument]
 * @property {string|number} [entry]
 * @property {string|number} [exit]
 * @property {string|number} [stop]
 * @property {string|number} [target]
 * @property {string} [direction]
 * @property {string|number} [qty]
 * @property {string|number} [fees]
 * @property {string|number} [pnl]
 */

/**
 * @typedef {Object} TradeInput
 * @property {string|null} simbolo
 * @property {string|null} direccion
 * @property {number|null} entrada
 * @property {number|null} salida
 * @property {number|null} stop
 * @property {number|null} objetivo
 * @property {number} contratos
 * @property {number} comisionExtra
 */

/**
 * @typedef {Object} AppResult
 * @property {number|null} pnlEff
 * @property {number|null} rReal
 * @property {number|null} rPlanned
 * @property {number|null} riskUsd
 * @property {number|undefined} ticks
 * @property {number|undefined} eficiencia
 * @property {boolean} multUnknown
 * @property {string|null} calcError
 * @property {Array<Object>} avisos
 */

/**
 * Normaliza la entrada de la app a la forma que espera valuarOperacion.
 *
 * @param {TradeAppRaw} trade
 * @returns {TradeInput}
 */
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

/**
 * Construye el objeto que se devuelve cuando la evaluación de la operación falla.
 * No se altera la política: si hay un P&L manual, éste se preserva como pnlEff.
 *
 * @param {TradeAppRaw} trade
 * @param {Object} evaluation
 * @returns {AppResult}
 */
function buildAppErrorResult(trade = {}, evaluation = {}) {
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

/**
 * Construye el objeto de resultado cuando la evaluación tuvo éxito.
 *
 * @param {TradeAppRaw} trade
 * @param {Object} evaluation
 * @param {Object} value
 * @param {number|null} manualPnl
 * @returns {AppResult}
 */
function buildAppSuccessResult(trade = {}, evaluation = {}, value = {}, manualPnl = null) {
  const riesgoUsd = value?.riesgoUSD ?? null;

  return {
    pnlEff: manualPnl !== null ? manualPnl : value.pnlNeto,
    rReal: manualPnl !== null ? (riesgoUsd ? roundTo(manualPnl / riesgoUsd, 4) : null) : value.rNeto,
    rPlanned: value.rPlaneado,
    riskUsd: riesgoUsd,
    ticks: value.ticks,
    eficiencia: value.eficiencia,
    multUnknown: false,
    calcError: null,
    avisos: (evaluation.warnings || []).map(w => ({ code: w.code, mensaje: w.message, detalle: w.detail })),
  };
}

/**
 * Drop-in de tradeCalc: devuelve exactamente los campos derivados que los
 * renders de la app ya leen, ni uno más.
 *
 * @param {TradeAppRaw} trade
 * @param {Object} [opciones]
 * @returns {AppResult}
 */
export function calcularTradeApp(trade = {}, opciones = {}) {
  const cfg = { ...APP_DEFAULT_OPTIONS, ...(opciones ?? {}) };
  const normalized = asTradeInput(trade);
  const evaluation = valuarOperacion(normalized, cfg);

  if (!isOk(evaluation)) {
    return buildAppErrorResult(trade, evaluation);
  }

  const value = evaluation.value;
  const manual = toNum(trade.pnl);
  return buildAppSuccessResult(trade, evaluation, value, manual);
}

/**
 * R planeado sin contrato: tambien es un cociente de precios.
 *
 * @param {TradeAppRaw} trade
 * @returns {number|null}
 */
export function rPlanApp(trade = {}) {
  const entry = toNum(trade.entry);
  const stop = toNum(trade.stop);
  const target = toNum(trade.target);

  if (entry === null || stop === null || target === null) return null;
  const riesgo = Math.abs(entry - stop);
  if (!riesgo) return null;
  return roundTo(Math.abs(target - entry) / riesgo, 4);
}

/**
 * R real de una operacion aunque el simbolo sea desconocido: es un cociente
 * de precios, el multiplicador se cancela.
 *
 * @param {TradeAppRaw} trade
 * @returns {number|null}
 */
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

/**
 * Exposición pública: permite obtener la versión adaptada sin calcular nada.
 *
 * @param {TradeAppRaw} trade
 * @returns {TradeInput}
 */
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
