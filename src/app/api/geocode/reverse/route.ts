import { reverseGeocodePoint } from "@/lib/geocoding/google";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body !== "object" || body === null) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { latitude, longitude } = body as Record<string, unknown>;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return Response.json({ error: "Valid coordinates are required." }, { status: 400 });
  try { return Response.json({ result: await reverseGeocodePoint({ latitude, longitude }) }); }
  catch { return Response.json({ result: null }); }
}
