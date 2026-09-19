import { ListActivityDTO } from "@activity/dtos/list-activity.dto"
import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { RunsService } from "@incidents/services/runs.service"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { ActivityStreamController } from "./activity-stream.controller"

describe("ActivityStreamController", () => {
	beforeEach(() => jest.useFakeTimers())
	afterEach(() => jest.useRealTimers())

	function setup() {
		const list = jest.fn().mockResolvedValue({ items: [] })
		const emitter = new EventEmitter2()
		const controller = new ActivityStreamController(
			{ list } as unknown as ActivityService,
			{ resolveRunIdentifier: jest.fn().mockResolvedValue("run-1") } as unknown as RunsService,
			emitter,
		)
		return { controller, list, emitter }
	}

	it("completes an idle stream before 300 seconds and removes its listener", async () => {
		const { controller, emitter } = setup()
		const complete = jest.fn()
		controller.stream(new ListActivityDTO()).subscribe({ complete })
		await jest.advanceTimersByTimeAsync(0)
		expect(emitter.listenerCount(DOMAIN_EVENTS.ACTIVITY_RECORDED)).toBe(1)
		await jest.advanceTimersByTimeAsync(239_999)
		expect(complete).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(1)
		expect(complete).toHaveBeenCalledTimes(1)
		expect(emitter.listenerCount(DOMAIN_EVENTS.ACTIVITY_RECORDED)).toBe(0)
	})

	it.each([["42", 42], ["invalid", 7], ["-1", 7], [undefined, 7]])(
		"resumes using Last-Event-ID %s or the original query",
		async (lastEventId, expected) => {
			const { controller, list } = setup()
			const query = new ListActivityDTO()
			query.afterSequence = 7
			const subscription = controller.stream(query, lastEventId).subscribe()
			await jest.advanceTimersByTimeAsync(0)
			expect(list).toHaveBeenCalledWith(expect.objectContaining({ afterSequence: expected }))
			subscription.unsubscribe()
			expect(jest.getTimerCount()).toBe(0)
		},
	)
})
