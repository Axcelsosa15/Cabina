# Guía inicial y pausas opcionales

Esta entrega amplía el acceso a las funciones que Cabina ya tiene. La guía no
reemplaza el diario, el motor de reglas ni los datos de una cuenta. Las pausas
son recordatorios de descanso en la propia interfaz, sin puntos, castigos ni
invitaciones a operar.

## Guía breve de tres pasos

1. **Explorar:** conocer la Cabina y el demo con datos claramente inventados.
   El demo sigue aislado; entrar o salir de él no modifica información real.
2. **Preparar:** revisar cuenta, límites y checklist. Ningún paso confirma reglas
   de una firma por el mero hecho de completar la guía; la persona verifica sus
   condiciones reales antes de usar una plantilla.
3. **Registrar y revisar:** encontrar el diario y las herramientas de disciplina.
   Se puede preparar, escribir una reflexión o decidir no operar sin crear una
   operación ficticia para completar el recorrido.

La guía se puede omitir, cerrar y volver a abrir. No bloquea el resto de Cabina
ni crea cuentas o trades automáticamente. Su estado de vista pertenece al
dispositivo; no se presenta como progreso de trading ni como dato sincronizado
en Supabase. La marca de guía completada es una preferencia de este navegador;
la separación por dueño se aplica al temporizador de pausas.

Antes de sustituir la pantalla por ejemplos, se terminan las escrituras
pendientes de configuración, notas y colecciones. Cada escritura conserva una
copia de la edición y la identidad del almacén al pedirla. Las notas del día
actual usan la misma cola tanto en Cabina como en el diario de Futuros.
Un error de guardado o conflicto impide entrar hasta resolverlo. Una subida de
captura o importación en curso exige esperar a su finalización.

Durante la demo se bloquean la importación de copias, el borrado de sesiones y
la restauración o descarte de la papelera real. Los callbacks de archivos y la
capa de escritura comprueban también este estado para cubrir respuestas tardías.
Los ejemplos nunca se importan sobre la cuenta real al terminar el recorrido.

## Pausas que se activan por elección

El recordatorio comienza desactivado. La persona puede activarlo y escoger
30, 60, 90 o 120 minutos de uso enfocado. Sólo avanza cuando Cabina está visible
y tiene foco; cambiar a otra ventana, dejar la pestaña en segundo plano o cerrar
el navegador pausa la medición. El evento de pérdida de foco conserva el pequeño
tramo activo anterior, sin sumar el tiempo posterior en segundo plano.

El aviso aparece en la interfaz y puede descartarse por el resto del día.
No solicita permisos de notificaciones, no usa push, no suena ni envía mensajes.
No modifica reglas de riesgo, bloquea el registro, suma XP ni promete evitar
pérdidas. Desactivarlo elimina el agregado de tiempo del día y detiene la
medición; no lo recupera al volver a activarlo.

La fecha civil de Nueva York decide el día. Al cambiar de fecha se reinicia
el agregado, sin arrastre de minutos. El modelo usa diferencias de tiempo real
en milisegundos para que los cambios de horario de verano no añadan ni dupliquen
una hora. Un intervalo sin observación de más de un minuto se descarta entero:
no se supone que el equipo dormido o un reloj alterado equivalgan a uso activo.
Un retroceso del reloj obliga a establecer una referencia nueva, para no contar
su corrección como tiempo de uso. Un agregado restaurado queda limitado a
25 horas, la duración máxima de un día civil de Nueva York al cambiar a horario
de invierno.

## Privacidad y separación de espacios

`session-break.js` es un modelo puro: recibe datos y devuelve un estado nuevo.
No lee el reloj por su cuenta ni accede al DOM, almacenamiento, red, cuenta,
notas, operaciones, resultados o capturas. Tras descartar el aviso tampoco
continúa acumulando duración innecesaria durante esa fecha.

El adaptador de la interfaz conserva sólo la preferencia y el agregado diario
necesario en este navegador. Usa una clave separada por dueño de la cuenta o
espacio local y mantiene la demo independiente. Una cuenta no hereda la duración
ni el aviso descartado de otra. Estos datos no se escriben en Supabase ni se
comparten en tarjetas de proceso. Si el almacenamiento no está disponible, el
recordatorio puede funcionar sólo durante la sesión actual y debe indicarse.

## Validación

El modelo tiene pruebas de opt-out, pérdida y recuperación de foco, segundo
plano, sueño, salto de reloj, restauración, medianoche ET, cambios DST, límites,
descarte y normalización de datos inválidos. La interfaz debe comprobar además
separación de claves entre dueños, demo, preferencias tras recargar, teclado,
lector de pantalla, ambos idiomas y tamaños de pantalla. El modelo no puede
verificar claves de almacenamiento ni eventos de foco: eso corresponde a las
pruebas del adaptador.

Las señales de foco y visibilidad del adaptador se prueban con contextos DOM
controlados: Chromium headless puede declarar ambas pestañas como visibles y
enfocadas a la vez. Esto no sustituye una comprobación del cambio de ventana en
un navegador con interfaz. Las restantes interacciones de la guía, los controles
y la persistencia se recorren mediante clics, teclado y recargas reales.

La API pública es `CabinaBreakClock.create`, `step`, `setEnabled`, `setLimit` y
`dismiss`. Restaurar con `create` conserva la preferencia, el agregado de esa
fecha y su descarte, pero elimina la referencia temporal y comienza inactivo.
Sólo la interfaz determina visibilidad, foco, dueño y fecha ET. Se persisten
campos permitidos del agregado; `active` y `lastNow` no se guardan entre visitas.
