"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Copy, MoreHorizontal } from "lucide-react";
import { AgentComposer } from "@/components/dashboard/agent/agent-composer";
import { AgentMessageBubble } from "@/components/dashboard/agent/agent-message";
import { AgentPhaseRow } from "@/components/dashboard/agent/agent-phase";
import { AgentReasoning } from "@/components/dashboard/agent/agent-reasoning";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Panel } from "@/components/dashboard/panel";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { messageKey } from "@/lib/i18n";

export function AgentPanel() {
  const { snapshot } = useDashboard();
  const { t } = useI18n();
  const { agent } = snapshot;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const running = agent.phases.some((phase) => phase.status === "running");
  const phasesById = useMemo(
    () => Object.fromEntries(agent.phases.map((phase) => [phase.id, phase])),
    [agent.phases],
  );
  const messageCount = agent.activity.filter((item) => item.type === "message").length;

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || messageCount === 0) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messageCount]);

  async function copyReasoning() {
    const key = messageKey(agent.currentReasoningKey);
    const text = key ? t(key) : agent.currentReasoningKey;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Panel className="h-full min-h-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Bot className="size-3.5" />
          </span>
          <div>
            <h2 className="text-[14px] font-medium tracking-tight text-foreground">
              {t("agent.title")}
            </h2>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-status-up shadow-[0_0_8px_var(--status-up)]" />
              <span
                className={
                  running
                    ? "shimmer text-[11px] text-status-up"
                    : "text-[11px] text-status-up"
                }
              >
                {t("agent.active")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={copyReasoning}
            aria-label={copied ? t("agent.copied") : t("agent.copy")}
            className="text-muted-foreground"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("agent.more")}
            className="text-muted-foreground"
          >
            <MoreHorizontal />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="scroll-fade min-h-0 flex-1 overflow-y-auto px-4"
      >
        <div className="flex flex-col gap-4 pb-4">
          {agent.activity.map((item) => {
            if (item.type === "reasoning") {
              return (
                <AgentReasoning
                  key={item.id}
                  textKey={item.textKey}
                  running={running}
                />
              );
            }
            if (item.type === "message") {
              return <AgentMessageBubble key={item.id} item={item} />;
            }
            const phase = phasesById[item.phaseId];
            if (!phase) return null;
            return <AgentPhaseRow key={item.id} phase={phase} />;
          })}
        </div>
      </div>

      <div className="px-4 pt-2 pb-3">
        <AgentComposer />
      </div>
    </Panel>
  );
}
