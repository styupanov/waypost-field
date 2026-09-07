import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type RawProviderArchiveInput = {
  provider: string;
  domain: string;
  fetchedAt: string;
  payload: unknown;
};

type ArchiveOptions = {
  env?: Record<string, string | undefined>;
  send?: (command: PutObjectCommand, options: { abortSignal: AbortSignal }) => Promise<unknown>;
};

let client: S3Client | undefined;
let clientRegion: string | undefined;

// Only response bodies belong here: never pass request URLs, headers, or credentials.
// Provider content remains temporary; configure bucket lifecycle retention separately.
export async function archiveRawProviderPayload(input: RawProviderArchiveInput, options: ArchiveOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  if (env.RAW_PROVIDER_ARCHIVE_ENABLED !== "true") return;

  try {
    const bucket = env.RAW_PROVIDER_ARCHIVE_BUCKET;
    const region = env.AWS_REGION;
    if (!bucket || !region) throw new Error("Missing archive configuration");
    if (![input.domain, input.provider].every((part) => /^[a-z0-9-]+$/.test(part))) throw new Error("Invalid archive partition");
    const fetchedAt = new Date(input.fetchedAt).toISOString();
    const [year, month, day] = fetchedAt.slice(0, 10).split("-");
    const key = `raw/${input.domain}/${input.provider}/year=${year}/month=${month}/day=${day}/${fetchedAt.replace(/:/g, "-")}-${randomUUID()}.json`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "application/json",
      Body: JSON.stringify({
        schemaVersion: 1,
        provider: input.provider,
        domain: input.domain,
        fetchedAt,
        payload: input.payload,
      }),
    });
    if (!options.send && (!client || clientRegion !== region)) {
      // The default credential chain supports AWS_PROFILE/SSO locally and IAM roles in deployment.
      client = new S3Client({ region, maxAttempts: 1 });
      clientRegion = region;
    }
    // Await the write so serverless request completion cannot discard it, but bound the delay.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        options.send ? options.send(command, { abortSignal: controller.signal }) : client!.send(command, { abortSignal: controller.signal }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("Archive timed out")); }, 3_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // SDK errors may contain request details. Never log the error or provider payload.
    console.warn("Raw provider archive failed; continuing without archive.");
  }
}
