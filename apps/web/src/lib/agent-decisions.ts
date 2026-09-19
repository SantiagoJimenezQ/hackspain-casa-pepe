import type { ActivityRecord } from "@/lib/casa-pepe-types";

export type Decision = {
  id: string;
  sequence: number;
  occurredAt: string;
  text: string;
  disposition: "draft" | "pending" | "accepted" | "rejected" | "stale" | "incomplete";
  reason?: string;
  actionResult?: { dispatchStatus: string; reason?: string };
  redacted: boolean;
  toolCalls: unknown[];
};

export function mergeDecisionEvents(current: readonly ActivityRecord[], incoming: readonly ActivityRecord[], run: string, maximumTurns?: number) {
  const events = new Map<string, ActivityRecord>();
  for (const event of [...current, ...incoming]) {
    if (typeof event.type !== "string" || !event.type.startsWith("agent.llm-") || (event.runIdentifier && event.runIdentifier !== run)) continue;
    events.set(`${run}:${event.sequence}`, event);
  }
  const sorted = [...events.values()].toSorted((a, b) => a.sequence - b.sequence);
  if (!maximumTurns) return sorted;
  const ids = [...new Set(sorted.map(event => typeof event.payload?.outputIdentifier === "string" ? event.payload.outputIdentifier : event.identifier))];
  const retained = new Set(ids.slice(-maximumTurns));
  return sorted.filter(event => retained.has(typeof event.payload?.outputIdentifier === "string" ? event.payload.outputIdentifier : event.identifier));
}

export function buildDecisions(events: readonly ActivityRecord[], run: string): Decision[] {
  const turns = new Map<string, Decision>();
  for (const event of mergeDecisionEvents([], events, run)) {
    const payload = event.payload ?? {};
    const id = `${run}:${typeof payload.outputIdentifier === "string" ? payload.outputIdentifier : event.identifier}`;
    const previous = turns.get(id);
    const fragment = event.type === "agent.llm-output";
    if (fragment && previous && previous.disposition !== "draft") continue;
    const raw = payload.disposition;
    const disposition: Decision["disposition"] = fragment ? "draft"
      : raw === "pending" || raw === "accepted" || raw === "rejected" || raw === "stale" || raw === "incomplete" ? raw
      : event.type === "agent.llm-failed" ? "incomplete"
      : event.type === "agent.llm-stale" ? "stale"
      : event.type === "agent.llm-rejected" ? "rejected" : "pending";
    turns.set(id, {
      id, sequence: previous?.sequence ?? event.sequence, occurredAt: previous?.occurredAt ?? event.occurredAt,
      text: fragment ? (previous?.text ?? "") + (typeof payload.text === "string" ? payload.text : "")
        : typeof payload.text === "string" ? payload.text : payload.text === null ? "" : previous?.text ?? event.summary,
      disposition,
      reason: typeof payload.dispositionReason === "string" ? payload.dispositionReason : undefined,
      actionResult: payload.actionResult && typeof payload.actionResult === "object" && "dispatchStatus" in payload.actionResult && typeof payload.actionResult.dispatchStatus === "string" ? { dispatchStatus: payload.actionResult.dispatchStatus, reason: "reason" in payload.actionResult && typeof payload.actionResult.reason === "string" ? payload.actionResult.reason : undefined } : previous?.actionResult,
      redacted: Boolean(payload.redacted || previous?.redacted),
      toolCalls: Array.isArray(payload.toolCalls) ? payload.toolCalls : previous?.toolCalls ?? [],
    });
  }
  return [...turns.values()];
}
