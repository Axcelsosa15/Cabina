# Ajustes y patrones de interacción

Ajustes se organiza en Apariencia, Preferencias y Datos. Sólo una categoría está visible. Las flechas, Home y End cambian la categoría y el foco. Los diálogos nativos mantienen el foco dentro, cierran con Escape y devuelven el foco a la acción de origen.

## Componentes

`setting-row` agrupa etiqueta y control o acción. `settings-tabs` representa navegación local. `settings-details` reserva explicaciones bajo demanda; no debe contener una advertencia esencial. `settings-status` informa del resultado real y `settings-alert` mantiene consecuencias relevantes a la vista. `settings-dialog` usa `<dialog>` y `showModal()`.

La escala de espacio usa `--space-*`, el ancho `--content-width` y la separación de filas `--row-space`. El texto usa `--read-body`, `--read-meta`, `--read-label` y `--font-ui`. No deben aparecer fuentes monoespaciadas en las nuevas explicaciones o controles generales.

Las atmósferas comparten el mismo esquema y colores financieros semánticos. La vista previa contiene ejemplos explícitos, no registros del journal. El acento personalizado se ajusta para conservar contraste. Los tipos de letra usan fuentes locales con alternativas.

## Persistencia

`cabina-appearance:v1` conserva modo, acento y color personalizado, y añade atmósfera, fuente, tamaño y densidad. Los valores se validan contra listas permitidas. No se escribe al arrancar. Se leen preferencias antiguas y, si no hay densidad en apariencia, se hereda la elección antigua de Vista.

Apariencia mantiene un borrador visible sólo en su vista previa. Aplicar escribe primero; sólo una escritura exitosa cambia la apariencia activa. Un error conserva el borrador para reintentar y la apariencia anterior. Cancelar descarta el borrador. Restablecer prepara un borrador: requiere Aplicar. Un cambio de otra pestaña no sobrescribe un borrador pendiente; se informa del conflicto.

La densidad de Vista y Apariencia usa la misma preferencia efectiva. Las preferencias de distribución, módulos, columnas y vistas guardadas existentes se conservan. El idioma se guarda de inmediato en su fila y comunica el resultado.

## Datos y demo

Exportar abre un diálogo de capturas. No se muestra un tamaño estimado sin calcular: el tamaño real llega al generar la copia. Un error ofrece Reintentar; una descarga fallida no registra una fecha de respaldo. La fecha opcional está separada por usuario o almacén local y sólo informa de una descarga iniciada.

Importar conserva el parser, integridad, recuentos, reparación de identificadores y confirmación explícita existentes. La consecuencia de fusionar o reemplazar se presenta antes de elegir y al confirmar. La nube mantiene su actualización por identificador sin borrado de ausentes. El resumen de confirmación es de sólo lectura. Cancelar termina el estado pendiente y conserva los datos.

La demo requiere una explicación previa, mantiene una etiqueta y salida visibles y bloquea la gestión de respaldos sobre el almacén real. Apariencia e idioma siguen siendo preferencias del dispositivo. No se cambia autenticación, RLS, transporte ni lógica financiera.

## Validación

`node test/ajustes-claros.mjs` recorre borrador, persistencia y fallo de guardado, conflicto entre pestañas, idioma, exportación fallida y reintento, validación de archivos, confirmación y cancelación de importación, búsqueda de ayuda, teclado, tres anchos de pantalla y retorno de demo con un journal sintético. `node test/correr.mjs` ejecuta además la suite existente.

Las demás pantallas conservan su estructura hasta aprobar la siguiente fase de refactorización.
