import { LlmToolDefinition } from "@agent/llm/llm.types"
import { LlmClientError, LlmClientService } from "@agent/llm/llm-client.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { CUSTOMER_RANKING_MAXIMUM_OUTPUT_TOKENS } from "@customers/constants/customer-priority.constant"
import { Injectable } from "@nestjs/common"

const PROBE: LlmToolDefinition = {
	function: {
		description: "A synthetic diagnostic. No external action is executed.",
		name: "model_health_check",
		parameters: {
			additionalProperties: false,
			properties: { ok: { enum: [true], type: "boolean" } },
			required: ["ok"],
			type: "object",
		},
	},
	type: "function",
}

@Injectable()
export class ModelTestsService {
	constructor(
		private readonly configuration: ConfigurationService,
		private readonly client: LlmClientService,
	) {}

	async execute() {
		const config = this.configuration.llm
		const profiles = [
			{
				maximumOutputTokens: config.maximumOutputTokens,
				model: config.model,
				profile: "agent",
				reasoningEffort: config.reasoningEffort,
				streamOutput: config.streamOutput === true,
				timeoutMilliseconds: config.timeoutMilliseconds,
			},
			{
				maximumOutputTokens: CUSTOMER_RANKING_MAXIMUM_OUTPUT_TOKENS,
				model: config.fastModel || config.model,
				profile: "customer-ranking",
				reasoningEffort: "none" as const,
				streamOutput: false,
				timeoutMilliseconds: config.fastTimeoutMilliseconds,
			},
		]
		const results = await Promise.all(
			profiles.map(async (profile) => {
				const started = Date.now()
				try {
					const result = await this.client.complete(
						[
							{
								content:
									'Call model_health_check exactly once with {"ok":true}.',
								role: "user",
							},
						],
						[PROBE],
						undefined,
						profile,
					)
					const calls = result.message.tool_calls ?? []
					const args =
						calls.length === 1
							? JSON.parse(calls[0].function.arguments)
							: null
					if (
						calls.length !== 1 ||
						calls[0].function.name !== "model_health_check" ||
						args?.ok !== true ||
						Object.keys(args).length !== 1
					) {
						throw new LlmClientError(
							"Model did not return the expected diagnostic tool call",
						)
					}
					return {
						...profile,
						error: null,
						latencyMilliseconds: Date.now() - started,
						status: "succeeded" as const,
					}
				} catch (error) {
					return {
						...profile,
						error:
							error instanceof LlmClientError
								? error.message
								: "Model diagnostic failed",
						latencyMilliseconds: Date.now() - started,
						status: "failed" as const,
					}
				}
			}),
		)
		return {
			maximumOutputTokens: config.maximumOutputTokens,
			ok: results.every((result) => result.status === "succeeded"),
			results,
			streamOutput: config.streamOutput === true,
		}
	}
}
