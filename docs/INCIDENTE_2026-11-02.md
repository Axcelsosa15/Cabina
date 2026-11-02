# Recargas, recuperación y sincronización

## Evidencia de producción

El 2 de noviembre de 2026, la consulta directa a Postgres confirmó 26 documentos
en `public.cabina_docs`, incluidos 8 trades repartidos entre dos usuarios. Los 26
coincidían con `cabina_recovery_private.snapshot_20261101`; no faltaba ninguno
respecto de esa copia. Esto no demuestra que contenga todos los registros que
alguna vez existieron en los navegadores.

La Data API respondió HTTP 503 con `PGRST002`. Los logs de PostgREST indicaron
`PGRST003: Timed out acquiring connection from connection pool`. Postgres tenía
13 conexiones de un máximo de 60. El panel mostraba `Unhealthy`, aunque el
conector de proyectos devolvía `ACTIVE_HEALTHY`.

Solicitar `NOTIFY pgrst, 'reload schema'` no restableció la API. El reinicio completo
del proyecto quedó pendiente de autorización explícita por causar una interrupción
de producción de varios minutos. No se reemplazaron documentos, identidades ni
políticas RLS para intentar resolver una caída del servicio.

## Fallos reproducidos y correcciones

- El día podía guardarse antes de llegar su documento remoto: se bloquea esa
  escritura y el journal espera a la carga. El estado de sincronización incluye
  también el documento del día.
- La selección guardada de cuenta se validaba antes de recibir las cuentas:
  ahora se restaura al recibir la primera configuración.
- Una lectura correcta limpiaba los errores de otras colecciones: el seguimiento
  conserva cada fallo hasta que se recupera su propia suscripción.
- La recuperación local comprobaba IDs y después usaba `set`; un ID creado entre
  ambos pasos podía sobrescribirse. Ahora usa INSERT sin upsert y conserva las
  colisiones, también las que aparecen durante la subida.
- La cola offline no persistía la versión original. Tras cerrar la pestaña,
  una lectura reciente autorizaba a sobrescribir o borrar cambios de otro
  dispositivo. La cola conserva `versionBase` y el reintento usa esa condición.
  Una entrada antigua sin versión sólo puede crear documentos ausentes;
  modificar o borrar uno existente exige resolver el conflicto.
- El diálogo de conflicto tras reabrir podía mostrar la copia remota como propia:
  conserva el documento pendiente y distingue un borrado pendiente de una edición.

## Verificación reproducible

`test/hidratacion-segura.mjs` y `test/cola-recarga-conflicto.mjs` fallaron con el
código previo a sus respectivas correcciones. `test/recuperacion-local.mjs`
incluye la creación concurrente de un ID durante la recuperación.

Para validar todo el release: `npm run compuerta`. Las pruebas usan datos
sintéticos y un doble de Supabase; no prueban por sí mismas el restablecimiento
de la API de producción. El respaldo privado dentro del mismo proyecto tampoco
equivale a un backup externo independiente.
