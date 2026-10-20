# Security and privacy

TampaBayBot is an independent public-information alpha. It does not provide resident accounts, accept application documents, or process payments. Avoid submitting credentials, financial identifiers, or other sensitive personal information.

## Supported versions

Only the current alpha release line is maintained. Keep deployments and dependencies up to date, and review [release readiness](docs/RELEASE_READINESS.md) for known limitations before operating a public instance.

## Reporting a problem

Use [GitHub private vulnerability reporting](https://github.com/Jaclenga/TampaBayBot/security/advisories/new). Include the affected version or commit, expected and observed behavior, impact, and a minimal reproduction using synthetic or public data. Do not include credentials, resident questions or addresses, production logs, or private deployment details in public issues.

Reports are handled on a best-effort basis, without a guaranteed response time. After a fix is available, maintainers can coordinate a public advisory through GitHub. If the reporting form is unavailable, check the repository's [security policy](https://github.com/Jaclenga/TampaBayBot/security/policy) for the current reporting route.

## Data flow and privacy

The inspected application code does not persist resident questions, conversation histories, guide selections, or addresses in its database or browser local/session storage. They can remain in page memory while the tab is open. Operational D1 storage holds rotating HMAC-derived client identifiers, usage counters, and aggregate service metrics, without raw client IPs or request text. Expired rows are removed by later requests or monitoring, not at a guaranteed deletion instant. Hosting logs, transient caches, upstream services, and model providers have separate retention policies; operators must review them and avoid logging resident input.

- Answers use the backend's bundled public-source evidence corpus by default. A configured model receives the current question and selected public-source excerpts only for eligible answers. The question is not generally redacted before transfer; operators must disclose that path and review the provider's privacy settings. A hosted Worker is not local processing on a visitor's device.
- Address and property searches send address text or selected location information to the configured government and GIS services.
- Opening the optional map sends selected coordinates to OpenStreetMap after the interface's disclosure.

Retrieved content and model responses are treated as untrusted input. Input validation, access controls, browser protections, and resource limits support the service's security; they do not guarantee complete protection or the accuracy of external information.

The [preview threat model](docs/THREAT_MODEL.md) maps these data flows to controls, tests, and remaining risks. It does not verify the hosted preview's deployed version, provider settings, or platform logs.

## Dependency audit and build-tool advisories

The October 9, 2026 review found `braces@3.0.3` in development-only ESLint and vinext build dependencies. [GitHub advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) describes stack exhaustion for deeply nested brace patterns and still lists no patched `braces` version as checked October 20. Keep build and lint inputs trusted. An October 20 `npm run security:deps` report found zero affected production packages and eight high-severity development/build packages; npm marked fixes available for those dependency paths. That flag does not establish a patched `braces` release, and no proposed dependency changes have been validated in this repository. The command writes production and full-dependency JSON/Markdown reports under ignored `work/security/`. CI blocks on high or critical production-dependency findings and reports development/build findings for review. A scan can be incomplete or disagree with another advisory source; do not treat a passing production gate as approval of build dependencies or absence of vulnerabilities.

The Worker rejects unsupported page/form/action uploads before framework parsing and routes supported JSON uploads through bounded API readers and operational controls. Source acquisition refuses redirects, bounds normalized evidence and chunk output, and terminates parsing workers that exceed their deadline. See [request controls](docs/OPERATIONS.md#shared-controls) and [source-processing limits](docs/SOURCE_UPDATES.md#acquire-a-candidate) for the exact behavior and operator recovery steps.

An October 20 stable Gitleaks run found zero current-tree detector matches and 27 matches in reachable Git history. Its status is `findings_require_review`, so the release secret gate fails pending review of each historical match; a match is not proof that a credential is valid, and zero current-tree matches do not clear past commits. If review confirms an exposed credential, revoke or rotate it through the owner account. Do not copy candidate values into issues, logs, or public reports.

## Safe deployment

- Use HTTPS, restrict administrative access, and configure the shared production controls and monitoring described in [operations](docs/OPERATIONS.md).
- Keep credentials and private service endpoints in server-side runtime configuration. Never put secrets in source files or public build variables; review [deployment](docs/DEPLOYMENT.md) and [model configuration](docs/LLM.md).
- Review hosting and provider access, logging, retention, and spending policies. Keep backups and incident contacts current, and rotate credentials after suspected disclosure.
- Keep real environment files, runtime state, database dumps, production logs, request traces, resident data, and private deployment artifacts out of the source distribution.
- Before a public commit or deployment, run `node scripts/check-evaluation-artifacts.mjs`. It checks the working tree and staged Git index for populated evaluation response packets. Source-only CI also checks them, but CI cannot retract content from a direct push.

Public data configuration, tests, evaluation material, and the release manifest remain available for inspection and reproducibility. Dated verification results and open runtime investigations are maintained in [release readiness](docs/RELEASE_READINESS.md) and the [engineering follow-up](docs/HISTORY.md#runtime-investigation).
