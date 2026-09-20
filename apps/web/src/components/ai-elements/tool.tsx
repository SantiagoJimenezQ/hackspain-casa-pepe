"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { Shimmer } from "./shimmer";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto py-1 font-mono text-[11px] leading-4 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function headlineOf(output: unknown): string | null {
  if (typeof output === "string" && output.trim()) return output;
  if (!output || typeof output !== "object" || isValidElement(output)) return null;
  const record = output as Record<string, unknown>;
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
  if (typeof record.summary === "string" && record.summary.trim()) return record.summary;
  if (record.kind === "recovery-capacity") {
    return `Capacidad restante: ${String(record.remainingCapacity ?? "—")}`;
  }
  return null;
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("group not-prose w-full", className)} {...props} />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: ReactNode;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3.5 text-status-degraded" />,
  "approval-responded": <CheckCircleIcon className="size-3.5 text-muted-foreground" />,
  "input-available": <ClockIcon className="size-3.5 animate-pulse text-status-degraded" />,
  "input-streaming": <CircleIcon className="size-3.5 text-muted-foreground/70" />,
  "output-available": <CheckCircleIcon className="size-3.5 text-status-up" />,
  "output-denied": <XCircleIcon className="size-3.5 text-status-degraded" />,
  "output-error": <XCircleIcon className="size-3.5 text-status-down" />,
};

function headerLabel(title: ReactNode, derivedName: string, state: ToolPart["state"]) {
  const label = title ?? derivedName;
  if (
    typeof label === "string" &&
    (state === "input-available" || state === "input-streaming")
  ) {
    return <Shimmer className="text-[13px]">{label}</Shimmer>;
  }
  return label;
}

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground",
        (state === "input-available" || state === "input-streaming") && "text-foreground",
        state === "output-error" && "text-status-down",
        className,
      )}
      {...props}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {statusIcons[state]}
      </span>
      <span className="min-w-0 flex-1 truncate font-normal">
        {headerLabel(title, derivedName, state)}
      </span>
      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-open:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "ml-[7px] space-y-2 overflow-hidden border-muted border-l py-1 pl-3 text-popover-foreground outline-none",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1 overflow-hidden", className)} {...props}>
    <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
      Parámetros
    </h4>
    <JsonBlock value={input} />
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  const headline = headlineOf(output);
  let Output: ReactNode = null;

  if (typeof output === "object" && output && !isValidElement(output)) {
    Output = <JsonBlock value={output} />;
  } else if (typeof output === "string") {
    Output = headline ? null : <JsonBlock value={output} />;
  } else if (output) {
    Output = <div>{output as ReactNode}</div>;
  }

  return (
    <div className={cn("space-y-1", className)} {...props}>
      <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {errorText ? "Error" : "Resultado"}
      </h4>
      {errorText ? (
        <p className="text-[12px] text-status-down">{errorText}</p>
      ) : null}
      {headline && !errorText ? (
        <p className="text-[12px] text-muted-foreground">{headline}</p>
      ) : null}
      {Output}
    </div>
  );
};
