/* La disciplina vive en los mismos registros del journal. Estas pruebas recorren
   el flujo visible, incluidos el cierre explícito sin operar y una exportación
   que nunca recibe nombres, notas ni resultados económicos. Todo se ejecuta
   contra lo publicado, en almacenamiento local y sin conexiones externas. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra, enDisco, abreCabOps } from './espera.mjs';

const HOY = '2026-09-17';
const AHORA = Date.parse(HOY + 'T14:00:00Z');
const CLAVE = 'cabina-mnq:v1';
const fallos = [];
const errores = [];
const ok = (c, texto, dato) => {
  console.log(`  ${c ? '✅' : '❌'} ${texto}${dato == null ? '' : ' · ' + dato}`);
  if (!c) fallos.push(texto);
};
const cuenta = { id: 'privada-1729', name: 'CUENTA PRIVADA 1729', size: 50000,
  dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] };
const base = () => ({ settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [cuenta] }, trades: {}, days: {} });
const dia = date => ({ date, closed: true, broke: false,
  note: 'NOTA PRIVADA 1729: no debe exportarse', updatedAt: AHORA - 1000,
  pres: { nyam: { at: Date.parse(date + 'T11:00:00Z'), ses: 'nyam', done: 2, total: 2,
    items: [{ t: 'Plan privado 1729', ok: true }, { t: 'Límite privado 1729', ok: true }] } } });

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();

async function abrir(width, datos = base()) {
  const ctx = await nav.newContext({ viewport: { width, height: 950 }, acceptDownloads: true });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    return u.startsWith(origen + '/') || /^(data:|blob:)/.test(u) ? route.continue() : route.abort();
  });
  await ctx.addInitScript(({ ahora }) => {
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [ahora])); }
      static now() { return ahora; }
    };
    // Inspeccionar lo que se dibuja también protege la imagen, no sólo su modal.
    window.__disciplinaTextoDibujado = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (texto, ...args) {
      window.__disciplinaTextoDibujado.push(String(texto));
      return original.call(this, texto, ...args);
    };
  }, { ahora: AHORA });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await siembra(p, origen + '/', datos);
  await arrancada(p);
  await p.waitForFunction(() => !!window.CabinaDiscipline &&
    !!document.querySelector('#disciplineHome')?.textContent.trim());
  return { ctx, p };
}

async function ajustes(p) {
  if (await p.locator('#mobileMoreBtn').isVisible()) {
    await p.locator('#mobileMoreBtn').click();
    await p.locator('#mobileMoreOv [data-mobile-more-tab="ajustes"]').click();
  } else await p.locator('#tabnav [data-tab="ajustes"]').click();
  await p.locator('#settingsTabPrefs').click();
}
async function idioma(p) {
  await ajustes(p);
  const language = await p.locator('#idiomaBtn').inputValue();
  await p.locator('#idiomaBtn').selectOption(language === 'en' ? 'es' : 'en');
  await p.locator('#tabnav [data-tab="cabina"]').click();
  await abreCabOps(p);
  await quieto(p);
}

try {
  for (const width of [390, 1320]) {
    const { ctx, p } = await abrir(width);
    const panel = p.locator('#disciplineHome');
    ok(await panel.isVisible(), `${width}px · disciplina visible en Cabina`);
    ok(!/NaN|undefined|Infinity/.test(await panel.innerText()),
      `${width}px · estado vacío sin métricas inválidas`);
    ok(await panel.locator('[data-discipline="no-edge"]').isEnabled(),
      `${width}px · un día sin operaciones permite decidir no operar`);
    await panel.locator('[data-discipline="no-edge"]').click();
    await enDisco(p, d => d?.days?.[HOY]?.closed === true &&
      d.days[HOY]?.processDecision?.kind === 'no_edge');
    const cerrado = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).days['2026-09-17'], CLAVE);
    ok(cerrado.closed && cerrado.processDecision.kind === 'no_edge',
      `${width}px · no operar cierra el día sólo tras la acción explícita`);
    await p.reload();
    await arrancada(p);
    const guardado = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).days['2026-09-17'], CLAVE);
    ok(guardado.processDecision.kind === 'no_edge' && guardado.closed,
      `${width}px · el cierre sin operar sobrevive a recargar`);
    await idioma(p);
    ok((await p.locator('#panelDiscipline').innerText()).includes('Process discipline'),
      `${width}px · cambia a inglés sin recargar`);
    await idioma(p);
    ok((await p.locator('#panelDiscipline').innerText()).includes('Disciplina de proceso'),
      `${width}px · vuelve a español sin modificar los registros`);
    await p.locator('#tabnav [data-tab="futuros"]').click();
    await p.locator('#ftSeg [data-v="resumen"]').click();
    await quieto(p);
    ok(await p.locator('#disciplineFutures').isVisible(),
      `${width}px · la misma disciplina aparece en el resumen de Futuros`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${width}px · sin desbordamiento horizontal`);
    await ctx.close();
  }

  // The form, persistence and rule snapshot must agree after editing context.
  const snapshotData = base();
  snapshotData.settings.accounts = [
    { ...cuenta, rules: { maxContracts: 2, instruments: 'MNQ' } },
    { ...cuenta, id: 'otra-cuenta', name: 'Otra', rules: { maxContracts: 1, instruments: 'MNQ' } },
  ];
  const { ctx: sc, p: sp } = await abrir(1320, snapshotData);
  await sp.locator('#tabnav [data-tab="futuros"]').click();
  await sp.locator('#ftNew').click();
  await sp.locator('#ef_accountId').selectOption(cuenta.id);
  await sp.locator('#ef_instrument').fill('MNQ');
  await sp.locator('#ef_entry').fill('21000');
  await sp.locator('#ef_stop').fill('20980');
  await sp.locator('#ef_exit').fill('21010');
  await sp.locator('#ef_qty').fill('1');
  await sp.locator('#ef_date').fill(HOY);
  await sp.locator('#edSave').click();
  await enDisco(sp, d => Object.values(d.trades || {}).some(t => t.processRules?.maxContracts === 2));
  const nuevo = await sp.evaluate(k => Object.values(JSON.parse(localStorage.getItem(k)).trades)[0], CLAVE);
  ok(nuevo.source === 'manual' && nuevo.processRules.maxContracts === 2 &&
    nuevo.processRules.instruments.join(',') === 'MNQ',
    'el formulario congela los límites de la cuenta correcta al registrar hoy');
  await sp.locator('#ftSeg [data-v="diario"]').click();
  await sp.locator(`#jrTable tr[data-id="${nuevo.id}"] [data-act="edit"]`).click();
  await sp.locator('#ef_exit').fill('21020');
  await sp.locator('#edSave').click();
  await enDisco(sp, d => d.trades?.[Object.keys(d.trades)[0]]?.exit === 21020);
  let conservado = await sp.evaluate(k => Object.values(JSON.parse(localStorage.getItem(k)).trades)[0], CLAVE);
  ok(JSON.stringify(conservado.processRules) === JSON.stringify(nuevo.processRules),
    'editar la salida conserva los límites originales');
  await sp.locator(`#jrTable tr[data-id="${nuevo.id}"] [data-act="edit"]`).click();
  await sp.locator('#ef_accountId').selectOption('otra-cuenta');
  await sp.locator('#edSave').click();
  await enDisco(sp, d => Object.values(d.trades || {}).some(t => t.accountId === 'otra-cuenta' && !t.processRules));
  conservado = await sp.evaluate(k => Object.values(JSON.parse(localStorage.getItem(k)).trades)[0], CLAVE);
  ok(!conservado.processRules, 'cambiar de cuenta invalida el snapshot en vez de atribuir límites ajenos');
  await sp.locator('#ftNew').click();
  await sp.locator('#ef_accountId').selectOption(cuenta.id);
  await sp.locator('#ef_instrument').fill('MNQ');
  await sp.locator('#ef_date').fill('2026-09-16');
  await sp.locator('#edSave').click();
  await enDisco(sp, d => Object.values(d.trades || {}).some(t => t.date === '2026-09-16'));
  const historico = await sp.evaluate(k => Object.values(JSON.parse(localStorage.getItem(k)).trades).find(t => t.date === '2026-09-16'), CLAVE);
  ok(!historico.processRules, 'registrar una operación histórica no le aplica los límites actuales');
  await sc.close();

  const datos = base();
  datos.days['2026-09-15'] = dia('2026-09-15');
  datos.days['2026-09-16'] = dia('2026-09-16');
  datos.days[HOY] = dia(HOY);
  datos.trades.t_privado = { id: 't_privado', type: 'futuros', accountId: cuenta.id,
    instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20980,
    exit: 21617.25, date: HOY, time: '10:00', source: 'import:broker',
    cStruct: true, cPull: true, cWindow: true, cSize: true,
    note: 'NOTA PRIVADA 1729: no debe exportarse', updatedAt: AHORA - 1000 };
  const { ctx, p } = await abrir(390, datos);
  const panel = p.locator('#disciplineHome');
  const noEdge = panel.locator('[data-discipline="no-edge"]');
  ok(await noEdge.count() === 0 || await noEdge.isDisabled(),
    'un día con operaciones no puede declararse sin operar');

  const compartir = panel.locator('[data-discipline="share"]');
  await p.evaluate(() => { window.__disciplinaTextoDibujado = []; });
  await compartir.click();
  const dialogo = p.locator('#disciplineShareOv');
  await dialogo.waitFor({ state: 'visible' });
  await p.waitForFunction(() => {
    const im = document.querySelector('#disciplineShareImage');
    return im && !im.hidden && im.complete && im.naturalWidth > 0;
  });
  const png = await p.locator('#disciplineShareImage').evaluate(im => ({
    src: im.src, ancho: im.naturalWidth, alto: im.naturalHeight,
  }));
  ok(png.src.startsWith('blob:') && png.ancho === 1080 && png.alto === 1160,
    'la vista previa carga la imagen exportada con sus dimensiones reales');
  const contenido = await p.evaluate(() => ({
    modal: document.querySelector('#disciplineShareOv').innerText,
    dibujado: window.__disciplinaTextoDibujado.join('\n'),
  }));
  const privado = /CUENTA PRIVADA|NOTA PRIVADA|1729|1234|1[, .]234|21617|21[, .]617|MNQ|t_privado/i;
  ok(!privado.test(contenido.modal) && !privado.test(contenido.dibujado),
    'la tarjeta y su diálogo excluyen cuenta, notas, instrumento, identificadores y P&L');
  ok(/P&L|resultado|profit|PnL/i.test(contenido.modal + contenido.dibujado),
    'se explica que los resultados económicos están ocultos');
  const descargaPromesa = p.waitForEvent('download', { predicate: d => /\.png$/i.test(d.suggestedFilename()) });
  await p.locator('#disciplineShareDownload').click();
  const descarga = await descargaPromesa;
  const bytes = await readFile(await descarga.path());
  ok(/\.png$/i.test(descarga.suggestedFilename()) &&
    Array.from(bytes.subarray(0, 8)).join(',') === '137,80,78,71,13,10,26,10',
    'la descarga contiene la firma de un PNG real',
    `${descarga.suggestedFilename()} · ${bytes.length} bytes · ${Array.from(bytes.subarray(0, 8)).join(',')}`);
  await p.keyboard.press('n');
  await p.keyboard.press('Control+k');
  ok(await p.locator('#ov').isHidden() && await p.locator('#cmdOv').isHidden(),
    'los atajos no abren otras pantallas mientras se revisa la tarjeta');
  await p.evaluate(() => FUT.updateTrade('t_privado', { note: 'actualización local de prueba' }));
  await quieto(p);
  await p.keyboard.press('Escape');
  ok(await dialogo.isHidden() && await compartir.evaluate(el => el === document.activeElement),
    'Escape devuelve el foco incluso si una actualización reemplazó el botón de origen');

  await p.locator('#tabnav [data-tab="futuros"]').click();
  await p.locator('#ftSeg [data-v="diario"]').click();
  const badge = p.locator('[data-discipline="trade"][data-trade-id="t_privado"]');
  ok((await badge.innerText()).includes('Sin datos suficientes'),
    'una operación importada no recibe estrellas por sus marcas declaradas');
  await badge.click();
  await dialogo.waitFor({ state: 'visible' });
  ok(await p.locator('#disciplineDetailBody').isVisible() &&
    await p.locator('#disciplineShareImage').isHidden(),
  'el detalle explica la evidencia sin presentar una tarjeta anterior');
  await p.locator('#disciplineShareClose').click();
  ok(await dialogo.isHidden(), 'el botón de cierre funciona también en el detalle');

  const antesDemo = await p.evaluate(k => localStorage.getItem(k), CLAVE);
  await ajustes(p);
  await p.locator('#settingsTabPrefs').click();
  await p.locator('#demoToggle').click();
  await p.locator('#settingsDemoEnter').click();
  await p.locator('#demoBar').waitFor({ state: 'visible' });
  await p.locator('#tabnav [data-tab="cabina"]').click();
  await abreCabOps(p);
  await quieto(p);
  const despuesDemo = await p.evaluate(k => localStorage.getItem(k), CLAVE);
  ok(antesDemo === despuesDemo, 'entrar en demo no escribe datos personales');
  ok(!/1729|PRIVAD[AO]/i.test(await p.locator('#disciplineHome').innerText()),
    'el panel demo no revela la información privada del almacenamiento real');
  await ctx.close();
  ok(errores.length === 0, 'ningún error de JavaScript en los flujos de disciplina', errores.join(' | ') || 'ninguno');
} finally {
  await nav.close();
  await new Promise(r => srv.close(r));
}
console.log(`\nfallos: ${fallos.length}`);
for (const f of fallos) console.log('  · ' + f);
process.exitCode = fallos.length ? 1 : 0;
