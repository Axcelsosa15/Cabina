# Precios en entradas de inversión · 4 de noviembre de 2026

En la web publicada, dentro del modo demo, se creó una posición de ETF con
activo `PRUEBA QA` y precio de entrada `-100`. El formulario se cerró y la tabla
mostró un coste negativo. El mismo validador sólo comprobaba que hubiera activo,
cantidad y precio; no rechazaba el signo del precio.

## Corrección

| Entrada | Comportamiento nuevo |
| --- | --- |
| Posición de acciones, ETF o cripto | Entrada y precio actual negativos bloquean el guardado y señalan el campo |
| Compra, venta o aporte en esos mercados | Precio unitario negativo bloquea el guardado por la otra puerta de entrada |
| Precio cero | Sigue admitido; el coste medio manual conserva `0` en lugar de convertirlo en ausencia |
| Precio actual sin informar | Sigue siendo un dato ausente, sin inventar una cotización |
| Errores de campos obligatorios de posición | Se identifica Activo, Cantidad o Precio de entrada para corregirlo |

La validación se limita a esos tres mercados estándar. Los formularios de
futuros, otros mercados, importaciones y API de registros conservan su contrato.
No se reescriben registros históricos: el control actúa al guardar desde el
formulario. QuantEngine y las fórmulas de coste/P&L no cambian; sólo se preserva
el cero explícito en el coste medio de las posiciones manuales.

## Verificación

`test/precios-spot.mjs` reproduce 42 fallos en 64 comprobaciones contra el código
anterior. Con la corrección pasan las 64, a 390 y 1366 px: posiciones, compras,
errores de campo, precio cero, cantidades fraccionadas, precio actual ausente y
corrección del dato antes de guardar. También comprueba que la regla spot no se
aplique al formulario de futuros y que no haya excepciones JavaScript.

Pasan `editor-abort-guard`, `editor-validacion` e `inversiones-claras`. La compuerta
completa se ejecuta antes de integrar. Las pruebas usan datos sintéticos y
bloquean conexiones externas; el recorrido manual se hizo en demo, sin guardar
operaciones reales.
