# Security and deployment boundaries

Casa Pepe is a hackathon prototype. Its defaults simulate external actions; live integrations require explicit server-side configuration.

## Credentials and data

- Keep database URLs, API keys, webhook secrets and model credentials in ignored environment files or your deployment's secret store.
- Commit only placeholder configuration. Never put backend credentials in `NEXT_PUBLIC_*` variables.
- Use synthetic contacts and incident data in tests and screenshots. Call records, transcripts and inbound email can contain personal information.
- If a secret is exposed, revoke or rotate it at the provider. Removing it from the latest commit does not remove it from Git history or external copies.

## Hosting

The Next.js proxy hides the backend key, and anonymous session tokens scope incident ownership. Neither is a user-account system or an access gate for a public deployment. Restrict operator access and configure provider spending limits before sharing an interactive deployment widely.

Run one continuously available coordinator. Use a dedicated database, back up before upgrades, and leave `BROWSER_SESSION_SCHEMA_UPGRADE=false` during normal operation. The application accesses Postgres directly; browser clients do not need Supabase Data API access to its tables. Review RLS and grants as described in [Supabase setup](apps/server/docs/SUPABASE.md).

Voice provider callbacks are disabled, and calls always use simulation. Other integration callbacks retain provider-specific authentication. Simulated voice permissions remain test evidence, not plan-specific operator approval.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature if it is enabled for this repository. Otherwise, open an issue requesting a private reporting channel without including exploit details, credentials or personal data. Do not post sensitive findings in a public issue or pull request.

This project has no formal security support SLA or production-readiness guarantee.
