/**
 * MathEngine.js — funciones puras de cálculo para una cuenta de fondeo.
 *
 * Puras de verdad: no leen reloj, ni DOM, ni variables globales, ni mutan sus
 * argumentos. La misma entrada da siempre la misma salida, que es lo que hace
 * que se puedan probar y que se pueda confiar en un número antes de arriesgar
 * dinero con él.
 *
 * Reglas de la casa:
 *  - El dinero se redondea UNA vez, al final. Redondear pasos intermedios y
 *    luego sumarlos mete error que crece con el número de operaciones.
 *  - Ninguna función inventa un dato que no tiene. Si falta el valor de punto
 *    o el stop, devuelve null y dice por qué en `error`, nunca un cero que
 *    parece un resultado.
 *  - Nada lanza excepciones por datos malos: se devuelve el error dentro del
 *    resultado. Una entrada mal escrita no debe tumbar la pantalla.
 *
 * Sin dependencias. ES modules; al final hay un export CommonJS opcional.
 */

/* ============================================================ *
 *  Utilidades numéricas
 * ============================================================ */

/** Número finito de verdad. "", null, undefined, NaN e Infinity NO lo son. */
export function esNumero(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n);
}

/** Convierte a número finito o devuelve null. Nunca devuelve NaN. */
export function num(v) {
  return esNumero(v) ? Number(v) : null;
}

/**
 * Redondea a `dec` decimales sin el sesgo del binario.
 * Math.round(1.005 * 100) / 100 da 1 en vez de 1.01 porque 1.005 no existe
 * exactamente en coma flotante. El epsilon corrige ese caso sin romper el resto.
 */
export function redondear(v, dec = 2) {
  const n = num(v);
  if (n === null) return null;
  const f = Math.pow(10, dec);
  const r = Math.round((n + (n >= 0 ? 1 : -1) * Number.EPSILON * Math.abs(n)) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Redondea dinero a centavos. */
export const dinero = (v) => redondear(v, 2);

/** Acota un número entre min y max. */
export function acotar(v, min, max) {
  const n = num(v);
  if (n === null) return null;
  return Math.min(max, Math.max(min, n));
}

/* ============================================================ *
 *  1. Configuración de instrumentos
 * ============================================================ */

/**
 * Valor de punto, tick y comisión por contrato.
 *
 * `multiplier` es USD por PUNTO completo, no por tick.
 *   valor del tick = multiplier * tickSize
 *   MNQ: 2 * 0.25 = $0.50 por tick.
 *
 * `commissionPerContract` es IDA Y VUELTA (round turn) por contrato: lo que te
 * cuesta abrir y cerrar uno. Es la convención más útil porque una operación
 * cerrada paga exactamente eso. Si tu bróker te cobra por lado, pon el doble.
 *
 * Las comisiones son las de TU bróker, no una constante del mercado: $1.50 en
 * MNQ es el dato que diste. Las demás están escaladas a eso y hay que
 * confirmarlas contra tu estado de cuenta antes de fiarse de un P&L neto.
 *
 * Los multiplicadores de CME son estables; los de BTC conviene verificarlos
 * contra la ficha del contrato vigente, porque ese producto ha cambiado de
 * especificación más de una vez.
 */
export const INSTRUMENTOS = Object.freeze({
  // índices
  MNQ: { symbol: "MNQ", nombre: "Micro E-mini Nasdaq-100", multiplier: 2,      tickSize: 0.25,    commissionPerContract: 1.5 },
  NQ:  { symbol: "NQ",  nombre: "E-mini Nasdaq-100",       multiplier: 20,     tickSize: 0.25,    commissionPerContract: 4.0 },
  MES: { symbol: "MES", nombre: "Micro E-mini S&P 500",    multiplier: 5,      tickSize: 0.25,    commissionPerContract: 1.5 },
  ES:  { symbol: "ES",  nombre: "E-mini S&P 500",          multiplier: 50,     tickSize: 0.25,    commissionPerContract: 4.0 },
  MYM: { symbol: "MYM", nombre: "Micro E-mini Dow",        multiplier: 0.5,    tickSize: 1,       commissionPerContract: 1.5 },
  YM:  { symbol: "YM",  nombre: "E-mini Dow",              multiplier: 5,      tickSize: 1,       commissionPerContract: 4.0 },
  M2K: { symbol: "M2K", nombre: "Micro E-mini Russell",    multiplier: 5,      tickSize: 0.1,     commissionPerContract: 1.5 },
  RTY: { symbol: "RTY", nombre: "E-mini Russell",          multiplier: 50,     tickSize: 0.1,     commissionPerContract: 4.0 },
  // metales y energía
  MGC: { symbol: "MGC", nombre: "Micro Oro",               multiplier: 10,     tickSize: 0.1,     commissionPerContract: 1.5 },
  GC:  { symbol: "GC",  nombre: "Oro",                     multiplier: 100,    tickSize: 0.1,     commissionPerContract: 4.0 },
  MCL: { symbol: "MCL", nombre: "Micro Crudo WTI",         multiplier: 100,    tickSize: 0.01,    commissionPerContract: 1.5 },
  CL:  { symbol: "CL",  nombre: "Crudo WTI",               multiplier: 1000,   tickSize: 0.01,    commissionPerContract: 4.0 },
  SIL: { symbol: "SIL", nombre: "Micro Plata (1.000 oz)",  multiplier: 1000,   tickSize: 0.005,   commissionPerContract: 1.5 },
  SI:  { symbol: "SI",  nombre: "Plata (5.000 oz)",        multiplier: 5000,   tickSize: 0.005,   commissionPerContract: 4.0 },
  // divisas
  M6E: { symbol: "M6E", nombre: "Micro EUR/USD",           multiplier: 12500,  tickSize: 0.0001,  commissionPerContract: 1.5 },
  "6E": { symbol: "6E", nombre: "EUR/USD",                 multiplier: 125000, tickSize: 0.00005, commissionPerContract: 4.0 },
  // cripto
  BTC: { symbol: "BTC", nombre: "CME Bitcoin (5 BTC)",     multiplier: 5,      tickSize: 5,       commissionPerContract: 10.0 },
  MBT: { symbol: "MBT", nombre: "Micro Bitcoin (0,1 BTC)", multiplier: 0.1,    tickSize: 5,       commissionPerContract: 2.5 },
});

/** Quita el mes/año de vencimiento: MNQZ5 -> MNQ, ESH26 -> ES. */
function raiz(symbol) {
  const s = String(symbol == null ? "" : symbol).trim().toUpperCase();
  if (!s) return "";
  if (INSTRUMENTOS[s]) return s;
  const sinVto = s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "");
  return INSTRUMENTOS[sinVto] ? sinVto : s;
}

/**
 * getInstrumentConfig(symbol)
 * @returns {{symbol,nombre,multiplier,tickSize,commissionPerContract,tickValue,conocido,error}}
 *
 * Un símbolo desconocido devuelve `conocido: false` y multiplier null — nunca
 * el multiplicador de otro instrumento. Suponer el valor de punto fabrica el
 * P&L de esa operación y, detrás, el balance y el drawdown.
 */
export function getInstrumentConfig(symbol, overrides = null) {
  const key = raiz(symbol);
  if (overrides && overrides[key]) {
    const o = overrides[key];
    return {
      symbol: key, nombre: o.nombre || key,
      multiplier: num(o.multiplier), tickSize: num(o.tickSize),
      commissionPerContract: num(o.commissionPerContract) ?? 0,
      tickValue: dinero((num(o.multiplier) || 0) * (num(o.tickSize) || 0)),
      conocido: esNumero(o.multiplier), error: null,
    };
  }
  const c = INSTRUMENTOS[key];
  if (!c) {
    return {
      symbol: key || null, nombre: null,
      multiplier: null, tickSize: null, commissionPerContract: null, tickValue: null,
      conocido: false,
      error: key ? `Sin valor de punto para «${key}». Pásalo en overrides o escribe el resultado a mano.` : "Falta el símbolo.",
    };
  }
  return { ...c, tickValue: dinero(c.multiplier * c.tickSize), conocido: true, error: null };
}

/* ============================================================ *
 *  2. P&L de una operación
 * ============================================================ */

/**
 * calculatePnL(direccion, precioEntrada, precioSalida, contratos, symbol, stopLoss?, opciones?)
 *
 * El stop es el SEXTO parámetro y es opcional: sin él no existe riesgo inicial,
 * y sin riesgo inicial no existe múltiplo R. Tu firma original pedía devolver
 * ambos sin recibir el stop; eso no se puede, así que se devuelven en null.
 *
 * `direccion`: "long" | "short" (también acepta "compra"/"venta", "buy"/"sell").
 *
 * rMultiple se calcula sobre el P&L NETO por defecto: una operación que sale
 * en el punto de entrada no es 0R, es ligeramente negativa, porque las
 * comisiones se pagan igual. Pon `{ rSobreBruto: true }` para la convención
 * de solo precio.
 *
 * @returns {{pnlBruto,comisiones,pnlNeto,rMultiple,riesgoInicialUSD,puntos,ok,error}}
 */
export function calculatePnL(direccion, precioEntrada, precioSalida, contratos, symbol, stopLoss = null, opciones = {}) {
  // Siete argumentos posicionales son una trampa: pasar {rSobreBruto:true} en el
  // sitio del stop se tragaba en silencio y el múltiplo R salía null sin decir
  // por qué. Si el 6º es un objeto, son las opciones y no hay stop.
  if (stopLoss !== null && typeof stopLoss === "object") { opciones = stopLoss; stopLoss = null; }
  const vacio = {
    pnlBruto: null, comisiones: null, pnlNeto: null,
    rMultiple: null, riesgoInicialUSD: null, puntos: null,
    ok: false, error: null,
  };

  const cfg = getInstrumentConfig(symbol, opciones.overrides);
  if (!cfg.conocido) return { ...vacio, error: cfg.error };

  const entrada = num(precioEntrada);
  const salida = num(precioSalida);
  const qty = num(contratos);
  const stop = num(stopLoss);

  if (entrada === null) return { ...vacio, error: "Falta el precio de entrada." };
  if (qty === null || qty <= 0) return { ...vacio, error: "Los contratos tienen que ser un número mayor que cero." };
  if (entrada <= 0) return { ...vacio, error: "El precio de entrada tiene que ser positivo." };

  const dirTxt = String(direccion == null ? "" : direccion).trim().toLowerCase();
  const esCorto = dirTxt === "short" || dirTxt === "venta" || dirTxt === "sell" || dirTxt === "s";
  const esLargo = dirTxt === "long" || dirTxt === "compra" || dirTxt === "buy" || dirTxt === "l";
  if (!esCorto && !esLargo) return { ...vacio, error: `Dirección no reconocida: «${direccion}». Usa "long" o "short".` };
  const dir = esCorto ? -1 : 1;

  // Riesgo inicial: existe en cuanto hay stop, esté la operación abierta o cerrada.
  let riesgoInicialUSD = null;
  if (stop !== null) {
    if (stop <= 0) return { ...vacio, error: "El stop tiene que ser positivo." };
    const distancia = Math.abs(entrada - stop);
    // Un stop en el precio de entrada no es riesgo cero: es que no hay stop.
    riesgoInicialUSD = distancia > 0 ? dinero(distancia * qty * cfg.multiplier) : null;
    if (riesgoInicialUSD === null && distancia === 0) {
      // se sigue adelante; solo desaparece el múltiplo R
    }
    // Coherencia: un stop al otro lado del precio no protege nada, lo garantiza.
    if (distancia > 0) {
      const stopMalPuesto = esCorto ? stop < entrada : stop > entrada;
      if (stopMalPuesto) {
        return { ...vacio, riesgoInicialUSD, error: `Stop imposible: en ${esCorto ? "short" : "long"} el stop va ${esCorto ? "por encima" : "por debajo"} de la entrada.` };
      }
    }
  }

  // Operación ABIERTA: no hay salida, así que no hay resultado. Cero no es lo mismo que nada.
  if (salida === null) {
    return { ...vacio, riesgoInicialUSD, ok: true, error: null, abierta: true, comisiones: dinero(qty * cfg.commissionPerContract) };
  }
  if (salida <= 0) return { ...vacio, riesgoInicialUSD, error: "El precio de salida tiene que ser positivo." };

  const puntos = (salida - entrada) * dir;
  const pnlBruto = puntos * qty * cfg.multiplier;
  const comisiones = qty * cfg.commissionPerContract;
  const pnlNeto = pnlBruto - comisiones;

  const base = opciones.rSobreBruto ? pnlBruto : pnlNeto;
  const rMultiple = riesgoInicialUSD ? redondear(base / riesgoInicialUSD, 2) : null;

  return {
    pnlBruto: dinero(pnlBruto),
    comisiones: dinero(comisiones),
    pnlNeto: dinero(pnlNeto),
    rMultiple,
    riesgoInicialUSD,
    puntos: redondear(puntos, 4),
    abierta: false,
    ok: true,
    error: null,
  };
}

/**
 * calculatePlannedR(precioEntrada, stopLoss, target)
 * R planeado antes de entrar: cuántas veces el riesgo vale el objetivo.
 * Vive aquí y no en la interfaz porque es la misma división que el R real,
 * y dos sitios distintos dividiendo lo mismo es como se separan los números.
 */
export function calculatePlannedR(precioEntrada, stopLoss, target) {
  const e = num(precioEntrada), s = num(stopLoss), tg = num(target);
  if (e === null || s === null || tg === null) return null;
  const riesgo = Math.abs(e - s);
  if (riesgo === 0) return null;          // stop en la entrada: no se divide por cero
  return redondear(Math.abs(tg - e) / riesgo, 2);
}

/**
 * calculateRealR(direccion, precioEntrada, precioSalida, stopLoss)
 * R real como PROPORCIÓN DE PRECIO: (salida-entrada)*dir / |entrada-stop|.
 *
 * No necesita el instrumento a propósito. El múltiplo R es adimensional: el
 * valor de punto está en el numerador y en el denominador y se cancela. Por eso
 * una operación en un símbolo sin multiplicador conocido SÍ tiene R aunque no
 * tenga P&L en dólares — y perder ese dato sería tirar información que existe.
 *
 * `calculatePnL().rMultiple` es la otra versión: la que divide dólares entre
 * dólares y por tanto sí puede descontar comisiones. Se usa una u otra según si
 * quieres el R del precio o el R de lo que acabó en la cuenta.
 */
export function calculateRealR(direccion, precioEntrada, precioSalida, stopLoss) {
  const e = num(precioEntrada), x = num(precioSalida), st = num(stopLoss);
  if (e === null || x === null || st === null) return null;
  const riesgo = Math.abs(e - st);
  if (riesgo === 0) return null;
  const d = String(direccion == null ? "" : direccion).trim().toLowerCase();
  const dir = (d === "short" || d === "venta" || d === "sell" || d === "s") ? -1 : 1;
  return redondear(((x - e) * dir) / riesgo, 2);
}

/* ============================================================ *
 *  3. Drawdown
 * ============================================================ */

export const DD_TIPOS = Object.freeze({
  ESTATICO: "estatico",              // el suelo no se mueve del balance inicial
  TRAILING: "trailing",              // el suelo sigue al pico, siempre
  TRAILING_BLOQUEADO: "trailing_lock", // sigue al pico hasta el balance inicial y se congela
});

/**
 * calculateDrawdown(balanceActual, picoBalanceAnterior, drawdownMaximo, opciones?)
 *
 * Tu firma solo permite drawdown TRAILING puro, porque no recibe el balance
 * inicial ni el tipo. Una evaluación con trailing BLOQUEADO: el suelo sube con el
 * pico hasta llegar al balance inicial y ahí se congela para siempre. Con tres
 * argumentos sale el trailing puro, que da un suelo MÁS ALTO que el real y por
 * tanto te dice que estás peor de lo que estás. Pasa `opciones` para el cálculo
 * correcto:
 *
 *   calculateDrawdown(25315, 25315, 1000, { tipo: "trailing_lock", balanceInicial: 25000 })
 *
 * @returns {{nuevoPico,drawdownUsado,sueloCuenta,estado,colchonRestante,utilizacion,ok,error}}
 */
export function calculateDrawdown(balanceActual, picoBalanceAnterior, drawdownMaximo, opciones = {}) {
  const vacio = {
    nuevoPico: null, drawdownUsado: null, sueloCuenta: null,
    estado: null, colchonRestante: null, utilizacion: null, ok: false, error: null,
  };

  const bal = num(balanceActual);
  const maxDD = num(drawdownMaximo);
  if (bal === null) return { ...vacio, error: "Falta el balance actual." };
  if (maxDD === null || maxDD <= 0) return { ...vacio, error: "El drawdown máximo tiene que ser mayor que cero." };

  const inicial = num(opciones.balanceInicial);
  const tipo = String(opciones.tipo || DD_TIPOS.TRAILING).trim();

  // El pico nunca baja. Si no venía uno, el propio balance lo inaugura.
  const picoPrevio = num(picoBalanceAnterior);
  const nuevoPico = picoPrevio === null ? bal : Math.max(picoPrevio, bal);

  let sueloCuenta;
  if (tipo === DD_TIPOS.ESTATICO) {
    if (inicial === null) return { ...vacio, error: "El drawdown estático necesita `balanceInicial`." };
    sueloCuenta = inicial - maxDD;
  } else if (tipo === DD_TIPOS.TRAILING_BLOQUEADO) {
    if (inicial === null) return { ...vacio, error: "El trailing bloqueado necesita `balanceInicial` para saber dónde congelarse." };
    sueloCuenta = Math.min(nuevoPico - maxDD, inicial);
  } else {
    sueloCuenta = nuevoPico - maxDD;
  }

  // Nunca negativo: si el balance está por encima del pico menos el drawdown,
  // el colchón puede ser mayor que el máximo (drawdown estático con cuenta en verde).
  const colchonRestante = Math.max(0, bal - sueloCuenta);
  const drawdownUsado = acotar(maxDD - colchonRestante, 0, maxDD);
  const utilizacion = maxDD > 0 ? redondear(drawdownUsado / maxDD, 4) : 0;
  const roto = bal <= sueloCuenta;

  return {
    nuevoPico: dinero(nuevoPico),
    drawdownUsado: dinero(drawdownUsado),
    sueloCuenta: dinero(sueloCuenta),
    estado: roto ? "BLOQUEADA" : "ACTIVA",
    colchonRestante: dinero(colchonRestante),
    utilizacion,
    ok: true,
    error: null,
  };
}

/* ============================================================ *
 *  4. Consistencia
 * ============================================================ */

/**
 * calculateConsistency(dailySessions, opciones?)
 *
 * consistencia = mejorDia / gananciaTotal
 * totalNecesario = mejorDia / limite
 * faltante = max(0, totalNecesario - gananciaTotal)
 *
 * `dailySessions` acepta las dos formas:
 *   { "2026-09-15": 170, "2026-09-16": 145 }
 *   [ { date: "2026-09-15", pnl: 170 }, ... ]
 *
 * El "mejor día" es el mejor día VERDE. Si todos los días son rojos no hay
 * mejor día que limitar y la regla todavía no aplica: eso no es cumplirla.
 *
 * `estado` aquí es RESTRINGIDA en el sentido de la firma: bloquea retirar o
 * pasar la evaluación. NO impide operar — eso lo deciden el drawdown y el
 * límite de pérdida diaria, no esta regla.
 *
 * @returns {{mejorDia,gananciaTotal,consistenciaPorcentaje,dineroFaltanteParaRetiro,estado,totalNecesario,diaMaximoPermitido,limite,diasVerdes,ok,error}}
 */
export function calculateConsistency(dailySessions, opciones = {}) {
  const vacio = {
    mejorDia: null, gananciaTotal: null, consistenciaPorcentaje: null,
    dineroFaltanteParaRetiro: null, estado: null, totalNecesario: null,
    diaMaximoPermitido: null, limite: null, diasVerdes: 0, ok: false, error: null,
  };

  // Límite en tanto por uno. Acepta 30 y 0.30 como lo mismo.
  let limite = num(opciones.limitePorcentaje);
  if (limite === null) limite = 0.30;
  if (limite > 1) limite = limite / 100;
  limite = acotar(limite, 0.01, 0.99);

  let pares = [];
  if (Array.isArray(dailySessions)) {
    pares = dailySessions
      .filter((x) => x && typeof x === "object")
      .map((x) => [String(x.date ?? x.fecha ?? ""), num(x.pnl ?? x.resultado ?? x.result)]);
  } else if (dailySessions && typeof dailySessions === "object") {
    pares = Object.keys(dailySessions).map((k) => [k, num(dailySessions[k])]);
  } else {
    return { ...vacio, limite, error: "dailySessions tiene que ser un objeto { fecha: pnl } o una lista." };
  }
  pares = pares.filter(([, v]) => v !== null);

  if (!pares.length) {
    return { ...vacio, limite, gananciaTotal: 0, mejorDia: 0, estado: "ACTIVA", ok: true,
      error: null, nota: "Sin días registrados: la regla todavía no tiene nada que medir." };
  }

  const gananciaTotal = dinero(pares.reduce((s, [, v]) => s + v, 0));
  const verdes = pares.filter(([, v]) => v > 0);
  const mejorDia = dinero(verdes.length ? Math.max(...verdes.map(([, v]) => v)) : 0);

  // Sin ganancia acumulada positiva el cociente no significa nada: dividir por
  // cero o por un número negativo da un porcentaje que engaña.
  if (gananciaTotal <= 0 || mejorDia <= 0) {
    return {
      ...vacio, limite, mejorDia, gananciaTotal, diasVerdes: verdes.length,
      consistenciaPorcentaje: null,
      totalNecesario: mejorDia > 0 ? dinero(mejorDia / limite) : 0,
      dineroFaltanteParaRetiro: mejorDia > 0 ? dinero(mejorDia / limite - gananciaTotal) : 0,
      diaMaximoPermitido: 0,
      estado: "ACTIVA",
      ok: true, error: null,
      nota: gananciaTotal <= 0
        ? "La cuenta no está en ganancia: la regla de consistencia todavía no aplica."
        : "Sin ningún día verde no hay mejor día que limitar.",
    };
  }

  const ratio = mejorDia / gananciaTotal;
  const totalNecesario = dinero(mejorDia / limite);
  const faltante = dinero(Math.max(0, totalNecesario - gananciaTotal));
  // El día más grande que aún cumpliría, contando que ese día también suma al total:
  //   d / (total + d) <= limite  ->  d <= limite*total / (1-limite)
  const diaMaximoPermitido = dinero((limite * gananciaTotal) / (1 - limite));

  return {
    mejorDia,
    gananciaTotal,
    consistenciaPorcentaje: redondear(ratio * 100, 2),
    dineroFaltanteParaRetiro: faltante,
    estado: ratio > limite ? "RESTRINGIDA" : "ACTIVA",
    totalNecesario,
    diaMaximoPermitido,
    limite,
    diasVerdes: verdes.length,
    ok: true,
    error: null,
  };
}

/* ============================================================ *
 *  5. Tamaño de posición
 * ============================================================ */

/**
 * calculatePositionSize(balanceActual, precioEntrada, stopLoss, symbol, porcentajeRiesgo = 0.01, opciones?)
 *
 * Devuelve los contratos ENTEROS que caben dentro del riesgo. Siempre hacia
 * abajo: redondear hacia arriba te hace arriesgar más de lo que decidiste.
 *
 * Aviso de fondo: en una cuenta de fondeo el 1% del balance casi nunca es el
 * límite que manda. Si te quedan $300 de colchón antes del suelo, arriesgar
 * $253 porque "es el 1% de $25.315" es cómo se queman las cuentas. Pasa
 * `colchonRestante` y/o `perdidaMaximaDiariaRestante` y se usa el MENOR de los
 * tres topes; `limitante` dice cuál mandó.
 *
 * @returns {{contratos,riesgoPorContrato,riesgoTotal,riesgoPermitido,limitante,distanciaPuntos,ok,error}}
 */
export function calculatePositionSize(balanceActual, precioEntrada, stopLoss, symbol, porcentajeRiesgo = 0.01, opciones = {}) {
  const vacio = {
    contratos: 0, riesgoPorContrato: null, riesgoTotal: null,
    riesgoPermitido: null, limitante: null, distanciaPuntos: null, ok: false, error: null,
  };

  const cfg = getInstrumentConfig(symbol, opciones.overrides);
  if (!cfg.conocido) return { ...vacio, error: cfg.error };

  const bal = num(balanceActual);
  const entrada = num(precioEntrada);
  const stop = num(stopLoss);

  if (bal === null || bal <= 0) return { ...vacio, error: "El balance tiene que ser mayor que cero." };
  if (entrada === null || entrada <= 0) return { ...vacio, error: "Falta el precio de entrada." };
  // Sin stop no hay tamaño que calcular: el riesgo sería infinito, no cero.
  if (stop === null) return { ...vacio, error: "Sin stop no se puede dimensionar: el riesgo por contrato sería desconocido." };
  if (stop <= 0) return { ...vacio, error: "El stop tiene que ser positivo." };

  const distanciaPuntos = Math.abs(entrada - stop);
  if (distanciaPuntos === 0) return { ...vacio, distanciaPuntos: 0, error: "El stop está en el precio de entrada: la distancia es cero y no se puede dividir." };

  /* `1` se interpreta como 1%, no como el 100% del balance. Nadie arriesga la
     cuenta entera en una operación, y un dedazo con esa lectura devolvía 253
     contratos. Se pierde poder escribir "100%", que es justo lo que hay que
     perder. Por debajo de 1 se lee como tanto por uno: 0.01 = 1%. */
  let pct = num(porcentajeRiesgo);
  if (pct === null) pct = 0.01;
  if (pct >= 1) pct = pct / 100;
  pct = acotar(pct, 0, 0.99);

  const riesgoPorContrato = dinero(distanciaPuntos * cfg.multiplier);
  if (riesgoPorContrato <= 0) return { ...vacio, distanciaPuntos, error: "El riesgo por contrato sale cero o negativo." };

  // Tres topes; manda el más pequeño.
  const topes = [{ k: "porcentaje del balance", v: bal * pct }];
  const colchon = num(opciones.colchonRestante);
  if (colchon !== null) topes.push({ k: "colchón de drawdown", v: Math.max(0, colchon) });
  const diario = num(opciones.perdidaMaximaDiariaRestante);
  if (diario !== null) topes.push({ k: "pérdida diaria restante", v: Math.max(0, diario) });

  const ganador = topes.reduce((a, b) => (b.v < a.v ? b : a));
  const riesgoPermitido = dinero(ganador.v);

  let contratos = Math.floor(riesgoPermitido / riesgoPorContrato);
  if (!Number.isFinite(contratos) || contratos < 0) contratos = 0;

  const maxCtos = num(opciones.maxContratos);
  let limitante = ganador.k;
  if (maxCtos !== null && maxCtos >= 0 && contratos > maxCtos) {
    contratos = Math.floor(maxCtos);
    limitante = "regla de contratos máximos";
  }

  return {
    contratos,
    riesgoPorContrato,
    riesgoTotal: dinero(contratos * riesgoPorContrato),
    riesgoPermitido,
    limitante: contratos > 0 ? limitante : null,
    distanciaPuntos: redondear(distanciaPuntos, 4),
    ok: true,
    error: contratos === 0
      ? `Ni un contrato entra: arriesgas ${riesgoPorContrato} por contrato y el tope es ${riesgoPermitido} (${ganador.k}).`
      : null,
  };
}

/* ============================================================ *
 *  Export CommonJS opcional (Node sin ESM)
 * ============================================================ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    esNumero, num, redondear, dinero, acotar,
    INSTRUMENTOS, getInstrumentConfig,
    calculatePnL, calculatePlannedR, calculateRealR, DD_TIPOS, calculateDrawdown,
    calculateConsistency, calculatePositionSize,
  };
}
