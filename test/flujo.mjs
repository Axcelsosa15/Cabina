import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(32) + v);
const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
p.on('pageerror', e => console.log('  PAGEERROR: ' + e.message));
const F = new Date('2026-09-16T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(900);
const HOY = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));

async function foto(tag) {
  const o = await p.evaluate(() => {
    const c = document.querySelector('.acct');
    const mod = n => { const el = [...c.querySelectorAll('.metric')].find(x => new RegExp(n.slice(0,6),'i').test(x.querySelector('.lab').textContent)); return el ? el.querySelector('.mtop .v').textContent.trim() : '?'; };
    const cal = document.querySelector('#calCab .d.today');
    return {
      balance: c.querySelector('.acc-figs .fig:first-child .v').textContent.trim(),
      delta: c.querySelector('.acc-figs .fig:first-child .s').textContent.trim(),
      hoy: mod('Hoy'), riesgo: mod('Riesgo de hoy'), dd: mod('Drawdown'),
      diario: document.getElementById('jResult').value,
      calendario: cal ? cal.textContent.replace(/\s+/g, ' ').trim() : '(sin celda)',
      calCls: cal ? cal.className : '',
      nFut: document.getElementById('nFut').textContent || '0',
      estado: c.querySelector('.acc-verdict .vtag').textContent.trim(),
    };
  });
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(500);
  const f = await p.evaluate(() => ({
    filas: document.querySelectorAll('#jrTable tbody tr').length,
    primera: (() => { const r = document.querySelector('#jrTable tbody tr'); return r ? [...r.children].slice(0, 12).map(c => c.textContent.trim()).join('|') : '—'; })(),
    pnl: (document.getElementById('ftTiles').textContent || '').replace(/\s+/g, ' ').match(/P&L neto(\S+)/)?.[1] || '—',
  }));
  await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
  console.log('  --- ' + tag + ' ---');
  say('Futuros: filas / P&L neto', f.filas + ' / ' + f.pnl);
  say('fila', f.primera.slice(0, 118));
  say('Balance cuenta / delta', o.balance + ' / ' + o.delta);
  say('Hoy · Riesgo · Drawdown', o.hoy + ' · ' + o.riesgo + ' · ' + o.dd);
  say('P&L diario (Cabina)', o.diario || '(vacío)');
  say('Calendario hoy', o.calendario + '  [' + o.calCls + ']');
  say('Estado de la cuenta', o.estado);
  return o;
}

console.log('=== PASO 1: operación ABIERTA (entrada + SL, sin salida) ===');
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(350);
await p.fill('#ef_date', HOY); await p.fill('#ef_time', '09:45'); await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', '2');
say('cuenta precargada', await p.evaluate(() => { const s = document.getElementById('ef_accountId'); return s.options[s.selectedIndex].textContent.trim(); }));
await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950');
await p.click('#edSave'); await p.waitForTimeout(700);
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
await foto('ABIERTA');

console.log('=== PASO 2: la misma operación, tocó el SL (salida = 20950) ===');
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(500);
await p.click('#jrTable tbody tr button[data-act="edit"]'); await p.waitForTimeout(400);
await p.fill('#ef_exit', '20950');
await p.click('#edSave'); await p.waitForTimeout(800);
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(500);
const d2 = await foto('CERRADA EN EL SL');
say('esperado P&L', '(20950-21000) * 2 ctos * $2 = -$200');

console.log('=== PASO 3: persistencia tras recargar ===');
await p.reload(); await p.waitForTimeout(1100);
await foto('TRAS RECARGAR');
await b.close();
