import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch(); const F=new Date('2026-09-18T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'L25K',kind:'Evaluación',size:25000,dd:1000,ddKind:'trailing_lock',trailBase:'intradia',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
function conDatos(n){ const d=JSON.parse(JSON.stringify(SEM)); d.trades={};
  for(let i=0;i<n;i++){ const dia=new Date(Date.UTC(2026,7,1+Math.floor(i/2)));
    const gana = i%3!==0;
    d.trades['t'+i]={id:'t'+i,type:'futuros',date:dia.toISOString().slice(0,10),time:'09:4'+(i%6),instrument:'MNQ',direction:'long',
      qty:2,entry:21000,stop:20990,exit: gana?21020:20990, accountId:'a1',
      mae: 21000 - (gana ? (3 + (i%3)) : 10), mfe: 21000 + (gana ? 50 : 4), createdAt:1700000000000+i}; }
  return d; }
async function ver(n){
  const p=await (await b.newContext({viewport:{width:1500,height:1300}})).newPage();
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(conDatos(n)))});}catch(e){}`);
  await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1200);
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(900);
  const t = await p.evaluate(()=>{ const el=document.getElementById('qePanel'); if(!el) return '(sin panel)';
    const txt=el.innerText; const i=txt.indexOf('EJECUCIÓN'); const j=txt.indexOf('RIESGO DE LA CURVA');
    return i<0?'(sin sección)':txt.slice(i, j>i?j:i+900); });
  await p.context().close(); return t;
}
for (const n of [0, 3, 40]) {
  console.log(`\n════ ${n} operaciones con MAE/MFE ════`);
  console.log((await ver(n)).split('\n').filter(Boolean).map(l=>'  '+l).join('\n'));
}
console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
