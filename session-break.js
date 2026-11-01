/* CabinaBreakClock · recordatorio diario opcional de pausa.
 * Modelo puro: no DOM, almacenamiento, red, temporizadores ni reloj implícito.
 * El adaptador pasa fecha civil ET, tiempo en milisegundos y foco/visibilidad.
 *
 * create(raw) restaura sólo configuración y agregado diario; siempre arranca
 * inactivo y sin ancla temporal. Un navegador cerrado no es tiempo de uso.
 * step(state,{now,active,date}) suma el intervalo anterior sólo si estaba
 * activo. Así blur(active:false) cierra el tramo enfocado; volver del fondo
 * no añade el tiempo sin foco. Intervalos >60 s o negativos se descartan.
 * setEnabled(state,bool,context?) limpia los tiempos al desactivar.
 * setLimit(state,minutes) admite 30/60/90/120, sin reiniciar el día.
 * dismiss(state) silencia el aviso hasta que cambie la fecha.
 *
 * shouldRemind se deriva del estado; no envía notificaciones ni concede XP.
 * Persistencia y separación por dueño pertenecen al adaptador de la interfaz.
 */
(function (root) {
  'use strict';
  const VERSION = 1;
  const LIMITS = Object.freeze([30, 60, 90, 120]);
  const MAX_DELTA_MS = 60000;
  // A civil day in New York can last 25 hours at the autumn DST transition.
  const MAX_DAILY_MS = 25 * 60 * 60 * 1000;
  const DEFAULT_LIMIT = 60;
  const safeMs = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 &&
    v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : null;
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }
  function limit(v, fallback) {
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return LIMITS.includes(n) ? n : fallback;
  }
  function finish(state) {
    state.shouldRemind = state.enabled && state.date !== '' && !state.dismissed &&
      state.elapsedMs >= state.limitMinutes * 60000;
    return state;
  }
  function normalize(raw, restoring) {
    const x = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const enabled = x.enabled === true, date = validDate(x.date) ? x.date : '';
    const elapsed = safeMs(x.elapsedMs), now = safeMs(x.lastNow);
    const knownDay = enabled && date !== '';
    return finish({
      version: VERSION, enabled, limitMinutes: limit(x.limitMinutes, DEFAULT_LIMIT),
      elapsedMs: knownDay && elapsed !== null ? Math.min(MAX_DAILY_MS, elapsed) : 0, date,
      dismissed: knownDay && x.dismissed === true,
      active: knownDay && !restoring && x.active === true && now !== null,
      lastNow: knownDay && !restoring ? now : null,
      shouldRemind: false,
    });
  }
  function create(raw) { return normalize(raw, true); }
  function step(raw, input) {
    const state = normalize(raw, false), ctx = input && typeof input === 'object' ? input : {};
    const date = validDate(ctx.date) ? ctx.date : '';
    const now = safeMs(ctx.now);
    if (date && date !== state.date) {
      state.date = date; state.elapsedMs = 0; state.dismissed = false;
      state.active = false; state.lastNow = null;
    }
    if (!state.enabled || !date || now === null) {
      state.active = false; state.lastNow = null;
      return finish(state);
    }
    if (state.active && state.lastNow !== null && !state.dismissed) {
      const delta = now - state.lastNow;
      if (delta < 0) {
        // Do not count a quick correction back to the old wall-clock value
        // as elapsed usage. The next observation establishes a fresh anchor.
        state.active = false; state.lastNow = null;
        return finish(state);
      }
      if (delta >= 0 && delta <= MAX_DELTA_MS)
        state.elapsedMs = Math.min(MAX_DAILY_MS, state.elapsedMs + delta);
    }
    state.active = ctx.active === true;
    state.lastNow = now;
    return finish(state);
  }
  function setEnabled(raw, enabled, input) {
    const state = normalize(raw, false);
    if (enabled !== true) return finish({
      version: VERSION, enabled: false, limitMinutes: state.limitMinutes,
      elapsedMs: 0, date: validDate(input && input.date) ? input.date : state.date,
      dismissed: false, active: false, lastNow: null, shouldRemind: false,
    });
    state.enabled = true;
    return input ? step(state, input) : finish(state);
  }
  function setLimit(raw, minutes) {
    const state = normalize(raw, false);
    state.limitMinutes = limit(minutes, state.limitMinutes);
    return finish(state);
  }
  function dismiss(raw) {
    const state = normalize(raw, false);
    if (state.enabled && state.date !== '') state.dismissed = true;
    return finish(state);
  }
  root.CabinaBreakClock = Object.freeze({ VERSION, LIMITS, MAX_DELTA_MS,
    create, step, setEnabled, setLimit, dismiss });
})(typeof globalThis !== 'undefined' ? globalThis : window);
