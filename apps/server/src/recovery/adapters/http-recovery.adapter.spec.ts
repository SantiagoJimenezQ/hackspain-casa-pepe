import { HTTPRecoveryAdapter } from "./http-recovery.adapter"

describe("delivery verification", () => {
	const original = global.fetch
	afterEach(() => {
		global.fetch = original
	})
	function adapter() {
		return new HTTPRecoveryAdapter(
			{
				agent: { toolTimeoutMilliseconds: 20000 },
				recovery: {
					environmentAPIKey: "placeholder",
					environmentURL: "http://localhost:4100",
				},
			} as never,
			{} as never,
		)
	}
	it("requires a matching delivery, run and route", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			json: async () => ({
				deliveryIdentifier: "verification-run-1",
				routeIdentifier: "route-1",
				runIdentifier: "run-1",
				status: "assigned",
			}),
			ok: true,
		})
		expect(
			await adapter().verify("run-1", "route-assignment"),
		).toMatchObject({ verified: true })
		global.fetch = jest.fn().mockResolvedValue({
			json: async () => ({ status: "healthy" }),
			ok: true,
		})
		expect(
			await adapter().verify("run-1", "route-assignment"),
		).toMatchObject({ verified: false })
	})
	it("fails closed for unreachable delivery service", async () => {
		global.fetch = jest.fn().mockRejectedValue(new Error("offline"))
		expect(
			await adapter().verify("run-1", "route-assignment"),
		).toMatchObject({ status: "down", verified: false })
	})
})
