# Raw provider ETL

Standalone Python 3.11+ code; never imported or launched by Next.js. Dependencies live in
`requirements.txt`. `process_raw.py` is the CLI, `waypost_etl/pipeline.py` handles S3 and JSON,
and `waypost_etl/providers/here.py` owns pure HERE validation/transformation. Add future
provider modules alongside it; this first CLI deliberately accepts only HERE routing raw wrapper v1.
`tests/` uses unittest and mocked S3 clients, with no AWS calls or credentials needed.

## Local setup (PowerShell, from repository root)

```powershell
python -m venv etl/.venv
etl/.venv/Scripts/python.exe -m pip install -r etl/requirements.txt
etl/.venv/Scripts/python.exe -m unittest discover -s etl/tests -t etl -v
```

On macOS/Linux, use `python3` and `etl/.venv/bin/python` instead. No virtualenv activation
is required. The raw-to-processed CLI does not load `.env.local`; the database loader below
reads only `DATABASE_URL` from it as a fallback. Neither depends on the application's archive enable flag.

## Process the existing smoke-test object

```powershell
$env:AWS_PROFILE = "travel-dev"
$env:AWS_REGION = "us-east-1"
aws sso login --profile travel-dev
etl/.venv/Scripts/python.exe etl/process_raw.py --bucket geospatial-learning-sergei-2026 --key raw/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json
```

boto3 uses the default credential chain, including the selected SSO profile. `--region`
overrides `AWS_REGION`/`AWS_DEFAULT_REGION`; otherwise the shared AWS config supplies it.
No credentials are in the code. S3 connection/read timeouts are 10/30 seconds with at most
three attempts using standard SDK retries. This CLI processes exactly one specified object.

The identity needs `s3:GetObject` on the raw key and `s3:PutObject` on the processed prefix,
plus permissions required by the bucket's encryption policy. No list/delete permission is
needed to run ETL. Output is written to the same bucket at:

```text
processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json
```

Verify with these read-only commands (processed `GetObject` access is needed for download):

```powershell
aws s3api head-object --bucket geospatial-learning-sergei-2026 --key processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json --profile travel-dev --region us-east-1
aws s3 cp s3://geospatial-learning-sergei-2026/processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json - --profile travel-dev --region us-east-1
```

Check the source bucket/key and fetched time, route counts, and totals against the raw JSON.
Rerun the ETL command to verify the same destination key and record are reused. Only `raw/`
is replaced with `processed/`; no run timestamp or UUID is added to the key. Reruns overwrite
the same object and refresh `processedAt`; geometry, metrics, and lineage remain deterministic. A versioned bucket may retain prior versions of that same
processed key. Raw content is never written, modified, or deleted.

## Processed schema v2

One JSON object represents one raw response, including all route alternatives:

```json
{
  "schemaVersion": 2,
  "processedAt": "2026-09-07T01:02:03Z",
  "transformation": {"name": "here-routing", "version": "2.0.0"},
  "geometryCrs": "EPSG:4326",
  "provider": "here",
  "domain": "routing",
  "fetchedAt": "2026-09-06T23:03:21.654Z",
  "source": {"bucket": "source-bucket", "key": "raw/routing/here/...", "schemaVersion": 1},
  "routeCount": 1,
  "sectionCount": 2,
  "routes": [{
    "geometry": {"type": "LineString", "coordinates": [[1, 0], [3, 1], [5, 2]]},
    "routeIndex": 0,
    "sectionCount": 2,
    "summary": {"distanceMeters": 3000, "durationSeconds": 300, "baseDurationSeconds": null},
    "summarySectionCounts": {"distanceMeters": 2, "durationSeconds": 2, "baseDurationSeconds": 0}
  }]
}
```

`fetchedAt` is preserved exactly from the raw wrapper. Its UTC date must agree with the raw
key's partition. Top-level `sectionCount` counts sections across all returned routes, including
alternatives; it is not a traveled-route count. `routeIndex` is the zero-based provider order.
Distances and durations come exclusively from HERE section summaries: `length` in meters,
`duration` and `baseDuration` in seconds. Totals are reported only when every section supplies
that metric; otherwise they are `null`, with `summarySectionCounts` exposing completeness.
Missing summaries and missing/null metrics are allowed. Zero is a valid measurement.

Validation rejects unsupported/non-integer wrapper versions, incorrect provider/domain,
invalid or timezone-less timestamps, empty/malformed routes or sections, non-object summaries,
negative/nonnumeric/non-finite metrics, invalid JSON/UTF-8, duplicate JSON keys, and mismatched
date partitions. All validation completes before any output write. Unlike the UI normalizer,
ETL processes all routes and does not generate waypoint counts, application diagnostics, or
travel state. Extra provider fields are not copied.

Each route now requires decodable section polylines with at least two positions per section.
The decoder is ported from `src/lib/routing/here-normalization.ts`: it preserves section order,
consumes but omits third-dimension ordinates, and removes consecutive identical coordinates,
including shared section endpoints. Nonshared endpoints are preserved without interpolation
or snapping. The result must have at least two positions after deduplication.
Coordinates are 2D `[longitude, latitude]` in WGS84 / EPSG:4326; ETL additionally rejects
coordinates outside longitude [-180, 180] or latitude [-90, 90]. GeoJSON geometry contains
only `type` and `coordinates`; `geometryCrs` documents the record-wide interpretation rather
than adding a legacy GeoJSON `crs` member. Invalid geometry fails the whole object before writing.

`schemaVersion: 2` identifies the new processed contract. `source.schemaVersion: 1` still
identifies the raw wrapper. `transformation.version: "2.0.0"` identifies the implementation
and can change independently of schema version. `processedAt` is the UTC time the record
was transformed, not the raw fetch time. Existing v1 processed keys are reused and upgraded
on rerun; no raw objects are modified.

Logs are JSON lines on stderr with timestamp, level, event, source/destination identifiers,
and safe failure fields. Success exits 0; validation/AWS/runtime failure exits 1 (CLI argument
errors exit 2). Validation errors identify the field; AWS errors report the service error code.
Payloads, credentials, SDK error messages, and request URLs are not logged.

For local diagnosis, append `--debug` to the same processing command. Failure logs then
include a `traceback` array with file names, line numbers, and function names alongside
`errorType` and the existing safe validation/AWS error fields. This deliberately omits
arbitrary exception messages, source text, local variables, and chained exception values,
which may contain credentials or provider data. It does not enable boto3 wire logging.
Debug mode still processes/writes the specified object; it is not a dry run.

This first stage reads one object into memory and has no batch scheduler, retry queue, or
infrastructure deployment. Processed analytics still derive from provider-controlled content;
apply the appropriate retention policy to both raw and processed prefixes. This work does
not configure or change bucket policies, lifecycle rules, or other AWS infrastructure.

## Load processed HERE into local PostGIS

`load_processed.py` reads one specified S3 object using boto3 and writes its validated
routes into `public.provider_routing_ingestion` using psycopg 3. It never writes or deletes
S3 objects. The Next.js application does not read this table or launch the loader.

The existing `trip_versions` table belongs to a user trip and `provider_route_cache` requires
a trip version, waypoint count, and cache expiry. S3 analytics has no trip association and
can contain multiple route alternatives, so neither is an appropriate destination. The new
dedicated ingestion table preserves that separation and remains provider-controlled data,
subject to the applicable retention policy, rather than permanent application trip state.
No automatic cleanup or retention infrastructure is added here.

Migration `db/migrations/016_provider_routing_ingestion.sql` follows the existing numbered,
checksum-tracked migration runner. It reuses the installed PostGIS extension. Apply it once
using the repository command; the loader never creates or alters schema:

```powershell
etl/.venv/Scripts/python.exe -m pip install -r etl/requirements.txt
npm run db:migrate
```

The table uses `geometry geometry(LineString,4326) NOT NULL`, with a GiST index named
`provider_routing_ingestion_geometry_gix`. Its primary key is
`(provider, raw_s3_bucket, raw_s3_key, route_index)`. Metadata, counts, timestamps, and
lineage have NOT NULL/check constraints. Nullable double-precision metrics preserve
missing values; present metrics must be finite/nonnegative. The geometry must be nonempty,
valid, and within WGS84 bounds. Schema version, raw schema version, transformation name,
transformation version, and summary completeness counts are retained alongside the route.

`DATABASE_URL` in the process environment takes precedence. Otherwise the loader reads that
one variable from the repository's `.env.local`, using python-dotenv with interpolation
disabled. `--env-file PATH` changes that fallback. No file is edited, other secrets are not
loaded into the environment, and connection strings are never logged. AWS continues to use
the default credential chain. The S3 identity needs only `GetObject` on the processed object
(plus any required KMS decrypt permission); the database identity needs SELECT/INSERT/UPDATE
on this table. No RDS or other AWS infrastructure is involved.
For an existing RDS instance, use the explicit target described below; local stays the default.

Run from the repository root:

```powershell
$env:AWS_PROFILE = "travel-dev"
$env:AWS_REGION = "us-east-1"
# If the SSO session has expired:
aws sso login --profile travel-dev
etl/.venv/Scripts/python.exe etl/load_processed.py `
  --bucket geospatial-learning-sergei-2026 `
  --key processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json

# Read-only verification, no AWS access needed:
etl/.venv/Scripts/python.exe etl/verify_loaded.py `
  --bucket geospatial-learning-sergei-2026 `
  --key processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json
```

Rerun the exact same loader and verification commands: `rowCount` stays constant. Every
route uses parameterized `INSERT ... ON CONFLICT DO UPDATE`, refreshing metrics, geometry,
processing metadata and `loaded_at` without changing its identity. All routes are validated
before the database connection is opened and upserted in one transaction. Failures roll back
the whole object, including any earlier route updates. If preexisting rows for that raw source
exceed the submitted route count, the loader rejects the replacement and rolls back rather
than deleting rows. Concurrent identical loads are handled by the primary key/upsert; if
different revisions are deliberately loaded, the last committed load wins.

Validation accepts processed schema 2 / transformation `here-routing` version `2.0.0` /
raw schema 1 only. It checks provider/domain, timestamps, EPSG:4326, required raw lineage,
the raw-to-processed key mapping and UTC partition, route indices/counts, metric completeness,
and finite 2D LineStrings with no consecutive duplicate positions. Malformed input causes
exit 1 before any write. Unknown future versions require an explicit validator/migration update.

JSON logs include `processed_object_read`, `processed_validated`, `db_upsert_committed`,
and `load_succeeded`/`load_failed`, with route/row counts. `rowCount` is the stored count for
the source, not the number of newly inserted rows. DB failures report SQLSTATE, never SQL
parameters, driver messages, full geometry or credentials. `--debug` adds safe traceback
locations just as in the raw ETL CLI. Configuration/SDK/DB errors exit 1; argument errors exit 2.

The read-only verification script runs this parameterized SQL and also inspects `pg_indexes`:

```sql
SELECT provider, route_index, section_count, distance_meters, duration_seconds,
       base_duration_seconds,
       ST_GeometryType(geometry) AS geometry_type,
       ST_SRID(geometry) AS srid,
       ST_NPoints(geometry) AS coordinate_count,
       ST_IsValid(geometry) AS geometry_valid
FROM public.provider_routing_ingestion
WHERE processed_s3_bucket = %s AND processed_s3_key = %s
ORDER BY route_index;
```

Offline unit tests and local integration check:

```powershell
etl/.venv/Scripts/python.exe -m unittest discover -s etl/tests -t etl -v
etl/.venv/Scripts/python.exe etl/integration/verify_postgis.py
```

Unit tests need neither AWS nor PostgreSQL. The integration check needs the migrated local
database but no AWS: it tests insertion, repeat upsert, changed metrics, PostGIS geometry,
GiST presence, and rollback on a failed later route. All fixture writes are enclosed in a
forced-rollback transaction, leaving zero fixture rows without DELETE/TRUNCATE/DROP.

## Explicit RDS migration and ETL target

Administrative commands accept `--target rds`. Without it, migrations and loaders continue
using local `DATABASE_URL`. The Next.js pool is unchanged and ignores the RDS settings.
RDS selection never falls back to `DATABASE_URL`, never rewrites `.env.local`, and does not
provision or change AWS infrastructure. Existing local SQL migrations are reused unchanged.

Configure **separate** `RDS_DATABASE_URL` and `RDS_SSL_ROOT_CERT` environment variables,
or put them in a private, git-ignored `.env.rds.local` file. Do not copy real values into
`.env.example`. The following values are placeholders only:

```dotenv
RDS_DATABASE_URL=postgresql://<user>:<percent-encoded-password>@<rds-dns-endpoint>:5432/travel
RDS_SSL_ROOT_CERT=C:/path/to/global-bundle.pem
```

Use the real RDS DNS hostname matching its certificate, not a localhost alias. The configured
CA path must point to the existing AWS RDS global PEM bundle. Python forces `sslmode=verify-full`;
Node uses the CA with `rejectUnauthorized: true` and hostname verification. Insecure SSL modes
are rejected. Only `sslmode=verify-full` and `sslrootcert` are supported URL query options;
`RDS_SSL_ROOT_CERT` takes precedence over URL `sslrootcert`. Use forward slashes in Windows
paths. Environment values override the selected private file. No passwords or URLs are logged.

The migration runner checks PostGIS installation/availability **before writing any migration
metadata**. `000_geospatial_baseline.sql` enables the extension if absent and creates the real
`public.attractions` and `public.settlements` schemas before 001–016. Fresh databases no longer
need a manual baseline restore. No dataset/user rows are copied. Applied migration checksums
are still enforced. `--check-only` performs read-only preflight without creating tables.
See [schema provisioning and clean-database validation](../db/README.md) for baseline details.

From the repository root, with the private RDS file configured:

```powershell
# Verified TLS and PostGIS availability preflight (read-only).
node --env-file=.env.rds.local scripts/migrate.mjs --target rds --check-only

# Apply 000 baseline and 001–016 to RDS only.
node --env-file=.env.rds.local scripts/migrate.mjs --target rds

$env:AWS_PROFILE = "travel-dev"
$env:AWS_REGION = "us-east-1"
# If needed: aws sso login --profile travel-dev

# Before the first load, record rowCount from this read-only command.
etl/.venv/Scripts/python.exe etl/verify_loaded.py --target rds --env-file .env.rds.local `
  --bucket geospatial-learning-sergei-2026 `
  --key processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json

etl/.venv/Scripts/python.exe etl/load_processed.py --target rds --env-file .env.rds.local `
  --bucket geospatial-learning-sergei-2026 `
  --key processed/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json
```

Run the verification command again, then repeat the exact loader and verification commands.
For a previously unloaded object, expect `rowCount: 0 -> 1 -> 1`, route index 0, 9 sections,
2,555,337 meters, 81,674 seconds, `ST_LineString`, SRID 4326, 16,902 points, and validity true.
Verification also reports database/server/PostGIS versions, TLS status, and index definitions;
confirm `provider_routing_ingestion_geometry_gix` uses GiST. If the initial count is already 1,
report `1 -> 1 -> 1` honestly instead of deleting the existing row to manufacture a zero baseline.

If settings are already present in the command environment, omit `--env-file` from these
commands; keep `--target rds`. Neither command changes the environment of the running app.
Offline configuration checks: `node scripts/verify-database-target.mjs` and the Python unit
test command above cover target isolation, CA requirements, and rejection of SSL downgrades.
