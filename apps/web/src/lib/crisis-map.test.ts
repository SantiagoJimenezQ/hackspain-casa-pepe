import { describe, expect, it } from "vitest";
import {
  arcPath,
  cameraForView,
  failoverArcVisible,
  failoverTarget,
  fitWorldProjection,
  mapViewForTools,
  projectPoint,
} from "@/lib/crisis-map";
import type { Overview } from "@/lib/casa-pepe-types";

const nodes = [
  { identifier: "dubai", label: "Dubái", region: "me-central-1", latitude: 25.2048, longitude: 55.2708, role: "primary" as const, status: "down" as const },
  { identifier: "muscat", label: "Mascate LZ", region: "muscat-lz", latitude: 23.588, longitude: 58.3829, role: "backup" as const, status: "up" as const },
  { identifier: "bahrain", label: "Manama", region: "me-south-1", latitude: 26.2285, longitude: 50.586, role: "backup" as const, status: "up" as const },
  { identifier: "riyadh", label: "Riad", region: "riyadh", latitude: 24.7136, longitude: 46.6753, role: "backup" as const, status: "up" as const },
];

describe("crisis map camera and projection", () => {
  it("keeps a world camera until impact, then Dubai, then nearby without yanking back", () => {
    expect(mapViewForTools(false, [])).toBe("world");
    expect(mapViewForTools(true, ["get_incident_context"])).toBe("impact");
    expect(mapViewForTools(true, ["get_incident_context", "get_recovery_capacity"])).toBe("nearby");
    expect(mapViewForTools(true, ["get_recovery_capacity", "get_incident_context"])).toBe("nearby");
  });

  it("draws the failover arc toward the active backup region", () => {
    expect(failoverArcVisible(["get_incident_context"])).toBe(false);
    expect(failoverArcVisible(["execute_recovery"])).toBe(true);
    expect(failoverArcVisible(["contact_engineer"])).toBe(true);
    const overview = {
      incident: { backupRegion: "me-south-1", topology: { nodes } },
    } as unknown as Overview;
    expect(failoverTarget(overview)?.identifier).toBe("bahrain");
  });

  it("projects gulf sites with geographic order on Natural Earth", () => {
    const projection = fitWorldProjection(860, 440);
    const dubai = projectPoint(projection, 55.2708, 25.2048);
    const muscat = projectPoint(projection, 58.3829, 23.588);
    const bahrain = projectPoint(projection, 50.586, 26.2285);
    const riyadh = projectPoint(projection, 46.6753, 24.7136);
    expect(muscat[0]).toBeGreaterThan(dubai[0]);
    expect(dubai[0]).toBeGreaterThan(bahrain[0]);
    expect(bahrain[0]).toBeGreaterThan(riyadh[0]);
    const nearby = cameraForView("nearby", projection, 860, 440, nodes);
    const world = cameraForView("world", projection, 860, 440, nodes);
    expect(nearby.k).toBeGreaterThan(world.k);
    expect(arcPath(dubai, muscat)).toContain("Q");
  });
});
