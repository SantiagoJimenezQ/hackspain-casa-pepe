# Standalone tool test API implementation plan

## Goal and scope
Test outbound email and engineer-call integrations through authenticated HTTP without creating, resetting, or advancing an incident. Reuse production adapters with clearly labelled synthetic content. Incident-dependent planning, approval and recovery tools are not eligible for standalone execution.

## Agreed API contract
- `GET /api/tools/tests`: return a catalog of supported tool names (`send_incident_email`, `call_engineer`), supported modes and configured live availability; no secrets.
- `POST /api/tools/tests`: `{ tool: "send_incident_email" | "call_engineer", mode?: "simulated" | "live", idempotencyKey: string, engineer?: { name: string, phone: string } }`. Mode defaults to simulated. Live email uses configured sender/recipient; call requires an explicit engineer with E.164 phone. Fixed synthetic test purpose/question/content avoids incident dependencies. Live mode requires corresponding configured live mode and provider configuration.
- `GET /api/tools/tests/:identifier`: fetch durable standalone result.
- `POST /api/tools/tests/callbacks/happyrobot`: same HappyRobot result DTO and shared-secret authentication as existing callback. Only updates standalone records, never incident services/events.
- Result: `{ identifier, tool, mode, status: "running" | "accepted" | "succeeded" | "failed", createdAt, finishedAt, provider, providerReference, providerCallSid, detail, error: { code, message } | null, result: unknown | null }`. Email acceptance is explicitly not inbox delivery. Live calls use the shared configured adapter and remain accepted until an ElevenLabs lookup or HappyRobot callback completes them; overdue calls become failed on read. Simulated tests finish immediately and never contact providers.
- Dedicated database table, unique idempotency key, normalized request fingerprint. Repeated matching requests return original result, conflicting reuse returns 409. Reserve record before provider invocation; do not automatically retry ambiguous outcomes. No incident/plan foreign keys or activity events.

## Implementation subtasks (Luna Max)
1. Execution and persistence: entity, service, adapter reuse, idempotency, result polling/timeouts and callbacks. Service public methods: `catalog()`, `execute(input)`, `get(identifier)`, `completeCall(body)`. Dedicated folder `src/tools/testing/`.
2. HTTP and contracts: DTO runtime validation, controller/OpenAPI, module wiring, shared declaration file, API documentation and curl examples. Coordinate exact service inputs and filenames with subtask 1.
3. HTTP test subtask: real Nest HTTP tests for operator authentication, DTO validation, and callback-secret handling.
4. Root review and validation: check isolation and auth, test simulated/live adapter paths with mocks, validation and duplicate/callback failure cases. Run server tests, typecheck and build. No live messages or calls during implementation.

## Acceptance criteria
- Email and call tests work with no incident and leave an existing incident unchanged.
- Tests use the real provider adapters when explicitly requested and configured; simulated paths have no external effect.
- Test records remain separate from agent tool calls and callbacks cannot wake the incident agent.
- Auth, invalid payloads, unsupported tools, missing live configuration, provider errors, duplicate keys and late/duplicate callbacks have deterministic outcomes.
- Documentation includes copyable simulated email/call requests, explicit live examples and polling semantics.

## Completed validation

Implemented on `codex/tool-test-api` in the isolated `tool-test-api` worktree using three Luna Max subtasks. Root reviewed and corrected callback expiry, adapter completion races, configuration checks, and ambiguous failure reporting.

- Backend Biome lint and TypeScript checks pass.
- All 23 backend suites pass: 107 tests, including real local HTTP routes with in-memory persistence, incident isolation, concurrent duplicate requests, mocked provider acceptance/failure and callback ordering.
- NestJS build and `git diff --check` pass.
- No live provider messages/calls were sent. Real provider delivery and deployed database behavior remain unverified; persistence uses the repository's existing TypeORM entity auto-loading/schema synchronization setup.
- Usage examples are in `apps/server/docs/API-CURL-TEST-GUIDE.md`, under standalone tool checks.

## ElevenLabs compatibility update

- Integrate main's provider-neutral call adapter and supply explicit synthetic incident context.
- Persist selected provider and telephony references. Poll ElevenLabs on result GET, retain its complete evidence, and keep HappyRobot callbacks restricted to HappyRobot tests.
- Verify the actual ElevenLabs adapter with mocked provider HTTP responses; keep live credentials and delivery outside automated tests.

Validation after integrating main `e603231`: 107 tests across 23 suites, Biome, TypeScript, NestJS build and diff checks pass. A Luna Max subtask added real-adapter ElevenLabs tests with mocked HTTP; root added unified-mode and simulated-default regression checks.
