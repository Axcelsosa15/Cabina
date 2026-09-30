/* TESIS · una por jugada.

   La plantilla que la origina pide a mano «Capital total», «Riesgo $», «Tamaño
   recomendado», «R:R ≥ 2:1» y «R (+2.3R)». Cabina sabe calcular los cinco, y un
   número escrito a mano al lado de uno calculado es la avería que esta sesión ya
   arregló tres veces en Inversiones: dos fuentes para una cifra, y la escrita
   nunca se actualiza.

   Aquí se comprueba que se ESCRIBA el precio y se DERIVE el resto. */
import { chromium } from 'playwright';
import { siembra } from './espera.mjs';
const errs = [], fallos = [];
const F = new Date('2026-09-18T14:00:00Z').getTime();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
/* Sembrado desde un documento ya cargado, no con addInitScript: en `file://`
   la semilla condicional se reescribía al recargar y borraba lo guardado.
   El detalle, en espera.mjs. */
const URL = 'file://' + process.cwd() + '/../index.html';
await siembra(p, URL, { settings: { meta: {}, accounts: [], rules: [] } });
await p.waitForTimeout(1300);
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const cerca = (a, e, tol = 0.005) => a != null && Math.abs(a - e) <= tol;
const txt = sel => p.textContent(sel).then(x => x.replace(/\s+/g, ' ').trim());

await p.click('.tabbtn[data-tab="playbook"]'); await p.waitForTimeout(400);

console.log('\n═══ la tesis es OTRA entidad, no una estrategia más ═══');
/* Una estrategia del playbook se reutiliza y no tiene ticker ni precio de
   entrada; una tesis es una jugada concreta. Meterlas en la misma ficha haría
   que cada estrategia tuviera un solo trade y el journal perdería el enlace. */
const nav = await txt('#pbNav');
ok(/Tesis/.test(nav), 'Tesis existe como vista propia en el Playbook');
const kinds = await p.evaluate(() => Array.from(document.querySelectorAll('#pbNav .tabbtn')).map(b => b.dataset.v));
ok(!kinds.slice(0, -1).includes('tesis'), 'y NO es una novena clase de activo', kinds.join(','));
await p.click('#pbNav .tabbtn[data-v="tesis"]'); await p.waitForTimeout(400);
ok(/watchlist/.test(await txt('#pbStatus')),
   'el filtro de estado cambia a los estados de una tesis',
   'antes ofrecía activo/prueba/retirado y escondía todo');

console.log('\n═══ se escribe el precio, se derivan las cinco cifras ═══');
await p.click('#pbNew'); await p.waitForTimeout(350);
await p.fill('#ef_asset', 'NVDA'); await p.fill('#ef_name', 'NVDA · ruptura');
await p.click('#edSave'); await p.waitForTimeout(450);
ok(await p.$$eval('#pbCards .card', n => n.length) === 1, 'la tesis se crea desde la ficha');

await p.click('#pbCards .tssec[data-sec="plan"]'); await p.waitForTimeout(350);
const campos = await p.evaluate(() => Array.from(document.querySelectorAll('#edFields [id^=ef_]')).map(x => x.id));
for (const prohibido of ['ef_rr', 'ef_riesgoUsd', 'ef_tamano', 'ef_distancia'])
  ok(!campos.includes(prohibido), `no hay campo para escribir ${prohibido.slice(3)} a mano`);

await p.fill('#ef_entrada', '170'); await p.fill('#ef_stop', '165');
await p.fill('#ef_tp1', '182'); await p.fill('#ef_tp2', '200');
await p.fill('#ef_capital', '25000'); await p.fill('#ef_riesgoPct', '1');
await p.waitForTimeout(300);
const d = await txt('#tsDeriv');
ok(/2\.40R/.test(d), 'R:R a TP1 = (182−170)/5 = 2.40R', d.slice(0, 40));
ok(/6\.00R/.test(d), 'R:R a TP2 = (200−170)/5 = 6.00R');
ok(/2\.94%/.test(d), 'distancia al stop = 5/170 = 2.94%');
ok(/\$250\.00/.test(d), 'riesgo = 1% de $25,000 = $250');
ok(/50/.test(d), 'tamaño = $250 / $5 por acción = 50 acciones');
ok(/en vivo|/.test(d) && d.length > 20, 'y sale mientras escribes, antes de guardar');

console.log('\n═══ un stop del lado equivocado no es «poco riesgo» ═══');
await p.fill('#ef_stop', '175'); await p.waitForTimeout(250);
const mal = await txt('#tsDeriv');
ok(/lado equivocado/.test(mal), 'lo dice en vez de enseñar un R:R negativo', mal.slice(0, 60));
ok(!/R:R/.test(mal), 'y esconde las cifras derivadas en lugar de mentir con ellas');
await p.fill('#ef_stop', '165'); await p.waitForTimeout(200);
await p.click('#edSave'); await p.waitForTimeout(450);

console.log('\n═══ el R:R por debajo de 2:1 se marca, no se calla ═══');
/* La propia lista de entrada de la plantilla exige ≥ 2:1, y su lista de errores
   comunes dice «no medir R/R antes de entrar». */
const tid = await p.evaluate(() => document.querySelector('#pbCards .card').dataset.id);
await p.evaluate(id => TES.update(id, { tp1: 172 }), tid);
await p.waitForTimeout(400);
const kp = await txt('#pbCards .card .kpis');
ok(/0\.40R/.test(kp) && /2:1/.test(kp), 'con TP1 a 172 el R:R es 0.40R y la ficha lo señala', kp.slice(0, 70));

console.log('\n═══ en un futuro el riesgo son PUNTOS, no dólares ═══');
/* Sin multiplicar por el contrato, el tamaño sale multiplicado por el valor del
   punto: 20 contratos de MNQ donde caben 10. */
const fut = await p.evaluate(() => {
  TES.create({ id: 'ts_mnq', status: 'planificada', tipo: 'futuro', bias: 'long', asset: 'MNQ',
               entrada: 21000, stop: 20975, tp1: 21075, capital: 25000, riesgoPct: 1 });
  return TES.calc('ts_mnq');
});
ok(fut.mult === 2, 'MNQ vale $2 por punto y el multiplicador sale de QE.CONTRACTS', fut.mult);
ok(cerca(fut.porUnidadUsd, 50), '25 puntos × $2 = $50 de riesgo por contrato', fut.porUnidadUsd);
ok(cerca(fut.tam, 5), 'tamaño = $250 / $50 = 5 contratos, no 10', fut.tam);
ok(cerca(fut.rr1, 3), 'y el R:R sigue siendo 3.00R', fut.rr1);

console.log('\n═══ la R del post-mortem sale de la operación, no del recuerdo ═══');
const rr = await p.evaluate(() => {
  FUT.createAccount({ id: 'a1', name: 'Prueba', size: 50000, dd: 2000, ddKind: 'estatico' });
  FUT.setSelectedAccount('a1');
  FUT.createTrade({ id: 'tr1', type: 'futuros', accountId: 'a1', date: '2026-09-15', symbol: 'MNQ',
                    dir: 'long', qty: 2, entry: 21000, exit: 21050, stop: 20975 });
  TES.update('ts_mnq', { status: 'cerrada', tradeId: 'tr1', leccion: 'Esperé la confirmación.' });
  return TES.calc('ts_mnq');
});
ok(rr.rFinal != null, 'hay R real porque hay operación enlazada', rr.rFinal);
ok(cerca(rr.rFinal, 2, 0.01), 'salida a +50 con stop a −25 = +2.00R', rr.rFinal);
const sinOp = await p.evaluate(() => TES.calc({ status: 'cerrada', bias: 'long', entrada: 10, stop: 9, leccion: 'x' }));
ok(sinOp.rFinal === null, 'y sin operación enlazada NO se inventa una R', String(sinOp.rFinal));

console.log('\n═══ el progreso dice qué falta, en el orden de la plantilla ═══');
await p.waitForTimeout(400);
const prog = await txt('#pbCards .card .tsprog');
ok(/\d+\/13/.test(prog), 'las 13 secciones se cuentan', prog.slice(0, 40));
ok(/sigue:/.test(prog), 'y nombra la SIGUIENTE, no todas — se completan en orden');

console.log('\n═══ el diario es la sección 10, no un añadido ═══');
await p.evaluate(() => TES.addNote('ts_mnq', { fecha: '2026-09-16', obs: 'Aguantó el nivel', accion: 'Mantengo', emocion: 8 }));
await p.waitForTimeout(400);
const secs = await p.evaluate(() => Array.from(document.querySelectorAll('#pbCards .card .tssec')).map(x => x.textContent.trim()).join(','));
ok(/10/.test(secs) && /11/.test(secs), 'la numeración va 1..11 sin saltarse el 10', secs);
const di = await p.evaluate(() => { const e = document.querySelector('#pbCards .tsdiario'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
ok(/Aguantó el nivel/.test(di), 'la entrada de seguimiento se ve en la ficha', di.slice(0, 60));
ok(/8\/10/.test(di), 'con su nota emocional, que marca los días tensos');

console.log('\n═══ sobrevive a recargar ═══');
const antesDeRecargar = await p.evaluate(() => TES.all().length);
const discoAntes = await p.evaluate(() => { try { const t = localStorage.getItem('cabina-mnq:v1'); return t ? Object.keys(JSON.parse(t).tesis || {}).length : 'sin clave'; } catch (x) { return 'error'; } });
await p.reload();
/* Esperar un reloj fijo tras recargar es una carrera: loadLocal() corre cuando
   corre, y 1600 ms bastaban casi siempre. Casi siempre es flaky, y un test
   intermitente acaba ignorado. Se espera a la CONDICIÓN. */
await p.waitForFunction(n => typeof TES !== 'undefined' && TES.all().length >= n,
                        antesDeRecargar, { timeout: 15000, polling: 100 })
  .catch(async () => {
    /* Un timeout que no dice nada es un mal test: al fallar hay que ver QUÉ
       estado había. Así se encontró que la semilla se reescribía al recargar. */
    const est = await p.evaluate(() => { let d = null; try { d = JSON.parse(localStorage.getItem('cabina-mnq:v1')); } catch (x) { }
      return { TES: typeof TES !== 'undefined' ? TES.all().length : 'no definido',
               enDisco: d ? Object.keys(d.tesis || {}).length : 'sin clave',
               cuentas: d ? (d.settings.accounts || []).length : '—' }; }).catch(() => ({}));
    throw new Error(`esperaba >= ${antesDeRecargar} tesis · antes de recargar el disco tenía ${discoAntes} · ahora ${JSON.stringify(est)}`);
  });
await p.click('.tabbtn[data-tab="playbook"]'); await p.waitForTimeout(300);
await p.click('#pbNav .tabbtn[data-v="tesis"]'); await p.waitForTimeout(400);
ok(await p.$$eval('#pbCards .card', n => n.length) >= 2,
   `las ${antesDeRecargar} tesis se guardan y vuelven`);

console.log('\n═══ el puente: plan → operación → post-mortem, sin teclear dos veces ═══');
/* Sin puente hay que reescribir entrada, stop y tamaño en el journal. Y lo que
   se teclea dos veces acaba diciendo dos cosas: el plan con un stop y la
   operación con otro, sin forma de saber cuál se ejecutó. */
await p.evaluate(() => {
  TES.create({ id: 'ts_p', asset: 'MNQ', tipo: 'futuro', bias: 'long', status: 'planificada',
               entrada: 21000, stop: 20975, tp1: 21075, capital: 25000, riesgoPct: 1 });
});
await p.click('.tabbtn[data-tab="playbook"]'); await p.waitForTimeout(300);
await p.click('#pbNav .tabbtn[data-v="tesis"]'); await p.waitForTimeout(400);
await p.click('#pbCards .card[data-id="ts_p"] button[data-act="tsop"]'); await p.waitForTimeout(600);
const pre = await p.evaluate(() => ['instrument', 'direction', 'entry', 'stop', 'target', 'qty']
  .reduce((o, k) => { const e = document.getElementById('ef_' + k); o[k] = e ? e.value : null; return o; }, {}));
ok(pre.entry === '21000' && pre.stop === '20975', 'entrada y stop viajan del plan a la operación', JSON.stringify(pre));
ok(pre.target === '21075', 'y el TP1 como objetivo');
ok(pre.qty === '5', 'y el TAMAÑO calculado, no uno escrito otra vez', pre.qty);
ok(pre.instrument === 'MNQ' && pre.direction === 'long', 'con el instrumento y la dirección del sesgo');

await p.fill('#ef_exit', '21075');
await p.click('#edSave'); await p.waitForTimeout(700);
const post = await p.evaluate(() => ({ t: TES.get('ts_p'), c: TES.calc('ts_p') }));
ok(!!post.t.tradeId, 'la operación queda enlazada a la tesis sola', post.t.tradeId);
ok(post.t.status === 'ejecucion', 'y la tesis pasa a «en ejecución»', post.t.status);
ok(cerca(post.c.rFinal, 3, 0.01), 'el post-mortem saca +3.00R de la operación real', post.c.rFinal);
ok(cerca(post.c.rr1, 3, 0.01) && cerca(post.c.rFinal, post.c.rr1, 0.01),
   'planeaba 3R y sacó 3R — dos fuentes distintas que coinciden porque ninguna se tecleó',
   `plan ${post.c.rr1} · real ${post.c.rFinal}`);

console.log('\n═══ vender no cierra la tesis, pero tampoco se calla ═══');
/* El post-mortem es un paso deliberado de la plantilla, no un efecto de vender.
   Si nadie avisa, la lección no se escribe nunca — y la lección es lo único de
   la jugada que sirve en la siguiente. */
await p.click('.tabbtn[data-tab="playbook"]'); await p.waitForTimeout(500);
const nudge = await p.evaluate(() => { const e = document.querySelector('.card[data-id="ts_p"] .tsnudge'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
ok(/ya cerró/.test(nudge), 'la ficha avisa de que la operación cerró', nudge.slice(0, 80));
/* La comparación planeado vs real vive en la baldosa de R:R, no aquí: decirla
   dos veces en el mismo centímetro es ruido, no énfasis. */
const kpiR = await txt('.card[data-id="ts_p"] .kpis');
ok(/3\.00R/.test(kpiR) && /\+3\.00R real/.test(kpiR),
   'la comparación planeado vs real va junta, en una sola baldosa', kpiR.slice(0, 60));
ok(!/del plan/.test(nudge), 'y el aviso no la repite — sólo pide la lección');
ok(post.t.status !== 'cerrada', 'pero NO cierra la tesis por su cuenta');
await p.evaluate(() => TES.update('ts_p', { leccion: 'Esperé la confirmación en 5m.' }));
await p.waitForTimeout(450);
const sinNudge = await p.evaluate(() => !!document.querySelector('.card[data-id="ts_p"] .tsnudge'));
ok(!sinNudge, 'y el aviso desaparece al escribir la lección');

const verOp = await p.evaluate(() => !!document.querySelector('.card[data-id="ts_p"] button[data-act="tsver"]'));
const abrirOp = await p.evaluate(() => !!document.querySelector('.card[data-id="ts_p"] button[data-act="tsop"]'));
ok(verOp && !abrirOp, 'con operación enlazada el botón pasa a «Ver operación»', `ver=${verOp} abrir=${abrirOp}`);

console.log('\n═══ cada activo se opera distinto, y la aritmética lo sabe ═══');
/* Aplicar la fórmula de la acción a los nueve tipos es lo que hacía este
   archivo. Una acción arriesga (entrada − stop); un futuro arriesga TICKS × el
   valor del tick; una opción comprada arriesga la PRIMA entera y el stop no
   manda; en FX son pips × el valor del pip; un bono cotiza en % del nominal. */
const T = async x => p.evaluate(v => TES.calc(v), x);

const acc = await T({ tipo: 'accion', asset: 'AAPL', bias: 'long', entrada: 170, stop: 165, tp1: 182, capital: 25000, riesgoPct: 1 });
ok(cerca(acc.porUnidadUsd, 5) && acc.tam === 50, 'acción: $5 por acción → 50 acciones', `${acc.porUnidadUsd} · ${acc.tam}`);

const tFut = await T({ tipo: 'futuro', asset: 'MNQ', bias: 'long', entrada: 21000, stop: 20975, tp1: 21075, capital: 25000, riesgoPct: 1 });
ok(tFut.extra && tFut.extra.ticks === 100, 'futuro: el stop son 100 TICKS, no 25 puntos', tFut.extra && tFut.extra.ticks);
ok(cerca(tFut.porUnidadUsd, 50) && tFut.tam === 5, 'y 100 ticks × $0.50 = $50 → 5 contratos', `${tFut.porUnidadUsd} · ${tFut.tam}`);
const mes = await T({ tipo: 'futuro', asset: 'MNQZ5', bias: 'long', entrada: 21000, stop: 20975, tp1: 21075, capital: 25000, riesgoPct: 1 });
ok(mes.tam === 5, 'un código de mes (MNQZ5) se reduce a su raíz', mes.tam);
const ancho = await T({ tipo: 'futuro', asset: 'MNQ', bias: 'long', entrada: 21000, stop: 20000, tp1: 23000, capital: 25000, riesgoPct: 1 });
ok(ancho.tam === 0 && /no llega ni para un contrato/.test(ancho.aviso || ''),
   'con un stop de 4000 ticks lo dice, no enseña un 0 mudo', (ancho.aviso || '').slice(0, 60));

const opc = await T({ tipo: 'opcion', asset: 'NVDA', bias: 'long', opDir: 'comprada', prima: 3.5, primaObjetivo: 7, capital: 100000, riesgoPct: 2 });
ok(cerca(opc.porUnidadUsd, 350), 'opción comprada: el riesgo es la PRIMA × 100, no entrada − stop', opc.porUnidadUsd);
ok(opc.tam === 5, 'y $2,000 de riesgo caben 5 contratos', opc.tam);
ok(cerca(opc.rr1, 1), 'su R:R sale de la prima: 3.50 → 7.00 es 1.00R', opc.rr1);
const desnuda = await T({ tipo: 'opcion', asset: 'NVDA', bias: 'short', opDir: 'vendida', prima: 3.5, capital: 100000, riesgoPct: 2 });
ok(desnuda.tam == null && /no tiene pérdida máxima/.test(desnuda.aviso || ''),
   'una vendida sin cobertura NO recibe un tamaño inventado', (desnuda.aviso || '').slice(0, 60));
const spread = await T({ tipo: 'opcion', asset: 'NVDA', bias: 'short', opDir: 'vendida', prima: 1.5, anchoSpread: 5, capital: 100000, riesgoPct: 2 });
ok(cerca(spread.porUnidadUsd, 350), 'con pata compradora sí: (5 − 1.50) × 100 = $350', spread.porUnidadUsd);

const fx = await T({ tipo: 'fx', asset: 'EURUSD', bias: 'long', entrada: 1.0850, stop: 1.0830, tp1: 1.0910, capital: 25000, riesgoPct: 1 });
ok(fx.extra && cerca(fx.extra.pips, 20, 0.05), 'FX: 0.0020 de precio son 20 pips', fx.extra && fx.extra.pips);
ok(cerca(fx.porUnidadUsd, 200) && cerca(fx.tam, 1.25), 'y 20 pips × $10 = $200 → 1.25 lotes', `${fx.porUnidadUsd} · ${fx.tam}`);
const jpy = await T({ tipo: 'fx', asset: 'USDJPY', bias: 'long', entrada: 150.00, stop: 149.80, tp1: 150.60, capital: 25000, riesgoPct: 1 });
ok(jpy.extra && cerca(jpy.extra.pips, 20, 0.05), 'en un par con yen el pip es 0.01, no 0.0001', jpy.extra && jpy.extra.pips);

const bono = await T({ tipo: 'bono', asset: 'T 4.25 34', bias: 'long', entrada: 99, stop: 98, tp1: 102, capital: 25000, riesgoPct: 1 });
ok(cerca(bono.porUnidadUsd, 10) && bono.tam === 25, 'bono: un punto sobre $1.000 de nominal son $10, no $1', `${bono.porUnidadUsd} · ${bono.tam}`);

const btc = await T({ tipo: 'crypto', asset: 'BTC', bias: 'long', entrada: 60000, stop: 57000, tp1: 70000, capital: 25000, riesgoPct: 1 });
ok(btc.tam > 0 && btc.tam < 1, 'cripto NO se trunca: 0.083333 BTC es un tamaño real', btc.tam);
ok(String(btc.tam).length <= 10, 'y sale redondeado, sin ruido de coma flotante', btc.tam);
ok(acc.tam === Math.floor(acc.tam) && tFut.tam === Math.floor(tFut.tam),
   'mientras acciones y contratos sí se truncan — medio contrato no existe');

console.log('\n═══ los campos son los del tipo, no los de todos ═══');
const secsDe = async tipo => p.evaluate(t => {
  const secs = TES.sections({ tipo: t });
  return secs.map(x => x.id).join(',');
}, tipo);
ok((await secsDe('opcion')).includes('activo'), 'hay una sección de parámetros del activo');
await p.evaluate(() => { TES.create({ id: 'x_op', asset: 'NVDA', tipo: 'opcion' }); TES.create({ id: 'x_fx', asset: 'EURUSD', tipo: 'fx' }); });
await p.waitForTimeout(400);
const abrir = async (id, sec) => { await p.click(`.card[data-id="${id}"] .tssec[data-sec="${sec}"]`); await p.waitForTimeout(250);
  const r = await p.evaluate(() => Array.from(document.querySelectorAll('#edFields [id^=ef_]')).map(x => x.id.slice(3)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); return r; };
const opAct = await abrir('x_op', 'activo');
ok(opAct.includes('strike') && opAct.includes('delta') && opAct.includes('iv'),
   'una opción pide strike, delta y volatilidad implícita', opAct.join(' '));
const fxAct = await abrir('x_fx', 'activo');
ok(fxAct.includes('swap') && !fxAct.includes('strike'),
   'FX pide swap y NO pide strike', fxAct.join(' '));
const opPlan = await abrir('x_op', 'plan');
ok(opPlan.includes('prima') && !opPlan.includes('stop'),
   'el plan de una opción pide prima, no stop — su riesgo no sale de un stop', opPlan.join(' '));
const fxPlan = await abrir('x_fx', 'plan');
ok(fxPlan.includes('pipValue') && fxPlan.includes('stop'), 'el de FX sí pide stop, y además el valor del pip');
ok(fxPlan.filter(x => x === 'pipValue').length === 1 && !fxAct.includes('pipValue'),
   'y cada campo vive en UNA sección, no en dos');

/* El botón del puente pedía entrada y stop. Una opción no los usa —su riesgo es
   la prima— así que se quedaba sin puente justo en el tipo donde más falta hace
   acertar el tamaño. */
await p.evaluate(() => TES.update('x_op', { opDir: 'comprada', prima: 3.5, primaObjetivo: 7, capital: 100000, riesgoPct: 2 }));
await p.waitForTimeout(400);
const opBtn = await p.evaluate(() => !!document.querySelector('.card[data-id="x_op"] button[data-act="tsop"]'));
ok(opBtn, 'una opción con prima SÍ puede abrir operación');
const marcas = await p.evaluate(() => Array.from(document.querySelectorAll('.card[data-id="x_op"] .tssec')).map(x => x.textContent.trim()));
ok(new Set(marcas).size === marcas.length, 'cada sección tiene su propia marca, sin dos iguales', marcas.join(','));

console.log('\n═══ el respaldo se las lleva ═══');
/* Un export que dice «todo» y deja fuera la investigación es peor que uno que
   avisa: se descubre al restaurar, cuando ya no hay de dónde sacarlo. */
/* El bundle ya las llevaba —buildBundle recorre COLLS— pero el panel las
   CONTABA con una lista aparte que no las incluía: el resumen decía
   «3 operaciones · 2 estrategias» y nunca mencionaba las tesis. Un respaldo que
   no nombra lo que se lleva se descubre al restaurar, cuando ya no hay de dónde
   sacarlo. */
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(600);
const meta = await txt('#bkMeta');
ok(/tesis/.test(meta), 'el resumen del respaldo nombra las tesis', meta.slice(0, 90));
const n = await p.evaluate(() => TES.all().length);
ok(new RegExp('\\b' + n + ' tesis').test(meta), `y las cuenta bien (${n})`, meta.slice(0, 90));

console.log('\n──────────────────────────────────────────');
console.log('  fallos:', fallos.length, fallos.length ? '→ ' + fallos.join(' · ') : '');
console.log('  errores JS:', errs.length, errs.length ? '\n   ' + errs.join('\n   ') : '');
await b.close();
process.exit(fallos.length || errs.length ? 1 : 0);
