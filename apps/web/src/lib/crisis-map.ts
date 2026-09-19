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

export function cameraForView(
  view: MapView,
  projection: GeoProjection,
  width: number,
  height: number,
  nodes: readonly MapPoint[],
): Camera {
  if (view === "world" || width < 10 || height < 10) return WORLD_CAMERA;
  const primary = nodes.find((node) => node.role === "primary");
  const sites = nodes.filter((node) => node.role === "primary" || node.role === "backup");
  if (!sites.length) return WORLD_CAMERA;
  const targets = view === "impact" && primary ? [primary] : sites;
  return fitPoints(
    targets.map((node) => projectPoint(projection, node.longitude, node.latitude)),
    width,
    height,
    view === "nearby" ? NEARBY_PADDING : IMPACT_PADDING,
  );
}

function fitPoints(points: ReadonlyArray<[number, number]>, width: number, height: number, padding: number): Camera {
  const innerWidth = width - 2 * padding;
  const innerHeight = height - 2 * padding;
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
  return { x: width / 2 - k * cx, y: height / 2 - k * cy, k };
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
