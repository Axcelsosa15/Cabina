/* LA SESIÓN OPERATIVA, RECORRIDA EN LA APP REAL.

   Abrir → preparar → iniciar → pausar → registrar → límite → cerrar → reabrir.
   Lo que el modelo garantiza está en sesion-modelo.mjs; aquí se comprueba que
   la app lo USA: que lo que se ve es lo que se guardó, y que sobrevive a recargar.

     T07  la cuenta de la sesión no cambia cuando cambia el filtro
     T08  cambiar el plan conserva la versión original; relajar sólo propone
     T09  con el límite alcanzado se puede registrar lo ocurrido, y subir la
          regla en Reglas duras no borra el aviso
     T23  el flujo principal completo con teclado, a 390 px
     T24  cierre y reapertura conservan el historial

   Todo en almacenamiento local, con el reloj fijo y sin red. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra, enDisco } from './espera.mjs';

const HOY = '2026-09-17', AYER = '2026-09-16';
const AHORA = Date.parse(HOY + 'T14:00:00Z');   // jueves, 10:00 ET, NY AM
const CLAVE = 'cabina-mnq:v1';
const fallos = [], errores = [];
const ok = (c, texto, dato) => {
  console.log(`  ${c ? '✅' : '❌'} ${texto}${dato == null ? '' : ' · ' + dato}`);
  if (!c) fallos.push(texto);
};
const base = extra => {
  const settings = structuredClone(CONFIG_PRUEBA);
  settings.meta = Object.assign({}, settings.meta, { acct: '' });   // sin cuenta elegida: se elige en la prueba
  return Object.assign({ settings, trades: {}, days: {} }, extra);
};
const PLAN = { v: 1, at: AHORA - 86400000, tipo: 'inicio', motivo: '', base: null, cuenta: 'prop25',
  ventana: { start: 510, end: 660, days: [1, 2, 3, 4, 5], tz: 'America/New_York' }, limites: { maxLoss: 300 },
  instrumentos: ['MNQ'], setups: [], checklist: null, reglasCuenta: null, faltantes: [] };

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();

async function abrir(width, datos = base()) {
  const ctx = await nav.newContext({ viewport: { width, height: 950 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    return u.startsWith(origen + '/') || /^(data:|blob:)/.test(u) ? route.continue() : route.abort();
  });
  await ctx.addInitScript(({ ahora }) => {
    const RealDate = Date;
    let tic = 0;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [ahora])); }
      /* Avanza un milisegundo por lectura: dos escrituras nunca comparten sello. */
      static now() { return ahora + (tic++); }
    };
  }, { ahora: AHORA });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await siembra(p, origen + '/', datos);
  await arrancada(p);
  await p.waitForSelector('#sesEstado');
  return { ctx, p };
}
const disco = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), CLAVE);
const dia = async (p, f = HOY) => (await disco(p)).days?.[f];
const estado = p => p.locator('#sesEstado').innerText();
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function rapido(p, texto) {
  await p.locator('#quickBtn').click();
  await p.locator('#qkText').fill(texto);
  await p.waitForFunction(() => !document.getElementById('qkSave').disabled);
  await p.locator('#qkText').press('Enter');
  await quieto(p, 150, 3000);
}

try {
  console.log('\n═══ 1320 px · preparación → activa ═══');
  {
    const { ctx, p } = await abrir(1320);
    ok(/Preparación/.test(await estado(p)), 'un día nuevo arranca en Preparación', await estado(p));
    ok(/incompletos/.test(await p.locator('#sesDatos').innerText()), 'el estado de datos dice que faltan cosas, aparte del estado de sesión',
      await p.locator('#sesDatos').innerText());
    ok(/cuenta de trabajo sin elegir/.test(await p.locator('#sesMotivo').innerText()), 'y dice CUÁLES faltan');
    ok((await p.locator('#sesGuardado').innerText()).trim() === (await p.locator('#saveState').innerText()).trim(),
      'el guardado de la barra es el mismo rótulo global, no otro', await p.locator('#sesGuardado').innerText());
    ok(await p.locator('#sesMargen').count() === 0, 'en preparación no se enseña ningún margen de riesgo');
    ok(await p.evaluate(() => !document.getElementById('sesBar').classList.contains('panel')),
      'la barra no es un módulo ocultable de Vista');

    await p.locator('#sesAcct').selectOption('prop25');
    await enDisco(p, d => d?.settings?.meta?.acct === 'prop25');
    ok(!/cuenta de trabajo/.test(await p.locator('#sesMotivo').innerText()), 'elegir la cuenta quita ese faltante');
    ok(await p.locator('#sesAcciones .btn.primary').count() === 1, 'una sola acción primaria');

    await p.locator('[data-ses-act="iniciar"]').click();
    await enDisco(p, d => d?.days?.[HOY]?.sesion?.estado === 'activa');
    let d = await dia(p);
    const plan = d.sesion.planes[0];
    ok(/Activa/.test(await estado(p)), 'iniciar pasa a Activa');
    ok(plan.v === 1 && plan.cuenta === 'prop25' && plan.limites.maxLoss === 300 && plan.limites.maxLosses === 3,
      'el plan v1 guarda cuenta y límites configurados', JSON.stringify(plan.limites));
    ok(plan.ventana.tz === 'America/New_York' && plan.ventana.start === 510, 'con ventana y zona horaria');
    ok(plan.faltantes.some(f => /pre-sesión/.test(f)), 'y lo que faltaba al iniciar viaja con el plan', plan.faltantes.join(' | '));
    ok(d.sesion.eventos.length === 1, 'un inicio, un evento');
    ok(/\$300/.test(await p.locator('#sesMargen').innerText()), 'con tope en el plan, el margen se puede enseñar', await p.locator('#sesMargen').innerText());
    ok(await p.locator('#cabCanvasEdit').isDisabled(), 'con la sesión abierta el editor de distribución queda quieto');

    console.log('\n═══ T07 · la cuenta de la sesión no sigue al filtro ═══');
    await p.evaluate(() => window.FUT.setSelectedAccount('prop50'));
    await quieto(p);
    ok(/25K/.test(await p.locator('#sesAcctTxt').innerText()), 'cambiar el filtro a otra cuenta no cambia la cuenta de la sesión',
      await p.locator('#sesAcctTxt').innerText());
    await p.evaluate(() => window.FUT.setSelectedAccount('prop25'));
    await quieto(p);

    console.log('\n═══ pausa: motivo y condición, error junto al campo ═══');
    await p.locator('[data-ses-act="form-pausar"]').click();
    ok(await p.evaluate(() => document.activeElement.id === 'sesPausaMotivo'), 'el formulario recibe el foco en su primer campo');
    await p.locator('#sesFormOk').click();
    ok(await p.locator('#sesFormErr').isVisible() && /motivo/i.test(await p.locator('#sesFormErr').innerText()),
      'pausar sin motivo: error persistente dentro del formulario', await p.locator('#sesFormErr').innerText());
    ok(/Activa/.test(await estado(p)), 'y la sesión no cambió');
    await p.locator('#sesPausaMotivo').fill('Dos entradas impulsivas');
    await p.keyboard.press('Escape');
    ok(await p.locator('#sesForm').count() === 0 && await p.evaluate(() => !!document.activeElement.closest('#sesAcciones')),
      'Escape cierra el formulario y devuelve el foco a las acciones');
    await p.locator('[data-ses-act="form-pausar"]').click();
    await p.locator('#sesPausaMotivo').fill('Dos entradas impulsivas');
    await p.locator('#sesPausaCond').fill('Esperar 20 minutos y releer el plan');
    await p.locator('#sesFormOk').click();
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.estado === 'pausa');
    const mp = await p.locator('#sesMotivo').innerText();
    ok(/En pausa/.test(await estado(p)) && /Dos entradas impulsivas/.test(mp) && /Esperar 20 minutos/.test(mp) && /manual/.test(mp),
      'la pausa enseña motivo, condición de reanudación y que es manual');
    ok(await p.locator('[data-ses-act="registrar"]').isEnabled(), 'en pausa se puede seguir registrando');
    await p.locator('[data-ses-act="reanudar"]').click();
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.estado === 'activa');

    console.log('\n═══ T08 · el plan se versiona ═══');
    const ajustar = async (valor, motivo, correccion) => {
      await p.locator('[data-ses-act="form-ajustar"]').click();
      await p.locator('#sesAjCampo').selectOption('maxLoss');
      await p.locator('#sesAjValor').fill(String(valor));
      if (correccion) await p.locator('#sesAjCorr').check();
      await p.locator('#sesAjMotivo').fill(motivo);
      await p.locator('#sesFormOk').click();
      await quieto(p, 100, 2000);
    };
    await ajustar(900, 'Me siento con confianza');
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.propuestas?.length === 1);
    d = await dia(p);
    ok(d.sesion.planes.length === 1 && d.sesion.planes[0].limites.maxLoss === 300 && d.sesion.propuestas.length === 1,
      'ampliar el tope a media sesión NO cambia el plan: queda como propuesta', await p.locator('#sesAviso').innerText());
    await ajustar(250, 'Día de noticias');
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.planes?.length === 2);
    d = await dia(p);
    ok(d.sesion.planes[0].limites.maxLoss === 300 && d.sesion.planes[1].limites.maxLoss === 250 && d.sesion.planes[1].motivo === 'Día de noticias',
      'reducirlo aplica ya como v2 y la v1 se conserva con su número');
    await p.locator('#sesPlanDet summary').click();
    const det = await p.locator('#sesPlanDet').innerText();
    ok(/Plan v1/.test(det) && /Plan v2/.test(det) && /Día de noticias/.test(det), 'las dos versiones y el motivo se pueden leer en la barra');

    console.log('\n═══ T09 · límite alcanzado ═══');
    await rapido(p, 'MNQ -260');
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.estado === 'limite');
    d = await dia(p);
    let ops = Object.values((await disco(p)).trades);
    ok(/Límite alcanzado/.test(await estado(p)), 'una pérdida registrada de 260 contra el plan de 250 pasa a Límite alcanzado');
    ok(d.sesion.limite.regla === 'maxLoss' && d.sesion.limite.limite === 250 && d.sesion.limite.valor === 260 && d.sesion.limite.operaciones.length === 1,
      'con regla, valor, tope y operación como evidencia', JSON.stringify({ r: d.sesion.limite.regla, l: d.sesion.limite.limite, v: d.sesion.limite.valor }));
    const ml = await p.locator('#sesMotivo').innerText();
    ok(/Alcance: .*25K/.test(ml) && /no bloquea tu bróker/.test(ml), 'dice el alcance y no afirma bloquear el bróker');
    ok(ops.length === 1 && ops[0].sessionRef?.day === HOY && ops[0].sessionRef?.plan === 2,
      'la operación registrada en sesión lleva la referencia a su plan', JSON.stringify(ops[0].sessionRef));
    ok(await p.locator('[data-ses-act="reanudar"]').count() === 0 && await p.locator('[data-ses-act="form-pausar"]').count() === 0,
      'en límite no existe «reanudar»');

    /* El cambio informal: subir la regla en Reglas duras. */
    await p.locator('#rules .rulec[data-id="maxloss"] input[data-f="value"]').fill('5000');
    await enDisco(p, x => x?.settings?.rules?.find(r => r.id === 'maxloss')?.value == 5000);
    await quieto(p, 150, 2000);
    ok(/Límite alcanzado/.test(await estado(p)), 'subir la regla a 5000 en Reglas duras no borra el límite');
    await p.locator('[data-ses-act="form-levantar"]').click();
    await p.locator('#sesLevantarMotivo').fill('quiero seguir');
    await p.locator('#sesFormOk').click();
    ok(/siguen alcanzando/.test(await p.locator('#sesFormErr').innerText()) && /Límite alcanzado/.test(await estado(p)),
      '«revisar tras corregir» se niega mientras los datos sigan alcanzándolo', await p.locator('#sesFormErr').innerText());
    await p.locator('[data-ses-act="cancelar"]').click();

    ok(await p.locator('[data-ses-act="registrar"]').isEnabled(), 'registrar sigue disponible con el límite alcanzado');
    await rapido(p, 'MNQ -40');
    await enDisco(p, x => Object.keys(x?.trades || {}).length === 2);
    ops = Object.values((await disco(p)).trades);
    ok(ops.length === 2 && ops.some(t => t.sessionRef?.estado === 'limite'),
      'la operación ocurrida DESPUÉS del límite se registra, marcada como hecha en límite');
    ok(/Límite alcanzado/.test(await estado(p)) && /2/.test(await p.locator('#sesOps').innerText()), 'y la sesión sigue en límite con 2 operaciones');

    await p.reload(); await arrancada(p); await p.waitForSelector('#sesEstado');
    ok(/Límite alcanzado/.test(await estado(p)), 'el límite sobrevive a recargar');

    console.log('\n═══ T24 · cierre y reapertura ═══');
    await p.locator('[data-ses-act="form-cerrar"]').click();
    ok(/2 operaciones/.test(await p.locator('#sesCierreRes').innerText()) && /-\$300/.test(await p.locator('#sesCierreRes').innerText()),
      'el cierre enseña lo que va a guardar', await p.locator('#sesCierreRes').innerText());
    await p.locator('#sesFormOk').click();
    await enDisco(p, x => x?.days?.[HOY]?.closed === true && x.days[HOY].sesion?.estado === 'cerrada');
    d = await dia(p);
    ok(d.sesion.cierres.length === 1 && d.sesion.cierres[0].resumen.n === 2 && d.sesion.cierres[0].resumen.pnl === -300,
      'el cierre guarda su resumen', JSON.stringify(d.sesion.cierres[0].resumen));
    ok(/Cerrada/.test(await estado(p)) && /Revisión pendiente/.test(await p.locator('#sesMotivo').innerText()),
      'cerrada sin nota: la revisión pendiente se ve');
    ok(await p.locator('#cabCanvasEdit').isEnabled(), 'con la sesión cerrada el editor de distribución vuelve');

    await p.locator('[data-ses-act="form-reabrir"]').click();
    await p.locator('#sesFormOk').click();
    ok(/motivo/i.test(await p.locator('#sesFormErr').innerText()) && (await dia(p)).closed === true, 'reabrir sin motivo no reabre');
    await p.locator('#sesReabrirMotivo').fill('Faltaba una captura');
    await p.locator('#sesFormOk').click();
    await enDisco(p, x => x?.days?.[HOY]?.closed === false);
    d = await dia(p);
    ok(d.sesion.estado === 'limite' && d.sesion.cierres.length === 1, 'reabrir conserva el cierre anterior y vuelve a LÍMITE, no a activa');
    ok(d.sesion.eventos.some(e => e.accion === 'reabrir' && e.motivo === 'Faltaba una captura'), 'con el motivo en el historial');
    await p.locator('[data-ses-act="form-cerrar"]').click();
    await p.locator('#sesFormOk').click();
    await enDisco(p, x => x?.days?.[HOY]?.sesion?.cierres?.length === 2);
    await p.reload(); await arrancada(p); await p.waitForSelector('#sesEstado');
    d = await dia(p);
    ok(/Cerrada/.test(await estado(p)) && d.sesion.cierres.length === 2 && d.sesion.planes.length === 2,
      'tras recargar: cerrada, con los dos cierres y las dos versiones del plan');
    ok(JSON.stringify(Object.values((await disco(p)).trades).map(t => t.pnl).sort()) === JSON.stringify([-260, -40]),
      'nada de todo esto tocó las operaciones');
    ok(await sinDesborde(p), '1320 px sin desbordamiento horizontal');
    await ctx.close();
  }

  console.log('\n═══ T23 · 390 px, sólo teclado ═══');
  {
    const { ctx, p } = await abrir(390);
    ok(await sinDesborde(p), '390 px sin desbordamiento horizontal en preparación');
    const tecla = async (sel, k = 'Enter') => { await p.locator(sel).focus(); await p.keyboard.press(k); await quieto(p, 100, 2000); };
    await tecla('[data-ses-act="iniciar"]');
    await enDisco(p, d => d?.days?.[HOY]?.sesion?.estado === 'activa');
    ok(/Activa/.test(await estado(p)), 'iniciar con Enter');
    ok(/no calculable|\$/.test(await p.locator('#sesMargen').innerText()), 'el margen dice de dónde sale o que no es calculable', await p.locator('#sesMargen').innerText());
    await tecla('[data-ses-act="form-pausar"]');
    await p.keyboard.type('Cansancio');
    await p.keyboard.press('Tab');
    await p.keyboard.type('Volver tras el almuerzo');
    await p.keyboard.press('Tab');
    await p.keyboard.press('Enter');
    await enDisco(p, d => d?.days?.[HOY]?.sesion?.estado === 'pausa');
    ok(/En pausa/.test(await estado(p)), 'pausar tecleando y tabulando');
    await tecla('[data-ses-act="reanudar"]');
    await tecla('[data-ses-act="form-cerrar"]');
    await p.keyboard.press('Enter');
    ok(/Confirma que no operaste/.test(await p.locator('#sesFormErr').innerText()), 'cerrar sin operaciones exige la decisión explícita');
    await p.locator('#sesNoOpere').focus(); await p.keyboard.press('Space');
    await tecla('#sesFormOk');
    await enDisco(p, d => d?.days?.[HOY]?.closed === true);
    const d = await dia(p);
    ok(d.sesion.cierres[0].decision === 'no_operar' && d.sesion.cierres[0].resumen.n === 0, 'no operar queda como decisión registrada, no como día vacío');
    ok(/sin operar/.test(await p.locator('#sesMotivo').innerText()), 'y la barra lo dice');
    const tam = await p.evaluate(() => Array.from(document.querySelectorAll('#sesAcciones .btn')).map(b => b.getBoundingClientRect().height));
    ok(tam.every(h => h >= 40), 'botones de la barra con altura táctil', tam.join(' '));
    ok(await sinDesborde(p), '390 px sin desbordamiento horizontal al final');
    await ctx.close();
  }

  console.log('\n═══ días anteriores a este modelo ═══');
  {
    const { ctx, p } = await abrir(1320, base({ days: { [HOY]: { date: HOY, closed: true, result: 120, note: 'ok', updatedAt: AHORA - 5000 } } }));
    ok(/Cerrada/.test(await estado(p)) && /versión anterior/.test(await p.locator('#sesMotivo').innerText()),
      'un día cerrado sin `sesion` se lee cerrado y dice que no tiene resumen');
    ok((await dia(p)).sesion === undefined, 'leerlo no escribe nada en el documento');
    await p.locator('[data-ses-act="form-reabrir"]').click();
    await p.locator('#sesReabrirMotivo').fill('Revisar el resultado');
    await p.locator('#sesFormOk').click();
    await enDisco(p, d => d?.days?.[HOY]?.closed === false);
    const d = await dia(p);
    ok(d.sesion.estado === 'preparacion' && d.sesion.cierres.length === 1 && d.result === 120 && d.note === 'ok',
      'reabrirlo conserva el cierre heredado y no toca resultado ni nota');
    await ctx.close();
  }

  console.log('\n═══ T11 (parte) · una sesión que quedó abierta al cambiar de fecha ═══');
  {
    const abierta = { v: 1, estado: 'activa', planes: [PLAN], propuestas: [{ id: 'p1', at: AHORA - 80000000, campo: 'maxLoss', de: 300, a: 500, motivo: 'probar', estado: 'pendiente' }],
      eventos: [{ id: 'e1', at: AHORA - 86400000, accion: 'iniciar', de: 'preparacion', a: 'activa', motivo: '', detalle: null }], cierres: [], pausa: null, limite: null };
    const { ctx, p } = await abrir(1320, base({ days: { [AYER]: { date: AYER, closed: false, updatedAt: AHORA - 86400000, sesion: abierta } },
      trades: { t1: { id: 't1', type: 'futuros', date: AYER, time: '10:00', accountId: 'prop25', instrument: 'MNQ', pnl: -75, updatedAt: AHORA - 86000000 } } }));
    ok(/Preparación/.test(await estado(p)) && /sigue abierta/.test(await p.locator('#sesMotivo').innerText()),
      'hoy está en preparación y avisa de la sesión de ayer sin cerrar', await p.locator('#sesMotivo').innerText());
    ok(await p.locator('[data-ses-act="iniciar"]').count() === 0, 'no se inicia la de hoy por encima de la de ayer');
    await p.locator('[data-ses-act="cerrar-previa"]').click();
    await enDisco(p, d => d?.days?.[AYER]?.closed === true);
    const a = await dia(p, AYER), h = await dia(p);
    ok(a.sesion.estado === 'cerrada' && a.sesion.cierres[0].resumen.n === 1 && a.sesion.cierres[0].resumen.pnl === -75 && a.date === AYER,
      'se cierra en SU fecha, con el resumen de SUS operaciones', JSON.stringify(a.sesion.cierres[0].resumen));
    ok(!h || !h.sesion, 'y el día de hoy no hereda nada de ella');
    await quieto(p, 150, 2000);
    ok(await p.locator('[data-ses-act="iniciar"]').count() === 1, 'después ya se puede iniciar la de hoy');
    ok(/Propuestas de sesiones anteriores/i.test(await p.locator('#sesBarBody').innerText()), 'la propuesta de ayer aparece hoy, sin aplicarse sola');
    ok((await disco(p)).settings.rules.find(r => r.id === 'maxloss').value === 300, 'la regla sigue en 300: una propuesta no cambia reglas');
    await p.locator('[data-ses-prop$="descartada"]').click();
    await enDisco(p, d => d?.days?.[AYER]?.sesion?.propuestas?.[0]?.estado === 'descartada');
    ok(true, 'descartarla queda guardado en el día que la propuso');
    await ctx.close();
  }
} catch (e) {
  fallos.push('excepción: ' + e.message); console.error(e);
} finally {
  await nav.close(); srv.close();
}
ok(errores.length === 0, 'sin errores de página', errores.join(' | ') || null);
console.log(fallos.length ? `\nFAIL sesion-flujo: ${fallos.length} fallo(s)` : '\nPASS sesion-flujo');
process.exit(fallos.length ? 1 : 0);
