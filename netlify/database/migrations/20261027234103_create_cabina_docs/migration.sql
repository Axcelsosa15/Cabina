CREATE TABLE "cabina_docs" (
	"user_id" text,
	"path" text,
	"coll" text GENERATED ALWAYS AS (regexp_replace(path, '/[^/]+$', '')) STORED,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cabina_docs_pkey" PRIMARY KEY("user_id","path"),
	CONSTRAINT "cabina_docs_path_forma" CHECK (char_length("path") <= 1000 and "path" ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$'),
	CONSTRAINT "cabina_docs_data_objeto" CHECK (jsonb_typeof("data") = 'object'),
	CONSTRAINT "cabina_docs_data_tamano" CHECK (pg_column_size("data") <= 262144),
	CONSTRAINT "cabina_docs_version_positiva" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE INDEX "cabina_docs_coll" ON "cabina_docs" ("user_id","coll");