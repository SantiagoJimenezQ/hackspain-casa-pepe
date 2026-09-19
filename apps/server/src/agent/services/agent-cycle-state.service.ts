import { CycleOutcome, CycleState } from "@agent/types/agent.type"
import { nowISO } from "@common/helpers/clock.helper"
import { Injectable } from "@nestjs/common"

const INITIAL_STATE: CycleState = {
	inProgress: false,
	lastCycleAt: "",
	lastOutcome: null,
	rerunRequested: false,
}

@Injectable()
export class AgentCycleStateService {
	private readonly states = new Map<string, CycleState>()

	get(runIdentifier: string): CycleState {
		const state = this.states.get(runIdentifier)
		if (!state) {
			return INITIAL_STATE
		}
		return state
	}

	tryBegin(runIdentifier: string): boolean {
		const state = this.get(runIdentifier)
		if (state.inProgress) {
			this.states.set(runIdentifier, { ...state, rerunRequested: true })
			return false
		}
		this.states.set(runIdentifier, {
			...state,
			inProgress: true,
			rerunRequested: false,
		})
		return true
	}

	finish(runIdentifier: string, outcome: CycleOutcome): boolean {
		// A reset can forget this cycle while its provider request is in flight.
		if (!this.states.has(runIdentifier)) return false
		const state = this.get(runIdentifier)
		this.states.set(runIdentifier, {
			inProgress: false,
			lastCycleAt: nowISO(),
			lastOutcome: outcome,
			rerunRequested: false,
		})
		return state.rerunRequested
	}

	forget(runIdentifier: string): void {
		this.states.delete(runIdentifier)
	}
}
