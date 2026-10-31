/* Cabina: actualización explícita y no destructiva. No toca datos ni caches. */
(() => {
  'use strict';
  const mount = () => {
    const check = document.getElementById('cabUpdateCheck');
    const apply = document.getElementById('cabUpdateApply');
    const status = document.getElementById('cabUpdateStatus');
    if (!check || !apply || !status) return;
    const say = message => { status.textContent = message; };
    let available = false;
    check.addEventListener('click', async () => {
      check.disabled = true;
      apply.hidden = true;
      available = false;
      say('Consultando el servidor…');
      try {
        if (!navigator.onLine) throw new Error('Sin conexión. No es posible comprobar la versión.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        let response;
        try {
          response = await fetch('./index.html?cabina_check=' + Date.now(), {
            cache: 'no-store', signal: controller.signal
          });
        } finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('El servidor respondió ' + response.status);
        await response.text();
        // A successful request proves server availability, not a newer release.
        const registration = 'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration() : null;
        if (registration) await registration.update();
        available = true;
        apply.hidden = false;
        say('Servidor disponible. Puedes recargar la última versión publicada. Los cambios sin guardar deben completarse antes.');
      } catch (error) {
        say(error.name === 'AbortError' ? 'La comprobación tardó demasiado. Intenta de nuevo.' : error.message);
      } finally { check.disabled = false; }
    });
    apply.addEventListener('click', () => {
      if (!available) return;
      if (!confirm('¿Ya guardaste tus operaciones y cambios pendientes? La aplicación se recargará.')) return;
      location.reload();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
