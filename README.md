# TURBOK2 · Cabina

Cockpit personal de trading de futuros e inversiones. Una sola página, sin build
ni framework: pre-sesión, reglas duras, cuentas de prop firm, journal de futuros,
cartera de inversiones, playbook y tesis por jugada.

No es un producto para terceros. Es la herramienta de una persona, y este
repositorio es su fuente de verdad.

---

## Qué hace

| | |
|---|---|
| **Pre-sesión** | lista antes de operar, archivada con la sesión a la que pertenece |
| **Reglas duras** | instrumento, pérdida máxima del día, pérdidas seguidas, tope de ganancia, contratos máximos |
| **Cuentas prop** | balance, drawdown estático o trailing, colchón, consistencia, ciclo de vida |
| **Journal de futuros** | P&L exacto en la rejilla de ticks, R real y planeada, MAE/MFE |
| **Inversiones** | posiciones, lotes, dividendos, TIR de la cartera |
| **Playbook y tesis** | una tesis por jugada, con aritmética por tipo de activo |

---

## Arquitectura

```
index.html                 la aplicación completa: HTML + CSS + JS en un archivo
  └─ QuantEngine (bundle)  incrustado, ~2.100 líneas: todo el cálculo

engine/quant/*.js          los 11 módulos FUENTE del motor
engine/QuantEngine.bundle.js   generado por `npm run bundle`
engine/MathEngine.js       motor v1, REFERENCIA histórica — la app no lo usa

test/                      58 archivos · 52 pruebas + 6 herramientas
  └─ correr.mjs            el runner: un proceso por archivo, veredicto por salida
```

**La cadena del cálculo, y quién vigila cada eslabón:**

```
engine/quant/*.js  ──npm run bundle──►  QuantEngine.bundle.js  ──a mano──►  index.html
   motor-quant (329)                      motor-bundle --check         capa2 §15
   motor-math (92)                                                     invariantes
                                                                       equivalencia
```

El último es distinto de los otros tres: `capa2` §15 compara el **texto** del motor
incrustado, `invariantes` compara sus **números** con los de los módulos fuente, y
`equivalencia` compara los números del motor con los de **la copia que la UI tenía
de esos mismos cálculos**.

`index.html` reimplementaba cinco de ellos. Van cuatro consolidados —`riskEngine`,
`gainCap`, `consistency`/`consEngine` y la tercera copia que vivía dentro de
`dayAgg`— y queda `ddEngine`, más `evaluateAccountRules` que depende de él. La tabla
de umbrales duplicada ya no existe: los 0.50 / 0.75 / 1.00 viven en un solo sitio, y
la app sólo traduce el código del motor a lo que necesita la pantalla.

`ddEngine` **no** está pendiente por falta de tiempo: en una cuenta quemada da números
distintos del motor —colchón `0` contra `−300`, usado `500` contra `800`— y elegir
cuál muestra la tarjeta es una decisión de producto, no un refactor.

Y medir la consistencia donde el escenario dorado no llegaba destapó **un número
inventado que la tarjeta imprime**: en una cuenta sin ningún día verde, «Ganancia que
falta para cobrar: +$160», donde 160 es la magnitud de la pérdida. El motor devuelve
0. Se conserva lo que la app dice hoy, pero aislado en dos líneas marcadas, no
repartido. Las tres diferencias están **afirmadas** en `equivalencia`, con sus
números, en vez de olvidadas. Detalle en [PROTOCOLOS.md](PROTOCOLOS.md) §16.

Lo que hace verificable esa consolidación es que `equivalencia` lleva los dieciséis
números de **antes** de tocar nada escritos a mano como literales. Comparar la app
contra el motor deja de significar algo en cuanto la app *es* el motor; comparar la
app contra los números de antes sigue significándolo.

`index.html` **no carga ningún archivo externo**: cero `<script src>`, cero
`import`. El motor va incrustado, y la app consume 18 de sus 73 funciones.

---

## Cómo ejecutar

```sh
npm ci                  # instala Playwright (fijado en 1.56.1)
npm run serve           # http://localhost:8000/
```

También se abre como archivo suelto (`file://`), con las limitaciones de abajo.

## Cómo ejecutar las pruebas

```sh
npm run preview         # regenera test/preview.html desde index.html — NO es opcional
npm test                # las 55 suites
npm test motor          # sólo el motor
npm test humo           # sólo el smoke test de producción
npm run compuerta       # la suite + la tabla de la cadena (lo que corre CI)
```

## Cómo construir el bundle

```sh
npm run bundle                          # regenera el bundle desde los 11 módulos
node engine/quant/bundle.mjs --check    # comprueba que está al día, sin escribir
```

Después hay que **reincrustarlo en `index.html`** desde `const QE = (function () {`.
`capa2 §15` falla si lo incrustado no es exactamente el bundle.

## Cómo publicar

Dos destinos, y el código es el mismo:

- **Artefacto de claude.ai** — la experiencia principal. Ver [ARTEFACTO.md](ARTEFACTO.md).
- **GitHub Pages** — el respaldo web. Lo publica `.github/workflows/pagina.yml`,
  y sólo después de que la suite pase en verde.

---

## Registro rápido

El cuello de botella de un journal no es el análisis: es que la operación **se
registre**. Un formulario de quince campos después de una sesión mala produce cero
registros, y un registro incompleto vale más que uno que no existe.

`+ Rápido`, en la barra superior y por tanto en las seis superficies, abre un panel
donde se escribe una línea:

```
NQ +185          NQ L +185          MNQ short -90
```

Y guarda. La app completa lo que **ya sabe** —fecha, hora ET, cuenta seleccionada— y
deja vacío lo que no puede saber.

**No es un segundo modelo.** Escribe con `coll("trades").set()`, el mismo `tradeCalc`
deriva el P&L y el mismo motor lo calcula. Se apoya en dos cosas que ya existían:

- el campo `pnl` del editor —«Resultado $ (manual)», «vacío = se calcula»— y la regla
  del motor que lo respeta: *«un P&L escrito a mano siempre gana sobre el calculado:
  es un hecho reportado, no una estimación»*;
- la sesión, que **no se guarda**: se deriva de la hora con `sesAt(minOfTime())`. La
  vista previa la muestra como lo que es, un valor derivado.

**Nunca inventa.** Medido: `calcularTradeApp({instrument:"NQ", direction:"long",
pnl:185})` da `pnlEff 185`, `rReal null`, `riskUsd null` y el motivo en `calcError`.
El motor ya se negaba a inventar la R y el riesgo que no puede saber; el panel lo dice
en pantalla en vez de esconderlo.

**La vista previa es obligatoria.** No hay camino que guarde sin mostrar antes qué se
entendió, qué queda vacío y qué no se reconoció:

| entrada | qué hace |
|---|---|
| `NQ ES +185 +90 pepino` | se niega: «dos instrumentos», «dos números», y nombra `pepino` |
| `NQ 185` | avisa de que un número sin signo se lee como **ganancia** |
| `+185` | no se puede guardar: falta el instrumento, y lo dice |
| `ZZZ +185` | un instrumento que el motor no conoce no se acepta |

La calidad de ejecución y las etiquetas son opcionales y usan **los campos que ya
existían**: `quality` (A · según protocolo / B · desviación menor / C · fuera del
protocolo) y `tags`. No hay taxonomía nueva.

### La procedencia, y por qué su ausencia significa algo

Cada operación guarda de dónde vino:

| | |
|---|---|
| `quick_add` | escrita en el panel rápido |
| `manual` | escrita en el editor completo, a partir de ahora |
| *ausente* | **anterior al campo: no se sabe** |

Las operaciones que ya existían **no se rellenan hacia atrás**. Marcarlas todas como
`manual` habría sido inventar cientos de procedencias que nadie comprobó — y el único
propósito del campo es medir si las entradas rápidas salen peor documentadas que las
completas, que es justo la comparación que ese relleno contaminaría. Protocolo 17.

---

## Seguridad

Auditada el 2026-09-27; el informe y el modelo de amenazas están en
[docs/SEGURIDAD-2026-09-27.md](docs/SEGURIDAD-2026-09-27.md). Lo medido:

| | |
|---|---|
| `eval` · `new Function` · `document.write` | **0** |
| `postMessage` · `window.open` · escrituras de `location` | **0** |
| `XMLHttpRequest` · `WebSocket` · `EventSource` · `sendBeacon` | **0** |
| `fetch` | **1**, con lista blanca de esquemas |
| scripts de terceros | **0** — el motor va incrustado |
| orígenes externos | **1**, las fuentes de Google |
| dependencias de ejecución | **ninguna** · `npm audit` → 0 vulnerabilidades |
| secretos en 64 commits de historia | **ninguno** |

Las cadenas que escribe el usuario se siguieron hasta su sumidero: todas acaban en
`textContent` o pasan por `esc()`. **No se declara «seguro»** — se declara qué se
comprobó y qué no; la sección *Estado de seguridad* del informe separa lo endurecido,
lo limitado, lo no verificado y los riesgos que quedan.

**El riesgo vivo no está en el código**: el artefacto está compartido como «cualquiera
que tenga el enlace» con datos reales dentro. Se arregla con un clic en Share, y
ningún backend lo mitigaría.

La **importación** es la única superficie que acepta datos escritos por otra persona,
y tiene tres pasos con una **confirmación escrita** al final: hay que teclear
`IMPORTAR`. Valida así:

| | |
|---|---|
| sección mal formada | **para la importación entera** y dice cuál |
| registro sin `id` | **se repara** con la clave bajo la que venía |
| registro irreparable | se descarta **y se cuenta**, y el recuento sale en la vista previa |
| identificador repetido | para la importación y lo nombra |

Y la **exportación** falla en vez de degradar: si la base del artefacto no responde,
**no se produce una copia a medias**. Antes se caía a `localStorage` en silencio y
anunciaba «4 KB · 1 sesión» con dos días perdidos en la nube. Protocolo 19.

`test/importar.mjs` vigila las dos direcciones — que no entre basura, que no se pierda
nada legítimo, y que un respaldo incompleto no llegue a existir.

`test/seguridad.mjs` vigila estas propiedades. Ninguna es visible en pantalla, que es
justo por lo que necesitan un guardián.

---

## La compuerta de publicación

`npm run compuerta` (`test/compuerta.mjs`) es lo que decide si esto se publica.
No es una suite nueva: **lanza `correr.mjs` una sola vez** y todas sus filas
dependientes de pruebas derivan de esa única salida, así que no cuesta una
corrida extra. Lo que añade es recorrer la cadena entera eslabón por eslabón:

```
fuente → motor → bundle → index.html → pages → artefacto
```

Imprime 20 filas con tres veredictos, y la distinción es el punto del ejercicio:

| | |
|---|---|
| `PASS` | ejecutado y comprobado |
| `FAIL` | la comprobación se hizo y salió mal — sale con código 1 |
| `UNKNOWN` | **no puede comprobarse automáticamente desde aquí** |

Hoy son **16 PASS · 0 FAIL · 4 UNKNOWN** de 20 filas. Las cuatro `UNKNOWN` son fronteras de
plataforma, no pruebas que falten: que el artefacto publicado sea igual a
`index.html`, que el `db` real de claude.ai se comporte como el doble de
`capsula.mjs`, que la URL de Pages sirva, y que el CDN de GitHub entregue lo
verificado. Ninguna se convierte en `PASS` por conveniencia, y **una fila
`UNKNOWN` nunca afecta al código de salida** — se nombra y se sigue.

**Por qué no puede mentir**: cada fila que depende de una prueba busca su línea
de evidencia en la salida de la suite. Si esa línea **no aparece**, la fila es
`FAIL` con el motivo «no aparece «X» en la salida de la suite», no `PASS`. Un
cambio en el formato de salida de `correr.mjs` rompe la compuerta en rojo, no la
deja pasar en silencio. Comprobado con sabotaje en las dos direcciones:

| sabotaje | resultado |
|---|---|
| tres roturas reales a la vez (bundle desincronizado, un tercer `<style>` en `index.html`, una limitación borrada de la doc) | 5 filas en `FAIL` —las dos extra son cascadas correctas—, las 4 `UNKNOWN` intactas, `EXIT=1` |
| la etiqueta de una prueba renombrada: la prueba sigue corriendo, pero su línea de evidencia desaparece | **la suite entera queda 51/51 en verde con `exit 0`** y la compuerta cierra igual: `11 PASS · 1 FAIL · 4 UNKNOWN`, `EXIT=1`, por evidencia ausente |

---

## Cómo funciona la persistencia

**No son lo mismo.** Depende de si el entorno concede la capacidad `db`:

```
persistSettings()   debounce 500 ms ─┬─ con db  →  db.doc("settings/main").set()
persistDay()        debounce 400 ms ─┘  sin db  →  localStorage["cabina-mnq:v1"]
```

Es un `if/else`: **cuando hay `db`, no se escribe en `localStorage`**, y al
contrario. La app arranca en `localStorage` y **sube** a `db` si la capacidad
resuelve.

| | Artefacto | GitHub Pages / `file://` |
|---|---|---|
| Dónde vive el estado | almacén `db` de documentos | `localStorage` de ese navegador |
| Entre dispositivos | **sí**, en vivo por `onSnapshot` | **no** |
| Subir imágenes | sí (`assets`) | no |
| Respaldo JSON | por la cápsula, con permiso | descarga normal |
| Se pierde si borras datos del sitio | no | **sí** |

---

## Limitaciones conocidas

- **Sin sincronización fuera del artefacto.** En Pages los datos viven en el
  `localStorage` de ese navegador. No es un fallo: es lo que una página estática
  puede hacer.
- **`file://` tira el almacén al recargar**, de forma intermitente. Por eso el
  smoke test usa HTTP y dos pruebas abren una pestaña nueva en vez de recargar.
- **33 de las 52 pruebas de `test/` no afirman nada**: miden y registran. Su
  único modo de fallo es romperse. Las 15 que afirman están contadas abajo, y
  tanto el número como la lista los imprime `npm test`, no un `grep` sobre el
  código — ver protocolo 14.
- **El motor tiene 55 funciones que la app no usa**, incluido el módulo de
  *compliance*: están probadas pero no conectadas a producción.
- **`pagina.yml` lleva un `continue-on-error`** en `configure-pages`. Si fallara
  por un motivo distinto a «Pages sin activar», el despliegue se salta y el run
  queda verde.
- **`test/perf.mjs` no corre**: necesita un baseline que no está en el repositorio.
- **La prueba de la capa `db` fija el contrato, no la plataforma.** Si claude.ai
  cambiara ese contrato, `capsula.mjs` seguiría verde y el artefacto estaría roto.
  Eso sólo lo detecta abrir el artefacto.
- **Si el `db` del artefacto falla al escribir, el dato se queda en memoria.** La
  app avisa con el código real del error, pero no cae a `localStorage`, así que al
  recargar se pierde. Afirmado tal cual es en `capsula.mjs`.

---

## Estado actual

| | |
|---|---|
| Suites que se ejecutan | **55** (52 de `test/` + 3 del motor) |
| Aserciones del motor | **421** (`quant` 329 · `math` 92) |
| Aserciones de navegador y guardianes | **666** en 19 archivos — las cuenta la propia suite |
| Cobertura de la capa `db` del artefacto | **28** aserciones contra un doble fiel del contrato |
| Smoke test de producción | 23 comprobaciones sobre HTTP |
| Compuerta de publicación | **16 PASS · 0 FAIL · 4 `UNKNOWN`** de 20 filas |
| CI | ejecuta `npm run compuerta`: la suite entera más la tabla — log leído, `12 PASS · 0 FAIL · 4 UNKNOWN` en 479 s |
| Secretos técnicos en el repositorio | ninguno |

Detalle y evidencia en [PROTOCOLOS.md](PROTOCOLOS.md). La historia de cada fallo
y su arreglo está en [docs/HISTORIA.md](docs/HISTORIA.md).

---

## Lo que NO está hecho

Nada de esto existe hoy, y decirlo importa más que prometerlo:

- backend, autenticación, multiusuario
- base de datos propia fuera del artefacto
- importación desde bróker o CSV
- aplicación móvil
- versionado de las reglas de cada prop firm por fecha de vigencia

---

## Licencia

**Sin licencia seleccionada todavía.** Sin una, rige el derecho de autor por
defecto: el código es público para leerlo y nadie tiene permiso para usarlo,
copiarlo ni derivarlo. Se elegirá —o se decidirá no tener— cuando haga falta.
