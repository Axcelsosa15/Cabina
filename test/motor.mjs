import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(28) + v);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
const F = new Date('2026-09-15T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(900);
const HOY = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
const id = await p.evaluate(() => document.querySelector('.acct').dataset.id);
const reglas = () => p.evaluate(() => [...document.querySelectorAll('.rulec')].map(c => c.querySelector('.rname').textContent.trim() + ' [' + c.querySelector('.rst').textContent.trim() + '] ' + (c.querySelector('.rv') ? c.querySelector('.rv').textContent.trim() : '—') + ' · ' + c.querySelector('.rnow').textContent.trim()).join('\n     '));
const est = () => p.evaluate(() => { const c = document.querySelector('.acct'); return c.querySelector('.acc-verdict .vtag').textContent.trim() + ' — ' + c.querySelector('.acc-verdict .vwhy').textContent.trim().slice(0, 95); });
const vigila = () => p.evaluate(() => [...document.querySelectorAll('.rulec')].slice(0,4).map(x => x.querySelector('.rname').textContent.trim() + ' ' + x.querySelector('.rnow').textContent.trim()).join(' | '));
async function op(hora, instr, qty, exit) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(280);
  await p.fill('#ef_date', HOY); await p.fill('#ef_time', hora); await p.fill('#ef_instrument', instr); await p.fill('#ef_qty', String(qty));
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(400);
  await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
}
console.log('=== estado inicial ===');
say('indicador:', await p.textContent('#rulesState'));
console.log('     ' + await reglas());
say('cuenta:', await est());
say('vigilando:', await vigila());
say('meta cuentas:', (await p.textContent('#acctsMeta')).replace(/\s+/g, ' '));

console.log('=== 1 pérdida (MNQ, 2 ctos) ===');
await op('09:45', 'MNQ', 2, 20950);
say('cuenta:', await est()); say('vigilando:', await vigila());

console.log('=== 2ª pérdida seguida → límite de racha ===');
await op('10:10', 'MNQ', 1, 20990);
say('indicador:', await p.textContent('#rulesState'));
say('cuenta:', await est()); say('vigilando:', await vigila());
say('regla 03:', await p.evaluate(() => { const c = [...document.querySelectorAll('.rulec')].find(x => /seguidas/i.test(x.querySelector('.rname').textContent)); return c.querySelector('.rst').textContent.trim() + ' · ' + c.querySelector('.rnow').textContent.trim(); }));

console.log('=== instrumento prohibido + exceso de contratos ===');
await op('11:00', 'MGC', 5, 21050);
say('regla 01:', await p.evaluate(() => { const c = document.querySelectorAll('.rulec')[0]; return c.querySelector('.rst').textContent.trim() + ' · ' + c.querySelector('.rnow').textContent.trim(); }));
say('regla 05:', await p.evaluate(() => { const c = [...document.querySelectorAll('.rulec')].find(x => /Contratos/i.test(x.querySelector('.rname').textContent)); return c.querySelector('.rst').textContent.trim() + ' · ' + c.querySelector('.rnow').textContent.trim(); }));
say('indicador:', await p.textContent('#rulesState'));
say('vigilando:', await vigila());
say('prioridad (racha > instr):', await est());

console.log('=== detalle plegable ===');
await p.click('.rulec .rtog'); await p.waitForTimeout(250);
say('al abrir:', await p.evaluate(() => { const c = document.querySelector('.rulec'); return c.querySelector('.rtog').textContent + ' → ' + (c.querySelector('.rdet p').hidden ? 'oculto' : c.querySelector('.rdet p').textContent.trim().slice(0, 70)); }));

console.log('=== menú ··· ===');
await p.click('.acct [data-act="menu"]'); await p.waitForTimeout(250);
say('opciones:', await p.evaluate(() => [...document.querySelectorAll('.acct .acc-menu .menu button')].slice(0,4).map(x => x.textContent.trim()).join(' / ')));
await p.click('.acct [data-act="dup"]'); await p.waitForTimeout(600);
say('tras duplicar:', await p.evaluate(() => document.querySelectorAll('.acct').length + ' cuentas · ' + [...document.querySelectorAll('.acc-id .name')].map(x => x.textContent.trim()).join(' | ')));
await p.click('.acct:nth-child(2) [data-act="menu"]'); await p.waitForTimeout(200);
await p.click('.acct:nth-child(2) [data-act="arch"]'); await p.waitForTimeout(500);
say('tras archivar:', await p.evaluate(() => { const c = document.querySelectorAll('.acct')[1]; return c.querySelector('.acc-id').textContent.trim() + ' · ' + c.querySelector('.acc-verdict .vtag').textContent.trim(); }));
say('meta cuentas:', (await p.textContent('#acctsMeta')).replace(/\s+/g, ' '));
console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await b.close();
