/* CICLO · cuentas compradas y quemadas, y de que murio cada una.

   Una cuenta de prop firm se compra, se opera y acaba cobrando o quemada. Esta
   prueba fija las cuatro cosas de esa pestaña que son faciles de romper sin
   darse cuenta, y las cuatro estan escritas a mano ANTES del codigo:

     · EL POR QUE NO SE PREGUNTA, SE DERIVA. La autopsia de una cuenta quemada
       sale del mismo clasificador de docs/ERRORES.md sobre las operaciones de
       esa cuenta. Si alguien añade un desplegable «motivo de la quema», esta
       prueba no lo nota -- pero si alguien hace que la autopsia deje de leer
       las operaciones, se pone roja.
     · EL PATRON CUENTA CUENTAS, NO VECES. Cuatro «sin stop» en una sola cuenta
       son un mal dia largo; «sin stop» en dos cuentas de tres es por que se
       queman. El fixture tiene exactamente eso: 4 en q1 y 2 en q3, y la
       respuesta correcta es 2, no 6.
     · LA AUSENCIA SIGNIFICA ALGO, Y TIENE TRES ESTADOS (protocolo 17). Una
       cuenta anterior al campo no lo trae; una que paso por el editor y se dejo
       en blanco si lo trae vacio. No son lo mismo. Y ABRIR NO ES TOCAR: entrar
       al editor de una cuenta vieja y guardar sin cambiar nada no puede
       inventarle el campo.
     · UN COSTE QUE NO SE APUNTO NO ES CERO. Sin un solo movimiento de coste, lo
       pagado es DESCONOCIDO. Decir «$0 gastado» es una afirmacion falsa que
       ademas sale a favor del usuario, que es la peor clase.

   Su modo de fallo: una pestaña que absuelve -- que rellena el coste con cero,
   la fecha ausente con una plausible, y el motivo con lo que el acusado
   escriba despues de la condena. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto, trasAccion, enDisco } from './espera.mjs';

/* POR QUE SE ESPERA AL DISCO Y NO AL RELOJ: `persistSettings` guarda con 500 ms
   de retardo, asi que leer localStorage justo despues de un clic mide la copia
   ANTERIOR (protocolo 4). Para eso esta `enDisco`.

   CORRECCION DE LA PRIMERA VERSION DE ESTA PRUEBA, y vale la pena dejarla
   escrita porque el error era mio y de los que se repiten. Aqui habia un
   ayudante propio, copiado de `enDisco`, con un comentario que afirmaba que
   `enDisco` «corrio UNA SOLA VEZ en 4 segundos» y degradaba a «mirar una vez».
   Era FALSO: lo medi con un contador en `window` dentro del predicado, y
   `waitForFunction` corre en un MUNDO JS AISLADO -- escribia en un `window` y
   leia en otro. Medido como toca, con un contador en `localStorage`, que si es
   del mismo origen: 60 vueltas en 3 segundos, las que debe dar.

   Lo que SI estaba roto era otra cosa, y el ayudante propio la heredaba entera
   porque tambien usaba `eval`: la CSP de esta pagina es `script-src
   'unsafe-inline'` SIN `'unsafe-eval'`, asi que el `eval` lanzaba `EvalError`,
   el `catch` se lo tragaba y la espera expiraba con el dato ya en disco. Esta
   arreglado en `espera.mjs`, sondeando desde Node y sin `eval`. */

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
/* SERVIA EL HTML PARA CUALQUIER RUTA. Con la aplicación dentro del documento
   daba igual; desde que la página pide `./app.js`, el navegador recibía HTML
   donde esperaba un script, lo rechazaba por MIME y la página no arrancaba.
   `sirvePublicado` sirve lo que sube Pages —leído del propio workflow— y 404
   para lo demás, que es lo que hace útil a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(1300);

/* ── EL FIXTURE · sintetico, sin un solo dato real ─────────────────────────
   Geometria MNQ ($2/punto), igual que errores.mjs: largo desde 20000, stop
   19990 (10 pt = $20), objetivo 20020 (+$40). La pagina arranca sin comision
   automatica, asi que el P&L es bruto y las cifras de abajo son exactas.

   Cuatro cuentas, y cada una esta ahi por una razon distinta:
     q1  quemada con fecha apuntada  · 4 sin_stop + 1 nervios + 1 limpia
     q2  quemada SIN el campo nunca  · cero operaciones
     q3  quemada con el campo EN BLANCO · 2 sin_stop
     v1  fondeada que cobro          · para que la caja no sea trivial

   Cuentas a mano, de q1:
     4 × sin_stop   -$20 = -$80   categoria 2
     1 × nervios    -$10          categoria 3 (salio_antes + nervios, manda la peor)
     1 × limpia     -$20          «1 o 4» (sin setup, sin muestra que la juzgue)
     con error -$90 · limpio -$20 · total -$110 · 90/110 = 82% del agujero es tuyo */
const siembra = await p.evaluate(() => {
  const cuenta = (id, firm, name, status, extra, ledger) =>
    FUT.createAccount(Object.assign({ id, firm, name, kind: 'Evaluación', status,
      size: 50000, dd: 2000, ddKind: 'estatico', target: 3000, limit: 40,
      ledger: ledger || [], rules: { maxContracts: 2 } }, extra));

  cuenta('q1', 'Alfa', 'Quemada A', 'quemada', { burnedOn: '2026-02-10' },
    [{ id: 'l1', date: '2026-01-05', kind: 'fee', amount: 150, note: '' }]);
  /* SIN la propiedad burnedOn: es una cuenta anterior al campo. */
  cuenta('q2', 'Alfa', 'Quemada B', 'quemada', {},
    [{ id: 'l2', date: '2026-01-20', kind: 'fee', amount: 150, note: '' }]);
  /* CON la propiedad y vacia: paso por el editor y no se escribio. */
  cuenta('q3', 'Alfa', 'Quemada C', 'quemada', { burnedOn: '' },
    [{ id: 'l3', date: '2026-02-01', kind: 'fee', amount: 150, note: '' }]);
  cuenta('v1', 'Beta', 'Fondeada', 'fondeada', {},
    [{ id: 'l4', date: '2026-01-02', kind: 'fee', amount: 200, note: '' },
     { id: 'l5', date: '2026-03-01', kind: 'payout', amount: 1200, note: '' }]);

  const base = { type: 'futuros', instrument: 'MNQ', direction: 'long', qty: 1,
    entry: 20000, stop: 19990, target: 20020, time: '09:15',
    invalida: 'cierre de 5m por debajo de 19990', cStruct: true, cPull: true, cWindow: true, cSize: true,
    quality: 'A', source: 'manual' };
  let d = 0;
  const dia = () => { d++; return new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10); };
  const mk = (id, acct, extra) => FUT.createTrade(Object.assign({ id, accountId: acct, date: dia() }, base, extra));

  const sinStop = { stop: null, exit: 19990, exitWhy: 'stop', plan: 'cumpli' };
  const limpia  = { exit: 19990, exitWhy: 'stop', plan: 'cumpli' };
  const nervios = { exit: 19995, exitWhy: 'nervios', plan: 'antes' };

  for (let i = 0; i < 4; i++) mk('q1_ss' + i, 'q1', sinStop);
  mk('q1_nerv', 'q1', nervios);
  mk('q1_limpia', 'q1', limpia);
  for (let i = 0; i < 2; i++) mk('q3_ss' + i, 'q3', sinStop);
  mk('v1_gana', 'v1', { exit: 20020, exitWhy: 'objetivo', plan: 'no_hizo_falta' });

  return { q1: FUT.trades('q1').length, q2: FUT.trades('q2').length, q3: FUT.trades('q3').length };
});
ok(siembra.q1 === 6 && siembra.q2 === 0 && siembra.q3 === 2, 'el fixture entra entero',
   `q1=${siembra.q1} q2=${siembra.q2} q3=${siembra.q3}`);

/* ═══════════ 1 · LA CAJA ═══════════
   fees 150+150+150+200 = 650 · payouts 1200 · neto +550. No sale de ningun
   P&L: sale del ledger, que es lo unico que dice que dinero cambio de manos. */
const eco = await p.evaluate(() => FUT.economia());
ok(eco.fees === 650, 'lo pagado suma los cuatro movimientos de coste', `${eco.fees} · esperado 650`);
ok(eco.payouts === 1200, 'lo cobrado suma los retiros', `${eco.payouts} · esperado 1200`);
ok(eco.caja === 550, 'el neto es cobrado menos pagado', `${eco.caja} · esperado 550`);
ok(eco.cuentas === 4 && eco.quemadas === 3 && eco.vivas === 1,
   'cuenta cuentas, quemadas y vivas', `${eco.cuentas} / ${eco.quemadas} / ${eco.vivas}`);
ok(eco.costeDesconocido === false, 'con movimientos de coste apuntados, el coste se sabe');
const alfa = eco.firmas.find(f => f.firma === 'Alfa'), beta = eco.firmas.find(f => f.firma === 'Beta');
ok(alfa && alfa.n === 3 && alfa.quemadas === 3 && alfa.fees === 450 && alfa.payouts === 0,
   'Alfa: tres cuentas, tres quemadas, -$450', alfa ? `n=${alfa.n} q=${alfa.quemadas} fees=${alfa.fees}` : 'NO ESTA');
ok(beta && beta.n === 1 && beta.fees === 200 && beta.payouts === 1200,
   'Beta: una cuenta, +$1.000 neto', beta ? `fees=${beta.fees} payouts=${beta.payouts}` : 'NO ESTA');

/* ═══════════ 2 · EL CICLO DE CADA CUENTA ═══════════
   La fecha de compra NO es un campo nuevo: es el primer movimiento de coste.
   Y «operados» son dias con operaciones, no de la compra a la quema. */
const c1 = await p.evaluate(() => FUT.ciclo('q1'));
ok(c1.comprada === '2026-01-05', 'la compra se deriva del primer movimiento de coste', c1.comprada);
ok(c1.quema.fecha === '2026-02-10' && c1.quema.apuntada === true, 'la fecha de quema apuntada se lee', c1.quema.fecha);
ok(c1.ops === 6 && c1.diasOperados === 6, 'operaciones cerradas y dias operados', `${c1.ops} ops · ${c1.diasOperados} dias`);
ok(c1.fees === 150 && c1.payouts === 0 && c1.caja === -150,
   'el neto de una quemada es lo que costo, en rojo', `caja=${c1.caja}`);
ok(c1.pnl === -110, 'el P&L de la cuenta sale de sus operaciones', `${c1.pnl} · esperado -110`);
const c2 = await p.evaluate(() => FUT.ciclo('q2'));
ok(c2.ops === 0 && c2.diasOperados === 0, 'una cuenta sin operaciones no inventa dias', `${c2.ops} / ${c2.diasOperados}`);

/* ── LOS TRES ESTADOS DE LA FECHA DE QUEMA ──
   Ausente, presente-en-blanco y escrita son TRES cosas. Una prueba que solo
   mirara `apuntada` no distinguiria las dos primeras, y entonces una migracion
   que le escriba "" a todas las cuentas viejas pasaria desapercibida. */
ok(c2.quema.tieneCampo === false && c2.quema.apuntada === false,
   'una cuenta anterior al campo NO lo tiene', `tieneCampo=${c2.quema.tieneCampo}`);
const c3 = await p.evaluate(() => FUT.ciclo('q3'));
ok(c3.quema.tieneCampo === true && c3.quema.apuntada === false,
   'una cuenta con el campo en blanco SI lo tiene, y no es lo mismo', `tieneCampo=${c3.quema.tieneCampo}`);

/* ═══════════ 3 · LA AUTOPSIA, DERIVADA ═══════════ */
const a1 = await p.evaluate(() => FUT.autopsia('q1'));
ok(a1.perdidas === 6, 'clasifica las seis perdidas de la cuenta', `${a1.perdidas} · esperado 6`);
ok(a1.resumen[2] === 4, 'cuatro de ejecucion: las cuatro sin stop escrito', `${a1.resumen[2]} · esperado 4`);
ok(a1.resumen[3] === 1, 'una psicologica: la que salio por nervios', `${a1.resumen[3]} · esperado 1`);
ok(a1.resumen['1o4'] === 1, 'una limpia sin muestra que la juzgue: «1 o 4»', `${a1.resumen['1o4']} · esperado 1`);
ok(a1.evitable === -90, 'el agujero con error tuyo', `${a1.evitable} · esperado -90`);
ok(a1.limpio === -20, 'el agujero de perdidas limpias', `${a1.limpio} · esperado -20`);
/* La identidad que impide que una categoria se quede fuera del reparto: todo
   lo perdido esta en uno de los dos lados, nunca en ninguno y nunca en los dos. */
const sumaTodo = await p.evaluate(() => FUT.autopsia('q1').porTrade.reduce((s, x) => s + x.pnl, 0));
ok(a1.evitable + a1.limpio === sumaTodo, 'evitable + limpio es TODO lo perdido, sin huecos ni dobles',
   `${a1.evitable + a1.limpio} === ${sumaTodo}`);
const top = a1.senales[0];
ok(top && top.clave === 'sin_stop' && top.veces === 4, 'la señal que mas se repite, con su recuento',
   top ? `${top.clave} ×${top.veces}` : 'NINGUNA');

/* Una cuenta sin operaciones no tiene autopsia, y lo dice en vez de absolver. */
const a2 = await p.evaluate(() => FUT.autopsia('q2'));
ok(a2.perdidas === 0 && a2.senales.length === 0, 'sin operaciones no hay nada que clasificar',
   `${a2.perdidas} perdidas`);

/* ── LA MEMORIA SE INVALIDA SOLA, MEDIDO POR EL EFECTO ──
   `autopsiaDe` esta memorizada porque `clasificaErrores` recorre TODAS las
   operaciones, no solo las de la cuenta. Una memoria cuya clave no mire la
   coleccion deja la autopsia congelada: registras la operacion que quemo la
   cuenta y la pestaña sigue diciendo de que murio ANTES de ella. `capa2` vigila
   que la clave nombre `coll("trades").rev`, pero eso es leer el codigo; esto
   mide el efecto, que es lo unico que demuestra que funciona. */
const antesMemo = await p.evaluate(() => FUT.autopsia('q2').perdidas);
await p.evaluate(() => FUT.createTrade({ id: 'q2_nueva', type: 'futuros', accountId: 'q2',
  date: '2026-02-05', instrument: 'MNQ', direction: 'long', qty: 1, entry: 20000, stop: null,
  exit: 19990, exitWhy: 'stop', plan: 'cumpli', time: '09:15', source: 'manual',
  invalida: 'cierre de 5m por debajo de 19990', cStruct: true, cPull: true, cWindow: true, cSize: true, quality: 'A' }));
const despuesMemo = await p.evaluate(() => FUT.autopsia('q2').perdidas);
ok(antesMemo === 0 && despuesMemo === 1,
   'una operacion nueva cambia la autopsia sin recargar: la memoria se invalida sola',
   `${antesMemo} -> ${despuesMemo}`);
/* Y se deshace, para que el patron de abajo siga midiendo el fixture declarado. */
await p.evaluate(() => FUT.deleteTrade('q2_nueva'));
const vuelta = await p.evaluate(() => FUT.autopsia('q2').perdidas);
ok(vuelta === 0, 'y al borrarla vuelve a no haber nada que clasificar', `${vuelta}`);

/* ═══════════ 4 · EL PATRON: CUENTAS, NO VECES ═══════════
   «sin stop» aparece 4 veces en q1 y 2 en q3. La respuesta correcta es 2
   CUENTAS. Si alguien cambia el conteo a ocurrencias, aqui saldria 6. */
const pat = await p.evaluate(() => FUT.patronQuemadas());
ok(pat.quemadas === 3, 'mira las tres cuentas quemadas', `${pat.quemadas}`);
const ss = pat.senales.find(x => x.clave === 'sin_stop');
ok(ss && ss.cuentas === 2, 'sin_stop cuenta DOS cuentas, no seis veces',
   ss ? `cuentas=${ss.cuentas}` : 'NO ESTA');
const nv = pat.senales.find(x => x.clave === 'nervios');
ok(nv && nv.cuentas === 1, 'nervios aparece en una sola cuenta', nv ? `cuentas=${nv.cuentas}` : 'NO ESTA');

/* ═══════════ 5 · LO QUE SE PINTA ═══════════ */
await p.click('.tabbtn[data-tab="cuentas"]');
await quieto(p);
const pinta = await p.evaluate(() => ({
  filas: document.querySelectorAll('#cuTabla tbody tr').length,
  autopsias: document.querySelectorAll('#cuAutopsias .errcat').length,
  caja: document.getElementById('cuCaja').textContent,
  tabla: document.getElementById('cuTabla').textContent,
  patron: document.getElementById('cuPatron').textContent,
}));
ok(pinta.filas === 4, 'la tabla pinta una fila por cuenta', `${pinta.filas} filas`);
ok(pinta.autopsias === 3, 'una autopsia por cuenta quemada', `${pinta.autopsias}`);
ok(/\$650/.test(pinta.caja) && /\$1,200/.test(pinta.caja), 'la caja imprime lo pagado y lo cobrado',
   pinta.caja.replace(/\s+/g, ' ').slice(0, 90));
ok(/sin dato/.test(pinta.tabla), 'las quemadas sin fecha se pintan «sin dato», no en blanco ni inventadas');
ok(/en 2 cuentas de 3/.test(pinta.patron), 'el patron dice en cuantas cuentas de cuantas',
   pinta.patron.replace(/\s+/g, ' ').slice(0, 120));

/* El filtro de quemadas no es decorativo: tiene que quitar filas. */
await p.selectOption('#cuFiltro', 'quemadas');
await quieto(p);
const soloQ = await p.evaluate(() => document.querySelectorAll('#cuTabla tbody tr').length);
ok(soloQ === 3, 'el filtro «sólo las quemadas» deja tres filas', `${soloQ}`);
await p.selectOption('#cuFiltro', 'todas');
await quieto(p);

/* ═══════════ 6 · ABRIR NO ES TOCAR (protocolo 17) ═══════════
   Por el EDITOR REAL y no por la fachada. La guarda equivalente de `invalida`
   se rompio dos veces, y la segunda la encontro la prueba del editor de verdad:
   el editor generico escribe "" en todo campo de texto vacio al guardar, asi
   que entrar a q2 a corregir una errata le inventaba «fecha de quema en
   blanco», que es un dato distinto de no tenerla. */
await p.click('.tabbtn[data-tab="cabina"]');
await quieto(p);
const abierto = await p.evaluate(() => {
  const card = document.querySelector('.acct[data-id="q2"]'); if (!card) return 'sin tarjeta';
  const menu = card.querySelector('button[data-act="menu"]'); if (!menu) return 'sin menu';
  menu.click();
  const cfg = card.querySelector('button[data-act="cfg"]'); if (!cfg) return 'sin cfg';
  cfg.click();
  return document.getElementById('edOverlay') ? 'ok' : (document.querySelector('.ov.open') ? 'ok' : 'sin modal');
});
await trasAccion(p);
const hayCampo = await p.evaluate(() => !!document.getElementById('ef_burnedOn'));
ok(hayCampo, 'el editor de cuenta trae el campo de fecha de quema', `apertura=${abierto}`);
/* Guardar SIN TOCAR NADA.
   Y ANTES, el sello que hay en disco: sin el, la asercion de abajo sobre el
   disco puede pasar por el motivo equivocado -- leyendo la copia ANTERIOR al
   guardado, donde el campo obviamente no esta todavia. `persistSettings`
   adelanta `updatedAt` en cada escritura, asi que esperar a que el sello
   cambie es la prueba de que este guardado concreto ya paso por la puerta.
   Comprobado: sin esta espera, el sabotaje que quita la guarda deja esta
   asercion EN VERDE. */
const selloAntes = await p.evaluate(() => {
  try { return (JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}').settings || {}).updatedAt || 0; } catch (e) { return 0; }
});
await p.click('#edSave');
await trasAccion(p);
/* Ahora el predicado CIERRA sobre `selloAntes`. La version con texto no podia
   —habia que incrustar el valor en la fuente a mano— y ese truco era otra cosa
   que podia salir mal en silencio. */
await enDisco(p, d => {
  const u = d && d.settings && d.settings.updatedAt;
  return !!u && u !== selloAntes;
});
/* `persistSettings` lleva 500 ms de retardo (protocolo 4): leer el disco justo
   despues de un clic mide la copia ANTERIOR, no la que acaba de guardarse. Aqui
   eso haria PASAR la asercion de la ausencia por el motivo equivocado --
   leeria una cuenta que aun no habia pasado por la puerta de escritura. Se
   espera a que el guardado haya corrido de verdad: lo que se comprueba es que
   la cuenta YA esta en disco (su nombre), y solo entonces se mira el campo. */
const trasGuardar = await p.evaluate(() => {
  const a = (window.FUT.accounts() || []).find(x => x.id === 'q2');
  return { tiene: Object.prototype.hasOwnProperty.call(a, 'burnedOn'),
           tieneLeccion: Object.prototype.hasOwnProperty.call(a, 'lesson'),
           enDisco: (() => { try {
             const d = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}');
             const s = d.settings && d.settings.accounts && d.settings.accounts.find(x => x.id === 'q2');
             return s ? Object.prototype.hasOwnProperty.call(s, 'burnedOn') : 'sin cuenta en disco';
           } catch (e) { return 'ilegible'; } })() };
});
ok(trasGuardar.tiene === false, 'abrir y guardar NO le inventa la fecha de quema a una cuenta vieja',
   `hasOwnProperty=${trasGuardar.tiene}`);
ok(trasGuardar.tieneLeccion === false, 'ni la leccion', `hasOwnProperty=${trasGuardar.tieneLeccion}`);
/* Y QUE NO LLEGUE AL DISCO, que es donde de verdad importa: `normalize` recorta
   por lista blanca, y la forma obvia de nombrar el campo ahi le escribe "" a
   todas las cuentas del respaldo. */
ok(trasGuardar.enDisco === false, 'la ausencia sobrevive a la puerta de escritura, no solo a la memoria',
   `en disco: ${trasGuardar.enDisco}`);

/* Y EN EL OTRO SENTIDO: escribirla SI la guarda. Una prueba que solo mira que
   la ausencia sobrevive no distingue «se conserva» de «no se puede escribir». */
await p.evaluate(() => {
  const card = document.querySelector('.acct[data-id="q2"]');
  card.querySelector('button[data-act="menu"]').click();
  card.querySelector('button[data-act="cfg"]').click();
});
await trasAccion(p);
await p.fill('#ef_burnedOn', '2026-03-15');
await p.fill('#ef_lesson', 'subi tamaño para recuperar el dia anterior');
await p.click('#edSave');
await trasAccion(p);
/* Igual aqui, y en este sentido la carrera SI se veia: la fecha estaba en
   memoria y el disco devolvia undefined. La primera version de esta prueba lo
   leyo como un fallo de la puerta de escritura; era el debounce. */
/* Y QUE LLEGUE AL DISCO. `persistSettings` lleva 500 ms de retardo, asi que
   leer localStorage justo despues del clic mide la copia ANTERIOR: medido, el
   valor aparece entre 200 y 450 ms despues de que el DOM se queda quieto. La
   primera version de esta prueba leyo ese hueco como un fallo de la puerta de
   escritura y estuvo a punto de hacerme "arreglar" un codigo que estaba bien.
   Protocolo 4: para esto esta `enDisco`, que espera a la CONDICION. */
const tardo = await enDisco(p, d => {
  const a = d && d.settings && d.settings.accounts && d.settings.accounts.find(x => x.id === 'q2');
  return !!a && a.burnedOn === '2026-03-15';
});
const escrita = await p.evaluate(() => {
  const c = window.FUT.ciclo('q2');
  const d = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}');
  const s = d.settings.accounts.find(x => x.id === 'q2');
  return { fecha: c.quema.fecha, apuntada: c.quema.apuntada, leccion: c.leccion, disco: s && s.burnedOn };
});
ok(escrita.fecha === '2026-03-15' && escrita.apuntada === true, 'la fecha escrita se guarda y se lee', escrita.fecha);
ok(escrita.disco === '2026-03-15', 'y llega al disco', `${escrita.disco} · tardo ${tardo} ms en llegar`);
ok(/subi tama/.test(escrita.leccion || ''), 'la leccion escrita a mano se guarda', escrita.leccion);

/* La leccion se pinta ETIQUETADA como la version del usuario, al lado de lo
   derivado y nunca en su lugar: es lo que recuerda de un dia que acabo mal. */
await p.click('.tabbtn[data-tab="cuentas"]');
await quieto(p);
const conLeccion = await p.evaluate(() => document.getElementById('cuAutopsias').textContent);
ok(/tu versión, escrita a mano/.test(conLeccion), 'la leccion sale marcada como opinion, no como dato');

/* ═══════════ 7 · UN COSTE SIN APUNTAR NO ES CERO ═══════════
   Se quitan todos los movimientos de coste y se comprueba que la pestaña dice
   «no se sabe» en vez de «$0». Un cero aqui es una afirmacion falsa que ademas
   sale a favor: diria que el negocio es rentable porque las cuentas fueron
   gratis. */
await p.evaluate(() => {
  (FUT.accounts() || []).forEach(a =>
    FUT.updateAccount(a.id, { ledger: (a.ledger || []).filter(e => e.kind !== 'fee') }));
});
await quieto(p);
const sinCoste = await p.evaluate(() => ({
  eco: FUT.economia(),
  caja: document.getElementById('cuCaja').textContent,
  nota: document.getElementById('cuCajaNota').textContent,
}));
ok(sinCoste.eco.costeDesconocido === true, 'sin un solo movimiento de coste, el coste es DESCONOCIDO');
/* Y LA FECHA DE COMPRA TAMPOCO SE INVENTA. q1 sigue teniendo sus seis
   operaciones y ya no tiene ningun movimiento de coste: la tentacion es rellenar
   «comprada» con la fecha de la primera operacion, que esta ahi mismo y parece
   razonable. Seria otra pregunta -- cuando empezaste a operarla, no cuando la
   pagaste -- puesta en la columna del dinero. Protocolo 17: la ausencia no se
   rellena con el valor que haya a mano.
   Esta asercion se añadio porque el sabotaje que SI hacia eso dejo la prueba
   entera en verde: el fixture tenia una fee en cada cuenta y el camino de
   relleno no se recorria nunca. */
const compra = await p.evaluate(() => ({ comprada: FUT.ciclo('q1').comprada, ops: FUT.ciclo('q1').ops,
  primerDia: FUT.ciclo('q1').primerDia }));
ok(compra.ops === 6 && compra.primerDia !== '', 'q1 sigue teniendo operaciones con fecha',
   `${compra.ops} ops · primera ${compra.primerDia}`);
ok(compra.comprada === '', 'sin movimiento de coste, la fecha de compra queda VACIA, no la del primer trade',
   `comprada=${JSON.stringify(compra.comprada)} · primer trade ${compra.primerDia}`);
ok(!/\$0/.test(sinCoste.caja), 'no se imprime «$0 pagado»', sinCoste.caja.replace(/\s+/g, ' ').slice(0, 80));
ok(/no se sabe/.test(sinCoste.nota) && /No es cero/.test(sinCoste.nota),
   'se dice que no se sabe, y por que un cero seria mentira');

ok(errs.length === 0, 'sin errores de consola', errs.length ? errs.join(' | ') : 'ninguno');

await b.close(); srv.close();
console.log(fallos.length ? `\n  fallos: ${fallos.length}\n  ${fallos.join('\n  ')}` : '\n  todo PASS');
console.log(`  fallos: ${fallos.length}`);
process.exit(fallos.length ? 1 : 0);
