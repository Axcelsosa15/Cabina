/* DOS DEFECTOS DEL LIENZO DE RESUMEN, los dos medidos antes de arreglarlos.
 *
 * §1 · Un panel OCULTO no debe mover a los visibles. `captureCanvas` mide con
 *      getBoundingClientRect, y un panel con display:none devuelve ceros. Eso
 *      no produce una caja vacía: produce una de 3x6 en (0,0), porque `w` cae a
 *      su mínimo y `h` sale de Math.max(0, 0, 260). Como el empaquetado ordena
 *      por `y`, esos fantasmas se colocaban LOS PRIMEROS y empujaban hacia
 *      abajo a los paneles de verdad. Abrir el editor por primera vez después
 *      de ocultar algo reescribía posiciones que el usuario nunca eligió.
 *
 * §2 · «Restaurar esta pantalla» no debe borrar lo COMPARTIDO. El botón
 *      borraba `page.workspace` —la distribución por zonas, común a móvil y
 *      escritorio— mientras el mensaje prometía que sólo tocaba esta pantalla.
 *
 * Los dos los encontró Cursor Bugbot en el PR #145 y los dos se verificaron
 * leyendo el código antes de aceptarlos; el PR se mergeó sin arreglarlos.
 */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const CLAVE = 'cabina-view-prefs:v1';
const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));

  const arranca = async () => {
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  };
  const limpia = async () => { await page.evaluate(k => localStorage.removeItem(k), CLAVE); };
  const lienzoGuardado = () => page.evaluate(k => {
    const p = JSON.parse(localStorage.getItem(k) || '{}');
    const c = p.pages?.cabina?.canvas || {};
    const device = Object.keys(c)[0];
    return device ? { device, items: c[device] } : null;
  }, CLAVE);
  /* Abre el editor —que es quien llama a captureCanvas cuando no hay lienzo
     guardado— y guarda, para poder leer la geometría que capturó. */
  const capturaYGuarda = async () => {
    await page.locator('#cabCanvasEdit').click();
    await page.locator('#cabCanvasSave').click();
    await page.waitForTimeout(150);
    return lienzoGuardado();
  };

  console.log('\n═══ §1 · UN PANEL OCULTO NO EMPUJA A LOS VISIBLES ═══');

  /* QUÉ SE COMPARA, y por qué no lo evidente. La primera versión de esta
     sección comparaba las posiciones capturadas con y sin un panel oculto, y
     salía roja por un motivo legítimo: ocultar un panel hace que los de abajo
     SUBAN en la página, así que su posición medida cambia de verdad. Eso no es
     el defecto.
     Tampoco sirve exigir que lo capturado coincida con lo medido: el
     empaquetado resuelve solapes entre los propios paneles visibles y desplaza
     a siete de ellos incluso sin nada oculto (panelCheck +4, panelRules +4…).
     Lo que el defecto SÍ produce es desplazamiento ADICIONAL: los fantasmas de
     3x6 en (0,0) ocupan sitio y el bucle baja a los de verdad. Así que se mide
     el desplazamiento de cada panel respecto a su propia medida —capturado
     menos medido— y se exige que ocultar otro panel no lo cambie. Los empujes
     legítimos se cancelan y queda sólo el efecto de los fantasmas. */
  const medidas = () => page.evaluate(() => {
    const cab = document.querySelector('.cab-workspace');
    const bounds = cab.getBoundingClientRect();
    return [...document.querySelectorAll('.cab-workspace .panel')].map(el => {
      const r = el.getBoundingClientRect();
      return { id: el.id, oculto: el.classList.contains('user-view-hidden'),
               y: Math.max(0, Math.round((r.top - bounds.top) / 52)) };
    });
  });
  const desplazamientos = async () => {
    const antes = Object.fromEntries((await medidas()).map(m => [m.id, m]));
    const cap = await capturaYGuarda();
    const out = {};
    for (const item of cap?.items || []) {
      const m = antes[item.id];
      if (m && !m.oculto) out[item.id] = item.y - m.y;
    }
    return { out, cap };
  };

  await arranca(); await limpia(); await arranca();
  const refer = await desplazamientos();
  ok(Object.keys(refer.out).length > 1, 'hay una referencia con todos los paneles visibles',
     `${Object.keys(refer.out).length} paneles · desplazamientos ${JSON.stringify(refer.out)}`);

  await limpia(); await arranca();
  await page.click('#viewPrefsOpen');
  await page.waitForSelector('#viewPrefs:not([hidden])');
  await page.locator('#viewPrefsList input[aria-label*="Últimas 14 sesiones"]').uncheck();
  await page.locator('#viewPrefsDone').click();
  await page.waitForTimeout(200);
  ok(await page.locator('#panelHist').evaluate(el => el.classList.contains('user-view-hidden')),
     'el panel queda oculto antes de abrir el editor');
  const conOculto = await desplazamientos();

  const peores = Object.keys(refer.out)
    .filter(id => id !== 'panelHist' && conOculto.out[id] !== undefined)
    .filter(id => conOculto.out[id] !== refer.out[id]);
  ok(peores.length === 0, 'ocultar un panel no añade desplazamiento a los visibles',
     peores.length ? peores.slice(0, 4).map(id => `${id} ${refer.out[id]}→${conOculto.out[id]}`).join(' · ')
                   : `${Object.keys(conOculto.out).length} paneles con el mismo desplazamiento que sin ocultar nada`);

  /* Y el oculto va DEBAJO: si vuelve a mostrarse debe tener hueco propio. */
  const fantasma = (conOculto.cap?.items || []).find(i => i.id === 'panelHist');
  const fondo = (conOculto.cap?.items || []).filter(i => i.id !== 'panelHist').reduce((m, i) => Math.max(m, i.y), 0);
  ok(!!fantasma && fantasma.y >= fondo, 'el panel oculto se coloca debajo de los visibles',
     fantasma ? `oculto y=${fantasma.y} · visible más bajo y=${fondo}` : 'no aparece');

  console.log('\n═══ §2 · RESTABLECER «ESTA PANTALLA» NO BORRA LO COMPARTIDO ═══');

  await limpia();
  await page.evaluate(k => {
    const p = JSON.parse(localStorage.getItem(k) || '{}');
    p.pages = p.pages || {}; p.pages.cabina = p.pages.cabina || {};
    p.pages.cabina.workspace = [['panelRules', 'panelHist'], ['panelAccts']];
    localStorage.setItem(k, JSON.stringify(p));
  }, CLAVE);
  await arranca();

  await page.locator('#cabCanvasEdit').click();
  await page.locator('#cabCanvasSave').click();
  await page.waitForTimeout(150);
  ok(!!(await lienzoGuardado()), 'hay un lienzo guardado para esta pantalla');

  await page.locator('#cabCanvasEdit').click();
  await page.locator('#cabCanvasReset').click();
  await page.waitForTimeout(200);

  const tras = await page.evaluate(k => {
    const p = JSON.parse(localStorage.getItem(k) || '{}');
    return { workspace: p.pages?.cabina?.workspace || null, canvas: p.pages?.cabina?.canvas || {} };
  }, CLAVE);
  ok(JSON.stringify(tras.workspace) === JSON.stringify([['panelRules', 'panelHist'], ['panelAccts']]),
     'la distribución por zonas, que es compartida, sobrevive al restablecimiento',
     `workspace=${JSON.stringify(tras.workspace)}`);
  ok(Object.keys(tras.canvas).length === 0, 'y el lienzo de esta pantalla sí se borra',
     `canvas=${JSON.stringify(Object.keys(tras.canvas))}`);

  const msg = (await page.locator('#cabCanvasStatus').textContent() || '').trim();
  ok(/zonas no se toca/.test(msg), 'el mensaje dice lo que de verdad ha hecho', `«${msg.slice(0, 70)}»`);

  ok(errores.length === 0, 'la página no lanzó errores', errores.slice(0, 2).join(' · ') || 'ninguno');
} finally {
  await browser.close(); server.close();
}
console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nsin fallos');
process.exit(fallos.length ? 1 : 0);
