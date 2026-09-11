import assert from "node:assert/strict";
import { AttractionQueryError, DatabaseConnectionError } from "../src/lib/attractions/candidates.ts";
import { DatabaseConfigurationError } from "../src/lib/db/postgres-config.ts";
import { OvernightPlanningError } from "../src/lib/overnights/integration.ts";
import { RoutingProviderError } from "../src/lib/routing/routing-provider.ts";
import { classifyDraftCompositionFailure } from "../src/lib/trip/draft-api-errors.ts";
import { TripPersistenceError } from "../src/lib/trips/repository.ts";

const overnight = classifyDraftCompositionFailure(new OvernightPlanningError(2));
assert.deepEqual(overnight, {
  code: "OVERNIGHT_PLANNING_FAILED",
  message: "No suitable overnight area could be found for the trip.",
  status: 422,
  logMessage: "Draft overnight planning failed.",
  diagnostic: { name: "OvernightPlanningError", nightIndex: 2 },
});
assert.doesNotMatch(JSON.stringify(overnight.diagnostic), /coordinates|payload|api.?key|database.?url|cookie|session/i);

const unexpected = classifyDraftCompositionFailure(new TypeError("Malformed attraction row."));
assert.deepEqual(unexpected, {
  code: "DRAFT_COMPOSITION_FAILED",
  message: "The personalized draft could not be generated.",
  status: 500,
  logMessage: "Unexpected draft composition error.",
  diagnostic: { name: "TypeError", message: "Malformed attraction row." },
});
assert.equal("stack" in (unexpected.diagnostic ?? {}), false);

assert.deepEqual(classifyDraftCompositionFailure(new RoutingProviderError(429)), {
  code: "ROUTING_UNAVAILABLE",
  message: "The personalized draft route could not be generated.",
  status: 429,
  logMessage: "Draft routing failed.",
});
assert.equal(classifyDraftCompositionFailure(new DatabaseConfigurationError()).code, "DATABASE_NOT_CONFIGURED");
assert.equal(classifyDraftCompositionFailure(new DatabaseConnectionError()).code, "DATABASE_UNAVAILABLE");
assert.equal(classifyDraftCompositionFailure(new AttractionQueryError()).code, "ATTRACTION_QUERY_FAILED");
assert.deepEqual(classifyDraftCompositionFailure(new TripPersistenceError("TRIP_NOT_FOUND", "not found")), {
  code: "TRIP_NOT_FOUND",
  message: "Trip was not found.",
  status: 404,
});
assert.equal(
  classifyDraftCompositionFailure(new TripPersistenceError("INVALID_TRIP_DRAFT", "invalid")).code,
  "DRAFT_COMPOSITION_FAILED"
);

console.log("Draft API error classification and safe diagnostic checks passed.");
