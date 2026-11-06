import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { arrancada } from './espera.mjs';

const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/#cabina';
const browser = await chromium.launch();
try {
  for (const width of [390, 1500]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('**/*', route => route.request().url().startsWith(url.split('/#')[0] + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await arrancada(page, null);
    const open = () => page.locator('#cabLayoutEditor > summary').click();
    const inColumn = (number, id) => page.locator(`#cabLayoutColumns > div:nth-child(${number}) > #${id}`).count();
    await open();
    await page.locator('#cabLayoutAdd').click();
    await page.locator('#cabMove-panelRules').selectOption('3');
    assert.equal(await inColumn(3, 'panelRules'), 1);
    await page.locator('#cabLeft3').click();
    assert.equal(await inColumn(2, 'panelRules'), 1);
    await page.locator('#cabMove-panelLevels').selectOption('2');
    await page.locator('#cabUp-panelLevels').click();
    assert.equal(await page.locator('#cabLayoutColumns > div:nth-child(2) > :first-child').getAttribute('id'), 'panelLevels');

    if (width > 1000) {
      await page.locator('[data-layout-panel="panelLevels"] strong').dragTo(page.locator('[data-layout-panel="panelJournal"] strong'));
      assert.equal(await page.locator('#cabLayoutTop > :first-child').getAttribute('id'), 'panelLevels');
    }

    await page.locator('#cabToggle-panelRules').click();
    assert.equal(await page.locator('#panelRules').isVisible(), false);
    await page.reload();
    await arrancada(page, null);
    assert.equal(await inColumn(2, 'panelRules'), 1);
    assert.equal(await page.locator('#panelRules').isVisible(), false);
    await open();
    await page.locator('#cabToggle-panelRules').click();
    assert.equal(await page.locator('#panelRules').isVisible(), true);
    await page.locator('#cabRemove2').click();
    assert.equal(await page.locator('#cabLayoutBottom > #panelRules').count(), 1);
    await page.locator('#cabLayoutReset').click();
    assert.equal(await page.locator('#cabLayoutTop > :first-child').getAttribute('id'), 'panelJournal');
    assert.equal(await inColumn(2, 'panelRules'), 1);
    assert.equal(await page.locator('#cabLayoutColumns > div').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    console.log(`✅ ${width}px · paneles y columnas se mueven, se guardan y se restauran`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
