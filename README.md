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

## Learn More

For standalone Python processing of archived HERE responses into S3 analytics records,
see [the ETL setup, schema, and smoke-test commands](etl/README.md).

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
