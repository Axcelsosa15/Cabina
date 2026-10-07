-- LA PRUEBA QUE DECIDE SI DOS DISPOSITIVOS PUEDEN ESCRIBIR A LA VEZ.
--
-- Comprueba, contra el proyecto REAL, la única propiedad que hace que un
-- documento no se pierda en silencio:
--
--     UPDATE ... WHERE path = ? AND version = <la que leí>
--
--   coincide con 1 fila si nadie escribió desde mi lectura, y con 0 si alguien lo
--   hizo. Cero filas es el conflicto, y es lo que PostgREST devuelve como array
--   vacío con `Prefer: return=representation`.
--
-- Corre dentro de una transacción que termina SIEMPRE con un error a propósito:
-- todo se deshace y no queda nada en la base. El veredicto viaja en el mensaje.
--
-- Correr en el editor SQL del proyecto «cabina». Resultado esperado, exacto:
--
--   RESULTADO v_inicial=1 A_escribe=1 v_tras_A=2 B_con_version_vieja=0
--             B_no_piso_a_A=true A_con_version_nueva=1 v_tras_A2=3
--             cliente_no_decide_version=true borrado_viejo=0 borrado_bueno=1
--             delete_despues_de_update=0 update_despues_de_delete=0
--             aislamiento_sigue=0
--
-- Cualquier otro número es una pérdida de datos posible: no se publica hasta
-- arreglarla.
--
-- SABOTAJE OBLIGATORIO antes de confiar en esta prueba. Dentro de la misma
-- transacción, quitar la condición de versión del UPDATE de B:
--
--     update public.cabina_docs set data = ... where path = 'trades/t1';
--
-- Entonces `B_con_version_vieja` sale 1 y `B_no_piso_a_A` sale false: es
-- exactamente el last-write-wins que esto existe para impedir. Si con el sabotaje
-- la prueba sigue en verde, la prueba está mal y hay que arreglarla, no celebrarla.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  n int; m int; v int; v_leida_por_B int;
  res text := '';
  sinPisar boolean; noDecide boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-a@cabina.invalid', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-b@cabina.invalid', now(), now());

  -- ─── El documento existe, en versión 1 ────────────────────────────────────
  -- Las dos «sesiones» son del MISMO usuario: dos dispositivos, no dos personas.
  -- El aislamiento entre personas es aislamiento.sql; esto es concurrencia.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.cabina_docs (path, data) values ('trades/t1', '{"note":"original"}');
  select version into v from public.cabina_docs where path = 'trades/t1';
  res := res || 'v_inicial=' || v || ' ';

  -- ─── Los dos dispositivos leen la MISMA versión ───────────────────────────
  v_leida_por_B := v;          -- el dispositivo B se queda con la versión 1

  -- ─── A escribe primero, con la versión que leyó ───────────────────────────
  update public.cabina_docs set data = '{"note":"Setup validado"}'
   where path = 'trades/t1' and version = v;
  get diagnostics m = row_count;
  res := res || 'A_escribe=' || m || ' ';
  select version into v from public.cabina_docs where path = 'trades/t1';
  res := res || 'v_tras_A=' || v || ' ';

  -- ─── B intenta escribir con la versión VIEJA: no puede ────────────────────
  -- Éste es el caso del encargo: A guarda «Setup validado», B intenta guardar
  -- «Setup rechazado» partiendo de la misma versión. B tiene que coincidir con
  -- CERO filas, y el texto de A tiene que seguir ahí.
  update public.cabina_docs set data = '{"note":"Setup rechazado"}'
   where path = 'trades/t1' and version = v_leida_por_B;
  get diagnostics m = row_count;
  res := res || 'B_con_version_vieja=' || m || ' ';
  select (data->>'note') = 'Setup validado' into sinPisar
    from public.cabina_docs where path = 'trades/t1';
  res := res || 'B_no_piso_a_A=' || sinPisar || ' ';

  -- ─── Y con la versión buena sí: esto no es un candado ─────────────────────
  update public.cabina_docs set data = '{"note":"Setup rechazado"}'
   where path = 'trades/t1' and version = v;
  get diagnostics m = row_count;
  res := res || 'A_con_version_nueva=' || m || ' ';
  select version into v from public.cabina_docs where path = 'trades/t1';
  res := res || 'v_tras_A2=' || v || ' ';

  -- ─── EL CLIENTE NO DECIDE LA VERSIÓN ─────────────────────────────────────
  -- Un cliente que mande `version` en el cuerpo para quedarse clavado en la
  -- misma y volver a tener last-write-wins: el trigger lo descarta.
  update public.cabina_docs set data = '{"note":"intento"}', version = 1
   where path = 'trades/t1' and version = v;
  select version into n from public.cabina_docs where path = 'trades/t1';
  noDecide := n = v + 1;       -- la base siguió sumando, no obedeció el 1
  res := res || 'cliente_no_decide_version=' || noDecide || ' ';
  select version into v from public.cabina_docs where path = 'trades/t1';

  -- ─── BORRADO: tampoco a ciegas ───────────────────────────────────────────
  -- Un borrado concurrente es peor que un update: no deja nada que recuperar.
  delete from public.cabina_docs where path = 'trades/t1' and version = v_leida_por_B;
  get diagnostics m = row_count;
  res := res || 'borrado_viejo=' || m || ' ';
  delete from public.cabina_docs where path = 'trades/t1' and version = v;
  get diagnostics m = row_count;
  res := res || 'borrado_bueno=' || m || ' ';

  -- ─── Las dos carreras cruzadas del encargo §11 ───────────────────────────
  -- (1) A borra, B actualiza con la versión que leyó -> B coincide con 0 filas.
  insert into public.cabina_docs (path, data) values ('trades/t2', '{"n":1}');
  select version into v from public.cabina_docs where path = 'trades/t2';
  delete from public.cabina_docs where path = 'trades/t2' and version = v;
  update public.cabina_docs set data = '{"n":2}' where path = 'trades/t2' and version = v;
  get diagnostics m = row_count;
  res := res || 'update_despues_de_delete=' || m || ' ';

  -- (2) A actualiza, B borra con la versión que leyó -> B coincide con 0 filas,
  --     así que el borrado NO se lleva la edición de A.
  insert into public.cabina_docs (path, data) values ('trades/t3', '{"n":1}');
  select version into v from public.cabina_docs where path = 'trades/t3';
  update public.cabina_docs set data = '{"n":2}' where path = 'trades/t3' and version = v;
  delete from public.cabina_docs where path = 'trades/t3' and version = v;
  get diagnostics m = row_count;
  res := res || 'delete_despues_de_update=' || m || ' ';

  -- ─── La versión no abre ninguna puerta entre usuarios ─────────────────────
  -- B (otra persona) con la versión CORRECTA sigue sin poder tocar la fila de A:
  -- la RLS manda, y un conflicto de versión y un fallo de permiso son dos cosas
  -- distintas que no se mezclan.
  select version into v from public.cabina_docs where path = 'trades/t3';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  update public.cabina_docs set data = '{"intruso":true}'
   where path = 'trades/t3' and version = v;
  get diagnostics m = row_count;
  res := res || 'aislamiento_sigue=' || m || ' ';

  raise exception 'RESULTADO %', res;
end $$;
