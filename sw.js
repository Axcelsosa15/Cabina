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

var CACHE = 'cabina-v2';

/* El casco: lo mínimo para que la página pinte sin red. Es exactamente lo que
   publica `pagina.yml`; si divergen, test/pwa.mjs se pone rojo. */
var CASCO = [
  './',
  './index.html',
  './app.js',
  './appearance.js',
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

/* ── COMPROBAR SI HAY VERSION NUEVA · desde AQUI, no desde la pagina ──────
   La CSP de index.html no lleva 'self' en `connect-src` —solo el proyecto
   Supabase, y test/seguridad.mjs lo exige asi— de modo que un
   `fetch('./app.js')` desde la pagina esta PROHIBIDO y falla con «Failed to
   fetch». El trabajador no esta sujeto a esa politica, y ademas es el dueño de
   la cache que hay que comparar, asi que la comparacion vive aqui y la pagina
   solo pregunta por un MessageChannel.

   EL ORDEN NO ES NEGOCIABLE: se lee la copia GUARDADA antes de pedir la red.
   Este mismo fichero reescribe la cache con lo que recibe, asi que invertirlo
   destruiria el termino de comparacion y el resultado seria siempre «estas al
   dia»: un verde que no mide nada.

   Lo que se compara son los ficheros de CODIGO del propio origen. Nada de
   datos: la nube no se cachea, asi que no puede estar «desactualizada». */
function huellaDe(txt) {
  if (self.crypto && self.crypto.subtle && self.TextEncoder) {
    return self.crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (b) {
      var u = new Uint8Array(b), out = '';
      for (var i = 0; i < 5; i++) out += ('0' + u[i].toString(16)).slice(-2);
      return out;
    }).catch(function () { return fnvDe(txt); });
  }
  return Promise.resolve(fnvDe(txt));
}
function fnvDe(txt) {
  var h = 0x811c9dc5;
  for (var i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
function comparaPublicado() {
  var ARCH = ['./index.html', './app.js', './appearance.js'];
  return caches.open(CACHE).then(function (c) {
    var distintos = [], comprobados = 0, sinCache = [];
    return ARCH.reduce(function (cad, f) {
      return cad.then(function () {
        return c.match(f).then(function (hay) { return hay ? hay.text() : null; }).then(function (local) {
          if (local == null) { sinCache.push(f.replace('./', '')); return; }
          return fetch(f, { cache: 'reload' }).then(function (res) {
            if (!res || !res.ok) return;
            var copia = res.clone();
            return res.text().then(function (red) {
              comprobados++;
              return Promise.all([huellaDe(local), huellaDe(red)]).then(function (h) {
                if (h[0] === h[1]) return;
                distintos.push(f.replace('./', ''));
                /* Ya se tiene el cuerpo nuevo: se guarda, para que una recarga
                   sin red no vuelva a la version vieja. */
                return c.put(f, copia).catch(function () {});
              });
            });
          }).catch(function () {});
        });
      });
    }, Promise.resolve()).then(function () {
      return { distintos: distintos, comprobados: comprobados, sinCache: sinCache };
    });
  });
}
self.addEventListener('message', function (e) {
  var d = e.data;
  if (!d || d.tipo !== 'cabina-version') return;
  var puerto = e.ports && e.ports[0];
  if (!puerto) return;
  e.waitUntil(comparaPublicado().then(
    function (r) { puerto.postMessage(r); },
    function (err) { puerto.postMessage({ error: String((err && err.message) || err) }); }
  ));
});

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
