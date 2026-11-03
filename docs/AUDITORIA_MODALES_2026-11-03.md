# Recorridos de modales · 3 de noviembre de 2026

Continuación de la revisión UI/UX del producto publicado. Se conserva el diseño
aprobado y se trabaja sobre los editores existentes.

| Recorrido | Fallo reproducido | Corrección |
| --- | --- | --- |
| Editor compartido | Tab desde Guardar y Shift+Tab desde Cerrar sacaban el foco del diálogo | Ciclo de teclado dentro del modal, excluyendo controles ocultos o deshabilitados |
| Borrar A, cancelar, abrir B | El botón reutilizado conservaba durante tres segundos la confirmación de A; la primera pulsación en B podía borrarlo | Desarmar al abrir y cerrar el editor; cancelar el temporizador anterior y restaurar la etiqueta |
| Lectura de Estudio | Abrir no situaba el foco dentro y Escape no cerraba la lectura | Foco inicial, ciclo de teclado y cierre con Escape |
| Lectura → editar → cancelar | Se perdía el acceso original al documento; también al cancelar un documento nuevo | Conservar el origen al pasar entre diálogos y devolver el foco al cerrar; acceso Nuevo documento como alternativa si el original se repintó |

## Evidencia y pruebas

En la web publicada se comprobó que el editor de oportunidades permanecía abierto
mientras el foco salía fuera al avanzar desde Guardar. El resto de recorridos se
reproduce en `test/modal-recorridos.mjs` con documentos y oportunidades sintéticas,
sin usar operaciones reales ni escribir en Supabase.

La versión inicial de la prueba detectó 20 fallos en 26 comprobaciones contra el
código anterior. La versión final tiene 30 comprobaciones a 390 y 1366 px: añade
caducidad de confirmación y que el segundo clic borre exclusivamente el registro
elegido. En el código corregido pasan las 30.

Pasan también editor-abort-guard, editor-validacion y estudio-investigacion. La
compuerta completa se ejecuta antes de integrar. La prueba automatizada no sustituye
una certificación de accesibilidad ni una prueba en cada dispositivo físico.

## Hallazgo de contraste durante la compuerta

La primera compuerta pasó 102 de 103 suites y detectó un texto de sesión con
contraste 1.63:1 sobre fondo claro. El estado dependía de la hora real de la
corrida. `sesion-contraste.mjs` fija tres momentos (aviso, operativa, fuera de
protocolo) en ambos temas: sus 12 comprobaciones detectan también el aviso claro
que aquella corrida no mostraba. Ambos subtextos usaban colores RGBA fijos de la
paleta oscura; ahora emplean los tokens semánticos del tema, sin transparencia.
La prueba inicial detecta dos contrastes insuficientes de los seis estados.
