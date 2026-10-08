/* BIENVENIDA · que el primer arranque PIDA la cuenta, y que no la pida más.

   Qué falló: la cabina abría en local con un botón «Entrar» discreto en la
   cabecera y nada que invitara a usarlo. Quien recibía el enlace se ponía a
   apuntar operaciones en el localStorage de su navegador y no creaba cuenta
   nunca: sus datos no vivían en ninguna cuenta, borrar los datos del navegador
   los borraba, y dos personas en el mismo navegador compartían montón. El
   aislamiento por RLS estaba perfecto y no servía de nada, porque nadie llegaba
   a tener cuenta que aislar.

   Las cuatro que importan, y por qué cada una:

     · navegador virgen            -> SE ABRE. Es la razón de existir del cambio.
     · «Seguir sin cuenta»         -> cierra Y la app queda usable. Si esto falla
                                      el arreglo es peor que el problema: un muro
                                      de login sobre una configuración de Auth sin
                                      verificar deja fuera a TODO el mundo.
     · recarga después de cerrarla -> NO se abre. Una ventana que vuelve en cada
                                      recarga enseña a cerrarla sin leerla.
     · navegador que ya tiene datos-> NO se abre. A quien ya tiene su cabina
                                      llena no se le recibe con una ventana: ya
                                      eligió, y preguntar otra vez es no haberle
                                      escuchado.

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

console.log('\n═══ 1 · el navegador virgen recibe la invitación ═══');
let p = await nueva();
let e = await estado(p);
ok(e.abierta, 'la ventana de cuenta se abre sola en la primera visita', e.abierta ? '' : 'no se abrió: nadie creará cuenta');
ok(e.bienv === true, 'explica por qué conviene la cuenta', 'auBienv visible=' + e.bienv);
ok(e.escape === true, 'ofrece salida sin cuenta', 'auSinCuenta visible=' + e.escape);
ok(/crea tu cuenta/i.test(e.titulo), 'el título invita a crearla', JSON.stringify(e.titulo));

console.log('\n═══ 2 · «Seguir sin cuenta» deja la app usable ═══');
await p.click('#auSinCuenta');
await p.waitForTimeout(300);
e = await estado(p);
ok(!e.abierta, 'la ventana se cierra');
/* Que cierre no basta: lo que hay detrás tiene que responder. Un overlay que
   se queda capturando los clics deja la cabina muerta sin un solo error. */
const vivo = await p.evaluate(async () => {
  const t = document.querySelector('.tabbtn[data-tab="calc"]');
  if (!t) return 'sin pestaña';
  t.click();
  await new Promise(r => setTimeout(r, 250));
  const a = document.querySelector('.tabbtn.active');
  return a ? a.getAttribute('data-tab') : 'ninguna activa';
});
ok(vivo === 'calc', 'la cabina responde a los clics con la ventana cerrada', 'pestaña activa=' + vivo);

console.log('\n═══ 3 · no vuelve a preguntar ═══');
ok(e.marca === '1', 'queda anotado que ya se preguntó', 'marca=' + e.marca);
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(700);
e = await estado(p);
ok(!e.abierta, 'la segunda visita NO abre la ventana', e.abierta ? 'vuelve en cada recarga' : '');

console.log('\n═══ 4 · a quien ya tiene datos no se le interrumpe ═══');
const p2 = await nueva(() => localStorage.setItem('cabina-mnq:v1',
  JSON.stringify({ days: { '2026-01-02': { date: '2026-01-02', notes: 'algo' } } })));
e = await estado(p2);
ok(!e.abierta, 'con datos ya guardados NO se abre', e.abierta ? 'interrumpe a quien ya eligió' : '');
ok(e.marca === null, 'y no se marca nada: si algún día se vacía, se preguntará', 'marca=' + e.marca);

console.log('\n═══ 5 · con sesión no hay nada que preguntar ═══');
const p3 = await nueva(() => localStorage.setItem('cabina-sesion:v1',
  /* La forma la decide `sesLee()`: exige `at`, `rt` y `uid`. Con cualquier otra
     la sesión se descarta y la app arranca SIN sesión — que fue justo lo que
     pasó al escribir esto, y por un momento pareció un fallo de la app. */
  JSON.stringify({ at: 'x', rt: 'y', uid: '00000000-0000-0000-0000-000000000001', email: 'a@b.c' })));
e = await estado(p3);
ok(!e.abierta || e.titulo === 'Tu cuenta', 'con sesión iniciada no se invita a crear otra', 'titulo=' + JSON.stringify(e.titulo));

ok(errs.length === 0, 'ningún error de JavaScript en toda la prueba', errs.length ? errs.slice(0, 3).join(' · ') : '');

await b.close(); srv.close();
console.log(fallos.length ? `\n${fallos.length} fallos: ${fallos.join(' · ')}` : '\nsin fallos');
process.exit(fallos.length ? 1 : 0);
