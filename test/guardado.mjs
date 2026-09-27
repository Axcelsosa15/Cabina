/* GUARDADO · lo que la cabina dice cuando NO pudo guardar.

   Todo lo demas en esta suite comprueba que un numero sale bien. Esto comprueba
   algo distinto: que cuando el almacenamiento falla, la pantalla no finge que
   todo esta en su sitio. Es el mismo defecto que el respaldo a medias -- una
   degradacion silenciosa -- pero en el camino corto: la operacion que acabas de
   escribir.

   Lo medido ANTES de arreglarlo, con el navegador de verdad:

     localStorage lleno   ->  «guardado en este navegador»   y tras recargar, 0 ops
     la base rechaza      ->  el rotulo seguia en «sincronizado» a los 2,8 s
     y el aviso vivia en #jSaved, que esta OCULTO en 5 de las 6 pestanas

   Lo que se exige aqui, y nada mas: que no se diga «guardado» cuando no se
   guardo, que el aviso este donde se ve siempre y no se vaya solo, y que un
   guardado bueno lo limpie. NO se exige una politica de respaldo -- copiar a
   localStorage lo que la base rechazo es una decision de producto, no un arreglo,
   y no se toma aqui.

   Su modo de fallo: que alguien devuelva el destello de 2,5 s, o haga que un
   guardado bueno de CUALQUIER documento limpie el aviso de OTRO que sigue sin
   guardar. */
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

const lee = p => p.evaluate(() => {
  const j = document.getElementById('jSaved'), s = document.getElementById('saveState'), f = document.getElementById('footerStore');
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return !!(el.offsetParent || r.width || r.height); };
  return {
    jSaved: (j || {}).textContent || '', jVis: vis(j),
    rotulo: (s || {}).textContent || '', rotVis: vis(s),
    pie: (f || {}).textContent || '',
    ops: (window.FUT && window.FUT.trades ? window.FUT.trades() : []).length,
  };
});
const opRapida = async (p, txt) => {
  await p.click('#quickBtn'); await p.waitForTimeout(450);
  await p.fill('#qkText', txt); await p.waitForTimeout(550);
  await p.click('#qkSave'); await p.waitForTimeout(1000);
};

/* ═══ EL AVISO TIENE QUE VIVIR DONDE SE VE ═══════════════════════════════
   #jSaved esta dentro de la pestana Cabina. Guardas una operacion desde
   Futuros, falla, y el motivo se escribe en un elemento que no esta en
   pantalla. Por eso el aviso persistente va en el rotulo de la barra. */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1400);
  const v = {};
  for (const t of ['cabina', 'futuros', 'invest', 'playbook', 'ideas', 'calc']) {
    await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(220);
    v[t] = await lee(p);
  }
  const ocultas = Object.keys(v).filter(t => !v[t].jVis);
  const rotuloSiempre = Object.keys(v).every(t => v[t].rotVis);
  ok(ocultas.length === 5, 'el destello #jSaved esta oculto en 5 de las 6 pestanas',
     `oculto en: ${ocultas.join(', ') || 'ninguna'}`);
  ok(rotuloSiempre, 'el rotulo de la barra se ve en TODAS las pestanas',
     `visible en ${Object.keys(v).filter(t => v[t].rotVis).length} de 6`);
  await ctx.close();
}

/* ═══ CASO A · localStorage lleno ════════════════════════════════════════ */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1400);
  const antes = await lee(p);
  ok(/local/i.test(antes.rotulo), 'de partida guarda en este navegador', `«${antes.rotulo}»`);

  /* se rompe DESPUES de cargar: la lectura inicial si funciono */
  await p.evaluate(() => {
    window.__INTENTOS = 0;
    Storage.prototype.setItem = function () { window.__INTENTOS++; const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; };
  });
  await opRapida(p, 'NQ +185');
  const t0 = await lee(p);
  const intentos = await p.evaluate(() => window.__INTENTOS);
  ok(intentos > 0, 'se intento escribir de verdad', `${intentos} intentos, todos rechazados`);
  ok(t0.ops === 1, 'la operacion sigue EN PANTALLA: no se borra lo que el usuario escribio', `ops ${t0.ops}`);
  ok(!/^guardado/i.test(t0.jSaved.trim()), 'NO dice «guardado» cuando no se guardo', `dijo «${t0.jSaved.trim()}»`);
  ok(!/^guardado local$/i.test(t0.rotulo.trim()) && /sin guardar/i.test(t0.rotulo),
     'el rotulo de la barra avisa de que hay algo sin guardar', `«${t0.rotulo.trim()}»`);

  /* y no es un destello: sigue ahi cuando el flash ya se fue */
  await p.waitForTimeout(3200);
  const t1 = await lee(p);
  ok(/sin guardar/i.test(t1.rotulo), 'el aviso SIGUE a los 3,2 s: no es un destello de 2,5 s', `«${t1.rotulo.trim()}»`);
  ok(/pierden|no se guard|recargas/i.test(t1.pie), 'el pie dice que se pierden si recargas', `«${t1.pie.trim().slice(0, 90)}»`);
  ok(/respaldo|copia/i.test(t1.pie), 'y dice que hay un respaldo que copiar', `«${t1.pie.trim().slice(-70)}»`);

  /* la advertencia era cierta */
  await p.evaluate(() => { delete Storage.prototype.setItem; });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1400);
  const t2 = await lee(p);
  ok(t2.ops === 0, 'tras recargar la operacion NO esta: el aviso decia la verdad', `ops ${t2.ops}`);
  ok(!/sin guardar/i.test(t2.rotulo), 'y en la sesion nueva el rotulo vuelve a la normalidad', `«${t2.rotulo.trim()}»`);
  await ctx.close();
}

/* ═══ CASO B · la base del artefacto rechaza la escritura ════════════════ */
const dobleDb = async () => {
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    const DOCS = {}, CB = {}; let roto = false, rutaRota = '';
    const cp = o => JSON.parse(JSON.stringify(o));
    const snap = ruta => ({ exists: Object.prototype.hasOwnProperty.call(DOCS, ruta), data: () => DOCS[ruta] });
    const doc = ruta => ({
      async set(d) {
        if (roto) { const e = new Error('sin permiso'); e.code = 'permission-denied'; throw e; }
        if (rutaRota && ruta === rutaRota) { const e = new Error('solo ese documento'); e.code = 'doc-roto'; throw e; }
        DOCS[ruta] = cp(d); (CB[ruta] || []).forEach(f => { try { f(snap(ruta)); } catch (e) { } });
      },
      async get() { return snap(ruta); }, async delete() { delete DOCS[ruta]; },
      onSnapshot(cb) { (CB[ruta] = CB[ruta] || []).push(cb); try { cb(snap(ruta)); } catch (e) { } return () => { }; },
    });
    const consulta = n => ({
      doc: id => doc(n + '/' + id), orderBy() { return this; }, limit() { return this; },
      async get() { const pref = n + '/'; return { docs: Object.keys(DOCS).filter(k => k.indexOf(pref) === 0).map(k => ({ id: k.slice(pref.length), data: () => DOCS[k] })) }; },
      onSnapshot(cb) { this.get().then(q => { try { cb(q); } catch (e) { } }).catch(() => { }); return () => { }; },
    });
    window.claude = { use: async n => n === 'db' ? { doc, collection: consulta } : n === 'permissions' ? { request: async () => true } : null };
    window.__ROMPE = v => { roto = v; };
    window.__ROMPE_RUTA = r => { rutaRota = r; };
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1700);
  return { ctx, p };
};
{
  const { ctx, p } = await dobleDb();
  const antes = await lee(p);
  ok(/sincronizado/i.test(antes.rotulo), 'de partida esta sincronizado con la base', `«${antes.rotulo.trim()}»`);
  await p.evaluate(() => window.__ROMPE(true));
  await opRapida(p, 'NQ +185');
  const t0 = await lee(p);
  ok(t0.ops === 1, 'la operacion sigue en pantalla', `ops ${t0.ops}`);
  ok(/permission-denied/.test(t0.jSaved + t0.rotulo + t0.pie), 'se dice el motivo que dio la base',
     `«${(t0.jSaved || t0.rotulo).trim()}»`);
  await p.waitForTimeout(3200);
  const t1 = await lee(p);
  ok(!/^sincronizado$/i.test(t1.rotulo.trim()), 'a los 3,2 s el rotulo YA NO dice «sincronizado»', `«${t1.rotulo.trim()}»`);
  ok(/sin guardar/i.test(t1.rotulo), 'dice que hay algo sin guardar', `«${t1.rotulo.trim()}»`);
  ok(!/se guardan y se comparten/.test(t1.pie), 'y el pie deja de prometer que se guarda', `«${t1.pie.trim().slice(0, 80)}»`);

  /* Cuando la base vuelve: guardar OTRO documento no limpia el aviso, porque los
     dos que fallaron siguen sin guardar. Esto no es un defecto del aviso, es la
     razon de llevarlo por documento -- y se comprueba en las dos direcciones. */
  await p.evaluate(() => window.__ROMPE(false));
  const pend0 = Number((await lee(p)).rotulo.replace(/[^0-9]/g, '')) || 0;
  await opRapida(p, 'MNQ +40');
  await p.waitForTimeout(1200);
  const t2 = await lee(p);
  const pend1 = Number(t2.rotulo.replace(/[^0-9]/g, '')) || 0;
  ok(t2.ops === 2, 'con la base de vuelta, la operacion nueva entra', `ops ${t2.ops}`);
  ok(/sin guardar/i.test(t2.rotulo) && pend1 < pend0,
     'el aviso BAJA pero no desaparece: la operacion vieja sigue sin guardar',
     `de ${pend0} a ${pend1}`);
  /* y ahora si: se vuelven a guardar LOS MISMOS documentos que fallaron */
  await p.evaluate(async () => {
    /* TODAS, no `[0]`: la lista viene de la mas nueva a la mas vieja, asi que `[0]`
       era la que SI se habia guardado y la que fallo se quedaba pendiente. */
    for (const t of (window.FUT.trades() || [])) window.FUT.updateTrade(t.id, { notes: (t.notes || '') + '.' });
  });
  await p.waitForTimeout(1200);
  await p.click('[data-tab="cabina"]'); await p.waitForTimeout(350);
  const hayC = await p.evaluate(() => document.querySelectorAll('.check input[type=checkbox]:not(:disabled)').length);
  if (hayC) { await p.click('.check input[type=checkbox]:not(:disabled)'); await p.waitForTimeout(1200); }
  const t3 = await lee(p);
  ok(/sincronizado/i.test(t3.rotulo),
     'cuando se guardan los MISMOS documentos que fallaron, el rotulo se limpia', `«${t3.rotulo.trim()}»`);
  await ctx.close();
}

/* ═══ UN GUARDADO BUENO NO TAPA OTRO QUE SIGUE ROTO ══════════════════════
   El fallo facil al arreglar esto: un contador que cualquier exito pone a
   cero. Se rompe SOLO el dia de hoy: la ficha de la operacion entra, el dia
   no, y el rotulo tiene que seguir avisando. */
{
  const { ctx, p } = await dobleDb();
  /* Se rompe UNICAMENTE el documento del dia, sin recargar: `addInitScript`
     vuelve a correr en cada navegacion y reemplazaria cualquier parche puesto
     despues de cargar -- se intento asi y el doble quedaba intacto. */
  const hoy = await p.evaluate(() => {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  });
  await p.evaluate(f => window.__ROMPE_RUTA('days/' + f), hoy);
  await p.click('[data-tab="cabina"]'); await p.waitForTimeout(350);
  const hay = await p.evaluate(() => document.querySelectorAll('.check input[type=checkbox]:not(:disabled)').length);
  if (hay) { await p.click('.check input[type=checkbox]:not(:disabled)'); await p.waitForTimeout(1200); }
  const d0 = await lee(p);
  ok(hay > 0 && /sin guardar/i.test(d0.rotulo), 'con SOLO el dia roto, el rotulo avisa', `${hoy} · ${hay} casillas · «${d0.rotulo.trim()}»`);
  /* Ahora se guarda bien OTRO documento -- `settings/main`, que no toca el dia.
     Con una operacion no valia: el registro rapido escribe la ficha Y el dia, asi
     que el dia se volvia a romper en la misma accion y el contador regresaba a 1
     solo. La asercion parecia vigilar la logica por documento y no vigilaba nada:
     el sabotaje del contador global la dejaba en verde. */
  const guardoOtro = await p.evaluate(async () => {
    const a = (window.FUT.accounts() || [])[0];
    if (!a) return false;
    return window.FUT.updateAccount(a.id, { name: String(a.name || '') + ' x' });
  });
  await p.waitForTimeout(1400);
  const d1 = await lee(p);
  ok(guardoOtro, 'se guarda bien otro documento: settings/main', `${guardoOtro}`);
  ok(/sin guardar/i.test(d1.rotulo),
     'y el aviso del DIA sigue: un guardado bueno no tapa otro documento roto', `«${d1.rotulo.trim()}»`);
  /* y el dia, en efecto, sigue siendo el que falla */
  ok(/doc-roto/.test(d1.pie), 'el motivo que se muestra es el del documento roto', `«${d1.pie.trim().slice(0, 96)}»`);
  await ctx.close();
}

/* ═══ Y SE TIENE QUE VER EN UN TELEFONO ══════════════════════════════════
   El rotulo de la barra esta `display: none` por debajo de 700px, a proposito:
   «sincronizado» o «guardado local» es informacion ambiental y en un telefono solo
   gasta la primera linea. Pero el aviso viaja por ese mismo elemento, asi que el
   arreglo entero se borraba justo en la pantalla mas pequena. Medido cuando pasaba:
   el rotulo decia «SIN GUARDAR · 2» y su rectangulo era 0x0. */
for (const [w, h, nombre] of [[1440, 900, 'escritorio'], [430, 900, 'telefono']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1400);
  const ambiental = await p.evaluate(() => {
    const el = document.getElementById('saveState'), r = el.getBoundingClientRect();
    return { txt: el.textContent.trim(), alto: Math.round(r.height) };
  });
  await p.evaluate(() => { Storage.prototype.setItem = function () { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }; });
  await opRapida(p, 'NQ +185');
  const av = await p.evaluate(() => {
    const el = document.getElementById('saveState'), r = el.getBoundingClientRect();
    const de = document.documentElement, cs = getComputedStyle(el);
    return { txt: el.textContent.trim(), alto: Math.round(r.height), ancho: Math.round(r.width),
      sale: Math.round(r.right - de.clientWidth), color: cs.color,
      scrollX: de.scrollWidth - de.clientWidth };
  });
  ok(/SIN GUARDAR/.test(av.txt) && av.alto > 0 && av.ancho > 0,
     `el aviso SE VE en ${nombre} ${w}px`, `«${av.txt}» · ${av.ancho}×${av.alto}px`);
  ok(av.sale <= 0 && av.scrollX <= 2, `y no desborda la pantalla en ${nombre}`,
     `borde derecho a ${av.sale}px del limite · scrollX ${av.scrollX}`);
  ok(/rgb\(224, 96, 79\)/.test(av.color), `con el rojo de error en ${nombre}`, av.color);
  if (nombre === 'telefono') {
    ok(ambiental.alto === 0, 'y lo AMBIENTAL sigue escondido en el telefono: solo se ensena lo que importa',
       `«${ambiental.txt}» medido a ${ambiental.alto}px de alto`);
  }
  await ctx.close();
}

ok(errs.length === 0, 'ningun error de pagina en todo el recorrido', errs.slice(0, 2).join(' · ') || 'ninguno');
await b.close(); srv.close();
console.log(fallos.length ? `\n  ${fallos.length} fallos` : '\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
