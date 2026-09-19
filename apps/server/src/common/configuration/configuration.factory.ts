import { EnvironmentVariables } from "@common/configuration/environment-variables.class"
import {
	ApplicationConfiguration,
	EngineerCallMode,
	EngineerCallProvider,
	Environment,
	RecoveryMode,
} from "@common/types/configuration.type"
import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

export function validateEnvironmentVariables(
	rawEnvironment: Record<string, unknown>,
): EnvironmentVariables {
	const variables = plainToInstance(EnvironmentVariables, rawEnvironment, {
		enableImplicitConversion: false,
		exposeDefaultValues: true,
	})
	const errors = validateSync(variables, { skipMissingProperties: false })
	if (errors.length) {
		const descriptions = errors.map(
			({ constraints = {}, property }) =>
				`${property}: ${Object.values(constraints).join(", ")}`,
		)
		throw new Error(
			`Invalid environment configuration -> ${descriptions.join(" | ")}`,
		)
	}
	if (
		variables.LLM_BASE_URL.length > 0 &&
		!isAllowedLlmBaseURL(variables.LLM_BASE_URL)
	) {
		throw new Error(
			"Invalid environment configuration -> LLM_BASE_URL: use an HTTPS URL; HTTP is only allowed for loopback tests",
		)
	}
	return variables
}

export function isAllowedLlmBaseURL(baseURL: string): boolean {
	try {
		const parsed = new URL(baseURL)
		if (
			parsed.username ||
			parsed.password ||
			!parsed.hostname ||
			(parsed.protocol !== "https:" && parsed.protocol !== "http:")
		) {
			return false
		}
		return (
			parsed.protocol === "https:" || isLoopbackHostname(parsed.hostname)
		)
	} catch {
		return false
	}
}

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
	if (normalized === "localhost" || normalized === "::1") return true
	if (!normalized.startsWith("127.")) return false
	const octets = normalized.split(".")
	return (
		octets.length === 4 &&
		octets.every((octet) => {
			const value = Number(octet)
			return /^\d{1,3}$/.test(octet) && value >= 0 && value <= 255
		})
	)
}

export function createApplicationConfiguration(
	variables: EnvironmentVariables,
): ApplicationConfiguration {
	return {
		agent: {
			approvalTimeoutMilliseconds:
				variables.AGENT_APPROVAL_TIMEOUT_MILLISECONDS,
			callTimeoutMilliseconds: variables.AGENT_CALL_TIMEOUT_MILLISECONDS,
			maximumCyclesPerRun: variables.AGENT_MAXIMUM_CYCLES_PER_RUN,
			maximumStepAttempts: variables.AGENT_MAXIMUM_STEP_ATTEMPTS,
			maximumStepsPerCycle: variables.AGENT_MAXIMUM_STEPS_PER_CYCLE,
			toolTimeoutMilliseconds: variables.AGENT_TOOL_TIMEOUT_MILLISECONDS,
		},
		authentication: {
			apiKey: variables.API_KEY,
		},
		database: {
			poolMaximum: variables.DATABASE_POOL_MAXIMUM,
			queryLogging: variables.DATABASE_QUERY_LOGGING === "true",
			url: variables.SUPABASE_DATABASE_URL,
		},
		demo: {
			engineerName: variables.DEMO_ENGINEER_NAME,
			engineerPhone: variables.DEMO_ENGINEER_PHONE,
			engineerRole: variables.DEMO_ENGINEER_ROLE,
		},
		elevenLabs: {
			agentId: variables.ELEVENLABS_AGENT_ID,
			apiKey: variables.ELEVENLABS_API_KEY,
			phoneNumberId: variables.ELEVENLABS_PHONE_NUMBER_ID,
			pollIntervalMilliseconds:
				variables.ELEVENLABS_POLL_INTERVAL_MILLISECONDS,
		},
		email: {
			apiKey: variables.RESEND_API_KEY,
			from: variables.INCIDENT_EMAIL_FROM,
			mode: variables.INCIDENT_EMAIL_MODE as "simulated" | "live",
			timeoutMilliseconds: variables.AGENT_TOOL_TIMEOUT_MILLISECONDS,
			to: variables.INCIDENT_EMAIL_TO,
			webhookSecret: variables.RESEND_WEBHOOK_SECRET,
		},
		engineerCall: {
			mode: (variables.ENGINEER_CALL_MODE ??
				variables.HAPPYROBOT_MODE) as EngineerCallMode,
			provider: variables.ENGINEER_CALL_PROVIDER as EngineerCallProvider,
		},
		happyRobot: {
			apiKey: variables.HAPPYROBOT_API_KEY,
			mode: variables.HAPPYROBOT_MODE as EngineerCallMode,
			simulatedCallDelayMilliseconds:
				variables.SIMULATED_CALL_DELAY_MILLISECONDS,
			triggerURL: variables.HAPPYROBOT_TRIGGER_URL,
			webhookSecret: variables.HAPPYROBOT_WEBHOOK_SECRET,
		},
		llm: {
			apiKey: variables.LLM_API_KEY,
			baseURL: variables.LLM_BASE_URL,
			fastModel: variables.LLM_FAST_MODEL,
			fastTimeoutMilliseconds: variables.LLM_FAST_TIMEOUT_MILLISECONDS,
			maximumOutputTokens: variables.LLM_MAXIMUM_OUTPUT_TOKENS,
			maximumTurns: variables.LLM_MAXIMUM_TURNS,
			model: variables.LLM_MODEL,
			reasoningEffort: variables.LLM_REASONING_EFFORT,
			streamOutput: variables.LLM_STREAM_OUTPUT === "true",
			timeoutMilliseconds: variables.LLM_TIMEOUT_MILLISECONDS,
		},
		recovery: {
			environmentAPIKey: variables.RECOVERY_ENVIRONMENT_API_KEY,
			environmentURL: variables.RECOVERY_ENVIRONMENT_URL,
			mode: variables.RECOVERY_MODE as RecoveryMode,
			simulatedDelayMilliseconds:
				variables.SIMULATED_RECOVERY_DELAY_MILLISECONDS,
			webhookSecret: variables.RECOVERY_WEBHOOK_SECRET,
		},
		runtime: {
			environment: variables.ENVIRONMENT as Environment,
			port: variables.PORT,
			publicBaseURL: variables.PUBLIC_BASE_URL,
		},
		webhooks: {
			maximumAttempts: variables.WEBHOOK_MAXIMUM_ATTEMPTS,
			timeoutMilliseconds: variables.WEBHOOK_TIMEOUT_MILLISECONDS,
		},
	}
}
