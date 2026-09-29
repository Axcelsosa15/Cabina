import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch(); const F=new Date('2026-09-17T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'Evaluación 25K',kind:'Evaluación',size:25000,dd:1000,ddKind:'trailing_lock',trailBase:'intradia',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
const p=await (await b.newContext({viewport:{width:1500,height:1300}})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1100);
const id=await p.evaluate(()=>document.querySelector('.acct').dataset.id);
async function op(fecha,exit){
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(230);
  await p.fill('#ef_date',fecha); await p.fill('#ef_time','09:45'); await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId',id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit',String(exit));
  await p.click('#edSave'); await p.waitForTimeout(500);
}
const lee=async()=>{ await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
  return p.evaluate(()=>{const e=document.querySelector('.peorm'); return e?e.innerText.replace(/\n+/g,' · '):'(no se muestra)';});};
await op('2026-09-10', 20790);   // -$840 : baja fuerte
console.log('  tras -$840        : ' + await lee());
await op('2026-09-14', 21200);   // +$800 : recupera
console.log('  tras recuperar    : ' + await lee());
await op('2026-09-16', 21100);   // +$400 más
console.log('  con la cuenta bien: ' + await lee());
console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
