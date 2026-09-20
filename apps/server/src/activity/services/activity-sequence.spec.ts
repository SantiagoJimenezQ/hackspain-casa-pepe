import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { ActivityService } from "./activity.service"

function entry(summary: string) {
	return {
		correlation: {},
		incidentIdentifier: "inc-1",
		payload: {},
		runIdentifier: "run-1",
		simulated: false,
		source: "agent" as const,
		summary,
		title: "Recorded",
		type: "fact.recorded" as const,
	}
}

describe("Activity sequence numbering", () => {
	it("gives every concurrent record its own number while the counter is still cold", async () => {
		// The seeding query resolves late on purpose: every record arrives before it lands.
		const findOne = jest.fn().mockImplementation(
			() =>
				new Promise((resolve) => {
					setTimeout(
						() =>
							resolve(
								Object.assign(new ActivityEventEntity(), {
									sequence: 7,
								}),
							),
						5,
					)
				}),
		)
		const saved: ActivityEventEntity[] = []
		const repository = {
			create: (values: Partial<ActivityEventEntity>) =>
				Object.assign(new ActivityEventEntity(), values),
			findOne,
			insert: (entity: ActivityEventEntity) => {
				saved.push(entity)
				return Promise.resolve({ identifiers: [] })
			},
		}
		const service = new ActivityService(
			repository as never,
			{
				emit: jest.fn(),
			} as never,
		)

		const records = await Promise.all([
			service.record(entry("one")),
			service.record(entry("two")),
			service.record(entry("three")),
		])

		const sequences = records
			.map((item) => item.sequence)
			.sort((first, second) => first - second)
		expect(sequences).toEqual([8, 9, 10])
		expect(new Set(sequences).size).toBe(3)
		expect(findOne).toHaveBeenCalledTimes(1)
	})
	it("reserves transaction audit numbers ahead of normal activity writers", async () => {
		const service = new ActivityService(
			{
				create: (values: Partial<ActivityEventEntity>) =>
					Object.assign(new ActivityEventEntity(), values),
				insert: jest.fn().mockResolvedValue({ identifiers: [] }),
			} as never,
			{ emit: jest.fn() } as never,
		)
		expect(service.reserveSequence("run-1", 7)).toBe(8)
		expect((await service.record(entry("next"))).sequence).toBe(9)
		expect(service.reserveSequence("run-1", 7)).toBe(10)
	})
})
