# CABINA · Auditoría de data entry · Concepto A

Fecha: 2026-10-30. Estado: **auditoría estática del código**, no certificación de
producción ni prueba visual completa. Fuente: `index.html`, `app.js`,
`docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md` y tests del repositorio.

## Navegación REAL (11 tabs de primer nivel)

| Orden | ID | Texto visible |
|---|---|---|
| 1 | cabina | Cabina |
| 2 | futuros | Futuros |
| 3 | cuentas | Cuentas |
| 4 | edge | Métricas / Edge |
| 5 | invest | Inversiones |
| 6 | historial | Historial |
| 7 | playbook | Playbook |
| 8 | ideas | Formas de hacer dinero |
| 9 | estudio | Estudio |
| 10 | calc | Calculadora |
| 11 | ajustes | Ajustes |

Today's Session, revisiones, importación y métricas internas deben mapearse
según sus controles y subpaneles reales; no son automáticamente nuevas rutas.

## Inventario confirmado del editor genérico (app.js)

`openEditor(cfg)` construye los controles a partir de `cfg.fields`. Cada
entrada obtiene `id="ef_<key>"`, label visible, placeholder opcional, ayuda
opcional y tipo de campo. `readEditor()` recoge y transforma números a
Number/null y `edSave` ejecuta validación, persistencia y cierre.

**Hallazgo UX P1:** la validación general muestra el error temporalmente
reemplazando el título del editor (`flashEd`), no junto al campo. La
construcción genérica no añade `aria-invalid` ni `aria-describedby` asociados
a ese error. El rediseño de presentación ya incluye el estilo de
`aria-invalid`, pero falta cablearlo con los validadores existentes.

**Hallazgo UX P1:** `inputmode="decimal"` se asigna por defecto a todos los
campos numéricos del editor, incluso contratos enteros y días. Debe usarse
`numeric` para magnitudes enteras sin alterar los valores guardados.

**Hallazgo UX P1:** campos de cuentas quemadas aparecen bajo sección
`04 · Si la quemaste` ANTES de `03 · El contrato de la firma`. Ordenar
secciones y disclosure sin borrar los campos ni alterar la semántica de
ausente / vacío / presente.

## Formulario de operación · Futures (27 campos)

| Momento | Campos existentes |
|---|---|
| Qué y cuándo | `date`, `time`, `accountId`, `instrument`, `setupId`, `direction` |
| Plan y riesgo | `qty`, `entry`, `stop`, `target`, `invalida` y panel de riesgo calculado |
| Cómo salió | `exit`, `exitTime`, `exitWhy` |
| Revisión | `plan`, `mae`, `mfe`, `fees`, `pnl`, `quality`, `tags`, `cStruct`, `cPull`, `cWindow`, `cSize`, `note`, `lesson` |

El panel de riesgo usa el motor existente; no se debe duplicar cálculo para
mostrar previews. El P&L manual no debe presentarse como equivalente al
resultado derivado sin explicar su procedencia.

## Formulario de operación · Inversiones (14 campos)

`date`, `accountId`, `market`, `asset`, `setupId`, `op`, `qty`,
`price`, `fees`, `pnl`, `horizon`, `offPlan`, `note`, `lesson`.

El espacio de nombres de cuentas de inversión es diferente del de prop firms:
el diseño debe hacerlo explícito en filtros, formularios y portafolio.

## Editor de cuenta prop firm (25 campos)

| Grupo | Campos |
|---|---|
| Identidad | `firm`, `name`, `kind` |
| Límites | `size`, `dd`, `ddKind`, `trailBase`, `limit`, `target`, `status`, `total`, `best` |
| Cuenta quemada | `burnedOn`, `lesson` |
| Contrato de firma | `r_maxLoss`, `r_maxGain`, `r_maxContracts`, `r_maxLosses`, `r_minDays`, `r_payoutBuffer`, `r_instruments`, `r_verifiedAt`, `r_url`, `r_version`, `r_notes` |

Los defaults de cuenta nueva (`size: 50000`, `dd: 2000`, etc.) ya están
en código: **no convertirlos en supuestos reales ni aplicarlos sobre cuentas
existentes**. Las reglas de firma versionadas y su fecha de vigencia no pueden
perderse por reordenar el formulario.

## Editor de cuenta de inversión (3 campos)

`name`, `type`, `broker`. Valores visibles: brokerage, crypto/exchange,
options, futures/trading, retirement, otro.

## Filtros con labels visibles integrados en este incremento

- Futuros: `ftAcct`, `ftRange`, `ftSetup`, `ftInstr`, `ftSes`, `ftQ`.
- Historial: `hsTipo`, `hsAcct`, `hsRango`, `hsQ`.
- Métricas / Edge: `mxAcct`, `mxSetup`.

Se conservan sus IDs, opciones, listeners, valores y contratos de consulta.

## Riesgos y límites de auditoría

| Riesgo | Gravedad | Respuesta |
|---|---|---|
| Estilos oscuros + tema claro con `!important` | Alta | Migración progresiva; no añadir un sexto `<style>` |
| Error de validación global en título | Alta | Mapear errores a campos sin cambiar reglas de negocio |
| Demasiados campos de cuenta en una vista | Alta | Agrupación y disclosure de contrato/cuenta quemada |
| Tipos numéricos sin teclado entero | Media | Modo de teclado según metadatos de campo |
| Filters sólo con placeholders/aria-label | Media | 12 labels visibles incorporados |
| Cabina/Today y modales dinámicos no capturados visualmente | **BLOCKED** | Pruebas y capturas con navegador |
| Persistencia/cuentas múltiples/CSV/Supabase | **Pendiente** | Ejecutar suite; no declarar PASS por inspección de código |

## Orden de PRs propuesto

1. **PR #92** · tokens semánticos, estados de input y labels persistentes
   (este incremento, sin cambios en motor).
2. Editor genérico · feedback de validación junto al campo, enteros vs decimal,
   error a11y y prevención de pérdida de cambios.
3. Trade Entry y Today's Session · grupos y campos avanzados, primero móvil.
4. Cuentas · reorganización de secciones, reglas versionadas intactas.
5. Importador, inversiones, Playbook y revisiones · controles y jerarquías.
6. Resto de pantallas · navegación, filtros, tablas, vacíos y responsive.

**Compuerta:** PRs pequeños, suite de pruebas y revisión visual real antes
de merge. CI pendiente no es PASS.
