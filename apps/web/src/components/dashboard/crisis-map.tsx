"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Overview } from "@/lib/casa-pepe-types";
import {
  arcPath,
  cameraForView,
  failoverArcVisible,
  failoverTarget,
  fitWorldProjection,
  mapViewForTools,
  projectPoint,
  spherePath,
  toolNamesOf,
  worldPath,
} from "@/lib/crisis-map";
import { customerView, type VisualStatus } from "@/lib/live-dashboard";

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
        setSize({ height: entry.contentRect.height, width: entry.contentRect.width });
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

export function CrisisMap({ overview }: { overview: Overview }) {
  const { ref, size } = useElementSize();
  if (size.width < 10 || size.height < 10) {
    return <div ref={ref} className="absolute inset-0 overflow-hidden bg-map-bg" />;
  }
  const { width, height } = size;
  const projection = fitWorldProjection(width, height);
  const nodes = overview.incident.topology.nodes;
  const primary = nodes.find((node) => node.role === "primary");
  const impacted = primary?.status === "down" || Boolean(overview.incident.impactedAt);
  const tools = toolNamesOf(overview.toolCalls);
  const view = mapViewForTools(impacted, tools);
  const camera = cameraForView(view, projection, width, height, nodes);
  const backup = failoverTarget(overview);
  const origin = primary ? projectPoint(projection, primary.longitude, primary.latitude) : null;
  const target = backup ? projectPoint(projection, backup.longitude, backup.latitude) : null;
  const showArc = Boolean(origin && target && failoverArcVisible(tools));
  const customers = customerView(overview.incident).filter(
    (customer) => customer.latitude !== undefined && customer.longitude !== undefined,
  );
  const land = worldPath(projection);
  const sphere = spherePath(projection);
  const showLabels = camera.k > 2.4;

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-map-bg">
      <svg width={width} height={height} className="absolute inset-0" role="img" aria-label="Mapa mundial de la crisis de Dubái">
        <defs>
          <linearGradient id="failover-link" x1={origin?.[0]} y1={origin?.[1]} x2={target?.[0]} y2={target?.[1]} gradientUnits="userSpaceOnUse">
            <stop stopColor="#f04444" />
            <stop offset="1" stopColor="#f5a524" />
          </linearGradient>
        </defs>
        <motion.g
          animate={{ x: camera.x, y: camera.y, scale: camera.k }}
          initial={false}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "0px 0px" }}
        >
          <path d={sphere} fill="var(--map-inset)" />
          <path d={land} fill="var(--map-land)" stroke="var(--map-stroke)" strokeWidth={0.6} />
          {showArc && origin && target ? (
            <motion.path
              d={arcPath(origin, target)}
              fill="none"
              stroke="url(#failover-link)"
              strokeWidth={2.2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.3 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          ) : null}
          {nodes.map((node) => {
            const [x, y] = projectPoint(projection, node.longitude, node.latitude);
            const status = node.status;
            return (
              <g key={node.identifier} transform={`translate(${x} ${y})`}>
                <circle r={status === "down" ? 16 : 9} fill={COLORS[status]} opacity=".2" className={status === "down" ? "pulse-ring" : undefined} />
                <circle r="5.5" fill="var(--map-node-fill)" stroke={COLORS[status]} strokeWidth="2" />
                <circle r="2.2" fill={COLORS[status]} />
                {showLabels ? (
                  <>
                    <text x="10" y="3" fill="var(--foreground)" fontSize="11">{node.label}</text>
                    <text x="10" y="15" fill="var(--muted-foreground)" fontSize="9">{node.region}</text>
                  </>
                ) : null}
              </g>
            );
          })}
          {customers.map((customer) => {
            const [x, y] = projectPoint(projection, customer.longitude ?? 0, customer.latitude ?? 0);
            return (
              <g key={customer.identifier} transform={`translate(${x} ${y})`}>
                <image href={customer.logo} x="-10" y="-10" width="20" height="20" />
                {showLabels ? (
                  <text x="12" y="4" fill="var(--foreground)" fontSize="10">{customer.shortName}</text>
                ) : null}
              </g>
            );
          })}
        </motion.g>
      </svg>
    </div>
  );
}
