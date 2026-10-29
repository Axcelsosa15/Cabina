/* LO QUE YA ESCRIBISTE, EN VEZ DE UNA CONSTANTE.

   El formulario de operacion nueva venia con «MNQ», «long», 1 contrato y calidad
   A escritos a fuego. No son los datos de nadie: son los de quien escribio esa
   linea del codigo. Quien opera NQ de dos en dos reescribia dos de esos campos en
   CADA operacion, antes incluso de llegar al plan — y el numero de operaciones
   registradas es el cuello de botella real de un journal.

   Lo que esta prueba vigila, y por que cada cosa:

     · que el instrumento, los contratos, la cuenta y el setup vengan de TU ultima
       operacion y no de la constante;
     · que la DIRECCION no se herede. Es la decision deliberada de este cambio:
       cambia de una operacion a la siguiente, decide el signo de todo lo que el
       motor deriva, y una direccion equivocada no se ve porque la ficha queda
       plausible. «Siempre long» es ciego, pero ciego de forma PREDECIBLE; «lo que
       hiciste la vez anterior» acierta mas a menudo y por eso se deja de mirar;
     · que la CALIDAD tampoco: es un juicio sobre la operacion, no un dato que se
       repita, y heredarla seria pre-juzgar la nueva con la nota de la anterior;
     · que lo heredado se DIGA en pantalla. Un campo relleno que el usuario no
       escribio y que nadie nombra es indistinguible de uno que puso el mismo la
       semana pasada, y entonces deja de leerlo;
     · que una `seed` explicita de quien abre el editor GANE sobre lo heredado, y
       que el aviso no mienta diciendo que ese campo viene de la ultima operacion;
     · que sin ninguna operacion previa no cambie nada: ni herencia ni aviso.

   Su modo de fallo: que rellenar campos solo acabe guardando operaciones con el
   instrumento de ayer sin que nadie lo note, que es peor que teclearlo. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
/* SIRVE LO QUE SUBE PAGES, no el mismo HTML para cualquier ruta. Desde que la
   aplicación salió a `./app.js`, un servidor que devuelve el documento para toda
   petición le da HTML al navegador donde espera un script: lo rechaza por MIME y
   la página no arranca. `sirvePublicado` lee del propio workflow qué se publica y
   404 para lo demás, que es justo lo que hace útiles a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
/* UN SOLO CONTEXTO para todas las pestañas. Cada `newContext` trae su propio
   almacenamiento, asi que la comprobacion de persistencia del final daria roja
   SIEMPRE y por el motivo equivocado: no porque la herencia no sobreviva, sino
   porque la pestaña nueva no veria ninguna operacion. Es la misma trampa que
   `rapido.mjs` documenta al abrir su segunda pestaña. */
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const errs = [];

async function abrir() {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1200);
  return p;
}
/* Abre el formulario de operacion nueva y devuelve lo que trae puesto. */
async function nuevaOp(p) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(300);
  await p.click('#ftNew'); await p.waitForTimeout(420);
  const v = await p.evaluate(() => {
    const g = k => { const el = document.getElementById('ef_' + k); return el ? el.value : null; };
    const h = document.querySelector('.hered');
    return { instrument: g('instrument'), qty: g('qty'), direction: g('direction'),
             quality: g('quality'), accountId: g('accountId'), setupId: g('setupId'),
             aviso: h ? h.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  await p.keyboard.press('Escape'); await p.waitForTimeout(260);
  return v;
}

console.log('\n═══ SIN NADA ESCRITO ANTES · los valores de fabrica siguen donde estaban ═══');
const p1 = await abrir();
await p1.evaluate(async () => {
  FUT.createAccount({ id: 'H1', firm: 'Firma', name: 'Evaluación 50K', kind: 'Evaluación',
    size: 50000, dd: 2000, ddKind: 'trailing_lock', trailBase: 'intradia',
    target: 3000, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  FUT.setSelectedAccount('H1');
  await new Promise(r => setTimeout(r, 700));
});
const vacio = await nuevaOp(p1);
ok(vacio.instrument === 'MNQ' && vacio.qty === '1',
   'sin ninguna operacion previa manda la constante de siempre: MNQ y 1 contrato',
   `${vacio.instrument} · ${vacio.qty}`);
ok(vacio.aviso === null,
   'y NO aparece el aviso de herencia: no hay nada de donde heredar', 'sin aviso');

console.log('\n═══ CON UNA OPERACION ESCRITA · los cuatro campos que se repiten ═══');
await p1.evaluate(async () => {
  FUT.createTrade({ type: 'futuros', date: '2026-10-28', time: '10:15', accountId: 'H1',
    instrument: 'NQ', direction: 'short', qty: 3, quality: 'C', entry: 20150, stop: 20180,
    exit: 20100, source: 'manual', createdAt: Date.now() });
  await new Promise(r => setTimeout(r, 800));
});
const hered = await nuevaOp(p1);
ok(hered.instrument === 'NQ', 'el instrumento viene de tu ultima operacion, no de la constante', hered.instrument);
ok(hered.qty === '3', 'y los contratos tambien', hered.qty);
ok(hered.accountId === 'H1', 'y la cuenta', hered.accountId);

console.log('\n═══ LO QUE NO SE HEREDA, Y POR QUE ═══');
/* La ultima operacion era SHORT y de calidad C. Si estos dos cambiaran, el
   formulario estaria afirmando sobre la operacion nueva dos cosas que nadie ha
   dicho: su direccion y su nota de ejecucion. */
ok(hered.direction === 'long',
   'la DIRECCION no se hereda aunque la anterior fuera short: decide el signo de todo y no se ve si sale mal',
   `anterior=short · nueva=${hered.direction}`);
ok(hered.quality === 'A',
   'la CALIDAD tampoco: es un juicio sobre la operacion, no un dato que se repita',
   `anterior=C · nueva=${hered.quality}`);

console.log('\n═══ LO HEREDADO SE DICE · un campo relleno que nadie nombra deja de leerse ═══');
ok(hered.aviso != null, 'aparece el aviso de herencia', hered.aviso ? 'si' : 'NO');
ok(/instrumento/i.test(hered.aviso || '') && /contratos/i.test(hered.aviso || '') && /cuenta/i.test(hered.aviso || ''),
   'y NOMBRA los campos que vienen heredados, uno por uno',
   (hered.aviso || '').slice(0, 120));
ok(!/direcci[oó]n/i.test(hered.aviso || '') && !/calidad/i.test(hered.aviso || ''),
   'y NO nombra los que no hereda: el aviso dice la verdad entera o no sirve',
   'sin direccion ni calidad');

console.log('\n═══ UNA SEED EXPLICITA GANA · y el aviso no miente sobre ella ═══');
/* Quien abre el editor con una `seed` esta expresando una intencion de ESA
   llamada; lo heredado es una suposicion sobre el pasado. La intencion gana, y
   entonces ese campo ya no se puede anunciar como heredado.

   Se prueba por el camino REAL que existe en la interfaz —«+ Operación» desde la
   tarjeta de una cuenta, que pasa `{ accountId }`— y no llamando a `openTrade` por
   dentro: la funcion vive en el cierre de la pagina, y una prueba que la invoca
   directamente comprueba una funcion que ningun usuario puede llamar. */
await p1.evaluate(async () => {
  FUT.createAccount({ id: 'H2', firm: 'Otra', name: 'Fondeada 100K', kind: 'Fondeada',
    size: 100000, dd: 3000, ddKind: 'trailing_lock', trailBase: 'intradia',
    target: 0, limit: 60, status: 'activa', ledger: [], total: 0, best: 0 });
  await new Promise(r => setTimeout(r, 700));
});
await p1.click('.tabbtn[data-tab="cuentas"]'); await p1.waitForTimeout(500);
const abrioDesdeCuenta = await p1.evaluate(async () => {
  /* La tarjeta de H2, y SU boton: hay uno por cuenta. */
  const tarjeta = document.querySelector('.acct[data-id="H2"]') ||
    [...document.querySelectorAll('[data-id]')].find(e => e.dataset.id === 'H2');
  if (!tarjeta) return { encontrada: false };
  const btn = tarjeta.querySelector('[data-act="newtrade"]');
  if (!btn) return { encontrada: false };
  btn.click();
  await new Promise(r => setTimeout(r, 500));
  const g = k => { const el = document.getElementById('ef_' + k); return el ? el.value : null; };
  const h = document.querySelector('.hered');
  return { encontrada: true, accountId: g('accountId'), instrument: g('instrument'), qty: g('qty'),
           aviso: h ? h.textContent.replace(/\s+/g, ' ').trim() : null };
});
ok(abrioDesdeCuenta.encontrada, 'el boton «+ Operación» de la tarjeta de una cuenta existe y abre el editor',
   abrioDesdeCuenta.encontrada ? 'abierto' : 'NO SE ENCONTRO');
ok(abrioDesdeCuenta.accountId === 'H2',
   'la cuenta de la seed gana sobre la cuenta heredada: es la intencion de esta llamada',
   `heredada=H1 · seed=H2 · puesta=${abrioDesdeCuenta.accountId}`);
ok(abrioDesdeCuenta.instrument === 'NQ' && abrioDesdeCuenta.qty === '3',
   'pero los demas campos se siguen heredando',
   `${abrioDesdeCuenta.instrument} · ${abrioDesdeCuenta.qty}`);
ok(abrioDesdeCuenta.aviso != null && !/cuenta/i.test(abrioDesdeCuenta.aviso),
   'y el aviso YA NO dice que la cuenta venga de la ultima operacion, porque no viene',
   (abrioDesdeCuenta.aviso || '').slice(0, 110));
await p1.keyboard.press('Escape'); await p1.waitForTimeout(300);

console.log('\n═══ LA ULTIMA ES LA ULTIMA · por fecha de creacion, no por orden de lista ═══');
await p1.evaluate(async () => {
  FUT.createTrade({ type: 'futuros', date: '2026-10-29', time: '09:30', accountId: 'H1',
    instrument: 'MES', direction: 'long', qty: 7, source: 'manual', createdAt: Date.now() + 5000 });
  await new Promise(r => setTimeout(r, 800));
});
const masNueva = await nuevaOp(p1);
ok(masNueva.instrument === 'MES' && masNueva.qty === '7',
   'escribir otra operacion cambia lo que se hereda: manda la mas reciente',
   `${masNueva.instrument} · ${masNueva.qty}`);

console.log('\n═══ UNA REFERENCIA MUERTA NO SE HEREDA · ni se anuncia ═══');
/* La cuenta y el setup son punteros, y el usuario puede borrarlos. La operacion
   conserva el id, pero el desplegable ya no tiene esa opcion: heredarlo igual deja
   al navegador eligiendo la PRIMERA de la lista mientras el aviso afirma «viene de
   tu ultima operacion: la cuenta». El aviso existe para que lo heredado se pueda
   comprobar de un vistazo; si miente ahi, no sirve en ningun sitio. */
await p1.evaluate(async () => {
  /* La ultima operacion vive en una cuenta nueva, y luego esa cuenta desaparece. */
  FUT.createAccount({ id: 'H3', firm: 'Efimera', name: 'Se borra', kind: 'Evaluación',
    size: 25000, dd: 1000, ddKind: 'trailing_lock', trailBase: 'intradia',
    target: 1500, limit: 30, status: 'activa', ledger: [], total: 0, best: 0 });
  await new Promise(r => setTimeout(r, 400));
  FUT.createTrade({ type: 'futuros', date: '2026-10-29', time: '11:00', accountId: 'H3',
    instrument: 'MYM', qty: 5, source: 'manual', createdAt: Date.now() + 90000 });
  await new Promise(r => setTimeout(r, 500));
  FUT.deleteAccount('H3');
  await new Promise(r => setTimeout(r, 700));
});
const muerta = await nuevaOp(p1);
ok(muerta.instrument === 'MYM' && muerta.qty === '5',
   'lo que sigue existiendo se hereda igual: instrumento y contratos de esa misma operacion',
   `${muerta.instrument} · ${muerta.qty}`);
/* ESTA DE AQUI NO ES LA GUARDIA, y conviene decirlo: sabotear el filtro de
   referencias muertas la deja VERDE, porque un <select> descarta por su cuenta un
   valor que no esta entre sus opciones. Mide al navegador, no a esta app. Se deja
   como descripcion del estado final —util para quien lea el archivo— y la guardia
   de verdad es la linea siguiente, que es la unica que el sabotaje pone roja. */
ok(muerta.accountId !== 'H3',
   'la cuenta borrada no acaba puesta en el formulario (lo descarta el propio <select>)',
   `puesta=${muerta.accountId}`);
/* EL DEFECTO REAL ES EL AVISO QUE MIENTE. El desplegable se corrige solo, pero la
   linea de arriba seguiria afirmando «viene de tu ultima operacion: la cuenta»
   sobre un campo que el navegador acaba de rellenar con otra cosa. Un aviso que
   miente en un caso es un aviso que no se puede creer en ninguno. */
ok(!/cuenta/i.test(muerta.aviso || ''),
   'y el aviso NO la anuncia: lo heredado tiene que poder comprobarse de un vistazo',
   (muerta.aviso || '').slice(0, 110));

console.log('\n═══ SOBREVIVE A RECARGAR · se hereda del dato guardado, no de una variable ═══');
/* SE COMPARA CONTRA LO QUE LA PRIMERA PESTAÑA HEREDA AHORA, no contra un par de
   valores escritos a mano. Esta linea decia «MES» y «7» —lo ultimo que se habia
   guardado el dia que se escribio— y se puso roja al añadir mas arriba una seccion
   que guarda otra operacion: roja por CRECER el archivo, no porque la herencia
   dejara de sobrevivir, que es lo unico que mide. */
const esperado = await nuevaOp(p1);
const p2 = await abrir();
const tras = await nuevaOp(p2);
ok(tras.instrument === esperado.instrument && tras.qty === esperado.qty,
   'en una pestaña nueva se hereda lo MISMO que en la primera: sale del registro, no de la sesion',
   `${tras.instrument} · ${tras.qty}`);

ok(errs.length === 0, 'la pagina no lanzo ningun error', errs.length ? errs.join(' | ') : 'sin pageerror');

await b.close(); srv.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);