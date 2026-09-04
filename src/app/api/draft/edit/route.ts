import { NextResponse } from "next/server";
import { DraftEditError, editTripDraft } from "@/lib/trip/draft-editing";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import type { DraftEditAction, TripDraft } from "@/types/trip";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseAction(value: unknown): DraftEditAction | null {
  if (!isRecord(value) || !isPositiveInteger(value.attractionId)) return null;
  if (value.type === "add" || value.type === "remove") {
    return { type: value.type, attractionId: value.attractionId };
  }
  if (value.type === "replace" && isPositiveInteger(value.replacementAttractionId)) {
    return {
      type: "replace",
      attractionId: value.attractionId,
      replacementAttractionId: value.replacementAttractionId,
    };
  }
  return null;
}

function hasDraftShape(value: unknown): value is TripDraft {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.origin) &&
    isRecord(value.destination) &&
    isRecord(value.route) &&
    isRecord(value.summary) &&
    isRecord(value.baselineSummary) &&
    isRecord(value.composition) &&
    Array.isArray(value.stops) &&
    Array.isArray(value.alternatives)
  );
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_DRAFT_EDIT", "Request body must be valid JSON.", 400);
  }
  if (!isRecord(body)) {
    return errorResponse("INVALID_DRAFT_EDIT", "A valid draft edit is required.", 400);
  }

  const action = parseAction(body.action);
  if (!action || !hasDraftShape(body.draft)) {
    return errorResponse("INVALID_DRAFT_EDIT", "A valid draft and edit action are required.", 400);
  }

  try {
    return NextResponse.json(await editTripDraft(body.draft, action));
  } catch (reason) {
    if (reason instanceof DraftEditError) {
      return errorResponse("DRAFT_EDIT_CONFLICT", reason.message, 400);
    }
    if (reason instanceof RoutingServiceError) {
      console.error("Draft edit routing failed.");
      return errorResponse("ROUTING_UNAVAILABLE", "The edited draft route could not be generated.", reason.statusCode);
    }
    console.error("Unexpected draft edit error.");
    return errorResponse("DRAFT_EDIT_FAILED", "The draft could not be updated.", 500);
  }
}
