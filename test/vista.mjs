/* VISTA · que ninguna de las siete pestanas se salga de la pantalla.

   `diseno.mjs` mide una sola pestana a 1600x1200: espaciado, tipos, contraste. Esto
   mide algo mas tonto y mas facil de romper -- si la pagina desborda en horizontal --
   en las SEIS pestanas y en tres anchos, incluido un telefono de 430px.

   Dos cosas que NO cuentan como desborde, y por que:

     · un elemento dentro de un contenedor que ya scrollea a proposito (la barra de
       pestanas es `overflow-x: auto`): se sale de la pantalla sin que la pagina
       desborde, y contarlo daba 5 falsos en el telefono;
     · las fuentes de Google, que en este contenedor no cargan porque el proxy usa su
       propia CA. Eso es del entorno y se cuenta aparte, para no taparlo ni
       confundirlo con un error de la pagina.

   Su modo de fallo: una rejilla con una pista minima mayor que el contenedor -- ya
   paso una vez con `.accts` y `minmax(620px, 1fr)` en un telefono de 430px, que
   cortaba cifras por la derecha. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const TABS = ['cabina', 'futuros', 'edge', 'invest', 'playbook', 'ideas', 'calc'];
const ANCHOS = [[1440, 900, 'escritorio'], [834, 1000, 'tableta'], [430, 900, 'telefono']];

const mide = p => p.evaluate(() => {
  const de = document.documentElement;
  const s = document.getElementById('saveState');
  const r = s ? s.getBoundingClientRect() : null;
  const cs = s ? getComputedStyle(s) : null;
  /* cualquier elemento que se salga por la derecha */
  /* Un elemento dentro de un contenedor que YA scrollea en horizontal -- la barra
     de pestanas es `overflow-x: auto` a proposito -- se sale de la pantalla sin que
     la pagina desborde. Contarlo daba 5 falsos en el telefono: eran las pestanas,
     que se desplazan con el dedo como estan disenadas. */
  const contenido = el => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (/auto|scroll|hidden/.test(o.overflowX) || /auto|scroll|hidden/.test(o.overflow)) return true;
    }
    return false;
  };
  let peor = null;
  for (const el of document.querySelectorAll('body *')) {
    if (!el.offsetParent && el !== document.body) continue;
    const q = el.getBoundingClientRect();
    if (q.width === 0 || q.height === 0) continue;
    const exceso = Math.round(q.right - de.clientWidth);
    if (exceso > 2 && !contenido(el) && (!peor || exceso > peor.exceso)) {
      peor = { exceso, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 44), id: el.id };
    }
  }
  return {
    scrollX: de.scrollWidth - de.clientWidth,
    rotulo: (s || {}).textContent || '',
    rotVis: !!(r && (r.width || r.height)),
    rotColor: cs ? cs.color : '', rotPeso: cs ? cs.fontWeight : '',
    rotClip: r ? Math.round(r.right - de.clientWidth) : null,
    peor,
    vacios: document.querySelectorAll('.empty').length,
  };
});

for (const [w, h, nombre] of ANCHOS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  /* Las fuentes de Google no cargan en este contenedor (el proxy con su propia CA):
     eso es del entorno, no de la app, y se cuenta aparte para no taparlo ni
     confundirlo con un error de la pagina. */
  const red = [];
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text().slice(0, 140);
    (/Failed to load resource|ERR_CERT|net::/.test(t) ? red : errs).push('CONSOLE ' + t);
  });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  console.log(`\n  ── ${nombre} ${w}×${h} ──────────────────────────────`);
  for (const t of TABS) {
    await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(320);
    const m = await mide(p);
    ok(m.scrollX <= 2 && !m.peor, `${t.padEnd(9)} sin desborde horizontal`,
       m.peor ? `${m.peor.tag}${m.peor.id ? '#' + m.peor.id : ''}.${m.peor.cls} se sale ${m.peor.exceso}px` : `scrollX ${m.scrollX}`);
  }
  ok(errs.length === 0, `ningun error de pagina en ${nombre}`, errs.slice(0, 2).join(' | ') || 'ninguno');
  console.log(`     · del entorno, no de la app: ${red.length} recurso(s) bloqueado(s) por el proxy${red.length ? ' (fuentes de Google)' : ''}`);
  await ctx.close();
}
await b.close(); srv.close();
console.log(fallos.length ? `\n  ${fallos.length} fallos` : '\n  todo en verde');
process.exit(fallos.length ? 1 : 0);
