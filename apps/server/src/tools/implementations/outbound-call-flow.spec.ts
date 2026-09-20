import { EngineerCallRecord } from "@engineers/types/engineer.type"
import { InMemoryRepository } from "@root/testing/in-memory-repository"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolsService } from "@tools/services/tools.service"
import { ToolContext, ToolOutput } from "@tools/types/tool.type"
import { InboundWebhooksController } from "@webhooks/controllers/inbound-webhooks.controller"
import { ContactEngineerTool } from "./contact-engineer.tool"
import { CallEngineerTool } from "./mvp-tools"

const context: ToolContext = {
	decisionIdentifier: "decision_test",
	incidentIdentifier: "inc_fixture",
	planIdentifier: "plan_test",
	planStepIdentifier: "step_contact",
	planVersion: 1,
	runIdentifier: "run_fixture",
	toolCallIdentifier: "tool_contact",
}

const input = {
	engineerName: "Lucía Responsable",
	engineerPhone: "+34600111222",
	engineerRole: "platform engineer",
	purpose: "Confirm the current outage before recovery starts.",
	questions: [
		{
			key: "snapshot",
			question: "Is the latest database snapshot ready for failover?",
		},
	],
}

describe("outbound engineer call flow", () => {
	it("passes live incident context through the call_engineer alias", async () => {
		const incident = createImpactedIncident(7)
		const startCall = jest.fn().mockResolvedValue({
			identifier: "call_test",
			status: "in-progress",
		})
		const runs = {
			getByRunIdentifier: jest.fn().mockResolvedValue(incident),
		}
		const scenarios = {
			getScenario: jest.fn().mockReturnValue({
				engineerBriefing: {
					questions: [],
					simulatedSummary: "simulated",
				},
				narrative: "Fallback scenario narrative",
				region: "fallback-region",
			}),
		}
		const contact = new ContactEngineerTool(
			{ startCall } as never,
			runs as never,
			scenarios as never,
		)
		const alias = new CallEngineerTool(contact)

		await expect(alias.execute(input, context)).resolves.toEqual({
			externalReference: "call_test",
			status: "in-progress",
		})
		expect(startCall).toHaveBeenCalledWith(
			expect.objectContaining({
				incidentContext: {
					incidentDescription: incident.narrative,
					location: incident.region,
					outageStartedAt: incident.impactedAt,
					servicesDown: incident.services
						.filter((service) => service.status !== "healthy")
						.map((service) => service.name),
				},
			}),
		)
	})

	it("keeps voice authorizations in the tool result without creating an approval", async () => {
		const service = new ToolsService(
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		)
		const complete = jest
			.spyOn(service, "complete")
			.mockResolvedValue({} as never)
		const authorizations = {
			notifyAllClients: {
				rationale:
					"The responsible person approved customer notification.",
				value: true,
			},
			trafficFailoverAuthorized: {
				rationale: "The responsible person did not authorize failover.",
				value: false,
			},
		}
		const call = {
			identifier: "call_test",
			mode: "live",
			result: {
				answers: [],
				authorizations,
				outcome: "completed",
				summary: "Two permissions captured.",
				transcript: "...",
			},
			status: "completed",
			toolCallIdentifier: "tool_contact",
		} as unknown as EngineerCallRecord

		await service.onEngineerCallFinished({ call })

		const [toolIdentifier, output, error] = complete.mock.calls[0] as [
			string,
			ToolOutput,
			unknown,
		]
		expect(toolIdentifier).toBe("tool_contact")
		expect(error).toBeNull()
		expect(output).toMatchObject({
			authorizations,
			kind: "engineer-call",
		})
		expect(output).not.toHaveProperty("approvalIdentifier")
		expect(output).not.toHaveProperty("capacity")
	})

	it("retains HappyRobot permissions and routes in-call evidence separately", async () => {
		const completeCall = jest.fn()
		const recordAuthorizations = jest.fn()
		const controller = new InboundWebhooksController(
			{} as never,
			{
				completeCall,
				getByIdentifier: jest.fn().mockResolvedValue({
					provider: "happyrobot",
					questions: [],
				}),
				recordAuthorizations,
			} as never,
			{} as never,
		)
		const authorizations = {
			notifyAllClients: { rationale: "Yes", value: true },
			trafficFailoverAuthorized: { rationale: "Unanswered", value: null },
		}
		const body = {
			answers: [],
			authorizations,
			callIdentifier: "call_hr",
			outcome: "completed" as const,
			summary: "Permissions",
			transcript: "Transcript",
		}
		await controller.happyRobot({ ...body, phase: "authorization" })
		expect(recordAuthorizations).toHaveBeenCalledWith(
			"call_hr",
			authorizations,
		)
		expect(completeCall).not.toHaveBeenCalled()
		await controller.happyRobot(body)
		expect(completeCall).toHaveBeenCalledWith(
			"call_hr",
			expect.objectContaining({
				authorizations,
				transcript: "Transcript",
			}),
		)
	})

	it("does not let a HappyRobot callback complete an ElevenLabs call", async () => {
		const call = {
			identifier: "call_elevenlabs",
			provider: "elevenlabs",
			questions: [],
		} as unknown as EngineerCallRecord
		const completeCall = jest.fn()
		const controller = new InboundWebhooksController(
			{} as never,
			{
				completeCall,
				getByIdentifier: jest.fn().mockResolvedValue(call),
			} as never,
			{} as never,
		)

		await expect(
			controller.happyRobot({
				answers: [],
				callIdentifier: call.identifier,
				outcome: "completed",
				summary: "unexpected callback",
				transcript: "unexpected callback",
			}),
		).rejects.toThrow(/HappyRobot/)

		expect(completeCall).not.toHaveBeenCalled()
	})

	it("marks an asynchronous live call timeout as non-retryable", async () => {
		const startedAt = new Date(Date.now() - 10_000).toISOString()
		const repository = new InMemoryRepository<ToolCallEntity>()
		await repository.insert({
			attempt: 1,
			createdAt: startedAt,
			decisionIdentifier: "",
			error: null,
			externalReference: "call_test",
			finishedAt: "",
			idempotencyKey: "step_contact:attempt-1",
			identifier: "tool_contact",
			incidentIdentifier: "inc_fixture",
			input: {},
			interaction: "real-call",
			name: "call_engineer",
			output: null,
			planIdentifier: "plan_test",
			planStepIdentifier: "step_contact",
			planVersion: 1,
			runIdentifier: "run_fixture",
			simulated: false,
			startedAt,
			status: "running",
			updatedAt: startedAt,
		})
		const service = new ToolsService(
			repository as never,
			{} as never,
			{ record: jest.fn().mockResolvedValue(undefined) } as never,
			{ agent: { callTimeoutMilliseconds: 100 } } as never,
			{ emit: jest.fn() } as never,
		)

		const [expired] = await service.expireRunningCalls("run_fixture")

		expect(expired).toMatchObject({
			error: { code: "TIMEOUT", retryable: false },
			status: "failed",
		})
	})
})
