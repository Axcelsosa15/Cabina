/* Empaqueta los modulos ESM en un unico IIFE para la app de un solo archivo.
   No es un bundler generico: asume que todos los modulos viven en un mismo
   ambito sin colisiones, y el `node --check` final lo verifica.
   Ejecutar: node engine/quant/bundle.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const ORDEN = ["kernel.js", "contracts.js", "trade.js", "stats.js", "edge.js", "curve.js", "survival.js", "compliance.js", "excursion.js", "portfolio.js", "index.js"];

const PUBLICOS = [
  "QE_VERSION", "Ok", "Err", "isOk", "addWarn", "unwrapOr", "allOk",
  "isFiniteNum", "toNum", "toInt", "toPosInt", "clamp", "sym",
  "roundHalfAway", "roundTo", "toCents", "fromCents", "sumCents",
  "rng", "randInt", "randNormal", "normalQuantile", "zFor", "normalCDF",
  "CONTRACTS", "rootOf", "resolveContract", "listContracts",
  "valuarOperacion", "dimensionar", "dirOf",
  "limpiar", "momentos", "cuantil", "mediana", "forma", "ciProporcion",
  "ciMedia", "bootstrapCI", "muestraMinima", "significanciaMedia", "veredicto", "UMBRALES",
  "analizarEdge",
  "DD_TIPOS", "sueloPara", "construirCurva", "metricasCurva", "evaluarConsistencia",
  "RESULTADO", "simularCuenta", "barridoDeRiesgo", "simularParametrico", "probabilidadDeRacha",
  "margenDePerdida", "topeDeGanancia", "margenDeDrawdown",
  "desdeTradeApp", "calcularTradeApp", "rRealApp", "rPlanApp",
  "excursionDeOperacion", "analizarExcursion",
  "analizarCartera", "irr", "vpn", "valorCapitalizado", "cagr", "fechaMs", "aniosEntre",
];

function limpiarModulo(src) {
  return src
    .replace(/^\s*import\s+[^;]*?from\s*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\*\s+from\s*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+[^;]*;\s*$/gm, "")
    .replace(/^(\s*)export\s+(async\s+)?function\s/gm, "$1$2function ")
    .replace(/^(\s*)export\s+(const|let|var|class)\s/gm, "$1$2 ")
    .trimEnd();
}

const partes = ORDEN.map(f => {
  const src = readFileSync(join(dir, f), "utf8");
  return `/* ─── ${f} ─────────────────────────────────────────────── */\n` + limpiarModulo(src);
});

const salida =
`/* =========================================================================
   QuantEngine ${JSON.parse('"2.0.0"')} — bundle de un solo ambito
   GENERADO por engine/quant/bundle.mjs. No editar a mano: editar los modulos
   en engine/quant/ y volver a ejecutar el empaquetador.
   Fuente modular y pruebas: engine/quant/*.js  ·  node engine/quant/quant.test.js
   ========================================================================= */
const QE = (function () {
"use strict";

${partes.join("\n\n")}

return { ${PUBLICOS.join(", ")} };
})();
`;

const destino = join(dir, "..", "QuantEngine.bundle.js");

/* `--check` no escribe: compara. Existe porque la cadena modulos -> bundle ->
   inline en index.html era MANUAL y nadie la comprobaba. Un cambio en un modulo
   que nadie empaquetara dejaba a la app corriendo una matematica distinta de la
   que las 329 pruebas verifican, en silencio y sobre el dinero: dimensionado en
   la rejilla de ticks, IRR, drawdown. Con esto, la suite lo caza. */
if (process.argv.includes("--check")) {
  let actual = null;
  try { actual = readFileSync(destino, "utf8"); } catch (e) { actual = null; }
  if (actual === salida) {
    console.log(`bundle al dia con los ${ORDEN.length} modulos (${salida.length} bytes)`);
    process.exit(0);
  }
  console.log("FALLO: engine/QuantEngine.bundle.js no coincide con los modulos de engine/quant/.");
  console.log("       Ejecuta `npm run bundle` y vuelve a incrustarlo en index.html.");
  console.log(`       committeado: ${actual === null ? "(no existe)" : actual.length + " bytes"} · generado: ${salida.length} bytes`);
  process.exit(1);
}

writeFileSync(destino, salida);
console.log(`bundle escrito: ${salida.length} bytes, ${salida.split("\n").length} lineas`);
