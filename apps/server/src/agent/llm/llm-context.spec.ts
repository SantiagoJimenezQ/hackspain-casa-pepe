import { ActivityRecord } from "@activity/types/activity.type"
import {
	argumentDiagnostics,
	investigationSummary,
	MEMORY_LIMIT,
	restoreInvestigation,
	safeValidationError,
} from "@agent/llm/llm-context"
import { PlanBuildInput } from "@agent/types/agent.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"

describe("LLM context projections", () => {
	it("retains field structure but never argument values or arbitrary field names", () => {
		const result = JSON.stringify(
			argumentDiagnostics(
				JSON.stringify({
					input: {
						password: "private-password",
						resourceIdentifier: "private-resource",
						"secret-as-key": true,
					},
					steps: [{ order: 12345, title: "private-title" }],
				}),
			),
		)
		for (const value of [
			"private-resource",
			"private-password",
			"secret-as-key",
			"private-title",
			"12345",
		])
			expect(result).not.toContain(value)
		expect(result).toContain("resourceIdentifier")
		expect(result).toContain("[redacted-field]")
		expect(result).toContain("number")
	})

	it("bounds diagnostic depth, fields and array samples", () => {
		const value = {
			input: { input: { input: { input: { reason: "do-not-show" } } } },
			steps: Array(1000).fill({ title: "hidden" }),
			...Object.fromEntries(
				Array.from({ length: 1000 }, (_, i) => [
					`unknown-${i}`,
					"hidden",
				]),
			),
		}
		const result = JSON.stringify(
			argumentDiagnostics(JSON.stringify(value)),
		)
		expect(result.length).toBeLessThan(2500)
		expect(result).not.toContain("do-not-show")
		expect(result).not.toContain("hidden")
	})

	it("does not expose malformed JSON and removes submitted strings from validation errors", () => {
		expect(argumentDiagnostics('{"password":"secret"')).toEqual({
			bytes: 20,
			validJson: false,
		})
		expect(
			safeValidationError(
				"Invalid plan.steps.secret-id: missing dependency secret-dependency",
				JSON.stringify({
					dependsOn: ["secret-dependency"],
					identifier: "secret-id",
				}),
			),
		).toBe("Invalid plan.steps.[argument]: missing dependency [argument]")
	})

	it("keeps a bounded run-scoped audit projection without raw transcripts or provider payloads", () => {
		const records = Array.from({ length: 30 }, (_, i) => ({
			payload: {
				rawArguments: "secret",
				result: { correction: "Use {}", error: "No arguments allowed" },
				tool: "get_recovery_capacity",
				transcript: "private transcript",
			},
			replayed: false,
			runIdentifier: "run",
			summary: `rejection ${i}`,
			type: "agent.llm-rejected",
		})) as unknown as ActivityRecord[]
		records.push(
			{ ...records[0], runIdentifier: "other" },
			{ ...records[0], replayed: true },
		)
		const memory = restoreInvestigation(records, "run")
		expect(memory).toHaveLength(MEMORY_LIMIT)
		expect(memory[0].summary).toBe("rejection 14")
		expect(JSON.stringify(memory)).not.toContain("secret")
		expect(JSON.stringify(memory)).not.toContain("private transcript")
	})

	it("projects current findings, unresolved questions and plan rationale without promoting uncertain claims", () => {
		const input = {
			incident: {
				...createImpactedIncident(12),
				facts: [
					{
						source: "operator",
						statement: "Capacity confirmed",
						status: "confirmed",
					},
					{
						source: "engineer",
						statement: "Backup age unknown",
						status: "pending",
					},
				],
			},
			previousPlan: {
				assumptions: ["Backup is usable"],
				reason: "Capacity dropped",
				summary: "Prioritize orders",
				version: 2,
			},
		} as unknown as PlanBuildInput
		const summary = investigationSummary(input, [], {
			calls: [
				{
					identifier: "call-1",
					questions: [
						{ key: "capacity", question: "How much capacity?" },
						{ key: "age", question: "Backup age?" },
					],
					result: { answers: [{ confirmed: true, key: "capacity" }] },
					status: "completed",
				},
			],
		})
		expect(summary.confirmedFindings.map((fact) => fact.statement)).toEqual(
			["Capacity confirmed"],
		)
		expect(summary.unresolvedFacts.map((fact) => fact.statement)).toEqual([
			"Backup age unknown",
		])
		expect(
			summary.unresolvedQuestions.map((question) => question.question),
		).toEqual(["Backup age?"])
		expect(summary.currentPlan.reason).toBe("Capacity dropped")
	})
})
