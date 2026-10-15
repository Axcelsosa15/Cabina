/* ESTUDIO VISUAL · una revisión enseña el razonamiento, no solo el resultado. */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siembra, quieto } from './espera.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + join(raiz, 'index.html');
const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await siembra(p, URL, { settings: { meta: {}, accounts: [], rules: [] }, trades: {}, research: {} });
await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 15000 });
// El test es de interfaz: usa el modo demo para que la escritura no dependa
// de credenciales ni de una conexión real con Supabase.
await p.click('#demoToggle');
await p.evaluate(() => {
  FUT.createAccount({ id: 'study-visual-account', name: 'Cuenta de estudio', kind: 'evaluacion', status: 'evaluacion' });
  FUT.createTrade({ id: 'study-visual-trade', type: 'futuros', accountId: 'study-visual-account', date: '2026-10-01', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21000, exit: 21025, stop: 20975 });
});
await p.click('.tabbtn[data-tab="estudio"]');
await quieto(p, 50, 3000);
await p.waitForSelector('[data-study-trade="study-visual-trade"]', { timeout: 10000 });

console.log('\n═══ ESTUDIO · convierte una operación en una lección ═══');
ok(await p.isVisible('#studyTradeSetup'), 'incluye clasificación de setup');
ok(await p.isVisible('#studyTradeVisual'), 'incluye lectura visual guiada del gráfico');
ok(await p.isVisible('#studyTradeInvalidation'), 'pide evidencia contraria e invalidación');
ok(await p.isVisible('#studyTradeRulesFollowed'), 'separa disciplina del resultado');
ok(await p.isVisible('#studyTradeShotsHost'), 'tiene zona de capturas integrada en la revisión');
ok(await p.isVisible('#studyTradeReviewForm'), 'abre una revisión vinculada al trade seleccionado');

await p.selectOption('#studyTradeSetup', 'IFVG');
await p.fill('#studyTradeVisual', 'Barrido de liquidez y desplazamiento; esperé confirmación antes de entrar.');
await p.fill('#studyTradeInvalidation', 'La idea queda invalidada si recupera el nivel barrido y cierra contra el sesgo.');
await p.check('#studyTradeRulesFollowed');
await p.fill('#studyTradePlan', 'Esperaba continuación después del desplazamiento.');
await p.fill('#studyTradeExecution', 'Entrada después de la confirmación; revisar el stop.');
await p.fill('#studyTradeLesson', 'No perseguir el precio si ya se alejó del nivel.');
await p.click('#studyTradeReviewForm button[type="submit"]');
await p.waitForFunction(() => /Revisión guardada/.test(document.querySelector('#studyTradeSaveState')?.textContent || ''), null, { timeout: 10000 });
ok(true, 'guarda la revisión y sus campos educativos');

await p.click('[data-study-trade="study-visual-trade"]');
await quieto(p, 50, 3000);
ok(await p.inputValue('#studyTradeSetup') === 'IFVG', 'el setup se conserva al volver a abrir la operación');
ok((await p.inputValue('#studyTradeVisual')).includes('Barrido de liquidez'), 'la lectura visual persiste');
ok((await p.inputValue('#studyTradeInvalidation')).includes('invalidada'), 'la invalidación persiste');
ok(await p.isChecked('#studyTradeRulesFollowed'), 'la evaluación de reglas persiste');
ok(errs.length === 0, 'sin errores JavaScript', errs.join(' | ') || 'ninguno');

await b.close();
console.log(fallos.length ? `\\n  ${fallos.length} fallos` : '\\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
