"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { DraggableOverlay } from "@/components/dashboard/draggable-overlay";
import { useI18n } from "@/components/i18n/locale-provider";
import {
  ACTIVE_CALL_AUTHORIZED_AFTER_MS,
  ACTIVE_CALL_AUTHORIZED_DISMISS_MS,
  ACTIVE_CALL_DISMISS_MS,
  activeCallView,
  callElapsed,
  callInitials,
  visibleActiveCall,
  type ActiveCallPhase,
  type ActiveCallView,
} from "@/lib/active-call";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TITLE_KEY = {
  calling: "call.calling",
  ended: "call.ended",
  failed: "call.failed",
  "no-answer": "call.noAnswer",
} as const satisfies Record<ActiveCallPhase, MessageKey>;

const BARS = [13, 18, 10, 16];

export function ActiveCallBanner() {
  const { overview, activity } = useDashboard();
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [showAuthorized, setShowAuthorized] = useState(false);

  const derived = useMemo(
    () => activeCallView(overview, activity, now),
    [overview, activity, now],
  );
  const view = visibleActiveCall(derived, dismissed);
  const callId = derived?.identifier;
  const live = derived?.live ?? false;
  const phase = derived?.phase;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const authorized = derived?.authorized ?? false;

  // The permission is what the call was for. The voice agent reports it the moment it hears
  // it, while the line is still open, so the card announces the verdict then instead of
  // waiting for the line to drop: by the time the call formally ends the news is old.
  useEffect(() => {
    if (!callId || !authorized) {
      setShowAuthorized(false);
      return;
    }
    const timer = window.setTimeout(
      () => setShowAuthorized(true),
      ACTIVE_CALL_AUTHORIZED_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [callId, authorized]);

  // A call still ringing with nothing decided stays up; the permission, or the line dropping,
  // is what starts the countdown to dismissal.
  useEffect(() => {
    if (!callId || (live && !authorized)) return;
    const timer = window.setTimeout(
      () => {
        setDismissed((current) => {
          if (current.has(callId)) return current;
          const next = new Set(current);
          next.add(callId);
          return next;
        });
      },
      authorized ? ACTIVE_CALL_AUTHORIZED_DISMISS_MS : ACTIVE_CALL_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [callId, live, phase, authorized]);

  const granted = Boolean(view) && showAuthorized;
  const title = view
    ? granted
      ? t("call.authorized")
      : view.phase === "calling"
        ? t(TITLE_KEY.calling, { name: view.name })
        : t(TITLE_KEY[view.phase])
    : "";
  const subtitle = view ? (view.phase === "calling" ? view.role : view.name) : "";
  const elapsed = view ? callElapsed(view, now) : "00:00";

  return (
    <DraggableOverlay className="right-2 top-2 z-30">
      <AnimatePresence>
        {view ? (
          // One card at a time, so the key never changes: the card stays exactly where it was
          // dragged and never replays its entrance when the call moves from ringing to ended.
          <CallCard
            key="active-call"
            view={view}
            title={title}
            subtitle={subtitle}
            elapsed={elapsed}
            granted={granted}
          />
        ) : null}
      </AnimatePresence>
    </DraggableOverlay>
  );
}

function CallCard({
  view,
  title,
  subtitle,
  elapsed,
  granted,
}: {
  view: ActiveCallView;
  title: string;
  subtitle: string;
  elapsed: string;
  granted: boolean;
}) {
  const live = view.live;
  return (
    <motion.aside
      role="status"
      aria-live="polite"
      aria-label={`${title}. ${elapsed}`}
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="flex w-[min(340px,calc(100vw-2rem))] items-center gap-3 rounded-3xl bg-card/90 px-3 py-2.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45),inset_0_1px_0_color-mix(in_srgb,var(--foreground)_10%,transparent)] ring-1 ring-foreground/10 backdrop-blur-xl"
    >
      <span className="relative size-11 shrink-0">
        {live || granted ? (
          <span className="absolute -inset-0.5 rounded-full bg-status-up/35 blur-[6px]" aria-hidden />
        ) : null}
        <span
          className={cn(
            "relative flex size-11 items-center justify-center rounded-full text-[13px] font-semibold tracking-[0.08em]",
            live || granted
              ? "bg-status-up/15 text-foreground ring-1 ring-status-up/40"
              : "bg-muted text-foreground ring-1 ring-foreground/10",
          )}
        >
          {granted ? <CheckMark /> : callInitials(view.name)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[14px] font-semibold leading-5 tracking-tight",
            granted ? "text-status-up" : "text-foreground",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 pr-0.5">
        {granted ? null : <Equalizer live={live} />}
        <span
          className={cn(
            "font-mono text-[13px] leading-none tabular-nums tracking-tight",
            live ? "text-status-up" : "text-muted-foreground",
          )}
        >
          {elapsed}
        </span>
      </span>
    </motion.aside>
  );
}

function Equalizer({ live }: { live: boolean }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {BARS.map((height, index) => (
        <motion.span
          key={index}
          className="w-[3px] origin-bottom rounded-full bg-status-up"
          style={{ height }}
          animate={live ? { scaleY: [0.35, 1, 0.5, 0.92, 0.35] } : { scaleY: 0.35 }}
          transition={
            live
              ? {
                  duration: 0.85,
                  repeat: Infinity,
                  delay: index * 0.12,
                  ease: "easeInOut",
                }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}


function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-status-up" aria-hidden>
      <motion.path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    </svg>
  );
}
