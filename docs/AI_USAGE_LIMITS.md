# AI usage limits

The Cloudflare Pages chat uses server-side D1 counters to limit Workers AI calls. The static [housing assistance directory](AI_FALLBACK.md) does not call the chat API and remains available when AI is limited or unavailable. Local development without the Cloudflare bindings is a development mode, not a public rate-limited deployment.

## Default allowances

| Control | Default | Runtime setting |
| --- | ---: | --- |
| AI model attempts per visitor per UTC day | 15 | `TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY` |
| AI model attempts across the deployment per UTC day | 100 | `TAMPABAYBOT_LIMIT_MODEL_PER_DAY` |
| Simultaneous model attempts across the deployment | 2 | `TAMPABAYBOT_LIMIT_MODEL_CONCURRENCY` |
| API requests per visitor per minute | 12 in the prepared Cloudflare demo | `TAMPABAYBOT_LIMIT_CLIENT_PER_MINUTE` |
| All API requests per UTC day | 1,000 in the prepared Cloudflare demo | `TAMPABAYBOT_LIMIT_REQUESTS_PER_DAY` |

The daily windows begin at **00:00 UTC**. The user-facing allowance is about *eligible AI model attempts*. A question that has no usable evidence or is rejected by input validation does not invoke Workers AI and does not consume an AI question. Once the server reserves a model attempt, it counts whether the provider succeeds, times out, returns invalid output, or fails; repeated retries by the browser do not refund it. This rule avoids an attacker generating free provider traffic by forcing errors. Ordinary housing-directory navigation does not consume an AI allowance.

The prepared demo uses a 100-call global cap because 300 calls with a typical prompt can exceed the [10,000-neuron Workers AI Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/). A count of requests is not a count of neurons; see [cost controls](CLOUDFLARE_COST_CONTROLS.md). Both caps can be lowered through Worker runtime variables without changing code. The configuration parser rejects nonpositive or unsupported values. Changing a limit during a UTC day changes the cap against the already recorded count; it does not erase usage.

## Enforcement and privacy

The backend reserves visitor and global quota in D1 before calling `AI.run`. Conditional D1 writes and a model lease coordinate multiple Worker instances and simultaneous requests. A rejected request does not call the model. Leases recover from interrupted requests; an unabortable provider call that outlives its lease can make the live-concurrency count temporarily approximate, while the daily reservation remains counted. The existing operations layer also bounds total requests, outbound requests, deadlines and API concurrency. `LLM_MAX_PROMPT_BYTES` (default 12,000 UTF-8 bytes), `LLM_MAX_OUTPUT_TOKENS` (default 512) and `LLM_TIMEOUT_MS` (20,000 in the prepared demo) bound each Workers AI call. Essential static Pages files are outside the API controls.

All HTTP API model providers refuse inference without shared D1 controls by default. For local development only, `TAMPABAYBOT_ALLOW_UNMETERED_LOCAL_AI=1` permits an HTTP model when both the application request URL and model endpoint use loopback and operations mode is `local`. This opt-in has **no shared visitor or global AI counters** and must never be used on a public server. Workers AI remains unavailable in local mode. In shared mode, missing D1 or the private HMAC secret fails API admission closed. The static directory still loads from Pages in either case.

The visitor key is an HMAC of the trusted Cloudflare ingress address, a private Worker secret and the UTC day. D1 stores the derived key, counts, temporary leases and aggregate outcomes. It does not store raw IP addresses, questions, conversation text or housing-crisis details. The secret must be at least 32 random characters and must remain a Worker secret. Expired counters and leases are deleted during subsequent operations; aggregate metrics have a seven-day retention target. Cleanup is opportunistic rather than a D1 TTL. Cloudflare platform and proxy logs have separate retention settings.

Anonymous limits cannot guarantee one physical person equals one key. People sharing a device or network may share an allowance; a person who changes networks, uses a VPN, or changes their ingress address may get another key. Rotating the private HMAC secret also resets visitor keys. Browser resets do not reset the server counter for the same ingress address. Cloudflare's `CF-Connecting-IP` behavior through the Pages service binding must be checked on the deployed site with two client networks. An absent trusted address can group unrelated visitors under one key. Do not use a client-supplied `X-Forwarded-For` value as a substitute.

## User and operator behavior

The Pages interface requests a small usage snapshot, displays **“AI questions remaining today: 12 of 15”**, and shows the next 00:00 UTC reset for the *application* allowance. When exhausted, the chat receives HTTP 429 and a structured code and usage snapshot. It shows **“You've reached today's AI chat limit. Housing assistance resources are still available.”** with a link to the directory. Other AI failures use the unavailable message described in [AI fallback](AI_FALLBACK.md). The interface does not claim that Cloudflare's provider quota resets with the visitor allowance.

The protected `/api/operations` endpoint is for operators with `TAMPABAYBOT_MONITOR_TOKEN`; it exposes aggregate usage and failure counts, not conversation content. Cloudflare's Workers AI dashboard reports actual account neuron use. Keep this endpoint private, and use its counters together with provider and D1 metrics when adjusting limits. Review [production operations](OPERATIONS.md) and the [Cloudflare deployment guide](../CLOUDFLARE_DEPLOYMENT.md) before changing a public deployment.
