-- El sello: `updated_at` y `version` los pone el servidor, no el cliente, igual
-- que en supabase/migrations/20261007010000_cabina_docs_version_occ.sql. Un
-- UPDATE ... WHERE version = <la que leí> que toca 0 filas ES el conflicto.
CREATE OR REPLACE FUNCTION cabina_docs_sello() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := 1;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER cabina_docs_sello BEFORE INSERT OR UPDATE ON cabina_docs
  FOR EACH ROW EXECUTE FUNCTION cabina_docs_sello();
