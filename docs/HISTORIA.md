# TURBOK2 · historia técnica

> Este archivo **era** el README. Se movió aquí entero, sin quitar una línea,
> porque documenta cómo se construyó cada pieza y —sobre todo— qué falló en cada
> una. Eso tiene valor y no se tira.
>
> Lo que no tenía sentido era que fuese la primera cosa que lee quien abre el
> repositorio. El README ahora describe **el sistema**; esto describe **el
> camino**. Los procedimientos que salieron de estos fallos están en
> [PROTOCOLOS.md](../PROTOCOLOS.md), cada uno con el fallo que lo produjo.

---

> El archivo que se publica como artefacto, qué capacidades declara y cómo
> republicarlo están en [ARTEFACTO.md](ARTEFACTO.md). El almacén de imágenes
> del artefacto **no** está en este repositorio, y ahí se explica por qué.

Cockpit de sesión para intradía en futuros, con journal de inversiones, playbook
por instrumento y calculadoras de riesgo e interés compuesto.

Es **una sola página**: `index.html` lleva dentro el HTML, el CSS y el JS. Sin
build, sin bundler, sin dependencias. Lo único que carga de fuera son las
tipografías de Google Fonts.


## Tres formas de entrar

El mismo `index.html` se abre de tres maneras, y **no se comporta igual en las
tres**. La diferencia no es cosmética: es qué capacidades le concede el entorno.

| Entrada | Dónde guarda | Imágenes | Respaldo |
|---|---|---|---|
| El artefacto en claude.ai | almacén `db`, sincronizado entre dispositivos | sí (`assets`) | por la cápsula, con permiso |
| GitHub Pages | `localStorage` del navegador | no | descarga normal |
| Archivo local (`file://`) | `localStorage` del navegador | no | descarga normal |

**GitHub Pages**: https://axcelsosa15.github.io/TURBOK2/

Servida así no existe `window.claude`, así que las cuatro llamadas a
capacidades caen a `null` y la app degrada: los datos viven en el
`localStorage` de ese navegador — **por dispositivo, sin sincronizar y sin
sobrevivir a un borrado de datos del sitio** —, el botón de subir imagen
desaparece y el respaldo usa la descarga del navegador. Que eso funcione en vez
de reventar en el primer `await` es lo que vigila `capa2.mjs` §12; ver
[ARTEFACTO.md](ARTEFACTO.md).

**Hace falta activarlo una vez a mano**: Settings → Pages → Build and deployment
→ Source: **GitHub Actions**. Un workflow no puede hacerlo por su cuenta — el
`GITHUB_TOKEN` de Actions no tiene permiso para *crear* el sitio de Pages, eso es
administración del repositorio, y `configure-pages` con `enablement: true` falla
con «Resource not accessible by integration». Mientras no esté activado el
workflow **avisa y no despliega**, sin ponerse rojo. Una vez activado, ese paso
encuentra el sitio y no intenta crear nada, así que a partir de ahí es
automático.

La publica `.github/workflows/pagina.yml`, y sólo **después de que la suite pase
en verde**: un push rojo no llega a la página, y lo que haya publicado sigue
siendo la última versión que pasó. Se sirven únicamente `index.html` y
`.nojekyll`, porque la página no referencia ningún otro archivo del
repositorio. Lleva `<meta name="robots" content="noindex, nofollow">`, así que
no entra en buscadores — lo cual no la hace privada: **cualquiera con el enlace
la abre**.

Para servirla en local sin Pages: `npm run serve` y abrir
`http://localhost:8000/`.

## Qué hay dentro

| Pestaña | Para qué |
| --- | --- |
| **Cabina** | Una pre-sesión por sesión de mercado (Asia, Londres, NY AM, Lunch, NY PM); niveles del día; **motor de reglas duras** que vigila instrumento, pérdida máxima, pérdidas seguidas, tope de ganancia y contratos con las operaciones del día; **centro de mando de cada cuenta prop** (balance, estado operativo, consistencia, drawdown, riesgo del día, rendimiento de hoy y curva); sesión de hoy con el banner en vivo y el desglose por sesión; y calendario de resultados. |
| **Futuros** | Journal de operaciones: resumen, cuentas, análisis (R múltiple, sesión de mercado, franjas horarias, día de la semana, consistencia), diario del día agrupado por sesión, e **historial de pre-sesiones** con el resultado que dio cada una. |
| **Inversiones** | Posiciones y operaciones por mercado, con métricas de asignación y salud de la cartera. |
| **Playbook** | Una sección por tipo de instrumento: futuros, perpetuos, opciones, cripto, acciones y ETFs, bonos, bienes raíces. |
| **Formas de hacer dinero** | Ideas por categoría, con estado y notas. |
| **Calculadora** | Interés compuesto y dimensionado de riesgo a partir de la cuenta y la regla dura. |

Todo en español y en horario de 12 horas. La hora de referencia es Nueva York
(ET), incluido el cambio de día: a medianoche en ET la cabina abre sesión nueva.

### La sesión es la unidad

La jornada se parte en ocho tramos en hora de Nueva York, sin huecos:

| Sesión | Tramo ET | Lista propia |
| --- | --- | --- |
| Asia | 8:00 PM – 2:00 AM | sí |
| Londres | 2:00 – 7:00 AM | sí |
| Pre-mercado | 7:00 – 8:30 AM | no, es la preparación de NY AM |
| NY AM Kill Zone | 8:30 – 11:00 AM | sí |
| Lunch | 11:00 AM – 1:30 PM | sí |
| NY PM | 1:30 – 4:00 PM | sí |
| Cierre RTH | 4:00 – 5:00 PM | no |
| Pausa diaria | 5:00 – 8:00 PM | no |

De esa tabla salen tres cosas a la vez: el reloj de la cabecera, la sesión a la
que pertenece cada operación (por su hora de entrada) y las cinco pre-sesiones
que se preparan por separado. Cada una guarda su lista, se sella aparte y queda
congelada sin tocar las demás.

### Cómo se archiva cada cosa

Escribes el instrumento en «Registrar operación» y la app decide el destino:

| Escribes | Va a | Por qué |
| --- | --- | --- |
| `MNQ`, `ES`, `MGC` | Journal de Futuros | contrato con valor de punto conocido |
| `MESZ5` | Journal de Futuros | contrato con mes de vencimiento |
| `ETHUSDT`, `BTC-PERP` | Journal de Futuros | perpetuo |
| `SPY 250117C500` | Inversiones · Opciones | contrato de opciones |
| `BTC`, `ETH`, `IBIT` | Inversiones · Cripto | activo conocido |
| `SGOV`, `TLT` | Inversiones · Bonos | activo conocido |
| `O`, `VNQ` | Inversiones · Bienes raíces | activo conocido |
| `VTI`, `QQQ` | Inversiones · ETFs | activo conocido |
| cualquier otro | Inversiones · Acciones | no es un contrato de futuros |

Siempre se puede forzar el destino a mano antes de guardar.

## Traer los datos desde el artefacto

Las dos copias no se hablan solas: cada una guarda en su sitio. El puente es un
archivo JSON, y está construido en las dos direcciones.

1. Abre la Cabina del artefacto y baja hasta **«Copia de seguridad y traspaso»**,
   al final de la primera pestaña.
2. Marca **«Meter las capturas dentro del archivo»** si quieres que los gráficos
   de cada operación viajen también. Sin eso el archivo pesa poco, pero las
   capturas se quedan atrás: viven en el almacenamiento del artefacto y desde
   fuera no se pueden leer.
3. Pulsa **«Descargar copia»**. Se descarga `cabina-AAAA-MM-DD.json`.
   Si la descarga no está disponible en esa vista, **«Ver el texto»** te lo deja
   en el portapapeles.
4. Abre esta copia, ve al mismo panel, elige **«Reemplazar todo»** y pulsa
   **«Elegir archivo…»** (o **«Pegar el texto»**).
5. Revisa el resumen que sale — dice qué trae y qué va a pasar — escribe
   `IMPORTAR` y confirma. La página se recarga con los datos dentro.

Funciona igual al revés. Un par de detalles que conviene saber:

- **`format` y `version`.** El archivo lleva las dos marcas. Si algún día cambia
  la forma de los datos, quien importe sabrá de qué versión viene en vez de
  romperse en silencio. Una copia más nueva que la cabina que la lee se rechaza
  con un aviso claro.
- **Reemplazar vs. añadir.** En el navegador se puede empezar de cero. Contra la
  base del artefacto la importación solo escribe encima por id y **nunca borra**
  lo que no venga en la copia: un borrado masivo en la nube no se deshace.
- **Las capturas importadas se ven pero no se editan** en una copia estática: sin
  almacenamiento de imágenes se pueden mirar y quitar, no añadir nuevas.

## El motor de cálculo · QuantEngine v2

Todos los números salen de `engine/quant/`. Funciones puras: sin DOM, sin reloj,
sin `Math.random()` sin semilla, sin dependencias. **253 pruebas**:

```bash
node engine/quant/quant.test.js
```

### Capas

| Módulo | Qué resuelve |
| --- | --- |
| `kernel.js` | `Result` único, guardas, dinero en **centavos enteros**, PRNG sembrado, normal inversa |
| `contracts.js` | rejilla de ticks de 18 futuros; el invariante `multiplier == tickValue / tickSize` se verifica al cargar |
| `trade.js` | P&L exacto en ticks enteros, R como cociente de ticks, dimensionamiento de posición |
| `stats.js` | Welford, cuantiles tipo 7, Wilson, bootstrap sembrado, muestra mínima, significancia |
| `edge.js` | esperanza con IC, profit factor, Kelly, SQN, rachas, distribución de R, concentración |
| `curve.js` | curva de capital y drawdown como **máquina de estados**; consistencia |
| `survival.js` | Monte Carlo de supervivencia de cuenta y barrido de tamaño de posición |
| `compliance.js` | veredicto operativo: QUEMADA > BLOQUEADA > RESTRINGIDA > AVISO > LISTA |
| `index.js` | fachada + adaptador para Cabina (`calcularTradeApp`, `radiografiaCuenta`) |

### Las tres reglas que el motor no rompe

1. **Ningún estadístico se devuelve desnudo.** Cada número viaja con su `n`, su
   error estándar y un veredicto de fiabilidad. Un profit factor de 2.4 sobre 6
   operaciones y uno sobre 600 se imprimen igual y no significan lo mismo; el
   motor está obligado a decir cuál es cuál.
2. **Lo que no se puede calcular devuelve `null` y dice por qué.** Sin valor de
   tick no hay P&L: nunca un multiplicador supuesto. Sin perdedoras el profit
   factor es *indefinido*, no `Infinity`.
3. **Puro y determinista.** Misma semilla, mismo resultado. Una simulación que
   no se puede reproducir no es evidencia.

### Decisiones de diseño que costaron algo

**El dinero vive en centavos enteros.** El float sólo existe en la frontera.
Mil operaciones de \$1.00 suman exactamente \$1000, no \$999.9999999998.

**El dato primario de un contrato es `(tickSize, tickValue)`; el multiplicador es
derivado.** Un futuro no se opera en puntos, se opera en ticks: el P&L es siempre
un múltiplo entero del valor del tick. Escribir el multiplicador a mano permite
specs incoherentes que producen P&L plausible pero falso durante meses. Aquí el
invariante revienta al cargar el módulo. Efecto lateral: los precios fuera de
rejilla (tipeos) se detectan y se avisan en vez de tragarse.

**Monte Carlo en vez de la fórmula clásica de riesgo de ruina.** La fórmula de
Vince asume ganancia y pérdida de tamaño fijo y ruina en cero. Ninguna de las
tres es cierta aquí: la distribución de R tiene colas, el suelo es móvil
(*trailing*) y encima hay límite de pérdida diaria y regla de consistencia que
interactúan entre sí — un día grande puede **retrasar** el aprobado aunque el
objetivo ya esté cubierto. Remuestrear las operaciones reales respeta la forma
real de la distribución sin asumir normalidad.

**Base del trailing: `cierre` vs `intradía`.** El pico se actualiza al cerrar el
día o operación a operación. Es la diferencia entre pasar y quemar una cuenta, y
casi ninguna herramienta lo modela.

**La consistencia no impide operar, impide cobrar.** Marcarla como «no puedes
operar» es factualmente falso y además empuja al trader a dejar de registrar
justo los días con más información.

### Cómo llega el motor a la app

`index.html` es un solo archivo sin imports, así que `engine/quant/bundle.mjs`
concatena los módulos en un único ámbito:

```bash
node engine/quant/bundle.mjs   # escribe engine/QuantEngine.bundle.js
```

Ese bundle va literal dentro de `index.html` como `const QE = (function(){…})()`.
El encierro no es decorativo: motor y app tienen funciones con el mismo nombre y
distinto comportamiento — `toNum("")` da `null` en el motor y `num("")` da `0` en
la app — y sueltas en el mismo ámbito la del motor ganaría por *hoisting* sobre
todos los formularios.

El motor se expone además como `window.QuantEngine` **a propósito**: es puro y no
muta nada, así que desde la consola del navegador puedes interrogar tus propios
datos sin pasar por la interfaz.

```js
QuantEngine.analizarEdge(ops)          // ventaja con intervalos de confianza
QuantEngine.simularCuenta({…})         // probabilidad de pasar vs quemar
QuantEngine.barridoDeRiesgo({…})       // dónde deja de convenir subir tamaño
QuantEngine.radiografiaCuenta(tr, ac)  // todo junto para una cuenta
```

`tradeCalc` no calcula: pregunta. Devuelve las mismas claves de siempre
(`pnlEff`, `rReal`, `rPlanned`, `riskUsd`, `multUnknown`, `calcError`), así que
**ninguna función de render cambió una sola línea**. Verificado por diff de
salidas: 7 archivos de prueba de comportamiento, 0 diferencias.

**Comisiones automáticas apagadas por defecto.** El motor las conoce por
instrumento, pero encenderlas bajaría el P&L de todo el histórico; hasta que
`settings.meta.autoFees` sea `true`, manda el campo «Comisiones $» escrito a mano
y ningún número del pasado cambia de valor.

### Números en negativo

Tres defectos reales de signo, encontrados probando la app con una cuenta en
pérdida en vez de con una ganadora. Los tres estaban a la vista y ninguno daba
error: producían cifras plausibles y falsas.

**1. La consistencia inventaba un 100% sobre una cuenta en rojo.**

```js
const ratio = total > 0 ? best / total : (best > 0 ? 1 : 0);   // antes
```

Ese `1` era un centinela interno que acababa impreso como
`Consistencia 100% sobre un límite de 30%` en una cuenta que iba `-$120`. La
consistencia reparte GANANCIAS: sin ganancia acumulada el cociente no existe.
Ahora es `null`, el estado se llama `NO APLICA`, y el texto dice el problema de
verdad — *«el problema no es la consistencia, es el resultado»*. Lo que sí
sigue siendo medible (cuánta ganancia falta para poder cobrar) se conserva.

**2. Un retiro guardado en negativo hacía la cuenta más rica.**

`balance = size + total + deposits − payouts`, y el importe se leía tal cual. Un
respaldo con `{kind:"payout", amount:-500}` restaba `−500`, es decir sumaba.
Medido de extremo a extremo con tres movimientos en negativo:

| | Balance |
| --- | --- |
| antes | `$25,300` **(+$300)** |
| después | `$24,700` **(−$300)** |

$600 de dinero fantasma. El **tipo** del movimiento lleva el signo, así que el
importe se lee siempre como magnitud (`Math.abs`) en el saneador de importación,
en la suma y en la tabla.

**3. Doble signo en la tabla de movimientos:** `+-$200`, `--$50`.

Además:

- `size`, `dd` y `target` se rechazan en negativo: un drawdown negativo no
  significa nada y envenena el suelo, el colchón y toda la simulación.
- `total` (ganancia previa) **sí** acepta negativo — es un resultado, no un
  tamaño — y el campo lo dice.
- La esperanza distingue ahora tres estados y no dos: ventaja confirmada,
  ventaja sin confirmar, y ventaja *medidamente negativa*. Pintar las dos
  últimas igual borra la diferencia entre «no lo sabemos» y «estás perdiendo».
- Los importes del panel llevan signo siempre visible (`+$120` / `-$120`): en
  una rejilla de cifras un menos fino se pierde de vista.

**Ejemplo en rojo.** El panel trae un botón que carga un sistema sintético
perdedor (32% de acierto, payoff 1.6:1) para ver la radiografía en rojo sin
perder dinero de verdad. Va marcado en pantalla y **no entra en ninguna
colección**: las operaciones reales siguen intactas.

### Un solo sitio para cada cosa

Después de arreglar los tres errores de signo busqué la misma familia de bugs a
propósito, en vez de esperar a tropezarla. Apareció algo peor que un signo: **un
motor de riesgo entero duplicado fuera del motor**, en la calculadora de riesgo.

| Duplicado en la interfaz | Ya existía en el motor | Por qué importa |
| --- | --- | --- |
| `riskThreshold()` | `sueloPara()` | **Dos definiciones del suelo de la cuenta.** Es el bug de las dos tablas de multiplicadores otra vez: en cuanto una cambia, la calculadora y la tarjeta discrepan sobre si estás vivo. |
| `riskSim()` | ahora `simularParametrico()` | Un segundo Monte Carlo, con su propio generador, sin una sola prueba. |
| `rngOf()` | `rng()` | Copia byte a byte del mismo mulberry32. |
| `streakProb()` | ahora `probabilidadDeRacha()` | Programación dinámica exacta; merecía pruebas. |

El modelo paramétrico —ganancia fija `R`, pérdida fija `1`— **no** se sustituyó
por el bootstrap. Ahí es el modelo correcto: la calculadora pregunta *«y si mi
acierto fuera del 45%»*, o sea la hipótesis **es** la entrada y no hay
distribución real que remuestrear. Lo que no tenía por qué tener era su propio
generador, su propio suelo y cero pruebas. Ahora vive en `survival.js` junto al
bootstrap, y cada uno responde la pregunta que le toca.

Salida de la calculadora antes y después de la consolidación: **idéntica al
carácter**. Un refactor que cambia un número no es un refactor.

**Y se acabó el `∞`.** La app imprimía `∞` como profit factor en cuatro sitios
cuando no había ninguna operación perdedora. El motor ya se negaba a hacerlo;
la interfaz no. Ahora `futStats` devuelve `null` con `pfRazon`, y la tarjeta
dice *«sin operaciones perdedoras: indefinido»* en vez de insinuar un sistema
perfecto que sólo tuvo pocas operaciones.

### Tiempo real, y lo que encontré al medirlo

«Que todos los números se ajusten solos al entrar una operación» sonaba a que
ya funcionaba: el store abanica a doce renders. Así que en vez de suponerlo, lo
medí. La verdad de referencia es **lo que muestra la app tras recargar**:
cualquier valor que difiera entre *actualizado en vivo* y *tras recargar* está
rancio.

**549 valores numéricos**, seis pestañas, todas las sub-vistas: **cero rancios**.
La propagación estaba bien. Lo que no estaba bien era otra cosa.

**1. El pico podía BAJAR, y eso congelaba el colchón en «lleno».**

El pico se calculaba sobre los cierres diarios *recalculados*. Con dos
operaciones el mismo día, el «cierre» de hoy cambia con cada una:

| | balance | pico | suelo | colchón |
| --- | --- | --- | --- | --- |
| tras +$120 | 25,120 | 25,120 | 24,120 | $1,000 |
| tras −$40 | 25,080 | **25,080** ↓ | 24,080 | **$1,000** |
| tras −$40 | 25,040 | **25,040** ↓ | 24,040 | **$1,000** |

El suelo perseguía al balance hacia abajo, así que **el colchón salía siempre
lleno: perdieras lo que perdieras, la app decía que te quedaban $1.000**. El
único número que avisa de que vas a quemar la cuenta estaba clavado en «todo
bien» por construcción.

El pico es un **trinquete** sobre el recorrido del capital, no un máximo de
agregados que se recalculan. `QE.construirCurva` ya lo hacía bien, así que
`acctAgg` ahora se lo pregunta — y de paso desaparece la **tercera** copia de la
fórmula del suelo. Corregido: pico `25,120` fijo, colchón `$1,000 → $960 → $920`.

Con esto llega un campo nuevo por cuenta, **«El pico se marca…»**: *intradía*
(operación a operación) o *al cierre del día*. Decide si un máximo que tocaste a
media sesión cuenta, y es la diferencia entre pasar y quemar una cuenta. El
valor por defecto es **intradía** porque es lo conservador: nunca te infla el
colchón.

**2. La calculadora de riesgo dimensionaba sobre un balance viejo.**

`loadAcctIntoRisk` **copiaba** balance y pico a sus campos. Una vez copiados se
congelaban: la tarjeta decía `$25,080` y la calculadora seguía en `$25,120`, con
umbral, colchón, ruina y número de contratos calculados sobre el balance
equivocado. Justo el panel con el que decides el tamaño.

Ahora queda **vinculada**: los cinco campos que derivan de la cuenta se releen
solos al entrar una operación, y el panel lo dice (`● en vivo desde la cuenta A
25K`). Si escribes tú uno de esos campos, mandas tú: se desvincula y lo avisa,
en vez de que el siguiente trade te pise el número.

**3. Un `catch {}` vacío escondía un fallo permanente.**

El abanico era `try { renderHistory(); renderAccounts(); renderRules(); } catch {}`.
Si el primero lanzaba, los otros dos **no corrían** y nadie se enteraba: números
clavados, cero errores en consola. Ahora cada render está aislado, un fallo se
nombra en pantalla, y el primer arranque con el cambio destapó esto:

```
render «respaldo» falló: ReferenceError: Cannot access 'BK_PARTS' before initialization
```

`BK_PARTS` se declaraba **después** de la suscripción, y `subscribe()` ejecuta su
callback de inmediato: el panel de respaldo llevaba fallando en silencio en cada
arranque. Arreglado moviendo la declaración delante de quien la usa.

### Lo que costaba el tiempo real

Después de arreglar el pico y el vínculo medí lo que nunca había medido: **qué
cuesta guardar una operación cuando el journal ya pesa.** Un intradiario de 3 a
5 operaciones al día llega a 2.500 en dos años, así que no es hipotético.

| operaciones | guardar 1 op (antes) | (después) |
| --- | --- | --- |
| 250 | 127 ms | **70 ms** |
| 1.000 | 360 ms | **159 ms** |
| 3.000 | 982 ms | **354 ms** |

Casi un segundo de retraso al registrar un trade con 3.000 en el histórico. Lo
primero fue descartar que lo hubiera roto yo con el trinquete del pico: medido
antes y después, **la diferencia está dentro del ruido** (978 → 967 ms). Era
previo. El perfil por render lo señaló sin ambigüedad: **93% en `renderFutures`**,
y dentro de él, `renderQE` — mi propio panel.

**El bootstrap asignaba un array por repetición.** `bootstrapCI` llamaba a
`momentos(buf)` en cada una de las 2.000 repeticiones, y `momentos` hace
`limpiar()`, que **asigna un array nuevo**. Con n=1500: 3 millones de elementos
copiados para calcular 2.000 medias, en cada render. Cuando el estadístico es la
media —el caso por defecto— ahora se acumula en línea, sin buffer. Misma
secuencia del PRNG, **mismo resultado bit a bit**: no cambia ni un decimal.
`analizarEdge` con 1.500 operaciones pasó de dominar el render a **36 ms**.

Además las repeticiones se escalan con `n` (`n ≤ 400` mantiene 2.000; por encima
se acota el trabajo total). Con muestras grandes el intervalo ya es estrecho y
2.000 repeticiones sólo compran decimales que nadie mira, a cambio de bloquear
la interfaz.

**`tradesOf` recalculaba lo mismo varias veces por render.** Filtra, valora y
**ordena** todas las operaciones; un solo render lo llamaba desde los tiles, los
filtros, las cuentas, el panel y los gráficos, repitiendo el mismo `O(n log n)`
sobre datos idénticos. Ahora se memoriza contra un contador de revisión
(`coll.rev`, que sube en cada `emit()`), así que si nada cambió no se recalcula
nada.

Memorizar es exactamente como se introducen datos rancios, así que la
verificación fue el mismo detector de antes: **549 valores, cero rancios**, más
las rutas de editar, borrar y el vínculo de la calculadora.

### Sacar a la superficie lo que ya estaba construido

Auditoría: qué capacidades del motor **no tienen superficie en la interfaz**.
Resultó que varias estaban construidas y probadas, y sin usar.

**1. Los avisos del motor no llegaban a la pantalla.** `valuarOperacion` detecta
precios que el contrato **no puede producir** —un `21000.13` en MNQ, que cotiza
de 0,25 en 0,25— y stops del lado equivocado. `tradeCalc` los descartaba. Un
dedazo en el precio de entrada corrompía P&L, R, riesgo y todo lo derivado sin
un solo aviso.

Ahora el editor los muestra **mientras escribes**, con un botón que corrige al
valor de la rejilla:

```
! La entrada 21000.13 no cae en la rejilla de MNQ (tick 0.25).   [usar 21000.25]
```

No bloquea el guardado: un contrato sintético no tiene rejilla y hay rellenos
raros de verdad. Pero el dedazo se caza cuando todavía se puede corregir, y no
dentro de un P&L que ya alimentó el balance, el drawdown y la consistencia.

Dos detalles que costaron su rato: los listeners se enganchan **una sola vez**
(`#edFields` persiste entre aperturas y re-suscribirse acumulaba uno por
apertura), y el botón de corrección usa **delegación** — al pulsarlo el input
pierde el foco, dispara `change`, la zona se repinta y el nodo del botón moría
entre el `mousedown` y el `click`.

**2. El peor momento de la cuenta se calculaba y se tiraba.** `peorMomento`
recorría la curva en cada render y se descartaba. Para una cuenta de fondeo es el
dato con más información que existe: no cuánto ganaste, sino **a cuánto llegaste
del suelo**. Ahora vive en el módulo de Drawdown y persiste:

```
LO MÁS CERCA QUE HAS ESTADO   $160   el 10 sep 26 · quedaba 16% del colchón
```

**3. `metricasCurva` nunca se llamaba.** Caída máxima y su fecha, días bajo el
agua, factor de recuperación, índice de úlcera, Sharpe y Sortino anualizados:
todo construido, probado y sin superficie. Ahora es una sección de la
Radiografía — y el veredicto del motor manda: con 11 días, Sharpe 6,72 y Sortino
24,02 salen **apagados** y marcados «sin fiabilidad todavía», con la explicación
de por qué las tres primeras tarjetas sí se leen y esas dos no.

**4. La tabla del diario pintaba todas las filas.** Con 3.000 operaciones,
~42.000 nodos en el DOM y el segundo coste más grande al guardar un trade.
Nadie lee la fila 1.800 desplazándose: se pinta un tramo de 250 y se amplía a
petición. El click ya estaba delegado, así que las filas nuevas funcionan solas.

| operaciones | guardar 1 op (v43) | (ahora) |
| --- | --- | --- |
| 250 | 148 ms | **95 ms** |
| 1.000 | 455 ms | **170 ms** |
| 3.000 | 1.284 ms | **286 ms** |

**Una mejora que descarté.** Tenía apuntado enrutar la calculadora de riesgo por
`QE.dimensionar` porque «ignora la rejilla de ticks». Al mirarlo de cerca, su
parametrización —puntos × $/punto— es **equivalente**: no había bug, y cambiarlo
habría sido cambio por cambio.

Verificación: 560 valores comparados en vivo contra tras recargar, cero rancios.
18 archivos de prueba, 0 errores de página. Diff contra la versión anterior:
**10 archivos, todos idénticos** — las cuatro mejoras son puramente aditivas y
ningún número existente cambió.

### Captura, no más análisis (MAE / MFE)

Hasta aquí, 45 versiones analizando datos que ya existían. Esto añade **datos
que no existían**, que es el cuello de botella real. `excursion.js`:

- **MAE** (*Maximum Adverse Excursion*): lo más en contra que fue antes de resolverse.
- **MFE** (*Maximum Favourable Excursion*): lo más a favor que llegó antes de que salieras.

Son los dos números que el P&L **no puede contener**, y contestan lo único que el
resultado no dice:

| Pregunta | Se responde con |
| --- | --- |
| ¿Cuánto podría apretar el stop sin perder ganadoras? | cuantil alto del MAE **de las ganadoras** |
| ¿Cuánto dejo en la mesa por salir pronto? | MFE frente a la salida real |
| ¿Cuántas ganancias reales devuelvo? | operaciones que llegaron a +1R y acabaron en pérdida |

**El MAE se mide sólo sobre ganadoras, a propósito.** En una perdedora el MAE
acaba siendo el stop por definición; meterlas contaminaría la conclusión.

**Un error de diseño que cazó la prueba.** La primera versión promediaba la
captura sobre todas las operaciones. En una perdedora que fue a favor y volvió,
la captura es *negativa*: el panel llegó a mostrar **«captura de la salida
−61,5%»**, que no significa nada. Ahora la captura se promedia sólo sobre
ganadoras, y las perdedoras que fueron a favor contestan su propia pregunta en
una tarjeta aparte — **ganancias devueltas**, el síntoma más caro que existe y el
que el P&L nunca ve, porque cuenta la pérdida y no la ganancia que hubo antes.

**Cuatro campos nuevos, todos opcionales**: hora de salida, por qué saliste
(objetivo / stop / manual / tiempo / noticia / nervios), MAE y MFE. Se piden
después de la salida porque antes no existen, y son opcionales por una razón de
diseño explícita: **un campo que frena el registro reduce el número de
operaciones registradas, y ese número es el cuello de botella**. Una operación
guardada sin ellos funciona exactamente igual.

La superficie es deliberadamente corta: tres tarjetas que sólo aparecen cuando
hay con qué sostenerlas. Sin datos suficientes sale un contador — *«llevas 3; con
5 empiezan a salir números y con 30 se pueden creer»*— que hace más por el
registro que cualquier gráfico.

### Inversión: cinco arreglos, uno de ellos matemático

El criterio de diseño aquí es **el contrario** al de futuros. En futuros, más
atención y más medición ayudan. En una cartera de largo plazo la atención es el
enemigo: mirar más lleva a tocar más. Todo lo de abajo está construido para que
abras este tab **menos**, no más.

**1. La rentabilidad estaba mal calculada.** `(valor − coste) / coste` es retorno
simple sobre coste total, y con aportes repartidos en el tiempo no es tu
rentabilidad: el dólar de enero trabajó doce meses y el de diciembre, cero.
Medido con un DCA de $200/mes sobre un activo que sube 10%:

```
  retorno simple    5.34%    ← lo que mostraba
  IRR anualizado   10.00%    ← lo que de verdad pasó
```

Casi la mitad — y el error va en la dirección peligrosa: **te hace parecer peor
de lo que eres**, lo que empuja a abandonar una estrategia que funciona. El tile
ahora titula con el IRR y relega el simple a subtítulo, con la brecha nombrada.

`portfolio.js` calcula el IRR por **bisección** sobre el valor capitalizado.
Newton converge más rápido pero puede divergir con flujos irregulares, y aquí
importa más no mentir que terminar rápido.

**Y lo que NO calcula:** el TWR verdadero necesita el valor de la cartera *en
cada fecha de aporte*, y eso no se registra. Se devuelve `null` con su motivo en
vez de aproximarlo y hacerlo pasar por exacto.

*Un bug propio, encontrado por el control:* la primera versión **dividía** por
`(1+r)^t` en vez de multiplicar — descontaba los aportes hacia adelante en lugar
de capitalizarlos. Daba **−9,06%** para una cartera que ganaba. Lo cazó el caso
de control: una compra única con +10% en un año tiene que dar 10,00% por ambos
métodos.

**2. La posición no soportaba DCA.** Una posición era *una* fecha, *una* cantidad,
*un* precio. El playbook de esta misma app recomienda «DCA mensual en índice»:
doce compras del mismo ETF no caben en ese molde. Y los datos ya existían — el
flujo de operaciones los tenía. Ahora la posición **se deriva de sus
operaciones** (emparejadas por activo + mercado), con coste medio, ventas
parciales y conteo de compras. Si no hay operaciones, mandan los campos escritos
a mano: nada de lo que ya tenías deja de funcionar.

**3. El precio actual no tenía fecha.** Una cartera valorada hace tres meses se
mostraba como «valor actual» sin más. Ahora cada precio se sella al guardarlo y
la fila dice *«hace 34 días»*, en ámbar pasada una semana y en rojo pasado un
mes. El scorecard mira la fecha, no sólo la existencia.

**4. ¿Cuánto te ha costado tocar?** El equivalente de «el protocolo, ¿paga?» en
inversión. Cada venta se puede marcar como desviación del plan, y para las que
tienen precio de referencia se calcula exactamente qué valdrían hoy esas unidades
frente a lo que te dieron. Sin contrafactual: las unidades existieron y el precio
de hoy lo tienes escrito.

**5. Fricción al VENDER, no al comprar.** En futuros el *gate* frena las entradas
fuera de protocolo. Aquí el error caro es el contrario, así que al elegir «venta»
aparece **el plan de salida que tú mismo escribiste**, con la línea que importa:
*«lo escribiste cuando no sabías el resultado»*. No bloquea —a veces vender es
correcto— pero obliga a leerlo antes.

329 pruebas del motor (36 nuevas de cartera). 23 archivos de prueba de la app.
Diff contra la versión anterior: 10 archivos, una sola diferencia — el texto del
tile de rentabilidad, que es el cambio buscado.

### El bug que introduje al arreglar el DCA

Veinte minutos después de derivar la posición de sus operaciones, fui a buscar
lo que acababa de romper. Lo encontré.

`posLotes` emparejaba por **activo + mercado**. Con **dos** posiciones del mismo
activo en el mismo mercado, cada una reclamaba el conjunto **completo** de
operaciones:

| posiciones de VOO | invertido | valor |
| --- | --- | --- |
| 1 | $2,400 | $2,528 |
| 2 | **$4,800** | **$5,056** |
| 3 | **$7,200** | **$7,584** |

La cartera mostraba el triple del dinero que hay. Y el escenario no es raro: es
exactamente el apaño que el modelo **viejo** obligaba a hacer —una posición por
compra— así que quien lo hubiera usado vería su patrimonio multiplicado el día
que actualizara.

**Cuando hay ambigüedad no se reparte a ojo.** Se cae a los campos escritos a
mano y la fila lo dice: *«3 posiciones de VOO aquí · únelas para derivar de las
operaciones»*.

**Y una segunda corrección, más pequeña:** el precio sólo se re-fechaba si el
número cambiaba. Si lo revisabas y seguía igual, contaba como viejo — pero lo
miraste hoy. Ahora se re-fecha siempre que haya precio.

Verificación: 24 archivos de prueba, 562 valores en vivo contra tras recargar sin
rancios, y **los 13 diffs idénticos** — el arreglo sólo toca la ruta de
posiciones duplicadas, que ninguna prueba anterior ejercitaba. Por eso existe
ahora `dup.mjs`.

### El diagrama, hecho ejecutable

Un diagrama de arquitectura es una afirmación, y una afirmación se comprueba.
`test/capa.mjs` mete tres operaciones y lee **las mismas siete magnitudes desde
CABINA y desde FUTUROS**, que las llaman distinto («Ganancia total» vs «P&L
NETO», «Suelo de la cuenta» vs «umbral»):

```
  magnitud            CABINA      FUTUROS
  ✅ ganancia total         140         140
  ✅ balance              25140       25140
  ✅ colchón               1000        1000
  ✅ suelo / umbral       24140       24140
  ✅ mejor día              120         120
  ✅ consistencia            86          86
  ✅ P&L (tiles)            140         140

  7/7 idénticas: las dos pestañas leen del mismo cálculo.
```

Y el escaneo estático lo respalda: **una sola definición** de `tradeCalc`,
`acctAgg`, `consistency`, `futStats`, `tradesOf`, `evaluateAccountRules`,
`posCalc`, `investStats` y `dayRuleCheck`, y **cero** sitios recalculando P&L a
mano. No siempre fue así — esta misma sesión eliminó la tabla `MULT` duplicada,
`riskThreshold`, `rngOf` y un segundo Monte Carlo.

**Las pruebas de la app vivían en un directorio efímero.** Si el contenedor
moría, se perdían — y con ellas la única forma de re-verificar que la
arquitectura sigue siendo cierta. Ahora están en `test/` (42 archivos), con
`test/build-preview.mjs` para reconstruir el preview desde `index.html`.

Las dos más valiosas no comparan contra un valor escrito a mano: comparan **la
app contra sí misma**. `vivo.mjs` compara *en vivo* contra *tras recargar*;
`capa.mjs` compara *una pestaña* contra *otra*. Eso encuentra cosas que un valor
esperado no encuentra, porque no depende de que a quien escribe la prueba se le
ocurra el caso.

### La puerta única (`FUT`)

El diagrama ya era cierto para los **números**: CABINA y FUTUROS leían de
`coll("trades")` y de `acctAgg`. Lo que no estaba unificado era la **selección
de cuenta**: `ft.acct` vivía solo en FUTUROS, CABINA no tenía selector, y la
única conexión era un botón que saltaba de una pestaña a la otra. Dos pantallas
de la misma cuenta podían estar mirando cosas distintas.

`FUT` es la capa de datos hecha explícita: lecturas, escrituras, selección,
cálculo y reglas en un solo objeto. **No calcula nada nuevo.** Cada función
delega en la implementación que ya existía, así que añadirla no puede crear una
segunda verdad; su valor es el contrario: convierte *«¿de dónde sale este
número?»* en una lista cerrada de sitios a los que se puede llamar.

```
                      FUT  ← window.FUT (depuración y pruebas)
   ┌───────────────────┼────────────────────┐
   lecturas        escrituras            cálculo
   accounts()      createTrade()         calculateAccountStats()
   trades()        updateTrade()         calculateConsistency()
   rules()         deleteTrade()         calculateDrawdown()
   selectedAccount() createAccount()     calculateEquityCurve()
                   updateAccount()       calculateStreaks()  …15 en total
                   deleteAccount()
                   updateRule()          reglas
                   setSelectedAccount()  evaluateRules(cuenta, fecha)
                   setFilters()
        │                    │                     │
        └──────── coll("trades") · state.settings · QE ────────┘
```

**La selección de cuenta es un solo estado**, guardado en los ajustes y por
tanto superviviente a un refresh. El selector de CABINA y el filtro de FUTUROS
escriben en el mismo sitio; ninguno avisa al otro porque los dos repintan desde
él. La tarjeta de la cuenta elegida se marca y sube arriba en CABINA — no se
ocultan las demás: la selección dice *«esta es la que estoy operando»*, no
*«olvídate del resto»*.

Dos cosas cambiaron de comportamiento al hacerlo:

- **FUTUROS → Cuentas ahora enseña el estado operativo** (LISTA / AVISO /
  RESTRINGIDA / BLOQUEADA / QUEMADA) que salía del mismo motor y solo se veía en
  CABINA. Enseñaba el dinero de la cuenta pero no si el día estaba cerrado.
- **El panel de reglas se mide sobre la cuenta seleccionada.** Antes sumaba el
  día de todas las cuentas, y entonces el panel y la tarjeta —que sí se mide por
  cuenta— podían discrepar del mismo día. Sin selección, sigue mirando el día
  completo.

Lo que **no** cambió, a propósito: los filtros de FUTUROS siguen sin tocar las
métricas de cuenta. `acctAgg` filtra por `accountId`, nunca por `ft`, así que
filtrar el análisis por instrumento no mueve el balance. `test/sync.mjs` lo
comprueba explícitamente, porque es el error clásico de esta separación.

`evaluateRules(cuenta, fecha)` es la firma completa: acepta una fecha, así que
se puede preguntar por un día que no es hoy, y devuelve además las listas de
`violations` y `warnings` y un `lockedUntil`. Los cierres por pérdida del día o
por racha duran hasta el cierre de **ese** día; una cuenta quemada no tiene
fecha de desbloqueo.

Tres pruebas del directorio estaban rotas **desde antes de esta sesión**, y las
tres por defectos de la propia prueba, no de la app:

- `vivo2` y `vivo3` medían un panel *desde otra pestaña* y lo comparaban contra
  el mismo panel visible: «oculto ≠ visible», ❌ garantizado sin que la app
  tuviera nada mal. Peor: `vivo2` preguntaba si el editor estaba abierto con
  `getElementById('ef_exit')`, y el overlay se queda en el DOM al cerrarse, así
  que el `fill` siguiente moría por *timeout* y se llevaba el resto del archivo.
  Sus partes B y C —editar y borrar desde el journal— apuntaban a un `#ftList`
  que no existe: llevaban imprimiendo «se revisa aparte» desde el primer día.
  Ahora miden en la misma pestaña, usan `.ov.open` y `#jrTable`, y **pasan**:
  editar de +$120 a +$400 y borrar una de dos se propagan solos.
- `perfil` y `ledger` morían por un archivo ausente (`preview_perf.html`,
  `prev_v1.html`): builds de usar y tirar que no están versionadas. Ahora se
  degradan — `perfil` mide reloj de pared sin el desglose, `ledger` se salta la
  mitad arqueológica.

El foco pasó a probarse sin navegar: se escribe en un campo, entra una operación
por la capa de datos, y se comprueba que el cursor y lo escrito siguen ahí. Eso
sí es el invariante que importa.

`test/sync.mjs` recorre los diez escenarios completos —crear desde cada
pestaña, editar, borrar, tope diario, racha, contratos, varias cuentas,
selección compartida, persistencia— más los casos límite que rompen esto de
verdad: cuenta con cero operaciones, y la operación que cambia de día y de
cuenta.

### Medir antes de optimizar, y decirlo cuando la medida te contradice

Guardar una operación con 1.500 en el journal llamaba a `acctAgg` **18 veces**
con tres cuentas abiertas: seis por cuenta, devolviendo exactamente lo mismo
cada vez. Parecía el cuello de botella. Memoricé `acctAgg`, `futStats`,
`futFiltered` y las listas por cuenta, con la disciplina de siempre — la clave
incluye **todo** lo que la función lee, así que no hay que acordarse de
invalidar nada:

```
                       llamadas      reloj
  acctAgg   antes  18        →  3
  futStats  antes  7.500 ops →  3.000     190 ms → 181 ms
```

**Las llamadas cayeron 6× y el reloj no se movió.** Dicho claro: memoricé lo que
parecía caro por número de llamadas y no lo era. Perfilando de verdad, en un
guardado de 179 ms:

```
  renderFutures   103 ms   ← el DOM
  renderQE         34 ms
  futStatsCrudo     4 ms   ← la matemática
```

La cuenta nunca fue el coste. Lo era reconstruir la tabla, el calendario y los
gráficos como cadenas de HTML.

Lo que sí estaba mal era **cuántas veces** se reconstruían. Al arrancar,
`loadLocal()` emite una vez por colección —trades, playbooks, ideas, markets,
watch, positions— y cada suscriptor llamaba a sus renders a pelo:
`renderFutures` corría 4 veces, `renderInvest` 6, para producir el mismo HTML.
Ahora todos los suscriptores pasan por un agrupador que acumula zonas **por
nombre** y las pinta una vez por tick:

```
  arranque (1.500 ops, 3 cuentas)   855 ms → 661 ms   (−23%)
  arranque (300 ops, 1 cuenta)      678 ms → 563 ms   (−17%)
  guardar una operación             161 ms → 167 ms   (sin cambio)
```

El guardado no mejora y no hay por qué fingir que sí: ahí solo emite `trades`,
o sea no había nada que agrupar. Lo que queda por hacer, si alguna vez molesta,
es no reconstruir la vista de Futuros cuando no está a la vista.

Un microtask, no `requestAnimationFrame`: se resuelve antes de que el navegador
pinte —nada se ve a medio actualizar— y no se congela en una pestaña de fondo,
que dejaría los números viejos al volver.

De paso desapareció el último `try{}catch{}` mudo: el de los destinos de la
calculadora. Si falla, ahora se dice cuál falló.

### El rediseño, y lo que la medición dijo de él

Un rediseño se justifica con defectos, no con gustos. Los que había, medidos:

- **8 radios distintos** (1, 2, 3, 4, 5, 6, 7, 999) y **17 espaciados**
  (5, 6, 7, 9, 10, 11, 13, 14, 18…). No es un sistema, es una acumulación.
- **19 tamaños de tipo** en la misma pantalla.
- La tarjeta de cuenta tenía **siete zonas apiladas** con cuatro rejillas
  distintas, y dentro de ellas el texto se recortaba a media palabra:
  `GANANCI/A`, `PÉRDIDAS SEGU`, y una columna de una palabra por línea que se
  salía por el borde derecho. Eso no es densidad, es un defecto.
- **Lo más grande de la tarjeta era `3950.00%`** —la consistencia sobre una
  ganancia diminuta, un número sin significado— mientras `RESTRINGIDA`, que es
  lo único que decide si puedes operar, iba en gris pequeño a media tarjeta.
- Las reglas duras eran seis tarjetas iguales en 820px, y dentro de cada una el
  LÍMITE era lo más grande y el ESTADO ACTUAL lo más pequeño. Jerarquía al
  revés: el límite no cambia nunca; lo que cambia es dónde estás tú.

Lo que se hizo, y lo que costó:

```
                             antes    después
  radios en px sueltos           8          0   (4 tokens)
  espaciados fuera de escala   126          9   (los 9 son márgenes ópticos)
  tamaños de tipo               19         10
  alto de la página          3.457px    3.524px  (mismo contenido, mejor orden)
  alto en un teléfono       10.063px    8.384px  (−17%)
  desborde horizontal móvil   sí          0px
```

**La tarjeta de cuenta** pasó a responder las preguntas en el orden en que se
hacen: ¿puedo operar? (el veredicto, arriba y a lo ancho, con su motivo) ·
¿cuánto tengo? · ¿cómo voy hoy? · ¿cuánto riesgo queda? (cuatro métricas con la
misma anatomía) · ¿y el detalle? (sólo si lo pides). Desaparecieron la rejilla
de seis KPIs, las tres tarjetas-módulo y la fila de chips que repetía lo que ya
dice el centro de reglas. Treinta números que nadie puede leer no son más
información: son menos.

**Container queries, no media queries**, en la tarjeta. En una pantalla de
1600px caben dos cuentas lado a lado: cada una mide 420px y una media query de
viewport creería que hay sitio de sobra para cuatro columnas. La tarjeta se mide
a sí misma, y las cifras usan `clamp(…, cqi, …)` para caber sin truncarse.

**El teclado.** ⌘K abre una paleta que lista acciones, pestañas y cuentas, y
seis letras sueltas navegan. La regla que hace que esto no sea un desastre:
**una letra nunca actúa si estás escribiendo**. Sin esa guarda, teclear
«Nota: probé…» en el diario abriría el editor de operaciones en la N.
`test/cmd.mjs` lo comprueba explícitamente, además de que ⌘K sí funcione con
el foco dentro de un campo.

Todo lo que hace la paleta entra por las mismas puertas que un clic —`showTab`,
`setFtView`, `openTrade`, `FUT.setSelectedAccount`—. Si algo sólo se pudiera
hacer con ⌘K sería una función escondida, no un atajo.

**Lo que no se tocó**: la capa de datos. Cabina y Futuros siguen leyendo de
`coll("trades")`, `acctAgg` y el mismo motor de reglas; `sync.mjs` y `vivo.mjs`
pasan sin cambios. Seis pruebas sí hubo que actualizar —apuntaban a selectores
que el rediseño movió— y una de ellas descubrió un error mío: había bajado la
consistencia a un decimal, y `53.97%` no es `54.0%` cuando el límite es 50.

`test/diseno.mjs` mide todo esto sobre la página viva: recorre los 804 nodos
visibles y lista los espaciados fuera de escala, los tamaños de tipo, los radios
y cualquier elemento cuyo contenido no quepa. Es la prueba que convierte
«parece consistente» en un número.

### El contrato de la firma, por cuenta

Hasta aquí había **una** pérdida máxima diaria para todas las cuentas:
`ruleByRole(role)` no recibía cuenta. Una cuenta con tope de $200 y otra
con tope de $1.100 leían el mismo número, así que una de las dos mentía — y la
que miente en la dirección peligrosa te quema la cuenta.

Ahora hay **dos niveles**, porque son dos cosas distintas con consecuencias
distintas:

```
  CONTRATO DE LA FIRMA   account.rules{}    romperlo QUEMA la cuenta
  PROTOCOLO DEL TRADER   settings.rules[]   romperlo rompe la disciplina
```

El contrato manda. Si la cuenta no tiene ese número escrito, se hereda del
protocolo **y se dice** que se ha heredado («$0 de $200 · del protocolo»): un
límite heredado que creías propio es justo el error que esto viene a quitar. Si
no existe en ninguno de los dos, la regla sale **SIN CONFIGURAR** con su propio
color muerto — antes salía como AVISO «sin valor», que se lee igual que
cualquier otro aviso.

Lo que ya vive en la cuenta no se duplica: el objetivo es `a.target`, el
drawdown `a.dd`, la consistencia `a.limit`. `account.rules{}` guarda sólo lo que
faltaba, más la metadata del contrato: fecha de verificación, versión, enlace y
notas. Dos sitios para el mismo número es el bug que se acababa de quitar; no se
reintroduce con otro nombre.

**Una cuenta sin las reglas que la queman ya no se presenta como LISTA.** Sale
en AVISO diciendo exactamente qué falta escribir — «falta el tamaño y el
drawdown máximo» — y sigue siendo operable, porque eso lo decide el trader. Lo
que la cabina no hace es decir que todo va bien cuando no tiene con qué saberlo.
Esto cambió el veredicto de una cuenta nueva de READY a WARNING, y con él una
prueba de `sync.mjs` que lo daba por bueno.

`test/prop.mjs` mete −$600 el mismo día en las dos cuentas: la A queda
BLOQUEADA sobre su tope de $200 y la B sigue operable con $500 restantes de sus
$1.100. Ese contraste es toda la fase en una línea.

**Tres defectos del rediseño anterior salieron a la luz al escribirla**, y los
tres vivían porque ninguna prueba tocaba esa parte del DOM:

- El chevrón del «por qué» de una regla buscaba el párrafo con
  `nextElementSibling`, pero el rediseño lo había metido dentro de la fila:
  devolvía `null` y reventaba al pulsarlo.
- `paintRuleStates` actualizaba `.rnote`, renombrado a `.rnow`. Al no
  encontrarlo, **el estado en vivo de cada regla dejó de refrescarse en
  silencio**: seguía mostrando el número del último repintado completo.
- La cabecera contaba las reglas sin configurar como «activas», es decir,
  afirmaba vigilar algo que nadie había escrito.

### Ciclo de vida prop, y una salud que no miente

**Siete estados, no cuatro.** «Activa» no decía si estabas en evaluación o
fondeado — la diferencia entre arriesgar $150 de inscripción y arriesgar tu
fuente de ingresos — y no había dónde anotar que hay un payout pedido, que es
el momento en que más cuidado hay que tener.

```
  evaluacion · fondeada · payout_pendiente · payout_aprobado
  quemada · pausada · archivada
```

Son un solo eje a propósito: desde el asiento del trader, una cuenta está en
exactamente uno de estos sitios. Un payout pendiente es una cuenta fondeada en
un momento concreto, no una segunda dimensión que llevar.

La migración lee el tipo escrito a mano, que es el único dato que distingue
evaluación de fondeada. **Ante la duda, evaluación**: es lo que se corrige con
un clic, mientras que equivocarse hacia «fondeada» pintaría de verde una cuenta
que aún no lo está.

Y se migra **al leer**, no sólo al normalizar. Una cuenta puede entrar por
`FUT.createAccount`, por un respaldo viejo o por la base del artefacto sin pasar
por `normalize()`. Con un estado desconocido, `EST_VIVA` devolvía `undefined` y
la cuenta quedaba **BLOQUEADA para siempre** sin que nada explicara por qué. Lo
encontró `sync.mjs` en cuanto cambié los estados.

#### La salud es el mínimo, no la media

Una cuenta con el 95% del colchón intacto y el 0% del riesgo del día disponible
no tiene «salud 48%»: tiene el día cerrado. **La media esconde justo el factor
que te mata**, que es el único que hay que mirar. Así que la salud es el mínimo,
y lo que devuelve no es sólo el número — es qué factor manda:

```
  Salud 10%  ▁▁▁▁▁   Lo que manda: riesgo del día · $100 de $1,000
```

«Salud 12%» sin decir por qué no sirve de nada.

Se separan dos cosas que el lenguaje mezcla:

```
  RIESGO     lo que puede QUITARTE la cuenta   → decide la salud
  PROGRESO   lo que intentas CONSEGUIR         → se informa, no la baja
```

Una cuenta recién abierta tiene 0% de progreso hacia el objetivo y está
perfectamente sana. Meter el progreso en el mínimo diría lo contrario.

Y la regla que costó dos intentos: **cualquier factor que no se pueda medir deja
la salud sin número**. La primera versión ignoraba los ciegos y una cuenta sin
tamaño salía al 100% con el colchón sin medir — exactamente lo que no puede
pasar. El mínimo de un conjunto que contiene un desconocido es desconocido. Es
la misma disciplina que ya impide imprimir ∞.

La tarjeta muestra además **cuándo se leyeron por última vez las reglas de esa
firma**, con enlace al contrato. Las props las cambian sin avisar, y un contrato
que llevas cuatro meses sin mirar es un contrato que puede que ya no sea el
tuyo. Sin fecha no se inventa una: dice «sin verificar».

### El guardián de la arquitectura

`test/capa2.mjs` no abre el navegador: lee el archivo en 40 ms y comprueba las
afirmaciones que este README hace. Una afirmación que nadie comprueba deja de
ser cierta en cuanto alguien tiene prisa.

Vigila una definición por cálculo; que nadie llame a los `*Crudo` saltándose la
memoria; que las 26 funciones de `FUT` sigan ahí; que cada memoria dependa de
`coll("trades").rev` y que la huella de la cuenta cubra **todo** campo que
`acctAgg` lee de ella; y que ningún número tenga dos implementaciones.

La primera versión marcaba tres falsos positivos, y los tres enseñan lo mismo:
`MULT` existe pero **se deriva** de `QE.CONTRACTS`; `riskThreshold` existe pero
**delega** en `QE.sueloPara`; y el tercer «duplicado» era un comentario que dice
*«nunca calcules el P&L así»*. Buscaba nombres, no implementaciones. Un guardián
que falla siempre acaba ignorado, que es peor que no tenerlo. Ahora comprueba
que cada envoltorio **siga delegando**.

Y se probó rompiéndolo a propósito — un guardián que no puede fallar es teatro:

```
  quito trailBase y ledger de la huella          → ❌ fuera de la huella: ledger, trailBase
  llamo a acctAggCrudo saltándome la memoria     → ❌ 2 llamadas
  riskThreshold deja de delegar                  → ❌ ya no llama a QE.sueloPara
  desaparece calculateSQN de FUT                 → ❌ faltan: calculateSQN
```

### El motor anterior

`engine/MathEngine.js` (v1, 92 pruebas) queda en el repo como referencia
histórica. **No lo usa nadie**: `index.html` ya no lo carga. Su aportación fue
sacar el cálculo de una operación del render; lo que le faltaba era todo lo
demás — la curva, el drawdown como estado, y cualquier noción de cuánta de una
cifra es señal.

## Lo que rindió una inversión, pieza a pieza

Una posición de SCHD que subió un 2% de precio y pagó $400 en dividendos
rindió un **6%**, no un 2%. Cabina enseñaba el 2%.

El motivo era un filtro de una línea: `posLotes` recorría las operaciones de
un activo quedándose con `compra | aporte | venta`. Los dividendos quedaban
fuera. Escribí aquí que «al menos sumaban en el IRR de la cartera». **No era
cierto**, y lo cuento porque el error es instructivo: lo di por hecho en vez de
medirlo. Los dividendos tampoco llegaban al IRR — ver más abajo. El dato
faltante no deja hueco: la fila enseñaba un número entero, creíble y falso.

Ahora el rendimiento de una inversión son **cinco piezas que suman exactamente**:

```
  no realizado   lo que subió y sigue dentro
+ realizado      lo que se cerró vendiendo
+ dividendos     lo que pagó por tenerla
− comisiones     lo que se llevó la fricción
─────────────
= neto
```

Dos decisiones que parecen de detalle y no lo son:

- **Las comisiones se restan aparte, nunca dentro del coste base.** Metidas en
  el coste desaparecen de la vista, y la fricción sólo se corrige cuando se
  mide. Es además lo que hace que las cinco líneas cuadren al céntimo.
- **El porcentaje se mide sobre lo invertido, no sobre el coste que queda.**
  Si vendiste la mitad, el coste restante es la mitad y el mismo beneficio
  saldría al doble. Vender no mejora el rendimiento de lo que compraste.

Una posición vendida del todo no es «sin datos»: es una inversión terminada.
Cantidad cero, y su realizado y sus dividendos siguen contando.

### El mismo número no puede decir dos cosas

Arreglar el cálculo destapó lo que de verdad costaba dinero: **la misma
posición aparecía con dos cifras distintas en una sola pantalla**. Lo vio una
captura, no un test.

| Dónde | Decía | Por qué |
|---|---|---|
| Tabla de posiciones | SCHD **+6.0%** | ya usaba las cinco piezas |
| Gráfico «Rendimiento por posición» | SCHD **2.0%** | medía sólo la subida del precio |
| Tarjeta «Realizado · ventas y cobros» | **$400** | sumaba `pnl`, un campo escrito a mano |
| Cabecera del listado de operaciones | **$400** | lo mismo, sobre las filas visibles |

La tarjeta es el caso más instructivo. Nadie escribe a mano la ganancia de una
venta: se deduce del coste medio. Así que el campo `pnl` sólo lo rellenan los
cobros, y una tarjeta rotulada «ventas y cobros cerrados» enseñaba únicamente
los cobros. Con una venta de VOO de **+$108.57** dentro, la cartera decía $400
donde había $508.57.

El arreglo no es cuatro arreglos: es **una sola fuente**. El gráfico y la
tarjeta pasan por `posPerf`, los mismos lotes que la fila. La cartera marca las
operaciones que una posición derivada ya contó, y sólo las huérfanas caen al
campo escrito a mano — así nada se cuenta dos veces.

El listado de operaciones es la excepción honesta: suma **filas**, no
posiciones, y puede estar filtrado por estrategia, así que no puede derivar
ventas sin mentir sobre el filtro. Se le cambió el rótulo a lo que de verdad
suma («anotado») y avisa de cuántas ventas no lo están, señalando al sitio
donde el realizado sí está completo.

`test/inv2.mjs` cierra las dos puertas: las cinco piezas cuadran al céntimo, y
**la cartera y la posición no pueden discrepar** — el realizado de la cartera
tiene que ser la suma del realizado de cada posición, y el porcentaje del
gráfico el mismo que el de la tabla. Si vuelven a separarse, falla ahí y no en
una captura de pantalla.

## El titular de la pestaña se calculaba sin los dividendos

El número más grande de Inversiones es el IRR de la cartera. Se calculaba con
los flujos que la app le pasa al motor, y el importe de cada flujo salía de
una línea:

```js
monto: (Number(t.qty) || 0) * (Number(t.price) || 0) + (Number(t.fees) || 0)
```

**Un dividendo no tiene cantidad ni precio.** Su importe vive en `pnl`. Así que
`monto` daba cero, el `.filter(f => f.monto)` de la línea siguiente lo tiraba, y
el dividendo no llegaba al motor. El motor los trata bien — `dividendo` está en
su tabla de signos desde el primer día. Nunca le llegaron.

Con $400 cobrados sobre una cartera de $12.850, la diferencia:

| | antes | después |
|---|---|---|
| Recuperado | $1.090 | **$1.490** |
| Ganancia | $504 | **$904** |
| **IRR anual** | **+2,34%** | **+4,26%** |

Casi dos puntos de rentabilidad anual, desaparecidos por un `qty` que no
existe. De paso: las comisiones iban **sumadas en los dos sentidos**. En una
compra encarecen, correcto; en una venta reducen lo que recuperas, no lo
aumentan.

### Y un retorno simple, no dos

La misma tarjeta enseñaba `simple sobre coste +7,3%` junto a `difieren 1,4 pts`.
Los dos números eran reales y no se referían al mismo cálculo: el 7,3% era el
retorno simple de la app (sobre el coste de lo que sigue abierto), y la brecha
la medía el motor contra **su** retorno simple (sobre todo lo aportado, 3,75%).
La distancia de verdad entre lo que se veía y el IRR era de 4,9 puntos.

Manda el del motor, que mide sobre lo que de verdad pusiste — el de la app
queda sólo para cuando no hay flujos que analizar. Y la nota dice hacia dónde y
por qué, porque las dos cifras no se separan siempre por el mismo motivo:

- **IRR por encima** → aportes repartidos: el simple divide entre todo el dinero
  metido, incluido el de la semana pasada, que no tuvo tiempo de trabajar.
- **IRR por debajo** → el simple es *total*, no anual: un 6,7% en año y medio es
  un 4,3% al año, y ninguno de los dos está mal.

Sin esa frase, quien ve 4,26% al lado de 6,73% piensa que uno está roto.

### El guardián no miraba aquí

Tres defectos seguidos de la misma familia —un número con dos
implementaciones— y los tres los encontró una **captura de pantalla**, no la
suite. `capa2.mjs` vigilaba eso desde hacía sesiones… sólo para futuros.

Ahora tiene una sección 6 que exige que cada vista del rendimiento pase por la
misma puerta: `tablaPosiciones` y `renderIvPerf` tienen que llamar a `posPerf`,
`investStats` no puede volver a calcular su propio retorno simple, los
dividendos tienen que entrar en los flujos con su `pnl`, la comisión de una
venta tiene que restar, y la cartera tiene que marcar lo que una posición
derivada ya contó. Comprobado además que el guardián **falla** cuando se
reintroduce el defecto: uno que no puede ponerse rojo no vigila nada.

## Tesis: una por jugada, y las cifras que no se escriben

La plantilla de la que sale esta sección empieza así: *«Crea una copia por cada
jugada»*. Eso choca de frente con lo que el Playbook ya guardaba.

Una entrada del Playbook es una **estrategia**: reutilizable, sin ticker y sin
precio de entrada («Setup C · PDL Sweep Long»). Sus estadísticas salen de todas
las operaciones que la usaron. Una **tesis** es una jugada concreta: este
activo, este precio, esta ventana, este post-mortem. Meter las dos en la misma
ficha rompe las dos — cada estrategia pasaría a tener un solo trade, y el
journal perdería el enlace `setupId` del que salen su WR, su R medio y su PF.

Así que la tesis vive aparte, en su propia colección, y **apunta** a una
estrategia. En el Playbook aparece detrás de un separador, no como una novena
clase de activo, porque no lo es.

### Cinco cifras que la plantilla pedía a mano

La plantilla pide escribir «Capital total», «Riesgo $», «Tamaño recomendado»,
«R:R ≥ 2:1» y «R (+2.3R)». Cabina sabe calcular las cinco. Un número escrito a
mano al lado de uno calculado es exactamente la avería que esta misma sesión
arregló tres veces en Inversiones: dos fuentes para una cifra, y la escrita no
se actualiza nunca.

Aquí se **escribe el precio** y se **deriva el resto**, en vivo, mientras
escribes — un R:R que aparece después de guardar llega tarde, porque la decisión
ya se tomó:

| Se escribe | Se deriva |
|---|---|
| entrada, stop, TP1/2/3 | R:R de cada objetivo, distancia al stop en % |
| capital, riesgo por operación (%) | riesgo en dólares, tamaño de la posición |
| operación enlazada del journal | R real y P&L del post-mortem |

Tres detalles que decidían si el número era correcto o sólo plausible:

- **Un stop del lado equivocado no es «poco riesgo».** Con un largo cuyo stop
  está por encima de la entrada, la resta da negativo y todo lo demás saldría al
  revés. La ficha lo dice y **esconde** las cifras derivadas en vez de mentir con
  ellas.
- **En un futuro el riesgo por unidad son puntos, no dólares.** Sin multiplicar
  por el contrato —el multiplicador sale de `QE.CONTRACTS`, no de una tabla
  nueva— el tamaño sale multiplicado por el valor del punto: 10 contratos de MNQ
  donde caben 5.
- **La R del post-mortem sale de la operación enlazada.** Sin operación, no hay
  R: no se inventa una.

Y el R:R por debajo de 2:1 se marca en rojo, porque lo prohíbe la lista de
entrada de la propia plantilla y su lista de errores comunes dice, textualmente,
«no medir R/R antes de entrar».

### Once secciones, de una en una

La plantilla dice *«completa secciones en orden»* y *«si algo no puedes
escribirlo en 2–3 líneas claras, probablemente la idea no está lista»*. Un
formulario de ochenta campos en una sola ventana contradice las dos cosas: no se
termina nunca y no obliga a nada.

Cada sección se edita por separado, la ficha enseña doce puntos —uno por
sección, verde cuando está lista— y el pie nombra **la siguiente**, no todas.
La sección 10 es el diario de seguimiento, con su nota emocional de 0 a 10, que
no es decoración: sirve para ver si las decisiones malas caen siempre en los
días tensos.

### El puente: plan → operación → post-mortem

Faltaba el último tramo. Sin él hay que teclear entrada, stop y tamaño otra vez
en el journal — y **lo que se teclea dos veces acaba diciendo dos cosas**: el
plan con un stop y la operación con otro, sin forma de saber cuál se ejecutó.

«Abrir operación» lleva el plan entero al editor del journal (instrumento,
dirección del sesgo, entrada, stop, TP1 como objetivo y el tamaño **calculado**)
y enlaza la operación resultante a la tesis. De ahí sale la R del post-mortem.
El círculo se cierra sin que ninguna cifra se escriba dos veces:

```
plan 3.00R  →  operación (5 contratos MNQ)  →  real +2.40R
   derivado         precargado, no tecleado       de tradeCalc
```

Dos decisiones dentro del puente:

- **El tamaño de un futuro se trunca, nunca se redondea hacia arriba.** Medio
  contrato no existe, y un `Math.round` pondría más riesgo del que autorizaste.
- **Vender no cierra la tesis.** El post-mortem es un paso deliberado de la
  plantilla, no un efecto secundario de salir. Pero si nadie avisa, la lección
  no se escribe nunca — así que la ficha lo pide, y el aviso desaparece al
  escribirla.

En la baldosa, lo planeado y lo conseguido van **juntos** («3.00R planeado ·
+2.40R real», en rojo si te quedaste corto). En baldosas separadas hay que
buscarlos; juntos se leen de un vistazo, que es lo único que hace que la próxima
vez se planee distinto.

### Nueve activos, nueve aritméticas

No todos los activos se operan igual, y la diferencia **no es cosmética: es la
fórmula del riesgo**. Hasta esta versión, los nueve tipos usaban la de la
acción.

| Tipo | Lo que cuesta una unidad si sale mal | Unidades |
|---|---|---|
| Acción / ETF | entrada − stop | enteras |
| Futuro / materia prima | **ticks** × valor del tick | enteras |
| Opción comprada | **la prima entera** × acciones por contrato | enteras |
| Opción vendida cubierta | ancho del spread − crédito | enteras |
| FX | **pips** × valor del pip por lote | 0,01 lotes |
| Bono | puntos sobre el **nominal** (1 pto de $1.000 = $10) | enteras |
| Cripto / perpetuo | entrada − stop | **fraccionadas** |

Cuatro consecuencias que cambian el número en pantalla:

- **Un futuro no se dimensiona en puntos, se dimensiona en ticks**, y el motor
  ya sabía hacerlo. `QE.dimensionar` trabaja en la rejilla del contrato, en
  céntimos enteros, trunca contratos, avisa si el stop no da ni para uno y dice
  cuánto riesgo queda **sin usar** por no poder partir un contrato. Yo había
  escrito `riesgo / (puntos × multiplicador)` — una segunda implementación del
  mismo número, y encima ciega al tick. Ahora delega, y de paso resuelve los
  códigos de mes: `MNQZ5` es `MNQ`.
- **Una opción comprada arriesga la prima, no (entrada − stop).** Es un techo,
  no una estimación, y no necesita stop para conocerse. Su R:R tampoco sale de
  precios del subyacente: pagas 3,50 y sales en 7,00, eso es 1R. Por eso su
  plan pide prima y prima objetivo, y **no** pide stop ni TP.
- **Una opción vendida sin pata compradora no tiene pérdida máxima**, así que no
  recibe un tamaño. La ficha lo dice y pide el ancho del spread, en vez de
  calcular un número que sería mentira.
- **Cripto y FX se fraccionan; acciones y contratos no.** 0,083333 BTC es un
  tamaño real; medio contrato no existe. Cada tipo declara sus decimales, así
  que `0.08333333333333333` —ruido de coma flotante— no llega a pantalla.

Bajo el riesgo, la ficha dice siempre **de dónde sale el número**: «100 ticks ×
$0.50 el tick», «20 pips × $10.00 el pip», «la prima entera: $3.50 × 100»,
«puntos sobre $1.000 de nominal». Sin esa línea el número es un oráculo.

Y cada tipo trae **sus** parámetros, sólo los suyos: una opción pide strike,
vencimiento, DTE, delta e IV; FX pide swap y tamaño del lote; un perpetuo pide
funding y precio de liquidación (*si está más cerca que tu stop, el stop no
existe*); una acción pide la fecha de resultados (*un hueco por earnings salta
por encima del stop*); un bono pide duración, cupón y rating; un futuro pide mes
de contrato y rollover. Poner los campos de los nueve a la vez sería un
formulario que nadie mira.

### Un `var(--x)` que no existe no falla: se queda transparente

Escribí `--positive-soft`, `--negative-soft` y `--warning-soft`. Los tokens se
llaman `--good-soft`, `--bad-soft` y `--warn-soft`. También escribí `--mono`
cinco veces, cuando es `--font-mono`.

CSS no avisa de esto. `background: var(--warning-soft)` con el token sin definir
simplemente **no pinta nada**: once declaraciones de esta función llevaban sin
efecto, y sólo se vio porque el aviso del post-mortem salía sin recuadro en una
captura. Es el peor tipo de fallo que hay en este repositorio —el que no deja
hueco— y llevaba toda la sesión pudiendo pasar en cualquier regla.

`capa2.mjs` tiene ahora una sección 8 que lee el `<style>` entero, cruza cada
`var(--x)` contra los tokens definidos en `:root` y falla si alguno no existe.
Descuenta los que llevan respaldo (`var(--x, algo)`), los que pone el JS con
`setProperty` y los del navegador. Encontró `--mono` a la primera.

`TES` es su puerta única, igual que `FUT` para futuros e `INV` para inversiones.
`test/tesis.mjs` comprueba las 29 afirmaciones de arriba, incluida la que casi
se me escapa: el bundle de respaldo ya se llevaba las tesis (`buildBundle`
recorre `COLLS`), pero el panel las contaba con una lista aparte que no las
incluía. El resumen decía «1 operación» y no mencionaba la investigación, que es
lo más caro de rehacer.

## Siete tests en verde sobre una app que ya no existía

Buscando por qué la suite tardaba 8,8 minutos apareció algo que no tenía nada
que ver con la velocidad.

Siete archivos —`audit2`, `audit3`, `audit4`, `audit5`, `killzone`, `redcheck`,
`sesnow`— no cargaban `test/preview.html`, el que se reconstruye antes de cada
corrida. Cargaban una **ruta absoluta** a una copia suelta:

```js
const URL = 'file:///tmp/claude-0/…/scratchpad/preview.html';
```

Ese archivo existía. Por eso pasaban. Lo que no pasaba es que se regenerara:
llevaba **seis días** congelado. 633 KB contra los 774 KB del build actual —
141 KB, el 18% de la app, que no estaban ahí. Cero ocurrencias de `posPerf`,
`window.INV`, `tesisCalc`, `window.TES`, `QE.dimensionar`, el arreglo del IRR.
Es decir: todo lo construido en los últimos cuatro turnos.

**Y yo anuncié «suite 42/42» cuatro veces con esos siete midiendo código
muerto.** Uno de ellos llevaba seis días imprimiendo `cuenta en Cabina del
journal: undefined` sin que nadie lo mirara, porque imprime en vez de afirmar.

Apuntados al build real, los siete pasan igual: no ocultaban ninguna regresión.
Eso fue suerte, no diseño. La lección no es que no hubiera daño, es que **un
test verde sobre el archivo equivocado es peor que un test rojo** — el rojo se
arregla.

`capa2.mjs` gana una sección 9 con dos comprobaciones: ningún test puede llevar
una ruta `file:///` fija (todos derivan de `process.cwd()`, como los otros 36),
y `preview.html` tiene que contener los símbolos que hay en `index.html` — si
falta alguno, es que nadie corrió `build-preview.mjs`. Verificado que se pone
roja por los dos motivos.

## El test dormía el 88% de su tiempo

`vivo.mjs` era el más lento de los 44: 45,5 s. Compara 547 números en vivo
contra los mismos tras recargar, recorriendo 6 pestañas y 20 sub-vistas. Tras
cada clic esperaba `waitForTimeout(500)` o `(520)`.

Perfilado de una pasada de su `foto()`:

| | |
|---|---|
| espera fija | **11.840 ms** |
| trabajo real (leer el DOM) | **40 ms** |

Ratio **296:1**, y `foto()` se llama tres veces. Con el arranque y las dos
operaciones de prueba: **40 de 45 segundos dormido, el 88%**.

La espera estaba mal calibrada por construcción. Medí con un `MutationObserver`
cuánto tarda de verdad el DOM en quedarse quieto tras cada clic: las 23 esperas
dieron **el suelo del observador y nunca más** — el DOM ya estaba quieto antes
de empezar a mirarlo. Cabina pinta con un coalescer de microtasks (`fanout` →
`Promise.resolve().then()`), así que termina antes de que Playwright complete el
viaje de vuelta. Los 500 ms no esperaban a nada.

Esperar a la condición en vez de al reloj: **45,5 s → 10,8 s**. Un número fijo
falla en los dos sentidos —de más cuesta minutos, de menos produce un test
intermitente— y la condición no tiene ese dilema.

Comprobado antes de darlo por bueno:

- el test actual es determinista (547 claves idénticas en 3 corridas);
- la versión rápida da **las mismas 547 claves y los mismos valores en las 10
  corridas** de verificación;
- y sigue **pudiendo fallar**: saboteando la app (quitando `Z.cuentas` del
  fanout, para que el balance no se repinte tras una operación) las dos
  versiones cazan lo mismo — 624 claves, 97 que faltan, 77 que sobran, 2
  rancios, misma ruta del DOM. Un test rápido que ya no caza nada no vale nada.

### Treinta segundos esperando algo que no estaba, con un `.catch()` encima

Perfilado el siguiente de la lista, `audit5` (43,8 s), el tiempo no estaba en
las esperas: sus 19 `waitForTimeout` suman 8,7 s. Estaba en **una línea**.

```js
await page.locator('#histWrap tbody tr').first().locator('td').nth(3)
          .textContent().catch(() => 'sin filas')
```

`#histWrap` existe, pero en ese punto tiene **cero filas**. Así que
`.nth(3).textContent()` agotaba el timeout por defecto de Playwright —30 s
clavados, medidos— y el `.catch()` convertía el plantón en un texto amable.

Y lo lento era lo de menos. «sin filas» significaba a la vez **«el historial
está vacío, que es lo normal aquí»** y **«la tabla no se pintó, que sería un
fallo»**. Dos estados distintos con la misma cara — exactamente lo que este
repositorio persigue dentro de la app, escondido en su propia suite.

`count()` responde al instante y los separa: **43,8 s → 13,1 s**, y ahora el
texto dice cuál de los dos estados es.

Para saber si el patrón estaba en más sitios se escribió un chivato genérico —
un `Proxy` sobre el `page` que avisa de cualquier llamada de más de 4 s, y que
sigue las cadenas de `locator`. Validado primero sobre el caso conocido (cazó la
línea de `audit5` a los 30.002 ms) y luego pasado por `sesiones`, `sync`, `bk` y
`vivo2`: **ninguna llamada larga**. Su tiempo es suma de esperas fijas, que es
el otro problema y se arregla de otra manera.

### La lista de peligros estaba incompleta, y me mordió

`sesiones.mjs` (33,7 s) abre **ocho contextos** de navegador, cada uno con su
`goto` y su `waitForTimeout(900)`. El conteo estático decía 11.750 ms de espera
porque cuenta literales: los 900 de `open()` se ejecutan ocho veces, así que el
gasto real rondaba los 21 s.

Convertido a quiescencia, el test **se rompió**: perdía las pre-sesiones
guardadas y `localStorage` devolvía `null`. La causa:

```js
function persistDay() { … debounce("day", async () => { … lsPatch(…) … }, 400); }
```

El día se escribe a disco **400 ms después** del último cambio. Un
`waitForTimeout(900)` lo cubría de sobra; una quiescencia de 40 ms recarga la
página antes de que se escriba, y el test pierde lo guardado **sin un solo
error**.

Lo importante no es el fallo: es que **mi propia lista de sitios donde la
quiescencia no sirve no lo avisaba**. La escribí buscando diferidos con
`setTimeout(…, N)` literales, y este pasa el 400 como argumento de `debounce`.
La lista estaba incompleta y yo la había dado por buena.

La quiescencia mira el DOM. Esto no es DOM. De ahí un tercer ayudante:

```js
await enDisco(p, d => d.days && Object.values(d.days).some(x => x.result === 150));
await p.reload();
```

`enDisco` espera a que el disco tenga lo que se busca, no a que algo se pinte.
Con él, `sesiones` pasa de **33,7 s a 17,5 s** y sale **idéntico a la base en
las 10 corridas** de verificación.

El barrido dice que hoy ningún otro test está por debajo del debounce — todos
esperan ≥500 ms. Pero el margen son **100 ms sobre 400**, y bajo carga eso se
voltea de forma intermitente. `capa2.mjs` gana una sección 10 que falla si
alguien recarga o lee disco con menos de 600 ms detrás. Verificado que se pone
roja.

> Sobre los totales: el tiempo de la suite completa tiene ruido de varios
> segundos entre corridas (44 arranques de Chromium en serie). Los números por
> archivo, medidos diez veces cada uno, son los que valen.

### Un test que decía cosas distintas según la hora

De paso: `audit5` no congelaba el reloj. La misma corrida decía «Asia · 1:10 AM»
de madrugada y «Londres · 2:02 AM» una hora después, porque leía la sesión real.
No llegaba a fallar —imprime en vez de afirmar— pero medía la sesión que tocara
en vez de una concreta.

De los 43 archivos, 35 congelan el reloj y 8 no; de esos ocho, sólo `audit5` y
`bk` leen salida que depende de la hora. `audit5` ya lo congela en el mismo
instante que el resto de la suite (10:00 AM ET, dentro de la NY AM Kill Zone) y
dos corridas seguidas salen **idénticas byte a byte**. `bk` queda pendiente.

### Dónde NO sirve la quiescencia

`test/espera.mjs` lleva el ayudante y, sobre todo, la lista de sitios donde
**no** vale. La app difiere trabajo con `setTimeout` en cinco caminos: 40 ms al
confirmar una importación, 60 ms al abrir una operación desde una tesis, 100 ms
al crear una versión de estrategia, y dos de 1.200 ms (el `location.reload()`
tras restaurar un respaldo y la migración del arranque).

Si la calma es más corta que el diferido, el observador ve el DOM quieto,
devuelve, y el repintado llega después: test intermitente. De ahí las dos
calmas —30 ms para cambiar de vista, 150 ms para lo que difiere— y que en los
dos de 1.200 ms no se use quiescencia sino espera a la navegación o al selector.
Por eso `vivo.mjs` se convirtió uno a uno y verificado, y no con un `sed`.

## Borrar en masa, y poder arrepentirse

Seleccionar varias cosas y borrarlas de una vez es la función más destructiva
que tiene esta app, y detrás no hay servidor: los datos viven en un navegador.
Borrar cuarenta operaciones por error no se recupera, y además mueve el balance,
el drawdown y la consistencia de la cuenta. De ahí tres decisiones.

**Un solo mecanismo para las cinco listas.** Journal de futuros, operaciones de
inversión, estrategias y tesis del playbook, formas de hacer dinero, y sesiones
del historial. Escribir un selector por pestaña sería tener en tres turnos cinco
borrados que se comportan distinto — el mismo defecto que este repositorio
persigue en los números, trasladado a la interfaz. Hay un registro con lo que
cada lista es, y una sola implementación.

**La confirmación dice qué cambia, no cuántas filas.** «Borrar 12» no es
información:

| lista | lo que dice antes de borrar |
|---|---|
| Journal | `Borrar 2 operaciones: +$40.00 de resultado · afecta a Cuenta A` |
| Inversiones | `$1,920 desplegados · $60 cobrados · VOO` |
| Playbook | `1 operación queda sin estrategia` |
| Sesiones | `+$80.00 en resultados · 2 pre-sesiones escritas` |

**Papelera con deshacer, y persistida.** Un «¿estás seguro?» no es una red de
seguridad: es un badén que se aprende a saltar. Lo borrado se guarda entero y
vuelve con un botón, **incluso después de recargar**, y la barra no desaparece
sola — un aviso que se va a los diez segundos convierte «me equivoqué» en «ya no
hay nada que hacer».

Dos detalles de comportamiento que valen más que el botón:

- **En masa sólo se borra lo que se ve.** El journal vive en la sub-vista
  «Diario»; mientras miras «Resumen» sus filas existen en el DOM pero no en
  pantalla, y un «Todo» habría marcado seis operaciones que no estás viendo. El
  botón se apaga y dice por qué.
- **En modo selección el clic sólo selecciona.** No abre el editor y no dispara
  la × de borrar una sola; los botones de la fila quedan inertes. Mezclar los dos
  gestos es exactamente como se borra lo que no se quería.

El modo selección no cambia el HTML de ninguna fila: sólo les pone una marca.
Por eso ninguna función de render tuvo que tocarse, y una fila que se vuelve a
dibujar recupera su estado desde el conjunto.

### Las cuentas: la única lista que arrastra algo al caer

Borrar una cuenta no borra sus operaciones. Se quedan en el journal apuntando a
un fantasma — la app aguanta bien, salen etiquetadas «sin cuenta asignada» y el
filtro las ofrece — pero **su resultado desaparece de toda estadística de cuenta
y nadie te lo decía**. Cuatro operaciones y $480 fuera de los números, en
silencio.

Ahora se dice, al borrar una y al borrar varias:

```
Borrar 2 cuentas: Cuenta A, Cuenta C · 4 operaciones quedan sin cuenta
(+$480.00 fuera de las estadísticas)
```

Y deshacer devuelve las cuentas **a su sitio**, no al final: el orden de las
cuentas es una decisión del usuario, y devolverlas en otro orden no es deshacer,
es devolver otra cosa.

### Tres formas de borrar la misma cuenta

Buscando dónde enchufar el borrado en masa apareció algo peor que la falta de la
función. «Borrar una cuenta» tenía **tres implementaciones**:

| ruta | qué hacía |
|---|---|
| `FUT.deleteAccount` | splice + limpia el filtro + `meta.acct` + fanout |
| menú de la tarjeta | su propio splice, sin limpiar nada |
| editor de la cuenta | su propio filter, sin limpiar nada |

En la operación más destructiva de la app, dos de las tres rutas esquivaban su
propia puerta única. Medido: por la del menú, `meta.acct` se quedaba **en disco**
apuntando a la cuenta muerta. No llegaba a verse porque el arranque valida ese
campo contra las cuentas que existen, pero era un dato rancio guardado y dos
rutas que no hacían lo mismo.

Las tres pasan ahora por `FUT.deleteAccount`, y `capa2.mjs` tiene una sección 11
que falla si alguien vuelve a sacar una cuenta del array por su cuenta.

Un detalle de esa regla que merece quedar escrito: su primera versión marcaba
**cualquier** `splice` sobre `accounts` y señalaba como defecto el propio
arreglo — deshacer usa `splice(pos, 0, copia)` para devolver una cuenta a su
posición. Se vigilan las **retiradas** (`splice(i, 1)`), no las inserciones. Un
guardián que marca lo correcto se acaba desactivando, que es peor que no tenerlo.

La sección 11 vigila además que las seis listas estén registradas, que sólo se
borre lo que está en pantalla, que la papelera persista, y que se guarde en ella
**antes** de tocar nada — guardar después deja sin vuelta atrás si algo falla a
mitad. Verificado que se pone roja por los dos motivos nuevos.

> Corrección de una nota anterior: la app tiene **dos** debounces de escritura,
> no uno. El día va a 400 ms (`persistDay`) y los ajustes a 500 ms
> (`persistSettings`). Medí el disco antes de ese medio segundo y me creí un
> fantasma que no estaba; con la espera, el de la fachada sale limpio y el del
> menú no. La comprobación de `capa2.mjs` ya cubría los dos por margen, pero su
> mensaje decía sólo el del día.

### Dos trampas de temporización, y una que me costó tres diagnósticos

Construyéndolo aparecieron dos errores propios que merecen quedar escritos.

El primero: el botón de selección se quedaba deshabilitado después de entrar en
«Diario», diciendo que mirases otra sub-vista mientras la estabas mirando. La
causa era usar `Promise.resolve().then()` para repintarlo. Ese escuchador corre
en fase de **captura**, antes que el de la app, así que su microtask se ejecuta
**antes** que el `fanout` que pinta la sub-vista: medía la visibilidad de una
lista que todavía no existía. Un `setTimeout(…, 0)` es una macrotarea y corre
después de todos los microtasks, incluido el repintado.

El segundo tardó tres intentos. `tesis.mjs` empezó a fallar 2 de cada 10
corridas, con las cuentas, las operaciones y las tesis **a cero** tras recargar.
Culpé al sondeo de `waitForFunction` (lo cambié a temporizador: siguió
fallando), luego al modo demo (no era). El volcado de estado al fallar —que hubo
que añadir, porque *un timeout que no dice nada es un mal test*— lo señaló:

```
esperaba >= 2 tesis · disco ANTES de recargar: 2
estado real: {"TES":0,"enDisco":0,"cuentas":0,"semillaEscribio":true}
```

La semilla se había reescrito. El patrón era mío, de dos turnos antes:

```js
addInitScript(`if (!localStorage.getItem(K)) localStorage.setItem(K, …)`)
```

`addInitScript` corre en **cada** navegación, recargas incluidas, y en
`document_start` sobre `file://` la zona de almacenamiento a veces todavía no
está enlazada: `getItem` devuelve `null` aunque el dato esté escrito. Entonces la
semilla vuelve a escribir y borra lo que el test acababa de guardar.

La solución no es adivinar mejor, es no adivinar: `siembra()` escribe desde un
documento **ya cargado**, donde localStorage responde de verdad, y recarga una
vez para que la app lo lea. De 8/10 a **15/15**.

## Cómo fluye un dato

No hay framework: una colección en memoria es la única fuente y todo lo demás
son lectores suscritos a ella.

```
openTrade() ─► coll("trades").set(id, rec) ─► localStorage | base del artefacto
                        │
                        └─ emit() ─► renderFutures()      (journal, tiles, calendario)
                                     renderAccounts()     (balance, drawdown, estado)
                                     syncDayFromTrades()  (P&L del día en Cabina)
                                     renderRules()        (motor de reglas duras)
                                     renderHistory()      (historial y calendario)
                                     invalidatePre()      (vista de pre-sesiones)
```

Un detalle que confunde: **un stop es un plan, no un hecho.** Una operación con
entrada y stop pero sin salida sigue ABIERTA y su P&L es cero, así que el
balance no se mueve — que es lo correcto. Cuando de verdad toca el stop, el
botón `abierta · tocó el stop` de la columna de salida la cierra al precio del
stop y el resto se actualiza solo.

## Dónde se guardan los datos

Depende de dónde se abra la página:

- **Como artefacto de Claude**: base de datos del artefacto (sincroniza entre
  dispositivos) y subida de capturas de pantalla por operación.
- **Servida como archivo estático** (GitHub Pages, Vercel, o abriendo el
  archivo a mano): `localStorage` del navegador. Los datos **no salen del
  equipo**, no se sincronizan entre dispositivos y se pierden si se borran los
  datos del sitio. Las capturas quedan dentro de la propia operación como data
  URI, así que conviene no abusar.

Dicho claro: este repositorio guarda **el sistema, no los datos**. Clonarlo no
trae tu journal.

## Correr las pruebas

```sh
npm install                 # Playwright
npx playwright install chromium
npm run preview             # genera test/preview.html desde index.html
npm test                    # los 44 archivos de test/
npm test vivo capa          # o sólo algunos, por prefijo
```

`npm test` corre cada archivo en su propio proceso —comparten `preview.html`
pero no estado de navegador, y uno que se cuelgue no se lleva a los demás— y
devuelve un código de salida útil para CI. Un test colgado se mata al tope y se
reporta como colgado, no como una tubería que se agota sin decir cuál fue.

`.github/workflows/pruebas.yml` hace lo mismo en cada push y cada pull request.
Sin eso, 44 archivos de prueba sólo se ejecutan cuando alguien se acuerda — y un
test que nadie corre no es un test, es un archivo.

> Durante buena parte de su vida esta suite **no se podía correr fuera del
> contenedor donde se escribió**: 44 de 48 archivos importaban Playwright por
> una ruta absoluta (`/opt/node22/lib/node_modules/playwright/index.mjs`). El
> repositorio es público y nadie que lo clonara podía ejecutar una sola prueba.
> Ahora el import es el nombre del paquete, lo resuelve npm, y `capa2.mjs` falla
> si alguien vuelve a escribir una ruta absoluta.

## Abrirla en local

```sh
python3 -m http.server 8000
# luego: http://localhost:8000/
```

Vale con abrir `index.html` directamente en el navegador; el `http.server` solo
evita rarezas con `file://`.

## Publicarla

El repositorio ya trae `.nojekyll`, así que sirve tal cual desde **GitHub
Pages** (Settings → Pages → Deploy from a branch → `main` / `root`) o desde
**Vercel** (importar el repo, sin framework, sin build).

La página lleva `<meta name="robots" content="noindex, nofollow">`. Si algún día
quieres que la indexen los buscadores, quita esa línea del `<head>`.

> El repositorio es público: cualquiera puede leer el código y los valores por
> defecto de las reglas y las cuentas de ejemplo. Tus operaciones no están aquí
> — viven en tu navegador.

## Licencia: ninguna, a propósito

Este repositorio **no lleva licencia**, y es una decisión, no un olvido.

Sin licencia rige el derecho de autor por defecto: el código es público para
leerlo y **nadie tiene permiso para usarlo, copiarlo ni derivarlo**. Eso es
exactamente lo que se quiere hoy — Cabina es el cockpit de una persona, no una
herramienta que se ofrezca a terceros, y conceder derechos «porque un proyecto
público debería tener licencia» sería regalar algo sin necesitarlo.

Si algún día se abre a otros, se elige la licencia **entonces**, con la decisión
delante. Añadirla ahora no adelanta nada y no se puede deshacer con limpieza:
quien haya usado el código bajo esa licencia conserva el permiso.
