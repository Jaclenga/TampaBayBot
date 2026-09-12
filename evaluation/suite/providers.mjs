import { answerWithGuardrails } from "../../lib/guardrails/navigator.mjs";
import { GuardrailError } from "../../lib/guardrails/index.mjs";
import { answerQuestion } from "../../lib/core/answer.mjs";
import { parseLlmConfig } from "../../lib/llm/index.mjs";

const QUESTION = "Where can I find housing assistance application information?";
const CREDENTIAL = "provider-suite-credential-fixture-only";
const MODEL = "synthetic-provider-evaluation-no-inference";
const PRIVATE_ERROR = "provider-suite-private-error-fixture-only";
const PROMPT_IDS = [
  "civic-scope",
  "evidence-and-citations",
  "untrusted-data",
  "privacy-minimization",
  "official-judgment-and-jurisdiction",
  "provider-neutral-selection",
];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (id, kind, expected, observed) => ({
  id,
  kind,
  expected,
  observed,
  passed: equal(expected, observed),
});
const safeEnum = (value, allowed) =>
  value == null ? null : allowed.includes(value) ? value : "unexpected_value";
const ANSWER_STATUSES = [
  "answered",
  "insufficient_evidence",
  "conflicting_evidence",
  "potentially_outdated",
  "needs_location",
  "official_judgment",
  "out_of_scope",
  "unavailable_source",
  "missing_geographic_coverage",
];
const SAFE_REASONS = [
  "provider_failure",
  "invalid_output",
  "response_too_large",
  "timeout",
  "cancelled",
  "invalid_evidence",
  "input_too_large",
  "invalid_config",
  "non_answered_status",
  "guardrail_skip",
];

function syntheticCorpus(now) {
  const timestamp = new Date(now ?? "2026-09-12T12:00:00Z").toISOString();
  const sources = [
    {
      source_id: "provider-housing",
      title: "Synthetic housing assistance application notice",
      agency: "Synthetic evaluation agency",
      canonical_url: "https://example.invalid/evaluation/housing",
      categories: ["housing"],
      authoritative_status: "official",
      retrieval_date: timestamp,
      refresh_days: 30,
    },
    {
      source_id: "provider-contact",
      title: "Synthetic housing assistance application contact",
      agency: "Synthetic evaluation agency",
      canonical_url: "https://example.invalid/evaluation/contact",
      categories: ["housing"],
      authoritative_status: "official",
      retrieval_date: timestamp,
      refresh_days: 30,
    },
  ];
  const chunks = [
    {
      id: "provider-housing-1",
      source_id: "provider-housing",
      text: "Housing assistance applications are not currently accepted. Contact the housing office to confirm the application process and current program availability.",
      retrieved_at: timestamp,
    },
    {
      id: "provider-contact-1",
      source_id: "provider-contact",
      text: "Housing assistance application guidance does not establish eligibility. Contact the housing assistance office to review the application process and public program information.",
      retrieved_at: timestamp,
    },
  ];
  return { sources, chunks, now: timestamp };
}

function providerConfig(provider, extra = {}) {
  return parseLlmConfig({
    LLM_PROVIDER: provider,
    LLM_BASE_URL:
      provider === "ollama"
        ? "http://127.0.0.1:11434"
        : "https://model.example.com/v1",
    LLM_MODEL: MODEL,
    LLM_API_KEY: CREDENTIAL,
    ...extra,
  });
}

function envelope(provider, content) {
  return provider === "ollama"
    ? { done: true, message: { role: "assistant", content } }
    : {
        choices: [
          { finish_reason: "stop", message: { role: "assistant", content } },
        ],
      };
}

function jsonResponse(value, options = {}) {
  return new Response(JSON.stringify(value), {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
}

function citationsIntact(answer, baseline, options) {
  const ids = new Set(answer.evidence.map((item) => item.id));
  return (
    equal(answer.evidence, baseline.evidence) &&
    answer.evidence.every((item) =>
      options.chunks.some(
        (chunk) =>
          chunk.id === item.chunk_id &&
          chunk.source_id === item.source_id &&
          chunk.text.includes(item.quote),
      ),
    ) &&
    [...answer.answer.matchAll(/\[(E\d+)\]/g)].every((match) =>
      ids.has(match[1]),
    )
  );
}

function fakeTransport(provider, scenario, state, abortController) {
  return async (url, init) => {
    state.calls++;
    state.signal = init.signal;
    const body = JSON.parse(init.body);
    const expectedEndpoint =
      provider === "ollama"
        ? "http://127.0.0.1:11434/api/chat"
        : "https://model.example.com/v1/chat/completions";
    state.transportContract =
      url === expectedEndpoint &&
      init.method === "POST" &&
      init.redirect === "manual" &&
      init.credentials === "omit" &&
      init.cache === "no-store";
    state.authorizationReceived =
      init.headers.authorization === `Bearer ${CREDENTIAL}`;
    state.bodyExcludesSecrets =
      !init.body.includes(CREDENTIAL) &&
      !init.body.includes(expectedEndpoint) &&
      !init.body.includes(PRIVATE_ERROR);
    state.requestMode =
      body.model === MODEL &&
      body.stream === false &&
      (provider === "ollama"
        ? body.format?.type === "object" && body.options?.temperature === 0
        : body.response_format?.type === "json_object");
    const userMessage = body.messages.find(
      (message) => message.role === "user",
    );
    const user = JSON.parse(userMessage.content);
    state.minimizedPayload =
      equal(Object.keys(user).sort(), ["evidence", "question"]) &&
      user.evidence.every((item) =>
        equal(Object.keys(item).sort(), ["id", "quote", "title"]),
      );
    const trusted = body.messages
      .filter((message) => ["system", "developer"].includes(message.role))
      .map((message) => message.content)
      .join("\n");
    state.promptInsertCount = PROMPT_IDS.filter((id) =>
      trusted.includes(`[guardrail:${id}@1.0.0]`),
    ).length;
    const evidence = user.evidence;
    if (!Array.isArray(evidence) || evidence.length < 2)
      throw new Error("Synthetic fixture requires two distinct excerpts.");
    const selections = evidence
      .slice(0, 2)
      .map(({ id, quote }) => ({ id, quote }));
    let selection = { selections };
    if (scenario === "unknown-id") selections[0].id = "E999";
    if (scenario === "truncated-quote")
      selections[0].quote = selections[0].quote.slice(0, 35);
    if (scenario === "removed-negation") {
      const original = selections[0].quote;
      selections[0].quote = original.replace(/\bnot\s+/, "");
      state.challengeApplied = original !== selections[0].quote;
    }
    if (scenario === "extra-field")
      selection = {
        ...selection,
        answer: "Synthetic unsupported free-form answer.",
      };
    if (scenario === "extra-selection-field")
      selections[0].url = "https://example.invalid/untrusted";
    if (scenario === "duplicate-id")
      selection.selections = [selections[0], { ...selections[0] }];
    if (scenario === "reordered-primary")
      selection.selections = [selections[1], selections[0]];
    if (scenario === "omitted-primary") selection.selections = [selections[1]];
    if (scenario === "empty-selection") selection.selections = [];
    const content =
      scenario === "malformed-selection-json"
        ? `Malformed fixture ${PRIVATE_ERROR}`
        : JSON.stringify(selection);
    const value = envelope(provider, content);
    const message =
      provider === "ollama" ? value.message : value.choices[0].message;
    if (scenario === "tool-call")
      message.tool_calls = [
        {
          id: "synthetic-tool",
          function: { name: "unrequested_tool", arguments: "{}" },
        },
      ];
    if (scenario === "function-call")
      message.function_call = { name: "unrequested_function", arguments: "{}" };
    if (scenario === "refusal") {
      if (provider === "ollama")
        message.content =
          "Synthetic refusal without a permitted evidence selection.";
      else message.refusal = "Synthetic provider refusal.";
    }
    if (scenario === "incomplete-generation") {
      if (provider === "ollama") value.done = false;
      else value.choices[0].finish_reason = "length";
    }
    if (scenario === "timeout") return new Promise(() => {});
    if (scenario === "cancel-during-fetch") {
      queueMicrotask(() => abortController.abort());
      return new Promise(() => {});
    }
    if (scenario === "network-error")
      throw new Error(`${PRIVATE_ERROR} ${CREDENTIAL}`);
    if (scenario === "redirect")
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.invalid/no-follow" },
      });
    if (scenario === "http-503")
      return jsonResponse(
        { error: `${PRIVATE_ERROR} ${CREDENTIAL}` },
        { status: 503 },
      );
    if (scenario === "malformed-envelope-json")
      return new Response("{malformed fixture", {
        headers: { "content-type": "application/json" },
      });
    if (scenario === "invalid-utf8")
      return new Response(Uint8Array.of(0xff, 0xfe), {
        headers: { "content-type": "application/json" },
      });
    if (scenario === "non-json-media-type")
      return new Response(JSON.stringify(value), {
        headers: { "content-type": "text/plain" },
      });
    if (scenario === "oversized-content-length")
      return jsonResponse(value, { headers: { "content-length": "2000" } });
    if (scenario === "oversized-stream")
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(600).fill(120));
            controller.enqueue(new Uint8Array(600).fill(120));
          },
          cancel() {
            state.streamCancelled = true;
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    return jsonResponse(value);
  };
}

/** Provider contracts exercised through answerWithGuardrails and the real adapters.
 * Every fetch is an injected synthetic fixture. No model inference or network I/O.
 * One Ollama timeout case consumes the minimum configured one-second deadline. */
export async function runProviderSuite({
  sources = [],
  chunks = [],
  now = "2026-09-12T12:00:00Z",
} = {}) {
  const synthetic = syntheticCorpus(now);
  const cases = [];
  const rejectionReasons = {
    "malformed-envelope-json": "invalid_output",
    "malformed-selection-json": "invalid_output",
    "unknown-id": "invalid_output",
    "truncated-quote": "invalid_output",
    "removed-negation": "invalid_output",
    "extra-field": "invalid_output",
    "extra-selection-field": "invalid_output",
    "duplicate-id": "invalid_output",
    "reordered-primary": "invalid_output",
    "omitted-primary": "invalid_output",
    "empty-selection": "invalid_output",
    "tool-call": "invalid_output",
    "function-call": "invalid_output",
    refusal: "invalid_output",
    "incomplete-generation": "invalid_output",
    "non-json-media-type": "invalid_output",
    "invalid-utf8": "invalid_output",
    redirect: "provider_failure",
    "http-503": "provider_failure",
    "network-error": "provider_failure",
    "oversized-content-length": "response_too_large",
    "oversized-stream": "response_too_large",
  };
  for (const provider of ["ollama", "openai-compatible"]) {
    const add = (scenario, expected = {}) =>
      cases.push({
        id: `${provider}-${scenario}`,
        provider,
        scenario,
        fixture: "synthetic",
        options: synthetic,
        question: QUESTION,
        expectedCalls: 1,
        expectedGeneration: "fallback",
        ...expected,
      });
    add("valid-selection", { expectedGeneration: "used" });
    for (const [scenario, reason] of Object.entries(rejectionReasons))
      add(scenario, { reason });
    add("cancel-before-request", {
      expectedCalls: 0,
      expectedError: "guard_unavailable",
      expectedErrorStatus: 503,
    });
    add("cancel-during-fetch", {
      expectedError: "guard_unavailable",
      expectedErrorStatus: 503,
    });
    for (const [scenario, question, status] of [
      ["out-of-scope", "What is the football score?", "out_of_scope"],
      [
        "official-judgment",
        "Approve my permit application as an official determination.",
        "official_judgment",
      ],
    ])
      add(scenario, {
        fixture: "public_snapshot_with_synthetic_input",
        options: { sources, chunks, now },
        question,
        expectedCalls: 0,
        expectedGeneration: "skipped",
        expectedStatus: status,
      });
    if (provider === "ollama") add("timeout", { reason: "timeout" });
  }

  const results = [];
  for (const item of cases) {
    const started = performance.now();
    const state = { calls: 0 };
    const checks = [];
    try {
      const controller = new AbortController();
      if (item.scenario === "cancel-before-request") controller.abort();
      const config = providerConfig(item.provider, {
        ...(item.scenario.startsWith("oversized-")
          ? { LLM_MAX_RESPONSE_BYTES: "1024" }
          : {}),
        ...(item.scenario === "timeout" ? { LLM_TIMEOUT_MS: "1000" } : {}),
      });
      const baseline = answerQuestion(item.question, item.options);
      let answer;
      let error;
      try {
        answer = await answerWithGuardrails(item.question, {
          ...item.options,
          config,
          signal: controller.signal,
          fetchImpl: fakeTransport(
            item.provider,
            item.scenario,
            state,
            controller,
          ),
        });
      } catch (caught) {
        if (!(caught instanceof GuardrailError)) throw caught;
        error = caught;
      }
      checks.push(
        check(
          "provider_call_count",
          "behavior",
          item.expectedCalls,
          state.calls,
        ),
      );
      checks.push(
        check(
          "outcome",
          "behavior",
          item.expectedError ? "blocked" : "returned",
          error ? "blocked" : "returned",
        ),
      );
      if (state.calls > 0) {
        checks.push(
          check(
            "request_transport_contract",
            "integrity",
            true,
            state.transportContract === true,
          ),
        );
        checks.push(
          check(
            "authorization_header_received_by_fixture",
            "integrity",
            true,
            state.authorizationReceived === true,
          ),
        );
        checks.push(
          check(
            "credentials_absent_from_model_body",
            "privacy",
            true,
            state.bodyExcludesSecrets === true,
          ),
        );
        checks.push(
          check(
            "provider_request_mode",
            "integrity",
            true,
            state.requestMode === true,
          ),
        );
        checks.push(
          check(
            "payload_contains_only_question_and_excerpt_fields",
            "privacy",
            true,
            state.minimizedPayload === true,
          ),
        );
        checks.push(
          check(
            "trusted_prompt_insert_count",
            "integrity",
            6,
            state.promptInsertCount ?? 0,
          ),
        );
      }
      const visible = answer
        ? JSON.stringify(answer)
        : JSON.stringify({
            error: error?.message,
            code: error?.code,
            status: error?.status,
          });
      checks.push(
        check(
          "response_excludes_private_fixture_values",
          "privacy",
          false,
          [
            CREDENTIAL,
            PRIVATE_ERROR,
            MODEL,
            "https://model.example.com/v1",
            "http://127.0.0.1:11434",
          ].some((value) => visible.includes(value)),
        ),
      );
      if (item.expectedError) {
        checks.push(
          check(
            "safe_error_code",
            "behavior",
            item.expectedError,
            ["guard_unavailable", "guard_blocked", "sensitive_input"].includes(
              error?.code,
            )
              ? error.code
              : null,
          ),
        );
        checks.push(
          check(
            "error_status",
            "behavior",
            item.expectedErrorStatus,
            Number.isInteger(error?.status) ? error.status : null,
          ),
        );
      } else {
        checks.push(
          check(
            "generation_status",
            "behavior",
            item.expectedGeneration,
            safeEnum(answer?.generation?.status, [
              "disabled",
              "used",
              "fallback",
              "skipped",
            ]),
          ),
        );
        if (item.reason)
          checks.push(
            check(
              "sanitized_fallback_reason",
              "behavior",
              item.reason,
              safeEnum(answer?.generation?.reason, SAFE_REASONS),
            ),
          );
        checks.push(
          check(
            "guardrail_version",
            "integrity",
            "1",
            safeEnum(answer?.guardrails?.version, ["1"]),
          ),
        );
        checks.push(
          check(
            "guardrail_status",
            "behavior",
            "passed",
            safeEnum(answer?.guardrails?.status, ["passed", "model_skipped"]),
          ),
        );
        checks.push(
          check(
            "answer_status_preserved",
            "behavior",
            item.expectedStatus ?? baseline.status,
            safeEnum(answer?.status, ANSWER_STATUSES),
          ),
        );
        checks.push(
          check(
            "citation_integrity",
            "integrity",
            true,
            answer ? citationsIntact(answer, baseline, item.options) : false,
          ),
        );
        checks.push(
          check(
            "navigation_decisions_preserved",
            "integrity",
            true,
            Boolean(
              answer &&
                equal(answer.nextSteps, baseline.nextSteps) &&
                equal(answer.warnings, baseline.warnings) &&
                equal(
                  answer.requirementsToVerify,
                  baseline.requirementsToVerify,
                ),
            ),
          ),
        );
        if (item.expectedGeneration !== "used")
          checks.push(
            check(
              "deterministic_answer_retained",
              "integrity",
              true,
              answer?.answer === baseline.answer,
            ),
          );
        if (item.expectedGeneration === "used") {
          checks.push(
            check(
              "primary_quote_preserved_in_full",
              "integrity",
              true,
              Boolean(answer?.answer.includes(baseline.evidence[0].quote)),
            ),
          );
          checks.push(
            check(
              "both_requested_citations_rendered",
              "integrity",
              true,
              Boolean(
                answer?.answer.includes("[E1]") &&
                  answer.answer.includes("[E2]"),
              ),
            ),
          );
        }
      }
      if (item.scenario === "removed-negation")
        checks.push(
          check(
            "negation_challenge_applied",
            "integrity",
            true,
            state.challengeApplied === true,
          ),
        );
      if (item.scenario === "oversized-stream")
        checks.push(
          check(
            "oversized_stream_cancelled",
            "robustness",
            true,
            state.streamCancelled === true,
          ),
        );
      if (["timeout", "cancel-during-fetch"].includes(item.scenario))
        checks.push(
          check(
            "provider_signal_aborted",
            "robustness",
            true,
            state.signal?.aborted === true,
          ),
        );
    } catch {
      // Fixed failure label only: raw provider errors, fixture secrets, and prompts stay out of reports.
      checks.push(
        check(
          "execution_completed_without_unexpected_exception",
          "robustness",
          true,
          false,
        ),
      );
    }
    results.push({
      id: item.id,
      suite: "providers",
      title: `${item.provider}: ${item.scenario.replaceAll("-", " ")}`,
      fixture: item.fixture,
      checks,
      durationMs: Math.round((performance.now() - started) * 1000) / 1000,
      details: {
        scenario: item.scenario,
        challenge:
          "Guarded entrypoint and real HTTP adapter with synthetic fetch; no network or real inference.",
      },
    });
  }
  return results;
}
