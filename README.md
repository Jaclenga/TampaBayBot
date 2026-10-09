# TampaBayBot

TampaBayBot is an open-source project for questions about housing assistance, zoning, permits, and nearby development in the Tampa Bay Area. It retrieves public evidence and shows supporting quotations, source dates, and agency links. The default answer engine works without a language model.

[Live Demo](https://tampabaybot-housing-preview.pages.dev/)

## What it does

- Choose an optional housing-crisis guide for eviction, rent, homelessness, unsafe housing, utility shutoff, domestic violence, disaster displacement, or affordable housing. It gives deterministic urgency and next-step guidance with local contacts.
- Find housing resources for renters and homeowners.
- Browse official eviction, shelter referral, legal-aid and emergency contacts in the Cloudflare Pages demo through **Find Housing Help Without AI**, even when its chat backend is unavailable.
- Look up mapped zoning and future land use after address confirmation.
- Find permitting guidance, applications and agency contacts.
- Explore nearby development records with their sources and dates.

Choose Tampa, St. Petersburg, Clearwater, or county resources for Hillsborough, Pinellas and Pasco. The app asks for clarification when location is unclear. Coverage varies by source and service; see [geographic coverage](docs/GEOSPATIAL.md).

## Why This Exists

TampaBayBot was inspired by Habot 2.0, [a chatbot launched by the City of Barcelona to make public housing services more accessible to the public](https://www.barcelona.cat/infobarcelona/en/tema/city-council/boost-in-the-use-of-artificial-intelligence-to-help-citizens_1610487.html). As the Tampa Bay Area continues to grow, a similar service could make local housing & property information easier to navigate.

## Quick start

Use Node.js 24 and npm. From the project directory:

```sh
npm ci
npm run demo
```

Open [localhost:3001](http://localhost:3001). The demo uses labeled fictional evidence in a separate directory and needs no account, API key, database or `.env` file. See [demo options and example questions](docs/DEMO.md).

For real evidence, [stage, review and apply source updates](docs/SOURCE_UPDATES.md), then run `npm run dev -- --port 3001`. Source downloads and live geographic lookups need internet access.

## How it works

The app identifies the question's topic and location, retrieves relevant evidence, and assembles quotations with an official next step. Missing evidence, unavailable sources, and ambiguous locations produce explicit uncertainty states. Questions and navigation support English and Spanish; source quotations retain their original language.

Optional Ollama or OpenAI-compatible providers can select from retrieved evidence. Cloudflare Workers AI can write a quote-only cited answer. The application validates model output against retrieved evidence and falls back to the baseline answer when needed. See [methodology](docs/METHODOLOGY.md) for the evidence pipeline and [model configuration](docs/LLM.md) for setup and data flow.

The separate Pages [/housing-help/ directory](https://tampabaybot-housing-preview.pages.dev/housing-help/) and its optional crisis guide run in the browser without model calls, embeddings or an account. The original Next.js question interface is the homepage again. Chat crisis responses can attach the same structured plan to an ordinary RAG answer; the plan keeps its own official resource links separate from quoted RAG citations. An empty chat corpus or exhausted AI allowance does not block the static Pages directory. Check each resource's last public check, restrictions and official source before relying on current availability. See [housing-crisis architecture](docs/HOUSING_CRISIS_ARCHITECTURE.md), [resource verification](docs/RESOURCE_VERIFICATION.md) and [housing help without AI](docs/AI_FALLBACK.md).

On the prepared Cloudflare deployment, server-side D1 controls allow up to 15 eligible AI model attempts per visitor and 100 across the deployment each UTC day, with a separate concurrency cap. A reserved attempt counts even if inference fails. The interface shows the visitor's remaining allowance and the application reset time. Anonymous network-based identifiers can group people on a shared network or change when a visitor changes networks. These request limits do not guarantee a Cloudflare neuron or monetary budget. See [AI usage limits](docs/AI_USAGE_LIMITS.md) and [Cloudflare cost controls](docs/CLOUDFLARE_COST_CONTROLS.md).

## Evaluation and limits

Automated checks cover source regressions, exact-claim and citation behavior, program recall, provider validation, browser flows and fictional housing-crisis scenarios. [Evaluation and review](docs/EVALUATION.md) explains the metrics; [housing-crisis evaluation](docs/HOUSING_CRISIS_EVALUATION.md), [program recall](docs/PROGRAM_RECALL.md) and [release readiness](docs/RELEASE_READINESS.md) preserve the limits of those checks. These development results do not establish real-world safety, general accuracy or resident usefulness. Eviction language and local intake paths still need qualified external review before public use.

A resource match is not an eligibility decision, a zoning designation is not permission to build, and nearby records do not prove construction or a legal relationship. Public information may be incomplete, stale, or unavailable. Confirm consequential decisions with the responsible agency. See [limitations](docs/LIMITATIONS.md) and [security and privacy](SECURITY.md).

## Documentation

- [Documentation index](docs/README.md): guides by task and topic.
- [Development](docs/DEVELOPMENT.md): setup, repository layout, tests and APIs.
- [Contributing](CONTRIBUTING.md): review requirements and pull requests.
- [Deployment](docs/DEPLOYMENT.md): build and host with your own account.
- [Cloudflare demo](CLOUDFLARE_DEPLOYMENT.md): Pages frontend, Workers AI, reviewed evidence and deployment steps.
- [Cloudflare cost estimate](COST_ESTIMATE.md): free-tier limits and usage scenarios.
- [AI usage limits](docs/AI_USAGE_LIMITS.md): daily accounting, configuration and privacy limits.
- [Housing help without AI](docs/AI_FALLBACK.md): static directory and inference-failure behavior.
- [Housing-crisis architecture](docs/HOUSING_CRISIS_ARCHITECTURE.md): deterministic triage, plans and data boundaries.
- [Resource verification](docs/RESOURCE_VERIFICATION.md): source checks, freshness and contributor workflow.
- [Safety and limitations](docs/SAFETY_AND_LIMITATIONS.md): legal, emergency, privacy and external-review boundaries.
- [Housing-crisis evaluation](docs/HOUSING_CRISIS_EVALUATION.md): fictional scenarios and safety criteria.
- [Cloudflare cost controls](docs/CLOUDFLARE_COST_CONTROLS.md): what request caps can and cannot bound.

## License and independence

Original software is available under the [MIT License](LICENSE). External information, dependencies and model weights retain their respective terms; see [notices](NOTICE.md).

TampaBayBot is independent of city, county, Plan Hillsborough and State of Florida services.
