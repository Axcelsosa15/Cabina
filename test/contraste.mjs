/* EL COLOR, MEDIDO EN LA PANTALLA Y EN LOS DOS TEMAS.
   ─────────────────────────────────────────────────────────────────────────────
   POR QUÉ EXISTE, Y QUÉ DEJÓ PASAR LA SUITE ANTES DE ÉL.

   `tokens.mjs` comprueba que --text, --muted y --dim cumplen AA sobre
   --surface-3. Eso vigila los TRES TOKENS, no los cientos de sitios donde
   alguien escribió un color a mano. Y `sistema.mjs` comprueba que cada
   primitiva tiene UN solo valor, no que ese valor se lea.

   Entre las dos quedaba un hueco por el que se coló esto, medido en Chromium
   con la semilla puesta y recorriendo las once pestañas:

     114 etiquetas de gráfico   fill:#c8d5df con !important EN LÍNEA, a 1.50:1
                                sobre blanco. Un estilo en línea con !important
                                gana a cualquier hoja, así que la capa de tema
                                NO podía corregirlo: el tema decía #536171 y la
                                pantalla pintaba #c8d5df.
       6 triángulos de regla    color: var(--line-strong) — el token de BORDE
                                usado como tinta: 1.48:1 en claro, 1.45:1 en
                                oscuro. Roto en LOS DOS temas.
       4 restos de paleta       #a5b3c0, #70e0cf, rgba(79,179,160,.8) escritos a
                                mano cuando la base era oscura, y que la capa
                                clara no cubría porque no los nombraba.

   Ninguno era visible para la suite: nadie medía el color COMPUESTO de un
   elemento contra el fondo COMPUESTO que tiene detrás.

   QUÉ SE AFIRMA AQUÍ

     §1  Ningún texto visible baja del suelo AA (4.5:1, o 3:1 si es grande),
         en NINGUNA de las once pestañas, en NINGUNO de los dos temas.
     §2  Las etiquetas de los gráficos se pintan con el color del tema activo
         y no con uno fijo: son texto, y el §1 no las ve porque su color va en
         `fill`, no en `color`.

   LO QUE NO SE MIDE, Y SE DICE: un elemento cuyo fondo —propio o heredado— es
   un DEGRADADO no se puede componer con una sola multiplicación, así que se
   cuenta aparte y no se afirma nada de él. Fingir un número ahí sería peor que
   no darlo: la primera versión de esta prueba lo hacía y daba 1.02:1 para un
   botón teal con tinta oscura, perfectamente legible. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sirvePublicado } from './publicado.mjs';
import { SEMILLA } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const TABS = ['cabina', 'futuros', 'cuentas', 'edge', 'invest', 'historial', 'playbook', 'ideas', 'estudio', 'calc', 'ajustes'];

/* El fondo de la página en cada tema, para medir el `fill` de los gráficos.
   Son los dos valores que el propio index.html declara, no una suposición. */
const FONDO = { light: [255, 255, 255], dark: [11, 14, 19] };

const luminancia = ch => ch.map(v => v / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  .reduce((a, v, i) => a + [.2126, .7152, .0722][i] * v, 0);
const razon = (a, z) => {
  const [x, y] = [luminancia(a), luminancia(z)].sort((m, n) => n - m);
  return (x + .05) / (y + .05);
};
const canales = c => { const m = String(c).match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : null; };

const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const nav = await chromium.launch();

for (const tema of ['light', 'dark']) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  const pag = await ctx.newPage();
  await pag.goto(BASE);
  await pag.evaluate(([semilla, t]) => {
    localStorage.setItem('cabina-mnq:v1', semilla);
    localStorage.setItem('cabina-appearance:v1', JSON.stringify({ mode: t, accent: 'default', custom: '#1d4ed8' }));
  }, [SEMILLA, tema]);
  await pag.reload();
  await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 30000 });

  const aplicado = await pag.evaluate(() => document.documentElement.dataset.cabinaTheme);
  ok(aplicado === tema, `tema «${tema}» realmente aplicado antes de medir`, `data-cabina-theme=${aplicado}`);

  let bajos = [], nomedibles = 0, medidos = 0;
  const fills = {};
  for (const t of TABS) {
    await pag.click(`[data-tab="${t}"]`);
    await pag.waitForFunction(x => {
      const e = document.querySelector(`.tab[data-tab="${x}"]`);
      return e && e.classList.contains('active');
    }, t, { timeout: 15000 });
    /* Las transiciones de color se interpolan: medir antes de que terminen lee
       un punto intermedio que no está en ninguna hoja. Ya pasó en sistema.mjs. */
    await pag.waitForTimeout(350);
    const r = await pag.evaluate(() => {
      const P = c => { const m = String(c).match(/[\d.]+/g); return m ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; };
      const L = ch => ch.map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((a, v, i) => a + [.2126, .7152, .0722][i] * v, 0);
      /* ¿hay un degradado entre este texto y el primer fondo opaco? */
      const conImagen = el => {
        let n = el;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          if (s.backgroundImage && s.backgroundImage !== 'none') return true;
          const c = P(s.backgroundColor); if (c && c.a >= 1) return false;
          n = n.parentElement;
        }
        return false;
      };
      /* el fondo REAL: todas las capas translúcidas compuestas una sobre otra */
      const fondo = el => {
        const capas = []; let n = el;
        while (n && n !== document.documentElement) {
          const c = P(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
          n = n.parentElement;
        }
        const rz = P(getComputedStyle(document.documentElement).backgroundColor);
        capas.push(rz && rz.a >= 1 ? rz : { r: 255, g: 255, b: 255, a: 1 });
        let o = capas[capas.length - 1];
        for (let i = capas.length - 2; i >= 0; i--) {
          const t = capas[i], a = t.a;
          o = { r: t.r * a + o.r * (1 - a), g: t.g * a + o.g * (1 - a), b: t.b * a + o.b * (1 - a), a: 1 };
        }
        return o;
      };
      const out = []; let nomed = 0, n = 0;
      for (const el of document.querySelectorAll('.tab.active *')) {
        if (!el.offsetParent) continue;
        const q = el.getBoundingClientRect(); if (!q.width || !q.height) continue;
        /* sólo quien lleva texto PROPIO: si no, se cuenta mil veces el color
           heredado de un contenedor que no pinta una sola letra */
        if (![...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue;
        if (conImagen(el)) { nomed++; continue; }
        const cs = getComputedStyle(el); const f = fondo(el); const c = P(cs.color);
        if (!c) continue;
        n++;
        const d = [c.r * c.a + f.r * (1 - c.a), c.g * c.a + f.g * (1 - c.a), c.b * c.a + f.b * (1 - c.a)];
        const x = L(d), y = L([f.r, f.g, f.b]);
        const ra = (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
        const px = parseFloat(cs.fontSize);
        const grande = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
        if (ra < (grande ? 3 : 4.5)) out.push({
          el: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''),
          r: +ra.toFixed(2), px,
          color: `rgb(${d.map(Math.round).join(',')})`,
          fondo: `rgb(${[f.r, f.g, f.b].map(Math.round).join(',')})`,
          txt: el.textContent.trim().slice(0, 30),
        });
      }
      const sv = {};
      for (const e of document.querySelectorAll('.tab.active svg.chart text')) {
        const fl = getComputedStyle(e).fill; sv[fl] = (sv[fl] || 0) + 1;
      }
      return { out, nomed, n, sv };
    });
    bajos.push(...r.out.map(x => ({ ...x, tab: t })));
    nomedibles += r.nomed; medidos += r.n;
    for (const k in r.sv) fills[k] = (fills[k] || 0) + r.sv[k];
  }

  console.log(`\n═══ §1 · TEMA ${tema.toUpperCase()} · NINGÚN TEXTO POR DEBAJO DE AA ═══`);
  const unicos = [...new Map(bajos.map(b => [b.el + b.color + b.fondo, b])).values()].sort((a, z) => a.r - z.r);
  ok(bajos.length === 0, `los ${medidos} textos visibles de las once pestañas llegan a AA`,
     bajos.length
       ? `${bajos.length} por debajo · ` + unicos.slice(0, 4).map(b => `${b.tab}·${b.el} ${b.color} sobre ${b.fondo} = ${b.r}:1`).join(' | ')
       : `0 por debajo · ${nomedibles} no medibles (fondo con degradado)`);

  console.log(`\n═══ §2 · TEMA ${tema.toUpperCase()} · LAS ETIQUETAS DEL GRÁFICO SIGUEN AL TEMA ═══`);
  const entradas = Object.entries(fills);
  const malas = entradas.filter(([f]) => { const c = canales(f); return !c || razon(c, FONDO[tema]) < 4.5; });
  ok(entradas.length > 0, `hay etiquetas de gráfico que medir en el tema ${tema}`,
     entradas.length ? entradas.map(([f, n]) => `${n}× ${f}`).join(' · ') : 'NINGUNA: la prueba no midió nada');
  ok(malas.length === 0, 'ninguna etiqueta de gráfico baja de AA sobre el fondo del tema',
     malas.length
       ? malas.map(([f, n]) => `${n}× ${f} = ${razon(canales(f), FONDO[tema]).toFixed(2)}:1`).join(' · ')
       : entradas.map(([f, n]) => `${n}× ${f} = ${razon(canales(f), FONDO[tema]).toFixed(2)}:1`).join(' · '));
  await ctx.close();
}
await nav.close(); srv.close();

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
