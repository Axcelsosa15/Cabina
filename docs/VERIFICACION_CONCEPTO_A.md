# Verificación independiente de «Concepto A» (6fef9f5)

Fecha: 2026-10-30. Base verificada: `6fef9f5` sobre `802642e`.
Método: medición en Chromium con la semilla de `test/espera.mjs`, recorriendo
las **once** pestañas en **los dos temas**, componiendo el color del texto y el
de su fondo real (todas las capas translúcidas, una sobre otra).

Esto NO es una revisión de código: son números de pantalla. Lo que no se pudo
medir se dice que no se midió.

---

## 1 · Lo que se confirma que funciona

| Comprobación | Resultado |
|---|---|
| `appearance.js` arranca antes de CSS, sin parpadeo de tema | ✅ |
| Tema claro aplicado y pintado (`data-cabina-theme=light`) | ✅ |
| Tema oscuro aplicado y pintado (`--bg #0B0E13`, `--text #E8ECF2`) | ✅ |
| `npm run check:bundle` | ✅ bundle al día, 11 módulos |
| `npm run audit:security` | ✅ **0 fallos**, CSP intacta con el segundo script |
| Errores de JS o de consola en las once pestañas | ✅ ninguno |
| Cinco bloques `<style>`, once pestañas, `app.js` externo | ✅ gate intacto |

**Los dos tests modificados son más estrictos, no más laxos.** Conviene dejarlo
escrito porque un diff sobre un test siempre levanta la sospecha contraria:

- `seguridad.mjs` pasó de `srcs.length <= 1` a exigir la lista **exacta y
  ordenada** `['./appearance.js', './app.js']`, más una aserción nueva de que el
  bootstrap va antes de la primera hoja. Y mete `appearance.js` en el bloque que
  se escanea por `eval`, `innerHTML` y demás. Es un gate mejor.
- `tokens.mjs` soltó las razones exactas (12.82 / 6.50 / 4.61). **Tenía que
  hacerlo**: esas cifras describían un tema fijo, y el tema ahora lo elige quien
  usa la aplicación. Lo que puso en su lugar —suelo AA más jerarquía monótona
  `text > muted > dim`— es el invariante que sí es independiente del tema.

`accessibleColor()` en `appearance.js` empuja cualquier acento personalizado
hasta 4.5:1 contra el fondo antes de aplicarlo. Es lo que cierra el hueco que
abriría, si no, soltar las razones fijas de `tokens.mjs`.

---

## 2 · RIESGO ABIERTO · todo el tema claro depende de `@scope`

**138 de las 240 declaraciones `!important` del documento —73 reglas, el tema
claro visible entero— viven dentro de un solo `@scope (html:not([data-cabina-theme="dark"]))`.**

Un motor que no conoce `@scope` descarta el bloque **entero**, no la línea. Y no
falla de forma visible: la página carga, con la base oscura debajo del tema
claro a medias.

Medido quitando el bloque, que es exactamente lo que hace ese motor:

| Escenario | Textos por debajo de AA |
|---|---|
| Con `@scope` (Chromium actual) | 0 |
| **Sin `@scope`** | **165** |

Entre ellos, botones a 1.2:1 y cabeceras de tabla a 1.26:1. No es degradación:
es ilegible.

`@scope` llegó a Firefox en la **146** y pasó a Baseline «newly available» en
**diciembre de 2025**, hace once meses. «Newly available» significa que funciona
en las versiones actuales de todos los navegadores, no en las que la gente
todavía tiene instaladas. Baseline «widely available» no llega hasta 2028.

Cabina se instala como PWA en teléfonos, donde la versión del navegador no la
elige quien desarrolla.

**Ninguna prueba de la suite puede detectarlo**: Playwright corre Chromium, que
sí soporta `@scope`. `apariencia.mjs:23` incluso **afirma que la regla existe**,
con lo cual fija la fragilidad en vez de protegerse de ella.

**Arreglo propuesto, mecánico y equivalente:** quitar el envoltorio y prefijar
cada selector con `html:not([data-cabina-theme="dark"])`. Todo lo de dentro ya
lleva `!important`, así que el cambio de especificidad no altera nada. Queda
propuesto, no aplicado: la capa es de «Concepto A» y reescribirla mientras se
trabaja sobre ella sólo produce un conflicto.

---

## 3 · Arreglado en el commit siguiente

Cinco colores que la capa de tema **no podía** alcanzar, con su medición:

| Dónde | Qué | Claro | Oscuro |
|---|---|---|---|
| `app.js` · etiquetas de gráfico (114) | `fill:#c8d5df!important` **en línea** | 1.50:1 | ok |
| `index.html` · `.rulec .rtog` (6) | `var(--line-strong)` como tinta | 1.48:1 | 1.45:1 |
| `index.html` · `.deck-parts` | `#a5b3c0` | 2.14:1 | ok |
| `index.html` · `.study-searchicon` | `#70e0cf` | 1.58:1 | ok |
| `index.html` · `.seschip .st` | `rgba(79,179,160,.8)` | 1.80:1 | ok |
| `app.js` · P&L de Estudio | `#70e0cf` / `#f08f86` | 1.58:1 | ok |

El del gráfico merece una línea aparte: un estilo **en línea con `!important`**
gana a cualquier hoja de estilo. La capa de tema decía `#536171` y la pantalla
pintaba `#c8d5df`. Ninguna capa, por bien escrita que esté, puede corregir eso.

El del chevrón merece otra: estaba roto en **los dos** temas, que es la clase de
defecto que un tema nuevo nunca arregla porque no es un problema de tema.

Resultado tras el arreglo: **0 por debajo de AA en claro y en oscuro**,
etiquetas de gráfico a 6.33:1 y 12.92:1. Lo vigila `test/contraste.mjs`.

---

## 4 · Pendiente, por orden de importancia

1. **`@scope`** (§2). Es lo único de esta lista que puede dejar la aplicación
   inservible en un navegador real.
2. **La paleta no es la que se pidió.** El encargo fijaba `#F5F6F8`, `#202A35`,
   acento **`#176F65`**, positivo `#18794E`, advertencia `#8A4B08`. Lo entregado
   usa `#f7f9fc`, `#172334`, acento **`#1d4ed8`** (azul), positivo `#166534`,
   advertencia `#92400e`. Cambiar el acento de verde azulado a azul no es
   «ajustar tonos»: es cambiar la identidad, y además `data-entry-ui.mjs` ahora
   **fija `#1d4ed8` en una aserción**, así que recuperar el teal pone roja esa
   prueba. Decisión de producto, no defecto — pero hay que tomarla a propósito.
3. **Las capas siguen sin consolidar.** Los bloques 2 y 3 conservan **117 hex
   oscuros crudos** que sólo no se ven porque la capa de arriba los tapa. Los
   cinco defectos de §3 son exactamente las rendijas que esa capa no nombraba.
   Mientras los hex sigan ahí, habrá más rendijas.
   `!important` pasó de 212 a 240 con este trabajo; el encargo pedía reducirlo.
4. **La suite no mide contraste en oscuro** más allá de los tres tokens.
   `test/contraste.mjs` cubre ahora los dos temas.
5. **Las secciones del encargo no existen.** «Analítica», «Insights»,
   «Research quality» y «Correlaciones» tienen **cero** apariciones en el
   repositorio, en ninguna rama. Las once reales están en
   `docs/AUDITORIA_DATA_ENTRY_A.md`, y coinciden con lo que mide esta
   verificación.
