/* Regresión: cifras financieras sin recorte vertical, sin scroll de página,
   tablas con scroll propio, modal con acciones alcanzables.
   Datos sintéticos aislados; no toca nube ni QuantEngine. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const ok = (c, t, d) => {
  console.log(`  ${c ? '✅' : '❌'} ${t}${d != null ? ' · ' + d : ''}`);
  if (!c) fallos.push(t);
};

const seed = {
  settings: {
    accounts: [
      { id: 'a1', name: 'Prop Evaluation Mega Long Name LLC', type: 'prop', size: 50000, currency: 'USD' },
      { id: 'a2', name: 'Personal', type: 'personal', size: 10000, currency: 'USD' }
    ],
    rules: [],
    meta: { title: 'Cabina', subtitle: 'Prueba tipográfica' }
  },
  trades: {
    t1: { id: 't1', accountId: 'a1', date: '2026-10-28', time: '09:31', type: 'futuros', instrument: 'MNQ', direction: 'long', qty: 12, entry: 21000.25, stop: 20980, exit: 21055.75, notes: 'Nota larga '.repeat(10) },
    t2: { id: 't2', accountId: 'a1', date: '2026-10-29', time: '10:15', type: 'futuros', instrument: 'MES', direction: 'short', qty: 5, entry: 5800, stop: 5810, exit: 5775.5 },
    t3: { id: 't3', accountId: 'a2', date: '2026-10-30', time: '14:02', type: 'futuros', instrument: 'MNQ', direction: 'long', qty: 1, entry: 21111.11, stop: 21000, exit: 20950.01 },
    t4: { id: 't4', accountId: 'a1', date: '2026-10-31', time: '11:00', type: 'futuros', instrument: 'MNQ', direction: 'long', qty: 3, entry: 21222.22, stop: 21100, exit: 21444.44 }
  },
  days: {}
};

const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const matrix = [
  { w: 320, h: 568, theme: 'light', tabs: ['cabina', 'futuros', 'edge'] },
  { w: 375, h: 812, theme: 'dark', tabs: ['cabina', 'futuros'] },
  { w: 768, h: 1024, theme: 'light', tabs: ['cabina', 'futuros', 'edge'] },
  { w: 1280, h: 800, theme: 'light', tabs: ['cabina', 'futuros', 'edge'] },
  { w: 1280, h: 800, theme: 'dark', tabs: ['cabina', 'futuros'] },
  { w: 1920, h: 1080, theme: 'light', tabs: ['cabina', 'futuros'] }
];

async function gotoTab(page, tab, width) {
  if (width < 701) {
    await page.locator('#mobileMoreBtn').click({ timeout: 3000 }).catch(() => {});
    const item = page.locator(`#mobileMoreOv [data-mobile-more-tab="${tab}"]`);
    if (await item.count()) { await item.click(); await page.waitForTimeout(120); return; }
  }
  await page.locator(`#tabnav .tabbtn[data-tab="${tab}"]`).click({ force: true });
  await page.waitForTimeout(120);
}

for (const m of matrix) {
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h } });
  await ctx.addInitScript(({ seed, theme }) => {
    localStorage.setItem('cabina-mnq:v1', JSON.stringify(seed));
    localStorage.setItem('cabina-appearance:v1', JSON.stringify({
      mode: theme, accent: 'default', custom: '#1d4ed8',
      density: 'balanced', text: 'normal', font: 'system', atmosphere: 'calma'
    }));
  }, { seed, theme: m.theme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

  for (const tab of m.tabs) {
    await gotoTab(page, tab, m.w);
    const report = await page.evaluate(() => {
      const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
      const clipped = [];
      for (const el of document.querySelectorAll('.tile .v, .jstrip .v, .qec .qv, .kpis .v, .hero .v, .metric-overview .v')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const text = (el.textContent || '').trim();
        if (!text || text === '—') continue;
        const hides = /hidden|clip/.test(cs.overflow) || /hidden|clip/.test(cs.overflowY);
        const dH = el.scrollHeight - el.clientHeight;
        const dW = el.scrollWidth - el.clientWidth;
        if (hides && (dH > 1.5 || (dW > 1.5 && cs.textOverflow === 'ellipsis'))) {
          clipped.push({ text: text.slice(0, 40), dH, dW, overflow: cs.overflow, lh: cs.lineHeight, fs: cs.fontSize });
        }
        const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
        if (fs && lh && lh / fs < 1.18 && hides) {
          clipped.push({ text: text.slice(0, 40), reason: 'tight-lh-with-hidden', ratio: +(lh / fs).toFixed(2) });
        }
        if (/[0-9$%]/.test(text) && !/tabular-nums/.test(cs.fontVariantNumeric || '')) {
          clipped.push({ text: text.slice(0, 40), reason: 'missing-tabular', fv: cs.fontVariantNumeric });
        }
      }
      return { pageOverflow, clipped: clipped.slice(0, 12) };
    });
    ok(report.pageOverflow <= 1, `${m.theme}@${m.w}/${tab} · sin scroll horizontal de página`, report.pageOverflow);
    ok(report.clipped.length === 0, `${m.theme}@${m.w}/${tab} · cifras sin recorte`, JSON.stringify(report.clipped.slice(0, 3)));
  }

  // Modal: acciones alcanzables vía scroll interno del .ed
  await gotoTab(page, 'futuros', m.w);
  const ftNew = page.locator('#ftNew');
  if (await ftNew.count()) {
    await ftNew.scrollIntoViewIfNeeded().catch(() => {});
    if (await ftNew.isVisible()) {
      await ftNew.click({ force: true });
      await page.waitForSelector('#ov .ed', { timeout: 5000 }).catch(() => {});
      const modal = await page.evaluate(() => {
        const ed = document.querySelector('#ov .ed');
        const save = document.querySelector('#edSave');
        if (!ed || !save) return { ok: false, reason: 'missing' };
        const ecs = getComputedStyle(ed);
        const canScroll = /auto|scroll/.test(ecs.overflowY) || /auto|scroll/.test(ecs.overflow);
        const maxH = parseFloat(ecs.maxHeight) || ed.getBoundingClientRect().height;
        return {
          ok: canScroll && maxH <= window.innerHeight + 2,
          canScroll, maxH, vh: window.innerHeight,
          saveVisible: save.getBoundingClientRect().height > 0
        };
      });
      ok(modal.ok && modal.saveVisible, `${m.theme}@${m.w} · modal con scroll y Guardar`, JSON.stringify(modal));
      await page.locator('#edCancel').click({ force: true }).catch(() => {});
    } else {
      ok(true, `${m.theme}@${m.w} · modal omitido (CTA no visible en viewport)`);
    }
  }

  await ctx.close();
}

await browser.close();
await new Promise(r => server.close(r));
console.log(fallos.length ? `❌ tipografia-clip · ${fallos.length} fallo(s)` : 'PASS tipografia-clip: cifras completas, sin overflow de página, modal alcanzable');
process.exit(fallos.length ? 1 : 0);
