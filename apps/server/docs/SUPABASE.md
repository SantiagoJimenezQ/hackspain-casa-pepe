# PostgreSQL and Supabase setup

Casa Pepe uses TypeORM over a direct PostgreSQL connection. It does not use a Supabase browser client, Supabase Auth or a publishable API key. All database credentials belong in the backend environment.

## Connect your own database

1. Open your project's **Connect** dialog in Supabase and select **Session pooler** (port 5432).
2. Copy the exact URI supplied for your project. Replace the password placeholder with the database password, URL-encoding special characters.
3. Set `SUPABASE_DATABASE_URL` in the ignored `apps/server/.env.local`, or in your backend host's secret settings. Never paste a working URI into a commit, issue or screenshot.

```dotenv
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@<session-pooler-host>:5432/postgres
BROWSER_SESSION_SCHEMA_UPGRADE=false
DATABASE_POOL_MAXIMUM=5
```

Use the host from the dashboard rather than constructing one from a region name. Session pooling supports a persistent backend on IPv4 networks. A direct connection is also suitable when the host can reach it; transaction pooling has different connection semantics and needs its own validation. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The prototype enables TLS for Supabase hosts, but currently disables certificate verification in the TypeORM connection options. Use a verified certificate configuration before treating the deployment as production-ready.

## Initialize an empty project

On a dedicated empty database, start one backend with `BROWSER_SESSION_SCHEMA_UPGRADE=true`. Startup runs the registered migrations, creates the private call-session schema and incident-code sequence, and synchronizes entity metadata. After successful startup, stop the process, set the flag back to `false`, and restart.

For an existing database, stop older backends and take a backup first. The ownership migration isolates historical data as legacy and deactivates historical active runs. Never enable the flag on a preview that shares a database with another deployment.

## Keep application records out of the browser Data API

The NestJS API enforces run ownership and approvals. The browser should not bypass it by querying the application's tables through Supabase REST or GraphQL.

After initialization, run [supabase-access.sql](supabase-access.sql) through an administrative connection. It enables RLS and revokes `PUBLIC`, `anon` and `authenticated` access to the named application tables and their sequences. The default `postgres` owner connection used by this prototype continues to work. A separate restricted runtime role needs explicit grants and matching RLS policies; do not use an anonymous API credential as the database connection.

There are deliberately no browser RLS policies. Supabase may report **RLS Enabled No Policy** as an informational notice; this matches the server-only access model. Do not resolve it by granting anonymous access. See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Recheck these controls after schema upgrades, especially when adding new tables. The SQL file targets Casa Pepe's tables rather than unrelated tables in `public`.

## Verify the application connection

1. Start the API with schema upgrades disabled.
2. Confirm `GET /api/health` reports a healthy database.
3. Open the dashboard and start a fresh run; reload to confirm persistence.
4. With your own LLM credentials configured, trigger the outage and inspect the agent's response.
5. Rehearse the capacity change, revised approval and independent recovery verification.

An MCP SQL query verifies database access through MCP. It does not prove that a local process or deployed backend has the correct URI, password or network access. Model health and live voice/email delivery are separate checks.
