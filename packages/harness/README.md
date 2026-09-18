# Simulation harness boundary

The NestJS application in `apps/server/` is the only runtime backend. The scenario harness now lives in `apps/server/src/scenarios/services/seeded-simulation.service.ts`, where it can persist seed and draw counters with the incident run and notify the agent through the existing domain events.

`packages/harness/` remains the documented ownership boundary for simulation work, while its former duplicate HTTP implementation has been removed. Add reusable scenario primitives here only when they are consumed by the NestJS harness; do not introduce a second server or a second response contract.

The agent still owns recovery decisions. Seeded randomness changes the environment's capacity, recovery outcome and possible secondary fault; it never chooses a company or action for the agent.

See [the server API reference](../../apps/server/docs/API.md), [`packages/contracts/simulation.d.ts`](../contracts/simulation.d.ts), and the NestJS service tests for the current behavior.
