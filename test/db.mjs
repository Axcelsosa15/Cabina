/* LAS PRUEBAS DE LA BASE, CONTRA UN POSTGRES DE VERDAD.
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ PROBLEMA RESUELVE. `supabase/pruebas/*.sql` sólo se podían correr a mano
   contra el proyecto real, y desde una sesión de trabajo o desde CI el proyecto no
   es alcanzable —la política de red deniega `supabase.co`, 403 al CONNECT, medido
   con curl—. Eso dejaba la propiedad más importante de toda la cabina, que un
   documento no se pierda cuando dos dispositivos escriben, verificada únicamente
   por un doble escrito en JavaScript. Y un doble prueba el CONTRATO que la app
   espera; no prueba lo que Postgres hace. Si el doble y Postgres no están de
   acuerdo, el doble gana en la suite y pierde en producción.

   Esto arranca un Postgres LOCAL (el servidor está en la imagen: /usr/lib/postgresql),
   crea el mínimo del esquema `auth` y `storage` que Supabase aporta
   (supabase/pruebas/arnes-local.sql), aplica LAS MIGRACIONES DEL REPOSITORIO TAL
   CUAL —sin una línea distinta, porque editarlas para que corran aquí haría que
   esto dejara de probar lo que se publica— y corre las pruebas SQL.

   LOS DOS NIVELES, y no se confunden:

     NIVEL 1  esto. Postgres real, migraciones reales, políticas reales. Demuestra
              el DDL, el trigger, el UPDATE condicional por versión, la RLS entre
              dos usuarios y las constraints. Sale PASS o FAIL.
     NIVEL 2  el proyecto Supabase real. Demuestra que el proyecto TIENE esto
              aplicado, que el `auth.uid()` de GoTrue se comporta como el
              sustituto, y que PostgREST traduce un PATCH condicional a lo que la
              app espera. No es alcanzable desde aquí: sigue UNKNOWN en la
              compuerta, y lo corre el dueño.

   Si Postgres no está instalado, esto sale 0 y lo dice: en una máquina sin
   servidor no se puede, y fingir un PASS ahí sería lo mismo que fingir el Nivel 2.
   Correr: node test/db.mjs */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const salta = (t, por) => console.log(`  — SALTADA ${t}   ${por}`);

/* ── ¿hay servidor? ──────────────────────────────────────────────────────── */
const BIN = (() => {
  const env = process.env.PG_BINDIR;
  if (env && existsSync(join(env, 'initdb')) && existsSync(join(env, 'pg_ctl'))) return env;
  try {
    const d = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    if (d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl'))) return d;
  } catch (e) {}
  try {
    const d = dirname(execFileSync('bash', ['-lc', 'command -v initdb'], { encoding: 'utf8' }).trim());
    if (d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl'))) return d;
  } catch (e) {}
  return null;
})();
if (!BIN) {
  console.log('\n  — SALTADA  pruebas de base: no hay servidor Postgres en esta máquina');
  console.log('     (el cliente psql no basta: hace falta initdb y pg_ctl)');
  console.log('\n  fallos: 0');
  process.exit(0);
}

/* El servidor se niega a correr como root, así que el clúster vive bajo un usuario
   sin privilegios. Y no puede vivir en el scratchpad: sus directorios padre son
   700 de root y el usuario del servidor no puede atravesarlos. */
const PUERTO = 54333;
const SOCK = mkdtempSync(join(tmpdir(), 'cabina-pg-'));
const soyRoot = process.getuid && process.getuid() === 0;
let USUARIO = null;
const sh = (cmd, opts = {}) => spawnSync('bash', ['-lc', cmd], { encoding: 'utf8', ...opts });

if (soyRoot) {
  if (sh('id pgcabina').status !== 0) sh('useradd -m pgcabina');
  USUARIO = 'pgcabina';
  sh(`chmod 777 ${SOCK}`);
}
const comoUsuario = cmd => USUARIO
  ? sh(`su ${USUARIO} -c ${JSON.stringify(`PATH=${BIN}:$PATH; ${cmd}`)}`)
  : sh(`PATH=${BIN}:$PATH; ${cmd}`);

const DATOS = USUARIO ? '~/pg-cabina/data' : join(SOCK, 'data');
let arrancado = false;
function apaga() {
  if (arrancado) comoUsuario(`pg_ctl -D ${DATOS} stop -m immediate`);
  try { rmSync(SOCK, { recursive: true, force: true }); } catch (e) { }
  if (USUARIO) comoUsuario('rm -rf ~/pg-cabina');
}
process.on('exit', apaga);

console.log('\n═══ 0 · un Postgres de verdad, con las migraciones del repositorio ═══');
const ini = comoUsuario(`rm -rf ${DATOS} && mkdir -p ${DATOS}/.. && initdb -D ${DATOS} -U postgres --auth=trust`);
ok(ini.status === 0, 'clúster creado', ini.status === 0 ? null : (ini.stderr || '').trim().split('\n').slice(-2).join(' '));
if (ini.status !== 0) { console.log(`\n  fallos: ${fallos.length}`); process.exit(1); }

const arr = comoUsuario(`pg_ctl -D ${DATOS} -o "-k ${SOCK} -h '' -p ${PUERTO}" -l ${DATOS}/../log start -w`);
arrancado = arr.status === 0;
ok(arrancado, `servidor en marcha (puerto ${PUERTO})`, arrancado ? null : (arr.stdout || arr.stderr || '').trim().slice(-200));
if (!arrancado) { console.log(`\n  fallos: ${fallos.length}`); process.exit(1); }

const psql = (args, db) => spawnSync(join(BIN, 'psql'),
  ['-h', SOCK, '-p', String(PUERTO), '-U', 'postgres', ...(db ? ['-d', db] : []), ...args],
  { encoding: 'utf8' });
const version = psql(['-tAc', 'select version();']).stdout.trim().split(' ').slice(0, 2).join(' ');
ok(!!version, 'versión del servidor', version);

/* Cada prueba en su propia base, recién migrada: así una no puede contaminar a
   otra, que es justo lo que pasó probando esto a mano. */
function baseMigrada(nombre) {
  psql(['-q', '-c', `drop database if exists ${nombre};`]);
  const c = psql(['-q', '-c', `create database ${nombre};`]);
  if (c.status !== 0) return { err: (c.stderr || '').trim() };
  const pasos = [join(raiz, 'supabase', 'pruebas', 'arnes-local.sql')]
    .concat(readdirSync(join(raiz, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort()
      .map(f => join(raiz, 'supabase', 'migrations', f)));
  for (const f of pasos) {
    const r = psql(['-v', 'ON_ERROR_STOP=1', '-q', '-f', f], nombre);
    if (r.status !== 0) return { err: `${f.split('/').pop()}: ${(r.stderr || '').trim().split('\n')[0]}` };
  }
  return { db: nombre };
}

console.log('\n═══ 1 · las migraciones del repositorio aplican en Postgres limpio ═══');
const base = baseMigrada('cabina_t1');
ok(!base.err, `las ${readdirSync(join(raiz, 'supabase', 'migrations')).length} migraciones aplican sin error`, base.err || 'desde cero');
if (base.err) { console.log(`\n  fallos: ${fallos.length}`); process.exit(1); }

/* LA ÚLTIMA migración se aplica dos veces: el dueño las aplica A MANO contra el
   proyecto, y una que falla a la mitad y no se puede reintentar lo deja sin saber
   si la primera pasada llegó al final.

   SÓLO la última, y esto se corrigió después de escribirlo al revés. Exigirlo de
   TODAS pone en rojo `20260930063500`, cuyo `create table` falla la segunda vez —
   que es lo correcto: esa migración ya está aplicada al proyecto real y editarla
   sería reescribir historia que la base ya ejecutó. La regla no es «toda migración
   es reaplicable», es «la que estoy pidiendo que apliques hoy lo es». */
const migs = readdirSync(join(raiz, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort();
const ultima = migs[migs.length - 1];
const re = psql(['-v', 'ON_ERROR_STOP=1', '-q', '-f', join(raiz, 'supabase', 'migrations', ultima)], base.db);
ok(re.status === 0, `y la última (${ultima.slice(0, 24)}…) es idempotente: aplicarla dos veces no falla`,
   re.status === 0 ? 'segundo pase limpio' : (re.stderr || '').trim().split('\n')[0]);

console.log('\n═══ 2 · el esquema que la app espera ═══');
const col = (t, c) => psql(['-tAc',
  `select data_type from information_schema.columns where table_name='${t}' and column_name='${c}';`], base.db).stdout.trim();
ok(col('cabina_docs', 'version') === 'integer', 'cabina_docs.version existe y es integer', col('cabina_docs', 'version'));
ok(col('cabina_docs', 'updated_at').startsWith('timestamp'), 'cabina_docs.updated_at sigue ahí', col('cabina_docs', 'updated_at'));
const rls = psql(['-tAc', `select relrowsecurity::text||'/'||relforcerowsecurity::text from pg_class where relname='cabina_docs';`], base.db).stdout.trim();
ok(rls === 'true/true', 'RLS activada Y forzada (también para el dueño de la tabla)', rls);
const pol = psql(['-tAc', `select count(*) from pg_policies where tablename='cabina_docs';`], base.db).stdout.trim();
ok(Number(pol) === 4, 'las cuatro políticas (leer, crear, cambiar, borrar)', pol);
const anonGrant = psql(['-tAc',
  `select count(*) from information_schema.role_table_grants where table_name='cabina_docs' and grantee='anon';`], base.db).stdout.trim();
ok(Number(anonGrant) === 0, 'el rol anónimo no tiene NINGÚN permiso sobre la tabla', `${anonGrant} permisos`);

/* ── las pruebas SQL del repositorio ─────────────────────────────────────── */
/* El veredicto viaja en el mensaje de un error a propósito: así la transacción se
   deshace y no queda nada. Se lee de stderr. */
function corre(archivo, db) {
  const r = psql(['-f', join(raiz, 'supabase', 'pruebas', archivo)], db);
  const m = ((r.stderr || '') + (r.stdout || '')).match(/RESULTADO ([^\n]*)/);
  return m ? m[1].trim() : null;
}
/* Lo esperado se escribe AQUÍ, no se lee de la salida: una prueba que compara la
   salida consigo misma pasa siempre. */
const ESPERADO = {
  'concurrencia.sql': 'v_inicial=1 A_escribe=1 v_tras_A=2 B_con_version_vieja=0 B_no_piso_a_A=true A_con_version_nueva=1 v_tras_A2=3 cliente_no_decide_version=true borrado_viejo=0 borrado_bueno=1 update_despues_de_delete=0 delete_despues_de_update=0 aislamiento_sigue=0',
  'aislamiento.sql': 'A_ve_lo_suyo=2 B_lee_de_A=0 B_modifica_de_A=0 B_borra_de_A=0 B_escribe_como_A_bloqueado=true B_ve_solo_lo_suyo=1 anonimo_bloqueado=true A_intacto=1',
  'capturas.sql': null,   // se compara abajo, tiene su propio formato
};

console.log('\n═══ 3 · CONCURRENCIA: un documento no se pierde cuando dos dispositivos escriben ═══');
{
  const b = baseMigrada('cabina_conc');
  const got = b.err ? null : corre('concurrencia.sql', b.db);
  ok(got === ESPERADO['concurrencia.sql'], 'concurrencia.sql da exactamente lo esperado',
     got === ESPERADO['concurrencia.sql'] ? 'las trece cifras' : (got || b.err || 'sin RESULTADO'));
  if (got && got !== ESPERADO['concurrencia.sql']) {
    const e = ESPERADO['concurrencia.sql'].split(' '), g = got.split(' ');
    e.forEach((x, i) => { if (g[i] !== x) console.log(`       esperado ${x}  obtenido ${g[i]}`); });
  }
}

console.log('\n═══ 4 · AISLAMIENTO: la base separa a dos usuarios ═══');
{
  const b = baseMigrada('cabina_aisl');
  const got = b.err ? null : corre('aislamiento.sql', b.db);
  ok(got === ESPERADO['aislamiento.sql'], 'aislamiento.sql da exactamente lo esperado',
     got === ESPERADO['aislamiento.sql'] ? 'las ocho cifras' : (got || b.err || 'sin RESULTADO'));
}

console.log('\n═══ 5 · CAPTURAS: cada usuario sólo toca su carpeta ═══');
{
  const b = baseMigrada('cabina_capt');
  const got = b.err ? null : corre('capturas.sql', b.db);
  /* La prueba de capturas se escribió para el Storage real. Aquí corre contra el
     sustituto del arnés, así que lo que demuestra es que LAS POLÍTICAS de la
     migración hacen lo que dicen sobre `storage.objects` — no que el Storage de
     Supabase las aplique igual. Esa parte sigue siendo del Nivel 2. */
  ok(got !== null, 'capturas.sql corre contra las políticas reales', got || b.err || 'sin RESULTADO');
  if (got) {
    const mal = /B_lee_de_A=[1-9]|B_sube_en_carpeta_de_A_bloqueado=false|anonimo_ve=[1-9]|A_fuera_de_su_carpeta_bloqueado=false/.test(got);
    ok(!mal, 'y ninguna fuga entre carpetas', got);
  }
}

console.log('\n═══ 6 · LO QUE ESTO NO DEMUESTRA ═══');
console.log('  — UNKNOWN  que el proyecto Supabase real tenga estas migraciones aplicadas');
console.log('  — UNKNOWN  que el auth.uid() de GoTrue se comporte como el sustituto del arnés');
console.log('  — UNKNOWN  que PostgREST devuelva [] en un PATCH condicional con 0 filas');
console.log('  — UNKNOWN  que el Storage de Supabase aplique las políticas como storage.objects aquí');
console.log('     Las cuatro las corre el dueño: supabase/pruebas/*.sql contra el proyecto.');

apaga();
console.log(`\n  fallos: ${fallos.length}${fallos.length ? ' → ' + fallos.join(' · ') : ''}`);
process.exit(fallos.length ? 1 : 0);
