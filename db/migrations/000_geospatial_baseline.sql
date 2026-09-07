-- Reconstructed from the working local catalog, without rows, roles, grants or ownership.
-- These imported dataset tables predate the application migrations (001 onward).
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.attractions (
  id BIGINT NOT NULL,
  name VARCHAR(500),
  category VARCHAR(150),
  rating REAL,
  review_count BIGINT,
  open_hours VARCHAR(200),
  source_group VARCHAR(11),
  duration VARCHAR(17),
  full_hours_json VARCHAR(226),
  about VARCHAR(4406),
  website VARCHAR(426),
  geom geography(Point, 4326),
  CONSTRAINT attractions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.settlements (
  geoname_id BIGINT NOT NULL,
  name VARCHAR(400),
  feature_code VARCHAR(5),
  country_code VARCHAR(2),
  admin1_code VARCHAR(2),
  population BIGINT,
  timezone VARCHAR(100),
  source VARCHAR(28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom geography(Geometry, 4326),
  CONSTRAINT settlements_pkey PRIMARY KEY (geoname_id)
);

-- PostgreSQL merges a redundant UNIQUE declared alongside a PRIMARY KEY in CREATE
-- TABLE. The imported schema has both, so preserve its UNIQUE in a separate statement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.settlements'::regclass
    AND conname='settlements_geoname_id_key') THEN
    ALTER TABLE public.settlements ADD CONSTRAINT settlements_geoname_id_key UNIQUE (geoname_id);
  END IF;
END;
$$;

-- Existing databases may adopt 000 after 001-016. Reject incompatible baseline tables
-- rather than silently recording a placeholder as migrated. Never rewrite existing data.
DO $$
BEGIN
  IF EXISTS (
    WITH expected(relation, column_name, column_type, required, default_expression) AS (VALUES
      ('attractions','id','bigint',true,NULL::text),
      ('attractions','name','character varying(500)',false,NULL),
      ('attractions','category','character varying(150)',false,NULL),
      ('attractions','rating','real',false,NULL),
      ('attractions','review_count','bigint',false,NULL),
      ('attractions','open_hours','character varying(200)',false,NULL),
      ('attractions','source_group','character varying(11)',false,NULL),
      ('attractions','duration','character varying(17)',false,NULL),
      ('attractions','full_hours_json','character varying(226)',false,NULL),
      ('attractions','about','character varying(4406)',false,NULL),
      ('attractions','website','character varying(426)',false,NULL),
      ('attractions','geom','geography(Point,4326)',false,NULL),
      ('settlements','geoname_id','bigint',true,NULL),
      ('settlements','name','character varying(400)',false,NULL),
      ('settlements','feature_code','character varying(5)',false,NULL),
      ('settlements','country_code','character varying(2)',false,NULL),
      ('settlements','admin1_code','character varying(2)',false,NULL),
      ('settlements','population','bigint',false,NULL),
      ('settlements','timezone','character varying(100)',false,NULL),
      ('settlements','source','character varying(28)',false,NULL),
      ('settlements','created_at','timestamp with time zone',true,'now()'),
      ('settlements','geom','geography(Geometry,4326)',false,NULL)
    ), actual AS (
      SELECT c.relname::text AS relation, a.attname::text AS column_name,
        format_type(a.atttypid,a.atttypmod) AS column_type, a.attnotnull AS required,
        pg_get_expr(d.adbin,d.adrelid) AS default_expression,
        a.attidentity, a.attgenerated
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname IN ('attractions','settlements')
        AND a.attnum>0 AND NOT a.attisdropped
    )
    SELECT 1 FROM expected e FULL JOIN actual a USING (relation,column_name)
    WHERE e.column_type IS DISTINCT FROM a.column_type
      OR e.required IS DISTINCT FROM a.required
      OR e.default_expression IS DISTINCT FROM a.default_expression
      OR a.attidentity <> '' OR a.attgenerated <> ''
  ) THEN
    RAISE EXCEPTION 'Existing baseline columns differ from 000_geospatial_baseline; reconcile schema explicitly before migrating';
  END IF;

  IF EXISTS (
    WITH expected(relation, name, definition) AS (VALUES
      ('attractions','attractions_pkey','PRIMARY KEY (id)'),
      ('settlements','settlements_pkey','PRIMARY KEY (geoname_id)'),
      ('settlements','settlements_geoname_id_key','UNIQUE (geoname_id)')
    )
    SELECT 1 FROM expected e LEFT JOIN pg_constraint c
      ON c.conrelid=to_regclass('public.' || e.relation) AND c.conname=e.name
    WHERE pg_get_constraintdef(c.oid,true) IS DISTINCT FROM e.definition
  ) THEN
    RAISE EXCEPTION 'Existing baseline keys differ from 000_geospatial_baseline; reconcile schema explicitly before migrating';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS attractions_category_ix ON public.attractions (category);
CREATE INDEX IF NOT EXISTS attractions_geom_gist_idx ON public.attractions USING GIST (geom);
CREATE INDEX IF NOT EXISTS settlements_admin1_code_idx ON public.settlements (admin1_code);
CREATE INDEX IF NOT EXISTS settlements_feature_code_idx ON public.settlements (feature_code);
CREATE INDEX IF NOT EXISTS settlements_population_idx ON public.settlements (population DESC);
CREATE INDEX IF NOT EXISTS settlements_geom_gist ON public.settlements USING GIST (geom);
-- Preserve the imported duplicate index name for exact schema parity; cleanup is separate work.
CREATE INDEX IF NOT EXISTS settlements_geom_1788562143133 ON public.settlements USING GIST (geom);
