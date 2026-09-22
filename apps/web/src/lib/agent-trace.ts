import { demoText } from "../../../../packages/demo-brands";
import type {
  ActivityRecord,
  Incident,
  LlmDisposition,
  LlmPublicToolCall,
  Overview,
  Plan,
  Service,
  ToolCall,
} from "@/lib/casa-pepe-types";
import {
  DEFAULT_LOCALE,
  messageKey,
  translate,
  type Locale,
} from "@/lib/i18n";
import type { VisualStatus } from "@/lib/live-dashboard";

export type ElementsToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type RecoveryPhase = "recovering" | "recovered" | "offline";

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
  | { kind: "settled"; title: string }
  | { kind: "idle"; title: string };

export type DecidedApproval = {
  identifier: string;
  actionSummary: string;
  decision: "approved" | "rejected" | "superseded" | "expired";
  occurredAt: string;
  decidedBy?: string;
};

export type ReasoningStatus = "streaming" | "complete";

export type TranscriptItem =
  | { kind: "tool"; tool: ToolCall }
  | { kind: "task"; id: string; title: string; status: string; children: TranscriptItem[] }
  | { kind: "approval"; approval: DecidedApproval }
  | {
      kind: "thinking";
      id: string;
      text: string;
      status: ReasoningStatus;
      occurredAt: string;
      title?: string;
      durationMs?: number;
      disposition?: LlmDisposition;
      dispositionReason?: string;
      toolCalls?: LlmPublicToolCall[];
      model?: string;
      finishReason?: string | null;
      usage?: unknown;
      redacted?: boolean;
    }
  | { kind: "discarded"; id: string; occurredAt: string; items: ThinkingItem[] };

export type ThinkingItem = Extract<TranscriptItem, { kind: "thinking" }>;

export const LLM_ACTIVITY_TYPES = [
  "agent.llm-output",
  "agent.llm-decision",
  "agent.llm-failed",
  "agent.llm-stale",
  "agent.llm-rejected",
] as const;

export function isLlmActivityType(type: string) {
  return (LLM_ACTIVITY_TYPES as readonly string[]).includes(type);
}

export const LIVE_REASONING_ID = "thinking-live";
export const PLACEHOLDER_DECISION_SUMMARY = "Selecting the next investigation or action";

/** Tools whose label lives in the dictionary; anything else falls back to its own name. */
function toolMessageKey(name: string, tense: "running" | "done") {
  return messageKey(`tool.${name}.${tense}`);
}

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
  locale: Locale = DEFAULT_LOCALE,
) {
  const tense = isFinishedStatus(tool.status) ? "done" : "running";
  const key = toolMessageKey(tool.name, tense);
  const base = key ? translate(locale, key) : tool.name.replaceAll("_", " ");
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

/**
 * The run is over: the incident is recovered (or the plan completed) and the server reports no cycle
 * and no running tool call.
 */
export function agentSettled(overview: Pick<Overview, "incident" | "plan" | "agent">): boolean {
  const recovered = overview.incident.status === "recovered";
  const planCompleted = overview.plan?.kind === "plan" && overview.plan.plan.status === "completed";
  if (!recovered && !planCompleted) return false;
  return !overview.agent?.cycleInProgress && (overview.agent?.runningToolCalls ?? 0) === 0;
}

/** How far along its life a tool call is; every terminal status shares the last place. */
const TOOL_STATUS_RANK: Record<string, number> = {
  cancelled: 3,
  failed: 3,
  pending: 1,
  running: 2,
  succeeded: 3,
};

function toolStatusRank(status: string): number {
  return TOOL_STATUS_RANK[status] ?? 0;
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
    if (!existing) {
      byId.set(tool.identifier, tool);
      continue;
    }
    // The live buffer holds a tool's whole life, and the last event in the array used to win
    // whatever it said. A "started" that arrives after the overview already reported the tool
    // finished would put it back on the screen as running, sometimes for minutes. The record
    // that is further along its life wins; the other one only fills in what it is missing.
    const advancing = toolStatusRank(tool.status) >= toolStatusRank(existing.status);
    const base = advancing ? { ...existing, ...tool } : { ...tool, ...existing };
    byId.set(tool.identifier, {
      ...base,
      input: tool.input ?? existing.input,
      output: tool.output ?? existing.output,
      parentIdentifier: tool.parentIdentifier ?? existing.parentIdentifier,
      subagent: tool.subagent ?? existing.subagent,
    });
  }
  const merged = [...byId.values()];
  if (agentSettled(overview)) {
    return sortedToolCalls(merged.map(settledToolCall));
  }
  return sortedToolCalls(merged);
}

function settledToolCall(tool: ToolCall): ToolCall {
  if (tool.status !== "running" && tool.status !== "pending") return tool;
  return { ...tool, status: "succeeded", finishedAt: tool.finishedAt || tool.startedAt };
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

export function currentWork(
  overview: Overview,
  activity: ReadonlyArray<ActivityRecord> = [],
  locale: Locale = DEFAULT_LOCALE,
): CurrentWork {
  const events = [...overview.recentActivity, ...activity];
  if (agentSettled(overview)) {
    return { kind: "settled", title: translate(locale, "agent.work.settled") };
  }
  const tools = mergedToolCalls(overview, events);
  const running = [...tools].reverse().find((tool) => tool.status === "running" || tool.status === "pending");
  if (running) {
    return { kind: "tool", tool: running, title: toolTitle(running, overview.incident.services, locale), state: mapToolState(running.status) };
  }
  const awaiting = planOf(overview)?.steps.find((step) => step.status === "awaiting-approval");
  if (awaiting) {
    return { kind: "approval", title: awaiting.title, reason: awaiting.statusReason || awaiting.reason };
  }
  if (overview.pendingApprovals[0]) {
    return { kind: "approval", title: overview.pendingApprovals[0].actionSummary, reason: overview.pendingApprovals[0].reason };
  }
  if (overview.agent.cycleInProgress || agentStillDeciding(events)) {
    return { kind: "thinking", title: liveThinkingLabel(events, locale) };
  }
  return { kind: "idle", title: translate(locale, "agent.idle") };
}

export function isPlaceholderSummary(text: string) {
  const trimmed = text.trim();
  return !trimmed || trimmed === PLACEHOLDER_DECISION_SUMMARY;
}

function agentStillDeciding(events: ReadonlyArray<ActivityRecord>): boolean {
  const ordered = uniqueActivity(events);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const event = ordered[index];
    const type = event.type;
    if (type === "agent.cycle-finished" || type === "agent.limit-reached" || type === "agent.llm-failed") {
      return false;
    }
    if (type === "agent.llm-decision") return payloadDisposition(event) === "pending";
    if (type === "agent.llm-output" || type === "agent.llm-rejected" || type === "agent.llm-stale") return true;
  }
  return false;
}

export function liveThinkingLabel(events: ReadonlyArray<ActivityRecord>, locale: Locale = DEFAULT_LOCALE): string {
  const ordered = uniqueActivity(events);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const event = ordered[index];
    if (!isLlmActivityType(event.type)) continue;
    if (payloadDisposition(event) === "accepted") continue;
    const call = payloadToolCalls(event)[0];
    const name = call?.name || payloadTools(event)[0];
    if (name) return toolTitle({ name, input: toolCallInput(call) }, [], locale);
    if (event.type === "agent.llm-output") return translate(locale, "agent.thinking");
  }
  return translate(locale, "agent.thinking");
}

function uniqueActivity(events: ReadonlyArray<ActivityRecord>): ActivityRecord[] {
  const byId = new Map<string, ActivityRecord>();
  for (const event of events) {
    const existing = byId.get(event.identifier);
    if (!existing || event.sequence >= existing.sequence) {
      byId.set(event.identifier, event);
    }
  }
  return [...byId.values()].toSorted((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (time !== 0) return time;
    return left.identifier.localeCompare(right.identifier);
  });
}

function outputIdentifierOf(event: ActivityRecord): string {
  const payload = asRecord(event.payload);
  const value = payload?.outputIdentifier;
  return typeof value === "string" && value.trim() ? value : "";
}

function payloadCompleteText(event: ActivityRecord): string | null | undefined {
  const payload = asRecord(event.payload);
  if (!payload || !("text" in payload)) return undefined;
  if (payload.text === null) return null;
  return typeof payload.text === "string" ? payload.text : undefined;
}

function payloadText(event: ActivityRecord): string {
  const payload = asRecord(event.payload);
  return typeof payload?.text === "string" ? payload.text : "";
}

function payloadTools(event: ActivityRecord): string[] {
  const tools = asRecord(event.payload)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

function payloadToolCalls(event: ActivityRecord): LlmPublicToolCall[] {
  const tools = asRecord(event.payload)?.toolCalls;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name) return [];
    return [{ id, name, arguments: record.arguments }];
  });
}

function toolCallInput(call: LlmPublicToolCall | undefined): Record<string, unknown> {
  return asRecord(call?.arguments) ?? {};
}

function payloadDisposition(event: ActivityRecord): LlmDisposition | undefined {
  const value = asRecord(event.payload)?.disposition;
  if (value === "pending" || value === "accepted" || value === "rejected" || value === "stale" || value === "incomplete") {
    return value;
  }
  if (event.type === "agent.llm-rejected") return "rejected";
  if (event.type === "agent.llm-stale") return "stale";
  if (event.type === "agent.llm-failed") return "incomplete";
  if (event.type === "agent.llm-decision") return "accepted";
  return undefined;
}

function payloadDispositionReason(event: ActivityRecord): string {
  const value = asRecord(event.payload)?.dispositionReason;
  if (typeof value === "string" && value.trim()) return value;
  if (event.type === "agent.llm-rejected" || event.type === "agent.llm-stale" || event.type === "agent.llm-failed") {
    return isPlaceholderSummary(event.summary) ? "" : event.summary;
  }
  return "";
}

function payloadModel(event: ActivityRecord): string {
  const value = asRecord(event.payload)?.model;
  return typeof value === "string" ? value : "";
}

function payloadFinishReason(event: ActivityRecord): string | null | undefined {
  const payload = asRecord(event.payload);
  if (!payload || !("finishReason" in payload)) return undefined;
  if (payload.finishReason === null) return null;
  return typeof payload.finishReason === "string" ? payload.finishReason : undefined;
}

function payloadRedacted(event: ActivityRecord): boolean {
  return asRecord(event.payload)?.redacted === true;
}

type ReasoningDraft = {
  id: string;
  fragments: string[];
  seen: Set<string>;
  occurredAt: string;
  finishedAt: string;
  status: ReasoningStatus;
  completeText?: string | null;
  summary: string;
  tools: string[];
  toolCalls: LlmPublicToolCall[];
  disposition?: LlmDisposition;
  dispositionReason?: string;
  model?: string;
  finishReason?: string | null;
  usage?: unknown;
  redacted?: boolean;
};

function applyPublicTurn(draft: ReasoningDraft, event: ActivityRecord) {
  draft.status = "complete";
  draft.finishedAt = event.occurredAt;
  draft.summary = event.summary;
  const completeText = payloadCompleteText(event);
  if (completeText !== undefined) draft.completeText = completeText;
  const tools = payloadTools(event);
  if (tools.length) draft.tools = tools;
  const calls = payloadToolCalls(event);
  if (calls.length) draft.toolCalls = calls;
  const disposition = payloadDisposition(event);
  if (disposition) draft.disposition = disposition;
  const reason = payloadDispositionReason(event);
  if (reason) draft.dispositionReason = reason;
  const model = payloadModel(event);
  if (model) draft.model = model;
  const finishReason = payloadFinishReason(event);
  if (finishReason !== undefined) draft.finishReason = finishReason;
  const usage = asRecord(event.payload)?.usage;
  if (usage !== undefined) draft.usage = usage;
  if (payloadRedacted(event)) draft.redacted = true;
}

function latestOpenDraft(drafts: Map<string, ReasoningDraft>) {
  const values = [...drafts.values()];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const draft = values[index];
    if (draft.disposition === "rejected" || draft.disposition === "stale" || draft.disposition === "incomplete") continue;
    return draft;
  }
  return values.at(-1);
}

function reasoningDrafts(events: ReadonlyArray<ActivityRecord>): ReasoningDraft[] {
  const drafts = new Map<string, ReasoningDraft>();
  const ordered = uniqueActivity(events);

  const draftFor = (id: string, event: ActivityRecord): ReasoningDraft => {
    const existing = drafts.get(id);
    if (existing) return existing;
    const created: ReasoningDraft = {
      id,
      fragments: [],
      seen: new Set(),
      occurredAt: event.occurredAt,
      finishedAt: "",
      status: "streaming",
      summary: "",
      tools: [],
      toolCalls: [],
    };
    drafts.set(id, created);
    return created;
  };

  for (const event of ordered) {
    if (event.type === "agent.llm-output") {
      const id = outputIdentifierOf(event);
      if (!id) continue;
      const draft = draftFor(id, event);
      if (draft.status === "complete") continue;
      if (draft.seen.has(event.identifier)) continue;
      draft.seen.add(event.identifier);
      const text = payloadText(event);
      if (text && !isPlaceholderSummary(text)) draft.fragments.push(text);
      if (payloadRedacted(event)) draft.redacted = true;
      continue;
    }
    if (event.type === "agent.llm-decision") {
      applyPublicTurn(draftFor(outputIdentifierOf(event) || event.identifier, event), event);
      continue;
    }
    if (event.type === "agent.llm-rejected" || event.type === "agent.llm-stale" || event.type === "agent.llm-failed") {
      const id = outputIdentifierOf(event);
      const draft = id ? draftFor(id, event) : latestOpenDraft(drafts);
      if (!draft) continue;
      applyPublicTurn(draft, event);
    }
  }

  return [...drafts.values()];
}

function reasoningDurationMs(startedAt: string, finishedAt: string) {
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt || startedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

export function formatReasoningDuration(durationMs: number) {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  return seconds < 1 ? "<1s" : `${seconds}s`;
}

export function reasoningHeadline(text: string, max = 72) {
  const line = text.trim().split(/\n/)[0]?.trim() ?? "";
  if (!line) return "";
  if (line.length <= max) return line;
  return `${line.slice(0, max).trimEnd()}…`;
}

export function dispositionTitle(disposition?: LlmDisposition, locale: Locale = DEFAULT_LOCALE) {
  const key = messageKey(`agent.disposition.${disposition}`);
  return key ? translate(locale, key) : "";
}

export function completedReasoningLabel(
  text: string,
  durationMs = 0,
  disposition?: LlmDisposition,
  locale: Locale = DEFAULT_LOCALE,
) {
  const duration = formatReasoningDuration(durationMs);
  const headline = reasoningHeadline(text);
  const status = dispositionTitle(disposition, locale);
  const parts = [headline, status, duration].filter((part) => part !== "");
  if (!headline && !status) return translate(locale, "agent.thought", { duration });
  return parts.join(" · ");
}

function draftToolName(draft: ReasoningDraft) {
  return draft.toolCalls[0]?.name || draft.tools.find((value) => value.trim() !== "") || "";
}

function reasoningBody(draft: ReasoningDraft): string {
  if (draft.completeText !== undefined) {
    if (draft.completeText && !isPlaceholderSummary(draft.completeText)) return draft.completeText;
    if (draft.dispositionReason) return draft.dispositionReason;
    return "";
  }
  const fragments = draft.fragments.join("");
  if (!isPlaceholderSummary(fragments)) return fragments;
  if (!isPlaceholderSummary(draft.summary)) return draft.summary;
  return draft.dispositionReason ?? "";
}

function reasoningTitle(draft: ReasoningDraft, body: string, locale: Locale) {
  const headline = reasoningHeadline(body);
  if (headline) return headline;
  const name = draftToolName(draft);
  if (name) return toolTitle({ name, input: toolCallInput(draft.toolCalls[0]) }, [], locale);
  const proposal = messageKey(`agent.proposal.${draft.disposition}`);
  if (proposal) return translate(locale, proposal);
  return translate(locale, "agent.thinking");
}

function toThinkingItem(draft: ReasoningDraft, locale: Locale): Extract<TranscriptItem, { kind: "thinking" }> {
  const text = demoText(reasoningBody(draft));
  const streaming = draft.status === "streaming" || draft.disposition === "pending";
  const title = draft.status === "streaming" && draft.disposition === undefined
    ? translate(locale, "agent.thinking")
    : reasoningTitle(draft, text, locale);
  return {
    kind: "thinking",
    id: draft.id,
    text,
    status: streaming ? "streaming" : "complete",
    occurredAt: draft.occurredAt,
    durationMs: reasoningDurationMs(draft.occurredAt, draft.finishedAt),
    title,
    disposition: draft.disposition,
    dispositionReason: draft.dispositionReason,
    toolCalls: draft.toolCalls,
    model: draft.model,
    finishReason: draft.finishReason,
    usage: draft.usage,
    redacted: draft.redacted,
  };
}

function reasoningTurns(events: ReadonlyArray<ActivityRecord>, locale: Locale): Extract<TranscriptItem, { kind: "thinking" }>[] {
  return reasoningDrafts(events)
    .map((draft) => toThinkingItem(draft, locale))
    .filter((item) => item.status === "streaming" || item.text !== "" || (item.toolCalls?.length ?? 0) > 0 || Boolean(item.disposition));
}

export function reasoningDefaultOpen(
  item: Extract<TranscriptItem, { kind: "thinking" }>,
  items: ReadonlyArray<TranscriptItem>,
): boolean {
  if (item.status === "streaming" || item.disposition === "pending") return true;
  const index = items.findIndex((entry) => entry.kind === "thinking" && entry.id === item.id);
  return index === items.length - 1;
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

function itemKindOrder(item: TranscriptItem): number {
  if (item.kind === "thinking") return 0;
  if (item.kind === "approval") return 2;
  return 1;
}

function itemTime(item: TranscriptItem): number {
  if (item.kind === "tool") return toolTime(item.tool);
  if (item.kind === "approval") return Date.parse(item.approval.occurredAt) || 0;
  if (item.kind === "task") {
    const times = item.children.map(itemTime).filter((value) => value > 0);
    return times.length ? Math.min(...times) : 0;
  }
  if (item.id === LIVE_REASONING_ID) return Number.POSITIVE_INFINITY;
  return Date.parse(item.occurredAt) || 0;
}

export function buildTranscript(overview: Overview, activity: ReadonlyArray<ActivityRecord> = [], locale: Locale = DEFAULT_LOCALE): TranscriptItem[] {
  const events = [...overview.recentActivity, ...activity];
  const tools = mergedToolCalls(overview, events);
  const nested = nestTools(tools);
  const remainders = decidedApprovals(events).map((approval): TranscriptItem => ({ kind: "approval", approval }));
  const thoughts = reasoningTurns(events, locale);
  const items = [...nested, ...remainders, ...thoughts].toSorted((left, right) => {
    const delta = itemTime(left) - itemTime(right);
    if (delta !== 0) return delta;
    const kindDelta = itemKindOrder(left) - itemKindOrder(right);
    if (kindDelta !== 0) return kindDelta;
    return transcriptId(left).localeCompare(transcriptId(right));
  });
  const work = currentWork(overview, activity, locale);
  const hasLiveTurn = thoughts.some((item) => item.status === "streaming" || item.disposition === "pending");
  if (work.kind === "thinking" && !hasLiveTurn) {
    items.push({
      kind: "thinking",
      id: LIVE_REASONING_ID,
      text: "",
      status: "streaming",
      occurredAt: "",
      title: liveThinkingLabel(events, locale),
    });
  }
  if (agentSettled(overview)) {
    return settledTranscript(items);
  }
  return collapseDiscarded(items);
}

/**
 * Once the incident is closed the reasoning is history, not work in progress: the panel reads as
 * the list of what the agent actually did. The turns themselves stay in the decision tree and in
 * the debug dump, so nothing is lost, only moved out of the way.
 */
function settledTranscript(items: TranscriptItem[]): TranscriptItem[] {
  return items.filter(
    (item) => item.kind === "tool" || item.kind === "task" || item.kind === "approval",
  );
}

/** A turn the server threw away: it never produced an action, so it is churn rather than history. */
function isDiscardedTurn(item: TranscriptItem): item is ThinkingItem {
  if (item.kind !== "thinking") return false;
  if (item.status === "streaming") return false;
  return item.disposition === "stale" || item.disposition === "rejected";
}

/**
 * Folds each run of consecutive discarded turns into one row. A lone discard stays inline: hiding a
 * single attempt costs a click and saves no space.
 */
export function collapseDiscarded(items: TranscriptItem[]): TranscriptItem[] {
  const collapsed: TranscriptItem[] = [];
  let run: ThinkingItem[] = [];

  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) {
      collapsed.push(run[0]);
    } else {
      collapsed.push({
        kind: "discarded",
        id: `discarded-${run[0].id}`,
        occurredAt: run[0].occurredAt,
        items: run,
      });
    }
    run = [];
  };

  for (const item of items) {
    if (isDiscardedTurn(item)) {
      run.push(item);
      continue;
    }
    flush();
    collapsed.push(item);
  }
  flush();
  return collapsed;
}

function transcriptId(item: TranscriptItem) {
  if (item.kind === "tool") return item.tool.identifier;
  if (item.kind === "task") return item.id;
  if (item.kind === "approval") return item.approval.identifier;
  return item.id;
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
  if (!overview.incident.impactedAt) return [];
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
        : "offline";
    const status: VisualStatus = phase === "recovered" ? "up" : phase === "recovering" ? "degraded" : "down";
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
