import { ListActivityDTO } from "@activity/dtos/list-activity.dto"
import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecordedEvent } from "@activity/types/activity.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Headers, MessageEvent, Query, Sse } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { Observable } from "rxjs"

@ApiTags("Activity")
@ApiSecurity("operator")
@Controller("activity")
export class ActivityStreamController {
	constructor(
		private readonly activityService: ActivityService,
		private readonly runsService: RunsService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	@Sse("stream")
	@ApiOperation({
		summary:
			"Server-sent events with the activity of a run. Replays events after `afterSequence`, then pushes new ones live. Browsers can authenticate with ?apiKey=",
	})
	stream(
		@Query() query: ListActivityDTO,
		@Headers("last-event-id") lastEventId?: string,
	): Observable<MessageEvent> {
		// EventSource keeps its original URL when reconnecting; the header is newer.
		const resumeSequence = Number(lastEventId)
		const afterSequence =
			lastEventId &&
			Number.isSafeInteger(resumeSequence) &&
			resumeSequence >= 0
				? resumeSequence
				: query.afterSequence
		return new Observable<MessageEvent>((subscriber) => {
			let stopped = false
			let catchingUp = true
			let resolvedRun: string | undefined
			let cursor = afterSequence
			const buffered: ActivityRecordedEvent[] = []
			const delivered = new Set<string>()
			const matches = (event: ActivityRecordedEvent) =>
				(event.record.runIdentifier === resolvedRun ||
					query.runIdentifier === undefined) &&
				(!query.types.length || query.types.includes(event.record.type))
			const emit = (event: ActivityRecordedEvent) => {
				const key = `${event.record.runIdentifier}:${event.record.sequence}`
				if (
					!matches(event) ||
					delivered.has(key) ||
					(event.record.runIdentifier === resolvedRun &&
						event.record.sequence <= afterSequence)
				)
					return
				delivered.add(key)
				if (event.record.runIdentifier === resolvedRun)
					cursor = Math.max(cursor, event.record.sequence)
				subscriber.next({
					data: event.record,
					id: String(
						event.record.runIdentifier === resolvedRun
							? cursor
							: event.record.sequence,
					),
					type: event.record.type,
				})
			}
			const listener = (event: ActivityRecordedEvent) => {
				if (catchingUp) buffered.push(event)
				else emit(event)
			}
			// Subscribe before querying so events arriving during backlog fetch cannot disappear.
			this.eventEmitter.on(DOMAIN_EVENTS.ACTIVITY_RECORDED, listener)
			const timeout = setTimeout(() => subscriber.complete(), 240_000)
			void (async () => {
				resolvedRun = await this.runsService.resolveRunIdentifier(
					query.runIdentifier,
				)
				while (!stopped) {
					const page = await this.activityService.list({
						afterSequence: cursor,
						limit: query.limit,
						offset: 0,
						runIdentifier: resolvedRun,
						types: query.types,
					})
					if (stopped) return
					for (const record of page.items) emit({ record })
					if (page.items.length < query.limit) break
				}
				if (stopped) return
				catchingUp = false
				buffered
					.sort((a, b) => a.record.sequence - b.record.sequence)
					.forEach(emit)
				buffered.length = 0
			})().catch((error) => {
				if (!stopped) subscriber.error(error)
			})
			return () => {
				stopped = true
				clearTimeout(timeout)
				this.eventEmitter.off(DOMAIN_EVENTS.ACTIVITY_RECORDED, listener)
			}
		})
	}
}
