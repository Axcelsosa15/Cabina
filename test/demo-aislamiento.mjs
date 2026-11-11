/* La demo no puede escribir, vaciar ni restaurar el historial real. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CONFIG_PRUEBA, quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const KEY = 'cabina-mnq:v1', TRASH = KEY + ':papelera';
const DATE = '2026-10-29', NOW = Date.parse('2026-10-30T16:00:00Z');
const URL = new globalThis.URL('../index.html', import.meta.url).href;
const browser = await chromium.launch();
const errors = [];
let assertions = 0;
function check(label, value) { assert.ok(value, label); assertions++; console.log('  ✅ ' + label); }
const backup = JSON.stringify({ format: 'cabina-backup', version: 1, days: {},
  trades: { t_importado: { id: 't_importado', type: 'futuros', date: DATE, instrument: 'MNQ',
    direction: 'long', qty: 1, entry: 21000, stop: 20990, exit: 21010 } } });

async function ready(page) {
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.FUT !== 'undefined');
  await quieto(page);
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
  const realDay = { date: DATE, closed: true, result: 1729, resultManual: true, trades: 1, note: 'DÍA REAL PRIVADO' };
  const seed = {
    settings: structuredClone(CONFIG_PRUEBA),
    days: { [DATE]: realDay },
    trades: {},
    journal: {
      jr_privado: {
        id: 'jr_privado', date: DATE, mood: 'Paciente',
        title: 'REFLEXIÓN REAL PRIVADA', body: 'no debe verse en demo', lesson: 'secreto'
      }
    }
  };
  const trash = { lista: 'histWrap', col: 'days', dias: true, regs: [{ ...realDay, note: 'RESTAURACIÓN REAL PRIVADA' }], cuando: NOW };
  await ctx.addInitScript(({ key, trashKey, data, pendingTrash, now }) => {
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(trashKey, JSON.stringify(pendingTrash));
    localStorage.setItem('cabina:migracion:mathengine:v1', '1');
    window.__financialWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key || k === trashKey) window.__financialWrites.push(k);
      return original.call(this, k, v);
    };
  }, { key: KEY, trashKey: TRASH, data: seed, pendingTrash: trash, now: NOW });
  const page = await ctx.newPage(); await ready(page);
  const before = await page.evaluate(([key, trashKey]) => [localStorage.getItem(key), localStorage.getItem(trashKey)], [KEY, TRASH]);
  await page.locator('#tabnav [data-tab="ajustes"]').click();
  await page.locator('#settingsTabPrefs').click();
  await page.locator('#demoToggle').click();
  await page.locator('#settingsDemoEnter').click();
  await page.locator('#demoBar').waitFor({ state: 'visible' });
  await page.locator('#settingsTabData').click();
  check('importar por archivo en demo muestra un aviso y no abre una confirmación destructiva',
    await page.locator('#bkImportOpen').isDisabled() && /Sal de la demo/.test(await page.locator('#bkNote').innerText()) && await page.locator('#ov').isHidden());
  check('pegar una copia también está bloqueado durante la demo', await page.locator('#bkPaste').isDisabled() && await page.locator('#ov').isHidden());
  // Simula que un selector iniciado antes termina después de entrar en demo.
  await page.locator('#bkFile').setInputFiles({ name: 'real.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await quieto(page);
  check('el callback de archivo tardío rechaza importar en demo', /Sal de la demo/.test(await page.locator('#bkNote').innerText()));
  await page.locator('#tabnav [data-tab="cabina"]').click();
  await page.evaluate(() => { const d = document.getElementById('cabOpsFold'); if (d) d.open = true; });
  const sameDay = page.locator('#histWrap tr[data-date="' + DATE + '"]');
  await sameDay.waitFor();
  await sameDay.locator('[data-act="del"]').click();
  check('borrar un día de ejemplo con fecha real coincidente exige salir de demo', /Sal de la demo/.test(await page.locator('#jSaved').innerText()));
  await page.locator('#selbtn-histWrap').click();
  await page.locator('#selbar-histWrap [data-sel="todo"]').click();
  await page.locator('#selbar-histWrap [data-sel="borrar"]').click();
  await page.locator('#selbar-histWrap [data-sel="si"]').click();
  check('borrar el historial en masa tampoco modifica días reales', /Sal de la demo/.test(await page.locator('#jSaved').innerText()));
  await page.locator('#papelera [data-pap="undo"]').click();
  check('deshacer en demo conserva la papelera real sin restaurarla sobre la base', /papelera real/.test(await page.locator('#jSaved').innerText()));
  await page.locator('#papelera [data-pap="ok"]').click();
  const after = await page.evaluate(([key, trashKey]) => [localStorage.getItem(key), localStorage.getItem(trashKey)], [KEY, TRASH]);
  check('importar, borrar, deshacer y descartar en demo dejan disco y papelera idénticos', JSON.stringify(before) === JSON.stringify(after));
  check('no se invoca ninguna escritura o vaciado del almacén financiero durante estos intentos', await page.evaluate(() => window.__financialWrites.length === 0));
  await page.locator('#tabnav [data-tab="diario"]').click();
  await page.waitForFunction(() => document.querySelector('.tab.active')?.dataset.tab === 'diario');
  const jrText = await page.locator('#jrList').innerText();
  check('demo no expone entradas personales del diario', !/REFLEXIÓN REAL PRIVADA|no debe verse|secreto/i.test(jrText));
  await ctx.close();

  // Una importación real ya confirmada tampoco se mezcla con la transición.
  const D = nubeDoble(), cloud = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
  const uid = await D.conSesion(cloud, 'importacion-pendiente@prueba.invalid');
  D.siembra(uid, 'settings/main', structuredClone(CONFIG_PRUEBA));
  let release, started;
  const gate = new Promise(r => { release = r; }), pending = new Promise(r => { started = r; });
  await cloud.route(D.NUBE + '/rest/v1/cabina_docs**', async route => {
    if (route.request().method() === 'POST' && route.request().postData()?.includes('t_importado')) { started(); await gate; }
    await route.fallback();
  });
  try {
    const p = await cloud.newPage(); await ready(p);
    await p.locator('#tabnav [data-tab="ajustes"]').click();
    await p.locator('#settingsTabData').click();
    await p.locator('#panelDatos .settings-details > summary').click();
    await p.locator('#bkPaste').click();
    await p.locator('#ef_j').fill(backup); await p.locator('#edSave').click();
    await p.locator('#ef_ok').waitFor();
    await p.locator('#ef_ok').fill('IMPORTAR'); await p.locator('#edSave').click();
    await pending;
    check('el editor espera la importación y bloquea un segundo guardado', await p.locator('#edSave').isDisabled());
    // Cerrar el diálogo no cancela una escritura que ya salió a la red.
    await p.locator('#edClose').click();
    await p.locator('#settingsTabPrefs').click();
    await p.locator('#guideOpen').click(); await p.locator('#guideDemo').click();
    await p.waitForFunction(() => /guardado pendiente|pending save/i.test(document.getElementById('guideStatus').textContent));
    check('una importación real en vuelo impide entrar en demo sin cancelar su escritura', await p.locator('#demoBar').isHidden());
    const response = p.waitForResponse(res => res.request().method() === 'POST' && res.request().postData()?.includes('t_importado'));
    release(); await response;
    check('la importación pendiente termina en la cuenta real', D.filasDe(uid).some(f => f.path === 'trades/t_importado'));
  } finally { release(); await cloud.close(); }
  check('los recorridos no generan errores de JavaScript', errors.length === 0);
} finally { await browser.close(); }
console.log('\n✅ demo-aislamiento · ' + assertions + ' comprobaciones correctas');
