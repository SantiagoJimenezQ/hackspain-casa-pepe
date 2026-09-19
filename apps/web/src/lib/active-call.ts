import { formatElapsed } from "@/lib/agent-trace";
import type {
  ActivityRecord,
  CallAuthorizations,
  EngineerCall,
  Overview,
  ToolCall,
} from "@/lib/casa-pepe-types";

export const ACTIVE_CALL_DISMISS_MS = 2800;
/** How long "call ended" stays up before the permission verdict replaces it. */
export const ACTIVE_CALL_AUTHORIZED_AFTER_MS = 1400;
/** A call that granted permissions earns a longer goodbye: two messages must be read. */
export const ACTIVE_CALL_AUTHORIZED_DISMISS_MS = 4200;
export const ACTIVE_CALL_TERMINAL_WINDOW_MS = 12_000;
/** The browser clock can sit a little behind the server's, so a fresh end is never in the future. */
export const ACTIVE_CALL_CLOCK_SKEW_MS = 5_000;

export const CALL_TOOL_NAMES = new Set(["call_engineer", "contact_engineer"]);
const LIVE_STATUSES = new Set(["dialing", "in-progress"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "no-answer"]);
const OUTBOUND_CALL_EVENTS = new Set([
  "engineer-call.started",
  "engineer-call.completed",
  "engineer-call.failed",
  "engineer-call.authorized",
]);

export type ActiveCallPhase = "calling" | "ended" | "failed" | "no-answer";

export type ActiveCallView = {
  identifier: string;
  name: string;
  role: string;
  phase: ActiveCallPhase;
  startedAt: string;
  finishedAt: string;
  live: boolean;
  /** Someone on the call granted at least one permission. */
  authorized: boolean;
};

export function callPhase(status: string): ActiveCallPhase | null {
  if (LIVE_STATUSES.has(status)) return "calling";
  if (status === "completed") return "ended";
  if (status === "failed") return "failed";
  if (status === "no-answer") return "no-answer";
  return null;
}

export function callInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

export function callElapsed(view: Pick<ActiveCallView, "startedAt" | "finishedAt">, nowMs: number): string {
  if (view.finishedAt) {
    const finished = new Date(view.finishedAt).getTime();
    if (Number.isFinite(finished)) return formatElapsed(view.startedAt, finished);
  }
  return formatElapsed(view.startedAt, nowMs);
}

export function visibleActiveCall(
  view: ActiveCallView | null,
  dismissed: ReadonlySet<string>,
): ActiveCallView | null {
  if (!view || dismissed.has(view.identifier)) return null;
  return view;
}

export function activeCallView(
  overview: Pick<Overview, "engineerCalls" | "toolCalls"> | null,
  activity: ReadonlyArray<ActivityRecord>,
  nowMs = Date.now(),
): ActiveCallView | null {
  const merged = new Map<string, EngineerCall>();
  for (const call of overview?.engineerCalls ?? []) {
    if (call.identifier) merged.set(call.identifier, call);
  }

  for (const event of [...activity].sort((left, right) => left.sequence - right.sequence)) {
    if (!OUTBOUND_CALL_EVENTS.has(event.type)) continue;
    const parsed = parseCallPayload(event.payload);
    if (!parsed) continue;
    merged.set(parsed.identifier, mergeCall(merged.get(parsed.identifier), parsed));
  }

  const calls = [...merged.values()];
  const live = latestCall(calls.filter((call) => callPhase(call.status) === "calling"));
  const liveView = live ? toView(live) : null;
  if (liveView) return liveView;

  const terminal = latestCall(
    calls.filter((call) => {
      const phase = callPhase(call.status);
      return Boolean(phase && phase !== "calling" && isRecentTerminal(call, nowMs));
    }),
  );
  const terminalView = terminal ? toView(terminal) : null;
  if (terminalView) return terminalView;

  // The tool only stands in for a call the server has not recorded yet. Once any call record
  // exists it is the truth, and the tool -- which stays running for a while after the line drops
  // -- must never put a finished call back on screen as if it were still ringing.
  if (calls.length) return null;
  return toolFallback(overview?.toolCalls ?? []);
}

function toView(call: EngineerCall): ActiveCallView | null {
  const phase = callPhase(call.status);
  const name = call.engineer.name.trim();
  if (!phase || !call.identifier || !name) return null;
  return {
    identifier: call.identifier,
    name,
    role: call.engineer.role.trim(),
    phase,
    startedAt: call.startedAt,
    finishedAt: call.finishedAt,
    live: phase === "calling",
    authorized: hasAuthorization(call),
  };
}

function toolFallback(tools: ReadonlyArray<ToolCall>): ActiveCallView | null {
  const tool = [...tools]
    .reverse()
    .find(
      (item) =>
        CALL_TOOL_NAMES.has(item.name) &&
        (item.status === "running" || item.status === "pending"),
    );
  if (!tool) return null;
  const name = stringField(tool.input.engineerName);
  if (!name) return null;
  return {
    identifier: tool.identifier,
    name,
    role: stringField(tool.input.engineerRole),
    phase: "calling",
    startedAt: tool.startedAt,
    finishedAt: "",
    live: true,
    authorized: false,
  };
}

function isRecentTerminal(call: EngineerCall, nowMs: number): boolean {
  const finished = new Date(call.finishedAt).getTime();
  if (!Number.isFinite(finished)) return false;
  const age = nowMs - finished;
  return age >= -ACTIVE_CALL_CLOCK_SKEW_MS && age <= ACTIVE_CALL_TERMINAL_WINDOW_MS;
}

function latestCall(calls: EngineerCall[]): EngineerCall | null {
  if (calls.length === 0) return null;
  return calls.reduce((latest, call) =>
    startedMs(call) >= startedMs(latest) ? call : latest,
  );
}

function startedMs(call: EngineerCall): number {
  const value = new Date(call.startedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function statusRank(status: string): number {
  if (status === "dialing") return 1;
  if (status === "in-progress") return 2;
  if (TERMINAL_STATUSES.has(status)) return 3;
  return 0;
}

function mergeCall(current: EngineerCall | undefined, next: EngineerCall): EngineerCall {
  if (!current) return next;
  return statusRank(next.status) >= statusRank(current.status)
    ? { ...current, ...next }
    : { ...next, ...current };
}

function parseCallPayload(payload: ActivityRecord["payload"]): EngineerCall | null {
  const record = asRecord(payload);
  const call = asRecord(record?.call);
  if (!call) return null;
  const identifier = stringField(call.identifier);
  const engineer = asRecord(call.engineer);
  const name = stringField(engineer?.name);
  if (!identifier || !name) return null;
  const status = stringField(call.status) || "dialing";
  const mode = call.mode === "live" ? "live" : "simulated";
  const result = asRecord(call.result);
  return {
    identifier,
    engineer: { name, role: stringField(engineer?.role) },
    purpose: stringField(call.purpose),
    mode,
    status,
    result: result
      ? {
          summary: stringField(result.summary),
          transcript: stringField(result.transcript),
          authorizations: parseAuthorizations(result.authorizations),
        }
      : null,
    failureReason: stringField(call.failureReason),
    startedAt: stringField(call.startedAt),
    finishedAt: stringField(call.finishedAt),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}


/**
 * True once anybody granted a permission on this call. The voice agent reports them while the
 * line is still open, so this flips before the call is over.
 */
export function hasAuthorization(call: Pick<EngineerCall, "result">): boolean {
  const granted = call.result?.authorizations;
  if (!granted) return false;
  return (
    granted.notifyAllClients?.value === true ||
    granted.trafficFailoverAuthorized?.value === true
  );
}

function parseAuthorizations(value: unknown): CallAuthorizations | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    notifyAllClients: parseVerdict(record.notifyAllClients),
    trafficFailoverAuthorized: parseVerdict(record.trafficFailoverAuthorized),
  };
}

function parseVerdict(value: unknown): { value: boolean | null } | null {
  const record = asRecord(value);
  if (!record) return null;
  return { value: typeof record.value === "boolean" ? record.value : null };
}
