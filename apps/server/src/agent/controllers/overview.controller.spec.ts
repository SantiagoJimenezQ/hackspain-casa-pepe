import { createImpactedIncident } from "@root/testing/incident.fixture"
import { OverviewController } from "./overview.controller"

function fixture() {
	const incident = createImpactedIncident(4)
	const reference = {
		runIdentifier: incident.runIdentifier,
		updatedAt: incident.updatedAt,
	}
	const runs = {
		getByRunIdentifier: jest.fn(async () => incident),
		getReference: jest.fn(async () => reference),
	}
	const plans = { findLatestPlan: jest.fn(async () => null) }
	const approvals = { list: jest.fn(async () => []) }
	const tasks = { list: jest.fn(async () => []) }
	const engineers = { list: jest.fn(async () => []) }
	const tools = { list: jest.fn(async () => []) }
	const registry = { describeAll: jest.fn(() => []) }
	const activity = {
		countForRun: jest.fn(async () => 4),
		deliveryProbes: jest.fn(async () => []),
		list: jest.fn(async () => ({ items: [] })),
	}
	const agent = {
		getStatus: jest.fn(),
		statusFromSnapshot: jest.fn(() => ({})),
		statusVersion: jest.fn(() => "idle"),
	}
	const controller = new OverviewController(
		runs as never,
		plans as never,
		approvals as never,
		tasks as never,
		engineers as never,
		tools as never,
		registry as never,
		activity as never,
		agent as never,
		{ happyRobot: {} } as never,
	)
	return {
		activity,
		agent,
		approvals,
		controller,
		engineers,
		plans,
		reference,
		runs,
		tasks,
		tools,
	}
}

describe("conditional overview", () => {
	it("returns an unchanged marker without reloading any payloads", async () => {
		const f = fixture()
		const snapshot = await f.controller.overview({})
		jest.clearAllMocks()
		expect(
			await f.controller.overview({ knownRevision: snapshot.revision }),
		).toEqual({ revision: snapshot.revision, unchanged: true })
		for (const read of [
			f.runs.getByRunIdentifier,
			f.plans.findLatestPlan,
			f.approvals.list,
			f.tasks.list,
			f.engineers.list,
			f.tools.list,
			f.activity.list,
			f.activity.deliveryProbes,
			f.agent.getStatus,
		])
			expect(read).not.toHaveBeenCalled()
	})

	it.each(["run", "incident", "activity", "agent"])(
		"invalidates the revision after a %s change",
		async (change) => {
			const f = fixture()
			const first = await f.controller.overview({})
			if (change === "run")
				f.reference.runIdentifier = "another-browser-run"
			if (change === "incident")
				f.reference.updatedAt = "2026-09-22T21:00:00.000Z"
			if (change === "activity")
				f.activity.countForRun.mockResolvedValue(5)
			if (change === "agent")
				f.agent.statusVersion.mockReturnValue("running")
			const next = await f.controller.overview({
				knownRevision: first.revision,
			})
			expect(next).not.toHaveProperty("unchanged")
			expect(next.revision).not.toEqual(first.revision)
		},
	)

	it("reuses loaded data for agent status and keeps unversioned callers compatible", async () => {
		const f = fixture()
		await f.controller.overview({})
		await f.controller.overview({})
		expect(f.runs.getByRunIdentifier).toHaveBeenCalledTimes(2)
		expect(f.plans.findLatestPlan).toHaveBeenCalledTimes(2)
		expect(f.tools.list).toHaveBeenCalledTimes(2)
		expect(f.agent.getStatus).not.toHaveBeenCalled()
		expect(f.agent.statusFromSnapshot).toHaveBeenCalledTimes(2)
	})

	it("does not label a snapshot with a revision sampled after a concurrent write", async () => {
		const f = fixture()
		f.runs.getByRunIdentifier.mockImplementationOnce(async () => {
			f.activity.countForRun.mockResolvedValue(5)
			return createImpactedIncident(4)
		})
		const snapshot = await f.controller.overview({})
		expect(
			await f.controller.overview({ knownRevision: snapshot.revision }),
		).not.toHaveProperty("unchanged")
	})
})
