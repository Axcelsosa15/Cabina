/* =========================================================================
   QuantEngine 2.0.0 — bundle de un solo ambito
   GENERADO por engine/quant/bundle.mjs. No editar a mano: editar los modulos
   en engine/quant/ y volver a ejecutar el empaquetador.
   Fuente modular y pruebas: engine/quant/*.js  ·  node engine/quant/quant.test.js
   ========================================================================= */
const QE = (function () {
"use strict";

/* ─── kernel.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · kernel
   -------------------------------------------------------------------------
   Tipo Result, guardas, dinero en enteros y PRNG determinista.
   Sin dependencias. Sin Date.now(). Sin Math.random().
   Todo aquí es puro: misma entrada -> misma salida, siempre.
   ========================================================================= */

const QE_VERSION = "2.0.0";

/* ---------------------------------------------------------------- Result --
   Una sola forma de retorno en todo el motor. Nada de mezclar null, NaN,
   {ok,error} y excepciones segun el modulo. Si algo no se puede calcular,
   se dice por que; nunca se devuelve un numero inventado. */

function Ok(value, warnings) {
  return { ok: true, value, warnings: warnings && warnings.length ? warnings.slice() : [], error: null };
}
function Err(code, message, detail) {
  return { ok: false, value: null, warnings: [], error: { code, message, detail: detail === undefined ? null : detail } };
}
function isOk(r) { return !!r && r.ok === true; }
function addWarn(r, code, message, detail) {
  if (r && r.ok) r.warnings.push({ code, message, detail: detail === undefined ? null : detail });
  return r;
}
function unwrapOr(r, fallback) { return isOk(r) ? r.value : fallback; }
/* Propaga el primer Err de una lista; si todos son Ok devuelve sus valores. */
function allOk(results) {
  const out = [], warns = [];
  for (const r of results) {
    if (!isOk(r)) return r;
    out.push(r.value);
    for (const w of r.warnings) warns.push(w);
  }
  return Ok(out, warns);
}

/* ---------------------------------------------------------------- guardas -- */

function isFiniteNum(v) {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "boolean") return false;
  if (typeof v === "string" && v.trim() === "") return false;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n);
}
function toNum(v) { return isFiniteNum(v) ? Number(v) : null; }
function toInt(v) { const n = toNum(v); return n === null ? null : Math.trunc(n); }
function toPosInt(v) { const n = toInt(v); return n !== null && n > 0 ? n : null; }
function clamp(v, lo, hi) {
  const n = toNum(v); if (n === null) return null;
  const a = toNum(lo), b = toNum(hi);
  let x = n; if (a !== null && x < a) x = a; if (b !== null && x > b) x = b;
  return x === 0 ? 0 : x;
}
function sym(v) { return String(v === null || v === undefined ? "" : v).trim().toUpperCase(); }

/* ------------------------------------------------------------ redondeo -----
   Math.round redondea -0.5 hacia 0 y +0.5 hacia arriba: asimetrico.
   Aqui siempre es "half away from zero" sobre el valor absoluto, con una
   correccion del error binario (1.005*100 = 100.49999999999999). */

function roundHalfAway(x) {
  const n = toNum(x); if (n === null) return null;
  const a = Math.abs(n);
  const eps = a * Number.EPSILON * 4;
  const r = Math.round(a + eps);
  const out = n < 0 ? -r : r;
  return out === 0 ? 0 : out;
}
function roundTo(x, decimals) {
  const n = toNum(x); if (n === null) return null;
  const d = toInt(decimals); const p = Math.pow(10, d === null ? 2 : d);
  const out = roundHalfAway(n * p) / p;
  return out === 0 ? 0 : out;
}

/* -------------------------------------------------------------- dinero -----
   El dinero vive en centavos enteros dentro del motor. Los dolares float solo
   existen en la frontera de entrada y de salida. Esto elimina de raiz la
   deriva de 0.01 al sumar cientos de operaciones. */

const CENTS = 100;
function toCents(dollars) {
  const n = toNum(dollars); if (n === null) return null;
  return roundHalfAway(n * CENTS);
}
function fromCents(cents) {
  const n = toInt(cents); if (n === null) return null;
  const out = n / CENTS;
  return out === 0 ? 0 : out;
}
function sumCents(list) {
  let s = 0;
  for (const c of list) { const n = toInt(c); if (n === null) return null; s += n; }
  return s;
}

/* ----------------------------------------------------------------- PRNG ----
   mulberry32: 32 bits de estado, rapido, buena distribucion para Monte Carlo
   de este tamano. Sembrado = reproducible. Dos corridas con la misma semilla
   dan exactamente el mismo resultado, que es lo que hace auditable una
   simulacion. */

function rng(seed) {
  let a = (toInt(seed) === null ? 0x9E3779B9 : toInt(seed)) >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Entero en [0, n) a partir de un generador uniforme. */
function randInt(next, n) { return Math.floor(next() * n) % n; }

/* Normal estandar por Box-Muller. Solo para ruido parametrico; el Monte Carlo
   principal remuestrea la distribucion empirica, que no asume normalidad. */
function randNormal(next) {
  let u = 0, v = 0;
  while (u === 0) u = next();
  while (v === 0) v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* --------------------------------------------------------- normal inversa --
   Acklam: error relativo < 1.15e-9. Se usa para intervalos de confianza
   con cualquier nivel, no solo 95%. */
const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
function normalQuantile(p) {
  const x = toNum(p); if (x === null || x <= 0 || x >= 1) return null;
  const pl = 0.02425;
  let q, r;
  if (x < pl) {
    q = Math.sqrt(-2 * Math.log(x));
    return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
           ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  if (x > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - x));
    return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
            ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  q = x - 0.5; r = q * q;
  return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
         (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}
function zFor(confidence) {
  const c = toNum(confidence); if (c === null || c <= 0 || c >= 1) return 1.959963984540054;
  return Math.abs(normalQuantile((1 - c) / 2));
}

/* ─── contracts.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · contratos
   -------------------------------------------------------------------------
   Un futuro no se opera en "puntos": se opera en ticks. El precio vive en una
   rejilla discreta y el P&L es SIEMPRE un multiplo entero del valor del tick.
   Por eso aqui el dato primario es (tickSize, tickValue) y el multiplicador
   es derivado, no al reves. El invariante multiplier = tickValue / tickSize
   se verifica al cargar el modulo: un spec mal escrito revienta de inmediato
   en vez de producir P&L plausible pero falso durante meses.
   ========================================================================= */

function spec(symbol, nombre, tickSize, tickValueUSD, commissionRT, clase) {
  const multiplier = tickValueUSD / tickSize;
  return Object.freeze({
    symbol, nombre, clase,
    tickSize,
    tickValue: tickValueUSD,
    multiplier: roundTo(multiplier, 8),
    commissionPerContract: commissionRT,
    currency: "USD",
    /* Cuantos decimales tiene sentido mostrar en un precio de este contrato. */
    priceDecimals: Math.max(0, String(tickSize).includes(".") ? String(tickSize).split(".")[1].length : 0),
  });
}

const CONTRACTS = Object.freeze({
  /*          sym    nombre                        tick     $tick   comis  clase   */
  MNQ: spec("MNQ", "Micro E-mini Nasdaq-100",     0.25,     0.50,   1.5,  "indice"),
  NQ:  spec("NQ",  "E-mini Nasdaq-100",           0.25,     5.00,   4.0,  "indice"),
  MES: spec("MES", "Micro E-mini S&P 500",        0.25,     1.25,   1.5,  "indice"),
  ES:  spec("ES",  "E-mini S&P 500",              0.25,    12.50,   4.0,  "indice"),
  MYM: spec("MYM", "Micro E-mini Dow",            1,        0.50,   1.5,  "indice"),
  YM:  spec("YM",  "E-mini Dow",                  1,        5.00,   4.0,  "indice"),
  M2K: spec("M2K", "Micro E-mini Russell 2000",   0.1,      0.50,   1.5,  "indice"),
  RTY: spec("RTY", "E-mini Russell 2000",         0.1,      5.00,   4.0,  "indice"),
  MGC: spec("MGC", "Micro Oro (10 oz)",           0.1,      1.00,   1.5,  "metal"),
  GC:  spec("GC",  "Oro (100 oz)",                0.1,     10.00,   4.0,  "metal"),
  SIL: spec("SIL", "Micro Plata (1.000 oz)",      0.005,    5.00,   1.5,  "metal"),
  SI:  spec("SI",  "Plata (5.000 oz)",            0.005,   25.00,   4.0,  "metal"),
  MCL: spec("MCL", "Micro Crudo WTI (100 bbl)",   0.01,     1.00,   1.5,  "energia"),
  CL:  spec("CL",  "Crudo WTI (1.000 bbl)",       0.01,    10.00,   4.0,  "energia"),
  M6E: spec("M6E", "Micro EUR/USD",               0.0001,   1.25,   1.5,  "divisa"),
  "6E":spec("6E",  "EUR/USD",                     0.00005,  6.25,   4.0,  "divisa"),
  MBT: spec("MBT", "Micro Bitcoin (0,1 BTC)",     5,        0.50,   2.5,  "cripto"),
  BTC: spec("BTC", "CME Bitcoin (5 BTC)",         5,       25.00,  10.0,  "cripto"),
});

/* El invariante se comprueba al cargar, no en cada llamada. */
(function assertInvariants() {
  for (const k of Object.keys(CONTRACTS)) {
    const c = CONTRACTS[k];
    const d = Math.abs(c.multiplier * c.tickSize - c.tickValue);
    if (d > 1e-9) throw new Error(`QuantEngine: spec incoherente en ${k}: multiplier*tickSize=${c.multiplier * c.tickSize} != tickValue=${c.tickValue}`);
    if (!(c.tickSize > 0) || !(c.tickValue > 0)) throw new Error(`QuantEngine: tick invalido en ${k}`);
  }
})();

/* Alias de contratos por mes/anio: MNQZ5, ESH6, NQ M25... se reducen a la raiz. */
const MONTH_CODES = "FGHJKMNQUVXZ";
function rootOf(rawSymbol) {
  let s = sym(rawSymbol);
  if (!s) return "";
  if (CONTRACTS[s]) return s;
  s = s.replace(/^\//, "").replace(/[\s_-]/g, "");
  if (CONTRACTS[s]) return s;
  // sufijo mes+anio: 1 letra de mes + 1 o 2 digitos
  const m = s.match(/^([A-Z0-9]{1,4})([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (m && MONTH_CODES.includes(m[2]) && CONTRACTS[m[1]]) return m[1];
  return s;
}

/* -------------------------------------------------------------------------
   Resolver un contrato NUNCA adivina. Si el simbolo no esta y no hay override
   explicito, devuelve Err. Un multiplicador supuesto produce un P&L falso que
   luego alimenta balance, drawdown y consistencia: el dano se propaga a todo.
   ------------------------------------------------------------------------- */
function resolveContract(rawSymbol, overrides) {
  const raw = sym(rawSymbol);
  if (!raw) return Err("SIMBOLO_VACIO", "Falta el simbolo del contrato.");
  const root = rootOf(raw);

  const ov = overrides && typeof overrides === "object" ? (overrides[root] || overrides[raw]) : null;
  const base = CONTRACTS[root] || null;

  if (!base && !ov) {
    return Err("CONTRATO_DESCONOCIDO",
      `Sin especificacion para «${raw}». El motor no adivina el valor del tick.`,
      { symbol: raw, root });
  }

  const tickSize = toNum(ov && ov.tickSize) ?? (base ? base.tickSize : null);
  let tickValue  = toNum(ov && ov.tickValue) ?? (base ? base.tickValue : null);
  const multOv   = toNum(ov && ov.multiplier);

  /* Un override puede venir expresado como multiplicador (mas familiar).
     Se traduce a tickValue para que el resto del motor hable un solo idioma. */
  if (tickValue === null && multOv !== null && tickSize !== null) tickValue = multOv * tickSize;
  if (tickValue !== null && multOv !== null && tickSize !== null) {
    const implied = multOv * tickSize;
    if (Math.abs(implied - tickValue) > 1e-9) tickValue = implied;
  }

  if (tickSize === null || tickValue === null || !(tickSize > 0) || !(tickValue > 0)) {
    return Err("CONTRATO_INCOMPLETO",
      `La especificacion de «${raw}» no define un tick valido.`, { symbol: raw, root });
  }

  const commission = toNum(ov && ov.commissionPerContract);
  return Ok(Object.freeze({
    symbol: root,
    entrada: raw,
    nombre: (ov && ov.nombre) || (base ? base.nombre : root),
    clase: (base ? base.clase : "otro"),
    tickSize,
    tickValue,
    multiplier: roundTo(tickValue / tickSize, 8),
    commissionPerContract: commission !== null ? commission : (base ? base.commissionPerContract : 0),
    currency: "USD",
    priceDecimals: base ? base.priceDecimals : (String(tickSize).includes(".") ? String(tickSize).split(".")[1].length : 0),
    sintetico: !base,
  }));
}

function listContracts() {
  return Object.keys(CONTRACTS).map(k => CONTRACTS[k]);
}

/* ─── trade.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · valuacion de operacion
   -------------------------------------------------------------------------
   P&L exacto en ticks enteros. Nunca (salida-entrada)*multiplicador en float:
   ese producto puede dar cifras que el contrato no puede producir. Aqui el
   movimiento se mide en ticks, el tick vale un entero de centavos, y el P&L
   es el producto de dos enteros. Cero deriva.
   Ademas detecta precios fuera de rejilla (tipeos) en vez de tragarlos.
   ========================================================================= */


const TOL = 1e-6;

/* Cuantos ticks representa un precio, y si cae en la rejilla del contrato. */
function gridTicks(price, tickSize) {
  const t = price / tickSize;
  const r = Math.round(t);
  return { ticks: r, onGrid: Math.abs(t - r) <= Math.max(TOL, Math.abs(t) * TOL) };
}

function dirOf(direction) {
  const d = String(direction === null || direction === undefined ? "" : direction).trim().toLowerCase();
  if (["short", "sell", "venta", "corto", "s", "-1"].includes(d)) return -1;
  if (["long", "buy", "compra", "largo", "l", "1", ""].includes(d)) return 1;
  return 1;
}

/* -------------------------------------------------------------------------
   valuarOperacion(op, opciones) -> Result<Valuacion>

   op: { simbolo, direccion, entrada, salida, stop, objetivo, contratos,
         comisionExtra }
   opciones: { incluirComisiones=true, overrides=null, permitirFueraDeRejilla=true }
   ------------------------------------------------------------------------- */
function valuarOperacion(op, opciones) {
  const o = op || {};
  const cfg = Object.assign({ incluirComisiones: true, overrides: null, permitirFueraDeRejilla: true }, opciones || {});

  const rc = resolveContract(o.simbolo, cfg.overrides);
  if (!isOk(rc)) return rc;
  const c = rc.value;

  const qty = toPosInt(o.contratos) ?? 1;
  const dir = dirOf(o.direccion);
  const entrada = toNum(o.entrada);
  const salida = toNum(o.salida);
  const stop = toNum(o.stop);
  const objetivo = toNum(o.objetivo);

  if (entrada === null) return Err("SIN_ENTRADA", "Falta el precio de entrada.", { simbolo: c.symbol });
  if (entrada <= 0) return Err("ENTRADA_INVALIDA", "El precio de entrada debe ser mayor que cero.", { entrada });

  const res = Ok(null);
  const warn = (code, msg, det) => addWarn(res, code, msg, det);

  /* --- rejilla --- */
  const gE = gridTicks(entrada, c.tickSize);
  if (!gE.onGrid) warn("PRECIO_FUERA_DE_REJILLA", `La entrada ${entrada} no cae en la rejilla de ${c.symbol} (tick ${c.tickSize}).`, { campo: "entrada", valor: entrada, ajustado: gE.ticks * c.tickSize });
  let gS = null;
  if (salida !== null) {
    gS = gridTicks(salida, c.tickSize);
    if (!gS.onGrid) warn("PRECIO_FUERA_DE_REJILLA", `La salida ${salida} no cae en la rejilla de ${c.symbol} (tick ${c.tickSize}).`, { campo: "salida", valor: salida, ajustado: gS.ticks * c.tickSize });
  }
  let gStop = null;
  if (stop !== null) {
    gStop = gridTicks(stop, c.tickSize);
    if (!gStop.onGrid) warn("PRECIO_FUERA_DE_REJILLA", `El stop ${stop} no cae en la rejilla de ${c.symbol} (tick ${c.tickSize}).`, { campo: "stop", valor: stop, ajustado: gStop.ticks * c.tickSize });
  }
  if (!cfg.permitirFueraDeRejilla && res.warnings.length) {
    return Err("FUERA_DE_REJILLA", "Hay precios fuera de la rejilla del contrato.", res.warnings);
  }

  /* --- coherencia del stop --- */
  if (stop !== null) {
    if (dir > 0 && stop >= entrada) warn("STOP_INCOHERENTE", "En largo el stop deberia estar por debajo de la entrada.", { entrada, stop });
    if (dir < 0 && stop <= entrada) warn("STOP_INCOHERENTE", "En corto el stop deberia estar por encima de la entrada.", { entrada, stop });
  }
  if (objetivo !== null) {
    if (dir > 0 && objetivo <= entrada) warn("OBJETIVO_INCOHERENTE", "En largo el objetivo deberia estar por encima de la entrada.", { entrada, objetivo });
    if (dir < 0 && objetivo >= entrada) warn("OBJETIVO_INCOHERENTE", "En corto el objetivo deberia estar por debajo de la entrada.", { entrada, objetivo });
  }

  /* --- aritmetica entera en ticks --- */
  const tickCents = toCents(c.tickValue);
  if (tickCents === null || tickCents === 0) return Err("TICK_SIN_VALOR", `El tick de ${c.symbol} no tiene valor monetario representable.`);
  if (Math.abs(c.tickValue * 100 - tickCents) > 1e-6) warn("TICK_REDONDEADO", `El valor del tick de ${c.symbol} se redondeo al centavo.`, { tickValue: c.tickValue });

  const abierta = salida === null;
  const ticksResultado = abierta ? null : (gS.ticks - gE.ticks) * dir;
  const ticksRiesgo = stop === null ? null : Math.abs(gE.ticks - gStop.ticks);
  const ticksObjetivo = objetivo === null ? null : Math.abs(gridTicks(objetivo, c.tickSize).ticks - gE.ticks);

  if (ticksRiesgo === 0) warn("RIESGO_CERO", "Entrada y stop son el mismo precio: el riesgo es cero y R no esta definido.", { entrada, stop });

  const brutoCents = abierta ? null : ticksResultado * tickCents * qty;
  const comisionUnit = cfg.incluirComisiones ? (toNum(c.commissionPerContract) ?? 0) : 0;
  const extra = toNum(o.comisionExtra) ?? 0;
  const comisionCents = abierta ? 0 : ((toCents(comisionUnit) ?? 0) * qty + (toCents(extra) ?? 0));
  const netoCents = abierta ? null : brutoCents - comisionCents;
  const riesgoCents = ticksRiesgo === null || ticksRiesgo === 0 ? null : ticksRiesgo * tickCents * qty;

  /* --- R: cociente de ticks, el multiplicador se cancela ---
     Por eso R existe incluso para un contrato sintetico mal definido, siempre
     que entrada, stop y salida esten en la misma escala de precio. */
  const rBruto = (ticksResultado === null || !ticksRiesgo) ? null : roundTo(ticksResultado / ticksRiesgo, 4);
  const rPlan  = (ticksObjetivo === null || !ticksRiesgo) ? null : roundTo(ticksObjetivo / ticksRiesgo, 4);
  const rNeto  = (netoCents === null || riesgoCents === null || riesgoCents === 0) ? null : roundTo(netoCents / riesgoCents, 4);

  /* --- eficiencia: cuanto del movimiento planeado se capturo --- */
  const eficiencia = (ticksResultado === null || !ticksObjetivo) ? null : roundTo(ticksResultado / ticksObjetivo, 4);

  let resultado = "abierta";
  if (!abierta) resultado = netoCents > 0 ? "ganancia" : netoCents < 0 ? "perdida" : "breakeven";

  res.value = Object.freeze({
    contrato: c,
    direccion: dir > 0 ? "long" : "short",
    contratos: qty,
    abierta,
    resultado,

    ticks: ticksResultado,
    ticksRiesgo,
    ticksObjetivo,
    puntos: ticksResultado === null ? null : roundTo(ticksResultado * c.tickSize, c.priceDecimals + 2),

    pnlBruto: fromCents(brutoCents),
    comisiones: fromCents(comisionCents),
    pnlNeto: fromCents(netoCents),
    riesgoUSD: fromCents(riesgoCents),

    pnlBrutoCents: brutoCents,
    comisionesCents: comisionCents,
    pnlNetoCents: netoCents,
    riesgoCents,

    rBruto, rNeto, rPlaneado: rPlan, eficiencia,
  });
  return res;
}

/* -------------------------------------------------------------------------
   dimensionar(): cuantos contratos caben en el riesgo permitido.
   Devuelve SIEMPRE un entero (no existen 2.7 contratos) y dice cuanto se
   pierde por el redondeo hacia abajo, que es la parte que la gente ignora.
   ------------------------------------------------------------------------- */
function dimensionar(params, opciones) {
  const p = params || {};
  const cfg = Object.assign({ overrides: null, maxContratos: null }, opciones || {});
  const rc = resolveContract(p.simbolo, cfg.overrides);
  if (!isOk(rc)) return rc;
  const c = rc.value;

  const balance = toNum(p.balance);
  const entrada = toNum(p.entrada);
  const stop = toNum(p.stop);
  if (balance === null || balance <= 0) return Err("BALANCE_INVALIDO", "El balance debe ser mayor que cero.", { balance });
  if (entrada === null || stop === null) return Err("FALTA_STOP", "Se necesita entrada y stop para dimensionar.");

  const res = Ok(null);
  const ticksRiesgo = Math.abs(Math.round(entrada / c.tickSize) - Math.round(stop / c.tickSize));
  if (ticksRiesgo === 0) return Err("RIESGO_CERO", "Entrada y stop coinciden: no hay riesgo que dimensionar.");

  /* 1 se lee como 1%, 0.01 tambien. Nadie arriesga el 100% del balance. */
  let pct = toNum(p.riesgoPct);
  if (pct === null) pct = 1;
  if (pct >= 1) pct = pct / 100;
  if (pct <= 0 || pct > 0.5) return Err("RIESGO_FUERA_DE_RANGO", "El riesgo por operacion debe estar entre 0 y 50%.", { pct });
  if (pct > 0.05) addWarn(res, "RIESGO_ALTO", `Arriesgar ${roundTo(pct * 100, 2)}% por operacion es agresivo: 10 perdidas seguidas se llevan ${roundTo((1 - Math.pow(1 - pct, 10)) * 100, 1)}% de la cuenta.`, { pct });

  const riesgoPermitidoCents = toCents(balance * pct);
  const riesgoPorContratoCents = ticksRiesgo * toCents(c.tickValue);
  const bruto = riesgoPermitidoCents / riesgoPorContratoCents;
  let contratos = Math.floor(bruto);
  if (cfg.maxContratos) contratos = Math.min(contratos, toPosInt(cfg.maxContratos) ?? contratos);

  if (contratos < 1) {
    addWarn(res, "SIN_TAMANO", `Con ${roundTo(pct * 100, 2)}% de ${roundTo(balance, 2)} no alcanza ni para 1 contrato de ${c.symbol} con ese stop (${ticksRiesgo} ticks = ${roundTo(ticksRiesgo * c.tickValue, 2)} por contrato).`, { requerido: roundTo(ticksRiesgo * c.tickValue, 2) });
  }

  const riesgoRealCents = contratos * riesgoPorContratoCents;
  res.value = Object.freeze({
    contrato: c,
    contratos,
    ticksRiesgo,
    riesgoPermitido: fromCents(riesgoPermitidoCents),
    riesgoReal: fromCents(riesgoRealCents),
    riesgoPorContrato: fromCents(riesgoPorContratoCents),
    /* lo que se deja en la mesa por no poder fraccionar un contrato */
    desaprovechado: fromCents(riesgoPermitidoCents - riesgoRealCents),
    riesgoPctReal: roundTo(riesgoRealCents / toCents(balance), 6),
    fraccional: roundTo(bruto, 4),
  });
  return res;
}

/* ─── stats.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · estadistica e inferencia
   -------------------------------------------------------------------------
   Regla de la casa: ningun estadistico se devuelve desnudo. Cada numero viaja
   con su n, su error estandar y un veredicto de fiabilidad. Un profit factor
   de 2.4 sobre 6 operaciones y uno sobre 600 se imprimen igual y no significan
   lo mismo; el motor esta obligado a decir cual es cual.
   ========================================================================= */

function limpiar(xs) {
  const out = [];
  for (const x of xs || []) { const n = toNum(x); if (n !== null) out.push(n); }
  return out;
}

/* Welford: una pasada, numericamente estable incluso con miles de valores
   de magnitudes muy distintas. La formula ingenua (sum(x^2) - n*media^2)
   pierde precision justo donde importa. */
function momentos(xs) {
  const v = limpiar(xs);
  const n = v.length;
  if (!n) return { n: 0, media: null, varianza: null, desv: null, suma: 0, min: null, max: null };
  let media = 0, m2 = 0, suma = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = v[i]; suma += x;
    if (x < min) min = x; if (x > max) max = x;
    const d = x - media; media += d / (i + 1); m2 += d * (x - media);
  }
  const varianza = n > 1 ? m2 / (n - 1) : 0;
  return { n, media, varianza, desv: Math.sqrt(varianza), suma, min, max };
}

/* Cuantil tipo 7 (el de R y numpy por defecto), interpolacion lineal. */
function cuantil(xs, p) {
  const v = limpiar(xs).sort((a, b) => a - b);
  const n = v.length; if (!n) return null;
  const q = toNum(p); if (q === null || q < 0 || q > 1) return null;
  if (n === 1) return v[0];
  const h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return v[lo] + (h - lo) * (v[hi] - v[lo]);
}
const mediana = xs => cuantil(xs, 0.5);

function forma(xs) {
  const v = limpiar(xs), n = v.length;
  if (n < 3) return { asimetria: null, curtosis: null };
  const m = v.reduce((s, x) => s + x, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of v) { const d = x - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
  m2 /= n; m3 /= n; m4 /= n;
  if (m2 === 0) return { asimetria: 0, curtosis: 0 };
  const g1 = m3 / Math.pow(m2, 1.5);
  const G1 = n > 2 ? g1 * Math.sqrt(n * (n - 1)) / (n - 2) : g1;
  return { asimetria: roundTo(G1, 4), curtosis: roundTo(m4 / (m2 * m2) - 3, 4) };
}

/* ------------------------------------------------------- proporciones -----
   Wilson, no la aproximacion normal. Con n pequena o tasas cerca de 0 o 1
   la normal produce intervalos que se salen de [0,1]: literalmente imposibles. */
function ciProporcion(exitos, total, confianza) {
  const k = toNum(exitos), n = toNum(total);
  if (k === null || n === null || n <= 0 || k < 0 || k > n) return null;
  const z = zFor(confianza === undefined ? 0.95 : confianza);
  const p = k / n, z2 = z * z;
  const den = 1 + z2 / n;
  const centro = (p + z2 / (2 * n)) / den;
  const semi = (z / den) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { p: roundTo(p, 6), bajo: roundTo(Math.max(0, centro - semi), 6), alto: roundTo(Math.min(1, centro + semi), 6), n };
}

/* --------------------------------------------------------- media + CI ----- */
function ciMedia(xs, confianza) {
  const m = momentos(xs);
  if (m.n < 2) return { n: m.n, media: m.media, se: null, bajo: null, alto: null };
  const z = zFor(confianza === undefined ? 0.95 : confianza);
  const se = m.desv / Math.sqrt(m.n);
  return { n: m.n, media: roundTo(m.media, 6), se: roundTo(se, 6),
           bajo: roundTo(m.media - z * se, 6), alto: roundTo(m.media + z * se, 6) };
}

/* Bootstrap por percentiles. La distribucion de R multiples es asimetrica y
   de colas pesadas: el intervalo normal miente sistematicamente. Remuestrear
   no asume forma alguna. Sembrado => reproducible y auditable. */
function bootstrapCI(xs, estadistico, opciones) {
  const v = limpiar(xs), n = v.length;
  const cfg = Object.assign({ repeticiones: 2000, confianza: 0.95, semilla: 20260917 }, opciones || {});
  if (n < 5) return null;
  const f = typeof estadistico === "function" ? estadistico : null;
  const next = rng(cfg.semilla);
  const reps = toPosInt(cfg.repeticiones) ?? 2000;
  const muestras = new Array(reps);
  /* El coste del bootstrap es reps x n. La version anterior llamaba a
     momentos(buf) en cada repeticion, y momentos hace limpiar(), que ASIGNA UN
     ARRAY NUEVO: 2.000 arrays de n elementos por llamada. Con n=1500 eso son
     3 millones de elementos copiados para calcular 2.000 medias.
     Cuando el estadistico es la media (el caso por defecto) se acumula en linea,
     sin buffer y sin asignar nada. Misma secuencia del PRNG, mismo resultado
     bit a bit: esto no cambia ni un decimal, solo deja de tirar memoria. */
  const buf = f ? new Array(n) : null;
  for (let b = 0; b < reps; b++) {
    if (f) {
      for (let i = 0; i < n; i++) buf[i] = v[randInt(next, n)];
      muestras[b] = f(buf);
    } else {
      let s = 0;
      for (let i = 0; i < n; i++) s += v[randInt(next, n)];
      muestras[b] = s / n;
    }
  }
  const alfa = (1 - cfg.confianza) / 2;
  return {
    n, repeticiones: reps,
    punto: roundTo(f ? f(v) : momentos(v).media, 6),
    bajo: roundTo(cuantil(muestras, alfa), 6),
    alto: roundTo(cuantil(muestras, 1 - alfa), 6),
    metodo: "bootstrap percentil",
  };
}

/* ------------------------------------------------- tamano de muestra ------
   La pregunta que casi nadie se hace: cuantas operaciones hacen falta para
   que esta ventaja sea distinguible de la suerte. Se responde despejando n
   de |media| >= (z_alfa + z_beta) * desv / sqrt(n). */
function muestraMinima(xs, opciones) {
  const cfg = Object.assign({ confianza: 0.95, potencia: 0.80 }, opciones || {});
  const m = momentos(xs);
  if (m.n < 2 || m.desv === 0) return null;
  if (m.media === 0) return { n: m.n, requerido: Infinity, razon: "la media medida es exactamente cero" };
  const za = zFor(cfg.confianza);
  const zb = Math.abs(zFor(2 * cfg.potencia - 1));
  const requerido = Math.ceil(Math.pow((za + zb) * m.desv / Math.abs(m.media), 2));
  return {
    n: m.n, requerido,
    suficiente: m.n >= requerido,
    faltan: Math.max(0, requerido - m.n),
    ruidoRelativo: roundTo(m.desv / Math.abs(m.media), 3),
  };
}

/* Significancia de que la media sea distinta de cero (aprox. normal; con
   n>=30 es adecuada y por debajo de 30 el motor ya marca no fiable). */
function significanciaMedia(xs) {
  const m = momentos(xs);
  if (m.n < 2 || m.desv === 0) return null;
  const t = m.media / (m.desv / Math.sqrt(m.n));
  const p = 2 * (1 - normalCDF(Math.abs(t)));
  return { t: roundTo(t, 4), p: roundTo(p, 6), significativo: p < 0.05, n: m.n };
}

function normalCDF(x) {
  /* Abramowitz-Stegun 7.1.26 sobre erf; error < 1.5e-7. */
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

/* --------------------------------------------------------- fiabilidad -----
   Un solo lugar decide si un numero se puede usar para tomar decisiones.
   Los umbrales son convencion, pero al menos son explicitos y unicos. */
const UMBRALES = Object.freeze({ tendencia: 20, fiable: 30, solido: 100, diarioFiable: 60 });

function veredicto(n, umbral) {
  const k = toPosInt(n) ?? 0;
  const u = toPosInt(umbral) ?? UMBRALES.fiable;
  if (k === 0) return { nivel: "sin_datos", fiable: false, razon: "no hay operaciones cerradas" };
  if (k < UMBRALES.tendencia) return { nivel: "anecdota", fiable: false, razon: `n=${k}: por debajo de ${UMBRALES.tendencia} esto es ruido, no una medicion` };
  if (k < u) return { nivel: "indicio", fiable: false, razon: `n=${k}: hace falta n>=${u} para tratarlo como medicion` };
  if (k < UMBRALES.solido) return { nivel: "medicion", fiable: true, razon: `n=${k}: utilizable, todavia con error amplio` };
  return { nivel: "solido", fiable: true, razon: `n=${k}: muestra suficiente` };
}

/* ─── edge.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · medicion de ventaja
   -------------------------------------------------------------------------
   Esperanza, profit factor, Kelly, SQN, rachas y distribucion de R.
   Dos decisiones deliberadas:
   1) Profit factor sin perdidas NO es Infinito, es indefinido. Imprimir "∞"
      invita a creer en un sistema perfecto que solo tuvo pocas operaciones.
   2) Kelly completo sobre una ventaja estimada arruina cuentas. Se devuelve,
      y al lado se devuelve la fraccion que un adulto usaria.
   ========================================================================= */


/* Entrada: lista de operaciones cerradas normalizadas
   { pnl: numero (USD neto), r: numero|null, fecha: "YYYY-MM-DD" } */
function analizarEdge(operaciones, opciones) {
  const cfg = Object.assign({ confianza: 0.95, semilla: 20260917 }, opciones || {});
  const ops = (operaciones || []).filter(o => o && toNum(o.pnl) !== null);
  const n = ops.length;

  if (!n) return Ok({
    n: 0, veredicto: veredicto(0), pnlTotal: 0,
    ganadoras: 0, perdedoras: 0, planas: 0,
    tasaAcierto: null, profitFactor: null, esperanza: null, esperanzaR: null,
    kelly: null, sqn: null, rachas: null, distribucionR: null,
  });

  const pnls = ops.map(o => toNum(o.pnl));
  const rs = ops.map(o => toNum(o.r)).filter(x => x !== null);

  const gan = pnls.filter(x => x > 0);
  const per = pnls.filter(x => x < 0);
  const pla = pnls.filter(x => x === 0);
  const sumG = gan.reduce((s, x) => s + x, 0);
  const sumP = per.reduce((s, x) => s + x, 0);   // negativo
  const total = sumG + sumP;

  /* --- profit factor --- */
  let profitFactor = null, pfRazon = null;
  if (per.length === 0) { pfRazon = gan.length ? "sin operaciones perdedoras: el profit factor no esta definido" : "sin operaciones con resultado"; }
  else if (gan.length === 0) { profitFactor = 0; pfRazon = "sin operaciones ganadoras"; }
  else profitFactor = roundTo(sumG / Math.abs(sumP), 4);

  /* --- tasa de acierto (las planas no cuentan en el denominador) --- */
  const decisivas = gan.length + per.length;
  const wr = decisivas ? ciProporcion(gan.length, decisivas, cfg.confianza) : null;

  /* --- esperanza --- */
  const espUSD = ciMedia(pnls, cfg.confianza);
  const espR = rs.length >= 2 ? ciMedia(rs, cfg.confianza) : null;
  /* Sin pasar funcion: bootstrapCI usa su camino de media sin asignaciones.
     Ademas las repeticiones se escalan con n para que el trabajo total quede
     acotado: con n grande el intervalo ya es estrecho y 2.000 repeticiones solo
     compran decimales que nadie mira, a cambio de bloquear la interfaz. */
  const repsPara = k => k <= 400 ? 2000 : Math.max(500, Math.round(800000 / k));
  const bootR = rs.length >= 5 ? bootstrapCI(rs, null, { confianza: cfg.confianza, semilla: cfg.semilla, repeticiones: repsPara(rs.length) }) : null;
  const bootUSD = bootstrapCI(pnls, null, { confianza: cfg.confianza, semilla: cfg.semilla, repeticiones: repsPara(pnls.length) });

  const avgG = gan.length ? sumG / gan.length : null;
  const avgP = per.length ? Math.abs(sumP) / per.length : null;
  const payoff = avgG !== null && avgP ? roundTo(avgG / avgP, 4) : null;

  /* --- Kelly ---
     Riesgo f de la cuenta por operacion. Con ganancia media W y perdida media L
     expresadas en la misma unidad de riesgo:  f* = (p*W - q*L) / (W*L).
     Comprobacion: p=0.5, W=2, L=1  ->  f* = 0.25, que es el Kelly clasico 2:1. */
  let kelly = null, kellyRazon = null;
  const rG = rs.filter(x => x > 0), rP = rs.filter(x => x < 0).map(Math.abs);
  if (rG.length && rP.length) {
    const p = rG.length / (rG.length + rP.length), q = 1 - p;
    const W = rG.reduce((s, x) => s + x, 0) / rG.length;
    const L = rP.reduce((s, x) => s + x, 0) / rP.length;
    const f = (p * W - q * L) / (W * L);
    kelly = roundTo(f, 6);
    if (f <= 0) kellyRazon = "la ventaja medida es negativa o nula: la fraccion optima es no operar";
  } else kellyRazon = "hacen falta ganadoras y perdedoras con R para calcular Kelly";

  const vd = veredicto(n);
  const kellyRecomendado = kelly !== null && kelly > 0
    ? roundTo(kelly * (vd.nivel === "solido" ? 0.5 : 0.25), 6) : null;

  /* --- SQN --- */
  const mR = rs.length >= 2 ? momentos(rs) : null;
  const sqn = mR && mR.desv > 0 ? roundTo(Math.sqrt(Math.min(rs.length, 100)) * mR.media / mR.desv, 4) : null;

  /* --- rachas --- */
  let maxG = 0, maxP = 0, curG = 0, curP = 0, actual = 0;
  for (const x of pnls) {
    if (x > 0) { curG++; curP = 0; if (curG > maxG) maxG = curG; actual = curG; }
    else if (x < 0) { curP++; curG = 0; if (curP > maxP) maxP = curP; actual = -curP; }
    else { curG = 0; curP = 0; actual = 0; }
  }
  /* Racha perdedora esperada por azar en n intentos con tasa de acierto p:
     log(n) / -log(q). Sirve para no confundir mala suerte con sistema roto. */
  const q = wr ? 1 - wr.p : null;
  const rachaEsperada = q && q > 0 && q < 1 ? Math.round(Math.log(decisivas) / -Math.log(q)) : null;

  return Ok({
    n, veredicto: vd,
    pnlTotal: roundTo(total, 2),
    ganadoras: gan.length, perdedoras: per.length, planas: pla.length,

    tasaAcierto: wr ? { valor: roundTo(wr.p, 4), ic: [wr.bajo, wr.alto], n: decisivas } : null,

    profitFactor, profitFactorRazon: pfRazon,

    esperanza: { usd: roundTo(espUSD.media, 4), se: espUSD.se,
                 ic: [espUSD.bajo, espUSD.alto],
                 icBootstrap: bootUSD ? [bootUSD.bajo, bootUSD.alto] : null,
                 positiva: espUSD.bajo !== null ? espUSD.bajo > 0 : null },
    esperanzaR: espR ? { valor: roundTo(espR.media, 4), se: espR.se,
                         ic: [espR.bajo, espR.alto],
                         icBootstrap: bootR ? [bootR.bajo, bootR.alto] : null,
                         positiva: bootR ? bootR.bajo > 0 : espR.bajo > 0, n: rs.length } : null,

    gananciaMedia: avgG === null ? null : roundTo(avgG, 2),
    perdidaMedia: avgP === null ? null : roundTo(avgP, 2),
    payoff,

    kelly: { completo: kelly, recomendado: kellyRecomendado, razon: kellyRazon,
             nota: "Kelly completo asume que la ventaja medida es la real. Con esta muestra no lo es." },

    sqn, sqnEscala: sqn === null ? null : sqn < 1.6 ? "por debajo de operable" : sqn < 2 ? "promedio" : sqn < 3 ? "bueno" : sqn < 5 ? "excelente" : "revisar la muestra",

    rachas: { maxGanadoras: maxG, maxPerdedoras: maxP, actual,
              esperadaPorAzar: rachaEsperada,
              alarma: rachaEsperada !== null && maxP > rachaEsperada * 1.5 },

    distribucionR: rs.length >= 3 ? {
      n: rs.length,
      p05: roundTo(cuantil(rs, 0.05), 3), q1: roundTo(cuantil(rs, 0.25), 3),
      mediana: roundTo(mediana(rs), 3), q3: roundTo(cuantil(rs, 0.75), 3),
      p95: roundTo(cuantil(rs, 0.95), 3),
      peor: roundTo(Math.min(...rs), 3), mejor: roundTo(Math.max(...rs), 3),
      ...forma(rs),
      colaGorda: (() => { const f = forma(rs); return f.curtosis !== null && f.curtosis > 3; })(),
    } : null,

    muestra: rs.length >= 2 ? muestraMinima(rs) : muestraMinima(pnls),
    significancia: rs.length >= 2 ? significanciaMedia(rs) : significanciaMedia(pnls),

    /* La operacion mas grande sobre el total: si una sola operacion explica la
       mayor parte del resultado, no hay sistema, hubo un golpe de suerte. */
    concentracion: (() => {
      if (!gan.length || total <= 0) return null;
      const mayor = Math.max(...gan);
      return { mayorGanancia: roundTo(mayor, 2), pctDelTotal: roundTo(mayor / total, 4),
               dependeDeUna: mayor / total > 0.5 };
    })(),
  });
}

/* ─── curve.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · curva de capital y drawdown
   -------------------------------------------------------------------------
   Aqui vive lo que antes era aritmetica suelta pegada al render: el acumulado,
   el pico, el suelo trailing y el colchon. Convertirlo en una maquina de
   estados sobre la serie ordenada permite responder algo que antes no se podia
   preguntar: no solo "cuanto colchon tengo hoy" sino "cual fue el momento en
   que estuve mas cerca de quemar la cuenta, y que dia fue".

   Base del trailing:
     "cierre"  -> el pico solo se actualiza al cerrar el dia (mayoria de props)
     "intradia"-> el pico se actualiza operacion a operacion (props estrictas)
   Es la diferencia entre pasar y quemar una cuenta, y no es un detalle menor.
   ========================================================================= */


const DD_TIPOS = Object.freeze({ ESTATICO: "estatico", TRAILING: "trailing", TRAILING_BLOQUEADO: "trailing_lock" });

/* Suelo segun el tipo de drawdown. Es la unica definicion en todo el motor.
   trailing_lock: sigue al pico hasta que el pico alcanza el tamano inicial,
   y ahi se congela en el tamano inicial -> min(pico - dd, inicial). */
function sueloPara(tipo, saldoInicial, pico, maximo) {
  const s = toNum(saldoInicial), p = toNum(pico), d = toNum(maximo);
  if (s === null || p === null || d === null || d <= 0) return null;
  if (tipo === DD_TIPOS.ESTATICO) return s - d;
  if (tipo === DD_TIPOS.TRAILING) return p - d;
  return Math.min(p - d, s);
}

/* -------------------------------------------------------------------------
   construirCurva(operaciones, opciones)
   operaciones: [{ fecha:"YYYY-MM-DD", orden?:number, pnl:number }]
   opciones: { saldoInicial, ddTipo, ddMaximo, base:"cierre"|"intradia",
               movimientos:[{fecha,tipo:"deposito"|"retiro"|"costo",monto}] }
   ------------------------------------------------------------------------- */
function construirCurva(operaciones, opciones) {
  const cfg = Object.assign({
    saldoInicial: 0, ddTipo: DD_TIPOS.TRAILING_BLOQUEADO, ddMaximo: null,
    base: "cierre", movimientos: [],
  }, opciones || {});

  const ops = (operaciones || [])
    .filter(o => o && toNum(o.pnl) !== null && o.fecha)
    .map((o, i) => ({ fecha: String(o.fecha), orden: toNum(o.orden) ?? i, pnlCents: toCents(o.pnl) }))
    .sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden);

  const movPorDia = {};
  for (const m of cfg.movimientos || []) {
    const f = m && m.fecha ? String(m.fecha) : null; const v = toCents(m && m.monto);
    if (!f || v === null) continue;
    const signo = m.tipo === "deposito" ? 1 : -1;
    movPorDia[f] = (movPorDia[f] || 0) + signo * Math.abs(v);
  }

  const inicialCents = toCents(cfg.saldoInicial) ?? 0;
  const ddCents = cfg.ddMaximo === null ? null : toCents(cfg.ddMaximo);
  const intradia = cfg.base === "intradia";

  let equity = inicialCents;
  let pico = inicialCents;
  let picoFecha = null;
  let bloqueado = false, bloqueoFecha = null;

  const dias = [];
  let peorMomento = null;   // { fecha, colchon, equity, suelo }
  let quemadaEn = null;

  const fechas = [];
  const porDia = {};
  for (const o of ops) {
    if (!porDia[o.fecha]) { porDia[o.fecha] = []; fechas.push(o.fecha); }
    porDia[o.fecha].push(o);
  }
  for (const f of Object.keys(movPorDia)) if (!porDia[f]) { porDia[f] = []; fechas.push(f); }
  fechas.sort();

  const registrarRiesgo = (fecha, eq) => {
    if (ddCents === null) return;
    const suelo = toCents(sueloPara(cfg.ddTipo, fromCents(inicialCents), fromCents(pico), fromCents(ddCents)));
    if (suelo === null) return;
    const colchon = eq - suelo;
    if (!peorMomento || colchon < peorMomento.colchonCents) {
      peorMomento = { fecha, colchonCents: colchon, equityCents: eq, sueloCents: suelo };
    }
    if (colchon <= 0 && !quemadaEn) quemadaEn = { fecha, equity: fromCents(eq), suelo: fromCents(suelo) };
  };

  for (const fecha of fechas) {
    const apertura = equity;
    let pnlDia = 0;
    let picoIntradia = equity, valleIntradia = equity;

    for (const o of porDia[fecha]) {
      equity += o.pnlCents; pnlDia += o.pnlCents;
      if (equity > picoIntradia) picoIntradia = equity;
      if (equity < valleIntradia) valleIntradia = equity;
      if (intradia) {
        if (equity > pico) { pico = equity; picoFecha = fecha; }
        registrarRiesgo(fecha, equity);
      }
    }
    const mov = movPorDia[fecha] || 0;
    equity += mov;

    if (!intradia) {
      if (equity > pico) { pico = equity; picoFecha = fecha; }
      registrarRiesgo(fecha, equity);
    }
    if (!bloqueado && cfg.ddTipo === DD_TIPOS.TRAILING_BLOQUEADO && ddCents !== null && pico - ddCents >= inicialCents) {
      bloqueado = true; bloqueoFecha = fecha;
    }

    const suelo = ddCents === null ? null : toCents(sueloPara(cfg.ddTipo, fromCents(inicialCents), fromCents(pico), fromCents(ddCents)));
    dias.push({
      fecha,
      apertura: fromCents(apertura),
      pnl: fromCents(pnlDia),
      movimiento: fromCents(mov),
      cierre: fromCents(equity),
      pico: fromCents(pico),
      suelo: suelo === null ? null : fromCents(suelo),
      colchon: suelo === null ? null : fromCents(equity - suelo),
      caidaDesdePico: fromCents(pico - equity),
      picoIntradia: fromCents(picoIntradia),
      valleIntradia: fromCents(valleIntradia),
      operaciones: porDia[fecha].length,
      _cierreCents: equity, _picoCents: pico,
    });
  }

  const sueloActual = ddCents === null ? null : sueloPara(cfg.ddTipo, fromCents(inicialCents), fromCents(pico), fromCents(ddCents));

  return Ok({
    base: cfg.base,
    ddTipo: cfg.ddTipo,
    saldoInicial: fromCents(inicialCents),
    dias,
    nDias: dias.length,
    nOperaciones: ops.length,
    equity: fromCents(equity),
    pico: fromCents(pico),
    picoFecha,
    suelo: sueloActual,
    colchon: sueloActual === null ? null : roundTo(fromCents(equity) - sueloActual, 2),
    ddMaximo: ddCents === null ? null : fromCents(ddCents),
    ddUsado: (ddCents === null || sueloActual === null) ? null
             : roundTo(clamp(fromCents(ddCents) - (fromCents(equity) - sueloActual), 0, fromCents(ddCents)), 2),
    bloqueado, bloqueoFecha,
    quemadaEn,
    peorMomento: peorMomento ? {
      fecha: peorMomento.fecha,
      colchon: fromCents(peorMomento.colchonCents),
      equity: fromCents(peorMomento.equityCents),
      suelo: fromCents(peorMomento.sueloCents),
    } : null,
  });
}

/* -------------------------------------------------------------------------
   metricasCurva(): riesgo y calidad de la serie diaria.
   Sharpe y Sortino se anualizan con 252 dias habiles. Por debajo de 60 dias
   el motor los marca no fiables: con 8 dias un Sharpe de 3 no dice nada.
   ------------------------------------------------------------------------- */
function metricasCurva(curva, opciones) {
  /* tasaLibreAnual: tasa libre de riesgo en decimal por ANO (0.05 = 5%). Se
     reparte en dias habiles y se resta de cada rendimiento diario. Por defecto 0,
     que es lo que habia: sin ella, Sharpe y Sortino dan exactamente lo mismo. */
  const cfg = Object.assign({ diasAnio: 252, minDiasFiable: 60, tasaLibreAnual: 0 }, opciones || {});
  const c = curva && curva.dias ? curva : (curva && curva.value) || null;
  if (!c || !c.dias.length) return Ok({ n: 0, fiable: false, razon: "sin dias operados" });

  const dias = c.dias;
  const n = dias.length;

  /* Rendimientos diarios sobre el capital al abrir el dia. */
  const rets = [];
  for (const d of dias) {
    const ap = toNum(d.apertura);
    if (ap && ap > 0) rets.push(d.pnl / ap);
  }
  const mR = momentos(rets);
  const mP = momentos(dias.map(d => d.pnl));

  /* Max drawdown sobre la curva de cierres. */
  let pico = -Infinity, maxDD = 0, maxDDpct = 0, maxDDfecha = null, sumaDD2 = 0;
  let enDD = 0, maxEnDD = 0, recuperacion = null, inicioDD = null;
  for (const d of dias) {
    const v = d.cierre;
    if (v > pico) { pico = v; if (enDD > maxEnDD) maxEnDD = enDD; enDD = 0; inicioDD = null; }
    else { enDD++; if (inicioDD === null) inicioDD = d.fecha; }
    const dd = pico - v;
    const ddp = pico > 0 ? dd / pico : 0;
    sumaDD2 += ddp * ddp;
    if (dd > maxDD) { maxDD = dd; maxDDpct = ddp; maxDDfecha = d.fecha; }
  }
  if (enDD > maxEnDD) maxEnDD = enDD;

  /* Restar una constante no cambia la desviacion: el exceso solo mueve la media. */
  const rfDia = (toNum(cfg.tasaLibreAnual) ?? 0) / cfg.diasAnio;
  const exceso = mR.media === null ? null : mR.media - rfDia;
  const sharpeDiario = mR.n > 1 && mR.desv > 0 ? exceso / mR.desv : null;
  const sharpe = sharpeDiario === null ? null : sharpeDiario * Math.sqrt(cfg.diasAnio);
  const negativos = rets.filter(r => r < 0);
  const downside = negativos.length ? Math.sqrt(negativos.reduce((s, r) => s + r * r, 0) / rets.length) : 0;
  const sortino = downside > 0 ? exceso / downside * Math.sqrt(cfg.diasAnio) : null;
  const retAnual = mR.n ? mR.media * cfg.diasAnio : null;
  const calmar = retAnual !== null && maxDDpct > 0 ? retAnual / maxDDpct : null;

  const fiable = n >= cfg.minDiasFiable;
  return Ok({
    n,
    diasVerdes: dias.filter(d => d.pnl > 0).length,
    diasRojos: dias.filter(d => d.pnl < 0).length,
    diasPlanos: dias.filter(d => d.pnl === 0).length,
    pnlTotal: roundTo(mP.suma, 2),
    mejorDia: mP.max === null ? null : roundTo(mP.max, 2),
    peorDia: mP.min === null ? null : roundTo(mP.min, 2),
    mediaDiaria: mP.media === null ? null : roundTo(mP.media, 2),
    desvDiaria: mP.desv === null ? null : roundTo(mP.desv, 2),

    maxDrawdown: roundTo(maxDD, 2),
    maxDrawdownPct: roundTo(maxDDpct, 4),
    maxDrawdownFecha: maxDDfecha,
    diasEnDrawdown: maxEnDD,
    ulcer: roundTo(Math.sqrt(sumaDD2 / n), 4),
    factorRecuperacion: maxDD > 0 ? roundTo(mP.suma / maxDD, 3) : null,

    sharpe: sharpe === null ? null : roundTo(sharpe, 3),
    sharpeDiario: sharpeDiario === null ? null : roundTo(sharpeDiario, 4),
    retornoDiarioMedio: mR.media === null ? null : roundTo(mR.media, 6),
    retornoDiarioDesv: mR.desv === null ? null : roundTo(mR.desv, 6),
    tasaLibreDiaria: roundTo(rfDia, 8),
    sortino: sortino === null ? null : roundTo(sortino, 3),
    calmar: calmar === null ? null : roundTo(calmar, 3),
    retornoAnualizado: retAnual === null ? null : roundTo(retAnual, 4),

    fiable,
    razon: fiable ? `${n} dias: suficiente para leer los ratios` :
      `${n} dias: Sharpe, Sortino y Calmar anualizados sobre menos de ${cfg.minDiasFiable} dias no son interpretables`,
  });
}

/* -------------------------------------------------------------------------
   Consistencia: mejor dia / ganancia total. Se conserva exactamente la
   semantica que ya usaba la app, incluido "cuanto falta acumular".
   ------------------------------------------------------------------------- */
function evaluarConsistencia(diarios, limitePct, opciones) {
  const cfg = Object.assign({ gananciaPrevia: 0, mejorDiaPrevio: 0 }, opciones || {});
  const L = clamp(toNum(limitePct) ?? 0, 0, 100) / 100;
  const pnls = (diarios || []).map(d => toNum(typeof d === "number" ? d : d && d.pnl)).filter(x => x !== null);

  const jTotal = pnls.reduce((s, x) => s + x, 0);
  const verdes = pnls.filter(x => x > 0);
  const jMejor = verdes.length ? Math.max(...verdes) : 0;

  const total = roundTo(jTotal + (toNum(cfg.gananciaPrevia) ?? 0), 2);
  const mejor = roundTo(Math.max(jMejor, toNum(cfg.mejorDiaPrevio) ?? 0), 2);

  if (!L) return Ok({ aplica: false, razon: "no hay limite de consistencia definido", total, mejor });

  /* La consistencia reparte GANANCIAS. Sin ganancia acumulada el cociente no
     existe: devolver 1 como centinela y pintarlo como «100%» es fabricar un
     numero sobre una cuenta en rojo. Aqui es null y se dice por que. */
  const sinGanancia = total <= 0;
  const ratio = sinGanancia ? null : roundTo(mejor / total, 6);
  const requerido = mejor > 0 ? mejor / L : 0;
  /* Sin ningun dia verde no hay mejor dia, asi que la consistencia no impone
     nada y no "falta" nada por su culpa. Restar un total negativo de un
     requerido de cero producia una exigencia inventada. */
  const falta = requerido > 0 ? Math.max(0, roundTo(requerido - total, 2)) : 0;
  const tope = sinGanancia ? 0 : roundTo(L * total / (1 - L), 2);
  const mediaVerde = verdes.length ? verdes.reduce((s, x) => s + x, 0) / verdes.length : 0;

  return Ok({
    aplica: true,
    limite: L,
    total, mejor,
    ratio,
    sinGanancia,
    razonSinRatio: sinGanancia ? `No hay ganancia acumulada que repartir (total ${total}). La consistencia se mide sobre ganancias.` : null,
    cumple: sinGanancia ? null : !(ratio > L),
    cerca: !sinGanancia && ratio > L * 0.85 && ratio <= L,
    /* total que haria falta para cumplir */
    totalRequerido: roundTo(requerido, 2),
    falta,
    /* el dia mas grande que hoy todavia cumpliria */
    topeDiaHoy: tope,
    diasParaCumplir: falta > 0 && mediaVerde > 0 ? Math.ceil(falta / mediaVerde) : 0,
    mediaDiaVerde: roundTo(mediaVerde, 2),
    hayDatos: total > 0 || mejor > 0,
  });
}

/* ─── survival.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · supervivencia de cuenta
   -------------------------------------------------------------------------
   La unica pregunta que de verdad importa en una cuenta de fondeo:
   con MI ventaja medida y MI tamano de posicion, que probabilidad tengo de
   pasarla antes de quemarla.

   Por que Monte Carlo y no la formula clasica de riesgo de ruina:
   la formula de Ralph Vince asume ganancia y perdida de tamano fijo y ruina
   en cero. Ninguna de las tres cosas es cierta aqui: la distribucion de R
   tiene colas, el suelo es movil (trailing) y encima hay limite de perdida
   diaria y regla de consistencia que interactuan entre si. Remuestrear las
   operaciones reales del trader respeta la forma real de su distribucion,
   colas incluidas, sin asumir normalidad.

   Sembrado: dos corridas con la misma semilla dan el mismo resultado.
   Una simulacion que no se puede reproducir no es evidencia.
   ========================================================================= */



const RESULTADO = Object.freeze({ PASADA: "pasada", QUEMADA: "quemada", SIN_RESOLVER: "sin_resolver" });

function simularCuenta(opciones) {
  const cfg = Object.assign({
    rMultiples: [],
    riesgoPorOperacion: null,      // USD que vale 1R
    operacionesPorDia: 3,
    variabilidadOpsDia: true,      // el numero de trades del dia varia
    saldoInicial: 25000,
    ddTipo: DD_TIPOS.TRAILING_BLOQUEADO,
    ddMaximo: 1000,
    baseTrailing: "cierre",
    objetivoGanancia: null,        // USD de ganancia para pasar
    perdidaDiariaMax: null,        // USD; al tocarlo se corta el dia
    limiteConsistencia: null,      // 0..100; debe cumplirse para pasar
    diasMinimos: 0,                // dias minimos exigidos por la prop
    diasMax: 120,
    caminos: 5000,
    semilla: 20260917,
  }, opciones || {});

  const rs = (cfg.rMultiples || []).map(toNum).filter(x => x !== null);
  if (rs.length < 5) return Err("MUESTRA_INSUFICIENTE",
    `Hacen falta al menos 5 operaciones con R para simular; hay ${rs.length}. Sin distribucion propia, la simulacion seria una opinion disfrazada de numero.`,
    { n: rs.length });

  const riesgo = toNum(cfg.riesgoPorOperacion);
  if (riesgo === null || riesgo <= 0) return Err("SIN_RIESGO", "Falta el valor en USD de 1R.");

  const inicial = toNum(cfg.saldoInicial) ?? 0;
  const ddMax = toNum(cfg.ddMaximo);
  const objetivo = toNum(cfg.objetivoGanancia);
  const perdidaDia = toNum(cfg.perdidaDiariaMax);
  const Lc = toNum(cfg.limiteConsistencia);
  const L = Lc === null ? null : Math.min(Math.max(Lc, 1), 99) / 100;
  const opsDiaMedia = Math.max(1, toNum(cfg.operacionesPorDia) ?? 3);
  const diasMax = toPosInt(cfg.diasMax) ?? 120;
  const caminos = toPosInt(cfg.caminos) ?? 5000;
  const diasMin = toPosInt(cfg.diasMinimos) ?? 0;
  const intradia = cfg.baseTrailing === "intradia";

  const next = rng(cfg.semilla);
  const nR = rs.length;

  let pasadas = 0, quemadas = 0, sinResolver = 0;
  const diasHastaPasar = [];
  const diasHastaQuemar = [];
  const finales = [];
  const maxCaidas = [];
  let bloqueadosPorConsistencia = 0;

  for (let p = 0; p < caminos; p++) {
    let equity = inicial, pico = inicial;
    let mejorDia = 0, totalGanancia = 0;
    let peorColchon = Infinity;
    let estado = RESULTADO.SIN_RESOLVER, dia = 0;
    let frenadoPorConsistencia = false;

    for (dia = 1; dia <= diasMax; dia++) {
      /* Numero de operaciones del dia: Poisson aproximada por conteo simple
         alrededor de la media, para no fingir un ritmo perfectamente regular. */
      let k = Math.round(opsDiaMedia);
      if (cfg.variabilidadOpsDia) {
        k = 0; const lambda = opsDiaMedia, limite = Math.exp(-lambda);
        let prod = next();
        while (prod > limite && k < 50) { k++; prod *= next(); }
        if (k < 1) k = 1;
      }

      let pnlDia = 0;
      for (let i = 0; i < k; i++) {
        const r = rs[randInt(next, nR)];
        const pnl = r * riesgo;
        pnlDia += pnl; equity += pnl;
        if (intradia) {
          if (equity > pico) pico = equity;
          const suelo = sueloPara(cfg.ddTipo, inicial, pico, ddMax);
          if (suelo !== null) { const col = equity - suelo; if (col < peorColchon) peorColchon = col;
            if (col <= 0) { estado = RESULTADO.QUEMADA; break; } }
        }
        if (perdidaDia !== null && pnlDia <= -Math.abs(perdidaDia)) break;  // se corta el dia
      }
      if (estado === RESULTADO.QUEMADA) break;

      if (!intradia) {
        if (equity > pico) pico = equity;
        const suelo = sueloPara(cfg.ddTipo, inicial, pico, ddMax);
        if (suelo !== null) { const col = equity - suelo; if (col < peorColchon) peorColchon = col;
          if (col <= 0) { estado = RESULTADO.QUEMADA; break; } }
      }

      if (pnlDia > 0) { if (pnlDia > mejorDia) mejorDia = pnlDia; }
      totalGanancia = equity - inicial;

      /* Pasar exige las tres cosas a la vez: objetivo, dias minimos y
         consistencia. Un dia enorme puede RETRASAR el aprobado aunque el
         objetivo ya este cubierto; esa interaccion es el motivo de simular. */
      if (objetivo !== null && totalGanancia >= objetivo && dia >= diasMin) {
        const ratio = totalGanancia > 0 ? mejorDia / totalGanancia : 1;
        if (L === null || ratio <= L) { estado = RESULTADO.PASADA; break; }
        frenadoPorConsistencia = true;
      }
    }

    if (estado === RESULTADO.PASADA) { pasadas++; diasHastaPasar.push(dia); }
    else if (estado === RESULTADO.QUEMADA) { quemadas++; diasHastaQuemar.push(dia); }
    else { sinResolver++; if (frenadoPorConsistencia) bloqueadosPorConsistencia++; }

    finales.push(equity);
    maxCaidas.push(peorColchon === Infinity ? null : peorColchon);
  }

  const pP = roundTo(pasadas / caminos, 4);
  const pQ = roundTo(quemadas / caminos, 4);
  const mF = momentos(finales);
  const colchones = maxCaidas.filter(x => x !== null);

  return Ok({
    caminos, semilla: cfg.semilla,
    muestraR: nR,
    supuestos: {
      riesgoPorOperacion: roundTo(riesgo, 2),
      operacionesPorDia: roundTo(opsDiaMedia, 2),
      saldoInicial: inicial, ddTipo: cfg.ddTipo, ddMaximo: ddMax,
      objetivoGanancia: objetivo, perdidaDiariaMax: perdidaDia,
      limiteConsistencia: L, diasMax, diasMinimos: diasMin,
      baseTrailing: cfg.baseTrailing,
    },

    /* Las tres se redondean de forma coherente: si cada una se redondea por su
       cuenta, la suma puede dar 100.01% y un panel que muestra probabilidades
       que no suman 1 destruye la confianza en todo lo demas. La tercera se
       deriva de las otras dos. */
    pPasar: pP,
    pQuemar: pQ,
    pSinResolver: roundTo(1 - pP - pQ, 4),
    pFrenadaPorConsistencia: roundTo(bloqueadosPorConsistencia / caminos, 4),

    diasPasarMediana: diasHastaPasar.length ? Math.round(cuantil(diasHastaPasar, 0.5)) : null,
    diasPasarP90: diasHastaPasar.length ? Math.round(cuantil(diasHastaPasar, 0.9)) : null,
    diasQuemarMediana: diasHastaQuemar.length ? Math.round(cuantil(diasHastaQuemar, 0.5)) : null,

    equityFinal: {
      media: roundTo(mF.media, 2),
      mediana: roundTo(cuantil(finales, 0.5), 2),
      p05: roundTo(cuantil(finales, 0.05), 2),
      p95: roundTo(cuantil(finales, 0.95), 2),
    },
    colchonMinimo: colchones.length ? {
      mediana: roundTo(cuantil(colchones, 0.5), 2),
      p05: roundTo(cuantil(colchones, 0.05), 2),
    } : null,

    /* Riesgo de ruina con este tamano de posicion, sin objetivo ni horizonte:
       es pQuemar dentro de diasMax. Se nombra asi para no confundirlo con la
       ruina asintotica, que para un suelo movil siempre tiende a 1. */
    riesgoDeRuina: pQ,

    /* Error estandar de Monte Carlo: sqrt(p(1-p)/N). Con 2.000 caminos la
       resolucion es 0.05%, asi que imprimir "100.0%" afirma una certeza que
       el metodo no puede entregar. Quien consume esto debe redondear hacia
       ">99%" / "<1%" en los extremos. */
    errorEstandar: {
      pasar: roundTo(Math.sqrt(pP * (1 - pP) / caminos), 5),
      quemar: roundTo(Math.sqrt(pQ * (1 - pQ) / caminos), 5),
    },
    resolucion: roundTo(1 / caminos, 6),
    nota: "Probabilidades condicionadas a que la ventaja futura sea igual a la medida. No lo es: la muestra tiene error y el mercado cambia.",
  });
}

/* -------------------------------------------------------------------------
   riesgoPorTamano(): barre varios tamanos de posicion y devuelve la curva
   completa. Sirve para ver donde esta el punto en que subir contratos deja
   de aumentar la probabilidad de pasar y solo aumenta la de quemar.
   ------------------------------------------------------------------------- */
function barridoDeRiesgo(opciones, tamanos) {
  const lista = (tamanos && tamanos.length ? tamanos : [0.25, 0.5, 0.75, 1, 1.5, 2, 3]);
  const baseRiesgo = toNum(opciones && opciones.riesgoPorOperacion);
  if (baseRiesgo === null || baseRiesgo <= 0) return Err("SIN_RIESGO", "Falta el valor en USD de 1R.");
  const filas = [];
  for (const mult of lista) {
    const r = simularCuenta(Object.assign({}, opciones, { riesgoPorOperacion: baseRiesgo * mult }));
    if (!r.ok) return r;
    filas.push({ multiplicador: mult, riesgo: roundTo(baseRiesgo * mult, 2),
                 pPasar: r.value.pPasar, pQuemar: r.value.pQuemar,
                 diasPasarMediana: r.value.diasPasarMediana });
  }
  let optimo = null;
  for (const f of filas) if (!optimo || f.pPasar > optimo.pPasar) optimo = f;
  return Ok({ filas, optimo });
}

/* =========================================================================
   Modelo PARAMETRICO
   -------------------------------------------------------------------------
   simularCuenta() remuestrea las operaciones reales del trader, que es lo
   correcto cuando existen. Pero una calculadora de planificacion responde otra
   pregunta: "SI mi acierto fuera del 45% y mi ganancia media 2R, que pasaria".
   Ahi no hay distribucion empirica que remuestrear —  la hipotesis ES la
   entrada— y un modelo binomial de ganancia fija R y perdida fija 1 es el
   modelo adecuado, no una simplificacion perezosa.

   Vive aqui, y no suelto en la interfaz, para que exista UNA sola definicion
   del suelo, UN solo generador sembrado y pruebas que lo cubran.
   ========================================================================= */

function simularParametrico(opciones) {
  const cfg = Object.assign({
    acierto: null,            // 0..1 (o 0..100)
    gananciaR: 2,             // cuanto se gana, en unidades de riesgo
    colchonUnidades: null,    // cuantas perdidas completas caben antes de quemar
    objetivoUnidades: 0,      // cuantas unidades hay que ganar para pasar
    maxOperaciones: 400,
    caminos: 4000,
    semilla: 776622911,
  }, opciones || {});

  let p = toNum(cfg.acierto);
  if (p === null) return Err("SIN_ACIERTO", "Falta la tasa de acierto.");
  if (p > 1) p = p / 100;
  if (p <= 0 || p >= 1) return Err("ACIERTO_FUERA_DE_RANGO", "La tasa de acierto debe estar entre 0 y 100%.", { p });

  const R = toNum(cfg.gananciaR);
  if (R === null || R <= 0) return Err("GANANCIA_INVALIDA", "La ganancia media en R debe ser mayor que cero.");

  const colchon = toNum(cfg.colchonUnidades);
  const objetivo = Math.max(0, toNum(cfg.objetivoUnidades) ?? 0);
  const caminos = toPosInt(cfg.caminos) ?? 4000;
  const maxOps = toPosInt(cfg.maxOperaciones) ?? 400;

  /* Sin colchon la cuenta ya esta quemada: la ruina no es una probabilidad,
     es un hecho. Devolverlo como 1 es correcto, pero se marca como tal. */
  if (colchon === null || colchon <= 0) {
    return Ok({ yaQuemada: true, pQuemar: 1, pPasar: objetivo > 0 ? 0 : null,
      medianaFinal: 0, esperanzaR: roundTo(p * R - (1 - p), 4), caminos: 0,
      errorEstandar: { quemar: 0, pasar: 0 }, semilla: cfg.semilla,
      nota: "El colchon ya es cero o negativo: la cuenta esta quemada, no es una probabilidad." });
  }

  const next = rng(cfg.semilla);
  let ruina = 0, pasadas = 0;
  const finales = new Array(caminos);
  for (let i = 0; i < caminos; i++) {
    let x = 0;
    for (let t = 0; t < maxOps; t++) {
      x += next() < p ? R : -1;
      if (x <= -colchon) { ruina++; break; }
      if (objetivo > 0 && x >= objetivo) { pasadas++; break; }
    }
    finales[i] = x;
  }
  const pQ = roundTo(ruina / caminos, 5);
  const pP = objetivo > 0 ? roundTo(pasadas / caminos, 5) : null;

  return Ok({
    yaQuemada: false,
    pQuemar: pQ,
    pPasar: pP,
    medianaFinal: roundTo(cuantil(finales, 0.5), 3),
    p05Final: roundTo(cuantil(finales, 0.05), 3),
    p95Final: roundTo(cuantil(finales, 0.95), 3),
    esperanzaR: roundTo(p * R - (1 - p), 4),
    caminos, semilla: cfg.semilla,
    colchonUnidades: roundTo(colchon, 3),
    errorEstandar: {
      quemar: roundTo(Math.sqrt(pQ * (1 - pQ) / caminos), 5),
      pasar: pP === null ? null : roundTo(Math.sqrt(pP * (1 - pP) / caminos), 5),
    },
    resolucion: roundTo(1 / caminos, 6),
    nota: "Modelo parametrico: asume ganancia fija de R y perdida fija de 1. Tu distribucion real tiene colas; esto es una hipotesis, no una medicion.",
  });
}

/* P(al menos una racha de k perdidas en n operaciones). Programacion dinamica
   exacta sobre la longitud de la racha en curso: no es una simulacion, es el
   valor cerrado. Sirve para separar "mala suerte" de "sistema roto". */
function probabilidadDeRacha(probPerdida, k, n) {
  const q = toNum(probPerdida), K = toPosInt(k), N = toPosInt(n);
  if (q === null || K === null || N === null) return null;
  if (K > N || q <= 0) return 0;
  if (q >= 1) return 1;
  let dp = new Array(K).fill(0); dp[0] = 1; let golpe = 0;
  for (let i = 0; i < N; i++) {
    const nd = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      const pj = dp[j]; if (!pj) continue;
      nd[0] += pj * (1 - q);
      if (j + 1 < K) nd[j + 1] += pj * q; else golpe += pj * q;
    }
    dp = nd;
  }
  return roundTo(golpe, 6);
}

/* ─── compliance.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · cumplimiento de reglas de cuenta
   -------------------------------------------------------------------------
   Los margenes de las reglas de una cuenta de fondeo: cuanto queda de la
   perdida diaria, del drawdown y hasta donde se puede ganar hoy. El veredicto
   (lista / aviso / bloqueada / quemada) lo da la app en evaluateAccountRules,
   que conoce tambien pausa, archivo, instrumentos y rachas.
   ========================================================================= */

const NIVELES = [
  { hasta: 0.50, codigo: "seguro", etiqueta: "SEGURO", clase: "good" },
  { hasta: 0.75, codigo: "precaucion", etiqueta: "PRECAUCION", clase: "warn" },
  { hasta: 1.00, codigo: "peligro", etiqueta: "PELIGRO", clase: "bad" },
];

/* Cuanto queda del limite de perdida diaria. */
function margenDePerdida(pnlHoy, maximo) {
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
function topeDeGanancia(consistencia, reglaMaxima) {
  const dura = toNum(reglaMaxima);
  const cons = consistencia && consistencia.aplica && consistencia.total > 0 ? toNum(consistencia.topeDiaHoy) : null;
  if (dura === null && cons === null) return { valor: null, porque: "falta la regla de tope de ganancia" };
  if (dura === null) return { valor: cons, porque: "lo marca la consistencia" };
  if (cons === null) return { valor: dura, porque: "tu regla dura" };
  return cons < dura ? { valor: cons, porque: "lo marca la consistencia" } : { valor: dura, porque: "tu regla dura" };
}

/* Margen de drawdown restante, expresado tambien en operaciones perdedoras:
   "te quedan 2.3 stops" comunica mucho mas que "colchon 92 USD". */
function margenDeDrawdown(curva, riesgoPorOperacion) {
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

/* ─── excursion.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · excursion (MAE / MFE)
   -------------------------------------------------------------------------
   MAE = Maximum Adverse Excursion: lo mas en contra que fue la operacion
         antes de resolverse.
   MFE = Maximum Favourable Excursion: lo mas a favor que llego antes de que
         salieras.

   Son los dos numeros que el P&L no puede contener, y contestan lo unico que
   el resultado no dice:

     MAE de las GANADORAS  -> cuanto podrias apretar el stop sin perderlas
     MFE frente a la salida -> cuanto dejas en la mesa por salir pronto

   Todo se mide en ticks enteros, igual que el resto del motor, y todo se
   devuelve con su n y su fiabilidad: una conclusion sobre 6 operaciones no
   es una conclusion.
   ========================================================================= */




/* Excursion de UNA operacion, normalizada a R (la unidad comparable entre
   instrumentos y tamanos). Devuelve null en los campos que no se puedan medir;
   nunca un cero que se confunda con "no fue en contra". */
function excursionDeOperacion(op, opciones) {
  const o = op || {};
  const rc = resolveContract(o.simbolo, (opciones || {}).overrides);
  const tick = rc.ok ? rc.value.tickSize : null;

  const dir = dirOf(o.direccion);
  const e = toNum(o.entrada), s = toNum(o.stop), x = toNum(o.salida);
  const mae = toNum(o.mae), mfe = toNum(o.mfe);
  if (e === null) return null;

  const riesgo = s === null ? null : Math.abs(e - s);
  const enR = v => (riesgo && v !== null ? roundTo(v / riesgo, 4) : null);

  /* MAE y MFE llegan como PRECIOS (es lo que se lee del grafico), no como
     distancias: convertirlos aqui evita que el usuario tenga que restar. */
  const adverso = mae === null ? null : Math.max(0, (e - mae) * dir);
  const favorable = mfe === null ? null : Math.max(0, (mfe - e) * dir);
  const logrado = x === null ? null : (x - e) * dir;

  return {
    riesgoPuntos: riesgo,
    adversoPuntos: adverso === null ? null : roundTo(adverso, 6),
    favorablePuntos: favorable === null ? null : roundTo(favorable, 6),
    maeR: enR(adverso),
    mfeR: enR(favorable),
    logradoR: enR(logrado),
    /* Cuanto del recorrido disponible te llevaste. 1 = saliste en el maximo. */
    capturaMFE: (favorable && logrado !== null && favorable > 0) ? roundTo(logrado / favorable, 4) : null,
    /* Cuanto del stop llegaste a gastar. 1 = te rozo el stop y volvio. */
    usoDelStop: (riesgo && adverso !== null) ? roundTo(adverso / riesgo, 4) : null,
    ticksAdverso: (tick && adverso !== null) ? Math.round(adverso / tick) : null,
    ticksFavorable: (tick && favorable !== null) ? Math.round(favorable / tick) : null,
    ganadora: logrado === null ? null : logrado > 0,
  };
}

/* -------------------------------------------------------------------------
   analizarExcursion(ops) -> Result
   ops: [{ simbolo, direccion, entrada, stop, salida, mae, mfe }]
   ------------------------------------------------------------------------- */
function analizarExcursion(operaciones, opciones) {
  const cfg = Object.assign({ overrides: null, supervivencia: 0.95 }, opciones || {});
  const filas = (operaciones || []).map(o => excursionDeOperacion(o, cfg)).filter(Boolean);

  const conMAE = filas.filter(f => f.usoDelStop !== null && f.ganadora !== null);
  const conMFE = filas.filter(f => f.capturaMFE !== null);
  const ganadoras = conMAE.filter(f => f.ganadora);

  const vdMae = veredicto(conMAE.length);
  const vdMfe = veredicto(conMFE.length);

  /* ---- ¿cuanto podria apretar el stop? ----
     El cuantil alto del MAE de las GANADORAS es la respuesta directa: si el
     95% de tus ganadoras nunca paso del 60% del stop, el 40% restante del
     stop no te esta protegiendo de nada, solo esta pagando mas por operacion.
     Se mide solo sobre ganadoras a proposito: en las perdedoras el MAE acaba
     siendo el stop por definicion, y meterlas contaminaria la conclusion. */
  let stop = null;
  if (ganadoras.length >= 5) {
    const usos = ganadoras.map(f => f.usoDelStop);
    const q = cuantil(usos, cfg.supervivencia);
    const sobra = Math.max(0, 1 - q);
    stop = {
      n: ganadoras.length,
      usoTipico: roundTo(cuantil(usos, 0.5), 4),
      usoP95: roundTo(q, 4),
      /* fraccion del stop que nunca llego a hacer falta */
      margenSobrante: roundTo(sobra, 4),
      /* cuanto se podria apretar conservando ese % de las ganadoras */
      recorteSugerido: sobra > 0.15 ? roundTo(sobra, 4) : 0,
      fiable: vdMae.fiable,
      veredicto: vdMae,
    };
  }

  /* ---- ¿cuanto dejo en la mesa? ----
     La captura se promedia SOLO sobre ganadoras, a proposito. En una perdedora
     que fue a favor y volvio, la "captura" es negativa: mezclarla con las
     ganadoras produce una media sin significado (y, con suficientes perdedoras,
     un porcentaje de captura NEGATIVO, que no quiere decir nada).
     Lo que esas perdedoras si contestan es otra pregunta, y va aparte:
     cuantas veces tuviste una ganancia real en la mano y la devolviste. */
  const ganMFE = conMFE.filter(f => f.ganadora === true);
  let salida = null;
  if (ganMFE.length >= 5) {
    const caps = ganMFE.map(f => f.capturaMFE);
    const rs = ganMFE.map(f => f.mfeR).filter(v => v !== null);
    const logr = ganMFE.map(f => f.logradoR).filter(v => v !== null);
    const mfeMedio = rs.length ? momentos(rs).media : null;
    const logMedio = logr.length ? momentos(logr).media : null;
    const vdG = veredicto(ganMFE.length);
    salida = {
      n: ganMFE.length,
      capturaMedia: roundTo(momentos(caps).media, 4),
      capturaMediana: roundTo(cuantil(caps, 0.5), 4),
      mfeMedioR: mfeMedio === null ? null : roundTo(mfeMedio, 3),
      logradoMedioR: logMedio === null ? null : roundTo(logMedio, 3),
      dejadoEnLaMesaR: (mfeMedio === null || logMedio === null) ? null : roundTo(mfeMedio - logMedio, 3),
      fiable: vdG.fiable,
      veredicto: vdG,
    };
  }

  /* ---- ganancias devueltas ----
     Operaciones que llegaron a estar 1R o mas a favor y aun asi acabaron en
     perdida. Es el sintoma mas caro que existe y el P&L no lo ve: cuenta la
     perdida, no la ganancia que hubo antes. */
  let devueltas = null;
  {
    const conR = conMFE.filter(f => f.mfeR !== null && f.ganadora !== null);
    if (conR.length >= 5) {
      const llegaron = conR.filter(f => f.mfeR >= 1);
      const perdidas = llegaron.filter(f => !f.ganadora);
      devueltas = {
        n: conR.length,
        llegaronA1R: llegaron.length,
        acabaronEnPerdida: perdidas.length,
        tasa: llegaron.length ? roundTo(perdidas.length / llegaron.length, 4) : null,
        rMedioDevuelto: perdidas.length
          ? roundTo(momentos(perdidas.map(f => f.mfeR - (f.logradoR ?? 0))).media, 3) : null,
      };
    }
  }

  return Ok({
    n: filas.length,
    conMAE: conMAE.length,
    conMFE: conMFE.length,
    stop, salida, devueltas,
    faltanParaMedir: Math.max(0, UMBRALES.fiable - Math.max(conMAE.length, conMFE.length)),
    nota: "MAE y MFE son lo unico que separa una salida buena de una salida afortunada. Sin ellos el P&L no distingue las dos.",
  });
}

/* ─── portfolio.js ─────────────────────────────────────────────── */
/* =========================================================================
   QuantEngine · cartera (retorno con aportes en el tiempo)
   -------------------------------------------------------------------------
   El problema: con dinero entrando en fechas distintas, (valor - coste)/coste
   NO es tu rentabilidad. El dolar de enero trabajo doce meses; el de diciembre,
   cero. Dividir por el coste total ignora eso y subestima el resultado.

   Ejemplo medido: DCA de 200/mes durante 12 meses en un activo que sube 10%.
     (valor - coste)/coste  ->   5.34%
     IRR anualizado         ->  10.00%
   Casi la mitad. Y el error empuja a abandonar una estrategia que funciona.

   QUE SE PUEDE CALCULAR Y QUE NO
   - MWR / IRR: EXACTO. Solo necesita flujos fechados y el valor final.
   - TWR verdadero: NO. Necesita el valor de la cartera en CADA fecha de flujo,
     y eso no se registra. Aqui no se aproxima ni se disfraza: se dice que falta.
   ========================================================================= */

const DIA = 86400000;

/* Fecha ISO -> milisegundos UTC. Sin reloj: la fecha "hoy" siempre se pasa. */
function fechaMs(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}
function aniosEntre(desdeISO, hastaISO) {
  const a = fechaMs(desdeISO), b = fechaMs(hastaISO);
  if (a === null || b === null) return null;
  return (b - a) / DIA / 365;
}

/* -------------------------------------------------------------------------
   Valor de una serie de flujos CAPITALIZADOS hasta la fecha de corte.
   Convencion: flujo NEGATIVO = dinero que sale de tu bolsillo (compra, aporte),
   POSITIVO = dinero que vuelve (venta, dividendo). El valor final de la cartera
   entra como un flujo positivo en la fecha de corte.

   El IRR es la tasa que hace esta suma cero: cada aporte crece a r hasta el
   final y, entre todos, tienen que dar exactamente el valor que tienes hoy.

     valor_final = SUMA( aporte_i * (1+r)^(anios desde aporte_i hasta hoy) )

   Ojo con el exponente: es MULTIPLICAR, no dividir. Dividir mide lo contrario
   —hace encoger los aportes en vez de crecerlos— y devuelve una tasa negativa
   para una cartera que va ganando. Es exactamente el error que tuve aqui.
   ------------------------------------------------------------------------- */
function valorCapitalizado(flujos, tasa, hastaISO) {
  const r = toNum(tasa);
  if (r === null || r <= -1) return null;
  let v = 0;
  for (const f of flujos) {
    const t = aniosEntre(f.fecha, hastaISO);
    if (t === null) return null;
    v += f.monto * Math.pow(1 + r, t);
  }
  return v;
}
/* alias historico */
const vpn = valorCapitalizado;

/* -------------------------------------------------------------------------
   IRR por biseccion. Newton converge mas rapido pero puede divergir con flujos
   irregulares, y aqui importa mas no mentir que terminar rapido: la biseccion
   converge SIEMPRE si hay un cambio de signo en el intervalo.
   ------------------------------------------------------------------------- */
function irr(flujos, hastaISO, opciones) {
  const cfg = Object.assign({ min: -0.9999, max: 10, iteraciones: 200, tolerancia: 1e-7 }, opciones || {});
  const fs = (flujos || []).filter(f => f && toNum(f.monto) !== null && fechaMs(f.fecha) !== null);
  if (fs.length < 2) return Err("FLUJOS_INSUFICIENTES", "Hacen falta al menos dos flujos fechados.", { n: fs.length });

  const hayNeg = fs.some(f => f.monto < 0), hayPos = fs.some(f => f.monto > 0);
  if (!hayNeg || !hayPos) {
    return Err("SIN_CAMBIO_DE_SIGNO",
      "Todos los flujos van en la misma direccion: no existe una tasa de retorno que resolver.",
      { hayNeg, hayPos });
  }

  let a = cfg.min, b = cfg.max;
  const va = valorCapitalizado(fs, a, hastaISO), vb = valorCapitalizado(fs, b, hastaISO);
  if (va === null || vb === null) return Err("FECHAS_INVALIDAS", "Alguna fecha no se pudo interpretar.");
  if (va * vb > 0) {
    return Err("SIN_RAIZ_EN_RANGO",
      `El IRR queda fuera del rango [${roundTo(cfg.min * 100, 0)}%, ${roundTo(cfg.max * 100, 0)}%]. Suele significar que el valor final o alguna fecha estan mal.`,
      { valorMin: roundTo(va, 4), valorMax: roundTo(vb, 4) });
  }

  let mid = a;
  for (let i = 0; i < cfg.iteraciones; i++) {
    mid = (a + b) / 2;
    const v = valorCapitalizado(fs, mid, hastaISO);
    if (v === null) break;
    if (Math.abs(v) < cfg.tolerancia || (b - a) / 2 < cfg.tolerancia) break;
    if (v * va > 0) a = mid; else b = mid;
  }
  return Ok(roundTo(mid, 6));
}

/* -------------------------------------------------------------------------
   analizarCartera(): las dos cifras, y la distancia entre ellas.

   ops: [{ fecha, tipo: "compra"|"aporte"|"venta"|"dividendo"|"costo", monto }]
        monto SIEMPRE en positivo; el tipo decide el signo (igual que el ledger
        de las cuentas, por la misma razon: un retiro en negativo sumaba).
   valorActual: valor de mercado de lo que aun tienes.
   hasta: fecha de corte (ISO). Se pasa: el motor no mira el reloj.
   ------------------------------------------------------------------------- */
const SALE = { compra: -1, aporte: -1, costo: -1 };
const ENTRA = { venta: 1, dividendo: 1, ingreso: 1 };

function analizarCartera(entrada) {
  const e = entrada || {};
  const hasta = e.hasta;
  if (fechaMs(hasta) === null) return Err("SIN_FECHA_DE_CORTE", "Falta la fecha hasta la que medir.");
  const valor = toNum(e.valorActual);
  if (valor === null || valor < 0) return Err("SIN_VALOR", "Falta el valor actual de la cartera.");

  const flujos = [];
  let invertido = 0, recuperado = 0, primeraFecha = null;
  for (const o of (e.ops || [])) {
    const m = Math.abs(toNum(o && o.monto) ?? 0);
    const f = o && o.fecha;
    if (!m || fechaMs(f) === null) continue;
    const signo = SALE[o.tipo] !== undefined ? SALE[o.tipo] : (ENTRA[o.tipo] !== undefined ? ENTRA[o.tipo] : -1);
    flujos.push({ fecha: f, monto: signo * m, tipo: o.tipo });
    if (signo < 0) invertido += m; else recuperado += m;
    if (primeraFecha === null || fechaMs(f) < fechaMs(primeraFecha)) primeraFecha = f;
  }
  if (!flujos.length) return Err("SIN_OPERACIONES", "No hay aportes ni compras registrados.");

  /* El valor que aun tienes entra como flujo positivo en la fecha de corte. */
  const conFinal = flujos.concat([{ fecha: hasta, monto: valor, tipo: "valor_final" }]);
  const rIrr = irr(conFinal, hasta);

  const neto = recuperado + valor - invertido;
  /* La formula que usa la app hoy, para poder ensenar la diferencia. */
  const simple = invertido > 0 ? neto / invertido : null;
  const anios = aniosEntre(primeraFecha, hasta);

  const res = Ok({
    invertido: roundTo(invertido, 2),
    recuperado: roundTo(recuperado, 2),
    valorActual: roundTo(valor, 2),
    ganancia: roundTo(neto, 2),
    nFlujos: flujos.length,
    desde: primeraFecha, hasta,
    anios: anios === null ? null : roundTo(anios, 3),

    /* lo que hoy ensena la app */
    retornoSimple: simple === null ? null : roundTo(simple, 6),

    /* lo que de verdad le paso a tu dinero */
    irrAnual: rIrr.ok ? rIrr.value : null,
    irrError: rIrr.ok ? null : rIrr.error,

    /* TWR: se nombra y se explica por que no esta, en vez de aproximarlo */
    twr: null,
    twrRazon: "El TWR necesita el valor de la cartera en cada fecha de aporte, y eso no se registra. Aproximarlo aqui seria inventarlo.",
  });

  if (rIrr.ok && simple !== null && anios && anios > 0.08) {
    const brecha = rIrr.value - simple;
    res.value = Object.assign({}, res.value, {
      brecha: roundTo(brecha, 6),
      /* Con aportes repartidos, el retorno simple SIEMPRE queda por debajo del
         IRR (el dinero reciente no tuvo tiempo de trabajar). Cuanto mayor la
         brecha, mas te esta enganando la cifra simple. */
      brechaTexto: brecha > 0.005
        ? `El retorno simple te resta ${roundTo(brecha * 100, 2)} puntos porque divide por todo el dinero aportado, incluido el de la semana pasada.`
        : null,
    });
  }
  return res;
}

/* Retorno anualizado de UNA posicion con una sola compra. Exacto; para una
   posicion con varias compras hay que usar su propio IRR. */
function cagr(valorInicial, valorFinal, anios) {
  const a = toNum(valorInicial), b = toNum(valorFinal), t = toNum(anios);
  if (a === null || b === null || t === null || a <= 0 || t <= 0) return null;
  if (b <= 0) return -1;
  return roundTo(Math.pow(b / a, 1 / t) - 1, 6);
}

/* ─── index.js ─────────────────────────────────────────────── */
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










/* =========================================================================
   Adaptador para Cabina
   -------------------------------------------------------------------------
   La app guarda las operaciones con sus propios nombres de campo. En lugar de
   renombrar 5.000 lineas de render, la traduccion vive aqui, en un solo sitio,
   y es lo unico que hay que revisar si el modelo de datos cambia.
   ========================================================================= */

function desdeTradeApp(t) {
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
function calcularTradeApp(t, opciones) {
  const cfg = Object.assign({ incluirComisiones: false, overrides: null }, opciones || {});
  const r = valuarOperacion(desdeTradeApp(t), cfg);

  if (!isOk(r)) {
    /* Sin contrato no hay P&L en dolares, pero R SI existe: es un cociente de
       precios y el multiplicador se cancela. Perderlo aqui seria tirar la
       unica medida util que queda de una operacion con simbolo desconocido. */
    return {
      pnlEff: toNum(t.pnl),
      rReal: rRealApp(t),
      rPlanned: rPlanApp(t),
      riskUsd: null,
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
    rReal: v.rBruto,
    rPlanned: v.rPlaneado,
    riskUsd: v.riesgoUSD,
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
function rPlanApp(t) {
  const e = toNum(t.entry), s = toNum(t.stop), o = toNum(t.target);
  if (e === null || s === null || o === null) return null;
  const riesgo = Math.abs(e - s);
  if (!riesgo) return null;
  return roundTo(Math.abs(o - e) / riesgo, 4);
}

/* R real de una operacion aunque el simbolo sea desconocido: es un cociente
   de precios, el multiplicador se cancela. */
function rRealApp(t) {
  const dir = dirOf(t.direction);
  const e = toNum(t.entry), s = toNum(t.stop), x = toNum(t.exit);
  if (e === null || s === null || x === null) return null;
  const riesgo = Math.abs(e - s);
  if (!riesgo) return null;
  return roundTo(((x - e) * dir) / riesgo, 4);
}

const QuantEngine = {
  /* contratos */ CONTRACTS, resolveContract, rootOf,
  /* operacion */ valuarOperacion, dirOf,
  /* ventaja   */ analizarEdge,
  /* curva     */ construirCurva, metricasCurva, evaluarConsistencia, DD_TIPOS,
  /* riesgo    */ simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha,
  /* excursion */ analizarExcursion, excursionDeOperacion,
  /* cartera   */ analizarCartera, irr, cagr,
  /* app       */ calcularTradeApp, rRealApp, rPlanApp, desdeTradeApp,
};

return { QE_VERSION, Ok, Err, isOk, addWarn, unwrapOr, allOk, isFiniteNum, toNum, toInt, toPosInt, clamp, sym, roundHalfAway, roundTo, toCents, fromCents, sumCents, rng, randInt, randNormal, normalQuantile, zFor, normalCDF, CONTRACTS, rootOf, resolveContract, listContracts, valuarOperacion, dimensionar, dirOf, limpiar, momentos, cuantil, mediana, forma, ciProporcion, ciMedia, bootstrapCI, muestraMinima, significanciaMedia, veredicto, UMBRALES, analizarEdge, DD_TIPOS, sueloPara, construirCurva, metricasCurva, evaluarConsistencia, RESULTADO, simularCuenta, barridoDeRiesgo, simularParametrico, probabilidadDeRacha, margenDePerdida, topeDeGanancia, margenDeDrawdown, desdeTradeApp, calcularTradeApp, rRealApp, rPlanApp, excursionDeOperacion, analizarExcursion, analizarCartera, irr, vpn, valorCapitalizado, cagr, fechaMs, aniosEntre };
})();
