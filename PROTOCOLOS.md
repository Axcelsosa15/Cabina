# Protocolos

Procedimientos de este repositorio. Ninguno es teórico: cada uno existe porque
algo falló primero, y debajo de cada protocolo está escrito **qué falló**. Sin esa
línea el protocolo es una opinión, y las opiniones se saltan cuando hay prisa.

La columna que más importa es la última: **quién lo vigila**. Un protocolo que
sólo vive en un documento se podrece igual que se podrió `preview.html` — seis
días en verde midiendo una copia congelada. Los que dicen *humano* son los
frágiles, y están marcados para que se sepa.

La última fila vigila a las demás: `capa2` §14 falla si algún documento cita
una sección del guardián que no existe. Se añadió porque §9, §10 y §11 se
citaron durante una sesión entera con una numeración que sólo estaba en la
cabeza de quien escribía — en el fichero únicamente estaban etiquetadas §12 y
§13, así que nadie podía seguir la referencia.

| # | Protocolo | Quién lo vigila |
|---|---|---|
| 1 | Publicar un cambio en la app | `capa2` §9 (parcial) + humano |
| 2 | Antes de decir «verde» | `correr.mjs` |
| 3 | Añadir o cambiar una regla de `capa2` | humano |
| 4 | Añadir una prueba | `capa2` §9, §13 |
| 5 | Qué nunca entra al repositorio | humano |
| 6 | Cuando CI falla | humano |
| 7 | Republicar el artefacto | `capa2` §12 (parcial) |
| 8 | Al clonar | humano |
| 10 | Tocar el motor de cálculo | `motor-bundle` + `capa2` §15 |
| 11 | Una aserción puede fallar por el motivo correcto | humano |
| 12 | El porcentaje de riesgo se pasa como fracción | `invariantes` |
| 13 | Probar una plataforma que no está en el repositorio | `capsula` + humano |
| 14 | No contar aserciones leyendo el código | `correr.mjs` |
| 15 | Un `UNKNOWN` nunca se convierte en `PASS` | `compuerta` |
| 16 | La capa de riesgo: una sola fuente para cada cálculo | `equivalencia` |
| 17 | Un campo nuevo que se persiste: la ausencia significa algo | `rapido` |
| 18 | Un dato importado no es una URL: se valida el esquema | `seguridad` |
| 19 | Un respaldo a medias es peor que ninguno | `importar` |
| 20 | Un cambio que no se guardó no puede parecer guardado | `guardado` |
| 21 | Una medición no se hace compartiendo la máquina | *(método)* |
| — | *Que esta tabla no mienta* | `capa2` §14 |

---

## 1 · Publicar un cambio en la app

`index.html` es la fuente. `test/preview.html` se **genera** y no se versiona.

```
1. editar index.html          (o traer el cuerpo: node test/sync-index.mjs <ruta/cabina.html>)
2. npm run preview            ← regenera test/preview.html desde index.html
3. npm test                   ← 45/45 o no se sigue
4. git commit && git push
5. republicar el artefacto    (ver protocolo 7)
```

**El paso 2 no es opcional y es el que se olvida.** Las pruebas cargan
`preview.html`, no `index.html`. Si no se regenera, miden el archivo viejo.

> **Qué falló:** siete pruebas apuntaron durante seis días a un `preview.html`
> obsoleto — 633 KB contra 774 KB, sin una sola mención de `posPerf`, `INV`,
> `TES`, `tesisCalc` ni `QE.dimensionar`. Estuvieron en verde todo ese tiempo
> midiendo código muerto, y se anunció «42/42» cuatro veces. Una imprimía
> `cuenta en Cabina del journal: undefined` sin que nadie lo mirara.

`capa2` §9 comprueba que `preview.html` contiene los símbolos de `index.html`,
así que caza un preview rancio. No caza que te olvides del paso 5.

---

## 2 · Antes de decir «verde»

> **La regla, en una línea:** no aceptar «verde», «sincronizado», «publicado» ni
> un número de tests como evidencia **hasta comprobar exactamente qué se
> ejecutó**.

Esta sesión la violó cuatro veces, y cada una parecía un hecho:

| Se dijo | Qué era en realidad |
|---|---|
| «42/42 en verde» | siete pruebas medían un `preview.html` de seis días antes |
| «44/44 en verde» | 37 procesos no se rompieron; las aserciones no se miraban |
| «45/45 en verde» | no incluía las 421 aserciones del motor: nada las ejecutaba |
| «todo el código está subido» | cierto, y contestaba a la pregunta equivocada |

No se reporta un número sin haber mirado la salida.

- **Un código de salida 0 no es prueba de nada.** De 45 archivos, 30 sólo
  *miden* (imprimen mediciones, no afirman) y salir 0 es correcto en ellos. De
  los que afirman, varios no contaban sus fallos.
- `correr.mjs` marca rojo si el proceso **se rompe O si la salida contiene ❌**,
  e imprime las líneas que fallaron. Eso cubre los 45 y los que vengan.
- Si un test nuevo afirma algo, su `process.exit` debe reflejar sus aserciones
  de todos modos. El runner es la red, no la excusa.

> **Qué falló:** `correr.mjs` sólo miraba el código de salida. `cmd.mjs` falló
> una aserción real —la paleta no encontraba la cuenta— y la suite lo contó como
> ✅. Es decir: «44/44 en verde» significaba «37 procesos no se rompieron». Se
> descubrió viendo el ❌ en pantalla, no razonando.

---

## 3 · Añadir o cambiar una regla de `capa2`

**Una regla no se da por buena hasta verla roja.**

```
1. escribir la regla
2. sabotear el código que vigila     ← a propósito, en el sentido que la regla prohíbe
3. confirmar que se pone ROJA y que el mensaje nombra el problema
4. restaurar
5. confirmar que el md5 del cuerpo de index.html no cambió
```

Y la regla tiene que afirmar **una razón cierta**. Si dice «sin esto X revienta»,
hay que haber comprobado que X revienta.

> **Qué falló:** dos veces en el mismo turno. §12 decía «sin el ternario
> `window.claude && … : null` la página servida revienta en el primer `await`»:
> falso, el `catch` de al lado ya asigna `null`. Reescrita para vigilar el
> `catch`: igual de falso, quitarlo deja que cubra el ternario. Son defensa
> redundante y cada una basta sola, así que la regla acabó exigiendo **al menos
> una** — lo único cuya ausencia rompe algo. Antes, un sabotaje a §10 no llegó a
> aterrizar y el guardián se quedó en verde sin que nadie lo notara.

> Y del propio encabezado de `capa2.mjs`: *«un guardián que falla siempre acaba
> ignorado, que es peor que no tenerlo»*. Un falso positivo es fatal; un falso
> negativo es tolerable.

---

## 4 · Añadir una prueba

- **Ninguna ruta absoluta del sistema.** Ni para leer, ni para escribir, ni para
  capturas. Lo relativo sí: `process.cwd() + '/preview.html'`,
  `new URL('./x', import.meta.url)`. Vigilado por `capa2` §13.
- **La semilla es `test/semilla.json`**, importada como `SEMILLA` desde
  `espera.mjs`. Una sola copia, resuelta contra la ubicación del módulo.
- **Nada de esperas fijas.** `espera.mjs` tiene `quieto`, `trasAccion`,
  `trasGuardar`, `enDisco`, `arrancada`, `siembra`. Ojo con los dos guardados
  con retardo: `persistDay` a 400 ms y `persistSettings` a 500 ms — no son
  `setTimeout` literales, así que no salen buscando `setTimeout(`; para eso está
  `enDisco()`.
- **Sembrar con `siembra()`**, nunca con `addInitScript` + `localStorage.getItem`
  condicional. Un `setItem` **incondicional** en `addInitScript` sí es fiable —
  es lo que hacen 24 archivos— pero corre en **cada navegación**, así que un test
  que recarga a propósito se re-siembra a sí mismo.
- **`page.reload()` sobre `file://` tira el almacén de forma intermitente.** Para
  comprobar que algo sobrevive a reabrir, se lee lo que quedó escrito y se abre
  una **pestaña nueva** sembrada con exactamente eso (`sync.mjs` y `borrar.mjs`).
  Recargar mide el navegador, no la app.

> **Qué falló:** tres pruebas leían `/tmp/semilla.json`, un archivo que existía
> sólo en el contenedor donde se escribieron. Verdes aquí, ENOENT en CI. Antes,
> 44 de 48 archivos importaban Playwright por
> `/opt/node22/lib/node_modules/playwright/index.mjs`: nadie que clonara el
> repositorio podía correr una sola prueba. Y `tesis.mjs` iba inestable 8 de 10
> veces porque `addInitScript` con un `getItem` condicional no es fiable en
> `file://` — al arrancar el almacén no está ligado, `getItem` devuelve null y la
> semilla se reescribe encima.

> **Y lo que costó más de encontrar:** `borrar.mjs` falló en CI y no aquí — 33 s
> en el runner contra 18 s en local. Tres hipótesis mías fueron falsas (un
> debounce, una carrera de CPU a 8× de estrangulamiento, una caducidad de la
> papelera) antes de que la causa apareciera escrita **en este mismo
> repositorio**: el comentario de `sync.mjs` ya decía que `file://` tira el
> almacén al recargar. Y al arreglarlo salió un segundo defecto, peor: la semilla
> resucitaba las 2 operaciones borradas en la recarga, así que «vuelven las 6
> operaciones» pasaba demostrando que la semilla se re-ejecutó, no que
> «Deshacer» funcione. Medido: 6 en disco antes del clic. Ahora se comprueba
> además que al reabrir el borrado **sigue hecho** (4), que era la mitad que
> faltaba.

---

## 5 · Qué nunca entra al repositorio

Es público. No entra:

- **Operaciones, cuentas o reglas reales.** Los fixtures son **sintéticos**: la
  misma forma, todos los valores inventados.
- **Capturas de gráficos de operaciones.** Las del artefacto quedan
  inventariadas en `ARTEFACTO.md` por id y sha256, y fuera del repositorio.
- Claves, tokens, correos.

Subir algo aquí **no se deshace**: queda en el historial y se indexa.

> **Qué falló:** la semilla de `/tmp` que tres pruebas leían eran datos reales —
> 18 operaciones MNQ, dos cuentas prop con su tamaño y su drawdown, y seis reglas
> con el criterio de su autor escrito («MGC eliminado: instrumento perdedor
> documentado»). Estuvo a un `git add` de ser pública.

---

## 6 · Cuando CI falla

**Leer el log antes de teorizar.** Siempre. Sin excepción.

```
mcp__github__actions_list   → encontrar el run y su conclusión
mcp__github__get_job_logs   → failed_only: true, return_content: true
```

Un fallo de 11 segundos no ejecutó nada: murió en el montaje. Un fallo de siete
minutos sí corrió la suite y está diciendo algo del código.

> **Qué falló:** en esta sesión, tres diagnósticos por lectura de código fueron
> desmentidos por la primera medición: un «filtro fantasma» que no existía, un
> test lento que se culpó al sondeo de rAF cuando era la siembra, y la causa del
> parpadeo. Y la propia suite de CI se empujó sin haberla ejecutado nunca en un
> runner: tres fallos distintos seguidos, uno por push.

---

## 7 · Republicar el artefacto

- **Omitir `capabilities`.** Eso arrastra la declaración guardada intacta y
  mantiene fijado el contrato. Pasarla de nuevo es una declaración **completa**:
  lo que no se repita queda revocado.
- **Mover el contrato es deliberado**, nunca un efecto colateral de editar.
- El contenido es `index.html` **desde el segundo `<style>`** en adelante. Lo de
  antes y después es la cáscara de página estática que añade `sync-index.mjs`.
- `permissions` **no se declara**: es built-in y declararla la rechaza el
  contrato.

**Hoy `index.html` va por delante de lo publicado**, en comentarios y en una
función muerta — cero cambio de comportamiento. El alcance exacto y cómo cerrar
la divergencia están en [ARTEFACTO.md](ARTEFACTO.md), y ahí queda escrito que en
cuanto toque una línea que se EJECUTA deja de ser aceptable.

Detalle completo en [ARTEFACTO.md](ARTEFACTO.md). `capa2` §12 vigila que toda
capacidad que el código llame esté documentada, que `permissions` no figure entre
las declaradas y que cada llamada degrade a `null`.

> **Qué falló:** durante semanas el repositorio no registraba **nada** de esto.
> El dato de qué se declara al publicar vivía únicamente en la llamada de
> publicación, que no está en ningún archivo: quien clonara veía un HTML y
> ninguna forma de saber por qué el mismo archivo se comporta distinto según
> dónde se abra.

---

## 8 · Al clonar

Comprueba que el remoto tiene refspec:

```sh
git config --get-all remote.origin.fetch
# vacío → git fetch no trae nada y origin/main no existe:
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
```

> **Qué falló:** en el clon donde se desarrolló esto, `remote.origin.fetch`
> estaba vacío. `git fetch origin main` no creaba `origin/main`, así que **no se
> podía comprobar localmente si algo estaba subido o si faltaba traer algo**. Se
> resolvió comparando el sha del árbol: `git write-tree` contra
> `git rev-parse origin/main^{tree}`. Si coinciden, cada byte rastreado está en
> el remoto.

---

## 10 · Tocar el motor de cálculo

El motor existe **tres veces**, y sólo una corre:

```
engine/quant/*.js   ──npm run bundle──►  engine/QuantEngine.bundle.js   ──a mano──►  index.html
   (11 módulos)                              (lo que se versiona)          (lo que EJECUTA el usuario)
```

Así que:

```
1. editar el módulo en engine/quant/
2. npm run bundle                    ← regenera el bundle
3. reincrustar el bundle en index.html, desde `const QE = (function () {`
4. npm test                          ← motor-quant, motor-math, motor-bundle y capa2 §15
```

Los cuatro eslabones están vigilados, cada uno por su pieza:

| Eslabón | Quién lo comprueba |
|---|---|
| los módulos hacen la cuenta bien | `motor-quant` (329 aserciones) |
| el motor v1 de referencia sigue válido | `motor-math` (92 aserciones) |
| el bundle es lo que producen los módulos | `motor-bundle` (`bundle.mjs --check`) |
| lo incrustado es exactamente el bundle | `capa2` §15 |

> **Qué falló:** nada todavía, y eso era el problema. La cadena era manual de
> principio a fin: `bundle.mjs` existía pero **no estaba en `package.json`**, y
> nada comparaba los tres. Estaba intacta por disciplina, no por comprobación.
> Peor: `correr.mjs` sólo escaneaba `test/`, así que las **421 aserciones** del
> motor —`quant.test.js` con 329 y `MathEngine.test.js` con 92— estaban en el
> repositorio y **no se ejecutaban jamás**. El «45/45 en verde» no las incluía.
> Es el fallo del `preview.html` rancio un nivel más abajo, y sobre la
> matemática del dinero: dimensionado en la rejilla de ticks, IRR, drawdown,
> Monte Carlo de supervivencia.
>
> Y `MathEngine.test.js` no sólo no corría: **estaba roto**. Usa `require()`, y
> el `"type": "module"` que se añadió al crear `package.json` lo dejó sin
> compilar. Dos commits en ese estado sin que nada lo dijera, porque nada lo
> ejecutaba.

---

## 12 · El porcentaje de riesgo se pasa como FRACCIÓN

`QE.dimensionar` acepta las dos formas y las distingue **por el valor**:

```
riesgoPct >= 1   se lee como PORCENTAJE   (1 -> 1%,  2 -> 2%,  50 -> 50%)
riesgoPct <  1   se lee como FRACCIÓN     (0.01 -> 1%,  0.005 -> 0.5%)
```

Está probado a propósito (`riesgoPct: 0.01` → 12 contratos), así que **la
convención del motor no se toca**. Lo que se hace es no depender de ella: quien
llame desde la interfaz pasa `pc / 100`, una fracción, que el motor lee igual en
todo el rango.

> **Qué falló:** el campo se llama «Riesgo por operación (%)» y su `step` es
> `0.1`, así que invita a escribir 0.5 queriendo medio por ciento. El motor leía
> 50%. Medido por la app, cuenta de 25 000 con stop de 10 puntos MNQ:
>
> | escrito | contratos antes | contratos ahora |
> |---|---|---|
> | 0.25 | 625 | 3 |
> | 0.5 | 1250 | 6 |
> | 1 | 12 | 12 |
> | 2 | 25 | 25 |
> | 50 | 625 | 625 |
>
> Un **100× en el tamaño de posición**, en el número más peligroso del sistema.
> No era silencioso —el motor avisaba «Arriesgar 50% por operación es
> agresivo»— pero el aviso decía 50% para quien había escrito 0.5, y nada lo
> bloqueaba. Arreglado en el sitio de llamada, no en el motor: para 1 y 2 el
> resultado no cambia, y de paso un riesgo menor al 1% pasa a ser expresable.

`test/invariantes.mjs` fija la doble lectura para que deje de sorprender:
comprueba que `0.5` y `50` significan lo mismo. Si alguien cambia la convención,
rompe una prueba en vez de un tamaño de posición.

---

## 11 · Una aserción tiene que poder fallar por el motivo correcto

Pasar y **demostrar lo que se busca** no son lo mismo. Tres formas de pasar por el
motivo equivocado, las tres encontradas aquí:

1. **La semilla hace el trabajo.** `borrar.mjs` afirmaba «vuelven las 6
   operaciones» tras recargar. La semilla se re-sembraba en cada navegación, así
   que volvían **antes** de pulsar «Deshacer». Medido: 6 en disco antes del clic.
   *Arreglo:* sembrar lo GUARDADO y comprobar además que **el borrado sigue
   hecho** (4) al reabrir — la mitad que faltaba.

2. **La app se compara contra sí misma.** `sync.mjs` afirmaba «todo sobrevive»
   con `pre === post`, dos fotos de la app. Con `foto()` devolviendo `null` en
   cada campo, **pasaba igual**: no distinguía «todo sobrevive» de «todo está
   vacío en los dos lados». *Arreglo:* anclar primero — números finitos, `n > 0`,
   cuentas > 0 — y después comparar.

3. **La aserción es demasiado laxa.** `bal1 !== bal0` («el balance se mueve»)
   pasaba con `NaN`. *Arreglo:* el valor exacto, `bal1 === bal0 - 40`, que es el
   que la propia confirmación de la app anuncia.

> **Qué falló:** los tres casos de arriba, los tres encontrados en este
> repositorio y los tres medidos con un sabotaje antes de arreglarlos. El peor
> fue `sync.mjs`: la prueba de persistencia pasaba con la app devolviendo
> `null` en cada campo.

Para los caminos del dinero —balance, dimensionado, P&L, drawdown, Monte Carlo,
IRR, borrado y deshacer, persistencia, reglas prop— la pregunta no es «¿pasa?»
sino **«¿podría pasar si la app estuviera rota?»**. Si la respuesta es sí, la
aserción no vale todavía.

Tres niveles, y cada uno responde algo que los otros no:

| Nivel | Qué prueba | Dónde |
|---|---|---|
| unidad | las funciones calculan bien | `motor-quant` 329, `motor-math` 92 |
| integración | la app consume **ese** motor | `motor-bundle`, `capa2` §15 |
| navegador | acción → DOM → cálculo → disco → reabrir → mismo número | `sync`, `borrar`, `servida` |

---

## 13 · Probar una plataforma que no está en el repositorio

La app tiene **dos** ramas de persistencia y son un `if/else`, no una mezcla:

```
if (state.db)                    → el artefacto: window.claude.use("db")
else if (state.store === "local") → Pages y file://: localStorage
```

Las pruebas de navegador corren sin `window.claude`, así que **todas medían la
segunda rama**. La primera —la que el usuario usa de verdad— se prueba con un
**doble fiel** instalado con `addInitScript` antes del script de la app
(`test/capsula.mjs`).

Fiel quiere decir que el doble **no simplifica el contrato**:

| lo que la app llama | lo que el doble implementa |
|---|---|
| `doc(p).set / get / delete` | y devuelve promesas, que la app espera con `await` |
| `doc(p).onSnapshot(cb)` | dispara al suscribirse, y devuelve la función de baja |
| `collection(n).limit(1000).onSnapshot` | con `{ docs: [{ data() }] }` |
| `collection("days").orderBy("date","desc").limit(15)` | la cadena entera |
| `collection(n).doc(id).set / delete` | y hace **eco** al suscriptor, como un Firestore |

Reglas al escribir una prueba de esta rama:

1. **Registrar las llamadas, no mirar la pantalla.** Se afirma sobre la ruta y el
   contenido del documento que salió (`settings/main`, `days/<hoy>`,
   `col:tesis/<id>`), porque una pantalla correcta con el disco vacío es
   exactamente el fallo que se busca.
2. **Comprobar que la otra rama no se toca.** Con `db` conectado, `localStorage`
   tiene que quedarse sin una sola clave `cabina-mnq`. Es lo único que prueba que
   el `if/else` es un `if/else`.
3. **Romper el doble a propósito.** Con todo `set()` rechazando, la app debe
   avisar **con el código del error**, no con un genérico ni con «guardado».
4. **Probar el snapshot entrante**, que es la mitad que nadie prueba: un
   documento más nuevo reemplaza el día, uno más viejo no, y **con el foco
   dentro de un campo no se sobreescribe lo que se está escribiendo**.

> **Qué falló:** durante toda esta auditoría la suite dio **50/50 en verde**
> mientras el entorno **principal** tenía **cero** aserciones. El artefacto es
> donde el usuario trabaja; Pages es la copia de respaldo. Un fallo en la rama
> `db` habría sido invisible para 50 suites y visible para el usuario en el primer
> uso. No lo tapó nadie: simplemente nunca se preguntó *qué* rama medían las
> pruebas, que es el protocolo 2 aplicado a la arquitectura y no a un número.
>
> Y la primera versión de `capsula.mjs` falló acusando a la app de borrar el
> campo del diario al llegar un snapshot. La app tenía razón: `index.html:3689`
> guarda el campo enfocado a propósito. El fallo era de la prueba, que empujaba
> el snapshot con el foco dentro. Ahora se prueban **los dos lados de esa
> guarda**, que es una aserción más de las que había antes de equivocarme.

---

## 14 · No contar aserciones leyendo el código

El número de aserciones de la suite **lo imprime la suite**, al final de
`npm test`:

```
51/51 en verde · NNN s
NNN aserciones ejecutadas en NN archivos · el resto solo mide
```

`correr.mjs` lo cuenta sobre la **salida** de cada proceso hijo
(`/^ {2}(?:[✅❌]|PASS|FAIL) /`), no sobre el fuente. Un archivo que solo mide
sale en 0, que es lo que es.

Contarlas con `grep` sobre los `.mjs` **no vale**, y no por pereza: no hay regex
razonable que distinga una llamada de una mención en prosa.

> **Qué falló:** `grep` dijo que `capsula.mjs` tenía **29** aserciones; al
> ejecutarlo imprimió **28**. La de más estaba dentro de su propio encabezado, en
> la línea que explica cómo falla el archivo y que por tanto escribe `paso(...)`
> como prosa. Se intentó arreglar excluyendo las líneas que empiezan por `//`,
> `*` o `/*`: siguió dando 29, porque las líneas interiores de un comentario de
> bloque no empiezan por ninguno de los tres.
>
> Es el **mismo error** que la §14 de `capa2` ya cometió, contando un «§13»
> escrito en un párrafo como si fuera una etiqueta. Dos veces el mismo error
> justifica un protocolo, no otra regex.
>
> **Y una tercera vez, media hora después.** Con el contador ya escrito, lo corrí
> sólo sobre los 12 archivos que el `grep` decía que afirmaban — o sea que usé la
> lista mala para decidir QUÉ medir, y el contador nunca vio los otros tres. Dio
> 441 en 12 y lo escribí en el README. La suite completa dice **455 en 15**, y lo
> dijo primero CI. La regla no es sólo «no cuentes con grep»: es **no elijas con
> grep lo que vas a contar**. Se corre la suite entera.
>
> Los tres que faltaban imprimen `✅`/`❌` dentro de una plantilla, sin definir
> ningún ayudante — y aun así ponen la suite roja, porque `correr.mjs` mira la
> cruz en la salida:
>
> | fichero | grep | ejecutado |
> |---|---|---|
> | `capa2` | 51 | **102** (sus reglas iteran) |
> | `tesis` | 68 | 71 |
> | `borrar` | 25 | 34 |
> | `capa` | **0** | **7** |
> | `vivo3` | **0** | **5** |
> | `vivo4` | **0** | **2** |
> | `capsula` | 29 | 28 (prosa contada como llamada) |
>
> Consecuencia: el «**376 aserciones en 13 archivos**» que decía el README **no
> se reproduce** con ningún método, ni el de antes ni el de ahora. Está
> reemplazado por el número que imprime la suite — 455 en 15, idéntico en local
> (485 s) y en CI (450 s), así que no depende del entorno — y queda anotado aquí
> que el anterior era una cuenta que no se podía repetir.

---

## 15 · Un `UNKNOWN` nunca se convierte en `PASS`

Tres veredictos, y no hay un cuarto:

| | |
|---|---|
| `PASS` | **se ejecutó** la comprobación y salió bien |
| `FAIL` | se ejecutó y salió mal |
| `UNKNOWN` | **no puede comprobarse automáticamente desde aquí** |

`UNKNOWN` no es un `FAIL` blando ni un `PASS` con reservas: es la frontera del
instrumento, escrita. `npm run compuerta` imprime hoy cuatro, y las cuatro son
fronteras de plataforma, no pruebas que falten:

1. Que el artefacto publicado sea igual a `index.html`. No hay URL que Actions
   pueda leer.
2. Que el `db` real de claude.ai se comporte como el doble de `capsula.mjs`
   (protocolo 13).
3. Que la URL de Pages sirva.
4. Que el CDN de GitHub entregue exactamente lo verificado.

Las reglas:

- **No se inventa una prueba que pretenda comprobar lo que la plataforma no puede
  comprobar.** Una prueba que siempre pasa porque no mira nada es peor que la
  ausencia de prueba: ocupa el sitio.
- **Una fila `UNKNOWN` no afecta al código de salida.** Si lo afectara, el rojo
  permanente entrenaría a ignorar el rojo — el mismo razonamiento por el que
  `pagina.yml` avisa en vez de fallar.
- **Cada fila que depende de una prueba busca su línea de evidencia en la salida
  de la suite.** Si la línea no aparece, la fila es `FAIL` con el motivo «no
  aparece «X» en la salida», nunca `PASS`. Un cambio de formato en `correr.mjs`
  rompe la compuerta en rojo, no la deja pasar en silencio.
- **Se comprueba con sabotaje en las dos direcciones**: rompiendo lo comprobado
  (la fila debe caer en `FAIL`) y borrando la evidencia (la fila debe caer en
  `FAIL` por ausencia, no subir a `PASS`). Medido: al renombrar la etiqueta de
  una prueba, **la suite entera siguió 51/51 en verde con `exit 0`** y la
  compuerta cerró igual — `11 PASS · 1 FAIL · 4 UNKNOWN`, `EXIT=1`. Una suite
  verde no es evidencia suficiente para una fila: la fila exige *su* línea.
- **El sabotaje se revierte quirúrgicamente, nunca con `git checkout --`.** Se
  deshace la edición exacta que se hizo, y después se comprueba el `md5` contra
  el que se anotó antes de sabotear. `git checkout --` devuelve el archivo a
  **HEAD**, no al estado previo al sabotaje: si el archivo llevaba trabajo sin
  commitear, se pierde en silencio y el árbol queda limpio, que es lo que lo hace
  peligroso.

> **Qué falló:** durante toda una sesión se dijo «el artefacto y el repositorio
> coinciden» sin que existiera ninguna comprobación que pudiera decirlo. No era
> mentira deliberada: era un `UNKNOWN` sin nombre, y un `UNKNOWN` sin nombre se
> lee como un `PASS`. Lo que lo destapó fue leer el fichero publicado línea por
> línea y encontrar el 100× del tamaño de posición **vivo en el entorno
> principal** mientras el repositorio ya estaba arreglado. La comprobación que
> faltaba no se podía automatizar; lo que faltaba de verdad era **decir que no se
> podía**.
>
> Y la consolidación de `consistency` se comprobó con dos sabotajes más: quitar la
> ganancia previa de la llamada al motor (5 filas rojas) y dejar de acotar el límite
> antes de pasarlo (5 filas, **dos de ellas de la sección dorada**). Eso último es lo
> que demuestra que los literales siguen teniendo dientes después de consolidar: no
> se volvieron tautológicos.
>
> El precedente al lado: `preview.html` estuvo seis días en verde midiendo una
> copia congelada de `index.html`. También ahí el instrumento decía `PASS`
> mientras no miraba nada.
>
> **Y el propio sabotaje falló una vez, en la revisión.** Para deshacer el
> segundo sabotaje se hizo `git checkout -- test/correr.mjs`. Ese archivo llevaba
> además la guarda de recursión sin commitear —`compuerta.mjs` en
> `NO_SON_TESTS`—, así que el `checkout` la borró y dejó el árbol limpio: `git
> status` no tenía nada que decir. La corrida siguiente habría hecho que
> `correr.mjs` descubriera `compuerta.mjs`, que lanza `correr.mjs`, sin fondo. Se
> detectó porque el `md5` **no coincidía** con el anotado antes de sabotear, y se
> mató el proceso cuando iba por `audit3.mjs` — antes de `compuerta.mjs` por
> alfabeto. El `md5` fue lo único que lo dijo; nada más lo habría hecho.

---

## 16 · La capa de riesgo está duplicada: no se toca una sola de las dos

`index.html` reimplementaba cinco cálculos que el Quant Engine ya tiene. Va uno
consolidado y quedan cuatro:

| app (`index.html`) | motor (`engine/quant/`) | estado |
|---|---|---|
| `riskEngine` | `margenDePerdida` — `compliance.js:30` | **consolidado**: adaptador de vocabulario |
| `dayAgg.lossPct` / `lossRemaining` | `margenDePerdida` | **consolidado**: era la tercera copia |
| `gainCap` | `topeDeGanancia` — `compliance.js:42` | **consolidado**: la coerción y la frase se quedan en la app |
| `consistency` + `consEngine` | `evaluarConsistencia` — `curve.js:238` | **consolidado**: dos respuestas en disputa, aisladas |
| `ddEngine` | `margenDeDrawdown` — `compliance.js:53` | **bloqueado**: dos semánticas distintas, decisión de producto |
| `evaluateAccountRules` | `evaluarCumplimiento` — `compliance.js:72` | pendiente — depende de `ddEngine` |

### Los dos bloqueos, con sus números

No son «pendientes» por falta de tiempo: son decisiones que un refactor no debe
tomar por su cuenta.

**`ddEngine` no es un intercambio.** En una cuenta quemada —25.000 con drawdown
estático de 500 y −$800 en un día: suelo 24.500, balance 24.200— las dos
implementaciones dan números distintos en DOS sitios:

| | app | motor |
|---|---|---|
| colchón | `0` (clampado) | `−300` (cuánto te pasaste) |
| usado | `500` (topado en el máximo) | `800` (`500 − (−300)`, el exceso real) |
| porcentaje | `1` | `1` — este sí coincide |

Las cuatro cifras son defendibles: «no te queda nada» y «gastaste todo tu drawdown»
contra «te pasaste en 300» y «has perdido 800 contra un tope de 500». Pero la
tarjeta muestra una, y elegirla es decidir qué se le dice al trader cuando ya quemó
la cuenta. `equivalencia` **afirma las dos diferencias** en vez de esconderlas, así
que están medidas y esperando decisión, no olvidadas.

Y una corrección a la auditoría de la fase 0, que sugería más trabajo del que hay:
`acctAgg` **ya** enruta la curva y el suelo por `QE.construirCurva` —su propio
comentario dice «aquí desaparece la tercera copia de la fórmula del suelo»—, así que
`ddEngine` no duplica el suelo. Duplica colchón, usado, pct y nivel **sobre un suelo
que ya es del motor**.

**`consEngine` se consolidó, y al medirlo apareció un número inventado.** El caso
que faltaba se sembró: cuenta con ganancia previa 800 y mejor día previo 300. Las
doce cifras coinciden, incluidas `ratio`, `totalRequerido`, `falta`, `topeDiaHoy`,
`cumple`, `cerca` y `diasParaCumplir`. La ganancia previa entra ahora como lo que es
—`gananciaPrevia`, `mejorDiaPrevio`— en vez de estar ya sumada.

Pero el **segundo** caso sembrado —una cuenta sin ninguna ganancia, sólo días en
rojo— destapó dos respuestas en las que la app y el motor no están de acuerdo, y una
de las dos es un número que la tarjeta imprime:

| | app | motor |
|---|---|---|
| `additional` | **160** | **0** |
| `compliant` | **true** — «cumple» | **null** — no se puede decir |

Ese `160` en una cuenta a −160 es `max(0, 0 − (−160))`: la **magnitud de la pérdida**,
no una exigencia de consistencia, y la tarjeta lo imprime como «**Ganancia que falta
para cobrar: +$160**» (`index.html:3481`). El motor devuelve 0 y su comentario dice
por qué: «sin ningún día verde no hay mejor día, así que la consistencia no impone
nada y no falta nada por su culpa; restar un total negativo de un requerido de cero
producía una exigencia inventada».

Y la app **se contradecía a sí misma**: `consistency().needed` daba 0 para el mismo
caso y `consEngine().additional` daba 160. Dos respuestas a la misma pregunta dentro
del mismo fichero.

Se conserva el comportamiento de la app en las dos, a propósito: cambiar lo que dice
la tarjeta es una decisión de producto, no un refactor. Lo que sí cambia es que las
dos están ahora **aisladas en dos líneas marcadas `SIN_GANANCIA_APP`** en vez de
repartidas por la función, así que adoptar la respuesta del motor cuesta una línea en
vez de una auditoría.

La tabla de umbrales duplicada **ya no existe**: `RISK_STEPS` llevaba los mismos
0.50 / 0.75 / 1.00 que `NIVELES`, y ahora la app sólo tiene `NIVEL_APP`, que es
*presentación* —el código en inglés del que cuelga el CSS y la etiqueta en español
con tilde— indexada por el código que emite el motor. Los umbrales viven en un
único sitio.

Eso crea un riesgo NUEVO, y `equivalencia` lo vigila: si el motor empieza a emitir
un código de nivel que `NIVEL_APP` no traduce, el fallback mete el código español
crudo en el atributo del que cuelga el CSS y **la tarjeta se queda sin color sin que
falle ningún cálculo**. Hoy el motor puede emitir seis (`seguro`, `precaucion`,
`peligro`, `agotado`, `quemada`, `sin_regla`) y los seis están traducidos.

Mientras quede duplicación:

- **No se corrige un número en una de las dos y se deja la otra.** `equivalencia`
  se pone rojo, que es su trabajo; lo que no se puede es apagarlo para que pase.
- **La consolidación se verifica por igualdad numérica, no a ojo.** Hoy las dos
  implementaciones coinciden al centavo, y eso es la **referencia dorada**: el
  cambio que las una tiene que dejar los mismos números, no unos parecidos.
- **Los códigos de nivel NO son intercambiables.** La app dice `safe` / `caution` /
  `danger` / `locked`, el motor dice `seguro` / `precaucion` / `peligro` /
  `agotado`, y **el CSS de la app se cuelga de `code`**. Renombrarlos por
  «consistencia» rompe los colores sin romper ninguna prueba de cálculo.
- **El motor redondea a 4 decimales en la frontera de presentación y la app no.**
  Por eso `equivalencia` compara los porcentajes con tolerancia al centavo y no
  con `===`. Eso es una diferencia conocida, no un fallo. Al consolidar, la app
  hereda ese redondeo: dólares a dos decimales y porcentajes a cuatro, sobre
  números que se pintan con dos. No es visible, y se dice de todos modos porque es
  un cambio de comportamiento y no ninguno.
- **Antes de consolidar `ddEngine` hay una decisión que tomar, no un intercambio.**
  En una cuenta quemada la app clampa el colchón a `0` y el motor lo devuelve
  **negativo** —medido: app `0`, motor `−300`—. Las dos son defendibles («no te
  queda nada» contra «te has pasado en 300»), pero no son el mismo número, y la
  tarjeta muestra uno. `equivalencia` afirma la diferencia tal cual en vez de
  esconderla, para que quien consolide la elija a propósito.
- **La referencia dorada NO se regenera automáticamente.** Los números de antes de
  consolidar están escritos a mano en `equivalencia`. En cuanto la app llama al
  motor, comparar app contra motor es comparar el motor consigo mismo: tautológico,
  y por tanto una prueba que ya no mira nada —lo que el protocolo 15 prohíbe—. Lo
  que la hace comprobable es que los literales no cambien. Si un cambio de producto
  los mueve a propósito, se actualizan a mano y se dice en el commit cuál y por qué.

Y las dos tablas **no son alcanzables en ejecución**: `NIVELES` es `const` privada
de `compliance.js` y `RISK_STEPS` es local del IIFE de la app. Así que
`equivalencia` las comprueba de dos maneras a la vez: comparando el **texto** del
fuente —que es lo que atrapa a quien edita una y no la otra— y por su **efecto**,
con un barrido de cuatro casos que aterriza en cada banda.

> **Qué falló:** nada, todavía — y eso es exactamente el problema que el protocolo
> ataca. La duplicación llevaba meses en el repositorio y **no existía ninguna
> comprobación capaz de decir si las dos mitades daban el mismo número**. La
> primera medición se hizo en la auditoría de la fase 0, con una sonda que
> enfrentaba las dos implementaciones en la misma página con los mismos datos:
> coincidían al centavo. Si hubieran divergido, se habría descubierto por un
> número malo en pantalla, no por una prueba.
>
> El guardián se escribió **antes** de consolidar nada, y por eso se pudo escribir
> en verde: fija el estado actual como referencia. Se comprobó con tres sabotajes
> —un umbral movido de 0.75 a 0.90, un `+ 1` en el colchón de `ddEngine`, y un
> código renombrado— y cada uno lo puso rojo por **dos** filas independientes.
> Después de consolidar `riskEngine` se comprobó con dos más: borrar una traducción
> de `NIVEL_APP` (rojo, «SIN traducir: quemada — la tarjeta se quedaría sin color»)
> y devolver una segunda tabla de umbrales a `index.html` (rojo, «2 entradas «under:
> N» han vuelto»). Los dieciséis números dorados sobrevivieron la consolidación sin
> moverse.
>
> **Y el propio guardián tuvo una medición muerta.** Al consolidar `gainCap` se midió
> el tope de ganancia y no se afirmó nada sobre él: un número calculado, impreso en
> ningún sitio y comprobado por nadie. Ahora lleva su dorado. De paso quedó escrito
> lo que de esa función **no** se puede comprobar: `gainCap` no está en la fachada
> `FUT` —se llama dentro del render y su resultado va directo al HTML—, así que lo
> verificado es el motor con las mismas entradas más que la página no lanza, no el
> valor que acaba en pantalla. Dicho, no disimulado.
>
> El tercero destapó además un mensaje de fallo que mentía por omisión: decía «app
> «precaucion» · motor «precaucion»», que se lee como si coincidieran, cuando el
> fallo real era que ese código no figuraba en la tabla de correspondencia. El
> mensaje ahora lo dice. Es el protocolo 11 otra vez: una aserción tiene que fallar
> **por el motivo correcto**, y decirlo.

---

## 17 · Un campo nuevo que se persiste: la ausencia significa algo

Cuando se añade un campo al modelo, los registros que ya existen **no lo tienen**. Eso
no es un hueco que rellenar: **es un dato**. Significa «no se sabe», y escribir un
valor plausible encima es inventar exactamente lo que el campo existía para registrar.

Las reglas:

- **No se rellena hacia atrás.** Ni con un valor por defecto «razonable», ni en una
  migración silenciosa, ni «sólo esta vez porque casi siempre era así».
- **La ausencia se lee y se dice por su nombre.** Un informe que agrupa por el campo
  nuevo tiene tres estados, no dos: los valores, y *sin dato*.
- **Se prueba que la ausencia sobrevive.** Una prueba que sólo comprueba los valores
  nuevos no detecta una migración que los inventa.
- Y sigue valiendo la regla general: **todo campo nuevo que se persiste necesita su
  estrategia de valor por defecto y de migración escrita antes de escribirlo.**

> **Qué falló:** al añadir `source` a las operaciones —para distinguir una entrada
> rápida de una del formulario completo, de una importación de CSV y de una futura
> API— lo cómodo era marcar todas las operaciones existentes como `"manual"`. Habrían
> sido cientos de registros afirmando una procedencia que **nadie comprobó**, y el
> campo habría nacido mintiendo: su único propósito es medir si las entradas rápidas
> salen peor documentadas que las completas, y un `"manual"` inventado contamina
> justo esa comparación.
>
> Se quedó así: `"quick_add"` en las rápidas, `"manual"` en las nuevas del editor, y
> **ausente** en las de antes. `test/rapido.mjs` lo afirma en los dos sentidos —que
> las nuevas lo llevan y que una vieja se queda sin él—, así que un futuro relleno
> hacia atrás sale rojo.
>
> El precedente al lado: el `capToday` de una cuenta sin ganancia imprimía la magnitud
> de la pérdida como «ganancia que falta para cobrar» (§16). También allí un hueco se
> rellenó con el número que había a mano.

---

## 18 · Un dato importado no es una URL: se valida el esquema

`esc()` escapa HTML. **No valida el destino de una URL**, y confundir las dos cosas es
la forma fácil de pasar una revisión de XSS y seguir teniendo un problema.

Las reglas, para cualquier campo que acabe en `src`, `href`, `fetch()` o equivalente:

- **Lista blanca de esquemas, no lista negra.** Se dice qué se acepta —`data:image/…`
  en base64, o un identificador del almacén de assets— y todo lo demás se rechaza.
  Una lista negra siempre se queda corta: `blob:`, `filesystem:`, `//host` sin
  esquema…
- **Un identificador no es una ruta.** `"/_blob/" + im.id` con un `im.id` que trae
  `../` es travesía de rutas. Se valida que sea un identificador.
- **El filtro va en el punto de estrangulamiento, no en cada sitio que pinta.**
  `imgSrc()` alimenta cinco `<img src>` y un `fetch()`: arreglar la función cubre los
  seis y no se olvida el séptimo que alguien añada mañana.
- **Un dato rechazado se ve.** No se sustituye por nada en silencio: se dibuja la
  marca de rechazo. Un hueco invisible es indistinguible de un fallo de carga.
- **Se prueba por el EFECTO, no por el valor de retorno.** La aserción que vale no es
  «la función devuelve lo correcto» sino **«el navegador no pidió esa URL»**, medida
  registrando las peticiones de la página.

> **Qué falló:** `imgSrc()` devolvía `String(im.data)` tal cual. Ese valor alimenta
> cinco `<img src>` y —lo que de verdad importa— un `await fetch(imgSrc(im))` en el
> empaquetado de respaldos. `bkParse()` valida la **forma** de un respaldo importado
> —que sea JSON, con la marca del formato y una versión no superior— y **ningún valor
> de ningún campo**.
>
> O sea: un respaldo escrito a mano con `data: "https://…"` hacía que la cabina
> **pidiera esa URL**. No es ejecución de código; es **balizamiento**: le revela a
> quien escribió el fichero que lo abriste, tu IP y tu navegador. En una aplicación
> con datos de trading personales eso basta.
>
> Se demostró con sabotaje, no con un argumento: quitando el filtro, la página pidió
> de verdad `blob:https://evil.example/x` y `file:///etc/passwd`. Y el mismo sabotaje
> destapó un matiz que quedó escrito en la prueba: las `http(s)` **no** se pidieron en
> esa corrida porque las miniaturas llevan `loading="lazy"` y estaban fuera de
> pantalla. La prueba detecta la regresión; no demuestra que una baliza https se
> dispare al instante.
>
> Y la prueba tropezó con la §9 de `capa2`, que prohíbe literales `file:///` en los
> tests. La tentación era escribir `'file://' + '/etc/passwd'` para que la regex no lo
> viera: eso habría dejado la regla verde y **sin dientes**. Se hizo una excepción
> **nombrada y explicada**, y la §13 sigue cubriendo ese fichero.

---

## 19 · Un respaldo a medias es peor que ninguno

Un fallo al **leer** los datos para una copia de seguridad **no se degrada en
silencio**. Se para y se dice.

Las reglas:

- **Un `catch` vacío en el camino de una copia es un fallo, no una tolerancia.**
  «Si la base no responde, tiramos con lo que haya en local» suena defensivo y es lo
  contrario: produce un fichero que parece completo.
- **Fallar es la respuesta correcta aquí.** El usuario que no consigue descargar su
  copia lo intenta otra vez. El que descarga una copia a medias no se entera hasta que
  la restaura, y para entonces el original puede no existir.
- **Lo que se repara o se descarta al importar, se cuenta y se enseña** en la vista
  previa antes de confirmar. Reparar en silencio y rechazar en silencio son el mismo
  error en direcciones opuestas.
- **Tres respuestas para tres problemas**: sección mal formada → se para todo;
  registro sin identificador → se repara con su clave; registro irreparable → se
  descarta **y se cuenta**.

> **Qué falló:** `allDayDocs()` tenía `catch (e) { }` y caía a `lsRead().days`. Con la
> base del artefacto caída, «Ver el texto» producía un respaldo con **sólo los días
> locales** y lo anunciaba así:
>
> ```
> Copia el texto del cuadro · 4 KB · 1 sesión.
> ```
>
> Medido con el doble del `db`: dos días sembrados en la nube, y el fichero salía con
> uno. Sin aviso, sin error, sin marca. Un fichero que guardas creyendo que es tu
> respaldo.
>
> **Lo encontró una revisión externa** (ChatGPT/Codex, PR #1), no esta. La auditoría de
> seguridad de la fase 0 había mirado la **entrada** de datos —esquemas de URL, tipos,
> XSS— y no la **salida**. Queda anotado porque el sesgo es instructivo: se audita por
> dónde entra lo hostil y se olvida por dónde sale lo propio.
>
> Se verificó antes de adoptarlo, y de la misma revisión **no** se adoptó la otra
> mitad: proponía rechazar todo registro sin `id`, lo que habría hecho fallar la
> importación entera de un respaldo viejo legítimo. Comprobado con sabotaje: esa
> variante pone en rojo «las DOS operaciones entran: no se pierde la que venía sin id».

---

## 20 · Un cambio que no se guardó no puede parecer guardado

Cuando una escritura falla, la pantalla **ya muestra** el cambio y el almacenamiento
no lo tiene. Ese desfase se dice donde se ve y no se va solo.

Las reglas:

- **No se dice «guardado» sin haber guardado.** Si la función de escritura devuelve
  si pudo o no, se mira. `lsWrite` devolvía un booleano desde el principio y las ocho
  llamadas a `lsPatch` lo tiraban.
- **El aviso va donde se ve siempre.** Un mensaje en un elemento que vive dentro de
  una pestaña no es un aviso: es un aviso para quien esté en esa pestaña.
- **Un aviso que se va solo no es un aviso, es un recibo.** Mientras haya algo sin
  guardar, se sigue diciendo. Se limpia cuando se guarda, no cuando pasa el tiempo.
- **Se lleva por documento, no con un contador.** Si falla el día y luego entra bien
  una operación, un contador a cero borraría el aviso del día, que sigue sin guardar.
- **Avisar no es una política de respaldo.** Copiar a `localStorage` lo que la base
  rechazó crea dos fuentes de verdad que pueden divergir, y eso es peor que el
  problema que arregla. Decidirlo es de producto; decir la verdad no.
- **Y donde se ve tiene que estar en el árbol de accesibilidad.** Un elemento con
  `display: none` no está en él: una región `aria-live` escondida **no anuncia nada**.
  El rótulo está oculto por debajo de 700px a propósito, así que la regla que lo
  enseña cuando avisa es lo único que hace que el aviso **se oiga** en un teléfono.
  Las dos piezas —la visual y la `aria-live`— dependen la una de la otra y ninguna
  prueba eso por su cuenta: la aserción que las ata está en `guardado.mjs`.

> **Qué falló:** las seis puertas de escritura caían igual. Medido con el navegador,
> antes de tocar nada:
>
> ```
> localStorage lleno  ->  «guardado en este navegador»   y tras recargar, 0 operaciones
> la base rechaza     ->  el rótulo seguía en «sincronizado» a los 2,8 s
> ```
>
> El primero es una mentira plana: dice «guardado» cuando `setItem` lanzó. El segundo
> es una verdad de 2,5 segundos seguida de una mentira — y esa verdad se escribía en
> `#jSaved`, que está **dentro de la pestaña Cabina**: medido, invisible en 5 de las 6.
> `#saveState`, el rótulo de la barra, se ve en las 6 y decía «sincronizado».
>
> El mismo defecto que el respaldo a medias (protocolo 19), un paso antes: allí se
> perdía una copia, aquí se pierde la operación que acabas de escribir.
>
> **Y el propio arreglo tuvo que probarse contra su versión fácil.** Con un contador
> global que cualquier éxito pone a cero, la suite se quedaba en verde: la aserción que
> decía vigilar «un guardado bueno no tapa otro documento roto» no vigilaba nada,
> porque el registro rápido escribe la ficha **y** el día, así que el día se rompía otra
> vez en la misma acción y el contador volvía solo. Reescrita para guardar un documento
> distinto —`settings/main`—, el sabotaje del contador pone **3** en rojo.

---

## 21 · Una medición no se hace compartiendo la máquina

La suite tarda once minutos y usa el navegador de verdad. Mientras corre, **no se
lanza nada más pesado en la misma máquina**, y no se toca ningún fichero que ella lea.

Las reglas:

- **Nada de navegadores en paralelo.** Una sonda propia es un proceso igual de pesado
  que cualquier prueba, y las que miden tiempos o esperan a que algo aparezca pierden
  por CPU, no por un defecto.
- **Tampoco se edita lo que está leyendo.** Cada fichero de prueba arranca su propio
  proceso y lee `index.html` cuando le toca: cambiarlo a media pasada mezcla dos
  versiones en una sola tabla.
- **Un rojo en esas condiciones no es un rojo: es una medición inválida.** Se repite
  en limpio ANTES de leerlo, y desde luego antes de buscar a quién culpar.
- **Repetir no es «reintentar hasta que salga verde».** Se repite una vez, en limpio.
  Si vuelve, es real.

> **Qué falló:** llegó trabajo de otra persona a `main` y, mientras la compuerta lo
> verificaba, lancé una sonda con un navegador entero para medir otra cosa. La
> compuerta salió:
>
> ```
> 17 PASS · 1 FAIL · 4 UNKNOWN   ·   56/57 suites · exit 1
> ```
>
> Repetida en limpio, sin nada más corriendo: **57/57 en verde, exit 0.** El rojo era
> mío.
>
> Lo grave no es el tiempo perdido. Es que el FAIL cayó sobre el commit de otra
> persona que acababa de llegar, y la conclusión fácil —«lo que trajo rompió la
> suite»— habría sido falsa y además difícil de desmentir después. La primera
> sospecha tiene que apuntar a las condiciones de la medición, no al último que tocó
> el código.
>
> En el mismo mensaje en el que escribí «no se toca `index.html` mientras la compuerta
> corre» estaba compitiendo por la CPU con ella. La regla estaba entendida a medias.

---

## · Lo que ningún protocolo cubre

*No es un protocolo: es la lista de lo que queda fuera del alcance de todos.*

Honestidad sobre los límites:

- **GitHub Pages hay que activarlo a mano una vez** (Settings → Pages → Source:
  GitHub Actions). El `GITHUB_TOKEN` de Actions no puede **crear** el sitio: eso
  es administración del repositorio. Mientras no esté activado, `pagina.yml`
  **avisa y se queda quieto** en vez de fallar — un check rojo en cada push
  entrena a ignorar el rojo, y quien dice si el código está bien es `pruebas`.
  En cuanto se active, el siguiente push que pase la suite publica solo.
- **La compartición del artefacto sólo la cambia su dueño**, desde el menú Share.
- **No hay LICENSE**, así que el repositorio es «todos los derechos reservados»:
  público para leer, sin permiso para usar.
- **El doble de `db` fija el CONTRATO, no la plataforma.** `capsula.mjs` prueba
  que la app usa correctamente el `db` que *espera*. Si claude.ai cambiara ese
  contrato, la prueba seguiría **verde** y el artefacto estaría **roto**. Eso sólo
  lo detecta abrir el artefacto. Por eso el contrato está escrito en el
  encabezado del fichero y en el protocolo 13, no sólo codificado.
- **Si el `db` falla al escribir, el dato se queda en memoria.** Eso sigue igual, y
  a propósito: la app **no** cae a `localStorage`, así que al recargar se pierde.
  Elegir una segunda fuente de verdad es una decisión de producto —dos copias que
  divergen es un problema peor— y no se toma en una auditoría. Lo que **sí** cambió
  es que ya no lo disimula: el rótulo de la barra dice «SIN GUARDAR · *n*» con el
  código del error, en las seis pestañas, hasta que se guarde (protocolo 20).
  Afirmado en `capsula.mjs` y en `guardado.mjs`.
