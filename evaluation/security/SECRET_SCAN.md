# Dedicated release secret scan

Run `node --use-env-proxy --use-system-ca scripts/scan-secrets.mjs` with Node 24 and Git available. The script installs Gitleaks 8.30.1 in ignored `work/tooling`, verifies the archive against pinned SHA-256 values and the official checksum file, extracts only its named executable, and verifies its version. The checksum pins come from the [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). Windows/macOS/Linux x64 and arm64 archives are pinned. Cached artifacts are reverified; the scanner does not submit source or credentials to a service.

The scan covers every commit reachable from local refs and HEAD using `--all --full-history --root --text`, and the current tracked plus untracked nonignored release-source files. A shallow clone fails. No baseline, `.gitleaksignore`, or inline allow comment can bypass the scan. The repository config extends Gitleaks' default rules without adding exclusions. Gitleaks' upstream default allowlists still apply, including exclusions for dependency lockfiles and some static/binary file types. Encoded content is inspected to depth 5 and archives to depth 2; unknown patterns and binary formats remain limitations. Ignored `.env` files, local work products, dependencies, and generated builds are outside this publication-source scope.

The custom report template emits only rule IDs, relative paths, line numbers, and commit IDs. It never emits match text, values, author details, or commit messages. Gitleaks also runs with full redaction. Each invocation verifies detection and report redaction with an unissued random token generated only in memory. Output paths are validated against the canonical workspace and existing ancestors before writes or extraction. The working-source snapshot uses hard links and is retained under ignored `work/secret-scan`; it is never a publication artifact. The script checks whether source files, the file list, HEAD, or Git refs changed during the run and fails if the candidate changed.

The current private development history and raw public-page archive have **11 tokenlike findings**, recorded in `release-secret-scan.json`. They are third-party strings embedded in imported public HTML, not application-provider credentials; their validity and permissions are not asserted. They are unallowlisted, and the private-history scan is **not clean**. Raw provenance bytes are preserved.

For a release candidate checkout under this workspace, run:

```text
node --use-env-proxy --use-system-ca scripts/scan-secrets.mjs --root work/public-release --report evaluation/security/public-release-secret-scan.json
```

Replace the candidate path with the actual release directory. A public release requires zero findings in its history and working directory, a passed scanner self-test, and no candidate changes during scanning. Scan again after further release-source edits. A clean scan does not guarantee the absence of secrets.

For CI, use Node 24, a checkout with `fetch-depth: 0`, and run the same script. Add the sanitized scan JSON to retained check artifacts. The initial tool download requires network access; scanning itself is offline. The script exits nonzero for findings, incomplete scans, failed checksum/self-tests, shallow history, or a changing candidate. See the [Gitleaks usage documentation](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md) for the underlying modes and flags.
