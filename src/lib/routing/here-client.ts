import "server-only";

export const HERE_ROUTING_URL = "https://router.hereapi.com/v8/routes";
export const HERE_MATRIX_URL = "https://matrix.router.hereapi.com/v8/matrix";
export const HERE_TIMEOUT_MILLISECONDS = 25_000;

export type HereRoutingErrorCode = "HERE_NOT_CONFIGURED" | "WAYPOINT_LIMIT_EXCEEDED" | "INVALID_WAYPOINTS" | "HERE_TIMEOUT" | "HERE_UNAVAILABLE" | "HERE_INVALID_RESPONSE";

export class HereRoutingError extends Error {
  readonly code: HereRoutingErrorCode;
  readonly statusCode: number;
  constructor(code: HereRoutingErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "HereRoutingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type HereRequestOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMilliseconds?: number;
};

type HereRequestMessages = {
  timeout: string;
  rejected: string;
  invalid: string;
};

export async function requestHereJson(
  requestUrl: URL,
  init: RequestInit,
  options: HereRequestOptions = {},
  messages: HereRequestMessages = {
    timeout: "HERE routing timed out.",
    rejected: "HERE routing rejected the request.",
    invalid: "HERE returned invalid routing data.",
  }
): Promise<unknown> {
  const apiKey = options.apiKey ?? process.env.HERE_API_KEY;
  if (!apiKey) throw new HereRoutingError("HERE_NOT_CONFIGURED", "HERE routing is not configured.", 503);

  const url = new URL(requestUrl);
  url.searchParams.set("apiKey", apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMilliseconds ?? HERE_TIMEOUT_MILLISECONDS);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new HereRoutingError("HERE_TIMEOUT", messages.timeout, 504);
    throw new HereRoutingError("HERE_UNAVAILABLE", "HERE routing could not be reached.", 503);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new HereRoutingError("HERE_UNAVAILABLE", messages.rejected, response.status >= 500 ? 503 : 502);
  try {
    return await response.json();
  } catch {
    throw new HereRoutingError("HERE_INVALID_RESPONSE", messages.invalid, 502);
  }
}
