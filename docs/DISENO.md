# Sistema visual de Cabina

## Qué tema manda, y por qué hay que decirlo

Cabina llegó a tener **dos temas claros a la vez**, escritos por separado y
sin saber el uno del otro:

| | de dónde viene | paleta |
|---|---|---|
| **El que manda** | commit `744c1a3`, «Simplificar Cabina con interfaz clara y operativa» | gris azulado frío: papel `#f5f6f8`, tinta `#202a35`, acento `#176f65` |
| Descartado | PR #75, «match Cabina to Bitácora visual palette» | papel cálido `#FAF8F4`, tinta `#16181C`, verde `#16915B`, rojo `#D6483B`, azul `#3D6FB0` |

**Manda el de `744c1a3`.** No por ser mejor, sino porque está medido: su
mensaje dice que la suite completa pasó en Ubuntu 24.04, y los asertos de
contraste de la suite se escribieron contra sus valores.

### Por qué los dos no podían convivir

No es cuestión de gusto, es cuestión de cascada. El tema de `744c1a3`
declara cada token con `!important`:

```css
html, body { background: var(--bg) !important; color: var(--text) !important; }
```

La capa de la PR #75 declaraba el suyo sin él:

```css
body { background: var(--ds-bg); color: var(--ds-text); }
```

Gane quien gane el orden en el fichero, el `!important` se lleva el color.
Mergear la PR #75 habría dejado unas 374 líneas de CSS que no pintan nada.

Y habría pasado en verde: su guardián, `test/diseno-sistema.mjs`, comprobaba
que los hex **estuvieran en el texto** del CSS —`css.includes('#FAF8F4')`—, no
que llegaran a la pantalla. Un guardián así no protege la paleta: protege que
alguien haya escrito la paleta, que es lo mismo que no proteger nada. Por eso
se sustituyó por uno que mide ergonomía comprobable en vez de colores
tapados.

## Qué se quedó de la PR #75

Al medir su capa contra main, casi toda su ergonomía **ya estaba**, y hecha
antes y mejor:

| lo que proponía la PR #75 | estado en main |
|---|---|
| foco visible en todo control | ya: `:where(button,input,select,textarea,[tabindex]):focus-visible` |
| 40 px de alto de control en móvil | ya, y 44 px |
| campos a 16 px en el iPhone | ya, con el mismo comentario sobre el zoom de Safari |
| `tabular-nums` | ya, en 43 sitios |
| `prefers-reduced-motion` | ya, en quince bloques |
| `scroll-padding-top`, `overscroll-behavior` | ya |
| escala `--ds-space-*`, `--ds-radius-*` | **no entra**: duplicaría los `--r-*` que ya existen |

Entraron las tres declaraciones que no estaban y no duplican nada:

- `-webkit-tap-highlight-color: transparent` — el destello al tocar tapaba el
  estado de foco que la propia app deja visible, y dura más que el toque.
- `text-wrap: pretty` en texto corrido — `balance` ya estaba en los títulos;
  esto es para notas, ayudas y vacíos, que es donde la app explica las cosas.
- `lining-nums` junto a `tabular-nums` — sin él, una fuente con cifras de
  estilo antiguo alinea las columnas pero deja el 3 y el 9 bajo la línea
  base, y una tabla de P&L se lee torcida.

## La deuda que esto deja anotada

El tema que manda está escrito como **una capa de `!important` encima** del
tema oscuro original, no en lugar de él. Funciona, y se midió, pero tiene un
coste que conviene no olvidar: todo componente nuevo nace con los colores del
tema oscuro de debajo y hay que acordarse de taparlo arriba. Las pantallas que
llegaron después de `744c1a3` —el Historial, las Estadísticas, la lectura de
Estudio— son justamente las que pueden quedar a medio pintar.

Resolverlo es reescribir los tokens en su sitio y retirar los `!important`, no
añadir una tercera capa. Mientras no se haga, la regla es: un componente nuevo
se mira en pantalla antes de darlo por hecho.
