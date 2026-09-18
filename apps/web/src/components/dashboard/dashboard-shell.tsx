import { TopBar } from "@/components/dashboard/top-bar";
import type { ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-w-[1440px] flex-col">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
