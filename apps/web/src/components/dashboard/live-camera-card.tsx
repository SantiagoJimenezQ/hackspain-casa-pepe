"use client";

import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

export function LiveCameraCard() {
  const { snapshot } = useDashboard();

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[13px] font-medium text-white">
          {snapshot.camera.title}
        </h2>
        <span className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
          {snapshot.camera.timestamp}
        </span>
      </div>
      <div className="relative mx-3 mb-3 aspect-[16/9] overflow-hidden rounded-lg bg-black">
        <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1a2433" />
              <stop offset="100%" stopColor="#0b1018" />
            </linearGradient>
            <radialGradient id="fire" cx="58%" cy="58%" r="35%">
              <stop offset="0%" stopColor="#ffe29a" />
              <stop offset="35%" stopColor="#ff6a2a" />
              <stop offset="100%" stopColor="#5b1a10" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="640" height="360" fill="url(#sky)" />
          <rect x="0" y="250" width="640" height="110" fill="#121820" />
          <g fill="#2b3440">
            <rect x="70" y="170" width="90" height="110" />
            <rect x="180" y="130" width="70" height="150" />
            <rect x="270" y="150" width="120" height="130" />
            <rect x="420" y="110" width="95" height="170" />
            <rect x="530" y="175" width="70" height="105" />
          </g>
          <circle cx="390" cy="210" r="90" fill="url(#fire)" />
          <path
            d="M120 250 C160 180 210 160 250 210"
            fill="none"
            stroke="#8b97ab"
            strokeWidth="18"
            opacity="0.18"
          />
          <path
            d="M300 230 C340 120 390 90 430 150"
            fill="none"
            stroke="#d7dde8"
            strokeWidth="22"
            opacity="0.12"
          />
          <circle cx="392" cy="198" r="18" fill="#fff3c4" opacity="0.7" />
        </svg>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:100%_6px] opacity-30" />
      </div>
    </Panel>
  );
}
