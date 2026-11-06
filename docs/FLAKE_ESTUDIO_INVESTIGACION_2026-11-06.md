# `estudio-investigacion` no es un flake de test · 6 de noviembre de 2026

## El síntoma

`test/estudio-investigacion.mjs` falla en la línea 98, esperando la tarjeta del
documento que acaba de guardar:

    locator.waitFor: Timeout 20000ms exceeded.
      - waiting for locator('#studyGrid .study-card[data-study-doc-id="research_…"]')

Frecuencia medida en este contenedor: **unos 7 rojos en ~35 pasadas (≈20 %)**,
con y sin los cambios de Visual System 2.0, así que **no es de esa rama**. Sube
con la carga de la máquina: se reproduce más cuando corre la suite entera o con
los núcleos ocupados, y en varias tandas de 4 y 5 pasadas en reposo no apareció
ni una vez.

## Lo que está medido

El camino sano, con un `localStorage.setItem` instrumentado antes de la primera
carga. Tres escrituras, `longitud/documentos`:

    6653/0  →  9555/1  →  9982/2        final 9982 · #studyTotal = "2"

La pasada fallida, leída **después** de la recarga:

| Qué | Valor |
| --- | --- |
| Longitud del snapshot | **6408** |
| Documentos en `research` | **ninguno** |
| `#studyTotal` | `"0"` |
| `#studyGrid` | sólo el hueco `.study-empty` |

Y el dato que cambia la lectura del problema: **6408 es MENOR que 6653**, la
primera de las tres escrituras del camino sano. O sea que el snapshot no se
quedó a medias: está en un estado **anterior a que se guardara el primer
documento**, pese a que el propio test había comprobado, antes de recargar, que
el snapshot contenía el id y los títulos de los dos documentos:

```js
await p.waitForFunction(id => {
  const snapshot = localStorage.getItem('cabina-mnq:v1') || '';
  return snapshot.includes(id) && snapshot.includes('Research alpha')
      && snapshot.includes('Research beta');
}, doc1Id, { timeout: 15000, polling: 100 });
```

Esa comprobación pasó —el fallo llega después, en la línea 98—, así que entre
«el snapshot tiene los dos documentos» y «el snapshot no tiene ninguno» hay una
escritura que los borra. En las pasadas sanas, tras la recarga **no hay ninguna
escritura** (`saves: []`), así que el culpable no está en el arranque.

## Por qué esto importa más que un rojo intermitente

Si una escritura con estado viejo puede sobreescribir un snapshot que ya tenía
los documentos, **un usuario puede perder investigación guardada**. La pantalla
diría «guardado» y el documento no estaría. Es la otra mitad de la regla que
este repositorio ya escribió —«un cambio que no se guardó no puede parecer
guardado»—: un cambio que SÍ se guardó tampoco puede desguardarse solo.

Mientras no se establezca la causa, el alcance es desconocido: se vio en
ESTUDIO porque es la pestaña que este test ejercita, no porque sea la única que
escribe el snapshot.

## Lo que NO está establecido

**La causa raíz.** No se capturó la traza de la escritura que borra los
documentos: el `setItem` instrumentado en la primera carga sólo registró las
tres escrituras sanas en las pasadas que salieron verdes, y la fallida que sí se
capturó se leyó después de la recarga, cuando el daño ya estaba hecho.

Lo que falta es una reproducción **con el hook puesto y la pasada en rojo a la
vez**. La vía más prometedora no es cargar la CPU con bucles —se intentó y
apareció 1 vez de 3— sino reproducir las condiciones de la suite completa, donde
compiten varios Chromium por memoria y E/S, no sólo por CPU.

## Cómo seguir

El parche de instrumentación, tal cual, sobre `test/estudio-investigacion.mjs`.
Va **antes** del `goto` de la primera carga, para que el hook sobreviva a la
recarga:

```js
await p.addInitScript(() => {
  window.__saves = [];
  const proto = Object.getPrototypeOf(localStorage);
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (k === 'cabina-mnq:v1') {
      let cuantos = 0;
      try { const o = JSON.parse(v); const r = o && o.research;
            cuantos = r ? (Array.isArray(r) ? r.length : Object.keys(r).length) : 0; }
      catch (e) { cuantos = -1; }
      window.__saves.push({ len: String(v).length, research: cuantos,
        ms: Math.round(performance.now()),
        pila: (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().slice(0, 100)) });
    }
    return orig.call(this, k, v);
  };
});
```

Y leerlo justo antes del `waitFor` de la línea 98:

```js
console.log('  DEBUG ' + JSON.stringify(await p.evaluate(() => ({
  saves: (window.__saves || []).map(s => s.len + '/' + s.research),
  pilas: (window.__saves || []).slice(-3).map(s => s.pila),
  ahora: (localStorage.getItem('cabina-mnq:v1') || '').length,
  total: (document.querySelector('#studyTotal') || {}).textContent
}))));
```

El test hay que correrlo desde `test/`, no desde la raíz: navega a
`file://' + process.cwd() + '/../index.html'`.

## Lo que no se debe hacer

- **No relajar el `waitFor` de la línea 98** ni envolverlo en un reintento. Esa
  aserción es lo único que ha enseñado una posible pérdida de datos; ablandarla
  convierte el rojo en silencio y deja el defecto dentro.
- **No llamarlo «flake» y seguir.** Lo es en su comportamiento, no en su causa:
  un snapshot que retrocede a un estado anterior no es ruido de temporización
  del test, es estado perdido.
- **No tocarlo desde la rama de los temas.** Es anterior a ella y medido sin
  ella; mezclarlo haría ilegibles las dos cosas.
