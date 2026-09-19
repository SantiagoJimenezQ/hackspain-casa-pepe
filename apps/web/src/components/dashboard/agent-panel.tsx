"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ToolUIPart } from "ai";
import { ArrowDown, CheckCircle2, CheckCircleIcon, ChevronDownIcon, CircleIcon, Loader2, XCircle, XCircleIcon } from "lucide-react";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Panel } from "@/components/dashboard/panel";
import { PlanTodosCard } from "@/components/dashboard/plan-todos-card";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  approvalRemainderTitle,
  buildTranscript,
  completedReasoningLabel,
  currentWork,
  dispositionTitle,
  mapToolState,
  mergedToolCalls,
  reasoningDefaultOpen,
  summarizeToolOutput,
  toolTitle,
  type TranscriptItem,
} from "@/lib/agent-trace";
import type { LlmPublicToolCall, ToolCall } from "@/lib/casa-pepe-types";
import type { VisualStatus } from "@/lib/live-dashboard";

const COLORS: Record<VisualStatus, string> = { up: "#3ee08f", degraded: "#f5a524", down: "#f04444" };

function Dot({ status }: { status: VisualStatus }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[status], boxShadow: `0 0 9px ${COLORS[status]}` }} />;
}

function AgentTool({
  tool,
  services,
  open,
  onOpenChange,
}: {
  tool: ToolCall;
  services: Array<{ identifier: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Tool open={open} onOpenChange={onOpenChange}>
      <ToolHeader
        type="dynamic-tool"
        toolName={tool.name}
        state={mapToolState(tool.status)}
        title={toolTitle(tool, services)}
      />
      <ToolContent>
        <ToolInput input={tool.input ?? {}} />
        <ToolOutput output={summarizeToolOutput(tool)} errorText={tool.error?.message} />
      </ToolContent>
    </Tool>
  );
}

function ApprovalRemainder({ title, decision }: { title: string; decision: string }) {
  const icon =
    decision === "approved" ? (
      <CheckCircleIcon className="size-3.5 text-status-up" />
    ) : decision === "rejected" ? (
      <XCircleIcon className="size-3.5 text-status-down" />
    ) : (
      <CircleIcon className="size-3.5 text-muted-foreground" />
    );
  return (
    <div className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{title}</span>
    </div>
  );
}

function ProposedTool({
  call,
  state,
}: {
  call: LlmPublicToolCall;
  state: "input-available" | "output-available" | "output-error";
}) {
  const input = call.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
    ? (call.arguments as Record<string, unknown>)
    : { arguments: call.arguments };
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName={call.name}
        state={state}
        title={toolTitle({ name: call.name, input })}
      />
      <ToolContent>
        <ToolInput input={input} />
      </ToolContent>
    </Tool>
  );
}

function ReasoningRow({
  item,
  open,
  onOpenChange,
}: {
  item: Extract<TranscriptItem, { kind: "thinking" }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const streaming = item.status === "streaming";
  const label = streaming
    ? item.title || "Pensando"
    : completedReasoningLabel(item.title || item.text, item.durationMs, item.disposition);
  const disposition = dispositionTitle(item.disposition);
  const usage = item.usage && typeof item.usage === "object"
    ? item.usage as Record<string, unknown>
    : null;
  const tokenTotal = typeof usage?.totalTokens === "number"
    ? usage.totalTokens
    : typeof usage?.total_tokens === "number"
      ? usage.total_tokens
      : null;

  const details = (
    <div className="space-y-2">
      {item.text ? (
        <p className="whitespace-pre-wrap text-[12px] leading-5 text-muted-foreground">{item.text}</p>
      ) : null}
      {item.dispositionReason && item.dispositionReason !== item.text ? (
        <p className="text-[12px] leading-5 text-status-degraded">{item.dispositionReason}</p>
      ) : null}
      {item.toolCalls?.length ? (
        <div className="space-y-0.5">
          {item.toolCalls.map((call) => (
            <ProposedTool
              key={call.id}
              call={call}
              state={
                item.disposition === "accepted"
                  ? "output-available"
                  : item.status === "streaming" || item.disposition === "pending"
                    ? "input-available"
                    : "output-error"
              }
            />
          ))}
        </div>
      ) : null}
      {item.redacted ? (
        <p className="text-[11px] text-muted-foreground">Parte del contenido se ha ocultado.</p>
      ) : null}
      {item.model || tokenTotal != null || item.finishReason ? (
        <p className="text-[10px] text-muted-foreground/80">
          {[item.model, item.finishReason, tokenTotal != null ? `${tokenTotal} tokens` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );

  if (streaming) {
    return (
      <div className="not-prose w-full">
        <div className="flex items-center gap-2 py-1 text-[13px] text-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <Shimmer className="min-w-0 truncate text-[13px]">{label}</Shimmer>
          {disposition ? <span className="shrink-0 text-[10px] text-muted-foreground">{disposition}</span> : null}
        </div>
        {item.text || item.toolCalls?.length ? (
          <div className="ml-[7px] border-muted border-l py-1 pl-3">{details}</div>
        ) : null}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="group not-prose w-full">
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        <span className="min-w-0 flex-1 truncate font-normal">{label}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-[7px] overflow-hidden border-muted border-l py-1 pl-3 text-popover-foreground outline-none">
        {details}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TranscriptItemView({
  item,
  items,
  services,
  open,
  onOpenChange,
}: {
  item: TranscriptItem;
  items: TranscriptItem[];
  services: Array<{ identifier: string; name: string }>;
  open: Record<string, boolean>;
  onOpenChange: (id: string, next: boolean) => void;
}) {
  if (item.kind === "thinking") {
    return (
      <ReasoningRow
        item={item}
        open={open[item.id] ?? reasoningDefaultOpen(item, items)}
        onOpenChange={(next) => onOpenChange(item.id, next)}
      />
    );
  }
  if (item.kind === "approval") {
    return <ApprovalRemainder title={approvalRemainderTitle(item.approval)} decision={item.approval.decision} />;
  }
  if (item.kind === "task") {
    const running = item.status === "in_progress" || item.status === "running";
    return (
      <Task open={open[item.id] ?? running} onOpenChange={(next) => onOpenChange(item.id, next)}>
        <TaskTrigger title={item.title} />
        <TaskContent>
          {item.children.map((child) => (
            <TranscriptItemView
              key={transcriptKey(child)}
              item={child}
              items={item.children}
              services={services}
              open={open}
              onOpenChange={onOpenChange}
            />
          ))}
        </TaskContent>
      </Task>
    );
  }
  return (
    <AgentTool
      tool={item.tool}
      services={services}
      open={open[item.tool.identifier] ?? item.tool.status === "failed"}
      onOpenChange={(next) => onOpenChange(item.tool.identifier, next)}
    />
  );
}

function transcriptKey(item: TranscriptItem) {
  if (item.kind === "tool") return item.tool.identifier;
  if (item.kind === "task") return item.id;
  if (item.kind === "approval") return item.approval.identifier;
  return item.id;
}

export function AgentPanel() {
  const { overview, activity, busyAction, decideApproval } = useDashboard();
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

  const work = useMemo(() => (overview ? currentWork(overview, activity) : null), [overview, activity]);
  const tools = useMemo(() => (overview ? mergedToolCalls(overview, activity) : []), [overview, activity]);
  const items = useMemo(() => (overview ? buildTranscript(overview, activity) : []), [overview, activity]);
  const plan = overview?.plan.kind === "plan" ? overview.plan.plan : null;
  const live = Boolean(overview && (overview.agent.cycleInProgress || (work?.kind === "tool" && work.state === "input-available")));
  const planStreaming = Boolean(
    overview?.agent.cycleInProgress && (
      !plan || tools.some((tool) => tool.name === "save_recovery_plan" && (tool.status === "running" || tool.status === "pending"))
    ),
  );

  if (!overview || !work) return null;

  return (
    <Panel className="h-full min-h-0">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-7 shrink-0 overflow-hidden rounded-md bg-muted">
            <Image
              src="/agents/pepe.webp"
              alt="Pepe"
              width={192}
              height={172}
              className="size-full object-cover"
            />
          </span>
          <h2 className="text-[14px] font-medium">Pepe</h2>
        </div>
        <span className="ml-auto flex min-w-0 max-w-[60%] items-center gap-1.5 text-[11px]">
          <Dot status={live ? "degraded" : work.kind === "idle" ? "up" : "degraded"} />
          <span
            className={
              live || work.kind === "thinking"
                ? "min-w-0 truncate text-foreground"
                : "min-w-0 truncate text-muted-foreground"
            }
          >
            {work.title}
          </span>
        </span>
      </div>
      {overview.pendingApprovals.length ? (
        <div className="space-y-3 px-4 pb-3">
          {overview.pendingApprovals.map((approval) => (
            <Confirmation key={approval.identifier} approval={{ id: approval.identifier }} state={"approval-requested" as ToolUIPart["state"]} className="border-amber-400/25 bg-amber-400/5">
              <ConfirmationTitle className="font-medium text-foreground">{approval.actionSummary}</ConfirmationTitle>
              <ConfirmationRequest>
                <p className="text-[11px] text-muted-foreground">{approval.reason}</p>
              </ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction variant="destructive" disabled={busyAction !== null} onClick={() => void decideApproval(approval.identifier, "reject", "")}>
                  <XCircle /> Rechazar
                </ConfirmationAction>
                <ConfirmationAction disabled={busyAction !== null} onClick={() => void decideApproval(approval.identifier, "approve", "")}>
                  <CheckCircle2 /> Aprobar
                </ConfirmationAction>
              </ConfirmationActions>
            </Confirmation>
          ))}
        </div>
      ) : null}
      <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={48}>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="px-4" aria-label="Trabajo del agente">
            <MessageScrollerContent className="gap-0.5 py-1 pb-4" aria-busy={live}>
              {plan ? (
                <MessageScrollerItem key={`plan-${plan.version}`} messageId={`plan-${plan.version}`} className="mb-2 [content-visibility:visible]">
                  <PlanTodosCard plan={plan} streaming={planStreaming} />
                </MessageScrollerItem>
              ) : null}
              {items.map((item) => (
                <MessageScrollerItem key={transcriptKey(item)} messageId={transcriptKey(item)} className="[content-visibility:visible]">
                  <TranscriptItemView
                    item={item}
                    items={items}
                    services={overview.incident.services}
                    open={manualOpen}
                    onOpenChange={(id, next) => setManualOpen((current) => ({ ...current, [id]: next }))}
                  />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton>
            <ArrowDown />
            <span className="sr-only">Ir al último</span>
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>
    </Panel>
  );
}
