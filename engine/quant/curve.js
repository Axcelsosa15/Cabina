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

import { Ok, Err, toNum, toCents, fromCents, roundTo, clamp } from "./kernel.js";
import { momentos, cuantil } from "./stats.js";

export const DD_TIPOS = Object.freeze({ ESTATICO: "estatico", TRAILING: "trailing", TRAILING_BLOQUEADO: "trailing_lock" });

/* Suelo segun el tipo de drawdown. Es la unica definicion en todo el motor.
   trailing_lock: sigue al pico hasta que el pico alcanza el tamano inicial,
   y ahi se congela en el tamano inicial -> min(pico - dd, inicial). */
export function sueloPara(tipo, saldoInicial, pico, maximo) {
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
export function construirCurva(operaciones, opciones) {
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
export function metricasCurva(curva, opciones) {
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
export function evaluarConsistencia(diarios, limitePct, opciones) {
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
