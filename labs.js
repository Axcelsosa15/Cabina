/* CabinaLabs · análisis compartido para Analítica, Estadísticas,
 * Correlaciones, Insights, Diario y Estrategias.
 *
 * No es un segundo motor de P&L. Recibe operaciones YA valoradas
 * (pnl, mae, mfe, qty) y sólo agrupa, correlaciona y detecta patrones.
 * Las mismas filas que alimentan QuantEngine / mxCalc deben alimentar esto.
 *
 * Script sin dependencias: window.CabinaLabs en el navegador y
 * globalThis.CabinaLabs tras `await import('../labs.js')` en Node.
 *
 * pearson(xs, ys)                 coeficiente de Pearson; 0 si n<2 o sin varianza
 * corrStrength(r)                 magnitud + dirección en español
 * sessionOf(time)                 Asia / Londres / Nueva York (hora de entrada)
 * weekdayOf(date)                 0=domingo … 6=sábado
 * adaptTrade(raw, helpers)        normaliza un trade de Cabina a fila de análisis
 * numericFactors(rows)            factores numéricos válidos vs P&L
 * categoricalFactors(rows)        segmentos categóricos con n mínima
 * exploreFactor(rows, factor, y)  scatter o barras según el tipo
 * computeInsights(rows, opts)     patrones reproducibles + ids de evidencia
 * analyticsGroups(rows)           agregados para gráficos de Analítica
 * strategyMetrics(rows)           expectancy, PF, maxDD, avgR, n
 * coerceJournal(row)              entrada de diario
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const INSIGHTS_MIN = 8;
  const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const SESSIONS = ['Asia', 'Londres', 'Nueva York'];
  const MOODS = ['Disciplinado', 'Enfocado', 'Paciente', 'Neutral', 'Frustrado', 'Codicioso'];

  function mean(a) {
    if (!a.length) return 0;
    return a.reduce((s, x) => s + x, 0) / a.length;
  }
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
    return Math.sqrt(v);
  }
  function signed(n) {
    if (!Number.isFinite(n)) return '—';
    const r = Math.round(n);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
  }
  function num(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2 || n !== ys.length) return 0;
    const mx = mean(xs), my = mean(ys);
    let cov = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      cov += dx * dy; sx += dx * dx; sy += dy * dy;
    }
    if (sx === 0 || sy === 0) return 0;
    return cov / Math.sqrt(sx * sy);
  }
  function corrStrength(r) {
    const a = Math.abs(r);
    const mag = a < 0.1 ? 'nula' : a < 0.3 ? 'débil' : a < 0.5 ? 'moderada' : a < 0.7 ? 'fuerte' : 'muy fuerte';
    return mag + (a < 0.1 ? '' : (r >= 0 ? ' positiva' : ' negativa'));
  }
  function sessionOf(time) {
    if (!time) return null;
    const hr = parseInt(String(time).slice(0, 2), 10);
    if (Number.isNaN(hr)) return null;
    if (hr >= 7 && hr < 13) return 'Londres';
    if (hr >= 13 && hr < 22) return 'Nueva York';
    return 'Asia';
  }
  function weekdayOf(date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return new Date(date + 'T12:00:00').getDay();
  }
  function hourOf(time) {
    if (!time) return null;
    const hr = parseInt(String(time).slice(0, 2), 10);
    return Number.isNaN(hr) ? null : hr;
  }
  function qualityToRating(q) {
    if (q === 'A') return 5;
    if (q === 'B') return 3;
    if (q === 'C') return 1;
    const n = Number(q);
    return Number.isFinite(n) ? n : null;
  }
  function parseTags(raw) {
    if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
    return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  function byDateAsc(a, b) {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    const at = a.time || '', bt = b.time || '';
    return at < bt ? -1 : (at > bt ? 1 : 0);
  }
  function closed(rows) {
    return (rows || []).filter(t => t && t.pnl != null && Number.isFinite(Number(t.pnl)));
  }

  function adaptTrade(raw, helpers) {
    const h = helpers || {};
    const pnl = h.pnl != null ? Number(h.pnl) : num(raw.pnlEff != null ? raw.pnlEff : raw.pnl);
    const tags = parseTags(raw.tags);
    return {
      id: raw.id,
      date: raw.date || '',
      time: raw.time || '',
      symbol: raw.instrument || raw.symbol || raw.asset || '',
      side: raw.direction || raw.side || '',
      contracts: h.qty != null ? num(h.qty) : num(raw.qty != null ? raw.qty : raw.contracts),
      setup: h.setupName || raw.setup || '',
      setupId: raw.setupId || '',
      emotion: raw.emotion || raw.mood || '',
      rating: qualityToRating(raw.quality != null ? raw.quality : raw.rating),
      quality: raw.quality || '',
      pnl: pnl,
      /* helpers.mae/mfe son distancias de excursión; raw sigue aceptando el valor ya convertido. */
      mae: h.mae != null ? num(h.mae) : num(raw.mae),
      mfe: h.mfe != null ? num(h.mfe) : num(raw.mfe),
      tags: tags,
      account: h.accountName || '',
      accountId: raw.accountId || raw.account_id || '',
      lesson: raw.lesson || '',
      note: raw.note || '',
      r: num(raw.rReal != null ? raw.rReal : raw.r),
    };
  }

  function group(rows, keyFn) {
    const m = Object.create(null);
    closed(rows).forEach(t => {
      const keys = keyFn(t);
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach(k => {
        if (k == null || k === '') return;
        const id = String(k);
        if (!Object.prototype.hasOwnProperty.call(m, id)) m[id] = { key: id, pnl: 0, count: 0, wins: 0, ids: [] };
        m[id].pnl += t.pnl;
        m[id].count++;
        if (t.pnl > 0) m[id].wins++;
        m[id].ids.push(t.id);
      });
    });
    Object.keys(m).forEach(k => {
      m[k].expectancy = m[k].count ? m[k].pnl / m[k].count : 0;
      m[k].winrate = m[k].count ? m[k].wins / m[k].count : 0;
    });
    return m;
  }

  function numericFactors(rows) {
    const src = closed(rows);
    const defs = [
      { id: 'mae', label: 'MAE (abs)', take: t => t.mae == null ? null : Math.abs(t.mae) },
      { id: 'mfe', label: 'MFE (abs)', take: t => t.mfe == null ? null : Math.abs(t.mfe) },
      { id: 'contracts', label: 'Tamaño de posición', take: t => t.contracts },
      { id: 'rating', label: 'Valoración del setup', take: t => t.rating },
      { id: 'hour', label: 'Hora de entrada', take: t => hourOf(t.time) },
    ];
    return defs.map(d => {
      const xs = [], ys = [], ids = [];
      src.forEach(t => {
        const x = d.take(t);
        if (x == null || !Number.isFinite(x)) return;
        xs.push(x); ys.push(t.pnl); ids.push(t.id);
      });
      const unique = new Set(xs);
      if (xs.length < 3 || unique.size < 2) {
        return { id: d.id, label: d.label, r: null, n: xs.length, reason: unique.size < 2 ? 'sin variación' : 'datos insuficientes', ids };
      }
      const r = pearson(xs, ys);
      return { id: d.id, label: d.label, r, n: xs.length, strength: corrStrength(r), ids, xs, ys };
    }).sort((a, b) => Math.abs(b.r || 0) - Math.abs(a.r || 0));
  }

  function categoricalFactors(rows) {
    const src = closed(rows);
    const defs = [
      { id: 'emotion', label: 'Emoción', take: t => t.emotion },
      { id: 'setup', label: 'Setup', take: t => t.setup },
      { id: 'side', label: 'Dirección', take: t => t.side },
      { id: 'session', label: 'Sesión', take: t => sessionOf(t.time) },
      { id: 'weekday', label: 'Día de la semana', take: t => { const d = weekdayOf(t.date); return d == null ? null : WD[d]; } },
      { id: 'symbol', label: 'Símbolo', take: t => t.symbol },
      { id: 'account', label: 'Cuenta', take: t => t.account || t.accountId },
      { id: 'tag', label: 'Etiqueta', take: t => t.tags },
    ];
    return defs.map(d => {
      const g = group(src, d.take);
      const arr = Object.keys(g).map(k => g[k]).filter(x => x.count >= 2);
      if (arr.length < 2) {
        return { id: d.id, label: d.label, groups: arr, reason: 'datos insuficientes' };
      }
      arr.sort((a, b) => b.expectancy - a.expectancy);
      return { id: d.id, label: d.label, groups: arr, best: arr[0], worst: arr[arr.length - 1] };
    });
  }

  function exploreFactor(rows, factor, result) {
    const src = closed(rows);
    const numeric = { mae: t => t.mae == null ? null : Math.abs(t.mae), mfe: t => t.mfe == null ? null : Math.abs(t.mfe), contracts: t => t.contracts, rating: t => t.rating, hour: t => hourOf(t.time) };
    const categorical = {
      emotion: t => t.emotion, setup: t => t.setup, side: t => t.side,
      session: t => sessionOf(t.time),
      weekday: t => { const d = weekdayOf(t.date); return d == null ? null : WD[d]; },
      symbol: t => t.symbol, account: t => t.account || t.accountId, tag: t => t.tags,
    };
    if (numeric[factor]) {
      const xs = [], ys = [], points = [];
      src.forEach(t => {
        const x = numeric[factor](t);
        if (x == null || !Number.isFinite(x)) return;
        xs.push(x); ys.push(t.pnl);
        points.push({ x, y: t.pnl, id: t.id });
      });
      if (xs.length < 3) return { kind: 'numeric', n: xs.length, r: null, points, reason: 'datos insuficientes' };
      return { kind: 'numeric', n: xs.length, r: pearson(xs, ys), strength: corrStrength(pearson(xs, ys)), points };
    }
    const take = categorical[factor];
    if (!take) return { kind: 'unknown', reason: 'factor no numérico ni categórico' };
    const g = group(src, take);
    const metric = result || 'expectancy';
    const bars = Object.keys(g).map(k => {
      const x = g[k];
      let value = x.expectancy;
      if (metric === 'net') value = x.pnl;
      else if (metric === 'winrate') value = x.winrate;
      return { key: x.key, value, n: x.count, ids: x.ids, expectancy: x.expectancy, winrate: x.winrate, pnl: x.pnl };
    }).filter(b => b.n >= 2);
    if (bars.length < 2) return { kind: 'categorical', n: src.length, bars, reason: 'datos insuficientes' };
    bars.sort((a, b) => b.value - a.value);
    return { kind: 'categorical', n: src.length, bars, metric };
  }

  function computeInsights(rows, opts) {
    const o = opts || {};
    const T = closed(rows);
    const out = [];
    if (T.length < INSIGHTS_MIN) {
      return { insights: out, sample: T.length, reason: 'No hay evidencia suficiente' };
    }
    const exp = arr => arr.length ? arr.reduce((s, t) => s + t.pnl, 0) / arr.length : 0;
    const overall = exp(T);
    const band = Math.max(20, Math.abs(overall) * 0.5);
    const chrono = T.slice().sort(byDateAsc);
    const checklistDays = o.checklistDays || {};

    function edge(g, minN, kind, labelFn, sevGood, sevBad) {
      const arr = Object.keys(g).map(k => g[k]).filter(x => x.count >= minN);
      if (arr.length < 2) return;
      arr.forEach(x => { x.exp = x.pnl / x.count; });
      arr.sort((a, b) => b.exp - a.exp);
      const best = arr[0], worst = arr[arr.length - 1];
      if (best.exp > 0 && best.exp - worst.exp > band) {
        out.push({
          id: kind + '-best-' + best.key,
          sev: sevGood || 'good',
          title: kind + ': ventaja observada en ' + labelFn(best.key),
          metric: signed(best.exp) + '/op',
          n: best.count,
          detail: 'Expectativa ' + signed(Math.round(best.exp)) + '/op · ' + Math.round(best.winrate * 100) + '% acierto en ' + best.count + ' operaciones.',
          confidence: best.count < 12 ? 'muestra limitada' : 'muestra útil',
          ids: best.ids,
        });
        if (worst.exp < 0) {
          out.push({
            id: kind + '-worst-' + worst.key,
            sev: sevBad || 'bad',
            title: kind + ': peor contexto en ' + labelFn(worst.key),
            metric: signed(worst.exp) + '/op',
            n: worst.count,
            detail: 'Expectativa ' + signed(Math.round(worst.exp)) + '/op · ' + Math.round(worst.winrate * 100) + '% acierto en ' + worst.count + ' operaciones.',
            confidence: worst.count < 12 ? 'muestra limitada' : 'muestra útil',
            ids: worst.ids,
          });
        }
      }
    }

    edge(group(T, t => t.setup), 4, 'Setup', k => k);
    edge(group(T, t => t.symbol), 5, 'Símbolo', k => k);
    edge(group(T.filter(t => t.emotion), t => t.emotion), 4, 'Emoción', k => 'estado ' + k);
    const wg = {};
    T.forEach(t => {
      const d = weekdayOf(t.date); if (d == null) return;
      const k = String(d);
      if (!wg[k]) wg[k] = { key: k, pnl: 0, count: 0, wins: 0, ids: [] };
      wg[k].pnl += t.pnl; wg[k].count++; if (t.pnl > 0) wg[k].wins++; wg[k].ids.push(t.id);
    });
    Object.keys(wg).forEach(k => { wg[k].winrate = wg[k].wins / wg[k].count; });
    edge(wg, 4, 'Día', k => 'el ' + WD[+k]);
    const sg = group(T.filter(t => sessionOf(t.time)), t => sessionOf(t.time));
    edge(sg, 5, 'Sesión', k => k);

    const hourG = group(T.filter(t => hourOf(t.time) != null), t => String(hourOf(t.time)).padStart(2, '0') + ':00');
    edge(hourG, 4, 'Hora', k => k);

    const afterLoss = [];
    for (let i = 1; i < chrono.length; i++) if (chrono[i - 1].pnl < 0) afterLoss.push(chrono[i]);
    if (afterLoss.length >= 5) {
      const eAL = exp(afterLoss);
      if (eAL < overall - Math.max(15, Math.abs(overall) * 0.3) && eAL < 0) {
        out.push({
          id: 'revenge',
          sev: 'warn',
          title: 'Posible revenge trading',
          metric: signed(eAL) + '/op',
          n: afterLoss.length,
          detail: 'Tras una pérdida la expectativa cae a ' + signed(Math.round(eAL)) + '/op (vs ' + signed(Math.round(overall)) + ' global) en ' + afterLoss.length + ' casos.',
          confidence: afterLoss.length < 10 ? 'muestra limitada' : 'muestra útil',
          ids: afterLoss.map(t => t.id),
        });
      }
    }

    let cons = 0;
    const afterStreak = [];
    for (let j = 0; j < chrono.length; j++) {
      if (cons >= 2) afterStreak.push(chrono[j]);
      if (chrono[j].pnl < 0) cons++; else cons = 0;
    }
    if (afterStreak.length >= 4 && exp(afterStreak) < 0) {
      out.push({
        id: 'cold-streak',
        sev: 'warn',
        title: 'Pérdidas consecutivas',
        metric: signed(exp(afterStreak)) + '/op',
        n: afterStreak.length,
        detail: 'Después de 2+ pérdidas seguidas, las siguientes operaciones promedian ' + signed(Math.round(exp(afterStreak))) + '/op.',
        confidence: afterStreak.length < 8 ? 'muestra limitada' : 'muestra útil',
        ids: afterStreak.map(t => t.id),
      });
    }

    const byDay = {};
    T.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
    const days = Object.keys(byDay);
    if (days.length >= 8) {
      const counts = days.map(d => byDay[d].length).sort((a, b) => a - b);
      const med = counts[Math.floor(counts.length / 2)];
      const hi = [], lo = [], hiIds = [];
      days.forEach(d => {
        const de = byDay[d].reduce((s, t) => s + t.pnl, 0) / byDay[d].length;
        if (byDay[d].length > med) { hi.push(de); byDay[d].forEach(t => hiIds.push(t.id)); }
        else lo.push(de);
      });
      if (hi.length >= 3 && lo.length >= 3 && mean(hi) < mean(lo) - Math.max(10, Math.abs(overall) * 0.3)) {
        out.push({
          id: 'overtrading',
          sev: 'warn',
          title: 'Señal de overtrading',
          metric: signed(mean(hi)) + '/op',
          n: hiIds.length,
          detail: 'Los días con más de ' + med + ' operaciones rinden ' + signed(Math.round(mean(hi))) + '/op frente a ' + signed(Math.round(mean(lo))) + ' en días tranquilos.',
          confidence: 'comparación entre días, no causalidad',
          ids: hiIds,
        });
      }
    }

    const hiC = T.filter(t => t.rating >= 4), loC = T.filter(t => t.rating != null && t.rating <= 2);
    if (hiC.length >= 4 && loC.length >= 4) {
      const hE = exp(hiC), lE = exp(loC);
      if (hE > lE + Math.max(15, Math.abs(overall) * 0.3)) {
        out.push({
          id: 'conviction-good',
          sev: 'good',
          title: 'La valoración predice el resultado',
          metric: signed(hE) + '/op',
          n: hiC.length,
          detail: 'Las operaciones A (alta convicción) promedian ' + signed(Math.round(hE)) + '/op frente a ' + signed(Math.round(lE)) + ' en las de baja.',
          confidence: 'requiere valoración registrada',
          ids: hiC.map(t => t.id),
        });
      } else if (hE <= lE) {
        out.push({
          id: 'conviction-bad',
          sev: 'warn',
          title: 'La valoración no predice resultados',
          metric: signed(hE) + '/op',
          n: hiC.length + loC.length,
          detail: 'Alta convicción ' + signed(Math.round(hE)) + '/op no supera a baja ' + signed(Math.round(lE)) + '/op.',
          confidence: 'requiere valoración registrada',
          ids: hiC.concat(loC).map(t => t.id),
        });
      }
    }

    const sizeMed = (() => {
      const sizes = T.map(t => t.contracts).filter(x => x != null).sort((a, b) => a - b);
      return sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
    })();
    if (sizeMed != null) {
      const big = T.filter(t => t.contracts != null && t.contracts > sizeMed);
      if (big.length >= 5 && exp(big) < overall - Math.max(15, Math.abs(overall) * 0.3) && exp(big) < 0) {
        out.push({
          id: 'oversize',
          sev: 'warn',
          title: 'Exceso de tamaño',
          metric: signed(exp(big)) + '/op',
          n: big.length,
          detail: 'Por encima de ' + sizeMed + ' contratos la expectativa cae a ' + signed(Math.round(exp(big))) + '/op.',
          confidence: big.length < 10 ? 'muestra limitada' : 'muestra útil',
          ids: big.map(t => t.id),
        });
      }
    }

    const offPlan = T.filter(t => t.quality === 'C');
    if (offPlan.length >= 4 && exp(offPlan) < 0) {
      out.push({
        id: 'off-plan',
        sev: 'bad',
        title: 'Operaciones fuera del plan',
        metric: signed(exp(offPlan)) + '/op',
        n: offPlan.length,
        detail: 'Calidad C: ' + offPlan.length + ' operaciones con expectativa ' + signed(Math.round(exp(offPlan))) + '/op. No se inventa incumplimiento si no está registrado.',
        confidence: 'solo calidad C documentada',
        ids: offPlan.map(t => t.id),
      });
    }

    const fomo = T.filter(t => parseTags(t.tags).some(x => /fomo/i.test(x)) || /fomo/i.test(t.note || '') || /fomo/i.test(t.emotion || ''));
    if (fomo.length >= 3) {
      out.push({
        id: 'fomo',
        sev: fomo.every(t => t.pnl <= 0) || exp(fomo) < 0 ? 'bad' : 'info',
        title: 'FOMO registrado',
        metric: signed(exp(fomo)) + '/op',
        n: fomo.length,
        detail: 'Sólo se cuenta FOMO si aparece en etiqueta, nota o emoción. ' + fomo.length + ' operaciones · expectativa ' + signed(Math.round(exp(fomo))) + '/op.',
        confidence: 'no se infiere FOMO ausente',
        ids: fomo.map(t => t.id),
      });
    }

    if (Object.keys(checklistDays).length) {
      const clT = T.filter(t => checklistDays[t.date]);
      const ncT = T.filter(t => !checklistDays[t.date]);
      if (clT.length >= 4 && ncT.length >= 4) {
        const eCl = exp(clT), eNc = exp(ncT);
        if (eCl > eNc + band) {
          out.push({
            id: 'discipline-good',
            sev: 'good',
            title: 'Evolución de la disciplina',
            metric: signed(eCl) + '/op',
            n: clT.length,
            detail: 'Los días con checklist/diario promedian ' + signed(Math.round(eCl)) + '/op frente a ' + signed(Math.round(eNc)) + ' sin ella.',
            confidence: 'asociación, no causalidad',
            ids: clT.map(t => t.id),
          });
        } else if (eCl < eNc - band) {
          out.push({
            id: 'discipline-bad',
            sev: 'warn',
            title: 'Cumples el registro pero no se nota',
            metric: signed(eCl) + '/op',
            n: clT.length,
            detail: 'Días con checklist ' + signed(Math.round(eCl)) + '/op vs ' + signed(Math.round(eNc)) + ' sin ella.',
            confidence: 'asociación, no causalidad',
            ids: clT.map(t => t.id),
          });
        }
      }
    }

    const half = Math.floor(chrono.length / 2);
    if (chrono.length >= 16) {
      const early = exp(chrono.slice(0, half)), late = exp(chrono.slice(half));
      if (late < early - band && late < 0) {
        out.push({
          id: 'expectancy-decay',
          sev: 'warn',
          title: 'Deterioro de expectancy',
          metric: signed(late) + '/op',
          n: chrono.length - half,
          detail: 'La segunda mitad del historial promedia ' + signed(Math.round(late)) + '/op frente a ' + signed(Math.round(early)) + ' en la primera.',
          confidence: 'cambio de régimen, no veredicto',
          ids: chrono.slice(half).map(t => t.id),
        });
      }
    }

    const order = { bad: 0, warn: 1, good: 2, info: 3 };
    out.sort((a, b) => (order[a.sev] - order[b.sev]) || (b.n - a.n));
    return { insights: out, sample: T.length };
  }

  function analyticsGroups(rows) {
    const src = closed(rows).slice().sort(byDateAsc);
    const weekday = [1, 2, 3, 4, 5].map(d => {
      const g = src.filter(t => weekdayOf(t.date) === d);
      return { key: WD[d], pnl: g.reduce((s, t) => s + t.pnl, 0), n: g.length, ids: g.map(t => t.id) };
    });
    const emotion = Object.values(group(src, t => t.emotion)).sort((a, b) => b.pnl - a.pnl);
    const session = SESSIONS.map(s => {
      const g = src.filter(t => sessionOf(t.time) === s);
      return { key: s, pnl: g.reduce((x, t) => x + t.pnl, 0), n: g.length, ids: g.map(t => t.id) };
    });
    const hour = [];
    for (let h = 0; h < 24; h++) {
      const g = src.filter(t => hourOf(t.time) === h);
      if (g.length) hour.push({ key: String(h).padStart(2, '0') + ':00', pnl: g.reduce((s, t) => s + t.pnl, 0), n: g.length, ids: g.map(t => t.id) });
    }
    const symbol = Object.values(group(src, t => t.symbol)).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    const setup = Object.values(group(src, t => t.setup)).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    const tag = Object.values(group(src, t => t.tags)).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    const account = Object.values(group(src, t => t.account || t.accountId)).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    let eq = 0;
    const equity = src.map(t => { eq += t.pnl; return { date: t.date, v: eq, id: t.id }; });
    return { weekday, emotion, session, hour, symbol, setup, tag, account, equity, n: src.length };
  }

  function strategyMetrics(rows) {
    const src = closed(rows).slice().sort(byDateAsc);
    const n = src.length;
    const pnls = src.map(t => t.pnl);
    const wins = pnls.filter(x => x > 0);
    const losses = pnls.filter(x => x < 0);
    const gp = wins.reduce((a, x) => a + x, 0);
    const gl = Math.abs(losses.reduce((a, x) => a + x, 0));
    const net = gp - gl;
    let eq = 0, peak = 0, maxDD = 0;
    pnls.forEach(p => { eq += p; if (eq > peak) peak = eq; const dd = peak - eq; if (dd > maxDD) maxDD = dd; });
    const rMul = src.map(t => {
      const r = num(t.r != null ? t.r : t.rReal);
      return r;
    }).filter(x => x != null);
    return {
      n, net, gp, gl,
      pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
      expectancy: n ? net / n : 0,
      winrate: n ? wins.length / n : 0,
      maxDD,
      avgR: rMul.length ? mean(rMul) : null,
      sampleLimited: n < 30,
    };
  }

  function coerceJournal(r) {
    const row = r || {};
    return {
      id: row.id,
      date: row.date || '',
      mood: row.mood || 'Neutral',
      title: row.title || '',
      body: row.body || '',
      lesson: row.lesson || '',
      tradeIds: Array.isArray(row.tradeIds) ? row.tradeIds.slice() : [],
      studyId: row.studyId || '',
      createdAt: row.createdAt || 0,
      updatedAt: row.updatedAt || 0,
    };
  }

  /* Claves e ids llegan de datos del usuario / respaldos; van a innerHTML vía SVG. */
  function escXml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function barsSvg(items, opts) {
    const o = opts || {};
    const rows = (items || []).filter(x => x && (x.n || x.value || x.pnl));
    if (!rows.length) return '';
    const W = o.width || 560, H = Math.max(120, rows.length * 28 + 16);
    const max = Math.max.apply(null, rows.map(x => Math.abs(x.value != null ? x.value : x.pnl))) || 1;
    const labelW = 110, barX = labelW + 8;
    return '<svg class="chart lab-bars" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      rows.map((x, i) => {
        const v = x.value != null ? x.value : x.pnl;
        const y = 10 + i * 28;
        const w = Math.max(2, (Math.abs(v) / max) * (W - barX - 80));
        const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
        const label = escXml(String(x.key == null ? '' : x.key).slice(0, 16));
        const ids = escXml((x.ids || []).join(','));
        const tip = escXml(o.format ? o.format(v) : signed(v));
        return '<text x="0" y="' + (y + 12) + '">' + label + '</text>' +
          '<rect class="bar ' + cls + '" x="' + barX + '" y="' + y + '" width="' + w.toFixed(1) + '" height="16" data-ids="' + ids + '"></rect>' +
          '<text x="' + (barX + w + 6) + '" y="' + (y + 12) + '">' + tip + '</text>';
      }).join('') + '</svg>';
  }

  function equitySvg(points, opts) {
    const pts = points || [];
    if (pts.length < 2) return '';
    const o = opts || {};
    const W = o.width || 560, H = o.height || 160;
    const ys = pts.map(p => p.v);
    const min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
    const span = (max - min) || 1;
    const d = pts.map((p, i) => {
      const x = 8 + (i / (pts.length - 1)) * (W - 16);
      const y = H - 12 - ((p.v - min) / span) * (H - 24);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return '<svg class="chart lab-equity" viewBox="0 0 ' + W + ' ' + H + '" role="img"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2"></path></svg>';
  }

  const api = {
    VERSION, INSIGHTS_MIN, WD, SESSIONS, MOODS,
    mean, stdev, pearson, corrStrength, sessionOf, weekdayOf, hourOf,
    qualityToRating, parseTags, adaptTrade, group,
    numericFactors, categoricalFactors, exploreFactor,
    computeInsights, analyticsGroups, strategyMetrics,
    coerceJournal, barsSvg, equitySvg, signed, byDateAsc,
  };
  if (typeof Object.freeze === 'function') Object.freeze(api);
  root.CabinaLabs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
