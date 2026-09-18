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
| Operations dashboard | Implemented with local mock data and demo controls |
| Backend | NestJS API with incident state, simulation controls, recovery planning, approvals, and activity records |
| Simulation | Manual incident flow in NestJS; reproducible randomized runs in the earlier standalone harness |
| Engineer contact | Simulated mode and a HappyRobot adapter |
| Recovery | Simulated mode and an HTTP adapter for a test environment |
| Dashboard–backend integration | Pending |

The backend currently uses rule-based recovery prioritization. Engineer calls and recovery actions default to simulated mode; live integrations require configuration and end-to-end validation.

## Run locally

### Dashboard

From the repository root:

```bash
pnpm install
pnpm --filter web dev --port 3001
```

Open http://localhost:3001.

The dashboard runs independently with mock data. Use the **Demo** button or press **D** to open its controls.

### Backend

In a separate terminal:

```bash
cd apps/server
pnpm install
cp .env.example .env.local
```

Configure the local environment, then start Postgres and the API:

```bash
docker compose up -d
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
  harness/      Standalone simulation harness
  agent/        Decision-making package boundary
  tools/        Integration adapter package boundary
demo/           Demo planning and presentation materials
```

The incident coordination runtime lives in `apps/server`. An earlier standalone simulation remains in `packages/harness` and `apps/server/index.mjs`. The agent and tools package folders document the intended separation of responsibilities.

The dashboard is intended to integrate through the API and shared contracts. Credentials and external integrations belong on the server.

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
