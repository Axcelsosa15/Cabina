-- CONTROL DE CONCURRENCIA OPTIMISTA para cabina_docs.
--
-- EL PROBLEMA QUE CIERRA. Hasta aquí la app escribía con un upsert SIN CONDICIÓN
-- (`POST ?on_conflict=user_id,path` con `resolution=merge-duplicates`). Dos
-- dispositivos que leían la misma versión y escribían: el último que llegaba
-- ganaba, el otro cambio desaparecía, y NADIE lo detectaba. La Phase 1 puso un
-- sello `updatedAt` dentro del JSON que protege lo que hay en la PANTALLA —una
-- lectura vieja no pisa una edición nueva— pero no protegía la BASE, porque el
-- upsert no mira nada antes de escribir.
--
-- LA PROPIEDAD QUE ESTO GARANTIZA, y es una propiedad de la base, no de la app:
--
--     UPDATE ... WHERE path = ? AND version = <la que leí>
--
--   Si 0 filas coinciden, alguien escribió entre mi lectura y mi escritura, y mi
--   escritura NO ocurre. PostgREST devuelve las filas afectadas cuando se le pide
--   `Prefer: return=representation`, así que un array vacío ES el conflicto. No
--   hace falta ninguna función ni ninguna transacción explícita: un UPDATE con su
--   WHERE ya es atómico, y el WHERE se evalúa contra la fila ANTIGUA.
--
-- POR QUÉ NO UNA RPC. Se consideró `security definer` y se descartó: una función
-- con definer SALTA la RLS, así que el aislamiento entre usuarios dejaría de
-- depender de la política y pasaría a depender de que la función esté bien
-- escrita. Cambiar la garantía de seguridad por una ronda de red menos es un mal
-- cambio. Un UPDATE condicional con RLS encima da la misma atomicidad sin tocar
-- quién puede ver qué.
--
-- POR QUÉ LA VERSIÓN LA PONE EL TRIGGER Y NO EL CLIENTE. Si el cliente mandara
-- `version` en el cuerpo, un cliente con un fallo —o alguien escribiendo a mano
-- contra la API con su propio token— podría mandar siempre la misma versión y
-- volver a tener last-write-wins sin que la base pudiera impedirlo. Aquí el
-- cliente sólo puede EXPRESAR QUÉ VERSIÓN CREE QUE HAY (en el WHERE); el número
-- nuevo lo decide la base. El cuerpo de un PATCH lleva `data` y nada más que
-- importe: lo que el cliente ponga en `version` se sobreescribe.

alter table public.cabina_docs
  add column if not exists version integer not null default 1;

-- La versión nunca es cero ni negativa: un cliente que lea 0 estaría pidiendo
-- una fila que no puede existir, y eso es un fallo que conviene ver pronto.
--
-- Envuelto porque `add constraint` no admite `if not exists` y esta migración
-- tiene que poder aplicarse dos veces sin romperse: el dueño la aplica a mano
-- contra el proyecto, y una migración que falla la segunda vez deja a quien la
-- aplica sin saber si la primera llegó al final. Se detectó corriéndola dos veces
-- contra el Postgres local.
do $$ begin
  alter table public.cabina_docs
    add constraint cabina_docs_version_positiva check (version >= 1);
exception when duplicate_object then null;
end $$;

-- El sello: `updated_at` y `version` los pone el servidor, no el cliente.
-- Reemplaza la función de la migración de 2026-09-30, que sólo ponía updated_at.
create or replace function public.cabina_docs_sello() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    /* +1 SOBRE LA FILA ANTIGUA. Da igual lo que el cliente mandara en el cuerpo:
       se descarta. Y como el WHERE del UPDATE se evalúa contra OLD, un PATCH con
       `version=eq.5` sólo toca la fila si de verdad está en 5, y la deja en 6. */
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  return new;
end $$;

-- El trigger ya existe desde la migración de 2026-09-30 y apunta a esta misma
-- función, así que recrearla basta. Se vuelve a declarar por si esta migración se
-- aplica sobre una base donde el trigger no se creó.
drop trigger if exists cabina_docs_sello on public.cabina_docs;
create trigger cabina_docs_sello before insert or update on public.cabina_docs
  for each row execute function public.cabina_docs_sello();
revoke execute on function public.cabina_docs_sello() from public, anon, authenticated;

-- Las políticas de RLS NO cambian: siguen siendo `auth.uid() = user_id` para
-- select, insert, update y delete, con RLS forzada. La concurrencia y el
-- aislamiento son dos propiedades distintas y se mantienen separadas a propósito:
-- un conflicto de versión NO es un problema de permisos, y un intento de escribir
-- en la fila de otro usuario NO es un conflicto. Si se mezclaran, un fallo de
-- permiso podría leerse como «alguien editó esto en otro dispositivo», que es
-- justo el mensaje equivocado.
--
-- CÓMO SE COMPRUEBA, contra el proyecto real: supabase/pruebas/concurrencia.sql.
