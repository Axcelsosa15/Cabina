/* Editor abort + quick-add re-entrancy.
   1) Double-firing quick-add must create only one trade.
   2) Source contracts for onSave===false and study empty-title. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const server = sirvePublicado(readFileSync(join(root, 'index.html')));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const failures = [];
const ok = (pass, label, detail = '') => {
  console.log((pass ? '✅' : '❌') + ' ' + label + (detail ? ' · ' + detail : ''));
  if (!pass) failures.push(label);
};

ok(/keepOpen = cfg\.onSave\(v\) === false/.test(app), 'edSave honors onSave === false');
ok(/qk\.guardando/.test(app), 'quick-add tracks in-flight flag');
ok(/false = el editor genérico NO cierra/.test(app), 'position account-change abort returns false');
ok(/Escribe un título para el documento/.test(app), 'study form surfaces empty-title message');

const page = await browser.newPage();
const errors = [];
page.on('pageerror', err => errors.push(err.message));
await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

await page.locator('#quickBtn').click();
await page.waitForSelector('#quickOv.open');
await page.locator('#qkText').fill('NQ +185');
await page.waitForFunction(() => !document.getElementById('qkSave').disabled);
const before = await page.evaluate(() => FUT.trades().filter(t => t.source === 'quick_add').length);
await page.evaluate(() => {
  const btn = document.getElementById('qkSave');
  btn.click();
  btn.click();
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => FUT.trades().filter(t => t.source === 'quick_add').length);
ok(after === before + 1, 'quick-add double click creates a single trade', `before=${before} after=${after}`);
ok(errors.length === 0, 'no runtime exceptions', errors.join(' | ') || 'ok');

await browser.close();
server.close();
if (failures.length) { console.error('FAIL editor-abort-guard'); process.exit(1); }
console.log('PASS editor-abort-guard');
