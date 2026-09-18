import "reflect-metadata"

process.env.API_KEY ??= "test-api-key"
process.env.HAPPYROBOT_WEBHOOK_SECRET ??= "test-happyrobot-secret"
process.env.RECOVERY_WEBHOOK_SECRET ??= "test-recovery-secret"
process.env.SUPABASE_DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/test"
