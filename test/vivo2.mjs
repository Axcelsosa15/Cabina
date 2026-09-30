import { chromium } from 'playwright';
const errs = []; const b = await chromium.launch();
const F = new Date('2026-09-17T14:00:00Z').getTime();
const SEM = { settings: { accounts: [{ id:'a1', firm:'Firma', name:'Evaluación 25K', kind:'Evaluación',
  size:25000, dd:1000, ddKind:'trailing_lock', limit:50, total:0, best:0, target:1500, status:'activa', ledger:[] }],
  rules: [], meta: {} } };

async function abrir() {
  const p = await (await b.newContext({ viewport:{width:1500,height:1200} })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(SEM))});}catch(e){}`);
  await p.goto('file://' + process.cwd() + '/../index.html'); await p.waitForTimeout(1200);
  return p;
}
async function op(p, id, exit, fecha) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(260);
  await p.fill('#ef_date', fecha||'2026-09-17'); await p.fill('#ef_time','09:45');
  await p.fill('#ef_instrument','MNQ'); await p.fill('#ef_qty','2');
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry','21000'); await p.fill('#ef_stop','20990'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(650);
}
const riesgo = p => p.evaluate(() => {
  const m=document.getElementById('riskMeta'), h=document.getElementById('riskHero');
  return (m&&m.offsetParent? m.innerText.replace(/\s+/g,' ') : '(cerrada)') + ' ## ' + (h&&h.offsetParent? h.innerText.replace(/\s+/g,' ').slice(0,90) : '');
});
const tarjeta = p => p.evaluate(() => { const c=document.querySelector('.acct'); return c? (c.innerText.match(/BALANCE ACTUAL[^A-Z]{0,40}/)||['?'])[0].replace(/\s+/g,' ') : '?'; });
const tiles = p => p.evaluate(() => { const t=document.getElementById('ftTiles'); return t? t.innerText.split('\n').slice(0,3).join(' ') : '?'; });

console.log('══════ A · CALCULADORA DE RIESGO ABIERTA cuando entra la operación ══════');
{
  const p = await abrir();
  const id = await p.evaluate(()=>document.querySelector('.acct').dataset.id);
  await op(p, id, 21030);                                  // +$120
  await p.click('.tabbtn[data-tab="cabina"]').catch(()=>{});
  await p.click('.acct [data-act="risk"]'); await p.waitForTimeout(800);
  console.log('  antes de la 2ª operación : ' + await riesgo(p));
  console.log('  tarjeta                  : ' + await tarjeta(p));
  await op(p, id, 20990);                                  // -$40  -> balance 25080
  /* Se vuelve a la MISMA pestaña de la calculadora para leerla. Medirla desde
     Cabina daba «(cerrada)» —está en otra pestaña— y se comparaba oculto contra
     visible: ❌ garantizado sin que la app tuviera nada mal. */
  await p.click('.tabbtn[data-tab="calc"]').catch(()=>{}); await p.waitForTimeout(700);
  const rDespues = await riesgo(p);
  console.log('  después (en vivo)        : ' + rDespues);
  await p.click('.tabbtn[data-tab="cabina"]').catch(()=>{}); await p.waitForTimeout(300);
  console.log('  tarjeta                  : ' + await tarjeta(p));
  // verdad: forzar el recálculo reabriendo la calculadora desde la tarjeta
  await p.click('.acct [data-act="risk"]').catch(()=>{}); await p.waitForTimeout(800);
  const rReal = await riesgo(p);
  console.log('  después (reabriendo)     : ' + rReal);
  console.log('  → ' + (rDespues === rReal ? '✅ se actualizó sola' : '❌ RANCIA: el panel abierto no se enteró'));
  await p.context().close();
}

console.log('\n══════ B · EDITAR una operación existente ══════');
{
  const p = await abrir();
  const id = await p.evaluate(()=>document.querySelector('.acct').dataset.id);
  await op(p, id, 21030);
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(400);
  /* La tabla de operaciones vive en #jrTable, dentro de la vista «Diario»; el
     selector apuntaba a un #ftList que no existe, así que la prueba se saltaba
     sola desde el primer día y nadie la vio fallar. */
  await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(500);
  console.log('  antes  : ' + await tiles(p) + '  |  ' + await tarjeta(p));
  await p.click('#jrTable tr[data-id] [data-act="edit"]').catch(()=>{});
  await p.waitForTimeout(500);
  /* El editor vive en un overlay que se queda en el DOM al cerrarse: preguntar
     por #ef_exit devolvía true con el editor CERRADO, y el fill siguiente moría
     por timeout llevándose el resto del archivo por delante. */
  const abierto = await p.evaluate(()=>!!document.querySelector('.ov.open #ef_exit'));
  if (abierto) {
    await p.fill('#ef_exit', '21100');                      // +100 pts -> +$400
    await p.click('#edSave'); await p.waitForTimeout(800);
    console.log('  después: ' + await tiles(p) + '  |  ' + await tarjeta(p));
    console.log('  → esperado P&L $400 (100 pts x 2 x $2)');
  } else console.log('  (no se pudo abrir el editor desde la fila — se revisa aparte)');
  await p.context().close();
}

console.log('\n══════ C · BORRAR una operación ══════');
{
  const p = await abrir();
  const id = await p.evaluate(()=>document.querySelector('.acct').dataset.id);
  await op(p, id, 21030); await op(p, id, 20990, '2026-09-16');
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(400);
  await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(500);
  console.log('  antes  : ' + await tiles(p) + '  |  ' + await tarjeta(p));
  /* No hay botón de borrar en la fila: se borra desde el editor, y el botón se
     arma en dos clics a propósito (el primero pregunta, el segundo borra). */
  await p.click('#jrTable tr[data-id] [data-act="edit"]').catch(()=>{});
  await p.waitForTimeout(500);
  const borrado = await p.evaluate(() => !!document.querySelector('.ov.open #edDelete'));
  if (borrado) {
    await p.click('#edDelete'); await p.waitForTimeout(250);
    await p.click('#edDelete'); await p.waitForTimeout(800);
    console.log('  después: ' + await tiles(p) + '  |  ' + await tarjeta(p));
  } else console.log('  (no se pudo abrir el editor para borrar)');
  await p.context().close();
}
console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
