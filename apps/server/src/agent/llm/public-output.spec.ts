import { llmPlanSchema } from "./plan-validation"
import { PublicOutput } from "./public-output"

describe("public output boundary", () => {
	it("keeps complete text and redacts configured credentials across every fragment boundary", () => {
		const text =
			"Explanation ".repeat(400) +
			"\nAPI key: fixture-credential-value\nContinue safely.\n"
		for (let cut = 0; cut <= text.length; cut += 11) {
			const output = new PublicOutput({
				llm: { apiKey: "fixture-credential-value" },
			})
			const result =
				output.fragment(text.slice(0, cut)) +
				output.fragment(text.slice(cut)) +
				output.fragment("", true)
			expect(result).not.toContain("fixture-credential-value")
			expect(result).toContain("Continue safely.")
			expect(result.length).toBeGreaterThan(4000)
			expect(output.redacted).toBe(true)
		}
	})
	it("holds a credential spanning lines until it can redact the entire value", () => {
		const output = new PublicOutput({ apiKey: "secret\nwith-newline" })
		const result =
			output.fragment("Safe\nsecret\nwith-") +
			output.fragment("newline\nMore text to flush the buffer\n") +
			output.fragment("", true)
		expect(result).not.toContain("secret")
		expect(result).not.toContain("with-newline")
	})
	it("preserves safe arguments and fails closed for unknown fields and tools", () => {
		const output = new PublicOutput({})
		const calls = output.calls(
			[
				{
					function: {
						arguments: JSON.stringify({
							password: "never-visible",
							stepIdentifier: "step-1",
						}),
						name: "execute_step",
					},
					id: "c1",
					type: "function",
				},
				{
					function: {
						arguments: '{"anything":"never-visible"}',
						name: "unknown",
					},
					id: "c2",
					type: "function",
				},
			],
			[
				{
					function: {
						name: "execute_step",
						parameters: {
							properties: { stepIdentifier: { type: "string" } },
						},
					},
					type: "function",
				},
			],
		)
		expect(calls[0]).toMatchObject({
			arguments: { stepIdentifier: "step-1" },
			id: "c1",
		})
		expect(JSON.stringify(calls)).not.toContain("never-visible")
		expect(calls[1].arguments).toBe("[redacted]")
	})
	it("projects nested plan schemas while hiding phone numbers", () => {
		const output = new PublicOutput({})
		const calls = output.calls(
			[
				{
					function: {
						arguments: JSON.stringify({
							steps: [
								{
									invocation: {
										input: {
											engineerPhone: "+34600000000",
											purpose: "Confirm capacity",
										},
										name: "call_engineer",
									},
								},
							],
							summary: "A complete plan",
						}),
						name: "propose_plan",
					},
					id: "plan-call",
					type: "function",
				},
			],
			[
				{
					function: {
						name: "propose_plan",
						parameters: llmPlanSchema,
					},
					type: "function",
				},
			],
		)
		expect(JSON.stringify(calls)).toContain("Confirm capacity")
		expect(JSON.stringify(calls)).not.toContain("+34600000000")
	})
})

it("C12 redacts nested combined plan arguments without altering executable input", async () => {
	const { definitions } = await import("./llm-loop.service")
	const { draft } = (
		await import("@root/testing/speed.fixture")
	).speedFixture()
	const canary = "synthetic-combined-canary"
	const original = {
		firstStepIdentifier: draft.steps[0].identifier,
		plan: {
			...draft,
			summary: `Restore safely ${canary}`,
			unknownField: canary,
		},
	}
	const output = new PublicOutput({ apiKey: canary })
	const projected = output.calls(
		[
			{
				function: {
					arguments: JSON.stringify(original),
					name: "propose_plan_and_execute",
				},
				id: "combined",
				type: "function",
			},
		],
		definitions(true),
	)
	expect(JSON.stringify(projected)).not.toContain(canary)
	expect(JSON.stringify(projected)).not.toContain("+34600000000")
	expect(original.plan.summary).toContain(canary)
	expect(projected[0].name).toBe("propose_plan_and_execute")
})
