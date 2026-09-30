-- LA PRUEBA QUE DECIDE SI CABINA PUEDE TENER USUARIOS.
--
-- Crea dos usuarios de usar y tirar (A y B) DENTRO de una transacción, hace que B
-- intente leer, cambiar, borrar y suplantar lo de A, prueba el acceso sin sesión,
-- y termina SIEMPRE con un error a propósito: así todo se deshace y no queda nada
-- en la base. El veredicto viaja en el mensaje de ese error.
--
-- Correr en el editor SQL del proyecto «cabina» (o con execute_sql). Resultado
-- esperado, exacto:
--
--   RESULTADO A_ve_lo_suyo=2 B_lee_de_A=0 B_modifica_de_A=0 B_borra_de_A=0
--             B_escribe_como_A_bloqueado=true B_ve_solo_lo_suyo=1
--             anonimo_bloqueado=true A_intacto=1
--
-- Cualquier otro número es una fuga: no se publica nada hasta arreglarla.
--
-- SABOTAJE, 2026-09-30: con la regla de lectura cambiada a `using (true)` dentro
-- de la misma transacción, B leyó 1 documento de A. La prueba caza la fuga.
-- Después se comprobó que no quedaba nada: 0 documentos, 0 usuarios de prueba y
-- la regla real intacta.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  n int; m int; res text := '';
  bloqueado boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prueba-a@cabina.invalid', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prueba-b@cabina.invalid', now(), now());

  -- A escribe lo suyo
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.cabina_docs (path, data) values ('settings/main', '{"secreto":"de A"}'), ('trades/t1', '{"pnl":-50}');
  select count(*) into n from public.cabina_docs;
  res := res || 'A_ve_lo_suyo=' || n || ' ';

  -- B intenta todo contra lo de A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.cabina_docs;
  res := res || 'B_lee_de_A=' || n || ' ';
  update public.cabina_docs set data = '{"pisado":true}'; get diagnostics m = row_count;
  res := res || 'B_modifica_de_A=' || m || ' ';
  delete from public.cabina_docs; get diagnostics m = row_count;
  res := res || 'B_borra_de_A=' || m || ' ';
  bloqueado := false;
  begin
    insert into public.cabina_docs (user_id, path, data) values (a, 'trades/intruso', '{}');
  exception when others then bloqueado := true;
  end;
  res := res || 'B_escribe_como_A_bloqueado=' || bloqueado || ' ';
  bloqueado := false;
  begin
    update public.cabina_docs set user_id = a;
  exception when others then bloqueado := true;
  end;
  insert into public.cabina_docs (path, data) values ('settings/main', '{"de":"B"}');
  select count(*) into n from public.cabina_docs;
  res := res || 'B_ve_solo_lo_suyo=' || n || ' ';

  -- sin sesión
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  bloqueado := false;
  begin
    select count(*) into n from public.cabina_docs;
  exception when insufficient_privilege then bloqueado := true;
  end;
  res := res || 'anonimo_bloqueado=' || bloqueado || ' ';

  -- A sigue intacto
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.cabina_docs where data->>'secreto' = 'de A';
  res := res || 'A_intacto=' || n;

  raise exception 'RESULTADO %', res;
end $$;
