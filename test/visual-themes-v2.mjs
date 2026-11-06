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
if ((html.match(/<style\b/g) || []).length !== 5) {
  throw new Error('Expected exactly five style blocks');
}
if (!['midnight','navy','forest'].every(t => appearance.includes(t+': {'))) {
  throw new Error('Missing one or more visual palettes');
}
/* LOS CINCO SEMANTICOS, ATADOS A SU ORIGEN.
   appearance.js duplica los valores de --dim/--info/--positive/--negative/
   --warning para poder corregirlos contra el fondo de cada paleta visual (no
   los puede leer del documento: una vez sobreescritos con !important,
   getComputedStyle devolveria el valor ya corregido y la correccion se
   compondria sobre si misma). Un duplicado sin guarda es una divergencia a la
   espera, exactamente la que capa2 §8 documenta con --positive-soft. Aqui se
   comprueba que siguen siendo los mismos.
   La primera aparicion de cada token en el documento es la del :root oscuro:
   el bloque claro llega mucho despues y sobreescribe con !important. Si
   alguien reordena los bloques, esto sale en rojo, que es lo que se quiere. */
const SEMANTICOS_ESPERADOS = ['--dim','--info','--positive','--negative','--warning'];
const enRaiz = tok => (html.match(new RegExp(tok + '\\s*:\\s*(#[0-9a-fA-F]{6})')) || [])[1];
const declarados = (appearance.match(/const SEMANTICOS = Object\.freeze\(\{([^}]*)\}\)/) || ['',''])[1];
const enJs = tok => (declarados.match(new RegExp("'" + tok + "'\\s*:\\s*'(#[0-9a-fA-F]{6})'")) || [])[1];
const divergen = SEMANTICOS_ESPERADOS.filter(tok => {
  const a = enRaiz(tok), b = enJs(tok);
  return !a || !b || a.toLowerCase() !== b.toLowerCase();
});
check(divergen.length === 0, 'los cinco semanticos de appearance.js son los de :root'
  + (divergen.length ? ': ' + divergen.map(t => `${t} raiz=${enRaiz(t)} js=${enJs(t)}`).join(' | ') : ''));

/* El contraste REAL del texto lo mide test/contraste.mjs sobre las once
   pestanas y los cinco temas. Esto es la comprobacion de tokens que va delante:
   si un token derivado no llega al suelo sobre --surface-2, el fallo se lee
   aqui en una linea en vez de como 505 textos en otro archivo. */
const SUELO = 5.2;
/* EL HEXADECIMAL PRIMERO, y no es un detalle de estilo: `[\d.]+` sobre
   '#E26959' casa los digitos que hay DENTRO del hex ('26', '959') y devuelve
   dos canales en vez de tres. Esta guarda se escribio al reves y pasaba en
   verde midiendo basura: con el suelo bajado a proposito reportaba
   '--negative 1.17:1', un numero imposible para un rojo sobre un gris oscuro.
   Un numero absurdo en un sabotaje es la unica razon por la que se vio. */
const canal = c => {
  const s = String(c).trim();
  const h = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (h) { const x = h[1].length === 3 ? h[1].split('').map(ch => ch + ch).join('') : h[1];
           return [0,2,4].map(i => parseInt(x.slice(i,i+2),16)); }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0,3).map(Number) : null;
};
const lumi = ch => ch.map(v => v/255).map(v => v<=.03928 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+[.2126,.7152,.0722][i]*v,0);
const razon = (a,b) => { const x=lumi(a),y=lumi(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };

const server = sirvePublicado(html);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const failures = [];
/* Los dos espacios NO son estetica: test/correr.mjs cuenta las aserciones con
   /^ {2}(?:[OK]|PASS|FAIL) /m sobre la SALIDA, no sobre el fuente. Sin ellos
   este archivo reportaba 0 aserciones y la suite lo archivaba como «solo
   mide», asi que sus 18 comprobaciones no entraban en el numero que va al
   README. Medido: 0 af. antes, 24 af. ahora. */
function check(ok, label) { console.log('  ' + (ok?'PASS ':'FAIL ') + label);if(!ok) failures.push(label); }
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
    const tk=await page.evaluate(()=>{const cs=getComputedStyle(document.documentElement),g=k=>cs.getPropertyValue(k).trim();
      return {s2:g('--surface-2'),'--dim':g('--dim'),'--info':g('--info'),'--positive':g('--positive'),'--negative':g('--negative'),'--warning':g('--warning'),'--accent':g('--accent')};});
    const fondo2=canal(tk.s2);
    const flojos=Object.keys(tk).filter(k=>k!=='s2').map(k=>[k,canal(tk[k])])
      .filter(([,c])=>c && fondo2 && razon(c,fondo2)<SUELO)
      .map(([k,c])=>`${k} ${razon(c,fondo2).toFixed(2)}:1`);
    check(flojos.length===0,name+' los tokens derivados llegan a '+SUELO+':1 sobre --surface-2'+(flojos.length?': '+flojos.join(' · '):''));
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
