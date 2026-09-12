# ParcelPrivateer

Find Tampa Bay housing resources, property information and official next steps, with the public sources behind each answer.

ParcelPrivateer is an independent, open-source civic-tech project for people asking about housing assistance, zoning, permits and development near an address. You can start with a question instead of knowing which agency, map or document to search.

It brings together information scattered across government pages, PDFs and GIS services, and keeps the supporting evidence visible. The default answer engine works without a language model; local or API-based model assistance is optional.

Choose Tampa, St. Petersburg, Clearwater, or county resources for Hillsborough, Pinellas and Pasco. Questions without a clear area ask for clarification before applying local programs or rules. Live property layers cover the three named cities; other municipalities and Pasco property lookups still have coverage gaps. [Coverage and maps](docs/GEOSPATIAL.md).

> **Alpha: for contributors and supervised testing.** The downloadable source release starts without loaded evidence. Fetch and review sources before expecting cited answers. Independent human review and production-readiness work remain open. See [quick start](#quick-start) and [release status](docs/RELEASE_READINESS.md).

## What it does

- Find housing resources for renters and homeowners.
- Look up mapped zoning and future-land-use designations after address confirmation.
- Find permitting guidance and the relevant application or contact.
- Explore nearby observed development records.
- Navigate to the agency and original source responsible for a topic.
- Show evidence excerpts and official next steps alongside answers.

Government guidance and mapped designations are distinct from observed development activity. Official eligibility, zoning and permitting decisions remain with the responsible agencies.

## Demo

ParcelPrivateer Tampa Bay home page with a city or county selector, housing question field and topic links (development artifact omitted from source-only release)

The screenshot shows the regional interface with sources loaded. Select your city or county, or name it in your question. Try questions such as:

- “Where can I find help paying for housing?”
- “What zoning applies to this address?”
- “Do condo renovations use a residential permit?”
- “Are there development records near 315 E Kennedy Blvd, Tampa?”
- “Who should I contact about a variance?”

Run it locally with the [quick start](#quick-start).

## How it works

Question → identify intent and location → retrieve relevant public sources → assemble evidence → present an answer → link to an official next step.

The default path is deterministic and extractive: it selects relevant passages and combines literal quotations with navigation text. Address-based questions ask you to confirm a location before looking up property context.

Optional model assistance can select among evidence already retrieved by the application. Free-form model prose is not used, and the model cannot make an official decision. The application checks the selection and falls back to the original answer if the model response is invalid.

## Data sources

Sources include Tampa, St. Petersburg, Clearwater, Hillsborough County, Pinellas County, Pasco County, Plan Hillsborough and Florida Housing Finance Corporation. Each source declares its service area; county resources do not automatically apply inside every city.

Nearby activity currently comes from the Tampa-only [Tampa Development Records](https://github.com/Jaclenga/Tampa-Development-Records) project. St. Petersburg, Clearwater and other areas receive an explicit coverage message. Its observed records have their own dates and attribution; they are not regulations or a complete, current construction inventory.

Coverage is bounded, and public information can change or become unavailable. The app distinguishes when a source was retrieved from when its publisher updated it. See [data sources](DATA_SOURCES.md) and [geospatial methods](docs/GEOSPATIAL.md).

## Trust and evidence

Answers expose literal excerpts, source URLs and provenance, including retrieval dates and section, page, record or layer references where available. Government sources and independent development records remain separately labeled.

Missing evidence, stale or unavailable sources, ambiguous locations and questions requiring official judgment produce explicit uncertainty states. Optional model selections must retain valid evidence references and unchanged quotations. These checks make answers inspectable; they do not establish completeness, applicability or detection of every source conflict. See [methodology](METHODOLOGY.md).

## Evaluation

Recorded automated code and offline evaluation checks passed for the development corpus. Synthetic provider tests check transport, validation and fallback behavior; separate real Ollama/Meta Llama 3 tests exercised actual inference. Neither is a general factual-accuracy score or a measure of resident usefulness.

An agent review examined sample responses. **Independent human review remains pending.** The complete browser suite also retains a documented local-runtime transport failure on Windows and Linux.

See [evaluation and human-review methods](docs/EVALUATION.md), [running evaluations](docs/EVAL_SUITE.md) and the [current results and known issues](docs/RELEASE_READINESS.md).

## Quick start

Use Node.js 24 LTS and npm. From the project directory:

```bash
npm ci
npm run dev -- --port 3001
```

Open [localhost:3001](http://localhost:3001). The default `LLM_PROVIDER=none` needs no account, API key, database or `.env` file. Source downloads and live geographic lookups need internet access.

The source-only alpha contains fetch configuration but no downloaded evidence. Follow [source setup and review](docs/DISTRIBUTION.md#populate-and-validate-locally) to load sources, then restart the app. Fresh downloads may differ from the recorded evaluation corpus.

For PowerShell troubleshooting, development commands and API routes, see the [developer guide](docs/DEVELOPMENT.md). For your own hosting account, see [deployment](docs/DEPLOYMENT.md).

## Optional model assistance

- `none`: use the deterministic answer engine without model calls.
- `ollama`: connect to an operator-selected Ollama model, including locally running weights.
- `openai-compatible`: connect to a compatible local or remote provider.

Enabled providers receive eligible questions and bounded public excerpts to select evidence. Their logging, retention and any cloud forwarding depend on configuration. Do not enter account numbers or application documents. See [model configuration and data flow](docs/LLM.md) before enabling assistance.

## Limitations

- A program match is not an eligibility decision; a zoning designation is not permission to build.
- Source coverage is limited, and pages or records may be stale, incomplete, conflicting or unavailable.
- Nearby development does not establish a legal relationship, project approval or physical construction status.
- Parcel lookups do not evaluate every constraint or the whole parcel against every boundary.
- Independent human answer review and resident usability testing remain pending.
- Automated accessibility checks do not establish WCAG conformance; manual assistive-technology review is still needed.
- A local-runtime upload transport issue and outstanding operational controls limit readiness for unrestricted resident use.

Read [limitations](LIMITATIONS.md) for the full scope and [security](SECURITY.md) for data handling and private vulnerability reporting.

## Documentation

**Using ParcelPrivateer:** [Data sources](DATA_SOURCES.md) · [Models](docs/LLM.md) · [Geospatial behavior](docs/GEOSPATIAL.md)

**Trust and evaluation:** [Methodology](METHODOLOGY.md) · [Evaluation](docs/EVALUATION.md) · [Accessibility](ACCESSIBILITY.md) · [Limitations](LIMITATIONS.md) · [Security](SECURITY.md)

**Development and deployment:** [Contributing](CONTRIBUTING.md) · [Developer guide](docs/DEVELOPMENT.md) · [Deployment](docs/DEPLOYMENT.md) · [Distribution](docs/DISTRIBUTION.md) · [Release readiness](docs/RELEASE_READINESS.md)

The [documentation index](docs/README.md) identifies the main guide for each topic and separates current instructions from historical records.

## License and independence

Original software is available under the [MIT License](LICENSE). Government content, GIS layers, upstream datasets, dependencies and model weights retain their respective terms; see [notices](NOTICE.md).

ParcelPrivateer is an independent project, not an official city, county, Plan Hillsborough or State of Florida service. Confirm consequential housing, zoning, permitting and eligibility decisions with the responsible agency.
