/* Regresiones observadas en la revisión visual del producto publicado. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { arrancada, quieto } from './espera.mjs';
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
let fallos = 0;
function ok(v, s) { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) fallos++; }
try {
  for (const width of [390, 820, 1366]) {
    const ctx = await browser.newContext({viewport:{width,height:950}});
    await ctx.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${srv.address().port}/`) ? r.continue() : r.abort());
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${srv.address().port}/`);
    await arrancada(p, null);
    async function ir(tab) {
      if (await p.locator(`#tabnav [data-tab="${tab}"]`).isVisible()) await p.locator(`#tabnav [data-tab="${tab}"]`).click();
      else { await p.locator("#mobileMoreBtn").click(); await p.locator(`#mobileMoreOv [data-mobile-more-tab="${tab}"]`).click(); }
      await quieto(p);
    }
    // La navegación principal comparte clases con categorías; no debe desmarcarlas.
    await ir('playbook');
    await quieto(p);
    ok(await p.locator('#pbNav .active').count() === 1, `${width}px · categoría activa al entrar en Estrategias`);
    await p.locator('#pbNav [data-v="opciones"]').click();
    await ir('cabina');
    await ir('playbook');
    ok(await p.locator('#pbNav [data-v="opciones"]').getAttribute('aria-pressed') === 'true' && await p.locator('#pbNav [data-v="opciones"]').evaluate(e=>e.classList.contains('active')), `${width}px · conserva y anuncia categoría al volver`);
    if (width > 700) {
      for (const [tab, id] of [['historial','hsTipo'],['edge','mxAcct'],['invest','ivSetup'],['ideas','idCat']]) {
        await p.locator(`#tabnav [data-tab="${tab}"]`).click();
        const fits = await p.locator('#'+id).evaluate(e=>{
          const c=document.createElement('canvas').getContext('2d'); const s=getComputedStyle(e); c.font=s.font;
          return e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 20 >= c.measureText(e.selectedOptions[0].textContent).width;
        });
        ok(fits, `${width}px · ${tab} muestra el valor completo del filtro inicial`);
      }
    }
    await ir('cuentas');
    await p.locator('[data-open-account]').click();
    ok(await p.locator('#ov').isVisible() && await p.locator('#ef_name').isVisible(), `${width}px · Añadir cuenta abre su editor desde Cuentas vacías`);
    if(await p.locator('#ov').isVisible()) await p.locator('#edCancel').click();
    await ir('calc');
    ok(await p.locator('#calcSeg [data-v="classic"]').getAttribute('aria-pressed') === 'true', `${width}px · calculadora anuncia la vista inicial`);
    await p.locator('#calcSeg [data-v="risk"]').click();
    ok(await p.locator('#calcSeg [data-v="risk"]').getAttribute('aria-pressed') === 'true' && await p.locator('#calcSeg [aria-pressed="true"]').count() === 1, `${width}px · calculadora anuncia el cambio de vista`);
    await p.locator('#quickBtn').click();
    const targets=await p.locator('#qkClose, #qkCal button, #qkTags button').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height >= 43.5));
    ok(targets, `${width}px · controles de registro rápido tienen área táctil de 44px`);
    await p.locator('#qkCancel').click();
    ok(await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1), `${width}px · no desborda la página`);
    await ir('ajustes');
    await p.locator('#settingsTabPrefs').click();
    await p.locator('#demoToggle').click();
    await p.locator('#settingsDemoEnter').click();
    await ir('historial');
    const dateOneLine = await p.locator('#hsTabla tbody tr:first-child td:first-child').evaluate(e=>{
      const r=document.createRange(); r.selectNodeContents(e);
      return r.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight)*1.2;
    });
    ok(dateOneLine, `${width}px · fecha de historial completa en una línea`);
    ok(await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1), `${width}px · la tabla usa su propio scroll`);
    await p.locator('#viewPrefsOpen').click();
    ok(await p.locator('.view-prefs-columns > strong[data-view-tab]').first().getAttribute('data-view-tab') === 'historial', `${width}px · Vista prioriza las columnas de la página actual`);
    ok((await p.locator('#viewPrefsNote').innerText()).startsWith('Pestaña: Historial.'), `${width}px · Vista separa el nombre de página del contador`);
    await p.locator('#viewPrefsDone').click();
    const abrir = p.locator('#hsTabla tbody tr:first-child button[data-hs-open]');
    const accesible = await abrir.count() > 0;
    if (accesible) { await abrir.focus(); await abrir.press('Enter'); }
    ok(accesible && await p.locator('#ov').isVisible(), `${width}px · operación accesible con teclado desde Historial`);
    if(await p.locator('#ov').isVisible()) await p.locator('#edCancel').click();
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r=>srv.close(r)); }
console.log('fallos: '+fallos);
if(fallos)process.exitCode=1;
