# Ollama testing — September 12, 2026

This is the dated real-model test record and reproduction guide. It does not describe every current provider or corpus, and it was not rerun for source-packaging changes. [Release readiness](RELEASE_READINESS.md) separates these results from synthetic provider checks and later release verification.

TampaBayBot was tested with real local inference using **Ollama 0.24.0 and Meta `llama3:8b`**, an already installed 8B Q4_0 model. The tests used CPU inference on Windows, with cloud features disabled in the daemon started for the run. No model download, paid API call, user `.env` change or hosted provider change was needed.

The model digest was `365c0bd3c000a25d28ddbf732fe1c6add414de7275464c4e4d1c3b5fcb5d8ad1`. This records the exact installed weights; the `llama3:8b` tag alone can change independently of these results.

## Recorded results

The initial two native Ollama cases both accepted actual model selections. The first request took 114.98 seconds, including model loading and the first prompt; the next took 15.61 seconds. The tests used `LLM_TIMEOUT_MS=120000`, above the app's default 30 seconds.

The expanded native run repeated 12 public cases twice across housing, zoning, permitting, development and agency navigation. **All 24 cases and 730 applicable checks passed.** Twelve eligible answers accepted model output without fallback. Twelve conservative answers explicitly skipped inference with zero provider calls. Another 158 checks were not applicable and were not counted as passes. The source excerpts, citation provenance, primary evidence and conservative decision fields passed the application's checks.

The separate real app HTTP/Worker run passed **all nine checks**. Housing help and building-permit questions accepted real model output in 37.87 and 18.07 seconds. Three conservative/instruction-attack probes and three synthetic identifier/credential probes made zero provider calls. The rendered page disclosed model assistance, and the fixture's `.env` returned HTTP 403. The two daemon completions contained 107 and 53 output tokens and both completed with `done_reason=stop`.

Ollama's `/v1/chat/completions` compatibility endpoint also passed both selected housing cases, with accepted model output and no fallback. Those requests took 42.70 and 13.91 seconds. This smaller compatibility run does not claim the full native run's coverage.

Warm eligible requests in the expanded native run took 13.52–39.04 seconds. Bypass cases were measured separately; their millisecond timings must not be treated as model inference latency. These measurements describe this machine and workload, not a service-capacity guarantee.

The accompanying regression run passed **193 tests**, **205 offline cases / 3,902 applicable checks**, TypeScript checking and lint. These counts belong to this run; later packaging tests increased the release total recorded in [release readiness](RELEASE_READINESS.md#recorded-verification). No application/provider fix was needed for these successful native runs; changes added repeatable real-model testing and more informative live-eval diagnostics.

These are hand-authored engineering cases using preserved public source snapshots. They are not a blind holdout or a general accuracy score. Human assessments of completeness, evidence usefulness and resident experience remain unscored.

The development checkout's machine-readable summary (development artifact omitted from source-only release) records per-case acceptance/bypass results, model identity, source and implementation hashes, runtime checks and hashes of the ignored detailed reports. Detailed JSON, Markdown and JUnit reports remain under `work/evals/live/`. The summary contains no raw questions, source excerpts, completions, credentials or private endpoints. Source-only packages omit these historical reports; the portable [alpha record](ALPHA_VERIFICATION.json) retains their aggregate scope.

## Run locally

Check `ollama list` for the exact installed model tag. Start the daemon with `ollama serve` if it is stopped, then use the [PowerShell live-eval example](EVAL_SUITE.md#evaluate-an-explicitly-configured-model) to reproduce the 24-case run. For the actual app HTTP path:

```sh
npm run test:ollama-runtime -- --allow-provider-call --model llama3:8b --timeout-ms 120000 --output work/evals/live/ollama-runtime-llama3-8b
```

The isolated runtime test records real Ollama requests through a transparent loopback proxy. It never synthesizes completions or counts fallback as successful model assistance. The [model setup guide](LLM.md) explains local `.env` configuration, the two adapters and the model's constrained role.

This run did not enable a hosted provider. A hosted Worker cannot reach an Ollama server at `127.0.0.1` on your computer; use the local app with local Ollama, or configure a reachable protected provider for hosting as described in the [model setup guide](LLM.md).
