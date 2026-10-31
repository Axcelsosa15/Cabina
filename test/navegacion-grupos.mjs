/* Cabina 2.0 navigation: the grouped desktop rail must use the same 11
   routes as the mobile dock, menu, hashes and original buttons. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const groups = {
  operar: { first: 'cabina', tabs: ['cabina', 'futuros', 'cuentas'] },
  analizar: { first: 'historial', tabs: ['historial', 'edge'] },
  mejorar: { first: 'playbook', tabs: ['playbook', 'estudio'] },
  portafolio: { first: 'invest', tabs: ['invest'] },
  herramientas: { first: 'ideas', tabs: ['ideas', 'calc'] },
  sistema: { first: 'ajustes', tabs: ['ajustes'] }
};
const allTabs = Object.values(groups).flatMap(x => x.tabs);
const failures = [], jsErrors = [];
const check = (condition, title, extra = '') => {
  console.log('  ' + (condition ? '✅' : '❌') + ' ' + title + (extra ? ' · ' + extra : ''));
  if (!condition) failures.push(title);
};
const server = sirvePublicado();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const base = 'http://127.0.0.1:' + server.address().port + '/';
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => jsErrors.push(error.message));
    await page.addInitScript(mode =>
      localStorage.setItem('cabina-appearance:v1', JSON.stringify({mode, accent:'default', custom:'#1d4ed8'})), theme);
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
    const initial = await page.evaluate(() => ({
      routes: [...document.querySelectorAll('#tabnav > .tabbtn[data-tab]')].map(b => b.dataset.tab),
      active: document.querySelector('#tabnav .tabbtn.active')?.dataset.tab,
      groups: [...document.querySelectorAll('#navGroupBar button')].map(b => b.dataset.group),
      shown: getComputedStyle(document.getElementById('navGroupBar')).display !== 'none',
      allVisible: [...document.querySelectorAll('#tabnav .tabbtn')].every(b => getComputedStyle(b).display !== 'none')
    }));
    check(allTabs.length === 11 && initial.routes.length === 11 &&
      allTabs.every(tab => initial.routes.includes(tab)), theme + ': all original 11 routes retained');
    check(initial.groups.length === 7 && initial.shown && initial.groups.includes('todas') && initial.allVisible,
      theme + ': six task groups plus All keep legacy direct routes accessible');

    for (const [name, spec] of Object.entries(groups)) {
      await page.locator('#navGroupBar button[data-group="' + name + '"]').click();
      await page.waitForFunction(g => document.getElementById('tabnav').dataset.activeGroup === g, name);
      const state = await page.evaluate(() => {
        const nav = document.getElementById('tabnav');
        return {
          current: document.querySelector('#tabnav .tabbtn.active')?.dataset.tab,
          hash: location.hash,
          activeGroup: nav.dataset.activeGroup,
          visible: [...nav.querySelectorAll('.tabbtn')].filter(x => getComputedStyle(x).display !== 'none').map(x=>x.dataset.tab),
          pressed: [...document.querySelectorAll('#navGroupBar button[aria-pressed="true"]')].map(x => x.dataset.group),
          screens: [...document.querySelectorAll('.tab.active')].map(x => x.dataset.tab)
        };
      });
      check(state.current === spec.first && state.hash === '#' + spec.first &&
        state.pressed.length === 1 && state.pressed[0] === name && state.screens.includes(spec.first),
        theme + ': ' + name + ' opens its real tab and syncs hash/aria');
      check(state.visible.length === spec.tabs.length &&
        spec.tabs.every(tab => state.visible.includes(tab)),
        theme + ': ' + name + ' only shows relevant subtabs', state.visible.join(','));
    }

    // Simulate search/command-palette navigation to a tab in another group.
    await page.evaluate(() => document.querySelector('#tabnav .tabbtn[data-tab="futuros"]').click());
    await page.waitForFunction(() => document.getElementById('tabnav').dataset.activeGroup === 'operar');
    check(await page.getAttribute('#navGroupBar [data-group="operar"]', 'aria-pressed') === 'true' &&
      await page.evaluate(() => location.hash) === '#futuros',
      theme + ': programmatic navigation switches the visible group');
    await page.locator('#navGroupBar [data-group="analizar"]').click();
    await page.locator('#navGroupBar [data-group="operar"]').click();
    check(await page.evaluate(() => document.querySelector('#tabnav .tabbtn.active')?.dataset.tab) === 'futuros',
      theme + ': returning to a group restores its last visited tab');
    await page.locator('#navGroupBar [data-group="todas"]').click();
    check(await page.evaluate(() => [...document.querySelectorAll('#tabnav .tabbtn')].every(b => getComputedStyle(b).display !== 'none')),
      theme + ': All restores every tab without modifying current route');
    await context.close();
  }

  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => jsErrors.push(error.message));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });
    const mobile = await page.evaluate(() => ({
      barHidden: getComputedStyle(document.getElementById('navGroupBar')).display === 'none',
      dock: ['cabina','futuros','invest','estudio'].every(tab => getComputedStyle(document.querySelector('#tabnav .tabbtn[data-tab="'+tab+'"]')).display !== 'none'),
      menuItems: [...document.querySelectorAll('[data-mobile-more-tab]')].map(el=>el.dataset.mobileMoreTab),
      headings: document.querySelectorAll('.mobile-more-label').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    }));
    check(mobile.barHidden && mobile.dock && mobile.headings === 5, width + 'px: mobile dock intact and More organized');
    check(mobile.menuItems.length === 7 && mobile.menuItems.includes('historial') && mobile.menuItems.includes('ajustes'),
      width + 'px: every secondary route remains in More');
    check(!mobile.overflow, width + 'px: no page-wide horizontal overflow');
    for (const target of ['historial', 'ajustes']) {
      await page.locator('#mobileMoreBtn').click();
      await page.locator('#mobileMoreOv [data-mobile-more-tab="' + target + '"]').click();
      await page.waitForFunction(tab => location.hash === '#' + tab, target);
      const active = await page.evaluate(() => ({
        tab: document.querySelector('#tabnav .tabbtn.active')?.dataset.tab,
        more: document.getElementById('mobileMoreBtn').classList.contains('active'),
        closed: document.getElementById('mobileMoreOv').hidden
      }));
      check(active.tab === target && active.more && active.closed,
        width + 'px: More route ' + target + ' navigates and stays highlighted');
    }
    await context.close();
  }
  check(jsErrors.length === 0, 'no JavaScript runtime errors', jsErrors.join(' | '));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('fallos: ' + failures.length);
if (failures.length) process.exit(1);
console.log('PASS navegacion-grupos');
