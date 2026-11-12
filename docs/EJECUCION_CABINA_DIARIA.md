# Cabina de uso diario · documento de ejecución

Iniciado el 2026-11-12 · rama `claude/compassionate-planck-bw46dz`.
Estados: **PENDIENTE · EN CURSO · IMPLEMENTADO · VERIFICADO · BLOQUEADO**.
«Implementado» no es «verificado»: verificado exige una prueba que corrió y pasó.

## 1 · Alcance de esta entrega

El flujo **abrir → verificar datos → preparar → registrar → revisar → cerrar** del
tab Cabina, sobre los sistemas que ya existían. No incluye ejecución de órdenes:
nada de lo de aquí bloquea un bróker, y la interfaz lo dice.

Entregado: B0 (inventario y línea base), B3 (sesión y versiones del plan), la parte
de B4 que es la barra de sesión, la parte de B5 que son los días de descanso, la
parte de B8 que es el diagnóstico, y cobertura nueva de B7 (T16/T17).
**No entregado**: ver §7. Esto no es el encargo completo y no se declara como tal.

## 2 · Línea base (B0)

`npm test` sobre `c302b1a`, antes de tocar nada: **128/128 archivos en verde,
3.831 aserciones, 1.359 s**. No había pruebas rojas que heredar.

Lo que la inspección encontró roto o ausente, con reproducción:

| # | Fallo | Reproducción (código anterior) | Impacto | Evidencia | Estado |
|---|---|---|---|---|---|
| F1 | La sesión era un booleano. Reabrir borraba el cierre | Cerrar el día, pulsar «Reabrir»: `days/<hoy>.closed` vuelve a `false`, sin motivo y sin rastro de que estuvo cerrado | No se puede saber si un día se reabrió para operar más; el «cierre» no cierra nada | `app.js` (antes): `$("jReopen")… state.day.closed = false` | VERIFICADO (`sesion-flujo` T24) |
| F2 | Alcanzar la pérdida máxima no dejaba estado | Registrar pérdidas ≥ tope: `tradeGate` pinta «⚠». Subir la regla en Reglas duras: el aviso desaparece | Un cambio informal de configuración borra el incumplimiento | `tradeGate()` lee `reglaDe()` en vivo; nada se guarda | VERIFICADO (`sesion-flujo` T09) |
| F3 | No existía pausa de sesión | — (`session-break.js` es un recordatorio de descanso por tiempo de pantalla, otra cosa) | Sin motivo ni condición de reanudación | — | VERIFICADO (`sesion-modelo`, `sesion-flujo`) |
| F4 | El plan no se versionaba | Cambiar una regla a media sesión cambiaba cómo se juzgaba el día entero | El historial no conserva con qué plan se operó | sólo `processRules` por operación, y sólo contratos/instrumentos/ventana | VERIFICADO (T08) |
| F5 | Una sesión abierta al cambiar la fecha ET quedaba huérfana | `tickClock`: al cambiar `etNow().date` carga un día nuevo; el anterior queda sin cerrar para siempre | La sesión nocturna pierde su identidad | `app.js` `tickClock` → `loadDay()` | VERIFICADO en parte (ver §7, T11) |
| F6 | Las rachas trataban sábado y domingo como únicos descansos | Ventana de lunes a jueves, viernes sin operar: la racha se rompe | Incumplimiento ficticio en un día de descanso propio | `discipline.js` (antes): `[0, 6].includes(weekday(…))` | VERIFICADO (`disciplina-modelo` T10) |
| F7 | Cerrar un día sin operar exigía escribir un resultado | «Cerrar sesión de hoy» sin resultado: «escribe el resultado antes de cerrar» | No operar no se podía registrar como decisión salvo por el botón «sin edge» | `app.js` (antes): `$("jClose")` | VERIFICADO (T23) |
| F8 | No había diagnóstico exportable | — | Pedir ayuda obligaba a mandar el respaldo entero | — | VERIFICADO (`diagnostico`) |
| F9 | El README negaba la cola offline y decía que el script era inline | Leer README frente a `test/cola.mjs` y la CSP de `index.html` | Documentación que contradice el código | README | corregido (texto) |

## 3 · Matriz de estado

| Sistema | Estado | Base |
|---|---|---|
| QuantEngine, un solo cálculo por magnitud | EXISTE Y VERIFICADO | `motor-quant`, `capa2`, `equivalencia`, `edge` |
| Una sola selección de operaciones (`FUT.filtered`) para resumen, tabla y CSV | EXISTE Y VERIFICADO | `filtros`, `unificado`, `estadisticas` |
| Persistencia local, con JSON corrupto que no se sustituye por vacío | EXISTE Y VERIFICADO | `local-corrupto`, `guardado` |
| Persistencia en Supabase, lectura fallida ≠ colección vacía | EXISTE Y VERIFICADO **contra el doble** | `outage-recovery`, `recarga-recuperacion`, `hidratacion-segura` |
| Cola de escrituras: por usuario, durable, espera creciente, condicionada por versión | EXISTE Y VERIFICADO **contra el doble** | `cola`, `cola-recarga-conflicto` |
| Conflictos: se enseñan las dos versiones, no se elige | EXISTE Y VERIFICADO **contra el doble** | `conflicto`, `conflicto-decision` |
| Reconciliación de un timeout tras una escritura que sí entró | EXISTE SIN VERIFICAR | el reintento va con `versionBase`; no vi una prueba que corte la respuesta después de escribir |
| RLS y aislamiento en el proyecto Supabase real | **UNKNOWN** | el conector de Supabase no conectó en esta sesión (`ERR_PROXY_TUNNEL`); `db.mjs` lo prueba en Postgres local |
| Contrato de la firma versionado por vigencia | EXISTE Y VERIFICADO | `versiones`, `prop` |
| Disciplina separada del P&L, desconocido ≠ incumplido ≠ no aplicable | EXISTE Y VERIFICADO | `disciplina-modelo`, `disciplina-franjas` |
| Días de descanso según el calendario del usuario | FALLABA → VERIFICADO | F6 |
| Sesión como estado explícito con transiciones | FALTABA → VERIFICADO | `sesion-modelo`, `sesion-flujo` |
| Plan versionado al iniciar | FALTABA → VERIFICADO | T08 |
| Límite alcanzado que persiste | FALLABA → VERIFICADO | T09 |
| Cierre y reapertura con historial | FALLABA → VERIFICADO | T24 |
| Cabecera estable: cuenta, fecha operativa, sesión, datos, guardado | FALTABA → VERIFICADO | `sesion-flujo` |
| Distribución de paneles: mover, redimensionar, guardar, cancelar, restablecer | EXISTE Y VERIFICADO | `resumen-cuadricula`, `resumen-distribucion`, `layout-datos` |
| La distribución no toca datos; rota no tumba el arranque | EXISTE Y VERIFICADO (prueba nueva) | `layout-datos` |
| Distribución estable con la sesión abierta | FALTABA → VERIFICADO | `sesion-flujo` |
| Un panel nuevo en una actualización conserva la distribución guardada | **FALLA, sin corregir** | `validCanvas` exige el mismo número de paneles: la guardada no se borra pero deja de aplicarse |
| Columnas: orden, anchos, fijar | EXISTE SIN VERIFICAR | `vista-personalizable` cubre visibilidad y densidad; no audité orden ni fijado |
| Capturas: propiedad, bucket privado, referencias compartidas | EXISTE Y VERIFICADO **contra el doble** | `capturas`, `flujo-capturas-estudio`, `visor-capturas` |
| Fallo de subida de un adjunto conserva la operación | EXISTE SIN VERIFICAR | no localicé la aserción |
| Importación con vista previa, procedencia y deshacer | EXISTE Y VERIFICADO con CSV sintéticos | `mapeador`, `emparejado`, `cola-importadas` |
| Un CSV real de bróker | **UNKNOWN** | la compuerta ya lo declara así |
| Respaldo con recuento y huella, restauración con vista previa | EXISTE Y VERIFICADO | `integridad`, `importar`, `respaldo-estudio` |
| Actualización que no recarga con cambios en peligro | EXISTE Y VERIFICADO | `actualizacion` |
| Diagnóstico con exportación sin datos del diario | FALTABA → VERIFICADO | `diagnostico` |
| Trade date del bróker distinto de la fecha civil | **FALTA** | la app fecha por día civil de Nueva York; la sesión de las 18:00 ET no pasa al día siguiente como en CME |
| Vista inicial ordenada A–E | **PARCIAL** | la barra de sesión cubre A, B, C y E arriba; el resto de Cabina sigue «dashboard primero» con la operativa plegada |
| Piloto de diez sesiones planificadas | PENDIENTE | lo hace una persona; no se simula |

## 4 · Decisiones

1. **Aditivo sobre `days/<fecha>`**, sin colección nueva ni migración. Un día sin
   `sesion` se lee derivado de `closed` y leerlo no escribe.
2. **`closed` se sigue escribiendo.** Un cliente anterior a esta versión sigue
   funcionando; si cierra o reabre por su cuenta, manda `closed` y se dice.
3. **El límite se evalúa contra el plan congelado**, no contra los ajustes vivos.
   Es lo que hace que subir la regla no lo borre, sin vigilar los ajustes.
4. **El P&L no se recalcula en la sesión**: sale de `dayRuleCheck` y
   `QE.margenDePerdida`. El modelo sólo compara con el número del plan.
5. **Relajar = propuesta; reducir = versión nueva; corregir = versión marcada**.
   Con el límite alcanzado, ninguna «corrección» que afloje se acepta.
6. **`sessionRef` sólo en lo registrado a mano con sesión abierta.** Nada hacia
   atrás, nada en lo importado.
7. **La barra no es un panel de «Vista»**: no se oculta ni se mueve.
8. **El historial de eventos no es una auditoría**, y la interfaz lo dice.
9. **Días de descanso = días fuera de `window.days`.** Cambiarlos rejuzga rachas
   pasadas, igual que la ventana ya rejuzga `fuera_ventana`. Versionar la ventana
   por vigencia queda pendiente.
10. **Trabajo aislado en un worktree** mientras corría la línea base, para no
    medir un árbol a medio editar.

## 5 · Tareas

| Tarea | Depende de | Estado | Archivos |
|---|---|---|---|
| B0 inventario, reproducción, línea base | — | VERIFICADO | este documento |
| B1 contratos de identidad, datos y guardado | B0 | VERIFICADO lo existente; sin cambios | — |
| B2 recuperación, idempotencia, conflictos | B0 | VERIFICADO lo existente contra el doble; timeout-tras-éxito SIN VERIFICAR | — |
| B3 sesión y versiones del plan | B0 | VERIFICADO | `session-state.js`, `app.js`, `test/sesion-modelo.mjs` |
| B4 flujo vertical de Cabina | B3 | PARCIAL · barra VERIFICADA, reordenación del resto PENDIENTE | `index.html`, `app.js`, `test/sesion-flujo.mjs` |
| B5 calendario y disciplina | B3 | PARCIAL · descansos VERIFICADO; trade date del bróker y DST de sesión PENDIENTE | `discipline.js`, `test/disciplina-modelo.mjs` |
| B6 componentes y accesibilidad | B4 | PARCIAL · la barra: teclado, foco, Escape, 390 px VERIFICADO; auditoría del resto PENDIENTE | — |
| B7 paneles y columnas | — | PARCIAL · T16/T17 VERIFICADO; panel nuevo vs. guardada FALLA; columnas SIN VERIFICAR | `test/layout-datos.mjs` |
| B8 backups, actualización, diagnóstico | — | PARCIAL · diagnóstico VERIFICADO; backup en entorno limpio de punta a punta PENDIENTE | `app.js`, `index.html`, `test/diagnostico.mjs` |
| B9 pruebas integrales | todo | EN CURSO · tabla §6 | — |
| B10 piloto de diez sesiones | B9 | PENDIENTE (humano) | — |
| B11 otros tabs | B10 | PENDIENTE | — |

## 6 · Casos T01–T24

Resultado de la última corrida completa: ver §8. «Doble» = `test/nube-doble.mjs`,
no el proyecto real.

| Caso | Preparación · acción | Esperado | Obtenido · evidencia | Resultado |
|---|---|---|---|---|
| T01 doble clic al guardar | registro rápido disparado dos veces | una operación | `editor-abort-guard` | PASS |
| T02 timeout y reintento | escritura sin red, vuelve la red | sin duplicado | `cola`: la cola sale sólo con éxito confirmado y reintenta con la versión leída. **No hay prueba de timeout DESPUÉS de una escritura que entró** | UNKNOWN |
| T03 recarga sin red | editar sin red, cerrar y abrir | pendiente recuperado | `cola`: «tras cerrar y volver a abrir, el cambio SIGUE en la cola», en IndexedDB | PASS (doble) |
| T04 edición concurrente | otro dispositivo escribe antes | conflicto con las dos versiones | `conflicto`, `conflicto-decision`, `cola-recarga-conflicto` | PASS (doble) |
| T05 lectura fallida o JSON incompatible | 503 / JSON local roto | el historial no se vacía | `outage-recovery`, `local-corrupto`, `recarga-recuperacion` | PASS |
| T06 cambio de usuario con cola | A deja pendiente, entra B | sin fuga ni escritura cruzada | `cola`: «B NO tiene la operación de A… lo de A sigue guardado» | PASS (doble) |
| T07 cambio de cuenta con algo abierto | sesión iniciada en una cuenta, cambiar el filtro | el destino no cambia | `sesion-flujo`: la cuenta de la sesión sigue siendo la del plan; `orden` para el registro rápido. El editor completo con el formulario abierto no lo audité | PASS (sesión) · UNKNOWN (editor) |
| T08 cambio de reglas | ampliar y reducir el tope con la sesión abierta | plan original conservado | `sesion-flujo`, `sesion-modelo`: v1 intacta, v2 con motivo, ampliar queda en propuesta | PASS |
| T09 límite alcanzado | pérdida ≥ tope; subir la regla; registrar otra | sigue en límite; se registra | `sesion-flujo`: límite tras subir la regla a 5000 y tras recargar; segunda operación guardada con `sessionRef.estado = limite` | PASS |
| T10 descanso y calendario propio | ventana lun–jue, viernes vacío | la racha no se rompe | `disciplina-modelo` (4 casos T10) | PASS |
| T11 sesión nocturna y DST | sesión abierta al cambiar de fecha | identidad conservada | `sesion-flujo`: se cierra en SU fecha con SUS operaciones. `transicion-asia` cubre el rótulo de franja. **Sin prueba de cambio de hora ni de trade date del bróker** | PASS (parte) · UNKNOWN (DST) |
| T12 importación retrospectiva | importar un CSV | evidencia previa no inventada | `mapeador`: lo importado no se juzga como si hubiera tenido plan; y `sessionRef` no se pone en lo importado (por construcción, sin prueba propia) | PASS (CSV sintético) |
| T13 reimportación | importar dos veces | duplicados detectados | `emparejado`: «no vuelve a consumir IDs ya importados» | PASS (CSV sintético) |
| T14 envío repetido a Estudio | «Estudiar día» varias veces | sin duplicar | `estudiar-dia-cabina`: navegar no copia ni guarda trades | PASS |
| T15 captura compartida | reclasificar y borrar | propiedad y borrado correctos | `flujo-capturas-estudio`, `capturas` | PASS (doble) |
| T16 guardar/cancelar/restablecer layout | editar la distribución | sólo cambia presentación | `layout-datos`: `cabina-mnq:v1` byte a byte igual en los tres | PASS |
| T17 layout corrupto | seis variantes de preferencias rotas | arranque recuperable | `layout-datos` | PASS |
| T18 cuota agotada / auth expirada | `QuotaExceededError`; 401 | error claro, borrador protegido | `guardado` (caso A), `cuentas` («sesión caducada») | PASS |
| T19 backup en entorno limpio | exportar, navegador vacío, importar | integridad comprobada | `integridad`, `importar`, `respaldo-estudio` cubren sellos e importación; **no hay una prueba única de ida y vuelta que incluya `sesion`** | UNKNOWN |
| T20 actualización con edición activa | cambios en peligro, «Actualizar» | sin pérdida | `actualizacion`: «el primer clic NO recarga» | PASS |
| T21 filtros iguales | mismo filtro en vistas y CSV | cifras equivalentes | `filtros`, `unificado`, `capa` | PASS |
| T22 fallo de adjunto | la subida falla | trade conservado, reintento seguro | no localicé la aserción | UNKNOWN |
| T23 teclado y móvil | 390 px, sólo teclado: iniciar, pausar, reanudar, cerrar | flujo completo | `sesion-flujo`. Registrar una operación por teclado a 390 px lo cubre `rapido`, no esta prueba | PASS (sesión) |
| T24 cierre y reapertura | cerrar, reabrir con motivo, cerrar | historial conservado | `sesion-flujo`: dos cierres, dos versiones del plan, tras recargar | PASS |

**UNKNOWN críticos de persistencia o recuperación: T02, T19, y RLS real.** Según
la definición de terminado del encargo, eso impide declarar la aplicación lista
para uso diario con cuenta. Sin cuenta —datos en el navegador— no aplican T02 ni
RLS; sí T19.

## 7 · Riesgos y límites reales

- **Proyecto Supabase real sin verificar.** Todo lo de nube está probado contra
  el doble y contra Postgres local. No hay cambio de esquema en esta entrega.
- **`sesion` viaja en el documento del día** (tope 256 KB). Los eventos se
  acotan a 200; un día con decenas de planes no está acotado.
- **La detección del límite escribe sola** al repintar. Con dos dispositivos
  abiertos puede producir un conflicto de versión en `days/<hoy>`: se enseña, no
  se pierde nada, pero es ruido posible.
- **El límite cubre pérdida máxima y pérdidas seguidas del plan.** El drawdown
  de la firma sigue en la tarjeta de cuenta y no cambia el estado de sesión.
- **Cambiar `window.days` rejuzga rachas pasadas.**
- **10.000 operaciones sintéticas**: arranque 3,5–3,7 s, cambio de cuenta
  0,7–0,9 s, iniciar sesión 0,12–0,15 s. El cambio de cuenta ya costaba eso
  antes (medido en `c302b1a`: 0,8–0,9 s); no se optimizó.
- **Inglés**: los textos de la barra están sólo en español.
- **Tema oscuro**: la barra usa sólo tokens; no hice revisión visual en oscuro
  más allá de la suite.

## 8 · Pruebas ejecutadas

| Corrida | Resultado |
|---|---|
| Línea base `npm test`, `c302b1a` | 128/128 en verde · 3.831 aserciones · 1.359 s |
| Suites nuevas aisladas | `sesion-modelo` 35 · `sesion-flujo` PASS · `diagnostico` PASS · `layout-datos` PASS · `disciplina-modelo` con 4 casos T10 |
| Suite completa y compuerta tras los cambios | ver el mensaje de entrega y el PR |

## 9 · Siguiente paso concreto

1. Prueba de timeout tras escritura exitosa (T02) y de respaldo de ida y vuelta
   con `sesion` (T19): son los dos UNKNOWN que se pueden cerrar sin acceso externo.
2. Correr `supabase/pruebas/*.sql` contra el proyecto real (necesita al dueño).
3. Hacer que una distribución guardada sobreviva a un panel nuevo.
4. Reordenar el resto de Cabina alrededor de la barra, y empezar el piloto.
