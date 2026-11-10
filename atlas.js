/* Cabina Atlas · vistas de Bitácora sobre el registro único de Cabina.
   No hay un segundo journal, ni un segundo motor de P&L, ni red.
   Los números de operación salen de FUT.filtered (pnlEff).
   La serie de Estadísticas sale de CabinaBridge.edgeSeries (mxNeto):
   puede diferir de pnlEff cuando Estadísticas descuenta una comisión
   de referencia que el journal no traía. No se unifican en silencio.
   Correlación no es causalidad. Una muestra corta no es una ventaja. */
(function (global) {
  "use strict";

  function num(v) {
    const n = typeof v === "number" ? v : (v == null || v === "" ? NaN : Number(v));
    return Number.isFinite(n) ? n : null;
  }
  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
  function stdev(a) {
    if (a.length < 2) return null;
    const m = mean(a);
    const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
    return Math.sqrt(v);
  }
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
  function asPnls(rows) {
    if (!rows || !rows.length) return [];
    if (typeof rows[0] === "number") return rows.map(num).filter(v => v != null);
    return rows.map(r => num(r && (r.pnl != null ? r.pnl : r.pnlEff))).filter(v => v != null);
  }
  function pearson(xs, ys) {
    const n = Math.min((xs || []).length, (ys || []).length);
    const pairs = [];
    for (let i = 0; i < n; i++) {
      const x = num(xs[i]), y = num(ys[i]);
      if (x == null || y == null) continue;
      pairs.push([x, y]);
    }
    if (pairs.length < 3) return null;
    const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pairs) {
      const dx = x - mx, dy = y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }
  function streaks(pnls) {
    let maxW = 0, maxL = 0, cw = 0, cl = 0;
    for (const p of pnls) {
      if (p > 0) { cw++; cl = 0; if (cw > maxW) maxW = cw; }
      else if (p < 0) { cl++; cw = 0; if (cl > maxL) maxL = cl; }
      else { cw = 0; cl = 0; }
    }
    return { maxWin: maxW, maxLoss: maxL };
  }
  function drawdownOf(rows) {
    const pnls = asPnls(rows);
    let eq = 0, peak = 0, max = 0, cur = 0, dur = 0;
    const underwater = [];
    for (const p of pnls) {
      eq += p;
      if (eq >= peak) { peak = eq; cur = 0; }
      else { cur++; if (cur > dur) dur = cur; }
      const dd = peak - eq;
      if (dd > max) max = dd;
      underwater.push(eq - peak);
    }
    return { max, duration: dur, end: eq, underwater, n: pnls.length };
  }
  function statsOf(rows) {
    const pnls = asPnls(rows);
    const wins = pnls.filter(x => x > 0);
    const losses = pnls.filter(x => x < 0);
    const gp = wins.reduce((s, x) => s + x, 0);
    const gl = Math.abs(losses.reduce((s, x) => s + x, 0));
    const net = pnls.reduce((s, x) => s + x, 0);
    const n = pnls.length;
    const wr = n ? wins.length / n : null;
    const avgWin = wins.length ? gp / wins.length : null;
    const avgLoss = losses.length ? -gl / losses.length : null;
    const payoff = avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
    const pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : null);
    const expectancy = n ? net / n : null;
    const decisive = wins.length + losses.length;
    const wKelly = decisive ? wins.length / decisive : null;
    const kelly = payoff != null && payoff > 0 && wKelly != null ? wKelly - (1 - wKelly) / payoff : null;
    const sd = stdev(pnls);
    const sharpe = sd ? mean(pnls) / sd : null;
    const down = n ? Math.sqrt(pnls.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / n) : null;
    const sortino = down ? mean(pnls) / down : null;
    const rs = (rows || []).map(r => r && num(r.r)).filter(v => v != null);
    const useR = rs.length >= 2 && rs.length >= n * 0.5;
    const base = useR ? rs : pnls;
    const mBase = mean(base);
    const sdBase = stdev(base);
    const sqn = base.length >= 2 && sdBase ? (mBase / sdBase) * Math.sqrt(Math.min(base.length, 100)) : null;
    const sorted = pnls.slice().sort((a, b) => a - b);
    const dd = drawdownOf(pnls);
    const st = streaks(pnls);
    const expR = rs.length ? mean(rs) : null;
    return {
      n, net, gp, gl, pf, expectancy, expectancyR: expR, wr, avgWin, avgLoss, payoff,
      breakEven: payoff != null ? Math.abs(avgLoss) / (avgWin + Math.abs(avgLoss)) : null,
      sqn, sqnBase: useR ? "R" : "pnl", sharpe, sortino, kelly, sd,
      maxDD: dd.max, maxDDDur: dd.duration, recovery: dd.max > 0 ? net / dd.max : (net > 0 ? Infinity : null),
      maxWin: st.maxWin, maxLoss: st.maxLoss,
      best: n ? sorted[sorted.length - 1] : null, worst: n ? sorted[0] : null,
      median: percentile(sorted, 0.5), p25: percentile(sorted, 0.25), p75: percentile(sorted, 0.75),
      underwater: dd.underwater
    };
  }
  function groupBy(rows, keyFn) {
    const g = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (k == null || k === "") continue;
      const cur = g.get(k) || { key: String(k), n: 0, pnl: 0, wins: 0, ids: [] };
      const p = num(r.pnl);
      if (p == null) continue;
      cur.n++; cur.pnl += p; if (p > 0) cur.wins++;
      if (r.id != null) cur.ids.push(r.id);
      g.set(k, cur);
    }
    return [...g.values()].map(x => Object.assign(x, {
      expectancy: x.n ? x.pnl / x.n : null,
      wr: x.n ? x.wins / x.n : null
    }));
  }

  const INSIGHTS_MIN = 8;
  const SEGMENT_MIN = 5;

  function insightsOf(rows) {
    const list = (rows || []).filter(r => num(r && r.pnl) != null);
    const n = list.length;
    const base = (extra) => Object.assign({
      n, sample: n, confidence: n < 30 ? "muestra limitada" : "muestra operativa",
      context: "Calculado sobre el P&L del journal (pnlEff), en el orden fecha y hora."
    }, extra);
    if (n < INSIGHTS_MIN) {
      return [base({
        id: "muestra", cls: "informativo", name: "Muestra",
        metric: "No hay evidencia suficiente",
        context: "Hacen falta al menos " + INSIGHTS_MIN + " operaciones cerradas. Hay " + n + "."
      })];
    }
    const chrono = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")));
    const overall = mean(chrono.map(r => num(r.pnl)));
    const band = Math.max(15, Math.abs(overall) * 0.3);
    const out = [];
    function edge(label, keyFn, queryKey) {
      const arr = groupBy(chrono, keyFn).filter(x => x.n >= SEGMENT_MIN);
      if (arr.length < 2) return;
      arr.sort((a, b) => b.expectancy - a.expectancy);
      const best = arr[0], worst = arr[arr.length - 1];
      if (!(best.expectancy > 0 && best.expectancy - worst.expectancy > band)) return;
      out.push(base({
        id: "best-" + queryKey, cls: "favorable", name: label + " con mejor resultado",
        metric: "Expectativa " + Math.round(best.expectancy),
        sample: best.n, context: best.key + " frente a " + worst.key + ".",
        confidence: best.n < 30 ? "muestra limitada: no es una ventaja declarada" : "segmento repetido",
        evidence: { [queryKey]: best.key }
      }));
      if (worst.expectancy < 0) {
        out.push(base({
          id: "worst-" + queryKey, cls: "desfavorable", name: label + " con peor resultado",
          metric: "Expectativa " + Math.round(worst.expectancy),
          sample: worst.n, context: worst.key + ". No implica causa.",
          confidence: worst.n < 30 ? "muestra limitada" : "segmento repetido",
          evidence: { [queryKey]: worst.key }
        }));
      }
    }
    edge("Setup", r => r.setup, "setup");
    edge("Símbolo", r => r.symbol, "simbolo");
    edge("Sesión", r => r.session, "sesion");
    edge("Día", r => r.dow, "dow");
    const hours = groupBy(chrono, r => r.hour == null ? null : String(r.hour)).filter(x => x.n >= SEGMENT_MIN);
    if (hours.length >= 2) {
      hours.sort((a, b) => b.expectancy - a.expectancy);
      const best = hours[0];
      if (best.expectancy > 0 && best.expectancy - hours[hours.length - 1].expectancy > band) {
        out.push(base({
          id: "hora", cls: "favorable", name: "Mejor hora de entrada",
          metric: "Expectativa " + Math.round(best.expectancy),
          sample: best.n, context: "Hora " + best.key + ".",
          confidence: best.n < 30 ? "muestra limitada" : "segmento repetido",
          evidence: { hora: best.key }
        }));
      }
    }
    const moods = chrono.map(r => r.emotion).filter(Boolean);
    const fomo = chrono.filter(r => r.emotion === "FOMO" || /(^|,\s*)fomo($|,)/i.test(String(r.tags || "")));
    const missing = [];
    if (!moods.length) missing.push("emoción");
    if (!fomo.length) missing.push("FOMO");
    const after = [];
    for (let i = 1; i < chrono.length; i++) if (num(chrono[i - 1].pnl) < 0) after.push(chrono[i]);
    let revenge = false;
    if (after.length >= 5) {
      const e = mean(after.map(r => num(r.pnl)));
      if (e < overall - band && e < 0) {
        revenge = true;
        out.push(base({
          id: "revenge", cls: "desfavorable", name: "Revenge trading",
          metric: "Expectativa " + Math.round(e) + " tras una pérdida",
          sample: after.length,
          context: "La operación siguiente a una pérdida rinde peor que el conjunto (" + Math.round(overall) + "). Es una asociación, no una causa.",
          confidence: after.length < 30 ? "muestra limitada" : "patrón repetido",
          evidence: { resultado: "loss" }
        }));
      }
    }
    if (!revenge) missing.push("revenge trading");
    const qualities = chrono.filter(r => r.quality === "A" || r.quality === "B" || r.quality === "C");
    if (!qualities.length) missing.push("calidad de ejecución");
    else {
      const c = qualities.filter(r => r.quality === "C");
      if (c.length >= SEGMENT_MIN) {
        out.push(base({
          id: "calidad-c", cls: "desfavorable", name: "Operaciones fuera del plan",
          metric: c.length + " con calidad C",
          sample: c.length, context: "La calidad C está registrada como ejecución fuera del protocolo.",
          confidence: c.length < 30 ? "muestra limitada" : "registro repetido",
          evidence: { calidad: "C" }
        }));
      }
      const half = Math.floor(qualities.length / 2);
      const share = arr => arr.length ? arr.filter(r => r.quality === "A").length / arr.length : null;
      const a1 = share(qualities.slice(0, half)), a2 = share(qualities.slice(half));
      if (a1 != null && a2 != null && Math.abs(a2 - a1) >= 0.15) {
        out.push(base({
          id: "disciplina", cls: a2 > a1 ? "favorable" : "desfavorable",
          name: "Evolución de la disciplina",
          metric: Math.round(a2 * 100) + "% calidad A en la segunda mitad",
          sample: qualities.length,
          context: "Primera mitad " + Math.round(a1 * 100) + "% A. Sólo cuenta la calidad guardada.",
          confidence: qualities.length < 30 ? "muestra limitada" : "comparación de mitades",
          evidence: { calidad: "A" }
        }));
      }
    }
    const byDay = new Map();
    chrono.forEach(r => {
      const d = r.date || "";
      const cur = byDay.get(d) || [];
      cur.push(num(r.pnl));
      byDay.set(d, cur);
    });
    if (byDay.size >= 8) {
      const counts = [...byDay.values()].map(x => x.length).sort((a, b) => a - b);
      const med = counts[Math.floor(counts.length / 2)];
      const hi = [], lo = [];
      byDay.forEach(vals => (vals.length > med ? hi : lo).push(mean(vals)));
      if (hi.length >= 3 && lo.length >= 3 && mean(hi) < mean(lo) - band) {
        out.push(base({
          id: "overtrading", cls: "desfavorable", name: "Overtrading",
          metric: "Expectativa " + Math.round(mean(hi)) + " en días cargados",
          sample: chrono.length,
          context: "Días con más de " + med + " operaciones rinden " + Math.round(mean(hi)) + " frente a " + Math.round(mean(lo)) + " en días más tranquilos.",
          confidence: "comparación de días, no de una sola racha",
          evidence: {}
        }));
      }
    }
    const qty = chrono.map(r => num(r.qty)).filter(v => v != null);
    if (qty.length >= INSIGHTS_MIN) {
      const sorted = qty.slice().sort((a, b) => a - b);
      const med = percentile(sorted, 0.5);
      const big = chrono.filter(r => num(r.qty) != null && num(r.qty) > med * 1.5);
      if (med > 0 && big.length >= SEGMENT_MIN && mean(big.map(r => num(r.pnl))) < overall - band) {
        out.push(base({
          id: "tamano", cls: "desfavorable", name: "Exceso de tamaño",
          metric: "Expectativa " + Math.round(mean(big.map(r => num(r.pnl)))),
          sample: big.length,
          context: "Contratos por encima de 1,5 veces la mediana (" + med + ").",
          confidence: big.length < 30 ? "muestra limitada" : "segmento repetido",
          evidence: {}
        }));
      }
    }
    const half = Math.floor(chrono.length / 2);
    const e1 = mean(chrono.slice(0, half).map(r => num(r.pnl)));
    const e2 = mean(chrono.slice(half).map(r => num(r.pnl)));
    if (e1 != null && e2 != null && e1 > 0 && e2 < e1 * 0.5) {
      out.push(base({
        id: "deterioro", cls: "desfavorable", name: "Deterioro de expectancy",
        metric: Math.round(e2) + " en la segunda mitad",
        sample: chrono.length,
        context: "Primera mitad " + Math.round(e1) + ". Mitades cronológicas, no una causa.",
        confidence: "comparación descriptiva",
        evidence: {}
      }));
    }
    const dd = drawdownOf(chrono.map(r => num(r.pnl)));
    let valleys = 0, down = false;
    for (const u of dd.underwater) {
      if (u < 0 && !down) { valleys++; down = true; }
      if (u === 0) down = false;
    }
    if (valleys >= 2 && dd.max > 0) {
      out.push(base({
        id: "dd", cls: "informativo", name: "Drawdowns recurrentes",
        metric: valleys + " excursiones bajo el máximo",
        sample: chrono.length,
        context: "Caída máxima " + Math.round(dd.max) + ". Describe la curva; no predice la siguiente.",
        confidence: "conteo de la curva realizada",
        evidence: {}
      }));
    }
    if (missing.length) {
      out.push(base({
        id: "ausentes", cls: "informativo", name: "Sin registro",
        metric: "No hay evidencia suficiente",
        context: "No hay datos guardados para: " + missing.join(", ") + ". No se inventan.",
        confidence: "ausencia de registro",
        evidence: {}
      }));
    }
    const order = { desfavorable: 0, favorable: 1, informativo: 2 };
    out.sort((a, b) => order[a.cls] - order[b.cls]);
    return out;
  }

  const MOODS = ["Tranquilo", "Confiado", "Ansioso", "FOMO", "Frustrado", "Disciplinado", "Neutral"];
  const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const api = { pearson, statsOf, drawdownOf, insightsOf, groupBy, MOODS, INSIGHTS_MIN, SEGMENT_MIN };
  global.CabinaAtlas = api;
  if (typeof document === "undefined") return;

  const COLS = [
    ["date", "Fecha"], ["time", "Hora"], ["symbol", "Símbolo"], ["side", "Lado"],
    ["setup", "Setup"], ["account", "Cuenta"], ["qty", "Cant."], ["pnl", "P&L"],
    ["r", "R"], ["quality", "Calidad"], ["session", "Sesión"], ["tags", "Etiquetas"]
  ];
  const state = { sel: new Set(), sort: "date", dir: -1, cal: null, corrX: "hora", corrY: "pnl", diaView: "lista" };

  function bridge() { return global.CabinaBridge || null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = Number(n);
    const abs = Math.abs(v);
    const s = abs.toLocaleString("en-US", { maximumFractionDigits: abs < 100 ? 2 : 0 });
    return (v < 0 ? "−$" : "$") + s;
  }
  function pct(x) { return x == null || !Number.isFinite(x) ? "—" : Math.round(x * 100) + "%"; }
  function ratio(x) {
    if (x == null || !Number.isFinite(x)) return x === Infinity ? "∞" : "—";
    return x.toFixed(2);
  }
  function params() { return new URLSearchParams(location.search); }
  function setParams(patch, go) {
    const u = new URL(location.href);
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v == null || v === "" || v === "all") u.searchParams.delete(k);
      else u.searchParams.set(k, String(v));
    });
    if (go) u.hash = go;
    history.replaceState(null, "", u.pathname + u.search + u.hash);
    const b = bridge();
    if (go && b) b.goto(go);
    else sync();
  }
  function clsPnl(n) { return n > 0 ? "pos" : n < 0 ? "neg" : ""; }
  function moodMap() {
    const m = new Map();
    const b = bridge();
    if (!b) return m;
    b.journalList().forEach(e => { if (e && e.date && e.mood) m.set(e.date, e.mood); });
    return m;
  }
  function excursion(t) {
    const Q = global.QuantEngine;
    if (!Q || typeof Q.excursionDeOperacion !== "function") return null;
    try {
      return Q.excursionDeOperacion({
        simbolo: t.instrument, direccion: t.direction, entrada: t.entry,
        stop: t.stop, salida: t.exit, mae: t.mae, mfe: t.mfe
      });
    } catch (e) { return null; }
  }
  function rows() {
    const b = bridge();
    if (!b) return [];
    const p = params();
    const sesLabels = { Asia: "asia", Londres: "londres", "Pre-mercado": "premkt", "NY AM": "nyam", Lunch: "lunch", "NY PM": "nypm", Cierre: "cierre", Pausa: "pausa" };
    const ses = sesLabels[p.get("sesion") || ""] || p.get("sesion") || "";
    let dow = p.get("dow");
    if (dow && DOW.includes(dow)) dow = String(DOW.indexOf(dow));
    let list = b.trades({
      tipo: "futuros",
      acct: p.get("acct") || "",
      setup: p.get("setup") || "",
      instr: p.get("simbolo") || "",
      desde: p.get("desde") || "",
      hasta: p.get("hasta") || "",
      q: p.get("q") || "",
      ses: ses
    });
    const moods = moodMap();
    const tag = (p.get("tag") || "").toLowerCase();
    const res = p.get("resultado") || "";
    const cal = p.get("calidad") || "";
    const hora = p.get("hora");
    const emo = p.get("emocion") || "";
    list = list.filter(t => {
      if (tag && !String(t.tags || "").toLowerCase().split(",").map(s => s.trim()).includes(tag)) return false;
      if (cal && t.quality !== cal) return false;
      if (emo && moods.get(t.date) !== emo) return false;
      if (hora != null && hora !== "" && String(hourOf(t)) !== String(hora)) return false;
      if (dow != null && dow !== "") {
        const d = t.date ? new Date(t.date + "T12:00:00").getDay() : null;
        if (String(d) !== String(dow)) return false;
      }
      const pnl = num(t.pnlEff);
      if (res === "win" && !(pnl > 0)) return false;
      if (res === "loss" && !(pnl < 0)) return false;
      return true;
    });
    return list.map(t => {
      const ex = excursion(t);
      const d = t.date ? new Date(t.date + "T12:00:00") : null;
      return {
        raw: t, id: t.id, date: t.date || "", time: t.time || "",
        symbol: t.instrument || "", side: t.direction || "",
        setup: b.setupName(t.setupId) || "", setupId: t.setupId || "",
        account: b.accountName(t.accountId) || "", accountId: t.accountId || "",
        qty: num(t.contratos != null ? t.contratos : t.qty),
        pnl: num(t.pnlEff), r: num(t.rReal), quality: t.quality || "",
        session: b.sessionLabel(b.sessionOf(t)) || "", sessionId: b.sessionOf(t) || "",
        tags: t.tags || "", emotion: moods.get(t.date) || "",
        hour: hourOf(t), dow: d ? DOW[d.getDay()] : "", dowN: d ? d.getDay() : null,
        mae: ex && ex.adversoPuntos, mfe: ex && ex.favorablePuntos,
        risk: num(t.riskUsd), shots: Array.isArray(t.images) ? t.images.length : 0
      };
    });
  }
  function hourOf(t) {
    const m = String(t.time || "").match(/^(\d{1,2})/);
    return m ? Number(m[1]) : null;
  }
  function colsOn() {
    try {
      const raw = JSON.parse(localStorage.getItem("cabina-ops-columns") || "null");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) { /* preferencia ausente: columnas de serie */ }
    return COLS.map(c => c[0]);
  }
  function saveCols(list) {
    try { localStorage.setItem("cabina-ops-columns", JSON.stringify(list)); } catch (e) { /* el navegador puede negar el almacén */ }
  }
  function sorted(list) {
    const k = state.sort, dir = state.dir;
    return list.slice().sort((a, b) => {
      const va = a[k], vb = b[k];
      if (typeof va === "number" || typeof vb === "number") return ((va || 0) - (vb || 0)) * dir;
      return String(va || "").localeCompare(String(vb || "")) * dir;
    });
  }
  function shell(host, html, bind) {
    if (host.dataset.ready === "1") return;
    host.innerHTML = html;
    host.dataset.ready = "1";
    bind(host);
  }
  function out(host) { return host.querySelector("[data-atlas-out]"); }

  function paintOps() {
    const host = document.getElementById("opsBody");
    if (!host || !bridge()) return;
    shell(host, opsShell(), bindOps);
    const p = params();
    const list = sorted(rows());
    fillIdle("opsQ", p.get("q") || "");
    fillIdle("opsDesde", p.get("desde") || "");
    fillIdle("opsHasta", p.get("hasta") || "");
    const b = bridge();
    fillSelect("opsAcct", [["", "Todas las cuentas"]].concat(b.accounts().map(a => [a.id, a.name || a.firm || a.id])), p.get("acct") || "");
    fillSelect("opsSetup", [["", "Todos los setups"]].concat(b.playbooks().filter(x => x.type === "futuros" || x.kind === "futuros").map(x => [x.id, x.name || x.id])), p.get("setup") || "");
    const tags = [...new Set(b.trades({ tipo: "futuros" }).flatMap(t => String(t.tags || "").split(",").map(s => s.trim()).filter(Boolean)))];
    fillSelect("opsTag", [["", "Todas las etiquetas"]].concat(tags.map(t => [t, t])), p.get("tag") || "");
    fillSelect("opsCal", [["", "Toda la calidad"], ["A", "A"], ["B", "B"], ["C", "C"]], p.get("calidad") || "");
    host.querySelectorAll("[data-res]").forEach(btn => btn.setAttribute("aria-pressed", String((p.get("resultado") || "all") === btn.dataset.res || (!p.get("resultado") && btn.dataset.res === "all"))));
    const on = colsOn();
    const meta = host.querySelector("#opsMeta");
    const st = statsOf(list.map(r => ({ pnl: r.pnl, r: r.r })));
    if (meta) meta.innerHTML = `<span>${list.length} operaciones</span> <span class="${clsPnl(st.net)}">${money(st.net)}</span> <span>WR ${pct(st.wr)}</span> <span>PF ${ratio(st.pf)}</span> <span>E ${money(st.expectancy)}</span>`;
    const head = on.map(k => `<th><button type="button" data-sort="${k}">${esc(COLS.find(c => c[0] === k)[1])}</button></th>`).join("");
    const body = list.map(r => `<tr data-id="${esc(r.id)}"><td><input type="checkbox" data-pick="${esc(r.id)}" ${state.sel.has(r.id) ? "checked" : ""} aria-label="Seleccionar"></td>` + on.map(k => `<td class="${k === "pnl" ? clsPnl(r.pnl) : ""}">${cell(r, k)}</td>`).join("") +
      `<td class="atlas-row-actions"><button type="button" data-act="edit">Editar</button> <button type="button" data-act="study">Estudio</button> <button type="button" data-act="diary">Diario</button>${r.accountId ? ` <button type="button" data-act="acct">Cuenta</button>` : ""}${r.shots ? ` <button type="button" data-act="shot">${r.shots} capturas</button>` : ""}</td></tr>`).join("");
    const box = out(host);
    if (!list.length) box.innerHTML = `<p class="atlas-empty" data-atlas-empty="1">No hay operaciones con estos filtros.</p>`;
    else box.innerHTML = `<div class="atlas-scroll"><table class="atlas-table"><thead><tr><th><input type="checkbox" id="opsAll" aria-label="Seleccionar visibles"></th>${head}<th>Acciones</th></tr></thead><tbody>${body}</tbody></table></div>`;
    const nSel = host.querySelector("#opsSelN");
    if (nSel) nSel.textContent = state.sel.size ? state.sel.size + " seleccionadas" : "";
  }
  function cell(r, k) {
    if (k === "pnl") return esc(money(r.pnl));
    if (k === "r") return r.r == null ? "—" : esc((r.r >= 0 ? "+" : "") + r.r.toFixed(2));
    if (k === "side") return esc(r.side === "short" ? "corto" : r.side === "long" ? "largo" : "—");
    if (k === "qty") return r.qty == null ? "—" : esc(String(r.qty));
    const v = r[k];
    return v == null || v === "" ? "—" : esc(v);
  }
  function fillIdle(id, value) {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return;
    if (el.value !== value) el.value = value;
  }
  function fillSelect(id, options, value) {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return;
    const html = options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
    if ([...el.options].some(o => o.value === value)) el.value = value;
  }
  function opsShell() {
    const checks = COLS.map(([k, l]) => `<label><input type="checkbox" data-col="${k}" ${colsOn().includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("");
    return `<div class="atlas-bar">
      <div class="atlas-seg" role="group" aria-label="Resultado">
        <button type="button" data-res="all">Todas</button>
        <button type="button" data-res="win">Ganadoras</button>
        <button type="button" data-res="loss">Perdedoras</button>
      </div>
      <input id="opsQ" type="search" placeholder="Buscar" aria-label="Buscar operaciones">
      <select id="opsAcct" aria-label="Cuenta"></select>
      <select id="opsSetup" aria-label="Setup"></select>
      <select id="opsTag" aria-label="Etiqueta"></select>
      <select id="opsCal" aria-label="Calidad"></select>
      <input id="opsDesde" type="date" aria-label="Desde">
      <input id="opsHasta" type="date" aria-label="Hasta">
      <button type="button" id="opsClear">Limpiar</button>
    </div>
    <div class="atlas-bar">
      <button type="button" class="atlas-primary" id="opsNew">Nueva operación</button>
      <button type="button" id="opsImport">Importar CSV</button>
      <button type="button" id="opsExport">Exportar CSV</button>
      <button type="button" id="opsBackup">Copia de seguridad</button>
      <details class="atlas-cols"><summary>Columnas</summary><div class="atlas-colgrid">${checks}</div></details>
      <span id="opsSelN"></span>
      <select id="opsBulkQ" aria-label="Calidad para la selección"><option value="">Calidad…</option><option>A</option><option>B</option><option>C</option></select>
      <button type="button" id="opsBulkQBtn">Aplicar calidad</button>
      <input id="opsBulkTag" type="text" placeholder="Añadir etiqueta" aria-label="Etiqueta para la selección">
      <button type="button" id="opsBulkTagBtn">Añadir etiqueta</button>
      <button type="button" id="opsBulkDel">Eliminar selección</button>
    </div>
    <p id="opsMeta" class="atlas-meta"></p>
    <div data-atlas-out></div>
    <p class="atlas-note">P&amp;L del journal (pnlEff). Estadísticas puede restar una comisión de referencia distinta. Editar abre el único editor.</p>`;
  }
  function bindOps(host) {
    host.addEventListener("input", e => {
      const id = e.target.id;
      if (id === "opsQ") setParams({ q: e.target.value });
    });
    host.addEventListener("change", e => {
      const t = e.target;
      if (t.id === "opsAcct") setParams({ acct: t.value === "none" ? "__none" : t.value });
      if (t.id === "opsSetup") setParams({ setup: t.value });
      if (t.id === "opsTag") setParams({ tag: t.value });
      if (t.id === "opsCal") setParams({ calidad: t.value });
      if (t.id === "opsDesde") setParams({ desde: t.value });
      if (t.id === "opsHasta") setParams({ hasta: t.value });
      if (t.dataset.col) {
        const on = [...host.querySelectorAll("[data-col]")].filter(x => x.checked).map(x => x.dataset.col);
        saveCols(on.length ? on : ["date", "symbol", "pnl"]);
        paintOps();
      }
      if (t.id === "opsAll") {
        const ids = [...host.querySelectorAll("tbody tr")].map(tr => tr.dataset.id);
        ids.forEach(id => t.checked ? state.sel.add(id) : state.sel.delete(id));
        paintOps();
      }
      if (t.dataset.pick) {
        if (t.checked) state.sel.add(t.dataset.pick); else state.sel.delete(t.dataset.pick);
        const nSel = host.querySelector("#opsSelN");
        if (nSel) nSel.textContent = state.sel.size ? state.sel.size + " seleccionadas" : "";
      }
    });
    host.addEventListener("click", e => {
      const res = e.target.closest("[data-res]");
      if (res) { setParams({ resultado: res.dataset.res }); return; }
      if (e.target.id === "opsClear") { setParams({ q: "", acct: "", setup: "", tag: "", calidad: "", desde: "", hasta: "", resultado: "", simbolo: "", sesion: "", dow: "", hora: "", emocion: "" }); return; }
      if (e.target.id === "opsNew") { bridge().newTrade(); return; }
      if (e.target.id === "opsImport") { bridge().openImport(); return; }
      if (e.target.id === "opsExport") { bridge().exportCsv(rows().map(r => r.raw)); return; }
      if (e.target.id === "opsBackup") { bridge().openBackup(); return; }
      if (e.target.id === "opsBulkQBtn") {
        const q = host.querySelector("#opsBulkQ").value;
        if (q && state.sel.size) bridge().bulkPatch([...state.sel], { quality: q });
        return;
      }
      if (e.target.id === "opsBulkTagBtn") {
        const tag = host.querySelector("#opsBulkTag").value.trim();
        if (tag && state.sel.size) bridge().bulkPatch([...state.sel], { addTag: tag });
        return;
      }
      if (e.target.id === "opsBulkDel") {
        if (!state.sel.size) return;
        confirmDialog("¿Eliminar " + state.sel.size + " operaciones? Esta acción borra el registro.").then(ok => {
          if (!ok) return;
          bridge().deleteIds([...state.sel]);
          state.sel.clear();
        });
        return;
      }
      const sort = e.target.closest("[data-sort]");
      if (sort) {
        const k = sort.dataset.sort;
        state.dir = state.sort === k ? -state.dir : 1;
        state.sort = k;
        paintOps();
        return;
      }
      const act = e.target.closest("[data-act]");
      if (e.target.closest("input")) return;
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const id = tr.dataset.id;
      if (!act) { bridge().openTrade(id); return; }
      if (act.dataset.act === "edit" || act.dataset.act === "shot") bridge().openTrade(id);
      if (act.dataset.act === "study") bridge().openStudy(id);
      if (act.dataset.act === "diary") {
        const row = rows().find(r => r.id === id);
        setParams({ desde: row && row.date, hasta: row && row.date }, "diario");
      }
      if (act.dataset.act === "acct") {
        const row = rows().find(r => r.id === id);
        setParams({ acct: row && row.accountId }, "cuentas");
      }
    });
  }

  function paintCal() {
    const host = document.getElementById("calBody");
    if (!host || !bridge()) return;
    shell(host, `<div class="atlas-bar"><button type="button" id="atlasCalPrev" aria-label="Mes anterior">‹</button><h2 id="atlasCalTitle"></h2><button type="button" id="atlasCalNext" aria-label="Mes siguiente">›</button><span id="atlasCalCount" class="atlas-meta"></span></div><div data-atlas-out></div><div id="atlasCalDay"></div>`, bindCal);
    const now = state.cal || new Date();
    state.cal = new Date(now.getFullYear(), now.getMonth(), 1);
    const y = state.cal.getFullYear(), m = state.cal.getMonth();
    host.querySelector("#atlasCalTitle").textContent = state.cal.toLocaleString("es", { month: "long", year: "numeric" });
    const all = bridge().trades({ tipo: "futuros" });
    const by = new Map();
    all.forEach(t => {
      if (!t.date) return;
      const d = new Date(t.date + "T12:00:00");
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      const cur = by.get(t.date) || { pnl: 0, n: 0 };
      const p = num(t.pnlEff);
      if (p != null) { cur.pnl += p; cur.n++; }
      by.set(t.date, cur);
    });
    let wins = 0, losses = 0, net = 0;
    by.forEach(v => { net += v.pnl; if (v.pnl > 0) wins++; else if (v.pnl < 0) losses++; });
    host.querySelector("#atlasCalCount").textContent = wins + " días ganadores · " + losses + " perdedores · " + money(net);
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<span class="atlas-day mute"></span>`;
    for (let d = 1; d <= days; d++) {
      const iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const v = by.get(iso);
      cells += `<button type="button" class="atlas-day ${v ? clsPnl(v.pnl) : ""}" data-day="${iso}"><b>${d}</b><small>${v ? esc(money(v.pnl)) : ""}</small></button>`;
    }
    out(host).innerHTML = `<div class="atlas-month" role="grid">${["D", "L", "M", "X", "J", "V", "S"].map(x => `<span class="atlas-dow">${x}</span>`).join("")}${cells}</div>`;
  }
  function bindCal(host) {
    host.addEventListener("click", e => {
      if (e.target.id === "atlasCalPrev") { state.cal.setMonth(state.cal.getMonth() - 1); paintCal(); return; }
      if (e.target.id === "atlasCalNext") { state.cal.setMonth(state.cal.getMonth() + 1); paintCal(); return; }
      const day = e.target.closest("[data-day]");
      if (!day) return;
      const iso = day.dataset.day;
      const panel = host.querySelector("#atlasCalDay");
      panel.innerHTML = `<section class="atlas-card"><h3>${esc(iso)}</h3><div class="atlas-actions">
        <button type="button" data-go="operaciones">Operaciones del día</button>
        <button type="button" data-go="diario">Diario</button>
        <button type="button" data-go="futuros">Sesión en Futuros</button>
      </div></section>`;
      panel.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => {
        if (btn.dataset.go === "futuros") { bridge().openSession(iso); return; }
        setParams({ desde: iso, hasta: iso }, btn.dataset.go);
      }));
    });
  }

  function paintDia() {
    const host = document.getElementById("diaBody");
    if (!host || !bridge()) return;
    shell(host, diaShell(), bindDia);
    const b = bridge();
    const q = (host.querySelector("#diaQ") && host.querySelector("#diaQ").value || "").toLowerCase();
    const emo = host.querySelector("#diaEmo") ? host.querySelector("#diaEmo").value : "";
    let list = b.journalList().slice().sort((a, c) => String(c.date || "").localeCompare(String(a.date || "")));
    if (emo) list = list.filter(e => e.mood === emo);
    if (q) list = list.filter(e => (e.title + " " + e.body + " " + e.lesson).toLowerCase().includes(q));
    const p = params();
    if (p.get("desde") && p.get("desde") === p.get("hasta")) list = list.filter(e => e.date === p.get("desde")).concat(list.filter(e => e.date !== p.get("desde")));
    const box = out(host);
    if (state.diaView === "lecciones") {
      const lessons = list.filter(e => e.lesson);
      const tesis = b.thesisNotes();
      box.innerHTML = (lessons.length ? lessons.map(lessonCard).join("") : `<p class="atlas-empty" data-atlas-empty="1">No hay lecciones con este filtro.</p>`) +
        `<h3 class="atlas-h">Notas de tesis</h3>` +
        (tesis.length ? tesis.map(t => `<article class="atlas-card"><p class="atlas-meta">${esc(t.date)} · ${esc(t.title)} · solo lectura</p><p>${esc(t.mood)} ${esc(t.body)}</p></article>`).join("") : `<p class="atlas-note">No hay notas emocionales en tesis.</p>`);
    } else if (!list.length) box.innerHTML = `<p class="atlas-empty" data-atlas-empty="1">Todavía no hay entradas. La emoción sólo aparece si la registras.</p>`;
    else box.innerHTML = list.map(entryCard).join("");
    const moods = moodMap();
    const byMood = groupBy(rows().filter(r => r.pnl != null), r => r.emotion);
    const emoBox = host.querySelector("#diaEmoPnl");
    if (emoBox) emoBox.innerHTML = moods.size ? byMood.filter(x => x.key).map(x => `<button type="button" data-emocion="${esc(x.key)}">${esc(x.key)} · ${esc(money(x.pnl))} · ${x.n}</button>`).join("") : `<p class="atlas-note">No hay emoción registrada.</p>`;
  }
  function entryCard(e) {
    const trades = related(e);
    return `<article class="atlas-card" data-entry="${esc(e.id)}">
      <p class="atlas-meta"><span>${esc(e.date || "sin fecha")}</span> <span>${esc(e.mood || "sin emoción")}</span> <span>${esc(money(trades.pnl))}</span></p>
      <h3>${esc(e.title || "Sin título")}</h3>
      <p>${esc(e.body || "")}</p>
      ${e.lesson ? `<p><b>Lección.</b> ${esc(e.lesson)}</p>` : ""}
      <p class="atlas-meta">${trades.n} operaciones relacionadas</p>
      <div class="atlas-actions">
        <button type="button" data-edit="${esc(e.id)}">Editar</button>
        <button type="button" data-del="${esc(e.id)}">Eliminar</button>
        <button type="button" data-ops="${esc(e.date || "")}">Ver operaciones</button>
        ${e.lesson ? `<button type="button" data-link="${esc(e.id)}">Vincular con Estudio</button>` : ""}
      </div></article>`;
  }
  function lessonCard(e) {
    return `<article class="atlas-card"><p class="atlas-meta">${esc(e.date)} · ${esc(e.mood || "")}</p><h3>${esc(e.lesson)}</h3><p class="atlas-note">Procedencia: diario ${esc(e.id)}</p>
      <button type="button" data-link="${esc(e.id)}">Vincular con Estudio</button></article>`;
  }
  function related(e) {
    const ids = new Set(e.tradeIds || []);
    const list = bridge().trades({ tipo: "futuros", desde: e.date, hasta: e.date }).filter(t => t.date === e.date || ids.has(t.id));
    return { n: list.length, pnl: list.reduce((s, t) => s + (num(t.pnlEff) || 0), 0), first: list[0] };
  }
  function diaShell() {
    return `<div class="atlas-bar">
      <button type="button" class="atlas-primary" id="diaNew">Nueva entrada</button>
      <button type="button" id="diaQuick">Nota rápida</button>
      <button type="button" data-view="lista">Entradas</button>
      <button type="button" data-view="lecciones">Biblioteca de lecciones</button>
      <input id="diaQ" type="search" placeholder="Buscar" aria-label="Buscar en el diario">
      <select id="diaEmo" aria-label="Filtrar por emoción"><option value="">Todas las emociones</option>${MOODS.map(m => `<option>${esc(m)}</option>`).join("")}</select>
    </div>
    <form id="diaForm" class="atlas-card" hidden>
      <h3 id="diaFormTitle">Nueva entrada</h3>
      <input type="hidden" id="diaId">
      <label>Fecha <input id="diaDate" type="date" required></label>
      <label>Emoción <select id="diaMood">${MOODS.map(m => `<option>${esc(m)}</option>`).join("")}</select></label>
      <label>Título <input id="diaTitle" type="text" maxlength="120"></label>
      <label>Qué hice y qué sentí <textarea id="diaNote" maxlength="4000"></textarea></label>
      <label>Lección principal <textarea id="diaLesson" maxlength="1000"></textarea></label>
      <div class="atlas-actions"><button type="submit" class="atlas-primary">Guardar</button><button type="button" id="diaCancel">Cancelar</button></div>
    </form>
    <div id="diaEmoPnl" class="atlas-chips"></div>
    <div data-atlas-out></div>`;
  }
  function bindDia(host) {
    const form = host.querySelector("#diaForm");
    host.addEventListener("click", e => {
      if (e.target.dataset.view) { state.diaView = e.target.dataset.view; paintDia(); return; }
      if (e.target.id === "diaNew" || e.target.id === "diaQuick") { openForm(null, e.target.id === "diaQuick"); return; }
      if (e.target.id === "diaCancel") { form.hidden = true; return; }
      if (e.target.dataset.edit) { openForm(bridge().journalList().find(x => x.id === e.target.dataset.edit)); return; }
      if (e.target.dataset.del) {
        confirmDialog("¿Eliminar esta entrada del diario?").then(ok => {
          if (!ok) return;
          bridge().journalDelete(e.target.dataset.del);
          paintDia();
        });
        return;
      }
      if (e.target.dataset.ops) { setParams({ desde: e.target.dataset.ops, hasta: e.target.dataset.ops }, "operaciones"); return; }
      if (e.target.dataset.emocion) { setParams({ emocion: e.target.dataset.emocion }, "operaciones"); return; }
      if (e.target.dataset.link) {
        const entry = bridge().journalList().find(x => x.id === e.target.dataset.link);
        const rel = entry ? related(entry) : null;
        if (entry && rel && rel.first) bridge().openStudy(rel.first.id, entry.lesson, entry.id);
        else bridge().goto("estudio");
      }
    });
    host.querySelector("#diaQ").addEventListener("input", () => paintDia());
    host.querySelector("#diaEmo").addEventListener("change", () => paintDia());
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const id = host.querySelector("#diaId").value || bridge().uid("dj");
      const prev = bridge().journalList().find(x => x.id === id);
      bridge().journalUpsert({
        id, date: host.querySelector("#diaDate").value, mood: host.querySelector("#diaMood").value,
        title: host.querySelector("#diaTitle").value.trim(), body: host.querySelector("#diaNote").value.trim(),
        lesson: host.querySelector("#diaLesson").value.trim(),
        tradeIds: prev && prev.tradeIds || [], createdAt: prev && prev.createdAt || Date.now()
      });
      form.hidden = true;
      paintDia();
    });
    function openForm(entry, quick) {
      form.hidden = false;
      host.querySelector("#diaFormTitle").textContent = entry ? "Editar entrada" : (quick ? "Nota rápida" : "Nueva entrada");
      host.querySelector("#diaId").value = entry ? entry.id : "";
      host.querySelector("#diaDate").value = entry && entry.date || new Date().toISOString().slice(0, 10);
      host.querySelector("#diaMood").value = entry && entry.mood || "Neutral";
      host.querySelector("#diaTitle").value = entry && entry.title || "";
      host.querySelector("#diaNote").value = entry && entry.body || "";
      host.querySelector("#diaLesson").value = entry && entry.lesson || "";
      (quick ? host.querySelector("#diaNote") : host.querySelector("#diaTitle")).focus();
    }
  }

  function paintAna() {
    const host = document.getElementById("anaBody");
    if (!host || !bridge()) return;
    shell(host, `<p class="atlas-note">Gráficos del P&amp;L del journal. Pulsa un tramo para ver esas operaciones. Las métricas profundas están en Estadísticas.</p><div data-atlas-out></div>`, () => {});
    const list = rows().filter(r => r.pnl != null);
    if (!list.length) { out(host).innerHTML = `<p class="atlas-empty" data-atlas-empty="1">No hay operaciones cerradas en este filtro.</p>`; return; }
    const chrono = list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const blocks = [
      ["Curva de equity", equitySvg(chrono.map(r => r.pnl)), null],
      ["P&L por día de la semana", bars(bucket(list, r => r.dow), "dow"), "dow"],
      ["P&L por emoción", emotionBlock(list), "emocion"],
      ["P&L por sesión", bars(bucket(list, r => r.session), "sesion"), "sesion"],
      ["P&L por hora", bars(bucket(list, r => r.hour == null ? null : String(r.hour).padStart(2, "0")), "hora"), "hora"],
      ["Rendimiento por símbolo", bars(bucket(list, r => r.symbol), "simbolo"), "simbolo"],
      ["Rendimiento por setup", bars(bucket(list, r => r.setup || "sin setup"), "setup"), "setup"],
      ["Rendimiento por etiqueta", bars(tagBucket(list), "tag"), "tag"],
      ["Rendimiento por cuenta", bars(bucket(list, r => r.account || "sin cuenta"), "acctName"), "acctName"],
      ["Evolución mensual", bars(bucket(list, r => (r.date || "").slice(0, 7)), "mes"), "mes"]
    ];
    out(host).innerHTML = blocks.map(([title, body]) => `<section class="atlas-card"><h3>${esc(title)}</h3>${body}</section>`).join("") +
      `<p class="atlas-note"><a href="#edge">Abrir Estadísticas</a> para el catálogo cuantitativo. El P&amp;L de estos gráficos es el del journal.</p>`;
    out(host).querySelectorAll("[data-bucket]").forEach(btn => btn.addEventListener("click", () => {
      const k = btn.dataset.k, v = btn.dataset.v;
      if (k === "dow") setParams({ dow: String(DOW.indexOf(v)) }, "operaciones");
      else if (k === "sesion") setParams({ sesion: sessionId(v) }, "operaciones");
      else if (k === "hora") setParams({ hora: String(Number(v)) }, "operaciones");
      else if (k === "simbolo") setParams({ simbolo: v }, "operaciones");
      else if (k === "setup") {
        const hit = list.find(r => (r.setup || "sin setup") === v);
        setParams({ setup: hit && hit.setupId || "" }, "operaciones");
      } else if (k === "tag") setParams({ tag: v }, "operaciones");
      else if (k === "acctName") {
        const hit = list.find(r => (r.account || "sin cuenta") === v);
        setParams({ acct: hit && hit.accountId || "" }, "operaciones");
      } else if (k === "mes") {
        const [yy, mm] = v.split("-");
        const last = new Date(Number(yy), Number(mm), 0).getDate();
        setParams({ desde: v + "-01", hasta: v + "-" + String(last).padStart(2, "0") }, "operaciones");
      } else if (k === "emocion") setParams({ emocion: v }, "operaciones");
    }));
  }
  function sessionId(label) {
    const list = rows();
    const hit = list.find(r => r.session === label);
    return hit ? hit.sessionId : "";
  }
  function bucket(list, keyFn) {
    const m = new Map();
    list.forEach(r => {
      const k = keyFn(r);
      if (k == null || k === "") return;
      m.set(k, (m.get(k) || 0) + r.pnl);
    });
    return [...m.entries()];
  }
  function tagBucket(list) {
    const m = new Map();
    list.forEach(r => String(r.tags || "").split(",").map(s => s.trim()).filter(Boolean).forEach(tag => m.set(tag, (m.get(tag) || 0) + r.pnl)));
    return [...m.entries()];
  }
  function emotionBlock(list) {
    const withMood = list.filter(r => r.emotion);
    if (!withMood.length) return `<p class="atlas-note">No hay emoción registrada.</p>`;
    return bars(bucket(withMood, r => r.emotion), "emocion");
  }
  function bars(entries, key) {
    if (!entries.length) return `<p class="atlas-note">Sin datos en este corte.</p>`;
    const max = Math.max(...entries.map(e => Math.abs(e[1])), 1);
    const text = v => key === "hist" ? String(v) : money(v);
    return `<div class="atlas-bars">` + entries.map(([name, pnl]) => `<button type="button" class="atlas-bar-row" data-bucket="1" data-k="${esc(key)}" data-v="${esc(name)}">
      <span>${esc(name)}</span><i class="${key === "hist" ? "" : clsPnl(pnl)}" style="width:${Math.max(4, Math.abs(pnl) / max * 100)}%"></i><b class="${key === "hist" ? "" : clsPnl(pnl)}">${esc(text(pnl))}</b></button>`).join("") + `</div>`;
  }
  function equitySvg(pnls) {
    if (!pnls.length) return "";
    let eq = 0;
    const pts = pnls.map(p => (eq += p));
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts), span = (max - min) || 1;
    const w = 640, h = 160;
    const d = pts.map((v, i) => {
      const x = pts.length === 1 ? 0 : (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 12) - 6;
      return (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return `<svg class="atlas-eq" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva de equity"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"></path></svg>`;
  }

  function paintCorr() {
    const host = document.getElementById("corrBody");
    if (!host || !bridge()) return;
    shell(host, corrShell(), bindCorr);
    const list = rows().filter(r => r.pnl != null);
    const x = state.corrX, yKey = state.corrY;
    host.querySelector("#corrX").value = x;
    host.querySelector("#corrY").value = yKey;
    const numeric = { mae: "MAE (puntos)", mfe: "MFE (puntos)", qty: "Tamaño", hora: "Hora de entrada", risk: "Riesgo $" };
    const cats = { emocion: r => r.emotion, setup: r => r.setup, side: r => r.side, sesion: r => r.session, dow: r => r.dow, simbolo: r => r.symbol, tag: r => r.tags, cuenta: r => r.account };
    let chart = "", note = "La correlación no implica causalidad.";
    if (numeric[x]) {
      const pairs = list.map(r => [num(factor(r, x)), num(r.pnl)]).filter(p => p[0] != null && p[1] != null);
      const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
      note = r == null ? (pairs.length < 3 ? "No hay evidencia suficiente." : "Sin variación: no se puede calcular la correlación.") : describe(r, pairs.length);
      chart = r == null ? "" : scatter(pairs) + `<p class="atlas-metric">Pearson ${r.toFixed(2)} · ${pairs.length} observaciones</p>`;
    } else {
      const keyFn = x === "tag" ? null : cats[x];
      const groups = x === "tag" ? tagGroups(list) : groupBy(list, keyFn).filter(g => g.n);
      if (!groups.length) chart = `<p class="atlas-empty">No hay evidencia suficiente.</p>`;
      else chart = `<div class="atlas-scroll"><table class="atlas-table"><thead><tr><th>Segmento</th><th>Expectativa</th><th>Win rate</th><th>P&amp;L</th><th>n</th></tr></thead><tbody>` +
        groups.sort((a, b) => b.expectancy - a.expectancy).map(g => `<tr><td><button type="button" data-seg="${esc(g.key)}">${esc(g.key)}</button></td><td>${esc(money(g.expectancy))}</td><td>${pct(g.wr)}</td><td class="${clsPnl(g.pnl)}">${esc(money(g.pnl))}</td><td>${g.n}${g.n < SEGMENT_MIN ? " · muestra insuficiente" : ""}</td></tr>`).join("") +
        `</tbody></table></div>`;
    }
    out(host).innerHTML = influenceHtml(list) + contextHtml(list) + `<section class="atlas-card"><h3>Explorador</h3>` + chart + `<p class="atlas-note">${esc(note)}</p></section>`;
    out(host).querySelectorAll("[data-seg]").forEach(btn => btn.addEventListener("click", () => {
      const v = btn.dataset.seg;
      if (x === "simbolo") setParams({ simbolo: v }, "operaciones");
      else if (x === "setup") {
        const hit = list.find(r => r.setup === v);
        setParams({ setup: hit && hit.setupId || "" }, "operaciones");
      } else if (x === "cuenta") {
        const hit = list.find(r => r.account === v);
        setParams({ acct: hit && hit.accountId || "" }, "operaciones");
      } else if (x === "sesion") setParams({ sesion: sessionId(v) }, "operaciones");
      else if (x === "dow") setParams({ dow: String(DOW.indexOf(v)) }, "operaciones");
      else if (x === "emocion") setParams({ emocion: v }, "operaciones");
      else if (x === "side") setParams({ q: v }, "operaciones");
      else if (x === "tag") setParams({ tag: v }, "operaciones");
    }));
  }
  function influenceHtml(list) {
    const keys = [["mae", "MAE"], ["mfe", "MFE"], ["qty", "Tamaño"], ["hora", "Hora"], ["risk", "Riesgo $"]];
    const body = keys.map(([k, label]) => {
      const pairs = list.map(r => [num(factor(r, k)), num(r.pnl)]).filter(p => p[0] != null && p[1] != null);
      const coef = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
      const text = coef == null ? (pairs.length < 3 ? "No hay evidencia suficiente" : "Sin variación") : "Pearson " + coef.toFixed(2) + " · " + describe(coef, pairs.length);
      return `<p><b>${esc(label)}</b> · ${pairs.length} observaciones · ${esc(text)}</p>`;
    }).join("");
    return `<section class="atlas-card"><h3>Qué influye en el P&amp;L</h3>${body}<p class="atlas-note">Asociación, no causa. Una categoría no se convierte en número.</p></section>`;
  }
  function contextHtml(list) {
    const blocks = [
      ["Emoción", groupBy(list, r => r.emotion)],
      ["Setup", groupBy(list, r => r.setup)],
      ["Dirección", groupBy(list, r => r.side)],
      ["Sesión", groupBy(list, r => r.session)],
      ["Día", groupBy(list, r => r.dow)],
      ["Símbolo", groupBy(list, r => r.symbol)],
      ["Etiqueta", tagGroups(list)],
      ["Cuenta", groupBy(list, r => r.account)]
    ];
    const body = blocks.map(([label, groups]) => {
      const ready = groups.filter(g => g.n >= SEGMENT_MIN);
      if (ready.length < 2) return `<p><b>${esc(label)}</b> · No hay evidencia suficiente</p>`;
      const best = ready.slice().sort((a, b) => b.expectancy - a.expectancy)[0];
      const worst = ready.slice().sort((a, b) => a.expectancy - b.expectancy)[0];
      return `<p><b>${esc(label)}</b> · mejor ${esc(best.key)} · E ${esc(money(best.expectancy))} · WR ${pct(best.wr)} · n ${best.n} · peor ${esc(worst.key)} · E ${esc(money(worst.expectancy))} · n ${worst.n}</p>`;
    }).join("");
    return `<section class="atlas-card"><h3>Mejor y peor por contexto</h3>${body}</section>`;
  }
  function factor(r, x) {
    if (x === "mae") return r.mae;
    if (x === "mfe") return r.mfe;
    if (x === "qty") return r.qty;
    if (x === "hora") return r.hour;
    if (x === "risk") return r.risk;
    return null;
  }
  function describe(r, n) {
    const a = Math.abs(r);
    const mag = a < 0.1 ? "nula" : a < 0.3 ? "débil" : a < 0.5 ? "moderada" : "fuerte";
    const dir = r > 0 ? "positiva" : r < 0 ? "negativa" : "nula";
    return "Asociación " + mag + " " + dir + " (" + n + " observaciones). No es causalidad.";
  }
  function tagGroups(list) {
    const m = new Map();
    list.forEach(r => String(r.tags || "").split(",").map(s => s.trim()).filter(Boolean).forEach(tag => {
      const cur = m.get(tag) || { key: tag, n: 0, pnl: 0, wins: 0 };
      cur.n++; cur.pnl += r.pnl; if (r.pnl > 0) cur.wins++;
      m.set(tag, cur);
    }));
    return [...m.values()].map(x => Object.assign(x, { expectancy: x.pnl / x.n, wr: x.wins / x.n }));
  }
  function scatter(pairs) {
    const w = 640, h = 220, pad = 16;
    const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1;
    const dots = pairs.slice(0, 400).map(p => {
      const x = pad + ((p[0] - minX) / sx) * (w - pad * 2);
      const y = h - pad - ((p[1] - minY) / sy) * (h - pad * 2);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"></circle>`;
    }).join("");
    return `<svg class="atlas-eq" viewBox="0 0 ${w} ${h}" role="img" aria-label="Dispersión">${dots}</svg>`;
  }
  function corrShell() {
    const xs = [["mae", "MAE (puntos)"], ["mfe", "MFE (puntos)"], ["qty", "Tamaño"], ["hora", "Hora"], ["risk", "Riesgo $"],
      ["emocion", "Emoción"], ["setup", "Setup"], ["side", "Dirección"], ["sesion", "Sesión"], ["dow", "Día"], ["simbolo", "Símbolo"], ["tag", "Etiqueta"], ["cuenta", "Cuenta"]];
    return `<div class="atlas-bar">
      <label>Factor <select id="corrX">${xs.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label>
      <label>Resultado <select id="corrY"><option value="pnl">P&amp;L</option></select></label>
      <span class="atlas-note">Los filtros de la URL (cuenta, símbolo, setup, fechas) también aplican aquí.</span>
    </div><div data-atlas-out></div>`;
  }
  function bindCorr(host) {
    host.querySelector("#corrX").addEventListener("change", e => { state.corrX = e.target.value; paintCorr(); });
    host.querySelector("#corrY").addEventListener("change", e => { state.corrY = e.target.value; paintCorr(); });
  }

  function paintIns() {
    const host = document.getElementById("insBody");
    if (!host || !bridge()) return;
    shell(host, `<p class="atlas-note">Patrones con reglas fijas sobre operaciones reales. Una muestra corta no se presenta como ventaja.</p><div data-atlas-out></div>`, () => {});
    const cards = insightsOf(rows());
    out(host).innerHTML = cards.map(c => `<article class="atlas-card atlas-${esc(c.cls)}" data-insight="${esc(c.id)}">
      <p class="atlas-meta"><span>${esc(c.cls)}</span> <span>n ${c.sample}</span> <span>${esc(c.confidence || "")}</span></p>
      <h3>${esc(c.name)}</h3>
      <p class="atlas-metric">${esc(c.metric)}</p>
      <p>${esc(c.context || "")}</p>
      <div class="atlas-actions">
        <button type="button" data-ev="ops">Ver operaciones</button>
        <button type="button" data-ev="study">Revisar en Estudio</button>
        <button type="button" data-ev="ana">Ver análisis</button>
      </div></article>`).join("");
    out(host).querySelectorAll("article").forEach(card => {
      const ins = cards.find(c => c.id === card.dataset.insight);
      card.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        const ev = ins && ins.evidence || {};
        if (btn.dataset.ev === "ops") setParams(ev, "operaciones");
        else if (btn.dataset.ev === "ana") setParams(ev, "analitica");
        else bridge().goto("estudio");
      }));
    });
  }

  function paintInicio() {
    const host = document.getElementById("atlasInicio");
    if (!host || !bridge()) return;
    const list = bridge().trades({ tipo: "futuros" }).filter(t => num(t.pnlEff) != null);
    const st = statsOf(list.map(t => ({ pnl: t.pnlEff, r: t.rReal, date: t.date, time: t.time })));
    const dd = drawdownOf(list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => t.pnlEff));
    const recent = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
    const risk = bridge().riskLine();
    host.innerHTML = `<div class="atlas-kpis">
      ${kpi("P&L", money(st.net), clsPnl(st.net))}
      ${kpi("Win rate", pct(st.wr))}
      ${kpi("Profit factor", ratio(st.pf))}
      ${kpi("Expectancy", money(st.expectancy))}
      ${kpi("Drawdown", money(dd.max))}
      ${kpi("Riesgo", risk || "—")}
    </div>
    <section class="atlas-card"><h3>Curva de equity</h3>${list.length ? equitySvg(list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => num(t.pnlEff)).filter(v => v != null)) : `<p class="atlas-empty">Sin operaciones cerradas.</p>`}</section>
    <section class="atlas-card"><h3>Operaciones recientes</h3>${recent.map(t => `<button type="button" data-id="${esc(t.id)}" class="atlas-bar-row"><span>${esc(t.date)} ${esc(t.instrument || "")}</span><b class="${clsPnl(t.pnlEff)}">${esc(money(t.pnlEff))}</b></button>`).join("") || `<p class="atlas-note">Aún no hay cierres.</p>`}
      <div class="atlas-actions"><button type="button" data-go="diario">Diario</button><button type="button" data-go="estudio">Estudio</button><button type="button" data-go="operaciones">Operaciones</button></div>
    </section>`;
    host.querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => bridge().openTrade(btn.dataset.id)));
    host.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => bridge().goto(btn.dataset.go)));
  }
  function kpi(name, value, cls) {
    return `<article class="atlas-kpi"><span>${esc(name)}</span><strong class="${cls || ""}">${esc(value)}</strong></article>`;
  }
  function paintCuentas() {
    const host = document.getElementById("atlasCuentas");
    if (!host || !bridge()) return;
    const eco = bridge().economia();
    const ciclos = bridge().ciclos();
    const pnl = ciclos.reduce((s, c) => s + (num(c.pnl) || 0), 0);
    const caja = eco.costeDesconocido || eco.sinCobros ? null : eco.caja;
    host.innerHTML = `<div class="atlas-kpis">
      ${kpi("P&L de trading", money(pnl), clsPnl(pnl))}
      ${kpi("Payouts", eco.sinCobros ? "desconocido" : money(eco.payouts))}
      ${kpi("Costes", eco.costeDesconocido ? "desconocido" : money(eco.fees))}
      ${kpi("Caja real", caja == null ? "desconocido" : money(caja), caja == null ? "" : clsPnl(caja))}
    </div>
    <p class="atlas-note">El P&amp;L es resultado en la plataforma. La caja es lo cobrado menos lo pagado. Si no hay movimientos, el dato es desconocido, no cero. La administración de la cuenta sigue en esta pestaña.</p>
    <div class="atlas-scroll"><table class="atlas-table"><thead><tr><th>Cuenta</th><th>Estado</th><th>P&amp;L</th><th>Caja</th><th></th></tr></thead><tbody>` +
      ciclos.map(c => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.label || c.estado)}</td><td class="${clsPnl(c.pnl)}">${esc(money(c.pnl))}</td><td>${c.fees === 0 && c.payouts === 0 ? "desconocido" : esc(money(c.caja))}</td><td><button type="button" data-acct="${esc(c.id)}">Ver operaciones</button></td></tr>`).join("") +
      `</tbody></table></div>`;
    host.querySelectorAll("[data-acct]").forEach(btn => btn.addEventListener("click", () => setParams({ acct: btn.dataset.acct }, "operaciones")));
  }
  function paintEstrategias() {
    const host = document.getElementById("atlasEstrategias");
    if (!host || !bridge()) return;
    const books = bridge().playbooks().filter(p => p.type === "futuros" || p.kind === "futuros");
    const byId = Object.fromEntries(books.map(p => [p.id, p]));
    function rootId(p) {
      let cur = p, guard = 0;
      const seen = new Set();
      while (cur && cur.parentId && byId[cur.parentId] && !seen.has(cur.id) && guard++ < 12) {
        seen.add(cur.id); cur = byId[cur.parentId];
      }
      return (cur || p).id;
    }
    const groups = new Map();
    books.forEach(p => {
      const id = rootId(p);
      const arr = groups.get(id) || [];
      arr.push(p); groups.set(id, arr);
    });
    const trades = bridge().trades({ tipo: "futuros" });
    let html = "";
    groups.forEach(arr => {
      arr.sort((a, b) => (a.version || 1) - (b.version || 1));
      html += `<section class="atlas-card"><h3>${esc(arr[0].name || "Estrategia")}</h3>` + arr.map(p => {
        const own = trades.filter(t => t.setupId === p.id && num(t.pnlEff) != null);
        const st = statsOf(own.map(t => ({ pnl: t.pnlEff, r: t.rReal })));
        const dd = drawdownOf(own.map(t => t.pnlEff));
        const label = own.length < 30 ? "Muestra insuficiente: no certifica estabilidad." : "Muestra de " + own.length + " operaciones. El win rate solo no certifica estabilidad.";
        return `<article class="atlas-version"><p class="atlas-meta">v${esc(p.version || "sin versión")} · ${esc(p.status || "sin estado")} · ${own.length} operaciones</p>
          <p>E ${esc(money(st.expectancy))} · PF ${esc(ratio(st.pf))} · DD ${esc(money(dd.max))} · R medio ${st.expectancyR == null ? "—" : esc(st.expectancyR.toFixed(2))}</p>
          <p class="atlas-note">${label} Esta versión no mezcla operaciones de otra.</p>
          <button type="button" data-setup="${esc(p.id)}">Ver en Analítica</button></article>`;
      }).join("") + `</section>`;
    });
    host.innerHTML = html || `<p class="atlas-empty">No hay estrategias de futuros.</p>`;
    host.querySelectorAll("[data-setup]").forEach(btn => btn.addEventListener("click", () => setParams({ setup: btn.dataset.setup }, "analitica")));
  }
  function paintEdge() {
    const host = document.getElementById("atlasEdge");
    if (!host || !bridge()) return;
    const series = bridge().edgeSeries();
    const link = `<div class="atlas-actions"><button type="button" id="edgeVerOps">Ver operaciones</button></div>`;
    if (!series.length) {
      host.innerHTML = link + `<p class="atlas-note">Sin serie de Estadísticas en el filtro actual.</p>`;
      host.querySelector("#edgeVerOps").addEventListener("click", () => bridge().goto("operaciones"));
      return;
    }
    const pnls = series.map(x => x.pnl);
    const st = statsOf(pnls);
    const dd = drawdownOf(pnls);
    const min = Math.min(...pnls), max = Math.max(...pnls);
    const step = (max - min) / 8 || 1;
    const buckets = Array.from({ length: 8 }, (_, i) => ({ lo: min + i * step, n: 0 }));
    pnls.forEach(p => { const i = Math.min(7, Math.floor((p - min) / step)); buckets[i].n++; });
    host.innerHTML = link + `<section class="atlas-card"><h3>Histograma de P&amp;L</h3><p class="atlas-note">Serie de Estadísticas (neto de esa pestaña), no una fórmula nueva.</p>${bars(buckets.map(b => [money(b.lo), b.n]), "hist")}</section>
      <section class="atlas-card"><h3>Underwater</h3><p class="atlas-metric">Máximo ${esc(money(dd.max))} · duración ${dd.duration} operaciones</p>${equitySvg(dd.underwater)}</section>
      <p class="atlas-note">Mediana ${esc(money(st.median))} · P25 ${esc(money(st.p25))} · P75 ${esc(money(st.p75))}. El catálogo completo sigue en esta pestaña.</p>`;
    host.querySelector("#edgeVerOps").addEventListener("click", () => bridge().goto("operaciones"));
  }

  function confirmDialog(text) {
    return new Promise(resolve => {
      let root = document.getElementById("atlasConfirm");
      if (!root) {
        root = document.createElement("div");
        root.id = "atlasConfirm";
        root.className = "atlas-modal";
        root.innerHTML = `<div class="atlas-dialog" role="alertdialog" aria-modal="true" aria-labelledby="atlasConfirmT"><h2 id="atlasConfirmT">Confirmar</h2><p id="atlasConfirmP"></p><div class="atlas-actions"><button type="button" id="atlasConfirmNo">Cancelar</button><button type="button" id="atlasConfirmYes">Confirmar</button></div></div>`;
        document.body.appendChild(root);
      }
      root.hidden = false;
      root.querySelector("#atlasConfirmP").textContent = text;
      const done = (v) => { root.hidden = true; resolve(v); };
      root.querySelector("#atlasConfirmYes").onclick = () => done(true);
      root.querySelector("#atlasConfirmNo").onclick = () => done(false);
      root.querySelector("#atlasConfirmNo").focus();
    });
  }

  function sync(name) {
    const tab = name || (document.querySelector(".tab.active") || {}).dataset.tab;
    try {
      if (tab === "operaciones") paintOps();
      else if (tab === "calendario") paintCal();
      else if (tab === "diario") paintDia();
      else if (tab === "analitica") paintAna();
      else if (tab === "correlaciones") paintCorr();
      else if (tab === "insights") paintIns();
      else if (tab === "cabina") paintInicio();
      else if (tab === "cuentas") paintCuentas();
      else if (tab === "playbook") paintEstrategias();
      else if (tab === "edge") paintEdge();
    } catch (e) { try { console.warn(e); } catch (x) { /* sin consola */ } }
    const b = bridge();
    if (b && document.documentElement.lang === "en" && b.traduce) b.traduce();
  }
  function mount() {
    const src = document.getElementById("saveState");
    const dst = document.getElementById("atlasSync");
    if (src && dst) {
      const copy = () => { dst.textContent = src.textContent || ""; };
      copy();
      new MutationObserver(copy).observe(src, { childList: true, characterData: true, subtree: true });
    }
    const cuenta = document.getElementById("atlasCuenta");
    if (cuenta) cuenta.addEventListener("click", () => { const b = document.getElementById("cuentaBtn"); if (b) b.click(); });
    sync();
  }
  api.sync = sync;
  api.mount = mount;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})(typeof globalThis !== "undefined" ? globalThis : this);
