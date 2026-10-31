# Cabina 2.0 · Reorganización funcional y rediseño UX

Fecha: 2026-10-30 · propuesta de evolución basada en el repositorio real.
Estado: **plan + primer incremento de validación del editor**. El mapa no equivale a una migración ni a una certificación visual.

## Objetivo verificable

Cabina debe responder en tres gestos a tres preguntas:

1. **¿Qué debo hacer hoy?** Contexto de sesión, reglas, cuentas activas y entrada rápida.
2. **¿Qué pasó con mi ejecución?** Operaciones, resultados netos, riesgo y causas.
3. **¿Mi estrategia es estable?** Muestra, expectancy, drawdown, dispersión, consistencia y cambios de régimen, con límites de interpretación.

No se añade una métrica que duplique QuantEngine ni una fuente paralela de operaciones.

## Navegación actual, preservada durante la migración

La aplicación tiene once rutas `data-tab`, sin router externo. La primera
iteración reorganiza **accesos**, no identificadores de rutas ni documentos.

| Grupo futuro (navegación, no nuevo backend) | Ruta actual | Propósito principal | Acción primaria |
|---|---|---|---|
| Operar | `cabina` | Sesión del día, condiciones, reglas y estado de cuentas | Registrar operación |
| Operar | `futuros` | Journal y operaciones de futuros | Nuevo trade / importar |
| Operar | `cuentas` | Ciclo de vida de cuentas prop, payouts, resets | Gestionar cuenta |
| Analizar | `historial` | Registro unificado de futuros e inversiones | Filtrar / revisar |
| Analizar | `edge` | Expectancy, edge, DD y estadísticas | Comparar selección |
| Mejorar | `playbook` | Setups y criterios repetibles | Revisar setup |
| Mejorar | `estudio` | Investigación, revisiones, evidencias | Abrir estudio |
| Portafolio | `invest` | Posiciones, cuentas de inversión y cash flows | Registrar movimiento |
| Herramientas | `calc` | Herramientas de cálculo | Calcular |
| Herramientas | `ideas` | Ideas y formas de generar ingresos | Registrar idea |
| Sistema | `ajustes` | Apariencia, datos, backups, preferencias | Configurar |

### Reglas de navegación

- Escritorio: navegación visible por **grupos funcionales** y con una acción primaria por pantalla. No convertir las once rutas en once paneles simultáneos.
- Móvil: conservar los identificadores de rutas y el menú «Más» hasta que el sucesor haya pasado sus pruebas; las tareas del día deben estar a un gesto y los controles a al menos 44 px.
- Se puede renombrar el texto de una pestaña sin cambiar su `data-tab`, hash, filtros, historiales ni referencias internas.
- Separar la **búsqueda global** del registro de operaciones: buscar nunca escribe datos ni activa acciones destructivas.
- El usuario debe poder ocultar módulos y columnas sin alterar el dato subyacente. Mantener el sistema actual de preferencias hasta documentar los cambios.

## Jerarquía del contenido

**Nivel 1: decisión.** Cabecera compacta con contexto (fecha, cuenta, sesión), acción principal y 3–5 cifras relevantes, siempre con unidades y fuente.

**Nivel 2: explicación.** Tablas, filtros de periodo/cuenta/setup/símbolo, desglose neto, comparación y detalles expandibles.

**Nivel 3: configuración.** Campos avanzados, contratos de firma, revisiones y opciones menos frecuentes se agrupan en secciones plegables. No se eliminan datos por estar ocultos.

En todo formulario: título estable, labels siempre visibles, input claro en tema claro, validación persistente, error a nivel de campo donde se conoce su origen, estado de guardado real y cancelación controlada.

## Flujos prioritarios

### A. Registrar trade
1. Elegir fecha, cuenta y símbolo; los campos ya conocidos se prefieren sin inventar valores ausentes.
2. Plan y riesgo usando **la misma función** del motor; no calcular una segunda cifra en la vista.
3. Resultado y revisión opcional, sin exigir datos retrospectivos que no existen.
4. Guardar, mostrar el estado de persistencia y reflejar operación en Historial y Métricas, sin doble contabilización.

**Aceptación:** rechazo de cantidad <= 0 cuando mueve unidades, dividendo sin cantidad permitido, dos cuentas sin asignación incorrecta y error ligado al campo.

### B. Hoy / múltiples cuentas
Lista por cuenta y operaciones del día; el botón «Registrar» hereda la cuenta elegida. Cuenta visible en cada fila, filtro por cuenta y resumen consolidado separado del resultado individual.

**Aceptación:** no confundir IDs de cuentas prop con cuentas de inversión, no duplicar transacciones y no cambiar reglas de la sesión.

### C. Importar CSV
Fases claras: origen → mapeo → cuenta destino → preview → confirmación → resultado/deshacer.
Ante ambigüedad, bloquear o solicitar confirmación; nunca importar en silencio. Registrar diferencias de broker frente a motor sin inventar comisiones.

### D. Estabilidad de estrategia
Una vista comparativa por setup y cuenta: muestra, expectancy neta, win rate, profit factor, dispersión, drawdown, rachas y estabilidad por ventanas. Presentar **insuficiente muestra** y periodos sin datos antes que un 0 o una conclusión injustificada.

### E. Cuentas
Identidad → límites → estado/objetivos → reglas de la firma → historial de payouts/resets → autopsia (sólo para quemadas). Conservar reglas versionadas por vigencia.

## Design system: Concepto A

- `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--line`, `--control-border`: roles claros.
- `--accent` para acción y foco; profit, loss y warning nunca reutilizados como fondo genérico.
- Todos los controles: default, hover, focus, invalid, readonly, disabled, loading. Medir color computado en tema claro, oscuro y acento personalizado.
- Evitar nuevas capas `!important` y un sexto bloque `<style>`. Resolver deuda de compatibilidad `@scope` antes de declarar soporte universal en móviles.
- Motion breve sólo cuando aclara jerarquía, con `prefers-reduced-motion` respetado.
- No forzar un framework: la SPA existente y su paquete de pruebas son la base.

## Incrementos y compuertas

| Iteración | Entregable | Prueba de salida |
|---|---|---|
| 1 · En curso | Error persistente en editor genérico, vínculo accesible y foco del campo | Nuevo test de navegador + regresión CSV/trade |
| 2 | Mapa de navegación, títulos, iconografía, búsqueda y menú móvil consistentes | Once rutas, hashes, focus, navegación con teclado |
| 3 | Formularios de operación, cuenta e inversión organizados por intención | Guardado, datos ausentes, múltiples cuentas, CSV |
| 4 | Dashboard operativo y sesión del día en móvil | Flujo real a 320/390/430 px, sin overflow |
| 5 | Estadísticas y análisis por estabilidad de setup | Cifras idénticas a QuantEngine y exportaciones |
| 6 | Consolidación gradual de CSS y QA visual | Contraste claro/oscuro, variaciones del sistema, screenshot review |

**Release gate:** no mezclar refactor de motor o base con cambios UX; PRs pequeños;
`npm run compuerta` sin FAIL y CI verde antes de merge, luego verificar
despliegue y comportamientos reales. Los permisos RLS y la sincronización
Supabase necesitan evidencias propias. No proclamar producción por código en la rama.
