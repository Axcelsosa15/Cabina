/* REGISTRO RÁPIDO · que una entrada de 5 segundos acabe en el MISMO registro
   canonico que el formulario completo, y que no invente nada.

   Lo que esta prueba vigila, y por que cada cosa:

     · que «NQ +185» produzca UN trade con pnlEff 185 por la puerta de siempre
       (tradeCalc -> QE.calcularTradeApp), no un P&L guardado aparte;
     · que R y riesgo queden NULOS -- sin entrada ni stop el motor no los puede
       saber, y el requisito del prompt es «NEVER INVENT DATA»;
     · que la operacion rapida aparezca inmediatamente en las analiticas, el
       drawdown, el riesgo y la consistencia, porque comparte el modelo;
     · que `source` diga «quick_add», y que el editor completo diga «manual», y que
       las operaciones VIEJAS se queden SIN el campo: ausente significa
       «desconocida», y rellenarlo hacia atras seria inventar;
     · que una entrada AMBIGUA no se guarde sola;
     · que la sesion se DERIVE y no se guarde como campo;
     · que se pueda completar despues sin crear un segundo trade.

   Su modo de fallo: que el registro rapido termine siendo una segunda base de datos
   con su propio P&L, y que nadie lo note porque la tarjeta muestra un numero. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const casi = (a, b, e = 0.005) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= e;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1200);

/* una cuenta seleccionada, para que el enriquecimiento tenga de donde sacarla */
await p.evaluate(async () => {
  FUT.createAccount({ id: 'RAP', firm: 'Rapido', name: 'Prueba 50K', kind: 'Evaluación',
    size: 50000, dd: 2000, ddKind: 'trailing_lock', trailBase: 'intradia',
    target: 3000, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  FUT.setSelectedAccount('RAP');
  await new Promise(r => setTimeout(r, 700));
});

console.log('\n═══ EL BOTON ES GLOBAL · esta en las seis superficies ═══');
const tabs = ['cabina', 'futuros', 'invest', 'playbook', 'ideas', 'calc'];
const visto = [];
for (const t of tabs) {
  await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(220);
  visto.push(await p.evaluate(() => { const b = document.getElementById('quickBtn');
    return !!b && b.getBoundingClientRect().height > 0; }));
}
ok(visto.every(Boolean), 'el boton «+ Rapido» esta visible en las 6 pestañas',
   tabs.map((t, i) => `${t}:${visto[i] ? 'si' : 'NO'}`).join(' · '));

console.log('\n═══ LA VISTA PREVIA ES OBLIGATORIA · no hay camino que guarde a ciegas ═══');
await p.click('#quickBtn'); await p.waitForTimeout(350);
let st = await p.evaluate(() => ({ abierto: document.getElementById('quickOv').classList.contains('open'),
  guardar: document.getElementById('qkSave').disabled, detalles: document.getElementById('qkDetalles').disabled,
  prev: document.getElementById('qkPrev').textContent.trim().slice(0, 80) }));
ok(st.abierto, 'el panel se abre');
ok(st.guardar && st.detalles, 'con el campo vacio, Guardar y Añadir detalles estan DESHABILITADOS',
   `guardar=${st.guardar} detalles=${st.detalles}`);
ok(/vista previa/i.test(st.prev), 'y la vista previa explica que aparecera antes de guardar', `«${st.prev}»`);
/* Deshabilitado tiene que VERSE deshabilitado. Se comprueba el pixel, no el
   atributo: un boton con `disabled` que conserva el relleno de acento invita a
   pulsarlo. Se encontro mirando una captura. */
const pinta = await p.evaluate(() => {
  const s = getComputedStyle(document.getElementById('qkSave'));
  const c = getComputedStyle(document.getElementById('qkCancel'));
  return { fondo: s.backgroundColor, color: s.color, cancelar: c.backgroundColor };
});
ok(pinta.fondo !== 'rgb(79, 179, 160)', 'y Guardar deshabilitado PIERDE el relleno de acento',
   `fondo ${pinta.fondo}`);

console.log('\n═══ LO QUE EL PARSER ENTIENDE, Y LO QUE SE NIEGA A ADIVINAR ═══');
const prueba = async (texto) => {
  await p.fill('#qkText', texto); await p.waitForTimeout(220);
  return p.evaluate(() => ({ puede: !document.getElementById('qkSave').disabled,
    prev: document.getElementById('qkPrev').textContent.replace(/\s+/g, ' ').trim() }));
};
let r = await prueba('NQ +185');
ok(r.puede && /NQ/.test(r.prev) && /185/.test(r.prev), '«NQ +185» se entiende y se puede guardar', r.prev.slice(0, 70));
r = await prueba('NQ L +185');
ok(r.puede && /LONG/.test(r.prev), '«NQ L +185» entiende la direccion abreviada', r.prev.slice(0, 60));
r = await prueba('MNQ short -90');
ok(r.puede && /SHORT/.test(r.prev) && /90/.test(r.prev), '«MNQ short -90» entiende el corto y la perdida', r.prev.slice(0, 60));
r = await prueba('NQ 185');
ok(r.puede && /sin signo/i.test(r.prev) && /GANANCIA/i.test(r.prev),
   'un numero SIN signo se avisa en la vista previa en vez de interpretarse en silencio', 'avisa');
r = await prueba('+185');
ok(!r.puede && /falta el instrumento/i.test(r.prev), 'sin instrumento NO se puede guardar, y lo dice', 'bloqueado');
r = await prueba('NQ long');
ok(!r.puede && /falta el resultado/i.test(r.prev), 'sin resultado NO se puede guardar, y lo dice', 'bloqueado');
r = await prueba('NQ ES +185');
ok(!r.puede && /dos instrumentos/i.test(r.prev), 'DOS instrumentos es ambiguo y NO se guarda solo', 'bloqueado');
r = await prueba('NQ long short +185');
ok(!r.puede && /dos direcciones/i.test(r.prev), 'DOS direcciones es ambiguo y NO se guarda solo', 'bloqueado');
r = await prueba('NQ +185 +90');
/* La tilde de «números» costo un fallo: la primera version de esta linea buscaba
   «dos numeros» sin tilde y daba rojo con la app correcta. Se comprueba el estado
   —no se puede guardar— Y el motivo, con el texto tal cual lo escribe la app. */
ok(!r.puede, 'DOS numeros: no se puede guardar', `puede=${r.puede}`);
ok(/dos n[uú]meros/i.test(r.prev), 'y la vista previa dice que es ambiguo', 'lo dice');
r = await prueba('ZZZ +185');
ok(!r.puede, 'un instrumento que el motor no conoce NO se acepta', 'bloqueado');
r = await prueba('NQ +185 pepino');
ok(r.puede && /sin reconocer/i.test(r.prev) && /pepino/.test(r.prev),
   'un token que no se entiende se NOMBRA en vez de tirarse en silencio', 'lo nombra');
r = await prueba('NQ +185');
ok(/quick_add/.test(r.prev), 'la vista previa dice la procedencia que se va a guardar', 'quick_add');
ok(/R y riesgo quedan vacios|R y riesgo quedan vacíos/i.test(r.prev),
   'y avisa de que R y riesgo quedan VACIOS porque no se pueden calcular', 'lo dice');

console.log('\n═══ GUARDAR · un solo registro canonico ═══');
const antes = await p.evaluate(() => ({ n: FUT.trades('RAP').length,
  balance: FUT.calculateAccountStats('RAP').balance,
  ddUsado: FUT.calculateDrawdown('RAP').used,
  riesgoUsado: FUT.evaluateRules('RAP').risk.used,
  statsN: FUT.calculateTradeStats('RAP').n }));
await p.click('#qkSave'); await p.waitForTimeout(1200);
const guardado = await p.evaluate(() => {
  const t = FUT.trades('RAP').find(x => x.source === 'quick_add') || null;
  return { cerrado: !document.getElementById('quickOv').classList.contains('open'),
    n: FUT.trades('RAP').length, trade: t, campos: t ? Object.keys(t).sort() : null };
});
ok(guardado.cerrado, 'el panel se cierra al guardar');
ok(guardado.n === antes.n + 1, 'se creo UNA operacion, no dos', `${antes.n} -> ${guardado.n}`);
const T = guardado.trade || {};
ok(T.source === 'quick_add', 'lleva source = «quick_add»', String(T.source));
ok(T.instrument === 'NQ', 'el instrumento', String(T.instrument));
ok(casi(T.pnl, 185), 'el P&L manual se guardo tal cual', String(T.pnl));
ok(casi(T.pnlEff, 185), 'y pnlEff sale 185 por la puerta del motor, no de una copia', String(T.pnlEff));
ok(T.rReal == null && T.riskUsd == null,
   'R y riesgo quedan NULOS: el motor no los inventa sin entrada ni stop',
   `rReal=${T.rReal} riskUsd=${T.riskUsd}`);
ok(T.accountId === 'RAP', 'la cuenta se completo con la seleccionada', String(T.accountId));
ok(/^\d{4}-\d{2}-\d{2}$/.test(T.date || ''), 'la fecha se completo', String(T.date));
ok(/^\d{2}:\d{2}$/.test(T.time || ''), 'la hora se completo en 24 h', String(T.time));
ok(!('session' in T), 'la sesion NO se guarda como campo: es derivada de la hora',
   'session ' + (('session' in T) ? 'presente' : 'ausente'));
ok(T.type === 'futuros', 'el tipo es el mismo que usa el editor completo', String(T.type));

console.log('\n═══ APARECE INMEDIATAMENTE EN TODO LO DERIVADO ═══');
const despues = await p.evaluate(() => ({ balance: FUT.calculateAccountStats('RAP').balance,
  ddUsado: FUT.calculateDrawdown('RAP').used,
  riesgoUsado: FUT.evaluateRules('RAP').risk.used,
  statsN: FUT.calculateTradeStats('RAP').n,
  expectativa: FUT.calculateExpectancy('RAP'),
  consTotal: FUT.calculateConsistency('RAP').total,
  edgeN: FUT.calculateEdge('RAP').n }));
ok(casi(despues.balance, antes.balance + 185), 'el balance de la cuenta lo recoge',
   `${antes.balance} -> ${despues.balance}`);
ok(despues.statsN === antes.statsN + 1, 'la estadistica lo cuenta', `${antes.statsN} -> ${despues.statsN}`);
ok(casi(despues.consTotal, 185), 'la consistencia lo recoge', String(despues.consTotal));
ok(despues.edgeN === 1, 'el edge lo cuenta', String(despues.edgeN));
ok(despues.expectativa && casi(despues.expectativa.usd, 185), 'la expectativa lo recoge',
   JSON.stringify(despues.expectativa));
/* Una GANADORA no puede mover el drawdown usado ni el riesgo diario: eso es
   correcto, y se afirma para que nadie lo lea como un hueco. */
ok(despues.ddUsado === antes.ddUsado && despues.riesgoUsado === antes.riesgoUsado,
   'y NO mueve el drawdown usado ni el riesgo diario, porque es ganadora',
   `dd ${despues.ddUsado} · riesgo ${despues.riesgoUsado}`);

console.log('\n═══ UNA PERDEDORA RAPIDA · y como se mide el riesgo diario ═══');
/* AQUI HUBO UN FALLO DE ESTA PRUEBA, y vale la pena que quede escrito: la primera
   version afirmaba «una perdedora mueve el riesgo diario». Es FALSO. El riesgo
   diario se mide sobre el NETO del dia (`lossUsed = max(0, -pnlDelDia)`), no por
   operacion: con +185 ya registrado, una perdedora de -120 deja el dia en +65 y no
   consume nada. Ahora se afirma el invariante de verdad, que ademas documenta la
   semantica para quien lea. */
await p.click('#quickBtn'); await p.waitForTimeout(300);
await p.fill('#qkText', 'MNQ short -120'); await p.waitForTimeout(250);
await p.click('#qkSave'); await p.waitForTimeout(1200);
let perd = await p.evaluate(() => ({ riesgoUsado: FUT.evaluateRules('RAP').risk.used,
  diaPnl: FUT.calculateDailyStats('RAP').pnl,
  t: FUT.trades('RAP').find(x => x.instrument === 'MNQ' && x.source === 'quick_add') || null }));
ok(perd.t && casi(perd.t.pnlEff, -120), 'la perdedora rapida guarda -120', String(perd.t && perd.t.pnlEff));
ok(perd.t && perd.t.direction === 'short', 'y la direccion short', String(perd.t && perd.t.direction));
ok(casi(perd.diaPnl, 65), 'el dia queda en +65: +185 y -120', String(perd.diaPnl));
ok(casi(perd.riesgoUsado, Math.max(0, -perd.diaPnl)),
   'y el riesgo diario usado es max(0, -netoDelDia): con el dia en verde, CERO',
   `usado ${perd.riesgoUsado} · neto ${perd.diaPnl}`);
/* Ahora una que SI pone el dia en rojo. */
await p.click('#quickBtn'); await p.waitForTimeout(300);
await p.fill('#qkText', 'MNQ short -300'); await p.waitForTimeout(250);
await p.click('#qkSave'); await p.waitForTimeout(1200);
perd = await p.evaluate(() => ({ riesgoUsado: FUT.evaluateRules('RAP').risk.used,
  diaPnl: FUT.calculateDailyStats('RAP').pnl, ddUsado: FUT.calculateDrawdown('RAP').used }));
ok(casi(perd.diaPnl, -235), 'con otra de -300 el dia se pone en -235', String(perd.diaPnl));
ok(casi(perd.riesgoUsado, 235), 'y AHORA el riesgo diario usado son 235',
   `usado ${perd.riesgoUsado} · neto ${perd.diaPnl}`);
ok(perd.ddUsado > 0, 'y el drawdown usado tambien se mueve', String(perd.ddUsado));

console.log('\n═══ CALIDAD Y ETIQUETAS · los campos que YA existian ═══');
await p.click('#quickBtn'); await p.waitForTimeout(300);
await p.fill('#qkText', 'ES long +50'); await p.waitForTimeout(200);
await p.click('#qkCal [data-cal="C"]');
await p.click('#qkTags [data-tag="fomo"]');
await p.click('#qkTags [data-tag="revenge"]');
await p.waitForTimeout(150);
await p.click('#qkSave'); await p.waitForTimeout(1200);
const conCal = await p.evaluate(() => FUT.trades('RAP').find(x => x.instrument === 'ES') || null);
ok(conCal && conCal.quality === 'C', 'la calidad se guarda en el campo `quality` del editor', String(conCal && conCal.quality));
ok(conCal && /fomo/.test(conCal.tags || '') && /revenge/.test(conCal.tags || ''),
   'las etiquetas se guardan en el campo `tags` que ya existia', String(conCal && conCal.tags));
ok(conCal && conCal.source === 'quick_add', 'y sigue marcada como rapida', String(conCal && conCal.source));

console.log('\n═══ PROCEDENCIA · tres estados, y la ausencia significa algo ═══');
const proc = await p.evaluate(async () => {
  /* una operacion VIEJA, escrita como lo haria un respaldo anterior: sin `source` */
  const vieja = { id: 'tVIEJA', type: 'futuros', accountId: 'RAP', date: FUT.trades('RAP')[0].date,
    time: '09:00', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, exit: 21010, stop: 20990 };
  window.__coll ? null : null;
  /* se mete por la fachada, que es la unica via publica */
  FUT.createTrade(vieja);
  await new Promise(r => setTimeout(r, 900));
  const todas = FUT.trades('RAP');
  return { conFuente: todas.filter(t => t.source).map(t => t.source).sort(),
    sinFuente: todas.filter(t => !t.source).length, total: todas.length };
});
ok(proc.sinFuente >= 1, 'una operacion sin `source` se queda SIN el campo: no se rellena hacia atras',
   `${proc.sinFuente} sin procedencia de ${proc.total}`);
ok(proc.conFuente.every(x => x === 'quick_add'), 'y las rapidas son las unicas marcadas hasta ahora',
   proc.conFuente.join(' · '));

console.log('\n═══ COMPLETAR DESPUES · el MISMO registro, no uno nuevo ═══');
const editado = await p.evaluate(async () => {
  const t = FUT.trades('RAP').find(x => x.source === 'quick_add' && x.instrument === 'NQ');
  const antes = FUT.trades('RAP').length;
  /* se completa como lo haria «Añadir detalles»: el mismo id */
  FUT.updateTrade(t.id, { entry: 21000, exit: 21037, stop: 20990, qty: 1, pnl: null });
  await new Promise(r => setTimeout(r, 900));
  const d = FUT.trades('RAP').find(x => x.id === t.id);
  return { antes, despues: FUT.trades('RAP').length, id: t.id, mismoId: !!d && d.id === t.id,
    source: d && d.source, pnlEff: d && d.pnlEff, rReal: d && d.rReal, riskUsd: d && d.riskUsd };
});
ok(editado.despues === editado.antes, 'completar NO crea un segundo trade',
   `${editado.antes} -> ${editado.despues}`);
ok(editado.mismoId, 'es el mismo registro', editado.id);
ok(editado.source === 'quick_add', 'y CONSERVA su procedencia: sigue siendo una entrada rapida', String(editado.source));
ok(editado.riskUsd != null && editado.rReal != null,
   'ahora SI hay R y riesgo, porque ya hay entrada y stop',
   `rReal=${editado.rReal} riskUsd=${editado.riskUsd}`);

console.log('\n═══ LA NOTA DEL DIA · el journal que ya existe, no uno paralelo ═══');
await p.click('[data-tab="cabina"]'); await p.waitForTimeout(300);
await p.click('#quickBtn'); await p.waitForTimeout(300);
await p.click('#qkModoNota'); await p.waitForTimeout(250);
let nt = await p.evaluate(() => ({ opOculto: document.getElementById('qkOp').hidden,
  notaVisible: !document.getElementById('qkNotaBox').hidden,
  guardar: document.getElementById('qkSave').disabled,
  detalles: document.getElementById('qkDetalles').hidden }));
ok(nt.opOculto && nt.notaVisible, 'el modo nota cambia el panel');
ok(nt.guardar, 'con la nota vacia no se puede guardar');
ok(nt.detalles, 'y «Añadir detalles» no aplica a una nota: se esconde');
await p.fill('#qkNota', 'sesion corta, respete el plan'); await p.waitForTimeout(200);
nt = await p.evaluate(() => document.getElementById('qkSave').disabled);
ok(!nt, 'con texto si se puede guardar');
await p.click('#qkSave'); await p.waitForTimeout(1200);
const nota = await p.evaluate(() => {
  const el = document.getElementById('jNote');
  return { enPantalla: el ? el.value : null, cerrado: !document.getElementById('quickOv').classList.contains('open') };
});
ok(nota.cerrado, 'el panel se cierra');
ok(nota.enPantalla != null && /respete el plan/.test(nota.enPantalla),
   'la nota acaba en el campo de la nota del dia que ya existia',
   `«${String(nota.enPantalla).slice(0, 60)}»`);

console.log('\n═══ SOBREVIVE A RECARGAR · persistencia real ═══');
const idsAntes = await p.evaluate(() => FUT.trades('RAP').map(t => t.id).sort().join(','));
/* pestaña NUEVA en vez de recargar: sobre file:// Chromium tira el area de
   localStorage al recargar, y esta prueba mide persistencia, no ese fallo. */
const p2 = await ctx.newPage();
await p2.goto(BASE, { waitUntil: 'load' });
await p2.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p2.waitForTimeout(1500);
const tras = await p2.evaluate(() => {
  const t = FUT.trades('RAP');
  return { ids: t.map(x => x.id).sort().join(','), rapidas: t.filter(x => x.source === 'quick_add').length,
    nota: (document.getElementById('jNote') || {}).value || '' };
});
ok(tras.ids === idsAntes, 'las operaciones siguen ahi tras abrir la app de nuevo',
   `${tras.ids.split(',').length} operaciones`);
ok(tras.rapidas === 4, 'y las cuatro rapidas conservan su procedencia', String(tras.rapidas));
ok(/respete el plan/.test(tras.nota), 'la nota del dia tambien persiste', `«${tras.nota.slice(0, 40)}»`);
await p2.close();

ok(errs.length === 0, 'la pagina no lanzo ningun error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
