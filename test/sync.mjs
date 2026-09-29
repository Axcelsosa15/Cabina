/* Los 10 escenarios de la reestructuración, contra la app real.

   La prueba no comprueba que el código compile: comprueba que el MISMO número
   aparece en CABINA y en FUTUROS después de cada escritura, sin recargar. Todo
   se escribe por las puertas que usa una persona (el editor de operaciones, los
   botones de la tarjeta, los selectores) y se lee del DOM de las dos pestañas. */
import { chromium } from 'playwright';

const errs = [], fallos = [];
const F = new Date('2026-09-18T14:00:00Z').getTime();
const b = await chromium.launch();

const CUENTA = (id, name, size, dd) => ({ id, firm: 'Firma', name, kind: 'Evaluación', size, dd,
  ddKind: 'trailing_lock', trailBase: 'intradia', limit: 50, total: 0, best: 0, target: 1500,
  status: 'activa', ledger: [] });
const SEM = { settings: { meta: {}, accounts: [CUENTA('a1', 'Evaluación 25K', 25000, 1000)],
  rules: [
    { id: 'onlymnq',   kind: 'fixed', name: 'Solo MNQ', why: '', role: 'instrument', allow: 'MNQ' },
    { id: 'maxloss',   kind: 'num', name: 'Pérdida máxima del día', why: '', value: 200, prefix: '$', unit: '', role: 'maxLoss' },
    { id: 'maxlosses', kind: 'num', name: 'Pérdidas seguidas → cierre', why: '', value: 2, prefix: '', unit: 'ops', role: 'maxLosses' },
    { id: 'maxgain',   kind: 'num', name: 'Tope de ganancia del día', why: '', value: 468, prefix: '$', unit: '', role: 'maxGain' },
    { id: 'contracts', kind: 'num', name: 'Contratos máximos', why: '', value: 2, prefix: '', unit: 'MNQ', role: 'maxContracts' },
    { id: 'nochange',  kind: 'fixed', name: 'Sin cambios al protocolo', why: '', role: '' },
  ] } };

const ctx = await b.newContext({ viewport: { width: 1500, height: 1500 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
/* La semilla se siembra UNA vez. addInitScript corre en cada navegación, así
   que sin la guarda el refresh del test 10 restauraría el estado inicial y la
   prueba de persistencia se aprobaría a sí misma sin probar nada. */
await p.addInitScript(`try{if(!localStorage.getItem('cabina-mnq:v1'))localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/preview.html');
await p.waitForTimeout(1200);

/* ---------- utilidades ---------- */
const tab = async n => { await p.click(`.tabbtn[data-tab="${n}"]`); await p.waitForTimeout(280); };
const num = s => { const m = String(s ?? '').replace(/[^\d.,\-]/g, '').replace(/,/g, ''); const v = parseFloat(m); return Number.isFinite(v) ? v : null; };

// P&L en MNQ: $2 por punto. Precio de salida para un resultado exacto.
const salida = (usd, qty) => 21000 + usd / (2 * qty);

async function crearOp({ usd, qty = 1, fecha = '2026-09-18', hora = '09:30', acct = 'a1', instr = 'MNQ', desde = 'futuros' }) {
  if (desde === 'cabina') {
    await tab('cabina');
    await p.click(`.acct[data-id="${acct}"] button[data-act="newtrade"]`);
  } else {
    await tab('futuros');
    await p.click('#ftNew');
  }
  await p.waitForTimeout(280);
  await p.fill('#ef_date', fecha); await p.fill('#ef_time', hora);
  await p.fill('#ef_instrument', instr); await p.fill('#ef_qty', String(qty));
  await p.selectOption('#ef_accountId', acct);
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20990');
  await p.fill('#ef_exit', String(salida(usd, qty)));
  await p.click('#edSave'); await p.waitForTimeout(420);
}

// Los siete números que las dos pestañas tienen que decir igual.
async function lee(acct = 'a1') {
  await tab('cabina'); await p.waitForTimeout(220);
  const cab = await p.evaluate(id => {
    const c = document.querySelector(`.acct[data-id="${id}"]`); if (!c) return null;
    const txt = l => { for (const n of c.querySelectorAll('.lab, .l, .k, dt, .cap-l')) if (n.textContent.trim().toLowerCase().startsWith(l)) { const v = n.nextElementSibling || n.parentElement.querySelector('.v, .val, dd'); return v ? v.textContent.trim() : null; } return null; };
    return { texto: c.innerText, ganancia: txt('ganancia total'), balance: txt('balance') };
  }, acct);
  await tab('futuros'); await p.waitForTimeout(260);
  const fut = await p.evaluate(() => {
    const t = {}; document.querySelectorAll('#ftTiles .tile').forEach(x => {
      const l = x.querySelector('.lab'), v = x.querySelector('.v'); if (l && v) t[l.textContent.trim()] = v.textContent.trim(); });
    return t;
  });
  // y lo que dice la capa de datos por dentro, para contrastar el DOM con la fuente
  const capa = await p.evaluate(id => {
    const g = FUT.calculateAccountStats(id), c = FUT.calculateConsistency(id), r = FUT.evaluateRules(id);
    return { total: g.total, best: g.best, balance: g.balance, pico: g.peak, suelo: g.th, colchon: g.cushion,
             ratio: c.ratio, required: c.required, additional: c.additional,
             status: r.status, canTrade: r.canTrade, violaciones: r.violations.map(v => v.id), avisos: r.warnings.map(v => v.id) };
  }, acct);
  return { cab, fut, capa };
}
const ok = (cond, etiqueta, detalle) => { console.log(`  ${cond ? '✅' : '❌'} ${etiqueta}${detalle != null ? '   ' + detalle : ''}`); if (!cond) fallos.push(etiqueta); };
const cerca = (a, b2, tol = 0.005) => a != null && Math.abs(a - b2) <= tol;

/* ═══════ TEST 1 — CREAR OPERACIÓN ═══════ */
console.log('\n═══ TEST 1 · crear +$170 desde FUTUROS ═══');
const antes = await lee();
await crearOp({ usd: 170, fecha: '2026-09-17' });
const t1 = await lee();
ok(t1.capa.total === 170, 'P&L de la cuenta = 170', t1.capa.total);
ok(t1.capa.balance === 25170, 'balance = 25.170', t1.capa.balance);
ok(t1.capa.best === 170, 'mejor día = 170', t1.capa.best);
ok(/170/.test(t1.cab.texto), 'CABINA muestra el número', null);
ok(num(t1.fut['P&L neto']) === 170, 'FUTUROS P&L neto = 170', t1.fut['P&L neto']);
ok(t1.capa.total !== antes.capa.total, 'ambas cambiaron sin recargar');

/* ═══════ TEST 1b — CREAR DESDE CABINA ═══════ */
console.log('\n═══ TEST 1b · crear +$30 desde CABINA (botón de la tarjeta) ═══');
await crearOp({ usd: 30, fecha: '2026-09-17', hora: '11:00', desde: 'cabina' });
const t1b = await lee();
ok(t1b.capa.total === 200, 'la cuenta suma la operación creada en CABINA', t1b.capa.total);
ok(num(t1b.fut['P&L neto']) === 200, 'FUTUROS la ve sin recargar', t1b.fut['P&L neto']);
const enDiario = await p.evaluate(() => {
  document.querySelector('#ftSeg button[data-v="diario"]').click();
  return new Promise(r => setTimeout(() => r(document.querySelector('.ftview[data-v="diario"]').innerText), 400));
});
ok(/\$30|30\.00|\b30\b/.test(enDiario), 'y aparece en el Diario de FUTUROS');
// se deshace para no mover los números exactos del test 2
await p.evaluate(() => FUT.deleteTrade(FUT.trades('a1').find(t => t.pnlEff === 30).id));
await p.waitForTimeout(350);
ok((await p.evaluate(() => FUT.calculateAccountStats('a1').total)) === 170, 'al borrarla se vuelve a 170');

/* ═══════ TEST 2 — SEGUNDA OPERACIÓN · consistencia exacta ═══════ */
console.log('\n═══ TEST 2 · +$145 otro día → 315 / 170 / 53,97% ═══');
await crearOp({ usd: 145, fecha: '2026-09-18' });
const t2 = await lee();
ok(t2.capa.total === 315, 'ganancia total = 315', t2.capa.total);
ok(t2.capa.best === 170, 'mejor día = 170', t2.capa.best);
ok(cerca(t2.capa.ratio * 100, 53.968253, 0.001), 'consistencia = 53,968…%', (t2.capa.ratio * 100).toFixed(4));
ok(t2.capa.required === 340, 'ganancia total requerida = 340', t2.capa.required);
ok(t2.capa.additional === 25, 'falta exactamente 25 (no 24,50)', t2.capa.additional);
ok(/53[.,]97|54/.test(t2.cab.texto), 'CABINA imprime la consistencia', null);

/* ═══════ TEST 3 — EDITAR ═══════ */
console.log('\n═══ TEST 3 · editar +$170 → +$100 ═══');
await tab('futuros');
const idOp = await p.evaluate(() => FUT.trades('a1').find(t => t.pnlEff === 170).id);
await p.evaluate(id => FUT.updateTrade(id, { exit: 21050 }), idOp);
await p.waitForTimeout(400);
const t3 = await lee();
ok(t3.capa.total === 245, 'total = 245', t3.capa.total);
ok(t3.capa.best === 145, 'mejor día pasa a ser 145', t3.capa.best);
ok(cerca(t3.capa.ratio * 100, 59.183673, 0.001), 'consistencia recalculada', (t3.capa.ratio * 100).toFixed(4));
ok(num(t3.fut['P&L neto']) === 245, 'FUTUROS al día', t3.fut['P&L neto']);
ok(/245/.test(t3.cab.texto), 'CABINA al día', null);

/* ═══════ TEST 4 — ELIMINAR ═══════ */
console.log('\n═══ TEST 4 · eliminar la operación editada ═══');
await p.evaluate(id => FUT.deleteTrade(id), idOp);
await p.waitForTimeout(400);
const t4 = await lee();
ok(t4.capa.total === 145, 'total = 145', t4.capa.total);
ok(t4.capa.best === 145, 'mejor día = 145', t4.capa.best);
ok(num(t4.fut['P&L neto']) === 145, 'FUTUROS al día', t4.fut['P&L neto']);
ok(/145/.test(t4.cab.texto), 'CABINA al día', null);

/* ═══════ TEST 5 — PÉRDIDA DIARIA ═══════ */
console.log('\n═══ TEST 5 · −$200 hoy con tope de $200 ═══');
// el tope mira el NETO del día: se vacía hoy para que −200 sea el neto y no la suma bruta
await p.evaluate(() => FUT.trades('a1').filter(t => t.date === '2026-09-18').forEach(t => FUT.deleteTrade(t.id)));
await p.waitForTimeout(300);
await crearOp({ usd: -200, fecha: '2026-09-18', hora: '10:30' });
const t5 = await lee();
ok(t5.capa.status === 'LOCKED', 'estado = LOCKED', t5.capa.status);
ok(t5.capa.canTrade === false, 'canTrade = false');
const est5 = await p.evaluate(() => {
  const c = document.querySelector('.acct[data-id="a1"]');
  return { cabina: c ? /BLOQUEAD/i.test(c.innerText) : null,
           futuros: /BLOQUEAD/i.test(document.querySelector('#ftAccts')?.innerText || '') };
});
ok(est5.cabina === true, 'CABINA dice BLOQUEADA');
await tab('futuros'); await p.click('#ftSeg button[data-v="cuentas"]'); await p.waitForTimeout(300);
const futBloq = await p.evaluate(() => /BLOQUEAD/i.test(document.querySelector('#ftAccts').innerText));
ok(futBloq === true, 'FUTUROS dice BLOQUEADA — el mismo motor');

/* ═══════ TEST 6 — DOS PÉRDIDAS SEGUIDAS ═══════ */
console.log('\n═══ TEST 6 · dos pérdidas seguidas ═══');
// se limpia el día y se dejan sólo dos pérdidas pequeñas: el cierre lo tiene que
// dar la RACHA, no el tope de dinero
await p.evaluate(() => FUT.trades('a1').filter(t => t.date === '2026-09-18').forEach(t => FUT.deleteTrade(t.id)));
await p.waitForTimeout(300);
await crearOp({ usd: -20, fecha: '2026-09-18', hora: '09:40' });
await crearOp({ usd: -20, fecha: '2026-09-18', hora: '10:40' });
const t6 = await p.evaluate(() => FUT.evaluateRules('a1'));
ok(t6.status === 'LOCKED', 'estado = LOCKED por racha', t6.status);
ok(t6.consecutiveLosses === 2, 'pérdidas seguidas = 2', t6.consecutiveLosses);
ok(t6.lockedUntil === '2026-09-18', 'lockedUntil = el día evaluado', t6.lockedUntil);
ok(t6.violations.some(v => v.role === 'maxLosses'), 'la violación viene listada', JSON.stringify(t6.violations.map(v => v.id)));

/* ═══════ TEST 7 — CONTRATOS MÁXIMOS ═══════ */
console.log('\n═══ TEST 7 · 3 MNQ con un máximo de 2 ═══');
await crearOp({ usd: 12, qty: 3, fecha: '2026-09-16' });
const t7 = await p.evaluate(() => FUT.evaluateRules('a1', '2026-09-16'));
ok(t7.oversized === 1, 'una operación pasada de tamaño', t7.oversized);
ok(t7.violations.some(v => v.role === 'maxContracts'), 'violación de contratos listada');
ok(['RESTRICTED', 'LOCKED', 'FAILED'].includes(t7.status), 'estado marcado', t7.status);

/* ═══════ TEST 8 — VARIAS CUENTAS ═══════ */
console.log('\n═══ TEST 8 · dos cuentas, historiales separados ═══');
await p.evaluate(() => FUT.createAccount({ id: 'a2', firm: 'Firma', name: 'Evaluación 50K', kind: 'Evaluación',
  size: 50000, dd: 2000, ddKind: 'trailing_lock', trailBase: 'intradia', limit: 50, total: 0, best: 0, status: 'activa', ledger: [] }));
await p.waitForTimeout(300);
await crearOp({ usd: 400, fecha: '2026-09-15', acct: 'a2' });
const t8 = await p.evaluate(() => ({
  a1: { total: FUT.calculateAccountStats('a1').total, balance: FUT.calculateAccountStats('a1').balance, dd: FUT.calculateDrawdown('a1').max, n: FUT.trades('a1').length },
  a2: { total: FUT.calculateAccountStats('a2').total, balance: FUT.calculateAccountStats('a2').balance, dd: FUT.calculateDrawdown('a2').max, n: FUT.trades('a2').length },
}));
ok(t8.a2.total === 400, 'la cuenta nueva tiene su propio P&L', t8.a2.total);
ok(t8.a2.balance === 50400, 'su propio balance', t8.a2.balance);
ok(t8.a2.dd === 2000 && t8.a1.dd === 1000, 'su propio drawdown', `${t8.a1.dd} / ${t8.a2.dd}`);
ok(t8.a1.total !== t8.a2.total && t8.a1.n !== t8.a2.n, 'los historiales no se mezclan', JSON.stringify(t8));

/* ═══════ TEST 9 — SELECCIÓN COMPARTIDA ═══════ */
console.log('\n═══ TEST 9 · seleccionar en FUTUROS, mirar CABINA ═══');
await tab('futuros');
await p.selectOption('#ftAcct', 'a1'); await p.waitForTimeout(400);
let s9 = await p.evaluate(() => ({ ft: document.querySelector('#ftAcct').value, cab: document.querySelector('#cabAcct').value,
  marcada: document.querySelector('.acct.sel')?.dataset.id || null, capa: FUT.selectedAccountId() }));
ok(s9.cab === 'a1', 'CABINA entiende que la cuenta es a1', JSON.stringify(s9));
ok(s9.marcada === 'a1', 'la tarjeta de CABINA queda marcada', s9.marcada);
await tab('futuros');
await p.selectOption('#ftAcct', 'a2'); await p.waitForTimeout(400);
s9 = await p.evaluate(() => ({ cab: document.querySelector('#cabAcct').value, marcada: document.querySelector('.acct.sel')?.dataset.id || null }));
ok(s9.cab === 'a2' && s9.marcada === 'a2', 'cambiar en FUTUROS cambia CABINA', JSON.stringify(s9));
// y al revés
await tab('cabina');
await p.selectOption('#cabAcct', 'a1'); await p.waitForTimeout(400);
const s9b = await p.evaluate(() => ({ ft: document.querySelector('#ftAcct').value, capa: FUT.selectedAccountId() }));
ok(s9b.ft === 'a1' && s9b.capa === 'a1', 'cambiar en CABINA cambia FUTUROS', JSON.stringify(s9b));

/* ═══════ TEST 9b — CAMBIAR AJUSTES DE LA CUENTA ═══════ */
console.log('\n═══ TEST 9b · cambiar el drawdown de la cuenta desde CABINA ═══');
await tab('cabina');
await p.click('.acct[data-id="a1"] button[data-act="cfg"]:visible');
await p.waitForTimeout(350);
await p.fill('#ef_dd', '1500');
await p.click('#edSave'); await p.waitForTimeout(450);
const t9b = await p.evaluate(() => {
  const dd = FUT.calculateDrawdown('a1');
  return { max: dd.max, suelo: dd.floor, colchon: dd.buffer,
           futuros: (document.querySelector('#ftAccts') || {}).innerText || '' };
});
ok(t9b.max === 1500, 'el motor ya usa el drawdown nuevo', t9b.max);
await tab('futuros'); await p.click('#ftSeg button[data-v="cuentas"]'); await p.waitForTimeout(350);
const enFut = await p.evaluate(() => document.querySelector('#ftAccts').innerText);
ok(/1[.,]?500/.test(enFut), 'FUTUROS lo refleja sin recargar', (enFut.match(/.{0,18}1[.,]?500.{0,10}/) || [''])[0].replace(/\n/g, ' '));
await p.evaluate(() => FUT.updateAccount('a1', { dd: 1000 })); await p.waitForTimeout(350);
ok((await p.evaluate(() => FUT.calculateDrawdown('a1').max)) === 1000, 'y se puede deshacer por la misma puerta');

/* ═══════ TEST 10 — PERSISTENCIA ═══════ */
/* El refresh se hace abriendo una pestaña NUEVA con lo que quedó escrito en
   localStorage, no con page.reload(): sobre file:// Chromium tira el almacén al
   recargar de forma intermitente, y entonces la prueba mediría el navegador y no
   la app. Lo que interesa comprobar es justo lo mismo: que TODO lo necesario se
   escribió, y que releerlo devuelve los mismos números. */
console.log('\n═══ TEST 10 · abrir de cero con lo guardado ═══');
const foto = pg => pg.evaluate(() => ({
  a1: FUT.calculateAccountStats('a1').total, a2: FUT.calculateAccountStats('a2').total,
  balance1: FUT.calculateAccountStats('a1').balance, balance2: FUT.calculateAccountStats('a2').balance,
  n: FUT.trades().length, sel: FUT.selectedAccountId(), cuentas: FUT.accounts().length,
  reglas: FUT.rules().map(r => r.id + ':' + (r.value ?? r.allow ?? '')).join('|'),
  estado: FUT.evaluateRules('a1').status,
}));
await p.waitForTimeout(900);  // persistSettings va con debounce de 500 ms
const pre = await foto(p);
const guardado = await p.evaluate(() => localStorage.getItem('cabina-mnq:v1'));
const p2 = await ctx.newPage();
p2.on('pageerror', e => errs.push('PAGEERROR(recarga): ' + e.message));
await p2.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p2.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(guardado)});}catch(e){}`);
await p2.goto('file://' + process.cwd() + '/preview.html'); await p2.waitForTimeout(1400);
const post = await foto(p2);
/* ANCLAJE. Comparar una foto de la app contra otra foto de la app no distingue
   «todo sobrevive» de «todo está vacío en los dos lados»: si foto() devolviera
   null en cada campo, `pre === post` pasaría igual y esta prueba diría que la
   persistencia funciona. Es la diferencia entre PASAR y demostrar lo que se
   busca, y el mismo agujero que tenía borrar.mjs: una aserción cierta por un
   motivo equivocado. Así que primero se exige que la foto de antes tenga
   números de verdad; después la comparación significa algo. */
const solida = o => Number.isFinite(o.a1) && Number.isFinite(o.a2)
  && Number.isFinite(o.balance1) && Number.isFinite(o.balance2)
  && o.n > 0 && o.cuentas > 0 && !!o.reglas && !!o.sel && !!o.estado;
ok(solida(pre), 'la foto de ANTES tiene números de verdad, no nulls', JSON.stringify(pre));

ok(JSON.stringify(pre) === JSON.stringify(post), 'todo sobrevive (operaciones, cuentas, reglas y selección)',
   `\n     antes: ${JSON.stringify(pre)}\n     luego: ${JSON.stringify(post)}`);
ok(post.sel === 'a1', 'la cuenta seleccionada también se guarda', post.sel);
await p2.close();

/* ═══════ EXTRA — los filtros NO contaminan las métricas de cuenta ═══════ */
console.log('\n═══ EXTRA · filtrar el análisis no mueve el balance ═══');
await tab('futuros');
const tile = () => p.evaluate(() => { const t = [...document.querySelectorAll('#ftTiles .tile')]
  .find(x => x.querySelector('.lab') && x.querySelector('.lab').textContent.trim().startsWith('P&L')); return t ? t.querySelector('.v').textContent.trim() : null; });
const cuentaDe = () => p.evaluate(() => ({ balance: FUT.calculateAccountStats('a1').balance,
  colchon: FUT.calculateDrawdown('a1').buffer, total: FUT.calculateAccountStats('a1').total }));
/* Se filtra por un instrumento que SÍ existe pero no es el de la mayoría. Un
   filtro que no casa con nada se limpia solo (a propósito: un filtro apuntando a
   un instrumento borrado vaciaba la vista en silencio), así que para medir esto
   hace falta un segundo instrumento de verdad. */
await crearOp({ usd: 40, fecha: '2026-09-15', hora: '09:30', instr: 'MES' });
await p.evaluate(() => FUT.setFilters({ instr: '' })); await p.waitForTimeout(300);
const sinFiltro = { cuenta: await cuentaDe(), tile: await tile() };
await p.evaluate(() => FUT.setFilters({ instr: 'MES' })); await p.waitForTimeout(350);
const conFiltro = { cuenta: await cuentaDe(), tile: await tile() };
ok(JSON.stringify(sinFiltro.cuenta) === JSON.stringify(conFiltro.cuenta),
   'balance, colchón y ganancia de la CUENTA no cambian al filtrar',
   `${JSON.stringify(sinFiltro.cuenta)} → ${JSON.stringify(conFiltro.cuenta)}`);
ok(sinFiltro.tile !== conFiltro.tile, 'el ANÁLISIS sí cambia (es lo que se está filtrando)',
   `${sinFiltro.tile} → ${conFiltro.tile}`);
await p.evaluate(() => FUT.setFilters({ instr: '' })); await p.waitForTimeout(300);

/* ═══════ EXTRA — casos límite ═══════ */
console.log('\n═══ EXTRA · 0 operaciones, divisiones por cero, NaN ═══');
const lim = await p.evaluate(() => {
  FUT.createAccount({ id: 'a3', firm: 'X', name: 'Cuenta vacía', size: 0, dd: 0, limit: 50, total: 0, best: 0, status: 'activa', ledger: [] });
  const r = { stats: FUT.calculateTradeStats('a3'), cons: FUT.calculateConsistency('a3'), dd: FUT.calculateDrawdown('a3'),
              pf: FUT.calculateProfitFactor('a3'), wr: FUT.calculateWinRate('a3'), exp: FUT.calculateExpectancy('a3'),
              sqn: FUT.calculateSQN('a3'), rachas: FUT.calculateStreaks('a3'), reglas: FUT.evaluateRules('a3') };
  return JSON.parse(JSON.stringify(r, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NO-FINITO:' + v : v)));
});
const crudo = JSON.stringify(lim);
ok(!/NO-FINITO/.test(crudo), 'ningún NaN/Infinity con una cuenta vacía', (crudo.match(/NO-FINITO:[^",]*/g) || []).join(' '));
ok(lim.pf.valor === null && lim.wr.valor === null, 'profit factor y win rate son null, no 0 ni ∞');
/* Una cuenta sin tamaño, sin drawdown y sin pérdida máxima escrita ya NO se
   presenta como LISTA: está sin vigilar, que no es lo mismo. Se puede operar
   —eso lo decide él— pero la cabina no dice que todo va bien cuando no tiene
   con qué saberlo. */
ok(lim.reglas.status === 'WARNING' && lim.reglas.canTrade === true, 'cuenta sin contrato = AVISO, y aun así operable', lim.reglas.status);
ok(/falta escribir/i.test(lim.reglas.reason), 'y dice qué falta', lim.reglas.reason.slice(0, 70));
const textoApp = await p.evaluate(() => document.body.innerText);
ok(!/\bNaN\b|\bundefined\b|\$NaN/.test(textoApp), 'la pantalla no imprime NaN ni undefined',
   (textoApp.match(/.{0,25}(NaN|undefined).{0,25}/) || [''])[0]);

/* ═══════ EXTRA — la operación que cambia de día y de cuenta ═══════ */
console.log('\n═══ EXTRA · mover una operación de día y de cuenta ═══');
const mover = await p.evaluate(() => {
  const id = FUT.createTrade({ accountId: 'a1', instrument: 'MNQ', direction: 'long', qty: 1,
    date: '2026-09-14', time: '09:30', entry: 21000, stop: 20990, exit: 21050 });
  const antes = { a1: FUT.calculateAccountStats('a1').total, a2: FUT.calculateAccountStats('a2').total,
                  dia14: FUT.calculateDailyStats('a1', '2026-09-14').pnl, dia13: FUT.calculateDailyStats('a1', '2026-09-13').pnl };
  FUT.updateTrade(id, { date: '2026-09-13' });                    // cambia de día
  const traspuesto = { dia14: FUT.calculateDailyStats('a1', '2026-09-14').pnl, dia13: FUT.calculateDailyStats('a1', '2026-09-13').pnl,
                       a1: FUT.calculateAccountStats('a1').total };
  FUT.updateTrade(id, { accountId: 'a2' });                       // cambia de cuenta
  const mudado = { a1: FUT.calculateAccountStats('a1').total, a2: FUT.calculateAccountStats('a2').total,
                   dia13: FUT.calculateDailyStats('a1', '2026-09-13').pnl };
  FUT.deleteTrade(id);
  const final = { a1: FUT.calculateAccountStats('a1').total, a2: FUT.calculateAccountStats('a2').total };
  return { antes, traspuesto, mudado, final, id };
});
await p.waitForTimeout(400);
ok(mover.antes.dia14 === 100 && mover.antes.dia13 === 0, 'la operación nace en el día 14', JSON.stringify(mover.antes));
ok(mover.traspuesto.dia14 === 0 && mover.traspuesto.dia13 === 100, 'al cambiar de día, los dos días se recalculan', JSON.stringify(mover.traspuesto));
ok(mover.traspuesto.a1 === mover.antes.a1, 'el total de la cuenta no cambia por mover de día', `${mover.antes.a1} → ${mover.traspuesto.a1}`);
ok(mover.mudado.a1 === mover.antes.a1 - 100 && mover.mudado.a2 === mover.antes.a2 + 100,
   'al cambiar de cuenta, el dinero se va de una y llega a la otra', JSON.stringify(mover.mudado));
ok(mover.mudado.dia13 === 0, 'y desaparece del día de la cuenta que lo pierde', mover.mudado.dia13);
ok(mover.final.a1 === mover.antes.a1 - 100 && mover.final.a2 === mover.antes.a2,
   'al borrarla, todo vuelve a su sitio', JSON.stringify(mover.final));

console.log('\n──────────────────────────────────────────');
console.log('  fallos:', fallos.length, fallos.length ? '→ ' + fallos.join(' · ') : '');
console.log('  errores JS:', errs.length, errs.length ? '\n   ' + errs.join('\n   ') : '');
await b.close();
process.exit(fallos.length || errs.length ? 1 : 0);
