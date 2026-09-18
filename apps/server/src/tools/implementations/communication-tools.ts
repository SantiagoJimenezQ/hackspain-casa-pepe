import { IntegrationError, sendIncidentEmail } from "@casa-pepe/tools"
import { ConfigurationService } from "@common/services/configuration.service"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { PlansService } from "@plans/services/plans.service"
import { StatusPublicationEntity } from "@tools/entities/status-publication.entity"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolContext, ToolExecutionResult } from "@tools/types/tool.type"
import { Repository } from "typeorm"
import { PlanCommunicationInput } from "../../../../../packages/contracts/tools"

@Injectable()
export class CommunicationToolsService {
	constructor(
		private readonly configuration: ConfigurationService,
		private readonly runs: RunsService,
		private readonly plans: PlansService,
		@InjectRepository(ToolCallEntity)
		private readonly calls: Repository<ToolCallEntity>,
		@InjectRepository(StatusPublicationEntity)
		private readonly publications: Repository<StatusPublicationEntity>,
	) {}
	get emailSimulated() {
		return this.configuration.email.mode === "simulated"
	}
	async execute(
		channel: "email" | "status",
		input: PlanCommunicationInput,
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runs.getByRunIdentifier(
			context.runIdentifier,
		)
		const plan = await this.plans.findLatestPlan(context.runIdentifier)
		if (
			!incident.active ||
			incident.runKind === "replay" ||
			incident.identifier !== context.incidentIdentifier ||
			!plan ||
			plan.identifier !== input.planIdentifier ||
			plan.identifier !== context.planIdentifier ||
			plan.version !== context.planVersion
		)
			return {
				error: {
					code: "STALE_PLAN",
					message: "Communication belongs to an outdated run or plan",
					retryable: false,
				},
				status: "failed",
			}
		const key = `${context.runIdentifier}:${plan.identifier}:${channel}`
		try {
			if (channel === "email") {
				const receipt = await sendIncidentEmail(
					{
						...this.configuration.email,
						timeoutMilliseconds: Math.min(
							10000,
							this.configuration.agent.toolTimeoutMilliseconds -
								100,
						),
					},
					{
						subject: `[Casa Pepe demo] Recovery plan v${plan.version}`,
						text: `${incident.title}\n\n${plan.summary}\n\nReason: ${plan.reason}\n\n${plan.priorities.map((p) => `${p.rank}. ${p.serviceName}: ${p.decision}. ${p.reason}`).join("\n")}\n\nOwners:\n${plan.steps.map((s) => `${s.title}: ${s.owner.name}`).join("\n")}\n\nThis is a demo incident. Recovery actions remain subject to operator approval in the dashboard.`,
					},
					key,
				)
				return {
					output: {
						channel,
						kind: "communication",
						...receipt,
						detail:
							receipt.mode === "simulated"
								? "Email simulated; nothing sent"
								: "Email accepted by provider; inbox delivery is not yet confirmed",
					},
					status: "succeeded",
				}
			}
			const calls = await this.calls.find({
				order: { finishedAt: "DESC" },
				where: {
					name: "verify_recovery",
					runIdentifier: context.runIdentifier,
					status: "succeeded",
				},
			})
			const services = incident.services.map((service) => {
				const verification = calls.find(
					(call) =>
						call.output?.kind === "recovery-verification" &&
						call.output.serviceIdentifier === service.identifier,
				)
				const verified =
					verification?.output?.kind === "recovery-verification" &&
					verification.output.verified &&
					verification.finishedAt >= service.lastChangedAt
				return {
					name: service.name,
					status:
						service.status === "healthy" && !verified
							? "awaiting-verification"
							: service.status,
				}
			})
			await this.publications.upsert(
				{
					createdAt: new Date().toISOString(),
					identifier: key,
					publication: {
						planIdentifier: plan.identifier,
						planVersion: plan.version,
						runIdentifier: context.runIdentifier,
						services,
						simulated:
							this.configuration.recovery.mode === "simulated",
					},
					runIdentifier: context.runIdentifier,
				},
				["identifier"],
			)
			return {
				output: {
					channel,
					detail: "Published demo service status to /api/status",
					kind: "communication",
					mode: "live",
					reference: key,
				},
				status: "succeeded",
			}
		} catch (error) {
			return {
				error: {
					code: "COMMUNICATION_FAILED",
					message:
						error instanceof IntegrationError
							? error.message
							: "Communication could not be completed",
					retryable:
						error instanceof IntegrationError && error.retryable,
				},
				status: "failed",
			}
		}
	}
	async latest() {
		const run = await this.runs.findActiveEntity()
		if (!run) return null
		const entries = await this.publications.find({
			order: { createdAt: "DESC" },
			take: 1,
			where: { runIdentifier: run.runIdentifier },
		})
		// Only deliberately published, customer-safe fields leave the authenticated API.
		const entry = entries[0]
		return entry
			? {
					demo: true,
					services: entry.publication.services,
					simulated: entry.publication.simulated,
					updatedAt: entry.createdAt,
				}
			: null
	}
}
@Injectable()
export class SendIncidentEmailTool {
	readonly name = "send_incident_email" as const
	constructor(private readonly communications: CommunicationToolsService) {}
	execute(input: PlanCommunicationInput, context: ToolContext) {
		return this.communications.execute("email", input, context)
	}
}
@Injectable()
export class PublishStatusUpdateTool {
	readonly name = "publish_status_update" as const
	constructor(private readonly communications: CommunicationToolsService) {}
	execute(input: PlanCommunicationInput, context: ToolContext) {
		return this.communications.execute("status", input, context)
	}
}
