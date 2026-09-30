import { chromium } from 'playwright';
const errs = []; const b = await chromium.launch();
const F = new Date('2026-09-17T14:00:00Z').getTime();
const SEM = { settings: { accounts: [{ id:'a1', firm:'Firma', name:'Evaluación 25K', kind:'Evaluación',
  size:25000, dd:1000, ddKind:'trailing_lock', limit:50, total:0, best:0, target:1500, status:'activa', ledger:[] }],
  rules: [], meta: {} } };
const p = await (await b.newContext({ viewport:{width:1500,height:1300} })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
await p.goto('file://' + process.cwd() + '/../index.html'); await p.waitForTimeout(1200);
const id = await p.evaluate(()=>document.querySelector('.acct').dataset.id);
async function op(exit) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(260);
  await p.fill('#ef_date','2026-09-17'); await p.fill('#ef_time','09:45');
  await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(650);
}
const leeRiesgo = () => p.evaluate(() => ({
  balance: document.getElementById('rk_balance')?.value,
  peak:    document.getElementById('rk_peak')?.value,
  meta:    document.getElementById('riskMeta')?.innerText.replace(/\s+/g,' '),
  colchon: (document.getElementById('riskHero')?.innerText.match(/\$[\d,]+/)||['?'])[0],
}));
const balanceTarjeta = () => p.evaluate(() => { const c=document.querySelector('.acct'); return (c.innerText.match(/BALANCE ACTUAL\s*\$[\d,]+/)||['?'])[0].replace(/\s+/g,' '); });

await op(21030);                                   // +$120  -> balance 25120
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
console.log('tarjeta:  ' + await balanceTarjeta());
await p.click('.acct [data-act="risk"]'); await p.waitForTimeout(900);
const antes = await leeRiesgo();
console.log('calculadora tras cargar la cuenta:');
console.log('  ' + JSON.stringify(antes));

console.log('\n── entra otra operación: -$40 (balance debería quedar en $25,080) ──');
await op(20990);
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
console.log('tarjeta:  ' + await balanceTarjeta());
await p.click('.tabbtn[data-tab="calc"]'); await p.waitForTimeout(700);
const despues = await leeRiesgo();
console.log('calculadora SIN volver a cargar la cuenta:');
console.log('  ' + JSON.stringify(despues));

console.log('\n══ VEREDICTO ══');
console.log(`  balance en la calculadora: ${antes.balance} -> ${despues.balance}`);
console.log(`  ${antes.balance === despues.balance ? '❌ RANCIO: sigue mostrando el balance de antes de la operación' : '✅ se actualizó'}`);
console.log(`  umbral/colchón: ${despues.meta}`);

console.log('\n══ DESVINCULAR AL ESCRIBIR A MANO ══');
await p.fill('#rk_balance', '30000'); await p.waitForTimeout(500);
const tras = await leeRiesgo();
console.log('  escribo balance 30000 -> meta: ' + tras.meta);
await op(21030);
await p.click('.tabbtn[data-tab="calc"]'); await p.waitForTimeout(700);
const final = await leeRiesgo();
console.log('  entra otra operación  -> balance: ' + final.balance);
console.log('  ' + (final.balance === '30000' ? '✅ respeta lo que escribí (desvinculada)' : '❌ me pisó el número'));
console.log('  indicador: ' + (final.meta||'').split('·').slice(2).join('·').trim());

console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
