# ESTUDIO — plan de implementación funcional

## Objetivo

Convertir ESTUDIO en un laboratorio para investigar operaciones reales del journal de FUTUROS, sin crear un segundo journal ni alterar el P&L original. Este documento es la especificación de trabajo para la rama `feat/estudio-trades-lab`.

## Principios no negociables

1. **Una sola fuente de verdad:** los trades se leen desde la colección existente usada por FUTUROS. No duplicar trades en una colección paralela.
2. **Datos derivados, no inventados:** métricas ausentes se muestran como no disponibles; no asumir comisiones, contratos, timestamps, screenshots ni excursiones.
3. **Separación de responsabilidades:** ESTUDIO guarda notas, etiquetas analíticas e hipótesis vinculadas a `tradeId`; no modifica el trade base salvo que el usuario abra explícitamente el editor de FUTUROS.
4. **Fórmulas centralizadas:** reutilizar QuantEngine y los adaptadores actuales. No recalcular P&L en la interfaz.
5. **Compatible con los dos almacenes:** funcionar con localDb y nubeDb mediante `state.db`; respetar conflictos/versionado, RLS y bucket privado.
6. **Sin dependencias runtime nuevas:** conservar la arquitectura de una sola página, sin build ni framework.
7. **No prometer backtest/replay real sin datos:** la reconstrucción de velas exige datos de mercado compatibles con instrumento, proveedor y timeframe.

## Entrega 1 — Trade Explorer

### Funcionalidad

- Selector de cuenta y filtros por instrumento, dirección, rango de fechas, setup, sesión y resultado.
- Búsqueda textual y orden por fecha, P&L neto y R.
- Tabla accesible con estado vacío útil, número de operaciones visibles y filtros activos.
- Seleccionar un trade abre una ficha de estudio con los campos disponibles del journal.
- Botón para limpiar filtros y exportar el subconjunto visible si el sistema de respaldo/exportación existente lo permite.
- Estados explícitos: cargando, sin operaciones, ningún resultado para filtros, error de lectura.

### Datos

Leer trades desde la misma colección y función de consulta que FUTUROS. No asumir que todas las operaciones contienen `setup`, `session`, `time`, `commission`, `mae`, `mfe` o imágenes. Tratar cada campo opcional como desconocido.

## Entrega 2 — Review de una operación

Por cada trade seleccionado, ofrecer:

- Tesis/plan previo, condiciones de entrada y checklist.
- Evaluación de ejecución: entrada, stop, salida, cumplimiento de reglas y error principal.
- Notas de revisión y lección aprendida.
- Etiquetas de estudio personalizadas.
- Capturas y anotaciones únicamente mediante el mecanismo de capturas existente; no guardar URLs arbitrarias.
- Campos separados para revisión retrospectiva y plan original.

Guardar el material adicional en documentos de estudio independientes asociados por `tradeId`, usando `state.db`. Usar IDs estables y escritura versionada. No sobrescribir una nota de otro dispositivo silenciosamente.

## Entrega 3 — Analytics

Mostrar sólo métricas respaldadas por datos disponibles:

- Conteo de trades cerrados y abiertos por separado.
- Net P&L, win rate, average win/loss, profit factor y expectancy.
- Distribución de R y resultados agrupados por instrumento, setup, día y sesión.
- Equity curve y drawdown usando el motor existente.
- MAE/MFE sólo cuando existan precios o excursiones suficientes y definiciones compatibles.
- Costes/comisiones: distinguir bruto y neto; si faltan costes, advertirlo y no etiquetar el resultado como neto.

Cada bloque debe explicar el tamaño de muestra y el periodo aplicado. Evitar conclusiones de edge con muestras pequeñas; permitir ver el número de observaciones.

## Entrega 4 — Research de setups

- Crear una hipótesis con nombre, reglas objetivas, mercado/instrumento, timeframe, sesión y fecha de creación.
- Asociar operaciones existentes como evidencia; no duplicarlas.
- Comparar cohortes por setup con filtros idénticos.
- Separar muestra de desarrollo y validación por fecha, evitando mezclar operaciones futuras en la muestra de entrenamiento.
- Registrar conclusión, contraevidencia, costes y limitaciones.
- No afirmar significancia estadística ni rentabilidad futura sin una prueba adecuada.

## Modelo de documentos propuesto

Usar nombres compatibles con las convenciones reales de `state.db` después de inspeccionar el esquema existente. Modelo conceptual:

- `studyReviews/{reviewId}`: `tradeId`, `updatedAt`, `planReview`, `executionReview`, `lesson`, `tags`, `screenshotRefs`.
- `studyHypotheses/{hypothesisId}`: `title`, `rules`, `instrument`, `timeframe`, `session`, `createdAt`, `sampleTradeIds`, `conclusion`, `counterEvidence`, `limitations`.

No implementar estos nombres hasta verificar cómo la aplicación organiza documentos y colecciones, y hasta confirmar que las reglas RLS permiten el aislamiento esperado.

## Entrega 5 — calidad y pruebas

Añadir pruebas Playwright para:

1. ESTUDIO se abre sin errores y mantiene la política CSP.
2. Un trade semilla aparece exactamente una vez.
3. Filtrar por instrumento, fecha, dirección y setup produce el conjunto esperado.
4. Cambiar un trade en FUTUROS se refleja al refrescar/consultar ESTUDIO sin crear una copia.
5. Las operaciones con campos opcionales ausentes no producen `NaN`, errores ni valores fabricados.
6. Las métricas coinciden con resultados conocidos de QuantEngine.
7. Guardar, editar y borrar una nota no modifica el trade base.
8. Dos versiones concurrentes de una nota generan el flujo de conflicto existente.
9. Datos de usuarios distintos no se mezclan; comprobar RLS y rutas de capturas.
10. Los estados vacíos, errores y filtros funcionan en escritorio y viewport móvil.
11. `npm run bundle`, `npm test`, `npm run audit:security` y `npm run compuerta` pasan antes de integrar.

## Orden de trabajo

1. Trazar el renderer actual de ESTUDIO, funciones de selección/lectura de FUTUROS y API de `state.db`.
2. Implementar Trade Explorer reutilizando esas APIs.
3. Añadir review independiente y persistencia versionada.
4. Integrar las métricas con QuantEngine.
5. Añadir research de hipótesis.
6. Ejecutar suite completa, inspección visual y revisar el diff antes de merge.

## Criterios de aceptación

- No se crea un segundo journal de trades.
- Ninguna cifra se inventa ni se recalcula fuera del motor.
- Los datos de estudio persisten y se sincronizan mediante el backend actual.
- No se debilitan CSP, RLS, autenticación ni las reglas de conflicto.
- La suite existente y las nuevas pruebas pasan.
- Se entrega una URL de preview o, tras merge y CI verde, la URL de producción verificada.

## Estado de implementación — rama `feat/estudio-trades-lab`

Implementado en la rama, pendiente de CI y revisión antes de integrar:

- Trade Explorer lee operaciones desde `FUT.trades()` y nombres de cuenta desde `FUT.accounts()`.
- Filtro por cuenta y búsqueda textual por ID, instrumento, dirección, fecha y cuenta.
- Ficha de operación con los campos disponibles `entry`, `stop`, `exit`, `qty`, `pnlEff` y `rReal`.
- Revisión separada por `tradeId`, persistida en la colección existente `research`; no modifica el trade base.
- Resumen de operaciones filtradas: cantidad, win rate sobre operaciones con P&L disponible, suma de `pnlEff` disponible y R promedio sobre valores disponibles. Los campos faltantes se excluyen de sus denominadores y aparecen como no disponibles cuando no hay muestra.
- Pruebas Playwright para selección, búsqueda, persistencia de revisión, no duplicación de trades, estado vacío y valores de resumen.

Todavía no están implementados todos los filtros ni los análisis avanzados enumerados en las entregas futuras. El resumen de métricas es descriptivo y no demuestra ventaja estadística. Esta rama no está publicada en producción; no integrar hasta revisar la suite completa y los controles de calidad.
