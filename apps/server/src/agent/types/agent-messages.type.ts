import { BusinessImpactLevel } from "@scenarios/types/scenario.type"

export interface PostponedItem {
	readonly name: string
	readonly reason: string
}

export interface InsufficientCapacityDetails {
	readonly neededUnits: number
	readonly ownUnits: number
	readonly chain: ReadonlyArray<string>
	readonly chainUnits: number
	readonly remainingUnits: number
	readonly unit: string
	readonly region: string
}

export interface AgentMessages {
	impactLabel(level: BusinessImpactLevel): string
	readonly notEvaluated: string
	readonly healthyNoAction: string
	readonly recoveryInProgress: string
	waitingForDependency(dependencies: ReadonlyArray<string>): string
	dependsOnBlocked(dependencies: ReadonlyArray<string>): string
	insufficientCapacity(details: InsufficientCapacityDetails): string
	requiredByDependent(
		impact: BusinessImpactLevel,
		dependentName: string,
		units: number,
		unit: string,
	): string
	recoverNow(
		impact: BusinessImpactLevel,
		impactDescription: string,
		units: number,
		unit: string,
	): string
	readonly contactEngineerTitle: string
	readonly awaitingEngineerCall: string
	readonly immediateCallReason: string
	readonly immediateCallSummary: string
	prepareTaskTitle(serviceName: string, backupRegion: string): string
	prepareTaskReason(serviceName: string, reason: string): string
	prepareTaskDescription(actionDescription: string): string
	prepareTaskShortTitle(serviceName: string): string
	verifyTitle(serviceName: string, backupRegion: string): string
	readonly verifyReason: string
	readonly supportTitle: string
	readonly supportReason: string
	supportDescription(postponedNames: string): string
	supportTaskTitle(postponedNames: string): string
	postponedSummary(items: ReadonlyArray<PostponedItem>): string
	summaryRecover(
		names: ReadonlyArray<string>,
		plannedUnits: number,
		totalUnits: number,
		unit: string,
		region: string,
		postponed: string,
	): string
	summaryNothingFits(
		totalUnits: number,
		unit: string,
		postponed: string,
	): string
	readonly summaryAllHealthy: string
	historicalCapacityAssumption(
		reportedUnits: number,
		assumedUnits: number,
		unit: string,
		runs: number,
	): string
	retryingAfterFailure(reason: string): string
	readonly approvalRequestedAgain: string
	readonly proposedByAgent: string
	waitingForTool(toolName: string): string
	readonly previousCallRunning: string
	readonly waitingForOperator: string
	readonly couldNotRequestApproval: string
	attemptFailedRetrying(attempt: number, message: string): string
	readonly toolWithoutResult: string
	factsConfirmed(count: number, mode: string): string
	taskCreated(taskIdentifier: string): string
	readonly taskRegistered: string
	recoveryFailed(mode: string, detail: string): string
	recoveryPendingVerification(outcome: string, mode: string): string
	readonly recoveredAndVerified: string
	readonly partiallyRecovered: string
	followUpTaskTitle(serviceIdentifier: string): string
	followUpTaskDescription(serviceIdentifier: string, detail: string): string
	verificationFailed(status: string, detail: string): string
	readonly informationGathered: string
	servicesChecked(
		healthyCount: number,
		totalCount: number,
		discrepancies: ReadonlyArray<string>,
	): string
	approvedBy(name: string, comment: string): string
	rejectedBy(name: string, comment: string): string
	readonly approvalExpiredRequestAgain: string
	rejectedConstraint(name: string, comment: string): string
	recoveryFailedConstraint(reason: string): string
	planRevised(triggeredBy: string): string
	readonly triggerImpact: string
	triggerToolFinished(toolCallIdentifier: string): string
	triggerApprovalDecided(approvalIdentifier: string): string
	triggerOperator(operatorName: string): string
	readonly triggerFollowUp: string
	cycleSummary(
		recovered: ReadonlyArray<string>,
		failing: ReadonlyArray<string>,
		next: string,
	): string
	waitingFor(items: ReadonlyArray<string>): string
	nextStep(title: string): string
	readonly planFinished: string
	readonly nothingRunnable: string
	stepWaiting(title: string, status: string): string
	decisionRecoverNow(
		rank: number,
		serviceName: string,
		reason: string,
	): string
	decisionPostponed(serviceName: string, reason: string): string
	decisionChanges(count: number, previousVersion: number): string
	limitReached(cycles: number): string
	outcomeLabel(outcome: string): string
	modeLabel(mode: string): string
	capacityConfirmed(units: number, reason: string): string
	serviceChanged(
		serviceIdentifier: string,
		status: string,
		reason: string,
	): string
	timeoutsExpired(approvals: number, toolCalls: number): string
	changeCapacity(previousUnits: number, nextUnits: number): string
	changePostponed(serviceName: string, reason: string): string
	changeBackInPlan(serviceName: string, reason: string): string
	changePriority(
		serviceName: string,
		previousRank: number,
		nextRank: number,
	): string
	changeStepAdded(title: string): string
	changeStepRemoved(title: string): string
	engineerUnreachable(pendingFacts: number): string
	readonly engineerFollowUpTitle: string
	readonly engineerFollowUpReason: string
	engineerFollowUpDescription(pendingFacts: ReadonlyArray<string>): string
	readonly engineerFollowUpTaskTitle: string
}
