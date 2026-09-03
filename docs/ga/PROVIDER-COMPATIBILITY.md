# Provider Compatibility — the cassette-pinned matrix of record

| | |
|---|---|
| **Document** | Which providers Vaerion supports, on which operations, with which wire behaviors — success AND failure — each pinned by a committed cassette (ADR-0012) |
| **Law** | "No provider is 'supported' without evidence." A row below is only as true as its cassette and its test (`packages/vaerion/tests/integration/provider-compat.test.ts`). |
| **Recording method** | Fingerprints come from the REAL adapter request bytes (`packages/vaerion/scripts/record-cassettes.ts`); the transcripts are the providers' DOCUMENTED wire formats. Live provider recordings remain F-6 (Founder-gated: needs provider network access). |

## 1. The matrix

| Provider | Op | Scenario | Cassette (`packages/vaerion/fixtures/cassettes/`) | Status | Engine behavior (pinned) |
|---|---|---|---|---|---|
| openai | chat | success (SSE stream, usage in final chunk) | `openai-chat-basic-v1.json` | 200 | text + usage + integer µUSD pricing journaled (gateway-flow suite) |
| openai | embed | success (JSON list body) | `openai-embed-basic-v1.json` | 200 | embedding frames, metered |
| openai | chat | **rate limit** (`rate_limit_error` / `rate_limit_exceeded`) | `openai-chat-429-ratelimit-v1.json` | 429 | retried (2 attempts) → **E1601** "HTTP 429", `gateway.invoke.failed` journaled, metering `failed: 1`, breaker counts it |
| openai | chat | **auth failure** (`invalid_request_error` / `invalid_api_key`) | `openai-chat-401-auth-v1.json` | 401 | retried → **E1601** "HTTP 401", journaled, metered failed; key value never journals |
| anthropic | chat | success (SSE: message_start/blocks/delta/stop, coalesced usage) | `anthropic-chat-basic-v1.json` | 200 | text + usage + pricing journaled (102 µUSD pinned end-to-end) |
| anthropic | chat | **overloaded** (`overloaded_error`) | `anthropic-chat-529-overloaded-v1.json` | 529 | retried → **E1601** "HTTP 529", journaled, metered failed |
| anthropic | chat | **mid-stream error** (HTTP 200 + `event: error` in the SSE stream) | `anthropic-chat-stream-error-v1.json` | 200 | **E1601** "provider stream error (overloaded_error)" — a DEFECT was found here (the error frame was silently swallowed; invocation recorded as success) and fixed at the frame-collection root; this row is its permanent regression pin |
| ollama | chat | success (NDJSON stream, done counts) | `ollama-chat-basic-v1.json` | 200 | text + usage journaled |
| ollama | chat | **model not pulled** (plain `{"error": string}`) | `ollama-chat-404-model-missing-v1.json` | 404 | retried → **E1601** "HTTP 404", journaled, metered failed |
| mockbrain | chat/embed | deterministic local provider (no network, no transport) | (in-process — the evals/mockbrain suite) | — | isolated from transport by construction (pinned in gateway-core) |

## 2. The measured fallback/protective behavior

- **Retry**: `TransportRetries` (default 3 attempts, full-jitter backoff; the
  compat suite runs 2 fast attempts) — transport-class errors (E1601/E1706)
  are retryable; the breaker sees every failure.
- **Breaker** (R-MG2): per-provider circuit breaker; after the threshold of
  consecutive failures it REFUSES before any transport call with **E1705**
  ("circuit breaker … is open") — pinned by the breaker leg of the compat
  suite; the refusal is journaled and metered as failed.
- **Fail-closed replay**: a request with no matching cassette is a loud
  **E1702** — CI can never silently touch the network.
- **Secret hygiene across every failure leg**: the resolved key value never
  enters the journal (asserted in every row above).

## 3. Honest limits (labeled, never dressed)

- **Synthetic, not live**: the transcripts are authored from the providers'
  documented formats, with fingerprints from the real request path. A live
  recording session (real network, real credentials, one per shipping
  adapter) remains **F-6 / R-4, Founder-gated** — the record script is the
  sanctioned path when that happens.
- **Version drift**: provider wire formats are pinned as of the cassette
  dates; a provider changing its error shape is a new cassette + a reviewed
  contract change (the bless path), never a silent test edit.
- **Model IDs** in the matrix are the config-declared examples; any model
  behind the same op/shapes inherits the same adapter behavior.
