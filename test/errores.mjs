/* ERRORES · las cuatro categorias, clasificadas por la cabina y no por el trader.

   Quien clasifica una perdida despues de perderla es el acusado, y ya sabe el
   resultado. Por eso aqui casi nada se pregunta: se DERIVA de campos que la
   operacion ya trae, y lo unico que se pregunta es un HECHO fijado antes de
   entrar -- la invalidacion -- y si se respeto.

   Las respuestas de abajo estan escritas a mano ANTES del clasificador. Si
   alguien cambia una regla y la prueba sigue verde, la prueba no vigilaba esa
   regla; si la cambia y se pone roja, hay que decidir cual de las dos mentia.

   Tres cosas que esta prueba fija y que son faciles de romper sin darse cuenta:

     · la categoria 4 NO se elige: una perdida limpia es 4 solo si su setup tiene
       esperanza positiva sobre operaciones LIMPIAS, con muestra suficiente;
     · las operaciones con error NO cuentan para esa esperanza -- si contaran, tus
       errores de ejecucion harian parecer malo al sistema (y aqui lo harian:
       diez perdidas con error en el setup bueno le dan la vuelta al signo);
     · la AUSENCIA de un campo significa algo (protocolo 17): una operacion vieja
       sin invalidacion no se castiga por no haberla escrito cuando el campo no
       existia. Una nueva que la deja vacia, si.

   Su modo de fallo: un clasificador que absuelve por defecto. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1300);

/* ── EL FIXTURE · sintetico, sin un solo dato real ─────────────────────────
   MNQ largo: entrada 20000, stop 19990 (10 pt = $20), objetivo 20020 (+$40).
   Una operacion LIMPIA: en la ventana, con stop, con invalidacion escrita,
   cuatro casillas, calidad A, y salida por la regla. */
const siembra = await p.evaluate(() => {
  const acct = FUT.createAccount({ id: 'err1', firm: 'Prueba', name: 'Errores', kind: 'Evaluación',
    size: 50000, dd: 2000, ddKind: 'estatico', target: 3000, limit: 40, status: 'activa', ledger: [],
    rules: { maxContracts: 2 } });
  const base = { type: 'futuros', accountId: 'err1', instrument: 'MNQ', direction: 'long', qty: 1,
    entry: 20000, stop: 19990, target: 20020, time: '09:15',
    invalida: 'cierre de 5m por debajo de 19990', cStruct: true, cPull: true, cWindow: true, cSize: true,
    quality: 'A', source: 'manual' };
  const gana = { exit: 20020, exitWhy: 'objetivo', plan: 'no_hizo_falta' };
  const pierde = { exit: 19990, exitWhy: 'stop', plan: 'cumpli' };
  let d = 0;
  const dia = () => { d++; const f = new Date(Date.UTC(2026, 0, 1) + d * 864e5); return f.toISOString().slice(0, 10); };
  const mk = (id, extra) => FUT.createTrade(Object.assign({ id, date: dia() }, base, extra));
  /* S+ · 14 ganadoras, 6 perdedoras limpias  ->  (14*40 - 6*20)/20 = +22 */
  for (let i = 0; i < 14; i++) mk('sp_g' + i, Object.assign({ setupId: 'S+' }, gana));
  for (let i = 0; i < 6; i++)  mk('sp_p' + i, Object.assign({ setupId: 'S+' }, pierde));
  /* S- · 5 ganadoras, 15 perdedoras limpias  ->  (5*40 - 15*20)/20 = -5 */
  for (let i = 0; i < 5; i++)  mk('sm_g' + i, Object.assign({ setupId: 'S-' }, gana));
  for (let i = 0; i < 15; i++) mk('sm_p' + i, Object.assign({ setupId: 'S-' }, pierde));
  /* Spoco · 3 operaciones, una perdida limpia: sin muestra */
  mk('po_g0', Object.assign({ setupId: 'Spoco' }, gana));
  mk('po_g1', Object.assign({ setupId: 'Spoco' }, gana));
  mk('po_p0', Object.assign({ setupId: 'Spoco' }, pierde));
  /* sin setup · una perdida limpia: no hay muestra que la juzgue */
  mk('ns_p0', Object.assign({}, pierde));

  /* ── los errores, todos perdedores y todos en S+ ──
     Cada uno lleva UNA desviacion sobre la plantilla limpia, salvo los de
     severidad. Entre todos pierden $550 (E7 aguanta hasta 19900: -$200). S+ limpio
     suma +$380 en 23 operaciones; con los errores dentro sumaria -$170 en 39. O sea:
     si el clasificador dejara entrar los errores en la esperanza del setup, las
     perdidas limpias de S+ pasarian de categoria 4 a categoria 1 -- tus errores de
     ejecucion acusarian al sistema. Esa es la razon de medir solo lo limpio, y
     este fixture la hace comprobable. (La primera version decia esto con numeros
     que NO le daban la vuelta al signo: +$380 - $370. Se recontaron a mano.) */
  const L = Object.assign({ setupId: 'S+' }, pierde);
  mk('E1_sinstop',     Object.assign({}, L, { stop: null }));
  mk('E2_ventana',     Object.assign({}, L, { time: '12:00' }));
  mk('E3_antes',       Object.assign({}, L, { exit: 19995, exitWhy: 'manual', plan: 'antes' }));
  mk('E4_sininval',    Object.assign({}, L, { invalida: '' }));
  mk('E5_calidadC',    Object.assign({}, L, { quality: 'C' }));
  mk('E6_pasostop',    Object.assign({}, L, { exit: 19985 }));
  mk('E7_aguanto',     Object.assign({}, L, { exit: 19900, plan: 'tarde' }));
  mk('E8_nervios',     Object.assign({}, L, { exit: 19995, exitWhy: 'nervios', plan: 'antes' }));
  mk('E9_tamano',      Object.assign({}, L, { qty: 3 }));
  mk('E12_etiqueta',   Object.assign({}, L, { tags: 'fomo, entrada temprana' }));
  mk('E13_gate',       Object.assign({}, L, { offProtocol: ['Pérdida máxima del día alcanzada'] }));
  mk('E14_presesion',  Object.assign({}, L, { offProtocol: ['Pre-sesión de NY AM incompleta'] }));
  mk('E18_calidadB',   Object.assign({}, L, { quality: 'B' }));
  /* una casilla SIN marcar no es «leiste mal»: es «sabias que faltaba y entraste» */
  mk('E19_condicion',  Object.assign({}, L, { cPull: false }));
  /* revancha por TIEMPO: una perdida que sale a las 10:00 y otra que entra a las 10:05 */
  const dT = dia();
  FUT.createTrade(Object.assign({ id: 'E10_previa', date: dT }, base, L, { time: '09:30', exitTime: '10:00' }));
  FUT.createTrade(Object.assign({ id: 'E10_revancha', date: dT }, base, L, { time: '10:05' }));
  /* revancha por TAMANO: tras perder con 1, entra con 2 (dentro del tope), una hora despues */
  const dS = dia();
  FUT.createTrade(Object.assign({ id: 'E11_previa', date: dS }, base, L, { time: '09:00', exitTime: '09:10' }));
  FUT.createTrade(Object.assign({ id: 'E11_doble', date: dS }, base, L, { time: '10:30', qty: 2 }));
  /* ── la ausencia significa algo ── */
  const vieja = Object.assign({}, base, L); delete vieja.invalida;
  FUT.createTrade(Object.assign({ id: 'E16_vieja', date: dia() }, vieja));
  FUT.createTrade({ id: 'E17_rapida', type: 'futuros', date: dia(), accountId: 'err1', instrument: 'NQ',
    direction: 'long', pnl: -50, source: 'quick_add', time: '09:20' });
  /* registrada con + Rapido y completada DESPUES con todo: sigue sin poder ser limpia */
  mk('E20_rapidacompleta', Object.assign({}, L, { source: 'quick_add' }));
  /* apuntada con + Rapido a las 20:00: esa hora es la de ESCRIBIRLA, no la de entrar.
     La primera version del clasificador la marcaba «fuera de NY AM», y la prueba solo
     lo vio porque la suite paso por aqui a las 11:11 ET: dependia del reloj. */
  FUT.createTrade({ id: 'E21_rapidanoche', type: 'futuros', date: dia(), accountId: 'err1', instrument: 'MNQ',
    direction: 'long', pnl: -30, source: 'quick_add', time: '20:00' });
  return { acct: !!acct, n: FUT.trades('err1').length };
});
ok(siembra.n === 66, 'se sembraron 66 operaciones sinteticas', `${siembra.n}`);

const r = await p.evaluate(() => typeof FUT.clasificaErrores === 'function' ? FUT.clasificaErrores('err1') : null);
ok(!!r, 'FUT.clasificaErrores existe y devuelve algo', r ? 'si' : 'no existe');
if (!r) { await b.close(); srv.close(); console.log(`\n  ${fallos.length} fallos`); process.exit(1); }
const de = id => (r.porTrade || []).find(x => x.id === id) || { cat: '(no clasificada)', senales: [] };
const claves = id => de(id).senales.map(s => s.clave).join(',');

console.log('\n═══ LAS DERIVADAS: nadie pregunta nada ═══');
const CASOS = [
  ['E1_sinstop',   2, 'sin_stop',        'sin stop escrito: no habia plan que ejecutar'],
  ['E2_ventana',   2, 'fuera_ventana',   'entrada a las 12:00, fuera de NY AM'],
  ['E3_antes',     2, 'salio_antes',     'salio antes de que se cumpliera su invalidacion'],
  ['E4_sininval',  2, 'sin_invalidacion','operacion nueva que dejo la invalidacion en blanco'],
  ['E5_calidadC',  2, 'calidad_c',       'el propio trader la marco fuera del protocolo'],
  ['E6_pasostop',  2, 'paso_stop',       'salio en 19985 con el stop en 19990: -1.5R'],
  ['E14_presesion',2, 'gate_proceso',    'entro con la pre-sesion incompleta'],
  ['E18_calidadB', 2, 'calidad_b',       'el propio trader declaro una desviacion menor'],
  ['E19_condicion',2, 'condiciones',     'entro con 3 de las 4 condiciones marcadas'],
  ['E7_aguanto',   3, 'aguanto',         'se cumplio la invalidacion y aguanto'],
  ['E8_nervios',   3, 'nervios',         'salio por nervios'],
  ['E9_tamano',    3, 'tamano',          '3 contratos con un tope de 2'],
  ['E10_revancha', 3, 'revancha_tiempo', 'entro 5 min despues de salir perdiendo'],
  ['E11_doble',    3, 'revancha_tamano', 'doblo el tamano tras una perdida'],
  ['E12_etiqueta', 3, 'etiqueta',        'etiquetada «fomo»'],
  ['E13_gate',     3, 'gate_disciplina', 'entro con la perdida maxima del dia ya alcanzada'],
];
for (const [id, cat, clave, porque] of CASOS) {
  const x = de(id);
  ok(x.cat === cat && claves(id).split(',').includes(clave), `${id} es categoria ${cat}: ${porque}`,
     `obtenido ${x.cat} · señales [${claves(id)}]`);
}

console.log('\n═══ SEVERIDAD: manda la peor ═══');
ok(de('E8_nervios').cat === 3 && /salio_antes/.test(claves('E8_nervios')) && /nervios/.test(claves('E8_nervios')),
   'salir antes (2) Y por nervios (3) es 3, y conserva las dos señales', `${de('E8_nervios').cat} · [${claves('E8_nervios')}]`);
ok(de('E7_aguanto').cat === 3 && /paso_stop/.test(claves('E7_aguanto')),
   'aguantar y pasarse del stop: 3, con las dos señales', `${de('E7_aguanto').cat} · [${claves('E7_aguanto')}]`);

console.log('\n═══ LA CATEGORIA 4 SE GANA, NO SE ELIGE ═══');
ok(['sp_p0', 'sp_p3', 'sp_p5'].every(id => de(id).cat === 4),
   'perdida limpia en S+ (esperanza limpia +$16.52 con 23 ops): categoria 4', ['sp_p0', 'sp_p3', 'sp_p5'].map(id => de(id).cat).join(' '));
ok(['sm_p0', 'sm_p7', 'sm_p14'].every(id => de(id).cat === 1),
   'la MISMA perdida limpia en S- (esperanza -$5): categoria 1, error de analisis', ['sm_p0', 'sm_p7', 'sm_p14'].map(id => de(id).cat).join(' '));
ok(de('po_p0').cat === '1o4', 'con 3 operaciones en el setup no se decide: queda «1 o 4»', `${de('po_p0').cat}`);
ok(de('ns_p0').cat === '1o4', 'sin setup no hay muestra que la juzgue: «1 o 4»', `${de('ns_p0').cat}`);
const sp = (r.setups || {})['S+'] || {};
/* 14 ganadoras + 6 limpias + las dos «previas» + la vieja = 23 · (560 - 180) / 23 */
ok(sp.n === 23 && Math.abs((sp.esperanza || 0) - 380 / 23) < 0.01,
   'la esperanza de S+ se mide SOLO sobre operaciones limpias: 23 ops, +$16.52', `n ${sp.n} · esperanza ${sp.esperanza}`);
ok(sp.n === 23, 'y los dieciseis errores sembrados en S+ NO entran en esa muestra', `n ${sp.n} (con errores serian 39, y la esperanza -$4.36)`);

console.log('\n═══ LA AUSENCIA SIGNIFICA ALGO (protocolo 17) ═══');
ok(de('E16_vieja').cat === 4 && !/sin_invalidacion/.test(claves('E16_vieja')),
   'una operacion SIN el campo de invalidacion no se castiga: el campo no existia', `${de('E16_vieja').cat} · [${claves('E16_vieja')}]`);
ok(de('E4_sininval').cat === 2, 'una con el campo PRESENTE y vacio, si', `${de('E4_sininval').cat}`);
ok(de('E17_rapida').cat === 'sin_datos',
   'registrada con + Rapido, sin entrada ni stop: no hay con que juzgarla, y se dice', `${de('E17_rapida').cat}`);
ok(de('E21_rapidanoche').cat === 'sin_datos' && !/fuera_ventana/.test(claves('E21_rapidanoche')),
   'apuntada con + Rapido a las 20:00 no es «fuera de ventana»: la hora es la de escribirla',
   `${de('E21_rapidanoche').cat} · [${claves('E21_rapidanoche')}]`);
ok(de('E20_rapidacompleta').cat === 'sin_datos',
   'registrada con + Rapido y completada DESPUES con entrada, stop y casillas: tampoco puede ser 4 -- su plan no se escribio antes del resultado',
   `${de('E20_rapidacompleta').cat} · [${claves('E20_rapidacompleta')}]`);

console.log('\n═══ LAS GANADORAS NO SE CLASIFICAN ═══');
ok(!(r.porTrade || []).some(x => /^(sp_g|sm_g|po_g)/.test(x.id)), 'ninguna ganadora aparece como perdida clasificada',
   `${(r.porTrade || []).filter(x => /_g\d/.test(x.id)).length} ganadoras en la lista`);

console.log('\n═══ EL RESUMEN CUADRA ═══');
const R = r.resumen || {};
/* 16 errores con categoria 2 o 3; las «previas» de E10 y E11 son limpias (S+) */
ok(R[2] === 9 && R[3] === 7, 'nueve de ejecucion y siete psicologicas', `2:${R[2]} · 3:${R[3]}`);
ok(R[4] === 9, 'nueve del sistema: 6 limpias de S+, las dos «previas» y la vieja', `4:${R[4]}`);
ok(R[1] === 15, 'quince de analisis: las limpias de S-', `1:${R[1]}`);
ok(R['1o4'] === 2 && R.sin_datos === 3, 'dos sin decidir y tres sin datos', `1o4:${R['1o4']} · sin_datos:${R.sin_datos}`);

console.log('\n═══ Y SE VE EN EL ANALISIS ═══');
await p.click('[data-tab="futuros"]'); await p.waitForTimeout(300);
await p.click('button[data-v="analisis"]'); await p.waitForTimeout(700);
const panel = await p.evaluate(() => {
  const w = document.getElementById('erWrap'); const m = document.getElementById('erMeta');
  if (!w) return null;
  const r = w.getBoundingClientRect();
  return { txt: w.textContent.replace(/\s+/g, ' ').trim(), meta: (m || {}).textContent || '', alto: Math.round(r.height) };
});
ok(!!panel && panel.alto > 0, 'el panel «¿De qué tipo fueron tus pérdidas?» esta en Analisis y se ve',
   panel ? `${panel.alto}px de alto` : 'no existe #erWrap');
ok(!!panel && /psicol/i.test(panel.txt) && /ejecuci/i.test(panel.txt) && /sistema/i.test(panel.txt) && /an[aá]lisis/i.test(panel.txt),
   'con las cuatro categorias nombradas', panel ? panel.txt.slice(0, 110) : '—');
ok(!!panel && /revancha|nervios|aguant/i.test(panel.txt),
   'y dice los MOTIVOS, no solo los numeros', panel ? (panel.txt.match(/(revancha|nervios|aguant)[^·]{0,40}/i) || ['—'])[0] : '—');

/* Y en un telefono se lee ENTERO. La primera version era una tabla: a 430px la
   columna «que significa» quedaba en ~80px y desbordaba 24px dentro de su caja --
   texto cortado que nadie va a deslizar para leer. vista.mjs no lo veia porque el
   desborde DENTRO de un contenedor con scroll no cuenta alla, y alla es correcto:
   la barra de pestañas se desliza a proposito. Un parrafo no. */
await p.setViewportSize({ width: 430, height: 900 }); await p.waitForTimeout(500);
const movil = await p.evaluate(() => {
  const w = document.getElementById('erWrap'); if (!w) return null;
  const cortados = [...w.querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').length;
  const r = w.getBoundingClientRect(), de = document.documentElement;
  return { cortados, sale: Math.round(r.right - de.clientWidth), scrollX: de.scrollWidth - de.clientWidth,
    mas: [...w.querySelectorAll('.errcat p')].map(x => Math.round(x.getBoundingClientRect().width)).sort((a, b) => a - b)[0] || 0 };
});
ok(!!movil && movil.cortados === 0 && movil.sale <= 0 && movil.scrollX <= 2,
   'a 430px el panel no corta nada: ni desborda la pagina ni esconde texto en una caja con scroll',
   movil ? `${movil.cortados} cajas cortadas · borde a ${movil.sale}px · scrollX ${movil.scrollX}` : '—');
ok(!!movil && movil.mas >= 300, 'y cada explicacion ocupa el ancho entero, no una columna de 80px',
   movil ? `la mas estrecha mide ${movil.mas}px` : '—');
await p.setViewportSize({ width: 1440, height: 1000 }); await p.waitForTimeout(300);

console.log('\n═══ EL EDITOR DE VERDAD, NO LA FACHADA ═══');
/* Una operacion nueva: los dos campos estan, y la invalidacion en blanco se
   GUARDA en blanco -- la clave presente es lo que distingue «no la escribiste»
   de «el campo no existia». */
const antes = await p.evaluate(() => FUT.trades().map(t => t.id));
await p.evaluate(() => document.getElementById('ftNew').click()); await p.waitForTimeout(500);
const campos = await p.evaluate(() => ({ inv: !!document.getElementById('ef_invalida'), plan: !!document.getElementById('ef_plan'),
  opciones: [...(document.getElementById('ef_plan') || { options: [] }).options].map(o => o.value) }));
ok(campos.inv && campos.plan, 'el editor de futuros trae «Invalidación · salgo si…» y «¿Respetaste tu invalidación?»',
   `invalida ${campos.inv} · plan ${campos.plan}`);
ok(['cumpli', 'no_hizo_falta', 'antes', 'tarde'].every(x => campos.opciones.includes(x)),
   'y la pregunta de salida es una lista cerrada de cuatro hechos', campos.opciones.join(' · '));
await p.click('#edSave'); await p.waitForTimeout(700);
const nueva = await p.evaluate(ids => { const t = FUT.trades().find(x => !ids.includes(x.id)); return t ? { id: t.id, tiene: Object.prototype.hasOwnProperty.call(t, 'invalida'), v: t.invalida } : null; }, antes);
ok(!!nueva && nueva.tiene && nueva.v === '', 'una NUEVA guardada sin invalidacion lleva la clave, vacia: «no la escribiste»',
   nueva ? `clave ${nueva.tiene} · valor «${nueva.v}»` : 'no se guardo');

/* Una operacion SIN el campo, abierta en el editor y guardada sin tocar nada: la
   ruta de «+ Rapido → Añadir detalles». Si el guardado le pusiera `invalida: ""`,
   pasaria de «sin datos» a «entraste sin invalidacion» por haberla abierto. */
const antes2 = await p.evaluate(() => FUT.trades().map(t => t.id));
await p.click('#quickBtn'); await p.waitForTimeout(450);
await p.fill('#qkText', 'NQ -50'); await p.waitForTimeout(550);
await p.click('#qkDetalles'); await p.waitForTimeout(800);
const abierto = await p.evaluate(() => document.getElementById('ov').classList.contains('open'));
await p.click('#edSave'); await p.waitForTimeout(800);
const rap = await p.evaluate(ids => {
  const t = FUT.trades().find(x => !ids.includes(x.id)); if (!t) return null;
  let ls = {}; try { ls = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); } catch (e) { }
  const g = ((ls.trades || {})[t.id]) || {};
  const c = (FUT.clasificaErrores().porTrade.find(x => x.id === t.id) || {}).cat;
  return { id: t.id, source: t.source, enMemoria: Object.prototype.hasOwnProperty.call(t, 'invalida'),
    enDisco: Object.prototype.hasOwnProperty.call(g, 'invalida'), plan: Object.prototype.hasOwnProperty.call(t, 'plan'), cat: c };
}, antes2);
ok(abierto && !!rap && rap.source === 'quick_add', '«+ Rapido → Añadir detalles» abre la operacion en el editor completo',
   rap ? `source ${rap.source}` : 'no se creo');
ok(!!rap && !rap.enMemoria && !rap.enDisco && !rap.plan,
   'y guardarla sin tocar NO le inventa la invalidacion vacia: ni en memoria ni en disco (protocolo 17)',
   rap ? `invalida en memoria ${rap.enMemoria} · en disco ${rap.enDisco} · plan ${rap.plan}` : '—');
ok(!!rap && rap.cat === 'sin_datos', 'asi que sigue siendo «sin datos», no «entraste sin invalidacion»', rap ? `${rap.cat}` : '—');

ok(errs.length === 0, 'ningun error de pagina', errs.slice(0, 2).join(' | ') || 'ninguno');
await b.close(); srv.close();
console.log(fallos.length ? `\n  ${fallos.length} fallos` : '\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
