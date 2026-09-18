# Casa Pepe dummy AWS API

Run from the repository root with Node.js 22+:

```sh
npm run dev:server
npm test
```

The API listens on `http://127.0.0.1:4000`. No dependencies or AWS credentials are required. It provides company/region health, migration state, impact totals and an event history for the UI.

**For implementation, start with [API.md](API.md).** It documents every endpoint, request/response schema, state transition, error, concurrency rule, randomization rule and a complete workflow.

- [OpenAPI specification](../../packages/contracts/openapi.json), also at `/api/openapi.json`.
- [Shared TypeScript contracts](../../packages/contracts/status.d.ts).
- [Runnable client](demo-client.mjs): `npm run demo:api` against a running server. This resets the demo.

Default startup and `reset {}` preserve the manual fixture. Reset with `{"mode":"randomized","seed":42}` to vary capacity and migration outcomes. The clock starts paused; use advance for reproducible tests or resume for live simulation. The harness models the environment; the agent owns recovery decisions.

The server is local and in memory, with simulated data only. `PORT` changes its port; `UI_ORIGIN` changes the allowed browser origin (default `http://localhost:3000`).
