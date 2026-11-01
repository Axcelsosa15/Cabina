/* Refactorización por tareas: las advertencias siguen visibles cuando se
   pliega el análisis y las acciones conservan sus formularios reales. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { arrancada, quieto } from './espera.mjs';
import { sirvePublicado } from './publicado.mjs';

const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const errors = [];
let checks = 0;
const ok = (condition, text) => { assert.ok(condition, text); checks++; console.log('  ✅ ' + text); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('cabina-mnq:v1', JSON.stringify({ settings: { accounts: [], rules: [], meta: {
      investAccounts: [{ id: 'empty', name: 'Cuenta vacía', type: 'brokerage', currency: 'USD' }]
    } } }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await arrancada(page, '.tabbtn');
  await page.click('.tabbtn[data-tab="invest"]');
  await quieto(page);
  ok(await page.locator('#ivAnalysis').isHidden(), 'la cuenta vacía no muestra gráficos ni análisis sin datos');
  ok(await page.locator('#ivOverview').isHidden(), 'no hay diez métricas vacías al empezar');
  ok(await page.locator('#posAdd').isVisible() && await page.locator('#mDetail button[data-act="posadd"]').count() === 0, 'un único acceso para añadir la primera posición');
  ok(!(await page.locator('#marketGuide').evaluate(e => e.open)), 'la guía de mercado comienza cerrada');
  await page.click('#posAdd');
  await page.fill('#ef_asset', 'PRUEBA');
  await page.fill('#ef_qty', '2');
  await page.fill('#ef_entry', '100');
  await page.click('#edSave');
  await page.waitForFunction(() => INV.positions().length === 1);
  await quieto(page);
  ok(await page.locator('#ivDataStatus').isVisible(), 'los datos faltantes se muestran fuera del análisis plegado');
  const warning = await page.locator('#ivDataStatus').innerText();
  ok(/sin precio actual/.test(warning) && /usa el coste/.test(warning) && /sin plan de salida/.test(warning), 'faltan precio y plan: aviso explícito con la base de valoración');
  ok(await page.locator('#ivTiles .tile').count() === 3 && await page.locator('#ivSecondaryTiles .tile').count() === 7, 'tres cifras principales y siete secundarias conservadas');
  await page.locator('#ivAnalysis > summary').focus();
  await page.keyboard.press('Enter');
  ok(await page.locator('#ivAnalysis').evaluate(e => e.open), 'el análisis se abre con teclado');
  await page.evaluate(() => {
    const p = INV.positions()[0];
    INV.updatePosition(p.id, { current: 110, priceAt: Date.now(), exitPlan: 'Revisar al llegar a 120' });
  });
  await quieto(page);
  const status = await page.locator('#ivDataStatus').innerText();
  ok(!/sin precio actual|sin plan de salida/.test(status) && /Concentración/.test(status), 'se retiran avisos resueltos y permanece la concentración relevante');
  ok(await page.evaluate(() => INV.performance(INV.positions()[0].id).neto) === 20, 'el detalle conserva el resultado derivado de la posición');
  await page.selectOption('#ivAccountFilter', 'empty');
  await quieto(page);
  ok(await page.locator('#ivOverview').isHidden() && await page.locator('#ivAnalysis').isHidden(), 'el filtro de cuenta vacía conserva un estado inicial limpio');
  await page.selectOption('#ivAccountFilter', '__all');
  await quieto(page);
  ok(await page.locator('#ivOverview').isVisible(), 'volver a todas las cuentas recupera los datos');
  await page.locator('#marketGuide > summary').click();
  await page.click('#gEdit');
  ok(await page.locator('#marketGuide').evaluate(e => e.open) && await page.locator('#gSave').isVisible(), 'editar abre la guía y mantiene accesible Guardar');
  await page.locator('textarea[data-g="notes"]').fill('Nota de prueba');
  await page.click('#gSave');
  await page.locator('#marketGuide > summary').click();
  ok((await page.locator('#marketGuide').innerText()).includes('Nota de prueba'), 'guardar la guía conserva sus notas');

  await page.click('.tabbtn[data-tab="playbook"]');
  await quieto(page);
  ok(await page.locator('#pbExport').isHidden() && await page.locator('#pbNew').isVisible(), 'crear estrategia domina; transferencia queda bajo Más acciones');
  await page.locator('#pbMoreActions > summary').click();
  ok(await page.locator('#pbExport').isVisible() && await page.locator('#pbImport').isVisible(), 'importación y exportación siguen disponibles');
  await page.click('#pbNav [data-v="acciones"]');
  await page.click('#pbNew');
  await page.fill('#ef_name', 'Estrategia de prueba');
  await page.fill('#ef_context', 'Contexto extenso de la estrategia');
  await page.fill('#ef_invalidation', 'Sin confirmación');
  await page.fill('#ef_conditions', 'Esperar confirmación');
  await page.fill('#ef_costs', 'Comisiones declaradas');
  await page.click('#edSave');
  await page.waitForSelector('#pbCards .card');
  ok(await page.getByText('Sin confirmación', { exact: true }).isVisible() && await page.getByText('Esperar confirmación', { exact: true }).isVisible(), 'invalidación y condiciones permanecen visibles');
  ok(await page.getByText('Comisiones declaradas', { exact: true }).isVisible() && await page.getByText('Contexto extenso de la estrategia', { exact: true }).isHidden(), 'costes visibles y contexto bajo demanda');

  await page.click('.tabbtn[data-tab="ideas"]');
  await page.click('#idNew');
  const opportunityTitle = await page.locator('#edTitle').innerText();
  ok(/oportunidad/i.test(opportunityTitle), 'la acción usa el nombre de la tarea: ' + opportunityTitle);
  await page.fill('#ef_name', 'Oportunidad de prueba');
  await page.fill('#ef_how', 'Fundamento extenso');
  await page.fill('#ef_requirements', 'Capital disponible');
  await page.fill('#ef_killCriteria', 'Descartar si cambia la condición');
  await page.selectOption('#ef_risk', 'alto');
  await page.click('#edSave');
  await page.waitForSelector('#idCards .card');
  ok(await page.getByText('riesgo alto', { exact: true }).isVisible() && await page.getByText('Descartar si cambia la condición', { exact: true }).isVisible(), 'riesgo y descarte permanecen a la vista');
  ok(await page.getByText('Capital disponible', { exact: true }).isVisible() && await page.getByText('Fundamento extenso', { exact: true }).isHidden(), 'requisitos visibles y fundamento bajo demanda');
  ok(errors.length === 0, 'sin errores JavaScript');
  console.log(`\n${checks} aserciones · fallos: 0`);
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
