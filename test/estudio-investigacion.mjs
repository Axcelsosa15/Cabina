/* ESTUDIO · fuentes fechadas, vínculos a datos reales y backlinks. */
import { chromium } from 'playwright';
import { SEMILLA, quieto } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
await p.addInitScript(seed => {
  try {
    if (!localStorage.getItem('cabina-study-investigacion-seeded')) {
      localStorage.setItem('cabina-mnq:v1', typeof seed === 'string' ? seed : JSON.stringify(seed));
      localStorage.setItem('cabina-study-investigacion-seeded', '1');
    }
  } catch {}
}, SEMILLA);
await p.goto('file://' + process.cwd() + '/../index.html');
await p.waitForFunction(() => window.FUT && document.querySelector('#studyNew')); await quieto(p);
await p.click('.tabbtn[data-tab="estudio"]'); await quieto(p);

const tradeId = await p.evaluate(() => FUT.createTrade({
  type: 'futuros', accountId: '', instrument: 'NQ', direction: 'long', qty: 1,
  entry: 20000, stop: 19990, exit: 20010, date: '2026-10-20', time: '10:00'
}));
await p.click('#studyNew');
await p.fill('#studyTitle', 'Research alpha');
await p.fill('#studyQuestion', 'Hipótesis sobre el rendimiento real');
await p.fill('#studyAuthor', 'Research Desk');
await p.fill('#studyPublishedAt', '2026-10-10');
await p.fill('#studyConsultedAt', '2026-10-20');
await p.fill('#studyNextReview', '2000-01-01');
await p.fill('#studyUrl', 'https://example.com/research-alpha');
await p.fill('#studyEvidence', 'Hecho observado y fuente. '.repeat(90));
await p.fill('#studyCatalysts', 'CPI, FOMC y cambios en los rendimientos reales.');
await p.selectOption('#studyLinkType', 'trade'); await quieto(p);
await p.selectOption('#studyLinkTarget', String(tradeId));
await p.click('#studyLinkAdd');
ok(await p.locator('#studyLinksList').innerText().then(t => t.includes('NQ')), 'permite vincular una operación existente');
await p.locator('#studyForm').evaluate(form => form.requestSubmit());
await p.waitForFunction(() => !document.querySelector('#studyModal').classList.contains('open'));
await quieto(p);
ok((await p.locator('#studyGrid').innerText()).includes('Research Desk'), 'muestra autor/publicación en la ficha');
ok((await p.locator('#studyGrid').innerText()).includes('Revisión pendiente'), 'marca la próxima revisión vencida');
const doc1Id = await p.locator('#studyGrid .study-card button[data-study-edit]').first().getAttribute('data-study-edit');
ok(!!doc1Id, 'el documento guardado tiene ID estable');
await p.locator('#studyGrid .study-card').filter({ hasText: 'Research alpha' }).locator('button[data-study-read]').click();
await p.waitForFunction(() => document.querySelector('#studyReader').classList.contains('open'));
ok(!(await p.locator('#studyReaderToc').isHidden()), 'la lectura enfocada crea índice para documentos largos');
ok((await p.locator('#studyReaderContent').innerText()).includes('Catalizadores'), 'la lectura separa catalizadores y evidencia');
await p.click('#studyReaderClose'); await quieto(p);
await p.fill('#studyFrom', '2026-10-21'); await p.fill('#studyTo', '2026-10-25'); await quieto(p);
ok(!(await p.locator('#studyGrid').innerText()).includes('Research alpha'), 'filtra por fecha consultada');
await p.fill('#studyFrom', ''); await p.fill('#studyTo', '2026-10-25'); await quieto(p);
ok((await p.locator('#studyGrid').innerText()).includes('Research alpha') && !(await p.locator('#studyGrid').innerText()).includes('Research beta'),
   'el filtro de fecha consultada no sustituye la fecha de publicación');

await p.click('#studyNew');
await p.fill('#studyTitle', 'Research beta');
await p.fill('#studyQuestion', 'Una nota enlazada');
await p.fill('#studyPublishedAt', '2026-10-20');
await p.selectOption('#studyLinkType', 'research'); await quieto(p);
await p.selectOption('#studyLinkTarget', doc1Id);
await p.click('#studyLinkAdd');
await p.locator('#studyForm').evaluate(form => form.requestSubmit());
await p.waitForFunction(() => !document.querySelector('#studyModal').classList.contains('open'));
await quieto(p);
const alpha = p.locator('#studyGrid .study-card').filter({ hasText: 'Research alpha' });
ok((await alpha.innerText()).includes('Referenciado por') && (await alpha.innerText()).includes('Research beta'), 'muestra backlinks desde otro documento');
await p.click('[data-study-filter="review"]'); await quieto(p);
ok((await p.locator('#studyGrid').innerText()).includes('Research alpha'), 'el filtro encuentra documentos cuya revisión venció');

await p.reload(); await p.waitForFunction(() => window.FUT && document.querySelector('#studyNew')); await quieto(p);
await p.click('.tabbtn[data-tab="estudio"]'); await quieto(p);
const editAlpha = p.locator('#studyGrid .study-card').filter({ hasText: 'Research alpha' }).locator('button[data-study-edit]').first();
await editAlpha.click();
ok(await p.inputValue('#studyAuthor') === 'Research Desk', 'autor y metadatos persisten tras recargar');
ok(await p.inputValue('#studyCatalysts') === 'CPI, FOMC y cambios en los rendimientos reales.', 'los catalizadores persisten tras recargar');
ok(await p.locator('#studyLinksList').innerText().then(t => t.includes('NQ')), 'el vínculo a la operación persiste');
ok(errores.length === 0, 'sin errores JavaScript', errores.join(' | ') || 'ninguno');

await b.close();
console.log(`\\n${fallos.length ? '❌' : '✅'} estudio-investigacion · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
