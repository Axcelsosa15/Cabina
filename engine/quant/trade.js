/* =========================================================================
   QuantEngine · valuacion de operacion
   -------------------------------------------------------------------------
   P&L exacto en ticks enteros. Nunca (salida-entrada)*multiplicador en float:
   ese producto puede dar cifras que el contrato no puede producir. Aqui el
   movimiento se mide en ticks, el tick vale un entero de centavos, y el P&L
   es el producto de dos enteros. Cero deriva.
   Ademas detecta precios fuera de rejilla (tipeos) en vez de tragarlos.
   ========================================================================= */

import {
  Ok, Err, isOk, addWarn, toNum, toPosInt, toCents, fromCents, roundTo, sym,
} from "./kernel.js";
import { resolveContract } from "./contracts.js";

const TOL = 1e-6;

/* Cuantos ticks representa un precio, y si cae en la rejilla del contrato. */
function gridTicks(price, tickSize) {
  const t = price / tickSize;
  const r = Math.round(t);
  return { ticks: r, onGrid: Math.abs(t - r) <= Math.max(TOL, Math.abs(t) * TOL) };
}

/* Cuantos contratos representa el campo `cantidad`, y es la UNICA respuesta a esa
   pregunta en todo el sistema. Vacio o cero -> 1 (documentado en METRICAS.md);
   negativo -> su magnitud; fraccionario -> truncado, porque no existen 2,7
   contratos. La pestana Metricas/Edge tenia su propia version de esto
   (`Math.abs(qty) || 1`) que no coincidia con la del motor: ver el comentario
   largo dentro de valuarOperacion. */
export function contratosDe(cantidad) {
  const n = toNum(cantidad);
  return toPosInt(Math.abs(n ?? 0)) ?? 1;
}

export function dirOf(direction) {
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
export function valuarOperacion(op, opciones) {
  const o = op || {};
  const cfg = Object.assign({ incluirComisiones: true, overrides: null, permitirFueraDeRejilla: true }, opciones || {});

  const rc = resolveContract(o.simbolo, cfg.overrides);
  if (!isOk(rc)) return rc;
  const c = rc.value;

  /* ── CANTIDAD Y COMISION SON MAGNITUDES, NO CANTIDADES CON SIGNO ──────────
     La direccion la dice `direccion`, no el signo de los contratos; y una
     comision es un COSTE, no un cobro. Sin esto el signo de esos dos campos
     decidia dinero:

       · `comisionExtra: -25` -- un menos tecleado en «Comisiones $», que es el
         habito de cualquiera que apunte costes en negativo -- se SUMABA al P&L.
         Medido con MNQ, 10 puntos a favor, 1 contrato: bruto 20 USD, deberia
         quedar -5 USD con 25 de comision, y publicaba **+45 USD**. La R pasaba
         de -0,25R a **+2,25R**: cambio de SIGNO en el unico numero del que
         cuelgan la esperanza, el profit factor, el Monte Carlo y el colchon de
         la cuenta. Nada lo avisaba, y el editor no valida ese campo.
       · `contratos: -3` valia 1 contrato aqui (`toPosInt(-3)` es null) mientras
         la pestana Metricas/Edge ya hacia `Math.abs(qty)` para el riesgo. La
         MISMA operacion daba R = 1,00 en el journal y R = 0,33 en Metricas,
         porque el P&L se valuaba sobre 1 contrato y el riesgo sobre 3. El
         editor bloquea qty <= 0 desde el guardado, pero un respaldo importado y
         cualquier operacion anterior a esa guarda entran sin pasar por ahi.

     Es el mismo fallo que ya se habia corregido un campo mas alla, en el ledger
     de la cuenta: «el importe se lee SIEMPRE como magnitud; un retiro guardado
     como -500 sumaba 500 al balance». La definicion vive aqui, en el motor, asi
     que la app y las dos pestanas no pueden volver a discrepar. Y no se corrige
     en silencio: cada caso deja su aviso, que la interfaz ya pinta. */
  const contratosCrudos = toNum(o.contratos);
  const qty = contratosDe(o.contratos);
  const dir = dirOf(o.direccion);
  const entrada = toNum(o.entrada);
  const salida = toNum(o.salida);
  const stop = toNum(o.stop);
  const objetivo = toNum(o.objetivo);

  if (entrada === null) return Err("SIN_ENTRADA", "Falta el precio de entrada.", { simbolo: c.symbol });
  if (entrada <= 0) return Err("ENTRADA_INVALIDA", "El precio de entrada debe ser mayor que cero.", { entrada });

  const res = Ok(null);
  const warn = (code, msg, det) => addWarn(res, code, msg, det);

  /* --- signo de los campos que son magnitudes (ver arriba) --- */
  if (contratosCrudos !== null && contratosCrudos < 0) {
    warn("CANTIDAD_NEGATIVA", `Los contratos venian en negativo (${contratosCrudos}); se leen como ${qty}. La direccion la decide el campo de direccion, no el signo.`, { campo: "contratos", valor: contratosCrudos, usado: qty });
  }
  const extraCrudo = toNum(o.comisionExtra) ?? 0;
  const extra = Math.abs(extraCrudo);
  if (extraCrudo < 0) {
    warn("COMISION_NEGATIVA", `La comision venia en negativo (${extraCrudo}); se descuenta ${extra}. Una comision es un coste, nunca un cobro.`, { campo: "comisionExtra", valor: extraCrudo, usado: extra });
  }

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
  /* La del contrato tambien como magnitud: un `overrides` puede traerla negativa. */
  const comisionUnit = cfg.incluirComisiones ? Math.abs(toNum(c.commissionPerContract) ?? 0) : 0;
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
export function dimensionar(params, opciones) {
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

  /* EL MISMO CONTROL QUE valuarOperacion, Y FALTABA AQUI.
     `toCents` redondea al centavo, asi que un tick de 0,001 USD vale CERO
     centavos. Alla arriba eso devuelve TICK_SIN_VALOR; aqui no habia nada, y
     `riesgoPorContratoCents` salia 0. La division de abajo daba Infinity y la
     funcion respondia `ok: true` con **contratos: Infinity** y riesgoReal null:
     una funcion de dimensionamiento de posicion diciendo «compra infinitos
     contratos» y marcandolo como exito. `resolveContract` no lo filtra porque
     solo exige tickValue > 0, y 0,001 lo cumple.
     Hoy la app llama a dimensionar() sin `overrides`, asi que con los contratos
     de serie no se alcanza; pero el motor es publico (window.QuantEngine) y la
     asimetria entre las dos funciones era una trampa esperando a que alguien
     anada contratos a medida. */
  const tickCents = toCents(c.tickValue);
  if (tickCents === null || tickCents === 0) {
    return Err("TICK_SIN_VALOR", `El tick de ${c.symbol} no tiene valor monetario representable.`, { tickValue: c.tickValue });
  }

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
  const riesgoPorContratoCents = ticksRiesgo * tickCents;
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
    /* Un balance por debajo de medio centavo da toCents(balance) === 0, y el
       porcentaje seria una division por cero. Se dice null, que es la verdad. */
    riesgoPctReal: toCents(balance) ? roundTo(riesgoRealCents / toCents(balance), 6) : null,
    fraccional: roundTo(bruto, 4),
  });
  return res;
}
