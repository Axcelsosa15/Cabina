/* Una subida real debe terminar y vincularse antes de sustituir datos por demo. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { nubeDoble } from './nube-doble.mjs';
import { CONFIG_PRUEBA, quieto } from './espera.mjs';

const D = nubeDoble();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1320, height: 950 } });
const errors = [];
let releaseUpload, uploadStarted;
const uploadGate = new Promise(resolve => { releaseUpload = resolve; });
const started = new Promise(resolve => { uploadStarted = resolve; });
let assertions = 0;
function check(label, predicate) {
  assert.ok(predicate, label); assertions++; console.log('  ✅ ' + label);
}
try {
  const uid = await D.conSesion(ctx, 'demo-captura@prueba.invalid');
  const setup = { id: 'p_real', type: 'futuros', kind: 'futuros', status: 'activo',
    name: 'SETUP REAL PRIVADO', version: 1, order: 1, createdAt: Date.now(), updatedAt: Date.now() };
  D.siembra(uid, 'settings/main', structuredClone(CONFIG_PRUEBA));
  D.siembra(uid, 'playbooks/p_real', setup);
  D.siembra(uid, 'trades/t_real', { id: 't_real', type: 'futuros', date: '2026-10-30',
    instrument: 'MNQ', direction: 'long', entry: 21000, stop: 20990, exit: 21010, qty: 1 });
  await ctx.route(D.NUBE + '/storage/v1/object/**', async route => {
    if (route.request().method() === 'POST') { uploadStarted(); await uploadGate; }
    await route.fallback();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('../index.html', import.meta.url).href);
  await page.waitForFunction(() => typeof window.FUT !== 'undefined');
  await page.locator('#tabnav [data-tab="playbook"]').click();
  await page.locator('#pbCards .card[data-id="p_real"]').waitFor();
  await page.locator('#pbCards .card[data-id="p_real"] [data-act="img"]').click();
  await page.locator('#pbFile').setInputFiles({ name: 'real-pendiente.png', mimeType: 'image/png', buffer: PNG });
  await started;
  await page.locator('#tabnav [data-tab="ajustes"]').click();
  await page.locator('#settingsTabPrefs').click();
  await page.locator('#guideOpen').click();
  await page.locator('#guideDemo').click();
  await page.waitForFunction(() => /guardado pendiente|pending save/i.test(document.getElementById('guideStatus').textContent));
  check('la guía rechaza entrar en demo mientras la subida real sigue pendiente', await page.locator('#demoBar').isHidden());
  check('la colección visible todavía contiene el trade real', await page.evaluate(() => FUT.trades().some(t => t.id === 't_real')));
  await page.locator('#guideClose').click();
  const saved = page.waitForResponse(res => ['POST', 'PATCH'].includes(res.request().method()) &&
    res.url().includes('/rest/v1/cabina_docs') && res.request().postData()?.includes('real-pendiente.png'));
  releaseUpload();
  await saved;
  await quieto(page);
  const real = D.filasDe(uid).find(f => f.path === 'playbooks/p_real')?.data;
  check('al terminar se vincula la captura a la ficha real antes de permitir demo', real?.images?.length === 1 && real.images[0].name === 'real-pendiente.png');
  check('la imagen queda en el bucket privado del dueño real', D.e.objetos.size === 1 && [...D.e.objetos.keys()][0].startsWith(uid + '/'));
  await page.locator('#guideOpen').click();
  await page.locator('#guideDemo').click();
  await page.locator('#demoBar').waitFor({ state: 'visible' });
  check('después de completar subida y vínculo sí se puede entrar en demo', await page.locator('#demoBar').isVisible());
  check('la demo no sobrescribe la referencia persistida del setup real', D.filasDe(uid).find(f => f.path === 'playbooks/p_real')?.data?.images?.[0]?.id === real.images[0].id);
  check('la demo conserva el trade real en la base', D.filasDe(uid).some(f => f.path === 'trades/t_real'));
  check('el recorrido no genera errores de JavaScript', errors.length === 0);
} finally {
  releaseUpload();
  await ctx.close();
  await browser.close();
}
console.log('\n✅ demo-capturas-pendientes · ' + assertions + ' comprobaciones correctas');
