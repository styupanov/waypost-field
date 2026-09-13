# TRAVEL schema provisioning

The full schema is now defined by `migrations/000_geospatial_baseline.sql` followed by
001–018. The migration runner sorts these numbered files and records each checksum in
`public.waypost_schema_migrations`. Existing 001–016 files were not rewritten.

## Missing baseline and its source

The working local database was inspected through PostgreSQL catalogs only. Two imported
dataset tables were missing from version control:

- `public.attractions`: 12 columns, bigint primary key `id`, imported descriptive fields,
  nullable `geography(Point,4326)` in `geom`, category B-tree and geography GiST indexes.
- `public.settlements`: 10 columns, bigint `geoname_id`, name/feature/country/admin fields,
  population/timezone/source, required `created_at DEFAULT now()`, and nullable
  `geography(Geometry,4326)`. Its primary/unique keys and all existing indexes are preserved.

The precise varchar widths, real/bigint types, nullability, defaults, keys, and geography
typmods in 000 match the local catalog. IDs have no sequences/default generators. There
are no baseline triggers, custom functions, enums/domains, or other application tables
outside the numbered chain. PostGIS was also previously an implicit prerequisite; 000 now
enables the extension if absent. The PostGIS extension package must be installed on the
server, and the provisioning identity must have permission to enable it. On RDS the already
enabled extension is reused.

Only `attractions` is a missing forward dependency in the SQL migration chain: 001, 009,
and 015 reference its `id`. The other foreign-key/ALTER/INSERT dependencies are created by
earlier numbered migrations, or earlier statements in the same migration. `settlements`
is additionally necessary for the application's overnight-candidate queries. Neither is a
placeholder table. The baseline does not create trip/user/cache/analytics tables belonging
to later migrations.

For fidelity, 000 preserves `settlements_geoname_id_key` alongside the primary key, and
both existing settlements GiST indexes (including `settlements_geom_1788562143133`). These
redundancies predate migrations; removing them or narrowing settlements to Point would be
a separate change. The redundant UNIQUE is added separately because PostgreSQL merges it
with the primary key when both are specified inside the same CREATE TABLE statement.

## Safety and existing databases

000 uses IF NOT EXISTS for the extension, tables and indexes, and guards the additional
UNIQUE constraint. It checks existing baseline columns/types/nullability/defaults and key
definitions, rejecting incompatible placeholders rather than silently adopting them.
When used on an already migrated compatible database, 000 can be recorded before the
runner skips the checksum-matching 001–016. No existing migration history is fabricated.

No rows, secrets, roles, users, ownership clauses, local grants, or sequence values were
exported. A fresh database has empty dataset and application tables. Dataset import is
separate from schema provisioning: search/recommendation features still require their
datasets, while the independent HERE ingestion/analytics loader can run immediately.
The working local database and `.env.local` remain unchanged; it was a read-only schema
reference during this work.

## Commands

Local provisioning still uses `DATABASE_URL`:

```powershell
node --env-file=.env.local scripts/migrate.mjs --check-only
node --env-file=.env.local scripts/migrate.mjs
```

RDS is always explicit and keeps the application on its local database:

```powershell
node --env-file=.env.rds.local scripts/migrate.mjs --target rds --check-only
node --env-file=.env.rds.local scripts/migrate.mjs --target rds
```

The private RDS file supplies `RDS_DATABASE_URL` and `RDS_SSL_ROOT_CERT`. Verified TLS is
mandatory. No credentials are printed. Preflight checks PostGIS installation/availability;
it no longer rejects an empty database for missing tables that 000 now owns. A null
`postgisVersion` in preflight means the package is available but 000 must enable it.
`--check-only` never enables extensions or creates tables.

## Clean-database validation

```powershell
node --env-file=.env.local scripts/verify-clean-database.mjs
node scripts/verify-database-target.mjs
```

The clean test requires CREATEDB on the local server. It reads only schema metadata from
the reference database, creates a unique `waypost_schema_check_<uuid>` database from
`template0`, and verifies there are initially no public tables or PostGIS extension. It
runs the real migration CLI twice, compares the resulting catalog against the reference,
replays 000, checks incompatible baseline rejection, and checks that all non-migration
tables are empty. Cleanup drops only the exact disposable database created by that run,
without FORCE/CASCADE; it never drops the reference database or existing databases.

`scripts/schema-catalog.mjs` compares tables, ordered columns/types/nullability/defaults,
primary/foreign/unique/check constraints, index definitions, geometry and geography
types/SRIDs/dimensions, and application functions/triggers. It excludes extension-owned
objects, roles, ownership, grants, and PG18's separate NOT NULL constraint rows (nullability
is compared through columns). It does not sample or copy application data.

Validation on 2026-09-07 passed from an empty PostgreSQL 16.1 database with PostGIS enabled
by 000 (3.4.1). After 000–016 and replay: **zero differences** against the working catalog
across 17 tables, 163 columns, 96 constraints, 48 indexes, 7 spatial columns, 3 triggers,
and 3 functions. No data was copied. Only after this passed was the same 17-file chain
applied to RDS PostgreSQL 18.6 / PostGIS 3.6.3.

The real processed HERE object dated `2026-09-06T23-03-21.654Z` was then loaded twice
using explicit `--target rds`, verified TLS and the `travel-dev` AWS profile. Read-only
SQL checks proved the object-specific row count was **0 → 1 → 1**. The stored route
has provider `here`, route index 0, 9 sections, distance 2,555,337 meters, duration and
base duration 81,674 seconds. PostGIS reports `ST_LineString`, SRID 4326, 16,902 points,
and `ST_IsValid = true`. `provider_routing_ingestion_geometry_gix` exists as a GiST
index. No S3 objects or local application data/configuration were changed.

See [the ETL documentation](../etl/README.md) for processed HERE loader and SQL verification
commands. RDS ingestion uses the same deterministic source/route key as local ingestion.

Migration 018 adds the singleton `exploration_intelligence_metadata` row. Its opaque
`model_version` identifies the active pair of H3 read-model tables. A successful rebuild
updates the tables and version in one transaction; runtime normalization cache keys include
the version, so no application restart or manual cache endpoint is required after rebuilding.
