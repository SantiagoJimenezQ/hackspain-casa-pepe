"use client";

import { PlanComparison } from "@/components/dashboard/plan-comparison";
import Image from "next/image";
import dynamic from "next/dynamic";
import { GitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, CheckCircleIcon, ChevronDownIcon, CircleIcon, Copy, Loader2, XCircleIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Panel } from "@/components/dashboard/panel";
import { PlanTodosCard } from "@/components/dashboard/plan-todos-card";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
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
  type CurrentWork,
  type TranscriptItem,
} from "@/lib/agent-trace";
import { formatChatDebugDump } from "@/lib/agent-chat-debug";
import type { Approval, LlmPublicToolCall, ToolCall } from "@/lib/casa-pepe-types";
import type { VisualStatus } from "@/lib/live-dashboard";
import { cn } from "@/lib/utils";

const DecisionTreeView = dynamic(() => import("./decision-tree-view"), { ssr: false });

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
  const { locale } = useI18n();
  return (
    <Tool open={open} onOpenChange={onOpenChange}>
      <ToolHeader
        type="dynamic-tool"
        toolName={tool.name}
        state={mapToolState(tool.status)}
        title={toolTitle(tool, services, locale)}
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

/**
 * A proposal turns red only when it was actually rejected. One that was superseded by newer
 * evidence, or whose disposition has not landed yet, is neither finished nor failed: it reads
 * grey, because the agent is still working rather than erroring.
 */
function proposedToolState(
  item: Extract<TranscriptItem, { kind: "thinking" }>,
): "input-streaming" | "input-available" | "output-available" | "output-error" {
  if (item.disposition === "accepted") return "output-available";
  if (item.disposition === "rejected") return "output-error";
  if (item.status === "streaming" || item.disposition === "pending") return "input-available";
  return "input-streaming";
}

function PendingApproval({
  approval,
  busy,
  onApprove,
  onReject,
}: {
  approval: Approval;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-[6px] border border-border bg-muted/50 px-2.5 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">{approval.actionSummary}</p>
        {approval.reason ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{approval.reason}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          onClick={onReject}
        >
          {t("agent.reject")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-7 rounded-[6px] border border-black/10 bg-white px-3 text-[12px] font-medium text-neutral-950 shadow-[0_1px_1px_rgba(0,0,0,0.06)] hover:bg-neutral-100 dark:border-white/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
          onClick={onApprove}
        >
          {t("agent.approve")}
        </Button>
      </div>
    </div>
  );
}

function ProposedTool({
  call,
  state,
}: {
  call: LlmPublicToolCall;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  const { locale } = useI18n();
  const input = call.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
    ? (call.arguments as Record<string, unknown>)
    : { arguments: call.arguments };
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName={call.name}
        state={state}
        title={toolTitle({ name: call.name, input }, [], locale)}
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
              state={proposedToolState(item)}
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

function headerStatus(work: CurrentWork, live: boolean): VisualStatus {
  if (work.kind === "settled") return "up";
  if (live) return "degraded";
  if (work.kind === "idle") return "up";
  return "degraded";
}

function headerToneClass(work: CurrentWork, live: boolean): string {
  if (work.kind === "settled") return "text-status-up";
  if (live || work.kind === "thinking") return "text-foreground";
  return "text-muted-foreground";
}

export function AgentPanel() {
  const { overview, activity, busyAction, decideApproval } = useDashboard();
  const { locale, t } = useI18n();
  const [treeOpen, setTreeOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const work = useMemo(() => (overview ? currentWork(overview, activity, locale) : null), [overview, activity, locale]);
  const tools = useMemo(() => (overview ? mergedToolCalls(overview, activity) : []), [overview, activity]);
  const items = useMemo(() => (overview ? buildTranscript(overview, activity) : []), [overview, activity]);

  useEffect(() => () => {
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
  }, []);

  const copyChatDebug = useCallback(() => {
    if (!overview) return;
    const text = formatChatDebugDump(overview, activity);
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;
    void clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  }, [overview, activity]);

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
          <Dot status={headerStatus(work, live)} />
          <span className={cn("min-w-0 truncate", headerToneClass(work, live))}>{work.title}</span>
        </span>
        <button type="button" title="Árbol de decisiones" aria-label="Abrir árbol de decisiones" onClick={() => setTreeOpen(true)} className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-up"><GitBranch className="size-4" /></button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 text-[10px] text-muted-foreground"
          aria-label={copied ? t("agent.copied") : t("agent.copyDebug")}
          title={copied ? t("agent.copied") : t("agent.copyDebug")}
          onClick={copyChatDebug}
        >
          {copied ? <Check className="text-status-up" /> : <Copy />}
          DEBUG
        </Button>
      </div>
      {treeOpen ? <DecisionTreeView onClose={() => setTreeOpen(false)} /> : null}
      {overview.planComparison ? <PlanComparison comparison={overview.planComparison} /> : null}
      {plan ? (
        <div className="shrink-0 px-4 pb-2">
          <PlanTodosCard plan={plan} streaming={planStreaming} />
        </div>
      ) : null}
      <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={48}>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="px-4" aria-label="Trabajo del agente">
            <MessageScrollerContent className="gap-0.5 py-1 pb-4" aria-busy={live}>
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
      {overview.pendingApprovals.length ? (
        <div className="shrink-0 space-y-2 px-3 pb-3 pt-1">
          {overview.pendingApprovals.map((approval) => (
            <PendingApproval
              key={approval.identifier}
              approval={approval}
              busy={busyAction !== null}
              onApprove={() => void decideApproval(approval.identifier, "approve", "")}
              onReject={() => void decideApproval(approval.identifier, "reject", "")}
            />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
