/* LA POLITICA DE CACHE DE LO PUBLICADO · una, efectiva, y la misma en todos.
   ─────────────────────────────────────────────────────────────────────────────
   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, Y QUE YA OCURRIO. `netlify.toml`
   razona con detalle por que `app.js` tiene que revalidar SIEMPRE: «lleva la
   aplicacion entera, asi que servir una copia vieja seria servir una version
   vieja de las reglas. Si algun dia se le pone cache larga, hay que ponerle
   hash primero». Ese razonamiento es correcto y era, hasta hoy, la unica
   politica de cache del repositorio —y por tanto solo estaba en efecto en
   Netlify, que es el unico de los tres caminos de publicacion sin una sola
   señal de uso: ni check, ni workflow, ni referencia—. El proyecto de Vercel,
   que SI publica un check en cada PR y tiene `rootDirectory` en la raiz del
   repositorio, no tenia `vercel.json`: ninguna de esas lineas se aplicaba.
   Un razonamiento escrito con cuidado sobre un fichero que nadie lee es
   exactamente el mismo fallo que un verde que mide otra cosa.

   QUE SE AFIRMA AQUI, y por que asi:

     §1 Hay una politica declarada para Vercel, y cubre TODA la ruta. Un
        enumerado dejaria a un fichero nuevo con el valor por defecto del host,
        que es justo lo que nadie revisa.
     §2 Una sola regla fija `Cache-Control`. En `headers` de Vercel continuar es
        el comportamiento por defecto y los ejemplos oficiales nunca ponen la
        misma clave en dos reglas que se solapan: dos reglas serian precedencia
        indefinida sobre la cabecera que protege al codigo.
     §3 El navegador revalida siempre: ni `max-age` distinto de cero, ni
        `immutable`. Es la invariante, no una preferencia.
     §4 La premisa que la sostiene sigue siendo cierta: ningun fichero de codigo
        del casco lleva hash en el nombre. El dia que lo lleve, §3 se puede
        relajar — y hasta ese dia, no.
     §5 Los hosts configurados no se contradicen. Mientras `netlify.toml` exista,
        su politica de navegador tiene que ser la misma que la de `vercel.json`.
        Dos caminos de publicacion con dos politicas distintas significa que lo
        que ve el usuario depende de a donde apunte el DNS ese dia.

   LO QUE AQUI NO SE PRUEBA: que el host aplique estas cabeceras. Eso se mide
   contra la URL real, y el repositorio no sabe cual es —ver
   docs/DECISION_HOST_PUBLICACION_2026-11-05.md—. Aqui se mide que la politica
   EXISTA, sea una, y diga lo que el razonamiento dice. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLICADO } from './publicado.mjs';

const fallos = [];
const ok = (c, t, d) => { console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? '   ' + d : ''}`); if (!c) fallos.push(t); };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const lee = f => readFileSync(join(raiz, f), 'utf8');

/* ═══ §1 · HAY UNA POLITICA, Y CUBRE TODA LA RUTA ═════════════════════════ */
console.log('\n═══ §1 · vercel.json declara una politica que cubre todo ═══');
ok(existsSync(join(raiz, 'vercel.json')), 'vercel.json existe',
   'sin el, el proyecto de Vercel sirve con los valores por defecto del host');
let cfg = null;
try { cfg = JSON.parse(lee('vercel.json')); } catch (e) { ok(false, 'vercel.json es JSON valido', e.message); }
const reglas = (cfg && Array.isArray(cfg.headers)) ? cfg.headers : [];
ok(reglas.length > 0, 'vercel.json declara reglas de cabeceras', `${reglas.length} reglas`);

const TODO = new Set(['/(.*)', '/:path*', '/(.*)/', '/:path*/']);
const cc = reglas.filter(r => (r.headers || []).some(h => /^cache-control$/i.test(h.key)));
ok(cc.some(r => TODO.has(r.source)), 'la regla de Cache-Control cubre toda la ruta',
   cc.map(r => r.source).join(' · ') || 'ninguna regla fija Cache-Control');

/* ═══ §2 · UNA SOLA REGLA FIJA Cache-Control ══════════════════════════════ */
console.log('\n═══ §2 · sin precedencia indefinida sobre la cabecera que importa ═══');
ok(cc.length === 1, 'exactamente una regla fija Cache-Control',
   cc.length === 1 ? cc[0].source : `${cc.length} reglas: ${cc.map(r => r.source).join(' · ')}`);
const pares = cc.flatMap(r => r.headers).filter(h => /^cache-control$/i.test(h.key));
ok(pares.length === 1, 'y la fija una sola vez', `${pares.length} veces`);

/* ═══ §3 · EL NAVEGADOR REVALIDA SIEMPRE ═════════════════════════════════ */
console.log('\n═══ §3 · el navegador no se queda con una copia vieja del codigo ═══');
const nav = (pares[0] && pares[0].value) || '';
ok(/must-revalidate/.test(nav), 'la politica del navegador exige revalidar', nav || '—');
const maxAge = (nav.match(/(?:^|[,\s])max-age=(\d+)/) || [])[1];
ok(maxAge === '0', 'max-age es 0, no un valor que deje servir codigo viejo', `max-age=${maxAge ?? 'ausente'}`);
ok(!/\bimmutable\b/.test(nav), "la politica del navegador no declara 'immutable'");

/* ═══ §4 · LA PREMISA: NINGUN FICHERO DE CODIGO LLEVA HASH ════════════════ */
console.log('\n═══ §4 · la premisa que sostiene a §3 sigue siendo cierta ═══');
const codigo = PUBLICADO.filter(f => /\.(js|html|webmanifest)$/.test(f));
/* Un hash de contenido en el nombre: «app.4f2a9c1.js», «app-4f2a9c1b.js». */
const conHash = codigo.filter(f => /[.\-][0-9a-f]{8,}\.(js|html|webmanifest)$/i.test(f));
ok(codigo.length > 0, 'hay ficheros de codigo publicados que medir', codigo.join(' · '));
ok(conHash.length === 0, 'ninguno lleva hash de contenido en el nombre, asi que la cache larga sigue prohibida',
   conHash.length ? `con hash: ${conHash.join(' · ')} — §3 se puede relajar para estos` : `${codigo.length} ficheros sin hash`);

/* ═══ §5 · LOS HOSTS CONFIGURADOS NO SE CONTRADICEN ══════════════════════ */
console.log('\n═══ §5 · dos caminos de publicacion, una sola politica ═══');
if (!existsSync(join(raiz, 'netlify.toml'))) {
  ok(true, 'netlify.toml ya no existe: solo queda una politica que comparar', 'nada que contradecir');
} else {
  const toml = lee('netlify.toml');
  /* El valor de `Cache-Control` del bloque que cubre `/*`, sin su prosa. */
  const bloque = (toml.replace(/^\s*#.*$/gm, '').match(/for\s*=\s*"\/\*"[\s\S]*?Cache-Control\s*=\s*"([^"]+)"/) || [])[1];
  ok(!!bloque, 'netlify.toml declara una politica de navegador para toda la ruta', bloque || 'no se encontro');
  const norm = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).sort().join(', ');
  ok(norm(bloque) === norm(nav), 'netlify.toml y vercel.json dicen lo MISMO al navegador',
     norm(bloque) === norm(nav) ? norm(nav) : `netlify: «${norm(bloque)}» · vercel: «${norm(nav)}»`);
}

console.log('\n  fallos: ' + fallos.length + (fallos.length ? ' → ' + fallos.join(' | ') : ''));
if (fallos.length) process.exitCode = 1;
