/* ¿Es cierto el diagrama? CABINA y FUTUROS deben dar el MISMO número para la
   misma magnitud, aunque la llamen distinto. Si discrepan en una sola, no hay
   una sola fuente de verdad. */
import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch(); const F=new Date('2026-09-18T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'Evaluación 25K',kind:'Evaluación',size:25000,dd:1000,
  ddKind:'trailing_lock',trailBase:'intradia',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
const p=await (await b.newContext({viewport:{width:1500,height:1400}})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/../index.html'); await p.waitForTimeout(1200);
const id=await p.evaluate(()=>document.querySelector('.acct').dataset.id);
async function op(exit, hora, fecha){
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(240);
  await p.fill('#ef_date',fecha); await p.fill('#ef_time',hora);
  await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId',id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit',String(exit));
  await p.click('#edSave'); await p.waitForTimeout(450);
}
await op(21030,'09:45','2026-09-16');  // +$120  día 1
await op(20990,'10:15','2026-09-17');  // -$40   día 2
await op(21015,'11:05','2026-09-18');  // +$60   día 3  -> total +$140

const num = s => { const m=String(s||'').match(/-?\$?-?[\d][\d,]*(\.\d+)?/); return m? m[0].replace(/[$,]/g,'') : null; };
const tras = (t, et) => { const i=t.indexOf(et); return i<0? null : t.slice(i+et.length, i+et.length+16); };

await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(800);
/* textContent y no innerText: con el rediseño, el detalle de cada métrica
   está plegado hasta que lo pides, e innerText salta lo que no se pinta. La
   pregunta de esta prueba no es «¿se ve?» sino «¿coinciden las dos pestañas?»,
   así que se lee el texto completo de la tarjeta. */
const cabT = await p.evaluate(()=>document.querySelector('.acct').textContent.replace(/\s+/g,' '));
await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(500);
await p.click('button[data-v="cuentas"]'); await p.waitForTimeout(800);
const futT = await p.evaluate(()=>document.querySelector('.ftview.active').innerText.replace(/\s+/g,' '));
await p.click('button[data-v="resumen"]'); await p.waitForTimeout(700);
const tiles = await p.evaluate(()=>document.getElementById('ftTiles').innerText.replace(/\s+/g,' '));

const pares = [
  ['ganancia total', num(tras(cabT,'Ganancia total')),       num(tras(futT,'GANANCIA TOTAL'))],
  ['balance',        num(tras(cabT,'Balance')),       num(tras(futT,'BALANCE'))],
  ['colchón',        num(tras(cabT,'Colchón que queda')),    num(tras(futT,'COLCHÓN'))],
  ['suelo / umbral', num(tras(cabT,'Suelo de la cuenta')),   num(tras(futT,'umbral'))],
  ['mejor día',      num(tras(cabT,'Mejor día')),            num(tras(futT,'MEJOR DÍA'))],
  ['consistencia',   num(tras(cabT,'Consistencia')),         num(tras(futT,'mejor día ÷ total ='))],
  ['P&L (tiles)',    num(tras(cabT,'Ganancia total')),       num(tras(tiles,'P&L NETO'))],
];
console.log('3 operaciones en 3 días: +$120, -$40, +$60  ->  total +$140, balance $25,140\n');
console.log('  magnitud            CABINA      FUTUROS');
let mal=0;
for (const [k,a,c] of pares) {
  const ok = a!=null && c!=null && Number(a)===Number(c);
  if(!ok) mal++;
  console.log(`  ${ok?'✅':'❌'} ${k.padEnd(16)} ${String(a??'—').padStart(9)}   ${String(c??'—').padStart(9)}`);
}
console.log(mal
  ? `\n  ${mal} discrepancia(s) — el diagrama NO se cumple.`
  : `\n  ${pares.length}/${pares.length} idénticas: las dos pestañas leen del mismo cálculo. El diagrama se cumple.`);
console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
