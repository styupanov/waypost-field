This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Server-side routing uses HERE when `ROUTING_PROVIDER` is unset or set to `here`; provide
`HERE_API_KEY` in either case. The optional local comparison fallback remains available
with `ROUTING_PROVIDER=valhalla` and `VALHALLA_URL=http://localhost:8002`. All product and
domain consumers use the provider-neutral routing facade.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Raw HERE ingestion (opt-in)

Set `RAW_PROVIDER_ARCHIVE_ENABLED=true`, `RAW_PROVIDER_ARCHIVE_BUCKET=geospatial-learning-sergei-2026`,
and `AWS_REGION=us-east-1` in the server environment. Locally, set `AWS_PROFILE=travel-dev`
and run `aws sso login --profile travel-dev` before starting Next.js. The SDK uses its default
credential chain; deployments can omit the profile and use an IAM role.

Successful HERE JSON bodies are wrapped with schema version, provider, domain, and UTC fetched time
and written under `raw/routing/here/year=YYYY/month=MM/day=DD/` before normalization.
Request URLs, headers, and credentials are never passed to ingestion. Writes are awaited with a
three-second limit and no SDK retries; failures produce a sanitized warning and routing continues.
This is best-effort ingestion with no retry queue or read path. HERE data remains provider-controlled
temporary content, separate from permanent trip data: configure S3 lifecycle expiration for this
prefix according to the applicable retention requirements before enabling it.

For a real smoke test, the SSO role needs `s3:PutObject` on the bucket's `raw/routing/here/*` prefix
(plus permissions required by its encryption policy). Enable the settings above, restart the app,
and calculate a fresh HERE final route with a configured `HERE_API_KEY`. With an identity that has
read/list access, inspect the new object under the current UTC date and verify the metadata and
original response body. Disable ingestion afterward if only testing.
`npm run test:here-routing` and `npm run test:raw-provider-archive` make no real AWS calls.

## Production web container

Build the standalone Next.js application from the repository root:

```powershell
docker build --platform linux/amd64 -t waypost-web:local .
```

The runtime image contains the traced standalone server, `public/` assets, and compiled
Next.js static assets. It runs as UID/GID `1001:1001`, listens on `0.0.0.0`, accepts `PORT`
at runtime, logs to stdout/stderr, and exposes `GET /api/health` without contacting the
database or an external provider.

For local Windows testing against Valhalla published on host port 8002, use
`host.docker.internal`; `localhost` inside the web container refers to that container:

```powershell
docker run --rm --name waypost-web -p 3000:3000 `
  -e PORT=3000 `
  -e ROUTING_PROVIDER=valhalla `
  -e VALHALLA_URL=http://host.docker.internal:8002 `
  -e DATABASE_URL=<local-container-reachable-postgres-url> `
  -e AUTH_SECRET=<development-auth-secret> `
  -e AUTH_TRUST_HOST=true `
  waypost-web:local
```

Provider features additionally require `HERE_API_KEY`, `GOOGLE_MAPS_API_KEY`,
`GEMINI_API_KEY`, and `GEMINI_MODEL`. Raw HERE archiving is opt-in through
`RAW_PROVIDER_ARCHIVE_ENABLED`, `RAW_PROVIDER_ARCHIVE_BUCKET`, and `AWS_REGION`; local
containers can receive AWS credentials through an explicit development-only mount or
credential source. Deployed containers must omit `AWS_PROFILE` and use their ECS task role.
Local credential authentication also remains opt-in through the documented
`LOCAL_AUTH_*` settings. No application environment variable uses a `NEXT_PUBLIC_` prefix,
so provider keys and database/auth configuration are server-only and are not embedded in
browser JavaScript.

For AWS RDS, set `RDS_SSL_ROOT_CERT=/app/certs/global-bundle.pem` and supply `DATABASE_URL`
as a secret. The production image contains the AWS RDS global CA bundle at that path. When
the CA variable is set, the application validates the PEM before creating the pool and uses
Node TLS with certificate and hostname verification. An optional URL `sslmode` must be
`verify-full`; insecure modes are rejected. Local connections keep their existing behavior
when `RDS_SSL_ROOT_CERT` is unset.

The bundled public CA comes from
`https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` and is pinned by SHA-256
`e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3`.

Set `AUTH_TRUST_HOST=true` only when the container is behind the deployment's trusted ingress
(or for the local published-port smoke test). Keep the default false for untrusted direct-host
deployments.

## Learn More

## Exploration Intelligence read model

`public.attractions` is the source of truth for Exploration Intelligence. The runtime map
reads the derived `attraction_h3_category_aggregates` and `attraction_h3_cells` tables.
The rebuild scopes source rows to `source_group='attractions'`, validates every category
and coordinate, and generates H3 resolutions 4 through 10. Dataset growth requires no
hardcoded count changes.

Validate and aggregate locally without changing the read model:

```powershell
npm run data:validate-exploration-intelligence
```

Run the transactional local rebuild only after the dry-run passes:

```powershell
npm run data:build-exploration-intelligence
```

Known categories whose canonical mapping is `null`, including `Other`, remain in the generic
model and do not participate in personalization. Null-category rows are reported and skipped.
Unknown non-null categories or any invalid coordinate fail before replacement begins. A PostgreSQL advisory lock prevents
concurrent rebuilds. Replacement, integrity checks, and the metadata version update share
one transaction, so failure preserves the prior read model and model version. Runtime
normalization cache keys include this version and refresh naturally after a successful build.

The successful report gives source validation counts, per-resolution cell/count totals,
the resolution-4 centroid extent, transaction status, and active model version. Verify that
every resolution total equals `accepted_row_count` in
`public.exploration_intelligence_metadata` before treating the build as current.

```powershell
npm run data:verify-exploration-intelligence
```

For standalone Python processing of archived HERE responses into S3 analytics records,
see [the ETL setup, schema, and smoke-test commands](etl/README.md).

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
