/* Concepto A · contrato visual de data entry (navegador real).
   Prueba tokens COMPUTADOS, no hex presentes en texto, y estados de
   error, lectura, selección y ergonomía móvil. No toca datos. */
import { chromium } from 'playwright';
const errores = [];
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${nombre}${detalle ? '   ' + detalle : ''}`);
  if (!cond) errores.push(nombre);
};
const navegador = await chromium.launch();
try {
  for (const ancho of [1280, 390]) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 850 } });
    const pagina = await contexto.newPage();
    await pagina.goto('file://' + process.cwd() + '/../index.html', { waitUntil: 'domcontentloaded' });
    const labels = await pagina.evaluate(() =>
      ['ftAcct','ftRange','ftSetup','ftInstr','ftSes','ftQ',
       'hsTipo','hsAcct','hsRango','hsQ','mxAcct','mxSetup']
        .map(id => {
          const input = document.getElementById(id);
          const label = input?.closest('label');
          return {id, associated: Boolean(label && label.control === input),
                  caption: label?.querySelector('.cab-filter-caption')?.textContent.trim()};
        })
    );
    ok(labels.every(item => item.associated && item.caption),
      `${ancho}px · doce filtros tienen etiqueta visible y asociada`,
      labels.filter(item => !item.associated || !item.caption).map(item => item.id).join(', '));
    const estado = await pagina.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:4px;left:4px;z-index:999999;background:white;padding:8px';
      probe.innerHTML = `
        <label for="uiProbe">Precio</label>
        <input id="uiProbe" type="number" inputmode="decimal" value="21450.25">
        <label for="uiProbeError">Valor inválido</label>
        <input id="uiProbeError" aria-invalid="true" value="error">
        <label for="uiProbeRead">Resultado calculado</label>
        <input id="uiProbeRead" readonly value="120.50">
        <label for="uiProbeNote">Nota de la operación</label>
        <textarea id="uiProbeNote" rows="2"></textarea>
        <label for="uiProbeSelect">Cuenta</label>
        <select id="uiProbeSelect"><option value="demo">Demo</option></select>
      `;
      document.body.appendChild(probe);
      const css = (sel) => getComputedStyle(document.querySelector(sel));
      const root = css(':root');
      const normal = css('#uiProbe'), error = css('#uiProbeError'), read = css('#uiProbeRead');
      return {
        accent: root.getPropertyValue('--accent').trim(),
        positive: root.getPropertyValue('--positive').trim(),
        negative: root.getPropertyValue('--negative').trim(),
        inputBg: normal.backgroundColor,
        inputHeight: parseFloat(normal.minHeight),
        inputFont: parseFloat(normal.fontSize),
        mono: normal.fontFamily,
        invalidBorder: error.borderTopColor,
        readonlyBg: read.backgroundColor,
        readonlyEditable: document.querySelector('#uiProbeRead').readOnly,
        styleCount: document.querySelectorAll('style').length
      };
    });
    ok(estado.accent.toLowerCase() === '#1d4ed8', `${ancho}px · blue de interacción efectivo`, estado.accent);
    ok(estado.positive.toLowerCase() === '#166534' && estado.negative.toLowerCase() === '#b42318',
      `${ancho}px · profit y loss semánticos`);
    ok(estado.inputBg === 'rgb(255, 255, 255)', `${ancho}px · input neutro`, estado.inputBg);
    ok(estado.invalidBorder === 'rgb(180, 35, 24)', `${ancho}px · error junto al input`, estado.invalidBorder);
    ok(estado.readonlyEditable && estado.readonlyBg === 'rgb(241, 245, 249)',
      `${ancho}px · solo lectura distinto de editable`, estado.readonlyBg);
    ok(estado.mono.includes('Mono') || estado.mono.includes('mono'),
      `${ancho}px · magnitudes con fuente monoespaciada`, estado.mono);
    if (ancho === 390) {
      ok(estado.inputHeight >= 44 && estado.inputFont >= 16,
        'mobile · objetivo táctil y sin zoom Safari', `${estado.inputHeight}px / ${estado.inputFont}px`);
    }
    ok(estado.styleCount === 5, `${ancho}px · sin nueva capa CSS`, String(estado.styleCount));

    // Reproducción del fallo en iPhone: al enfocar, el textarea volvía a negro.
    for (const id of ['uiProbe', 'uiProbeNote', 'uiProbeSelect']) {
      await pagina.locator('#' + id).focus();
      await pagina.waitForFunction(key => getComputedStyle(document.getElementById(key)).backgroundColor === 'rgb(255, 255, 255)', id, { timeout: 1200 }).catch(() => {});
      const visto = await pagina.evaluate(key => {
        const css = getComputedStyle(document.getElementById(key));
        return { bg: css.backgroundColor, color: css.color, border: css.borderTopColor,
          scheme: css.colorScheme, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
      }, id);
      ok(visto.bg === 'rgb(255, 255, 255)' && visto.color === 'rgb(23, 35, 52)',
        `${ancho}px · ${id} sigue claro al recibir foco`, JSON.stringify(visto));
      ok(visto.border === 'rgb(29, 78, 216)' && visto.scheme === 'light',
        `${ancho}px · ${id} usa foco azul y controles nativos claros`, JSON.stringify(visto));
    }
    // El arreglo no debe borrar el tema oscuro original.
    await pagina.evaluate(() => { document.documentElement.dataset.cabinaTheme = 'dark'; });
    await pagina.locator('#uiProbeNote').focus();
    await pagina.waitForFunction(() => getComputedStyle(document.getElementById('uiProbeNote')).backgroundColor === 'rgb(14, 23, 30)', null, { timeout: 1200 }).catch(() => {});
    const oscuro = await pagina.evaluate(() => {
      const css = getComputedStyle(document.getElementById('uiProbeNote'));
      return { bg: css.backgroundColor, scheme: css.colorScheme };
    });
    ok(oscuro.bg === 'rgb(14, 23, 30)' && oscuro.scheme === 'dark',
      `${ancho}px · textarea enfocado conserva tema oscuro`, JSON.stringify(oscuro));
    await contexto.close();
  }
} finally {
  await navegador.close();
}
if (errores.length) process.exit(1);
console.log('PASS data-entry-ui · estados visuales comprobados en Chromium');
