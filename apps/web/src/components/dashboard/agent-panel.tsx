"use client";

import { useMemo, useState } from "react";
import type { ToolUIPart } from "ai";
import { ArrowDown, Bot, CheckCircle2, CheckCircleIcon, CircleIcon, ClockIcon, XCircle, XCircleIcon } from "lucide-react";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Panel } from "@/components/dashboard/panel";
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
  currentWork,
  mapToolState,
  mergedToolCalls,
  summarizeToolOutput,
  toolTitle,
  type TranscriptItem,
} from "@/lib/agent-trace";
import type { ToolCall } from "@/lib/casa-pepe-types";
import { statusOf, type VisualStatus } from "@/lib/live-dashboard";

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

function ThinkingRow() {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px] text-foreground">
      <ClockIcon className="size-3.5 animate-pulse text-status-degraded" />
      <Shimmer className="text-[13px]">Preparando el siguiente paso</Shimmer>
    </div>
  );
}

function TranscriptItemView({
  item,
  services,
  open,
  onOpenChange,
}: {
  item: TranscriptItem;
  services: Array<{ identifier: string; name: string }>;
  open: Record<string, boolean>;
  onOpenChange: (id: string, next: boolean) => void;
}) {
  if (item.kind === "thinking") return <ThinkingRow />;
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
  return "thinking";
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
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-muted">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-medium">Agente de respuesta</h2>
          <span className="mt-1 flex items-center gap-1.5 text-[11px]">
            <Dot status={live ? "degraded" : work.kind === "idle" ? "up" : "degraded"} />
            {live || work.kind === "thinking" ? (
              <Shimmer className="text-[11px]">{work.title}</Shimmer>
            ) : (
              <span className="text-muted-foreground">{work.title}</span>
            )}
          </span>
        </div>
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
          <MessageScrollerViewport className="scroll-fade px-4" aria-label="Trabajo del agente">
            <MessageScrollerContent className="gap-0.5 py-1 pb-4" aria-busy={live}>
              {plan ? (
                <MessageScrollerItem messageId={`plan-${plan.version}`} className="mb-2 [content-visibility:visible]">
                  <Plan defaultOpen={planStreaming || plan.version <= 1} isStreaming={planStreaming} className="bg-background/40">
                    <PlanHeader>
                      <div>
                        <PlanTitle>{`Plan v${plan.version}`}</PlanTitle>
                        <PlanDescription>{plan.summary}</PlanDescription>
                      </div>
                      <PlanAction>
                        <PlanTrigger />
                      </PlanAction>
                    </PlanHeader>
                    <PlanContent className="space-y-2 pt-0">
                      {plan.priorities.slice(0, 4).map((priority) => (
                        <div key={priority.serviceIdentifier} className="flex gap-2 border-t border-border pt-2 text-[11px]">
                          <span className="font-mono text-muted-foreground">{priority.rank}</span>
                          <span className="flex-1">{priority.serviceName}</span>
                          <span style={{ color: COLORS[statusOf(priority.decision)] }}>{priority.decision.replaceAll("-", " ")}</span>
                        </div>
                      ))}
                    </PlanContent>
                  </Plan>
                </MessageScrollerItem>
              ) : null}
              {items.map((item) => (
                <MessageScrollerItem key={transcriptKey(item)} messageId={transcriptKey(item)} className="[content-visibility:visible]">
                  <TranscriptItemView
                    item={item}
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
