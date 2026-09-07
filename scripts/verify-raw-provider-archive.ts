import assert from "node:assert/strict";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { archiveRawProviderPayload, type RawProviderArchiveInput } from "../src/lib/aws/raw-provider-archive.ts";
import { calculateHereFinalRoute, HereRoutingError } from "../src/lib/routing/here.ts";

process.env.RAW_PROVIDER_ARCHIVE_ENABLED = "false";
const input = { provider: "here", domain: "routing", fetchedAt: "2026-09-05T23:30:00-04:00", payload: { routes: [], extra: { original: true } } };
const env = { RAW_PROVIDER_ARCHIVE_ENABLED: "true", RAW_PROVIDER_ARCHIVE_BUCKET: "test-bucket", AWS_REGION: "us-east-1" };
const commands: PutObjectCommand[] = [];
const send = async (command: PutObjectCommand) => { commands.push(command); };
for (const enabled of [undefined, "false", "1", "TRUE"]) {
  await archiveRawProviderPayload(input, { env: { ...env, RAW_PROVIDER_ARCHIVE_ENABLED: enabled }, send });
}
assert.equal(commands.length, 0);
await archiveRawProviderPayload(input, { env, send });
await archiveRawProviderPayload(input, { env, send });
assert.equal(commands.length, 2);
assert.equal(commands[0].input.Bucket, "test-bucket");
assert.equal(commands[0].input.ContentType, "application/json");
assert.match(commands[0].input.Key!, /^raw\/routing\/here\/year=2026\/month=09\/day=06\/2026-09-06T03-30-00.000Z-[0-9a-f-]{36}\.json$/);
assert.notEqual(commands[0].input.Key, commands[1].input.Key);
assert.deepEqual(JSON.parse(String(commands[0].input.Body)), { schemaVersion: 1, provider: "here", domain: "routing", fetchedAt: "2026-09-06T03:30:00.000Z", payload: input.payload });

const points = [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }];
const payload = { routes: [{ sections: [{ polyline: "BFoz5xJ67i1B1B7PzIhaxL7Y", summary: { length: 1000, duration: 100 } }] }] };
let archived = 0;
const records: RawProviderArchiveInput[] = [];
await calculateHereFinalRoute(points, { apiKey: "secret-key", fetchImpl: async () => Response.json(payload), archiveImpl: async (record) => {
  archived++;
  records.push(record);
} });
assert.equal(archived, 1);
assert.deepEqual(records[0].payload, payload);
assert.equal(records[0].provider, "here");
assert.equal(records[0].domain, "routing");
assert.ok(Number.isFinite(Date.parse(records[0].fetchedAt)));
assert.equal(JSON.stringify(records[0]).includes("secret-key"), false);
await assert.rejects(() => calculateHereFinalRoute(points, { apiKey: "x", fetchImpl: async () => Response.json({ routes: [] }), archiveImpl: async () => { archived++; } }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_INVALID_RESPONSE");
assert.equal(archived, 2, "Archive precedes normalization");
for (const response of [new Response("bad json"), new Response("unavailable", { status: 503 })]) {
  await assert.rejects(() => calculateHereFinalRoute(points, { apiKey: "x", fetchImpl: async () => response, archiveImpl: async () => { archived++; } }), HereRoutingError);
}
assert.equal(archived, 2, "Failed HTTP and JSON responses are not archived");
const warn = console.warn;
const warnings: unknown[][] = [];
console.warn = (...args) => { warnings.push(args); };
try {
  await archiveRawProviderPayload(input, { env, send: async () => { throw new Error("authorization secret URL"); } });
  await archiveRawProviderPayload(input, { env: { ...env, RAW_PROVIDER_ARCHIVE_BUCKET: "" }, send });
  await archiveRawProviderPayload(input, { env: { ...env, AWS_REGION: "" }, send });
  await archiveRawProviderPayload(input, { env, send: async (_command, options) => new Promise((_resolve, reject) => { options.abortSignal.addEventListener("abort", () => reject(new Error("aborted"))); }) });
  const route = await calculateHereFinalRoute(points, { apiKey: "x", fetchImpl: async () => Response.json(payload), archiveImpl: async () => { throw new Error("secret"); } });
  assert.equal(route.summary.distanceKm, 1);
  assert.equal(warnings.length, 5);
  assert.equal(JSON.stringify(warnings).includes("secret"), false);
  assert.equal(commands.length, 2);
} finally { console.warn = warn; }
console.log("Raw provider archive and HERE integration checks passed (no AWS calls).");
