# Accessibility

ParcelPrivateer targets WCAG 2.1 AA; conformance has not been established. This guide documents implemented support, browser-test commands and the manual review checklist. Automated rules can find common issues, but assistive-technology and resident review remain necessary. Dated results and environments are maintained in [release readiness](RELEASE_READINESS.md).

## Implemented

- Semantic header, navigation, main, footer, sections, labels, lists, disclosure controls and data tables. The interface has one main heading per page.
- First-tab skip link; visible focus; native keyboard buttons, links, forms and details. Answers and address results receive focus after a requested search, and evidence markers open the matching source excerpt.
- Associated form errors, live status messages and busy/disabled states. Errors distinguish unavailable data from an empty successful result. Important uncertainty appears in words, not color alone.
- Responsive layouts with wrapping controls, system fonts, browser zoom, reduced-motion styles and print support.
- Property identifiers, land-use labels, jurisdiction, record distances, dates, caveats and source links are available as text. The optional OpenStreetMap frame requires an explicit button press and has a title. It provides location context; it is never the only place to obtain essential information.
- English UI messages live in `src/lib/i18n/`. Source excerpts stay in their source language. English legal/regulatory text is not silently machine-translated.

## Automated checks

Historical complete production-browser runs on Windows and later Ubuntu Linux failed after an abandoned upload poisoned Miniflare's local static-assets transport. The current Windows run passes all 15 application cases. It uses the built static-assets route for resident, accessibility, asset and response-policy checks and the exact same compiled Worker through a direct route for stalled-upload deadlines. These are local runtime checks, not hosted Cloudflare tests. [Release readiness](RELEASE_READINESS.md) records the current scope, and [the transport follow-up](BUG_FIX_FOLLOWUP_2026-09-12.md) preserves the earlier failure.

The current and archived axe scans reported no violations or incomplete nodes in the scanned flows. Reflow, the CSS zoom approximation and the production security checks passed. Automation does not replace human accessibility review.

The desktop, mobile, housing-answer and evaluation images in `docs/screenshots/` retain the earlier redesign captures associated with the 15:17 UTC browser run. An implementation agent visually inspected those earlier images; they were not refreshed or visually reviewed for the final production run. This is not a human usability audit.

## Run the browser checks

These complete browser scenarios expect a populated, reviewed corpus and generated evaluation reports. The empty source-only distribution has an explicit setup screen instead; its separate release workflow checks that state without claiming the resident scenarios passed. See [source loading](DISTRIBUTION.md) and [evaluation commands](EVAL_SUITE.md).

```sh
npx playwright install chromium
npm run test:a11y
```

Playwright uses axe-core against the actual app and starts a development server at port 3100 by default. Build first to exercise production security. In PowerShell:

```powershell
npm.cmd run build
$env:PLAYWRIGHT_PRODUCTION_SECURITY = 'true'
npm.cmd run test:a11y
Remove-Item Env:PLAYWRIGHT_PRODUCTION_SECURITY
```

For a POSIX shell, run `npm run build` followed by `PLAYWRIGHT_PRODUCTION_SECURITY=true npm run test:a11y`. Production mode starts the built local static-assets route plus a direct route for stalled-upload checks, includes the CSP assertion and disables retries. Development mode skips that production-only assertion; any skipped check must remain visible in the report.

To test an already running instance, set `PLAYWRIGHT_BASE_URL`; Playwright will not launch another server:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3001'
npm.cmd run test:a11y
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

The POSIX equivalent is `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:a11y`. If `PLAYWRIGHT_PRODUCTION_SECURITY=true` is also set, that existing server must actually be a production build. By default the upload checks use that same external URL; set `PLAYWRIGHT_INPUT_BASE_URL` only when the deployment exposes a separate direct Worker test route. These variables configure tests, not application secrets. Generic Node/PowerShell setup is documented in the [development guide](DEVELOPMENT.md).

The eleven resident/browser tests cover home, source library, project information, evaluation, a cited housing answer, an address-selection flow with unavailable GIS data, address-only entry, labeled model selection/fallback, private-input correction, keyboard submission, accessible errors, mobile reflow, a 200% zoom approximation with reduced motion, and malformed API requests. Four security integration tests run alongside them; the production-only CSP test is skipped in development mode. Synthetic address and provider cases are explicitly fixtures; they do not verify live geography or real-model quality. Live property verification is separately recorded in `docs/geospatial-live-validation.json`.

Playwright writes fresh raw JSON to `evaluation/accessibility/playwright-results.json` and its HTML report under `playwright-report/`. `evaluation/accessibility/latest.json` is the retained Windows summary; a later raw run does not automatically make that dated summary current. The later Linux result is a separate receipt linked from [release readiness](RELEASE_READINESS.md). Keep dates, environments and report hashes together before updating any summary.

Sanitize machine paths before publishing the raw JSON with `node scripts/sanitize-report.mjs evaluation/accessibility/playwright-results.json`. An absent report means no recorded run in that checkout. Screenshot/axe artifacts are development evidence and are excluded from the source-only package. Automated rules cannot prove that explanations are understandable or that every screen reader works correctly.

## Manual review checklist

Record reviewer, date, browser/OS, assistive technology, observed result and issue links for each item. These human checks are **pending**:

1. Navigate all links, categories, forms, errors, answer citations, address candidates, distance choices and source disclosures using only Tab, Shift+Tab, Enter, Space and arrow keys.
2. Read the flows with NVDA/Firefox or NVDA/Chrome on Windows and VoiceOver/Safari on Apple platforms. Confirm announcements, heading order, focus movement, citation context and dynamically returned results.
3. Use true browser zoom at 200% and 400%; separately enlarge only text at 200%. Check labels, long addresses, source excerpts, table headers, buttons and form errors without clipped text or unintended two-direction scrolling.
4. Test 320px and 375px widths, touch use, high contrast/forced colors, reduced motion and increased default font settings.
5. Confirm property and activity tasks can be completed without opening the map. Test optional map dismissal/navigation with a keyboard and external link announcements.
6. Ask residents with varied housing/government knowledge to perform a task and explain the evidence, uncertainty and next step in their own words.

## Known limitations

- No human screen-reader audit, accessibility expert sign-off or resident usability study has been completed. The prepared human answer audit contains no fabricated accessibility scores.
- Automated CSS zoom is an approximation, not a substitute for browser zoom and text-only resizing. Some secondary metadata is small and must be checked with resident users and enlarged text.
- Original government documents and OpenStreetMap are outside project control and may have their own accessibility problems. The application exposes text evidence and direct alternatives but cannot repair the original source sites.
- The initial UI is English only. Source acronyms and some quoted regulatory wording remain technical; a verified plain-language glossary needs further work.
- Screen-reader announcement order, long source-disclosure navigation, mobile assistive technology and forced-color support need human validation.

Report reproducible accessibility issues through [CONTRIBUTING.md](../CONTRIBUTING.md), with the browser, device, assistive technology and task affected. Avoid private resident information; sensitive security/privacy details belong in the [private reporting channel](../SECURITY.md#reporting-a-problem).
