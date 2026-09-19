import { describe, expect, it } from "vitest";
import { customerView, customerViewOrdered, statusOf, topologyView } from "@/lib/live-dashboard";
import type { Overview, ToolCall } from "@/lib/casa-pepe-types";

const overview = {
  incident: {
    active: true, customers: [{ identifier: "c", name: "Customer", shortName: "C", sector: "Retail", users: 4, serviceIdentifiers: ["database"], accent: "#fff" }],
    services: [{ identifier: "database", name: "Database", status: "down" }],
    topology: { nodes: [{ identifier: "bahrain", label: "Bahrain", region: "me-south-1", latitude: 26, longitude: 50, role: "primary", status: "down" }], links: [] },
  },
} as unknown as Overview;

function tool(partial: Partial<ToolCall> & Pick<ToolCall, "identifier" | "name" | "status">): ToolCall {
  return {
    interaction: "test-environment",
    simulated: true,
    error: null,
    startedAt: "2026-09-19T10:00:00.000Z",
    finishedAt: "",
    input: {},
    output: null,
    ...partial,
  };
}

function customerOverview(options: {
  services: Array<{ identifier: string; status: "down" | "recovering" | "healthy"; lastChangedAt?: string }>;
  customers: Array<{ identifier: string; serviceIdentifiers: string[] }>;
  tools?: ToolCall[];
}): Overview {
  return {
    incident: {
      active: true,
      status: "active",
      impactedAt: "2026-09-19T10:00:00.000Z",
      customers: options.customers.map((customer) => ({
        identifier: customer.identifier,
        name: customer.identifier,
        shortName: customer.identifier[0]!.toUpperCase(),
        sector: "Retail",
        users: 4,
        serviceIdentifiers: customer.serviceIdentifiers,
        accent: "#fff",
      })),
      services: options.services.map((service) => ({
        identifier: service.identifier,
        name: service.identifier,
        status: service.status,
        lastChangedAt: service.lastChangedAt ?? "2026-09-19T10:00:00.000Z",
      })),
      topology: { nodes: [], links: [] },
    },
    toolCalls: options.tools ?? [],
    recentActivity: [],
  } as unknown as Overview;
}

describe("live dashboard adapter", () => {
  it("derives customer health from the authoritative service state", () => {
    expect(customerView(overview.incident)[0]).toMatchObject({ status: "down", action: "offline", progress: 0 });
  });
  it("does not invent topology status in the browser", () => {
    expect(topologyView(overview)[0].status).toBe("down");
  });
  it("treats a missing topology as empty instead of crashing", () => {
    const incomplete = { incident: { customers: [], services: [] } } as unknown as Overview;
    expect(topologyView(incomplete)).toEqual([]);
    expect(customerView(incomplete.incident)).toEqual([]);
  });
  it("keeps healthy companies online until impact", () => {
    const idle = customerOverview({
      services: [{ identifier: "database", status: "healthy" }],
      customers: [{ identifier: "alpha", serviceIdentifiers: ["database"] }],
    });
    idle.incident.status = "normal";
    idle.incident.impactedAt = "";
    expect(customerView(idle.incident)[0]).toMatchObject({ action: "online", status: "up", progress: 100 });
  });
  it("marks down companies offline until a recovery is actually running", () => {
    const impacted = customerOverview({
      services: [{ identifier: "database", status: "down" }],
      customers: [{ identifier: "alpha", serviceIdentifiers: ["database"] }],
    });
    impacted.incident.impactedAt = "2026-09-19T10:00:00.000Z";
    expect(customerView(impacted.incident)[0]).toMatchObject({ action: "offline", status: "down", progress: 0 });
  });
  it("turns orange only while a company is migrating", () => {
    const migrating = customerOverview({
      services: [{ identifier: "database", status: "recovering" }],
      customers: [{ identifier: "alpha", serviceIdentifiers: ["database"] }],
    });
    migrating.incident.impactedAt = "2026-09-19T10:00:00.000Z";
    expect(customerView(migrating.incident)[0]).toMatchObject({ action: "migrating", status: "degraded" });
  });
  it("marks companies recovered only after impact restores every service", () => {
    const restored = customerOverview({
      services: [{ identifier: "database", status: "healthy" }],
      customers: [{ identifier: "alpha", serviceIdentifiers: ["database"] }],
    });
    restored.incident.status = "partially-recovered";
    restored.incident.impactedAt = "2026-09-19T10:00:00.000Z";
    expect(customerView(restored.incident)[0]).toMatchObject({ action: "recovered", status: "up", progress: 100 });
  });
  it("keeps partial progress on the line even when the remaining work is still offline", () => {
    const partial = customerOverview({
      services: [
        { identifier: "svc-a", status: "healthy" },
        { identifier: "svc-b", status: "down" },
      ],
      customers: [{ identifier: "alpha", serviceIdentifiers: ["svc-a", "svc-b"] }],
    });
    partial.incident.impactedAt = "2026-09-19T10:00:00.000Z";
    expect(customerView(partial.incident)[0]).toMatchObject({ action: "offline", status: "down", progress: 50 });
  });
  it("treats recuperado and migrado as healthy green", () => {
    expect(statusOf("recuperado")).toBe("up");
    expect(statusOf("recovered")).toBe("up");
    expect(statusOf("migrado")).toBe("up");
    expect(statusOf("operativo")).toBe("up");
    expect(statusOf("sin conexión")).toBe("down");
    expect(statusOf("migrando")).toBe("degraded");
  });
  it("keeps unstarted companies in scenario order", () => {
    const queued = customerOverview({
      services: [
        { identifier: "svc-a", status: "down" },
        { identifier: "svc-b", status: "down" },
        { identifier: "svc-c", status: "down" },
      ],
      customers: [
        { identifier: "alpha", serviceIdentifiers: ["svc-a"] },
        { identifier: "beta", serviceIdentifiers: ["svc-b"] },
        { identifier: "gamma", serviceIdentifiers: ["svc-c"] },
      ],
    });
    expect(customerViewOrdered(queued).map((customer) => customer.identifier)).toEqual(["alpha", "beta", "gamma"]);
  });
  it("slots companies by FIFO recovery start and keeps recovered companies in place", () => {
    const started = customerOverview({
      services: [
        { identifier: "svc-a", status: "down" },
        { identifier: "svc-b", status: "recovering", lastChangedAt: "2026-09-19T10:00:08.000Z" },
        { identifier: "svc-c", status: "down" },
      ],
      customers: [
        { identifier: "alpha", serviceIdentifiers: ["svc-a"] },
        { identifier: "beta", serviceIdentifiers: ["svc-b"] },
        { identifier: "gamma", serviceIdentifiers: ["svc-c"] },
      ],
      tools: [
        tool({ identifier: "t1", name: "execute_recovery", status: "running", startedAt: "2026-09-19T10:00:08.000Z", input: { serviceIdentifier: "svc-b" } }),
      ],
    });
    expect(customerViewOrdered(started).map((customer) => customer.identifier)).toEqual(["beta", "alpha", "gamma"]);

    const later = customerOverview({
      services: [
        { identifier: "svc-a", status: "recovering", lastChangedAt: "2026-09-19T10:00:20.000Z" },
        { identifier: "svc-b", status: "healthy", lastChangedAt: "2026-09-19T10:00:18.000Z" },
        { identifier: "svc-c", status: "down" },
      ],
      customers: [
        { identifier: "alpha", serviceIdentifiers: ["svc-a"] },
        { identifier: "beta", serviceIdentifiers: ["svc-b"] },
        { identifier: "gamma", serviceIdentifiers: ["svc-c"] },
      ],
      tools: [
        tool({ identifier: "t1", name: "execute_recovery", status: "succeeded", startedAt: "2026-09-19T10:00:08.000Z", input: { serviceIdentifier: "svc-b" } }),
        tool({ identifier: "t2", name: "execute_recovery", status: "running", startedAt: "2026-09-19T10:00:20.000Z", input: { serviceIdentifier: "svc-a" } }),
      ],
    });
    expect(customerViewOrdered(later).map((customer) => customer.identifier)).toEqual(["beta", "alpha", "gamma"]);
    expect(customerViewOrdered(later).map((customer) => customer.action)).toEqual(["recovered", "migrating", "offline"]);
  });
  it("lifts recovered companies above the ones still migrating", () => {
    const board = customerOverview({
      services: [
        { identifier: "svc-a", status: "recovering", lastChangedAt: "2026-09-19T10:00:05.000Z" },
        { identifier: "svc-b", status: "healthy", lastChangedAt: "2026-09-19T10:00:30.000Z" },
        { identifier: "svc-c", status: "down" },
      ],
      customers: [
        { identifier: "alpha", serviceIdentifiers: ["svc-a"] },
        { identifier: "beta", serviceIdentifiers: ["svc-b"] },
        { identifier: "gamma", serviceIdentifiers: ["svc-c"] },
      ],
      tools: [
        tool({ identifier: "t1", name: "execute_recovery", status: "running", startedAt: "2026-09-19T10:00:05.000Z", input: { serviceIdentifier: "svc-a" } }),
        tool({ identifier: "t2", name: "execute_recovery", status: "succeeded", startedAt: "2026-09-19T10:00:30.000Z", input: { serviceIdentifier: "svc-b" } }),
      ],
    });
    expect(customerViewOrdered(board).map((customer) => customer.identifier)).toEqual(["beta", "alpha", "gamma"]);
    expect(customerViewOrdered(board).map((customer) => customer.action)).toEqual(["recovered", "migrating", "offline"]);
  });

  it("queues companies by sector: health, then finance, then logistics", () => {
    const board = {
      incident: {
        active: true,
        impactedAt: "2026-09-19T10:00:00.000Z",
        status: "responding",
        customers: [
          { identifier: "logistics", name: "Logi", shortName: "L", sector: "Logística", users: 10, serviceIdentifiers: ["svc-a"], accent: "#fff" },
          { identifier: "energy", name: "Ener", shortName: "E", sector: "Energía", users: 10, serviceIdentifiers: ["svc-b"], accent: "#fff" },
          { identifier: "health", name: "Heal", shortName: "H", sector: "Salud", users: 10, serviceIdentifiers: ["svc-c"], accent: "#fff" },
          { identifier: "finance", name: "Fina", shortName: "F", sector: "Fintech", users: 10, serviceIdentifiers: ["svc-d"], accent: "#fff" },
        ],
        services: [
          { identifier: "svc-a", name: "A", status: "down" },
          { identifier: "svc-b", name: "B", status: "down" },
          { identifier: "svc-c", name: "C", status: "down" },
          { identifier: "svc-d", name: "D", status: "down" },
        ],
      },
      toolCalls: [],
      recentActivity: [],
    } as unknown as Overview;

    expect(customerViewOrdered(board).map((customer) => customer.identifier)).toEqual([
      "health",
      "finance",
      "logistics",
      "energy",
    ]);
  });
});
