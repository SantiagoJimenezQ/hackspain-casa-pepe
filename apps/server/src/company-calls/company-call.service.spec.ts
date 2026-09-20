import "reflect-metadata"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { CompanyCallEntity } from "./company-call.entity"
import {
	CompanyCallService,
	publicEvidence,
	resolveCompany,
} from "./company-call.service"

function setup() {
	const sessions = new Map<string, CompanyCallEntity>()
	const runs = new Map<string, IncidentEntity>()
	const audits: unknown[] = []
	const run = Object.assign(new IncidentEntity(), {
		active: true,
		callCode: "123456",
		customers: [
			{
				identifier: "company-1",
				name: "Happy Robot",
				serviceIdentifiers: ["orders"],
				shortName: "HR",
			},
		],
		identifier: "incident-1",
		resources: [{ allocatedCapacity: 2, totalCapacity: 6 }],
		runIdentifier: "run-1",
		runKind: "live",
		status: "impacted",
		updatedAt: "old",
	})
	runs.set(run.identifier, run)
	const matches = (row: object, where: object) =>
		Object.entries(where).every(([k, v]) =>
			typeof v === "object" && v !== null
				? String(Reflect.get(row, k)) <=
					String(Reflect.get(v, "_value"))
				: Reflect.get(row, k) === v,
		)
	const repo = (map: Map<string, object>) => ({
		find: async ({ where }: { where: object }) =>
			[...map.values()].filter((r) =>
				Array.isArray(where)
					? where.some((w) => matches(r, w))
					: matches(r, where),
			),
		findOne: async ({ where }: { where: object }) =>
			[...map.values()].find((r) => matches(r, where)) ?? null,
		findOneBy: async (where: object) =>
			[...map.values()].find((r) => matches(r, where)) ?? null,
		insert: async (row: CompanyCallEntity) => {
			map.set(
				row.identifier,
				Object.assign(
					{ nextDispatchAt: "", payloadHash: "", receivedAt: "" },
					structuredClone(row),
				),
			)
		},
		save: async (row: CompanyCallEntity) => {
			map.set(row.identifier, row)
			return row
		},
		update: async (where: object, update: object) => {
			let affected = 0
			for (const row of map.values())
				if (matches(row, where)) {
					Object.assign(row, update)
					affected++
				}
			return { affected }
		},
	})
	const sessionRepo = repo(sessions)
	const auditRepo = {
		create: (x: unknown) => x,
		createQueryBuilder: () => {
			const q = {
				getRawOne: async () => ({ sequence: audits.length }),
				select: () => q,
				where: () => q,
			}
			return q
		},
		insert: jest.fn(async (x: unknown) => {
			audits.push(x)
		}),
	}
	const manager = {
		getRepository: (type: unknown) =>
			type === CompanyCallEntity
				? sessionRepo
				: type === IncidentEntity
					? repo(runs)
					: auditRepo,
		query: jest.fn().mockResolvedValue([]),
	}
	let queue = Promise.resolve()
	const transaction = <T>(
		fn: (m: typeof manager) => Promise<T>,
	): Promise<T> => {
		const result = queue.then(async () => {
			const before = structuredClone([...sessions.entries()])
			const beforeRuns = structuredClone([...runs.entries()])
			const count = audits.length
			try {
				return await fn(manager)
			} catch (e) {
				sessions.clear()
				for (const [k, v] of before) sessions.set(k, v)
				runs.clear()
				for (const [k, v] of beforeRuns) runs.set(k, v)
				audits.splice(count)
				throw e
			}
		})
		queue = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}
	const events = { emit: jest.fn() }
	const service = new CompanyCallService(
		{ ...sessionRepo, manager: { ...manager, transaction } } as never,
		events as never,
		{ reserveSequence: (_run: string, max: number) => max + 1 } as never,
	)
	const input = (sessionReference: string, customerName = "Happy Robot") => ({
		outcome: {
			customerName,
			kind: "priority-request" as const,
			requestedPriority: "first" as const,
		},
		schemaVersion: 1 as const,
		sessionReference,
	})
	return {
		auditRepo,
		audits,
		events,
		input,
		manager,
		run,
		runs,
		service,
		sessions,
	}
}
describe("inbound company priority persistence", () => {
	it("deduplicates concurrent bindings and receipts without changing capacity", async () => {
		const h = setup()
		const capacity = structuredClone(h.run.resources)
		const bindings = await Promise.all([
			h.service.initiate("provider-1", "incident-1"),
			h.service.initiate("provider-1", "incident-1"),
		])
		expect(bindings[0]).toEqual(bindings[1])
		expect(h.sessions.size).toBe(1)
		const receipts = await Promise.all([
			h.service.receive(h.input(bindings[0].sessionReference)),
			h.service.receive(h.input(bindings[0].sessionReference)),
		])
		expect(receipts[0]).toEqual(receipts[1])
		expect(h.audits).toHaveLength(1)
		expect(
			h.events.emit.mock.calls.filter(
				(c) => c[0] === "domain.company-priority.received",
			),
		).toHaveLength(1)
		expect(h.run.resources).toEqual(capacity)
		const listed = await h.service.list("run-1")
		expect(listed[0]).toMatchObject({
			customerIdentifier: "company-1",
			resolution: "matched",
			serviceIdentifiers: ["orders"],
		})
		expect(JSON.stringify(listed)).not.toContain(
			bindings[0].sessionReference,
		)
	})
	it("rejects changed payloads without overwriting original evidence", async () => {
		const h = setup()
		const { sessionReference } = await h.service.initiate(
			"provider-1",
			"incident-1",
		)
		await h.service.receive(h.input(sessionReference))
		await expect(
			h.service.receive(h.input(sessionReference, "Different company")),
		).rejects.toMatchObject({ status: 409 })
		expect((await h.service.list("run-1"))[0].outcome.customerName).toBe(
			"Happy Robot",
		)
	})
	it("rejects unknown, inactive and replay incidents", async () => {
		const h = setup()
		await expect(h.service.initiate("a", "missing")).rejects.toMatchObject({
			status: 404,
		})
		const run = h.runs.get("incident-1")
		if (!run) throw new Error("Missing fixture")
		run.active = false
		await expect(
			h.service.initiate("a", "incident-1"),
		).rejects.toMatchObject({ status: 409 })
		const replay = h.runs.get("incident-1")
		if (!replay) throw new Error("Missing fixture")
		replay.active = true
		replay.runKind = "replay"
		await expect(
			h.service.initiate("a", "incident-1"),
		).rejects.toMatchObject({ status: 409 })
	})
	it("selects only the caller's exact incident despite other active runs", async () => {
		const h = setup()
		h.runs.set("other", {
			...h.run,
			identifier: "other",
			runIdentifier: "run-2",
		})
		const result = await h.service.initiate("a", "other")
		expect(result).toMatchObject({
			incidentIdentifier: "other",
			runIdentifier: "run-2",
		})
		expect(await h.service.initiate("a", "run-2")).toEqual(result)
		await expect(
			h.service.initiate("a", "incident-1"),
		).rejects.toMatchObject({ status: 409 })
		expect(h.sessions.size).toBe(1)
	})
	it("allows correcting an unknown ID before binding", async () => {
		const h = setup()
		await expect(h.service.initiate("a", "typo")).rejects.toMatchObject({
			status: 404,
		})
		expect(h.sessions.size).toBe(0)
		await expect(
			h.service.initiate("a", "incident-1"),
		).resolves.toMatchObject({ runIdentifier: "run-1" })
	})
	it("binds a spoken code and preserves the same session for canonical IDs", async () => {
		const h = setup()
		const binding = await h.service.initiate("a", "123 456")
		expect(binding).toMatchObject({
			callCode: "123456",
			incidentIdentifier: "incident-1",
		})
		expect(await h.service.initiate("a", "123-456")).toEqual(binding)
		expect(await h.service.initiate("a", "incident-1")).toEqual(binding)
		await expect(h.service.initiate("b", "12345")).rejects.toMatchObject({
			status: 404,
		})
	})
	it("never rebinds after reset", async () => {
		const h = setup()
		const { sessionReference } = await h.service.initiate("a", "incident-1")
		h.run.active = false
		h.runs.set("replacement", {
			...h.run,
			active: true,
			identifier: "replacement",
			runIdentifier: "run-2",
		})
		await expect(
			h.service.initiate("a", "incident-1"),
		).rejects.toMatchObject({
			status: 409,
		})
		await expect(
			h.service.receive(h.input(sessionReference)),
		).rejects.toMatchObject({ status: 409 })
		expect(h.audits).toHaveLength(0)
	})
	it("retains unknown companies and rejects unknown sessions", async () => {
		const h = setup()
		await expect(
			h.service.receive(h.input("unknown")),
		).rejects.toMatchObject({ status: 404 })
		const { sessionReference } = await h.service.initiate("a", "incident-1")
		await h.service.receive(h.input(sessionReference, "Hapy Robot"))
		expect((await h.service.list("run-1"))[0]).toMatchObject({
			customerIdentifier: null,
			resolution: "needs-clarification",
			serviceIdentifiers: [],
		})
	})
	it("rolls back the receipt if audit persistence fails", async () => {
		const h = setup()
		const { sessionReference } = await h.service.initiate("a", "incident-1")
		h.auditRepo.insert.mockRejectedValueOnce(
			new Error("database unavailable"),
		)
		await expect(
			h.service.receive(h.input(sessionReference)),
		).rejects.toThrow("database unavailable")
		expect(await h.service.list("run-1")).toEqual([])
		expect(h.events.emit).not.toHaveBeenCalled()
	})
	it("recovers pending work and stops after observation", async () => {
		const h = setup()
		const { sessionReference } = await h.service.initiate("a", "incident-1")
		await h.service.receive(h.input(sessionReference))
		h.events.emit.mockClear()
		await h.service.dispatchPending()
		expect(h.events.emit).toHaveBeenCalledTimes(1)
		await h.service.dispatchPending()
		expect(h.events.emit).toHaveBeenCalledTimes(1)
		await h.service.markObserved([...h.sessions.keys()][0])
		await h.service.dispatchPending()
		expect(h.events.emit).toHaveBeenCalledTimes(1)
	})
	it("does not resolve ambiguous aliases", () => {
		const h = setup()
		expect(resolveCompany(" HR ", h.run.customers)?.identifier).toBe(
			"company-1",
		)
		expect(
			resolveCompany("HR", [
				...h.run.customers,
				{ ...h.run.customers[0], identifier: "company-2" },
			]),
		).toBeNull()
	})
	it("rejects serializing an empty session", () =>
		expect(() =>
			publicEvidence({ outcome: null } as CompanyCallEntity),
		).toThrow())
})
