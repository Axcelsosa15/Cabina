/* CAPTURAS · el bucket privado «capturas» de la cuenta, por la interfaz de verdad.

   Sube una imagen desde el editor de operaciones (el file chooser real), recarga y
   comprueba que se ve, que la pide con el token de su dueño, que otro usuario no
   la ve, que al quitarla se borra del bucket, y que sin cuenta la app lo dice en
   vez de ofrecer un botón que no puede funcionar.

   Contra el doble de test/nube-doble.mjs. El aislamiento del bucket REAL está en
   supabase/pruebas/capturas.sql. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quieto } from './espera.mjs';
import { nubeDoble } from './nube-doble.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const URL_APP = 'file://' + join(raiz, 'index.html');
const D = nubeDoble(html);
/* Un PNG de 1×1 de verdad: el navegador tiene que poder decodificarlo. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const nav = await chromium.launch();
const errs = [];
async function abre(email) {
  const ctx = await nav.newContext();
  const uid = email ? await D.conSesion(ctx, email) : null;
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL_APP, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
  await quieto(p, 60, 2500);
  return { ctx, p, uid };
}
async function editorNuevo(p) {
  await p.click('.tabbtn[data-tab="futuros"]'); await quieto(p);
  await p.click('#ftNew'); await p.waitForSelector('#edShots', { timeout: 5000 });
}

console.log('\n═══ SUBIR · desde el editor, al bucket de la cuenta ═══');
const ana = await abre('ana@prueba.invalid');
await editorNuevo(ana.p);
ok(await ana.p.isVisible('#edShots button[data-act="add"]'), 'con cuenta, el editor ofrece «+ Añadir captura»');
const [fc] = await Promise.all([ana.p.waitForEvent('filechooser'), ana.p.click('#edShots button[data-act="add"]')]);
await fc.setFiles({ name: 'grafico.png', mimeType: 'image/png', buffer: PNG });
await ana.p.waitForSelector('#edShots figure.pbimg img', { timeout: 5000 });
const claves = [...D.e.objetos.keys()];
ok(claves.length === 1, 'la imagen llegó al bucket', claves.join(', '));
ok(claves[0] && claves[0].startsWith(ana.uid + '/'), 'y cuelga de la carpeta de su dueña', claves[0]);
ok(D.e.objetos.get(claves[0]) && D.e.objetos.get(claves[0]).bytes.equals(PNG), 'los bytes son los del fichero, sin tocar');
const subida = D.e.pedidas.find(x => x.m === 'POST' && x.ruta.startsWith('/storage/'));
ok(subida && /^Bearer /.test(subida.auth) && subida.apikey === D.CLAVE, 'se subió con el token de la sesión y la clave pública');
ok(await ana.p.evaluate(() => /^blob:/.test(document.querySelector('#edShots figure.pbimg img').src)), 'y se ve al momento, sin volver a pedirla');
await ana.p.click('#edSave'); await quieto(ana.p);
const t = await ana.p.evaluate(() => FUT.trades().find(x => x.images && x.images.length));
ok(t && t.images[0].id === claves[0].split('/')[1], 'la operación guarda sólo el id de la captura, no la imagen', t ? JSON.stringify(t.images[0]) : 'sin operación');
ok(t && !t.images[0].data, 'nada de data URI dentro del documento');

console.log('\n═══ VER · otra sesión del mismo usuario, recargando ═══');
const ana2 = await abre('ana@prueba.invalid');
await ana2.p.click('.tabbtn[data-tab="futuros"]'); await quieto(ana2.p);
await ana2.p.click('#ftSeg button[data-v="diario"]'); await quieto(ana2.p, 60, 3000);
await ana2.p.waitForFunction(() => { const i = document.querySelector('#jrTable img.thumb'); return i && /^blob:/.test(i.src); }, null, { timeout: 5000 }).catch(() => {});
const mini = await ana2.p.evaluate(() => { const i = document.querySelector('#jrTable img.thumb'); return i ? { src: i.src.slice(0, 5), w: i.naturalWidth, shot: i.dataset.shot || null } : null; });
ok(mini && mini.src === 'blob:', 'la miniatura se pide al bucket y se pinta', JSON.stringify(mini));
ok(mini && mini.w === 1, 'y es la imagen de verdad: el navegador la decodifica (1 px)');
ok(mini && !mini.shot, 'ya no queda marcada como pendiente');
const lectura = D.e.pedidas.find(x => x.m === 'GET' && x.ruta.startsWith('/storage/v1/object/authenticated/capturas/'));
ok(lectura && /^Bearer /.test(lectura.auth), 'la lectura va con token: el bucket no es público');

console.log('\n═══ AISLAMIENTO · otro usuario no la ve ═══');
const beto = await abre('beto@prueba.invalid');
/* Beto, con SU token, pide la ruta exacta de Ana. La app nunca construye esa ruta
   (siempre usa la carpeta del que tiene la sesión); esto es lo que haría alguien
   que tuviera el id. */
const ajena = await beto.p.evaluate(async ([nube, clave, ruta]) => {
  const s = JSON.parse(localStorage.getItem('cabina-sesion:v1'));
  const r = await fetch(nube + '/storage/v1/object/authenticated/capturas/' + ruta, { headers: { apikey: clave, authorization: 'Bearer ' + s.at } });
  return r.ok ? 'la leyó' : 'rechazada ' + r.status;
}, [D.NUBE, D.CLAVE, claves[0]]);
ok(/^rechazada/.test(ajena), 'Beto pide la ruta de Ana con su token y el bucket no se la da', ajena);
ok(D.e.objetos.size === 1, 'y lo de Ana sigue ahí');

console.log('\n═══ RESPALDO · las capturas viajan dentro del archivo ═══');
await ana2.p.evaluate(() => { document.getElementById('bkImgs').checked = true; });
const [dl] = await Promise.all([ana2.p.waitForEvent('download', { timeout: 10000 }), ana2.p.evaluate(() => document.getElementById('bkExport').click())]);
const copia = JSON.parse(readFileSync(await dl.path(), 'utf8'));
const ims = Object.values(copia.trades || {}).flatMap(x => x.images || []);
ok(ims.length === 1, 'el respaldo lleva la captura de la operación', `${ims.length}`);
ok(ims[0] && ims[0].data === 'data:image/png;base64,' + PNG.toString('base64'), 'metida dentro como data URI, con los mismos bytes que se subieron');
ok(copia.imagesInlined && copia.imagesInlined.failed === 0, 'sin ninguna que no se pudiera leer', JSON.stringify(copia.imagesInlined));

console.log('\n═══ BORRAR · quitarla la saca del bucket ═══');
await ana2.p.click('#jrTable button[data-act="edit"]');
await ana2.p.waitForSelector('#edShots figure.pbimg', { timeout: 5000 });
const rm = '#edShots button[data-act="rm"]';
await ana2.p.click(rm); await ana2.p.click(rm).catch(() => {}); await quieto(ana2.p);
ok(D.e.objetos.size === 0, 'el objeto ya no está en el bucket', `${D.e.objetos.size} objetos`);
await ana2.p.click('#edSave'); await quieto(ana2.p);
ok(await ana2.p.evaluate(() => !FUT.trades().some(x => x.images && x.images.length)), 'y la operación ya no la referencia');

console.log('\n═══ ERRORES · lo que el bucket rechaza se dice ═══');
await editorNuevo(ana2.p);
const [fc2] = await Promise.all([ana2.p.waitForEvent('filechooser'), ana2.p.click('#edShots button[data-act="add"]')]);
await fc2.setFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
await quieto(ana2.p);
ok(D.e.objetos.size === 0, 'un fichero que no es imagen no se sube');
ok(/solo imágenes/.test(await ana2.p.evaluate(() => document.body.textContent)), 'y la app dice por qué');
await ana2.p.keyboard.press('Escape');

console.log('\n═══ SIN CUENTA · no se ofrece lo que no puede funcionar ═══');
const local = await abre(null);
await editorNuevo(local.p);
ok(!(await local.p.isVisible('#edShots button[data-act="add"]')), 'sin cuenta no hay botón de añadir');
ok(/entra con ella para adjuntarlas/.test(await local.p.textContent('#edShots')), 'y el editor dice dónde se guardan las capturas', (await local.p.textContent('#edShots')).trim().slice(0, 90));

ok(errs.length === 0, 'ningún error de página', errs.length ? errs.join(' | ') : 'sin pageerror');
await nav.close();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
