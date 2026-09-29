import { chromium } from 'playwright';
import { conCuentas } from './espera.mjs';
const URL = 'file://' + process.cwd() + '/preview.html';
const b = await chromium.launch();
const say = (k, v) => console.log('  ' + String(k).padEnd(34) + v);
async function nueva() {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  p.on('pageerror', e => console.log('  PAGEERROR: ' + e.message));
  await conCuentas(p);
  await p.goto(URL); await p.waitForTimeout(900); return p;
}
async function verFuturos(p, tag) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.waitForTimeout(600);
  const o = await p.evaluate(() => ({
    nFut: document.getElementById('nFut').textContent,
    tiles: (document.getElementById('ftTiles').textContent || '').replace(/\s+/g, ' ').slice(0, 70),
    filtros: ['ftAcct', 'ftRange', 'ftSetup', 'ftInstr', 'ftSes'].map(id => { const s = document.getElementById(id); return id + '=' + (s.value || '·'); }).join(' '),
    filas: document.querySelectorAll('#jrTable tbody tr').length,
    meta: document.getElementById('jrMeta').textContent,
  }));
  say(tag + ' contador:', o.nFut || '(vacío)');
  say(tag + ' tiles:', o.tiles);
  say(tag + ' filtros:', o.filtros);
  say(tag + ' filas en tabla:', o.filas + ' · ' + o.meta);
  return o;
}

console.log('=== A. registrar una pérdida desde Cabina, sin tocar nada más ===');
{
  const p = await nueva();
  await p.fill('#qtSym', 'MNQ'); await p.waitForTimeout(200); await p.click('#qtGo'); await p.waitForTimeout(400);
  await p.fill('#ef_time', '10:30'); await p.fill('#ef_qty', '2');
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', '20960');
  await p.click('#edSave'); await p.waitForTimeout(600);
  say('resultado en Cabina:', await p.inputValue('#jResult'));
  await verFuturos(p, 'A');
  await p.context().close();
}

console.log('=== B. tras usar el botón «Journal» de una cuenta ===');
{
  const p = await nueva();
  await p.click('.acc-acts [data-act="journal"]'); await p.waitForTimeout(600);
  say('filtro tras pulsar Journal:', await p.evaluate(() => document.getElementById('ftAcct').selectedOptions[0].textContent));
  await p.click('.tabbtn[data-tab="cabina"]'); await p.waitForTimeout(400);
  await p.fill('#qtSym', 'MNQ'); await p.waitForTimeout(200); await p.click('#qtGo'); await p.waitForTimeout(400);
  say('cuenta precargada:', await p.evaluate(() => { const s = document.getElementById('ef_accountId'); return s.options[s.selectedIndex].textContent.trim(); }));
  await p.selectOption('#ef_accountId', '');
  await p.fill('#ef_time', '10:30'); await p.fill('#ef_qty', '2');
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', '20960');
  await p.click('#edSave'); await p.waitForTimeout(600);
  say('resultado en Cabina:', await p.inputValue('#jResult'));
  await verFuturos(p, 'B');
  await p.context().close();
}

console.log('=== C. registrar desde el propio tab de Futuros ===');
{
  const p = await nueva();
  await p.click('.acc-acts [data-act="journal"]'); await p.waitForTimeout(600);
  await p.click('#ftNew'); await p.waitForTimeout(350);
  const hoy = await p.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  await p.fill('#ef_date', hoy); await p.fill('#ef_time', '10:30'); await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', '2');
  await p.selectOption('#ef_accountId', '');
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20950'); await p.fill('#ef_exit', '20960');
  await p.click('#edSave'); await p.waitForTimeout(700);
  await verFuturos(p, 'C');
  say('C diario:', await p.evaluate(async () => { document.querySelector('#ftSeg button[data-v="diario"]').click(); await new Promise(r => setTimeout(r, 500)); return document.getElementById('dayTitle').textContent + ' · ' + document.querySelectorAll('#dayBody tbody tr:not(.sesrow)').length + ' filas'; }));
  await p.context().close();
}
await b.close();
