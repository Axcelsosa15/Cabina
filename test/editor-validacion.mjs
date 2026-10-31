/* Generic editor: validation must remain visible and tied to the exact input.
   Uses the real published assets and synthetic browser storage only. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = sirvePublicado(readFileSync(join(root, 'index.html')));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const errors = [];
const failures = [];
const ok = (pass, label, detail = '') => {
  console.log((pass ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!pass) failures.push(label);
};
try {
  for (const [mode, viewport] of [['light', {width: 1280, height: 850}], ['dark', {width: 390, height: 844}]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(mode => {
      localStorage.setItem('cabina-appearance:v1', JSON.stringify({ mode, accent: 'default', custom: '#1d4ed8' }));
    }, mode);
    await page.goto('http://127.0.0.1:' + server.address().port + '/', {waitUntil: 'load'});
    await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, {timeout: 20000});
    await page.locator('.tabbtn[data-tab="futuros"]').click();
    await page.locator('#ftNew').click();
    const before = await page.locator('#edTitle').textContent();
    await page.locator('#ef_date').fill('');
    await page.locator('#edSave').click();
    let a = await page.evaluate(() => ({
      title: document.getElementById('edTitle').textContent,
      summary: document.getElementById('edValidation').textContent,
      visible: !document.getElementById('edValidation').hidden,
      role: document.getElementById('edValidation').getAttribute('role'),
      invalid: document.getElementById('ef_date').getAttribute('aria-invalid'),
      described: document.getElementById('ef_date').getAttribute('aria-describedby'),
      localText: document.getElementById('ef_date_error')?.textContent,
      focus: document.activeElement?.id,
      ops: FUT.trades().length
    }));
    ok(a.title === before && /Falta la fecha/.test(a.summary) && a.visible && a.role === 'alert', mode + ': dialog title remains stable; alert persists');
    ok(a.invalid === 'true' && a.described?.includes('ef_date_error') && /Falta la fecha/.test(a.localText || '') && a.focus === 'ef_date',
      mode + ': exact input exposes and receives focus for error');
    ok(a.ops === 0, mode + ': rejected trade is not persisted');

    await page.locator('#ef_date').fill('2026-10-30');
    let cleared = await page.evaluate(() => ({
      hidden: document.getElementById('edValidation').hidden,
      invalid: document.getElementById('ef_date').hasAttribute('aria-invalid'),
      hint: !!document.getElementById('ef_date_error')
    }));
    ok(cleared.hidden && !cleared.invalid && !cleared.hint, mode + ': correcting input clears its error');

    await page.locator('#ef_instrument').fill('MNQ');
    await page.locator('#ef_qty').fill('0');
    await page.locator('#edSave').click();
    let next = await page.evaluate(() => ({
      summary: document.getElementById('edValidation').textContent,
      invalid: document.getElementById('ef_qty').getAttribute('aria-invalid'),
      local: document.getElementById('ef_qty_error')?.textContent,
      value: document.getElementById('ef_qty').value,
      ops: FUT.trades().length
    }));
    ok(/contratos tienen que ser/i.test(next.summary) && next.invalid === 'true' && next.local === next.summary && next.value === '0' && next.ops === 0,
      mode + ': invalid quantity is identified without losing input');
    await page.locator('#ef_qty').fill('1');
    await page.locator('#edSave').click();
    await page.waitForTimeout(250);
    ok(await page.evaluate(() => FUT.trades().length) === 1, mode + ': valid trade saves after correction');
    await context.close();
  }
  ok(errors.length === 0, 'no runtime exceptions', errors.join(' | '));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (failures.length) process.exit(1);
console.log('PASS editor-validacion');
