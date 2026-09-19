# LLM incident coordinator implementation

Branch: `codex/llm-incident-agent-core`, isolated checkout `/private/tmp/casa-pepe-llm-agent`.

## Goal and challenge

The LLM owns investigation, priorities, plan revisions and selection of the next action. The official challenge (https://hackspain2026.happyrobot.ai/) requires changing inputs during execution, external actions, multi-step coordination and visible human intervention. A deterministic planner is only a test fixture; provider failure pauses autonomous decisions.

## Implementation sequence

1. Define model message and decision contracts and a bounded provider adapter. Configure URL, model and credentials server-side; fail visibly when absent. Verify Helmcode compatibility separately once documentation is supplied.
2. Add runtime validation for model tool arguments and proposed plans. Enforce known identifiers, dependency ordering, resource capacity, mandatory approvals and preservation of dispatched work independently of model text.
3. Replace the production rule-based decision cycle with an LLM tool loop. Supply incident context, history, outstanding actions, operator decisions and learning. Model chooses investigation tools, plans, next steps or a wait with an explanation.
4. Check fresh incident and plan state around model requests and action dispatch. New inputs invalidate stale decisions. Resume after asynchronous results; preserve in-flight work and supersede obsolete approvals.
5. Record model identity, usage, visible decision summaries, actions and errors in the existing persistent audit stream. Never store credentials or private chain-of-thought. Retain an authenticated operator retry path.
6. Test provider errors, schema failures, tool investigation, mid-request changes, mid-plan changes, approvals, asynchronous results and no silent deterministic fallback. Run backend checks and update setup/demo documentation.

## Parallel work

- Luna Max: provider adapter and configuration, bounded requests and provider tests.
- Luna Max: plan/tool decision validation and adversarial validator tests.
- Luna Max: loop behavior tests, and a separate worker for integration harness migration.
- Main agent: orchestration integration, stale-state guards, audit events, integration verification and final review.

## Shared internal interfaces

Provider: `LlmClientService.complete(messages, tools)` returns `{ message, usage, model }`; messages follow the chat-completions message shape. Tools use `{ type: 'function', function: { name, description, parameters } }`.

Decision tools: investigation via existing read tools; `propose_plan` with a `PlanDraft`; `execute_step` with a step identifier; `wait_for_input` with a reason. The server resolves execution context, approvals and credentials. The model never supplies those trusted values.

Plan validation: `validateLlmPlan(value, input: PlanBuildInput): PlanDraft`, rejecting invalid proposals rather than repairing model decisions silently.

## Completion evidence

- [x] Provider tests (12 passed)
- [x] LLM owns the production decision loop
- [x] Mid-plan integration and mid-request stale-decision tests (10 loop tests)
- [x] Plan and action guard tests (16 validator tests)
- [x] Backend changed-file lint, typecheck, 20 suites / 96 tests and production build
- [x] Frontend changed-file lint, typecheck, 8 suites / 28 tests and production build
- [x] Setup and demo instructions
- [ ] Helmcode live smoke test (requires supplied provider details and local credential)

Validation uses injected scripted model responses and simulated external adapters. It verifies orchestration, not live model quality. HTTP tests required loopback permission, and the frontend build required network permission for its existing Google Fonts. No live messages or recovery actions were sent.

The implementation was isolated from concurrent changes in the original checkout; unrelated inbound-email work is not included in this branch.
