/** Response policy for the deployed Worker, including framework error routes. */
export function contentSecurityPolicy(nonce: string, development = false) {
  // Vite's local HMR scripts need inline execution. Published builds use only
  // a fresh server nonce; resident content cannot authorize its own script.
  const scripts = development
    ? "'self' 'unsafe-inline'"
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "frame-src https://www.openstreetmap.org",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

function isImageOptimizer(pathname: string) {
  // Match the framework's decoded path as well as its RSC/trailing-slash forms.
  // Do this before dispatch, so no optimizer can fetch a resident-supplied URL.
  let decoded = pathname;
  for (let pass = 0; pass < 2; pass++) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
    decoded = decoded.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
    const normalized = new URL(decoded, "https://path.invalid").pathname;
    if (/^\/(?:_vinext|_next)\/image(?:$|\/|\.rsc(?:$|\/))/.test(normalized))
      return true;
  }
  return false;
}

export async function withResponseSecurity(
  request: Request,
  dispatch: (securedRequest: Request) => Promise<Response>,
  development = false,
): Promise<Response> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const policy = contentSecurityPolicy(nonce, development);
  const headers = new Headers(request.headers);
  // Vinext reads this internal request header to nonce its SSR/RSC scripts.
  // Never trust a policy or nonce received from the browser.
  headers.set("Content-Security-Policy", policy);
  headers.delete("Content-Security-Policy-Report-Only");
  headers.delete("x-nonce");
  const url = new URL(request.url);
  let response: Response;
  if (isImageOptimizer(url.pathname)) {
    response = new Response("Not found.", { status: 404 });
  } else {
    try {
      response = await dispatch(new Request(request, { headers }));
    } catch {
      response = new Response("Unable to complete the request.", { status: 500 });
    }
  }
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", policy);
  secured.headers.set("X-Frame-Options", "SAMEORIGIN");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (url.protocol === "https:")
    secured.headers.set("Strict-Transport-Security", "max-age=31536000");
  // A cached HTML document would reuse its nonce or mismatch the new header.
  // JSON APIs also remain private even when the framework produces an error.
  if (secured.headers.get("Content-Type")?.includes("text/html") ||
      url.pathname.startsWith("/api/") || secured.status >= 400) {
    secured.headers.set("Cache-Control", "no-store");
  }
  return secured;
}
