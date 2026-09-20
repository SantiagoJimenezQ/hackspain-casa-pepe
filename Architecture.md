# Casa Pepe architecture

The Next.js operator dashboard calls the NestJS API through server-side authenticated routes. NestJS owns incident state, planning, approvals and external tool adapters; PostgreSQL stores runs and their audit trail. Provider credentials remain in the backend. See [MASTER.md](MASTER.md) and the [backend README](apps/server/README.md) for the broader system.

## Inbound company priority calls

The dashboard shows each incident's six-digit `callCode` next to the inbound phone number from `HAPPYROBOT_INBOUND_PHONE_NUMBER`. HappyRobot answers first and asks the caller for this code. Its `vincular_incidente` tool posts the exact supplied code and the provider conversation identifier to `/api/webhooks/happyrobot/initiation`. `CompanyCallsModule` resolves the code (or a full incident/run ID), validates an active, unresolved, non-replay run and returns its canonical IDs and an opaque session reference. Unknown IDs can be corrected before binding; an existing conversation cannot switch incidents. There is no automatic selection or server-selected default run.

The submission tool repeats initiation with the same conversation and incident before using the returned session reference. This is an idempotent binding check, so the voice model never handles session credentials and a mismatched incident cannot redirect an outcome. HappyRobot's HTTP bodies use field tokens with `#` paths rather than interpolating a whole object.

After collecting the caller's request, HappyRobot posts the reference and a versioned `priority-request` outcome to `/api/webhooks/happyrobot/call-outcomes`. Both endpoints require the dedicated `x-casa-pepe-webhook-secret` header, configured with `CASA_PEPE_INBOUND_WEBHOOK_SECRET`. This is separate from HappyRobot's API key and outbound callback secret.

The server transaction locks the session and incident, persists the normalized outcome, appends an activity record and marks reassessment pending. Identical retries return the original receipt; conflicting retries are rejected. Exact full-name or short-name matches resolve a company; unknown or ambiguous names remain evidence requiring clarification. Requests cannot change capacity or grant approval.

After commit, an event asks `AgentService` to reassess the owning run. Every LLM observation includes the persisted company requests, so a new request changes the evidence fingerprint used to reject stale decisions. Existing dependency, resource and approval checks still gate actions. `GET /api/call-outcomes?runIdentifier=...` provides evidence authenticated by both operator API key and the owning browser session without exposing session references.

## Persistence and deployment

`company_call_sessions` lives in the backend-only `casa_pepe_private` schema. During an explicit upgrade with `BROWSER_SESSION_SCHEMA_UPGRADE=true`, TypeORM migrations create that schema and a non-cycling sequence before entity synchronization creates tables/columns; the database role needs schema-creation permissions. Do not add this schema to Supabase's exposed Data API schemas. The new incident `callCode` column has a sequence-backed database default and a unique index. Adding it backfills existing incidents; new incidents and replays receive new numbers. Six-digit codes accept a space or hyphen between the two groups of three. Codes are lookup references, never authorization. The sequence fails at exhaustion rather than recycling an old code. Rollbacks must preserve the sequence and issued codes; disable destructive entity synchronization when reverting to an older application schema.

Conversation binding uses PostgreSQL transaction-scoped advisory locks. Receipt, audit and pending work are committed together. Activity sequence reservation coordinates with existing writers in one process; the application's existing sequence cache and coordinator still assume one active process and do not provide distributed ordering.

A ten-second interval retries pending reassessments, with a sixty-second claim lease to reduce duplicate work. Completed cycles mark the request observed; failed or skipped cycles remain pending, and reset/recovered runs become stale. Observation is not a promise that the requested priority was approved or executed.

The pending obligation survives restarts, but its dispatcher runs inside NestJS. Vercel can suspend the process after responding: unattended progress requires a continuously running backend or a durable external worker. This change does not introduce a distributed job runner. The deployment, provider workflow publication and an actual inbound phone rehearsal remain separate verification steps.

See [the inbound API guide](apps/server/docs/HAPPYROBOT-INBOUND.md) for payloads, errors and setup.

## Runtime and deployment

The Next.js dashboard proxies JSON and server-sent events to the NestJS backend with a server-only API key. NestJS owns incident simulation, agent cycles, plans, approvals, tool adapters and audit records. TypeORM persists snapshots and related records in Supabase PostgreSQL. Browser code never connects directly to the database or receives integration credentials.

Run **one continuously running NestJS process** for concurrent anonymous demos. Its scheduler already enumerates active runs, and per-run cycle state serializes agent work within that process. Next.js can remain on Vercel. This change does not add distributed leases, durable jobs or cross-instance SSE delivery; several Vercel backend instances sharing a database are not a reliable coordinator deployment. The database lock described below protects run replacement, not all external effects.

## Anonymous browser ownership

On the first document request, the Next.js proxy creates a cryptographically random 32-byte token in an HttpOnly, SameSite=Lax cookie (Secure over HTTPS). The cookie lasts 30 days. API requests without a cookie fail rather than creating competing identities. Refreshing or opening another tab in the same browser profile shares the cookie; another profile/private session/device receives another token. Clearing cookies loses access to that browser's history; there is no account recovery or sharing mechanism.

Next.js reads the cookie on the server and forwards `X-Casa-Pepe-Session` together with its API key. It replaces any supplied session header and rejects cross-origin mutations. The backend hashes the token with SHA-256 and uses the digest as `browserSessionId`. The token is a bearer capability; it is not returned in incident payloads or stored in the database.

A global guard checks the API key, session shape, explicit run identifiers, and ownership of record-by-ID routes before controllers run or SSE headers open. A request-scoped AsyncLocalStorage context carries the session through the existing singleton services without making the agent request-scoped. RunsService scopes current-run lookup, history, and explicit run access. Background ticks and signed callbacks continue to use explicit run IDs; learning derives its owner from that persisted run rather than an ambient browser request.

## State and concurrency

`incidents.browserSessionId` owns the run. Plans, tasks, approvals, calls, activity and tool executions retain their existing run identifiers, through which HTTP access is authorized. Learning has its own session column because it intentionally spans multiple runs of the same browser. Its unique key includes session, scenario, insight kind and subject.

Starting or resetting a browser's run takes a transaction-scoped PostgreSQL advisory lock for that session, retires its previous active run, and inserts its replacement in the same transaction. A partial unique index provides an additional one-active-run-per-browser constraint. Other browsers remain active. Post-commit deactivation events clear the old run's in-process cycle state; existing stale-run checks reject late integration results.

SSE always filters backlog and live events to the authorized run, including when callers omit a run query. The dashboard asks for its cookie-scoped current run, ignores old localStorage run identities, reconciles every five seconds while visible, and reconnects when the run changes. This lets another tab observe a reset without broadcasting other runs into its old stream. Replay progress is held per session; playback remains process-local.

## Integration boundaries

Signed voice/recovery callbacks resolve persisted call/action/run identifiers and do not need a browser cookie. Incoming phone reports already require an explicit run identifier. Uncorrelated inbound email is stored as `unassigned`, never attached to whichever browser ran most recently. Deliberately published customer-safe status is available only with an explicit `runIdentifier`; the bare public status endpoint returns no publication.

The included HTTP recovery target already namespaces recovery and verification by run. Custom targets must honor the same contract. Live email and phone adapters still use deployment-configured contacts and provider budgets: independent incident state does not create separate phone numbers, recipients or provider accounts.

Standalone tool checks, model diagnostics, and webhook subscription/delivery administration remain API-key-only administrator endpoints. Browser sessions are rejected there. Administrator-configured outbound subscriptions deliberately receive deployment-wide events; they are not available for anonymous visitors to configure.

## Migration and tradeoffs

With `BROWSER_SESSION_SCHEMA_UPGRADE=true`, the startup TypeORM migration adds ownership columns, labels existing records `legacy`, retires historical active runs, and replaces the global learning uniqueness rule. Historical data remains in the database but is not claimable through a browser token. On an empty database, the same explicit flag enables TypeORM synchronization to create the schema from the updated entities. Both migration execution and synchronization are disabled by default, so PR previews cannot alter the shared schema. The migration is recorded and is not a destructive cleanup. Automatic rollback is intentionally refused because removing ownership would merge private histories.

Back up the database and stop the previous backend. Start exactly one upgraded backend with `BROWSER_SESSION_SCHEMA_UPGRADE=true`, verify its health and owned runs, then unset the flag (or set it to false) and restart. Deploy the matching frontend. Do not enable the upgrade flag in preview environments connected to shared Supabase. Mixed old/new servers must not run against the upgraded schema: the old application still has global selection and prototype schema synchronization enabled. No migration is applied to shared Supabase merely by running the unit tests.

This intentionally small design avoids accounts, a workspace table and a queue service. Browser possession provides isolation, not individual user authentication or protection against abuse of a publicly accessible paid demo. Deployment access controls and provider budgets remain operational concerns. Durable scheduling, shared browser workspaces, automatic history cleanup and multi-process coordination are deferred.

## Verification

`pnpm ci` runs the normal frontend/backend checks. The opt-in PostgreSQL suites exercise real HTTP ownership checks, concurrent start/reset, foreign record rejection, learning isolation, streams, signed callbacks and legacy schema migration:

```sh
BROWSER_SESSION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/browser_session_test pnpm --filter @casa-pepe/server test --runInBand browser-session
```

Use a dedicated disposable local database whose name includes `test`; the suite refuses remote hosts. No model or provider request is made. These checks establish application and database isolation, not live provider delivery or production hosting reliability.
