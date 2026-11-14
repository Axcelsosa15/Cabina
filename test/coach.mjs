/* CabinaCoach: las recomendaciones deben ser trazables, nunca señales ni inferencias inventadas. */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(here, '..', 'coach.js')).href);
const C = globalThis.CabinaCoach;
const failed = [];
let count = 0;
function ok(value, title) {
  count++;
  console.log('  ' + (value ? '✅' : '❌') + ' ' + title);
  if (!value) failed.push(title);
}
const item = (id, ids, extra = {}) => ({
  id, sev: 'warn', n: ids.length, ids,
  detail: 'Hecho observado en registros; no causalidad',
  confidence: 'muestra limitada',
  ...extra,
});

ok(!!C && C.VERSION === '1.0.0', 'API determinista y versionada');
const empty = C.recommendations([]);
ok(empty.status === 'insufficient' && empty.recommendations.length === 0,
  'sin patrones muestra estado insuficiente sin un falso diagnóstico');
ok(C.recommendations([item('third-trade-decay', [])]).recommendations.length === 0,
  'sin operaciones vinculadas no prescribe cambios');
ok(C.recommendations([item('third-trade-decay', ['1', '2'])]).recommendations.length === 0,
  'rechaza n inferior a tres aun para un id conocido');
ok(C.recommendations([item('setup-best-X', ['a','b','c','d'])]).recommendations.length === 0,
  'no convierte cualquier patrón favorable en acción');
ok(C.recommendations([item('revenge', ['a','b','c'], { sev: 'good' })]).recommendations.length === 0,
  'un insight favorable no se interpreta como problema');
const original = [item('overtrading', ['a','b','c','d']), item('revenge', ['r1','r2','r3'])];
const unchanged = JSON.stringify(original);
const r = C.recommendations(original);
ok(r.status === 'evidence' && r.recommendations.length === 2,
  'dos patrones diferentes producen acciones sin duplicar hechos');
ok(JSON.stringify(original) === unchanged, 'el Coach no muta los insights originales');
ok(r.recommendations[0].ids.length > 0 && r.recommendations[0].nextStep.length > 15,
  'cada acción expone trades y experimento concreto');
ok(r.recommendations.every(a => !/compra ahora|vende ahora|win rate garantizado/i.test(a.nextStep)),
  'no genera señales ni rentabilidad prometida');
const same = [item('revenge', ['a','b','c','d']), item('cold-streak', ['b','c','d'])];
ok(C.recommendations(same).recommendations.length === 1,
  'no propone dos acciones por evidencias casi idénticas');
ok(C.recommendations(original, { max: 1 }).recommendations.length === 1,
  'permite limitar cantidad de tareas');
ok(C.recommendations([item('fomo', ['f1','f2','f3']), item('oversize', ['o1','o2','o3']), ...original], { max: 999 }).recommendations.length === 3,
  'nunca más de tres recomendaciones');
ok(C.recommendations([item('revenge', ['a','a','a'], { n: 3 })]).recommendations[0].ids.length === 1,
  'los identificadores de evidencia no se duplican');
ok(C.recommendations([{ ...item('revenge', ['a','b','c']), ids: [null, {}, 'b'] }]).recommendations[0]?.ids.length === 1,
  'IDs inválidos no llegan al navegador');
ok(C.recommendations([item('fomo', ['a','b','c'], { n: NaN })]).status === 'insufficient',
  'muestra inválida no se convierte en certeza');

console.log('\nfallos: ' + failed.length);
if (failed.length) process.exit(1);
console.log('PASS coach · ' + count + ' afirmaciones');
