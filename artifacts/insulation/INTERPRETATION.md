# Complete-recording interpretation

Recording and audio transcription are unchanged. After explicit Stop, the existing
transcript is sent once to the authenticated `POST /api/interpret` Worker route.
No audio goes to that route. Native WhisperKit transcripts use the same text-only
interpretation route; WhisperKit transcription itself remains on-device.

The strict JSON schema is shared between Worker and browser. It permits measurement
inputs, source quotations, corrections, clarification messages and job metadata,
but no calculated areas, totals, prices or derived quantities. The model extracts
original measurements and separate correction events with earlier target IDs.
Local validation checks order, literal nonoverlapping quotations, numeric grounding,
section/area correction scope and omitted numeric speech. Missing/ambiguous items
remain editable; they cannot silently disappear. Every quantity is produced by the
existing deterministic parser/calculation engine. Material row selection and the
original PDF mapping remain unchanged.

## Configuration and cost

Existing secret: `OPENAI_API_KEY`, server-side only. No secret changes are required
for a server already configured for OpenAI transcription.

Optional non-secret **Worker** configuration:
- `OPENAI_INTERPRETATION_MODEL`: default `gpt-6-luna`.
- `INTERPRETATION_INPUT_USD_PER_MILLION`: optional price-estimate override.
- `INTERPRETATION_OUTPUT_USD_PER_MILLION`: optional price-estimate override.

Do not use VITE-prefixed keys for any credential. A model override with no price
overrides reports cost unavailable rather than estimating at another model's price.
Configure these on the Worker when later approved for deployment; this change does
not modify production or provision anything.

OpenAI's official model documentation inspected during implementation lists
GPT-6 Luna as the current efficient model with structured outputs, at standard
uncached rates of $0.10 / million input tokens and $0.50 / million output tokens.
The cheaper older GPT-5 nano is marked deprecated. Default uses the Responses API,
strict JSON schema, no tools, `store:false`, a 90-second timeout and a 12,000-output-
token cap. No realtime session, background task, SDK retry or polling is used.

Example **assumption**, not a measured recording: 2,500 input + 3,000 output tokens
cost about **$0.00175** per recording. 24 five-minute recordings/day × 30 days cost
about **$1.26/month** for interpretation alone. Audio transcription, taxes and any
provider pricing changes are extra; token counts vary with recording and response
length, and output includes billable reasoning tokens. Cached discounts are not
assumed. A maximum-length response alone can cost $0.006 at these rates.

Usage and estimated cost appear in the review's “Interpretation usage / cost”
details, are included with confirmed measurements, and are logged as structured
`takeoff_interpretation_usage` events without transcript or credentials.

## Safety / failure behavior

- One initial interpretation per completed recording. Reviewing/editing individual
  rows and confirming never call OpenAI.
- One explicit retry maximum, including when editing the entire transcript.
  Attempt budget is stored before requesting and survives draft restoration.
- Provider refusal/error, timeout, truncated output or schema failure leaves the
  old deterministic parser visible as a labeled **unsavable comparison**.
  There is no automatic fallback saving or automatic retry.
- Semantically ambiguous/missing input is shown locally on its own item. Clear
  records remain visible. GPT review confirmation waits until every item/issue
  is resolved. A genuinely unmatched correction requires a user choice.
- The two-attempt limit is enforced by the application per saved local draft,
  not a durable server-side billing quota or cross-device idempotency ledger.
  The endpoint requires a signed-in user with write access to the job and makes
  exactly one provider request per invocation. Intentional new recordings/new
  drafts can spend again. Server-side billing caps remain an OpenAI account setting.
- There are no database writes in the interpretation endpoint.

## Verification scope

Tests mock the provider, never make paid calls. Independent model-shaped fixtures
exercise the adapter and actual main.js recording/review/confirmation handlers.
Legacy parser tests explicitly keep their previous parser-only scope.
Live model accessibility and real-world extraction accuracy are NOT established by
mock responses; validate a real recording with owner authorization before relying
on the model in production. macOS/physical iPhone behavior remains a separate check.

References:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-5-nano
- https://developers.openai.com/api/docs/guides/structured-outputs
