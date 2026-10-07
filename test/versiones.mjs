/* VERSIONES DEL CONTRATO DE UNA PROP FIRM, POR FECHA DE VIGENCIA.

   Lo que había: el contrato de una cuenta era UN objeto (`a.rules`). Al
   actualizarlo —y las props cambian sus reglas sin avisar— el historial entero
   del trader quedaba juzgado con las reglas de hoy. Una operación de marzo que
   cumplía el tope de contratos de marzo aparecía como «pasada de tamaño» porque
   en septiembre la firma bajó el tope de 10 a 2. Eso es reescribir el pasado, y
   es lo que esta prueba impide.

   La estructura: FIRMA → TIPO DE CUENTA → VERSIÓN → FECHA DE VIGENCIA → REGLAS.
   La firma y el tipo ya son campos de la cuenta; aquí viven la versión y su
   vigencia.

   Las dos propiedades, y la segunda es la que pedía el encargo:

     1. Sin ancla, manda la versión vigente EN LA FECHA que se pregunta.
     2. CON ancla, manda la anclada, SIEMPRE. Una cuenta abierta bajo la v1 no
        cambia cuando aparece la v2.

   Y la tercera, que es la que permite que esto exista sin romper nada: una
   cuenta SIN versiones se comporta exactamente como antes. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* El reloj se fija: «hoy» decide qué versión rige, así que una prueba que
   dependa de la fecha real se rompe sola una noche cualquiera. */
const HOY = '2026-09-18';
const F = new Date(HOY + 'T14:00:00Z').getTime();

const CUENTA = (id, extra) => Object.assign({
  id, firm: 'Firma P', name: 'Cuenta 25K', kind: 'Evaluación',
  size: 25000, dd: 1000, ddKind: 'trailing_lock', trailBase: 'intradia',
  limit: 50, total: 0, best: 0, target: 1500, status: 'activa', ledger: [],
}, extra || {});

/* v1 vigente desde marzo: 10 contratos, tope diario $1.100, MNQ y MES.
   v2 vigente desde septiembre: 2 contratos, tope diario $200, sólo MNQ. */
const V1 = { id: 'v1', version: 'v1 · mar 2026', from: '2026-03-01', verifiedAt: '2026-03-01',
  rules: { maxContracts: 10, maxLoss: 1100, instruments: 'MNQ, MES' } };
const V2 = { id: 'v2', version: 'v2 · sep 2026', from: '2026-09-01', verifiedAt: '2026-09-01',
  rules: { maxContracts: 2, maxLoss: 200, instruments: 'MNQ' } };

const SEMILLA = {
  settings: {
    meta: { acct: 'conVersiones' },
    accounts: [
      /* Con las dos versiones y SIN ancla: manda la vigente por fecha. */
      CUENTA('conVersiones', { name: 'Por fecha', rulesets: [V1, V2] }),
      /* Con las dos versiones y ANCLADA a la v1: la v2 no la toca. */
      CUENTA('anclada', { name: 'Anclada a v1', rulesets: [V1, V2], rulesetId: 'v1' }),
      /* Sin versiones: el contrato plano de siempre. */
      CUENTA('plana', { name: 'Contrato plano', rules: { maxContracts: 5, maxLoss: 500, instruments: 'MES' } }),
      /* Con versiones pero anclada a una que no existe: no se adivina. */
      CUENTA('anclaRota', { name: 'Ancla rota', rulesets: [V1], rulesetId: 'noExiste',
        rules: { maxContracts: 7, maxLoss: 700 } }),
    ],
    rules: [
      { id: 'maxloss', kind: 'num', name: 'Pérdida máxima del día', value: 0, role: 'maxLoss' },
      { id: 'contracts', kind: 'num', name: 'Contratos máximos', value: 0, role: 'maxContracts' },
      { id: 'onlymnq', kind: 'fixed', name: 'Instrumentos', role: 'instrument', allow: '' },
    ],
  },
};

const nav = await chromium.launch();
const errs = [];
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1200 } });
await ctx.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
/* Sólo si no hay nada guardado: `addInitScript` corre en CADA navegación,
   también en la recarga de §10, y sembrar sin condición volvía a escribir la
   semilla encima de lo que la prueba acababa de guardar. */
await ctx.addInitScript(s => { try { if (!localStorage.getItem('cabina-mnq:v1')) localStorage.setItem('cabina-mnq:v1', JSON.stringify(s)); } catch (e) { } }, SEMILLA);
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await quieto(p, 60, 2500);

const traza = async et => console.log('   TRAZA', et, JSON.stringify(await p.evaluate(() => ({
  mem: FUT.rulesets('anclada').map(v => v.id),
  disco: (() => { const l = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); const a = (l.settings && l.settings.accounts || []).find(x => x.id === 'anclada'); return a ? (a.rulesets || []).map(v => v.id) : '?'; })(),
}))));
const rs = (id, fecha) => p.evaluate(([i, f]) => FUT.rulesetFor(i, f), [id, fecha]);
const reglas = (id, fecha) => p.evaluate(([i, f]) => FUT.evaluateRules(i, f), [id, fecha]);

console.log('\n═══ 1 · sin ancla, manda la versión vigente EN LA FECHA ═══');
const hoy = await rs('conVersiones');
ok(hoy.version && hoy.version.id === 'v2', 'hoy (18-sep) rige la v2', hoy.version && hoy.version.version);
ok(hoy.origen === 'por_fecha', 'y lo dice: la elige la fecha', hoy.origen);
ok(hoy.rules.maxContracts === 2 && hoy.rules.maxLoss === 200, 'con los números de la v2', JSON.stringify(hoy.rules));

const marzo = await rs('conVersiones', '2026-03-15');
ok(marzo.version && marzo.version.id === 'v1', 'el 15 de marzo regía la v1', marzo.version && marzo.version.version);
ok(marzo.rules.maxContracts === 10 && marzo.rules.maxLoss === 1100,
   'con los números de marzo: 10 contratos y $1.100 (NO los de hoy)', JSON.stringify(marzo.rules));

const antesDeTodo = await rs('conVersiones', '2026-01-01');
ok(antesDeTodo.version === null && antesDeTodo.origen === 'sin_version_vigente',
   'antes de la primera versión no se inventa ninguna', antesDeTodo.origen);

console.log('\n═══ 2 · EL HISTORIAL NO SE REESCRIBE ═══');
/* 8 contratos en marzo: dentro del tope de 10 que regía entonces, fuera del
   tope de 2 que rige hoy. Con el modelo de un solo objeto esta operación
   aparecía «pasada de tamaño» en cuanto se actualizaba el contrato. */
await p.evaluate(() => FUT.createTrade({ accountId: 'conVersiones', instrument: 'MNQ', direction: 'long',
  qty: 8, date: '2026-03-15', time: '10:00', entry: 21000, stop: 20990, exit: 21010 }));
await quieto(p, 60, 2500);
const marzoEv = await reglas('conVersiones', '2026-03-15');
ok(marzoEv.maxContracts === 10, 'el día de marzo se juzga con el tope de marzo', marzoEv.maxContracts);
ok(marzoEv.oversized === 0, 'y 8 contratos NO estaban pasados de tamaño', marzoEv.oversized);
ok(marzoEv.dailyLossLimit === 1100, 'y su tope diario era el de marzo', marzoEv.dailyLossLimit);

/* La misma operación metida HOY sí está fuera, porque hoy el tope es 2. */
await p.evaluate(() => FUT.createTrade({ accountId: 'conVersiones', instrument: 'MNQ', direction: 'long',
  qty: 8, date: '2026-09-18', time: '10:00', entry: 21000, stop: 20990, exit: 21010 }));
await quieto(p, 60, 2500);
const hoyEv = await reglas('conVersiones', '2026-09-18');
ok(hoyEv.maxContracts === 2, 'hoy el tope es 2', hoyEv.maxContracts);
ok(hoyEv.oversized === 1, 'y la de hoy sí está pasada de tamaño', hoyEv.oversized);

console.log('\n═══ 3 · UNA CUENTA ANCLADA A LA v1 NO CAMBIA CUANDO APARECE LA v2 ═══');
const an = await rs('anclada');
ok(an.version && an.version.id === 'v1', 'aunque la v2 ya exista y esté vigente, rige la v1', an.version && an.version.version);
ok(an.origen === 'anclada' && an.pinned === true, 'y lo dice: está anclada', `${an.origen} · pinned=${an.pinned}`);
ok(an.rules.maxContracts === 10 && an.rules.maxLoss === 1100, 'con los números de la v1', JSON.stringify(an.rules));
const anHoy = await reglas('anclada', '2026-09-18');
ok(anHoy.maxContracts === 10, 'y el motor de reglas usa 10, no 2, HOY', anHoy.maxContracts);
ok(JSON.stringify(anHoy.allowedInstruments) === '["MNQ","MES"]',
   'y los instrumentos de la v1', JSON.stringify(anHoy.allowedInstruments));
/* El ancla gana incluso preguntando por una fecha en la que la v1 no estaba
   vigente: el contrato que firmó el trader es el suyo. */
const anEnero = await rs('anclada', '2026-01-01');
ok(anEnero.version && anEnero.version.id === 'v1', 'el ancla manda también fuera de su vigencia', anEnero.origen);

console.log('\n═══ 4 · añadir una versión NO cambia ninguna cuenta por sí solo ═══');
const antesV3 = await rs('anclada');
const idV3 = await p.evaluate(() => FUT.addRuleset('anclada', {
  version: 'v3 · oct 2026', from: '2026-09-02', verifiedAt: '2026-09-02',
  rules: { maxContracts: 1, maxLoss: 100, instruments: 'MNQ' } }));
await quieto(p, 60, 2500);
ok(!!idV3, 'la v3 se añade', idV3);
const trasV3 = await rs('anclada');
ok(trasV3.version && trasV3.version.id === 'v1', 'la cuenta anclada sigue en la v1', trasV3.version.version);
ok(JSON.stringify(trasV3.rules) === JSON.stringify(antesV3.rules), 'con los mismos números que antes', JSON.stringify(trasV3.rules));
/* Y en la cuenta sin ancla, la v3 sí pasa a regir: es más nueva y ya vigente. */
await p.evaluate(id => FUT.addRuleset('conVersiones', { id, version: 'v3 · oct 2026', from: '2026-09-02',
  verifiedAt: '2026-09-02', rules: { maxContracts: 1, maxLoss: 100, instruments: 'MNQ' } }), 'v3');
await quieto(p, 60, 2500);
const cvTrasV3 = await rs('conVersiones');
ok(cvTrasV3.version && cvTrasV3.version.id === 'v3', 'la cuenta sin ancla pasa a la v3', cvTrasV3.version.version);
ok(cvTrasV3.rules.maxContracts === 1, 'con el tope de 1', cvTrasV3.rules.maxContracts);

console.log('\n═══ 5 · soltar y poner el ancla ═══');
ok(await p.evaluate(() => FUT.pinRuleset('conVersiones', 'v1')), 'se puede anclar a la v1');
await quieto(p, 60, 2500);
const reancl = await rs('conVersiones');
ok(reancl.version.id === 'v1' && reancl.rules.maxContracts === 10, 'y vuelve a los números de la v1', JSON.stringify(reancl.rules));
ok(await p.evaluate(() => FUT.pinRuleset('conVersiones', null)), 'y se puede soltar');
await quieto(p, 60, 2500);
ok((await rs('conVersiones')).version.id === 'v3', 'y entonces manda otra vez la vigente por fecha');
ok(!(await p.evaluate(() => FUT.pinRuleset('conVersiones', 'inventada'))),
   'anclar a una versión que no existe se rechaza, no se adivina');

console.log('\n═══ 6 · una cuenta SIN versiones se comporta como antes ═══');
const pl = await rs('plana');
ok(pl.version === null && pl.origen === 'contrato_plano', 'su contrato es el objeto plano', pl.origen);
ok(pl.rules.maxContracts === 5 && pl.rules.maxLoss === 500, 'con sus números', JSON.stringify(pl.rules));
const plEv = await reglas('plana', '2026-09-18');
ok(plEv.maxContracts === 5 && plEv.dailyLossLimit === 500, 'y el motor de reglas los usa', `${plEv.maxContracts} / ${plEv.dailyLossLimit}`);
ok(JSON.stringify(plEv.allowedInstruments) === '["MES"]', 'y sus instrumentos', JSON.stringify(plEv.allowedInstruments));

console.log('\n═══ 7 · un ancla a una versión que no existe NO se adivina ═══');
const rota = await rs('anclaRota');
ok(rota.origen === 'ancla_perdida',
   'NO se cae a «la que diga la fecha»: dice que el ancla se perdió', rota.origen);
ok(rota.rules.maxContracts === 7, 'cae al contrato plano, que es el único dato que no se inventa', JSON.stringify(rota.rules));
/* Y el ancla NO se borra en silencio: borrarla convertiría la cuenta en «la que
   diga la fecha», que es justo lo que el ancla existe para impedir. */
ok(await p.evaluate(() => (FUT.account('anclaRota').rulesetId || '') === 'noExiste'),
   'el ancla roto se conserva, no se limpia por detrás');

console.log('\n═══ 8 · una fecha de vigencia que no es una fecha no cuela ═══');
await p.evaluate(() => FUT.addRuleset('plana', { id: 'malaFecha', version: 'basura', from: 'mañana',
  rules: { maxContracts: 99 } }));
await quieto(p, 60, 2500);
const trasMala = await rs('plana');
ok(trasMala.rules.maxContracts === 5, 'una versión sin fecha válida no rige por fecha', JSON.stringify(trasMala.rules));
ok((await p.evaluate(() => FUT.rulesets('plana').find(v => v.id === 'malaFecha').from)) === '',
   'su vigencia queda vacía: sólo se alcanza anclándola a mano');

console.log('\n═══ 9 · la tarjeta DICE qué versión rige ═══');
await p.evaluate(() => FUT.setSelectedAccount('anclada'));
await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p, 60, 2500);
const chips = await p.evaluate(() => [...document.querySelectorAll('.cttr')].map(x => x.textContent.trim()));
ok(chips.some(c => /v1/.test(c) && /anclada/i.test(c)),
   'el chip del contrato nombra la versión que rige y que está anclada', chips.join(' | ').slice(0, 140));

console.log('\n═══ 10 · sobrevive a una recarga ═══');
/* `quieto` espera a que el DOM se calme, y el guardado de la configuración lleva
   500 ms de `debounce` que caen DESPUÉS de eso. Recargar sin esperarlos probaba
   que lo que no se había guardado no estaba guardado. */
await p.waitForTimeout(1200);
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await quieto(p, 60, 2500);
const tras = await rs('anclada');
ok(tras.version && tras.version.id === 'v1' && tras.origen === 'anclada',
   'el ancla y las versiones se guardaron y se releen', `${tras.origen} · ${tras.version.version}`);
ok((await p.evaluate(() => FUT.rulesets('anclada').length)) === 3, 'las tres versiones siguen ahí',
   await p.evaluate(() => FUT.rulesets('anclada').length));

console.log('\n═══ 11 · ningún error de página ═══');
ok(errs.length === 0, 'sin errores de JavaScript', errs.join(' | ') || 'ninguno');

await nav.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
