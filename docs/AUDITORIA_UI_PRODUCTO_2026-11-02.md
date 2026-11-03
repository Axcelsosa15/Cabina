# Auditoría UI/UX del producto · 2 de noviembre de 2026

Objetivo: recorrer el producto publicado, reproducir defectos de interacción y
lectura, y corregirlos conservando el sistema visual claro existente.

## Alcance y evidencia

Revisión visual en navegador del producto publicado: Resumen, Futuros, Cuentas,
Historial, Rendimiento, Estrategias, Estudio, Inversiones, Oportunidades,
Calculadora y Ajustes. Se comprobaron estados vacíos y registros de la demo,
registro rápido, edición de operación y creación de estrategia. Los datos de la
demo son inventados; no se modificaron operaciones reales.

La revisión móvil/tablet se verifica con regresiones automatizadas a 320, 390, 820, 834 y
1366 px, además de las suites existentes de distribución, contraste, tipografía,
formularios y navegación. No equivale a una certificación WCAG ni a una prueba
manual en cada dispositivo físico o de todas las combinaciones de datos.

## Defectos reproducidos y solución

| Superficie | Problema observado | Corrección |
| --- | --- | --- |
| Cuentas vacías | Añadir cuenta no producía ninguna respuesta | Evento delegado en el contenedor estable que abre el editor real, también tras repintados |
| Estrategias | Entrar o volver a la sección borraba la categoría resaltada | La navegación principal sólo cambia sus propios botones; conserva la categoría elegida |
| Estrategias | Las categorías no anunciaban su selección | Estado `aria-pressed` ligado a la misma selección visible |
| Filtros compartidos | El ancho inicial de 158 px cortaba valores en Historial, Rendimiento, Inversiones y Oportunidades | Base de 220 px sin contracción en escritorio; reorganización en móvil |
| Historial con datos | Fechas partidas y nombres de cuenta cortados dentro de palabras | Fechas/unidades en una línea, anchura mínima de cuenta/notas, scroll dentro de la tabla |
| Historial con teclado | Las filas sólo podían abrirse con el ratón | Botón Abrir por fila, enfocable y activable con Enter |
| Vista | Las columnas de la pantalla actual quedaban enterradas entre otras páginas y el nombre incluía su contador | Prioriza la página actual y usa su nombre sin contadores |
| Calculadora | Los cambios de subvista sólo se comunicaban mediante color | `aria-pressed` actualizado para la vista inicial y cada cambio |
| Registro rápido | Cierre y etiquetas pequeñas para uso táctil | Área mínima de 44 × 44 px para cierre y chips |

Las dos filas de Estrategias forman una sola corrección funcional y accesible:
ocho grupos de defectos en total.

## Validación reproducible

`node test/auditoria-producto-ui.mjs`: ampliada a 77 comprobaciones. La versión
inicial de 44 detectó 34 fallos en el código anterior y pasó completa en el
corregido. Cubre categoría al entrar y regresar,
apertura del editor desde Cuentas vacías, filtros legibles, selección accesible
en Calculadora, tamaños táctiles, fechas, acceso por teclado, prioridades de Vista y ausencia de overflow del documento.

La compuerta completa es obligatoria antes de publicar. La verificación final en
el navegador debe comprobar la versión efectivamente servida, porque un test
local no demuestra que el despliegue haya terminado.

## Estabilidad de las pruebas completas

La primera corrida de GitHub detectó dos precondiciones de prueba inestables:
`vista` contaba rectángulos dentro de un `details` cerrado; ahora usa visibilidad
real y comprueba también el filtro de fechas abierto. Se bloquea la red externa
en esa suite: mide el payload publicado, no el tiempo de respuesta de fuentes.
`conflicto` requería un dispositivo rezagado pero lo dejaba visible, permitiendo
que el refresco automático de 20 s actualizase su versión antes de escribir.
Se simula la pestaña en segundo plano y se conservan sus recargas explícitas y
las comprobaciones de los datos del servidor. No se modifica la sincronización
del producto para acomodar la prueba.
