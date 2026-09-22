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

The interface fetches the canonical `/overview` snapshot, then proxies the authenticated SSE activity stream through its own `/api/casa-pepe/activity/stream` route. Events appear instantly and trigger a debounced snapshot reconciliation. Visible tabs also reconcile every five seconds to detect changes made by another tab or API instance. Reconciliation sends the last overview `revision`; an unchanged response preserves the displayed snapshot and skips loading its large database payloads. Operator actions and initial loads request full snapshots.

The agent panel reconstructs each public model turn from `agent.llm-output` fragments and the completed `LlmPublicTurn` payload on `agent.llm-decision`, `agent.llm-rejected`, `agent.llm-stale`, and `agent.llm-failed`. Full assistant text lives in `payload.text` (the activity `summary` is only a preview). Proposed tool calls, redaction, and disposition (`pending` → `accepted` / `rejected` / `stale` / `incomplete`) are shown on the turn; executed tools remain separate rows.

History older than the live 100-event window is loaded through the authenticated `GET /activity/llm` cursor and merged by `outputIdentifier`. Live typing still requires `LLM_STREAM_OUTPUT=true` on the backend; without it the turn appears when the completed record arrives.

The dashboard renders the backend’s actual incident, services, capacity, plan, approvals, calls, tools, tasks, activity, learning insights, and current run report.

The top bar’s **Borrar aprendizajes** button deletes this browser session’s saved learning insights through the authenticated API and shows the number removed. It leaves the current incident and its existing plans intact. Use **Reiniciar** afterwards to start a fresh run without prior learning; the run may accumulate new lessons as it progresses.

The top bar’s **Aprendizajes** button opens a read-only panel with saved lesson summaries, subjects, observation counts, and update dates. It reloads on opening; **Actualizar** fetches lessons recorded during the current run. Loading failures are shown separately from an empty memory. The list uses the same Spanish scenario filter as the existing learning endpoint; **Borrar aprendizajes** still clears all scenarios.

## Inbound incident calls

The incident header displays the persisted six-digit call code beside a dial link for the configured HappyRobot inbound number. Read that code to the voice agent to select the exact incident before requesting a company priority. Old API responses without a code or number show an unavailable state rather than inventing values.

## Browser identity

The first page response sets a random HttpOnly session cookie. All tabs in the
same browser profile share the active run and learning; other profiles/devices
are independent. Refresh resumes the current run. Clearing cookies or using a new
private session starts a separate history. The cookie expires after 30 days.

The Next.js proxy forwards this identity server-side. Old localStorage run IDs are
ignored. Visible tabs reconcile the active run every five seconds so a reset in
another tab is reflected and its activity stream reconnects. Opening any dashboard
page directly creates the cookie; calling an API without first opening a page
returns 401. Deploy alongside the matching backend ownership changes.

The top bar’s **Aprendizajes** button opens a read-only panel with saved lesson summaries, subjects, observation counts, and update dates. It reloads on opening; **Actualizar** fetches lessons recorded during the current run. Loading failures are shown separately from an empty memory. The list uses the same Spanish scenario filter as the existing learning endpoint; **Borrar aprendizajes** still clears all scenarios within this browser session.
