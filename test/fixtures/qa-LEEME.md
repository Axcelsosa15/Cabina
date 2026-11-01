# Fixtures QA · integración (TAREA 6)

Propiedad: **QA / integración**. No son correcciones de producto.

## Archivos

| archivo | uso |
|---|---|
| `qa-integracion.json` | Semilla localStorage (`cabina-mnq:v1`) con dos cuentas QA, cuatro trades sintéticos y un día abierto. Reloj fijo `2026-09-17T14:00:00Z`. |
| `LEEME.md` | Fixtures CSV de bróker (importación). Sin cambios de propiedad. |

## Reglas

- Sólo datos locales / `nubeDoble`. Cero escrituras destructivas a producción.
- QuantEngine se ejerce en lectura (P&L, rejilla). No se altera el motor ni RLS.
- Las pruebas que consumen esta semilla viven en `test/qa-integracion.mjs` y `test/qa-flujos.mjs`.
- Si una tarea hermana aterriza un arreglo de producto, re-ejecutar la matriz sobre la rama `cursor/qa-integracion-df2e` tras cherry-pick/merge — no reescribir sus archivos de producto desde aquí.
