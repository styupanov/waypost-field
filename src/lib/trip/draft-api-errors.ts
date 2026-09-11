import { AttractionQueryError, DatabaseConnectionError } from "../attractions/candidates.ts";
import { DatabaseConfigurationError } from "../db/postgres-config.ts";
import { OvernightPlanningError } from "../overnights/integration.ts";
import { RoutingProviderError } from "../routing/routing-provider.ts";
import { TripPersistenceError } from "../trips/repository.ts";

type DraftFailure = {
  code: string;
  message: string;
  status: number;
  logMessage?: string;
  diagnostic?: Record<string, string | number>;
};

export function classifyDraftCompositionFailure(reason: unknown): DraftFailure {
  if (reason instanceof TripPersistenceError && reason.code === "TRIP_NOT_FOUND") {
    return { code: "TRIP_NOT_FOUND", message: "Trip was not found.", status: 404 };
  }
  if (reason instanceof DatabaseConfigurationError) {
    return { code: "DATABASE_NOT_CONFIGURED", message: "Draft composition is not configured.", status: 500, logMessage: "Draft attraction database is not configured." };
  }
  if (reason instanceof DatabaseConnectionError) {
    return { code: "DATABASE_UNAVAILABLE", message: "Draft composition is temporarily unavailable.", status: 503, logMessage: "Draft attraction database connection failed." };
  }
  if (reason instanceof AttractionQueryError) {
    return { code: "ATTRACTION_QUERY_FAILED", message: "The personalized draft could not be generated.", status: 500, logMessage: "Draft attraction query failed." };
  }
  if (reason instanceof RoutingProviderError) {
    return { code: "ROUTING_UNAVAILABLE", message: "The personalized draft route could not be generated.", status: reason.statusCode, logMessage: "Draft routing failed." };
  }
  if (reason instanceof OvernightPlanningError) {
    return {
      code: "OVERNIGHT_PLANNING_FAILED",
      message: "No suitable overnight area could be found for the trip.",
      status: 422,
      logMessage: "Draft overnight planning failed.",
      diagnostic: { name: reason.name, nightIndex: reason.nightIndex },
    };
  }
  return {
    code: "DRAFT_COMPOSITION_FAILED",
    message: "The personalized draft could not be generated.",
    status: 500,
    logMessage: "Unexpected draft composition error.",
    diagnostic: reason instanceof Error
      ? { name: reason.name, message: reason.message }
      : { name: "UnknownError", message: "A non-Error value was thrown." },
  };
}
