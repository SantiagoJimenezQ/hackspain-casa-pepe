import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { ChangeCapacityDTO } from "@incidents/dtos/change-capacity.dto"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import { ValidationPipe } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InMemoryRepository } from "@root/testing/in-memory-repository"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { ScenariosService } from "@scenarios/services/scenarios.service"

async function harness() {
	const repository = new InMemoryRepository<IncidentEntity>()
	const incident = createImpactedIncident(4)
	const entity = {
		...incident,
		topologyLinks: incident.topology.links,
		topologyNodes: incident.topology.nodes,
	} as unknown as IncidentEntity
	await repository.save(entity)
	await repository.save({
		...entity,
		identifier: "inc-other",
		resources: entity.resources.map((resource) => ({ ...resource })),
		runIdentifier: "run-other",
	})
	const activity = { record: jest.fn().mockResolvedValue({}) }
	const emitter = new EventEmitter2()
	const runs = new RunsService(repository as never)
	const service = new IncidentsService(
		repository as never,
		runs,
		new ScenariosService(),
		activity as never,
		emitter,
		{} as never,
		{} as never,
	)
	return { activity, emitter, incident, repository, runs, service }
}

describe("targeted capacity controls", () => {
	it("updates the named non-active resource, preserves other runs and records before/after and reason", async () => {
		const h = await harness()
		const changed = jest.fn()
		h.emitter.on(DOMAIN_EVENTS.INCIDENT_EVENT_APPLIED, changed)
		const result = await h.service.applyHarnessEvent(
			{
				availableCapacity: 1,
				reason: "Mantenimiento imprevisto",
				resourceIdentifier: "backup-bahrain",
				type: "capacity-limited",
			},
			"Demo controls",
			h.incident.runIdentifier,
		)
		expect(
			result.resources.find((r) => r.identifier === "backup-oman")
				?.totalCapacity,
		).toBe(4)
		expect(
			result.resources.find((r) => r.identifier === "backup-bahrain")
				?.totalCapacity,
		).toBe(1)
		expect(
			(await h.runs.getByRunIdentifier("run-other")).resources.find(
				(r) => r.identifier === "backup-bahrain",
			)?.totalCapacity,
		).not.toBe(1)
		expect(result.harnessEvents.at(-1)?.event).toMatchObject({
			availableCapacity: 1,
			previousCapacity: 12,
			resourceIdentifier: "backup-bahrain",
		})
		expect(h.activity.record).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					previousCapacity: 12,
					reason: "Mantenimiento imprevisto",
					resourceIdentifier: "backup-bahrain",
				}),
				type: "resource.capacity-changed",
			}),
		)
		expect(changed).toHaveBeenCalledTimes(1)
	})
	it("keeps the legacy 4-to-1 twist targeting the active backup and supports increases", async () => {
		const h = await harness()
		const result = await h.service.applyHarnessEvent(
			{
				availableCapacity: 1,
				reason: "Capacidad limitada",
				type: "capacity-limited",
			},
			"test",
			h.incident.runIdentifier,
		)
		expect(result.harnessEvents.at(-1)?.event).toMatchObject({
			previousCapacity: 4,
			resourceIdentifier: "backup-oman",
		})
		const increased = await h.service.applyHarnessEvent(
			{
				availableCapacity: 8,
				reason: "Capacidad recuperada",
				resourceIdentifier: "backup-oman",
				type: "capacity-limited",
			},
			"test",
			h.incident.runIdentifier,
		)
		expect(increased.resources[0].totalCapacity).toBe(8)
		expect(
			increased.topology.nodes.find(
				(n) => n.region === increased.resources[0].region,
			)?.status,
		).toBe("up")
	})
	it("rejects unknown resources and capacity below existing allocations without recording an event", async () => {
		const h = await harness()
		const entity = await h.runs.getEntityByRunIdentifier(
			h.incident.runIdentifier,
		)
		entity.resources = entity.resources.map((r) =>
			r.identifier === "backup-oman" ? { ...r, allocatedCapacity: 3 } : r,
		)
		await h.repository.save(entity)
		for (const resourceIdentifier of ["missing", "backup-oman"]) {
			await expect(
				h.service.applyHarnessEvent(
					{
						availableCapacity: 1,
						reason: "Test",
						resourceIdentifier,
						type: "capacity-limited",
					},
					"test",
					h.incident.runIdentifier,
				),
			).rejects.toThrow()
		}
		expect(h.activity.record).not.toHaveBeenCalled()
		expect(
			(await h.runs.getByRunIdentifier(h.incident.runIdentifier))
				.resources[0].totalCapacity,
		).toBe(4)
	})
	it.each(["inactive", "replay"])("rejects %s runs", async (mode) => {
		const h = await harness()
		const entity = await h.runs.getEntityByRunIdentifier(
			h.incident.runIdentifier,
		)
		if (mode === "inactive") entity.active = false
		else entity.runKind = "replay"
		await h.repository.save(entity)
		await expect(
			h.service.applyHarnessEvent(
				{
					availableCapacity: 1,
					reason: "Test",
					type: "capacity-limited",
				},
				"test",
				h.incident.runIdentifier,
			),
		).rejects.toThrow()
		expect(h.activity.record).not.toHaveBeenCalled()
	})
	it.each([
		{ totalCapacity: -1 },
		{ totalCapacity: 1.5 },
		{ runIdentifier: "" },
		{ resourceIdentifier: "" },
		{ reason: "" },
	])("validates request %j", async (invalid) => {
		await expect(
			new ValidationPipe({ transform: true }).transform(
				{
					reason: "Test",
					resourceIdentifier: "backup-oman",
					runIdentifier: "run-1",
					totalCapacity: 1,
					...invalid,
				},
				{ metatype: ChangeCapacityDTO, type: "body" },
			),
		).rejects.toThrow()
	})
})
