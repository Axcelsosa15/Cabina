# Ideas de Liquid Journal adaptadas a Cabina · 2026-11-13

## Alcance
Referencia: capturas de la página de planes de Liquid Journal proporcionadas por el usuario.
Objetivo: mejorar la toma de decisiones; no clonar su estética, textos, precios ni código.
No crear otro journal, motor monetario, ni duplicar Analítica / Insights / ESTUDIO.

## Inventario según el repositorio al abrir esta rama

**Ya existe**: dashboard y estadísticas, scoring de disciplina 0–100,
clasificación de errores, cuentas de prop firm/versiones/payouts, sesiones,
Insights con patrones de overtrading/revenge/FOMO, revisiones y capturas en ESTUDIO.

**Primer incremento aquí**: Insights de deterioro por orden intradía de operaciones.

### Deterioro desde la tercera operación (implementado en rama)
- Entrada: mismas filas netas que reciben los Insights existentes.
- Para cada fecha con al menos 3 operaciones, ordenar por hora de entrada.
- Excluir la fecha completa si hay hora inválida, empate temporal, ID
  duplicado, operación abierta o P&L desconocido; no se infiere el orden.
- Comparar P&L medio de operaciones 1–2 contra operaciones 3+ en la misma fecha,
  ponderando cada jornada una sola vez.
- Exigir al menos 8 jornadas comparables; deterioro en el 60 % o más,
  P&L promedio tardío negativo y una diferencia relevante.
- Mostrar muestra y IDs de operaciones que sustentan la señal.
- Solo informar asociación, sin causalidad, sin desactivar trades ni ejecutar órdenes.
- No cambia QuantEngine, contratos de firma, autenticación, RLS, persistencia,
  importador ni escrituras. La alerta es derivada, no se guarda.

Prueba: test/labs.mjs contiene casos positivos, sin muestra, horas ausentes,
entradas abiertas, empate temporal, ID duplicado, ausencia de señal y no mutación.
El cambio usa el renderer de Insights existente; queda pendiente confirmar en
CI y navegador antes de integrar a main.

## Próximos incrementos propuestos

### P1 · Coach de disciplina explicable
- Reutilizar CabinaDiscipline.scoreTrade y CabinaLabs.computeInsights,
  sin LLM para construir hechos, métricas o certeza.
- Pantalla «Qué corregir antes de tu próxima sesión»: máximo 3 conclusiones,
  cada una con período, muestra, fuente y enlace a trades relacionados.
- Analizar dependencia de cantidad de trades, horario, resultado post-pérdida
  y calidad del proceso; no duplicar las tarjetas existentes.
- Permitir descartar recomendaciones; sin notificaciones urgentes por defecto.
- Si se añade un LLM, es capa de redacción opcional, con consentimiento,
  control de gastos y sin exponer tokens, notas privadas ni nombres de cuentas.

### P2 · EMA Playbook medible
- Setup configurable 10/20/100/200, sin imponerlo como estrategia ganadora.
- Captura contemporánea de alineación 10 vs 20, 100 vs 200, ubicación
  del precio, timeframe, sesión, trigger, invalidación y riesgo.
- Campos opcionales y versionados; datos históricos sin snapshot quedan
  «desconocido». No inferir EMA a partir del resultado del trade.
- Comparar expectancy, PF y dispersión por estado, solo con muestra suficiente;
  usar siempre el mismo QuantEngine neto. Pruebas de no leakage.
- Flujo: trade real → review ESTUDIO → caso Playbook → hipótesis.

### P3 · Recap mensual de proceso y prop firms
- Un resumen mensual con disciplina, muestras, tres hallazgos y lecciones.
- Reutilizar ledger de payouts, fees y reglas versionadas; mostrar UNKNOWN
  si faltan datos para calcular el neto real.
- No editar contratos históricos por actualizar reglas de una firma.
- Enlace al origen de cada dato; exportación voluntaria y privada.

## No priorizar
- Fondos 3D, botones especiales, crews, rankings, insignias sociales y
  vídeos para presumir payouts.
- Copy-trading y broker sync sin integración autorizada, conciliación
  de ejecuciones, pruebas y estrategia de recuperación.
- Señales de inversión del AI Coach o bloqueo automático basado en correlaciones.

## Puerta antes del merge
1. node test/labs.mjs verde.
2. npm run compuerta verde y no regresión de UI, importador, datos ni seguridad.
3. Revisar fechas/hora de Nueva York, cuentas múltiples, operaciones sin hora.
4. Inspeccionar Insights con y sin señal.
5. No desplegar el PR hasta pasar la compuerta.
