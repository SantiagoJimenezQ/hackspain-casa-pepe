import {
	ELEVENLABS_CONVERSATION_URL,
	ELEVENLABS_OUTBOUND_CALL_URL,
	ElevenLabsEngineerCallAdapter,
} from "@engineers/adapters/elevenlabs-engineer-call.adapter"
import {
	AdapterCallRequest,
	EngineerCallRecord,
	EngineerCallResult,
} from "@engineers/types/engineer.type"
import { Logger } from "@nestjs/common"
import { EngineerCallIncidentContext } from "../../../../../packages/contracts/outbound-calls"

type FetchMock = jest.MockedFunction<typeof fetch>
const originalFetch = global.fetch

const fetchMock = (): FetchMock => {
	const mock = jest.fn() as unknown as FetchMock
	global.fetch = mock
	return mock
}

function response(body: unknown, status = 200): Response {
	return {
		headers: new Headers({ "x-request-id": "req_test" }),
		json: async () => body,
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(body),
	} as Response
}

function configuration(overrides: Record<string, unknown> = {}) {
	return {
		agent: { toolTimeoutMilliseconds: 100 },
		elevenLabs: {
			agentId: "agent_test",
			apiKey: "secret-key",
			phoneNumberId: "phone_test",
			pollIntervalMilliseconds: 5_000,
		},
		...overrides,
	} as never
}

function call(overrides: Partial<EngineerCallRecord> = {}): EngineerCallRecord {
	return {
		engineer: {
			name: "Lucía Responsable",
			phone: "+34600111222",
			role: "platform engineer",
		},
		failureReason: "",
		finishedAt: "",
		identifier: "call_test",
		incidentContext: {
			incidentDescription:
				"The data region is down and recovery decisions are needed.",
			location: "eu-west-1",
			servicesDown: ["orders", "tracking"],
		},
		incidentIdentifier: "incident_test",
		mode: "live",
		planStepIdentifier: "step_test",
		provider: "elevenlabs",
		providerCallSid: "CA_test",
		providerReference: "conv_test",
		purpose: "The data region is down and recovery decisions are needed.",
		questions: [],
		result: null,
		runIdentifier: "run_test",
		startedAt: "2026-09-19T10:00:00.000Z",
		status: "dialing",
		toolCallIdentifier: "tool_test",
		...overrides,
	}
}

function request(
	incidentContext: Partial<EngineerCallIncidentContext> = {},
	callOverrides: Partial<EngineerCallRecord> = {},
): AdapterCallRequest {
	return {
		call: call(callOverrides),
		callbackURL: "https://example.test/api/webhooks/happyrobot",
		incidentContext: {
			incidentDescription:
				"The data region is down and recovery decisions are needed.",
			location: "eu-west-1",
			servicesDown: ["orders", "tracking"],
			...incidentContext,
		},
		simulatedScript: { answersByKey: {}, summary: "unused" },
	}
}

describe("ElevenLabsEngineerCallAdapter", () => {
	afterEach(() => {
		global.fetch = originalFetch
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	it("starts a call with the documented endpoint and dynamic variables", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				callSid: "CA_test",
				conversation_id: "conv_test",
				success: true,
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const outcome = await adapter.start(
			request({
				incidentDescription:
					"First sentence. Second sentence. Third sentence is omitted.",
				location: "eu-west-1",
				servicesDown: ["orders", "tracking"],
			}),
			async () => undefined,
		)

		expect(outcome).toEqual({
			kind: "accepted",
			provider: "elevenlabs",
			providerCallSid: "CA_test",
			providerReference: "conv_test",
		})
		expect(fetch).toHaveBeenCalledTimes(1)
		expect(fetch).toHaveBeenCalledWith(
			ELEVENLABS_OUTBOUND_CALL_URL,
			expect.objectContaining({
				headers: {
					"Content-Type": "application/json",
					"xi-api-key": "secret-key",
				},
				method: "POST",
				redirect: "error",
			}),
		)
		const init = fetch.mock.calls[0][1] as RequestInit
		expect(JSON.parse(String(init.body))).toEqual({
			agent_id: "agent_test",
			agent_phone_number_id: "phone_test",
			conversation_initiation_client_data: {
				dynamic_variables: {
					contact_name: "Lucía Responsable",
					incident_description: "First sentence. Second sentence.",
					location: "eu-west-1",
					outage_time: "",
					questions: "",
					questions_count: "0",
					services_down: "orders, tracking",
				},
			},
			to_number: "+34600111222",
		})
		expect(init.signal).toBeInstanceOf(AbortSignal)
	})

	it.each([
		["2026-09-19T14:30:00+02:00", "12:30 UTC"],
		["2026-09-19T08:05:00Z", "08:05 UTC"],
		[undefined, ""],
		["invalid", ""],
		["2026-09-19T14:30:00", ""],
	])(
		"sends outage time %s as %s without substituting call time",
		async (outageStartedAt, expected) => {
			const fetch = fetchMock()
			fetch.mockResolvedValue(
				response({
					callSid: "CA_test",
					conversation_id: "conv_test",
					success: true,
				}),
			)
			const adapter = new ElevenLabsEngineerCallAdapter(configuration())
			await adapter.start(
				request({ outageStartedAt }),
				async () => undefined,
			)
			const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body))
			expect(
				payload.conversation_initiation_client_data.dynamic_variables
					.outage_time,
			).toBe(expected)
		},
	)

	it("fails safely when the provider rejects the start request without retrying", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({ error: "secret provider details" }, 502),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const outcome = await adapter.start(request(), async () => undefined)

		expect(outcome).toEqual({
			kind: "failed",
			reason: "ElevenLabs outbound call returned HTTP 502",
		})
		expect(JSON.stringify(outcome)).not.toContain("secret provider details")
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it("does not dial when the provider configuration is incomplete", async () => {
		const fetch = fetchMock()
		const adapter = new ElevenLabsEngineerCallAdapter(
			configuration({
				elevenLabs: {
					agentId: "agent_test",
					apiKey: "",
					phoneNumberId: "phone_test",
					pollIntervalMilliseconds: 5_000,
				},
			}),
		)

		await expect(
			adapter.start(request(), async () => undefined),
		).resolves.toEqual({
			kind: "failed",
			reason: "ElevenLabs is not configured; set the API key, agent ID, and phone number ID",
		})
		expect(fetch).not.toHaveBeenCalled()
	})

	it("rejects a destination that is not an E.164 number before dialing", async () => {
		const fetch = fetchMock()
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(
			adapter.start(
				request(
					{},
					{
						engineer: {
							name: "Lucía Responsable",
							phone: "600111222",
							role: "platform engineer",
						},
					},
				),
				async () => undefined,
			),
		).resolves.toEqual({
			kind: "failed",
			reason: "ElevenLabs destination number must be in E.164 format",
		})
		expect(fetch).not.toHaveBeenCalled()
	})

	it("sanitizes network failures and does not retry the outbound call", async () => {
		const fetch = fetchMock()
		fetch.mockRejectedValue(new Error("secret-key and provider payload"))
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const outcome = await adapter.start(request(), async () => undefined)

		expect(outcome).toEqual({
			kind: "failed",
			reason: "ElevenLabs start request failed; inspect the provider before retrying",
		})
		expect(JSON.stringify(outcome)).not.toContain("secret-key")
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it("aborts a stalled response body at the configured timeout", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		jest.useFakeTimers()
		const fetch = fetchMock()
		fetch.mockImplementation(async (_input, init) => {
			const signal = init?.signal
			return {
				json: () =>
					new Promise((_resolve, reject) => {
						signal?.addEventListener("abort", () => {
							const error = new Error("aborted")
							error.name = "AbortError"
							reject(error)
						})
					}),
				ok: true,
				status: 200,
			} as Response
		})
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const pending = adapter.start(request(), async () => undefined)
		await jest.advanceTimersByTimeAsync(100)

		await expect(pending).resolves.toEqual({
			kind: "failed",
			reason: "ElevenLabs start request timed out",
		})
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				elapsedMilliseconds: 100,
				stage: "request",
				timeoutMilliseconds: 100,
			}),
		)
	})

	it("does not accept a successful response without both provider identifiers", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({ conversation_id: "conv_test", success: true }),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(
			adapter.start(request(), async () => undefined),
		).resolves.toEqual({
			kind: "failed",
			reason: "ElevenLabs returned an invalid outbound call response",
		})
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				httpStatus: 200,
				stage: "invalid_response",
			}),
		)
	})

	it("keeps the result pending until the call is done and analyzed", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				analysis: null,
				conversation_id: "conv_test",
				status: "processing",
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(adapter.getResult(call())).resolves.toBeNull()
		expect(fetch).toHaveBeenCalledWith(
			`${ELEVENLABS_CONVERSATION_URL}/conv_test`,
			expect.objectContaining({
				headers: { "xi-api-key": "secret-key" },
				method: "GET",
				redirect: "error",
			}),
		)

		fetch.mockResolvedValue(
			response({ conversation_id: "conv_test", status: "done" }),
		)
		await expect(adapter.getResult(call())).resolves.toBeNull()
	})

	it("maps data collection results back to one answer per asked question", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				agent_id: "agent_test",
				analysis: {
					call_successful: "success",
					data_collection_results: {
						backup_capacity: {
							rationale:
								"Only seven of the twelve units are real.",
							value: false,
						},
						"database-snapshot": {
							rationale: "The snapshot is twelve minutes old.",
							value: true,
						},
						routeAssignmentReadiness: {
							value: "Ready once the database answers.",
						},
					},
					transcript_summary:
						"The engineer answered the three questions.",
				},
				conversation_id: "conv_test",
				status: "done",
				transcript: [],
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const result = await adapter.getResult(
			call({
				questions: [
					{
						key: "database-snapshot",
						question: "How old is the snapshot?",
					},
					{
						key: "route-assignment-readiness",
						question: "Is route assignment ready?",
					},
					{
						key: "backup-capacity",
						question: "Can we count on the units?",
					},
					{ key: "unanswered", question: "Never collected" },
				],
			}),
		)

		expect(result?.answers).toEqual([
			{
				answer: "The snapshot is twelve minutes old.",
				confirmed: true,
				key: "database-snapshot",
				question: "How old is the snapshot?",
			},
			{
				answer: "Ready once the database answers.",
				key: "route-assignment-readiness",
				question: "Is route assignment ready?",
			},
			{
				answer: "Only seven of the twelve units are real.",
				confirmed: false,
				key: "backup-capacity",
				question: "Can we count on the units?",
			},
		])
	})

	it("returns no answers when the agent collected nothing", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				agent_id: "agent_test",
				analysis: { call_successful: "success" },
				conversation_id: "conv_test",
				status: "done",
				transcript: [],
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const result = await adapter.getResult(
			call({
				questions: [
					{
						key: "database-snapshot",
						question: "How old is the snapshot?",
					},
				],
			}),
		)

		expect(result?.answers).toEqual([])
	})

	it("maps literal authorization booleans and rationales separately from engineer answers", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				agent_id: "agent_test",
				analysis: {
					call_successful: "success",
					data_collection_results: {
						notify_all_clients: {
							rationale: "The incident affects every customer.",
							value: true,
						},
						traffic_failover_authorized: {
							rationale:
								"The responsible person explicitly denied this.",
							value: false,
						},
					},
					transcript_summary:
						"The responsible person answered both permissions.",
				},
				conversation_id: "conv_test",
				status: "done",
				transcript: [
					{ message: "Necesito contexto.", role: "agent" },
					{ message: "Sí, avisad a los clientes.", role: "user" },
				],
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		const result = (await adapter.getResult(
			call(),
		)) as EngineerCallResult & {
			authorizations: {
				notifyAllClients: { value: boolean | null; rationale: string }
				trafficFailoverAuthorized: {
					value: boolean | null
					rationale: string
				}
			}
		}

		expect(result).toMatchObject({
			answers: [],
			authorizations: {
				notifyAllClients: {
					rationale: "The incident affects every customer.",
					value: true,
				},
				trafficFailoverAuthorized: {
					rationale: "The responsible person explicitly denied this.",
					value: false,
				},
			},
			outcome: "completed",
			summary: "The responsible person answered both permissions.",
			transcript:
				"agent: Necesito contexto.\nuser: Sí, avisad a los clientes.",
		})
	})

	it("preserves unanswered permissions when a successful call ends before the questions", async () => {
		// Sanitized shape observed in the direct-provider rehearsal on 2026-09-19.
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				agent_id: "agent_test",
				analysis: {
					call_successful: "success",
					data_collection_results: {
						notify_all_clients: {
							rationale:
								"The notification question was not asked.",
							value: null,
						},
						traffic_failover_authorized: {
							rationale: "The failover question was not asked.",
							value: null,
						},
					},
					transcript_summary:
						"The call ended before the permission questions.",
				},
				conversation_id: "conv_test",
				metadata: { termination_reason: "Call ended by remote party" },
				status: "done",
				transcript: [{ message: "Sí, sí.", role: "user" }],
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(adapter.getResult(call())).resolves.toMatchObject({
			answers: [],
			authorizations: {
				notifyAllClients: {
					rationale: "The notification question was not asked.",
					value: null,
				},
				trafficFailoverAuthorized: {
					rationale: "The failover question was not asked.",
					value: null,
				},
			},
			outcome: "completed",
			transcript: "user: Sí, sí.",
		})
	})

	it("returns a terminal provider failure instead of polling forever", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				conversation_id: "conv_test",
				status: "failed",
				transcript: [{ message: "No answer.", role: "agent" }],
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(adapter.getResult(call())).resolves.toMatchObject({
			answers: [],
			outcome: "failed",
			summary: "ElevenLabs conversation failed",
			transcript: "agent: No answer.",
		})
	})

	it("ignores a result that belongs to another conversation", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(
			response({
				analysis: { call_successful: "success" },
				conversation_id: "conv_other",
				status: "done",
			}),
		)
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(adapter.getResult(call())).resolves.toBeNull()
	})

	it("treats provider and malformed result responses as pending", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValue(response({ error: "do not expose" }, 500))
		const adapter = new ElevenLabsEngineerCallAdapter(configuration())

		await expect(adapter.getResult(call())).resolves.toBeNull()
		fetch.mockResolvedValue(response("not-json"))
		await expect(adapter.getResult(call())).resolves.toBeNull()
	})
})

describe("ElevenLabs provider diagnostics", () => {
	afterEach(() => {
		global.fetch = originalFetch
		jest.restoreAllMocks()
	})

	it("logs HTTP diagnostics and correlation while redacting echoed secrets and recipient data", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		fetchMock().mockResolvedValue(
			response(
				{
					detail: {
						authorization: "Bearer hidden",
						message: "Rejected secret-key for +34600111222",
						status: "invalid_api_key",
					},
				},
				401,
			),
		)
		const outcome = await new ElevenLabsEngineerCallAdapter(
			configuration(),
		).start(request(), async () => {})
		expect(outcome.kind).toBe("failed")
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				callIdentifier: "call_test",
				event: "elevenlabs_provider_failure",
				httpStatus: 401,
				operation: "start",
				requestIds: { "x-request-id": "req_test" },
			}),
		)
		const logged = JSON.stringify(log.mock.calls)
		expect(logged).toContain("invalid_api_key")
		for (const secret of ["secret-key", "+34600111222", "Bearer hidden"])
			expect(logged).not.toContain(secret)
	})

	it("retains non-JSON polling errors and request IDs", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		fetchMock().mockResolvedValue(
			new Response("Upstream unavailable", {
				headers: { "request-id": "req_poll" },
				status: 502,
			}),
		)
		expect(
			await new ElevenLabsEngineerCallAdapter(configuration()).getResult(
				call(),
			),
		).toBeNull()
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				body: "Upstream unavailable",
				httpStatus: 502,
				operation: "result",
				requestIds: { "request-id": "req_poll" },
			}),
		)
	})

	it("logs network error causes without exposing credentials", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		fetchMock().mockRejectedValue(
			Object.assign(new Error("secret-key connection failed"), {
				cause: new Error("ECONNRESET"),
			}),
		)
		await new ElevenLabsEngineerCallAdapter(configuration()).start(
			request(),
			async () => {},
		)
		const logged = JSON.stringify(log.mock.calls)
		expect(logged).toContain("ECONNRESET")
		expect(logged).not.toContain("secret-key")
	})
})
