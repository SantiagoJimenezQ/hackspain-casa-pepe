import { IncomingCallDTO } from "@engineers/dtos/incoming-call.dto"
import { IncomingCallEntity } from "@engineers/entities/incoming-call.entity"
import { plainToInstance } from "class-transformer"
import { validate } from "class-validator"
import { IncomingCallsService } from "./incoming-calls.service"

function setup() {
	let stored: IncomingCallEntity | undefined
	let inserted = false
	const query = {
		execute: async () => ({
			raw: inserted ? [{ identifier: stored.identifier }] : [],
		}),
		insert: () => query,
		orIgnore: () => query,
		returning: () => query,
		values: (value) => {
			inserted = !stored
			if (!stored) stored = value
			return query
		},
	}
	const repository = {
		create: (x) => x,
		createQueryBuilder: () => query,
		findOne: async () => stored,
		findOneByOrFail: async () => stored,
		manager: {
			transaction: async (fn) => fn({ getRepository: () => repository }),
		},
		save: async (x) => {
			stored = x
			return x
		},
	}
	const runs = {
		getByRunIdentifier: jest.fn().mockResolvedValue({
			active: true,
			harnessEvents: [],
			identifier: "inc-1",
			runIdentifier: "run-1",
			runKind: "live",
		}),
	}
	const incidents = { applyHarnessEvent: jest.fn() }
	const activity = { record: jest.fn() }
	const events = { emit: jest.fn() }
	const service = new IncomingCallsService(
		repository as never,
		runs as never,
		incidents as never,
		activity as never,
		events as never,
	)
	const report = {
		callerName: "Demo engineer",
		providerCallIdentifier: "provider-1",
		reportedCapacity: 7,
		runIdentifier: "run-1",
		summary: "Only seven units remain",
	}
	return { events, incidents, report, runs, service }
}
describe("incoming calls", () => {
	it("records an untrusted claim, wakes the agent, and does not change capacity", async () => {
		const s = setup()
		const call = await s.service.receive(s.report, "simulated")
		expect(call.status).toBe("pending")
		expect(s.events.emit).toHaveBeenCalled()
		expect(s.incidents.applyHarnessEvent).not.toHaveBeenCalled()
	})
	it("deduplicates callback retries and rejects changed payloads", async () => {
		const s = setup()
		const one = await s.service.receive(s.report, "live")
		const two = await s.service.receive(s.report, "live")
		expect(one.identifier).toBe(two.identifier)
		await expect(
			s.service.receive({ ...s.report, reportedCapacity: 2 }, "live"),
		).rejects.toThrow("different content")
	})
	it("applies an operator-confirmed capacity once", async () => {
		const s = setup()
		const call = await s.service.receive(s.report, "simulated")
		const confirmation = { confirmedCapacity: 7, operatorName: "Operator" }
		await s.service.confirm(call.identifier, confirmation)
		await s.service.confirm(call.identifier, confirmation)
		expect(s.incidents.applyHarnessEvent).toHaveBeenCalledTimes(1)
		expect(s.incidents.applyHarnessEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				availableCapacity: 7,
				type: "capacity-limited",
			}),
			expect.stringContaining(call.identifier),
			"run-1",
		)
		await expect(
			s.service.confirm(call.identifier, {
				...confirmation,
				confirmedCapacity: 12,
			}),
		).rejects.toThrow("different capacity")
	})
	it("rejects callbacks after reset and replay callbacks", async () => {
		const s = setup()
		s.runs.getByRunIdentifier.mockResolvedValue({ active: false })
		await expect(s.service.receive(s.report, "live")).rejects.toThrow()
		s.runs.getByRunIdentifier.mockResolvedValue({
			active: true,
			runKind: "replay",
		})
		await expect(s.service.receive(s.report, "live")).rejects.toThrow()
	})
	it("validates capacity and payload sizes at the HTTP boundary", async () => {
		const s = setup()
		expect(
			await validate(plainToInstance(IncomingCallDTO, s.report)),
		).toHaveLength(0)
		expect(
			(
				await validate(
					plainToInstance(IncomingCallDTO, {
						...s.report,
						reportedCapacity: -1,
						summary: "x".repeat(2001),
					}),
				)
			).length,
		).toBe(2)
	})
})
