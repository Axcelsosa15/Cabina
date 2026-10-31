/* Cabina · appearance bootstrap.
   Runs synchronously in <head>, before CSS and before the first paint.
   No trading state, network requests, auth, or backend migrations. */
(() => {
  'use strict';
  const STORAGE_KEY = 'cabina-appearance:v1';
  const MODES = new Set(['light', 'dark', 'system']);
  const ACCENTS = new Set(['default', 'blue', 'teal', 'violet', 'custom']);
  const COLOR = /^#[0-9a-fA-F]{6}$/;
  const DEFAULT = { mode: 'light', accent: 'default', custom: '#1d4ed8' };
  const root = document.documentElement;
  try {
    if (localStorage.getItem('cabina-sidebar-collapsed:v1') === 'true') root.dataset.sidebarCollapsed = 'true';
  } catch (_) {}
  // Navigation must remain usable even if the main application cannot initialize.
  function syncSidebar() {
    const button = document.getElementById('sidebarToggle');
    if (!button) return;
    const collapsed = root.dataset.sidebarCollapsed === 'true';
    const label = collapsed ? 'Abrir menú lateral' : 'Cerrar menú lateral';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('#sidebarToggle');
    if (!button) return;
    // Capture also protects against a previous cached app binding the old handler.
    event.preventDefault();
    event.stopImmediatePropagation();
    const collapsed = root.dataset.sidebarCollapsed !== 'true';
    root.dataset.sidebarCollapsed = String(collapsed);
    try { localStorage.setItem('cabina-sidebar-collapsed:v1', String(collapsed)); } catch (_) {}
    syncSidebar();
  }, true);
  document.addEventListener('DOMContentLoaded', syncSidebar, { once: true });
  addEventListener('storage', event => {
    if (event.key !== 'cabina-sidebar-collapsed:v1' && event.key !== null) return;
    root.dataset.sidebarCollapsed = String(event.newValue === 'true');
    syncSidebar();
  });
  const media = typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: dark)') : null;

  const parse = value => {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      mode: MODES.has(obj.mode) ? obj.mode : DEFAULT.mode,
      accent: ACCENTS.has(obj.accent) ? obj.accent : DEFAULT.accent,
      custom: COLOR.test(obj.custom || '') ? obj.custom.toLowerCase() : DEFAULT.custom
    };
  };
  const read = () => {
    try { return parse(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
    catch (_) { return { ...DEFAULT }; }
  };
  let prefs = read();

  function rgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }
  function hex(channels) {
    return '#' + channels.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  function luminance(channels) {
    const c = channels.map(v => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }
  function accessibleColor(wanted, dark) {
    const bg = rgb(dark ? '#0b0e13' : '#ffffff');
    const towards = dark ? 255 : 0;
    const original = rgb(wanted);
    if (contrast(original, bg) >= 4.5) return wanted;
    for (let i = 1; i <= 100; i++) {
      const amount = i / 100;
      const candidate = original.map(v => v * (1 - amount) + towards * amount);
      if (contrast(candidate, bg) >= 4.5) return hex(candidate);
    }
    return dark ? '#ffffff' : '#000000';
  }
  function effectiveMode() {
    return prefs.mode === 'system' ? (media && media.matches ? 'dark' : 'light') : prefs.mode;
  }
  function effectiveAccent(dark) {
    const colors = {
      default: dark ? '#70e0cf' : '#1d4ed8',
      blue: dark ? '#8cb4ff' : '#1d4ed8',
      teal: dark ? '#70e0cf' : '#176f65',
      violet: dark ? '#c7a6ff' : '#6d28d9',
      custom: prefs.custom
    };
    return accessibleColor(colors[prefs.accent], dark);
  }
  function apply() {
    const dark = effectiveMode() === 'dark';
    const scheme = dark ? 'dark' : 'light';
    const color = effectiveAccent(dark);
    const channels = rgb(color);
    const ink = contrast(channels, [255, 255, 255]) >= 4.5 ? '#f8fafc' : '#0b0e13';
    root.dataset.cabinaTheme = scheme;
    root.dataset.cabinaAccent = prefs.accent;
    root.style.setProperty('--accent', color, 'important');
    root.style.setProperty('--accent-ink', ink, 'important');
    root.style.setProperty('--accent-soft', 'rgba(' + channels.join(',') + ',.12)', 'important');
    root.style.setProperty('--ui-focus', '0 0 0 3px rgba(' + channels.join(',') + ',.18)', 'important');
    const metaColor = document.querySelector('meta[name="theme-color"]');
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaColor) metaColor.setAttribute('content', dark ? '#0b0e13' : '#f7f9fc');
    if (metaScheme) metaScheme.setAttribute('content', scheme);
    return { theme: scheme, color };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); return true; }
    catch (_) { return false; }
  }
  function render(statusMessage) {
    const mode = document.getElementById('cabAppearanceMode');
    const accent = document.getElementById('cabAppearanceAccent');
    const custom = document.getElementById('cabAppearanceCustom');
    const customField = document.getElementById('cabAppearanceCustomField');
    const status = document.getElementById('cabAppearanceStatus');
    const sample = document.getElementById('cabAppearanceSample');
    const info = apply();
    if (mode) mode.value = prefs.mode;
    if (accent) accent.value = prefs.accent;
    if (custom) custom.value = prefs.custom;
    if (customField) customField.hidden = prefs.accent !== 'custom';
    if (sample) sample.textContent = info.theme === 'dark' ? 'Oscuro clásico' : 'Claro minimalista';
    if (status) status.textContent = statusMessage || 'Preferencia guardada en este navegador.';
  }
  function update(next) {
    prefs = parse({ ...prefs, ...next });
    render(save() ? 'Apariencia guardada en este navegador.' :
      'Se aplica ahora, pero el navegador impidió guardar esta preferencia.');
  }
  function mount() {
    const mode = document.getElementById('cabAppearanceMode');
    const accent = document.getElementById('cabAppearanceAccent');
    const custom = document.getElementById('cabAppearanceCustom');
    if (!mode || !accent || !custom) return;
    render();
    mode.addEventListener('change', () => update({ mode: mode.value }));
    accent.addEventListener('change', () => update({ accent: accent.value }));
    custom.addEventListener('input', () => update({ custom: custom.value, accent: 'custom' }));
    const reset = document.getElementById('cabAppearanceReset');
    if (reset) reset.addEventListener('click', () => update(DEFAULT));
  }
  // Apply the stored choice before CSS and DOM content can be painted.
  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else mount();
  if (media) {
    const onSystemChange = () => { if (prefs.mode === 'system') render(); };
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }
  addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) {
      prefs = read();
      render();
    }
  });
  Object.defineProperty(window, 'CabinaAppearance', {
    value: Object.freeze({ get: () => ({ ...prefs, effective: effectiveMode() }) }),
    configurable: false, writable: false
  });
})();
