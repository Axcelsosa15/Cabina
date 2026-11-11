# Contrato frontend ↔ backend · Cabina

## Propósito
Evitar tres fallos especialmente peligrosos para un trading journal: representar una respuesta
inesperada como una colección vacía, sobrescribir una edición de otro dispositivo y borrar
sin comprobar su versión.

**Proveedor activo:** Supabase, proyecto `lazniuuedlhqomfyykvf`, tabla `public.cabina_docs`.
El esquema observado de producción se registra en [contracts/backend.json](../contracts/backend.json).
Ese JSON es una **instantánea**, no una consulta permanente a la base. La suite CI contrasta
el código y los dobles con este contrato y con las migraciones locales; la comprobación de
deriva en producción requiere consultar el proyecto de Supabase.

## Reglas de compatibilidad
- Una lectura de `cabina_docs` devuelve **un array de filas**; `data` es objeto JSON,
  `version` es entero positivo y `path` identifica una ruta de documento.
- `PATCH` y `DELETE` usan `path` **y** `version`. Las respuestas sin filas se
  consideran conflicto o documento ya borrado según corresponda.
- `INSERT` sólo crea una ruta ausente; **nunca** utiliza
  `on_conflict=user_id,path` / `resolution=merge-duplicates` en la aplicación.
- Si la versión de la base no está disponible o la respuesta tiene otra forma,
  Cabina presenta `BACKEND INCOMPATIBLE`, deja leer lo que sea seguro y **bloquea
  escrituras cloud y borrados**. No declara la cuenta sincronizada.
- Los fallos de escritura habituales siguen utilizando la cola durable por usuario.
  No se borran operaciones ni se ejecutan migraciones de manera automática.
- Auth y RLS son controles del servidor; no se sustituyen con validaciones del navegador.

## Comprobar antes de fusionar
1. `node test/backend-contract.mjs`: prueba en Chromium el backend sin columna
   `version` y una respuesta HTTP 200 con JSON incompatible. Comprueba que no hay
   modificaciones remotas ni estado falso de sincronización.
2. `npm run compuerta`: ejecuta regresiones de persistencia, sesión, recuperación,
   concurrencia, UI y el PostgreSQL local cuando está disponible.
3. Inspeccionar el esquema remoto con SQL **sólo de lectura**; verificar columnas,
   restricciones, trigger, RLS y políticas antes de publicar cambios de DB.
4. Ante una migración incompatible, aplicar **primero** un cambio de backend
   aditivo y compatible, comprobarlo en staging, luego desplegar frontend;
   retirar campos antiguos sólo tras verificar que no hay clientes activos
   dependientes de ellos.

### Consultas de inspección (sin datos de usuarios)

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'cabina_docs'
order by ordinal_position;

select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' and tablename='cabina_docs';

select tgname, pg_get_triggerdef(oid)
from pg_trigger where tgrelid='public.cabina_docs'::regclass and not tgisinternal;
```

## Límite de la garantía
Los tests locales no certifican disponibilidad de Supabase, API PostgREST en producción,
DNS, reglas de red, datos reales del bróker ni concurrencia fuera de los casos probados.
Si el backend cambia fuera del repositorio, se debe repetir la inspección anterior y
actualizar el contrato con evidencia. No introducir un fallback de escritura que relaje OCC.
