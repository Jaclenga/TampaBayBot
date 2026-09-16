# TampaBayBot

Find Tampa Bay housing resources, property information and official next steps, with the public sources behind each answer.

TampaBayBot is an independent, open-source project for questions about housing assistance, zoning, permits and nearby development. It retrieves public evidence and shows supporting quotations, source dates and agency links. The default answer engine works without a language model.

> **Alpha: for contributors and supervised testing.** The source release starts without downloaded evidence. Independent human review and production-readiness work remain open; see [release status](docs/RELEASE_READINESS.md).

[Releases](https://github.com/Jaclenga/TampaBayBot/releases) | [Issues](https://github.com/Jaclenga/TampaBayBot/issues) | [Private security reporting](https://github.com/Jaclenga/TampaBayBot/security/advisories/new)

## What it does

- Find housing resources for renters and homeowners.
- Look up mapped zoning and future land use after address confirmation.
- Find permitting guidance, applications and agency contacts.
- Explore nearby development records with their sources and dates.

Choose Tampa, St. Petersburg, Clearwater, or county resources for Hillsborough, Pinellas and Pasco. The app asks for clarification when location is unclear. Coverage varies by source and service; see [geographic coverage](docs/GEOSPATIAL.md).

## Quick start

Use Node.js 24 and npm. From the project directory:

```sh
npm ci
npm run demo
```

Open [localhost:3001](http://localhost:3001). The demo uses labeled fictional evidence in a separate directory and needs no account, API key, database or `.env` file. See [demo options and example questions](docs/DEMO.md).

For real evidence, [stage, review and apply source updates](docs/SOURCE_UPDATES.md), then run `npm run dev -- --port 3001`. Source downloads and live geographic lookups need internet access.

## How it works

The app identifies the question's topic and location, retrieves relevant evidence, and assembles quotations with an official next step. Missing evidence, unavailable sources and ambiguous locations produce explicit uncertainty states. Questions and navigation support English and Spanish; source quotations retain their original language.

Optional Ollama or OpenAI-compatible providers can select from retrieved evidence. The application validates their selections and falls back to the baseline answer when needed. See [methodology](docs/METHODOLOGY.md) for the evidence pipeline and [model configuration](docs/LLM.md) for setup and data flow.

## Evaluation and limits

Automated checks cover source regressions, exact-claim and citation behavior, program recall, provider validation and browser flows. [Evaluation and review](docs/EVALUATION.md) explains the metrics; [program recall](docs/PROGRAM_RECALL.md) and [release readiness](docs/RELEASE_READINESS.md) preserve dated results and unresolved checks. These development results do not establish general accuracy or resident usefulness.

A resource match is not an eligibility decision, a zoning designation is not permission to build, and nearby records do not prove construction or a legal relationship. Public information may be incomplete, stale or unavailable. Confirm consequential decisions with the responsible agency. See [limitations](docs/LIMITATIONS.md) and [security and privacy](SECURITY.md).

## Documentation

- [Documentation index](docs/README.md): guides by task and topic.
- [Development](docs/DEVELOPMENT.md): setup, repository layout, tests and APIs.
- [Contributing](CONTRIBUTING.md): review requirements and pull requests.
- [Deployment](docs/DEPLOYMENT.md): build and host with your own account.

## License and independence

Original software is available under the [MIT License](LICENSE). External information, dependencies and model weights retain their respective terms; see [notices](NOTICE.md).

TampaBayBot is independent of city, county, Plan Hillsborough and State of Florida services.
