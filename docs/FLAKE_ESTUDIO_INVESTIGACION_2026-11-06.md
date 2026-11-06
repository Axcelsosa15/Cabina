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

---

## Apéndice del 2026-11-06, por la tarde: medido en las dos ramas, y un segundo flake con el mismo aire

Lo de arriba quedó con la causa sin establecer. Esto no la establece tampoco, pero
estrecha mucho el sitio donde puede estar y **descarta cinco explicaciones** que
cualquiera volvería a recorrer.

### 1 · Ninguno de los dos flakes es del PR que los enseñó

La compuerta de `Axcelsosa15/Cabina#145` (rama `feat/resumen-distribucion`, cabeza
`8e2fd1d`) salió roja por `estudio-investigacion` y `respaldo-estudio`. Se corrieron
las dos suites en dos árboles de trabajo, uno en la cabeza y otro en **su base**
`6f7fb48`, que no contiene ese PR:

| suite | base `6f7fb48` | cabeza `8e2fd1d` |
| --- | --- | --- |
| `respaldo-estudio` | 1 rojo / 6 | 1 rojo / 6 |
| `estudio-investigacion` | 1 rojo / 4 | 2 rojos / 4 |

Falla en la base igual que en la cabeza, así que **no es de ese cambio**. La
diferencia 1 vs 2 con n=4 no es una medición de nada y no se lee como «peor en la
cabeza».

`estudio-investigacion` reprodujo en la base **el error exacto de CI**:
`locator.waitFor: Timeout 20000ms exceeded` en la línea 98.

**Un aviso de método, porque costó cinco datos.** Las primeras corridas de
`estudio-investigacion` en los árboles dieron 4 de 4 y 1 de 1 en rojo, y no era el
flake: era `page.goto: net::ERR_FILE_NOT_FOUND`. Esa prueba resuelve `index.html`
contra el **directorio de trabajo**, no contra `import.meta.url`, y se lanzó desde
la raíz del árbol. `correr.mjs` las lanza con `cwd` en `test/` (`spawn(..., { cwd:
aqui })`). Lanzada así, pasa. Esos cinco rojos se descartaron en vez de citarlos:
un error de arnés contado como flake del producto es exactamente la confusión que
este documento existe para no repetir.

### 2 · `respaldo-estudio`: el síntoma, por fin dicho

La aserción «la copia parcial no actualiza el último respaldo completo» llevaba tres
rojos de CI en tres ramas distintas sin decir qué veía. Con el tercer argumento de
`ok` puesto (commit `e078226`), lo dijo, en la corrida `42297093684` y en 3 de 38
corridas locales:

```
❌ la copia parcial no actualiza el último respaldo completo
   antes [["cabina:last-backup:v1:00000000-0000-4000-8000-000000000001","2026-11-06T21:42:04.699Z"]] · después []
```

**`después` está vacío.** No sobra una clave y el valor no se ha movido: la clave
del sello **no está** en esa lectura. Las dos hipótesis que el comentario de la
prueba planteaba eran las dos equivocadas.

### 3 · Lo que ya está descartado por medición

| Hipótesis | Cómo murió |
| --- | --- |
| Carrera de identidad tras recargar: el sello se escribiría bajo `:local` por no estar restablecida la sesión | `nube.ses = sesLee()` y `state.nube = true` son **sincrónicos** al arrancar (app.js:15953-15954), leídos de localStorage. No existe esa ventana |
| Orden de escritura: la lectura «antes» adelantaría a la escritura del sello | El sello se escribe sólo si `!perdidas`, y antes de que `renderBackup()` reactive el botón que `exporta()` espera |
| Durabilidad de `localStorage` en `file://` al recargar sin pausa | Escribir y recargar 40 veces sin pausa alguna: **0 pérdidas de 40** |
| La app la borra | 4 `removeItem` en todo el código, ninguno sobre esta clave, y nadie recorre las claves de localStorage |
| La descarga navega la página y cambia el origen | `bkDownload` tiene **un** camino: `descarga()` con un clic sintético. Siempre devuelve `"descargado"` |
| Es cuestión de carga de máquina | 0 de 8 con 6 bucles ocupando 4 núcleos |

### 4 · La frecuencia, y una lección sobre n pequeñas

3 de 38 corridas locales ≈ **8 %**. El comentario de la prueba afirmaba «Pasa en
local, también bajo carga: 6 de 6»; con un fallo del 8 %, seis corridas limpias
ocurren el 61 % de las veces. Esa frase se corrigió en `test/respaldo-estudio.mjs`.

Y una tanda de 3 de 12 llevó a escribir que observar el fallo lo suprimía, porque
después vinieron 0 de 26 con una sonda puesta. Con la tasa real del 8 %, 0 de 26
ocurre el 12 % de las veces: **era un grumo, no una supresión**. Retirado.

### 5 · Lo que NO se hace

No se relaja la aserción, no se le pone una pausa para que pase, y no se marca como
«flake» para dejarla en verde: `stamp.length === 1` sigue exigiendo una clave y el
mismo valor. Una prueba que pasa por haber dejado de mirar es el defecto que este
repositorio persigue, no el arreglo.
