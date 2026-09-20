import { EnvironmentVariables } from "@common/configuration/environment-variables.class"
import { LLM_PROVIDER_DEFAULT_BASE_URLS } from "@common/constants/application.constant"
import {
	ApplicationConfiguration,
	EngineerCallMode,
	EngineerCallProvider,
	Environment,
	LlmProviderCredentials,
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
	const resolvedBaseURL = resolveLlmProvider(variables).baseURL
	if (resolvedBaseURL.length > 0 && !isAllowedLlmBaseURL(resolvedBaseURL)) {
		throw new Error(
			"Invalid environment configuration -> LLM base URL: use an HTTPS URL; HTTP is only allowed for loopback tests",
		)
	}
	return variables
}

/**
 * Resolves the active provider. `LLM_PROVIDER` picks a preset (openai, deepseek) and each
 * preset falls back to the plain LLM_* variables for anything it leaves empty, so switching
 * provider is a single variable and both sets of credentials can live side by side.
 */
export function resolveLlmProvider(
	variables: EnvironmentVariables,
): LlmProviderCredentials {
	return resolveLlmCredentials(variables, variables.LLM_PROVIDER)
}

/**
 * The provider that takes over when the primary one asks the caller to slow down. By default it
 * is the other preset, so a rate limit on one account keeps the incident moving on the other;
 * `LLM_FALLBACK_PROVIDER` names one explicitly, and `none` turns the relief off. A preset that
 * resolves to the primary, or to credentials that cannot be used, is no relief at all.
 */
export function resolveLlmFallbackProvider(
	variables: EnvironmentVariables,
): LlmProviderCredentials | null {
	const requested = variables.LLM_FALLBACK_PROVIDER
	if (requested === "none") {
		return null
	}
	const { [variables.LLM_PROVIDER]: other = "" } = OTHER_LLM_PROVIDER
	const name = requested.length ? requested : other
	if (!name.length) {
		return null
	}
	const credentials = resolveLlmCredentials(variables, name)
	if (
		!credentials.apiKey.length ||
		!credentials.baseURL.length ||
		!credentials.model.length ||
		!isAllowedLlmBaseURL(credentials.baseURL)
	) {
		return null
	}
	const primary = resolveLlmProvider(variables)
	if (
		credentials.baseURL === primary.baseURL &&
		credentials.model === primary.model
	) {
		return null
	}
	return credentials
}

const OTHER_LLM_PROVIDER: Record<string, string> = {
	deepseek: "openai",
	openai: "deepseek",
}

function resolveLlmCredentials(
	variables: EnvironmentVariables,
	provider: string,
): LlmProviderCredentials {
	const preset = {
		deepseek: {
			apiKey: variables.LLM_DEEPSEEK_API_KEY,
			baseURL: variables.LLM_DEEPSEEK_BASE_URL,
			fastModel: variables.LLM_DEEPSEEK_FAST_MODEL,
			model: variables.LLM_DEEPSEEK_MODEL,
			reasoningEffort: variables.LLM_DEEPSEEK_REASONING_EFFORT,
		},
		openai: {
			apiKey: variables.LLM_OPENAI_API_KEY,
			baseURL: variables.LLM_OPENAI_BASE_URL,
			fastModel: variables.LLM_OPENAI_FAST_MODEL,
			model: variables.LLM_OPENAI_MODEL,
			reasoningEffort: variables.LLM_OPENAI_REASONING_EFFORT,
		},
	}[provider]
	if (!preset) {
		return {
			apiKey: variables.LLM_API_KEY,
			baseURL: variables.LLM_BASE_URL,
			fastModel: variables.LLM_FAST_MODEL,
			model: variables.LLM_MODEL,
			reasoningEffort: variables.LLM_REASONING_EFFORT,
		}
	}
	const defaultBaseURL = LLM_PROVIDER_DEFAULT_BASE_URLS[provider] ?? ""
	return {
		apiKey: preset.apiKey.length ? preset.apiKey : variables.LLM_API_KEY,
		baseURL: preset.baseURL.length
			? preset.baseURL
			: defaultBaseURL.length
				? defaultBaseURL
				: variables.LLM_BASE_URL,
		fastModel: preset.fastModel.length
			? preset.fastModel
			: variables.LLM_FAST_MODEL,
		model: preset.model.length ? preset.model : variables.LLM_MODEL,
		reasoningEffort:
			preset.reasoningEffort === ""
				? variables.LLM_REASONING_EFFORT
				: preset.reasoningEffort,
	}
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
			requireOperatorApproval:
				variables.AGENT_REQUIRE_OPERATOR_APPROVAL === "true",
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
			fallbackToSimulated:
				variables.ENGINEER_CALL_FALLBACK_TO_SIMULATED === "true",
			mode: (variables.ENGINEER_CALL_MODE ??
				variables.HAPPYROBOT_MODE) as EngineerCallMode,
			provider: variables.ENGINEER_CALL_PROVIDER as EngineerCallProvider,
		},
		happyRobot: {
			apiKey:
				(variables.HAPPYROBOT_TRIGGER_URL.includes("/hooks/")
					? variables.HAPPY_ROBOT_API_KEY_WEBHOOK
					: "") ||
				variables.HAPPYROBOT_API_KEY ||
				variables.HAPPY_ROBOT_API_KEY,
			inboundRunIdentifier: variables.HAPPYROBOT_INBOUND_RUN_IDENTIFIER,
			inboundWebhookSecret: variables.CASA_PEPE_INBOUND_WEBHOOK_SECRET,
			mode: variables.HAPPYROBOT_MODE as EngineerCallMode,
			simulatedCallDelayMilliseconds:
				variables.SIMULATED_CALL_DELAY_MILLISECONDS,
			triggerURL: variables.HAPPYROBOT_TRIGGER_URL,
			webhookSecret: variables.HAPPYROBOT_WEBHOOK_SECRET,
		},
		llm: {
			...resolveLlmProvider(variables),
			fallback: resolveLlmFallbackProvider(variables),
			fastTimeoutMilliseconds: variables.LLM_FAST_TIMEOUT_MILLISECONDS,
			maximumOutputTokens: variables.LLM_MAXIMUM_OUTPUT_TOKENS,
			maximumTurns: variables.LLM_MAXIMUM_TURNS,
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
