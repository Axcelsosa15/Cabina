import { chromium } from 'playwright';
const errs = []; const b = await chromium.launch();
const F = new Date('2026-09-17T14:00:00Z').getTime();
const SEM = { settings: { accounts: [{ id:'a1', firm:'Firma', name:'Evaluación 25K', kind:'Evaluación',
  size:25000, dd:1000, ddKind:'trailing_lock', limit:50, total:0, best:0, target:1500, status:'activa', ledger:[] }],
  rules: [], meta: {} } };
async function abrir() {
  const p = await (await b.newContext({ viewport:{width:1500,height:1300} })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
  await p.goto('file://' + process.cwd() + '/../index.html'); await p.waitForTimeout(1200);
  return p;
}
async function op(p, id, exit) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(260);
  await p.fill('#ef_date','2026-09-17'); await p.fill('#ef_time','09:45');
  await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(650);
}
// Estado de la interfaz que el usuario tenía abierto
const estado = p => p.evaluate(() => ({
  riesgo:   !!document.querySelector('#riskForm') && !!document.getElementById('riskMeta')?.offsetParent,
  menu:     [...document.querySelectorAll('.acc-menu .menu')].some(m => !m.hidden),
  detalles: [...document.querySelectorAll('.rulec [aria-expanded="true"]')].length,
  journal:  !!document.querySelector('#acctJournal, .acc-journal:not([hidden])'),
  scrollY:  Math.round(window.scrollY),
  foco:     document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '(ninguno)',
}));

const p = await abrir();
const id = await p.evaluate(()=>document.querySelector('.acct').dataset.id);
await op(p, id, 21030);
await p.click('.tabbtn[data-tab="cabina"]').catch(()=>{}); await p.waitForTimeout(500);

console.log('══ abro paneles y pongo el foco en un sitio ══');
await p.click('.acct [data-act="risk"]'); await p.waitForTimeout(700);
await p.evaluate(()=>{ const i=document.getElementById('rk_risk'); if(i){i.focus(); i.scrollIntoView();} });
await p.waitForTimeout(300);
const antes = await estado(p);
console.log('  ' + JSON.stringify(antes));

console.log('\n══ entra una operación ══');
/* Registrar una operación obliga a pasar por la pestaña de Futuros. La pregunta
   no es si el panel sigue visible mientras estás en otra pestaña —no lo está,
   obviamente—, sino si al VOLVER sigue abierto y con los números frescos. Medir
   `despues` desde otra pestaña comparaba «visible» contra «oculto» y fallaba
   siempre: el test se estaba midiendo a sí mismo. */
await op(p, id, 20990);
await p.click('.tabbtn[data-tab="calc"]').catch(()=>{}); await p.waitForTimeout(800);
const despues = await estado(p);
console.log('  ' + JSON.stringify(despues));

/* El foco no sobrevive a un cambio de pestaña, y no tiene por qué: lo que
   importa es que un repintado disparado por datos nuevos NO te robe el cursor
   mientras escribes. Eso se prueba sin navegar: se pone el foco en un campo, se
   escribe, y se mete una operación por la capa de datos. */
console.log('\n══ foco mientras escribes, sin cambiar de pestaña ══');
await p.evaluate(() => { const i = document.getElementById('rk_risk'); if (i) { i.focus(); i.value = '123'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
await p.waitForTimeout(300);
await p.evaluate(() => FUT.createTrade({ accountId: 'a1', instrument: 'MNQ', direction: 'long', qty: 1,
  date: '2026-09-17', time: '11:15', entry: 21000, stop: 20990, exit: 21020 }));
await p.waitForTimeout(700);
const foco = await p.evaluate(() => ({ id: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '(ninguno)',
  valor: (document.getElementById('rk_risk') || {}).value }));
console.log('  ' + JSON.stringify(foco));

console.log('\n══ VEREDICTO ══');
const filas = [
  ['calculadora de riesgo abierta', antes.riesgo, despues.riesgo],
  ['menú ••• abierto',             antes.menu,   despues.menu],
  ['posición de scroll',           antes.scrollY, despues.scrollY],
  ['el foco no se pierde al entrar una operación', 'rk_risk', foco.id],
  ['lo que escribiste sigue ahí',   '123',        foco.valor],
];
for (const [k, a, d] of filas) {
  const ok = String(a) === String(d);
  console.log(`  ${ok ? '✅' : '❌'} ${k.padEnd(32)} antes=${a}  después=${d}`);
}
console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
