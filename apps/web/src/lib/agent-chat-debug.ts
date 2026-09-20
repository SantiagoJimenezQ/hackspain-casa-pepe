import {
  approvalRemainderTitle,
  buildTranscript,
  completedReasoningLabel,
  currentWork,
  dispositionTitle,
  summarizeToolOutput,
  toolTitle,
  type TranscriptItem,
} from "@/lib/agent-trace";
import type {
  ActivityRecord,
  Approval,
  Overview,
  Plan,
  Service,
  ToolCall,
} from "@/lib/casa-pepe-types";
import { planTodos } from "@/lib/plan-todos";

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

function sameJson(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
}

function indent(text: string, depth: number) {
  if (depth <= 0) return text;
  const prefix = "  ".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}

function tokenTotal(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  if (typeof record.totalTokens === "number") return record.totalTokens;
  if (typeof record.total_tokens === "number") return record.total_tokens;
  return null;
}

function formatTool(tool: ToolCall, services: ReadonlyArray<Pick<Service, "identifier" | "name">>, depth = 0) {
  const lines = [
    `[tool] ${toolTitle(tool, services)} · ${tool.status}`,
    `id: ${tool.identifier}`,
    `name: ${tool.name}`,
  ];
  if (tool.simulated) lines.push("simulated: true");
  if (tool.interaction) lines.push(`interaction: ${tool.interaction}`);
  if (tool.attempt != null) lines.push(`attempt: ${tool.attempt}`);
  if (tool.planStepIdentifier) lines.push(`planStep: ${tool.planStepIdentifier}`);
  if (tool.startedAt) lines.push(`startedAt: ${tool.startedAt}`);
  if (tool.finishedAt) lines.push(`finishedAt: ${tool.finishedAt}`);
  lines.push("Input:", pretty(tool.input ?? {}));
  const summarized = summarizeToolOutput(tool);
  if (summarized && !sameJson(summarized, tool.output)) {
    lines.push("Output (as shown):", pretty(summarized));
  }
  if (tool.output) {
    lines.push("Output (raw):", pretty(tool.output));
  }
  if (tool.error?.message) {
    lines.push(`Error: ${tool.error.message}`);
    if (tool.error.code) lines.push(`errorCode: ${tool.error.code}`);
  }
  return indent(lines.join("\n"), depth);
}

function formatThinking(
  item: Extract<TranscriptItem, { kind: "thinking" }>,
  services: ReadonlyArray<Pick<Service, "identifier" | "name">>,
  depth = 0,
) {
  const label = item.status === "streaming"
    ? item.title || "Pensando"
    : completedReasoningLabel(item.title || item.text, item.durationMs, item.disposition);
  const lines = [`[thinking] ${label} · ${item.status}`];
  const disposition = dispositionTitle(item.disposition);
  if (item.disposition) lines.push(`disposition: ${item.disposition}${disposition ? ` (${disposition})` : ""}`);
  if (item.occurredAt) lines.push(`occurredAt: ${item.occurredAt}`);
  if (item.durationMs != null) lines.push(`durationMs: ${item.durationMs}`);
  if (item.text) {
    lines.push("Text:", item.text);
  }
  if (item.dispositionReason && item.dispositionReason !== item.text) {
    lines.push("Disposition reason:", item.dispositionReason);
  }
  if (item.toolCalls?.length) {
    lines.push("Proposed tool calls:");
    for (const call of item.toolCalls) {
      const input = call.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
        ? call.arguments as Record<string, unknown>
        : { arguments: call.arguments };
      lines.push(`- ${toolTitle({ name: call.name, input }, services)} (${call.name})`);
      lines.push(`  id: ${call.id}`);
      lines.push("  arguments:");
      lines.push(indent(pretty(call.arguments ?? {}), 1));
    }
  }
  if (item.redacted) lines.push("redacted: true");
  const tokens = tokenTotal(item.usage);
  const meta = [item.model, item.finishReason, tokens != null ? `${tokens} tokens` : ""]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(meta);
  if (item.usage != null) lines.push("usage:", pretty(item.usage));
  return indent(lines.join("\n"), depth);
}

function formatTranscriptItem(
  item: TranscriptItem,
  services: ReadonlyArray<Pick<Service, "identifier" | "name">>,
  depth = 0,
): string {
  if (item.kind === "thinking") return formatThinking(item, services, depth);
  if (item.kind === "tool") return formatTool(item.tool, services, depth);
  if (item.kind === "task") {
    return [
      indent(`[task] ${item.title} · ${item.status}`, depth),
      ...item.children.map((child) => formatTranscriptItem(child, services, depth + 1)),
    ].join("\n");
  }
  if (item.kind === "discarded") {
    return item.items.map((child) => formatTranscriptItem(child, services, depth)).join("\n");
  }
  const extras = [
    `[approval] ${approvalRemainderTitle(item.approval)}`,
    `decision: ${item.approval.decision}`,
    `id: ${item.approval.identifier}`,
    item.approval.decidedBy ? `decidedBy: ${item.approval.decidedBy}` : "",
    item.approval.occurredAt ? `occurredAt: ${item.approval.occurredAt}` : "",
  ].filter(Boolean);
  return indent(extras.join("\n"), depth);
}

function formatApproval(approval: Approval) {
  const lines = [
    `[pending-approval] ${approval.actionSummary} · ${approval.status}`,
    `id: ${approval.identifier}`,
    approval.serviceIdentifier ? `service: ${approval.serviceIdentifier}` : "",
    approval.reason ? `reason: ${approval.reason}` : "",
    approval.capacityUnits != null ? `capacityUnits: ${approval.capacityUnits}` : "",
    approval.requestedAt ? `requestedAt: ${approval.requestedAt}` : "",
    approval.expiresAt ? `expiresAt: ${approval.expiresAt}` : "",
  ].filter(Boolean);
  if (approval.consequences?.length) {
    lines.push("consequences:");
    for (const consequence of approval.consequences) lines.push(`- ${consequence}`);
  }
  return lines.join("\n");
}

function formatPlan(plan: Plan) {
  const todos = planTodos(plan);
  const lines = [
    `PLAN v${plan.version} (${plan.status}) · ${todos.completed}/${todos.total} tasks`,
    `id: ${plan.identifier}`,
    plan.summary ? `Summary: ${plan.summary}` : "",
    plan.reason ? `Reason: ${plan.reason}` : "",
    "Capacity:",
    pretty(plan.capacity),
  ].filter(Boolean);

  if (plan.assumptions.length) {
    lines.push("Assumptions:");
    for (const assumption of plan.assumptions) lines.push(`- ${assumption}`);
  }
  if (plan.changesFromPrevious.length) {
    lines.push("Changes from previous:");
    for (const change of plan.changesFromPrevious) {
      lines.push(`- ${change.kind}: ${change.description}${change.serviceIdentifier ? ` (${change.serviceIdentifier})` : ""}`);
    }
  }
  if (plan.priorities.length) {
    lines.push("Priorities:");
    for (const priority of [...plan.priorities].toSorted((left, right) => left.rank - right.rank)) {
      lines.push(`- ${priority.rank}. ${priority.serviceName} · ${priority.decision} · score ${priority.score}`);
      if (priority.reason) lines.push(`  reason: ${priority.reason}`);
      if (priority.blockedBy.length) lines.push(`  blockedBy: ${priority.blockedBy.join(", ")}`);
    }
  }

  lines.push("Steps (all expanded):");
  for (const step of [...plan.steps].toSorted((left, right) => left.order - right.order)) {
    lines.push(`- [${step.status}] ${step.title}`);
    lines.push(`  id: ${step.identifier}`);
    if (step.reason) lines.push(`  reason: ${step.reason}`);
    if (step.statusReason) lines.push(`  statusReason: ${step.statusReason}`);
    if (step.resultSummary) lines.push(`  result: ${step.resultSummary}`);
    lines.push(`  owner: ${step.owner.kind} / ${step.owner.name}`);
    if (step.serviceIdentifier) lines.push(`  service: ${step.serviceIdentifier}`);
    lines.push(`  capacityUnits: ${step.capacityUnits}`);
    if (step.requiresApproval) lines.push("  requiresApproval: true");
    if (step.attempts) lines.push(`  attempts: ${step.attempts}`);
    if (step.toolCallIdentifier) lines.push(`  toolCall: ${step.toolCallIdentifier}`);
    if (step.invocation) {
      lines.push("  invocation:");
      lines.push(indent(pretty(step.invocation), 1));
    }
  }
  return lines.join("\n");
}

export function formatChatDebugDump(
  overview: Overview,
  activity: ReadonlyArray<ActivityRecord> = [],
): string {
  const work = currentWork(overview, activity);
  const items = buildTranscript(overview, activity);
  const plan = overview.plan.kind === "plan" ? overview.plan.plan : null;
  const agent = overview.agent;
  const sections = [
    "DEBUG · Pepe chat (fully expanded)",
    [
      `Status: ${work.title} (${work.kind})`,
      work.kind === "approval" ? `Approval reason: ${work.reason}` : "",
      `Incident: ${overview.incident.title} · ${overview.incident.runIdentifier} · ${overview.incident.status}`,
      [
        `Agent: cycle ${agent.cycles}/${agent.maximumCycles}`,
        agent.model ? `model ${agent.model}` : "",
        `cycleInProgress=${String(agent.cycleInProgress)}`,
        `runningToolCalls=${agent.runningToolCalls}`,
        `planVersion=${agent.planVersion}`,
      ].filter(Boolean).join(" · "),
      agent.lastCycleOutcome
        ? `lastCycleOutcome: ${pretty(agent.lastCycleOutcome)}`
        : "",
    ].filter(Boolean).join("\n"),
  ];

  if (overview.pendingApprovals.length) {
    sections.push(
      ["PENDING APPROVALS", ...overview.pendingApprovals.map(formatApproval)].join("\n\n"),
    );
  }
  if (plan) sections.push(formatPlan(plan));
  sections.push(
    items.length
      ? ["TRANSCRIPT (all collapsed sections expanded)", ...items.map((item) => formatTranscriptItem(item, overview.incident.services))].join("\n\n")
      : "TRANSCRIPT (all collapsed sections expanded)\n(empty)",
  );
  return sections.join("\n\n");
}
