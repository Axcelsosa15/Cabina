/* PRIMER ARRANQUE · lo que recibe una persona que abre la cabina por primera vez.

   Hasta aqui, el primer arranque era la configuracion de quien la construyo: tres
   cuentas prop con nombre, reglas con sus numeros ($150, $200, 2 contratos, «Solo
   MNQ») y una frase de su historia en la lista de pre-sesion. Eso no es un
   producto: es el cuaderno de otra persona con la puerta abierta.

   Lo que se fija aqui, en las dos direcciones:

     · un desconocido arranca VACIO: sin cuentas, con las reglas presentes pero sin
       valor -- y una regla sin valor nunca bloquea --, sin restriccion de
       instrumento, y sin una sola cadena de la configuracion personal;
     · quien ya estaba NO pierde nada: la configuracion guardada no se toca, y
       ninguna operacion se pierde aunque su cuenta ya no exista -- queda como
       «sin cuenta asignada». En los dos modos: navegador y base del artefacto.

   Su modo de fallo: arreglar el primer arranque borrando las cuentas de alguien.

   (Hubo una recuperacion de «las cuentas de siempre» para instalaciones que nunca
   guardaron configuracion. Se quito junto con esas cuentas, a peticion del dueño,
   despues de comprobar que su entorno principal tiene la configuracion guardada
   y completa, y que ninguna de sus cuentas usaba aquellos identificadores.) */
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
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const errs = [];

/* Lo que NO puede aparecer delante de un desconocido. */
const PERSONAL = /Lucid|Alpha Futures|MGC|Protocolo v2\.0|EMA 10\/20\/55|instrumento perdedor|Solo MNQ/;

const abre = async (init) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
};
const foto = p => p.evaluate(() => ({
  cuentas: FUT.accounts().map(a => a.id),
  nombres: FUT.accounts().map(a => (a.firm || '') + ' · ' + (a.name || '')),
  reglas: FUT.rules().map(r => ({ id: r.id, role: r.role || '', kind: r.kind, value: r.value, allow: r.allow || '' })),
}));

console.log('\n═══ UN DESCONOCIDO ═══');
{
  const { ctx, p } = await abre();
  const f = await foto(p);
  ok(f.cuentas.length === 0, 'arranca sin cuentas', f.cuentas.join(', ') || 'ninguna');
  const roles = f.reglas.map(r => r.role);
  ok(['maxLoss', 'maxLosses', 'maxGain', 'maxContracts'].every(x => roles.includes(x)),
     'con las reglas presentes, para que todo lo que depende de ellas siga funcionando', roles.filter(Boolean).join(', '));
  ok(f.reglas.filter(r => r.kind === 'num').every(r => !Number(r.value)),
     'y ninguna con valor: una regla sin valor no bloquea nada', f.reglas.filter(r => r.kind === 'num').map(r => `${r.id}=${r.value}`).join(' '));
  const ins = f.reglas.find(r => r.role === 'instrument');
  ok(!ins || !ins.allow, 'sin restriccion de instrumento: nadie le dice «solo MNQ» sin haberlo escrito', ins ? `allow «${ins.allow}»` : 'sin regla de instrumento');
  for (const t of ['cabina', 'futuros', 'invest', 'playbook', 'ideas', 'calc']) {
    await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(200);
  }
  await p.click('[data-tab="cabina"]'); await p.waitForTimeout(300);
  const texto = await p.evaluate(() => document.body.innerText);
  const hallado = (texto.match(PERSONAL) || [])[0];
  ok(!hallado, 'ni una cadena de la configuracion personal en la pagina', hallado ? `aparece «${hallado}»` : 'ninguna');
  const vacio = await p.evaluate(() => /SIN CUENTAS REGISTRADAS/i.test(document.body.innerText));
  ok(vacio, 'y el estado vacio le dice que añada su primera cuenta', vacio ? 'si' : 'no aparece');
  /* El demo sigue enseñando una cabina llena, con numeros en las reglas. */
  await p.click('#demoToggle'); await p.waitForTimeout(900);
  const demo = await foto(p);
  ok(demo.cuentas.length > 0 && demo.reglas.filter(r => r.kind === 'num').some(r => Number(r.value) > 0),
     '«Ver demo» sigue enseñando una cabina llena: cuentas y reglas con valor', `${demo.cuentas.length} cuentas · ${demo.reglas.filter(r => Number(r.value) > 0).length} reglas con valor`);
  const tDemo = await p.evaluate(() => document.body.innerText);
  const hDemo = (tDemo.match(/MGC|instrumento perdedor|Protocolo v2\.0/) || [])[0];
  ok(!hDemo, 'y el demo tampoco lleva la historia personal', hDemo ? `aparece «${hDemo}»` : 'limpio');
  await ctx.close();
}

console.log('\n═══ QUIEN YA ESTABA · navegador ═══');
{
  /* Nunca guardo configuracion, pero tiene operaciones. Hasta que el dueño pidio
     quitar del codigo su configuracion personal, esta instalacion recuperaba las
     cuentas de siempre; ya no existen en el codigo. Lo que se exige ahora es lo que
     de verdad importa: arranca neutral y NO SE PIERDE NINGUNA OPERACION -- quedan
     como «sin cuenta asignada», que la app ya sabe enseñar y reasignar. */
  const { ctx, p } = await abre({ fn: () => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify({ trades: {
    v1: { id: 'v1', type: 'futuros', date: '2026-03-02', accountId: 'cta_antigua', instrument: 'MNQ', direction: 'long', qty: 1, entry: 20000, stop: 19990, exit: 20020 } } })); } catch (e) { } } });
  const f = await foto(p);
  const ops = await p.evaluate(() => FUT.trades().map(t => t.id + ':' + t.accountId));
  ok(f.cuentas.length === 0, 'sin configuracion guardada: arranca neutral', f.cuentas.join(', ') || 'ninguna');
  ok(ops.length === 1 && ops[0] === 'v1:cta_antigua', 'y la operacion sigue ahi, con su cuenta anotada: no se pierde nada', ops.join(' · ') || 'ninguna');
  await ctx.close();
}
{
  /* Guardo su configuracion: se respeta tal cual, y lo neutral no se cuela. */
  const { ctx, p } = await abre({ fn: () => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings: {
    meta: { title: 'Mi cabina' },
    checks: [{ id: 'k1', t: 'Mi comprobacion', s: '' }],
    rules: [{ id: 'maxloss', kind: 'num', name: 'Perdida', why: '', value: 400, role: 'maxLoss' },
            { id: 'soloes', kind: 'fixed', name: 'Solo ES', why: '', role: 'instrument' }],
    accounts: [{ id: 'mia', firm: 'Mi firma', name: 'Mia 50K', kind: 'Evaluación', size: 50000, dd: 2000 }] } })); } catch (e) { } } });
  const f = await foto(p);
  ok(f.cuentas.length === 1 && f.cuentas[0] === 'mia', 'configuracion guardada: sus cuentas, exactamente', f.cuentas.join(', '));
  ok(f.reglas.length === 2 && Number((f.reglas.find(r => r.id === 'maxloss') || {}).value) === 400,
     'sus reglas, exactamente, con sus valores', f.reglas.map(r => `${r.id}=${r.value}`).join(' '));
  const ins = f.reglas.find(r => r.role === 'instrument');
  ok(!!ins && ins.allow === '', 'una regla de instrumento GUARDADA sin lista ya no se convierte en «Solo MNQ»: sin lista es sin restriccion',
     ins ? `allow «${ins.allow}»` : '—');
  await ctx.close();
}

{
  /* Un usuario NUEVO que guarda su configuracion con la regla de instrumentos vacia
     -- «sin restriccion», a proposito -- no puede encontrarse «Solo MNQ» al recargar.
     La migracion vieja confundia «no traia el campo» con «lo dejo vacio». */
  const { ctx, p } = await abre({ fn: () => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings: {
    checks: [], rules: [{ id: 'onlymnq', kind: 'fixed', name: 'Instrumentos permitidos', why: '', role: 'instrument', allow: '' }],
    accounts: [] } })); } catch (e) { } } });
  const f = await foto(p);
  const ins = f.reglas.find(r => r.role === 'instrument');
  ok(!!ins && ins.allow === '', 'una regla de instrumentos guardada VACIA sigue vacia al recargar: no se convierte en «Solo MNQ»',
     ins ? `allow «${ins.allow}»` : '—');
  await ctx.close();
}

{
  /* Una configuracion guardada ANTIGUA a la que le falta un bloque: el hueco se
     rellena con lo neutral. Lo que si trae -- sus cuentas -- se respeta. */
  const { ctx, p } = await abre({ fn: () => { try { localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings: {
    accounts: [{ id: 'vieja', firm: 'F', name: 'Vieja', kind: 'Evaluación', size: 25000, dd: 1500 }] } })); } catch (e) { } } });
  const f = await foto(p);
  ok(f.cuentas.join() === 'vieja' && f.reglas.filter(r => r.kind === 'num').every(r => !Number(r.value)),
     'guardada antigua sin reglas: sus cuentas se respetan, y el hueco se rellena con reglas sin valor',
     `${f.cuentas.join()} · ${f.reglas.filter(r => r.kind === 'num').map(r => r.id + '=' + r.value).join(' ')}`);
  await ctx.close();
}

console.log('\n═══ QUIEN YA ESTABA · base del artefacto ═══');
const conDb = (docs) => ({ fn: (docs) => {
  const DOCS = Object.assign({}, docs), CB = {}; delete DOCS.__retraso;
  window.__ESCRITURAS = [];
  const cp = o => JSON.parse(JSON.stringify(o));
  const snap = ruta => ({ exists: Object.prototype.hasOwnProperty.call(DOCS, ruta), data: () => cp(DOCS[ruta]) });
  const doc = ruta => ({
    async set(d) { window.__ESCRITURAS.push(ruta); DOCS[ruta] = cp(d); (CB[ruta] || []).forEach(f => { try { f(snap(ruta)); } catch (e) { } }); },
    async get() { return snap(ruta); }, async delete() { delete DOCS[ruta]; },
    onSnapshot(cb) { (CB[ruta] = CB[ruta] || []).push(cb); setTimeout(() => { try { cb(snap(ruta)); } catch (e) { } }, ruta === 'settings/main' ? (docs.__retraso || 0) : 0); return () => { }; },
  });
  const consulta = n => ({
    doc: id => doc(n + '/' + id), orderBy() { return this; }, limit() { return this; }, where() { return this; },
    async get() { const pref = n + '/'; return { docs: Object.keys(DOCS).filter(k => k.indexOf(pref) === 0).map(k => ({ id: k.slice(pref.length), data: () => cp(DOCS[k]) })) }; },
    onSnapshot(cb) { this.get().then(q => { try { cb(q); } catch (e) { } }).catch(() => { }); return () => { }; },
  });
  window.claude = { use: async n => n === 'db' ? { doc, collection: consulta } : n === 'permissions' ? { request: async () => true } : null };
}, arg: docs });
{
  const { ctx, p } = await abre(conDb({ 'trades/v1': { id: 'v1', type: 'futuros', date: '2026-03-02', accountId: 'cta_antigua', instrument: 'MNQ', direction: 'long', qty: 1, entry: 20000, stop: 19990, exit: 20020 } }));
  const f = await foto(p);
  const ops = await p.evaluate(() => FUT.trades().map(t => t.id));
  ok(f.cuentas.length === 0 && ops.join() === 'v1', 'artefacto sin settings/main y con operaciones: neutral, y la operacion sigue ahi',
     `${f.cuentas.length} cuentas · operaciones ${ops.join() || 'ninguna'}`);
  const w = await p.evaluate(() => window.__ESCRITURAS.filter(r => r === 'settings/main').length);
  ok(w === 0, 'y abrirla NO ESCRIBE configuracion en la base', `${w} escrituras en settings/main`);
  await ctx.close();
}
{
  /* EL CASO PELIGROSO: configuracion guardada Y operaciones en las cuentas de
     siempre. Si la recuperacion corriera antes de que llegue la configuracion y
     algo la guardara, sobrescribiria la real. */
  const { ctx, p } = await abre(conDb({
    'settings/main': { checks: [{ id: 'k1', t: 'x', s: '' }], rules: [{ id: 'maxloss', kind: 'num', name: 'P', why: '', value: 250, role: 'maxLoss' }],
      accounts: [{ id: 'cta1', firm: 'Su firma', name: 'Su nombre propio', kind: 'Fondeada', size: 25000, dd: 1500 }] },
    'trades/v1': { id: 'v1', type: 'futuros', date: '2026-03-02', accountId: 'cta1', instrument: 'MNQ', direction: 'long', qty: 1, entry: 20000, stop: 19990, exit: 20020 } }));
  const f = await foto(p);
  const w = await p.evaluate(() => window.__ESCRITURAS.filter(r => r === 'settings/main').length);
  ok(f.cuentas.join() === 'cta1' && f.nombres[0] === 'Su firma · Su nombre propio' && Number((f.reglas.find(r => r.id === 'maxloss') || {}).value) === 250,
     'configuracion guardada + operaciones: gana SIEMPRE la guardada', `${f.nombres.join(' | ')} · maxloss ${(f.reglas.find(r => r.id === 'maxloss') || {}).value}`);
  ok(w === 0, 'y nadie escribio encima', `${w} escrituras en settings/main`);
  await ctx.close();
}
{
  const { ctx, p } = await abre(conDb({ 'settings/main': { checks: [{ id: 'k1', t: 'x', s: '' }], rules: [{ id: 'maxloss', kind: 'num', name: 'P', why: '', value: 250, role: 'maxLoss' }],
    accounts: [{ id: 'suya', firm: 'F', name: 'Suya', kind: 'Fondeada', size: 25000, dd: 1500 }] } }));
  const f = await foto(p);
  ok(f.cuentas.length === 1 && f.cuentas[0] === 'suya', 'artefacto con settings/main: se respeta tal cual', f.cuentas.join(', '));
  await ctx.close();
}
{
  const { ctx, p } = await abre(conDb({}));
  const f = await foto(p);
  ok(f.cuentas.length === 0, 'artefacto vacio: arranca neutral como cualquiera', f.cuentas.join(', ') || 'ninguna');
  await ctx.close();
}

{
  /* LA CARRERA QUE YA EXISTIA. Si algo guarda configuracion ANTES de que la base
     conteste -- elegir una cuenta guarda en silencio --, lo que se escribe son los
     valores por defecto, encima de la configuracion real. Con el arranque neutral
     eso borraria todas las cuentas. Se retrasa la respuesta de la base 2 s y se
     cambia una regla en ese hueco. */
  const ctx = await b.newContext();
  await ctx.addInitScript(conDb({ __retraso: 2000, 'settings/main': { checks: [{ id: 'k1', t: 'x', s: '' }],
    rules: [{ id: 'maxloss', kind: 'num', name: 'P', why: '', value: 250, role: 'maxLoss' }],
    accounts: [{ id: 'suya', firm: 'F', name: 'Suya', kind: 'Fondeada', size: 25000, dd: 1500 }] } }).fn,
    { __retraso: 2000, 'settings/main': { checks: [{ id: 'k1', t: 'x', s: '' }],
    rules: [{ id: 'maxloss', kind: 'num', name: 'P', why: '', value: 250, role: 'maxLoss' }],
    accounts: [{ id: 'suya', firm: 'F', name: 'Suya', kind: 'Fondeada', size: 25000, dd: 1500 }] } });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined' && window.__ESCRITURAS, null, { timeout: 20000 });
  const enElHueco = await p.evaluate(() => { const r = FUT.rules().find(x => x.role === 'maxLoss'); return r ? FUT.updateRule(r.id, { value: 999 }) : 'sin regla'; });
  await p.waitForTimeout(3200);
  const f = await foto(p);
  const w = await p.evaluate(() => window.__ESCRITURAS.filter(r => r === 'settings/main').length);
  ok(w === 0, 'un cambio de configuracion ANTES de que la base conteste no se escribe encima de la real',
     `${w} escrituras en settings/main · cambio hecho: ${enElHueco}`);
  ok(f.cuentas.join() === 'suya' && Number((f.reglas.find(r => r.id === 'maxloss') || {}).value) === 250,
     'y cuando contesta, la configuracion real sigue entera', `${f.cuentas.join() || 'SIN CUENTAS'} · maxloss ${(f.reglas.find(r => r.id === 'maxloss') || {}).value}`);
  await ctx.close();
}

ok(errs.length === 0, 'ningun error de pagina', errs.slice(0, 2).join(' | ') || 'ninguno');
await b.close(); srv.close();
console.log(fallos.length ? `\n  ${fallos.length} fallos` : '\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
