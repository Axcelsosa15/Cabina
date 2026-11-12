/* CabinaSession · el estado de la sesión operativa, explícito.
 * Modelo puro: sin DOM, almacenamiento, red, temporizadores ni reloj implícito.
 * window.CabinaSession en navegador; globalThis.CabinaSession tras
 * `await import('../session-state.js')` en Node.
 *
 * Vive dentro de `days/<fecha ET>` como `day.sesion`. Es ADITIVO: un día sin ese
 * campo se lee como «nunca pasó por aquí» (heredada) y se deriva de `day.closed`,
 * que sigue escribiéndose para los clientes anteriores.
 *
 * Estados: preparacion → activa ⇄ pausa → limite → cerrada (→ reabrir).
 *   leer(day)                       sesión normalizada; no escribe nada.
 *   puede(sesion, accion)           ¿la transición está permitida?
 *   aplicar(sesion, accion, datos, ahora)  → { ok, sesion, error }. No muta.
 *   ajustarPlan(sesion, cambio, ahora)     reducir riesgo aplica ya (versión
 *                                   nueva); relajar queda como PROPUESTA para la
 *                                   siguiente sesión y el plan vigente no cambia.
 *   planVigente(sesion) · comparar(role, antes, despues)
 *
 * Lo que NO es: no calcula P&L ni márgenes (eso es del motor y llega como
 * evidencia ya calculada), no bloquea ningún bróker, y su lista de eventos es un
 * historial guardado con el día —editable por quien tenga el documento—, no una
 * auditoría inviolable.
 */
(function (root) {
  'use strict';
  const VERSION = 1;
  const ESTADOS = Object.freeze(['preparacion', 'activa', 'pausa', 'limite', 'cerrada']);
  const ABIERTAS = Object.freeze(['activa', 'pausa', 'limite']);
  /* accion -> { desde: [estados], a: estado | null (se calcula) } */
  const TRANSICIONES = Object.freeze({
    iniciar: { desde: ['preparacion'], a: 'activa' },
    pausar: { desde: ['activa'], a: 'pausa' },
    reanudar: { desde: ['pausa'], a: 'activa' },
    limite: { desde: ['activa', 'pausa'], a: 'limite' },
    levantar: { desde: ['limite'], a: 'activa' },
    cerrar: { desde: ['preparacion', 'activa', 'pausa', 'limite'], a: 'cerrada' },
    reabrir: { desde: ['cerrada'], a: null },
  });
  const MAX_EVENTOS = 200, MAX_TEXTO = 500;
  /* Para estos roles, un número MENOR es menos riesgo. */
  const ROLES_NUM = Object.freeze(['maxLoss', 'maxGain', 'maxLosses', 'maxContracts']);

  const esObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const texto = v => (typeof v === 'string' ? v : '').trim().slice(0, MAX_TEXTO);
  const sello = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const positivo = v => { const n = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(n) && n > 0 ? n : null; };

  function vacia() {
    return { v: VERSION, estado: 'preparacion', planes: [], propuestas: [], eventos: [], cierres: [],
      pausa: null, limite: null };
  }
  function normalizaPlan(p, n) {
    if (!esObj(p)) return null;
    const lim = {};
    if (esObj(p.limites)) for (const k of ROLES_NUM) { const x = positivo(p.limites[k]); if (x !== null) lim[k] = x; }
    const w = esObj(p.ventana) ? p.ventana : null;
    const ventana = w && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)) ? {
      start: Number(w.start), end: Number(w.end),
      days: Array.isArray(w.days) ? w.days.map(Number).filter(d => d >= 0 && d <= 6) : [],
      tz: typeof w.tz === 'string' && w.tz ? w.tz : 'America/New_York',
    } : null;
    return {
      v: Number.isInteger(p.v) && p.v > 0 ? p.v : n, at: sello(p.at),
      tipo: ['inicio', 'reduccion', 'correccion'].includes(p.tipo) ? p.tipo : 'inicio',
      motivo: texto(p.motivo), base: Number.isInteger(p.base) ? p.base : null,
      cuenta: typeof p.cuenta === 'string' ? p.cuenta : '',
      ventana, limites: lim,
      instrumentos: Array.isArray(p.instrumentos) ? p.instrumentos.map(String).filter(Boolean).slice(0, 40) : [],
      setups: Array.isArray(p.setups) ? p.setups.filter(esObj).map(s => ({ id: String(s.id || ''), nombre: texto(s.nombre) })).filter(s => s.id).slice(0, 40) : [],
      checklist: esObj(p.checklist) ? { ses: String(p.checklist.ses || ''), done: Number(p.checklist.done) || 0, total: Number(p.checklist.total) || 0, at: sello(p.checklist.at), guardada: p.checklist.guardada === true } : null,
      reglasCuenta: esObj(p.reglasCuenta) ? { cuenta: String(p.reglasCuenta.cuenta || ''), rulesetId: p.reglasCuenta.rulesetId ? String(p.reglasCuenta.rulesetId) : '', origen: String(p.reglasCuenta.origen || '') } : null,
      faltantes: Array.isArray(p.faltantes) ? p.faltantes.map(texto).filter(Boolean).slice(0, 20) : [],
    };
  }
  function normaliza(raw) {
    const s = vacia();
    if (!esObj(raw)) return s;
    s.estado = ESTADOS.includes(raw.estado) ? raw.estado : 'preparacion';
    s.planes = (Array.isArray(raw.planes) ? raw.planes : []).map((p, i) => normalizaPlan(p, i + 1)).filter(Boolean);
    s.propuestas = (Array.isArray(raw.propuestas) ? raw.propuestas : []).filter(esObj).map(p => ({
      id: String(p.id || ''), at: sello(p.at), campo: String(p.campo || ''), de: p.de === undefined ? null : copia(p.de),
      a: p.a === undefined ? null : copia(p.a), motivo: texto(p.motivo),
      estado: ['pendiente', 'aplicada', 'descartada'].includes(p.estado) ? p.estado : 'pendiente',
    })).filter(p => p.id && p.campo);
    s.eventos = (Array.isArray(raw.eventos) ? raw.eventos : []).filter(esObj).map(e => ({
      id: String(e.id || ''), at: sello(e.at), accion: String(e.accion || ''), de: String(e.de || ''), a: String(e.a || ''),
      motivo: texto(e.motivo), detalle: esObj(e.detalle) ? copia(e.detalle) : null,
    })).filter(e => e.id && e.accion).slice(-MAX_EVENTOS);
    s.cierres = (Array.isArray(raw.cierres) ? raw.cierres : []).filter(esObj).map(c => ({
      at: sello(c.at), desde: ESTADOS.includes(c.desde) ? c.desde : 'preparacion',
      decision: c.decision === 'no_operar' ? 'no_operar' : '', nota: texto(c.nota),
      resumen: esObj(c.resumen) ? copia(c.resumen) : null, plan: Number.isInteger(c.plan) ? c.plan : null,
      origen: c.origen === 'cliente_anterior' ? 'cliente_anterior' : '',
    }));
    s.pausa = esObj(raw.pausa) && s.estado === 'pausa'
      ? { at: sello(raw.pausa.at), motivo: texto(raw.pausa.motivo), condicion: texto(raw.pausa.condicion) } : null;
    s.limite = esObj(raw.limite) && (s.estado === 'limite' || s.estado === 'cerrada') ? copia(raw.limite) : null;
    /* Estados que exigen plan no pueden existir sin él: se cae a preparación en
       vez de fingir una sesión activa sin nada que la sostenga. */
    if (ABIERTAS.includes(s.estado) && !s.planes.length) { s.estado = 'preparacion'; s.pausa = null; s.limite = null; }
    return s;
  }
  /* `day.closed` lo escriben también los clientes anteriores, que no conocen
     `day.sesion`. Si los dos discrepan, manda el hecho más simple —`closed`— y se
     deja constancia de que el cambio no vino de aquí. */
  function leer(day) {
    const d = esObj(day) ? day : {};
    const tiene = esObj(d.sesion);
    const s = normaliza(d.sesion);
    s.heredada = !tiene;
    s.desfase = '';
    if (d.closed === true && s.estado !== 'cerrada') {
      s.cierres = s.cierres.concat([{ at: sello(d.updatedAt), desde: s.estado, decision: '', nota: '', resumen: null, plan: null, origen: 'cliente_anterior' }]);
      s.estado = 'cerrada'; s.pausa = null;
      if (tiene) s.desfase = 'cerrada_por_cliente_anterior';
    } else if (d.closed !== true && s.estado === 'cerrada') {
      s.estado = s.limite && s.planes.length ? 'limite' : s.planes.length ? 'activa' : 'preparacion';
      if (s.estado !== 'limite') s.limite = null;
      s.desfase = 'reabierta_sin_motivo';
    }
    return s;
  }
  function planVigente(s) { return s && Array.isArray(s.planes) && s.planes.length ? s.planes[s.planes.length - 1] : null; }
  function puede(s, accion) {
    const t = TRANSICIONES[accion];
    return !!(t && s && t.desde.includes(s.estado));
  }
  function evento(s, ahora, accion, de, a, motivo, detalle, mutId) {
    return { id: mutId || (ahora + '-' + (s.eventos.length + 1)), at: ahora, accion, de, a, motivo: texto(motivo), detalle: detalle || null };
  }
  const falla = (s, error) => ({ ok: false, sesion: s, error });

  function aplicar(sesion, accion, datos, ahora) {
    const s = normaliza(sesion), d = esObj(datos) ? datos : {}, t = TRANSICIONES[accion];
    const at = sello(ahora);
    if (!t) return falla(s, 'accion_desconocida');
    if (at === null) return falla(s, 'sin_reloj');
    /* Doble clic o reintento: la misma mutación no deja dos eventos. */
    if (d.mutId && s.eventos.some(e => e.id === String(d.mutId))) return { ok: true, sesion: s, error: '', repetida: true };
    if (!t.desde.includes(s.estado)) return falla(s, 'transicion_no_permitida');
    const de = s.estado;
    let a = t.a, motivo = '', detalle = null;

    if (accion === 'iniciar') {
      if (!esObj(d.plan)) return falla(s, 'falta_plan');
      const plan = normalizaPlan(Object.assign({}, d.plan, { v: 1, at, tipo: 'inicio', base: null }), 1);
      if (!plan.ventana) return falla(s, 'falta_ventana');
      /* Una reapertura devuelve a preparación sólo si nunca hubo plan; aquí no
         se pisa el historial de planes de un inicio anterior. */
      plan.v = s.planes.length + 1; plan.base = s.planes.length ? s.planes.length : null;
      s.planes = s.planes.concat([plan]);
      detalle = { plan: plan.v, faltantes: plan.faltantes.slice() };
    } else if (accion === 'pausar') {
      motivo = texto(d.motivo); const condicion = texto(d.condicion);
      if (!motivo) return falla(s, 'falta_motivo');
      if (!condicion) return falla(s, 'falta_condicion');
      s.pausa = { at, motivo, condicion }; detalle = { condicion };
    } else if (accion === 'reanudar') {
      detalle = s.pausa ? { pausaDesde: s.pausa.at, condicion: s.pausa.condicion } : null; s.pausa = null;
    } else if (accion === 'limite') {
      const ev = esObj(d.evidencia) ? d.evidencia : null;
      if (!ev || !texto(ev.regla)) return falla(s, 'falta_evidencia');
      s.limite = { at, regla: texto(ev.regla), limite: ev.limite === undefined ? null : copia(ev.limite),
        valor: ev.valor === undefined ? null : copia(ev.valor), alcance: texto(ev.alcance), texto: texto(ev.texto),
        operaciones: Array.isArray(ev.operaciones) ? ev.operaciones.map(String).slice(0, 100) : [],
        plan: planVigente(s) ? planVigente(s).v : null };
      s.pausa = null; motivo = s.limite.texto; detalle = copia(s.limite);
    } else if (accion === 'levantar') {
      /* Sólo una CORRECCIÓN DE DATOS levanta un límite: la evaluación de ahora
         ya no lo encuentra Y el número de la regla es el mismo que cuando saltó.
         Si el número cambió, alguien tocó la regla: eso no borra el aviso. */
      const ev = esObj(d.evaluacion) ? d.evaluacion : null;
      motivo = texto(d.motivo);
      if (!ev) return falla(s, 'falta_evaluacion');
      if (ev.alcanzado !== false) return falla(s, 'limite_vigente');
      if (!s.limite) return falla(s, 'limite_modificado');
      /* Un tope numérico MÁS estricto que el del aviso sí vale: reducir riesgo
         después no puede ser lo que impida corregir un dato. */
      const dir = ROLES_NUM.includes(s.limite.regla) ? comparar(s.limite.regla, s.limite.limite, ev.limite)
        : (JSON.stringify(ev.limite === undefined ? null : ev.limite) === JSON.stringify(s.limite.limite) ? 0 : 1);
      if (dir === null || dir > 0) return falla(s, 'limite_modificado');
      if (!motivo) return falla(s, 'falta_motivo');
      detalle = { limiteAnterior: copia(s.limite), tipo: 'correccion_datos' }; s.limite = null;
    } else if (accion === 'cerrar') {
      const decision = d.decision === 'no_operar' ? 'no_operar' : '';
      s.cierres = s.cierres.concat([{ at, desde: de, decision, nota: texto(d.nota),
        resumen: esObj(d.resumen) ? copia(d.resumen) : null, plan: planVigente(s) ? planVigente(s).v : null, origen: '' }]);
      s.pausa = null; detalle = { decision, cierre: s.cierres.length };
    } else if (accion === 'reabrir') {
      motivo = texto(d.motivo);
      if (!motivo) return falla(s, 'falta_motivo');
      const ultimo = s.cierres[s.cierres.length - 1];
      /* Se vuelve a donde se estaba. Un límite que estaba alcanzado al cerrar
         sigue alcanzado al reabrir: reabrir no es una forma de borrarlo. */
      a = s.limite && s.planes.length ? 'limite' : s.planes.length ? 'activa' : 'preparacion';
      detalle = { cierreConservado: s.cierres.length, cerradaDesde: ultimo ? ultimo.desde : '' };
    }
    s.estado = a;
    if (a !== 'limite' && a !== 'cerrada') s.limite = null;
    s.eventos = s.eventos.concat([evento(s, at, accion, de, a, motivo, detalle, d.mutId ? String(d.mutId) : '')]).slice(-MAX_EVENTOS);
    return { ok: true, sesion: s, error: '' };
  }

  /* -1 reduce riesgo · 0 igual · 1 lo amplía · null no comparable. */
  function comparar(campo, antes, despues) {
    if (ROLES_NUM.includes(campo)) {
      const a = positivo(antes), b = positivo(despues);
      if (a === null && b === null) return 0;
      if (a === null) return -1;            // no había tope y ahora sí
      if (b === null) return 1;             // quitar un tope es relajar
      return b < a ? -1 : b > a ? 1 : 0;
    }
    if (campo === 'ventana') {
      if (!esObj(antes) || !esObj(despues)) return null;
      const dA = new Set((antes.days || []).map(Number)), dB = (despues.days || []).map(Number);
      const dentro = Number(despues.start) >= Number(antes.start) && Number(despues.end) <= Number(antes.end) && dB.every(x => dA.has(x));
      const igual = Number(despues.start) === Number(antes.start) && Number(despues.end) === Number(antes.end) && dB.length === dA.size && dentro;
      return igual ? 0 : dentro ? -1 : 1;
    }
    if (campo === 'instrumentos') {
      const A = (Array.isArray(antes) ? antes : []).map(String), B = (Array.isArray(despues) ? despues : []).map(String);
      /* Lista vacía = sin restricción. */
      if (!A.length && !B.length) return 0;
      if (!A.length) return -1;
      if (!B.length) return 1;
      const sub = B.every(x => A.includes(x));
      return sub && B.length === A.length ? 0 : sub ? -1 : 1;
    }
    return null;
  }
  function valorDe(plan, campo) {
    if (ROLES_NUM.includes(campo)) return plan.limites[campo] === undefined ? null : plan.limites[campo];
    if (campo === 'ventana') return plan.ventana;
    if (campo === 'instrumentos') return plan.instrumentos;
    return undefined;
  }
  /* cambio: { campo, valor, motivo, tipo?: 'correccion', mutId? }
     → { ok, sesion, efecto: 'aplicado' | 'propuesto' | 'sin_cambio', error } */
  function ajustarPlan(sesion, cambio, ahora) {
    const s = normaliza(sesion), c = esObj(cambio) ? cambio : {}, at = sello(ahora);
    const sal = (ok, efecto, error) => ({ ok, sesion: s, efecto, error: error || '' });
    if (at === null) return sal(false, '', 'sin_reloj');
    if (!ABIERTAS.includes(s.estado)) return sal(false, '', 'sin_sesion_abierta');
    if (c.mutId && s.eventos.some(e => e.id === String(c.mutId))) return sal(true, 'sin_cambio');
    const plan = planVigente(s), campo = String(c.campo || '');
    const antes = valorDe(plan, campo);
    if (antes === undefined) return sal(false, '', 'campo_desconocido');
    const motivo = texto(c.motivo);
    if (!motivo) return sal(false, '', 'falta_motivo');
    const despues = ROLES_NUM.includes(campo) ? positivo(c.valor) : copia(c.valor);
    const dir = comparar(campo, antes, despues);
    if (dir === null) return sal(false, '', 'valor_no_comparable');
    if (dir === 0) return sal(true, 'sin_cambio');
    const correccion = c.tipo === 'correccion';
    /* Con el límite alcanzado no hay «corrección» que lo afloje: ésa es
       exactamente la puerta que este estado cierra. */
    if (dir > 0 && correccion && s.estado === 'limite') return sal(false, '', 'limite_vigente');
    if (dir > 0 && !correccion) {
      s.propuestas = s.propuestas.concat([{ id: c.mutId ? String(c.mutId) : at + '-p' + (s.propuestas.length + 1), at, campo,
        de: copia(antes), a: copia(despues), motivo, estado: 'pendiente' }]);
      s.eventos = s.eventos.concat([evento(s, at, 'proponer', s.estado, s.estado, motivo, { campo, de: copia(antes), a: copia(despues) }, c.mutId ? String(c.mutId) : '')]).slice(-MAX_EVENTOS);
      return sal(true, 'propuesto');
    }
    const nuevo = copia(plan);
    nuevo.v = plan.v + 1; nuevo.base = plan.v; nuevo.at = at; nuevo.motivo = motivo;
    nuevo.tipo = correccion ? 'correccion' : 'reduccion';
    if (ROLES_NUM.includes(campo)) { if (despues === null) delete nuevo.limites[campo]; else nuevo.limites[campo] = despues; }
    else nuevo[campo] = despues;
    s.planes = s.planes.concat([normalizaPlan(nuevo, nuevo.v)]);
    s.eventos = s.eventos.concat([evento(s, at, correccion ? 'corregir_plan' : 'reducir_plan', s.estado, s.estado, motivo,
      { campo, de: copia(antes), a: copia(despues), plan: nuevo.v }, c.mutId ? String(c.mutId) : '')]).slice(-MAX_EVENTOS);
    return sal(true, 'aplicado');
  }
  function resolverPropuesta(sesion, id, estado) {
    const s = normaliza(sesion);
    if (!['aplicada', 'descartada'].includes(estado)) return { ok: false, sesion: s, error: 'estado_desconocido' };
    const p = s.propuestas.find(x => x.id === String(id));
    if (!p) return { ok: false, sesion: s, error: 'propuesta_desconocida' };
    p.estado = estado;
    return { ok: true, sesion: s, error: '' };
  }
  /* Lo que se guarda: sin los campos derivados de `leer`. */
  function paraGuardar(s) {
    const n = normaliza(s);
    return { v: VERSION, estado: n.estado, planes: n.planes, propuestas: n.propuestas, eventos: n.eventos,
      cierres: n.cierres, pausa: n.pausa, limite: n.limite };
  }
  root.CabinaSession = Object.freeze({ VERSION, ESTADOS, ABIERTAS, TRANSICIONES, ROLES_NUM,
    leer, puede, aplicar, ajustarPlan, resolverPropuesta, planVigente, comparar, paraGuardar });
})(typeof globalThis !== 'undefined' ? globalThis : window);
