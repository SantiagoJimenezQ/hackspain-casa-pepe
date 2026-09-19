import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries from "@/data/countries-110m.json";
import type { Overview, ToolCall } from "@/lib/casa-pepe-types";
import { topologyView } from "@/lib/live-dashboard";

export const MAP_PADDING = 24;

const topology = countries as unknown as Topology<{ countries: GeometryCollection }>;
export const worldLand = feature(topology, topology.objects.countries);

export type MapView = "world" | "impact" | "nearby";
export type Camera = { x: number; y: number; k: number };
export type MapPoint = { latitude: number; longitude: number; role: "primary" | "backup" };

const FAILOVER_TOOLS = new Set(["execute_recovery", "contact_engineer", "call_engineer"]);

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

export function worldPath(projection: GeoProjection) {
  return geoPath(projection)(worldLand) ?? "";
}

export function spherePath(projection: GeoProjection) {
  return geoPath(projection)({ type: "Sphere" } as GeoPermissibleObjects) ?? "";
}

export function mapViewForTools(impacted: boolean, toolNames: readonly string[]): MapView {
  if (!impacted) return "world";
  if (toolNames.includes("get_recovery_capacity")) return "nearby";
  return "impact";
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
  if (view === "world" || width < 10 || height < 10) return { x: 0, y: 0, k: 1 };
  const primary = nodes.find((node) => node.role === "primary");
  const gulf = nodes.filter((node) => node.role === "backup" || node.role === "primary");
  const targets = view === "impact" && primary ? [primary] : gulf;
  const points = targets.map((node) => projectPoint(projection, node.longitude, node.latitude));
  if (!points.length) return { x: 0, y: 0, k: 1 };
  return fitPoints(points, width, height, view === "impact" ? 80 : 52);
}

function fitPoints(points: ReadonlyArray<[number, number]>, width: number, height: number, padding: number): Camera {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boxWidth = Math.max(maxX - minX, 14);
  const boxHeight = Math.max(maxY - minY, 14);
  const k = Math.min((width - 2 * padding) / boxWidth, (height - 2 * padding) / boxHeight);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: width / 2 - k * cx, y: height / 2 - k * cy, k };
}

export function arcPath(from: [number, number], to: [number, number]): string {
  const rise = Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.35;
  const mx = (from[0] + to[0]) / 2;
  const my = Math.min(from[1], to[1]) - rise;
  return `M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`;
}
