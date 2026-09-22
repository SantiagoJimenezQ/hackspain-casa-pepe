import "reflect-metadata"
import {
	createApplicationConfiguration,
	validateEnvironmentVariables,
} from "@common/configuration/configuration.factory"
import { Logger } from "@nestjs/common"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { ToolTestsService } from "@tools/testing/tool-tests.service"

type Where = Record<string, unknown>

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

function config(overrides: Record<string, unknown> = {}) {
	return {
		agent: {
			callTimeoutMilliseconds: 20,
			toolTimeoutMilliseconds: 20,
		},
		demo: {
			engineerName: "Marta Ruiz",
			engineerPhone: "+34600000000",
			engineerRole: "Platform on-call engineer",
		},
		email: {
			apiKey: "",
			from: "",
			mode: "simulated",
			to: "",
		},
		engineerCall: {
			mode:
				(overrides.happyRobot as { mode?: string })?.mode ??
				"simulated",
			provider: "happyrobot",
		},
		happyRobot: {
			apiKey: "",
			mode: "simulated",
			simulatedCallDelayMilliseconds: 0,
			triggerURL: "",
			webhookSecret: "test-secret",
		},
		runtime: { publicBaseURL: "http://localhost:3000" },
		...overrides,
	} as never
}

function service(
	configuration: unknown = config(),
	adapter: Record<string, jest.Mock> = {
		start: jest.fn(),
	},
) {
	const repository = new ConditionalRepository()
	const instance = new ToolTestsService(
		repository as never,
		configuration as never,
		adapter as never,
		{ getResult: jest.fn() } as never,
	)
	return { adapter, instance, repository }
}

function completedCallback(identifier: string): Record<string, unknown> {
	return {
		answers: [
			{
				answer: "The synthetic callback was received.",
				confirmed: true,
				key: "backup_capacity",
			},
		],
		callIdentifier: identifier,
		outcome: "completed",
		summary: "Synthetic callback completed",
		transcript: "Synthetic transcript",
	}
}

describe("ToolTestsService", () => {
	it("completes simulated email and call checks without a provider or incident", async () => {
		const email = service()
		const call = service()

		const emailResult = await email.instance.execute({
			idempotencyKey: "sim-email-1",
			tool: "send_incident_email",
		})
		const callResult = await call.instance.execute({
			idempotencyKey: "sim-call-1",
			tool: "call_engineer",
		})

		expect(emailResult).toEqual(
			expect.objectContaining({ mode: "simulated", status: "succeeded" }),
		)
		expect(callResult).toEqual(
			expect.objectContaining({ mode: "simulated", status: "succeeded" }),
		)
		expect(call.adapter.start).not.toHaveBeenCalled()
	})

	it("returns the original result for matching retries and rejects conflicting reuse", async () => {
		const { instance } = service()
		const first = await instance.execute({
			idempotencyKey: "same-key",
			tool: "send_incident_email",
		})
		const retry = await instance.execute({
			idempotencyKey: "same-key",
			mode: "simulated",
			tool: "send_incident_email",
		})

		expect(retry).toEqual(first)
		await expect(
			instance.execute({
				idempotencyKey: "same-key",
				tool: "call_engineer",
			}),
		).rejects.toMatchObject({ status: 409 })
	})

	it("keeps a live email accepted after the provider receipt is returned", async () => {
		const originalFetch = global.fetch
		global.fetch = jest.fn().mockResolvedValue({
			json: async () => ({ id: "resend-test-1" }),
			ok: true,
		}) as typeof fetch
		try {
			const { instance } = service(
				config({
					email: {
						apiKey: "resend-test-key",
						from: "test@example.com",
						mode: "live",
						to: "operator@example.com",
					},
				}),
			)
			const result = await instance.execute({
				idempotencyKey: "live-email-1",
				mode: "live",
				tool: "send_incident_email",
			})

			expect(result.status).toBe("accepted")
			expect(result.finishedAt).not.toBe("")
			expect(result.providerReference).toBe("resend-test-1")
		} finally {
			global.fetch = originalFetch
		}
	})

	it("preserves a callback that wins the trigger-return race", async () => {
		const adapter = {
			start: jest.fn(async (request, deliver) => {
				await deliver(request.call.identifier, {
					answers: [
						{
							answer: "Confirmed",
							confirmed: true,
							key: "backup_capacity",
							question: "Synthetic question",
						},
					],
					outcome: "completed",
					summary: "Provider callback won",
					transcript: "Synthetic transcript",
				})
				return {
					kind: "accepted" as const,
					providerReference: "provider-race-1",
				}
			}),
		}
		const { instance } = service(
			config({
				happyRobot: {
					apiKey: "happyrobot-test-key",
					mode: "live",
					simulatedCallDelayMilliseconds: 0,
					triggerURL: "https://happyrobot.example/trigger",
					webhookSecret: "test-secret",
				},
			}),
			adapter,
		)

		const result = await instance.execute({
			engineer: { name: "Marta Ruiz", phone: "+34600000000" },
			idempotencyKey: "live-call-race",
			mode: "live",
			tool: "call_engineer",
		})

		expect(result.status).toBe("succeeded")
		expect(result.result).toEqual(
			expect.objectContaining({ summary: "Provider callback won" }),
		)
		expect(result.providerReference).toBe("")
	})

	it("makes terminal callbacks idempotent and ignores late callbacks after timeout", async () => {
		const adapter = {
			start: jest.fn().mockResolvedValue({
				kind: "accepted",
				providerReference: "provider-timeout-1",
			}),
		}
		const { instance, repository } = service(
			config({
				agent: {
					callTimeoutMilliseconds: 1000,
					toolTimeoutMilliseconds: 20,
				},
				happyRobot: {
					apiKey: "happyrobot-test-key",
					mode: "live",
					simulatedCallDelayMilliseconds: 0,
					triggerURL: "https://happyrobot.example/trigger",
					webhookSecret: "test-secret",
				},
			}),
			adapter,
		)

		const accepted = await instance.execute({
			engineer: { name: "Marta Ruiz", phone: "+34600000000" },
			idempotencyKey: "live-call-timeout",
			mode: "live",
			tool: "call_engineer",
		})
		const stored = await repository.read(accepted.identifier)
		if (!stored) throw new Error("Expected the call test to be persisted")
		await repository.update(
			{ identifier: stored.identifier },
			{ timeoutAt: "2000-01-01T00:00:00.000Z" },
		)

		const timedOut = await instance.get(accepted.identifier)
		expect(timedOut.status).toBe("failed")
		expect(timedOut.error).toEqual(
			expect.objectContaining({ code: "TIMEOUT" }),
		)

		const late = await instance.completeCall(
			completedCallback(accepted.identifier) as never,
		)
		expect(late).toEqual(timedOut)
	})

	it("returns a safe failed result when the live provider rejects the call", async () => {
		const log = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {})
		const adapter = {
			start: jest.fn().mockResolvedValue({
				kind: "failed",
				reason: "provider details must stay internal happyrobot-test-key",
			}),
		}
		const { instance } = service(
			config({
				happyRobot: {
					apiKey: "happyrobot-test-key",
					mode: "live",
					simulatedCallDelayMilliseconds: 0,
					triggerURL: "https://happyrobot.example/trigger",
					webhookSecret: "test-secret",
				},
			}),
			adapter,
		)

		const result = await instance.execute({
			engineer: { name: "Marta Ruiz", phone: "+34600000000" },
			idempotencyKey: "live-call-failure",
			mode: "live",
			tool: "call_engineer",
		})

		expect(result.status).toBe("failed")
		expect(result.error).toEqual(
			expect.objectContaining({ code: "CALL_PROVIDER_ERROR" }),
		)
		expect(JSON.stringify(result)).not.toContain("provider details")
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "tool_test_provider_failure",
				provider: "happyrobot",
				testIdentifier: result.identifier,
			}),
		)
		expect(JSON.stringify(log.mock.calls)).toContain(
			"provider details must stay internal",
		)
		expect(JSON.stringify(log.mock.calls)).not.toContain(
			"happyrobot-test-key",
		)
		log.mockRestore()
	})
	it("reserves concurrent retries once before contacting the email provider", async () => {
		const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
			json: async () => ({ id: "concurrent-email" }),
			ok: true,
		} as Response)
		try {
			const { instance } = service(
				config({
					email: {
						apiKey: "test-key",
						from: "sender@example.com",
						mode: "live",
						to: "recipient@example.com",
					},
				}),
			)
			const input = {
				idempotencyKey: "concurrent",
				mode: "live" as const,
				tool: "send_incident_email" as const,
			}
			const results = await Promise.all([
				instance.execute(input),
				instance.execute(input),
			])
			expect(results[0].identifier).toBe(results[1].identifier)
			expect(fetchMock).toHaveBeenCalledTimes(1)
			const stored = await instance.get(results[0].identifier)
			expect(stored.status).toBe("accepted")
			expect(
				JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).to,
			).toEqual(["recipient@example.com"])
		} finally {
			fetchMock.mockRestore()
		}
	})

	it("rejects unconfigured live checks before any provider request", async () => {
		const { instance, adapter } = service()
		for (const tool of ["send_incident_email", "call_engineer"] as const) {
			await expect(
				instance.execute({
					engineer: { name: "Test", phone: "+34600000000" },
					idempotencyKey: tool,
					mode: "live",
					tool,
				}),
			).rejects.toMatchObject({ status: 409 })
		}
		expect(adapter.start).not.toHaveBeenCalled()
	})

	it.each(["failed", "no-answer"] as const)(
		"preserves a %s telephony outcome after provider acceptance",
		async (outcome) => {
			const { instance } = service(
				config({
					happyRobot: {
						apiKey: "test",
						mode: "live",
						triggerURL: "https://example.com/trigger",
						webhookSecret: "secret",
					},
				}),
				{
					start: jest.fn().mockResolvedValue({
						kind: "accepted",
						provider: "happyrobot",
						providerReference: "run_test",
					}),
				},
			)
			const record = await instance.execute({
				engineer: { name: "Test", phone: "+34600000000" },
				idempotencyKey: outcome,
				mode: "live",
				tool: "call_engineer",
			})
			const result = await instance.completeCall({
				callIdentifier: record.identifier,
				outcome,
			})
			expect(result.status).not.toBe("succeeded")
			expect(result.result).toMatchObject({ outcome })
		},
	)

	it("expires an overdue callback even when nobody polled and preserves completed callbacks", async () => {
		const { instance, repository } = service(
			config({
				agent: {
					callTimeoutMilliseconds: 60000,
					toolTimeoutMilliseconds: 10000,
				},
				happyRobot: {
					apiKey: "test",
					mode: "live",
					triggerURL: "https://example.com/trigger",
					webhookSecret: "secret",
				},
			}),
			{
				start: jest.fn().mockResolvedValue({
					kind: "accepted",
					providerReference: "call",
				}),
			},
		)
		for (const expired of [true, false]) {
			const record = await instance.execute({
				engineer: { name: "Test", phone: "+34600000000" },
				idempotencyKey: `callback-${expired}`,
				mode: "live",
				tool: "call_engineer",
			})
			if (expired)
				await repository.update(
					{ identifier: record.identifier },
					{ timeoutAt: "2000-01-01T00:00:00.000Z" },
				)
			const authorizations = {
				notifyAllClients: {
					rationale: "Approved notifications",
					value: true,
				},
				trafficFailoverAuthorized: {
					rationale: "Unanswered",
					value: null,
				},
			}
			if (!expired) {
				const pending = await instance.completeCall({
					authorizations,
					callIdentifier: record.identifier,
					outcome: "completed",
					phase: "authorization",
				})
				expect(pending.status).toBe("accepted")
				expect(pending.finishedAt).toBe("")
				expect(pending.result).toEqual({ authorizations })
			}
			const result = await instance.completeCall({
				...completedCallback(record.identifier),
				authorizations,
			} as never)
			if (!expired)
				expect(result.result).toMatchObject({ authorizations })
			expect(result.status).toBe(expired ? "failed" : "succeeded")
			if (expired) expect(result.error?.code).toBe("TIMEOUT")
			const repeated = await instance.completeCall({
				callIdentifier: record.identifier,
				outcome: "failed",
			})
			expect(repeated).toEqual(result)
		}
	})

	it("does not resend an email after an ambiguous provider failure", async () => {
		const fetchMock = jest
			.spyOn(global, "fetch")
			.mockRejectedValue(new Error("secret provider details"))
		try {
			const { instance } = service(
				config({
					email: {
						apiKey: "test-key",
						from: "sender@example.com",
						mode: "live",
						to: "recipient@example.com",
					},
				}),
			)
			const input = {
				idempotencyKey: "failed-email",
				mode: "live" as const,
				tool: "send_incident_email" as const,
			}
			const result = await instance.execute(input)
			expect(result.status).toBe("failed")
			expect(result.error?.message).toContain("unknown")
			expect(JSON.stringify(result)).not.toContain(
				"secret provider details",
			)
			expect(await instance.execute(input)).toEqual(result)
			expect(fetchMock).toHaveBeenCalledTimes(1)
		} finally {
			fetchMock.mockRestore()
		}
	})
	it("uses the unified live mode even when legacy HappyRobot mode is simulated", async () => {
		const { instance, adapter } = service(
			config({
				engineerCall: { mode: "live", provider: "happyrobot" },
				happyRobot: {
					apiKey: "test",
					mode: "simulated",
					triggerURL: "https://example.com/trigger",
					webhookSecret: "test",
				},
			}),
			{
				start: jest.fn().mockResolvedValue({
					kind: "accepted",
					providerReference: "happyrobot-test",
				}),
			},
		)
		expect(
			instance.catalog().find((entry) => entry.tool === "call_engineer"),
		).toMatchObject({ liveAvailable: true, provider: "happyrobot" })
		const result = await instance.execute({
			engineer: { name: "Test", phone: "+34600000000" },
			idempotencyKey: "unified-mode",
			mode: "live",
			tool: "call_engineer",
		})
		expect(result).toMatchObject({
			provider: "happyrobot",
			status: "accepted",
		})
		expect(adapter.start).toHaveBeenCalledTimes(1)
	})
})

describe("disabled voice providers", () => {
	it.each(["happyrobot", "elevenlabs"])(
		"rejects live %s tests despite legacy credentials",
		async (provider) => {
			const configuration = createApplicationConfiguration(
				validateEnvironmentVariables({
					API_KEY: "test-key",
					ELEVENLABS_AGENT_ID: "test-agent",
					ELEVENLABS_API_KEY: "test-key",
					ELEVENLABS_PHONE_NUMBER_ID: "test-phone",
					ENGINEER_CALL_MODE: "live",
					ENGINEER_CALL_PROVIDER: provider,
					HAPPYROBOT_API_KEY: "test-key",
					HAPPYROBOT_MODE: "live",
					HAPPYROBOT_TRIGGER_URL: "https://example.com/hooks/test",
					HAPPYROBOT_WEBHOOK_SECRET: "test-secret",
					RECOVERY_WEBHOOK_SECRET: "test-secret",
					SUPABASE_DATABASE_URL: "postgresql://localhost/test",
				}),
			)
			const { instance, adapter } = service(configuration)
			expect(
				instance
					.catalog()
					.find((entry) => entry.tool === "call_engineer"),
			).toMatchObject({
				liveAvailable: false,
				modes: ["simulated"],
			})
			await expect(
				instance.execute({
					engineer: { name: "Test engineer", phone: "+34600000000" },
					idempotencyKey: `disabled-${provider}`,
					mode: "live",
					tool: "call_engineer",
				}),
			).rejects.toThrow("use simulated mode")
			expect(adapter.start).not.toHaveBeenCalled()
			const simulated = await instance.execute({
				idempotencyKey: `simulated-${provider}`,
				mode: "simulated",
				tool: "call_engineer",
			})
			expect(simulated).toMatchObject({
				mode: "simulated",
				status: "succeeded",
			})
			expect(adapter.start).not.toHaveBeenCalled()
		},
	)

	it("reads a persisted live call without contacting its former provider", async () => {
		const repository = new ConditionalRepository()
		const lookup = jest.fn()
		const instance = new ToolTestsService(
			repository as never,
			config(),
			{ start: jest.fn() } as never,
			{ getResult: lookup } as never,
		)
		await repository.insert(
			repository.create({
				idempotencyKey: "legacy",
				identifier: "legacy-call",
				mode: "live",
				provider: "elevenlabs",
				providerReference: "old-conversation",
				status: "accepted",
				timeoutAt: new Date(Date.now() + 60_000).toISOString(),
				tool: "call_engineer",
			}),
		)
		expect(await instance.get("legacy-call")).toMatchObject({
			status: "accepted",
		})
		expect(lookup).not.toHaveBeenCalled()
	})
})
