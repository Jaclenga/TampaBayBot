# ParcelPrivateer source-only alpha

Independent, MIT-licensed Tampa housing-information software with optional local Ollama or API model assistance.

This source-only distribution contains no downloaded evidence or historical response packets. Fetch and review sources locally before expecting cited answers. Evaluation has not run for this copy.

## Start locally

Use Node.js 24 LTS. The app needs no account, database or model credentials in its default mode.

```sh
npm ci
npm run dev -- --port 3001
```

The unpopulated app starts safely and exposes source links, but has no evidence to answer factual questions. Read [source distribution and publisher terms](docs/DISTRIBUTION.md), then download sources directly from their publishers:

```sh
npm run ingest
npm run dev -- --port 3001
```

An unavailable publisher causes ingestion to return an error and preserves an explicit unavailable state. Review the ingestion report and source content before serving residents. A fresh download is not the historical development corpus and is not guaranteed to pass its dated benchmark expectations unchanged.

## Validate your corpus

```sh
npm run ingest -- --check
npm test
npm run evaluate
npm run eval:suite
npm run typecheck
npm run build
```

Those complete regression commands require populated evidence; do not treat their failures on an empty corpus as passing checks. Evaluation commands regenerate local reports and preserve failures. Historical agent/human reviews are not recreated automatically. [Evaluation guide](docs/EVAL_SUITE.md).

For local Meta models, read [Ollama/provider setup](docs/LLM.md). For independent hosting, read [deployment](docs/DEPLOYMENT.md). A hosted server cannot reach a model on your computer through its own localhost.

## Release boundary

This is an alpha source distribution, not a validated public resident service. Independent human review, manual accessibility checks, operator abuse limits and hosted verification remain deployment requirements. The Windows local static-assets runtime has a known follow-up request failure after a rejected unread upload; deployment relevance requires verification. [Security](SECURITY.md), [limitations](LIMITATIONS.md), [contributions](CONTRIBUTING.md).

The manifest lists packaged file hashes. Downloaded HTML/PDF/JSON/CSV data, evidence chunks, screenshots, historical response packets, owner hosting identity, environment files and Git history are excluded. Tests and benchmark definitions are original software; fixture examples do not represent residents. [MIT license](LICENSE), [external-source notices](NOTICE.md).

See [release notes](CHANGELOG.md), [alpha verification](docs/ALPHA_VERIFICATION.json) and the [private security-reporting instructions](SECURITY.md#reporting-a-problem). The documented results identify the tested development tree or source-only package; they are not a claim that this newly populated corpus has passed those checks.
