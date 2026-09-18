"use client";

import { useMemo, useSyncExternalStore } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import spain from "@/data/spain.json";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { STATUS_HEX } from "@/lib/status";
import { siteKey } from "@/lib/i18n";
import type { HealthStatus, Site } from "@/lib/dashboard-types";

const WIDTH = 860;
const HEIGHT = 620;

type CoordPoly = number[][][][];

function isCanariasRing(ring: number[][]) {
  const [lon, lat] = ring[0];
  return lon < -12 && lat < 32.5;
}

function splitSpain(collection: FeatureCollection) {
  const feature = collection.features[0] as Feature<MultiPolygon | Polygon>;
  const polygons: CoordPoly =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

  const mainland: CoordPoly = [];
  const canarias: CoordPoly = [];

  for (const polygon of polygons) {
    if (isCanariasRing(polygon[0])) canarias.push(polygon);
    else mainland.push(polygon);
  }

  return {
    mainland: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: mainland },
    } as Feature<MultiPolygon>,
    canarias: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: canarias },
    } as Feature<MultiPolygon>,
  };
}

function arcPath(from: [number, number], to: [number, number]) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const distance = Math.hypot(dx, dy) || 1;
  const bow = Math.min(70, distance * 0.22);
  const cx = mx - (dy / distance) * bow;
  const cy = my + (dx / distance) * bow;
  return `M ${from[0]} ${from[1]} Q ${cx} ${cy} ${to[0]} ${to[1]}`;
}

function Meteorite({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse
        cx="0"
        cy="0"
        rx="54"
        ry="38"
        fill="url(#impact-glow)"
        opacity="0.95"
      />
      <circle className="pulse-ring" r="22" fill="#f04444" opacity="0.35" />
      <circle className="pulse-ring" r="22" fill="#f04444" style={{ animationDelay: "0.8s" }} />
      <path
        d="M-9 -7 C-2 -14 9 -12 11 -4 C14 2 8 11 1 12 C-8 13 -14 4 -9 -7Z"
        fill="#5b6573"
        stroke="#d7dde6"
        strokeWidth="0.8"
      />
      <path d="M-3 -2 C0 -6 6 -4 5 1 C3 4 -1 3 -3 -2Z" fill="#8b949e" />
    </g>
  );
}

function SiteMarker({
  site,
  point,
  showLabel,
}: {
  site: Site;
  point: [number, number];
  showLabel: boolean;
}) {
  const { t } = useI18n();
  const color = STATUS_HEX[site.status];
  const name = t(siteKey(site.id));
  const mapStatus =
    site.status === "down"
      ? t("status.map.down")
      : site.status === "degraded"
        ? t("status.map.degraded")
        : t("status.map.up");
  const infraStatus =
    site.status === "down"
      ? t("status.infra.down")
      : site.status === "degraded"
        ? t("status.infra.degraded")
        : t("status.infra.up");
  const labelSide =
    site.id === "barcelona" ||
    site.id === "valencia" ||
    site.id === "zaragoza" ||
    site.id === "malaga"
      ? "right"
      : "left";

  return (
    <g transform={`translate(${point[0]} ${point[1]})`}>
      <title>{`${name}: ${mapStatus}`}</title>
      {site.status !== "up" ? (
        <circle r="10" fill={color} opacity="0.18" />
      ) : null}
      <circle r="7" fill="var(--map-node-fill)" stroke={color} strokeWidth="2.2" />
      <circle r="3.2" fill={color} />
      {site.id === "madrid" ? (
        <g transform="translate(16, -28)">
          <rect
            x="0"
            y="0"
            width="168"
            height="46"
            rx="8"
            fill="var(--map-callout)"
            stroke="var(--border)"
          />
          <text x="10" y="16" fill="var(--foreground)" fontSize="11" fontWeight="600">
            {name}
          </text>
          <text x="10" y="28" fill="var(--muted-foreground)" fontSize="9">
            {t("map.primaryDc")}
          </text>
          <text x="10" y="40" fill={color} fontSize="9">
            {infraStatus}
          </text>
        </g>
      ) : showLabel ? (
        <text
          x={labelSide === "right" ? 12 : -12}
          y="4"
          textAnchor={labelSide === "right" ? "start" : "end"}
          fill="var(--foreground)"
          fontSize="11"
        >
          {name}
        </text>
      ) : null}
    </g>
  );
}

export function SpainMap() {
  const { snapshot } = useDashboard();
  const { t } = useI18n();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { mainland, canarias } = useMemo(
    () => splitSpain(spain as FeatureCollection),
    [],
  );

  const mainlandProjection = useMemo(
    () =>
      geoMercator().fitExtent(
        [
          [56, 36],
          [804, 538],
        ],
        mainland,
      ),
    [mainland],
  );

  const canariasProjection = useMemo(
    () =>
      geoMercator().fitExtent(
        [
          [548, 478],
          [778, 588],
        ],
        canarias,
      ),
    [canarias],
  );

  const mainlandPath = useMemo(
    () => geoPath(mainlandProjection)(mainland as GeoPermissibleObjects) ?? "",
    [mainland, mainlandProjection],
  );
  const canariasPath = useMemo(
    () => geoPath(canariasProjection)(canarias as GeoPermissibleObjects) ?? "",
    [canarias, canariasProjection],
  );

  const sitesById = useMemo(
    () => Object.fromEntries(snapshot.sites.map((site) => [site.id, site])),
    [snapshot.sites],
  );

  const projectSite = (site: Site) => {
    const projection =
      site.inset === "canarias" ? canariasProjection : mainlandProjection;
    return projection([site.lng, site.lat]) as [number, number];
  };

  const madrid = sitesById.madrid;
  const madridPoint = madrid ? projectSite(madrid) : ([0, 0] as [number, number]);

  if (!mounted) {
    return (
      <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card" />
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label={t("map.aria")}
      >
        <defs>
          <radialGradient id="map-glow" cx="48%" cy="42%" r="52%">
            <stop offset="0%" stopColor="var(--map-glow)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--map-bg)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="impact-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff7a3a" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#f04444" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f04444" stopOpacity="0" />
          </radialGradient>
          <filter id="land-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {snapshot.links.map((link) => {
            const from = sitesById[link.from];
            const to = sitesById[link.to];
            if (!from || !to || from.inset || to.inset) return null;
            const fromPoint = projectSite(from);
            const toPoint = projectSite(to);
            const fromColor = STATUS_HEX[link.status ?? from.status];
            const toColor = STATUS_HEX[link.status ?? to.status];
            return (
              <linearGradient
                key={link.id}
                id={`arc-${link.id}`}
                gradientUnits="userSpaceOnUse"
                x1={fromPoint[0]}
                y1={fromPoint[1]}
                x2={toPoint[0]}
                y2={toPoint[1]}
              >
                <stop offset="0%" stopColor={fromColor} />
                <stop offset="100%" stopColor={toColor} />
              </linearGradient>
            );
          })}
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="var(--map-bg)" />
        <rect width={WIDTH} height={HEIGHT} fill="url(#map-glow)" />
        <path
          d={mainlandPath}
          fill="var(--map-land)"
          stroke="var(--map-stroke)"
          strokeWidth="1.1"
          filter="url(#land-glow)"
        />
        <rect
          x="536"
          y="466"
          width="254"
          height="132"
          rx="8"
          fill="var(--map-inset)"
          stroke="var(--map-stroke)"
        />
        <path d={canariasPath} fill="var(--map-land)" stroke="var(--map-stroke)" strokeWidth="1" />
        <text
          x="662"
          y="590"
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          {t("map.canaries")}
        </text>

        {snapshot.links.map((link) => {
          const from = sitesById[link.from];
          const to = sitesById[link.to];
          if (!from || !to || to.inset || from.inset) return null;
          const fromPoint = projectSite(from);
          const toPoint = projectSite(to);
          return (
            <path
              key={link.id}
              d={arcPath(fromPoint, toPoint)}
              fill="none"
              stroke={`url(#arc-${link.id})`}
              strokeWidth="2.1"
              strokeLinecap="round"
              opacity="0.92"
            />
          );
        })}

        {madrid && madrid.status === "down" ? (
          <Meteorite x={madridPoint[0]} y={madridPoint[1] - 6} />
        ) : null}

        {snapshot.sites.map((site) => (
          <SiteMarker
            key={site.id}
            site={site}
            point={projectSite(site)}
            showLabel={site.id !== "canarias"}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute bottom-4 left-5 flex items-center gap-4 text-[11px] text-muted-foreground">
        <LegendDot status="up" />
        <LegendDot status="degraded" />
        <LegendDot status="down" />
      </div>
    </div>
  );
}

function LegendDot({ status }: { status: HealthStatus }) {
  const { t } = useI18n();
  const label =
    status === "down"
      ? t("status.map.down")
      : status === "degraded"
        ? t("status.map.degraded")
        : t("status.map.up");
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: STATUS_HEX[status] }}
      />
      {label}
    </span>
  );
}
