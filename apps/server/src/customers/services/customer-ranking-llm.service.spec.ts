import { CUSTOMER_RANKING_TOOL_NAME } from "@customers/constants/customer-priority.constant"
import {
	prioritizeCustomers,
	sectorRank,
} from "@customers/helpers/customer-priority.helper"
import { CustomerRankingLlmService } from "@customers/services/customer-ranking-llm.service"
import { createImpactedIncident } from "@root/testing/incident.fixture"

const NOW = "2026-09-18T10:35:00.000Z"

function configuration(fastModel: string) {
	return {
		llm: {
			apiKey: "key",
			baseURL: "https://provider.example.test/v1",
			fastModel,
			fastTimeoutMilliseconds: 5000,
			maximumOutputTokens: 8192,
			maximumTurns: 24,
			model: "main-model",
			reasoningEffort: "",
			timeoutMilliseconds: 30000,
		},
	}
}

function completionWith(customers: ReadonlyArray<Record<string, unknown>>) {
	return {
		message: {
			content: null,
			role: "assistant",
			tool_calls: [
				{
					function: {
						arguments: JSON.stringify({ customers }),
						name: CUSTOMER_RANKING_TOOL_NAME,
					},
					id: "call-1",
					type: "function",
				},
			],
		},
		model: "fast-model",
		usage: {},
	}
}

describe("CustomerRankingLlmService", () => {
	const baseline = prioritizeCustomers(createImpactedIncident(7), [], NOW)

	it("applies the model order and justification and caches it while the state is unchanged", async () => {
		const reversed = [...baseline.customers].reverse()
		const complete = jest.fn().mockResolvedValue(
			completionWith(
				reversed.map((customer, index) => ({
					identifier: customer.identifier,
					justification: `Reason for ${customer.name}`,
					rank: index + 1,
				})),
			),
		)
		const service = new CustomerRankingLlmService(
			{ complete } as never,
			configuration("fast-model") as never,
		)

		const first = await service.rank(baseline)
		const second = await service.rank({ ...baseline, generatedAt: "later" })

		expect(first.source).toBe("llm")
		expect(first.model).toBe("fast-model")
		// The model may reorder freely inside a sector, never across sectors.
		const tiers = first.customers.map((customer) =>
			sectorRank(customer.sector),
		)
		expect(tiers).toEqual([...tiers].sort((left, right) => left - right))
		const modelOrder = reversed.map((customer) => customer.identifier)
		for (const tier of new Set(tiers)) {
			const applied = first.customers
				.filter((customer) => sectorRank(customer.sector) === tier)
				.map((customer) => customer.identifier)
			expect(applied).toEqual(
				modelOrder.filter((identifier) => applied.includes(identifier)),
			)
		}
		expect(first.customers.map((customer) => customer.rank)).toEqual(
			first.customers.map((_, index) => index + 1),
		)
		expect(first.customers[0].justification).toBe(
			`Reason for ${first.customers[0].name}`,
		)
		expect(complete).toHaveBeenCalledTimes(1)
		expect(complete.mock.calls[0][3]).toMatchObject({
			model: "fast-model",
			reasoningEffort: "none",
			timeoutMilliseconds: 5000,
		})
		expect(second.generatedAt).toBe("later")
	})

	it("falls back to the deterministic order when the model answer is invalid", async () => {
		const complete = jest
			.fn()
			.mockResolvedValue(
				completionWith([
					{ identifier: "unknown", justification: "x", rank: 1 },
				]),
			)
		const service = new CustomerRankingLlmService(
			{ complete } as never,
			configuration("") as never,
		)

		const report = await service.rank(baseline)

		expect(report.source).toBe("deterministic")
		expect(report.model).toBe("main-model")
		expect(report.fallbackReason.length).toBeGreaterThan(0)
		expect(report.customers).toEqual(baseline.customers)
	})

	it("falls back to the deterministic order when the provider fails", async () => {
		const complete = jest
			.fn()
			.mockRejectedValue(new Error("timeout of 5000ms exceeded"))
		const service = new CustomerRankingLlmService(
			{ complete } as never,
			configuration("fast-model") as never,
		)

		const report = await service.rank(baseline)
		const again = await service.rank(baseline)

		expect(report.source).toBe("deterministic")
		expect(report.fallbackReason).toBe("timeout of 5000ms exceeded")
		expect(again.source).toBe("deterministic")
		expect(complete).toHaveBeenCalledTimes(1)
	})
})
