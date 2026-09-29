import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const errs = []; const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(32) + v);
const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: ' + t); });
const F = new Date('2026-09-16T14:00:00Z').getTime();
await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
await conCuentas(p);
await p.goto(URL); await p.waitForTimeout(900);
const HOY = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));

console.log('=== A. botón con la pre-sesión incompleta ===');
say('botón Cabina:', await p.evaluate(() => { const b = document.getElementById('qtGo'); return b.textContent.trim() + ' · gated=' + b.classList.contains('gated') + ' · ' + b.title.slice(0, 60); }));
await p.fill('#qtSym', 'MNQ'); await p.waitForTimeout(200); await p.click('#qtGo'); await p.waitForTimeout(450);
say('aviso en el editor:', await p.evaluate(() => { const g = document.querySelector('#edFields .gate'); return g ? g.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : '(sin aviso)'; }));
await p.fill('#ef_time', '09:45'); await p.fill('#ef_qty', '2'); await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950');
await p.click('#edSave'); await p.waitForTimeout(700);
say('marcada fuera de protocolo:', await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('cabina-mnq:v1') || '{}'); const t = Object.values(d.trades || {})[0]; return t && t.offProtocol ? t.offProtocol.join(' · ').slice(0, 80) : '(no)'; }));

console.log('=== B. el stop no cierra: un clic lo hace ===');
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(600);
say('celda de salida:', await p.evaluate(() => { const c = document.querySelector('#jrTable tbody tr .hitstop'); return c ? c.textContent.trim() + ' · disabled=' + c.disabled : '(sin botón)'; }));
say('P&L antes:', await p.evaluate(() => (document.getElementById('ftTiles').textContent || '').replace(/\s+/g, ' ').match(/P&L neto(\S+?)\d+ operac/)?.[1] || '—'));
await p.click('#jrTable tbody tr .hitstop'); await p.waitForTimeout(800);
say('P&L después:', await p.evaluate(() => (document.getElementById('ftTiles').textContent || '').replace(/\s+/g, ' ').match(/P&L neto(-?\$[\d,]+)/)?.[1] || '—'));
await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(600);
say('balance cuenta:', await p.evaluate(() => document.querySelector('.acc-figs .fig:first-child .v').textContent.trim()));
say('P&L diario:', await p.inputValue('#jResult'));
say('calendario hoy:', await p.evaluate(() => { const c = document.querySelector('#calCab .d.today'); return c.textContent.replace(/\s+/g, ' ').trim() + ' [' + c.className + ']'; }));
say('estado cuenta:', await p.evaluate(() => document.querySelector('.acc-verdict .vtag').textContent.trim()));

console.log('=== C. instrumento desconocido ya no inventa el P&L ===');
await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew'); await p.waitForTimeout(350);
await p.fill('#ef_date', HOY); await p.fill('#ef_time', '11:00'); await p.fill('#ef_instrument', 'XYZ'); await p.fill('#ef_qty', '1');
await p.fill('#ef_entry', '100'); await p.fill('#ef_stop', '90'); await p.fill('#ef_exit', '110');
await p.click('#edSave'); await p.waitForTimeout(700);
await p.click('#ftSeg button[data-v="diario"]'); await p.waitForTimeout(500);
say('fila XYZ:', await p.evaluate(() => { const r = [...document.querySelectorAll('#jrTable tbody tr')].find(x => /XYZ/.test(x.textContent)); return r ? [...r.children].slice(0, 13).map(c => c.textContent.trim()).join('|') : '(no)'; }));
say('(antes daría $20 inventados con el multiplicador del MNQ)', '');

console.log('\n--- errores js ---'); console.log(errs.length ? errs.join('\n') : 'none');
await b.close();
