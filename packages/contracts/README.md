# Shared API contracts

The dummy API contract is implemented and ready for UI/agent consumers:

- `status.d.ts`: complete snapshot and legacy service commands.
- `dashboard.d.ts`: regions, companies, migration state and commands.
- `simulation.d.ts`: scenario config, clock state, concurrency guards.
- `openapi.json`: OpenAPI 3.1 document, served by `GET /api/openapi.json`.
- `generate-openapi.mjs`: maintained schema source; run `npm run docs:generate` after edits.
- `status.example.json`, `status.incident.example.json`, `status.randomized.example.json`: complete response fixtures.

Read [the API integration guide](../../apps/server/API.md) for endpoints, errors, state transitions, replay semantics and client examples. All POST payloads accept the optional `CommandGuard` fields. Successful commands return a complete `StatusSnapshot`.

Contracts contain no credentials or UI/provider dependencies. Keep examples, declarations, schema and runtime behavior aligned when changing an endpoint. `npm test` includes reference/example checks and response-shape smoke tests.

Agent-owned plans, tool calls and operator approvals are not implemented in this contract yet. Static company priorities and the simulated activity indicator must not be presented as real agent decisions.
