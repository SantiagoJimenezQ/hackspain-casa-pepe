import { describe, expect, it } from "vitest";
import {
  MAX_CAMERA_K,
  MIN_ARC_RISE,
  agentSettled,
  placeMapLabels,
  spreadClusteredMarkers,
  arcPath,
  cameraForView,
  cameraNeedsSnap,
  cameraSvgTransform,
  cameraTransitionForView,
  failoverArcVisible,
  failoverTarget,
  fitWorldProjection,
  linkFill,
  mapViewForTools,
  projectPoint,
  projectToScreen,
} from "@/lib/crisis-map";
import type { Overview } from "@/lib/casa-pepe-types";

const nodes = [
  { identifier: "dubai", label: "Dubái", region: "me-central-1", latitude: 25.2048, longitude: 55.2708, role: "primary" as const, status: "down" as const },
  { identifier: "muscat", label: "Mascate LZ", region: "muscat-lz", latitude: 23.588, longitude: 58.3829, role: "backup" as const, status: "up" as const },
  { identifier: "frankfurt", label: "Manama", region: "eu-central-1", latitude: 26.2285, longitude: 50.586, role: "backup" as const, status: "up" as const },
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

  it("returns to the world camera once the agent has settled", () => {
    expect(mapViewForTools(true, ["get_recovery_capacity", "execute_recovery"], true)).toBe("world");
    const overview = {
      incident: { status: "partially-recovered" },
      plan: { kind: "plan", plan: { status: "completed" } },
      agent: { cycleInProgress: false, runningToolCalls: 0 },
    } as unknown as Overview;
    expect(agentSettled(overview)).toBe(true);
    expect(agentSettled({ ...overview, agent: { cycleInProgress: true, runningToolCalls: 0 } } as unknown as Overview)).toBe(false);
    expect(cameraTransitionForView("world", "nearby").duration).toBeGreaterThan(cameraTransitionForView("impact", "world").duration);
  });

  it("snaps tiny camera deltas instead of restarting the fly", () => {
    expect(cameraNeedsSnap({ x: 0, y: 0, k: 1 }, { x: 0.4, y: -0.2, k: 1.01 })).toBe(true);
    expect(cameraNeedsSnap({ x: 0, y: 0, k: 1 }, { x: 80, y: 12, k: 3 })).toBe(false);
  });

  it("draws the failover arc toward the active backup region", () => {
    expect(failoverArcVisible(["get_incident_context"])).toBe(false);
    expect(failoverArcVisible(["execute_recovery"])).toBe(true);
    expect(failoverArcVisible(["contact_engineer"])).toBe(true);
    const overview = {
      incident: { backupRegion: "eu-central-1", topology: { nodes } },
    } as unknown as Overview;
    expect(failoverTarget(overview)?.identifier).toBe("frankfurt");
    expect(failoverTarget({ incident: { backupRegion: "eu-central-1" } } as unknown as Overview)).toBeNull();
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
    const short = arcPath([0, 0], [8, 2]);
    expect(short).toContain("Q");
    expect(short).toContain(String(-MIN_ARC_RISE));
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

  it("fills network links from the hub toward the company", () => {
    expect(linkFill("online", 0)).toBe(1);
    expect(linkFill("offline", 0)).toBe(0);
    expect(linkFill("offline", 50)).toBe(0.5);
    expect(linkFill("migrating", 0)).toBeGreaterThan(0.8);
    expect(linkFill("recovered", 40)).toBe(1);
  });
});

describe("map label placement", () => {
  it("keeps a lone label on the right of its marker", () => {
    const placed = placeMapLabels([{ identifier: "solo", x: 100, y: 100, lines: 2 }]);
    expect(placed.get("solo")).toEqual({ anchor: "start", x: 12, y: 0 });
  });

  it("moves a clustered label off its neighbour instead of writing over it", () => {
    const placed = placeMapLabels([
      { identifier: "manama", x: 100, y: 100, lines: 2 },
      { identifier: "dubai", x: 130, y: 104, lines: 1 },
    ]);
    const manama = placed.get("manama")!;
    const dubai = placed.get("dubai")!;
    expect(manama).not.toEqual(dubai);
    // Whatever slot each one took, the two must not share the same side at the same height.
    expect(manama.anchor === dubai.anchor && manama.y === dubai.y).toBe(false);
  });

  it("is stable: the same points always resolve to the same slots", () => {
    const points = [
      { identifier: "a", x: 10, y: 10, lines: 2 },
      { identifier: "b", x: 30, y: 12, lines: 1 },
      { identifier: "c", x: 50, y: 14, lines: 1 },
    ];
    expect([...placeMapLabels(points)]).toEqual([...placeMapLabels([...points].reverse())]);
  });
});

describe("spreadClusteredMarkers", () => {
  it("leaves a marker with nothing near it exactly where it belongs", () => {
    const offsets = spreadClusteredMarkers([
      { identifier: "far-a", x: 0, y: 0 },
      { identifier: "far-b", x: 400, y: 300 },
    ]);

    expect(offsets.get("far-a")).toEqual({ x: 0, y: 0 });
    expect(offsets.get("far-b")).toEqual({ x: 0, y: 0 });
  });

  it("opens the Gulf pile onto a ring nobody overlaps on", () => {
    // Four customers within a few pixels of each other, as they land at world zoom.
    const points = [
      { identifier: "emirates", x: 600, y: 200 },
      { identifier: "emirates-nbd", x: 602, y: 199 },
      { identifier: "deliveroo", x: 598, y: 203 },
      { identifier: "purehealth", x: 595, y: 206 },
    ];

    const offsets = spreadClusteredMarkers(points);
    const placed = points.map((point) => {
      const offset = offsets.get(point.identifier);
      if (!offset) throw new Error(`No offset for ${point.identifier}`);
      return { identifier: point.identifier, x: point.x + offset.x, y: point.y + offset.y };
    });

    for (const left of placed) {
      for (const right of placed) {
        if (left.identifier === right.identifier) continue;
        expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(24);
      }
    }
  });

  it("keeps the ring centred on the place the markers share", () => {
    const points = [
      { identifier: "a", x: 100, y: 100 },
      { identifier: "b", x: 104, y: 100 },
    ];
    const offsets = spreadClusteredMarkers(points);
    const placed = points.map((point) => {
      const offset = offsets.get(point.identifier);
      if (!offset) throw new Error("missing offset");
      return { x: point.x + offset.x, y: point.y + offset.y };
    });

    const centreX = placed.reduce((total, point) => total + point.x, 0) / placed.length;
    const centreY = placed.reduce((total, point) => total + point.y, 0) / placed.length;
    expect(centreX).toBeCloseTo(102, 5);
    expect(centreY).toBeCloseTo(100, 5);
  });

  it("gives the same marker the same place every render", () => {
    const points = [
      { identifier: "b", x: 10, y: 10 },
      { identifier: "a", x: 12, y: 11 },
    ];
    const first = spreadClusteredMarkers(points);
    const second = spreadClusteredMarkers([...points].reverse());

    expect(second.get("a")).toEqual(first.get("a"));
    expect(second.get("b")).toEqual(first.get("b"));
  });
});

describe("cameraForView with the whole cast", () => {
  const sites = [
    { latitude: 25.2048, longitude: 55.2708, role: "primary" as const },
    { latitude: 23.588, longitude: 58.3829, role: "backup" as const },
    { latitude: 26.2285, longitude: 50.586, role: "backup" as const },
    { latitude: 24.7136, longitude: 46.6753, role: "backup" as const },
  ];
  const customers = [
    { latitude: 37.7587, longitude: -122.3887 },
    { latitude: 40.4756, longitude: -3.6877 },
    { latitude: 25.2417, longitude: 55.366 },
    { latitude: 25.2608, longitude: 55.3146 },
    { latitude: 25.0803, longitude: 55.2075 },
    { latitude: 24.4411, longitude: 54.5754 },
  ];

  it("still closes in on the incident rather than falling back to the whole world", () => {
    const projection = fitWorldProjection(900, 420);
    const camera = cameraForView("impact", projection, 900, 420, sites, customers);

    expect(camera.k).toBeGreaterThan(2);
  });

  it("keeps every site and every customer inside the panel, clear of the floating cards", () => {
    const width = 900;
    const height = 420;
    const projection = fitWorldProjection(width, height);
    const camera = cameraForView("impact", projection, width, height, sites, customers);

    for (const place of [...sites, ...customers]) {
      const [x, y] = projectToScreen(camera, projectPoint(projection, place.longitude, place.latitude));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
      // Below the band the topology card and the call banner occupy.
      expect(y).toBeGreaterThan(60);
    }
  });
});
