import { AgentMessages } from "@agent/types/agent-messages.type"
import {
	BusinessImpactLevel,
	ScenarioLanguage,
} from "@scenarios/types/scenario.type"

const IMPACT_LABELS_EN: Record<BusinessImpactLevel, string> = {
	critical: "critical",
	high: "high",
	low: "low",
	medium: "medium",
}

const IMPACT_LABELS_ES: Record<BusinessImpactLevel, string> = {
	critical: "crítico",
	high: "alto",
	low: "bajo",
	medium: "medio",
}

const MODE_LABELS_ES: Record<string, string> = {
	http: "HTTP",
	live: "real",
	simulated: "simulado",
}

const FACT_STATUS_LABELS_ES: Record<string, string> = {
	confirmed: "confirmado",
	pending: "pendiente",
	refuted: "descartado",
}

const OUTCOME_LABELS_ES: Record<string, string> = {
	failure: "fallida",
	partial: "parcial",
	success: "correcta",
}

const STATUS_LABELS_ES: Record<string, string> = {
	degraded: "degradado",
	down: "caído",
	healthy: "sano",
	recovering: "en recuperación",
}

const STEP_STATUS_LABELS_ES: Record<string, string> = {
	"awaiting-approval": "esperando aprobación",
	running: "en curso",
}

function labelOr(labels: Record<string, string>, key: string): string {
	const { [key]: label = key } = labels
	return label
}

function withComment(base: string, comment: string): string {
	if (comment) {
		return `${base}: ${comment}`
	}
	return base
}

const ENGLISH: AgentMessages = {
	actionBudgetReached:
		"Action budget reached; wait for operator or next event",
	actionNoLongerValid:
		"Action failed or state changed before dispatch. Reassess current state and tool records before retrying.",
	approvalExpiredRequestAgain:
		"The approval expired, it will be requested again",
	approvalRequestedAgain:
		"Approval will be requested again for the revised plan",
	approvedBy: (name, comment) => withComment(`Approved by ${name}`, comment),
	attemptFailedRetrying: (attempt, message) =>
		`Attempt ${attempt} failed (${message}). Retrying`,
	authorizationsRecorded: (count, mode) =>
		`${count} ${count === 1 ? "authorization" : "authorizations"} granted by the on-call engineer in ${mode} mode`,
	authorizedNotifyAllClients:
		"The on-call engineer authorized notifying every client about the incident",
	authorizedTrafficFailover:
		"The on-call engineer authorized diverting traffic to the backup region",
	awaitingEngineerCall:
		"Waiting for the on-call engineer to confirm the pending facts before committing capacity",
	capacityAllocated: (units, unit, serviceName, remaining) =>
		`${units} ${unit} committed to ${serviceName}, ${remaining} left`,
	capacityConfirmed: (units, reason) =>
		`Backup capacity confirmed at ${units} units: ${reason}`,
	changeBackInPlan: (serviceName, reason) =>
		`${serviceName} moved back into the plan: ${reason}`,
	changeCapacity: (previousUnits, nextUnits) =>
		`Backup capacity changed from ${previousUnits} to ${nextUnits} units`,
	changePostponed: (serviceName, reason) =>
		`${serviceName} postponed: ${reason}`,
	changePriority: (serviceName, previousRank, nextRank) =>
		`${serviceName} moved from priority ${previousRank} to ${nextRank}`,
	changeStepAdded: (title) => `New step: ${title}`,
	changeStepRemoved: (title) => `Removed step: ${title}`,
	contactEngineerTitle:
		"Call the on-call engineer to confirm the backup region facts",
	couldNotRequestApproval: "Could not request the approval",
	cycleSummary: (recovered, failing, next) =>
		`Recovered: ${recovered.length ? recovered.join(", ") : "nothing yet"}. Still failing: ${failing.length ? failing.join(", ") : "nothing"}. ${next}`,
	decisionChanges: (count, previousVersion) =>
		`${count} changes compared with version ${previousVersion}`,
	decisionPostponed: (serviceName, reason) =>
		`Postponed ${serviceName}: ${reason}`,
	decisionRecoverNow: (rank, serviceName, reason) =>
		`${rank}. ${serviceName}: ${reason}`,
	decisionRejectedDetail:
		"The proposed action did not pass runtime validation; the model must revise it.",
	dependsOnBlocked: (dependencies) =>
		`Depends on ${dependencies.join(", ")}, which cannot be recovered right now`,
	engineerFollowUpDescription: (pendingFacts) =>
		`The engineer could not be reached by phone. Confirm through another channel: ${pendingFacts.join("; ")}.`,
	engineerFollowUpReason:
		"Recovery continues, but the unconfirmed facts must be checked by someone",
	engineerFollowUpTaskTitle:
		"Confirm the backup region facts by another channel",
	engineerFollowUpTitle: "Chase the unconfirmed facts after the failed call",
	engineerUnreachable: (pendingFacts) =>
		`The engineer could not be reached after the allowed attempts. The plan continues with ${pendingFacts} unconfirmed ${pendingFacts === 1 ? "fact" : "facts"} and asks for confirmation by another channel`,
	expectedSingleToolCall: "Expected exactly one declared tool call",
	factRecorded: (status, statement, source) =>
		`${status}: ${statement} (${source})`,
	factsConfirmed: (count, mode) =>
		`${count} facts confirmed by the engineer in ${mode} mode`,
	followUpTaskDescription: (serviceIdentifier, detail) =>
		`${serviceIdentifier} answers but is degraded: ${detail}. Finish the recovery and confirm when healthy.`,
	followUpTaskTitle: (serviceIdentifier) =>
		`Finish partial recovery of ${serviceIdentifier}`,
	harnessCapacityLimited: (units, reason) =>
		`Backup capacity limited to ${units} units: ${reason}`,
	harnessImpact: "Meteorite impact: the primary region is offline",
	healthyNoAction: "Healthy, no action needed",
	historicalCapacityAssumption: (reportedUnits, assumedUnits, unit, runs) =>
		`The dashboard reports ${reportedUnits} ${unit} but in ${runs} previous ${runs === 1 ? "run" : "runs"} only ${assumedUnits} were really available. Planning with ${assumedUnits} until the capacity is confirmed`,
	immediateCallReason:
		"Only the on-call engineer can settle the pending facts, so the call goes out before any other work",
	immediateCallSummary:
		"The on-call engineer is being called right now. Every recovery stays postponed until the pending facts are settled",
	impactLabel: (level) => IMPACT_LABELS_EN[level],
	informationGathered: "Information gathered",
	insufficientCapacity: (details) =>
		`Needs ${details.neededUnits} ${details.unit} (${details.ownUnits} own${details.chain.length ? ` plus ${details.chainUnits} for ${details.chain.join(", ")}` : ""}) but only ${details.remainingUnits} remain in ${details.region}`,
	limitReached: (cycles) =>
		`The agent stopped after ${cycles} cycles to avoid running without progress. An operator can request a cycle manually`,
	modeLabel: (mode) => mode,
	newEvidenceReassessing:
		"New evidence arrived; reassessing before taking action",
	nextStep: (title) => `Next: ${title}`,
	notEvaluated: "Not evaluated",
	nothingRunnable: "Nothing runnable right now",
	openingCallPlanOnly:
		"The active plan is the opening engineer call the server dispatched: it carries no recovery, task or communication step, so nothing will resume this run. Propose the plan this incident needs with propose_plan, or explain in a new reason why no step at all can be planned.",
	outcomeLabel: (outcome) => outcome,
	partiallyRecovered:
		"Partially recovered. A follow-up task was assigned to finish the recovery",
	planFinished: "Plan finished",
	planRevised: (triggeredBy) => `Plan revised: ${triggeredBy}`,
	postponedSummary: (items) =>
		items.length
			? ` Postponed: ${items.map((item) => `${item.name} (${item.reason})`).join("; ")}.`
			: "",
	prepareTaskDescription: (actionDescription) =>
		`${actionDescription}. Confirm prerequisites and report blockers before the action is executed.`,
	prepareTaskReason: (serviceName, reason) =>
		`${serviceName} is prioritized: ${reason}`,
	prepareTaskShortTitle: (serviceName) => `Prepare ${serviceName} recovery`,
	prepareTaskTitle: (serviceName, backupRegion) =>
		`Prepare ${serviceName} for recovery in ${backupRegion}`,
	previousCallRunning: "A previous call for this step is still running",
	proposedByAgent: "Proposed by the agent",
	providerUnavailable: (detail) =>
		`${detail}. Autonomous decisions paused. Check the provider configuration and request another cycle from the agent controls.`,
	recoveredAndVerified: "Recovered and verified with an independent check",
	recoverNow: (impact, impactDescription, units, unit) =>
		`${IMPACT_LABELS_EN[impact]} impact: ${impactDescription}. Uses ${units} ${unit}`,
	recoveryExecuted: (actionDescription, outcome, detail) =>
		`${actionDescription}: ${outcome}. ${detail}`,
	recoveryFailed: (mode, detail) =>
		`Recovery failed in ${mode} mode: ${detail}`,
	recoveryFailedConstraint: (reason) => `Recovery failed: ${reason}`,
	recoveryInProgress: "Recovery already in progress with capacity reserved",
	recoveryNotVerified: (serviceName, status, detail) =>
		`${serviceName} is ${status} after the recovery: ${detail}`,
	recoveryPendingVerification: (outcome, mode) =>
		`Recovery ${outcome} in ${mode} mode. Pending verification`,
	recoveryVerified: (serviceName, mode) =>
		`${serviceName} verified healthy through an independent check (${mode})`,
	rejectedBy: (name, comment) => withComment(`Rejected by ${name}`, comment),
	rejectedConstraint: (name, comment) =>
		`${withComment(`Rejected by ${name}`, comment)}. The agent respects the operator decision`,
	requiredByDependent: (impact, dependentName, units, unit) =>
		`${IMPACT_LABELS_EN[impact]} impact and required by ${dependentName}. Uses ${units} ${unit}`,
	retryingAfterFailure: (reason) => `Retrying after failure: ${reason}`,
	runNoLongerLive: "Run is inactive, replaced or replaying",
	selectingNextAction: "Selecting the next investigation or action",
	selectingNextSpecialistAction: "Selecting the next specialist action",
	serviceChanged: (serviceIdentifier, status, reason) =>
		`${serviceIdentifier} changed to ${status}: ${reason}`,
	servicesChecked: (healthyCount, totalCount, discrepancies) =>
		discrepancies.length
			? `${healthyCount} of ${totalCount} services healthy. Discrepancies: ${discrepancies.join("; ")}`
			: `${healthyCount} of ${totalCount} services healthy. The independent check matches the recorded state`,
	specialistActionNoLongerValid:
		"The action failed or the state changed before dispatch. Reassess and report what you know.",
	specialistActionRejected:
		"The specialist action did not pass runtime validation and was not performed.",
	specialistTurnBudgetReached:
		"The specialist reached its turn budget without reporting a result.",
	specialistWithoutResult:
		"The specialist returned no result; the commander decides how to continue.",
	stepRunnableNow: (stepIdentifier) =>
		`Step ${stepIdentifier} is runnable now: its dependencies are complete and it is neither running nor awaiting approval. Select it with execute_step, or explain in a new reason why it cannot run.`,
	stepWaiting: (title, status) => `${title} (${status})`,
	summaryAllHealthy: "Every service is healthy. Nothing left to recover.",
	summaryNothingFits: (totalUnits, unit, postponed) =>
		`No service can be recovered with the ${totalUnits} ${unit} available.${postponed}`,
	summaryRecover: (
		names,
		plannedUnits,
		totalUnits,
		unit,
		region,
		postponed,
	) =>
		`Recover ${names.join(", then ")} using ${plannedUnits} of ${totalUnits} ${unit} in ${region}.${postponed}`,
	supportDescription: (postponedNames) =>
		`${postponedNames} will stay unavailable until more capacity is available. Share the delay with customers and escalate urgent cases.`,
	supportReason:
		"People waiting on postponed services need to know what to tell customers",
	supportTaskTitle: (postponedNames) =>
		`Communicate delay of ${postponedNames}`,
	supportTitle: "Brief customer support about the services that stay down",
	taskCreated: (taskIdentifier) => `Task ${taskIdentifier} created`,
	taskRegistered: "Task registered with an owner",
	timeoutsExpired: (approvals, toolCalls) =>
		`${approvals} approvals and ${toolCalls} tool calls timed out`,
	toolWithoutResult: "The tool finished without a result",
	triggerApprovalDecided: (approvalIdentifier) =>
		`Operator decided on approval ${approvalIdentifier}`,
	triggerFollowUp: "Follow-up after the previous cycle",
	triggerImpact: "Impact detected in the primary region",
	triggerOperator: (operatorName) => `Cycle requested by ${operatorName}`,
	triggerToolFinished: (toolCallIdentifier) =>
		`Tool call ${toolCallIdentifier} finished`,
	turnBudgetReached:
		"Autonomous decisions paused at the turn budget. Review activity and request another cycle to continue.",
	verificationFailed: (status, detail) =>
		`Verification failed, the service is still ${status}: ${detail}`,
	verifyReason:
		"A recovery is only complete after an independent check confirms it",
	verifyTitle: (serviceName, backupRegion) =>
		`Verify ${serviceName} answers from ${backupRegion}`,
	waitingFor: (items) => `Waiting for: ${items.join(", ")}`,
	waitingForDependency: (dependencies) =>
		`Degraded only because ${dependencies.join(", ")} ${dependencies.length === 1 ? "is" : "are"} down. It recovers on its own once they are back`,
	waitingForInFlightWork:
		"Work already in flight; waiting for its completion instead of spending another model turn",
	waitingForOperator:
		"Waiting for the operator to approve or reject the action",
	waitingForTool: (toolName) => `Waiting for ${toolName} to finish`,
}

const SPANISH: AgentMessages = {
	actionBudgetReached:
		"Se agotaron las acciones del ciclo; se espera al operador o al siguiente evento",
	actionNoLongerValid:
		"La acción falló o el estado cambió antes de enviarla. Revisa el estado actual y el registro de herramientas antes de reintentar.",
	approvalExpiredRequestAgain: "La aprobación expiró, se solicitará de nuevo",
	approvalRequestedAgain:
		"Se volverá a pedir aprobación para el plan revisado",
	approvedBy: (name, comment) => withComment(`Aprobado por ${name}`, comment),
	attemptFailedRetrying: (attempt, message) =>
		`El intento ${attempt} falló (${message}). Reintentando`,
	authorizationsRecorded: (count, mode) =>
		`${count} ${count === 1 ? "autorización concedida" : "autorizaciones concedidas"} por la ingeniera de guardia en modo ${labelOr(MODE_LABELS_ES, mode)}`,
	authorizedNotifyAllClients:
		"La ingeniera de guardia autorizó avisar del incidente a todos los clientes",
	authorizedTrafficFailover:
		"La ingeniera de guardia autorizó desviar el tráfico a la región de respaldo",
	awaitingEngineerCall:
		"A la espera de que la ingeniera de guardia confirme los hechos pendientes antes de comprometer capacidad",
	capacityAllocated: (units, unit, serviceName, remaining) =>
		`${units} ${unit} comprometidas en ${serviceName}, quedan ${remaining}`,
	capacityConfirmed: (units, reason) =>
		`Capacidad de respaldo confirmada en ${units} unidades: ${reason}`,
	changeBackInPlan: (serviceName, reason) =>
		`${serviceName} vuelve al plan: ${reason}`,
	changeCapacity: (previousUnits, nextUnits) =>
		`La capacidad de respaldo pasó de ${previousUnits} a ${nextUnits} unidades`,
	changePostponed: (serviceName, reason) =>
		`${serviceName} pospuesto: ${reason}`,
	changePriority: (serviceName, previousRank, nextRank) =>
		`${serviceName} pasó de la prioridad ${previousRank} a la ${nextRank}`,
	changeStepAdded: (title) => `Paso nuevo: ${title}`,
	changeStepRemoved: (title) => `Paso eliminado: ${title}`,
	contactEngineerTitle:
		"Llamar a la ingeniera de guardia para confirmar los datos de la región de respaldo",
	couldNotRequestApproval: "No se pudo solicitar la aprobación",
	cycleSummary: (recovered, failing, next) =>
		`Recuperado: ${recovered.length ? recovered.join(", ") : "nada todavía"}. Sigue fallando: ${failing.length ? failing.join(", ") : "nada"}. ${next}`,
	decisionChanges: (count, previousVersion) =>
		`${count} cambios respecto a la versión ${previousVersion}`,
	decisionPostponed: (serviceName, reason) =>
		`Pospuesto ${serviceName}: ${reason}`,
	decisionRecoverNow: (rank, serviceName, reason) =>
		`${rank}. ${serviceName}: ${reason}`,
	decisionRejectedDetail:
		"La acción propuesta no pasó la validación en tiempo de ejecución; el modelo debe revisarla.",
	dependsOnBlocked: (dependencies) =>
		`Depende de ${dependencies.join(", ")}, que no puede recuperarse ahora`,
	engineerFollowUpDescription: (pendingFacts) =>
		`No se pudo contactar con la ingeniera por teléfono. Confirmar por otro canal: ${pendingFacts.join("; ")}.`,
	engineerFollowUpReason:
		"La recuperación continúa, pero alguien debe comprobar los hechos sin confirmar",
	engineerFollowUpTaskTitle:
		"Confirmar los datos de la región de respaldo por otro canal",
	engineerFollowUpTitle:
		"Perseguir los hechos sin confirmar tras la llamada fallida",
	engineerUnreachable: (pendingFacts) =>
		`No se pudo contactar con la ingeniera tras los intentos permitidos. El plan continúa con ${pendingFacts} ${pendingFacts === 1 ? "hecho sin confirmar" : "hechos sin confirmar"} y pide confirmación por otro canal`,
	expectedSingleToolCall:
		"Se esperaba exactamente una llamada a herramienta declarada",
	factRecorded: (status, statement, source) =>
		`${labelOr(FACT_STATUS_LABELS_ES, status)}: ${statement} (${source})`,
	factsConfirmed: (count, mode) =>
		`${count} hechos confirmados por la ingeniera en modo ${labelOr(MODE_LABELS_ES, mode)}`,
	followUpTaskDescription: (serviceIdentifier, detail) =>
		`${serviceIdentifier} responde pero está degradado: ${detail}. Terminar la recuperación y confirmar cuando esté sano.`,
	followUpTaskTitle: (serviceIdentifier) =>
		`Terminar la recuperación parcial de ${serviceIdentifier}`,
	harnessCapacityLimited: (units, reason) =>
		`La capacidad de respaldo baja a ${units} unidades: ${reason}`,
	harnessImpact:
		"Impacto de meteorito: la región principal está fuera de servicio",
	healthyNoAction: "Sano, no requiere acción",
	historicalCapacityAssumption: (reportedUnits, assumedUnits, unit, runs) =>
		`El panel indica ${reportedUnits} ${unit}, pero en ${runs} ${runs === 1 ? "ejecución anterior" : "ejecuciones anteriores"} solo había ${assumedUnits} disponibles. Se planifica con ${assumedUnits} hasta confirmar la capacidad`,
	immediateCallReason:
		"Solo la ingeniera de guardia puede resolver los hechos pendientes, así que la llamada sale antes que cualquier otro trabajo",
	immediateCallSummary:
		"Se está llamando ahora mismo a la ingeniera de guardia. Toda recuperación queda pospuesta hasta resolver los hechos pendientes",
	impactLabel: (level) => IMPACT_LABELS_ES[level],
	informationGathered: "Información recogida",
	insufficientCapacity: (details) =>
		`Necesita ${details.neededUnits} ${details.unit} (${details.ownUnits} propias${details.chain.length ? ` más ${details.chainUnits} para ${details.chain.join(", ")}` : ""}) pero solo quedan ${details.remainingUnits} en ${details.region}`,
	limitReached: (cycles) =>
		`El agente se detuvo tras ${cycles} ciclos para no seguir sin progreso. Un operador puede solicitar un ciclo manualmente`,
	modeLabel: (mode) => labelOr(MODE_LABELS_ES, mode),
	newEvidenceReassessing:
		"Llegó evidencia nueva; se replantea antes de actuar",
	nextStep: (title) => `Siguiente: ${title}`,
	notEvaluated: "Sin evaluar",
	nothingRunnable: "Nada ejecutable ahora mismo",
	openingCallPlanOnly:
		"El plan activo es solo la llamada inicial al ingeniero que lanzó el servidor: no contiene ningún paso de recuperación, tarea ni comunicación, así que nada reanudará esta ejecución. Propón con propose_plan el plan que necesita el incidente, o explica en un motivo nuevo por qué no se puede planificar ningún paso.",
	outcomeLabel: (outcome) => labelOr(OUTCOME_LABELS_ES, outcome),
	partiallyRecovered:
		"Recuperado parcialmente. Se asignó una tarea de seguimiento para terminar la recuperación",
	planFinished: "Plan terminado",
	planRevised: (triggeredBy) => `Plan revisado: ${triggeredBy}`,
	postponedSummary: (items) =>
		items.length
			? ` Pospuesto: ${items.map((item) => `${item.name} (${item.reason})`).join("; ")}.`
			: "",
	prepareTaskDescription: (actionDescription) =>
		`${actionDescription}. Confirmar requisitos previos y avisar de bloqueos antes de ejecutar la acción.`,
	prepareTaskReason: (serviceName, reason) =>
		`${serviceName} tiene prioridad: ${reason}`,
	prepareTaskShortTitle: (serviceName) =>
		`Preparar la recuperación de ${serviceName}`,
	prepareTaskTitle: (serviceName, backupRegion) =>
		`Preparar ${serviceName} para recuperarlo en ${backupRegion}`,
	previousCallRunning: "Una llamada anterior de este paso sigue en curso",
	proposedByAgent: "Propuesto por el agente",
	providerUnavailable: (detail) =>
		`${detail}. Las decisiones autónomas quedan en pausa. Revisa la configuración del proveedor y pide otro ciclo desde los controles del agente.`,
	recoveredAndVerified:
		"Recuperado y verificado con una comprobación independiente",
	recoverNow: (impact, impactDescription, units, unit) =>
		`Impacto ${IMPACT_LABELS_ES[impact]}: ${impactDescription}. Usa ${units} ${unit}`,
	recoveryExecuted: (actionDescription, outcome, detail) =>
		`${actionDescription}: ${labelOr(OUTCOME_LABELS_ES, outcome)}. ${detail}`,
	recoveryFailed: (mode, detail) =>
		`La recuperación falló en modo ${labelOr(MODE_LABELS_ES, mode)}: ${detail}`,
	recoveryFailedConstraint: (reason) => `La recuperación falló: ${reason}`,
	recoveryInProgress: "Recuperación ya en curso con capacidad reservada",
	recoveryNotVerified: (serviceName, status, detail) =>
		`${serviceName} sigue ${labelOr(STATUS_LABELS_ES, status)} después de la recuperación: ${detail}`,
	recoveryPendingVerification: (outcome, mode) =>
		`Recuperación ${labelOr(OUTCOME_LABELS_ES, outcome)} en modo ${labelOr(MODE_LABELS_ES, mode)}. Pendiente de verificación`,
	recoveryVerified: (serviceName, mode) =>
		`${serviceName} verificado saludable por una comprobación independiente (${labelOr(MODE_LABELS_ES, mode)})`,
	rejectedBy: (name, comment) =>
		withComment(`Rechazado por ${name}`, comment),
	rejectedConstraint: (name, comment) =>
		`${withComment(`Rechazado por ${name}`, comment)}. El agente respeta la decisión del operador`,
	requiredByDependent: (impact, dependentName, units, unit) =>
		`Impacto ${IMPACT_LABELS_ES[impact]} y necesario para ${dependentName}. Usa ${units} ${unit}`,
	retryingAfterFailure: (reason) => `Reintentando tras el fallo: ${reason}`,
	runNoLongerLive: "La ejecución está inactiva, sustituida o en repetición",
	selectingNextAction: "Eligiendo la siguiente investigación o acción",
	selectingNextSpecialistAction:
		"Eligiendo la siguiente acción del especialista",
	serviceChanged: (serviceIdentifier, status, reason) =>
		`${serviceIdentifier} pasó a ${labelOr(STATUS_LABELS_ES, status)}: ${reason}`,
	servicesChecked: (healthyCount, totalCount, discrepancies) =>
		discrepancies.length
			? `${healthyCount} de ${totalCount} servicios sanos. Discrepancias: ${discrepancies.join("; ")}`
			: `${healthyCount} de ${totalCount} servicios sanos. La comprobación independiente coincide con el estado registrado`,
	specialistActionNoLongerValid:
		"La acción falló o el estado cambió antes de enviarla. Replantea e informa de lo que sepas.",
	specialistActionRejected:
		"La acción del especialista no pasó la validación en tiempo de ejecución y no se ejecutó.",
	specialistTurnBudgetReached:
		"El especialista agotó sus turnos sin informar de un resultado.",
	specialistWithoutResult:
		"El especialista no devolvió resultado; el comandante decide cómo continuar.",
	stepRunnableNow: (stepIdentifier) =>
		`El paso ${stepIdentifier} se puede ejecutar ya: sus dependencias están completas y no está en curso ni esperando aprobación. Selecciónalo con execute_step, o explica en un motivo nuevo por qué no puede ejecutarse.`,
	stepWaiting: (title, status) =>
		`${title} (${labelOr(STEP_STATUS_LABELS_ES, status)})`,
	summaryAllHealthy:
		"Todos los servicios están sanos. No queda nada por recuperar.",
	summaryNothingFits: (totalUnits, unit, postponed) =>
		`Ningún servicio puede recuperarse con las ${totalUnits} ${unit} disponibles.${postponed}`,
	summaryRecover: (
		names,
		plannedUnits,
		totalUnits,
		unit,
		region,
		postponed,
	) =>
		`Recuperar ${names.join(", después ")} usando ${plannedUnits} de ${totalUnits} ${unit} en ${region}.${postponed}`,
	supportDescription: (postponedNames) =>
		`${postponedNames} seguirán sin servicio hasta que haya más capacidad. Comunicar el retraso a los clientes y escalar los casos urgentes.`,
	supportReason:
		"Quien atiende a los clientes necesita saber qué decir sobre los servicios pospuestos",
	supportTaskTitle: (postponedNames) =>
		`Comunicar el retraso de ${postponedNames}`,
	supportTitle:
		"Informar a atención al cliente de los servicios que siguen caídos",
	taskCreated: (taskIdentifier) => `Tarea ${taskIdentifier} creada`,
	taskRegistered: "Tarea registrada con responsable",
	timeoutsExpired: (approvals, toolCalls) =>
		`${approvals} aprobaciones y ${toolCalls} llamadas a herramientas expiraron`,
	toolWithoutResult: "La herramienta terminó sin resultado",
	triggerApprovalDecided: (approvalIdentifier) =>
		`El operador decidió sobre la aprobación ${approvalIdentifier}`,
	triggerFollowUp: "Seguimiento tras el ciclo anterior",
	triggerImpact: "Impacto detectado en la región principal",
	triggerOperator: (operatorName) => `Ciclo solicitado por ${operatorName}`,
	triggerToolFinished: (toolCallIdentifier) =>
		`Terminó la llamada a herramienta ${toolCallIdentifier}`,
	turnBudgetReached:
		"Las decisiones autónomas se detienen al agotar los turnos. Revisa la actividad y pide otro ciclo para continuar.",
	verificationFailed: (status, detail) =>
		`La verificación falló, el servicio sigue ${labelOr(STATUS_LABELS_ES, status)}: ${detail}`,
	verifyReason:
		"Una recuperación solo se da por completa cuando una comprobación independiente la confirma",
	verifyTitle: (serviceName, backupRegion) =>
		`Verificar que ${serviceName} responde desde ${backupRegion}`,
	waitingFor: (items) => `Esperando: ${items.join(", ")}`,
	waitingForDependency: (dependencies) =>
		`Degradado solo porque ${dependencies.join(", ")} ${dependencies.length === 1 ? "está caído" : "están caídos"}. Se recupera solo cuando vuelvan`,
	waitingForInFlightWork:
		"Hay trabajo en curso; se espera su finalización en lugar de gastar otro turno del modelo",
	waitingForOperator:
		"Esperando a que el operador apruebe o rechace la acción",
	waitingForTool: (toolName) => `Esperando a que termine ${toolName}`,
}

export const AGENT_MESSAGES: Record<ScenarioLanguage, AgentMessages> = {
	en: ENGLISH,
	es: SPANISH,
}
