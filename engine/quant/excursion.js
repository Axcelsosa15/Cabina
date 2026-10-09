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

import { Ok, Err, toNum, roundTo } from "./kernel.js";
import { cuantil, momentos, veredicto, UMBRALES } from "./stats.js";
import { resolveContract } from "./contracts.js";
import { dirOf } from "./trade.js";

/* Excursion de UNA operacion, normalizada a R (la unidad comparable entre
   instrumentos y tamanos). Devuelve null en los campos que no se puedan medir;
   nunca un cero que se confunda con "no fue en contra". */
export function excursionDeOperacion(op, opciones) {
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
export function analizarExcursion(operaciones, opciones) {
  const cfg = Object.assign({ overrides: null, supervivencia: 0.95 }, opciones || {});
  const filas = (operaciones || []).map(o => excursionDeOperacion(o, cfg)).filter(Boolean);

  const conMAE = filas.filter(f => f.usoDelStop !== null && f.ganadora !== null);
  const conMFE = filas.filter(f => f.capturaMFE !== null);
  const ganadoras = conMAE.filter(f => f.ganadora);

  /* EL VEREDICTO SE CALCULA SOBRE LA MUESTRA QUE DE VERDAD SE USA.
     Aqui habia `vdMae = veredicto(conMAE.length)` y `vdMfe = veredicto(conMFE.length)`,
     calculados ANTES de saber sobre que operaciones se iba a medir cada cosa.
     `salida` ya lo hacia bien —se calcula su propio `vdG` sobre `ganMFE`— y
     `vdMfe` se quedo sin usar: el fosil del fallo.

     Que fallo, medido: 30 operaciones con MAE de las que solo SEIS son
     ganadoras. El cuantil p95 del uso del stop se calcula sobre esas seis, pero
     el veredicto venia de las 30:

       stop  -> n=6, fiable=TRUE,  razon "n=30: utilizable"   recorteSugerido 0.8
       salida-> n=6, fiable=false, razon "n=6: esto es ruido"

     Dos campos del MISMO objeto, de las MISMAS seis operaciones, con veredictos
     opuestos. Y el equivocado era el que aconseja apretar el stop un 80%: la app
     dejaba de atenuar la tarjeta y se callaba la nota de cautela (las dos miran
     `fiable`), asi que presentaba como fiable un cambio de gestion de riesgo
     sacado de seis operaciones. */

  /* ---- ¿cuanto podria apretar el stop? ----
     El cuantil alto del MAE de las GANADORAS es la respuesta directa: si el
     95% de tus ganadoras nunca paso del 60% del stop, el 40% restante del
     stop no te esta protegiendo de nada, solo esta pagando mas por operacion.
     Se mide solo sobre ganadoras a proposito: en las perdedoras el MAE acaba
     siendo el stop por definicion, y meterlas contaminaria la conclusion. */
  let stop = null;
  if (ganadoras.length >= 5) {
    const vdStop = veredicto(ganadoras.length);
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
      fiable: vdStop.fiable,
      veredicto: vdStop,
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
