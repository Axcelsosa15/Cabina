# Las cuatro categorías de error

Una pérdida no dice nada por sí sola. Lo que dice algo es **de qué tipo** fue, y sólo
tres de los cuatro tipos se arreglan cambiando lo que haces.

| | Categoría | Qué pasó | ¿Se arregla? |
|---|---|---|---|
| **1** | **Error de análisis** | Leíste mal el gráfico o la situación | Sí — con estudio y revisión |
| **2** | **Error de ejecución** | Sabías qué hacer y no lo hiciste | Sí — con proceso |
| **3** | **Error psicológico** | La emoción o el ego rompieron la disciplina | Sí — y es el más caro |
| **4** | **Pérdida del sistema** | Hiciste todo bien y perdiste igual | **No, en esa operación** |

---

## El problema de la categoría 4, que es el problema entero

La cuarta categoría es la única que absuelve, así que es la única que se abusa. Sin una
prueba objetiva de «hiciste todo bien», **la categoría 4 es el cajón donde se esconden
las otras tres**: toda pérdida acaba pareciendo mala suerte, el journal se llena de
operaciones impecables, y la curva sigue bajando sin que nada explique por qué.

Una taxonomía en la que tú decides si te absuelves no es una taxonomía. Es un consuelo.

Por eso aquí la categoría 4 **no se elige: se gana**, y se gana contra campos que la
cabina ya guarda en cada operación.

### La compuerta: una pérdida es del sistema sólo si pasa las cinco

Todos estos campos ya existen en el editor de operaciones.

| Campo | Exigencia | Si falla, la pérdida es de categoría |
|---|---|---|
| `cStruct` · `cPull` · `cWindow` · `cSize` | Las cuatro condiciones marcadas | **2** — sabías que faltaba y entraste |
| `time` | Entrada dentro de NY AM | **2** — fuera de hora nunca es mala suerte |
| `qty` | Dentro del tope de contratos de la cuenta | **3** — el tamaño de más es ego, casi siempre |
| `stop` | **Escrito antes de entrar** | **2** — sin stop no había plan que ejecutar |
| `invalida` | La invalidación, escrita antes de entrar | **2** — ver más abajo |

> **Corrección sobre la primera versión de este documento.** Decía que una casilla
> sin marcar —«estructura confirmada» en falso— es categoría **1**, «leíste una
> estructura que no estaba». Es al revés: si la casilla está **sin marcar**, sabías
> que la estructura no estaba y entraste igual, y eso es **2**. El caso 1 de verdad
> —la marcaste y no estaba— es invisible en una operación suelta, que es justo el
> argumento de la sección siguiente. Salió al escribir el código: la regla no se
> podía implementar como estaba escrita.

La cabina ya calcula la conjunción de las cuatro casillas:

```js
const isProto = t => !!(t.cStruct && t.cPull && t.cWindow && t.cSize);
```

Y ya tiene el veredicto en un solo campo, `quality`, con exactamente tres valores:

```
A · según protocolo          →  candidata a categoría 4
B · con desviación menor     →  hay un error dentro, aunque pequeño
C · fuera del protocolo      →  NO es pérdida del sistema, nunca
```

**Una operación marcada `C` no puede ser categoría 4.** Eso no es una opinión sobre el
trade: es aritmética sobre lo que tú mismo marcaste al registrarlo.

---

## Cómo distinguir la 1 de la 2 de la 3

Las tres se arreglan, pero no con lo mismo, y confundirlas es perder el tiempo
estudiando cuando el problema era de disciplina.

**Análisis (1)** — la decisión era coherente con lo que creías ver, y lo que creías ver
no estaba. El campo que lo delata es `note` («Qué vi y por qué entré»): se relee frío y
se compara con el gráfico. Si la lectura era defendible y el mercado simplemente hizo
otra cosa, no es error de análisis: es categoría 4.

> Se arregla mirando más gráficos, no siendo más disciplinado.

**Ejecución (2)** — la lectura era correcta y la mano no la siguió. Entrada tarde,
stop no puesto, objetivo movido, salida antes de tiempo sin motivo nuevo. El campo que
lo delata es `exitWhy` («Por qué saliste»): si la razón no existía en el plan de
entrada, es ejecución.

> Se arregla con proceso —órdenes puestas de antemano, checklist antes de entrar—, no
> con más estudio.

**Psicológico (3)** — sabías y podías, y aun así hiciste otra cosa porque algo tiraba
de ti. Es ejecución con una causa emocional detrás, y se separa porque **el arreglo es
distinto**: un checklist no cura revenge trading. Los marcadores ya están en el
placeholder de `tags`:

```
fomo, entrada temprana, noticia, revenge…
```

> Señal dura: tamaño por encima de la regla (`cSize` en falso) después de una pérdida.
> Eso casi nunca es un error de cálculo.

---

## Lo que la categoría 4 sí exige, aunque no se arregle

«No requiere arreglo» es cierto **de esa operación** y falso del conjunto.

Una racha de pérdidas todas de categoría 4 —todas `quality: A`, todas con las cuatro
casillas marcadas— no significa que vayas bien. Significa una de dos cosas, y las dos
son trabajo:

1. **El sistema ha dejado de tener ventaja** en este régimen de mercado, y hay que
   medirlo en vez de aguantarlo.
2. **La compuerta es demasiado blanda**: estás marcando casillas que no se cumplían.
   Esto es lo más frecuente, y se detecta releyendo `note` de las operaciones `A` que
   perdieron. Si al releerlas encuentras que alguna no merecía la `A`, el problema no
   era el sistema.

La categoría 4 absuelve al trader de esa operación. No absuelve al sistema de ser
medido.

---

## La regla de una línea

> **Antes de clasificar una pérdida como del sistema, intenta probar que fue de las
> otras tres y falla.** Si no lo intentaste, la clasificación no vale.

---

## 1 y 4 no se distinguen mirando una operación

Una pérdida limpia —plan escrito, plan cumplido, dinero perdido— tiene **la misma
forma** si leíste mal el gráfico que si el mercado simplemente hizo otra cosa. No hay
nada en esa operación que las separe.

Las separa **la muestra**: la esperanza del setup medida sólo sobre operaciones
limpias.

- Esperanza positiva con 20 o más operaciones limpias → sus pérdidas limpias son
  **4**. El sistema tiene ventaja y esa operación fue la parte que pierde.
- Esperanza negativa con 20 o más → son **1**. Ejecutaste bien un setup que no
  funciona: lo que se estudia, o se retira, es el setup.
- Menos de 20, o sin setup → **«1 o 4»**, y se dice. Veinte es un suelo para el
  *signo* de la esperanza, no una prueba de significación estadística.

Esa esperanza se mide **sin** las operaciones con error. Si entraran, tus errores de
ejecución harían parecer malo al sistema: la prueba lo fija con un caso en el que,
con los errores dentro, un setup con +$16.52 de esperanza limpia pasa a −$4.36 y sus
pérdidas limpias cambian de 4 a 1.

---

## Cómo lo hace la cabina

**Análisis → «¿De qué tipo fueron tus pérdidas?»** Cada pérdida cerrada, clasificada
sin preguntarte nada. Todo lo que sigue se deriva de campos que la operación ya trae.

| Señal | Categoría | Se deriva de |
|---|---|---|
| sin stop escrito | 2 | `stop` vacío con `entry` escrita |
| entrada fuera de NY AM | 2 | `time` fuera de 8:30–11:00 ET — salvo en + Rápido, ver abajo |
| entraste sin las cuatro condiciones | 2 | alguna casilla sin marcar |
| entraste sin invalidación escrita | 2 | `invalida` presente y vacía |
| saliste antes de que se cumpliera | 2 | `plan` = «antes» |
| saliste más allá del stop | 2 | R real por debajo de −1.15 |
| la marcaste B o C | 2 | `quality` |
| entraste con la pre-sesión incompleta | 2 | la compuerta de entrada lo dijo |
| se cumplió tu invalidación y aguantaste | **3** | `plan` = «tarde» |
| saliste por nervios | **3** | `exitWhy` = «nervios» |
| más contratos que tu tope | **3** | `qty` contra el tope de la cuenta |
| revancha: volviste a entrar tras perder | **3** | entrada ≤ 15 min después de salir perdiendo |
| revancha: subiste el tamaño tras perder | **3** | `qty` mayor que la operación perdedora anterior del día |
| tú la etiquetaste | **3** | `tags` con fomo, revenge, revancha, tilt… |
| entraste con la cabina diciendo que no | **3** | la compuerta bloqueaba por pérdida del día, racha o cuenta |

Manda la peor: una pérdida con una señal de 2 y otra de 3 es **3**, y conserva las
dos. Debajo de la tabla, **lo que más se repite**, que es lo que de verdad se arregla.

### Los dos campos nuevos

Son lo único que se te pregunta, y los dos son **hechos**, no opiniones:

- **«Invalidación · salgo si…»**, *antes* de entrar. Una frase: qué tendría que
  pasar para que la idea deje de valer.
- **«¿Respetaste tu invalidación?»**, *después* de salir, con cuatro respuestas
  cerradas: salí cuando se cumplió (o en el stop) · no se cumplió, salí según plan ·
  salí antes de que se cumpliera · se cumplió y aguanté.

Convierten «¿lo hice bien?» —que después de perder nadie contesta con honradez— en
«¿pasó lo que escribí?».

### Tres reglas sobre lo que no se sabe

- **La ausencia significa algo** (protocolo 17). Una operación sin el campo
  `invalida` es anterior a él y no se castiga por no tenerlo. Una nueva que lo deja
  vacío, sí. Y **abrir una operación vieja no es tocarla**: el editor escribe `""` y
  `false` en todo campo al guardar, así que guardar sin cambiar nada añadía
  «invalidación vacía» y «sin condiciones» a operaciones que nunca tuvieron esos
  campos. El guardado lo impide.
- **Lo registrado con + Rápido nunca es «limpio».** Su plan no se escribió antes del
  resultado, aunque después se completen entrada, stop y casillas: marcarlas viendo
  ya el P&L es justo el auto-juicio que esto existe para evitar. Sale como «sin
  datos», y tampoco entra en la esperanza de su setup. Las señales de **hecho**
  —nervios, tamaño, revancha— sí cuentan, porque no dependen de cuándo se escribieron.
- **Todas del sistema es la conclusión que menos se debe creer.** Si el panel dice
  que todas tus pérdidas son 4, lo dice, y te pide que releas las que marcaste A.

### Lo que no hace

- **No lee la invalidación.** Es texto libre; la cabina no sabe si «cierre de 5m bajo
  el mínimo» ocurrió. Por eso la pregunta de salida existe.
- **No distingue un error de análisis en una operación suelta.** Nadie puede: ver
  arriba. Lo hace por setup, con muestra.
- **La revancha por tiempo necesita la hora de salida** de la operación anterior, que
  es opcional. Sin ella sólo se detecta la de tamaño.
- **En + Rápido no hay señales de hora.** La hora que guarda es la de *apuntarla*, no
  la de entrar. La primera versión la usaba y marcaba «fuera de NY AM» a quien apunta
  por la noche; la prueba sólo lo cazó porque la suite pasó por ahí a las 11:11 ET, o
  sea que también dependía del reloj. Ahora hay un caso fijado a las 20:00.

Verificado en `test/errores.mjs`: 48 aserciones con las respuestas escritas a mano
antes del código, y siete sabotajes —uno por propiedad— que la ponen en rojo.
