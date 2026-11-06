/* Mide qué textos EN FRASE se pintan en monoespaciada.
 *
 * Por qué existe: en Cabina la mono es el tipo de los DATOS (cifras, tickers,
 * horas, porcentajes) y la de interfaz es la del TEXTO. Cuando una frase entera
 * cae en mono, la pantalla se lee como una consola. Medido el 2026-11-06: de 729
 * textos visibles, 220 eran mono, y de esos 22 eran frases o etiquetas. Las
 * reglas que las pintaban se corrigieron; esta prueba impide que vuelvan.
 *
 * No prohíbe la mono: prohíbe que APAREZCAN frases nuevas en mono sin decidirlo.
 * Las excepciones de abajo son deliberadas y cada una dice por qué.
 */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const TABS = ['cabina','futuros','cuentas','edge','invest','historial','playbook','ideas','estudio','calc','ajustes'];

/* Textos en frase que SIGUEN en mono a propósito. Clave: etiqueta+clases del
 * elemento « el primer ancestro con clase. */
const PERMITIDAS = new Map([
  ['b « vacio',                 'titular de estado vacío; los titulares de sección son mono en toda la app'],
  ['small « sn',                'línea de reloj: la hora es dato y manda sobre el resto'],
  ['span.meta « credo',         'ranura de metadatos de panel; alterna con contadores'],
  ['span.rulesstate.dim « panel', 'insignia en versales; las insignias son mono'],
  ['span.mono « toolbar',       'el autor la marcó .mono y contiene la fórmula N = 0'],
  ['span « srcrow',             'fila de procedencia: etiquetas y estados, no prosa de lectura'],
]);

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto(base);
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

  const vistas = new Map();
  let totales = 0, monos = 0;
  for (const t of TABS) {
    await p.click(`[data-tab="${t}"]`);
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const fam = v => cs.getPropertyValue(v).trim().split(',')[0].replace(/["']/g, '').toLowerCase();
      const mono = fam('--font-mono');
      const res = { total: 0, mono: 0, prosa: [] };
      for (const el of document.querySelectorAll('.tab.active *')) {
        if (!el.offsetParent) continue;
        const q = el.getBoundingClientRect();
        if (!q.width || !q.height) continue;
        const txt = [...el.childNodes].filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim()).join(' ').trim();
        if (!txt) continue;
        res.total++;
        if (getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').toLowerCase() !== mono) continue;
        res.mono++;
        /* Frase: tres palabras o más, con alguna palabra larga de letras, y que
         * no sea una tirada de cifras y signos. */
        const pal = txt.split(/\s+/);
        if (!(pal.length >= 3 && /[a-záéíóúñ]{5,}/i.test(txt) && !/^[\d\s.,:%$+\-/]+$/.test(txt))) continue;
        const clases = e => (typeof e.className === 'string' && e.className.trim())
          ? '.' + e.className.trim().split(/\s+/).join('.') : '';
        let anc = el.parentElement, cl = '';
        while (anc && anc !== document.body && !cl) { cl = clases(anc).slice(1).split('.')[0] || ''; anc = anc.parentElement; }
        res.prosa.push({ clave: `${el.tagName.toLowerCase()}${clases(el)} « ${cl}`, txt: txt.slice(0, 44) });
      }
      return res;
    });
    totales += r.total; monos += r.mono;
    for (const { clave, txt } of r.prosa) if (!vistas.has(clave)) vistas.set(clave, { txt, tab: t });
  }

  console.log(`  textos visibles ${totales} · en mono ${monos} (${(monos / totales * 100).toFixed(1)} %)`);

  /* 1. Ninguna frase nueva en mono. */
  const nuevas = [...vistas.keys()].filter(k => !PERMITIDAS.has(k));
  ok(nuevas.length === 0, 'ninguna frase nueva se pinta en monoespaciada',
     nuevas.length ? `nuevas=${nuevas.map(k => `${k} «${vistas.get(k).txt}» (${vistas.get(k).tab})`).join(' | ')}` : `permitidas=${vistas.size}`);

  /* 2. Las reglas corregidas siguen corregidas. Si una vuelve a mono reaparece
   *    arriba, pero una regla puede desaparecer del DOM y dejar de medirse: lo
   *    comprobamos directamente contra el CSS calculado. */
  const ui = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const f = v => cs.getPropertyValue(v).trim().split(',')[0].replace(/["']/g, '').toLowerCase();
    return { ui: f('--font-ui'), mono: f('--font-mono') };
  });
  ok(ui.ui !== ui.mono, 'los dos tipos son distintos', `ui=${ui.ui} mono=${ui.mono}`);

  await p.click('[data-tab="cabina"]'); await p.waitForTimeout(200);
  const synced = await p.evaluate(() => {
    const e = document.querySelector('.tab.active .synced');
    return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').toLowerCase() : null;
  });
  ok(synced === ui.ui, '.synced (prosa de estado) usa la de interfaz', `= ${synced}`);

  /* La cabecera de tabla se mide en la pestana que TIENE tabla. Si se midiera
   * donde no hay ninguna, el check pasaria por no encontrar nada, que es la
   * forma mas facil de tener un verde que no mide. Por eso exige haber contado
   * al menos una cabecera, y una a la derecha (th.r), que es la que la cascada
   * se llevaba a mono. */
  await p.click('[data-tab="calc"]'); await p.waitForTimeout(300);
  const cab = await p.evaluate(() => {
    const f = e => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').toLowerCase();
    const ths = [...document.querySelectorAll('.tab.active table.t thead th')];
    return { n: ths.length, nr: ths.filter(e => e.classList.contains('r')).length,
             fams: [...new Set(ths.map(f))] };
  });
  ok(cab.n > 0, 'hay cabeceras de tabla que medir', `th=${cab.n} de las cuales th.r=${cab.nr}`);
  ok(cab.nr > 0, 'hay al menos una cabecera alineada a la derecha', `th.r=${cab.nr}`);
  ok(cab.n > 0 && cab.fams.length === 1 && cab.fams[0] === ui.ui,
     'todas las cabeceras de tabla usan la de interfaz', `familias=${cab.fams.join(' / ')}`);

  /* 3. Las excepciones declaradas existen. Una excepción que ya no se cumple es
   *    una lista que miente, igual que un check verde que no mide nada. */
  const muertas = [...PERMITIDAS.keys()].filter(k => !vistas.has(k));
  ok(muertas.length === 0, 'no hay excepciones muertas en la lista',
     muertas.length ? `sobran=${muertas.join(' | ')}` : `${PERMITIDAS.size} vigentes`);
} finally {
  await nav.close(); srv.close();
}
console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nsin fallos');
process.exit(fallos.length ? 1 : 0);
