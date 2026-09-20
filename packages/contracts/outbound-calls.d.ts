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

/**
 * Permissions the voice agent reports the moment the contact grants them, while the call is
 * still open. Provider analysis only lands once the conversation ends, and it returns `null`
 * whenever the contact answered over the agent, so a clear spoken "yes" was being lost. Like
 * every integration report this is a claim, never a plan approval.
 */
export interface LiveAuthorizationReport {
  readonly callIdentifier: string
  readonly notifyAllClients: boolean
  readonly trafficFailoverAuthorized: boolean
  /** What the contact actually said, so an operator can audit the claim. */
  readonly rationale: string
}

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
