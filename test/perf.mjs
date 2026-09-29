import { chromium } from 'playwright';
const b = await chromium.launch();
const F = new Date('2026-09-17T14:00:00Z').getTime();
function semilla(n) {
  const trades = {};
  let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 3)));
    const id = 't' + i;
    const gana = rnd() < 0.45;
    trades[id] = { id, type:'futuros', date: d.toISOString().slice(0,10), time: '09:' + String(10 + (i%45)).padStart(2,'0'),
      instrument:'MNQ', direction: rnd()<0.5?'long':'short', qty: 1 + (i%3), entry: 21000, stop: 20990,
      exit: gana ? 21000 + 10 + Math.round(rnd()*40) : 20990, accountId:'a1', createdAt: 1700000000000 + i };
  }
  return { settings: { accounts:[{ id:'a1', firm:'Firma', name:'Evaluación 25K', kind:'Evaluación', size:25000, dd:1000,
      ddKind:'trailing_lock', trailBase:'intradia', limit:50, total:0, best:0, target:1500, status:'activa', ledger:[] }],
      rules: [], meta: {} }, trades };
}
async function medir(html, n, etiqueta) {
  const p = await (await b.newContext({ viewport:{width:1500,height:1200} })).newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(semilla(n)))});}catch(e){}`);
  const t0 = Date.now();
  await p.goto('file://' + process.cwd() + '/' + html);
  await p.waitForSelector('.acct', { timeout: 30000 }).catch(()=>{});
  await p.waitForTimeout(400);
  const arranque = Date.now() - t0;
  // coste de UNA operación nueva: lo que tarda el abanico entero
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(400);
  const dur = await p.evaluate(async () => {
    const t = performance.now();
    document.getElementById('ftNew').click();
    await new Promise(r => setTimeout(r, 250));
    document.getElementById('ef_date').value = '2026-09-17';
    ['ef_date'].forEach(id=>document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true})));
    document.getElementById('ef_instrument').value = 'MNQ';
    document.getElementById('ef_qty').value = '2';
    document.getElementById('ef_entry').value = '21000';
    document.getElementById('ef_stop').value = '20990';
    document.getElementById('ef_exit').value = '21030';
    const t1 = performance.now();
    document.getElementById('edSave').click();
    await new Promise(r => setTimeout(r, 0));
    return { total: performance.now() - t1, arranqueInterno: t1 - t };
  });
  await p.context().close();
  return { arranque, guardar: Math.round(dur.total), errs: errs.length };
}
console.log('                 ANTES            DESPUÉS');
console.log('operaciones | arranque  guardar | arranque  guardar');
for (const n of [250, 1000, 3000]) {
  const a = await medir('prev_b16.html', n, 'antes');
  const c = await medir('preview.html', n, 'después');
  console.log(`  ${String(n).padStart(5)}     |  ${String(a.arranque).padStart(6)}  ${String(a.guardar).padStart(6)} |  ${String(c.arranque).padStart(6)}  ${String(c.guardar).padStart(6)}`);
}
await b.close();
