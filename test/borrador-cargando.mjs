/* EL BORRADOR NO SE PIERDE PORQUE LA CUENTA NO HAYA CARGADO.
   ─────────────────────────────────────────────────────────────────────────────
   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, Y QUE ESTABA MEDIDO.
   `coll().set()` rechaza la escritura mientras la coleccion no ha llegado, y
   hace bien: escribir sobre una lista vacia borraria lo que aun no bajo.
   Devuelve `false` — y ninguno de los 65 sitios que la llaman mira ese valor.

   En el editor de operaciones eso significaba: rellenas la operacion, pulsas
   Guardar, el dialogo se cierra, NO aparece ninguna fila, y el motivo sale por
   `flash()` hacia `#jSaved`, que vive DENTRO de la pestana Cabina. Medido con
   el navegador: `#jSaved` se ve en 1 de las 11 pestanas, y el boton de nueva
   operacion (`#ftNew`) esta en Futuros, que es una de las otras diez. La barra
   SI avisa —«cargando datos», medida visible en las once pestanas y en
   escritorio y telefono— asi que el estado nunca estuvo oculto; lo que se
   perdia era lo ESCRITO.

   El editor ya tenia el mecanismo, documentado en su propio `edSave`: «Guardar
   cierra el editor salvo que onSave diga lo contrario con `false`. Eso permite
   abortar sin perder el borrador». Y `flashEd` escribe DENTRO del dialogo, que
   se ve donde se este. Lo que faltaba era usarlo.

   Se prueba con la coleccion de trades en fallo de lectura, que es el estado
   `loaded === false` de forma determinista —sin carrera de reloj— y ademas el
   unico que puede durar: el incidente PGRST002/503 de outage-recovery.mjs. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const srv = sirvePublicado(readFileSync(join(raiz, 'index.html')));
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/';
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1366, height: 950 } });
const remoto = nubeDoble();
const uid = await remoto.conSesion(ctx, 'borrador@ejemplo.invalid');
remoto.siembra(uid, 'settings/main', {
  meta: { title: 'Mi cuenta' },
  accounts: [{ id: 'prop25', name: 'Cuenta 25K', firm: 'Prueba' }], updatedAt: 1000,
});
remoto.e.lecturasRotas = 'trades';

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
try {
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => window.FUT && typeof FUT.trades === 'function');
  await p.waitForFunction(() => /cargando datos|sin actualizar/i.test(document.getElementById('saveState').textContent), null, { timeout: 15000 });

  const barra = await p.evaluate(() => document.getElementById('saveState').textContent.trim());
  ok(!/sincronizado/i.test(barra), 'la barra no dice «sincronizado» con las lecturas en fallo', `«${barra}»`);
  ok(await p.evaluate(() => !FUT.trades().length), 'todavía no hay operaciones cargadas');

  /* El escenario exacto: el usuario está en FUTUROS, donde #jSaved no se ve. */
  await p.locator('#tabnav .tabbtn[data-tab="futuros"]').click();
  await p.waitForTimeout(200);
  const jSavedSeVe = await p.evaluate(() => {
    const el = document.getElementById('jSaved'); if (!el) return false;
    const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0;
  });
  ok(jSavedSeVe === false, 'en Futuros el canal de flash() NO se ve: por eso el aviso no puede ir por ahí');

  await p.locator('#ftNew').click();
  await p.waitForFunction(() => document.getElementById('ov').classList.contains('open'), null, { timeout: 8000 });
  await p.fill('#ef_instrument', 'MNQ');
  await p.fill('#ef_date', '2026-11-05');
  const escrito = await p.inputValue('#ef_instrument');

  await p.locator('#edSave').click();
  await p.waitForTimeout(700);

  const tras = await p.evaluate(() => ({
    abierto: document.getElementById('ov').classList.contains('open'),
    /* NO BASTA LEER EL `value`: al cerrarse el editor el campo conserva su
       texto en el DOM —sólo se pierde la clase `open` del overlay—, así que
       ese aserto pasaba también SIN la guarda y no discriminaba. Se mide si el
       campo está VISIBLE, que es lo único que significa «el borrador sigue en
       pantalla y puedo reintentar». Detectado saboteando esta misma prueba. */
    instrumento: (() => { const el = document.getElementById('ef_instrument'); if (!el) return null;
      const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0 ? el.value : null; })(),
    aviso: (document.getElementById('edValidation') || {}).textContent || '',
    guardarActivo: !document.getElementById('edSave').disabled,
    ops: FUT.trades().length,
  }));
  ok(tras.abierto === true, 'el diálogo NO se cierra: el borrador sigue en pantalla');
  ok(tras.instrumento === escrito, 'lo escrito se conserva intacto', `«${tras.instrumento}»`);
  ok(/cargando/i.test(tras.aviso), 'el motivo se dice DENTRO del diálogo, donde se ve', `«${tras.aviso.trim().slice(0, 80)}»`);
  ok(tras.guardarActivo === true, 'el botón Guardar vuelve a estar activo para reintentar');
  ok(tras.ops === 0, 'y no se fabricó ninguna operación a medias');

  /* Se restablece la lectura: el MISMO borrador tiene que poder guardarse. */
  remoto.e.lecturasRotas = '';
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => /sincronizado/i.test(document.getElementById('saveState').textContent), null, { timeout: 20000 });
  await p.locator('#edSave').click();
  await p.waitForFunction(() => !document.getElementById('ov').classList.contains('open'), null, { timeout: 10000 });
  await p.waitForFunction(() => FUT.trades().length === 1, null, { timeout: 10000 });
  const guardada = await p.evaluate(() => FUT.trades()[0]);
  ok(guardada && guardada.instrument === 'MNQ', 'tras recuperarse la lectura, el mismo borrador se guarda', `instrument=${guardada && guardada.instrument}`);
  ok(errs.length === 0, 'sin errores JavaScript en todo el recorrido', errs.slice(0, 2).join(' · ') || 'ninguno');
} finally {
  await nav.close();
  await new Promise(r => srv.close(r));
}
console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' | ') : ''));
if (fallos.length) process.exitCode = 1;
