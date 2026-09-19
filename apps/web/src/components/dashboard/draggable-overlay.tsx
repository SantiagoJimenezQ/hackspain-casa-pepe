"use client";

import { useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type DraggableOverlayProperties = {
  children: ReactNode;
  /** Where the card parks before anyone moves it, plus its stacking order. */
  className: string;
};

/**
 * Floating card that sits over a panel and can be dragged anywhere inside it. The bounds element
 * stays transparent to the pointer so the panel underneath keeps receiving clicks.
 */
export function DraggableOverlay({ children, className }: DraggableOverlayProperties) {
  const bounds = useRef<HTMLDivElement>(null);
  return (
    <div ref={bounds} className="pointer-events-none absolute inset-0">
      <motion.div
        drag
        dragConstraints={bounds}
        dragElastic={0}
        dragMomentum={false}
        whileDrag={{ scale: 1.02 }}
        className={cn(
          "pointer-events-auto absolute cursor-grab touch-none select-none active:cursor-grabbing",
          className,
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
