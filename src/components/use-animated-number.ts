"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION = 640;

/**
 * Ease a displayed number from its previous value to the new one. The first
 * render uses the target directly, so only later changes animate.
 */
export function useAnimatedNumber(target: number, duration = DEFAULT_DURATION) {
  const [animated, setAnimated] = useState(target);
  const current = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        current.current = target;
        setAnimated(target);
      });
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
      };
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + (target - from) * eased;
      current.current = next;
      setAnimated(next);
      frame.current = elapsed < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [target, duration]);

  return animated;
}
