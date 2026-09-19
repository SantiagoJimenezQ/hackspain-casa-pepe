import { ListActivityDTO } from "@activity/dtos/list-activity.dto"
import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecordedEvent } from "@activity/types/activity.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Headers, MessageEvent, Query, Sse } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import {
	concat,
	filter,
	from,
	fromEvent,
	map,
	mergeMap,
	Observable,
	takeUntil,
	timer,
} from "rxjs"

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
		const backlog = from(
			this.runsService.resolveRunIdentifier(query.runIdentifier),
		).pipe(
			mergeMap((runIdentifier) =>
				from(
					this.activityService.list({
						afterSequence,
						limit: query.limit,
						offset: 0,
						runIdentifier,
						types: query.types,
					}),
				).pipe(
					mergeMap((page) => from(page.items)),
					map((record) => ({ record, runIdentifier })),
				),
			),
		)
		const live = from(
			this.runsService.resolveRunIdentifier(query.runIdentifier),
		).pipe(
			mergeMap((runIdentifier) =>
				fromEvent(
					this.eventEmitter,
					DOMAIN_EVENTS.ACTIVITY_RECORDED,
				).pipe(
					map((event) => event as ActivityRecordedEvent),
					filter(
						(event) =>
							event.record.runIdentifier === runIdentifier ||
							query.runIdentifier === undefined,
					),
					filter(
						(event) =>
							!query.types.length ||
							query.types.includes(event.record.type),
					),
					map((event) => ({ record: event.record, runIdentifier })),
				),
			),
		)
		return concat(backlog, live).pipe(
			// End normally before Vercel kills the invocation at 300 seconds.
			takeUntil(timer(240_000)),
			map(({ record }) => ({
				data: record,
				id: String(record.sequence),
				type: record.type,
			})),
		)
	}
}
