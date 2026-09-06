import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { getAttractionEnrichment } from "@/lib/attraction-enrichment/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authenticatedWaypostUserId()) return Response.json({ error: "Authentication required." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid attraction identifier." }, { status: 400 });
  try {
    const enrichment = await getAttractionEnrichment(id);
    return Response.json({ enrichment });
  } catch (error) {
    console.error("Attraction enrichment failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ enrichment: null });
  }
}
