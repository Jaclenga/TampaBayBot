/** Serve the original Next interface through the private backend Worker. */
export async function onRequest({ request, env }) {
  if (!env?.BACKEND || typeof env.BACKEND.fetch !== "function")
    return Response.redirect(new URL("/housing-help/", request.url), 302);
  try {
    const response = await env.BACKEND.fetch(request);
    if (response.status >= 500)
      return Response.redirect(new URL("/housing-help/", request.url), 302);
    return response;
  } catch {
    return Response.redirect(new URL("/housing-help/", request.url), 302);
  }
}
