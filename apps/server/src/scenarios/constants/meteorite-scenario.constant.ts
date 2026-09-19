import {
	IMPACT_REGION,
	meteoriteCustomers,
	meteoriteResources,
	meteoriteTopology,
	OMAN_REGION,
} from "@scenarios/constants/meteorite-map.constant"
import { DEFAULT_SCENARIO_IDENTIFIER } from "@scenarios/constants/scenario.constant"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"

export const METEORITE_SCENARIO: ScenarioDefinition = {
	backupRegion: OMAN_REGION,
	businessImpactSummary:
		"Drivers cannot receive routes and customers cannot track parcels. Every hour without route assignment stops roughly 4,000 deliveries and floods customer support.",
	company: "Gulf Relay, a regional last-mile delivery company",
	customers: meteoriteCustomers("en"),
	engineerBriefing: {
		purpose:
			"Confirm the state of the backup region and the database snapshot before committing recovery capacity",
		questions: [
			{
				confirmsFact:
					"The orders database snapshot in muscat-lz is recent enough to fail over",
				key: "database-snapshot",
				question:
					"How old is the latest orders database snapshot replicated to the Oman Local Zone?",
				simulatedAnswer:
					"The snapshot is about twelve minutes old, we can fail over with minimal order loss.",
				simulatedConfirms: true,
			},
			{
				confirmsFact:
					"Route assignment can run in the active backup region once the database is available",
				key: "route-assignment-readiness",
				question:
					"Is the route assignment service ready to be redeployed in the Oman Local Zone?",
				simulatedAnswer:
					"Yes, the deployment templates are in place, it only needs the database endpoint.",
				simulatedConfirms: true,
			},
			{
				confirmsFact:
					"The backup region capacity reported by the dashboard is accurate",
				key: "backup-capacity",
				question:
					"Can we count on the four compute units reported for the Oman Local Zone?",
				simulatedAnswer:
					"I am not sure, another team has been reserving capacity there. Let me check and I will send an update.",
				simulatedConfirms: false,
			},
		],
		simulatedSummary:
			"The engineer confirmed the database snapshot is recent and route assignment is ready to deploy. Backup capacity remains unconfirmed pending an update.",
	},
	family: DEFAULT_SCENARIO_IDENTIFIER,
	identifier: DEFAULT_SCENARIO_IDENTIFIER,
	initialFacts: [
		{
			confirmed: true,
			source: "Monitoring",
			statement:
				"A meteorite impact has taken the whole Dubai me-central-1 region offline",
		},
		{
			confirmed: true,
			source: "Monitoring",
			statement:
				"Route assignment, package tracking, the orders database and the events stream are unreachable",
		},
		{
			confirmed: false,
			source: "Capacity dashboard",
			statement:
				"The backup region capacity reported by the dashboard is accurate",
		},
		{
			confirmed: false,
			source: "Runbook",
			statement:
				"The orders database snapshot in muscat-lz is recent enough to fail over",
		},
		{
			confirmed: false,
			source: "Runbook",
			statement:
				"Route assignment can run in the active backup region once the database is available",
		},
	],
	language: "en",
	narrative:
		"A meteorite has destroyed the AWS Dubai (me-central-1) data centers that host the delivery platform. The closest constrained backup is Oman Local Zone, then Bahrain and Riyadh.",
	region: IMPACT_REGION,
	resources: meteoriteResources("en"),
	services: [
		{
			businessImpact: "critical",
			dependencies: [],
			description: "PostgreSQL cluster with orders, drivers and parcels",
			identifier: "orders-database",
			impactDescription:
				"Every product service depends on it, nothing can be recovered without it",
			impactReason: "Primary cluster lost with the region",
			name: "Orders database",
			recoveryAction: {
				consequences: [
					"Orders created in the last twelve minutes may be lost",
					"Consumes four of the backup compute units",
					"The primary region cannot be re-attached without a manual reconciliation",
				],
				description:
					"Promote the replica in the active backup region to primary and repoint the platform to it",
				kind: "failover-database",
				requiresApproval: true,
			},
			recoveryCapacityUnits: 4,
			simulatedRecovery: {
				detail: "Replica promoted, writes accepted in the active backup region",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "critical",
			dependencies: ["orders-database"],
			description: "Assigns routes and stops to drivers",
			identifier: "route-assignment",
			impactDescription:
				"Drivers cannot start their shift, roughly 4,000 deliveries per hour are blocked",
			impactReason: "Compute lost with the region",
			name: "Route assignment",
			recoveryAction: {
				consequences: [
					"Consumes three of the backup compute units",
					"Drivers receive routes computed from the failover database",
				],
				description:
					"Redeploy the route assignment service in the active backup region against the failover database",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 3,
			simulatedRecovery: {
				detail: "Service deployed and passing health checks",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "high",
			dependencies: ["orders-database", "events-stream"],
			description: "Real-time parcel tracking for customers and support",
			identifier: "package-tracking",
			impactDescription:
				"Customers cannot see their parcels, support volume triples",
			impactReason: "Compute lost with the region",
			name: "Package tracking",
			recoveryAction: {
				consequences: [
					"Consumes three of the backup compute units",
					"Tracking history from the outage window will be incomplete",
				],
				description:
					"Redeploy the package tracking service in the active backup region",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 3,
			simulatedRecovery: {
				detail: "Service deployed, tracking history partially backfilled",
				outcome: "partial",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "medium",
			dependencies: [],
			description: "Kafka cluster with scan and delivery events",
			identifier: "events-stream",
			impactDescription:
				"Tracking updates and notifications stop flowing",
			impactReason: "Brokers lost with the region",
			name: "Events stream",
			recoveryAction: {
				consequences: [
					"Consumes two of the backup compute units",
					"Events produced during the outage are lost",
				],
				description:
					"Start a reduced Kafka cluster in the active backup region",
				kind: "restart-stream",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 2,
			simulatedRecovery: {
				detail: "Reduced cluster online",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "medium",
			dependencies: ["package-tracking", "events-stream"],
			description: "SMS and email notifications for customers",
			identifier: "customer-notifications",
			impactDescription: "Customers stop receiving delivery updates",
			impactReason: "Upstream tracking data unavailable",
			name: "Customer notifications",
			recoveryAction: {
				consequences: ["Consumes one of the backup compute units"],
				description:
					"Redeploy the notification workers in the active backup region",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 1,
			simulatedRecovery: { detail: "Workers online", outcome: "success" },
			statusAfterImpact: "degraded",
		},
		{
			businessImpact: "high",
			dependencies: ["route-assignment"],
			description: "API used by the driver mobile application",
			identifier: "driver-mobile-api",
			impactDescription:
				"Drivers see errors when opening the application",
			impactReason: "Route assignment unavailable",
			name: "Driver mobile API",
			recoveryAction: {
				consequences: ["Consumes one of the backup compute units"],
				description:
					"Redeploy the driver API in the active backup region",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 1,
			simulatedRecovery: { detail: "API online", outcome: "success" },
			statusAfterImpact: "degraded",
		},
	],
	supportContact: {
		name: "Carlos Vega",
		role: "Customer support lead",
	},
	title: "Meteorite impact on Dubai",
	topology: meteoriteTopology("en"),
	twist: {
		capacityAfterTwist: 1,
		description:
			"The platform team confirms that another business unit already reserved most of the Oman Local Zone. Only one compute unit remains there instead of four.",
		identifier: "backup-capacity-limited",
		title: "Backup capacity is insufficient for the initial plan",
	},
}
