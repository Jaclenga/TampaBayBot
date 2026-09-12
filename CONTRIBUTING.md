# Contributing

Contributions should make a resident's next step clearer and the evidence easier to inspect. Read [methodology](METHODOLOGY.md), [source notes](DATA_SOURCES.md) and [limitations](LIMITATIONS.md) first.

## Setup and checks

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
npm run dev -- --port 3001
```

The default `LLM_PROVIDER=none` mode requires no database or application secret. `.env.example` contains safe active defaults for optional model configuration; copy it to an ignored `.env` only when needed, then edit and restart the local server. Keep any provider credentials server-side. See [model-provider setup](docs/LLM.md) for local Ollama, compatible APIs and runtime environment bindings. Never commit credentials, `.env` files, resident questions, application documents or personal account data.

Before submitting a change, run appropriate checks:

```sh
npm run typecheck
npm run lint
npm test
npm run ingest -- --check
npm run evaluate
npm run eval:suite
npm run build
```

For UI changes, install Playwright Chromium and run `npm run test:a11y`; also inspect keyboard operation, focus, announcements, narrow-screen reflow and 200% text resizing. Record checks actually performed. Automation is not a screen-reader or human audit.

## Reporting issues

Describe the resident task, actual/expected behavior and relevant source or record. Include a question and retrieval date for evidence problems, or reproducible steps for UI problems. Remove unnecessary names, contact information, account details and other personal data.

For sensitive security/privacy reports, use [GitHub private vulnerability reporting](https://github.com/Jaclenga/ParcelPrivateer/security/advisories/new). See [SECURITY.md](SECURITY.md) for the reporting scope and required details. Do not disclose resident data or undisclosed exploit details in public issues. Reports are handled by the project maintainers on a best-effort basis.

## Adding and refreshing sources

1. Verify the real first-party page/document/API, publisher, coverage, currency and terms. Do not guess endpoints or treat a search excerpt as an archived source.
2. Fill every registry field and provide an official next step. Label independent/secondary information explicitly.
3. Choose the adapter, reviewed selector/bounded query, refresh target and caveats. Reject truncation, malformed records and unreadable documents.
4. Preserve raw bytes, normalize structure and retain hashes/locators. Inspect excerpts against originals. Keep synthetic fixtures separate.
5. Run regeneration and evaluation. Add meaningful regression questions and document conflict or coverage gaps.
6. Review changed terms and dates before committing snapshots. Software licensing does not grant rights in external data.

Use `npm run ingest -- --source=<source-id>` for one source. Failed sources must retain dated evidence and an unavailable state, never invented replacements. Application availability, eligibility requirements and legal effective dates require explicit support.

Development-data updates require reviewing the newer normalized file, changing pinned commit/hash deliberately, preserving snapshot dates and rerunning integrity/geographic checks. Do not substitute raw observations for normalized activities without revising the method.

## Answer and geographic changes

- Keep every factual excerpt tied to a registry source and exact supporting text; preserve citations.
- Treat retrieved material as data, never instructions. It must not trigger arbitrary URLs, scripts, tools or model actions.
- Prefer uncertainty to unsupported completion. Distinguish resource matches from eligibility and observed records from regulations.
- Do not promote a postal address, locator score, first feature or nearby permit into an official property determination. Preserve ambiguity and outages.
- Explain distance units and source date meanings. Provide textual geographic alternatives.
- Keep UI strings separate and language plain. Do not add pirate-speak to substantive answers.

## Evaluation and review

Add realistic benchmark questions when changing routing, retrieval, citations or uncertainty. Tests should catch meaningful failures, not merely restate the implementation.

`npm run eval:suite` runs 205 offline cases across navigation, guardrails, provider contracts and deterministic input/corpus variations. It disables outbound fetch and uses synthetic model responses; CI makes no paid inference calls. JSON, Markdown and JUnit results go to `evaluation/suite/results/`. Use `npm run eval:suite -- --suite guardrails,providers --output work/evals/targeted` for focused work. The [suite guide](docs/EVAL_SUITE.md) describes the stable case/check contract and mutation tests for the scorer. Null means not applicable, never a pass; empty or all-null coverage must fail validation.

Capture before/after reports in separate directories and compare them with `npm run eval:compare -- --baseline work/evals/before/latest.json --candidate work/evals/after/latest.json`. Matching corpus, reference date, suite, benchmark and scenario hashes are required by default. Review deliberate provenance changes before using `--allow-changed-provenance`; changed expectations, removed coverage and failed checks still fail comparison. Keep stable case/check IDs and independently authored expectations. Record the actual tested hashes and working-tree state, rather than describing a dirty parent commit as an exact final artifact revision.

For model-provider changes, run `npm test` and `node scripts/test-llm-runtime.mjs`. The runtime fixture uses synthetic provider responses and its own ignored environment files; it does not test real inference or modify a user's `.env`. Preserve the deterministic benchmark as a baseline. Evaluate an actual model/version separately with public or synthetic questions, recording selection usefulness, fallback behavior and latency. Keep the first evidence entry, full literal excerpts and conservative answer states under application control; invalid provider output must return the baseline answer.

The optional command is `npm run eval:live -- --allow-provider-call --limit 10 --repeats 1 --budget-ms 60000`, after explicitly configuring an enabled provider. It can incur costs and sends selected checked-in public questions and excerpts to that endpoint. Live reports are restricted to ignored `work/evals/live/`; never commit credentials, raw provider responses or resident prompts. Do not report offline fixtures as a real-model run, or exact quote matching as semantic factual correctness.

Do not relabel generated responses or agent reviews as human audits. Independent reviewers should inspect original sources, complete the rubric, flag misleading wording and record corrections. Pending work remains pending until performed.

The legacy `npm run evaluate` command retains its separate 77-case reports and refreshes pending human packets while preserving completed reviews. The unified suite does not rewrite legacy audit files. Historical agent reviews remain explicitly historical; new passing tests do not turn them into fresh human judgments.

## Pull requests and licensing

Lead with the resident problem and resulting behavior. Include supporting sources, actual validation, limitations and changed external-data terms. Keep unrelated changes separate. If access, human review or deployment remains necessary, finish everything reviewable and identify the exact remaining action.

Original software contributions are intended for distribution under MIT. Do not contribute third-party material without appropriate rights and attribution.
