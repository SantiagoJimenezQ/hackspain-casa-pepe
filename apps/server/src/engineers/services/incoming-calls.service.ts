import { createHash } from "node:crypto"
import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { StaleRunException } from "@common/exceptions/domain.exception"
import {
	ConfirmIncomingCallDTO,
	IncomingCallDTO,
} from "@engineers/dtos/incoming-call.dto"
import { IncomingCallEntity } from "@engineers/entities/incoming-call.entity"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"

@Injectable()
export class IncomingCallsService {
	constructor(
		@InjectRepository(IncomingCallEntity)
		private readonly repository: Repository<IncomingCallEntity>,
		private readonly runs: RunsService,
		private readonly incidents: IncidentsService,
		private readonly activity: ActivityService,
		private readonly events: EventEmitter2,
	) {}
	async receive(input: IncomingCallDTO, mode: "simulated" | "live") {
		const run = await this.runs.getByRunIdentifier(input.runIdentifier)
		if (!run.active || run.runKind === "replay")
			throw new StaleRunException(input.runIdentifier)
		const identifier = `incoming-${createHash("sha256")
			.update(
				JSON.stringify([
					input.runIdentifier,
					input.providerCallIdentifier,
				]),
			)
			.digest("hex")}`
		const record = this.repository.create({
			...input,
			confirmedBy: "",
			confirmedCapacity: null,
			identifier,
			mode,
			receivedAt: new Date().toISOString(),
			status: "pending",
		})
		// Unique insert makes webhook retries safe, including concurrent deliveries.
		const insertion = await this.repository
			.createQueryBuilder()
			.insert()
			.values(record)
			.orIgnore()
			.returning("identifier")
			.execute()
		const stored = await this.repository.findOneByOrFail({ identifier })
		if (
			stored.summary !== input.summary ||
			stored.reportedCapacity !== input.reportedCapacity ||
			stored.callerName !== input.callerName ||
			stored.mode !== mode
		)
			throw new ConflictException(
				"Call identifier reused with different content",
			)
		if (!insertion.raw.length) return stored
		// Wake the agent after recording the untrusted report.
		await this.activity.record({
			correlation: { engineerCallIdentifier: identifier },
			incidentIdentifier: run.identifier,
			payload: { call: stored },
			runIdentifier: run.runIdentifier,
			simulated: mode === "simulated",
			source: "integration",
			summary: `${input.callerName} reports ${input.reportedCapacity} units. Operator confirmation required.`,
			title: "Incoming capacity report requires confirmation",
			type: "engineer-call.incoming",
		})
		this.events.emit(DOMAIN_EVENTS.INCOMING_CALL_RECEIVED, {
			callIdentifier: identifier,
			runIdentifier: run.runIdentifier,
		})
		return stored
	}
	async confirm(identifier: string, input: ConfirmIncomingCallDTO) {
		// Serialize duplicate confirmations across processes; the incident event is deduplicated by source.
		let changed = false
		const result = await this.repository.manager.transaction(
			async (manager) => {
				const calls = manager.getRepository(IncomingCallEntity)
				const call = await calls.findOne({
					lock: { mode: "pessimistic_write" },
					where: { identifier },
				})
				if (!call)
					throw new NotFoundException("Incoming call not found")
				const run = await this.runs.getByRunIdentifier(
					call.runIdentifier,
				)
				if (!run.active || run.runKind === "replay")
					throw new StaleRunException(call.runIdentifier)
				if (call.status === "confirmed") {
					if (call.confirmedCapacity !== input.confirmedCapacity)
						throw new ConflictException(
							"Call already confirmed with a different capacity",
						)
					return call
				}
				const source = `incoming-call:${identifier}:confirmed-by:${input.operatorName}`
				const applied = run.harnessEvents.some((event) =>
					event.source.startsWith(`incoming-call:${identifier}:`),
				)
				if (!applied)
					await this.incidents.applyHarnessEvent(
						{
							availableCapacity: input.confirmedCapacity,
							reason: `Operator ${input.operatorName} confirmed capacity reported by incoming call ${identifier}`,
							type: "capacity-limited",
						},
						source,
						call.runIdentifier,
					)
				changed = true
				call.status = "confirmed"
				call.confirmedBy = input.operatorName
				call.confirmedCapacity = input.confirmedCapacity
				return calls.save(call)
			},
		)
		if (changed)
			this.events.emit(DOMAIN_EVENTS.INCOMING_CALL_CONFIRMED, {
				callIdentifier: result.identifier,
				runIdentifier: result.runIdentifier,
			})
		return result
	}
	list(runIdentifier: string) {
		return this.repository.find({
			order: { receivedAt: "DESC" },
			where: { runIdentifier },
		})
	}
}
