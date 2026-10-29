/* NO ES UNA PRUEBA · es lo que Pages publica, leído del propio workflow.
   ─────────────────────────────────────────────────────────────────────────────
   POR QUE EXISTE. `humo.mjs` y `servida.mjs` dicen, cada una en su cabecera,
   que sirven «sólo lo que Pages publica». Mientras eso fue index.html y
   .nojekyll, la frase se sostenía sola. Desde que la página se puede instalar
   son doce ficheros, y una lista escrita a mano en tres sitios distintos
   diverge: no es una posibilidad, es cuestión de cuándo.

   Así que la lista no se escribe aquí: se LEE del paso «Armar lo que se
   publica» de `pagina.yml`, que es el único sitio donde la decisión existe de
   verdad. Añadir un fichero al despliegue lo añade a lo que prueban las dos
   suites, sin que nadie tenga que acordarse.

   Lo que esto NO hace: comprobar que el fichero exista o que GitHub lo sirva.
   De lo primero se encarga `pwa.mjs` §1 —que parsea el workflow por su cuenta,
   a propósito: si este módulo mintiera, el guardián no mentiría con él—, y de
   lo segundo, el propio despliegue contra la URL real. */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Las líneas `cp … sitio/…` del workflow, sin sus comentarios: la prosa de esa
   sección nombra ficheros y contarla sería leer la explicación como si fuera la
   decisión. */
const yaml = readFileSync(join(raiz, '.github/workflows/pagina.yml'), 'utf8')
  .split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

export const PUBLICADO = Array.from(new Set(
  Array.from(yaml.matchAll(/^\s*cp\s+(.+?)\s+sitio\/\S*\s*$/gm))
    .flatMap(m => m[1].split(/\s+/))
    .filter(f => f && !f.startsWith('-'))
)).filter(f => existsSync(join(raiz, f)));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/* Un servidor con EXACTAMENTE lo publicado y nada más: una ruta que no esté en
   la lista sigue dando 404, que es lo que hace útil a estas pruebas. `cuerpo`
   permite servir un index.html modificado sin tocar el disco. */
export function sirvePublicado(cuerpo) {
  const html = cuerpo != null ? cuerpo : readFileSync(join(raiz, 'index.html'));
  const mapa = new Map();
  for (const f of PUBLICADO) {
    const ruta = '/' + f;
    mapa.set(ruta, [TIPOS[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream',
                    f === 'index.html' ? html : readFileSync(join(raiz, f))]);
  }
  mapa.set('/', ['text/html; charset=utf-8', html]);
  mapa.set('/index.html', ['text/html; charset=utf-8', html]);

  const srv = createServer((q, r) => {
    const e = mapa.get(decodeURIComponent(q.url.split('?')[0]));
    if (!e) { r.writeHead(404); return r.end('no'); }
    r.writeHead(200, { 'content-type': e[0] }); r.end(e[1]);
  });
  return srv;
}
