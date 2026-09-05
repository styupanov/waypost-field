import { isOvernightStop, type TripDraft } from "../../types/trip.ts";

export function hasStaleDayPlans(draft: TripDraft) {
  if (!draft.multiDay.isMultiDay) return false;
  if (draft.dayPlans.length !== draft.multiDay.selectedDays) return true;
  return draft.dayPlans.some((plan) => [plan.start, plan.end].some((boundary) => {
    if (boundary.kind !== "overnight" || boundary.nightIndex === null) return false;
    const current = draft.stops.find((stop) => isOvernightStop(stop) && stop.nightIndex === boundary.nightIndex);
    return !current || current.label !== boundary.label || current.coordinates.lat !== boundary.coordinates.lat || current.coordinates.lon !== boundary.coordinates.lon;
  }));
}
