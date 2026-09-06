import { isAttractionStop, type TripDraft } from "../../types/trip.ts";

export function countAttractionStops(draft: Pick<TripDraft, "stops">) {
  return draft.stops.filter(isAttractionStop).length;
}
