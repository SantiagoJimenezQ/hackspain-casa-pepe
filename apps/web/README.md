# Casa Pepe operations dashboard

The dashboard is the operator interface for the deployed Casa Pepe backend. It has no mock-data fallback: an unavailable or unconfigured API produces an explicit connection screen.

## Configure

Copy the example file and use the team deployment values:

```bash
cp .env.example .env.local
```

`CASA_PEPE_API_BASE_URL` may be either the deployment origin or its `/api` URL, with or without a trailing slash. `CASA_PEPE_API_KEY` stays server-side in Next.js; it is never sent to the browser.

## Run

From the repository root:

```bash
pnpm --filter web dev --port 3001
```

Open `http://localhost:3001`. The dashboard opens in a ready state; start the Spanish scenario from the main screen or the **Demo** controls (`D`). The controls run: start → impact → capacity twist → operator/agent decision cycle → approval → recovery and verification.

## Live updates

The interface fetches the canonical `/overview` snapshot, then proxies the authenticated SSE activity stream through its own `/api/casa-pepe/activity/stream` route. Events appear instantly and trigger a debounced snapshot reconciliation.

The agent panel reconstructs each public model turn from `agent.llm-output` fragments and the completed `LlmPublicTurn` payload on `agent.llm-decision`, `agent.llm-rejected`, `agent.llm-stale`, and `agent.llm-failed`. Full assistant text lives in `payload.text` (the activity `summary` is only a preview). Proposed tool calls, redaction, and disposition (`pending` → `accepted` / `rejected` / `stale` / `incomplete`) are shown on the turn; executed tools remain separate rows.

History older than the live 100-event window is loaded through the authenticated `GET /activity/llm` cursor and merged by `outputIdentifier`. Live typing still requires `LLM_STREAM_OUTPUT=true` on the backend; without it the turn appears when the completed record arrives.

The dashboard renders the backend’s actual incident, services, capacity, plan, approvals, calls, tools, tasks, activity, learning insights, and current run report.

The top bar’s **Borrar aprendizajes** button deletes all saved learning insights through the authenticated API and shows the number removed. It leaves the current incident and its existing plans intact. Use **Reiniciar** afterwards to start a fresh run without prior learning; the run may accumulate new lessons as it progresses.
