# Auditoría de integración · 2026-09-27

Sobre `main` en `291daf2`. Todo número de aquí sale de **ejecutar algo** contra
`index.html` servido por HTTP, no de leer código ni de mirar la pantalla. Las sondas
viven en el scratchpad de la sesión; las que valgan como guardián se promueven a
`test/`.

Esta auditoría se pidió después de revisar **visualmente** la aplicación publicada. El
primer resultado es que varias de las conclusiones visuales no se sostienen al
medirlas, y una sí — con más precisión de la que la vista puede dar.

---

## Lo primero, porque cambia el punto de partida

**El artefacto NO está por detrás del repositorio.** Está en la versión **63**
(`1790491941-1106`), y su cuerpo es `index.html` de `291daf2` **byte a byte**,
comprobado comparando lo enviado contra el fichero.

Y un aviso sobre cómo leer cualquier auditoría visual de este proyecto: **quien abre
el artefacto por el enlace compartido ve una versión anclada anterior, no la viva.**
Si la revisión se hizo por ahí, describe una versión antigua.

---

## 1 · Arquitectura real

```
index.html   10.870 líneas · un solo fichero, cero <script src>, cero import
  ├─ 8.763 líneas de aplicación
  └─ 2.107 líneas del motor incrustado  (líneas 3.986–6.092)
       const QE = (function () { … })()   ·   window.QuantEngine = QE
```

**Seis superficies**, no once módulos. Medidas por `[data-tab]`:

| pestaña | alto | caracteres | `section` | `.panel` | visibles | botones | inputs |
|---|---|---|---|---|---|---|---|
| `cabina` | 4.153 px | 9.742 | 14 | 8 | **8** | 154 | 101 |
| `futuros` | 1.088 px | 6.894 | 26 | 23 | **7** | 51 | 9 |
| `invest` | 2.445 px | 3.649 | 10 | 10 | **10** | 19 | 1 |
| `calc` | 1.008 px | 3.143 | 8 | 8 | **4** | 7 | 20 |
| `ideas` | **160 px** | **534** | **0** | **0** | **0** | 2 | 2 |
| `playbook` | **210 px** | **456** | **0** | **0** | **0** | 14 | 4 |

«Portfolios», «Journal», «Risk», «Analytics», «Backtest», «Compliance» **no son
pestañas**: son paneles dentro de esas seis. `futuros` tiene además sub-navegación
propia — *Resumen · Cuentas · Análisis · Diario · Pre-sesión* — que es por qué tiene
23 paneles y sólo 7 visibles a la vez.

**Nueve colecciones persistidas**: `trades`, `positions`, `ideas`, `playbooks`,
`tesis`, `scenarios`, `markets`, `watch`, `risk`.

---

## 2 · La fuente de la verdad, y quién la puede alcanzar

`window.state` **no es alcanzable**: todo vive dentro del IIFE. La única superficie
programática son tres fachadas y el motor.

| | métodos | qué cubre |
|---|---|---|
| `FUT` | **34** | cuentas, operaciones, reglas, riesgo, drawdown, consistencia, estadística, edge, salud |
| `INV` | **12** | posiciones, transacciones, cartera, mercados, rendimiento |
| `TES` | **9** | tesis: crear, leer, notas, progreso, secciones |
| `QuantEngine` | **73** símbolos | la matemática |

### Lo que NO tiene superficie programática

Comprobado preguntando por cada nombre: **catorce ausentes de `FUT`**.

```
day · days · journal · note · sessions · session · presession
scenarios · playbooks · watch · markets · risk · rulesEval · backup
```

Consecuencia concreta, y es el hallazgo estructural de esta auditoría:

- **el journal, la pre-sesión, las sesiones, los escenarios y los playbooks sólo se
  pueden leer y escribir por el DOM.** Ninguna prueba puede afirmar sobre ellos sin
  hacer clic; ningún módulo puede consumirlos sin renderizar.
- El «DECISION LOG» que un diseño state-driven pondría al final de la cadena **no
  tiene existencia programática**. Existe como pantalla.

---

## 3 · ¿Está la aplicación conectada? · MEDIDO

La pregunta se contestó del modo más directo: sembrar una cuenta, fotografiar **30
valores derivados**, meter **una** operación, y volver a fotografiar. Lo que no se
mueve, no está conectado.

### Primera medición: mal diseñada, y se dice

La primera pasada usó una operación **ganadora**. Por construcción no puede mover nada
basado en pérdida, así que devolvió 16 «no se movieron» que no eran desconexiones sino
mi error. Además adivinó nombres de campos y de `id` del DOM. **Contarla como hallazgo
habría producido un informe falso.** Se rehizo.

### Segunda medición · una operación PERDEDORA de −$50, cuenta 50.000 con dd 2.000 trailing_lock

**Se movieron 22 de 30.**

| | antes | después |
|---|---|---|
| `cuenta.balance` | 50000 | 49950 |
| `cuenta.total` | 0 | −50 |
| `cuenta.colchon` | 2000 | 1950 |
| `dia.pnl` | 0 | −50 |
| `drawdown.colchon` | 2000 | 1950 |
| `drawdown.usado` | 0 | 50 |
| `drawdown.pct` | 0 | 0.025 |
| `riesgo.usado` | 0 | 50 |
| `riesgo.restante` | 150 | 100 |
| `riesgo.pct` | 0 | 0.3333 |
| `consistencia.total` | 0 | −50 |
| `estadisticas.n` | 0 | 1 |
| `expectativa` | `{usd:null,r:null,n:0}` | `{usd:-50,r:-2.5,n:1}` |
| `profitFactor` | `{valor:null}` | `{valor:0}` |
| `rachas` | `currentLossStreak:0` | `currentLossStreak:1` |
| `edge` | `veredicto.nivel:"sin_datos"` | `veredicto.nivel:"anecdota"` |
| `saludCuenta` | `score:100 · peor:colchon` | `score:67 · peor:diario` |
| **`estadoRiesgo`** | **`status:"READY"`** | **`status:"WARNING"`** |
| `protocolo` | `ratio:null` | `ratio:0` |
| `operaciones.n` | 0 | 1 |

Las **8 que no se movieron son correctas**, no roturas:

| | valor | por qué es correcto |
|---|---|---|
| `cuenta.pico` | 50000 | una perdedora no puede subir el pico |
| `cuenta.suelo` | 48000 | `trailing_lock` = `min(pico−dd, size)`, y el pico no subió |
| `drawdown.quemada` | false | no está quemada |
| `riesgo.codigo` | `safe` | 0.3333 < 0.50: sigue en la primera banda |
| `consistencia.ratio` | null | total negativo: no hay ganancia que repartir |
| `consistencia.cumple` | true | el caso `SIN_GANANCIA_APP` documentado en PROTOCOLOS §16 |
| `dia.lossUsed` | `undefined` | **hallazgo real**, ver §5 |
| `winRate` | «no movió» | **mi sonda**: comparaba `String(objeto)` |

### Conclusión

**La hipótesis de «módulos lado a lado, no state-driven» no se sostiene.** Una sola
operación atraviesa cuenta → balance → drawdown → riesgo → consistencia →
estadística → edge → salud → estado de riesgo. La cadena existe y es derivada.

---

## 4 · Capacidades que ya existen y el plan pedía construir

**`FUT.evaluateRules(cuenta, fecha)` devuelve 33 campos**, leídos y no supuestos:

```
canTrade · status · why · reason · violations[] · warnings[]
dailyLossLimit · dailyLossUsed · dailyLossRemaining
drawdownMax · drawdownUsed · drawdownRemaining
maxContracts · oversized · consecutiveLosses · consecutiveLossLimit
consistencyLimit · instrumentAllowed · allowedInstruments[] · offInstruments[]
lockedUntil · cuenta · fecha · agg · c · cons · consistency · day · dd · risk · today
```

**Eso es el Session Risk Engine.** Existe, está enrutado y responde
`READY → WARNING` con motivo ante una sola operación.

`FUT.calculateRiskState` es un **alias de una línea** que delega en `evaluateRules`:
no es una segunda implementación. La medición dijo «fuente distinta» porque comparaba
el envoltorio con lo envuelto — cierto y sin significado.

Y ya existen además: `calculateEdge` (con `veredicto`, `kelly`, `sqn`,
`distribucionR`), `calculateAccountHealth` (score, peor factor, bloqueos, ciegos),
`calculateProtocolCompliance`, `calculateConcentration`, `calculateRMultipleStats`,
`calculateEquityCurve`, `calculateSQN`, `calculateSurvival` vía el motor.

### El motor: 21 usados de 73

| | |
|---|---|
| **A · integrados** (21) | `CONTRACTS` `UMBRALES` `analizarCartera` `analizarEdge` `analizarExcursion` `barridoDeRiesgo` `calcularTradeApp` `construirCurva` `dimensionar` `evaluarConsistencia` `margenDePerdida` `metricasCurva` `probabilidadDeRacha` `resolveContract` `rng` `rootOf` `roundTo` `simularCuenta` `simularParametrico` `sueloPara` `topeDeGanancia` |
| **C · existen sin conectar** (52) | entre ellas `margenDeDrawdown`, `evaluarCumplimiento`, `radiografiaCuenta` |
| **D · implementación duplicada** | sólo `ddEngine` contra `margenDeDrawdown`, y está **bloqueada por decisión de producto** (PROTOCOLOS §16) |
| **E · código muerto** | ninguno identificado: los 52 están expuestos y probados por `motor-quant` |

Eran 18 al empezar la sesión. La consolidación de la fase 2 sumó
`margenDePerdida`, `topeDeGanancia` y `evaluarConsistencia`.

---

## 5 · Problemas reales de flujo de datos

### 5.1 · Dos sitios para preguntar «cuánto he perdido hoy», y uno no sabe

`FUT.calculateDailyStats` devuelve
`{be, closed, date, list, losses, n, pnl, totalR, wins}` — **sin `lossUsed`,
`lossPct` ni `lossRemaining`**. Esos valores sí existen, en `FUT.evaluateRules` como
`dailyLossUsed` / `dailyLossRemaining` / `dailyLossLimit`.

No es una desconexión: el dato es alcanzable. Es una **inconsistencia de fachada**: el
método que se llama «estadísticas del día» no puede responder la pregunta más
importante del día.

### 5.2 · El modelo de operación no tiene procedencia

Los 25 campos que lleva una operación, leídos del objeto guardado:

```
accountId · avisos · calcError · createdAt · date · direction · entry · exit
id · instrument · multUnknown · notes · pnlEff · qty · rPlanned · rReal
riskUsd · session · setup · stop · tags · ticks · time · type · updatedAt
```

**No hay `source` ni `broker`.** Cualquier importación de CSV o de API no tiene dónde
aterrizar sin migración. Confirma la auditoría de la fase 0.

### 5.3 · El vínculo protocolo → analíticas: conectado, y casi lo reporto roto

`calculateProtocolCompliance` parte las operaciones con
`isProto = t => !!(t.cStruct && t.cPull && t.cWindow && t.cSize)` — **cuatro casillas
de la operación**, presentes en el editor (`index.html:6599–6602`).

Primero marqué **las 18 casillas de la pre-sesión por el DOM** —el panel dijo «Lista
completa»—, metí una operación nueva, y cayó en `sinProtocolo`: `conProtocolo` siguió
en `n=0`. Parecía una desconexión clara.

No lo era: **la pre-sesión no alimenta ese panel y nunca debió hacerlo.** Lo alimentan
las casillas de cada operación. Comprobado creando 6 operaciones **con** las cuatro y
6 **sin** ellas:

```
ratio 0.5 · conProtocolo n=6 · sinProtocolo n=6      ✅ conectado
```

Queda anotado porque la conclusión equivocada estaba a una frase de distancia.

---

## 6 · Jerarquía de información · medida, no mirada

Sembrando 12 operaciones en 6 días **más** 3 posiciones y 2 transacciones de
inversión, y midiendo sólo paneles **visibles**:

### Los paneles «vacíos» NO son herramientas sin terminar

Todos llevan estado de *sin datos* explícito y **con instrucción**:

| panel | lo que dice |
|---|---|
| `futuros` / Expectativa móvil | «Hacen falta 20 operaciones con stop y salida. **Llevas 12.**» |
| `invest` / Rendimiento por posición | «Ninguna posición tiene precio actual. Escríbelo en la posición y aquí…» |
| `invest` / Ingresos cobrados | «Sin cobros. Registra dividendos, cupones, primas y alquileres como ope…» |
| `invest` / Watchlist e ideas | «Nada vigilado en ETFs.» |
| `calc` / Escenarios guardados | «Ningún escenario guardado.» |

El primero es exactamente la disciplina de tamaño de muestra que un journal
cuantitativo debe tener: **se niega a estimar con 12 operaciones y dice cuántas
faltan.** Eso no es un panel a medio hacer.

### Y las dos superficies que parecían vacías, no lo están

`ideas` y `playbook` miden 160 px y 210 px y tienen **cero `section.panel`**. Eso es
lo que una revisión visual lee como «espacio muerto», y es lo que yo mismo estuve a
punto de reportar como defecto de arquitectura de información.

**Es falso.** Las dos renderizan su estado de vacío, visible, de 55 px, con
instrucción concreta:

| | lo que dice, medido |
|---|---|
| `ideas` | «Vacío. Cada forma de hacer dinero que anotes tiene que traer capital, tiempo, riesgo y un próximo paso concreto.» |
| `playbook` | «Sin nada en Futuros. Pulsa `Desde plantilla` para empezar con una escrita, o `+ Nuevo en Futuros` para escribirla tú.» |

Y además cada una lleva su párrafo de encabezado explicando para qué sirve la
superficie: «Repositorio de formas de hacer dinero en los mercados. Cada una con
capital, tiempo, riesgo y por qué funcionaría. **Una idea sin “próximo paso” es un
deseo, no una idea**».

Viven en `#idCards` y `#pbCards`, que **no están dentro de un `section.panel`** — que
es exactamente lo que mi selector contaba. Medí una estructura y la interpreté como
contenido.

**Conclusión de esta sección: no hay ningún defecto de jerarquía de información que
esta auditoría sostenga.** Las seis superficies dicen qué falta cuando no hay datos, y
una de ellas se niega a estimar con muestra insuficiente y dice cuántas operaciones
faltan.

---

## 6b · Cinco veces que el instrumento se equivocó, y todas en la misma dirección

Esto importa más que cualquier hallazgo suelto, porque es lo que separa esta auditoría
de un informe que suena bien:

| | lo que midió mal | lo que habría reportado |
|---|---|---|
| 1 | una operación **ganadora** para probar la rama de pérdida | 16 desconexiones inexistentes |
| 2 | nombres de campos y de `id` del DOM **adivinados** | `cumplimiento` y el DOM «no conectados» |
| 3 | `String(objeto)` para comparar `winRate` | `winRate` «no se mueve» |
| 4 | la **pre-sesión** como entrada del panel de protocolo | el protocolo «desconectado de las analíticas» |
| 5 | `section.panel` como proxy de contenido | dos superficies «sin estado de vacío» |

**Las cinco iban en la misma dirección: hacer parecer la aplicación menos integrada de
lo que está.** Una sonda escrita a la ligera no falla al azar — falla hacia la
hipótesis que la escribió. Las cinco se cazaron midiendo otra vez en vez de escribir
la conclusión.

Es el protocolo 14 —«no cuentes aserciones leyendo el código»— en un disfraz nuevo:
**no midas una estructura y la llames contenido.**

---

## 7 · Persistencia

Sin hallazgos nuevos. Las dos ramas siguen simétricas (`if (state.db)` / `else if
store === "local"`), con 28 aserciones sobre el doble del `db` (`test/capsula.mjs`) y
63 + 34 + 4 sobre `localStorage`. Los dos límites conocidos siguen en su sitio: el
doble fija el **contrato**, no la plataforma; y un fallo de escritura del `db` deja el
dato en memoria.

---

## 8 · Qué se cambió

**Nada de código, y no por prudencia: porque ninguno de los tres arreglos candidatos
sobrevivió a medirlo dos veces.** El estado de vacío de `ideas` y `playbook` ya existe.
El `calculateRiskState` duplicado es un alias de una línea. La desconexión del
protocolo era mi sonda. Añadir los campos de pérdida a `calculateDailyStats` sería
superficie que nadie consume.

Un cambio de código en esta pasada habría sido inventado.

---

## 9 · Bloqueos que quedan, en orden de lo que cuesta decidirlos

1. **`ddEngine`** — decisión de producto. En una cuenta quemada: colchón `0` contra
   `−300`, usado `500` contra `800`. Qué muestra la tarjeta a quien ya quemó la
   cuenta. `evaluateAccountRules` depende de la respuesta.
2. **El `+$160` inventado** — `additional` imprime la magnitud de la pérdida como
   «Ganancia que falta para cobrar» en una cuenta sin ningún día verde. Aislado en dos
   líneas `SIN_GANANCIA_APP`.
3. **Journal, sesiones, escenarios y playbooks sin fachada** — catorce nombres
   ausentes. Es lo que impide probar esa mitad del producto sin el DOM. No se arregla
   de golpe: se expone lo que un consumidor real necesite, cuando lo necesite.
4. **`source` y `broker` ausentes del modelo de operación** — con estrategia de
   migración y valor por defecto antes de cualquier importación.

---

## 10 · La fase siguiente, derivada de esta auditoría

No es «conectar los módulos»: están conectados, y está medido. Y **esta pasada no
produce ningún cambio de código**, que es el resultado honesto de una auditoría que
encontró el producto en mejor estado del que se le atribuía. Ninguno de los arreglos
que parecían candidatos sobrevivió a medirlo dos veces.

Lo que queda, en orden:

1. **Decidir las dos preguntas de producto** (§9.1 y §9.2). Ninguna la puede decidir un
   refactor, y `evaluateAccountRules` espera la primera.
2. **Exponer en la fachada lo que la primera prueba del journal necesite** — no
   catorce métodos de golpe. El criterio es que exista un consumidor real: añadir
   superficie que nadie usa es inventar integración, no construirla.
3. **`source` y `broker` en el modelo de operación**, con migración y valor por
   defecto, antes de cualquier importación de CSV o de API.

Lo que NO hace falta, y está medido: otro dashboard, migrar la arquitectura, construir
el Session Risk Engine —existe y responde `READY → WARNING`—, ni tocar los estados de
vacío.
