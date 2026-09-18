"use client";

import { FormEvent, useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgentComposer() {
  const { sendFollowUp } = useDashboard();
  const { t } = useI18n();
  const [value, setValue] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    sendFollowUp(next);
    setValue("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5"
    >
      <Input
        value={value}
        onValueChange={setValue}
        placeholder={t("agent.composer.placeholder")}
        aria-label={t("agent.composer.placeholder")}
        className="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("agent.composer.attach")}
        className="text-muted-foreground"
      >
        <Paperclip />
      </Button>
      <Button
        type="submit"
        size="icon-sm"
        aria-label={t("agent.composer.send")}
        disabled={!value.trim()}
        className="rounded-full"
      >
        <ArrowUp />
      </Button>
    </form>
  );
}
