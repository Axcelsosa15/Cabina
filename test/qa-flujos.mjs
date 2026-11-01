/* TAREA 6 · matriz de flujos.
   Lanza suites existentes (y qa-integracion) una por una y escribe
   PASS/FAIL a stdout + /opt/cursor/artifacts/qa-matriz.json.
   No modifica lógica de producto. */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const artifacts = '/opt/cursor/artifacts';
mkdirSync(artifacts, { recursive: true });

const FLUJOS = [
  { id: 'T1-forms-editor', task: 'T1', file: 'editor-validacion', note: 'validación de editor' },
  { id: 'T1-data-entry-ui', task: 'T1', file: 'data-entry-ui', note: 'contrato cromático de entradas' },
  { id: 'T1-rapido', task: 'T1', file: 'rapido', note: 'registro rápido ≡ editor' },
  { id: 'T2-edge', task: 'T2', file: 'edge', note: 'fórmulas Métricas/Edge' },
  { id: 'T2-equivalencia', task: 'T2', file: 'equivalencia', note: 'tarjeta vs motor + dorados' },
  { id: 'T2-metricas-lectura', task: 'T2', file: 'metricas-lectura', note: 'lectura tipográfica de métricas' },
  { id: 'T2-csv', task: 'T2', file: 'csv', note: 'export CSV sanity' },
  { id: 'T3-sync', task: 'T3', file: 'sync', note: '10 escenarios cabina≡futuros' },
  { id: 'T3-guardado', task: 'T3', file: 'guardado', note: 'fallo de guardado comunicado' },
  { id: 'T3-sello', task: 'T3', file: 'sello', note: 'OCC / no pisar documento nuevo' },
  { id: 'T3-conflicto', task: 'T3', file: 'conflicto', note: 'conflicto entre dispositivos' },
  { id: 'T4-estudiar-dia', task: 'T4', file: 'estudiar-dia-cabina', note: 'Cabina→Estudio' },
  { id: 'T4-capturas-estudio', task: 'T4', file: 'flujo-capturas-estudio', note: 'capturas compartidas' },
  { id: 'T4-navegacion', task: 'T4', file: 'navegacion-grupos', note: 'grupos + móvil' },
  { id: 'T4-cuentas', task: 'T4', file: 'cuentas', note: 'sesión / user_id' },
  { id: 'T4-ajustes', task: 'T4', file: 'ajustes-claros', note: 'Ajustes apariencia/datos' },
  { id: 'T5-contraste', task: 'T5', file: 'contraste', note: 'contraste light/dark' },
  { id: 'T5-apariencia', task: 'T5', file: 'apariencia', note: 'preferencias de apariencia' },
  { id: 'T5-vista', task: 'T5', file: 'vista', note: 'nada se sale de pantalla' },
  { id: 'T5-layout', task: 'T5', file: 'layout-operativa', note: 'layout operativa' },
  { id: 'INT-fixture', task: 'INT', file: 'qa-integracion', note: 'fixture aislado punta a punta' },
  { id: 'BASE-humo', task: 'BASE', file: 'humo', note: 'smoke HTTP Pages payload' },
  { id: 'BASE-seguridad', task: 'BASE', file: 'seguridad', note: 'auditoría seguridad estática' },
];

const TOPE_MS = 300000;
const corre = (file) => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(aqui, 'correr.mjs'), file], {
    cwd: aqui, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  const reloj = setTimeout(() => p.kill('SIGKILL'), TOPE_MS);
  p.on('close', code => {
    clearTimeout(reloj);
    const cruces = (out.match(/❌/g) || []).length;
    res({ code, ms: Date.now() - t0, out, cruces });
  });
});

const rows = [];
console.log(`Cabina QA · matriz de ${FLUJOS.length} flujos\n`);
for (const f of FLUJOS) {
  const r = await corre(f.file);
  const pass = r.code === 0 && r.cruces === 0;
  const redLines = r.out.split('\n').filter(l => l.includes('❌')).slice(0, 6);
  rows.push({
    id: f.id, task: f.task, file: f.file, note: f.note,
    status: pass ? 'PASS' : 'FAIL', ms: r.ms, code: r.code, cruces: r.cruces,
    detail: redLines.join('\n').slice(0, 800),
  });
  console.log(`  ${pass ? '✅' : '❌'} ${f.id.padEnd(24)} ${String(r.ms).padStart(6)} ms  ${f.file}`);
  if (!pass && redLines.length) console.log(redLines.map(l => '       ' + l.trim()).join('\n'));
}

const summary = {
  when: new Date().toISOString(),
  branch: process.env.CABINA_QA_BRANCH || 'cursor/qa-integracion-df2e',
  base: 'main',
  totals: {
    pass: rows.filter(r => r.status === 'PASS').length,
    fail: rows.filter(r => r.status === 'FAIL').length,
    n: rows.length,
  },
  byTask: Object.fromEntries(
    [...new Set(rows.map(r => r.task))].map(t => {
      const subset = rows.filter(r => r.task === t);
      return [t, {
        pass: subset.filter(r => r.status === 'PASS').length,
        fail: subset.filter(r => r.status === 'FAIL').length,
        n: subset.length,
      }];
    }),
  ),
  rows,
};

writeFileSync(join(artifacts, 'qa-matriz.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(artifacts, 'qa-matriz.log'), rows.map(r =>
  `${r.status.padEnd(4)} ${r.id.padEnd(24)} ${String(r.ms).padStart(6)}ms  ${r.file}  ${r.note}`
).join('\n') + `\n\n${summary.totals.pass}/${summary.totals.n} PASS\n`);

console.log(`\n${summary.totals.pass}/${summary.totals.n} PASS · matriz → ${artifacts}/qa-matriz.json`);
if (summary.totals.fail) process.exit(1);
