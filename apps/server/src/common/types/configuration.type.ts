import {
	ENVIRONMENTS,
	LLM_REASONING_EFFORTS,
} from "@common/constants/application.constant"

export type Environment = (typeof ENVIRONMENTS)[number]

export type EngineerCallMode = "simulated" | "live"

export type EngineerCallProvider = "elevenlabs" | "happyrobot"

export type RecoveryMode = "simulated" | "http"

export interface RuntimeConfiguration {
	readonly environment: Environment
	readonly port: number
	readonly publicBaseURL: string
}

export interface DatabaseConfiguration {
	readonly url: string
	readonly queryLogging: boolean
	readonly poolMaximum: number
}

export interface AuthenticationConfiguration {
	readonly apiKey: string
}

export interface WebhooksConfiguration {
	readonly timeoutMilliseconds: number
	readonly maximumAttempts: number
}

export interface HappyRobotConfiguration {
	readonly mode: EngineerCallMode
	readonly triggerURL: string
	readonly apiKey: string
	readonly webhookSecret: string
	readonly simulatedCallDelayMilliseconds: number
}

export interface ElevenLabsConfiguration {
	readonly apiKey: string
	readonly agentId: string
	readonly phoneNumberId: string
	readonly pollIntervalMilliseconds: number
}

export interface EngineerCallConfiguration {
	readonly mode: EngineerCallMode
	readonly provider: EngineerCallProvider
}

export interface RecoveryConfiguration {
	readonly mode: RecoveryMode
	readonly environmentURL: string
	readonly environmentAPIKey: string
	readonly webhookSecret: string
	readonly simulatedDelayMilliseconds: number
}

export interface DemoConfiguration {
	readonly engineerName: string
	readonly engineerPhone: string
	readonly engineerRole: string
}

export interface AgentConfiguration {
	readonly maximumCyclesPerRun: number
	readonly maximumStepsPerCycle: number
	readonly maximumStepAttempts: number
	readonly approvalTimeoutMilliseconds: number
	readonly toolTimeoutMilliseconds: number
	readonly callTimeoutMilliseconds: number
}

export type LlmReasoningEffort = (typeof LLM_REASONING_EFFORTS)[number]

export interface LlmConfiguration {
	readonly streamOutput?: boolean
	readonly baseURL: string
	readonly apiKey: string
	readonly model: string
	readonly fastModel: string
	readonly fastTimeoutMilliseconds: number
	readonly timeoutMilliseconds: number
	readonly maximumTurns: number
	readonly maximumOutputTokens: number
	readonly reasoningEffort: LlmReasoningEffort
}

export interface EmailConfiguration {
	readonly mode: "simulated" | "live"
	readonly apiKey: string
	readonly timeoutMilliseconds: number
	readonly webhookSecret: string
	readonly from: string
	readonly to: string
}
export interface ApplicationConfiguration {
	readonly email: EmailConfiguration

	readonly runtime: RuntimeConfiguration
	readonly database: DatabaseConfiguration
	readonly authentication: AuthenticationConfiguration
	readonly webhooks: WebhooksConfiguration
	readonly engineerCall: EngineerCallConfiguration
	readonly happyRobot: HappyRobotConfiguration
	readonly elevenLabs: ElevenLabsConfiguration
	readonly recovery: RecoveryConfiguration
	readonly demo: DemoConfiguration
	readonly agent: AgentConfiguration
	readonly llm: LlmConfiguration
}
