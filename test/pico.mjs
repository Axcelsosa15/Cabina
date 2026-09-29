import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch();
const F=new Date('2026-09-17T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'Evaluación 25K',kind:'Evaluación',size:25000,dd:1000,ddKind:'trailing_lock',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
const p=await (await b.newContext({viewport:{width:1500,height:1200}})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1200);
const id=await p.evaluate(()=>document.querySelector('.acct').dataset.id);
async function op(exit,hora){
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(250);
  await p.fill('#ef_date','2026-09-17'); await p.fill('#ef_time',hora);
  await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId',id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit',String(exit));
  await p.click('#edSave'); await p.waitForTimeout(600);
}
const lee=async()=>{ await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
  await p.click('.acct [data-act="risk"]'); await p.waitForTimeout(650);
  return p.evaluate(()=>({ balance: document.getElementById('rk_balance').value,
    pico: document.getElementById('rk_peak').value,
    umbral: (document.getElementById('riskMeta').innerText.match(/\$[\d,]+/g)||[]).join(' / ') }));};
console.log('mismo día, dos operaciones seguidas · cuenta $25.000, DD $1.000 trailing bloqueado\n');
await op(21030,'09:45'); console.log('  tras +$120 : ' + JSON.stringify(await lee()));
await op(20990,'10:15'); console.log('  tras -$40  : ' + JSON.stringify(await lee()));
await op(20990,'10:45'); console.log('  tras -$40  : ' + JSON.stringify(await lee()));
console.log('\n  El pico es el balance MÁS ALTO que ha tocado la cuenta. Sólo puede subir.');
console.log('  Si baja, el suelo baja con él y el colchón sale inflado.');
console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
