/* Cabina 2.0: remove redundant visible copy without losing route, data or guidance. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
const fail = [], errors = [];
const check = (ok, name, extra='') => {
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (extra ? ' · '+extra : ''));
  if (!ok) fail.push(name);
};
const tabs=['cabina','futuros','cuentas','edge','invest','historial','playbook','ideas','estudio','calc','ajustes'];
const server=sirvePublicado();
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch();
try {
  for (const width of [1440,390]) {
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.waitForFunction(()=>typeof window.FUT !== 'undefined',{},{timeout:20000});
    const init=await page.evaluate(()=>{
      const decks=[...document.querySelectorAll('.tab > .deck')];
      const details=[...document.querySelectorAll('details.cab-why')];
      return {
        num:decks.length, numbers:decks.filter(d=>d.querySelector('.deck-n')).length,
        stages:decks.filter(d=>d.querySelector('.deck-stage')).length,
        captions:decks.filter(d=>d.closest('.tab')?.dataset.tab!=='estudio' && d.querySelector('.deck-parts')).length,
        study:document.getElementById('studyTotal')!==null,
        descriptions:details.length,closed:details.every(d=>!d.open),
        styleCount:document.querySelectorAll('style').length
      };
    });
    check(init.num===11&&init.numbers===0&&init.stages===0&&init.captions===0&&init.study,
      width+'px · eleven clean page headings and real Study counters',JSON.stringify(init));
    check(init.descriptions===10&&init.closed&&init.styleCount===5,
      width+'px · ten optional explanations, no extra CSS layer');
    if(width===1440){
      for(const tab of tabs){
        await page.locator('#tabnav > .tabbtn[data-tab="'+tab+'"]').click();
        const value=await page.evaluate(tab=>{
          const area=document.querySelector('.tab[data-tab="'+tab+'"]');
          const head=area?.querySelector('.deck .deck-t');
          return {active:area?.classList.contains('active'),
            title:head?.textContent.trim(),visible:head?getComputedStyle(head).display!=='none':false};
        },tab);
        check(!!value.active&&!!value.title&&value.visible,width+'px · '+tab+' heading retained');
      }
    } else {
      await page.locator('#tabnav .tabbtn[data-tab="cabina"]').click();
      const info=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        deck:document.querySelector('.tab[data-tab="cabina"] .deck').getBoundingClientRect().width,
        viewport:innerWidth
      }));
      check(!info.overflow&&info.deck<=info.viewport,width+'px · compact header without horizontal overflow');
      await page.locator('#mobileMoreBtn').click();
      await page.locator('#mobileMoreOv [data-mobile-more-tab="edge"]').click();
    }
    // An explanatory paragraph should be collapsed, recoverable and keyboard accessible.
    await page.locator('#tabnav .tabbtn[data-tab="cabina"]').click();
    const why=page.locator('details.cab-why').first();
    check(await why.count()===1&&await why.getAttribute('open')===null,
      width+'px · help text collapsed by default');
    await why.locator('summary').click();
    check(await why.evaluate(el=>el.open&&!!el.querySelector('p')&&el.querySelector('p').textContent.length>20),
      width+'px · original teaching content readable on demand');
    await ctx.close();
  }
  check(errors.length===0,'no browser JS errors',errors.join(' | '));
} finally {
  await browser.close();
  await new Promise(done=>server.close(done));
}
console.log('fallos: '+fail.length);
if(fail.length)process.exit(1);
console.log('PASS ui-sin-ruido');
