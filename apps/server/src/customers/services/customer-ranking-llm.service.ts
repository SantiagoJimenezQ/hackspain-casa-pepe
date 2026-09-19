import { LlmToolDefinition } from "@agent/llm/llm.types"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	CUSTOMER_RANKING_MAXIMUM_OUTPUT_TOKENS,
	CUSTOMER_RANKING_SYSTEM_PROMPT,
	CUSTOMER_RANKING_TOOL_NAME,
} from "@customers/constants/customer-priority.constant"
import {
	CustomerPriority,
	CustomerPriorityReport,
} from "@customers/types/customer-priority.type"
import { Injectable, Logger } from "@nestjs/common"

interface RankedCustomerAnswer {
	readonly identifier: string
	readonly rank: number
	readonly justification: string
}

interface CachedRanking {
	readonly fingerprint: string
	readonly report: CustomerPriorityReport
}

function rankingTool(identifiers: ReadonlyArray<string>): LlmToolDefinition {
	return {
		function: {
			description:
				"Final recovery order for every customer with a short justification each",
			name: CUSTOMER_RANKING_TOOL_NAME,
			parameters: {
				additionalProperties: false,
				properties: {
					customers: {
						items: {
							additionalProperties: false,
							properties: {
								identifier: {
									enum: [...identifiers],
									type: "string",
								},
								justification: {
									maxLength: 300,
									minLength: 1,
									type: "string",
								},
								rank: {
									maximum: identifiers.length,
									minimum: 1,
									type: "integer",
								},
							},
							required: ["identifier", "rank", "justification"],
							type: "object",
						},
						maxItems: identifiers.length,
						minItems: identifiers.length,
						type: "array",
					},
				},
				required: ["customers"],
				type: "object",
			},
		},
		type: "function",
	}
}

function modelVisibleCustomer(customer: CustomerPriority) {
	return {
		baselineRank: customer.rank,
		baselineScore: customer.score,
		blockedDependentServices: customer.blockedDependentServices,
		capacityUnitsToRecover: customer.capacityUnitsToRecover,
		highestImpact: customer.highestImpact,
		identifier: customer.identifier,
		minutesDown: customer.minutesDown,
		name: customer.name,
		nextAction: customer.nextAction,
		recoveryCompleted: customer.recoveryCompleted,
		recoveryFailed: customer.recoveryFailed,
		recoveryInProgress: customer.recoveryInProgress,
		sector: customer.sector,
		services: customer.services.map((service) => ({
			businessImpact: service.businessImpact,
			identifier: service.identifier,
			recoveryStatus: service.recoveryStatus,
			status: service.status,
		})),
		servicesDegraded: customer.servicesDegraded,
		servicesDown: customer.servicesDown,
		status: customer.status,
		users: customer.users,
	}
}

export function rankingFingerprint(report: CustomerPriorityReport): string {
	return JSON.stringify(
		report.customers.map((customer) => [
			customer.identifier,
			customer.status,
			customer.servicesDown,
			customer.servicesDegraded,
			customer.servicesRecovering,
			customer.recoveryInProgress,
			customer.recoveryCompleted,
			customer.recoveryFailed,
			customer.blockedDependentServices,
		]),
	)
}

function parseAnswer(
	argumentsJSON: string,
	identifiers: ReadonlyArray<string>,
): ReadonlyArray<RankedCustomerAnswer> {
	const parsed: unknown = JSON.parse(argumentsJSON)
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Ranking answer is not an object")
	}
	const customers = (parsed as { customers?: unknown }).customers
	if (!Array.isArray(customers) || customers.length !== identifiers.length) {
		throw new Error("Ranking answer must contain every customer once")
	}
	const answers = customers.map((entry): RankedCustomerAnswer => {
		if (!entry || typeof entry !== "object") {
			throw new Error("Ranking entry is not an object")
		}
		const record = entry as Record<string, unknown>
		const identifier = record.identifier
		const rank = record.rank
		const justification = record.justification
		if (
			typeof identifier !== "string" ||
			!identifiers.includes(identifier) ||
			typeof rank !== "number" ||
			!Number.isInteger(rank) ||
			rank < 1 ||
			rank > identifiers.length ||
			typeof justification !== "string" ||
			!justification.trim().length
		) {
			throw new Error("Ranking entry is invalid")
		}
		return { identifier, justification: justification.trim(), rank }
	})
	const seenIdentifiers = new Set(answers.map((answer) => answer.identifier))
	const seenRanks = new Set(answers.map((answer) => answer.rank))
	if (
		seenIdentifiers.size !== identifiers.length ||
		seenRanks.size !== identifiers.length
	) {
		throw new Error("Ranking answer repeats a customer or a rank")
	}
	return answers
}

@Injectable()
export class CustomerRankingLlmService {
	private readonly logger = new Logger(CustomerRankingLlmService.name)

	private readonly cache = new Map<string, CachedRanking>()

	constructor(
		private readonly llmClient: LlmClientService,
		private readonly configuration: ConfigurationService,
	) {}

	async rank(
		baseline: CustomerPriorityReport,
	): Promise<CustomerPriorityReport> {
		const fingerprint = rankingFingerprint(baseline)
		const cached = this.cache.get(baseline.runIdentifier)
		if (cached && cached.fingerprint === fingerprint) {
			return { ...cached.report, generatedAt: baseline.generatedAt }
		}
		const { fastModel, fastTimeoutMilliseconds, model } =
			this.configuration.llm
		const chosenModel = fastModel.length ? fastModel : model
		try {
			const report = await this.rankWithModel(
				baseline,
				chosenModel,
				fastTimeoutMilliseconds,
			)
			this.cache.set(baseline.runIdentifier, { fingerprint, report })
			this.logger.log(LOG_MESSAGES.CUSTOMERS.RANKING_FINISHED, {
				model: chosenModel,
				runIdentifier: baseline.runIdentifier,
			})
			return report
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown ranking error"
			this.logger.warn(LOG_MESSAGES.CUSTOMERS.RANKING_FAILED, {
				model: chosenModel,
				reason,
				runIdentifier: baseline.runIdentifier,
			})
			return { ...baseline, fallbackReason: reason, model: chosenModel }
		}
	}

	private async rankWithModel(
		baseline: CustomerPriorityReport,
		model: string,
		timeoutMilliseconds: number,
	): Promise<CustomerPriorityReport> {
		const identifiers = baseline.customers.map(
			(customer) => customer.identifier,
		)
		if (!identifiers.length) {
			return { ...baseline, model, source: "llm" }
		}
		const completion = await this.llmClient.complete(
			[
				{ content: CUSTOMER_RANKING_SYSTEM_PROMPT, role: "system" },
				{
					content: JSON.stringify({
						baselineRanking:
							baseline.customers.map(modelVisibleCustomer),
						criteria: baseline.criteria,
					}),
					role: "user",
				},
			],
			[rankingTool(identifiers)],
			{
				maximumOutputTokens: CUSTOMER_RANKING_MAXIMUM_OUTPUT_TOKENS,
				model,
				reasoningEffort: "none",
				timeoutMilliseconds,
			},
		)
		const call = completion.message.tool_calls?.[0]
		if (!call || call.function.name !== CUSTOMER_RANKING_TOOL_NAME) {
			throw new Error("The model did not call the ranking tool")
		}
		const answers = parseAnswer(call.function.arguments, identifiers)
		const byIdentifier = new Map(
			answers.map((answer) => [answer.identifier, answer]),
		)
		const customers = [...baseline.customers]
			.map((customer) => {
				const answer = byIdentifier.get(customer.identifier)
				if (!answer) {
					throw new Error("Ranking answer misses a customer")
				}
				return {
					...customer,
					justification: answer.justification,
					rank: answer.rank,
				}
			})
			.sort((left, right) => left.rank - right.rank)
		return {
			...baseline,
			customers,
			fallbackReason: "",
			model: completion.model.length ? completion.model : model,
			source: "llm",
		}
	}
}
