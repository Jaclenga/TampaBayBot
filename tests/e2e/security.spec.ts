import { test, expect } from "@playwright/test";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

test("incomplete uploads return safe timeouts from every input API", async ({ baseURL, request }) => {
  // Wrangler's local static-assets proxy has a known abandoned-body transport
  // defect. Exercise the exact built Worker without that proxy for this test;
  // the remaining tests retain the production static-assets route.
  const uploadBaseURL = process.env.PLAYWRIGHT_INPUT_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    (process.env.PLAYWRIGHT_PRODUCTION_SECURITY === "true" ? "http://127.0.0.1:3101" : baseURL);
  const results = await Promise.all(["ask", "location", "property", "development"].map(route =>
    new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      const url = new URL(`/api/${route}`, uploadBaseURL);
      const client = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
      });
      const timer = setTimeout(() => { client.destroy(); reject(new Error(`${route} did not bound its upload`)); }, 20_000);
      client.on("error", error => { clearTimeout(timer); reject(error); });
      client.on("response", response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("error", reject);
        response.on("end", () => { clearTimeout(timer); resolve({ status: response.statusCode, body }); client.destroy(); });
      });
      // Start a valid JSON media-type request but never finish its body.
      client.write('{"question":');
    }),
  ));
  for (const result of results) {
    expect(result.status).toBe(408);
    expect(JSON.parse(result.body)).toEqual({ error: "The request took too long to upload. Please try again.", code: "request_timeout" });
  }
  const health = await request.get(new URL("/api/health", uploadBaseURL).href);
  expect(health.status()).toBe(200);
});

test("Worker refuses unused image processing routes before redirecting or fetching", async ({ request }) => {
  for (const path of ["/_vinext/image", "/_next/image", "/_vinext/image/", "/%5fvinext%2fimage"]) {
    const response = await request.get(`${path}?url=https://untrusted.example/image&w=640&q=75`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers().location).toBeUndefined();
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-security-policy"]).toContain("object-src 'none'");
  }
});

test("page, API and error responses carry the browser security policy", async ({ request }) => {
  for (const path of ["/", "/sources", "/api/health", "/missing-security-check-route"]) {
    const response = await request.get(path);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("production CSP permits hydration and blocks untrusted inline scripts", async ({ page, request }) => {
  test.skip(process.env.PLAYWRIGHT_PRODUCTION_SECURITY !== "true", "Requires the built Worker with its production CSP.");
  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(policy.split(";").find(part => part.trim().startsWith("script-src "))).not.toContain("unsafe-inline");
  const nextPage = await request.get("/", { headers: { "Content-Security-Policy": "script-src 'nonce-attacker'", "x-nonce": "attacker" } });
  const nextPolicy = nextPage.headers()["content-security-policy"];
  expect(nextPolicy).not.toContain(nonce!);
  expect(nextPolicy).not.toContain("attacker");
  const scriptNonces = await page.locator("script").evaluateAll(nodes => nodes.filter((node): node is HTMLScriptElement => node instanceof HTMLScriptElement && (!node.type || ["module", "text/javascript", "application/javascript"].includes(node.type))).map(node => node.nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every(value => value === nonce)).toBe(true);
  // Deliver parser-inserted HTML with the actual production policy. Scripts
  // inserted by automation's privileged evaluate() are not an injection probe.
  await page.route("**/csp-test-probe", route => route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/html", "Content-Security-Policy": policy },
    body: `<!doctype html><html><body><script>document.documentElement.dataset.untrustedScriptRan='true'</script><script nonce="${nonce}">document.documentElement.dataset.trustedScriptRan='true'</script></body></html>`,
  }));
  await page.goto("/csp-test-probe");
  await expect(page.locator("html")).toHaveAttribute("data-trusted-script-ran", "true");
  expect(await page.locator("html").getAttribute("data-untrusted-script-ran")).toBeNull();
  await page.goto("/");
  await page.getByLabel("Ask a question or enter an address").fill("Where can I find help paying for housing?");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Evidence you can inspect/ })).toBeVisible();
});
