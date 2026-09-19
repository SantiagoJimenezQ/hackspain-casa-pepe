# Shared API contracts

NestJS is the only backend. Its authenticated API is rooted at `/api`, and its generated OpenAPI document is available at `/documentation` while the server is running. The checked-in declarations here describe the shared incident and simulation payloads consumed by the UI and agent.

- `incident.d.ts` describes the incident snapshot, harness events and demo controls.
- `simulation.d.ts` describes the seeded scenario configuration and stored clock state.
- `agent.d.ts` describes LLM decision activity events and public audit metadata.

The canonical endpoint reference is [`apps/server/docs/API.md`](../../apps/server/docs/API.md). The server's DTOs validate requests at runtime; these declarations are for consumers and must be updated with the DTOs when the API changes.

The former standalone HTTP server, old `/api/status` API, generated JSON OpenAPI copy, and duplicate in-memory harness have been removed. Seeded randomness now lives in `apps/server/src/scenarios/services/seeded-simulation.service.ts` and is persisted with each incident run.

- `tools.d.ts` describes the MVP tool names, incoming call reports/confirmations, communication receipts and status publications. Runtime validation for incoming calls lives in the NestJS DTOs.
