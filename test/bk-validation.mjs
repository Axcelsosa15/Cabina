import { chromium } from 'playwright';

const PAGE_URL = new globalThis.URL('./preview.html', import.meta.url).href;
const fallos = [];
const ok = (cond, name, detail = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? '   ' + detail : ''}`);
  if (!cond) fallos.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push(e.message));
await page.goto(PAGE_URL);
await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 15000 });
await page.waitForTimeout(900);

async function rechaza(nombre, texto, esperado) {
  await page.click('#bkPaste');
  await page.fill('#ef_j', texto);
  await page.click('#edSave');
  await page.waitForTimeout(80);
  const titulo = await page.textContent('#edTitle');
  ok(titulo.includes(esperado), nombre, titulo);
  await page.click('#edCancel');
  await page.waitForTimeout(80);
}

console.log('\n═══ FRONTERA DE IMPORTACIÓN · forma antes de persistir ═══');
await rechaza('rechaza una copia sin versión', JSON.stringify({ format: 'cabina-backup', trades: {} }), 'versión válida');
await rechaza('rechaza un contenedor escalar', JSON.stringify({ format: 'cabina-backup', version: 1, trades: 'no' }), 'trades no tiene forma válida');
await rechaza('rechaza un registro escalar', JSON.stringify({ format: 'cabina-backup', version: 1, trades: { t1: 7 } }), 'trades contiene un registro inválido');
await rechaza('rechaza un registro sin id en lista', JSON.stringify({ format: 'cabina-backup', version: 1, trades: [{}] }), 'trades contiene un registro sin identificador');
await rechaza('rechaza una clave de prototipo', '{"format":"cabina-backup","version":1,"trades":{"__proto__":{"id":"__proto__"}}}', 'identificador inválido');
await rechaza('rechaza settings como lista', JSON.stringify({ format: 'cabina-backup', version: 1, settings: [] }), 'settings no tiene forma válida');

ok(errores.length === 0, 'no hay errores JS durante la validación', errores.join(' | '));
await browser.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
