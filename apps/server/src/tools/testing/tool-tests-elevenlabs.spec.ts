import "reflect-metadata"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	ELEVENLABS_CONVERSATION_URL,
	ELEVENLABS_OUTBOUND_CALL_URL,
	ElevenLabsEngineerCallAdapter,
} from "@engineers/adapters/elevenlabs-engineer-call.adapter"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { ToolTestsService } from "@tools/testing/tool-tests.service"

type Where = Record<string, unknown>
type FetchMock = jest.MockedFunction<typeof fetch>

/** Repository double with the same conditional-update behavior as Postgres. */
class ConditionalRepository {
	private readonly rows = new Map<string, ToolTestEntity>()

	create(partial: Partial<ToolTestEntity>): ToolTestEntity {
		return { ...partial } as ToolTestEntity
	}

	async insert(entity: ToolTestEntity): Promise<void> {
		if (
			[...this.rows.values()].some(
				(row) =>
					row.identifier === entity.identifier ||
					row.idempotencyKey === entity.idempotencyKey,
			)
		) {
			const error = new Error("duplicate key") as Error & { code: string }
			error.code = "23505"
			throw error
		}
		this.rows.set(entity.identifier, { ...entity })
	}

	async findOne(options: { where: Where }): Promise<ToolTestEntity | null> {
		const row = [...this.rows.values()].find((candidate) =>
			this.matches(candidate, options.where),
		)
		return row ? { ...row } : null
	}

	async update(criteria: Where, changes: Partial<ToolTestEntity>) {
		let affected = 0
		for (const [identifier, row] of this.rows) {
			if (!this.matches(row, criteria)) {
				continue
			}
			this.rows.set(identifier, { ...row, ...changes })
			affected += 1
		}
		return { affected }
	}

	async read(identifier: string): Promise<ToolTestEntity | null> {
		return this.findOne({ where: { identifier } })
	}

	private matches(row: ToolTestEntity, where: Where): boolean {
		return Object.entries(where).every(([key, expected]) => {
			if (
				expected &&
				typeof expected === "object" &&
				"value" in expected
			) {
				const values = (expected as { value: unknown }).value
				return Array.isArray(values)
					? values.includes(row[key as keyof ToolTestEntity])
					: values === row[key as keyof ToolTestEntity]
			}
			return row[key as keyof ToolTestEntity] === expected
		})
	}
}

function configuration(): ConfigurationService {
	return {
		agent: {
			approvalTimeoutMilliseconds: 10_000,
			callTimeoutMilliseconds: 60_000,
			maximumCyclesPerRun: 4,
			maximumStepAttempts: 2,
			maximumStepsPerCycle: 8,
			toolTimeoutMilliseconds: 1_000,
		},
		demo: {
			engineerName: "Marta Ruiz",
			engineerPhone: "+34600000000",
			engineerRole: "Platform on-call engineer",
		},
		elevenLabs: {
			agentId: "agent_test",
			apiKey: "secret-key",
			phoneNumberId: "phone_test",
			pollIntervalMilliseconds: 5_000,
		},
		email: {
			apiKey: "",
			from: "",
			mode: "simulated",
			to: "",
		},
		engineerCall: {
			mode: "live",
			provider: "elevenlabs",
		},
		happyRobot: {
			apiKey: "",
			mode: "simulated",
			simulatedCallDelayMilliseconds: 0,
			triggerURL: "",
			webhookSecret: "test-secret",
		},
		runtime: {
			environment: "test",
			port: 3000,
			publicBaseURL: "https://casa-pepe.example",
		},
	} as ConfigurationService
}

function service() {
	const repository = new ConditionalRepository()
	const settings = configuration()
	const elevenLabs = new ElevenLabsEngineerCallAdapter(settings)
	const instance = new ToolTestsService(
		repository as never,
		settings,
		elevenLabs,
		elevenLabs,
	)
	return { elevenLabs, instance, repository }
}

function response(body: unknown, status = 200): Response {
	return {
		json: async () => body,
		ok: status >= 200 && status < 300,
		status,
	} as Response
}

function fetchMock(): FetchMock {
	const mock = jest.fn() as unknown as FetchMock
	global.fetch = mock
	return mock
}

function liveCallInput(idempotencyKey: string) {
	return {
		engineer: { name: "Marta Ruiz", phone: "+34600000000" },
		idempotencyKey,
		mode: "live" as const,
		tool: "call_engineer" as const,
	}
}

describe("ToolTestsService with ElevenLabs", () => {
	const originalFetch = global.fetch

	afterEach(() => {
		global.fetch = originalFetch
	})

	it("defaults to simulation even when ElevenLabs live mode is configured", async () => {
		const fetch = fetchMock()
		const { instance } = service()
		expect(
			instance.catalog().find((entry) => entry.tool === "call_engineer"),
		).toMatchObject({ liveAvailable: true, provider: "elevenlabs" })
		const result = await instance.execute({
			idempotencyKey: "offline",
			tool: "call_engineer",
		})
		expect(result).toMatchObject({
			mode: "simulated",
			provider: null,
			status: "succeeded",
		})
		expect(fetch).not.toHaveBeenCalled()
	})

	it("starts once, exposes provider IDs, and preserves analyzed authorizations", async () => {
		const fetch = fetchMock()
		fetch
			.mockResolvedValueOnce(
				response({
					callSid: "CA_test",
					conversation_id: "conv_test",
					success: true,
				}),
			)
			.mockResolvedValueOnce(
				response({
					analysis: null,
					conversation_id: "conv_test",
					status: "processing",
				}),
			)
			.mockResolvedValueOnce(
				response({
					agent_id: "agent_test",
					analysis: {
						call_successful: "success",
						data_collection_results: {
							notify_all_clients: {
								rationale:
									"The incident affects every customer.",
								value: true,
							},
							traffic_failover_authorized: {
								rationale: "The engineer denied the failover.",
								value: false,
							},
						},
						transcript_summary: "Permissions were captured.",
					},
					conversation_id: "conv_test",
					status: "done",
					transcript: [
						{ message: "Necesito contexto.", role: "agent" },
						{ message: "Sí, avisad a los clientes.", role: "user" },
					],
				}),
			)

		const { instance } = service()
		const accepted = await instance.execute(liveCallInput("eleven-start-1"))

		expect(accepted).toEqual(
			expect.objectContaining({
				provider: "elevenlabs",
				providerCallSid: "CA_test",
				providerReference: "conv_test",
				status: "accepted",
			}),
		)
		expect(fetch).toHaveBeenCalledTimes(1)
		expect(fetch.mock.calls[0]?.[0]).toBe(ELEVENLABS_OUTBOUND_CALL_URL)
		const payload = JSON.parse(
			String((fetch.mock.calls[0]?.[1] as RequestInit).body),
		)
		expect(payload).toEqual({
			agent_id: "agent_test",
			agent_phone_number_id: "phone_test",
			conversation_initiation_client_data: {
				dynamic_variables: {
					contact_name: "Marta Ruiz",
					incident_description:
						"This is a standalone integration test. No real incident or recovery action is in progress.",
					location: "Casa Pepe synthetic test environment",
					services_down: "synthetic test service",
				},
			},
			to_number: "+34600000000",
		})

		const pending = await instance.get(accepted.identifier)
		expect(pending.status).toBe("accepted")
		expect(fetch.mock.calls[1]?.[0]).toBe(
			`${ELEVENLABS_CONVERSATION_URL}/conv_test`,
		)

		const completed = await instance.get(accepted.identifier)
		expect(completed).toEqual(
			expect.objectContaining({
				provider: "elevenlabs",
				providerCallSid: "CA_test",
				providerReference: "conv_test",
				status: "succeeded",
			}),
		)
		expect(completed.result).toEqual(
			expect.objectContaining({
				answers: [],
				authorizations: {
					notifyAllClients: {
						rationale: "The incident affects every customer.",
						value: true,
					},
					trafficFailoverAuthorized: {
						rationale: "The engineer denied the failover.",
						value: false,
					},
				},
				outcome: "completed",
				summary: "Permissions were captured.",
				transcript:
					"agent: Necesito contexto.\nuser: Sí, avisad a los clientes.",
			}),
		)
		expect(await instance.get(accepted.identifier)).toEqual(completed)
		expect(fetch).toHaveBeenCalledTimes(3)
	})

	it("returns an accepted duplicate without starting a second call", async () => {
		const fetch = fetchMock()
		fetch
			.mockResolvedValueOnce(
				response({
					callSid: "CA_duplicate",
					conversation_id: "conv_duplicate",
					success: true,
				}),
			)
			.mockResolvedValueOnce(
				response({
					analysis: null,
					conversation_id: "conv_duplicate",
					status: "processing",
				}),
			)

		const { instance } = service()
		const input = liveCallInput("eleven-duplicate-1")
		const first = await instance.execute(input)
		const duplicate = await instance.execute(input)

		expect(duplicate).toEqual(
			expect.objectContaining({
				identifier: first.identifier,
				providerReference: "conv_duplicate",
				status: "accepted",
			}),
		)
		expect(
			fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
		).toHaveLength(1)
	})

	it("rejects a HappyRobot callback for an ElevenLabs record", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValueOnce(
			response({
				callSid: "CA_wrong-provider",
				conversation_id: "conv_wrong-provider",
				success: true,
			}),
		)
		const { instance, repository } = service()
		const accepted = await instance.execute(
			liveCallInput("eleven-wrong-provider-1"),
		)

		await expect(
			instance.completeCall({
				callIdentifier: accepted.identifier,
				outcome: "completed",
			}),
		).rejects.toMatchObject({ status: 409 })
		expect(await repository.read(accepted.identifier)).toEqual(
			expect.objectContaining({
				provider: "elevenlabs",
				status: "accepted",
			}),
		)
	})

	it("expires before polling and never polls after timeout", async () => {
		const fetch = fetchMock()
		fetch.mockResolvedValueOnce(
			response({
				callSid: "CA_timeout",
				conversation_id: "conv_timeout",
				success: true,
			}),
		)
		const { instance, repository } = service()
		const accepted = await instance.execute(
			liveCallInput("eleven-timeout-1"),
		)
		await repository.update(
			{ identifier: accepted.identifier },
			{ timeoutAt: "2000-01-01T00:00:00.000Z" },
		)

		const expired = await instance.get(accepted.identifier)
		expect(expired).toEqual(
			expect.objectContaining({
				provider: "elevenlabs",
				status: "failed",
			}),
		)
		expect(expired.error).toEqual(
			expect.objectContaining({ code: "TIMEOUT" }),
		)
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it("maps a provider no-answer to a failed terminal result", async () => {
		const fetch = fetchMock()
		fetch
			.mockResolvedValueOnce(
				response({
					callSid: "CA_no-answer",
					conversation_id: "conv_no-answer",
					success: true,
				}),
			)
			.mockResolvedValueOnce(
				response({
					conversation_id: "conv_no-answer",
					status: "no-answer",
					transcript: [{ message: "No answer.", role: "agent" }],
				}),
			)

		const { instance } = service()
		const accepted = await instance.execute(
			liveCallInput("eleven-no-answer-1"),
		)
		const failed = await instance.get(accepted.identifier)

		expect(failed.status).toBe("failed")
		expect(failed.error).toEqual(
			expect.objectContaining({ code: "NO_ANSWER" }),
		)
		expect(failed.result).toEqual(
			expect.objectContaining({ outcome: "no-answer" }),
		)
	})

	it("keeps a polling failure pending so a later poll can recover", async () => {
		const fetch = fetchMock()
		fetch
			.mockResolvedValueOnce(
				response({
					callSid: "CA_poll-failure",
					conversation_id: "conv_poll-failure",
					success: true,
				}),
			)
			.mockRejectedValueOnce(new Error("provider details"))

		const { instance } = service()
		const accepted = await instance.execute(
			liveCallInput("eleven-poll-failure-1"),
		)
		const stillPending = await instance.get(accepted.identifier)

		expect(stillPending.status).toBe("accepted")
		expect(stillPending.result).toBeNull()
		expect(fetch).toHaveBeenCalledTimes(2)
	})
})
