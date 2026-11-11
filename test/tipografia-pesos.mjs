/* Mide con cuántos PESOS distintos se pinta la aplicación.
 *
 * Por qué existe: el 2026-11-11 convivían doce. Entre ellos 650, 680, 720 y
 * 750, que nadie distingue a simple vista pero obligan a elegir uno cada vez
 * que se escribe una regla, y así es como se llega a doce. Se movieron 54
 * declaraciones a la escala que la aplicación YA usaba —400/500/600/700/800—
 * y los pesos renderizados pasaron de 11 a 6.
 *
 * No prohíbe pesos: prohíbe que aparezcan NUEVOS fuera de la escala sin
 * decidirlo. La única excepción es deliberada y lleva su motivo escrito.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { sirvePublicado } from './publicado.mjs';

const TABS = ['cabina','futuros','cuentas','edge','invest','historial','playbook','ideas','estudio','calc','ajustes'];
const ESCALA = new Set(['400','500','600','700','800']);
/* `body { font-weight: 450 }` es intencionado: su comentario dice «más cuerpo
 * y más peso», y 450 cae EXACTAMENTE entre 400 y 500, así que no hay valor más
 * cercano: redondear decide el grosor de TODO el texto de la aplicación. Se
 * deja como está y se declara aquí, en vez de colarlo en la escala. */
const EXCEPCION = '450';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

/* 1 · ESTÁTICO: ninguna declaración fuera de la escala, ni en los bloques
 *     <style> ni en los atributos `style=`. Lo segundo no sobra: el único
 *     rezagado de la limpieza era un `style="...font-weight:650..."` en línea,
 *     invisible para un escáner que sólo mire el CSS. */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sueltos = [];
for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
  for (const [, v] of css.matchAll(/(?<![-\w])font-weight\s*:\s*(\d{3})\b/g))
    if (!ESCALA.has(v) && v !== EXCEPCION) sueltos.push(`bloque:${v}`);
  for (const [, v] of css.matchAll(/(?<![-\w])font\s*:\s*(\d{3})(?=\s)/g))
    if (!ESCALA.has(v) && v !== EXCEPCION) sueltos.push(`atajo:${v}`);
}
for (const [, attr] of html.matchAll(/style="([^"]*)"/g))
  for (const [, v] of attr.matchAll(/font-weight\s*:\s*(\d{3})/g))
    if (!ESCALA.has(v) && v !== EXCEPCION) sueltos.push(`en-linea:${v}`);
ok(sueltos.length === 0, 'ninguna declaración de peso fuera de la escala',
   sueltos.length ? sueltos.slice(0, 8).join(' · ') : `escala=${[...ESCALA].join('/')} + ${EXCEPCION} en body`);

const srv = sirvePublicado();
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const nav = await chromium.launch();
try {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  /* Reloj congelado por el mismo motivo que en tipografia-prosa: sin esto la
   * página medida cambia con el estado del mercado. */
  await p.clock.setFixedTime(new Date('2026-11-06T21:12:00Z'));
  await p.goto(base);
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

  const hist = {}; let total = 0; const fuera = [];
  for (const t of TABS) {
    await p.click(`[data-tab="${t}"]`);
    await p.waitForTimeout(250);
    const r = await p.evaluate(tab => {
      const out = [];
      for (const el of document.querySelectorAll('.tab.active *')) {
        if (!el.offsetParent) continue;
        const q = el.getBoundingClientRect();
        if (!q.width || !q.height) continue;
        const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (!txt) continue;
        out.push([getComputedStyle(el).fontWeight, `${tab}:${el.tagName.toLowerCase()} «${txt.slice(0, 22)}»`]);
      }
      return out;
    }, t);
    for (const [w, quien] of r) {
      hist[w] = (hist[w] || 0) + 1; total++;
      if (!ESCALA.has(w) && w !== EXCEPCION) fuera.push(`${w} ${quien}`);
    }
  }

  console.log(`  ${total} textos visibles · ${Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([w, c]) => `${w}×${c}`).join('  ')}`);

  /* 2 · RENDERIZADO: lo que de verdad se pinta. Un peso puede llegar por
   *     herencia o por una regla que el escáner estático no sepa leer. */
  ok(fuera.length === 0, 'ningún texto se pinta con un peso fuera de la escala',
     fuera.length ? fuera.slice(0, 6).join(' · ') : `${Object.keys(hist).length} pesos distintos`);

  /* 3 · El recuento no debe crecer sin que alguien lo decida. */
  ok(Object.keys(hist).length <= 6, 'como mucho 6 pesos distintos en pantalla',
     `hay ${Object.keys(hist).length}: ${Object.keys(hist).sort((a, b) => a - b).join(', ')}`);

  /* 4 · La excepción tiene que seguir VIVA: si body dejara de ser 450, esta
   *     lista estaría mintiendo y habría que borrarla, no conservarla. */
  ok(hist[EXCEPCION] > 0, 'la excepción declarada sigue existiendo', `${EXCEPCION} en ${hist[EXCEPCION] || 0} textos`);

  /* 5 · Y que medimos algo. */
  ok(total > 500, 'se midió la aplicación entera', `${total} textos en ${TABS.length} pestañas`);
} finally {
  await nav.close(); srv.close();
}
console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nsin fallos');
process.exit(fallos.length ? 1 : 0);
