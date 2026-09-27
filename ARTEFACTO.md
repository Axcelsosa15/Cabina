# El artefacto

`index.html` es una copia estática de un artefacto publicado en claude.ai. El
código es el mismo; lo que cambia es la cáscara y lo que la página puede hacer.
Este archivo existe porque durante semanas el repositorio no registraba nada de
esto: quien clonara sólo veía un HTML, sin forma de saber contra qué se publica
ni por qué el mismo archivo se comporta distinto según dónde se abra.

## Identidad

| | |
|---|---|
| Enlace | https://claude.ai/artifact/2Nkv7mgKa7xtxZY9yvxeAb |
| Versión viva | **69** · `1790518093-ef45` · 2026-09-27 |
| Contrato en ejecución | `0.2.46` (el más nuevo disponible es `0.2.60`; no se mueve sin motivo) |
| Compartición | enlace público — *ver la advertencia al final* |

## Capacidades declaradas

Al publicar se declara esto, y sólo esto:

```
assets, db, downloads
```

- **`db`** — el almacén de documentos. Es lo que hace que los datos sobrevivan
  al navegador y se sincronicen entre dispositivos. Sin él la app cae a
  `localStorage` (clave `cabina-mnq:v1`) y cada dispositivo queda aislado.
- **`assets`** — subir imágenes al playbook. Sin él el botón de imagen
  desaparece.
- **`downloads`** — el respaldo en JSON. Dentro del artefacto la página no puede
  descargar por su cuenta: lo pide a la cápsula, que muestra nombre y tamaño y
  espera permiso. Servido como archivo suelto vale la descarga normal.

`permissions` **no se declara**: es built-in en todo artefacto. El código la
llama al arrancar (`perms.request(["db", "assets"])`) para pedir los dos
permisos en un solo diálogo en vez de interrumpir dos veces más tarde.

Las cuatro llamadas van envueltas en `try/catch` con caída a `null`, así que la
misma página funciona servida como archivo suelto, donde `window.claude` no
existe: `db` cae a `localStorage`, `assets` esconde el botón, `downloads` usa
`URL.createObjectURL`.

## Lo que está probado de esta capa — y lo que no

Hasta ahora **nada** lo estaba. Las 50 suites corrían sin `window.claude`, o sea
que medían la rama de `localStorage`: la del respaldo, no la del entorno
principal. `test/capsula.mjs` cubre la rama `db` con **28 aserciones** contra un
doble fiel del contrato (detalle y reglas en el protocolo 13).

Lo que queda demostrado:

| | |
|---|---|
| pide los permisos | una sola vez, y exactamente `["db","assets"]` |
| se conecta | el rótulo pasa a «sincronizado» |
| se suscribe | `settings/main`, `days/<hoy>`, el histórico `orderBy(date,desc).limit(15)` y las **9** colecciones con `limit(1000)` |
| escribe donde debe | crear cuenta → `settings/main`; escribir en el diario → `days/<hoy>`; crear una tesis → `collection("tesis").doc(id)`, con el contenido real dentro |
| **no** escribe donde no debe | con `db` conectado, `localStorage` se queda sin una sola clave `cabina-mnq` |
| recibe cambios de fuera | un `settings/main` entrante añade la cuenta; un `days/<hoy>` más nuevo reemplaza el día, uno más viejo no |
| no te borra lo que escribes | con el foco dentro del campo, un snapshot entrante **no** lo sobreescribe |
| avisa cuando falla | con el código real del error, no un genérico, y sin reventar la página |

Probado en los dos sentidos: con tres sabotajes en `index.html` — esconder el
error de escritura, quitar la guarda del foco e invertir la precedencia de
`updatedAt` — la prueba se pone roja y nombra exactamente las aserciones
afectadas. Restaurado y md5 comprobado.

**Dos límites, dichos aquí porque importan:**

1. Esto fija el **contrato**, no la plataforma. Si claude.ai cambiara el `db`, la
   prueba seguiría verde y el artefacto estaría roto. Eso sólo lo detecta abrirlo.
2. Cuando el `db` falla al escribir, el dato **se queda en memoria**: la app
   avisa, pero no cae a `localStorage`, así que al recargar se pierde. No se ha
   cambiado — sería alterar el comportamiento de la app, fuera del alcance — pero
   está afirmado tal cual es, así que si alguien lo cambia la prueba lo dirá.

---

## Publicar un cambio

El contenido del artefacto es `index.html` **desde su SEGUNDO `<style>`**. Decir
«desde `<style>`» a secas no vale y costó una comparación falsa de 113 bloques: el
PRIMER `<style>` de `index.html` (línea 13) es el reset mínimo del envoltorio de
página estática, y el cuerpo del artefacto empieza en el SEGUNDO (línea 22), que
es el sistema de diseño.

La diferencia con el archivo del repositorio es sólo ese envoltorio, que añade
`test/sync-index.mjs`:

- delante: `<!DOCTYPE html>`, `<head>` con las fuentes y los metas, el reset
  mínimo, `</head><body>`
- detrás: `</body></html>`

### Coinciden — republicado el 2026-09-27 (versión 69) · y en el teléfono también

La versión viva es la **69** (`1790518093-ef45`). Contrato `0.2.46` y capacidades
arrastradas intactas.

**1 línea fuera, 17 dentro.** La que sale es la regla que escondía el rótulo:

```css
.save-state { display: none; }     /* dentro de @media (max-width: 700px) */
```

—sigue ahí, pero ya no se lleva por delante el aviso. Medido antes: el rótulo decía
«SIN GUARDAR · 2» y su rectángulo era **0×0 px**. El arreglo de la 68 se borraba
entero justo en la pantalla más pequeña.

Entra `.save-state.nosave { display: block; flex: 1 1 100%; }` —lo ambiental sigue
escondido, lo que importa se enseña, y en su propia línea— y `#footerStore.nosave`,
que sube la explicación de `--dim` a `--text`.

Nueve comprobaciones sobre el candidato, todas correctas.

Y **comprobado a mano contra lo publicado**, como se hizo con la 67: leyendo la 69 y
comparándola línea por línea con `index.html`, **0 diferencias en 10 667 líneas**. Lo
único que no coincide es el cierre —`index.html` tiene `</body>` y `</html>` en líneas
separadas y el servicio los sirve juntos—, que lo pone el propio envoltorio.

La primera vez que hice esa comparación dijo «❌ DIFIERE: 818 340 vs 818 324
caracteres», y **la comparación estaba mal, no el fichero**: recortaba el cierre con
un `endswith` encadenado que no contaba el salto de línea entre las dos etiquetas.
Séptima vez que aparece el patrón del protocolo 14 en esta serie, y la primera en la
que el número rojo no venía de una cuenta esperada sino de una comparación mal
escrita. La diferencia práctica es la misma: **se mira el fichero antes de tocarlo.**

Esto vale para la **69**. La siguiente republicación vuelve a dejar la pregunta
abierta, y la fila de la compuerta sigue diciendo UNKNOWN en vez de heredarlo.

### Coinciden — republicado el 2026-09-27 (versión 68) · el rótulo deja de mentir

La versión viva es la **68** (`1790515879-9a78`). Contrato `0.2.46` y capacidades
arrastradas intactas.

**14 líneas fuera, 68 dentro.** Lo que sale son las seis puertas de escritura tal como
estaban: cada una avisaba con un destello de 2,5 s en `#jSaved` —que está **dentro de
la pestaña Cabina**, medido: invisible en 5 de las 6— y el rótulo de la barra seguía
diciendo «sincronizado».

Entra `SIN GUARDAR · n` con el código del error, en la barra, en las seis pestañas, y
llevado **por documento**: si falla el día y luego entra bien una operación, el aviso
del día sigue.

Doce comprobaciones sobre el candidato. La número siete salió ❌ y **el número
esperado era mío**: comprobaba que no se hubiera colado un `\u00b7` literal y pedía 0
apariciones de un patrón que no era el que había que buscar. Verificado directamente:
una sola `SIN GUARDAR`, con el punto medio real (`C2 B7`), y **cero** escapes sin
interpretar. Sexta vez que aparece el patrón del protocolo 14 en una republicación.

Lo que esta republicación **no** arregla, y no por olvido: si la base rechaza la
escritura, el dato sigue quedándose en memoria. Copiar a `localStorage` lo que la base
rechazó crea dos fuentes de verdad que pueden divergir. Eso es producto, no auditoría.

### Comprobado a mano el 2026-09-27: la 67 es index.html, byte a byte

No es una fila de la compuerta y no debe serlo. La compuerta no puede leer el
artefacto publicado, así que su fila «el artefacto sirve lo mismo que index.html» se
queda en UNKNOWN y ahí se queda. Lo que sigue es una comprobación **manual**, de una
versión concreta, hecha leyendo lo publicado y comparándolo:

```
lo publicado (1790511268-58df), de la línea 2 en adelante, sin el cierre
  vs  el candidato                      ->  una sola línea en blanco de diferencia
el cuerpo del candidato, desde <style>
  vs  index.html desde la línea 22      ->  IDÉNTICO, carácter a carácter
```

La línea en blanco la añade el propio servicio al envolver la página. Fuera de eso,
lo que sirve el entorno principal es exactamente el fichero del repositorio.

Esto vale para la **67** y para nada más. La siguiente republicación vuelve a dejar la
pregunta abierta hasta que se compruebe otra vez, y por eso la fila de la compuerta
sigue diciendo UNKNOWN en vez de heredar este resultado.

### La página de GitHub: se despliega, y no puedo comprobar que sirva

El despliegue **existe** — «pages build and deployment» salió en verde sobre
`fdbb68b`, igual que el flujo `pagina`. Eso es evidencia de que GitHub construyó y
publicó, y **no** es evidencia de que la página sirva los bytes correctos.

Para comprobar lo segundo hay que pedir la URL, y desde aquí no se puede: el proxy de
la organización devuelve **403 al túnel** hacia `axcelsosa15.github.io`. No se
reintenta y no se rodea. La fila de la compuerta sigue en UNKNOWN, que es lo que
corresponde: un despliegue verde no es una página servida.

### Coinciden — republicado el 2026-09-27 (versión 67) · la copia que no sale a medias

La versión viva es la **67** (`1790511268-58df`). Contrato `0.2.46` y capacidades
arrastradas intactas.

**17 líneas fuera, 77 dentro.** La que importa de las que salen es una línea vacía:

```js
      catch (e) { }
```

Era el `catch` de `allDayDocs`. Si la base del artefacto no se podía leer, ese `catch`
se lo tragaba, la copia se armaba con los días que hubiera en memoria y la cabina
anunciaba «Copia el texto del cuadro · 4 KB · 1 sesión» — con dos sesiones dentro.
Reproducido con un doble de la base: dos días sembrados en la nube, la lectura
rota, y el respaldo salió con `["2026-09-27"]` y ese mensaje. Ahora lanza, y no hay
copia: **media copia es peor que ninguna**, porque la media parece entera.

El hallazgo no es mío: viene de la revisión externa (PR #1). La mitad de esa PR que
validaba la importación entra también, pero **reparando, no rechazando** — rechazar
un registro sin `id` propio pierde un trade legítimo, y eso está probado. Entran los
identificadores prohibidos (`__proto__`, `constructor`, `prototype`), el tope de 128
caracteres, el error con el nombre de la sección que falló, la detención por
identificador repetido, y los contadores de reparados y descartados **visibles en la
vista previa antes de confirmar**.

Y entra `Number.isInteger` en la versión, que el commit anterior decía haber adoptado
y no había adoptado: con `isFinite`, una versión «1.5» pasaba.

Ocho comprobaciones sobre el candidato, todas correctas.

### Coinciden — republicado el 2026-09-27 (versión 66) · frontera de importación

**2 líneas fuera, 31 dentro.** Las dos que salen son exactamente el `bkMap` viejo, el
que perdía el `id` de un registro importado sin él. Entra la reparación —la clave bajo
la que venía se convierte en su identificador— y el rechazo de una versión no
numérica, con su motivo escrito.

Once comprobaciones sobre el candidato, todas correctas, incluidas las dos que vigilan
que la reparación exista y que la versión vieja no haya vuelto.

### Coinciden — republicado el 2026-09-27 (versión 65) · arreglo de seguridad

La versión viva es la **65** (`1790505488-a8bb`). Contrato y capacidades intactos.

**1 línea fuera, 35 dentro.** La que sale es exactamente la `imgSrc` insegura:

```js
function imgSrc(im) { return im && im.data ? String(im.data) : "/_blob/" + ((im && im.id) || ""); }
```

Entra la lista blanca de esquemas, el guardado del `fetch` y la marca visible de
rechazo. Sin ese filtro, importar un respaldo escrito a mano con `data: "https://…"`
hacía que la cabina **pidiera esa URL** — demostrado con sabotaje: la página pidió de
verdad `blob:https://evil.example/x` y `file:///etc/passwd`.

**Esta republicación SÍ arreglaba algo**, a diferencia de las dos anteriores. Por eso
no se agrupó con nada.

Y la comprobación número cuatro salió ❌ la primera vez porque **el número esperado
era mío**: esperaba 3 apariciones de `IMG_RECHAZADA` y son 2 —la declaración y el
`return`—. Quinta vez que el patrón del protocolo 14 aparece en una republicación, y
la segunda seguida que se caza en el acto.

> ⚠ **El riesgo que esta republicación NO arregla**: el artefacto sigue compartido
> como «cualquiera que tenga el enlace», con datos reales dentro. Eso no está en el
> código. Un clic en el menú Share, y sólo lo puede dar el dueño.

### Coinciden — republicado el 2026-09-27 (versión 64)

La versión viva es la **64** (`1790503479-66b9`). Contrato `0.2.46` y capacidades
arrastradas intactas.

El diff contra la 63 es **puramente aditivo: 0 líneas fuera, 272 dentro**, en cinco
bloques — el CSS del panel, el botón de la barra superior, el marcado del panel, el
bloque de JavaScript del registro rápido y la línea de `source` en la puerta de
guardado del editor. **No se borró una sola línea de lo publicado**, que es
exactamente lo que debe ocurrir al añadir una funcionalidad y es una comprobación en
sí misma.

Dieciséis comprobaciones sobre el candidato, todas correctas, incluidas las dos que
vigilan que la funcionalidad nueva no abra una segunda puerta: `source: "quick_add"`
presente **una** vez, y `instrument: p.instrument, pnl: p.pnl` — que escribe `pnl` y
**no** `pnlEff`, que es lo único que impide que el registro rápido se convierta en una
segunda fuente de verdad para el P&L.

### Coinciden — republicado el 2026-09-27 (versión 63)

La versión viva es la **63** (`1790491941-1106`). Contrato `0.2.46` y capacidades
`assets` / `db` / `downloads` arrastradas intactas, confirmado en la respuesta.

Diferenciado contra la **62**, que se publicó desde este mismo sitio hace un rato y
por tanto se conoce byte a byte sin volver a leer lo publicado: **16 líneas fuera, 49
dentro**, y el diff es exactamente la consolidación de `consistency()` sobre
`QE.evaluarConsistencia` con sus comentarios. Nada más.

Las diecisiete comprobaciones sobre el candidato, todas correctas — y la número seis
salió ❌ la primera vez porque **el número esperado estaba mal, no el fichero**:
`SIN_GANANCIA_APP` aparece 3 veces, 2 en líneas de código y 1 en la prosa del
comentario que explica cómo cambiarlas. Cuarta vez que el patrón del protocolo 14
aparece en una republicación, y la primera que se caza en el acto en vez de después.

### Coinciden — republicado el 2026-09-27 (versión 62)

`index.html` y el artefacto publicado vuelven a decir lo mismo. La versión viva es la
**62** (`1790489773-6268`); la anterior era `1790422823-8b79`. Contrato `0.2.46` y
capacidades `assets` / `db` / `downloads` **arrastradas intactas** — confirmado en la
respuesta del publicador, no supuesto: `capabilities` se omitió a propósito.

Lo que fue, medido diferenciando el fichero publicado contra el candidato **antes**
de enviarlo: **20 líneas fuera, 55 dentro**, y ni una más que las tres
consolidaciones de la fase 2 con sus comentarios:

| | |
|---|---|
| `RISK_STEPS` → `NIVEL_APP` | la tabla de umbrales duplicada, sustituida por presentación |
| `riskEngine` | de implementación a adaptador sobre `QE.margenDePerdida` |
| `gainCap` | adaptador sobre `QE.topeDeGanancia` |
| `dayAgg.lossPct` / `lossRemaining` | ahora del motor; era la tercera copia |

Nada inesperado había entrado en lo publicado por otra vía, y nada inesperado había en
el candidato.

**Esta republicación no arreglaba ningún defecto**, a diferencia de la del 100×: la
consolidación es equivalente por medición —los dieciséis números dorados de
`test/equivalencia.mjs`, fijados como literales *antes* de tocar `index.html`, no se
movieron— así que la versión 61 daba el mismo número por el camino viejo. Se
republicó para que el entorno principal no se quede atrás, no para corregirlo.

Las dieciséis comprobaciones sobre el candidato, todas verdes:

`riesgoPct: pc / 100` **1** · `riesgoPct: pc })` **0** · `const NIVEL_APP` **1** ·
`const RISK_STEPS` **0** · `under: 0.` **0** · `QE.margenDePerdida(-t.lossUsed` **1** ·
`QE.margenDePerdida(-lossUsed` **1** · `QE.topeDeGanancia(` **1** ·
`<title>Cabina</title>` **1** · `</body>` **0** · `</html>` **0** ·
`const QE = (function () {` **1** · `window.QuantEngine = QE;` **1** · `window.FUT`
**1** · el primer `<style>` del envoltorio **0** · y el bloque del motor del candidato
**idéntico byte a byte** al de `index.html` (102.396 bytes), que es lo que `capa2` §15
ya verifica contra el bundle.

Y otra vez un instrumento propio mintiendo, no el fichero: el §15 improvisado sobre el
candidato dio 93.055 contra 93.110 bytes y «muestra no encontrada», porque cortaba y
normalizaba distinto que `capa2`. La comprobación buena es `capa2` §15, verde. Tercera
vez que el patrón del protocolo 14 aparece en una republicación: **se comprueba el
instrumento antes de creerle**.

### Coincidieron — republicado el 2026-09-26

`index.html` y el artefacto publicado vuelven a decir lo mismo. La versión viva
es la **61** (`1790422823-8b79`); la anterior era `1790329585-a362`.

Lo que fue en esa republicación, medido diferenciando el fichero publicado contra
el candidato **antes** de enviarlo — 72 líneas fuera, 37 dentro, y ni una más:

| Cambio | ¿Se ejecuta? |
|---|---|
| el bloque «MathEngine — ÚNICA FUENTE DE CÁLCULO» dice ahora la verdad | no, comentario |
| «190 pruebas» → «329 pruebas» | no, comentario |
| 10 copias duplicadas del encabezado del bundle, fuera | no, comentarios |
| `pbar()` retirada | no, nadie la llamaba |
| **`riesgoPct: pc` → `riesgoPct: pc / 100`** | **SÍ** |

Ese último arreglaba un **100× en el tamaño de posición**: el campo «Riesgo por
operación (%)» tiene `step: 0.1`, y quien escribía `0.5` queriendo medio por
ciento obtenía 50%. Medido por la app, cuenta de 25.000 con stop de 10 puntos
MNQ: `0.5` daba **1250 contratos** donde ahora da **6**. Estuvo vivo en el
artefacto — el entorno principal — hasta esa versión; se confirmó leyendo la
línea 7922 del fichero publicado, no dedujo.

**Cómo se verificó antes de publicar**, porque un artefacto no tiene suite:

    «MathEngine — ÚNICA FUENTE» fuera        0 apariciones
    «190 pruebas» fuera                       0
    «329 pruebas» dentro                      1
    pbar() fuera                              0
    encabezado del bundle                     1 (eran 11)
    riesgoPct: pc / 100                       1
    riesgoPct: pc })                          0
    <title>Cabina</title>                     1 (es el nombre del artefacto)
    </body>                                   0 (lo pone el publicador)
    window.QuantEngine / window.FUT           1 cada uno
    el motor incrustado == el bundle          capa2 §15 en verde

El contador de esas comprobaciones salió **roto la primera vez** — `grep -c`
termina con código 1 cuando cuenta cero, así que el `|| echo 0` escribía un
segundo cero y todo lo que debía valer 0 se marcaba FALLO. Anotado porque es
exactamente el error del protocolo 14 otra vez: el instrumento mentía, no el
archivo.

### Cómo se republica

El contenido del artefacto es `index.html` **desde su SEGUNDO `<style>`**, con el
`<title>` y los dos `<link>` de fuentes tomados del fichero publicado — no del
repositorio, cuyo título es otro y renombraría el artefacto. El `</body></html>`
no va: lo pone el publicador.

La herramienta **no acepta una comparación por hash**: exige haber leído las
10.818 líneas de lo publicado, y hace bien — es lo que permitió diferenciar y
saber que no entraba nada más. Son ~15 lecturas.

Al republicar **se omite `capabilities`**, que arrastra la declaración guardada
intacta (`assets, db, downloads`) y mantiene fijado el contrato en `0.2.46` —
confirmado en la respuesta del publicador. Pasarlo de nuevo es una declaración
completa: lo que no se repita se revoca. Mover el contrato (`contract: 'latest'`)
es un gesto deliberado, nunca un efecto colateral de editar.

## El almacén de assets NO está aquí

El artefacto guarda 7 imágenes PNG (3.9 MB) subidas al playbook. **No están en
el repositorio y no deben estarlo**: son capturas de gráficos de operaciones
reales y éste es un repositorio público. Quedan inventariadas por si hay que
reconstruir referencias:

| id | bytes | subida |
|---|---|---|
| `de7a8f2eda03b94731a13caf4c023f08` | 314 374 | 2026-09-15 |
| `95f4b7f770b31c725ad4ccbdcac34abf` | 469 513 | 2026-09-15 |
| `00fbbed3da6890ecd1ae7158d0cd1784` | 635 158 | 2026-09-16 |
| `96cebe0c43880d5112bf767af69ef295` | 635 158 | 2026-09-16 |
| `fe41b68f3bee5ef864307df7ad9cfe1e` | 611 828 | 2026-09-16 |
| `29b4712c28788ee8da93b3a2174637ee` | 675 090 | 2026-09-17 |
| `02465af7fd3a8e7df5d8661f7d205821` | 585 548 | 2026-09-17 |

Las dos del 16 de septiembre son **el mismo archivo**: mismo sha256
(`c446f708…`), mismo tamaño, tres minutos de diferencia. La app subió la imagen
dos veces y gastó 635 KB de cuota en una copia que ninguna fila referencia.
`assets.delete(id)` la borraría, pero sólo tras comprobar qué playbook apunta a
cuál.

## Advertencia sobre la compartición

El artefacto tiene datos de trading reales. Su ajuste de compartición es
«cualquiera con el enlace». Eso sólo lo cambia el dueño, desde el menú Share.

Hay una tensión sin resolver: el contrato dice que una página que declara
`assets` es interna de la organización y nunca pública. Si eso manda sobre el
ajuste, el enlace no sería realmente público. No se puede comprobar desde aquí
— lo dice el diálogo Share, que es quien sabe si la opción pública se ofrece
siquiera. Hasta saberlo, trátalo como público.
