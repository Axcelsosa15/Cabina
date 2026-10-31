/* Cabina 2.0 · Typography and numeric education.
   Real browser, real filters and renderEdge; never writes to user cloud data. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
const failures = [], pageErrors = [];
const check = (ok, name, detail = '') => {
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (detail ? ' · ' + detail : ''));
  if (!ok) failures.push(name);
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  for (const scenario of [
    {theme:'light',lang:'es',width:1280},
    {theme:'dark',lang:'en',width:390}
  ]) {
    const ctx = await browser.newContext({
      viewport: {width:scenario.width,height:920}, reducedMotion:'reduce'
    });
    await ctx.addInitScript(values => {
      localStorage.setItem('cabina-appearance:v1', JSON.stringify({mode:values.theme,accent:'default',custom:'#1d4ed8'}));
      localStorage.setItem('cabina:idioma:v1', values.lang);
    }, scenario);
    const page = await ctx.newPage();
    page.on('pageerror',err=>pageErrors.push(err.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/', {waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.FUT !== 'undefined',null,{timeout:20000});
    const gotoEdge = async () => {
      if (scenario.width < 701) {
        await page.locator('#mobileMoreBtn').click();
        await page.locator('#mobileMoreOv [data-mobile-more-tab="edge"]').click();
      } else await page.locator('#tabnav .tabbtn[data-tab="edge"]').click();
    };
    await gotoEdge();
    await page.waitForFunction(()=>document.getElementById('mxLearnPanel') &&
      document.getElementById('mxLearnSample').textContent.length > 0);
    const prefix = scenario.theme + '/' + scenario.lang + '/' + scenario.width;
    const initial = await page.evaluate(() => ({
      section: !!document.querySelector('#mxLearnPanel'),
      buttons: [...document.querySelectorAll('#mxLearnPanel [data-learn-topic]')].map(el=>el.dataset.learnTopic),
      value: document.getElementById('mxLearnValue').textContent,
      warning: document.getElementById('mxLearnCaution').textContent,
      heading: document.getElementById('mxLearnHeading').textContent,
      sampled: document.getElementById('mxLearnSample').textContent,
      titleSize: parseFloat(getComputedStyle(document.querySelector('.tab[data-tab="edge"] .deck-t')).fontSize),
      labelSize: parseFloat(getComputedStyle(document.querySelector('.tab[data-tab="edge"] .qec .qk')).fontSize),
      headerSize: parseFloat(getComputedStyle(document.querySelector('.tab[data-tab="edge"] .panel > header h2')).fontSize),
      guideGrid: getComputedStyle(document.querySelector('#mxLearnPanel .mx-learn-layout')).gridTemplateColumns
    }));
    check(initial.section && initial.buttons.join(',') === 'expectancy,pf,winrate,drawdown',
      prefix + ' · four native metric selectors');
    check(initial.value === '—' && /0\/30/.test(initial.sampled) && /30/.test(initial.warning),
      prefix + ' · no fake zero or confirmed edge with no closed trades');
    check(initial.titleSize >= 20 && initial.headerSize >= 12 && initial.labelSize >= 12,
      prefix + ' · readable heading and data labels',
      JSON.stringify([initial.titleSize,initial.headerSize,initial.labelSize]));
    check(initial.heading === (scenario.lang === 'en' ? 'Understand your numbers' : 'Entiende tus números'),
      prefix + ' · bilingual guide');
    if (scenario.width < 701) check(initial.guideGrid.split(' ').length === 1,
      prefix + ' · single-column reading layout on mobile', initial.guideGrid);

    await page.evaluate(async () => {
      await FUT.createTrade({date:'2026-10-29',time:'09:31',type:'futuros',instrument:'MNQ',direction:'long',qty:1,entry:21000,stop:20990,exit:21010});
      await FUT.createTrade({date:'2026-10-30',time:'09:45',type:'futuros',instrument:'MNQ',direction:'long',qty:1,entry:21000,stop:20990,exit:20990});
    });
    await page.waitForFunction(()=>FUT.trades().length === 2);
    await page.locator('#tabnav .tabbtn[data-tab="cabina"]').click();
    await gotoEdge();
    await page.waitForFunction(()=>/2\/30/.test(document.getElementById('mxLearnSample').textContent));
    const expectation = await page.evaluate(() => ({
      guide: document.getElementById('mxLearnValue').textContent,
      card: document.querySelector('#mxEdge .qec[data-k="expectancy"] .qv')?.textContent,
      caution: document.getElementById('mxLearnCaution').textContent,
      formula: document.getElementById('mxLearnFormula').textContent
    }));
    check(expectation.guide === expectation.card && expectation.guide !== '—' &&
      /30/.test(expectation.caution) && /W:/.test(expectation.formula),
      prefix + ' · guidance reuses actual expectancy card and sample warning',
      expectation.guide + ' / ' + expectation.card);

    for (const topic of ['pf','winrate','drawdown']) {
      await page.locator('#mxLearnPanel [data-learn-topic="'+topic+'"]').click();
      const state = await page.evaluate(topic => ({
        pressed: [...document.querySelectorAll('#mxLearnPanel [aria-pressed="true"]')].map(x=>x.dataset.learnTopic),
        value: document.getElementById('mxLearnValue').textContent,
        formula: document.getElementById('mxLearnFormula').textContent,
        card: document.querySelector('#mxEdge .qec[data-k="'+(topic==='drawdown'?'mdd':topic)+'"] .qv')?.textContent
      }),topic);
      check(state.pressed.length === 1 && state.pressed[0] === topic &&
        state.formula.length > 40, prefix + ' · ' + topic + ' explains the selected indicator');
      if (topic === 'winrate') check(state.value === state.card,
        prefix + ' · displayed win rate equals Edge source', state.value+'/'+state.card);
      if (topic === 'drawdown' && state.value === '—')
        check(state.formula.includes('—'),prefix+' · missing capital never becomes 0%');
    }
    if (scenario.width < 701) {
      const size = await page.evaluate(() => ({
        scroll: document.querySelector('#mxLearnPanel').scrollWidth,
        width: document.querySelector('#mxLearnPanel').clientWidth,
        tap: Math.min(...[...document.querySelectorAll('#mxLearnPanel [data-learn-topic]')]
          .map(b=>b.getBoundingClientRect().height))
      }));
      check(size.scroll <= size.width + 1 && size.tap >= 44,
        prefix + ' · no panel overflow and accessible touch targets',JSON.stringify(size));
    }
    await ctx.close();
  }
  check(pageErrors.length === 0,'no JS page errors',pageErrors.join(' | '));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log('fallos: '+failures.length);
if (failures.length) process.exit(1);
console.log('PASS metricas-lectura');
