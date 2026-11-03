/* Recorridos de teclado y confirmaciones entre registros. Sólo datos sintéticos. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';
const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
const ok = (v, label) => { console.log(`  ${v ? '✅' : '❌'} ${label}`); if (!v) failures++; };
try {
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({viewport:{width,height:950}});
    await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await siembra(p, base, {settings:{...structuredClone(CONFIG_PRUEBA),accounts:[]},trades:{},days:{},
      ideas:{a:{id:'a',name:'IDEA A',status:'idea'},b:{id:'b',name:'IDEA B',status:'idea'}},
      research:{r:{id:'r',title:'Documento de prueba',type:'concept',question:'Resumen de ejemplo',status:'todo'}}});
    await arrancada(p, null);
    async function ir(tab) {
      const b=p.locator(`#tabnav [data-tab="${tab}"]`);
      if(await b.isVisible()) await b.click();
      else { await p.locator('#mobileMoreBtn').click(); await p.locator(`[data-mobile-more-tab="${tab}"]`).click(); }
      await quieto(p);
    }
    await ir('ideas');
    await p.locator('#idNew').click();
    await p.locator('#edSave').focus(); await p.keyboard.press('Tab');
    ok(await p.evaluate(()=>document.activeElement.id==='edClose'), `${width}px · Tab desde Guardar vuelve al primer control del editor`);
    await p.locator('#edClose').focus(); await p.keyboard.press('Shift+Tab');
    ok(await p.evaluate(()=>document.activeElement.id==='edSave'), `${width}px · Shift+Tab permanece dentro del editor`);
    await p.keyboard.press('Escape');
    ok(await p.evaluate(()=>!document.getElementById('ov').classList.contains('open') && document.activeElement.id==='idNew'), `${width}px · Escape devuelve el foco al acceso del editor`);
    await p.locator('#idCards [data-id="a"] [data-act="edit"]').click();
    await p.locator('#edDelete').click();
    await p.locator('#edCancel').click();
    await p.locator('#idCards [data-id="b"] [data-act="edit"]').click();
    ok(await p.locator('#edDelete').getAttribute('data-armed') !== '1' && await p.locator('#edDelete').innerText()==='Borrar', `${width}px · otro registro exige una confirmación de borrado nueva`);
    await p.locator('#edDelete').click();
    ok(await p.locator('#idCards .card').count()===2 && await p.locator('#ov').isVisible(), `${width}px · la primera pulsación en el segundo registro no lo borra`);
    let expired=false,removed=false;
    if(await p.locator('#ov').isVisible()) {
      await p.waitForFunction(()=>document.getElementById('edDelete').dataset.armed!=='1');
      expired=await p.locator('#edDelete').innerText()==='Borrar';
      await p.locator('#edDelete').click(); await p.locator('#edDelete').click();
      removed=await p.locator('#idCards [data-id="a"]').count()===1 && await p.locator('#idCards [data-id="b"]').count()===0;
    }
    ok(expired, `${width}px · la confirmación caduca y recupera su etiqueta`);
    ok(removed, `${width}px · confirmar borra sólo el registro elegido`);
    if(await p.locator('#ov').isVisible()) await p.locator('#edCancel').click();
    await ir('estudio');
    await p.locator('[data-study-read="r"]').click();
    ok(await p.evaluate(()=>document.getElementById('studyReader').contains(document.activeElement)), `${width}px · abrir lectura coloca el foco dentro`);
    await p.locator('#studyReaderEdit').focus(); await p.keyboard.press('Tab');
    ok(await p.evaluate(()=>document.activeElement.id==='studyReaderClose'), `${width}px · lectura mantiene el ciclo de teclado`);
    await p.keyboard.press('Escape');
    ok(await p.evaluate(()=>!document.getElementById('studyReader').classList.contains('open') && document.activeElement.dataset.studyRead==='r'), `${width}px · Escape cierra lectura y devuelve el foco`);
    if(await p.locator('#studyReader').isVisible()) await p.locator('#studyReaderClose').click();
    await p.locator('[data-study-read="r"]').click();
    await p.locator('#studyReaderEdit').click();
    ok(await p.evaluate(()=>document.getElementById('studyModal').classList.contains('open') && !document.getElementById('studyReader').classList.contains('open')), `${width}px · lectura pasa a edición sin superponer diálogos`);
    await p.keyboard.press('Escape');
    ok(await p.evaluate(()=>document.activeElement.dataset.studyRead==='r'), `${width}px · cancelar la edición devuelve al acceso original de lectura`);
    await p.locator('#studyNew').click();
    await p.locator('#studyForm button[type="submit"]').focus(); await p.keyboard.press('Tab');
    ok(await p.evaluate(()=>document.activeElement.id==='studyClose'), `${width}px · editor de Estudio conserva el foco`);
    await p.locator('#studyCancel').click();
    ok(await p.evaluate(()=>document.activeElement.id==='studyNew'), `${width}px · cancelar documento nuevo devuelve el foco`);
    ok(errors.length===0, `${width}px · sin excepciones JavaScript`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
console.log('fallos: '+failures);
if(failures) process.exitCode=1;
