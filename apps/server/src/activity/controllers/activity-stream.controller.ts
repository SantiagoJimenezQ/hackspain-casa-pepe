import { ListActivityDTO } from "@activity/dtos/list-activity.dto"
import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecordedEvent } from "@activity/types/activity.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, MessageEvent, Query, Sse } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { Observable, concat, filter, from, fromEvent, map, mergeMap } from "rxjs"

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
	stream(@Query() query: ListActivityDTO): Observable<MessageEvent> {
		const backlog = from(this.runsService.resolveRunIdentifier(query.runIdentifier)).pipe(
			mergeMap((runIdentifier) =>
				from(
					this.activityService.list({
						afterSequence: query.afterSequence,
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
		const live = from(this.runsService.resolveRunIdentifier(query.runIdentifier)).pipe(
			mergeMap((runIdentifier) =>
				fromEvent(this.eventEmitter, DOMAIN_EVENTS.ACTIVITY_RECORDED).pipe(
					map((event) => event as ActivityRecordedEvent),
					filter((event) => event.record.runIdentifier === runIdentifier || query.runIdentifier === undefined),
					filter((event) => !query.types.length || query.types.includes(event.record.type)),
					map((event) => ({ record: event.record, runIdentifier })),
				),
			),
		)
		return concat(backlog, live).pipe(
			map(({ record }) => ({
				data: record,
				id: String(record.sequence),
				type: record.type,
			})),
		)
	}
}
