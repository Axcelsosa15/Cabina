# Visor de capturas · 4 de noviembre de 2026

Continuación de las correcciones UI/UX sobre `f52f73b`. Se reutiliza el visor
existente y las imágenes de Futuros, Inversiones, Estrategias y Estudio.

## Fallos reproducidos con datos sintéticos

| Recorrido | Antes | Corrección |
| --- | --- | --- |
| Abrir una miniatura con teclado | Las imágenes no entraban en Tab ni respondían a Enter/Espacio | Miniaturas enfocables con semántica de botón y apertura por ambas teclas |
| Navegar en la imagen ampliada | El foco seguía detrás del visor | Foco inicial en Cerrar y ciclo de Tab/Shift+Tab dentro |
| Cerrar la imagen | Sólo admitía clic; Escape no cerraba o cerraba el editor inferior | Botón visible de 44 × 44 px y Escape limitado al visor |
| Ampliar desde el editor en móvil | El editor tenía z-index 100 y el visor 60; la imagen quedaba detrás | El visor queda por encima de los diálogos existentes |
| Volver a la revisión | No se devolvía el foco a la captura | Retorno a la miniatura de origen, conservando el editor y su estado |

Se mantiene el cierre por clic y se conserva/restaura el bloqueo de scroll
anterior al abrir. Las referencias, archivos de capturas, documentos y trades
no se cambian al ampliar o cerrar una imagen.

## Evidencia y límites

`test/visor-capturas.mjs` usa una operación sintética con la imagen `og.png` del
repositorio, a 390 y 1366 px, bloqueando conexiones externas. Sus 30 comprobaciones
reproducen 27 fallos con el código anterior y pasan con el corregido. La posición
real de la imagen se comprueba con `elementFromPoint`, además del teclado, foco,
tamaño táctil y cierre sin descartar el editor inferior.

Pasan también las pruebas de atajos, modales y conexión de capturas entre Futuros
y Estudio. La compuerta completa se ejecuta antes de integrar.

La revisión visual de una copia local en el navegador de esta conversación no
pudo completarse por su restricción de navegación a archivos locales. Esta nota
documenta una verificación funcional automatizada, no una auditoría visual del
visor con las capturas reales del usuario ni una certificación de accesibilidad.
