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
  identifier: string;
  sequence: number;
  occurredAt: string;
  type: string;
  source: string;
  title: string;
  summary: string;
  simulated: boolean;
  replayed: boolean;
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
  businessImpactSummary: string;
  services: Service[];
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

export type EngineerCall = {
  identifier: string;
  engineer: { name: string; role: string };
  purpose: string;
  mode: "simulated" | "live";
  status: string;
  result: { summary: string; transcript: string } | null;
  failureReason: string;
};

export type ToolCall = {
  identifier: string;
  name: string;
  interaction: string;
  status: string;
  simulated: boolean;
  error: { message: string } | null;
  finishedAt: string;
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
  incident: Incident;
  plan: { kind: "none" } | { kind: "plan"; plan: Plan };
  pendingApprovals: Approval[];
  tasks: Task[];
  engineerCalls: EngineerCall[];
  toolCalls: ToolCall[];
  recentActivity: ActivityRecord[];
  agent: {
    cycleInProgress: boolean;
    cycles: number;
    maximumCycles: number;
    planVersion: number;
    pendingApprovals: number;
    runningToolCalls: number;
    lastCycleOutcome: { kind: string; reason?: string; executedSteps?: number } | null;
  };
};
