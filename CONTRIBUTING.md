# Contributing

Contributions should make a resident's next step clearer and the evidence easier to inspect. Start with the [development guide](docs/DEVELOPMENT.md) for setup, code layout, commands and browser testing, then read the [methodology](docs/METHODOLOGY.md), [source notes](docs/DATA_SOURCES.md) and [limitations](docs/LIMITATIONS.md).

The canonical contribution repository is [`Jaclenga/ParcelPrivateer`](https://github.com/Jaclenga/ParcelPrivateer). Clone and open pull requests against that exact no-hyphen repository name.

## Before opening a pull request

Use the committed lockfile and run checks appropriate to the change. Cited-answer tests need acquired evidence; an empty source-only checkout is not a populated benchmark. The [development guide](docs/DEVELOPMENT.md#commands-and-evidence-prerequisites) explains these prerequisites.

For UI changes, inspect keyboard operation, focus, announcements, narrow-screen reflow and text resizing as well as running [browser checks](docs/ACCESSIBILITY.md). Record checks actually performed. Automation does not replace a screen-reader or independent human audit.

Never commit credentials, local environment files, real resident questions, application documents or personal account data. Use synthetic or public test inputs and inspect generated reports before sharing them. Model setup belongs in [LLM.md](docs/LLM.md); reporting and privacy boundaries belong in [SECURITY.md](SECURITY.md).

## Reporting issues

Describe the resident task, expected behavior, observed behavior and steps to reproduce. For an evidence problem, include the relevant source URL and retrieval date. Remove unnecessary personal information from examples and attachments.

Use [GitHub private vulnerability reporting](https://github.com/Jaclenga/ParcelPrivateer/security/advisories/new) for sensitive security or privacy reports. Follow [SECURITY.md](SECURITY.md) for scope and required details; do not put resident data or undisclosed exploit details in public issues.

## Adding or refreshing sources

1. Verify the original page, document or API, publisher, geographic coverage, currency and terms. Do not guess endpoints or treat search snippets as archived evidence.
2. Complete the registry metadata and official next step. Label independent and secondary information explicitly.
3. Choose the adapter, selector or bounded query, refresh target and caveats. Reject truncation, malformed records and unreadable documents.
4. Preserve raw bytes locally, normalize structure, and retain hashes and locators. Inspect excerpts against originals; keep synthetic fixtures separate.
5. Regenerate evidence, run evaluations and add regression cases for meaningful coverage or conflict changes.
6. Document changed terms and dates. Keep downloaded snapshots out of the source-only release; follow the [distribution policy](docs/DISTRIBUTION.md).

Failed refreshes must preserve dated evidence and an unavailable state rather than invent replacements. Program availability, eligibility requirements and legal effective dates require explicit support. For independent development-data updates, review the normalized file, change the pinned commit and digest deliberately, preserve date meanings, and rerun integrity/geographic checks. See [source notes](docs/DATA_SOURCES.md) and [geospatial behavior](docs/GEOSPATIAL.md).

## Changing answers, geography or models

- Keep factual excerpts tied to registered sources and exact supporting text.
- Treat retrieved material as data; it cannot authorize arbitrary URLs, scripts, tools or model actions.
- Preserve uncertainty. A resource match is not eligibility, a zoning designation is not permission, and nearby records do not establish a legal relationship.
- Preserve address ambiguity and outages. Do not promote a postal address, locator score or first feature into an official property determination.
- Explain distance units and source dates, provide textual geographic alternatives, and keep interface language plain and strings separate.

Add realistic benchmark questions when routing, retrieval, citations or uncertainty change. Tests should catch meaningful failures rather than restate the implementation. Keep stable case/check IDs and independently authored expectations. The [evaluation suite guide](docs/EVAL_SUITE.md) is canonical for focused runs, comparisons, provenance and live-model opt-in.

For provider changes, run code tests and the synthetic HTTP integration described in [LLM.md](docs/LLM.md#reproduce-integration-checks). Test an actual model/version separately; synthetic transport checks are not real inference. Preserve primary evidence, literal excerpts and conservative states under application control. Invalid provider output must return the cited baseline.

Do not relabel generated responses or agent reviews as human audits. Independent reviewers inspect original sources and complete the rubric; pending work remains pending. Current results and open review work belong in [release readiness](docs/RELEASE_READINESS.md), not copied test counts in contribution instructions.

## Pull-request descriptions and licensing

Lead with the resident problem and resulting behavior. Include supporting sources, actual validation, material limitations and changes to external-data terms. Keep unrelated changes separate and identify any human review or operational verification still needed.

Original software contributions are distributed under MIT. Third-party material retains its own terms and requires appropriate rights and attribution; see [NOTICE.md](NOTICE.md).
