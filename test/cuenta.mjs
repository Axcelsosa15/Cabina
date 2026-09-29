import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(30) + v);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
const F = new Date('2026-09-15T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(900);
const HOY = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));

// Reproducir EXACTAMENTE tu cuenta de ejemplo con datos reales, no hardcodeados:
// tamaño 25.000, dd 1.000, límite 50%, ganancia previa $1, y dos días verdes en el journal.
await p.evaluate(async () => {
  const card = document.querySelector('.acct'); card.querySelector('[data-act="cfg"]').click();
});
await p.waitForTimeout(400);
await p.fill('#ef_firm', 'Firma de ejemplo'); await p.fill('#ef_name', 'Evaluación 25K'); await p.fill('#ef_kind', 'Evaluación');
await p.fill('#ef_size', '25000'); await p.fill('#ef_dd', '1000'); await p.fill('#ef_limit', '50');
await p.fill('#ef_total', '1'); await p.fill('#ef_best', '0'); await p.fill('#ef_target', '0');
await p.click('#edSave'); await p.waitForTimeout(600);
const acctId = await p.evaluate(() => document.querySelector('.acct').dataset.id);
// dos días con operaciones: +$170 (ayer) y +$144 (hoy) → total 1+314 = 315, mejor día 170
const dias = [['2026-09-14', '09:45', 170], [HOY, '09:50', 144]];
for (const [fecha, hora, pnl] of dias) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(300);
  await p.fill('#ef_date', fecha); await p.fill('#ef_time', hora); await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', '1');
  await p.selectOption('#ef_accountId', acctId);
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', String(21000 + pnl / 2));
  await p.click('#edSave'); await p.waitForTimeout(400);
}
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(700);

console.log('=== tus números contra los calculados ===');
const g = await p.evaluate(() => {
  const c = document.querySelector('.acct');
  const kpi = n => { const el = [...c.querySelectorAll('.metric')].find(x => x.querySelector('.lab').textContent.replace(/[\s\u25b8\u25be]+$/,'').trim() === n); return el ? el.querySelector('.mtop .v').textContent.trim() + ' | ' + el.querySelector('.mtop .s').textContent.trim() : '(no)'; };
  const mod = n => { const el = [...c.querySelectorAll('.metric')].find(x => x.querySelector('.lab').textContent.replace(/[\s\u25b8\u25be]+$/,'').trim() === n); if (!el) return '(no)';
    return el.querySelector('.mtop .v').textContent.trim() + ' | ' + [...el.querySelectorAll('.mdet > div')].map(r => r.children[0].textContent.trim() + '=' + r.children[1].textContent.trim()).join(' · '); };
  return { balance: c.querySelector('.acc-figs .fig:first-child .v').textContent.trim(),
    delta: c.querySelector('.acc-figs .fig:first-child .s').textContent.trim() + ' ' + c.querySelector('.acc-figs .fig:first-child .s').textContent.trim(),
    estado: c.querySelector('.acc-id').textContent.trim(),
    operar: c.querySelector('.acc-verdict').textContent.replace(/\s+/g, ' ').trim(),
    cobrar: [...document.querySelectorAll('.rulec')].map(x => x.querySelector('.rname').textContent.trim() + ' ' + x.querySelector('.rnow').textContent.trim()).join(' | '),
    neta: kpi('Ganancia neta'), dd: kpi('Colchón'), colchon: kpi('Colchón'), mejor: kpi('Ganancia neta'), cons: kpi('Consistencia'), riesgo: kpi('Riesgo de hoy'),
    mCons: mod('Consistencia'), mDD: mod('Colchón'), mRisk: mod('Riesgo de hoy'), mHoy: mod('Ganancia neta'),
    curva: [...c.querySelectorAll('.acc-rows.tri > div')].map(r => r.children[0].textContent.trim() + '=' + r.children[1].textContent.trim()).join(' · '),
    recientes: [...c.querySelectorAll('.acc-recent tbody tr')].length };
});
say('Balance esperado $25,315:', g.balance);
say('Delta esperado +$315:', g.delta);
say('Estado:', g.estado);
say('Consistencia esperada 54%:', g.cons);
say('Drawdown esperado $0/$1,000:', g.dd);
say('Colchón esperado $1,000:', g.colchon);
say('Mejor día esperado $170:', g.mejor);
say('Ganancia neta +$315:', g.neta);
say('Riesgo de hoy $0/$200:', g.riesgo);
console.log('  --- módulos ---');
say('Consistencia:', g.mCons);
say('Drawdown (suelo $24,315):', g.mDD);
say('Riesgo:', g.mRisk);
say('Hoy:', g.mHoy);
say('Curva:', g.curva);
say('Operaciones recientes:', g.recientes);
console.log('  --- estados ---');
say('Estado:', g.operar.slice(0, 120));
say('Vigilando:', g.cobrar.slice(0, 150));

console.log('=== estados de riesgo diario ===');
for (const [nombre, exit] of [['pérdida 100 (50%)', 20950], ['pérdida 160 (80%)', 20920], ['pérdida 200 (100%)', 20900]]) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(280);
  await p.fill('#ef_date', HOY); await p.fill('#ef_time', '10:30'); await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', '1');
  await p.selectOption('#ef_accountId', acctId);
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await p.waitForTimeout(400);
  await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
  const o = await p.evaluate(() => { const c = document.querySelector('.acct');
    const el = [...c.querySelectorAll('.metric')].find(x => /Riesgo de hoy/i.test(x.querySelector('.lab').textContent));
    return { chip: el.querySelector('.mtop .s').textContent.trim(), big: el.querySelector('.mtop .v').textContent.trim(), estado: c.querySelector('.acc-verdict .vtag').textContent.trim() }; });
  say(nombre + ':', o.chip + ' · queda ' + o.big + ' · ' + o.estado);
}
console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await b.close();
