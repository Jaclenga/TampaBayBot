# Housing-crisis navigation architecture

Housing-crisis navigation adds a deterministic path alongside the existing TampaBayBot answer pipeline. It does not replace RAG, GIS, zoning, permitting, development records or citation validation. The public Pages bundle contains the resource catalog and can produce a short action plan even when the backend, D1 or Workers AI is unavailable. A chat question can also carry a structured crisis plan alongside its ordinary cited answer; plan source links remain separate from RAG quotation IDs.

```text
Optional Pages intake selections ──┐
                                 ├─> deterministic triage and resource match ─> short plan and official links
Chat question ─> guarded RAG answer ┘
                         └─> optional, validated Workers AI explanation of RAG evidence
```

The user can open the static directory or emergency contacts without answering an intake question. Intake selects a problem, timeframe, area, document stage and immediate safety only as needed; a skipped answer remains unknown. Triage distinguishes **emergency**, **urgent** and **standard**, with separate referral paths for physical danger, no safe sleep, domestic violence and a court deadline. The plan lists a first priority, short ordered steps, human contacts, relevant documents and a deadline-check instruction. It does not compute an individual deadline, promise a place, or determine eligibility.

## Data boundaries

The resource catalog is a checked static Pages asset with crisis categories, county and municipality scope, a publisher URL, contact, source, verification date and availability status. Matching uses those fields and freshness rules, not a vector database or model. The same catalog supports browsing with or without the API. The Next.js `/housing-help` route uses that catalog and core planner as well; its rendering still needs the Next Worker to be reachable, whereas the Pages assets remain available independently of the API Worker. See [resource verification](RESOURCE_VERIFICATION.md) for review status and stale-record handling. A resource URL is an official navigation link; it is not a fabricated RAG citation or proof of current funding.

The existing retrieval pipeline continues to scope the reviewed corpus by jurisdiction, exclude untrusted instruction text, rank authoritative and fresh passages, retain source conflicts and validate exact quotations. Its downloaded corpus has a separate review and release process. The current source-only checkout contains no downloaded evidence; a crisis plan can still link to its static official resources. Model generation remains optional and subject to [daily limits](AI_USAGE_LIMITS.md). Cloudflare currently lists the configured [`@cf/meta/llama-3.1-8b-instruct-fp8` model](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/) as Cloudflare-hosted, but model availability in an operator account requires a hosted test.

## Privacy and deployment

The optional intake uses broad selections in page memory. It requires no account, address, upload or storage of a crisis narrative. Copy, print and local save actions are browser actions. Chat still sends a submitted question to the backend and, if enabled and eligible, to the configured model provider; the interface must disclose this. The Worker may be unavailable while static Pages resources and plans continue to load. The Pages Function forwards only allowed API routes, so ordinary static assets do not consume inference quota. No paid vector service, GPU or continuously running process is introduced.

The [safety boundary](SAFETY_AND_LIMITATIONS.md) requires legal and service-provider review before public claims of resident usefulness. Build and browser tests can establish that controls work as implemented; they cannot establish that program eligibility, legal deadlines or shelter capacity are current. Follow [Cloudflare deployment](../CLOUDFLARE_DEPLOYMENT.md) and test the actual hosted Pages URL before claiming deployment success.
