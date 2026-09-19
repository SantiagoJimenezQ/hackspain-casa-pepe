"use client";

import { Component, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent } from "motion/react";
import type { Overview } from "@/lib/casa-pepe-types";
import {
  type Camera,
  type MapView,
  agentSettled,
  arcPath,
  cameraForView,
  cameraNeedsSnap,
  cameraSvgTransform,
  cameraTransitionForView,
  failoverArcVisible,
  failoverTarget,
  fitWorldProjection,
  linkFill,
  linkFillDuration,
  mapViewForTools,
  projectPoint,
  spherePath,
  toolNamesOf,
  worldPath,
} from "@/lib/crisis-map";
import { customerView, topologyView, type CustomerAction, type VisualStatus } from "@/lib/live-dashboard";

const COLORS: Record<VisualStatus, string> = { up: "#3ee08f", degraded: "#f5a524", down: "#f04444" };

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const frame = { current: 0 };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        setSize((previous) => previous.width === width && previous.height === height ? previous : { height, width });
      });
    });
    observer.observe(element);
    setSize({ height: element.clientHeight, width: element.clientWidth });
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
    };
  }, []);
  return { ref, size };
}

function useCameraTransform(camera: Camera, view: MapView) {
  const groupRef = useRef<SVGGElement>(null);
  const x = useMotionValue(camera.x);
  const y = useMotionValue(camera.y);
  const k = useMotionValue(camera.k);
  const primed = useRef(false);
  const previousView = useRef<MapView | null>(null);
  const [markerScale, setMarkerScale] = useState(() => (camera.k > 0 ? 1 / camera.k : 1));
  useMotionValueEvent(k, "change", (value) => {
    setMarkerScale(value > 0 ? 1 / value : 1);
  });
  useLayoutEffect(() => {
    const apply = () => {
      groupRef.current?.setAttribute("transform", cameraSvgTransform({ x: x.get(), y: y.get(), k: k.get() }));
    };
    const unsubs = [x, y, k].map((value) => value.on("change", apply));
    apply();
    const next = { x: camera.x, y: camera.y, k: camera.k };
    const current = { x: x.get(), y: y.get(), k: k.get() };
    if (!primed.current || cameraNeedsSnap(current, next)) {
      x.set(next.x);
      y.set(next.y);
      k.set(next.k);
      primed.current = true;
      previousView.current = view;
      apply();
      return () => {
        for (const unsub of unsubs) unsub();
      };
    }
    const transition = cameraTransitionForView(view, previousView.current);
    previousView.current = view;
    const animations = [
      animate(x, next.x, transition),
      animate(y, next.y, transition),
      animate(k, next.k, transition),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
      for (const animation of animations) animation.stop();
    };
  }, [camera.k, camera.x, camera.y, k, view, x, y]);
  return { groupRef, markerScale };
}

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="absolute inset-0 overflow-hidden bg-map-bg" role="img" aria-label="Mapa no disponible" />
      );
    }
    return this.props.children;
  }
}

function MarkerLayer({ scale, children }: { scale: number; children: ReactNode }) {
  return <g transform={`scale(${scale})`}>{children}</g>;
}

function NetworkLink({
  path,
  action,
  progress,
}: {
  path: string;
  action: CustomerAction;
  progress: number;
}) {
  const fill = linkFill(action, progress);
  const restored = action === "online" || action === "recovered";
  const base = restored ? COLORS.up : COLORS.down;
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={base}
        strokeWidth={5.5}
        strokeLinecap="round"
        opacity={restored ? 0.14 : 0.2}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke={base}
        strokeWidth={1.4}
        strokeLinecap="round"
        className={restored ? undefined : "network-offline"}
        vectorEffect="non-scaling-stroke"
      />
      {!restored && fill > 0.01 ? (
        <motion.path
          d={path}
          fill="none"
          stroke={COLORS.up}
          strokeWidth={2.2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: fill }}
          transition={{ duration: linkFillDuration(action), ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}
      {restored ? (
        <path
          d={path}
          fill="none"
          stroke={COLORS.up}
          strokeWidth={1.55}
          strokeLinecap="round"
          className="network-packet"
          opacity={0.9}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  );
}

function CrisisMapCanvas({ overview }: { overview: Overview }) {
  const { ref, size } = useElementSize();
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-map-bg">
      {size.width >= 10 && size.height >= 10 ? <CrisisMapScene overview={overview} size={size} /> : null}
    </div>
  );
}

function CrisisMapScene({
  overview,
  size,
}: {
  overview: Overview;
  size: { width: number; height: number };
}) {
  const { width, height } = size;
  const { projection, land, sphere } = useMemo(() => {
    const next = fitWorldProjection(width, height);
    return { projection: next, land: worldPath(next), sphere: spherePath(next) };
  }, [height, width]);
  const nodes = topologyView(overview);
  const primary = nodes.find((node) => node.role === "primary");
  const impacted = primary?.status === "down" || Boolean(overview.incident.impactedAt);
  const settled = agentSettled(overview);
  const tools = toolNamesOf(overview.toolCalls);
  const view = mapViewForTools(impacted, tools, settled);
  const camera = cameraForView(view, projection, width, height, nodes);
  const { groupRef, markerScale } = useCameraTransform(camera, view);
  const backup = failoverTarget(overview);
  const origin = primary ? projectPoint(projection, primary.longitude, primary.latitude) : null;
  const target = backup ? projectPoint(projection, backup.longitude, backup.latitude) : null;
  const theater = view !== "world";
  const showArc = Boolean(origin && target && theater && failoverArcVisible(tools));
  const customers = customerView(overview.incident).filter(
    (customer) => customer.latitude !== undefined && customer.longitude !== undefined,
  );
  const crisis = impacted && !settled;

  return (
    <svg width={width} height={height} className="absolute inset-0" role="img" aria-label="Mapa mundial de la crisis de Dubái">
      <g ref={groupRef}>
          <path d={sphere} fill="var(--map-inset)" />
          <path d={land} fill="var(--map-land)" stroke="var(--map-stroke)" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
          {origin ? customers.map((customer) => {
            const point = projectPoint(projection, customer.longitude ?? 0, customer.latitude ?? 0);
            return (
              <NetworkLink
                key={customer.identifier}
                path={arcPath(origin, point)}
                action={customer.action}
                progress={customer.progress}
              />
            );
          }) : null}
          {showArc && origin && target ? (
            <motion.path
              d={arcPath(origin, target)}
              fill="none"
              stroke={settled ? COLORS.up : COLORS.down}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeDasharray="5 7"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0.25 }}
              animate={{ pathLength: 1, opacity: 0.85 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          ) : null}
          {nodes.map((node) => {
            const [x, y] = projectPoint(projection, node.longitude, node.latitude);
            const status = node.status;
            const isPrimary = node.role === "primary";
            return (
              <g key={node.identifier} transform={`translate(${x} ${y})`}>
                <MarkerLayer scale={markerScale}>
                  {isPrimary && crisis ? (
                    <motion.circle
                      key={overview.incident.impactedAt || "impact"}
                      r="18"
                      fill="none"
                      stroke={COLORS.down}
                      strokeWidth="2"
                      initial={{ scale: 0.35, opacity: 0.85 }}
                      animate={{ scale: 5.8, opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      style={{ transformOrigin: "center", transformBox: "fill-box" }}
                    />
                  ) : null}
                  {isPrimary && !crisis ? (
                    <>
                      <circle r="26" fill="none" stroke={COLORS.up} opacity=".1" />
                      <circle r="18" fill="none" stroke={COLORS.up} opacity=".16" />
                    </>
                  ) : null}
                  <circle
                    r={status === "down" ? 16 : 9}
                    fill={COLORS[status]}
                    opacity=".22"
                    className={status === "down" ? "pulse-ring" : undefined}
                  />
                  <circle r="6" fill="var(--map-node-fill)" stroke={COLORS[status]} strokeWidth="2.2" />
                  <circle r="2.4" fill={COLORS[status]} />
                  {theater ? (
                    <>
                      <text x="12" y="3" fill="var(--foreground)" fontSize="11" fontWeight="600">{node.label}</text>
                      <text x="12" y="16" fill="var(--muted-foreground)" fontSize="9">{node.region}</text>
                    </>
                  ) : null}
                  {isPrimary && crisis ? (
                    <g transform="translate(12 -28)">
                      <rect width="118" height="22" rx="4" fill="var(--map-callout)" stroke="color-mix(in srgb, #f04444 45%, var(--border))" />
                      <text x="8" y="14" fill="#f04444" fontSize="8" fontWeight="700" letterSpacing="0.16em">IMPACTO</text>
                    </g>
                  ) : null}
                </MarkerLayer>
              </g>
            );
          })}
          {customers.map((customer) => {
            const [x, y] = projectPoint(projection, customer.longitude ?? 0, customer.latitude ?? 0);
            const pulsing = customer.action === "offline" || customer.action === "migrating";
            return (
              <g key={customer.identifier} transform={`translate(${x} ${y})`}>
                <MarkerLayer scale={markerScale}>
                  <circle
                    r="14"
                    fill={COLORS[customer.status]}
                    opacity=".2"
                    className={pulsing ? "pulse-ring" : undefined}
                  />
                  <circle r="11" fill="var(--map-node-fill)" stroke={COLORS[customer.status]} strokeWidth="1.6" />
                  <circle r="9" fill="var(--logo-plate)" />
                  <image href={customer.logo} x="-7" y="-7" width="14" height="14" />
                  {theater ? (
                    <text x="14" y="4" fill="var(--foreground)" fontSize="10">{customer.shortName}</text>
                  ) : null}
                </MarkerLayer>
              </g>
            );
          })}
      </g>
    </svg>
  );
}

export function CrisisMap({ overview }: { overview: Overview }) {
  return (
    <MapErrorBoundary>
      <CrisisMapCanvas overview={overview} />
    </MapErrorBoundary>
  );
}
