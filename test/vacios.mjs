/* UN GUIÓN NO ES UNA CIFRA Y NO DEBE PESAR COMO UNA.
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ AFIRMA ESTE ARCHIVO, Y POR QUÉ ASÍ.

   Lo que se midió antes de escribir una línea de CSS, con la cuenta recién
   abierta: 23 de los 27 tiles de la aplicación mostraban «—» —FUTUROS 13 de 13,
   INVERSIONES 8 de 10, CABINA 2 de 4— y los 23 se pintaban a peso 800, 26px y
   #E8ECF2. La misma tinta exacta que una cifra real. Con la semilla puesta
   seguían ocho: los ocho guiones de INVERSIONES competían de igual a igual con
   el «$556» de FUTUROS. Eso no es un vacío, es ruido con el volumen de la
   señal.

   La marca la pone el render leyendo lo que él mismo acaba de escribir, y la
   hoja de estilo decide cómo se ve. Por eso este archivo comprueba las dos
   mitades por separado: que la marca se ponga —y se QUITE— cuando corresponde,
   y que puesta signifique algo medible en la pantalla.

   POR QUÉ SE COMPRUEBAN TODOS LOS TILES Y NO UNA MUESTRA. El marcado va por un
   MutationObserver por contenedor, y la lista de contenedores se saca del DOM
   buscando `.tiles`. El modo de fallar de ese diseño no es «marca mal un tile»:
   es «un contenedor entero se queda sin observar y nadie lo nota». Un test que
   mire un tile de ejemplo no ve eso. §1 recalcula la marca esperada para CADA
   tile visible de las ocho pestañas, desde el texto, y la compara con la real.

   POR QUÉ `prop50` Y NO «este mes» PARA PROBAR QUE LA MARCA SE VA. Las dos
   vacían los tiles de FUTUROS, pero «este mes» depende de la fecha de hoy
   contra las fechas de la semilla: el día que la semilla caiga dentro del mes
   corriente el test deja de probar lo que cree. `prop50` es una cuenta de la
   semilla sin operaciones, y eso no cambia con el calendario.

   EL CRITERIO ES EL GLIFO, NO «ESTÁ VACÍO». Un tile con «0» posiciones tiene
   dato —cero es una respuesta— y se queda a peso completo. §2 lo fija, porque
   es la confusión en la que es fácil caer al reescribir esto.

   SABOTAJES CORRIDOS, al pie del archivo. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA, conCuentas, arrancada, quieto } from './espera.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const TABS = ['cabina', 'futuros', 'edge', 'invest', 'playbook', 'ideas', 'estudio', 'calc'];

/* La misma expresión que usa la aplicación, escrita aquí a mano a propósito: si
   alguien relaja la de index.html, este archivo NO la sigue y la diferencia
   sale como fallo. Importarla desde la página haría que el test diera por bueno
   cualquier criterio, que es justo lo que tiene que vigilar. */
const SOLO_GUIONES = /^[—\s/]*—[—\s/]*$/;

const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/`;

const nav = await chromium.launch();
const abrir = async (conSemilla) => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  if (conSemilla) {
    await p.goto(url);
    await p.evaluate(t => localStorage.setItem('cabina-mnq:v1', t), SEMILLA);
    await p.reload();
  } else {
    await conCuentas(p);
    await p.goto(url);
  }
  await arrancada(p);
  return { ctx, p };
};

/* Lee cada tile VISIBLE de la pestaña activa con su valor, su marca y el estilo
   computado de la cifra. Un tile dentro de un panel oculto no se mira: no está
   en pantalla y su estilo computado no dice nada de lo que ve nadie. */
const leerTiles = (p) => p.evaluate(() => [...document.querySelectorAll('.tile')]
  .filter(t => t.offsetParent || t.offsetHeight > 0)
  .map(t => {
    const v = t.querySelector('.v'), l = t.querySelector('.lab');
    const cv = v ? getComputedStyle(v) : null;
    return {
      lab: (l?.textContent || '').trim(),
      val: (v?.textContent || '').trim(),
      marcado: t.classList.contains('sin-dato'),
      peso: cv ? cv.fontWeight : null,
      color: cv ? cv.color : null,
      labColor: l ? getComputedStyle(l).color : null,
    };
  }));

const irA = async (p, tab) => {
  await p.evaluate(n => document.querySelector(`.tabbtn[data-tab="${n}"]`)?.click(), tab);
  await quieto(p, 60, 2500);
};

/* ═══ §1 · NINGÚN TILE SE QUEDA SIN CLASIFICAR, EN NINGUNA PESTAÑA ═══════════
   La marca esperada se recalcula aquí desde el texto, para cada tile visible de
   las ocho pestañas y en los dos estados de datos. Un contenedor sin observador
   aparece como una tanda de tiles con «—» sin marcar. */
console.log('\n§1 · la marca coincide con el texto en las ocho pestañas');
for (const [etiqueta, conSemilla] of [['cuenta nueva', false], ['con la semilla', true]]) {
  const { ctx, p } = await abrir(conSemilla);
  const mal = []; let vistos = 0, marcados = 0;
  for (const tab of TABS) {
    await irA(p, tab);
    for (const t of await leerTiles(p)) {
      vistos++;
      const esperado = SOLO_GUIONES.test(t.val);
      if (esperado) marcados++;
      if (esperado !== t.marcado) mal.push(`${tab}/${t.lab}: "${t.val}" marcado=${t.marcado}`);
    }
  }
  ok(vistos > 0, `${etiqueta}: hay tiles que mirar`, `${vistos} tiles`);
  ok(mal.length === 0, `${etiqueta}: la marca coincide con el texto en los ${vistos}`,
    mal.length ? mal.slice(0, 6).join(' · ') : `${marcados} sin dato`);
  await ctx.close();
}

/* ═══ §2 · EL CRITERIO ES EL GLIFO, NO «ESTÁ VACÍO» ═════════════════════════ */
console.log('\n§2 · cero es un dato; dos guiones son dos vacíos; uno y una cifra, no');
{
  const { ctx, p } = await abrir(false);
  await irA(p, 'invest');
  const tiles = await leerTiles(p);
  const cero = tiles.find(t => t.val === '0');
  ok(!!cero && !cero.marcado, 'un tile con «0» NO se marca', cero ? `${cero.lab} = "${cero.val}"` : 'no encontrado');

  await irA(p, 'futuros');
  const dobles = (await leerTiles(p)).filter(t => t.val.includes('/'));
  ok(dobles.length > 0 && dobles.every(t => t.marcado), 'un tile doble con los dos lados en «—» se marca',
    dobles.map(t => `"${t.val}"`).join(' '));

  /* CONTROL POSITIVO. Un doble con un lado real no debe marcarse. No existe en
     la semilla, así que se fabrica escribiendo en el DOM del propio contenedor
     observado: además de fijar el criterio, prueba que el observador también
     despierta con un cambio de texto y no sólo con un render completo. */
  const tras = await p.evaluate(() => {
    const t = [...document.querySelectorAll('#ftTiles .tile')].find(x => (x.querySelector('.v')?.textContent || '').includes('/'));
    if (!t) return null;
    t.querySelector('.v').textContent = '$556 / —';
    return new Promise(r => setTimeout(() => r({
      val: t.querySelector('.v').textContent, marcado: t.classList.contains('sin-dato'),
    }), 0));
  });
  ok(!!tras && !tras.marcado, 'un tile doble con un lado real NO se marca',
    tras ? `"${tras.val}" marcado=${tras.marcado}` : 'no encontrado');
  await ctx.close();
}

/* ═══ §3 · LA MARCA SE PONE Y SE QUITA CON EL DATO ══════════════════════════
   Por la vía real: el desplegable de cuenta de FUTUROS. `prop50` es una cuenta
   de la semilla sin operaciones. */
console.log('\n§3 · la marca llega con el vacío y se va con el dato');
{
  const { ctx, p } = await abrir(true);
  await irA(p, 'futuros');
  const cuenta = (sel) => p.evaluate(v => {
    const s = document.getElementById('ftAcct'); if (!s) return false;
    s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value === v;
  }, sel);
  const cuantos = () => p.evaluate(() => [...document.querySelectorAll('#ftTiles .tile')]
    .filter(t => t.classList.contains('sin-dato')).length);
  const total = await p.evaluate(() => document.querySelectorAll('#ftTiles .tile').length);

  const antes = await cuantos();
  ok(await cuenta('prop50'), 'se puede filtrar por una cuenta sin operaciones');
  await quieto(p, 80, 2500);
  const vacia = await cuantos();
  ok(await cuenta(''), 'se puede volver a todas las cuentas');
  await quieto(p, 80, 2500);
  const vuelta = await cuantos();

  ok(antes === 0, 'con datos, ningún tile de FUTUROS está marcado', `${antes} de ${total}`);
  ok(vacia === total && total > 0, 'con la cuenta vacía se marcan todos', `${vacia} de ${total}`);
  ok(vuelta === 0, 'al volver el dato la marca se retira', `${vuelta} de ${total}`);
  await ctx.close();
}

/* ═══ §4 · PUESTA, LA MARCA SIGNIFICA ALGO EN PANTALLA ══════════════════════
   El defecto original era de PESO Y COLOR, no de clases. Aquí se pregunta al
   navegador, no a la hoja de estilo. */
console.log('\n§4 · el guión ya no pesa como una cifra');
{
  const { ctx, p } = await abrir(false);
  const dim = await p.evaluate(() => {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim();
    const d = document.createElement('span'); d.style.color = c; document.body.appendChild(d);
    const r = getComputedStyle(d).color; d.remove(); return r;
  });
  /* Dos grupos, cada uno con lo suyo: el primer intento metía los pesos de uno
     y los colores del otro en los mismos conjuntos y la salida decía «1
     colores» sin aclarar de qué. Un test ilegíble no lo puede verificar nadie. */
  const marcado = { peso: new Set(), color: new Set() };
  const conDato = { peso: new Set(), color: new Set() };
  for (const tab of TABS) {
    await irA(p, tab);
    for (const t of await leerTiles(p)) {
      const g = t.marcado ? marcado : conDato;
      g.peso.add(t.peso); g.color.add(t.color);
    }
  }
  ok(marcado.peso.size === 1 && marcado.peso.has('400'),
    'el guión computa un solo peso, y es ligero', [...marcado.peso].join(' '));
  ok(marcado.color.size === 1 && marcado.color.has(dim),
    'el guión computa el tercer nivel del sistema, no un gris nuevo',
    `${[...marcado.color].join(' ')} vs --dim ${dim}`);
  ok(conDato.peso.size > 0 && !conDato.peso.has('400'),
    'una cifra real no comparte el peso del guión', [...conDato.peso].join(' '));
  ok(conDato.color.size > 0 && !conDato.color.has(dim),
    'una cifra real no comparte el color del guión', [...conDato.color].join(' '));
  await ctx.close();
}

/* ═══ §5 · NO SE TOCÓ EL TEXTO NI LA ETIQUETA ══════════════════════════════
   Bajar el peso visual no puede convertirse en esconder. El glifo sigue ahí
   —un lector de pantalla oye lo mismo que antes— y la etiqueta, que es lo que
   dice QUÉ falta, conserva su color. */
console.log('\n§5 · el texto sigue ahí y la etiqueta no se tocó');
{
  const { ctx, p } = await abrir(false);
  await irA(p, 'futuros');
  const tiles = await leerTiles(p);
  const vac = tiles.filter(t => t.marcado), con = tiles.filter(t => !t.marcado);
  ok(vac.length > 0 && vac.every(t => t.val.includes('—')), 'el guión sigue en el texto', `${vac.length} tiles`);
  ok(vac.length > 0 && vac.every(t => t.lab.length > 0), 'la etiqueta sigue diciendo qué falta',
    vac.slice(0, 3).map(t => t.lab).join(' · '));
  if (con.length) {
    const mismos = vac.every(t => t.labColor === con[0].labColor);
    ok(mismos, 'la etiqueta de un tile sin dato se ve igual que la de uno con dato', con[0].labColor);
  } else {
    await irA(p, 'invest');
    const iv = await leerTiles(p), ivCon = iv.find(t => !t.marcado), ivVac = iv.filter(t => t.marcado);
    ok(!!ivCon && ivVac.every(t => t.labColor === ivCon.labColor),
      'la etiqueta de un tile sin dato se ve igual que la de uno con dato', ivCon?.labColor);
  }
  await ctx.close();
}

await nav.close(); srv.close();
console.log(`\nfallos: ${fallos.length}`);
if (fallos.length) { for (const f of fallos) console.log(`  · ${f}`); process.exit(1); }

/* ═════════════════════════════════════════════════════════════════════════════
   SABOTAJES CORRIDOS CONTRA ESTE ARCHIVO

   Un test que no se ha visto fallar no es un test, es una decoración. Cada
   sabotaje se aplicó a index.html, se corrió esto, y se revirtió. Lo que sigue
   es la salida real, no la que yo esperaba: dos de las cinco predicciones que
   escribí antes de correrlos estaban mal, y eso también enseña algo.

   1. Quitar el `observe(...)` de `vigilarTilesSinDato`, dejando la pasada
      inicial. Yo esperaba que «§1 con la semilla» aguantara en las pestañas
      que no se repintan.
      → NO aguanta nada: 8 fallos, CERO tiles marcados en toda la aplicación.
        La pasada inicial corre antes del primer render, así que no ve un solo
        tile. El observador no es una optimización del marcado: ES el marcado.
        Conviene saberlo antes de «ahorrarse» el observador. exit 1.

   2. Relajar el criterio a `v.textContent.trim().length === 0`, el error
      intuitivo de confundir «sin dato» con «vacío».
      → los mismos 8 fallos que el 1: un guión no es una cadena vacía, así que
        este criterio no marca nada tampoco. exit 1.

   3. Marcar también el tile con «0». Esperaba que cayera sólo §2.
      → 4 fallos. §2 «un tile con «0» NO se marca», §1 en los dos estados
        (Sesiones registradas, Posiciones y Watchlist marcados de más), y §5
        por arrastre: con los «0» marcados, INVERSIONES se queda sin ningún
        tile con dato y la comparación de etiquetas no tiene contra qué
        medirse. Ese último es un fallo de premisa, no de estilo — queda
        anotado para que nadie lo persiga como si fuera otra cosa. exit 1.

   4. Dejar el CSS en `color:#9aa5b4` en vez de `var(--dim)`: un gris elegido a
      ojo, parecido pero fuera del sistema.
      → UN solo fallo, y es la línea que defiende el token: «el guión computa
        el tercer nivel del sistema, no un gris nuevo — rgb(154, 165, 180) vs
        --dim rgb(132, 142, 161)». exit 1.

   5. Dejar la clase puesta y borrar el bloque de CSS entero, más sus dos
      reglas del móvil. Es el sabotaje que prueba que §4 no es un adorno de §1.
      → §1, §2, §3 y §5 en VERDE — el marcado funciona perfectamente y no
        significa nada en pantalla— y §4 con 2 fallos: peso 800 y color
        rgb(232, 236, 242), o sea el guión otra vez con la tinta de una cifra.
        Sin §4 este archivo habría dado por bueno el defecto original. exit 1.

   Un sabotaje que pasa no prueba nada sobre el código: prueba que el sabotaje
   era inerte. Los cinco se verificaron rojos. */
