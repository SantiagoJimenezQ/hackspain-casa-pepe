import "reflect-metadata"
import { randomBytes } from "node:crypto"

// Loaded before Nest modules evaluate configuration. Tests never use live integrations.
process.env.SUPABASE_DATABASE_URL = "postgresql://localhost:5432/casa_pepe_test"
process.env.API_KEY = randomBytes(32).toString("hex")
process.env.HAPPYROBOT_WEBHOOK_SECRET = randomBytes(32).toString("hex")
process.env.RECOVERY_WEBHOOK_SECRET = randomBytes(32).toString("hex")
process.env.HAPPYROBOT_MODE = "simulated"
process.env.RECOVERY_MODE = "simulated"
process.env.INCIDENT_EMAIL_MODE = "simulated"
process.env.SIMULATED_CALL_DELAY_MILLISECONDS = "0"
process.env.SIMULATED_RECOVERY_DELAY_MILLISECONDS = "0"
process.env.AGENT_TOOL_TIMEOUT_MILLISECONDS = "5000"
