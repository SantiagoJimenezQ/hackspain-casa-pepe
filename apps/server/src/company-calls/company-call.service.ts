import { createHash, randomUUID } from "node:crypto"
import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { InjectRepository } from "@nestjs/typeorm"
import { LessThanOrEqual, Repository } from "typeorm"
import {
	CallOutcomeReceipt,
	CompanyCallEvidence,
	CompanyPriorityRequest,
} from "../../../../packages/contracts/call-outcomes"
import { CallOutcomeDTO } from "./company-call.dto"
import { CompanyCallEntity } from "./company-call.entity"

export const COMPANY_PRIORITY_RECEIVED = "domain.company-priority.received"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export function normalizePriority(
	input: CompanyPriorityRequest,
): CompanyPriorityRequest {
	return {
		customerName: input.customerName.trim(),
		kind: "priority-request",
		requestedPriority: "first",
		...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
	}
}
export function resolveCompany(
	name: string,
	customers: IncidentEntity["customers"],
) {
	const normalized = name.trim().toLocaleLowerCase("es")
	const matches = customers.filter((c) =>
		[c.name, c.shortName].some(
			(alias) => alias.trim().toLocaleLowerCase("es") === normalized,
		),
	)
	return matches.length === 1 ? matches[0] : null
}
function active(run: IncidentEntity | null): asserts run is IncidentEntity {
	if (
		!run ||
		!run.active ||
		run.runKind === "replay" ||
		["normal", "reset", "recovered"].includes(run.status)
	)
		throw new ConflictException(
			"Call requires an active unresolved incident",
		)
}
export function publicEvidence(row: CompanyCallEntity): CompanyCallEvidence {
	if (!row.outcome) throw new Error("Session has no submitted outcome")
	return {
		customerIdentifier: row.customerIdentifier,
		identifier: `priority_${row.identifier}`,
		outcome: row.outcome,
		provider: "happyrobot",
		receivedAt: row.receivedAt,
		resolution: row.resolution,
		runIdentifier: row.runIdentifier,
		serviceIdentifiers: row.serviceIdentifiers,
	}
}
@Injectable()
export class CompanyCallService {
	constructor(
		@InjectRepository(CompanyCallEntity)
		private readonly sessions: Repository<CompanyCallEntity>,
		private readonly events: EventEmitter2,
		private readonly activity: ActivityService,
	) {}
	async initiate(conversationId: string, incidentIdentifier: string) {
		const identifier = hash(`happyrobot:${conversationId}`)
		return this.sessions.manager.transaction(async (manager) => {
			// Serializes initiation retries, including before the first row exists.
			await manager.query(
				"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
				[identifier],
			)
			const sessions = manager.getRepository(CompanyCallEntity)
			const existing = await sessions.findOneBy({ identifier })
			const runs = manager.getRepository(IncidentEntity)
			const callCode = /^\d{3}[\s-]?\d{3}$/.test(incidentIdentifier)
				? incidentIdentifier.replace(/[\s-]/g, "")
				: incidentIdentifier
			const candidates = await runs.find({
				where: [
					{ identifier: incidentIdentifier },
					{ runIdentifier: incidentIdentifier },
					{ callCode },
				],
			})
			if (!candidates.length)
				throw new NotFoundException("Unknown incident identifier")
			if (candidates.length !== 1)
				throw new ConflictException("Ambiguous incident identifier")
			const run = await runs.findOne({
				lock: { mode: "pessimistic_read" },
				where: { identifier: candidates[0].identifier },
			})
			active(run)
			if (existing) {
				if (existing.runIdentifier !== run.runIdentifier)
					throw new ConflictException(
						"This conversation is already bound to another incident",
					)
				return {
					callCode: run.callCode,
					incidentIdentifier: run.identifier,
					runIdentifier: run.runIdentifier,
					sessionReference: existing.sessionReference,
				}
			}
			const sessionReference = randomUUID()
			await sessions.insert({
				createdAt: new Date().toISOString(),
				customerIdentifier: null,
				identifier,
				outcome: null,
				processingState: "idle",
				resolution: "needs-clarification",
				runIdentifier: run.runIdentifier,
				serviceIdentifiers: [],
				sessionReference,
			})
			return {
				callCode: run.callCode,
				incidentIdentifier: run.identifier,
				runIdentifier: run.runIdentifier,
				sessionReference,
			}
		})
	}
	async receive(input: CallOutcomeDTO): Promise<CallOutcomeReceipt> {
		const outcome = normalizePriority(input.outcome)
		const payloadHash = hash(JSON.stringify(outcome))
		let activity: ActivityEventEntity | undefined
		const row = await this.sessions.manager.transaction(async (manager) => {
			const sessions = manager.getRepository(CompanyCallEntity)
			const row = await sessions.findOne({
				lock: { mode: "pessimistic_write" },
				where: { sessionReference: input.sessionReference },
			})
			if (!row) throw new NotFoundException("Unknown call session")
			const runs = manager.getRepository(IncidentEntity)
			const run = await runs.findOne({
				lock: { mode: "pessimistic_write" },
				where: { runIdentifier: row.runIdentifier },
			})
			active(run)
			if (row.outcome) {
				if (row.payloadHash !== payloadHash)
					throw new ConflictException(
						"This call already submitted different content",
					)
				return row
			}
			const customer = resolveCompany(outcome.customerName, run.customers)
			Object.assign(row, {
				customerIdentifier: customer?.identifier ?? null,
				nextDispatchAt: "",
				outcome,
				payloadHash,
				processingState: "pending",
				receivedAt: new Date().toISOString(),
				resolution: customer ? "matched" : "needs-clarification",
				serviceIdentifiers: [...(customer?.serviceIdentifiers ?? [])],
			})
			await sessions.save(row)
			await runs.update(
				{ identifier: run.identifier },
				{ updatedAt: row.receivedAt },
			)
			const audit = manager.getRepository(ActivityEventEntity)
			const max = await audit
				.createQueryBuilder("event")
				.select("MAX(event.sequence)", "sequence")
				.where("event.runIdentifier = :runIdentifier", {
					runIdentifier: row.runIdentifier,
				})
				.getRawOne<{ sequence: number | null }>()
			activity = audit.create({
				correlation: {},
				identifier: `priority_event_${row.identifier}`,
				incidentIdentifier: run.identifier,
				occurredAt: row.receivedAt,
				payload: { companyPriorityRequest: publicEvidence(row) },
				replayed: false,
				replayOfEventIdentifier: "",
				runIdentifier: row.runIdentifier,
				sequence: this.activity.reserveSequence(
					row.runIdentifier,
					Number(max?.sequence ?? 0),
				),
				simulated: false,
				source: "integration",
				summary: customer
					? `Caller requests priority for ${customer.name}; coordinator assessment pending.`
					: `Company ${outcome.customerName} needs clarification.`,
				title: "Company priority request received",
				type: "fact.recorded",
			})
			await audit.insert(activity)
			return row
		})
		if (activity) {
			this.events.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, {
				record: activity,
			})
			// A persisted pending row is the retry obligation if this process stops here.
			this.events.emit(COMPANY_PRIORITY_RECEIVED, {
				identifier: row.identifier,
				runIdentifier: row.runIdentifier,
			})
		}
		return {
			accepted: true,
			outcomeIdentifier: `priority_${row.identifier}`,
			status: "received",
		}
	}
	async list(runIdentifier: string): Promise<CompanyCallEvidence[]> {
		const rows = await this.sessions.find({
			order: { receivedAt: "ASC" },
			where: { runIdentifier },
		})
		return rows.filter((r) => r.outcome).map(publicEvidence)
	}
	async markObserved(identifier: string) {
		await this.sessions.update(
			{ identifier, processingState: "pending" },
			{ processingState: "observed" },
		)
	}
	@Interval(10000)
	async dispatchPending() {
		const rows = await this.sessions.find({
			take: 10,
			where: {
				nextDispatchAt: LessThanOrEqual(new Date().toISOString()),
				processingState: "pending",
			},
		})
		for (const row of rows) {
			const run = await this.sessions.manager
				.getRepository(IncidentEntity)
				.findOneBy({ runIdentifier: row.runIdentifier })
			if (
				!run?.active ||
				run.runKind === "replay" ||
				["normal", "reset", "recovered"].includes(run.status)
			) {
				await this.sessions.update(
					{ identifier: row.identifier },
					{ processingState: "stale" },
				)
				continue
			}
			const claimed = await this.sessions.update(
				{
					identifier: row.identifier,
					nextDispatchAt: row.nextDispatchAt,
					processingState: "pending",
				},
				{ nextDispatchAt: new Date(Date.now() + 60000).toISOString() },
			)
			if (claimed.affected)
				this.events.emit(COMPANY_PRIORITY_RECEIVED, {
					identifier: row.identifier,
					runIdentifier: row.runIdentifier,
				})
		}
	}
}
