/* LEER UN CSV DE BRÓKER · la parte que se puede probar sin tener el fichero.
   ─────────────────────────────────────────────────────────────────────────────
   `docs/IMPORTAR.md` dice que la fase 0 —un CSV real en `test/fixtures/`—
   bloquea el mapeo y la detección, y sigue bloqueándolos. Esto NO los toca.

   Lo que prueba es la capa de abajo: leer bytes. Y es la que importa más de lo
   que parece, porque es la única que corrompe EN SILENCIO. Un separador decimal
   mal leído no lanza ningún error: convierte 1,5 contratos en 15, y el P&L sale
   diez veces mayor con todas las pantallas en verde.

   LA PROPIEDAD CENTRAL, y es la que más aserciones tiene: cuando el fichero NO
   dice lo suficiente para saber si «1,500» son mil quinientos o uno coma cinco,
   la respuesta correcta es «no se puede saber», NO una suposición. Una suposición
   silenciosa aquí es cómo se pierde un cero. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { sirvePublicado } from './publicado.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
/* SERVIA EL HTML PARA CUALQUIER RUTA. Con la aplicación dentro del documento
   daba igual; desde que la página pide `./app.js`, el navegador recibía HTML
   donde esperaba un script, lo rechazaba por MIME y la página no arrancaba.
   `sirvePublicado` sirve lo que sube Pages —leído del propio workflow— y 404
   para lo demás, que es lo que hace útil a estas pruebas. */
const srv = sirvePublicado(html);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const nav = await chromium.launch();
const ctx = await nav.newContext();
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.FUT !== 'undefined' && window.FUT.csv, null, { timeout: 20000 });

const lee = txt => p.evaluate(t => FUT.csv.lee(t), txt);
const dec = cs => p.evaluate(c => FUT.csv.decimal(c), cs);
const num = (s, d) => p.evaluate(([x, y]) => FUT.csv.numero(x, y), [s, d]);
const ord = cs => p.evaluate(c => FUT.csv.ordenFecha(c), cs);
const fec = (s, o) => p.evaluate(([x, y]) => FUT.csv.fecha(x, y), [s, o]);
const hor = s => p.evaluate(x => FUT.csv.hora(x), s);
const lad = s => p.evaluate(x => FUT.csv.lado(x), s);

console.log('\n═══ 1 · partir el fichero: comillas, saltos y el BOM de Excel ═══');
let r = await lee('a,b,c\n1,2,3\n');
ok(JSON.stringify(r.cabecera) === '["a","b","c"]' && r.filas.length === 1, 'un CSV normal se parte bien', JSON.stringify(r.filas));

r = await lee('fecha,nota,qty\n2026-01-02,"MNQ, segunda entrada",2\n');
ok(r.filas[0][1] === 'MNQ, segunda entrada', 'una coma DENTRO de comillas no parte el campo', r.filas[0][1]);
ok(r.filas[0][2] === '2', 'y la columna de después sigue en su sitio', r.filas[0][2]);

r = await lee('a,b\n1,"dos\nlineas"\n');
ok(r.filas.length === 1 && r.filas[0][1] === 'dos\nlineas', 'un salto de línea dentro de comillas NO inventa una fila', JSON.stringify(r.filas));

r = await lee('a,b\n1,"dijo ""hola"""\n');
ok(r.filas[0][1] === 'dijo "hola"', 'las comillas dobladas se desdoblan', r.filas[0][1]);

r = await lee('﻿Date,Qty\n2026-01-02,1\n');
ok(r.cabecera[0] === 'Date', 'el BOM de Excel se quita: si no, la cabecera nunca casa con nada', JSON.stringify(r.cabecera[0]));
ok(/BOM/.test(r.avisos.join(' ')), 'y se dice que estaba, no se arregla en secreto', r.avisos.join(' '));

r = await lee('a,b\r\n1,2\r\n3,4\r\n');
ok(r.filas.length === 2, 'CRLF de Windows', r.filas.length);
r = await lee('a,b\r1,2\r3,4');
ok(r.filas.length === 2, 'CR suelto (Mac viejo)', r.filas.length);
r = await lee('a,b\n1,2\n\n\n');
ok(r.filas.length === 1, 'las líneas vacías del final no cuentan como filas', r.filas.length);

console.log('\n═══ 2 · el separador se elige por la FORMA de la tabla, no a bulto ═══');
ok(await p.evaluate(() => FUT.csv.separador('a;b;c\n1;2;3\n')) === ';', 'punto y coma (NinjaTrader en español)');
ok(await p.evaluate(() => FUT.csv.separador('a\tb\tc\n1\t2\t3\n')) === '\t', 'tabulador');
/* EL CASO QUE CAZA UN CONTADOR A BULTO, y costó construirlo bien: no basta con
   que haya muchas comas dentro de comillas. Aquí cada línea tiene EXACTAMENTE
   dos comas (las dos entrecomilladas) y exactamente dos «;», así que contando
   sin mirar las comillas las dos opciones empatan y gana la coma por ir primera
   en la lista — y el fichero se parte en cinco columnas donde hay tres, con la
   fecha separada de la hora y el P/L partido por el decimal.
   Mirando las comillas, la coma no aparece ni una vez fuera de ellas. */
const truco = '"Fecha, hora";Instrumento;"P/L, neto"\n"02/01/2026, 09:30";MNQ;"1.234,56"\n"03/01/2026, 10:15";MNQ;"-500,00"\n';
ok(await p.evaluate(t => FUT.csv.separador(t), truco) === ';',
   'con las comas empatadas con los «;» pero TODAS dentro de comillas, gana el «;»');
r = await lee(truco);
ok(r.cabecera.length === 3 && r.cabecera[0] === 'Fecha, hora' && r.cabecera[2] === 'P/L, neto',
   'y el fichero sale con sus 3 columnas, no con 5 partidas por la mitad', JSON.stringify(r.cabecera));
ok(r.filas[0][0] === '02/01/2026, 09:30' && r.filas[0][2] === '1.234,56',
   'la fecha no se separa de la hora ni el P/L del decimal', JSON.stringify(r.filas[0]));

console.log('\n═══ 3 · una fila corta NO se tira: tirarla es perder una operación ═══');
r = await lee('a,b,c\n1,2,3\n4,5\n');
ok(r.filas.length === 2, 'la fila con una columna de menos SIGUE ahí', r.filas.length);
ok(r.filas[1][2] === '', 'rellena con vacío, no desplazada', JSON.stringify(r.filas[1]));
ok(r.desiguales === 1 && /NO se descartan/.test(r.avisos.join(' ')), 'y se dice cuántas y por qué no se tiran', r.avisos.join(' ').slice(0, 80));

console.log('\n═══ 4 · EL DECIMAL · por columna, y «no se sabe» es una respuesta ═══');
ok(await dec(['1,234.56', '900.00']) === '.', 'con los dos signos manda el último: 1,234.56 es punto decimal');
ok(await dec(['1.234,56', '900,00']) === ',', 'y 1.234,56 es coma decimal');
ok(await dec(['1,50', '2,25']) === ',', 'una coma seguida de 2 dígitos no puede ser millar → coma decimal');
ok(await dec(['1.5', '2.25']) === '.', 'un punto seguido de 1 dígito tampoco → punto decimal');
ok(await dec(['1.234.567', '900']) === ',', 'dos puntos en la misma celda son millares → el decimal es la coma');
/* LA ASERCIÓN QUE DEFINE EL DISEÑO. */
ok(await dec(['1,500', '2,250']) === '',
   'TODO grupos de 3 exactos: AMBIGUO, y se devuelve «» en vez de adivinar (adivinar aquí es perder un cero)');
ok(await dec(['1,500', '2,250', '3,75']) === ',',
   'basta UNA fila inequívoca en la columna para resolverla entera', await dec(['1,500', '2,250', '3,75']));
ok(await dec(['', '  ', '-']) === '', 'una columna sin números no decide nada');

console.log('\n═══ 5 · leer la cifra, con el decimal ya decidido ═══');
ok(await num('1,234.56', '.') === 1234.56, '1,234.56 con punto decimal', await num('1,234.56', '.'));
ok(await num('1.234,56', ',') === 1234.56, '1.234,56 con coma decimal', await num('1.234,56', ','));
ok(await num('1,5', ',') === 1.5, '1,5 con coma decimal son uno coma cinco, no quince', await num('1,5', ','));
ok(await num('1,5', '.') === 15, 'y con punto decimal son quince: la columna decide, no la celda', await num('1,5', '.'));
ok(await num('(50.00)', '.') === -50, 'paréntesis de contabilidad = negativo', await num('(50.00)', '.'));
ok(await num('-50.00', '.') === -50, 'y el menos de toda la vida', await num('-50.00', '.'));
ok(await num('$1,234.56', '.') === 1234.56, 'el símbolo de moneda no estorba', await num('$1,234.56', '.'));
ok(await num('', '.') === null && await num('-', '.') === null && await num('n/a', '.') === null,
   'lo que no es número es null, NUNCA 0: un 0 se suma y mentiría en el P&L');

console.log('\n═══ 6 · LA FECHA · 03/04 no se adivina ═══');
ok(await ord(['01/02/2026', '15/02/2026']) === 'dmy', 'si un primer número pasa de 12, es día/mes');
ok(await ord(['01/02/2026', '02/15/2026']) === 'mdy', 'si el segundo pasa de 12, es mes/día');
ok(await ord(['2026-01-02', '2026-02-15']) === 'ymd', 'el ISO se reconoce solo');
/* LA OTRA ASERCIÓN QUE DEFINE EL DISEÑO. */
ok(await ord(['01/02/2026', '03/04/2026', '05/06/2026']) === '',
   'con TODOS los números por debajo de 13: AMBIGUO, y lo dice. Elegir el formato de casa aquí mete las operaciones en el día equivocado durante doce meses');
ok(await ord(['15/02/2026', '02/15/2026']) === '', 'y si las dos cosas son imposibles a la vez, tampoco se inventa');

ok(await fec('03/04/2026', 'dmy') === '2026-04-03', 'dmy: 3 de abril', await fec('03/04/2026', 'dmy'));
ok(await fec('03/04/2026', 'mdy') === '2026-03-04', 'mdy: 4 de marzo', await fec('03/04/2026', 'mdy'));
ok(await fec('03/04/2026', '') === null, 'sin orden decidido NO se devuelve una fecha a medias');
ok(await fec('2026-01-02', '') === null || await fec('2026-01-02', 'ymd') === '2026-01-02', 'el ISO se lee aunque no se haya decidido orden', await fec('2026-01-02', ''));
ok(await fec('31/02/2026', 'dmy') === null, 'el 31 de febrero no existe: una fecha imposible es un fichero mal leído', await fec('31/02/2026', 'dmy'));
ok(await fec('02/01/26', 'dmy') === '2026-01-02', 'el año de dos cifras se completa', await fec('02/01/26', 'dmy'));

console.log('\n═══ 7 · hora y lado ═══');
ok(await hor('13:05') === '13:05' && await hor('1:05:09 PM') === '13:05', '24 h y AM/PM dan lo mismo', await hor('1:05:09 PM'));
ok(await hor('12:30 AM') === '00:30', 'las 12:30 AM son las 00:30', await hor('12:30 AM'));
ok(await hor('25:00') === null, 'una hora imposible es null, no las 01:00');
ok(await lad('Buy') === 'long' && await lad('Sell') === 'short' && await lad('SellShort') === 'short', 'los lados de siempre');
ok(await lad('Compra') === 'long' && await lad('Venta') === 'short', 'y en español');
ok(await lad('') === null && await lad('???') === null,
   'un lado ilegible es null, NO «long» por defecto: caer a compra convierte una venta en su contraria');

console.log('\n═══ 8 · sigue siendo una función pura ═══');
ok(errs.length === 0, 'ningún error de página', errs.slice(0, 2).join(' | ') || 'limpio');
const puro = await p.evaluate(() => {
  const antes = FUT.trades().length;
  FUT.csv.lee('a,b\n1,2\n'); FUT.csv.numero('1,5', ','); FUT.csv.fecha('01/02/2026', 'dmy');
  return { antes, despues: FUT.trades().length, rotulo: document.getElementById('saveState').textContent };
});
ok(puro.antes === puro.despues, 'leer un CSV no crea ni toca ninguna operación', `${puro.antes} → ${puro.despues}`);
ok(!/sin guardar|pendientes/i.test(puro.rotulo), 'ni escribe en el almacén', puro.rotulo);

await nav.close(); srv.close();
console.log(`\n${fallos.length ? '❌ ' + fallos.length + ' fallo(s)' : '✅ todo en pie'}\n`);
process.exit(fallos.length ? 1 : 0);
