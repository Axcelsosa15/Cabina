import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/\/\* CABINA DESIGN SYSTEM v3[\s\S]*?<\/style>/)?.[0] ?? '';
assert.ok(css.length > 2500, 'La capa de diseño v3 debe estar presente');
assert.equal((html.match(/<style\b[^>]*>/g) || []).length, 5, 'No añadir bloques style: el guardián estructural espera cinco');
for (const color of ['#FAF8F4', '#16181C', '#16915B', '#D6483B', '#3D6FB0']) assert.ok(css.includes(color), 'Falta color de Bitácora: ' + color);
for (const token of ['--ds-bg:', '--ds-surface:', '--ds-line:', '--ds-text:', '--ds-accent:', '--ds-space-4:', '--ds-radius-md:', '--ds-focus:']) {
  assert.ok(css.includes(token), 'Falta token de diseño: ' + token);
}
for (const selector of ['.topbar', '.tabnav', '.tabbtn.active', 'section.panel', '.panel .body', '.btn.primary', 'input, select, textarea', 'tbody tr:hover', '#mobileMoreOv', 'prefers-reduced-motion']) {
  assert.ok(css.includes(selector), 'Falta regla visual esperada: ' + selector);
}
for (const tab of ['cabina', 'futuros', 'cuentas', 'edge', 'invest', 'playbook', 'ideas', 'estudio', 'calc']) {
  assert.ok(html.includes('data-tab="' + tab + '"'), 'La pestaña existente debe conservarse: ' + tab);
}
assert.ok(html.includes('const QE = (function ()'), 'El motor cuantitativo debe permanecer integrado');
assert.ok(html.includes('localDb()') && html.includes('nubeDb()'), 'Los adaptadores de persistencia deben permanecer');
console.log('PASS sistema visual: tokens, patrones globales, nueve pestañas, motor y persistencia conservados');
