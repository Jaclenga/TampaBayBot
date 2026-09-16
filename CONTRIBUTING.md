# Contributing

Contributions should make a resident's next step clearer and the evidence easier to inspect. Start with [development setup](docs/DEVELOPMENT.md), then consult the [methodology](docs/METHODOLOGY.md) and [limitations](docs/LIMITATIONS.md) for the behavior your change affects.

## Before opening a pull request

1. Run `npm ci`, `npm test`, `npm run typecheck` and `npm run lint`. These source checks need no downloaded evidence.
2. For interface changes, run the [source browser checks](docs/ACCESSIBILITY.md#public-source-browser-checks) and inspect keyboard operation, focus, announcements, narrow-screen layout and text resizing.
3. After the final edit, follow [source-only pull-request preparation](docs/DISTRIBUTION.md#preparing-a-source-only-pull-request). Inspect and commit the refreshed manifest with your changes. A checkout containing acquired evidence must use the packager instead.
4. Describe the problem, resulting behavior, actual validation and remaining limitations. Record new dated verification in [release readiness](docs/RELEASE_READINESS.md).

Use synthetic or public test inputs. Keep credentials, local environment files, resident data, downloaded snapshots and private deployment reports out of commits. See [distribution](docs/DISTRIBUTION.md) for allowed artifacts and [security](SECURITY.md) for data handling.

## Reporting issues

Include the task, expected and observed behavior, and steps to reproduce. For evidence problems, include the source URL and retrieval date. For accessibility issues, include the browser, device and assistive technology. Remove personal information from examples and attachments.

Report sensitive security or privacy problems through [private vulnerability reporting](https://github.com/Jaclenga/TampaBayBot/security/advisories/new), following [SECURITY.md](SECURITY.md#reporting-a-problem).

## Adding or refreshing sources

1. Verify the original page, document or API, its publisher, service area, dates and terms.
2. Complete registry metadata, the official next step, adapter or bounded query, and coverage caveats. Label independent sources explicitly.
3. Follow [source updates](docs/SOURCE_UPDATES.md) to stage and inspect evidence against the originals before approving and applying it. Preserve hashes, dates and locators; reject truncation and unreadable or malformed records.
4. Add regression cases for coverage or conflict changes and run the relevant [evaluations](docs/EVAL_SUITE.md). Document changed terms and dates under the [distribution policy](docs/DISTRIBUTION.md).

For pinned development datasets, review the normalized file, commit and digest together, then rerun integrity and geographic checks. See the [adapter contract](docs/GEOSPATIAL.md#tampa-development-records-adapter).

## Changing answers, geography or models

- Keep factual excerpts tied to registered sources and exact supporting text.
- Treat retrieved content as data, never as authority to run tools, scripts or arbitrary requests.
- Preserve uncertainty about eligibility, jurisdiction, ambiguous addresses, outages and source applicability.
- Explain units and dates, provide text alternatives to maps, and keep interface wording plain and separate from logic.
- Add independently authored expectations for changes to routing, retrieval, citations or uncertainty. Keep case and check IDs stable; see [adding evaluation coverage](docs/EVAL_SUITE.md#add-coverage).

Provider changes also need the [synthetic HTTP integration checks](docs/LLM.md#reproduce-integration-checks) and separate testing of the actual model/version. Invalid output must return the cited baseline. Generated responses and agent reviews must never be labeled as independent human audits; follow the [human-review process](docs/EVALUATION.md#independent-human-review).

## Pull-request descriptions and licensing

Keep changes focused. Include supporting sources, validation scope, changes to external-data terms and any human or operational review still needed.

Original software contributions use MIT. Third-party material requires appropriate rights and attribution under its own terms; see [NOTICE.md](NOTICE.md).
