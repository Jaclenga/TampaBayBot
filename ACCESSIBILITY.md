# Accessibility

ParcelPrivateer targets WCAG 2.1 AA. This v0.1 review build is **not a claim of full WCAG conformance**. Automated browser checks cover common issues; assistive-technology and resident review remain necessary.

## Implemented

- Semantic header, navigation, main, footer, sections, labels, lists, disclosure controls and data tables. The interface has one main heading per page.
- First-tab skip link; visible focus; native keyboard buttons, links, forms and details. Answers and address results receive focus after a requested search, and evidence markers open the matching source excerpt.
- Associated form errors, live status messages and busy/disabled states. Errors distinguish unavailable data from an empty successful result. Important uncertainty appears in words, not color alone.
- Responsive layouts with wrapping controls, system fonts, browser zoom, reduced-motion styles and print support.
- Property identifiers, land-use labels, jurisdiction, record distances, dates, caveats and source links are available as text. The optional OpenStreetMap frame requires an explicit button press and has a title. It provides location context; it is never the only place to obtain essential information.
- English UI messages live in `lib/i18n/`. Source excerpts stay in their source language. English legal/regulatory text is not silently machine-translated.

## Automated checks

The latest complete local production run on September 12, 2026 **failed overall: 13 tests passed, 1 failed, 0 skipped** using Chromium 153 / Playwright 1.63. It tested the built Worker through Wrangler/Workerd at `127.0.0.1:3100`, with the production Content Security Policy enabled. The malformed/oversized-request sequence failed when a property request after the oversized upload returned HTTP 500 instead of the expected 400. This was a local production-runtime integration check, not a hosted deployment test.

All nine archived axe scans reported zero violations and zero incomplete checks. Desktop and 375px mobile reflow checks, the 200% CSS zoom approximation, and the four new security tests passed. Those security tests cover unfinished-upload timeouts, blocked image-processing routes, response headers, and production CSP enforcement with working hydration. Passing these checks does not change the failed overall run or replace human accessibility review.

The desktop, mobile, housing-answer and evaluation images in `docs/screenshots/` retain the earlier redesign captures associated with the 15:17 UTC browser run. An implementation agent visually inspected those earlier images; they were not refreshed or visually reviewed for the final production run. This is not a human usability audit.

`npm run test:a11y` runs Playwright with axe-core against the actual application. By default it starts the local development app at port 3100. To include the production CSP test, build the app first and set `PLAYWRIGHT_PRODUCTION_SECURITY=true`; the suite then starts the built local Worker. Set `PLAYWRIGHT_BASE_URL` to test an already running instance, which must be a production build when enabling the production security checks. CI installs Chromium and uploads test reports and evidence artifacts.

The ten resident/browser tests cover home, source library, project information, evaluation, a cited housing answer, an address-selection flow with unavailable GIS data, address-only entry, labeled model selection/fallback, private-input correction, keyboard submission, accessible errors, mobile reflow, a 200% zoom approximation with reduced motion, and malformed API requests. Four security integration tests run alongside them; the production-only CSP test is skipped in development mode. Synthetic address and provider cases are explicitly fixtures; they do not verify live geography or real-model quality. Live property verification is separately recorded in `docs/geospatial-live-validation.json`.

Latest execution status and machine-readable results: `evaluation/accessibility/latest.json` and `evaluation/accessibility/playwright-results.json`. Final validation writes the latest summary; an absent report means the check has not been completed in that checkout. Test artifacts contain screenshots and complete axe results. Automated rules cannot prove that source explanations are understandable or that the entire site works with every screen reader.

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

Report reproducible accessibility issues following `CONTRIBUTING.md`; avoid including private resident information. This repository does not invent an accessibility inbox or contact address that has not been established by its maintainer.
