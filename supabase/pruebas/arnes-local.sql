-- ARNÉS PARA CORRER LAS MIGRACIONES REALES EN UN POSTGRES LOCAL.
--
-- POR QUÉ EXISTE. Las pruebas de `supabase/pruebas/*.sql` sólo se podían correr
-- contra el proyecto real, y desde CI o desde una sesión de trabajo el proyecto no
-- es alcanzable (la política de red del entorno deniega `supabase.co`: 403 al
-- CONNECT, medido). Eso dejaba la propiedad más importante de la base —que un
-- documento no se pierda cuando dos dispositivos escriben— sin más verificación
-- que un doble escrito en JavaScript, que es exactamente lo que el doble NO puede
-- demostrar: un doble prueba el CONTRATO que la app espera, no lo que Postgres hace.
--
-- Esto crea en un Postgres vacío lo MÍNIMO que Supabase aporta y de lo que las
-- migraciones dependen —el esquema `auth`, la tabla `auth.users`, `auth.uid()` y
-- los roles `anon` y `authenticated`— y nada más. Después se aplican las
-- migraciones del repositorio TAL CUAL, sin una línea distinta: si hubiera que
-- editarlas para que corrieran aquí, esto dejaría de probar lo que se publica.
--
-- LO QUE ESTO SÍ DEMUESTRA: el DDL es válido, el trigger hace lo que dice, el
-- UPDATE condicional por versión coincide con 1 o 0 filas según la versión, las
-- políticas de RLS separan a dos usuarios, y las constraints rechazan lo que deben.
-- Todo eso es Postgres, y aquí es el mismo Postgres.
--
-- LO QUE NO DEMUESTRA, y por eso la fila de la compuerta sigue siendo UNKNOWN:
--   · que el proyecto real tenga estas migraciones aplicadas;
--   · que `auth.uid()` del Supabase real se comporte igual que este sustituto
--     (lee el mismo `request.jwt.claims`, pero lo de verdad lo pone GoTrue);
--   · PostgREST: que un PATCH con `?version=eq.N` y `Prefer: return=representation`
--     devuelva [] cuando coinciden 0 filas. Eso es la capa HTTP, no la base.
--   · Storage, que es otro esquema con sus propias políticas.
--
-- Correr: node test/db.mjs  (arranca el clúster, aplica esto y las migraciones,
-- ejecuta las pruebas y lo apaga todo).

create extension if not exists pgcrypto;

create schema if not exists auth;

-- La forma de auth.users que usan las migraciones y las pruebas: sólo las columnas
-- que se tocan. `instance_id`, `aud` y `role` están porque las pruebas las escriben.
create table if not exists auth.users (
  id          uuid primary key,
  instance_id uuid,
  aud         text,
  role        text,
  email       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- auth.uid() de Supabase: el `sub` del JWT de la petición. El real lo pone GoTrue
-- en `request.jwt.claims`; aquí lo pone la prueba con set_config, que es lo mismo
-- que ya hacía `aislamiento.sql` contra el proyecto de verdad.
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- ─── STORAGE ──────────────────────────────────────────────────────────────────
-- Lo mínimo del esquema `storage` de Supabase de lo que depende la migración de
-- capturas: los buckets, los objetos, `storage.foldername()` y la RLS forzada
-- sobre `storage.objects`. Las políticas NO se escriben aquí: las crea la
-- migración real, que es lo que se está probando.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name      text not null,
  /* Las DOS columnas de dueño que tiene el Storage real: `owner` (uuid, la
     antigua) y `owner_id` (text, la actual). `capturas.sql` escribe owner_id, y
     el arnés sólo tenía owner: la prueba de capturas no producía veredicto y
     test/db.mjs lo cazó. Se dejan las dos porque las dos existen allí. */
  owner     uuid,
  owner_id  text,
  metadata  jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);

-- La función real de Supabase: parte el nombre por «/» y devuelve todos los
-- segmentos MENOS el último, así que para «<uid>/<id>» el elemento [1] es el uid.
-- Es de lo que cuelga toda la propiedad de las capturas, así que importa que el
-- sustituto se comporte igual: se comprueba en capturas.sql.
create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable as $$
declare partes text[];
begin
  partes := string_to_array(name, '/');
  return partes[1:array_length(partes, 1) - 1];
end $$;

alter table storage.objects enable row level security;
alter table storage.objects force row level security;
revoke all on storage.objects from anon, public;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;
/* Y el USO del esquema, que es aparte de los permisos sobre la tabla: sin esto
   `insert into storage.objects` falla con «permission denied for schema storage»
   antes de que la RLS entre a decidir nada. Lo cazó test/db.mjs. */
grant usage on schema storage to anon, authenticated;
