import { REPLAY_STATUSES } from "@replays/constants/replay.constant"

export type ReplayStatus = (typeof REPLAY_STATUSES)[number]

export interface ReplayState {
	readonly status: ReplayStatus
	readonly runIdentifier: string
	readonly sourceRunIdentifier: string
	readonly totalEvents: number
	readonly emittedEvents: number
	readonly speedFactor: number
	readonly startedAt: string
	readonly finishedAt: string
}

export interface StartReplayCommand {
	readonly sourceRunIdentifier: string
	readonly speedFactor: number
}
