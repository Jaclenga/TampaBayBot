# Security and privacy

TampaBayBot is an independent public-information alpha. It does not provide resident accounts, accept application documents, or process payments. Avoid submitting credentials, financial identifiers, or other sensitive personal information.

## Supported versions

Only the current alpha release line is maintained. Keep deployments and dependencies up to date, and review [release readiness](docs/RELEASE_READINESS.md) for known limitations before operating a public instance.

## Reporting a problem

Use [GitHub private vulnerability reporting](https://github.com/Jaclenga/TampaBayBot/security/advisories/new). Include the affected version or commit, expected and observed behavior, impact, and a minimal reproduction using synthetic or public data. Do not include credentials, resident questions or addresses, production logs, or private deployment details in public issues.

Reports are handled on a best-effort basis, without a guaranteed response time. After a fix is available, maintainers can coordinate a public advisory through GitHub. If the reporting form is unavailable, check the repository's [security policy](https://github.com/Jaclenga/TampaBayBot/security/policy) for the current reporting route.

## Data flow and privacy

The application does not persist resident questions, conversation histories, or addresses in its database or browser storage. Operational storage holds temporary client identifiers and aggregate service metrics. Hosting logs, transient caches, upstream services, and model providers have separate retention policies; operators must review them and avoid logging resident input.

- Answers use a local public-source evidence corpus by default. An enabled model provider receives the current question and selected evidence; operators must disclose that transfer and review the provider's privacy settings.
- Address and property searches send address text or selected location information to the configured government and GIS services.
- Opening the optional map sends selected coordinates to OpenStreetMap after the interface's disclosure.

Retrieved content and model responses are treated as untrusted input. Input validation, access controls, browser protections, and resource limits support the service's security; they do not guarantee complete protection or the accuracy of external information.

## Safe deployment

- Use HTTPS, restrict administrative access, and configure the shared production controls and monitoring described in [operations](docs/OPERATIONS.md).
- Keep credentials and private service endpoints in server-side runtime configuration. Never put secrets in source files or public build variables; review [deployment](docs/DEPLOYMENT.md) and [model configuration](docs/LLM.md).
- Review hosting and provider access, logging, retention, and spending policies. Keep backups and incident contacts current, and rotate credentials after suspected disclosure.
- Keep real environment files, runtime state, database dumps, production logs, request traces, resident data, and private deployment artifacts out of the source distribution.

Public data configuration, tests, evaluation material, and the release manifest remain available for inspection and reproducibility. Dated verification results and open runtime investigations are maintained in [release readiness](docs/RELEASE_READINESS.md) and the [engineering follow-up](docs/HISTORY.md#runtime-investigation).
