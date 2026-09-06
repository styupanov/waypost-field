import type { Coordinates, TripEndpoint } from "../../types/trip.ts";

export function applyReverseGeocodeLabel(endpoint: TripEndpoint, clicked: Coordinates, label: string) {
  if (endpoint.coordinates?.lat !== clicked.lat || endpoint.coordinates.lon !== clicked.lon) return endpoint;
  return { ...endpoint, input: label, resolvedLabel: label };
}

export function reverseGeocodeResponseIsCurrent(currentSequence: number, responseSequence: number) {
  return currentSequence === responseSequence;
}
