# Deploying the API on Railway

The API must run as a long-lived process: the agent cycles take up to a few minutes, the
simulation clock and the ElevenLabs call polling run on intervals, and approvals expire on a
timer. Serverless functions freeze between requests, so the impact appears to hang there.
Railway (or Render, Fly, any Docker host) keeps the process alive. The web app can stay on
Vercel; only its `CASA_PEPE_API_BASE_URL` changes.

## 1. Create the service

1. In Railway: New Project, Deploy from GitHub repo, pick this repository and the branch to deploy.
2. Root directory: leave the repository root. Railway detects `railway.toml` and builds with the
   root `Dockerfile`.
3. Settings, Networking, Generate Domain. Copy the public URL, for example
   `https://casa-pepe-api.up.railway.app`.

## 2. Variables

Settings, Variables, Raw Editor. Paste and fill:

```
ENVIRONMENT=production
PUBLIC_BASE_URL=https://<your-railway-domain>
SUPABASE_DATABASE_URL=<Supabase session pooler URI, port 5432>
DATABASE_POOL_MAXIMUM=5
API_KEY=<long random string, same value as the web app's CASA_PEPE_API_KEY>

# Engineer calls through ElevenLabs
ENGINEER_CALL_PROVIDER=elevenlabs
ENGINEER_CALL_MODE=live
ELEVENLABS_API_KEY=<key>
ELEVENLABS_AGENT_ID=<agent id>
ELEVENLABS_PHONE_NUMBER_ID=<phone number id>
DEMO_ENGINEER_NAME=Marta Ruiz
DEMO_ENGINEER_ROLE=Platform on-call engineer
DEMO_ENGINEER_PHONE=+34<verified number>

# HappyRobot stays configured for the inbound line
HAPPYROBOT_MODE=simulated
HAPPYROBOT_WEBHOOK_SECRET=<long random string>
RECOVERY_MODE=simulated
RECOVERY_WEBHOOK_SECRET=<long random string>

# LLM. One variable switches provider; each preset has its own credentials
LLM_PROVIDER=openai
LLM_OPENAI_API_KEY=<OpenAI key>
LLM_OPENAI_MODEL=gpt-5.6-luna
LLM_OPENAI_FAST_MODEL=gpt-5.4-nano
LLM_OPENAI_REASONING_EFFORT=none
LLM_REASONING_EFFORT=low
LLM_MAXIMUM_OUTPUT_TOKENS=32768
LLM_TIMEOUT_MILLISECONDS=120000
LLM_FAST_TIMEOUT_MILLISECONDS=8000
```

Railway sets `PORT` itself; do not define it. Leave `INCIDENT_EMAIL_MODE=simulated` unless
Resend is configured.

## 3. Point the web app at it

In the Vercel project of `apps/web`: `CASA_PEPE_API_BASE_URL=https://<your-railway-domain>/api`
and `CASA_PEPE_API_KEY=<same API_KEY>`. Redeploy the web app.

## 4. Check

```
curl https://<your-railway-domain>/api/health
```

must return `"database": {"status": "up"}` and `"engineerCallProvider": "elevenlabs"`.
Then open the web app, press Start and Impact: the plan appears within about a minute and the
call to `DEMO_ENGINEER_PHONE` follows.

## Model requirements

`LLM_PROVIDER` chooses between the `LLM_OPENAI_*` and `LLM_DEEPSEEK_*` blocks, so both providers
can stay configured and switching needs no redeploy.

Against OpenAI, gpt-5 models require `reasoning_effort=none` to accept function tools on
`/chat/completions`, and the client sends `max_completion_tokens` automatically. Through Helmcode
the gpt-5 family is billed from prepaid credit and answers `HTTP 402` without balance; the models
included in its base plan are `deepseek-v4-flash` (about 2.4s on a real planning request),
`qwen3.6` (about 32s) and `glm5.3-flash` (about 28s).

## Local build check

```
docker build -t casa-pepe-api .
docker run --rm -p 3100:3000 --env-file apps/server/.env.local -e PORT=3000 casa-pepe-api
```
