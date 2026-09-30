-- AISLAMIENTO DEL BUCKET «capturas». Mismo patrón que aislamiento.sql: dos usuarios
-- de usar y tirar dentro de una transacción que termina SIEMPRE con un error a
-- propósito, así que no queda nada. El veredicto viaja en el mensaje del error.
--
-- Resultado esperado, exacto:
--
--   RESULTADO A_ve_lo_suyo=1 A_fuera_de_su_carpeta_bloqueado=true B_lee_de_A=0
--             B_sube_en_carpeta_de_A_bloqueado=true anonimo_ve=0 A_intacto=1
--
-- LO QUE NO PRUEBA: el borrado. Supabase prohíbe `delete from storage.objects`
-- desde SQL con un trigger (storage.protect_delete), sea cual sea la política. La
-- política de borrado usa exactamente la misma expresión que la de lectura.
--
-- Corrida el 2026-09-30 contra el proyecto real: resultado exacto el de arriba.
-- SABOTAJE, mismo día: con la lectura cambiada a `using (true)` dentro de la
-- transacción, B leyó 1 objeto de A. Después: política real intacta, 0 objetos,
-- 0 usuarios de prueba.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  n int; res text := ''; bloqueado boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cap-a@cabina.invalid', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cap-b@cabina.invalid', now(), now());
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name, owner_id) values ('capturas', a::text || '/c1', a::text);
  select count(*) into n from storage.objects where bucket_id = 'capturas';
  res := res || 'A_ve_lo_suyo=' || n || ' ';
  bloqueado := false;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('capturas', 'otra/c2', a::text);
  exception when others then bloqueado := true; end;
  res := res || 'A_fuera_de_su_carpeta_bloqueado=' || bloqueado || ' ';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'capturas';
  res := res || 'B_lee_de_A=' || n || ' ';
  bloqueado := false;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('capturas', a::text || '/intruso', b::text);
  exception when others then bloqueado := true; end;
  res := res || 'B_sube_en_carpeta_de_A_bloqueado=' || bloqueado || ' ';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'capturas';
  res := res || 'anonimo_ve=' || n || ' ';
  perform set_config('role', 'postgres', true);
  select count(*) into n from storage.objects where bucket_id = 'capturas' and name = a::text || '/c1';
  res := res || 'A_intacto=' || n;
  raise exception 'RESULTADO %', res;
end $$;
