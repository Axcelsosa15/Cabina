/* =========================================================================
   QuantEngine · cumplimiento de reglas de cuenta
   -------------------------------------------------------------------------
   Los margenes de las reglas de una cuenta de fondeo: cuanto queda de la
   perdida diaria, del drawdown y hasta donde se puede ganar hoy. El veredicto
   (lista / aviso / bloqueada / quemada) lo da la app en evaluateAccountRules,
   que conoce tambien pausa, archivo, instrumentos y rachas.
   ========================================================================= */

import { Ok, toNum, roundTo, clamp } from "./kernel.js";

const NIVELES = [
  { hasta: 0.50, codigo: "seguro", etiqueta: "SEGURO", clase: "good" },
  { hasta: 0.75, codigo: "precaucion", etiqueta: "PRECAUCION", clase: "warn" },
  { hasta: 1.00, codigo: "peligro", etiqueta: "PELIGRO", clase: "bad" },
];

/* Cuanto queda del limite de perdida diaria. */
export function margenDePerdida(pnlHoy, maximo) {
  const max = Math.abs(toNum(maximo) ?? 0);
  const usado = Math.max(0, -(toNum(pnlHoy) ?? 0));
  if (!max) return { aplica: false, max: 0, usado, restante: null, pct: 0, codigo: "sin_regla", etiqueta: "SIN REGLA", clase: "dim", agotado: false };
  const pct = Math.min(1, usado / max);
  const nivel = pct >= 1 ? { codigo: "agotado", etiqueta: "BLOQUEADA", clase: "bad" } : NIVELES.find(x => pct < x.hasta);
  return { aplica: true, max, usado: roundTo(usado, 2), restante: roundTo(Math.max(0, max - usado), 2),
           pct: roundTo(pct, 4), codigo: nivel.codigo, etiqueta: nivel.etiqueta, clase: nivel.clase, agotado: pct >= 1 };
}

/* Cuanto se puede ganar hoy sin romper nada: manda el menor entre la regla
   dura y el tope que impone la consistencia. */
export function topeDeGanancia(consistencia, reglaMaxima) {
  const dura = toNum(reglaMaxima);
  const cons = consistencia && consistencia.aplica && consistencia.total > 0 ? toNum(consistencia.topeDiaHoy) : null;
  if (dura === null && cons === null) return { valor: null, porque: "falta la regla de tope de ganancia" };
  if (dura === null) return { valor: cons, porque: "lo marca la consistencia" };
  if (cons === null) return { valor: dura, porque: "tu regla dura" };
  return cons < dura ? { valor: cons, porque: "lo marca la consistencia" } : { valor: dura, porque: "tu regla dura" };
}

/* Margen de drawdown restante, expresado tambien en operaciones perdedoras:
   "te quedan 2.3 stops" comunica mucho mas que "colchon 92 USD". */
export function margenDeDrawdown(curva, riesgoPorOperacion) {
  const colchon = toNum(curva && curva.colchon);
  const max = toNum(curva && curva.ddMaximo);
  if (colchon === null || max === null || max <= 0) return { aplica: false };
  const riesgo = toNum(riesgoPorOperacion);
  const pct = clamp((max - colchon) / max, 0, 1);
  const nivel = pct >= 1 ? { codigo: "quemada", etiqueta: "QUEMADA", clase: "bad" } : NIVELES.find(x => pct < x.hasta);
  return {
    aplica: true, colchon: roundTo(colchon, 2), max, usado: roundTo(max - colchon, 2),
    pct: roundTo(pct, 4), codigo: nivel.codigo, etiqueta: nivel.etiqueta, clase: nivel.clase,
    quemada: colchon <= 0,
    stopsRestantes: riesgo && riesgo > 0 ? roundTo(colchon / riesgo, 2) : null,
    peorMomento: curva && curva.peorMomento ? curva.peorMomento : null,
  };
}
