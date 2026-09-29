import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(36) + v);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
const F = new Date('2026-09-17T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);

// Historial PREVIO a la migración, escrito con la forma del motor viejo:
// dos días verdes, campos derivados grabados (como haría una versión antigua),
// y una operación en un instrumento que el motor no conoce.
await p.addInitScript(() => {
  const K = 'cabina-mnq:v1';
  const d = { trades: {} };
  const mk = (id, date, time, instr, qty, entry, stop, exit, extra) => Object.assign({
    id, type: 'futuros', date, time, instrument: instr, qty, entry, stop, exit,
    direction: 'long', accountId: 'prop25',
    pnlEff: 999, rReal: 9.9, riskUsd: 999,       // basura del motor viejo, a propósito
  }, extra || {});
  d.trades.t1 = mk('t1', '2026-09-15', '09:45', 'MNQ', 2, 21000, 20950, 21042.5); // 42.5 pts x 2 ctos x $2 = +170
  d.trades.t2 = mk('t2', '2026-09-16', '09:50', 'MNQ', 2, 21000, 20950, 21036.25); // 36.25 x 2 x 2 = +145
  d.trades.t3 = mk('t3', '2026-09-16', '11:30', 'FOO', 1, 100, 90, 120);          // símbolo desconocido
  localStorage.setItem(K, JSON.stringify(d));
});
const dl = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(3200);

console.log('=== (c) respaldo + migración ===');
const file = await dl;
say('respaldo descargado:', file ? file.suggestedFilename() : '(ninguno)');
say('panel visible:', await p.locator('#migPanel').isVisible());
say('resumen:', (await p.textContent('#migPanel .hint')).replace(/\s+/g, ' ').slice(0, 155));
say('afectadas:', await p.evaluate(() => [...document.querySelectorAll('#migPanel tbody tr')].map(r => [...r.children].slice(0, 7).map(c => c.textContent.trim()).join(' | ')).join('\n' + ' '.repeat(38))));
say('derivados borrados en disco:', await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('cabina-mnq:v1')); return Object.values(d.trades).every(t => t.pnlEff === undefined && t.rReal === undefined && t.riskUsd === undefined); }));

console.log('=== (e) tus cinco números ===');
await p.evaluate(() => document.querySelector('.acc-acts [data-act="cfg"]').click()); await p.waitForTimeout(400);
await p.fill('#ef_size', '25000'); await p.fill('#ef_dd', '1000'); await p.fill('#ef_limit', '50');
await p.fill('#ef_total', '0'); await p.fill('#ef_best', '0'); await p.fill('#ef_target', '0');
await p.click('#edSave'); await p.waitForTimeout(900);
const v = await p.evaluate(() => {
  const c = document.querySelector('.acct');
  const mod = n => [...c.querySelectorAll('.metric')].find(x => x.querySelector('.lab').textContent.replace(/[\s\u25b8\u25be]+$/,'').trim() === n) || null;
  // las filas de detalle viven ahora dentro de la métrica desplegable
  const fila = (el, lb) => { if (!el) return '?'; const r = [...el.querySelectorAll('.mdet > div')].find(x => x.children[0].textContent.trim() === lb); return r ? r.children[1].textContent.trim() : '?'; };
  const cons = mod('Consistencia'), dd = mod('Colchón');
  const pico = [...c.querySelectorAll('.acc-rows.tri > div')].find(x => /Pico/.test(x.children[0].textContent));
  return {
    balance: c.querySelector('.acc-figs .fig:first-child .v').textContent.trim(),
    pico: pico ? pico.children[1].textContent.trim() : '?',
    suelo: fila(dd, 'Suelo de la cuenta'),
    consistencia: cons.querySelector('.mtop .v').textContent.trim(),
    estado: cons.querySelector('.mtop .s').textContent.trim(),
    falta: fila(cons, 'Ganancia que falta'),
    necesario: fila(cons, 'Total necesario'),
  };
});
const esperado = { balance: '$25,315', pico: '$25,315', suelo: '$24,315', consistencia: '53.97%', estado: 'límite 50% · lo supera', falta: '+$25' };
for (const k of Object.keys(esperado)) {
  const ok = v[k] === esperado[k];
  say((ok ? '✓ ' : '✗ ') + k + ':', v[k] + (ok ? '' : '   (esperabas ' + esperado[k] + ')'));
}
say('  total necesario:', v.necesario);
console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await b.close();
