# Importar operaciones desde el bróker

Estado al 27/10/2026: **fases 0.5, 1 y 5 hechas; fase 2 implementada para CSV manual de ejecuciones; fase 3 parcial; fase 4 pendiente**. La fase 0 —un CSV real anonimizado— sigue sin hacerse: bloquea la detección automática (fase 4) y la comprobación de que los importes cuadren con el bróker al céntimo, no el desarrollo del mapeador.
La fase 2 reconstruye operaciones por FIFO y conserva el detalle de cada ejecución en `executionLedger`. La deduplicación por ID del bróker o huella determinista evita volver a importar ejecuciones reconocidas. La reconciliación incremental cierra o reduce una posición abierta importada cuando el ledger permite reconstruir su entrada; si la posición antigua no tiene evidencia suficiente, el rango se bloquea en vez de inventar una apertura. Sigue pendiente la detección automática de bróker y validar los importes contra un CSV real anonimizado.

El `README.md` ya nombraba el hueco: no hay esquema canónico de operación
importada, ni mapeos por bróker, ni el camino de importación, ni huella de
deduplicación. Esto es ese hueco, desarmado en piezas que se pueden hacer una
por una.

---

## Por qué es la pieza que decide el producto

Cabina obliga hoy a escribir cada operación a mano. Para el autor, con pocas
operaciones al día, es sostenible. Para cualquier otro no lo es, y es la razón
por la que un diario se abandona en la segunda semana: el coste de registrar
supera al de mirar.

Todos los competidores lo resuelven con sincronización automática. Cabina no
puede: es local-first y no habla con el bróker. Lo que sí puede es tragar el CSV
que el bróker ya te deja descargar, que es el 90 % del valor con el 10 % del
aparato y sin pedirle a nadie sus credenciales.

---

## LO QUE DE VERDAD HAY DENTRO DEL CSV: EJECUCIONES, NO OPERACIONES

Es la trampa de todo el asunto y conviene decirla antes que nada.

Una operación de Cabina (`trades/<id>`, ver [`DATA_MODEL.md`](DATA_MODEL.md)) es
una **ida y vuelta**: tiene `entry`, `exit`, `direction`, `qty`. Un export de
bróker —en Tradovate, el informe de **Orders**— es una lista de **órdenes o
ejecuciones**: una fila por compra y otra por venta, cada una con su hora, su
precio y su cantidad.

Entre las dos cosas hay un algoritmo, no un mapeo de columnas:

- Cuatro contratos comprados en una orden y cerrados en tres órdenes distintas
  son **una** operación, no cuatro filas.
- Dos entradas y una salida en el mismo instrumento y la misma cuenta se
  emparejan en FIFO, no por cercanía en el tiempo.
- Dar la vuelta a una posición (vender 2 estando largo de 1) cierra una
  operación y abre otra en sentido contrario, en la misma fila.

Quien trate el CSV como «una fila, una operación» produce un diario con el doble
de operaciones y la mitad del P&L. Es el fallo clásico y hay que diseñarlo para
no cometerlo: **el emparejado es la fase 2 y es la más difícil.**

---

## El esquema canónico ya existe

No hay que inventar ninguno. La operación importada es una operación normal:

```
date, time, accountId, instrument, direction, qty, entry, stop, target,
exit, exitTime, exitWhy, fees, mae, mfe, setupId, plan, invalida,
quality, tags, notes, images[], source
```

Con las invariantes de siempre: `qty` y `fees` son magnitudes sin signo, la
dirección la dice `direction`, y el P&L no se guarda —lo deriva el motor—, salvo
que el bróker reporte uno, que entonces gana por ser un hecho.

`source` pasa a admitir `import:<plataforma>` junto a `quick_add` y `manual`.

### LO QUE NINGÚN CSV TRAE, Y ES LO QUE HACE ÚTIL A CABINA

Un export de bróker da `date`, `time`, `instrument`, `direction`, `qty`,
`entry`, `exit`, `fees`. Punto.

No trae `stop`. No trae `target`. No trae `setupId`. No trae `plan`. No trae
`quality`. No trae `exitWhy`.

Es decir: **no trae ni uno solo de los campos de los que sale la R, la
expectativa, el reward-to-risk ni el análisis de errores.** Un diario importado
y no completado da P&L y nada más — exactamente lo que ya te da la plataforma
del bróker, y el motivo por el que importar *solo* no es una funcionalidad.

De ahí la fase 5, que no es un extra: la operación importada entra **incompleta
y marcada como tal**, y la Cabina la reclama. El importador no es el producto;
es el que llena la cola de trabajo del producto.

---

## El camino

```
SUBIR → DETECTAR → MAPEAR → EMPAREJAR → PREVISUALIZAR → IMPORTAR
```

| Paso | Qué hace | Qué pasa si falla |
|---|---|---|
| **Subir** | Un `<input type=file>` y pegar texto. Nada sale del navegador. | — |
| **Detectar** | Compara la fila de cabecera con las firmas conocidas. | Cae a Mapear en manual. Nunca adivina a medias. |
| **Mapear** | Qué columna es `date`, cuál `instrument`, cuál `price`… | Es el paso manual: no puede fallar, sólo quedar incompleto. |
| **Emparejar** | FIFO por cuenta + instrumento → operaciones de ida y vuelta. | Las ejecuciones que quedan sin pareja se muestran **aparte**, no se descartan en silencio. |
| **Previsualizar** | La tabla exacta que se va a escribir, con los duplicados ya marcados. | — |
| **Importar** | Escribe. Una sola vez, y se puede deshacer entero. | — |

Regla dura del camino: **nada se escribe antes de Previsualizar**, y lo que se
previsualiza es lo que se escribe, no una aproximación.

---

## La huella de deduplicación

Reimportar un rango que se solapa con otro ya importado es el caso normal, no el
raro: se exporta «el último mes» cada semana.

Deduplicar por operación no vale —la misma ida y vuelta puede emparejarse
distinto si el rango cambia—, así que **la huella va en la ejecución, no en la
operación**:

- Si el bróker da un identificador de ejecución, ése es la huella.
- Si no, `cuenta + instrumento + marca de tiempo + lado + cantidad + precio`,
  normalizado y resumido.

Cada operación guarda el conjunto de huellas de las ejecuciones que la
formaron. Al importar se construye el conjunto de huellas ya consumidas y toda
ejecución que ya esté dentro se descarta **antes** de emparejar. Así una
reimportación de un rango solapado produce cero operaciones nuevas, y una que
añade tres días produce exactamente las de esos tres días.

---

## Lo que NO va a hacer

Decirlo ahora evita discutirlo en la fase 4.

- **No se conecta al bróker.** Ni API, ni credenciales, ni OAuth. CSV y nada más.
- **No adivina el setup.** `setupId` lo pone una persona.
- **No inventa el stop.** Sin stop no hay R, y una R inventada es peor que
  ninguna.
- **No importa inversiones.** Futuros primero; la cartera es otro modelo.
- **No arregla un CSV roto.** Si el bróker exporta mal, se dice y se para.

---

## Fases, con su punto de control

Cada fase es útil por sí sola y se puede soltar sin la siguiente.

### Fase 0 — Conseguir los CSV *(tuya, 10 minutos, bloquea todo)*

Exportar un CSV real de **cada** plataforma que uses de verdad y guardarlo en el
repositorio como fixture anónimo.

> **Control:** hay al menos un `.csv` real en `test/fixtures/`. Sin esto, la
> detección se diseña a ciegas y el importador no se puede dar por fiel.
>
> **Sigue sin hacerse a 20/10/2026.** Se adelantaron la fase 0.5 y la fase 1,
> que no dependen de ella: la primera porque leer bytes no cambia según el
> bróker, y la segunda porque un mapeador manual no sabe nada de ninguno. Lo que
> esta fase sigue bloqueando es la **detección automática** (fase 4) y el
> **control** de la fase 1.

### Fase 0.5 — Leer bytes *(hecha, 12/10/2026)*

La única parte del importador que **no depende de tener el CSV**, y conviene decir
por qué se adelantó: leer bytes no cambia según el bróker, y es la capa que
corrompe datos **en silencio**. Un separador decimal mal leído no lanza ningún
error: convierte 1,5 contratos en 15 y el P&L sale diez veces mayor con todas las
pantallas en verde.

Funciones puras en `index.html` (`FUT.csv`), sin tocar el almacén, la pantalla ni
el motor. Cubren: BOM de Excel, CRLF / LF / CR suelto, comillas con comas, saltos
de línea y comillas dobladas dentro, separador `,` `;` tab `|` elegido **por la
forma de la tabla y contando sólo fuera de comillas**, y filas desiguales que se
rellenan y se cuentan en vez de descartarse.

**La decisión de diseño que importa: el separador decimal y el orden de la fecha
se deciden POR COLUMNA, no por celda, y «no se puede saber» es una respuesta.**

Por celda es imposible: `1,500` son mil quinientos o uno coma cinco, y `03/04/2026`
es el 3 de abril o el 4 de marzo. Por columna casi siempre se resuelve —basta con
que una sola fila sea inequívoca: un `3,75` decide la columna entera, un día 15
decide el formato entero—. Cuando la columna no lo resuelve, se devuelve vacío y lo
decide quien importa. **Elegir el formato de casa ahí mete las operaciones en el día
equivocado durante doce meses sin un solo error en pantalla.**

La misma regla en lo pequeño: lo que no es un número es `null`, nunca `0` (un `0` se
suma y mentiría en el P&L); un lado ilegible es `null`, nunca `long` (caer a compra
convierte una venta en su contraria).

`test/csv.mjs`, 49 aserciones, con cinco sabotajes corridos el 12/10/2026:

| sabotaje | qué se puso rojo |
|---|---|
| el decimal ambiguo cae al punto | 2 — «AMBIGUO, y se devuelve "" en vez de adivinar» |
| la fecha ambigua cae a mes/día | 1 — la aserción del 03/04 |
| el separador se cuenta sin mirar comillas | 3 — el fichero sale con 1 columna donde hay 3 |
| las filas desiguales se descartan | 1 — la fila corta desaparece |
| un lado ilegible cae a `long` | 1 — una venta se convierte en compra |

> **Control:** los cinco sabotajes ponen roja la aserción que les corresponde. El
> tercero no lo hacía con el primer fixture —tenía más comas que `;`, pero el
> recuento se saltaba la cabecera y acertaba por casualidad—; hizo falta uno donde
> comas y `;` empatan y la coma gana por ir primera en la lista.

**Lo que esto NO desbloquea:** la detección automática del bróker (fase 4) ni la validación al céntimo contra un CSV real. El modo FIFO de la fase 2 ya existe, pero su validación contra una plataforma concreta sigue dependiendo de la fase 0.

*(La primera versión de esta línea decía que la fase 0 seguía bloqueando también
el mapeo. No era cierto, y esa frase es la que hizo dar por imposible la fase 1
durante ocho días: un mapeador manual no necesita saber cómo exporta nadie.
Corregido el 20/10/2026, con la fase 1 hecha.)*

### Fase 1 — El mapeador manual *(hecha, 20/10/2026)*

Subir cualquier CSV o pegarlo, ver las primeras filas, decir a mano qué columna
es qué, previsualizar e importar. Sin detección automática, pero con dos modos:
operaciones ya cerradas (una fila, una operación) y ejecuciones individuales que
se reconstruyen por FIFO. El importador identifica el modo elegido en pantalla.

Funciona con **todos** los brókers desde el primer día, porque no sabe nada de
ninguno. Vive en Futuros → Diario, y las decisiones que no son obvias:

- **Ningún desplegable viene relleno por parecido de nombre.** Una columna
  «Price» puede ser la entrada o la salida, y acertar nueve de cada diez veces
  es peor que no intentarlo: la décima entra sin que nadie la mire, porque un
  desplegable relleno se lee como comprobado.
- **«No hay nada que decidir» no es «es ambiguo».** Una columna de contratos con
  `1` y `2` no tiene separador decimal: preguntarlo convertiría el aviso en
  ruido permanente y el día que importe también se ignoraría. Sólo se pregunta
  cuando alguna celda trae un signo y aun así no se resuelve.
- **Una celda con algo dentro que no se puede leer es un problema, no un
  hueco.** Si «Salida» trae `abc`, esa operación no está abierta: está mal
  leída, y dejarla entrar como abierta le quita su resultado a la cuenta sin un
  solo error en pantalla.
- **Fecha y hora pueden compartir columna** —un `15/09/2026 10:05` es lo normal—
  y ninguna otra pareja puede.
- **Lo que no entra se enseña** con su número de fila (contando la cabecera, que
  es el número que se ve al abrir el CSV en una hoja de cálculo) y su motivo.
- **Se deshace entero** mientras no se cierre la página: cada operación lleva
  `source: "import:manual"` e `importId`, y el deshacer borra su lote y sólo el
  suyo. El `importId` identifica el lote que se puede deshacer. La huella idempotente de cada ejecución permite reconocer fills ya importados al volver a cargar rangos que se solapan.

Y una consecuencia que había que resolver con ella, porque sin resolverla el
importador habría estropeado lo mejor que tiene la app: **una operación
importada no se juzga como si hubiera tenido un plan.** Ningún bróker exporta el
stop, así que la señal «sin stop escrito» —categoría 2, *sabías qué hacer y no
lo hiciste*— se disparaba en todas: cien operaciones importadas, cien errores de
ejecución que nadie cometió. El campo falta **por construcción**, no por
descuido. La pérdida importada cae en «Sin datos», que es la verdad, y la
escrita a mano sin stop sigue siendo un error de ejecución: la excepción está
acotada y `test/mapeador.mjs` lo fija con las dos mitades.

> **Control:** importar el fixture de la fase 0 y que las cifras cuadren con la
> plataforma del bróker al céntimo. **SIGUE PENDIENTE**, y es lo único que
> queda de esta fase: `test/mapeador.mjs` (43 aserciones) prueba el mapeador con
> CSV **sintéticos** —que la columna elegida se lee por esa columna, que lo
> ilegible no entra, que nada se escribe antes de la vista previa— y eso no es
> lo mismo que fidelidad a un bróker de verdad. La compuerta lo lleva como una
> fila UNKNOWN a propósito, para que un verde no se lea como más de lo que es.
> Los CSV de la prueba van dentro del propio fichero y **no** en
> `test/fixtures/`: un fixture sintético ahí se confundiría con el real y daría
> la fase 0 por cerrada sin estarlo.

### Fase 2 — Emparejado de ejecuciones · implementada, pendiente de CSV real

Modo **Ejecuciones · emparejar FIFO** en el importador. Agrupa por cuenta e
instrumento, ordena por fecha/hora, procesa cierres parciales, entradas múltiples
y vueltas de posición. Las cantidades que quedan abiertas se conservan como
operaciones abiertas. Cada operación almacena `executionIds[]` y
`executionLedger[]` con lado, cantidad asignada, precio, comisión, fecha/hora e
identificador/huella de cada ejecución. El panel plegable «Historial de
ejecuciones» agrega los fills por huella, permite filtrar por texto, cuenta,
instrumento y fechas, abre una operación vinculada y exporta a CSV las filas
visibles del filtro, con cabeceras e identificadores completos. Una ejecución repartida
entre varios lotes aparece una sola vez con cantidad y comisión agregadas. No
modifica el motor cuantitativo.

La huella usa el ID del bróker cuando existe; si no, usa cuenta, instrumento,
fecha/hora, lado, cantidad y precio normalizados. Al importar un rango posterior,
Cabina reconstruye los lotes abiertos desde el ledger y actualiza la operación
existente al recibir su cierre. Los cierres parciales dejan el tramo cerrado y
crean una fila nueva para el resto abierto; deshacer restaura las posiciones
previas y elimina las filas nuevas. Si una posición previa no tiene ledger
suficiente, el importador bloquea la escritura en vez de inventar una apertura.

> **Control automatizado:** `test/emparejado.mjs` cubre cierres parciales, dos
> entradas, reversión, aislamiento por cuenta/instrumento, duplicados, filas
> inválidas y el camino CSV → operación → historial de ejecuciones. La suite no
> demuestra aún fidelidad a un bróker real: eso requiere la fase 0.

### Fase 3 — Huella, reimportación y reconciliación incremental · implementada, pendiente de CSV real

La huella de cada ejecución usa el ID del bróker cuando está disponible; si no,
normaliza cuenta, instrumento, fecha/hora, lado, cantidad y precio. Reimportar
el mismo archivo no duplica ejecuciones. Al importar rangos solapados, Cabina
conserva lo ya registrado, añade sólo los fills nuevos y reconcilia cierres con
las posiciones abiertas reconstruidas desde el ledger. Los casos ambiguos o sin
ledger suficiente se bloquean antes de escribir, en lugar de inventar una
apertura o un cierre.

> **Control automatizado:** las pruebas de importación, emparejado e historial
> cubren duplicados, rangos solapados, cierres parciales, reversión, aislamiento
> por cuenta/instrumento y deshacer. La reconciliación contra cifras reales del
> bróker sigue pendiente de la fase 0; no se considera validada con CSV sintéticos.

### Fase 4 — Detección automática

Una firma de cabecera por plataforma, añadida **sólo** cuando haya un CSV real
de ella. Nada de mapeos escritos de memoria.

Las dos que importan, en este orden, porque son las que usa el autor:

| Plataforma | De dónde sale el CSV | Qué trae |
|---|---|---|
| **Tradovate** | Account → la cuenta → ajustes → pestaña **Orders** → rango → descargar | Órdenes, no idas y vueltas → necesita la fase 2 |
| **NinjaTrader** | Control Center → **Trade Performance** → pestaña Trades → exportar | Ya empareja idas y vueltas él solo → puede saltarse la fase 2 |

Esa diferencia es la razón de empezar por NinjaTrader aunque Tradovate sea el
que más se usa en las prop: con un export de Trades de NinjaTrader la fase 1
sola ya produce operaciones correctas, sin emparejado; el modo FIFO queda para
exports de ejecuciones individuales como los de Tradovate. Sirve de banco de pruebas
del resto del camino mientras falta un CSV real que valide cifras contra el bróker.

> **Control:** el fixture se detecta solo y el mapeo propuesto es el correcto sin
> tocarlo.

### Fase 5 — La cola de operaciones incompletas *(hecha)*

La operación importada entra marcada. La Cabina dice cuántas le faltan campos y
lleva a completarlas de una en una. Vive en Futuros → Diario, en el panel
**Operaciones**: un interruptor **«Sólo sin completar (N)»** y un botón
**«Completar la siguiente»** que abre la más antigua y encadena con la siguiente
al guardar, sin volver a la tabla entre una y otra.

Las decisiones que no son obvias, y que `test/cola-importadas.mjs` fija:

- **Sólo lo importado entra.** Una operación escrita a mano sin stop ya es un
  error de EJECUCIÓN —categoría 2— y `senalesDe` exime a la importada justamente
  porque a ella el campo le falta por construcción. Contar aquí también las
  manuales duplicaría lo mismo y borraría esa distinción, que es la que impide
  que cien filas de un CSV se conviertan en cien errores que nadie cometió.
- **El contador se cuenta sobre los demás filtros**, no sobre lo que el propio
  interruptor deja ver: si no, al activarlo el número pasaría a ser el de la
  lista y dejaría de decir «cuántas de las que estás mirando te faltan». Mismo
  razonamiento que la cola de revisiones de Estudio.
- **Las abiertas SÍ entran**, al revés que en aquella cola. Allí una abierta no
  tiene nada que revisar todavía; aquí una posición importada y abierta sin stop
  escrito es lo más urgente que hay en la app.
- **La cola se puede vaciar**, y es lo que la separa de un aviso permanente. De
  una operación de hace meses no siempre se recuerda el stop, y una cola que
  nunca llega a cero se aprende a ignorar —y el día que importa, también—.
  `stopUnknown` es la salida honesta: dice «existió y no lo reconstruyo», no
  inventa un número, no toca la R y sólo se ofrece en una operación importada.
  En una manual, escribir el stop antes de entrar es el trabajo entero:
  ofrecerle ahí un «no lo recuerdo» sería ofrecerle saltarse el plan.
- **Un stop escrito gana siempre sobre la marca:** si deja de faltar, la marca
  sobra y no se guarda. Igual que `invalida` y `plan`, la ausencia significa
  algo y un `false` del editor no se escribe.
- **Quedarse sin cola es un éxito y se dice como tal.** Completar la última con
  el filtro puesto vacía la lista, y poner ahí «sin operaciones en este rango»
  convertiría ese momento en un mensaje de error.

> **Control:** con 20 operaciones importadas sin stop, Métricas/Edge dice que no
> puede medir en R y nombra cuántas y por qué. **Cumplido:** `mxEdgeNotas` dice
> «N de M operaciones no tienen stop: cuentan en $, pero no en R ni en la
> simulación», y la tarjeta de expectancy dice «hace falta el stop para medir en
> R». La cola no cambia ese recuento: una operación marcada con `stopUnknown`
> sale de la cola y sigue contando entre las que Edge no puede medir, que es la
> verdad.

---

## Por dónde NO empezar

Por la fase 4. Es la que más se luce —«detecta tu bróker solo»— y la única que
no se puede hacer bien sin los ficheros de la fase 0. Empezar por ahí produce
mapeos escritos de memoria que fallan con el primer CSV real.
