/* BORRADO EN MASA · seleccionar y borrar varias cosas de una vez.

   Es la función más destructiva de la app y no hay servidor detrás: los datos
   viven en este navegador. Por eso lo que se comprueba aquí no es sólo que
   borre, sino las tres cosas que impiden que una equivocación sea definitiva:

     · la confirmación dice QUÉ cambia, no cuántas filas;
     · lo borrado vuelve entero, incluso después de recargar;
     · en masa sólo se borra lo que está EN PANTALLA. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar } from './espera.mjs';
const errs = [], fallos = [];
const F = new Date('2026-09-17T14:00:00Z').getTime();
const b = await chromium.launch();
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const CUENTA = { id: 'a1', name: 'Cuenta A', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };

async function pagina(semilla) {
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(semilla))});}catch(e){}`);
  await p.goto('file://' + process.cwd() + '/../index.html'); await arrancada(p, '.tabbtn');
  return p;
}
const base = extra => Object.assign({ settings: { meta: {}, accounts: [CUENTA], rules: [] } }, extra || {});
const txt = (p, s) => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
const vivos = (p, host) => p.$$eval(`#${host} tr[data-id], #${host} tr[data-date], #${host} .card[data-id]`,
  n => n.filter(x => x.offsetParent !== null).length);

console.log('\n═══ el clic selecciona; borrar dice qué cambia ═══');
{
  const trades = {};
  for (let i = 0; i < 6; i++) trades['t' + i] = { id: 't' + i, type: 'futuros', accountId: 'a1', date: '2026-09-17',
    instrument: 'MNQ', direction: 'long', qty: 2, entry: 21000, stop: 20980, exit: 21000 + (i % 2 ? 30 : -20) };
  const p = await pagina(base({ trades }));
  await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);

  /* El journal vive en la sub-vista «Diario». Mientras miras «Resumen» sus
     filas existen en el DOM pero no en pantalla, y «Todo» habría marcado seis
     operaciones que no estás viendo. */
  ok(await p.evaluate(() => document.getElementById('selbtn-jrTable').disabled),
     'en «Resumen» el botón está apagado: el journal no está a la vista');
  await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
  await new Promise(r => setTimeout(r, 60));
  ok(!(await p.evaluate(() => document.getElementById('selbtn-jrTable').disabled)),
     'y se enciende al entrar en «Diario»');

  const bal0 = await p.evaluate(() => FUT.calculateAccountStats('a1').total);
  await p.click('#selbtn-jrTable'); await quieto(p);
  ok((await txt(p, '#selbtn-jrTable')) === 'Salir de selección', 'el botón se convierte en salida');
  await p.click('#jrTable tr[data-id]:nth-of-type(1)');
  await p.click('#jrTable tr[data-id]:nth-of-type(2)'); await quieto(p);
  ok(await p.$$eval('#jrTable tr.sel', n => n.length) === 2, 'el clic en la fila la marca, sin casillas');

  await p.click('[data-sel="borrar"]'); await quieto(p);
  const conf = await txt(p, '#selbar-jrTable');
  ok(/de resultado/.test(conf) && /Cuenta A/.test(conf),
     'la confirmación dice el RESULTADO y la cuenta que mueve, no sólo «2 filas»', conf.slice(0, 80));

  await p.click('[data-sel="si"]'); await trasGuardar(p);
  ok(await vivos(p, 'jrTable') === 4, 'borra las 2 marcadas y deja las otras 4');
  const bal1 = await p.evaluate(() => FUT.calculateAccountStats('a1').total);
  /* `!==` era demasiado flojo: pasaba con cualquier cambio, NaN incluido. Las dos
     operaciones que se borran valen +$40 juntas -- lo dice la propia confirmación
     que se comprueba tres líneas arriba -- asi que el balance tiene que bajar
     exactamente eso. Una asercion que solo dice «cambio» no demuestra que el
     borrado reste lo que resta. */
  ok(bal1 === bal0 - 40, 'y el balance baja exactamente los $40 de las dos borradas', `${bal0} → ${bal1}`);

  console.log('\n═══ lo borrado vuelve, incluso tras recargar ═══');
  ok(await p.evaluate(() => !!document.getElementById('papelera')), 'queda una barra con «Deshacer»');
  /* NO se usa p.reload(). Sobre file:// Chromium tira el área de almacenamiento
     al recargar de forma intermitente — está documentado en sync.mjs desde antes,
     y es exactamente lo que hizo fallar esta aserción en CI y no aquí: la
     recarga se llevó la papelera, así que la barra no se pintaba y el test
     acusaba a la app de un defecto del navegador. 33 s en el runner contra 18 s
     en local; el mismo código, otra suerte.

     Lo que interesa es la misma pregunta: si se relee lo que quedó escrito,
     ¿vuelve la papelera? Así que se lee el disco y se abre una pestaña NUEVA
     sembrada con exactamente eso. Se arrastran las DOS claves: los datos y la
     papelera, que vive en `cabina-mnq:v1:papelera`. */
  const enDiscoAhora = await p.evaluate(() => ({
    datos: localStorage.getItem('cabina-mnq:v1'),
    papelera: localStorage.getItem('cabina-mnq:v1:papelera'),
  }));
  const q = await p.context().newPage();
  q.on('pageerror', e => errs.push('PAGEERROR(reapertura): ' + e.message));
  await q.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await q.addInitScript(`try{const g=${JSON.stringify(enDiscoAhora)};if(g.datos)localStorage.setItem('cabina-mnq:v1',g.datos);if(g.papelera)localStorage.setItem('cabina-mnq:v1:papelera',g.papelera);}catch(e){}`);
  await q.goto('file://' + process.cwd() + '/../index.html'); await arrancada(q, '.tabbtn');
  /* Que el borrado siguiera hecho al reabrir es la mitad que faltaba: con la
     semilla re-sembrándose en cada navegación, las 2 operaciones volvían solas y
     «vuelven las 6» pasaba sin que «Deshacer» hiciera nada. Medido: 6 en disco
     antes del clic. Aquí se siembra lo GUARDADO, así que son 4. */
  ok(await q.evaluate(() => !!document.getElementById('papelera')),
     'que SOBREVIVE a recargar — un aviso que se va convierte «me equivoqué» en «ya no hay nada que hacer»');
  /* La pestaña nueva abre en Cabina, y `vivos` sólo cuenta lo VISIBLE: hay que
     ir al diario antes de contar, o se leen 0 filas y parece que no hay datos. */
  await q.click('.tabbtn[data-tab="futuros"]'); await quieto(q);
  await q.click('#ftSeg button[data-v="diario"]'); await quieto(q);
  ok(await vivos(q, 'jrTable') === 4, 'al reabrir, el borrado sigue hecho (4 operaciones)', await vivos(q, 'jrTable'));
  await q.click('[data-pap="undo"]'); await quieto(q);
  ok(await vivos(q, 'jrTable') === 6, 'vuelven las 6 operaciones');
  ok(await q.evaluate(() => FUT.calculateAccountStats('a1').total) === bal0,
     'y el balance vuelve al que era, al céntimo', bal0);
  await p.context().close();
}

console.log('\n═══ un solo mecanismo para las cinco listas ═══');
/* Cinco selectores distintos serían, en tres turnos, cinco borrados que se
   comportan distinto: el mismo defecto que este repositorio persigue en los
   números, trasladado a la interfaz. */
const casos = [
  { n: 'inversiones', tab: 'invest', host: 'ivOps', espera: /desplegados|cobrados/,
    semilla: { positions: { pv: { id: 'pv', asset: 'VOO', market: 'etfs', current: 530 } },
      trades: { i1: { id: 'i1', type: 'inversion', asset: 'VOO', market: 'etfs', op: 'compra', date: '2026-02-01', qty: 4, price: 480 },
                i2: { id: 'i2', type: 'inversion', asset: 'VOO', market: 'etfs', op: 'dividendo', date: '2026-03-01', pnl: 60 } } } },
  { n: 'playbook', tab: 'playbook', host: 'pbCards', sub: '#pbNav .tabbtn[data-v="futuros"]', espera: /operación|operaciones|cita/,
    semilla: { playbooks: { p1: { id: 'p1', name: 'Setup C', kind: 'futuros', type: 'futuros', status: 'activo' },
                            p2: { id: 'p2', name: 'FVG', kind: 'futuros', type: 'futuros', status: 'activo' } },
      trades: { tz: { id: 'tz', type: 'futuros', accountId: 'a1', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21020, setupId: 'p1' } } } },
  { n: 'ideas', tab: 'ideas', host: 'idCards', espera: /\d+ de \d+/,
    semilla: { ideas: { d1: { id: 'd1', name: 'Dropshipping', cat: 'online', status: 'idea' },
                        d2: { id: 'd2', name: 'Alquiler', cat: 'activos', status: 'idea' } } } },
  { n: 'sesiones', tab: 'cabina', host: 'histWrap', espera: /resultados/,
    semilla: { days: { '2026-09-10': { date: '2026-09-10', result: 120, trades: 2, closed: true },
                       '2026-09-11': { date: '2026-09-11', result: -40, trades: 1, closed: true } } } },
];
for (const c of casos) {
  const p = await pagina(base(c.semilla));
  await p.click(`.tabbtn[data-tab="${c.tab}"]`); await quieto(p);
  if (c.sub) { await p.click(c.sub); await quieto(p); }
  await new Promise(r => setTimeout(r, 80));
  const antes = await vivos(p, c.host);
  await p.click(`#selbtn-${c.host}`); await quieto(p);
  await p.click('[data-sel="todo"]'); await quieto(p);
  await p.click('[data-sel="borrar"]'); await quieto(p);
  const conf = await txt(p, `#selbar-${c.host}`);
  ok(c.espera.test(conf), `${c.n}: la confirmación dice qué se pierde`, conf.slice(8, 76));
  await p.click('[data-sel="si"]'); await trasGuardar(p);
  ok(await vivos(p, c.host) === 0, `${c.n}: borra las ${antes} seleccionadas`);
  await p.click('[data-pap="undo"]'); await quieto(p);
  await new Promise(r => setTimeout(r, 200));
  ok(await vivos(p, c.host) === antes, `${c.n}: y las ${antes} vuelven con «Deshacer»`);
  await p.context().close();
}

console.log('\n═══ borrar una cuenta arrastra sus operaciones, y se dice ═══');
{
  /* Ninguna otra lista arrastra nada. Borrar una cuenta deja sueltas las
     operaciones que la citan: siguen en el journal etiquetadas «sin cuenta
     asignada», pero su resultado sale de toda estadística de cuenta. Callarlo
     es la diferencia entre una limpieza y una pérdida. */
  const p = await pagina(base({}));
  await p.evaluate(() => {
    FUT.createAccount({ id: 'a2', name: 'Cuenta B', size: 25000, dd: 1000, ddKind: 'trailing', status: 'evaluacion', ledger: [] });
    FUT.createAccount({ id: 'a3', name: 'Cuenta C', size: 50000, dd: 2000, ddKind: 'estatico', status: 'pausada', ledger: [] });
    for (let i = 0; i < 4; i++) FUT.createTrade({ id: 'x' + i, type: 'futuros', accountId: 'a1', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 2, entry: 21000, stop: 20980, exit: 21030 });
  });
  await quieto(p); await new Promise(r => setTimeout(r, 120));
  const orden = () => p.evaluate(() => FUT.accounts().map(a => a.name).join(','));
  const ordenAntes = await orden();

  await p.click('#selbtn-accts'); await quieto(p);
  await p.click('#accts article.acct[data-id="a1"]');
  await p.click('#accts article.acct[data-id="a3"]'); await quieto(p);
  await p.click('[data-sel="borrar"]'); await quieto(p);
  const conf = await txt(p, '#selbar-accts');
  ok(/Cuenta A/.test(conf) && /Cuenta C/.test(conf), 'la confirmación nombra las cuentas', conf.slice(8, 40));
  ok(/quedan sin cuenta/.test(conf) && /fuera de las estadísticas/.test(conf),
     'y dice cuántas operaciones quedan sueltas y cuánto dinero sale de las estadísticas', conf.slice(30, 110));

  await p.click('[data-sel="si"]'); await trasGuardar(p); await new Promise(r => setTimeout(r, 200));
  ok((await orden()) === 'Cuenta B', 'borra las 2 y deja la otra');
  ok(await p.evaluate(() => FUT.trades().filter(t => t.accountId === 'a1').length) === 4,
     'las operaciones NO se borran con la cuenta: se quedan sueltas');

  await p.click('[data-pap="undo"]'); await quieto(p); await new Promise(r => setTimeout(r, 200));
  ok((await orden()) === ordenAntes, 'deshacer devuelve las cuentas a SU SITIO, no al final', await orden());
  ok(await p.evaluate(() => FUT.calculateAccountStats('a1').total) === 480,
     'y las estadísticas de la cuenta vuelven enteras');
  await p.context().close();
}

console.log('\n═══ el menú «•••» sobrevive a un repintado ═══');
{
  /* EL DEFECTO, y por qué hacía falta una prueba explícita. El estado de abierto
     del menú vivía SÓLO en el DOM, así que cualquier repintado de la lista de
     cuentas lo cerraba: abrías el menú, entraba una operación, y el menú se
     cerraba debajo del dedo.

     El bloque de abajo —pulsar «•••» y luego «Borrar»— lo tocaba sin afirmarlo:
     ganaba la carrera al repintado por unas decenas de milisegundos y pasaba. Al
     añadir trabajo al render en la fase 1, la perdió y empezó a fallar SIEMPRE,
     con el botón «Borrar» presente en el DOM y no visible. Medido con un
     MutationObserver: el menú se abría y un repintado lo cerraba ~50 ms después,
     también en la rama anterior. La suerte de reloj tapaba el defecto.

     Así que aquí se afirma la propiedad, en vez de depender de llegar antes. */
  const p = await pagina(base({}));
  await p.click('#accts article.acct[data-id="a1"] [data-act="menu"]'); await quieto(p);
  const abierto = () => p.evaluate(() => {
    const c = document.querySelector('#accts article.acct[data-id="a1"]');
    const m = c && c.querySelector('.acc-menu .menu');
    return !!m && !m.hidden && getComputedStyle(m).display !== 'none';
  });
  ok(await abierto(), 'el menú se abre');
  /* Un repintado de verdad, por la puerta de siempre: entra una operación. */
  await p.evaluate(() => FUT.createTrade({ id: 'rp1', type: 'futuros', accountId: 'a1', date: '2026-09-17',
    instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 }));
  await quieto(p); await new Promise(r => setTimeout(r, 700));
  ok(await abierto(), 'y sigue abierto tras repintar la tarjeta (se cerraba solo)');
  /* Y EL DISPARADOR REAL, que es el que costó encontrar: una DESCARGA. `bkDownload`
     crea un `<a download>` y le hace `click()`; ese clic sintético burbujeaba hasta
     `document`, donde el cierre del menú reacciona a «un clic en cualquier sitio»
     con una condición negativa. La migración al motor descarga un respaldo al
     arrancar, así que cerraba el menú que el usuario acababa de abrir — y en la
     suite decidía esta prueba por decenas de milisegundos. Una descarga no es un
     clic del usuario. */
  await p.evaluate(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['{}'], { type: 'application/json' }));
    a.download = 'x.json'; document.body.appendChild(a); a.click(); a.remove();
  });
  await quieto(p); await new Promise(r => setTimeout(r, 120));
  ok(await abierto(), 'y sobrevive a una descarga programática (la cerraba)');
  /* Y una acción que se completa SÍ lo cierra: dejarlo abierto sobre una lista
     reconstruida sería un menú apuntando a otra tarjeta. */
  await p.click('#accts article.acct[data-id="a1"] [data-act="arch"]'); await quieto(p);
  ok(!(await abierto()), 'una acción que se completa lo cierra');
  await p.context().close();
}

console.log('\n═══ un solo borrado de cuenta, no tres ═══');
{
  /* Había tres implementaciones: la fachada, el menú de la tarjeta y el editor.
     Dos hacían su propio `splice` sin limpiar el filtro; por la del menú,
     `meta.acct` se quedaba en disco apuntando a la cuenta muerta. El arranque
     lo valida, así que no se veía — pero era un dato rancio guardado, y dos
     rutas que no hacían lo mismo. */
  const p = await pagina(base({}));
  await p.evaluate(() => { FUT.setSelectedAccount('a1'); for (let i = 0; i < 2; i++) FUT.createTrade({ id: 'y' + i, type: 'futuros', accountId: 'a1', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 }); });
  await quieto(p); await new Promise(r => setTimeout(r, 120));
  await p.click('#accts article.acct[data-id="a1"] [data-act="menu"]'); await quieto(p);
  /* EL PRIMER CLIC SE PERDÍA, Y POR ESO ESTO NO ES UN `click` SUELTO.

     Borrar son dos clics: el primero ARMA el botón (`¿borrar?`) y el segundo
     confirma. Fallaba 1 de cada 7 corridas sobre `main`, sin tocar nada, y una
     de esas veces cerró la compuerta. Con una sonda se vio qué pasaba en las
     rojas: tras el primer clic el botón seguía con `data-armed=null` y el texto
     «Borrar». El clic no llegaba tarde — no llegaba. La tarjeta se repinta
     mientras Playwright comprueba que el botón es visible y dispara el clic, así
     que éste cae en un nodo ya sustituido: sin manejador, no pasa nada. Luego el
     segundo clic sólo armaba, nadie confirmaba, y la cuenta seguía viva.

     Esperar más NO lo arregla —lo probé y siguió fallando 2 de 12—, porque el
     problema no es el tiempo. Lo que hay que hacer es COMPROBAR que el armado
     ocurrió. El bucle no debilita la prueba, le añade dientes: antes nadie
     verificaba que el primer clic hiciera nada, y ahora si el armado no sucede
     en cuatro intentos la aserción sale roja con lo que leyó. El contrato que se
     mide sigue siendo el mismo: uno arma, otro borra. */
  const DEL = '#accts article.acct[data-id="a1"] [data-act="del"]';
  let armado = null;
  for (let i = 0; i < 4 && armado !== '1'; i++) {
    await p.click(DEL); await quieto(p);
    armado = await p.getAttribute(DEL, 'data-armed').catch(() => null);
  }
  ok(armado === '1', 'el primer clic arma el botón de borrar', 'data-armed=' + JSON.stringify(armado));
  await p.click(DEL); await quieto(p);
  /* persistSettings va con 500 ms de debounce: leer el disco antes miente. */
  await new Promise(r => setTimeout(r, 900));
  const meta = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('cabina-mnq:v1')); return (d.settings.meta || {}).acct; });
  ok(!meta, 'borrando desde el menú de la tarjeta no queda un fantasma en disco', JSON.stringify(meta));
  ok(await p.evaluate(() => !FUT.accounts().some(a => a.id === 'a1')), 'y la cuenta se borra de verdad');
  await p.context().close();
}

console.log('\n═══ en modo selección el clic NO hace otra cosa ═══');
{
  /* Mezclar «seleccionar» con «abrir el editor» o con la × de borrar una sola
     es exactamente como se borra lo que no se quería. */
  const p = await pagina(base({ trades: { t1: { id: 't1', type: 'futuros', accountId: 'a1', date: '2026-09-17', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21020 } } }));
  await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
  await p.click('#ftSeg button[data-v="diario"]'); await quieto(p);
  await new Promise(r => setTimeout(r, 60));
  await p.click('#selbtn-jrTable'); await quieto(p);
  await p.click('#jrTable tr[data-id]'); await quieto(p);
  ok(!(await p.evaluate(() => { const o = document.querySelector('.ov'); return o && o.classList.contains('open'); })),
     'pulsar una fila NO abre el editor');
  ok(await p.evaluate(() => { const b = document.querySelector('#jrTable tr[data-id] button'); return !b || getComputedStyle(b).pointerEvents === 'none'; }),
     'y los botones de la fila quedan inertes');
  await p.context().close();
}

console.log('\n──────────────────────────────────────────');
console.log('  fallos:', fallos.length, fallos.length ? '→ ' + fallos.join(' · ') : '');
console.log('  errores JS:', errs.length, errs.length ? '\n   ' + errs.join('\n   ') : '');
await b.close();
process.exit(fallos.length || errs.length ? 1 : 0);
