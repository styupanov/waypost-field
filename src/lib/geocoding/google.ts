import "server-only";
import type {
  GeocodingResponse,
  GeocodingResult,
} from "@/types/geocoding";

const GOOGLE_GEOCODING_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";

type GoogleGeocodingStatus =
  | "OK"
  | "ZERO_RESULTS"
  | "REQUEST_DENIED"
  | "OVER_QUERY_LIMIT"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

type GoogleGeocodingResponse = {
  status: GoogleGeocodingStatus | string;
  error_message?: string;
  results?: GoogleGeocodingResult[];
};

type GoogleGeocodingResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

export type GeocodingErrorCode =
  | "GEOCODING_NOT_CONFIGURED"
  | "GEOCODING_REQUEST_DENIED"
  | "GEOCODING_QUOTA_EXCEEDED"
  | "GEOCODING_INVALID_REQUEST"
  | "GEOCODING_PROVIDER_UNAVAILABLE"
  | "GEOCODING_SERVICE_ERROR";

export class GoogleGeocodingError extends Error {
  constructor(
    public readonly code: GeocodingErrorCode,
    public readonly httpStatus: number,
    message: string
  ) {
    super(message);
    this.name = "GoogleGeocodingError";
  }
}

function toWaypostResult(
  result: GoogleGeocodingResult
): GeocodingResult | null {
  const label = result.formatted_address;
  const lat = result.geometry?.location?.lat;
  const lon = result.geometry?.location?.lng;

  if (
    !label ||
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lon !== "number" ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return {
    id: result.place_id ?? `${lat},${lon}`,
    label,
    lat,
    lon,
  };
}

function providerError(status: string): GoogleGeocodingError {
  switch (status) {
    case "REQUEST_DENIED":
      return new GoogleGeocodingError(
        "GEOCODING_REQUEST_DENIED",
        502,
        "The geocoding provider denied the request."
      );
    case "OVER_QUERY_LIMIT":
      return new GoogleGeocodingError(
        "GEOCODING_QUOTA_EXCEEDED",
        503,
        "The geocoding provider quota was exceeded."
      );
    case "INVALID_REQUEST":
      return new GoogleGeocodingError(
        "GEOCODING_INVALID_REQUEST",
        502,
        "The geocoding provider rejected the request as invalid."
      );
    case "UNKNOWN_ERROR":
      return new GoogleGeocodingError(
        "GEOCODING_PROVIDER_UNAVAILABLE",
        503,
        "The geocoding provider is temporarily unavailable."
      );
    default:
      return new GoogleGeocodingError(
        "GEOCODING_SERVICE_ERROR",
        502,
        "The geocoding provider returned an unexpected response."
      );
  }
}

export async function geocodeWithGoogle(
  query: string
): Promise<GeocodingResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new GoogleGeocodingError(
      "GEOCODING_NOT_CONFIGURED",
      500,
      "Google geocoding is not configured."
    );
  }

  const url = new URL(GOOGLE_GEOCODING_URL);
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);

  let response: Response;

  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (cause) {
    console.error("Google geocoding network error:", cause);
    throw new GoogleGeocodingError(
      "GEOCODING_SERVICE_ERROR",
      502,
      "The geocoding service could not be reached."
    );
  }

  if (!response.ok) {
    throw new GoogleGeocodingError(
      "GEOCODING_SERVICE_ERROR",
      502,
      `Google geocoding returned HTTP ${response.status}.`
    );
  }

  let data: GoogleGeocodingResponse;

  try {
    data = (await response.json()) as GoogleGeocodingResponse;
  } catch {
    throw new GoogleGeocodingError(
      "GEOCODING_SERVICE_ERROR",
      502,
      "Google geocoding returned an invalid response."
    );
  }

  if (data.status === "ZERO_RESULTS") {
    return { results: [] };
  }

  if (data.status !== "OK") {
    console.error("Google geocoding provider error:", {
      status: data.status,
      message: data.error_message,
    });
    throw providerError(data.status);
  }

  return {
    results: (data.results ?? [])
      .map(toWaypostResult)
      .filter((result): result is GeocodingResult => result !== null),
  };
}

export type ReverseGeocodingResult = {
  label: string;
  formattedAddress: string;
  placeId: string | null;
};

export async function reverseGeocodePoint({ latitude, longitude }: { latitude: number; longitude: number }): Promise<ReverseGeocodingResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new GoogleGeocodingError("GEOCODING_NOT_CONFIGURED", 500, "Google geocoding is not configured.");
  const url = new URL(GOOGLE_GEOCODING_URL);
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", apiKey);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new GoogleGeocodingError("GEOCODING_SERVICE_ERROR", 502, "The geocoding service could not be reached."); }
  if (!response.ok) throw new GoogleGeocodingError("GEOCODING_SERVICE_ERROR", 502, `Google geocoding returned HTTP ${response.status}.`);
  let data: GoogleGeocodingResponse;
  try { data = await response.json() as GoogleGeocodingResponse; }
  catch { throw new GoogleGeocodingError("GEOCODING_SERVICE_ERROR", 502, "Google geocoding returned an invalid response."); }
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") throw providerError(data.status);
  const result = data.results?.find((item) => typeof item.formatted_address === "string");
  return result?.formatted_address ? { label: result.formatted_address, formattedAddress: result.formatted_address, placeId: result.place_id ?? null } : null;
}
