import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecord } from "@activity/types/activity.type"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { InvalidStateTransitionException } from "@common/exceptions/domain.exception"
import {
	elapsedMilliseconds,
	nowISO,
	sleep,
} from "@common/helpers/clock.helper"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable, Logger } from "@nestjs/common"
import { REPLAY_MAXIMUM_GAP_MILLISECONDS } from "@replays/constants/replay.constant"
import { ReplayState, StartReplayCommand } from "@replays/types/replay.type"

const IDLE_STATE: ReplayState = {
	emittedEvents: 0,
	finishedAt: "",
	runIdentifier: "",
	sourceRunIdentifier: "",
	speedFactor: 1,
	startedAt: "",
	status: "idle",
	totalEvents: 0,
}

@Injectable()
export class ReplaysService {
	private readonly logger = new Logger(ReplaysService.name)

	private state: ReplayState = IDLE_STATE

	constructor(
		private readonly incidentsService: IncidentsService,
		private readonly runsService: RunsService,
		private readonly activityService: ActivityService,
	) {}

	getState(): ReplayState {
		return this.state
	}

	async start(command: StartReplayCommand): Promise<ReplayState> {
		if (this.state.status === "running") {
			throw new InvalidStateTransitionException(
				"Replay",
				"running",
				"start another replay",
			)
		}
		const source = await this.runsService.getByRunIdentifier(
			command.sourceRunIdentifier,
		)
		const events = await this.activityService.listAllForRun(
			source.runIdentifier,
		)
		const incident = await this.incidentsService.startReplayRun(
			source.runIdentifier,
		)
		this.state = {
			emittedEvents: 0,
			finishedAt: "",
			runIdentifier: incident.runIdentifier,
			sourceRunIdentifier: source.runIdentifier,
			speedFactor: command.speedFactor,
			startedAt: nowISO(),
			status: "running",
			totalEvents: events.length,
		}
		this.logger.log(LOG_MESSAGES.REPLAYS.STARTED, {
			events: events.length,
			runIdentifier: incident.runIdentifier,
			sourceRunIdentifier: source.runIdentifier,
		})
		await this.activityService.record({
			correlation: {},
			incidentIdentifier: incident.identifier,
			payload: {
				sourceRunIdentifier: source.runIdentifier,
				speedFactor: command.speedFactor,
				totalEvents: events.length,
			},
			runIdentifier: incident.runIdentifier,
			simulated: true,
			source: "replay",
			summary: `Reproducing ${events.length} recorded events from run ${source.runIdentifier} at ${command.speedFactor}x. This is a replay, no action is executed`,
			title: "Replay started",
			type: "replay.started",
		})
		void this.emitSequence(
			incident.runIdentifier,
			incident.identifier,
			events,
		)
		return this.state
	}

	private async emitSequence(
		runIdentifier: string,
		incidentIdentifier: string,
		events: ReadonlyArray<ActivityRecord>,
	): Promise<void> {
		let previousOccurredAt = events.length ? events[0].occurredAt : nowISO()
		let emitted = 0
		for (const event of events) {
			const stillActive =
				await this.runsService.isRunActive(runIdentifier)
			if (!stillActive) {
				this.state = {
					...this.state,
					finishedAt: nowISO(),
					status: "cancelled",
				}
				return
			}
			const gap = Math.min(
				REPLAY_MAXIMUM_GAP_MILLISECONDS,
				Math.max(
					0,
					elapsedMilliseconds(previousOccurredAt, event.occurredAt),
				) / this.state.speedFactor,
			)
			await sleep(gap)
			previousOccurredAt = event.occurredAt
			await this.activityService.recordReplay({
				correlation: event.correlation,
				incidentIdentifier,
				payload: {
					...event.payload,
					originalOccurredAt: event.occurredAt,
					originalRunIdentifier: event.runIdentifier,
				},
				replayOfEventIdentifier: event.identifier,
				runIdentifier,
				simulated: event.simulated,
				source: "replay",
				summary: event.summary,
				title: `[Replay] ${event.title}`,
				type: event.type,
			})
			emitted += 1
			this.state = { ...this.state, emittedEvents: emitted }
		}
		await this.activityService.record({
			correlation: {},
			incidentIdentifier,
			payload: { emittedEvents: emitted },
			runIdentifier,
			simulated: true,
			source: "replay",
			summary: `Replay finished after reproducing ${emitted} events`,
			title: "Replay finished",
			type: "replay.finished",
		})
		this.state = { ...this.state, finishedAt: nowISO(), status: "finished" }
		this.logger.log(LOG_MESSAGES.REPLAYS.FINISHED, {
			emitted,
			runIdentifier,
		})
	}
}
