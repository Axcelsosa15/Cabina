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

test/                      54 archivos · 48 pruebas + 6 herramientas
  └─ correr.mjs            el runner: un proceso por archivo, veredicto por salida
```

**La cadena del cálculo, y quién vigila cada eslabón:**

```
engine/quant/*.js  ──npm run bundle──►  QuantEngine.bundle.js  ──a mano──►  index.html
   motor-quant (329)                      motor-bundle --check         capa2 §15
   motor-math (92)                                                     invariantes
```

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
npm test                # las 51 suites
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

## La compuerta de publicación

`npm run compuerta` (`test/compuerta.mjs`) es lo que decide si esto se publica.
No es una suite nueva: **lanza `correr.mjs` una sola vez** y todas sus filas
dependientes de pruebas derivan de esa única salida, así que no cuesta una
corrida extra. Lo que añade es recorrer la cadena entera eslabón por eslabón:

```
fuente → motor → bundle → index.html → pages → artefacto
```

Imprime 16 filas con tres veredictos, y la distinción es el punto del ejercicio:

| | |
|---|---|
| `PASS` | ejecutado y comprobado |
| `FAIL` | la comprobación se hizo y salió mal — sale con código 1 |
| `UNKNOWN` | **no puede comprobarse automáticamente desde aquí** |

Hoy son **12 PASS · 0 FAIL · 4 UNKNOWN**. Las cuatro `UNKNOWN` son fronteras de
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
- **33 de las 48 pruebas de `test/` no afirman nada**: miden y registran. Su
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
| Suites que se ejecutan | **51** (48 de `test/` + 3 del motor) |
| Aserciones del motor | **421** (`quant` 329 · `math` 92) |
| Aserciones de navegador y guardianes | **455** en 15 archivos — las cuenta la propia suite |
| Cobertura de la capa `db` del artefacto | **28** aserciones contra un doble fiel del contrato |
| Smoke test de producción | 23 comprobaciones sobre HTTP |
| Compuerta de publicación | **12 PASS · 0 FAIL · 4 `UNKNOWN`** de 16 filas |
| CI | ejecuta `npm run compuerta`: la suite entera más la tabla de la cadena |
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
