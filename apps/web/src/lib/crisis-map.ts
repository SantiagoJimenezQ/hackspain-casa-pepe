import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries from "@/data/countries-110m.json";
import type { Overview, ToolCall } from "@/lib/casa-pepe-types";
import { topologyView, type CustomerAction } from "@/lib/live-dashboard";

export { agentSettled } from "@/lib/agent-trace";

export const MAP_PADDING = 24;
export const MIN_CAMERA_K = 1;
export const MAX_CAMERA_K = 7;
export const MIN_PROJECTED_SPAN = 72;
export const MIN_ARC_RISE = 28;

const WORLD_CAMERA: Camera = { x: 0, y: 0, k: 1 };
const IMPACT_PADDING = 28;
const NEARBY_PADDING = 48;
/** Room for a marker and its label, so nothing sits half outside the frame. */
const CROWD_PADDING = 64;
/** The topology card and the call banner float over the top of the map; markers keep clear. */
const CROWD_TOP_PADDING = 108;
const CAMERA_SNAP = { x: 2, y: 2, k: 0.02 };

const topology = countries as unknown as Topology<{ countries: GeometryCollection }>;
export const worldLand = feature(topology, topology.objects.countries);

export type MapView = "world" | "impact" | "nearby";
export type Camera = { x: number; y: number; k: number };
export type MapPoint = { latitude: number; longitude: number; role: "primary" | "backup" };
export type CameraTransition = { duration: number; ease: readonly [number, number, number, number] };

const FAILOVER_TOOLS = new Set(["execute_recovery", "contact_engineer", "call_engineer"]);
const CAMERA_EASE = [0.22, 1, 0.36, 1] as const;

export function fitWorldProjection(width: number, height: number, padding = MAP_PADDING) {
  const projection = geoNaturalEarth1();
  projection.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    worldLand,
  );
  return projection;
}

export function projectPoint(projection: GeoProjection, longitude: number, latitude: number): [number, number] {
  const point = projection([longitude, latitude]);
  return point ? [point[0], point[1]] : [0, 0];
}

export function projectToScreen(camera: Camera, point: [number, number]): [number, number] {
  return [camera.x + point[0] * camera.k, camera.y + point[1] * camera.k];
}

export function cameraSvgTransform(camera: Camera) {
  return `translate(${camera.x} ${camera.y}) scale(${camera.k})`;
}

export function worldPath(projection: GeoProjection) {
  return geoPath(projection)(worldLand) ?? "";
}

export function spherePath(projection: GeoProjection) {
  return geoPath(projection)({ type: "Sphere" } as GeoPermissibleObjects) ?? "";
}

export type MapLabelAnchor = "start" | "end";
/** Offsets are in screen units, ready to use inside the counter-scaled marker layer. */
export type MapLabelPlacement = { anchor: MapLabelAnchor; x: number; y: number };
export type MapLabelPoint = { identifier: string; x: number; y: number; lines: number };

const LABEL_GAP = 12;
const LABEL_WIDTH = 92;
const LABEL_LINE = 13;
const LABEL_RISE = 9;
const MARKER_RADIUS = 15;
const LABEL_STEPS = [0, -20, 20, -38, 38];
const LABEL_ANCHORS: MapLabelAnchor[] = ["start", "end"];

type Box = { left: number; right: number; top: number; bottom: number };

function labelBox(point: MapLabelPoint, anchor: MapLabelAnchor, offsetY: number): Box {
  const left = anchor === "start" ? point.x + LABEL_GAP : point.x - LABEL_GAP - LABEL_WIDTH;
  const top = point.y + offsetY - LABEL_RISE;
  return { left, right: left + LABEL_WIDTH, top, bottom: top + point.lines * LABEL_LINE };
}

function overlaps(left: Box, right: Box): boolean {
  return left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
}

function coversMarker(box: Box, point: MapLabelPoint, points: ReadonlyArray<MapLabelPoint>): boolean {
  return points.some((other) => {
    if (other.identifier === point.identifier) return false;
    const marker = {
      left: other.x - MARKER_RADIUS,
      right: other.x + MARKER_RADIUS,
      top: other.y - MARKER_RADIUS,
      bottom: other.y + MARKER_RADIUS,
    };
    return overlaps(box, marker);
  });
}

/**
 * Keeps map labels legible when markers cluster: each label takes the first free slot, trying the
 * right of its marker, then the left, then progressively further above and below.
 */
export function placeMapLabels(points: ReadonlyArray<MapLabelPoint>): Map<string, MapLabelPlacement> {
  const ordered = [...points].toSorted((left, right) => {
    if (left.y !== right.y) return left.y - right.y;
    if (left.x !== right.x) return left.x - right.x;
    return left.identifier.localeCompare(right.identifier);
  });
  const taken: Box[] = [];
  const placements = new Map<string, MapLabelPlacement>();

  for (const point of ordered) {
    let chosen: { anchor: MapLabelAnchor; offsetY: number; box: Box } | null = null;
    for (const offsetY of LABEL_STEPS) {
      for (const anchor of LABEL_ANCHORS) {
        const box = labelBox(point, anchor, offsetY);
        if (taken.some((other) => overlaps(box, other))) continue;
        if (coversMarker(box, point, points)) continue;
        chosen = { anchor, offsetY, box };
        break;
      }
      if (chosen) break;
    }
    const placement = chosen ?? { anchor: "start" as const, offsetY: 0, box: labelBox(point, "start", 0) };
    taken.push(placement.box);
    placements.set(point.identifier, {
      anchor: placement.anchor,
      x: placement.anchor === "start" ? LABEL_GAP : -LABEL_GAP,
      y: placement.offsetY,
    });
  }

  return placements;
}

export type MapClusterPoint = { identifier: string; x: number; y: number };
export type MapOffset = { x: number; y: number };

/** Two markers closer than this on screen are unreadable, so the ring pulls them apart. */
export const CLUSTER_MIN_DISTANCE = 30;
const CLUSTER_BASE_RADIUS = 26;
const CLUSTER_MARKER_SPAN = 27;
const NO_OFFSET: MapOffset = { x: 0, y: 0 };

/**
 * Four of the six customers sit within a hundred kilometres of each other, so at world zoom they
 * land on the same pixel and only one of them is readable. Each group of markers that collapses
 * is opened onto a ring around the place they share: the geography is still where the ring is
 * centred, and a leader line ties every marker back to it.
 *
 * Coordinates and offsets are both in screen units, which is what the counter-scaled marker layer
 * draws in. A marker with nothing near it is left exactly where it belongs.
 */
export function spreadClusteredMarkers(
  points: ReadonlyArray<MapClusterPoint>,
  minimumDistance = CLUSTER_MIN_DISTANCE,
): Map<string, MapOffset> {
  const ordered = [...points].toSorted((left, right) =>
    left.identifier.localeCompare(right.identifier),
  );
  const groups = groupByProximity(ordered, minimumDistance);
  const offsets = new Map<string, MapOffset>();

  for (const group of groups) {
    if (group.length < 2) {
      offsets.set(group[0].identifier, NO_OFFSET);
      continue;
    }
    const centreX = group.reduce((total, point) => total + point.x, 0) / group.length;
    const centreY = group.reduce((total, point) => total + point.y, 0) / group.length;
    // The ring grows with the crowd so the markers on it never touch each other either.
    const radius = Math.max(
      CLUSTER_BASE_RADIUS,
      (group.length * CLUSTER_MARKER_SPAN) / (2 * Math.PI),
    );
    group.forEach((point, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
      offsets.set(point.identifier, {
        x: centreX + radius * Math.cos(angle) - point.x,
        y: centreY + radius * Math.sin(angle) - point.y,
      });
    });
  }

  return offsets;
}

/** Single linkage: a marker joins a group when it is too close to any member of it. */
function groupByProximity(
  points: ReadonlyArray<MapClusterPoint>,
  minimumDistance: number,
): MapClusterPoint[][] {
  const groups: MapClusterPoint[][] = [];
  for (const point of points) {
    const near = groups.filter((group) =>
      group.some((member) => distance(member, point) < minimumDistance),
    );
    if (!near.length) {
      groups.push([point]);
      continue;
    }
    const merged = [...near.flat(), point];
    for (const group of near) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups;
}

function distance(left: MapClusterPoint, right: MapClusterPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function mapViewForTools(impacted: boolean, toolNames: readonly string[], settled = false): MapView {
  if (!impacted || settled) return "world";
  if (toolNames.includes("get_recovery_capacity")) return "nearby";
  return "impact";
}

export function cameraTransitionForView(view: MapView, previous: MapView | null): CameraTransition {
  if (previous && previous !== "world" && view === "world") return { duration: 1.3, ease: CAMERA_EASE };
  if (view === "nearby") return { duration: 1.05, ease: CAMERA_EASE };
  return { duration: 0.9, ease: CAMERA_EASE };
}

export function cameraNeedsSnap(from: Camera, to: Camera): boolean {
  return Math.abs(from.x - to.x) < CAMERA_SNAP.x
    && Math.abs(from.y - to.y) < CAMERA_SNAP.y
    && Math.abs(from.k - to.k) < CAMERA_SNAP.k;
}

export function failoverArcVisible(toolNames: readonly string[]): boolean {
  return toolNames.some((name) => FAILOVER_TOOLS.has(name));
}

export function toolNamesOf(toolCalls: readonly ToolCall[]): string[] {
  return toolCalls.map((tool) => tool.name);
}

export function failoverTarget(overview: Overview) {
  return topologyView(overview).find((node) => node.region === overview.incident.backupRegion) ?? null;
}

export type MapPlace = { latitude: number; longitude: number };

/**
 * While the incident is open every affected company has to be on screen, wherever it is: a
 * customer half a world away from the outage is still part of what the operator is looking at.
 * The frame therefore fits the sites and the customers together, and leaves the top clear for the
 * cards that float over the map.
 */
export function cameraForView(
  view: MapView,
  projection: GeoProjection,
  width: number,
  height: number,
  nodes: readonly MapPoint[],
  customers: readonly MapPlace[] = [],
): Camera {
  if (view === "world" || width < 10 || height < 10) return WORLD_CAMERA;
  const primary = nodes.find((node) => node.role === "primary");
  const sites = nodes.filter((node) => node.role === "primary" || node.role === "backup");
  if (!sites.length) return WORLD_CAMERA;
  const anchors: MapPlace[] =
    view === "impact" && primary && !customers.length ? [primary] : sites;
  const places = [...anchors, ...customers];
  const crowded = customers.length > 0;
  return fitPoints(
    places.map((place) => projectPoint(projection, place.longitude, place.latitude)),
    width,
    height,
    crowded ? CROWD_PADDING : view === "nearby" ? NEARBY_PADDING : IMPACT_PADDING,
    crowded ? CROWD_TOP_PADDING : undefined,
  );
}

function fitPoints(
  points: ReadonlyArray<[number, number]>,
  width: number,
  height: number,
  padding: number,
  topPadding = padding,
): Camera {
  const innerWidth = width - 2 * padding;
  const innerHeight = height - padding - topPadding;
  if (innerWidth <= 0 || innerHeight <= 0) return WORLD_CAMERA;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boxWidth = Math.max(maxX - minX, MIN_PROJECTED_SPAN);
  const boxHeight = Math.max(maxY - minY, MIN_PROJECTED_SPAN);
  const raw = Math.min(innerWidth / boxWidth, innerHeight / boxHeight);
  if (!Number.isFinite(raw) || raw <= 0) return WORLD_CAMERA;
  const k = clamp(raw, MIN_CAMERA_K, MAX_CAMERA_K);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // The usable band sits below the floating cards, so the centre of the frame is not the centre
  // of the panel.
  const centreY = topPadding + (height - padding - topPadding) / 2;
  return { x: width / 2 - k * cx, y: centreY - k * cy, k };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function arcPath(from: [number, number], to: [number, number], minRise = MIN_ARC_RISE): string {
  const rise = Math.max(Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.35, minRise);
  const mx = (from[0] + to[0]) / 2;
  const my = Math.min(from[1], to[1]) - rise;
  return `M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`;
}

export function linkFill(action: CustomerAction, progress: number): number {
  if (action === "online" || action === "recovered") return 1;
  if (action === "migrating") return Math.max(progress / 100, 0.88);
  return clamp(progress / 100, 0, 1);
}

export function linkFillDuration(action: CustomerAction): number {
  return action === "migrating" ? 5.5 : 0.85;
}
