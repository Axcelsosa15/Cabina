/* EL TRABAJADOR DE SERVICIO · la página abre sin conexión.
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ RESUELVE, Y QUÉ NO. Resuelve que la página ABRA sin red: el metro, un
   parking, un avión. NO resuelve que tus datos viajen: sin cuenta viven en el
   localStorage de ese navegador y ya estaban offline; con cuenta, una escritura
   sin red falla y la app lo dice en la barra —no hay cola de reintentos aquí, y
   no se finge que la haya—.

   LA REGLA QUE GOBIERNA TODO ESTE FICHERO: el código va PRIMERO A LA RED.
   index.html ES la aplicación entera, así que una copia en caché que gane a la
   red deja al usuario operando con una versión vieja de las reglas de su firma
   sin saberlo. Por eso las navegaciones y el HTML no se sirven de caché mientras
   haya red; la caché es SÓLO el plan B de cuando no la hay. Los iconos y el
   manifiesto sí van de caché: cambian cada varios meses y no deciden nada.

   LO QUE NUNCA SE TOCA: el proyecto Supabase. Ni sus datos, ni su auth, ni sus
   capturas. Cachear una respuesta de la nube sería servir el journal de una
   sesión a la siguiente, y la frontera entre dos usuarios de este navegador
   dejaría de estar donde está escrita —en la base, con RLS—. Se deja pasar a la
   red sin intervenir: si no hay red, la app ya sabe decirlo.

   Vigilado por test/pwa.mjs. */

var CACHE = 'cabina-v1';

/* El casco: lo mínimo para que la página pinte sin red. Es exactamente lo que
   publica `pagina.yml`; si divergen, test/pwa.mjs se pone rojo. */
var CASCO = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './og.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './privacidad.html',
  './terminos.html',
  './seguridad.html',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* Tolerante a propósito: que un icono falte no puede impedir que la
         página quede disponible sin red. El casco completo lo exige la prueba,
         no el navegador del usuario. */
      return Promise.all(CASCO.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function deLaRedPrimero(req) {
  return fetch(req).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copia = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copia); });
    }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hay) {
        if (hay) return hay;
        /* Una navegación a cualquier ruta cae en la página: es una sola. */
        if (req.mode === 'navigate') return c.match('./index.html');
        return new Response('', { status: 504, statusText: 'sin conexión' });
      });
    });
  });
}

function deLaCachePrimero(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hay) {
      var red = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      if (hay) { red.catch(function () {}); return hay; }
      return red.then(function (res) { return res || new Response('', { status: 504, statusText: 'sin conexión' }); });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (_) { return; }

  /* La nube, nunca. Ni datos, ni sesión, ni capturas. */
  if (/(^|\.)supabase\.(co|in|com)$/.test(url.hostname)) return;

  /* Lo de fuera tampoco: las fuentes de Google son el único origen externo de
     la página y las resuelve el propio navegador con su caché. Un trabajador
     que guarde respuestas opacas de terceros es superficie nueva a cambio de
     nada medible. */
  if (url.origin !== self.location.origin) return;

  var esCodigo = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname);
  e.respondWith(esCodigo ? deLaRedPrimero(req) : deLaCachePrimero(req));
});
