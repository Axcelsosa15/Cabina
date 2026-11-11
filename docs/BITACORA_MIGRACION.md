# Cabina × Bitácora — inventario y matriz de migración

Bitácora es la referencia visual y funcional. Cabina sigue siendo la única
fuente de datos: QuantEngine, `coll()`, Supabase, RLS y `FUT.filtered`.

## Arquitectura resultante

| Contrato | Dueño | Consumidores |
|---|---|---|
| Operaciones | `coll("trades")` + `FUT` / `tradeFiltro` | Operaciones, Analítica, Estadísticas, Correlaciones, Insights, Diario, Cuentas, Estudio, Estrategias |
| P&L y catálogo | `tradeCalc` → `mxCalc` / `EST` / `futStats` | Analítica, Estadísticas, Inicio, Cuentas |
| Agrupación y Pearson | `labs.js` (`CabinaLabs`) sobre filas ya valoradas | Analítica, Correlaciones, Insights, Estrategias |
| Diario emocional | `coll("journal")` | Diario, Calendario, Insights (disciplina) |
| Cuentas prop | `state.settings.accounts` + FUT | Cuentas, Operaciones, Analítica |
| Estudio técnico | `coll("research")` | Estudio |
| Estrategias | `coll("playbooks")` | Estrategias, Operaciones, Analítica |

No hay un segundo motor de P&L ni un backend de Bitácora.

## Navegación

| Tab | `data-tab` | Grupo | Alias de hash |
|---|---|---|---|
| Inicio | `cabina` | Operar | |
| Operaciones | `futuros` | Operar | `operaciones`, `journal` |
| Calendario | `calendario` | Operar | |
| Diario | `diario` | Operar | |
| Analítica | `edge` | Analizar | `analitica`, `rendimiento`, `analytics` |
| Estadísticas | `estadisticas` | Analizar | `stats` |
| Correlaciones | `correlaciones` | Analizar | |
| Insights | `insights` | Analizar | |
| Historial | `historial` | Analizar | |
| Estudio | `estudio` | Desarrollar | |
| Estrategias | `playbook` | Desarrollar | |
| Cuentas | `cuentas` | Capital | |
| Inversiones | `invest` | Capital | |
| Oportunidades | `ideas` | Herramientas | |
| Calculadora | `calc` | Herramientas | |
| Ajustes | `ajustes` | Sistema | |

## Matriz funcional

| Funcionalidad | Proyecto | Ubicación previa | Destino | Fuente | Responsable | Acción | Dependencias | Cobertura |
|---|---|---|---|---|---|---|---|---|
| Tabla de trades | ambos | Cabina Futuros / Bitácora Journal | Operaciones | `coll("trades")` | `renderFutures` + `tradeFiltro` | fusionar | filtros, import, fills | `filtros`, `importar`, `bitacora-labs` |
| Filtros combinables | ambos | Futuros + Edge | Operaciones (canónico) | `ftSpec` / `FUT.filtered` | `tradeFiltro` | ampliar (result/quality/tag/ids) | Analítica, Insights | `filtros`, `labs` |
| Import/export CSV | Cabina | Futuros | Operaciones | importer existente | `renderImportar` | mantener | historial | `importar`, `csv` |
| Equity + desgloses | Bitácora Analítica + Cabina Edge | Rendimiento | Analítica | `mxCalc` + `analyticsGroups` | `renderEdge` / `renderMxAnalytics` | adaptar | filtros | `estadisticas`, `labs` |
| Catálogo de métricas | Cabina EST | Edge | Estadísticas (+ detalle en Analítica) | `mxCalc` / `EST` | `renderEstadisticas` | mover host | mismos `c` | `estadisticas` |
| Pearson y contextos | Bitácora | Correlaciones | Correlaciones | `CabinaLabs` | `renderCorrelaciones` | adaptar | operaciones valoradas | `labs`, `bitacora-labs` |
| Patrones | Bitácora | Insights | Insights | `computeInsights` | `renderInsights` | adaptar; no inventa FOMO | ids de evidencia | `labs` |
| Diario emocional | Bitácora | Journal | Diario | `coll("journal")` | `renderDiario` | nuevo; no pisa days/ | Estudio, Calendario | `bitacora-labs` |
| Calendario mensual | ambos | Futuros / Cabina | Calendario | `paintCalendar` / `dayMap` | `renderLabCalendar` | reutilizar pintor | Operaciones, Diario | `bitacora-labs` |
| Cuentas prop | Cabina | Cuentas | Cuentas | FUT + reglas | `renderCuentas` | mantener | Operaciones | `cuentas`, `prop` |
| Estabilidad de estrategias | Bitácora | Strategy Lab | Estrategias | `strategyMetrics` | `renderStrategyStability` | adaptar | playbooks + trades | `labs` |
| Estudio técnico | Cabina | Estudio | Estudio | `research` | `renderEstudio` | mantener + enlaces | Diario, Operaciones | `estudio` |
| Inicio KPIs | Bitácora dashboard | Cabina | Inicio | `futStats` / `mxCalc` | `renderCabKpis` | adaptar | mes + cuenta | `bitacora-labs` |
| Apariencia Bitácora | Bitácora | CSS | tokens claros | `#FAF8F4` `#16915B` `#D6483B` Geist | `appearance.js` + capa clara | fusionar | light/dark | `diseno-sistema`, `apariencia` |

## Traslados desde tabs antiguos

- Futuros → se llama Operaciones; abre en la tabla (Todas / Ganadoras / Perdedoras + CSV). El resumen cuantitativo queda a un clic.
- Rendimiento → Analítica. El catálogo profundo vive en Estadísticas; Edge conserva curva, tamaño y ruina.
- Historial permanece como consulta unificada, no como segundo editor.
- Diario de sesión de Futuros (subvista) sigue para el día operativo; el tab Diario guarda emoción y lecciones.
- Móvil · dock primario: Inicio · Operaciones · Analítica · Diario · Más. Estudio queda en «Más» (Desarrollar).

## Duplicaciones evitadas

- Un solo `tradeFiltro` / `FUT.filtered`.
- Un solo `mxCalc` / `EST` para estadísticas.
- `CabinaLabs` no recalcula P&L.
- Un editor de fichas (`openEditor`) para el Diario.
- Sin segundo backend ni copia de datos de Bitácora.

## Enlaces entre módulos

`goTo(tab, { date, account, setup, trade, ids, view })` escribe hash estable.

- Insights / Correlaciones → Operaciones (`ids`)
- Calendario / Diario → Operaciones, Estudio
- Cuentas → Operaciones (`account`)
- `#operaciones` y `#rendimiento` redirigen

## Limitaciones pendientes

- Analítica abre en curva + desglose. Tamaño y ruina viven en un disclosure;
  no hay una segunda página de Rendimiento.
- Inicio muestra KPIs, curva y recientes; cuentas/pre-sesión van en un
  disclosure. No se copió el dashboard de Bitácora entero.
- Cuentas fusiona caja/payouts/«sin dato» de Bitácora sobre el motor prop de
  Cabina. La UI de tarjetas no es un clon pixel a pixel.
- Diario usa `coll("journal")`. Las notas de sesión de Operaciones se listan
  en solo lectura; no se copian al journal emocional hasta que el usuario
  escribe una entrada.
- MAE/MFE y emoción correlacionan sólo si el trade las trae. La semilla de
  Cabina no rellena MAE/MFE: se muestra «sin variación».
- Bitácora exige login: las capturas comparativas usan su pantalla de acceso
  (misma paleta) y Cabina con la semilla local. No se copian datos de Bitácora.
- El tema oscuro V2 (midnight/navy/forest) se conserva; el overlay Bitácora
  aplica al tema claro.
