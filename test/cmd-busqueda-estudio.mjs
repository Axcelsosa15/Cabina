/* Búsqueda local y navegación de Estudio desde el artefacto de Pages. */
import { chromium } from 'playwright';
import { arrancada, CONFIG_PRUEBA, siembra } from './espera.mjs';
import { sirvePublicado } from './publicado.mjs';

const date = '2026-10-20';
const trades = Object.fromEntries(Array.from({ length: 52 }, (_, n) => {
  const id = 'prisma-trade-' + n;
  return [id, { id, type: 'futuros', instrument: 'MNQ', direction: 'long', date,
    qty: 1, entry: 100, stop: 95, exit: 105, notes: 'Prisma', time: '10:15' }];
}));
const seed = {
  settings: { ...structuredClone(CONFIG_PRUEBA), accounts: [],
    meta: { investAccounts: [{ id: 'broker-prisma', name: 'Cartera Prisma', broker: 'Bróker Prisma' }] } },
  trades,
  days: {},
  positions: { pos: { id: 'pos', asset: 'GLD', market: 'etfs', date, accountId: 'broker-prisma', qty: 1, entry: 100 } },
  playbooks: { pb: { id: 'pb', name: 'Setup Prisma', kind: 'futuros', market: 'MNQ' } },
  tesis: { thesis: { id: 'thesis', name: 'Tesis Prisma', asset: 'GLD', status: 'watchlist' } },
  research: {
    alpha: { id: 'alpha', title: 'Liquidez y petróleo', type: 'brief', status: 'progressing', tags: ['Prisma'],
      evidence: 'Hechos medidos.', conclusion: 'Interpretación provisional.', consultedAt: date,
      links: [{ type: 'research', id: 'beta' }, { type: 'trade', id: 'prisma-trade-0' }, { type: 'position', id: 'ausente' }] },
    beta: { id: 'beta', title: 'Fuente energética', type: 'source', status: 'todo', prompt: 'Contango', answer: 'Curva ascendente' },
    review: { id: 'review', title: 'Revisión sintética excluida', type: 'trade-review', tradeId: 'prisma-trade-0' },
  },
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
const errors = [];
const ok = (value, message) => {
  console.log(`  ${value ? '✅' : '❌'} ${message}`);
  if (!value) failures++;
};

try {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 940 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await siembra(p, base, seed);
    await arrancada(p, null);
    const opener = p.getByRole('button', { name: 'Buscar en Cabina' });
    const combo = p.getByRole('combobox', { name: 'Buscar en Cabina' });
    const list = p.locator('#cmdList');
    const selected = list.locator('[aria-selected="true"]');
    const reader = p.locator('#studyReader');
    const context = p.locator('#studyReaderContext');
    const active = () => p.evaluate(() => document.activeElement.id);
    const tab = () => new URL(p.url()).hash;
    const check = (v, s) => ok(v, `${width}px · ${s}`);
    const search = async q => {
      await combo.fill(q);
      await p.waitForFunction(() => document.getElementById('cmdList').getAttribute('aria-busy') === 'false');
    };
    const group = name => list.getByRole('group', { name, exact: true });
    const option = (g, name) => group(g).getByRole('option', { name });

    await opener.click();
    check(await active() === 'cmdQ' && await combo.getAttribute('aria-expanded') === 'true', 'la búsqueda visible enfoca el combobox');
    await p.keyboard.press('Shift+Tab');
    check(await active() === 'cmdClose', 'Shift+Tab permanece en el diálogo');
    await p.keyboard.press('Tab');
    check(await active() === 'cmdQ', 'Tab devuelve al combobox sin pasar por las opciones');
    await p.keyboard.press('Escape');
    check(await active() === 'cmdOpen' && await opener.getAttribute('aria-expanded') === 'false', 'Esc restaura el foco');

    await p.keyboard.press('Meta+k');
    await search('liqudiez petroleo');
    check((await selected.innerText()).includes('Liquidez y petróleo'), 'acentos y transposición en una consulta de dos palabras');
    check(await combo.getAttribute('aria-activedescendant') === await selected.getAttribute('id'), 'aria-activedescendant señala la selección');
    await p.keyboard.press('Enter');
    await reader.waitFor({ state: 'visible' });
    check(tab() === '#estudio' && await p.locator('#studyReaderTitle').innerText() === 'Liquidez y petróleo', 'el resultado abre el lector');
    check(await context.getByText('Posición eliminada').count() === 1 &&
      await context.getByRole('button', { name: 'Posición eliminada' }).count() === 0, 'una referencia eliminada aparece sin un botón roto');
    await context.getByRole('button', { name: 'Fuente energética' }).click();
    check(await p.locator('#studyReaderTitle').innerText() === 'Fuente energética', 'el vínculo entre documentos abre el destino');
    await context.getByRole('button', { name: 'Liquidez y petróleo' }).click();
    await context.getByRole('button', { name: /MNQ/ }).click();
    check(await reader.isHidden() && tab() === '#futuros' && await p.locator('#ef_instrument').inputValue() === 'MNQ',
      'el vínculo abre el trade original sin apilar diálogos');
    await p.locator('#edClose').click();

    await opener.click();
    await search('biblioteca de investigación');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.activeElement.id === 'studyLibraryHeading');
    check(tab() === '#estudio', 'la acción Biblioteca lleva al encabezado');
    await p.locator('[data-study-section="studyReviewHeading"]').click();
    check(await active() === 'studyReviewHeading', 'Estudio permite saltar a la revisión');
    await p.locator('[data-study-section="studyLibraryHeading"]').click();
    check(await active() === 'studyLibraryHeading', 'Estudio permite saltar a la biblioteca');

    await opener.click();
    await search('prisma');
    check(await group('Operaciones').getByRole('option').count() === 8 && await option('Estudio', /Liquidez/).count() === 1 &&
      await option('Playbook', /Setup Prisma/).count() === 1 && await option('Tesis', /Tesis Prisma/).count() === 1 &&
      await option('Cuentas de inversión', /Cartera Prisma/).count() === 1, '52 operaciones no desplazan los demás grupos');
    const first = await combo.getAttribute('aria-activedescendant');
    await p.keyboard.press('ArrowDown');
    check(await combo.getAttribute('aria-activedescendant') !== first && await active() === 'cmdQ', 'flecha abajo cambia opción sin perder el foco');
    await p.keyboard.press('ArrowUp');
    check(await combo.getAttribute('aria-activedescendant') === first, 'flecha arriba recupera la opción anterior');
    await option('Cuentas de inversión', /Cartera Prisma/).click();
    check(tab() === '#invest' && await p.locator('#ef_name').inputValue() === 'Cartera Prisma', 'abre la cuenta de inversión correcta');
    await p.locator('#edClose').click();
    await opener.click();
    await search('GLD');
    await option('Posiciones', /GLD/).click();
    check(await p.locator('#ef_asset').inputValue() === 'GLD', 'la posición abre su editor real');
    await p.locator('#edClose').click();
    await opener.click();
    await search(date);
    await option('Sesiones', new RegExp(date)).click();
    check(tab() === '#futuros' && await p.locator('.ftview[data-v="diario"]').isVisible(), 'una sesión abre el Diario de Futuros');

    await opener.click();
    await search('Resumen');
    const busy = await combo.evaluate(input => {
      input.value = 'Historial';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const list = document.getElementById('cmdList');
      const pending = list.getAttribute('aria-busy') === 'true' && !list.querySelector('[role="option"]');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return pending;
    });
    check(busy && tab() === '#historial', 'Enter durante el debounce ejecuta la consulta nueva');

    await opener.click();
    await search('revisión sintética excluida');
    check(await list.getByRole('option').count() === 0 && /Nada que coincida/.test(await p.locator('#cmdStatus').innerText()) &&
      await combo.getAttribute('aria-activedescendant') === null, 'estado vacío accesible y revisión fuera de la biblioteca');
    await search('contango');
    check(await option('Estudio', /Fuente energética/).count() === 1, 'encuentra el texto de una flashcard');
    await p.locator('#cmdClose').click();
    await p.reload();
    await arrancada(p, null);
    await opener.click();
    await search('liquidez y petroleo');
    check(await option('Estudio', /Liquidez/).count() === 1, 'reconstruye resultados desde el estado local tras recargar');
    await ctx.close();
  }
  ok(errors.length === 0, 'sin errores de JavaScript: ' + (errors.join(' | ') || 'ninguno'));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures);
if (failures) process.exitCode = 1;
