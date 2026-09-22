import { sessionContext } from "@authentication/session/browser-session"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { InMemoryRepository } from "@root/testing/in-memory-repository"
import { DataSource, Repository } from "typeorm"
import { RunsService } from "./runs.service"

describe("egress-aware run selection", () => {
	const now = new Date("2026-09-22T20:00:00.000Z")
	afterEach(() => jest.useRealTimers())

	it("excludes abandoned, finished, inactive and replay runs before loading state", async () => {
		jest.useFakeTimers().setSystemTime(now)
		const repository = new InMemoryRepository<IncidentEntity>()
		const service = new RunsService(
			repository as unknown as Repository<IncidentEntity>,
		)
		for (const [identifier, fields] of Object.entries({
			boundary: { updatedAt: "2026-09-22T19:30:00.000Z" },
			inactive: { active: false },
			live: {},
			normal: { status: "normal" },
			old: { updatedAt: "2026-09-22T19:29:59.999Z" },
			recovered: { status: "recovered" },
			replay: { runKind: "replay" },
			reset: { status: "reset" },
		})) {
			await repository.insert(
				Object.assign(new IncidentEntity(), {
					active: true,
					createdAt: now.toISOString(),
					identifier,
					runIdentifier: identifier,
					runKind: "live",
					status: "responding",
					updatedAt: now.toISOString(),
					...fields,
				}),
			)
		}
		expect(
			(await service.listLiveEntities())
				.map((run) => run.identifier)
				.sort(),
		).toEqual(["boundary", "live"])
	})

	it("resolves only the current browser's reference and projects out large JSON", async () => {
		const repository = new InMemoryRepository<IncidentEntity>()
		const service = new RunsService(
			repository as unknown as Repository<IncidentEntity>,
		)
		for (const browserSessionId of ["alice", "bob"])
			await repository.insert(
				Object.assign(new IncidentEntity(), {
					active: true,
					browserSessionId,
					createdAt: now.toISOString(),
					facts: [{ statement: "large payload" }],
					identifier: browserSessionId,
					runIdentifier: browserSessionId,
					updatedAt: now.toISOString(),
				}),
			)
		await sessionContext.run("alice", async () => {
			expect(await service.getReference()).toEqual({
				runIdentifier: "alice",
				updatedAt: now.toISOString(),
			})
			await expect(service.getReference("bob")).rejects.toThrow()
		})
	})

	it("generates simulation SQL that selects only identifiers and filters JSON in Postgres", async () => {
		const database = new DataSource({
			entities: [IncidentEntity],
			type: "postgres",
		})
		await (
			database as unknown as { buildMetadatas(): Promise<void> }
		).buildMetadatas()
		const repository = database.getRepository(IncidentEntity)
		const find = jest.spyOn(repository, "find").mockResolvedValue([])
		await new RunsService(repository).listAutomaticSimulationRuns()
		const options = find.mock.calls[0][0] ?? {}
		const [sql, params] = repository
			.createQueryBuilder("IncidentEntity")
			.setFindOptions(options)
			.getQueryAndParameters()
		expect(sql.split(" FROM ")[0]).not.toMatch(
			/facts|simulation|services|customers/,
		)
		expect(sql).toContain(`"IncidentEntity"."simulation" ->> 'mode'`)
		expect(sql).toContain(`"IncidentEntity"."simulation" ->> 'paused'`)
		expect(sql).toContain('"updatedAt" >=')
		expect(params).toEqual(
			expect.arrayContaining([
				true,
				"live",
				"detected",
				"responding",
				"partially-recovered",
				"randomized",
				"false",
			]),
		)
	})
})
