# Casa Pepe operations dashboard

The dashboard is the operator interface for the deployed Casa Pepe backend. It has no mock-data fallback: an unavailable or unconfigured API produces an explicit connection screen.

## Configure

Copy the example file and use the team deployment values:

```bash
cp .env.example .env.local
```

`CASA_PEPE_API_BASE_URL` may be either the deployment origin or its `/api` URL. `CASA_PEPE_API_KEY` stays server-side in Next.js; it is never sent to the browser.

## Run

From the repository root:

```bash
pnpm --filter web dev --port 3001
```

Open `http://localhost:3001`. The dashboard opens in a ready state; start the Spanish scenario from the main screen or the **Demo** controls (`D`). The controls run: start → impact → capacity twist → operator/agent decision cycle → approval → recovery and verification.

## Live updates

The interface fetches the canonical `/overview` snapshot, then proxies the authenticated SSE activity stream through its own `/api/casa-pepe/activity/stream` route. Events appear instantly and trigger a debounced snapshot reconciliation.

The dashboard renders the backend’s actual incident, services, capacity, plan, approvals, calls, tools, tasks, activity, learning insights, and current run report.
