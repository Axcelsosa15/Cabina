/* CabinaCoach · próximo experimento de proceso, no señales de compra/venta.
 * Solo transforma patrones ya calculados por CabinaLabs a acciones revisables.
 * No lee broker, no guarda datos, no llama a modelos ni a APIs.
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const TEMPLATES = Object.freeze({
    'third-trade-decay': {
      title: 'Revisar las entradas desde el tercer trade',
      next: 'Durante las próximas 10 sesiones, registra por qué vuelves a entrar después del segundo trade. Compara resultados con y sin una pausa antes del siguiente.',
    },
    'overtrading': {
      title: 'Probar un límite de operaciones planificado',
      next: 'Define antes de la sesión un máximo experimental de operaciones; registra las oportunidades descartadas y contrasta el resultado durante 10 sesiones.',
    },
    'revenge': {
      title: 'Revisar decisiones después de una pérdida',
      next: 'Tras la primera pérdida, registra la razón objetiva del siguiente setup y comprueba si el plan se cumplió antes de tomar otra entrada.',
    },
    'cold-streak': {
      title: 'Examinar las entradas tras dos pérdidas',
      next: 'Revisa las operaciones posteriores a dos pérdidas seguidas y comprueba si cumplen el mismo checklist que las primeras del día.',
    },
    'oversize': {
      title: 'Auditar tamaño y riesgo de posición',
      next: 'Contrasta el tamaño usado con el stop y el riesgo presupuestado. Evalúa si las entradas mayores siguen tu plan, sin aumentar el riesgo para probarlo.',
    },
    'off-plan': {
      title: 'Estudiar operaciones fuera de protocolo',
      next: 'Revisa las operaciones de calidad C; identifica qué condición del playbook se incumplió y escribe una regla que puedas verificar antes de la entrada.',
    },
    'fomo': {
      title: 'Revisar las entradas etiquetadas FOMO',
      next: 'Compara las entradas marcadas como FOMO con tu checklist. No atribuyas FOMO a operaciones sin esa etiqueta o nota.',
    },
    'discipline-bad': {
      title: 'Comprobar si el checklist mide tu proceso',
      next: 'Revisa qué pasos se completaron y cuándo; separar registro de disciplina y resultado de mercado evita confundir correlación con habilidad.',
    },
    'expectancy-decay': {
      title: 'Investigar cambios en la expectativa',
      next: 'Divide la muestra por período, setup y sesión para formular una hipótesis de régimen. Valídala con operaciones nuevas antes de cambiar reglas.',
    },
    'conviction-bad': {
      title: 'Recalibrar el criterio A/B/C',
      next: 'Compara la valoración asignada antes de entrar con el cumplimiento real del setup. No subas una nota solo porque el trade terminó ganador.',
    },
  });
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function recommendations(raw, options) {
    const source = Array.isArray(raw) ? raw : raw && Array.isArray(raw.insights) ? raw.insights : [];
    const opts = options || {};
    const max = Number.isInteger(opts.max) ? Math.min(3, Math.max(1, opts.max)) : 3;
    const candidates = [];
    for (const row of source) {
      if (!row || !TEMPLATES[row.id] || !['warn', 'bad'].includes(row.sev)) continue;
      const n = Number(row.n);
      if (!Number.isInteger(n) || n < 3) continue;
      if (!Array.isArray(row.ids)) continue;
      const ids = Array.from(new Set(row.ids.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())));
      if (!ids.length) continue;
      const template = TEMPLATES[row.id];
      candidates.push({
        id: row.id,
        title: template.title,
        nextStep: template.next,
        evidence: String(row.detail || '').slice(0, 700),
        confidence: String(row.confidence || 'muestra observacional').slice(0, 160),
        n, ids,
        severity: row.sev,
      });
    }
    // El mismo conjunto de operaciones puede disparar varias reglas correlacionadas.
    // Evitar entregar tres tareas para el mismo problema. No afirmar causalidad.
    candidates.sort((a, b) =>
      Number(b.severity === 'bad') - Number(a.severity === 'bad') ||
      b.n - a.n || a.id.localeCompare(b.id));
    const chosen = [];
    for (const item of candidates) {
      const set = new Set(item.ids);
      const overlapping = chosen.some(prev => {
        const intersection = prev.ids.filter(id => set.has(id)).length;
        return intersection / Math.min(prev.ids.length, item.ids.length) >= 0.7;
      });
      if (!overlapping) chosen.push(item);
      if (chosen.length >= max) break;
    }
    return {
      version: VERSION,
      status: chosen.length ? 'evidence' : 'insufficient',
      recommendations: chosen,
      reason: chosen.length ? '' :
        'No hay patrones accionables con evidencia suficiente. Registrar más operaciones no garantiza que aparezca uno.',
    };
  }
  const api = Object.freeze({ VERSION, recommendations });
  root.CabinaCoach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
