/* EL CATÁLOGO DE ESTADÍSTICAS · 160 cifras que no pueden contradecir al panel
   que tienen encima.
   ─────────────────────────────────────────────────────────────────────────────
   Métricas / Edge ya enseñaba doce tarjetas —expectativa, profit factor, Kelly,
   caída máxima— calculadas por `mxCalc()` sobre las operaciones del filtro.
   El catálogo añade 160 filas sobre ESAS MISMAS operaciones. El modo de fallar
   que importa no es que una fila salga mal: es que salga PLAUSIBLE y distinta,
   y que la pantalla enseñe dos profit factors a quince centímetros uno del otro
   sin que nada lo note.

   Por eso §1 no comprueba que el profit factor «sea correcto» contra un número
   escrito a mano —eso ya lo hace `edge.mjs`— sino que sea EL MISMO que el de la
   tarjeta. Es la única aserción que sobrevive a cambiar la fórmula: si mañana
   el neto se calcula de otra manera, las dos cifras se mueven juntas o la fila
   se pone roja.

   LOS OTROS TRES MODOS DE FALLAR QUE SE VIGILAN:

   §3 · QUE LAS TRES TASAS DE ACIERTO SE CONVIERTAN EN UNA. Sobre las mismas
        operaciones, «win rate» son tres números defendibles: con las planas
        fuera del numerador, con las planas contando como acierto, y sin planas
        en ningún lado. La semilla trae planas a propósito para que los tres
        DIVERJAN; si alguien los unifica «porque daban lo mismo», aquí se ve.

   §4 · QUE UN DATO AUSENTE SE IMPRIMA COMO CERO. El P&L no realizado necesita
        precio en vivo y Cabina no lo tiene; la duración necesita hora de salida
        y el journal la pide opcional. Un cero en ese sitio es una mentira que
        nadie detecta, porque un cero es un número perfectamente creíble. Se
        exige el guion Y la razón escrita.

   §7 · QUE «EL PEOR DÍA» AFIRME UNA PÉRDIDA QUE NO EXISTE. Con días rojos en la
        muestra, el peor día es rojo y la fila no explica nada. Filtrando a un
        tramo sin días rojos, el mismo extremo es «el menos bueno» y la fila
        tiene que decirlo. Las dos direcciones, porque una sola pasaría también
        con la nota puesta siempre.

   LA SEMILLA. Todo MNQ y MES, con fechas fijas de 2026 para que ni el reloj de
   la máquina ni el huso muevan un bucket. Las dos operaciones planas llevan P&L
   escrito a mano = 0 y la casilla «mis P&L escritos a mano ya son netos»
   marcada: sin ella la comisión convertiría una plana en una perdedora de
   $1,50 y el bloque §3 se quedaría sin su caso. */
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
   aplicacion salio a `./app.js` (#77), un servidor que devuelve el documento para
   toda peticion le da HTML al navegador donde espera un script: lo rechaza por
   MIME y la pagina no arranca. Es el mismo arreglo que la #77 hizo en las otras
   29 pruebas; estas dos son nuevas y no estaban en ese corte. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined' && typeof window.QuantEngine !== 'undefined', null, { timeout: 20000 });

/* Esperar a la CONDICIÓN, no al reloj (test/README). */
await p.evaluate(() => {
  window.hasta = (que, fn, tope = 15000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const tic = () => {
      let v = false; try { v = fn(); } catch (e) { v = false; }
      if (v) return res(v);
      if (Date.now() - t0 > tope) return rej(new Error('nunca llegó: ' + que));
      setTimeout(tic, 25);
    };
    tic();
  });
  /* Las utilidades de lectura viven en la página: una fila es su etiqueta, su
     valor y su definición, y casi todas las aserciones de abajo son una
     comparación entre dos de esas tres cosas. */
  window.fila = id => {
    const r = document.querySelector(`.estrow[data-est="${id}"]`);
    if (!r) return null;
    const ev = r.querySelector('.ev');
    return { lab: r.querySelector('b').textContent.trim(), v: ev.textContent.trim(),
             cls: ev.className.replace('ev', '').trim(), sub: (r.querySelector('.es2') || { textContent: '' }).textContent.trim() };
  };
  /* Un valor pintado vuelto a número. Quita $ , % R y el signo de más; el menos
     se queda, que es lo único del formato que cambia la aritmética. */
  window.num = s => { if (s == null || s === '—') return null; const n = Number(String(s).replace(/[$,%R\s]/g, '').replace(/^\+/, '')); return Number.isFinite(n) ? n : null; };
  window.nFilas = () => document.querySelectorAll('#mxEstLista .estrow').length;
  window.tarjeta = k => { const e = document.querySelector(`#mxEdge .qec[data-k="${k}"]`); return e ? e.dataset.v : null; };
});

const SEED = await p.evaluate(async () => {
  FUT.createAccount({ id: 'EST', firm: 'Catálogo', name: 'Cuenta de estadísticas', kind: 'Evaluación',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'activa', ledger: [], total: 0, best: 0 });

  const base = { accountId: 'EST', instrument: 'MNQ', qty: 1, direction: 'long', stop: 20980 };
  const ops = [
    /* D1 · 2026-03-02 — día verde, las dos con hora de salida */
    { id: 'S1', date: '2026-03-02', time: '09:30', exitTime: '10:05', entry: 21000, exit: 21050 },
    { id: 'S2', date: '2026-03-02', time: '11:00', exitTime: '11:20', entry: 21000, exit: 20975, direction: 'short' },
    /* D2 · 2026-03-03 — día ROJO. La segunda NO tiene hora de salida: es el
       caso que obliga a las filas de tiempo a decir sobre cuántas miden. */
    { id: 'S3', date: '2026-03-03', time: '09:40', exitTime: '09:50', entry: 21000, exit: 20940 },
    { id: 'S4', date: '2026-03-03', time: '13:00', entry: 21000, exit: 20990 },
    /* D3 · 2026-03-04 — una verde y las DOS PLANAS (P&L a mano = 0) */
    { id: 'S5', date: '2026-03-04', time: '10:00', entry: 21000, exit: 21010 },
    { id: 'S6', date: '2026-03-04', time: '10:30', exitTime: '10:45', entry: 21000, exit: 21000, pnl: 0 },
    { id: 'S7', date: '2026-03-04', time: '11:00', entry: 21000, exit: 21000, pnl: 0, instrument: 'MES' },
    /* D4 · 2026-03-05 — MES, con cantidad 2, para que el volumen no sea el
       recuento de operaciones disfrazado */
    { id: 'S8', date: '2026-03-05', time: '09:35', exitTime: '09:55', entry: 5000, exit: 5010, qty: 2, instrument: 'MES', stop: 4990 },
    { id: 'S9', date: '2026-03-05', time: '14:00', entry: 5000, exit: 4995, qty: 2, instrument: 'MES', stop: 5010, direction: 'short' },
    /* D5 · 2026-03-06 — NINGUNA con hora de salida, una verde y una roja. Es
       el caso que §4b necesita: filtrando a este día, las ocho filas de tiempo
       se quedan sin un solo dato que medir, y ahí es donde un «0 min» se
       colaría como si fuera una medición. */
    { id: 'S11', date: '2026-03-06', time: '09:45', entry: 21000, exit: 21020 },
    { id: 'S12', date: '2026-03-06', time: '10:30', entry: 21000, exit: 20970 },
    /* Otro MES para que abril exista y los buckets de mes sean dos */
    { id: 'S10', date: '2026-04-10', time: '10:15', exitTime: '10:40', entry: 21000, exit: 21030 },
  ];
  ops.forEach(o => FUT.createTrade(Object.assign({}, base, o)));
  /* La abierta: entra en «Operaciones» y no en «Operaciones cerradas». */
  FUT.createTrade(Object.assign({}, base, { id: 'S_ABIERTA', date: '2026-04-11', time: '09:30', entry: 21000 }));

  await window.hasta('las 12 operaciones cerradas', () => FUT.trades().filter(t => t.pnlEff != null).length === 12);
  return { cerradas: 12, abiertas: 1 };
});

await p.click('#tabnav .tabbtn[data-tab="edge"]');
/* «Mis P&L escritos a mano ya son netos»: sin esto las dos planas son dos
   perdedoras de la comisión y §3 pierde su caso. Se marca por el control real,
   no escribiendo en `state`, para que pase por el mismo camino que un usuario. */
await p.evaluate(() => { const c = document.getElementById('mxManualNeto'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForFunction(() => window.nFilas() > 0, null, { timeout: 15000 });

console.log('\n═══ 1 · no hay una segunda verdad: el catálogo y las tarjetas de arriba ═══');
{
  const r = await p.evaluate(() => ({
    nTarjeta: Number(window.tarjeta('n')), nFila: window.num(window.fila('cerradas').v),
    pfTarjeta: Number(window.tarjeta('pf')), pfFila: window.num(window.fila('profitFactor').v),
    expTarjeta: Number(window.tarjeta('expectancy')), expFila: window.num(window.fila('pnlMedio').v),
    kellyTarjeta: Number(window.tarjeta('kelly')), kellyFila: window.num(window.fila('kelly').v),
    mddTarjeta: Number(window.tarjeta('mdd')), mddFila: window.num(window.fila('maxDDPct').v),
    total: window.nFilas(),
  }));
  const cerca = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
  ok(r.nTarjeta === r.nFila, 'la muestra es la misma arriba y abajo', `tarjeta ${r.nTarjeta} · fila ${r.nFila}`);
  ok(cerca(r.pfTarjeta, r.pfFila, 0.005), 'el profit factor es el mismo arriba y abajo', `${r.pfTarjeta} · ${r.pfFila}`);
  ok(cerca(r.expTarjeta, r.expFila, 0.02), 'la expectativa es la misma arriba y abajo', `${r.expTarjeta} · ${r.expFila}`);
  ok(cerca(r.kellyTarjeta * 100, r.kellyFila, 0.02), 'Kelly es el mismo arriba y abajo', `${(r.kellyTarjeta * 100).toFixed(2)}% · ${r.kellyFila}%`);
  ok(cerca(Math.abs(r.mddTarjeta) * 100, Math.abs(r.mddFila), 0.02), 'la caída máxima es la misma arriba y abajo', `${r.mddTarjeta} · ${r.mddFila}`);
  ok(r.total === 160, 'el catálogo pinta sus 160 filas', String(r.total));
}

console.log('\n═══ 2 · las partes suman el todo ═══');
{
  const r = await p.evaluate(() => {
    const n = id => window.num(window.fila(id).v);
    return { gan: n('ganadoras'), per: n('perdedoras'), pla: n('planas'), cerradas: n('cerradas'),
             total: n('total'), abiertas: n('abiertas'), largas: n('largas'), cortas: n('cortas'),
             dias: n('diasOperados'), mediaDia: n('mediaOpsDia'), meses: n('mesesOperados'), mediaMes: n('mediaOpsMes'),
             diasGan: n('diasGan'), diasPer: n('diasPer'),
             vol: n('volumen'), volGan: n('volGan'), volPer: n('volPer'), subVolPer: window.fila('volPer').sub };
  });
  ok(r.gan + r.per + r.pla === r.cerradas, 'ganadoras + perdedoras + planas = cerradas', `${r.gan}+${r.per}+${r.pla} = ${r.cerradas}`);
  ok(r.cerradas + r.abiertas === r.total, 'cerradas + abiertas = operaciones', `${r.cerradas}+${r.abiertas} = ${r.total}`);
  ok(r.largas + r.cortas === r.total, 'largas + cortas = operaciones', `${r.largas}+${r.cortas} = ${r.total}`);
  ok(r.diasGan + r.diasPer <= r.dias, 'los días verdes y rojos caben en los días operados', `${r.diasGan}+${r.diasPer} ≤ ${r.dias}`);
  ok(Math.abs(r.mediaDia * r.dias - r.cerradas) < 0.02, 'operaciones por día × días = cerradas', `${r.mediaDia}×${r.dias} ≈ ${r.cerradas}`);
  ok(Math.abs(r.mediaMes * r.meses - r.cerradas) < 0.02, 'operaciones por mes × meses = cerradas', `${r.mediaMes}×${r.meses} ≈ ${r.cerradas}`);
  /* El volumen de las planas no tiene fila propia: la de «volumen en
     perdedoras» lo nombra en su definición cuando sobra. Esa frase es lo que
     impide que la diferencia pase por un error de suma. */
  const resto = r.vol - r.volGan - r.volPer;
  ok(resto > 0 && /planas/.test(r.subVolPer), 'el volumen que no es de ganadoras ni de perdedoras está nombrado',
    `${r.vol} − ${r.volGan} − ${r.volPer} = ${resto} · «${r.subVolPer}»`);

  /* QUE CUADRE NO BASTA: «operaciones por mes × meses = cerradas» es una
     identidad y se cumple igual con UN solo cubo. Llenar el cubo de los meses
     con `date.slice(0,4)` —la clave del año— pasaba en verde todas las de
     arriba. Lo que distingue un mes de un año es la FORMA de su clave, y eso
     es lo que la definición de cada fila lleva escrito. */
  const k = await p.evaluate(() => ({
    mes: window.fila('mejorMes').sub, ano: window.fila('mejorAno').sub,
    dia: window.fila('mejorDia').sub,
    meses: window.num(window.fila('mesesOperados').v), anos: window.num(window.fila('anosOperados').v),
  }));
  ok(/^\d{4}-\d{2}\b/.test(k.mes), 'el mejor mes se nombra con una clave de mes', k.mes);
  ok(/^\d{4}\b/.test(k.ano) && !/^\d{4}-/.test(k.ano), 'el mejor año, con una de año', k.ano);
  ok(/^\d{4}-\d{2}-\d{2}\b/.test(k.dia), 'el mejor día, con una de día', k.dia);
  ok(k.meses === 2 && k.anos === 1, 'la semilla cruza dos meses de un mismo año y así se cuenta', `${k.meses} meses · ${k.anos} años`);
}

console.log('\n═══ 3 · «win rate» son TRES números y la fila dice cuál ═══');
{
  const r = await p.evaluate(() => {
    const f = id => ({ v: window.num(window.fila(id).v), sub: window.fila(id).sub });
    return { sin: f('pctGanSinPlanas'), con: f('pctGanConPlanas'), dec: f('pctGanDecisivas'),
             gan: window.num(window.fila('ganadoras').v), per: window.num(window.fila('perdedoras').v), pla: window.num(window.fila('planas').v) };
  });
  ok(r.pla > 0, 'la semilla trae operaciones planas, que es lo que separa los tres', `${r.pla} planas`);
  const n = r.gan + r.per + r.pla;
  const esperado = (x, y) => Math.abs(x - (y * 100)) < 0.02;
  ok(esperado(r.sin.v, r.gan / n), 'planas fuera del numerador = ganadoras ÷ cerradas', `${r.sin.v}% · ${r.sin.sub}`);
  ok(esperado(r.con.v, (r.gan + r.pla) / n), 'planas como acierto = (ganadoras + planas) ÷ cerradas', `${r.con.v}% · ${r.con.sub}`);
  ok(esperado(r.dec.v, r.gan / (r.gan + r.per)), 'sólo decisivas = ganadoras ÷ (ganadoras + perdedoras)', `${r.dec.v}% · ${r.dec.sub}`);
  ok(r.sin.v !== r.con.v && r.con.v !== r.dec.v && r.sin.v !== r.dec.v,
    'los tres son tres números DISTINTOS sobre las mismas operaciones', `${r.sin.v}% · ${r.con.v}% · ${r.dec.v}%`);
  ok([r.sin, r.con, r.dec].every(x => /÷/.test(x.sub)), 'cada uno lleva su divisor escrito debajo');
}

console.log('\n═══ 4 · un dato que no se puede medir NO se imprime como cero ═══');
{
  const r = await p.evaluate(() => {
    const f = id => window.fila(id);
    return { abierto: f('pnlAbierto'), abGan: f('abiertasGan'), abPct: f('pctAbiertasGan'),
             diaRojo: f('pnlMedioDiaPer'), durTotal: f('durTotal'), durMedia: f('durMedia'),
             cerradas: window.num(f('cerradas').v) };
  });
  ok(r.abierto.v === '—' && /precio en vivo/.test(r.abierto.sub), 'el P&L no realizado sale con guion y con su razón', `«${r.abierto.v}» · ${r.abierto.sub}`);
  ok(r.abGan.v === '—' && r.abPct.v === '—', 'las abiertas en verde no se inventan ni como recuento ni como porcentaje', `${r.abGan.v} · ${r.abPct.v}`);
  ok(r.abierto.cls === 'dim', 'una cifra ausente no se pinta como si fuera un resultado', `clase «${r.abierto.cls}»`);
  /* La duración SÍ se puede medir, pero sólo sobre las que tienen hora de
     salida. El número sale; lo que no puede faltar es sobre cuántas. */
  const m = r.durTotal.sub.match(/sobre (\d+) de (\d+)/);
  ok(!!m && Number(m[1]) < Number(m[2]) && Number(m[2]) === r.cerradas,
    'las filas de tiempo dicen sobre cuántas operaciones están medidas', r.durTotal.sub);
  ok(r.durMedia.v !== '—' && r.durMedia.v !== '0 min', 'la duración media sale medida, no en cero', r.durMedia.v);
  ok(/sobre \d+ de \d+/.test(r.durMedia.sub), 'y también dice sobre cuántas', r.durMedia.sub);
}

console.log('\n═══ 4b · con CERO duraciones medibles, las ocho filas de tiempo no inventan un cero ═══');
{
  /* 2026-03-06 trae dos operaciones cerradas y ninguna con hora de salida.
     Un «0 min» aquí es indistinguible de una medición real: es exactamente el
     sitio donde el cero miente mejor. */
  await p.evaluate(() => {
    const d = document.getElementById('mxDesde'), h = document.getElementById('mxHasta');
    d.value = '2026-03-06'; d.dispatchEvent(new Event('change', { bubbles: true }));
    h.value = '2026-03-06'; h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => window.num(window.fila('cerradas').v) === 2, null, { timeout: 15000 });
  const r = await p.evaluate(() => {
    const ids = ['durTotal', 'durGan', 'durPer', 'durMax', 'durMin', 'durMedia', 'durMediaGan', 'durMediaPer'];
    return ids.map(id => ({ id, ...window.fila(id) }));
  });
  ok(r.length === 8 && r.every(x => x.v === '—'), 'las ocho salen con guion',
    r.filter(x => x.v !== '—').map(x => `${x.id}=${x.v}`).join(' | ') || 'las ocho');
  ok(r.every(x => /ninguna operación tiene hora de salida/.test(x.sub)), 'y las ocho dicen por qué',
    r.find(x => !/ninguna/.test(x.sub)) ? r.find(x => !/ninguna/.test(x.sub)).sub : 'todas');
  ok(r.every(x => x.cls === 'dim'), 'y ninguna se pinta como si fuera un resultado');
  await p.evaluate(() => {
    const d = document.getElementById('mxDesde'), h = document.getElementById('mxHasta');
    d.value = ''; d.dispatchEvent(new Event('change', { bubbles: true }));
    h.value = ''; h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => window.num(window.fila('cerradas').v) === 12, null, { timeout: 15000 });
}

console.log('\n═══ 5 · el filtro es el de la puerta única ═══');
{
  const antes = await p.evaluate(() => window.num(window.fila('cerradas').v));
  await p.evaluate(() => {
    const d = document.getElementById('mxDesde'), h = document.getElementById('mxHasta');
    d.value = '2026-03-02'; d.dispatchEvent(new Event('change', { bubbles: true }));
    h.value = '2026-03-02'; h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => window.num(window.fila('cerradas').v) === 2, null, { timeout: 15000 });
  const r = await p.evaluate(() => ({
    cerradas: window.num(window.fila('cerradas').v),
    enTabla: document.querySelectorAll('#mxTabla tbody tr[data-mx]').length,
    n: document.getElementById('mxN').textContent,
    dias: window.num(window.fila('diasOperados').v),
  }));
  ok(r.cerradas === 2 && r.enTabla === 2, 'el catálogo cuenta las mismas operaciones que la tabla de abajo', `${r.cerradas} · ${r.enTabla}`);
  ok(/N = 2 /.test(r.n), 'y las mismas que el contador de la cabecera', r.n.trim());
  ok(r.dias === 1, 'con un solo día en el filtro hay un solo día operado', String(r.dias));
  ok(antes === 12, 'sin filtro estaban las 12 cerradas', String(antes));
}

console.log('\n═══ 7 · «el peor día» no afirma una pérdida que no existe ═══');
{
  /* El filtro sigue en 2026-03-02, que es un día verde: el peor día es el
     menos bueno y la fila tiene que decirlo. */
  const verde = await p.evaluate(() => window.fila('peorDia'));
  ok(/menos bueno/.test(verde.sub), 'sin días rojos, el peor día se declara como el menos bueno', `${verde.v} · ${verde.sub}`);
  await p.evaluate(() => {
    const d = document.getElementById('mxDesde'), h = document.getElementById('mxHasta');
    d.value = ''; d.dispatchEvent(new Event('change', { bubbles: true }));
    h.value = ''; h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => window.num(window.fila('cerradas').v) === 12, null, { timeout: 15000 });
  const rojo = await p.evaluate(() => window.fila('peorDia'));
  ok(!/menos bueno/.test(rojo.sub), 'con días rojos en la muestra, la nota NO aparece', `${rojo.v} · ${rojo.sub}`);
  ok(Number(String(rojo.v).replace(/[$,\s]/g, '')) < 0, 'y el peor día es de verdad negativo', rojo.v);
}

console.log('\n═══ 6 · el buscador y las categorías ═══');
{
  const todas = await p.evaluate(() => window.nFilas());
  await p.fill('#mxEstQ', 'volumen');
  await p.waitForFunction(() => window.nFilas() < 160, null, { timeout: 10000 });
  const busca = await p.evaluate(() => ({
    n: window.nFilas(),
    todasCoinciden: [...document.querySelectorAll('#mxEstLista .estrow')]
      .every(r => r.textContent.toLowerCase().includes('volumen')),
  }));
  ok(busca.n > 0 && busca.n < todas, 'buscar reduce el catálogo', `${busca.n} de ${todas}`);
  ok(busca.todasCoinciden, 'y todo lo que queda contiene lo buscado');
  await p.fill('#mxEstQ', '');
  await p.waitForFunction(() => window.nFilas() === 160, null, { timeout: 10000 });
  ok(true, 'vaciar el buscador devuelve las 160');

  await p.click('#mxEstCats button[data-cat="tiempo"]');
  await p.waitForFunction(() => document.querySelectorAll('#mxEstLista .estgrupo').length === 1, null, { timeout: 10000 });
  const cat = await p.evaluate(() => ({
    grupos: [...document.querySelectorAll('#mxEstLista .estgrupo h3')].map(h => h.textContent),
    n: window.nFilas(),
    pulsado: document.querySelector('#mxEstCats button[data-cat="tiempo"]').getAttribute('aria-pressed'),
  }));
  ok(cat.grupos.length === 1 && /Tiempo/.test(cat.grupos[0]), 'una categoría deja un solo grupo', cat.grupos.join(' | '));
  ok(cat.n === 8, 'con sus ocho filas de tiempo', String(cat.n));
  ok(cat.pulsado === 'true', 'y el botón se queda marcado');
  await p.click('#mxEstCats button[data-cat="tiempo"]');
  await p.waitForFunction(() => window.nFilas() === 160, null, { timeout: 10000 });
  ok(true, 'volver a pulsarla devuelve el catálogo entero');
}

/* Los dos botones globales viven en Ajustes desde que se organizó la
   configuración; antes estaban en la barra superior. Se recorre el camino
   real —entrar, pulsar, volver a donde estábamos— en vez de pulsar por
   `evaluate`, que funcionaría sobre el botón oculto y dejaría pasar un botón
   inalcanzable. */
const enAjustes = async (p, sel) => {
  const vuelta = await p.evaluate(() => (document.querySelector('.tab.active') || {}).dataset?.tab || 'cabina');
  await p.click('#tabnav .tabbtn[data-tab="ajustes"]');
  await p.click(sel);
  if (vuelta && vuelta !== 'ajustes') await p.click(`#tabnav .tabbtn[data-tab="${vuelta}"]`);
};
console.log('\n═══ 8 · el inglés llega a las 160 filas, no a la cabecera sola ═══');
{
  const antes = await p.evaluate(() => window.fila('profitFactor').lab);
  await enAjustes(p, '#idiomaBtn');
  let llego = true;
  try { await p.waitForFunction(() => window.fila('pnlTotal') && window.fila('pnlTotal').lab === 'Total PnL', null, { timeout: 10000 }); }
  catch (e) { llego = false; }
  ok(llego, 'pulsar el botón de idioma repinta el catálogo', llego ? 'repintado' : 'las filas se quedaron en español');
  const r = await p.evaluate(() => ({
    pf: window.fila('profitFactor').lab,
    n: window.nFilas(),
    conAcento: [...document.querySelectorAll('#mxEstLista .estrow b')].map(e => e.textContent).filter(t => /[áéíóúñ¿¡]/i.test(t)),
    grupos: [...document.querySelectorAll('#mxEstLista .estgrupo h3')].map(h => h.textContent),
  }));
  ok(r.n === 160, 'siguen siendo 160 en inglés', String(r.n));
  ok(r.conAcento.length === 0, 'ninguna etiqueta se queda en español', r.conAcento.slice(0, 4).join(' | ') || 'ninguna');
  ok(r.grupos.every(g => !/[áéíóúñ]/i.test(g)), 'los títulos de grupo tampoco', r.grupos.join(' | '));
  ok(antes === 'Profit factor' && r.pf === 'Profit factor', 'una etiqueta que se escribe igual en los dos idiomas no se rompe');
  await enAjustes(p, '#idiomaBtn');
}

console.log('\n═══ 9 · el CSV lleva el número crudo Y el guion, sin convertir uno en otro ═══');
{
  /* El riesgo del fichero es el mismo que el de la pantalla, agravado: en una
     hoja de cálculo un «0» en el sitio de un dato ausente ya no tiene la
     definición al lado que lo desmienta... salvo que la lleve. Por eso van las
     dos columnas: «Valor» crudo para calcular y «Mostrado» para leer, y el
     guion sobrevive al viaje en vez de volverse cero. */
  /* ESPERAR A LA DESCARGA QUE SE PIDIÓ, NO A LA PRIMERA QUE PASE. Cabina baja
     un respaldo `cabina_pre_migracion.json` al arrancar si encuentra
     operaciones antes de marcar la migración como hecha, y estas suites
     siembran las suyas con `FUT.createTrade()` justo en esa ventana: la
     carrera es real y se midió —tres de cada cuatro corridas leían el JSON del
     respaldo en vez del CSV, y la cabecera salía «{»—. Ese respaldo es
     correcto y no es asunto de esta prueba; lo que no puede pasar es
     confundirlo con el fichero pedido. El predicado lo resuelve por nombre. */
  const lineas = async () => {
    const espera = p.waitForEvent('download',
      { predicate: d => d.suggestedFilename().startsWith('cabina-estadisticas-') });
    await p.click('#mxEstExport');
    const f = await espera;
    return readFileSync(await f.path(), 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  };
  const campos = l => l.slice(1, -1).split('","');
  await p.fill('#mxEstQ', '');
  await p.waitForFunction(() => window.nFilas() === 160, null, { timeout: 10000 });
  const todo = await lineas();
  ok(/^"Categoría","Estadística","Valor","Mostrado","Definición"$/.test(todo[0]),
    'la cabecera son las cinco columnas', todo[0]);
  ok(todo.length === 161, 'las 160 estadísticas, una por línea', `${todo.length - 1} filas`);
  ok(!/<[a-z]|&amp;|&lt;|&#39;/i.test(todo.join('')),
    'ni etiquetas ni entidades HTML dentro del fichero');

  const fila = lab => campos(todo.find(l => l.startsWith('"') && campos(l)[1] === lab) || '""');
  const total = fila('P&L total');
  ok(/^-?\d+(\.\d+)?$/.test(total[2]), 'el valor crudo es un número que una hoja de cálculo entiende', total[2]);
  ok(/\$/.test(total[3]), 'y «Mostrado» conserva el formato de pantalla', total[3]);

  /* LA FILA QUE IMPORTA. El P&L no realizado no se puede medir; en el fichero
     tiene que seguir sin medirse, no volverse cero por el camino. */
  const abierto = fila('P&L no realizado');
  ok(abierto[2] === '' && abierto[3] === '—',
    'una cifra que no se puede medir va con el valor VACÍO y un guion, nunca con un cero',
    `valor=«${abierto[2]}» mostrado=«${abierto[3]}»`);
  ok(/precio en vivo/.test(abierto[4]), 'y la razón viaja con ella', abierto[4]);

  /* El fichero exporta lo que el filtro deja a la vista, ni más ni menos. */
  await p.fill('#mxEstQ', 'volumen');
  await p.waitForFunction(() => window.nFilas() < 160, null, { timeout: 10000 });
  const nPantalla = await p.evaluate(() => window.nFilas());
  const filtrado = await lineas();
  ok(filtrado.length - 1 === nPantalla,
    'con el buscador puesto, el fichero trae exactamente lo que hay en pantalla',
    `${filtrado.length - 1} filas · ${nPantalla} en pantalla`);
  ok(filtrado.slice(1).every(l => l.toLowerCase().includes('volumen')),
    'y todas coinciden con lo buscado');
  await p.fill('#mxEstQ', 'no-existe-esta-estadistica');
  await p.waitForFunction(() => window.nFilas() === 0, null, { timeout: 10000 });
  ok(await p.locator('#mxEstExport').isDisabled(), 'sin filas que exportar, el botón se apaga');
  await p.fill('#mxEstQ', '');
  await p.waitForFunction(() => window.nFilas() === 160, null, { timeout: 10000 });

  /* EL ESCAPADO SE DESHACE, Y HACE FALTA UN «&» PARA VERLO. La columna
     «Definición» se construye para innerHTML y escapa el nombre del
     instrumento, que es dato del usuario. Con datos limpios no se nota nada;
     con un «&» dentro, un fichero que no deshiciera ese escapado diría
     «A&amp;B» en una hoja de cálculo. Va al final del bloque para no mover
     ninguno de los recuentos de arriba. */
  await p.evaluate(async () => {
    FUT.createTrade({ id: 'S_AMP', accountId: 'EST', instrument: 'A&B', qty: 1, direction: 'long',
      date: '2026-03-07', time: '09:30', entry: 100, exit: 150, pnl: 9999 });
    await window.hasta('la operación con un & en el instrumento',
      () => window.num(window.fila('cerradas').v) === 13);
  });
  const conAmp = await lineas();
  const sim = conAmp.find(l => l.includes('A&')) || '';
  ok(/A&B/.test(sim) && !/A&amp;B/.test(sim),
    'un «&» en el nombre de un instrumento llega al fichero como «&», no como «&amp;»',
    sim.slice(0, 140) || 'no se encontró ninguna línea con el instrumento');
}

console.log('\n═══ errores de página ═══');
ok(errs.length === 0, 'ninguna excepción en toda la prueba', errs.slice(0, 3).join(' | ') || 'ninguna');

console.log(`\n${fallos.length ? '❌' : '✅'} estadisticas · ${fallos.length} fallos`);
await b.close(); srv.close();
process.exit(fallos.length ? 1 : 0);