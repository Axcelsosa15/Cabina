# Atajos y diálogos · 4 de noviembre de 2026

Continuación de la revisión UI/UX sobre `c194bc2`, conservando el diseño y los
datos existentes. El recorrido revisado es abrir un documento de Estudio y usar
el teclado sin salir del diálogo ni abrir otro editor accidentalmente.

| Paso | Evidencia anterior | Resultado corregido |
| --- | --- | --- |
| 1. Abrir Nuevo documento | El editor abre y enfoca el título correctamente | Se conserva |
| 2. F desde Guardar documento | La URL pasa a `#futuros` y la selección del sidebar cambia detrás del editor abierto | Los atajos de página se suspenden mientras un diálogo visible los bloquea |
| 3. Ctrl+K desde el mismo botón | La paleta se abre y recibe el foco, aunque la ventana de Estudio sigue visible encima | No se abre una segunda ventana; el usuario continúa en el documento |
| 4. Cerrar el diálogo y usar atajos | Deben seguir disponibles F y la apertura/cierre de la paleta | Las pruebas verifican ambos recorridos fuera de los modales |

Los pasos 2 y 3 se reprodujeron en la web publicada mediante el navegador de esta
sesión. Se capturaron el editor con Futuros seleccionado por detrás y el estado
superpuesto. No se guardaron documentos ni se modificaron operaciones reales.

## Corrección

El manejador de atajos detecta diálogos visibles antes de procesar navegación,
nueva operación o la paleta. Incluye los diálogos nativos y los existentes con
`role="dialog"`; excluye la propia paleta para conservar su atajo de cierre.
Los manejadores de escritura, botones, Tab y Escape conservan su comportamiento.

## Verificación y límites

`test/atajos-dialogos.mjs` comprueba 52 comportamientos a 390 y 1366 px. Cubre edición
y lectura de Estudio, registro rápido, Vista, editor compartido, Ayuda, Cuenta en
escritorio y Más secciones en móvil. También comprueba el borrador de Estudio,
los atajos fuera de los diálogos y la ausencia de excepciones JavaScript.

Contra el código anterior reproduce 32 fallos; con la corrección pasan las 52
comprobaciones. Usa sólo datos sintéticos y bloquea las conexiones externas.
La compuerta completa se ejecuta antes de integrar. La prueba no certifica
accesibilidad completa ni sustituye la verificación en un dispositivo físico.
