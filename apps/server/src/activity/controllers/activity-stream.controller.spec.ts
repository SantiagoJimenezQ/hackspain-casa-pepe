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
			{
				resolveRunIdentifier: jest.fn().mockResolvedValue("run-1"),
			} as unknown as RunsService,
			emitter,
		)
		return { controller, emitter, list }
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

	it.each([
		["42", 42],
		["invalid", 7],
		["-1", 7],
		[undefined, 7],
	])(
		"resumes using Last-Event-ID %s or the original query",
		async (lastEventId, expected) => {
			const { controller, list } = setup()
			const query = new ListActivityDTO()
			query.afterSequence = 7
			const subscription = controller
				.stream(query, lastEventId)
				.subscribe()
			await jest.advanceTimersByTimeAsync(0)
			expect(list).toHaveBeenCalledWith(
				expect.objectContaining({ afterSequence: expected }),
			)
			subscription.unsubscribe()
			expect(jest.getTimerCount()).toBe(0)
		},
	)
})

describe("stream backlog recovery", () => {
	it("drains multiple pages and buffers concurrent live events without duplicates", async () => {
		const emitter = new EventEmitter2()
		const record = (sequence: number) => ({
			runIdentifier: "run-1",
			sequence,
			type: "agent.llm-decision",
		})
		const list = jest
			.fn()
			.mockImplementationOnce(async () => {
				emitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, {
					record: record(3),
				})
				emitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, {
					record: record(4),
				})
				return { items: [record(1), record(2)] }
			})
			.mockResolvedValueOnce({ items: [record(3)] })
		const controller = new ActivityStreamController(
			{ list } as unknown as ActivityService,
			{
				resolveRunIdentifier: async () => "run-1",
			} as unknown as RunsService,
			emitter,
		)
		const query = new ListActivityDTO()
		query.runIdentifier = "run-1"
		query.limit = 2
		const received: string[] = []
		const sequences: number[] = []
		const subscription = controller.stream(query).subscribe((message) => {
			received.push(String(message.id))
			sequences.push((message.data as { sequence: number }).sequence)
		})
		await new Promise<void>((resolve) => setImmediate(resolve))
		expect(received).toEqual(["1", "2", "3", "4"])
		emitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, { record: record(6) })
		emitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, { record: record(5) })
		expect(sequences).toEqual([1, 2, 3, 4, 6, 5])
		expect(received.slice(-2)).toEqual(["6", "6"])

		expect(list).toHaveBeenLastCalledWith(
			expect.objectContaining({ afterSequence: 2 }),
		)
		subscription.unsubscribe()
		expect(emitter.listenerCount(DOMAIN_EVENTS.ACTIVITY_RECORDED)).toBe(0)
	})
})
