# Casa Pepe architecture

The Next.js operator dashboard calls the NestJS API through server-side authenticated routes. NestJS owns incident state, planning, approvals and external tool adapters; PostgreSQL stores runs and their audit trail. Provider credentials remain in the backend. See [MASTER.md](MASTER.md) and the [backend README](apps/server/README.md) for the broader system.

## Inbound company priority calls

The dashboard shows each incident's six-digit `callCode` next to the inbound phone number from `HAPPYROBOT_INBOUND_PHONE_NUMBER`. HappyRobot answers first and asks the caller for this code. Its `vincular_incidente` tool posts the exact supplied code and the provider conversation identifier to `/api/webhooks/happyrobot/initiation`. `CompanyCallsModule` resolves the code (or a full incident/run ID), validates an active, unresolved, non-replay run and returns its canonical IDs and an opaque session reference. Unknown IDs can be corrected before binding; an existing conversation cannot switch incidents. There is no automatic selection or server-selected default run.

The submission tool repeats initiation with the same conversation and incident before using the returned session reference. This is an idempotent binding check, so the voice model never handles session credentials and a mismatched incident cannot redirect an outcome. HappyRobot's HTTP bodies use field tokens with `#` paths rather than interpolating a whole object.

After collecting the caller's request, HappyRobot posts the reference and a versioned `priority-request` outcome to `/api/webhooks/happyrobot/call-outcomes`. Both endpoints require the dedicated `x-casa-pepe-webhook-secret` header, configured with `CASA_PEPE_INBOUND_WEBHOOK_SECRET`. This is separate from HappyRobot's API key and outbound callback secret.

The server transaction locks the session and incident, persists the normalized outcome, appends an activity record and marks reassessment pending. Identical retries return the original receipt; conflicting retries are rejected. Exact full-name or short-name matches resolve a company; unknown or ambiguous names remain evidence requiring clarification. Requests cannot change capacity or grant approval.

After commit, an event asks `AgentService` to reassess the owning run. Every LLM observation includes the persisted company requests, so a new request changes the evidence fingerprint used to reject stale decisions. Existing dependency, resource and approval checks still gate actions. `GET /api/call-outcomes?runIdentifier=...` provides operator-authenticated evidence without exposing session references.

## Persistence and deployment

`company_call_sessions` lives in the backend-only `casa_pepe_private` schema. TypeORM migrations create that schema and a non-cycling sequence before entity synchronization creates tables/columns; the database role needs schema-creation permissions. Do not add this schema to Supabase's exposed Data API schemas. The new incident `callCode` column has a sequence-backed database default and a unique index. Adding it backfills existing incidents; new incidents and replays receive new numbers. Six-digit codes accept a space or hyphen between the two groups of three. Codes are lookup references, never authorization. The sequence fails at exhaustion rather than recycling an old code. Rollbacks must preserve the sequence and issued codes; disable destructive entity synchronization when reverting to an older application schema.

Conversation binding uses PostgreSQL transaction-scoped advisory locks. Receipt, audit and pending work are committed together. Activity sequence reservation coordinates with existing writers in one process; the application's existing sequence cache and coordinator still assume one active process and do not provide distributed ordering.

A ten-second interval retries pending reassessments, with a sixty-second claim lease to reduce duplicate work. Completed cycles mark the request observed; failed or skipped cycles remain pending, and reset/recovered runs become stale. Observation is not a promise that the requested priority was approved or executed.

The pending obligation survives restarts, but its dispatcher runs inside NestJS. Vercel can suspend the process after responding: unattended progress requires a continuously running backend or a durable external worker. This change does not introduce a distributed job runner. The deployment, provider workflow publication and an actual inbound phone rehearsal remain separate verification steps.

See [the inbound API guide](apps/server/docs/HAPPYROBOT-INBOUND.md) for payloads, errors and setup.
