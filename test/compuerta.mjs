/* COMPUERTA DE RELEASE · una tabla, tres estados, cero invenciones.
   ─────────────────────────────────────────────────────────────────────────────
   La cadena que hay que poder afirmar de punta a punta:

     FUENTE → MOTOR → BUNDLE → INDEX.HTML → GITHUB PAGES

   Esto NO es una suite nueva: es un agregador. Cada fila se apoya en algo que ya
   se ejecuta (la suite, el empaquetador, capa2) o en una lectura del disco. No
   reimplementa ninguna comprobación, porque dos implementaciones de la misma
   comprobación es el mismo defecto que este repositorio persigue en los números.

   TRES ESTADOS, Y LA REGLA QUE LOS SEPARA:

     PASS      se ejecutó y se comprobó. Lleva su evidencia escrita al lado.
     FAIL      la comprobación corrió y salió mal.
     UNKNOWN   la plataforma NO PERMITE comprobarlo desde aquí.

   UNKNOWN nunca se convierte en PASS. No es un hueco que falte por rellenar: es
   una frontera. La base real de Supabase no es alcanzable desde esta suite —CI
   no tiene credenciales del proyecto— así que fingir un PASS ahí sería
   exactamente falsificar una verificación de producción.

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
/* QUÉ falló, no sólo QUE falló. `correr.mjs` ya imprime las líneas rojas de cada
   suite —o la cola de su salida si el proceso murió sin llegar a afirmar nada—,
   pero la compuerta capturaba su salida y sólo buscaba la línea de resumen, así
   que ese detalle no llegaba a ningún sitio.

   Qué falló: una suite se cayó en CI, pasó en local, y el log del run decía
   «suite: ❌ equivalencia 2800 ms» y NADA más. Sin una línea del error no se
   puede ni empezar a diagnosticar, y el protocolo 6 —leer el log antes de
   teorizar— se queda sin log que leer. */
const detalleDe = nombre => {
  const ls = suite.out.split('\n');
  const i = ls.findIndex(l => new RegExp('^  \u274c ' + nombre + '\\s').test(l));
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < ls.length && /^ {7}\S?/.test(ls[k]) && !/^  [\u2705\u274c] /.test(ls[k]); k++) out.push(ls[k]);
  return out;
};
const suitesRojas = () => [...new Set((suite.out.match(/^  \u274c (\S+)/gm) || []).map(l => l.trim().split(/\s+/)[1]))];

const verde = nombre => {
  const l = lineaDe(nombre);
  if (!l) return { ok: false, porque: `no aparece «${nombre}» en la salida de la suite` };
  return { ok: l.includes('✅'), porque: l.trim().replace(/\s+/g, ' ') };
};
/* DOS FILAS NO PUEDEN CITAR LA MISMA SUITE, y esto lo vigila porque la
   compuerta se pasó una corrida entera diciendo 0 FAIL con una de sus filas
   apuntando a otra cosa: se escribió un `test/importar.mjs` nuevo encima del
   que ya existía, y la fila de «la frontera de importacion» se quedó
   describiendo una suite que no era la suya. Ninguna fila se puso roja, porque
   las dos encontraban su línea verde en la salida. Una compuerta que no se
   entera de eso no es una compuerta: es una tabla bonita. */
const citadas = new Set();
const dice = (nombre, etiqueta, que, capa) => {
  if (citadas.has(nombre)) {
    fila(capa, que, 'FAIL', `dos filas citan la suite «${nombre}»: una de las dos está describiendo algo que no vigila. Renombra el fichero de pruebas o arregla la fila.`);
    return false;
  }
  citadas.add(nombre);
  const v = verde(nombre);
  fila(capa, que, v.ok ? 'PASS' : 'FAIL', `${etiqueta}: ${v.porque}`);
  return v.ok;
};

/* ── FUENTE → MOTOR ── */
dice('motor-quant', 'suite', 'Pruebas del Quant Engine en verde', 'fuente \u2192 motor');

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
   No es «parece bien»: son invariantes que, si se rompen, la página publicada
   deja de funcionar. Cada una con su número medido al lado. */
{
  /* LA INTEGRIDAD SE PARTIO EN DOS EL DIA QUE EL SCRIPT SALIO DEL DOCUMENTO,
     y hay que decir por que no basta con mirar uno de los dos ficheros: el
     documento sin app.js es un cascaron que pinta la cabecera, y app.js sin el
     documento no tiene donde pintarse. Los invariantes de cada uno son
     distintos y se comprueban por separado — y el ENLACE entre ambos, que el
     HTML pida exactamente ese script, es el primero de todos. */
  const h = leer('index.html');
  const a = leer('app.js');
  if (h === null || a === null) fila('index.html', 'Integridad estructural', 'FAIL',
    h === null ? 'no se pudo leer index.html' : 'no se pudo leer app.js');
  else {
    const n = (re, t) => ((t === undefined ? h : t).match(re) || []).length;
    const estilos = n(/^<style(?:\s+[^>]*)?>$/gm);
    const sistema = n(/^<style id="cabina-unified-estudio-system">$/gm);
    const enlaza = n(/^<script src="\.\/app\.js"><\/script>$/gm);
    const inline = n(/^<script>$/gm);
    const cierra = /<\/script>\s*(?:<style id="cabina-unified-estudio-system">[\s\S]*?<\/style>\s*)?<\/body>\s*<\/html>\s*$/.test(h);
    const motor = n(/^  const QE = \(function \(\) \{$/gm, a);
    const expone = n(/^  window\.QuantEngine = QE;$/gm, a);
    const fachadas = ['window.FUT = FUT;', 'window.INV = INV;', 'window.TES = TES;'].filter(x => a.includes(x)).length;
    const mal = [];
    if (estilos !== 5) mal.push(`${estilos} <style> (esperados 5)`);
    if (sistema !== 1) mal.push(`${sistema} capas cabina-unified-estudio-system (esperada 1)`);
    if (enlaza !== 1) mal.push(`${enlaza} enlaces a ./app.js (esperado 1)`);
    /* Un <script> inline de vuelta en el documento no es un detalle de estilo:
       obligaria a devolver 'unsafe-inline' a la CSP, y entonces la politica
       dejaria otra vez de impedir que corra codigo inyectado. */
    if (inline !== 0) mal.push(`${inline} <script> inline (esperados 0: volverían a exigir 'unsafe-inline')`);
    if (!cierra) mal.push('no cierra con </script></body></html>');
    if (motor !== 1) mal.push(`${motor} aperturas del IIFE del motor en app.js (esperada 1)`);
    if (expone !== 1) mal.push(`${expone} asignaciones de window.QuantEngine en app.js (esperada 1)`);
    if (fachadas !== 3) mal.push(`${fachadas}/3 fachadas expuestas en app.js`);
    fila('index.html', 'Integridad estructural', mal.length ? 'FAIL' : 'PASS',
      mal.length ? mal.join(' · ')
        : `index.html ${h.split('\n').length} líneas · 5 <style> · 0 inline · 1 <script src> → app.js ${a.split('\n').length} líneas · IIFE del motor · window.QuantEngine · 3 fachadas`);
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

/* ── PERSISTENCIA ── */
{
  /* El almacén de este navegador lo cubren tres pruebas distintas; se exige que
     las tres estén verdes, no una. La cuenta la cubre `cuentas`, más abajo. */
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
{
  /* La cuarta forma de mentir no es calcular mal: es RELLENAR. El formulario de
     operacion nueva hereda ahora cuatro campos de tu ultima operacion en vez de
     traer constantes, y eso ahorra teclear exactamente hasta el dia en que hereda
     algo que no querias y lo guardas sin mirar. Lo que impide que eso pase son dos
     propiedades, y esta fila es lo que las vigila: que la DIRECCION y la CALIDAD
     NO se hereden —una decide el signo de todo lo derivado y la otra es un juicio,
     y ninguna de las dos se nota equivocada mirando la ficha—, y que lo que si se
     hereda quede DICHO en pantalla campo por campo. Un valor heredado y anunciado
     es un atajo; el mismo valor sin anunciar es un dato inventado con tu nombre. */
  dice('heredado', 'suite', 'El formulario hereda lo que se repite, no lo que se juzga, y lo dice', 'divergencia');
  dice('orden', 'suite', 'El registro rápido conserva la cuenta elegida en cada operación', 'divergencia');
}
{
  /* Las propiedades de seguridad de la fase 0. Ninguna es visible en pantalla, que
     es justo por lo que necesitan un guardian: un cambio que las rompa no se nota
     hasta que alguien lo aprovecha. La mas concreta: sin el filtro de esquemas de
     `imgSrc`, importar un respaldo ajeno hace que el navegador PIDA la url que diga
     ese fichero. Comprobado con sabotaje: pidio `blob:` y `file:` de verdad. */
  dice('seguridad', 'suite', 'Las propiedades de seguridad de la fase 0 siguen en pie', 'index.html');
  /* La UNICA superficie que acepta datos escritos por otra persona. Vigila las dos
     direcciones: que no entre basura Y que no se pierda nada legitimo -- una
     validacion que tira registros pasaria la mitad de las aserciones y seria peor
     que no tenerla. */
  dice('importar', 'suite', 'La frontera de importacion valida sin perder datos', 'persistencia');
  /* La otra mitad de la misma idea: no basta con guardar bien, hay que DECIR
     cuando no se pudo. Antes un guardado fallido se contaba con un destello de
     2,5 s en un elemento oculto en 5 de las 6 pestanas, y el rotulo de la barra
     seguia diciendo «sincronizado». */
  dice('guardado', 'suite', 'Un cambio que no se guardo no parece guardado', 'persistencia');
  /* Una cabina que no se puede leer en el telefono no esta entregada. `diseno.mjs`
     mide UNA pestana a 1600px; esto mide las seis, y en 430px. */
  /* SIN NÚMERO EN EL RÓTULO. Esta fila decía «las siete pestañas» y medía OCHO
     —test/vista.mjs lo documentaba como etiqueta caducada—, luego dijo nueve, y
     con el historial serían diez. Un rótulo con una cuenta dentro caduca cada
     vez que la app crece, y una fila de la compuerta que se describe mal es
     peor que no tenerla: da una impresión de cobertura que no se ha
     comprobado. La lista de verdad vive en test/vista.mjs, que SÍ lleva el
     número porque ahí el número es la aserción. */
  dice('vista', 'suite', 'Ninguna pestana se sale de la pantalla', 'index.html');
  /* Las cuatro categorias de error: la 4 se gana con esperanza positiva en limpio,
     los errores no entran en esa esperanza, y abrir una operacion vieja no la
     castiga. Ver docs/ERRORES.md. */
  dice('errores', 'suite', 'Las perdidas se clasifican sin absolver por defecto', 'index.html');
  /* La misma idea una escala mas arriba: una CUENTA quemada. El por que no se
     pregunta -- se deriva de sus operaciones con el mismo clasificador -- el
     patron se cuenta en cuentas y no en veces, un coste que no se apunto no es
     cero, y la fecha de quema ausente sigue ausente despues de abrir el editor.
     Ver docs/ERRORES.md y docs/DATA_MODEL.md. */
  dice('ciclo', 'suite', 'Una cuenta quemada dice de que murio, y no se absuelve', 'index.html');
  /* Un desconocido arranca vacio y nadie pierde lo suyo: la configuracion guardada
     no se toca, lo antiguo se recupera sin escribir, y no se guarda configuracion
     en la cuenta antes de que la base conteste. */
  dice('primer', 'suite', 'Un desconocido arranca vacio y nadie pierde lo suyo', 'persistencia');
  /* Las cuentas. cuentas.mjs prueba LA APP contra un doble: que pide lo suyo, que
     no mezcla a dos personas en el mismo navegador y que sin cuenta no sale nada.
     Lo que separa de verdad a dos usuarios es la RLS de la base, y eso sólo se
     demuestra contra el proyecto real: CI no tiene con qué, así que esa fila es
     UNKNOWN y nunca PASS. */
  dice('cuentas', 'suite', 'Con cuenta: cada uno lo suyo, y el navegador no guarda lo ajeno', 'persistencia');
  /* DOS DISPOSITIVOS. `conflicto.mjs` conduce la app contra el doble: A escribe, B
     intenta escribir con la versión vieja, y lo que se exige es que la base
     CONSERVE lo de A y que B vea CONFLICTO — no que aparezca la palabra. Contra el
     upsert sin condición de la fase 1 se pone roja. */
  dice('conflicto', 'suite', 'Dos dispositivos: el que llega tarde no pisa, y se entera', 'persistencia');
  /* LA COLA DURABLE. `cola.mjs` apaga la red, escribe, CIERRA LA PESTANA, la vuelve
     a abrir y devuelve la red: lo que se exige es que la operacion llegue a la base.
     Contra el codigo anterior -- `sinGuardar` era un Map en memoria -- se pone roja.
     Y la segunda mitad es la que impide el atajo: mientras el cambio estaba en cola,
     OTRO dispositivo escribio ese documento; al drenar tiene que salir CONFLICTO y
     lo del otro tiene que seguir en la base. Una cola que drenara con upsert pasa la
     primera y falla esta. Los dos sabotajes se corrieron el 11/10/2026 y las dos se
     pusieron rojas por la asercion correcta. */
  dice('cola', 'suite', 'Sin red, cerrar la pestana ya no pierde el cambio', 'persistencia');
  /* LEER UN CSV, la capa de abajo del importador y la unica que corrompe EN
     SILENCIO: un decimal mal leido convierte 1,5 contratos en 15 sin un solo error
     en pantalla. Lo que `csv.mjs` exige no es que acierte siempre, es que cuando el
     fichero NO dice lo suficiente conteste «no se puede saber» en vez de adivinar.
     Cinco sabotajes corridos el 12/10/2026, los cinco rojos por su asercion.
     NO es el importador: la fase 0 de docs/IMPORTAR.md bloquea la detección automática
     y la comparación contra un bróker real; el mapeador manual y el motor FIFO tienen
     suites propias. */
  dice('csv', 'suite', 'Leer un CSV no adivina lo que el fichero no dice', 'persistencia');
  /* EL ESQUEMA Y LAS POLÍTICAS, EN UN POSTGRES DE VERDAD. Esto es nuevo y conviene
     decir exactamente qué añade y qué no. `db.mjs` arranca un Postgres local, aplica
     LAS MIGRACIONES DEL REPOSITORIO tal cual sobre un arnés con lo mínimo de `auth`
     y `storage`, y corre las pruebas SQL: concurrencia, aislamiento y capturas.
     Demuestra el DDL, el trigger de la versión, el UPDATE condicional y la RLS entre
     dos usuarios — todo eso es Postgres, y aquí es el mismo Postgres.
     NO demuestra el proyecto real, y por eso la fila de abajo sigue siendo UNKNOWN.
     Si la máquina no tiene servidor, `db.mjs` SALTA y sale 0: una máquina sin
     Postgres no produce un verde falso. */
  dice('db', 'suite', 'El esquema y las políticas, en un Postgres real local', 'base de datos');
  fila('persistencia', 'La base real aísla a los usuarios (RLS)', 'UNKNOWN',
    'supabase/pruebas/aislamiento.sql y concurrencia.sql corren contra el proyecto real, no desde CI: la política de red deniega supabase.co (403 al CONNECT, medido con curl). test/db.mjs las corre contra un Postgres LOCAL, que no es el proyecto: no demuestra que el proyecto tenga las migraciones aplicadas, ni que el auth.uid() de GoTrue se comporte como el sustituto, ni que PostgREST devuelva [] con 0 filas. CORRIDA A MANO contra el proyecto real el 11/10/2026: aislamiento.sql dio las 8 cifras esperadas (B_lee_de_A=0, B_modifica_de_A=0, B_borra_de_A=0, B_escribe_como_A_bloqueado=true, anonimo_bloqueado=true, A_intacto=1) y la transaccion no dejo nada: 0 usuarios de prueba, 0 filas de basura, RLS activa con 4 politicas. Esa corrida NO la puede repetir CI, asi que esta fila sigue en UNKNOWN: lo medido a mano no convierte en PASS lo que la maquina no puede volver a comprobar. Veredicto completo y su sabotaje en docs/MULTIUSUARIO.md');
  /* Métricas / Edge: cada fórmula contra una cuenta hecha a mano, netas de
     comisión, y sin que una operación de inversión entre en ninguna. */
  dice('edge', 'suite', 'Las métricas de edge dan lo que da la cuenta a mano', 'index.html');
  dice('lanzamiento', 'suite', 'Aviso legal, privacidad y metadatos de producto a la vista', 'index.html');
  /* El inglés se aplica sobre el DOM ya pintado, así que su modo de fallar no es
     «falta una traducción» —eso se ve— sino traducir un dato del usuario o
     inventarle una preferencia que no eligió. La fila existe porque una suite
     nueva no entra en ninguna por el hecho de existir, y sin ella la compuerta
     podría abrirse con el idioma en rojo. */
  dice('idioma', 'suite', 'El inglés no toca los datos ni inventa la preferencia', 'index.html');
  /* ESTAS DOS SUITES CORRÍAN SIN QUE NINGUNA FILA LAS MIRARA. El corredor
     ejecuta las 49 y sale distinto de cero con cualquiera roja, así que CI las
     cubría; la compuerta, no: sus filas citan suites una por una, y una suite
     nueva no entra en ninguna por el hecho de existir. Es decir, la compuerta
     podía abrirse con `conexiones` o `retro` en rojo.

     Y el modo de fallo es el peor de los dos posibles: no es que la fila diga
     verde cuando la suite está roja —`verde()` pone FAIL si la línea de la
     suite no aparece en la salida— es que no había fila ninguna, y lo que no
     tiene fila no se cuenta. Se añaden las dos. */
  dice('conexiones', 'suite', 'Todo lector se repinta cuando su dato cambia', 'index.html');
  dice('retro', 'suite', 'Lo que la app dice de sí misma no miente', 'index.html');
  dice('historial', 'suite', 'El historial sigue al journal sin pisar lo escrito a mano', 'index.html');
  dice('revisiones', 'suite', 'Lo que falta revisar se enseña, no se recuerda', 'index.html');
  dice('vista-personalizable', 'suite', 'La densidad y los módulos visibles se personalizan por pestaña', 'index.html');
  dice('estudio-investigacion', 'suite', 'Estudio conserva metadatos de fuentes, vínculos y backlinks', 'persistencia');
  dice('diseno-sistema', 'suite', 'La ergonomía sigue escrita y la paleta descartada no vuelve', 'index.html');
  /* EL MAPEADOR MANUAL, fase 1 de docs/IMPORTAR.md. Vigila dos cosas distintas:
     que el mapeo lea lo que se le dice y pare donde no se puede saber, y que lo
     importado NO se juzgue como si hubiera tenido un plan — sin eso, cada fila
     de un CSV entra en la pestaña de errores como un fallo de ejecución que
     nadie cometió. Lo que esta fila NO certifica es el control de la fase 1:
     que las cifras cuadren con la plataforma del bróker al céntimo. Eso exige
     un `.csv` real y está abajo, entre las fronteras. */
  /* LA SUITE SE LLAMA `mapeador`, Y NO `importar`, POR UNA RAZÓN QUE COSTÓ UNA
     CORRIDA ENTERA DE LA COMPUERTA: `test/importar.mjs` ya existía —es la
     frontera por donde entra un respaldo escrito por otra persona, fila de la
     capa «persistencia», arriba— y escribir el mapeador encima con ese mismo
     nombre dejó a aquella fila vigilando esta suite. La compuerta siguió
     diciendo 0 FAIL con una de sus filas apuntando a otra cosa, que es
     exactamente lo que las filas existen para que no pase. Dos filas no pueden
     citar la misma suite, y el nombre de un fichero de pruebas es parte de la
     interfaz de la compuerta. */
  dice('mapeador', 'suite', 'Un CSV entra por donde se le dice, o no entra', 'index.html');
  dice('emparejado', 'suite', 'Las ejecuciones se emparejan FIFO sin perder cierres parciales ni cantidades abiertas', 'importación');
  /* LA COLA DE LO IMPORTADO INCOMPLETO, fase 5 de docs/IMPORTAR.md. El
     importador llena el diario de operaciones a las que les falta el stop
     —ningún bróker lo exporta—, y sin stop no hay R ni expectativa. Esta fila
     vigila que la cola cuente SÓLO lo importado (meter las manuales devolvería
     el envenenamiento de la pestaña de errores que la fase 1 cerró) y que se
     pueda VACIAR: una cola que nunca llega a cero se aprende a ignorar. Lo que
     esta fila NO certifica, igual que `mapeador`, es que las cifras importadas
     cuadren con el bróker: eso sigue abajo, entre las fronteras. */
  dice('cola-importadas', 'suite', 'Lo importado sin stop se cuenta, se completa y la cola se puede vaciar', 'index.html');
  /* LOS CINCO DIALECTOS DE FILTRO. La colección `trades` se filtra en cinco
     sitios con cinco vocabularios, y dos de ellos —Futuros y Métricas / Edge—
     leen las MISMAS operaciones de futuros con dos implementaciones distintas
     de «qué entra»: presets de rango contra desde/hasta. Ninguna fila de esta
     tabla los comparaba, así que un cambio que unificara los filtros podía
     mover qué operaciones alimentan la expectativa y el drawdown y pasar en
     verde. Esta fila existe para que esa unificación se haga con la puerta
     cerrada detrás, no delante. */
  dice('filtros', 'suite', 'El mismo filtro selecciona las mismas operaciones en Futuros y en Métricas', 'index.html');
  /* EL HISTORIAL UNIFICADO. Es la pantalla que más fácil se convierte en una
     tercera verdad: enseña dos familias que viven en colecciones distintas, con
     dos espacios de nombres de cuenta y dos juegos de campos. Lo que esta fila
     certifica no es que la tabla esté bien pintada, es que no calcula nada —
     cada subconjunto sale de `FUT.filtered()`, y con el tipo en «sólo futuros»
     elige exactamente lo que el journal. Se llama `unificado` y no `historial`
     porque esa suite ya existe y vigila otra cosa.

     Y desde que exporta, la fila certifica una segunda cosa con el mismo peso:
     que el fichero sale de las OPERACIONES y salen TODAS. La tabla recorta a
     250 filas; un export que copiara lo pintado daría 250 líneas de un
     historial de mil sin decir que faltan setecientas cincuenta. La suite
     siembra 260 a propósito para que la tabla recorte y el fichero no. */
  dice('unificado', 'suite', 'El historial enseña las dos familias sin inventar una tercera lista, y las exporta enteras', 'index.html');
  /* EL CATÁLOGO DE 160 ESTADÍSTICAS. El riesgo no es que una fila salga mal:
     es que salga PLAUSIBLE y distinta de la tarjeta que tiene quince
     centímetros más arriba, y que la pantalla enseñe dos profit factors sin
     que nadie lo note. Por eso lo que esta fila certifica no es la aritmética
     —de eso ya responde `edge`— sino que las dos superficies salen del mismo
     `mxCalc`, que las tres tasas de acierto siguen siendo tres, y que una
     cifra que no se puede medir se imprime con un guion y su razón en vez de
     con un cero creíble — y que ese guion SOBREVIVE al CSV, que es donde más
     barato sale convertirlo en un cero: en una hoja de cálculo ya no tiene la
     definición al lado para desmentirlo. */
  dice('estadisticas', 'suite', 'El catálogo de estadísticas no contradice a las métricas que tiene encima, ni al exportarse', 'index.html');
  /* LA INSTALACION Y EL CASCO SIN CONEXION. Esta fila vigila una cadena nueva,
     y por eso tiene fila propia: el dia que la pagina dejo de ser un fichero
     autosuficiente, `sw.js` y `pagina.yml` pasaron a declarar DOS listas de
     ficheros que tienen que decir lo mismo. Si divergen, la pagina se ve
     perfecta con red y abre rota sin ella — y nadie lo nota, porque nadie
     prueba a mano el modo avion. La suite tambien corta la red de verdad y
     recarga, y comprueba que la nube no entra en la cache: cachear una
     respuesta de Supabase seria servir el journal de una sesion a la
     siguiente. */
  dice('pwa', 'suite', 'La página se instala, abre sin conexión y la nube nunca se cachea', 'instalación');
}

/* ── LO QUE LA PLATAFORMA NO PERMITE COMPROBAR ───────────────────────────────
   Estas no son pruebas pendientes. Son fronteras. Están aquí para que la
   compuerta no pueda dar una impresión de cobertura total que no tiene. */
fila('pages', 'GitHub Pages sirve la página', 'UNKNOWN',
  'el despliegue ocurre DESPUÉS de esta compuerta (pagina.yml, cuando pruebas sale verde), y es ese flujo el que pide la URL publicada y comprueba que responde con la cabina');
/* LA INSTALACION DE VERDAD. `pwa.mjs` demuestra que el trabajador se registra,
   que el casco esta en la cache y que la pagina abre sin red EN CHROMIUM. No
   demuestra que iOS acepte el icono, ni que Android ofrezca instalar, ni que un
   telefono real conserve la cache entre sesiones: eso depende de cada sistema
   y no se puede medir desde aqui. Queda nombrado en vez de omitido. */
fila('pages', 'Un teléfono real instala la app y la conserva', 'UNKNOWN',
  'pwa.mjs mide Chromium de escritorio por HTTP local: registro, casco en caché y recarga sin red. El prompt de instalación de Android, el icono de iOS y la persistencia de la caché entre sesiones los decide el sistema operativo, no el payload');
fila('pages', 'El CDN de GitHub sirve el payload verificado', 'UNKNOWN',
  'humo.mjs verifica el MISMO payload en el MISMO protocolo, no el CDN de GitHub ni su configuración');
/* Y UNA FRONTERA QUE NO ES DE LA PLATAFORMA: es del dueño de la cuenta. Se pone
   aquí, y no se calla, porque `mapeador.mjs` en verde puede leerse como «el
   importador está comprobado» y no lo está del todo: lo que falta es
   exactamente lo que ninguna prueba sintética puede dar. */
fila('index.html', 'Las cifras importadas cuadran con la plataforma del bróker', 'UNKNOWN',
  'el control que docs/IMPORTAR.md pone a la fase 1 exige un .csv REAL en test/fixtures/ y la fase 0 sigue sin hacerse; los CSV de mapeador.mjs son sintéticos y prueban el mapeador, no la fidelidad al bróker');

/* ── LA TABLA ── */
const C = { PASS: '✅', FAIL: '❌', UNKNOWN: '—' };
const anchoQ = Math.max(...filas.map(f => f.que.length));
console.log('\n═══ COMPUERTA DE RELEASE · CABINA ═══\n');
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
  /* Y lo que de verdad hace falta para arreglarlo. */
  for (const n of suitesRojas()) {
    const d = detalleDe(n);
    console.log(`\n   ── lo que dijo «${n}» ──`);
    console.log(d.length ? d.join('\n') : '      (sin detalle: correr.mjs no imprimió nada bajo esa suite)');
  }
  process.exit(1);
}
console.log('\n✅ COMPUERTA ABIERTA para lo que se puede verificar desde el repositorio.');
console.log(`   Quedan ${unk} fronteras que la plataforma no permite comprobar desde aquí, y siguen siendo UNKNOWN a propósito.`);
process.exit(0);
