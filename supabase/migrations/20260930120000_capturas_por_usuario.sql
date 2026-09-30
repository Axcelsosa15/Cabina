-- Aplicada al proyecto Supabase «cabina» el 2026-09-30.
--
-- Las capturas de las operaciones y de los setups. Un bucket PRIVADO: no hay URL
-- pública de ninguna imagen, cada una se pide con el token de su dueño.
--
-- Ruta de cada objeto: «<user_id>/<id>». La primera carpeta ES el dueño, y las
-- políticas de abajo sólo dejan tocar lo que cuelga de la carpeta propia. Igual
-- que en cabina_docs, la privacidad no depende de la app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capturas', 'capturas', false, 20971520,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy capturas_leer_lo_mio on storage.objects
  for select to authenticated
  using (bucket_id = 'capturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy capturas_subir_lo_mio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy capturas_borrar_lo_mio on storage.objects
  for delete to authenticated
  using (bucket_id = 'capturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Sin política de UPDATE: una captura no se reescribe, se borra y se sube otra.
