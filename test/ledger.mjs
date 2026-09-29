import { chromium } from 'playwright';
const URL = 'file://' + process.cwd() + '/preview.html';
const b = await chromium.launch();
const errs = [];

// Cuenta con movimientos guardados EN NEGATIVO, como vendría de un respaldo viejo.
const semilla = {
  settings: {
    accounts: [{ id: 'a1', firm: 'Firma', name: 'Prueba negativos', kind: 'Fondeada',
      size: 25000, dd: 1000, ddKind: 'trailing_lock', limit: 50, total: 0, best: 0, target: 0, status: 'activa',
      ledger: [
        { id: 'l1', date: '2026-09-01', kind: 'payout',  amount: -500 },
        { id: 'l2', date: '2026-09-02', kind: 'fee',     amount:  -50 },
        { id: 'l3', date: '2026-09-03', kind: 'deposit', amount: -200 },
      ] }],
    rules: [], meta: {},
  },
};

async function corre(html, etiqueta) {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
  p.on('pageerror', e => errs.push(etiqueta + ' PAGEERROR: ' + e.message));
  const F = new Date('2026-09-17T14:00:00Z').getTime();
  await p.addInitScript(`{const F=${F};const R=Date;class D extends R{constructor(...a){if(!a.length)super(F);else super(...a);}static now(){return F;}}window.Date=D;}`);
  await p.addInitScript(`try{localStorage.setItem('cabina-mnq:v1', ${JSON.stringify(JSON.stringify(semilla))});}catch(e){}`);
  await p.goto('file://' + process.cwd() + '/' + html); await p.waitForTimeout(1100);
  const card = await p.evaluate(() => { const c = document.querySelector('.acct'); return c ? c.innerText.replace(/\s+/g, ' ') : '(sin tarjeta)'; });
  const bal = card.slice(0, 200);
  const mov = await p.evaluate(() => {
    const t = [...document.querySelectorAll('table.t')].find(x => /Importe/.test(x.innerText));
    return t ? t.innerText.replace(/\n/g, ' | ').replace(/\t/g, ' ') : '(tabla de movimientos no visible)';
  });
  await p.context().close();
  return { bal, mov };
}

/* La mitad «ANTES» compara contra una copia vieja de la app (prev_v1.html,
   construida a mano desde cabina.bak13). Es arqueología: si el archivo no está,
   no hay nada que probar ahí y la parte que SÍ tiene que seguir verde es la de
   abajo. Sin esta guarda, el test entero moría por un archivo ausente. */
import { existsSync } from 'node:fs';
if (existsSync('prev_v1.html')) {
  console.log('════ ANTES (cabina.bak13 · sin el arreglo) ════');
  const a = await corre('prev_v1.html', 'v1');
  console.log('  ' + a.bal);
  console.log('  ' + a.mov.slice(0, 220));
} else {
  console.log('════ ANTES ════\n  (prev_v1.html no está: la comparación histórica se salta)');
}
console.log('\n════ DESPUÉS (con el arreglo) ════');
const c = await corre('preview.html', 'v2');
console.log('  ' + c.bal);
console.log('  ' + c.mov.slice(0, 220));
console.log('\n  esperado: balance = 25000 − 500(retiro) − 200… con magnitudes, y sin «--$» ni «+-$»');
console.log('\nerrores JS: ' + (errs.length ? errs.join('\n') : '0'));
await b.close();
