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

import { Ok, Err, toNum, toPosInt, roundTo, rng, randInt } from "./kernel.js";
import { cuantil, momentos } from "./stats.js";
import { DD_TIPOS, sueloPara } from "./curve.js";

export const RESULTADO = Object.freeze({ PASADA: "pasada", QUEMADA: "quemada", SIN_RESOLVER: "sin_resolver" });

export function simularCuenta(opciones) {
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
export function barridoDeRiesgo(opciones, tamanos) {
  const lista = (tamanos && tamanos.length ? tamanos : [0.25, 0.5, 0.75, 1, 1.5, 2, 3]);
  const baseRiesgo = toNum(opciones && opciones.riesgoPorOperacion);
  if (baseRiesgo === null || baseRiesgo <= 0) return Err("SIN_RIESGO", "Falta el valor en USD de 1R.");
  const filas = [];
  let nCaminos = 0;
  for (const mult of lista) {
    const r = simularCuenta(Object.assign({}, opciones, { riesgoPorOperacion: baseRiesgo * mult }));
    if (!r.ok) return r;
    nCaminos = r.value.caminos;
    filas.push({ multiplicador: mult, riesgo: roundTo(baseRiesgo * mult, 2),
                 pPasar: r.value.pPasar, pQuemar: r.value.pQuemar,
                 diasPasarMediana: r.value.diasPasarMediana });
  }

  /* NO SE RECOMIENDA UN TAMANO DE POSICION SOBRE RUIDO.
     Antes: `optimo` era simplemente el mayor pPasar. Pero pPasar es una
     estimacion de Monte Carlo y este mismo fichero ya lo dice veinte lineas mas
     arriba: con pocos caminos la resolucion no da para afirmar diferencias
     pequenas. Elegir por una diferencia menor que el propio error estandar es
     exactamente eso.

     Que fallo, medido (la app llama a esto con caminos=1200, error +-1,4 puntos;
     con semilla 34, objetivo 7000, 30 dias y 800 caminos, error +-1,8):

       2x    pPasar 0.5288   pQuemar 0.46
       1.5x  pPasar 0.5250   pQuemar 0.42

     El criterio viejo marcaba 2x como `best` en la tabla. Gana por 0,38 puntos
     de pPasar —la quinta parte del error estandar, o sea nada— y quema CUATRO
     PUNTOS mas a menudo. La fila buena estaba justo al lado, con su pQuemar a la
     vista, y la app resaltaba la otra.

     Asi que entre los tamanos cuyo pPasar NO se distingue del mejor (dentro de
     un error estandar) se elige el que menos quema; a igualdad, el menor, que es
     el orden en que llega la lista. Esto no cambia que `optimo` sea el mejor
     tamano: deja de romper un empate inventandose precision que el metodo no
     tiene. Con una ventaja positiva pPasar decrece con el tamano, no hay empate
     y sale el mismo de antes. */
  const mejorP = filas.reduce((m, f) => (f.pPasar > m ? f.pPasar : m), -1);
  const banda = nCaminos > 0 ? Math.sqrt(Math.max(mejorP * (1 - mejorP), 0) / nCaminos) : 0;
  const empatados = filas.filter(f => f.pPasar >= mejorP - banda);
  let optimo = null;
  for (const f of empatados) if (!optimo || f.pQuemar < optimo.pQuemar) optimo = f;
  return Ok({ filas, optimo, bandaPPasar: roundTo(banda, 5), nEmpatados: empatados.length });
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

export function simularParametrico(opciones) {
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
export function probabilidadDeRacha(probPerdida, k, n) {
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
