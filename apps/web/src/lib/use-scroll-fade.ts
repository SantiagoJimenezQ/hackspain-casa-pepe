"use client";

import { useCallback, useEffect, useRef } from "react";

const EDGE_PX = 1;

function updateScrollFade(el: HTMLElement, axis: "x" | "y") {
  if (axis === "y") {
    const canStart = el.scrollTop > EDGE_PX;
    const canEnd = el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_PX;
    el.toggleAttribute("data-fade-start", canStart);
    el.toggleAttribute("data-fade-end", canEnd);
    return;
  }
  const canStart = el.scrollLeft > EDGE_PX;
  const canEnd = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_PX;
  el.toggleAttribute("data-fade-start", canStart);
  el.toggleAttribute("data-fade-end", canEnd);
}

function observeScrollFade(el: HTMLElement, axis: "x" | "y") {
  const update = () => updateScrollFade(el, axis);

  update();
  const frame = requestAnimationFrame(update);
  el.addEventListener("scroll", update, { passive: true });

  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(el);
  const observeChildren = () => {
    for (const child of el.children) {
      if (child instanceof HTMLElement) resizeObserver.observe(child);
    }
  };
  observeChildren();

  const mutationObserver = new MutationObserver(() => {
    observeChildren();
    update();
  });
  mutationObserver.observe(el, { childList: true, subtree: true });

  return () => {
    cancelAnimationFrame(frame);
    el.removeEventListener("scroll", update);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    el.removeAttribute("data-fade-start");
    el.removeAttribute("data-fade-end");
  };
}

export function useScrollFade<T extends HTMLElement>(axis: "x" | "y" = "y") {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (el: T | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (el) cleanupRef.current = observeScrollFade(el, axis);
    },
    [axis],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return {
    ref,
    className: axis === "x" ? "scroll-fade-x" : "scroll-fade",
  };
}
