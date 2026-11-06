/* Visual themes v2 — real app smoke tests, no Supabase credentials. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const appearance = readFileSync(join(root, 'appearance.js'), 'utf8');
const cascadeEnd = html.lastIndexOf('/* Final opt-in visual theme layer: after legacy tab-specific CSS. */');
const legacyStart = html.indexOf('/* Dashboard operativo v1');
if (!(cascadeEnd > legacyStart && cascadeEnd < html.lastIndexOf('</style>'))) {
  throw new Error('Theme overrides must follow legacy dashboard CSS in final style block');
}
if ((html.match(/<style\\b/g) || []).length !== 5) {
  throw new Error('Expected exactly five style blocks');
}
if (!['midnight','navy','forest'].every(t => appearance.includes(t+': {'))) {
  throw new Error('Missing one or more visual palettes');
}
const server = sirvePublicado(html);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const failures = [];
function check(ok, label) { console.log((ok?'PASS ':'FAIL ') + label);if(!ok) failures.push(label); }
try {
  for (const [name,bg] of [['midnight','#0b0b0c'],['navy','#14213d'],['forest','#1f3d2b']]) {
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await context.addInitScript(theme => {
      localStorage.setItem('cabina-appearance:v1',JSON.stringify({mode:'dark',accent:'default',atmosphere:theme}));
    },name);
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    const initial=await page.evaluate(()=>({
      theme:document.documentElement.dataset.cabinaVisualTheme,
      bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      mode:document.documentElement.dataset.cabinaTheme,
      overflow:document.documentElement.scrollWidth>innerWidth+1
    }));
    check(initial.theme===name&&initial.bg===bg&&initial.mode==='dark',name+' initial paint');
    check(!initial.overflow,name+' no horizontal mobile overflow');
    await page.reload({waitUntil:'domcontentloaded'});
    check(await page.evaluate(()=>document.documentElement.dataset.cabinaVisualTheme)===name,name+' reload persistence');
    await page.goto(url+'/#ajustes',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.CabinaAppearance);
    const selected=await page.locator('[name="cabAtmosphere"]:checked').inputValue();
    check(selected===name,name+' selected in Settings');
    await page.locator('#cabAppearanceMode').selectOption('light');
    await page.locator('#cabAppearanceApply').click();
    const cleared=await page.evaluate(()=>({
      theme:document.documentElement.dataset.cabinaVisualTheme,
      mode:document.documentElement.dataset.cabinaTheme,
      atmosphere:JSON.parse(localStorage.getItem('cabina-appearance:v1')).atmosphere
    }));
    check(!cleared.theme&&cleared.mode==='light'&&cleared.atmosphere==='calma',name+' exits palette on light mode');
    check(errors.length===0,name+' zero JS exceptions: '+errors.join('; '));
    await context.close();
  }
} finally {await browser.close();server.close();}
if(failures.length) {console.error(failures.join('\n'));process.exitCode=1;}
