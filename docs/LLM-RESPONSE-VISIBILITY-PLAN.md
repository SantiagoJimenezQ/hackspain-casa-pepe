# Full LLM response visibility

Status: backend implemented locally, pending deployment. Shared contracts, backend persistence, cursor history, and SSE catch-up are implemented. Frontend behavior is preserved; rendering and frontend integration are owned by the frontend team. Historical records cannot recover text previously truncated.

Implementation detail: public streaming buffers complete lines and configured-credential lookahead before redaction. Single-line responses may appear only at completion. This preserves full text without risking fragment-boundary credential disclosure. Customer-ranking audit remains outside this change.

## Goal

Let the operator read the complete public explanation for each model turn and inspect its proposed tool calls, including decisions rejected by validation or discarded after new evidence arrives. Preserve the distinction between a model proposal and an action actually executed.

Expose a provider-neutral decision record, including full assistant text and redacted tool arguments. Do not forward credentials, provider-internal reasoning, private chain-of-thought, or the entire provider response envelope.

## Previous behavior (before this change)

- `apps/server/src/agent/llm/llm-client.service.ts` retains assistant content, tool calls, model, and basic token totals. It drops finish reason after validation, detailed usage, and other provider fields.
- `llm-stream.ts` publishes at most 2,000 characters of assistant text per turn. `llm-loop.service.ts` also truncates the final activity summary to 2,000 characters.
- Decision activity contains tool names but not original model call IDs or arguments. Validated plans and runtime tool executions are available separately.
- The frontend subscribes to LLM activity events, but `apps/web/src/lib/agent-trace.ts` builds the agent transcript from tools, approvals, and a thinking indicator, without displaying the LLM text events.
- The frontend retains a bounded activity window. A complete transcript cannot rely solely on that in-memory window or a single overview/backlog page.
- The customer-ranking model returns parsed ranks and justifications through its separate report flow. The work below targets incident-commander turns; extending the same audit record to ranking is separate work.

## Shared contract

The additive contract is defined in `packages/contracts/agent.d.ts`. Existing activity summaries and tool-name metadata remain compatible with existing consumers.

Each completed model turn exposes:

| Field | Meaning |
| --- | --- |
| `outputIdentifier` | Stable identifier shared by streamed fragments and turn updates. |
| `turn` | Turn index within its cycle; use `outputIdentifier`, not this index, as the unique key. |
| `text` | Full public assistant content, nullable for tool-only responses. |
| `toolCalls` | Original call ID, tool name, and parsed arguments with sensitive values redacted. |
| `model` | Model reported by the provider. |
| `finishReason` | Provider finish reason, nullable when unavailable. |
| `usage` | Optional normalized token totals and explicitly allowlisted numeric usage details; unavailable values must not become zero. |
| `disposition` | `pending`, `accepted`, `rejected`, `stale`, or `incomplete`. Pending means runtime validation has not finished. |
| `dispositionReason` | Public explanation of rejection or stale-state discard, where applicable. |
| `redacted` | Whether any public content or argument values were redacted. |

Retain run, incident, sequence, time, and plan correlation through the existing activity envelope. Associate every rejection and stale update with its original `outputIdentifier`. An accepted proposal does not mean an external action succeeded: execution status remains in the linked runtime tool, approval, and plan records.

## Backend changes

1. Preserve finish reason and allowlisted usage details in the LLM client’s normalized result.
2. Remove the 2,000-character public-text truncation from streaming and completed-turn records. Keep the existing provider token and byte budgets; this is not an unlimited-response feature. A short activity summary can remain, provided the full text is stored separately in the payload.
3. Apply one public-output redaction policy before persistence and delivery, including streamed text. Redact credential values and sensitive tool fields; unknown tool schemas must fail closed for argument disclosure. Never persist raw rejected arguments as a fallback. Streaming redaction must handle sensitive values split across fragments.
4. Persist the complete public turn record and its validation disposition. Preserve stale and rejected proposals for audit, clearly labeled. Provider failures or malformed/truncated responses must remain failures, with partial output explicitly marked incomplete rather than presented as accepted decisions.
5. Deliver records through the authenticated activity API and SSE proxy. Preserve batched fragments, sequence-based deduplication, and `outputIdentifier` correlation. A completed record replaces its provisional text rather than appending a duplicate.
6. Provide paginated history and reliable backlog catch-up so refreshes, reconnects, and long runs can recover all turn records beyond the overview and client activity windows. Do not expand model working history merely because the operator transcript becomes complete.

## Frontend handoff (not implemented)

The backend endpoint is `GET /api/activity/llm?runIdentifier=...&limit=100&beforeSequence=...`. It returns `{ items, nextBeforeSequence }` in descending sequence order; null means the end of history. Add a server-side proxy when needed and keep the backend API key out of browser code. Existing SSE event names and short summaries are preserved. Full content is in `payload.text`; merge turn updates by `outputIdentifier`, and deduplicate events by run and sequence. Older stored records may lack the additive fields.

Suggested integration work for the frontend team:

- Add model-turn entries to the agent transcript in activity order, alongside actual execution records.
- Render provisional text while streaming, then reconcile it with the complete public turn record.
- Show the full explanation with wrapping and an optional collapse control, without silently truncating the stored text.
- Provide expandable tool-call details and model/usage metadata. Show redaction explicitly.
- Label pending, accepted, rejected, stale, and incomplete output accurately. Keep historical rejected/stale explanations inspectable instead of presenting them as the current plan.
- Load older history on demand and deduplicate restored records against live SSE events. Tool-only responses should display their calls without inventing explanation text.
- Render model content as untrusted text or sanitized Markdown, never executable HTML.

## Backend acceptance

- Responses longer than 2,000 characters are available through the backend activity API and SSE in streaming and non-streaming modes, within configured provider budgets.
- Tool-only responses retain original call IDs and redacted arguments. Existing plan and execution records remain available and distinct from proposals.
- Model, finish reason, and supported usage details survive normalization; missing metadata stays optional.
- Rejected and stale decisions remain correlated in the API with their reasons. Provider errors and truncated responses cannot appear accepted.
- Credentials, private reasoning, and sensitive argument values are absent from persisted public records, API responses and SSE events, including secrets split across stream fragments.
- Backend SSE catch-up and cursor pagination support recovery of completed turns beyond the frontend activity window.
- Backend parser, loop, redaction, stream, and history tests cover the new contract. Frontend transcript/reconciliation tests and browser verification belong to the frontend integration.

`apps/server/docs/API.md`, `apps/server/docs/LLM-AGENT.md`, and shared declarations are updated to describe the implemented contract.


## Verification

Backend tests cover long explanations, redaction across stream boundaries, nested tool argument projection, correlated acceptance/rejection, history pagination, and SSE catch-up races. The frontend implementation and its new tests have been removed to preserve the existing dashboard. No live provider calls were made for validation.
