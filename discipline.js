/* CabinaDiscipline · proceso documentado, sin premios por dinero ni frecuencia.
 * Script sin dependencias: window.CabinaDiscipline en navegador y
 * globalThis.CabinaDiscipline tras `await import('../discipline.js')` en Node.
 *
 * scoreTrade(trade, { day, rulesSnapshot, now })
 *   Cinco criterios de 20 puntos: preparación, riesgo escrito, condiciones,
 *   reglas documentadas y revisión. Estado pass/fail/unknown/na; coverage 0..1.
 *   `na` es NO APLICABLE, no un hueco: pesa 0 y sale del denominador, así que
 *   possiblePoints es 100 o 80 y score se normaliza a 0..100. Lo usa preparación
 *   cuando la hora de entrada cae fuera de las franjas que la app prepara con
 *   lista propia (PREPARABLES): pedir una pre-sesión que el usuario no puede
 *   guardar dejaba esas operaciones sin puntuar para siempre.
 *   score/stars son null con datos desconocidos, fuente retrospectiva, o trade
 *   abierto. confirmedPoints informa sólo lo documentado, sin rellenar huecos.
 *   rulesSnapshot: { status:'pass'|'fail'|'unknown' } O
 *   { maxContracts, instruments:[], window:{start,end,days:[]} }. También se lee
 *   trade.processRules si existe. No se consultan reglas actuales ni el P&L.
 *   Los campos de riesgo/condiciones no prueban que se escribieron antes de operar.
 *
 * summarize({trades:[], days:[]|{fecha:dia}, today:'AAAA-MM-DD', now:epochMs})
 *   Devuelve days, totalXP, level, streaks, tradeScores, milestones, shareSummary.
 *   XP por fecha: checklist guardada completa 10, cierre con nota 5, decisión
 *   no_edge explícita y sin operaciones 5; máximo 20. Duplicados no suman.
 *   Hoy sólo entra en rachas al cerrar. Fines de semana sin actividad se saltan;
 *   huecos laborables rompen. Sin sello válido no se presume una acción hecha.
 *
 * weekSummary(mismoInput + {weekStart?})
 *   Lunes a domingo de la fecha ET, sólo días transcurridos. Agregados de proceso
 *   y criterio fallido más frecuente; shareSummary usa una lista explícita de
 *   campos seguros, sin IDs, cuentas, instrumentos, notas, P&L ni importes.
 *
 * Funciones sin escrituras ni mutaciones. Pase now/today para reproducción exacta.
 * Un registro declarado no es verificación independiente del bróker.
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const DAY_MS = 86400000;
  const ET = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const LABELS = Object.freeze({
    preparation: 'Pre-sesión completa antes de entrar',
    risk: 'Stop e invalidación documentados',
    conditions: 'Cuatro condiciones registradas',
    rules: 'Reglas de entrada documentadas',
    review: 'Salida revisada según el plan',
  });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const text = v => typeof v === 'string' && v.trim().length > 0;
  const number = v => ['number', 'string'].includes(typeof v) && v !== '' &&
    !(typeof v === 'string' && !v.trim()) && Number.isFinite(Number(v)) ? Number(v) : null;
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }
  function dateMs(v) { return validDate(v) ? Date.parse(v + 'T00:00:00Z') : null; }
  function shift(v, n) { return new Date(dateMs(v) + n * DAY_MS).toISOString().slice(0, 10); }
  function weekday(v) { return new Date(dateMs(v)).getUTCDay(); }
  function etStamp(v) {
    const n = number(v); if (n === null || n <= 0) return null;
    const d = new Date(n); if (!Number.isFinite(d.getTime())) return null;
    const p = {};
    for (const x of ET.formatToParts(d)) p[x.type] = x.value;
    return { date: p.year + '-' + p.month + '-' + p.day, minute: Number(p.hour) % 24 * 60 + Number(p.minute) };
  }
  function minute(v) {
    const m = typeof v === 'string' && v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function session(m) {
    if (m === null) return null;
    if (m >= 1200 || m < 120) return 'asia';
    if (m < 420) return 'londres';
    if (m < 510) return 'premkt';
    if (m < 660) return 'nyam';
    if (m < 810) return 'lunch';
    if (m < 960) return 'nypm';
    if (m < 1020) return 'cierre';
    return 'pausa';
  }
  // LAS FRANJAS QUE LA APLICACION PREPARA CON SU PROPIA LISTA. app.js las marca
  // con `pre: true` en SESSIONS, y `sesSel()` NUNCA devuelve una que no lo este:
  // por eso `day.pres` no recibe jamas una clave de las otras tres —`premkt`,
  // `cierre` y `pausa`—. Esta lista existe porque `preparation()` si calcula esas
  // franjas, y sin ella pedia una pre-sesion que el usuario no puede guardar.
  // Que no divergan de SESSIONS lo exige test/disciplina-franjas.mjs contra
  // app.js, minuto a minuto, no la memoria de nadie.
  const PREPARABLES = Object.freeze(['asia', 'londres', 'nyam', 'lunch', 'nypm']);
  const preparable = id => PREPARABLES.includes(id);
  function context(input) {
    const n = number(input && input.now);
    const now = n !== null && n > 0 ? n : Date.now();
    const today = validDate(input && input.today) ? input.today : etStamp(now).date;
    return { now, today };
  }
  function stampOnDay(at, date, ctx) {
    const n = number(at), s = etStamp(at);
    return !!s && s.date === date && n <= ctx.now && date <= ctx.today;
  }
  function snapshots(day) {
    if (!day || typeof day !== 'object') return [];
    const p = day.pres && typeof day.pres === 'object' && !Array.isArray(day.pres)
      ? Object.entries(day.pres).map(([id, v]) => ({ id, value: v })) : [];
    if (!p.length && day.pre && typeof day.pre === 'object')
      p.push({ id: day.pre.ses || session((etStamp(day.pre.at) || {}).minute ?? null), value: day.pre });
    return p;
  }
  function snapshotStatus(pre) {
    if (!pre || !Array.isArray(pre.items) || !pre.items.length ||
        !pre.items.every(x => x && typeof x === 'object' && typeof x.ok === 'boolean')) return 'unknown';
    return pre.items.every(x => x.ok === true) ? 'pass' : 'fail';
  }
  // Un criterio NO APLICABLE no es un hueco: no se puede comprobar porque no hay
  // nada que comprobar. Pesa 0, asi que sale del denominador en vez de restar.
  function criterion(key, status, reason) {
    const weight = status === 'na' ? 0 : 20;
    return { key, label: LABELS[key], status, reason, weight, points: status === 'pass' ? 20 : 0 };
  }
  function preparation(t, day, ctx) {
    const m = minute(t.time);
    if (!validDate(t.date) || m === null) return criterion('preparation', 'unknown', 'Falta fecha u hora de entrada válida en Nueva York.');
    const ses = session(m);
    // Fuera de una franja con lista propia no hay preparacion que comprobar, y
    // pedirla dejaba la operacion sin puntuar para siempre por una franja que el
    // usuario no eligio: la app no ofrece checklist para pre-mercado, cierre ni
    // pausa, asi que el motivo «no hay pre-sesion guardada» era insatisfacible.
    if (!preparable(ses))
      return criterion('preparation', 'na', 'La franja de entrada no tiene lista de pre-sesión propia en Cabina, así que no hay preparación previa que comprobar.');
    const candidates = snapshots(day).filter(x => x.id === ses);
    if (!candidates.length) return criterion('preparation', 'unknown', 'No hay una pre-sesión guardada para esta sesión.');
    const p = candidates[0].value, st = snapshotStatus(p), stamp = etStamp(p && p.at);
    if (st === 'unknown' || !stamp || !stampOnDay(p.at, t.date, ctx))
      return criterion('preparation', 'unknown', 'La lista guardada no tiene elementos o sello temporal comprobables.');
    if (stamp.minute >= m) return criterion('preparation', 'unknown', 'No consta que se guardara antes de la entrada; la hora de entrada sólo tiene minutos.');
    return criterion('preparation', st, st === 'pass' ? 'Todos los pasos de la lista congelada están marcados antes de entrar.' : 'La lista congelada antes de entrar tenía pasos sin marcar.');
  }
  function risk(t) {
    const entry = number(t.entry), stop = number(t.stop), qty = number(t.qty);
    if (entry === null || stop === null || qty === null || !['long', 'short'].includes(t.direction) || !own(t, 'invalida'))
      return criterion('risk', 'unknown', 'Falta entrada, stop, cantidad, dirección o invalidación registrada.');
    const goodStop = t.direction === 'short' ? stop > entry : stop < entry;
    const good = qty > 0 && Number.isInteger(qty) && goodStop && text(t.invalida);
    return criterion('risk', good ? 'pass' : 'fail', good ? 'Stop coherente, cantidad e invalidación escritos; no prueba cuándo se escribieron.' : 'El stop, la cantidad o la invalidación escrita no son coherentes.');
  }
  function conditions(t) {
    const values = ['cStruct', 'cPull', 'cWindow', 'cSize'].map(k => t[k]);
    if (values.some(x => x === false)) return criterion('conditions', 'fail', 'Hay al menos una condición declarada sin cumplir.');
    if (!values.every(x => x === true)) return criterion('conditions', 'unknown', 'No están registradas las cuatro condiciones de entrada.');
    return criterion('conditions', 'pass', 'Las cuatro condiciones están declaradas; no es verificación externa ni prueba temporal.');
  }
  function rules(t, snapshot) {
    if (Array.isArray(t.offProtocol) && t.offProtocol.length)
      return criterion('rules', 'fail', 'El registro conserva una entrada fuera de protocolo.');
    if (!snapshot || typeof snapshot !== 'object') return criterion('rules', 'unknown', 'No hay una evaluación de reglas guardada con esta operación.');
    if (['pass', 'fail', 'unknown'].includes(snapshot.status))
      return criterion('rules', snapshot.status, snapshot.status === 'pass' ? 'La evaluación guardada declara las reglas cumplidas.' : snapshot.status === 'fail' ? 'La evaluación guardada documenta una regla incumplida.' : 'La evaluación guardada no permite comprobar las reglas.');
    const max = number(snapshot.maxContracts), qty = number(t.qty),
      list = Array.isArray(snapshot.instruments) ? snapshot.instruments.map(x => String(x).trim().toUpperCase()).filter(Boolean) : null,
      w = snapshot.window, m = minute(t.time);
    let known = 0, failed = false, unknown = false;
    if (max !== null && max > 0) { known++; if (qty === null || qty <= 0) unknown = true; else if (Math.abs(qty) > max) failed = true; }
    if (list && list.length) { known++; if (!text(t.instrument)) unknown = true; else if (!list.includes(t.instrument.trim().toUpperCase())) failed = true; }
    if (w && number(w.start) !== null && number(w.end) !== null && Array.isArray(w.days)) {
      known++;
      if (m === null || !validDate(t.date)) unknown = true;
      else if (m < Number(w.start) || m >= Number(w.end) || !w.days.includes(weekday(t.date))) failed = true;
    }
    return criterion('rules', failed ? 'fail' : !known || unknown ? 'unknown' : 'pass',
      failed ? 'La operación incumple al menos una regla del registro guardado.' : !known || unknown ? 'Falta una regla configurada o un dato para evaluarla.' : 'Cumple los límites configurados del registro guardado; no se aplican las reglas de hoy.');
  }
  function review(t) {
    if (t.exitWhy === 'nervios' || ['antes', 'tarde'].includes(t.plan))
      return criterion('review', 'fail', 'La revisión declara una salida por nervios o una desviación de la invalidación.');
    if (!['cumpli', 'no_hizo_falta'].includes(t.plan)) return criterion('review', 'unknown', 'Falta registrar si se respetó la invalidación al salir.');
    return criterion('review', 'pass', 'La revisión declara una salida según la invalidación o el plan.');
  }
  function closedTrade(t) { return number(t.exit) !== null || number(t.pnl) !== null || number(t.pnlEff) !== null; }
  function scoreTrade(trade, options) {
    const t = trade && typeof trade === 'object' ? trade : {}, opts = options || {}, ctx = context(opts);
    const retrospective = t.source === 'quick_add' || /^import:/.test(String(t.source || ''));
    let prep = preparation(t, opts.day, ctx);
    if (retrospective) prep = criterion('preparation', 'unknown', 'Registro retrospectivo: no se puede comprobar la preparación previa de esta operación.');
    const criteria = [prep, risk(t), conditions(t), rules(t, opts.rulesSnapshot || t.processRules), review(t)];
    // Solo lo aplicable entra en cobertura y en el denominador. Con los cinco
    // criterios aplicables esto da exactamente lo de antes —confirmedPoints sobre
    // 100—, asi que la escala 0..100 no cambia de significado; con cuatro, un
    // registro impecable sigue siendo 100 y no 80, que seria penalizar la franja.
    const applicable = criteria.filter(x => x.status !== 'na');
    const known = applicable.filter(x => x.status !== 'unknown').length;
    const confirmedPoints = criteria.reduce((s, x) => s + x.points, 0);
    const possiblePoints = applicable.reduce((s, x) => s + x.weight, 0);
    const closed = closedTrade(t), complete = known === applicable.length && closed && !retrospective;
    const score = complete && possiblePoints > 0 ? Math.round(confirmedPoints / possiblePoints * 100) : null;
    return {
      id: typeof t.id === 'string' ? t.id : null, date: validDate(t.date) ? t.date : null,
      status: !closed ? 'open' : complete ? 'scored' : 'insufficient',
      closed, retrospective, criteria,
      coverage: applicable.length ? known / applicable.length : 1,
      confirmedPoints, possiblePoints, score,
      stars: score === null ? null : Math.max(1, Math.ceil(score / 20)),
    };
  }
  function canonicalDays(days) {
    const arr = Array.isArray(days) ? days : days && typeof days === 'object'
      ? Object.entries(days).map(([date, d]) => Object.assign({ date }, d)) : [];
    const map = new Map();
    for (const d of arr) {
      if (!d || !validDate(d.date)) continue;
      const prev = map.get(d.date);
      if (!prev || (number(d.updatedAt) || 0) >= (number(prev.updatedAt) || 0)) map.set(d.date, d);
    }
    return map;
  }
  function canonicalTrades(trades) {
    const map = new Map();
    for (const t of Array.isArray(trades) ? trades : []) {
      if (!t || t.type && t.type !== 'futuros') continue;
      const id = typeof t.id === 'string' && t.id ? 'id:' + t.id : 'row:' + JSON.stringify([
        t.date, t.time, t.instrument, t.direction, t.qty, t.entry, t.exit, t.source,
      ]);
      const prev = map.get(id);
      if (!prev || (number(t.updatedAt) || 0) >= (number(prev.updatedAt) || 0)) map.set(id, t);
    }
    return Array.from(map.values());
  }
  function dailyRecord(d, trades, ctx) {
    const date = d.date, valid = date <= ctx.today;
    const pre = snapshots(d).filter(x => x.value && stampOnDay(x.value.at, date, ctx));
    const checklistComplete = valid && pre.some(x => snapshotStatus(x.value) === 'pass');
    const journalComplete = valid && d.closed === true && text(d.note);
    const decision = d.processDecision;
    // El journal no es la única vía para registrar actividad: el panel diario
    // permite apuntar operaciones y resultado manuales. No constan sus trades,
    // pero tampoco consta un día vacío al que atribuir el bonus de no operar.
    const manualActivity = (number(d.trades) || 0) > 0 || !!d.resultManual && d.result != null;
    const noEdge = valid && !!decision && decision.kind === 'no_edge' && stampOnDay(decision.at, date, ctx) && trades.length === 0 && !manualActivity;
    const xp = (checklistComplete ? 10 : 0) + (journalComplete ? 5 : 0) + (noEdge ? 5 : 0);
    return {
      date, xp, points: xp, checklistComplete, journalComplete, noEdge,
      closed: d.closed === true, tradeCount: trades.length,
      decisionRecorded: !!decision && stampOnDay(decision.at, date, ctx),
      checklistStatus: checklistComplete ? 'pass' : pre.some(x => snapshotStatus(x.value) === 'fail') ? 'fail' : 'unknown',
      pendingClose: date === ctx.today && d.closed !== true,
      activity: trades.length > 0 || pre.length > 0 || text(d.note) || !!decision || d.closed === true,
    };
  }
  function streak(records, key, ctx) {
    const map = new Map(records.map(d => [d.date, d]));
    let run = 0, best = 0, lastDate = null;
    // An enormous imported span must not block the interface. No racha can
    // exceed the number of stored completed days, so skip long empty stretches.
    const starts = records.map(x => x.date).filter(d => d <= ctx.today);
    let previous = null;
    for (const date of starts) {
      const d = map.get(date);
      if (previous) {
        let gap = shift(previous, 1), missed = false;
        for (let i = 0; gap < date && i < 8; i++, gap = shift(gap, 1))
          if (![0, 6].includes(weekday(gap))) { missed = true; break; }
        if (gap < date || missed) run = 0;
      }
      if (date === ctx.today && !d.closed) { previous = date; continue; }
      if ([0, 6].includes(weekday(date)) && !d.activity) { previous = date; continue; }
      if (d[key]) { run++; best = Math.max(best, run); lastDate = date; }
      else run = 0;
      previous = date;
    }
    let current = run;
    if (previous) {
      let date = shift(previous, 1);
      const end = map.get(ctx.today)?.closed ? ctx.today : shift(ctx.today, -1);
      for (let i = 0; date <= end && i < 8; i++, date = shift(date, 1))
        if (![0, 6].includes(weekday(date))) { current = 0; break; }
      if (date <= end) current = 0;
    }
    return { current, best, lastDate: current ? lastDate : null };
  }
  function safeShare(days, streaks, period, frequentError) {
    return {
      version: VERSION, period: { start: period.start, end: period.end },
      processDays: days.filter(d => d.xp > 0).length,
      checklistDays: days.filter(d => d.checklistComplete).length,
      journalDays: days.filter(d => d.journalComplete).length,
      noEdgeDays: days.filter(d => d.noEdge).length,
      xp: days.reduce((n, d) => n + d.xp, 0),
      streaks: {
        checklist: streaks.checklist.current, journal: streaks.journal.current,
        noEdge: streaks.noEdge.current,
      },
      frequentError: frequentError ? { key: frequentError.key, label: LABELS[frequentError.key], count: frequentError.count } : null,
    };
  }
  function summarize(input) {
    const data = input || {}, ctx = context(data), dayMap = canonicalDays(data.days);
    const trades = canonicalTrades(data.trades).filter(t => validDate(t.date) && t.date <= ctx.today);
    const byDay = new Map();
    for (const t of trades) { const list = byDay.get(t.date) || []; list.push(t); byDay.set(t.date, list); }
    for (const date of byDay.keys()) if (!dayMap.has(date)) dayMap.set(date, { date });
    const days = Array.from(dayMap.values()).filter(d => d.date <= ctx.today)
      .map(d => dailyRecord(d, byDay.get(d.date) || [], ctx)).sort((a, b) => a.date.localeCompare(b.date));
    const streaks = {
      checklist: streak(days, 'checklistComplete', ctx),
      journal: streak(days, 'journalComplete', ctx),
      noEdge: streak(days, 'noEdge', ctx),
    };
    const totalXP = days.reduce((n, d) => n + d.xp, 0);
    const tradeScores = trades.map(t => scoreTrade(t, { day: dayMap.get(t.date), now: ctx.now, today: ctx.today }));
    const checklistDays = days.filter(d => d.checklistComplete).length,
      journalDays = days.filter(d => d.journalComplete).length,
      noEdgeDays = days.filter(d => d.noEdge).length;
    const milestones = [
      { key: 'checklist_10', label: '10 días de preparación documentada', progress: checklistDays, target: 10 },
      { key: 'journal_10', label: '10 cierres con reflexión', progress: journalDays, target: 10 },
      { key: 'no_edge_5', label: '5 días respetando no hay edge', progress: noEdgeDays, target: 5 },
    ].map(x => Object.assign(x, { complete: x.progress >= x.target }));
    return {
      version: VERSION, today: ctx.today, days, totalXP,
      level: { number: Math.floor(totalXP / 100) + 1, progress: totalXP % 100, next: 100 },
      streaks, tradeScores, ratedTrades: tradeScores.filter(t => t.score !== null).length,
      milestones,
      shareSummary: safeShare(days, streaks, { start: days.length ? days[0].date : ctx.today, end: ctx.today }, null),
    };
  }
  function weekSummary(input) {
    const data = input || {}, ctx = context(data), summary = summarize(Object.assign({}, data, ctx));
    const offset = (weekday(ctx.today) + 6) % 7;
    const start = validDate(data.weekStart) ? data.weekStart : shift(ctx.today, -offset);
    const end = [shift(start, 6), ctx.today].sort()[0];
    const days = summary.days.filter(d => d.date >= start && d.date <= end);
    const tradeScores = summary.tradeScores.filter(t => t.date >= start && t.date <= end && t.closed);
    const counts = {};
    for (const t of tradeScores) for (const c of t.criteria) if (c.status === 'fail') counts[c.key] = (counts[c.key] || 0) + 1;
    const frequentKey = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0];
    const frequentError = frequentKey ? { key: frequentKey, label: LABELS[frequentKey], count: counts[frequentKey] } : null;
    const shareSummary = safeShare(days, summary.streaks, { start, end }, frequentError);
    return Object.assign({ version: VERSION, start, end, days, frequentError, shareSummary }, {
      processDays: shareSummary.processDays, checklistDays: shareSummary.checklistDays,
      journalDays: shareSummary.journalDays, noEdgeDays: shareSummary.noEdgeDays,
      totalXP: shareSummary.xp, streaks: summary.streaks,
      bestProcessDay: days.some(d => d.xp > 0)
        ? days.filter(d => d.xp > 0).sort((a, b) => b.xp - a.xp || b.date.localeCompare(a.date))[0].date : null,
    });
  }
  root.CabinaDiscipline = Object.freeze({ VERSION, PREPARABLES, sessionAt: session,
    scoreTrade, summarize, weekSummary });
})(typeof globalThis !== 'undefined' ? globalThis : window);
