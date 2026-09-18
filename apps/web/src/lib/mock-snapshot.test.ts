import { describe, expect, it } from "vitest";
import { createInitialSnapshot } from "@/lib/mock-snapshot";
import { messageKey } from "@/lib/i18n";
import type { DashboardSnapshot } from "@/lib/dashboard-types";

function collectMessageKeys(snapshot: DashboardSnapshot) {
  const keys: string[] = [snapshot.agent.currentReasoningKey];

  for (const item of snapshot.agent.activity) {
    if (item.type === "reasoning") keys.push(item.textKey);
    if (item.type === "message" && item.textKey) keys.push(item.textKey);
  }

  for (const phase of snapshot.agent.phases) {
    keys.push(`agent.phase.${phase.id}`);
    for (const tool of phase.tools ?? []) {
      if (tool.summaryKey) keys.push(tool.summaryKey);
      if (tool.detailKey) keys.push(tool.detailKey);
    }
    for (const subagent of phase.subagents ?? []) {
      keys.push(subagent.headlineKey);
      if (subagent.reasoningKey) keys.push(subagent.reasoningKey);
      for (const tool of subagent.tools) {
        if (tool.summaryKey) keys.push(tool.summaryKey);
        if (tool.detailKey) keys.push(tool.detailKey);
      }
    }
  }

  return keys;
}

describe("createInitialSnapshot", () => {
  it("clones so later mutations cannot leak across renders", () => {
    const first = createInitialSnapshot();
    first.incident.elapsedMinutes = 99;
    first.agent.phases[0].status = "pending";
    const second = createInitialSnapshot();
    expect(second.incident.elapsedMinutes).toBe(7);
    expect(second.agent.phases[0].status).toBe("done");
  });

  it("keeps Madrid down and the rest of the sites up", () => {
    const snapshot = createInitialSnapshot();
    expect(snapshot.sites.find((site) => site.id === "madrid")?.status).toBe("down");
    expect(
      snapshot.sites.filter((site) => site.id !== "madrid").every((site) => site.status === "up"),
    ).toBe(true);
  });

  it("seeds a running subagent phase with tools and activity", () => {
    const snapshot = createInitialSnapshot();
    expect(snapshot.agent.phases).toHaveLength(snapshot.agent.total);
    expect(snapshot.agent.phases.find((phase) => phase.id === "launch_subagents")?.status).toBe(
      "running",
    );
    expect(snapshot.agent.activity.some((item) => item.type === "reasoning")).toBe(true);
    expect(snapshot.agent.activity.filter((item) => item.type === "phase")).toHaveLength(6);
  });

  it("only references i18n keys that exist", () => {
    const snapshot = createInitialSnapshot();
    for (const key of collectMessageKeys(snapshot)) {
      expect(messageKey(key), key).not.toBeNull();
    }
  });

  it("keeps companies, infra nodes and links internally consistent", () => {
    const snapshot = createInitialSnapshot();
    const siteIds = new Set(snapshot.sites.map((site) => site.id));
    for (const node of snapshot.infrastructure) {
      expect(siteIds.has(node.id)).toBe(true);
    }
    for (const link of snapshot.links) {
      expect(siteIds.has(link.from)).toBe(true);
      expect(siteIds.has(link.to)).toBe(true);
    }
    expect(snapshot.companies.length).toBeGreaterThan(0);
    expect(snapshot.impact.usersOffline).toBe(12480);
  });
});
