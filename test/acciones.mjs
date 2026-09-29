import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(32) + v);
async function open() {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
  await conCuentas(p);
  await p.goto(URL); await p.waitForTimeout(900); return p;
}
console.log('=== acciones rápidas ===');
const p = await open();
await p.click('.acct [data-act="newtrade"]'); await p.waitForTimeout(400);
say('+ Operación abre editor:', (await p.textContent('#edTitle')) + ' · cuenta=' + (await p.evaluate(() => { const s = document.getElementById('ef_accountId'); return s ? s.options[s.selectedIndex].textContent.trim() : '(no)'; })));
await p.click('#edCancel'); await p.waitForTimeout(250);
await p.click('.acc-acts [data-act="cfg"]'); await p.waitForTimeout(350);
say('⚙ Ajustes abre:', (await p.textContent('#edTitle')) + ' · campos=' + await p.locator('#edFields .fld').count());
await p.click('#edCancel'); await p.waitForTimeout(250);
await p.click('.acct [data-act="journal"]'); await p.waitForTimeout(600);
say('Journal lleva a:', await p.evaluate(() => document.querySelector('.tab.active').dataset.tab + ' / ' + document.querySelector('#ftSeg button.active').dataset.v + ' · filtro=' + (document.getElementById('ftAcct').selectedOptions[0] || {}).textContent));
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
await p.click('.acct [data-act="playbook"]'); await p.waitForTimeout(500);
say('Playbook lleva a:', await p.evaluate(() => document.querySelector('.tab.active').dataset.tab));
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
await p.click('.acct [data-act="risk"]'); await p.waitForTimeout(700);
say('Riesgo lleva a:', await p.evaluate(() => document.querySelector('.tab.active').dataset.tab + ' · tamaño=' + document.getElementById('rk_size').value + ' dd=' + document.getElementById('rk_dd').value + ' balance=' + document.getElementById('rk_balance').value));
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
const filas = await p.locator('.acc-recent tbody tr').count();
if (filas) { await p.click('.acc-recent tbody tr'); await p.waitForTimeout(450);
  say('Fila abre la operación:', await p.textContent('#edTitle').catch(() => '(no abrió)'));
  await p.click('#edCancel').catch(() => {}); }
else say('Últimas operaciones:', 'vacío → ' + (await p.textContent('.acc-recent .vacio')).slice(0, 60));
await p.context().close();

console.log('=== casos límite ===');
const q = await open();
// 1. cuenta sin tamaño ni drawdown
await q.evaluate(() => document.querySelector('.acc-acts [data-act="cfg"]').click()); await q.waitForTimeout(350);
await q.fill('#ef_size', '0'); await q.fill('#ef_dd', '0'); await q.fill('#ef_total', '0'); await q.fill('#ef_best', '0');
await q.click('#edSave'); await q.waitForTimeout(500);
say('sin tamaño ni dd:', await q.evaluate(() => { const c = document.querySelector('.acct'); return c.querySelector('.acc-figs .fig:first-child .v').textContent.trim() + ' · ' + c.querySelector('.acc-verdict .vtag').textContent.trim() + ' · dd=' + [...c.querySelectorAll('.metric')].find(x => /Colch/i.test(x.querySelector('.lab').textContent)).querySelector('.mtop .s').textContent.trim(); }));
// 2. drawdown roto: balance por debajo del suelo
await q.evaluate(() => document.querySelector('.acc-acts [data-act="cfg"]').click()); await q.waitForTimeout(350);
await q.fill('#ef_size', '25000'); await q.fill('#ef_dd', '1000'); await q.fill('#ef_total', '-1200'); await q.fill('#ef_best', '0');
await q.click('#edSave'); await q.waitForTimeout(500);
say('drawdown roto:', await q.evaluate(() => { const c = document.querySelector('.acct'); const m = [...c.querySelectorAll('.metric')].find(x => /Colch/i.test(x.querySelector('.lab').textContent)); return c.querySelector('.acc-verdict .vtag').textContent.trim() + ' · ' + m.querySelector('.mtop .s').textContent.trim() + ' · colchón ' + m.querySelector('.mtop .v').textContent.trim(); }));
// 3. cuenta quemada
await q.evaluate(() => { const s = document.querySelector('.acct select[data-f="status"]'); s.value = 'quemada'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await q.waitForTimeout(500);
say('marcada quemada:', await q.evaluate(() => { const c = document.querySelector('.acct'); return c.querySelector('.acc-id').textContent.trim() + ' · ' + c.querySelector('.acc-verdict .vtag').textContent.trim(); }));
// 4. borrar todas las cuentas
await q.evaluate(() => { state => 0; });
for (let i = 0; i < 4; i++) {
  const menu = q.locator('.acct [data-act="menu"]').first(); if (!await menu.count()) break;
  await menu.click(); await q.waitForTimeout(200);
  const d = q.locator('.acct .acc-menu [data-act="del"]').first();
  await d.click(); await d.click(); await q.waitForTimeout(400);
}
say('sin cuentas:', (await q.textContent('#accts')).replace(/\s+/g, ' ').trim().slice(0, 90));
await q.click('#addAcct'); await q.waitForTimeout(400);
say('+ Añadir cuenta abre:', await q.textContent('#edTitle'));
await q.context().close();
console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await b.close();
