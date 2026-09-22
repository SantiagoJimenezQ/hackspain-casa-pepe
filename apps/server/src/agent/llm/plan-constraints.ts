import {
	effectiveCapacity,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { planningResource } from "@agent/llm/plan-repair"
import { PlanBuildInput } from "@agent/types/agent.type"

/** Describe the same resource selection and dependency rules enforced by the runtime. */
export function planConstraints(input: PlanBuildInput) {
	const resource = planningResource(input)
	const assumedCapacity = resource ? effectiveCapacity(resource, input) : 0
	const services = new Map(
		input.incident.services.map((service) => [service.identifier, service]),
	)
	return {
		capacityRule:
			"Use only selectedResource for new recovery steps in this plan. Sum the costs of ALL new execute_recovery steps, including dependent services, within maximumNewRecoveryUnits. plannedUnits = allocatedCapacity + new recovery units; remainingUnits = assumedCapacity - plannedUnits. Do not pool regions or replace selectedResource; the runtime selects the next backup when current work changes available capacity.",
		requiredFields: [
			"assumptions",
			"capacity",
			"priorities",
			"reason",
			"steps",
			"summary",
		],
		selectedResource: resource
			? {
					allocatedCapacity: resource.allocatedCapacity,
					assumedCapacity,
					maximumNewRecoveryUnits: Math.max(
						0,
						assumedCapacity - resource.allocatedCapacity,
					),
					resourceIdentifier: resource.identifier,
					totalCapacity: resource.totalCapacity,
				}
			: null,
		serviceRequirements: input.incident.services.map((service) => ({
			executeDependsOn: service.dependencies
				.filter(
					(identifier) =>
						services.get(identifier)?.status !== "healthy",
				)
				.map((identifier) => stepIdentifierFor(identifier, "verify")),
			executionStepIdentifier: stepIdentifierFor(
				service.identifier,
				"execute",
			),
			recoveryCapacityUnits: service.recoveryCapacityUnits,
			requiresApproval: service.recoveryRequiresApproval,
			serviceIdentifier: service.identifier,
			verificationStepIdentifier: stepIdentifierFor(
				service.identifier,
				"verify",
			),
			verifyDependsOn: [stepIdentifierFor(service.identifier, "execute")],
		})),
	}
}
