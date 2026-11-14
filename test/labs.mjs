/* CabinaLabs · cálculos reproducibles con datasets conocidos.
   No abre navegador: el módulo no pinta; sólo agrupa y correlaciona. */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(aqui, '..', 'labs.js')).href);
const L = globalThis.CabinaLabs;
const fallos = [];
const ok = (c, t, d) => {
  console.log('  ' + (c ? '✅' : '❌') + ' ' + t + (d != null ? '   ' + d : ''));
  if (!c) fallos.push(t);
};

ok(!!L && L.VERSION === '1.0.0', 'CabinaLabs exporta la API congelada');

console.log('\n═══ Pearson ═══');
ok(L.pearson([1, 2, 3, 4], [2, 4, 6, 8]) === 1, 'correlación perfecta positiva = 1');
ok(L.pearson([1, 2, 3, 4], [8, 6, 4, 2]) === -1, 'correlación perfecta negativa = -1');
ok(L.pearson([1, 1, 1], [2, 3, 4]) === 0, 'sin varianza en X = 0');
ok(L.pearson([1], [2]) === 0, 'n<2 = 0');
ok(L.corrStrength(0.8).includes('muy fuerte') && L.corrStrength(0.8).includes('positiva'), 'magnitud muy fuerte positiva');
ok(L.corrStrength(-0.2).includes('débil') && L.corrStrength(-0.2).includes('negativa'), 'magnitud débil negativa');

console.log('\n═══ Sesión y valoración ═══');
ok(L.sessionOf('08:30') === 'Londres' && L.sessionOf('15:00') === 'Nueva York' && L.sessionOf('02:00') === 'Asia', 'buckets de sesión');
ok(L.qualityToRating('A') === 5 && L.qualityToRating('C') === 1 && L.qualityToRating(4) === 4, 'calidad A/B/C y rating numérico');
ok(L.weekdayOf('2026-03-02') === 1, '2026-03-02 es lunes');

console.log('\n═══ Insights con dataset conocido ═══');
const mk = (id, date, time, pnl, extra = {}) => Object.assign({
  id, date, time, symbol: extra.symbol || 'MNQ', side: 'long', contracts: extra.contracts || 1,
  setup: extra.setup || 'Ruptura', emotion: extra.emotion || '', rating: extra.rating, pnl,
  mae: extra.mae, mfe: extra.mfe, tags: extra.tags || [], quality: extra.quality || '',
}, extra);

const few = [mk('a', '2026-03-02', '09:30', 20), mk('b', '2026-03-03', '09:35', -10)];
const empty = L.computeInsights(few);
ok(empty.insights.length === 0 && empty.reason === 'No hay evidencia suficiente',
  'menos de 8 operaciones no inventa patrones', empty.reason);

const trades = [];
for (let i = 0; i < 6; i++) trades.push(mk('r' + i, '2026-03-0' + (1 + (i % 5)), '09:3' + i, 80, { setup: 'Ruptura', symbol: 'MNQ' }));
for (let i = 0; i < 6; i++) trades.push(mk('f' + i, '2026-03-1' + (i % 5), '15:3' + i, -40, { setup: 'Fomo', symbol: 'MES', tags: i < 3 ? ['fomo'] : [] }));
const ins = L.computeInsights(trades);
ok(ins.sample === 12, 'muestra = 12');
ok(ins.insights.some(x => /Setup/.test(x.title) && x.sev === 'good'),
  'detecta setup ganador', ins.insights.map(x => x.title).join(' | '));
ok(ins.insights.some(x => x.id === 'fomo' && x.ids.length === 3),
  'FOMO sólo si está registrado');
ok(ins.insights.every(x => Array.isArray(x.ids) && x.ids.length),
  'cada insight lleva evidencia (ids)');

const revenge = [];
for (let i = 0; i < 12; i++) {
  const loss = i % 2 === 0;
  revenge.push(mk('rv' + i, '2026-04-' + String(10 + i).padStart(2, '0'), '10:00', loss ? -50 : (i % 4 === 1 ? -30 : 10)));
}
const rev = L.computeInsights(revenge);
ok(rev.insights.some(x => x.id === 'revenge' || x.id === 'cold-streak'),
  'detecta racha/revenge cuando hay evidencia', rev.insights.map(x => x.id).join(','));

console.log('\n═══ Orden intradía: #1-2 vs #3+ ═══');
const ordinalTrades = [];
for (let d = 1; d <= 8; d++) {
  const date = '2026-06-' + String(d).padStart(2, '0');
  ordinalTrades.push(mk('ord-' + d + '-1', date, '09:30', 40, { accountId: 'acct-A' }));
  ordinalTrades.push(mk('ord-' + d + '-2', date, '09:40', 20, { accountId: 'acct-A' }));
  ordinalTrades.push(mk('ord-' + d + '-3', date, '10:00', -30, { accountId: 'acct-A' }));
}
const ordinalBefore = JSON.stringify(ordinalTrades);
const ordinal = L.computeInsights(ordinalTrades).insights.find(x => x.id === 'third-trade-decay');
ok(!!ordinal && ordinal.n === 8 && ordinal.ids.length === 8,
  'detecta deterioro en 8 jornadas comparables y enlaza 8 trades posteriores');
ok(ordinal && ordinal.ids.every(id => id.endsWith('-3')) &&
  ordinal.sev === 'warn' && ordinal.detail.includes('no causalidad'),
  'evidencia corresponde sólo a #3+; sin afirmar causalidad');
ok(JSON.stringify(ordinalTrades) === ordinalBefore,
  'insight no escribe ni altera operaciones originales');
ok(!L.computeInsights(ordinalTrades.slice(0, 21)).insights.some(x => x.id === 'third-trade-decay'),
  '7 jornadas son insuficientes: no inventa señal');
const withMissing = ordinalTrades.map(t => t.id === 'ord-1-3' ? { ...t, time: '' } : t);
ok(!L.computeInsights(withMissing).insights.some(x => x.id === 'third-trade-decay'),
  'excluye jornada con hora ausente, en vez de inventar ordinal');
const withOpen = ordinalTrades.map(t => t.id === 'ord-1-1' ? { ...t, pnl: null } : t);
ok(!L.computeInsights(withOpen).insights.some(x => x.id === 'third-trade-decay'),
  'no cuenta jornada con trade abierto como jornada cerrada comparable');
const withTie = ordinalTrades.map(t => t.id === 'ord-1-2' ? { ...t, time: '09:30:00' } : t);
ok(!L.computeInsights(withTie).insights.some(x => x.id === 'third-trade-decay'),
  'empate al mismo segundo excluye la jornada aunque las cadenas sean distintas');
const withDuplicateId = ordinalTrades.map(t => t.id === 'ord-1-3' ? { ...t, id: 'ord-1-2' } : t);
ok(!L.computeInsights(withDuplicateId).insights.some(x => x.id === 'third-trade-decay'),
  'identificador duplicado excluye la jornada');
const withoutAccount = ordinalTrades.map(t => t.id === 'ord-1-3' ? { ...t, accountId: '' } : t);
ok(!L.computeInsights(withoutAccount).insights.some(x => x.id === 'third-trade-decay'),
  'no infiere tercera entrada si falta una cuenta en la jornada');
const dividedAccounts = ordinalTrades.map(t => t.id.endsWith('-3') ? { ...t, accountId: 'acct-B' } : t);
ok(!L.computeInsights(dividedAccounts).insights.some(x => x.id === 'third-trade-decay'),
  'dos cuentas no se fusionan para generar un falso tercer trade');
const withinAccount = ordinalTrades.flatMap(t =>
  t.id.endsWith('-3') ? [t, { ...t, id: t.id + 'B', accountId: 'acct-B', pnl: 90, time: '09:00' }] : [t]);
ok(L.computeInsights(withinAccount).insights.some(x => x.id === 'third-trade-decay'),
  'trades de otras cuentas no contaminan los ordinales comparables');

const profitableThird = ordinalTrades.map(t => t.id.endsWith('-3') ? { ...t, pnl: 100 } : t);
ok(!L.computeInsights(profitableThird).insights.some(x => x.id === 'third-trade-decay'),
  'sin deterioro real no genera una alerta de exceso de operaciones');

console.log('\n═══ Correlaciones ═══');
const corrRows = [
  mk('c1', '2026-05-01', '09:00', 10, { mae: 1, contracts: 1, rating: 5 }),
  mk('c2', '2026-05-02', '10:00', 20, { mae: 2, contracts: 2, rating: 5 }),
  mk('c3', '2026-05-03', '11:00', 30, { mae: 3, contracts: 3, rating: 5 }),
  mk('c4', '2026-05-04', '12:00', 40, { mae: 4, contracts: 4, rating: 5 }),
];
const nums = L.numericFactors(corrRows);
const mae = nums.find(x => x.id === 'mae');
ok(mae && mae.r === 1 && mae.n === 4, 'MAE vs P&L perfectamente correlacionado en el dataset', mae && mae.r);
const rating = nums.find(x => x.id === 'rating');
ok(rating && rating.r == null && rating.reason === 'sin variación',
  'no correlaciona un factor sin variación', rating && rating.reason);

const expl = L.exploreFactor(corrRows, 'mae', 'expectancy');
ok(expl.kind === 'numeric' && expl.r === 1 && expl.points.length === 4, 'explorador numérico');

const cat = L.exploreFactor([
  ...corrRows,
  mk('z1', '2026-05-05', '09:00', -20, { setup: 'Fade' }),
  mk('z2', '2026-05-06', '09:00', -30, { setup: 'Fade' }),
], 'setup', 'expectancy');
ok(cat.kind === 'categorical' && cat.bars.length >= 2, 'explorador categórico');

console.log('\n═══ Analítica y estrategias ═══');
const an = L.analyticsGroups(trades);
ok(an.n === 12 && an.equity.length === 12 && an.weekday.length === 5, 'grupos de analítica');
ok(an.setup.some(s => s.key === 'Ruptura' && s.pnl > 0), 'P&L por setup');
ok(/lab-equity/.test(L.equitySvg(an.equity)) && !L.equitySvg([{ v: 1 }]), 'curva de equity SVG');
const st = L.strategyMetrics(trades.filter(t => t.setup === 'Ruptura'));
ok(st.n === 6 && st.expectancy === 80 && st.pf === Infinity, 'métricas de estrategia sobre el mismo P&L');

const j = L.coerceJournal({ date: '2026-05-01', mood: 'Enfocado', title: 'A', body: 'B', lesson: 'C' });
ok(j.date === '2026-05-01' && j.mood === 'Enfocado' && Array.isArray(j.tradeIds), 'coerceJournal');

console.log('\n═══ group sin prototipo ═══');
const protoSafe = L.group([
  mk('p1', '2026-06-01', '09:00', 10, { setup: 'constructor' }),
  mk('p2', '2026-06-02', '09:00', -5, { setup: 'toString' }),
], t => t.setup);
ok(protoSafe.constructor && protoSafe.constructor.count === 1 && protoSafe.toString.count === 1,
  'agrupa claves heredadas del Object.prototype', JSON.stringify(protoSafe.constructor));

const adapted = L.adaptTrade({ id: 'x', mae: 20990, mfe: 21050, entry: 21000, direction: 'long', qty: 2, pnlEff: 1 }, { pnl: -0.5, qty: 2, mae: 10, mfe: 50 });
ok(adapted.pnl === -0.5 && adapted.mae === 10 && adapted.mfe === 50 && adapted.contracts === 2,
  'adaptTrade respeta neto y excursiones del helper', JSON.stringify(adapted));

console.log('\nfallos: ' + fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS labs');
