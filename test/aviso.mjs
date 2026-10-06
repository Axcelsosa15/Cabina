import { chromium } from 'playwright';
const errs=[]; const b=await chromium.launch(); const F=new Date('2026-09-17T14:00:00Z').getTime();
const SEM={settings:{accounts:[{id:'a1',firm:'Firma',name:'Evaluación 25K',kind:'Evaluación',size:25000,dd:1000,ddKind:'trailing_lock',trailBase:'intradia',limit:50,total:0,best:0,target:1500,status:'activa',ledger:[]}],rules:[],meta:{}}};
const p=await (await b.newContext({viewport:{width:1500,height:1200}})).newPage();
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://'+process.cwd()+'/../index.html'); await p.waitForTimeout(1100);
const id=await p.evaluate(()=>document.querySelector('.acct').dataset.id);
const av = () => p.evaluate(()=>{const z=document.getElementById('edAvisos');return z&&!z.hidden?z.innerText.replace(/\n+/g,' | '):'(sin avisos)';});

await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(350);
await p.fill('#ef_date','2026-09-17'); await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
console.log('══ 1 · precio limpio ══');
await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit','21030'); await p.waitForTimeout(350);
console.log('  ' + await av());
console.log('\n══ 2 · dedazo: 21000.13 en MNQ (tick 0,25) ══');
await p.fill('#ef_entry','21000.13'); await p.waitForTimeout(400);
console.log('  ' + await av());
console.log('\n══ 3 · pulsar "usar 21000.25" ══');
const hay = await p.evaluate(()=>!!document.querySelector('#edAvisos button[data-fix]'));
if (hay) { await p.click('#edAvisos button[data-fix]'); await p.waitForTimeout(400);
  console.log('  entrada ahora: ' + await p.inputValue('#ef_entry') + '  ·  ' + await av()); }
console.log('\n══ 4 · stop del lado equivocado ══');
await p.fill('#ef_stop','21010'); await p.waitForTimeout(400);
console.log('  ' + await av());
console.log('\n══ 5 · instrumento desconocido: sin rejilla, sin ruido ══');
await p.fill('#ef_stop','20990'); await p.fill('#ef_instrument','XYZ'); await p.fill('#ef_entry','100.37'); await p.waitForTimeout(400);
console.log('  ' + await av());
console.log('\n══ 6 · sin listeners acumulados tras 5 aperturas ══');
await p.click('#edCancel'); await p.waitForTimeout(250);
for (let i=0;i<5;i++){ await p.click('#ftNew'); await p.waitForTimeout(150); await p.click('#edCancel'); await p.waitForTimeout(150); }
await p.click('#ftNew'); await p.waitForTimeout(250);
await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_entry','21000.13'); await p.waitForTimeout(400);
const n = await p.evaluate(()=>document.querySelectorAll('#edAvisos .eav').length);
console.log('  bloques de aviso mostrados: ' + n + (n===1?'  ✅ uno solo':'  ❌ acumulados'));
console.log('\n══ 7 · «Contratos: 0» no es una operación ══');
/* Medido antes de ponerle puerta: 0 contratos se guardaban y el motor los
   contaba como 1 (`toNum(qty) || 1`), así que 10 puntos a favor metían $20 de
   ganancia inventada en la cuenta. La cantidad VACÍA sí vale 1, y eso se
   conserva: está documentado. */
await p.click('#edCancel'); await p.waitForTimeout(250);
await p.click('#ftNew'); await p.waitForTimeout(300);
await p.fill('#ef_date','2026-09-17'); await p.fill('#ef_instrument','MNQ');
await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit','21010');
for (const q of ['0','-2']) {
  await p.fill('#ef_qty', q); await p.click('#edSave'); await p.waitForTimeout(350);
  const r = await p.evaluate(()=>({ abierto: !!(document.getElementById('edTitle')||{}).offsetParent,
    titulo: (document.getElementById('edTitle')||{}).textContent||'', ops: FUT.trades().length }));
  const bien = r.ops === 0 && r.abierto && /contratos tienen que ser/i.test(r.titulo);
  console.log(`  contratos=${q} → ${bien?'✅':'❌'} operaciones ${r.ops} · editor abierto ${r.abierto} · «${r.titulo.trim()}»`);
}
await p.fill('#ef_qty',''); await p.click('#edSave'); await p.waitForTimeout(500);
{
  const r = await p.evaluate(()=>{ const t = FUT.trades()[0]; return { ops: FUT.trades().length, qty: t&&t.qty, pnl: t&&t.pnlEff }; });
  console.log(`  contratos vacíos → ${r.ops===1 && r.pnl===20 ? '✅' : '❌'} se guarda y vale 1 contrato: qty ${JSON.stringify(r.qty)} · P&L ${r.pnl}`);
}

console.log('\n══ 8 · un COBRO no tiene cantidad ══');
/* La guarda de arriba se aplicó primero a todo y bloqueó un caso legítimo: un
   dividendo, cupón, prima o alquiler no tiene cantidad —su importe va en
   «Resultado $»— y salía «la cantidad tiene que ser más de cero», que ahí no
   quiere decir nada. Sólo se exige donde la cantidad MUEVE UNIDADES. */
await p.click('.tabbtn[data-tab="invest"]'); await p.waitForTimeout(400);
for (const [q, op, etiqueta, debeGuardar] of [
  ['0', 'dividendo', 'un cobro con cantidad 0',      true],
  ['',  'dividendo', 'un cobro sin cantidad',        true],
  ['0', 'compra',    'una COMPRA de 0 unidades',     false],
  ['2.5', 'compra',  'una compra de 2,5 unidades',   true]]) {
  await p.click('#ivNew'); await p.waitForTimeout(350);
  await p.selectOption('#ef_op', op);
  await p.fill('#ef_asset', 'AAPL'); await p.fill('#ef_qty', q); await p.fill('#ef_pnl', '2.40');
  await p.click('#edSave'); await p.waitForTimeout(400);
  const abierto = await p.evaluate(() => !!(document.getElementById('edTitle') || {}).offsetParent);
  const guardo = !abierto;
  console.log(`  ${guardo === debeGuardar ? '✅' : '❌'} ${etiqueta} → ${guardo ? 'guardada' : 'rechazada'}`);
  if (abierto) await p.click('#edCancel');
  await p.waitForTimeout(200);
}

console.log('\nerrores JS: '+(errs.length?errs.join('\n'):'0'));
await b.close();
