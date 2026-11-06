import { resolveCname } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

export async function verificaDnsPages(url, owner, consulta = resolveCname) {
  const host = new URL(url).hostname;
  if (!host.startsWith('www.')) return;

  const esperado = `${owner.toLowerCase()}.github.io`;
  let registros;
  try {
    registros = await consulta(host);
  } catch (error) {
    if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') {
      throw new Error(`No se pudo consultar el DNS de ${host} (${error.code || error.message}).`);
    }
    registros = [];
  }
  const destinos = registros.map(nombre => nombre.toLowerCase().replace(/\.$/, ''));
  if (destinos.length !== 1 || destinos[0] !== esperado) {
    throw new Error(`${host} requiere un CNAME directo a ${esperado}. Publicado: ${destinos.join(', ') || 'sin CNAME'}.`);
  }
  return `${host} apunta a ${esperado}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const resultado = await verificaDnsPages(process.env.PAGES_URL, process.env.PAGES_OWNER);
    if (resultado) console.log(resultado);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
