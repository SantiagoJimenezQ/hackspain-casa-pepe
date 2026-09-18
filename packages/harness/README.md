# Simulation harness

The harness owns the simulated environment. Recovery decisions belong to the agent; the harness does not prescribe which company to migrate or where.

- `index.mjs`: run lifecycle, events, guards, clock and command dispatch.
- `dashboard.mjs`: region/company health, hosting slots, migrations and derived totals.
- `random.mjs`: validated scenario config and independent seeded random streams.

`createHarness()` returns `snapshot()`, `apply(command, body)` and `clockTick()`. Snapshot reads are passive. `clockTick()` is a no-op while paused or without an active incident; the HTTP server schedules it approximately once per second. Explicit `advance` processes integer simulated minutes even while paused.

The original manual fixture remains the default. Randomized mode samples initial spare backup capacity and migration duration/failure, and can inject one secondary fault during recovery. Same config, implementation version, actions and ticks reproduce outcomes; UUIDs and real timestamps differ. Separate random streams prevent polling from affecting the future.

Read [API.md](../../apps/server/API.md) for complete rules and control contracts. Tests run from the repository root with `npm test`; they cover state transitions, resource limits, failures, seeded replay, clock behavior and reset isolation. There are no real AWS actions or agent decisions here.
