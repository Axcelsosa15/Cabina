/* DIAGNÓSTICO · Ajustes dice versión, guardado, pendientes, conflictos y último
   error, y lo exporta SIN datos del diario. La prueba siembra un nombre de
   cuenta, una nota y un importe reconocibles y exige que ninguno salga. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d == null ? '' : ' · ' + d}`); if (!c) fallos.push(t); };
const HOY = '2026-09-17';
const settings = structuredClone(CONFIG_PRUEBA);
settings.accounts = [{ id: 'privada-1729', name: 'CUENTA PRIVADA 1729', size: 50000, dd: 2500, ddKind: 'estatico', status: 'fondeada', ledger: [] }];
const datos = { settings,
  trades: { t1: { id: 't1', type: 'futuros', date: HOY, time: '10:00', accountId: 'privada-1729', instrument: 'MNQ', pnl: -1729.55, notes: 'NOTA PRIVADA 1729', updatedAt: 1 } },
  days: { [HOY]: { date: HOY, note: 'NOTA PRIVADA 1729', closed: false, updatedAt: 1 } } };

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({ viewport: { width: 1320, height: 950 }, acceptDownloads: true });
  await ctx.route('**/*', r => r.request().url().startsWith(origen + '/') || /^(data:|blob:)/.test(r.request().url()) ? r.continue() : r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await siembra(p, origen + '/', datos);
  await arrancada(p);
  await p.locator('#tabnav [data-tab="ajustes"]').click();
  await quieto(p);
  const panel = p.locator('#panelDiagnostico');
  await panel.scrollIntoViewIfNeeded();
  const txt = await panel.innerText();
  for (const k of ['Versión', 'Estado de guardado', 'Última escritura confirmada', 'Pendientes de sincronizar', 'Conflictos', 'Último error', 'Sesión operativa'])
    ok(txt.includes(k), `el diagnóstico enseña «${k}»`);
  ok(/Pendientes de sincronizar\s*0/.test(txt) && /Conflictos\s*0/.test(txt), 'sin cuenta ni fallos: cero pendientes y cero conflictos');
  ok(/ninguna en esta visita/.test(txt), 'sin escrituras en esta visita no se inventa una hora de confirmación');
  ok(!/1729/.test(txt), 'el panel no enseña nombres, notas ni importes');

  /* una escritura real mueve «última confirmada» */
  await p.locator('#tabnav [data-tab="cabina"]').click();
  await p.locator('[data-ses-act="iniciar"]').click();
  await p.waitForFunction(k => JSON.parse(localStorage.getItem(k)).days?.['2026-09-17']?.sesion?.estado === 'activa' ||
    Object.values(JSON.parse(localStorage.getItem(k)).days || {}).some(d => d.sesion?.estado === 'activa'), 'cabina-mnq:v1');
  await p.locator('#tabnav [data-tab="ajustes"]').click();
  await quieto(p, 150, 2000);
  const txt2 = await panel.innerText();
  ok(/Última escritura confirmada\s*\d{1,2}:\d{2}/.test(txt2) && /este navegador/.test(txt2), 'tras guardar, dice cuándo y DÓNDE se confirmó', txt2.match(/Última escritura confirmada[^\n]*\n?[^\n]*/)?.[0].replace(/\n/g, ' '));
  ok(/Sesión operativa\s*Activa/.test(txt2), 'y el estado de la sesión');

  const [bajada] = await Promise.all([p.waitForEvent('download'), p.locator('#diagExportar').click()]);
  const crudo = await readFile(await bajada.path(), 'utf8');
  const j = JSON.parse(crudo);
  ok(bajada.suggestedFilename() === 'cabina-diagnostico.json', 'se exporta como fichero JSON');
  ok(['huella', 'guardado', 'ultimaConfirmacion', 'pendientes', 'conflictos', 'ultimoError', 'sesion', 'documentos'].every(k => k in j), 'con versión, guardado, pendientes, conflictos y último error');
  ok(j.documentos.trades === 1 && j.documentos.days >= 1, 'recuentos, no contenido', JSON.stringify(j.documentos));
  ok(!/1729|PRIVADA|privada|@/.test(crudo), 'ni un nombre de cuenta, nota, importe, id de cuenta o correo en el fichero');
  ok(/sin operaciones ni datos personales/.test(await p.locator('#diagNota').innerText()), 'y lo dice al exportar');
  await ctx.close();
} catch (e) { fallos.push('excepción: ' + e.message); console.error(e); }
finally { await nav.close(); srv.close(); }
ok(errores.length === 0, 'sin errores de página', errores.join(' | ') || null);
console.log(fallos.length ? `\nFAIL diagnostico: ${fallos.length}` : '\nPASS diagnostico');
process.exit(fallos.length ? 1 : 0);
