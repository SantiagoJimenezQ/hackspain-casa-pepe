# Casa Pepe

When a cloud region goes down, what do you recover first?

Casa Pepe is an incident coordination prototype built for HackSpain 2026. It models a changing outage, prioritizes recovery with limited resources, coordinates the response, and keeps an operator in control.

## The scenario

A meteorite takes down the AWS region serving a delivery company. Route assignment stops, package tracking becomes unavailable, and several services need recovery.

The initial plan assumes enough backup capacity to restore everything. Then new information arrives: there is less capacity than expected.

The coordinator must revise its plan, explain what gets recovered first, and make clear what has to wait.

## The response loop

1. **Observe:** collect service health, dependencies, available capacity, and updates from engineers.
2. **Prioritize:** rank recovery work by business impact and dependencies, within the available resources.
3. **Coordinate:** assign owners, contact the on-call engineer, and request operator approval for risky actions.
4. **Execute and verify:** run recovery actions and check their results before reporting success.
5. **Adapt:** revise the plan when conditions change and supersede approvals tied to an outdated plan.

Events, decisions, tool calls, approvals, and results are recorded so the response can be reconstructed.

## Current status

This is a hackathon prototype under active development.

| Component | Status |
|---|---|
| Operations dashboard | Live Next.js dashboard backed by `/api/overview` and the activity SSE stream |
| Backend | NestJS API with incident state, simulation controls, recovery planning, approvals, and activity records |
| Simulation | Manual and seeded randomized runs in NestJS, with the seed and draw state persisted per run |
| Engineer contact | Simulated mode, ElevenLabs/HappyRobot adapters, and operator-confirmed incoming reports |
| Recovery | Simulated mode and an HTTP adapter for a test environment |
| Learning | Persisted capacity and recovery-outcome insights, plus per-run reports |
| Dashboard–backend integration | Implemented through authenticated Next.js server-side proxy routes |

The backend currently uses rule-based recovery prioritization. Engineer calls and recovery actions default to simulated mode; live integrations require configuration and end-to-end validation.

## Architecture

Casa Pepe is a pnpm monorepo. `apps/server` is the only runtime backend: it owns the NestJS API, incident harness, agent cycle, persistence, authorization, tool execution, and integration callbacks. `apps/web` is the Next.js operator dashboard. Its server-side routes add the backend API key and proxy JSON requests and the activity stream, so the key is never sent to the browser.

The runtime response path is:

```text
harness event or provider callback
        -> persisted incident state
        -> domain event
        -> AgentService decision cycle
        -> versioned plan and tool calls
        -> approval, communication, engineer call, or recovery adapter
        -> activity log and updated state
        -> SSE stream and signed webhooks
        -> operations dashboard
```

The main backend boundaries are:

- `scenarios` and `incidents`: scenario definitions, live runs, manual controls, and seeded randomized simulation.
- `agent`, `plans`, `approvals`, and `tasks`: rule-based prioritization, plan versions, human gates, ownership, and replanning.
- `tools`, `engineers`, and `recovery`: the tool registry, idempotent tool-call records, simulated/live adapters, asynchronous callbacks, and independent verification.
- `activity`, `webhooks`, `learning`, and `replays`: audit history, live delivery, cross-run insights, reports, and reproducible replays.

PostgreSQL/Supabase is accessed through TypeORM. The incident snapshot and simulation state are persisted with each run; plans, approvals, tasks, tool calls, activities, calls, recoveries, insights, and webhook deliveries have their own entities. The current hackathon setup uses TypeORM schema synchronization rather than migrations. The declarations in `packages/contracts` describe consumer-facing payloads. `packages/tools` contains server-only HTTP/email adapters, while `packages/agent` and `packages/harness` document ownership boundaries rather than starting separate runtimes.

## Run locally

### Dashboard

From the repository root:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm --filter web dev --port 3001
```

Open http://localhost:3001.

Set `CASA_PEPE_API_BASE_URL` and `CASA_PEPE_API_KEY` in `apps/web/.env.local`. The dashboard has no mock-data fallback: if the API is not configured or reachable, it shows a connection state. Use the **Demo** button or press **D** to open its controls.

### Backend

In a separate terminal:

```bash
cd apps/server
pnpm install
cp .env.example .env.local
```

Configure `API_KEY` and `SUPABASE_DATABASE_URL` in `.env.local`, then start the API:

```bash
pnpm develop
```

The API runs at http://localhost:3000/api, with interactive documentation at http://localhost:3000/documentation.

See the [backend setup guide](apps/server/README.md) for authentication, environment variables, integration modes, and demo commands.

## Demo flow

The intended end-to-end demonstration follows this sequence:

1. Start with healthy services.
2. Trigger the regional outage.
3. Inspect the recovery plan and its reasoning.
4. Contact an engineer to confirm recovery constraints.
5. Introduce a reduction in backup capacity.
6. Compare the revised priorities with the original plan.
7. Approve or reject a proposed recovery action.
8. Verify the result and review what remains unavailable.

The simulation controls are separate from operator decisions. Simulated actions and replayed events are explicitly identified.

## Repository structure

```text
apps/
  web/          Next.js operations dashboard
  server/       NestJS API, simulation, planning, and execution
packages/
  contracts/    Shared payload definitions
  harness/      Reusable simulation boundary
  agent/        Decision-making package boundary
  tools/        Integration adapter package boundary
demo/           Demo planning and presentation materials
```

The incident coordination runtime lives in `apps/server`, including the persisted simulation state and seeded environment behavior. `packages/harness` documents the reusable simulation boundary; it does not start a second server. The agent and tools package folders document the intended separation of responsibilities.

The dashboard integrates through Next.js server routes, the authenticated NestJS API, and its SSE activity stream. Credentials and external integrations belong on the server.

## Development

- Agree on shared contracts before connecting components.
- Make priorities, ownership, resource constraints, and plan changes visible.
- Test changes to prioritization, replanning, and human intervention.
- Keep external actions behind adapters with deterministic simulation modes.
- Never commit credentials. Use ignored local environment files and placeholder-only examples.

## Project documentation

- [Master plan](MASTER.md)
- [Dashboard guide](apps/web/README.md)
- [Backend guide](apps/server/README.md)
- [API reference](apps/server/docs/API.md)
- [Shared contracts](packages/contracts/)
- [Demo planning](demo/README.md)
- [Official HackSpain 2026 challenge](https://hackspain2026.happyrobot.ai/)

The canonical API is NestJS. It exposes `/documentation`, supports reproducible manual and randomized runs through `POST /api/demo/start`, and provides `/api/demo/pause`, `/api/demo/resume`, and `/api/demo/advance` for simulation control.

Outbound voice setup and provider switching: [ElevenLabs guide](apps/server/docs/ELEVENLABS.md).
