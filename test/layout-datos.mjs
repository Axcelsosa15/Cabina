/* LA DISTRIBUCIÓN ES PRESENTACIÓN: no toca datos, y rota no tumba el arranque.

   T16 · guardar, cancelar y restablecer la distribución de Cabina deja
         `cabina-mnq:v1` (operaciones, reglas, cuentas, días) byte a byte igual.
   T17 · unas preferencias de vista ilegibles, con un panel que ya no existe o
         con basura donde va el lienzo, no impiden arrancar ni registrar. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { CONFIG_PRUEBA, arrancada, quieto, siembra } from './espera.mjs';

const fallos = [], errores = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d == null ? '' : ' · ' + d}`); if (!c) fallos.push(t); };
const DATOS = { settings: structuredClone(CONFIG_PRUEBA),
  trades: { t1: { id: 't1', type: 'futuros', date: '2026-09-15', time: '10:00', accountId: 'prop25', instrument: 'MNQ', pnl: 120, updatedAt: 5 } },
  days: { '2026-09-15': { date: '2026-09-15', closed: true, result: 120, note: 'ok', updatedAt: 5 } } };
const VISTA = 'cabina-view-prefs:v1', CLAVE = 'cabina-mnq:v1';

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const origen = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();
const abrir = async (vista) => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', r => r.request().url().startsWith(origen + '/') || /^(data:|blob:)/.test(r.request().url()) ? r.continue() : r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(origen + '/');
  await p.evaluate(([k, v, kv, vv]) => { localStorage.setItem(k, v); if (vv != null) localStorage.setItem(kv, vv); }, [CLAVE, JSON.stringify(DATOS), VISTA, vista ?? null]);
  await p.reload(); await arrancada(p, null);
  return { ctx, p };
};
const datos = p => p.evaluate(k => localStorage.getItem(k), CLAVE);
const vista = p => p.evaluate(k => localStorage.getItem(k), VISTA);

try {
  console.log('\n═══ T16 · guardar / cancelar / restablecer no tocan datos ═══');
  {
    const { ctx, p } = await abrir();
    await quieto(p, 600, 3000);                  // deja pasar cualquier escritura de arranque
    const antes = await datos(p), vistaAntes = await vista(p);
    const colocar = async w => {
      await p.locator('#cabCanvasEdit').click();
      await p.locator('#cabCanvasPanel').selectOption('panelRules');
      for (const [k, v] of Object.entries({ x: 1, y: 150, w, h: 8 })) await p.locator('#cabCanvas-' + k).fill(String(v));
      await p.locator('#cabCanvasApply').click();
    };
    await colocar(6);
    await p.locator('#cabCanvasCancel').click();
    await quieto(p, 600, 3000);
    ok(await vista(p) === vistaAntes, 'Cancelar deja las preferencias de vista como estaban');
    ok(await datos(p) === antes, 'y los datos, byte a byte');
    await colocar(6);
    await p.locator('#cabCanvasSave').click();
    await quieto(p, 600, 3000);
    const guardada = JSON.parse(await vista(p));
    ok(guardada.pages.cabina.canvas.desktop.find(i => i.id === 'panelRules').w === 6, 'Guardar escribe la distribución en las preferencias de vista');
    ok(await datos(p) === antes, 'Guardar la distribución no cambia operaciones, reglas, cuentas ni días');
    await p.locator('#cabCanvasEdit').click();
    await p.locator('#cabCanvasReset').click();
    await quieto(p, 600, 3000);
    ok(await datos(p) === antes, 'Restablecer la distribución tampoco');
    await p.reload(); await arrancada(p, null);
    ok(Object.keys(JSON.parse(await datos(p)).trades).length === 1, 'y tras recargar la operación sigue ahí');
    await ctx.close();
  }

  console.log('\n═══ T17 · preferencias de vista rotas ═══');
  const rotas = {
    'JSON truncado': '{"pages":{"cabina":{"canvas":{"desktop":[',
    'no es un objeto': '"hola"',
    'null': 'null',
    'un panel que ya no existe': JSON.stringify({ hidden: { cabina: ['panelRetiradoEnUnaActualizacion'] }, pages: { cabina: { canvas: { desktop: [{ id: 'panelRetirado', x: 0, y: 0, w: 6, h: 8 }] } } } }),
    'tipos equivocados': JSON.stringify({ density: 7, hidden: 'todo', columns: [], pages: { cabina: { canvas: { desktop: 'x', mobile: { a: 1 } }, layout: 3 } }, saved: {} }),
    'todos los paneles ocultos': JSON.stringify({ hidden: { cabina: ['panelJournal', 'panelAccts', 'panelCheck', 'panelRules', 'panelLevels', 'panelHist', 'panelDiscipline', 'panelCabCal', 'cabEquityPanel', 'cabRecentPanel', 'sesBar'] } }),
  };
  for (const [nombre, valor] of Object.entries(rotas)) {
    const n0 = errores.length;
    const { ctx, p } = await abrir(valor);
    const vivo = await p.evaluate(() => typeof window.FUT !== 'undefined' && !!document.getElementById('sesEstado') && document.getElementById('sesBar').getBoundingClientRect().height > 40);
    ok(vivo && errores.length === n0, `${nombre}: arranca y la barra de sesión se ve`, errores.slice(n0).join(' | ') || null);
    ok(await p.evaluate(() => window.FUT.trades().length) === 1, `${nombre}: el historial no se vacía`);
    ok(await p.locator('#quickBtn').isVisible(), `${nombre}: registrar sigue a mano`);
    await ctx.close();
  }
} catch (e) { fallos.push('excepción: ' + e.message); console.error(e); }
finally { await nav.close(); srv.close(); }
console.log(fallos.length ? `\nFAIL layout-datos: ${fallos.length}` : '\nPASS layout-datos');
process.exit(fallos.length ? 1 : 0);
