import { describe, expect, it } from "vitest";
import { customerView, statusOf, topologyView } from "@/lib/live-dashboard";
import type { Overview } from "@/lib/casa-pepe-types";

const overview = {
  incident: {
    active: true, customers: [{ identifier: "c", name: "Customer", shortName: "C", sector: "Retail", users: 4, serviceIdentifiers: ["database"], accent: "#fff" }],
    services: [{ identifier: "database", name: "Database", status: "down" }],
    topology: { nodes: [{ identifier: "bahrain", label: "Bahrain", region: "me-south-1", latitude: 26, longitude: 50, role: "primary", status: "down" }], links: [] },
  },
} as unknown as Overview;

describe("live dashboard adapter", () => {
  it("derives customer health from the authoritative service state", () => {
    expect(customerView(overview.incident)[0]).toMatchObject({ status: "down", action: "queued", progress: 0 });
  });
  it("does not invent topology status in the browser", () => {
    expect(topologyView(overview)[0].status).toBe("down");
  });
  it("treats a missing topology as empty instead of crashing", () => {
    const incomplete = { incident: { customers: [], services: [] } } as unknown as Overview;
    expect(topologyView(incomplete)).toEqual([]);
    expect(customerView(incomplete.incident)).toEqual([]);
  });
  it("treats recuperado as healthy green", () => {
    expect(statusOf("recuperado")).toBe("up");
    expect(statusOf("recovered")).toBe("up");
    expect(statusOf("migrando")).toBe("degraded");
  });
});
