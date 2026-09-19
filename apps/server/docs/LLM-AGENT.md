# LLM incident commander

The production decision loop always uses an LLM. It selects investigations, creates and revises plans, chooses individual actions, and decides when to wait. Provider errors pause autonomous decisions with an activity event. There is no rule-based runtime fallback.

## Provider setup

Configure the server's ignored `.env.local` using `.env.example`. Supply the provider's base URL, model identifier and API key. The adapter targets the chat-completions protocol with function calling; Helmcode compatibility must be checked against its documentation and a live smoke test. Do not assume a similarly named API supports the same protocol.

Required variables are `LLM_BASE_URL` (the API prefix before `/chat/completions`), `LLM_MODEL`, and `LLM_API_KEY`. Bounds are `LLM_TIMEOUT_MILLISECONDS`, `LLM_MAXIMUM_TURNS`, and `LLM_MAXIMUM_OUTPUT_TOKENS`. `LLM_REASONING_EFFORT` is optional and is forwarded as `reasoning_effort`; `none` disables hidden reasoning on models that support it, which makes each decision much faster. The adapter sends bearer authentication, requests a single function call, and rejects redirects or oversized responses.

The model must support function tools and enough output tokens for a complete recovery plan. Credentials remain in server configuration and are never passed as model context or included in activity. Model requests have timeouts and bounded turns/output. Missing configuration produces a visible failure when the first incident cycle requests a decision; ordinary API reads remain available.

## Runtime

Each model turn receives fresh incident state, the latest plan, operator decisions, calls, recent tool results and relevant learning. Simulated future results, scripted answers and simulation internals are removed before sending context to the model.

Every request includes the system instructions, a short assistant/tool working history, fresh authoritative state, and `investigationSummary`. The summary combines current confirmed/pending facts, unresolved engineer questions, the latest plan rationale/assumptions, and up to 16 recent relevant public audit entries. It is reconstructed from the current run's persisted activity at the start of each cycle (including after a process restart), then updated locally. Stale-input handling clears obsolete conversation exchanges but retains this summary. Historical summaries are explicitly untrusted context; current evidence and approvals remain authoritative. This is bounded continuity, not a full transcript or private reasoning store, and does not add a database table or extra model request.

Direct read functions require exactly `{}`: the backend supplies incident/run/resource context. The system prompt and each read-tool description show examples and distinguish these native function arguments from the `{name, input}` invocation records inside a proposed plan. Invalid arguments are still rejected, not silently rewritten. The tool response and `agent.llm-rejected` audit payload include a correction plus `argumentDiagnostics`: JSON validity, byte size and a bounded structural shape. Only allowlisted field names and types are exposed; unknown names are redacted and all argument values omitted. Malformed JSON and uncontrolled integration errors are not echoed into the audit. No new environment variables are needed for these changes.

The model has five read tools (`get_incident_context`, `get_service_health`, `get_recovery_capacity`, `check_services_status`, `prioritize_customers`), `propose_plan`, `execute_step` and `wait_for_input`. `check_services_status` queries every service through the independent recovery health read and reports discrepancies with the recorded state; it is also allowed as an argument-less plan step. Plans contain calls with model-authored questions, assignments, recoveries, verification, email and status updates. An investigation-only plan can call an engineer before committing to recovery. The server computes trusted run, incident, plan and approval context; model text cannot supply authorization.

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
