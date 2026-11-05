/* ESTUDIO · fuentes fechadas, vínculos a datos reales y backlinks. */
import { chromium } from 'playwright';
import { SEMILLA, quieto } from './espera.mjs';

const fallos = [], errores = [];
const SEMILLA_OBJ = JSON.parse(SEMILLA);
SEMILLA_OBJ.settings.meta.investAccounts = [
  { id: 'estudio-broker', name: 'Cartera de prueba', broker: 'Bróker de prueba' },
];
SEMILLA_OBJ.research = {
  legacy: { id: 'legacy', title: 'Concepto previo', type: 'concept', tags: 'Original, Riesgo', question: 'Texto guardado antes del cambio.' },
};
const especulacion = 'Escenario termoclina <img src=x onerror=alert(1)>';
const tesis = 'El rebalanceo mensual ampliará el diferencial.';
const contra = 'La muestra de junio contradice la relación.';
const preguntas = '¿Qué explica la asimetría nocturna?';
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
}, SEMILLA_OBJ);
await p.goto('file://' + process.cwd() + '/../index.html');
await p.waitForFunction(() => window.FUT && document.querySelector('#studyNew')); await quieto(p);
await p.click('.tabbtn[data-tab="estudio"]'); await quieto(p);

const tradeId = await p.evaluate(() => FUT.createTrade({
  type: 'futuros', accountId: '', instrument: 'NQ', direction: 'long', qty: 1,
  entry: 20000, stop: 19990, exit: 20010, date: '2026-10-20', time: '10:00'
}));
await p.click('#studyNew');
ok(await p.locator('#studyThesis').isHidden() && await p.locator('#studyOpenQuestions').isHidden(),
   'un concepto nuevo mantiene el formulario breve');
await p.selectOption('#studyType', 'brief');
ok(await p.locator('#studyEvidenceLabel').innerText() === 'Evidencia a favor',
   'el brief distingue la evidencia a favor en el editor');
await p.fill('#studyThesis', tesis);
await p.fill('#studyEvidenceAgainst', contra);
await p.fill('#studyCounter', 'Riesgo de liquidez.');
await p.fill('#studyOpenQuestions', preguntas);
await p.selectOption('#studyType', 'concept');
ok(await p.locator('#studyThesis').isVisible() && await p.inputValue('#studyThesis') === tesis,
   'cambiar temporalmente el tipo no descarta un borrador');
await p.selectOption('#studyType', 'brief');
await p.fill('#studyTitle', 'Research alpha');
await p.fill('#studyQuestion', 'Hipótesis sobre el rendimiento real');
await p.fill('#studyTopic', 'Energía');
await p.fill('#studyTags', 'Inflación, Dólar');
await p.selectOption('#studyStatus', 'progressing');
await p.fill('#studyConclusion', 'Mi interpretación provisional.');
await p.fill('#studySpeculation', especulacion);
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
await p.selectOption('#studyLinkType', 'invest-account');
await p.selectOption('#studyLinkTarget', 'estudio-broker');
await p.click('#studyLinkAdd');
ok((await p.locator('#studyLinksList').innerText()).includes('Cartera de prueba'),
   'permite vincular la cuenta de inversión existente');

await p.locator('#studyForm').evaluate(form => form.requestSubmit());
await p.waitForFunction(() => !document.querySelector('#studyModal').classList.contains('open'));
await quieto(p);
ok((await p.locator('#studyGrid').innerText()).includes('Research Desk'), 'muestra autor/publicación en la ficha');
ok((await p.locator('#studyGrid').innerText()).includes('Revisión pendiente'), 'marca la próxima revisión vencida');
const doc1Id = await p.locator('#studyGrid .study-card').filter({ hasText: 'Research alpha' })
  .locator('button[data-study-edit]:not(.study-tag)').first().getAttribute('data-study-edit');
ok(!!doc1Id, 'el documento guardado tiene ID estable');
await p.locator('#studyGrid .study-card').filter({ hasText: 'Research alpha' }).locator('button[data-study-read]').click();
await p.waitForFunction(() => document.querySelector('#studyReader').classList.contains('open'));
ok(!(await p.locator('#studyReaderToc').isHidden()), 'la lectura enfocada crea índice para documentos largos');
ok((await p.locator('#studyReaderContent').innerText()).includes('Catalizadores'), 'la lectura separa catalizadores y evidencia');
ok((await p.locator('#study-reader-speculation').innerText()).includes(especulacion) &&
   (await p.locator('#study-reader-conclusion').innerText()).includes('Mi interpretación provisional.') &&
   (await p.locator('#study-reader-evidence').innerText()).includes('Hecho observado y fuente.'),
   'hechos, interpretación y especulación tienen secciones propias');
ok(await p.locator('#study-reader-speculation img').count() === 0, 'la especulación se muestra como texto');
ok((await p.locator('#study-reader-thesis').innerText()).includes(tesis) &&
   (await p.locator('#study-reader-evidence-against').innerText()).includes(contra) &&
   (await p.locator('#study-reader-counter').innerText()).includes('Riesgo de liquidez.') &&
   (await p.locator('#study-reader-open-questions').innerText()).includes(preguntas),
   'el lector separa tesis, evidencia contraria, riesgos y preguntas abiertas');
ok(await p.locator('#studyReaderToc [data-study-reader-section="open-questions"]').count() === 1,
   'las preguntas abiertas aparecen en el índice de un brief largo');
await p.locator('#studyReaderContext [data-study-link-type="invest-account"]').click();
ok(await p.evaluate(() => location.hash) === '#invest' && await p.inputValue('#ef_name') === 'Cartera de prueba',
   'el vínculo abre la cuenta de inversión original');
await p.click('#edClose');
await p.click('.tabbtn[data-tab="estudio"]'); await quieto(p);
await p.fill('#studyFrom', '2026-10-21'); await p.fill('#studyTo', '2026-10-25'); await quieto(p);
ok(!(await p.locator('#studyGrid').innerText()).includes('Research alpha'), 'filtra por fecha consultada');
await p.fill('#studyFrom', ''); await p.fill('#studyTo', '2026-10-25'); await quieto(p);
ok((await p.locator('#studyGrid').innerText()).includes('Research alpha') && !(await p.locator('#studyGrid').innerText()).includes('Research beta'),
   'el filtro de fecha consultada no sustituye la fecha de publicación');

await p.click('#studyNew');
await p.fill('#studyTitle', 'Research beta');
await p.fill('#studyQuestion', 'Una nota enlazada');
await p.fill('#studyTopic', 'ENERGIA');
await p.fill('#studyTags', 'INFLACION, crudo');
await p.selectOption('#studyStatus', 'mastered');
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

await p.click('#studyClearFilters');
await p.selectOption('#studyTopicFilter', 'energia');
await p.selectOption('#studyTagFilter', 'inflacion');
ok(await p.locator('#studyGrid .study-card').count() === 2 &&
   await p.locator('#studyTopicFilter option[value="energia"]').count() === 1 &&
   await p.locator('#studyTagFilter option[value="inflacion"]').count() === 1, 'tema y etiqueta agrupan mayúsculas y acentos');
await p.selectOption('#studyStatusFilter', 'progressing');
ok(await alpha.count() === 1 && await p.locator('#studyGrid .study-card').count() === 1, 'tema, etiqueta y estado se combinan');
await p.fill('#studyFrom', '2026-10-21');
ok(await p.locator('#studyGrid .study-card').count() === 0, 'la fecha consultada se combina con los demás filtros');
ok(await p.locator('#studyResults').innerText() === '0 resultados', 'el estado vacío se anuncia');
await p.fill('#studyFrom', '');
await p.selectOption('#studyStatusFilter', 'mastered');
ok((await p.locator('#studyGrid').innerText()).includes('Research beta') &&
   await p.locator('#studyGrid .study-card').count() === 1, 'Revisado selecciona el documento marcado de forma explícita');
await p.click('#studyClearFilters');
ok(await p.locator('#studyGrid .study-card').count() === 3 &&
   await p.locator('#studyGrid [data-study-doc-id="legacy"]').count() === 1,
   'limpiar recupera todos los documentos, incluido uno previo sin tema ni estado');
await p.selectOption('#studyStatusFilter', 'todo');
await p.selectOption('#studyTagFilter', 'original');
ok(await p.locator('#studyGrid .study-card').count() === 1 &&
   await p.locator('#studyGrid [data-study-doc-id="legacy"]').count() === 1,
   'el documento previo se filtra por etiqueta antigua y estado por defecto');
await p.click('#studyClearFilters');
await p.fill('#studySearch', 'asimetria nocturna');
ok(await alpha.count() === 1 && await p.locator('#studyGrid .study-card').count() === 1, 'la búsqueda local encuentra las preguntas del brief');
await p.fill('#studySearch', 'termoclina');
ok(await alpha.count() === 1 && await p.locator('#studyGrid .study-card').count() === 1, 'la búsqueda de biblioteca incluye la especulación');
await p.keyboard.press('Control+k');
await p.fill('#cmdQ', 'muestra de junio');
await p.locator('#cmdList [role="option"]').filter({ hasText: 'Research alpha' }).click();
ok(await p.locator('#studyReaderTitle').innerText() === 'Research alpha', 'la búsqueda global encuentra y abre la evidencia contraria');
await p.click('#studyReaderClose');


/* Tras la recarga se espera A LA TARJETA, no a que el DOM se quede quieto.
   `#studyNew` es markup estático: existe en cuanto se parsea el HTML, así que
   esperarlo sólo dice «app.js arrancó», y `#studyGrid` nace VACÍO y lo rellena
   el render. `quieto()` resuelve en cuanto el DOM lleva unos ms sin mutar, que
   es una condición que se cumple ANTES de que la rejilla esté pintada; y
   `locator.count()` no espera a nada, devuelve lo que hay en ese instante.
   Entre las dos cosas, bajo carga, esta prueba leía 0 tarjetas y cerraba la
   compuerta de `main` sin que nada estuviera roto: pasó en el CI de la PR #98
   y falló en el mismo árbol al entrar en main (corrida 41179229747).
   La doctrina ya estaba escrita en espera.mjs —«esperar a la condición, no al
   reloj»— y aquí se estaba esperando al reloj con otro nombre.
   La aserción NO se relaja: si la tarjeta no aparece en 10 s, `count()` sigue
   siendo 0 y la fila sigue saliendo en rojo. */
/* La confirmación visual no equivale a haber escrito el snapshot local.
   Se espera a la persistencia real ANTES de recargar, y después al documento
   concreto. Una demora de almacenamiento ya no se confunde con pérdida. */
await p.waitForFunction(id => {
  const snapshot = localStorage.getItem('cabina-mnq:v1') || '';
  return snapshot.includes(id) && snapshot.includes('Research alpha') && snapshot.includes('Research beta');
}, doc1Id, { timeout: 15000, polling: 100 });
await p.reload(); await p.waitForFunction(() => window.FUT && document.querySelector('#studyNew'));
await p.click('.tabbtn[data-tab="estudio"]');
const alphaCard = p.locator('#studyGrid .study-card[data-study-doc-id="' + doc1Id + '"]');
await alphaCard.waitFor({ state: 'attached', timeout: 20000 });
await quieto(p);
ok(await alphaCard.count() === 1, 'la tarjeta conserva un ID de documento estable', doc1Id);
const editAlpha = alphaCard.locator('button[data-study-edit]:not(.study-tag)').first();
await editAlpha.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
ok(await editAlpha.count() === 1, 'Editar apunta al documento actual, no al backlink');
await editAlpha.click();
ok(await p.inputValue('#studyAuthor') === 'Research Desk', 'autor y metadatos persisten tras recargar');
ok(await p.inputValue('#studyCatalysts') === 'CPI, FOMC y cambios en los rendimientos reales.', 'los catalizadores persisten tras recargar');
ok(await p.inputValue('#studyTopic') === 'Energía' && await p.inputValue('#studySpeculation') === especulacion,
   'tema y especulación persisten tras recargar');

ok(await p.locator('#studyLinksList').innerText().then(t => t.includes('NQ')), 'el vínculo a la operación persiste');
ok(await p.inputValue('#studyThesis') === tesis && await p.inputValue('#studyEvidenceAgainst') === contra &&
   await p.inputValue('#studyOpenQuestions') === preguntas, 'los campos del brief persisten tras recargar');
ok((await p.locator('#studyLinksList').innerText()).includes('Cartera de prueba'), 'el vínculo a la cuenta de inversión persiste');

await p.click('#studyCancel');
await p.setViewportSize({ width: 390, height: 844 });
ok(await p.locator('.study-library-fields').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
   'los cinco filtros caben en el ancho de la biblioteca móvil');
await p.click('#studyNew');
await p.selectOption('#studyLinkType', 'invest-account');
ok(await p.locator('.study-link-fields').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
   'el selector de vínculos cabe en el ancho del editor móvil');

ok(errores.length === 0, 'sin errores JavaScript', errores.join(' | ') || 'ninguno');

await b.close();
console.log(`\\n${fallos.length ? '❌' : '✅'} estudio-investigacion · ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
