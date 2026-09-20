import { HTTPRecoveryAdapter } from "@recovery/adapters/http-recovery.adapter"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { RecoveryProbeController } from "./recovery-probe.controller"

describe("manual delivery probe", () => {
	const originalFetch = global.fetch
	afterEach(() => {
		global.fetch = originalFetch
	})
	function harness(mode = "http") {
		const run = createImpactedIncident(4)
		const runs = { getByRunIdentifier: jest.fn().mockResolvedValue(run) }
		const config = {
			agent: { toolTimeoutMilliseconds: 5000 },
			recovery: {
				environmentAPIKey: "test-only-placeholder",
				environmentURL: "http://localhost:4100",
				mode,
			},
		}
		const adapter = new HTTPRecoveryAdapter(config as never, {} as never)
		const activity = { record: jest.fn() }
		return {
			activity,
			controller: new RecoveryProbeController(
				runs as never,
				config as never,
				adapter,
				activity as never,
			),
			run,
			runs,
		}
	}
	it("exposes a failed check then a matching route and audits both without changing incident state", async () => {
		const h = harness()
		global.fetch = jest
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				text: async () => "Service unavailable",
			})
			.mockResolvedValueOnce({
				json: async () => ({
					deliveryIdentifier: `verification-${h.run.runIdentifier}`,
					routeIdentifier: "route-proof",
					runIdentifier: h.run.runIdentifier,
					status: "assigned",
				}),
				ok: true,
			})
		expect(
			await h.controller.probe({ runIdentifier: h.run.runIdentifier }),
		).toMatchObject({ routeIdentifier: null, verified: false })
		expect(
			await h.controller.probe({ runIdentifier: h.run.runIdentifier }),
		).toMatchObject({
			mode: "http",
			routeIdentifier: "route-proof",
			runIdentifier: h.run.runIdentifier,
			verified: true,
		})
		expect(h.activity.record).toHaveBeenCalledTimes(2)
		expect(h.activity.record).toHaveBeenLastCalledWith(
			expect.objectContaining({
				simulated: false,
				type: "recovery.probed",
			}),
		)
		expect(
			h.run.services.find((s) => s.identifier === "route-assignment")
				?.status,
		).toBe("down")
	})
	it.each(["simulated", "replay", "inactive", "randomized"])(
		"does not contact the HTTP target in %s mode",
		async (mode) => {
			const h = harness(mode === "simulated" ? mode : "http")
			h.runs.getByRunIdentifier.mockResolvedValue({
				...h.run,
				active: mode !== "inactive",
				runKind: mode === "replay" ? "replay" : "live",
				simulation: {
					...h.run.simulation,
					mode: mode === "randomized" ? "randomized" : "manual",
				},
			})
			global.fetch = jest.fn()
			await expect(
				h.controller.probe({ runIdentifier: h.run.runIdentifier }),
			).rejects.toThrow()
			expect(global.fetch).not.toHaveBeenCalled()
		},
	)
	it("rejects a late result after reset and does not publish it", async () => {
		const h = harness()
		h.runs.getByRunIdentifier
			.mockResolvedValueOnce(h.run)
			.mockResolvedValueOnce({ ...h.run, active: false })
		global.fetch = jest.fn().mockRejectedValue(new Error("offline"))
		await expect(
			h.controller.probe({ runIdentifier: h.run.runIdentifier }),
		).rejects.toThrow()
		expect(h.activity.record).not.toHaveBeenCalled()
	})
})
