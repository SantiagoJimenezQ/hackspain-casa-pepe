import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
        className,
      )}
    >
      {children}
    </section>
  );
}
