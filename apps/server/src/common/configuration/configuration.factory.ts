import { EnvironmentVariables } from "@common/configuration/environment-variables.class"
import {
	ApplicationConfiguration,
	EngineerCallMode,
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
	return variables
}

export function createApplicationConfiguration(
	variables: EnvironmentVariables,
): ApplicationConfiguration {
	return {
		agent: {
			approvalTimeoutMilliseconds:
				variables.AGENT_APPROVAL_TIMEOUT_MILLISECONDS,
			maximumCyclesPerRun: variables.AGENT_MAXIMUM_CYCLES_PER_RUN,
			maximumStepAttempts: variables.AGENT_MAXIMUM_STEP_ATTEMPTS,
			maximumStepsPerCycle: variables.AGENT_MAXIMUM_STEPS_PER_CYCLE,
			toolTimeoutMilliseconds: variables.AGENT_TOOL_TIMEOUT_MILLISECONDS,
		},
		authentication: {
			apiKey: variables.API_KEY,
		},
		database: {
			queryLogging: variables.DATABASE_QUERY_LOGGING === "true",
			url: variables.SUPABASE_DATABASE_URL,
		},
		demo: {
			engineerName: variables.DEMO_ENGINEER_NAME,
			engineerPhone: variables.DEMO_ENGINEER_PHONE,
			engineerRole: variables.DEMO_ENGINEER_ROLE,
		},
		email: {
			apiKey: variables.RESEND_API_KEY,
			from: variables.INCIDENT_EMAIL_FROM,
			mode: variables.INCIDENT_EMAIL_MODE as "simulated" | "live",
			to: variables.INCIDENT_EMAIL_TO,
		},
		happyRobot: {
			apiKey: variables.HAPPYROBOT_API_KEY,
			mode: variables.HAPPYROBOT_MODE as EngineerCallMode,
			simulatedCallDelayMilliseconds:
				variables.SIMULATED_CALL_DELAY_MILLISECONDS,
			triggerURL: variables.HAPPYROBOT_TRIGGER_URL,
			webhookSecret: variables.HAPPYROBOT_WEBHOOK_SECRET,
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
