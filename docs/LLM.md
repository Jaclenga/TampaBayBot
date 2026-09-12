# Optional language-model providers

ParcelPrivateer can use an operator-selected model through **Ollama** or an **OpenAI-compatible Chat Completions endpoint**. `LLM_PROVIDER=none` is the default: the existing deterministic, cited answer path runs without a model. The adapter uses HTTP directly; a paid service or provider SDK is not required.

The model's job is deliberately bounded. It selects from already-retrieved evidence and returns evidence IDs with full literal excerpts. It cannot add free-form facts, new citations, eligibility decisions or project approvals. This lets an operator use a local/open-weight model or a remote API while retaining the same evidence checks and conservative answer states.

## What a model receives and can change

1. Routing, retrieval, source selection and the initial cited answer run first.
2. A configured provider is considered only when that answer has status `answered`. Insufficient evidence, official judgment, conflicting/stale evidence and location/coverage states remain on the deterministic path.
3. The server sends the current resident question, bounded retrieved evidence containing IDs/titles/excerpts, and selector instructions to the configured model endpoint. It sends no application conversation history, credentials inside the prompt, parcel-owner data, or complete corpus.
4. The model returns one to three structured selections. The first supplied evidence entry must stay first, and each selection must contain a supplied ID with its full literal quote. Unsupported IDs, duplicate entries, altered/reordered primary evidence, unexpected prose, malformed output and incomplete responses fail validation.
5. The application builds the answer from validated selections. Existing status, evidence records, official next steps, explanation and warnings remain under application control. The model does not issue tool calls or trigger another source fetch.
6. Invalid configuration, an unreachable/slow provider, response limits or invalid output return the original deterministic answer with fallback metadata. Provider keys, base URLs and raw error details are not returned to the browser.

The API's generation metadata distinguishes disabled, skipped, model-assisted and fallback behavior. A successful model response is not a source-validity check or an accuracy score. Literal evidence can still be incomplete or poorly selected. No live model-quality benchmark is claimed by this integration; deterministic adapter fixtures verify boundaries, not resident usefulness of a particular model.

The guarded API screens questions before retrieval and runs additive checks around evidence, model use and the response. Recognizable instruction attacks skip the model while preserving navigation. Narrow identifier/key patterns can block a question, but they do not provide complete personal-data detection or redaction; legitimate questions involving income, disability or other sensitive housing circumstances remain supported. See [guardrail prompt inserts and runtime hooks](GUARDRAIL_INSERTS.md) for the five stages, built-in boundaries and operator extension contract.

## Configuration

Copy `.env.example` to an ignored `.env` file when you want to configure a provider. No copy is needed for the default no-model mode. On PowerShell:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

On a POSIX shell use `cp .env.example .env`. Edit the existing `.env` instead if you already have one. Restart the local development server after changing configuration. This repository's installed Cloudflare plugin loads local `.env` values into Worker bindings; do not assume ordinary shell variables automatically reach that Worker. Avoid competing values in `.dev.vars`, which takes precedence over `.env`. Cloudflare documents the local files and their precedence separately from deployed secrets. [Cloudflare secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/)

| Variable | Default / accepted value | Meaning |
| --- | --- | --- |
| `LLM_PROVIDER` | `none`; or `ollama`, `openai-compatible` | Explicit backend selection |
| `LLM_BASE_URL` | Empty; required when enabled | Operator-selected API root, without the chat endpoint suffix |
| `LLM_MODEL` | Empty; required when enabled | Exact installed/served model identifier; no model is selected automatically |
| `LLM_API_KEY` | Empty; optional | Server-side bearer credential when the chosen server requires it |
| `LLM_TIMEOUT_MS` | `30000`; integer `1000`–`120000` | Request deadline in milliseconds |
| `LLM_MAX_RESPONSE_BYTES` | `32768`; integer `1024`–`262144` | Maximum provider response body |
| `LLM_ALLOW_PRIVATE_HTTP` | `false` | Explicitly allow HTTP to a literal private IP (RFC1918 IPv4 or IPv6 ULA); loopback HTTP is allowed without this flag |

Public remote endpoints require HTTPS. Private-IP HTTPS is allowed; the private-HTTP flag changes only the plain-HTTP case. Redirects, credentials embedded in URLs, query/fragment-bearing base URLs, full chat-endpoint URLs and reserved/link-local endpoints are rejected. Residents cannot select arbitrary endpoint URLs or provide provider credentials through the question API. DNS and network trust remain an operator responsibility; URL validation does not authenticate a model server or resolve DNS to guarantee a public destination.

## Local Ollama

Install and run Ollama separately, choose a model that fits the machine and its license, and ensure that model is available before starting a model-assisted question. ParcelPrivateer does not install Ollama, download model weights, start a model daemon or choose a model for you. Check the installed model name with `ollama list`.

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

For Meta Llama 3, an example installed identifier is `llama3:8b`. If it is absent, `ollama pull llama3:8b` downloads the weights; `ollama serve` starts the daemon when it is not already running. The [Ollama Llama 3 listing](https://ollama.com/library/llama3) identifies the 8B variant and its download size. Model weights have their own license, separate from this application's MIT license.

CPU inference can exceed the default 30-second deadline, especially while loading the model and processing the first prompt. For local testing, set `LLM_TIMEOUT_MS=120000` and allow an adequate evaluation budget. A timeout returns the cited baseline and is recorded as a failed model-acceptance check; it must not be counted as successful inference.

The native adapter appends `/api/chat`, supplies `model` and `messages`, requests non-streaming output, and validates the structured selection independently. Ollama's native API supports a JSON format/schema and defaults to streaming unless disabled. [Ollama chat API](https://docs.ollama.com/api/chat)

Ollama normally listens on `127.0.0.1:11434`. A localhost endpoint alone does not prove that inference stays on the device: Ollama can send cloud-model work to its cloud service. For local-only inference, use locally running weights and disable cloud features in the **Ollama process** with `OLLAMA_NO_CLOUD=1` if needed, then restart Ollama. This is separate from the app's `.env`. [Ollama FAQ](https://docs.ollama.com/faq), [Ollama cloud model behavior](https://docs.ollama.com/cloud)

## OpenAI-compatible server

This provider name refers to a request/response protocol. You choose the model host and its terms. The adapter uses `POST <LLM_BASE_URL>/chat/completions`, with the configured model/messages and JSON-object output, and reads a completed text message from the response. This is a Chat Completions integration; Responses API, provider tools, streaming and multimodal input are outside this adapter. [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

For Ollama's compatibility endpoint, configure:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=your-installed-local-model
LLM_API_KEY=
```

The `/v1` part belongs in this base URL; `/chat/completions` is appended by ParcelPrivateer. Native `ollama` mode instead uses the root without `/v1`. Ollama implements a subset of the OpenAI interface, so compatibility should be tested against the actual server/version. Its local interface does not need a real paid API key. [Ollama compatibility documentation](https://docs.ollama.com/api/openai-compatibility)

For a remote service, use the actual HTTPS API root documented by that provider, its exact model name and its required credential in the server-side secret store. Do not paste a full `/chat/completions` URL into `LLM_BASE_URL` unless the adapter contract is deliberately changed. Do not assume every service advertising compatibility supports the same fields or response behavior; invalid responses fall back to the cited baseline.

## Local computer, LAN and hosted deployment

| Where ParcelPrivateer runs | Model address | Practical meaning |
| --- | --- | --- |
| On the same computer as Ollama | `http://127.0.0.1:11434` | The application server can reach that computer's local Ollama process |
| On a computer/container with a separate LAN model server | Operator-selected private address | Connectivity, authentication and firewall policy must be configured; private-IP plain HTTP needs the explicit flag; unqualified Docker service names are not accepted |
| On a hosted Sites/Cloudflare worker | Reachable protected HTTPS provider | Worker requests originate from the hosted runtime; its localhost is not the resident's computer |

A deployed web app cannot use `127.0.0.1` to call Ollama on the resident's PC. The app and model must both run locally for the direct same-device setup. An operator can instead provide a reachable, authenticated HTTPS model service; exposing a bare Ollama port publicly is not required by this integration. Cloud-only model services and remote inference are not local processing, even when the application software is open source.

For Sites deployment, configure the selected `LLM_*` values through the host's **runtime environment bindings/secrets**, then deploy and verify them. Keep API keys out of Vite build-time values, `NEXT_PUBLIC_*` variables, frontend bundles and `.openai/hosting.json`. The application reads runtime bindings server-side; adding a local `.env` does not configure an already-deployed review site. Cloudflare documents development files and deployed secrets separately. [Cloudflare secrets documentation](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)

The default deployed configuration stays `none` unless the deployment operator enables a provider. A provider configured on a hosted app applies to eligible requests served by that app; it is not a per-resident endpoint setting. Check the displayed provider/data-flow disclosure before sending a question.

## Custom trusted server adapter

`answerWithGuardrails` accepts a server-side `provider.complete({ messages, model, signal, schema })` hook and passes it to the model adapter after the application checks. The hook returns **JSON text** in the same selection format as the built-in providers. This example belongs in a repository-root server module; `completeWithYourBackend` is a function you implement for your backend, not a bundled SDK:

```js
import { parseLlmConfig } from './lib/llm/index.mjs';
import { answerWithGuardrails } from './lib/guardrails/navigator.mjs';
import { siteGuards } from './lib/guardrails/site.mjs';

export async function answerWithBackend(question, corpus, env, completeWithYourBackend, signal) {
  return answerWithGuardrails(question, {
    sources: corpus.sources,
    chunks: corpus.chunks,
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

The parsed configuration must still be valid and enabled. New transport code is trusted operator code: implement its authentication, endpoint policy, response bounds and cancellation; the shared outer deadline and selection validation still apply. A transport that ignores `signal` can continue upstream work after the app returns a fallback. Do not wire provider objects, keys or endpoints directly into the browser or let a resident select them. Add tests for malformed output, failure, timeout and preserved conservative states before exposing a custom backend. Keep this guarded entry point: the lower-level `answerQuestion` and `synthesizeAnswer` helpers alone do not run the application guardrails.

## Reproduce integration checks

Run the deterministic suite with `npm test`. To check actual local vinext Worker environment/HTTP wiring against synthetic provider responses, run:

```sh
npm run test:llm-runtime
```

The dedicated runtime fixture creates its own ignored `work/` copy and synthetic `.env`, starts a localhost mock provider and exercises native Ollama and compatibility response formats. It checks validated use, invalid-output fallback, conservative-state bypass and secret exclusion from inspected surfaces. It does not read or overwrite a user's `.env`, download a model or call a real provider. The ordinary browser/accessibility suite assumes `LLM_PROVIDER=none`; use this dedicated fixture for provider-enabled transport checks. The September 12, 2026 runtime report (development artifact omitted from source-only release) records passing checks for all three modes. This is not a real-inference quality result.

To test a **real installed Ollama model** through the app's HTTP API, keep the daemon running and use:

```sh
npm run test:ollama-runtime -- --allow-provider-call --model llama3:8b --timeout-ms 120000 --output work/evals/live/ollama-runtime-llama3-8b
```

This separate runner creates an isolated local app fixture, requires an installed local model, and forwards requests to Ollama through a loopback proxy that counts calls without changing completions. Eligible questions must return accepted model output; a safe fallback fails that check. Conservative questions, instruction attacks and synthetic identifiers must make zero provider calls. It also checks the app's model disclosure and blocks access to the fixture's `.env`. The runner never reads or overwrites the user's environment files, changes hosted settings or downloads weights. Reports under ignored `work/evals/live/` identify the selected model/digest, server version, token counts and timings without retaining prompts or completions.

For broader real-model cases and repeated runs, see the [live evaluation instructions](EVAL_SUITE.md#evaluate-an-explicitly-configured-model). These are engineering checks; human assessment of evidence usefulness remains separate.

## Privacy, security and evaluation limits

With `none`, questions are not sent to a model. With an enabled provider, eligible questions and the selected public evidence are sent to that provider. A question can contain an address or personal information the resident typed; source selection does not redact that text. Provider retention, logs, routing, subprocesses and cloud forwarding depend on the chosen service. Local mode has the strongest geographic meaning when both app and weights run on the same controlled machine.

The app does not persist conversation history, but that does not control the provider's or hosting platform's logs. Keep model keys server-side, configure access/cost/concurrency limits, and test the chosen provider's retention policy before resident use. Software licensing is separate from model-weight licenses and API terms.

Prompt injection can try to influence a model's selection. The application constrains and validates output instead of trusting a prompt alone. Invalid model output cannot change an official-judgment or other conservative status, add a new citation, or cause source/tool execution. Valid-but-unhelpful evidence selections still require evaluation and human review.

Use the existing deterministic benchmark as a regression baseline, then evaluate the chosen real model/version separately using public or synthetic questions. Record model identity, configuration, latency, fallback rate, selection usefulness and failures without saving real resident prompts. A synthetic local HTTP provider test proves transport/environment/fallback behavior, not that any downloaded model understands Tampa housing information.

See [methodology](../METHODOLOGY.md), [security boundaries](../SECURITY.md) and [limitations](../LIMITATIONS.md). No real-model quality, local GPU performance or paid remote-provider reliability result is implied by these setup instructions.
