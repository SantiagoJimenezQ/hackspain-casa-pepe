# Contributing to Casa Pepe

Start with the [README](README.md), [architecture](Architecture.md) and the README in the folder you plan to change. The NestJS application is the only runtime backend; package folders describe shared contracts and extraction boundaries.

## Local workflow

1. Use Node.js 22+ and the root-pinned pnpm version. Install with `pnpm install --frozen-lockfile`.
2. Create a branch from current `main`. Keep unrelated local work separate.
3. Configure ignored local environment files with your own credentials and a dedicated database. Keep external integrations simulated unless you are deliberately testing a live adapter.
4. Update shared contracts before connecting components. Include architecture documentation when changing component boundaries, persistence, deployment or integration flows.
5. Test the behaviour that changed. Include stale-run results, plan invalidation, capacity limits and approval handling when they apply.

Run `pnpm run ci`, `pnpm --filter @casa-pepe/server build` and the recovery target tests documented in the root README before submitting a change. Database-backed checks and live provider rehearsals are separate from the default unit tests; describe exactly which validation you performed.

## Pull requests

Explain the problem, the resulting behaviour and how you verified it. For interface changes, include a screenshot using synthetic data. Identify any required configuration or migration, and keep the change focused enough to review.

Never include credentials, real call transcripts, personal contact details or raw provider responses in commits, logs, screenshots or test fixtures. Review your diff and scan outgoing content before pushing. See [SECURITY.md](SECURITY.md).
