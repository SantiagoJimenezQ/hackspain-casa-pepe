import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { StaleRunException } from "@common/exceptions/domain.exception"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import {
	applyImpact,
	buildBaselineResources,
	buildBaselineServices,
	deriveIncidentStatus,
	propagateDependencyHealth,
	remainingCapacity,
	toIncidentSnapshot,
	updateServiceStatus,
} from "@incidents/helpers/incident-state.helper"
import { RunsService } from "@incidents/services/runs.service"
import {
	AppliedHarnessEvent,
	CapacityAllocationRequest,
	CapacityAllocationResult,
	Fact,
	FactStatus,
	HarnessEvent,
	IncidentEventAppliedEvent,
	IncidentRunStartedEvent,
	IncidentSnapshot,
	RunKind,
} from "@incidents/types/incident.type"
import { BadRequestException, Injectable, Logger } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { InjectRepository } from "@nestjs/typeorm"
import { ScenariosService } from "@scenarios/services/scenarios.service"
import { SeededSimulationService } from "@scenarios/services/seeded-simulation.service"
import {
	ScenarioDefinition,
	ServiceHealthStatus,
} from "@scenarios/types/scenario.type"
import {
	SimulationConfigInput,
	SimulationRecoveryScript,
	SimulationState,
} from "@scenarios/types/simulation.type"
import { Repository } from "typeorm"

@Injectable()
export class IncidentsService {
	private readonly logger = new Logger(IncidentsService.name)
	private readonly automaticTicks = new Set<string>()

	constructor(
		@InjectRepository(IncidentEntity)
		private readonly repository: Repository<IncidentEntity>,
		private readonly runsService: RunsService,
		private readonly scenariosService: ScenariosService,
		private readonly activityService: ActivityService,
		private readonly eventEmitter: EventEmitter2,
		private readonly seededSimulation: SeededSimulationService,
	) {}

	async startRun(
		scenarioIdentifier: string,
		config: SimulationConfigInput = {},
	): Promise<IncidentSnapshot> {
		const scenario =
			this.scenariosService.getByIdentifier(scenarioIdentifier)
		const simulation = this.seededSimulation.createState(config)
		const runtimeScenario = this.seededSimulation.withInitialCapacity(
			scenario,
			simulation,
		)
		await this.deactivateCurrentRun("A new run was started")
		const entity = await this.repository.save(
			this.buildBaselineEntity(runtimeScenario, "live", "", simulation),
		)
		const snapshot = toIncidentSnapshot(entity)
		this.logger.log(LOG_MESSAGES.INCIDENTS.RUN_STARTED, {
			runIdentifier: snapshot.runIdentifier,
		})
		await this.activityService.record({
			correlation: {},
			incidentIdentifier: snapshot.identifier,
			payload: { incident: snapshot },
			runIdentifier: snapshot.runIdentifier,
			simulated: true,
			source: "harness",
			summary: `Scenario "${scenario.title}" loaded. All services healthy in ${scenario.region}`,
			title: "Run started",
			type: "incident.run-started",
		})
		const event: IncidentRunStartedEvent = { incident: snapshot }
		this.eventEmitter.emit(DOMAIN_EVENTS.INCIDENT_RUN_STARTED, event)
		return snapshot
	}

	async startReplayRun(
		sourceRunIdentifier: string,
	): Promise<IncidentSnapshot> {
		const source =
			await this.runsService.getEntityByRunIdentifier(sourceRunIdentifier)
		const scenario = this.scenariosService.getByIdentifier(
			source.scenarioIdentifier,
		)
		const simulation =
			source.simulation ?? this.seededSimulation.createState()
		const replayCapacityState = {
			...simulation,
			initialDraws: 0,
		}
		const runtimeScenario = this.seededSimulation.withInitialCapacity(
			scenario,
			replayCapacityState,
		)
		await this.deactivateCurrentRun("A replay was started")
		const entity = await this.repository.save(
			this.buildBaselineEntity(
				runtimeScenario,
				"replay",
				sourceRunIdentifier,
				simulation,
			),
		)
		return toIncidentSnapshot(entity)
	}

	async reset(): Promise<IncidentSnapshot> {
		const current = await this.runsService.findActiveEntity()
		const scenarioIdentifier = current
			? current.scenarioIdentifier
			: this.scenariosService.list()[0].identifier
		if (current) {
			await this.activityService.record({
				correlation: {},
				incidentIdentifier: current.identifier,
				payload: { runIdentifier: current.runIdentifier },
				runIdentifier: current.runIdentifier,
				simulated: true,
				source: "harness",
				summary:
					"The operator reset the scenario. Late results from this run will be ignored",
				title: "Run reset",
				type: "incident.run-reset",
			})
			this.logger.log(LOG_MESSAGES.INCIDENTS.RUN_RESET, {
				runIdentifier: current.runIdentifier,
			})
		}
		return this.startRun(scenarioIdentifier)
	}

	async getActiveRunIdentifier(): Promise<string> {
		return (await this.runsService.getActiveEntity()).runIdentifier
	}

	async setSimulationPaused(
		runIdentifier: string,
		paused: boolean,
	): Promise<IncidentSnapshot> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		if (entity.simulation?.mode !== "randomized") {
			throw new BadRequestException(
				"Simulation clock controls require randomized mode",
			)
		}
		if (
			!entity.active ||
			entity.status === "normal" ||
			entity.status === "reset"
		) {
			throw new BadRequestException(
				"An active incident is required before changing simulation time",
			)
		}
		entity.simulation = { ...entity.simulation, paused }
		entity.updatedAt = nowISO()
		return toIncidentSnapshot(await this.repository.save(entity))
	}

	async advanceSimulation(
		runIdentifier: string,
		minutes: number,
	): Promise<IncidentSnapshot> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		if (entity.simulation?.mode !== "randomized") {
			throw new BadRequestException(
				"Simulation stepping requires randomized mode",
			)
		}
		if (
			!entity.active ||
			entity.status === "normal" ||
			entity.status === "reset"
		) {
			throw new BadRequestException(
				"An active incident is required before advancing time",
			)
		}
		const simulation = { ...entity.simulation }
		const disruptions: Array<{
			serviceIdentifier: string
			status: ServiceHealthStatus
			reason: string
		}> = []
		let services = [...entity.services]
		for (let index = 0; index < minutes; index += 1) {
			simulation.elapsedMinutes += 1
			const disruption = this.seededSimulation.maybeDisrupt(
				simulation,
				services,
				true,
			)
			if (disruption) {
				disruptions.push(disruption)
				services = services.map((service) =>
					service.identifier === disruption.serviceIdentifier
						? { ...service, status: disruption.status }
						: service,
				)
			}
		}
		entity.simulation = simulation
		entity.updatedAt = nowISO()
		await this.repository.save(entity)
		for (const disruption of disruptions) {
			await this.applyHarnessEvent(
				{
					reason: disruption.reason,
					serviceIdentifier: disruption.serviceIdentifier,
					status: disruption.status,
					type: "service-health-changed",
				},
				"Seeded simulation",
				runIdentifier,
			)
		}
		const snapshot =
			await this.runsService.getByRunIdentifier(runIdentifier)
		await this.activityService.record({
			correlation: {},
			incidentIdentifier: snapshot.identifier,
			payload: {
				elapsedMinutes: snapshot.simulation.elapsedMinutes,
				minutes,
			},
			runIdentifier,
			simulated: true,
			source: "harness",
			summary: `Simulation advanced by ${minutes} minute${minutes === 1 ? "" : "s"}`,
			title: "Simulation clock advanced",
			type: "simulation.advanced",
		})
		return snapshot
	}

	async sampleRecoveryScript(
		runIdentifier: string,
		serviceIdentifier: string,
		fallback: SimulationRecoveryScript,
	): Promise<SimulationRecoveryScript> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		if (!entity.simulation) {
			return fallback
		}
		const scenario = this.scenariosService.getByIdentifier(
			entity.scenarioIdentifier,
		)
		const service = scenario.services.find(
			(candidate) => candidate.identifier === serviceIdentifier,
		)
		if (!service) {
			return fallback
		}
		const resource = entity.resources[0]
		const script = this.seededSimulation.sampleRecovery(
			entity.simulation,
			service,
			resource?.allocatedCapacity ?? 0,
			resource?.totalCapacity ?? service.recoveryCapacityUnits,
		)
		entity.updatedAt = nowISO()
		await this.repository.save(entity)
		return script
	}

	@Interval(1000)
	async advanceAutomaticSimulation(): Promise<void> {
		const entity = await this.runsService.findActiveEntity()
		if (
			!entity?.simulation ||
			entity.simulation.mode !== "randomized" ||
			entity.simulation.paused ||
			entity.status === "normal" ||
			entity.status === "recovered" ||
			entity.status === "reset" ||
			this.automaticTicks.has(entity.runIdentifier)
		) {
			return
		}
		this.automaticTicks.add(entity.runIdentifier)
		try {
			await this.advanceSimulation(entity.runIdentifier, 1)
		} catch (error) {
			this.logger.warn(
				`Automatic simulation tick skipped: ${error instanceof Error ? error.message : String(error)}`,
			)
		} finally {
			this.automaticTicks.delete(entity.runIdentifier)
		}
	}

	async applyHarnessEvent(
		harnessEvent: HarnessEvent,
		source: string,
		expectedRunIdentifier?: string,
	): Promise<IncidentSnapshot> {
		const entity = expectedRunIdentifier
			? await this.runsService.getEntityByRunIdentifier(
					expectedRunIdentifier,
				)
			: await this.runsService.getActiveEntity()
		if (expectedRunIdentifier && !entity.active) {
			throw new StaleRunException(expectedRunIdentifier)
		}
		const timestamp = nowISO()
		const applied: AppliedHarnessEvent = {
			appliedAt: timestamp,
			event: harnessEvent,
			identifier: createPrefixedIdentifier("hev"),
			source,
		}
		entity.harnessEvents = [...entity.harnessEvents, applied]
		await this.mutateForEvent(entity, harnessEvent, applied, timestamp)
		entity.status = deriveIncidentStatus(
			entity.status,
			entity.services,
			entity.impactedAt,
		)
		entity.updatedAt = timestamp
		const saved = await this.repository.save(entity)
		const snapshot = toIncidentSnapshot(saved)
		await this.activityService.record({
			correlation: { harnessEventIdentifier: applied.identifier },
			incidentIdentifier: snapshot.identifier,
			payload: { event: harnessEvent, incidentStatus: snapshot.status },
			runIdentifier: snapshot.runIdentifier,
			simulated: true,
			source: "harness",
			summary: describeHarnessEvent(harnessEvent),
			title: "Harness event applied",
			type: "incident.event-applied",
		})
		this.logger.log(LOG_MESSAGES.INCIDENTS.EVENT_APPLIED, {
			runIdentifier: snapshot.runIdentifier,
			type: harnessEvent.type,
		})
		const domainEvent: IncidentEventAppliedEvent = {
			applied,
			incident: snapshot,
		}
		this.eventEmitter.emit(
			DOMAIN_EVENTS.INCIDENT_EVENT_APPLIED,
			domainEvent,
		)
		return snapshot
	}

	async applyScenarioTwist(): Promise<IncidentSnapshot> {
		const entity = await this.runsService.getActiveEntity()
		const scenario = this.scenariosService.getByIdentifier(
			entity.scenarioIdentifier,
		)
		return this.applyHarnessEvent(
			{
				availableCapacity: scenario.twist.capacityAfterTwist,
				reason: scenario.twist.description,
				type: "capacity-limited",
			},
			"Demo controls",
		)
	}

	async allocateCapacity(
		request: CapacityAllocationRequest,
	): Promise<CapacityAllocationResult> {
		const entity = await this.runsService.getEntityByRunIdentifier(
			request.runIdentifier,
		)
		const resource = entity.resources.find(
			(candidate) => candidate.identifier === request.resourceIdentifier,
		)
		if (!resource) {
			return {
				kind: "insufficient",
				remainingCapacity: 0,
				requestedUnits: request.units,
			}
		}
		const remaining = remainingCapacity(resource)
		if (request.units > remaining) {
			return {
				kind: "insufficient",
				remainingCapacity: remaining,
				requestedUnits: request.units,
			}
		}
		const timestamp = nowISO()
		entity.resources = entity.resources.map((candidate) => {
			if (candidate.identifier !== resource.identifier) {
				return candidate
			}
			return {
				...candidate,
				allocatedCapacity: candidate.allocatedCapacity + request.units,
				lastChangedAt: timestamp,
			}
		})
		entity.updatedAt = timestamp
		await this.repository.save(entity)
		await this.activityService.record({
			correlation: { serviceIdentifier: request.serviceIdentifier },
			incidentIdentifier: entity.identifier,
			payload: {
				allocatedUnits: request.units,
				remainingCapacity: remaining - request.units,
				resourceIdentifier: resource.identifier,
			},
			runIdentifier: entity.runIdentifier,
			simulated: true,
			source: "harness",
			summary: `${request.units} ${resource.unit} allocated to ${request.serviceIdentifier}, ${remaining - request.units} remaining`,
			title: "Capacity allocated",
			type: "resource.capacity-changed",
		})
		return {
			kind: "allocated",
			remainingCapacity: remaining - request.units,
		}
	}

	async releaseCapacity(request: CapacityAllocationRequest): Promise<void> {
		const entity = await this.runsService.getEntityByRunIdentifier(
			request.runIdentifier,
		)
		const timestamp = nowISO()
		entity.resources = entity.resources.map((candidate) => {
			if (candidate.identifier !== request.resourceIdentifier) {
				return candidate
			}
			return {
				...candidate,
				allocatedCapacity: Math.max(
					0,
					candidate.allocatedCapacity - request.units,
				),
				lastChangedAt: timestamp,
			}
		})
		entity.updatedAt = timestamp
		await this.repository.save(entity)
	}

	async setServiceStatus(
		runIdentifier: string,
		serviceIdentifier: string,
		status: ServiceHealthStatus,
		reason: string,
		simulated: boolean,
	): Promise<IncidentSnapshot> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		const timestamp = nowISO()
		const previousStatus = entity.status
		entity.services = propagateDependencyHealth(
			updateServiceStatus(
				entity.services,
				serviceIdentifier,
				status,
				reason,
				timestamp,
			),
			timestamp,
		)
		entity.status = deriveIncidentStatus(
			entity.status,
			entity.services,
			entity.impactedAt,
		)
		if (entity.status === "recovered") {
			entity.resolvedAt = timestamp
		}
		entity.updatedAt = timestamp
		const saved = await this.repository.save(entity)
		const snapshot = toIncidentSnapshot(saved)
		await this.activityService.record({
			correlation: { serviceIdentifier },
			incidentIdentifier: snapshot.identifier,
			payload: { reason, serviceIdentifier, status },
			runIdentifier,
			simulated,
			source: simulated ? "harness" : "integration",
			summary: `${serviceIdentifier} is now ${status}: ${reason}`,
			title: "Service health changed",
			type: "service.health-changed",
		})
		if (previousStatus !== snapshot.status) {
			await this.recordStatusChange(snapshot, previousStatus)
		}
		return snapshot
	}

	async recordFact(
		runIdentifier: string,
		statement: string,
		status: FactStatus,
		source: string,
	): Promise<Fact> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		const timestamp = nowISO()
		const existing = entity.facts.find(
			(fact) => fact.statement === statement,
		)
		const fact: Fact = existing
			? { ...existing, recordedAt: timestamp, source, status }
			: {
					identifier: createPrefixedIdentifier("fact"),
					recordedAt: timestamp,
					source,
					statement,
					status,
				}
		entity.facts = existing
			? entity.facts.map((candidate) =>
					candidate.identifier === fact.identifier ? fact : candidate,
				)
			: [...entity.facts, fact]
		entity.updatedAt = timestamp
		await this.repository.save(entity)
		await this.activityService.record({
			correlation: {},
			incidentIdentifier: entity.identifier,
			payload: { fact },
			runIdentifier,
			simulated: false,
			source: "agent",
			summary: `${status}: ${statement} (${source})`,
			title: "Fact recorded",
			type: "fact.recorded",
		})
		return fact
	}

	async confirmResourceCapacity(
		runIdentifier: string,
		resourceIdentifier: string,
		confirmed: boolean,
		note: string,
	): Promise<void> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		const timestamp = nowISO()
		entity.resources = entity.resources.map((resource) => {
			if (resource.identifier !== resourceIdentifier) {
				return resource
			}
			return { ...resource, confirmed, lastChangedAt: timestamp, note }
		})
		entity.updatedAt = timestamp
		await this.repository.save(entity)
	}

	async markResponding(runIdentifier: string): Promise<IncidentSnapshot> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		if (entity.status !== "detected") {
			return toIncidentSnapshot(entity)
		}
		const previousStatus = entity.status
		entity.status = "responding"
		entity.updatedAt = nowISO()
		const snapshot = toIncidentSnapshot(await this.repository.save(entity))
		await this.recordStatusChange(snapshot, previousStatus)
		return snapshot
	}

	async incrementAgentCycles(runIdentifier: string): Promise<number> {
		const entity =
			await this.runsService.getEntityByRunIdentifier(runIdentifier)
		entity.agentCycles = entity.agentCycles + 1
		entity.updatedAt = nowISO()
		await this.repository.save(entity)
		return entity.agentCycles
	}

	getScenario(scenarioIdentifier: string): ScenarioDefinition {
		return this.scenariosService.getByIdentifier(scenarioIdentifier)
	}

	private async mutateForEvent(
		entity: IncidentEntity,
		harnessEvent: HarnessEvent,
		applied: AppliedHarnessEvent,
		timestamp: string,
	): Promise<void> {
		const scenario = this.scenariosService.getByIdentifier(
			entity.scenarioIdentifier,
		)
		switch (harnessEvent.type) {
			case "meteorite-impact": {
				entity.services = applyImpact(
					entity.services,
					scenario,
					timestamp,
				)
				entity.status = "detected"
				entity.impactedAt = timestamp
				entity.facts = scenario.initialFacts.map((fact) => ({
					identifier: createPrefixedIdentifier("fact"),
					recordedAt: timestamp,
					source: fact.source,
					statement: fact.statement,
					status: fact.confirmed ? "confirmed" : "pending",
				}))
				await this.activityService.record({
					correlation: { harnessEventIdentifier: applied.identifier },
					incidentIdentifier: entity.identifier,
					payload: {
						affectedServices: entity.services
							.filter((service) => service.status !== "healthy")
							.map((service) => service.identifier),
						region: entity.region,
					},
					runIdentifier: entity.runIdentifier,
					simulated: true,
					source: "harness",
					summary: `${scenario.title}. ${scenario.businessImpactSummary}`,
					title: "Impact detected",
					type: "incident.impact-detected",
				})
				return
			}
			case "capacity-limited": {
				entity.resources = entity.resources.map((resource) => ({
					...resource,
					confirmed: true,
					lastChangedAt: timestamp,
					note: harnessEvent.reason,
					totalCapacity: harnessEvent.availableCapacity,
				}))
				await this.activityService.record({
					correlation: { harnessEventIdentifier: applied.identifier },
					incidentIdentifier: entity.identifier,
					payload: {
						availableCapacity: harnessEvent.availableCapacity,
						reason: harnessEvent.reason,
					},
					runIdentifier: entity.runIdentifier,
					simulated: true,
					source: "harness",
					summary: `Backup capacity confirmed at ${harnessEvent.availableCapacity} units. ${harnessEvent.reason}`,
					title: "Backup capacity changed",
					type: "resource.capacity-changed",
				})
				return
			}
			case "service-health-changed": {
				entity.services = propagateDependencyHealth(
					updateServiceStatus(
						entity.services,
						harnessEvent.serviceIdentifier,
						harnessEvent.status,
						harnessEvent.reason,
						timestamp,
					),
					timestamp,
				)
				await this.activityService.record({
					correlation: {
						harnessEventIdentifier: applied.identifier,
						serviceIdentifier: harnessEvent.serviceIdentifier,
					},
					incidentIdentifier: entity.identifier,
					payload: {
						reason: harnessEvent.reason,
						serviceIdentifier: harnessEvent.serviceIdentifier,
						status: harnessEvent.status,
					},
					runIdentifier: entity.runIdentifier,
					simulated: true,
					source: "harness",
					summary: `${harnessEvent.serviceIdentifier} is now ${harnessEvent.status}: ${harnessEvent.reason}`,
					title: "Service health changed",
					type: "service.health-changed",
				})
				return
			}
			case "fact-reported": {
				entity.facts = [
					...entity.facts,
					{
						identifier: createPrefixedIdentifier("fact"),
						recordedAt: timestamp,
						source: harnessEvent.source,
						statement: harnessEvent.statement,
						status: harnessEvent.status,
					},
				]
				return
			}
		}
	}

	private async recordStatusChange(
		snapshot: IncidentSnapshot,
		previousStatus: string,
	): Promise<void> {
		await this.activityService.record({
			correlation: {},
			incidentIdentifier: snapshot.identifier,
			payload: { previousStatus, status: snapshot.status },
			runIdentifier: snapshot.runIdentifier,
			simulated: false,
			source: "system",
			summary: `Incident moved from ${previousStatus} to ${snapshot.status}`,
			title: "Incident status changed",
			type: "incident.status-changed",
		})
	}

	private async deactivateCurrentRun(reason: string): Promise<void> {
		const current = await this.runsService.findActiveEntity()
		if (!current) {
			return
		}
		current.active = false
		current.status = "reset"
		current.updatedAt = nowISO()
		current.harnessEvents = [
			...current.harnessEvents,
			{
				appliedAt: current.updatedAt,
				event: {
					source: "Harness",
					statement: reason,
					status: "confirmed",
					type: "fact-reported",
				},
				identifier: createPrefixedIdentifier("hev"),
				source: "Harness",
			},
		]
		await this.repository.save(current)
	}

	private buildBaselineEntity(
		scenario: ScenarioDefinition,
		runKind: RunKind,
		sourceRunIdentifier: string,
		simulation: SimulationState,
	): IncidentEntity {
		const timestamp = nowISO()
		return this.repository.create({
			active: true,
			agentCycles: 0,
			backupRegion: scenario.backupRegion,
			businessImpactSummary: scenario.businessImpactSummary,
			company: scenario.company,
			createdAt: timestamp,
			facts: [],
			harnessEvents: [],
			identifier: createPrefixedIdentifier("inc"),
			impactedAt: "",
			narrative: scenario.narrative,
			region: scenario.region,
			resolvedAt: "",
			resources: buildBaselineResources(scenario, timestamp),
			runIdentifier: createPrefixedIdentifier("run"),
			runKind,
			scenarioIdentifier: scenario.identifier,
			services: buildBaselineServices(scenario, timestamp),
			simulation,
			sourceRunIdentifier,
			startedAt: timestamp,
			status: "normal",
			title: scenario.title,
			updatedAt: timestamp,
		})
	}
}

export function describeHarnessEvent(harnessEvent: HarnessEvent): string {
	switch (harnessEvent.type) {
		case "meteorite-impact":
			return "Meteorite impact: the primary region is offline"
		case "capacity-limited":
			return `Backup capacity limited to ${harnessEvent.availableCapacity} units: ${harnessEvent.reason}`
		case "service-health-changed":
			return `${harnessEvent.serviceIdentifier} changed to ${harnessEvent.status}: ${harnessEvent.reason}`
		case "fact-reported":
			return `Fact reported by ${harnessEvent.source}: ${harnessEvent.statement}`
	}
}
