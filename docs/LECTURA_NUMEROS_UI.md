# Cabina 2.0 · Tipografía legible y aprendizaje de métricas

Fecha: 2026-10-31 · Rama `design/cabina-2-readable-metrics-20261031`

## Objetivo

Una cifra debe responder, a primera vista:

1. **¿Qué mide?** Nombre legible y unidad.
2. **¿Qué significa este valor?** Interpretación del resultado filtrado.
3. **¿Qué no demuestra?** Límite de la muestra y cautelas.
4. **¿Cómo se calcula?** Fórmula visible bajo demanda.

La funcionalidad responde a **entender el trading**, no a crear otro dashboard cargado de KPIs.

## Entregables en el código

- Jerarquía tipográfica transversal: título de página, título de panel, etiqueta, valor de KPI, anotaciones y cabeceras de tabla. Las palabras de interfaz usan `--font-ui`; los números alineados usan `--font-mono` + cifras tabulares.
- No se añade una sexta hoja `<style>`. La adaptación va en el bloque existente de diseño unificado.
- Nueva sección de Métricas / Edge: **Entiende tus números**, con un selector de cuatro métricas:
  - **Expectativa neta ($/trade)**: relación con resultado medio neto y comisiones.
  - **Profit factor**: ganancias acumuladas relativas a pérdidas; su valor nulo es distinto de 0.
  - **Win rate**: ganadores entre todos los trades cerrados, con planos en el denominador y referencia al punto de equilibrio sólo cuando es computable.
  - **Max drawdown**: caída histórica pico-a-valle, separada de una pérdida individual y de los límites trailing de una prop firm.
- Interpretación, advertencia de muestra, fórmula y valores relevantes. Los controles son botones nativos con `aria-pressed`, texto `aria-live` y tamaños táctiles móviles. El detalle de fórmula es un `details` nativo.
- Traducciones dinámicas español/inglés sin cambiar el contrato de idioma existente.
- Sin fetch nuevo, almacenamiento adicional ni modificaciones de filtros, importación, cuentas, motor o P&L.

## Integridad cuantitativa

La guía recibe `c = mxCalc(mxOps(), mxP())` desde el render de Edge: **la misma instancia** que alimenta `mxCard`, estadísticas y curva. No reconstruye la lista, ni calcula otra expectancy o drawdown. Las cifras visibles en la guía reutilizan `qeM`, `mxPct`, `c.E`, `c.pf`, `c.p`, `c.curva`, `c.N`, `c.W` y `c.L`.

`N < 30` se muestra como **muestra pequeña** de acuerdo con la advertencia preexistente de Edge. `N >= 30` **no** se interpreta como prueba de un edge: se recuerda que la muestra histórica no valida rendimiento futuro. La guía no sustituye pruebas fuera de muestra ni la regla de prop.

Sin operaciones cerradas → `—`, nunca 0 ficticio. Sin capital de referencia → drawdown en porcentaje desconocido. Sin pérdidas → el PF no se inventa como infinito.

## QA y compuerta

`test/metricas-lectura.mjs` comprueba la guía en escritorio claro y teléfono oscuro, traducciones, valores extraídos del mismo KPI, interacción, advertencias, tacto y overflow. El runner `test/correr.mjs` la descubre automáticamente. Ejecutar `npm run compuerta` antes de merge; revisar además `test/sistema.mjs`, `test/contraste.mjs`, `test/idioma.mjs`, `test/data-entry-ui.mjs`.

**No certificación de producción:** los cambios se dejan en PR draft hasta CI en verde y validación visual del diseño real. La rama es independiente del PR #99 (navegación) y de los PR #97/#98 (editor); revisar conflictos antes de integrar.
