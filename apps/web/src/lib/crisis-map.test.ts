import { describe, expect, it } from "vitest";
import {
  MAX_CAMERA_K,
  arcPath,
  cameraForView,
  cameraSvgTransform,
  failoverArcVisible,
  failoverTarget,
  fitWorldProjection,
  mapViewForTools,
  projectPoint,
  projectToScreen,
} from "@/lib/crisis-map";
import type { Overview } from "@/lib/casa-pepe-types";

const nodes = [
  { identifier: "dubai", label: "Dubái", region: "me-central-1", latitude: 25.2048, longitude: 55.2708, role: "primary" as const, status: "down" as const },
  { identifier: "muscat", label: "Mascate LZ", region: "muscat-lz", latitude: 23.588, longitude: 58.3829, role: "backup" as const, status: "up" as const },
  { identifier: "bahrain", label: "Manama", region: "me-south-1", latitude: 26.2285, longitude: 50.586, role: "backup" as const, status: "up" as const },
  { identifier: "riyadh", label: "Riad", region: "riyadh", latitude: 24.7136, longitude: 46.6753, role: "backup" as const, status: "up" as const },
];

function expectInsidePanel(
  camera: { x: number; y: number; k: number },
  point: [number, number],
  width: number,
  height: number,
  margin: number,
) {
  const [x, y] = projectToScreen(camera, point);
  expect(x).toBeGreaterThan(margin);
  expect(x).toBeLessThan(width - margin);
  expect(y).toBeGreaterThan(margin);
  expect(y).toBeLessThan(height - margin);
}

describe("crisis map camera and projection", () => {
  it("keeps a world camera until impact, then the primary server, then nearby without yanking back", () => {
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
    expect(failoverTarget({ incident: { backupRegion: "me-south-1" } } as unknown as Overview)).toBeNull();
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

  it.each([
    [860, 440],
    [1200, 700],
  ] as const)("centers impact zoom on the primary server at %i×%i", (width, height) => {
    const projection = fitWorldProjection(width, height);
    const primary = nodes[0]!;
    const dubai = projectPoint(projection, primary.longitude, primary.latitude);
    const world = cameraForView("world", projection, width, height, nodes);
    const impact = cameraForView("impact", projection, width, height, nodes);
    const nearby = cameraForView("nearby", projection, width, height, nodes);
    const [x, y] = projectToScreen(impact, dubai);
    expect(impact.k).toBeGreaterThan(world.k);
    expect(nearby.k).toBeGreaterThan(world.k);
    expect(impact.k).toBeLessThanOrEqual(MAX_CAMERA_K);
    expect(nearby.k).toBeLessThanOrEqual(MAX_CAMERA_K);
    expect(x).toBeCloseTo(width / 2, 5);
    expect(y).toBeCloseTo(height / 2, 5);
    expectInsidePanel(impact, dubai, width, height, 24);
    for (const node of nodes) {
      expectInsidePanel(nearby, projectPoint(projection, node.longitude, node.latitude), width, height, 24);
    }
  });

  it("stays on the world camera when topology is missing after impact", () => {
    const projection = fitWorldProjection(860, 440);
    const camera = cameraForView("impact", projection, 860, 440, []);
    expect(camera).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("never produces a negative camera scale on a tiny panel", () => {
    const projection = fitWorldProjection(860, 80);
    const camera = cameraForView("impact", projection, 860, 80, nodes);
    expect(camera.k).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(camera.k)).toBe(true);
  });

  it("pans and zooms from the SVG origin so the globe stays in view", () => {
    const camera = { x: 10, y: 20, k: 2 };
    expect(cameraSvgTransform(camera)).toBe("translate(10 20) scale(2)");
    expect(projectToScreen(camera, [5, 6])).toEqual([20, 32]);
  });
});
