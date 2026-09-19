import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { ActivityService } from "./activity.service"

describe("LLM history pagination", () => {
	it("returns newest records and an exclusive cursor without skipping the next page", async () => {
		const find = jest.fn().mockResolvedValue(
			[3, 2, 1].map((sequence) =>
				Object.assign(new ActivityEventEntity(), {
					identifier: `event-${sequence}`,
					payload: { text: `Turn ${sequence}` },
					sequence,
				}),
			),
		)
		const service = new ActivityService({ find } as never, {} as never)
		const page = await service.llmHistory("run-1", 2, 9)
		expect(page.items.map((item) => item.sequence)).toEqual([3, 2])
		expect(page.nextBeforeSequence).toBe(2)
		expect(find).toHaveBeenCalledWith(
			expect.objectContaining({
				order: { sequence: "DESC" },
				take: 3,
				where: expect.objectContaining({
					runIdentifier: "run-1",
					sequence: expect.objectContaining({
						_type: "lessThan",
						_value: 9,
					}),
				}),
			}),
		)
		find.mockResolvedValue([{ sequence: 1 }])
		expect(
			(
				await service.llmHistory(
					"run-1",
					2,
					page.nextBeforeSequence ?? undefined,
				)
			).nextBeforeSequence,
		).toBeNull()
	})
})
