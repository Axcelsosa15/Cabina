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

Todos estos campos ya existen en el editor de operaciones. No hay que inventar nada.

| Campo | Exigencia | Si falla, la pérdida es de categoría |
|---|---|---|
| `cStruct` | Estructura confirmada (BOS/CHoCH) | 1 — leíste una estructura que no estaba |
| `cPull` | Entrada en pullback a EMA | 1 o 2 — según si la viste mal o no la esperaste |
| `cWindow` | Dentro de la ventana operativa | 2 o 3 — fuera de hora nunca es mala suerte |
| `cSize` | Tamaño según regla dura | 3 — el tamaño de más es ego, casi siempre |
| `stop` | **Escrito antes de entrar** | 2 — sin stop no había plan que ejecutar |

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

## Estado en el producto

Esto es **un documento**, no una función. Lo que la cabina ya hace hoy:

- guarda las cuatro casillas por operación y calcula `isProto`;
- guarda `quality` con los tres valores de arriba;
- guarda `tags`, `note`, `lesson`, `exitWhy` y `stop`;
- **compara las dos poblaciones**, que es más de lo que parece: el análisis calcula
  win rate, R medio y P&L por separado para las operaciones dentro y fuera de
  protocolo.

```js
const protoA = grp(isProto), protoB = grp(t => !isProto(t));
```

  Eso convierte la compuerta de arriba en algo comprobable: si tus `A` no rinden mejor
  que tus `C`, el problema no es tu disciplina — es que el protocolo no tiene ventaja,
  y estás clasificando errores contra una vara que no mide nada.

Lo que **no** hace: no guarda la categoría del error como un campo propio, así que no
puede contarte «cuántas pérdidas de categoría 3 llevas este mes». Añadir ese campo es
una decisión de producto —toca el modelo canónico de `Trade` y el protocolo 17 aplica:
la ausencia del campo en toda operación anterior significaría algo y habría que
decidir qué—. No se ha tomado aquí.

Mientras tanto la aproximación honesta ya está disponible: `quality` distingue
categoría 4 (`A`) de todo lo demás, y `tags` distingue el tipo dentro de lo demás.
