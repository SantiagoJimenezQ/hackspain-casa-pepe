import {
	ENVIRONMENTS,
	LLM_REASONING_EFFORTS,
} from "@common/constants/application.constant"
import { LlmReasoningEffort } from "@common/types/configuration.type"
import { Type } from "class-transformer"
import {
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Matches,
	Max,
	Min,
	MinLength,
} from "class-validator"

const DATABASE_URL_MESSAGE =
	"SUPABASE_DATABASE_URL must be the Postgres connection string (postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres), not the https Project URL. Copy it from Supabase > Connect > Session pooler > URI"

export class EnvironmentVariables {
	@IsIn(["simulated", "live"])
	INCIDENT_EMAIL_MODE: string = "simulated"
	@IsString()
	RESEND_API_KEY: string = ""
	@IsString()
	RESEND_WEBHOOK_SECRET: string = ""
	@IsString()
	INCIDENT_EMAIL_FROM: string = ""
	@IsString()
	INCIDENT_EMAIL_TO: string = ""

	@IsIn(ENVIRONMENTS)
	ENVIRONMENT: string = "local"

	@Type(() => Number)
	@IsInt()
	@Min(1)
	PORT: number = 3000

	@IsString()
	PUBLIC_BASE_URL: string = "http://localhost:3000"

	@IsIn(["true", "false"])
	DATABASE_QUERY_LOGGING: string = "false"

	@IsString()
	@Matches(/^postgres(ql)?:\/\//, {
		message: DATABASE_URL_MESSAGE,
	})
	SUPABASE_DATABASE_URL: string =
		"postgresql://casa_pepe:casa_pepe@localhost:5432/casa_pepe"

	@IsString()
	@MinLength(1)
	API_KEY: string = ""

	@Type(() => Number)
	@IsInt()
	@Min(100)
	WEBHOOK_TIMEOUT_MILLISECONDS: number = 5000

	@Type(() => Number)
	@IsInt()
	@Min(1)
	WEBHOOK_MAXIMUM_ATTEMPTS: number = 5

	@IsOptional()
	@IsIn(["simulated", "live"])
	ENGINEER_CALL_MODE: string | undefined = undefined

	@IsIn(["elevenlabs", "happyrobot"])
	ENGINEER_CALL_PROVIDER: string = "happyrobot"

	@IsIn(["simulated", "live"])
	HAPPYROBOT_MODE: string = "simulated"

	@IsString()
	HAPPYROBOT_TRIGGER_URL: string = ""

	@IsString()
	HAPPYROBOT_API_KEY: string = ""

	@IsString()
	@MinLength(1)
	HAPPYROBOT_WEBHOOK_SECRET: string = ""

	@IsString()
	ELEVENLABS_API_KEY: string = ""

	@IsString()
	ELEVENLABS_AGENT_ID: string = ""

	@IsString()
	ELEVENLABS_PHONE_NUMBER_ID: string = ""

	@Type(() => Number)
	@IsInt()
	@Min(100)
	ELEVENLABS_POLL_INTERVAL_MILLISECONDS: number = 5000

	@Type(() => Number)
	@IsInt()
	@Min(0)
	SIMULATED_CALL_DELAY_MILLISECONDS: number = 4000

	@IsIn(["simulated", "http"])
	RECOVERY_MODE: string = "simulated"

	@IsUrl({ require_tld: false })
	RECOVERY_ENVIRONMENT_URL: string = "http://localhost:4100"

	@IsString()
	RECOVERY_ENVIRONMENT_API_KEY: string = ""

	@IsString()
	@MinLength(1)
	RECOVERY_WEBHOOK_SECRET: string = ""

	@Type(() => Number)
	@IsInt()
	@Min(0)
	SIMULATED_RECOVERY_DELAY_MILLISECONDS: number = 1500

	@IsString()
	DEMO_ENGINEER_NAME: string = "Marta Ruiz"

	@IsString()
	DEMO_ENGINEER_PHONE: string = "+34600000000"

	@IsString()
	DEMO_ENGINEER_ROLE: string = "Platform on-call engineer"

	@Type(() => Number)
	@IsInt()
	@Min(1)
	AGENT_MAXIMUM_CYCLES_PER_RUN: number = 60

	@Type(() => Number)
	@IsInt()
	@Min(1)
	AGENT_MAXIMUM_STEPS_PER_CYCLE: number = 6

	@Type(() => Number)
	@IsInt()
	@Min(1)
	AGENT_MAXIMUM_STEP_ATTEMPTS: number = 2

	@Type(() => Number)
	@IsInt()
	@Min(1000)
	AGENT_APPROVAL_TIMEOUT_MILLISECONDS: number = 600000

	@Type(() => Number)
	@IsInt()
	@Min(1000)
	AGENT_TOOL_TIMEOUT_MILLISECONDS: number = 20000

	@Type(() => Number)
	@IsInt()
	@Min(1000)
	AGENT_CALL_TIMEOUT_MILLISECONDS: number = 300000

	// The LLM is the default decision provider. Empty provider fields keep local
	// startup possible; the client reports the missing configuration when called.
	@IsString()
	LLM_BASE_URL: string = ""

	@IsString()
	LLM_API_KEY: string = ""

	@IsString()
	LLM_MODEL: string = ""

	@IsString()
	LLM_FAST_MODEL: string = ""

	@IsIn(["true", "false"])
	LLM_STREAM_OUTPUT: string = "false"

	@Type(() => Number)
	@IsInt()
	@Min(100)
	@Max(120000)
	LLM_TIMEOUT_MILLISECONDS: number = 30000

	@Type(() => Number)
	@IsInt()
	@Min(100)
	@Max(120000)
	LLM_FAST_TIMEOUT_MILLISECONDS: number = 5000

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(32)
	LLM_MAXIMUM_TURNS: number = 24

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(32768)
	LLM_MAXIMUM_OUTPUT_TOKENS: number = 8192

	@IsIn(LLM_REASONING_EFFORTS)
	LLM_REASONING_EFFORT: LlmReasoningEffort = ""
}
