Describe the resident or contributor problem and resulting behavior.

Validation performed:

- `npm test` (offline synthetic and source-independent regressions)
- `npm run typecheck` and `npm run lint`
- `npm run test:source:browser` for interface changes
- Corpus or live-source checks, when applicable, with their actual scope

For the public source checkout, run `npm run release:manifest` and `npm run release:verify` after your final edit. Include the changed manifest. A populated development checkout must use `npm run release:source -- --output work/releases/<new-name>` instead.

Document source/coverage changes and remaining uncertainty. Do not attach downloaded source snapshots, real resident inputs, credentials, or private reports.
