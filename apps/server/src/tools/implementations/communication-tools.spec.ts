import "reflect-metadata"
import { sendIncidentEmail } from "@casa-pepe/tools"
import { ToolContext } from "@tools/types/tool.type"
import { CommunicationToolsService } from "./communication-tools"

const context: ToolContext = {
	decisionIdentifier: "dec",
	incidentIdentifier: "inc-1",
	planIdentifier: "plan-1",
	planStepIdentifier: "email",
	planVersion: 1,
	runIdentifier: "run-1",
	toolCallIdentifier: "tool",
}
describe("MVP communications", () => {
	const originalFetch = global.fetch
	afterEach(() => {
		global.fetch = originalFetch
	})
	it("never sends network requests in simulated email mode", async () => {
		global.fetch = jest.fn()
		const receipt = await sendIncidentEmail(
			{
				apiKey: "",
				from: "",
				mode: "simulated",
				timeoutMilliseconds: 1000,
				to: "",
			},
			{ subject: "Demo", text: "Plan" },
			"run:plan:email",
		)
		expect(receipt.mode).toBe("simulated")
		expect(global.fetch).not.toHaveBeenCalled()
	})
	it("uses the same provider idempotency key for retries and validates receipts", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			json: async () => ({ id: "provider-receipt" }),
			ok: true,
		})
		const config = {
			apiKey: "placeholder",
			from: "demo@example.com",
			mode: "live" as const,
			timeoutMilliseconds: 1000,
			to: "operator@example.com",
		}
		await sendIncidentEmail(
			config,
			{ subject: "Demo", text: "Plan" },
			"run:plan:email",
		)
		expect(global.fetch).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				headers: expect.objectContaining({
					"Idempotency-Key": "run:plan:email",
				}),
				redirect: "error",
			}),
		)
		global.fetch = jest.fn().mockResolvedValue({
			json: async () => ({ secret: "must not escape" }),
			ok: false,
			status: 429,
		})
		await expect(
			sendIncidentEmail(
				config,
				{ subject: "Demo", text: "Plan" },
				"run:plan:email",
			),
		).rejects.toMatchObject({
			message: "Integration returned HTTP 429",
			retryable: true,
		})
	})
	function setup() {
		const config = {
			agent: { toolTimeoutMilliseconds: 20000 },
			email: { mode: "simulated" },
			recovery: { mode: "simulated" },
		}
		const incident = {
			active: true,
			identifier: "inc-1",
			runKind: "live",
			services: [
				{
					identifier: "route-assignment",
					lastChangedAt: "2026-09-18T10:00:00Z",
					name: "Routes",
					status: "healthy",
				},
				{
					identifier: "package-tracking",
					lastChangedAt: "2026-09-18T10:00:00Z",
					name: "Tracking",
					status: "down",
				},
			],
		}
		const runs = {
			findActiveEntity: jest
				.fn()
				.mockResolvedValue({ runIdentifier: "run-1" }),
			getByRunIdentifier: jest.fn().mockResolvedValue(incident),
		}
		const plans = {
			findLatestPlan: jest
				.fn()
				.mockResolvedValue({ identifier: "plan-1", version: 1 }),
		}
		const calls = { find: jest.fn().mockResolvedValue([]) }
		const publications = {
			find: jest.fn().mockResolvedValue([]),
			upsert: jest.fn(),
		}
		const service = new CommunicationToolsService(
			config as never,
			runs as never,
			plans as never,
			calls as never,
			publications as never,
		)
		return { calls, plans, publications, runs, service }
	}
	it("rejects stale plan communications", async () => {
		const s = setup()
		expect(
			await s.service.execute(
				"email",
				{ planIdentifier: "old" },
				context,
			),
		).toMatchObject({ error: { code: "STALE_PLAN" }, status: "failed" })
	})
	it("does not advertise recovery without fresh independent verification", async () => {
		const s = setup()
		await s.service.execute("status", { planIdentifier: "plan-1" }, context)
		expect(
			s.publications.upsert.mock.calls[0][0].publication.services[0]
				.status,
		).toBe("awaiting-verification")
		s.calls.find.mockResolvedValue([
			{
				finishedAt: "2026-09-18T10:01:00Z",
				output: {
					kind: "recovery-verification",
					serviceIdentifier: "route-assignment",
					verified: true,
				},
			},
		])
		await s.service.execute("status", { planIdentifier: "plan-1" }, context)
		expect(
			s.publications.upsert.mock.calls[1][0].publication.services,
		).toEqual([
			{ name: "Routes", status: "healthy" },
			{ name: "Tracking", status: "down" },
		])
	})
})
