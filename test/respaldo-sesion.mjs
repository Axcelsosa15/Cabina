/* T19 · UN RESPALDO RESTAURADO EN UN NAVEGADOR LIMPIO, DE PUNTA A PUNTA.

   `integridad` prueba los sellos y `importar` la frontera. Lo que faltaba es la
   ida y vuelta entera con una sesión de verdad dentro: iniciar, reducir el plan,
   registrar, cerrar; exportar con el botón; abrir un navegador SIN nada;
   importar tecleando IMPORTAR; y comparar documento a documento.

   Lo que se exige: la sesión —planes, eventos, cierre—, las operaciones con su
   `sessionRef`, y las reglas llegan idénticas; la vista previa dice que la copia
   llegó entera; y la barra pinta el mismo estado. Sin cuenta: almacenamiento local. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra, enDisco } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d == null ? '' : ' · ' + d}`); if (!c) fallos.push(t); };
const CLAVE = 'cabina-mnq:v1';
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v === undefined ? null : v);
const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();
const nuevo = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1320, height: 950 } });
  await ctx.route('**/*', r => r.request().url().startsWith(origen + '/') || /^(data:|blob:)/.test(r.request().url()) ? r.continue() : r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  return { ctx, p };
};
const disco = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), CLAVE);
const aDatos = async p => {
  await p.locator('#tabnav [data-tab="ajustes"]').click(); await quieto(p, 60, 1200);
  await p.locator('#settingsTabData').click();
  const s = p.locator('#panelDatos > .settings-details:not([open]) > summary');
  if (await s.count()) await s.click();
};

try {
  console.log('\n═══ origen: una sesión completa ═══');
  const A = await nuevo();
  const settings = structuredClone(CONFIG_PRUEBA);
  await siembra(A.p, origen + '/', { settings, trades: {}, days: {} });
  await arrancada(A.p); await A.p.waitForSelector('#sesEstado');
  /* Elegir cuenta hace que el origen GUARDE su configuración ya normalizada: sin
     esto se compararía la semilla cruda con lo que `normalize()` escribe al
     importar (estado heredado «activa» → «evaluacion», `value` de reglas fijas). */
  await A.p.locator('#sesAcct').selectOption('prop50');
  await enDisco(A.p, d => d?.settings?.meta?.acct === 'prop50' && d.settings.accounts?.[0]?.status !== 'activa');
  await A.p.locator('[data-ses-act="iniciar"]').click();
  await A.p.locator('[data-ses-act="form-ajustar"]').click();
  await A.p.locator('#sesAjCampo').selectOption('maxLoss');
  await A.p.locator('#sesAjValor').fill('200');
  await A.p.locator('#sesAjMotivo').fill('Día corto');
  await A.p.locator('#sesFormOk').click();
  await A.p.locator('#quickBtn').click();
  await A.p.locator('#qkText').fill('MNQ -60');
  await A.p.waitForFunction(() => !document.getElementById('qkSave').disabled);
  await A.p.locator('#qkText').press('Enter');
  await quieto(A.p, 150, 3000);
  await A.p.locator('[data-ses-act="form-cerrar"]').click();
  await A.p.locator('#sesFormOk').click();
  await enDisco(A.p, d => Object.values(d?.days || {}).some(x => x.closed === true && x.sesion?.estado === 'cerrada' && x.sesion.planes.length === 2) && Object.keys(d.trades || {}).length === 1);
  const antes = await disco(A.p);
  const HOY = Object.keys(antes.days).find(k => antes.days[k].sesion);
  ok(!!HOY && antes.days[HOY].sesion.cierres.length === 1 && Object.values(antes.trades)[0].sessionRef?.plan === 2, 'hay una sesión cerrada, con dos versiones del plan y una operación ligada a la v2');

  await aDatos(A.p);
  await A.p.locator('#bkShow').click(); await A.p.waitForTimeout(1600);
  const copia = await A.p.evaluate(() => { const t = document.querySelector('#edFields textarea'); return t ? t.value : ''; });
  let raw = null; try { raw = JSON.parse(copia); } catch (e) { }
  ok(!!raw && raw.format === 'cabina-backup' && !!raw.checksum, 'la copia sale del botón, con su huella', raw && `${copia.length} bytes`);
  ok(!!raw && canon(raw.days[HOY].sesion) === canon(antes.days[HOY].sesion), 'y lleva la sesión dentro, tal cual');
  await A.ctx.close();

  console.log('\n═══ destino: un navegador sin nada ═══');
  const B = await nuevo();
  await B.p.goto(origen + '/');
  await B.p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(B.p, 120, 4000);
  ok(await B.p.evaluate(() => window.FUT.trades().length) === 0 && !(await disco(B.p)).days?.[HOY]?.sesion, 'el destino arranca vacío');
  await aDatos(B.p);
  await B.p.locator('#bkPaste').click(); await B.p.waitForTimeout(600);
  await B.p.locator('#edFields textarea').fill(copia); await B.p.waitForTimeout(250);
  await B.p.locator('#edSave').click(); await B.p.waitForTimeout(1200);
  const previa = await B.p.evaluate(() => ((document.getElementById('edFields') || {}).textContent || '') + ' ' + ((document.querySelector('#ef_resumen') || {}).value || ''));
  const titulo = await B.p.locator('#edTitle').innerText();
  ok(/Importar copia/i.test(titulo), 'la vista previa se abre antes de escribir nada', titulo);
  ok(!/falta|dañad|no coincide|truncad/i.test(previa), 'y no avisa de que falte o esté dañado nada', previa.replace(/\s+/g, ' ').slice(0, 160));
  ok(Object.keys((await disco(B.p)).trades || {}).length === 0, 'hasta aquí no se ha escrito nada');
  await B.p.locator('#edSave').click(); await B.p.waitForTimeout(900);
  await B.p.locator('#ef_ok').fill('IMPORTAR'); await B.p.waitForTimeout(250);
  await B.p.locator('#edSave').click();
  await enDisco(B.p, d => !!d?.days?.[HOY]?.sesion && Object.keys(d.trades || {}).length === 1, 10000);
  await B.p.waitForTimeout(1800);                       // la restauración recarga sola a los 1200 ms
  await B.p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(B.p, 150, 4000);
  const tras = await disco(B.p);

  ok(canon(tras.days[HOY].sesion) === canon(antes.days[HOY].sesion), 'la sesión llega idéntica: planes, eventos, cierre');
  ok(tras.days[HOY].closed === true, 'y el día sigue cerrado');
  ok(canon(tras.trades) === canon(antes.trades), 'las operaciones llegan idénticas, con su `sessionRef`', JSON.stringify(Object.values(tras.trades)[0].sessionRef));
  /* La configuración se compara por lo que SIGNIFICA: al importar pasa por
     `normalize()`, que completa campos vacíos (`prefix: ""`) que la semilla del
     origen no traía. Eso no es pérdida ni cambio; un número distinto sí lo sería. */
  const regla = r => ({ id: r.id, kind: r.kind, role: r.role || '', value: r.value == null ? null : Number(r.value), allow: r.allow || '', name: r.name });
  const cuentaDe = a => ({ id: a.id, name: a.name, firm: a.firm || '', size: Number(a.size) || 0, dd: Number(a.dd) || 0, ddKind: a.ddKind, status: a.status,
    limit: a.limit == null ? null : Number(a.limit), target: a.target == null ? null : Number(a.target), rules: a.rules || {}, ledger: a.ledger || [] });
  const cfg = x => canon({ rules: (x.settings.rules || []).map(regla), accounts: (x.settings.accounts || []).map(cuentaDe), acct: (x.settings.meta || {}).acct || '' });
  const dif = (() => { const A = JSON.parse(cfg(antes)), B = JSON.parse(cfg(tras)), out = [];
    for (const k of ['rules', 'accounts']) A[k].forEach((x, i) => { for (const f of Object.keys(x)) if (canon(x[f]) !== canon((B[k][i] || {})[f])) out.push(`${k}[${i}].${f}: ${canon(x[f])} ≠ ${canon((B[k][i] || {})[f])}`); });
    if (A.acct !== B.acct) out.push(`acct: ${A.acct} ≠ ${B.acct}`); return out; })();
  ok(cfg(tras) === cfg(antes), 'reglas y cuentas llegan con los mismos números, roles y contratos', dif.join(' | ').slice(0, 500) || null);
  ok(Object.keys(tras.days).length === Object.keys(antes.days).length, 'ni un día de más ni de menos', Object.keys(tras.days).length);
  await B.p.locator('#tabnav [data-tab="cabina"]').click(); await quieto(B.p, 150, 3000);
  ok(/Cerrada/.test(await B.p.locator('#sesEstado').innerText()), 'la barra pinta el mismo estado en el destino');
  await B.p.locator('#sesPlanDet summary').click();
  const det = await B.p.locator('#sesPlanDet').innerText();
  ok(/Plan v1/.test(det) && /Plan v2/.test(det) && /Día corto/.test(det), 'con las dos versiones del plan y su motivo');
  ok(await B.p.evaluate(() => window.FUT.trades().length) === 1 && /-\$60/.test(await B.p.locator('#sesPnl').innerText()), 'y el mismo resultado registrado', await B.p.locator('#sesPnl').innerText());
  await B.ctx.close();
} catch (e) { fallos.push('excepción: ' + e.message); console.error(e); }
finally { await nav.close(); srv.close(); }
ok(errores.length === 0, 'sin errores de página', errores.join(' | ') || null);
console.log(fallos.length ? `\nFAIL respaldo-sesion: ${fallos.length}` : '\nPASS respaldo-sesion');
process.exit(fallos.length ? 1 : 0);
