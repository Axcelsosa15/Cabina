/* LA CAPSULA · la capa `db` del artefacto, que es el entorno PRINCIPAL.

   Por que existe esta prueba: las otras 50 suites corren sin `window.claude`, o
   sea que todas miden la rama de localStorage. La rama que el usuario usa de
   verdad —el artefacto publicado en claude.ai, donde `window.claude.use("db")`
   si devuelve algo— no tenia ni una sola aserción. Un fallo ahi habria sido
   invisible para la suite entera y visible para el usuario en el primer uso.

   Como: se instala un `db` falso COMPLETO en el mundo de la pagina, antes de que
   corra el script de la app (addInitScript). El falso no simplifica el contrato:
   implementa doc().set/get/delete/onSnapshot, collection().orderBy().limit()
   .onSnapshot() y collection().doc().set/delete, devuelve funciones de baja en
   cada onSnapshot y hace eco de cada escritura a sus propios suscriptores, igual
   que un Firestore. Y registra todo, para poder afirmar sobre llamadas reales y
   no sobre pantallas.

   Lo que NO prueba: que el `db` de verdad de claude.ai se comporte como este
   doble. Eso solo se comprueba abriendo el artefacto. Esta prueba fija el
   CONTRATO que la app espera; si claude.ai lo cambia, esta prueba seguira verde
   y el artefacto roto. Por eso el contrato esta escrito aqui arriba, no solo
   codificado abajo.

   COMO FALLA: cada `paso(...)` con condicion falsa entra en `fallos` y al final
   imprime ❌ y sale con codigo 1. correr.mjs lo pone rojo por las dos vias. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => {
  if (q.url !== '/' && q.url !== '/index.html') { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const fallos = [];
const paso = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(n); };
const AJENO = /Failed to load resource|net::ERR_/;
const errs = [];

/* EL DOBLE. Vive en el mundo de la pagina. */
const CAPSULA = () => {
  const REG = { use: [], perms: [], sets: [], deletes: [], subs: [] };
  const DOCS = {}, COLS = {}, CBDOC = {}, CBCOL = {};
  let ROMPE = null;                       /* cuando es un string, todo .set() rechaza con ese code */
  const cp = o => JSON.parse(JSON.stringify(o));
  const snap = ruta => ({ exists: Object.prototype.hasOwnProperty.call(DOCS, ruta), data: () => DOCS[ruta] });
  const avisa = ruta => (CBDOC[ruta] || []).forEach(cb => { try { cb(snap(ruta)); } catch (e) { } });
  const avisaCol = n => (CBCOL[n] || []).forEach(cb => {
    try { cb({ docs: Object.values(COLS[n] || {}).map(d => ({ data: () => d })) }); } catch (e) { }
  });
  const doc = ruta => ({
    async set(data) { REG.sets.push({ ruta, data: cp(data) }); if (ROMPE) throw { code: ROMPE }; DOCS[ruta] = cp(data); avisa(ruta); },
    async get() { return snap(ruta); },
    async delete() { REG.deletes.push({ ruta }); if (ROMPE) throw { code: ROMPE }; delete DOCS[ruta]; avisa(ruta); },
    onSnapshot(cb) {
      REG.subs.push({ tipo: 'doc', ruta }); (CBDOC[ruta] = CBDOC[ruta] || []).push(cb);
      try { cb(snap(ruta)); } catch (e) { }
      return () => { CBDOC[ruta] = (CBDOC[ruta] || []).filter(f => f !== cb); };
    },
  });
  const docCol = (n, id) => ({
    async set(data) { REG.sets.push({ ruta: 'col:' + n + '/' + id, data: cp(data) }); if (ROMPE) throw { code: ROMPE }; (COLS[n] = COLS[n] || {})[id] = cp(data); avisaCol(n); },
    async delete() { REG.deletes.push({ ruta: 'col:' + n + '/' + id }); if (ROMPE) throw { code: ROMPE }; if (COLS[n]) delete COLS[n][id]; avisaCol(n); },
  });
  const consulta = (n, meta) => ({
    orderBy(campo, dir) { return consulta(n, Object.assign({}, meta, { orderBy: campo, dir })); },
    limit(x) { return consulta(n, Object.assign({}, meta, { limit: x })); },
    doc(id) { return docCol(n, id); },
    onSnapshot(cb) {
      REG.subs.push(Object.assign({ tipo: 'col', nombre: n }, meta)); (CBCOL[n] = CBCOL[n] || []).push(cb);
      try { cb({ docs: Object.values(COLS[n] || {}).map(d => ({ data: () => d })) }); } catch (e) { }
      return () => { CBCOL[n] = (CBCOL[n] || []).filter(f => f !== cb); };
    },
  });
  window.claude = {
    use: async nombre => {
      REG.use.push(nombre);
      if (nombre === 'db') return { doc, collection: n => consulta(n, {}) };
      if (nombre === 'permissions') return { request: async l => { REG.perms.push(Array.prototype.slice.call(l)); return true; } };
      return null;
    },
  };
  window.__CAP = {
    REG, DOCS, COLS,
    rompe: c => { ROMPE = c; },
    remoto: (ruta, data) => { DOCS[ruta] = data; avisa(ruta); },
    escrito: pref => REG.sets.filter(s => s.ruta.indexOf(pref) === 0),
    ultimo: pref => { const l = REG.sets.filter(s => s.ruta.indexOf(pref) === 0); return l.length ? l[l.length - 1].data : null; },
  };
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } });
const enchufa = p => {
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !AJENO.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
};
const p = await ctx.newPage(); enchufa(p);
await p.addInitScript(CAPSULA);
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
/* connectDb() corre dentro de un async al final del script: hay que esperar a que
   el rotulo cambie, no un tiempo fijo. */
await p.waitForFunction(() => document.getElementById('saveState').textContent.trim() === 'sincronizado', null, { timeout: 20000, polling: 50 });

console.log('\n═══ LA CAPSULA · la capa db del artefacto ═══\n');

/* ── A · la capsula se detecta ───────────────────────────────────────────── */
const a = await p.evaluate(() => ({
  use: window.__CAP.REG.use.slice(),
  perms: window.__CAP.REG.perms.slice(),
  rotulo: document.getElementById('saveState').textContent.trim(),
  pie: document.getElementById('footerStore').textContent.trim(),
  clase: document.getElementById('saveState').className,
}));
paso('PIDE PERMISO una sola vez', a.perms.length === 1, JSON.stringify(a.perms));
paso('y pide exactamente db + assets', a.perms.length === 1 && a.perms[0].join(',') === 'db,assets', a.perms[0] ? a.perms[0].join(',') : '—');
paso('PIDE la capsula db', a.use.includes('db'), 'use() → ' + a.use.join(', '));
paso('ROTULO dice sincronizado', a.rotulo === 'sincronizado', `«${a.rotulo}» · clase «${a.clase}»`);
paso('y el pie explica que se comparte', /comparten/.test(a.pie), a.pie.slice(0, 60) + '…');

/* ── B · suscripciones: sin estas no hay sincronia en vivo ───────────────── */
const subs = await p.evaluate(() => window.__CAP.REG.subs.slice());
const rutaDia = (subs.find(s => s.tipo === 'doc' && /^days\//.test(s.ruta)) || {}).ruta;
const COLS9 = ['trades', 'playbooks', 'ideas', 'markets', 'watch', 'positions', 'scenarios', 'risk', 'tesis'];
const colSubs = subs.filter(s => s.tipo === 'col');
paso('SUB a settings/main', subs.some(s => s.tipo === 'doc' && s.ruta === 'settings/main'));
paso('SUB al dia de hoy', /^days\/\d{4}-\d{2}-\d{2}$/.test(rutaDia || ''), rutaDia);
paso('SUB al historico ordenado', colSubs.some(s => s.nombre === 'days' && s.orderBy === 'date' && s.dir === 'desc' && s.limit === 15),
  JSON.stringify(colSubs.find(s => s.nombre === 'days') || null));
const faltan = COLS9.filter(n => !colSubs.some(s => s.nombre === n && s.limit === 1000));
paso('SUB a las 9 colecciones con limite', faltan.length === 0, faltan.length ? 'faltan ' + faltan.join(', ') : '9/9 con limit 1000');

/* A partir de aqui el navegador tiene que quedarse vacio: con db conectado, la
   rama `else if (state.store === "local")` no debe tomarse nunca. */
await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });

/* ── C · las escrituras van al db, no al navegador ───────────────────────── */
await p.evaluate(() => FUT.createAccount({ id: 'cap1', firm: 'Capsula', name: 'Cuenta Capsula', kind: 'Evaluación',
  size: 50000, dd: 2000, ddKind: 'estatico', target: 3000, limit: 50, status: 'activa', ledger: [] }));
await p.waitForFunction(() => window.__CAP.escrito('settings/main').length > 0, null, { timeout: 8000, polling: 50 });
const set1 = await p.evaluate(() => window.__CAP.ultimo('settings/main'));
const cuenta = (set1.accounts || []).find(x => x.id === 'cap1');
paso('CREAR CUENTA escribe en settings/main', !!cuenta, cuenta ? `${cuenta.name} · ${cuenta.size}` : 'no llegó');
paso('y el documento lleva el valor real, no un hueco', cuenta && cuenta.dd === 2000 && cuenta.size === 50000, cuenta ? `dd ${cuenta.dd} · size ${cuenta.size}` : '—');

const nDia0 = await p.evaluate(() => window.__CAP.escrito('days/').length);
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(250);
await p.fill('#jNote', 'esta nota tiene que viajar al documento del dia');
await p.waitForFunction(n => window.__CAP.escrito('days/').length > n, nDia0, { timeout: 8000, polling: 50 });
const dia = await p.evaluate(() => window.__CAP.ultimo('days/'));
paso('ESCRIBIR EN EL DIARIO escribe en days/<hoy>', !!dia, dia ? 'days/' + dia.date : 'no llegó');
paso('y la nota viaja dentro del documento', !!dia && dia.note === 'esta nota tiene que viajar al documento del dia', dia ? `«${String(dia.note).slice(0, 40)}…»` : '—');

const tesis = await p.evaluate(() => { const r = TES.create({ asset: 'AAPL', name: 'Tesis cápsula', thesis: 'prueba' }); return r && r.id; });
await p.waitForFunction(() => window.__CAP.escrito('col:tesis/').length > 0, null, { timeout: 8000, polling: 50 });
const docTesis = await p.evaluate(() => window.__CAP.ultimo('col:tesis/'));
paso('UNA COLECCION escribe en collection(tesis).doc(id)', !!docTesis && docTesis.id === tesis, docTesis ? docTesis.id : 'no llegó');
paso('y el registro llega completo', !!docTesis && docTesis.name === 'Tesis cápsula' && docTesis.asset === 'AAPL', docTesis ? `${docTesis.asset} · ${docTesis.name}` : '—');

const nav = await p.evaluate(() => { try { return Object.keys(localStorage).filter(k => k.indexOf('cabina-mnq') === 0); } catch (e) { return ['<localStorage inaccesible>']; } });
paso('EL NAVEGADOR SIGUE VACIO (la rama local no se toca)', nav.length === 0, nav.length ? 'escribió en ' + nav.join(', ') : 'ninguna clave cabina-mnq');

/* ── D · sincronia entrante: otro dispositivo, otra pestaña ──────────────── */
const antesN = await p.evaluate(() => FUT.accounts().length);
await p.evaluate(base => {
  const s = JSON.parse(JSON.stringify(base));
  s.accounts.push({ id: 'remota', firm: 'Otro equipo', name: 'Llegó de fuera', kind: 'Evaluación',
    size: 25000, dd: 1000, ddKind: 'estatico', target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  window.__CAP.remoto('settings/main', s);
}, set1);
await p.waitForTimeout(600);
const traeCuenta = await p.evaluate(() => { const c = FUT.account('remota'); return { hay: !!c, n: FUT.accounts().length, size: c && c.size }; });
paso('SNAPSHOT ENTRANTE de settings cambia el estado', traeCuenta.hay && traeCuenta.n === antesN + 1, `${antesN} → ${traeCuenta.n} cuentas · size ${traeCuenta.size}`);

/* index.html:3689 guarda el campo enfocado: `if (document.activeElement !== jNote)`.
   Es deliberado y es lo correcto —una sincronia no debe borrarte lo que estas
   escribiendo—, asi que se prueban los dos lados de esa guarda por separado.
   La primera version de esta prueba empujaba el snapshot con el foco todavia
   dentro de #jNote y fallaba culpando a la app; el fallo era de la prueba. */
const escribiendo = await p.evaluate(() => document.activeElement === document.getElementById('jNote'));
paso('el foco sigue en la nota (montaje de la guarda)', escribiendo === true, 'activeElement === #jNote');
const notaPrevia = await p.inputValue('#jNote');
await p.evaluate(r => window.__CAP.remoto(r, Object.assign({}, window.__CAP.DOCS[r], { note: 'esto llego mientras escribia', updatedAt: Date.now() + 600000 })), rutaDia);
await p.waitForTimeout(600);
const traFoco = await p.inputValue('#jNote');
paso('MIENTRAS ESCRIBES un snapshot no te borra el campo', traFoco === notaPrevia,
  traFoco === notaPrevia ? `sigue «${notaPrevia.slice(0, 30)}…»` : `obtenido «${traFoco.slice(0, 34)}» · esperado «${notaPrevia.slice(0, 34)}»`);

await p.evaluate(() => document.getElementById('jNote').blur());
await p.evaluate(r => window.__CAP.remoto(r, Object.assign({}, window.__CAP.DOCS[r], { note: 'escrita desde otro dispositivo', updatedAt: Date.now() + 900000 })), rutaDia);
await p.waitForTimeout(600);
const notaNueva = await p.inputValue('#jNote');
paso('SIN FOCO un snapshot mas nuevo si reemplaza el dia', notaNueva === 'escrita desde otro dispositivo',
  `obtenido «${notaNueva.slice(0, 34)}» · esperado «escrita desde otro dispositivo»`);
await p.evaluate(r => window.__CAP.remoto(r, Object.assign({}, window.__CAP.DOCS[r], { note: 'esto es viejo y no debe ganar', updatedAt: 1 })), rutaDia);
await p.waitForTimeout(600);
const traViejo = await p.inputValue('#jNote');
paso('y uno mas viejo NO lo reemplaza (regla updatedAt)', traViejo === 'escrita desde otro dispositivo',
  `obtenido «${traViejo.slice(0, 34)}» · esperado «escrita desde otro dispositivo»`);

/* ── E · los errores no se esconden ──────────────────────────────────────── */
await p.evaluate(() => { window.__CAP.rompe('permission-denied'); });
const nSets = await p.evaluate(() => window.__CAP.REG.sets.length);
await p.evaluate(() => FUT.updateAccount('cap1', { dd: 2500 }));
await p.waitForFunction(n => window.__CAP.REG.sets.length > n, nSets, { timeout: 8000, polling: 50 });
await p.waitForTimeout(900);
const aviso = await p.evaluate(() => document.getElementById('jSaved').textContent.trim());
paso('UN FALLO DE ESCRITURA se avisa en pantalla', /no se pudo guardar/i.test(aviso), `«${aviso}»`);
paso('y el aviso trae el codigo del error, no un generico', /permission-denied/.test(aviso), `«${aviso}»`);
/* LIMITACION REAL, no un defecto de la prueba: cuando el db falla, el dato queda
   solo en memoria. La app avisa, pero NO cae a localStorage, asi que al recargar
   se pierde. Se afirma el comportamiento tal cual es para que quede escrito. */
const navTrasFallo = await p.evaluate(() => { try { return Object.keys(localStorage).filter(k => k.indexOf('cabina-mnq') === 0); } catch (e) { return []; } });
paso('y NO cae en silencio a localStorage (dato en memoria: ver limitación)', navTrasFallo.length === 0, navTrasFallo.length ? navTrasFallo.join(', ') : 'ninguna clave');
paso('y la promesa rechazada no revienta la pagina', !errs.some(e => e.startsWith('PAGEERROR')), errs.filter(e => e.startsWith('PAGEERROR')).join(' | ') || 'sin pageerror');
await p.evaluate(() => { window.__CAP.rompe(null); });

/* ── F · el contraste: sin capsula, al navegador ─────────────────────────── */
const q = await ctx.newPage(); enchufa(q);
await q.goto(BASE, { waitUntil: 'load' });
await q.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await q.waitForTimeout(1200);
const rotuloSin = await q.evaluate(() => ({ r: document.getElementById('saveState').textContent.trim(), c: typeof window.claude }));
paso('SIN CAPSULA el rotulo dice guardado local', rotuloSin.r === 'guardado local', `«${rotuloSin.r}» · window.claude ${rotuloSin.c}`);
await q.evaluate(() => FUT.createAccount({ id: 'sin1', firm: 'Sin', name: 'Sin cápsula', kind: 'Evaluación',
  size: 10000, dd: 500, ddKind: 'estatico', target: 600, limit: 10, status: 'activa', ledger: [] }));
await q.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}').settings || {}).accounts != null; } catch (e) { return false; } }, null, { timeout: 8000, polling: 50 });
const enDisco = await q.evaluate(() => { try { return (JSON.parse(localStorage.getItem('cabina-mnq:v1')).settings.accounts || []).some(x => x.id === 'sin1'); } catch (e) { return false; } });
paso('y ahi SI escribe en localStorage', enDisco === true, enDisco ? 'la cuenta está en cabina-mnq:v1' : 'no llegó al disco');

/* ── consola ─────────────────────────────────────────────────────────────── */
paso('SIN ERRORES DE CONSOLA', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'limpio');

await b.close(); srv.close();
console.log('');
console.log(`fallos: ${fallos.length}`);
if (fallos.length) { console.log(`❌ ${fallos.length} fallos: ${fallos.join(' · ')}`); process.exit(1); }
console.log('✅ la capa db del artefacto queda cubierta'); process.exit(0);
