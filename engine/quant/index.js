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
import { valuarOperacion, dirOf, contratosDe } from "./trade.js";
import { analizarEdge } from "./edge.js";
import { construirCurva, metricasCurva, evaluarConsistencia, DD_TIPOS } from "./curve.js";
import { simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha } from "./survival.js";
import { analizarExcursion, excursionDeOperacion } from "./excursion.js";
import { analizarCartera, irr, cagr } from "./portfolio.js";

/* =========================================================================
   Adaptador para Cabina
   -------------------------------------------------------------------------
   La app guarda las operaciones con sus propios nombres de campo. En lugar de
   renombrar 5.000 lineas de render, la traduccion vive aqui, en un solo sitio,
   y es lo unico que hay que revisar si el modelo de datos cambia.
   ========================================================================= */

export function desdeTradeApp(t) {
  return {
    simbolo: t.instrument,
    direccion: t.direction,
    entrada: toNum(t.entry),
    salida: toNum(t.exit),
    stop: toNum(t.stop),
    objetivo: toNum(t.target),
    contratos: toNum(t.qty) || 1,
    comisionExtra: toNum(t.fees) || 0,
  };
}

/* Drop-in de tradeCalc: devuelve exactamente los campos derivados que los
   renders de la app ya leen, ni uno mas. */
export function calcularTradeApp(t, opciones) {
  const cfg = Object.assign({ incluirComisiones: false, overrides: null }, opciones || {});
  const r = valuarOperacion(desdeTradeApp(t), cfg);

  if (!isOk(r)) {
    /* Sin contrato no hay P&L en dolares, pero R SI existe: es un cociente de
       precios y el multiplicador se cancela. Perderlo aqui seria tirar la
       unica medida util que queda de una operacion con simbolo desconocido.

       SALVO si hay un P&L a mano: sin multiplicador no se puede pasar ese dolar
       a R, y la R de los precios contradiria el hecho reportado (podria salir
       positiva sobre una operacion que el broker liquido en perdida). Entre
       inventarla y no darla, no se da. */
    return {
      pnlEff: toNum(t.pnl),
      rReal: toNum(t.pnl) !== null ? null : rRealApp(t),
      rPlanned: rPlanApp(t),
      riskUsd: null,
      /* Sin contrato no hay dinero, pero la CANTIDAD si se sabe, y quien la
         necesite tiene que leerla de aqui y no resolverla otra vez. */
      contratos: contratosDe(t.qty),
      comisiones: null,
      multUnknown: r.error.code === "CONTRATO_DESCONOCIDO" && !!sym(t.instrument),
      calcError: r.error.message,
      avisos: [],
    };
  }
  const v = r.value;
  /* Un P&L escrito a mano siempre gana sobre el calculado: es un hecho
     reportado, no una estimacion. */
  const manual = toNum(t.pnl);
  return {
    pnlEff: manual !== null ? manual : v.pnlNeto,
    /* Y LA R LO SIGUE. La regla de arriba se aplicaba solo al P&L y se olvidaba
       aqui, dos lineas mas abajo: la misma operacion valia -7 USD y +10 R a la
       vez, porque la R salia de los precios apuntados. Un P&L a mano se escribe
       JUSTO cuando el fill fue peor que el precio apuntado, asi que esa R
       escondia el slippage y presumia de una ventaja que no existio -- en la
       Radiografia, en el Monte Carlo y en los doce sitios que leen rReal.
       Dividir por riesgoUSD es la MISMA formula que rBruto (el multiplicador y
       los contratos se cancelan), solo alimentada por el hecho reportado.

       Y sin P&L a mano se publica rNeto, no rBruto, por el mismo motivo: pnlEff
       YA viene neto de comisiones, asi que una R bruta describe otra operacion.
       Medido: con 25 USD en «Comisiones $» una operacion que pierde 5 USD
       publicaba +1,0 R; con comisiones automaticas, una que pierde 0,50 USD
       publicaba +0,05 R. Sin comisiones rNeto y rBruto son el MISMO numero, que
       es el caso normal: esto no mueve nada de lo que ya estaba bien. */
    rReal: manual !== null ? (v.riesgoUSD ? roundTo(manual / v.riesgoUSD, 4) : null) : v.rNeto,
    rPlanned: v.rPlaneado,
    riskUsd: v.riesgoUSD,
    /* La CANTIDAD y la COMISION ya resueltas por el motor. Se publican porque
       la pestana Metricas/Edge las derivaba por su cuenta (`Math.abs(qty) || 1`,
       `Math.abs(fees)`) y asi la misma operacion podia dar dos R distintas.
       Una sola respuesta, publicada, y la interfaz la lee. */
    contratos: v.contratos,
    comisiones: v.comisiones,
    ticks: v.ticks,
    eficiencia: v.eficiencia,
    multUnknown: false,
    calcError: null,
    /* Los avisos viajan enteros, no solo su codigo: la interfaz necesita poder
       decir QUE precio esta mal y a que valor cae en la rejilla del contrato. */
    avisos: r.warnings.map(w => ({ code: w.code, mensaje: w.message, detalle: w.detail })),
  };
}

/* R planeado sin contrato: tambien es un cociente de precios. */
export function rPlanApp(t) {
  const e = toNum(t.entry), s = toNum(t.stop), o = toNum(t.target);
  if (e === null || s === null || o === null) return null;
  const riesgo = Math.abs(e - s);
  if (!riesgo) return null;
  return roundTo(Math.abs(o - e) / riesgo, 4);
}

/* R real de una operacion aunque el simbolo sea desconocido: es un cociente
   de precios, el multiplicador se cancela. */
export function rRealApp(t) {
  const dir = dirOf(t.direction);
  const e = toNum(t.entry), s = toNum(t.stop), x = toNum(t.exit);
  if (e === null || s === null || x === null) return null;
  const riesgo = Math.abs(e - s);
  if (!riesgo) return null;
  return roundTo(((x - e) * dir) / riesgo, 4);
}

export const QuantEngine = {
  /* contratos */ CONTRACTS, resolveContract, rootOf,
  /* operacion */ valuarOperacion, dirOf, contratosDe,
  /* ventaja   */ analizarEdge,
  /* curva     */ construirCurva, metricasCurva, evaluarConsistencia, DD_TIPOS,
  /* riesgo    */ simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha,
  /* excursion */ analizarExcursion, excursionDeOperacion,
  /* cartera   */ analizarCartera, irr, cagr,
  /* app       */ calcularTradeApp, rRealApp, rPlanApp, desdeTradeApp,
};
export default QuantEngine;
