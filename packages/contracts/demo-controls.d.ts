/** Authenticated, run-scoped demo controls. Capacity is TOTAL usable units, including allocations. */
export interface CapacityChangeRequest {
  runIdentifier: string
  resourceIdentifier: string
  totalCapacity: number
  reason: string
}

export interface DeliveryProbeResult {
  runIdentifier: string
  checkedAt: string
  mode: "http"
  verified: boolean
  detail: string
  deliveryIdentifier: string | null
  routeIdentifier: string | null
}

export interface PlanComparisonSnapshot {
  identifier: string
  version: number
  summary: string
  reason: string
  resourceIdentifier: string
  resourceName: string
  totalCapacity: number
  plannedUnits: number
  priorities: ReadonlyArray<{
    serviceIdentifier: string
    serviceName: string
    rank: number
    decision: string
    reason: string
    blockedBy: ReadonlyArray<string>
  }>
  steps: ReadonlyArray<{ order: number; title: string; reason: string; status: string }>
}

/** Returned by GET /overview; built from persisted versions, not browser history. */
export interface PlanComparison {
  previous: PlanComparisonSnapshot | null
  current: PlanComparisonSnapshot
  trigger: string
  capacityChanges: ReadonlyArray<{
    resourceIdentifier: string
    resourceName: string
    previousCapacity: number | null
    totalCapacity: number
    reason: string
    occurredAt: string
  }>
  changes: ReadonlyArray<{ kind: string; description: string; serviceIdentifier: string }>
  supersededApprovals: ReadonlyArray<{ identifier: string; actionSummary: string; reason: string }>
}
