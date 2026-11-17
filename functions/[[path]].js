/** Route the original Next pages and client requests through the private Worker. */
export async function onRequest({ request, env, next }) {
  const isAsset = new URL(request.url).pathname.startsWith("/assets/");
  // The chat HTML and its hashed assets must come from the same Worker version.
  // Independent directory assets remain available from Pages on a backend miss.
  if (isAsset) {
    try {
      if (env?.BACKEND?.fetch) {
        const response = await env.BACKEND.fetch(request);
        if (response.ok) return response;
      }
    } catch { /* Fall back to the independent directory's static files. */ }
    return next();
  }
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
