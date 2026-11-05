/* Recuperación activa, sin efectos hasta una calificación explícita. */
import { chromium } from 'playwright';
import { arrancada, CONFIG_PRUEBA, siembra } from './espera.mjs';
import { sirvePublicado } from './publicado.mjs';

const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
const ok = (value, message) => {
  console.log(`  ${value ? '✅' : '❌'} ${message}`);
  if (!value) failures++;
};

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  // En UTC ya es día 6, pero Cabina opera con la fecha 5 en Nueva York.
  await p.addInitScript(now => {
    const RealDate = Date;
    window.cabinaTestNow = now;
    window.Date = class extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(window.cabinaTestNow); }
      static now() { return window.cabinaTestNow; }
    };
  }, Date.parse('2026-11-06T02:30:00Z'));
  const card = (id, prompt, nextReview, status) => ({
    id, title: prompt, type: 'flashcard', prompt, answer: 'Respuesta de ' + id, nextReview, status,
  });
  await siembra(p, base + '#estudio', {
    settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [] },
    trades: {},
    research: {
      a: card('a', 'Vencida', '2026-11-04', 'mastered'),
      b: card('b', 'Para hoy', '2026-11-05', 'progressing'),
      c: card('c', 'Para mañana', '2026-11-06', 'todo'),
      d: { ...card('d', 'Sin fecha'), type: 'brief', topic: 'Macro', thesis: 'Hipótesis previa' },
      rev: { ...card('rev', 'Revisión de operación'), type: 'trade-review' },
      incomplete: { ...card('incomplete', 'Incompleta'), answer: '' },
    },
  });
  await arrancada(p, null);
  const prompt = p.locator('#studyFlashPrompt');
  const answer = p.locator('#studyFlashAnswer');
  const grade = p.locator('#studyFlashGrade');
  const count = p.locator('#studyFlashPending');
  const records = () => p.evaluate(() => JSON.parse(localStorage.getItem('cabina-mnq:v1')).research);
  const waitDate = (id, date) => p.waitForFunction(([key, expected]) =>
    JSON.parse(localStorage.getItem('cabina-mnq:v1')).research[key].nextReview === expected, [id, date]);
  const waitPrompt = text => p.waitForFunction(value =>
    document.getElementById('studyFlashPrompt').textContent === value, text);

  await waitPrompt('Vencida');
  const before = await records();
  ok(await count.innerText() === '3 pendientes' && await p.locator('#studyFlashPos').innerText() === '1/3',
    'prioriza tarjetas vencidas e incluye las de hoy y las que no tienen fecha');
  ok(await answer.isHidden() && await grade.isHidden(), 'las respuestas y calificaciones empiezan ocultas');
  await p.click('#studyReveal');
  ok(await answer.innerText() === 'Respuesta de a' && await grade.isVisible(), 'revelar permite calificar la tarjeta actual');
  await p.click('#studyNext');
  ok(await prompt.innerText() === 'Para hoy' && await answer.isHidden() && await answer.textContent() === '',
    'cambiar de tarjeta oculta y limpia la respuesta');
  ok(JSON.stringify(await records()) === JSON.stringify(before), 'revelar y avanzar no escriben datos');

  await p.click('#studyReveal');
  await p.click('#studyFlashRecall');
  await waitDate('b', '2026-11-08');
  await waitPrompt('Sin fecha');
  ok(await count.innerText() === '2 pendientes' && (await records()).b.status === 'progressing',
    'Recordé agenda tres días según la fecha de Nueva York y conserva el estado');

  await p.click('#studyReveal');
  await p.click('#studyFlashAgain');
  await waitDate('d', '2026-11-06');
  await waitPrompt('Vencida');
  const brief = (await records()).d;
  ok(brief.status === undefined && brief.topic === 'Macro' && brief.thesis === 'Hipótesis previa',
    'Repasar agenda un día y conserva los campos del brief y su estado anterior');

  await p.click('#studyReveal');
  await p.click('#studyFlashAgain');
  await waitDate('a', '2026-11-06');
  await waitPrompt('Estás al día con las flashcards.');
  ok(await count.innerText() === '0 pendientes' && await p.locator('#studyReveal').isDisabled() && await grade.isHidden(),
    'al completar la cola, las tarjetas futuras esperan su fecha');
  ok((await records()).a.status === 'mastered' && (await records()).c.nextReview === '2026-11-06',
    'calificar no cambia el dominio ni modifica otras tarjetas');
  await p.locator('#studyFlashAll').check();
  ok(await p.locator('#studyFlashPos').innerText() === '1/4' && await answer.isHidden(),
    'Todas permite practicar antes de tiempo y excluye revisiones de trades y tarjetas incompletas');
  ok(await p.locator('#studyFlashPanel').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
    'los controles caben en móvil');

  await p.reload();
  await arrancada(p, null);
  await waitPrompt('Estás al día con las flashcards.');
  ok((await records()).b.nextReview === '2026-11-08' && await count.innerText() === '0 pendientes',
    'las fechas y la cola se reconstruyen al recargar');
  await p.evaluate(() => { window.cabinaTestNow = Date.parse('2026-11-06T05:01:00Z'); });
  await p.waitForFunction(() => document.getElementById('studyFlashPending').textContent === '3 pendientes');
  ok(await count.innerText() === '3 pendientes' && await answer.isHidden(),
    'al cambiar el día en Nueva York la cola se actualiza sin recargar');
  ok(errors.length === 0, 'sin excepciones JavaScript');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
