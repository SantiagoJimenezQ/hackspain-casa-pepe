import { SPANISH_SCENARIO_IDENTIFIER } from "@scenarios/constants/scenario.constant"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"

export const METEORITE_SCENARIO_ES: ScenarioDefinition = {
	backupRegion: "eu-central-1",
	businessImpactSummary:
		"Los repartidores no reciben rutas y los clientes no pueden seguir sus paquetes. Cada hora sin asignación de rutas bloquea unas 4.000 entregas y desborda atención al cliente.",
	company: "Reparto Rápido, empresa de reparto de última milla",
	engineerBriefing: {
		purpose:
			"Confirmar el estado de la región de respaldo y del snapshot de la base de datos antes de comprometer capacidad de recuperación",
		questions: [
			{
				confirmsFact:
					"El snapshot de la base de datos de pedidos en eu-central-1 es lo bastante reciente para hacer failover",
				key: "database-snapshot",
				question:
					"¿Qué antigüedad tiene el último snapshot de la base de datos de pedidos replicado en eu-central-1?",
				simulatedAnswer:
					"El snapshot tiene unos doce minutos, podemos hacer failover con una pérdida mínima de pedidos.",
				simulatedConfirms: true,
			},
			{
				confirmsFact:
					"La asignación de rutas puede ejecutarse en eu-central-1 en cuanto la base de datos esté disponible",
				key: "route-assignment-readiness",
				question:
					"¿Está el servicio de asignación de rutas listo para desplegarse en eu-central-1?",
				simulatedAnswer:
					"Sí, las plantillas de despliegue están preparadas, solo necesita el endpoint de la base de datos.",
				simulatedConfirms: true,
			},
			{
				confirmsFact:
					"La capacidad de la región de respaldo que muestra el panel es correcta",
				key: "backup-capacity",
				question:
					"¿Podemos contar con las doce unidades de cómputo que muestra el panel para la región de respaldo?",
				simulatedAnswer:
					"No estoy segura, otro equipo ha estado reservando capacidad allí. Déjame comprobarlo y os mando una actualización.",
				simulatedConfirms: false,
			},
		],
		simulatedSummary:
			"La ingeniera confirmó que el snapshot de la base de datos es reciente y que la asignación de rutas está lista para desplegar. La capacidad de respaldo sigue sin confirmar a la espera de una actualización.",
	},
	identifier: SPANISH_SCENARIO_IDENTIFIER,
	initialFacts: [
		{
			confirmed: true,
			source: "Monitorización",
			statement:
				"El impacto de un meteorito ha dejado fuera de servicio toda la región eu-west-1",
		},
		{
			confirmed: true,
			source: "Monitorización",
			statement:
				"La asignación de rutas, el seguimiento de paquetes, la base de datos de pedidos y el flujo de eventos no responden",
		},
		{
			confirmed: false,
			source: "Panel de capacidad",
			statement:
				"La capacidad de la región de respaldo que muestra el panel es correcta",
		},
		{
			confirmed: false,
			source: "Runbook",
			statement:
				"El snapshot de la base de datos de pedidos en eu-central-1 es lo bastante reciente para hacer failover",
		},
		{
			confirmed: false,
			source: "Runbook",
			statement:
				"La asignación de rutas puede ejecutarse en eu-central-1 en cuanto la base de datos esté disponible",
		},
	],
	language: "es",
	narrative:
		"Un meteorito ha destruido los centros de datos de AWS eu-west-1 que alojan la plataforma de reparto. Existe capacidad de respaldo en eu-central-1, pero no puede alojar todos los servicios a la vez.",
	region: "eu-west-1",
	resource: {
		identifier: "backup-compute",
		name: "Capacidad de cómputo de respaldo",
		note: "Capacidad que muestra el panel, pendiente de confirmación por el equipo de plataforma",
		region: "eu-central-1",
		reportedCapacity: 12,
		unit: "unidades de cómputo",
	},
	services: [
		{
			businessImpact: "critical",
			dependencies: [],
			description:
				"Clúster PostgreSQL con pedidos, repartidores y paquetes",
			identifier: "orders-database",
			impactDescription:
				"Todos los servicios de producto dependen de ella, nada puede recuperarse sin ella",
			impactReason: "Clúster principal perdido con la región",
			name: "Base de datos de pedidos",
			recoveryAction: {
				consequences: [
					"Los pedidos creados en los últimos doce minutos pueden perderse",
					"Consume cuatro de las unidades de cómputo de respaldo",
					"La región principal no podrá reincorporarse sin una reconciliación manual",
				],
				description:
					"Promover la réplica de eu-central-1 a primaria y apuntar la plataforma hacia ella",
				kind: "failover-database",
				requiresApproval: true,
			},
			recoveryCapacityUnits: 4,
			simulatedRecovery: {
				detail: "Réplica promovida, escrituras aceptadas en eu-central-1",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "critical",
			dependencies: ["orders-database"],
			description: "Asigna rutas y paradas a los repartidores",
			identifier: "route-assignment",
			impactDescription:
				"Los repartidores no pueden empezar el turno, unas 4.000 entregas por hora quedan bloqueadas",
			impactReason: "Cómputo perdido con la región",
			name: "Asignación de rutas",
			recoveryAction: {
				consequences: [
					"Consume tres de las unidades de cómputo de respaldo",
					"Los repartidores reciben rutas calculadas desde la base de datos de failover",
				],
				description:
					"Redesplegar el servicio de asignación de rutas en eu-central-1 contra la base de datos de failover",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 3,
			simulatedRecovery: {
				detail: "Servicio desplegado y superando las comprobaciones de salud",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "high",
			dependencies: ["orders-database", "events-stream"],
			description:
				"Seguimiento de paquetes en tiempo real para clientes y soporte",
			identifier: "package-tracking",
			impactDescription:
				"Los clientes no ven sus paquetes, el volumen de soporte se triplica",
			impactReason: "Cómputo perdido con la región",
			name: "Seguimiento de paquetes",
			recoveryAction: {
				consequences: [
					"Consume tres de las unidades de cómputo de respaldo",
					"El histórico de seguimiento durante la caída quedará incompleto",
				],
				description:
					"Redesplegar el servicio de seguimiento de paquetes en eu-central-1",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 3,
			simulatedRecovery: {
				detail: "Servicio desplegado, histórico de seguimiento recuperado parcialmente",
				outcome: "partial",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "medium",
			dependencies: [],
			description: "Clúster Kafka con eventos de escaneo y entrega",
			identifier: "events-stream",
			impactDescription:
				"Dejan de fluir las actualizaciones de seguimiento y las notificaciones",
			impactReason: "Brokers perdidos con la región",
			name: "Flujo de eventos",
			recoveryAction: {
				consequences: [
					"Consume dos de las unidades de cómputo de respaldo",
					"Los eventos producidos durante la caída se pierden",
				],
				description:
					"Arrancar un clúster Kafka reducido en eu-central-1",
				kind: "restart-stream",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 2,
			simulatedRecovery: {
				detail: "Clúster reducido en línea",
				outcome: "success",
			},
			statusAfterImpact: "down",
		},
		{
			businessImpact: "medium",
			dependencies: ["package-tracking", "events-stream"],
			description: "Notificaciones por SMS y correo a los clientes",
			identifier: "customer-notifications",
			impactDescription:
				"Los clientes dejan de recibir avisos de entrega",
			impactReason: "Datos de seguimiento no disponibles",
			name: "Notificaciones a clientes",
			recoveryAction: {
				consequences: [
					"Consume una de las unidades de cómputo de respaldo",
				],
				description:
					"Redesplegar los procesos de notificación en eu-central-1",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 1,
			simulatedRecovery: {
				detail: "Procesos en línea",
				outcome: "success",
			},
			statusAfterImpact: "degraded",
		},
		{
			businessImpact: "high",
			dependencies: ["route-assignment"],
			description: "API que usa la aplicación móvil de los repartidores",
			identifier: "driver-mobile-api",
			impactDescription:
				"Los repartidores ven errores al abrir la aplicación",
			impactReason: "Asignación de rutas no disponible",
			name: "API móvil de repartidores",
			recoveryAction: {
				consequences: [
					"Consume una de las unidades de cómputo de respaldo",
				],
				description:
					"Redesplegar la API de repartidores en eu-central-1",
				kind: "redeploy-service",
				requiresApproval: false,
			},
			recoveryCapacityUnits: 1,
			simulatedRecovery: { detail: "API en línea", outcome: "success" },
			statusAfterImpact: "degraded",
		},
	],
	supportContact: {
		name: "Carlos Vega",
		role: "Responsable de atención al cliente",
	},
	title: "Impacto de meteorito en eu-west-1",
	twist: {
		capacityAfterTwist: 7,
		description:
			"El equipo de plataforma confirma que otra unidad de negocio ya había reservado parte de la región de respaldo. Solo hay siete unidades de cómputo disponibles en lugar de doce.",
		identifier: "backup-capacity-limited",
		title: "La capacidad de respaldo es insuficiente para el plan inicial",
	},
}
