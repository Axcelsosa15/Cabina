/* Apariencia persistente · tema antes de la primera pintura.
   Ejecuta la app real publicada con Chromium aislado; no usa cuenta Supabase. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const fails = [];
const check = (cond, title, detail = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${title}${detail ? '   ' + detail : ''}`);
  if (!cond) fails.push(title);
};
check(html.indexOf('<script src="./appearance.js">') > 0
  && html.indexOf('<script src="./appearance.js">') < html.indexOf('<style>'),
  'appearance.js carga antes del primer CSS');
check((html.match(/<style\b/g) || []).length === 5,
  'cinco bloques CSS, ninguno añadido');
check(html.lastIndexOf('</style>') < html.indexOf('</head>'),
  'todas las hojas quedan en head, antes del contenido');
check(/@scope\s*\(html:not\(\[data-cabina-theme="dark"\]\)\)/.test(html),
  'la capa clara no tapa el tema oscuro');

const server = sirvePublicado(html);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    // En recarga, no reescribir el valor que acaba de guardar el usuario.
    if (!localStorage.getItem('cabina-appearance:v1')) {
      localStorage.setItem('cabina-appearance:v1', JSON.stringify({
        mode: 'dark', accent: 'default', custom: '#ff0088'
      }));
    }
  });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  // The bootstrap executes in head; dark is already chosen at DOMContentLoaded.
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  let state = await page.evaluate(() => ({
    mode: document.documentElement.dataset.cabinaTheme,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    docBg: getComputedStyle(document.body).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  }));
  check(state.mode === 'dark', 'tema oscuro elegido en primer DOMContentLoaded', JSON.stringify(state));
  check(state.bg.toLowerCase() === '#0b0e13' && state.docBg === 'rgb(11, 14, 19)',
    'no aparece el tema claro al abrir en oscuro', JSON.stringify(state));

  await page.locator('.tabbtn[data-tab="ajustes"]').click();
  await page.waitForTimeout(100);
  const mode = page.locator('#cabAppearanceMode');
  const accent = page.locator('#cabAppearanceAccent');
  check(await mode.inputValue() === 'dark', 'Ajustes refleja la preferencia guardada');

  await mode.selectOption('light');
  state = await page.evaluate(() => ({
    mode: document.documentElement.dataset.cabinaTheme,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
  }));
  check(state.mode === 'light' && state.bg.toLowerCase() === '#f7f9fc' && state.surface.toLowerCase() === '#ffffff',
    'cambiar a claro aplica el sistema A completo', JSON.stringify(state));

  await accent.selectOption('violet');
  const newAccent = await page.evaluate(() => getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim());
  check(newAccent.toLowerCase() === '#6d28d9', 'color violeta efectivo', newAccent);

  await mode.selectOption('dark');
  await accent.selectOption('custom');
  check(await page.locator('#cabAppearanceCustomField').isVisible(),
    'el color personalizado aparece sólo en modo custom');
  await page.locator('#cabAppearanceCustom').fill('#000000');
  const custom = await page.evaluate(() => ({
    color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    mode: document.documentElement.dataset.cabinaTheme
  }));
  check(custom.mode === 'dark' && custom.color.toLowerCase() !== '#000000',
    'color demasiado oscuro ajustado para contraste', JSON.stringify(custom));

  await page.reload({ waitUntil: 'domcontentloaded' });
  const persisted = await page.evaluate(() => ({
    mode: document.documentElement.dataset.cabinaTheme,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    storage: JSON.parse(localStorage.getItem('cabina-appearance:v1') || '{}')
  }));
  check(persisted.mode === 'dark' && persisted.storage.mode === 'dark' && persisted.storage.accent === 'custom',
    'persistencia de tema y color antes de inicializar la app', JSON.stringify(persisted));

  await page.locator('.tabbtn[data-tab="ajustes"]').click();
  await page.locator('#cabAppearanceReset').click();
  const reset = await page.evaluate(() => ({
    mode: document.documentElement.dataset.cabinaTheme,
    storage: JSON.parse(localStorage.getItem('cabina-appearance:v1') || '{}')
  }));
  check(reset.mode === 'light' && reset.storage.mode === 'light' && reset.storage.accent === 'default',
    'restaurar apariencia no toca datos financieros');

  check(jsErrors.length === 0, 'cero errores JS', jsErrors.join(' | '));
  await ctx.close();

  const system = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 844 } });
  await system.addInitScript(() => localStorage.setItem('cabina-appearance:v1',
    JSON.stringify({ mode: 'system', accent: 'default', custom: '#1d4ed8' })));
  const mobile = await system.newPage();
  await mobile.goto(origin, { waitUntil: 'domcontentloaded' });
  check(await mobile.evaluate(() => document.documentElement.dataset.cabinaTheme) === 'dark',
    'modo automático detecta dark del dispositivo en móvil');
  await mobile.emulateMedia({ colorScheme: 'light' });
  await mobile.waitForFunction(() => document.documentElement.dataset.cabinaTheme === 'light');
  check(await mobile.evaluate(() => document.documentElement.dataset.cabinaTheme) === 'light',
    'cambio del sistema se aplica sin recargar');
  await system.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`fallos: ${fails.length}`);
if (fails.length) process.exit(1);
console.log('PASS apariencia: tema persistente, primera pintura y contrastes de controles');
