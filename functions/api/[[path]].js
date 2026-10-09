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

/** Pages service-binding proxy. The backend Worker has no public route. */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const method = ROUTES[url.pathname];
  if (!method) return jsonError(404, "API route not found.");
  if (request.method !== method)
    return jsonError(405, "Method not allowed.", { Allow: method });

  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin)
    return jsonError(403, "Use this service from its own website.");
  if (!env?.BACKEND || typeof env.BACKEND.fetch !== "function")
    return jsonError(503, "The TampaBayBot service is not configured.");

  try {
    return await env.BACKEND.fetch(request);
  } catch {
    return jsonError(502, "The TampaBayBot service is temporarily unavailable.");
  }
}
