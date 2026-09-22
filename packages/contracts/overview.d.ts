/** Opaque, browser-run-scoped version for lightweight snapshot reconciliation. */
export interface OverviewVersion {
  readonly revision: string
}

/** Returned only when GET /overview?knownRevision=... matches current state. */
export interface UnchangedOverview extends OverviewVersion {
  readonly unchanged: true
}
