import type { DeliveryProbeResult, PlanComparison } from "../../../../packages/contracts/demo-controls";
export type { CapacityChangeRequest, DeliveryProbeResult, PlanComparison, PlanComparisonSnapshot } from "../../../../packages/contracts/demo-controls";
import type { Locale } from "@/lib/i18n";

export type ServiceHealth = "healthy" | "degraded" | "down" | "recovering";
export type PlanStepStatus =
  | "proposed"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "postponed";

export type ActivityRecord = {
  runIdentifier?: string;
  identifier: string;
  sequence: number;
  occurredAt: string;
  type: string;
  source: string;
  title: string;
  summary: string;
  simulated: boolean;
  replayed: boolean;
  payload?: Record<string, unknown>;
};

export type LlmDisposition = "pending" | "accepted" | "rejected" | "stale" | "incomplete";

export type LlmPublicToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type LlmHistoryPage = {
  items: ActivityRecord[];
  nextBeforeSequence: number | null;
};

export type Service = {
  identifier: string;
  name: string;
  description: string;
  status: ServiceHealth;
  statusReason: string;
  businessImpact: "critical" | "high" | "medium" | "low";
  impactDescription: string;
  dependencies: string[];
  recoveryCapacityUnits: number;
  recoveryRequiresApproval: boolean;
  lastChangedAt: string;
};

export type Incident = {
  /** Six-digit code a company reads out to reach this run; absent on runs created before it. */
  callCode?: string;
  runKind?: "live" | "replay";
  simulation?: { mode: "manual" | "randomized" };
  runIdentifier: string;
  title: string;
  company: string;
  narrative: string;
  region: string;
  backupRegion: string;
  status: string;
  active: boolean;
  startedAt: string;
  impactedAt: string;
  resolvedAt: string;
  businessImpactSummary: string;
  services: Service[];
  topology?: {
    nodes?: Array<{ identifier: string; label: string; region: string; latitude: number; longitude: number; role: "primary" | "backup"; status: "up" | "degraded" | "down"; priority?: number }>;
    links?: Array<{ identifier: string; from: string; to: string }>;
  };
    customers: Array<{
    identifier: string; name: string; shortName: string; sector: string; city?: string;
    latitude?: number; longitude?: number; logo?: string; users: number;
    serviceIdentifiers: string[]; accent: string;
  }>;
  resources: Array<{
    identifier: string;
    name: string;
    region: string;
    unit: string;
    totalCapacity: number;
    allocatedCapacity: number;
    confirmed: boolean;
    note: string;
  }>;
  facts: Array<{
    identifier: string;
    statement: string;
    status: "confirmed" | "pending" | "refuted";
    source: string;
    recordedAt: string;
  }>;
};

export type Plan = {
  identifier: string;
  version: number;
  status: "active" | "superseded" | "completed";
  summary: string;
  reason: string;
  capacity: {
    resourceIdentifier: string;
    totalCapacity: number;
    assumedCapacity: number;
    plannedUnits: number;
    remainingUnits: number;
    postponedUnits: number;
    confirmed: boolean;
  };
  assumptions: string[];
  changesFromPrevious: Array<{
    kind: string;
    description: string;
    serviceIdentifier: string;
  }>;
  priorities: Array<{
    serviceIdentifier: string;
    serviceName: string;
    rank: number;
    score: number;
    businessImpact: string;
    capacityUnits: number;
    decision: string;
    reason: string;
    blockedBy: string[];
  }>;
  steps: Array<{
    identifier: string;
    order: number;
    title: string;
    reason: string;
    owner: { kind: string; name: string };
    serviceIdentifier: string;
    capacityUnits: number;
    requiresApproval: boolean;
    status: PlanStepStatus;
    statusReason: string;
    resultSummary: string;
    attempts: number;
    updatedAt: string;
    toolCallIdentifier?: string;
    invocation?: { name: string; input: Record<string, unknown> };
  }>;
};

export type Approval = {
  identifier: string;
  serviceIdentifier: string;
  actionSummary: string;
  reason: string;
  consequences: string[];
  capacityUnits: number;
  status: "pending" | "approved" | "rejected" | "superseded" | "expired";
  requestedAt: string;
  expiresAt: string;
};

export type Task = {
  identifier: string;
  title: string;
  description: string;
  assignee: { name: string; role: string };
  priority: string;
  status: string;
  statusNote: string;
  serviceIdentifier: string;
  updatedAt: string;
};

/** A `null` value means nobody reached a verdict on that permission. */
export type CallAuthorizations = {
  notifyAllClients?: { value: boolean | null } | null;
  trafficFailoverAuthorized?: { value: boolean | null } | null;
};

export type EngineerCall = {
  identifier: string;
  engineer: { name: string; role: string };
  purpose: string;
  mode: "simulated" | "live";
  status: string;
  result: {
    summary: string;
    transcript: string;
    authorizations?: CallAuthorizations | null;
  } | null;
  failureReason: string;
  startedAt: string;
  finishedAt: string;
};

export type ToolCallSubagent = {
  id: string;
  name: string;
  status: string;
};

export type ToolCall = {
  identifier: string;
  name: string;
  interaction: string;
  status: string;
  simulated: boolean;
  error: { message: string; code?: string; retryable?: boolean } | null;
  startedAt: string;
  finishedAt: string;
  createdAt?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  planStepIdentifier?: string;
  attempt?: number;
  parentIdentifier?: string;
  subagent?: ToolCallSubagent;
};

export type LearningInsight = {
  identifier: string;
  kind: string;
  subject: string;
  summary: string;
  observations: number;
  updatedAt: string;
};

export type RunReport = {
  status: string;
  services: { recovered: string[]; degraded: string[]; down: string[] };
  lessons: string[];
  toolCalls: { total: number; succeeded: number; failed: number; simulated: number };
};

export type Overview = {
  deliveryProbes?: readonly DeliveryProbeResult[];
  planComparison?: PlanComparison | null;
  incident: Incident;
  plan: { kind: "none" } | { kind: "plan"; plan: Plan };
  pendingApprovals: Approval[];
  tasks: Task[];
  engineerCalls: EngineerCall[];
  toolCalls: ToolCall[];
  recentActivity: ActivityRecord[];
  /** The line a company can ring to reach this run; absent until inbound calls are configured. */
  inboundCall?: { phoneNumber: string };
  agent: {
    recoveryMode?: "simulated" | "http";
    engine?: "llm";
    model?: string;
    /** Language the run is written in; the interface follows it so nothing appears half translated. */
    language?: Locale;
    cycleInProgress: boolean;
    cycles: number;
    maximumCycles: number;
    planVersion: number;
    pendingApprovals: number;
    runningToolCalls: number;
    lastCycleOutcome: { kind: string; reason?: string; executedSteps?: number } | null;
  };
};
