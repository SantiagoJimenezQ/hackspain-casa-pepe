# LLM incident commander

The production decision loop always uses an LLM. It selects investigations, creates and revises plans, chooses individual actions, and decides when to wait. Provider errors pause autonomous decisions with an activity event. There is no rule-based runtime fallback.

## Provider setup

Configure the server's ignored `.env.local` using `.env.example`. Supply the provider's base URL, model identifier and API key. The adapter targets the chat-completions protocol with function calling; Helmcode compatibility must be checked against its documentation and a live smoke test. Do not assume a similarly named API supports the same protocol.

`LLM_PROVIDER` selects a preset: `openai` reads the `LLM_OPENAI_*` variables, `deepseek` the `LLM_DEEPSEEK_*` ones, and an empty value the plain `LLM_*` ones. A preset falls back to the plain variable for anything it leaves empty, so both providers can be configured at once and switching is a single variable. Required variables are the base URL (the API prefix before `/chat/completions`), the model, and the API key. Bounds are `LLM_TIMEOUT_MILLISECONDS`, `LLM_MAXIMUM_TURNS`, and `LLM_MAXIMUM_OUTPUT_TOKENS`. `LLM_REASONING_EFFORT` is optional and is forwarded as `reasoning_effort`; `none` disables hidden reasoning on models that support it, which makes each decision much faster. The adapter sends bearer authentication, requests a single function call, and rejects redirects or oversized responses. Against `api.openai.com` it sends `max_completion_tokens` instead of `max_tokens`; gpt-5 models also reject function tools on `/chat/completions` unless `reasoning_effort` is `none`, which is why the OpenAI preset ships that value.

The model must support function tools and enough output tokens for a complete recovery plan. Credentials remain in server configuration and are never passed as model context or included in activity. Model requests have timeouts and bounded turns/output. Missing configuration produces a visible failure when the first incident cycle requests a decision; ordinary API reads remain available.

## Runtime

Each model turn receives fresh incident state, the latest plan, operator decisions, calls, recent tool results and relevant learning. Simulated future results, scripted answers and simulation internals are removed before sending context to the model.

Every request includes the system instructions, a short assistant/tool working history, fresh authoritative state, and `investigationSummary`. The summary combines current confirmed/pending facts, unresolved engineer questions, the latest plan rationale/assumptions, and up to 16 recent relevant public audit entries. It is reconstructed from the current run's persisted activity at the start of each cycle (including after a process restart), then updated locally. Stale-input handling clears obsolete conversation exchanges but retains this summary. Historical summaries are explicitly untrusted context; current evidence and approvals remain authoritative. This is bounded continuity, not a full transcript or private reasoning store, and does not add a database table or extra model request.

Direct read functions require exactly `{}`: the backend supplies incident/run/resource context. The system prompt and each read-tool description show examples and distinguish these native function arguments from the `{name, input}` invocation records inside a proposed plan. Invalid arguments are still rejected, not silently rewritten. The tool response and `agent.llm-rejected` audit payload include a correction plus `argumentDiagnostics`: JSON validity, byte size and a bounded structural shape. Only allowlisted field names and types are exposed; unknown names are redacted and all argument values omitted. Malformed JSON and uncontrolled integration errors are not echoed into the audit. No new environment variables are needed for these changes.

The commander has `propose_plan`, `execute_step`, `wait_for_input` and three delegation tools: `delegate_investigation`, `delegate_engineer_call` and `delegate_communication`. Each takes exactly `{"objective":"..."}` and returns a bounded report of `summary`, `details` and `pending`. Plans contain calls with model-authored questions, assignments, recoveries, verification, email and status updates. An investigation-only plan can call an engineer before committing to recovery. The server computes trusted run, incident, plan and approval context; model text cannot supply authorization.

## Specialists

Three specialists run under the commander, each with its own short system prompt, its own tool subset and a bounded slice of state. The commander never sees their raw tool output, only their report, so a commander turn stays small as the incident grows.

- **Investigation specialist** owns the five read tools (`get_incident_context`, `get_service_health`, `get_recovery_capacity`, `check_services_status`, `prioritize_customers`). `check_services_status` queries every service through the independent recovery health read and reports discrepancies with the recorded state; it is also allowed as an argument-less plan step. The specialist reads only: it cannot plan, dispatch or contact anyone.
- **Engineer contact specialist** formulates the questions for the on-call engineer and starts a `call_engineer` step that already exists in the active plan. The configured engineer identity and phone stay fixed; only the questions are model-authored.
- **Communication specialist** reads the incident mailbox with `read_incoming_emails` and starts a `send_incident_email` or `publish_status_update` step from the active plan. Recipients and wording are still derived server-side from the persisted plan.

A specialist never creates a step. It selects one the commander already planned and validation already accepted, and the runtime offers it only the runnable steps of its own scope whose dependencies are met, so it cannot widen its authority by naming another identifier. Dependencies, capacity and mandatory approvals are enforced unchanged at execution, and a specialist dispatch spends the same per-cycle action budget as a commander dispatch. Each specialist is bounded to six turns and must finish with `report_result`; a turn limit, a provider failure or an invalid argument returns an explicit outcome to the commander instead of a silent success. Specialist decisions, rejections and reports appear in the existing activity stream, tagged with the specialist in the payload.

Before accepting a model response and dispatching an action, the runtime compares current decision-relevant state with the state the model saw. New inputs cause stale responses to be discarded and reassessed. Queued domain events also trigger follow-up cycles. Active incoming reports gate action until the operator confirms them. Plan revisions supersede obsolete pending approvals and retain dispatched work; an external action already in progress is not undone by a new plan.

Plan validation checks identifiers, arguments, dependency structure, capacity and mandatory approvals. Invalid proposals are returned to the model within its turn budget. Existing recovery adapters still verify current capacity, approvals and service dependencies at execution. Recovery is only reported healthy after independent verification.

`GET /api/agent/status` identifies the engine and configured model. LLM decisions, stale responses, rejected proposals, failures and turn limits appear in the existing activity stream. Public decision summaries and provider usage are recorded; private chain-of-thought is neither requested nor stored. Durable incident, plan, call, approval, action and learning records rebuild context for subsequent cycles.

## Demo acceptance

1. Configure and smoke-test the model with simulated external actions first.
2. Start a run and apply the impact. Observe the model investigate and choose a plan.
3. Let it start an engineer call or recovery. Introduce reduced capacity while work is pending or running.
4. Show the stale decision event (if a model request was in progress), revised plan and changed priorities. Confirm running/completed work remains tracked.
5. Reject or approve recovery. Show that the model incorporates the decision and cannot bypass it.
6. Verify recovery independently, then observe model-chosen communication.
7. Rehearse provider failure: a visible pause, no new automatic recovery, and explicit retry through `POST /api/agent/cycle` after restoration.
8. Enable HappyRobot or email only for the intended live demo recipients and verify the external effect.

Unit and integration tests use explicitly injected scripted model responses. These prove orchestration and guard behavior, not live model quality or Helmcode compatibility. The previous planner is retained solely as a test fixture/reference. This is a single-coordinator hackathon runtime; distributed scheduling and cancellation of already dispatched provider actions are not supplied.

## Public summary streaming (feature flag)

Set `LLM_STREAM_OUTPUT=true` on the backend and restart to request provider SSE streaming. Default `false` preserves the non-streaming request. The provider must support OpenAI-compatible chat completion streaming; failures pause the cycle rather than retrying and risking duplicate decisions.

The existing authenticated `/api/activity/stream` and Next.js proxy deliver `agent.llm-output` activity records as the model emits public assistant content. These are **provisional summaries**, not private chain of thought or executed actions. Reasoning fields and partial tool arguments are never forwarded. The existing dashboard receives these events but does not render their text in the agent transcript. Frontend behavior is unchanged; the frontend team can use the additive payload fields to customize presentation.

The implementation and acceptance criteria are documented in [Full LLM response visibility](../../../docs/LLM-RESPONSE-VISIBILITY-PLAN.md).

Payload: `{ outputIdentifier, turn, text, provisional: true, redacted }`. Append `text` in activity sequence order and deduplicate on reconnect. Provider fragments are batched; the public-output boundary buffers complete lines and credential lookahead before redaction, with a final flush after completion validation. A single-line explanation may therefore arrive only at completion. Full public text has no 2,000-character cutoff; configured provider byte/token budgets remain enforced. Activity `summary` stays short, while `payload.text` holds the complete explanation.

Completed decisions carry the `LlmPublicTurn` fields from `packages/contracts/agent.d.ts`: full public text, redacted tool-call IDs/names/arguments, model, finish reason, optional allowlisted usage metrics, and disposition. A `pending` record precedes validation; an `accepted` or `rejected` update shares its `outputIdentifier`. Stale responses retain their public explanation with `stale`; failed completions are marked `incomplete`. Accepted proposals are not proof of successful external execution. Consumers should replace draft text with completed text and retain rejected, stale, and incomplete entries with their labels.

`GET /api/activity/llm?runIdentifier=...&limit=100&beforeSequence=...` returns newest-first records and `nextBeforeSequence` (null at the end). The frontend team can add a server-side proxy and history UI when integrating this endpoint. The existing dashboard retains its 100-event activity window. SSE drains all backlog pages and buffers live events during catch-up. Existing historical records are not reconstructed or retroactively enriched.

Tools execute only after the stream terminates, the complete response is validated, and current incident state is rechecked. Missing termination, malformed or oversized output, truncation, and timeouts pause autonomous decisions. Disable the flag to roll back without frontend changes.

## Outbound call contract

See [call_engineer input and outcome](CALL-ENGINEER-CONTRACT.md) for exact plan inputs, provider payloads, pending/completed/failed results, and the permission decision table. The current ElevenLabs agent collects notification and failover permissions through one combined question, not arbitrary technical answers. The runtime system prompt carries the same guidance so the model receives it on each decision cycle.

## Check configured models

`POST /api/agent/models/test` requires the usual operator API key and no request body.
It makes two billable, synthetic tool-call requests using the runtime client: the
agent profile (configured reasoning and timeout) and customer-ranking profile
(`LLM_FAST_MODEL` or `LLM_MODEL`, reasoning `none`, fast timeout, no streaming,
1,500 output tokens). The agent profile uses the configured streaming mode and
output token budget. Neither profile needs an incident,
executing tools, changing plans, or contacting engineers.

```bash
curl -X POST https://casa-pepe-api.vercel.app/api/agent/models/test \
  -H "Authorization: API $CASA_PEPE_API_KEY"
```

HTTP 200 means the diagnostic completed; check `ok` and each entry in `results`.
Each entry includes `profile`, `model`, `reasoningEffort`, `timeoutMilliseconds`,
`streamOutput`, `maximumOutputTokens`, `status` (`succeeded` or `failed`),
`latencyMilliseconds`, and a sanitized `error`.
The response also includes `streamOutput` and `maximumOutputTokens`.
Success requires exactly one `model_health_check` tool call with `{"ok":true}`;
it verifies provider access and tool calling, not incident decision quality.
Failures retain safe HTTP status/timeout messages but never raw provider errors
or credentials. OpenAI requests use `max_completion_tokens`; other compatible
providers retain `max_tokens`.

### Provider failure logs

The shared LLM client emits structured `LLM provider request failed` warnings for
OpenAI and compatible providers such as Helmcode. Fields include provider host,
model, reasoning effort, streaming flag, configured timeout, elapsed milliseconds,
output budget, request bytes, tool count and a generated `requestIdentifier`.
That identifier is also sent as `X-Client-Request-Id` for provider-side correlation.
When available, logs include HTTP status, recognized network/provider error codes,
parameter name, provider request ID and numeric `Retry-After` seconds. Fixed hints
identify token-parameter incompatibility, reasoning configuration, model access,
billing/quota and rate-limit failures.

Streaming HTTP errors are read as bounded JSON (8 KiB, 250 ms), then closed.
Raw provider messages, request/response bodies, prompts, tool arguments,
authorization headers and credentials are never logged. Unknown provider codes
are omitted. Malformed or truncated completions emit `LLM response validation
failed`. Public diagnostic errors remain sanitized.
