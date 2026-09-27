/* COMPUERTA DE RELEASE · una tabla, tres estados, cero invenciones.
   ─────────────────────────────────────────────────────────────────────────────
   La cadena que hay que poder afirmar de punta a punta:

     FUENTE → MOTOR → BUNDLE → INDEX.HTML → GITHUB PAGES → ARTEFACTO DE CLAUDE

   Esto NO es una suite nueva: es un agregador. Cada fila se apoya en algo que ya
   se ejecuta (la suite, el empaquetador, capa2) o en una lectura del disco. No
   reimplementa ninguna comprobación, porque dos implementaciones de la misma
   comprobación es el mismo defecto que este repositorio persigue en los números.

   TRES ESTADOS, Y LA REGLA QUE LOS SEPARA:

     PASS      se ejecutó y se comprobó. Lleva su evidencia escrita al lado.
     FAIL      la comprobación corrió y salió mal.
     UNKNOWN   la plataforma NO PERMITE comprobarlo desde aquí.

   UNKNOWN nunca se convierte en PASS. No es un hueco que falte por rellenar: es
   una frontera. Un artefacto de Claude no es alcanzable desde GitHub Actions —no
   hay URL que CI pueda leer ni credencial que pueda usar— así que fingir un PASS
   ahí sería exactamente falsificar una verificación de producción.

   LA PROPIEDAD QUE HACE QUE ESTO NO MIENTA: si la línea de evidencia que una fila
   necesita NO APARECE en la salida, la fila es FAIL, no PASS. Un cambio en el
   formato de salida de correr.mjs rompe la compuerta en rojo, no la deja pasar en
   silencio. Se comprobó con sabotaje en los dos sentidos.

   CÓMO FALLA: exit 1 si hay una sola fila en FAIL. Los UNKNOWN no afectan al
   código de salida —no son fallos— pero se imprimen siempre y se cuentan. */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const leer = p => { try { return readFileSync(join(raiz, p), 'utf8'); } catch (e) { return null; } };

const filas = [];
/* estado: 'PASS' | 'FAIL' | 'UNKNOWN'. `porque` es obligatorio: una fila sin
   evidencia escrita no es una fila, es una opinión. */
const fila = (capa, que, estado, porque) => filas.push({ capa, que, estado, porque });

/* ── 1. La suite completa, UNA vez ───────────────────────────────────────────
   Todas las filas que dependen de una prueba salen de ESTA ejecución. Correrla
   dos veces daría dos verdades posibles. */
const suite = await new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(aqui, 'correr.mjs')], { cwd: aqui, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out, ms: Date.now() - t0 }));
});

/* Busca la línea de un archivo de la suite. Si no está, devuelve null y quien
   pregunte tiene que poner FAIL: no hay evidencia. */
const lineaDe = nombre => {
  const re = new RegExp('^  [\\u2705\\u274c] ' + nombre + '\\s', 'm');
  const m = suite.out.split('\n').find(l => re.test(l));
  return m || null;
};
const verde = nombre => {
  const l = lineaDe(nombre);
  if (!l) return { ok: false, porque: `no aparece «${nombre}» en la salida de la suite` };
  return { ok: l.includes('✅'), porque: l.trim().replace(/\s+/g, ' ') };
};
const dice = (nombre, etiqueta, que, capa) => {
  const v = verde(nombre);
  fila(capa, que, v.ok ? 'PASS' : 'FAIL', `${etiqueta}: ${v.porque}`);
  return v.ok;
};

/* ── FUENTE → MOTOR ── */
dice('motor-quant', 'suite', 'Pruebas del Quant Engine en verde', 'fuente \u2192 motor');
dice('motor-math', 'suite', 'Pruebas de MathEngine (referencia) en verde', 'fuente \u2192 motor');

/* ── MOTOR → BUNDLE ── */
dice('motor-bundle', 'suite', 'La fuente del motor coincide con el bundle', 'motor \u2192 bundle');

/* ── BUNDLE → INDEX.HTML ── */
{
  const v = verde('capa2');
  const l = v.porque;
  fila('bundle \u2192 index.html', 'El bundle coincide con el motor incrustado en producción',
    v.ok ? 'PASS' : 'FAIL', `capa2 §15 dentro de: ${l}`);
}

/* ── INDEX.HTML · integridad estructural ─────────────────────────────────────
   No es «parece bien»: son invariantes que, si se rompen, el artefacto o Pages
   dejan de funcionar. Cada una con su número medido al lado. */
{
  const h = leer('index.html');
  if (h === null) fila('index.html', 'Integridad estructural', 'FAIL', 'no se pudo leer index.html');
  else {
    const n = (re) => (h.match(re) || []).length;
    const estilos = n(/^<style>$/gm);
    const scripts = n(/^<script>$/gm);
    const cierra = /<\/script>\s*\n*\s*<\/body>\s*\n*<\/html>\s*$/.test(h);
    const motor = n(/^  const QE = \(function \(\) \{$/gm);
    const expone = n(/^  window\.QuantEngine = QE;$/gm);
    const fachadas = ['window.FUT = FUT;', 'window.INV = INV;', 'window.TES = TES;'].filter(x => h.includes(x)).length;
    const mal = [];
    /* Dos <style>: el primero es el reset del envoltorio estático, el segundo es
       el sistema de diseño y el cuerpo real del artefacto empieza ahí. */
    if (estilos !== 2) mal.push(`${estilos} <style> (esperados 2)`);
    if (scripts !== 1) mal.push(`${scripts} <script> (esperado 1)`);
    if (!cierra) mal.push('no cierra con </script></body></html>');
    if (motor !== 1) mal.push(`${motor} aperturas del IIFE del motor (esperada 1)`);
    if (expone !== 1) mal.push(`${expone} asignaciones de window.QuantEngine (esperada 1)`);
    if (fachadas !== 3) mal.push(`${fachadas}/3 fachadas expuestas`);
    fila('index.html', 'Integridad estructural', mal.length ? 'FAIL' : 'PASS',
      mal.length ? mal.join(' · ')
        : `${h.split('\n').length} líneas · 2 <style> · 1 <script> · IIFE del motor · window.QuantEngine · 3 fachadas`);
  }
}

/* ── INDEX.HTML · comportamiento ── */
{
  /* Las 48 pruebas de test/ que no son del motor. El número sale de la propia
     salida, no de una constante escrita aquí. */
  const m = suite.out.match(/^(\d+)\/(\d+) en verde · (\d+) s$/m);
  const af = suite.out.match(/^(\d+) aserciones ejecutadas en (\d+) archivos/m);
  if (!m) fila('index.html', 'Pruebas de navegador en verde', 'FAIL',
    'la suite no imprimió su línea de resumen; formato cambiado o proceso muerto');
  else fila('index.html', 'Pruebas de navegador en verde',
    (suite.code === 0 && m[1] === m[2]) ? 'PASS' : 'FAIL',
    `${m[1]}/${m[2]} suites · ${m[3]} s · exit ${suite.code}` + (af ? ` · ${af[1]} aserciones en ${af[2]} archivos` : ' · SIN contador de aserciones'));
}

/* ── INDEX.HTML → GITHUB PAGES ── */
dice('humo', 'suite', 'Smoke test de producción: el payload de Pages sobre HTTP', 'index.html \u2192 pages');

/* ── PERSISTENCIA · las dos ramas ── */
dice('capsula', 'suite', 'Contrato de la rama db (el artefacto)', 'persistencia');
{
  /* La rama de localStorage la cubren tres pruebas distintas; se exige que las
     tres estén verdes, no una. */
  const tres = ['sync', 'borrar', 'servida'].map(x => ({ n: x, v: verde(x) }));
  const malas = tres.filter(x => !x.v.ok);
  fila('persistencia', 'Contrato de la rama localStorage (Pages y file://)',
    malas.length ? 'FAIL' : 'PASS',
    malas.length ? malas.map(x => `${x.n}: ${x.v.porque}`).join(' | ')
      : tres.map(x => x.v.porque.replace(/^✅ /, '')).join(' · '));
}

/* ── DIVERGENCIA DE FUENTE ── */
{
  const a = verde('motor-bundle'), b = verde('capa2');
  fila('divergencia', 'Sin divergencia accidental en la cadena del motor',
    (a.ok && b.ok) ? 'PASS' : 'FAIL',
    `motor-bundle (fuente==bundle) + capa2 §15 (bundle==incrustado): ${a.ok ? 'ok' : 'roto'} / ${b.ok ? 'ok' : 'roto'}`);
}
{
  /* La OTRA divergencia, la que de verdad puede morder: index.html reimplementa
     cinco calculos que el motor ya tiene. Hoy coinciden al centavo, y esta fila es
     lo que hace que se sepa el dia que dejen de coincidir -- en la corrida
     siguiente, no meses despues con un numero malo en pantalla. Mientras la
     duplicacion exista, esta fila es la unica que la vigila; cuando la fase 2 la
     consolide, pasa a vigilar que la consolidacion no cambio ningun numero. */
  dice('equivalencia', 'suite', 'La capa de riesgo de la UI da los mismos numeros que el motor', 'divergencia');
}
{
  /* La tercera forma de crear una segunda fuente de verdad no es copiar una
     formula: es abrir una segunda PUERTA DE ENTRADA. El registro rapido escribe
     operaciones con un P&L escrito a mano, y la unica razon por la que eso no
     duplica nada es que pasa por `pnl` -> tradeCalc -> QE.calcularTradeApp, igual
     que el editor completo. Sabotearlo para que escriba `pnlEff` directamente deja
     la operacion valiendo cero en todo lo derivado; esta fila es lo que lo vigila. */
  dice('rapido', 'suite', 'El registro rapido escribe en el modelo canonico, no en un segundo', 'divergencia');
}

/* ── ARTEFACTO · lo que SÍ se puede comprobar desde aquí ─────────────────────
   Se comprueba que esté ANOTADO y que la anotación tenga forma de versión real.
   Que COINCIDA con lo publicado es otra fila, y es UNKNOWN. */
{
  const doc = leer('ARTEFACTO.md');
  if (doc === null) fila('artefacto', 'Versión del artefacto anotada', 'FAIL', 'no hay ARTEFACTO.md');
  else {
    const v = doc.match(/Versi[oó]n viva \|\s*\*\*(\d+)\*\*\s*·\s*`([0-9]+-[0-9a-f]+)`/);
    fila('artefacto', 'Versión del artefacto anotada', v ? 'PASS' : 'FAIL',
      v ? `versión ${v[1]} · ${v[2]} en ARTEFACTO.md`
        : 'ARTEFACTO.md no anota una versión viva con el formato «**N** · `sello-hash`»');
    /* Las limitaciones tienen que estar DICHAS, no implícitas. */
    const limites = [
      [/fija el (?:\*\*)?CONTRATO(?:\*\*)?, no la plataforma/i, 'el doble fija el contrato, no la plataforma'],
      [/se queda en memoria/i, 'un fallo de escritura del db deja el dato en memoria'],
    ];
    const faltan = limites.filter(([re]) => !re.test(doc)).map(([, n]) => n);
    fila('artefacto', 'Limitaciones conocidas del artefacto documentadas',
      faltan.length ? 'FAIL' : 'PASS',
      faltan.length ? 'sin documentar: ' + faltan.join(' · ')
        : `${limites.length} limitaciones nombradas en ARTEFACTO.md`);
  }
}

/* ── LO QUE LA PLATAFORMA NO PERMITE COMPROBAR ───────────────────────────────
   Estas cuatro no son pruebas pendientes. Son fronteras. Están aquí para que la
   compuerta no pueda dar una impresión de cobertura total que no tiene. */
fila('artefacto', 'El artefacto publicado coincide con index.html', 'UNKNOWN',
  'el artefacto no es alcanzable desde GitHub Actions: sin URL que CI pueda leer ni credencial que pueda usar. Se comprueba leyendo las líneas publicadas desde una sesión de Claude (ver ARTEFACTO.md)');
fila('artefacto', 'El db real de claude.ai se comporta como el doble', 'UNKNOWN',
  'capsula.mjs fija el CONTRATO que la app espera, no la plataforma. Si claude.ai lo cambiara, sus 28 aserciones seguirían verdes y el artefacto estaría roto. Sólo lo detecta abrir el artefacto');
fila('pages', 'GitHub Pages sirve la página', 'UNKNOWN',
  'Pages exige un clic del dueño (Settings → Pages → Source: GitHub Actions) que el GITHUB_TOKEN de Actions no puede dar. Hasta entonces pagina.yml avisa y no despliega');
fila('pages', 'El CDN de GitHub sirve el payload verificado', 'UNKNOWN',
  'humo.mjs verifica el MISMO payload en el MISMO protocolo, no el CDN de GitHub ni su configuración');

/* ── LA TABLA ── */
const C = { PASS: '✅', FAIL: '❌', UNKNOWN: '—' };
const anchoQ = Math.max(...filas.map(f => f.que.length));
console.log('\n═══ COMPUERTA DE RELEASE · TURBOK2 ═══\n');
let capaAnt = null;
for (const f of filas) {
  if (f.capa !== capaAnt) { console.log(`  ${f.capa.toUpperCase()}`); capaAnt = f.capa; }
  console.log(`    ${C[f.estado]} ${f.estado.padEnd(7)} ${f.que.padEnd(anchoQ)}`);
  console.log(`      ${' '.repeat(7)} └ ${f.porque}`);
}
const pass = filas.filter(f => f.estado === 'PASS').length;
const fail = filas.filter(f => f.estado === 'FAIL').length;
const unk = filas.filter(f => f.estado === 'UNKNOWN').length;
console.log(`\n  ${pass} PASS · ${fail} FAIL · ${unk} UNKNOWN   (de ${filas.length} filas, ${Math.round(suite.ms / 1000)} s)`);
if (fail) {
  console.log('\n❌ COMPUERTA CERRADA. No se publica con una fila en FAIL.');
  filas.filter(f => f.estado === 'FAIL').forEach(f => console.log(`     ${f.que} — ${f.porque}`));
  process.exit(1);
}
console.log('\n✅ COMPUERTA ABIERTA para lo que se puede verificar desde el repositorio.');
console.log(`   Quedan ${unk} fronteras que la plataforma no permite comprobar desde aquí, y siguen siendo UNKNOWN a propósito.`);
process.exit(0);
