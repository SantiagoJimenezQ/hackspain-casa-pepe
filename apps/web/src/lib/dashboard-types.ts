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

export type Site = {
  id: SiteId;
  name: string;
  role?: string;
  lat: number;
  lng: number;
  status: HealthStatus;
  inset?: "canarias";
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
  sector: string;
  users: number;
  status: HealthStatus;
  action: CompanyAction;
  migrationProgress: number;
  etaMinutes?: number;
  accent: string;
};

export type AgentStepStatus = "done" | "running" | "pending";

export type AgentStep = {
  id: string;
  label: string;
  status: AgentStepStatus;
  time?: string;
};

export type InfraNode = {
  id: SiteId;
  name: string;
  status: HealthStatus;
  capacity: number;
};

export type DashboardSnapshot = {
  incident: {
    severity: "critical";
    title: string;
    description: string;
    localTime: string;
    elapsedLabel: string;
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
  agent: {
    online: boolean;
    statusLabel: string;
    progressLabel: string;
    completed: number;
    total: number;
    quote: string;
    steps: AgentStep[];
  };
  camera: {
    title: string;
    timestamp: string;
  };
  migrationOverallPercent: number;
  infrastructure: InfraNode[];
};
