# Migración Cabina × Bitácora

Bitácora es la referencia de navegación y de presentación. Cabina sigue siendo el registro, el motor y la nube. No hay una segunda colección de operaciones ni un segundo cálculo de P&L.

## Arquitectura

- Operaciones, filtros de cuenta, setup, símbolo, fechas y sesión salen de `FUT.filtered`. El P&L de esas pantallas es `pnlEff`.
- Estadísticas sigue siendo la pestaña `edge` y su catálogo. El histograma nuevo lee `CabinaBridge.edgeSeries`, que es `mxNeto`. Puede diferir de `pnlEff` cuando esa pestaña descuenta una comisión de referencia. No se igualan en silencio.
- El diario vive en `settings.meta.diario` y viaja con la configuración que ya se guarda. Una nota de tesis se muestra en solo lectura; no se copia.
- Las versiones de una estrategia son playbooks de futuros unidos por `parentId`. Cada versión cuenta solo las operaciones con su `setupId`. Menos de 30 no certifica estabilidad.
- Los enlaces entre módulos son la query de la URL más el hash. `showTab` conserva la query. `#rendimiento` abre Analítica. `#estadisticas` abre Estadísticas. `#journal` sigue abriendo la sesión de Futuros.
- Cuenta, setup y fechas de Estadísticas se escriben en esa misma query. Al abrir Estadísticas se leen de la URL, y «Ver operaciones» abre Operaciones con el mismo recorte.

## Navegación

| Grupo | Destinos |
|---|---|
| Operar | Inicio, Operaciones, Calendario, Diario, Futuros |
| Analizar | Analítica, Estadísticas, Correlaciones, Insights, Historial |
| Desarrollar | Estudio, Estrategias |
| Capital | Cuentas, Inversiones |
| Herramientas | Oportunidades, Calculadora |
| Sistema | Ajustes, y en el pie Perfil y el estado de guardado |

Futuros sigue siendo el cockpit de la sesión, los fills y el importador CSV. Historial sigue siendo el archivo de futuros e inversiones. Los dos abren el único editor, `openTrade`.

## Matriz

| Funcionalidad | Proyecto | Ubicación anterior | Destino | Fuente | Dueño | Acción | Depende de | Prueba |
|---|---|---|---|---|---|---|---|---|
| Registro y edición de trades | Cabina | `openTrade`, Futuros, Historial | Operaciones enlaza; el editor no se mueve | `trades` | Operaciones | Fusionar la consulta, conservar el editor | FUT, importador, capturas | atlas-ui, humo |
| Tabla, filtros, selección, CSV | Bitácora + Historial | Historial `#hsExport` | Operaciones | `FUT.filtered` | Operaciones | Adaptar. Un solo `tablaCsv` | `HS_CSV`, `descarga` | atlas-ui |
| Importar CSV | Cabina | `#panelImportar` en Futuros | Operaciones abre ese panel | `trades` | Operaciones | Mantener una implementación | `setFtView("diario")` | atlas-ui |
| Copia de seguridad | Cabina | Ajustes `#panelDatos` | Operaciones abre Ajustes | settings y colecciones | Ajustes | Mantener | Supabase o local | atlas-ui |
| Curva y cortes de P&L | Bitácora Analítica; Cabina Rendimiento | pestaña `edge` mezclaba gráficos y catálogo | Analítica | `pnlEff` | Analítica | Mover los gráficos | `FUT.filtered` | atlas-ui |
| Catálogo de métricas | Cabina | `edge` / `EST` | Estadísticas | QuantEngine y `mxNeto` | Estadísticas | Mantener el catálogo; añadir histograma de la misma serie | `renderEdge` | estadisticas, atlas-ui |
| Correlación y segmentos | Bitácora | no existía en Cabina | Correlaciones | filas ya calculadas | Correlaciones | Añadir. Pearson nulo si hay menos de 3 pares o no hay variación | `excursionDeOperacion` para MAE/MFE | atlas, atlas-ui |
| Patrones | Bitácora | no existía | Insights | las mismas filas | Insights | Añadir con umbrales fijos. Sin emoción no hay FOMO | diario y etiquetas reales | atlas, atlas-ui |
| Diario emocional | Bitácora; notas de tesis en Cabina | tesis `diario[]` | Diario | `settings.meta.diario` | Diario | Añadir el registro. Tesis solo se lee | `persistSettings` | atlas-ui |
| Revisión técnica | Cabina | Estudio | Estudio | reviews y capturas | Estudio | Mantener. El diario puede traer una lección y deja la procedencia | `estudioCargarReview` | estudio |
| Estrategias y versiones | Cabina; laboratorio de Bitácora | playbooks | Estrategias | playbooks + trades por `setupId` | Estrategias | Adaptar el resumen. No se porta el almacén `bitacora_strategy_lab_v1` | `parentId`, `version` | atlas (reglas puras de muestra) |
| Cuentas, reglas, payouts, autopsia | Cabina; tarjetas de Bitácora | Cuentas | Cuentas | `settings.accounts`, ledger, `FUT.economia` | Cuentas | Conservar la administración. El resumen nuevo no sustituye el editor | `cicloDe` | atlas-ui, cuentas |
| Inversiones | Cabina | Inversiones | Inversiones | posiciones | Inversiones | Mantener | — | humo |
| Calendario mensual | Bitácora; calendario de sesión en Futuros | `#cal` de Futuros | Calendario | `pnlEff` por día | Calendario | Añadir el mes. El de Futuros se queda porque la sesión y el importador lo usan | `openSession` | navegación |
| Inicio | Cabina Resumen | Cabina | Inicio | `FUT` y reglas | Inicio | Añadir un resumen corto encima del cockpit | `evaluateRules` | humo |
| Apariencia | Cabina | Ajustes | Ajustes | `cabina-appearance:v1` | Ajustes | Adaptar tokens. Fondo `#FAF8F4`. Tinta `#127A4B` / `#B8382C` | contraste AA | apariencia, diseno-sistema, contraste |
| Auth, RLS, sincronización, PWA | Cabina | app.js, sw.js | igual | `cabina_docs`, bucket `capturas` | la app | Mantener. `atlas.js` entra en el casco `cabina-v5` | CSP `script-src 'self'` | seguridad, pwa |

## Duplicados que no se crearon

- No hay otro `fetch`, otro editor ni otro importador.
- No se copiaron operaciones de Bitácora.
- No se codifican emociones ni calidades como números para correlacionarlas.
- Las sesiones siguen siendo las de Cabina en hora de Nueva York, no los cubos UTC de Bitácora.
- La vista Research de Bitácora no tenía métricas reales y no se portó.

## Lo que queda a la vista a propósito

Futuros conserva su calendario de sesión y su subvista «diario» de trabajo. Historial conserva el archivo cruzado. Los dos llaman a `openTrade`. Quitarlos rompería el importador, las revisiones y las pruebas de la sesión.
