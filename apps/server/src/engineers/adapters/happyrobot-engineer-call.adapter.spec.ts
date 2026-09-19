import "reflect-metadata"
import { of, throwError } from "rxjs"
import { HappyRobotEngineerCallAdapter } from "./happyrobot-engineer-call.adapter"

const url =
	"https://platform.eu.happyrobot.ai/api/v2/workflows/workflow-test/runs"
const request = {
	call: {
		engineer: { name: "Test", phone: "+34600000000" },
		identifier: "call_test",
		incidentIdentifier: "incident_test",
		purpose: "Confirm permission",
		questions: [],
	},
	callbackURL: "https://example.test/api/tools/tests/callbacks/happyrobot",
	incidentContext: {
		incidentDescription: "Synthetic outage",
		location: "test",
		outageStartedAt: "2026-09-19T14:30:00Z",
		servicesDown: ["Orders", "Tracking"],
	},
}
function setup(triggerURL = url, data: unknown = { run_id: "run_provider" }) {
	const post = jest.fn().mockReturnValue(of({ data }))
	const adapter = new HappyRobotEngineerCallAdapter(
		{
			agent: { toolTimeoutMilliseconds: 1000 },
			happyRobot: { apiKey: "test-key", triggerURL },
		} as never,
		{ post } as never,
	)
	return { adapter, post }
}
describe("HappyRobot outbound adapter", () => {
	it("wraps v2 payload, preserves context and stores the provider run ID", async () => {
		const { adapter, post } = setup()
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toEqual({
			kind: "accepted",
			provider: "happyrobot",
			providerReference: "run_provider",
		})
		expect(post).toHaveBeenCalledWith(
			url,
			{
				payload: expect.objectContaining({
					call_identifier: "call_test",
					callback_url: request.callbackURL,
					incident_description: "Synthetic outage",
					outage_time: "14:30 UTC",
					phone_number: "+34600000000",
					services_down: "Orders, Tracking",
				}),
			},
			expect.objectContaining({
				headers: {
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				},
				timeout: 1000,
			}),
		)
	})
	it("authenticates direct webhooks with x-api-key and a flat payload", async () => {
		const hookURL = "https://workflows.platform.eu.happyrobot.ai/hooks/test"
		const { adapter, post } = setup(hookURL)
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toMatchObject({
			kind: "accepted",
			providerReference: "run_provider",
		})
		expect(post).toHaveBeenCalledWith(
			hookURL,
			expect.objectContaining({
				call_identifier: "call_test",
				callback_url: request.callbackURL,
				phone_number: "+34600000000",
			}),
			expect.objectContaining({
				headers: {
					"Content-Type": "application/json",
					"x-api-key": "test-key",
				},
			}),
		)
		expect(post.mock.calls[0][1]).not.toHaveProperty("payload")
	})
	it("rejects a webhook acknowledgement without a run ID", async () => {
		const { adapter, post } = setup(
			"https://workflows.platform.eu.happyrobot.ai/hooks/test",
			{},
		)
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toMatchObject({ kind: "failed" })
		expect(post).toHaveBeenCalledTimes(1)
	})
	it("keeps legacy webhook payloads compatible", async () => {
		const { adapter, post } = setup("https://example.test/trigger", {})
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toMatchObject({
			kind: "accepted",
			providerReference: "call_test",
		})
		expect(post.mock.calls[0][1]).toHaveProperty(
			"engineer_phone",
			"+34600000000",
		)
		expect(post.mock.calls[0][1]).not.toHaveProperty("payload")
	})
	it.each([{}, { run_id: "" }, { run_id: 123 }])(
		"rejects ambiguous v2 responses without redialing",
		async (data) => {
			const { adapter, post } = setup(url, data)
			await expect(
				adapter.start(request as never, jest.fn()),
			).resolves.toMatchObject({ kind: "failed" })
			expect(post).toHaveBeenCalledTimes(1)
		},
	)
	it("does not retry an ambiguous request timeout", async () => {
		const { adapter, post } = setup()
		post.mockReturnValue(throwError(() => new Error("timeout")))
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toMatchObject({ kind: "failed" })
		expect(post).toHaveBeenCalledTimes(1)
	})
	it.each([undefined, "invalid", "2026-09-19T14:30:00"])(
		"does not invent an outage time for %s",
		async (outageStartedAt) => {
			const { adapter, post } = setup()
			await adapter.start(
				{
					...request,
					incidentContext: {
						...request.incidentContext,
						outageStartedAt,
					},
				} as never,
				jest.fn(),
			)
			expect(post.mock.calls[0][1].payload.outage_time).toBe("")
		},
	)
	it("returns a bounded failure for malformed configuration", async () => {
		const { adapter, post } = setup("invalid URL")
		await expect(
			adapter.start(request as never, jest.fn()),
		).resolves.toMatchObject({ kind: "failed" })
		expect(post).not.toHaveBeenCalled()
	})
})
