# Offline fictional demo

Use Node.js 24, then run from the project root:

```sh
npm ci
npm run demo
```

Open http://localhost:3001. Choose Tampa and ask “Where can I find rental assistance?” The banner labels every example as fictional. Programs, amounts and publisher links are invented, original test content; they do not describe real benefits. Model assistance is disabled. Live address tools remain separate and disclose their external requests.

The command prepares a new isolated directory under `work/releases/` and serves it using the installed dependencies. Your registry, evidence, environment files and evaluation reports are not replaced. Stop with Ctrl+C. To choose another port, use `npm run demo -- --port 3002`.

The public source tree remains empty of downloaded evidence. `npm test` runs independent HTTP/security/provider/parser tests and original synthetic answer fixtures without acquisition or model/network calls. `npm run test:source:browser` runs Chromium against its own isolated demo on port 3112; install the browser first with `npx playwright install chromium`.

Full historical corpus checks use `npm run test:corpus` and `npm run check:corpus` after evidence acquisition and review. Passing synthetic tests does not certify real source freshness, human usefulness, or complete regional coverage.

![TampaBayBot with clearly labeled fictional evidence](images/demo.png)

The image shows the original fictional demo, not downloaded government material or real resident information.

To refresh this screenshot, set `TAMPABAYBOT_CAPTURE_DEMO=1` for `npm run test:source:browser`. The desktop keyboard/citation test writes `docs/images/demo.png`; inspect the image before committing it. In PowerShell:

```powershell
$env:TAMPABAYBOT_CAPTURE_DEMO = '1'
npm.cmd run test:source:browser
Remove-Item Env:TAMPABAYBOT_CAPTURE_DEMO
```
