/* LO QUE SE PINTA, NO LO QUE SE DECLARA.
   ─────────────────────────────────────────────────────────────────────────────
   POR QUÉ EXISTE ESTE FICHERO, DICHO CON LO QUE PASÓ DE VERDAD:

   `tokens.mjs` vigila tres variables —--text, --muted, --dim— contra
   --surface-3, y las vigila bien. El día que la interfaz pasó a tema claro,
   `tokens.mjs` pasó en verde, y la aplicación tenía, a la vez:

     · las etiquetas de la barra inferior del móvil convertidas en bloques
       verdes, con el texto a 1.23:1 — ilegibles;
     · el anillo de :focus-visible todavía en el verdeazul viejo, 1.47:1 contra
       el fondo claro: quien navega con teclado no veía dónde estaba;
     · el raíl de pestañas con fondo casi negro y su texto a 2.62:1;
     · los bordes de control a 1.59:1, o sea inputs sin contorno visible.

   Ninguno de los cuatro toca --text, --muted ni --dim. Todos salían de colores
   escritos a mano en las reglas, que el bloque de tokens no gobierna. Una
   prueba que mira la DECLARACIÓN no puede verlos; hay que preguntarle al
   navegador por el color que acabó en la pantalla.

   QUÉ SE AFIRMA AQUÍ, recorriendo las ocho pestañas con datos:

     §1  Ningún elemento con texto propio baja del mínimo de contraste que le
         toca por tamaño (4.5:1, o 3:1 si es grande), contra el fondo que de
         verdad tiene detrás —subiendo por los ancestros hasta encontrar uno
         opaco, que es como lo compone el navegador.
     §2  Ningún elemento se pinta con un fondo OSCURO. La interfaz es clara: un
         fondo oscuro es un color heredado del tema anterior que se escapó. Se
         exceptúa el relleno de acento, que es deliberado y lleva tinta blanca.
     §3  El anillo de foco se ve: 3:1 contra el fondo, el mínimo de un objeto
         gráfico. Es el fallo más fácil de enviar sin enterarse, porque sólo
         aparece al tabular.
     §4  Ningún degradado de fondo esconde un color oscuro. `backgroundColor`
         devuelve transparente cuando hay un degradado, así que §2 pasa de
         largo por encima de ellos: así se colaron una caja negra y el item
         activo del raíl en verde casi negro, que sólo se vieron mirando. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const TABS = ['cabina', 'futuros', 'edge', 'invest', 'playbook', 'ideas', 'estudio', 'calc'];

const b = await chromium.launch();
const pag = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const erroresJs = [];
pag.on('pageerror', e => erroresJs.push(String(e).slice(0, 120)));
await pag.goto(BASE);
await pag.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), SEMILLA);
await pag.reload();
await pag.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

/* El relleno de acento es un fondo oscuro a propósito: lleva --accent-ink
   encima. Se identifica por su color, no por su selector, para que siga
   valiendo si el botón cambia de clase. */
const MIDE = () => {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  const ratio = (a, z) => { const [x, y] = [lum(a), lum(z)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).map(Number); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]; };
  /* --accent se lee como lo escribe el bloque de tokens, que es un hex, no un
     rgb(): parsearlo sólo como rgb() devolvía null y entonces NINGÚN relleno se
     consideraba deliberado, así que §2 marcaba en rojo los botones primarios.
     Un guardián que no sabe leer su propia referencia da falsos positivos, que
     es la forma más rápida de que alguien lo desactive. */
  const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec((s || '').trim());
    return m ? [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16), 1] : null; };
  const crudo = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const acento = parse(crudo) || hex(crudo);
  const esAcento = c => acento && Math.abs(c[0] - acento[0]) < 6 && Math.abs(c[1] - acento[1]) < 6 && Math.abs(c[2] - acento[2]) < 6;
  const sig = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.id ? '#' + el.id : '');
  const fondoDe = el => { let n = el;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c; n = n.parentElement; }
    return parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]; };
  const flojos = [], oscuros = [], degradados = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.1) continue;
    const propio = parse(st.backgroundColor);
    if (propio && propio[3] > 0.5 && lum(propio) < 0.30 && !esAcento(propio))
      oscuros.push(`${sig(el)} « ${st.backgroundColor}`);
    if (st.backgroundImage && st.backgroundImage !== 'none')
      for (const m of st.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)) {
        const p = m[1].split(/[,\s/]+/).map(Number);
        if ((p[3] === undefined || p[3] > 0.5) && lum(p) < 0.25 && !esAcento(p))
          degradados.push(`${sig(el)} « ${m[0]}`);
      }
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.data.trim())) {
      const tinta = parse(st.color);
      if (tinta && tinta[3] > 0.5) {
        const fondo = fondoDe(el), cr = ratio(tinta, fondo);
        const px = parseFloat(st.fontSize), negrita = +st.fontWeight >= 700;
        const min = (px >= 24 || (px >= 18.66 && negrita)) ? 3 : 4.5;
        if (cr < min) flojos.push(`${sig(el)} « ${st.color} sobre rgb(${fondo[0]},${fondo[1]},${fondo[2]}) = ${cr.toFixed(2)}:1 @${px}px (min ${min})`);
      }
    }
  }
  return { flojos: [...new Set(flojos)], oscuros: [...new Set(oscuros)], degradados: [...new Set(degradados)] };
};

const acc = { flojos: new Set(), oscuros: new Set(), degradados: new Set() };
let pestañas = 0;
for (const t of TABS) {
  await pag.click(`[data-tab="${t}"]`);
  await pag.waitForFunction(x => document.querySelector(`.tab[data-tab="${x}"]`)?.classList.contains('active'), t, { timeout: 10000 });
  await pag.waitForTimeout(220);
  const r = await pag.evaluate(MIDE);
  for (const k of ['flojos', 'oscuros', 'degradados']) r[k].forEach(v => acc[k].add(v));
  pestañas++;
}

/* §3 · el anillo de foco, con el foco puesto de verdad: `outline-color` en
   reposo miente, porque muchas reglas sólo lo definen dentro de :focus-visible. */
await pag.keyboard.press('Tab'); await pag.keyboard.press('Tab');
await pag.waitForTimeout(120);
const foco = await pag.evaluate(() => {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).map(Number); return [p[0], p[1], p[2]]; };
  const a = document.activeElement; if (!a || a === document.body) return null;
  const st = getComputedStyle(a);
  const anillo = parse(st.outlineColor), fondo = parse(getComputedStyle(document.body).backgroundColor);
  if (!anillo || !fondo) return null;
  const [x, y] = [lum(anillo), lum(fondo)].sort((m, n) => n - m);
  return { quien: a.tagName + '.' + a.className, color: st.outlineColor, ancho: st.outlineWidth,
           estilo: st.outlineStyle, cr: (x + .05) / (y + .05) };
});
await b.close(); srv.close();

console.log('\n═══ §1 · NINGÚN TEXTO POR DEBAJO DE SU MÍNIMO DE CONTRASTE ═══');
ok(acc.flojos.size === 0, `ningún texto flojo en las ${pestañas} pestañas`,
   acc.flojos.size ? [...acc.flojos].slice(0, 6).join(' · ') : 'cero');

console.log('\n═══ §2 · NINGÚN FONDO OSCURO EN UNA INTERFAZ CLARA ═══');
ok(acc.oscuros.size === 0, 'ningún elemento se pinta sobre fondo oscuro heredado',
   acc.oscuros.size ? [...acc.oscuros].slice(0, 6).join(' · ') : 'cero (el relleno de acento no cuenta: es deliberado)');

console.log('\n═══ §3 · EL ANILLO DE FOCO SE VE ═══');
ok(foco !== null, 'tabular deja el foco en un control', foco ? foco.quien.slice(0, 40) : 'el foco no salió de <body>');
ok(foco !== null && foco.estilo !== 'none' && parseFloat(foco.ancho) >= 1 && foco.cr >= 3,
   'el anillo de foco llega a 3:1 contra el fondo',
   foco ? `${foco.color} ${foco.ancho} ${foco.estilo} = ${foco.cr.toFixed(2)}:1` : 'sin foco que medir');

console.log('\n═══ §4 · NINGÚN DEGRADADO ESCONDE UN COLOR OSCURO ═══');
ok(acc.degradados.size === 0, 'ningún fondo de degradado trae color oscuro',
   acc.degradados.size ? [...acc.degradados].slice(0, 6).join(' · ') : 'cero');

ok(erroresJs.length === 0, 'ningún error de página al recorrerlas', erroresJs.join(' | ') || 'ninguno');

console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
