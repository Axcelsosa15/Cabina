import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch(); const F=new Date('2026-09-18T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'Evaluación 25K',kind:'Evaluación',size:25000,dd:1000,ddKind:'trailing_lock',trailBase:'intradia',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
const p=await (await b.newContext({viewport:{width:1500,height:1300}})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/preview.html'); await p.waitForTimeout(1100);
const id=await p.evaluate(()=>document.querySelector('.acct').dataset.id);

console.log('══ 1 · guardar con MAE/MFE/hora-salida/motivo ══');
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(320);
await p.fill('#ef_date','2026-09-18'); await p.fill('#ef_time','09:45');
await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
await p.selectOption('#ef_accountId',id);
await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit','21030');
const hay = await p.evaluate(()=>['exitTime','exitWhy','mae','mfe'].map(k=>!!document.getElementById('ef_'+k)));
console.log('  campos presentes [hora, motivo, mae, mfe]: ' + JSON.stringify(hay));
await p.fill('#ef_exitTime','10:12');
await p.selectOption('#ef_exitWhy','manual');
await p.fill('#ef_mae','20994'); await p.fill('#ef_mfe','21045');
await p.click('#edSave'); await p.waitForTimeout(700);

console.log('\n══ 2 · sobreviven al guardado y al recargar ══');
const guardado = await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}');
  const t=Object.values(d.trades||{})[0]||{}; return { mae:t.mae, mfe:t.mfe, exitTime:t.exitTime, exitWhy:t.exitWhy, exit:t.exit }; });
console.log('  en almacenamiento: ' + JSON.stringify(guardado));
// cargar en una pestaña NUEVA con los datos ya guardados (el reload re-siembra)
const p2 = await (await b.newContext({viewport:{width:1400,height:1100}})).newPage();
await p2.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p2.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify({}))});}catch(e){}`);
const crudo = await p.evaluate(()=>localStorage.getItem('cabina-mnq:v1'));
await p2.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${'`'}${'$'}{${JSON.stringify(crudo)}}${'`'});}catch(e){}`);
await p2.goto('file://'+process.cwd()+'/preview.html'); await p2.waitForTimeout(1200);
const tras = await p2.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}'); const t=Object.values(d.trades||{})[0]||{};
  return { mae:t.mae, mfe:t.mfe, exitTime:t.exitTime, exitWhy:t.exitWhy }; });
console.log('  en sesión nueva  : ' + JSON.stringify(tras));
await p2.context().close();

console.log('\n══ 3 · el motor los lee y concluye ══');
const calc = await p.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('cabina-mnq:v1')||'{}'); const t=Object.values(d.trades||{})[0];
  const e = QuantEngine.excursionDeOperacion({ simbolo:t.instrument, direccion:t.direction, entrada:t.entry, stop:t.stop, salida:t.exit, mae:t.mae, mfe:t.mfe });
  return { maeR:e.maeR, mfeR:e.mfeR, logradoR:e.logradoR, captura:e.capturaMFE, usoStop:e.usoDelStop };
});
console.log('  ' + JSON.stringify(calc));
console.log('\n  lectura: fue ' + (calc.usoStop*100).toFixed(0) + '% del stop en contra, llegó a +' + calc.mfeR + 'R y saliste con +' + calc.logradoR + 'R');
console.log('\n══ 4 · operación sin los campos opcionales (no debe estorbar) ══');
await p.click('#ftNew'); await p.waitForTimeout(300);
await p.fill('#ef_date','2026-09-18'); await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit','20990');
await p.click('#edSave'); await p.waitForTimeout(600);
console.log('  guardada sin MAE/MFE: ' + await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('cabina-mnq:v1')).trades).length) + ' operaciones');
console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
