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
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const ATMOSPHERES = new Set(['calma','estudio','precision','noche']);
  const FONTS = { system: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', humanist: '"IBM Plex Sans", "Avenir Next", "Trebuchet MS", sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  const TEXT = { small: [14,12,12.5], normal: [15,12.5,13], large: [17,14,14.5] };
  const DENSITIES = new Set(['compact','balanced','comfortable']);
  const parse = value => {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { mode: MODES.has(obj.mode) ? obj.mode : DEFAULT.mode,
      accent: ACCENTS.has(obj.accent) ? obj.accent : DEFAULT.accent,
      custom: COLOR.test(obj.custom || '') ? obj.custom.toLowerCase() : DEFAULT.custom,
      atmosphere: ATMOSPHERES.has(obj.atmosphere) ? obj.atmosphere : 'calma',
      font: Object.hasOwn(FONTS,obj.font) ? obj.font : 'system',
      text: Object.hasOwn(TEXT,obj.text) ? obj.text : 'normal',
      density: DENSITIES.has(obj.density) ? obj.density : 'balanced' };
  };
  const read = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      // Older Vista preferences remain the starting density until the first explicit choice.
      if (raw && !raw.density) {
        const legacy = JSON.parse(localStorage.getItem('cabina-view-prefs:v1') || '{}');
        if (DENSITIES.has(legacy.density)) raw.density = legacy.density;
      }
      return parse(raw);
    } catch (_) { return parse(DEFAULT); }
  };
  let prefs = read(), draft = {...prefs}, conflict = false;
  const byId = id => document.getElementById(id);
  function rgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
  function hex(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2,'0')).join(''); }
  function luminance(channels) {
    const c=channels.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
    return .2126*c[0]+.7152*c[1]+.0722*c[2];
  }
  function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  function accessibleColor(wanted,dark) {
    const bg=rgb(dark?'#0b0e13':'#ffffff'),towards=dark?255:0,original=rgb(wanted);
    if(contrast(original,bg)>=4.5)return wanted;
    for(let i=1;i<=100;i++){const c=original.map(v=>v*(1-i/100)+towards*i/100);if(contrast(c,bg)>=4.5)return hex(c);}
    return dark?'#ffffff':'#000000';
  }
  function effectiveMode(choice=prefs) { return choice.mode==='system'?(media&&media.matches?'dark':'light'):choice.mode; }
  function effectiveAccent(choice,dark) {
    const defaults={calma:'#176f65',estudio:'#80582e',precision:'#1d4ed8',noche:'#406da6'};
    const colors={default:dark?'#8dcabd':defaults[choice.atmosphere],blue:dark?'#8cb4ff':'#1d4ed8',teal:dark?'#70e0cf':'#176f65',violet:dark?'#c7a6ff':'#6d28d9',custom:choice.custom};
    return accessibleColor(colors[choice.accent],dark);
  }
  function palette(choice) {
    const dark=effectiveMode(choice)==='dark',warm=choice.atmosphere==='estudio';
    return dark?{bg:'#0b0e13',surface:'#111720',line:'#344253',text:'#e8ecf2',muted:'#b2bdcc',good:'#83d6ac',warn:'#f2bd75',warnBg:'#30261c'}:
      {bg:warm?'#f5f2ec':'#f3f5f8',surface:warm?'#fffdf8':'#ffffff',line:warm?'#ddd6ca':'#dde3ec',text:'#121a26',muted:'#4a5568',good:'#166534',warn:'#92400e',warnBg:'#fff4e5'};
  }
  function apply() {
    const dark=effectiveMode()==='dark',scheme=dark?'dark':'light',color=effectiveAccent(prefs,dark),channels=rgb(color),p=palette(prefs);
    root.dataset.cabinaTheme=scheme;root.dataset.cabinaAccent=prefs.accent;root.dataset.cabinaAtmosphere=prefs.atmosphere;
    const set=(k,v)=>root.style.setProperty(k,v,'important');
    set('--accent',color);set('--accent-ink',contrast(channels,[255,255,255])>=4.5?'#f8fafc':'#0b0e13');
    set('--accent-soft','rgba('+channels.join(',')+',.12)');set('--ui-focus','0 0 0 3px rgba('+channels.join(',')+',.18)');
    set('--font-ui',FONTS[prefs.font]);set('--font-display',FONTS[prefs.font]);
    ['body','meta','label'].forEach((name,i)=>set('--appearance-'+name,TEXT[prefs.text][i]+'px'));
    if (!dark && prefs.atmosphere==='estudio') {set('--bg',p.bg);set('--surface',p.surface);set('--line',p.line);}
    else ['--bg','--surface','--line'].forEach(k=>root.style.removeProperty(k));
    if(document.body)document.body.dataset.density=prefs.density;
    const metaColor=document.querySelector('meta[name="theme-color"]'),metaScheme=document.querySelector('meta[name="color-scheme"]');
    if(metaColor)metaColor.setAttribute('content',p.bg);if(metaScheme)metaScheme.setAttribute('content',scheme);
    document.dispatchEvent(new CustomEvent('cabina:appearance',{detail:{density:prefs.density}}));
  }
  const dirty = () => JSON.stringify(draft)!==JSON.stringify(prefs);
  function render(message,error=false) {
    const status=byId('cabAppearanceStatus'),preview=byId('cabAppearancePreview'),pending=dirty();
    const fields={Mode:'mode',Accent:'accent',Custom:'custom',Font:'font',Text:'text',Density:'density'};
    Object.entries(fields).forEach(([id,key])=>{const el=byId('cabAppearance'+id);if(el)el.value=draft[key];});
    document.querySelectorAll('[name="cabAtmosphere"]').forEach(el=>el.checked=el.value===draft.atmosphere);
    document.querySelectorAll('[name="cabAccent"]').forEach(el=>el.checked=el.value===draft.accent);
    if(byId('cabAppearanceCustomField'))byId('cabAppearanceCustomField').hidden=draft.accent!=='custom';
    if(byId('cabAppearanceCancel'))byId('cabAppearanceCancel').disabled=!pending&&!conflict;
    if(byId('cabAppearanceApply'))byId('cabAppearanceApply').disabled=!pending||conflict;
    if(status){status.textContent=message||(pending?'Vista previa · sin aplicar':'Sin cambios pendientes');status.dataset.error=String(error);}
    document.querySelectorAll('[name="cabAccent"]').forEach(el => el.closest('.accent-swatch').style.setProperty('--swatch',effectiveAccent({...draft,accent:el.value},effectiveMode(draft)==='dark')));
    if(preview){const p=palette(draft);Object.entries({bg:p.surface,line:p.line,text:p.text,muted:p.muted,good:p.good,warn:p.warn,'warn-bg':p.warnBg,font:FONTS[draft.font],size:TEXT[draft.text][0]+'px',row:({compact:8,balanced:14,comfortable:20})[draft.density]+'px'}).forEach(([k,v])=>preview.style.setProperty('--preview-'+k,v));}
  }
  function persist(next) {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next));return true; }catch(_){return false;}
  }
  function commit() {
    if(conflict)return;
    if(!persist(draft)){render('No se pudo guardar. Tu apariencia anterior sigue activa; vuelve a pulsar Aplicar para reintentar.',true);return;}
    prefs={...draft};apply();render('Guardado en este dispositivo');
  }
  function setDensity(density) {
    if(conflict||!DENSITIES.has(density))return false;
    const next=parse({...prefs,density});
    if(!persist(next))return false;
    const wasDirty=dirty();prefs=next;draft={...draft,density};apply();render(wasDirty?undefined:'Guardado en este dispositivo');return true;
  }
  function mount() {
    if(!byId('cabAppearanceMode'))return;
    render();apply();
    const fields={Mode:'mode',Accent:'accent',Custom:'custom',Font:'font',Text:'text',Density:'density'};
    Object.entries(fields).forEach(([id,key])=>byId('cabAppearance'+id).addEventListener(key==='custom'?'input':'change',e=>{draft=parse({...draft,[key]:e.target.value,...(key==='custom'?{accent:'custom'}:{})});render();}));
    document.querySelectorAll('[name="cabAtmosphere"]').forEach(el=>el.addEventListener('change',()=>{if(!el.checked)return;draft=parse({...draft,atmosphere:el.value,mode:el.value==='noche'?'dark':'light',accent:'default'});render();}));
    document.querySelectorAll('[name="cabAccent"]').forEach(el=>el.addEventListener('change',()=>{if(el.checked){draft.accent=el.value;render();}}));
    byId('cabAppearanceApply').addEventListener('click',commit);
    byId('cabAppearanceCancel').addEventListener('click',()=>{if(conflict)prefs=read();draft={...prefs};conflict=false;apply();render('Cambios descartados');});
    byId('cabAppearanceReset').addEventListener('click',()=>{draft=parse(DEFAULT);render();});
  }
  apply();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  if(media){const onSystemChange=()=>{if(prefs.mode==='system')apply();render();};if(media.addEventListener)media.addEventListener('change',onSystemChange);else if(media.addListener)media.addListener(onSystemChange);}
  addEventListener('storage',event=>{
    if(event.key!==STORAGE_KEY&&event.key!==null)return;
    if(dirty()){conflict=true;render('La apariencia cambió en otra pestaña. Pulsa Cancelar para cargarla antes de editar.',true);return;}
    prefs=read();draft={...prefs};apply();render();
  });
  Object.defineProperty(window,'CabinaAppearance',{value:Object.freeze({get:()=>({...prefs,effective:effectiveMode()}),setDensity}),configurable:false,writable:false});
})();
