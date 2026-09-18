/** Agent-facing MVP names. Legacy runtime tools remain available for existing plans. */
export type MvpToolName =
  | 'get_incident_context' | 'call_engineer' | 'save_recovery_plan'
  | 'send_incident_email' | 'request_approval' | 'execute_recovery'
  | 'verify_recovery' | 'publish_status_update'

/** Destinations and copy are derived server-side from the persisted plan. */
export interface PlanCommunicationInput { readonly planIdentifier: string }
export interface CommunicationReceipt {
  readonly kind: 'communication'
  readonly channel: 'email' | 'status'
  readonly mode: 'simulated' | 'live'
  readonly reference: string
  readonly detail: string
}

/** The integration reports a claim, never an authorization or a trusted identity. */
export interface IncomingCallReport {
  readonly providerCallIdentifier: string
  readonly runIdentifier: string
  readonly callerName: string
  readonly summary: string
  readonly reportedCapacity: number
}
export interface ConfirmIncomingCall {
  readonly operatorName: string
  readonly confirmedCapacity: number
}
export interface IncomingCallRecord extends IncomingCallReport {
  readonly identifier: string
  readonly mode: 'simulated' | 'live'
  readonly status: 'pending' | 'confirmed'
  readonly confirmedBy: string
  readonly confirmedCapacity: number | null
  readonly receivedAt: string
}
export interface StatusPublication {
  readonly runIdentifier: string
  readonly planIdentifier: string
  readonly planVersion: number
  readonly simulated: boolean
  readonly services: ReadonlyArray<{ readonly name: string; readonly status: string }>
}

export interface CallEngineerInput {
 readonly engineerName: string
 readonly engineerPhone: string
 readonly engineerRole: string
 readonly purpose: string
 readonly questions: ReadonlyArray<{readonly key: string; readonly question: string}>
}
export interface RequestApprovalInput {
 readonly actionSummary: string
 readonly reason: string
 readonly consequences: ReadonlyArray<string>
 readonly serviceIdentifier: string
 readonly capacityUnits: number
}
export interface ExecuteRecoveryInput {
 readonly serviceIdentifier: string
 readonly actionKind: import('./incident').RecoveryActionKind
 readonly actionDescription: string
 readonly capacityUnits: number
 readonly resourceIdentifier: string
 readonly approvalIdentifier: string
}
export interface VerifyRecoveryInput {
 readonly serviceIdentifier: string
 readonly recoveryActionIdentifier: string
}
/** The planner supplies its typed draft; previous state is loaded server-side. */
export type SaveRecoveryPlanInput<PlanDraft> = PlanDraft & {readonly expectedPreviousIdentifier: string}
export type MvpToolInvocation<PlanDraft> =
 | {readonly name: 'get_incident_context'; readonly input: Record<string, never>}
 | {readonly name: 'call_engineer'; readonly input: CallEngineerInput}
 | {readonly name: 'save_recovery_plan'; readonly input: SaveRecoveryPlanInput<PlanDraft>}
 | {readonly name: 'send_incident_email'; readonly input: PlanCommunicationInput}
 | {readonly name: 'request_approval'; readonly input: RequestApprovalInput}
 | {readonly name: 'execute_recovery'; readonly input: ExecuteRecoveryInput}
 | {readonly name: 'verify_recovery'; readonly input: VerifyRecoveryInput}
 | {readonly name: 'publish_status_update'; readonly input: PlanCommunicationInput}
