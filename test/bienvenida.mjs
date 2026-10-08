/* BIENVENIDA · que el primer arranque PIDA la cuenta, y que no la pida más.

   Qué falló: la cabina abría en local con un botón «Entrar» discreto en la
   cabecera y nada que invitara a usarlo. Quien recibía el enlace se ponía a
   apuntar operaciones en el localStorage de su navegador y no creaba cuenta
   nunca: sus datos no vivían en ninguna cuenta, borrar los datos del navegador
   los borraba, y dos personas en el mismo navegador compartían montón. El
   aislamiento por RLS estaba perfecto y no servía de nada, porque nadie llegaba
   a tener cuenta que aislar.

   Por qué una BARRA y no un diálogo: lo intenté primero como una ventana que se
   abría sola al arrancar, y la compuerta lo tumbó — 12 filas en rojo, once
   suites muriendo a los 32 s, que es el timeout de Playwright cuando un clic
   choca contra un overlay. Eso no era un problema de las pruebas: era la
   medición diciendo que la cabina deja de responder hasta que alguien cierre
   algo. Por eso la aserción de §2 de aquí es la que más importa.

   Las cinco que importan, y por qué cada una:

     · navegador virgen            -> SE VE. Es la razón de existir del cambio.
     · la cabina responde igual    -> con la barra puesta. Si esto falla el
                                      arreglo es peor que el problema: la app
                                      entera deja de aceptar clics.
     · «Crear cuenta»              -> abre el diálogo de cuenta de verdad.
     · «Ahora no» y recarga        -> NO vuelve. Una barra que reaparece en cada
                                      recarga enseña a ignorarla.
     · navegador que ya tiene datos-> NO se ve. A quien ya tiene su cabina llena
                                      no se le interrumpe: ya eligió, y
                                      preguntar otra vez es no haberle escuchado.

   Lo que NO prueba: que el alta contra Supabase funcione. Eso depende del Site
   URL y los Redirect URLs del proyecto (docs/COMPARTIR.md §4) y no se puede
   comprobar desde aquí. Esto mide que SE PIDE la cuenta, no que se consiga. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const errs = [];
const b = await chromium.launch();
const nueva = async siembra => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  if (siembra) await p.addInitScript(siembra);
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  return p;
};
const estado = p => p.evaluate(() => {
  const v = id => { const e = document.getElementById(id); return e ? !e.hidden : null; };
  return {
    abierta: document.getElementById('authOv').classList.contains('open'),
    titulo: document.getElementById('auTitle').textContent,
    bienv: v('auBienv'), escape: v('auSinCuenta'),
    marca: localStorage.getItem('cabina:bienvenida:v1'),
  };
});

const ve = p => p.evaluate(() => {
  const b = document.getElementById('cuentaBar');
  const o = document.getElementById('authOv');
  return {
    barra: b ? !b.hidden : null,
    dialogo: o.classList.contains('open'),
    titulo: document.getElementById('auTitle').textContent,
    marca: localStorage.getItem('cabina:bienvenida:v1'),
  };
});

console.log('\n═══ 1 · el navegador virgen recibe la invitación ═══');
let p = await nueva();
let e = await ve(p);
ok(e.barra === true, 'la barra «Sin cuenta» se ve en la primera visita', e.barra ? '' : 'no se ve: nadie creará cuenta');
const texto = await p.evaluate(() => document.getElementById('cuentaBar').innerText);
ok(/sólo en este navegador/i.test(texto), 'dice qué se pierde sin cuenta', JSON.stringify(texto.slice(0, 56)));

console.log('\n═══ 2 · y NO bloquea la cabina ═══');
/* La que más importa. Un diálogo al arrancar intercepta los clics de toda la
   app: no es una molestia, es que la cabina deja de responder. */
ok(e.dialogo === false, 'no hay ningún diálogo abierto por encima');
const vivo = await p.evaluate(async () => {
  const t = document.querySelector('.tabbtn[data-tab="calc"]');
  if (!t) return 'sin pestaña';
  t.click();
  await new Promise(r => setTimeout(r, 250));
  const a = document.querySelector('.tabbtn.active');
  return a ? a.getAttribute('data-tab') : 'ninguna activa';
});
ok(vivo === 'calc', 'la cabina responde a los clics con la barra puesta', 'pestaña activa=' + vivo);
/* Y el clic de verdad, con el ratón: `evaluate` esquivaría un overlay que
   Playwright sí notaría. Si algo tapa la pestaña, esto expira. */
await p.click('.tabbtn[data-tab="cabina"]', { timeout: 5000 });
ok(true, 'un clic real del ratón llega a la pestaña, nada lo intercepta');

console.log('\n═══ 3 · «Crear cuenta» abre el diálogo de verdad ═══');
await p.click('#cuentaBarCrear');
await p.waitForTimeout(300);
e = await ve(p);
ok(e.dialogo === true, 'se abre el diálogo de cuenta');
ok(/crea tu cuenta/i.test(e.titulo), 'y su título invita a crearla', JSON.stringify(e.titulo));
const bienv = await p.evaluate(() => !document.getElementById('auBienv').hidden && !document.getElementById('auSinCuenta').hidden);
ok(bienv, 'con la explicación y la salida sin cuenta');

console.log('\n═══ 4 · «Ahora no» se respeta ═══');
await p.click('#auClose');
await p.waitForTimeout(200);
await p.click('#cuentaBarNo');
await p.waitForTimeout(250);
e = await ve(p);
ok(e.barra === false, 'la barra se va');
ok(e.marca === '1', 'queda anotado que ya se preguntó', 'marca=' + e.marca);
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(700);
e = await ve(p);
ok(e.barra === false, 'y NO vuelve en la siguiente visita', e.barra ? 'reaparece en cada recarga' : '');

console.log('\n═══ 5 · a quien ya tiene datos no se le interrumpe ═══');
const p2 = await nueva(() => localStorage.setItem('cabina-mnq:v1',
  JSON.stringify({ days: { '2026-01-02': { date: '2026-01-02', notes: 'algo' } } })));
e = await ve(p2);
ok(e.barra === false, 'con datos ya guardados NO se ve', e.barra ? 'interrumpe a quien ya eligió' : '');
ok(e.marca === null, 'y no se marca nada: si algún día se vacía, se preguntará', 'marca=' + e.marca);

console.log('\n═══ 6 · con sesión no hay nada que preguntar ═══');
const p3 = await nueva(() => localStorage.setItem('cabina-sesion:v1',
  /* La forma la decide `sesLee()`: exige `at`, `rt` y `uid`. Con cualquier otra
     la sesión se descarta y la app arranca SIN sesión — que fue justo lo que
     pasó al escribir esto, y por un momento pareció un fallo de la app. */
  JSON.stringify({ at: 'x', rt: 'y', uid: '00000000-0000-0000-0000-000000000001', email: 'a@b.c' })));
e = await ve(p3);
ok(e.barra === false, 'con sesión iniciada no se invita a crear otra');

ok(errs.length === 0, 'ningún error de JavaScript en toda la prueba', errs.length ? errs.slice(0, 3).join(' · ') : '');

await b.close(); srv.close();
console.log(fallos.length ? `\n${fallos.length} fallos: ${fallos.join(' · ')}` : '\nsin fallos');
process.exit(fallos.length ? 1 : 0);
