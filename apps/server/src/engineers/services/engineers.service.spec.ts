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
		engineerCall: {
			fallbackToSimulated: false,
			mode: "live",
			provider: "elevenlabs",
		},
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

function setup(configurationOverrides: Record<string, unknown> = {}) {
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
	const fallbackAdapter: EngineerCallAdapter = {
		mode: "simulated",
		start: jest.fn().mockResolvedValue({
			kind: "accepted",
			providerReference: "simulated:test",
		}),
	}
	const service = new EngineersService(
		repository as never,
		adapter,
		fallbackAdapter,
		activity as never,
		runs as never,
		configuration(configurationOverrides),
		events as never,
	)
	return {
		activity,
		adapter,
		events,
		fallbackAdapter,
		repository,
		runs,
		service,
	}
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
			first.fallbackAdapter,
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

describe("EngineersService live permissions", () => {
	const report = {
		callIdentifier: "",
		notifyAllClients: true,
		rationale: "He said yes to both.",
		trafficFailoverAuthorized: true,
	}

	it("stores permissions while the call is still open, without ending it", async () => {
		const state = setup()
		const started = await state.service.startCall(command())

		const record = await state.service.recordLiveAuthorizations({
			...report,
			callIdentifier: started.identifier,
		})

		expect(record.status).toBe("in-progress")
		expect(record.result?.authorizations?.notifyAllClients.value).toBe(true)
		expect(
			record.result?.authorizations?.trafficFailoverAuthorized.value,
		).toBe(true)
		expect(state.activity.record).toHaveBeenCalledWith(
			expect.objectContaining({ type: "engineer-call.authorized" }),
		)
		expect(state.events.emit).toHaveBeenCalledWith(
			"domain.engineer-call.authorized",
			expect.objectContaining({
				call: expect.objectContaining({
					identifier: started.identifier,
				}),
			}),
		)
	})

	it("keeps a refusal as a refusal instead of dropping it", async () => {
		const state = setup()
		const started = await state.service.startCall(command())

		const record = await state.service.recordLiveAuthorizations({
			callIdentifier: started.identifier,
			notifyAllClients: false,
			rationale: "He refused.",
			trafficFailoverAuthorized: false,
		})

		expect(record.result?.authorizations?.notifyAllClients.value).toBe(
			false,
		)
	})

	it("lets the provider analysis overwrite the live report when the call ends", async () => {
		const state = setup()
		const started = await state.service.startCall(command())
		await state.service.recordLiveAuthorizations({
			...report,
			callIdentifier: started.identifier,
		})

		await state.service.completeCall(started.identifier, result)
		const finished = await state.service.getByIdentifier(started.identifier)

		expect(finished.status).toBe("completed")
		expect(finished.result?.authorizations).toEqual(result.authorizations)
		expect(finished.result?.transcript).toBe(result.transcript)
	})

	it("refuses a late report once the call is terminal", async () => {
		const state = setup()
		const started = await state.service.startCall(command())
		await state.service.completeCall(started.identifier, result)

		await expect(
			state.service.recordLiveAuthorizations({
				...report,
				callIdentifier: started.identifier,
			}),
		).rejects.toThrow()
	})

	it("ignores a report from a run that is no longer active", async () => {
		const state = setup()
		const started = await state.service.startCall(command())
		state.runs.isRunActive.mockResolvedValue(false)

		await expect(
			state.service.recordLiveAuthorizations({
				...report,
				callIdentifier: started.identifier,
			}),
		).rejects.toThrow()
	})

	it("keeps the response moving by simulating a call the provider refused", async () => {
		const state = setup({
			engineerCall: {
				fallbackToSimulated: true,
				mode: "live",
				provider: "elevenlabs",
			},
		})
		state.adapter.start = jest.fn().mockResolvedValue({
			kind: "failed",
			reason: "HTTP 401 error: account is not active",
		})

		const started = await state.service.startCall(command())

		expect(started.status).toBe("in-progress")
		expect(started.mode).toBe("simulated")
		expect(started.providerReference).toBe("simulated:test")
		expect(state.fallbackAdapter.start).toHaveBeenCalledTimes(1)
	})

	it("fails the call when the deployment forbids the simulated fallback", async () => {
		const state = setup()
		state.adapter.start = jest.fn().mockResolvedValue({
			kind: "failed",
			reason: "HTTP 401 error: account is not active",
		})

		const started = await state.service.startCall(command())

		expect(started.status).toBe("failed")
		expect(state.fallbackAdapter.start).not.toHaveBeenCalled()
	})
})
