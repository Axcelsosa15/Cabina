# Ajustes · Versión y actualizaciones

Fecha: 2026-10-31 · cubierto por `test/actualizacion.mjs`, con fila propia en la compuerta.

## Qué problema resuelve, y cuál no

Cabina sirve el **código** de la red primero (`sw.js`), así que al abrirla con
conexión ya traes lo publicado. Este panel existe para los casos en que eso no
basta:

- la abriste sin red y estás corriendo la copia guardada;
- la tienes instalada como app y lleva días abierta sin recargar;
- quieres comprobarlo **antes** de operar, en vez de suponerlo.

Lo que **no** resuelve: nada sobre tus datos. La nube no se cachea nunca, así
que no puede estar desactualizada. Comprobar no lee, no escribe y no toca
operaciones, cuentas, capturas ni sesión.

## No hay número de versión, y por eso hay huella

No existe paso de compilación que escriba una versión, así que un número sería
un número que nadie incrementa. Lo que sí es comprobable es la **huella** del
código que esta copia tiene cargado: SHA-256 de `app.js`, los primeros cinco
bytes. Dos payloads distintos dan huellas distintas, que es todo lo que hace
falta para identificar una copia.

Sin WebCrypto —contexto no seguro— se usa FNV-1a. Es identidad, no seguridad.

## Por qué la comparación vive en el trabajador de servicio

La CSP de `index.html` es `connect-src https://…supabase.co`, **sin `'self'`**, y
`test/seguridad.mjs` lo exige así: la página no habla con nadie que no sea el
proyecto Supabase. Consecuencia directa: desde la página, `fetch('./app.js')`
falla con «Failed to fetch». No es un bug, es la política haciendo su trabajo.

El trabajador de servicio no está sujeto a esa política y además es el dueño de
la caché que hay que comparar, así que la comparación vive ahí y la página sólo
pregunta por un `MessageChannel`. Eso obligó a estrechar el invariante de
`postMessage` en `test/seguridad.mjs`: se sigue prohibiendo hablar con una
ventana y escuchar mensajes en la página, y se permite el único canal
mismo-origen que existe. El motivo está escrito junto a la regla.

## El orden de la comparación no es negociable

Primero se lee la copia **guardada**, después se pide la red. `sw.js` reescribe
su caché con lo que recibe, así que invertirlo destruiría el término de
comparación y el botón diría siempre «estás al día»: un verde que no mide nada,
que es peor que no tener botón.

`test/actualizacion.mjs` §2 exige que `app.js` esté en la caché antes de
publicar nada nuevo, precisamente porque es la condición que hace válido a §4.

## Qué dice cada resultado

| Estado | Significa |
|---|---|
| `al día · HH:MM` | los archivos comparados son idénticos a los publicados |
| `hay versión nueva` | difieren, y se nombran cuáles; aparece «Actualizar y recargar» |
| `sin conexión` | no se comparó nada; lo cargado sigue funcionando |
| `no se pudo comprobar` | no hay trabajador de servicio, o su caché aún está vacía |

Los dos últimos existen para no fingir un verde. Un botón de actualizaciones
que dice «al día» sin haber comparado nada es exactamente el fallo que esta
pantalla tiene que evitar.

## Las dos tarjetas que no llevaban a ninguna parte

«Vista: módulos y densidad» y «Modo edición» describían un control de la barra
superior y no llevaban a él, mientras todas sus hermanas del inventario tienen
su botón. Ahora lo tienen, por el mismo oyente delegado que ya usaban las
demás: `data-ajuste-accion="vista"` abre el panel de Vista, y
`data-ajuste-accion="editar"` lleva a la Cabina y activa el modo edición, que
es la única pestaña donde ese botón existe.

## Recargar puede perder datos, y el botón lo sabe

Cuando una escritura falla sin entrar en la cola, la barra pinta
`SIN GUARDAR · N` y su propio texto lo dice: «están en la pantalla y en ningún
sitio más. Si recargas, se pierden». Un botón de actualizar que recargue a
ciegas en ese estado destruye exactamente eso.

«Actualizar y recargar» lee ese veredicto **ya renderizado** —no recalcula la
lógica de sincronización, que daría dos verdades sobre lo mismo— y, si hay
cambios en peligro, el primer clic avisa con la cuenta y arma el botón durante
ocho segundos en vez de recargar.

Se usa el armado de dos pulsaciones que el resto de la cabina ya emplea para lo
irreversible, y no un `confirm()`: el confirm se lee igual tanto si hay un
cambio en peligro como si no hay ninguno, y acostumbra a pulsar «sí».

La idea viene de la PR #104, que planteaba un `confirm()` antes de recargar.
Esa PR no llegó a funcionar —su comprobación hace `fetch` desde la página y la
CSP lo prohíbe— pero el riesgo que señalaba era real y aquí está cubierto, con
`test/actualizacion.mjs` §5 exigiendo que el primer clic no recargue.