-- Aplicada al proyecto Supabase «cabina» el 2026-09-30.
--
-- Un almacén de documentos por usuario, con la misma forma que la base del
-- artefacto: rutas «coleccion/doc» (settings/main, days/2026-09-29, trades/<id>).
-- Así la app cambia un adaptador, no su modelo de datos.
--
-- La privacidad NO depende de la app: la imponen las políticas de abajo. La clave
-- pública del proyecto va dentro de la página, que cualquiera puede leer; lo único
-- que separa la data de dos usuarios es esto. Ver supabase/pruebas/aislamiento.sql.
create table public.cabina_docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  path       text        not null,
  coll       text        generated always as (regexp_replace(path, '/[^/]+$', '')) stored,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, path),
  constraint cabina_docs_path_forma check (
    char_length(path) <= 1000
    and path ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$'
  ),
  constraint cabina_docs_data_objeto check (jsonb_typeof(data) = 'object'),
  constraint cabina_docs_data_tamano check (pg_column_size(data) <= 262144)
);

create index cabina_docs_coll on public.cabina_docs (user_id, coll);

alter table public.cabina_docs enable row level security;
alter table public.cabina_docs force row level security;

-- Nadie sin sesión toca la tabla, ni siquiera con la clave pública.
revoke all on public.cabina_docs from anon, public;
grant select, insert, update, delete on public.cabina_docs to authenticated;

create policy cabina_docs_leer_lo_mio on public.cabina_docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy cabina_docs_crear_lo_mio on public.cabina_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cabina_docs_cambiar_lo_mio on public.cabina_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cabina_docs_borrar_lo_mio on public.cabina_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at lo pone el servidor, no el cliente.
create or replace function public.cabina_docs_sello() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger cabina_docs_sello before insert or update on public.cabina_docs
  for each row execute function public.cabina_docs_sello();
revoke execute on function public.cabina_docs_sello() from public, anon, authenticated;
