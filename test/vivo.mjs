/* ¿Se ajustan TODOS los números al entrar una operación?
   Verdad de referencia = lo que muestra la app tras RECARGAR.
   Cualquier valor que difiera entre "actualizado en vivo" y "tras recargar"
   está rancio: la app te está enseñando un número viejo. */
import { chromium } from 'playwright';
import { quieto, arrancada, trasGuardar } from './espera.mjs';
const errs = []; const b = await chromium.launch();
const F = new Date('2026-09-17T14:00:00Z').getTime();
const TABS = ['cabina', 'futuros', 'playbook', 'invest', 'ideas', 'calc'];

const SEMILLA = {
  settings: { accounts: [{ id:'a1', firm:'Firma', name:'Evaluación 25K', kind:'Evaluación',
    size:25000, dd:1000, ddKind:'trailing_lock', limit:50, total:0, best:0, target:1500,
    status:'activa', ledger:[] }], rules: [], meta: {} },
};

async function nueva() {
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1200 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t=m.text(); if (m.type()==='error' && !/ERR_CERT|ERR_CONNECTION|fonts|ERR_FILE/.test(t)) errs.push('CONSOLE: '+t); });
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  return p;
}


/* Recorre todas las pestañas y devuelve un mapa clave->valor de cada nodo de
   texto que contenga un dígito, con una clave estable por ruta en el DOM. */
async function foto(p) {
  const mapa = {};
  for (const t of TABS) {
    await p.click(`.tabbtn[data-tab="${t}"]`).catch(()=>{});
    await quieto(p);
    // recorre también las sub-vistas: un número rancio puede estar escondido en una
    const subs = await p.evaluate(() => [...document.querySelectorAll('button[data-v]')].filter(b=>b.offsetParent).map(b=>b.dataset.v));
    for (const sv of (subs.length ? subs : [null])) {
      if (sv) { await p.click(`button[data-v="${sv}"]`).catch(()=>{}); await quieto(p); }
      const m = await p.evaluate((tab) => {
      const out = {};
      const ruta = (el) => {
        const partes = [];
        for (let n = el; n && n.nodeType === 1 && partes.length < 8; n = n.parentElement) {
          if (n.id) { partes.unshift('#' + n.id); break; }
          const padre = n.parentElement;
          const i = padre ? [...padre.children].indexOf(n) : 0;
          partes.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : '') + ':' + i);
        }
        return partes.join('>');
      };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, k = 0;
      while ((n = w.nextNode())) {
        const v = (n.textContent || '').trim();
        if (!v || !/\d/.test(v) || v.length > 90) continue;
        const el = n.parentElement;
        if (!el || !el.offsetParent) continue;             // invisible: no cuenta
        if (el.closest('script,style')) continue;
        out[tab + '|' + ruta(el) + '|' + (k++)] = v;
      }
      return out;
      }, t + (sv ? '/' + sv : ''));
      Object.assign(mapa, m);
    }
  }
  return mapa;
}

async function sembrar(p, extra) {
  const datos = JSON.parse(JSON.stringify(SEMILLA));
  if (extra) datos.trades = extra;
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(datos))});}catch(e){}`);
}

async function meteOperacion(p, id, exit) {
  await p.click('.tabbtn[data-tab="futuros"]'); await p.click('#ftNew');
  await p.waitForSelector('#ef_entry', { timeout: 10000 }); await quieto(p);
  await p.fill('#ef_date', '2026-09-17'); await p.fill('#ef_time', '09:45');
  await p.fill('#ef_instrument', 'MNQ'); await p.fill('#ef_qty', '2');
  await p.selectOption('#ef_accountId', id);
  await p.fill('#ef_entry', '21000'); await p.fill('#ef_stop', '20990'); await p.fill('#ef_exit', String(exit));
  await p.click('#edSave'); await trasGuardar(p);
}

// ── 1. sesión que actualiza en vivo ──
const p1 = await nueva();
await sembrar(p1);
await p1.goto('file://' + process.cwd() + '/preview.html'); await arrancada(p1);
const id = await p1.evaluate(() => document.querySelector('.acct').dataset.id);
await meteOperacion(p1, id, 21030);          // +30 pts x 2 x $2 = +$120
await meteOperacion(p1, id, 20990);          // -10 pts x 2 x $2 = -$40
const vivo = await foto(p1);
const guardado = await p1.evaluate(() => localStorage.getItem('cabina-mnq:v1'));

// ── 2. misma data, cargada de cero ──
const p2 = await nueva();
await p2.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(guardado)});}catch(e){}`);
await p2.goto('file://' + process.cwd() + '/preview.html'); await arrancada(p2);
const fresco = await foto(p2);
const fresco2 = await foto(p2);               // segunda pasada: detecta lo volátil

const volatil = new Set(Object.keys(fresco).filter(k => fresco[k] !== fresco2[k]));
const claves = new Set([...Object.keys(vivo), ...Object.keys(fresco)]);
const rancios = [], faltan = [], sobran = [];
for (const k of claves) {
  if (volatil.has(k)) continue;
  if (!(k in vivo)) { faltan.push(k); continue; }
  if (!(k in fresco)) { sobran.push(k); continue; }
  if (vivo[k] !== fresco[k]) rancios.push([k, vivo[k], fresco[k]]);
}
console.log(`valores numéricos comparados : ${claves.size}`);
console.log(`volátiles (reloj) excluidos  : ${volatil.size}`);
console.log(`presentes tras recargar pero no en vivo : ${faltan.length}`);
console.log(`presentes en vivo pero no tras recargar : ${sobran.length}`);
console.log(`\n══════ RANCIOS (en vivo ≠ tras recargar): ${rancios.length} ══════`);
for (const [k, a, c] of rancios.slice(0, 40)) console.log(`  ${k.split('|')[0].padEnd(9)} ${k.split('|')[1].slice(-58).padEnd(58)}\n     en vivo: ${a}\n     real   : ${c}`);
if (faltan.length) { console.log('\n── claves que sólo aparecen tras recargar (bloques que no se pintaron) ──'); faltan.slice(0,15).forEach(k=>console.log('  '+k.split('|').slice(0,2).join(' | ').slice(0,120)+'  = '+fresco[k])); }
console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
