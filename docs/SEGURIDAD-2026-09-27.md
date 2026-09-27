# Auditoría de seguridad y modelo de amenazas · 2026-09-27

Fase 0. Sobre `main` en `c114b47`. **Cero cambios de código en esta pasada.** Cada
número sale de ejecutar un escaneo o de leer el código en su contexto, no de suponer.

> **Seguimiento en `main` actual.** Este documento conserva la fotografía histórica
> de esa fase. Desde entonces, `ca4508a` añadió la lista blanca de imágenes y
> `permissions: contents: read`, y `test/seguridad.mjs` los vigila; por tanto los
> hallazgos 3.1 y 3.2 están cerrados en el repositorio actual. Esta auditoría
> también añade validación estructural en `bkParse()` para rechazar respaldos con
> versión, contenedores, registros o identificadores mal formados antes de
> persistirlos. Sigue sin existir validación campo por campo del modelo financiero,
> y permanecen los riesgos de compartir públicamente el artefacto y de perder un
> cambio en memoria si el `db` falla al escribir.

---

## Lo primero: la premisa del encargo no describe este sistema

El encargo parte de «TURBOK2 es una aplicación estática publicada en GitHub Pages».
Medido, eso es falso en dos sentidos, y los dos cambian el modelo de amenazas entero.

**1 · GitHub Pages no es el frontend. Ni siquiera está activado.** La URL devuelve 404
porque Pages exige un clic del dueño que el `GITHUB_TOKEN` de Actions no puede dar. El
workflow avisa y no despliega. Hoy **nadie carga TURBOK2 desde Pages**.

**2 · El entorno principal es el artefacto de claude.ai**, versión 64
(`1790503479-66b9`), y su cuerpo es `index.html` byte a byte.

Eso tiene una consecuencia que ningún backend arregla:

> ### ⚠ El artefacto está compartido como «cualquiera que tenga el enlace», con datos de trading reales dentro.
>
> Es el único riesgo **vivo, confirmado y explotable hoy** de todo este informe.
> Cualquiera con el enlace ve el contenido. No hace falta ninguna vulnerabilidad:
> es la configuración.
>
> **Coste de arreglarlo: un clic en el menú Share.** Sólo lo puede hacer el dueño.
> Construir un backend con autenticación no lo mitiga en absoluto: la exposición no
> está en el transporte, está en el permiso de lectura del documento.
>
> Atenuante medido: quien abre por el enlace compartido ve una **versión anclada
> anterior**, no la viva. Eso limita qué versión se expone, no *si* se expone.

---

## 1 · Superficie de ataque, medida

Escaneo sobre `index.html` (10.870 líneas, un solo fichero, motor incrustado):

| | |
|---|---|
| `fetch(` | **1** |
| `XMLHttpRequest` · `WebSocket` · `EventSource` · `sendBeacon` · `import()` | **0** |
| `eval(` · `new Function(` · `document.write(` · `setTimeout("…")` · `javascript:` | **0** |
| `postMessage` · listener de `message` · `window.open` · `location.href =` · `document.domain` | **0** |
| `outerHTML` · `insertAdjacentHTML` · `srcdoc` | **0** |
| `innerHTML` | **160** |
| recursos externos | **2**, los dos de Google Fonts. Cero scripts de terceros |
| dependencias de ejecución | **ninguna** |
| dependencias de desarrollo | **1** (`playwright`), `npm audit` → **0 vulnerabilidades** |

Esa tabla describe un sistema con **una superficie de red prácticamente nula**. La
mayoría de las 30 amenazas del encargo no aplican todavía porque **no hay red, ni
sesión, ni servidor, ni credenciales**.

### Los 160 `innerHTML`, analizados

Se extrajeron las **1.413 interpolaciones** `${…}` del script y se clasificaron. La
clasificación automática marcó 880 como «crudas», pero revisadas una a una, la enorme
mayoría son números, coordenadas SVG, `.toFixed()` y ternarios que devuelven literales
fijos. Las que importan son las **cadenas que escribe el usuario**, y se siguieron
hasta su sumidero:

| cadena del usuario | sumidero | veredicto |
|---|---|---|
| nombre y firma de cuenta | `flash()` → **`el.textContent`** | seguro |
| nombre de escenario de riesgo | `rflash()` → **`el.textContent`** | seguro |
| nombre de fichero importado | `bkSay()` → `innerHTML` con **`esc(msg)`** | seguro |
| etiquetas y `title` de gráficos | `chartBars()` → **`esc(it.title)`**, **`esc(it.label)`**, **`esc(opts.aria)`** | seguro |
| filas del cuadro de mando | `renderScorecard()` → **`esc(r.title)`**, **`esc(r.sub)`**, **`esc(r.val)`** | seguro |
| motivo del motor de reglas | `${esc(ev.why)}` | seguro |
| opciones de todo `<select>` | **`esc(o[0])`** y **`esc(o[1])`** | seguro |
| instrumentos de una regla | interpolados en mensajes que van a `textContent` | seguro |

`esc()` escapa `& < > " '` — completo para contexto de texto y de atributo entre
comillas.

**No se encontró ninguna ruta de XSS explotable.** Esto no es lo mismo que «no hay
XSS»: es que las rutas que se siguieron acaban todas en un escape o en `textContent`.
Los 160 sitios no se revisaron uno a uno a mano; se siguió cada **clase** de dato de
usuario hasta su sumidero.

---

## 2 · Secretos

| | |
|---|---|
| en el árbol de trabajo | **ninguno** |
| en el historial de git (**64 commits**, `git log --all -p`) | **ninguno** |
| en los workflows | **ninguno** |

Todos los aciertos del patrón (`API_KEY|SECRET|TOKEN|PASSWORD|BEARER|PRIVATE_KEY|…`)
resultaron ser prosa sobre *tokens de diseño* CSS, o la palabra «token» en español.

Esto es coherente con que **no hay nada que autenticar**: la app no habla con ningún
servicio.

---

## 3 · Los tres hallazgos reales

### 3.1 · Un respaldo importado puede hacer que la app pida una URL elegida por quien lo escribió

**Riesgo.** `imgSrc(im)` devuelve `String(im.data)` **tal cual** cuando el objeto trae
`data`, y si no, construye `"/_blob/" + im.id`. Ese valor va a dos sitios:

- `<img src="${esc(imgSrc(im))}">` — escapado para HTML, pero `esc()` **no valida el
  esquema ni el destino de una URL**;
- `await fetch(imgSrc(im))` en el empaquetado de respaldos — **una petición de red
  activa a la URL que diga el fichero importado**.

**Defensa actual.** `bkParse()` valida la **forma** del respaldo —que sea JSON, un
objeto, con `format` correcto y `version` no superior— y **ningún valor de ningún
campo**. `applyBundle()` escribe todo a `localStorage` o al `db` sin validar.

**Qué falta.** Una lista blanca de esquemas para `im.data`: aceptar sólo `data:image/*`
y rechazar `http:`, `https:`, `javascript:`, `blob:` y cualquier otro. Y validar que
`im.id` sea un identificador, no un camino.

**Impacto.** No es ejecución de código: un `javascript:` en `<img src>` no se ejecuta
en navegadores actuales. Es **balizamiento**: importar un respaldo ajeno revela al
autor del fichero que lo abriste, tu IP y tu agente de usuario. En una app financiera
personal eso es un problema de privacidad, no de integridad.

**Prueba que faltaría.** Importar un respaldo con `data: "https://…"` y afirmar que la
app **no** hace la petición.

### 3.2 · `pruebas.yml` no declara permisos

**Riesgo.** `pagina.yml` sí los declara y bien acotados:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

`pruebas.yml` **no declara ninguno**, así que hereda el ajuste por defecto del
repositorio — que **no se puede leer desde aquí**. Y corre en `pull_request`, o sea que
lo dispara código de terceros.

**Qué falta.** Declarar `permissions: contents: read` explícitamente. Eso elimina la
dependencia de un ajuste que no se puede verificar, que es el motivo real para hacerlo.

### 3.3 · La importación no valida tipos, y el motor sí

**Riesgo.** Un respaldo puede poner una cadena donde el modelo espera un número,
`Infinity`, `NaN`, o un objeto donde va un escalar.

**Defensa actual — y es mejor de lo esperado.** El motor usa `toNum()` en todas sus
fronteras y devuelve `Result` con `calcError` en vez de propagar basura;
`calcularTradeApp` ya se niega a calcular sin precio de entrada y lo dice. O sea que
**los datos corruptos producen huecos visibles, no números falsos** — que es
exactamente el comportamiento correcto.

**Qué falta.** Validación de esquema en la frontera de importación, para que el
rechazo ocurra **al importar** y no al pintar.

---

## 4 · Modelo de amenazas · las 30 del encargo

Muchas están en **N/A HOY**, y eso no es una omisión: es la consecuencia de que no
exista red, sesión ni servidor. Marcarlas de otro modo sería inventar cobertura.

| # | amenaza | estado |
|---|---|---|
| 1 | XSS | **Mitigada** · `esc()` en todo sumidero de dato de usuario; 0 `eval`/`Function`/`document.write` |
| 2 | JSON importado malicioso | **PARCIAL** · forma validada, valores no. Hallazgo 3.1 y 3.3 |
| 3 | CSV malicioso | N/A · no hay importación de CSV todavía |
| 4 | ficheros/capturas maliciosas | **PARCIAL** · `uploadShot` exige `image/*`, pero `im.data` importado no se valida |
| 5 | navegador comprometido | **Aceptada** · fuera del alcance de una app de cliente |
| 6 | sesión robada | N/A · no hay sesión |
| 7 | fuga de token | N/A · no hay tokens |
| 8 | fuga de credenciales de API | N/A · no hay credenciales |
| 9 | replay | N/A · no hay peticiones de estado |
| 10 | órdenes duplicadas | N/A · no se envían órdenes |
| 11 | cruce demo/live | N/A · no hay conexión de bróker |
| 12 | caída de API | N/A |
| 13 | datos de mercado rancios | N/A · no hay datos en vivo |
| 14 | límite de tasa | N/A |
| 15 | abuso de CORS | N/A · no hay API propia |
| 16 | CSRF | N/A · no hay endpoints autenticados |
| 17 | clickjacking | **NO VERIFICADA** · sin `frame-ancestors`. El artefacto ya va en un marco de claude.ai, así que la cabecera la fija la plataforma, no el documento |
| 18 | cadena de suministro | **Mitigada** · 0 dependencias de ejecución, 1 de desarrollo, 0 vulnerabilidades, 2 recursos externos (fuentes) |
| 19 | GitHub Actions comprometido | **PARCIAL** · hallazgo 3.2 |
| 20 | API de terceros comprometida | N/A |
| 21 | robo de `localStorage` | **Aceptada y documentada** · los datos viven en `cabina-mnq:v1`. Sin servidor, el almacenamiento del navegador *es* la base de datos. Lo mitiga el aislamiento por origen |
| 22 | extensiones del navegador maliciosas | **Aceptada** · una extensión con permiso sobre el origen lee cualquier cosa; ninguna defensa del documento lo impide |
| 23 | mensajes de error con fugas | **Mitigada por ausencia** · no hay servidor que filtre nada |
| 24 | registros con fugas | **Mitigada por ausencia** |
| 25 | redirecciones inseguras | **Mitigada** · 0 escrituras de `location`, 0 `window.open` |
| 26 | suplantación de webhook | N/A |
| 27 | orden no autorizada | N/A |
| 28 | cuenta equivocada | **Mitigada parcialmente** · la selección es explícita y el registro rápido la muestra en la vista previa |
| 29 | estado de cuenta rancio | **Mitigada** · todo es derivado de datos locales; no hay caché que envejezca |
| 30 | sincronización parcial | N/A |

**Resumen honesto: 5 mitigadas, 4 parciales, 3 aceptadas con motivo, 1 no verificada,
17 N/A hoy.** Las 17 se convertirán en reales el día que exista el backend, no antes.

---

## 5 · Dónde discrepo del orden propuesto

El encargo propone veinte pasos que empiezan por *backend seguro* y acaban en
*auditoría final*. Con lo medido, ese orden gasta meses antes de tocar el único riesgo
que existe hoy.

**El orden que sale de la evidencia:**

1. **Cerrar la compartición del artefacto.** Un clic. Es el único riesgo vivo,
   confirmado y explotable, y el trabajo más caro de la lista no lo toca.
2. **`permissions: contents: read` en `pruebas.yml`.** Dos líneas.
3. **Validar `im.data` al importar** — lista blanca de esquemas — con su prueba.
4. **Validar tipos en la frontera de importación**, para que el rechazo sea al
   importar.
5. Y sólo entonces, si sigue haciendo falta, el backend.

Los pasos 1 a 4 se hacen en una tarde y eliminan todo lo que hoy es explotable. El
paso 5 es un proyecto de semanas que sólo tiene sentido **cuando exista una credencial
de bróker que proteger** — y hoy no existe ninguna.

---

## 6 · Lo que NO voy a hacer, y por qué

**No voy a escribir adaptadores de NinjaTrader ni de IBKR en esta pasada.** El propio
encargo lo ordena: *«Use the CURRENT official provider documentation… If the official
API behavior is ambiguous: STOP that implementation point, document the uncertainty,
and do not guess»*.

Desde esta sesión **no puedo leer esa documentación de forma fiable**, y escribir un
adaptador de bróker desde la memoria del modelo es exactamente lo que esa regla
prohíbe. Un adaptador inventado que *parece* correcto es peor que ninguno: se prueba
contra un doble que también inventé, sale verde, y falla el día que toca dinero real.

Lo que sí puedo preparar sin inventar nada: el **modelo canónico** de cuenta, posición,
orden y ejecución, y la **procedencia** —que ya existe: `source` está en el modelo con
tres estados y `ninjatrader` / `ibkr` son dos valores más del mismo campo—. Eso es
contrato, no comportamiento de API.

---

## 7 · Estado de seguridad

Siguiendo la instrucción de no declarar nada absoluto:

| | |
|---|---|
| **ENDURECIDO** | XSS (escape en todo sumidero) · ejecución dinámica (cero) · canales entre orígenes (cero) · cadena de suministro (cero dependencias de ejecución, 0 vulnerabilidades) · secretos (ninguno en 64 commits) · redirecciones (cero) |
| **LIMITACIONES CONOCIDAS** | los 160 `innerHTML` se siguieron por **clase** de dato, no uno a uno · `im.data` sin lista blanca de esquemas · la importación no valida tipos · `pruebas.yml` sin `permissions` |
| **NO VERIFICADO** | el ajuste por defecto de permisos de Actions del repositorio (no legible desde aquí) · las cabeceras que la plataforma del artefacto fija por su cuenta · el comportamiento real del `db` de claude.ai |
| **RIESGOS QUE QUEDAN** | **el artefacto compartido públicamente con datos reales** · el robo de `localStorage` por una extensión del navegador · el balizamiento por un respaldo importado |

**No se declara «seguro».** Se declara qué se comprobó, cómo, y qué no.
