# Accessibility

TampaBayBot targets WCAG 2.2 AA; conformance has not been established. This guide documents implemented support, browser-test commands and the manual review checklist. Automated rules can find common issues, but assistive-technology and resident review remain necessary. Dated results and environments are maintained in [release readiness](RELEASE_READINESS.md).

## Implemented

- Semantic header, navigation, main, footer, sections, labels, lists, disclosure controls and data tables. The interface has one main heading per page.
- First-tab skip link; visible focus; native keyboard buttons, links, forms and details. Answers and address results receive focus after a requested search, and evidence markers open the matching source excerpt.
- Associated form errors, live status messages and busy/disabled states. Errors distinguish unavailable data from an empty successful result. Important uncertainty appears in words, not color alone.
- Responsive layouts with wrapping controls, system fonts, browser zoom, reduced-motion styles and print support. Interface font sizes use relative `rem` units so increasing the browser's default font size enlarges text.
- Property identifiers, land-use labels, jurisdiction, record distances, dates, caveats and source links are available as text. The optional OpenStreetMap frame requires an explicit button press and has a title. It provides location context; it is never the only place to obtain essential information.
- The classic interface's English and Spanish UI messages live in `src/lib/i18n/`, including property tools and reference pages. Source excerpts stay in their source language, with language attributes on quotations and original record text. English legal/regulatory text is not silently machine-translated.

## WCAG 2.2 AA audit scope

This is an engineering audit of the classic interface, reference pages and deterministic housing guide. The automated checks exercise these criteria; they do not establish conformance with every success criterion.

| Criteria | Current check | Human work still needed |
| --- | --- | --- |
| 1.3.1, 3.3.2: structure and labels | Semantic regions and associated labels are inspected by axe on English and Spanish flows. | Confirm reading order and labels with screen readers, especially long source cards. |
| 1.4.3, 1.4.10, 1.4.11, 1.4.4: contrast, reflow, non-text contrast and text resizing | Axe rules, 320px/375px overflow checks and the separate actual Chromium zoom/font preference suite. | Check visual clipping, contrast in real devices and browsers, including forced colors and 400% zoom after each layout change. |
| 2.1.1, 2.4.3, 2.4.7, 2.4.11: keyboard, focus order, visible focus and unobscured focus | Skip-link and guide/question keyboard flows, focus assertions, and focus style checks. | Navigate every card, disclosure, link and control with keyboard and screen reader on the deployed site. |
| 2.5.8: target size | axe `wcag22aa` rules run on mobile home, guide and reference pages. | Check closely spaced touch targets on actual phones; automated rules do not cover all target-size exceptions. |
| 2.5.7, 3.2.6, 3.3.7: dragging, consistent help and redundant entry | Code inspection found no drag-only resident task or repeated personal-information entry. The emergency/help links remain visible in the guide. | Manually check consistency across every public route and reassess if workflows gain dragging or repeated entry. Installed axe has no `wcag22a` tag for the new A criteria. |
| 3.3.8: accessible authentication | The public question, directory and housing guide require no account or authentication. | Reassess if a resident login is introduced; staff operations access is a separate interface. |
| 3.1.1, 3.1.2: page language and language of parts | Language-switch tests check the document language and original-language attributes on source material. | Have fluent reviewers inspect spoken pronunciation and language tags in a screen reader. |
| 3.3.1, 4.1.3: errors and status messages | Browser tests check associated form errors, focus and named status regions. | Verify announcement timing and repetition with assistive technology. |

The deterministic guide and directory are available without an AI service. Their catalog's provider names, descriptions, eligibility and source notes are in English; linked agency pages may have other language options that this project has not verified. The Spanish UI explicitly marks that boundary; a translated interface is not a translated official source. The general source registry also has records with no language metadata; the UI labels those as unrecorded instead of claiming they are English. The public resident tasks have no account authentication or dragging interaction; the WCAG 2.2 criteria for those features need reassessment if they are added. See [W3C's WCAG 2.2 changes](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) and [target-size explanation](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

### Translation maintenance for safety guidance

Keep English and Spanish crisis instructions as authored, version-controlled copy. `tests/translation-coverage.test.mjs` checks for distinct Spanish UI strings and compares all nine deterministic crisis routes and eviction stages across languages for the same routing, urgency, referrals, resources and official source URLs. A change to an emergency instruction, eviction notice distinction, deadline caution, eligibility caveat, quick-exit notice or contact referral must receive review by a fluent Spanish reviewer **and** a housing or safety subject-matter reviewer before a resident-facing release. Review the two languages together, the exact scenario and county, the official source, and any copied/printed plan text. Record reviewer, date, source checked and changed strings in the release record. If review is unavailable, do not publish the new high-stakes wording as reviewed; retain existing approved copy only when its review is documented. Never silently use machine translation for legal or emergency directions. Current Spanish wording still awaits that independent review, so this process is a release requirement, not a claim that it has occurred.

Run the local translation coverage check with `npm run test:translations`; the dedicated accessibility-language CI workflow runs it too. This check detects missing or accidentally shared copy and changed routing relationships. It cannot judge Spanish clarity, legal meaning or current source accuracy.

## Automated checks

The focused browser command also runs `tests/e2e/source-language-accessibility.spec.ts`, which checks source-library search state, keyboard focus, unknown-language notices, mobile reflow and axe rules.

The current `tests/e2e/accessibility-language.spec.ts` suite runs axe with WCAG 2.0/2.1 A/AA and WCAG 2.2 AA tags on the classic mobile home, housing guide and reference pages. Installed axe has no `wcag22a` tag; the new A criteria still need manual assessment. The suite also checks first-tab skip navigation, visible focus indicators, Spanish errors and status regions, preserved question and crisis-guide selections, official-source language notice, 320px reflow and that guide selections make no API call. It uses only local app routes and does not require a production credential, downloaded corpus or live AI service. The dedicated `.github/workflows/accessibility-language.yml` workflow runs this focused suite in CI. Run it locally with:

```sh
npx playwright install chromium
npm run test:accessibility:browser
```

Playwright JSON/HTML results are generated locally. Inspect axe `incomplete` entries as well as violations; zero violations means only that the tested automated rules found none in those rendered states.

The Pages preview has its own static browser suite: run `npm run test:pages:browser` after installing Chromium. It exercises the directory and guide without a backend service and includes mobile and axe checks. The dedicated accessibility-language CI workflow runs that Pages suite alongside the focused classic checks. Review the hosted Pages URL separately after deployment; local static tests do not establish hosted accessibility.

For the directory-only preview, build with `VITE_DIRECTORY_ONLY=true npm run build:pages` and run `npx playwright test --config pages-demo/playwright.preview.config.mjs`. In PowerShell, set `$env:VITE_DIRECTORY_ONLY = 'true'` before the build and remove it afterward. CI runs this preview configuration as a separate regression check.

Historical complete production-browser runs on Windows and later Ubuntu Linux failed after an abandoned upload poisoned Miniflare's local static-assets transport. The retained Windows production-browser run passed all 15 application cases. It used the built static-assets route for resident, accessibility, asset and response-policy checks and the exact same compiled Worker through a direct route for stalled-upload deadlines. These are local runtime checks, not hosted Cloudflare tests. [Release readiness](RELEASE_READINESS.md) records the current scope, and [the transport follow-up](HISTORY.md#runtime-investigation) preserves the earlier failure.

The retained production and archived axe scans reported no violations or incomplete nodes in the scanned flows. Reflow, the historical CSS zoom approximation and the production security checks passed. The current source-demo checks below add actual browser zoom and font preferences. Automation does not replace human accessibility review.

Historical desktop, mobile, housing-answer and evaluation images under `docs/screenshots/` were associated with the 15:17 UTC browser run and are omitted from source-only packages. An implementation agent inspected those earlier images; they were not refreshed or visually reviewed for the final production run. See [historical verification](HISTORY.md#release-verification) for the archived records. This is not a human usability audit.

## Public source browser checks

`npm run test:source:browser` starts an isolated fictional demo and verifies citations, keyboard interaction, mobile reflow, jurisdiction follow-ups and Spanish navigation, including axe scans. It needs Chromium (`npx playwright install chromium`) but no downloaded corpus or model. `docs/images/demo.png` is the current original fictional demo capture; historical screenshots remain archived separately.

The added `tests/source-e2e/ui-accessibility.spec.ts` checks these flows:

- Keyboard-only skip navigation, empty-question error correction, question submission, returned-answer focus, citation opening, disclosure closing/reopening and reset. It attaches an accessibility-tree snapshot and checks axe violations.
- Home, an expanded cited answer, source library, project information and evaluation pages at 320px and 375px, with forced colors and reduced motion enabled. It checks horizontal page overflow and the focused source disclosure's outline.
- Actual Chromium browser zoom at 200% and 400%, including the complete question and reference-page flows. Tests verify the zoom preference, effective viewport width and device pixel ratio while CSS zoom remains unchanged.
- Actual browser default-font resizing from 16px to 32px, separately from page zoom, through the same flows. This exposed and fixed the previous fixed-pixel typography, which did not respect the enlarged default font preference.

The zoom and font tests use a temporary extension in a new, isolated Chromium profile inside the ignored test output. It uses Chromium's [`tabs.setZoom`](https://developer.chrome.com/docs/extensions/reference/api/tabs) and [`fontSettings`](https://developer.chrome.com/docs/extensions/reference/api/fontSettings) APIs. The normal bundled Chromium channel supports this headless [Playwright extension test setup](https://playwright.dev/docs/chrome-extensions). It does not change the user's browser profile. JSON attachments retain the measured preferences; screenshots retain rendered viewport evidence. These are local agent-operated browser checks against fictional data, not production, assistive-technology or independent human usability reviews.

Run just these checks with:

```sh
npx playwright test --config playwright.source.config.ts tests/source-e2e/ui-accessibility.spec.ts
```

The HTML report and its attachments are written under `work/source-browser-report/`; the temporary browser profiles stay under `test-results/`. These generated files are excluded from the public source package.

On 2026-09-13, the Windows/Chromium 153.0.8010.12 source-browser run passed all 11 cases with no retries: four accessibility cases above, four existing demo cases and three Spanish reference/property/quotation cases. An implementation agent visually inspected the home and open-evidence viewport captures at 200%/400% browser zoom and 200% default-font size. The Spanish property case uses mocked GIS responses and checks 320px reflow, untranslated original record text and axe violations; it does not verify a live GIS service. The public demo image and archived production images were not refreshed by this run.

All 11 source-browser cases passed again after the September 16 architecture fixes. That automated rerun did not repeat the earlier visual inspection or add human/screen-reader review; see [the current verification record](RELEASE_READINESS.md#september-16-2026-local-architecture-verification).

## Run the historical corpus browser checks

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

The eleven resident/browser tests cover home, source library, project information, evaluation, a cited housing answer, an address-selection flow with unavailable GIS data, address-only entry, labeled model selection/fallback, private-input correction, keyboard submission, accessible errors, mobile reflow, a 200% zoom approximation with reduced motion, and malformed API requests. Four security integration tests run alongside them; the production-only CSP test is skipped in development mode. Synthetic address and provider cases are explicitly fixtures; they do not verify live geography or real-model quality. Dated live property observations are linked from [geographic verification history](HISTORY.md#geographic-coverage); their raw reports are omitted from source-only packages.

Playwright writes fresh raw JSON to `evaluation/accessibility/playwright-results.json` and its HTML report under `playwright-report/`. `evaluation/accessibility/latest.json` is the retained Windows summary; a later raw run does not automatically make that dated summary current. The later Linux result is a separate receipt linked from [release readiness](RELEASE_READINESS.md). Keep dates, environments and report hashes together before updating any summary.

Sanitize machine paths before publishing the raw JSON with `node scripts/sanitize-report.mjs evaluation/accessibility/playwright-results.json`. An absent report means no recorded run in that checkout. Screenshot/axe artifacts are development evidence and are excluded from the source-only package. Automated rules cannot prove that explanations are understandable or that every screen reader works correctly.

## Manual review checklist

Record reviewer, date, browser/OS, assistive technology, observed result and issue links for each item. Automated coverage above provides regression evidence for parts of this list; these broader human checks are still **pending**:

1. Navigate all links, categories, forms, errors, answer citations, address candidates, distance choices and source disclosures using only Tab, Shift+Tab, Enter, Space and arrow keys.
2. Read the flows with NVDA/Firefox or NVDA/Chrome on Windows and VoiceOver/Safari on Apple platforms. Confirm announcements, heading order, focus movement, citation context and dynamically returned results.
3. Use true browser zoom at 200% and 400%; separately enlarge only text at 200%. Check labels, long addresses, source excerpts, table headers, buttons and form errors without clipped text or unintended two-direction scrolling.
4. Test 320px and 375px widths, touch use, high contrast/forced colors, reduced motion and increased default font settings.
5. Confirm property and activity tasks can be completed without opening the map. Test optional map dismissal/navigation with a keyboard and external link announcements.
6. Ask residents with varied housing/government knowledge to perform a task and explain the evidence, uncertainty and next step in their own words.
7. Have fluent Spanish readers and housing/safety reviewers verify crisis, eviction and emergency guidance against the current official source; check language switching while a plan is in progress and confirm the guide's English provider fields and the source registry's unrecorded languages are identified accurately.

## Known limitations

- No human screen-reader audit, accessibility expert sign-off or resident usability study has been completed. The prepared human answer audit contains no fabricated accessibility scores.
- The historical production suite's CSS zoom remains an approximation. Actual browser zoom and default-font resizing are covered by the separate Chromium fictional-demo suite; Firefox, Safari, mobile assistive technology and resident readability still need review.
- Original government documents and OpenStreetMap are outside project control and may have their own accessibility problems. The application exposes text evidence and direct alternatives but cannot repair the original source sites.
- The classic question, property and reference interfaces support English and Spanish. The separate Cloudflare Pages preview has a Spanish shell, directory and deterministic guide, while its question, answer and property tools and privacy page remain English and are labeled accordingly. Official source titles, quotations and record content retain their original language; some general source records have unrecorded language rather than a verified English label. Spanish wording still needs independent fluent-speaker and resident review. Source acronyms and some quoted regulatory wording remain technical; a verified plain-language glossary needs further work.
- Screen-reader announcement order, long source-disclosure navigation, mobile assistive technology and forced-color support need human validation.
- WCAG 2.2 success criteria that axe cannot reliably judge, including focus not obscured, consistent help, redundant entry and accessible authentication where applicable, require manual assessment. No WCAG 2.2 AA conformance claim is made.

On 2026-09-13, the local Windows environment had Narrator available but no active screen-reader session or usable speech-output inspection interface; NVDA was absent from its usual installation paths. No screen-reader session, human audit or resident study was performed by these checks.

Report reproducible accessibility issues through [CONTRIBUTING.md](../CONTRIBUTING.md), with the browser, device, assistive technology and task affected. Avoid private resident information; sensitive security/privacy details belong in the [private reporting channel](../SECURITY.md#reporting-a-problem).
