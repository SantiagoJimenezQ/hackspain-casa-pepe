/** Provider-neutral data exchanged by outbound engineer call adapters. */
export type EngineerCallProvider = 'happyrobot' | 'elevenlabs'
export type OutboundCallProvider = EngineerCallProvider

export interface EngineerCallIncidentContext {
  /** ISO timestamp of the outage, not the call start; absent for legacy calls. */
  readonly outageStartedAt?: string
  readonly location: string
  readonly incidentDescription: string
  readonly servicesDown: ReadonlyArray<string>
}
export type OutboundCallIncidentContext = EngineerCallIncidentContext

export interface EngineerCallAuthorization {
  /** `null` means the caller did not provide a usable boolean answer. */
  readonly value: boolean | null
  readonly rationale: string
}
export type OutboundCallAuthorization = EngineerCallAuthorization

export interface EngineerCallAuthorizations {
  readonly notifyAllClients: EngineerCallAuthorization
  readonly trafficFailoverAuthorized: EngineerCallAuthorization
}
export type OutboundCallAuthorizations = EngineerCallAuthorizations

/** Provider identifiers returned by a call start request. */
export interface OutboundCallReferences {
  /** Conversation or workflow identifier returned by the provider. */
  readonly providerReference?: string
  /** Telephony call identifier, such as a Twilio call SID. */
  readonly providerCallSid?: string
  /** Provider selected for this call, when known. */
  readonly provider?: EngineerCallProvider
}

/** Result posted by a HappyRobot workflow. Permissions are evidence, not plan approval. */
export interface HappyRobotCallCallback {
  /** Authorization phase records evidence while the phone call remains pending. */
  readonly phase?: 'authorization' | 'completed'
  readonly callIdentifier: string
  readonly outcome: 'completed' | 'failed' | 'no-answer'
  readonly summary?: string
  readonly transcript?: string
  readonly authorizations?: EngineerCallAuthorizations
  readonly answers?: ReadonlyArray<{ readonly key: string; readonly answer: string; readonly confirmed?: boolean }>
}
