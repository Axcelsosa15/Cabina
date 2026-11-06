import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { verificaDnsPages } from '../.github/scripts/verifica-dns-pages.mjs';

const url = 'https://www.cabina.site/';
const owner = 'Axcelsosa15';

assert.equal(await verificaDnsPages(url, owner, async host => {
  assert.equal(host, 'www.cabina.site');
  return ['AxcelSosa15.GitHub.io.'];
}), 'www.cabina.site apunta a axcelsosa15.github.io');
console.log('  ✅ acepta el CNAME directo aunque cambie el formato DNS');

await assert.rejects(verificaDnsPages(url, owner, async () => {
  throw Object.assign(new Error('No CNAME'), { code: 'ENODATA' });
}), /requiere un CNAME directo a axcelsosa15\.github\.io.*sin CNAME/);
console.log('  ✅ rechaza un www que solo responde con registros A');

await assert.rejects(
  verificaDnsPages(url, owner, async () => ['cname.vercel-dns.com']),
  /Publicado: cname\.vercel-dns\.com/,
);
console.log('  ✅ identifica un CNAME dirigido a otro proveedor');

await assert.rejects(verificaDnsPages(url, owner, async () => {
  throw Object.assign(new Error('Timeout'), { code: 'ETIMEOUT' });
}), /No se pudo consultar el DNS.*ETIMEOUT/);
console.log('  ✅ distingue la falta de CNAME de un fallo de resolución');

assert.equal(await verificaDnsPages('https://axcelsosa15.github.io/Cabina/', owner, () => {
  assert.fail('La URL estándar de Pages no requiere comprobar el CNAME de www');
}), undefined);
console.log('  ✅ admite la URL estándar de GitHub Pages');

const ejecutar = promisify(execFile);
const workflow = await readFile(new URL('../.github/workflows/pagina.yml', import.meta.url), 'utf8');
function paso(nombre) {
  return workflow.split(`      - name: ${nombre}\n        run: |\n`)[1].split(/\n(?= {6}\S)/)[0];
}

const cwd = await mkdtemp(join(tmpdir(), 'cabina-pages-'));
try {
  const original = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  await writeFile(join(cwd, 'index.html'), original);
  await mkdir(join(cwd, 'sitio'));
  const recursos = paso('Todo lo que index.html pide del propio sitio está publicado');
  await assert.rejects(ejecutar('bash', ['-c', recursos], { cwd }), error =>
    error.code === 1 && error.stdout.includes('index.html pide og.png'));
  await writeFile(join(cwd, 'sitio', 'og.png'), '');
  await ejecutar('bash', ['-c', recursos], { cwd });
  console.log('  ✅ el artefacto valida la imagen de la URL canónica');

  let imagenRota = false;
  const server = createServer((request, response) => {
    const ruta = new URL(request.url, 'http://localhost').pathname;
    if (ruta === '/og.png') {
      response.writeHead(302, { Location: imagenRota ? '/no-existe' : '/imagen' });
    } else {
      response.writeHead(ruta === '/no-existe' ? 404 : 200);
    }
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const publicados = paso('Todo el casco responde en la URL publicada')
      .replace('${{ steps.deploy.outputs.page_url }}', `http://127.0.0.1:${server.address().port}/`);
    const opciones = { cwd, env: { ...process.env, GITHUB_RUN_ID: 'prueba' } };
    await ejecutar('bash', ['-c', publicados], opciones);
    imagenRota = true;
    await assert.rejects(ejecutar('bash', ['-c', publicados], opciones), error =>
      error.code === 1 && error.stdout.includes('/og.png no responde'));
    console.log('  ✅ una redirección solo pasa si el destino final responde HTTP 200');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
} finally {
  await rm(cwd, { recursive: true, force: true });
}
