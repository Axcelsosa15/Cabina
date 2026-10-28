// Mismo almacén de documentos que supabase/migrations: rutas «coleccion/doc»
// (settings/main, days/2026-09-29, trades/<id>) por usuario. Sin RLS aquí: el
// aislamiento lo impone la función que consulta, filtrando siempre por user_id.
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const cabinaDocs = pgTable(
  "cabina_docs",
  {
    userId: text("user_id").notNull(),
    path: text().notNull(),
    coll: text().generatedAlwaysAs(sql`regexp_replace(path, '/[^/]+$', '')`),
    data: jsonb().notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // La pone el trigger de la migración de sello, no el cliente.
    version: integer().notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.path] }),
    index("cabina_docs_coll").on(t.userId, t.coll),
    check(
      "cabina_docs_path_forma",
      sql`char_length(${t.path}) <= 1000 and ${t.path} ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$'`,
    ),
    check("cabina_docs_data_objeto", sql`jsonb_typeof(${t.data}) = 'object'`),
    check("cabina_docs_data_tamano", sql`pg_column_size(${t.data}) <= 262144`),
    check("cabina_docs_version_positiva", sql`${t.version} >= 1`),
  ],
);
