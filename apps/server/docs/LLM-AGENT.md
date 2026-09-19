# LLM incident commander

The production decision loop always uses an LLM. It selects investigations, creates and revises plans, chooses individual actions, and decides when to wait. Provider errors pause autonomous decisions with an activity event. There is no rule-based runtime fallback.

## Provider setup

Configure the server's ignored `.env.local` using `.env.example`. Supply the provider's base URL, model identifier and API key. The adapter targets the chat-completions protocol with function calling; Helmcode compatibility must be checked against its documentation and a live smoke test. Do not assume a similarly named API supports the same protocol.

Required variables are `LLM_BASE_URL` (the API prefix before `/chat/completions`), `LLM_MODEL`, and `LLM_API_KEY`. Bounds are `LLM_TIMEOUT_MILLISECONDS`, `LLM_MAXIMUM_TURNS`, and `LLM_MAXIMUM_OUTPUT_TOKENS`. The adapter sends bearer authentication, requests a single function call, and rejects redirects or oversized responses.

The model must support function tools and enough output tokens for a complete recovery plan. Credentials remain in server configuration and are never passed as model context or included in activity. Model requests have timeouts and bounded turns/output. Missing configuration produces a visible failure when the first incident cycle requests a decision; ordinary API reads remain available.

## Runtime

Each model turn receives fresh incident state, the latest plan, operator decisions, calls, recent tool results and relevant learning. Simulated future results, scripted answers and simulation internals are removed before sending context to the model.

The model has three read tools (`get_incident_context`, `get_service_health`, `get_recovery_capacity`), `propose_plan`, `execute_step` and `wait_for_input`. Plans contain calls with model-authored questions, assignments, recoveries, verification, email and status updates. An investigation-only plan can call an engineer before committing to recovery. The server computes trusted run, incident, plan and approval context; model text cannot supply authorization.

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
