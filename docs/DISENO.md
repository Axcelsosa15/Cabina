# Sistema visual de Cabina — Concepto A (Minimalista claro)

## Decisión aprobada · 2026-10-30

La dirección elegida para Cabina es **Concepto A — Minimalista claro**.
Prioridad: entrada, corrección, lectura y organización de datos. Una operación
debe ser fácil de registrar sin esconder el riesgo ni los campos importantes.

No es una migración de motor ni de base de datos. Se preservan QuantEngine,
Supabase, RLS, importación, sincronización, rutas y contratos de datos.

## Estructura real inspeccionada

La app sigue siendo una SPA estática, con `index.html` para el markup y
los estilos, `app.js` para la interacción, `engine/quant` para cálculos y
`test` para regresión. No requiere introducir React ni un pipeline de build
para cambiar su interfaz.

Navegación principal observada en `index.html`: Cabina, Futuros, Cuentas,
Métricas / Edge, Inversiones, Historial, Playbook, Formas de hacer dinero,
Estudio, Calculadora y Ajustes. Otras vistas pueden ser subpanels o dialogs,
no pestañas de primer nivel; no deben inventarse rutas nuevas sin auditar
los enlaces y el estado actual.

## Tokens efectivos (Concepto A)

| Función | Token | Valor |
|---|---|---|
| Fondo | `--bg` | `#F7F9FC` |
| Superficie | `--surface` | `#FFFFFF` |
| Superficie secundaria | `--surface-2` | `#F8FAFC` |
| Borde | `--line` | `#E2E8F0` |
| Borde de input | `--line-strong` | `#CBD5E1` |
| Texto principal | `--text` | `#172334` |
| Texto secundario | `--muted` | `#475569` |
| Focus y acción primaria | `--accent` | `#1D4ED8` |
| Profit | `--positive` | `#166534` |
| Loss y error | `--negative` | `#B42318` |
| Warning | `--warning` | `#92400E` |
| Read-only | `--control-readonly` | `#F1F5F9` |

**Color comunica información**: azul para acciones y foco, verde para profit,
rojo para loss/errores, ámbar para advertencias. No usar fondo verde o rojo en
formularios completos. Los datos financieros deben mostrar signo y unidades,
no depender solo del color.

## Contrato visual de data entry (primer incremento)

Se cambió el contrato visual DENTRO del bloque de tema claro existente de
`index.html`; no se añadió un sexto bloque `<style>`. Incluye:

- Inputs, selects y textareas con superficie blanca, borde neutro y radios compartidos.
- Foco visible azul y anillo de foco para navegación con teclado.
- `aria-invalid="true"`: borde rojo visible, sin depender de un placeholder.
- `readonly`: superficie gris diferente de un control editable.
- `disabled`: tratamiento separado del readonly, sin ocultar el texto por opacidad.
- Labels persistentes de formularios `.ed .fld` y de Estudio.
- Inputs numéricos con tipografía monoespaciada y cifras tabulares.
- Móvil: tamaño mínimo de control de 44px y fuente de 16px.
- `test/data-entry-ui.mjs` verifica colores **computados** en Chromium, no
  que un código hexadecimal exista en el fichero.

Este PR es el primer incremento. No implica que todos los diálogos, campos
dinámicos o flujos del producto hayan sido auditados y rediseñados.

## Apariencia configurable (Concepto A + original oscuro)

En Ajustes → Apariencia se puede escoger **Claro (Concepto A)**, **Oscuro clásico**
(la capa histórica de Cabina) o **Automático** (preferencia del sistema).
El color principal admite azul, verde azulado, violeta y selector personalizado.
Profit, loss y warning conservan sus significados semánticos; no se recolorean
arbitrariamente.

**Por qué ya no debe aparecer un tema primero y otro después:** el archivo
`appearance.js` se carga sincronamente en `<head>`, antes de cualquier
`<style>`, y lee exclusivamente la preferencia de apariencia guardada bajo
`cabina-appearance:v1` en localStorage. El HTML tiene todas sus cinco hojas
`<style>` en el `<head>`, no después de `app.js`. El tema claro se activa
mediante CSS `@scope (html:not([data-cabina-theme="dark"]))`: la antigua
capa oscura vuelve a estar disponible en vez de ser tapada por cientos de
`!important` blancos. Los tokens de Concepto A están guardados con selector
`:root:not([data-cabina-theme="dark"])`.

El bootstrap permite cambiar tema sin recargar, sigue cambios de preferencia
del dispositivo cuando está en automático y sincroniza la preferencia entre
pestañas del mismo origen. Si localStorage está bloqueado, la apariencia
se aplica en la pestaña actual y el panel informa que no pudo persistir.

`appearance.js` no carga datos de trading ni hace fetch. Se publica junto
a `app.js` y está en la lista de recursos offline del service worker.
El selector personalizado ajusta el color para mantener al menos 4.5:1
respecto a la superficie principal, sin sustituir los colores de riesgo.

**Pruebas:** `test/apariencia.mjs` ejecuta Chromium, verifica tema elegido
antes de DOMContentLoaded, oscuridad real, cambio a claro, color personalizado,
persistencia y modo sistema en mobile. `test/seguridad.mjs` comprueba que
sólo se cargan los dos scripts confiables (bootstrap primero y app después).
No declarar PASS antes de ejecutar CI.

### Compatibilidad

`@scope` exige navegador actualizado (Chromium, Firefox o Safari con soporte
de CSS Scope). En navegadores anteriores, la capa oscura base continúa siendo
una alternativa legible, pero la presentación clara puede ser limitada.
No sustituir CSS Scope por otra cascada de !important sin medirla.

## Deuda técnica identificada (no ocultar)

El tema histórico oscuro se definió en el bloque base de CSS y un tema claro
posterior aplicó valores con `!important`. Durante 2026 se superpusieron
propuestas visuales; una paleta descartada de PR #75 añadió CSS que no llegaba
a pintar. Por eso `test/diseno-sistema.mjs` limita el HTML a cinco bloques
`<style>`, en vez de permitir que cada rediseño agregue otro tema encima.

**Pendiente de arquitectura:** migrar gradualmente los tokens claros a la
fuente principal y eliminar overrides redundantes con pruebas visuales; no
hacerlo a ciegas porque reglas antiguas de cuentas, Estudio y las tablas aún
dependen de ese CSS. La fase actual modifica el contrato efectivo dentro del
bloque existente y no introduce una pila de frameworks, hacks ni nuevas tablas.

La documentación `docs/ARCHITECTURE.md` menciona código inline antiguo;
el `index.html` actual carga `./app.js`. El código vigente prevalece.

## Comp puertas de aceptación

Ningún cambio pasa a `main` si hay un FAIL de CI. El informe de cada PR debe
distinguir PASS (ejecutado), FAIL (falló) y BLOCKED (no pudo comprobarse).
Verificar especialmente el registro y edición de trades, cuentas múltiples,
importación de CSV, persistencia, conflictos de sincronización y permiso RLS.
Una diferencia visual no justifica cambiar contratos o estadísticas.

Merge y despliegue requieren autorización explícita adicional.
