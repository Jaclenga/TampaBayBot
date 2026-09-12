import { isJurisdictionId } from "./coverage.mjs";
import { withinServiceRegion } from "./geospatial/index.mjs";

export const privateHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}

export const REQUEST_BODY_TIMEOUT_MS = 10_000;
export const REQUEST_BODY_MAX_BYTES = 8_192;
// Fully consume only modest, truthfully declared oversized requests. This keeps
// pooled Worker connections reusable without allowing an unbounded drain.
export const REJECTED_BODY_DRAIN_LIMIT_BYTES = 64 * 1_024;

export class RequestInputError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "RequestInputError";
    this.status = status;
    this.code = code;
  }
}

export function inputErrorJson(error: unknown, fallback: string) {
  if (error instanceof RequestInputError)
    return json({ error: error.message, code: error.code }, error.status);
  return json({ error: error instanceof Error ? error.message : fallback }, 400);
}

export async function readInput(
  request: Request,
  { timeoutMs = REQUEST_BODY_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length"));
  const drainDeclaredOversize =
    declaredLength > REQUEST_BODY_MAX_BYTES &&
    declaredLength <= REJECTED_BODY_DRAIN_LIMIT_BYTES;
  try {
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > REQUEST_BODY_TIMEOUT_MS
    )
      throw new TypeError("The request deadline must be within the supported limit.");
    if (
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
    )
      throw new Error("Send a JSON request.");
    const origin = request.headers.get("origin");
    if (
      origin &&
      (origin !== new URL(origin).origin ||
        origin !== new URL(request.url).origin)
    )
      throw new Error("Use this service from its own website.");
    if (
      declaredLength > REQUEST_BODY_MAX_BYTES &&
      !drainDeclaredOversize
    )
      throw new Error("The request is too long.");
  } catch (error) {
    // Tell the transport to discard rejected uploads, including before a reader exists.
    void request.body?.cancel().catch(() => {});
    throw error;
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("The request is empty.");
  const timeoutError = new RequestInputError(
    "The request took too long to upload. Please try again.",
    408,
    "request_timeout",
  );
  const abortedError = new RequestInputError(
    "The request was interrupted. Please try again.",
    400,
    "request_aborted",
  );
  let interrupt: (error: RequestInputError) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  const deadlineAt = performance.now() + timeoutMs;
  const timer = setTimeout(() => interrupt(timeoutError), timeoutMs);
  const onAbort = () => interrupt(abortedError);
  request.signal.addEventListener("abort", onAbort, { once: true });
  let total = 0;
  let complete = false;
  const parts: Uint8Array[] = [];
  const consume = async () => {
    while (true) {
      if (request.signal.aborted) throw abortedError;
      if (performance.now() >= deadlineAt) throw timeoutError;
      const { value, done } = await reader.read();
      if (request.signal.aborted) throw abortedError;
      if (performance.now() >= deadlineAt) throw timeoutError;
      if (done) {
        complete = true;
        break;
      }
      total += value.byteLength;
      if (total > REQUEST_BODY_MAX_BYTES) {
        if (!drainDeclaredOversize || total > declaredLength)
          throw new Error("The request is too long.");
        continue;
      }
      if (value.byteLength) parts.push(value);
    }
  };
  try {
    // One race bounds the complete upload without retaining a handler per chunk.
    await Promise.race([consume(), interrupted]);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    if (!complete) {
      // Cancellation is best effort: an uncooperative source cannot delay a response.
      void reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
  if (drainDeclaredOversize) throw new Error("The request is too long.");
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("The request is not valid JSON.");
  }
  if (!input || Array.isArray(input) || typeof input !== "object")
    throw new Error("Provide a JSON object.");
  return input;
}
export function inputText(value: unknown, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Enter a valid question or address.");
  return value.trim();
}
export function inputJurisdiction(value: unknown) {
  if (value === undefined) return "tampa-bay";
  if (!isJurisdictionId(value)) throw new Error("Choose a supported Tampa Bay area.");
  return value;
}
export function inputPoint(input: Record<string, unknown>) {
  if (
    typeof input.latitude !== "number" ||
    typeof input.longitude !== "number" ||
    !withinServiceRegion({ latitude: input.latitude, longitude: input.longitude })
  )
    throw new Error("Select a location within the Tampa Bay service area.");
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    address:
      typeof input.address === "string" ? input.address.slice(0, 240) : "",
  };
}
