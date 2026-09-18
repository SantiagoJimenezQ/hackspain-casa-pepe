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
        "flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/8 bg-[#101826]/92 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}
