import type { ActivityRecord, Incident, Overview, Plan, Service, ToolCall } from "@/lib/casa-pepe-types";
import type { VisualStatus } from "@/lib/live-dashboard";

export type ElementsToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type RecoveryPhase = "recovering" | "recovered" | "queued";

export type RecoveryTimelineItem = {
  identifier: string;
  name: string;
  status: VisualStatus;
  phase: RecoveryPhase;
  reason: string;
  startedAt: string;
  capacityUnits: number;
};

export type CurrentWork =
  | { kind: "tool"; tool: ToolCall; title: string; state: ElementsToolState }
  | { kind: "approval"; title: string; reason: string }
  | { kind: "thinking"; title: string }
  | { kind: "idle"; title: string };

export type DecidedApproval = {
  identifier: string;
  actionSummary: string;
  decision: "approved" | "rejected" | "superseded" | "expired";
  occurredAt: string;
  decidedBy?: string;
};

export type TranscriptItem =
  | { kind: "tool"; tool: ToolCall }
  | { kind: "task"; id: string; title: string; status: string; children: TranscriptItem[] }
  | { kind: "approval"; approval: DecidedApproval }
  | { kind: "thinking" };

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  get_incident_context: { running: "Leyendo contexto del incidente", done: "Leyó el contexto del incidente" },
  get_incident_state: { running: "Leyendo el estado del incidente", done: "Leyó el estado del incidente" },
  get_service_health: { running: "Revisando salud de servicios", done: "Revisó la salud de servicios" },
  get_recovery_capacity: { running: "Comprobando capacidad de recuperación", done: "Comprobó la capacidad de recuperación" },
  execute_recovery: { running: "Recuperando", done: "Recuperó" },
  verify_recovery: { running: "Verificando", done: "Verificó" },
  publish_status_update: { running: "Publicando estado", done: "Publicó el estado" },
  save_recovery_plan: { running: "Guardando el plan de recuperación", done: "Guardó el plan de recuperación" },
  send_incident_email: { running: "Enviando el plan por correo", done: "Envió el plan por correo" },
  request_approval: { running: "Pidiendo autorización", done: "Pidió autorización" },
  call_engineer: { running: "Llamando al ingeniero", done: "Llamó al ingeniero" },
  contact_engineer: { running: "Contactando al ingeniero", done: "Contactó al ingeniero" },
  assign_task: { running: "Asignando una tarea", done: "Asignó una tarea" },
};

export function mapToolState(status: string): ElementsToolState {
  if (status === "pending") return "input-streaming";
  if (status === "running") return "input-available";
  if (status === "failed" || status === "cancelled") return "output-error";
  return "output-available";
}

export type IncidentClock = {
  elapsed: string;
  recovered: boolean;
  running: boolean;
};

export function crisisStartedAt(incident: Pick<Incident, "impactedAt">) {
  return incident.impactedAt;
}

export function formatElapsed(fromIso: string | undefined, nowMs: number) {
  if (!fromIso) return "00:00";
  const started = new Date(fromIso).getTime();
  if (!Number.isFinite(started)) return "00:00";
  const seconds = Math.max(0, Math.floor((nowMs - started) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function incidentClock(
  incident: Pick<Incident, "status" | "impactedAt" | "resolvedAt">,
  nowMs: number,
): IncidentClock {
  const recovered = incident.status === "recovered";
  if (!incident.impactedAt) {
    return { elapsed: "00:00", recovered: false, running: false };
  }
  const resolvedAt = recovered ? Date.parse(incident.resolvedAt) : Number.NaN;
  const endMs = Number.isFinite(resolvedAt) ? resolvedAt : nowMs;
  return {
    elapsed: formatElapsed(incident.impactedAt, endMs),
    recovered,
    running: !recovered,
  };
}

export function sortedToolCalls(toolCalls: ReadonlyArray<ToolCall>) {
  return [...toolCalls].toSorted((left, right) => {
    const leftTime = toolTime(left);
    const rightTime = toolTime(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.identifier.localeCompare(right.identifier);
  });
}

function toolTime(tool: Pick<ToolCall, "startedAt" | "createdAt" | "finishedAt">) {
  return Date.parse(tool.startedAt || tool.createdAt || tool.finishedAt || "") || 0;
}

function serviceName(identifier: unknown, services: ReadonlyArray<Pick<Service, "identifier" | "name">>) {
  if (typeof identifier !== "string" || identifier === "") return "";
  return services.find((service) => service.identifier === identifier)?.name ?? identifier;
}

function inputServiceIdentifier(input: Record<string, unknown> | undefined) {
  const value = input?.serviceIdentifier;
  return typeof value === "string" ? value : "";
}

function isFinishedStatus(status: string | undefined) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function toolTitle(
  tool: Pick<ToolCall, "name" | "input"> & { status?: string },
  services: ReadonlyArray<Pick<Service, "identifier" | "name">> = [],
) {
  const labels = TOOL_LABELS[tool.name];
  const tense = isFinishedStatus(tool.status) ? "done" : "running";
  const base = labels ? labels[tense] : tool.name.replaceAll("_", " ");
  if (tool.name === "execute_recovery" || tool.name === "verify_recovery") {
    const name = serviceName(inputServiceIdentifier(tool.input), services);
    return name ? `${base} ${name}` : base;
  }
  if (tool.name === "call_engineer" || tool.name === "contact_engineer") {
    const engineer = tool.input?.engineerName;
    return typeof engineer === "string" && engineer ? `${base}: ${engineer}` : base;
  }
  if (tool.name === "assign_task") {
    const title = tool.input?.title;
    return typeof title === "string" && title ? `${base}: ${title}` : base;
  }
  return base;
}

export function summarizeToolOutput(tool: ToolCall) {
  const output = tool.output;
  if (!output) return null;
  const kind = output.kind;
  if (kind === "incident-context") return { kind, detail: "Contexto del incidente cargado" };
  if (kind === "incident-state") return { kind, detail: "Estado del incidente leído" };
  if (kind === "service-health") return { kind, detail: "Salud de servicios actualizada" };
  if (kind === "recovery-capacity") {
    return { kind, remainingCapacity: output.remainingCapacity, confirmed: output.confirmed };
  }
  if (kind === "recovery-execution") {
    return { kind, outcome: output.outcome, detail: output.detail, mode: output.mode };
  }
  if (kind === "recovery-verification") {
    return {
      kind,
      serviceIdentifier: output.serviceIdentifier,
      verified: output.verified,
      status: output.status,
      detail: output.detail,
    };
  }
  if (kind === "communication") {
    return { kind, channel: output.channel, detail: output.detail, mode: output.mode };
  }
  if (kind === "engineer-call") {
    return { kind, summary: output.summary, mode: output.mode };
  }
  if (kind === "task") return { kind, taskIdentifier: output.taskIdentifier };
  if (kind === "approval") return { kind, approvalIdentifier: output.approvalIdentifier };
  if (kind === "recovery-plan") return { kind, detail: "Plan de recuperación guardado" };
  return output;
}

export function approvalRemainderTitle(approval: Pick<DecidedApproval, "decision" | "actionSummary">) {
  if (approval.decision === "approved") return `Aprobó ${approval.actionSummary}`;
  if (approval.decision === "rejected") return `Rechazó ${approval.actionSummary}`;
  if (approval.decision === "superseded") return `Anuló ${approval.actionSummary}`;
  return `Expiró ${approval.actionSummary}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toolFromActivity(activity: ActivityRecord): ToolCall | null {
  const payload = activity.payload;
  const raw = payload?.toolCall;
  if (!raw || typeof raw !== "object") return null;
  const toolCall = raw as Partial<ToolCall>;
  if (typeof toolCall.identifier !== "string" || typeof toolCall.name !== "string") return null;
  return {
    identifier: toolCall.identifier,
    name: toolCall.name,
    interaction: typeof toolCall.interaction === "string" ? toolCall.interaction : "",
    status: typeof toolCall.status === "string" ? toolCall.status : activity.type.endsWith("failed") ? "failed" : activity.type.endsWith("completed") ? "succeeded" : "running",
    simulated: Boolean(toolCall.simulated),
    error: toolCall.error ?? null,
    startedAt: typeof toolCall.startedAt === "string" ? toolCall.startedAt : activity.occurredAt,
    finishedAt: typeof toolCall.finishedAt === "string" ? toolCall.finishedAt : "",
    createdAt: toolCall.createdAt,
    input: toolCall.input ?? {},
    output: toolCall.output ?? null,
    planStepIdentifier: toolCall.planStepIdentifier,
    attempt: toolCall.attempt,
    parentIdentifier: toolCall.parentIdentifier,
    subagent: toolCall.subagent,
  };
}

function decidedApprovalFromActivity(activity: ActivityRecord): DecidedApproval | null {
  if (
    activity.type !== "approval.decided" &&
    activity.type !== "approval.superseded" &&
    activity.type !== "approval.expired"
  ) {
    return null;
  }
  const payload = asRecord(activity.payload);
  const raw = asRecord(payload?.approval) ?? {};
  const identifier = typeof raw.identifier === "string" ? raw.identifier : activity.identifier;
  const actionSummary = typeof raw.actionSummary === "string" ? raw.actionSummary : activity.title.replace(/^Approval\s+/i, "");
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const decision: DecidedApproval["decision"] =
    rawStatus === "approved" || rawStatus === "rejected" || rawStatus === "superseded" || rawStatus === "expired"
      ? rawStatus
      : activity.type === "approval.expired"
        ? "expired"
        : activity.type === "approval.superseded"
          ? "superseded"
          : "approved";
  return {
    identifier,
    actionSummary,
    decision,
    occurredAt: typeof raw.decidedAt === "string" && raw.decidedAt ? raw.decidedAt : activity.occurredAt,
    decidedBy: typeof raw.decidedBy === "string" && raw.decidedBy ? raw.decidedBy : undefined,
  };
}

export function mergedToolCalls(overview: Overview, activity: ReadonlyArray<ActivityRecord> = []) {
  const byId = new Map<string, ToolCall>();
  for (const tool of overview.toolCalls) {
    byId.set(tool.identifier, { ...tool, input: tool.input ?? {}, output: tool.output ?? null });
  }
  for (const event of activity) {
    if (!event.type.startsWith("tool-call.")) continue;
    const tool = toolFromActivity(event);
    if (!tool) continue;
    const existing = byId.get(tool.identifier);
    byId.set(tool.identifier, existing ? {
      ...existing,
      ...tool,
      input: tool.input ?? existing.input,
      output: tool.output ?? existing.output,
      parentIdentifier: tool.parentIdentifier ?? existing.parentIdentifier,
      subagent: tool.subagent ?? existing.subagent,
    } : tool);
  }
  return sortedToolCalls([...byId.values()]);
}

export function decidedApprovals(activity: ReadonlyArray<ActivityRecord> = []) {
  const byId = new Map<string, DecidedApproval>();
  for (const event of activity) {
    const approval = decidedApprovalFromActivity(event);
    if (!approval) continue;
    byId.set(approval.identifier, approval);
  }
  return [...byId.values()].toSorted((left, right) => {
    const delta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (delta !== 0) return delta;
    return left.identifier.localeCompare(right.identifier);
  });
}

function planOf(overview: Overview): Plan | null {
  return overview.plan.kind === "plan" ? overview.plan.plan : null;
}

export function currentWork(overview: Overview, activity: ReadonlyArray<ActivityRecord> = []): CurrentWork {
  const tools = mergedToolCalls(overview, activity);
  const running = [...tools].reverse().find((tool) => tool.status === "running" || tool.status === "pending");
  if (running) {
    return { kind: "tool", tool: running, title: toolTitle(running, overview.incident.services), state: mapToolState(running.status) };
  }
  const awaiting = planOf(overview)?.steps.find((step) => step.status === "awaiting-approval");
  if (awaiting) {
    return { kind: "approval", title: awaiting.title, reason: awaiting.statusReason || awaiting.reason };
  }
  if (overview.pendingApprovals[0]) {
    return { kind: "approval", title: overview.pendingApprovals[0].actionSummary, reason: overview.pendingApprovals[0].reason };
  }
  if (overview.agent.cycleInProgress) {
    return { kind: "thinking", title: "Preparando el siguiente paso" };
  }
  return { kind: "idle", title: "En espera" };
}

function parentIdOf(tool: ToolCall) {
  return tool.parentIdentifier || tool.subagent?.id || "";
}

function taskStatusFrom(children: ReadonlyArray<ToolCall>, explicit?: string) {
  if (explicit) return explicit;
  if (children.some((tool) => tool.status === "running" || tool.status === "pending")) return "in_progress";
  if (children.some((tool) => tool.status === "failed")) return "failed";
  if (children.every((tool) => tool.status === "succeeded" || tool.status === "cancelled")) return "completed";
  return "in_progress";
}

function nestTools(tools: ReadonlyArray<ToolCall>): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const tasks = new Map<string, Extract<TranscriptItem, { kind: "task" }>>();

  for (const tool of tools) {
    const parentId = parentIdOf(tool);
    if (!parentId) {
      items.push({ kind: "tool", tool });
      continue;
    }
    let task = tasks.get(parentId);
    if (!task) {
      task = {
        kind: "task",
        id: parentId,
        title: tool.subagent?.name ?? parentId,
        status: tool.subagent?.status ?? "in_progress",
        children: [],
      };
      tasks.set(parentId, task);
      items.push(task);
    }
    task.children.push({ kind: "tool", tool });
  }

  for (const task of tasks.values()) {
    const childTools = task.children.flatMap((child) => (child.kind === "tool" ? [child.tool] : []));
    task.status = taskStatusFrom(childTools, childTools[0]?.subagent?.status);
  }

  return items;
}

function itemTime(item: TranscriptItem): number {
  if (item.kind === "tool") return toolTime(item.tool);
  if (item.kind === "approval") return Date.parse(item.approval.occurredAt) || 0;
  if (item.kind === "task") {
    const times = item.children.map(itemTime).filter((value) => value > 0);
    return times.length ? Math.min(...times) : 0;
  }
  return Number.POSITIVE_INFINITY;
}

export function buildTranscript(overview: Overview, activity: ReadonlyArray<ActivityRecord> = []): TranscriptItem[] {
  const events = [...overview.recentActivity, ...activity];
  const tools = mergedToolCalls(overview, events);
  const nested = nestTools(tools);
  const remainders = decidedApprovals(events).map((approval): TranscriptItem => ({ kind: "approval", approval }));
  const items = [...nested, ...remainders].toSorted((left, right) => {
    const delta = itemTime(left) - itemTime(right);
    if (delta !== 0) return delta;
    return transcriptId(left).localeCompare(transcriptId(right));
  });
  if (currentWork(overview, events).kind === "thinking") {
    items.push({ kind: "thinking" });
  }
  return items;
}

function transcriptId(item: TranscriptItem) {
  if (item.kind === "tool") return item.tool.identifier;
  if (item.kind === "task") return item.id;
  if (item.kind === "approval") return item.approval.identifier;
  return "thinking";
}

export function recoveryStartTimes(
  overview: Overview,
  activity: ReadonlyArray<ActivityRecord> = [],
): Map<string, number> {
  const times = new Map<string, number>();
  for (const tool of mergedToolCalls(overview, activity)) {
    if (tool.name !== "execute_recovery" && tool.name !== "verify_recovery") continue;
    const identifier = inputServiceIdentifier(tool.input);
    if (!identifier) continue;
    const time = toolTime(tool);
    if (time <= 0) continue;
    const previous = times.get(identifier);
    if (previous === undefined || time < previous) times.set(identifier, time);
  }
  for (const service of overview.incident.services ?? []) {
    if (times.has(service.identifier)) continue;
    if (service.status !== "recovering" && service.status !== "healthy") continue;
    const fallback = Date.parse(service.lastChangedAt) || 0;
    if (fallback > 0) times.set(service.identifier, fallback);
  }
  return times;
}

export function recoveryTimeline(overview: Overview, activity: ReadonlyArray<ActivityRecord> = []): RecoveryTimelineItem[] {
  const tools = mergedToolCalls(overview, activity);
  const recoveryTools = tools.filter((tool) => tool.name === "execute_recovery" || tool.name === "verify_recovery");
  return overview.incident.services.map((service) => {
    const related = recoveryTools.filter((tool) => inputServiceIdentifier(tool.input) === service.identifier);
    const latest = related.at(-1);
    const running = related.some((tool) => tool.status === "running" || tool.status === "pending");
    const phase: RecoveryPhase = service.status === "healthy"
      ? "recovered"
      : running || service.status === "recovering"
        ? "recovering"
        : "queued";
    const status: VisualStatus = phase === "recovered" ? "up" : phase === "recovering" ? "degraded" : service.status === "down" ? "down" : "degraded";
    return {
      identifier: service.identifier,
      name: service.name,
      status,
      phase,
      reason: typeof latest?.output?.detail === "string" ? latest.output.detail : service.statusReason,
      startedAt: latest?.startedAt || service.lastChangedAt,
      capacityUnits: service.recoveryCapacityUnits,
    };
  });
}
