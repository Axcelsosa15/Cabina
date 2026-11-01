/* La guía y las pausas son optativas. Se recorren los controles publicados,
   con un almacén vacío y sin red externa: ver ejemplos nunca debe crear una
   cuenta ni registrar operaciones en el espacio real. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';

const AHORA = Date.parse('2026-09-17T14:00:00Z');
const CLAVE = 'cabina-mnq:v1';
const fallos = [];
const errores = [];
let permisosSolicitados = 0;
const ok = (condicion, texto, dato) => {
  console.log(`  ${condicion ? '✅' : '❌'} ${texto}${dato == null ? '' : ' · ' + dato}`);
  if (!condicion) fallos.push(texto);
};
const vacio = () => ({ settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [] }, trades: {}, days: {} });
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();

async function abrir(width, datos = vacio()) {
  const ctx = await nav.newContext({ viewport: { width, height: 950 } });
  await ctx.exposeBinding('__experiencePermissionRequested', () => { permisosSolicitados++; });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    return u.startsWith(origen + '/') || /^(data:|blob:)/.test(u) ? route.continue() : route.abort();
  });
  await ctx.addInitScript(({ ahora }) => {
    // El reloj avanza en pasos de un segundo: los huecos largos no equivalen
    // a actividad y, por diseño, no deben contar para el recordatorio.
    const RealDate = Date;
    window.__experienceNow = ahora;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [window.__experienceNow])); }
      static now() { return window.__experienceNow; }
    };
    const intervalos = new Map();
    const originalSet = window.setInterval.bind(window);
    const originalClear = window.clearInterval.bind(window);
    window.setInterval = (fn, ms, ...args) => {
      const id = originalSet(fn, ms, ...args);
      if (typeof fn === 'function') intervalos.set(id, () => fn(...args));
      return id;
    };
    window.clearInterval = id => { intervalos.delete(id); originalClear(id); };
    window.__advanceExperienceTime = ms => {
      for (let restante = ms; restante > 0;) {
        const paso = Math.min(1000, restante);
        window.__experienceNow += paso;
        for (const tick of [...intervalos.values()]) tick();
        restante -= paso;
      }
    };
    window.__experienceNotificationRequests = 0;
    if (typeof Notification !== 'undefined') {
      Notification.requestPermission = () => {
        window.__experienceNotificationRequests++;
        window.__experiencePermissionRequested();
        return Promise.resolve('denied');
      };
    }
  }, { ahora: AHORA });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await siembra(p, origen + '/', datos);
  await arrancada(p, null);
  await p.bringToFront();
  return { ctx, p };
}

async function ajustes(p) {
  if (await p.locator('#mobileMoreBtn').isVisible()) {
    await p.locator('#mobileMoreBtn').click();
    await p.locator('#mobileMoreOv [data-mobile-more-tab="ajustes"]').click();
  } else await p.locator('#tabnav [data-tab="ajustes"]').click();
  await quieto(p);
}
async function registros(p) {
  return p.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k) || '{}');
    return JSON.stringify({ accounts: d.settings?.accounts || [], trades: d.trades || {}, days: d.days || {} });
  }, CLAVE);
}
async function avanzar(p, ms) {
  await p.evaluate(t => window.__advanceExperienceTime(t), ms);
  await quieto(p);
}
async function contextoPestana(p, contexto) {
  /* El Chromium sin interfaz de Playwright mantiene hasFocus()=true y la
     visibilidad en "visible" en ambas pestañas, incluso desactivando su
     emulación de foco y pulsando un input en la segunda. Por eso este tramo
     comprueba explícitamente el ADAPTADOR con señales DOM controladas, no la
     integración del navegador con el sistema operativo. El reloj y su estado
     no se sustituyen. La comprobación nativa corresponde a la revisión visual. */
  await p.evaluate(c => {
    if (c) {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => c.focus });
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: c.visible ? 'visible' : 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, value: !c.visible });
    } else {
      delete document.hasFocus;
      delete document.visibilityState;
      delete document.hidden;
    }
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(document.hasFocus() ? 'focus' : 'blur'));
  }, contexto);
  await quieto(p);
}

try {
  for (const width of [390, 1320]) {
    const { ctx, p } = await abrir(width);
    const guia = p.locator('#guideOv');
    ok(await guia.isHidden(), `${width}px · la guía no se abre por sorpresa`);
    ok(await p.locator('#guideWelcome').isVisible(), `${width}px · la bienvenida ofrece una guía sin cuenta`);
    const antes = await registros(p);
    await p.locator('#guideWelcome').click();
    await guia.waitFor({ state: 'visible' });
    const dialogoGuia = guia.locator('[role="dialog"]');
    ok(await dialogoGuia.getAttribute('aria-modal') === 'true' &&
      await dialogoGuia.getAttribute('aria-labelledby') === 'guideTitle',
      `${width}px · la guía se presenta como diálogo accesible`);
    const focoDentro = await guia.evaluate(el => el.contains(document.activeElement));
    ok(focoDentro, `${width}px · al abrir la guía el foco entra en el diálogo`);
    // Recorrer desde ambos extremos verifica que Tab no alcance controles
    // financieros detrás del diálogo, aunque cambie el orden de sus botones.
    const extremos = await guia.evaluate(el => {
      const elementos = [...el.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')]
        .filter(n => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length);
      const primero = elementos[0], ultimo = elementos.at(-1);
      ultimo?.focus();
      return { primero: primero?.id, ultimo: ultimo?.id };
    });
    await p.keyboard.press('Tab');
    ok(await p.evaluate(id => document.activeElement?.id === id, extremos.primero),
      `${width}px · Tab vuelve al primer control del diálogo`);
    await p.keyboard.press('Shift+Tab');
    ok(await p.evaluate(id => document.activeElement?.id === id, extremos.ultimo),
      `${width}px · Shift+Tab vuelve al último control del diálogo`);
    await p.keyboard.press('n');
    await p.keyboard.press('Control+k');
    ok(await p.locator('#ov').isHidden() && await p.locator('#cmdOv').isHidden(),
      `${width}px · los atajos no abren editores detrás de la guía`);
    await p.keyboard.press('Escape');
    ok(await guia.isHidden() && await p.locator('#guideWelcome').evaluate(el => el === document.activeElement),
      `${width}px · Escape cierra y devuelve el foco a la bienvenida`);

    await ajustes(p);
    await p.locator('#guideOpen').click();
    await guia.waitFor({ state: 'visible' });
    const espanol = await p.locator('#guideTitle').innerText();
    const cuerpoEspanol = await p.locator('#guideBody').innerText();
    await p.locator('#guideLanguage').click();
    const ingles = await p.locator('#guideTitle').innerText();
    ok(ingles.trim() !== '' && ingles !== espanol &&
      await p.locator('#guideBody').innerText() !== cuerpoEspanol,
      `${width}px · cambia a inglés dentro del mismo paso`);
    ok(!/undefined|NaN/.test(await p.locator('#guideBody').innerText()),
      `${width}px · el contenido traducido no muestra valores inválidos`);
    await p.locator('#guideLanguage').click();
    ok(await p.locator('#guideTitle').innerText() === espanol,
      `${width}px · vuelve a español sin reiniciar la guía`);
    await p.locator('#guideReal').click();
    await p.locator('#guideBack').waitFor({ state: 'visible' });
    ok(await registros(p) === antes, `${width}px · continuar con registros no inventa cuentas ni operaciones`);
    await p.locator('#guideBack').click();
    await p.locator('#guideClose').click();
    await p.locator('#tabnav [data-tab="cabina"]').click();
    await p.locator('#guideWelcome').click();
    await p.locator('#guideDemo').click();
    await quieto(p);
    ok(await p.locator('#demoBar').isVisible(), `${width}px · los ejemplos abren el modo demo identificado`);
    ok(await registros(p) === antes, `${width}px · los ejemplos no escriben en el journal real`);
    await p.keyboard.press('Escape');
    const retornoDemo = await p.evaluate(() => ({
      foco: document.activeElement?.id,
      origen: document.querySelector('#guideWelcome')?.getClientRects().length,
      salida: document.querySelector('#demoExit')?.getClientRects().length,
    }));
    const destino = await p.locator('#guideWelcome').isVisible() ? 'guideWelcome' : 'demoExit';
    const focoVisible = await guia.isHidden() && await p.locator('#' + destino).isVisible() && retornoDemo.foco === destino;
    ok(focoVisible, `${width}px · cerrar desde ejemplos devuelve el foco al origen visible o su salida alternativa`,
      focoVisible ? destino : JSON.stringify(retornoDemo));
    await ajustes(p);
    await p.locator('#guideOpen').click();
    await p.locator('#guideDemo').click();
    await p.locator('#guideNext').click();
    await p.locator('#guideFinish').waitFor({ state: 'visible' });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${width}px · la guía cabe sin desbordamiento horizontal`);
    await p.locator('#guideFinish').click();
    await guia.waitFor({ state: 'hidden' });
    await p.locator('#demoBar').waitFor({ state: 'hidden' });
    await arrancada(p, null);
    ok(await registros(p) === antes, `${width}px · finalizar restaura el espacio real sin crear datos financieros`);
    ok(await p.locator('#demoBar').isHidden(), `${width}px · finalizar sale de los ejemplos`);
    ok(await p.evaluate(() => !!localStorage.getItem('cabina:guia:v1')),
      `${width}px · completar guarda sólo la preferencia local de la guía`);
    await p.reload();
    await arrancada(p, null);
    ok(await guia.isHidden(), `${width}px · completar y recargar no abre la guía automáticamente`);
    await ajustes(p);
    await p.locator('#guideOpen').click();
    ok(await guia.isVisible(), `${width}px · la guía se puede reabrir desde ajustes sin tener cuenta`);
    await p.locator('#guideClose').click();
    await ctx.close();
  }

  const guardado = vacio();
  guardado.settings.accounts = [{ id: 'prueba-preservada', name: 'Cuenta de prueba',
    size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] }];
  guardado.trades.t_prueba = { id: 't_prueba', type: 'futuros', accountId: 'prueba-preservada',
    instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, stop: 20980,
    exit: 21010, date: '2026-09-16', time: '10:00', source: 'manual', updatedAt: AHORA - 1000 };
  guardado.days['2026-09-16'] = { date: '2026-09-16', note: 'Reflexión guardada de prueba',
    closed: true, broke: false, updatedAt: AHORA - 1000 };
  const previo = await abrir(1320, guardado);
  const originales = await registros(previo.p);
  await ajustes(previo.p);
  await previo.p.locator('#guideOpen').click();
  await previo.p.locator('#guideDemo').click();
  await previo.p.locator('#guideNext').click();
  await previo.p.locator('#guideFinish').click();
  await previo.p.locator('#guideOv').waitFor({ state: 'hidden' });
  await previo.p.locator('#demoBar').waitFor({ state: 'hidden' });
  await arrancada(previo.p, null);
  ok(await registros(previo.p) === originales,
    'finalizar el recorrido demo conserva cuentas, operaciones y reflexiones ya guardadas');
  await previo.ctx.close();

  const { ctx, p } = await abrir(1320);
  await ajustes(p);
  ok(!await p.locator('#breakEnabled').isChecked() && await p.locator('#breakNotice').isHidden(),
    'las pausas están desactivadas por defecto y no muestran un aviso');
  await avanzar(p, 35 * 60 * 1000);
  ok(await p.locator('#breakNotice').isHidden(), 'pasar tiempo no activa recordatorios sin consentimiento');
  await p.locator('#breakLimit').selectOption('30');
  await p.locator('#breakEnabled').check();
  await avanzar(p, 5 * 60 * 1000);
  await contextoPestana(p, { focus: false, visible: true });
  await avanzar(p, 31 * 60 * 1000);
  ok(await p.locator('#breakNotice').isHidden(),
    'el adaptador excluye el tiempo sin foco · contexto DOM controlado');
  await contextoPestana(p, { focus: true, visible: false });
  await avanzar(p, 31 * 60 * 1000);
  ok(await p.locator('#breakNotice').isHidden(),
    'el adaptador excluye el tiempo oculto · contexto DOM controlado');
  await contextoPestana(p, null);
  await avanzar(p, 24 * 60 * 1000);
  ok(await p.locator('#breakNotice').isHidden(), 'el recordatorio respeta los minutos elegidos');
  await avanzar(p, 90 * 1000);
  await p.locator('#breakNotice').waitFor({ state: 'visible' });
  ok(await p.locator('#breakNotice').isVisible(), 'la pestaña activa muestra un aviso al alcanzar el límite');
  ok(!/urgente|última oportunidad|opera ahora|last chance|trade now/i.test(await p.locator('#breakNotice').innerText()),
    'el recordatorio usa lenguaje de descanso sin presión para operar');
  await p.locator('#breakDismiss').click();
  ok(await p.locator('#breakNotice').isHidden(), 'el aviso se puede descartar');
  await p.reload();
  await arrancada(p, null);
  await p.bringToFront();
  await ajustes(p);
  ok(await p.locator('#breakEnabled').isChecked() && await p.locator('#breakLimit').inputValue() === '30',
    'activar pausas y elegir su duración persiste al recargar');
  ok(await p.locator('#breakNotice').isHidden(), 'descartar conserva el silencio durante el mismo día tras recargar');
  await p.locator('#idiomaBtn').click();
  ok(/minute|session|pause|break|active/i.test(await p.locator('#breakStatus').innerText()),
    'el estado de pausas cambia al inglés inmediatamente');
  await p.locator('#idiomaBtn').click();
  ok(!/undefined|NaN|Infinity/.test(await p.locator('#breakStatus').innerText()),
    'el estado de pausas vuelve al español sin valores inválidos');
  // Desactivar elimina el agregado diario; una activación nueva comienza un
  // recorrido nuevo. Sin ello el descarte anterior debe seguir silenciado.
  await p.locator('#breakEnabled').uncheck();
  await p.locator('#breakEnabled').check();
  await avanzar(p, 31 * 60 * 1000);
  await p.locator('#breakNotice').waitFor({ state: 'visible' });
  await p.locator('#breakDisable').click();
  ok(!await p.locator('#breakEnabled').isChecked() && await p.locator('#breakNotice').isHidden(),
    'desactivar desde el aviso apaga el recordatorio y actualiza ajustes');
  await p.reload();
  await arrancada(p, null);
  await ajustes(p);
  ok(!await p.locator('#breakEnabled').isChecked(), 'desactivar se conserva al recargar');
  ok(permisosSolicitados === 0,
    'ningún flujo solicita permisos de notificaciones del navegador');
  await ctx.close();
  ok(errores.length === 0, 'ningún error de JavaScript en la guía ni en las pausas', errores.join(' | ') || 'ninguno');
} finally {
  await nav.close();
  await new Promise(r => srv.close(r));
}
console.log(`\nfallos: ${fallos.length}`);
for (const f of fallos) console.log('  · ' + f);
process.exitCode = fallos.length ? 1 : 0;
