export type HealthStatus = "up" | "degraded" | "down";

export type SiteId =
  | "madrid"
  | "barcelona"
  | "valencia"
  | "sevilla"
  | "malaga"
  | "bilbao"
  | "a_coruna"
  | "zaragoza"
  | "canarias";

export type SectorId =
  | "energy"
  | "banking"
  | "retail"
  | "telecom"
  | "transport";

export type AgentPhaseId =
  | "analyze"
  | "plan"
  | "launch_subagents"
  | "restore"
  | "validate"
  | "close";

export type AgentStepStatus = "done" | "running" | "pending";

export type ToolCallStatus = "pending" | "running" | "done" | "failed";

export type Site = {
  id: SiteId;
  lat: number;
  lng: number;
  status: HealthStatus;
  inset?: "canarias";
  role?: "primary";
};

export type SiteLink = {
  id: string;
  from: SiteId;
  to: SiteId;
  status?: HealthStatus;
};

export type CompanyAction = "migrating" | "queued";

export type Company = {
  id: string;
  name: string;
  shortName: string;
  sector: SectorId;
  users: number;
  status: HealthStatus;
  action: CompanyAction;
  migrationProgress: number;
  etaMinutes?: number;
  accent: string;
};

export type AgentToolCall = {
  id: string;
  name: string;
  status: ToolCallStatus;
  summaryKey?: string;
  detailKey?: string;
  time?: string;
};

export type AgentSubagent = {
  id: string;
  name: string;
  companyId?: string;
  status: AgentStepStatus;
  headlineKey: string;
  reasoningKey?: string;
  tools: AgentToolCall[];
};

export type AgentPhase = {
  id: AgentPhaseId;
  status: AgentStepStatus;
  time?: string;
  tools?: AgentToolCall[];
  subagents?: AgentSubagent[];
};

export type AgentActivity =
  | { id: string; type: "reasoning"; textKey: string; time: string }
  | { id: string; type: "phase"; phaseId: AgentPhaseId }
  | {
      id: string;
      type: "message";
      role: "operator" | "agent";
      text?: string;
      textKey?: string;
      time: string;
    };

export type AgentState = {
  online: boolean;
  completed: number;
  total: number;
  currentReasoningKey: string;
  phases: AgentPhase[];
  activity: AgentActivity[];
};

export type InfraNode = {
  id: SiteId;
  status: HealthStatus;
  capacity: number;
};

export type DashboardSnapshot = {
  incident: {
    severity: "critical";
    localTime: string;
    elapsedMinutes: number;
    impactSiteId: SiteId;
  };
  global: {
    onlinePercent: number;
    active: number;
    degraded: number;
    down: number;
    companiesOnNetwork: number;
  };
  impact: {
    companiesOffline: number;
    companiesTotal: number;
    usersOffline: number;
    companiesDeltaPercent: number;
    usersDeltaPercent: number;
  };
  sites: Site[];
  links: SiteLink[];
  companies: Company[];
  agent: AgentState;
  camera: {
    timestamp: string;
  };
  migrationOverallPercent: number;
  infrastructure: InfraNode[];
};
