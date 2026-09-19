import "reflect-metadata"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import { EngineersService } from "@engineers/services/engineers.service"
import {
	EngineerCallAdapter,
	EngineerCallResult,
	StartEngineerCallCommand,
} from "@engineers/types/engineer.type"
import { InMemoryRepository } from "@root/testing/in-memory-repository"

const result: EngineerCallResult = {
	answers: [],
	authorizations: {
		notifyAllClients: {
			rationale: "The outage affects every customer.",
			value: true,
		},
		trafficFailoverAuthorized: {
			rationale: "The responsible person did not authorize failover.",
			value: false,
		},
	},
	outcome: "completed",
	summary: "The responsible person answered the call.",
	transcript: "Agent: Please confirm.\nUser: Yes.",
}

function configuration(overrides: Record<string, unknown> = {}) {
	return {
		agent: {
			callTimeoutMilliseconds: 60_000,
			toolTimeoutMilliseconds: 1_000,
		},
		demo: {
			engineerName: "Marta Ruiz",
			engineerPhone: "+34600000000",
			engineerRole: "Platform on-call engineer",
		},
		elevenLabs: {
			pollIntervalMilliseconds: 1,
		},
		engineerCall: { mode: "live", provider: "elevenlabs" },
		runtime: { publicBaseURL: "https://example.test" },
		...overrides,
	} as never
}

function command(): StartEngineerCallCommand {
	return {
		engineer: {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		},
		incidentContext: {
			incidentDescription: "The primary region is down.",
			location: "eu-west-1",
			servicesDown: ["Orders database", "Route assignment"],
		},
		incidentIdentifier: "inc_test",
		planStepIdentifier: "step_test",
		purpose: "Confirm the recovery constraints.",
		questions: [],
		runIdentifier: "run_test",
		simulatedScript: { answersByKey: {}, summary: "unused" },
		toolCallIdentifier: "tool_test",
	}
}

function setup() {
	const repository = new InMemoryRepository<EngineerCallEntity>()
	const activity = { record: jest.fn().mockResolvedValue(undefined) }
	const runs = { isRunActive: jest.fn().mockResolvedValue(true) }
	const events = { emit: jest.fn() }
	const adapter: EngineerCallAdapter = {
		getResult: jest.fn().mockResolvedValue(result),
		mode: "live",
		provider: "elevenlabs",
		start: jest.fn().mockResolvedValue({
			kind: "accepted",
			provider: "elevenlabs",
			providerCallSid: "CA_test",
			providerReference: "conversation_test",
		}),
	}
	const service = new EngineersService(
		repository as never,
		adapter,
		activity as never,
		runs as never,
		configuration(),
		events as never,
	)
	return { activity, adapter, events, repository, runs, service }
}

describe("EngineersService outbound call runtime", () => {
	it("persists provider IDs and incident context and completes after a restart", async () => {
		const first = setup()
		const started = await first.service.startCall(command())
		expect(started.status).toBe("in-progress")
		expect(started.provider).toBe("elevenlabs")
		expect(started.providerReference).toBe("conversation_test")
		expect(started.providerCallSid).toBe("CA_test")
		expect(started.incidentContext.servicesDown).toEqual([
			"Orders database",
			"Route assignment",
		])

		const restarted = new EngineersService(
			first.repository as never,
			first.adapter,
			first.activity as never,
			first.runs as never,
			configuration(),
			first.events as never,
		)
		await restarted.pollPendingCallsNow()
		const completed = await restarted.getByIdentifier(started.identifier)

		expect(completed.status).toBe("completed")
		expect(completed.result?.authorizations).toEqual(result.authorizations)
		expect(first.adapter.getResult).toHaveBeenCalledWith(
			expect.objectContaining({
				providerCallSid: "CA_test",
				providerReference: "conversation_test",
			}),
		)
	})

	it("records HappyRobot permissions without completing the call or emitting a recovery event", async () => {
		const state = setup()
		const started = await state.service.startCall(command())
		await state.repository.update(
			{ identifier: started.identifier },
			{ provider: "happyrobot" },
		)
		await state.service.recordAuthorizations(
			started.identifier,
			result.authorizations,
		)
		const pending = await state.service.getByIdentifier(started.identifier)
		expect(pending.status).toBe("in-progress")
		expect(pending.finishedAt).toBe("")
		expect(pending.result?.authorizations).toEqual(result.authorizations)
		expect(state.events.emit).not.toHaveBeenCalled()
		expect(state.activity.record).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "engineer-call.authorization-received",
			}),
		)
		const count = state.activity.record.mock.calls.length
		await state.service.recordAuthorizations(
			started.identifier,
			result.authorizations,
		)
		expect(state.activity.record).toHaveBeenCalledTimes(count)
		await state.service.completeCall(started.identifier, result)
		await state.service.recordAuthorizations(started.identifier, {
			notifyAllClients: { rationale: "Late update", value: false },
			trafficFailoverAuthorized: {
				rationale: "Existing refusal",
				value: false,
			},
		})
		expect(
			(await state.service.getByIdentifier(started.identifier)).result,
		).toEqual(result)
	})

	it("rejects in-call evidence for another provider or an inactive incident", async () => {
		const state = setup()
		const started = await state.service.startCall(command())
		await expect(
			state.service.recordAuthorizations(
				started.identifier,
				result.authorizations,
			),
		).rejects.toThrow()
		await state.repository.update(
			{ identifier: started.identifier },
			{ provider: "happyrobot" },
		)
		state.runs.isRunActive.mockResolvedValue(false)
		await expect(
			state.service.recordAuthorizations(
				started.identifier,
				result.authorizations,
			),
		).rejects.toThrow("no longer active")
	})

	it("rejects late results from an inactive run without completing the call", async () => {
		const setupState = setup()
		const started = await setupState.service.startCall(command())
		setupState.runs.isRunActive.mockResolvedValue(false)

		await setupState.service.pollPendingCallsNow()
		expect(setupState.adapter.getResult).not.toHaveBeenCalled()
		await expect(
			setupState.service.completeCall(started.identifier, result),
		).rejects.toThrow("no longer active")
		await expect(
			setupState.service.getByIdentifier(started.identifier),
		).resolves.toMatchObject({ status: "in-progress" })
	})

	it("marks an accepted call terminal after the bounded timeout", async () => {
		const setupState = setup()
		const old: EngineerCallEntity = {
			...(await setupState.service.startCall(command())),
			startedAt: new Date(Date.now() - 61_000).toISOString(),
		} as unknown as EngineerCallEntity
		await setupState.repository.update({ identifier: old.identifier }, old)

		await setupState.service.pollPendingCallsNow()
		const timedOut = await setupState.service.getByIdentifier(
			old.identifier,
		)

		expect(timedOut.status).toBe("no-answer")
		expect(timedOut.failureReason).toMatch(/Timed out/)
		expect(setupState.adapter.getResult).not.toHaveBeenCalled()
		expect(setupState.activity.record).toHaveBeenCalledWith(
			expect.objectContaining({ type: "engineer-call.failed" }),
		)
	})
})
