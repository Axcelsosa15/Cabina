/* CABINA · contrato cromático medido en Chromium, no mediante grep de CSS.
   Cubre la misma app publicada, los dos temas, dos anchos, controles nativos,
   entradas reales de diferentes tabs y cuatro estados de edición.
   No guarda ni modifica ningún registro financiero. */
import { chromium } from 'playwright';
import { sirvePublicado } from './publicado.mjs';

const fallos = [];
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${nombre}${detalle ? '   ' + detalle : ''}`);
  if (!cond) fallos.push(nombre);
};
const server = sirvePublicado();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const navegador = await chromium.launch();
const escenarios = [
  { mode: 'light', width: 1280, accent: 'default', bg: 'rgb(255, 255, 255)', border: 'rgb(203, 213, 225)', read: 'rgb(241, 245, 249)', disabled: 'rgb(238, 242, 246)', error: 'rgb(180, 35, 24)' },
  { mode: 'light', width: 390, accent: 'violet', bg: 'rgb(255, 255, 255)', border: 'rgb(203, 213, 225)', read: 'rgb(241, 245, 249)', disabled: 'rgb(238, 242, 246)', error: 'rgb(180, 35, 24)' },
  { mode: 'dark', width: 1280, accent: 'default', bg: 'rgb(17, 26, 36)', border: 'rgb(89, 107, 128)', read: 'rgb(38, 50, 64)', disabled: 'rgb(28, 38, 50)', error: 'rgb(226, 105, 89)' },
  { mode: 'dark', width: 390, accent: 'violet', bg: 'rgb(17, 26, 36)', border: 'rgb(89, 107, 128)', read: 'rgb(38, 50, 64)', disabled: 'rgb(28, 38, 50)', error: 'rgb(226, 105, 89)' }
];
try {
  for (const caso of escenarios) {
    const ctx = await navegador.newContext({ viewport: { width: caso.width, height: 850 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(prefs => localStorage.setItem('cabina-appearance:v1', JSON.stringify(prefs)), {
      mode: caso.mode, accent: caso.accent, custom: '#1d4ed8'
    });
    const p = await ctx.newPage();
    const jsErrors = [];
    p.on('pageerror', e => jsErrors.push(e.message));
    await p.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof window.FUT !== 'undefined', null, { timeout: 20000 });

    const datos = await p.evaluate(() => {
      const probe = document.createElement('section');
      probe.id = 'colorProbe';
      probe.setAttribute('aria-label','Prueba visual de formularios');
      probe.style.cssText = 'position:relative;padding:8px;margin-top:24px';
      probe.innerHTML = `
        <label for="probeNumber">Precio</label><input id="probeNumber" type="number" inputmode="decimal" value="21450.25">
        <label for="probeError">Valor inválido</label><input id="probeError" type="text" aria-invalid="true" value="error">
        <label for="probeRead">Resultado calculado</label><input id="probeRead" type="text" readonly value="120.50">
        <label for="probeDisabled">Bloqueado</label><input id="probeDisabled" type="text" disabled value="sin editar">
        <label for="probeSelect">Cuenta</label><select id="probeSelect"><option value="1">Cuenta 1</option></select>
        <label for="probeNote">Nota</label><textarea id="probeNote" placeholder="Escribe tu tesis"></textarea>
        <label for="probeSearch">Buscar</label><input id="probeSearch" type="search" placeholder="Buscar trade">
        <label for="probeRange">Porcentaje</label><input id="probeRange" type="range">
        <label for="probeColor">Color</label><input id="probeColor" type="color" value="#ff0088">
        <label for="probeCheck">Confirmar</label><input id="probeCheck" type="checkbox">
      `;
      document.querySelector('.tab[data-tab="cabina"]')?.appendChild(probe);
      const css = sel => getComputedStyle(document.querySelector(sel));
      const root = css(':root'), normal = css('#probeNumber');
      const names = ['ftQ','ftAcct','cabAcct','qtSym','jNote','studyTitle','studyEvidence','hsQ','mxAcct'];
      return {
        theme: document.documentElement.dataset.cabinaTheme,
        accent: root.getPropertyValue('--accent').trim(),
        controlScheme: root.getPropertyValue('--control-scheme').trim(),
        bg: normal.backgroundColor, border: normal.borderTopColor, text: normal.color,
        font: normal.fontFamily, inputHeight: parseFloat(normal.minHeight), inputFont: parseFloat(normal.fontSize),
        selectBg: css('#probeSelect').backgroundColor,
        textareaBg: css('#probeNote').backgroundColor,
        searchBg: css('#probeSearch').backgroundColor,
        optionScheme: css('#probeSelect option').colorScheme,
        selectScheme: css('#probeSelect').colorScheme,
        readBg: css('#probeRead').backgroundColor,
        readOnly: document.querySelector('#probeRead').readOnly,
        disabledBg: css('#probeDisabled').backgroundColor,
        disabledOpacity: css('#probeDisabled').opacity,
        invalidBorder: css('#probeError').borderTopColor,
        invalidOutline: css('#probeError').outlineColor,
        placeColor: getComputedStyle(document.querySelector('#probeSearch'),'::placeholder').color,
        specialCmdBg: css('#cmdQ').backgroundColor,
        specialStudyBg: css('#studySearch').backgroundColor,
        checkboxAccent: css('#probeCheck').accentColor,
        rangeAccent: css('#probeRange').accentColor,
        pickerType: document.querySelector('#probeColor').type,
        actual: names.map(id=>({id,bg:css('#'+id).backgroundColor,border:css('#'+id).borderTopColor})),
        styleCount: document.querySelectorAll('style').length,
        filters: ['ftAcct','ftRange','ftSetup','ftInstr','ftSes','ftQ','hsTipo','hsAcct','hsRango','hsQ','mxAcct','mxSetup']
          .map(id=>{const el=document.getElementById(id),label=el?.closest('label');return {id,good:!!(label&&label.control===el&&label.querySelector('.cab-filter-caption')?.textContent.trim())}})
      };
    });
    const t = `${caso.mode}/${caso.accent} ${caso.width}px`;
    ok(datos.theme === caso.mode && datos.controlScheme === caso.mode,
      t+' · tema sin flash y esquema nativo correcto', datos.theme+' / '+datos.controlScheme);
    ok(datos.bg === caso.bg && datos.border === caso.border,
      t+' · superficie y borde del input', datos.bg+' / '+datos.border);
    ok(datos.selectBg === caso.bg && datos.textareaBg === caso.bg && datos.searchBg === caso.bg,
      t+' · select, textarea y búsqueda comparten superficie');
    ok(datos.readOnly && datos.readBg === caso.read && datos.readBg !== datos.bg,
      t+' · readonly distinto de editable', datos.readBg);
    ok(datos.disabledBg === caso.disabled && datos.disabledOpacity === '1',
      t+' · disabled legible sin opacidad', datos.disabledBg+' / '+datos.disabledOpacity);
    ok(datos.invalidBorder === caso.error && datos.invalidBorder !== datos.border,
      t+' · error visible junto al campo', datos.invalidBorder);
    ok(datos.selectScheme === caso.mode && datos.optionScheme === caso.mode,
      t+' · opciones nativas legibles en ambos temas', datos.selectScheme+' / '+datos.optionScheme);
    ok(datos.actual.every(x=>x.bg===caso.bg && x.border===caso.border),
      t+' · campos REALES de Cabina/Futuros/Estudio/Historial/Edge',
      datos.actual.filter(x=>x.bg!==caso.bg||x.border!==caso.border).map(x=>x.id+':'+x.bg+'/'+x.border).join(','));
    ok(datos.placeColor !== datos.text && datos.placeColor !== datos.bg,
      t+' · placeholder distinguible', datos.placeColor);
    ok(datos.specialCmdBg !== caso.bg && datos.specialStudyBg !== caso.bg,
      t+' · buscadores integrados no se convierten en cajas dobles',
      datos.specialCmdBg+' / '+datos.specialStudyBg);
    ok(datos.checkboxAccent === datos.rangeAccent && datos.checkboxAccent !== 'auto',
      t+' · checkbox y slider respetan accent personalizable', datos.checkboxAccent);
    ok(datos.pickerType === 'color', t+' · el selector de color conserva su tipo nativo');
    ok(datos.filters.every(x=>x.good),t+' · doce filtros mantienen label accesible');
    ok(datos.styleCount === 5, t+' · siguen cinco bloques style');
    ok(!jsErrors.length, t+' · sin errores JS', jsErrors.join(' | '));

    await p.locator('#probeNumber').focus();
    const focus = await p.locator('#probeNumber').evaluate(el=>({border:getComputedStyle(el).borderTopColor,
      outline:getComputedStyle(el).outlineColor, bg:getComputedStyle(el).backgroundColor}));
    const accentRGB = await p.evaluate(() => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const parts = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
      return `rgb(${parts.join(', ')})`;
    });
    ok(focus.border === accentRGB && focus.outline === accentRGB,
      t+' · foco usa color elegido, no verde/azul fijo', JSON.stringify({focus,accentRGB}));
    if(caso.width === 390){
      ok(datos.inputHeight >= 44 && datos.inputFont >= 16,
        t+' · tamaño móvil antizoom Safari',datos.inputHeight+'px / '+datos.inputFont+'px');
    }
    await ctx.close();
  }
} finally {
  await navegador.close();
  await new Promise(r=>server.close(r));
}
console.log('fallos: '+fallos.length);
if (fallos.length) process.exit(1);
console.log('PASS data-entry-ui · colores computados de controles y estados en ambos temas');
