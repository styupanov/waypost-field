import "server-only";
import type { EnrichmentAttraction } from "@/lib/attraction-enrichment/repository";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";
const SEARCH_RADIUS_METERS = 5_000;
export const MAX_PLACE_IDENTITY_DISTANCE_METERS = 2_000;
const MIN_NAME_TOKEN_SIMILARITY = 0.75;

type GoogleText = { text?: string };
type GoogleLocation = { latitude?: number; longitude?: number };
type GoogleMapsLinks = { placeUri?: string };
export type GooglePlace = {
  id?: string; displayName?: GoogleText; formattedAddress?: string; location?: GoogleLocation;
  types?: string[]; websiteUri?: string; googleMapsLinks?: GoogleMapsLinks;
};
type TextSearchResponse = { places?: GooglePlace[] };

export type VerifiedGooglePlace = {
  googlePlaceId: string;
  displayName: string;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  types: string[];
  websiteUri: string | null;
  googleMapsPlaceUri: string | null;
  sourceUrls: string[];
  distanceMeters: number;
};

export type PlaceResolutionResult = {
  place: VerifiedGooglePlace | null;
  diagnostics: { candidateCount: number; reason: "PLACES_ACCEPTED" | "PLACES_NOT_CONFIGURED" | "PLACES_PROVIDER_ERROR" | "PLACES_NO_MATCH" | "PLACES_AMBIGUOUS" | "PLACES_DETAILS_FAILED" };
};

function normalizeName(value: string) {
  return value.toLocaleLowerCase("en-US").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function nameSimilarity(left: string, right: string) {
  const a = new Set(normalizeName(left).split(" ").filter(Boolean));
  const b = new Set(normalizeName(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size);
}

export function namesAreCompatible(waypostName: string, googleName: string) {
  const left = normalizeName(waypostName); const right = normalizeName(googleName);
  return left === right || nameSimilarity(left, right) >= MIN_NAME_TOKEN_SIMILARITY;
}

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude); const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function selectExactPlaceCandidate(attraction: EnrichmentAttraction, candidates: GooglePlace[]) {
  const qualifying = candidates.flatMap((candidate) => {
    const name = candidate.displayName?.text; const latitude = candidate.location?.latitude; const longitude = candidate.location?.longitude;
    if (!candidate.id || !name || typeof latitude !== "number" || typeof longitude !== "number" || !namesAreCompatible(attraction.name, name)) return [];
    const distance = distanceMeters(attraction, { latitude, longitude });
    return distance <= MAX_PLACE_IDENTITY_DISTANCE_METERS ? [{ candidate, distance, exactName: normalizeName(attraction.name) === normalizeName(name) }] : [];
  }).sort((a, b) => Number(b.exactName) - Number(a.exactName) || a.distance - b.distance);
  if (!qualifying.length) return { candidate: null, reason: "PLACES_NO_MATCH" as const };
  const best = qualifying[0]; const second = qualifying[1];
  if (second && second.exactName === best.exactName && Math.abs(second.distance - best.distance) < 250) return { candidate: null, reason: "PLACES_AMBIGUOUS" as const };
  return { candidate: best, reason: "PLACES_ACCEPTED" as const };
}

function trustedUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

async function placesFetch(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(7_500) });
  if (!response.ok) throw new Error(`Google Places returned HTTP ${response.status}.`);
  return response;
}

export async function resolveVerifiedGooglePlace(attraction: EnrichmentAttraction): Promise<PlaceResolutionResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { place: null, diagnostics: { candidateCount: 0, reason: "PLACES_NOT_CONFIGURED" } };
  let candidates: GooglePlace[];
  try {
    const response = await placesFetch(TEXT_SEARCH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types" }, body: JSON.stringify({ textQuery: `${attraction.name} ${attraction.category}`, pageSize: 5, locationBias: { circle: { center: { latitude: attraction.latitude, longitude: attraction.longitude }, radius: SEARCH_RADIUS_METERS } } }) });
    candidates = ((await response.json()) as TextSearchResponse).places ?? [];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("Google Places text search failed", { attractionId: attraction.id, reason: "PLACES_PROVIDER_ERROR", errorName: error instanceof Error ? error.name : "UnknownError" });
    return { place: null, diagnostics: { candidateCount: 0, reason: "PLACES_PROVIDER_ERROR" } };
  }
  const selected = selectExactPlaceCandidate(attraction, candidates);
  if (!selected.candidate) return { place: null, diagnostics: { candidateCount: candidates.length, reason: selected.reason } };
  const { candidate } = selected.candidate;
  try {
    const response = await placesFetch(`${DETAILS_URL}/${encodeURIComponent(candidate.id!)}`, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,websiteUri,googleMapsLinks" } });
    const details = await response.json() as GooglePlace;
    const displayName = details.displayName?.text; const latitude = details.location?.latitude; const longitude = details.location?.longitude;
    const detailsDistance = typeof latitude === "number" && typeof longitude === "number" ? distanceMeters(attraction, { latitude, longitude }) : Number.POSITIVE_INFINITY;
    if (!details.id || details.id !== candidate.id || !displayName || typeof latitude !== "number" || typeof longitude !== "number" || !namesAreCompatible(attraction.name, displayName) || detailsDistance > MAX_PLACE_IDENTITY_DISTANCE_METERS) {
      return { place: null, diagnostics: { candidateCount: candidates.length, reason: "PLACES_DETAILS_FAILED" } };
    }
    const sourceUrls = [...new Set([details.websiteUri, details.googleMapsLinks?.placeUri].filter(trustedUrl))];
    return { place: { googlePlaceId: details.id, displayName, formattedAddress: details.formattedAddress ?? null, latitude, longitude, types: details.types ?? [], websiteUri: trustedUrl(details.websiteUri) ? details.websiteUri : null, googleMapsPlaceUri: trustedUrl(details.googleMapsLinks?.placeUri) ? details.googleMapsLinks!.placeUri! : null, sourceUrls, distanceMeters: detailsDistance }, diagnostics: { candidateCount: candidates.length, reason: "PLACES_ACCEPTED" } };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("Google Places details failed", { attractionId: attraction.id, googlePlaceId: candidate.id, reason: "PLACES_DETAILS_FAILED", errorName: error instanceof Error ? error.name : "UnknownError" });
    return { place: null, diagnostics: { candidateCount: candidates.length, reason: "PLACES_DETAILS_FAILED" } };
  }
}
