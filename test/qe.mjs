import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1200 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
const F = new Date('2026-09-17T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(900);
const HOY = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
const id = await p.evaluate(() => document.querySelector('.acct').dataset.id);

console.log('=== motor cargado ===');
console.log('  QE presente:', await p.evaluate(() => typeof QuantEngine === 'object' && typeof QuantEngine.analizarEdge === 'function'));
console.log('  contratos   :', await p.evaluate(() => Object.keys(QuantEngine.CONTRACTS).length));
console.log('  MNQ mult    :', await p.evaluate(() => QuantEngine.CONTRACTS.MNQ.multiplier), '· tickValue', await p.evaluate(() => QuantEngine.CONTRACTS.MNQ.tickValue));

// meter 14 operaciones reales sobre MNQ
async function op(d, hora, qty, entry, stop, exit) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(240);
  await p.fill('#ef_date', d); await p.fill('#ef_time', hora); await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', String(qty));
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry', String(entry)); await p.fill('#ef_stop', String(stop)); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(260);
}
const dias = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-14','2026-09-15','2026-09-16'];
const res  = [ 25, -10, 40, -10, -10, 30, -10, 20, -10, 55, -10, 15, -10, 35 ];
for (let i = 0; i < res.length; i++) {
  const d = dias[i % dias.length];
  await op(d, '09:4' + (i % 6), 1, 21000, 20990, 21000 + res[i]);
}
await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(700);

const txt = await p.evaluate(() => document.getElementById('qePanel').innerText.replace(/\n{2,}/g, '\n'));
console.log('\n=== panel · sin filtro de cuenta ===\n' + txt.split('\n').map(l => '  ' + l).join('\n'));

await p.selectOption('#ftAcct', id); await p.waitForTimeout(1200);
const txt2 = await p.evaluate(() => document.getElementById('qePanel').innerText.replace(/\n{2,}/g, '\n'));
console.log('\n=== panel · filtrado por cuenta (con simulación) ===\n' + txt2.split('\n').map(l => '  ' + l).join('\n'));

const hayBtn = await p.evaluate(() => !!document.getElementById('qeBarrer'));
if (hayBtn) {
  await p.click('#qeBarrer'); await p.waitForTimeout(2500);
  const tab = await p.evaluate(() => { const t = document.querySelector('.qsweep'); return t ? t.innerText : '(sin tabla)'; });
  console.log('\n=== barrido de tamaño de posición ===\n' + tab.split('\n').map(l => '  ' + l).join('\n'));
}

// desbordes horizontales
for (const w of [1600, 1400, 1100, 900, 768, 430, 375]) {
  await p.setViewportSize({ width: w, height: 1000 }); await p.waitForTimeout(220);
  const over = await p.evaluate(() => { const o = []; document.querySelectorAll('#qePanel *, #qeSec').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.right > document.documentElement.clientWidth + 1) o.push((el.id || el.className || el.tagName) + ' ' + Math.round(r.right)); }); return o; });
  console.log(`  ancho ${w}: ${over.length ? 'DESBORDE ' + over.join(', ') : 'ok'}`);
}
console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
