# Optional language-model providers

TampaBayBot supports operator-selected **Ollama** and **OpenAI-compatible Chat Completions** endpoints over HTTP, without a provider SDK. `LLM_PROVIDER=none` is the default deterministic, cited path. Models can select retrieved evidence; they cannot add facts, citations, eligibility decisions or approvals. The same contract applies to local and remote providers.

## What a model receives and can change

1. Routing and retrieval produce the initial cited answer. A provider runs only for status `answered`; insufficient evidence, official judgment, conflicts/staleness and location/coverage states remain deterministic.
2. The server sends the current question, bounded evidence IDs/titles/excerpts and selector instructions. It attaches no conversation history, provider credentials, property results or complete corpus. The question can contain personal information the resident typed.
3. The model returns one to three selections, each with a supplied ID and its full literal quote. The first evidence entry must stay first. Every `requiredEvidenceIds` entry must be included to retain requested facts and their qualifications. Unsupported IDs, duplicates, altered/reordered primary evidence, omitted required citations, extra prose, malformed output and incomplete responses fail validation.
4. The app builds the answer from validated selections and controls status, evidence records, official next steps, explanation and warnings. Models cannot call tools or fetch sources.
5. Invalid configuration, provider failure/timeout, exceeded response limits or invalid output return the original answer with fallback metadata. Keys, base URLs and raw errors are withheld from the browser.

Generation metadata distinguishes disabled, skipped, model-assisted and fallback behavior. [Guardrail inserts and hooks](GUARDRAIL_INSERTS.md) describes the API's additional input/runtime checks; provider validation does not replace them. [Recorded Ollama tests](HISTORY.md#ollama-testing) are separate from synthetic fixtures and do not establish general accuracy or usefulness.

Selection accepts at most eight supplied evidence entries and three required entries. A baseline exceeding either limit keeps its complete deterministic answer with `invalid_evidence` fallback before any provider call. A quotation that cannot retain an essential application condition within the citation limit produces `insufficient_evidence`, so it also bypasses the provider. These limits never authorize dropping a restriction to make a request fit.

## Configuration

For model use, copy `.env.example` to ignored `.env`, or edit the existing file. No file is needed for the default mode. On PowerShell:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

On POSIX use `cp .env.example .env`. Restart the development server after changes. The installed Cloudflare plugin loads `.env` into Worker bindings; ordinary shell variables may not reach the Worker. `.dev.vars` takes precedence, so avoid competing values. See [Cloudflare's local configuration rules](https://developers.cloudflare.com/workers/configuration/secrets/).

| Variable | Default / accepted value | Meaning |
| --- | --- | --- |
| `LLM_PROVIDER` | `none`; or `ollama`, `openai-compatible` | Explicit backend selection |
| `LLM_BASE_URL` | Empty; required when enabled | Operator-selected API root, without the chat endpoint suffix |
| `LLM_MODEL` | Empty; required when enabled | Exact installed/served model identifier; no model is selected automatically |
| `LLM_API_KEY` | Empty; optional | Server-side bearer credential when the chosen server requires it |
| `LLM_TIMEOUT_MS` | `30000`; integer `1000`–`120000` | Request deadline in milliseconds |
| `LLM_MAX_RESPONSE_BYTES` | `32768`; integer `1024`–`262144` | Maximum provider response body |
| `LLM_ALLOW_PRIVATE_HTTP` | `false` | Explicitly allow HTTP to a literal private IP (RFC1918 IPv4 or IPv6 ULA); loopback HTTP is allowed without this flag |

Public endpoints require HTTPS; private-IP HTTPS is also allowed. `LLM_ALLOW_PRIVATE_HTTP` changes only plain HTTP. Redirects, URL credentials, queries/fragments, full chat-endpoint URLs and reserved/link-local endpoints are rejected. Residents cannot supply endpoints or provider credentials through the question API. Operators remain responsible for network/DNS trust: URL checks neither authenticate a server nor resolve DNS to guarantee a public destination.

## Local Ollama

Install/run Ollama separately and choose a model suited to the machine and its license. TampaBayBot does not install Ollama, download weights, start the daemon or choose a model. Check installed identifiers with `ollama list`.

In `.env`, replace the model placeholder with that exact local identifier:

```dotenv
LLM_PROVIDER=ollama
LLM_BASE_URL=http://127.0.0.1:11434
LLM_MODEL=your-installed-local-model
LLM_API_KEY=
LLM_TIMEOUT_MS=30000
LLM_MAX_RESPONSE_BYTES=32768
LLM_ALLOW_PRIVATE_HTTP=false
```

For example, `ollama pull llama3:8b` downloads Meta Llama 3 if absent; `ollama serve` starts a stopped daemon. The [model listing](https://ollama.com/library/llama3) gives size and licensing information. Weight licenses are separate from the app's MIT license.

CPU inference, especially first load, can exceed 30 seconds. For local testing, use `LLM_TIMEOUT_MS=120000` and adequate evaluation time. A timeout falls back to the cited baseline and fails model acceptance; it is not successful inference.

The native adapter appends `/api/chat`, sends `model`/`messages`, requests non-streaming structured output and validates selections independently. See the [Ollama chat API](https://docs.ollama.com/api/chat).

Ollama normally listens on `127.0.0.1:11434`, but localhost does not guarantee on-device inference: Ollama can forward cloud-model work. For local-only inference, use local weights and, if needed, set `OLLAMA_NO_CLOUD=1` in the **Ollama process**, then restart it. The app's `.env` does not set this daemon option. See the [Ollama FAQ](https://docs.ollama.com/faq) and [cloud behavior](https://docs.ollama.com/cloud).

## OpenAI-compatible server

You choose the host and its terms. The adapter sends `POST <LLM_BASE_URL>/chat/completions` with model/messages and JSON-object output, then reads a completed text message. Responses API, provider tools, streaming and multimodal input are unsupported. See the [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

For Ollama's compatibility endpoint, configure:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=your-installed-local-model
LLM_API_KEY=
```

Include `/v1` for compatibility mode; native `ollama` mode uses the root without it. Ollama's local interface needs no paid API key. Test the actual server/version because it implements a subset of the protocol. See [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

For remote services, use the provider's documented HTTPS API root, exact model name and server-side credential. Omit `/chat/completions` from `LLM_BASE_URL`; the adapter appends it. Advertised compatibility does not guarantee supported fields or response behavior.

## Local computer, LAN and hosted deployment

| Where TampaBayBot runs | Model address | Practical meaning |
| --- | --- | --- |
| On the same computer as Ollama | `http://127.0.0.1:11434` | The application server can reach that computer's local Ollama process |
| On a computer/container with a separate LAN model server | Operator-selected private address | Connectivity, authentication and firewall policy must be configured; private-IP plain HTTP needs the explicit flag; unqualified Docker service names are not accepted |
| On a hosted Sites/Cloudflare worker | Reachable protected HTTPS provider | Worker requests originate from the hosted runtime; its localhost is not the resident's computer |

A same-device setup requires both app and model to run locally. Hosted apps need a reachable, authenticated HTTPS provider; they cannot reach the resident's Ollama through `127.0.0.1`. This does not require exposing a bare Ollama port publicly. Open-source application software does not make remote inference local processing.

Set hosted `LLM_*` values through runtime bindings/secrets, then deploy and verify. Keep keys out of Vite build-time values, `NEXT_PUBLIC_*`, frontend bundles and `.openai/hosting.json`. Local `.env` does not configure a deployed app. [Deployment steps](DEPLOYMENT.md#optional-model-provider) and [Cloudflare secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/) cover this setup.

Deployed configuration defaults to `none`. An enabled provider applies to the app's eligible requests, not a per-resident endpoint choice. Check the displayed provider/data-flow disclosure before sending questions.

## Custom trusted server adapter

`answerWithGuardrails` accepts a server-side `provider.complete({ messages, model, signal, schema })` hook after application checks. Return **JSON text** in the built-in selection format. In this repository-root server-module example, implement `completeWithYourBackend` for your own backend:

```js
import { parseLlmConfig } from './src/lib/llm/index.mjs';
import { answerWithGuardrails } from './src/lib/guardrails/navigator.mjs';
import { siteGuards } from './src/lib/guardrails/site.mjs';

export async function answerWithBackend(question, corpus, env, completeWithYourBackend, { jurisdictionId = 'tampa-bay', signal } = {}) {
  return answerWithGuardrails(question, {
    sources: corpus.sources,
    chunks: corpus.chunks,
    jurisdictionId,
    config: parseLlmConfig(env),
    extraGuards: siteGuards,
    signal,
    provider: {
      async complete({ messages, model, signal, schema }) {
        // Return JSON text; forward the abort signal to your transport.
        return completeWithYourBackend({ messages, model, signal, schema });
      },
    },
  });
}
```

Pass the resident's selected resource area as `jurisdictionId`, or name it in the question; the default regional scope may require clarification before answering. Configuration must remain valid and enabled. Custom transport is trusted operator code: implement authentication, endpoint policy, response bounds and cancellation. The shared deadline and selection validation still apply, but ignoring `signal` can leave upstream work running after fallback. Keep provider objects, keys and endpoints server-side. Test malformed output, failure, timeout and conservative states. Use this guarded entry point; `answerQuestion` and `synthesizeAnswer` alone omit application guardrails.

## Reproduce integration checks

Run deterministic tests with `npm test`. Check local vinext Worker environment/HTTP wiring against synthetic provider responses with:

```sh
npm run test:llm-runtime
```

This fixture creates an ignored `work/` copy, synthetic `.env` and localhost mock provider. Both formats are checked for validated use, fallback, conservative-state bypass and secret exclusion. It never reads/overwrites user environment files or calls a real model. It needs the documented corpus; acquire [sources](DISTRIBUTION.md) first for an empty release. The ordinary [browser suite](ACCESSIBILITY.md) expects `LLM_PROVIDER=none`.

For a **real installed Ollama model** through the app's HTTP API, keep its daemon running and use:

```sh
npm run test:ollama-runtime -- --allow-provider-call --model llama3:8b --timeout-ms 120000 --output work/evals/live/ollama-runtime-llama3-8b
```

The isolated runner counts real Ollama calls through a loopback proxy without changing completions. Eligible questions must produce accepted model output; fallback fails. Conservative questions, instruction attacks and synthetic identifiers must make zero calls. It checks model disclosure and blocked access to fixture `.env`, without reading/overwriting user environment files, changing hosted settings or downloading weights. Ignored `work/evals/live/` reports record model/digest, server version, usage and timings without prompts or completions.

Both runners use isolated source fixtures without owner hosting metadata. Startup requires a ready corpus and accepts the expected local or unauthenticated shared-operations state described in the [live smoke guide](DEVELOPMENT.md#live-api-smoke); it does not establish production readiness.

Use [live evaluation](EVAL_SUITE.md#evaluate-an-explicitly-configured-model) for broader/repeated cases and [Ollama results](HISTORY.md#ollama-testing) for dated outcomes. Human assessment remains separate; [release readiness](RELEASE_READINESS.md) tracks verification.

### Token and cost reporting

Only validated numeric usage fields are retained. [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) supplies `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens` and optional `usage.prompt_tokens_details.cached_tokens`. [Native Ollama](https://docs.ollama.com/api/chat) supplies `prompt_eval_count`, `eval_count` and optional `prompt_eval_cached_count`; total is input plus output.

Usage can survive rejected selections/fallback. Missing or malformed usage stays unknown; it neither invalidates an acceptable answer nor implies free inference. Cached tokens are included in input totals. Metrics exclude raw usage objects, request text and provider errors.

[Live reports](EVAL_SUITE.md#token-usage-and-estimated-cost) aggregate usage and estimate USD cost from operator-supplied rates, excluding infrastructure/billing adjustments. There are no built-in prices or assumptions that local Ollama is free. Cost does not measure correctness or influence eligibility/evidence selection.

## Privacy, security and evaluation limits

`none` sends no questions to a model. Enabled providers receive eligible questions without redacting resident-entered personal information. Their retention, logs, routing, subprocesses and cloud forwarding depend on the service. The app does not persist conversation history, but cannot control provider/host logs. See [security](../SECURITY.md) for data flow/reporting and [operations](OPERATIONS.md) for retention and access.

Evaluate each model/version with public or synthetic questions. Record identity, configuration, latency, fallback and selection usefulness without real resident prompts. [Evaluation](EVALUATION.md) distinguishes synthetic transport tests, real inference and human review; validated quotations alone do not establish completeness or usefulness.
