/* El nombre de la franja no anuncia como futura una reapertura ya pasada. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { quieto } from './espera.mjs';
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`, browser = await chromium.launch();
let failures = 0;
const ok = (v, s) => { console.log(`  ${v ? '✅' : '❌'} ${s}`); if (!v) failures++; };
try {
  for (const [stamp, lang, phase] of [
    ['2026-11-04T22:30:00Z', 'es', 'before'],
    ['2026-11-04T23:30:00Z', 'es', 'before'],
    ['2026-11-05T00:59:00Z', 'es', 'before'],
    ['2026-11-05T01:00:00Z', 'es', 'asia'],
    ['2026-11-04T23:30:00Z', 'en', 'before'],
  ]) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await ctx.addInitScript(({ now, lang }) => {
      localStorage.setItem('cabina:idioma:v1', lang);
      const RealDate = Date;
      window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, { now: Date.parse(stamp), lang });
    const p = await ctx.newPage(); await p.goto(base);
    await p.waitForFunction(() => window.FUT && document.querySelector('#sesNow b')); await quieto(p);
    await p.evaluate(() => { const d = document.getElementById('cabOpsFold'); if (d) d.open = true; });
    const label = await p.locator('#sessionLabel').innerText(), body = await p.locator('#sesNow b').innerText();
    const expected = phase === 'asia' ? 'Sesión Asia' : lang === 'en' ? 'Before Asia' : 'Antes de Asia';
    ok(label === expected, `${stamp} · ${lang}: etiqueta de franja correcta (${label})`);
    ok(label === body, `${stamp} · ${lang}: barra y sesión de hoy coinciden`);
    if (phase === 'before') ok((await p.locator('#sesNow small').innerText()).includes('Asia'), `${stamp} · ${lang}: la cuenta atrás mantiene Asia como siguiente sesión`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => srv.close(r)); }
console.log('fallos: ' + failures); if (failures) process.exitCode = 1;
