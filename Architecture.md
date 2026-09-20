# Casa Pepe architecture

The Next.js operator dashboard calls the NestJS API through server-side authenticated routes. NestJS owns incident state, planning, approvals and external tool adapters; PostgreSQL stores runs and their audit trail. Provider credentials remain in the backend. See [MASTER.md](MASTER.md) and the [backend README](apps/server/README.md) for the broader system.

## Inbound company priority calls

HappyRobot's inbound workflow first posts its conversation identifier to `/api/webhooks/happyrobot/initiation`. `CompanyCallsModule` binds that conversation to exactly one active, unresolved, non-replay run and returns an opaque session reference. `HAPPYROBOT_INBOUND_RUN_IDENTIFIER` optionally selects the run on the server when several are active. A reset never transfers an existing conversation to another run.

After collecting the caller's request, HappyRobot posts the reference and a versioned `priority-request` outcome to `/api/webhooks/happyrobot/call-outcomes`. Both endpoints require the dedicated `x-casa-pepe-webhook-secret` header, configured with `CASA_PEPE_INBOUND_WEBHOOK_SECRET`. This is separate from HappyRobot's API key and outbound callback secret.

The server transaction locks the session and incident, persists the normalized outcome, appends an activity record and marks reassessment pending. Identical retries return the original receipt; conflicting retries are rejected. Exact full-name or short-name matches resolve a company; unknown or ambiguous names remain evidence requiring clarification. Requests cannot change capacity or grant approval.

After commit, an event asks `AgentService` to reassess the owning run. Every LLM observation includes the persisted company requests, so a new request changes the evidence fingerprint used to reject stale decisions. Existing dependency, resource and approval checks still gate actions. `GET /api/call-outcomes?runIdentifier=...` provides operator-authenticated evidence without exposing session references.

## Persistence and deployment

`company_call_sessions` lives in the backend-only `casa_pepe_private` schema. A TypeORM migration creates that schema before the existing entity synchronization creates the table; the database role needs schema-creation permissions. Do not add this schema to Supabase's exposed Data API schemas. A rollback retains the schema and evidence rather than dropping data.

Conversation binding uses PostgreSQL transaction-scoped advisory locks. Receipt, audit and pending work are committed together. Activity sequence reservation coordinates with existing writers in one process; the application's existing sequence cache and coordinator still assume one active process and do not provide distributed ordering.

A ten-second interval retries pending reassessments, with a sixty-second claim lease to reduce duplicate work. Completed cycles mark the request observed; failed or skipped cycles remain pending, and reset/recovered runs become stale. Observation is not a promise that the requested priority was approved or executed.

The pending obligation survives restarts, but its dispatcher runs inside NestJS. Vercel can suspend the process after responding: unattended progress requires a continuously running backend or a durable external worker. This change does not introduce a distributed job runner. The deployment, provider workflow publication and an actual inbound phone rehearsal remain separate verification steps.

See [the inbound API guide](apps/server/docs/HAPPYROBOT-INBOUND.md) for payloads, errors and setup.
