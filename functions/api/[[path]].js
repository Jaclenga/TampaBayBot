const ROUTES = Object.freeze({
  "/api/ask": "POST",
  "/api/location": "POST",
  "/api/property": "POST",
  "/api/development": "POST",
  "/api/health": "GET",
  "/api/usage": "GET",
  "/api/ready": "GET",
  "/api/operations": "GET",
});
const JSON_BODY_LIMIT_BYTES = 8_192;
const INPUT_ROUTES = new Set(["/api/ask", "/api/location", "/api/property", "/api/development"]);

function jsonError(status, message, extraHeaders = {}) {
  return Response.json({ error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function rejectUpload(request, status, message, extraHeaders = {}) {
  // A rejected stream must not tie up a Pages Function while cancellation waits.
  void request.body?.cancel().catch(() => {});
  return jsonError(status, message, extraHeaders);
}

/** Pages service-binding proxy. The backend Worker has no public route. */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const method = ROUTES[url.pathname];
  if (!method) return rejectUpload(request, 404, "API route not found.");
  if (request.method !== method)
    return rejectUpload(request, 405, "Method not allowed.", { Allow: method });

  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin)
    return rejectUpload(request, 403, "Use this service from its own website.");
  if (INPUT_ROUTES.has(url.pathname)) {
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return rejectUpload(request, 400, "Send a JSON request.");
    const length = request.headers.get("Content-Length");
    if (length !== null) {
      if (!/^[0-9]+$/.test(length)) return rejectUpload(request, 400, "Invalid request length.");
      if (Number(length) > JSON_BODY_LIMIT_BYTES)
        return rejectUpload(request, 413, "The request is too long.");
    }
  }
  if (!env?.BACKEND || typeof env.BACKEND.fetch !== "function")
    return rejectUpload(request, 503, "The TampaBayBot service is not configured.");

  try {
    if (INPUT_ROUTES.has(url.pathname)) {
      const headers = new Headers(request.headers);
      // Resident APIs use anonymous JSON. Do not pass unrelated browser or
      // caller credentials to the private backend, or a full referring URL.
      headers.delete("Cookie");
      headers.delete("Authorization");
      headers.delete("Referer");
      return await env.BACKEND.fetch(new Request(request, { headers }));
    }
    return await env.BACKEND.fetch(request);
  } catch {
    return jsonError(502, "The TampaBayBot service is temporarily unavailable.");
  }
}
